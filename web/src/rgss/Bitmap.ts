// RGSS Bitmap on a 2D canvas. Text drawing follows mkxp-z + Essentials'
// MKXP_Compatibility patch: the text is top-aligned at y - text_offset_y and
// measured with the font's own height.

import { CanvasSource, Rectangle, Texture } from "pixi.js";
import { assetUrl, loadImage } from "../core/assets";
import { Color, Rect } from "./types";

export class Font {
  static defaultName = "Power Green";
  static defaultSize = 27;
  static defaultBold = false;
  static defaultItalic = false;
  static defaultColor = new Color(255, 255, 255, 255);

  name = Font.defaultName;
  size = Font.defaultSize;
  bold = Font.defaultBold;
  italic = Font.defaultItalic;
  color = Font.defaultColor.clone();

  css(): string {
    return `${this.italic ? "italic " : ""}${this.bold ? "bold " : ""}${this.size}px "${this.name}"`;
  }

  clone(): Font {
    const f = new Font();
    Object.assign(f, { name: this.name, size: this.size, bold: this.bold, italic: this.italic, color: this.color.clone() });
    return f;
  }
}

/** Registers every TTF in the project's Fonts/ folder under its file name. */
export async function loadFonts(names: string[]): Promise<void> {
  await Promise.all(
    names.map(async (file) => {
      const family = file.replace(/\.ttf$/i, "");
      const face = new FontFace(family, `url("${assetUrl(`Fonts/${file}`)}")`);
      document.fonts.add(await face.load());
    }),
  );
}

type Drawable = Bitmap | ImageBitmap | OffscreenCanvas;

export class Bitmap {
  readonly canvas: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;
  font = new Font();
  /** Essentials' text_offset_y (MKXP_Compatibility). */
  textOffsetY = 0;
  private source: CanvasSource | null = null;
  private dirty = true;
  private disposed = false;

  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: false })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Loads "Graphics/..." (extension optional). Resolves to null if missing. */
  static async load(path: string): Promise<Bitmap | null> {
    const image = await loadImage(path);
    if (!image) return null;
    const bmp = new Bitmap(image.width, image.height);
    bmp.ctx.drawImage(image, 0, 0);
    return bmp;
  }

  static fromImage(image: Drawable): Bitmap {
    const src = image instanceof Bitmap ? image.canvas : image;
    const bmp = new Bitmap(src.width, src.height);
    bmp.ctx.drawImage(src, 0, 0);
    return bmp;
  }

  get width(): number { return this.canvas.width; }
  get height(): number { return this.canvas.height; }
  rect(): Rect { return new Rect(0, 0, this.width, this.height); }
  isDisposed(): boolean { return this.disposed; }

  dispose(): void {
    this.disposed = true;
    this.source?.destroy();
    this.source = null;
  }

  private changed(): void {
    this.dirty = true;
  }

  /** Pixi texture source for this bitmap, re-uploaded when drawn to. */
  textureSource(): CanvasSource {
    if (!this.source) {
      this.source = new CanvasSource({ resource: this.canvas as unknown as HTMLCanvasElement, scaleMode: "nearest" });
      this.dirty = false;
    } else if (this.dirty) {
      this.source.update();
      this.dirty = false;
    }
    return this.source;
  }

  texture(rect: Rect): Texture {
    const r = clipRect(rect, this.width, this.height);
    return new Texture({ source: this.textureSource(), frame: new Rectangle(r.x, r.y, r.width, r.height) });
  }

  clone(): Bitmap {
    const b = Bitmap.fromImage(this);
    b.font = this.font.clone();
    b.textOffsetY = this.textOffsetY;
    return b;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.changed();
  }

  clearRect(x: number | Rect, y = 0, w = 0, h = 0): void {
    if (x instanceof Rect) return this.clearRect(x.x, x.y, x.width, x.height);
    this.ctx.clearRect(x, y, w, h);
    this.changed();
  }

  fillRect(x: number | Rect, y: number | Color, w?: number, h?: number, color?: Color): void {
    if (x instanceof Rect) return this.fillRect(x.x, x.y, x.width, x.height, y as Color);
    // RGSS replaces pixels rather than blending.
    this.ctx.clearRect(x, y as number, w!, h!);
    this.ctx.fillStyle = color!.toCss();
    this.ctx.fillRect(x, y as number, w!, h!);
    this.changed();
  }

  gradientFillRect(x: number, y: number, w: number, h: number, c1: Color, c2: Color, vertical = false): void {
    const g = vertical ? this.ctx.createLinearGradient(0, y, 0, y + h) : this.ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, c1.toCss());
    g.addColorStop(1, c2.toCss());
    this.ctx.clearRect(x, y, w, h);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(x, y, w, h);
    this.changed();
  }

  blt(x: number, y: number, src: Drawable, rect: Rect, opacity = 255): void {
    const image = src instanceof Bitmap ? src.canvas : src;
    const r = clipRect(rect, image.width, image.height);
    if (r.width <= 0 || r.height <= 0) return;
    this.ctx.globalAlpha = opacity / 255;
    this.ctx.drawImage(image, r.x, r.y, r.width, r.height, x + (r.x - rect.x), y + (r.y - rect.y), r.width, r.height);
    this.ctx.globalAlpha = 1;
    this.changed();
  }

  stretchBlt(dest: Rect, src: Drawable, rect: Rect, opacity = 255): void {
    const image = src instanceof Bitmap ? src.canvas : src;
    if (rect.width <= 0 || rect.height <= 0) return;
    this.ctx.globalAlpha = opacity / 255;
    this.ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, dest.x, dest.y, dest.width, dest.height);
    this.ctx.globalAlpha = 1;
    this.changed();
  }

  getPixel(x: number, y: number): Color {
    const d = this.ctx.getImageData(x, y, 1, 1).data;
    return new Color(d[0], d[1], d[2], d[3]);
  }

  setPixel(x: number, y: number, color: Color): void {
    const img = this.ctx.createImageData(1, 1);
    img.data.set([color.red, color.green, color.blue, color.alpha]);
    this.ctx.putImageData(img, x, y);
    this.changed();
  }

  /** Rotates the hue of every pixel by `hue` degrees (RGSS Bitmap#hue_change). */
  hueChange(hue: number): void {
    hue = ((hue % 360) + 360) % 360;
    if (hue === 0) return;
    const img = this.ctx.getImageData(0, 0, this.width, this.height);
    shiftHue(img.data, hue);
    this.ctx.putImageData(img, 0, 0);
    this.changed();
  }

  private metrics() {
    this.ctx.font = this.font.css();
    const m = this.ctx.measureText("Mg");
    const ascent = Math.ceil(m.fontBoundingBoxAscent);
    const descent = Math.ceil(m.fontBoundingBoxDescent);
    return { ascent, height: ascent + descent };
  }

  textSize(text: string): Rect {
    const { height } = this.metrics();
    return new Rect(0, 0, Math.ceil(this.ctx.measureText(text).width), height);
  }

  /**
   * draw_text(x, y, w, h, text, align) or draw_text(rect, text, align).
   * align: 0 left, 1 center, 2 right.
   */
  drawText(x: number | Rect, y: number | string, w?: number | string, h?: number, text?: string, align = 0): void {
    if (x instanceof Rect) {
      const a = typeof w === "number" ? w : 0;
      // Essentials only shifts the rect form by text_offset_y.
      return this.drawTextInRect(x.x, x.y - this.textOffsetY, x.width, x.height, String(y), a);
    }
    const str = String(text ?? "");
    const height = this.textSize(str).height;
    this.drawTextInRect(x, (y as number) - this.textOffsetY, w as number, height, str, align);
  }

  private drawTextInRect(x: number, y: number, w: number, h: number, text: string, align: number): void {
    if (!text) return;
    const { ascent, height } = this.metrics();
    const width = this.ctx.measureText(text).width;
    let tx = x;
    if (align === 1) tx = x + (w - width) / 2;
    else if (align === 2) tx = x + w - width;
    const ty = y + Math.floor((h - height) / 2);
    const scaleX = width > w && w > 0 ? w / width : 1; // RGSS squeezes text that doesn't fit
    this.ctx.save();
    this.ctx.fillStyle = this.font.color.toCss();
    this.ctx.textBaseline = "alphabetic";
    if (scaleX < 1) {
      this.ctx.translate(x, 0);
      this.ctx.scale(scaleX, 1);
      this.ctx.fillText(text, 0, ty + ascent);
    } else {
      this.ctx.fillText(text, Math.round(tx), ty + ascent);
    }
    this.ctx.restore();
    this.changed();
  }
}

export function clipRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return new Rect(x, y, Math.max(0, Math.min(rect.x + rect.width, width) - x), Math.max(0, Math.min(rect.y + rect.height, height) - y));
}

/** In-place hue rotation in HSV space, like RGSS's hue_change. */
export function shiftHue(data: Uint8ClampedArray, hue: number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i]! / 255, g = data[i + 1]! / 255, b = data[i + 2]! / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + hue + 360) % 360;
    const s = d / max, v = max;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    data[i] = Math.round((rr + m) * 255);
    data[i + 1] = Math.round((gg + m) * 255);
    data[i + 2] = Math.round((bb + m) * 255);
  }
}
