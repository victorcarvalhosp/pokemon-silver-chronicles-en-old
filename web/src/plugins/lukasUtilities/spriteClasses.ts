// Luka's Scripting Utilities: ScrollingSprite, TrailingSprite, RainbowSprite,
// SpriteSheet and SelectorSprite (script.rb:832-1085).
//
// Each update() is one Ruby update call, made once per 60 Hz logic tick:
// Graphics.frame_rate is 60 here (FRAME_RATE, extensions.ts), and the
// plugin's own Numeric#delta scales its frame counts and per-frame amounts
// for that (x1.5 / /1.5). Values written to src_rect, opacity and hue are
// truncated (and opacity clamped) as mkxp-z's integer setters do.
// NOTE (Ruby parity): like the Ruby classes, these update() methods don't
// call Sprite#update (SelectorSprite calls SpriteSheet's), so a flash on
// them doesn't advance.

import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Color, Rect } from "../../rgss/types";
import { pbBitmap, pbSelBitmap } from "./bitmaps";
import { deltaAdd, deltaSub } from "./extensions";
import { rdiv, toI } from "./rubyHelpers";
import { assignBitmap, centerBang } from "./sprites";

const opacityOf = (v: number) => Math.max(0, Math.min(255, toI(v)));

//===============================================================================
//  Scrolling backgrounds (move animations)
//===============================================================================
export class ScrollingSprite extends Sprite {
  speed: number | null = null;
  direction: number | null = null;
  vertical = false;
  pulse = false;
  minO = 0;
  maxO = 255;
  private gopac = 1;
  private frame = 0;

  /** setBitmap(val, vertical = false, pulse = false): the graphic twice, side by side (or stacked), shown one at a time. */
  override setBitmap(val: Bitmap | string | null, vertical = false, pulse = false): void {
    this.vertical = vertical;
    this.pulse = pulse;
    if (this.direction === null) this.direction = 1;
    this.gopac = 1;
    this.frame = 0;
    if (this.speed === null) this.speed = 32;
    this.minO = 0;
    this.maxO = 255;
    if (typeof val === "string") val = pbBitmap(val);
    if (!val) return assignBitmap(this, null);
    if (this.vertical) {
      const bmp = new Bitmap(val.width, val.height * 2);
      for (let i = 0; i < 2; i++) bmp.blt(0, val.height * i, val, val.rect());
      assignBitmap(this, bmp);
      const y = this.direction > 0 ? 0 : val.height;
      this.srcRect.set(0, y, val.width, val.height);
    } else {
      const bmp = new Bitmap(val.width * 2, val.height);
      for (let i = 0; i < 2; i++) bmp.blt(val.width * i, 0, val, val.rect());
      assignBitmap(this, bmp);
      const x = this.direction > 0 ? 0 : val.width;
      this.srcRect.set(x, 0, val.width, val.height);
    }
  }

  override update(): void {
    const speed = this.speed ?? 32;
    const direction = this.direction ?? 1;
    const s = toI(rdiv(1, speed));
    this.frame += 1;
    if (this.frame < deltaAdd(s, false)) return;
    const spd = speed < 1 ? 1 : speed;
    const mod = [direction, deltaSub(spd * direction, false)];
    const step = direction > 0 ? Math.max(...mod) : Math.min(...mod);
    const r = this.srcRect;
    if (this.vertical) {
      r.y = toI(r.y + step);
      if (direction > 0 && r.y >= r.height) r.y = 0;
      if (direction < 0 && r.y <= 0) r.y = r.height;
    } else {
      r.x = toI(r.x + step);
      if (direction > 0 && r.x >= r.width) r.x = 0;
      if (direction < 0 && r.x <= 0) r.x = r.width;
    }
    if (this.pulse) {
      this.opacity = opacityOf(this.opacity - deltaSub(this.gopac * spd, false));
      if (this.opacity === this.maxO || this.opacity === this.minO) this.gopac *= -1;
    }
    this.frame = 0;
  }
}

//===============================================================================
//  Sprites with a trail
//===============================================================================
/**
 * Every keyFrame frames a copy of the bitmap is dropped at (x, y), then fades
 * and shrinks.
 * NOTE (Ruby parity, script.rb:928, 938-946): copies call Sprite#center (a
 * getter) instead of center!, so they're anchored at their top-left; faded
 * copies are kept (and drawn) until dispose.
 */
export class TrailingSprite {
  x = 0;
  y = 0;
  z = 0;
  color = new Color(0, 0, 0, 0);
  keyFrame = 0;
  zoomX = 1;
  zoomY = 1;
  opacity = 255;
  private sprites = new Map<string, Sprite>();
  private i = 0;
  private frame = 128;

  constructor(
    private viewport: Viewport | null,
    private bmp: Bitmap | null,
  ) {}

  update(): void {
    this.frame += 1;
    if (this.frame > deltaAdd(this.keyFrame, false)) {
      const s = new Sprite(this.viewport);
      assignBitmap(s, this.bmp);
      s.x = this.x;
      s.y = this.y;
      s.z = this.z;
      s.zoomX = this.zoomX;
      s.zoomY = this.zoomY;
      s.opacity = opacityOf(this.opacity);
      this.sprites.set(`${this.i}`, s);
      this.i += 1;
      this.frame = 0;
    }
    for (const s of this.sprites.values()) {
      if (s.opacity > deltaAdd(this.keyFrame, false)) {
        s.opacity = opacityOf(s.opacity - deltaSub(24, false));
        s.zoomX -= deltaSub(0.035, false);
        s.zoomY -= deltaSub(0.035, false);
        s.color.set(this.color);
      }
    }
  }

  set visible(val: boolean) {
    for (const s of this.sprites.values()) s.visible = val;
  }

  dispose(): void {
    for (const s of this.sprites.values()) s.dispose();
    this.sprites.clear();
  }

  /** disposed?: true while there are no copies (so also before the first update). */
  isDisposed(): boolean {
    return this.sprites.size < 1;
  }
}

//===============================================================================
//  Hue changing sprite
//===============================================================================
export class RainbowSprite extends Sprite {
  speed = 1;
  private val: Bitmap | null = null;
  private currentHue = 0;

  /** setBitmap(val, speed = 1) */
  override setBitmap(val: Bitmap | string | null, speed = 1): void {
    this.val = typeof val === "string" ? pbBitmap(val) : val;
    this.speed = speed;
    if (!this.val) return assignBitmap(this, null);
    assignBitmap(this, new Bitmap(this.val.width, this.val.height));
    this.bitmap!.blt(0, 0, this.val, this.val.rect());
    this.currentHue = 0;
  }

  override update(): void {
    this.currentHue += Math.max(1, deltaSub(this.speed, false));
    if (this.currentHue >= 360) this.currentHue = 0;
    if (!this.bitmap || !this.val) return;
    this.bitmap.clear();
    this.bitmap.blt(0, 0, this.val, this.val.rect());
    this.bitmap.hueChange(toI(this.currentHue));
  }
}

//===============================================================================
//  Animated sprite from a sprite sheet (horizontal, or vertical)
//===============================================================================
export class SpriteSheet extends Sprite {
  speed = 1;
  protected curFrame = 0;
  protected vertical = false;

  constructor(
    viewport: Viewport | null = null,
    protected frames = 1,
  ) {
    super(viewport);
  }

  /** setBitmap(file, vertical = false): the sheet, src_rect cut to one frame. */
  override setBitmap(file: Bitmap | string | null, vertical = false): void {
    assignBitmap(this, file instanceof Bitmap ? file : pbBitmap(file));
    this.vertical = vertical;
    if (this.vertical) this.srcRect.height = rdiv(this.srcRect.height, this.frames);
    else this.srcRect.width = rdiv(this.srcRect.width, this.frames);
  }

  override update(): void {
    if (!this.bitmap) return;
    if (this.curFrame >= deltaAdd(this.speed, false)) {
      if (this.vertical) {
        this.srcRect.y += this.srcRect.height;
        if (this.srcRect.y >= this.bitmap.height) this.srcRect.y = 0;
      } else {
        this.srcRect.x += this.srcRect.width;
        if (this.srcRect.x >= this.bitmap.width) this.srcRect.x = 0;
      }
      this.curFrame = 0;
    }
    this.curFrame += 1;
  }
}

//===============================================================================
//  Selection cursor
//===============================================================================
export class SelectorSprite extends SpriteSheet {
  filename: string | null = null;
  anchor: Sprite | null = null;

  /** render(rect, file = nil, vertical = false): a cursor sheet around rect (pbSelBitmap), centred. */
  render(rect: { width: number; height: number }, file: string | null = null, vertical = false): void {
    if (this.filename === null && file !== null) this.filename = file;
    this.curFrame = 0;
    this.srcRect.x = 0;
    this.srcRect.y = 0;
    this.setBitmap(pbSelBitmap(this.filename, rect), vertical);
    centerBang(this);
    this.speed = 4;
  }

  /** target(sprite): renders around the sprite and follows it. */
  target(sprite: unknown): void {
    if (!sprite || !(sprite instanceof Sprite)) return;
    this.render(new Rect(0, 0, sprite.width, sprite.height));
    this.anchor = sprite;
  }

  override update(): void {
    super.update();
    if (this.anchor) {
      this.x = this.anchor.x - this.anchor.ox + rdiv(this.anchor.width, 2);
      this.y = this.anchor.y - this.anchor.oy + rdiv(this.anchor.height, 2);
      this.opacity = this.anchor.opacity;
      this.visible = this.anchor.visible;
    }
  }
}
