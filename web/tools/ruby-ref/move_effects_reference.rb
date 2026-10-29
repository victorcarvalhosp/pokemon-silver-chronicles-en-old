# Differential reference for the move effect classes: runs scripted battles
# through the game's real Ruby battle code (see essentials.rb) and records, for
# every round, the messages/animations shown and the full battle state. Writes
# web/src/battle/move/moveEffectsReference.json.gz (gzipped JSON), which
# web/src/battle/move/moveEffectsReference.test.ts replays through the
# TypeScript port and compares.
#
#   cd web && ruby tools/ruby-ref/move_effects_reference.rb
#
# Scenarios:
# - the hand-written ones in move_effects_scenarios.json (see its "_doc");
# - three automatic scenarios per move function code that has a Battle::Move
#   class, each using the code's first move (alphabetically, skipping
#   Max/Z-Moves) for three rounds: (A) a Lv. 40 Mew against a Lv. 42 Mew using
#   Tackle; (B) a faster Mew holding an Oran Berry, with a party member behind
#   it, against a Mew holding a Nugget and using Growl; (C) a double battle,
#   aimed at the second foe.
# Both sides run the whole battle (pbStartBattle and the real battle loop);
# only the command phase is scripted (pbCommandPhase is replaced by
# MoveHarness.command_phase, the same on both sides), switch-in choices are
# deterministic (first available party member) and pbEndOfBattle is replaced
# by a final snapshot. Randomness: battle_reference.rb's SeqRandom for both
# pbRandom and pbAIRandom. Every Pokémon has the ability Honey Gather and no
# item unless the scenario says otherwise.

require "json"
require "zlib"
require_relative "essentials"

Essentials.load!(verbose: true)

# The TS port deliberately fixes the Gen 9 Pack's
# `if @function = "IncreasePowerInSunWeather"` ([001] Battle/[001] Battle.rb:278,
# an assignment that gives every damaging move Hydro Steam's Sun multiplier and
# overwrites its function code) to a comparison; apply the same fix here so
# battles in Sun compare. ZUD's Raid_Battle_Overrides.rb:177 aliases the Gen 9
# version as zud_pbCalcDamageMultipliers, so that's the method replaced.
begin
  gen9 = File.join(PLUGINS, "Generation 9 Pack Scripts", "[001] Battle", "[001] Battle.rb")
  lines = File.read(gen9, encoding: "UTF-8").lines
  first = lines.index { |l| l =~ /^\s*def pbCalcDamageMultipliers\b/ }
  last = (first...lines.length).find { |i| lines[i] =~ /^  end\s*$/ }
  src = lines[first..last].join
  raise "Gen 9 Sun check not found" if !src.include?('@function = "IncreasePowerInSunWeather"')
  src = src.sub("def pbCalcDamageMultipliers", "def zud_pbCalcDamageMultipliers")
           .sub('@function = "IncreasePowerInSunWeather"', '@function == "IncreasePowerInSunWeather"')
  Battle::Move.class_eval(src, gen9, first + 1)
end

# essentials.rb doesn't load 014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb,
# whose Battle::Battler part (pbHyperModeObedience etc.) pbObedienceCheck? calls.
# Load just that class (no plugin patches the methods it aliases).
begin
  shadow = File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "002_ShadowPokemon_Other.rb")
  lines = File.read(shadow, encoding: "UTF-8").lines
  first = lines.index { |l| l.start_with?("class Battle::Battler") }
  last = (first...lines.length).find { |i| lines[i].start_with?("end") }
  TOPLEVEL_BINDING.eval(lines[first..last].join, shadow, first + 1)
end

#===============================================================================
# Globals the battle code reads (as in battle_reference.rb)
#===============================================================================
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
MAP_STUB        = Struct.new(:map_id).new(0) # level-up happiness reads $game_map.map_id
$game_map       = MAP_STUB
$PokemonGlobal  = nil
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
$player.badges  = [true] * 8 # every Pokémon obeys
$bag            = PokemonBag.new
$stats          = GameStats.new

INERT_ABILITY = :HONEYGATHER

class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end

# Not StandardErrors, so PBDebug.logonerr (which rescues StandardError and
# carries on) lets them through.
class StopScenario < Exception; end # rubocop:disable Lint/InheritException
class ScenarioError < Exception; end # rubocop:disable Lint/InheritException

# PBDebug.logonerr calls this for an error in a battle phase. Ruby shows it and
# carries on; the TS port (PBDebug.continueOnError unset) stops the battle, so
# the harness stops the scenario on both sides.
def pbPrintException(e)
  raise ScenarioError, "#{e.class}: #{e.message} @ #{e.backtrace.first(3).join(' | ')}"
end

#===============================================================================
# Scene that records what the battle shows
#===============================================================================
class RecordingScene < Battle::DebugSceneNoLogging
  attr_reader :log

  def initialize
    super
    @log = []
  end

  # Essentials Deluxe's midbattle triggers (Battle::Scene only; they do
  # nothing without $game_temp.dx_midbattle?).
  def pbDeluxeTriggers(*_args); end

  def pbDisplayMessage(msg, _brief = false); @log << msg; end
  def pbDisplay(msg, _brief = false); @log << msg; end
  def pbDisplayPausedMessage(msg); @log << msg; end
  def pbDisplayConfirmMessage(msg); @log << msg; true; end
  def pbShowCommands(msg, _commands, _default); @log << "[commands] #{msg}"; 0; end
  def pbAnimation(move_id, user, targets, hit_num = 0)
    t = (targets.is_a?(Array) ? targets : [targets]).compact.map(&:index)
    @log << "[anim] #{move_id} #{user ? user.index : '-'}>#{t.join(',')} #{hit_num}"
  end
  def pbCommonAnimation(name, user = nil, _target = nil); @log << "[common] #{name} #{user ? user.index : '-'}"; end
  def pbShowAbilitySplash(battler, _delay = false, _log = true); @log << "[splash] #{battler.index}"; end
  def pbFaintBattler(battler); @log << "[faint] #{battler.index}"; end
  def pbRecall(idx); @log << "[recall] #{idx}"; end
  # Battle::Scene has it (Ally Switch); DebugSceneNoLogging doesn't.
  def pbSwapBattlerSprites(idxA, idxB); @log << "[swap] #{idxA} #{idxB}"; end
  def pbSendOutBattlers(send_outs, _start = false); @log << "[sendout] #{send_outs.map { |s| s[0] }.join(',')}"; end

  # The first party member that can be chosen (DebugSceneNoLogging picks one at random).
  def pbPartyScreen(idxBattler, _canCancel = false)
    replacements = []
    @battle.eachInTeamFromBattlerIndex(idxBattler) do |_b, idxParty|
      replacements.push(idxParty) if !@battle.pbFindBattler(idxParty, idxBattler)
    end
    replacements.each { |i| break if yield i, self }
  end
end

#===============================================================================
# State snapshot (the TS test serialises the same way)
#===============================================================================
module Snap
  module_function

  def ser(v)
    case v
    when nil, true, false, Integer, String then v
    when Float then (v == v.floor) ? v.to_i : v
    when Symbol then v.to_s
    when Array then v.map { |x| ser(x) }
    when Hash then v.keys.map(&:to_s).sort.map { |k| [k, ser(v[k.to_sym] || v[k])] }.to_h
    when Battle::Battler then "battler:#{v.index}"
    when Pokemon then "pkmn:#{v.species}"
    when Battle::Move then "move:#{v.id}"
    when Pokemon::Move then "pmove:#{v.id}"
    else v.respond_to?(:id) ? ser(v.id) : "<#{v.class.name}>"
    end
  end

  # Effects arrays without their "nothing" values (nil, false, 0, -1, []).
  def sparse(arr)
    ret = {}
    arr.each_with_index do |x, i|
      next if x.nil? || x == false || x == 0 || x == -1 || x == []
      ret[i.to_s] = ser(x)
    end
    ret
  end

  def battler(b)
    {
      "species" => b.species.to_s, "form" => b.form, "hp" => b.hp, "totalhp" => b.totalhp,
      "status" => b.status.to_s, "statusCount" => b.statusCount, "types" => ser(b.pbTypes(true)),
      "ability" => ser(b.ability_id), "item" => ser(b.item_id), "level" => b.level,
      "stats" => [b.attack, b.defense, b.spatk, b.spdef, b.speed],
      "stages" => b.stages.select { |_k, v| v != 0 }.map { |k, v| [k.to_s, v] }.sort.to_h,
      "effects" => sparse(b.effects),
      "moves" => b.moves.map { |m| [m.id.to_s, m.pp, m.total_pp] },
      "lastMoveUsed" => ser(b.lastMoveUsed), "lastRegularMoveUsed" => ser(b.lastRegularMoveUsed),
      "lastHPLost" => b.lastHPLost, "lastMoveFailed" => b.lastMoveFailed, "turnCount" => b.turnCount,
      "pokemonIndex" => b.pokemonIndex
    }
  end

  def state(battle)
    {
      "turnCount" => battle.turnCount, "decision" => battle.decision,
      "battlers" => battle.battlers.map { |b| b ? battler(b) : nil },
      "sides" => battle.sides.map { |s| sparse(s.effects) },
      "positions" => battle.positions.map { |p| p ? sparse(p.effects) : nil },
      "field" => { "effects" => sparse(battle.field.effects), "weather" => battle.field.weather.to_s,
                   "weatherDuration" => battle.field.weatherDuration, "terrain" => battle.field.terrain.to_s,
                   "terrainDuration" => battle.field.terrainDuration },
      "parties" => [0, 1].map do |side|
        battle.pbParty(side).map do |pk|
          pk ? [pk.species.to_s, pk.hp, pk.status.to_s, ser(pk.item_id), pk.level, pk.moves.map { |m| [m.id.to_s, m.pp] }] : nil
        end
      end
    }
  end
end

#===============================================================================
# Scripted command phase (the TS test does exactly the same)
#===============================================================================
module MoveHarness
  module_function

  def make_pokemon(spec, side)
    pkmn = Pokemon.new((spec["sp"] || "MEW").to_sym, spec["lv"] || (side == 0 ? 40 : 42), $player)
    GameData::Stat.each_main do |s|
      pkmn.iv[s.id] = 31
      pkmn.ev[s.id] = 0
    end
    pkmn.nature = :HARDY
    pkmn.ability = (spec["ab"] || INERT_ABILITY).to_sym
    pkmn.item = spec["it"] ? spec["it"].to_sym : nil
    ((spec["g"] || side) == 0) ? pkmn.makeMale : pkmn.makeFemale
    pkmn.forget_all_moves
    (spec["m"] || ["TACKLE"]).each { |m| pkmn.learn_move(m.to_sym) }
    pkmn.calc_stats
    pkmn.hp = [(pkmn.totalhp * spec["hp"]).floor, 1].max if spec["hp"]
    pkmn.status = spec["st"].to_sym if spec["st"]
    pkmn.statusCount = 3 if spec["st"] == "SLEEP"
    pkmn
  end

  # Registers battler idx's action for this round ("N", "N>T", "sN" or nil).
  def choose(battle, idx, act)
    act ||= "0"
    if act.start_with?("s")
      idxParty = act[1..-1].to_i
      return if battle.pbCanSwitch?(idx, idxParty) && battle.pbRegisterSwitch(idx, idxParty)
      act = "0"
    end
    want, tgt = act.split(">")
    want = want.to_i
    user = battle.battlers[idx]
    order = [want] + (0...user.moves.length).to_a.reject { |i| i == want }
    chosen = order.find { |i| i < user.moves.length && battle.pbRegisterMove(idx, i, false) }
    if chosen.nil?
      battle.pbAutoChooseMove(idx, false)
      return
    end
    move = battle.choices[idx][2]
    target_data = move.pbTarget(user)
    return if target_data.num_targets != 1
    if tgt
      battle.pbRegisterTarget(idx, tgt.to_i)
    elsif target_data.targets_foe
      foe = battle.allOtherSideBattlers(idx).first
      battle.pbRegisterTarget(idx, foe.index) if foe
    else
      ally = battle.allSameSideBattlers(idx).find { |b| b.index != idx }
      battle.pbRegisterTarget(idx, ally.index) if ally
    end
  end

  def run(sc, seed)
    p1 = (sc["p"] || [{}]).map { |s| make_pokemon(s, 0) }
    p2 = (sc["o"] || [{}]).map { |s| make_pokemon(s, 1) }
    scene = RecordingScene.new
    opponent = sc["trainer"] ? [NPCTrainer.new("Joey", GameData::TrainerType.keys.first)] : nil
    battle = Battle.new(scene, p1, p2, $player, opponent)
    battle.setBattleMode("double") if sc["double"]
    battle.internalBattle = true
    battle.showAnims = true
    random = SeqRandom.new(seed)
    battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
    battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
    # The first party member that can switch in (the AI's choice depends on the AI).
    battle.battleAI.define_singleton_method(:pbDefaultChooseNewEnemy) do |idxBattler, _party = nil|
      @battle.eachInTeamFromBattlerIndex(idxBattler) do |_pk, i|
        return i if @battle.pbCanSwitchLax?(idxBattler, i)
      end
      -1
    end
    rounds = []
    error = nil
    snap = lambda do |label|
      rounds << { "label" => label, "log" => scene.log.dup, "state" => Snap.state(battle) }
      scene.log.clear
    end
    turns = sc["turns"]
    battle.define_singleton_method(:pbCommandPhase) do
      snap.call("start") if @turnCount == 0
      @battlers.each_with_index { |b, i| pbClearChoice(i) if b && pbCanShowCommands?(i) }
      raise StopScenario if @turnCount >= turns.length
      acts = turns[@turnCount]
      @battlers.each_with_index do |b, i|
        next if !b || @choices[i][0] != :None || !pbCanShowCommands?(i)
        MoveHarness.choose(self, i, acts[i])
      end
    end
    battle.define_singleton_method(:pbEndOfRoundPhase) do
      super()
      snap.call("round #{@turnCount + 1}")
    end
    battle.define_singleton_method(:pbEndOfBattle) do
      snap.call("end")
      @decision
    end
    begin
      battle.pbStartBattle
    rescue StopScenario
      # Script finished
    rescue StandardError, ScenarioError => e
      error = (e.is_a?(ScenarioError)) ? e.message : "#{e.class}: #{e.message} @ #{e.backtrace.first(3).join(' | ')}"
      snap.call("error")
    end
    { "rounds" => rounds, "error" => error }
  end
end

#===============================================================================
# Scenarios
#===============================================================================
scenarios = JSON.parse(File.read(File.join(__dir__, "move_effects_scenarios.json")))["scenarios"]
hand_count = scenarios.length
codes = {}
GameData::Move.each do |m|
  next if m.powerMove?
  code = m.function_code.to_s
  code = "None" if code.empty?
  (codes[code] ||= []) << m.id.to_s
end
codes.keys.sort.each do |code|
  class_name = (code[/^\d/]) ? "Effect#{code}" : code
  next if !Battle::Move.const_defined?(class_name, false)
  move = codes[code].min
  # A: slower user, foe attacks.
  scenarios << { "name" => "auto #{code} (#{move})", "auto" => true, "code" => code,
                 "p" => [{ "m" => [move] }], "o" => [{ "m" => ["TACKLE"] }],
                 "turns" => [["0", "0"], ["0", "0"], ["0", "0"]] }
  # B: faster user holding a berry, foe holding an item and using a status move, a party member behind.
  scenarios << { "name" => "auto #{code} (#{move}) fast, items", "auto" => true, "code" => code,
                 "p" => [{ "lv" => 45, "it" => "ORANBERRY", "m" => [move] }, { "sp" => "SENTRET", "lv" => 30 }],
                 "o" => [{ "it" => "NUGGET", "m" => ["GROWL"] }],
                 "turns" => [["0", "0"], ["0", "0"], ["0", "0"]] }
  # C: double battle, the move aimed at the second foe.
  scenarios << { "name" => "auto #{code} (#{move}) double", "auto" => true, "code" => code, "double" => true,
                 "p" => [{ "m" => [move] }, { "sp" => "SENTRET", "lv" => 40, "m" => ["TACKLE"] }],
                 "o" => [{ "m" => ["TACKLE"] }, { "sp" => "RATTATA", "lv" => 42, "m" => ["TACKLE"] }],
                 "turns" => [["0>3", "0>0", "0>1", "0>2"], ["0>3", "0>0", "0>1", "0>2"], ["0>3", "0>0", "0>1", "0>2"]] }
end

out = []
scenarios.each_with_index do |sc, i|
  seed = 1000 * (i + 1)
  result = MoveHarness.run(sc, seed)
  out << { "scenario" => sc, "seed" => seed }.merge(result)
end
$stderr.puts "#{hand_count} hand-written + #{scenarios.length - hand_count} automatic scenarios; " \
     "#{out.count { |o| o['error'] }} ended with a Ruby error"
path = File.join(ROOT, "web", "src", "battle", "move", "moveEffectsReference.json.gz")
Zlib::GzipWriter.open(path) { |gz| gz.mtime = 0; gz.write(JSON.generate(out) + "\n") }
puts "Wrote #{path} (#{File.size(path) / 1024} KB)"
