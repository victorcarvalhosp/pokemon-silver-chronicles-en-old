// Port of 007_Objects and windows/008_AnimatedBitmap.rb.
// Bitmaps come from the preloaded cache (see rpgCache.ts). GIF animation is
// not supported (the game's UI graphics are PNGs); "[n,d]name.png" frame
// strips are, with the delay counted in original 40 fps frames.

import { Bitmap } from "../rgss/Bitmap";
import { Rect } from "../rgss/types";
import { FrameCounter } from "./frameTime";
import { RPGCache } from "./rpgCache";

export class AnimatedBitmap {
  private _bitmap: PngAnimatedBitmap | GifBitmap;

  constructor(file: string | null | undefined, hue = 0) {
    if (file == null) throw new Error("Filename is nil (missing graphic).");
    let path = file;
    let filename = "";
    if (!file.endsWith("/")) {
      const split = file.split(/[\\/]/);
      filename = split.pop() ?? "";
      path = split.join("/") + "/";
    }
    if (/^\[\d+(?:,\d+)?\]/.test(filename)) {
      this._bitmap = new PngAnimatedBitmap(path, filename, hue);
    } else {
      this._bitmap = new GifBitmap(path, filename, hue);
    }
  }

  get width(): number { return this.bitmap.width; }
  get height(): number { return this.bitmap.height; }
  get length(): number { return this._bitmap.length; }
  get bitmap(): Bitmap { return this._bitmap.bitmap; }
  get currentIndex(): number { return this._bitmap.currentIndex; }
  get totalFrames(): number { return this._bitmap.totalFrames; }
  isDisposed(): boolean { return this._bitmap.isDisposed(); }
  update(): void { this._bitmap.update(); }
  dispose(): void { this._bitmap.dispose(); }
  deanimate(): Bitmap { return this._bitmap.deanimate(); }
}

export class PngAnimatedBitmap {
  frames: Bitmap[] = [];
  private currentFrame = 0;
  private framecount = 0;
  private frameDelay = 10;
  private disposed = false;
  private clock = new FrameCounter(false);

  constructor(dir: string, filename: string, hue = 0) {
    const panorama = loadBitmapHue(dir, filename, hue) ?? new Bitmap(32, 32);
    const m = /^\[(\d+)(?:,(\d+))?\]/.exec(filename);
    if (m) {
      const numFrames = Number(m[1]);
      let delay = Number(m[2] ?? 0);
      if (delay === 0) delay = 10;
      if (numFrames <= 0) throw new Error(`Invalid frame count in ${filename}`);
      if (panorama.width % numFrames !== 0) {
        throw new Error(`Bitmap's width (${panorama.width}) is not divisible by frame count: ${filename}`);
      }
      this.frameDelay = delay;
      const subWidth = panorama.width / numFrames;
      for (let i = 0; i < numFrames; i++) {
        const sub = new Bitmap(subWidth, panorama.height);
        sub.blt(0, 0, panorama, new Rect(subWidth * i, 0, subWidth, panorama.height));
        this.frames.push(sub);
      }
    } else {
      this.frames = [panorama];
    }
  }

  get bitmap(): Bitmap { return this.frames[this.currentFrame]!; }
  get currentIndex(): number { return this.currentFrame; }
  get length(): number { return this.frames.length; }
  get totalFrames(): number { return this.frameDelay * this.frames.length; }
  isDisposed(): boolean { return this.disposed; }

  deanimate(): Bitmap {
    this.frames = [this.frames[0]!];
    this.currentFrame = 0;
    return this.frames[0]!;
  }

  update(): void {
    if (this.disposed || this.frames.length <= 1) return;
    for (let n = this.clock.tick(); n > 0; n--) {
      this.framecount += 1;
      if (this.framecount >= this.frameDelay) {
        this.framecount = 0;
        this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      }
    }
  }

  dispose(): void {
    // Single-frame bitmaps are the shared cached ones; only split frames are ours.
    if (!this.disposed && this.frames.length > 1) for (const f of this.frames) f.dispose();
    this.disposed = true;
  }
}

export class GifBitmap {
  bitmap: Bitmap;
  private disposed = false;
  private owned = false;

  constructor(dir: string, filename: string, hue = 0) {
    let bmp: Bitmap | null = null;
    try {
      bmp = loadBitmapHue(dir, filename ?? "", hue);
    } catch {
      bmp = null;
    }
    if (!bmp) {
      bmp = new Bitmap(32, 32);
      this.owned = true;
    }
    this.bitmap = bmp;
  }

  get currentIndex(): number { return 0; }
  get length(): number { return 1; }
  get totalFrames(): number { return 1; }
  isDisposed(): boolean { return this.disposed; }
  deanimate(): Bitmap { return this.bitmap; }
  update(): void {}

  dispose(): void {
    if (this.disposed) return;
    if (this.owned) this.bitmap.dispose();
    this.disposed = true;
  }
}

const hued = new Map<string, Bitmap>();

/** RPG::Cache.load_bitmap(dir, filename, hue). */
function loadBitmapHue(dir: string, filename: string, hue: number): Bitmap | null {
  const base = RPGCache.loadBitmap(dir, filename);
  if (!base) return null;
  if (!hue) return base;
  const key = `${dir}${filename}:${hue}`;
  let bmp = hued.get(key);
  if (!bmp) {
    bmp = base.clone();
    bmp.hueChange(hue);
    hued.set(key, bmp);
  }
  return bmp;
}
