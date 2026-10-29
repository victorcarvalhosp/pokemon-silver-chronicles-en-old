// Event commands 131-133 (Change Windowskin / Battle BGM / Battle End ME) used
// to fall through into Call Save Screen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../data/events";
import { GameSystem } from "./GameSystem";
import { G, PokemonGlobalMetadata, PokemonSystem } from "./globals";
import { Interpreter } from "./Interpreter";
import { defineScript } from "./scriptApi";

vi.mock("../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../rgss/Graphics")>();
  const graphics = orig.Graphics as unknown as { frameCount: number; update: () => Promise<void> };
  graphics.update = async () => { graphics.frameCount++; };
  return orig;
});
vi.mock("../ui/messageConfig", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../ui/messageConfig")>();
  orig.MessageConfig.pbSetSpeechFrame = () => {};
  return orig;
});

let saves = 0;
defineScript("pbSaveScreen", () => { saves++; return true; });

async function run(list: Command[]): Promise<void> {
  const interp = new Interpreter();
  interp.setup(list, 0, 1);
  for (let i = 0; i < 20 && interp.running(); i++) await interp.update();
}

beforeEach(() => {
  saves = 0;
  G.gameSystem = new GameSystem();
  G.pokemonSystem = new PokemonSystem();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameMap = { mapId: 1, needRefresh: false, events: new Map() } as never;
});

describe("Change Windowskin / Battle BGM / Battle End ME", () => {
  it("don't open the save screen", async () => {
    await run([
      { cmd: "windowskin", name: "speech hgss 3" },
      { cmd: "battleBgm", audio: { name: "Battle wild", volume: 100, pitch: 100 } },
      { cmd: "battleEndMe", audio: { name: "Victory", volume: 100, pitch: 100 } },
    ] as unknown as Command[]);
    expect(saves).toBe(0);
    expect(G.pokemonSystem.textskin).toBe(2);
    expect(G.pokemonGlobal.nextBattleBGM).toEqual({ name: "Battle wild", volume: 100, pitch: 100 });
  });

  it("Call Save Screen still opens it", async () => {
    await run([{ cmd: "callSave" }] as unknown as Command[]);
    expect(saves).toBe(1);
  });
});
