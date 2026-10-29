# Runs the game's real Ruby battle AI (Battle::AI with the Improved AI,
# Generation 9 Pack, v20.1 Hotfixes, Essentials Deluxe and ZUD Mechanics
# patches; see essentials.rb) on fixed situations and writes
# web/src/battle/ai/aiReference.json, which web/src/battle/ai/aiReference.test.ts
# replays against the TypeScript port.
#
#   cd web && ruby tools/ruby-ref/ai_reference.rb
#
# Two kinds of case:
# - "scores": pbGetMoveScore(move, user, target, skill) for every move of
#   battler 1 against every battler, at skills 1, 32, 48 and 100. The move
#   sweep runs every move in the game (except Z-Moves and Max Moves) through
#   five setups; the JSON stores each setup once as a template whose "$MOVE"
#   is replaced by the move, and the scores per move.
# - "command": pbDefaultChooseEnemyCommand for the AI's battlers (items,
#   switching, move choice), recording the registered choice and how many
#   random numbers were used. Randomness is the counter-based sequence of
#   battle_reference.rb, for both battle.pbRandom and pbAIRandom.
# Every Pokémon has the inert ability Honey Gather and no item unless the case
# says otherwise, IVs 31, EVs 0, Hardy nature. A Ruby exception is recorded as
# "!<class>".

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)

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

class SeqRandom
  attr_reader :k
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end

# Kernel#rand in move code goes through battle.pbRandom, as in the TS port.
class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end

# The TS core defers Z-Moves, Ultra Burst and Dynamax (their eligibility
# checks are always false there), so they're off here too.
class Battle
  def pbCanZMove?(*_a); false; end
  def pbCanUltraBurst?(*_a); false; end
  def pbCanDynamax?(*_a); false; end
end

INERT_ABILITY = "HONEYGATHER"
SKILLS = [1, 32, 48, 100].freeze

# Mon spec: { "s" => species, "l" => level, "a" => ability, "m" => moves,
# "i" => item, "hp" => [num, den], "st" => status, "sc" => status count,
# "g" => gender, "f" => form }
def make_pokemon(spec)
  pkmn = Pokemon.new(spec["s"].to_sym, spec["l"] || 50, $player)
  pkmn.form = spec["f"] if spec["f"]
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = 31
    pkmn.ev[s.id] = 0
  end
  pkmn.nature = :HARDY
  pkmn.ability = (spec["a"] || INERT_ABILITY).to_sym
  pkmn.item = spec["i"] ? spec["i"].to_sym : nil
  pkmn.gender = spec["g"] || 0
  pkmn.forget_all_moves
  (spec["m"] || ["TACKLE"]).each { |m| pkmn.learn_move(m.to_sym) }
  pkmn.calc_stats
  if spec["hp"]
    pkmn.hp = (spec["hp"][0] == 0) ? 0 : [pkmn.totalhp * spec["hp"][0] / spec["hp"][1], 1].max
  end
  if spec["st"]
    pkmn.status = spec["st"].to_sym
    pkmn.statusCount = spec["sc"] || 0
  end
  pkmn
end

def effect_value(v)
  v.is_a?(String) ? v.to_sym : v
end

# Case keys: "double", "skill" (nil = wild battle), "items" (the trainer's
# items), "p1"/"p2" (mon specs), "b" ({battler index => {"stages", "effects",
# "turnCount", "lastMoveUsed", "lastRegularMoveUsed", "pp" => [move index, pp]}}),
# "sides" ([player side effects, foe side effects]), "field" ({"weather",
# "terrain", "effects"}), "rules", "seed".
def make_battle(c, random)
  p1 = c["p1"].map { |s| make_pokemon(s) }
  p2 = c["p2"].map { |s| make_pokemon(s) }
  opponent = nil
  if c["skill"]
    t = NPCTrainer.new("Joey", GameData::TrainerType.keys.first)
    t.party = p2
    skill = c["skill"]
    t.define_singleton_method(:skill_level) { skill }
    opponent = [t]
  end
  scene = Battle::DebugSceneNoLogging.new
  battle = Battle.new(scene, p1, p2, $player, opponent)
  battle.setBattleMode("double") if c["double"]
  battle.internalBattle = true
  battle.items = [c["items"].map(&:to_sym)] if c["items"]
  battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
  battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
  (c["rules"] || {}).each { |k, v| battle.rules[k] = v }
  scene.pbStartBattle(battle)
  battle.pbSetUpSides
  (c["b"] || {}).each do |idx, bs|
    b = battle.battlers[idx.to_i]
    (bs["stages"] || {}).each { |s, v| b.stages[s.to_sym] = v }
    (bs["effects"] || {}).each { |e, v| b.effects[PBEffects.const_get(e)] = effect_value(v) }
    b.turnCount = bs["turnCount"] if bs["turnCount"]
    b.lastMoveUsed = bs["lastMoveUsed"].to_sym if bs["lastMoveUsed"]
    b.lastRegularMoveUsed = bs["lastRegularMoveUsed"].to_sym if bs["lastRegularMoveUsed"]
    b.moves[bs["pp"][0]].pp = bs["pp"][1] if bs["pp"]
  end
  (c["sides"] || []).each_with_index do |effects, side|
    (effects || {}).each { |e, v| battle.sides[side].effects[PBEffects.const_get(e)] = effect_value(v) }
  end
  if c["field"]
    battle.field.weather = c["field"]["weather"].to_sym if c["field"]["weather"]
    battle.field.weatherDuration = 5 if c["field"]["weather"]
    battle.field.terrain = c["field"]["terrain"].to_sym if c["field"]["terrain"]
    battle.field.terrainDuration = 5 if c["field"]["terrain"]
    (c["field"]["effects"] || {}).each { |e, v| battle.field.effects[PBEffects.const_get(e)] = effect_value(v) }
  end
  battle
end

# AI_REF_ONLY=<case name> runs one case and AI_REF_RAISE=1 re-raises Ruby
# exceptions (with their backtrace) instead of recording them; neither writes
# the JSON.
def catch_error
  yield
rescue StandardError => e
  raise if ENV["AI_REF_RAISE"]
  "!#{e.class}"
end

# The score of every move of battler 1 against every battler at every skill
# in SKILLS, flattened in that order (move, then target, then skill).
def run_scores(c)
  random = SeqRandom.new(c["seed"] || 0)
  battle = make_battle(c, random)
  ai = battle.battleAI
  user = battle.battlers[1]
  rows = []
  user.moves.each_with_index do |m, i|
    battle.battlers.each do |t|
      next if !t
      SKILLS.each do |skill|
        rows << catch_error { ai.pbGetMoveScore(m, user, t, skill) }
      end
    end
  end
  { scores: rows, randomCalls: random.k - (c["seed"] || 0) }
end

def choice_json(battle, idx)
  ch = battle.choices[idx]
  val = ch[2]
  val = val.id.to_s if val.respond_to?(:id)
  [ch[0].to_s, ch[1], val.nil? ? nil : val.to_s, ch[3]]
end

# The AI chooses actions for each battler in c["ai"] (default [1]).
def run_command(c)
  random = SeqRandom.new(c["seed"] || 0)
  battle = make_battle(c, random)
  start = random.k
  out = { choices: {}, randomCalls: nil }
  (c["ai"] || [1]).each do |idx|
    err = catch_error { battle.battleAI.pbDefaultChooseEnemyCommand(idx); nil }
    out[:choices][idx.to_s] = err || choice_json(battle, idx)
  end
  out[:randomCalls] = random.k - start
  out
end

#===============================================================================
# Cases
#===============================================================================
CASES = []

def mon(species, level = 50, opts = {})
  { "s" => species.to_s, "l" => level }.merge(opts)
end

# Move sweep: every move, five setups.
SWEEP_MOVES = GameData::Move.keys.select do |id|
  m = GameData::Move.get(id)
  !m.zMove? && !m.maxMove? rescue true
end.sort
SWEEP_SETUPS = [
  # Single battle, full HP, two more Pokémon on each side.
  lambda do |mv|
    { "kind" => "scores", "name" => "sweep A #{mv}",
      "skill" => 100,
      "p1" => [mon(:SNORLAX, 50, "m" => %w[TACKLE BODYSLAM]), mon(:PIDGEY, 30), mon(:RATTATA, 30)],
      "p2" => [mon(:MEW, 50, "m" => [mv, "TACKLE", "WATERGUN", "GROWL"]), mon(:ONIX, 40), mon(:ZUBAT, 40)],
      "b" => { "0" => { "lastMoveUsed" => "BODYSLAM", "lastRegularMoveUsed" => "BODYSLAM" } } }
  end,
  # Single battle, last Pokémon on each side, damaged/status/stages/weather.
  lambda do |mv|
    { "kind" => "scores", "name" => "sweep B #{mv}",
      "skill" => 100,
      "p1" => [mon(:CHARIZARD, 55, "m" => %w[FLAMETHROWER AIRSLASH], "hp" => [2, 5], "st" => "POISON")],
      "p2" => [mon(:GENGAR, 60, "m" => [mv, "SHADOWBALL", "SLUDGEBOMB"], "hp" => [1, 3])],
      "b" => { "1" => { "stages" => { "ATTACK" => 2, "SPEED" => -1 }, "turnCount" => 3 },
               "0" => { "stages" => { "DEFENSE" => -1, "SPECIAL_ATTACK" => 1 }, "turnCount" => 3,
                        "lastMoveUsed" => "FLAMETHROWER", "lastRegularMoveUsed" => "FLAMETHROWER" } },
      "sides" => [{ "Spikes" => 1 }, { "Reflect" => 3 }],
      "field" => { "weather" => "Rain", "terrain" => "Electric" } }
  end,
  # Double battle.
  lambda do |mv|
    { "kind" => "scores", "name" => "sweep C #{mv}", "double" => true,
      "skill" => 100,
      "p1" => [mon(:BLASTOISE, 50, "m" => %w[SURF]), mon(:PIKACHU, 45, "m" => %w[THUNDERBOLT], "st" => "PARALYSIS"),
               mon(:EEVEE, 30)],
      "p2" => [mon(:ALAKAZAM, 50, "m" => [mv, "PSYCHIC", "TACKLE"]), mon(:MACHAMP, 50, "m" => %w[CROSSCHOP], "hp" => [1, 2]),
               mon(:ONIX, 40)],
      "b" => { "1" => { "turnCount" => 1 } } }
  end,
  # Single battle, lots of battler/side/field effects, held items.
  lambda do |mv|
    { "kind" => "scores", "name" => "sweep D #{mv}",
      "skill" => 100,
      "p1" => [mon(:ALAKAZAM, 60, "m" => %w[PSYCHIC RECOVER], "st" => "SLEEP", "sc" => 2, "i" => "CHOICESCARF"),
               mon(:PIDGEY, 30)],
      "p2" => [mon(:TYRANITAR, 70, "m" => [mv, "CRUNCH", "STONEEDGE"], "i" => "SITRUSBERRY"), mon(:ONIX, 40)],
      "b" => { "1" => { "turnCount" => 0 },
               "0" => { "stages" => { "EVASION" => 1, "SPECIAL_DEFENSE" => 2 }, "turnCount" => 2,
                        "effects" => { "Substitute" => 30, "Confusion" => 2, "Yawn" => 1, "LeechSeed" => 1 },
                        "lastMoveUsed" => "PSYCHIC", "lastRegularMoveUsed" => "PSYCHIC" } },
      "sides" => [{ "StealthRock" => true, "ToxicSpikes" => 1, "LightScreen" => 2 },
                  { "Tailwind" => 2, "Safeguard" => 3 }],
      "field" => { "weather" => "Sandstorm", "terrain" => "Psychic", "effects" => { "TrickRoom" => 3 } } }
  end,
  # Double battle with real abilities and items (damage handlers), Snow, Gravity.
  lambda do |mv|
    { "kind" => "scores", "name" => "sweep E #{mv}", "double" => true,
      "skill" => 100,
      "p1" => [mon(:MAMOSWINE, 55, "m" => %w[ICESHARD EARTHQUAKE], "a" => "THICKFAT", "i" => "ASSAULTVEST"),
               mon(:FLORGES, 50, "m" => %w[MOONBLAST], "a" => "FLOWERVEIL")],
      "p2" => [mon(:SCIZOR, 50, "m" => [mv, "BULLETPUNCH", "UTURN"], "a" => "TECHNICIAN", "st" => "BURN"),
               mon(:CLEFABLE, 50, "m" => %w[MOONBLAST], "a" => "FRIENDGUARD")],
      "b" => { "1" => { "turnCount" => 5 }, "0" => { "lastMoveUsed" => "EARTHQUAKE" } },
      "field" => { "weather" => "Hail", "effects" => { "Gravity" => 2 } } }
  end,
]
SWEEPS = SWEEP_SETUPS.map { |s| { "template" => s.call("$MOVE"), "build" => s } }

# Targeted score cases (abilities, items, effects the sweep doesn't reach)
CASES << { "kind" => "scores", "name" => "immunities by ability", "skill" => 100,
           "p1" => [mon(:VAPOREON, 50, "a" => "WATERABSORB"), mon(:HEATRAN, 50, "a" => "FLASHFIRE")],
           "p2" => [mon(:LAPRAS, 50, "m" => %w[SURF THUNDERBOLT EARTHQUAKE TOXIC])] }
CASES << { "kind" => "scores", "name" => "levitate, soundproof, bulletproof", "skill" => 100,
           "p1" => [mon(:BRONZONG, 50, "a" => "LEVITATE")],
           "p2" => [mon(:EXPLOUD, 50, "m" => %w[EARTHQUAKE HYPERVOICE SHADOWBALL SPORE])] }
CASES << { "kind" => "scores", "name" => "choice band user", "skill" => 100,
           "p1" => [mon(:SNORLAX, 50)],
           "p2" => [mon(:MACHAMP, 50, "i" => "CHOICEBAND", "m" => %w[CROSSCHOP BULKUP TRICK ROCKSMASH])] }
CASES << { "kind" => "scores", "name" => "asleep user, frozen target", "skill" => 100,
           "p1" => [mon(:SNORLAX, 50, "st" => "FROZEN")],
           "p2" => [mon(:MEW, 50, "st" => "SLEEP", "sc" => 2, "m" => %w[SNORE SLEEPTALK FLAMEWHEEL TACKLE])] }
CASES << { "kind" => "scores", "name" => "target flying (semi-invulnerable)", "skill" => 100,
           "p1" => [mon(:PIDGEOT, 50, "m" => %w[FLY])],
           "p2" => [mon(:JOLTEON, 60, "m" => %w[THUNDER THUNDERBOLT GUST TACKLE])],
           "b" => { "0" => { "effects" => { "TwoTurnAttack" => "FLY" } } } }
CASES << { "kind" => "scores", "name" => "substitute target, status moves", "skill" => 100,
           "p1" => [mon(:SNORLAX, 50)],
           "p2" => [mon(:GENGAR, 50, "m" => %w[HYPNOSIS WILLOWISP TOXIC SHADOWBALL])],
           "b" => { "0" => { "effects" => { "Substitute" => 50 } } } }
CASES << { "kind" => "scores", "name" => "kings rock, low level target", "skill" => 100,
           "p1" => [mon(:RATTATA, 20)],
           "p2" => [mon(:POLITOED, 50, "i" => "KINGSROCK", "m" => %w[SURF HYPERBEAM SOLARBEAM BUBBLEBEAM])] }
CASES << { "kind" => "scores", "name" => "light clay screens", "skill" => 100,
           "p1" => [mon(:SNORLAX, 50)],
           "p2" => [mon(:ESPEON, 50, "i" => "LIGHTCLAY", "m" => %w[REFLECT LIGHTSCREEN AURORAVEIL PSYCHIC])] }
CASES << { "kind" => "scores", "name" => "minimized target, telekinesis", "skill" => 100,
           "p1" => [mon(:CHANSEY, 50)],
           "p2" => [mon(:SNORLAX, 50, "m" => %w[BODYSLAM STOMP HEAVYSLAM SING])],
           "b" => { "0" => { "effects" => { "Minimize" => true, "Telekinesis" => 2 } } } }
CASES << { "kind" => "scores", "name" => "trick room, tailwind, gravity", "skill" => 100,
           "p1" => [mon(:JOLTEON, 50)],
           "p2" => [mon(:SLOWBRO, 50, "m" => %w[TRICKROOM TAILWIND GRAVITY HYPNOSIS])],
           "field" => { "effects" => { "Gravity" => 3 } } }
CASES << { "kind" => "scores", "name" => "OHKO moves", "skill" => 100,
           "p1" => [mon(:GOLEM, 45), mon(:RATTATA, 55)],
           "p2" => [mon(:LAPRAS, 50, "m" => %w[SHEERCOLD HORNDRILL FISSURE GUILLOTINE])] }
CASES << { "kind" => "scores", "name" => "lock-on", "skill" => 100,
           "p1" => [mon(:SNORLAX, 50)],
           "p2" => [mon(:MAGNETON, 50, "m" => %w[ZAPCANNON LOCKON THUNDER])],
           "b" => { "1" => { "effects" => { "LockOn" => 2, "LockOnPos" => 0 } } } }
CASES << { "kind" => "scores", "name" => "skill swap/entrainment vs truant", "skill" => 100,
           "p1" => [mon(:SLAKING, 50, "a" => "TRUANT")],
           "p2" => [mon(:ALAKAZAM, 50, "a" => "SYNCHRONIZE", "m" => %w[SKILLSWAP ENTRAINMENT ROLEPLAY SIMPLEBEAM])] }
CASES << { "kind" => "scores", "name" => "wonder guard", "skill" => 100,
           "p1" => [mon(:SHEDINJA, 50, "a" => "WONDERGUARD")],
           "p2" => [mon(:HOUNDOOM, 50, "m" => %w[FLAMETHROWER CRUNCH TACKLE THUNDERWAVE])] }

# Command cases
def cmd(name, h)
  CASES << { "kind" => "command", "name" => name }.merge(h)
end

cmd "wild single", { "p1" => [mon(:CYNDAQUIL, 10)],
                     "p2" => [mon(:RATTATA, 8, "m" => %w[TACKLE TAILWHIP QUICKATTACK BITE])], "seed" => 5 }
cmd "wild double", { "double" => true, "p1" => [mon(:CYNDAQUIL, 10), mon(:PIDGEY, 9)],
                     "p2" => [mon(:RATTATA, 8, "m" => %w[TACKLE TAILWHIP]), mon(:SPEAROW, 8, "m" => %w[PECK GROWL])],
                     "ai" => [1, 3], "seed" => 77 }
cmd "wild, no PP on one move", { "p1" => [mon(:CYNDAQUIL, 10)],
                                 "p2" => [mon(:RATTATA, 8, "m" => %w[TACKLE TAILWHIP])],
                                 "b" => { "1" => { "pp" => [0, 0] } }, "seed" => 9 }
SKILLS.each do |skill|
  [0, 1000, 2000].each do |seed|
    cmd "trainer skill #{skill} seed #{seed}", {
      "skill" => skill, "seed" => seed,
      "p1" => [mon(:TYPHLOSION, 40, "m" => %w[FLAMETHROWER QUICKATTACK]), mon(:PIDGEOTTO, 30)],
      "p2" => [mon(:FERALIGATR, 40, "m" => %w[SURF BITE SCARYFACE SWORDSDANCE]), mon(:BAYLEEF, 30, "m" => %w[RAZORLEAF])] }
  end
end
cmd "trainer double, skill 100", {
  "skill" => 100, "double" => true, "seed" => 31, "ai" => [1, 3],
  "p1" => [mon(:BLASTOISE, 50, "m" => %w[SURF]), mon(:PIKACHU, 45, "m" => %w[THUNDERBOLT])],
  "p2" => [mon(:GOLEM, 50, "m" => %w[EARTHQUAKE ROCKSLIDE EXPLOSION DEFENSECURL]),
           mon(:VENUSAUR, 50, "m" => %w[RAZORLEAF SLEEPPOWDER SLUDGEBOMB GROWTH])] }
cmd "trainer double, skill 48, damaged ally", {
  "skill" => 48, "double" => true, "seed" => 444, "ai" => [1, 3],
  "p1" => [mon(:GYARADOS, 50, "m" => %w[WATERFALL]), mon(:ARCANINE, 50, "m" => %w[FLAMETHROWER])],
  "p2" => [mon(:STARMIE, 50, "m" => %w[SURF RECOVER THUNDERBOLT PSYCHIC], "hp" => [1, 3]),
           mon(:MACHAMP, 50, "m" => %w[CROSSCHOP ROCKSLIDE BULKUP])] }
cmd "high skill, bad moves -> switch", {
  "skill" => 100, "seed" => 12,
  "p1" => [mon(:GENGAR, 50, "m" => %w[SHADOWBALL])],
  "p2" => [mon(:SNORLAX, 50, "m" => %w[TACKLE BODYSLAM]), mon(:HOUNDOOM, 50, "m" => %w[CRUNCH]), mon(:ONIX, 40)],
  "b" => { "1" => { "turnCount" => 4 } } }
cmd "super-effective last move -> switch", {
  "skill" => 100, "seed" => 3,
  "p1" => [mon(:JOLTEON, 50, "m" => %w[THUNDERBOLT])],
  "p2" => [mon(:GYARADOS, 50, "m" => %w[WATERFALL]), mon(:GOLEM, 50, "m" => %w[EARTHQUAKE]), mon(:LAPRAS, 50)],
  "b" => { "1" => { "turnCount" => 2 }, "0" => { "lastMoveUsed" => "THUNDERBOLT" } } }
[0, 1, 2, 3, 4, 5].each do |seed|
  cmd "resisted last move -> switch #{seed}", {
    "skill" => 100, "seed" => seed * 17,
    "p1" => [mon(:CHARIZARD, 50, "m" => %w[FLAMETHROWER])],
    "p2" => [mon(:VENUSAUR, 50, "m" => %w[RAZORLEAF]), mon(:VAPOREON, 50, "m" => %w[SURF]), mon(:GOLEM, 50),
             mon(:BLASTOISE, 50)],
    "b" => { "1" => { "turnCount" => 2 }, "0" => { "lastMoveUsed" => "FLAMETHROWER" } } }
end
cmd "perish song", {
  "skill" => 100, "seed" => 8,
  "p1" => [mon(:LAPRAS, 50)],
  "p2" => [mon(:JOLTEON, 50, "m" => %w[THUNDERBOLT BATONPASS]), mon(:FLAREON, 50), mon(:VAPOREON, 50)],
  "b" => { "1" => { "effects" => { "PerishSong" => 1 } } } }
cmd "toxic -> switch", {
  "skill" => 100, "seed" => 21,
  "p1" => [mon(:LAPRAS, 50)],
  "p2" => [mon(:JOLTEON, 50, "m" => %w[THUNDERBOLT], "hp" => [1, 4], "st" => "POISON", "sc" => 1),
           mon(:FLAREON, 50), mon(:VAPOREON, 50)],
  "b" => { "1" => { "effects" => { "Toxic" => 3 } } } }
cmd "encored into a bad move", {
  "skill" => 48, "seed" => 2,
  "p1" => [mon(:GENGAR, 50)],
  "p2" => [mon(:MACHAMP, 50, "m" => %w[CROSSCHOP BULKUP]), mon(:HOUNDOOM, 50)],
  "b" => { "1" => { "effects" => { "Encore" => 2, "EncoreMove" => "BULKUP" } } } }
cmd "spikes and a low-HP switch-in", {
  "skill" => 100, "seed" => 1,
  "p1" => [mon(:LAPRAS, 50)],
  "p2" => [mon(:JOLTEON, 50, "m" => %w[THUNDERBOLT]), mon(:FLAREON, 50, "hp" => [1, 10]),
           mon(:VAPOREON, 50)],
  "b" => { "1" => { "effects" => { "PerishSong" => 1 } } },
  "sides" => [{}, { "Spikes" => 1 }] }
# Ruby raises NoMethodError here (Pokemon#hasActiveAbility? doesn't exist).
cmd "spikes, low-HP switch-in, forced switch", {
  "skill" => 100, "seed" => 12,
  "p1" => [mon(:GENGAR, 50, "m" => %w[SHADOWBALL])],
  "p2" => [mon(:SNORLAX, 50, "m" => %w[TACKLE BODYSLAM]), mon(:FLAREON, 50, "hp" => [1, 10]), mon(:ONIX, 40)],
  "b" => { "1" => { "turnCount" => 4 } },
  "sides" => [{}, { "Spikes" => 1 }] }
cmd "foe recharging", {
  "skill" => 100, "seed" => 1,
  "p1" => [mon(:SNORLAX, 50, "m" => %w[HYPERBEAM])],
  "p2" => [mon(:GENGAR, 50, "m" => %w[SHADOWBALL]), mon(:ONIX, 40)],
  "b" => { "1" => { "turnCount" => 4 }, "0" => { "effects" => { "HyperBeam" => 2 } } } }
cmd "sudden death", {
  "skill" => 48, "seed" => 40, "rules" => { "suddendeath" => true },
  "p1" => [mon(:SNORLAX, 50)],
  "p2" => [mon(:GENGAR, 50, "m" => %w[SHADOWBALL], "hp" => [1, 3]), mon(:ONIX, 40)],
  "b" => { "1" => { "turnCount" => 2 } } }
[[1, 4], [1, 2], [3, 4]].each_with_index do |hp, n|
  [0, 500].each do |seed|
    cmd "potions hp #{hp.join('/')} seed #{seed}", {
      "skill" => 32, "seed" => seed + n,
      "items" => %w[POTION SUPERPOTION HYPERPOTION],
      "p1" => [mon(:SNORLAX, 50)],
      "p2" => [mon(:MACHAMP, 50, "m" => %w[CROSSCHOP], "hp" => hp), mon(:ONIX, 40)] }
  end
end
cmd "full restore, poisoned", {
  "skill" => 32, "seed" => 6, "items" => %w[FULLRESTORE],
  "p1" => [mon(:SNORLAX, 50)],
  "p2" => [mon(:MACHAMP, 50, "m" => %w[CROSSCHOP], "hp" => [1, 5], "st" => "POISON")] }
[0, 3, 7, 11].each do |seed|
  cmd "status heal #{seed}", {
    "skill" => 32, "seed" => seed, "items" => %w[FULLHEAL ANTIDOTE],
    "p1" => [mon(:SNORLAX, 50)],
    "p2" => [mon(:MACHAMP, 50, "m" => %w[CROSSCHOP], "st" => "POISON")] }
  cmd "x items #{seed}", {
    "skill" => 32, "seed" => seed, "items" => %w[XATTACK XDEFENSE XSPEED],
    "p1" => [mon(:SNORLAX, 50)],
    "p2" => [mon(:MACHAMP, 50, "m" => %w[CROSSCHOP])],
    "b" => { "1" => { "stages" => { "ATTACK" => 1 } } } }
  cmd "revive #{seed}", {
    "skill" => 100, "seed" => seed, "items" => %w[REVIVE MAXREVIVE],
    "p1" => [mon(:SNORLAX, 50)],
    "p2" => [mon(:MACHAMP, 50, "m" => %w[CROSSCHOP]), mon(:ONIX, 40, "hp" => [0, 1]), mon(:GOLEM, 40)] }
end
cmd "zero to hero", {
  "skill" => 100, "seed" => 4,
  "p1" => [mon(:SNORLAX, 50)],
  "p2" => [mon(:PALAFIN, 50, "a" => "ZEROTOHERO", "m" => %w[FLIPTURN JETPUNCH]), mon(:ONIX, 40)] }
cmd "only one usable move (choice lock-free), struggle", {
  "skill" => 100, "seed" => 4,
  "p1" => [mon(:SNORLAX, 50)],
  "p2" => [mon(:MEW, 50, "m" => %w[TACKLE GROWL])],
  "b" => { "1" => { "pp" => [0, 0] } } }
cmd "status-only moveset", {
  "skill" => 100, "seed" => 99,
  "p1" => [mon(:SNORLAX, 50)],
  "p2" => [mon(:GENGAR, 50, "m" => %w[HYPNOSIS CONFUSERAY TOXIC SPITE])],
  "b" => { "1" => { "turnCount" => 2 } } }

sweeps = SWEEPS.map do |sw|
  scores = {}
  SWEEP_MOVES.each do |mv|
    c = sw["build"].call(mv.to_s)
    next if ENV["AI_REF_ONLY"] && c["name"] != ENV["AI_REF_ONLY"]
    scores[mv.to_s] = run_scores(c)
  end
  { "template" => sw["template"], "results" => scores }
end
CASES.select! { |c| c["name"] == ENV["AI_REF_ONLY"] } if ENV["AI_REF_ONLY"]
out = CASES.map do |c|
  res = (c["kind"] == "scores") ? run_scores(c) : run_command(c)
  c.merge("result" => res)
end
if ENV["AI_REF_ONLY"] || ENV["AI_REF_RAISE"]
  puts JSON.pretty_generate(sweeps.select { |sw| !sw["results"].empty? } + out)
  exit
end
path = File.join(ROOT, "web", "src", "battle", "ai", "aiReference.json")
File.write(path, JSON.generate({ "sweeps" => sweeps, "cases" => out }) + "\n")
puts "Wrote #{path} (#{SWEEP_MOVES.length} moves x #{sweeps.length} sweep setups, #{out.length} other cases)"
