// Port of 007_Objects and windows/006_SpriteWindow_pictures.rb.
// Graphics given by path must already be preloaded (see rpgCache.ts).

import { Bitmap } from "../../rgss/Bitmap";
import type { Viewport } from "../../rgss/display";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbResolveBitmap } from "../rpgCache";
import { SpriteWindow_Base } from "./SpriteWindow";

/** Displays an icon bitmap in a window. Supports animated images. */
export class IconWindow extends SpriteWindow_Base {
  declare name: string;
  declare _iconbitmap: AnimatedBitmap | null;

  constructor(x: number, y: number, width: number, height: number, viewport: Viewport | null = null) {
    super(x, y, width, height);
    this.viewport = viewport;
    this.contents = null;
    this.name = "";
    this._iconbitmap = null;
  }

  override dispose(): void {
    this.clearBitmaps();
    super.dispose();
  }

  override update(): void {
    super.update();
    if (this._iconbitmap) {
      this._iconbitmap.update();
      this.contents = this._iconbitmap.bitmap;
    }
  }

  clearBitmaps(): void {
    this._iconbitmap?.dispose();
    this._iconbitmap = null;
    if (!this.isDisposed()) this.contents = null;
  }

  /** Sets the icon's filename. */
  setBitmap(file: string | null, hue = 0): void {
    this.clearBitmaps();
    this.name = file ?? "";
    if (file === null) return;
    if (file === "") {
      this._iconbitmap = null;
    } else {
      this._iconbitmap = new AnimatedBitmap(file, hue);
      // for compatibility
      this.contents = this._iconbitmap ? this._iconbitmap.bitmap : null;
    }
  }
}

/**
 * Displays an icon bitmap in a window. Supports animated images.
 * Accepts bitmaps and paths to bitmap files in its constructor.
 */
export class PictureWindow extends SpriteWindow_Base {
  declare _iconbitmap: AnimatedBitmap | Bitmap | null;

  constructor(pathOrBitmap: string | Bitmap | AnimatedBitmap | null) {
    super(0, 0, 32, 32);
    this.contents = null;
    this._iconbitmap = null;
    this.setBitmap(pathOrBitmap);
  }

  override dispose(): void {
    this.clearBitmaps();
    super.dispose();
  }

  override update(): void {
    super.update();
    if (this._iconbitmap) {
      if (this._iconbitmap instanceof Bitmap) {
        this.contents = this._iconbitmap;
      } else {
        this._iconbitmap.update();
        this.contents = this._iconbitmap.bitmap;
      }
    }
  }

  clearBitmaps(): void {
    // A Bitmap passed in by the caller is disposed too, as in Ruby.
    this._iconbitmap?.dispose();
    this._iconbitmap = null;
    if (!this.isDisposed()) this.contents = null;
  }

  /** Sets the icon's bitmap or filename. (hue is ignored unless pathOrBitmap is a filename) */
  setBitmap(pathOrBitmap: string | Bitmap | AnimatedBitmap | null, hue = 0): void {
    this.clearBitmaps();
    if (pathOrBitmap && pathOrBitmap !== "") {
      if (pathOrBitmap instanceof Bitmap) {
        this._iconbitmap = pathOrBitmap;
        this.contents = pathOrBitmap;
        this.width = pathOrBitmap.width + this.borderX;
        this.height = pathOrBitmap.height + this.borderY;
      } else if (pathOrBitmap instanceof AnimatedBitmap) {
        this._iconbitmap = pathOrBitmap;
        this.contents = pathOrBitmap.bitmap;
        this.width = pathOrBitmap.bitmap.width + this.borderX;
        this.height = pathOrBitmap.bitmap.height + this.borderY;
      } else {
        // AnimatedBitmap.new on a missing file gives a 32x32 blank in Ruby too.
        const icon = new AnimatedBitmap(pbResolveBitmap(pathOrBitmap) ?? pathOrBitmap, hue);
        this._iconbitmap = icon;
        this.contents = icon.bitmap;
        this.width = this.borderX + (icon.bitmap.width || 32);
        this.height = this.borderY + (icon.bitmap.height || 32);
      }
    } else {
      this._iconbitmap = null;
      this.width = 32 + this.borderX;
      this.height = 32 + this.borderY;
    }
  }
}
