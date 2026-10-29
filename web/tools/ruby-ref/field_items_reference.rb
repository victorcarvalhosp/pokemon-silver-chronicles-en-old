# Runs the game's real overworld item handlers (Data/Scripts/013_Items/
# 002_Item_Effects.rb, with 001_Item_Utilities.rb and the v20.1 Hotfixes'
# pbChangeLevel) headless on fixed scenarios and writes
# web/src/game/items/fieldItemsReference.json, which
# web/src/game/items/fieldItems.test.ts replays against the TypeScript port.
#
#   cd web && ruby tools/ruby-ref/field_items_reference.rb
#
# Each scenario is written out with its setup (party, Bag, overworld state,
# the answers the stub scene gives) so the TS test builds exactly the same
# state. The screens and overworld engine the handlers touch are stubs that
# record what they're asked to do: the party screen (pbDisplay, pbConfirm,
# pbChooseMove, ...), pbMessage/pbConfirmMessage, pbTopRightWindow, the
# evolution scene, $game_map/$game_player/$PokemonGlobal/$PokemonMap.
#
# 002_Item_Effects.rb is evaluated after Essentials.load!, so it replaces the
# Generation 9 Pack's re-registrations of AWAKENING/ICEHEAL/REVEALGLASS/
# ABILITYPATCH: this reference is 002 itself, which is what Item_Effects.ts ports.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_code(code, path)
  TOPLEVEL_BINDING.eval(code, path)
end

item_effects = File.join(SCRIPTS, "013_Items", "002_Item_Effects.rb")
eval_game_code(File.read(item_effects, encoding: "UTF-8"), item_effects)

# v20.1 Hotfixes' pbChangeLevel (Misc bug fixes.rb:102). The rest of that file
# patches UI classes that aren't loaded headless, so only this method is taken.
hotfixes = File.join(PLUGINS, "v20.1 Hotfixes", "Misc bug fixes.rb")
change_level = File.read(hotfixes, encoding: "UTF-8")[/^def pbChangeLevel\(.*?^end\r?$/m]
raise "pbChangeLevel not found in #{hotfixes}" if !change_level
eval_game_code(change_level, hotfixes)

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

# The party screen (PokemonPartyScreen) as the item handlers use it.
class PokemonPartyScreen
  class StubScene
    def pbSetHelpText(text)
      $log << ["helpText", text]
    end
  end

  attr_reader :scene

  def initialize
    @scene = StubScene.new
  end

  def pbDisplay(text)
    $log << ["display", text]
  end

  def pbConfirm(text)
    ret = next_answer(:confirm, false)
    $log << ["sceneConfirm", text, ret]
    ret
  end

  def pbRefresh
    $log << ["refresh"]
  end

  def pbHardRefresh
    $log << ["hardRefresh"]
  end

  def pbUpdate; end

  def pbChooseMove(_pkmn, helptext, _index = 0)
    ret = next_answer(:move, 0)
    $log << ["chooseMove", helptext, ret]
    ret
  end

  def pbShowCommands(helptext, commands, index = 0)
    ret = next_answer(:command, -1)
    $log << ["commands", helptext, commands, index, ret]
    ret
  end

  def pbChoosePokemon(helptext = nil)
    ret = next_answer(:pokemon, -1)
    $log << ["choosePokemon", helptext, ret]
    ret
  end

  def pbRefreshAnnotations(able_proc)
    $log << ["refreshAnnotations", $player.party.map { |p| able_proc.call(p) ? true : false }]
  end

  def pbClearAnnotations; end
end

class Game_Temp
  attr_accessor :fly_destination
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

class StubGlobal
  attr_accessor :repel, :escapePoint, :bicycle, :surfing, :diving
  def initialize
    @repel = 0
    @escapePoint = []
    @bicycle = false
    @surfing = false
    @diving = false
  end
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

class StubPokemonMap
  attr_accessor :blackFluteUsed, :whiteFluteUsed
  def initialize
    @blackFluteUsed = false
    @whiteFluteUsed = false
  end
end

StubEvent = Struct.new(:id, :name, :x, :y)

class StubMap
  attr_accessor :map_id, :events, :passable
  def initialize(map_id, passable, events)
    @map_id = map_id
    @passable = passable
    @events = events
  end
  def passable?(_x, _y, _d, _self_event = nil); @passable; end
  def metadata; GameData::MapMetadata.try_get(@map_id); end
  def autoplay; end
  def refresh; end
end

class StubPlayer
  attr_accessor :x, :y, :direction, :can_transfer, :terrain, :facing_terrain
  def can_map_transfer_with_follower?; @can_transfer; end
  def can_ride_vehicle_with_follower?; @can_transfer; end
  def pbTerrainTag(_count_bridge = false); GameData::TerrainTag.get(@terrain); end
  def terrain_tag; GameData::TerrainTag.get(@terrain); end
  def pbFacingTerrainTag(_dir = nil); GameData::TerrainTag.get(@facing_terrain); end
  def turn_down; @direction = 2; end
  def turn_left; @direction = 4; end
  def turn_right; @direction = 6; end
  def turn_up; @direction = 8; end
  def turn_right_90
    case @direction
    when 2 then turn_left
    when 4 then turn_up
    when 6 then turn_down
    when 8 then turn_right
    end
  end
end

#===============================================================================
# Scenarios
#===============================================================================
# A Pokémon: species, level and anything to change from the defaults (all IVs
# 31, EVs 0, Hardy, ability index 0, no item, happiness 70, obtained on map 0,
# in a Poké Ball, its default moves).
def mon(species, level, opts = {})
  { species: species, level: level }.merge(opts)
end

SCENARIOS = []

# action: [handler, item, qty]; opts: party, target, bag, global, map, player, coins, answers
def scenario(name, action, opts = {})
  SCENARIOS << { name: name, action: action }.merge(opts)
end

hurt = ->(species, level, loss, extra = {}) { mon(species, level, { hpLoss: loss }.merge(extra)) }

# --- HP items -----------------------------------------------------------------
scenario("Potion on a hurt Pokémon", ["UseOnPokemon", :POTION, 1], party: [hurt.(:CHARMANDER, 20, 30)])
scenario("Potion restores only the missing HP", ["UseOnPokemon", :POTION, 1], party: [hurt.(:CHARMANDER, 20, 5)])
scenario("Potion on full HP", ["UseOnPokemon", :POTION, 1], party: [mon(:CHARMANDER, 20)])
scenario("Potion on a fainted Pokémon", ["UseOnPokemon", :POTION, 1], party: [mon(:CHARMANDER, 20, hp: 0)])
scenario("Super Potion", ["UseOnPokemon", :SUPERPOTION, 1], party: [hurt.(:SNORLAX, 60, 100)])
scenario("Hyper Potion", ["UseOnPokemon", :HYPERPOTION, 1], party: [hurt.(:SNORLAX, 60, 200)])
scenario("Max Potion", ["UseOnPokemon", :MAXPOTION, 1], party: [hurt.(:SNORLAX, 60, 250)])
scenario("Fresh Water", ["UseOnPokemon", :FRESHWATER, 1], party: [hurt.(:SNORLAX, 60, 100)])
scenario("Berry Juice (copy of Potion)", ["UseOnPokemon", :BERRYJUICE, 1], party: [hurt.(:PIKACHU, 30, 40)])
scenario("Sitrus Berry", ["UseOnPokemon", :SITRUSBERRY, 1], party: [hurt.(:PIKACHU, 30, 60)])
scenario("Rage Candy Bar cures status (gen 7+)", ["UseOnPokemon", :RAGECANDYBAR, 1],
         party: [hurt.(:PIKACHU, 30, 20, status: :BURN)])
scenario("Energy Powder lowers happiness", ["UseOnPokemon", :ENERGYPOWDER, 1], party: [hurt.(:PIKACHU, 30, 60)])
scenario("Energy Root on full HP", ["UseOnPokemon", :ENERGYROOT, 1], party: [mon(:PIKACHU, 30)])

# --- Revives ------------------------------------------------------------------
scenario("Revive on a fainted Pokémon", ["UseOnPokemon", :REVIVE, 1], party: [mon(:GEODUDE, 25, hp: 0)])
scenario("Revive on a healthy Pokémon", ["UseOnPokemon", :REVIVE, 1], party: [mon(:GEODUDE, 25)])
scenario("Max Revive", ["UseOnPokemon", :MAXREVIVE, 1], party: [mon(:GEODUDE, 25, hp: 0)])
scenario("Revival Herb", ["UseOnPokemon", :REVIVALHERB, 1], party: [mon(:GEODUDE, 25, hp: 0)])
scenario("Revival Herb on a healthy Pokémon", ["UseOnPokemon", :REVIVALHERB, 1], party: [hurt.(:GEODUDE, 25, 3)])

# --- Status heals ---------------------------------------------------------------
scenario("Full Heal on poison", ["UseOnPokemon", :FULLHEAL, 1], party: [mon(:ODDISH, 15, status: :POISON)])
scenario("Full Heal on a healthy Pokémon", ["UseOnPokemon", :FULLHEAL, 1], party: [mon(:ODDISH, 15)])
scenario("Full Heal on a fainted Pokémon", ["UseOnPokemon", :FULLHEAL, 1], party: [mon(:ODDISH, 15, hp: 0)])
scenario("Lum Berry on freeze", ["UseOnPokemon", :LUMBERRY, 1], party: [mon(:ODDISH, 15, status: :FROZEN)])
scenario("Antidote on poison", ["UseOnPokemon", :ANTIDOTE, 1], party: [mon(:ODDISH, 15, status: :POISON)])
scenario("Antidote on burn", ["UseOnPokemon", :ANTIDOTE, 1], party: [mon(:ODDISH, 15, status: :BURN)])
scenario("Awakening on sleep", ["UseOnPokemon", :AWAKENING, 1], party: [mon(:ODDISH, 15, status: :SLEEP)])
scenario("Awakening on paralysis", ["UseOnPokemon", :AWAKENING, 1], party: [mon(:ODDISH, 15, status: :PARALYSIS)])
scenario("Chesto Berry on sleep", ["UseOnPokemon", :CHESTOBERRY, 1], party: [mon(:ODDISH, 15, status: :SLEEP)])
scenario("Burn Heal on burn", ["UseOnPokemon", :BURNHEAL, 1], party: [mon(:ODDISH, 15, status: :BURN)])
scenario("Paralyze Heal on paralysis", ["UseOnPokemon", :PARALYZEHEAL, 1], party: [mon(:ODDISH, 15, status: :PARALYSIS)])
scenario("Ice Heal on freeze", ["UseOnPokemon", :ICEHEAL, 1], party: [mon(:ODDISH, 15, status: :FROZEN)])
scenario("Heal Powder on poison", ["UseOnPokemon", :HEALPOWDER, 1], party: [mon(:ODDISH, 15, status: :POISON)])
scenario("Full Restore on hurt and poisoned", ["UseOnPokemon", :FULLRESTORE, 1],
         party: [hurt.(:ODDISH, 15, 12, status: :POISON)])
scenario("Full Restore on full HP and burned", ["UseOnPokemon", :FULLRESTORE, 1], party: [mon(:ODDISH, 15, status: :BURN)])
scenario("Full Restore on full HP and healthy", ["UseOnPokemon", :FULLRESTORE, 1], party: [mon(:ODDISH, 15)])
scenario("Full Restore on a fainted Pokémon", ["UseOnPokemon", :FULLRESTORE, 1], party: [mon(:ODDISH, 15, hp: 0)])

# --- PP items -------------------------------------------------------------------
pp_mon = ->(moves) { mon(:PIKACHU, 30, moves: moves) }
scenario("Ether on a used move", ["UseOnPokemon", :ETHER, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 3], [:QUICKATTACK, 30]])], answers: { move: [0] })
scenario("Ether restores up to the total", ["UseOnPokemon", :ETHER, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 3], [:THUNDERBOLT, 12]])], answers: { move: [1] })
scenario("Ether on a full move", ["UseOnPokemon", :ETHER, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 3], [:QUICKATTACK]])], answers: { move: [1] })
scenario("Ether cancelled", ["UseOnPokemon", :ETHER, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 3]])], answers: { move: [-1] })
scenario("Leppa Berry (copy of Ether)", ["UseOnPokemon", :LEPPABERRY, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 0]])], answers: { move: [0] })
scenario("Max Ether", ["UseOnPokemon", :MAXETHER, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 3, 2]])], answers: { move: [0] })
scenario("Elixir", ["UseOnPokemon", :ELIXIR, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 3], [:THUNDERBOLT, 10], [:QUICKATTACK]])])
scenario("Elixir with every move full", ["UseOnPokemon", :ELIXIR, 1], party: [pp_mon.([[:THUNDERSHOCK], [:QUICKATTACK]])])
scenario("Max Elixir", ["UseOnPokemon", :MAXELIXIR, 1],
         party: [pp_mon.([[:THUNDERSHOCK, 3, 1], [:THUNDERBOLT, 0], [:QUICKATTACK, 29]])])
scenario("PP Up", ["UseOnPokemon", :PPUP, 1], party: [pp_mon.([[:THUNDERSHOCK, 20], [:THUNDERBOLT, 7, 1]])],
         answers: { move: [1] })
scenario("PP Up at 3 boosts", ["UseOnPokemon", :PPUP, 1], party: [pp_mon.([[:THUNDERSHOCK, 20, 3]])], answers: { move: [0] })
scenario("PP Up on a 1 PP move", ["UseOnPokemon", :PPUP, 1], party: [mon(:SMEARGLE, 30, moves: [[:SKETCH]])],
         answers: { move: [0] })
scenario("PP Up cancelled", ["UseOnPokemon", :PPUP, 1], party: [pp_mon.([[:THUNDERSHOCK]])], answers: { move: [-1] })
scenario("PP Max", ["UseOnPokemon", :PPMAX, 1], party: [pp_mon.([[:THUNDERSHOCK, 20, 1]])], answers: { move: [0] })

# --- Vitamins, feathers ---------------------------------------------------------
scenario("HP Up", ["UseOnPokemon", :HPUP, 1], party: [mon(:MACHOP, 30)])
scenario("Protein x3", ["UseOnPokemon", :PROTEIN, 3], party: [mon(:MACHOP, 30)])
scenario("Calcium x2 from 95 (no 100 cap in gen 8)", ["UseOnPokemon", :CALCIUM, 2], party: [mon(:MACHOP, 30, ev: { SPECIAL_ATTACK: 95 })])
scenario("Iron x3 near 252", ["UseOnPokemon", :IRON, 3], party: [mon(:MACHOP, 30, ev: { DEFENSE: 245 })])
scenario("Zinc at 252", ["UseOnPokemon", :ZINC, 1], party: [mon(:MACHOP, 30, ev: { SPECIAL_DEFENSE: 252 })])
scenario("Carbos x2 near 510 total", ["UseOnPokemon", :CARBOS, 2],
         party: [mon(:MACHOP, 30, ev: { HP: 252, ATTACK: 252, SPEED: 1 })])
scenario("Carbos at 510 total", ["UseOnPokemon", :CARBOS, 1], party: [mon(:MACHOP, 30, ev: { HP: 252, ATTACK: 252, DEFENSE: 6 })])
scenario("Health Feather x5", ["UseOnPokemon", :HEALTHFEATHER, 5], party: [mon(:MACHOP, 30, ev: { HP: 250 })])
scenario("Swift Wing (copy)", ["UseOnPokemon", :SWIFTWING, 2], party: [mon(:MACHOP, 30)])

[
  [:HPUP, {}], [:HPUP, { ev: { HP: 95 } }], [:PROTEIN, { ev: { ATTACK: 250 } }], [:CARBOS, { ev: { HP: 252, ATTACK: 252, SPEED: 1 } }],
  [:ZINC, { ev: { SPECIAL_DEFENSE: 252 } }], [:HEALTHFEATHER, {}], [:SWIFTWING, { ev: { SPEED: 200 } }],
  [:RARECANDY, {}], [:EXPCANDYXS, {}], [:EXPCANDYM, {}], [:EXPCANDYXL, {}], [:POTION, {}],
  [:POMEGBERRY, { ev: { HP: 95 } }], [:POMEGBERRY, { happiness: 0 }], [:KELPSYBERRY, { happiness: 250 }],
  [:TAMATOBERRY, { happiness: 120, pokeBall: :LUXURYBALL }], [:GREPABERRY, { happiness: 90, item: :SOOTHEBELL, obtainMap: 5 }],
  [:HONDEWBERRY, { happiness: 255, ev: { SPECIAL_ATTACK: 41 } }],
].each do |item, opts|
  scenario("UseOnPokemonMaximum #{item} #{opts}", ["UseOnPokemonMaximum", item, 1], party: [mon(:MACHOP, 30, opts)])
end

# --- EV-lowering berries ---------------------------------------------------------
scenario("Pomeg Berry x2", ["UseOnPokemon", :POMEGBERRY, 2], party: [mon(:MACHOP, 30, ev: { HP: 25 })])
scenario("Pomeg Berry with no EVs", ["UseOnPokemon", :POMEGBERRY, 1], party: [mon(:MACHOP, 30, happiness: 100)])
scenario("Kelpsy Berry at max happiness", ["UseOnPokemon", :KELPSYBERRY, 1], party: [mon(:MACHOP, 30, happiness: 255, ev: { ATTACK: 30 })])
scenario("Qualot Berry with nothing to do", ["UseOnPokemon", :QUALOTBERRY, 1], party: [mon(:MACHOP, 30, happiness: 255)])
scenario("Tamato Berry x3 with bonuses", ["UseOnPokemon", :TAMATOBERRY, 3],
         party: [mon(:MACHOP, 30, happiness: 195, ev: { SPEED: 12 }, pokeBall: :LUXURYBALL, item: :SOOTHEBELL, obtainMap: 5)])

# --- Rare Candy, Exp. Candy -------------------------------------------------------
scenario("Rare Candy x1 (learns Quick Attack)", ["UseOnPokemon", :RARECANDY, 1],
         party: [mon(:CYNDAQUIL, 12, moves: [[:TACKLE], [:LEER]])])
scenario("Rare Candy x5 (learns, then evolves)", ["UseOnPokemon", :RARECANDY, 5],
         party: [mon(:CYNDAQUIL, 9, moves: [[:TACKLE], [:LEER], [:SMOKESCREEN]])])
scenario("Rare Candy with 4 moves (declines to forget)", ["UseOnPokemon", :RARECANDY, 1],
         party: [mon(:MAGNEMITE, 11, moves: [[:TACKLE], [:THUNDERSHOCK], [:SUPERSONIC], [:THUNDERWAVE]])])
scenario("Rare Candy at level 100", ["UseOnPokemon", :RARECANDY, 1], party: [mon(:PIKACHU, 100)])
scenario("Rare Candy at level 100 that can evolve", ["UseOnPokemon", :RARECANDY, 1], party: [mon(:CHARMANDER, 100)])
scenario("Rare Candy on a fainted Shedinja (Hotfixes)", ["UseOnPokemon", :RARECANDY, 1], party: [mon(:SHEDINJA, 20, hp: 0)])
scenario("Exp. Candy S", ["UseOnPokemon", :EXPCANDYS, 1], party: [mon(:CHARMANDER, 10)])
scenario("Exp. Candy XS x2 (no level up)", ["UseOnPokemon", :EXPCANDYXS, 2], party: [mon(:CHARMANDER, 30)])
scenario("Exp. Candy M x2 (levels, learns, evolves)", ["UseOnPokemon", :EXPCANDYM, 2],
         party: [mon(:CHARMANDER, 14, moves: [[:SCRATCH], [:EMBER]])])
scenario("Exp. Candy XL near the cap", ["UseOnPokemon", :EXPCANDYXL, 1], party: [mon(:PIKACHU, 99)])
scenario("Exp. Candy at level 100", ["UseOnPokemon", :EXPCANDYL, 1], party: [mon(:PIKACHU, 100)])

# --- Evolution stones ---------------------------------------------------------------
stone_party = [mon(:VULPIX, 20), mon(:PIKACHU, 20), mon(:EEVEE, 20), mon(:KIRLIA, 25, gender: 0), mon(:KIRLIA, 25, gender: 1), mon(:CLEFAIRY, 20)]
[
  [:FIRESTONE, 0], [:FIRESTONE, 1], [:FIRESTONE, 2], [:THUNDERSTONE, 1], [:THUNDERSTONE, 2], [:WATERSTONE, 0],
  [:DAWNSTONE, 3], [:DAWNSTONE, 4], [:MOONSTONE, 5],
].each do |item, target|
  scenario("#{item} on #{stone_party[target][:species]} #{target}", ["UseOnPokemon", item, 1], party: stone_party, target: target)
end
scenario("Fire Stone on an Everstone holder", ["UseOnPokemon", :FIRESTONE, 1], party: [mon(:VULPIX, 20, item: :EVERSTONE)])

# --- Mints --------------------------------------------------------------------------
scenario("Adamant Mint", ["UseOnPokemon", :ADAMANTMINT, 1], party: [mon(:MACHOP, 40)], answers: { confirm: [true] })
scenario("Adamant Mint declined", ["UseOnPokemon", :ADAMANTMINT, 1], party: [mon(:MACHOP, 40)], answers: { confirm: [false] })
scenario("Adamant Mint on an Adamant Pokémon", ["UseOnPokemon", :ADAMANTMINT, 1], party: [mon(:MACHOP, 40, nature: :ADAMANT)])
scenario("Timid Mint over a Jolly Mint", ["UseOnPokemon", :TIMIDMINT, 1], party: [mon(:MACHOP, 40, natureForStats: :JOLLY)],
         answers: { confirm: [true] })

# --- Ability Capsule / Patch ------------------------------------------------------------
scenario("Ability Capsule 0 -> 1", ["UseOnPokemon", :ABILITYCAPSULE, 1], party: [mon(:MAGNEMITE, 30)], answers: { confirm: [true] })
scenario("Ability Capsule 1 -> 0", ["UseOnPokemon", :ABILITYCAPSULE, 1], party: [mon(:MAGNEMITE, 30, abilityIndex: 1)],
         answers: { confirm: [true] })
scenario("Ability Capsule on a hidden ability", ["UseOnPokemon", :ABILITYCAPSULE, 1], party: [mon(:MAGNEMITE, 30, abilityIndex: 2)],
         answers: { confirm: [true] })
scenario("Ability Capsule with one ability", ["UseOnPokemon", :ABILITYCAPSULE, 1], party: [mon(:BULBASAUR, 30)], answers: { confirm: [true] })
scenario("Ability Capsule on Zygarde", ["UseOnPokemon", :ABILITYCAPSULE, 1], party: [mon(:ZYGARDE, 50)], answers: { confirm: [true] })
scenario("Ability Capsule declined", ["UseOnPokemon", :ABILITYCAPSULE, 1], party: [mon(:MAGNEMITE, 30)], answers: { confirm: [false] })
scenario("Ability Patch", ["UseOnPokemon", :ABILITYPATCH, 1], party: [mon(:MAGNEMITE, 30)], answers: { confirm: [true] })
scenario("Ability Patch on a hidden ability", ["UseOnPokemon", :ABILITYPATCH, 1], party: [mon(:MAGNEMITE, 30, abilityIndex: 2)],
         answers: { confirm: [true] })
scenario("Ability Patch with no hidden ability", ["UseOnPokemon", :ABILITYPATCH, 1], party: [mon(:ROTOM, 30)], answers: { confirm: [true] })

# --- Form changes ---------------------------------------------------------------------------
scenario("Reveal Glass on Tornadus", ["UseOnPokemon", :REVEALGLASS, 1], party: [mon(:TORNADUS, 50)])
scenario("Reveal Glass back to Incarnate", ["UseOnPokemon", :REVEALGLASS, 1], party: [mon(:TORNADUS, 50, form: 1)])
scenario("Reveal Glass on Pikachu", ["UseOnPokemon", :REVEALGLASS, 1], party: [mon(:PIKACHU, 50)])
scenario("Reveal Glass on a fainted Tornadus", ["UseOnPokemon", :REVEALGLASS, 1], party: [mon(:TORNADUS, 50, hp: 0)])
scenario("Prison Bottle on Hoopa", ["UseOnPokemon", :PRISONBOTTLE, 1], party: [mon(:HOOPA, 50)])
rotom = ->(opts = {}) { mon(:ROTOM, 30, { moves: [[:THUNDERSHOCK], [:CONFUSERAY]] }.merge(opts)) }
scenario("Rotom Catalog: Microwave oven", ["UseOnPokemon", :ROTOMCATALOG, 1], party: [rotom.()], answers: { command: [1] })
scenario("Rotom Catalog: Heat to Wash", ["UseOnPokemon", :ROTOMCATALOG, 1],
         party: [rotom.(form: 1, moves: [[:THUNDERSHOCK], [:OVERHEAT]])], answers: { command: [2] })
scenario("Rotom Catalog: same form", ["UseOnPokemon", :ROTOMCATALOG, 1], party: [rotom.()], answers: { command: [0] })
scenario("Rotom Catalog: Light bulb from Heat (Ruby bug)", ["UseOnPokemon", :ROTOMCATALOG, 1],
         party: [rotom.(form: 1, moves: [[:THUNDERSHOCK], [:OVERHEAT]])], answers: { command: [0] })
scenario("Rotom Catalog: cancel", ["UseOnPokemon", :ROTOMCATALOG, 1], party: [rotom.()], answers: { command: [6] })
scenario("Rotom Catalog on Pikachu", ["UseOnPokemon", :ROTOMCATALOG, 1], party: [mon(:PIKACHU, 30)])
scenario("Zygarde Cube: change ability", ["UseOnPokemon", :ZYGARDECUBE, 1], party: [mon(:ZYGARDE, 50)], answers: { command: [1] })
scenario("Zygarde Cube: cancel", ["UseOnPokemon", :ZYGARDECUBE, 1], party: [mon(:ZYGARDE, 50)], answers: { command: [2] })
kyurem = mon(:KYUREM, 60, moves: [[:GLACIATE], [:SCARYFACE], [:ICEBEAM]])
scenario("DNA Splicers: fuse with Reshiram", ["UseOnPokemon", :DNASPLICERS, 1],
         party: [kyurem, mon(:RESHIRAM, 60), mon(:PIKACHU, 10)], bag: [[:DNASPLICERS, 1]], answers: { pokemon: [1] })
scenario("DNA Splicers: with itself", ["UseOnPokemon", :DNASPLICERS, 1],
         party: [kyurem, mon(:RESHIRAM, 60)], bag: [[:DNASPLICERS, 1]], answers: { pokemon: [0] })
scenario("DNA Splicers: with Pikachu", ["UseOnPokemon", :DNASPLICERS, 1],
         party: [kyurem, mon(:PIKACHU, 10)], bag: [[:DNASPLICERS, 1]], answers: { pokemon: [1] })
scenario("DNA Splicers: with a fainted Zekrom", ["UseOnPokemon", :DNASPLICERS, 1],
         party: [kyurem, mon(:ZEKROM, 60, hp: 0)], bag: [[:DNASPLICERS, 1]], answers: { pokemon: [1] })
scenario("DNA Splicers: cancelled", ["UseOnPokemon", :DNASPLICERS, 1], party: [kyurem, mon(:ZEKROM, 60)], answers: { pokemon: [-1] })
scenario("DNA Splicers (used) on an unfused Kyurem", ["UseOnPokemon", :DNASPLICERSUSED, 1], party: [kyurem])

# --- UseText / UseFromBag / ConfirmUseInField / UseInField -------------------------------------
scenario("Bicycle use text", ["UseText", :BICYCLE])
scenario("Bicycle use text while cycling", ["UseText", :MACHBIKE], global: { bicycle: true })
scenario("Honey from the Bag", ["UseFromBag", :HONEY])
scenario("Itemfinder from the Bag", ["UseFromBag", :DOWSINGMACHINE])
scenario("Escape Rope with no escape point", ["UseFromBag", :ESCAPEROPE])
scenario("Escape Rope with an escape point", ["UseFromBag", :ESCAPEROPE], global: { escapePoint: [3, 10, 12, 2] })
scenario("Escape Rope with a follower", ["UseFromBag", :ESCAPEROPE], global: { escapePoint: [3, 10, 12, 2] },
         player: { canTransfer: false })
scenario("Escape Rope confirm with no escape point", ["ConfirmUseInField", :ESCAPEROPE])
scenario("Escape Rope confirm with a follower", ["ConfirmUseInField", :ESCAPEROPE], global: { escapePoint: [3, 10, 12, 2] },
         player: { canTransfer: false })
scenario("Escape Rope in the field with no escape point", ["UseInField", :ESCAPEROPE])
scenario("Bicycle outdoors", ["UseFromBag", :BICYCLE], map: { mapId: 1 })
scenario("Bicycle on a can-bicycle indoor map", ["UseFromBag", :BICYCLE], map: { mapId: 20 })
scenario("Bicycle indoors", ["UseFromBag", :BICYCLE], map: { mapId: 2 })
scenario("Bicycle while surfing", ["UseFromBag", :BICYCLE], map: { mapId: 1 }, global: { surfing: true })
scenario("Bicycle on a must-walk tile", ["UseFromBag", :BICYCLE], map: { mapId: 1 }, player: { terrain: :TallGrass })
scenario("Dismounting on a must-walk tile", ["UseFromBag", :BICYCLE], map: { mapId: 1 }, global: { bicycle: true },
         player: { terrain: :Ice })
scenario("Bicycle with a follower", ["UseFromBag", :BICYCLE], map: { mapId: 1 }, player: { canTransfer: false })
scenario("Dismounting on cycling road", ["UseFromBag", :ACROBIKE], map: { mapId: 418 }, global: { bicycle: true })
scenario("Dismounting outdoors", ["UseFromBag", :BICYCLE], map: { mapId: 1 }, global: { bicycle: true })
scenario("Old Rod facing water", ["UseFromBag", :OLDROD], player: { facingTerrain: :StillWater })
scenario("Good Rod facing water from a cliff", ["UseFromBag", :GOODROD], player: { facingTerrain: :StillWater },
         map: { passable: false })
scenario("Super Rod facing water from a cliff while surfing", ["UseFromBag", :SUPERROD], player: { facingTerrain: :StillWater },
         map: { passable: false }, global: { surfing: true })
scenario("Old Rod facing land", ["UseFromBag", :OLDROD])
scenario("Old Rod in the field facing land", ["UseInField", :OLDROD])
scenario("Repel", ["UseInField", :REPEL])
scenario("Super Repel", ["UseInField", :SUPERREPEL])
scenario("Max Repel while a repel lingers", ["UseInField", :MAXREPEL], global: { repel: 12 })
scenario("Repel step: counting down", ["repelStep"], global: { repel: 5 })
scenario("Repel step: on ice", ["repelStep"], global: { repel: 1 }, player: { terrain: :Ice })
scenario("Repel step: wears off, no repels", ["repelStep"], global: { repel: 1 }, bag: [[:POTION, 2]])
scenario("Repel step: wears off, declines another", ["repelStep"], global: { repel: 1 }, bag: [[:SUPERREPEL, 2]],
         answers: { confirm: [false] })
scenario("Repel step: no repel", ["repelStep"])
scenario("Black Flute", ["UseInField", :BLACKFLUTE])
scenario("White Flute", ["UseInField", :WHITEFLUTE])
scenario("Coin Case", ["UseInField", :COINCASE], coins: 12_345)
scenario("Exp. All off", ["UseInField", :EXPALL], bag: [[:EXPALL, 1]])
scenario("Exp. All on", ["UseInField", :EXPALLOFF], bag: [[:EXPALLOFF, 1]])
scenario("Sacred Ash with nobody fainted", ["UseInField", :SACREDASH], party: [mon(:PIKACHU, 20)])
scenario("Sacred Ash with no Pokémon", ["UseInField", :SACREDASH], party: [])
hidden = [[1, "HiddenItem", 14, 9, false], [2, "hiddenitem 2", 9, 13, false], [3, "HiddenItem", 10, 10, true],
          [4, "Trainer", 10, 11, false]]
scenario("Itemfinder: nothing nearby", ["UseInField", :ITEMFINDER], map: { events: [[1, "HiddenItem", 30, 10, false]] })
scenario("Itemfinder: item to the right", ["UseInField", :ITEMFINDER], map: { events: hidden })
scenario("Itemfinder: item below", ["UseInField", :DOWSINGMACHINE], map: { events: hidden }, player: { x: 9, y: 10 })
scenario("Itemfinder: underfoot", ["UseInField", :ITEMFINDER], map: { events: hidden }, player: { x: 14, y: 9, direction: 8 })
scenario("Itemfinder: only a found item", ["UseInField", :ITEMFINDER], map: { events: [[3, "HiddenItem", 10, 10, true]] })

# --- Helpers called directly (the 100-EV cap only applies when no_ev_cap is false) ---------------
scenario("pbRaiseEffortValues capped at 100", ["helper", "pbRaiseEffortValues", :ATTACK, 10, false],
         party: [mon(:MACHOP, 30, ev: { ATTACK: 95 })])
scenario("pbRaiseEffortValues at 100", ["helper", "pbRaiseEffortValues", :ATTACK, 10, false],
         party: [mon(:MACHOP, 30, ev: { ATTACK: 100 })])
scenario("pbRaiseEffortValues uncapped", ["helper", "pbRaiseEffortValues", :ATTACK, 10, true],
         party: [mon(:MACHOP, 30, ev: { ATTACK: 100 })])
scenario("pbJustRaiseEffortValues", ["helper", "pbJustRaiseEffortValues", :SPEED, 30, nil],
         party: [mon(:MACHOP, 30, ev: { SPEED: 240 })])
scenario("pbMaxUsesOfEVRaisingItem capped", ["helper", "pbMaxUsesOfEVRaisingItem", :HP, 10, false],
         party: [mon(:MACHOP, 30, ev: { HP: 75 })])
scenario("pbChangeLevel down", ["helper", "pbChangeLevel", 20, nil, nil], party: [mon(:CHARMANDER, 25)])
scenario("pbChangeLevel unchanged", ["helper", "pbChangeLevel", 25, nil, nil], party: [mon(:CHARMANDER, 25)])
scenario("pbChangeExp down a level", ["helper", "pbChangeExp", 1000, nil, nil], party: [mon(:CHARMANDER, 14)])

#===============================================================================
# Running a scenario
#===============================================================================
def build_pokemon(spec)
  pkmn = Pokemon.new(spec[:species].to_sym, spec[:level], $player)
  pkmn.form_simple = spec[:form] if spec[:form]
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = 31
    pkmn.ev[s.id] = 0
  end
  (spec[:ev] || {}).each { |k, v| pkmn.ev[k.to_sym] = v }
  pkmn.nature = (spec[:nature] || :HARDY).to_sym
  pkmn.nature_for_stats = spec[:natureForStats].to_sym if spec[:natureForStats]
  pkmn.gender = spec[:gender] if spec.key?(:gender)
  pkmn.ability_index = spec[:abilityIndex] || 0
  pkmn.ability = nil
  pkmn.item = spec[:item]&.to_sym
  pkmn.happiness = spec[:happiness] || 70
  pkmn.obtain_map = spec[:obtainMap] || 0
  pkmn.poke_ball = (spec[:pokeBall] || :POKEBALL).to_sym
  if spec[:moves]
    pkmn.forget_all_moves
    spec[:moves].each_with_index do |(id, pp, ppup), i|
      pkmn.learn_move(id.to_sym)
      pkmn.moves[i].ppup = ppup if ppup
      pkmn.moves[i].pp = pp if pp
    end
  end
  pkmn.calc_stats
  pkmn.hp = spec[:hp] if spec.key?(:hp)
  pkmn.hp = pkmn.totalhp - spec[:hpLoss] if spec[:hpLoss]
  pkmn.status = spec[:status].to_sym if spec[:status]
  pkmn
end

def main_stats
  ret = []
  GameData::Stat.each_main { |s| ret << s.id }
  ret
end

def pokemon_state(pkmn)
  {
    species: pkmn.species.to_s, form: pkmn.form, level: pkmn.level, exp: pkmn.exp,
    hp: pkmn.hp, totalhp: pkmn.totalhp, attack: pkmn.attack, defense: pkmn.defense, spatk: pkmn.spatk,
    spdef: pkmn.spdef, speed: pkmn.speed, status: pkmn.status.to_s,
    ev: main_stats.map { |s| [s.to_s, pkmn.ev[s]] }.to_h,
    happiness: pkmn.happiness,
    moves: pkmn.moves.map { |m| [m.id.to_s, m.pp, m.ppup, m.total_pp] },
    natureForStats: pkmn.nature_for_stats ? pkmn.nature_for_stats.id.to_s : nil,
    ability: pkmn.ability ? pkmn.ability.id.to_s : nil, abilityIndex: pkmn.ability_index,
    fused: pkmn.fused ? pkmn.fused.species.to_s : nil
  }
end

def run(sc)
  $log = []
  $answers = {}
  (sc[:answers] || {}).each { |k, v| $answers[k] = v.dup }
  $game_temp = Game_Temp.new
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = 12_345_678
  $player.coins = sc[:coins] if sc[:coins]
  $bag = PokemonBag.new
  (sc[:bag] || []).each { |item, qty| $bag.add(item, qty) }
  $stats = GameStats.new
  $PokemonGlobal = StubGlobal.new
  (sc[:global] || {}).each { |k, v| $PokemonGlobal.send("#{k}=", v) }
  $PokemonMap = StubPokemonMap.new
  $game_self_switches = {}
  m = sc[:map] || {}
  map_id = m[:mapId] || 5
  events = {}
  (m[:events] || []).each do |id, name, x, y, self_a|
    events[id] = StubEvent.new(id, name, x, y)
    $game_self_switches[[map_id, id, "A"]] = true if self_a
  end
  $game_map = StubMap.new(map_id, m.key?(:passable) ? m[:passable] : true, events)
  pl = sc[:player] || {}
  $game_player = StubPlayer.new
  $game_player.x = pl[:x] || 10
  $game_player.y = pl[:y] || 10
  $game_player.direction = pl[:direction] || 2
  $game_player.can_transfer = pl.key?(:canTransfer) ? pl[:canTransfer] : true
  $game_player.terrain = pl[:terrain] || :None
  $game_player.facing_terrain = pl[:facingTerrain] || :None
  party = (sc[:party] || [mon(:PIKACHU, 20)]).map { |spec| build_pokemon(spec) }
  party.each { |p| $player.party << p }
  pkmn = party[sc[:target] || 0]
  scene = PokemonPartyScreen.new
  kind, item, qty, *rest = sc[:action]
  ret = case kind
        when "UseOnPokemon" then ItemHandlers.triggerUseOnPokemon(item, qty, pkmn, scene)
        when "UseOnPokemonMaximum"
          [ItemHandlers::UseOnPokemonMaximum.trigger(item, pkmn), ItemHandlers.triggerUseOnPokemonMaximum(item, pkmn)]
        when "UseFromBag" then ItemHandlers.triggerUseFromBag(item)
        when "ConfirmUseInField" then ItemHandlers.triggerConfirmUseInField(item)
        when "UseInField" then ItemHandlers.triggerUseInField(item)
        when "UseText" then ItemHandlers.getUseText(item)
        when "repelStep"
          EventHandlers.class_variable_get(:@@events)[:on_player_step_taken].instance_variable_get(:@callbacks)[:repel_counter].call
          nil
        when "helper"
          case item
          when "pbRaiseEffortValues" then pbRaiseEffortValues(pkmn, qty, rest[0], rest[1])
          when "pbJustRaiseEffortValues" then pbJustRaiseEffortValues(pkmn, qty, rest[0])
          when "pbMaxUsesOfEVRaisingItem" then pbMaxUsesOfEVRaisingItem(qty, rest[0], pkmn, rest[1])
          when "pbChangeLevel" then pbChangeLevel(pkmn, qty, scene) && nil
          when "pbChangeExp" then pbChangeExp(pkmn, qty, scene) && nil
          end
        end
  ret = ret.to_s if ret.is_a?(Symbol)
  {
    ret: ret, log: $log,
    party: $player.party.map { |p| pokemon_state(p) },
    bag: $bag.pockets.flat_map { |pocket| pocket.map { |slot| [slot[0].to_s, slot[1]] } },
    repel: $PokemonGlobal.repel, escapePoint: $PokemonGlobal.escapePoint,
    stats: { repelCount: $stats.repel_count, itemfinderCount: $stats.itemfinder_count },
    flutes: [$PokemonMap.blackFluteUsed, $PokemonMap.whiteFluteUsed],
    direction: $game_player.direction
  }
end

def jsonable(value)
  case value
  when Symbol then value.to_s
  when Hash then value.map { |k, v| [k.to_s, jsonable(v)] }.to_h
  when Array then value.map { |v| jsonable(v) }
  else value
  end
end

out = SCENARIOS.map do |sc|
  setup = jsonable(sc)
  # Terrain tags go to the TS side as their id numbers (GameData::TerrainTag)
  pl = setup["player"] ||= {}
  pl["terrainNumber"] = GameData::TerrainTag.get((pl["terrain"] || "None").to_sym).id_number
  pl["facingTerrainNumber"] = GameData::TerrainTag.get((pl["facingTerrain"] || "None").to_sym).id_number
  begin
    result = jsonable(run(sc))
  rescue StandardError => e
    result = { "error" => "#{e.class}: #{e.message}", "log" => jsonable($log) }
    $stderr.puts "#{sc[:name]}: #{e.class}: #{e.message}\n  #{e.backtrace.first(4).join("\n  ")}"
  end
  { "setup" => setup, "result" => result }
end

path = File.join(ROOT, "web", "src", "game", "items", "fieldItemsReference.json")
File.write(path, JSON.pretty_generate(out) + "\n")
puts "Wrote #{out.length} scenarios to #{path.sub(ROOT + '/', '')}"
