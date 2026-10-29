// pbDayNightTint goes on tiles (TilemapRenderer#tone) and character sprites
// only, as in Ruby (002_Scene_Map.rb:160, 003_Sprite_Character.rb:155-160):
// the map viewport itself isn't toned, so light glows, fog and weather keep
// their colours at night, and events named "regulartone" stay untinted.
import { Container, Texture, TextureSource, type Sprite as PixiSprite } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tileset } from "../data/types";
import { PBDayNight, pbDayNightTint } from "../game/dayNight";
import { GameEvent } from "../game/GameEvent";
import { G } from "../game/globals";
import { TilemapRenderer, type TilemapSource } from "../map/TilemapRenderer";
import type { Bitmap } from "../rgss/Bitmap";
import { Sprite, Viewport, attachStage } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Tone } from "../rgss/types";
import { SpriteCharacter } from "./SpriteCharacter";

vi.mock("../game/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../game/metadata")>()),
  mapMetadata: (id: number) => ({ outdoorMap: id === 10 }),
}));

const NIGHT = new Tone(-70, -90, 15, 55); // 0:00 in HOURLY_TONES

function tileset(): Tileset {
  return {
    id: 1, name: "", tilesetName: "", autotileNames: [], panoramaName: "", panoramaHue: 0,
    fog: { name: "", hue: 0, opacity: 0, blendType: 0, zoom: 100, sx: 0, sy: 0 },
    battlebackName: "", passages: [], priorities: [], terrainTags: [],
  };
}

const source: TilemapSource = { mapId: 10, width: 20, height: 15, tileset: tileset(), displayX: 0, displayY: 0, tile: (_x, _y, l) => (l === 0 ? 400 : 0) };

/** A tile-graphic event (no character sheet to load). */
function event(name: string): GameEvent {
  const e = Object.create(GameEvent.prototype) as GameEvent;
  const fields: Record<string, unknown> = {
    event: { name }, tileId: 400, characterName: "", characterHue: 0, bushDepth: 0, width: 1, height: 1, transparent: false,
    pattern: 0, direction: 2, bobHeight: 0, opacity: 255, blendType: 0, animationId: 0,
    shouldUpdate: () => true, screenX: () => 0, screenY: () => 0, screenZ: () => 0,
  };
  for (const [k, v] of Object.entries(fields)) Object.defineProperty(e, k, { value: v, writable: true });
  return e;
}

attachStage(new Container());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 29, 0, 0));
  Graphics.frameCount += 100_000; // getTone recomputes (it caches for 30 s)
  PBDayNight.getTone();
  G.scene = { transferPlayer: () => {} } as never; // $scene.is_a?(Scene_Map)
  G.gameMap = { mapId: 10 } as never;
});
afterEach(() => vi.useRealTimers());

describe("day/night tint", () => {
  it("tones the tiles' graphics, not the map viewport", () => {
    const container = new Container({ sortableChildren: true });
    const tile = new TextureSource({ width: 32, height: 32 });
    const toned = new TextureSource({ width: 32, height: 32 });
    const renderer = new TilemapRenderer(container);
    const calls: Tone[] = [];
    renderer.textureFor = () => new Texture({ source: tile });
    (renderer as unknown as { toneSource: (s: TextureSource, t: Tone) => TextureSource }).toneSource = (_s, t) => {
      calls.push(t.clone());
      return toned;
    };
    pbDayNightTint(renderer);
    expect(renderer.tone.equals(NIGHT)).toBe(true);
    renderer.draw([source], 0);
    const drawn = (container.children as PixiSprite[]).filter((s) => s.visible);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((s) => s.texture.source === toned)).toBe(true);
    expect(calls.length).toBe(1); // once per tone change, not per tile
    expect(container.filters ?? []).toHaveLength(0);
    // Indoors: no tone, the original graphics.
    G.gameMap = { mapId: 11 } as never;
    pbDayNightTint(renderer);
    renderer.draw([source], 0);
    expect((container.children as PixiSprite[]).filter((s) => s.visible).every((s) => s.texture.source === tile)).toBe(true);
  });

  it("tints character sprites but not regulartone events or other sprites", () => {
    const viewport = new Viewport(0, 0, 512, 384);
    const bitmap = { width: 32, height: 32, isDisposed: () => false } as unknown as Bitmap;
    const npc = new SpriteCharacter(viewport, event("Lass"), () => bitmap);
    const lamp = new SpriteCharacter(viewport, event("Lamp regulartone"), () => bitmap);
    expect(npc.sprite.tone.equals(NIGHT)).toBe(true);
    expect(lamp.sprite.tone.isZero()).toBe(true);
    const glow = new Sprite(viewport); // a LightEffect's glow
    expect(glow.tone.isZero()).toBe(true);
  });

  it("does nothing outside the map scene", () => {
    G.scene = null;
    const s = { tone: new Tone(1, 2, 3, 4) };
    pbDayNightTint(s);
    expect(s.tone.equals(new Tone(1, 2, 3, 4))).toBe(true);
  });
});
