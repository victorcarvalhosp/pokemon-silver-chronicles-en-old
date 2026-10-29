# Runs the game's real Ruby battle code (see essentials.rb) plus
# Data/Scripts/013_Items/003_Item_BattleEffects.rb on scripted battles where
# the player uses items from the Bag, and writes
# web/src/battle/items/battleItemsReference.json, which
# web/src/battle/items/battleItems.test.ts replays against the TypeScript port
# (battle/items/Item_BattleEffects.ts).
#
#   cd web && ruby tools/ruby-ref/battle_items_reference.rb
#
# Built like held_items_reference.rb: each scenario is plain data (written
# into the JSON so the TS test sets up exactly the same battle). A round is:
# for each battler, either register a move (pbRegisterMove + pbRegisterTarget)
# or use an item through Battle#pbItemMenu (the command phase's Bag code: the
# scene's pbItemMenu yields the chosen item, target and move once, with the
# battle scene as the item scene, so CanUseInBattle's messages are recorded);
# then pbAttackPhase (pbAttackPhaseItems uses the items) and
# pbEndOfRoundPhase. "checks" call ItemHandlers.triggerCanUseInBattle /
# triggerUseInBattle directly after the switch-in phase (for cases the Bag
# can't reach, like a trainer battle). After the switch-in phase and after
# each round the script records every message shown, each battler's HP,
# stages, status, effects and PP, the player's party, the Bag quantities, the
# caught Pokémon and the battle's decision. Randomness is battle_reference.rb's
# counter-based SeqRandom (same formula on both sides).
#
# Only 003_Item_BattleEffects.rb is loaded on top of essentials.rb (which
# loads 001_Item_Utilities.rb and the Generation 9 Pack's [004] Items before
# it, so the core handlers registered here replace the Gen 9 Pack's AWAKENING,
# POKEFLUTE and ICEHEAL). The TS side has the Gen 9 Pack's handlers on top:
# the scenarios only use these items in ways the Gen 9 Pack doesn't change
# (sleep, not Drowsy, for the Poké Flute).

require "json"
require_relative "essentials"

Essentials.load!(verbose: true)
Essentials.eval_file(File.join(SCRIPTS, "013_Items/003_Item_BattleEffects.rb"), failures = [])
raise failures.join("\n") if !failures.empty?

#===============================================================================
# Globals the battle code reads (as in held_items_reference.rb)
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
# changeHappiness reads $game_map.map_id (Pokémon here are obtained on map 0);
# Pikachu's form handler reads its metadata
class MapStub
  def map_id; 0; end
  def metadata; GameData::MapMetadata.try_get(0); end
end
$game_map       = MapStub.new
$PokemonGlobal  = nil
$player         = Player.new("Gold", GameData::TrainerType.keys.first)
$player.id      = 12_345_678
$player.badges  = [true] * 8 # so that no Pokémon disobeys
$bag            = PokemonBag.new
$stats          = GameStats.new

INERT_ABILITY = :HONEYGATHER

class Battle::DebugSceneNoLogging
  def pbDeluxeTriggers(*_a); end
  # Battle::Scene methods the capture code calls (not in the debug scene)
  def pbThrow(*_a); end
  def pbThrowSuccess(*_a); end
  def pbHideCaptureBall(*_a); end
  def pbThrowAndDeflect(*_a); end
end

# Item#is_snag_ball? reads $player.has_snag_machine, defined (false until the
# player gets a Snag Machine) in 016_UI/022_UI_PurifyChamber.rb, which
# essentials.rb doesn't load; the TS port treats it as false.
class Player
  def has_snag_machine; false; end
end

class Battle::Battler
  def shadowPokemon?; false; end
  def inHyperMode?; false; end
  def pbHyperMode; end
  def pbHyperModeObedience(_move); true; end
end

$exceptions = []
def pbPrintException(e)
  $exceptions << e.class.name
  $stderr.puts "#{e.class}: #{e.message}\n  #{e.backtrace.first(5).join("\n  ")}" if ENV["VERBOSE"]
end

class Battle::Move
  def rand(x = 0); @battle.pbRandom(x); end
end

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
  pkmn.item = nil
  pkmn.forget_all_moves
  (spec["moves"] || ["TACKLE"]).each { |m| pkmn.learn_move(m.to_sym) }
  pkmn.calc_stats
  pkmn
end

#===============================================================================
# Scenarios. Battler indices: 0 (and 2) = player's side, 1 (and 3) = foe.
# Turn entries are per battler: [moveIndex] / [moveIndex, targetIndex], or
# ["item", ITEM, idxPkmn, idxMove, firstAction] (idxPkmn defaults to what the
# Bag picks for the item's battle use: the battler's party index for 1-3, the
# only foe for 4, the battler for 5; idxMove to -1; firstAction to true).
# Setup ops: ["hp", i, value] / ["hpFraction", i, num, den] / ["status", i, s] /
# ["sleep", i, turns] / ["stage", i, stat, value] / ["effect", i, name, value] /
# ["pp", i, moveIndex, value] / ["partyHp", idxParty, value] /
# ["partyPP", idxParty, moveIndex, value] / ["battle", attribute, value].
# Checks: ["canUse", ITEM, idxBattler, idxParty, move, firstAction] /
# ["use", ITEM, idxBattler]. "trainer" makes p2 a trainer's party.
#===============================================================================
def mon(species, moves, level: 50, **rest)
  { "species" => species, "level" => level, "moves" => moves }.merge(rest.transform_keys(&:to_s))
end

def item(id, idx_pkmn = nil, idx_move = nil, first_action = nil)
  ["item", id, idx_pkmn, idx_move, first_action]
end

SPLASH = [0].freeze

SCENARIOS = [
  { "name" => "Super Potion on a hurt battler, Potion at full HP",
    "p1" => [mon("SNORLAX", ["TACKLE"])],
    "p2" => [mon("MAGIKARP", ["SPLASH"])],
    "bag" => { "POTION" => 2, "SUPERPOTION" => 1 },
    "setup" => [["hpFraction", 0, 9, 10]],
    "turns" => [[item("SUPERPOTION"), SPLASH], [item("POTION"), SPLASH]] },
  { "name" => "Potion, Hyper Potion, Fresh Water, Moomoo Milk, Max Potion while taking damage",
    "p1" => [mon("SNORLAX", ["SPLASH"])],
    "p2" => [mon("RATTATA", ["TACKLE"], level: 20)],
    "bag" => { "POTION" => 1, "HYPERPOTION" => 1, "MAXPOTION" => 1, "MOOMOOMILK" => 1, "FRESHWATER" => 1 },
    "setup" => [["hpFraction", 0, 1, 10]],
    "turns" => [[item("POTION"), [0]], [item("HYPERPOTION"), [0]], [item("FRESHWATER"), [0]],
                [item("MOOMOOMILK"), [0]], [item("MAXPOTION"), [0]]] },
  { "name" => "Oran Berry and Sitrus Berry from the Bag",
    "p1" => [mon("SNORLAX", ["SPLASH"])],
    "p2" => [mon("MAGIKARP", ["SPLASH"])],
    "bag" => { "ORANBERRY" => 1, "SITRUSBERRY" => 1 },
    "setup" => [["hpFraction", 0, 1, 3]],
    "turns" => [[item("ORANBERRY"), SPLASH], [item("SITRUSBERRY"), SPLASH]] },
  { "name" => "Antidote, Antidote with no poison, Paralyze Heal, Burn Heal",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["TOXIC", "THUNDERWAVE", "WILLOWISP", "SPLASH"])],
    "bag" => { "ANTIDOTE" => 2, "PARALYZEHEAL" => 1, "BURNHEAL" => 1 },
    "turns" => [[[0], [0]], [item("ANTIDOTE"), [3]], [item("ANTIDOTE"), [1]], [item("PARALYZEHEAL"), [2]],
                [item("BURNHEAL"), [3]]] },
  { "name" => "Full Heal on confusion, Full Heal with nothing to heal",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => { "FULLHEAL" => 2 },
    "setup" => [["effect", 0, "Confusion", 3], ["status", 0, "POISON"]],
    "turns" => [[item("FULLHEAL"), SPLASH], [item("FULLHEAL"), SPLASH]] },
  { "name" => "Full Restore: hurt and burned, full HP and paralysed, nothing to heal",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => { "FULLRESTORE" => 3 },
    "setup" => [["hpFraction", 0, 1, 4], ["status", 0, "BURN"], ["effect", 0, "Confusion", 2]],
    "turns" => [[item("FULLRESTORE"), SPLASH], [item("FULLRESTORE"), SPLASH], [item("FULLRESTORE"), SPLASH]],
    "setupBeforeTurn" => { "1" => [["status", 0, "PARALYSIS"]] } },
  { "name" => "Heal Powder and Energy Root (happiness)",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => { "HEALPOWDER" => 1, "ENERGYROOT" => 1, "ENERGYPOWDER" => 1 },
    "setup" => [["status", 0, "POISON"], ["hpFraction", 0, 1, 10]],
    "turns" => [[item("HEALPOWDER"), SPLASH], [item("ENERGYROOT"), SPLASH], [item("ENERGYPOWDER"), SPLASH]] },
  { "name" => "Revive and Max Revive on fainted party members, Revive on an able one",
    "p1" => [mon("SNORLAX", ["SPLASH"]), mon("PIKACHU", ["TACKLE"]), mon("JOLTEON", ["TACKLE"])],
    "p2" => [mon("MAGIKARP", ["SPLASH"])],
    "bag" => { "REVIVE" => 2, "MAXREVIVE" => 1 },
    "setup" => [["partyHp", 1, 0], ["partyHp", 2, 0]],
    "turns" => [[item("REVIVE", 1), SPLASH], [item("MAXREVIVE", 2), SPLASH], [item("REVIVE", 1), SPLASH]] },
  { "name" => "Ether, Max Ether, Elixir, Max Elixir, Ether on a full move",
    "p1" => [mon("MEW", ["TACKLE", "PSYCHIC", "FLAMETHROWER", "SPLASH"])],
    "p2" => [mon("MAGIKARP", ["SPLASH"])],
    "bag" => { "ETHER" => 2, "MAXETHER" => 1, "ELIXIR" => 1, "MAXELIXIR" => 1 },
    "setup" => [["pp", 0, 0, 1], ["pp", 0, 1, 0], ["pp", 0, 2, 3], ["pp", 0, 3, 30]],
    "turns" => [[item("ETHER", nil, 0), SPLASH], [item("MAXETHER", nil, 1), SPLASH], [item("ELIXIR"), SPLASH],
                [item("MAXELIXIR"), SPLASH], [item("ETHER", nil, 2), SPLASH]] },
  { "name" => "Max Elixir with nothing to restore",
    "p1" => [mon("MEW", ["TACKLE", "SPLASH"])],
    "p2" => [mon("MAGIKARP", ["SPLASH"])],
    "bag" => { "MAXELIXIR" => 1 },
    "turns" => [[item("MAXELIXIR"), SPLASH]] },
  { "name" => "X Attack until it has no effect, X Speed, X Accuracy",
    "p1" => [mon("MACHAMP", ["TACKLE"])],
    "p2" => [mon("SNORLAX", ["SPLASH"])],
    "bag" => { "XATTACK" => 4, "XSPEED" => 1, "XACCURACY" => 1 },
    "turns" => [[item("XATTACK"), SPLASH], [item("XATTACK"), SPLASH], [item("XATTACK"), SPLASH],
                [item("XATTACK"), SPLASH], [item("XSPEED"), SPLASH], [item("XACCURACY"), SPLASH], [[0], SPLASH]] },
  { "name" => "X Defense, X Sp. Atk, X Sp. Def, Max Mushrooms",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => { "XDEFENSE" => 1, "XSPATK" => 1, "XSPDEF" => 1, "MAXMUSHROOMS" => 1 },
    "setup" => [["stage", 0, "SPEED", 6]],
    "turns" => [[item("XDEFENSE"), SPLASH], [item("XSPATK"), SPLASH], [item("XSPDEF"), SPLASH],
                [item("MAXMUSHROOMS"), SPLASH]] },
  { "name" => "Dire Hit twice, Guard Spec. twice",
    "p1" => [mon("ABSOL", ["SLASH"])],
    "p2" => [mon("SNORLAX", ["SPLASH"])],
    "bag" => { "DIREHIT" => 2, "GUARDSPEC" => 2 },
    "turns" => [[item("DIREHIT"), SPLASH], [item("DIREHIT"), SPLASH], [item("GUARDSPEC"), SPLASH],
                [item("GUARDSPEC"), SPLASH], [[0], SPLASH]] },
  { "name" => "Red Flute, Yellow Flute, Persim Berry",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => { "REDFLUTE" => 1, "YELLOWFLUTE" => 1, "PERSIMBERRY" => 1 },
    "setup" => [["effect", 0, "Attract", 1], ["effect", 0, "Confusion", 4]],
    "turns" => [[item("REDFLUTE"), SPLASH], [item("YELLOWFLUTE"), SPLASH], [item("PERSIMBERRY"), SPLASH]] },
  { "name" => "Poké Flute with both asleep, then with no one asleep",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => {},
    "keyItems" => ["POKEFLUTE"],
    "setup" => [["sleep", 0, 3], ["sleep", 1, 3]],
    "turns" => [[item("POKEFLUTE"), SPLASH], [item("POKEFLUTE"), SPLASH]] },
  { "name" => "Poké Doll in a wild battle",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["TACKLE"])],
    "bag" => { "POKEDOLL" => 1 },
    "turns" => [[item("POKEDOLL"), [0]], [[0], [0]]] },
  { "name" => "Fluffy Tail when you can't run",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["TACKLE"])],
    "bag" => { "FLUFFYTAIL" => 1 },
    "setup" => [["battle", "canRun", false]],
    "turns" => [[item("FLUFFYTAIL"), [0]]] },
  { "name" => "Trainer battle: the Bag is refused, handlers called directly",
    "trainer" => true,
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("PIDGEY", ["TACKLE"])],
    "bag" => { "POKEBALL" => 1, "POKEDOLL" => 1 },
    "checks" => [["canUse", "POKEDOLL", 0, nil, -1, true], ["canUse", "POKEBALL", 1, nil, -1, true],
                 ["use", "POKEBALL", 1]],
    "turns" => [[item("POKEBALL"), [0]]] },
  { "name" => "Embargo stops a Potion",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => { "POTION" => 1, "XATTACK" => 1 },
    "setup" => [["hpFraction", 0, 1, 2], ["effect", 0, "Embargo", 3]],
    "turns" => [[item("POTION"), SPLASH], [item("XATTACK"), SPLASH]] },
  { "name" => "Poké Balls: Poké, Great, Ultra until caught",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("SNORLAX", ["SPLASH"])],
    "bag" => { "POKEBALL" => 3, "GREATBALL" => 3, "ULTRABALL" => 3 },
    "setup" => [["hpFraction", 1, 1, 5]],
    "turns" => [[item("POKEBALL"), SPLASH], [item("GREATBALL"), SPLASH], [item("ULTRABALL"), SPLASH],
                [item("POKEBALL"), SPLASH], [item("GREATBALL"), SPLASH], [item("ULTRABALL"), SPLASH],
                [item("ULTRABALL"), SPLASH], [item("ULTRABALL"), SPLASH]] },
  { "name" => "Poké Ball on a sleeping Rattata",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("RATTATA", ["TACKLE"], level: 5)],
    "bag" => { "POKEBALL" => 2 },
    "setup" => [["sleep", 1, 3]],
    "turns" => [[item("POKEBALL"), [0]], [item("POKEBALL"), [0]]] },
  { "name" => "Master Ball",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEWTWO", ["SPLASH"], level: 70)],
    "bag" => { "MASTERBALL" => 1 },
    "turns" => [[item("MASTERBALL"), SPLASH]] },
  { "name" => "Quick Ball on the first turn, then later",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("GOLEM", ["SPLASH"])],
    "bag" => { "QUICKBALL" => 4 },
    "turns" => [[item("QUICKBALL"), SPLASH], [item("QUICKBALL"), SPLASH], [item("QUICKBALL"), SPLASH],
                [item("QUICKBALL"), SPLASH]] },
  { "name" => "Timer Ball after many turns",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("SNORLAX", ["SPLASH"])],
    "bag" => { "TIMERBALL" => 3 },
    "turns" => [[[0], SPLASH]] * 8 + [[item("TIMERBALL"), SPLASH]] * 3 },
  { "name" => "Dusk Ball at night",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("GOLEM", ["SPLASH"])],
    "bag" => { "DUSKBALL" => 3 },
    "setup" => [["battle", "time", 2], ["hpFraction", 1, 1, 2]],
    "turns" => [[item("DUSKBALL"), SPLASH]] * 3 },
  { "name" => "Net Ball on a Water type",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("GYARADOS", ["SPLASH"])],
    "bag" => { "NETBALL" => 3 },
    "setup" => [["hpFraction", 1, 1, 3]],
    "turns" => [[item("NETBALL"), SPLASH]] * 3 },
  { "name" => "Poké Balls can't be thrown",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("MEW", ["SPLASH"])],
    "bag" => { "POKEBALL" => 1 },
    "setup" => [["battle", "disablePokeBalls", true]],
    "turns" => [[item("POKEBALL"), SPLASH]] },
  { "name" => "Poké Ball at a Pokémon that's not in sight",
    "p1" => [mon("MEW", ["SPLASH"])],
    "p2" => [mon("PIDGEOT", ["FLY"])],
    "bag" => { "POKEBALL" => 1 },
    "turns" => [[[0], [0, 0]], [item("POKEBALL"), [0, 0]]] },
  { "name" => "Lum Berry and Leppa Berry from the Bag",
    "p1" => [mon("MEW", ["TACKLE", "SPLASH"])],
    "p2" => [mon("MAGIKARP", ["SPLASH"])],
    "bag" => { "LUMBERRY" => 1, "LEPPABERRY" => 1 },
    "setup" => [["status", 0, "FROZEN"], ["pp", 0, 0, 2]],
    "turns" => [[item("LUMBERRY"), SPLASH], [item("LEPPABERRY", nil, 0), SPLASH]] },
  { "name" => "Poké Ball with a full party and full PC",
    "storageFull" => true,
    "p1" => [mon("MEW", ["SPLASH"]), mon("PIKACHU", ["SPLASH"]), mon("PIDGEY", ["SPLASH"]),
             mon("RATTATA", ["SPLASH"]), mon("ZUBAT", ["SPLASH"]), mon("GEODUDE", ["SPLASH"])],
    "p2" => [mon("MAGIKARP", ["SPLASH"])],
    "bag" => { "POKEBALL" => 1 },
    "turns" => [[item("POKEBALL"), SPLASH]] },
  { "name" => "Wild double battle: two Pokémon, and not focused",
    "double" => true,
    "p1" => [mon("MEW", ["SPLASH"]), mon("PIKACHU", ["SPLASH"])],
    "p2" => [mon("PIDGEY", ["SPLASH"]), mon("RATTATA", ["SPLASH"])],
    "bag" => { "POKEBALL" => 2, "POTION" => 1 },
    "setup" => [["hpFraction", 2, 1, 2]],
    "turns" => [[item("POKEBALL", 1), SPLASH, item("POKEBALL", 3, nil, false), SPLASH],
                [item("POTION", 1), SPLASH, [0], SPLASH]] },
]

#===============================================================================
# Running a scenario
#===============================================================================
def battler_state(b)
  stages = {}
  GameData::Stat.each_battle { |s| stages[s.id] = b.stages[s.id] }
  effects = {}
  %w[Confusion Attract FocusEnergy Embargo].each { |e| effects[e] = b.effects[PBEffects.const_get(e)] }
  { "index" => b.index, "species" => b.species, "hp" => b.hp, "totalhp" => b.totalhp, "status" => b.status,
    "stages" => stages, "effects" => effects, "pp" => b.moves.map(&:pp), "fainted" => b.fainted? }
end

def pokemon_state(p)
  { "species" => p.species, "hp" => p.hp, "status" => p.status, "pp" => p.moves.map(&:pp),
    "happiness" => p.happiness }
end

def apply_setup(battle, op)
  b = battle.battlers[op[1]] if op[1].is_a?(Integer)
  case op[0]
  when "hp" then b.hp = op[2]
  when "hpFraction" then b.hp = [b.totalhp * op[2] / op[3], 1].max
  when "status" then b.status = op[2].to_sym
  when "sleep"
    b.status = :SLEEP
    b.statusCount = op[2]
  when "stage" then b.stages[op[2].to_sym] = op[3]
  when "effect" then b.effects[PBEffects.const_get(op[2])] = op[3]
  when "pp"
    b.moves[op[2]].pp = op[3]
    b.pokemon.moves[op[2]].pp = op[3]
  when "partyHp" then battle.pbParty(0)[op[1]].hp = op[2]
  when "partyPP" then battle.pbParty(0)[op[1]].moves[op[2]].pp = op[3]
  when "battle" then battle.send("#{op[1]}=", op[2])
  end
end

def default_idx_pkmn(battle, idx_battler, use_type)
  case use_type
  when 1, 2, 3 then battle.battlers[idx_battler].pokemonIndex
  when 4 then battle.allOtherSideBattlers(idx_battler).first.index
  else idx_battler
  end
end

def run_scenario(sc, start)
  random = SeqRandom.new(start)
  log = []
  $bag = PokemonBag.new
  (sc["bag"] || {}).each { |id, qty| $bag.add(id.to_sym, qty) }
  (sc["keyItems"] || []).each { |id| $bag.add(id.to_sym, 1) }
  scene = Battle::DebugSceneNoLogging.new
  scene.define_singleton_method(:pbDisplayMessage) { |msg, _brief = false| log << msg }
  scene.define_singleton_method(:pbDisplay) { |msg, _brief = false| log << msg }
  scene.define_singleton_method(:pbDisplayPausedMessage) { |msg| log << msg }
  scene.define_singleton_method(:pbDisplayConfirmMessage) { |msg| log << msg; true }
  scene.define_singleton_method(:rand) { |x = 0| random.next(x) }
  # $PokemonStorage: only its full? is read (by the Poké Balls' CanUseInBattle)
  $PokemonStorage = Struct.new(:full) { def full?; full; end }.new(!!sc["storageFull"])
  p1 = sc["p1"].map { |s| make_pokemon(s) }
  p2 = sc["p2"].map { |s| make_pokemon(s) }
  # (party_full? is the player's own party, not the battle's)
  $player.party = sc["storageFull"] ? p1 : []
  opponent = sc["trainer"] ? [NPCTrainer.new("Joey", GameData::TrainerType.keys.first)] : nil
  battle = Battle.new(scene, p1, p2, $player, opponent)
  battle.setBattleMode("double") if sc["double"]
  battle.internalBattle = true
  battle.expGain = false
  battle.define_singleton_method(:pbRandom) { |x| random.next(x) }
  battle.battleAI.define_singleton_method(:pbAIRandom) { |x| random.next(x) }
  # The Bag: picks the scenario's item once (Battle::Scene#pbItemMenu yields
  # item, useType, idxPkmn, idxMove, itemScene)
  bag_choice = nil
  scene.define_singleton_method(:pbItemMenu) do |_idx_battler, _first_action, &block|
    block.call(*bag_choice, scene)
  end
  scene.pbStartBattle(battle)
  battle.pbSetUpSides
  (sc["setup"] || []).each { |op| apply_setup(battle, op) }
  rounds = []
  bag_items = (sc["bag"] || {}).keys + (sc["keyItems"] || [])
  snapshot = lambda do |extra = {}|
    r = { "messages" => log.dup, "battlers" => battle.battlers.compact.map { |b| battler_state(b) },
          "party" => battle.pbParty(0).map { |p| pokemon_state(p) },
          "bag" => bag_items.map { |id| [id, $bag.quantity(id.to_sym)] }.to_h,
          "mist" => battle.sides.map { |s| s.effects[PBEffects::Mist] },
          "caught" => battle.instance_variable_get(:@caughtPokemon).map { |p| [p.species, p.poke_ball] },
          "decision" => battle.decision }.merge(extra)
    r["error"] ||= $exceptions.join(",") if !$exceptions.empty?
    $exceptions.clear
    rounds << r
    log.clear
  end
  begin
    battle.pbOnAllBattlersEnteringBattle
    checks = (sc["checks"] || []).map do |op|
      case op[0]
      when "canUse"
        battler = op[2] ? battle.battlers[op[2]] : nil
        pkmn = op[3] ? battle.pbParty(0)[op[3]] : battler.pokemon
        ItemHandlers.triggerCanUseInBattle(op[1].to_sym, pkmn, battler, op[4], op[5], battle, scene, true)
      when "use"
        ItemHandlers.triggerUseInBattle(op[1].to_sym, battle.battlers[op[2]], battle)
        nil
      end
    end
    snapshot.call(sc["checks"] ? { "checks" => checks } : {})
    sc["turns"].each_with_index do |turn, t|
      break if battle.decision > 0
      ((sc["setupBeforeTurn"] || {})[t.to_s] || []).each { |op| apply_setup(battle, op) }
      menu = []
      turn.each_with_index do |entry, i|
        b = battle.battlers[i]
        next if !b || b.fainted?
        next if !battle.pbCanShowCommands?(i)
        battle.pbClearChoice(i)
        if entry[0] == "item"
          _, id, idx_pkmn, idx_move, first_action = entry
          use_type = GameData::Item.get(id.to_sym).battle_use
          idx_pkmn = default_idx_pkmn(battle, i, use_type) if idx_pkmn.nil?
          bag_choice = [id.to_sym, use_type, idx_pkmn, idx_move.nil? ? -1 : idx_move]
          menu << battle.pbItemMenu(i, first_action.nil? ? true : first_action)
          next
        end
        idx_move, idx_target = entry
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
      snapshot.call({ "itemMenu" => menu })
    end
  rescue StandardError => e
    $stderr.puts "#{sc['name']}: #{e.class}: #{e.message}\n  #{e.backtrace.first(6).join("\n  ")}"
    snapshot.call({ "error" => e.class.name })
  end
  rounds
end

out = { "scenarios" => [] }
SCENARIOS.each_with_index do |sc, i|
  start = sc["randomStart"] || i * 1000
  out["scenarios"] << sc.merge("randomStart" => start, "rounds" => run_scenario(sc, start))
end

path = File.join(ROOT, "web", "src", "battle", "items", "battleItemsReference.json")
File.write(path, JSON.pretty_generate(out) + "\n")
puts "Wrote #{path}"
