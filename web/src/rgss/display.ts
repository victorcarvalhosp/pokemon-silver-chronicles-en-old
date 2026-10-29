// RGSS Sprite, Viewport and Plane on top of PixiJS.
//
// Game code mutates plain fields (sprite.x, sprite.srcRect.x, ...) exactly as
// Essentials does; every live object copies its state to Pixi once per
// rendered frame in syncDisplay(). Ordering follows RGSS: viewports and
// viewport-less sprites sort together by z on the stage, sprites sort by z
// inside their viewport, ties keep creation order.

import "pixi.js/advanced-blend-modes";
import { Container, Graphics as PixiGraphics, Sprite as PixiSprite, Texture, TilingSprite } from "pixi.js";
import type { BLEND_MODES } from "pixi.js";
import { Bitmap } from "./Bitmap";
import { ScreenToneFilter, ToneFilter } from "./ToneFilter";
import { Color, Rect, Tone } from "./types";

let stage: Container | null = null;
const live = new Set<Displayable>();

// mkxp breaks z ties by creation order (SceneElement's creation stamp). Pixi
// sorts children in place, so a tie keeps whatever order an earlier sort
// left; the stamp goes into zIndex as a fraction instead (z needs 17 bits,
// leaving 36 for the stamp).
let nextStamp = 1;
const STAMP_STEP = 2 ** -36;
export function zIndexOf(z: number, stamp: number): number {
  return z + stamp * STAMP_STEP;
}

/** A creation stamp for a raw Pixi object that sorts among Sprites (the tilemap's tiles). */
export function newZStamp(): number {
  return nextStamp++;
}

export function attachStage(s: Container): void {
  stage = s;
  s.sortableChildren = true;
}

interface Displayable {
  sync(): void;
}

/** Every live sprite, viewport and plane (ObjectSpace.each_object, for pbHideVisibleObjects). */
export function liveObjects(): readonly unknown[] {
  return [...live];
}

export function syncDisplay(): void {
  for (const d of live) d.sync();
}

const BLEND: BLEND_MODES[] = ["normal", "add", "subtract"];

/** Flash state shared by Sprite and Viewport (RGSS #flash). */
class Flash {
  color: Color | null = null;
  private duration = 0;
  private left = 0;
  start(color: Color | null, seconds: number): void {
    this.color = color ? color.clone() : null;
    this.duration = this.left = seconds;
  }
  update(dt: number): void {
    if (this.left > 0) this.left = Math.max(0, this.left - dt);
  }
  /** Current flash colour, fading out; "hide" for flash(nil). */
  current(): Color | "hide" | null {
    if (this.left <= 0) return null;
    if (!this.color) return "hide";
    const c = this.color.clone();
    c.alpha = (this.color.alpha * this.left) / this.duration;
    return c;
  }
}

function effects(node: Container, filterHolder: { filter: ToneFilter | null }, tone: Tone, color: Color, flash: Color | null): void {
  const c = flash && (!color.alpha || flash.alpha > color.alpha) ? flash : color;
  const filters: ToneFilter[] = [];
  if (!tone.isZero() || c.alpha !== 0) {
    filterHolder.filter ??= new ToneFilter();
    filterHolder.filter.set(tone, c);
    filters.push(filterHolder.filter);
  }
  const current = (node.filters ?? []) as ToneFilter[];
  if (current.length !== filters.length || current.some((f, i) => f !== filters[i])) node.filters = filters.length ? filters : null;
}

export class Viewport implements Displayable {
  rect: Rect;
  ox = 0;
  oy = 0;
  z = 0;
  visible = true;
  color = new Color(0, 0, 0, 0);
  tone = new Tone();
  /**
   * mkxp's semantics for `tone`: applied to the screen under the viewport too,
   * not just to its children (RPG::Weather's screen tone). Off by default: the
   * port's other viewports tone only their own contents.
   */
  toneScreen = false;
  private toneOverlay: PixiSprite | null = null;
  readonly node = new Container({ sortableChildren: true });
  private mask = new PixiGraphics();
  /**
   * The viewport's color/flash. RGSS (mkxp) blends it over the whole viewport
   * rect, including what's under it, so an empty viewport with color fades the
   * screen (pbFadeOutIn, battle intros, screen flashes).
   */
  private overlay = new PixiSprite(Texture.WHITE);
  private flashState = new Flash();
  private filterHolder = { filter: null as ToneFilter | null };
  private disposed = false;

  private stamp = nextStamp++;

  constructor(x: number | Rect = 0, y = 0, width = 512, height = 384) {
    this.rect = x instanceof Rect ? x.clone() : new Rect(x, y, width, height);
    stage!.addChild(this.node);
    this.node.addChild(this.mask);
    this.overlay.zIndex = Number.MAX_SAFE_INTEGER;
    this.overlay.visible = false;
    this.node.addChild(this.overlay);
    live.add(this);
  }

  flash(color: Color | null, seconds: number): void { this.flashState.start(color, seconds); }
  update(dt = 1 / 60): void { this.flashState.update(dt); }
  isDisposed(): boolean { return this.disposed; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    live.delete(this);
    this.toneOverlay?.destroy();
    this.node.destroy({ children: false });
  }

  sync(): void {
    const n = this.node;
    const f = this.flashState.current();
    n.visible = this.visible && f !== "hide";
    n.zIndex = zIndexOf(this.z, this.stamp);
    n.position.set(this.rect.x, this.rect.y);
    this.mask.clear().rect(0, 0, this.rect.width, this.rect.height).fill(0xffffff);
    n.mask = this.mask;
    const flash = f === "hide" ? null : f;
    const c = flash && (!this.color.alpha || flash.alpha > this.color.alpha) ? flash : this.color;
    this.overlay.visible = c.alpha > 0;
    if (this.overlay.visible) {
      this.overlay.tint = (c.red << 16) | (c.green << 8) | c.blue;
      this.overlay.alpha = c.alpha / 255;
      this.overlay.width = this.rect.width;
      this.overlay.height = this.rect.height;
    }
    if (this.toneScreen) {
      const show = !this.tone.isZero();
      if (show && !this.toneOverlay) {
        this.toneOverlay = new PixiSprite(Texture.WHITE);
        this.toneOverlay.zIndex = Number.MAX_SAFE_INTEGER - 1;
        this.toneOverlay.filters = [new ScreenToneFilter()];
        n.addChild(this.toneOverlay);
      }
      if (this.toneOverlay) {
        this.toneOverlay.visible = show;
        this.toneOverlay.width = this.rect.width;
        this.toneOverlay.height = this.rect.height;
        (this.toneOverlay.filters as ScreenToneFilter[])[0]!.set(this.tone);
      }
      effects(n, this.filterHolder, NO_TONE, NO_COLOR, null);
      return;
    }
    if (this.toneOverlay) this.toneOverlay.visible = false;
    effects(n, this.filterHolder, this.tone, NO_COLOR, null);
  }
}

const NO_TONE = new Tone();

const NO_COLOR = new Color(0, 0, 0, 0);

export class Sprite implements Displayable {
  bitmap: Bitmap | null = null;
  srcRect = new Rect();
  x = 0;
  y = 0;
  z = 0;
  ox = 0;
  oy = 0;
  zoomX = 1;
  zoomY = 1;
  angle = 0;
  mirror = false;
  bushDepth = 0;
  opacity = 255;
  blendType = 0;
  visible = true;
  color = new Color(0, 0, 0, 0);
  tone = new Tone();
  /**
   * mkxp-z's Sprite#pattern: a bitmap tiled over the sprite's own pixels
   * (in bitmap coordinates, from patternScroll, scaled by patternZoom) and
   * blended onto them with patternBlendType at patternOpacity. ZUD Mechanics
   * colours Dynamax Pokémon with it. Approximation: the pattern is drawn
   * under the sprite's tone/color (mkxp-z blends it in the same shader), and
   * the bush part isn't patterned.
   */
  pattern: Bitmap | null = null;
  patternOpacity = 255;
  patternBlendType = 0;
  patternScrollX = 0;
  patternScrollY = 0;
  patternZoomX = 1;
  patternZoomY = 1;
  readonly node = new Container();
  private main = new PixiSprite();
  private bush = new PixiSprite();
  private patternSprite: TilingSprite | null = null;
  private patternMask: PixiSprite | null = null;
  private lastPattern: Bitmap | null = null;
  private lastBitmap: Bitmap | null = null;
  private lastRect = new Rect(-1, -1, -1, -1);
  private lastBush = -1;
  private flashState = new Flash();
  private filterHolder = { filter: null as ToneFilter | null };
  private disposed = false;

  private stamp = nextStamp++;

  private _viewport: Viewport | null;

  constructor(viewport: Viewport | null = null) {
    this._viewport = viewport;
    this.node.addChild(this.main, this.bush);
    this.bush.alpha = 0.5;
    (viewport ? viewport.node : stage!).addChild(this.node);
    live.add(this);
  }

  get viewport(): Viewport | null { return this._viewport; }
  /** mkxp-z's Sprite#viewport=: moves the sprite into another viewport. */
  set viewport(value: Viewport | null) {
    if (value === this._viewport) return;
    this._viewport = value;
    if (this.disposed) return;
    this.node.removeFromParent();
    (value ? value.node : stage!).addChild(this.node);
  }

  /** Assigning a bitmap resets src_rect to cover it, as in RGSS. */
  setBitmap(bitmap: Bitmap | null): void {
    this.bitmap = bitmap;
    if (bitmap) this.srcRect.set(0, 0, bitmap.width, bitmap.height);
  }

  get width(): number { return this.srcRect.width; }
  get height(): number { return this.srcRect.height; }

  flash(color: Color | null, seconds: number): void { this.flashState.start(color, seconds); }
  update(dt = 1 / 60): void { this.flashState.update(dt); }
  isDisposed(): boolean { return this.disposed; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    live.delete(this);
    this.node.destroy({ children: true });
  }

  sync(): void {
    const n = this.node;
    const f = this.flashState.current();
    const bmp = this.bitmap && !this.bitmap.isDisposed() ? this.bitmap : null;
    n.visible = this.visible && !!bmp && this.opacity > 0 && f !== "hide";
    if (!n.visible || !bmp) return;
    // Rebuild textures only when the bitmap, src_rect or bush depth changed
    // (bitmap content changes are picked up by its texture source).
    if (bmp !== this.lastBitmap || !this.srcRect.equals(this.lastRect) || this.bushDepth !== this.lastBush) {
      const r = this.srcRect;
      const bush = Math.max(0, Math.min(this.bushDepth, r.height));
      this.main.texture = r.height - bush > 0 ? bmp.texture(new Rect(r.x, r.y, r.width, r.height - bush)) : Texture.EMPTY;
      this.bush.texture = bush > 0 ? bmp.texture(new Rect(r.x, r.y + r.height - bush, r.width, bush)) : Texture.EMPTY;
      this.bush.y = r.height - bush;
      this.bush.visible = bush > 0;
      this.lastBitmap = bmp;
      this.lastRect.set(r);
      this.lastBush = this.bushDepth;
    } else {
      bmp.textureSource();
    }
    const vp = this.viewport;
    n.position.set(this.x - (vp?.ox ?? 0), this.y - (vp?.oy ?? 0));
    n.pivot.set(this.ox, this.oy);
    n.scale.set(this.zoomX, this.zoomY);
    // RGSS mirrors the image inside its own rectangle; the origin stays put.
    const flip = this.mirror ? -1 : 1;
    this.main.scale.x = this.bush.scale.x = flip;
    this.main.x = this.bush.x = this.mirror ? this.srcRect.width : 0;
    n.angle = -this.angle;
    n.alpha = this.opacity / 255;
    n.zIndex = zIndexOf(this.z, this.stamp);
    n.blendMode = BLEND[this.blendType] ?? "normal";
    this.syncPattern(flip);
    effects(n, this.filterHolder, this.tone, this.color, f === "hide" ? null : f);
  }

  /** mkxp-z Sprite#pattern (see the field). */
  private syncPattern(flip: number): void {
    const pat = this.pattern && !this.pattern.isDisposed() ? this.pattern : null;
    if (!pat || this.patternOpacity <= 0) {
      if (this.patternSprite) this.patternSprite.visible = false;
      return;
    }
    if (!this.patternSprite) {
      this.patternMask = new PixiSprite();
      this.patternSprite = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
      this.patternSprite.mask = this.patternMask;
      this.node.addChild(this.patternMask, this.patternSprite);
    }
    const ps = this.patternSprite;
    const mask = this.patternMask!;
    if (pat !== this.lastPattern) {
      ps.texture = pat.texture(pat.rect());
      this.lastPattern = pat;
    } else {
      pat.textureSource();
    }
    ps.visible = true;
    mask.texture = this.main.texture;
    mask.scale.x = ps.scale.x = flip;
    mask.x = ps.x = this.main.x;
    ps.width = this.srcRect.width;
    ps.height = Math.max(0, this.srcRect.height - Math.max(0, Math.min(this.bushDepth, this.srcRect.height)));
    ps.tileScale.set(this.patternZoomX, this.patternZoomY);
    ps.tilePosition.set(this.patternScrollX - this.srcRect.x, this.patternScrollY - this.srcRect.y);
    ps.alpha = this.patternOpacity / 255;
    ps.blendMode = BLEND[this.patternBlendType] ?? "normal";
  }
}

/** RGSS Plane: a bitmap tiled over the whole viewport (panoramas, fogs). */
export class Plane implements Displayable {
  bitmap: Bitmap | null = null;
  ox = 0;
  oy = 0;
  z = 0;
  zoomX = 1;
  zoomY = 1;
  opacity = 255;
  blendType = 0;
  visible = true;
  color = new Color(0, 0, 0, 0);
  tone = new Tone();
  readonly node: TilingSprite;
  private lastBitmap: Bitmap | null = null;
  private filterHolder = { filter: null as ToneFilter | null };
  private disposed = false;

  private stamp = nextStamp++;

  constructor(public viewport: Viewport | null = null) {
    this.node = new TilingSprite({ texture: Texture.EMPTY, width: 512, height: 384 });
    (viewport ? viewport.node : stage!).addChild(this.node);
    live.add(this);
  }

  isDisposed(): boolean { return this.disposed; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    live.delete(this);
    this.node.destroy();
  }

  sync(): void {
    const bmp = this.bitmap && !this.bitmap.isDisposed() ? this.bitmap : null;
    this.node.visible = this.visible && !!bmp;
    if (!bmp) return;
    if (bmp !== this.lastBitmap) {
      this.node.texture = bmp.texture(bmp.rect());
      this.lastBitmap = bmp;
    } else {
      bmp.textureSource();
    }
    const vp = this.viewport;
    this.node.width = vp ? vp.rect.width : 512;
    this.node.height = vp ? vp.rect.height : 384;
    this.node.tileScale.set(this.zoomX, this.zoomY);
    this.node.tilePosition.set(-this.ox, -this.oy);
    this.node.alpha = this.opacity / 255;
    this.node.zIndex = zIndexOf(this.z, this.stamp);
    this.node.blendMode = BLEND[this.blendType] ?? "normal";
    effects(this.node, this.filterHolder, this.tone, this.color, null);
  }
}
