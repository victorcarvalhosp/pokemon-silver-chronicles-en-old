# Differential reference for ZUD Mechanics' Max Raids and Dynamax Adventures
# ([009] Max Raid, [010] Adventures): runs the game's real Ruby headless (see
# essentials.rb, which already loads Raid_Battle*.rb) and writes
# web/src/battle/zud/raid/raidReference.json.gz, which
# web/src/battle/zud/raid/raidReference.test.ts replays through the port.
#
#   cd web && ruby tools/ruby-ref/raid_reference.rb
#
# Two parts:
# 1. Raid battles (raid_scenarios.json): a RaidBattle with $game_temp.dx_rules
#    as MaxRaidBattle.start leaves them, the boss set up as generate_foe /
#    pbApplyWildAttributes do (Dynamaxed, reverted), scripted player commands
#    ("N", "Nd", ">T", "c" = Cheer) and the AI for the boss. Every round records
#    the messages/animations (plus the raid scene's [raidshield]/[wave]) and the
#    battle state (raid effects, shields, KO counter, timer, bonuses). The raid
#    capture's Bag picks a Poké Ball; caught Pokémon go to a stub PC.
#    The battle's randomness is battle_reference.rb's SeqRandom; Cheer's
#    Array#sample and raid_ResetPokemon's rand go through pbRandom as in the
#    TS port.
# 2. Generation (outside battle): raid_ranks.dat, the banlist, species lists,
#    movelists, raid_Rewards, generate_foe, pbApplyBattleRules' raid branch,
#    the Dynamax Adventure's lair species and rentals, and the Max Lair map's
#    tiles. Randomness is scripted as in lifecycle_reference.rb: Kernel#rand(n)
#    is raw % n, Array#sample is self[rand(size)], Array#shuffle Ruby 2.6's
#    (from the end, rand(i)), on each case's raw numbers; the TS test mocks
#    core/random the same way.

require "json"
require "zlib"
require_relative "essentials"

Essentials.load!(verbose: true)

# Same fixes as move_effects_reference.rb / zud_reference.rb (see there).
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

# Essentials Deluxe's GameData::Species#bitmap_exists? ([000] Essentials Patches/Species Files.rb:143;
# the rest of that file is sprite code).
begin
  path = File.join(PLUGINS, "Essentials Deluxe", "[000] Essentials Patches", "Species Files.rb")
  lines = File.read(path, encoding: "UTF-8").lines
  first = lines.index { |l| l =~ /^\s*def bitmap_exists\?/ }
  last = (first...lines.length).find { |i| lines[i] =~ /^    end\s*$/ }
  GameData::Species.class_eval(lines[first..last].join, path, first + 1)
end
# pbGetEnvironment (001_Overworld_BattleStarting.rb) on a map without metadata or terrain: :None.
def pbGetEnvironment; :None; end

class GameStats
  %i[zmove_count status_zmove_count ultra_burst_count dynamax_count gigantamax_count
     max_raid_dens_entered max_raid_dens_cleared max_lairs_entered dark_lairs_entered
     endless_lairs_entered max_lairs_cleared endless_lair_records].each do |a|
    define_method(a) { instance_variable_get("@#{a}") || 0 }
    attr_writer a
  end
end

#===============================================================================
# Globals and stubs
#===============================================================================
class Game_Temp
  attr_accessor :battle_rules_log
  def battle_rules; @battle_rules ||= {}; end
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

class PokemonGlobalMetadata
  attr_accessor :eventvars, :nextBattleBGM, :nextBattleVictoryBGM, :partner
  def initialize; @eventvars = {}; end
end

class SwitchStub
  ON = [Settings::CAN_DYNAMAX_WILD, Settings::DYNAMAX_ANY_MAP].freeze
  def [](i); ON.include?(i); end
  def []=(_i, _v); end
end

class PokemonSystemStub
  attr_accessor :battlescene, :givenicknames
  def initialize; @battlescene = 0; @givenicknames = 1; end
  def method_missing(*_a); 0; end
  def respond_to_missing?(*_a); true; end
end

module PBDayNight
  def self.isDay?(*_a); true; end
  def self.isNight?(*_a); false; end
  def self.isEvening?(*_a); false; end
  def self.isMorning?(*_a); false; end
  def self.isAfternoon?(*_a); false; end
end
def pbGetSeason; 0; end

# The PC (Raid_Battle.rb stores caught raid Pokémon with pbStoreCaught).
class StorageStub
  Box = Struct.new(:name)
  attr_reader :stored
  def initialize; @stored = []; end
  def full?; false; end
  def pbStoreCaught(pkmn); @stored << pkmn; 0; end
  def [](_i); Box.new("Box 1"); end
end

# File lookups (pbResolveBitmap: the PNG files; audio: none).
def pbResolveBitmap(path)
  return nil if !path
  File.exist?(File.join(ROOT, path + ".png")) || File.exist?(File.join(ROOT, path)) ? path : nil
end
def pbResolveAudioFile(*_a); nil; end
def pbFadeOutIn(*_a); yield if block_given?; end
def pbHiddenMoveAnimation(*_a); true; end
def pbPlayDecisionSE(*_a); end
def pbPlayCancelSE(*_a); end
def pbPlayCursorSE(*_a); end
def main_stats; ret = []; GameData::Stat.each_main { |s| ret << s }; ret; end

# The raid capture's Bag: picks a Poké Ball.
class PokemonBag_Scene; end
class PokemonBagScreen
  def initialize(*_a); end
  def pbChooseItemScreen(*_a); :POKEBALL; end
end

# Player#has_snag_machine (014_Pokemon/001_Pokemon-related/001_ShadowPokemon.rb isn't loaded).
class Player
  def has_snag_machine; false; end if !method_defined?(:has_snag_machine)
end

MAP_STUB = Struct.new(:map_id) { def metadata; nil; end }.new(0)
$game_map       = MAP_STUB
$game_switches  = SwitchStub.new
$game_variables = Hash.new(0)
$PokemonSystem  = PokemonSystemStub.new

def reset_world
  $game_temp = Game_Temp.new
  $game_temp.dx_rules = {}
  $game_temp.dx_pokemon = {}
  $game_temp.dx_midbattle = {}
  $PokemonGlobal = PokemonGlobalMetadata.new
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = 12_345_678
  $player.badges = [true] * 8
  $bag = PokemonBag.new
  $stats = GameStats.new
  $PokemonStorage = StorageStub.new
end
reset_world

# The rest of ZUD's Max Raid and Adventure scripts.
failures = []
["[009] Max Raid/Raid_Ranks.rb", "[009] Max Raid/Raid_Setup.rb",
 "[010] Adventures/Adventure_Main.rb", "[010] Adventures/Adventure_Triggers.rb"].each do |f|
  Essentials.eval_file(File.join(PLUGINS, "ZUD Mechanics", f), failures)
end
warn failures.join("\n") if !failures.empty?
reset_world

#===============================================================================
# Scripted randomness (generation)
#===============================================================================
$scripted = false
$rolls = []
$used = 0

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

$battle_rng = nil
class Array
  alias __raid_sample sample
  alias __raid_shuffle shuffle
  def sample(*args)
    if $battle_rng && args.empty?
      return nil if empty?
      return self[$battle_rng.pbRandom(length)]
    end
    return __raid_sample(*args) if !$scripted || !args.empty?
    empty? ? nil : self[rand(size)]
  end
  def shuffle(*args)
    return __raid_shuffle(*args) if !$scripted
    ret = dup
    i = ret.length
    while i > 0
      j = rand(i)
      i -= 1
      ret[i], ret[j] = ret[j], ret[i]
    end
    ret
  end
end

def with_rolls(rolls)
  $rolls = rolls.dup
  $used = 0
  $scripted = true
  begin
    yield
  ensure
    $scripted = false
  end
end

#===============================================================================
# Part 1: raid battles
#===============================================================================
class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end
# Kernel#rand in RaidBattle / Battle methods (raid_ResetPokemon) through pbRandom.
class Battle
  def rand(x = 0); pbRandom(x); end
end
# Cheer's Array#sample through the battle's pbRandom (as the TS port does).
module RaidCheerRandom
  def pbCheer(*a)
    old = $battle_rng
    $battle_rng = self
    begin
      super(*a)
    ensure
      $battle_rng = old
    end
  end
end
RaidBattle.prepend(RaidCheerRandom)

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

class RecordingScene < Battle::DebugSceneNoLogging
  attr_reader :log
  attr_reader :sprites
  SpritePos = Struct.new(:x, :y)

  def initialize
    super
    @log = []
    @sprites = Hash.new { |h, k| h[k] = SpritePos.new(0, 0) }
  end

  def pbDeluxeTriggers(*_args); end
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
  def pbSendOutBattlers(send_outs, _start = false); @log << "[sendout] #{send_outs.map { |s| s[0] }.join(',')}"; end
  def pbChangePokemon(idx, pkmn)
    idx = idx.index if idx.respond_to?(:index)
    @log << "[change] #{idx} #{pkmn.species} #{pkmn.form}#{pkmn.dynamax? ? ' dmax' : ''}"
  end
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
  # ZUD Mechanics' Max Raid scene methods ([005] Battle_Scene/Scene_Animation_MaxRaid.rb).
  def pbRaidShield(battler)
    @log << "[raidshield] #{battler.index} #{battler.effects[PBEffects::RaidShield]}/#{battler.effects[PBEffects::MaxShieldHP]}"
  end
  def pbWaveAttack(idx); @log << "[wave] #{idx}"; end
  # Catching (Battle::Scene's Poké Ball animations).
  def pbThrow(ball, shakes, critical, idx, _show_player = false); @log << "[throw] #{ball} #{shakes} #{critical} #{idx}"; end
  def pbThrowSuccess; @log << "[throwsuccess]"; end
  def pbHideCaptureBall(idx); @log << "[hidecaptureball] #{idx}"; end
  def pbThrowAndDeflect(ball, idx); @log << "[deflect] #{ball} #{idx}"; end
  def pbShowPokedex(species); @log << "[pokedex] #{species}"; end
  # Essentials Deluxe (wild_boss_flee).
  def pbBattlerFlee(battler, _msg = nil); @log << "[flee] #{battler.index}"; end

  def pbPartyScreen(idxBattler, _canCancel = false)
    replacements = []
    @battle.eachInTeamFromBattlerIndex(idxBattler) do |_b, idxParty|
      replacements.push(idxParty) if !@battle.pbFindBattler(idxParty, idxBattler)
    end
    replacements.each { |i| break if yield i, self }
  end
end

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

  def battler(b)
    {
      "species" => b.species.to_s, "form" => b.form, "hp" => b.hp, "totalhp" => b.totalhp,
      "status" => b.status.to_s, "ability" => ser(b.ability_id), "item" => ser(b.item_id), "level" => b.level,
      "stats" => [b.attack, b.defense, b.spatk, b.spdef, b.speed],
      "stages" => b.stages.select { |_k, v| v != 0 }.map { |k, v| [k.to_s, v] }.sort.to_h,
      "effects" => sparse(b.effects),
      "moves" => b.moves.map { |m| [m.id.to_s, m.pp] },
      "baseMoves" => b.base_moves.map { |m| [m.id.to_s, m.pp] },
      "dynamax" => b.dynamax? ? true : false, "fainted" => b.fainted ? true : false
    }
  end

  def state(battle)
    r = $game_temp.dx_rules
    {
      "turnCount" => battle.turnCount, "decision" => battle.decision,
      "battlers" => battle.battlers.map { |b| b ? battler(b) : nil },
      "sides" => battle.sides.map { |s| sparse(s.effects) },
      "field" => { "weather" => battle.field.weather.to_s, "terrain" => battle.field.terrain.to_s },
      "dynamax" => ser(battle.dynamax),
      "rules" => { "perfect_bonus" => r[:perfect_bonus], "timer_bonus" => r[:timer_bonus],
                   "fairness_bonus" => r[:fairness_bonus], "setcapture" => r[:setcapture] },
      "parties" => [0, 1].map do |side|
        battle.pbParty(side).map { |pk| pk ? [pk.species.to_s, pk.hp, pk.totalhp, pk.status.to_s, pk.dynamax?] : nil }
      end,
      "stored" => $PokemonStorage.stored.map { |p| [p.species.to_s, p.level, p.hp, p.totalhp, p.dynamax?, p.dynamax_lvl, p.moves.map { |m| m.id.to_s }] }
    }
  end
end

module RaidHarness
  module_function

  def make_pokemon(spec, owner)
    pkmn = Pokemon.new((spec["sp"] || "MEW").to_sym, spec["lv"] || 40, owner)
    GameData::Stat.each_main do |s|
      pkmn.iv[s.id] = 31
      pkmn.ev[s.id] = 0
    end
    pkmn.nature = :HARDY
    spec["ab"] ? pkmn.ability = spec["ab"].to_sym : pkmn.ability_index = 0
    pkmn.item = spec["it"] ? spec["it"].to_sym : nil
    pkmn.makeMale
    pkmn.forget_all_moves
    (spec["m"] || ["TACKLE"]).each { |m| pkmn.learn_move(m.to_sym) }
    pkmn.gmax_factor = true if spec["gmax"]
    pkmn.dynamax_lvl = spec["dlvl"] if spec["dlvl"]
    main_stats.each_with_index { |s, i| pkmn.iv[s.id] = spec["ivs"][i] } if spec["ivs"]
    pkmn.calc_stats
    pkmn
  end

  # What generate_foe / pbApplyWildAttributes leave on the raid Pokémon.
  def make_boss(spec)
    pkmn = make_pokemon(spec, $player)
    pkmn.dynamax = true
    pkmn.calc_stats
    pkmn.hp = pkmn.totalhp
    pkmn.reversion = true
    pkmn
  end

  # $game_temp.dx_rules as MaxRaidBattle.start / start_core and pbApplyBattleRules leave them.
  def rules_for(sc)
    r = sc["rules"]
    rules = {
      :size => r["size"], :turns => r["turns"], :kocount => r["kocount"], :shield => r["shield"],
      :rank => r["rank"], :environ => :Cave, :hard => r["hard"], :autoscale => false, :simple => true,
      :outcome => 1, :canlose => true, :noflee => true, :noexp => true, :nomoney => true, :nocapture => true,
      :nopartner => true
    }
    rules[:setcapture] = true if !rules[:hard]
    rules[:timer_bonus] = rules[:turns]
    rules[:perfect_bonus] = true
    rules[:fairness_bonus] = true
    rules[:introtext] = "A Dynamaxed {1} emerged from within the den!"
    rules[:raidcapture] = ["{1} disappeared somewhere into the den...", "Battle Raid Capture"]
    rules
  end

  def choose(battle, idx, act)
    act ||= "0"
    if act == "ai"
      battle.battleAI.pbDefaultChooseEnemyCommand(idx)
      return
    end
    if act == "c"
      battle.pbRegisterCheer(idx)
      return
    end
    m = act.match(/^(\d+)([d]?)(?:>(\d+))?$/)
    raise "bad action #{act}" if !m
    want = m[1].to_i
    user = battle.battlers[idx]
    if m[2] == "d" && battle.pbCanDynamax?(idx)
      battle.pbToggleRegisteredDynamax(idx)
      user.power_trigger = true
      user.display_power_moves("Max Move")
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
    if m[3]
      battle.pbRegisterTarget(idx, m[3].to_i)
    elsif target_data.targets_foe
      foe = battle.allOtherSideBattlers(idx).first
      battle.pbRegisterTarget(idx, foe.index) if foe
    else
      ally = battle.allSameSideBattlers(idx).find { |b| b.index != idx }
      battle.pbRegisterTarget(idx, ally.index) if ally
    end
  end

  def run(sc, seed)
    reset_world
    $bag.add(:DYNAMAXBAND)
    $bag.add(:POKEBALL, 5)
    rules = rules_for(sc)
    $game_temp.dx_rules = rules
    p1 = sc["p"].map { |s| make_pokemon(s, $player) }
    boss = make_boss(sc["boss"])
    scene = RecordingScene.new
    battle = RaidBattle.new(scene, p1, [boss], $player, nil)
    battle.setBattleMode("#{rules[:size]}v1")
    battle.internalBattle = true
    battle.showAnims = true
    battle.canLose = true
    battle.canRun = false
    battle.expGain = false
    battle.moneyGain = false
    battle.disablePokeBalls = true
    random = SeqRandom.new(seed)
    battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
    battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
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
        RaidHarness.choose(self, i, b.opposes? ? "ai" : acts[i / 2])
      end
      snap.call("commands #{@turnCount + 1}")
    end
    battle.define_singleton_method(:pbEndOfRoundPhase) do
      super()
      snap.call("round #{@turnCount + 1}")
    end
    battle.define_singleton_method(:pbEndOfBattle) do
      super()
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

battles = []
scenarios = JSON.parse(File.read(File.join(__dir__, "raid_scenarios.json")))["scenarios"]
scenarios.each_with_index do |sc, i|
  seed = 9000 + 1000 * i
  battles << { "scenario" => sc, "seed" => seed }.merge(RaidHarness.run(sc, seed))
end
$stderr.puts "#{scenarios.length} raid battles; #{battles.count { |o| o['error'] }} ended with a Ruby error"
battles.each { |o| $stderr.puts "  #{o['scenario']['name']}: #{o['error']}" if o["error"] }

#===============================================================================
# Part 2: generation
#===============================================================================
def pkmn_info(p)
  {
    "species" => p.species.to_s, "form" => p.form, "level" => p.level, "gender" => p.gender,
    "ivs" => main_stats.map { |s| p.iv[s.id] }, "evs" => main_stats.map { |s| p.ev[s.id] },
    "abilityIndex" => p.ability_index, "ability" => p.ability_id.to_s, "nature" => p.nature_id.to_s,
    "moves" => p.moves.map { |m| m.id.to_s }, "item" => p.item_id&.to_s, "dynamaxLvl" => p.dynamax_lvl,
    "gmaxFactor" => p.gmax_factor?, "dynamax" => p.dynamax?, "shiny" => p.shiny?, "superShiny" => p.super_shiny?,
    "scale" => p.scale, "ribbons" => p.ribbons.map(&:to_s), "hp" => p.hp, "totalhp" => p.totalhp,
    "obtainText" => p.obtain_text, "owner" => [p.owner.name, p.owner.gender]
  }
end

ROLLS = Array.new(400) { |i| ((i * 2_654_435_761) + 977) % (1 << 30) }
def rolls_for(seed); ROLLS.rotate(seed % ROLLS.length).first(300); end

gen = {}
ranks = load_data("Data/raid_ranks.dat")
gen["raidRanks"] = { "ranks" => ranks[0, 6].map { |r| r.map(&:to_s) }, "total" => ranks[6].map(&:to_s), "banned" => ranks[7].map(&:to_s) }
gen["banlist"] = raid_GenerateBanlist.map(&:to_s)

lists = []
[[[], 1], [[], 2], [[], 3], [[], 4], [[], 5], [[], 6], [[], nil]].each do |params, rank|
  [false, true].each do |db|
    lists << { "params" => params, "rank" => rank, "db" => db, "list" => raid_GenerateSpeciesList(params, rank, nil, db).map(&:to_s) }
  end
end
[[[:FIRE, nil, nil], 3], [[nil, :Cave, nil], 2], [[nil, nil, 8], nil], [[:DRAGON, :Mountain, nil], 6]].each do |params, rank|
  lists << { "params" => params.map { |x| x.is_a?(Symbol) ? x.to_s : x }, "rank" => rank, "db" => true,
             "list" => raid_GenerateSpeciesList(params, rank, nil, true).map(&:to_s) }
end
[[:PIKACHU, 1], [:ROTOM_1, 4], [:SNORLAX, 3], [:SHAYMIN, 6]].each do |sp, rank|
  lists << { "params" => sp.to_s, "rank" => rank, "db" => false, "list" => raid_GenerateSpeciesList(sp, rank).map(&:to_s) }
end
gen["speciesLists"] = lists
gen["eligible"] = %w[PIKACHU PIKACHU_1 ROTOM_1 SMEARGLE MEWTWO_1 ZYGARDE_1 NOTASPECIES].map do |s|
  [s, raid_GetEligibleSpecies(s.to_sym).to_s]
end
gen["ranksAppearedIn"] = %w[PIKACHU SNORLAX MEWTWO ROTOM_1 CHARIZARD ETERNATUS DITTO].map { |s| [s, raid_RanksAppearedIn(s.to_sym)] }
gen["levelRank"] = (1..75).map { |l| [l, raid_RankFromLevel(l)] }

movelist_species = %w[PIKACHU CHARIZARD SNORLAX GENGAR ROTOM_1 ROTOM_5 DRAGAPULT GYARADOS TAUROS_1 ORICORIO_2
                      MACHAMP EEVEE KINGLER COALOSSAL DREDNAW BUTTERFREE URSHIFU_1 MAUSHOLD SHUCKLE DARKRAI]
gen["movelists"] = movelist_species.flat_map do |s|
  [false, true].map { |rental| { "species" => s, "rental" => rental, "lists" => raid_GenerateMovelists(s.to_sym, rental).map { |l| l.map(&:to_s) } } }
end

gen["rewards"] = [[:SNORLAX, 1, 1], [:GYARADOS, 3, 3], [:CHARIZARD, 4, 5], [:ETERNATUS, 6, 5], [:VESPIQUEN, 5, 4], [:PIDGEOT, 2, 3]].each_with_index.map do |(sp, rank, bonus), i|
  out = nil
  with_rolls(rolls_for(i * 37)) { out = raid_Rewards(sp, rank, bonus).map { |item, qty| [item&.to_s, qty] } }
  { "species" => sp.to_s, "rank" => rank, "bonus" => bonus, "seed" => i * 37, "rewards" => out, "used" => $used }
end

# generate_foe: [species (string), Pokémon spec, or array], rank, pokemon hash
foe_cases = [
  { "species" => "PIKACHU", "rank" => 1 },
  { "species" => "CHARIZARD", "rank" => 5 },
  { "species" => "MEWTWO", "rank" => 6 },
  { "species" => "SNORLAX", "rank" => 2 },
  { "species" => "VENUSAUR", "rank" => 4, "pokemon" => { "form" => "random", "ability" => 0 } },
  { "array" => [], "rank" => 3 },
  { "array" => ["WATER", nil, nil], "rank" => 4 },
  { "boss" => { "sp" => "KINGLER", "lv" => 55, "m" => %w[ROCKSLIDE LIQUIDATION KNOCKOFF XSCISSOR], "dlvl" => 10, "gmax" => true },
    "rank" => 5, "pokemon" => { "obtaintext" => "a stormy Max Raid Den" } },
  { "boss" => { "sp" => "GENGAR", "lv" => 55, "m" => %w[WILLOWISP DISABLE HEX SLUDGEWAVE], "dlvl" => 10, "gmax" => true,
                 "ivs" => [1, 2, 3, 4, 5, 6] },
    "rank" => 5, "pokemon" => {} }
]
gen["foes"] = foe_cases.each_with_index.map do |c, i|
  reset_world
  pokemon = {}
  (c["pokemon"] || {}).each { |k, v| pokemon[k.to_sym] = (k == "form" && v == "random") ? :random : v }
  out = nil
  rank = nil
  dx = nil
  error = nil
  boss = nil
  if c["boss"]
    with_rolls(rolls_for(1000 + i * 53)) { boss = RaidHarness.make_pokemon(c["boss"], $player) }
  end
  begin
    with_rolls(rolls_for(i * 53)) do
      species = c["boss"] ? boss : c["species"] ? c["species"].to_sym : c["array"].map { |x| x&.to_sym }
      pkmn, rank = MaxRaidBattle.generate_foe(species, c["rank"], pokemon)
      out = pkmn_info(pkmn)
      dx = Snap.ser($game_temp.dx_pokemon.reject { |k, _| k == :moves })
    end
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  { "case" => c, "seed" => i * 53, "pkmn" => out, "rank" => rank, "dx" => dx, "used" => $used, "error" => error }
end

# pbApplyBattleRules' raid branch (setBattleRule and pbSetBackdrop recorded).
def setBattleRule(*args); ($game_temp.battle_rules_log ||= []) << args.map { |a| a.is_a?(Symbol) ? a.to_s : a }; end
def pbSetBackdrop(env); ($game_temp.battle_rules_log ||= []) << ["backdrop", env.to_s]; end
def pbRegisterPartner(*_a); end
rule_cases = [
  { "rules" => { "size" => 3, "turns" => 14, "kocount" => 3, "shield" => 2, "rank" => 3, "hard" => false, "autoscale" => true }, "level" => 42 },
  { "rules" => { "size" => 1, "turns" => 14, "kocount" => 3, "shield" => 2, "rank" => 5, "hard" => true, "autoscale" => true }, "level" => 62 },
  { "rules" => { "size" => 2, "turns" => 3, "kocount" => 9, "shield" => 0, "rank" => 6, "hard" => true, "autoscale" => true }, "level" => 75, "species" => "ETERNATUS" },
  { "rules" => { "size" => 6, "turns" => 10, "kocount" => 3, "shield" => 5, "rank" => 4, "hard" => false, "autoscale" => false, "weather" => "Rain", "terrain" => "Electric", "environ" => "Sand", "bgm" => "Custom" }, "level" => 52 }
]
gen["applyRules"] = rule_cases.map do |c|
  reset_world
  (c["rules"]["size"]).times { $player.party << RaidHarness.make_pokemon({ "sp" => "PIKACHU", "lv" => 20 }, $player) }
  rules = {}
  c["rules"].each { |k, v| rules[k.to_sym] = (%w[weather terrain environ].include?(k) ? v.to_sym : v) }
  $game_temp.dx_rules = rules
  $game_temp.dx_pokemon = { :level => c["level"], :species => (c["species"] || "PIKACHU").to_sym }
  pbApplyBattleRules(1, true)
  { "case" => c, "rules" => Snap.ser(rules), "log" => $game_temp.battle_rules_log || [], "bgm" => $PokemonGlobal.nextBattleBGM }
end

# Dynamax Adventure: lair species and rentals.
gen["adventure"] = [0, 1, 2].map do |n|
  reset_world
  $player.badges = [true] * [2, 6, 8][n] + [false] * (8 - [2, 6, 8][n])
  adv = DynamaxAdventure.new
  species = nil
  rentals = nil
  with_rolls(rolls_for(500 + n * 71)) do
    adv.boss_species = :ZAPDOS if n == 2
    adv.generate_species
    species = adv.lair_species.map { |s| s&.to_s }
    rentals = Array.new(3) { pkmn_info(adv.generate_rental) }
    adv.last_pokemon = Pokemon.new(:PIKACHU, 30)
    rentals << pkmn_info(adv.generate_rental)
  end
  { "badges" => [2, 6, 8][n], "seed" => 500 + n * 71, "species" => species, "rentals" => rentals, "used" => $used }
end

#===============================================================================
# Part 3: the Max Lair map (MaxLair_Map.rb, MaxLair_Controls.rb) headless
#===============================================================================
# Sprites keep what the map reads back (position, visibility, src_rect,
# opacity, colour alpha); bitmaps only have their PNG's size.
def png_size(path)
  file = [path + ".png", path].find { |f| File.exist?(File.join(ROOT, f)) }
  return [32, 32] if !file
  File.binread(File.join(ROOT, file), 24)[16, 8].unpack("NN")
end
class Bitmap
  attr_reader :width, :height
  def initialize(*a)
    @width, @height = a[0].is_a?(String) ? png_size(a[0]) : [a[0] || 32, a[1] || 32]
  end
  def rect; Rect.new(0, 0, @width, @height); end
  def method_missing(*_a); nil; end
end
class AnimatedBitmap
  attr_reader :bitmap
  def initialize(path, *_a); @bitmap = Bitmap.new(path); end
  def width; @bitmap.width; end
  def height; @bitmap.height; end
  def dispose; end
end
class Rect
  attr_accessor :x, :y, :width, :height
  def initialize(x = 0, y = 0, w = 0, h = 0); set(x, y, w, h); end
  def set(x = 0, y = 0, w = 0, h = 0); @x, @y, @width, @height = x, y, w, h; self; end
end
class Color
  attr_accessor :red, :green, :blue, :alpha
  def initialize(r = 0, g = 0, b = 0, a = 255); @red, @green, @blue, @alpha = r, g, b, a; end
end
class LairSpriteStub
  attr_accessor :x, :y, :z, :visible, :opacity, :zoom_x, :zoom_y, :color, :viewport, :mirror, :tone, :src_rect
  attr_reader :bitmap
  def initialize(viewport = nil)
    @x = @y = @z = 0; @visible = true; @opacity = 255; @zoom_x = @zoom_y = 1
    @color = Color.new(0, 0, 0, 0); @src_rect = Rect.new; @viewport = viewport
  end
  def bitmap=(b); @bitmap = b; @src_rect = Rect.new(0, 0, b ? b.width : 0, b ? b.height : 0); end
  def update; end
  def dispose; @disposed = true; end
  def disposed?; @disposed; end
end
class IconSprite < LairSpriteStub
  def initialize(x = 0, y = 0, viewport = nil); super(viewport); @x = x; @y = y; end
  def setBitmap(path); self.bitmap = path ? Bitmap.new(path) : nil; end
end
class PokemonSprite < LairSpriteStub
  def setPokemonBitmap(*_a); end
  def unDynamax; end
  def setOffset(*_a); end
end
class AnimatedSprite < LairSpriteStub
  def initialize(*a); super(a[5]); end
  def play; end
end
module PictureOrigin
  TOP_LEFT = 0; CENTER = 1; TOP_RIGHT = 2; BOTTOM_LEFT = 3; LOWER_LEFT = 3; BOTTOM_RIGHT = 4; LOWER_RIGHT = 4
  TOP = 5; BOTTOM = 6; LEFT = 7; RIGHT = 8
end
def lair_rolls(seed); Array.new(4000) { |i| (((i + seed) * 2_654_435_761) + 977) % (1 << 30) }; end
def pbUpdateSpriteHash(*_a); end
def pbDisposeSpriteHash(*_a); end
def pbFadeOutAndHide(*_a); {}; end
def pbFadeInAndShow(*_a); end
def pbSetSmallFont(*_a); end
def pbDrawTextPositions(*_a); end
$lair_log = []
def pbMessage(msg, *_a); $lair_log << msg; 0; end
def pbConfirmMessage(msg, *_a); $lair_log << msg; true; end
def pbMaxLairMenu(type); $lair_log << "[menu] #{type}"; end
def pbHiddenMoveAnimation(pkmn, *_a); $lair_log << "[hiddenmove] #{pkmn&.species}"; true; end
["[010] Adventures/MaxLair_Map.rb", "[010] Adventures/MaxLair_Controls.rb"].each do |f|
  Essentials.eval_file(File.join(PLUGINS, "ZUD Mechanics", f), failures)
end
warn failures.join("\n") if !failures.empty?

class LairMapScene
  attr_accessor :route
  def lair_MapIntro(*_a); end
  # A battle is recorded and counted as won (the shadow and type icon disappear).
  def lair_StartBattle(index)
    return if !@sprites["Shadow_#{index}"].visible
    $lair_log << "[battle] #{index} #{@lair_pokemon[index].species}"
    @sprites["Shadow_#{index}"].color.alpha = 0
    @sprites["Shadow_#{index}"].visible = false
    @sprites["Type_#{index}"].visible = false
    pbDynamaxAdventure.boss_battled = (@lair_pokemon[index] == @lair_pokemon.last)
  end
  # Route selection on a script: at each Selection tile, the route[n]-th way (mod the ways there).
  def lair_ChooseRoute
    @route.each do |r|
      break if pbDynamaxAdventure.ended?
      ways = lair_TileType("Select") || []
      break if ways.empty?
      way = ways[r % ways.length]
      $lair_log << "[route] #{@player.x},#{@player.y} #{ways.join('')} #{way}"
      lair_MovePlayerIcon(way)
    end
  end
  def dump
    @sprites.map do |k, s|
      [k, s.x, s.y, s.visible ? true : false, [s.src_rect.x, s.src_rect.y, s.src_rect.width, s.src_rect.height], s.opacity, s.color.alpha]
    end
  end
end

lair_cases = [
  { "map" => 0, "seed" => 11, "route" => [0, 1, 0, 2, 1, 0, 1, 1, 0, 2, 0, 1, 0, 0, 1, 2, 0, 1] },
  { "map" => 1, "seed" => 23, "route" => [1, 0, 1, 2, 0, 0, 1, 2, 1, 0, 1, 0, 2, 1, 0, 1, 1, 0] },
  { "map" => 2, "seed" => 37, "route" => [2, 1, 0, 0, 1, 1, 2, 0, 1, 0, 2, 2, 1, 0, 0, 1, 2, 1] },
  { "map" => 0, "seed" => 51, "route" => [3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3, 2] }
]
gen["lairMaps"] = lair_cases.map do |c|
  reset_world
  3.times { |i| $player.party << RaidHarness.make_pokemon({ "sp" => %w[PIDGEOT MACHAMP GYARADOS][i], "lv" => 50 }, $player) }
  adv = pbDynamaxAdventure
  adv.instance_variable_set(:@in_progress, true)
  adv.knockouts = 3
  $lair_log = []
  built = nil
  final = nil
  error = nil
  begin
    with_rolls(lair_rolls(c["seed"])) do
      adv.generate_species
      scene = LairMapScene.new
      scene.route = c["route"]
      scene.define_singleton_method(:lair_MovePlayerIcon_orig) { |*a| nil }
      first = true
      scene.define_singleton_method(:lair_ChooseRoute_build) { nil }
      # Snapshot the map as built (before the first move), then run the route.
      orig_move = scene.method(:lair_MovePlayerIcon)
      scene.define_singleton_method(:lair_MovePlayerIcon) do |*a|
        if first
          first = false
          built = dump
        end
        orig_move.call(*a)
      end
      scene.pbStartScene(c["map"])
      final = scene.dump
    end
  rescue StandardError => e
    error = "#{e.class}: #{e.message} @ #{e.backtrace.first(2).join(' | ')}"
  end
  { "case" => c, "species" => adv.lair_species.map { |s| s&.to_s }, "built" => built, "final" => final, "log" => $lair_log,
    "adventure" => [adv.keycount, adv.knockouts, adv.boss_battled, Snap.ser(adv.loot)],
    "party" => $player.party.map { |p| [p.species.to_s, p.hp, p.status.to_s] }, "used" => $used, "error" => error }
end
$stderr.puts "#{lair_cases.length} lair maps; #{gen['lairMaps'].count { |o| o['error'] }} ended with a Ruby error"
gen["lairMaps"].each { |o| $stderr.puts "  map #{o['case']['map']}: #{o['error']}" if o["error"] }

out = { "battles" => battles, "gen" => gen }
path = File.join(ROOT, "web", "src", "battle", "zud", "raid", "raidReference.json.gz")
Zlib::GzipWriter.open(path) { |gz| gz.mtime = 0; gz.write(JSON.generate(out) + "\n") }
puts "Wrote #{path} (#{File.size(path) / 1024} KB)"
