// The ability handlers against the game's own Ruby battle code: replays the
// scripted battles of abilityReference.json (written by
// web/tools/ruby-ref/ability_reference.rb, scenarios in ability_scenarios.rb)
// and compares the whole log: every message, ability splash, animation,
// send-out/recall/faint, and a snapshot of every battler (HP, status, stat
// stages, ability, item, types) and of the field (weather, terrain) at the
// start of each round and at the end of the battle.
//
// Setup mirrors the Ruby script exactly: same Pokémon (IVs 31, EVs 0), the
// player has all 8 badges, Exp./money gain off, both sides driven through the
// AI hooks (controlPlayer) with the scripted choices, and the same
// counter-based random stream for battle.pbRandom and the AI's pbAIRandom.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { NPCTrainer } from "../../game/trainer/Trainer";
import type { Id } from "../../data/gameData/gameData";
import type { PartyScreenCallback } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import { Battle, DebugSceneNoLogging } from "../index";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { ItemHandlerHash } from "../../game/items/ItemHandlers";
import ref from "./abilityReference.json";

type MonSpec = { s: string; l?: number; a: string; m?: string[]; i?: string; g?: number; hp?: [number, number];
  st?: string; sc?: number; n?: string; f?: number };
type Choice = number | [number, number] | string | null;
type Scenario = { name: string; p1: MonSpec[]; p2: MonSpec[]; turns: Choice[][]; double?: boolean;
  trainer?: boolean; seed?: number; items?: boolean; want?: string; decision: number; log: string[]; errors: string[] };

class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

let player: Player;
let log: string[] = [];

function snapshot(battle: Battle, label: string): void {
  log.push(`== ${label}`);
  battle.battlers.forEach((b, i) => {
    if (!b || !b.pokemon) return;
    const stg = Object.entries(b.stages).filter(([, v]) => v !== 0).map(([k, v]) => `${k}:${v}`).join(",");
    log.push(`#${i} ${b.species} hp=${b.hp}/${b.totalhp} st=${b.status}/${b.statusCount} ` +
      `stg=${stg} ab=${b.abilityId ?? "-"} it=${b.itemId ?? "-"} ` +
      `types=${b.pbTypes(true).join("/")}${b.fainted() ? " FAINTED" : ""}`);
  });
  for (let side = 0; side < 2; side++) { // Party members not in battle
    battle.pbParty(side).forEach((pkmn, i) => {
      if (!pkmn || battle.battlers.some((b) => b && b.pokemon === pkmn && b.index % 2 === side)) return;
      log.push(`party${side}[${i}] ${pkmn.species} hp=${pkmn.hp}/${pkmn.totalhp} st=${pkmn.status} ` +
        `ab=${pkmn.abilityId ?? "-"} it=${pkmn.itemId ?? "-"}`);
    });
  }
  const f = battle.field;
  log.push(`field w=${f.weather}/${f.weatherDuration} t=${f.terrain}/${f.terrainDuration}`);
}

/** ability_reference.rb's LogScene. */
class LogScene extends DebugSceneNoLogging {
  constructor(private turns: number) { super(); }
  get b(): Battle { return this.battle!; }
  override async pbBeginCommandPhase(): Promise<void> {
    snapshot(this.b, `round ${this.b.turnCount + 1}`);
    if (this.b.turnCount >= this.turns) this.b.pbAbort();
  }
  override async pbDisplayMessage(msg: string): Promise<void> { log.push(msg); }
  override async pbDisplayPausedMessage(msg: string): Promise<void> { log.push(msg); }
  override async pbDisplayConfirmMessage(msg: string): Promise<boolean> { log.push(`[confirm] ${msg}`); return true; }
  override async pbShowAbilitySplash(battler: Battler): Promise<void> {
    log.push(`[splash] ${battler.pbThis()}: ${battler.abilityName()}`);
  }
  override async pbReplaceAbilitySplash(battler: Battler): Promise<void> {
    log.push(`[resplash] ${battler.pbThis()}: ${battler.abilityName()}`);
  }
  override async pbHideAbilitySplash(battler: Battler): Promise<void> { log.push(`[/splash] ${battler.pbThis()}`); }
  override async pbCommonAnimation(animName: string): Promise<void> { log.push(`[anim] ${animName ?? ""}`); }
  override async pbAnimation(moveID: Id, _user: Battler | null, _targets: unknown, hitNum = 0): Promise<void> {
    log.push(`[move] ${moveID}/${hitNum}`);
  }
  override async pbSendOutBattlers(sendOuts: [number, Pokemon][]): Promise<void> {
    for (const [idx, pkmn] of sendOuts) log.push(`[sendout] ${idx}: ${pkmn.name}`);
  }
  override async pbRecall(idxBattler: number): Promise<void> { log.push(`[recall] ${idxBattler}`); }
  /** As in ability_reference.rb: the party slots in order (the debug scene picks at random). */
  override async pbPartyScreen(idxBattler: number, _canCancel = false, _mode = 0, callback?: PartyScreenCallback): Promise<void> {
    const replacements: number[] = [];
    this.b.eachInTeamFromBattlerIndex(idxBattler, (_p, idxParty) => {
      if (!this.b.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    for (const idxParty of replacements) if (await callback?.(idxParty, this)) break;
  }
  override pbChangePokemon(idxBattler: number | Battler, pkmn: Pokemon): void {
    const idx = typeof idxBattler === "number" ? idxBattler : idxBattler.index;
    log.push(`[change] ${idx}: ${pkmn.species}`);
  }
  override async pbFaintBattler(battler: Battler): Promise<void> { log.push(`[faint] ${battler.pbThis()}`); }
  override async pbEndBattle(result: number): Promise<void> { snapshot(this.b, `end decision=${result}`); }
}

function makePokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.s, spec.l ?? 50, player as never);
  if (spec.f != null) pkmn.formSimple = spec.f; // no form-change side effects (learning moves)
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = spec.n ?? "HARDY";
  pkmn.ability = spec.a;
  pkmn.item = spec.i ?? null;
  pkmn.gender = spec.g ?? 0;
  pkmn.moves = [];
  for (const m of spec.m ?? ["TACKLE"]) pkmn.learnMove(m);
  pkmn.calcStats();
  if (spec.hp) pkmn.hp = Math.max(Math.floor(pkmn.totalhp * spec.hp[0] / spec.hp[1]), 1);
  if (spec.st) {
    pkmn.status = spec.st;
    pkmn.statusCount = spec.sc ?? (spec.st === "SLEEP" ? 3 : 0);
  }
  return pkmn;
}

async function registerChoice(battle: Battle, idx: number, choice: Choice | undefined): Promise<void> {
  if (typeof choice === "string" && choice.startsWith("s")) { // Switch, if allowed (as the party menu checks)
    if (battle.pbCanSwitch(idx, Number(choice.slice(1)))) {
      battle.pbRegisterSwitch(idx, Number(choice.slice(1)));
      return;
    }
    log.push(`[can't switch] ${idx}`);
    choice = 0;
  } else if (choice === "r") { // Run (Battle#pbRunMenu); move 0 if running isn't possible at all
    if (await battle.pbRun(idx) !== 0) return;
    log.push(`[can't run] ${idx}`);
    choice = 0;
  }
  const [moveIdx, target0] = Array.isArray(choice) ? choice : [(choice as number | null | undefined) ?? 0, null];
  let target = target0;
  const b = battle.battlers[idx]!;
  if (!await battle.pbRegisterMove(idx, moveIdx, false)) {
    await battle.pbAutoChooseMove(idx);
    return;
  }
  if (battle.choices[idx]![0] !== "UseMove") return;
  const move = battle.choices[idx]![2] as { pbTarget(b: Battler): { numTargets: number } };
  if (move.pbTarget(b).numTargets === 1) {
    target ??= battle.pbSideSize(0) === 1 ? 1 - idx : (idx ^ 1);
    battle.pbRegisterTarget(idx, target);
  }
}

async function runScenario(sc: Scenario): Promise<{ decision: number; log: string[]; errors: string[] }> {
  log = [];
  const errors: string[] = [];
  PBDebug.sink = (msg) => {
    if (msg.startsWith("**Exception: ")) {
      log.push("[exception]");
      errors.push(msg);
      if (errors.length > 10) throw new Error("Too many exceptions"); // don't loop forever
    }
  };
  const p1 = sc.p1.map(makePokemon);
  const p2 = sc.p2.map(makePokemon);
  const scene = new LogScene(sc.turns.length);
  let opponent: NPCTrainer[] | null = null;
  if (sc.trainer) {
    const t = new NPCTrainer("Joey", GameData.TrainerType.keys()[0]!);
    t.party = p2;
    opponent = [t];
  }
  const battle = new Battle(scene, p1, p2, player, opponent as never);
  battle.setBattleMode(sc.double ? "double" : "single");
  battle.internalBattle = true;
  battle.expGain = false;
  battle.moneyGain = false;
  const random = new SeqRandom(sc.seed ?? 0);
  battle.pbRandom = (x: number) => random.next(x);
  const ai = battle.battleAI;
  ai.pbAIRandom = (x: number) => random.next(x);
  battle.controlPlayer = true;
  ai.pbDefaultChooseEnemyCommand = async (idx: number) => {
    await registerChoice(battle, idx, (sc.turns[battle.turnCount] ?? [])[idx]);
  };
  ai.pbDefaultChooseNewEnemy = (idx: number) => {
    let ret = -1;
    battle.eachInTeamFromBattlerIndex(idx, (_pkmn, i) => {
      if (ret < 0 && battle.pbCanSwitchLax(idx, i)) ret = i;
    });
    return ret;
  };
  let decision: number;
  try {
    decision = await battle.pbStartBattle();
  } catch (e) {
    log.push("[fatal]");
    errors.push(String((e as Error).stack ?? e));
    decision = -1;
  }
  return { decision, log, errors };
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
  PBDebug.continueOnError = true; // Ruby's PBDebug.logonerr logs the exception and carries on
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/**
 * Held items whose battle effects (web/src/battle/items, ported separately)
 * aren't registered yet: scenarios marked items: true (they depend on an
 * item's effect, e.g. a berry being eaten) are skipped until they are.
 */
function unportedItems(sc: Scenario): string[] {
  const hashes = Object.values(ItemEffects).filter((v): v is ItemHandlerHash =>
    v instanceof ItemHandlerHash);
  return [...sc.p1, ...sc.p2].map((m) => m.i).filter((i): i is string =>
    !!i && !hashes.some((h) => h.get(i) != null));
}

describe("ability handlers vs Ruby", () => {
  for (const sc of ref as Scenario[]) {
    it.skipIf(!!sc.items && unportedItems(sc).length > 0)(sc.name, async () => {
      const got = await runScenario(sc);
      expect(got.log.join("\n"), got.errors.join("\n")).toBe(sc.log.join("\n"));
      expect(got.decision).toBe(sc.decision);
    });
  }
});
