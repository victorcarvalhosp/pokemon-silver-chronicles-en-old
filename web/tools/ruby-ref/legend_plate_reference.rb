# Runs the Generation 9 Pack's Legend Plate type choice ([001] Battle/[006]
# Legend Plate Functions.rb: Battle#pbGetBestTypeJudgment and its helpers,
# Battle::Battler#pbGetJudgmentType) headless on fixed battles, and writes
# web/src/battle/battle/legendPlateReference.json, which
# web/src/battle/battle/legendPlate.test.ts replays against
# Battle_LegendPlate.ts.
#
#   cd web && ruby tools/ruby-ref/legend_plate_reference.rb
#
# Array#sample (pbCalcOptimalType's last resort) is recorded instead of
# rolled: the case stores the candidates and the harness returns the first.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

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
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
$bag            = PokemonBag.new
$stats          = GameStats.new

$sampled = nil
class Array
  def sample
    $sampled = self.map(&:to_s)
    self[0]
  end
end

INERT_ABILITY = "HONEYGATHER"

def make_pokemon(spec)
  pkmn = Pokemon.new(spec["s"].to_sym, spec["l"] || 50, $player)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = 31
    pkmn.ev[s.id] = 0
  end
  pkmn.nature = :HARDY
  pkmn.ability = (spec["a"] || INERT_ABILITY).to_sym
  pkmn.item = spec["i"] ? spec["i"].to_sym : nil
  pkmn.gender = 0
  pkmn.forget_all_moves
  (spec["m"] || ["TACKLE"]).each { |m| pkmn.learn_move(m.to_sym) }
  pkmn.calc_stats
  pkmn
end

ARCEUS = { "s" => "ARCEUS", "a" => "MULTITYPE", "i" => "LEGENDPLATE", "m" => ["JUDGMENT"] }.freeze

CASES = [
  { "name" => "fire/flying", "foe" => { "s" => "CHARIZARD" } },
  { "name" => "grass/steel", "foe" => { "s" => "FERROTHORN" } },
  { "name" => "water/ice", "foe" => { "s" => "LAPRAS" } },
  { "name" => "levitate", "foe" => { "s" => "BRONZONG", "a" => "LEVITATE" } },
  { "name" => "water absorb", "foe" => { "s" => "VAPOREON", "a" => "WATERABSORB" } },
  { "name" => "thick fat", "foe" => { "s" => "SNORLAX", "a" => "THICKFAT" } },
  { "name" => "flash fire", "foe" => { "s" => "HEATRAN", "a" => "FLASHFIRE" } },
  { "name" => "wonder guard", "foe" => { "s" => "SHEDINJA", "a" => "WONDERGUARD" } },
  { "name" => "wonder guard keeps ghost", "foe" => { "s" => "SHEDINJA", "a" => "WONDERGUARD" }, "check" => "FLYING" },
  { "name" => "rain", "foe" => { "s" => "RHYDON" }, "weather" => "Rain" },
  { "name" => "sun", "foe" => { "s" => "GYARADOS" }, "weather" => "Sun" },
  { "name" => "heavy rain", "foe" => { "s" => "SCIZOR" }, "weather" => "HeavyRain" },
  { "name" => "electric terrain + charge", "foe" => { "s" => "GYARADOS" }, "terrain" => "Electric", "charge" => true },
  { "name" => "misty terrain", "foe" => { "s" => "SALAMENCE" }, "terrain" => "Misty" },
  { "name" => "mud sport", "foe" => { "s" => "GYARADOS" }, "field" => { "MudSportField" => 5 } },
  { "name" => "water sport", "foe" => { "s" => "SCIZOR" }, "field" => { "WaterSportField" => 5 } },
  { "name" => "trick-or-treat", "foe" => { "s" => "TAUROS" }, "type3" => "GHOST" },
  { "name" => "dark aura", "foe" => { "s" => "ALAKAZAM" }, "ally_ability" => "DARKAURA" },
  { "name" => "air balloon", "foe" => { "s" => "HEATRAN", "i" => "AIRBALLOON" } },
  { "name" => "normal", "foe" => { "s" => "TAUROS" } },
  { "name" => "check type kept", "foe" => { "s" => "SHEDINJA", "a" => "WONDERGUARD" }, "check" => "FIRE" },
  { "name" => "fainted foe", "foe" => { "s" => "TAUROS" }, "faint" => true },
].freeze

out = CASES.map do |c|
  $sampled = nil
  p1 = [make_pokemon(ARCEUS)]
  p1[0].ability = c["ally_ability"].to_sym if c["ally_ability"]
  p2 = [make_pokemon(c["foe"])]
  scene = Battle::DebugSceneNoLogging.new
  battle = Battle.new(scene, p1, p2, $player, nil)
  battle.internalBattle = true
  scene.pbStartBattle(battle)
  battle.pbSetUpSides
  user = battle.battlers[0]
  foe = battle.battlers[1]
  if c["weather"]
    battle.field.weather = c["weather"].to_sym
    battle.field.weatherDuration = 5
  end
  if c["terrain"]
    battle.field.terrain = c["terrain"].to_sym
    battle.field.terrainDuration = 5
  end
  (c["field"] || {}).each { |e, v| battle.field.effects[PBEffects.const_get(e)] = v }
  user.effects[PBEffects::Charge] = 2 if c["charge"]
  if c["type3"]
    foe.effects[PBEffects::Type3] = c["type3"].to_sym
  end
  foe.hp = 0 if c["faint"]
  res = { "name" => c["name"], "case" => c }
  begin
    res["judgment"] = user.pbGetJudgmentType(c["check"]&.to_sym).to_s
    res["sampled"] = $sampled
    $sampled = nil
    res["best"] = battle.pbGetBestTypeJudgment(user, foe, nil, c["check"]&.to_sym).to_s
    res["sampledBest"] = $sampled
    res["has"] = user.hasLegendPlateJudgment?
  rescue StandardError => e
    res["error"] = "#{e.class}: #{e.message}"
  end
  res
end

path = File.expand_path("../../src/battle/battle/legendPlateReference.json", __dir__)
File.write(path, JSON.pretty_generate(out) + "\n")
puts "wrote #{out.size} cases to #{path}"
