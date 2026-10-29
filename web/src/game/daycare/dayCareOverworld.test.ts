// On the real Day Care map (53): the deposited Pokémon added at runtime by
// pbDayCareShowPokemonOW come back after loading a save made there (Ruby's
// save marshals $game_map.events with them, and the map's autorun that adds
// them doesn't run again once switch 686 is on), and an egg hatches as the
// step that brings it to 0 ends, inside the player's update (the
// :on_player_step_taken handlers are awaited by pbOnStepTaken, as in Ruby).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadAssetIndex } from "../../core/assets";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { loadGameData, preloadMaps } from "../../data/store";
import { Graphics } from "../../rgss/Graphics";
import { SceneMap } from "../../scenes/SceneMap";
import { pbHatchEggsOnStep } from "../../ui/hatching/EggHatching";
import { EventHandlers } from "../eventHandlers";
import type { GameMap } from "../GameMap";
import { GamePlayer } from "../GamePlayer";
import { GameScreen } from "../GameScreen";
import { GameSystem } from "../GameSystem";
import { G, GameSelfSwitches, GameSwitches, GameTemp, GameVariables, PokemonGlobalMetadata } from "../globals";
import { Interpreter } from "../Interpreter";
import { PokemonMapFactory } from "../MapFactory";
import { PokemonMapMetadata } from "../PokemonMapMetadata";
import { PokemonBag } from "../items/PokemonBag";
import { Pokemon } from "../pokemon/Pokemon";
import { PokemonStorage } from "../pokemon/PokemonStorage";
import { SaveData } from "../save/SaveData";
import { restoreMapState } from "../save/values";
import { GameStats } from "../trainer/GameStats";
import { Player } from "../trainer/Player";
import { DayCare } from "./DayCare";
import { pbDayCareShowPokemonOW } from "./DayCareOverworld";

vi.mock("../../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../rgss/Graphics")>();
  const graphics = orig.Graphics as unknown as { frameCount: number; update: () => Promise<void> };
  graphics.update = async () => { graphics.frameCount++; };
  return orig;
});
vi.mock("../../sprites/cache", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../sprites/cache")>();
  orig.Cache.ensureCharacter = (async () => {}) as never;
  return orig;
});
const DATA = resolve(import.meta.dirname, "../../../data");
const GAME = resolve(import.meta.dirname, "../../../..");

beforeAll(async () => {
  globalThis.fetch = (async (url: string) => {
    if (url === "/game/__index.json") {
      const files = (readdirSync(join(GAME, "Graphics/Characters"), { recursive: true }) as string[])
        .map((f) => `graphics/characters/${f.split("\\").join("/")}`.toLowerCase());
      return { ok: true, status: 200, json: async () => files.flatMap((f) => [f, f.replace(/\.[a-z]+$/, "")]) } as Response;
    }
    const text = readFileSync(join(DATA, String(url).replace(/^\/data\//, "")), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) as unknown } as Response;
  }) as typeof fetch;
  await loadAssetIndex();
  loadGameDataForTests();
  await loadGameData();
  await preloadMaps(53, 0);
});

const player = () => G.gamePlayer as unknown as GamePlayer;
const map = () => G.gameMap as unknown as GameMap;

function startOn(mapId: number, x: number, y: number): Player {
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameSwitches = new GameSwitches();
  G.gameVariables = new GameVariables();
  G.gameSelfSwitches = new GameSelfSwitches();
  G.gameSystem = new GameSystem();
  G.gameScreen = new GameScreen();
  G.gameTemp = new GameTemp();
  G.gameSystem.mapInterpreter = new Interpreter(0, true);
  G.stats = new GameStats();
  G.bag = new PokemonBag() as never;
  G.storage = new PokemonStorage() as never;
  (G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap = new PokemonMapMetadata();
  const trainer = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = trainer as never;
  const scene = Object.create(SceneMap.prototype) as SceneMap;
  Object.assign(scene, { miniupdate: async () => {}, spriteset: () => null });
  G.scene = scene as never;
  G.gamePlayer = new GamePlayer() as never;
  new PokemonMapFactory(mapId);
  player().moveto(x, y);
  return trainer;
}

const dayCareEvents = () => [...map().events.values()].filter((e) => JSON.stringify(e.list ?? []).includes("pbDaycareInteract"));

describe("DayCare Overworld Pokemon", () => {
  it("are restored when a save made on the Day Care map is loaded", () => {
    const trainer = startOn(53, 45, 18);
    trainer.party.push(new Pokemon("PIKACHU", 20, trainer as never), new Pokemon("MARILL", 18, trainer as never));
    DayCare.depositInternal(0);
    DayCare.depositInternal(0);
    pbDayCareShowPokemonOW();
    G.gameSwitches.set(686, true);
    const before = dayCareEvents().map((e) => [e.id, e.characterName, e.x, e.y]);
    expect(before).toHaveLength(2);
    expect(before.map((e) => [e[2], e[3]])).toEqual([[43, 17], [46, 20]]); // MARILL is Water-type
    dayCareEvents()[0]!.moveto(42, 17);
    const hash = JSON.parse(JSON.stringify(SaveData.compileSaveHash())) as Parameters<typeof SaveData.loadAllValues>[0];
    SaveData.loadAllValues(hash);
    restoreMapState();
    const after = dayCareEvents().map((e) => [e.id, e.characterName, e.x, e.y]);
    expect(after).toEqual([[before[0]![0], before[0]![1], 42, 17], before[1]]);
    expect(dayCareEvents().every((e) => e.savedWithData)).toBe(true);
  });
});

describe("Egg hatching", () => {
  it("happens as the step ends, inside the player's update", async () => {
    const trainer = startOn(53, 45, 18);
    const egg = new Pokemon("TOGEPI", 1, trainer as never);
    egg.stepsToHatch = 1;
    trainer.party.push(new Pokemon("PIKACHU", 20, trainer as never), egg);
    const hatched: { frame: number; x: number; moving: boolean }[] = [];
    EventHandlers.add("on_player_step_taken", "hatch_eggs", () => pbHatchEggsOnStep(async (e) => {
      for (let i = 0; i < 10; i++) await Graphics.update(); // the hatching scene
      hatched.push({ frame: Graphics.frameCount, x: player().x, moving: player().moving() });
      e.stepsToHatch = 0;
    }));
    player().moveLeft();
    let updates = 0;
    while (player().moving() && updates < 100) {
      await player().update();
      updates++;
    }
    expect(hatched).toHaveLength(1);
    expect(hatched[0]).toMatchObject({ x: 44, moving: false });
    // The scene ran within the update that finished the step: nothing after it.
    expect(Graphics.frameCount).toBe(hatched[0]!.frame);
  });
});
