// Shadow Pokémon in battle against the game's own Ruby code: replays the
// scripted battles of shadowBattleReference.json (written by
// web/tools/ruby-ref/shadow_battle_reference.rb) through the TypeScript port
// and compares, round by round, the messages and the battle state, including
// heart gauges and Hyper Mode. Covers the Shadow move classes
// (move/MoveEffects_Shadow.ts), entering/leaving Hyper Mode (pbHyperMode,
// pbHyperModeObedience, the end-of-round Hyper Mode effects), the Call
// command and Shadow battlers being sent out (pbInitPokemon).
//
//   cd web && ruby tools/ruby-ref/shadow_battle_reference.rb   # regenerate
//   npx vitest run src/battle/shadowBattleReference.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Move as MoveData } from "../data/gameData/move";
import { Type } from "../data/gameData/type";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameVariables } from "../game/globals";
import {
  firstDifference, harnessHooks, resetHarnessGlobals, runScenario, type Result, type SeqRandom,
} from "./move/moveHarness";

// Kernel#rand (pbHyperModeObedience) takes the scenario's numbers, as in the Ruby script.
const scripted = vi.hoisted(() => ({ random: null as { next(x: number): number } | null }));
vi.mock("../core/random", async (importOriginal) => {
  const real = await importOriginal<typeof import("../core/random")>();
  return {
    ...real,
    rand: (n: number) => {
      const r = scripted.random;
      if (!r) return real.rand(n);
      return n > 0 ? r.next(n) : r.next(2 ** 30) / 2 ** 30;
    },
  };
});

const REF = JSON.parse(readFileSync(resolve(import.meta.dirname, "shadowBattleReference.json"), "utf8")) as {
  data: { types: ConstructorParameters<typeof Type>[0][]; moves: ConstructorParameters<typeof MoveData>[0][] };
  results: Result[];
};

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  for (const t of REF.data.types) Type.register(t);
  for (const m of REF.data.moves) MoveData.register(m);
  harnessHooks.onRandom = (r: SeqRandom) => { scripted.random = r; };
  harnessHooks.setupPokemon = (pkmn, spec) => {
    if (spec.sh == null) return;
    const moves = pkmn.moves.map((m) => m.id);
    pkmn.makeShadow();
    pkmn.moves = [];
    for (const m of moves) pkmn.learnMove(m);
    pkmn.heartGauge = spec.sh as number;
    if (spec.hm) pkmn.hyperMode = true;
  };
  harnessHooks.choose = (battle, idx, act) => act === "c" && battle.pbRegisterCall(idx);
  harnessHooks.snapBattler = (b) => {
    const p = b.pokemon!;
    return { shadow: [p.heartGauge, p.hyperMode, b.shadowPokemon()] };
  };
  harnessHooks.snapState = (battle) => ({
    hearts: [0, 1].map((side) => battle.pbParty(side).map((pk) => (pk ? [pk.heartGauge, pk.hyperMode] : null))),
  });
});

beforeEach(resetHarnessGlobals);

describe("Shadow Pokémon in battle vs Ruby (scripted battles)", () => {
  it.each(REF.results.map((r) => [r.scenario.name, r] as const))("%s", async (_name, r) => {
    const got = await runScenario(r.scenario, r.seed);
    scripted.random = null;
    for (let i = 0; i < Math.max(got.rounds.length, r.rounds.length); i++) {
      const g = got.rounds[i];
      const w = r.rounds[i];
      const where = `${r.scenario.name}, ${w?.label ?? g?.label}`;
      expect(g?.label, `${where}: round label${got.error ? ` (TS error ${got.error})` : ""}`).toBe(w?.label);
      expect(g!.log, `${where}: messages`).toEqual(w!.log);
      expect(firstDifference(g!.state, w!.state), `${where}: state`).toBeNull();
    }
    expect(got.error != null, `TS error: ${got.error} / Ruby error: ${r.error}`).toBe(r.error != null);
  });

  it("covers Hyper Mode in and out, the Call command and every Shadow move class", () => {
    const logs = REF.results.flatMap((r) => r.rounds.flatMap((rd) => rd.log)).join("\n");
    expect(logs).toContain("It entered Hyper Mode!");
    expect(logs).toContain("came to its senses from the Trainer's call!");
    expect(logs).toContain("came to its senses!");
    for (const m of ["Shadow Half", "Shadow End", "Shadow Sky", "Shadow Shed", "Shadow Rush"]) expect(logs).toContain(`used ${m}!`);
  });
});
