// Port of the parts of 007_Objects and windows/007_SpriteWrapper.rb the
// window system uses: BitmapSprite, AnimatedSprite, IconSprite.
// AnimatedSprite counts its frame skip in original 40 fps frames.

import { Bitmap } from "../rgss/Bitmap";
import { Sprite, type Viewport } from "../rgss/display";
import { AnimatedBitmap } from "./AnimatedBitmap";
import { FRAME_RATE, FrameCounter } from "./frameTime";
import { pbBitmapName, pbResolveBitmap } from "./rpgCache";

/** Sprite class that maintains a bitmap of its own. */
export class BitmapSprite extends Sprite {
  constructor(width: number, height: number, viewport: Viewport | null = null) {
    super(viewport);
    this.setBitmap(new Bitmap(width, height));
  }

  override dispose(): void {
    if (!this.isDisposed()) this.bitmap?.dispose();
    super.dispose();
  }
}

export class AnimatedSprite extends Sprite {
  private _frame = 0;
  framewidth = 0;
  frameheight = 0;
  framecount = 0;
  animname = "";
  private realframes = 0;
  private frameskip = 1;
  private framesperrow = 1;
  private _playing = false;
  private animbitmap: Bitmap | null = null;
  private clock = new FrameCounter(false);

  /** AnimatedSprite.new(animname, framecount, framewidth, frameheight, frameskip, viewport) */
  static createLong(animname: string, framecount: number, framewidth: number, frameheight: number, frameskip: number, viewport: Viewport | null = null): AnimatedSprite {
    const s = new AnimatedSprite(viewport);
    s.initializeLong(animname, framecount, framewidth, frameheight, frameskip);
    return s;
  }

  /** AnimatedSprite.create(animname, framecount, frameskip, viewport): frames on one row. */
  static create(animname: string, framecount: number, frameskip: number, viewport: Viewport | null = null): AnimatedSprite {
    const s = new AnimatedSprite(viewport);
    s.initializeShort(animname, framecount, frameskip);
    return s;
  }

  private loadAnim(animname: string, fallbackW: number, fallbackH: number): Bitmap {
    // AnimatedBitmap.new(animname).deanimate, or a blank bitmap if missing.
    if (pbResolveBitmap(animname)) return new AnimatedBitmap(animname).deanimate();
    return new Bitmap(fallbackW, fallbackH);
  }

  initializeLong(animname: string, framecount: number, framewidth: number, frameheight: number, frameskip: number): void {
    this.animname = pbBitmapName(animname);
    this.realframes = 0;
    this.frameskip = Math.max(1, frameskip) * Math.floor(FRAME_RATE / 20);
    if (framewidth === 0) throw new Error("Frame width is 0");
    if (frameheight === 0) throw new Error("Frame height is 0");
    this.animbitmap = this.loadAnim(animname, framewidth, frameheight);
    this.framecount = framecount;
    this.framewidth = framewidth;
    this.frameheight = frameheight;
    this.framesperrow = Math.floor(this.animbitmap.width / this.framewidth);
    this._playing = false;
    this.setBitmap(this.animbitmap);
    this.srcRect.width = this.framewidth;
    this.srcRect.height = this.frameheight;
    this.frame = 0;
  }

  /**
   * Shorter version of AnimationSprite. All frames are placed on a single row
   * of the bitmap, so that the width and height need not be defined beforehand.
   */
  initializeShort(animname: string, framecount: number, frameskip: number): void {
    this.animname = pbBitmapName(animname);
    this.realframes = 0;
    this.frameskip = Math.max(1, frameskip) * Math.floor(FRAME_RATE / 20);
    this.animbitmap = this.loadAnim(animname, framecount * 4, 32);
    this.framecount = framecount;
    this.framewidth = Math.floor(this.animbitmap.width / this.framecount);
    this.frameheight = this.animbitmap.height;
    this.framesperrow = framecount;
    this._playing = false;
    this.setBitmap(this.animbitmap);
    this.srcRect.width = this.framewidth;
    this.srcRect.height = this.frameheight;
    this.frame = 0;
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this.animbitmap = null; // the cached bitmap stays in the cache
    super.dispose();
  }

  isPlaying(): boolean {
    return this._playing;
  }

  get frame(): number {
    return this._frame;
  }

  set frame(value: number) {
    this._frame = value;
    this.realframes = 0;
    this.srcRect.x = (this._frame % this.framesperrow) * this.framewidth;
    this.srcRect.y = Math.floor(this._frame / this.framesperrow) * this.frameheight;
  }

  start(): void {
    this._playing = true;
    this.realframes = 0;
  }

  play(): void {
    this.start();
  }

  stop(): void {
    this._playing = false;
  }

  override update(dt?: number): void {
    super.update(dt);
    const frames = this.clock.tick();
    if (!this._playing) return;
    for (let n = 0; n < frames; n++) {
      this.realframes += 1;
      if (this.realframes === this.frameskip) {
        this.realframes = 0;
        this.frame = (this.frame + 1) % this.framecount;
      }
    }
  }
}

/** Displays an icon bitmap in a sprite. */
export class IconSprite extends Sprite {
  name = "";
  private _iconbitmap: AnimatedBitmap | null = null;

  constructor(x = 0, y = 0, viewport: Viewport | null = null) {
    super(viewport);
    this.x = x;
    this.y = y;
  }

  override dispose(): void {
    this.clearBitmaps();
    super.dispose();
  }

  /** Sets the icon's filename (must be preloaded). */
  setBitmapFile(file: string | null, hue = 0): void {
    const oldrc = this.srcRect.clone();
    this.clearBitmaps();
    this.name = file ?? "";
    if (!file) return;
    this._iconbitmap = new AnimatedBitmap(file, hue);
    this.setBitmap(this._iconbitmap.bitmap);
    if (oldrc.width > 0 && oldrc.height > 0) this.srcRect.set(oldrc);
  }

  clearBitmaps(): void {
    this._iconbitmap?.dispose();
    this._iconbitmap = null;
    if (!this.isDisposed()) this.setBitmap(null);
  }

  override update(dt?: number): void {
    super.update(dt);
    if (!this._iconbitmap) return;
    this._iconbitmap.update();
    if (this.bitmap !== this._iconbitmap.bitmap) {
      const oldrc = this.srcRect.clone();
      this.setBitmap(this._iconbitmap.bitmap);
      this.srcRect.set(oldrc);
    }
  }
}
