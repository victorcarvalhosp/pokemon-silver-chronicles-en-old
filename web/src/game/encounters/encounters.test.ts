// PokemonEncounters against Essentials' own Ruby (rubyReference.json, made by
// web/tools/ruby-ref/encounters.rb on this game's encounter tables). Random
// numbers are replayed from the reference: rand(n) = raw % n.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G } from "../globals";
import ref from "./rubyReference.json";

const rolls: number[] = [];
vi.mock("../../core/random", () => ({
  rand: (n: number) => {
    if (rolls.length === 0) throw new Error("out of scripted rolls");
    return rolls.shift()! % n;
  },
  random: () => 0,
  seedRandom: () => {},
}));

const { PokemonEncounters } = await import("./PokemonEncounters");
const { RubySort } = await import("./rubySort");

beforeAll(() => {
  loadGameDataForTests();
  RubySort.algorithm = "bsd"; // the harness ran on macOS Ruby (see rubySort.ts)
  G.player = { firstPokemon: () => null, firstAblePokemon: () => null, ablePokemonCount: () => 1 } as never;
  G.gameSystem = { encounterDisabled: false } as never;
  G.pokemonGlobal.surfing = false;
  G.pokemonGlobal.bicycle = false;
});
beforeEach(() => {
  rolls.length = 0;
});

describe("PokemonEncounters", () => {
  it("sorts every encounter table like Ruby's sort! (once and twice)", () => {
    for (const c of ref.sortOrder) {
      const enc = new PokemonEncounters();
      enc.setup(c.map);
      const list = enc.encounterTables[c.type]!;
      rolls.push(0, 0, 0);
      enc.chooseWildPokemon(c.type); // sorts the table in place
      expect(list.map((e) => e[1]), `map ${c.map} ${c.type}`).toEqual(c.once);
      rolls.push(0, 0, 0);
      enc.chooseWildPokemon(c.type);
      expect(list.map((e) => e[1]), `map ${c.map} ${c.type} (again)`).toEqual(c.twice);
    }
  });

  it("chooses species and levels by weight like choose_wild_pokemon", () => {
    for (const m of ref.choose) {
      const enc = new PokemonEncounters();
      enc.setup(m.map);
      for (const call of m.calls) {
        rolls.push(...call.rolls);
        expect(enc.chooseWildPokemon(call.type, call.chanceRolls), `map ${m.map} ${call.type}`).toEqual(call.result);
        expect(rolls.length).toBe(0);
      }
    }
  });

  it("picks the encounter type for the time of day", () => {
    for (const c of ref.timeOfDay) {
      const enc = new PokemonEncounters();
      enc.setup(c.map);
      const got = c.byHour.map((_, h) => enc.findValidEncounterTypeForTime(c.base, new Date(2026, 0, 1, h, 30)) ?? "");
      expect(got, `map ${c.map} ${c.base}`).toEqual(c.byHour);
    }
  });

  it("triggers encounters on steps like encounter_triggered?", () => {
    for (const w of ref.triggered) {
      const enc = new PokemonEncounters();
      enc.setup(w.map);
      for (const [i, step] of w.steps.entries()) {
        rolls.push(...step.rolls);
        const got = enc.encounterTriggered(w.type, w.repel);
        expect([got, enc.stepCount, enc.chanceAccumulator], `map ${w.map} repel ${w.repel} step ${i}`)
          .toEqual([step.result, step.stepCount, step.accumulator]);
        if (got) enc.resetStepCount();
      }
    }
  });

  it("reads Route 29's day and night tables", () => {
    const enc = new PokemonEncounters();
    enc.setup(4);
    expect(enc.hasLandEncounters()).toBe(true);
    expect(enc.hasCaveEncounters()).toBe(false);
    expect(enc.findValidEncounterTypeForTime("Land", new Date(2026, 0, 1, 12))).toBe("LandDay");
    expect(enc.findValidEncounterTypeForTime("Land", new Date(2026, 0, 1, 22))).toBe("LandNight");
    expect(enc.findValidEncounterTypeForTime("TallGrass", new Date(2026, 0, 1, 12))).toBeNull();
  });
});
