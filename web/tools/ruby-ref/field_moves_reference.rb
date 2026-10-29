# Runs the game's real field move and fishing code headless and writes
# web/src/game/field/fieldMovesReference.json, which
# web/src/game/field/fieldMoves.test.ts replays against the TypeScript port:
#
# - 012_Overworld/004_Overworld_FieldMoves.rb (HiddenMoveHandlers, pbCut,
#   pbHeadbutt / pbHeadbuttEffect, pbRockSmash / pbRockSmashRandomEncounter,
#   pbStrength, pbWaterfall, ...),
# - 012_Overworld/005_Overworld_Fishing.rb (pbFishing and its waits),
# - Improved Field Skills ([001] Field Skills.rb: pbBadgeFromSkill,
#   Pokemon#has_field_skill?, Trainer#get_pokemon_with_move),
# - Pokemon Silver Chronicles Helpers/Whilrpool HM.rb,
# - 012_Overworld/002_Battle triggering/003_Overworld_WildEncounters.rb for
#   Rock Smash's encounter roll, on this game's encounter tables.
#
#   cd web && ruby tools/ruby-ref/field_moves_reference.rb
#
# Kernel#rand is replaced by a queue of raw numbers (rand(n) = raw % n,
# rand(a..b) = a + raw % (b - a + 1)); the TypeScript test replays the same
# numbers. The screens and the overworld are stubs that record what they're
# asked to do. Graphics.frame_rate is 40, as in the game; the fishing
# scenarios compare times in seconds.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_file(path, filter = nil)
  code = File.read(path, encoding: "UTF-8").scrub
  code = filter.call(code) if filter
  TOPLEVEL_BINDING.eval(code, path)
end

#===============================================================================
# Stubs the loaded files need at load time
#===============================================================================
module MenuHandlers; def self.add(*_a); end; end unless defined?(MenuHandlers)
module Compiler; PLUGIN_FILES = []; end unless defined?(Compiler::PLUGIN_FILES)
def pbPokeRadarOnShakingGrass; false; end
def pbInBugContest?; false; end
def pbInSafari?; false; end

eval_game_file(File.join(SCRIPTS, "012_Overworld", "003_Overworld_Time.rb"))
eval_game_file(File.join(SCRIPTS, "012_Overworld", "002_Battle triggering", "003_Overworld_WildEncounters.rb"))
eval_game_file(File.join(SCRIPTS, "012_Overworld", "004_Overworld_FieldMoves.rb"))
eval_game_file(File.join(SCRIPTS, "012_Overworld", "005_Overworld_Fishing.rb"))
eval_game_file(File.join(PLUGINS, "Pokemon Silver Chronicles Helpers", "Whilrpool HM.rb"))
eval_game_file(File.join(PLUGINS, "Improved Field Skills", "[000] Settings.rb"))
eval_game_file(File.join(PLUGINS, "Improved Field Skills", "[001] Field Skills.rb"))

#===============================================================================
# Recording stubs
#===============================================================================
$log = []
$answers = []

def pbMessage(message, *_args)
  $log << ["msg", message]
  0
end

def pbConfirmMessage(message)
  ret = $answers.empty? ? false : $answers.shift
  $log << ["confirm", message, ret]
  ret
end

def pbHiddenMoveAnimation(pokemon, _field_move = false)
  $log << ["animation", pokemon ? pokemon.name : nil]
  !pokemon.nil?
end

$encounter_results = []
def pbEncounter(enc_type, only_single = true)
  ret = $encounter_results.empty? ? true : $encounter_results.shift
  $log << ["encounter", enc_type.to_s, only_single, ret]
  ret
end

def pbSmashEvent(event)
  $log << ["smash", event.name]
end

def pbAscendWaterfall
  $log << ["ascendWaterfall"]
end

def pbFadeOutIn(*_a); yield if block_given?; end
# Map names come from MapInfos.rxdata, which isn't loaded: both sides use "MAP<id>".
def pbGetMapNameFromId(id); "MAP#{id}"; end

# Fishing's screen
$frame = 0
$phase = "other"
$phase_frame = 0
$phase_frames = Hash.new(0)
$press = nil

module Graphics
  def self.update
    $frame += 1
    $phase_frame += 1
    $phase_frames[$phase] += 1
  end
end

module Input
  def self.trigger?(button)
    return false unless [Input::USE, Input::BACK].include?(button)
    return false unless $press && $press["phase"] == $phase && $press["index"] == $phase_index[$phase]
    $phase_frame / 40.0 >= $press["seconds"]
  end
  def self.update; end
end

def pbCreateMessageWindow(*_a); :msgwindow; end
def pbDisposeMessageWindow(_w); end
def pbMessageDisplay(_w, text, letterbyletter = true, *_a)
  $log << ["display", text, letterbyletter]
end
def pbCommonEvent(id); return false if id < 0; true; end

alias __ref_pbWaitMessage pbWaitMessage
def pbWaitMessage(msg_window, time)
  enter_phase("dots")
  ret = __ref_pbWaitMessage(msg_window, time)
  enter_phase("other")
  ret
end
alias __ref_pbWaitForInput pbWaitForInput
def pbWaitForInput(msg_window, message, frames)
  enter_phase("bite")
  ret = __ref_pbWaitForInput(msg_window, message, frames)
  enter_phase("other")
  ret
end
$phase_index = Hash.new(0)
def enter_phase(phase)
  $phase_index[phase] += 1 if phase != "other"
  $phase = phase
  $phase_frame = 0
end

class StubSpriteset
  def addUserAnimation(id, x, y, tinting, height)
    $log << ["userAnimation", id, x, y, tinting, height]
  end
end
class StubScene; def spriteset; StubSpriteset.new; end; end
$scene = StubScene.new

class StubGlobal
  attr_accessor :surfing, :diving, :bicycle, :fishing, :escapePoint, :healingSpot, :flashUsed,
                :encounter_version, :repel, :partner
  def initialize
    @surfing = false; @diving = false; @bicycle = false; @fishing = false
    @escapePoint = []; @healingSpot = nil; @flashUsed = false; @encounter_version = 0; @repel = 0
  end
end
class StubPokemonMap
  attr_accessor :strengthUsed, :blackFluteUsed, :whiteFluteUsed
  def initialize; @strengthUsed = false; @blackFluteUsed = false; @whiteFluteUsed = false; end
end
StubEvent = Struct.new(:id, :name, :x, :y)
class StubMap
  attr_accessor :map_id, :passable
  def initialize(id, passable); @map_id = id; @passable = passable; end
  def metadata; GameData::MapMetadata.try_get(@map_id); end
  def passable?(*_a); @passable; end
  def terrain_tag(_x, _y); GameData::TerrainTag.get($stub_terrain); end
end
class StubFactory
  def getTerrainTag(_map, _x, _y); GameData::TerrainTag.get($stub_surface_terrain); end
end
class StubPlayer
  attr_accessor :x, :y, :direction, :can_transfer, :terrain, :facing_terrain, :facing_event, :pattern, :lock_pattern
  def can_map_transfer_with_follower?; @can_transfer; end
  def can_ride_vehicle_with_follower?; @can_transfer; end
  def pbTerrainTag(_c = false); GameData::TerrainTag.get(@terrain); end
  def terrain_tag; GameData::TerrainTag.get(@terrain); end
  def pbFacingTerrainTag(_d = nil); GameData::TerrainTag.get(@facing_terrain); end
  def pbFacingEvent(_ignore = false); @facing_event; end
  def set_movement_type(type); $log << ["movementType", type.to_s]; end
  def straighten; end
  def refresh_charset; end
end
class StubSystem; attr_accessor :encounter_disabled; end

$rolls = []
$used = []
$scripting = false
$setup_rng = Random.new(1)
# Essentials' top-level rand calls Kernel.rand (001_Technical/002_RubyUtilities.rb).
class << Kernel
  # Scripted only around the call under test ($scripting); world setup (IVs,
  # trainer IDs) uses a fixed real generator.
  def rand(arg = nil, _b = nil)
    if !$scripting
      return arg.first + $setup_rng.rand(arg.last - arg.first + 1) if arg.is_a?(Range)
      return arg ? $setup_rng.rand(arg) : $setup_rng.rand
    end
    raise "out of scripted rolls" if $rolls.empty?
    raw = $rolls.shift
    $used.push(raw)
    case arg
    when Range then arg.first + (raw % (arg.last - arg.first + 1))
    when Integer then raw % arg
    else raise "unexpected rand(#{arg.inspect})"
    end
  end
end

#===============================================================================
# World setup
#===============================================================================
def build_pokemon(spec)
  species, level, moves, ability_index = spec
  pkmn = Pokemon.new(species.to_sym, level, $player)
  if moves
    pkmn.forget_all_moves
    moves.each { |m| pkmn.learn_move(m.to_sym) }
  end
  pkmn.ability_index = ability_index if ability_index
  pkmn.ability = nil
  pkmn
end

def setup_world(w)
  $log = []
  $answers = (w["answers"] || []).dup
  $encounter_results = (w["encounters"] || []).dup
  $rolls = (w["rolls"] || []).dup
  $used = []
  $game_temp = Game_Temp.new rescue nil
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = w["trainerId"] || 12_345_678
  $player.character_ID = 1
  $player.badges = Array.new(8) { |i| i < (w["badges"] || 0) }
  (w["party"] || [["PIKACHU", 20]]).each { |spec| $player.party << build_pokemon(spec) }
  $stats = GameStats.new
  $PokemonGlobal = StubGlobal.new
  (w["global"] || {}).each { |k, v| $PokemonGlobal.send("#{k}=", v) }
  $PokemonMap = StubPokemonMap.new
  $PokemonMap.strengthUsed = !!w["strengthUsed"]
  $game_system = StubSystem.new
  $game_system.encounter_disabled = false
  $game_map = StubMap.new(w["map"] || 139, w.key?("passable") ? w["passable"] : true)
  $map_factory = StubFactory.new
  $stub_terrain = (w["terrain"] || "None").to_sym
  $stub_surface_terrain = (w["surfaceTerrain"] || "None").to_sym
  $game_player = StubPlayer.new
  $game_player.x = w["x"] || 10
  $game_player.y = w["y"] || 10
  $game_player.direction = w["direction"] || 8
  $game_player.can_transfer = w.key?("canTransfer") ? w["canTransfer"] : true
  $game_player.terrain = (w["terrain"] || "None").to_sym
  $game_player.facing_terrain = (w["facingTerrain"] || "None").to_sym
  ev = w["facingEvent"]
  $game_player.facing_event = ev ? StubEvent.new(ev[0], ev[1], ev[2], ev[3]) : nil
  $PokemonEncounters = PokemonEncounters.new
  $PokemonEncounters.setup($game_map.map_id)
  $frame = 0
  $phase = "other"
  $phase_frame = 0
  $phase_frames = Hash.new(0)
  $phase_index = Hash.new(0)
  $press = w["press"]
end

def stats_hash
  {
    "cut" => $stats.cut_count, "headbutt" => $stats.headbutt_count, "headbuttBattles" => $stats.headbutt_battles,
    "rockSmash" => $stats.rock_smash_count, "rockSmashBattles" => $stats.rock_smash_battles,
    "fishing" => $stats.fishing_count
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

out = {}

#===============================================================================
# 1. Field move eligibility: pbCanUseHiddenMove?(pkmn, move, true) and
#    pbConfirmUseHiddenMove for every handler, across overworld situations.
#===============================================================================
MOVES = %w[CUT DIG DIVE FLASH FLY HEADBUTT ROCKSMASH STRENGTH SURF SWEETSCENT TELEPORT WATERFALL WHIRLPOOL]
SITUATIONS = [
  { "name" => "outdoors, no badges", "badges" => 0 },
  { "name" => "outdoors, 3 badges", "badges" => 3 },
  { "name" => "outdoors, 8 badges", "badges" => 8 },
  { "name" => "facing a cut tree", "badges" => 8, "facingEvent" => [5, "CutTree", 10, 9] },
  { "name" => "facing a cut tree, 1 badge", "badges" => 1, "facingEvent" => [5, "CutTree", 10, 9] },
  { "name" => "facing a headbutt tree", "badges" => 0, "facingEvent" => [5, "HeadbuttTree", 10, 9] },
  { "name" => "facing a smash rock", "badges" => 8, "facingEvent" => [5, "SmashRock", 10, 9] },
  { "name" => "facing a smash rock, 2 badges", "badges" => 2, "facingEvent" => [5, "SmashRock", 10, 9] },
  { "name" => "facing a whirlpool (redemoinho)", "badges" => 8, "facingEvent" => [5, "redemoinho", 10, 9] },
  { "name" => "facing a WhirlpoolTree event", "badges" => 8, "facingEvent" => [5, "WhirlpoolTree", 10, 9] },
  { "name" => "facing water", "badges" => 8, "facingTerrain" => "Water" },
  { "name" => "facing water, not passable", "badges" => 8, "facingTerrain" => "Water", "passable" => false },
  { "name" => "facing water with a partner", "badges" => 8, "facingTerrain" => "Water", "canTransfer" => false },
  { "name" => "facing water while surfing", "badges" => 8, "facingTerrain" => "Water", "global" => { "surfing" => true } },
  { "name" => "facing water, 3 badges", "badges" => 3, "facingTerrain" => "Water" },
  { "name" => "facing a waterfall", "badges" => 8, "facingTerrain" => "Waterfall" },
  { "name" => "facing a waterfall crest", "badges" => 8, "facingTerrain" => "WaterfallCrest" },
  { "name" => "on the cycling road", "badges" => 8, "facingTerrain" => "Water", "map" => 418 },
  { "name" => "indoors", "badges" => 8, "map" => 3 },
  { "name" => "dark cave", "badges" => 8, "map" => 17 },
  { "name" => "dark cave, Flash used", "badges" => 8, "map" => 17, "global" => { "flashUsed" => true } },
  { "name" => "on deep water of a dive map", "badges" => 16, "map" => 189, "terrain" => "DeepWater" },
  { "name" => "on deep water of a dive map, 8 badges", "badges" => 8, "map" => 189, "terrain" => "DeepWater" },
  { "name" => "on water of a dive map", "badges" => 16, "map" => 189, "terrain" => "Water" },
  { "name" => "underwater below deep water", "badges" => 16, "map" => 300, "global" => { "diving" => true },
    "surfaceTerrain" => "DeepWater" },
  { "name" => "underwater below shallow water", "badges" => 16, "map" => 300, "global" => { "diving" => true },
    "surfaceTerrain" => "Water" },
  { "name" => "with an escape point", "badges" => 8, "global" => { "escapePoint" => [17, 5, 6, 2] } },
  { "name" => "with an escape point and a partner", "badges" => 8, "canTransfer" => false,
    "global" => { "escapePoint" => [17, 5, 6, 2] } },
  { "name" => "with a healing spot", "badges" => 8, "global" => { "healingSpot" => [139, 20, 10] } },
  { "name" => "Strength already used", "badges" => 8, "strengthUsed" => true },
  { "name" => "with a partner outdoors", "badges" => 8, "canTransfer" => false },
]
out["eligibility"] = []
SITUATIONS.each do |sit|
  MOVES.each do |move|
    w = sit.merge("party" => [["PIKACHU", 30, [move]]])
    setup_world(w)
    pkmn = $player.party[0]
    $scripting = true
    can = pbCanUseHiddenMove?(pkmn, move.to_sym, true)
    can_log = $log.dup
    $log = []
    $answers = [true]
    confirm = can ? pbConfirmUseHiddenMove(pkmn, move.to_sym) : nil
    $scripting = false
    out["eligibility"] << { "world" => w, "move" => move, "can" => can, "canLog" => can_log,
                            "confirm" => confirm, "confirmLog" => $log.dup }
  end
end

# Which moves have handlers, their badges, and who has field skills.
out["handlers"] = (Settings::HM_SKILLS + Settings::MISC_SKILLS).map do |m|
  [m.to_s, HiddenMoveHandlers.hasHandler(m), pbBadgeFromSkill(m)]
end
out["fieldSkills"] = []
[
  [["PIKACHU", 30, ["THUNDERBOLT"]]], [["PIKACHU", 30, ["CUT"]]], [["BULBASAUR", 30, ["TACKLE"]]],
  [["PIDGEY", 20, ["TACKLE"]]], [["CHANSEY", 30, ["SOFTBOILED"]]], [["CHANSEY", 30, ["POUND"]]],
  [["ABRA", 20, ["TELEPORT"]]], [["MEW", 50, ["POUND"]]], [["SMEARGLE", 30, ["SKETCH"]]],
  [["GEODUDE", 30, ["TACKLE"]], ["MAGIKARP", 10, ["SPLASH"]]],
].each do |party|
  [0, 3, 8].each do |badges|
    setup_world("party" => party, "badges" => badges)
    out["fieldSkills"] << {
      "party" => party, "badges" => badges,
      "hasFieldSkill" => $player.party.map(&:has_field_skill?),
      "withMove" => %w[CUT FLY SURF STRENGTH ROCKSMASH FLASH HEADBUTT TELEPORT DIG SWEETSCENT].map do |m|
        p = $player.get_pokemon_with_move(m.to_sym)
        p ? $player.party.index(p) : nil
      end
    }
  end
end

#===============================================================================
# 2. The events' entry points: pbCut, pbRockSmash, pbStrength, pbWhirlpool,
#    pbWaterfall, pbHeadbutt (with the follower's facing event).
#===============================================================================
out["entry"] = []
gen = Random.new(20261029)
[
  ["pbCut", %w[CUT], 8, [true]], ["pbCut", %w[CUT], 8, [false]], ["pbCut", %w[CUT], 1, [true]], ["pbCut", %w[TACKLE], 8, [true]],
  ["pbRockSmash", %w[ROCKSMASH], 8, [true]], ["pbRockSmash", %w[ROCKSMASH], 2, [true]], ["pbRockSmash", %w[TACKLE], 8, [true]],
  ["pbStrength", %w[STRENGTH], 8, [true]], ["pbStrength", %w[STRENGTH], 8, [false]], ["pbStrength", %w[STRENGTH], 4, [true]],
  ["pbWhirlpool", %w[WHIRLPOOL], 8, [true]], ["pbWhirlpool", %w[WHIRLPOOL], 6, [true]],
  ["pbWaterfall", %w[WATERFALL], 8, [true]], ["pbWaterfall", %w[WATERFALL], 8, [false]],
  ["pbHeadbutt", %w[HEADBUTT], 0, [true]], ["pbHeadbutt", %w[HEADBUTT], 0, [false]], ["pbHeadbutt", %w[TACKLE], 0, [true]],
].each do |fn, moves, badges, answers|
  [false, true].each do |strength_used|
    next if strength_used && fn != "pbStrength"
    w = { "party" => [["MACHOP", 30, moves]], "badges" => badges, "answers" => answers, "strengthUsed" => strength_used,
          "facingEvent" => [7, "HeadbuttTree", 12, 9], "rolls" => Array.new(4) { gen.rand(1 << 30) } }
    setup_world(w)
    $scripting = true
    ret = send(fn)
    $scripting = false
    out["entry"] << { "fn" => fn, "world" => w, "ret" => ret, "log" => $log, "rolls" => $used,
                      "strengthUsed" => $PokemonMap.strengthUsed, "stats" => stats_hash }
  end
end

#===============================================================================
# 3. pbHeadbuttEffect: the tree's odds from its position and the trainer ID.
#===============================================================================
out["headbutt"] = []
xs = [0, 1, 5, 12, 23, 24, 37, 48, 49, 60]
ys = [0, 3, 7, 19, 24, 25, 33, 47]
xs.each do |x|
  ys.each do |y|
    [0, 1, 4, 5, 9, 12_345, 65_535].each do |tid|
      [0, 4, 7, 9].each do |roll|
        [true, false].each do |enc|
          next if !enc && roll != 0
          w = { "trainerId" => tid, "rolls" => [roll], "encounters" => [enc] }
          setup_world(w)
          $scripting = true
          pbHeadbuttEffect(StubEvent.new(9, "HeadbuttTree", x, y))
          $scripting = false
          out["headbutt"] << { "x" => x, "y" => y, "trainerId" => tid, "roll" => roll, "encounter" => enc,
                               "log" => $log, "battles" => $stats.headbutt_battles }
        end
      end
    end
  end
end

#===============================================================================
# 4. pbRockSmashRandomEncounter on maps with Rock Smash tables.
#===============================================================================
out["rockSmash"] = []
rock_maps = []
GameData::Encounter.each { |e| rock_maps << e.map if e.version == 0 && e.types[:RockSmash] && !e.types[:RockSmash].empty? }
rock_maps = [139] + rock_maps.first(6)
rock_maps.each do |map|
  6.times do
    w = { "map" => map, "rolls" => Array.new(3) { gen.rand(1 << 30) }, "party" => [["GEODUDE", 30, ["ROCKSMASH"]]] }
    setup_world(w)
    $scripting = true
    pbRockSmashRandomEncounter
    $scripting = false
    out["rockSmash"] << { "world" => w, "log" => $log, "rolls" => $used, "battles" => $stats.rock_smash_battles }
  end
end

#===============================================================================
# 5. pbFishing: bite odds, waiting dots, the reflex window.
#===============================================================================
out["fishing"] = []
press_options = [
  nil,
  { "phase" => "dots", "index" => 1, "seconds" => 0.5 },
  { "phase" => "dots", "index" => 1, "seconds" => 2.2 },
  { "phase" => "bite", "index" => 1, "seconds" => 0.1 },
  { "phase" => "bite", "index" => 1, "seconds" => 0.45 },
  { "phase" => "bite", "index" => 1, "seconds" => 0.9 },
]
[1, 2, 3].each do |rod|
  [nil, ["MAGIKARP", 10, ["SPLASH"], 0], ["OCTILLERY", 30, ["OCTAZOOKA"], 0]].each do |lead|
    [true, false].each do |has_encounter|
      press_options.each do |press|
        2.times do
          w = { "rolls" => Array.new(6) { gen.rand(1 << 30) }, "press" => press,
                "party" => [lead || ["PIKACHU", 20, ["THUNDERSHOCK"]]],
                "global" => { "surfing" => rod == 2 } }
          setup_world(w)
          if lead && lead[0] == "OCTILLERY"
            # Octillery's first ability is Suction Cups (fishing speedup)
            $player.party[0].ability_index = 0
          end
          $scripting = true
          ret = pbFishing(has_encounter, rod)
          $scripting = false
          out["fishing"] << {
            "rod" => rod, "hasEncounter" => has_encounter, "world" => w, "ret" => ret, "log" => $log,
            "rolls" => $used, "ability" => $player.party[0].ability_id.to_s,
            "seconds" => $phase_frames.map { |k, v| [k, v / 40.0] }.to_h, "fishingCount" => $stats.fishing_count
          }
        end
      end
    end
  end
end

path = File.join(ROOT, "web", "src", "game", "field", "fieldMovesReference.json")
File.write(path, JSON.generate(jsonable(out)) + "\n")
puts "Wrote #{out.map { |k, v| "#{v.length} #{k}" }.join(', ')} to #{path.sub(ROOT + '/', '')}"
