# Reference results for the Pokémon lifecycle ports (web/src/game/daycare,
# web/src/game/berries, web/src/ui/evolution, web/src/ui/trading,
# web/src/ui/hatching): runs the game's real Ruby headless and writes
# web/src/game/daycare/lifecycleReference.json, which
# web/src/game/daycare/lifecycle.test.ts replays against the TypeScript.
#
#   cd web && ruby tools/ruby-ref/lifecycle_reference.rb
#
# Loaded on top of essentials.rb: 012_Overworld/006_Overworld_BerryPlants.rb,
# 007_Overworld_DayCare.rb, 016_UI/001_Non-interactive UI/003_UI_EggHatching.rb,
# 004_UI_Evolution.rb, 005_UI_Trading.rb, then the plugin code that patches
# them, in load order: the v20.1 Hotfixes' DayCare::EggGenerator fixes
# (Misc bug fixes.rb) and Essentials Deluxe's EggGenerator.generate
# (Pokemon.rb; essentials.rb loaded that file before 007 existed).
#
# Randomness is scripted: while $scripted is set, Kernel#rand(n) is
# raw % n (rand(a...b) = a + raw % size), Array#sample is self[rand(size)]
# and Array#sample(n) a partial Fisher-Yates shuffle on rand, with the raw
# numbers taken from each scenario's list. The TypeScript test mocks
# core/random the same way (DayCare.ts's sample/sampleN match).
#
# Time: pbGetTimeNow returns $now (seconds), set per step.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_code(code, path)
  TOPLEVEL_BINDING.eval(code, path)
end

def eval_game_file(path)
  eval_game_code(File.read(path, encoding: "UTF-8"), path)
end

NONINTERACTIVE = File.join(SCRIPTS, "016_UI", "001_Non-interactive UI")
eval_game_file(File.join(SCRIPTS, "012_Overworld", "003_Overworld_Time.rb")) # PBDayNight (form/evolution checks)
eval_game_file(File.join(SCRIPTS, "012_Overworld", "006_Overworld_BerryPlants.rb"))
eval_game_file(File.join(SCRIPTS, "012_Overworld", "007_Overworld_DayCare.rb"))
eval_game_file(File.join(NONINTERACTIVE, "003_UI_EggHatching.rb"))
eval_game_file(File.join(NONINTERACTIVE, "004_UI_Evolution.rb"))
eval_game_file(File.join(NONINTERACTIVE, "005_UI_Trading.rb"))

# The plugins' DayCare blocks, in plugin load order (Hotfixes, then Deluxe).
[File.join(PLUGINS, "v20.1 Hotfixes", "Misc bug fixes.rb"),
 File.join(PLUGINS, "Essentials Deluxe", "[000] Essentials Patches", "Pokemon.rb")].each do |path|
  blocks = File.read(path, encoding: "UTF-8").scan(/^class DayCare\r?\n.*?^end\r?$/m)
  raise "no DayCare block in #{path}" if blocks.empty?
  blocks.each { |b| eval_game_code(b, path) }
end

#===============================================================================
# Stubs and scripted randomness
#===============================================================================
$scripted = false
$rolls = []
$used = 0

# Essentials' own top-level rand (002_RubyUtilities.rb), which the game's code calls.
def rand(*args)
  return Kernel.rand(*args) if !$scripted
  raise "out of scripted rolls" if $rolls.empty?
  raw = $rolls.shift
  $used += 1
  arg = args[0]
  case arg
  when Range then arg.min + (raw % (arg.max - arg.min + 1))
  when Integer then raw % arg
  when nil then raw / (2**30).to_f
  else raise "unexpected rand(#{args.inspect})"
  end
end

class Array
  alias __real_sample sample
  def sample(n = nil)
    return __real_sample(*[n].compact) if !$scripted
    return (empty? ? nil : self[rand(size)]) if n.nil?
    a = dup
    count = [n, a.size].min
    count.times do |i|
      j = i + rand(a.size - i)
      a[i], a[j] = a[j], a[i]
    end
    a[0, count]
  end
end

$now = 1_700_000_000
def pbGetTimeNow; Time.at($now); end

class StubVariables
  def initialize; @data = {}; end
  def [](i); @data[i] || 0; end
  def []=(i, v); @data[i] = v; end
  def to_h; @data.map { |k, v| [k.to_s, v] }.to_h; end
end

class StubGlobal
  attr_accessor :day_care
  def initialize; @day_care = DayCare.new; end
end

class StubMap
  attr_reader :map_id
  def initialize(id); @map_id = id; end
end

class Game_Temp
  attr_accessor :in_battle, :in_storage
end

def reset_world(bag = [])
  $game_temp = Game_Temp.new
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = 12_345_678
  $bag = PokemonBag.new
  bag.each { |item, qty| $bag.add(item.to_sym, qty) }
  $stats = GameStats.new
  $PokemonGlobal = StubGlobal.new
  $game_variables = StubVariables.new
  $game_map = nil
  $game_switches = nil
end

def main_stats
  ret = []
  GameData::Stat.each_main { |s| ret << s.id }
  ret
end

# Builds a Pokémon from a spec (with the real RNG; the scenario's rolls start after).
def build_pokemon(spec)
  owner = spec[:owner] ? Pokemon::Owner.new(*spec[:owner]) : $player
  pkmn = Pokemon.new(spec[:species].to_sym, spec[:level], owner)
  pkmn.form_simple = spec[:form] if spec[:form]
  pkmn.personalID = spec[:pid] || 0x00010000
  pkmn.shiny = false
  ivs = spec[:iv] || {}
  main_stats.each_with_index { |s, i| pkmn.iv[s] = ivs.is_a?(Array) ? ivs[i] : 10 + i }
  pkmn.nature = (spec[:nature] || :HARDY).to_sym
  pkmn.gender = spec[:gender] if spec.key?(:gender)
  pkmn.ability_index = spec[:abilityIndex] || 0
  pkmn.item = spec[:item]&.to_sym
  pkmn.happiness = spec[:happiness] || 70
  pkmn.poke_ball = (spec[:pokeBall] || :POKEBALL).to_sym
  if spec[:moves]
    pkmn.forget_all_moves
    spec[:moves].each { |id| pkmn.learn_move(id.to_sym) }
  end
  pkmn.exp = spec[:exp] if spec[:exp]
  pkmn.calc_stats
  pkmn.hp = spec[:hp] if spec.key?(:hp)
  pkmn
end

def pokemon_state(pkmn)
  {
    species: pkmn.species.to_s, form: pkmn.form, level: pkmn.level, exp: pkmn.exp, name: pkmn.name,
    nicknamed: !pkmn.nicknamed?.nil? && pkmn.nicknamed?,
    gender: pkmn.gender, nature: pkmn.nature.id.to_s, abilityIndex: pkmn.ability_index,
    ability: pkmn.ability ? pkmn.ability.id.to_s : nil,
    iv: main_stats.map { |s| [s.to_s, pkmn.iv[s]] }.to_h,
    moves: pkmn.moves.map { |m| m.id.to_s }, firstMoves: pkmn.first_moves.map(&:to_s),
    item: pkmn.item_id&.to_s, pokeBall: pkmn.poke_ball.to_s,
    shiny: pkmn.shiny?, personalID: pkmn.personalID, pokerus: pkmn.pokerus,
    stepsToHatch: pkmn.steps_to_hatch, happiness: pkmn.happiness, obtainText: pkmn.obtain_text,
    obtainMethod: pkmn.obtain_method, hatchedMap: pkmn.hatched_map,
    owner: [pkmn.owner.id, pkmn.owner.name, pkmn.owner.gender, pkmn.owner.language],
    hp: pkmn.hp, totalhp: pkmn.totalhp, attack: pkmn.attack, speed: pkmn.speed
  }
end

def scripted(rolls)
  $rolls = rolls.dup
  $used = 0
  $scripted = true
  yield
ensure
  $scripted = false
end

gen = Random.new(20261029)
raw_rolls = ->(n) { Array.new(n) { gen.rand(1 << 30) } }
out = {}

#===============================================================================
# 1. Egg generation (DayCare::EggGenerator.generate) and compatibility
#===============================================================================
GOLD = [12_345_678, "Gold", 0, 2]
KRIS = [87_654_321, "Kris", 1, 2]
JAPANESE = [11_111_111, "Hiro", 0, 1]
def mon(species, level, extra = {}); { species: species, level: level }.merge(extra); end

pairs = [
  { name: "same species, nothing held",
    a: mon(:CHARMANDER, 30, gender: 1, nature: :ADAMANT, iv: [31, 30, 29, 28, 27, 26], moves: %i[SCRATCH EMBER BITE FLAMETHROWER]),
    b: mon(:CHARMANDER, 32, gender: 0, nature: :TIMID, iv: [1, 2, 3, 4, 5, 6], moves: %i[SCRATCH ANCIENTPOWER FLAMETHROWER DRAGONTAIL]) },
  { name: "Pikachu with a Light Ball and Ditto",
    a: mon(:PIKACHU, 25, gender: 1, item: :LIGHTBALL, moves: %i[THUNDERSHOCK QUICKATTACK]),
    b: mon(:DITTO, 40, moves: %i[TRANSFORM]) },
  { name: "Destiny Knot and Everstone, different owners and languages",
    a: mon(:EEVEE, 20, gender: 1, item: :DESTINYKNOT, nature: :CALM, abilityIndex: 2, owner: JAPANESE, pokeBall: :LUXURYBALL),
    b: mon(:EEVEE, 20, gender: 0, item: :EVERSTONE, nature: :JOLLY, owner: KRIS, pokeBall: :MASTERBALL) },
  { name: "two different Power items",
    a: mon(:RATTATA, 10, gender: 1, item: :POWERWEIGHT, iv: [31, 0, 0, 0, 0, 0]),
    b: mon(:RATTATA, 10, gender: 0, item: :POWERBRACER, iv: [0, 31, 0, 0, 0, 0]) },
  { name: "the same Power item on both",
    a: mon(:ZUBAT, 10, gender: 1, item: :POWERANKLET, iv: [5, 5, 5, 5, 5, 25]),
    b: mon(:ZUBAT, 10, gender: 0, item: :POWERANKLET, iv: [9, 9, 9, 9, 9, 30]) },
  { name: "Nidoran (alternate offspring)",
    a: mon(:NIDORANfE, 15, moves: %i[GROWL SCRATCH]), b: mon(:NIDORANmA, 15, moves: %i[LEER PECK]) },
  { name: "Marill with a Sea Incense",
    a: mon(:MARILL, 20, gender: 1, item: :SEAINCENSE), b: mon(:MARILL, 20, gender: 0) },
  { name: "Marill without an incense",
    a: mon(:MARILL, 20, gender: 1), b: mon(:MARILL, 20, gender: 0) },
  { name: "hidden ability mother, Shiny Charm", bag: [[:SHINYCHARM, 1]],
    a: mon(:VULPIX, 20, gender: 1, abilityIndex: 2), b: mon(:GROWLITHE, 20, gender: 0) },
  { name: "Alolan Vulpix mother with an Everstone",
    a: mon(:VULPIX, 20, form: 1, gender: 1, item: :EVERSTONE), b: mon(:VULPIX, 20, gender: 0) },
  { name: "genderless with Ditto",
    a: mon(:DITTO, 30), b: mon(:MAGNEMITE, 30, moves: %i[TACKLE THUNDERSHOCK]) },
  { name: "male first, father knows egg moves",
    a: mon(:SQUIRTLE, 30, gender: 0, moves: %i[MIRRORCOAT AURASPHERE TACKLE WATERGUN]),
    b: mon(:WARTORTLE, 30, gender: 1, moves: %i[TACKLE YAWN], pokeBall: :CHERISHBALL) },
  { name: "Chansey (Lucky Punch baby check)",
    a: mon(:CHANSEY, 40, gender: 1, item: :LUCKINCENSE), b: mon(:DITTO, 40) },
  { name: "Pokérus and Masuda rerolls", bag: [[:SHINYCHARM, 1]],
    a: mon(:PIDGEY, 10, gender: 1, owner: JAPANESE), b: mon(:PIDGEY, 10, gender: 0) },
]
out["eggs"] = pairs.map do |pr|
  reset_world(pr[:bag] || [])
  a = build_pokemon(pr[:a])
  b = build_pokemon(pr[:b])
  rolls = raw_rolls.call(80)
  egg = nil
  scripted(rolls) { egg = DayCare::EggGenerator.generate(a, b) }
  used = $used
  # Hatching it (pbHatch's data part; the animation is stubbed)
  $game_map = StubMap.new(42)
  hatched = egg.clone
  hatched.steps_to_hatch = 0
  def pbHatchAnimation(_p); true; end
  pbHatch(hatched)
  { name: pr[:name], a: pr[:a], b: pr[:b], bag: pr[:bag] || [], rolls: rolls, used: used,
    egg: pokemon_state(egg), hatched: pokemon_state(hatched).merge(eggsHatched: $stats.eggs_hatched) }
end

compat_pairs = [
  [mon(:CHARMANDER, 5, gender: 1), mon(:CHARMANDER, 5, gender: 0)],
  [mon(:CHARMANDER, 5, gender: 1), mon(:CHARMANDER, 5, gender: 0, owner: KRIS)],
  [mon(:CHARMANDER, 5, gender: 1), mon(:CHARMANDER, 5, gender: 1)],
  [mon(:CHARMANDER, 5, gender: 1), mon(:SQUIRTLE, 5, gender: 0)],
  [mon(:CHARMANDER, 5, gender: 1), mon(:BULBASAUR, 5, gender: 0, owner: KRIS)],
  [mon(:PICHU, 5, gender: 1), mon(:PIKACHU, 5, gender: 0)],
  [mon(:DITTO, 5), mon(:DITTO, 5)],
  [mon(:DITTO, 5), mon(:MAGNEMITE, 5)],
  [mon(:MAGNEMITE, 5), mon(:VOLTORB, 5)],
  [mon(:MEWTWO, 70), mon(:DITTO, 5)],
  [mon(:EEVEE, 5, gender: 0), mon(:DITTO, 5, owner: KRIS)],
]
out["compatibility"] = compat_pairs.map do |a_spec, b_spec|
  reset_world
  $player.party << build_pokemon(a_spec)
  $player.party << build_pokemon(b_spec)
  DayCare.deposit(0)
  DayCare.deposit(0)
  DayCare.get_compatibility(5)
  { a: a_spec, b: b_spec, compat: $game_variables[5] }
end

#===============================================================================
# 2. The Day Care: deposits, steps (Exp, eggs, shared egg moves), withdrawals
#===============================================================================
daycare_cases = [
  { name: "two Charmander walking 1000 steps",
    party: [mon(:CHARMANDER, 5, gender: 1, moves: %i[SCRATCH GROWL]), mon(:CHARMANDER, 5, gender: 0, moves: %i[SCRATCH BITE]), mon(:PIDGEY, 5)],
    steps: 1000, bag: [] },
  { name: "Oval Charm, high level Pokémon",
    party: [mon(:MACHOP, 99, gender: 1, exp: 999_000), mon(:DITTO, 30), mon(:PIDGEY, 5)],
    steps: 600, bag: [[:OVALCHARM, 1]] },
  { name: "Shaymin's form resets",
    party: [mon(:SHAYMIN, 50, form: 1, hp: 3), mon(:PIDGEY, 5)], steps: 300, bag: [] },
]
out["daycare"] = daycare_cases.map do |c|
  reset_world(c[:bag])
  c[:party].each { |s| $player.party << build_pokemon(s) }
  log = []
  dc = $PokemonGlobal.day_care
  DayCare.deposit(0)
  log << ["deposit", $player.party.length, dc.count, dc[0].pokemon.form, dc[0].pokemon.hp, dc[0].pokemon.totalhp]
  DayCare.deposit(0) if $player.party.length > 1 && c[:party].length > 2
  log << ["count", DayCare.count]
  rolls = raw_rolls.call(40)
  scripted(rolls) do
    c[:steps].times do |i|
      dc.update_on_step_taken
      next if (i + 1) % 100 != 0
      log << ["step", i + 1, dc.step_counter, dc.egg_generated,
              dc.slots.map { |s| s.filled? ? [s.pokemon.level, s.pokemon.exp, s.pokemon.moves.map { |m| m.id.to_s }, s.level_gain, s.cost, s.choice_text] : nil }]
    end
  end
  log << ["used", $used]
  DayCare.get_details(0, 1, 2)
  DayCare.get_level_gain(0, 3, 4)
  DayCare.get_compatibility(5)
  log << ["vars", $game_variables.to_h]
  egg = DayCare.egg_generated? ? "generated" : "none"
  log << ["egg", egg]
  DayCare.withdraw(0)
  log << ["withdraw", $player.party.map { |p| p.species.to_s }, DayCare.count, $stats.day_care_levels_gained, $stats.day_care_deposits]
  { name: c[:name], party: c[:party], bag: c[:bag], steps: c[:steps], rolls: rolls, log: log }
end

#===============================================================================
# 3. Berry plant growth over real time
#===============================================================================
berry_cases = []
%i[ORANBERRY CHERIBERRY SITRUSBERRY ENIGMABERRY].each do |berry|
  [nil, :GROWTHMULCH, :DAMPMULCH, :STABLEMULCH, :GOOEYMULCH].each do |mulch|
    # [hours to advance, water?] — hourly ticks, a few long gaps, some watering
    berry_cases << { berry: berry, mulch: mulch,
                     steps: ([[1, false]] * 6) + [[3, true]] + ([[2, false]] * 5) + [[7, true], [30, false], [1, true], [200, false], [500, false]] }
  end
end
out["berries"] = berry_cases.map do |c|
  $now = 1_700_000_000
  plant = BerryPlantData.new
  plant.mulch_id = c[:mulch]
  plant.plant(c[:berry])
  states = []
  c[:steps].each do |hours, water|
    $now += hours * 3600 + 17
    plant.update
    plant.water if water && plant.growing?
    states << [plant.growth_stage, plant.time_alive, plant.moisture_level, plant.yield_penalty, plant.replant_count,
               plant.watering_count, plant.planted? ? plant.moisture_stage : -1,
               plant.grown? ? plant.berry_yield : nil, plant.berry_id&.to_s, plant.mulch_id&.to_s]
  end
  { berry: c[:berry].to_s, mulch: c[:mulch]&.to_s, steps: c[:steps], states: states }
end

#===============================================================================
# 4. Evolution: the checks and pbEvolutionSuccess's data part
#===============================================================================
$now = 1_700_000_000
# The scene's screen parts are stubbed; pbLearnMove records the moves.
class PokemonEvolutionScene
  def pbUpdate(*_a); end
end
module GameData
  class Species
    def self.cry_length(*_a); 0; end
  end
end
class StubWindow; attr_accessor :text; def update; end; end
def pbMessageDisplay(*_a); end
def pbResolveAudioSE(*_a); nil; end
def pbBGMStop(*_a); end
def pbLearnMove(pkmn, move, *_a)
  $learnt << move.to_s
  pkmn.learn_move(move)
end

evo_cases = [
  { name: "Charmeleon levels up", pkmn: mon(:CHARMELEON, 36, moves: %i[SCRATCH EMBER]), check: "levelup" },
  { name: "Bulbasaur levels up", pkmn: mon(:BULBASAUR, 16), check: "levelup" },
  { name: "fainted Ivysaur stays fainted", pkmn: mon(:IVYSAUR, 32, hp: 0), check: "levelup" },
  { name: "Nincada with a Poké Ball", pkmn: mon(:NINCADA, 20, item: :ORANBERRY), bag: [[:POKEBALL, 2]], check: "levelup" },
  { name: "Nincada without a Poké Ball", pkmn: mon(:NINCADA, 20), check: "levelup" },
  { name: "Nincada with a full party", pkmn: mon(:NINCADA, 20), bag: [[:POKEBALL, 1]], extra: 5, check: "levelup" },
  { name: "Eevee and a Thunder Stone", pkmn: mon(:EEVEE, 10), check: "item", item: :THUNDERSTONE },
  { name: "Eevee and a Fire Stone at 4 moves", pkmn: mon(:EEVEE, 30, moves: %i[TACKLE GROWL TAILWHIP BITE]), check: "item", item: :FIRESTONE },
  { name: "Pichu with high happiness", pkmn: mon(:PICHU, 10, happiness: 250), check: "levelup" },
  { name: "Kadabra traded", pkmn: mon(:KADABRA, 30), check: "trade", other: mon(:PIDGEY, 5) },
  { name: "Onix holding a Metal Coat traded", pkmn: mon(:ONIX, 30, item: :METALCOAT), check: "trade", other: mon(:PIDGEY, 5) },
  { name: "Onix without an item traded", pkmn: mon(:ONIX, 30), check: "trade", other: mon(:PIDGEY, 5) },
  { name: "Karrablast traded for Shelmet", pkmn: mon(:KARRABLAST, 20), check: "trade", other: mon(:SHELMET, 20) },
  { name: "Shelmet traded for Karrablast", pkmn: mon(:SHELMET, 20), check: "trade", other: mon(:KARRABLAST, 20) },
  { name: "Gloom and a Sun Stone", pkmn: mon(:GLOOM, 30), check: "item", item: :SUNSTONE },
  { name: "Rattata at level 20", pkmn: mon(:RATTATA, 20), check: "levelup" },
]
out["evolutions"] = evo_cases.map do |c|
  reset_world(c[:bag] || [])
  pkmn = build_pokemon(c[:pkmn])
  $player.party << pkmn
  (c[:extra] || 0).times { $player.party << build_pokemon(mon(:PIDGEY, 5)) }
  new_species = case c[:check]
                when "levelup" then pkmn.check_evolution_on_level_up
                when "item" then pkmn.check_evolution_on_use_item(c[:item])
                when "trade" then pkmn.check_evolution_on_trade(build_pokemon(c[:other]))
                end
  $learnt = []
  if new_species
    evo = PokemonEvolutionScene.new
    evo.instance_variable_set(:@pokemon, pkmn)
    evo.instance_variable_set(:@newspecies, new_species)
    evo.instance_variable_set(:@sprites, { "msgwindow" => StubWindow.new })
    evo.pbEvolutionSuccess
  end
  { name: c[:name], pkmn: c[:pkmn], bag: c[:bag] || [], extra: c[:extra] || 0, check: c[:check],
    item: c[:item]&.to_s, other: c[:other], newSpecies: new_species&.to_s, learnt: $learnt,
    party: $player.party.map { |p| pokemon_state(p) }, ball: $bag.quantity(:POKEBALL),
    owned: $player.owned?(new_species || :NONE), evolutionCount: $stats.evolution_count }
end

# check_evolution_on_level_up for every species at a few levels/happiness values
sweep = []
GameData::Species.each_species do |sp|
  [[5, 70], [30, 70], [30, 255], [100, 255]].each do |level, happiness|
    reset_world
    pkmn = begin
      Pokemon.new(sp.species, level, $player)
    rescue StandardError, NameError
      nil # needs the overworld (e.g. Burmy's form reads pbGetEnvironment)
    end
    next if !pkmn
    pkmn.happiness = happiness
    pkmn.gender = 0
    pkmn.personalID = 0x00010000
    pkmn.nature = :HARDY
    main_stats.each_with_index { |st, i| pkmn.iv[st] = 10 + i }
    pkmn.calc_stats
    r = begin
      pkmn.check_evolution_on_level_up&.to_s
    rescue StandardError, NameError
      "error"
    end
    sweep << [sp.species.to_s, level, happiness, r]
  end
end
out["levelUpSweep"] = sweep

#===============================================================================
# 5. Trades (pbStartTrade, the scene stubbed; its evolution check recorded)
#===============================================================================
class PokemonTrade_Scene
  def pbStartScreen(pokemon, pokemon2, trader1, trader2)
    @pokemon = pokemon
    @pokemon2 = pokemon2
    $trade_log << [trader1, trader2]
  end
  def pbTrade; end
  def pbEndScreen(*_a)
    newspecies = @pokemon2.check_evolution_on_trade(@pokemon)
    $trade_log << ["evolves", newspecies&.to_s]
  end
end
def pbFadeOutInWithMusic(*_a); yield if block_given?; end

trade_cases = [
  { name: "Onix for a Bellsprout", party: [mon(:BELLSPROUT, 14), mon(:PIDGEY, 5)], index: 0, newpoke: "ONIX", nickname: "Rocky", trainer: "Andy" },
  { name: "Galarian Mr. Mime (form ID)", party: [mon(:PIDGEY, 5), mon(:ABRA, 22)], index: 1, newpoke: "MRMIME_1", nickname: "Mime", trainer: "Maria", gender: 1 },
  { name: "Galarian Darumaka", party: [mon(:SANDSHREW, 30)], index: 0, newpoke: "DARUMAKA_1", nickname: "Ice Potato", trainer: "Silvia", gender: 1 },
  { name: "a Kadabra (trade evolution)", party: [mon(:MACHOP, 18)], index: 0, newpoke: "KADABRA", nickname: "Abby", trainer: "Ken" },
  { name: "a ready-made Pinsir holding Pinsirite", party: [mon(:SCYTHER, 40)], index: 0,
    newpoke: mon(:PINSIR, 40, item: :PINSIRITE), nickname: "Pinsey", trainer: "Anya" },
  { name: "Shelmet for Karrablast", party: [mon(:KARRABLAST, 20)], index: 0, newpoke: "SHELMET", nickname: nil, trainer: "Lily", gender: 1 },
]
out["trades"] = trade_cases.map do |c|
  reset_world
  c[:party].each { |s| $player.party << build_pokemon(s) }
  newpoke = c[:newpoke].is_a?(Hash) ? build_pokemon(c[:newpoke]) : c[:newpoke].to_sym
  $trade_log = []
  rolls = raw_rolls.call(40)
  error = nil
  begin
    scripted(rolls) { pbStartTrade(c[:index], newpoke, c[:nickname], c[:trainer], c[:gender] || 0) }
  rescue RuntimeError => e
    error = e.message
  end
  { name: c[:name], party: c[:party], index: c[:index], newpoke: c[:newpoke], nickname: c[:nickname],
    trainer: c[:trainer], gender: c[:gender] || 0, rolls: rolls, used: $used, log: $trade_log, error: error,
    received: pokemon_state($player.party[c[:index]]), tradeCount: $stats.trade_count }
end

#===============================================================================
# 6. Hatching countdown (:hatch_eggs), with and without Flame Body
#===============================================================================
$hatched = []
def pbHatch(pkmn); $hatched << pkmn.species.to_s; end
hatch_cases = [
  { name: "plain", party: [mon(:PIDGEY, 5)], eggs: [[:TOGEPI, 5], [:PICHU, 3]], steps: 6 },
  { name: "Flame Body", party: [mon(:MAGMAR, 30, abilityIndex: 0)], eggs: [[:TOGEPI, 5], [:PICHU, 9]], steps: 6 },
]
handler = EventHandlers.class_variable_get(:@@events)[:on_player_step_taken].instance_variable_get(:@callbacks)[:hatch_eggs]
out["hatching"] = hatch_cases.map do |c|
  reset_world
  c[:party].each { |s| $player.party << build_pokemon(s) }
  c[:eggs].each do |sp, steps|
    egg = build_pokemon(mon(sp, 1))
    egg.steps_to_hatch = steps
    $player.party << egg
  end
  $hatched = []
  log = []
  c[:steps].times do
    handler.call
    log << [$player.party.map(&:steps_to_hatch), $hatched.dup]
  end
  { name: c[:name], party: c[:party], eggs: c[:eggs].map { |sp, s| [sp.to_s, s] }, steps: c[:steps], log: log,
    ability: $player.party[0].ability&.id.to_s }
end

def jsonable(value)
  case value
  when Symbol then value.to_s
  when Hash then value.map { |k, v| [k.to_s, jsonable(v)] }.to_h
  when Array then value.map { |v| jsonable(v) }
  else value
  end
end

path = File.join(ROOT, "web", "src", "game", "daycare", "lifecycleReference.json")
File.write(path, JSON.pretty_generate(jsonable(out)) + "\n")
puts "wrote #{path}"
