# Differential reference for Shadow Pokémon in battle (the battle half of
# Data/Scripts/014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb:167-404
# and the core/AI hooks it relies on): scripted battles with Shadow Pokémon
# using Shadow moves, entering and leaving Hyper Mode, and the Call command.
# Writes web/src/battle/shadowBattleReference.json, which
# web/src/battle/shadowBattleReference.test.ts replays through the TypeScript
# port and compares round by round.
#
#   cd web && ruby tools/ruby-ref/shadow_battle_reference.rb
#
# It reuses move_effects_reference.rb's harness (everything before its
# "Scenarios" section: the loaded game, RecordingScene, Snap, MoveHarness) and
# extends it:
# - the SHADOW type and five Shadow moves are registered (this game's PBS has
#   neither; the definitions are written to the JSON so the TS test registers
#   the same ones);
# - party entries can be Shadow Pokémon: "sh" = heart gauge (after makeShadow,
#   which runs before the moves are set), "hm" = starts in Hyper Mode;
# - the action "c" registers the Call command (pbRegisterCall);
# - the snapshot adds each battler's [heart gauge, Hyper Mode, shadowPokemon?]
#   and the parties' heart gauges / Hyper Mode;
# - Kernel#rand (pbHyperModeObedience uses it) takes the scenario's SeqRandom
#   sequence, as core/random's rand does in the TS test.

harness = File.join(__dir__, "move_effects_reference.rb")
lines = File.read(harness, encoding: "UTF-8").lines
last = lines.index { |l| l.start_with?("scenarios = JSON.parse(") }
raise "move_effects_reference.rb: scenarios section not found" if !last
eval(lines[0...last].join, TOPLEVEL_BINDING, harness, 1) # rubocop:disable Security/Eval

# The battle half of 002_ShadowPokemon_Other.rb (from "Shadow Pokémon in
# battle." to the Shadow move classes; move_effects_reference.rb already loaded
# its Battle::Battler class, whose aliases are guarded against reloading).
begin
  shadow = File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "002_ShadowPokemon_Other.rb")
  src = File.read(shadow, encoding: "UTF-8").lines
  first = src.index { |l| l.include?("# Shadow Pokémon in battle.") } - 1
  stop = src.index { |l| l.start_with?("class Game_Temp") }
  TOPLEVEL_BINDING.eval(src[first...stop].join, shadow, first + 1)
end

#===============================================================================
# Test data: the SHADOW type and the Shadow moves (camelCase keys, as the TS
# GameData classes take them).
#===============================================================================
DATA_DEFS = {
  "types" => [
    { "id" => "SHADOW", "name" => "Shadow", "specialType" => true, "pseudoType" => true, "iconPosition" => 19 }
  ],
  "moves" => [
    { "id" => "SHADOWRUSH", "name" => "Shadow Rush", "type" => "SHADOW", "category" => 0, "baseDamage" => 55,
      "accuracy" => 100, "totalPp" => 0, "target" => "NearOther", "functionCode" => "None",
      "flags" => ["Contact", "CanProtect", "CanMirrorMove"] },
    { "id" => "SHADOWEND", "name" => "Shadow End", "type" => "SHADOW", "category" => 0, "baseDamage" => 120,
      "accuracy" => 60, "totalPp" => 0, "target" => "NearOther", "functionCode" => "UserLosesHalfHP",
      "flags" => ["Contact", "CanProtect", "CanMirrorMove"] },
    { "id" => "SHADOWHALF", "name" => "Shadow Half", "type" => "SHADOW", "category" => 1, "baseDamage" => 0,
      "accuracy" => 0, "totalPp" => 0, "target" => "AllBattlers",
      "functionCode" => "AllBattlersLoseHalfHPUserSkipsNextTurn", "flags" => [] },
    { "id" => "SHADOWSKY", "name" => "Shadow Sky", "type" => "SHADOW", "category" => 2, "baseDamage" => 0,
      "accuracy" => 0, "totalPp" => 0, "target" => "BothSides", "functionCode" => "StartShadowSkyWeather",
      "flags" => [] },
    { "id" => "SHADOWSHED", "name" => "Shadow Shed", "type" => "SHADOW", "category" => 2, "baseDamage" => 0,
      "accuracy" => 0, "totalPp" => 0, "target" => "BothSides", "functionCode" => "RemoveAllScreens",
      "flags" => [] }
  ]
}.freeze

def to_ruby_hash(defn, symbol_keys)
  defn.map do |k, v|
    key = k.gsub(/([A-Z])/) { "_#{$1.downcase}" }.to_sym
    v = v.to_sym if symbol_keys.include?(key)
    [key, v]
  end.to_h
end

DATA_DEFS["types"].each { |t| GameData::Type.register(to_ruby_hash(t, [:id])) }
DATA_DEFS["moves"].each { |m| GameData::Move.register(to_ruby_hash(m, [:id, :type, :target])) }

#===============================================================================
# Kernel#rand through the scenario's random numbers
#===============================================================================
$scripted_random = nil

class SeqRandom
  alias __shadow_ref_initialize initialize
  def initialize(*args)
    __shadow_ref_initialize(*args)
    $scripted_random = self
  end
end

def rand(*args)
  return Kernel.rand(*args) if !$scripted_random
  x = args[0] || 0
  (x.is_a?(Integer) && x > 0) ? $scripted_random.next(x) : $scripted_random.next(2**30) / (2**30).to_f
end

#===============================================================================
# Harness extensions
#===============================================================================
module MoveHarness
  class << self
    alias_method :base_make_pokemon, :make_pokemon
    alias_method :base_choose, :choose

    def make_pokemon(spec, side)
      pkmn = base_make_pokemon(spec, side)
      if spec["sh"]
        moves = pkmn.moves.map(&:id)
        pkmn.makeShadow
        pkmn.forget_all_moves
        moves.each { |m| pkmn.learn_move(m) }
        pkmn.heart_gauge = spec["sh"]
        pkmn.hyper_mode = true if spec["hm"]
      end
      pkmn
    end

    def choose(battle, idx, act)
      return if act == "c" && battle.pbRegisterCall(idx)
      base_choose(battle, idx, act)
    end
  end
end

module Snap
  class << self
    alias_method :base_battler, :battler
    alias_method :base_state, :state

    def battler(b)
      p = b.pokemon
      base_battler(b).merge("shadow" => [p.heart_gauge, p.hyper_mode ? true : false, b.shadowPokemon? ? true : false])
    end

    def state(battle)
      base_state(battle).merge("hearts" => [0, 1].map do |side|
        battle.pbParty(side).map { |pk| pk ? [pk.heart_gauge, pk.hyper_mode ? true : false] : nil }
      end)
    end
  end
end

#===============================================================================
# Scenarios (actions as in move_effects_scenarios.json, plus "c" = Call)
#===============================================================================
SCENARIOS = [
  { "name" => "Shadow Rush; the player's Shadow Pokémon enters Hyper Mode; Call brings it back", "trainer" => true,
    "p" => [{ "sh" => 1000, "m" => ["SHADOWRUSH", "TACKLE", "GROWL"] }],
    "o" => [{ "lv" => 45, "m" => ["TACKLE"] }],
    "turns" => [["0", "0"], ["1", "0"], ["1", "0"], ["c", "0"], ["0", "0"], ["c", "0"]] },
  { "name" => "Hyper Mode from the start: disobedience, Hyper Mode damage, coming to its senses", "trainer" => true,
    "p" => [{ "sh" => 3000, "hm" => true, "lv" => 60, "m" => ["TACKLE", "GROWL", "SHADOWRUSH"] }],
    "o" => [{ "lv" => 60, "m" => ["GROWL"] }],
    "turns" => Array.new(10) { ["0", "0"] } },
  { "name" => "Foe's Shadow Pokémon: Shadow Sky, Shadow Shed, Shadow Half, Shadow End", "trainer" => true,
    "p" => [{ "m" => ["REFLECT", "LIGHTSCREEN", "SAFEGUARD", "TACKLE"] }],
    "o" => [{ "sh" => 4000, "lv" => 45, "m" => ["SHADOWSKY", "SHADOWSHED", "SHADOWHALF", "SHADOWEND"] }],
    "turns" => [["0", "0"], ["1", "1"], ["2", "2"], ["3", "2"], ["3", "3"], ["3", "3"], ["3", "3"]] },
  { "name" => "Shadow vs Shadow: Shadow moves are not very effective; Call on a non-Shadow Pokémon", "trainer" => true,
    "p" => [{ "sh" => 3800, "m" => ["SHADOWRUSH", "SHADOWEND"] }, { "sp" => "SNORLAX", "lv" => 40, "st" => "SLEEP" }],
    "o" => [{ "sh" => 3800, "m" => ["SHADOWRUSH"] }],
    "turns" => [["0", "0"], ["1", "0"], ["s1", "0"], ["c", "0"], ["c", "0"], ["c", "0"]] },
  { "name" => "Switching a Shadow Pokémon in Hyper Mode out and back in", "trainer" => true,
    "p" => [{ "m" => ["TACKLE"] }, { "sh" => 2000, "hm" => true, "m" => ["TACKLE", "SHADOWRUSH"] },
            { "sp" => "SENTRET", "lv" => 30 }],
    "o" => [{ "m" => ["GROWL"] }],
    "turns" => [["s1", "0"], ["1", "0"], ["s2", "0"], ["s1", "0"], ["1", "0"], ["s0", "0"], ["s1", "0"]] },
  { "name" => "Double battle: Shadow Half, Hyper Mode on both sides", "trainer" => true, "double" => true,
    "p" => [{ "sh" => 900, "m" => ["SHADOWHALF", "SHADOWRUSH"] }, { "sh" => 500, "sp" => "SNORLAX", "m" => ["TACKLE"] }],
    "o" => [{ "sh" => 4000, "m" => ["SHADOWRUSH"] }, { "sp" => "RATTATA", "m" => ["TACKLE"] }],
    "turns" => [["0", "0>0", "0>3", "0>2"], ["1>1", "0>0", "0>3", "0>2"], ["c", "0>0", "c", "0>2"],
                ["1>3", "0>2", "0>1", "0>0"], ["1>1", "0>0", "0>1", "0>2"]] },
  { "name" => "Wild Shadow Pokémon (no Call menu; heart gauge only for the player's)",
    "p" => [{ "sh" => 1200, "m" => ["SHADOWRUSH", "TACKLE"] }],
    "o" => [{ "sh" => 4000, "lv" => 30, "m" => ["SHADOWEND"] }],
    "turns" => [["0", "0"], ["1", "0"], ["c", "0"], ["0", "0"]] }
].freeze

out = { "data" => DATA_DEFS, "results" => [] }
SCENARIOS.each_with_index do |sc, i|
  seed = 7000 + (1000 * i)
  result = MoveHarness.run(sc, seed)
  $scripted_random = nil
  out["results"] << { "scenario" => sc, "seed" => seed }.merge(result)
  $stderr.puts "#{sc['name']}: #{result['rounds'].length} snapshots#{result['error'] ? ", ERROR #{result['error']}" : ''}"
end
path = File.join(ROOT, "web", "src", "battle", "shadowBattleReference.json")
File.write(path, JSON.generate(out) + "\n")
puts "Wrote #{path} (#{File.size(path) / 1024} KB)"
