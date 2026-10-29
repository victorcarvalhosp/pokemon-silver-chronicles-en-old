// ZUD Mechanics' battle side (Z-Moves, Ultra Burst, Dynamax/Gigantamax and
// every Power Move effect) against the game's own Ruby battle code: replays
// every scripted battle of zudReference.json.gz (gzipped JSON, written by
// web/tools/ruby-ref/zud_reference.rb, which runs Essentials v20.1 + this
// game's plugins headless) through the TypeScript port and compares, round by
// round (and after each command phase), the messages/animations/cinematics
// shown and the battle state (HP and Dynamax HP, Dynamax turns, every
// battler/side/position/field effect, the moves each battler shows with their
// power/category/class, base moves, the registered mechanics, both parties).
// The battle is set up and scripted exactly as in that script.
//
//   cd web && ruby tools/ruby-ref/zud_reference.rb   # regenerate
//   npx vitest run src/battle/zud/zudReference.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import { Settings } from "../../data/gameData/settings";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameSwitches, GameVariables, type MapLike } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { NPCTrainer } from "../../game/trainer/Trainer";
import { Battle, Battler, DebugSceneNoLogging, Move, PBEffects } from "../index";
import { PowerMove } from "./Battle_PowerMove";

type Spec = { sp?: string; lv?: number; m?: string[]; g?: number; it?: string; ab?: string; st?: string; hp?: number;
  form?: number; gmax?: boolean; dlvl?: number };
type Scenario = { name: string; double?: boolean; trainer?: boolean; trainerType?: string; trainerItems?: string[];
  battlescene?: number; bag?: string[]; p?: Spec[]; o?: Spec[]; turns: (string | null)[][] };
type Round = { label: string; log: string[]; state: unknown };
type Result = { scenario: Scenario; seed: number; rounds: Round[]; error: string | null };

const RESULTS = JSON.parse(gunzipSync(readFileSync(resolve(import.meta.dirname, "zudReference.json.gz"))).toString("utf8")) as Result[];
const INERT_ABILITY = "HONEYGATHER";

/** battle_reference.rb's SeqRandom: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x. */
class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

/** Thrown to end a scenario (not an Error, so the battle loop's logonerr lets it through). */
const STOP = { stopScenario: true };

let player: Player;

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  player.badges = Array(8).fill(true); // every Pokémon obeys
  G.player = player as never;
  G.storage = new PokemonStorage();
  G.gameMap = { mapId: 0, events: new Map() } as MapLike;
  // The harness's switches: Dynamax in wild battles and on any map.
  G.gameSwitches = new GameSwitches();
  G.gameSwitches.set(Settings.CAN_DYNAMAX_WILD, true);
  G.gameSwitches.set(Settings.DYNAMAX_ANY_MAP, true);
});

//===============================================================================
// Scene that records what the battle shows (RecordingScene in the Ruby script)
//===============================================================================
class RecordingScene extends DebugSceneNoLogging {
  log: string[] = [];
  /** pbDynamax reads the battlers' sprite positions (Battle::Scene's @sprites). */
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
  override pbSwapBattlerSprites(idxA: number, idxB: number): void { this.log.push(`[swap] ${idxA} ${idxB}`); }
  override async pbSendOutBattlers(sendOuts: [number, Pokemon][]): Promise<void> {
    this.log.push(`[sendout] ${sendOuts.map((s) => s[0]).join(",")}`);
  }
  override pbChangePokemon(idx: number | Battler, pkmn: Pokemon): void {
    const i = typeof idx === "number" ? idx : idx.index;
    this.log.push(`[change] ${i} ${pkmn.species} ${pkmn.form}${pkmn.dynamax ? " dmax" : ""}`);
  }
  pbCommonAnimationExists(_name: string): boolean { return false; }

  // ZUD Mechanics' scene methods and Essentials Deluxe's reversion animation.
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
  async pbDynamaxSendOut(idx: number, _xpos: number, _ypos: number): Promise<void> {
    this.log.push(`[dynamaxsendout] ${idx}`);
    this.battle!.battlers[idx]!.pokemon!.dynamax = true;
    await this.pbRevertDynamax(idx, false);
  }

  /** The first party member that can be chosen (DebugSceneNoLogging picks one at random). */
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
// State snapshot (Snap in the Ruby script)
//===============================================================================
function ser(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(ser);
  if (v instanceof Battler) return `battler:${v.index}`;
  if (v instanceof Pokemon) return `pkmn:${v.species}`;
  if (v instanceof Move) return `move:${v.id}`;
  if (v instanceof PokemonMove) return `pmove:${v.id}`;
  if (typeof v === "object") {
    if ("id" in v) return ser((v as { id: unknown }).id);
    if (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, ser(o[k])]));
    }
  }
  return `<${(v as object).constructor?.name}>`;
}

/** Effects arrays without their "nothing" values (nil, false, 0, -1, []). */
function sparse(arr: unknown[]): Record<string, unknown> {
  const ret: Record<string, unknown> = {};
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x == null || x === false || x === 0 || x === -1 || (Array.isArray(x) && x.length === 0)) continue;
    ret[String(i)] = ser(x);
  }
  return ret;
}

function moveInfo(m: Move): unknown[] {
  return [m.id, m.name, m.baseDamage, m.category, m.type, m.constructor.name, m instanceof PowerMove,
    !!m.zmoveFlag, m.pp, m.totalPp()];
}

function snapBattler(b: Battler): unknown {
  return {
    species: b.species, form: b.form, hp: b.hp, totalhp: b.totalhp,
    status: b.status, statusCount: b.statusCount, types: ser(b.pbTypes(true)),
    ability: ser(b.abilityId), item: ser(b.itemId), level: b.level,
    stats: [b.attack, b.defense, b.spatk, b.spdef, b.speed],
    stages: Object.fromEntries(Object.entries(b.stages).filter(([, v]) => v !== 0).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))),
    effects: sparse(b.effects as unknown[]),
    moves: b.moves.map(moveInfo),
    baseMoves: b.baseMoves.map((m) => [m.id, m.pp]),
    lastMoveUsed: ser(b.lastMoveUsed), lastRegularMoveUsed: ser(b.lastRegularMoveUsed),
    lastHPLost: b.lastHPLost, lastMoveFailed: b.lastMoveFailed, turnCount: b.turnCount,
    pokemonIndex: b.pokemonIndex,
    dynamax: b.dynamax(), gmax: b.gmax(), ultra: b.ultra(),
    reverted: b.pokemon ? b.pokemon.reverted() : null, powerIndex: b.powerIndex, zmoveSelected: b.selectedMoveIsZMove,
    powerTrigger: b.powerTrigger, lastMoveUsedIsZMove: b.lastMoveUsedIsZMove,
  };
}

function snapState(battle: Battle): unknown {
  const st = G.stats;
  return {
    turnCount: battle.turnCount, decision: battle.decision,
    battlers: battle.battlers.map((b) => (b ? snapBattler(b) : null)),
    sides: battle.sides.map((s) => sparse(s.effects as unknown[])),
    positions: battle.positions.map((p) => (p ? sparse(p.effects as unknown[]) : null)),
    field: {
      effects: sparse(battle.field.effects as unknown[]), weather: battle.field.weather,
      weatherDuration: battle.field.weatherDuration, terrain: battle.field.terrain,
      terrainDuration: battle.field.terrainDuration,
    },
    mechanics: { zMove: battle.zMove, ultraBurst: battle.ultraBurst, dynamax: battle.dynamax },
    stats: [st.zmoveCount, st.statusZmoveCount, st.ultraBurstCount, st.dynamaxCount, st.gigantamaxCount],
    parties: [0, 1].map((side) => battle.pbParty(side).map((pk) =>
      (pk ? [pk.species, pk.form, pk.hp, pk.totalhp, pk.status, ser(pk.itemId), pk.level, pk.dynamax,
        pk.moves.map((m) => [m.id, m.pp])] : null))),
  };
}

//===============================================================================
// Scripted command phase (ZudHarness in the Ruby script)
//===============================================================================
function makePokemon(spec: Spec, side: number): Pokemon {
  const pkmn = new Pokemon(spec.sp ?? "MEW", spec.lv ?? (side === 0 ? 40 : 42), player as never);
  if (spec.form != null) pkmn.formSimple = spec.form; // no onSetForm (Necrozma would learn moves)
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = "HARDY";
  pkmn.ability = spec.ab ?? INERT_ABILITY;
  pkmn.item = spec.it ?? null;
  if ((spec.g ?? side) === 0) pkmn.makeMale(); else pkmn.makeFemale();
  pkmn.moves = [];
  for (const m of spec.m ?? ["TACKLE"]) pkmn.learnMove(m);
  if (spec.gmax) pkmn.gmaxFactor = true;
  if (spec.dlvl != null) pkmn.dynamaxLvl = spec.dlvl;
  pkmn.calcStats();
  if (spec.hp != null) pkmn.hp = Math.max(Math.floor(pkmn.totalhp * spec.hp), 1);
  if (spec.st) pkmn.status = spec.st;
  if (spec.st === "SLEEP") pkmn.statusCount = 3;
  return pkmn;
}

async function choose(battle: Battle, idx: number, act: string | null | undefined): Promise<void> {
  act ??= "0";
  if (act === "ai") {
    await battle.battleAI.pbDefaultChooseEnemyCommand(idx);
    return;
  }
  if (act.startsWith("s")) {
    const idxParty = Number(act.slice(1));
    if (battle.pbCanSwitch(idx, idxParty) && battle.pbRegisterSwitch(idx, idxParty)) return;
    act = "0";
  }
  const m = /^(\d+)([dzu]?)(?:>(\d+))?$/.exec(act);
  if (!m) throw new Error(`bad action ${act}`);
  const want = Number(m[1]);
  const mech = m[2];
  const tgt = m[3];
  const user = battle.battlers[idx]!;
  switch (mech) {
    case "d":
      if (battle.pbCanDynamax(idx)) {
        battle.pbToggleRegisteredDynamax(idx);
        user.powerTrigger = true;
        user.displayPowerMoves("Max Move");
      }
      break;
    case "z":
      if (battle.pbCanZMove(idx)) {
        battle.pbToggleRegisteredZMove(idx);
        user.powerTrigger = true;
        user.displayPowerMoves("Z-Move");
      }
      break;
    case "u":
      if (battle.pbCanUltraBurst(idx)) {
        battle.pbToggleRegisteredUltraBurst(idx);
        user.powerTrigger = true;
      }
      break;
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
  if (tgt != null) {
    battle.pbRegisterTarget(idx, Number(tgt));
  } else if (targetData.targetsFoe) {
    const foe = battle.allOtherSideBattlers(idx)[0];
    if (foe) battle.pbRegisterTarget(idx, foe.index);
  } else {
    const ally = battle.allSameSideBattlers(idx).find((b) => b.index !== idx);
    if (ally) battle.pbRegisterTarget(idx, ally.index);
  }
}

async function runScenario(sc: Scenario, seed: number): Promise<{ rounds: Round[]; error: string | null }> {
  G.stats = new GameStats();
  G.pokemonSystem.battlescene = sc.battlescene ?? 0;
  G.bag = new PokemonBag();
  for (const it of sc.bag ?? ["DYNAMAXBAND", "ZRING"]) G.bag.add(it);
  const p1 = (sc.p ?? [{}]).map((s) => makePokemon(s, 0));
  const p2 = (sc.o ?? [{}]).map((s) => makePokemon(s, 1));
  const scene = new RecordingScene();
  let opponent: NPCTrainer[] | null = null;
  if (sc.trainer) {
    const tr = new NPCTrainer("Joey", sc.trainerType ?? "LEADER_Falkner");
    tr.items = [...(sc.trainerItems ?? [])];
    opponent = [tr];
  }
  const battle = new Battle(scene, p1, p2, player, opponent as never);
  if (opponent) battle.items = [opponent[0]!.items]; // what pbTrainerBattle does
  if (sc.double) battle.setBattleMode("double");
  battle.internalBattle = true;
  battle.showAnims = true;
  const random = new SeqRandom(seed);
  battle.pbRandom = (x: number) => random.next(x);
  battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  battle.battleAI.pbDefaultChooseNewEnemy = (idxBattler: number) => {
    let ret = -1;
    battle.eachInTeamFromBattlerIndex(idxBattler, (_pk, i) => {
      if (ret < 0 && battle.pbCanSwitchLax(idxBattler, i)) ret = i;
    });
    return ret;
  };
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
      await choose(battle, i, acts[i]);
    }
    snap(`commands ${battle.turnCount + 1}`);
  };
  const origEndOfRound = b.pbEndOfRoundPhase.bind(battle);
  b.pbEndOfRoundPhase = async () => {
    await origEndOfRound();
    snap(`round ${battle.turnCount + 1}`);
  };
  b.pbEndOfBattle = async () => {
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

//===============================================================================
// Tests
//===============================================================================
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

describe("ZUD Mechanics vs Ruby (scripted battles)", () => {
  it.each(RESULTS.map((r) => [r.scenario.name, r] as const))("%s", async (_name, r) => {
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

describe("differential coverage", () => {
  /** Z-Moves no Pokémon can use in this game (Pikashunium Z's species list is "PIKACHU forms above 7", which don't exist). */
  const UNREACHABLE = ["TENMILLIONVOLTTHUNDERBOLT"];

  it("uses every Z-Move and Max Move in PBS (so every ZUD Power Move function code)", () => {
    const used = new Set<string>();
    for (const r of RESULTS) {
      for (const round of r.rounds) {
        for (const line of round.log) {
          const m = /^\[anim\] (\S+)/.exec(line);
          if (m) used.add(m[1]!);
        }
      }
    }
    const powerMoves = GameData.Move.each().filter((m) => m.powerMove()).map((m) => m.id);
    expect(powerMoves.length).toBeGreaterThan(80);
    expect(powerMoves.filter((id) => !used.has(id) && !UNREACHABLE.includes(id))).toEqual([]);
  });

  it("covers Dynamax, Gigantamax, Max Guard, Z-Moves, status Z-Moves, Ultra Burst and the AI", () => {
    const logs = RESULTS.flatMap((r) => r.rounds.flatMap((round) => round.log));
    for (const marker of ["[dynamax]", "[dynamaxsendout]", "[revertdynamax]", "[zmove]", "[ultraburst]",
      "using its Z-Power!", "couldn't fully protect itself!", "regained its true power with Ultra Burst!"]) {
      expect(logs.some((l) => l.includes(marker)), marker).toBe(true);
    }
  });
});
