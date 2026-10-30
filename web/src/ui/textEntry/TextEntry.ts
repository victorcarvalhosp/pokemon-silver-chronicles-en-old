// Port of 007_Objects and windows/012_TextEntry.rb: CharacterEntryHelper,
// Window_TextEntry, Window_TextEntry_Keyboard and Window_MultilineTextEntry
// (no game code creates the last one).
//
// The cursor blink counts original 40 fps frames (FrameCounter), as the
// Ruby code counts raw update calls.

import { Bitmap } from "../../rgss/Bitmap";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { getLineBrokenText, pbDrawShadowText, type LineBrokenText } from "../drawText";
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

//===============================================================================
//
//===============================================================================
export class Window_MultilineTextEntry extends SpriteWindow_Base {
  declare _baseColor: Color;
  declare _shadowColor: Color;
  declare _helper: CharacterEntryHelper;
  declare _firstline: number;
  declare _cursorLine: number;
  declare _cursorColumn: number;
  declare _frame: number;
  declare _clock: FrameCounter;
  declare _textchars: LineBrokenText[] | null;

  constructor(text: string, x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
    const colors = getDefaultTextColors(this.windowskin);
    this._baseColor = colors[0];
    this._shadowColor = colors[1];
    this._helper = new CharacterEntryHelper(text);
    this._firstline = 0;
    this._cursorLine = 0;
    this._cursorColumn = 0;
    this._frame = 0;
    this._clock = new FrameCounter();
    this._textchars = null;
    this.active = true;
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

  get text(): string { return this._helper.text; }
  set text(value: string) {
    this._helper.text = value;
    this._textchars = null;
    this.refresh();
  }

  get maxlength(): number { return this._helper.maxlength; }
  set maxlength(value: number) {
    this._helper.maxlength = value;
    this._textchars = null;
    this.refresh();
  }

  insert(ch: string): boolean {
    this._helper.cursor = this.getPosFromLineAndColumn(this._cursorLine, this._cursorColumn);
    if (this._helper.insert(ch)) {
      this._frame = 0;
      this._textchars = null;
      this.moveCursor(0, 1);
      this.refresh();
      return true;
    }
    return false;
  }

  delete(): boolean {
    this._helper.cursor = this.getPosFromLineAndColumn(this._cursorLine, this._cursorColumn);
    if (this._helper.delete()) {
      this._frame = 0;
      this.moveCursor(0, -1); // use old textchars
      this._textchars = null;
      this.refresh();
      return true;
    }
    return false;
  }

  getTextChars(): LineBrokenText[] {
    this._textchars ??= getLineBrokenText(this.contents!, this._helper.text, this.contents!.width, null);
    return this._textchars;
  }

  getTotalLines(): number {
    const textchars = this.getTextChars();
    if (textchars.length === 0) return 1;
    return textchars[textchars.length - 1]![5] + 1;
  }

  getLineY(line: number): number {
    const textchars = this.getTextChars();
    if (textchars.length === 0) return 0;
    const totallines = this.getTotalLines();
    if (line < 0) line = 0;
    if (line >= totallines) line = totallines - 1;
    let maximumY = 0;
    for (const text of textchars) {
      const thisline = text[5];
      const y = text[2];
      if (thisline === line) return y;
      if (maximumY < y) maximumY = y;
    }
    return maximumY;
  }

  getColumnsInLine(line: number): number {
    const textchars = this.getTextChars();
    if (textchars.length === 0) return 0;
    const totallines = this.getTotalLines();
    if (line < 0) line = 0;
    if (line >= totallines) line = totallines - 1;
    let endpos = 0;
    for (const text of textchars) if (text[5] === line) endpos += text[8];
    return endpos;
  }

  getPosFromLineAndColumn(line: number, column: number): number {
    const textchars = this.getTextChars();
    if (textchars.length === 0) return 0;
    const totallines = this.getTotalLines();
    if (line < 0) line = 0;
    if (line >= totallines) line = totallines - 1;
    let endpos = 0;
    for (const text of textchars) {
      const [, , , , , thisline, thispos, thiscolumn, thislength] = text;
      if (thisline === line) {
        endpos = thispos + thislength;
        if (column >= thiscolumn && column <= thiscolumn + thislength && thislength > 0) {
          return thispos + (column - thiscolumn);
        }
      }
    }
    return endpos;
  }

  getLastVisibleLine(): number {
    this.getTextChars();
    const textheight = Math.max(1, this.contents!.textSize("X").height);
    return this._firstline + Math.floor((this.height - this.borderY) / textheight) - 1;
  }

  updateCursorPos(doRefresh: boolean): void {
    // Calculate new cursor position
    this._helper.cursor = this.getPosFromLineAndColumn(this._cursorLine, this._cursorColumn);
    if (doRefresh) {
      this._frame = 0;
      this.refresh();
    }
    if (this._cursorLine < this._firstline) this._firstline = this._cursorLine;
    const lastVisible = this.getLastVisibleLine();
    if (this._cursorLine > lastVisible) this._firstline += this._cursorLine - lastVisible;
  }

  moveCursor(lineOffset: number, columnOffset: number): void {
    // Move column offset first, then lines (since column offset
    // can affect line offset)
    let totalColumns = this.getColumnsInLine(this._cursorLine); // check current line
    const totalLines = this.getTotalLines();
    const oldCursorLine = this._cursorLine;
    const oldCursorColumn = this._cursorColumn;
    this._cursorColumn += columnOffset;
    if (this._cursorColumn < 0 && this._cursorLine > 0) {
      // Will happen if cursor is moved left from the beginning of a line
      this._cursorLine -= 1;
      this._cursorColumn = this.getColumnsInLine(this._cursorLine);
    } else if (this._cursorColumn > totalColumns && this._cursorLine < totalLines - 1) {
      // Will happen if cursor is moved right from the end of a line
      this._cursorLine += 1;
      this._cursorColumn = 0;
    }
    // Ensure column bounds
    totalColumns = this.getColumnsInLine(this._cursorLine);
    if (this._cursorColumn > totalColumns) this._cursorColumn = totalColumns;
    if (this._cursorColumn < 0) this._cursorColumn = 0; // totalColumns can be 0
    // Move line offset
    this._cursorLine += lineOffset;
    if (this._cursorLine < 0) this._cursorLine = 0;
    if (this._cursorLine >= totalLines) this._cursorLine = totalLines - 1;
    // Ensure column bounds again
    totalColumns = this.getColumnsInLine(this._cursorLine);
    if (this._cursorColumn > totalColumns) this._cursorColumn = totalColumns;
    if (this._cursorColumn < 0) this._cursorColumn = 0; // totalColumns can be 0
    this.updateCursorPos(oldCursorLine !== this._cursorLine || oldCursorColumn !== this._cursorColumn);
  }

  override update(): void {
    for (let n = this._clock.tick(); n > 0; n--) {
      this._frame += 1;
      this._frame %= 20;
      if (this._frame % 10 === 0) this.refresh();
    }
    if (!this.active) return;
    // Moving cursor
    if (KeyboardInput.triggerex("UP") || KeyboardInput.repeatex("UP")) {
      this.moveCursor(-1, 0);
      return;
    } else if (KeyboardInput.triggerex("DOWN") || KeyboardInput.repeatex("DOWN")) {
      this.moveCursor(1, 0);
      return;
    } else if (KeyboardInput.triggerex("LEFT") || KeyboardInput.repeatex("LEFT")) {
      this.moveCursor(0, -1);
      return;
    } else if (KeyboardInput.triggerex("RIGHT") || KeyboardInput.repeatex("RIGHT")) {
      this.moveCursor(0, 1);
      return;
    }
    if (Input.press(Input.CTRL) && KeyboardInput.triggerex("HOME")) {
      // Move cursor to beginning
      this._cursorLine = 0;
      this._cursorColumn = 0;
      this.updateCursorPos(true);
      return;
    } else if (Input.press(Input.CTRL) && KeyboardInput.triggerex("END")) {
      // Move cursor to end
      this._cursorLine = this.getTotalLines() - 1;
      this._cursorColumn = this.getColumnsInLine(this._cursorLine);
      this.updateCursorPos(true);
      return;
    } else if (KeyboardInput.triggerex("RETURN") || KeyboardInput.repeatex("RETURN")) {
      this.insert("\n");
      return;
    } else if (KeyboardInput.triggerex("BACKSPACE") || KeyboardInput.repeatex("BACKSPACE")) { // Backspace
      this.delete();
      return;
    }
    for (const c of chars(KeyboardInput.gets())) this.insert(c);
  }

  override refresh(): void {
    if (!this._helper) return; // (called from the superclass before Ruby's ivars exist)
    const newContents = pbDoEnsureBitmap(this.contents, this.width - this.borderX, this.height - this.borderY);
    if (this.contents !== newContents) this._textchars = null;
    this.contents = newContents;
    const bitmap: Bitmap = this.contents;
    bitmap.clear();
    this.getTextChars();
    const height = this.height - this.borderY;
    const cursorcolor = new Color(0, 0, 0);
    const textchars = this.getTextChars();
    const startY = this.getLineY(this._firstline);
    for (const text of textchars) {
      const thisline = text[5];
      const thislength = text[8];
      const textY = text[2] - startY;
      // Don't draw lines before the first or zero-length segments
      if (thisline < this._firstline || thislength === 0) continue;
      // Don't draw lines beyond the window's height
      if (textY >= height) break;
      const c = text[0];
      // Don't draw spaces
      if (c === " ") continue;
      const textwidth = text[3] + 4; // add 4 to prevent draw_text from stretching text
      const textheight = text[4];
      // Draw text
      pbDrawShadowText(bitmap, text[1], textY, textwidth, textheight, c, this._baseColor, this._shadowColor);
    }
    // Draw cursor
    if ((Math.floor(this._frame / 10) & 1) === 0) {
      let textheight = bitmap.textSize("X").height;
      let cursorY = (textheight * this._cursorLine) - startY;
      let cursorX = 0;
      for (const text of textchars) {
        const [, , , , , thisline, , thiscolumn, thislength] = text;
        if (thisline === this._cursorLine && this._cursorColumn >= thiscolumn &&
            this._cursorColumn <= thiscolumn + thislength) {
          cursorY = text[2] - startY;
          cursorX = text[1];
          textheight = text[4];
          const posToCursor = this._cursorColumn - thiscolumn;
          if (posToCursor >= 0) {
            const partialString = chars(text[0]).slice(0, posToCursor).join("");
            cursorX += bitmap.textSize(partialString).width;
          }
          break;
        }
      }
      cursorY += 4;
      const cursorHeight = Math.max(4, textheight - 4, bitmap.textSize("X").height - 4);
      bitmap.fillRect(cursorX, cursorY, 2, cursorHeight, cursorcolor);
    }
  }
}
