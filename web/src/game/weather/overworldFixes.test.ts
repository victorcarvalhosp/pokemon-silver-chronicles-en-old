// The overworld leftovers ported with the weather: the v20.1 Hotfixes'
// update_screen_position (a scrolled screen doesn't snap back to the player),
// Marin's staircase state surviving a save, Game_Screen#weather, the dynamic
// shadow sources (XPML_read) and pbEventCommentInput on the real maps.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Container } from "pixi.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { loadGameData, preloadMaps } from "../../data/store";
import { attachStage } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { SceneMap } from "../../scenes/SceneMap";
import { shadowSourcesOf, SpriteShadow, XPML_read } from "../../sprites/SpriteDynamicShadows";
import { pbEventCommentInput } from "../../ui/messages";
import "../field/EnhancedStaircases";
import "../field/SideStairs";
import { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { GamePlayer } from "../GamePlayer";
import { GameScreen } from "../GameScreen";
import { GameSystem } from "../GameSystem";
import { G, GameSelfSwitches, GameSwitches, GameVariables, PokemonGlobalMetadata } from "../globals";
import { Interpreter } from "../Interpreter";
import { PokemonMapFactory } from "../MapFactory";
import { GameStats } from "../trainer/GameStats";
import { Player } from "../trainer/Player";

vi.mock("../../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../rgss/Graphics")>();
  const graphics = orig.Graphics as unknown as { frameCount: number; update: () => Promise<void> };
  graphics.update = async () => { graphics.frameCount++; };
  return orig;
});

const DATA = resolve(import.meta.dirname, "../../../data");

beforeAll(async () => {
  globalThis.fetch = (async (url: string) => {
    if (url === "/game/__index.json") return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    const text = readFileSync(join(DATA, String(url).replace(/^\/data\//, "")), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) as unknown } as Response;
  }) as typeof fetch;
  loadGameDataForTests();
  await loadGameData();
  for (const id of [1, 59, 740]) await preloadMaps(id, 0);
  attachStage(new Container());
});

const player = () => G.gamePlayer as unknown as GamePlayer;
const map = () => G.gameMap as unknown as GameMap;

function startOn(mapId: number, x: number, y: number, dir: number): void {
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameSwitches = new GameSwitches();
  G.gameVariables = new GameVariables();
  G.gameSelfSwitches = new GameSelfSwitches();
  G.gameSystem = new GameSystem();
  G.gameScreen = new GameScreen();
  G.gameSystem.mapInterpreter = new Interpreter(0, true);
  G.stats = new GameStats();
  G.player = new Player("Gold", GameData.TrainerType.keys()[0]!) as never;
  const scene = Object.create(SceneMap.prototype) as SceneMap;
  Object.assign(scene, { miniupdate: async () => { await player().update(); } });
  G.scene = scene as never;
  G.gamePlayer = new GamePlayer() as never;
  new PokemonMapFactory(mapId);
  player().moveto(x, y);
  player().direction = dir;
}

async function step(move: () => void): Promise<void> {
  move();
  for (let i = 0; i < 120; i++) {
    await Graphics.update();
    await player().update();
    if (!player().moving() && i > 1) return;
  }
}

describe("update_screen_position (v20.1 Hotfixes, Overworld bug fixes.rb:289)", () => {
  it("keeps a scrolled screen where it is; it only follows the player past the centre", async () => {
    startOn(1, 19, 15, 2); // New Bark Town (38x30): the player starts centred
    const x0 = map().displayX;
    const y0 = map().displayY;
    expect([x0, y0]).toEqual([19 * 128 - 960, 15 * 128 - 704]);
    map().displayY -= 2 * 128; // pbScrollMap(8, 2, ...): the player is now 2 tiles below the centre
    await step(() => player().moveRight());
    // Moving right from the centre: the screen follows horizontally, but stays scrolled
    // (the core version would put display_y back on the player).
    expect([map().displayX, map().displayY]).toEqual([x0 + 128, y0 - 256]);
    await step(() => player().moveUp());
    // Moving up towards the centre: no vertical scrolling.
    expect([map().displayX, map().displayY]).toEqual([x0 + 128, y0 - 256]);
    await step(() => player().moveDown());
    // Moving down away from the centre: the screen follows the step.
    expect([map().displayX, map().displayY]).toEqual([x0 + 128, y0 - 128]);
  });
});

describe("Marin's staircases in the save (Game_Player marshals every ivar)", () => {
  it("restores the stair the player stands on and the smooth-scroll offset", () => {
    startOn(1, 10, 10, 6);
    const p = player();
    p.slope(2, -1, 0, 1, 16);
    p.stairLastIncrement = 12;
    p.viewOffsetY = -24;
    p.realOffsetY = 8;
    expect(p.onStair()).toBe(true);
    const saved = JSON.parse(JSON.stringify(p.saveState())) as Record<string, unknown>;
    const q = new GamePlayer();
    q.loadState(saved);
    expect(q.onStair()).toBe(true);
    expect([q.stairStartX, q.stairStartY, q.stairEndX, q.stairEndY, q.stairYPosition, q.stairYHeight, q.stairBeginOffset])
      .toEqual([10, 10, 12, 9, 0, 1, 16]);
    expect([q.stairLastIncrement, q.viewOffsetY, q.realOffsetY]).toEqual([12, -24, 8]);
    // Off the stair, the cleared (nil) fields come back cleared.
    p.clearStairData();
    const r = new GamePlayer();
    r.loadState(JSON.parse(JSON.stringify(p.saveState())) as Record<string, unknown>);
    expect(r.onStair()).toBe(false);
  });
});

describe("Game_Screen#weather", () => {
  it("takes RMXP's weather numbers or GameData::Weather IDs; max = (power + 1) * 60 / 10", () => {
    const s = new GameScreen();
    s.weather(1, 9, 1);
    expect([s.weatherType, s.weatherMax]).toEqual(["Rain", 60]);
    s.weather(3, 4, 0);
    expect([s.weatherType, s.weatherMax]).toEqual(["Snow", 30]);
    s.weather("Sandstorm", 0, 0);
    expect([s.weatherType, s.weatherMax]).toEqual(["Sandstorm", 6]);
    s.weather(0, 5, 0);
    expect(s.weatherType).toBe("None");
  });
});

describe("dynamic shadows (009_Sprite_DynamicShadows.rb)", () => {
  it("finds the Goldenrod Tunnel's shadow source and gives only the player a shadow", () => {
    startOn(59, 17, 22, 8);
    const sources = shadowSourcesOf(map());
    expect(sources.map((s) => [(s[0] as GameEvent).id, ...s.slice(1)])).toEqual([[13]]);
    // "begin Shadow" (events casting shadows) isn't on any event.
    for (const ev of map().events.values()) expect(XPML_read(map(), "Shadow", ev, 4)).toBeNull();
  });

  it("fades the shadow with the distance to the source", () => {
    startOn(59, 17, 23, 8); // one tile below the light at (17,20)... three tiles
    const source = map().events.get(13)!;
    const shadow = new SpriteShadow(null, player(), [source]);
    const dy = source.screenY() - (player().screenY() - 5);
    const distance = dy * dy;
    expect(shadow.sprite.opacity).toBe(Math.floor((100 * 13_000) / (Math.floor((distance * 370) / 350) + 6000)));
    expect(shadow.sprite.angle).toBeCloseTo(57.3 * Math.atan2(0, dy));
    shadow.dispose();
  });
});

describe("pbEventCommentInput", () => {
  it("reads the particle effect after the \"Particle Engine Type\" comment line", () => {
    startOn(740, 5, 5, 2);
    const withSoot = [...map().events.values()].filter((ev) => pbEventCommentInput(ev, 1, "Particle Engine Type"));
    expect(withSoot.length).toBeGreaterThan(0);
    for (const ev of withSoot) expect(pbEventCommentInput(ev, 1, "Particle Engine Type")).toEqual(["soot"]);
    expect(pbEventCommentInput({ list: [{ cmd: "comment", lines: ["Particle Engine Type"] }, { cmd: "comment", lines: ["fire"] }] }, 1, "Particle Engine Type"))
      .toEqual(["fire"]);
  });
});
