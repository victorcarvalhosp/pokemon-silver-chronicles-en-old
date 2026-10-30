// The scripted-battle harness shared by the differential battle tests
// (moveEffectsReference.test.ts, ../shadowBattleReference.test.ts): the TS side
// of MoveHarness / Snap / RecordingScene in web/tools/ruby-ref/move_effects_reference.rb.
// A test can extend it through `harnessHooks`, as the Ruby scripts reopen
// MoveHarness / Snap (see tools/ruby-ref/shadow_battle_reference.rb).
import { GameData } from "../../data/gameData";
import { G, type MapLike } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { NPCTrainer } from "../../game/trainer/Trainer";
import { Battle, Battler, DebugSceneNoLogging, Move } from "../index";
import "../items"; // the held item handlers (not imported by ../index yet)

export type Spec = { sp?: string; lv?: number; m?: string[]; g?: number; it?: string; ab?: string; st?: string; hp?: number;
  [extra: string]: unknown };
export type Scenario = { name: string; auto?: boolean; code?: string; double?: boolean; trainer?: boolean;
  p?: Spec[]; o?: Spec[]; turns: (string | null)[][] };
export type Round = { label: string; log: string[]; state: unknown };
export type Result = { scenario: Scenario; seed: number; rounds: Round[]; error: string | null };

const INERT_ABILITY = "HONEYGATHER";

/** Extension points (the Ruby scripts override MoveHarness.make_pokemon / choose and Snap.battler). */
export const harnessHooks: {
  /** Called after makePokemon built a Pokémon. */
  setupPokemon?(pkmn: Pokemon, spec: Spec, side: number): void;
  /** Registers an action the base harness doesn't know; returns true if it did. */
  choose?(battle: Battle, idx: number, act: string): Promise<boolean> | boolean;
  /** Extra fields of a battler's snapshot. */
  snapBattler?(b: Battler): Record<string, unknown>;
  /** Extra fields of the battle's snapshot. */
  snapState?(battle: Battle): Record<string, unknown>;
  /** Called with each scenario's random number source. */
  onRandom?(random: SeqRandom): void;
} = {};

/** battle_reference.rb's SeqRandom: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x. */
export class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

/** Thrown to end a scenario (not an Error, so the battle loop's logonerr lets it through). */
const STOP = { stopScenario: true };

export let player: Player;

/** The globals the battle code reads (beforeEach in the tests). */
export function resetHarnessGlobals(): void {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  player.badges = Array(8).fill(true); // every Pokémon obeys
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = { mapId: 0, events: new Map() } as MapLike; // level-up happiness reads $game_map.map_id
}

//===============================================================================
// Scene that records what the battle shows (RecordingScene in the Ruby script)
//===============================================================================
class RecordingScene extends DebugSceneNoLogging {
  log: string[] = [];

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

export function snapBattler(b: Battler): unknown {
  return {
    species: b.species, form: b.form, hp: b.hp, totalhp: b.totalhp,
    status: b.status, statusCount: b.statusCount, types: ser(b.pbTypes(true)),
    ability: ser(b.abilityId), item: ser(b.itemId), level: b.level,
    stats: [b.attack, b.defense, b.spatk, b.spdef, b.speed],
    stages: Object.fromEntries(Object.entries(b.stages).filter(([, v]) => v !== 0).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0))),
    effects: sparse(b.effects as unknown[]),
    moves: b.moves.map((m) => [m.id, m.pp, m.totalPp()]),
    lastMoveUsed: ser(b.lastMoveUsed), lastRegularMoveUsed: ser(b.lastRegularMoveUsed),
    lastHPLost: b.lastHPLost, lastMoveFailed: b.lastMoveFailed, turnCount: b.turnCount,
    pokemonIndex: b.pokemonIndex,
    ...harnessHooks.snapBattler?.(b),
  };
}

export function snapState(battle: Battle): unknown {
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
    parties: [0, 1].map((side) => battle.pbParty(side).map((pk) =>
      (pk ? [pk.species, pk.hp, pk.status, ser(pk.itemId), pk.level, pk.moves.map((m) => [m.id, m.pp])] : null))),
    ...harnessHooks.snapState?.(battle),
  };
}

//===============================================================================
// Scripted command phase (MoveHarness in the Ruby script)
//===============================================================================
export function makePokemon(spec: Spec, side: number): Pokemon {
  const pkmn = new Pokemon(spec.sp ?? "MEW", spec.lv ?? (side === 0 ? 40 : 42), player as never);
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
  pkmn.calcStats();
  if (spec.hp != null) pkmn.hp = Math.max(Math.floor(pkmn.totalhp * spec.hp), 1);
  if (spec.st) pkmn.status = spec.st;
  if (spec.st === "SLEEP") pkmn.statusCount = 3;
  harnessHooks.setupPokemon?.(pkmn, spec, side);
  return pkmn;
}

export async function choose(battle: Battle, idx: number, act: string | null | undefined): Promise<void> {
  act ??= "0";
  if (harnessHooks.choose && await harnessHooks.choose(battle, idx, act)) return;
  if (act.startsWith("s")) {
    const idxParty = Number(act.slice(1));
    if (battle.pbCanSwitch(idx, idxParty) && battle.pbRegisterSwitch(idx, idxParty)) return;
    act = "0";
  }
  const [wantStr, tgt] = act.split(">");
  const want = Number(wantStr);
  const user = battle.battlers[idx]!;
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

export async function runScenario(sc: Scenario, seed: number): Promise<{ rounds: Round[]; error: string | null }> {
  const p1 = (sc.p ?? [{}]).map((s) => makePokemon(s, 0));
  const p2 = (sc.o ?? [{}]).map((s) => makePokemon(s, 1));
  const scene = new RecordingScene();
  const opponent = sc.trainer ? [new NPCTrainer("Joey", GameData.TrainerType.keys()[0]!)] : null;
  const battle = new Battle(scene, p1, p2, player, opponent as never);
  if (sc.double) battle.setBattleMode("double");
  battle.internalBattle = true;
  battle.showAnims = true;
  const random = new SeqRandom(seed);
  harnessHooks.onRandom?.(random);
  battle.pbRandom = (x: number) => random.next(x);
  battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  // The first party member that can switch in (the AI's choice depends on the AI).
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
export function firstDifference(a: unknown, b: unknown, path = ""): string | null {
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

