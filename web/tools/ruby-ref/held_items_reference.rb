# Runs the game's real Ruby battle code (see essentials.rb) on scripted battles
# with held items and writes web/src/battle/items/heldItemsReference.json,
# which web/src/battle/items/heldItems.test.ts replays against the TypeScript
# port of 009_Battle_ItemEffects.rb (+ the plugins' item handlers).
#
#   cd web && ruby tools/ruby-ref/held_items_reference.rb
#
# Each scenario is plain data (written into the JSON, so the TS test sets up
# exactly the same battle): the Pokémon of each side (ability Honey Gather,
# so ability handlers don't interfere), setup operations, and the moves each
# battler uses each round. A round is: clear + register every battler's move
# and target, pbAttackPhase, pbEndOfRoundPhase. After the switch-in phase and
# after each round the script records every message shown (all of the scene's
# pbDisplayMessage/pbDisplayPausedMessage/pbDisplayConfirmMessage calls) and
# each battler's HP, stat stages, status, held item and Speed (and "error":
# the classes of the exceptions PBDebug.logonerr caught). Randomness is
# battle_reference.rb's counter-based SeqRandom (same formula on both sides).

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)

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
$game_map       = nil
MAP_STUB        = Struct.new(:map_id).new(0) # level-up happiness reads $game_map.map_id
$PokemonGlobal  = nil
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
$player.badges  = [true] * 8 # so that no Pokémon disobeys
$bag            = PokemonBag.new
$stats          = GameStats.new

INERT_ABILITY = :HONEYGATHER

# Essentials Deluxe's midbattle triggers are defined on Battle::Scene, which the
# debug scene doesn't inherit from (the TS port calls them with ?.); with no
# midbattle script they do nothing.
class Battle::DebugSceneNoLogging
  def pbDeluxeTriggers(*_a); end
end

# 002_ShadowPokemon_Other.rb's Battler methods (not loaded by essentials.rb;
# the TS port has no Shadow Pokémon): no Pokémon here is a Shadow Pokémon.
class Battle::Battler
  def shadowPokemon?; false; end
  def inHyperMode?; false; end
  def pbHyperMode; end
  def pbHyperModeObedience(_move); true; end
end

# PBDebug.logonerr (around Battler#pbUseMove, ...) shows the exception with
# pbPrintException and carries on with the battle. Headless there's no message
# box: record the exception's class instead.
$exceptions = []
def pbPrintException(e)
  $exceptions << e.class.name
  $stderr.puts "#{e.class}: #{e.message}\n  #{e.backtrace.first(5).join("\n  ")}" if ENV["VERBOSE"]
end

# Kernel#rand in move effect code (multi-hit moves etc.): the TypeScript port
# routes it through battle.pbRandom, so do the same here.
class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end

# battle_reference.rb's SeqRandom: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x
class SeqRandom
  def initialize(start = 0); @k = start; end
  def next(x)
    v = ((@k * 829_348_651) + 12_345) % 2_147_483_647
    @k += 1
    x > 0 ? v % x : 0
  end
end

def make_pokemon(spec)
  pkmn = Pokemon.new(spec["species"].to_sym, spec["level"] || 50, $player)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = spec["iv"] || 31
    pkmn.ev[s.id] = spec["ev"] || 0
  end
  pkmn.nature = (spec["nature"] || "HARDY").to_sym
  pkmn.ability = INERT_ABILITY
  pkmn.item = spec["item"]&.to_sym
  pkmn.forget_all_moves
  (spec["moves"] || ["TACKLE"]).each { |m| pkmn.learn_move(m.to_sym) }
  pkmn.calc_stats
  pkmn
end

#===============================================================================
# Scenarios. Battler indices: 0 (and 2) = player's side, 1 (and 3) = wild.
# Turn entries are per battler: [moveIndex] or [moveIndex, targetIndex];
# single-target moves without a target aim at the (first) opposing battler.
# Setup ops: ["hp", i, value] / ["hpFraction", i, num, den] / ["status", i, s] /
# ["stage", i, stat, value] / ["effect", i, PBEffectsName, value] /
# ["pp", i, moveIndex, value] / ["terrain", name]. "randomStart" (the SeqRandom
# counter's start) defaults to 1000 * the scenario's index.
#===============================================================================
def mon(species, item, moves, level: 50, **rest)
  { "species" => species, "level" => level, "item" => item, "moves" => moves }.merge(rest.transform_keys(&:to_s))
end

SCENARIOS = [
  { "name" => "Leftovers and Black Sludge (non-Poison holder)",
    "p1" => [mon("SNORLAX", "LEFTOVERS", ["TACKLE"])],
    "p2" => [mon("MACHAMP", "BLACKSLUDGE", ["KARATECHOP"])],
    "turns" => [[[0], [0]], [[0], [0]], [[0], [0]]] },
  { "name" => "Black Sludge (Poison holder) vs Leftovers at full HP",
    "p1" => [mon("MUK", "BLACKSLUDGE", ["TACKLE"])],
    "p2" => [mon("PIDGEOT", "LEFTOVERS", ["SPLASH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Sitrus Berry and Oran Berry",
    "p1" => [mon("SNORLAX", "SITRUSBERRY", ["TACKLE"])],
    "p2" => [mon("MACHAMP", "ORANBERRY", ["CROSSCHOP"])],
    "setup" => [["hpFraction", 1, 3, 5]],
    "turns" => [[[0], [0]], [[0], [0]], [[0], [0]], [[0], [0]]] },
  { "name" => "Pinch berries: Liechi, Salac",
    "p1" => [mon("SCIZOR", "LIECHIBERRY", ["TACKLE"])],
    "p2" => [mon("SNORLAX", "SALACBERRY", ["TACKLE"])],
    "setup" => [["hpFraction", 0, 3, 10], ["hpFraction", 1, 2, 7]],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Micle Berry (Ruby bug: never triggers)",
    "p1" => [mon("MEW", "MICLEBERRY", ["TACKLE"])],
    "p2" => [mon("MEW", nil, ["TACKLE"])],
    "setup" => [["hpFraction", 0, 3, 10]],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Custap Berry and Starf Berry",
    "p1" => [mon("SNORLAX", "CUSTAPBERRY", ["TACKLE"])],
    "p2" => [mon("JOLTEON", "STARFBERRY", ["TACKLE"])],
    "setup" => [["hpFraction", 0, 1, 5], ["hpFraction", 1, 1, 4]],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Figy Berry (confusing flavor) and Lansat Berry",
    "p1" => [mon("MEW", "FIGYBERRY", ["TACKLE"], nature: "MODEST")],
    "p2" => [mon("MEW", "LANSATBERRY", ["TACKLE"])],
    "setup" => [["hpFraction", 0, 3, 10], ["hpFraction", 1, 3, 10]],
    "turns" => [[[0], [0]], [[0], [0]]] },
  # (Sleep moves cause Drowsy with the Generation 9 Pack, which only the Gen 9
  # Pack's Chesto/Lum Berry handlers cure: not used here.)
  { "name" => "Lum Berry (confusion, paralysis)",
    "p1" => [mon("MEW", "LUMBERRY", ["CONFUSERAY", "THUNDERWAVE"])],
    "p2" => [mon("MEW", "LUMBERRY", ["THUNDERWAVE", "TACKLE"])],
    "turns" => [[[0], [0]], [[1], [1]], [[1], [1]]] },
  { "name" => "Rawst and Pecha Berry",
    "p1" => [mon("MEW", "RAWSTBERRY", ["TOXIC"])],
    "p2" => [mon("MEW", "PECHABERRY", ["WILLOWISP"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Cheri and Persim Berry",
    "p1" => [mon("MEW", "CHERIBERRY", ["CONFUSERAY"])],
    "p2" => [mon("MEW", "PERSIMBERRY", ["THUNDERWAVE"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Lum Berry on an existing status",
    "p1" => [mon("MEW", "LUMBERRY", ["SPLASH"])],
    "p2" => [mon("MEW", nil, ["SPLASH"])],
    "setup" => [["status", 0, "BURN"]],
    "turns" => [[[0], [0]]] },
  { "name" => "Choice Band vs no item",
    "p1" => [mon("MACHAMP", "CHOICEBAND", ["CROSSCHOP", "TACKLE"])],
    "p2" => [mon("MACHAMP", nil, ["CROSSCHOP"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Choice Specs and Choice Scarf",
    "p1" => [mon("ALAKAZAM", "CHOICESPECS", ["PSYCHIC"])],
    "p2" => [mon("MACHAMP", "CHOICESCARF", ["TACKLE"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Life Orb (and immune target)",
    "p1" => [mon("GENGAR", "LIFEORB", ["SHADOWBALL", "SLUDGEBOMB"])],
    "p2" => [mon("SNORLAX", nil, ["TACKLE"])],
    "turns" => [[[0], [0]], [[1], [0]], [[1], [0]]] },
  { "name" => "Shell Bell",
    "p1" => [mon("MACHAMP", "SHELLBELL", ["TACKLE"])],
    "p2" => [mon("SNORLAX", nil, ["SPLASH"])],
    "setup" => [["hpFraction", 0, 1, 2]],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Throat Spray",
    "p1" => [mon("MEW", "THROATSPRAY", ["HYPERVOICE"])],
    "p2" => [mon("SNORLAX", nil, ["SPLASH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Blunder Policy",
    "p1" => [mon("MEW", "BLUNDERPOLICY", ["FOCUSBLAST"])],
    "p2" => [mon("SNORLAX", nil, ["SPLASH"])],
    "turns" => [[[0], [0]]] * 5 },
  { "name" => "Charcoal vs Occa Berry, Expert Belt",
    "p1" => [mon("CHARIZARD", "CHARCOAL", ["FLAMETHROWER"])],
    "p2" => [mon("VENUSAUR", "OCCABERRY", ["SLUDGEBOMB"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Expert Belt vs Mystic Water",
    "p1" => [mon("PIKACHU", "EXPERTBELT", ["THUNDERBOLT", "TACKLE"])],
    "p2" => [mon("GYARADOS", "MYSTICWATER", ["WATERFALL"])],
    "turns" => [[[0], [0]], [[1], [0]]] },
  { "name" => "Focus Sash",
    "p1" => [mon("RATTATA", "FOCUSSASH", ["TACKLE"], level: 10)],
    "p2" => [mon("MACHAMP", nil, ["CROSSCHOP"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Focus Band",
    "randomStart" => 1369, # a start where Focus Band triggers
    "p1" => [mon("PIDGEY", "FOCUSBAND", ["TACKLE"], level: 10), mon("RATTATA", "FOCUSBAND", ["TACKLE"], level: 10)],
    "p2" => [mon("MACHAMP", nil, ["CROSSCHOP"])],
    "turns" => [[[0], [0]], [[0], [0]], [[0], [0]], [[0], [0]]] },
  { "name" => "Rocky Helmet and Sticky Barb",
    "p1" => [mon("FERROTHORN", "ROCKYHELMET", ["TACKLE"])],
    "p2" => [mon("MACHAMP", "STICKYBARB", ["TACKLE"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Weakness Policy",
    "p1" => [mon("TYRANITAR", "WEAKNESSPOLICY", ["TACKLE"])],
    "p2" => [mon("MACHAMP", nil, ["MACHPUNCH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Air Balloon",
    "p1" => [mon("PIKACHU", nil, ["EARTHQUAKE", "TACKLE"])],
    "p2" => [mon("HEATRAN", "AIRBALLOON", ["SPLASH"])],
    "turns" => [[[0], [0]], [[1], [0]], [[0], [0]]] },
  { "name" => "White Herb and Mental Herb",
    "p1" => [mon("LUCARIO", "WHITEHERB", ["CLOSECOMBAT", "TAUNT"], level: 30)],
    "p2" => [mon("SNORLAX", "MENTALHERB", ["SCREECH", "TACKLE"])],
    "turns" => [[[0], [0]], [[1], [1]], [[0], [0]]] },
  { "name" => "Quick Claw",
    "p1" => [mon("SNORLAX", "QUICKCLAW", ["SPLASH"])],
    "p2" => [mon("JOLTEON", nil, ["SPLASH"])],
    "turns" => [[[0], [0]]] * 8 },
  { "name" => "King's Rock and Razor Fang",
    "p1" => [mon("JOLTEON", "KINGSROCK", ["TACKLE"])],
    "p2" => [mon("SNORLAX", "RAZORFANG", ["TACKLE"])],
    "turns" => [[[0], [0]]] * 5 },
  { "name" => "Toxic Orb and Flame Orb",
    "p1" => [mon("MEW", "TOXICORB", ["SPLASH"])],
    "p2" => [mon("MEW", "FLAMEORB", ["SPLASH"])],
    "turns" => [[[0], [0]], [[0], [0]], [[0], [0]]] },
  { "name" => "Eviolite and Light Ball",
    "p1" => [mon("PIKACHU", "LIGHTBALL", ["THUNDERBOLT", "TACKLE"])],
    "p2" => [mon("CHANSEY", "EVIOLITE", ["SPLASH"])],
    "turns" => [[[0], [0]], [[1], [0]]] },
  { "name" => "Assault Vest and Thick Club",
    "p1" => [mon("MAROWAK", "THICKCLUB", ["BONECLUB", "FLAMETHROWER"])],
    "p2" => [mon("SNORLAX", "ASSAULTVEST", ["SPLASH"])],
    "turns" => [[[0], [0]], [[1], [0]]] },
  { "name" => "Scope Lens",
    "p1" => [mon("ABSOL", "SCOPELENS", ["SLASH"])],
    "p2" => [mon("SNORLAX", nil, ["SPLASH"])],
    "turns" => [[[0], [0]]] * 5 },
  { "name" => "Wide Lens vs Bright Powder",
    "p1" => [mon("MEW", "WIDELENS", ["HYPNOSIS", "TACKLE"])],
    "p2" => [mon("MEW", "BRIGHTPOWDER", ["TACKLE"])],
    "turns" => [[[0], [0]], [[1], [0]], [[1], [0]], [[1], [0]]] },
  { "name" => "Zoom Lens",
    "p1" => [mon("SNORLAX", "ZOOMLENS", ["FOCUSBLAST"])],
    "p2" => [mon("JOLTEON", nil, ["SPLASH"])],
    "turns" => [[[0], [0]]] * 4 },
  { "name" => "Lagging Tail vs Macho Brace",
    "p1" => [mon("JOLTEON", "LAGGINGTAIL", ["TACKLE"])],
    "p2" => [mon("PIKACHU", "MACHOBRACE", ["TACKLE"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Iron Ball",
    "p1" => [mon("JOLTEON", "IRONBALL", ["TACKLE"])],
    "p2" => [mon("SNORLAX", nil, ["TACKLE"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Fire Gem and Metronome",
    "p1" => [mon("CHARIZARD", "FIREGEM", ["FLAMETHROWER"])],
    "p2" => [mon("SNORLAX", "METRONOME", ["TACKLE"])],
    "turns" => [[[0], [0]], [[0], [0]], [[0], [0]]] },
  { "name" => "Leppa Berry",
    "p1" => [mon("MEW", "LEPPABERRY", ["TACKLE"])],
    "p2" => [mon("MEW", nil, ["SPLASH"])],
    "setup" => [["pp", 0, 0, 1]],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Kee Berry",
    "p1" => [mon("MACHAMP", nil, ["TACKLE"])],
    "p2" => [mon("SNORLAX", "KEEBERRY", ["SPLASH"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Maranga Berry",
    "p1" => [mon("ALAKAZAM", nil, ["PSYCHIC"])],
    "p2" => [mon("SNORLAX", "MARANGABERRY", ["SPLASH"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Enigma Berry on a super-effective hit",
    "p1" => [mon("MACHAMP", nil, ["KARATECHOP"])],
    "p2" => [mon("SNORLAX", "ENIGMABERRY", ["SPLASH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Grassy Seed on Grassy Terrain",
    "p1" => [mon("MEW", nil, ["TACKLE"])],
    "p2" => [mon("SNORLAX", "GRASSYSEED", ["SPLASH"])],
    "setup" => [["terrain", "Grassy"]],
    "turns" => [[[0], [0]]] },
  { "name" => "Sticky Barb transfer",
    "p1" => [mon("MACHAMP", nil, ["TACKLE"])],
    "p2" => [mon("SNORLAX", "STICKYBARB", ["SPLASH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Eject Pack",
    "p1" => [mon("SNORLAX", "EJECTPACK", ["SPLASH"]), mon("PIKACHU", nil, ["TACKLE"])],
    "p2" => [mon("MACHAMP", nil, ["SCREECH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Red Card",
    "p1" => [mon("PIKACHU", nil, ["TACKLE"]), mon("JOLTEON", nil, ["TACKLE"])],
    "p2" => [mon("SNORLAX", "REDCARD", ["SPLASH"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  { "name" => "Eject Button",
    "p1" => [mon("SNORLAX", "EJECTBUTTON", ["SPLASH"]), mon("PIKACHU", nil, ["TACKLE"])],
    "p2" => [mon("MACHAMP", nil, ["TACKLE"])],
    "turns" => [[[0], [0]], [[0], [0]]] },
  # Jaboca/Rowap Berry raise NameError (Ruby bug): PBDebug.logonerr swallows it
  # in Battler#pbProcessTurn, and as the attacker's move never finished, it
  # attacks again until the holder faints. (The holder moves first.)
  { "name" => "Jaboca Berry (Ruby bug: NameError)",
    "p1" => [mon("SNORLAX", nil, ["TACKLE"])],
    "p2" => [mon("JOLTEON", "JABOCABERRY", ["SPLASH"])],
    "turns" => [[[0], [0]]] },
  { "name" => "Rowap Berry (Ruby bug: NameError)",
    "p1" => [mon("SNORLAX", nil, ["SWIFT"])],
    "p2" => [mon("JOLTEON", "ROWAPBERRY", ["SPLASH"])],
    "turns" => [[[0], [0]]] },
]

#===============================================================================
# Running a scenario
#===============================================================================
def battler_state(b)
  stages = {}
  GameData::Stat.each_battle { |s| stages[s.id] = b.stages[s.id] }
  { "index" => b.index, "species" => b.species, "hp" => b.hp, "totalhp" => b.totalhp, "status" => b.status,
    "item" => b.item_id, "stages" => stages, "speed" => b.pbSpeed }
end

def apply_setup(battle, op)
  b = battle.battlers[op[1]] if op[1].is_a?(Integer)
  case op[0]
  when "hp" then b.hp = op[2]
  when "hpFraction" then b.hp = [b.totalhp * op[2] / op[3], 1].max
  when "status" then b.status = op[2].to_sym
  when "stage" then b.stages[op[2].to_sym] = op[3]
  when "effect" then b.effects[PBEffects.const_get(op[2])] = op[3]
  when "pp"
    b.moves[op[2]].pp = op[3]
    b.pokemon.moves[op[2]].pp = op[3]
  when "terrain" then battle.field.terrain = op[1].to_sym
  end
end

def run_scenario(sc, start)
  random = SeqRandom.new(start)
  log = []
  scene = Battle::DebugSceneNoLogging.new
  scene.define_singleton_method(:pbDisplayMessage) { |msg, _brief = false| log << msg }
  # (the debug scene's `alias pbDisplay pbDisplayMessage` still points at the
  # original: the party screen checks show their messages through it)
  scene.define_singleton_method(:pbDisplay) { |msg, _brief = false| log << msg }
  scene.define_singleton_method(:pbDisplayPausedMessage) { |msg| log << msg }
  scene.define_singleton_method(:pbDisplayConfirmMessage) { |msg| log << msg; true }
  # The debug scene picks replacements with Kernel#rand: use the SeqRandom too
  scene.define_singleton_method(:rand) { |x = 0| random.next(x) }
  p1 = sc["p1"].map { |s| make_pokemon(s) }
  p2 = sc["p2"].map { |s| make_pokemon(s) }
  battle = Battle.new(scene, p1, p2, $player, nil)
  battle.setBattleMode("double") if sc["double"]
  battle.internalBattle = true
  battle.expGain = false
  battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
  battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
  scene.pbStartBattle(battle)
  battle.pbSetUpSides
  (sc["setup"] || []).each { |op| apply_setup(battle, op) }
  rounds = []
  snapshot = lambda do |error = nil|
    r = { "messages" => log.dup, "battlers" => battle.battlers.compact.map { |b| battler_state(b) },
          "decision" => battle.decision }
    r["error"] = error if error
    r["error"] ||= $exceptions.join(",") if !$exceptions.empty?
    $exceptions.clear
    rounds << r
    log.clear
  end
  begin
    battle.pbOnAllBattlersEnteringBattle
    snapshot.call
    sc["turns"].each do |turn|
      break if battle.decision > 0
      turn.each_with_index do |(idx_move, idx_target), i|
        b = battle.battlers[i]
        next if !b || b.fainted?
        next if !battle.pbCanShowCommands?(i)
        battle.pbClearChoice(i)
        next if !battle.pbRegisterMove(i, idx_move, false)
        move = battle.choices[i][2]
        if move.pbTarget(b).num_targets == 1
          idx_target ||= battle.battlers.each_index.find { |j| battle.battlers[j] && b.opposes?(j) }
          battle.pbRegisterTarget(i, idx_target)
        end
      end
      battle.pbAttackPhase
      battle.pbEndOfRoundPhase if battle.decision == 0
      battle.instance_variable_set(:@turnCount, battle.turnCount + 1)
      snapshot.call
    end
  rescue StandardError => e
    $stderr.puts "#{sc['name']}: #{e.class}: #{e.message}\n  #{e.backtrace.first(4).join("\n  ")}"
    snapshot.call(e.class.name)
  end
  rounds
end

out = { "scenarios" => [] }
SCENARIOS.each_with_index do |sc, i|
  start = sc["randomStart"] || i * 1000
  out["scenarios"] << sc.merge("randomStart" => start, "rounds" => run_scenario(sc, start))
end

#===============================================================================
# Exp. and EV gain with Lucky Egg, Macho Brace and the Power items
#===============================================================================
EXP_CASES = [
  # gainer, lvl, item, defeated, lvl
  [:CYNDAQUIL, 10, :LUCKYEGG, :PIDGEY, 9],
  [:BAYLEEF, 20, :MACHOBRACE, :GEODUDE, 18],
  [:CROCONAW, 25, :POWERBRACER, :ZUBAT, 22],
  [:CROCONAW, 25, :POWERWEIGHT, :ZUBAT, 22],
  [:CROCONAW, 25, :POWERANKLET, :ZUBAT, 22],
  [:CROCONAW, 25, nil, :ZUBAT, 22],
]
out["exp"] = EXP_CASES.map do |g, gl, item, d, dl|
  gainer = make_pokemon({ "species" => g.to_s, "level" => gl, "item" => item&.to_s })
  gainer.exp = gainer.growth_rate.minimum_exp_for_level(gl)
  defeated = make_pokemon({ "species" => d.to_s, "level" => dl })
  scene = Battle::DebugSceneNoLogging.new
  battle = Battle.new(scene, [gainer], [defeated], $player, nil)
  battle.internalBattle = true
  scene.pbStartBattle(battle)
  battle.pbSetUpSides
  battle.battlers[1].participants = [0]
  before = gainer.exp
  $game_map = MAP_STUB
  battle.pbGainExpOne(0, battle.battlers[1], 1, [], false, false)
  battle.pbGainEVsOne(0, battle.battlers[1])
  $game_map = nil
  { "gainer" => g, "gainerLevel" => gl, "item" => item, "defeated" => d, "defeatedLevel" => dl,
    "expGained" => gainer.exp - before, "evs" => gainer.ev }
end

path = File.join(ROOT, "web", "src", "battle", "items", "heldItemsReference.json")
File.write(path, JSON.pretty_generate(out) + "\n")
puts "Wrote #{path}"
