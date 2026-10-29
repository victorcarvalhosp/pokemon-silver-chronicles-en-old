# Reference battles for the Battle Palace, Battle Arena and recorded battle
# ports (web/src/game/battle/battlePalace.ts, battleArena.ts, recordedBattle.ts):
# runs whole battles on the game's real Ruby (essentials.rb +
# 011_Battle/007_Other battle types/003-005) and writes
# web/src/game/battle/otherBattleTypesReference.json for
# otherBattleTypes.test.ts.
#
#   cd web && ruby tools/ruby-ref/other_battle_types_reference.rb
#
# - Palace: both sides pick their own moves (pbAutoFightMenu) and may switch
#   (the Palace's pbEnemyShouldWithdraw?).
# - Arena: scripted moves; every third round the referee judges.
# - Recorded: a RecordedBattle with scripted choices, its record (rounds,
#   switches), and the same battle played back from the record.
# Randomness: Essentials' top-level rand (which Battle#pbRandom and the AI's
# pbAIRandom both call) returns the counter-based sequence
# ((k * 829348651 + 12345) % 2147483647) % x.

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)

# As in ability_reference.rb: the Battle::Battler helpers from
# 014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb (pbHyperModeObedience),
# and the Gen 9 Pack's Sun assignment bug the port deliberately compares.
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
$PokemonGlobal  = nil
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
8.times { |i| $player.badges[i] = true }
$bag            = PokemonBag.new
$stats          = GameStats.new

def eval_ruby(file)
  path = File.join(SCRIPTS, file)
  TOPLEVEL_BINDING.eval(File.read(path, encoding: "UTF-8"), path)
end
eval_ruby("011_Battle/007_Other battle types/003_BattlePalaceBattle.rb")
eval_ruby("011_Battle/007_Other battle types/005_RecordedBattle.rb")

$log = []
$errors = []
# PBDebug.logonerr: record the exception and carry on, as Ruby does.
module PBDebug
  def self.logonerr
    yield
  rescue StandardError => e
    $log << "[exception]"
    $errors << "#{e.class}: #{e.message} @ #{e.backtrace[0..2].join(' < ')}"
    raise "Too many exceptions" if $errors.length > 10   # don't loop forever
  end
end

def snapshot(battle, label)
  $log << "== #{label}"
  battle.battlers.each_with_index do |b, i|
    next if !b || !b.pokemon
    $log << "##{i} #{b.species} hp=#{b.hp}/#{b.totalhp} st=#{b.status}#{b.fainted? ? ' FAINTED' : ''}"
  end
end

class LogScene < Battle::DebugSceneNoLogging
  attr_accessor :turns
  def pbBeginCommandPhase
    snapshot(@battle, "round #{@battle.turnCount + 1}")
    @battle.pbAbort if @battle.turnCount >= @turns
  end
  def pbDeluxeTriggers(*_a); end
  def pbDisplayMessage(msg, _brief = false); $log << msg; end
  alias pbDisplay pbDisplayMessage
  def pbDisplayPausedMessage(msg); $log << msg; end
  def pbDisplayConfirmMessage(msg); $log << "[confirm] #{msg}"; return true; end
  def pbShowAbilitySplash(battler, _delay = false, _logTrigger = true); $log << "[splash] #{battler.pbThis}"; end
  def pbSendOutBattlers(sendOuts, _startBattle = false)
    sendOuts.each { |idx, pkmn| $log << "[sendout] #{idx}: #{pkmn.name}" }
  end
  def pbRecall(idxBattler); $log << "[recall] #{idxBattler}"; end
  def pbPartyScreen(idxBattler, _canCancel = false)
    replacements = []
    @battle.eachInTeamFromBattlerIndex(idxBattler) do |_b, idxParty|
      replacements.push(idxParty) if !@battle.pbFindBattler(idxParty, idxBattler)
    end
    replacements.each { |idxParty| break if yield idxParty, self }
  end
  def pbFaintBattler(battler); $log << "[faint] #{battler.pbThis}"; end
  def pbBattleArenaBattlers(b1, b2); $log << "[arena] #{b1.name} VS #{b2.name}"; end
  def pbBattleArenaJudgment(b1, b2, r1, r2); $log << "[judgment] #{b1.name} #{r1.inspect} #{b2.name} #{r2.inspect}"; end
  def pbEndBattle(result); snapshot(@battle, "end decision=#{result}"); end
end

def make_pokemon(spec)
  pkmn = Pokemon.new(spec["s"].to_sym, spec["l"] || 50, $player)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = 31
    pkmn.ev[s.id] = 0
  end
  pkmn.nature = (spec["n"] || "HARDY").to_sym
  pkmn.ability = (spec["a"] || "HONEYGATHER").to_sym
  pkmn.item = nil
  pkmn.gender = 0
  pkmn.forget_all_moves
  spec["m"].each { |m| pkmn.learn_move(m.to_sym) }
  pkmn.calc_stats
  pkmn
end

def register_choice(battle, idx, choice)
  if choice.is_a?(String) && choice.start_with?("s")
    if battle.pbCanSwitch?(idx, choice[1..-1].to_i)
      battle.pbRegisterSwitch(idx, choice[1..-1].to_i)
      return
    end
    $log << "[can't switch] #{idx}"
    choice = 0
  end
  b = battle.battlers[idx]
  if !battle.pbRegisterMove(idx, choice || 0, false)
    battle.pbAutoChooseMove(idx)
    return
  end
  return if battle.choices[idx][0] != :UseMove
  battle.pbRegisterTarget(idx, 1 - idx) if battle.choices[idx][2].pbTarget(b).num_targets == 1
end

def first_able(battle, idx)
  ret = -1
  battle.eachInTeamFromBattlerIndex(idx) { |_pkmn, i| ret = i if ret < 0 && battle.pbCanSwitchLax?(idx, i) }
  ret
end

# kind: "palace" (AI-driven), "arena"/"recorded" (scripted choices)
def run(sc, battle_class, record: nil)
  $log = []
  $errors = errors = []
  $seq = SeqRandom.new(sc["seed"])
  p1 = sc["p1"].map { |s| make_pokemon(s) }
  p2 = sc["p2"].map { |s| make_pokemon(s) }
  scene = LogScene.new
  scene.turns = sc["turns"]
  t = NPCTrainer.new("Joey", :YOUNGSTER)
  t.party = p2
  battle = record ? battle_class.new(scene, record) : battle_class.new(scene, p1, p2, $player, [t])
  battle.internalBattle = true if !record
  battle.expGain = false
  battle.moneyGain = false
  battle.controlPlayer = true
  ai = battle.battleAI
  if sc["kind"] == "palace"
    ai.define_singleton_method(:pbDefaultChooseEnemyCommand) do |idx|
      next if pbEnemyShouldWithdraw?(idx)
      next if battle.pbAutoFightMenu(idx)
    end
  else
    ai.define_singleton_method(:pbDefaultChooseEnemyCommand) do |idx|
      register_choice(battle, idx, (sc["choices"][battle.turnCount] || [])[idx])
    end
  end
  ai.define_singleton_method(:pbDefaultChooseNewEnemy) { |idx, *_a| first_able(battle, idx) }
  begin
    decision = battle.pbStartBattle
  rescue StandardError => e
    $log << "[fatal]"
    errors << "#{e.class}: #{e.message} @ #{e.backtrace[0..3].join(' < ')}"
    decision = -1
  end
  [battle, { "decision" => decision, "log" => $log, "errors" => errors }]
end

def mon(s, n, m, l = 50); { "s" => s, "n" => n, "m" => m, "l" => l }; end

SCENARIOS = [
  { "name" => "palace 3v3", "kind" => "palace", "seed" => 11, "turns" => 25,
    "p1" => [mon("MACHOKE", "BRAVE", %w[KARATECHOP PROTECT BULKUP COUNTER]),
             mon("GOLBAT", "TIMID", %w[WINGATTACK CONFUSERAY SWIFT HAZE], 46),
             mon("SLOWBRO", "RELAXED", %w[WATERGUN AMNESIA YAWN CONFUSION], 44)],
    "p2" => [mon("ARCANINE", "ADAMANT", %w[BITE FLAMEWHEEL ROAR LEER]),
             mon("JOLTEON", "HASTY", %w[THUNDERSHOCK DOUBLEKICK SANDATTACK AGILITY], 48),
             mon("SNORLAX", "GENTLE", %w[BODYSLAM REST DEFENSECURL AMNESIA], 45)] },
  { "name" => "palace pinch natures", "kind" => "palace", "seed" => 905, "turns" => 25,
    "p1" => [mon("NIDOKING", "SASSY", %w[POISONSTING THRASH LEER FOCUSENERGY]),
             mon("KADABRA", "CALM", %w[CONFUSION REFLECT RECOVER DISABLE], 40)],
    "p2" => [mon("GOLEM", "LAX", %w[ROCKTHROW DEFENSECURL SELFDESTRUCT MAGNITUDE]),
             mon("STARMIE", "MODEST", %w[WATERGUN RECOVER MINIMIZE SWIFT], 42)] },
  { "name" => "arena 2v2", "kind" => "arena", "seed" => 3, "turns" => 14,
    "choices" => Array.new(14) { |r| [r % 3 == 2 ? 1 : 0, r % 2] },
    "p1" => [mon("HERACROSS", "ADAMANT", %w[HORNATTACK PROTECT ENDURE COUNTER]),
             mon("DRAGONAIR", "MODEST", %w[TWISTER THUNDERWAVE SLAM AGILITY], 40)],
    "p2" => [mon("SCIZOR", "JOLLY", %w[METALCLAW SWORDSDANCE FURYCUTTER QUICKATTACK], 45),
             mon("LANTURN", "BOLD", %w[SPARK CONFUSERAY WATERGUN FLAIL], 44)] },
  { "name" => "arena tie", "kind" => "arena", "seed" => 77, "turns" => 8,
    "choices" => Array.new(8) { [1, 1] },
    "p1" => [mon("CHANSEY", "BOLD", %w[POUND PROTECT]), mon("PIDGEY", "HARDY", %w[TACKLE], 20)],
    "p2" => [mon("BLISSEY", "BOLD", %w[POUND PROTECT]), mon("RATTATA", "HARDY", %w[TACKLE], 20)] },
  { "name" => "recorded", "kind" => "recorded", "seed" => 21, "turns" => 12,
    "choices" => [[0, 0], [1, 0], ["s1", 2], [0, 1], [0, 0], [2, "s1"], [0, 0], [0, 3], [0, 0], [1, 0], [0, 0], [0, 0]],
    "p1" => [mon("QUILAVA", "HARDY", %w[EMBER QUICKATTACK SMOKESCREEN SWIFT], 30),
             mon("PIDGEOTTO", "HARDY", %w[GUST QUICKATTACK SANDATTACK WINGATTACK], 28)],
    "p2" => [mon("ONIX", "HARDY", %w[ROCKTHROW BIND HARDEN TACKLE], 28),
             mon("GEODUDE", "HARDY", %w[TACKLE ROCKTHROW DEFENSECURL MAGNITUDE], 27)] },
].freeze

out = []
SCENARIOS.each do |sc|
  case sc["kind"]
  when "palace"
    _b, res = run(sc, BattlePalaceBattle)
    out << sc.merge(res)
  when "arena"
    _b, res = run(sc, BattleArenaBattle)
    out << sc.merge(res)
  when "recorded"
    battle, res = run(sc, RecordedBattle)
    record = Marshal.load(battle.pbDumpRecord)
    res["record"] = { "type" => record[0], "rounds" => record[2], "switches" => record[4],
                      "randomCount" => record[3].length }
    _pb, playback = run(sc, RecordedBattle::PlaybackBattle, record: record)
    res["playback"] = playback
    out << sc.merge(res)
  end
end

File.write(File.join(ROOT, "web/src/game/battle/otherBattleTypesReference.json"), JSON.pretty_generate(out) + "\n")
puts "wrote web/src/game/battle/otherBattleTypesReference.json"
out.each { |o| puts "#{o['name']}: decision #{o['decision']}, #{o['log'].length} lines, errors #{o['errors']}" }
