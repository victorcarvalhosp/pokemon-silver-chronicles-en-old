# Runs the item handlers of the Generation 9 Pack ([004] Items/[000] Item
# Handlers.rb, [001] New Item Handlers.rb) and of ZUD Mechanics ([001] Data/
# Data_Item.rb) headless, in the real game's load order, on fixed scenarios,
# and writes web/src/battle/items/pluginItemsReference.json, which
# web/src/battle/items/pluginItems.test.ts replays against the TypeScript port
# (Gen9_ItemHandlers.ts, Gen9_NewItemHandlers.ts, ZUD_Data_Item.ts).
#
#   cd web && ruby tools/ruby-ref/plugin_items_reference.rb
#
# Load order: essentials.rb loads the plugins but not 013_Items/002 and 003,
# so the plugins' ItemHandlers were registered before the core handlers
# existed (and their .copy of ETHER copied nothing). As in the game, this
# script then evaluates 002_Item_Effects.rb and 003_Item_BattleEffects.rb and
# evaluates the plugins' handler registrations again after them: all of
# [000] Item Handlers.rb, [001] New Item Handlers.rb from its "New item
# handlers" banner on (its GameData::Item `alias` would recurse if evaluated
# twice), Data_Item.rb from its "Z-Crystals" section on (same reason), and
# ZUD's Override_Items.rb (whose Red Card replaces the Gen 9 Pack's, as ZUD
# loads later).
#
# Three kinds of scenario, each written out with its setup:
# - "field": UseOnPokemon/UseInField with a recording party screen stub (as
#   field_items_reference.rb), pbMessage/pbConfirmMessage, the evolution
#   scene, the Move Relearner and the party screen Max Eggs opens.
# - "bag": the battle-use handlers (CanUseInBattle, BattleUseOnPokemon,
#   UseInBattle) called through ItemHandlers' triggers on a real battle, with
#   a recording Bag/party scene stub.
# - "held": scripted battles with held items, as held_items_reference.rb
#   (every message, and each battler's HP, stages, status, item and Speed).
# No damaging move is used in Sun, so the Generation 9 Pack's
# `if @function = "IncreasePowerInSunWeather"` (Battle.rb:278) doesn't matter.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_code(code, path, line = 1)
  TOPLEVEL_BINDING.eval(code, path, line)
end

# Evaluates `path` from the first line matching `marker` (minus `back` lines).
def eval_from(path, marker, back)
  lines = File.read(path, encoding: "UTF-8").lines
  idx = lines.index { |l| l.include?(marker) }
  raise "#{marker} not found in #{path}" if !idx
  start = idx - back
  eval_game_code(lines[start..].join, path, start + 1)
end

%w[002_Item_Effects.rb 003_Item_BattleEffects.rb].each do |f|
  path = File.join(SCRIPTS, "013_Items", f)
  eval_game_code(File.read(path, encoding: "UTF-8"), path)
end

# v20.1 Hotfixes' pbChangeLevel (Misc bug fixes.rb:102), used by Max Eggs.
hotfixes = File.join(PLUGINS, "v20.1 Hotfixes", "Misc bug fixes.rb")
change_level = File.read(hotfixes, encoding: "UTF-8")[/^def pbChangeLevel\(.*?^end\r?$/m]
raise "pbChangeLevel not found in #{hotfixes}" if !change_level
eval_game_code(change_level, hotfixes)

GEN9_ITEMS = File.join(PLUGINS, "Generation 9 Pack Scripts", "[004] Items")
gen9_handlers = File.join(GEN9_ITEMS, "[000] Item Handlers.rb")
eval_game_code(File.read(gen9_handlers, encoding: "UTF-8"), gen9_handlers)
eval_from(File.join(GEN9_ITEMS, "[001] New Item Handlers.rb"), "# New item handlers (from the bag).", 2)
eval_from(File.join(PLUGINS, "ZUD Mechanics", "[001] Data", "Data_Item.rb"), "# Z-Crystals", 1)
zud_overrides = File.join(PLUGINS, "ZUD Mechanics", "[008] Overrides", "Override_Items.rb")
eval_game_code(File.read(zud_overrides, encoding: "UTF-8"), zud_overrides)

# Essentials Deluxe's GameStats counters ([000] Essentials Patches/
# Miscellaneous.rb, not loaded by essentials.rb) that Data_Item.rb increments.
class GameStats
  attr_accessor :total_dynamax_lvls_gained, :total_gmax_factors_given
end

# Essentials Deluxe's GameData::Item#portion_name (Miscellaneous.rb:119, not
# loaded by essentials.rb either), which Data_Item.rb and ZUD's Battle.rb call.
module GameData
  class Item
    def portion_name; return name; end
  end
end

# $game_map.map_id: level-up happiness (pbChangeLevel, Max Eggs) reads it.
MAP_STUB = Struct.new(:map_id).new(5)

#===============================================================================
# Recording stubs
#===============================================================================
$log = []
$answers = {}

def next_answer(kind, default)
  list = $answers[kind]
  return default if !list || list.empty?
  list.shift
end

def pbMessage(message, _commands = nil, _cmdIfCancel = 0, _skin = nil, _defaultCmd = 0, &_block)
  $log << ["msg", message]
  0
end

def pbConfirmMessage(message, &_block)
  ret = next_answer(:confirm, false)
  $log << ["confirmMsg", message, ret]
  ret
end

def pbTopRightWindow(text, _scene = nil)
  $log << ["topRight", text]
end

def pbFadeOutIn(*_args)
  yield if block_given?
end

def pbFadeOutInWithMusic(*_args)
  yield if block_given?
end

class PokemonEvolutionScene
  def pbStartScreen(pkmn, new_species)
    @pkmn = pkmn
    @new_species = new_species
  end

  def pbEvolution(cancancel = true)
    $log << ["evolution", @pkmn.species.to_s, @new_species.to_s, cancancel]
  end

  def pbEndScreen; end
end

# The Move Relearner: relearns the next :relearn answer (nil: none).
def pbRelearnMoveScreen(pkmn)
  move = next_answer(:relearn, nil)
  $log << ["relearn", pkmn.name, move]
  pkmn.learn_move(move.to_sym) if move
  !move.nil?
end

class PokemonParty_Scene; end

# The party screen (PokemonPartyScreen), as the UseOnPokemon handlers get it
# and as Max Eggs opens it. Methods return nil, as the real ones' results
# aren't used.
class PokemonPartyScreen
  def initialize(*_args); end

  def pbStartScene(helptext, _num_battlers_out, _annotations = nil)
    $log << ["startScene", helptext]
    nil
  end

  def pbEndScene
    $log << ["endScene"]
    nil
  end

  def pbDisplay(text)
    $log << ["display", text]
    nil
  end

  def pbConfirm(text)
    ret = next_answer(:confirm, false)
    $log << ["sceneConfirm", text, ret]
    ret
  end

  def pbRefresh
    $log << ["refresh"]
    nil
  end

  def pbHardRefresh
    $log << ["hardRefresh"]
    nil
  end

  def pbRefreshSingle(i)
    $log << ["refreshSingle", i]
    nil
  end

  def pbUpdate; end

  def pbChooseMove(_pkmn, helptext, _index = 0)
    ret = next_answer(:move, 0)
    $log << ["chooseMove", helptext, ret]
    ret
  end

  def pbRefreshAnnotations(able_proc)
    $log << ["refreshAnnotations", $player.party.map { |p| able_proc.call(p) ? true : false }]
  end
end

class Game_Temp
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

class SwitchStub
  def [](_i); false; end
  def []=(_i, _v); end
end

$game_temp      = Game_Temp.new
$game_switches  = SwitchStub.new
$game_variables = Hash.new(0)
$game_map       = nil
$PokemonGlobal  = nil

INERT_ABILITY = :HONEYGATHER

#===============================================================================
# Pokémon
#===============================================================================
# spec: species, level, and optionally form, abilityIndex, ability (battle
# scenarios: Honey Gather by default), item, moves ([id, pp]), iv (number or
# {stat => iv}), status, hp, egg, dynamaxLvl, gmaxFactor, nature.
def build_pokemon(spec, battle: false)
  pkmn = Pokemon.new(spec["species"].to_sym, spec["level"] || 50, $player)
  pkmn.form_simple = spec["form"] if spec["form"]
  GameData::Stat.each_main do |s|
    iv = spec["iv"]
    pkmn.iv[s.id] = iv.is_a?(Hash) ? (iv[s.id.to_s] || 31) : (iv || 31)
    pkmn.ev[s.id] = 0
  end
  pkmn.nature = (spec["nature"] || "HARDY").to_sym
  pkmn.ability_index = spec["abilityIndex"] || 0
  pkmn.ability = nil
  pkmn.ability = spec["ability"] ? spec["ability"].to_sym : INERT_ABILITY if battle
  pkmn.item = spec["item"]&.to_sym
  if spec["moves"] || battle
    pkmn.forget_all_moves
    (spec["moves"] || ["TACKLE"]).each_with_index do |m, i|
      id, pp = m.is_a?(Array) ? m : [m, nil]
      pkmn.learn_move(id.to_sym)
      pkmn.moves[i].pp = pp if pp
    end
  end
  pkmn.dynamax_lvl = spec["dynamaxLvl"] if spec["dynamaxLvl"]
  pkmn.gmax_factor = spec["gmaxFactor"] if spec.key?("gmaxFactor")
  pkmn.calc_stats
  pkmn.hp = spec["hp"] if spec.key?("hp")
  pkmn.status = spec["status"].to_sym if spec["status"]
  pkmn.steps_to_hatch = 1 if spec["egg"]
  pkmn
end

def main_stats
  ret = []
  GameData::Stat.each_main { |s| ret << s.id }
  ret
end

def pokemon_state(pkmn)
  {
    "species" => pkmn.species.to_s, "form" => pkmn.form_simple, "level" => pkmn.level, "exp" => pkmn.exp,
    "hp" => pkmn.hp, "totalhp" => pkmn.totalhp, "status" => pkmn.status.to_s,
    "iv" => main_stats.map { |s| [s.to_s, pkmn.iv[s]] }.to_h,
    "stats" => [pkmn.attack, pkmn.defense, pkmn.spatk, pkmn.spdef, pkmn.speed],
    "moves" => pkmn.moves.map { |m| [m.id.to_s, m.pp] },
    "ability" => pkmn.ability ? pkmn.ability.id.to_s : nil, "abilityIndex" => pkmn.ability_index,
    "item" => pkmn.item_id&.to_s, "dynamaxLvl" => pkmn.dynamax_lvl, "gmaxFactor" => pkmn.gmax_factor?
  }
end

def mon(species, level = 30, **rest)
  { "species" => species, "level" => level }.merge(rest.transform_keys(&:to_s))
end

def bag_state
  $bag.pockets.flat_map { |pocket| pocket.map { |slot| [slot[0].to_s, slot[1]] } }
end

def new_player(badges = 8)
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = 12_345_678
  $player.badges = [true] * badges
  $bag = PokemonBag.new
  $stats = GameStats.new
  $stats.total_dynamax_lvls_gained = 0
  $stats.total_gmax_factors_given = 0
  $game_map = nil
end

#===============================================================================
# Field scenarios
#===============================================================================
FIELD = []
# action: ["UseOnPokemon", item, qty] or ["UseInField", item]
def field(name, action, party, opts = {})
  FIELD << { "name" => name, "action" => action, "party" => party }.merge(opts.transform_keys(&:to_s))
end

# --- Gen 9 status heals --------------------------------------------------------
field("Awakening on Drowsy", ["UseOnPokemon", "AWAKENING", 1], [mon("ODDISH", status: "DROWSY")])
field("Awakening on sleep", ["UseOnPokemon", "AWAKENING", 1], [mon("ODDISH", status: "SLEEP")])
field("Awakening on a healthy Pokémon", ["UseOnPokemon", "AWAKENING", 1], [mon("ODDISH")])
field("Awakening on a fainted Drowsy Pokémon", ["UseOnPokemon", "AWAKENING", 1], [mon("ODDISH", status: "DROWSY", hp: 0)])
field("Chesto Berry on Drowsy", ["UseOnPokemon", "CHESTOBERRY", 1], [mon("ODDISH", status: "DROWSY")])
field("Blue Flute on sleep", ["UseOnPokemon", "BLUEFLUTE", 1], [mon("ODDISH", status: "SLEEP")])
field("Poké Flute on Drowsy", ["UseOnPokemon", "POKEFLUTE", 1], [mon("ODDISH", status: "DROWSY")])
field("Ice Heal on Frostbite", ["UseOnPokemon", "ICEHEAL", 1], [mon("ODDISH", status: "FROSTBITE")])
field("Ice Heal on freeze", ["UseOnPokemon", "ICEHEAL", 1], [mon("ODDISH", status: "FROZEN")])
field("Ice Heal on burn", ["UseOnPokemon", "ICEHEAL", 1], [mon("ODDISH", status: "BURN")])
field("Aspear Berry on Frostbite", ["UseOnPokemon", "ASPEARBERRY", 1], [mon("ODDISH", status: "FROSTBITE")])
# --- Reveal Glass ----------------------------------------------------------------
field("Reveal Glass on Enamorus", ["UseOnPokemon", "REVEALGLASS", 1], [mon("ENAMORUS", 70)])
field("Reveal Glass on Therian Enamorus", ["UseOnPokemon", "REVEALGLASS", 1], [mon("ENAMORUS", 70, form: 1)])
field("Reveal Glass on Tornadus", ["UseOnPokemon", "REVEALGLASS", 1], [mon("TORNADUS", 70)])
field("Reveal Glass on Pikachu", ["UseOnPokemon", "REVEALGLASS", 1], [mon("PIKACHU")])
field("Reveal Glass on a fainted Enamorus", ["UseOnPokemon", "REVEALGLASS", 1], [mon("ENAMORUS", 70, hp: 0)])
# --- Ability Patch -------------------------------------------------------------------
field("Ability Patch to the Hidden Ability", ["UseOnPokemon", "ABILITYPATCH", 1], [mon("BULBASAUR")], answers: { confirm: [true] })
field("Ability Patch from the second ability", ["UseOnPokemon", "ABILITYPATCH", 1], [mon("GASTLY", abilityIndex: 1)],
      answers: { confirm: [true] })
field("Ability Patch back from the Hidden Ability", ["UseOnPokemon", "ABILITYPATCH", 1], [mon("BULBASAUR", abilityIndex: 2)],
      answers: { confirm: [true] })
field("Ability Patch declined", ["UseOnPokemon", "ABILITYPATCH", 1], [mon("BULBASAUR")], answers: { confirm: [false] })
field("Ability Patch on Zygarde", ["UseOnPokemon", "ABILITYPATCH", 1], [mon("ZYGARDE", 60)], answers: { confirm: [true] })
# --- Hopo Berry, Scroll of Waters -----------------------------------------------------
field("Hopo Berry (copy of Ether)", ["UseOnPokemon", "HOPOBERRY", 1],
      [mon("PIKACHU", moves: [["THUNDERSHOCK", 3], ["QUICKATTACK"]])], answers: { move: [0] })
field("Hopo Berry on a full move", ["UseOnPokemon", "HOPOBERRY", 1],
      [mon("PIKACHU", moves: [["THUNDERSHOCK", 3], ["QUICKATTACK"]])], answers: { move: [1] })
field("Leppa Berry", ["UseOnPokemon", "LEPPABERRY", 1], [mon("PIKACHU", moves: [["THUNDERSHOCK", 0]])], answers: { move: [0] })
field("Scroll of Waters on Kubfu", ["UseOnPokemon", "SCROLLOFWATERS", 1], [mon("KUBFU"), mon("PIKACHU")])
field("Scroll of Waters on Pikachu", ["UseOnPokemon", "SCROLLOFWATERS", 1], [mon("PIKACHU")])
# --- ZUD: Z-Crystals --------------------------------------------------------------------
zpika = ->(opts = {}) { mon("PIKACHU", 30, **{ moves: [["THUNDERSHOCK"], ["QUICKATTACK"]] }.merge(opts)) }
field("Electrium Z on Pikachu", ["UseOnPokemon", "ELECTRIUMZ", 1], [zpika.()])
field("Electrium Z on a Pikachu holding it", ["UseOnPokemon", "ELECTRIUMZ", 1], [zpika.(item: "ELECTRIUMZ")])
field("Electrium Z on a Pikachu holding an Oran Berry, switched", ["UseOnPokemon", "ELECTRIUMZ", 1],
      [zpika.(item: "ORANBERRY")], answers: { confirm: [true] })
field("Electrium Z on a Pikachu holding an Oran Berry, not switched", ["UseOnPokemon", "ELECTRIUMZ", 1],
      [zpika.(item: "ORANBERRY")], answers: { confirm: [false] })
field("Electrium Z on a Pikachu holding an Everstone (vowel)", ["UseOnPokemon", "ELECTRIUMZ", 1],
      [zpika.(item: "EVERSTONE")], answers: { confirm: [true] })
field("Firium Z on Pikachu (incompatible), accepted", ["UseOnPokemon", "FIRIUMZ", 1], [zpika.()], answers: { confirm: [true] })
field("Firium Z on Pikachu (incompatible), declined", ["UseOnPokemon", "FIRIUMZ", 1], [zpika.()], answers: { confirm: [false] })
field("Pikanium Z on Pikachu with Volt Tackle", ["UseOnPokemon", "PIKANIUMZ", 1],
      [mon("PIKACHU", 30, moves: [["VOLTTACKLE"]])])
field("Normalium Z on an egg", ["UseOnPokemon", "NORMALIUMZ", 1], [mon("PIKACHU", 1, egg: true)])
# --- ZUD: Dynamax Candy, Max Soup, Max Plumage, Max Scales ----------------------------------
field("Dynamax Candy", ["UseOnPokemon", "DYNAMAXCANDY", 1], [mon("PIKACHU", dynamaxLvl: 3)])
field("Dynamax Candy at level 10", ["UseOnPokemon", "DYNAMAXCANDY", 1], [mon("PIKACHU", dynamaxLvl: 10)])
field("Dynamax Candy XL", ["UseOnPokemon", "DYNAMAXCANDYXL", 1], [mon("PIKACHU", dynamaxLvl: 4)])
field("Dynamax Candy on Eternatus", ["UseOnPokemon", "DYNAMAXCANDY", 1], [mon("ETERNATUS", 60)])
field("Dynamax Candy on Zacian (can't Dynamax)", ["UseOnPokemon", "DYNAMAXCANDY", 1], [mon("ZACIAN", 60)])
field("Dynamax Candy on an egg", ["UseOnPokemon", "DYNAMAXCANDY", 1], [mon("PIKACHU", 1, egg: true)])
field("Max Soup gives G-Max Factor", ["UseOnPokemon", "MAXSOUP", 1], [mon("CHARIZARD", 50)])
field("Max Soup removes G-Max Factor", ["UseOnPokemon", "MAXSOUP", 1], [mon("CHARIZARD", 50, gmaxFactor: true)])
field("Max Soup on Charmander", ["UseOnPokemon", "MAXSOUP", 1], [mon("CHARMANDER", 10)])
field("Max Soup on Eternatus", ["UseOnPokemon", "MAXSOUP", 1], [mon("ETERNATUS", 60)])
field("Max Plumage", ["UseOnPokemon", "MAXPLUMAGE", 1], [mon("MACHOP", iv: { "HP" => 31, "ATTACK" => 10, "SPEED" => 0 })])
field("Max Plumage at max IVs", ["UseOnPokemon", "MAXPLUMAGE", 1], [mon("MACHOP")])
field("Max Plumage on an egg", ["UseOnPokemon", "MAXPLUMAGE", 1], [mon("MACHOP", 1, egg: true)])
field("Max Scales, a move relearned", ["UseOnPokemon", "MAXSCALES", 1],
      [mon("PIKACHU", 30, moves: [["THUNDERSHOCK"]])], answers: { relearn: ["GROWL"] })
field("Max Scales, nothing relearned", ["UseOnPokemon", "MAXSCALES", 1],
      [mon("PIKACHU", 30, moves: [["THUNDERSHOCK"]])], answers: { relearn: [nil] })
field("Max Scales with nothing to recall", ["UseOnPokemon", "MAXSCALES", 1], [mon("MAGIKARP", 5, moves: [["SPLASH"]])])
# --- ZUD: Max Eggs ---------------------------------------------------------------------
field("Max Eggs (8 badges)", ["UseInField", "MAXEGGS"], [mon("PIKACHU", 20), mon("MACHOP", 12), mon("ODDISH", 5, egg: true)])
field("Max Eggs (1 badge)", ["UseInField", "MAXEGGS"], [mon("PIKACHU", 20)], badges: 1)
field("Max Eggs near the max level (Ruby bug: capped Exp. carries over)", ["UseInField", "MAXEGGS"],
      [mon("NINCADA", 99), mon("PIKACHU", 20), mon("MACHOP", 100)])
field("Max Eggs with every Pokémon at the max level", ["UseInField", "MAXEGGS"], [mon("PIKACHU", 100)])
field("Max Eggs with only an egg", ["UseInField", "MAXEGGS"], [mon("PIKACHU", 1, egg: true)])

def run_field(sc)
  $log = []
  $answers = {}
  (sc["answers"] || {}).each { |k, v| $answers[k.to_sym] = v.dup }
  new_player(sc["badges"] || 8)
  $game_map = MAP_STUB
  party = sc["party"].map { |spec| build_pokemon(spec) }
  party.each { |p| $player.party << p }
  kind, item, qty = sc["action"]
  ret = case kind
        when "UseOnPokemon" then ItemHandlers.triggerUseOnPokemon(item.to_sym, qty, party[sc["target"] || 0], PokemonPartyScreen.new)
        when "UseInField" then ItemHandlers.triggerUseInField(item.to_sym)
        end
  { "ret" => ret, "log" => $log, "party" => party.map { |p| pokemon_state(p) }, "bag" => bag_state,
    "stats" => [$stats.total_dynamax_lvls_gained, $stats.total_gmax_factors_given] }
end

#===============================================================================
# Battle helpers (as held_items_reference.rb)
#===============================================================================
class Battle::DebugSceneNoLogging
  def pbDeluxeTriggers(*_a); end
end

class Battle::Battler
  def shadowPokemon?; false; end
  def inHyperMode?; false; end
  def pbHyperMode; end
  def pbHyperModeObedience(_move); true; end
end

$exceptions = []
def pbPrintException(e)
  $exceptions << e.class.name
  $stderr.puts "#{e.class}: #{e.message}\n  #{e.backtrace.first(5).join("\n  ")}" if ENV["VERBOSE"]
end

class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end

class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end

def battler_state(b)
  stages = {}
  GameData::Stat.each_battle { |s| stages[s.id.to_s] = b.stages[s.id] }
  { "index" => b.index, "species" => b.species.to_s, "hp" => b.hp, "totalhp" => b.totalhp, "status" => b.status.to_s,
    "item" => b.item_id&.to_s, "stages" => stages, "speed" => b.pbSpeed }
end

def apply_setup(battle, op)
  b = battle.battlers[op[1]] if op[1].is_a?(Integer)
  case op[0]
  when "hpFraction" then b.hp = [b.totalhp * op[2] / op[3], 1].max
  when "status" then b.status = op[2].to_sym
  when "effect" then b.effects[PBEffects.const_get(op[2])] = op[3]
  when "pp"
    b.moves[op[2]].pp = op[3]
    b.pokemon.moves[op[2]].pp = op[3]
  when "partyStatus" then battle.pbParty(0)[op[1]].status = op[2].to_sym
  when "zMove" then battle.zMove[op[1]][op[2]] = op[3]
  when "dynamaxUsage" then battle.dynamax[op[1]][op[2]] = op[3]
  end
end

def new_battle(sc, random, log)
  scene = Battle::DebugSceneNoLogging.new
  scene.define_singleton_method(:pbDisplayMessage) { |msg, _brief = false| log << msg }
  scene.define_singleton_method(:pbDisplay) { |msg, _brief = false| log << msg }
  scene.define_singleton_method(:pbDisplayPausedMessage) { |msg| log << msg }
  scene.define_singleton_method(:pbDisplayConfirmMessage) { |msg| log << msg; true }
  scene.define_singleton_method(:rand) { |x = 0| random.next(x) }
  p1 = sc["p1"].map { |s| build_pokemon(s, battle: true) }
  p2 = sc["p2"].map { |s| build_pokemon(s, battle: true) }
  battle = Battle.new(scene, p1, p2, $player, nil)
  battle.setBattleMode("double") if sc["double"]
  battle.internalBattle = true
  battle.expGain = false
  battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
  battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
  scene.pbStartBattle(battle)
  battle.pbSetUpSides
  battle
end

#===============================================================================
# Bag (battle use) scenarios
#===============================================================================
# action: ["CanUseInBattle", item, partyIndex, onField, move, firstAction, showMessages]
#         ["BattleUseOnPokemon", item, partyIndex, onField, move]
#         ["UseInBattle", item, battlerIndex]
# The Pokémon is the player's party[partyIndex]; onField: pass its battler.
BAG = []
def bag(name, action, opts = {})
  BAG << { "name" => name, "action" => action, "p1" => [mon("ODDISH")], "p2" => [mon("PIDGEY")] }
    .merge(opts.transform_keys(&:to_s))
end

drowsy = [["status", 0, "DROWSY"]]
bag("CanUseInBattle Awakening on Drowsy (Ruby bug: message, then true)", ["CanUseInBattle", "AWAKENING", 0, true, nil, true, true],
    setup: drowsy)
bag("CanUseInBattle Awakening on Drowsy, no messages", ["CanUseInBattle", "AWAKENING", 0, true, nil, true, false], setup: drowsy)
bag("CanUseInBattle Awakening on sleep", ["CanUseInBattle", "AWAKENING", 0, true, nil, true, true], setup: [["status", 0, "SLEEP"]])
bag("CanUseInBattle Awakening on a healthy Pokémon", ["CanUseInBattle", "AWAKENING", 0, true, nil, true, true])
bag("CanUseInBattle Chesto Berry on a Drowsy party Pokémon", ["CanUseInBattle", "CHESTOBERRY", 1, false, nil, true, false],
    p1: [mon("ODDISH"), mon("BELLSPROUT")], setup: [["partyStatus", 1, "DROWSY"]])
bag("CanUseInBattle Blue Flute on Drowsy", ["CanUseInBattle", "BLUEFLUTE", 0, true, nil, true, false], setup: drowsy)
bag("CanUseInBattle Blue Flute vs Soundproof", ["CanUseInBattle", "BLUEFLUTE", 0, true, nil, true, true],
    p1: [mon("ODDISH", ability: "SOUNDPROOF")], setup: drowsy)
bag("BattleUseOnPokemon Awakening on a Drowsy battler", ["BattleUseOnPokemon", "AWAKENING", 0, true, nil], setup: drowsy)
bag("BattleUseOnPokemon Awakening on a sleeping battler", ["BattleUseOnPokemon", "AWAKENING", 0, true, nil],
    setup: [["status", 0, "SLEEP"]])
bag("BattleUseOnPokemon Chesto Berry on a Drowsy party Pokémon", ["BattleUseOnPokemon", "CHESTOBERRY", 1, false, nil],
    p1: [mon("ODDISH"), mon("BELLSPROUT")], setup: [["partyStatus", 1, "DROWSY"]])
bag("BattleUseOnPokemon Blue Flute on a Drowsy battler", ["BattleUseOnPokemon", "BLUEFLUTE", 0, true, nil], setup: drowsy)
bag("CanUseInBattle Poké Flute with no one asleep", ["CanUseInBattle", "POKEFLUTE", 0, true, nil, true, true])
bag("CanUseInBattle Poké Flute with a Drowsy foe", ["CanUseInBattle", "POKEFLUTE", 0, true, nil, true, true],
    setup: [["status", 1, "DROWSY"]])
bag("CanUseInBattle Poké Flute with only a Soundproof sleeper", ["CanUseInBattle", "POKEFLUTE", 0, true, nil, true, true],
    p2: [mon("PIDGEY", ability: "SOUNDPROOF")], setup: [["status", 1, "SLEEP"]])
bag("UseInBattle Poké Flute", ["UseInBattle", "POKEFLUTE", 0], double: true,
    p1: [mon("ODDISH"), mon("BELLSPROUT", ability: "SOUNDPROOF")], p2: [mon("PIDGEY"), mon("RATTATA")],
    setup: [["status", 0, "DROWSY"], ["status", 1, "SLEEP"], ["status", 2, "SLEEP"], ["status", 3, "BURN"]])
frost = [["status", 0, "FROSTBITE"]]
bag("CanUseInBattle Ice Heal on Frostbite (Ruby bug: message, then true)", ["CanUseInBattle", "ICEHEAL", 0, true, nil, true, true],
    setup: frost)
bag("CanUseInBattle Ice Heal on freeze", ["CanUseInBattle", "ICEHEAL", 0, true, nil, true, true], setup: [["status", 0, "FROZEN"]])
bag("CanUseInBattle Aspear Berry on a healthy Pokémon", ["CanUseInBattle", "ASPEARBERRY", 0, true, nil, true, true])
bag("BattleUseOnPokemon Ice Heal on a Frostbitten battler", ["BattleUseOnPokemon", "ICEHEAL", 0, true, nil], setup: frost)
bag("BattleUseOnPokemon Aspear Berry on a frozen battler", ["BattleUseOnPokemon", "ASPEARBERRY", 0, true, nil],
    setup: [["status", 0, "FROZEN"]])
bag("BattleUseOnPokemon Aspear Berry on a Frostbitten party Pokémon", ["BattleUseOnPokemon", "ASPEARBERRY", 1, false, nil],
    p1: [mon("ODDISH"), mon("BELLSPROUT")], setup: [["partyStatus", 1, "FROSTBITE"]])
pp_p1 = [mon("PIKACHU", moves: [["THUNDERSHOCK", 2], ["QUICKATTACK"]])]
bag("CanUseInBattle Hopo Berry (copy of Ether) on a used move", ["CanUseInBattle", "HOPOBERRY", 0, true, 0, true, true], p1: pp_p1)
bag("CanUseInBattle Hopo Berry on a full move", ["CanUseInBattle", "HOPOBERRY", 0, true, 1, true, true], p1: pp_p1)
bag("BattleUseOnPokemon Hopo Berry", ["BattleUseOnPokemon", "HOPOBERRY", 0, true, 0], p1: pp_p1)
bag("CanUseInBattle Z-Booster without a Z-Ring", ["CanUseInBattle", "ZBOOSTER", 0, true, nil, true, true])
bag("CanUseInBattle Z-Booster, Z-Move not used yet", ["CanUseInBattle", "ZBOOSTER", 0, true, nil, true, true], bag: [["ZRING", 1]])
bag("CanUseInBattle Z-Booster, not the first action", ["CanUseInBattle", "ZBOOSTER", 0, true, nil, false, true], bag: [["ZRING", 1]])
bag("CanUseInBattle Z-Booster after a Z-Move", ["CanUseInBattle", "ZBOOSTER", 0, true, nil, true, true], bag: [["ZRING", 1]],
    setup: [["zMove", 0, 0, 0]])
bag("UseInBattle Z-Booster", ["UseInBattle", "ZBOOSTER", 0], bag: [["ZRING", 1]], setup: [["zMove", 0, 0, 0]])
bag("CanUseInBattle Wishing Star without a Dynamax Band", ["CanUseInBattle", "WISHINGSTAR", 0, true, nil, true, true])
bag("CanUseInBattle Wishing Star, Dynamax not used yet", ["CanUseInBattle", "WISHINGSTAR", 0, true, nil, true, false],
    bag: [["DYNAMAXBAND", 1]])
bag("CanUseInBattle Wishing Star after Dynamaxing", ["CanUseInBattle", "WISHINGSTAR", 0, true, nil, true, true],
    bag: [["DYNAMAXBAND", 1]], setup: [["dynamaxUsage", 0, 0, 0]])
bag("UseInBattle Wishing Star", ["UseInBattle", "WISHINGSTAR", 0], bag: [["DYNAMAXBAND", 1]], setup: [["dynamaxUsage", 0, 0, 0]])

# The Bag/party scene the battle-use handlers get.
class StubBagScene
  def pbDisplay(text)
    $log << ["display", text]
    nil
  end

  def pbRefresh
    $log << ["refresh"]
    nil
  end
end

def run_bag(sc, start)
  random = SeqRandom.new(start)
  battle_log = []
  $log = []
  new_player
  (sc["bag"] || []).each { |item, qty| $bag.add(item.to_sym, qty) }
  battle = new_battle(sc, random, battle_log)
  (sc["setup"] || []).each { |op| apply_setup(battle, op) }
  scene = StubBagScene.new
  kind, item, *args = sc["action"]
  item = item.to_sym
  ret = case kind
        when "CanUseInBattle"
          idx_party, on_field, move, first_action, show_messages = args
          pkmn = battle.pbParty(0)[idx_party]
          battler = on_field ? battle.pbFindBattler(idx_party, 0) : nil
          ItemHandlers.triggerCanUseInBattle(item, pkmn, battler, move, first_action, battle, scene, show_messages)
        when "BattleUseOnPokemon"
          idx_party, on_field, move = args
          pkmn = battle.pbParty(0)[idx_party]
          battler = on_field ? battle.pbFindBattler(idx_party, 0) : nil
          ItemHandlers.triggerBattleUseOnPokemon(item, pkmn, battler, [:UseItem, item, idx_party, move], scene)
        when "UseInBattle"
          ItemHandlers.triggerUseInBattle(item, battle.battlers[args[0]], battle)
        end
  { "ret" => ret ? true : false, "log" => $log, "battleLog" => battle_log,
    "battlers" => battle.battlers.compact.map { |b| battler_state(b) },
    "party" => battle.pbParty(0).map { |p| [p.status.to_s, p.moves.map(&:pp)] },
    "zMove" => battle.zMove, "dynamax" => battle.dynamax }
end

#===============================================================================
# Held item scenarios (scripted battles, as held_items_reference.rb)
#===============================================================================
def hmon(species, item, moves, level: 50, **rest)
  { "species" => species, "level" => level, "item" => item, "moves" => moves }.merge(rest.transform_keys(&:to_s))
end

HELD = [
  { "name" => "Lum Berry cures Drowsy",
    "p1" => [hmon("MEW", "LUMBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["SPLASH"])],
    "setup" => [["status", 0, "DROWSY"]], "turns" => [[[0], [0]]] },
  { "name" => "Lum Berry cures Frostbite",
    "p1" => [hmon("MEW", "LUMBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["SPLASH"])],
    "setup" => [["status", 0, "FROSTBITE"]], "turns" => [[[0], [0]]] },
  { "name" => "Lum Berry cures confusion",
    "p1" => [hmon("MEW", "LUMBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["CONFUSERAY"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Chesto Berry cures Drowsy",
    "p1" => [hmon("MEW", "CHESTOBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["SPLASH"])],
    "setup" => [["status", 0, "DROWSY"]], "turns" => [[[0], [0]]] },
  { "name" => "Chesto Berry cures sleep",
    "p1" => [hmon("MEW", "CHESTOBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["SPLASH"])],
    "setup" => [["status", 0, "SLEEP"]], "turns" => [[[0], [0]]] },
  { "name" => "Chesto Berry vs a sleep move (Drowsy in Gen 9)",
    "p1" => [hmon("MEW", "CHESTOBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["HYPNOSIS"])],
    "turns" => [[[0], [0]]] * 3 },
  { "name" => "Aspear Berry cures Frostbite",
    "p1" => [hmon("MEW", "ASPEARBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["SPLASH"])],
    "setup" => [["status", 0, "FROSTBITE"]], "turns" => [[[0], [0]]] },
  { "name" => "Aspear Berry cures freeze",
    "p1" => [hmon("MEW", "ASPEARBERRY", ["SPLASH"])], "p2" => [hmon("MEW", nil, ["SPLASH"])],
    "setup" => [["status", 0, "FROZEN"]], "turns" => [[[0], [0]]] },
  { "name" => "Red Card vs Guard Dog",
    "p1" => [hmon("PIKACHU", nil, ["TACKLE"], ability: "GUARDDOG"), hmon("JOLTEON", nil, ["TACKLE"])],
    "p2" => [hmon("SNORLAX", "REDCARD", ["SPLASH"])], "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Red Card vs Suction Cups",
    "p1" => [hmon("PIKACHU", nil, ["TACKLE"], ability: "SUCTIONCUPS"), hmon("JOLTEON", nil, ["TACKLE"])],
    "p2" => [hmon("SNORLAX", "REDCARD", ["SPLASH"])], "turns" => [[[0], [0]]] },
  { "name" => "Quick Claw with Mycelium Might and a status move",
    "p1" => [hmon("TOEDSCOOL", "QUICKCLAW", ["GROWL", "TACKLE"], ability: "MYCELIUMMIGHT")],
    "p2" => [hmon("JOLTEON", nil, ["TACKLE"])],
    "turns" => [[[0], [0]], [[0], [0]], [[1], [0]], [[1], [0]], [[0], [0]], [[1], [0]]] },
  { "name" => "Quick Claw",
    "p1" => [hmon("SNORLAX", "QUICKCLAW", ["TACKLE"])], "p2" => [hmon("JOLTEON", nil, ["TACKLE"])],
    "turns" => [[[0], [0]]] * 6 },
  { "name" => "Mirror Herb copies Swords Dance",
    "p1" => [hmon("SCIZOR", nil, ["SWORDSDANCE"])], "p2" => [hmon("SNORLAX", "MIRRORHERB", ["SPLASH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Mirror Herb copies Dragon Dance (two stats)",
    "p1" => [hmon("DRAGONITE", nil, ["DRAGONDANCE"])], "p2" => [hmon("SNORLAX", "MIRRORHERB", ["SPLASH"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Mirror Herb at +6",
    "p1" => [hmon("SCIZOR", nil, ["SWORDSDANCE"])], "p2" => [hmon("SNORLAX", "MIRRORHERB", ["SPLASH"])],
    "setup" => [["stage", 1, "ATTACK", 6]], "turns" => [[[0], [0]]] },
  { "name" => "Clear Amulet vs Growl and Screech",
    "p1" => [hmon("MEW", nil, ["GROWL", "SCREECH"])], "p2" => [hmon("SNORLAX", "CLEARAMULET", ["SPLASH"])],
    "turns" => [[[0], [0]], [[1], [0]]] },
  { "name" => "Clear Amulet vs Intimidate",
    "p1" => [hmon("GYARADOS", nil, ["SPLASH"], ability: "INTIMIDATE")], "p2" => [hmon("SNORLAX", "CLEARAMULET", ["SPLASH"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Punching Glove vs no item",
    "p1" => [hmon("MACHAMP", "PUNCHINGGLOVE", ["MACHPUNCH", "TACKLE"])], "p2" => [hmon("MACHAMP", nil, ["MACHPUNCH"])],
    "turns" => [[[0], [0]], [[1], [0]]] },
  { "name" => "Griseous Core",
    "p1" => [hmon("GIRATINA", "GRISEOUSCORE", ["DRAGONCLAW"], level: 70)], "p2" => [hmon("GIRATINA", nil, ["DRAGONCLAW"], level: 70)],
    "turns" => [[[0], [0]]] },
  { "name" => "Adamant Crystal",
    "p1" => [hmon("DIALGA", "ADAMANTCRYSTAL", ["DRAGONCLAW"], level: 70)], "p2" => [hmon("DIALGA", nil, ["DRAGONCLAW"], level: 70)],
    "turns" => [[[0], [0]]] },
  { "name" => "Lustrous Globe",
    "p1" => [hmon("PALKIA", "LUSTROUSGLOBE", ["DRAGONCLAW"], level: 70)], "p2" => [hmon("PALKIA", nil, ["DRAGONCLAW"], level: 70)],
    "turns" => [[[0], [0]]] },
  { "name" => "Blank Plate (copy of Silk Scarf)",
    "p1" => [hmon("SNORLAX", "BLANKPLATE", ["TACKLE"])], "p2" => [hmon("SNORLAX", nil, ["TACKLE"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Hopo Berry (copy of Leppa Berry)",
    "p1" => [hmon("MEW", "HOPOBERRY", ["SPLASH", "TACKLE"])], "p2" => [hmon("SNORLAX", nil, ["SPLASH"])],
    "setup" => [["pp", 0, 0, 1]], "turns" => [[[0], [0]], [[0], [0]]] },
]

def run_held(sc, start)
  random = SeqRandom.new(start)
  log = []
  new_player
  battle = new_battle(sc, random, log)
  (sc["setup"] || []).each do |op|
    if op[0] == "stage"
      battle.battlers[op[1]].stages[op[2].to_sym] = op[3]
    else
      apply_setup(battle, op)
    end
  end
  rounds = []
  snapshot = lambda do |error = nil|
    r = { "messages" => log.dup, "battlers" => battle.battlers.compact.map { |b| battler_state(b) },
          "decision" => battle.decision }
    r["error"] = error if error
    r["error"] ||= $exceptions.join(",") if !$exceptions.empty?
    $exceptions.clear
    rounds << r
    log.clear
  end
  begin
    battle.pbOnAllBattlersEnteringBattle
    snapshot.call
    sc["turns"].each do |turn|
      break if battle.decision > 0
      turn.each_with_index do |(idx_move, idx_target), i|
        b = battle.battlers[i]
        next if !b || b.fainted?
        next if !battle.pbCanShowCommands?(i)
        battle.pbClearChoice(i)
        next if !battle.pbRegisterMove(i, idx_move, false)
        move = battle.choices[i][2]
        if move.pbTarget(b).num_targets == 1
          idx_target ||= battle.battlers.each_index.find { |j| battle.battlers[j] && b.opposes?(j) }
          battle.pbRegisterTarget(i, idx_target)
        end
      end
      battle.pbAttackPhase
      battle.pbEndOfRoundPhase if battle.decision == 0
      battle.instance_variable_set(:@turnCount, battle.turnCount + 1)
      snapshot.call
    end
  rescue StandardError => e
    $stderr.puts "#{sc['name']}: #{e.class}: #{e.message}\n  #{e.backtrace.first(4).join("\n  ")}"
    snapshot.call(e.class.name)
  end
  rounds
end

#===============================================================================
# Output
#===============================================================================
def jsonable(value)
  case value
  when Symbol then value.to_s
  when Hash then value.map { |k, v| [k.to_s, jsonable(v)] }.to_h
  when Array then value.map { |v| jsonable(v) }
  else value
  end
end

def guarded(name)
  jsonable(yield)
rescue StandardError => e
  $stderr.puts "#{name}: #{e.class}: #{e.message}\n  #{e.backtrace.first(4).join("\n  ")}"
  { "error" => "#{e.class}: #{e.message}", "log" => jsonable($log) }
end

out = {
  "field" => FIELD.map { |sc| { "setup" => sc, "result" => guarded(sc["name"]) { run_field(sc) } } },
  "bag" => BAG.each_with_index.map do |sc, i|
    start = i * 1000
    { "setup" => sc.merge("randomStart" => start), "result" => guarded(sc["name"]) { run_bag(sc, start) } }
  end,
  "held" => HELD.each_with_index.map do |sc, i|
    start = i * 1000
    sc.merge("randomStart" => start, "rounds" => jsonable(run_held(sc, start)))
  end,
}

path = File.join(ROOT, "web", "src", "battle", "items", "pluginItemsReference.json")
File.write(path, JSON.pretty_generate(out) + "\n")
puts "Wrote #{out['field'].length} field, #{out['bag'].length} bag and #{out['held'].length} held item scenarios to " \
     "#{path.sub(ROOT + '/', '')}"
