// Field movement on the real converted maps, driven tick by tick like the
// game loop: climbing and coming down Tohjo Falls while surfing (pbEndSurf
// must not take over a waterfall step), sliding on the Mahogany Gym's ice
// with a follower, and the cave entrance/exit scripts that set the escape
// point Dig returns to.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadAssetIndex } from "../../core/assets";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { loadGameData, preloadMaps } from "../../data/store";
import { Graphics } from "../../rgss/Graphics";
import { SceneMap } from "../../scenes/SceneMap";
import { GamePlayer } from "../GamePlayer";
import { GameScreen } from "../GameScreen";
import { GameSystem } from "../GameSystem";
import { G, GameSelfSwitches, GameSwitches, GameVariables, PokemonGlobalMetadata } from "../globals";
import { Interpreter } from "../Interpreter";
import { PokemonMapFactory } from "../MapFactory";
import { Pokemon } from "../pokemon/Pokemon";
import { evaluateAsync } from "../scriptApi";
import "../scripts/fieldMoves"; // the whole field module, as the game loads it
import { Followers } from "../following";
import type { GameFollowerFactory } from "../following/GameFollowerFactory";
import { GameStats } from "../trainer/GameStats";
import { Player } from "../trainer/Player";
import { FieldMoves } from "./FieldMoves";

// Graphics.update is a logic tick that returns at once (no frame scheduler here).
vi.mock("../../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../rgss/Graphics")>();
  const graphics = orig.Graphics as unknown as { frameCount: number; update: () => Promise<void> };
  graphics.update = async () => { graphics.frameCount++; };
  return orig;
});
// The cave transition draws on a full-screen bitmap (no OffscreenCanvas in node).
vi.mock("../../ui/SpriteWrapper", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/SpriteWrapper")>()),
  BitmapSprite: class {
    z = 0;
    color: unknown = null;
    bitmap = { fillRect: () => {} };
    dispose(): void {}
  },
}));

const DATA = resolve(import.meta.dirname, "../../../data");
const GAME = resolve(import.meta.dirname, "../../../..");

beforeAll(async () => {
  globalThis.fetch = (async (url: string) => {
    if (url === "/game/__index.json") {
      const files = (readdirSync(join(GAME, "Graphics/Characters"), { recursive: true }) as string[])
        .map((f) => `graphics/characters/${f.split("\\").join("/")}`.toLowerCase());
      const index = files.flatMap((f) => [f, f.replace(/\.[a-z]+$/, "")]);
      return { ok: true, status: 200, json: async () => index } as Response;
    }
    const text = readFileSync(join(DATA, String(url).replace(/^\/data\//, "")), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) as unknown } as Response;
  }) as typeof fetch;
  await loadAssetIndex();
  loadGameDataForTests();
  await loadGameData();
  for (const id of [14, 144, 295, 307]) await preloadMaps(id, 0);
});

const player = () => G.gamePlayer as unknown as GamePlayer;
const factory = () => G.gameTemp.followers as unknown as GameFollowerFactory;

/** A fresh session on `mapId`, with a Scene_Map whose miniupdate updates the player (and so the followers). */
function startOn(mapId: number, x: number, y: number, dir: number): void {
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameSwitches = new GameSwitches();
  G.gameVariables = new GameVariables();
  G.gameSelfSwitches = new GameSelfSwitches();
  G.gameSystem = new GameSystem();
  G.gameScreen = new GameScreen();
  G.gameSystem.mapInterpreter = new Interpreter(0, true);
  G.stats = new GameStats();
  const trainer = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = trainer as never;
  trainer.party.push(new Pokemon("TOTODILE", 30, trainer as never));
  const scene = Object.create(SceneMap.prototype) as SceneMap;
  Object.assign(scene, { miniupdate: async () => { await player().update(); } });
  G.scene = scene as never;
  G.gamePlayer = new GamePlayer() as never;
  new PokemonMapFactory(mapId);
  player().moveto(x, y);
  player().direction = dir;
}

/** Runs a coroutine to the end; returns the logic ticks it took. */
async function run(fn: () => Promise<unknown>): Promise<number> {
  const start = Graphics.frameCount;
  await fn();
  return Graphics.frameCount - start;
}

/** Scene_Map#update's player part, until the player and its followers stand still. */
async function walk(): Promise<void> {
  const p = player();
  for (let i = 0; i < 600; i++) {
    await Graphics.update();
    await p.update();
    const followersMoving = (G.pokemonGlobal.followers.length > 0) &&
      factory().getFollowerByIndex()!.moving();
    if (!p.moving() && !p.jumping() && !followersMoving && i > 1) return;
  }
}

describe("waterfalls while surfing (Tohjo Falls)", () => {
  it("climbs to the top still surfing, the follower right behind (pbEndSurf checks can_surf, not can_surf_freely)", async () => {
    startOn(307, 9, 12, 8);
    G.pokemonGlobal.surfing = true;
    Followers.add(3, "Partner", null); // any map event works as a (non-Pokémon) follower
    const ev = factory().getFollowerByIndex()!;
    ev.moveto(9, 13);
    await run(() => FieldMoves.pbAscendWaterfall());
    await run(() => walk());
    const p = player();
    // The waterfall's foot (9,12) is water and every tile up to the crest
    // (9,6) can be surfed, so the player isn't jumped off onto the waterfall.
    expect([p.x, p.y, G.pokemonGlobal.surfing]).toEqual([9, 5, true]);
    expect(G.stats.waterfallCount).toBe(1);
    expect([ev.x, ev.y]).toEqual([9, 6]);
  });

  it("comes down from the crest still surfing", async () => {
    startOn(307, 9, 5, 2);
    G.pokemonGlobal.surfing = true;
    // Stepping onto the crest runs :auto_move_player's pbDescendWaterfall.
    await run(async () => {
      player().moveDown();
      await walk();
    });
    const p = player();
    expect([p.x, p.y, G.pokemonGlobal.surfing]).toEqual([9, 12, true]);
    expect(G.stats.waterfallsDescended).toBe(1);
  });

  it("still jumps off the water onto land", () => {
    startOn(307, 10, 13, 2); // (10,14) below is the sandbank
    G.pokemonGlobal.surfing = true;
    expect(FieldMoves.pbEndSurf(0, 1)).toBe(true);
    expect([player().y, player().jumping()]).toEqual([14, true]);
  });
});

describe("ice (Mahogany Town Gym)", () => {
  it("slides until the next rock, the follower sliding behind", async () => {
    startOn(144, 10, 14, 8);
    Followers.add(8, "Partner", null);
    const ev = factory().getFollowerByIndex()!;
    ev.moveto(10, 15);
    await run(async () => {
      player().moveUp(); // onto the ice at (10,13)
      await walk();
    });
    const p = player();
    // (10,10) is a rock: the slide stops on (10,11).
    expect([p.x, p.y, p.direction, G.pokemonGlobal.sliding]).toEqual([10, 11, 8, false]);
    expect([ev.x, ev.y]).toEqual([10, 12]);
    await run(async () => {
      player().moveLeft(); // across to the west wall
      await walk();
    });
    expect([p.x, p.y]).toEqual([5, 11]);
    expect([ev.x, ev.y]).toEqual([6, 11]);
  });
});

describe("cave entrances (003_Overworld_MapTransitionAnims.rb)", () => {
  it("pbCaveEntrance sets the escape point behind the player and pbCaveExit erases it", async () => {
    startOn(14, 29, 11, 8); // Ruins of Alph, stepping into the Unown Cave entrance
    const ctx = { event: null, interpreter: null };
    await run(() => evaluateAsync({ call: "pbCaveEntrance", args: [] } as never, ctx));
    expect(G.pokemonGlobal.escapePoint).toEqual([14, 29, 12, 2]);
    await run(() => evaluateAsync({ call: "pbCaveExit", args: [] } as never, ctx));
    expect(G.pokemonGlobal.escapePoint).toEqual([]);
  });
});
