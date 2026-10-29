# Reference data for the Battle Frontier port (web/src/game/frontier/): runs
# the game's real 018_Alternate battle modes scripts (Battle Frontier, its
# rules and its generator, plus Pokemon Selection Before Battle's
# hasValidTeam?) on Ruby 2.6 through essentials.rb, and writes
# web/src/game/frontier/battleFrontierReference.json for
# battleFrontier.test.ts.
#
#   cd web && ruby tools/ruby-ref/battle_frontier_reference.rb
#
# - data: the trainer lists (Data/trainer_lists.dat) and GameData key orders
# - rules: rulesets, entry restrictions and team rules on sample Pokémon
# - levels: every level adjustment on two teams, and back
# - foes: trainer choice, generated trainers, Battle Factory Pokémon
# - generator: legal moves, random Pokémon, duplicates, tiers, trainer info,
#   ratings and simulated battles (one a real battle in the debug scene)
# - challenge: whole Battle Tower runs (BattleChallenge set/start/pbBattle/...)
#   with real battles, both sides chosen by the AI
# - swap: the Battle Swap screen's logic with scripted choices
# Randomness: top-level rand is the counter-based sequence of
# other_battle_types_reference.rb, and Array#sample is Ruby's rb_ary_sample
# drawing from it.

require "json"
$stderr.sync = true
require_relative "essentials"

Essentials.load!(verbose: true)

shadow = File.read(File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "002_ShadowPokemon_Other.rb"), encoding: "UTF-8")
Battle::Battler.class_eval(shadow[/^  def shadowPokemon\?.*?^  end\r?\n(?=end)/m])
gen9_battle = File.read(File.join(PLUGINS, "Generation 9 Pack Scripts", "[001] Battle", "[001] Battle.rb"), encoding: "UTF-8")
calc = gen9_battle[/^  def pbCalcDamageMultipliers\(.*?^  end\r?\n/m]
Battle::Move.class_eval(calc.sub('@function = "IncreasePowerInSunWeather"', '@function == "IncreasePowerInSunWeather"'))

class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end
$seq = SeqRandom.new
def rand(x = 0)
  return x.min + $seq.next(x.max - x.min + 1) if x.is_a?(Range)
  $seq.next(x.to_i)
end

# rb_ary_sample (array.c), drawing from rand.
class Array
  def sample(n = nil)
    if n.nil?
      i = (length < 2) ? 0 : rand(length)
      return self[i]
    end
    len = length
    raise ArgumentError, "negative sample number" if n < 0
    n = len if n > len
    rnds = (0...n).map { |i| rand(len - i) }
    return [] if n == 0
    idx = [rnds[0]]
    sorted = [rnds[0]]
    (1...n).each do |i|
      k = rnds[i]
      j = 0
      while j < i
        break if k < sorted[j]
        k += 1
        j += 1
      end
      sorted.insert(j, k)
      idx[i] = k
    end
    idx.map { |i| self[i] }
  end
end

# Engine stand-ins the challenge scripts reach
class Game_Character; end
class Game_Player < Game_Character
  attr_accessor :x, :y, :direction
  def initialize; @x = 7; @y = 3; @direction = 8; end
end
class Game_Event < Game_Character; end
class Game_Map
  REAL_RES_X = 128
  REAL_RES_Y = 128
  attr_accessor :map_id, :need_refresh
  def initialize; @map_id = 191; end
end
class Scene_Map; end
# Map 191 has no metadata and the stand-in player no terrain tag (Burmy's form on creation)
def pbGetEnvironment; :None; end
class Game_Temp
  attr_accessor :last_battle_record
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end
class SwitchStub
  def [](_i); false; end
  def []=(_i, _v); end
end
class PokemonGlobalMetadata
  attr_accessor :challenge, :lastbattle
end
$saves = 0
module Game
  def self.save(**_a); $saves += 1; true; end
end
$game_temp      = Game_Temp.new
$game_switches  = SwitchStub.new
$game_variables = Hash.new(0)
$game_map       = Game_Map.new
$game_player    = Game_Player.new
$scene          = nil
$PokemonGlobal  = PokemonGlobalMetadata.new
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
8.times { |i| $player.badges[i] = true }
$bag            = PokemonBag.new
$stats          = GameStats.new

def eval_ruby(path)
  TOPLEVEL_BINDING.eval(File.read(path, encoding: "UTF-8"), path)
end
eval_ruby(File.join(SCRIPTS, "011_Battle/007_Other battle types/003_BattlePalaceBattle.rb"))
eval_ruby(File.join(SCRIPTS, "011_Battle/007_Other battle types/005_RecordedBattle.rb"))
Dir[File.join(SCRIPTS, "018_Alternate battle modes", "00*_Battle Frontier*", "*.rb")].sort.each { |f| eval_ruby(f) }
module Essentials; VERSION = "20.1"; end
eval_ruby(File.join(PLUGINS, "Pokemon Selection Before Battle", "Pokemon Selection Before Battle.rb"))

# Battles: no scene, no animation, both sides chosen by the AI.
$log = []
$errors = []
module PBDebug
  def self.logonerr
    yield
  rescue StandardError => e
    $log << "[exception]"
    $errors << "#{e.class}: #{e.message} @ #{e.backtrace[0..2].join(' < ')}"
    raise "Too many exceptions" if $errors.length > 10 && !$many_errors_ok
  end
end

class LogScene < Battle::DebugSceneNoLogging
  def pbDeluxeTriggers(*_a); end
  def pbDisplayMessage(msg, _brief = false); $log << msg; end
  alias pbDisplay pbDisplayMessage
  def pbDisplayPausedMessage(msg); $log << msg; end
  def pbDisplayConfirmMessage(msg); $log << "[confirm] #{msg}"; return true; end
  def pbSendOutBattlers(sendOuts, _startBattle = false)
    sendOuts.each { |idx, pkmn| $log << "[sendout] #{idx}: #{pkmn.name}" }
  end
  def pbFaintBattler(battler); $log << "[faint] #{battler.pbThis}"; end
end
module BattleCreationHelperMethods
  module_function
  def create_battle_scene; LogScene.new; end
  def prepare_battle(battle); battle.controlPlayer = true; end
end
def pbBattleAnimation(*_a); yield; end
def pbSceneStandby; yield; end
def pbGetTrainerBattleBGM(*_a); nil; end
# Compiler.write_trainer_lists would rewrite PBS/; record what it would write instead.
$saved = []
def save_data(data, file); $saved << [file, data]; end
module Compiler
  def self.write_trainer_lists(*_a); $saved << ["write_trainer_lists", nil]; end
end

#===============================================================================
# Helpers
#===============================================================================
# Errors are compared by kind only ("!error"); $err_log keeps the details.
$err_log = []
def err; yield; rescue StandardError, SystemStackError => e; $err_log << "#{e.class}: #{e.message}"; "!error"; end

FNV_PRIME = 16_777_619
def fnv(str)
  h = 2_166_136_261
  str.each_byte { |b| h = ((h ^ b) * FNV_PRIME) & 0xFFFFFFFF }
  h
end

def mon(spec)
  pkmn = Pokemon.new(spec["s"].to_sym, spec["l"] || 50, $player)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = spec["iv"] || 31
    pkmn.ev[s.id] = 0
  end
  pkmn.nature = (spec["n"] || "HARDY").to_sym
  pkmn.item = spec["i"] ? spec["i"].to_sym : nil
  if spec["m"]
    pkmn.forget_all_moves
    spec["m"].each { |m| pkmn.learn_move(m.to_sym) }
  end
  pkmn.name = spec["name"] if spec["name"]
  pkmn.steps_to_hatch = 100 if spec["egg"]
  pkmn.calc_stats
  pkmn.hp = 0 if spec["fainted"]
  pkmn
end

def desc(pkmn)
  return nil if !pkmn
  ivs = []
  evs = []
  GameData::Stat.each_main { |s| ivs << pkmn.iv[s.id]; evs << pkmn.ev[s.id] }
  ivs = ivs.join("/")
  evs = evs.join("/")
  "#{pkmn.species} L#{pkmn.level} exp=#{pkmn.exp} i=#{pkmn.item_id} n=#{pkmn.nature_id} a=#{pkmn.ability_id} g=#{pkmn.gender} " \
    "m=#{pkmn.moves.map(&:id).join(',')} iv=#{ivs} ev=#{evs} pid=#{pkmn.personalID} " \
    "hp=#{pkmn.hp}/#{pkmn.totalhp} st=#{pkmn.attack},#{pkmn.defense},#{pkmn.spatk},#{pkmn.spdef},#{pkmn.speed} hap=#{pkmn.happiness}"
end

def pbp(pk)
  # (PBPokemon.fromPokemon stores the GameData::Nature itself, where the PBS
  # reader stores its ID; everything that reads it accepts either.)
  nature = pk.nature.is_a?(GameData::Nature) ? pk.nature.id : pk.nature
  "#{pk.species};#{pk.item};#{nature};#{pk.ev.join(',')};#{pk.move1},#{pk.move2},#{pk.move3},#{pk.move4}"
end

def trainer_desc(t)
  { "type" => t.trainer_type.to_s, "name" => t.name, "id" => t.id, "lose" => t.lose_text, "win" => t.win_text,
    "party" => t.party.map { |p| desc(p) } }
end

out = {}

#===============================================================================
# data
#===============================================================================
$stderr.puts "== data #{Time.now}"
trlists = load_data("Data/trainer_lists.dat")
out["data"] = {
  "lists" => trlists.map do |tr|
    { "trainers" => tr[0].length, "pokemon" => tr[1].length, "challenges" => tr[2], "trainersFile" => tr[3],
      "pokemonFile" => tr[4], "isDefault" => tr[5],
      "trainersHash" => fnv(tr[0].map { |t| t.map { |x| x.is_a?(Array) ? x.join(",") : x.to_s }.join("|") }.join("\n")),
      "pokemonHash" => fnv(tr[1].map { |pk| pbp(pk) }.join("\n")),
      "firstTrainer" => tr[0][0].map { |x| x.is_a?(Array) ? x : x.to_s }, "firstPokemon" => pbp(tr[1][0]) }
  end,
  "keys" => {
    "species" => [GameData::Species.keys.length, fnv(GameData::Species.keys.join(","))],
    "moves" => [GameData::Move.keys.length, fnv(GameData::Move.keys.join(","))],
    "natures" => [GameData::Nature.keys.length, fnv(GameData::Nature.keys.join(","))],
    "trainerTypes" => [GameData::TrainerType.keys.length, fnv(GameData::TrainerType.keys.join(","))],
    "types" => fnv([].tap { |a| GameData::Type.each { |t| a << t.id } }.join(",")),
    "machines" => fnv([].tap { |a| GameData::Item.each { |i| a << i.move if i.is_machine? } }.join(","))
  },
  "fromInspected" => ["PIKACHU;LIGHTBALL;TIMID;SA,spd;THUNDERBOLT,QUICKATTACK,,", " BULBASAUR ; ; ; ; XYZMOVE,,, ",
                      "RATTATA;NOTANITEM;JOLLY;HP,ATK,DEF,SPATK,SPDEF,SPD,foo;RETURN,TACKLE,BITE,CRUNCH,HYPERFANG"].map { |s|
    pk = PBPokemon.fromInspected(s)
    $seq = SeqRandom.new(5)
    [pbp(pk), desc(pk.createPokemon(30, 20, nil)), err { pk.inspect }, pk.tocompact]
  }
}

#===============================================================================
# rules
#===============================================================================
$stderr.puts "== rules #{Time.now}"
MONS = [
  { "s" => "PIKACHU", "l" => 20, "i" => "LIGHTBALL", "m" => %w[THUNDERSHOCK QUICKATTACK] },
  { "s" => "PICHU", "l" => 5, "i" => "BERRYJUICE", "m" => %w[THUNDERSHOCK] },
  { "s" => "RATTATA", "l" => 5, "i" => "ORANBERRY", "m" => %w[TACKLE SONICBOOM], "name" => "Pikachu" },
  { "s" => "SQUIRTLE", "l" => 18, "i" => "ORANBERRY", "m" => %w[TACKLE BUBBLE] },
  { "s" => "MEWTWO", "l" => 70, "m" => %w[PSYCHIC] },
  { "s" => "TYRANITAR", "l" => 55, "i" => "LEFTOVERS", "m" => %w[CRUNCH ROCKSLIDE] },
  { "s" => "WOBBUFFET", "l" => 30, "m" => %w[COUNTER] },
  { "s" => "SLAKING", "l" => 60, "m" => %w[SLACKOFF] },
  { "s" => "TOGEPI", "l" => 3, "egg" => true },
  { "s" => "ONIX", "l" => 25, "m" => %w[ROCKTHROW] },
  { "s" => "MAGIKARP", "l" => 15, "fainted" => true, "m" => %w[SPLASH] },
  { "s" => "SCYTHER", "l" => 5, "m" => %w[QUICKATTACK] },
  { "s" => "LATIAS", "l" => 50, "i" => "SOULDEW", "m" => %w[DRAGONBREATH] },
  { "s" => "UNOWN", "l" => 50, "m" => %w[HIDDENPOWER] },
  { "s" => "CLEFFA", "l" => 30, "i" => "LEFTOVERS", "m" => %w[POUND] },
  { "s" => "PIKACHU", "l" => 50, "m" => %w[THUNDERBOLT], "name" => "Sparky" },
  { "s" => "ARCEUS", "l" => 80, "i" => "CUSTAPBERRY", "m" => %w[JUDGMENT] },
  { "s" => "PIDGEY", "l" => 20, "m" => %w[GUST] }
].freeze
TEAMS = [[0, 3, 9], [0, 15, 3], [0, 3, 5, 9], [1, 2, 11], [3, 9, 17], [5, 6, 7], [0, 3, 14, 9, 17, 12], [12, 13, 4],
         [8, 10, 3], [3], [], [2, 3, 9, 17, 0, 14]].freeze

RULESET_BUILDERS = {
  "pbPikaCupRules(false)" => -> { pbPikaCupRules(false) },
  "pbPikaCupRules(true)" => -> { pbPikaCupRules(true) },
  "pbPokeCupRules(false)" => -> { pbPokeCupRules(false) },
  "pbPrimeCupRules(true)" => -> { pbPrimeCupRules(true) },
  "pbFancyCupRules(false)" => -> { pbFancyCupRules(false) },
  "pbLittleCupRules(false)" => -> { pbLittleCupRules(false) },
  "pbStrictLittleCupRules(true)" => -> { pbStrictLittleCupRules(true) },
  "pbBattleTowerRules(false,false)" => -> { pbBattleTowerRules(false, false) },
  "pbBattleTowerRules(true,true)" => -> { pbBattleTowerRules(true, true) },
  "pbBattlePalaceRules(false,true)" => -> { pbBattlePalaceRules(false, true) },
  "pbBattleArenaRules(false)" => -> { pbBattleArenaRules(false) },
  "pbBattleFactoryRules(false,false)" => -> { pbBattleFactoryRules(false, false) },
  "pbBattleFactoryRules(true,true)" => -> { pbBattleFactoryRules(true, true) },
  "StandardCup" => -> { PokemonChallengeRules.new(StandardCup.new) },
  "DoubleCup" => -> { PokemonChallengeRules.new(DoubleCup.new) },
  "FancyCup" => -> { PokemonChallengeRules.new(FancyCup.new) },
  "LittleCup" => -> { PokemonChallengeRules.new(LittleCup.new) },
  "LightCup" => -> { PokemonChallengeRules.new(LightCup.new) },
  "modeToRules(nil,3,0,0)" => -> { BattleChallenge.new.modeToRules(nil, 3, 0, 0) },
  "modeToRules(true,4,1,1)" => -> { BattleChallenge.new.modeToRules(true, 4, 1, 1) },
  "modeToRules(true,3,2,2)" => -> { BattleChallenge.new.modeToRules(true, 3, 2, 2) },
  "selection(1,3)" => -> { PokemonSelection::Parameters.new.setMinPokemon(1).setMaxPokemon(3).challenge },
  "selection(3,3,fainted)" => -> { PokemonSelection::Parameters.new.setMinPokemon(3).setMaxPokemon(3).setAcceptFainted(true).challenge },
  "selection(2,6,types)" => -> {
    PokemonSelection::Parameters.new.setMinPokemon(2).setBaseChallenge(
      PokemonChallengeRules.new.addPokemonRule(TypeRestriction.new([:ELECTRIC, :WATER]))
    ).challenge
  },
  "nickname+restricted" => -> {
    PokemonChallengeRules.new.addTeamRule(NicknameClause.new)
                         .addSubsetRule(RestrictedSpeciesSubsetRestriction.new(:PIKACHU, :TYRANITAR)).setNumber(3)
  }
}.freeze

POKEMON_RULES = {
  "Standard" => -> { StandardRestriction.new }, "Height(2)" => -> { HeightRestriction.new(2) },
  "Weight(20)" => -> { WeightRestriction.new(20) }, "NegativeExtendedGame" => -> { NegativeExtendedGameClause.new },
  "Baby" => -> { BabyRestriction.new }, "UnevolvedForm" => -> { UnevolvedFormRestriction.new },
  "NonEgg" => -> { NonEggRestriction.new }, "Able" => -> { AblePokemonRestriction.new },
  "Species(PIKACHU,ONIX)" => -> { SpeciesRestriction.new(:PIKACHU, :ONIX) },
  "BannedSpecies(PIKACHU)" => -> { BannedSpeciesRestriction.new(:PIKACHU) },
  "MinimumLevel(20)" => -> { MinimumLevelRestriction.new(20) }, "MaximumLevel(20)" => -> { MaximumLevelRestriction.new(20) },
  "BannedItem(LEFTOVERS)" => -> { BannedItemRestriction.new(:LEFTOVERS) }, "ItemsDisallowed" => -> { ItemsDisallowedClause.new },
  "SoulDew" => -> { SoulDewClause.new }, "LittleCup" => -> { LittleCupRestriction.new },
  "BaseStat(300,500)" => -> { BaseStatRestriction.new(300, 500) }, "Nonlegendary" => -> { NonlegendaryRestriction.new },
  "Inverse(Nonlegendary)" => -> { InverseRestriction.new(NonlegendaryRestriction.new) }
}.freeze
TEAM_RULES = {
  "RestrictedSpecies(1,PIKACHU,ONIX)" => -> { RestrictedSpeciesRestriction.new(1, :PIKACHU, :ONIX) },
  "RestrictedSpeciesTeam(PIKACHU)" => -> { RestrictedSpeciesTeamRestriction.new(:PIKACHU) },
  "RestrictedSpeciesSubset(PIKACHU)" => -> { RestrictedSpeciesSubsetRestriction.new(:PIKACHU) },
  "SameSpecies" => -> { SameSpeciesClause.new }, "Species" => -> { SpeciesClause.new },
  "TotalLevel(50)" => -> { TotalLevelRestriction.new(50) }, "Item" => -> { ItemClause.new },
  "Nickname" => -> { NicknameClause.new }
}.freeze

$seq = SeqRandom.new(100)
mons = MONS.map { |s| mon(s) }
team = ->(t) { t.map { |i| mons[i] } }
out["rules"] = {
  "mons" => mons.map { |p| desc(p) },
  "rulesets" => RULESET_BUILDERS.map do |name, b|
    r = b.call
    rs = r.ruleset
    res = { "name" => name, "number" => rs.number, "minLength" => rs.minLength, "maxLength" => rs.maxLength,
            "minTeamLength" => rs.minTeamLength, "maxTeamLength" => rs.maxTeamLength,
            "suggestedNumber" => rs.suggestedNumber, "suggestedLevel" => rs.suggestedLevel,
            "levelAdjustment" => r.levelAdjustment&.class&.name, "battleType" => r.battletype.class.name.sub(/^.*::/, ""),
            "valid" => mons.map { |p| err { rs.isPokemonValid?(p) } },
            "hasValidTeam" => err { rs.hasValidTeam?(mons) },
            "hasRegistrableTeam" => err { rs.hasRegistrableTeam?(team.call([0, 3, 9, 17, 2, 14, 5])) } }
    res["teams"] = TEAMS.map do |t|
      errors = []
      v = err { rs.isValid?(team.call(t), errors) }
      [v, errors, err { rs.hasValidTeam?(team.call(t)) }, err { rs.canRegisterTeam?(team.call(t)) }]
    end
    res
  end,
  "pokemonRules" => POKEMON_RULES.map { |name, b| [name, mons.map { |p| err { b.call.isValid?(p) } }] },
  "teamRules" => TEAM_RULES.map do |name, b|
    [name, TEAMS.map { |t| [err { b.call.isValid?(team.call(t)) }, err { b.call.errorMessage }] }]
  end,
  "species" => [err { HeightRestriction.new(1).isValid?(:ONIX) }, err { WeightRestriction.new(10).isValid?(:PIKACHU) }]
}

#===============================================================================
# levels
#===============================================================================
$stderr.puts "== levels #{Time.now}"
LEVEL_ADJUSTMENTS = {
  "Fixed(50)" => -> { FixedLevelAdjustment.new(50) }, "Fixed(150)" => -> { FixedLevelAdjustment.new(150) },
  "Total(15,20,50)" => -> { TotalLevelAdjustment.new(15, 20, 50) },
  "Combined(Capped(30),nil)" => -> { CombinedLevelAdjustment.new(CappedLevelAdjustment.new(30), nil) },
  "SinglePlayerCapped(40)" => -> { SinglePlayerCappedLevelAdjustment.new(40) },
  "Capped(50)" => -> { CappedLevelAdjustment.new(50) }, "LevelBalance(5)" => -> { LevelBalanceAdjustment.new(5) },
  "Enemy(5)" => -> { EnemyLevelAdjustment.new(5) }, "Open(60)" => -> { OpenLevelAdjustment.new(60) },
  "Open()" => -> { OpenLevelAdjustment.new }, "LevelAdjustment(0)" => -> { LevelAdjustment.new(0) },
  "LevelAdjustment(3)" => -> { LevelAdjustment.new(3) }
}.freeze
out["levels"] = LEVEL_ADJUSTMENTS.map do |name, b|
  $seq = SeqRandom.new(7)
  t1 = [mons[0], mons[5], mons[4]].map(&:clone)
  t2 = [mons[3], mons[9], mons[17], mons[15]].map(&:clone)
  adj = b.call
  ret = err { adj.adjustLevels(t1, t2) }
  after = [t1.map { |p| "#{p.level}/#{p.totalhp}" }, t2.map { |p| "#{p.level}/#{p.totalhp}" }]
  err { adj.unadjustLevels(t1, t2, ret) } if ret.is_a?(Array)
  back = [t1.map { |p| "#{p.level}/#{p.exp}/#{p.totalhp}" }, t2.map { |p| "#{p.level}/#{p.exp}/#{p.totalhp}" }]
  rules = PokemonChallengeRules.new.setLevelAdjustment(err { b.call })
  bil = err { rules.adjustLevelsBilateral(t1, t2) }
  bilAfter = t1.map(&:level)
  err { rules.unadjustLevelsBilateral(t1, t2, bil) } if bil.is_a?(Array)
  { "name" => name, "type" => err { adj.type }, "ret" => ret, "after" => after, "back" => back,
    "bilateral" => bil.is_a?(Array) ? "adjusted" : bil, "bilAfter" => bilAfter, "bilBack" => t1.map(&:level) }
end

#===============================================================================
# foes
#===============================================================================
$stderr.puts "== foes #{Time.now}"
def set_challenge(id)
  $PokemonGlobal.challenge = nil
  pbBattleChallenge.instance_variable_set(:@currentChallenge, id)
end
bt_default = pbGetBTTrainers("towersingle")
bt_poke = pbGetBTTrainers("pokecupsingle")
foes = {}
$seq = SeqRandom.new(31)
foes["trainerIndex"] = [0, 5, 6, 7, 12, 13, 14, 20, 21, 27, 28, 34, 35, 41, 42, 48, 49, 60, 100].map do |w|
  [pbBattleChallengeTrainer(w, bt_default), pbBattleChallengeTrainer(w, bt_poke)]
end
foes["generated"] = [["towersingle", -> { pbBattleTowerRules(false, false) }, [0, 99, 100, 150, 219, 220, 299]],
                     ["towerdoubleopen", -> { pbBattleTowerRules(true, true) }, [10, 230]],
                     # (Cup rules never make a valid team here: their TotalLevelRestriction is a
                     # team rule and the suggested level is the maximum, so Ruby loops forever.)
                     ["pikacupsingle", -> { pbBattleTowerRules(false, false) }, [3, 150]],
                     ["littlecupdouble", -> { pbLittleCupRules(true) }, [7]]].flat_map do |id, rb, idxs|
  set_challenge(id)
  idxs.map do |i|
    $seq = SeqRandom.new(1000 + i)
    [id, i, trainer_desc(pbGenerateBattleTrainer(i, rb.call))]
  end
end
$stderr.puts "  factory"
foes["factory"] = [[0, 0, 0, false], [7, 15, 0, false], [21, 30, 3, false], [56, 50, 0, false], [3, 0, 0, true], [14, 22, 3, true]].map do |w, s, nrent, open|
  set_challenge(open ? "factorysingleopen" : "factorysingle")
  $seq = SeqRandom.new(2000 + w)
  rules = pbBattleFactoryRules(false, open)
  rentals = (0...nrent).map { |k| pbGetBTPokemon("factorysingle")[k * 37].createPokemon(50, 10, nil) }
  party = err { pbBattleFactoryPokemon(rules, w, s, rentals) }
  [w, s, nrent, open, party.is_a?(Array) ? party.map { |p| desc(p) } : party, rules.ruleset.minLength, rules.ruleset.maxLength]
end
$stderr.puts "  factory challenge"
# Battle Factory challenge: set (registers the factory data), start, rentals, swaps
$PokemonGlobal.challenge = nil
$seq = SeqRandom.new(77)
$player.party = [mon("s" => "PIKACHU", "l" => 30)]
pbBattleChallenge.set("factorysingle", 7, pbBattleFactoryRules(false, false))
pbBattleChallenge.start
fd = pbBattleChallenge.extra
fd.pbPrepareRentals
rentals = fd.instance_variable_get(:@rentals)
opp = fd.instance_variable_get(:@opponent)
fd.instance_variable_set(:@rentals, rentals[0, 3])
pbBattleChallenge.pbAddWin
fd.pbPrepareSwaps
foes["factoryChallenge"] = {
  "trainers" => pbBattleChallenge.instance_variable_get(:@bc).instance_variable_get(:@trainers),
  "rentals" => rentals.map { |p| desc(p) }, "opponent" => trainer_desc(opp),
  "next" => trainer_desc(fd.instance_variable_get(:@opponent)),
  "oldopponent" => fd.instance_variable_get(:@oldopponent).map { |p| desc(p) }
}
pbBattleChallenge.pbCancel
out["foes"] = foes

#===============================================================================
# generator
#===============================================================================
$stderr.puts "== generator #{Time.now}"
gen = {}
gen["legalMoves"] = [%w[PIKACHU 50], %w[SMEARGLE 50], %w[BULBASAUR 20], %w[EEVEE 100], %w[MAGIKARP 30],
                     %w[TYRANITAR 100], %w[DITTO 50], %w[SCIZOR 70], %w[GENGAR 50], %w[CHANSEY 50]].map do |s, l|
  [s, l.to_i, pbGetLegalMoves2(s.to_sym, l.to_i)]
end
$legalMoves = {}
$legalMovesLevel = 0
$seq = SeqRandom.new(4242)
rule50 = pbBattleTowerRules(false, false)
gen["random"] = (0...14).map { desc(pbRandomPokemonFromRule(rule50, nil)) }
$seq = SeqRandom.new(4343)
rule5 = pbLittleCupRules(false)
gen["randomLittle"] = (0...6).map { desc(pbRandomPokemonFromRule(rule5, nil)) }
$seq = SeqRandom.new(55)
pika = pbGetBTPokemon("pikacupsingle").first(60).map { |pk| pk.createPokemon(20, 31, nil) }
gen["duplicates"] = (0...12).map { |i| isBattlePokemonDuplicate(pika[i], pika[i + 1]) } +
                    [isBattlePokemonDuplicate(pika[0], pika[0].clone)]
gen["removeDuplicates"] = pbRemoveDuplicates(pika + pika.first(10)).map { |p| p.species.to_s }
gen["arrangeByTier"] = pbArrangeByTier(pika, rule50).map { |p| p.species.to_s }
$seq = SeqRandom.new(66)
party = pika.first(5)
pbReplenishBattlePokemon(party, rule50)
gen["replenish"] = party.map { |p| desc(p) }
$stderr.puts "  trainer info"
# Trainer info (saved lists and the PBS write are recorded, not written)
$saved = []
$seq = SeqRandom.new(88)
plist = pika.first(40)
# (With the Pika Cup's rules no team is ever valid (see foes), and finding that out
# for every trainer takes Ruby hours; the Tower's rules give the same work.)
pbTrainerInfo(plist, "pikacupsingle", pbBattleTowerRules(false, false))
saved = $saved.find { |f, _d| f == "Data/trainer_lists.dat" }[1]
pk_list = saved.find { |tr| tr[2].include?("pikacupsingle") }
gen["trainerInfo"] = {
  "files" => $saved.map(&:first), "lists" => saved.length, "isDefault" => pk_list[5],
  "trainers" => pk_list[0].first(12).map { |t| [t[0].to_s, t[1], t[5]] },
  "numbersHash" => fnv(pk_list[0].map { |t| t[5].join(",") }.join("|")),
  "pokemon" => pk_list[1].map { |pk| pbp(pk) }, "levels" => plist.map(&:level)
}
$seq = SeqRandom.new(99)
gen["trainerInfoNew"] = begin
  $saved = []
  pbTrainerInfo(pika.first(20), "brandnewcup", pbBattleTowerRules(false, false))
  s2 = $saved.find { |f, _d| f == "Data/trainer_lists.dat" }[1]
  { "lists" => s2.length, "last" => [s2[-1][2], s2[-1][3], s2[-1][4], s2[-1][5], s2[-1][0].length,
                                     fnv(s2[-1][0].map { |t| t[5].join(",") }.join("|"))] }
end
$stderr.puts "  ratings"
# Ratings and battles
$seq = SeqRandom.new(123)
pool = pbGetBTPokemon("towersingle")[300, 60].map { |pk| pk.createPokemon(50, 31, nil) }
trule = pbBattleTowerRules(false, false).copy.setNumber(2)
teams = (0...6).map { RuledTeam.new(pool, trule) }
gen["teams"] = teams.map { |t| t.team.map { |p| p.species.to_s } }
gen["poolLeft"] = pool.length
gen["decide"] = (0...6).map { |i| pbDecideWinner(teams[i].team, teams[(i + 1) % 6].team, 50 + i * 7, 61 - i) }
gen["scores"] = (0...3).map { |i| pbDecideWinnerScore(teams[i].team, teams[i + 3].team, 9) }
gen["effectiveness"] = [[:THUNDERBOLT, :WATER, :FLYING, nil], [:EARTHQUAKE, :ELECTRIC, :ELECTRIC, :LEVITATE],
                        [:TACKLE, :GHOST, :GHOST, nil], [:SHADOWBALL, :BUG, :GHOST, :WONDERGUARD],
                        [:FIREBLAST, :GRASS, :BUG, nil], [:GROWL, :NORMAL, :NORMAL, nil]].map do |m, t1, t2, a|
  pbDecideWinnerEffectiveness(m, t1, t2, a, [-16, -8, 0, 4, 12, 20])
end
k = 0
k += 1 while ((k * 829_348_651) + 12_345) % 2_147_483_647 % 100 != 0
$seq = SeqRandom.new(200)
rounds = []
3.times do
  teams.each_with_index do |t, j|
    pbRuledBattle(t, teams[(j + 2) % 6], trule)
  end
  rounds << teams.map { |t| [t.games, t.totalGames] }
end
teams.each(&:updateRating)
gen["ratings"] = { "rounds" => rounds, "after" => teams.map { |t| t.ratingRaw + [t.totalGames, t.rating] } }
$log = []
$errors = []
$seq = SeqRandom.new(k)
# Essentials Deluxe's pbAttackPhase calls the scene's pbDeluxeTriggers, which
# Battle::DebugSceneNoLogging doesn't have: every attack phase raises and the
# battle is decided on time after 100 rounds.
$many_errors_ok = true
pbRuledBattle(teams[0], teams[1], trule)
$many_errors_ok = false
gen["realBattle"] = { "seed" => k, "log" => $log, "errorCount" => $errors.length, "firstError" => $errors[0].to_s[0, 60],
                      "games" => [teams[0].games, teams[1].games],
                      "parties" => [teams[0].team.map { |p| desc(p) }, teams[1].team.map { |p| desc(p) }] }
elo = PlayerRatingElo.new
gen["elo"] = [elo.winChancePercent, err { elo.update([]) }, err { elo.update([SingleMatch.new(1500, 300, 1)]) }]
pr = PlayerRating.new
pr.update([])
gen["rating0"] = [pr.rating, pr.deviation, pr.volatility, pr.winChancePercent]
gen["errors"] = [err { teams[0].toStr }, err { teams[0].load(pool) }, err { teams[0].compare(teams[1]) }]
$seq = SeqRandom.new(300)
gen["names"] = [[0, nil, 0, 12], [1, nil, 1, 8], [2, nil, nil, 100], [3, nil, 0, 5], [0, nil, 2, 3]].map { |a| getRandomNameEx(*a) } +
               (0...5).map { getRandomNameEx(1, nil, 0, 12) }
out["generator"] = gen

#===============================================================================
# challenge
#===============================================================================
$stderr.puts "== challenge #{Time.now}"
def run_challenge(id, rounds, rules, party_specs, seed, max_battles)
  $PokemonGlobal.challenge = nil
  $seq = SeqRandom.new(seed)
  $saves = 0
  $player.party = party_specs.map { |s| mon(s) }
  extra = mon("s" => "PIDGEY", "l" => 10)
  $player.party.push(extra)
  res = { "eligibleBeforeSet" => err { pbHasEligible? }, "battles" => [] }
  pbBattleChallenge.set(id, rounds, rules)
  res["eligible"] = pbHasEligible?
  pbBattleChallenge.setParty($player.party[0, 3])
  pbBattleChallenge.start(0, rounds)
  res["trainers"] = pbBattleChallenge.instance_variable_get(:@bc).instance_variable_get(:@trainers)
  res["partyAfterStart"] = $player.party.map { |p| p.species.to_s }
  max_battles.times do
    $log = []
    $errors = []
    b = { "battleNumber" => pbBattleChallenge.battleNumber, "next" => pbBattleChallenge.nextTrainer,
          "speech" => pbBattleChallengeBeginSpeech }
    won = pbBattleChallengeBattle
    b["won"] = won
    b["log"] = $log
    b["errors"] = $errors
    b["party"] = $player.party.map { |p| desc(p) }
    b["record"] = !$game_temp.last_battle_record.nil?
    res["battles"] << b
    if won
      pbBattleChallenge.pbAddWin
      if pbBattleChallenge.pbMatchOver?
        pbBattleChallenge.setDecision(1)
        break
      end
      pbBattleChallenge.pbGoOn
    else
      pbBattleChallenge.setDecision(2)
      break
    end
  end
  res["decision"] = pbBattleChallenge.decision
  res["wins"] = pbBattleChallenge.wins
  pbRecordLastBattle
  pbBattleChallenge.pbEnd
  res["partyAfterEnd"] = $player.party.map { |p| p.species.to_s }
  res["results"] = [pbBattleChallenge.getCurrentWins(id), pbBattleChallenge.getPreviousWins(id), pbBattleChallenge.getMaxWins(id),
                    pbBattleChallenge.getPreviousWins(0), pbBattleChallenge.getMaxWins(0)]
  res["inChallenge"] = pbBattleChallenge.pbInChallenge?
  res["saves"] = $saves
  res["lastbattle"] = !$PokemonGlobal.lastbattle.nil?
  res
end

strong = [{ "s" => "TYRANITAR", "l" => 70, "n" => "ADAMANT", "i" => "LEFTOVERS", "m" => %w[CRUNCH ROCKSLIDE EARTHQUAKE DRAGONDANCE] },
          { "s" => "SALAMENCE", "l" => 70, "n" => "JOLLY", "i" => "CHOICEBAND", "m" => %w[DRAGONCLAW FLY EARTHQUAKE CRUNCH] },
          { "s" => "DRAGONITE", "l" => 70, "n" => "ADAMANT", "i" => "SITRUSBERRY", "m" => %w[OUTRAGE EXTREMESPEED FIREPUNCH EARTHQUAKE] }]
weak = [{ "s" => "CATERPIE", "l" => 12, "m" => %w[TACKLE STRINGSHOT] },
        { "s" => "WEEDLE", "l" => 12, "m" => %w[POISONSTING] },
        { "s" => "MAGIKARP", "l" => 15, "m" => %w[SPLASH TACKLE] }]
out["challenge"] = [
  ["tower single lv50", "towersingle", 7, -> { pbBattleTowerRules(false, false) }, strong, 11, 7],
  ["tower single open, lost", "towersingleopen", 7, -> { pbBattleTowerRules(false, true) }, weak, 12, 3],
  ["tower double, 3 rounds", "towerdouble", 3, -> { pbBattleTowerRules(true, false) }, strong + [weak[0]], 13, 3]
].map do |name, id, n, rb, party, seed, maxb|
  { "name" => name, "id" => id }.merge(run_challenge(id, n, rb.call, party, seed, maxb))
end

#===============================================================================
# swap
#===============================================================================
$stderr.puts "== swap #{Time.now}"
class FakeSwapScene
  attr_reader :calls
  def initialize(script); @script = script; @calls = []; end
  def nxt(kind); v = @script.shift; @calls << "#{kind}=#{v.inspect}"; v; end
  def pbStartRentScene(rentals); @calls << "startRent(#{rentals.length})"; end
  def pbStartSwapScene(cur, new); @calls << "startSwap(#{cur.length},#{new.length})"; end
  def pbChoosePokemon(canCancel); nxt("choose(#{canCancel})"); end
  def pbShowCommands(commands); nxt("commands(#{commands.join('|')})"); end
  def pbConfirm(message); nxt("confirm(#{message})"); end
  def pbSummary(list, index); @calls << "summary(#{list[index].species})"; end
  def pbUpdateChoices(choices); @calls << "choices(#{choices.join(',')})"; end
  def pbSwapChosen(i); @calls << "swapChosen(#{i})"; end
  def pbSwapCanceled; @calls << "swapCanceled"; end
  def pbEndScene; @calls << "end"; end
end
$seq = SeqRandom.new(400)
rent = pbGetBTPokemon("towersingle").first(6).map { |pk| pk.createPokemon(50, 10, nil) }
theirs = pbGetBTPokemon("towersingle")[100, 3].map { |pk| pk.createPokemon(50, 10, nil) }
SWAPS = [
  ["rent", [0, 1, 2, 0, 2, 1, 4, 1, false, 4, 2, 1, 1, 2, 1, true]],
  ["rent deselect", [3, 1, 3, 1, 5, 1, 0, 1, 1, 1, true]],
  ["swap accept", [1, 1, 2, true]],
  ["swap via pkmn-for-swap", [0, 0, 2, 1, -2, 2, 1, 0, false, 1, true]],
  ["swap quit", [-1, false, 0, 2, 2, 1, -1, true]]
].freeze
out["swap"] = SWAPS.map do |name, script|
  scene = FakeSwapScene.new(script.dup)
  screen = BattleSwapScreen.new(scene)
  cur = rent[0, 3].dup
  r = name.start_with?("rent") ? screen.pbStartRent(rent).map { |p| p.species.to_s } : screen.pbStartSwap(cur, theirs)
  { "name" => name, "script" => script, "result" => r, "current" => cur.map { |p| p.species.to_s }, "calls" => scene.calls }
end

File.write(File.join(ROOT, "web/src/game/frontier/battleFrontierReference.json"), JSON.pretty_generate(out) + "\n")
puts "wrote web/src/game/frontier/battleFrontierReference.json"
out["challenge"].each do |c|
  puts "#{c['name']}: decision #{c['decision']}, wins #{c['wins']}, battles #{c['battles'].map { |b| b['won'] }}, " \
       "errors #{c['battles'].map { |b| b['errors'].length }.sum}"
end
