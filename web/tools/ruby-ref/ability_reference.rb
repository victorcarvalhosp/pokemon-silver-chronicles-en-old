# Runs scripted battles through the game's real Ruby battle code (see
# essentials.rb) to test the ability handlers, and writes
# web/src/battle/abilities/abilityReference.json, which
# web/src/battle/abilities/abilityReference.test.ts replays in TypeScript.
#
#   cd web && ruby tools/ruby-ref/ability_reference.rb
#
# Each scenario fixes the Pokémon (species, level, ability, item, moves,
# gender, HP, status; IVs 31, EVs 0, Hardy nature unless given), the battle
# type, every battler's choice each round and the random stream (the same
# counter-based sequence as battle_reference.rb, for both battle.pbRandom and
# the AI's pbAIRandom; Kernel#rand in move code goes through it too, as the
# TypeScript port routes it through pbRandom). Both sides are driven through
# the AI hooks (controlPlayer), so no menu code runs. The log records every
# message, ability splash, animation, send-out/recall/faint, and a snapshot
# (HP, status, stat stages, ability, item, weather, terrain) at the start of
# each round and at the end of the battle.

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)

# essentials.rb doesn't load 014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb,
# whose Battle::Battler helpers the battle calls (pbHyperModeObedience in
# pbTryUseMove). Load those methods (not its pbInitPokemon wrapper, which only
# matters for Shadow Pokémon).
shadow = File.read(File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "002_ShadowPokemon_Other.rb"), encoding: "UTF-8")
Battle::Battler.class_eval(shadow[/^  def shadowPokemon\?.*?^  end\r?\n(?=end)/m])

# Deliberate deviation of the TypeScript port (web/src/battle/sunFix.test.ts):
# the Generation 9 Pack's pbCalcDamageMultipliers ([001] Battle/[001] Battle.rb:278)
# has `if @function = "IncreasePowerInSunWeather"` (an assignment), which gives
# every move in Sun Hydro Steam's multiplier and overwrites its function code.
# The port compares instead; do the same here so damage in Sun matches.
gen9_battle = File.read(File.join(PLUGINS, "Generation 9 Pack Scripts", "[001] Battle", "[001] Battle.rb"), encoding: "UTF-8")
calc = gen9_battle[/^  def pbCalcDamageMultipliers\(.*?^  end\r?\n/m]
raise "Gen 9 pbCalcDamageMultipliers not found" if !calc || !calc.include?('@function = "IncreasePowerInSunWeather"')
Battle::Move.class_eval(calc.sub('@function = "IncreasePowerInSunWeather"', '@function == "IncreasePowerInSunWeather"'))

# Ability bugs the port fixes on purpose (see the "Deliberate fix" notes in
# web/src/battle/abilities): re-evaluate those handlers with the same fixes.
def patch_ability_handler(path, ability, subs, copies: [])
  src = File.read(path, encoding: "UTF-8")
  block = src[/^Battle::AbilityEffects::\w+\.add\(:#{ability},.*?^\)\r?\n/m]
  raise "#{ability} handler not found in #{path}" if !block
  subs.each do |from, to|
    found = from.is_a?(Regexp) ? block.match?(from) : block.include?(from)
    raise "#{ability}: #{from.inspect} not found" if !found
    block = block.sub(from, to)
  end
  TOPLEVEL_BINDING.eval(block, path)
  copies.each { |c| TOPLEVEL_BINDING.eval(c, path) }
end
core_abilities = File.join(SCRIPTS, "011_Battle", "006_Other battle code", "008_Battle_AbilityEffects.rb")
gen9_abilities = File.join(PLUGINS, "Generation 9 Pack Scripts", "[003] Abilities", "[000] Ability Handlers.rb")
gen9_new_abilities = File.join(PLUGINS, "Generation 9 Pack Scripts", "[003] Abilities", "[001] New Ability Handlers.rb")
zud_abilities = File.join(PLUGINS, "ZUD Mechanics", "[008] Overrides", "Override_Abilities.rb")
patch_ability_handler(core_abilities, "COTTONDOWN", [["pbCanLowerStatStage?(:DEFENSE, target)", "pbCanLowerStatStage?(:SPEED, target)"]])
patch_ability_handler(core_abilities, "MAGICIAN",
                      [[/(battle\.pbHideAbilitySplash\(b\) if user\.opposes\?\(b\)\r?\n)(\s*)next/, "\\1\\2battle.pbHideAbilitySplash(user)\n\\2next"]])
patch_ability_handler(core_abilities, "BADDREAMS",
                      [["next if !b.takesIndirectDamage?(Battle::Scene::USE_ABILITY_SPLASH)",
                        "if !b.takesIndirectDamage?(Battle::Scene::USE_ABILITY_SPLASH)\nbattle.pbHideAbilitySplash(battler)\nnext\nend"]])
patch_ability_handler(zud_abilities, "FOREWARN", [[/"PowerLowerWithUserHappiness",\s*"PowerHigherWithUserHP",/, '"PowerLowerWithUserHappiness",']])
patch_ability_handler(gen9_abilities, "MUMMY", [["include?(user.ability)", "include?(user.ability_id)"]],
                      copies: ["Battle::AbilityEffects::OnBeingHit.copy(:MUMMY, :LINGERINGAROMA)"])
patch_ability_handler(gen9_abilities, "NEUTRALIZINGGAS",
                      [["GameData::Item.get(target.item)", "GameData::Item.get(b.item)"], ["@battle.pbDisplay", "battle.pbDisplay"]])
patch_ability_handler(gen9_abilities, "SYNCHRONIZE",
                      [["pbCanSynchronizeStatus?(:SLEEP, battler)", "pbCanSynchronizeStatus?(:DROWSY, battler)"],
                       ["user.pbSleep(nil, msg)", "user.pbDrowse(nil, msg)"],
                       ["pbCanSynchronizeStatus?(:FROZEN, battler)", "pbCanSynchronizeStatus?(:FROSTBITE, battler)"],
                       ["user.pbFreeze(nil, msg)", "user.pbFrostbite(nil, msg)"]])
patch_ability_handler(gen9_new_abilities, "OPPORTUNIST", [["higher!\", user.pbThis", "higher!\", battler.pbThis"]])

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
8.times { |i| $player.badges[i] = true }   # so that level-50 Pokémon obey
$bag            = PokemonBag.new
$stats          = GameStats.new

class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end

# Kernel#rand in move effect code (multi-hit moves etc.): the TypeScript port
# routes it through battle.pbRandom, so do the same here.
class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end

$log = nil
$errors = nil

# PBDebug.logonerr: record the exception and carry on, as Ruby does.
module PBDebug
  def self.logonerr
    yield
  rescue StandardError => e
    $log << "[exception]" if $log
    $errors << "#{e.class}: #{e.message} @ #{e.backtrace[0..2].join(' < ')}" if $errors
    raise "Too many exceptions" if $errors && $errors.length > 10   # don't loop forever
  end
end

def snapshot(battle, label)
  lines = ["== #{label}"]
  battle.battlers.each_with_index do |b, i|
    next if !b || !b.pokemon
    stg = b.stages.select { |_k, v| v != 0 }.map { |k, v| "#{k}:#{v}" }.join(",")
    lines << "##{i} #{b.species} hp=#{b.hp}/#{b.totalhp} st=#{b.status}/#{b.statusCount} " \
             "stg=#{stg} ab=#{b.ability_id || '-'} it=#{b.item_id || '-'} " \
             "types=#{b.pbTypes(true).join('/')}#{b.fainted? ? ' FAINTED' : ''}"
  end
  2.times do |side|   # Party members not in battle
    battle.pbParty(side).each_with_index do |pkmn, i|
      next if !pkmn || battle.battlers.any? { |b| b && b.pokemon == pkmn && b.index % 2 == side }
      lines << "party#{side}[#{i}] #{pkmn.species} hp=#{pkmn.hp}/#{pkmn.totalhp} st=#{pkmn.status} " \
               "ab=#{pkmn.ability_id || '-'} it=#{pkmn.item_id || '-'}"
    end
  end
  lines << "field w=#{battle.field.weather}/#{battle.field.weatherDuration} " \
           "t=#{battle.field.terrain}/#{battle.field.terrainDuration}"
  lines.each { |l| $log << l }
end

class LogScene < Battle::DebugSceneNoLogging
  attr_accessor :turns

  def pbBeginCommandPhase
    snapshot(@battle, "round #{@battle.turnCount + 1}")
    @battle.pbAbort if @battle.turnCount >= @turns
  end
  # Essentials Deluxe's midbattle triggers (Midbattle_Triggers.rb) are only
  # defined on Battle::Scene; the TypeScript battle calls them optionally.
  def pbDeluxeTriggers(*_a); end
  def pbDisplayMessage(msg, _brief = false); $log << msg; end
  alias pbDisplay pbDisplayMessage
  def pbDisplayPausedMessage(msg); $log << msg; end
  def pbDisplayConfirmMessage(msg); $log << "[confirm] #{msg}"; return true; end
  def pbShowAbilitySplash(battler, _delay = false, _logTrigger = true)
    $log << "[splash] #{battler.pbThis}: #{battler.abilityName}"
  end
  def pbReplaceAbilitySplash(battler); $log << "[resplash] #{battler.pbThis}: #{battler.abilityName}"; end
  def pbHideAbilitySplash(battler); $log << "[/splash] #{battler.pbThis}"; end
  def pbCommonAnimation(animName, _user = nil, _target = nil); $log << "[anim] #{animName}"; end
  def pbAnimation(moveID, _user, _targets, hitNum = 0); $log << "[move] #{moveID}/#{hitNum}"; end
  def pbSendOutBattlers(sendOuts, _startBattle = false)
    sendOuts.each { |idx, pkmn| $log << "[sendout] #{idx}: #{pkmn.name}" }
  end
  def pbRecall(idxBattler); $log << "[recall] #{idxBattler}"; end
  # Replacements for the player's side (Battle#pbSwitchInBetween uses the party
  # screen even with controlPlayer): the debug scene picks at random with
  # Kernel#rand; offer the party slots in order instead.
  def pbPartyScreen(idxBattler, _canCancel = false)
    replacements = []
    @battle.eachInTeamFromBattlerIndex(idxBattler) do |_b, idxParty|
      replacements.push(idxParty) if !@battle.pbFindBattler(idxParty, idxBattler)
    end
    replacements.each { |idxParty| break if yield idxParty, self }
  end
  def pbChangePokemon(idxBattler, pkmn)
    idx = idxBattler.respond_to?(:index) ? idxBattler.index : idxBattler
    $log << "[change] #{idx}: #{pkmn.species}"
  end
  def pbFaintBattler(battler); $log << "[faint] #{battler.pbThis}"; end
  def pbEndBattle(result)
    snapshot(@battle, "end decision=#{result}")
  end
end

# Mon spec: { "s" => species, "l" => level, "a" => ability, "m" => moves,
# "i" => item, "g" => gender, "hp" => [num, den], "st" => status,
# "sc" => status count, "n" => nature, "f" => form }
def make_pokemon(spec)
  pkmn = Pokemon.new(spec["s"].to_sym, spec["l"] || 50, $player)
  pkmn.form_simple = spec["f"] if spec["f"]   # no form-change side effects (learning moves)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = 31
    pkmn.ev[s.id] = 0
  end
  pkmn.nature = (spec["n"] || "HARDY").to_sym
  pkmn.ability = spec["a"].to_sym
  pkmn.item = spec["i"] ? spec["i"].to_sym : nil
  pkmn.gender = spec["g"] || 0
  pkmn.forget_all_moves
  (spec["m"] || ["TACKLE"]).each { |m| pkmn.learn_move(m.to_sym) }
  pkmn.calc_stats
  pkmn.hp = [pkmn.totalhp * spec["hp"][0] / spec["hp"][1], 1].max if spec["hp"]
  if spec["st"]
    pkmn.status = spec["st"].to_sym
    pkmn.statusCount = spec["sc"] || (spec["st"] == "SLEEP" ? 3 : 0)
  end
  pkmn
end

# Choice for battler idx: nil (move 0, default target), an Integer (move
# index), [move index, target index], "s<n>" (switch to party slot n) or "r"
# (run).
def register_choice(battle, idx, choice)
  if choice.is_a?(String) && choice.start_with?("s")   # Switch, if allowed (as the party menu checks)
    if battle.pbCanSwitch?(idx, choice[1..-1].to_i)
      battle.pbRegisterSwitch(idx, choice[1..-1].to_i)
      return
    end
    $log << "[can't switch] #{idx}"
    choice = 0
  elsif choice == "r"   # Run (Battle#pbRunMenu); move 0 if running isn't possible at all
    return if battle.pbRun(idx) != 0
    $log << "[can't run] #{idx}"
    choice = 0
  end
  move_idx, target = choice.is_a?(Array) ? choice : [choice || 0, nil]
  b = battle.battlers[idx]
  if !battle.pbRegisterMove(idx, move_idx, false)
    battle.pbAutoChooseMove(idx)
    return
  end
  return if battle.choices[idx][0] != :UseMove
  if battle.choices[idx][2].pbTarget(b).num_targets == 1
    target ||= (battle.pbSideSize(0) == 1) ? 1 - idx : (idx ^ 1)
    battle.pbRegisterTarget(idx, target)
  end
end

def run_scenario(sc)
  $log = []
  $errors = []
  p1 = sc["p1"].map { |s| make_pokemon(s) }
  p2 = sc["p2"].map { |s| make_pokemon(s) }
  scene = LogScene.new
  scene.turns = sc["turns"].length
  opponent = nil
  if sc["trainer"]
    t = NPCTrainer.new("Joey", GameData::TrainerType.keys.first)
    t.party = p2
    opponent = [t]
  end
  battle = Battle.new(scene, p1, p2, $player, opponent)
  battle.setBattleMode(sc["double"] ? "double" : "single")
  battle.internalBattle = true
  battle.expGain = false
  battle.moneyGain = false
  random = SeqRandom.new(sc["seed"] || 0)
  battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
  ai = battle.battleAI
  ai.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
  battle.controlPlayer = true
  ai.define_singleton_method(:pbDefaultChooseEnemyCommand) do |idx|
    register_choice(battle, idx, (sc["turns"][battle.turnCount] || [])[idx])
  end
  ai.define_singleton_method(:pbDefaultChooseNewEnemy) do |idx, *_a|
    ret = -1
    battle.eachInTeamFromBattlerIndex(idx) do |_pkmn, i|
      ret = i if ret < 0 && battle.pbCanSwitchLax?(idx, i)
    end
    ret
  end
  begin
    decision = battle.pbStartBattle
  rescue StandardError => e
    $log << "[fatal]"
    $errors << "#{e.class}: #{e.message} @ #{e.backtrace[0..4].join(' < ')}"
    decision = -1
  end
  sc.merge("decision" => decision, "log" => $log, "errors" => $errors)
end

#===============================================================================
# Scenarios
#===============================================================================
def mon(s, a, m = ["TACKLE"], l = 50, **o)
  { "s" => s.to_s, "a" => a.to_s, "m" => m.map(&:to_s), "l" => l }.merge(o.transform_keys(&:to_s))
end

SCENARIOS = []
def scenario(name, p1, p2, turns, **o)
  turns = Array.new(turns) { [] } if turns.is_a?(Integer)
  missing = (p1 + p2).flat_map do |m|
    [[GameData::Species, m["s"]], [GameData::Ability, m["a"]], [GameData::Item, m["i"]]] +
      m["m"].map { |mv| [GameData::Move, mv] }
  end.select { |cls, id| id && !cls.exists?(id.to_sym) }
  if !missing.empty?
    warn "Skipping scenario #{name}: no #{missing.map { |cls, id| "#{cls.name.split('::').last} #{id}" }.join(', ')}"
    return
  end
  SCENARIOS << { "name" => name, "p1" => p1, "p2" => p2, "turns" => turns }.merge(o.transform_keys(&:to_s))
end

load File.join(__dir__, "ability_scenarios.rb")

# A scenario with want: "text" depends on chance (a 30% contact ability, a
# critical hit...): use the first seed from its seed on whose log includes
# the text.
def run_with_wanted(sc)
  return run_scenario(sc) if !sc["want"]
  start = sc["seed"] || 0
  200.times do |i|
    r = run_scenario(sc.merge("seed" => start + i))
    return r if r["log"].any? { |l| l.include?(sc["want"]) }
  end
  warn "#{sc['name']}: no seed in #{start}...#{start + 200} gives #{sc['want'].inspect}"
  run_scenario(sc)
end

out = SCENARIOS.map { |sc| run_with_wanted(sc) }
bad = out.select { |r| !r["errors"].empty? }
bad.each { |r| warn "#{r['name']}: #{r['errors'].join(' | ')}" }
path = File.join(ROOT, "web", "src", "battle", "abilities", "abilityReference.json")
File.write(path, JSON.pretty_generate(out) + "\n")
puts "Wrote #{out.length} scenarios (#{bad.length} with Ruby exceptions) to #{path}"
