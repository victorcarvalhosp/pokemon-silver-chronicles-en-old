// Port of 007_Objects and windows/004_SpriteWindow.rb (SpriteWindow,
// SpriteWindow_Base) and WindowCursorRect from 003_Window.rb.
//
// Ruby instance variables are the underscore fields (_x is @x) and are public
// so plugin ports can poke them the way Ruby plugins do. Ruby setters (x=,
// width=, ...) are accessors that call privRefresh like the original.
//
// Frame-counted animation (cursor blink, pause frame) is converted from the
// original 40 fps to game time.

import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color, Rect, Tone } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { FrameCounter, originalFrameCount } from "../frameTime";
import { MessageConfig, pbSetSystemFont } from "../messageConfig";
import { pbResolveBitmap } from "../rpgCache";

export class WindowCursorRect {
  private _x = 0;
  private _y = 0;
  private _width = 0;
  private _height = 0;

  constructor(private window: SpriteWindow) {}

  get x(): number { return this._x; }
  set x(v: number) { this._x = v; this.window.width = this.window.width; }
  get y(): number { return this._y; }
  set y(v: number) { this._y = v; this.window.width = this.window.width; }
  get width(): number { return this._width; }
  set width(v: number) { this._width = v; this.window.width = this.window.width; }
  get height(): number { return this._height; }
  set height(v: number) { this._height = v; this.window.width = this.window.width; }

  empty(): void {
    if (!this.needsUpdate(0, 0, 0, 0)) return;
    this.set(0, 0, 0, 0);
  }

  isEmpty(): boolean {
    return this._x === 0 && this._y === 0 && this._width === 0 && this._height === 0;
  }

  set(x: number, y: number, width: number, height: number): void {
    if (!this.needsUpdate(x, y, width, height)) return;
    this._x = x;
    this._y = y;
    this._width = width;
    this._height = height;
    this.window.width = this.window.width;
  }

  private needsUpdate(x: number, y: number, width: number, height: number): boolean {
    return this._x !== x || this._y !== y || this._width !== width || this._height !== height;
  }
}

/** Flags used to preserve compatibility with RGSS/RGSS2's version of Window. */
export const CompatBits = {
  CorrectZ: 1,
  ExpandBack: 2,
  ShowScrollArrows: 4,
  StretchSides: 8,
  ShowPause: 16,
  ShowCursor: 32,
} as const;

const SPRITE_KEYS = [
  "back",
  "corner0", "side0", "scroll0",
  "corner1", "side1", "scroll1",
  "corner2", "side2", "scroll2",
  "corner3", "side3", "scroll3",
  "cursor", "contents", "pause",
] as const;
type SpriteKey = (typeof SPRITE_KEYS)[number];

/** Sprite#bitmap= in mkxp: assigning the same bitmap is a no-op (keeps src_rect). */
function setSpriteBitmap(sprite: Sprite, bitmap: Bitmap | null): void {
  if (sprite.bitmap === bitmap) return;
  sprite.setBitmap(bitmap);
}

/**
 * SpriteWindow is a class based on Window which emulates Window's
 * functionality. This class is necessary in order to change the viewport of
 * windows (with viewport=) and to make windows fade in and out (with tone=).
 */
export class SpriteWindow {
  _sprites: Record<SpriteKey, Sprite>;
  readonly _spritekeys = SPRITE_KEYS;
  _viewport: Viewport | null;
  _sidebitmaps: (Bitmap | null)[] = [null, null, null, null];
  _cursorbitmap: Bitmap | null = null;
  _backbitmap: Bitmap | null = null;
  _disposed = false;
  _tone = new Tone(0, 0, 0);
  _color = new Color(0, 0, 0, 0);
  _blankcontents = new Bitmap(1, 1); // RGSS2 requires this
  _contents: Bitmap | null = this._blankcontents;
  _windowskin: Bitmap | null = null;
  _rpgvx = false;
  _compat: number = CompatBits.ExpandBack | CompatBits.StretchSides;
  _x = 0;
  _y = 0;
  _width = 0;
  _height = 0;
  _offsetX = 0;
  _offsetY = 0;
  _zoomX = 1.0;
  _zoomY = 1.0;
  _ox = 0;
  _oy = 0;
  _z = 0;
  _stretch = true;
  _visible = true;
  _active = true;
  _openness = 255;
  _opacity = 255;
  _backOpacity = 255;
  _blendType = 0;
  _contentsBlendType = 0;
  _contentsOpacity = 255;
  _cursorRect: WindowCursorRect;
  _cursorblink = 0;
  _cursoropacity = 255;
  _pause = false;
  _pauseframe = 0;
  _flash = 0;
  _pauseopacity = 0;
  _skinformat = 0;
  _skinrect = new Rect(0, 0, 0, 0);
  _trim = [16, 16, 16, 16];
  private _blinkClock = new FrameCounter();

  constructor(viewport: Viewport | null = null) {
    this._viewport = viewport;
    this._sprites = {} as Record<SpriteKey, Sprite>;
    for (const k of SPRITE_KEYS) this._sprites[k] = new Sprite(this._viewport);
    this._cursorRect = new WindowCursorRect(this);
    this.privRefresh(true);
  }

  get windowskin(): Bitmap | null { return this._windowskin; }
  get tone(): Tone { return this._tone; }
  set tone(value: Tone) { this._tone = value; if (this._visible) this.privRefresh(); }
  get color(): Color { return this._color; }
  set color(value: Color) { this._color = value; if (this._visible) this.privRefresh(); }
  get viewport(): Viewport | null { return this._viewport; }
  get contents(): Bitmap | null { return this._contents; }
  get ox(): number { return this._ox; }
  get oy(): number { return this._oy; }
  get x(): number { return this._x; }
  get y(): number { return this._y; }
  get z(): number { return this._z; }
  get zoomX(): number { return this._zoomX; }
  get zoomY(): number { return this._zoomY; }
  get offsetX(): number { return this._offsetX; }
  get offsetY(): number { return this._offsetY; }
  get width(): number { return this._width; }
  get height(): number { return this._height; }
  get active(): boolean { return this._active; }
  get pause(): boolean { return this._pause; }
  get opacity(): number { return this._opacity; }
  get backOpacity(): number { return this._backOpacity; }
  get contentsOpacity(): number { return this._contentsOpacity; }
  get visible(): boolean { return this._visible; }
  get cursorRect(): WindowCursorRect { return this._cursorRect; }
  get contentsBlendType(): number { return this._contentsBlendType; }
  get blendType(): number { return this._blendType; }
  get openness(): number { return this._openness; }
  get stretch(): boolean { return this._stretch; }
  get compat(): number { return this._compat; }

  set compat(value: number) {
    this._compat = value;
    this.privRefresh(true);
  }

  dispose(): void {
    if (this.isDisposed()) return;
    for (const k of SPRITE_KEYS) this._sprites[k]?.dispose();
    this._sidebitmaps.forEach((b, i) => {
      b?.dispose();
      this._sidebitmaps[i] = null;
    });
    this._blankcontents.dispose();
    this._cursorbitmap?.dispose();
    this._backbitmap?.dispose();
    this._windowskin = null;
    this._disposed = true;
  }

  set stretch(value: boolean) {
    this._stretch = value;
    this.privRefresh(true);
  }

  set visible(value: boolean) {
    this._visible = value;
    this.privRefresh();
  }

  set viewport(value: Viewport | null) {
    this._viewport = value;
    for (const k of SPRITE_KEYS) {
      this._sprites[k].dispose();
      this._sprites[k] = new Sprite(this._viewport);
    }
    this.privRefresh(true);
  }

  set z(value: number) {
    this._z = value;
    this.privRefresh();
  }

  isDisposed(): boolean {
    return this._disposed;
  }

  set contents(value: Bitmap | null) {
    if (this._contents !== value) {
      this._contents = value;
      if (this._visible) this.privRefresh();
    }
  }

  set ox(value: number) {
    if (this._ox !== value) {
      this._ox = value;
      if (this._visible) this.privRefresh();
    }
  }

  set oy(value: number) {
    if (this._oy !== value) {
      this._oy = value;
      if (this._visible) this.privRefresh();
    }
  }

  set active(value: boolean) {
    this._active = value;
    this.privRefresh(true);
  }

  set cursorRect(value: Rect | WindowCursorRect | null) {
    if (value) this._cursorRect.set(value.x, value.y, value.width, value.height);
    else this._cursorRect.empty();
  }

  set openness(value: number) {
    this._openness = Math.max(0, Math.min(255, value));
    this.privRefresh();
  }

  set width(value: number) {
    this._width = value;
    this.privRefresh(true);
  }

  set height(value: number) {
    this._height = value;
    this.privRefresh(true);
  }

  set pause(value: boolean) {
    this._pause = value;
    if (!value) this._pauseopacity = 0;
    if (this._visible) this.privRefresh();
  }

  set x(value: number) {
    this._x = value;
    if (this._visible) this.privRefresh();
  }

  set y(value: number) {
    this._y = value;
    if (this._visible) this.privRefresh();
  }

  set zoomX(value: number) {
    this._zoomX = value;
    if (this._visible) this.privRefresh();
  }

  set zoomY(value: number) {
    this._zoomY = value;
    if (this._visible) this.privRefresh();
  }

  // (Essentials' offset_x= / offset_y= really do set @x / @y.)
  set offsetX(value: number) {
    this._x = value;
    if (this._visible) this.privRefresh();
  }

  set offsetY(value: number) {
    this._y = value;
    if (this._visible) this.privRefresh();
  }

  set opacity(value: number) {
    this._opacity = Math.max(0, Math.min(255, value));
    if (this._visible) this.privRefresh();
  }

  set backOpacity(value: number) {
    this._backOpacity = Math.max(0, Math.min(255, value));
    if (this._visible) this.privRefresh();
  }

  set contentsOpacity(value: number) {
    this._contentsOpacity = Math.max(0, Math.min(255, value));
    if (this._visible) this.privRefresh();
  }

  set blendType(value: number) {
    this._blendType = value;
    if (this._visible) this.privRefresh();
  }

  /** duration in seconds (frames / 40 in Essentials terms). */
  flash(color: Color | null, duration: number): void {
    if (this.isDisposed()) return;
    this._flash = duration;
    for (const k of SPRITE_KEYS) this._sprites[k].flash(color, duration);
  }

  update(): void {
    if (this.isDisposed()) return;
    let mustchange = false;
    const oldpauseopacity = this._pauseopacity;
    for (let n = this._blinkClock.tick(); n > 0; n--) {
      if (this._active) {
        if (this._cursorblink === 0) {
          this._cursoropacity -= 8;
          if (this._cursoropacity <= 128) this._cursorblink = 1;
        } else {
          this._cursoropacity += 8;
          if (this._cursoropacity >= 255) this._cursorblink = 0;
        }
      } else {
        this._cursoropacity = 128;
      }
      if (this._pause) this._pauseopacity = Math.min(this._pauseopacity + 64, 255);
    }
    this.privRefreshCursor();
    if (this._pause) {
      const oldpauseframe = this._pauseframe;
      this._pauseframe = Math.floor(originalFrameCount() / 8) % 4;
      mustchange = this._pauseframe !== oldpauseframe || this._pauseopacity !== oldpauseopacity;
    }
    if (mustchange) this.privRefresh();
    if (this._flash > 0) {
      for (const k of SPRITE_KEYS) this._sprites[k].update(Graphics.deltaS);
      this._flash -= Graphics.deltaS;
    }
  }

  //############
  get skinformat(): number { return this._skinformat; }
  get skinrect(): Rect { return this._skinrect; }

  loadSkinFile(_file: string): void {
    const skin = this.windowskin!;
    if ((skin.width === 80 || skin.width === 96) && skin.height === 48) {
      // Body = X, Y, width, height of body rectangle within windowskin
      this._skinrect.set(32, 16, 16, 16);
      // Trim = X, Y, width, height of trim rectangle within windowskin
      this._trim = [32, 16, 16, 16];
    } else if (skin.width === 80 && skin.height === 80) {
      this._skinrect.set(32, 32, 16, 16);
      this._trim = [32, 16, 16, 48];
    }
  }

  set windowskin(value: Bitmap | null) {
    const old = this._windowskin && !this._windowskin.isDisposed() ? this._windowskin : null;
    const oldSkinWidth = old ? old.width : -1;
    const oldSkinHeight = old ? old.height : -1;
    this._windowskin = value;
    if (this._skinformat === 1) {
      this._rpgvx = false;
      if (this._windowskin && !this._windowskin.isDisposed()) {
        if (this._windowskin.width !== oldSkinWidth || this._windowskin.height !== oldSkinHeight) {
          // Update skinrect and trim if windowskin's dimensions have changed
          this._skinrect.set(
            Math.floor((this._windowskin.width - 16) / 2),
            Math.floor((this._windowskin.height - 16) / 2),
            16,
            16,
          );
          this._trim = [this._skinrect.x, this._skinrect.y, this._skinrect.x, this._skinrect.y];
        }
      } else {
        this._skinrect.set(16, 16, 16, 16);
        this._trim = [16, 16, 16, 16];
      }
    } else {
      this._rpgvx = !!value && !value.isDisposed() && value.width === 128;
      this._trim = [16, 16, 16, 16];
    }
    this.privRefresh(true);
  }

  set skinrect(value: Rect) {
    this._skinrect = value;
    this.privRefresh();
  }

  set skinformat(value: number) {
    if (this._skinformat !== value) {
      this._skinformat = value;
      this.privRefresh(true);
    }
  }

  get borderX(): number {
    if (!this._trim || this.skinformat === 0) return 32;
    if (this._windowskin && !this._windowskin.isDisposed()) {
      return this._trim[0]! + (this._windowskin.width - this._trim[2]! - this._trim[0]!);
    }
    return 32;
  }

  get borderY(): number {
    if (!this._trim || this.skinformat === 0) return 32;
    if (this._windowskin && !this._windowskin.isDisposed()) {
      return this._trim[1]! + (this._windowskin.height - this._trim[3]! - this._trim[1]!);
    }
    return 32;
  }

  get leftEdge(): number { return this.startX; }
  get topEdge(): number { return this.startY; }
  get rightEdge(): number { return this.borderX - this.leftEdge; }
  get bottomEdge(): number { return this.borderY - this.topEdge; }

  get startX(): number { return !this._trim || this.skinformat === 0 ? 16 : this._trim[0]!; }
  get startY(): number { return !this._trim || this.skinformat === 0 ? 16 : this._trim[1]!; }
  get endX(): number { return !this._trim || this.skinformat === 0 ? 16 : this._trim[2]!; }
  get endY(): number { return !this._trim || this.skinformat === 0 ? 16 : this._trim[3]!; }

  set startX(value: number) { this._trim[0] = value; this.privRefresh(); }
  set startY(value: number) { this._trim[1] = value; this.privRefresh(); }
  set endX(value: number) { this._trim[2] = value; this.privRefresh(); }
  set endY(value: number) { this._trim[3] = value; this.privRefresh(); }

  //############
  // private

  protected ensureBitmap(bitmap: Bitmap | null, dwidth: number, dheight: number): Bitmap {
    if (!bitmap || bitmap.isDisposed() || bitmap.width < dwidth || bitmap.height < dheight) {
      bitmap?.dispose();
      bitmap = new Bitmap(Math.max(1, dwidth), Math.max(1, dheight));
    }
    return bitmap;
  }

  protected tileBitmap(dstbitmap: Bitmap, dstrect: Rect, srcbitmap: Bitmap | null, srcrect: Rect): void {
    if (!srcbitmap || srcbitmap.isDisposed()) return;
    const left = dstrect.x;
    const top = dstrect.y;
    for (let y = 0; y < dstrect.height; y += srcrect.height) {
      for (let x = 0; x < dstrect.width; x += srcrect.width) {
        dstbitmap.blt(x + left, y + top, srcbitmap, srcrect);
      }
    }
  }

  protected privRefreshCursor(): void {
    const contopac = this.contentsOpacity;
    const cursoropac = Math.floor((this._cursoropacity * contopac) / 255);
    this._sprites.cursor.opacity = cursoropac;
  }

  protected privRefresh(changeBitmap = false): void {
    if (this.isDisposed()) return;
    const s = this._sprites;
    const backopac = Math.floor((this.backOpacity * this.opacity) / 255);
    const contopac = this.contentsOpacity;
    const cursoropac = Math.floor((this._cursoropacity * contopac) / 255);
    const haveskin = !!this._windowskin && !this._windowskin.isDisposed();
    const corner = (i: number) => s[`corner${i}` as SpriteKey];
    const side = (i: number) => s[`side${i}` as SpriteKey];
    const scroll = (i: number) => s[`scroll${i}` as SpriteKey];
    for (let i = 0; i < 4; i++) {
      setSpriteBitmap(corner(i), this._windowskin);
      setSpriteBitmap(scroll(i), this._windowskin);
    }
    setSpriteBitmap(s.pause, this._windowskin);
    setSpriteBitmap(s.contents, this._contents);
    let hascontents = false;
    if (haveskin) {
      for (let i = 0; i < 4; i++) {
        for (const spr of [corner(i), side(i)]) {
          spr.opacity = backopac;
          spr.tone = this._tone;
          spr.color = this._color;
          spr.visible = this._visible;
          spr.blendType = this._blendType;
        }
        scroll(i).opacity = this._opacity;
        scroll(i).tone = this._tone;
        scroll(i).color = this._color;
        scroll(i).visible = this._visible;
        scroll(i).blendType = this._blendType;
      }
      for (const k of ["back", "cursor", "pause", "contents"] as const) {
        s[k].color = this._color;
        s[k].tone = this._tone;
        s[k].blendType = this._blendType;
      }
      s.contents.blendType = this._contentsBlendType;
      s.back.opacity = backopac;
      s.contents.opacity = contopac;
      s.cursor.opacity = cursoropac;
      s.pause.opacity = this._pauseopacity;
      const supported = this._skinformat === 0;
      hascontents = !!this._contents && !this._contents.isDisposed();
      s.back.visible = this._visible;
      s.contents.visible = this._visible && this._openness === 255;
      // Essentials tests "@combat & CompatBits::ShowPause" (a typo for
      // @compat): @combat is nil, so the pause and cursor sprites never show.
      // Windows draw their own cursor and pause arrow instead.
      const combat = 0;
      s.pause.visible = supported && this._visible && this._pause && (combat & CompatBits.ShowPause) !== 0;
      s.cursor.visible = supported && this._visible && this._openness === 255 && (combat & CompatBits.ShowCursor) !== 0;
      for (let i = 0; i < 4; i++) scroll(i).visible = false;
    } else {
      for (let i = 0; i < 4; i++) {
        corner(i).visible = false;
        side(i).visible = false;
        scroll(i).visible = false;
      }
      s.contents.visible = this._visible && this._openness === 255;
      s.contents.color = this._color;
      s.contents.tone = this._tone;
      s.contents.blendType = this._contentsBlendType;
      s.contents.opacity = contopac;
      s.back.visible = false;
      s.pause.visible = false;
      s.cursor.visible = false;
    }
    for (const k of SPRITE_KEYS) s[k].z = this._z;
    if ((this._compat & CompatBits.CorrectZ) > 0 && this._skinformat === 0 && !this._rpgvx) {
      // Compatibility Mode: Cursor, pause, and contents have higher Z
      s.cursor.z = this._z + 1;
      s.contents.z = this._z + 2;
      s.pause.z = this._z + 2;
    }
    let startX = 16, startY = 16, endX = 16, endY = 16;
    let trimStartX: number, trimStartY: number, trimWidth: number, trimHeight: number;
    let backRect: Rect | null = null;
    let blindsRect: Rect | null = null;
    let sideRects: Rect[] = [];
    let cursorX = 0, cursorY = 0;
    if (this._skinformat === 0) {
      trimStartX = 16;
      trimStartY = 16;
      trimWidth = 32;
      trimHeight = 32;
      let trimX: number;
      const trimY = 0;
      if (this._rpgvx) {
        trimX = 64;
        backRect = new Rect(0, 0, 64, 64);
        blindsRect = new Rect(0, 64, 64, 64);
      } else {
        trimX = 128;
        backRect = new Rect(0, 0, 128, 128);
        blindsRect = null;
      }
      if (haveskin) {
        corner(0).srcRect.set(trimX, trimY + 0, 16, 16);
        corner(1).srcRect.set(trimX + 48, trimY + 0, 16, 16);
        corner(2).srcRect.set(trimX, trimY + 48, 16, 16);
        corner(3).srcRect.set(trimX + 48, trimY + 48, 16, 16);
        scroll(0).srcRect.set(trimX + 24, trimY + 16, 16, 8); // up
        scroll(3).srcRect.set(trimX + 24, trimY + 40, 16, 8); // down
        scroll(1).srcRect.set(trimX + 16, trimY + 24, 8, 16); // left
        scroll(2).srcRect.set(trimX + 40, trimY + 24, 8, 16); // right
        cursorX = trimX;
        cursorY = trimY + 64;
        sideRects = [
          new Rect(trimX + 16, trimY + 0, 32, 16),
          new Rect(trimX, trimY + 16, 16, 32),
          new Rect(trimX + 48, trimY + 16, 16, 32),
          new Rect(trimX + 16, trimY + 48, 32, 16),
        ];
        const pauseRects = [
          trimX + 32, trimY + 64,
          trimX + 48, trimY + 64,
          trimX + 32, trimY + 80,
          trimX + 48, trimY + 80,
        ];
        const pauseWidth = 16;
        const pauseHeight = 16;
        s.pause.srcRect.set(pauseRects[this._pauseframe * 2]!, pauseRects[this._pauseframe * 2 + 1]!, pauseWidth, pauseHeight);
      }
    } else {
      const trim = this._trim as [number, number, number, number];
      trimStartX = trim[0];
      trimStartY = trim[1];
      trimWidth = trim[0] + (this._skinrect.width - trim[2] + trim[0]);
      trimHeight = trim[1] + (this._skinrect.height - trim[3] + trim[1]);
      if (haveskin) {
        const skin = this._windowskin!;
        // width of left end of window
        startX = this._skinrect.x;
        // width of top end of window
        startY = this._skinrect.y;
        const cx = this._skinrect.x + this._skinrect.width; // right side of BODY rect
        const cy = this._skinrect.y + this._skinrect.height; // bottom side of BODY rect
        // width of right end of window
        endX = skin.width - cx;
        // height of bottom end of window
        endY = skin.height - cy;
        corner(0).srcRect.set(0, 0, startX, startY);
        corner(1).srcRect.set(cx, 0, endX, startY);
        corner(2).srcRect.set(0, cy, startX, endY);
        corner(3).srcRect.set(cx, cy, endX, endY);
        backRect = new Rect(this._skinrect.x, this._skinrect.y, this._skinrect.width, this._skinrect.height);
        blindsRect = null;
        sideRects = [
          new Rect(startX, 0, this._skinrect.width, startY), // side0 (top)
          new Rect(0, startY, startX, this._skinrect.height), // side1 (left)
          new Rect(cx, startY, endX, this._skinrect.height), // side2 (right)
          new Rect(startX, cy, this._skinrect.width, endY), // side3 (bottom)
        ];
      }
    }
    if (this._width > trimWidth && this._height > trimHeight) {
      s.contents.srcRect.set(this._ox, this._oy, this._width - trimWidth, this._height - trimHeight);
    } else {
      s.contents.srcRect.set(0, 0, 0, 0);
    }
    s.contents.x = this._x + trimStartX;
    s.contents.y = this._y + trimStartY;
    if (
      (this._compat & CompatBits.ShowScrollArrows) > 0 && this._skinformat === 0 &&
      haveskin && this._contents && !this._contents.isDisposed()
    ) {
      scroll(0).visible = this._visible && hascontents && this._oy > 0;
      scroll(1).visible = this._visible && hascontents && this._ox > 0;
      scroll(2).visible = this._visible && this._contents.width - this._ox > this._width - trimWidth;
      scroll(3).visible = this._visible && this._contents.height - this._oy > this._height - trimHeight;
    }
    if (haveskin) {
      const borderX = startX + endX;
      const borderY = startY + endY;
      corner(0).x = this._x;
      corner(0).y = this._y;
      corner(1).x = this._x + this._width - endX;
      corner(1).y = this._y;
      corner(2).x = this._x;
      corner(2).y = this._y + this._height - endY;
      corner(3).x = this._x + this._width - endX;
      corner(3).y = this._y + this._height - endY;
      side(0).x = this._x + startX;
      side(0).y = this._y;
      side(1).x = this._x;
      side(1).y = this._y + startY;
      side(2).x = this._x + this._width - endX;
      side(2).y = this._y + startY;
      side(3).x = this._x + startX;
      side(3).y = this._y + this._height - endY;
      scroll(0).x = this._x + Math.floor(this._width / 2) - 8;
      scroll(0).y = this._y + 8;
      scroll(1).x = this._x + 8;
      scroll(1).y = this._y + Math.floor(this._height / 2) - 8;
      scroll(2).x = this._x + this._width - 16;
      scroll(2).y = this._y + Math.floor(this._height / 2) - 8;
      scroll(3).x = this._x + Math.floor(this._width / 2) - 8;
      scroll(3).y = this._y + this._height - 16;
      s.cursor.x = this._x + startX + this._cursorRect.x;
      s.cursor.y = this._y + startY + this._cursorRect.y;
      if ((this._compat & CompatBits.ExpandBack) > 0 && this._skinformat === 0) {
        // Compatibility mode: Expand background
        s.back.x = this._x + 2;
        s.back.y = this._y + 2;
      } else {
        s.back.x = this._x + startX;
        s.back.y = this._y + startY;
      }
      if (changeBitmap) this.privRefreshBitmaps(startX, startY, endX, endY, borderX, borderY, cursorX, cursorY, sideRects, backRect, blindsRect);
    }
    if (this._openness === 255) {
      for (const k of SPRITE_KEYS) {
        s[k].zoomX = 1.0;
        s[k].zoomY = 1.0;
      }
    } else {
      const opn = this._openness / 255.0;
      for (const k of SPRITE_KEYS) {
        const sprite = s[k];
        const ratio = this._height <= 0 ? 0 : (sprite.y - this._y) / this._height;
        sprite.zoomY = opn;
        sprite.zoomX = 1.0;
        sprite.oy = 0;
        sprite.y = Math.floor(this._y + this._height / 2.0 + this._height * ratio * opn - Math.floor(this._height / 2) * opn);
      }
    }
    const i = 0;
    // Ensure Z order
    for (const k of SPRITE_KEYS) {
      const sprite = s[k];
      const y = sprite.y;
      sprite.y = i;
      sprite.oy = sprite.zoomY <= 0 ? 0 : (i - y) / sprite.zoomY;
      sprite.zoomX *= this._zoomX;
      sprite.zoomY *= this._zoomY;
      sprite.x *= this._zoomX;
      sprite.y *= this._zoomY;
      sprite.x += this._offsetX / sprite.zoomX;
      sprite.y += this._offsetY / sprite.zoomY;
    }
  }

  /** The "if changeBitmap && @_windowskin" part of privRefresh. */
  private privRefreshBitmaps(
    startX: number, startY: number, endX: number, endY: number, borderX: number, borderY: number,
    cursorX: number, cursorY: number, sideRects: Rect[], backRect: Rect | null, blindsRect: Rect | null,
  ): void {
    const s = this._sprites;
    const skin = this._windowskin!;
    if (this._skinformat === 0) {
      s.cursor.x = this._x + startX + this._cursorRect.x;
      s.cursor.y = this._y + startY + this._cursorRect.y;
      const width = this._cursorRect.width;
      const height = this._cursorRect.height;
      if (width > 0 && height > 0) {
        const cursorrects = [
          // sides
          new Rect(cursorX + 2, cursorY + 0, 28, 2),
          new Rect(cursorX + 0, cursorY + 2, 2, 28),
          new Rect(cursorX + 30, cursorY + 2, 2, 28),
          new Rect(cursorX + 2, cursorY + 30, 28, 2),
          // corners
          new Rect(cursorX + 0, cursorY + 0, 2, 2),
          new Rect(cursorX + 30, cursorY + 0, 2, 2),
          new Rect(cursorX + 0, cursorY + 30, 2, 2),
          new Rect(cursorX + 30, cursorY + 30, 2, 2),
          // back
          new Rect(cursorX + 2, cursorY + 2, 28, 28),
        ];
        const margin = 2;
        const fullmargin = 4;
        this._cursorbitmap = this.ensureBitmap(this._cursorbitmap, width, height);
        const cb = this._cursorbitmap;
        cb.clear();
        setSpriteBitmap(s.cursor, cb);
        s.cursor.srcRect.set(0, 0, width, height);
        cb.stretchBlt(new Rect(margin, margin, width - fullmargin, height - fullmargin), skin, cursorrects[8]!);
        cb.blt(0, 0, skin, cursorrects[4]!); // top left
        cb.blt(width - margin, 0, skin, cursorrects[5]!); // top right
        cb.blt(0, height - margin, skin, cursorrects[6]!); // bottom right
        cb.blt(width - margin, height - margin, skin, cursorrects[7]!); // bottom left
        cb.stretchBlt(new Rect(margin, 0, width - fullmargin, margin), skin, cursorrects[0]!);
        cb.stretchBlt(new Rect(0, margin, margin, height - fullmargin), skin, cursorrects[1]!);
        cb.stretchBlt(new Rect(width - margin, margin, margin, height - fullmargin), skin, cursorrects[2]!);
        cb.stretchBlt(new Rect(margin, height - margin, width - fullmargin, margin), skin, cursorrects[3]!);
      } else {
        s.cursor.visible = false;
        s.cursor.srcRect.set(0, 0, 0, 0);
      }
    }
    for (let i = 0; i < 4; i++) {
      let dwidth: number;
      let dheight: number;
      switch (i) {
        case 0: dwidth = this._width - startX - endX; dheight = startY; break;
        case 1: dwidth = startX; dheight = this._height - startY - endY; break;
        case 2: dwidth = endX; dheight = this._height - startY - endY; break;
        default: dwidth = this._width - startX - endX; dheight = endY;
      }
      const bmp = this.ensureBitmap(this._sidebitmaps[i] ?? null, dwidth, dheight);
      this._sidebitmaps[i] = bmp;
      const spr = s[`side${i}` as SpriteKey];
      setSpriteBitmap(spr, bmp);
      spr.srcRect.set(0, 0, dwidth, dheight);
      bmp.clear();
      const sr = sideRects[i];
      if (sr && sr.width > 0 && sr.height > 0) {
        if ((this._compat & CompatBits.StretchSides) > 0 && this._skinformat === 0) {
          // Compatibility mode: Stretch sides
          bmp.stretchBlt(spr.srcRect, skin, sr);
        } else {
          this.tileBitmap(bmp, spr.srcRect, skin, sr);
        }
      }
    }
    let backwidth: number;
    let backheight: number;
    if ((this._compat & CompatBits.ExpandBack) > 0 && this._skinformat === 0) {
      // Compatibility mode: Expand background
      backwidth = this._width - 4;
      backheight = this._height - 4;
    } else {
      backwidth = this._width - borderX;
      backheight = this._height - borderY;
    }
    if (backwidth > 0 && backheight > 0 && backRect) {
      this._backbitmap = this.ensureBitmap(this._backbitmap, backwidth, backheight);
      const bb = this._backbitmap;
      setSpriteBitmap(s.back, bb);
      s.back.srcRect.set(0, 0, backwidth, backheight);
      bb.clear();
      if (this._stretch) bb.stretchBlt(s.back.srcRect, skin, backRect);
      else this.tileBitmap(bb, s.back.srcRect, skin, backRect);
      if (blindsRect) this.tileBitmap(bb, s.back.srcRect, skin, blindsRect);
    } else {
      s.back.visible = false;
      s.back.srcRect.set(0, 0, 0, 0);
    }
  }
}

//===============================================================================
//
//===============================================================================
export class SpriteWindow_Base extends SpriteWindow {
  static readonly TEXTPADDING = 4; // In pixels

  declare _curframe: string;
  declare _curfont: string;
  declare _sysframe: AnimatedBitmap;
  declare _customskin: AnimatedBitmap | null;
  declare _resolvedFrame: string | null;

  constructor(x: number, y: number, width: number, height: number) {
    super();
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.z = 100;
    this._curframe = MessageConfig.pbGetSystemFrame();
    this._curfont = MessageConfig.pbGetSystemFontName();
    this._sysframe = new AnimatedBitmap(this._curframe);
    this._customskin = null;
    this._resolvedFrame = null;
    this.__setWindowskin(this._sysframe.bitmap);
    this.__resolveSystemFrame();
    if (this.contents) pbSetSystemFont(this.contents);
  }

  __setWindowskin(skin: Bitmap | null): void {
    if (skin && ((skin.width === 192 && skin.height === 128) || // RPGXP Windowskin
      (skin.width === 128 && skin.height === 128))) { // RPGVX Windowskin
      this.skinformat = 0;
    } else {
      this.skinformat = 1;
    }
    this.windowskin = skin;
  }

  __resolveSystemFrame(): void {
    if (this.skinformat === 1) {
      if (!this._resolvedFrame) {
        this._resolvedFrame = MessageConfig.pbGetSystemFrame().replace(/\.[^./\\]+$/, "");
      }
      if (this._resolvedFrame !== "") this.loadSkinFile(`${this._resolvedFrame}.txt`);
    }
  }

  /** Filename of windowskin to apply. Supports XP, VX, and animated skins. */
  setSkin(skin: string): void {
    this._customskin?.dispose();
    this._customskin = null;
    const resolvedName = pbResolveBitmap(skin);
    if (!resolvedName) return;
    this._customskin = new AnimatedBitmap(resolvedName);
    this.__setWindowskin(this._customskin.bitmap);
    if (this.skinformat === 1) {
      const skinbase = resolvedName.replace(/\.[^./\\]+$/, "");
      this.loadSkinFile(`${skinbase}.txt`);
    }
  }

  setSystemFrame(): void {
    this._customskin?.dispose();
    this._customskin = null;
    this.__setWindowskin(this._sysframe.bitmap);
    this.__resolveSystemFrame();
  }

  /** Implemented by subclasses (Ruby calls it with rescue NoMethodError). */
  refresh(): void {}

  override update(): void {
    super.update();
    if (this.windowskin) {
      if (this._customskin) {
        if (this._customskin.totalFrames > 1) {
          this._customskin.update();
          this.__setWindowskin(this._customskin.bitmap);
        }
      } else if (this._sysframe) {
        if (this._sysframe.totalFrames > 1) {
          this._sysframe.update();
          this.__setWindowskin(this._sysframe.bitmap);
        }
      }
    }
    if (this._curframe !== MessageConfig.pbGetSystemFrame()) {
      this._curframe = MessageConfig.pbGetSystemFrame();
      if (this._sysframe && !this._customskin) {
        this._sysframe?.dispose();
        this._sysframe = new AnimatedBitmap(this._curframe);
        this._resolvedFrame = null;
        this.__setWindowskin(this._sysframe.bitmap);
        this.__resolveSystemFrame();
      }
      this.refresh();
    }
    if (this._curfont !== MessageConfig.pbGetSystemFontName()) {
      this._curfont = MessageConfig.pbGetSystemFontName();
      if (this.contents && !this.contents.isDisposed()) pbSetSystemFont(this.contents);
      this.refresh();
    }
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    if (this.contents !== this._blankcontents) this.contents?.dispose();
    this._sysframe.dispose();
    this._customskin?.dispose();
    super.dispose();
  }
}
