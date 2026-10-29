// 012_Overworld/001_Overworld.rb's step and frame handlers: walking happiness
// every 128 steps, the grass rustle animation, pbPokerus?, and the Pokérus
// countdown that never runs in v20.1 (pokerusTime is never set).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../core/random", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/random")>()),
  rand: () => 0,
}));

const { EventHandlers } = await import("../eventHandlers");
const { G, GameSwitches, PokemonGlobalMetadata } = await import("../globals");
const { pbFacingTileRegular, pbPokerus } = await import("./stepHandlers");

const happiness: string[] = [];
const pkmn = (stage: number) => ({
  name: "Pichu", pokerusStage: () => stage, lowerPokerusCount: () => happiness.push("pokerus"),
  changeHappiness: (m: string) => happiness.push(m),
});

beforeEach(() => {
  happiness.length = 0;
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameSwitches = new GameSwitches();
  const party = [pkmn(0), pkmn(1)];
  G.player = { party, ableParty: () => party, pokemonParty: () => party } as never;
});

describe("001_Overworld.rb handlers", () => {
  it("party Pokémon gain walking happiness every 128 steps", async () => {
    for (let i = 0; i < 127; i++) await EventHandlers.trigger("on_player_step_taken");
    expect(happiness.filter((h) => h === "walking")).toHaveLength(0);
    await EventHandlers.trigger("on_player_step_taken");
    expect(happiness.filter((h) => h === "walking")).toHaveLength(2);
  });

  it("shows the grass rustle on grass tiles the character occupies", () => {
    const anims: unknown[] = [];
    G.scene = { transferPlayer: () => {}, spriteset: () => ({ addUserAnimation: (...a: unknown[]) => anims.push(a) }) } as never;
    G.mapFactory = {
      getTerrainTagFromCoords: (_m: number, x: number, y: number) => ({ showsGrassRustle: x === 3 && y === 4 }),
      getRealTilePos: () => null,
    } as never;
    const event = { x: 3, y: 4, width: 1, height: 1, mapId: 7, map: { mapId: 7 } };
    EventHandlers.triggerSync("on_step_taken", event);
    expect(anims).toEqual([[1, 3, 4, true, 1]]); // GRASS_ANIMATION_ID, tinted, height 1
    event.x = 5;
    EventHandlers.triggerSync("on_step_taken", event);
    expect(anims).toHaveLength(1);
  });

  it("pbPokerus? until the Pokérus switch is on", () => {
    expect(pbPokerus()).toBe(true);
    G.gameSwitches.set(979, true);
    expect(pbPokerus()).toBe(false);
  });

  it("never counts Pokérus down: pokerusTime is never set (Ruby parity)", async () => {
    G.scene = null;
    await EventHandlers.trigger("on_frame_update");
    expect(happiness).not.toContain("pokerus");
    (G.pokemonGlobal as unknown as { pokerusTime: Date }).pokerusTime = new Date(2000, 0, 1);
    EventHandlers.triggerSync("on_frame_update");
    expect(happiness.filter((h) => h === "pokerus")).toHaveLength(2);
  });

  it("pbFacingTileRegular", () => {
    G.gameMap = { mapId: 12 } as never;
    expect(pbFacingTileRegular(6, { x: 1, y: 1, direction: 2 } as never)).toEqual([12, 2, 1]);
    expect(pbFacingTileRegular(null, { x: 1, y: 1, direction: 8 } as never)).toEqual([12, 1, 0]);
  });
});
