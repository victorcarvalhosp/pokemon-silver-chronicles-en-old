// The Purify Chamber's logic (PurifyChamber.ts, the :lower_heart_gauges step
// handler and pbPurify in game/pokemon/shadowPokemonOther.ts, the set view's
// cursor in PurifyChamberScene.ts) against the game's own Ruby:
// purifyChamberReference.json is written by
// web/tools/ruby-ref/purify_chamber_reference.rb, which loads Essentials v20.1,
// 002_ShadowPokemon_Other.rb and 022_UI_PurifyChamber.rb headless. Compared:
// calcPoint, maximumTempo, partialSum, typeAdvantage for every type pair,
// isSuperEffective over a pool of Pokémon, random sequences of chamber
// operations (the whole chamber and the messages after each), adjustOnInsert,
// moveCursor and pbPurify.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameTemp, PokemonGlobalMetadata, PokemonSystem, type MapLike } from "../../game/globals";
import { setMessageHook } from "../../game/items/itemUtilities";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { pbLowerHeartGauges, pbPurify } from "../../game/pokemon/shadowPokemonOther";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { Input } from "../../rgss/Input";
import { PurifyChamber, PurifyChamberHelper, PurifyChamberSet, calcPoint } from "./PurifyChamber";
import { PurifyChamberSetView } from "./PurifyChamberScene";
import ref from "./purifyChamberReference.json";

let log: unknown[][] = [];
vi.mock("../messages", () => ({
  pbMessage: async (text: string) => { log.push(["msg", text]); return 0; },
}));

type Op = [string, ...(number | null)[]];
interface SetState {
  list: number[]; facing: number; shadow: number | null; flow: number; tempo: number; affinity: number[];
  shadowAffinity: number; chamberFlow: number; purifiable: boolean; purifiableIgnoreRegular: boolean;
  get2: (number | null)[];
}
interface ChamberState {
  currentSet: number; sets: SetState[]; get: (number | null)[]; slots: (number | null)[][];
  gauges: number[]; counters: (number | null)[]; moves: string[][];
}
const reference = ref as unknown as {
  calcPoint: [number, number, number, number, [number, number]][];
  maximumTempo: number;
  partialSum: number[];
  types: Id[];
  typeAdvantage: number[][];
  adjustOnInsert: [number, number][];
  pool: [Id, number, Id, boolean, number | null][];
  isSuperEffective: number[][];
  sequences: { ops: Op[]; steps: { state: ChamberState; log: unknown[][] }[] }[];
  moveCursor: [number, number, number, number][];
  purify: Record<string, unknown>[];
};

let player: Player;

function buildPool(): Pokemon[] {
  return reference.pool.map(([sp, lv, nature, shadow, gauge]) => {
    const pkmn = new Pokemon(sp, lv, player as never);
    pkmn.nature = nature;
    if (shadow) {
      pkmn.makeShadow();
      if (gauge != null) pkmn.heartGauge = gauge;
    }
    return pkmn;
  });
}

beforeAll(() => {
  loadGameDataForTests();
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = player as never;
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameTemp = new GameTemp();
  G.pokemonSystem = new PokemonSystem();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameMap = { mapId: 5, events: new Map() } as MapLike;
  setMessageHook(async (text) => { log.push(["msg", text]); return 0; }, async (text) => { log.push(["confirmMsg", text]); return false; });
});

describe("pure functions", () => {
  it("calcPoint", () => {
    for (const [x, y, d, a, expected] of reference.calcPoint) {
      const p = calcPoint(x, y, d, a);
      expect(p[0], `${x},${y},${d},${a}`).toBeCloseTo(expected[0], 9);
      expect(p[1], `${x},${y},${d},${a}`).toBeCloseTo(expected[1], 9);
    }
  });

  it("maximumTempo and partialSum", () => {
    expect(PurifyChamber.maximumTempo()).toBe(reference.maximumTempo);
    expect(reference.partialSum.map((_, x) => new PurifyChamberSet().partialSum(x))).toEqual(reference.partialSum);
  });

  it("typeAdvantage for every type pair", () => {
    const types = reference.types;
    expect([...GameData.Type.keys()].sort()).toEqual(types);
    const got = types.map((a) => types.map((b) => (PurifyChamberSet.typeAdvantage(a, b) ? 1 : 0)));
    expect(got).toEqual(reference.typeAdvantage);
  });

  it("isSuperEffective over the pool", () => {
    const pool = buildPool();
    const got = pool.map((a) => pool.map((b) => (PurifyChamberSet.isSuperEffective(a, b) ? 1 : 0)));
    expect(got).toEqual(reference.isSuperEffective);
  });

  it("adjustOnInsert", () => {
    expect(reference.adjustOnInsert.map(([p]) => [p, PurifyChamberHelper.adjustOnInsert(p)])).toEqual(reference.adjustOnInsert);
  });
});

function snapshot(ch: PurifyChamber, pool: Pokemon[]): ChamberState {
  const idx = (p: Pokemon | null) => (p ? pool.indexOf(p) : null);
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  return {
    currentSet: ch.currentSet,
    sets: range(0, PurifyChamber.NUMSETS - 1).map((s) => {
      const set = ch.get(s);
      return {
        list: set.list.map((p) => idx(p)!),
        facing: set.facing,
        shadow: idx(set.shadow),
        flow: set.flow(),
        tempo: set.tempo(),
        affinity: range(-1, 4).map((i) => set.affinity(i)),
        shadowAffinity: set.shadowAffinity(),
        chamberFlow: ch.chamberFlow(s),
        purifiable: ch.isPurifiable(s),
        purifiableIgnoreRegular: ch.isPurifiableIgnoreRegular(s),
        get2: range(-1, 9).map((pos) => idx(PurifyChamberHelper.pbGetPokemon2(ch, s, pos))),
      };
    }),
    get: range(-1, 9).map((pos) => idx(PurifyChamberHelper.pbGetPokemon(ch, pos))),
    slots: range(-1, PurifyChamber.NUMSETS).map((c) => range(-1, 4).map((sl) => idx(ch.get(c, sl)))),
    gauges: pool.map((p) => p.heartGauge),
    counters: pool.map((p) => p.heartGaugeStepCounter),
    moves: pool.map((p) => p.moves.map((m) => m.id)),
  };
}

describe("chamber operation sequences (incl. update and the step handler)", () => {
  reference.sequences.forEach((seq, n) => {
    it(`sequence ${n}`, async () => {
      const pool = buildPool();
      player.party = [pool[0]!, pool[14]!, pool[16]!, pool[12]!];
      const ch = new PurifyChamber();
      G.pokemonGlobal.purifyChamber = ch;
      const p = (i: number | null | undefined) => (i == null ? null : pool[i]!);
      for (let k = 0; k < seq.ops.length; k++) {
        const op = seq.ops[k]!;
        const a = op.slice(1) as number[];
        log = [];
        switch (op[0]) {
          case "setShadow": ch.setShadow(a[0]!, p(a[1])); break;
          case "insertAfter": ch.insertAfter(a[0]!, a[1]!, p(a[2])); break;
          case "insertAt": ch.insertAt(a[0]!, a[1]!, p(a[2])); break;
          case "helperSet": PurifyChamberHelper.pbSetPokemon(ch, a[0]!, p(a[1])); break;
          case "switch": ch.switch(a[0]!, a[1]!); break;
          case "facing": ch.get(a[0]!).facing = a[1]!; break;
          case "currentSet": ch.currentSet = a[0]!; break;
          case "heart": pool[a[0]!]!.heartGauge = a[1]!; break;
          case "update": await ch.update(); break;
          case "step": for (let i = 0; i < a[0]!; i++) await pbLowerHeartGauges(); break;
        }
        const expected = seq.steps[k]!;
        expect(snapshot(ch, pool), `op ${k}: ${JSON.stringify(op)}`).toEqual(expected.state);
        expect(log, `op ${k}: ${JSON.stringify(op)}`).toEqual(expected.log);
      }
    });
  });
});

describe("PurifyChamberSetView#moveCursor", () => {
  it("matches Ruby for every set size, cursor and direction", () => {
    const pool = buildPool();
    const buttons = [Input.UP, Input.DOWN, Input.LEFT, Input.RIGHT];
    const got: [number, number, number, number][] = [];
    for (let count = 0; count <= PurifyChamber.SETSIZE; count++) {
      const ch = new PurifyChamber();
      for (let i = 0; i < count; i++) ch.insertAfter(0, ch.setCount(0), pool[i]!);
      // The view without its sprites (refresh is graphics only), as the harness does.
      const view = Object.create(PurifyChamberSetView.prototype) as PurifyChamberSetView;
      Object.assign(view, { chamber: ch, _set: 0, refresh() {} });
      for (let cursor = 0; cursor <= PurifyChamber.SETSIZE * 2; cursor++) {
        buttons.forEach((btn, b) => {
          (view as unknown as { _cursor: number })._cursor = cursor;
          view.moveCursor(btn);
          got.push([count, cursor, b, view.cursor]);
        });
      }
    }
    expect(got).toEqual(reference.moveCursor);
  });
});

describe("pbPurify", () => {
  const cases: [number, number | null, Record<string, number> | null, number][] = [
    [15, null, null, 1], [15, 40, { HP: 4, ATTACK: 252, SPEED: 300 }, 1], [18, 0, null, 0], [16, 3, { DEFENSE: 10 }, 1],
    [14, 100, null, 1], [17, null, null, 1], [13, 7, null, 1],
  ];
  cases.forEach(([i, exp, evs, nick], n) => {
    it(`case ${n}`, async () => {
      const pool = buildPool();
      const pkmn = pool[i]!;
      if ([13, 14, 17].includes(i) && exp !== 100) pkmn.heartGauge = 0;
      pkmn.savedExp = exp;
      if (evs) {
        pkmn.savedEv = {};
        for (const s of GameData.Stat.eachMain()) pkmn.savedEv[s.id] = evs[s.id] ?? 0;
      } else {
        pkmn.savedEv = null;
      }
      G.pokemonSystem.givenicknames = nick;
      G.stats = new GameStats();
      log = [];
      const scene = {
        pbDisplay: async (msg: string) => { log.push(["display", msg]); },
        pbConfirm: async (msg: string) => { log.push(["confirm", msg]); return false; },
        pbUpdate: () => {},
      };
      await pbPurify(pkmn, scene);
      const ev: Record<string, number> = {};
      for (const s of GameData.Stat.eachMain()) ev[s.id] = pkmn.ev[s.id]!;
      expect({
        log,
        shadow: pkmn.shadowPokemon(),
        moves: pkmn.moves.map((m) => m.id),
        firstMoves: [...pkmn.firstMoves],
        exp: pkmn.exp,
        level: pkmn.level,
        ev,
        ribbons: [...pkmn.ribbons],
        savedExp: pkmn.savedExp,
        savedEv: pkmn.savedEv == null ? null : 1,
        purified: (G.stats as GameStats).shadowPokemonPurified,
      }).toEqual(reference.purify[n]);
    });
  });
});
