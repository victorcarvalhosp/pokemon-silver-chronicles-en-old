// Port of ChangelingSprite (007_Objects and windows/007_SpriteWrapper.rb), plus
// a helper for Ruby classes that override a Sprite attribute writer (x=, y=,
// color=) to refresh their child sprites.

import { Sprite, type Viewport } from "../../rgss/display";
import { AnimatedBitmap } from "../AnimatedBitmap";

/** A sprite that switches between named bitmaps. */
export class ChangelingSprite extends Sprite {
  private bitmaps: Record<string, AnimatedBitmap> = {};
  private currentBitmap: AnimatedBitmap | null = null;

  constructor(x = 0, y = 0, viewport: Viewport | null = null) {
    super(viewport);
    this.x = x;
    this.y = y;
  }

  addBitmap(key: string, path: string): void {
    this.bitmaps[key]?.dispose();
    this.bitmaps[key] = new AnimatedBitmap(path);
  }

  changeBitmap(key: string): void {
    this.currentBitmap = this.bitmaps[key] ?? null;
    const bmp = this.currentBitmap ? this.currentBitmap.bitmap : null;
    if (this.bitmap !== bmp) this.setBitmap(bmp);
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    for (const bm of Object.values(this.bitmaps)) bm.dispose();
    this.bitmaps = {};
    super.dispose();
  }

  override update(dt?: number): void {
    if (this.isDisposed()) return;
    for (const bm of Object.values(this.bitmaps)) bm.update();
    const bmp = this.currentBitmap ? this.currentBitmap.bitmap : null;
    if (this.bitmap !== bmp) this.setBitmap(bmp);
  }
}

/**
 * Makes `obj[key]` an accessor that calls `after` once the value is stored,
 * like a Ruby `def x=(value); super; refresh; end` override. (Sprite's
 * attributes are instance fields, so a subclass accessor can't override them.)
 */
export function onPropertySet(obj: object, keys: string[], after: () => void): void {
  for (const key of keys) {
    let value = (obj as Record<string, unknown>)[key];
    Object.defineProperty(obj, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (v: unknown) => {
        value = v;
        after();
      },
    });
  }
}
