# Runs scripted battles through the game's real Ruby battle code (see
# essentials.rb) with Essentials Deluxe's midbattle scripting and Mega
# Evolution / Primal Reversion, and writes
# web/src/battle/deluxe/deluxeReference.json, which
# web/src/battle/deluxe/deluxeReference.test.ts replays in TypeScript.
#
#   cd web && ruby tools/ruby-ref/deluxe_reference.rb
#
# Built like ability_reference.rb (same Pokémon setup, counter-based random
# stream, scripted choices through the AI hooks, logging scene), plus:
# - the midbattle code: Midbattle_Main.rb's and Midbattle_Triggers.rb's
#   Battle::Scene methods are evaluated into the logging scene, which records
#   the scene calls they make (data boxes, black bars, slide sprites, name
#   window, choices, HP loss, flash) and answers choices from the scenario;
# - $game_temp.dx_midbattle set to the scenario's script (written into the
#   JSON with Symbols as {":" => name}, so the TS test uses the same hash);
# - a choice can be a Hash: {"move", "target", "mega" (register Mega
#   Evolution if possible), "aimega" (register it if
#   AI#pbEnemyShouldMegaEvolve? says so)}; "bag" items, trainer "items"
#   (Mega Ring), "ace" Pokémon;
# - the snapshot adds each battler's form, stats and effects, the side and
#   field effects, the environment/backdrop, the midbattle variable and the
#   triggers left in the script.
# Kernel#rand and Array#sample in the midbattle code go through
# battle.pbRandom, as in the TypeScript port (in the game they are the same
# generator).

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)
Essentials.eval_file(File.join(PLUGINS, "Essentials Deluxe", "[002] Battle Deluxe", "Midbattle_Config.rb"), failures = [])
raise failures.join("\n") if !failures.empty?
# The items' battle effects (Potions, X items, Poké Balls...), as in
# battle_items_reference.rb (the scripts use them through :useitem).
Essentials.eval_file(File.join(SCRIPTS, "013_Items/003_Item_BattleEffects.rb"), failures)
raise failures.join("\n") if !failures.empty?
# Deluxe's GameStats#primal_reversion_count and GameData::Item#portion_name
# (the rest of the file, from Window_CommandPokemonColor on, is UI and fails
# to load headless).
Essentials.eval_file(File.join(PLUGINS, "Essentials Deluxe", "[000] Essentials Patches", "Miscellaneous.rb"), [])

# pbResolveBitmap: whether the graphic exists (midbattle_ChangeBackdrop).
def pbResolveBitmap(path)
  return nil if !path
  [".png", ".gif", ""].each { |ext| return path if File.file?(File.join(ROOT, path + ext)) }
  nil
end

shadow = File.read(File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "002_ShadowPokemon_Other.rb"), encoding: "UTF-8")
Battle::Battler.class_eval(shadow[/^  def shadowPokemon\?.*?^  end\r?\n(?=end)/m])

# Same deliberate fix as ability_reference.rb (web/src/battle/sunFix.test.ts).
gen9_battle = File.read(File.join(PLUGINS, "Generation 9 Pack Scripts", "[001] Battle", "[001] Battle.rb"), encoding: "UTF-8")
calc = gen9_battle[/^  def pbCalcDamageMultipliers\(.*?^  end\r?\n/m]
Battle::Move.class_eval(calc.sub('@function = "IncreasePowerInSunWeather"', '@function == "IncreasePowerInSunWeather"'))

class Game_Temp
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

$game_temp      = Game_Temp.new
$game_switches  = Hash.new(false)
$game_variables = Hash.new(0)
# changeHappiness reads $game_map.map_id (as in battle_items_reference.rb)
class MapStub
  def map_id; 0; end
  def metadata; GameData::MapMetadata.try_get(0); end
end
$game_map       = MapStub.new
$PokemonGlobal  = nil
$PokemonSystem  = Struct.new(:givenicknames, :battlescene).new(1, 0)
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
8.times { |i| $player.badges[i] = true }
$bag            = PokemonBag.new
$stats          = GameStats.new

class Player
  def has_snag_machine; false; end
end

# ZUD's Max Lair (not loaded; the TS port has none): never in one.
def inMaxLair?; false; end

class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end

class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end

class Battle::Battler
  def rand(x = 0); @battle.pbRandom(x); end
end

$log = nil
$errors = nil
$choices = []
$dx_battle = nil

module PBDebug
  def self.logonerr
    yield
  rescue StandardError => e
    $log << "[exception]" if $log
    $errors << "#{e.class}: #{e.message} @ #{e.backtrace[0..2].join(' < ')}" if $errors
    raise "Too many exceptions" if $errors && $errors.length > 10
  end
end

# Sounds, music and cries the midbattle code plays.
def pbSEPlay(param, *_a); $log << "[se] #{param.is_a?(String) ? param : param&.name}" if $log; end
def pbBGMPlay(param, *_a); $log << "[bgm] #{param.is_a?(String) ? param : param&.name}" if $log; end
def pbBGMFade(secs = 0); $log << "[bgmfade] #{secs}" if $log; end
def pbPlayDecisionSE; $log << "[se] decision" if $log; end
# 008_Audio/002_Audio_Play.rb (not loaded headless): nil for nil, an audio file otherwise.
def pbResolveAudioFile(str, volume = nil, pitch = nil)
  return nil if !str
  str.is_a?(String) ? RPG::AudioFile.new(str, volume || 100, pitch || 100) : str
end
class Pokemon
  def play_cry(*_a); $log << "[cry] #{species}" if $log; end
end

# Array#sample in the midbattle code, from the battle's random stream.
class Array
  def dx_sample
    return nil if empty?
    self[$dx_battle.pbRandom(length)]
  end
end

def fmt_battlers(t)
  case t
  when nil then "-"
  when Array then t.map { |b| b.respond_to?(:index) ? b.index : b }.join(",")
  else t.respond_to?(:index) ? t.index.to_s : t.to_s
  end
end

def fmt_val(v)
  case v
  when nil then "nil"
  when Symbol then v.to_s
  when Array then "[" + v.map { |e| fmt_val(e) }.join(",") + "]"
  else v.to_s
  end
end

def fmt_speaker(s)
  case s
  when nil then "nil"
  when String then "\"#{s}\""
  else "#{s.name}/#{s.gender}"
  end
end

# The effects the snapshot shows (by number): the ones a midbattle script can set.
BATTLER_EFFECTS = ($DELUXE_BATTLE_EFFECTS[:battler_default_false] + $DELUXE_BATTLE_EFFECTS[:battler_default_zero] +
                   [PBEffects::Type3, PBEffects::Nightmare, PBEffects::Yawn, PBEffects::MagnetRise,
                    PBEffects::Telekinesis, PBEffects::CriticalBoost, PBEffects::Confusion, PBEffects::Disable,
                    PBEffects::Substitute]).uniq.sort
SIDE_EFFECTS = ($DELUXE_BATTLE_EFFECTS[:team_default_false] + $DELUXE_BATTLE_EFFECTS[:team_default_zero] +
                [PBEffects::Spikes, PBEffects::ToxicSpikes, PBEffects::Reflect, PBEffects::LightScreen,
                 PBEffects::AuroraVeil]).uniq.sort
FIELD_EFFECTS = ($DELUXE_BATTLE_EFFECTS[:field_default_false] + $DELUXE_BATTLE_EFFECTS[:field_default_zero]).uniq.sort

def effects_str(effects, ids)
  ids.select { |i| ![nil, false, 0, -1].include?(effects[i]) }.map { |i| "#{i}=#{fmt_val(effects[i])}" }.join(",")
end

def snapshot(battle, label)
  lines = ["== #{label}"]
  battle.battlers.each_with_index do |b, i|
    next if !b || !b.pokemon
    stg = b.stages.select { |_k, v| v != 0 }.map { |k, v| "#{k}:#{v}" }.join(",")
    lines << "##{i} #{b.species} f=#{b.form} #{b.name} hp=#{b.hp}/#{b.totalhp} " \
             "s=#{b.attack}/#{b.defense}/#{b.spatk}/#{b.spdef}/#{b.speed} st=#{b.status}/#{b.statusCount} " \
             "stg=#{stg} ab=#{b.ability_id || '-'} it=#{b.item_id || '-'} " \
             "types=#{b.pbTypes(true).join('/')} mv=#{b.moves.map(&:id).join('/')} " \
             "eff=#{effects_str(b.effects, BATTLER_EFFECTS)}#{b.fainted? ? ' FAINTED' : ''}"
  end
  2.times do |side|
    battle.pbParty(side).each_with_index do |pkmn, i|
      next if !pkmn || battle.battlers.any? { |b| b && b.pokemon == pkmn && b.index % 2 == side }
      lines << "party#{side}[#{i}] #{pkmn.species} f=#{pkmn.form} hp=#{pkmn.hp}/#{pkmn.totalhp} st=#{pkmn.status} " \
               "ab=#{pkmn.ability_id || '-'} it=#{pkmn.item_id || '-'}"
    end
  end
  lines << "sides #{battle.sides.map { |s| effects_str(s.effects, SIDE_EFFECTS) }.join(' | ')}"
  lines << "field w=#{battle.field.weather}/#{battle.field.weatherDuration} " \
           "t=#{battle.field.terrain}/#{battle.field.terrainDuration} " \
           "eff=#{effects_str(battle.field.effects, FIELD_EFFECTS)} env=#{battle.environment} " \
           "bd=#{battle.backdrop}/#{battle.backdropBase || '-'} balls=#{battle.disablePokeBalls} " \
           "mega=#{battle.megaEvolution.inspect} nomega=#{$game_switches[Settings::NO_MEGA_EVOLUTION]}"
  scene = battle.scene
  lines << "midbattle var=#{scene.instance_variable_get(:@midbattle_var)} " \
           "left=#{($game_temp.dx_midbattle || {}).keys.join(',')}"
  lines.each { |l| $log << l }
end

class LogScene < Battle::DebugSceneNoLogging
  attr_accessor :turns, :guestSpeaker

  def initialize
    super
    @midbattle_var = 0
    @midbattle_choice = nil
    @midbattle_decision = 0
    @midbattle_delay = []
    @midbattle_ignore = []
    @guestSpeaker = false
    @namePanelName = nil
    @namePanelSkin = nil
  end

  def rand(x = 0); @battle.pbRandom(x); end

  def pbBeginCommandPhase
    snapshot(@battle, "round #{@battle.turnCount + 1}")
    @battle.pbAbort if @battle.turnCount >= @turns
  end
  def pbDisplayMessage(msg, _brief = false); $log << msg; end
  alias pbDisplay pbDisplayMessage
  def pbDisplayPausedMessage(msg)
    $log << msg
    yield if block_given?
  end
  def pbDisplayConfirmMessage(msg); $log << "[confirm] #{msg}"; return true; end
  def pbShowAbilitySplash(battler, _delay = false, _logTrigger = true)
    $log << "[splash] #{battler.pbThis}: #{battler.abilityName}"
  end
  def pbReplaceAbilitySplash(battler); $log << "[resplash] #{battler.pbThis}: #{battler.abilityName}"; end
  def pbHideAbilitySplash(battler); $log << "[/splash] #{battler.pbThis}"; end
  def pbCommonAnimation(animName, user = nil, target = nil)
    $log << "[anim] #{animName} u=#{fmt_battlers(user)} t=#{fmt_battlers(target)}"
  end
  def pbAnimation(moveID, user, targets, hitNum = 0)
    $log << "[move] #{moveID}/#{hitNum} u=#{fmt_battlers(user)} t=#{fmt_battlers(targets)}"
  end
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
  def pbChangePokemon(idxBattler, pkmn)
    idx = idxBattler.respond_to?(:index) ? idxBattler.index : idxBattler
    $log << "[change] #{idx}: #{pkmn.species} f=#{pkmn.form}"
  end
  def pbFaintBattler(battler); $log << "[faint] #{battler.pbThis}"; end
  def pbEndBattle(result)
    snapshot(@battle, "end decision=#{result}")
  end
  # Mega Evolution / Primal Reversion visuals (not used while the common
  # animations exist, as in this game)
  def pbCommonAnimationExists?(name); $log << "[exists?] #{name}"; true; end
  def pbShowMegaEvolution(idx); $log << "[megaanim] #{idx}"; end
  def pbShowPrimalReversion(idx); $log << "[primalanim] #{idx}"; end
  def pbRevertBattlerStart(idx); $log << "[revert] #{idx}"; end
  def pbRevertBattlerEnd; $log << "[/revert]"; end
  def pbRefreshOne(_idx); end
  def pbRefresh; end
  # Capture visuals (Battle::Scene methods the debug scene lacks)
  def pbThrow(ball, shakes, *_a); $log << "[throw] #{ball} #{shakes}"; end
  def pbThrowSuccess(*_a); end
  def pbHideCaptureBall(*_a); end
  def pbThrowAndDeflect(*_a); end
  # Midbattle speech visuals ([002] Battle Deluxe/Battle_Scene.rb)
  def pbToggleDataboxes(toggle = false); $log << "[databoxes] #{toggle}"; end
  def pbToggleBlackBars(toggle = false); $log << "[blackbars] #{toggle}"; end
  def pbShowSlideSprite(id); $log << "[slide] #{fmt_val(id)}"; end
  def pbHideSlideSprite; $log << "[/slide]"; end
  def pbUpdateNameWindow(speaker = "", visible = true, reset = false)
    if reset
      @namePanelName = nil
      @namePanelSkin = nil
    end
    $log << "[namewin] #{fmt_speaker(speaker)} vis=#{visible} reset=#{reset} " \
            "panel=#{@namePanelName.inspect}/#{@namePanelSkin.inspect}"
  end
  def pbShowCommands(msg, commands, _defaultValue = -1)
    cmd = $choices.shift || 0
    $log << "[choose] #{msg} | #{commands.join(' / ')} => #{cmd}"
    cmd
  end
  def pbHitAndHPLossAnimation(targets)
    targets.each { |b, old, _| $log << "[hploss] #{b.index} #{old}->#{b.hp}" }
  end
  def pbFlashRefresh; $log << "[flash]"; end
  def pbBattlerFlee(battler, msg = nil)
    $log << "[flee] #{battler.index}"
    if msg.is_a?(String)
      @battle.pbDisplayPaused(_INTL("#{msg}", battler.pbThis))
    else
      @battle.pbDisplayPaused(_INTL("{1} fled!", battler.pbThis))
    end
  end
end

# The midbattle methods of Battle::Scene, on the logging scene.
main = File.read(File.join(PLUGINS, "Essentials Deluxe", "[002] Battle Deluxe", "Midbattle_Main.rb"), encoding: "UTF-8")
body = main[/^class Battle::Scene\r?\n(.*?)^end\r?\n/m, 1]
raise "Midbattle_Main.rb: Battle::Scene not found" if !body
LogScene.class_eval(body.gsub(".sample", ".dx_sample"), "Midbattle_Main.rb")
triggers = File.read(File.join(PLUGINS, "Essentials Deluxe", "[002] Battle Deluxe", "Midbattle_Triggers.rb"), encoding: "UTF-8")
deluxe_triggers = triggers[/^  def pbDeluxeTriggers.*?^  end\r?\n/m]
LogScene.class_eval(deluxe_triggers, "Midbattle_Triggers.rb")

def make_pokemon(spec)
  pkmn = Pokemon.new(spec["s"].to_sym, spec["l"] || 50, $player)
  pkmn.form_simple = spec["f"] if spec["f"]
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
  pkmn.ace = true if spec["ace"]
  pkmn.calc_stats
  pkmn.hp = [pkmn.totalhp * spec["hp"][0] / spec["hp"][1], 1].max if spec["hp"]
  if spec["st"]
    pkmn.status = spec["st"].to_sym
    pkmn.statusCount = spec["sc"] || (spec["st"] == "SLEEP" ? 3 : 0)
  end
  pkmn
end

# Choice for battler idx: nil (move 0), an Integer (move index), [move,
# target], "s<n>" (switch), "r" (run), "i<ITEM>" (use a Poké Ball from the
# Bag on the foe), or a Hash (see the top of the file).
def register_choice(battle, idx, choice)
  if choice.is_a?(String) && choice.start_with?("s")
    if battle.pbCanSwitch?(idx, choice[1..-1].to_i)
      battle.pbRegisterSwitch(idx, choice[1..-1].to_i)
      return
    end
    $log << "[can't switch] #{idx}"
    choice = 0
  elsif choice == "r"
    return if battle.pbRun(idx) != 0
    $log << "[can't run] #{idx}"
    choice = 0
  elsif choice.is_a?(String) && choice.start_with?("i")
    battle.pbRegisterItem(idx, choice[1..-1].to_sym, 1 - idx)
    return
  end
  mega = aimega = false
  if choice.is_a?(Hash)
    mega = choice["mega"]
    aimega = choice["aimega"]
    choice = choice["target"] ? [choice["move"] || 0, choice["target"]] : (choice["move"] || 0)
  end
  move_idx, target = choice.is_a?(Array) ? choice : [choice || 0, nil]
  b = battle.battlers[idx]
  if !battle.pbRegisterMove(idx, move_idx, false)
    battle.pbAutoChooseMove(idx)
    return
  end
  if mega
    if battle.pbCanMegaEvolve?(idx)
      battle.pbRegisterMegaEvolution(idx)
    else
      $log << "[can't mega] #{idx}"
    end
  end
  battle.pbRegisterMegaEvolution(idx) if aimega && battle.battleAI.pbEnemyShouldMegaEvolve?(idx)
  return if battle.choices[idx][0] != :UseMove
  if battle.choices[idx][2].pbTarget(b).num_targets == 1
    target ||= (battle.pbSideSize(0) == 1) ? 1 - idx : (idx ^ 1)
    battle.pbRegisterTarget(idx, target)
  end
end

def run_scenario(sc)
  $log = []
  $errors = []
  $choices = (sc["choices"] || []).dup
  $game_switches = Hash.new(false)
  $bag = PokemonBag.new
  (sc["bag"] || {}).each { |id, qty| $bag.add(id.to_sym, qty) }
  $player.party = []
  p1 = sc["p1"].map { |s| make_pokemon(s) }
  p2 = sc["p2"].map { |s| make_pokemon(s) }
  scene = LogScene.new
  scene.turns = sc["turns"].length
  opponent = nil
  if sc["trainer"]
    t = NPCTrainer.new("Joey", GameData::TrainerType.keys.first)
    t.party = p2
    t.items = (sc["items"] || []).map(&:to_sym)
    opponent = [t]
  end
  $game_temp.dx_midbattle = sc["midbattle"] ? Marshal.load(Marshal.dump(sc["midbattle"])) : nil
  $game_temp.dx_rules = sc["rules"] ? Marshal.load(Marshal.dump(sc["rules"])) : nil
  battle = Battle.new(scene, p1, p2, $player, opponent)
  battle.setBattleMode(sc["double"] ? "double" : "single")
  battle.items = [opponent[0].items] if opponent   # (TrainerBattle.start_core passes the foes' items)
  battle.internalBattle = true
  battle.expGain = false
  battle.moneyGain = false
  battle.backdrop = "field"
  random = SeqRandom.new(sc["seed"] || 0)
  battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
  $dx_battle = battle
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
  $game_temp.dx_midbattle = nil
  $game_temp.dx_rules = nil
  { "decision" => decision, "log" => $log, "errors" => $errors }
end

# Ruby values as JSON: a Symbol is {":" => name}; Hash keys become strings.
def enc(v)
  case v
  when Symbol then { ":" => v.to_s }
  when Hash then v.each_with_object({}) { |(k, val), h| h[k.to_s] = enc(val) }
  when Array then v.map { |e| enc(e) }
  else v
  end
end

def mon(s, a, m = ["TACKLE"], l = 50, **o)
  { "s" => s.to_s, "a" => a.to_s, "m" => m.map(&:to_s), "l" => l }.merge(o.transform_keys(&:to_s))
end

SCENARIOS = []
def scenario(name, p1, p2, turns, **o)
  turns = Array.new(turns) { [] } if turns.is_a?(Integer)
  SCENARIOS << { "name" => name, "p1" => p1, "p2" => p2, "turns" => turns }.merge(o.transform_keys(&:to_s))
end

load File.join(__dir__, "deluxe_scenarios.rb")

# want: "text" — use the first seed (from the scenario's) whose log includes the text.
def run_with_wanted(sc)
  return run_scenario(sc) if !sc["want"]
  start = sc["seed"] || 0
  200.times do |i|
    r = run_scenario(sc.merge("seed" => start + i))
    if r["log"].any? { |l| l.include?(sc["want"]) }
      sc["seed"] = start + i
      return r
    end
  end
  $stderr.puts "#{sc["name"]}: no seed in #{start}...#{start + 200} gives #{sc['want'].inspect}"
  run_scenario(sc)
end

out = SCENARIOS.map do |sc|
  r = run_with_wanted(sc)
  enc(sc).merge(r)
end
bad = out.select { |r| !r["errors"].empty? }
bad.each { |r| $stderr.puts "#{r['name']}: #{r['errors'].join(' | ')}" }
# The presets of Midbattle_Config.rb, to check the TS copies against.
presets = EssentialsDeluxe.constants.sort.map { |c| [c.to_s, enc(EssentialsDeluxe.const_get(c))] }.to_h
path = File.join(ROOT, "web", "src", "battle", "deluxe", "deluxeReference.json")
File.write(path, JSON.pretty_generate({ "presets" => presets, "scenarios" => out }) + "\n")
puts "Wrote #{out.length} scenarios (#{bad.length} with Ruby exceptions) to #{path}"
