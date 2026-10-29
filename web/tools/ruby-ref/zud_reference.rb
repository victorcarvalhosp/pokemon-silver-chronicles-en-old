# Differential reference for ZUD Mechanics' battle side (Z-Moves, Ultra Burst,
# Dynamax/Gigantamax and every Power Move effect): runs the scripted battles of
# zud_scenarios.json through the game's real Ruby battle code (see
# essentials.rb) and records, for every round, the messages/animations shown
# and the battle state, plus the Dynamax/Power Move state (Dynamax HP and
# turns, the Power Moves each battler shows with their power, category and
# class, base moves, the registered mechanics). Writes
# web/src/battle/zud/zudReference.json.gz, which
# web/src/battle/zud/zudReference.test.ts replays through the TypeScript port.
#
#   cd web && ruby tools/ruby-ref/zud_reference.rb
#
# The harness is move_effects_reference.rb's (same RNG, Pokémon, scripted
# command phase and snapshot), plus:
# - actions "Nd", "Nz", "Nu" use move N after toggling Dynamax, Z-Move or
#   Ultra Burst in the fight menu (what Battle#pbFightMenu's block and the
#   scene's pbFightMenu_* toggles do), and "ai" lets the battle AI choose
#   (pbDefaultChooseEnemyCommand);
# - the Dynamax Band and Z-Ring are in the bag, the CAN_DYNAMAX_WILD and
#   DYNAMAX_ANY_MAP switches are on;
# - $PokemonSystem.battlescene is the scenario's "battlescene" (0, animations
#   on, by default), and the scene records ZUD's cinematics;
# - Array#shuffle/#sample inside Power Move effects use the battle's pbRandom,
#   as the TS port does (Ruby uses Kernel random there).

require "json"
require "zlib"
require_relative "essentials"

Essentials.load!(verbose: true)

# Same fixes as move_effects_reference.rb (see there).
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
begin
  shadow = File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "002_ShadowPokemon_Other.rb")
  lines = File.read(shadow, encoding: "UTF-8").lines
  first = lines.index { |l| l.start_with?("class Battle::Battler") }
  last = (first...lines.length).find { |i| lines[i].start_with?("end") }
  TOPLEVEL_BINDING.eval(lines[first..last].join, shadow, first + 1)
end

# Essentials Deluxe's GameStats counters ([000] Essentials Patches/Miscellaneous.rb:31,
# not loaded by essentials.rb).
class GameStats
  %i[zmove_count status_zmove_count ultra_burst_count dynamax_count gigantamax_count].each do |a|
    define_method(a) { instance_variable_get("@#{a}") || 0 }
    attr_writer a
  end
end

# Kernel#rand in move effect code goes through battle.pbRandom, as in the TS port.
class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end

# Array#shuffle/#sample in Power Move effects (status and weather/terrain
# picks) through the battle's pbRandom, with Ruby 2.6's algorithms (the TS
# port's rubyShuffle/rubySample).
$zud_rng = nil
class Array
  alias zud_orig_shuffle shuffle
  alias zud_orig_sample sample
  def shuffle(*args)
    return zud_orig_shuffle(*args) if !$zud_rng
    ret = dup
    i = ret.length
    while i > 0
      j = $zud_rng.pbRandom(i)
      i -= 1
      ret[i], ret[j] = ret[j], ret[i]
    end
    ret
  end
  def sample(*args)
    return zud_orig_sample(*args) if !$zud_rng || !args.empty?
    return nil if empty?
    self[$zud_rng.pbRandom(length)]
  end
end
module ZudRandomScope
  %i[pbPowerMoveEffects pbFailureCheckTarget].each do |m|
    define_method(m) do |*a|
      old = $zud_rng
      $zud_rng = @battle
      begin
        super(*a)
      ensure
        $zud_rng = old
      end
    end
  end
end
Battle::PowerMove::GeneralEffect.prepend(ZudRandomScope)

#===============================================================================
# Globals the battle code reads
#===============================================================================
class Game_Temp
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

class SwitchStub
  ON = [Settings::CAN_DYNAMAX_WILD, Settings::DYNAMAX_ANY_MAP].freeze
  def [](i); ON.include?(i); end
  def []=(_i, _v); end
end

class PokemonSystemStub
  attr_accessor :battlescene
  def initialize; @battlescene = 0; end
  def method_missing(*_a); 0; end
  def respond_to_missing?(*_a); true; end
end

# Lycanroc's form handler reads the time of day (the scenarios set its form).
module PBDayNight
  def self.isDay?(*_a); true; end
  def self.isNight?(*_a); false; end
  def self.isEvening?(*_a); false; end
  def self.isMorning?(*_a); false; end
  def self.isAfternoon?(*_a); false; end
end

$game_temp      = Game_Temp.new
$game_switches  = SwitchStub.new
$game_variables = Hash.new(0)
MAP_STUB        = Struct.new(:map_id) { def metadata; nil; end }.new(0) # Pikachu's form handler reads metadata
$game_map       = MAP_STUB
$PokemonGlobal  = nil
$PokemonSystem  = PokemonSystemStub.new
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

class StopScenario < Exception; end # rubocop:disable Lint/InheritException
class ScenarioError < Exception; end # rubocop:disable Lint/InheritException

def pbPrintException(e)
  raise ScenarioError, "#{e.class}: #{e.message} @ #{e.backtrace.first(3).join(' | ')}"
end

#===============================================================================
# Scene that records what the battle shows
#===============================================================================
class RecordingScene < Battle::DebugSceneNoLogging
  attr_reader :log

  # pbDynamax reads the battlers' sprite positions (Battle::Scene's @sprites).
  attr_reader :sprites
  SpritePos = Struct.new(:x, :y)

  def initialize
    super
    @log = []
    @sprites = Hash.new { |h, k| h[k] = SpritePos.new(0, 0) }
  end

  def pbDeluxeTriggers(*_args); end
  # Essentials Deluxe (Battle::Scene): no common animations here.
  def pbCommonAnimationExists?(_name); false; end

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
  def pbSwapBattlerSprites(idxA, idxB); @log << "[swap] #{idxA} #{idxB}"; end
  def pbSendOutBattlers(send_outs, _start = false); @log << "[sendout] #{send_outs.map { |s| s[0] }.join(',')}"; end
  def pbChangePokemon(idx, pkmn)
    idx = idx.index if idx.respond_to?(:index)
    @log << "[change] #{idx} #{pkmn.species} #{pkmn.form}#{pkmn.dynamax? ? ' dmax' : ''}"
  end

  # ZUD Mechanics' scene methods ([005] Battle_Scene/*.rb) and Essentials Deluxe's
  # reversion animation ([000] Battle_Scene.rb:90), which Battle::Scene has.
  def pbShowZMove(idx, move_id); @log << "[zmove] #{idx} #{move_id}"; end
  def pbShowUltraBurst(idx); @log << "[ultraburst] #{idx}"; end
  def pbShowDynamax(idx); @log << "[dynamax] #{idx}"; end
  def pbRevertBattlerStart(idx); @log << "[revertstart] #{idx}"; end
  def pbRevertBattlerEnd; @log << "[revertend]"; end
  def pbRevertDynamax(idx, with_form = true)
    @log << "[revertdynamax] #{idx} #{with_form}"
    battler = @battle.battlers[idx]
    battler.form = battler.effects[PBEffects::NonGMaxForm] if battler.isSpecies?(:ALCREMIE) && with_form
    poke = battler.effects[PBEffects::TransformPokemon] || battler.displayPokemon
    pbChangePokemon(battler, poke)
  end
  def pbDynamaxSendOut(idx, _xpos, _ypos)
    @log << "[dynamaxsendout] #{idx}"
    @battle.battlers[idx].pokemon.dynamax = true
    pbRevertDynamax(idx, false)
  end

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

  def sparse(arr)
    ret = {}
    arr.each_with_index do |x, i|
      next if x.nil? || x == false || x == 0 || x == -1 || x == []
      ret[i.to_s] = ser(x)
    end
    ret
  end

  def move_info(m)
    [m.id.to_s, m.name, m.baseDamage, m.category, m.type.to_s, m.class.name.split("::").last,
     m.is_a?(Battle::PowerMove), m.zmove_flag ? true : false, m.pp, m.total_pp]
  end

  def battler(b)
    {
      "species" => b.species.to_s, "form" => b.form, "hp" => b.hp, "totalhp" => b.totalhp,
      "status" => b.status.to_s, "statusCount" => b.statusCount, "types" => ser(b.pbTypes(true)),
      "ability" => ser(b.ability_id), "item" => ser(b.item_id), "level" => b.level,
      "stats" => [b.attack, b.defense, b.spatk, b.spdef, b.speed],
      "stages" => b.stages.select { |_k, v| v != 0 }.map { |k, v| [k.to_s, v] }.sort.to_h,
      "effects" => sparse(b.effects),
      "moves" => b.moves.map { |m| move_info(m) },
      "baseMoves" => b.base_moves.map { |m| [m.id.to_s, m.pp] },
      "lastMoveUsed" => ser(b.lastMoveUsed), "lastRegularMoveUsed" => ser(b.lastRegularMoveUsed),
      "lastHPLost" => b.lastHPLost, "lastMoveFailed" => b.lastMoveFailed, "turnCount" => b.turnCount,
      "pokemonIndex" => b.pokemonIndex,
      "dynamax" => b.dynamax? ? true : false, "gmax" => b.gmax? ? true : false, "ultra" => b.ultra? ? true : false,
      "reverted" => b.pokemon ? b.pokemon.reverted? : nil, "powerIndex" => b.power_index, "zmoveSelected" => b.selectedMoveIsZMove,
      "powerTrigger" => b.power_trigger ? true : false, "lastMoveUsedIsZMove" => b.lastMoveUsedIsZMove ? true : false
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
      "mechanics" => { "zMove" => ser(battle.zMove), "ultraBurst" => ser(battle.ultraBurst), "dynamax" => ser(battle.dynamax) },
      "stats" => [$stats.zmove_count, $stats.status_zmove_count, $stats.ultra_burst_count,
                  $stats.dynamax_count, $stats.gigantamax_count],
      "parties" => [0, 1].map do |side|
        battle.pbParty(side).map do |pk|
          pk ? [pk.species.to_s, pk.form, pk.hp, pk.totalhp, pk.status.to_s, ser(pk.item_id), pk.level,
                pk.dynamax?, pk.moves.map { |m| [m.id.to_s, m.pp] }] : nil
        end
      end
    }
  end
end

#===============================================================================
# Scripted command phase (the TS test does exactly the same)
#===============================================================================
module ZudHarness
  module_function

  def make_pokemon(spec, side)
    pkmn = Pokemon.new((spec["sp"] || "MEW").to_sym, spec["lv"] || (side == 0 ? 40 : 42), $player)
    pkmn.form_simple = spec["form"] if spec["form"] # no onSetForm (Necrozma would learn moves)
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
    pkmn.gmax_factor = true if spec["gmax"]
    pkmn.dynamax_lvl = spec["dlvl"] if spec["dlvl"]
    pkmn.calc_stats
    pkmn.hp = [(pkmn.totalhp * spec["hp"]).floor, 1].max if spec["hp"]
    pkmn.status = spec["st"].to_sym if spec["st"]
    pkmn.statusCount = 3 if spec["st"] == "SLEEP"
    pkmn
  end

  # Registers battler idx's action for this round ("N", "N>T", "Nd"/"Nz"/"Nu"
  # (+ ">T"), "sN", "ai" or nil).
  def choose(battle, idx, act)
    act ||= "0"
    if act == "ai"
      battle.battleAI.pbDefaultChooseEnemyCommand(idx)
      return
    end
    if act.start_with?("s")
      idxParty = act[1..-1].to_i
      return if battle.pbCanSwitch?(idx, idxParty) && battle.pbRegisterSwitch(idx, idxParty)
      act = "0"
    end
    m = act.match(/^(\d+)([dzu]?)(?:>(\d+))?$/)
    raise "bad action #{act}" if !m
    want = m[1].to_i
    mech = m[2]
    tgt = m[3]
    user = battle.battlers[idx]
    case mech
    when "d"
      if battle.pbCanDynamax?(idx)
        battle.pbToggleRegisteredDynamax(idx)
        user.power_trigger = true
        user.display_power_moves("Max Move")
      end
    when "z"
      if battle.pbCanZMove?(idx)
        battle.pbToggleRegisteredZMove(idx)
        user.power_trigger = true
        user.display_power_moves("Z-Move")
      end
    when "u"
      if battle.pbCanUltraBurst?(idx)
        battle.pbToggleRegisteredUltraBurst(idx)
        user.power_trigger = true
      end
    end
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
    $stats = GameStats.new
    $PokemonSystem.battlescene = sc["battlescene"] || 0
    $bag = PokemonBag.new
    (sc["bag"] || ["DYNAMAXBAND", "ZRING"]).each { |it| $bag.add(it.to_sym) }
    p1 = (sc["p"] || [{}]).map { |s| make_pokemon(s, 0) }
    p2 = (sc["o"] || [{}]).map { |s| make_pokemon(s, 1) }
    scene = RecordingScene.new
    opponent = nil
    if sc["trainer"]
      tr = NPCTrainer.new("Joey", (sc["trainerType"] || "LEADER_Falkner").to_sym)
      tr.items = (sc["trainerItems"] || []).map(&:to_sym)
      opponent = [tr]
    end
    battle = Battle.new(scene, p1, p2, $player, opponent)
    battle.items = [opponent[0].items] if opponent # what pbTrainerBattle does
    battle.setBattleMode("double") if sc["double"]
    battle.internalBattle = true
    battle.showAnims = true
    random = SeqRandom.new(seed)
    battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
    battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
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
        ZudHarness.choose(self, i, acts[i])
      end
      snap.call("commands #{@turnCount + 1}")
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
scenarios = JSON.parse(File.read(File.join(__dir__, "zud_scenarios.json")))["scenarios"]
out = []
scenarios.each_with_index do |sc, i|
  seed = 7000 + 1000 * i
  result = ZudHarness.run(sc, seed)
  out << { "scenario" => sc, "seed" => seed }.merge(result)
end
$stderr.puts "#{scenarios.length} scenarios; #{out.count { |o| o['error'] }} ended with a Ruby error"
out.each { |o| $stderr.puts "  #{o['scenario']['name']}: #{o['error']}" if o["error"] }
path = File.join(ROOT, "web", "src", "battle", "zud", "zudReference.json.gz")
Zlib::GzipWriter.open(path) { |gz| gz.mtime = 0; gz.write(JSON.generate(out) + "\n") }
puts "Wrote #{path} (#{File.size(path) / 1024} KB)"
