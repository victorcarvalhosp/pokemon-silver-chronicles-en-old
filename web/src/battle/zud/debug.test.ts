// ZUD's Debug menu options (Debug.ts): registered with MenuHandlers, and the
// battle Debug menu's toggles flip a trainer's mechanic between able (-1) and
// unable (-2), as in [000] General/Debug.rb:340-449.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { MenuHandlers } from "../../ui/menus/menuHandlers";

const answers: number[] = [];
vi.mock("../../ui/messages", async (orig) => ({
  ...(await orig<typeof import("../../ui/messages")>()),
  pbMessage: async () => answers.shift() ?? -1,
  pbShowCommands: async () => answers.shift() ?? -1,
}));

beforeAll(async () => {
  loadGameDataForTests();
  await import("./Debug");
});

describe("ZUD Debug menu options", () => {
  it("registers the general, Pokémon and battle options", () => {
    const names = (menu: string) => MenuHandlers.eachAvailable(menu).map(([o]) => o);
    expect(names("debug_menu")).toEqual(expect.arrayContaining(["zud_menu", "debug_zud_switches", "debug_dynamax"]));
    expect(names("pokemon_debug_menu")).toContain("set_dynamax");
    expect(names("battle_debug_menu")).toEqual(expect.arrayContaining(["z_moves", "ultra_burst", "dynamax"]));
  });

  it("toggles whether a trainer can Dynamax", async () => {
    const battle = { player: [{ name: "Gold" }], opponent: [{ name: "Lance" }], zMove: [[-1], [-1]],
      ultraBurst: [[-1], [-1]], dynamax: [[-1], [-1]] };
    answers.push(1, 1, -1); // Foe side twice, then cancel
    await MenuHandlers.call("battle_debug_menu", "dynamax", "effect", battle);
    expect(battle.dynamax).toEqual([[-1], [-1]]);
    answers.push(0, -1);
    await MenuHandlers.call("battle_debug_menu", "z_moves", "effect", battle);
    expect(battle.zMove).toEqual([[-2], [-1]]);
  });
});
