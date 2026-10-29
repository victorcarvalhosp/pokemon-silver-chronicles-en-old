// The Generation 9 Pack's and ZUD Mechanics' item handlers (Gen9_ItemHandlers.ts,
// Gen9_NewItemHandlers.ts, ZUD_Data_Item.ts) against the game's own Ruby:
// pluginItemsReference.json is written by web/tools/ruby-ref/plugin_items_reference.rb,
// which runs Essentials v20.1 + this game's plugins headless, with
// 013_Items/002 and 003 and then the plugins' item handlers in the game's
// load order. Each scenario carries its setup; this file builds the same
// state, stubs the same screens and compares:
// - "field": UseOnPokemon/UseInField (messages, return value, the party, the
//   Bag, the ZUD Game Stats), with the party screen, pbMessage/
//   pbConfirmMessage, the evolution scene, the Move Relearner and the party
//   screen Max Eggs opens stubbed as in the Ruby script;
// - "bag": CanUseInBattle/BattleUseOnPokemon/UseInBattle on a battle, with a
//   recording Bag scene;
// - "held": scripted battles with held items (as heldItems.test.ts).
// The Hopo Berry's battle use copies ETHER's 003_Item_BattleEffects.rb
// handlers (Item_BattleEffects.ts), so those scenarios depend on that port.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameTemp, GameVariables, type MapLike } from "../../game/globals";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import { setItemEvolutionSceneHook, setMessageHook, setTopRightWindowHook } from "../../game/items/itemUtilities";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { triggerBattleUseOnPokemon, triggerCanUseInBattle, triggerUseInBattle } from "../battle/Battle_ActionUseItem";
import type { PartyScreenCallback } from "../BattleSceneInterface";
import { Battle, type Battler, DebugSceneNoLogging, PBEffects } from "../index";
import "./index";
import ref from "./pluginItemsReference.json";

// The screens the handlers import on demand (Max Eggs' party screen and fade,
// Max Scales' Move Relearner), as the Ruby script stubs them.
const stubs = vi.hoisted(() => ({
  PartyScreen: null as unknown as new () => object,
  relearn: null as unknown as (pkmn: unknown) => Promise<boolean>,
}));
vi.mock("../../ui/fades", () => ({ pbFadeOutIn: async (fn: () => unknown) => { await fn(); } }));
vi.mock("../../ui/party/party", () => ({
  PokemonParty_Scene: class {},
  PokemonPartyScreen: class { constructor() { return new stubs.PartyScreen(); } },
}));
vi.mock("../../ui/party/fieldSkills", () => ({
  FieldSkillHooks: { relearnMoveScreen: (pkmn: unknown) => stubs.relearn(pkmn) },
}));

const INERT_ABILITY = "HONEYGATHER";

interface MonSpec {
  species: Id; level?: number; form?: number; abilityIndex?: number; ability?: Id; item?: Id | null;
  moves?: (Id | [Id, number?])[]; iv?: number | Record<Id, number>; status?: Id; hp?: number; egg?: boolean;
  dynamaxLvl?: number; gmaxFactor?: boolean; nature?: Id;
}
type Answers = { confirm: boolean[]; move: number[]; relearn: (Id | null)[] };
interface FieldSetup {
  name: string; action: [string, Id, number?]; party: MonSpec[]; target?: number; badges?: number;
  answers?: Partial<Answers>;
}
type SetupOp = (string | number)[];
interface BattleSetup {
  name: string; p1: MonSpec[]; p2: MonSpec[]; double?: boolean; setup?: SetupOp[]; randomStart: number;
}
interface BagSetup extends BattleSetup { action: [string, Id, ...unknown[]]; bag?: [Id, number][] }
type BattlerState = {
  index: number; species: string; hp: number; totalhp: number; status: string; item: string | null;
  stages: Record<string, number>; speed: number;
};
type Round = { messages: string[]; battlers: BattlerState[]; decision: number; error?: string };
interface HeldScenario extends BattleSetup { turns: number[][][]; rounds: Round[] }

const reference = ref as unknown as {
  field: { setup: FieldSetup; result: unknown }[];
  bag: { setup: BagSetup; result: unknown }[];
  held: HeldScenario[];
};

let log: unknown[][] = [];
let answers: Answers;
let player: Player;

function nextAnswer<K extends keyof Answers>(kind: K, dflt: Answers[K][number]): Answers[K][number] {
  const list = answers[kind];
  return list.length > 0 ? list.shift()! : dflt;
}

/** plugin_items_reference.rb's PokemonPartyScreen stub (UseOnPokemon's scene and Max Eggs' screen). */
class StubPartyScreen {
  async pbStartScene(helptext: string, _numBattlersOut: unknown): Promise<void> { log.push(["startScene", helptext]); }
  async pbEndScene(): Promise<void> { log.push(["endScene"]); }
  async pbDisplay(text: string): Promise<void> { log.push(["display", text]); }
  async pbConfirm(text: string): Promise<boolean> {
    const ret = nextAnswer("confirm", false);
    log.push(["sceneConfirm", text, ret]);
    return ret;
  }
  pbRefresh(): void { log.push(["refresh"]); }
  pbHardRefresh(): void { log.push(["hardRefresh"]); }
  pbRefreshSingle(i: number): void { log.push(["refreshSingle", i]); }
  pbUpdate(): void {}
  async pbChooseMove(_pkmn: Pokemon, helptext: string): Promise<number> {
    const ret = nextAnswer("move", 0);
    log.push(["chooseMove", helptext, ret]);
    return ret;
  }
  pbRefreshAnnotations(ableProc: (pkmn: Pokemon) => boolean): void {
    log.push(["refreshAnnotations", player.party.map((p) => !!ableProc(p))]);
  }
}

/** plugin_items_reference.rb's StubBagScene: the scene the battle-use handlers get. */
class StubBagScene {
  async pbDisplay(text: string): Promise<void> { log.push(["display", text]); }
  pbRefresh(): void { log.push(["refresh"]); }
}

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  setMessageHook(
    async (text) => { log.push(["msg", text]); return 0; },
    async (text) => {
      const ret = nextAnswer("confirm", false);
      log.push(["confirmMsg", text, ret]);
      return ret;
    },
  );
  setTopRightWindowHook(async (text) => { log.push(["topRight", text]); });
  setItemEvolutionSceneHook(async (pkmn, newSpecies, canCancel, after) => {
    log.push(["evolution", pkmn.species, newSpecies, canCancel]);
    await after();
  });
  stubs.PartyScreen = StubPartyScreen;
  stubs.relearn = async (p) => {
    const pkmn = p as Pokemon;
    const move = nextAnswer("relearn", null);
    log.push(["relearn", pkmn.name, move]);
    if (move) pkmn.learnMove(move);
    return move != null;
  };
});

/** plugin_items_reference.rb's new_player. */
function newPlayer(badges = 8): void {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  player.badges = new Array<boolean>(badges).fill(true);
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameTemp = new GameTemp();
  G.gameMap = null;
}

beforeEach(() => newPlayer());

/** plugin_items_reference.rb's build_pokemon. */
function buildPokemon(spec: MonSpec, battle = false): Pokemon {
  const pkmn = new Pokemon(spec.species, spec.level ?? 50, player as never);
  if (spec.form != null) pkmn.formSimple = spec.form;
  for (const s of GameData.Stat.eachMain()) {
    const iv = spec.iv;
    pkmn.iv[s.id] = typeof iv === "object" ? (iv[s.id] ?? 31) : (iv ?? 31);
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = spec.nature ?? "HARDY";
  pkmn.abilityIndex = spec.abilityIndex ?? 0;
  pkmn.ability = null;
  if (battle) pkmn.ability = spec.ability ?? INERT_ABILITY;
  pkmn.item = spec.item ?? null;
  if (spec.moves || battle) {
    pkmn.forgetAllMoves();
    (spec.moves ?? ["TACKLE"]).forEach((m, i) => {
      const [id, pp] = Array.isArray(m) ? m : [m, undefined];
      pkmn.learnMove(id);
      if (pp != null) pkmn.moves[i]!.pp = pp;
    });
  }
  if (spec.dynamaxLvl != null) pkmn.dynamaxLvl = spec.dynamaxLvl;
  if (spec.gmaxFactor != null) pkmn.gmaxFactor = spec.gmaxFactor;
  pkmn.calcStats();
  if (spec.hp != null) pkmn.hp = spec.hp;
  if (spec.status) pkmn.status = spec.status;
  if (spec.egg) pkmn.stepsToHatch = 1;
  return pkmn;
}

function pokemonState(pkmn: Pokemon) {
  return {
    species: pkmn.species, form: pkmn.formSimple, level: pkmn.level, exp: pkmn.exp,
    hp: pkmn.hp, totalhp: pkmn.totalhp, status: pkmn.status,
    iv: Object.fromEntries(GameData.Stat.eachMain().map((s) => [s.id, pkmn.iv[s.id]])),
    stats: [pkmn.attack, pkmn.defense, pkmn.spatk, pkmn.spdef, pkmn.speed],
    moves: pkmn.moves.map((m) => [m.id, m.pp]),
    ability: pkmn.ability?.id ?? null, abilityIndex: pkmn.abilityIndex,
    item: pkmn.itemId ?? null, dynamaxLvl: pkmn.dynamaxLvl, gmaxFactor: pkmn.gmaxFactor,
  };
}

const bagState = () => G.bag.pockets.flatMap((pocket) => (pocket ?? []).map((slot) => [slot[0], slot[1]]));

function resetLog(a: Partial<Answers> = {}): void {
  log = [];
  answers = { confirm: [...(a.confirm ?? [])], move: [...(a.move ?? [])], relearn: [...(a.relearn ?? [])] };
}

/** plugin_items_reference.rb's run_field. */
async function runField(sc: FieldSetup): Promise<unknown> {
  resetLog(sc.answers);
  newPlayer(sc.badges ?? 8);
  G.gameMap = { mapId: 5, events: new Map() } as MapLike; // level-up happiness reads $game_map.map_id
  const party = sc.party.map((spec) => buildPokemon(spec));
  for (const p of party) player.party.push(p);
  const [kind, item, qty] = sc.action;
  let ret: unknown = null;
  if (kind === "UseOnPokemon") {
    ret = await ItemHandlers.triggerUseOnPokemon(item, qty!, party[sc.target ?? 0]!, new StubPartyScreen());
  } else if (kind === "UseInField") {
    ret = await ItemHandlers.triggerUseInField(item);
  }
  const stats = G.stats as GameStats;
  return {
    ret, log, party: party.map(pokemonState), bag: bagState(),
    stats: [stats.totalDynamaxLvlsGained, stats.totalGmaxFactorsGiven],
  };
}

/** battle_reference.rb's SeqRandom: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x. */
class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

function battlerState(b: Battler): BattlerState {
  const stages: Record<string, number> = {};
  for (const s of GameData.Stat.eachBattle()) stages[s.id] = b.stages[s.id]!;
  return {
    index: b.index, species: b.species, hp: b.hp, totalhp: b.totalhp, status: b.status,
    item: b.itemId, stages, speed: b.pbSpeed(),
  };
}

function applySetup(battle: Battle, op: SetupOp): void {
  const b = typeof op[1] === "number" ? battle.battlers[op[1]] : null;
  switch (op[0]) {
    case "hpFraction": b!.hp = Math.max(Math.floor(b!.totalhp * (op[2] as number) / (op[3] as number)), 1); break;
    case "status": b!.status = op[2] as string; break;
    case "stage": b!.stages[op[2] as string] = op[3] as number; break;
    case "effect": b!.effects[(PBEffects as unknown as Record<string, number>)[op[2] as string]!] = op[3]; break;
    case "pp":
      b!.moves[op[2] as number]!.pp = op[3] as number;
      b!.pokemon!.moves[op[2] as number]!.pp = op[3] as number;
      break;
    case "partyStatus": battle.pbParty(0)[op[1] as number]!.status = op[2] as string; break;
    case "zMove": battle.zMove[op[1] as number]![op[2] as number] = op[3] as number; break;
    case "dynamaxUsage": battle.dynamax[op[1] as number]![op[2] as number] = op[3] as number; break;
  }
}

/** plugin_items_reference.rb's new_battle. */
async function newBattle(sc: BattleSetup, random: SeqRandom, battleLog: string[]): Promise<Battle> {
  const scene = new DebugSceneNoLogging();
  scene.pbDisplayMessage = async (msg: string) => { battleLog.push(msg); };
  scene.pbDisplay = async (msg: string) => { battleLog.push(msg); };
  scene.pbDisplayPausedMessage = async (msg: string) => { battleLog.push(msg); };
  scene.pbDisplayConfirmMessage = async (msg: string) => { battleLog.push(msg); return true; };
  const p1 = sc.p1.map((s) => buildPokemon(s, true));
  const p2 = sc.p2.map((s) => buildPokemon(s, true));
  const battle = new Battle(scene, p1, p2, player, null);
  // DebugSceneNoLogging#pbPartyScreen with the SeqRandom instead of Kernel#rand
  scene.pbPartyScreen = async (idxBattler: number, _canCancel = false, _mode = 0,
    callback?: PartyScreenCallback): Promise<void> => {
    const replacements: number[] = [];
    battle.eachInTeamFromBattlerIndex(idxBattler, (_b, idxParty) => {
      if (!battle.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    if (replacements.length === 0) return;
    for (let i = 0; i < 50; i++) {
      if (await callback?.(replacements[random.next(replacements.length)]!, scene)) break;
    }
  };
  if (sc.double) battle.setBattleMode("double");
  battle.internalBattle = true;
  battle.expGain = false;
  battle.pbRandom = (x: number) => random.next(x);
  battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  return battle;
}

/** plugin_items_reference.rb's run_bag. */
async function runBag(sc: BagSetup): Promise<unknown> {
  const random = new SeqRandom(sc.randomStart);
  const battleLog: string[] = [];
  resetLog();
  for (const [item, qty] of sc.bag ?? []) G.bag.add(item, qty);
  const battle = await newBattle(sc, random, battleLog);
  for (const op of sc.setup ?? []) applySetup(battle, op);
  const scene = new StubBagScene();
  const [kind, item, ...args] = sc.action;
  let ret = false;
  if (kind === "CanUseInBattle") {
    const [idxParty, onField, move, firstAction, showMessages] = args as [number, boolean, number | null, boolean, boolean];
    const pkmn = battle.pbParty(0)[idxParty]!;
    const battler = onField ? battle.pbFindBattler(idxParty, 0) : null;
    ret = await triggerCanUseInBattle(item, pkmn, battler, move, firstAction, battle, scene, showMessages);
  } else if (kind === "BattleUseOnPokemon") {
    const [idxParty, onField, move] = args as [number, boolean, number | null];
    const pkmn = battle.pbParty(0)[idxParty]!;
    const battler = onField ? battle.pbFindBattler(idxParty, 0) : null;
    ret = await triggerBattleUseOnPokemon(item, pkmn, battler, ["UseItem", item, idxParty, move] as never, scene);
  } else if (kind === "UseInBattle") {
    await triggerUseInBattle(item, battle.battlers[args[0] as number]!, battle);
    ret = true; // Ruby: triggerUseInBattle returns the handler's (truthy) result
  }
  return {
    ret, log, battleLog,
    battlers: battle.battlers.filter((b): b is Battler => !!b).map(battlerState),
    party: battle.pbParty(0).map((p) => [p!.status, p!.moves.map((m) => m.pp)]),
    zMove: battle.zMove, dynamax: battle.dynamax,
  };
}

/** plugin_items_reference.rb's run_held (held_items_reference.rb's run_scenario). */
async function runHeld(sc: HeldScenario): Promise<Round[]> {
  const random = new SeqRandom(sc.randomStart);
  const log: string[] = [];
  const battle = await newBattle(sc, random, log);
  for (const op of sc.setup ?? []) applySetup(battle, op);
  const rounds: Round[] = [];
  const snapshot = (error?: string): void => {
    const r: Round = {
      messages: [...log], battlers: battle.battlers.filter((b): b is Battler => !!b).map(battlerState),
      decision: battle.decision,
    };
    if (error) r.error = error;
    rounds.push(r);
    log.length = 0;
  };
  await battle.pbOnAllBattlersEnteringBattle();
  snapshot();
  for (const turn of sc.turns) {
    if (battle.decision > 0) break;
    for (const [i, [idxMove, idxTargetIn]] of turn.entries()) {
      const b = battle.battlers[i];
      if (!b || b.fainted()) continue;
      if (!battle.pbCanShowCommands(i)) continue;
      battle.pbClearChoice(i);
      if (!(await battle.pbRegisterMove(i, idxMove!, false))) continue;
      const move = battle.choices[i]![2] as { pbTarget(b: Battler): { numTargets: number } };
      if (move.pbTarget(b).numTargets === 1) {
        const idxTarget = idxTargetIn ?? battle.battlers.findIndex((ob) => !!ob && b.opposes(ob.index));
        battle.pbRegisterTarget(i, idxTarget);
      }
    }
    await battle.pbAttackPhase();
    if (battle.decision === 0) await battle.pbEndOfRoundPhase();
    battle.turnCount += 1;
    snapshot();
  }
  return rounds;
}

describe("plugin item handlers vs Ruby", () => {
  it("has a reference for every scenario", () => {
    expect(reference.field.length).toBeGreaterThan(50);
    for (const s of [...reference.field, ...reference.bag]) {
      expect((s.result as { error?: string }).error, s.setup.name).toBeUndefined();
    }
    for (const s of reference.held) for (const r of s.rounds) expect(r.error, s.name).toBeUndefined();
  });

  describe("field use", () => {
    for (const s of reference.field) {
      it(s.setup.name, async () => {
        expect(await runField(s.setup)).toEqual(s.result);
      });
    }
  });

  describe("battle use from the Bag", () => {
    for (const s of reference.bag) {
      it(s.setup.name, async () => {
        expect(await runBag(s.setup)).toEqual(s.result);
      });
    }
  });

  describe("held items", () => {
    for (const sc of reference.held) {
      it(sc.name, async () => {
        const rounds = await runHeld(sc);
        expect(rounds.length, sc.name).toBe(sc.rounds.length);
        for (let i = 0; i < rounds.length; i++) {
          expect(rounds[i], `${sc.name}, round ${i}`).toEqual(sc.rounds[i]);
        }
      });
    }
  });
});
