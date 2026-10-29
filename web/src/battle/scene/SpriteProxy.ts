// A Sprite whose attributes are accessors, for the battle scene's Sprite
// subclasses that override attribute writers (Ruby `def x=(value); super;
// ...; end`): PokemonDataBox, AbilitySplashBar, BattlerSprite. The RGSS layer's
// Sprite keeps its attributes as instance fields, which a subclass can't turn
// into accessors, so these classes wrap a Sprite and forward to it.
//
// RGSS details kept here: x/y/z/ox/oy and opacity store ints (opacity clamped
// to 0..255), and #bitmap= resets src_rect to the whole bitmap unless the same
// bitmap is assigned again (mkxp-z returns early then).

import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import type { Color, Rect, Tone } from "../../rgss/types";

export class SpriteProxy {
  readonly sprite: Sprite;

  constructor(viewport: Viewport | null = null) {
    this.sprite = new Sprite(viewport);
  }

  get viewport(): Viewport | null { return this.sprite.viewport; }

  get bitmap(): Bitmap | null { return this.sprite.bitmap; }
  /** Ruby's bitmap=. */
  set bitmap(value: Bitmap | null) { this.setBitmap(value); }
  setBitmap(value: Bitmap | null): void {
    if (value === this.sprite.bitmap) return;
    this.sprite.setBitmap(value);
  }

  get srcRect(): Rect { return this.sprite.srcRect; }
  set srcRect(value: Rect) { this.sprite.srcRect.set(value); }

  get x(): number { return this.sprite.x; }
  set x(value: number) { this.sprite.x = Math.trunc(value); }
  get y(): number { return this.sprite.y; }
  set y(value: number) { this.sprite.y = Math.trunc(value); }
  get z(): number { return this.sprite.z; }
  set z(value: number) { this.sprite.z = Math.trunc(value); }
  get ox(): number { return this.sprite.ox; }
  set ox(value: number) { this.sprite.ox = Math.trunc(value); }
  get oy(): number { return this.sprite.oy; }
  set oy(value: number) { this.sprite.oy = Math.trunc(value); }
  get zoomX(): number { return this.sprite.zoomX; }
  set zoomX(value: number) { this.sprite.zoomX = value; }
  get zoomY(): number { return this.sprite.zoomY; }
  set zoomY(value: number) { this.sprite.zoomY = value; }
  get angle(): number { return this.sprite.angle; }
  set angle(value: number) { this.sprite.angle = value; }
  get mirror(): boolean { return this.sprite.mirror; }
  set mirror(value: boolean) { this.sprite.mirror = value; }
  get bushDepth(): number { return this.sprite.bushDepth; }
  set bushDepth(value: number) { this.sprite.bushDepth = value; }
  get opacity(): number { return this.sprite.opacity; }
  set opacity(value: number) { this.sprite.opacity = Math.max(0, Math.min(255, Math.trunc(value))); }
  get blendType(): number { return this.sprite.blendType; }
  set blendType(value: number) { this.sprite.blendType = value; }
  get visible(): boolean { return this.sprite.visible; }
  set visible(value: boolean) { this.sprite.visible = value; }
  get color(): Color { return this.sprite.color; }
  set color(value: Color) { this.sprite.color = value.clone(); }
  get tone(): Tone { return this.sprite.tone; }
  set tone(value: Tone) { this.sprite.tone = value.clone(); }

  get width(): number { return this.sprite.width; }
  get height(): number { return this.sprite.height; }

  /** duration in seconds (see rgss Sprite#flash). */
  flash(color: Color | null, duration: number): void { this.sprite.flash(color, duration); }
  update(): void { this.sprite.update(); }
  isDisposed(): boolean { return this.sprite.isDisposed(); }
  dispose(): void { this.sprite.dispose(); }
}

/** Sprite-like objects the battle animations and PBAnimationPlayerX drive. */
export type AnySprite = Sprite | SpriteProxy;

/** RGSS sprite.bitmap = value (src_rect reset unless it's the same bitmap). */
export function assignBitmap(sprite: AnySprite, bitmap: Bitmap | null): void {
  if (sprite instanceof SpriteProxy) sprite.setBitmap(bitmap);
  else if (sprite.bitmap !== bitmap) sprite.setBitmap(bitmap);
}
