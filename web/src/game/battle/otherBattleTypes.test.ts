// Battle Palace, Battle Arena and recorded battles against the game's own Ruby
// (otherBattleTypesReference.json, written by
// web/tools/ruby-ref/other_battle_types_reference.rb): whole battles with the
// same Pokémon, choices and random numbers, compared message by message, plus
// a recorded battle's record and its playback.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}
let seq = new SeqRandom();
// Essentials' top-level rand: Battle#pbRandom and the AI's pbAIRandom both use it.
vi.mock("../../core/random", () => ({
  rand: (n: number) => seq.next(n),
  random: () => 0,
  seedRandom: () => {},
}));

const { GameData } = await import("../../data/gameData");
const { loadGameDataForTests } = await import("../../data/gameData/testing");
const { DebugSceneNoLogging } = await import("../../battle");
type PartyScreenCallback = import("../../battle/BattleSceneInterface").PartyScreenCallback;
const { PBDebug } = await import("../../battle/other/PBDebug");
const { G, GameVariables } = await import("../globals");
const { PokemonBag } = await import("../items/PokemonBag");
const { Pokemon } = await import("../pokemon/Pokemon");
const { PokemonStorage } = await import("../pokemon/PokemonStorage");
const { GameStats } = await import("../trainer/GameStats");
const { Player } = await import("../trainer/Player");
const { NPCTrainer } = await import("../trainer/Trainer");
const { BattlePalaceBattle } = await import("./battlePalace");
const { BattleArenaBattle } = await import("./battleArena");
const { RecordedBattle, PlaybackBattle } = await import("./recordedBattle");
const ref = (await import("./otherBattleTypesReference.json")).default;

type Battle = InstanceType<typeof import("../../battle").Battle>;
type Battler = NonNullable<Battle["battlers"][number]>;
type PokemonT = InstanceType<typeof Pokemon>;
type MonSpec = { s: string; n: string; m: string[]; l: number };
type Choice = number | string | null;
type Scenario = { name: string; kind: string; seed: number; turns: number; choices?: Choice[][]; p1: MonSpec[]; p2: MonSpec[] };

let player: InstanceType<typeof Player>;
let log: string[] = [];
let errors: string[] = [];

function snapshot(battle: Battle, label: string): void {
  log.push(`== ${label}`);
  battle.battlers.forEach((b, i) => {
    if (!b || !b.pokemon) return;
    log.push(`#${i} ${b.species} hp=${b.hp}/${b.totalhp} st=${b.status}${b.fainted() ? " FAINTED" : ""}`);
  });
}

/** other_battle_types_reference.rb's LogScene. */
class LogScene extends DebugSceneNoLogging {
  constructor(private turns: number) { super(); }
  get b(): Battle { return this.battle! as Battle; }
  override async pbBeginCommandPhase(): Promise<void> {
    snapshot(this.b, `round ${this.b.turnCount + 1}`);
    if (this.b.turnCount >= this.turns) this.b.pbAbort();
  }
  override async pbDisplayMessage(msg: string): Promise<void> { log.push(msg); }
  override async pbDisplayPausedMessage(msg: string): Promise<void> { log.push(msg); }
  override async pbDisplayConfirmMessage(msg: string): Promise<boolean> { log.push(`[confirm] ${msg}`); return true; }
  override async pbShowAbilitySplash(battler: Battler): Promise<void> { log.push(`[splash] ${battler.pbThis()}`); }
  override async pbSendOutBattlers(sendOuts: [number, PokemonT][]): Promise<void> {
    for (const [idx, pkmn] of sendOuts) log.push(`[sendout] ${idx}: ${pkmn.name}`);
  }
  override async pbRecall(idxBattler: number): Promise<void> { log.push(`[recall] ${idxBattler}`); }
  override async pbPartyScreen(idxBattler: number, _canCancel = false, _mode = 0, callback?: PartyScreenCallback): Promise<void> {
    const replacements: number[] = [];
    this.b.eachInTeamFromBattlerIndex(idxBattler, (_p, idxParty) => {
      if (!this.b.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    for (const idxParty of replacements) if (await callback?.(idxParty, this as never)) break;
  }
  override async pbFaintBattler(battler: Battler): Promise<void> { log.push(`[faint] ${battler.pbThis()}`); }
  override pbBattleArenaBattlers(b1: Battler, b2: Battler): void { log.push(`[arena] ${b1.name} VS ${b2.name}`); }
  override pbBattleArenaJudgment(b1: Battler, b2: Battler, r1: number[], r2: number[]): void {
    log.push(`[judgment] ${b1.name} [${r1.join(", ")}] ${b2.name} [${r2.join(", ")}]`);
  }
  override async pbEndBattle(result: number): Promise<void> { snapshot(this.b, `end decision=${result}`); }
}

function makePokemon(spec: MonSpec): PokemonT {
  const pkmn = new Pokemon(spec.s, spec.l ?? 50, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = spec.n;
  pkmn.ability = "HONEYGATHER";
  pkmn.item = null;
  pkmn.gender = 0;
  pkmn.moves = [];
  for (const m of spec.m) pkmn.learnMove(m);
  pkmn.calcStats();
  return pkmn;
}

async function registerChoice(battle: Battle, idx: number, choice: Choice | undefined): Promise<void> {
  if (typeof choice === "string" && choice.startsWith("s")) {
    if (battle.pbCanSwitch(idx, Number(choice.slice(1)))) {
      battle.pbRegisterSwitch(idx, Number(choice.slice(1)));
      return;
    }
    log.push(`[can't switch] ${idx}`);
    choice = 0;
  }
  const b = battle.battlers[idx]!;
  if (!await battle.pbRegisterMove(idx, (choice as number | null | undefined) ?? 0, false)) {
    await battle.pbAutoChooseMove(idx);
    return;
  }
  if (battle.choices[idx]![0] !== "UseMove") return;
  const move = battle.choices[idx]![2] as { pbTarget(b: Battler): { numTargets: number } };
  if (move.pbTarget(b).numTargets === 1) battle.pbRegisterTarget(idx, 1 - idx);
}

function firstAble(battle: Battle, idx: number): number {
  let ret = -1;
  battle.eachInTeamFromBattlerIndex(idx, (_pkmn, i) => {
    if (ret < 0 && battle.pbCanSwitchLax(idx, i)) ret = i;
  });
  return ret;
}

async function run(sc: Scenario, make: (scene: LogScene, p1: PokemonT[], p2: PokemonT[], t: unknown) => Battle, isPlayback = false) {
  log = [];
  errors = [];
  seq = new SeqRandom(sc.seed);
  const p1 = sc.p1.map(makePokemon);
  const p2 = sc.p2.map(makePokemon);
  const scene = new LogScene(sc.turns);
  const t = new NPCTrainer("Joey", "YOUNGSTER");
  t.party = p2;
  const battle = make(scene, p1, p2, t);
  if (!isPlayback) battle.internalBattle = true;
  battle.expGain = false;
  battle.moneyGain = false;
  battle.controlPlayer = true;
  const ai = battle.battleAI;
  if (sc.kind === "palace") {
    ai.pbDefaultChooseEnemyCommand = async (idx: number) => {
      if (await ai.pbEnemyShouldWithdraw(idx)) return;
      await battle.pbAutoFightMenu(idx);
    };
  } else {
    ai.pbDefaultChooseEnemyCommand = async (idx: number) => {
      await registerChoice(battle, idx, (sc.choices![battle.turnCount] ?? [])[idx]);
    };
  }
  ai.pbDefaultChooseNewEnemy = (idx: number) => firstAble(battle, idx);
  let decision: number;
  try {
    decision = await battle.pbStartBattle();
  } catch (e) {
    log.push("[fatal]");
    errors.push(String((e as Error).stack ?? e));
    decision = -1;
  }
  return { battle, result: { decision, log, errors } };
}

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  for (let i = 0; i < 8; i++) player.badges[i] = true;
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = null;
  PBDebug.continueOnError = true;
  PBDebug.sink = (msg: string) => {
    if (msg.startsWith("**Exception: ")) {
      log.push("[exception]");
      errors.push(msg);
    }
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const scenarios = ref as unknown as (Scenario & { decision: number; log: string[]; errors: string[];
  record?: { type: number; rounds: unknown[]; switches: number[]; randomCount: number };
  playback?: { decision: number; log: string[]; errors: string[] } })[];

describe("Battle Palace vs Ruby", () => {
  for (const sc of scenarios.filter((s) => s.kind === "palace")) {
    it(sc.name, async () => {
      const { result } = await run(sc, (scene, p1, p2, t) => new BattlePalaceBattle(scene as never, p1, p2, player, [t] as never));
      expect(result).toEqual({ decision: sc.decision, log: sc.log, errors: [] });
    });
  }
});

describe("Battle Arena vs Ruby", () => {
  for (const sc of scenarios.filter((s) => s.kind === "arena")) {
    it(sc.name, async () => {
      const { result } = await run(sc, (scene, p1, p2, t) => new BattleArenaBattle(scene as never, p1, p2, player, [t] as never));
      expect(result).toEqual({ decision: sc.decision, log: sc.log, errors: [] });
    });
  }
});

describe("recorded battles vs Ruby", () => {
  for (const sc of scenarios.filter((s) => s.kind === "recorded")) {
    it(`${sc.name}: records like Ruby and plays back the same battle`, async () => {
      const { battle, result } = await run(sc, (scene, p1, p2, t) => new RecordedBattle(scene as never, p1, p2, player, [t] as never));
      expect(result).toEqual({ decision: sc.decision, log: sc.log, errors: [] });
      const record = JSON.parse((battle as unknown as InstanceType<typeof RecordedBattle>).pbDumpRecord());
      expect({ type: record[0], rounds: record[2], switches: record[4], randomCount: record[3].length }).toEqual(sc.record);
      const { result: playback } = await run(sc, (scene) => new PlaybackBattle(scene, record), true);
      expect(playback).toEqual(sc.playback);
    });
  }
});
