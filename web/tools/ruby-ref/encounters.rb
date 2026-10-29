# Reference values for the wild encounter port (web/src/game/encounters).
#
# Loads Essentials' own Ruby for the encounter logic (GameData base,
# EncounterType, Encounter, PBDayNight and 003_Overworld_WildEncounters.rb)
# with small stubs for the globals it reads, registers this game's compiled
# encounter tables (web/data/pbs/encounters.json), and records what
# PokemonEncounters does for scripted random rolls. Kernel#rand is replaced by
# a queue of raw numbers: rand(n) = raw % n, rand(a..b) = a + raw % (b - a + 1),
# which the TypeScript test replays the same way.
#
#   ruby web/tools/ruby-ref/encounters.rb > web/src/game/encounters/rubyReference.json
#
# System Ruby 2.6 is enough (no gems).

require "json"

ROOT = File.expand_path("../../..", __dir__)
SCRIPTS = File.join(ROOT, "Data", "Scripts")

# --- stubs ----------------------------------------------------------------------
class Tone
  attr_accessor :red, :green, :blue, :gray
  def initialize(r = 0, g = 0, b = 0, a = 0); @red, @green, @blue, @gray = r, g, b, a; end
end

def validate(*_args); end
def _INTL(str, *args); str.gsub(/\{(\d+)\}/) { args[$1.to_i - 1].to_s }; end
module Console; def self.echo_warn(*_args); end; end
module EventHandlers; def self.add(*_a); end; def self.trigger(*_a); end; end

module Settings
  MECHANICS_GENERATION = 8
  REPEL_COUNTS_FAINTED_POKEMON = (MECHANICS_GENERATION >= 6)
  MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS = (MECHANICS_GENERATION >= 8)
  FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS = (MECHANICS_GENERATION >= 6)
  TIME_SHADING = true
end

def pbPokeRadarOnShakingGrass; false; end
def pbInBugContest?; false; end
def pbInSafari?; false; end

Struct.new("GameSystem", :encounter_disabled)
Struct.new("Global", :surfing, :bicycle, :encounter_version, :partner, :repel)
Struct.new("PokemonMap", :blackFluteUsed, :whiteFluteUsed)
class StubPlayer
  def first_pokemon; nil; end
  def first_able_pokemon; nil; end
  def able_pokemon_count; 1; end
end
$game_system = Struct::GameSystem.new(false)
$PokemonGlobal = Struct::Global.new(false, false, 0, nil, 0)
$PokemonMap = Struct::PokemonMap.new(false, false)
$player = StubPlayer.new
$DEBUG = false

# --- Essentials' code -------------------------------------------------------------
load File.join(SCRIPTS, "010_Data", "001_GameData.rb")
load File.join(SCRIPTS, "010_Data", "001_Hardcoded data", "013_EncounterType.rb")
load File.join(SCRIPTS, "010_Data", "002_PBS data", "013_Encounter.rb")
load File.join(SCRIPTS, "012_Overworld", "003_Overworld_Time.rb")
load File.join(SCRIPTS, "012_Overworld", "002_Battle triggering", "003_Overworld_WildEncounters.rb")

# This game's encounter tables, as compiled from PBS/encounters.txt.
TABLES = JSON.parse(File.read(File.join(ROOT, "web", "data", "pbs", "encounters.json")))
TABLES.each do |e|
  types = {}
  e["types"].each { |t, slots| types[t.to_sym] = slots.map { |s| [s["chance"], s["species"].to_sym, s["minLevel"], s["maxLevel"]] } }
  chances = {}
  e["stepChances"].each { |t, v| chances[t.to_sym] = v }
  GameData::Encounter.register(id: e["id"].to_sym, map: e["map"], version: e["version"], step_chances: chances, types: types)
end

# --- scripted rand ------------------------------------------------------------------
$rolls = []
$used = []
module Kernel
  alias __real_rand rand
  def rand(arg = nil)
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

gen = Random.new(20261029)
raw_rolls = ->(n) { Array.new(n) { gen.rand(1 << 30) } }
out = {}

# 1. Order of every table after choose_wild_pokemon's in-place sort (once, twice).
out["sortOrder"] = []
TABLES.each do |e|
  next if e["version"] != 0
  enc = PokemonEncounters.new
  enc.setup(e["map"])
  e["types"].keys.each do |t|
    list = enc.instance_variable_get(:@encounter_tables)[t.to_sym]
    list.sort! { |a, b| b[0] <=> a[0] }
    once = list.map { |x| x[1].to_s }
    list.sort! { |a, b| b[0] <=> a[0] }
    twice = list.map { |x| x[1].to_s }
    out["sortOrder"].push({ "map" => e["map"], "type" => t, "once" => once, "twice" => twice })
  end
end

# 2. choose_wild_pokemon on several maps, five calls in a row per setup.
out["choose"] = []
maps = TABLES.select { |e| e["version"] == 0 }.map { |e| e["map"] }
pick = [4] + maps.sample(25, random: gen)
pick.each do |map|
  enc = PokemonEncounters.new
  enc.setup(map)
  types = enc.instance_variable_get(:@encounter_tables).keys
  calls = []
  5.times do |i|
    type = types[i % types.length]
    rolls = 1 + (i % 3)
    $rolls = raw_rolls.call(rolls + 1)
    $used = []
    result = enc.choose_wild_pokemon(type, rolls)
    calls.push({ "type" => type.to_s, "chanceRolls" => rolls, "rolls" => $used.dup, "result" => [result[0].to_s, result[1]] })
  end
  out["choose"].push({ "map" => map, "calls" => calls })
end

# 3. Encounter type by time of day for each base type, every hour.
out["timeOfDay"] = []
maps.each do |map|
  enc = PokemonEncounters.new
  enc.setup(map)
  %i[Land Cave Water TallGrass].each do |base|
    by_hour = (0..23).map { |h| enc.find_valid_encounter_type_for_time(base, Time.new(2026, 1, 1, h, 30)).to_s }
    out["timeOfDay"].push({ "map" => map, "base" => base.to_s, "byHour" => by_hour })
  end
end

# 4. encounter_triggered? over a walk of 40 steps (with and without repel).
out["triggered"] = []
[4, *maps.sample(5, random: gen)].each do |map|
  [false, true].each do |repel|
    enc = PokemonEncounters.new
    enc.setup(map)
    type = enc.instance_variable_get(:@step_chances).keys.first
    next if !type
    steps = []
    40.times do
      $rolls = raw_rolls.call(2)
      $used = []
      result = enc.encounter_triggered?(type, repel)
      steps.push({ "rolls" => $used.dup, "result" => result, "stepCount" => enc.step_count,
                   "accumulator" => enc.instance_variable_get(:@chance_accumulator) })
      enc.reset_step_count if result
    end
    out["triggered"].push({ "map" => map, "type" => type.to_s, "repel" => repel, "steps" => steps })
  end
end

puts JSON.pretty_generate(out)
