// Port of Data/Scripts/006_Map renderer/001_TilemapRenderer.rb.
//
// Keeps a fixed grid of tile sprites covering the screen (plus one extra row
// and column) and re-points them at the right tile each frame, for the
// current map and every connected map in view. Tiles live in the same
// container as character sprites so priority tiles sort above or below
// characters by z, exactly like RMXP. Like every RGSS Sprite, a tile breaks z
// ties by creation order (see display.ts): a tile stack's three layers share
// z 0, and the sprite drawing a layer changes z as the screen scrolls.

import { Container, Rectangle, RenderTexture, Sprite, Texture, TextureSource } from "pixi.js";
import { graphicsPath, loadImage, loadImageStrips } from "../core/assets";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../core/screen";
import { terrainTag } from "../data/gameData/terrainTag";
import type { Tileset } from "../data/types";
import { Bitmap } from "../rgss/Bitmap";
import { newZStamp, zIndexOf } from "../rgss/display";
import { pixiRenderer } from "../rgss/Graphics";
import { ToneFilter } from "../rgss/ToneFilter";
import { Tone } from "../rgss/types";
import {
  SOURCE_TILE as T,
  TILESET_START_ID,
  TILESET_TILES_PER_ROW,
  TILES_PER_AUTOTILE,
  autotileFrameDuration,
  expandAutotile,
} from "./autotiles";

const STRIP_HEIGHT = 4096;
const TILES_H = Math.ceil(SCREEN_WIDTH / T) + 1;
const TILES_V = Math.ceil(SCREEN_HEIGHT / T) + 1;

class TilesetTextures {
  sources: TextureSource[] = [];
  strips: ImageBitmap[] = [];
  private cache = new Map<number, Texture>();

  static async load(name: string): Promise<TilesetTextures> {
    const set = new TilesetTextures();
    if (!name) return set;
    const image = await loadImageStrips(graphicsPath("Tilesets", name), STRIP_HEIGHT);
    if (!image) console.warn(`Missing tileset graphic: ${name}`);
    set.strips = image?.strips ?? [];
    set.sources = set.strips.map((s) => TextureSource.from(s));
    return set;
  }

  private locate(tileId: number): { strip: number; x: number; y: number } | null {
    const index = tileId - TILESET_START_ID;
    const x = (index % TILESET_TILES_PER_ROW) * T;
    const y = Math.floor(index / TILESET_TILES_PER_ROW) * T;
    const strip = Math.floor(y / STRIP_HEIGHT);
    const src = this.strips[strip];
    if (!src || (y % STRIP_HEIGHT) + T > src.height) return null;
    return { strip, x, y: y % STRIP_HEIGHT };
  }

  texture(tileId: number): Texture | null {
    let tex = this.cache.get(tileId);
    if (tex) return tex;
    const at = this.locate(tileId);
    if (!at) return null;
    tex = new Texture({ source: this.sources[at.strip]!, frame: new Rectangle(at.x, at.y, T, T) });
    this.cache.set(tileId, tex);
    return tex;
  }

  /** One tile as a Bitmap (pbGetTileBitmap), for tile-graphic events. */
  bitmap(tileId: number): Bitmap | null {
    const at = this.locate(tileId);
    if (!at) return null;
    const bmp = new Bitmap(T, T);
    bmp.ctx.drawImage(this.strips[at.strip]!, at.x, at.y, T, T, 0, 0, T, T);
    return bmp;
  }
}

class Autotile {
  private cache = new Map<number, Texture>();
  readonly frames: number;
  private constructor(
    private source: TextureSource,
    private single: boolean,
    readonly frameDuration: number,
  ) {
    this.frames = Math.max(Math.floor(source.width / T), 1);
  }

  static async load(name: string): Promise<Autotile | null> {
    if (!name) return null;
    const image = await loadImage(graphicsPath("Autotiles", name));
    if (!image) {
      console.warn(`Missing autotile graphic: ${name}`);
      return null;
    }
    const expanded = expandAutotile(image);
    return new Autotile(TextureSource.from(expanded), expanded.height === T, autotileFrameDuration(name));
  }

  frameAt(timer: number): number {
    return this.frames < 2 ? 0 : Math.floor(timer / this.frameDuration) % this.frames;
  }

  texture(tileId: number, frame: number): Texture {
    const key = (tileId % TILES_PER_AUTOTILE) * 1000 + frame;
    let tex = this.cache.get(key);
    if (!tex) {
      const y = this.single ? 0 : (tileId % TILES_PER_AUTOTILE) * T;
      tex = new Texture({ source: this.source, frame: new Rectangle(frame * T, y, T, T) });
      this.cache.set(key, tex);
    }
    return tex;
  }
}

/** TilemapRenderer::TileSprite, with the creation stamp mkxp sorts z ties by. */
class TileSprite extends Sprite {
  readonly stamp = newZStamp();
}

/**
 * refresh_tile_z with the v20.1 Hotfixes' +1 ("Fixed priority 1 tiles appearing
 * below the player at larger screen sizes"). `y` is the row in the tile sprite
 * grid, not a map y.
 */
export function tileZ(y: number, priority: number, showsReflections: boolean, isBridge: boolean, bridge: number): number {
  if (showsReflections) return -100;
  if (isBridge && bridge > 0) return 0;
  return priority === 0 ? 0 : y * T + priority * T + T + 1;
}

/** What the renderer needs from each map being drawn. */
export interface TilemapSource {
  mapId: number;
  width: number;
  height: number;
  tileset: Tileset;
  /** Top-left of the screen in map pixels (Essentials: display_x / X_SUBPIXELS). */
  displayX: number;
  displayY: number;
  tile(x: number, y: number, layer: number): number;
}

export class TilemapRenderer {
  private sprites: TileSprite[][][] = [];
  private tilesets = new Map<string, Promise<TilesetTextures>>();
  private tilesetsReady = new Map<string, TilesetTextures>();
  private autotiles = new Map<string, Promise<Autotile | null>>();
  private autotilesReady = new Map<string, Autotile | null>();
  private timer = 0;
  /**
   * TilemapRenderer#tone: Scene_Map sets it every frame with pbDayNightTint.
   * Ruby gives each tile sprite this tone; here the tile graphics are toned
   * once per tone change instead (toneSource), so only tiles are tinted and
   * the rest of the map viewport (light glows, fog, weather) keeps its colours.
   */
  readonly tone = new Tone();
  private appliedTone = new Tone();
  private tonedSources = new Map<TextureSource, TextureSource>();
  private tonedTextures = new Map<Texture, Texture>();

  constructor(container: Container) {
    for (let i = 0; i < TILES_H; i++) {
      const col: TileSprite[][] = [];
      for (let j = 0; j < TILES_V; j++) {
        col.push([0, 1, 2].map(() => {
          const s = new TileSprite();
          s.visible = false;
          container.addChild(s);
          return s;
        }));
      }
      this.sprites.push(col);
    }
  }

  /** Removes the tile sprites from the screen (TilemapRenderer#dispose). */
  dispose(): void {
    for (const col of this.sprites) for (const stack of col) for (const s of stack) s.destroy();
    this.sprites = [];
    this.clearToned();
  }

  isDisposed(): boolean {
    return this.sprites.length === 0;
  }

  /** Loads the tileset and autotile graphics (add_tileset / add_autotile). */
  async prepare(tileset: Tileset): Promise<void> {
    const name = tileset.tilesetName;
    if (!this.tilesets.has(name)) {
      this.tilesets.set(name, TilesetTextures.load(name).then((t) => {
        this.tilesetsReady.set(name, t);
        return t;
      }));
    }
    const jobs: Promise<unknown>[] = [this.tilesets.get(name)!];
    for (const a of tileset.autotileNames) {
      if (!a) continue;
      if (!this.autotiles.has(a)) {
        this.autotiles.set(a, Autotile.load(a).then((t) => {
          this.autotilesReady.set(a, t);
          return t;
        }));
      }
      jobs.push(this.autotiles.get(a)!);
    }
    await Promise.all(jobs);
  }

  update(dt: number): void {
    this.timer += dt;
  }

  textureFor(tileset: Tileset, tileId: number): Texture | null {
    if (tileId < TILES_PER_AUTOTILE) return null;
    if (tileId < TILESET_START_ID) {
      const name = tileset.autotileNames[Math.floor(tileId / TILES_PER_AUTOTILE) - 1];
      const autotile = name ? this.autotilesReady.get(name) : null;
      return autotile ? autotile.texture(tileId, autotile.frameAt(this.timer)) : null;
    }
    return this.tilesetsReady.get(tileset.tilesetName)?.texture(tileId) ?? null;
  }

  tileBitmap(tileset: Tileset, tileId: number): Bitmap | null {
    return this.tilesetsReady.get(tileset.tilesetName)?.bitmap(tileId) ?? null;
  }

  /**
   * A copy of a tile graphic with `tone` applied (RGSS Sprite#tone on each tile
   * sprite), drawn through the same shader as every other toned sprite.
   */
  protected toneSource(source: TextureSource, tone: Tone): TextureSource {
    const renderer = pixiRenderer();
    if (!renderer) return source;
    const sprite = new Sprite(new Texture({ source }));
    const filter = new ToneFilter();
    filter.set(tone, null);
    sprite.filters = [filter];
    const target = RenderTexture.create({ width: source.width, height: source.height, scaleMode: "nearest" });
    renderer.render({ container: sprite, target, clear: true });
    sprite.destroy();
    filter.destroy();
    return target.source;
  }

  private clearToned(): void {
    for (const source of this.tonedSources.values()) source.destroy();
    this.tonedSources.clear();
    for (const tex of this.tonedTextures.values()) tex.destroy();
    this.tonedTextures.clear();
  }

  /** `texture` as drawn with the current tone. */
  private toned(texture: Texture): Texture {
    if (this.tone.isZero()) return texture;
    let tex = this.tonedTextures.get(texture);
    if (tex) return tex;
    let source = this.tonedSources.get(texture.source);
    if (!source) {
      source = this.toneSource(texture.source, this.tone);
      this.tonedSources.set(texture.source, source);
    }
    tex = source === texture.source ? texture : new Texture({ source, frame: texture.frame.clone() });
    this.tonedTextures.set(texture, tex);
    return tex;
  }

  /** Draws `maps` (the current map first), like TilemapRenderer#update. */
  draw(maps: TilemapSource[], bridge: number): void {
    const current = maps[0];
    if (!current) return;
    if (!this.tone.equals(this.appliedTone)) { // TilemapRenderer#update: tone changed
      this.clearToned();
      this.appliedTone.set(this.tone);
    }
    const dx = Math.round(current.displayX);
    const dy = Math.round(current.displayY);
    const pixelOffsetX = dx - Math.floor(dx / T) * T;
    const pixelOffsetY = dy - Math.floor(dy / T) * T;
    const visited: boolean[][] = this.sprites.map((col) => col.map(() => false));
    for (const map of maps) {
      const mdx = Math.round(map.displayX);
      const mdy = Math.round(map.displayY);
      const tileOffsetX = Math.floor(mdx / T);
      const tileOffsetY = Math.floor(mdy / T);
      const startX = Math.max(-tileOffsetX, 0);
      const startY = Math.max(-tileOffsetY, 0);
      const endX = Math.min(TILES_H - 1, map.width - tileOffsetX - 1);
      const endY = Math.min(TILES_V - 1, map.height - tileOffsetY - 1);
      if (startX > endX || startY > endY) continue;
      for (let i = startX; i <= endX; i++) {
        const tileX = i + tileOffsetX;
        for (let j = startY; j <= endY; j++) {
          const tileY = j + tileOffsetY;
          const stack = this.sprites[i]![j]!;
          for (let layer = 0; layer < 3; layer++) {
            const sprite = stack[layer]!;
            const tileId = map.tile(tileX, tileY, layer);
            const texture = this.textureFor(map.tileset, tileId);
            if (!texture) {
              sprite.visible = false;
              continue;
            }
            sprite.texture = this.toned(texture);
            sprite.visible = true;
            sprite.x = i * T - pixelOffsetX;
            sprite.y = j * T - pixelOffsetY;
            const tag = terrainTag(map.tileset.terrainTags[tileId] ?? 0);
            const priority = map.tileset.priorities[tileId] ?? 0;
            const z = tileZ(j, priority, !!tag.showsReflections, !!tag.bridge, bridge);
            sprite.zIndex = zIndexOf(z, sprite.stamp);
          }
          visited[i]![j] = true;
        }
      }
    }
    for (let i = 0; i < TILES_H; i++) {
      for (let j = 0; j < TILES_V; j++) {
        if (visited[i]![j]) continue;
        for (const s of this.sprites[i]![j]!) s.visible = false;
      }
    }
  }
}
