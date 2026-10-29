// 003_SaveData_Conversion.rb's registry and 005_Game_SaveConversions.rb's v20
// conversions, on a save's JSON values.
import { beforeAll, describe, expect, it } from "vitest";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { compareVersions, getConversions, runSaveConversions } from "./SaveConversions";

beforeAll(() => loadGameDataForTests());

const oldSave = () => ({
  player: { characterID: 1, party: [{ __class: "Pokemon", species: "PIKACHU", markings: 0b100101 }], pokedex: { seenForms: { PIKACHU: [[0], [1]] } } },
  bag: { lastpocket: 3, choices: [0, 1], registeredItems: ["BICYCLE"], registeredIndex: [1, 0, 1] },
  global_metadata: {
    eventvars: { "[12, 4]": [2, 395, true, 1000, 3, 0] },
    daycare: [[{ __class: "Pokemon", species: "EEVEE", markings: 1 }, 20], [null, 0]], daycareEgg: 1, daycareEggSteps: 77,
  },
  pokemon_system: {},
  game_screen: { weatherType: 0 },
  frame_count: 400,
});

describe("save conversions", () => {
  it("compares versions like PluginManager.compare_versions", () => {
    expect(compareVersions("19.1", "20")).toBe(-1);
    expect(compareVersions("20.1", "20")).toBe(1);
    expect(compareVersions("20", "20")).toBe(0);
  });

  it("don't run on the port's own saves", () => {
    expect(getConversions({ essentials_version: "20.1", game_version: "1.0.0" })).toHaveLength(0);
  });

  it("convert a pre-v20 save (no essentials_version: 18.1)", () => {
    const save = oldSave() as Record<string, unknown>;
    expect(runSaveConversions(save, "20.1", "1.0.0")).toBe(true);
    expect(save.essentials_version).toBe("20.1");
    const p = save.player as { characterID: number; party: { markings: number[] }[]; pokedex: { seenForms: Record<string, unknown[]>; caughtCounts: object } };
    expect(p.characterID).toBe(2);
    expect(p.party[0]!.markings).toEqual([1, 0, 1, 0, 0, 1]);
    expect(p.pokedex.seenForms.PIKACHU).toEqual([[[0], []], [[1], []]]);
    expect(p.pokedex.caughtCounts).toEqual({});
    const g = save.global_metadata as Record<string, unknown>;
    const berry = (g.eventvars as Record<string, Record<string, unknown>>)["[12, 4]"]!;
    expect(berry).toMatchObject({ berryId: "ORANBERRY", growthStage: 2, newMechanics: false, wateringCount: 3 });
    const dc = g.dayCare as { slots: { pokemon: { species: string; markings: unknown } | null }[]; eggGenerated: boolean; stepCounter: number };
    // Ruby parity: the first old Pokémon fills every empty slot
    expect(dc.slots.map((s) => s.pokemon?.species)).toEqual(["EEVEE", "EEVEE"]);
    expect(dc.slots[0]!.pokemon!.markings).toEqual([1, 0, 0, 0, 0, 0]);
    expect(dc.eggGenerated).toBe(true);
    expect(dc.stepCounter).toBe(77);
    expect(save.bag).toMatchObject({ lastViewedPocket: 3, lastPocketSelections: [0, 1], readyMenuSelection: [1, 0, 1] });
    expect((save.game_screen as { weatherType: unknown }).weatherType).toBe("None");
    expect(save.pokemon_system).toEqual({ givenicknames: 0, sendtoboxes: 0 });
    expect(save.stats).toMatchObject({ playTime: 10, playSessions: 1 });
  });
});
