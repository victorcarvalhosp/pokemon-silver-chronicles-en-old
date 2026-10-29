import { Container, Texture, type Sprite } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { Tileset } from "../data/types";
import { TilemapRenderer, tileZ, type TilemapSource } from "./TilemapRenderer";

const PRIORITY_TILE = 400;
const FLOOR = 401;
const MAT = 402;

function tileset(): Tileset {
  const priorities: number[] = [];
  priorities[PRIORITY_TILE] = 1;
  return {
    id: 1, name: "", tilesetName: "", autotileNames: [], panoramaName: "", panoramaHue: 0,
    fog: { name: "", hue: 0, opacity: 0, blendType: 0, zoom: 100, sx: 0, sy: 0 },
    battlebackName: "", passages: [], priorities, terrainTags: [],
  };
}

/** A 20x20 map: a floor with a mat on layer 1, and a row of priority tiles on layer 0 at y 5. */
function source(displayY: number): TilemapSource {
  return {
    mapId: 1, width: 20, height: 20, tileset: tileset(), displayX: 0, displayY,
    tile: (_x, y, layer) => (layer === 0 ? (y === 5 ? PRIORITY_TILE : FLOOR) : layer === 1 ? MAT : 0),
  };
}

describe("TilemapRenderer", () => {
  it("keeps a tile stack's layers in order after a sprite's z goes back to 0", () => {
    const container = new Container({ sortableChildren: true });
    const renderer = new TilemapRenderer(container);
    renderer.textureFor = (_tileset, tileId) => (tileId >= 384 ? Texture.WHITE : null);
    const stacks = (renderer as unknown as { sprites: Sprite[][][] }).sprites;
    // Grid row 5 draws the priority row (z > 0, sorted after every floor tile),
    // then the screen scrolls a tile down and it draws plain floor (z 0) again.
    renderer.draw([source(0)], 0);
    container.sortChildren();
    renderer.draw([source(32)], 0);
    container.sortChildren();
    const order = new Map(container.children.map((c, i) => [c, i]));
    for (const col of stacks) {
      for (const [floor, mat] of col) {
        if (!floor!.visible || floor!.zIndex >= 1) continue;
        expect(order.get(floor!)!).toBeLessThan(order.get(mat!)!);
      }
    }
  });

  it("gives priority tiles the v20.1 Hotfixes' z", () => {
    expect(tileZ(3, 0, false, false, 0)).toBe(0);
    expect(tileZ(3, 1, false, false, 0)).toBe(3 * 32 + 32 + 32 + 1);
    expect(tileZ(3, 1, true, false, 0)).toBe(-100);
    expect(tileZ(3, 1, false, true, 1)).toBe(0);
    expect(tileZ(3, 1, false, true, 0)).toBe(161);
  });
});
