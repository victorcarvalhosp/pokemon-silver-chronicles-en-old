# Runs the game's real PC storage, item storage, Poké Mart and Kurt code
# headless on fixed scenarios and writes
# web/src/ui/storage/storageMartReference.json, which
# web/src/ui/storage/storageMart.test.ts replays against the TypeScript port.
#
#   cd web && ruby tools/ruby-ref/storage_mart_reference.rb
#
# What runs is the game's own Ruby:
# - 014_Pokemon/001_Pokemon-related/004_PokemonStorage.rb (the model);
# - 016_UI/017_UI_PokemonStorage.rb: the League regulations constants and
#   PokemonStorageScreen (the mechanics; the scene is a recording stub);
# - 016_UI/007_UI_Bag.rb: PokemonBagScreen (its item storage screens);
# - 016_UI/020_UI_PokeMart.rb: PokemonMartAdapter, PokemonMartScreen,
#   pbPokemonMart, then the v20.1 Hotfixes' PokemonMartScreen#pbSellScreen;
# - 003_Interpreter.rb's setPrice / setSellPrice;
# - Plugins/Apricorn To Ball (Kurt), with Time.now fixed.
# Each scenario is written out with its setup (party, boxes, Bag, money,
# switches, the answers the stub scenes give) so the TS test builds the same
# state.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_code(code, path)
  TOPLEVEL_BINDING.eval(code, path)
end

def eval_file(path)
  eval_game_code(File.read(path, encoding: "UTF-8"), path)
end

# Extracts "class Name ... end" (the first top-level `end` after it).
def extract_class(code, name, path)
  ret = code[/^class #{name}\b.*?^end\r?$/m]
  raise "class #{name} not found in #{path}" if !ret
  ret
end

eval_file(File.join(SCRIPTS, "013_Items", "006_Item_Mail.rb"))
eval_file(File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "004_PokemonStorage.rb"))

storage_ui = File.join(SCRIPTS, "016_UI", "017_UI_PokemonStorage.rb")
code = File.read(storage_ui, encoding: "UTF-8")
eval_game_code(code[/\A.*?(?=^#====)/m], storage_ui) # HOENN_SWITCH ... EIGHTH_BADGE_SWITCH
eval_game_code(extract_class(code, "PokemonStorageScreen", storage_ui), storage_ui)

bag_ui = File.join(SCRIPTS, "016_UI", "007_UI_Bag.rb")
eval_game_code(extract_class(File.read(bag_ui, encoding: "UTF-8"), "PokemonBagScreen", bag_ui), bag_ui)

mart_ui = File.join(SCRIPTS, "016_UI", "020_UI_PokeMart.rb")
code = File.read(mart_ui, encoding: "UTF-8")
eval_game_code(extract_class(code, "PokemonMartAdapter", mart_ui), mart_ui)
eval_game_code(extract_class(code, "PokemonMartScreen", mart_ui), mart_ui)
eval_game_code(code[/^def pbPokemonMart\b.*?^end\r?$/m], mart_ui)

hotfixes = File.join(PLUGINS, "v20.1 Hotfixes", "Misc bug fixes.rb")
code = File.read(hotfixes, encoding: "UTF-8")
sell = code[/^class PokemonMartScreen\r?\n  def pbSellScreen.*?^end\r?$/m]
raise "Hotfixes' pbSellScreen not found" if !sell
eval_game_code(sell, hotfixes)

interp = File.join(SCRIPTS, "003_Game processing", "003_Interpreter.rb")
code = File.read(interp, encoding: "UTF-8")
set_price = code[/^  def setPrice\b.*?^  end\r?$/m] + "\n" + code[/^  def setSellPrice\b.*?^  end\r?$/m]
eval_game_code("class PriceInterpreter\n#{set_price}\nend", interp)

overworld = File.join(SCRIPTS, "012_Overworld", "001_Overworld.rb")
eval_game_code(File.read(overworld, encoding: "UTF-8")[/^def pbReceiveItem\b.*?^end\r?$/m], overworld)
eval_file(File.join(PLUGINS, "Apricorn To Ball", "Apricorn To Ball Script.rb"))

#===============================================================================
# Recording stubs
#===============================================================================
$log = []
$answers = {}
$DEBUG = false

def next_answer(kind, default)
  list = $answers[kind]
  return default if !list || list.empty?
  list.shift
end

def pkname(pkmn)
  pkmn ? pkmn.name : nil
end

def pbPlayBuzzerSE; end
def pbSEPlay(*_a); end
def pbFadeOutIn(*_a)
  yield if block_given?
end

def pbMessage(message, commands = nil, cmd_if_cancel = 0, _skin = nil, default_cmd = 0, &_block)
  if commands
    ret = next_answer(:message, cmd_if_cancel)
    $log << ["message", message, commands, cmd_if_cancel, default_cmd, ret]
    return ret
  end
  $log << ["message", message]
  0
end

def pbConfirmMessage(message, &_block)
  ret = next_answer(:confirm, false)
  $log << ["confirmMessage", message, ret]
  ret
end

class Game_Temp
  attr_accessor :in_storage, :mart_prices
  attr_accessor :speechbubble_talking, :speechbubble_bubble, :speechbubble_position, :speechbubble_follower_event

  def initialize
    @in_storage = false
    @mart_prices = {}
  end

  def clear_mart_prices
    @mart_prices = {}
  end
end

class StubGlobal
  attr_accessor :pcItemStorage, :mailbox
end

# PokemonStorageScene, as PokemonStorageScreen uses it.
class StubStorageScene
  attr_accessor :quickswap

  def initialize(storage, quickswap)
    @storage = storage
    @quickswap = quickswap
  end

  def pbStartBox(_screen, command); $log << ["startBox", command]; end
  def pbCloseBox; $log << ["closeBox"]; end

  def pbSelectBox(_party)
    ret = next_answer(:select, nil)
    $log << ["selectBox", ret]
    ret
  end

  def pbSelectParty(_party)
    ret = next_answer(:party, -1)
    $log << ["selectParty", ret]
    ret
  end

  def pbDisplay(message); $log << ["display", message]; end

  def pbShowCommands(message, commands, index = 0)
    ret = next_answer(:command, -1)
    $log << ["commands", message, commands, index, ret]
    ret
  end

  def pbChooseBox(msg)
    ret = next_answer(:box, -1)
    $log << ["chooseBox", msg, ret]
    ret
  end

  def pbJumpToBox(newbox)
    $log << ["jumpToBox", newbox]
    @storage.currentBox = newbox
  end

  def pbChangeBackground(wp)
    $log << ["changeBackground", wp]
    @storage[@storage.currentBox].background = wp
  end

  def pbBoxName(helptext, minchars, maxchars)
    ret = next_answer(:name, "")
    $log << ["boxName", helptext, minchars, maxchars, ret]
    @storage[@storage.currentBox].name = ret if ret.length > 0
  end

  def pbChooseItem(_bag)
    ret = next_answer(:item, nil)
    $log << ["chooseItem", ret&.to_s]
    ret
  end

  def pbSummary(selected, heldpoke); $log << ["summary", selected, pkname(heldpoke)]; end
  def pbMark(selected, heldpoke); $log << ["mark", selected, pkname(heldpoke)]; end
  def pbHold(selected); $log << ["hold", selected]; end
  def pbSwap(selected, heldpoke); $log << ["swap", selected, pkname(heldpoke)]; end
  def pbPlace(selected, heldpoke); $log << ["place", selected, pkname(heldpoke)]; end
  def pbWithdraw(selected, heldpoke, partyindex); $log << ["withdraw", selected, pkname(heldpoke), partyindex]; end
  def pbStore(selected, heldpoke, destbox, firstfree); $log << ["store", selected, pkname(heldpoke), destbox, firstfree]; end
  def pbRelease(selected, heldpoke); $log << ["release", selected, pkname(heldpoke)]; end
  def pbRefresh; $log << ["refresh"]; end
  def pbHardRefresh; $log << ["hardRefresh"]; end
  def pbUpdateOverlay(*_a); end
  def update; end
end

# The scenes PokemonBagScreen's item storage screens use.
class StubItemScene
  def pbStartScene(bag); $log << ["startScene", bag.is_a?(PCItemStorage) ? "storage" : "bag"]; end
  def pbEndScene; $log << ["endScene"]; end

  def pbChooseItem
    ret = next_answer(:item, nil)
    $log << ["chooseItem", ret&.to_s]
    ret
  end

  def pbChooseNumber(helptext, maximum, _initnum = 1)
    ret = next_answer(:number, 1)
    $log << ["chooseNumber", helptext, maximum, ret]
    ret
  end

  def pbRefresh; $log << ["refresh"]; end
  def pbDisplay(text, _brief = false); $log << ["display", text]; end

  def pbConfirm(text)
    ret = next_answer(:confirm, false)
    $log << ["confirm", text, ret]
    ret
  end
end

# PokemonMart_Scene, as PokemonMartScreen and pbPokemonMart use it.
class PokemonMart_Scene
  def pbStartBuyScene(stock, _adapter); $log << ["startBuyScene", stock.map(&:to_s)]; end
  def pbStartSellScene(_bag, _adapter); $log << ["startSellScene"]; end
  def pbEndBuyScene; $log << ["endBuyScene"]; end
  def pbEndSellScene; $log << ["endSellScene"]; end

  def pbChooseBuyItem
    ret = next_answer(:item, nil)
    $log << ["chooseBuyItem", ret&.to_s]
    ret
  end

  def pbChooseSellItem
    ret = next_answer(:item, nil)
    $log << ["chooseSellItem", ret&.to_s]
    ret
  end

  def pbChooseNumber(helptext, item, maximum)
    ret = next_answer(:number, 1)
    $log << ["chooseNumber", helptext, item.to_s, maximum, ret]
    ret
  end

  def pbDisplay(msg, _brief = false); $log << ["display", msg]; end

  def pbDisplayPaused(msg)
    $log << ["displayPaused", msg]
    yield if block_given?
  end

  def pbConfirm(msg)
    ret = next_answer(:confirm, false)
    $log << ["confirm", msg, ret]
    ret
  end

  def pbShowMoney; $log << ["showMoney"]; end
  def pbHideMoney; $log << ["hideMoney"]; end
  def pbRefresh; $log << ["refresh"]; end
end

# Kurt's filtered Bag (choose_apricorn_and_quantity).
class PokemonBag_Scene
  def pbStartScene(_bag, choosing = false, _filter = nil); $log << ["bagStart", choosing]; end
  def pbEndScene; $log << ["bagEnd"]; end

  def pbChooseItem
    ret = next_answer(:item, nil)
    $log << ["bagChooseItem", ret&.to_s]
    ret
  end

  def pbChooseNumber(helptext, maximum, _initnum = 1)
    ret = next_answer(:number, 1)
    $log << ["bagChooseNumber", helptext, maximum, ret]
    ret
  end
end

NOW = 1_700_000_000
class << Time
  alias real_now now
  def now; Time.at(NOW); end
end

#===============================================================================
# Scenarios
#===============================================================================
# A Pokémon: species, level and what to change (hp, hpLoss, egg, item, mail,
# cannotStore, cannotRelease, markings).
def mon(species, level, opts = {})
  { species: species, level: level }.merge(opts)
end

SCENARIOS = []

def scenario(name, kind, action, opts = {})
  SCENARIOS << { name: name, kind: kind, action: action }.merge(opts)
end

party3 = [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8), mon(:SENTRET, 6)]
box0 = [[0, 0, mon(:RATTATA, 5)], [0, 1, mon(:ZUBAT, 30)], [0, 3, mon(:TREECKO, 30)]]

# --- Withdraw / store ----------------------------------------------------------
scenario("Withdraw a boxed Pokémon", "storage", ["pbWithdraw", [0, 0]], party: party3, boxes: box0)
scenario("Withdraw with a full party", "storage", ["pbWithdraw", [0, 0]],
         party: party3 + [mon(:ONIX, 10), mon(:HOOTHOOT, 9), mon(:GEODUDE, 9)], boxes: box0)
scenario("Withdraw the held Pokémon", "storage", ["pbWithdraw", [0, 5]], party: party3, boxes: box0, held: mon(:MAREEP, 9))
scenario("Store a party Pokémon in a chosen Box (healed)", "storage", ["pbStore", [-1, 1]],
         party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, hpLoss: 10)], boxes: box0, answers: { box: [0] })
scenario("Store into a full Box, then another", "storage", ["pbStore", [-1, 1]],
         party: party3, boxes: (0...30).map { |i| [0, i, mon(:MAGIKARP, 5)] }, answers: { box: [0, 2] })
scenario("Store cancelled", "storage", ["pbStore", [-1, 1]], party: party3, answers: { box: [-1] })
scenario("Store the last able Pokémon", "storage", ["pbStore", [-1, 0]],
         party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, hp: 0), mon(:TOGEPI, 1, egg: true)])
scenario("Store a fainted Pokémon next to the last able one", "storage", ["pbStore", [-1, 1]],
         party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, hp: 0)], answers: { box: [1] })
scenario("Store a Pokémon holding Mail", "storage", ["pbStore", [-1, 1]],
         party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, item: :GRASSMAIL, mail: true)])
scenario("Store a Pokémon that can't be stored", "storage", ["pbStore", [-1, 1]],
         party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, cannotStore: true)])
scenario("Store the held Pokémon", "storage", ["pbStore", [-1, 3]], party: party3, held: mon(:MAREEP, 9, hpLoss: 5),
         answers: { box: [1] })

# --- Hold / place / swap ----------------------------------------------------------
scenario("Hold a boxed Pokémon", "storage", ["pbHold", [0, 1]], party: party3, boxes: box0)
scenario("Hold a party Pokémon", "storage", ["pbHold", [-1, 0]], party: party3)
scenario("Hold the last able party Pokémon", "storage", ["pbHold", [-1, 0]], party: [mon(:CYNDAQUIL, 12), mon(:TOGEPI, 1, egg: true)])
scenario("Place the held Pokémon in a Box (healed)", "storage", ["pbPlace", [0, 2]], party: party3, boxes: box0,
         held: mon(:MAREEP, 9, hpLoss: 5))
scenario("Place the held Pokémon in the party", "storage", ["pbPlace", [-1, 3]], party: party3, held: mon(:MAREEP, 9))
scenario("Place a Pokémon holding Mail in a Box", "storage", ["pbPlace", [0, 2]], party: party3,
         held: mon(:MAREEP, 9, item: :GRASSMAIL, mail: true))
scenario("Place an unstorable Pokémon in a Box", "storage", ["pbPlace", [0, 2]], party: party3, held: mon(:MAREEP, 9, cannotStore: true))
scenario("Swap the held Pokémon with a boxed one", "storage", ["pbSwap", [0, 1]], party: party3, boxes: box0, held: mon(:MAREEP, 9, hpLoss: 3))
scenario("Swap the held Pokémon into the party", "storage", ["pbSwap", [-1, 1]], party: party3, held: mon(:MAREEP, 9))
scenario("Swap the last able Pokémon for a fainted one", "storage", ["pbSwap", [-1, 0]],
         party: [mon(:CYNDAQUIL, 12), mon(:TOGEPI, 1, egg: true)], held: mon(:MAREEP, 9, hp: 0))
scenario("Swap an unstorable held Pokémon into a Box", "storage", ["pbSwap", [0, 1]], party: party3, boxes: box0,
         held: mon(:MAREEP, 9, cannotStore: true))
scenario("Swap a held Pokémon with Mail into a Box", "storage", ["pbSwap", [0, 1]], party: party3, boxes: box0,
         held: mon(:MAREEP, 9, item: :GRASSMAIL, mail: true))

# --- Release ---------------------------------------------------------------------
scenario("Release a boxed Pokémon", "storage", ["pbRelease", [0, 1]], party: party3, boxes: box0, answers: { command: [1] })
scenario("Release declined", "storage", ["pbRelease", [0, 1]], party: party3, boxes: box0, answers: { command: [0] })
scenario("Release the held Pokémon", "storage", ["pbRelease", [0, 5]], party: party3, held: mon(:MAREEP, 9), answers: { command: [1] })
scenario("Release an Egg", "storage", ["pbRelease", [-1, 1]], party: [mon(:CYNDAQUIL, 12), mon(:TOGEPI, 1, egg: true)])
scenario("Release a Pokémon holding Mail", "storage", ["pbRelease", [-1, 1]],
         party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, item: :GRASSMAIL, mail: true)])
scenario("Release a Pokémon that refuses", "storage", ["pbRelease", [-1, 1]], party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, cannotRelease: true)])
scenario("Release the last able Pokémon", "storage", ["pbRelease", [-1, 0]], party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, hp: 0)])
scenario("Release from the party", "storage", ["pbRelease", [-1, 2]], party: party3, answers: { command: [1] })

# --- Items -----------------------------------------------------------------------
scenario("Take a held item", "storage", ["pbItem", [0, 0]], party: party3, boxes: [[0, 0, mon(:RATTATA, 5, item: :ORANBERRY)]],
         answers: { command: [0] })
scenario("Take a held item declined", "storage", ["pbItem", [0, 0]], party: party3, boxes: [[0, 0, mon(:RATTATA, 5, item: :ORANBERRY)]],
         answers: { command: [1] })
scenario("Give an item", "storage", ["pbItem", [0, 0]], party: party3, boxes: box0, bag: [[:LEFTOVERS, 2]], answers: { item: [:LEFTOVERS] })
scenario("Give an item cancelled", "storage", ["pbItem", [0, 0]], party: party3, boxes: box0, bag: [[:LEFTOVERS, 2]], answers: { item: [nil] })
scenario("Item on an Egg", "storage", ["pbItem", [-1, 1]], party: [mon(:CYNDAQUIL, 12), mon(:TOGEPI, 1, egg: true)])
scenario("Item on a Pokémon holding Mail", "storage", ["pbItem", [-1, 1]],
         party: [mon(:CYNDAQUIL, 12), mon(:PIDGEY, 8, item: :GRASSMAIL, mail: true)])
scenario("Item on the held Pokémon", "storage", ["pbItem", [0, 5]], party: party3, held: mon(:MAREEP, 9, item: :POTION),
         answers: { command: [0] })

# --- Box commands ----------------------------------------------------------------
scenario("Box: jump", "storage", ["pbBoxCommands"], party: party3, answers: { command: [0], box: [7] })
scenario("Box: jump cancelled", "storage", ["pbBoxCommands"], party: party3, answers: { command: [0], box: [-1] })
scenario("Box: wallpaper", "storage", ["pbBoxCommands"], party: party3, current: 2, answers: { command: [1, 5] })
scenario("Box: wallpaper with unlocked ones", "storage", ["pbBoxCommands"], party: party3, unlocked: [16, 20],
         backgrounds: [[0, 20]], answers: { command: [1, 17] })
scenario("Box: name", "storage", ["pbBoxCommands"], party: party3, answers: { command: [2], name: ["Starters"] })
scenario("Box: name left empty", "storage", ["pbBoxCommands"], party: party3, answers: { command: [2], name: [""] })
scenario("Box: cancel", "storage", ["pbBoxCommands"], party: party3, answers: { command: [3] })

# --- League regulations (HOENN_SWITCH) ----------------------------------------------
hoenn = { HOENN_SWITCH => true }
scenario("Regulations: withdraw a non-Hoenn Pokémon", "storage", ["pbWithdraw", [0, 1]], party: party3, boxes: box0, switches: hoenn)
scenario("Regulations: withdraw a Hoenn Pokémon", "storage", ["pbWithdraw", [0, 3]], party: party3, boxes: box0, switches: hoenn)
scenario("Regulations: first badge, level 5", "storage", ["pbWithdraw", [0, 0]], party: party3, boxes: box0,
         switches: hoenn.merge(FIRST_BADGE_SWITCH => true))
scenario("Regulations: first badge, level 30", "storage", ["pbWithdraw", [0, 1]], party: party3, boxes: box0,
         switches: hoenn.merge(FIRST_BADGE_SWITCH => true))
scenario("Regulations: second badge, level 20", "storage", ["pbWithdraw", [0, 0]], party: party3,
         boxes: [[0, 0, mon(:ONIX, 20)]], switches: hoenn.merge(SECOND_BADGE_SWITCH => true))
scenario("Regulations: withdraw the held non-Hoenn Pokémon", "storage", ["pbWithdraw", [0, 5]], party: party3,
         held: mon(:ZUBAT, 30), switches: hoenn)
scenario("Regulations: place a held Hoenn Pokémon in the party", "storage", ["pbPlace", [-1, 3]], party: party3,
         held: mon(:TREECKO, 30), switches: hoenn)
scenario("Regulations: place a held Pokémon in a Box", "storage", ["pbPlace", [0, 4]], party: party3, held: mon(:ZUBAT, 30), switches: hoenn)
scenario("Regulations: swap a held non-Hoenn Pokémon into the party", "storage", ["pbSwap", [-1, 1]], party: party3,
         held: mon(:ZUBAT, 30), switches: hoenn)
scenario("Regulations: swap a held Hoenn Pokémon into the party", "storage", ["pbSwap", [-1, 1]], party: party3,
         held: mon(:MUDKIP, 30), switches: hoenn)
[[:TREECKO, 40], [:ZUBAT, 14], [:ZUBAT, 24], [:PIKACHU, 50]].each do |sp, lv|
  [{}, { FIRST_BADGE_SWITCH => true }, { SECOND_BADGE_SWITCH => true }].each do |sw|
    scenario("pbCanWithdraw #{sp} #{lv} #{sw.keys}", "storage", ["pbCanWithdraw", [0, 0]], party: party3,
             boxes: [[0, 0, mon(sp, lv)]], switches: hoenn.merge(sw))
  end
end

# --- Whole screens ----------------------------------------------------------------
scenario("Organize: move a boxed Pokémon to the party", "storage", ["pbStartScreen", 0], party: party3, boxes: box0,
         answers: { select: [[0, 0], [-1, 3], nil], command: [0, 0, 1] })
scenario("Organize: quick swap", "storage", ["pbStartScreen", 0], party: party3, boxes: box0, quickswap: true,
         answers: { select: [[0, 0], [0, 1], [0, 0], [-3, -1], [-3, -1]], command: [1, 0] })
scenario("Organize: held Pokémon blocks exiting", "storage", ["pbStartScreen", 0], party: party3, boxes: box0,
         answers: { select: [[0, 1], nil, [-3, -1], [0, 2], [-3, -1]], command: [0, 0, 0] })
scenario("Organize: empty slot does nothing", "storage", ["pbStartScreen", 0], party: party3, boxes: box0,
         answers: { select: [[0, 10], [-4, -1], nil], command: [3, 1] })
scenario("Organize: every command on a party Pokémon", "storage", ["pbStartScreen", 0], party: party3, boxes: box0,
         answers: { select: [[-1, 1], [-1, 1], [-1, 1], [-1, 1], [-1, 1], nil], command: [1, 3, 4, 6, 5, 0, 1], item: [nil] })
scenario("Withdraw screen", "storage", ["pbStartScreen", 1], party: party3, boxes: box0,
         answers: { select: [[-2, -1], [0, 5], [0, 1], [0, 0], [-4, -1], [-3, -1]], command: [0, 2, 3, 0, 0] })
scenario("Withdraw screen: release and cancel", "storage", ["pbStartScreen", 1], party: party3, boxes: box0,
         answers: { select: [[0, 1], [0, 3], nil], command: [3, 1, 4, 1] })
scenario("Deposit screen", "storage", ["pbStartScreen", 2], party: party3, boxes: box0,
         answers: { party: [1, 6, -1], command: [0, 1, 0], box: [0] })
scenario("Deposit screen: summary, mark, cancel", "storage", ["pbStartScreen", 2], party: party3,
         answers: { party: [0, 0, 2, -3], command: [1, 2, 4, 0] })
scenario("pbChoosePokemon", "storage", ["pbChoosePokemon"], party: party3, boxes: box0,
         answers: { select: [[0, 3], [-1, 2], [0, 0]], command: [1, 2, 1, 0] })
scenario("pbChoosePokemon cancelled", "storage", ["pbChoosePokemon"], party: party3, boxes: box0,
         answers: { select: [nil, [-3, -1]], command: [0, 0] })

# --- Item storage ------------------------------------------------------------------
pc_items = [[:POTION, 3], [:ESCAPEROPE, 1], [:FULLHEAL, 1]]
scenario("Withdraw items", "items", ["pbWithdrawItemScreen"], pc: pc_items, bag: [[:POTION, 2]],
         answers: { item: [:POTION, :FULLHEAL, :ESCAPEROPE, nil], number: [2] })
scenario("Withdraw into a full slot", "items", ["pbWithdrawItemScreen"], pc: pc_items, bag: [[:POTION, 999]],
         answers: { item: [:POTION, nil], number: [3] })
scenario("Withdraw cancelled at the number", "items", ["pbWithdrawItemScreen"], pc: pc_items,
         answers: { item: [:POTION, nil], number: [0] })
scenario("Deposit items", "items", ["pbDepositItemScreen"], pc: pc_items, bag: [[:POTION, 5], [:ANTIDOTE, 1], [:BICYCLE, 1]],
         answers: { item: [:POTION, :ANTIDOTE, :BICYCLE, nil], number: [4] })
scenario("Deposit with no storage yet", "items", ["pbDepositItemScreen"], bag: [[:REPEL, 2]],
         answers: { item: [:REPEL, nil], number: [2] })
scenario("Deposit into a full PC slot", "items", ["pbDepositItemScreen"], pc: [[:POTION, 998]], bag: [[:POTION, 5]],
         answers: { item: [:POTION, nil], number: [5] })
scenario("Toss items", "items", ["pbTossItemScreen"], pc: pc_items,
         answers: { item: [:ESCAPEROPE, :POTION, :POTION, :FULLHEAL, nil], number: [2, 3], confirm: [false, true, true] })

# --- Poké Mart ------------------------------------------------------------------------
cherrygrove = [:POTION, :POKEBALL, :ANTIDOTE, :AWAKENING, :PARALYZEHEAL]
scenario("Buy Potions", "mart", ["buy", cherrygrove], money: 3000, answers: { item: [:POTION, nil], number: [3], confirm: [true] })
scenario("Buy one Potion", "mart", ["buy", cherrygrove], money: 3000, answers: { item: [:POTION, nil], number: [1], confirm: [true] })
scenario("Buy declined", "mart", ["buy", cherrygrove], money: 3000, answers: { item: [:POTION, nil], number: [5], confirm: [false] })
scenario("Buy number cancelled", "mart", ["buy", cherrygrove], money: 3000, answers: { item: [:ANTIDOTE, nil], number: [0] })
scenario("Buy 10 Poké Balls (Premier Ball)", "mart", ["buy", cherrygrove], money: 3000,
         answers: { item: [:POKEBALL, nil], number: [10], confirm: [true] })
scenario("Buy 25 Poké Balls", "mart", ["buy", cherrygrove], money: 3000, answers: { item: [:POKEBALL, nil], number: [25], confirm: [true] })
scenario("Buy 10 Potions (no Premier Ball)", "mart", ["buy", cherrygrove], money: 3000,
         answers: { item: [:POTION, nil], number: [10], confirm: [true] })
scenario("Not enough money", "mart", ["buy", cherrygrove], money: 150, answers: { item: [:POTION, :POKEBALL, nil], number: [1], confirm: [true] })
scenario("Max affordable", "mart", ["buy", cherrygrove], money: 1_000_000, answers: { item: [:POKEBALL, nil], number: [0] })
scenario("No room in the Bag", "mart", ["buy", cherrygrove], money: 3000, bag: [[:POTION, 998]],
         answers: { item: [:POTION, nil], number: [3], confirm: [true] })
scenario("Buy a key item (removed from stock)", "mart", ["buy", [:POTION, :BICYCLE]], money: 1_000_000,
         answers: { item: [:BICYCLE, :BICYCLE, nil], confirm: [true, true] })
scenario("Buy a TM", "mart", ["buy", [:TM01, :POTION]], money: 100_000, answers: { item: [:TM01, nil], number: [2], confirm: [true] })
scenario("Sell Potions", "mart", ["sell"], money: 500, bag: [[:POTION, 5], [:BICYCLE, 1]],
         answers: { item: [:POTION, nil], number: [3], confirm: [true] })
scenario("Sell one", "mart", ["sell"], money: 500, bag: [[:NUGGET, 1]], answers: { item: [:NUGGET, nil], confirm: [true] })
scenario("Sell declined and cancelled", "mart", ["sell"], money: 500, bag: [[:POTION, 5]],
         answers: { item: [:POTION, :POTION, nil], number: [2, 0], confirm: [false] })
scenario("Sell a key item", "mart", ["sell"], money: 500, bag: [[:BICYCLE, 1]], answers: { item: [:BICYCLE, nil] })
scenario("Sell a TM", "mart", ["sell"], money: 500, bag: [[:TM01, 1]], answers: { item: [:TM01, nil], confirm: [true] })
scenario("Mart prices (setPrice / setSellPrice)", "mart", ["buy", cherrygrove], money: 3000,
         prices: [[:POTION, 150, -1], [:ANTIDOTE, -1, 40], [:POKEBALL, 500, 10]],
         answers: { item: [:POTION, :POKEBALL, nil], number: [2, 1], confirm: [true, true] })
scenario("Sell with setSellPrice", "mart", ["sell"], money: 0, bag: [[:ANTIDOTE, 3], [:POTION, 2]],
         prices: [[:ANTIDOTE, -1, 40], [:POTION, 150, -1]], answers: { item: [:ANTIDOTE, :POTION, nil], number: [3, 2], confirm: [true, true] })
scenario("Sell with a 0 sell price", "mart", ["sell"], money: 0, bag: [[:POTION, 2]], prices: [[:POTION, -1, 0]],
         answers: { item: [:POTION, nil] })
scenario("pbPokemonMart: buy then quit", "mart", ["mart", cherrygrove, nil, false], money: 3000,
         answers: { message: [0, 2], item: [:POTION, nil], number: [1], confirm: [true] })
scenario("pbPokemonMart: sell then cancel", "mart", ["mart", cherrygrove, nil, false], money: 3000, bag: [[:POTION, 1]],
         answers: { message: [1, 3], item: [:POTION, nil], confirm: [true] })
scenario("pbPokemonMart: can't sell, speech", "mart", ["mart", cherrygrove, "Hi there!", true], money: 3000,
         answers: { message: [1] })
scenario("pbPokemonMart: owned key item left out", "mart", ["mart", [:BICYCLE, :POTION], nil, false], money: 3000,
         bag: [[:BICYCLE, 1]], answers: { message: [0, 2], item: [nil] })

# --- Kurt (Apricorn To Ball) ------------------------------------------------------------
scenario("Kurt: format_time", "kurt", ["formatTime", [3600, 3725.5, 59.9, 0.4, 7322, 60]])
scenario("Kurt: still making one", "kurt", ["call"], kurt: { ball: :LEVELBALL, count: 1, nextRun: NOW + 1830 })
scenario("Kurt: still making several", "kurt", ["call"], kurt: { ball: :MOONBALL, count: 3, nextRun: NOW + 7322 })
scenario("Kurt: balls done", "kurt", ["call"], kurt: { ball: :LUREBALL, count: 2, nextRun: NOW - 5 })
scenario("Kurt: no Apricorn", "kurt", ["call"], answers: { confirm: [false] })
scenario("Kurt: turn 3 Red Apricorns into Level Balls", "kurt", ["call"], bag: [[:REDAPRICORN, 4]],
         answers: { confirm: [true, true], item: [:REDAPRICORN], number: [3] })
scenario("Kurt: one Blue Apricorn", "kurt", ["call"], bag: [[:BLUEAPRICORN, 1]],
         answers: { confirm: [true, true], item: [:BLUEAPRICORN] })
scenario("Kurt: declines the conversion", "kurt", ["call"], bag: [[:REDAPRICORN, 4]],
         answers: { confirm: [true, false], item: [:REDAPRICORN], number: [2] })
scenario("Kurt: closes the Bag", "kurt", ["call"], bag: [[:REDAPRICORN, 4]], answers: { confirm: [true], item: [nil] })

#===============================================================================
# Runner
#===============================================================================
def build_pokemon(spec)
  pkmn = Pokemon.new(spec[:species].to_sym, spec[:level], $player)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = 31
    pkmn.ev[s.id] = 0
  end
  pkmn.nature = :HARDY
  pkmn.calc_stats
  pkmn.item = spec[:item]&.to_sym
  pkmn.mail = Mail.new(spec[:item].to_sym, "Hello!", "Kris") if spec[:mail]
  if spec[:egg]
    pkmn.steps_to_hatch = 1000
    pkmn.name = _INTL("Egg")
  end
  pkmn.hp = spec[:hp] if spec.key?(:hp)
  pkmn.hp = pkmn.totalhp - spec[:hpLoss] if spec[:hpLoss]
  pkmn.cannot_store = true if spec[:cannotStore]
  pkmn.cannot_release = true if spec[:cannotRelease]
  pkmn.markings = spec[:markings] if spec[:markings]
  pkmn
end

def pokemon_state(pkmn)
  return nil if !pkmn
  [pkmn.name, pkmn.hp, pkmn.totalhp, pkmn.item_id&.to_s, pkmn.mail ? true : false]
end

def items_state(items)
  items.map { |item, qty| [item.to_s, qty] }
end

def state(screen = nil)
  boxes = []
  $PokemonStorage.maxBoxes.times do |b|
    $PokemonStorage.maxPokemon(b).times do |i|
      p = $PokemonStorage[b, i]
      boxes << [b, i, pokemon_state(p)] if p
    end
  end
  {
    party: $player.party.map { |p| pokemon_state(p) },
    boxes: boxes,
    currentBox: $PokemonStorage.currentBox,
    boxInfo: (0...10).map { |b| [$PokemonStorage[b].name, $PokemonStorage[b].background] },
    held: screen ? pokemon_state(screen.heldpkmn) : nil,
    inStorage: $game_temp.in_storage,
    bag: $bag.pockets.flat_map { |p| items_state(p) },
    pc: $PokemonGlobal.pcItemStorage ? items_state($PokemonGlobal.pcItemStorage.items) : nil,
    money: $player.money,
    stats: [$stats.money_spent_at_marts, $stats.money_earned_at_marts, $stats.mart_items_bought, $stats.premier_balls_earned],
    martPrices: $game_temp.mart_prices.map { |k, v| [k.to_s, v] },
    kurt: [$player.ball_for_apricorn&.to_s, $player.ball_for_apricorn_count, $player.next_run.is_a?(Time) ? $player.next_run.to_i : $player.next_run],
    var8: $game_variables[8].is_a?(Symbol) ? $game_variables[8].to_s : $game_variables[8],
  }
end

def jsonable(v)
  case v
  when Symbol then v.to_s
  when Array then v.map { |x| jsonable(x) }
  when Hash then v.to_h { |k, x| [k.to_s, jsonable(x)] }
  else v
  end
end

def run(sc)
  $log = []
  $answers = {}
  (sc[:answers] || {}).each { |k, v| $answers[k] = v.dup }
  $game_temp = Game_Temp.new
  $game_switches = Hash.new(false)
  (sc[:switches] || {}).each { |k, v| $game_switches[k] = v }
  $game_variables = Hash.new(0)
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = 12_345_678
  $player.money = sc[:money] if sc[:money]
  $bag = PokemonBag.new
  (sc[:bag] || []).each { |item, qty| $bag.add(item, qty) }
  $stats = GameStats.new
  $PokemonGlobal = StubGlobal.new
  if sc[:pc]
    $PokemonGlobal.pcItemStorage = PCItemStorage.new
    $PokemonGlobal.pcItemStorage.items.clear
    sc[:pc].each { |item, qty| $PokemonGlobal.pcItemStorage.add(item, qty) }
  end
  $PokemonStorage = PokemonStorage.new
  $PokemonStorage.currentBox = sc[:current] if sc[:current]
  (sc[:unlocked] || []).each { |i| $PokemonStorage.unlockedWallpapers[i] = true }
  (sc[:backgrounds] || []).each { |b, wp| $PokemonStorage[b].background = wp }
  $player.party = (sc[:party] || []).map { |s| build_pokemon(s) }
  (sc[:boxes] || []).each { |b, i, s| $PokemonStorage[b, i] = build_pokemon(s) }
  (sc[:prices] || []).each { |item, buy, sell| PriceInterpreter.new.setPrice(item, buy, sell) }
  if sc[:kurt]
    $player.ball_for_apricorn = sc[:kurt][:ball]
    $player.ball_for_apricorn_count = sc[:kurt][:count]
    $player.next_run = Time.at(sc[:kurt][:nextRun])
  end
  ret = nil
  screen = nil
  action = sc[:action]
  case sc[:kind]
  when "storage"
    scene = StubStorageScene.new($PokemonStorage, sc[:quickswap] || false)
    screen = PokemonStorageScreen.new(scene, $PokemonStorage)
    screen.heldpkmn = build_pokemon(sc[:held]) if sc[:held]
    args = action[1..]
    # The screen's loop passes @heldpkmn as the second argument.
    args += [screen.heldpkmn] if %w[pbWithdraw pbStore pbRelease pbItem].include?(action[0])
    ret = screen.send(action[0], *args)
  when "items"
    screen2 = PokemonBagScreen.new(StubItemScene.new, $bag)
    ret = screen2.send(action[0])
  when "mart"
    case action[0]
    when "buy"
      PokemonMartScreen.new(PokemonMart_Scene.new, action[1].dup).pbBuyScreen
    when "sell"
      PokemonMartScreen.new(PokemonMart_Scene.new, []).pbSellScreen
    when "mart"
      pbPokemonMart(action[1].dup, action[2], action[3])
    end
  when "kurt"
    case action[0]
    when "formatTime"
      page = KurtEventPage.new
      ret = action[1].map { |s| page.send(:format_time, s) }
    when "call"
      KurtEventPage.class_variable_set(:@@newRun, nil) if KurtEventPage.class_variable_defined?(:@@newRun)
      KurtEventPage.new.call
    end
  end
  ret = pokemon_state(ret) if ret.is_a?(Pokemon)
  { log: jsonable($log), ret: jsonable(ret), state: jsonable(state(screen)) }
end

out = SCENARIOS.map do |sc|
  result = begin
    run(sc)
  rescue StandardError => e
    { error: "#{e.class}: #{e.message}", log: jsonable($log) }
  end
  { setup: jsonable(sc), result: result }
end

path = File.expand_path("../../src/ui/storage/storageMartReference.json", __dir__)
File.write(path, JSON.pretty_generate(out) + "\n")
errors = out.count { |o| o[:result][:error] }
puts "#{out.length} scenarios (#{errors} raised) -> #{path}"
