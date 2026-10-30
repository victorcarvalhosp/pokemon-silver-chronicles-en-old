// Spinda's spots (001_FormHandlers.rb:37-138): drawSpot tints 2x2 pixel blocks
// of the (2x-scaled) sprite at spot positions taken from the personal ID.
import { beforeAll, describe, expect, it } from "vitest";
import { loadGameDataForTests } from "../../data/gameData/testing";
import type { Bitmap } from "../../rgss/Bitmap";
import { Color } from "../../rgss/types";
import { MultipleForms, drawSpot, pbSpindaSpots } from "./formHandlers";
import { Pokemon } from "./Pokemon";

beforeAll(() => loadGameDataForTests());

/** A 200x200 bitmap stand-in holding colours (all start as (100, 200, 120)). */
function fakeBitmap() {
  const px = new Map<string, Color>();
  const get = (x: number, y: number) => px.get(`${x},${y}`) ?? new Color(100, 200, 120);
  return {
    px,
    bitmap: {
      getPixel: (x: number, y: number) => { const c = get(x, y); return new Color(c.red, c.green, c.blue, c.alpha); },
      setPixel: (x: number, y: number, c: Color) => { px.set(`${x},${y}`, new Color(c.red, c.green, c.blue, c.alpha)); },
    } as unknown as Bitmap,
  };
}

describe("Spinda's spots", () => {
  it("drawSpot tints each set cell as a 2x2 block, clamped to 0..255", () => {
    const { px, bitmap } = fakeBitmap();
    drawSpot(bitmap, [[1, 0], [0, 1]], 3, 4, 0, -115, -150);
    expect(px.size).toBe(8);
    const c = px.get("6,8")!;
    expect([c.red, c.green, c.blue]).toEqual([100, 85, 0]);
    expect(px.has("7,9") && px.has("8,10") && px.has("9,11")).toBe(true);
    expect(px.has("8,8")).toBe(false);
  });

  it("places the four spots from the personal ID's nibbles (shiny ones in another colour)", () => {
    const pkmn = new Pokemon("SPINDA", 10);
    pkmn.personalID = 0x12345678;
    pkmn.shiny = false;
    const { px, bitmap } = fakeBitmap();
    pbSpindaSpots(pkmn, bitmap);
    // spot1 at (b + 33, a + 25) = (40, 33): its first set cell is column 2 of row 0 -> pixel (84, 66)
    expect(px.has("84,66")).toBe(true);
    expect(px.has("82,66")).toBe(false);
    const c = px.get("84,66")!;
    expect([c.red, c.green, c.blue]).toEqual([100, 85, 45]);
    pkmn.shiny = true;
    const shiny = fakeBitmap();
    pbSpindaSpots(pkmn, shiny.bitmap);
    const s = shiny.px.get("84,66")!;
    expect([s.red, s.green, s.blue]).toEqual([25, 190, 0]);
    expect(MultipleForms.getFunction("SPINDA", "alterBitmap")).not.toBeNull();
  });
});
