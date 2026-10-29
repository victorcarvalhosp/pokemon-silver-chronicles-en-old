// Luka's Scripting Utilities: the Viewport and Sprite extensions
// (script.rb:229-554, 1384-1389), as functions taking the sprite first. The
// attributes the plugin adds to every Sprite (speed, toggle, end_x...) are
// set on the sprite object itself (LukaSprite).
//
// Browser adaptations: Viewport#sprites walks the display's live objects
// (rgss/display.ts liveObjects) instead of ObjectSpace; Sprite#online_bitmap
// is async (bitmaps.ts onlineBitmap). Coordinates and sizes given to
// Bitmap.new / blt / Rect.new are truncated to integers, as mkxp-z does.

import { Bitmap } from "../../rgss/Bitmap";
import { liveObjects, Sprite, type Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color, Rect } from "../../rgss/types";
import { onlineBitmap, pbBitmap, swapColors, type ColorMap } from "./bitmaps";
import { rdiv, RubyError, toI } from "./rubyHelpers";

/** The attributes script.rb:264-272 adds to Sprite (plus skew's @calMidX). */
export interface LukaSpriteAttrs {
  storedBitmap?: Bitmap | null;
  direction?: number;
  speed?: number;
  toggle?: number;
  endX?: number;
  endY?: number;
  param?: number;
  skewD?: number;
  ex?: number;
  ey?: number;
  zx?: number;
  zy?: number;
  calMidX?: number;
}
export type LukaSprite = Sprite & LukaSpriteAttrs;

/** What the anchor helpers read (any sprite-like object). */
export interface SpriteGeometry {
  srcRect: { width: number; height: number };
  x: number;
  y: number;
  ox: number;
  oy: number;
  viewport: { rect: { width: number; height: number } } | null;
}

/**
 * RGSS `sprite.bitmap = bmp` (src_rect reset unless it's the same bitmap),
 * past any setBitmap override (SpriteSheet's, ScrollingSprite's...).
 */
export function assignBitmap(s: Sprite, bmp: Bitmap | null): void {
  if (s.bitmap !== bmp) Sprite.prototype.setBitmap.call(s, bmp);
}

function viewportOf(s: Sprite): Viewport {
  if (!s.viewport) throw new RubyError("NoMethodError", "undefined method `width' for nil:NilClass");
  return s.viewport;
}

function bitmapOf(s: Sprite): Bitmap {
  if (!s.bitmap) throw new RubyError("NoMethodError", "undefined method `width' for nil:NilClass");
  return s.bitmap;
}

//===============================================================================
//  Viewport
//===============================================================================
/**
 * Viewport#sprites: the sprites in the viewport, as a hash.
 * NOTE (Ruby parity, script.rb:236-245): the counter is never incremented,
 * so the hash only ever holds the last sprite found, under 0.
 */
export function viewportSprites(vp: Viewport): Record<number, Sprite> {
  const hash: Record<number, Sprite> = {};
  const i = 0;
  for (const o of liveObjects()) {
    if (o instanceof Sprite && o.viewport && o.viewport === vp) hash[i] = o;
  }
  return hash;
}
export const viewportWidth = (vp: { rect: Rect }): number => vp.rect.width;
export const viewportHeight = (vp: { rect: Rect }): number => vp.rect.height;

//===============================================================================
//  Sprite
//===============================================================================
/** Sprite#id? / PokemonSprite#id? (MTS compatibility layer): always nil. */
export const spriteId = (_sprite: unknown, _val: unknown): null => null;
export const pokemonSpriteId = spriteId;

/** Sprite#create_rect(width, height, color): a new bitmap filled with color. */
export function createRect(s: Sprite, width: number, height: number, color: Color): void {
  assignBitmap(s, new Bitmap(toI(width), toI(height)));
  s.bitmap!.fillRect(0, 0, toI(width), toI(height), color);
}

/** Sprite#full_rect(color): fills the bitmap (a viewport-sized one if there's none). */
export function fullRect(s: Sprite, color: Color): void {
  if (!s.bitmap) blankScreen(s);
  s.bitmap!.fillRect(0, 0, s.bitmap!.width, s.bitmap!.height, color);
}

/** Sprite#default!: resets the additional values. */
export function defaultBang(s: LukaSpriteAttrs): void {
  s.speed = 1; s.toggle = 1; s.endX = 0; s.endY = 0;
  s.ex = 0; s.ey = 0; s.zx = 1; s.zy = 1; s.param = 1; s.direction = 1;
}

/** Sprite#zoom */
export const getZoom = (s: { zoomX: number }): number => s.zoomX;
/** Sprite#zoom=(val): sets zoom_x and zoom_y. */
export function setZoom(s: { zoomX: number; zoomY: number }, val: number): void {
  s.zoomX = val;
  s.zoomY = val;
}

/** Sprite#center!(snap = false): anchor at the middle; with snap, also moved to the viewport's centre. */
export function centerBang(s: SpriteGeometry, snap = false): void {
  s.ox = rdiv(s.srcRect.width, 2);
  s.oy = rdiv(s.srcRect.height, 2);
  // aligns with the center of the sprite's viewport
  if (snap && s.viewport) {
    s.x = rdiv(s.viewport.rect.width, 2);
    s.y = rdiv(s.viewport.rect.height, 2);
  }
}
/** Sprite#center: [width / 2, height / 2] */
export const center = (s: SpriteGeometry): [number, number] => [rdiv(s.srcRect.width, 2), rdiv(s.srcRect.height, 2)];

/** Sprite#bottom!: anchor at the bottom middle. */
export function bottomBang(s: SpriteGeometry): void {
  s.ox = rdiv(s.srcRect.width, 2);
  s.oy = s.srcRect.height;
}
/** Sprite#bottom: [width / 2, height] */
export const bottom = (s: SpriteGeometry): [number, number] => [rdiv(s.srcRect.width, 2), s.srcRect.height];

/** Sprite#snap_screen / #screenshot: the screen (the viewport's part of it) as the bitmap. */
export function snapScreen(s: Sprite): void {
  const bmp = Graphics.snapToBitmap();
  const vp = s.viewport;
  const width = vp ? vp.rect.width : Graphics.width;
  const height = vp ? vp.rect.height : Graphics.height;
  const x = vp ? vp.rect.x : 0;
  const y = vp ? vp.rect.y : 0;
  assignBitmap(s, new Bitmap(width, height));
  s.bitmap!.blt(0, 0, bmp, new Rect(x, y, width, height));
  bmp.dispose();
}
export const screenshot = snapScreen;

/** Sprite#stretch_screen(file): the graphic stretched over the whole viewport. */
export function stretchScreen(s: Sprite, file: string): void {
  const bmp = pbBitmap(file);
  const vp = viewportOf(s);
  assignBitmap(s, new Bitmap(vp.rect.width, vp.rect.height));
  s.bitmap!.stretchBlt(s.bitmap!.rect(), bmp, bmp.rect());
}

/**
 * Sprite#skew's layout for a bitmap of bw x bh: the new width, each row's
 * blit (row y drawn at x) and @calMidX.
 * NOTE (Ruby parity, script.rb:361-366): rows run from bh down to 1, so row 0
 * is never drawn (and row bh is outside the bitmap); past 90 degrees
 * @calMidX is the new width minus *its own* half (`bitmap` is the new one).
 */
export function skewLayout(bw: number, bh: number, angle: number): { width: number; rows: [number, number][]; calMidX: number } {
  const piangle = angle * (Math.PI / 180);
  let width = bw;
  if (angle !== 90) width += Math.abs((bh - 1) / Math.tan(piangle));
  const newWidth = toI(width);
  const rows: [number, number][] = [];
  for (let i = 0; i < bh; i++) {
    const y = bh - i;
    const x = angle === 90 ? 0 : i / Math.tan(piangle);
    rows.push([toI(x), y]);
  }
  const calMidX = angle <= 90 ? rdiv(bw, 2) : newWidth - rdiv(newWidth, 2);
  return { width: newWidth, rows, calMidX };
}

/** Sprite#skew(angle = 90): shears the bitmap (or the memorized one); false if unchanged. */
export function skew(s: LukaSprite, angle = 90): false | void {
  if (!s.bitmap) return false;
  if (angle === s.skewD) return false;
  const bmp = s.storedBitmap ? s.storedBitmap : s.bitmap;
  const layout = skewLayout(bmp.width, bmp.height, angle);
  assignBitmap(s, new Bitmap(layout.width, bmp.height));
  for (const [x, y] of layout.rows) s.bitmap!.blt(x, y, bmp, new Rect(0, y, bmp.width, 1));
  s.calMidX = layout.calMidX;
  s.skewD = angle;
}

/** Sprite#x_mid: skew's mid-point, else half the bitmap, else ox. */
export function xMid(s: LukaSprite): number {
  if (s.calMidX != null) return s.calMidX;
  if (s.bitmap) return rdiv(s.bitmap.width, 2);
  return s.ox;
}

/** Sprite#blur_sprite's copies: the offset of each translucent copy. */
export function blurOffsets(blurVal = 2): [number, number][] {
  const ret: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 1; i < 8 * blurVal; i++) {
    const dir = i % 8;
    x += (1 + rdiv(i, 8)) * ([0, 6, 7].includes(dir) ? -1 : 1) * ([1, 5].includes(dir) ? 0 : 1);
    y += (1 + rdiv(i, 8)) * ([1, 4, 5, 6].includes(dir) ? -1 : 1) * ([3, 7].includes(dir) ? 0 : 1);
    ret.push([x - blurVal, y + blurVal * 2]);
  }
  return ret;
}

/** Sprite#blur_sprite(blur_val = 2, opacity = 35): the bitmap with translucent copies drawn around it. */
export function blurSprite(s: Sprite, blurVal = 2, opacity = 35): void {
  const bitmap = bitmapOf(s);
  assignBitmap(s, new Bitmap(bitmap.width, bitmap.height));
  s.bitmap!.blt(0, 0, bitmap, new Rect(0, 0, bitmap.width, bitmap.height));
  for (const [x, y] of blurOffsets(blurVal)) {
    s.bitmap!.blt(toI(x), toI(y), bitmap, new Rect(0, 0, bitmap.width, bitmap.height), opacity);
  }
}

/**
 * Sprite#avg_color(freq = 2): the average colour of every freq-th pixel.
 * NOTE (Ruby parity, script.rb:395-414): transparent samples add nothing but
 * still count in the divisor, so the result is darker the more transparent
 * the bitmap is; a bitmap smaller than freq raises ZeroDivisionError.
 */
export function avgColor(s: Sprite, freq = 2): Color {
  if (!s.bitmap) return new Color(0, 0, 0, 0);
  const bmp = s.bitmap;
  const width = rdiv(bmp.width, freq);
  const height = rdiv(bmp.height, freq);
  let red = 0;
  let green = 0;
  let blue = 0;
  const n = width * height;
  const data = bmp.ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = (y * freq * bmp.width + x * freq) * 4;
      if (data[i + 3]! > 0) {
        red += data[i]!;
        green += data[i + 1]!;
        blue += data[i + 2]!;
      }
    }
  }
  if (n === 0) throw new RubyError("ZeroDivisionError", "divided by 0");
  return new Color(red / n, green / n, blue / n);
}

/**
 * Sprite#create_outline(color, thickness = 2).
 * NOTE (Ruby parity, script.rb:423): the offsets use `r`, which doesn't exist
 * (thickness is unused), so with a bitmap it always raises NameError.
 */
export function createOutline(s: Sprite, _color: Color, _thickness = 2): false {
  if (!s.bitmap) return false;
  throw new RubyError("NameError", "undefined local variable or method `r'");
}

/**
 * Sprite#colorize(color, amt = 255): blends every visible pixel toward color
 * by amt / 255.
 * NOTE (Ruby parity, script.rb:457-471): raw_data is RGBA in memory, so the
 * variables named b and r hold red and blue; repacked the same way round, the
 * blend mixes color.red with the pixel's *blue* (and color.blue with its red).
 * At amt = 255 (the default, and what fuzz uses) that can't show.
 */
export function colorize(s: Sprite, color: Color, amt = 255): false | void {
  if (!s.bitmap) return false;
  const alpha = amt / 255.0;
  const bmp = s.bitmap.clone();
  assignBitmap(s, new Bitmap(bmp.width, bmp.height));
  const img = bmp.ctx.getImageData(0, 0, bmp.width, bmp.height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    let b = px[i]!; // (really red)
    const gOrig = px[i + 1]!;
    let r = px[i + 2]!; // (really blue)
    const pa = px[i + 3]!;
    if (pa > 0) {
      r = alpha * color.red + (1 - alpha) * r;
      const g = alpha * color.green + (1 - alpha) * gOrig;
      b = alpha * color.blue + (1 - alpha) * b;
      px[i] = toI(r);
      px[i + 1] = toI(g);
      px[i + 2] = toI(b);
    }
  }
  s.bitmap!.ctx.putImageData(img, 0, 0);
  bmp.dispose();
}

/** The slightly enlarged redraw glow and fuzz end with. */
function stretchAround(s: Sprite): void {
  const src = s.bitmap!.clone();
  s.bitmap!.clear();
  s.bitmap!.stretchBlt(new Rect(toI(-0.005 * src.width), toI(-0.015 * src.height), toI(src.width * 1.01), toI(1.02 * src.height)), src, new Rect(0, 0, src.width, src.height));
}

/** Sprite#glow(color, opacity = 35, keep = true): tints the sprite and blurs a slightly bigger copy behind the original. */
export function glow(s: Sprite, color: Color, opacity = 35, keep = true): false | void {
  if (!s.bitmap) return false;
  const tempBmp = s.bitmap.clone();
  s.color.set(color);
  blurSprite(s, 3, opacity);
  stretchAround(s);
  if (keep) s.bitmap!.blt(0, 0, tempBmp, new Rect(0, 0, tempBmp.width, tempBmp.height));
}

/** Sprite#fuzz(color, opacity = 35): colorizes, blurs and slightly enlarges the bitmap. */
export function fuzz(s: Sprite, color: Color, opacity = 35): false | void {
  if (!s.bitmap) return false;
  colorize(s, color);
  blurSprite(s, 3, opacity);
  stretchAround(s);
}

/** Sprite#memorize_bitmap(bitmap = nil): keeps the given bitmap, or a copy of the current one. */
export function memorizeBitmap(s: LukaSprite, bitmap: Bitmap | null = null): void {
  if (bitmap !== null) s.storedBitmap = bitmap;
  else s.storedBitmap = bitmapOf(s).clone();
}

/** Sprite#restore_bitmap: a copy of the memorized bitmap (nil if none). */
export function restoreBitmap(s: LukaSprite): void {
  assignBitmap(s, s.storedBitmap ? s.storedBitmap.clone() : null);
}

/** Sprite#online_bitmap(url): the downloaded image as the bitmap (unchanged if it fails). */
export async function spriteOnlineBitmap(s: Sprite, url: string): Promise<void> {
  const bmp = await onlineBitmap(url);
  if (!bmp) return;
  assignBitmap(s, bmp);
}

/**
 * Sprite#mask(mask = nil, xpush = 0, ypush = 0).
 * NOTE (Ruby parity, script.rb:527): it calls Bitmap#mask, which doesn't
 * exist (the Bitmap method is mask!), so with a bitmap it always raises
 * NoMethodError. bitmaps.ts maskBang is the working version.
 */
export function mask(s: Sprite, _mask: unknown = null, _xpush = 0, _ypush = 0): false {
  if (!s.bitmap) return false;
  throw new RubyError("NoMethodError", "undefined method `mask' for #<Bitmap>");
}

/** Sprite#blank_screen: an empty bitmap the size of the viewport. */
export function blankScreen(s: Sprite): void {
  const vp = viewportOf(s);
  assignBitmap(s, new Bitmap(vp.rect.width, vp.rect.height));
}

/** Sprite#swap_colors(map) */
export function spriteSwapColors(s: Sprite, map: ColorMap | Bitmap | null): void {
  if (s.bitmap) swapColors(s.bitmap, map);
}

/** Sprite#width / #height: the src_rect's (the port's Sprite already does this). */
export const spriteWidth = (s: SpriteGeometry): number => s.srcRect.width;
export const spriteHeight = (s: SpriteGeometry): number => s.srcRect.height;
