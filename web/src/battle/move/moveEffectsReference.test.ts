// The move effect classes against the game's own Ruby battle code: replays
// every scripted battle of moveEffectsReference.json.gz (gzipped JSON, written by
// web/tools/ruby-ref/move_effects_reference.rb, which runs Essentials v20.1 +
// this game's plugins headless) through the TypeScript port and compares, round
// by round, the messages/animations shown and the battle state (HP, status,
// stats, stat stages, every battler/side/position/field effect, moves and PP,
// both parties). The battle is set up and scripted exactly as in that script:
// same Pokémon, same command-phase choices, the same "random" numbers.
//
//   cd web && ruby tools/ruby-ref/move_effects_reference.rb   # regenerate
//   npx vitest run src/battle/move/moveEffectsReference.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables } from "../../game/globals";
import { firstDifference, resetHarnessGlobals, runScenario, type Result } from "./moveHarness";

const RESULTS = JSON.parse(gunzipSync(readFileSync(resolve(import.meta.dirname, "moveEffectsReference.json.gz"))).toString("utf8")) as Result[];
const ROOT = resolve(import.meta.dirname, "../../../..");

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(resetHarnessGlobals);

//===============================================================================
// Tests (the harness is in ./moveHarness.ts)
//===============================================================================
describe("move effects vs Ruby (scripted battles)", () => {
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
  const hand = RESULTS.filter((r) => !r.scenario.auto).map((r) => r.scenario);
  const handMoves = new Set(hand.flatMap((s) => [...(s.p ?? []), ...(s.o ?? [])].flatMap((p) => p.m ?? ["TACKLE"])));

  it("has a hand-written scenario for every function code learnable by Route 29-36 species and the Johto starters (level-up, up to Lv. 40)", () => {
    const read = (f: string) => JSON.parse(readFileSync(resolve(ROOT, "web/data", f), "utf8"));
    const maps = new Set((read("map-infos.json") as { id: number; name: string }[])
      .filter((m) => /^Route (29|3[0-6])\b/.test(m.name)).map((m) => m.id));
    const species = new Set<string>(["CHIKORITA", "BAYLEEF", "MEGANIUM", "CYNDAQUIL", "QUILAVA", "TYPHLOSION",
      "TOTODILE", "CROCONAW", "FERALIGATR"]);
    for (const e of read("pbs/encounters.json") as { map: number; types: Record<string, { species: string }[]> }[]) {
      if (!maps.has(e.map)) continue;
      for (const slots of Object.values(e.types)) for (const s of slots) species.add(s.species);
    }
    const speciesData = new Map((read("pbs/species.json") as { id: string; moves: { level: number; move: string }[] }[])
      .map((s) => [s.id, s]));
    const codeOf = new Map((read("pbs/moves.json") as { id: string; functionCode: string }[])
      .map((m) => [m.id, m.functionCode || "None"]));
    const coveredCodes = new Set([...handMoves].map((m) => codeOf.get(m)));
    const missing = new Set<string>();
    for (const sp of species) {
      for (const lm of speciesData.get(sp)!.moves) {
        if (lm.level <= 40 && !coveredCodes.has(codeOf.get(lm.move))) missing.add(`${codeOf.get(lm.move)} (${lm.move})`);
      }
    }
    expect(species.size).toBeGreaterThan(50);
    expect([...missing]).toEqual([]);
  });

  it("has a hand-written scenario using a class from every move effect file", () => {
    const codeOf = new Map(GameData.Move.each().map((m) => [m.id, m.functionCode || "None"]));
    const coveredCodes = new Set([...handMoves].map((m) => codeOf.get(m)));
    const files = [
      ...["005_MoveEffects_Misc", "006_MoveEffects_BattlerStats", "007_MoveEffects_BattlerOther",
        "008_MoveEffects_MoveAttributes", "009_MoveEffects_MultiHit", "010_MoveEffects_Healing",
        "011_MoveEffects_Items", "012_MoveEffects_ChangeMoveEffect", "013_MoveEffects_SwitchingActing"]
        .map((f) => `Data/Scripts/011_Battle/003_Move/${f}.rb`),
      "Plugins/Generation 9 Pack Scripts/[002] Moves/[001] New Move Functions.rb",
    ];
    for (const f of files) {
      const classes = [...readFileSync(resolve(ROOT, f), "utf8").matchAll(/^class Battle::Move::(\w+)/gm)].map((m) => m[1]);
      expect(classes.some((c) => coveredCodes.has(c)), f).toBe(true);
    }
  });
});
