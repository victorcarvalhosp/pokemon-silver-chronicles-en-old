// Port of 007_Objects and windows/012_TextEntry.rb: CharacterEntryHelper,
// Window_TextEntry and Window_TextEntry_Keyboard.
// Window_MultilineTextEntry isn't ported: only debug editors, mail and
// pbMessageFreeText use it, none of which the game reaches yet.
//
// The cursor blink counts original 40 fps frames (FrameCounter), as the
// Ruby code counts raw update calls.

import { Bitmap } from "../../rgss/Bitmap";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbDrawShadowText } from "../drawText";
import { FrameCounter } from "../frameTime";
import { getDefaultTextColors, pbDoEnsureBitmap } from "../messageConfig";
import { SpriteWindow_Base } from "../windows/SpriteWindow";
import { KeyboardInput } from "./keyboard";

/** text.scan(/./m): the string's characters (code points). */
export function chars(text: string): string[] {
  return Array.from(text);
}

//===============================================================================
//
//===============================================================================
export class CharacterEntryHelper {
  text: string;
  maxlength = -1;
  private _passwordChar = "";
  cursor: number;

  constructor(text: string) {
    this.text = text;
    this.cursor = chars(text).length;
  }

  textChars(): string[] {
    const c = chars(this.text);
    if (this._passwordChar !== "") for (let i = 0; i < c.length; i++) c[i] = this._passwordChar;
    return c;
  }

  get passwordChar(): string { return this._passwordChar; }
  set passwordChar(value: string | null) { this._passwordChar = value || ""; }

  get length(): number {
    return chars(this.text).length;
  }

  canInsert(): boolean {
    const c = chars(this.text);
    if (this.maxlength >= 0 && c.length >= this.maxlength) return false;
    return true;
  }

  insert(ch: string): boolean {
    const c = chars(this.text);
    if (this.maxlength >= 0 && c.length >= this.maxlength) return false;
    c.splice(this.cursor, 0, ch);
    this.text = c.join("");
    this.cursor += 1;
    return true;
  }

  canDelete(): boolean {
    const c = chars(this.text);
    if (c.length <= 0 || this.cursor <= 0) return false;
    return true;
  }

  delete(): boolean {
    const c = chars(this.text);
    if (c.length <= 0 || this.cursor <= 0) return false;
    c.splice(this.cursor - 1, 1);
    this.text = c.join("");
    this.cursor -= 1;
    return true;
  }
}

//===============================================================================
//
//===============================================================================
export class Window_TextEntry extends SpriteWindow_Base {
  declare _baseColor: Color;
  declare _shadowColor: Color;
  declare _helper: CharacterEntryHelper;
  declare _heading: string | null;
  declare _frame: number;
  declare _clock: FrameCounter;

  constructor(text: string, x: number, y: number, width: number, height: number, heading: string | null = null, usedarkercolor = false) {
    super(x, y, width, height);
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    if (usedarkercolor) {
      this._baseColor = new Color(16, 24, 32);
      this._shadowColor = new Color(168, 184, 184);
    }
    this._helper = new CharacterEntryHelper(text);
    this._heading = heading;
    this.active = true;
    this._frame = 0;
    this._clock = new FrameCounter();
    this.refresh();
  }

  get text(): string { return this._helper.text; }
  set text(value: string) {
    this._helper.text = value;
    this.refresh();
  }

  get maxlength(): number { return this._helper.maxlength; }
  set maxlength(value: number) {
    this._helper.maxlength = value;
    this.refresh();
  }

  get passwordChar(): string { return this._helper.passwordChar; }
  set passwordChar(value: string) {
    this._helper.passwordChar = value;
    this.refresh();
  }

  insert(ch: string): boolean {
    if (this._helper.insert(ch)) {
      this._frame = 0;
      this.refresh();
      return true;
    }
    return false;
  }

  delete(): boolean {
    if (this._helper.delete()) {
      this._frame = 0;
      this.refresh();
      return true;
    }
    return false;
  }

  /** The once-per-frame blink counter (@frame += 1; @frame %= 20; ...). */
  protected updateFrame(): void {
    for (let n = this._clock.tick(); n > 0; n--) {
      this._frame += 1;
      this._frame %= 20;
      if (this._frame % 10 === 0) this.refresh();
    }
  }

  override update(): void {
    this.updateFrame();
    if (!this.active) return;
    // Moving cursor
    if (Input.repeat(Input.LEFT) && Input.press(Input.ACTION)) {
      if (this._helper.cursor > 0) {
        this._helper.cursor -= 1;
        this._frame = 0;
        this.refresh();
      }
    } else if (Input.repeat(Input.RIGHT) && Input.press(Input.ACTION)) {
      if (this._helper.cursor < chars(this.text).length) {
        this._helper.cursor += 1;
        this._frame = 0;
        this.refresh();
      }
    } else if (Input.repeat(Input.BACK)) { // Backspace
      if (this._helper.cursor > 0) this.delete();
    }
  }

  override refresh(): void {
    if (!this._helper) return; // (called from the superclass before Ruby's ivars exist)
    this.contents = pbDoEnsureBitmap(this.contents, this.width - this.borderX, this.height - this.borderY);
    const bitmap: Bitmap = this.contents;
    bitmap.clear();
    let x = 0;
    let y = 0;
    if (this._heading) {
      const textwidth = bitmap.textSize(this._heading).width;
      pbDrawShadowText(bitmap, x, y, textwidth + 4, 32, this._heading, this._baseColor, this._shadowColor);
      y += 32;
    }
    x += 4;
    const width = this.width - this.borderX;
    const cursorcolor = new Color(16, 24, 32);
    const textscan = chars(this.text);
    const scanlength = textscan.length;
    if (this._helper.cursor > scanlength) this._helper.cursor = scanlength;
    if (this._helper.cursor < 0) this._helper.cursor = 0;
    let startpos = this._helper.cursor;
    let fromcursor = 0;
    while (startpos > 0) {
      const c = this._helper.passwordChar !== "" ? this._helper.passwordChar : textscan[startpos - 1]!;
      fromcursor += bitmap.textSize(c).width;
      if (fromcursor > width - 4) break;
      startpos -= 1;
    }
    for (let i = startpos; i < scanlength; i++) {
      const c = this._helper.passwordChar !== "" ? this._helper.passwordChar : textscan[i]!;
      const textwidth = bitmap.textSize(c).width;
      if (c === "\n") continue;
      // Draw text
      pbDrawShadowText(bitmap, x, y, textwidth + 4, 32, c, this._baseColor, this._shadowColor);
      // Draw cursor if necessary
      if ((Math.floor(this._frame / 10) & 1) === 0 && i === this._helper.cursor) {
        bitmap.fillRect(x, y + 4, 2, 24, cursorcolor);
      }
      // Add x to drawn text width
      x += textwidth;
    }
    if ((Math.floor(this._frame / 10) & 1) === 0 && textscan.length === this._helper.cursor) {
      bitmap.fillRect(x, y + 4, 2, 24, cursorcolor);
    }
  }
}

//===============================================================================
//
//===============================================================================
export class Window_TextEntry_Keyboard extends Window_TextEntry {
  override update(): void {
    this.updateFrame();
    if (!this.active) return;
    // Moving cursor
    if (KeyboardInput.triggerex("LEFT") || KeyboardInput.repeatex("LEFT")) {
      if (this._helper.cursor > 0) {
        this._helper.cursor -= 1;
        this._frame = 0;
        this.refresh();
      }
      return;
    } else if (KeyboardInput.triggerex("RIGHT") || KeyboardInput.repeatex("RIGHT")) {
      if (this._helper.cursor < chars(this.text).length) {
        this._helper.cursor += 1;
        this._frame = 0;
        this.refresh();
      }
      return;
    } else if (KeyboardInput.triggerex("BACKSPACE") || KeyboardInput.repeatex("BACKSPACE")) {
      if (this._helper.cursor > 0) this.delete();
      return;
    } else if (KeyboardInput.triggerex("RETURN") || KeyboardInput.triggerex("ESCAPE")) {
      return;
    }
    for (const c of chars(KeyboardInput.gets())) this.insert(c);
  }
}
