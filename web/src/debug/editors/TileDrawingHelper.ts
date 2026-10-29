// Port of Data/Scripts/006_Map renderer/004_TileDrawingHelper.rb: the
// TileDrawingHelper class (draws one tile into a Bitmap, at any size), and
// createMinimap / bltMinimapAutotile / passable? / getPassabilityMinimap. The
// game's own map renderer (map/TilemapRenderer.ts) draws with textures; these
// are what the editors use (the Tileset editor's tiles, the map lister's and
// the map connections editor's minimaps). Sets EditorListerHooks.createMinimap.
//
// Graphics load asynchronously, so fromTileset and createMinimap are async.
// Tileset graphics are loaded as strips no taller than STRIP_HEIGHT (some are
// ~38000px tall, past canvas limits): that's TilemapRenderer::TilesetWrapper's
// job in Essentials (the "mega" tileset wrapping).

import { graphicsPath, loadImageStrips } from "../../core/assets";
import type { MapData, Tileset } from "../../data/types";
import { Data, getMapData, hasMapData } from "../../data/store";
import { loadMap } from "../../data/loader";
import { AUTOTILE_PATTERNS } from "../../map/autotiles";
import { Bitmap } from "../../rgss/Bitmap";
import { Color, Rect } from "../../rgss/types";
import { EditorListerHooks } from "../EditorListers";

const STRIP_HEIGHT = 4096;

/** A tileset graphic as strips (TilesetWrapper). */
interface TilesetStrips {
  width: number;
  height: number;
  strips: ImageBitmap[];
  disposed: boolean;
}

export class TileDrawingHelper {
  tileset: TilesetStrips | null;
  autotiles: (Bitmap | null)[] | null;

  static readonly AUTOTILE_PATTERNS = AUTOTILE_PATTERNS;

  // converts neighbors returned from tableNeighbors to tile indexes
  static readonly NEIGHBORS_TO_AUTOTILE_INDEX = [
    46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
    42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
    46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
    42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
    45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29,
    37, 27, 37, 27, 23, 15, 23, 13, 37, 27, 37, 27, 22, 11, 22, 9,
    45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29,
    36, 26, 36, 26, 21, 7, 21, 5, 36, 26, 36, 26, 20, 3, 20, 1,
    46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
    42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
    46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
    42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
    45, 38, 45, 38, 33, 30, 33, 28, 45, 38, 45, 38, 33, 30, 33, 28,
    37, 25, 37, 25, 23, 14, 23, 12, 37, 25, 37, 25, 22, 10, 22, 8,
    45, 38, 45, 38, 33, 30, 33, 28, 45, 38, 45, 38, 33, 30, 33, 28,
    36, 24, 36, 24, 21, 6, 21, 4, 36, 24, 36, 24, 20, 2, 20, 0,
  ];

  /** tableNeighbors(data, x, y): data is a [x][y] table (Table#[x, y]). */
  static tableNeighbors(data: { xsize: number; ysize: number; get(x: number, y: number): number }, x: number, y: number): number {
    if (x < 0 || x >= data.xsize) return 0;
    if (y < 0 || y >= data.ysize) return 0;
    const t = data.get(x, y);
    const xp1 = Math.min(x + 1, data.xsize - 1);
    const yp1 = Math.min(y + 1, data.ysize - 1);
    const xm1 = Math.max(x - 1, 0);
    const ym1 = Math.max(y - 1, 0);
    let i = 0;
    if (data.get(x, ym1) === t) i |= 0x01; // N
    if (data.get(xp1, ym1) === t) i |= 0x02; // NE
    if (data.get(xp1, y) === t) i |= 0x04; // E
    if (data.get(xp1, yp1) === t) i |= 0x08; // SE
    if (data.get(x, yp1) === t) i |= 0x10; // S
    if (data.get(xm1, yp1) === t) i |= 0x20; // SW
    if (data.get(xm1, y) === t) i |= 0x40; // W
    if (data.get(xm1, ym1) === t) i |= 0x80; // NW
    return i;
  }

  /** fromTileset(tileset): pbGetTileset + the 7 pbGetAutotile graphics. */
  static async fromTileset(tileset: Tileset): Promise<TileDrawingHelper> {
    const strips = tileset.tilesetName
      ? await loadImageStrips(graphicsPath("Tilesets", tileset.tilesetName), STRIP_HEIGHT)
      : null;
    const bmautotiles: (Bitmap | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const name = tileset.autotileNames[i];
      bmautotiles.push(name ? await Bitmap.load(graphicsPath("Autotiles", name)) : null);
    }
    return new TileDrawingHelper(strips ? { ...strips, disposed: false } : null, bmautotiles);
  }

  constructor(tileset: TilesetStrips | null, autotiles: (Bitmap | null)[]) {
    this.tileset = tileset;
    this.autotiles = autotiles;
  }

  dispose(): void {
    if (this.tileset) {
      for (const s of this.tileset.strips) s.close();
      this.tileset.disposed = true;
    }
    this.tileset = null;
    this.autotiles?.forEach((autotile, i) => {
      autotile?.dispose();
      this.autotiles![i] = null;
    });
  }

  bltSmallAutotile(bitmap: Bitmap, x: number, y: number, cxTile: number, cyTile: number, id: number, frame: number): void {
    if (id >= 384 || frame < 0 || !this.autotiles) return;
    const autotile = this.autotiles[Math.floor(id / 48) - 1];
    if (!autotile || autotile.isDisposed()) return;
    cxTile = Math.max(Math.floor(cxTile / 2), 1);
    cyTile = Math.max(Math.floor(cyTile / 2), 1);
    if (autotile.height === 32) {
      const anim = frame * 32;
      const srcRect = new Rect(anim, 0, 32, 32);
      bitmap.stretchBlt(new Rect(x, y, cxTile * 2, cyTile * 2), autotile, srcRect);
    } else {
      const anim = frame * 96;
      id %= 48;
      const tiles = AUTOTILE_PATTERNS[id >> 3]![id & 7]!;
      const src = new Rect(0, 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const tilePosition = tiles[i]! - 1;
        src.set((tilePosition % 6 * 16) + anim, Math.floor(tilePosition / 6) * 16, 16, 16);
        bitmap.stretchBlt(new Rect((i % 2 * cxTile) + x, (Math.floor(i / 2) * cyTile) + y, cxTile, cyTile), autotile, src);
      }
    }
  }

  bltSmallRegularTile(bitmap: Bitmap, x: number, y: number, cxTile: number, cyTile: number, id: number): void {
    if (id < 384 || !this.tileset || this.tileset.disposed) return;
    const tx = (id - 384) % 8 * 32;
    const ty = Math.floor((id - 384) / 8) * 32;
    // TilesetWrapper.getWrappedRect: the strip holding this row
    const strip = this.tileset.strips[Math.floor(ty / STRIP_HEIGHT)];
    if (!strip) return;
    bitmap.stretchBlt(new Rect(x, y, cxTile, cyTile), strip, new Rect(tx, ty % STRIP_HEIGHT, 32, 32));
  }

  bltSmallTile(bitmap: Bitmap, x: number, y: number, cxTile: number, cyTile: number, id: number, frame = 0): void {
    if (id >= 384) {
      this.bltSmallRegularTile(bitmap, x, y, cxTile, cyTile, id);
    } else if (id > 0) {
      this.bltSmallAutotile(bitmap, x, y, cxTile, cyTile, id, frame);
    }
  }

  bltAutotile(bitmap: Bitmap, x: number, y: number, id: number, frame: number): void {
    this.bltSmallAutotile(bitmap, x, y, 32, 32, id, frame);
  }

  bltRegularTile(bitmap: Bitmap, x: number, y: number, id: number): void {
    this.bltSmallRegularTile(bitmap, x, y, 32, 32, id);
  }

  bltTile(bitmap: Bitmap, x: number, y: number, id: number, frame = 0): void {
    if (id >= 384) {
      this.bltRegularTile(bitmap, x, y, id);
    } else if (id > 0) {
      this.bltAutotile(bitmap, x, y, id, frame);
    }
  }
}

//===============================================================================
//
//===============================================================================
/** load_data(sprintf("Data/Map%03d.rxdata", mapid)) rescue nil */
async function loadMapData(mapid: number): Promise<MapData | null> {
  if (hasMapData(mapid)) return getMapData(mapid);
  try {
    return await loadMap(mapid);
  } catch {
    return null;
  }
}

export async function createMinimap(mapid: number): Promise<Bitmap> {
  const map = await loadMapData(mapid);
  if (!map) return new Bitmap(32, 32);
  const bitmap = new Bitmap(map.width * 4, map.height * 4);
  const black = new Color(0, 0, 0);
  const tileset = Data.tilesets.get(map.tilesetId); // $data_tilesets
  if (!tileset) return bitmap;
  const helper = await TileDrawingHelper.fromTileset(tileset);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      for (let z = 0; z < 3; z++) {
        const id = map.layers[z]?.[y]?.[x] ?? 0;
        helper.bltSmallTile(bitmap, x * 4, y * 4, 4, 4, id);
      }
    }
  }
  bitmap.fillRect(0, 0, bitmap.width, 1, black);
  bitmap.fillRect(0, bitmap.height - 1, bitmap.width, 1, black);
  bitmap.fillRect(0, 0, 1, bitmap.height, black);
  bitmap.fillRect(bitmap.width - 1, 0, 1, bitmap.height, black);
  // (Ruby never disposes the helper: the tileset bitmaps stay cached.)
  helper.dispose();
  return bitmap;
}

export function bltMinimapAutotile(dstBitmap: Bitmap, x: number, y: number, srcBitmap: Bitmap | null, id: number): void {
  if (id >= 48 || !srcBitmap || srcBitmap.isDisposed()) return;
  const anim = 0;
  const cxTile = 3;
  const cyTile = 3;
  const tiles = AUTOTILE_PATTERNS[id >> 3]![id & 7]!;
  const src = new Rect(0, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const tilePosition = tiles[i]! - 1;
    src.set((tilePosition % 6 * cxTile) + anim, Math.floor(tilePosition / 6) * cyTile, cxTile, cyTile);
    dstBitmap.blt((i % 2 * cxTile) + x, (Math.floor(i / 2) * cyTile) + y, srcBitmap, src);
  }
}

/** passable?(passages, tile_id) */
export function passable(passages: number[], tileId: number | null | undefined): boolean {
  if (tileId == null) return false;
  const passage = passages[tileId];
  return passage != null && passage < 15;
}

// Unused
export async function getPassabilityMinimap(mapid: number): Promise<Bitmap> {
  const map = await loadMapData(mapid);
  if (!map) throw new Error(`Map ${mapid} not found`); // (load_data raises)
  const tileset = Data.tilesets.get(map.tilesetId)!;
  const minimap = await Bitmap.load("Graphics/Pictures/minimap_tiles");
  const ret = new Bitmap(map.width * 6, map.height * 6);
  const pass: number[][] = [];
  const passtable = {
    xsize: map.width, ysize: map.height,
    get: (x: number, y: number) => pass[x]![y]!,
  };
  const passages = tileset.passages;
  for (let i = 0; i < map.width; i++) {
    pass[i] = [];
    for (let j = 0; j < map.height; j++) {
      let p = true;
      for (const z of [2, 1, 0]) {
        if (!passable(passages, map.layers[z]?.[j]?.[i])) {
          p = false;
          break;
        }
      }
      pass[i]![j] = p ? 1 : 0;
    }
  }
  const neighbors = TileDrawingHelper.NEIGHBORS_TO_AUTOTILE_INDEX;
  for (let i = 0; i < map.width; i++) {
    for (let j = 0; j < map.height; j++) {
      if (passtable.get(i, j) !== 0) continue;
      const nb = TileDrawingHelper.tableNeighbors(passtable, i, j);
      const tile = neighbors[nb]!;
      bltMinimapAutotile(ret, i * 6, j * 6, minimap, tile);
    }
  }
  // NOTE (Ruby parity): `minimap.disposes` (004_TileDrawingHelper.rb:229) is a
  // NoMethodError, so this unused function always crashes after drawing.
  throw new Error("undefined method `disposes' for AnimatedBitmap");
}

EditorListerHooks.createMinimap = createMinimap;
