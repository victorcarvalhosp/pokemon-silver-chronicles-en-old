// ZUD Mechanics' Max Raids and Dynamax Adventures against the game's own Ruby
// (raidReference.json.gz, written by web/tools/ruby-ref/raid_reference.rb):
// 1. raid battles (raid_scenarios.json): shields and their thresholds, the KO
//    counter, the timer, the boss's waves, Max Moves and extra strikes, Cheer,
//    raid immunities, the raid capture and storing what's caught; round by
//    round, messages/animations and state, set up exactly as in the script;
// 2. generation with scripted random numbers: raid ranks and banlist, species
//    lists, movelists, rewards, generate_foe, pbApplyBattleRules' raid
//    branch, the Dynamax Adventure's lair species and rentals.
//
//   cd web && ruby tools/ruby-ref/raid_reference.rb   # regenerate
//   npx vitest run src/battle/zud/raid/raidReference.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Scripted Kernel#rand for the generation part (raw % n while a case's rolls are on).
const script = vi.hoisted(() => ({ on: false, rolls: [] as number[], used: 0 }));
vi.mock("../../../core/random", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../core/random")>();
  const next = () => {
    if (script.rolls.length === 0) throw new Error("out of scripted rolls");
    script.used += 1;
    return script.rolls.shift()!;
  };
  return {
    ...real,
    random: () => (script.on ? next() / 2 ** 30 : real.random()),
    rand: (n: number) => (script.on ? (n > 0 ? next() % n : next() / 2 ** 30) : real.rand(n)),
  };
});
// The raid capture's UI (Ruby's harness stubs the same): no waits, no fades, the Bag picks a Poké Ball.
vi.mock("../../../ui/scenes/frames", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../../ui/scenes/frames")>();
  return { ...orig, pbWait: async () => {} };
});
vi.mock("../../../ui/fades", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../../ui/fades")>();
  return { ...orig, pbFadeOutIn: async (block?: () => unknown) => { await block?.(); } };
});
vi.mock("../../../ui/bag/bag", () => ({
  PokemonBag_Scene: class {},
  PokemonBagScreen: class { async pbChooseItemScreen(): Promise<string> { return "POKEBALL"; } },
}));
vi.mock("../../../game/GameSystem", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../../game/GameSystem")>();
  return {
    ...orig, pbSEPlay: () => {}, pbBGMPlay: () => {}, pbBGMFade: () => {}, pbPlayDecisionSE: () => {},
    pbPlayCancelSE: () => {}, pbPlayCursorSE: () => {}, resolveAudio: () => null,
  };
});

import { loadAssetIndex } from "../../../core/assets";
import { GameData } from "../../../data/gameData";
import { pbGetRaidRank } from "../../../data/gameData/miscPBSData";
import { Settings } from "../../../data/gameData/settings";
import { loadGameDataForTests } from "../../../data/gameData/testing";
import { G, GameSwitches, GameTemp, GameVariables, PokemonGlobalMetadata } from "../../../game/globals";
import { PokemonBag } from "../../../game/items/PokemonBag";
import { Pokemon } from "../../../game/pokemon/Pokemon";
import { PokemonMove } from "../../../game/pokemon/PokemonMove";
import { GameStats } from "../../../game/trainer/GameStats";
import { Player } from "../../../game/trainer/Player";
import { pbApplyBattleRules } from "../../deluxe/Battle_Deluxe";
import { sym } from "../../deluxe/rubyData";
import { Battle, Battler, DebugSceneNoLogging, Move, PBEffects } from "../../index";
import { RaidBattle } from "./Raid_Battle";
import { DynamaxAdventure } from "../../../game/maxLair";
import { MaxRaidBattle, raidGenerateMovelists, raidRewards } from "../../../game/maxRaid/Raid_Setup";
import { raidGenerateBanlist, raidGenerateSpeciesList, raidGetEligibleSpecies, raidRankFromLevel,
  raidRanksAppearedIn } from "../../../game/maxRaid/Raid_Ranks";

type Spec = { sp?: string; lv?: number; m?: string[]; ab?: string; it?: string; gmax?: boolean; dlvl?: number; ivs?: number[] };
type Scenario = { name: string; p: Spec[]; boss: Spec; rules: Record<string, number | boolean>; turns: string[][] };
type Round = { label: string; log: string[]; state: unknown };
type BattleResult = { scenario: Scenario; seed: number; rounds: Round[]; error: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gen = Record<string, any>;

const REF = JSON.parse(gunzipSync(readFileSync(resolve(import.meta.dirname, "raidReference.json.gz"))).toString("utf8")) as
  { battles: BattleResult[]; gen: Gen };

class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

const STOP = { stopScenario: true };
let player: Player;
const stored: Pokemon[] = [];

function resetWorld(): void {
  G.gameTemp = new GameTemp();
  G.gameTemp.dxRules = {};
  G.gameTemp.dxPokemon = {};
  G.gameTemp.dxMidbattle = {};
  G.pokemonGlobal = new PokemonGlobalMetadata();
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  player.badges = Array(8).fill(true);
  G.player = player as never;
  G.bag = new PokemonBag();
  G.stats = new GameStats();
  stored.length = 0;
  // The PC (the Ruby harness's StorageStub).
  G.storage = { full: () => false, pbStoreCaught: (p: Pokemon) => { stored.push(p); return 0; }, boxes: [{ name: "Box 1" }] } as never;
  G.gameMap = { mapId: 0, events: new Map() } as never;
  // pbGetEnvironment on a map without metadata or terrain (the harness's :None).
  const noTerrain = () => ({ battleEnvironment: null });
  G.gamePlayer = { terrainTag: noTerrain, pbFacingTerrainTag: noTerrain } as never;
}

beforeAll(async () => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  G.gameSwitches = new GameSwitches();
  G.gameSwitches.set(Settings.CAN_DYNAMAX_WILD, true);
  G.gameSwitches.set(Settings.DYNAMAX_ANY_MAP, true);
  G.pokemonSystem.givenicknames = 1;
  // pbResolveBitmap: the game's Pokémon icons and battlebacks.
  const root = resolve(import.meta.dirname, "../../../../..");
  const files: string[] = [];
  for (const dir of ["Graphics/Pokemon/Icons", "Graphics/Battlebacks"]) {
    for (const f of readdirSync(join(root, dir))) files.push(`${dir}/${f}`.toLowerCase());
  }
  const fetch0 = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => files.flatMap((f) => [f, f.replace(/\.[a-z]+$/, "")]) })) as never;
  await loadAssetIndex();
  globalThis.fetch = fetch0;
  // pbGetSeason 0 and day time, as the Ruby harness stubs them.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0));
});
afterAll(() => { vi.useRealTimers(); });

//===============================================================================
// Scene that records what the battle shows (RecordingScene in the Ruby script)
//===============================================================================
class RecordingScene extends DebugSceneNoLogging {
  log: string[] = [];
  sprites = new Proxy({} as Record<string, { x: number; y: number }>, { get: () => ({ x: 0, y: 0 }) });

  override async pbDisplayMessage(msg: string): Promise<void> { this.log.push(msg); }
  override async pbDisplayPausedMessage(msg: string): Promise<void> { this.log.push(msg); }
  override async pbDisplayConfirmMessage(msg: string): Promise<boolean> { this.log.push(msg); return true; }
  override async pbShowCommands(msg: string): Promise<number> { this.log.push(`[commands] ${msg}`); return 0; }
  override async pbAnimation(moveID: string, user: Battler | null, targets: Battler | Battler[] | null, hitNum = 0): Promise<void> {
    const t = (Array.isArray(targets) ? targets : [targets]).filter((b): b is Battler => !!b).map((b) => b.index);
    this.log.push(`[anim] ${moveID} ${user ? user.index : "-"}>${t.join(",")} ${hitNum}`);
  }
  override async pbCommonAnimation(name: string | null, user: Battler | null = null): Promise<void> {
    this.log.push(`[common] ${name ?? ""} ${user ? user.index : "-"}`);
  }
  override async pbShowAbilitySplash(battler: Battler): Promise<void> { this.log.push(`[splash] ${battler.index}`); }
  override async pbFaintBattler(battler: Battler): Promise<void> { this.log.push(`[faint] ${battler.index}`); }
  override async pbRecall(idx: number): Promise<void> { this.log.push(`[recall] ${idx}`); }
  override async pbSendOutBattlers(sendOuts: [number, Pokemon][]): Promise<void> {
    this.log.push(`[sendout] ${sendOuts.map((s) => s[0]).join(",")}`);
  }
  override pbChangePokemon(idx: number | Battler, pkmn: Pokemon): void {
    const i = typeof idx === "number" ? idx : idx.index;
    this.log.push(`[change] ${i} ${pkmn.species} ${pkmn.form}${pkmn.dynamax ? " dmax" : ""}`);
  }
  pbCommonAnimationExists(_name: string): boolean { return false; }
  async pbShowZMove(idx: number, moveId: string): Promise<void> { this.log.push(`[zmove] ${idx} ${moveId}`); }
  async pbShowUltraBurst(idx: number): Promise<void> { this.log.push(`[ultraburst] ${idx}`); }
  async pbShowDynamax(idx: number): Promise<void> { this.log.push(`[dynamax] ${idx}`); }
  async pbRevertBattlerStart(idx: number): Promise<void> { this.log.push(`[revertstart] ${idx}`); }
  async pbRevertBattlerEnd(): Promise<void> { this.log.push("[revertend]"); }
  async pbRevertDynamax(idx: number, withForm = true): Promise<void> {
    this.log.push(`[revertdynamax] ${idx} ${withForm}`);
    const battler = this.battle!.battlers[idx]!;
    if (battler.isSpecies("ALCREMIE") && withForm) battler.form = battler.effects[PBEffects.NonGMaxForm] as number;
    const poke = (battler.effects[PBEffects.TransformPokemon] as Pokemon | null) ?? battler.displayPokemon()!;
    this.pbChangePokemon(battler, poke);
  }
  async pbDynamaxSendOut(idx: number): Promise<void> {
    this.log.push(`[dynamaxsendout] ${idx}`);
    this.battle!.battlers[idx]!.pokemon!.dynamax = true;
    await this.pbRevertDynamax(idx, false);
  }
  // ZUD Mechanics' Max Raid scene methods.
  async pbRaidShield(battler: Battler): Promise<void> {
    this.log.push(`[raidshield] ${battler.index} ${battler.effects[PBEffects.RaidShield]}/${battler.effects[PBEffects.MaxShieldHP]}`);
  }
  async pbWaveAttack(idx: number): Promise<void> { this.log.push(`[wave] ${idx}`); }
  // Catching.
  override async pbThrow(ball: string, shakes: number, critical: boolean, idx: number): Promise<void> {
    this.log.push(`[throw] ${ball} ${shakes} ${critical} ${idx}`);
  }
  override async pbThrowSuccess(): Promise<void> { this.log.push("[throwsuccess]"); }
  override async pbHideCaptureBall(idx: number): Promise<void> { this.log.push(`[hidecaptureball] ${idx}`); }
  override async pbThrowAndDeflect(ball: string, idx: number): Promise<void> { this.log.push(`[deflect] ${ball} ${idx}`); }
  override async pbShowPokedex(species: string): Promise<void> { this.log.push(`[pokedex] ${species}`); }
  async pbBattlerFlee(battler: Battler): Promise<void> { this.log.push(`[flee] ${battler.index}`); }

  override async pbPartyScreen(idxBattler: number, _canCancel = false, _mode = 0,
    callback?: (idxParty: number, scene: never) => Promise<boolean> | boolean): Promise<void> {
    const replacements: number[] = [];
    this.battle!.eachInTeamFromBattlerIndex(idxBattler, (_b, idxParty) => {
      if (!this.battle!.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    for (const i of replacements) if (await callback?.(i, this as never)) break;
  }
}

//===============================================================================
// Snapshots (Snap in the Ruby script)
//===============================================================================
/** Snap.ser (a Hash's falsy values read back as nil: Ruby's `v[k.to_sym] || v[k]`). */
function ser(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(ser);
  if (v instanceof Battler) return `battler:${v.index}`;
  if (v instanceof Pokemon) return `pkmn:${v.species}`;
  if (v instanceof Move) return `move:${v.id}`;
  if (v instanceof PokemonMove) return `pmove:${v.id}`;
  if (typeof v === "object") {
    if ("name" in v && v.constructor?.name === "Sym") return (v as { name: string }).name;
    if ("id" in v) return ser((v as { id: unknown }).id);
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k] === false || o[k] == null ? null : ser(o[k])]));
  }
  return `<${(v as object).constructor?.name}>`;
}

function sparse(arr: unknown[]): Record<string, unknown> {
  const ret: Record<string, unknown> = {};
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x == null || x === false || x === 0 || x === -1 || (Array.isArray(x) && x.length === 0)) continue;
    ret[String(i)] = ser(x);
  }
  return ret;
}

function snapBattler(b: Battler): unknown {
  return {
    species: b.species, form: b.form, hp: b.hp, totalhp: b.totalhp, status: b.status,
    ability: ser(b.abilityId), item: ser(b.itemId), level: b.level,
    stats: [b.attack, b.defense, b.spatk, b.spdef, b.speed],
    stages: Object.fromEntries(Object.entries(b.stages).filter(([, v]) => v !== 0).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))),
    effects: sparse(b.effects as unknown[]),
    moves: b.moves.map((m) => [m.id, m.pp]),
    baseMoves: b.baseMoves.map((m) => [m.id, m.pp]),
    dynamax: b.dynamax(), fainted: b.faintedProperly,
  };
}

function snapState(battle: Battle): unknown {
  const r = G.gameTemp.dxRules as Record<string, unknown>;
  return {
    turnCount: battle.turnCount, decision: battle.decision,
    battlers: battle.battlers.map((b) => (b ? snapBattler(b) : null)),
    sides: battle.sides.map((s) => sparse(s.effects as unknown[])),
    field: { weather: battle.field.weather, terrain: battle.field.terrain },
    dynamax: battle.dynamax,
    rules: { perfect_bonus: r.perfect_bonus ?? null, timer_bonus: r.timer_bonus ?? null,
      fairness_bonus: r.fairness_bonus ?? null, setcapture: r.setcapture ?? null },
    parties: [0, 1].map((side) => battle.pbParty(side).map((pk) =>
      (pk ? [pk.species, pk.hp, pk.totalhp, pk.status, pk.dynamax] : null))),
    stored: stored.map((p) => [p.species, p.level, p.hp, p.totalhp, p.dynamax, p.dynamaxLvl, p.moves.map((m) => m.id)]),
  };
}

//===============================================================================
// Scripted battles (RaidHarness in the Ruby script)
//===============================================================================
function makePokemon(spec: Spec, owner: Player): Pokemon {
  const pkmn = new Pokemon(spec.sp ?? "MEW", spec.lv ?? 40, owner as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = "HARDY";
  if (spec.ab) pkmn.ability = spec.ab;
  else pkmn.abilityIndex = 0;
  pkmn.item = spec.it ?? null;
  pkmn.makeMale();
  pkmn.moves = [];
  for (const m of spec.m ?? ["TACKLE"]) pkmn.learnMove(m);
  if (spec.gmax) pkmn.gmaxFactor = true;
  if (spec.dlvl != null) pkmn.dynamaxLvl = spec.dlvl;
  if (spec.ivs) GameData.Stat.eachMain().forEach((s, i) => { pkmn.iv[s.id] = spec.ivs![i]!; });
  pkmn.calcStats();
  return pkmn;
}

function makeBoss(spec: Spec): Pokemon {
  const pkmn = makePokemon(spec, player);
  pkmn.dynamax = true;
  pkmn.calcStats();
  pkmn.hp = pkmn.totalhp;
  pkmn.reversion = true;
  return pkmn;
}

function rulesFor(sc: Scenario): Record<string, unknown> {
  const r = sc.rules;
  const rules: Record<string, unknown> = {
    size: r.size, turns: r.turns, kocount: r.kocount, shield: r.shield, rank: r.rank, environ: "Cave", hard: r.hard,
    autoscale: false, simple: true, outcome: 1, canlose: true, noflee: true, noexp: true, nomoney: true, nocapture: true,
    nopartner: true,
  };
  if (!rules.hard) rules.setcapture = true;
  rules.timer_bonus = rules.turns;
  rules.perfect_bonus = true;
  rules.fairness_bonus = true;
  rules.introtext = "A Dynamaxed {1} emerged from within the den!";
  rules.raidcapture = ["{1} disappeared somewhere into the den...", "Battle Raid Capture"];
  return rules;
}

async function choose(battle: RaidBattle, idx: number, act: string | null | undefined): Promise<void> {
  act ??= "0";
  if (act === "ai") {
    await battle.battleAI.pbDefaultChooseEnemyCommand(idx);
    return;
  }
  if (act === "c") {
    battle.pbRegisterCheer(idx);
    return;
  }
  const m = /^(\d+)(d?)(?:>(\d+))?$/.exec(act);
  if (!m) throw new Error(`bad action ${act}`);
  const want = Number(m[1]);
  const user = battle.battlers[idx]!;
  if (m[2] === "d" && battle.pbCanDynamax(idx)) {
    battle.pbToggleRegisteredDynamax(idx);
    user.powerTrigger = true;
    user.displayPowerMoves("Max Move");
  }
  const order = [want, ...user.moves.map((_m, i) => i).filter((i) => i !== want)];
  let chosen: number | null = null;
  for (const i of order) {
    if (i < user.moves.length && await battle.pbRegisterMove(idx, i, false)) { chosen = i; break; }
  }
  if (chosen == null) {
    await battle.pbAutoChooseMove(idx, false);
    return;
  }
  const move = battle.choices[idx]![2] as Move;
  const targetData = move.pbTarget(user);
  if (targetData.numTargets !== 1) return;
  if (m[3] != null) {
    battle.pbRegisterTarget(idx, Number(m[3]));
  } else if (targetData.targetsFoe) {
    const foe = battle.allOtherSideBattlers(idx)[0];
    if (foe) battle.pbRegisterTarget(idx, foe.index);
  } else {
    const ally = battle.allSameSideBattlers(idx).find((b) => b.index !== idx);
    if (ally) battle.pbRegisterTarget(idx, ally.index);
  }
}

async function runScenario(sc: Scenario, seed: number): Promise<{ rounds: Round[]; error: string | null }> {
  resetWorld();
  G.bag.add("DYNAMAXBAND");
  G.bag.add("POKEBALL", 5);
  const rules = rulesFor(sc);
  G.gameTemp.dxRules = rules;
  const p1 = sc.p.map((s) => makePokemon(s, player));
  const boss = makeBoss(sc.boss);
  const scene = new RecordingScene();
  const battle = new RaidBattle(scene, p1, [boss], player, null);
  battle.setBattleMode(`${rules.size}v1`);
  battle.internalBattle = true;
  battle.showAnims = true;
  battle.canLose = true;
  battle.canRun = false;
  battle.expGain = false;
  battle.moneyGain = false;
  battle.disablePokeBalls = true;
  const random = new SeqRandom(seed);
  battle.pbRandom = (x: number) => random.next(x);
  battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  const rounds: Round[] = [];
  let error: string | null = null;
  const snap = (label: string) => {
    rounds.push({ label, log: [...scene.log], state: JSON.parse(JSON.stringify(snapState(battle))) });
    scene.log = [];
  };
  const b = battle as unknown as {
    pbCommandPhase(): Promise<void>; pbEndOfRoundPhase(): Promise<void>; pbEndOfBattle(): Promise<number>;
    pbClearChoice(i: number): void; pbCanShowCommands(i: number): boolean;
  };
  b.pbCommandPhase = async () => {
    if (battle.turnCount === 0) snap("start");
    battle.battlers.forEach((bt, i) => { if (bt && b.pbCanShowCommands(i)) b.pbClearChoice(i); });
    if (battle.turnCount >= sc.turns.length) throw STOP;
    const acts = sc.turns[battle.turnCount]!;
    for (let i = 0; i < battle.battlers.length; i++) {
      const bt = battle.battlers[i];
      if (!bt || battle.choices[i]![0] !== "None" || !b.pbCanShowCommands(i)) continue;
      await choose(battle, i, bt.opposes() ? "ai" : acts[Math.floor(i / 2)]);
    }
    snap(`commands ${battle.turnCount + 1}`);
  };
  const origEndOfRound = b.pbEndOfRoundPhase.bind(battle);
  b.pbEndOfRoundPhase = async () => {
    await origEndOfRound();
    snap(`round ${battle.turnCount + 1}`);
  };
  const origEndOfBattle = b.pbEndOfBattle.bind(battle);
  b.pbEndOfBattle = async () => {
    await origEndOfBattle();
    snap("end");
    return battle.decision;
  };
  try {
    await battle.pbStartBattle();
  } catch (e) {
    if (e !== STOP) {
      error = e instanceof Error ? `${e.name}: ${e.message} @ ${e.stack?.split("\n").slice(1, 4).join(" | ")}` : String(e);
      snap("error");
    }
  }
  return { rounds, error };
}

function firstDifference(a: unknown, b: unknown, path = ""): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: TS ${JSON.stringify(a)} vs Ruby ${JSON.stringify(b)}`;
}

describe("Max Raid battles vs Ruby (scripted)", () => {
  it.each(REF.battles.map((r) => [r.scenario.name, r] as const))("%s", async (_name, r) => {
    const got = await runScenario(r.scenario, r.seed);
    for (let i = 0; i < Math.max(got.rounds.length, r.rounds.length); i++) {
      const g = got.rounds[i];
      const w = r.rounds[i];
      const where = `${r.scenario.name}, ${w?.label ?? g?.label}`;
      expect(g?.label, `${where}: round label${got.error ? ` (TS error ${got.error})` : ""}`).toBe(w?.label);
      expect(g!.log, `${where}: messages`).toEqual(w!.log);
      const d = firstDifference(g!.state, w!.state);
      expect(d, `${where}: state`).toBeNull();
    }
    expect(got.error != null, `TS error: ${got.error} / Ruby error: ${r.error}`).toBe(r.error != null);
  });
});

//===============================================================================
// Generation
//===============================================================================
const symRandom = sym("random");
const ROLLS = Array.from({ length: 400 }, (_, i) => ((i * 2654435761) + 977) % (1 << 30));
function rollsFor(seed: number): number[] {
  const k = seed % ROLLS.length;
  return [...ROLLS.slice(k), ...ROLLS.slice(0, k)].slice(0, 300);
}
async function withRolls<T>(rolls: number[], fn: () => T | Promise<T>): Promise<T> {
  script.rolls = [...rolls];
  script.used = 0;
  script.on = true;
  try {
    return await fn();
  } finally {
    script.on = false;
  }
}

function pkmnInfo(p: Pokemon): unknown {
  return {
    species: p.species, form: p.form, level: p.level, gender: p.gender,
    ivs: GameData.Stat.eachMain().map((s) => p.iv[s.id]), evs: GameData.Stat.eachMain().map((s) => p.ev[s.id]),
    abilityIndex: p.abilityIndex, ability: p.abilityId, nature: p.natureId,
    moves: p.moves.map((m) => m.id), item: p.itemId, dynamaxLvl: p.dynamaxLvl,
    gmaxFactor: p.gmaxFactor, dynamax: p.dynamax, shiny: p.shiny, superShiny: p.superShiny,
    scale: p.scale, ribbons: [...p.ribbons], hp: p.hp, totalhp: p.totalhp,
    obtainText: p.obtainText, owner: [p.owner.name, p.owner.gender],
  };
}

describe("Max Raid generation vs Ruby", () => {
  const gen = REF.gen;
  beforeAll(() => { resetWorld(); });

  it("raid_ranks.dat and the banlist", () => {
    const r = pbGetRaidRank();
    expect({ ranks: r.ranks, total: r.total, banned: r.banned }).toEqual(gen.raidRanks);
    expect(raidGenerateBanlist()).toEqual(gen.banlist);
  });

  it("species lists, eligible species, ranks", () => {
    for (const c of gen.speciesLists) {
      expect(raidGenerateSpeciesList(c.params, c.rank, null, c.db), JSON.stringify([c.params, c.rank, c.db])).toEqual(c.list);
    }
    for (const [s, want] of gen.eligible) expect(raidGetEligibleSpecies(s), s).toBe(want);
    for (const [s, want] of gen.ranksAppearedIn) expect(raidRanksAppearedIn(s), s).toEqual(want);
    for (const [l, want] of gen.levelRank) expect(raidRankFromLevel(l), String(l)).toBe(want);
  });

  it("movelists", () => {
    for (const c of gen.movelists) expect(raidGenerateMovelists(c.species, c.rental), `${c.species} ${c.rental}`).toEqual(c.lists);
  });

  it("raid_Rewards", async () => {
    for (const c of gen.rewards) {
      const got = await withRolls(rollsFor(c.seed), () => raidRewards(c.species, c.rank, c.bonus));
      expect(got, `${c.species} ${c.rank} ${c.bonus}`).toEqual(c.rewards);
      expect(script.used, `${c.species}: random numbers used`).toBe(c.used);
    }
  });

  it("MaxRaidBattle.generate_foe", async () => {
    for (const c of gen.foes) {
      resetWorld();
      const pokemon: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(c.case.pokemon ?? {})) pokemon[k] = k === "form" && v === "random" ? symRandom : v;
      let boss: Pokemon | null = null;
      if (c.case.boss) boss = await withRolls(rollsFor(1000 + gen.foes.indexOf(c) * 53), () => makePokemon(c.case.boss, player));
      const where = JSON.stringify(c.case);
      let result: [Pokemon, number | null] | null = null;
      let error: string | null = null;
      try {
        result = await withRolls(rollsFor(c.seed), () =>
          MaxRaidBattle.generateFoe(boss ?? c.case.species ?? c.case.array, c.case.rank, pokemon));
      } catch (e) {
        error = String(e);
      }
      expect(error != null, `${where}: TS error ${error} / Ruby error ${c.error}`).toBe(c.error != null);
      if (!result) continue;
      const [pkmn, rank] = result;
      expect(pkmnInfo(pkmn), where).toEqual(c.pkmn);
      expect(rank, where).toBe(c.rank);
      const dx = { ...(G.gameTemp.dxPokemon as Record<string, unknown>) };
      delete dx.moves;
      expect(ser(dx), where).toEqual(c.dx);
      expect(script.used, `${where}: random numbers used`).toBe(c.used);
    }
  });

  it("pbApplyBattleRules' raid branch", () => {
    for (const c of gen.applyRules) {
      resetWorld();
      for (let i = 0; i < c.case.rules.size; i++) player.party.push(makePokemon({ sp: "PIKACHU", lv: 20 }, player));
      const rules = { ...c.case.rules };
      G.gameTemp.dxRules = rules;
      G.gameTemp.dxPokemon = { level: c.case.level, species: c.case.species ?? "PIKACHU" };
      pbApplyBattleRules(1, true);
      expect(ser(rules), JSON.stringify(c.case)).toEqual(c.rules);
      expect(G.pokemonGlobal.nextBattleBGM ?? null).toBe(c.bgm);
    }
  });

  it("Dynamax Adventure: lair species and rentals", async () => {
    for (const c of gen.adventure) {
      resetWorld();
      player.badges = [...Array(c.badges).fill(true), ...Array(8 - c.badges).fill(false)];
      const adv = new DynamaxAdventure();
      const [species, rentals] = await withRolls(rollsFor(c.seed), () => {
        if (c.badges === 8) adv.bossSpecies = "ZAPDOS";
        adv.generateSpecies();
        const sp = [...adv.lairSpecies];
        const r = [0, 1, 2].map(() => pkmnInfo(adv.generateRental()));
        adv.lastPokemon = new Pokemon("PIKACHU", 30);
        r.push(pkmnInfo(adv.generateRental()));
        return [sp, r] as const;
      });
      expect(species, `${c.badges} badges: species`).toEqual(c.species);
      expect(rentals, `${c.badges} badges: rentals`).toEqual(c.rentals);
      expect(script.used, `${c.badges} badges: random numbers used`).toBe(c.used);
    }
  });
});
