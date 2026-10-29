// Port of 007_Objects and windows/005_SpriteWindow_text.rb.
//
// Ruby sets some instance variables *before* calling super (e.g. @starting)
// and the superclass constructor then calls overridden setters. JS can't run
// code before super(), so such fields are `declare`d (not initialised by the
// class) and code that can run during super() treats `undefined` like the
// value Ruby would have set first.
//
// Letter-by-letter text, waits, scrolling and the input cursor blink count
// original 40 fps frames (see frameTime.ts).

import { pbPlayCursorSE } from "../../game/GameSystem";
import { Bitmap, type Font } from "../../rgss/Bitmap";
import type { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import {
  type FormattedChar, drawFormattedChars, drawSingleFormattedChar, drawTextEx, getFormattedText,
  getFormattedTextForDims, getLineBrokenChunks, pbCopyBitmap, pbDrawShadowText, shadowctag, toUnformattedText,
  unformattedTextLength,
} from "../drawText";
import { FrameCounter } from "../frameTime";
import { MessageConfig, getDefaultTextColors, isDarkWindowskin, pbDoEnsureBitmap, pbSetSystemFont } from "../messageConfig";
import { AnimatedSprite } from "../SpriteWrapper";
import { SpriteWindow_Base } from "./SpriteWindow";

const TEXTPADDING = SpriteWindow_Base.TEXTPADDING;

//===============================================================================
//
//===============================================================================
/**
 * Represents a window with no formatting capabilities. Its text color can be
 * set, though, and line breaks are supported, but the text is generally
 * unformatted.
 */
export class Window_UnformattedTextPokemon extends SpriteWindow_Base {
  declare _text: string;
  declare _baseColor: Color;
  declare _shadowColor: Color;
  /** Letter-by-letter mode. This mode is not supported in this class. */
  declare letterbyletter: boolean;

  get text(): string { return this._text; }
  set text(value: string) {
    this._text = value;
    this.refresh();
  }

  get baseColor(): Color { return this._baseColor; }
  set baseColor(value: Color) {
    this._baseColor = value;
    this.refresh();
  }

  get shadowColor(): Color { return this._shadowColor; }
  set shadowColor(value: Color) {
    this._shadowColor = value;
    this.refresh();
  }

  constructor(text = "") {
    super(0, 0, 33, 33);
    this.contents = new Bitmap(1, 1);
    pbSetSystemFont(this.contents);
    this._text = text;
    this.letterbyletter = false; // Not supported in this class
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    this.resizeToFit(text);
  }

  static newWithSize(text: string, x: number, y: number, width: number, height: number, viewport: Viewport | null = null): Window_UnformattedTextPokemon {
    const ret = new this(text);
    ret.x = x;
    ret.y = y;
    ret.width = width;
    ret.height = height;
    ret.viewport = viewport;
    ret.refresh();
    return ret;
  }

  /** maxwidth is maximum acceptable window width */
  resizeToFitInternal(text: string, maxwidth: number): [number, number] {
    const dims = [0, 0];
    const cwidth = maxwidth < 0 ? Graphics.width : maxwidth;
    getLineBrokenChunks(this.contents!, text, cwidth - this.borderX - TEXTPADDING, dims, true);
    return dims as [number, number];
  }

  setTextToFit(text: string, maxwidth = -1): void {
    this.resizeToFit(text, maxwidth);
    this.text = text;
  }

  /** maxwidth is maximum acceptable window width */
  resizeToFit(text: string, maxwidth = -1): void {
    const dims = this.resizeToFitInternal(text, maxwidth);
    this.width = dims[0] + this.borderX + TEXTPADDING;
    this.height = dims[1] + this.borderY;
    this.refresh();
  }

  /** width is current window width */
  resizeHeightToFit(text: string, width = -1): void {
    const dims = this.resizeToFitInternal(text, width);
    this.width = width < 0 ? Graphics.width : width;
    this.height = dims[1] + this.borderY;
    this.refresh();
  }

  override setSkin(skin: string): void {
    super.setSkin(skin);
    this.privRefresh(true);
    const oldbase = this._baseColor.clone();
    const oldshadow = this._shadowColor.clone();
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    if (!oldbase.equals(this._baseColor) || !oldshadow.equals(this._shadowColor)) this.text = this.text;
  }

  override refresh(): void {
    if (this._text === undefined) return; // (called from the superclass before Ruby's ivars exist)
    this.contents = pbDoEnsureBitmap(this.contents, this.width - this.borderX, this.height - this.borderY);
    this.contents.clear();
    drawTextEx(this.contents, 0, -2, this.contents.width, 0, // TEXT OFFSET
      this._text.replace(/\r/g, ""), this._baseColor, this._shadowColor);
  }
}

//===============================================================================
//
//===============================================================================
export class Window_AdvancedTextPokemon extends SpriteWindow_Base {
  declare _text: string;
  declare _baseColor: Color;
  declare _shadowColor: Color;
  declare letterbyletter: boolean;
  declare _waitcount: number;
  declare _cursorMode: number;
  declare _endOfText: Rect | null;
  declare _scrollstate: number;
  declare _realframes: number;
  declare _scrollY: number;
  declare _nodraw: boolean;
  declare _lineHeight: number;
  declare _linesdrawn: number;
  declare _starting: boolean;
  declare _displaying: boolean;
  declare _lastDrawnChar: number;
  declare _fmtchars: FormattedChar[];
  declare _frameskipChanged: boolean;
  declare _frameskip: number;
  declare _pausesprite: AnimatedSprite | null;
  declare _pausing: boolean;
  declare _curchar: number;
  declare _drawncurchar: number;
  declare _textlength: number;
  declare _textchars: string[];
  declare _bitmapwidth: number;
  declare _bitmapheight: number;
  declare _numtextchars: number;
  declare _oldfont: Font | null;
  declare _needclear: boolean;
  declare _frameClock: FrameCounter;

  constructor(text = "") {
    super(0, 0, 33, 33);
    this._cursorMode = MessageConfig.CURSOR_POSITION;
    this._endOfText = null;
    this._scrollstate = 0;
    this._realframes = 0;
    this._scrollY = 0;
    this._nodraw = false;
    this._lineHeight = 32;
    this._linesdrawn = 0;
    this.letterbyletter = false;
    this._starting = true;
    this._displaying = false;
    this._lastDrawnChar = -1;
    this._fmtchars = [];
    this._frameskipChanged = false;
    this._frameskip = MessageConfig.pbGetTextSpeed();
    this._pausing = false;
    this._waitcount = 0;
    this._oldfont = null;
    this._frameClock = new FrameCounter();
    this._pausesprite = null;
    this._text = "";
    this.contents = new Bitmap(1, 1);
    pbSetSystemFont(this.contents);
    this.resizeToFit(text, Graphics.width);
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    this.text = text;
    this._starting = false;
  }

  static newWithSize(text: string, x: number, y: number, width: number, height: number, viewport: Viewport | null = null): Window_AdvancedTextPokemon {
    const ret = new this(text);
    ret.x = x;
    ret.y = y;
    ret.width = width;
    ret.height = height;
    ret.viewport = viewport;
    return ret;
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this._pausesprite?.dispose();
    this._pausesprite = null;
    super.dispose();
  }

  get text(): string { return this._text; }
  /** Carmaniac's Speech Bubble replaces this setter (see speechBubble.ts). */
  set text(value: string) { this.setText(value); }

  get baseColor(): Color { return this._baseColor; }
  set baseColor(value: Color) {
    this._baseColor = value;
    this.refresh();
  }

  get shadowColor(): Color { return this._shadowColor; }
  set shadowColor(value: Color) {
    this._shadowColor = value;
    this.refresh();
  }

  get waitcount(): number { return this._waitcount; }
  /** In original (40 fps) frames. */
  set waitcount(value: number) {
    this._waitcount = value <= 0 ? 0 : value;
  }

  get cursorMode(): number { return this._cursorMode; }
  set cursorMode(value: number) {
    this._cursorMode = value;
    this.moveCursor();
  }

  lineHeight(value: number): void {
    this._lineHeight = value;
    this.text = this.text;
  }

  get textspeed(): number { return this._frameskip; }
  set textspeed(value: number) {
    if (this._frameskip !== value) this._frameskipChanged = true;
    this._frameskip = value;
  }

  override get width(): number { return super.width; }
  override set width(value: number) {
    super.width = value;
    if (this._starting === false) this.text = this.text;
  }

  override get height(): number { return super.height; }
  override set height(value: number) {
    super.height = value;
    if (this._starting === false) this.text = this.text;
  }

  resizeToFit(text: string, maxwidth = -1): void {
    const dims = this.resizeToFitInternal(text, maxwidth);
    const oldstarting = this._starting;
    this._starting = true;
    this.width = dims[0] + this.borderX + TEXTPADDING;
    this.height = dims[1] + this.borderY;
    this._starting = oldstarting;
    this.redrawText();
  }

  resizeToFit2(text: string, maxwidth: number, maxheight: number): void {
    const dims = this.resizeToFitInternal(text, maxwidth);
    const oldstarting = this._starting;
    this._starting = true;
    this.width = Math.min(dims[0] + this.borderX + TEXTPADDING, maxwidth);
    this.height = Math.min(dims[1] + this.borderY, maxheight);
    this._starting = oldstarting;
    this.redrawText();
  }

  resizeToFitInternal(text: string, maxwidth: number): [number, number] {
    const dims: [number, number] = [0, 0];
    const cwidth = maxwidth < 0 ? Graphics.width : maxwidth;
    const chars = getFormattedTextForDims(this.contents!, 0, 0, cwidth - this.borderX - 2 - 6, -1, text, this._lineHeight, true);
    for (const ch of chars) {
      dims[0] = Math.max(dims[0], ch[1] + ch[3]);
      dims[1] = Math.max(dims[1], ch[2] + ch[4]);
    }
    return dims;
  }

  resizeHeightToFit(text: string, width = -1): void {
    const dims = this.resizeToFitInternal(text, width);
    const oldstarting = this._starting;
    this._starting = true;
    this.width = width < 0 ? Graphics.width : width;
    this.height = dims[1] + this.borderY;
    this._starting = oldstarting;
    this.redrawText();
  }

  override setSkin(skin: string, redrawText = true): void {
    super.setSkin(skin);
    this.privRefresh(true);
    const oldbase = this._baseColor.clone();
    const oldshadow = this._shadowColor.clone();
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    if (redrawText && (!oldbase.equals(this._baseColor) || !oldshadow.equals(this._shadowColor))) {
      this.setText(this.text);
    }
  }

  setTextToFit(text: string, maxwidth = -1): void {
    this.resizeToFit(text, maxwidth);
    this.text = text;
  }

  setText(value: string): void {
    this._waitcount = 0;
    this._curchar = 0;
    this._drawncurchar = -1;
    this._lastDrawnChar = -1;
    this._text = value;
    this._textlength = unformattedTextLength(value);
    this._scrollstate = 0;
    this._scrollY = 0;
    this._linesdrawn = 0;
    this._realframes = 0;
    this._textchars = [];
    let width = 1;
    let height = 1;
    let numlines = 0;
    const visiblelines = Math.floor((this.height - this.borderY) / 32);
    if (value.length === 0) {
      this._fmtchars = [];
      this._bitmapwidth = width;
      this._bitmapheight = height;
      this._numtextchars = 0;
    } else {
      if (this.letterbyletter) {
        this._fmtchars = [];
        const fmt = getFormattedText(this.contents, 0, 0, this.width - this.borderX - TEXTPADDING, -1,
          shadowctag(this._baseColor, this._shadowColor) + value, 32, true);
        this._oldfont = this.contents!.font.clone();
        for (const ch of fmt) {
          const chx = ch[1] + ch[3];
          const chy = ch[2] + ch[4];
          if (width < chx) width = chx;
          if (height < chy) height = chy;
          if (!ch[5] && ch[0] === "\n") {
            numlines += 1;
            if (numlines >= visiblelines) {
              const fclone = [...ch] as FormattedChar;
              fclone[0] = "\x01";
              this._fmtchars.push(fclone);
              this._textchars.push("\x01");
            }
          }
          // Don't add newline characters, since they
          // can slow down letter-by-letter display
          if (ch[5] || ch[0] !== "\r") {
            this._fmtchars.push(ch);
            this._textchars.push(ch[5] ? "" : ch[0]);
          }
        }
      } else {
        this._fmtchars = getFormattedText(this.contents, 0, 0, this.width - this.borderX - TEXTPADDING, -1,
          shadowctag(this._baseColor, this._shadowColor) + value, 32, true);
        this._oldfont = this.contents!.font.clone();
        for (const ch of this._fmtchars) {
          const chx = ch[1] + ch[3];
          const chy = ch[2] + ch[4];
          if (width < chx) width = chx;
          if (height < chy) height = chy;
          this._textchars.push(ch[5] ? "" : ch[0]);
        }
      }
      this._bitmapwidth = width;
      this._bitmapheight = height;
      this._numtextchars = this._textchars.length;
    }
    this.stopPause();
    this._displaying = this.letterbyletter;
    this._needclear = true;
    this._nodraw = this.letterbyletter;
    this.refresh();
  }

  busy(): boolean {
    return this._displaying;
  }

  pausing(): boolean {
    return this._pausing && this._displaying;
  }

  resume(): boolean {
    if (!this.busy()) {
      this.stopPause();
      return true;
    }
    if (this._pausing) {
      this._pausing = false;
      this.stopPause();
      return false;
    }
    return true;
  }

  get position(): number {
    if (this._lastDrawnChar < 0) return 0;
    if (this._lastDrawnChar >= this._fmtchars.length) return this._numtextchars;
    // index after the last character's index
    return this._fmtchars[this._lastDrawnChar]![14] + 1;
  }

  maxPosition(): number {
    let pos = 0;
    // index after the last character's index
    for (const ch of this._fmtchars) if (pos < ch[14] + 1) pos = ch[14] + 1;
    return pos;
  }

  skipAhead(): void {
    if (!this.busy()) return;
    if (this._textchars[this._curchar] === "\n") return;
    this.resume();
    const visiblelines = Math.floor((this.height - this.borderY) / this._lineHeight);
    for (;;) {
      this.curcharSkip(999);
      if (this._curchar >= this._fmtchars.length) break; // End of message
      if (this._textchars[this._curchar] === "\x01") { // Pause message
        if (this._curchar < this._numtextchars - 1) this._pausing = true;
        this.startPause();
        this.refresh();
        break;
      }
      if (this._textchars[this._curchar] !== "\n") break; // Skip past newlines only
      if (this._linesdrawn >= visiblelines - 1) break; // No more empty lines to continue to
      this._linesdrawn += 1;
    }
  }

  allocPause(): void {
    if (this._pausesprite) return;
    this._pausesprite = AnimatedSprite.create("Graphics/Pictures/pause", 4, 3);
    this._pausesprite.z = 100000;
    this._pausesprite.visible = false;
  }

  startPause(): void {
    this.allocPause();
    this._pausesprite!.visible = true;
    this._pausesprite!.frame = 0;
    this._pausesprite!.start();
    this.moveCursor();
  }

  stopPause(): void {
    if (!this._pausesprite) return;
    this._pausesprite.stop();
    this._pausesprite.visible = false;
  }

  moveCursor(): void {
    const ps = this._pausesprite;
    if (!ps) return;
    let cursor = this._cursorMode;
    if (cursor === 0 && !this._endOfText) cursor = 2;
    switch (cursor) {
      case 0: // End of text
        ps.x = this.x + this.startX + this._endOfText!.x + this._endOfText!.width - 2;
        ps.y = this.y + this.startY + this._endOfText!.y - this._scrollY;
        break;
      case 1: { // Lower right
        const pauseWidth = ps.bitmap ? ps.framewidth : 16;
        const pauseHeight = ps.bitmap ? ps.frameheight : 16;
        ps.x = this.x + this.width - 20 * 2 + Math.floor(pauseWidth / 2);
        ps.y = this.y + this.height - 30 * 2 + Math.floor(pauseHeight / 2);
        break;
      }
      case 2: { // Lower middle
        const pauseWidth = ps.bitmap ? ps.framewidth : 16;
        const pauseHeight = ps.bitmap ? ps.frameheight : 16;
        ps.x = this.x + Math.floor(this.width / 2) - Math.floor(pauseWidth / 2);
        ps.y = this.y + this.height - 18 * 2 + Math.floor(pauseHeight / 2);
        break;
      }
    }
  }

  override refresh(): void {
    if (this._fmtchars === undefined) return; // (called from the superclass before Ruby's ivars exist)
    const oldcontents = this.contents;
    this.contents = pbDoEnsureBitmap(oldcontents, this._bitmapwidth, this._bitmapheight);
    const contents = this.contents;
    this.oy = this._scrollY;
    let numchars = this._numtextchars;
    if (this.letterbyletter) numchars = Math.min(this._curchar, this._numtextchars);
    if (this.busy() && this._drawncurchar === this._curchar && this._scrollstate === 0) return;
    if (!this.letterbyletter || oldcontents !== contents) {
      this._drawncurchar = -1;
      this._needclear = true;
    }
    if (this._needclear) {
      if (this._oldfont) contents.font = this._oldfont.clone();
      contents.clear();
      this._needclear = false;
    }
    if (this._nodraw) {
      this._nodraw = false;
      return;
    }
    const maxX = this.width - this.borderX;
    const maxY = this.height - this.borderY;
    for (let i = this._drawncurchar + 1; i <= numchars; i++) {
      if (i >= this._fmtchars.length) continue;
      const ch = this._fmtchars[i]!;
      if (!this.letterbyletter) {
        if (ch[1] >= maxX) continue;
        if (ch[2] >= maxY) continue;
      }
      drawSingleFormattedChar(contents, ch);
      this._lastDrawnChar = i;
    }
    // all characters were drawn, reset old font
    if (!this.letterbyletter && this._oldfont) contents.font = this._oldfont.clone();
    if (numchars > 0 && numchars !== this._numtextchars) {
      const fch = this._fmtchars[numchars - 1];
      if (fch) {
        const rcdst = new Rect(fch[1], fch[2], fch[3], fch[4]);
        if (this._textchars[numchars] === "\x01") {
          this._endOfText = rcdst;
          this.allocPause();
          this.moveCursor();
        } else {
          this._endOfText = new Rect(rcdst.x + rcdst.width, rcdst.y, 8, 1);
        }
      }
    }
    this._drawncurchar = this._curchar;
  }

  redrawText(): void {
    if (this.letterbyletter) {
      let oldPosition = this.position;
      this.text = this.text;
      if (oldPosition > this._numtextchars) oldPosition = this._numtextchars;
      let guard = 100000;
      while (this.position !== oldPosition && guard-- > 0) {
        this.refresh();
        this.updateInternal();
      }
    } else {
      this.text = this.text;
    }
  }

  /** One original (40 fps) frame of letter-by-letter display. */
  updateInternal(): void {
    const curcharskip = this._frameskip < 0 ? Math.abs(this._frameskip) : 1;
    const visiblelines = Math.floor((this.height - this.borderY) / this._lineHeight);
    const current = this._textchars[this._curchar];
    if (current === "\x01") {
      if (!this._pausing) {
        this._realframes += 1;
        if (this._realframes >= this._frameskip || this._frameskip < 0) {
          this.curcharSkip(curcharskip);
          this._realframes = 0;
        }
      }
    } else if (current === "\n") {
      if (this._linesdrawn >= visiblelines - 1) {
        if (this._scrollstate < this._lineHeight) {
          this._scrollstate += Math.max(Math.floor(this._lineHeight / 4), 1);
          this._scrollY += Math.max(Math.floor(this._lineHeight / 4), 1);
        }
        if (this._scrollstate >= this._lineHeight) {
          this._realframes += 1;
          if (this._realframes >= this._frameskip || this._frameskip < 0) {
            this.curcharSkip(curcharskip);
            this._linesdrawn += 1;
            this._realframes = 0;
            this._scrollstate = 0;
          }
        }
      } else {
        this._realframes += 1;
        if (this._realframes >= this._frameskip || this._frameskip < 0) {
          this.curcharSkip(curcharskip);
          this._linesdrawn += 1;
          this._realframes = 0;
        }
      }
    } else if (this._curchar <= this._numtextchars) {
      this._realframes += 1;
      if (this._realframes >= this._frameskip || this._frameskip < 0) {
        this.curcharSkip(curcharskip);
        this._realframes = 0;
      }
      if (this._textchars[this._curchar] === "\x01") {
        if (this._curchar < this._numtextchars - 1) this._pausing = true;
        this.startPause();
        this.refresh();
      }
    } else {
      this._displaying = false;
      this._scrollstate = 0;
      this._scrollY = 0;
      this._linesdrawn = 0;
    }
  }

  override update(): void {
    super.update();
    if (this._pausesprite?.visible) this._pausesprite.update();
    // Ruby runs the rest once per 40 fps frame.
    for (let n = this._frameClock.tick(); n > 0; n--) {
      if (this._waitcount > 0) {
        this._waitcount -= 1;
        continue;
      }
      if (this.busy()) {
        if (!this._frameskipChanged) this.refresh();
        this.updateInternal();
        // following line needed to allow "textspeed=-999" to work seamlessly
        if (this._frameskipChanged) this.refresh();
      }
      this._frameskipChanged = false;
    }
  }

  private curcharSkip(skip: number): void {
    for (let i = 0; i < skip; i++) {
      this._curchar += 1;
      const c = this._textchars[this._curchar];
      if (c === "\n" || // newline
        c === "\x01" || // pause
        c === "\x02" || // letter-by-letter break
        c === undefined) break;
    }
  }
}

//===============================================================================
//
//===============================================================================
export class Window_InputNumberPokemon extends SpriteWindow_Base {
  declare _digitsMax: number;
  declare _number: number;
  declare _frame: number;
  declare _sign: boolean;
  declare _negative: boolean;
  declare _baseColor: Color;
  declare _shadowColor: Color;
  declare _index: number;
  declare _frameClock: FrameCounter;

  constructor(digitsMax: number) {
    super(0, 0, 32, 32);
    this._digitsMax = digitsMax;
    this._number = 0;
    this._frame = 0;
    this._sign = false;
    this._negative = false;
    this._frameClock = new FrameCounter();
    this.width = digitsMax * 24 + 8 + this.borderX;
    this.height = 32 + this.borderY;
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    this._index = digitsMax - 1;
    this.active = true;
    this.refresh();
  }

  override get active(): boolean { return super.active; }
  override set active(value: boolean) {
    super.active = value;
    this.refresh();
  }

  get sign(): boolean { return this._sign; }
  set sign(value: boolean) {
    this._sign = value;
    this.width = this._digitsMax * 24 + 8 + this.borderX + (this._sign ? 24 : 0);
    this._index = this._digitsMax - 1 + (this._sign ? 1 : 0);
    this.refresh();
  }

  get number(): number {
    return this._number * (this._sign && this._negative ? -1 : 1);
  }

  set number(value: number) {
    if (typeof value !== "number" || Number.isNaN(value)) value = 0;
    if (this._sign) {
      this._negative = value < 0;
      this._number = Math.min(Math.abs(value), 10 ** this._digitsMax - 1);
    } else {
      this._number = Math.min(Math.max(value, 0), 10 ** this._digitsMax - 1);
    }
    this.refresh();
  }

  override refresh(): void {
    if (this._digitsMax === undefined) return; // (called from the superclass before Ruby's ivars exist)
    this.contents = pbDoEnsureBitmap(this.contents, this.width - this.borderX, this.height - this.borderY);
    pbSetSystemFont(this.contents);
    this.contents.clear();
    const s = String(Math.abs(this._number)).padStart(this._digitsMax, "0");
    if (this._sign) this.textHelper(0, 0, this._negative ? "-" : "+", 0);
    for (let i = 0; i < this._digitsMax; i++) {
      const index = i + (this._sign ? 1 : 0);
      this.textHelper(index * 24, 0, s.slice(i, i + 1), index);
    }
  }

  override update(): void {
    super.update();
    const digits = this._digitsMax + (this._sign ? 1 : 0);
    const frames = this._frameClock.tick();
    for (let n = 0; n < frames; n++) {
      if (this._frame % 15 === 0) this.refresh();
      this._frame = (this._frame + 1) % 30;
    }
    if (!this.active) return;
    if (Input.repeat(Input.UP) || Input.repeat(Input.DOWN)) {
      pbPlayCursorSE();
      if (this._index === 0 && this._sign) {
        this._negative = !this._negative;
      } else {
        const place = 10 ** (digits - 1 - this._index);
        let n = Math.floor(this._number / place) % 10;
        this._number -= n * place;
        if (Input.repeat(Input.UP)) n = (n + 1) % 10;
        else if (Input.repeat(Input.DOWN)) n = (n + 9) % 10;
        this._number += n * place;
      }
      this.refresh();
    } else if (Input.repeat(Input.RIGHT)) {
      if (digits >= 2) {
        pbPlayCursorSE();
        this._index = (this._index + 1) % digits;
        this._frame = 0;
        this.refresh();
      }
    } else if (Input.repeat(Input.LEFT)) {
      if (digits >= 2) {
        pbPlayCursorSE();
        this._index = (this._index + digits - 1) % digits;
        this._frame = 0;
        this.refresh();
      }
    }
  }

  private textHelper(x: number, y: number, text: string, i: number): void {
    const contents = this.contents!;
    const textwidth = contents.textSize(text).width;
    pbDrawShadowText(contents, x + (12 - Math.floor(textwidth / 2)),
      y - 2 + (contents.textOffsetY || 0), // TEXT OFFSET (the - 2)
      textwidth + 4, 32, text, this._baseColor, this._shadowColor);
    if (this._index === i && this.active && Math.floor(this._frame / 15) === 0) {
      contents.fillRect(x + (12 - Math.floor(textwidth / 2)), y + 30, textwidth, 2, this._baseColor);
    }
  }
}

//===============================================================================
//
//===============================================================================
export class SpriteWindow_Selectable extends SpriteWindow_Base {
  _itemMax = 1;
  _columnMax = 1;
  _virtualOy = 2; // TEXT OFFSET
  _index = -1;
  _rowHeight = 32;
  _columnSpacing = 32;
  ignoreInput = false;

  constructor(x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
  }

  itemCount(): number {
    return this._itemMax || 0;
  }

  get index(): number { return this._index; }
  set index(index: number) {
    if (this._index !== index) {
      this._index = index;
      this.privUpdateCursorRect(true);
    }
  }

  get rowHeight(): number { return this._rowHeight || 32; }
  set rowHeight(value: number) {
    if (this._rowHeight !== value) {
      const oldTopRow = this.topRow;
      this._rowHeight = Math.max(1, value);
      this.topRow = oldTopRow;
      this.updateCursorRect();
    }
  }

  get columns(): number { return this._columnMax || 1; }
  set columns(value: number) {
    if (this._columnMax !== value) {
      this._columnMax = Math.max(1, value);
      this.updateCursorRect();
    }
  }

  get columnSpacing(): number { return this._columnSpacing ?? 32; }
  set columnSpacing(value: number) {
    if (this._columnSpacing !== value) {
      this._columnSpacing = Math.max(0, value);
      this.updateCursorRect();
    }
  }

  get count(): number { return this._itemMax; }

  get rowMax(): number {
    return Math.floor((this._itemMax + this._columnMax - 1) / this._columnMax);
  }

  get topRow(): number {
    return Math.floor(this._virtualOy / (this._rowHeight || 32));
  }

  set topRow(row: number) {
    if (row > this.rowMax - 1) row = this.rowMax - 1;
    if (row < 0) row = 0;
    this._virtualOy = row * this._rowHeight + 2; // TEXT OFFSET (the + 2)
  }

  get topItem(): number {
    return this.topRow * this._columnMax;
  }

  get pageRowMax(): number {
    return Math.floor(this.privPageRowMax());
  }

  get pageItemMax(): number {
    return Math.floor(this.privPageItemMax());
  }

  itemRect(item: number): Rect {
    if (item < 0 || item >= this._itemMax || item < this.topItem || item > this.topItem + this.pageItemMax) {
      return new Rect(0, 0, 0, 0);
    }
    const cursorWidth = Math.floor((this.width - this.borderX - (this._columnMax - 1) * this._columnSpacing) / this._columnMax);
    const x = (item % this._columnMax) * (cursorWidth + this._columnSpacing);
    const y = Math.floor(item / this._columnMax) * this._rowHeight - this._virtualOy;
    return new Rect(x, y, cursorWidth, this._rowHeight);
  }

  override refresh(): void {}

  updateCursorRect(): void {
    this.privUpdateCursorRect();
  }

  override update(): void {
    super.update();
    if (!(this.active && this._itemMax > 0 && this._index >= 0 && !this.ignoreInput)) return;
    const move = (newIndex: number, after?: () => void) => {
      const oldindex = this._index;
      this._index = newIndex;
      if (this._index !== oldindex) {
        pbPlayCursorSE();
        after?.();
        this.updateCursorRect();
      }
    };
    if (Input.repeat(Input.UP)) {
      if (this._index >= this._columnMax || (Input.trigger(Input.UP) && this._itemMax % this._columnMax === 0)) {
        move((this._index - this._columnMax + this._itemMax) % this._itemMax);
      }
    } else if (Input.repeat(Input.DOWN)) {
      if (this._index < this._itemMax - this._columnMax || (Input.trigger(Input.DOWN) && this._itemMax % this._columnMax === 0)) {
        move((this._index + this._columnMax) % this._itemMax);
      }
    } else if (Input.repeat(Input.LEFT)) {
      if (this._columnMax >= 2 && this._index > 0) move(this._index - 1);
    } else if (Input.repeat(Input.RIGHT)) {
      if (this._columnMax >= 2 && this._index < this._itemMax - 1) move(this._index + 1);
    } else if (Input.repeat(Input.JUMPUP)) {
      if (this._index > 0) {
        move(Math.max(this.index - this.pageItemMax, 0), () => (this.topRow -= this.pageRowMax));
      }
    } else if (Input.repeat(Input.JUMPDOWN)) {
      if (this._index < this._itemMax - 1) {
        move(Math.min(this.index + this.pageItemMax, this._itemMax - 1), () => (this.topRow += this.pageRowMax));
      }
    }
  }

  private privPageRowMax(): number {
    return Math.floor((this.height - this.borderY) / this._rowHeight);
  }

  private privPageItemMax(): number {
    return Math.floor((this.height - this.borderY) / this._rowHeight) * this._columnMax;
  }

  private privUpdateCursorRect(force = false): void {
    if (this._index < 0) {
      this.cursorRect.empty();
      this.refresh();
      return;
    }
    const dorefresh = false;
    const row = Math.floor(this._index / this._columnMax);
    // This code makes the cursor stay in the middle of the visible list as much
    // as possible.
    let newTopRow = row - Math.floor((this.pageRowMax - 1) / 2);
    newTopRow = Math.max(Math.min(newTopRow, this.rowMax - this.pageRowMax), 0);
    if (this.topRow !== newTopRow) this.topRow = newTopRow;
    // End of code
    const cursorWidth = Math.floor((this.width - this.borderX) / this._columnMax);
    const x = (this.index % this._columnMax) * (cursorWidth + this._columnSpacing);
    const y = Math.floor(this.index / this._columnMax) * this._rowHeight - this._virtualOy;
    this.cursorRect.set(x, y, cursorWidth, this._rowHeight);
    if (dorefresh || force) this.refresh();
  }
}

//===============================================================================
// SpriteWindow_Selectable + UpDownArrowMixin
//===============================================================================
export class SpriteWindow_SelectableEx extends SpriteWindow_Selectable {
  declare _uparrow: AnimatedSprite;
  declare _downarrow: AnimatedSprite;

  constructor(x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
    this.initUpDownArrow();
  }

  initUpDownArrow(): void {
    this._uparrow = AnimatedSprite.create("Graphics/Pictures/uparrow", 8, 2, this.viewport);
    this._downarrow = AnimatedSprite.create("Graphics/Pictures/downarrow", 8, 2, this.viewport);
    this._uparrow.z = 99998;
    this._downarrow.z = 99998;
    this._uparrow.visible = false;
    this._downarrow.visible = false;
    this._uparrow.play();
    this._downarrow.play();
  }

  override dispose(): void {
    this._uparrow?.dispose();
    this._downarrow?.dispose();
    super.dispose();
  }

  override get viewport(): Viewport | null { return super.viewport; }
  override set viewport(value: Viewport | null) {
    super.viewport = value;
    // mkxp can move a sprite to another viewport; ours are recreated.
    if (this._uparrow && this._uparrow.viewport !== value) {
      this._uparrow.dispose();
      this._downarrow.dispose();
      this.initUpDownArrow();
    }
  }

  override get color(): Color { return super.color; }
  override set color(value: Color) {
    super.color = value;
    if (this._uparrow) {
      this._uparrow.color = value;
      this._downarrow.color = value;
    }
  }

  adjustForZoom(sprite: AnimatedSprite): void {
    sprite.zoomX = this.zoomX;
    sprite.zoomY = this.zoomY;
    sprite.x = sprite.x * this.zoomX + this.offsetX / this.zoomX;
    sprite.y = sprite.y * this.zoomY + this.offsetY / this.zoomY;
  }

  override update(): void {
    super.update();
    const up = this._uparrow;
    const down = this._downarrow;
    up.x = this.x + Math.floor(this.width / 2) - Math.floor(up.framewidth / 2);
    down.x = this.x + Math.floor(this.width / 2) - Math.floor(down.framewidth / 2);
    up.y = this.y;
    down.y = this.y + this.height - down.frameheight;
    up.visible = this.visible && this.active && this.topItem !== 0 && this._itemMax > this.pageItemMax;
    down.visible = this.visible && this.active &&
      this.topItem + this.pageItemMax < this._itemMax && this._itemMax > this.pageItemMax;
    up.z = this.z + 1;
    down.z = this.z + 1;
    this.adjustForZoom(up);
    this.adjustForZoom(down);
    up.update();
    down.update();
  }
}

//===============================================================================
//
//===============================================================================
export class Window_DrawableCommand extends SpriteWindow_SelectableEx {
  declare _selarrow: AnimatedBitmap;
  declare _baseColor: Color;
  declare _shadowColor: Color;

  constructor(x: number, y: number, width: number, height: number, viewport: Viewport | null = null) {
    super(x, y, width, height);
    if (viewport) this.viewport = viewport;
    if (isDarkWindowskin(this.windowskin)) {
      this._selarrow = new AnimatedBitmap("Graphics/Pictures/selarrow_white");
    } else {
      this._selarrow = new AnimatedBitmap("Graphics/Pictures/selarrow");
    }
    this._index = 0;
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    this.refresh();
  }

  override dispose(): void {
    this._selarrow?.dispose();
    super.dispose();
  }

  get baseColor(): Color { return this._baseColor; }
  set baseColor(value: Color) {
    this._baseColor = value;
    this.refresh();
  }

  get shadowColor(): Color { return this._shadowColor; }
  set shadowColor(value: Color) {
    this._shadowColor = value;
    this.refresh();
  }

  textWidth(bitmap: Bitmap, text: string): number {
    return bitmap.textSize(text).width;
  }

  getAutoDims(commands: string[], dims: number[], width: number | null = null): void {
    const rowMax = Math.floor((commands.length + this.columns - 1) / this.columns);
    let windowheight = rowMax * this.rowHeight;
    windowheight += this.borderY;
    if (width === null || width < 0) {
      width = 0;
      const tmpbitmap = new Bitmap(1, 1);
      pbSetSystemFont(tmpbitmap);
      for (const i of commands) width = Math.max(width, tmpbitmap.textSize(i).width);
      // one 16 to allow cursor
      width += 16 + 16 + TEXTPADDING;
      tmpbitmap.dispose();
    }
    // Store suggested width and height of window
    dims[0] = Math.max(this.borderX + 1, width * this.columns + this.borderX + (this.columns - 1) * this.columnSpacing);
    dims[1] = Math.max(this.borderY + 1, windowheight);
    dims[1] = Math.min(dims[1], Graphics.height);
  }

  override setSkin(skin: string): void {
    super.setSkin(skin);
    this.privRefresh(true);
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
  }

  drawCursor(index: number, rect: Rect): Rect {
    if (this.index === index) {
      pbCopyBitmap(this.contents!, this._selarrow.bitmap, rect.x, rect.y + 2); // TEXT OFFSET (counters the offset above)
    }
    return new Rect(rect.x + 16, rect.y, rect.width - 16, rect.height);
  }

  /** to be implemented by derived classes */
  override itemCount(): number {
    return 0;
  }

  /** to be implemented by derived classes */
  drawItem(_index: number, _count: number, _rect: Rect): void {}

  override refresh(): void {
    if (this._selarrow === undefined) return; // (called from the superclass before Ruby's ivars exist)
    this._itemMax = this.itemCount();
    const dwidth = this.width - this.borderX;
    const dheight = this.height - this.borderY;
    this.contents = pbDoEnsureBitmap(this.contents, dwidth, dheight);
    this.contents.clear();
    for (let i = 0; i < this._itemMax; i++) {
      if (i < this.topItem || i > this.topItem + this.pageItemMax) continue;
      this.drawItem(i, this._itemMax, this.itemRect(i));
    }
  }

  override update(): void {
    const oldindex = this.index;
    super.update();
    if (this.index !== oldindex) this.refresh();
  }
}

//===============================================================================
//
//===============================================================================
export class Window_CommandPokemon extends Window_DrawableCommand {
  declare _commands: string[];
  declare _starting: boolean;

  constructor(commands: string[], width: number | null = null) {
    super(0, 0, 32, 32);
    this._starting = true;
    this._commands = [];
    const dims: number[] = [];
    this.getAutoDims(commands, dims, width);
    this.width = dims[0]!;
    this.height = dims[1]!;
    this._commands = commands;
    this.active = true;
    const colors = getDefaultTextColors(this.windowskin);
    this.baseColor = colors[0];
    this.shadowColor = colors[1];
    this.refresh();
    this._starting = false;
  }

  static newWithSize(commands: string[], x: number, y: number, width: number, height: number, viewport: Viewport | null = null): Window_CommandPokemon {
    const ret = new this(commands, width);
    ret.x = x;
    ret.y = y;
    ret.width = width;
    ret.height = height;
    ret.viewport = viewport;
    return ret;
  }

  static newEmpty(x: number, y: number, width: number, height: number, viewport: Viewport | null = null): Window_CommandPokemon {
    return this.newWithSize([], x, y, width, height, viewport);
  }

  override get index(): number { return super.index; }
  override set index(value: number) {
    super.index = value;
    if (this._starting === false) this.refresh();
  }

  get commands(): string[] { return this._commands; }
  set commands(value: string[]) {
    this._commands = value;
    this._itemMax = value.length;
    this.updateCursorRect();
    this.refresh();
  }

  override get width(): number { return super.width; }
  override set width(value: number) {
    super.width = value;
    if (this._starting === false) {
      this.index = this.index;
      this.updateCursorRect();
    }
  }

  override get height(): number { return super.height; }
  override set height(value: number) {
    super.height = value;
    if (this._starting === false) {
      this.index = this.index;
      this.updateCursorRect();
    }
  }

  resizeToFit(commands: string[], width: number | null = null): void {
    const dims: number[] = [];
    this.getAutoDims(commands, dims, width);
    this.width = dims[0]!;
    this.height = dims[1]!;
  }

  override itemCount(): number {
    return this._commands ? this._commands.length : 0;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    if (this._starting !== false) pbSetSystemFont(this.contents!);
    rect = this.drawCursor(index, rect);
    pbDrawShadowText(this.contents!, rect.x, rect.y + (this.contents!.textOffsetY || 0),
      rect.width, rect.height, this._commands[index]!, this.baseColor, this.shadowColor);
  }
}

export class Window_CommandPokemonEx extends Window_CommandPokemon {}

//===============================================================================
//
//===============================================================================
export class Window_AdvancedCommandPokemon extends Window_DrawableCommand {
  declare _commands: string[];
  declare _starting: boolean;

  override textWidth(bitmap: Bitmap, text: string): number {
    const dims: [number | null, number] = [null, 0];
    const chars = getFormattedText(bitmap, 0, 0, Graphics.width - this.borderX - TEXTPADDING - 16, -1, text, this.rowHeight, true, true);
    for (const ch of chars) {
      dims[0] = dims[0] !== null ? Math.min(dims[0], ch[1]) : ch[1];
      dims[1] = Math.max(dims[1], ch[1] + ch[3]);
    }
    return dims[1] - (dims[0] ?? 0);
  }

  constructor(commands: string[], width: number | null = null) {
    super(0, 0, 32, 32);
    this._starting = true;
    this._commands = [];
    const dims: number[] = [];
    this.getAutoDims(commands, dims, width);
    this.width = dims[0]!;
    this.height = dims[1]!;
    this._commands = commands;
    this.active = true;
    const colors = getDefaultTextColors(this.windowskin);
    this.baseColor = colors[0];
    this.shadowColor = colors[1];
    this.refresh();
    this._starting = false;
  }

  static newWithSize(commands: string[], x: number, y: number, width: number, height: number, viewport: Viewport | null = null): Window_AdvancedCommandPokemon {
    const ret = new this(commands, width);
    ret.x = x;
    ret.y = y;
    ret.width = width;
    ret.height = height;
    ret.viewport = viewport;
    return ret;
  }

  override get index(): number { return super.index; }
  override set index(value: number) {
    super.index = value;
    if (this._starting === false) this.refresh();
  }

  get commands(): string[] { return this._commands; }
  set commands(value: string[]) {
    this._commands = value;
    this._itemMax = value.length;
    this.updateCursorRect();
    this.refresh();
  }

  override get width(): number { return super.width; }
  override set width(value: number) {
    const oldvalue = super.width;
    super.width = value;
    if (this._starting === false && oldvalue !== value) {
      this.index = this.index;
      this.updateCursorRect();
    }
  }

  override get height(): number { return super.height; }
  override set height(value: number) {
    const oldvalue = super.height;
    super.height = value;
    if (this._starting === false && oldvalue !== value) {
      this.index = this.index;
      this.updateCursorRect();
    }
  }

  resizeToFit(commands: string[], width: number | null = null): void {
    const dims: number[] = [];
    this.getAutoDims(commands, dims, width);
    this.width = dims[0]!;
    this.height = dims[1]! - 6;
  }

  override itemCount(): number {
    return this._commands ? this._commands.length : 0;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    const contents = this.contents!;
    pbSetSystemFont(contents);
    rect = this.drawCursor(index, rect);
    const command = this._commands[index]!;
    if (toUnformattedText(command).replace(/\n/g, "") === command) {
      // Use faster alternative for unformatted text without line breaks
      pbDrawShadowText(contents, rect.x, rect.y, rect.width, rect.height, command, this.baseColor, this.shadowColor);
    } else {
      const chars = getFormattedText(contents, rect.x, rect.y + 4, rect.width, rect.height, command, rect.height, true, true);
      drawFormattedChars(contents, chars);
    }
  }
}

export class Window_AdvancedCommandPokemonEx extends Window_AdvancedCommandPokemon {}
