// Following Pokemon EX's Poké Center animation (Refresh.rb:240-280):
// pbSetPokemonCenter queues it, Recover All (command_314) puts the follower
// back in its ball, and it comes out again once the nurse's event has ended.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../../data/events";

const log: string[] = [];
let active = true;
vi.mock("./FollowingPkmn", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./FollowingPkmn")>();
  Object.assign(orig.FollowingPkmn, {
    active: () => active,
    toggleOff: async () => { log.push("toggle_off"); active = false; },
    toggleOn: async () => { log.push("toggle_on"); active = true; },
    refresh: async () => {},
  });
  return orig;
});
vi.mock("../../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../rgss/Graphics")>();
  const graphics = orig.Graphics as unknown as { frameCount: number; update: () => Promise<void> };
  graphics.update = async () => { graphics.frameCount++; };
  return orig;
});

const { G, GameTemp, PokemonGlobalMetadata } = await import("../globals");
const { GameSystem } = await import("../GameSystem");
const { Interpreter } = await import("../Interpreter");
const { defineScript } = await import("../scriptApi");
await import("./aliases");
await import("../scripts/eventScripts");

beforeEach(() => {
  log.length = 0;
  active = true;
  G.gameTemp = new GameTemp();
  G.gameSystem = new GameSystem();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.player = { healParty: () => log.push("heal") } as never;
  G.gamePlayer = { x: 5, y: 6, direction: 8 } as never;
  G.gameMap = { mapId: 25, needRefresh: false, events: new Map() } as never;
  G.mapFactory = { areConnected: () => true } as never;
});

async function run(list: Command[]): Promise<void> {
  const interp = new Interpreter();
  interp.setup(list, 0, 25);
  for (let i = 0; i < 30; i++) {
    await interp.update();
    log.push(interp.running() ? "." : "end");
    if (!interp.running() && log.includes("toggle_on")) break;
  }
}

describe("Poké Center animation with a follower", () => {
  it("puts the follower away on Recover All and lets it out after the event", async () => {
    defineScript("testMark", () => { log.push("still healing"); });
    await run([
      { cmd: "call", fn: "Kernel.pbSetPokemonCenter", args: [] },
      { cmd: "recoverAll" },
      { cmd: "wait", seconds: 0.05 } as Command,
      { cmd: "call", fn: "testMark", args: [] },
    ]);
    const steps = log.filter((s) => s !== ".");
    // toggle_on runs in the update where the event ends (Interpreter#update alias)
    expect(steps).toEqual(["heal", "toggle_off", "still healing", "toggle_on", "end"]);
    expect(G.gameTemp.pokecenterFollowingPkmn).toBe(0);
    expect(G.pokemonGlobal.pokecenterMapId).toBe(25);
  });

  it("does nothing without an active follower", async () => {
    active = false;
    await run([{ cmd: "call", fn: "Kernel.pbSetPokemonCenter", args: [] }, { cmd: "recoverAll" }]);
    expect(log.filter((s) => s.startsWith("toggle"))).toEqual([]);
  });
});
