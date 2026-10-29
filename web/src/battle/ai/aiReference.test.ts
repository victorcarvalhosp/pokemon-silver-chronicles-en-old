// The battle AI against the game's own Ruby AI: replays the cases of
// aiReference.json (written by web/tools/ruby-ref/ai_reference.rb) and
// compares
// - "scores" cases: pbGetMoveScore for every move of battler 1 against every
//   battler, at skills 1, 32, 48 and 100 (the move sweep runs every move in
//   the game through five setups);
// - "command" cases: the action pbDefaultChooseEnemyCommand registers (item,
//   switch or move and target) and how many random numbers it used.
// Setup mirrors the Ruby script exactly: same Pokémon (IVs 31, EVs 0, Hardy,
// Honey Gather unless the case says otherwise), the same battle state and the
// same counter-based random stream for battle.pbRandom and pbAIRandom. A Ruby
// exception is recorded as "!<class>"; the TS port throws an Error whose
// message starts with that class where it reproduces one.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { NPCTrainer } from "../../game/trainer/Trainer";
import { Battle, DebugSceneNoLogging, PBEffects } from "../index";
import "../items";
import ref from "./aiReference.json";

type MonSpec = { s: string; l?: number; a?: string; m?: string[]; i?: string; hp?: number[]; st?: string;
  sc?: number; g?: number; f?: number };
type BattlerSpec = { stages?: Record<string, number>; effects?: Record<string, unknown>; turnCount?: number;
  lastMoveUsed?: string; lastRegularMoveUsed?: string; pp?: number[] };
type Case = {
  kind: "scores" | "command"; name: string; double?: boolean; skill?: number; items?: string[];
  p1: MonSpec[]; p2: MonSpec[]; b?: Record<string, BattlerSpec>; sides?: Record<string, unknown>[];
  field?: { weather?: string; terrain?: string; effects?: Record<string, unknown> };
  rules?: Record<string, unknown>; seed?: number; ai?: number[];
  result: { scores?: (number | string)[]; choices?: Record<string, unknown>;
    randomCalls: number };
};

const INERT_ABILITY = "HONEYGATHER";
const SKILLS = [1, 32, 48, 100];

/** ai_reference.rb's SeqRandom (also counts the calls). */
class SeqRandom {
  constructor(public k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

let player: Player;

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = null;
});

function makePokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.s, spec.l ?? 50, player as never);
  if (spec.f != null) pkmn.form = spec.f;
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = "HARDY";
  pkmn.ability = spec.a ?? INERT_ABILITY;
  pkmn.item = spec.i ?? null;
  pkmn.gender = spec.g ?? 0;
  pkmn.forgetAllMoves();
  for (const m of spec.m ?? ["TACKLE"]) pkmn.learnMove(m);
  pkmn.calcStats();
  if (spec.hp) pkmn.hp = spec.hp[0] === 0 ? 0 : Math.max(Math.floor(pkmn.totalhp * spec.hp[0]! / spec.hp[1]!), 1);
  if (spec.st) {
    pkmn.status = spec.st;
    pkmn.statusCount = spec.sc ?? 0;
  }
  return pkmn;
}

const effectIndex = (name: string): number => (PBEffects as unknown as Record<string, number>)[name]!;

async function makeBattle(c: Case, random: SeqRandom): Promise<Battle> {
  const p1 = c.p1.map(makePokemon);
  const p2 = c.p2.map(makePokemon);
  let opponent: NPCTrainer[] | null = null;
  if (c.skill != null) {
    const t = new NPCTrainer("Joey", GameData.TrainerType.keys()[0]!);
    t.party = p2;
    const skill = c.skill;
    t.skillLevel = () => skill;
    opponent = [t];
  }
  const scene = new DebugSceneNoLogging();
  const battle = new Battle(scene, p1, p2, player, opponent);
  if (c.double) battle.setBattleMode("double");
  battle.internalBattle = true;
  if (c.items) battle.items = [c.items];
  battle.pbRandom = (x: number) => random.next(x);
  battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  for (const [k, v] of Object.entries(c.rules ?? {})) battle.rules[k] = v;
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  for (const [idx, bs] of Object.entries(c.b ?? {})) {
    const b = battle.battlers[Number(idx)]!;
    for (const [s, v] of Object.entries(bs.stages ?? {})) b.stages[s] = v;
    for (const [e, v] of Object.entries(bs.effects ?? {})) b.effects[effectIndex(e)] = v;
    if (bs.turnCount != null) b.turnCount = bs.turnCount;
    if (bs.lastMoveUsed) b.lastMoveUsed = bs.lastMoveUsed;
    if (bs.lastRegularMoveUsed) b.lastRegularMoveUsed = bs.lastRegularMoveUsed;
    if (bs.pp) b.moves[bs.pp[0]!]!.pp = bs.pp[1]!;
  }
  (c.sides ?? []).forEach((effects, side) => {
    for (const [e, v] of Object.entries(effects ?? {})) battle.sides[side]!.effects[effectIndex(e)] = v;
  });
  if (c.field) {
    if (c.field.weather) {
      battle.field.weather = c.field.weather;
      battle.field.weatherDuration = 5;
    }
    if (c.field.terrain) {
      battle.field.terrain = c.field.terrain;
      battle.field.terrainDuration = 5;
    }
    for (const [e, v] of Object.entries(c.field.effects ?? {})) battle.field.effects[effectIndex(e)] = v;
  }
  return battle;
}

/** Ruby's "!<class>" for an exception (the TS port's reproduced ones start with the class). */
function errorName(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /^([A-Z][A-Za-z]*Error)\b/.exec(msg);
  return `!${m ? m[1] : `TS ${e instanceof Error ? e.name : "error"}: ${msg}`}`;
}

async function runScores(c: Case): Promise<{ scores: [number, number, number, number | string][]; randomCalls: number }> {
  const random = new SeqRandom(c.seed ?? 0);
  const battle = await makeBattle(c, random);
  const ai = battle.battleAI;
  const user = battle.battlers[1]!;
  const rows: [number, number, number, number | string][] = []; // [move, target, skill, score]
  for (let i = 0; i < user.moves.length; i++) {
    for (const t of battle.battlers) {
      if (!t) continue;
      for (const skill of SKILLS) {
        let score: number | string;
        try {
          score = await ai.pbGetMoveScore(user.moves[i]!, user, t, skill);
        } catch (e) {
          score = errorName(e);
        }
        rows.push([i, t.index, skill, score]);
      }
    }
  }
  return { scores: rows, randomCalls: random.k - (c.seed ?? 0) };
}

async function runCommand(c: Case): Promise<Case["result"]> {
  const random = new SeqRandom(c.seed ?? 0);
  const battle = await makeBattle(c, random);
  const start = random.k;
  const choices: Record<string, unknown> = {};
  for (const idx of c.ai ?? [1]) {
    try {
      await battle.battleAI.pbDefaultChooseEnemyCommand(idx);
      const ch = battle.choices[idx]!;
      let val = ch[2] as unknown;
      if (val && typeof val === "object" && "id" in val) val = (val as { id: Id }).id;
      choices[String(idx)] = [ch[0], ch[1], val == null ? null : String(val), ch[3]];
    } catch (e) {
      choices[String(idx)] = errorName(e);
    }
  }
  return { choices, randomCalls: random.k - start };
}

type Sweep = { template: Omit<Case, "result">; results: Record<string, Case["result"]> };
const { sweeps, cases } = ref as unknown as { sweeps: Sweep[]; cases: Case[] };

/** A sweep setup's case for one move (the template with "$MOVE" replaced). */
function sweepCase(sw: Sweep, move: string): Case {
  const c = JSON.parse(JSON.stringify(sw.template).replaceAll("\"$MOVE", `"${move}`)) as Case;
  c.name = c.name.replace("$MOVE", move);
  c.result = sw.results[move]!;
  return c;
}

/** Every "scores" case: the move sweep, then the targeted ones. */
function scoreCases(): Case[] {
  const ret: Case[] = [];
  for (const sw of sweeps) for (const move of Object.keys(sw.results)) ret.push(sweepCase(sw, move));
  return ret.concat(cases.filter((x) => x.kind === "scores"));
}

describe("battle AI vs Ruby", () => {
  it("scores every move like Ruby (move sweep and targeted cases)", async () => {
    const mismatches: string[] = [];
    const all = scoreCases();
    expect(all.length).toBeGreaterThan(4000);
    for (const c of all) {
      const got = await runScores(c);
      const want = c.result.scores!;
      want.forEach((score, n) => {
        const g = got.scores[n];
        if (!g || g[3] !== score) {
          mismatches.push(`${c.name}: move ${g?.[0]} vs ${g?.[1]} skill ${g?.[2]}: ruby ${score}, ts ${g?.[3]}`);
        }
      });
      if (got.scores.length !== want.length) mismatches.push(`${c.name}: ${got.scores.length} scores, ruby ${want.length}`);
      if (got.randomCalls !== c.result.randomCalls) mismatches.push(`${c.name}: random calls ${got.randomCalls}, ruby ${c.result.randomCalls}`);
    }
    expect(mismatches).toEqual([]);
  }, 120_000);

  it("chooses the same action with the same random numbers as Ruby", async () => {
    const mismatches: string[] = [];
    for (const c of cases.filter((x) => x.kind === "command")) {
      const got = await runCommand(c);
      const label = c.name;
      if (JSON.stringify(got.choices) !== JSON.stringify(c.result.choices)) {
        mismatches.push(`${label}: ts ${JSON.stringify(got.choices)}, ruby ${JSON.stringify(c.result.choices)}`);
      }
      if (got.randomCalls !== c.result.randomCalls) {
        mismatches.push(`${label}: random calls ${got.randomCalls}, ruby ${c.result.randomCalls}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
