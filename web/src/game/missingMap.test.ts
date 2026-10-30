// Game.load_map's missing-map branch (001_StartGame.rb:83-92): DEBUG asks for a
// map to warp to; a released game can't continue.
import { describe, expect, it, vi } from "vitest";
import { Data } from "../data/store";

const dbg = vi.hoisted(() => ({ on: false, messages: [] as string[], warp: null as [number, number, number] | null }));
vi.mock("../core/debug", async (orig) => ({
  ...(await orig<typeof import("../core/debug")>()),
  get DEBUG() { return dbg.on; },
}));
vi.mock("../ui/messages", async (orig) => ({
  ...(await orig<typeof import("../ui/messages")>()),
  pbMessage: async (m: string) => { dbg.messages.push(m); return 0; },
}));
vi.mock("../debug/DebugMenuExtraCode", () => ({ pbWarpToMap: async () => dbg.warp }));

const { pbRecoverMissingMap } = await import("./Game");
const { G } = await import("./globals");

describe("pbRecoverMissingMap", () => {
  it("does nothing when the saved map exists", async () => {
    Data.mapInfos.set(1, { id: 1, name: "Test" } as never);
    expect(await pbRecoverMissingMap(1)).toBeNull();
  });

  it("stops the game outside DEBUG", async () => {
    dbg.on = false;
    await expect(pbRecoverMissingMap(99999)).rejects.toThrow("The map was not found. The game cannot continue.");
  });

  it("in DEBUG, says so and warps to the chosen map (or gives up if none is chosen)", async () => {
    dbg.on = true;
    dbg.warp = [5, 3, 4];
    G.gamePlayer = null as never;
    expect(await pbRecoverMissingMap(99999)).toEqual([5, 3, 4]);
    // Regression: the warp screen's map setup reads $game_player, which a load hasn't made yet
    expect(G.gamePlayer).not.toBeNull();
    expect(dbg.messages).toEqual(["Map 99999 was not found."]);
    dbg.warp = null;
    await expect(pbRecoverMissingMap(99999)).rejects.toThrow("Map 99999 was not found.");
  });
});
