// Luka's Scripting Utilities: the Bitmap extensions (script.rb:575-718) and
// pbBitmap / pbSelBitmap (script.rb:1348-1383), as functions.
//
// Browser adaptations:
// - pbBitmap reads RPG::Cache synchronously (ui/rpgCache.ts), so the graphic
//   must be preloaded; one that isn't is treated as missing for that call
//   (a 2x2 bitmap and a warning, like a missing file in Ruby). mkxp-z's
//   PhysFS ignores a leading "/", so a bare file name ("foo" -> "/foo") is
//   looked up from the game root, as there.
// - Bitmap#storedPath is kept in a WeakMap (storedPath()).
// - Bitmap.smartWindow loads the skin from the same cache and raises
//   Errno::ENOENT when it isn't there; the cached skin isn't disposed.
// - Bitmap.online_bitmap fetches the URL (the server must allow CORS) and
//   decodes it in memory instead of downloading it to the game folder and
//   deleting it afterwards; null when it fails, as when Ruby's file is missing.
// - Pixel loops read the canvas once and write it once (Ruby goes through
//   get_pixel / set_pixel); the pixels written are the same.

import { Bitmap } from "../../rgss/Bitmap";
import { Sprite } from "../../rgss/display";
import { Color, Rect } from "../../rgss/types";
import { RPGCache } from "../../ui/rpgCache";
import { colorParse, colorToHex } from "./colors";
import { Env } from "./env";
import { rdiv, RubyError, rsplit, toI } from "./rubyHelpers";

//===============================================================================
//  pbBitmap / pbSelBitmap
//===============================================================================
const storedPaths = new WeakMap<Bitmap, string>();

/** Bitmap#storedPath: the path pbBitmap loaded the bitmap from. */
export const storedPath = (bmp: Bitmap): string | null => storedPaths.get(bmp) ?? null;
export const setStoredPath = (bmp: Bitmap, path: string): void => void storedPaths.set(bmp, path);

/** pbBitmap(name): the cached bitmap, or a blank 2x2 one (and a warning) when it's missing (or name is nil). */
export function pbBitmap(name: string | null): Bitmap {
  const parts = typeof name === "string" ? rsplit(name, "/") : [];
  const dir = parts.slice(0, -1).join("/") + "/";
  const file = parts[parts.length - 1];
  const bmp = file === undefined ? null : RPGCache.loadBitmap(dir.replace(/^\/+/, ""), file);
  if (!bmp) {
    Env.log.warn(`Image located at '${name ?? ""}' was not found!`);
    return new Bitmap(2, 2);
  }
  storedPaths.set(bmp, name!);
  return bmp;
}

export interface Blit { x: number; y: number; src: Rect }

/** pbSelBitmap's layout: the sheet size and the 16 corner blits (4 frames, corners 2px closer each frame). */
export function selBitmapLayout(bw: number, bh: number, rect: { width: number; height: number }): { width: number; height: number; blits: Blit[] } {
  const qw = rdiv(bw, 2);
  const qh = rdiv(bh, 2);
  const maxW = rect.width + qw * 2 - 8;
  const maxH = rect.height + qh * 2 - 8;
  const blits: Blit[] = [];
  // draws 4 frames where corners of selection get closer to bounding rect
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const m = i < 3 ? i : i - 2;
      const x = (j % 2 === 0 ? 2 : -2) * m + maxW * i + (j % 2 === 0 ? 0 : maxW - qw);
      const y = (rdiv(j, 2) === 0 ? 2 : -2) * m + (rdiv(j, 2) === 0 ? 0 : maxH - qh);
      blits.push({ x, y, src: new Rect(qw * (j % 2), qh * rdiv(j, 2), qw, qh) });
    }
  }
  return { width: maxW * 4, height: maxH, blits };
}

/** pbSelBitmap(name, rect): a 4-frame selection cursor sheet around a rect, from a corner graphic. */
export function pbSelBitmap(name: string | null, rect: { width: number; height: number }): Bitmap {
  const bmp = pbBitmap(name);
  const layout = selBitmapLayout(bmp.width, bmp.height, rect);
  const full = new Bitmap(layout.width, layout.height);
  for (const b of layout.blits) full.blt(b.x, b.y, bmp, b.src);
  return full;
}

//===============================================================================
//  Bitmap extensions
//===============================================================================
/** Bitmap#bmp_circle's columns: [x, y1, y2] for every column the circle covers. */
export function circleSpans(width: number, r: number, tx: number, ty: number): [number, number, number][] {
  const ret: [number, number, number][] = [];
  // basic circle formula: (x - tx)**2 + (y - ty)**2 = r**2
  for (let x = 0; x < width; x++) {
    const f = r ** 2 - (x - tx) ** 2;
    if (f < 0) continue;
    ret.push([x, -toI(Math.sqrt(f)) + ty, toI(Math.sqrt(f)) + ty]);
  }
  return ret;
}

/**
 * Bitmap#bmp_circle(color, r, tx, ty, hollow) / #draw_circle: fills each
 * column from y1 to y2 - 1 (the bottom row is left out), or sets just those
 * two pixels when hollow. Coordinates are truncated as mkxp-z's are.
 */
export function bmpCircle(bitmap: Bitmap, color = new Color(255, 255, 255), r = rdiv(bitmap.width, 2), tx = rdiv(bitmap.width, 2), ty = rdiv(bitmap.height, 2), hollow = false): void {
  for (const [x, y1, y2] of circleSpans(bitmap.width, r, tx, ty)) {
    if (hollow) {
      bitmap.setPixel(x, toI(y1), color);
      bitmap.setPixel(x, toI(y2), color);
    } else {
      bitmap.fillRect(x, toI(y1), 1, toI(y2 - y1), color);
    }
  }
}
export const drawCircle = bmpCircle;

/** Bitmap#set_font(name, size, bold = false) */
export function setFont(bitmap: Bitmap, name: string, size: number, bold = false): void {
  bitmap.font.name = name;
  bitmap.font.size = size;
  bitmap.font.bold = bold;
}

/** The mask argument's bitmap (a Bitmap, a Sprite's bitmap or a graphic's path), or undefined for other types. */
function maskBitmap(mask: unknown): Bitmap | null | undefined {
  if (mask instanceof Bitmap) return mask;
  if (mask instanceof Sprite) return mask.bitmap;
  if (typeof mask === "string") return pbBitmap(mask);
  return undefined;
}

/**
 * Bitmap#mask!(mask, xpush, ypush): a new bitmap the mask's size, centred on
 * this one (shifted by xpush/ypush), each pixel with the lower of the two
 * alphas; false for a mask of another type.
 * NOTE (Ruby parity, script.rb:611-639): despite the "!", the bitmap itself
 * isn't changed; the result is returned.
 */
export function maskBang(bitmap: Bitmap, mask: Bitmap | Sprite | string | null = null, xpush = 0, ypush = 0): Bitmap | false {
  const mbmp = maskBitmap(mask);
  if (mbmp === undefined) return false;
  if (mbmp === null) throw new RubyError("NoMethodError", "undefined method `width' for nil:NilClass");
  const cbmp = new Bitmap(mbmp.width, mbmp.height);
  const ox = rdiv(bitmap.width - mbmp.width, 2);
  const oy = rdiv(bitmap.height - mbmp.height, 2);
  const src = bitmap.ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const mpx = mbmp.ctx.getImageData(0, 0, mbmp.width, mbmp.height).data;
  const out = cbmp.ctx.createImageData(mbmp.width, mbmp.height);
  for (let y = 0; y < mbmp.height; y++) {
    for (let x = 0; x < mbmp.width; x++) {
      // get_pixel outside the bitmap is Color(0, 0, 0, 0)
      const sx = x + ox - xpush;
      const sy = y + oy - ypush;
      const inside = sx >= 0 && sy >= 0 && sx < bitmap.width && sy < bitmap.height;
      const si = (sy * bitmap.width + sx) * 4;
      const di = (y * mbmp.width + x) * 4;
      let alpha = mpx[di + 3]!;
      const calpha = inside ? src[si + 3]! : 0;
      if (calpha < alpha) alpha = calpha;
      out.data[di] = inside ? src[si]! : 0;
      out.data[di + 1] = inside ? src[si + 1]! : 0;
      out.data[di + 2] = inside ? src[si + 2]! : 0;
      out.data[di + 3] = alpha;
    }
  }
  cbmp.ctx.putImageData(out, 0, 0);
  return cbmp;
}

export type ColorMap = Map<unknown, unknown> | Record<string, unknown>;

/**
 * Bitmap#swap_colors(map): replaces every pixel equal to a key's colour
 * (Color.parse: "#RRGGBB", so only opaque pixels match) with its value's.
 * A Bitmap map pairs its row 0 (from) with row 1 (to). The last matching key wins.
 */
export function swapColors(bitmap: Bitmap, map: ColorMap | Bitmap | null): void {
  // check for a potential bitmap map
  if (map instanceof Bitmap) {
    const bmp = map;
    const m = new Map<unknown, unknown>();
    for (let x = 0; x < bmp.width; x++) m.set(colorToHex(bmp.getPixel(x, 0)), colorToHex(bmp.getPixel(x, 1)));
    map = m;
  }
  // failsafe
  if (!map || typeof map !== "object") return;
  const pairs: [unknown, unknown][] = map instanceof Map ? [...map.entries()] : Object.entries(map);
  for (let x = 0; x < bitmap.width; x++) {
    for (let y = 0; y < bitmap.height; y++) {
      const pixel = bitmap.getPixel(x, y);
      let final: Color | null = null;
      for (const [key, val] of pairs) {
        const target = colorParse(key); // check for key mapping
        if (target?.equals(pixel)) final = colorParse(val);
      }
      // swap current pixel color with target
      if (final instanceof Color) bitmap.setPixel(x, y, final);
    }
  }
}

/** Bitmap.smartWindow's 9-slice: the skin's source rects and the output's destination rects. */
export function smartWindowRects(slice: Rect, rect: Rect, windowWidth: number, windowHeight: number): { slices: Rect[]; rects: Rect[] } {
  // coordinates for the 9-slice sprite (slice)
  const x1 = [0, slice.x, slice.x + slice.width];
  const y1 = [0, slice.y, slice.y + slice.height];
  const w1 = [slice.x, slice.width, windowWidth - slice.x - slice.width];
  const h1 = [slice.y, slice.height, windowHeight - slice.y - slice.height];
  // coordinates for the 9-slice sprite (rect)
  const x2 = [0, x1[1]!, rect.width - w1[2]!];
  const y2 = [0, y1[1]!, rect.height - h1[2]!];
  const w2 = [x1[1]!, rect.width - x1[1]! - w1[2]!, w1[2]!];
  const h2 = [y1[1]!, rect.height - y1[1]! - h1[2]!, h1[2]!];
  const slices: Rect[] = [];
  const rects: Rect[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      slices.push(new Rect(x1[x], y1[y], w1[x], h1[y]));
      rects.push(new Rect(x2[x], y2[y], w2[x], h2[y]));
    }
  }
  return { slices, rects };
}

/** Bitmap.smartWindow(slice, rect, path): a window of rect's size drawn from a 9-slice skin. */
export function smartWindow(slice: Rect, rect: Rect, path = "img/window001.png"): Bitmap {
  const window = RPGCache.loadBitmap(path);
  if (!window) throw new RubyError("Errno::ENOENT", `No such file or directory - ${path}`);
  const output = new Bitmap(rect.width, rect.height);
  const { slices, rects } = smartWindowRects(slice, rect, window.width, window.height);
  for (let i = 0; i < 9; i++) output.stretchBlt(rects[i]!, window, slices[i]!);
  return output;
}

/** Bitmap.online_bitmap(url): the image at url, or null. */
export async function onlineBitmap(url: string): Promise<Bitmap | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = Bitmap.fromImage(await createImageBitmap(await res.blob()));
    storedPaths.set(bmp, url.split("/").pop() ?? url);
    return bmp;
  } catch {
    return null;
  }
}
