# Runs the game's real Ruby battle code (see essentials.rb) on fixed
# scenarios and writes web/src/battle/rubyReference.json, which
# web/src/battle/battleReference.test.ts compares the TypeScript port against.
#
#   cd web && ruby tools/ruby-ref/battle_reference.rb
#
# Randomness is replaced by a counter-based sequence (same formula as the TS
# test), so both sides see the same "random" numbers. Every Pokémon gets the
# ability Honey Gather and no item, so ability/item handlers (not part of the
# battle core port) don't change the results.

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)

#===============================================================================
# Globals the battle code reads
#===============================================================================
class Game_Temp
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end

class SwitchStub
  def [](_i); false; end
  def []=(_i, _v); end
end

$game_temp     = Game_Temp.new
$game_switches = SwitchStub.new
$game_variables = Hash.new(0)
$game_map      = nil
MAP_STUB       = Struct.new(:map_id).new(0) # level-up happiness reads $game_map.map_id
$PokemonGlobal = nil
$player        = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id     = 12_345_678
$bag           = PokemonBag.new
$stats         = GameStats.new

INERT_ABILITY = :HONEYGATHER

#===============================================================================
# Deterministic randomness: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x
# (k * 829348651 stays below 2**53, so JS doubles compute it exactly too).
#===============================================================================
class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end

def make_pokemon(species, level, iv: 31, ev: 0, nature: :HARDY, moves: [:TACKLE])
  pkmn = Pokemon.new(species, level, $player)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = iv
    pkmn.ev[s.id] = ev
  end
  pkmn.nature = nature
  pkmn.ability = INERT_ABILITY
  pkmn.item = nil
  pkmn.forget_all_moves
  moves.each { |m| pkmn.learn_move(m) }
  pkmn.calc_stats
  pkmn
end

# A wild 1v1 (or 2v2 with two Pokémon per side) battle with its battlers set up.
def make_battle(p1, p2, double: false, random: nil)
  scene = Battle::DebugSceneNoLogging.new
  battle = Battle.new(scene, p1, p2, $player, nil)
  battle.setBattleMode("double") if double
  battle.internalBattle = true
  if random
    battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
    battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
  end
  scene.pbStartBattle(battle)
  battle.pbSetUpSides
  battle
end

out = {}

#===============================================================================
# Damage formula
#===============================================================================
DAMAGE_CASES = [
  # attacker, lvl, defender, lvl, move, crit, random(0-15), atkStage, defStage, attacker status
  [:PIKACHU, 50, :SQUIRTLE, 50, :THUNDERBOLT, false, 0, 0, 0, :NONE],    # STAB, super effective
  [:PIKACHU, 50, :SQUIRTLE, 50, :THUNDERBOLT, true, 15, 0, 0, :NONE],    # critical, max roll
  [:PIKACHU, 50, :GEODUDE, 50, :THUNDERBOLT, false, 7, 0, 0, :NONE],     # immune
  [:CHARIZARD, 100, :VENUSAUR, 100, :FLAMETHROWER, false, 15, 0, 0, :NONE], # STAB, super effective
  [:CHARIZARD, 100, :BLASTOISE, 100, :FLAMETHROWER, false, 3, 0, 0, :NONE], # not very effective
  [:MACHAMP, 70, :SNORLAX, 72, :CROSSCHOP, false, 9, 2, -1, :NONE],     # stages
  [:MACHAMP, 70, :SNORLAX, 72, :CROSSCHOP, true, 9, -2, 2, :NONE],      # crit ignores bad stages
  [:MACHAMP, 70, :SNORLAX, 72, :CROSSCHOP, false, 12, 0, 0, :BURN],     # burn halves physical
  [:CYNDAQUIL, 5, :PIDGEY, 3, :TACKLE, false, 0, 0, 0, :NONE],          # Normal vs Normal/Flying
  [:CYNDAQUIL, 5, :PIDGEY, 3, :TACKLE, false, 15, 0, 0, :NONE],
  [:PIDGEY, 3, :CYNDAQUIL, 5, :TACKLE, false, 8, 0, -1, :NONE],
  [:GENGAR, 60, :ALAKAZAM, 60, :SHADOWBALL, false, 5, 0, 0, :NONE],     # STAB SE special
  [:GENGAR, 60, :SNORLAX, 60, :SHADOWBALL, false, 5, 0, 0, :NONE],      # Ghost vs Normal: immune
  [:GYARADOS, 45, :ONIX, 40, :WATERFALL, false, 11, 1, 0, :NONE],       # double super effective
  [:TYRANITAR, 80, :SCIZOR, 75, :EARTHQUAKE, false, 2, 0, 0, :NONE],
  [:SCIZOR, 75, :TYRANITAR, 80, :XSCISSOR, true, 6, 0, 0, :NONE],
  [:LUCARIO, 50, :BLISSEY, 50, :AURASPHERE, false, 10, 0, 6, :NONE],
  [:BLISSEY, 50, :LUCARIO, 50, :SEISMICTOSS, false, 0, 0, 0, :NONE],    # fixed damage (move class)
  [:DRAGONITE, 55, :GARCHOMP, 55, :DRAGONCLAW, false, 14, 0, 0, :NONE],
  [:SHEDINJA, 30, :SNORLAX, 30, :SHADOWSNEAK, false, 4, 0, 0, :NONE],
]

out[:damage] = DAMAGE_CASES.map do |a, al, d, dl, move, crit, rnd, as, ds, status|
  att = make_pokemon(a, al, moves: [move])
  dfn = make_pokemon(d, dl, iv: 20, ev: 40, nature: :BOLD)
  att.status = status
  battle = make_battle([att], [dfn])
  battle.define_singleton_method(:pbRandom) { |_x| rnd }
  user = battle.battlers[0]
  target = battle.battlers[1]
  user.stages[:ATTACK] = as
  user.stages[:SPECIAL_ATTACK] = as
  target.stages[:DEFENSE] = ds
  target.stages[:SPECIAL_DEFENSE] = ds
  m = user.moves[0]
  target.damageState.reset
  target.damageState.critical = crit
  m.calcType = m.pbCalcType(user)
  target.damageState.typeMod = m.pbCalcTypeMod(m.calcType, user, target)
  m.pbCalcDamage(user, target)
  { attacker: a, attackerLevel: al, defender: d, defenderLevel: dl, move: move, critical: crit, random: rnd,
    atkStage: as, defStage: ds, status: status, typeMod: target.damageState.typeMod,
    damage: target.damageState.calcDamage, moveClass: m.class.name }
end

#===============================================================================
# Stat stages: speed for every stage, paralysis
#===============================================================================
out[:speed] = []
[:NONE, :PARALYSIS].each do |status|
  (-6..6).each do |stage|
    p1 = make_pokemon(:JOLTEON, 47)
    p1.status = status
    battle = make_battle([p1], [make_pokemon(:RATTATA, 5)])
    b = battle.battlers[0]
    b.stages[:SPEED] = stage
    out[:speed] << { stage: stage, status: status, speed: b.speed, pbSpeed: b.pbSpeed }
  end
end

# pbRaiseStatStageBasic / pbLowerStatStageBasic clamping
out[:stageChanges] = []
[[0, 2, :raise], [5, 3, :raise], [-6, 1, :raise], [0, 2, :lower], [-5, 3, :lower], [6, 1, :lower]].each do |start, inc, dir|
  battle = make_battle([make_pokemon(:MEW, 50)], [make_pokemon(:RATTATA, 5)])
  b = battle.battlers[0]
  b.stages[:ATTACK] = start
  changed = (dir == :raise) ? b.pbRaiseStatStageBasic(:ATTACK, inc) : b.pbLowerStatStageBasic(:ATTACK, inc)
  out[:stageChanges] << { start: start, increment: inc, dir: dir, changed: changed, result: b.stages[:ATTACK] }
end

#===============================================================================
# Accuracy: the number of pbRandom(100) values that hit
#===============================================================================
ACCURACY_CASES = [
  # move, accStage, evaStage
  [:TACKLE, 0, 0], [:HYPNOSIS, 0, 0], [:HYPNOSIS, 1, 0], [:HYPNOSIS, 0, 2], [:STONEEDGE, -2, 0],
  [:STONEEDGE, 3, -1], [:FOCUSBLAST, 6, 0], [:FOCUSBLAST, -6, 6], [:SWIFT, -6, 6], [:THUNDER, 0, 1],
  [:SANDATTACK, 0, -3], [:ZAPCANNON, 2, 2],
]
out[:accuracy] = ACCURACY_CASES.map do |move, acc, eva|
  hits = 0
  100.times do |v|
    battle = make_battle([make_pokemon(:MEW, 50, moves: [move])], [make_pokemon(:SNORLAX, 50)])
    battle.define_singleton_method(:pbRandom) { |_x| v }
    user = battle.battlers[0]
    target = battle.battlers[1]
    user.stages[:ACCURACY] = acc
    target.stages[:EVASION] = eva
    m = user.moves[0]
    m.calcType = m.pbCalcType(user)
    hits += 1 if m.pbAccuracyCheck(user, target)
  end
  { move: move, accStage: acc, evaStage: eva, hits: hits }
end

#===============================================================================
# Critical hits: stage (Focus Energy) x random value
#===============================================================================
out[:critical] = []
[[:TACKLE, 0], [:TACKLE, 1], [:TACKLE, 2], [:TACKLE, 3], [:SLASH, 0], [:SLASH, 2]].each do |move, fe|
  [0, 1, 2, 7].each do |v|
    battle = make_battle([make_pokemon(:MEW, 50, moves: [move])], [make_pokemon(:SNORLAX, 50)])
    battle.define_singleton_method(:pbRandom) { |_x| v }
    user = battle.battlers[0]
    user.effects[PBEffects::FocusEnergy] = fe
    out[:critical] << { move: move, focusEnergy: fe, random: v, critical: user.moves[0].pbIsCritical?(user, battle.battlers[1]) }
  end
end

#===============================================================================
# Speed/priority ordering (double battle)
#===============================================================================
PRIORITY_CASES = [
  # [species, level, move] x 4 (battler indices 0..3)
  [[:PIKACHU, 50, :TACKLE], [:SNORLAX, 50, :TACKLE], [:JOLTEON, 50, :TACKLE], [:SLOWBRO, 50, :TACKLE]],
  [[:SNORLAX, 50, :QUICKATTACK], [:JOLTEON, 50, :TACKLE], [:SLOWBRO, 50, :EXTREMESPEED], [:PIKACHU, 50, :PROTECT]],
  [[:MEW, 50, :TACKLE], [:MEW, 50, :TACKLE], [:MEW, 50, :TACKLE], [:MEW, 50, :TACKLE]],   # speed ties
  [[:SNORLAX, 30, :TRICKROOM], [:JOLTEON, 30, :VITALTHROW], [:PIKACHU, 30, :TACKLE], [:SLOWBRO, 30, :TACKLE]],
]
out[:priority] = PRIORITY_CASES.each_with_index.map do |specs, ci|
  mons = specs.map { |sp, lv, mv| make_pokemon(sp, lv, moves: [mv]) }
  battle = make_battle([mons[0], mons[2]], [mons[1], mons[3]], double: true, random: SeqRandom.new(ci * 100))
  4.times do |i|
    battle.pbRegisterMove(i, 0, false)
    battle.pbRegisterTarget(i, (i + 1) % 4) if battle.choices[i][2].pbTarget(battle.battlers[i]).num_targets == 1
  end
  battle.pbCalculatePriority(true)
  { cases: specs, order: battle.pbPriority.map(&:index), speeds: battle.battlers.map(&:pbSpeed) }
end

#===============================================================================
# Exp. gain
#===============================================================================
EXP_CASES = [
  # gainer, lvl, defeated, lvl, trainer battle, numPartic, expShare
  [:CYNDAQUIL, 5, :PIDGEY, 3, false, 1, []],
  [:CYNDAQUIL, 5, :RATTATA, 4, false, 1, []],
  [:BAYLEEF, 18, :GEODUDE, 20, true, 1, []],
  [:CROCONAW, 25, :ZUBAT, 12, false, 2, []],
  [:TYPHLOSION, 50, :BLISSEY, 55, true, 1, []],
  [:PICHU, 2, :ONIX, 40, false, 1, []],          # big level gap, several level-ups
  [:MEWTWO, 100, :RATTATA, 2, false, 1, []],     # max level
  [:CYNDAQUIL, 10, :SENTRET, 9, false, 1, [0]],  # Exp. Share
]
out[:exp] = EXP_CASES.map do |g, gl, d, dl, trainer, partic, share|
  gainer = make_pokemon(g, gl)
  gainer.exp = gainer.growth_rate.minimum_exp_for_level(gl)
  defeated = make_pokemon(d, dl)
  battle = make_battle([gainer], [defeated])
  battle.instance_variable_set(:@opponent, [NPCTrainer.new("Joey", GameData::TrainerType.keys.first)]) if trainer
  battle.battlers[1].participants = [0] if share.empty?
  before = gainer.exp
  $game_map = MAP_STUB
  battle.pbGainExpOne(0, battle.battlers[1], partic, share, false, false)
  battle.pbGainEVsOne(0, battle.battlers[1])
  $game_map = nil
  { gainer: g, gainerLevel: gl, defeated: d, defeatedLevel: dl, trainer: trainer, numPartic: partic,
    expShare: share, expGained: gainer.exp - before, levelAfter: gainer.level, evs: gainer.ev }
end

#===============================================================================
# Catching: shakes for a sequence of random numbers
#===============================================================================
CATCH_CASES = [
  # species, level, hp fraction (numerator/denominator), status, ball, random start
  [:PIDGEY, 3, [1, 1], :NONE, :POKEBALL, 0],
  [:PIDGEY, 3, [1, 4], :NONE, :POKEBALL, 500],
  [:SNORLAX, 30, [1, 1], :NONE, :GREATBALL, 900],
  [:SNORLAX, 30, [1, 10], :SLEEP, :ULTRABALL, 1700],
  [:SNORLAX, 30, [1, 3], :PARALYSIS, :POKEBALL, 3300],
  [:MEWTWO, 70, [1, 1], :NONE, :ULTRABALL, 200],
  [:MEWTWO, 70, [1, 70], :FROZEN, :ULTRABALL, 4100],
  [:CATERPIE, 2, [1, 1], :NONE, :MASTERBALL, 0],
  [:ABRA, 10, [1, 2], :NONE, :POKEBALL, 300],
  [:CHANSEY, 25, [1, 1], :BURN, :GREATBALL, 700],
]
out[:catch] = CATCH_CASES.map do |sp, lv, (num, den), status, ball, start|
  wild = make_pokemon(sp, lv)
  wild.hp = [(wild.totalhp * num / den), 1].max
  wild.status = status
  battle = make_battle([make_pokemon(:MEW, 50)], [wild], random: SeqRandom.new(start))
  shakes = battle.pbCaptureCalc(wild, battle.battlers[1], nil, ball)
  { species: sp, level: lv, hp: wild.hp, totalhp: wild.totalhp, status: status, ball: ball, randomStart: start,
    shakes: shakes, critical: battle.instance_variable_get(:@criticalCapture) ? true : false }
end

#===============================================================================
# Running away: [result, decision] for each pbAIRandom(256) value
#===============================================================================
RUN_CASES = [
  # player species/level, wild species/level, previous attempts
  [:RATTATA, 5, :PIDGEY, 5, 0],
  [:SLOWPOKE, 5, :PIDGEY, 30, 0],
  [:SLOWPOKE, 5, :PIDGEY, 30, 2],
  [:SNORLAX, 20, :JOLTEON, 20, 1],
  [:GASTLY, 5, :JOLTEON, 50, 0],   # Ghost always escapes
]
out[:run] = RUN_CASES.map do |ps, pl, ws, wl, attempts|
  results = [0, 50, 100, 128, 200, 255].map do |v|
    battle = make_battle([make_pokemon(ps, pl)], [make_pokemon(ws, wl)])
    battle.battleAI.define_singleton_method(:pbAIRandom) { |_x| v }
    battle.instance_variable_set(:@runCommand, attempts)
    battle.choices[0] = [:None, 0, nil, -1]
    ret = battle.pbRun(0)
    [v, ret, battle.decision]
  end
  { player: ps, playerLevel: pl, wild: ws, wildLevel: wl, attempts: attempts, results: results }
end

path = File.join(ROOT, "web", "src", "battle", "rubyReference.json")
File.write(path, JSON.pretty_generate(out) + "\n")
puts "Wrote #{path}"
