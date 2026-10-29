# Reference values for the trainer battle and special battle type ports
# (web/src/game/battle, web/src/game/trainers): runs the game's real Ruby
# (see essentials.rb) and writes web/src/game/battle/specialBattlesReference.json,
# which web/src/game/battle/specialBattles.test.ts compares the TypeScript against.
#
#   cd web && ruby tools/ruby-ref/special_battles_reference.rb
#
# - Trainers from this game's early maps: TrainerBattle.generate_foes (party,
#   items, party starts), base money, AI skill, the prize money a win pays
#   (Battle#pbGainMoney) and the money a loss costs (Battle#pbLoseMoney) for
#   each badge count.
# - SafariBattle#pbEscapeRate, and whole Safari battles with scripted commands
#   (Ball/Bait/Rock/Run): messages, catch/escape factors, Ball count, outcome.
# - pbBugContestScore, and BugContestState's contestant draw and placings.
# - Roaming Pokémon movement (pbRoamPokemon) and pbResetAllRoamers.
# - The Poké Radar's choice of shaking grass (pbPokeRadarHighlightGrass).
#
# Randomness is the counter-based sequence battle_reference.rb uses
# (((k * 829348651 + 12345) % 2147483647) % x); the test replays it.

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)

#===============================================================================
# Deterministic randomness
#===============================================================================
class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end
$seq = SeqRandom.new
# Replaces Essentials' own top-level rand (001_Technical/002_RubyUtilities.rb:271),
# which the game's code calls.
def rand(x = 0)
  return x.min + $seq.next(x.max - x.min + 1) if x.is_a?(Range)
  $seq.next(x.to_i)
end

#===============================================================================
# Globals
#===============================================================================
class Game_Temp
  attr_accessor :encounter_type, :poke_radar_data, :force_single_battle, :roamer_index_for_encounter
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end
class PokemonGlobalMetadata
  attr_accessor :partner, :bicycle, :encounter_version
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end
class SwitchStub
  def initialize; @on = {}; end
  def [](i); @on[i] || false; end
  def []=(i, v); @on[i] = v; end
end
# 016_UI/022_UI_PurifyChamber.rb adds this to Player (Item#is_snag_ball? reads it)
class Player; attr_accessor :has_snag_machine; end
# ZUD's Adventure_Main.rb:462 (not loaded): no Max Lair is ever in progress here.
def inMaxLair?; false; end
$game_temp      = Game_Temp.new
$game_switches  = SwitchStub.new
$game_variables = Hash.new(0)
$PokemonGlobal  = PokemonGlobalMetadata.new
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
$bag            = PokemonBag.new
$stats          = GameStats.new
$PokemonStorage = nil
$PokemonSystem  = Struct.new(:givenicknames).new(1) # don't ask to nickname caught Pokémon

def eval_ruby(file)
  path = File.join(SCRIPTS, file)
  TOPLEVEL_BINDING.eval(File.read(path, encoding: "UTF-8"), path)
end

# Extracts `def name ... end` / `class Name ... end` (top-level, matched by
# indentation) from a script, for files that can't load whole headless.
def eval_part(file, header)
  path = File.join(SCRIPTS, file)
  lines = File.read(path, encoding: "UTF-8").lines
  start = lines.index { |l| l.start_with?(header) }
  raise "#{header} not found in #{file}" if !start
  stop = (start + 1...lines.length).find { |i| lines[i].start_with?("end") }
  TOPLEVEL_BINDING.eval(lines[start..stop].join, path, start + 1)
end

eval_ruby("015_Trainers and player/002_Trainer_LoadAndNew.rb")
eval_ruby("012_Overworld/002_Battle triggering/001_Overworld_BattleStarting.rb")

out = {}

#===============================================================================
# Trainers
#===============================================================================
TRAINERS = [
  [:Rival, "???", 1], [:Rival, "???", 2], [:Rival, "???", 3], [:YOUNGSTER, "Joey", 0], [:YOUNGSTER, "Joey", 1],
  [:BUGCATCHER, "Don", 0], [:YOUNGSTER, "Mario", 0], [:BEAUTY, "Samantha", 0], [:LASS, "Carrie", 0],
  [:LEADER_Whitney, "Whitney", 0], [:LEADER_Whitney, "Whitney", 3], [:BUGCATCHER, "Wade", 0], [:YOUNGSTER, "Albert", 0],
  [:PICNICKER, "Liz", 0], [:FISHERMAN, "Henry", 0], [:CAMPER, "Roland", 0], [:BIRDKEEPER, "Peter", 0],
  [:PSYCHIC_Male, "Mark", 0], [:MONGE, "Chow", 0], [:ELDER, "Li", 0], [:BIRDKEEPER, "Abe", 0],
  [:LEADER_Falkner, "Falkner", 0], [:LEADER_Falkner, "Falkner", 2], [:HIKER, "Daniel", 0], [:KINDLER, "Bill", 0],
  [:POKeMANIAC, "Larry", 0], [:HIKER, "Anthony", 1], [:Rival, "???", 4], [:ROCKET_Male, "Grunt", 1],
  [:ROCKET_Female, "Grunt", 1], [:ROCKET_PROTON, "Proton", 1], [:TWINS, "Amy & May", 0], [:LEADER_Bugsy, "Bugsy", 0],
  [:LEADER_Bugsy, "Bugsy", 2], [:TIMETRAVELER, "Hideyoshi", 0], [:POKeFAN_Male, "Brandon", 0], [:SUPERNERD, "Eric", 0],
  [:BOYFRIEND, "Boy", 1], [:GIRLFRIEND, "Girl", 4], [:LEADER_Whitney, "Whitney", 2],
].freeze

def summarize_pokemon(pk)
  { "species" => pk.species.to_s, "level" => pk.level, "item" => pk.item_id&.to_s, "hp" => pk.hp, "totalhp" => pk.totalhp }
end

class MoneyScene < Battle::DebugSceneNoLogging
  def pbDisplayPausedMessage(msg); ($money_msgs ||= []) << msg; end
  def pbDisplayMessage(msg, *_a); ($money_msgs ||= []) << msg; end
  def pbDeluxeTriggers(*_a); end
end

player_party = [Pokemon.new(:CYNDAQUIL, 14, $player), Pokemon.new(:PIDGEY, 9, $player)]
out["trainers"] = TRAINERS.map do |type, name, version|
  $seq = SeqRandom.new
  trainers, items, party, starts = TrainerBattle.generate_foes(type, name, version)
  tr = trainers[0]
  # Prize money for beating this trainer, and money lost to them, by badge count
  $player.party = player_party
  gain = []
  lose = []
  [0, 3, 2000, 999_999].each do |money|
    $player.money = money
    scene = MoneyScene.new
    battle = Battle.new(scene, $player.party, tr.party, $player, [tr])
    battle.internalBattle = true
    battle.pbGainMoney
    gain << $player.money
  end
  (0..9).each do |badges|
    $player.badges = Array.new(badges, true)
    [0, 100, 5000].each do |money|
      $player.money = money
      scene = MoneyScene.new
      battle = Battle.new(scene, $player.party, tr.party, $player, [tr])
      battle.internalBattle = true
      battle.pbLoseMoney
      lose << $player.money
    end
  end
  $player.badges = []
  {
    "id" => [type.to_s, name, version], "name" => tr.name, "type" => tr.trainer_type.to_s,
    "baseMoney" => tr.base_money, "skill" => tr.skill_level, "items" => items.map { |i| i.map(&:to_s) },
    "starts" => starts, "loseText" => tr.lose_text, "party" => party.map { |pk| summarize_pokemon(pk) },
    "gain" => gain, "lose" => lose,
  }
end

# Two trainers at once (pbDoubleTrainerBattle's argument list)
$seq = SeqRandom.new
trainers, items, party, starts = TrainerBattle.generate_foes(:YOUNGSTER, "Joey", 0, :BUGCATCHER, "Don", 0)
out["doubleFoes"] = { "names" => trainers.map(&:name), "items" => items.map { |i| i.map(&:to_s) }, "starts" => starts,
                      "party" => party.map { |pk| summarize_pokemon(pk) } }
$player.money = 3000
$player.party = player_party
battle = Battle.new(MoneyScene.new, $player.party, party, $player, trainers)
battle.internalBattle = true
battle.party2starts = starts
battle.pbGainMoney
out["doubleFoes"]["gain"] = $player.money

#===============================================================================
# Safari Zone
#===============================================================================
# The scene half (data box, bait/rock animations) needs these to load.
class Battle::Scene::Animation; module BallAnimationMixin; end; end
eval_ruby("011_Battle/007_Other battle types/001_SafariBattle.rb")

out["safariEscapeRate"] = [3, 45, 46, 60, 61, 120, 121, 250, 251, 255].map { |c| SafariBattle.allocate.pbEscapeRate(c) }

class SafariScene
  attr_reader :log
  def initialize(commands); @commands = commands.dup; @log = []; end
  def pbSafariCommandMenu(_i); c = @commands.shift; @log << "cmd #{c}"; c.nil? ? 3 : c; end
  def pbDisplayMessage(msg, *_a); @log << msg; end
  def pbDisplayPausedMessage(msg); @log << msg; end
  def pbDisplayConfirmMessage(msg); @log << "?#{msg}"; false; end
  def pbThrow(ball, shakes, critical, target, showplayer); @log << "throw #{ball} #{shakes} #{critical} #{target} #{showplayer}"; end
  def pbThrowSuccess; @log << "success"; end
  def pbEndBattle(d); @log << "end #{d}"; end
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

SAFARI_CASES = [
  [:NIDORANfE, 22, [0, 0, 0, 0, 0, 0]],
  [:RHYHORN, 25, [1, 1, 0, 0, 0, 0, 0]],
  [:CHANSEY, 23, [2, 0, 2, 0, 1, 0, 0]],
  [:SCYTHER, 25, [2, 2, 0, 0, 0, 0]],
  [:EXEGGCUTE, 24, [3]],
  [:VENONAT, 22, [1, 2, 1, 2, 1, 0, 0, 0]],
  [:TAUROS, 28, [0, 1, 0, 2, 0, 0, 0, 0]],
  [:KANGASKHAN, 25, [0, 0]],
].freeze
out["safari"] = SAFARI_CASES.each_with_index.map do |(species, level, cmds), n|
  $player.party = [Pokemon.new(:CYNDAQUIL, 14, $player)]
  pkmn = Pokemon.new(species, level)
  $seq = SeqRandom.new(1000 * (n + 1)) # (after making the Pokémon, which use rand too)
  scene = SafariScene.new(cmds)
  battle = SafariBattle.new(scene, $player, [pkmn])
  battle.ballCount = (n == 7) ? 2 : 6
  battle.define_singleton_method(:pbRandom) { |x| $seq.next(x) }
  decision = battle.pbStartBattle
  { "species" => species.to_s, "level" => level, "commands" => cmds, "start" => 1000 * (n + 1),
    "decision" => decision, "balls" => battle.ballCount, "log" => scene.log, "partySize" => $player.party.length }
end

#===============================================================================
# Bug-Catching Contest
#===============================================================================
eval_part("018_Alternate battle modes/002_BugContest.rb", "def pbBugContestScore")
BUG_SCORES = [
  [:CATERPIE, 7, 31, 1.0], [:WEEDLE, 10, 0, 0.5], [:SCYTHER, 13, 20, 0.33], [:PINSIR, 14, 15, 0.9],
  [:VENONAT, 12, 31, 0.1], [:BUTTERFREE, 12, 7, 1.0], [:BEEDRILL, 13, 25, 0.75], [:PARAS, 10, 3, 0.6],
  [:METAPOD, 9, 30, 0.01], [:KAKUNA, 8, 12, 0.42],
].freeze
out["bugContestScores"] = BUG_SCORES.map do |species, level, iv, hpfrac|
  pkmn = Pokemon.new(species, level)
  GameData::Stat.each_main { |s| pkmn.iv[s.id] = (iv + s.pbs_order) % 32 }
  pkmn.calc_stats
  pkmn.hp = [(pkmn.totalhp * hpfrac).floor, 1].max
  { "species" => species.to_s, "level" => level, "iv" => pkmn.iv.transform_keys(&:to_s), "hp" => pkmn.hp, "score" => pbBugContestScore(pkmn) }
end
# The contestants pbStart draws, and where the player places
eval_part("018_Alternate battle modes/002_BugContest.rb", "class BugContestState")
out["bugContestDraws"] = [0, 77, 4242].map do |start|
  $player.party = [Pokemon.new(:CYNDAQUIL, 14, $player), Pokemon.new(:PIDGEY, 9, $player)]
  $seq = SeqRandom.new(start)
  st = BugContestState.new
  st.pbSetPokemon(1)
  st.pbStart(20)
  { "start" => start, "contestants" => st.instance_variable_get(:@contestants),
    "party" => $player.party.map { |p| p.species.to_s }, "other" => st.instance_variable_get(:@otherparty).map { |p| p.species.to_s } }
end
out["bugContestPlaces"] = [[[-1, :SCYTHER, 300], [2, :PINSIR, 290], [4, :VENONAT, 200]],
                           [[3, :SCYTHER, 300], [-1, :PINSIR, 290], [4, :VENONAT, 200]],
                           [[3, :SCYTHER, 300], [1, :PINSIR, 290], [4, :VENONAT, 200]]].map do |places|
  st = BugContestState.new
  st.instance_variable_set(:@places, places)
  st.place
end

#===============================================================================
# Roaming Pokémon
#===============================================================================
eval_part("012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb", "def pbResetAllRoamers")
eval_part("012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb", "def pbRoamingAreas")
eval_part("012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb", "def pbRandomRoam")
eval_part("012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb", "def pbRoamPokemon")
eval_part("012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb", "def pbRoamPokemonOne")
class PokemonGlobalMetadata
  attr_accessor :roamPosition, :roamedAlready, :roamEncounter, :roamPokemon
  attr_writer :roamPokemonCaught
  def roamPokemonCaught; return @roamPokemonCaught || []; end
end
out["roaming"] = [[false, false], [true, false], [true, true]].map do |sw752, sw999|
  $seq = SeqRandom.new(sw752 ? (sw999 ? 300 : 200) : 100)
  $game_switches[752] = sw752
  $game_switches[999] = sw999
  $PokemonGlobal.roamPosition = nil
  $PokemonGlobal.roamPokemon = nil
  steps = (0...40).map do
    pbRoamPokemon
    $PokemonGlobal.roamPosition.to_a.map { |k, v| [k, v] }
  end
  { "switch752" => sw752, "switch999" => sw999, "steps" => steps }
end
# pbResetAllRoamers after a defeat (roamPokemonCaught is never stored)
$PokemonGlobal.roamPokemon = [true, true, nil, nil, true]
$PokemonGlobal.roamPokemonCaught[0] = false
$PokemonGlobal.roamPokemonCaught[1] = true
pbResetAllRoamers
out["roamReset"] = $PokemonGlobal.roamPokemon.map { |v| v == true }

#===============================================================================
# Poké Radar
#===============================================================================
GrassTag = Struct.new(:land_wild_encounters, :shows_grass_rustle)
class RadarMap
  attr_reader :width, :height
  def initialize(w, h, holes); @width = w; @height = h; @holes = holes; end
  def terrain_tag(x, y); @holes.include?([x, y]) ? GrassTag.new(false, false) : GrassTag.new(true, true); end
end
RadarPlayer = Struct.new(:x, :y)
class RadarSpriteset; def addUserAnimation(*_a); end; end
class RadarScene; def spriteset(*_a); RadarSpriteset.new; end; end
$scene = RadarScene.new
eval_part("013_Items/005_Item_PokeRadar.rb", "def pbPokeRadarCancel")
eval_part("013_Items/005_Item_PokeRadar.rb", "def pbPokeRadarHighlightGrass")
out["pokeRadar"] = [[10, 10, 0, []], [1, 1, 0, [[3, 3]]], [20, 15, 5, []], [12, 8, 45, [[11, 7], [13, 9]]], [0, 0, 2, []]].map do |px, py, chain, holes|
  $seq = SeqRandom.new(px * 100 + py + chain)
  $game_map = RadarMap.new(24, 18, holes)
  $game_player = RadarPlayer.new(px, py)
  $game_temp.poke_radar_data = [0, 0, chain, [], false]
  pbPokeRadarHighlightGrass(false)
  { "player" => [px, py], "chain" => chain, "holes" => holes, "start" => px * 100 + py + chain,
    "grasses" => $game_temp.poke_radar_data ? $game_temp.poke_radar_data[3] : nil }
end

File.write(File.join(ROOT, "web/src/game/battle/specialBattlesReference.json"), JSON.pretty_generate(out) + "\n")
puts "wrote web/src/game/battle/specialBattlesReference.json"
