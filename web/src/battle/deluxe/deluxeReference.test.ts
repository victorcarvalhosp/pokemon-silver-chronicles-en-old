// Essentials Deluxe's midbattle scripting and Mega Evolution / Primal
// Reversion against the game's own Ruby code: replays the scripted battles of
// deluxeReference.json (written by web/tools/ruby-ref/deluxe_reference.rb,
// scenarios in deluxe_scenarios.rb) and compares the whole log: every
// message, scene call (animations, send-outs, Pokémon changes, the midbattle
// speech visuals and choices), sound, and a snapshot of every battler (form,
// stats, HP, status, stages, ability, item, types, moves, effects), the side
// and field effects, the environment/backdrop, the Mega Evolution state, the
// midbattle variable and the triggers left in the script, at the start of
// each round and at the end of the battle. Also checks the presets of
// Midbattle_Config.ts against Ruby's.
//
// Setup mirrors the Ruby script exactly (see ability_reference.rb's notes).
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAssetIndex } from "../../core/assets";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameSwitches, GameVariables, PokemonSystem } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { NPCTrainer } from "../../game/trainer/Trainer";
import type { PartyScreenCallback } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import { Battle, DebugSceneNoLogging } from "../index";
import { PBDebug } from "../other/PBDebug";
import { PBEffects as PBEffectsRef } from "../other/PBEffects";
import { EssentialsDeluxe } from "./Midbattle_Config";
import { DELUXE_BATTLE_EFFECTS } from "./Midbattle_Effects";
import { installMidbattle } from "./Midbattle_Main";
import { decodeRuby, isSym, Sym } from "./rubyData";
import ref from "./deluxeReference.json";

let log: string[] = [];
let choices: number[] = [];

// Sounds and music the midbattle code plays (Ruby: pbSEPlay/pbBGMPlay/pbBGMFade).
vi.mock("../../game/GameSystem", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../game/GameSystem")>();
  const name = (p: unknown) => (typeof p === "string" ? p : (p as { name?: string } | null)?.name);
  return {
    ...orig,
    pbSEPlay: (p: unknown) => { log.push(`[se] ${name(p)}`); },
    pbBGMPlay: (p: unknown) => { log.push(`[bgm] ${name(p)}`); },
    pbPlayDecisionSE: () => { log.push("[se] decision"); },
    pbBGMFade: (secs = 0) => { log.push(`[bgmfade] ${Number.isInteger(secs) ? secs.toFixed(1) : secs}`); },
  };
});
// pbWait: no waiting headless (Ruby's harness stubs it).
vi.mock("../../ui/scenes/frames", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../ui/scenes/frames")>();
  return { ...orig, pbWait: async () => {} };
});

type MonSpec = { s: string; l?: number; a: string; m?: string[]; i?: string; g?: number; hp?: [number, number];
  st?: string; sc?: number; n?: string; f?: number; ace?: boolean };
type ChoiceHash = { move?: number; target?: number; mega?: boolean; aimega?: boolean };
type Choice = number | [number, number] | string | ChoiceHash | null;
type Scenario = { name: string; p1: MonSpec[]; p2: MonSpec[]; turns: Choice[][]; double?: boolean;
  trainer?: boolean; items?: string[]; bag?: Record<string, number>; midbattle?: unknown; rules?: unknown; choices?: number[];
  seed?: number; decision: number; log: string[]; errors: string[] };

class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

let player: Player;

//===============================================================================
// Formatting (deluxe_reference.rb's fmt_*)
//===============================================================================
function fmtBattlers(t: unknown): string {
  if (t == null) return "-";
  if (Array.isArray(t)) return t.map((b) => (b && typeof b === "object" && "index" in b ? b.index : b)).join(",");
  if (typeof t === "object" && "index" in (t as object)) return String((t as Battler).index);
  return String(t);
}

function fmtVal(v: unknown): string {
  if (v == null) return "nil";
  if (v instanceof Sym) return v.name;
  if (Array.isArray(v)) return "[" + v.map(fmtVal).join(",") + "]";
  return String(v);
}

function fmtSpeaker(s: unknown): string {
  if (s == null) return "nil";
  if (typeof s === "string") return `"${s}"`;
  const o = s as { name: string; gender: number };
  return `${o.name}/${o.gender}`;
}

/** Ruby's inspect of a String/Integer/nil. */
function inspect(v: unknown): string {
  if (v == null) return "nil";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

const BATTLER_EFFECTS = [...new Set([...DELUXE_BATTLE_EFFECTS.battler_default_false, ...DELUXE_BATTLE_EFFECTS.battler_default_zero,
  ...["Type3", "Nightmare", "Yawn", "MagnetRise", "Telekinesis", "CriticalBoost", "Confusion", "Disable", "Substitute"]
    .map((k) => (PBEffectsRef as Record<string, number>)[k]!)])].sort((a, b) => a - b);
const SIDE_EFFECTS = [...new Set([...DELUXE_BATTLE_EFFECTS.team_default_false, ...DELUXE_BATTLE_EFFECTS.team_default_zero,
  ...["Spikes", "ToxicSpikes", "Reflect", "LightScreen", "AuroraVeil"].map((k) => (PBEffectsRef as Record<string, number>)[k]!)])]
  .sort((a, b) => a - b);
const FIELD_EFFECTS = [...new Set([...DELUXE_BATTLE_EFFECTS.field_default_false, ...DELUXE_BATTLE_EFFECTS.field_default_zero])]
  .sort((a, b) => a - b);

function effectsStr(effects: unknown[], ids: number[]): string {
  return ids.filter((i) => { const v = effects[i]; return !(v == null || v === false || v === 0 || v === -1); })
    .map((i) => `${i}=${fmtVal(effects[i])}`).join(",");
}

function snapshot(battle: Battle, scene: LogScene, label: string): void {
  log.push(`== ${label}`);
  battle.battlers.forEach((b, i) => {
    if (!b || !b.pokemon) return;
    const stg = Object.entries(b.stages).filter(([, v]) => v !== 0).map(([k, v]) => `${k}:${v}`).join(",");
    log.push(`#${i} ${b.species} f=${b.form} ${b.name} hp=${b.hp}/${b.totalhp} ` +
      `s=${b.attack}/${b.defense}/${b.spatk}/${b.spdef}/${b.speed} st=${b.status}/${b.statusCount} ` +
      `stg=${stg} ab=${b.abilityId ?? "-"} it=${b.itemId ?? "-"} ` +
      `types=${b.pbTypes(true).join("/")} mv=${b.moves.map((m) => m.id).join("/")} ` +
      `eff=${effectsStr(b.effects, BATTLER_EFFECTS)}${b.fainted() ? " FAINTED" : ""}`);
  });
  for (let side = 0; side < 2; side++) {
    battle.pbParty(side).forEach((pkmn, i) => {
      if (!pkmn || battle.battlers.some((b) => b && b.pokemon === pkmn && b.index % 2 === side)) return;
      log.push(`party${side}[${i}] ${pkmn.species} f=${pkmn.form} hp=${pkmn.hp}/${pkmn.totalhp} st=${pkmn.status} ` +
        `ab=${pkmn.abilityId ?? "-"} it=${pkmn.itemId ?? "-"}`);
    });
  }
  log.push(`sides ${battle.sides.map((s) => effectsStr(s.effects, SIDE_EFFECTS)).join(" | ")}`);
  const f = battle.field;
  log.push(`field w=${f.weather}/${f.weatherDuration} t=${f.terrain}/${f.terrainDuration} ` +
    `eff=${effectsStr(f.effects, FIELD_EFFECTS)} env=${battle.environment} ` +
    `bd=${battle.backdrop}/${battle.backdropBase ?? "-"} balls=${battle.disablePokeBalls} ` +
    `mega=[${battle.megaEvolution.map((a) => `[${a.join(", ")}]`).join(", ")}] ` +
    `nomega=${G.gameSwitches.get(Settings.NO_MEGA_EVOLUTION)}`);
  log.push(`midbattle var=${scene.midbattleVar} left=${Object.keys(G.gameTemp.dxMidbattle ?? {}).join(",")}`);
}

//===============================================================================
// deluxe_reference.rb's LogScene
//===============================================================================
class LogScene extends DebugSceneNoLogging {
  midbattleVar = 0;
  midbattleChoice: unknown = null;
  midbattleDecision = 0;
  midbattleDelay: string[] = [];
  midbattleIgnore: string[] = [];
  guestSpeaker = false;
  namePanelName: string | null = null;
  namePanelSkin: unknown = null;

  constructor(private turns: number) { super(); }
  get b(): Battle { return this.battle!; }
  override async pbBeginCommandPhase(): Promise<void> {
    snapshot(this.b, this, `round ${this.b.turnCount + 1}`);
    if (this.b.turnCount >= this.turns) this.b.pbAbort();
  }
  override async pbDisplayMessage(msg: string): Promise<void> { log.push(msg); }
  override async pbDisplayPausedMessage(msg: string, block?: () => unknown): Promise<void> {
    log.push(msg);
    await block?.();
  }
  override async pbDisplayConfirmMessage(msg: string): Promise<boolean> { log.push(`[confirm] ${msg}`); return true; }
  override async pbShowAbilitySplash(battler: Battler): Promise<void> {
    log.push(`[splash] ${battler.pbThis()}: ${battler.abilityName()}`);
  }
  override async pbReplaceAbilitySplash(battler: Battler): Promise<void> {
    log.push(`[resplash] ${battler.pbThis()}: ${battler.abilityName()}`);
  }
  override async pbHideAbilitySplash(battler: Battler): Promise<void> { log.push(`[/splash] ${battler.pbThis()}`); }
  override async pbCommonAnimation(animName: string, user: Battler | null = null, target: unknown = null): Promise<void> {
    log.push(`[anim] ${animName ?? ""} u=${fmtBattlers(user)} t=${fmtBattlers(target)}`);
  }
  override async pbAnimation(moveID: Id, user: Battler | null, targets: unknown, hitNum = 0): Promise<void> {
    log.push(`[move] ${moveID}/${hitNum} u=${fmtBattlers(user)} t=${fmtBattlers(targets)}`);
  }
  override async pbSendOutBattlers(sendOuts: [number, Pokemon][]): Promise<void> {
    for (const [idx, pkmn] of sendOuts) log.push(`[sendout] ${idx}: ${pkmn.name}`);
  }
  override async pbRecall(idxBattler: number): Promise<void> { log.push(`[recall] ${idxBattler}`); }
  override async pbPartyScreen(idxBattler: number, _canCancel = false, _mode = 0, callback?: PartyScreenCallback): Promise<void> {
    const replacements: number[] = [];
    this.b.eachInTeamFromBattlerIndex(idxBattler, (_p, idxParty) => {
      if (!this.b.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    for (const idxParty of replacements) if (await callback?.(idxParty, this)) break;
  }
  override pbChangePokemon(idxBattler: number | Battler, pkmn: Pokemon): void {
    const idx = typeof idxBattler === "number" ? idxBattler : idxBattler.index;
    log.push(`[change] ${idx}: ${pkmn.species} f=${pkmn.form}`);
  }
  override async pbFaintBattler(battler: Battler): Promise<void> { log.push(`[faint] ${battler.pbThis()}`); }
  override async pbEndBattle(result: number): Promise<void> { snapshot(this.b, this, `end decision=${result}`); }
  // Mega Evolution / Primal Reversion visuals
  pbCommonAnimationExists(name: string): boolean { log.push(`[exists?] ${name}`); return true; }
  async pbShowMegaEvolution(idx: number): Promise<void> { log.push(`[megaanim] ${idx}`); }
  async pbShowPrimalReversion(idx: number): Promise<void> { log.push(`[primalanim] ${idx}`); }
  async pbRevertBattlerStart(idx: number): Promise<void> { log.push(`[revert] ${idx}`); }
  async pbRevertBattlerEnd(): Promise<void> { log.push("[/revert]"); }
  override pbRefreshOne(_idx: number): void {}
  override pbRefresh(): void {}
  // Capture visuals
  override async pbThrow(ball: Id, shakes: number): Promise<void> { log.push(`[throw] ${ball} ${shakes}`); }
  override async pbThrowSuccess(): Promise<void> {}
  override async pbHideCaptureBall(): Promise<void> {}
  override async pbThrowAndDeflect(): Promise<void> {}
  // Midbattle speech visuals
  async pbToggleDataboxes(toggle = false): Promise<void> { log.push(`[databoxes] ${toggle}`); }
  async pbToggleBlackBars(toggle = false): Promise<void> { log.push(`[blackbars] ${toggle}`); }
  async pbShowSlideSprite(id: unknown): Promise<void> { log.push(`[slide] ${fmtVal(id)}`); }
  async pbHideSlideSprite(): Promise<void> { log.push("[/slide]"); }
  pbUpdateNameWindow(speaker: unknown = "", visible = true, reset = false): void {
    if (reset) {
      this.namePanelName = null;
      this.namePanelSkin = null;
    }
    log.push(`[namewin] ${fmtSpeaker(speaker)} vis=${visible} reset=${reset} ` +
      `panel=${inspect(this.namePanelName)}/${inspect(this.namePanelSkin)}`);
  }
  override async pbShowCommands(msg: string, commands: string[], _defaultValue = -1): Promise<number> {
    const cmd = choices.shift() ?? 0;
    log.push(`[choose] ${msg} | ${commands.join(" / ")} => ${cmd}`);
    return cmd;
  }
  override async pbHitAndHPLossAnimation(targets: [Battler, number, number][]): Promise<void> {
    for (const [b, old] of targets) log.push(`[hploss] ${b.index} ${old}->${b.hp}`);
  }
  async pbFlashRefresh(): Promise<void> { log.push("[flash]"); }
  async pbBattlerFlee(battler: Battler, msg: string | null = null): Promise<void> {
    log.push(`[flee] ${battler.index}`);
    // (Battle_Scene.rb:324: the message is _INTL'd with the battler's name)
    const { _INTL } = await import("../../data/gameData/gameData");
    if (typeof msg === "string") await this.b.pbDisplayPaused(_INTL(msg, battler.pbThis()));
    else await this.b.pbDisplayPaused(_INTL("{1} fled!", battler.pbThis()));
  }
}
installMidbattle(LogScene.prototype);

function makePokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.s, spec.l ?? 50, player as never);
  if (spec.f != null) pkmn.formSimple = spec.f;
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
  if (spec.ace) pkmn.ace = true;
  pkmn.calcStats();
  if (spec.hp) pkmn.hp = Math.max(Math.floor(pkmn.totalhp * spec.hp[0] / spec.hp[1]), 1);
  if (spec.st) {
    pkmn.status = spec.st;
    pkmn.statusCount = spec.sc ?? (spec.st === "SLEEP" ? 3 : 0);
  }
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
  } else if (choice === "r") {
    if (await battle.pbRun(idx) !== 0) return;
    log.push(`[can't run] ${idx}`);
    choice = 0;
  } else if (typeof choice === "string" && choice.startsWith("i")) {
    battle.pbRegisterItem(idx, choice.slice(1), 1 - idx);
    return;
  }
  let mega = false, aimega = false;
  if (choice && typeof choice === "object" && !Array.isArray(choice)) {
    mega = !!choice.mega;
    aimega = !!choice.aimega;
    choice = choice.target != null ? [choice.move ?? 0, choice.target] : (choice.move ?? 0);
  }
  const [moveIdx, target0] = Array.isArray(choice) ? choice : [(choice as number | null | undefined) ?? 0, null];
  let target = target0;
  const b = battle.battlers[idx]!;
  if (!await battle.pbRegisterMove(idx, moveIdx, false)) {
    await battle.pbAutoChooseMove(idx);
    return;
  }
  if (mega) {
    if (battle.pbCanMegaEvolve(idx)) battle.pbRegisterMegaEvolution(idx);
    else log.push(`[can't mega] ${idx}`);
  }
  if (aimega && battle.battleAI.pbEnemyShouldMegaEvolve(idx)) battle.pbRegisterMegaEvolution(idx);
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
  choices = [...(sc.choices ?? [])];
  G.gameSwitches = new GameSwitches();
  G.bag = new PokemonBag();
  for (const [id, qty] of Object.entries(sc.bag ?? {})) G.bag.add(id, qty);
  player.party = [];
  PBDebug.sink = (msg) => {
    if (msg.startsWith("**Exception: ")) {
      log.push("[exception]");
      errors.push(msg);
      if (errors.length > 10) throw new Error("Too many exceptions");
    }
  };
  const p1 = sc.p1.map(makePokemon);
  const p2 = sc.p2.map(makePokemon);
  const scene = new LogScene(sc.turns.length);
  let opponent: NPCTrainer[] | null = null;
  if (sc.trainer) {
    const t = new NPCTrainer("Joey", GameData.TrainerType.keys()[0]!);
    t.party = p2;
    t.items = [...(sc.items ?? [])];
    opponent = [t];
  }
  G.gameTemp.dxMidbattle = sc.midbattle ? decodeRuby(sc.midbattle) as Record<string, unknown> : null;
  G.gameTemp.dxRules = sc.rules ? decodeRuby(sc.rules) as Record<string, unknown> : null;
  const battle = new Battle(scene, p1, p2, player, opponent as never);
  battle.setBattleMode(sc.double ? "double" : "single");
  if (opponent) battle.items = [opponent[0]!.items]; // (TrainerBattle.start_core passes the foes' items)
  battle.internalBattle = true;
  battle.expGain = false;
  battle.moneyGain = false;
  battle.backdrop = "field";
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
  G.gameTemp.dxMidbattle = null;
  G.gameTemp.dxRules = null;
  return { decision, log, errors };
}

beforeAll(async () => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  // The dev server's asset index, for the battlebacks pbResolveBitmap looks up
  // (Ruby's harness checks the files on disk).
  const fetch0 = globalThis.fetch;
  globalThis.fetch = (async () => {
    const dir = join(resolve(import.meta.dirname, "../../../.."), "Graphics/Battlebacks");
    const files = (readdirSync(dir) as string[]).map((f) => `graphics/battlebacks/${f}`.toLowerCase());
    return { ok: true, status: 200, json: async () => files.flatMap((f) => [f, f.replace(/\.[a-z]+$/, "")]) } as Response;
  }) as typeof fetch;
  await loadAssetIndex();
  globalThis.fetch = fetch0;
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
  G.pokemonSystem = new PokemonSystem();
  G.pokemonSystem.givenicknames = 1;
  G.pokemonSystem.battlescene = 0;
  Pokemon.playCryHook = (pkmn) => { log.push(`[cry] ${typeof pkmn === "string" ? pkmn : pkmn.species}`); };
  PBDebug.continueOnError = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const data = ref as unknown as { presets: Record<string, unknown>; scenarios: Scenario[] };

describe("Essentials Deluxe battles vs Ruby", () => {
  for (const sc of data.scenarios) {
    it(sc.name, async () => {
      const got = await runScenario(sc);
      expect(got.log.join("\n"), got.errors.join("\n")).toBe(sc.log.join("\n"));
      expect(got.decision).toBe(sc.decision);
    });
  }
});

/** A preset as the Ruby harness encodes it (Symbols as {":": name}). */
function encode(v: unknown): unknown {
  if (isSym(v)) return { ":": v.name };
  if (Array.isArray(v)) return v.map(encode);
  if (v != null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, encode(val)]));
  }
  return v;
}

describe("Midbattle_Config presets vs Ruby", () => {
  it("has the same presets", () => {
    expect(Object.keys(EssentialsDeluxe).sort()).toEqual(Object.keys(data.presets).sort());
  });
  for (const [name, preset] of Object.entries(data.presets)) {
    it(name, () => {
      expect(encode((EssentialsDeluxe as Record<string, unknown>)[name])).toEqual(preset);
    });
  }
});
