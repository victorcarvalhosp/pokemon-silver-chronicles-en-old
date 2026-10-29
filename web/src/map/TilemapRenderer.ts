// Port of Data/Scripts/006_Map renderer/001_TilemapRenderer.rb.
//
// Keeps a fixed grid of tile sprites covering the screen (plus one extra row
// and column) and re-points them at the right tile each frame. Tiles live in
// the same container as character sprites so priority tiles sort above or
// below characters by z, exactly like RMXP.

import { Container, Rectangle, Sprite, Texture, TextureSource } from "pixi.js";
import { graphicsPath, loadImage, loadImageStrips } from "../core/assets";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../core/screen";
import { terrainTag } from "../data/gameData/terrainTag";
import type { MapData, Tileset } from "../data/types";
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
  private sources: TextureSource[] = [];
  private cache = new Map<number, Texture>();

  static async load(name: string): Promise<TilesetTextures> {
    const set = new TilesetTextures();
    if (!name) return set;
    const image = await loadImageStrips(graphicsPath("Tilesets", name), STRIP_HEIGHT);
    if (!image) console.warn(`Missing tileset graphic: ${name}`);
    set.sources = image ? image.strips.map((s) => TextureSource.from(s)) : [];
    return set;
  }

  texture(tileId: number): Texture | null {
    let tex = this.cache.get(tileId);
    if (tex) return tex;
    const index = tileId - TILESET_START_ID;
    const x = (index % TILESET_TILES_PER_ROW) * T;
    const y = Math.floor(index / TILESET_TILES_PER_ROW) * T;
    const source = this.sources[Math.floor(y / STRIP_HEIGHT)];
    if (!source || (y % STRIP_HEIGHT) + T > source.height) return null;
    tex = new Texture({ source, frame: new Rectangle(x, y % STRIP_HEIGHT, T, T) });
    this.cache.set(tileId, tex);
    return tex;
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

export interface TilemapState {
  /** Top-left of the screen in map pixels (may be negative or past the edge). */
  displayX: number;
  displayY: number;
  /** $PokemonGlobal.bridge: >0 while the player is on a bridge. */
  bridge: number;
}

export class TilemapRenderer {
  private sprites: Sprite[][][] = [];
  private map: MapData | null = null;
  private tileset: Tileset | null = null;
  private tilesetTextures: TilesetTextures | null = null;
  private autotiles: (Autotile | null)[] = [];
  private timer = 0;

  constructor(private viewport: Container) {
    for (let i = 0; i < TILES_H; i++) {
      const col: Sprite[][] = [];
      for (let j = 0; j < TILES_V; j++) {
        col.push([0, 1, 2].map(() => {
          const s = new Sprite();
          s.visible = false;
          viewport.addChild(s);
          return s;
        }));
      }
      this.sprites.push(col);
    }
  }

  async setMap(map: MapData, tileset: Tileset): Promise<void> {
    const [textures, ...autotiles] = await Promise.all([
      TilesetTextures.load(tileset.tilesetName),
      ...tileset.autotileNames.map((n) => Autotile.load(n)),
    ]);
    this.map = map;
    this.tileset = tileset;
    this.tilesetTextures = textures as TilesetTextures;
    this.autotiles = autotiles as (Autotile | null)[];
  }

  update(dt: number): void {
    this.timer += dt;
  }

  /** Texture for a tile id on the current map (also used for tile-graphic events). */
  textureFor(tileId: number): Texture | null {
    if (tileId < TILES_PER_AUTOTILE) return null;
    if (tileId < TILESET_START_ID) {
      const autotile = this.autotiles[Math.floor(tileId / TILES_PER_AUTOTILE) - 1];
      return autotile ? autotile.texture(tileId, autotile.frameAt(this.timer)) : null;
    }
    return this.tilesetTextures?.texture(tileId) ?? null;
  }

  draw(state: TilemapState): void {
    const map = this.map;
    const tileset = this.tileset;
    if (!map || !tileset) return;
    const dx = Math.round(state.displayX);
    const dy = Math.round(state.displayY);
    const tileOffsetX = Math.floor(dx / T);
    const tileOffsetY = Math.floor(dy / T);
    const pixelOffsetX = dx - tileOffsetX * T;
    const pixelOffsetY = dy - tileOffsetY * T;
    for (let i = 0; i < TILES_H; i++) {
      const tileX = i + tileOffsetX;
      for (let j = 0; j < TILES_V; j++) {
        const tileY = j + tileOffsetY;
        const inMap = tileX >= 0 && tileY >= 0 && tileX < map.width && tileY < map.height;
        const stack = this.sprites[i]![j]!;
        for (let layer = 0; layer < 3; layer++) {
          const sprite = stack[layer]!;
          const tileId = inMap ? map.layers[layer]![tileY]![tileX]! : 0;
          const texture = this.textureFor(tileId);
          if (!texture) {
            sprite.visible = false;
            continue;
          }
          sprite.texture = texture;
          sprite.visible = true;
          sprite.x = i * T - pixelOffsetX;
          sprite.y = j * T - pixelOffsetY;
          const tag = terrainTag(tileset.terrainTags[tileId] ?? 0);
          const priority = tileset.priorities[tileId] ?? 0;
          if (tag.showsReflections) sprite.zIndex = -100;
          else if (tag.bridge && state.bridge > 0) sprite.zIndex = 0;
          else sprite.zIndex = priority === 0 ? 0 : j * T + priority * T + T;
        }
      }
    }
  }
}
