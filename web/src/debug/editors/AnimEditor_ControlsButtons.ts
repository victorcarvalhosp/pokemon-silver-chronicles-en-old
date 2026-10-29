// Port of Data/Scripts/020_Debug/002_Animation editor/002_AnimEditor_ControlsButtons.rb:
// the battle animation editor's mouse-driven controls (Label, Button,
// Checkbox, TextField, Slider, TextSlider and their optional versions) and
// ControlWindow, the window that lays them out one per 32-pixel row.
//
// Ruby's numbers: a slider can hold a cel value the data file stores as a
// Float ("64.0"); it shows and keeps it as one until it's changed (see
// AnimEditor_Data.ts).

import { Bitmap } from "../../rgss/Bitmap";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { getMousePos } from "../../plugins/easyMouse/Mouse";
import { pbDrawShadowText } from "../../ui/drawText";
import { _INTL, pbSetNarrowFont } from "../../ui/messageConfig";
import { KeyboardInput } from "../../ui/textEntry/keyboard";
import { SpriteWindow, SpriteWindow_Base } from "../../ui/windows/SpriteWindow";
import { rAdd, rSub, type RNum } from "./AnimEditor_Data";

/** Rect#contains (001_AnimEditor_SceneElements.rb) */
export function rectContains(rc: Rect, x: number, y: number): boolean {
  return x >= rc.x && x < rc.x + rc.width && y >= rc.y && y < rc.y + rc.height;
}

/** Input.time?(Input::MOUSELEFT) / 1000: milliseconds the left button has been held. */
function mouseHeldMs(): number {
  return Math.floor(Input.time(Input.MOUSELEFT) / 1000);
}

//===============================================================================
// ShadowText
//===============================================================================
/** ShadowText#shadowtext */
export function shadowtext(bitmap: Bitmap, x: number, y: number, w: number, h: number, t: string, disabled = false, align = 0): void {
  const width = bitmap.textSize(t).width;
  switch (align) {
    case 2:
      x += (w - width);
      break;
    case 1:
      x += Math.floor(w / 2) - Math.floor(width / 2);
      break;
  }
  pbDrawShadowText(bitmap, x, y + 6, w, h, t,
    disabled ? new Color(208, 208, 200) : new Color(96, 96, 96),
    new Color(208, 208, 200));
}

//===============================================================================
//
//===============================================================================
/** What a control's parent can be (a ControlWindow, or anything with x/y). */
export interface ControlParent {
  x: number;
  y: number;
}

export class UIControl {
  bitmap: Bitmap | null = null;
  protected _label: string;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  protected _changed = false;
  parent: ControlParent | null = null;
  disabled = false;
  protected _invalid = true;

  // (attr_accessors; accessors here so subclasses can override them as Ruby's do)
  get label(): string { return this._label; }
  set label(value: string) { this._label = value; }
  get changed(): boolean { return this._changed; }
  set changed(value: boolean) { this._changed = value; }

  get text(): string { return this.label; }
  set text(value: string) { this.label = value; }

  constructor(label: string) {
    this._label = label;
  }

  toAbsoluteRect(rc: Rect): Rect {
    return new Rect(rc.x + this.parentX(), rc.y + this.parentY(), rc.width, rc.height);
  }

  // (Ruby also handles an RGSS Window parent, x + 16; the editor has none.)
  parentX(): number {
    if (!this.parent) return 0;
    if (this.parent instanceof SpriteWindow) return this.parent.x + this.parent.leftEdge;
    return this.parent.x;
  }

  parentY(): number {
    if (!this.parent) return 0;
    if (this.parent instanceof SpriteWindow) return this.parent.y + this.parent.topEdge;
    return this.parent.y;
  }

  invalid(): boolean {
    return this._invalid;
  }

  /** Marks that the control must be redrawn to reflect current logic */
  invalidate(): void {
    this._invalid = true;
  }

  /** Updates the logic on the control, invalidating it if necessary */
  update(): void {}

  /** Redraws the control */
  refresh(): void {}

  /** Makes the control no longer invalid */
  validate(): void {
    this._invalid = false;
  }

  /** Redraws the control only if it is invalid */
  repaint(): void {
    if (this.invalid()) {
      this.refresh();
      this.validate();
    }
  }
}

//===============================================================================
//
//===============================================================================
export class Label extends UIControl {
  override get text(): string { return this.label; }
  override set text(value: string) {
    this.label = value;
    this.refresh();
  }

  override refresh(): void {
    const bitmap = this.bitmap!;
    bitmap.fillRect(this.x, this.y, this.width, this.height, new Color(0, 0, 0, 0));
    const size = bitmap.textSize(this.label).width;
    shadowtext(bitmap, this.x + 4, this.y, size, this.height, this.label, this.disabled);
  }
}

//===============================================================================
//
//===============================================================================
export class Button extends UIControl {
  protected captured = false;

  constructor(label: string) {
    super(label);
    this._label = label;
  }

  override update(): void {
    const mousepos = getMousePos();
    this.changed = false;
    if (!mousepos) return;
    let rect = new Rect(this.x + 1, this.y + 1, this.width - 2, this.height - 2);
    rect = this.toAbsoluteRect(rect);
    if (Input.trigger(Input.MOUSELEFT) &&
        rectContains(rect, mousepos[0], mousepos[1]) && !this.captured) {
      this.captured = true;
      this.invalidate();
    }
    if (Input.release(Input.MOUSELEFT) && this.captured) {
      if (rectContains(rect, mousepos[0], mousepos[1])) this.changed = true;
      this.captured = false;
      this.invalidate();
    }
  }

  override refresh(): Rect | void {
    const bitmap = this.bitmap!;
    const x = this.x;
    const y = this.y;
    const width = this.width;
    const height = this.height;
    const color = new Color(120, 120, 120);
    bitmap.fillRect(x + 1, y + 1, width - 2, height - 2, color);
    const ret = new Rect(x + 1, y + 1, width - 2, height - 2);
    if (this.captured) {
      bitmap.fillRect(x + 2, y + 2, width - 4, height - 4, new Color(120, 120, 120, 80));
    } else {
      bitmap.fillRect(x + 2, y + 2, width - 4, height - 4, new Color(0, 0, 0, 0));
    }
    const size = bitmap.textSize(this.label).width;
    shadowtext(bitmap, x + 4, y, size, height, this.label, this.disabled);
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class Checkbox extends Button {
  protected _checked = false;

  get curvalue(): boolean { return this.checked; }
  set curvalue(value: boolean) { this.checked = value; }

  get checked(): boolean { return this._checked; }
  set checked(value: boolean) {
    this._checked = value;
    this.invalidate();
  }

  constructor(label: string) {
    super(label);
    this._checked = false;
  }

  override update(): void {
    super.update();
    if (this.changed) {
      this._checked = !this._checked;
      this.invalidate();
    }
  }

  override refresh(): Rect {
    const bitmap = this.bitmap!;
    const x = this.x;
    const y = this.y;
    const width = Math.min(this.width, 32);
    const height = Math.min(this.height, 32);
    const color = new Color(120, 120, 120);
    bitmap.fillRect(x + 2, y + 2, this.width - 4, this.height - 4, new Color(0, 0, 0, 0));
    bitmap.fillRect(x + 1, y + 1, width - 2, height - 2, color);
    const ret = new Rect(x + 1, y + 1, width - 2, height - 2);
    if (this.captured) {
      bitmap.fillRect(x + 2, y + 2, width - 4, height - 4, new Color(120, 120, 120, 80));
    } else {
      bitmap.fillRect(x + 2, y + 2, width - 4, height - 4, new Color(0, 0, 0, 0));
    }
    if (this.checked) {
      shadowtext(bitmap, x, y, 32, 32, "X", this.disabled, 1);
    }
    const size = bitmap.textSize(this.label).width;
    shadowtext(bitmap, x + 36, y, size, height, this.label, this.disabled);
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
/** String#scan(/./m): the string's characters. */
const chars = (s: string): string[] => [...s];

export class TextField extends UIControl {
  private _text: string;
  private frame = 0;
  private cursor: number;
  protected captured = false; // (never set; Ruby reads an unset @captured)

  override get text(): string { return this._text; }
  override set text(value: string) {
    this._text = value;
    this.invalidate();
  }

  constructor(label: string, text: string) {
    super(label);
    this.label = label;
    this._text = text;
    this.cursor = chars(text).length;
  }

  insert(ch: string): void {
    const c = chars(this.text);
    c.splice(this.cursor, 0, ch);
    this._text = c.join("");
    this.cursor += 1;
    this.frame = 0;
    this.changed = true;
    this.invalidate();
  }

  delete(): void {
    const c = chars(this.text);
    // (delete_at(-1) when the cursor is at 0 removes the last character; update never calls it then)
    c.splice(this.cursor - 1 < 0 ? c.length - 1 : this.cursor - 1, 1);
    this._text = c.join("");
    this.cursor -= 1;
    this.frame = 0;
    this.changed = true;
    this.invalidate();
  }

  override update(): void {
    this.frame += 1;
    this.frame %= 20;
    this.changed = false;
    if ((this.frame % 10) === 0) this.invalidate();
    // Moving cursor
    if (KeyboardInput.triggerex("LEFT") || KeyboardInput.repeatex("LEFT")) {
      if (this.cursor > 0) {
        this.cursor -= 1;
        this.frame = 0;
        this.invalidate();
      }
      return;
    }
    if (KeyboardInput.triggerex("RIGHT") || KeyboardInput.repeatex("RIGHT")) {
      if (this.cursor < chars(this.text).length) {
        this.cursor += 1;
        this.frame = 0;
        this.invalidate();
      }
      return;
    }
    // Backspace
    if (KeyboardInput.triggerex("BACKSPACE") || KeyboardInput.repeatex("BACKSPACE") ||
        KeyboardInput.triggerex("DELETE") || KeyboardInput.repeatex("DELETE")) {
      if (this.cursor > 0) this.delete();
      return;
    }
    // Letter & Number keys
    for (const c of chars(KeyboardInput.gets())) this.insert(c);
  }

  override refresh(): Rect {
    const bitmap = this.bitmap!;
    let x = this.x;
    const y = this.y;
    let width = this.width;
    const height = this.height;
    const color = new Color(120, 120, 120);
    bitmap.font.color = color;
    bitmap.fillRect(x, y, width, height, new Color(0, 0, 0, 0));
    const size = bitmap.textSize(this.label).width;
    shadowtext(bitmap, x, y, size, height, this.label);
    x += size;
    width -= size;
    bitmap.fillRect(x + 1, y + 1, width - 2, height - 2, color);
    const ret = new Rect(x + 1, y + 1, width - 2, height - 2);
    if (this.captured) {
      bitmap.fillRect(x + 2, y + 2, width - 4, height - 4, new Color(120, 120, 120, 80));
    } else {
      bitmap.fillRect(x + 2, y + 2, width - 4, height - 4, new Color(0, 0, 0, 0));
    }
    x += 4;
    const textscan = chars(this.text);
    const scanlength = textscan.length;
    if (this.cursor > scanlength) this.cursor = scanlength;
    if (this.cursor < 0) this.cursor = 0;
    let startpos = this.cursor;
    let fromcursor = 0;
    while (startpos > 0) {
      const c = textscan[startpos - 1]!;
      fromcursor += bitmap.textSize(c).width;
      if (fromcursor > width - 4) break;
      startpos -= 1;
    }
    for (let i = startpos; i < scanlength; i++) {
      const c = textscan[i]!;
      const textwidth = bitmap.textSize(c).width;
      if (c === "\n") continue;
      // Draw text
      shadowtext(bitmap, x, y, textwidth + 4, 32, c);
      // Draw cursor if necessary
      if ((Math.floor(this.frame / 10) & 1) === 0 && i === this.cursor) {
        bitmap.fillRect(x, y + 4, 2, 24, new Color(120, 120, 120));
      }
      // Add x to drawn text width
      x += textwidth;
    }
    if ((Math.floor(this.frame / 10) & 1) === 0 && textscan.length === this.cursor) {
      bitmap.fillRect(x, y + 4, 2, 24, new Color(120, 120, 120));
    }
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
/** The slider-like controls ControlWindow#value reads. */
export interface ValueControl {
  readonly curvalue: unknown;
}

export class Slider extends UIControl {
  protected _minvalue: RNum | null;
  protected _maxvalue: RNum | null;
  protected _curvalue: RNum;
  protected leftarrow = new Rect(0, 0, 0, 0);
  protected rightarrow = new Rect(0, 0, 0, 0);

  get curvalue(): RNum { return this._curvalue; }
  set curvalue(value: RNum) {
    this._curvalue = value;
    this.clamp();
    this.invalidate();
  }

  get minvalue(): RNum | null { return this._minvalue; }
  set minvalue(value: RNum | null) {
    this._minvalue = value;
    this.clamp();
    this.invalidate();
  }

  get maxvalue(): RNum | null { return this._maxvalue; }
  set maxvalue(value: RNum | null) {
    this._maxvalue = value;
    this.clamp();
    this.invalidate();
  }

  private clamp(): void {
    if (this.minvalue != null && Number(this._curvalue) < Number(this.minvalue)) this._curvalue = this.minvalue;
    if (this.maxvalue != null && Number(this._curvalue) > Number(this.maxvalue)) this._curvalue = this.maxvalue;
  }

  constructor(label: string, minvalue: RNum, maxvalue: RNum, curval: RNum) {
    super(label);
    this._minvalue = minvalue;
    this._maxvalue = maxvalue;
    this._curvalue = curval;
    this.label = label;
    this.minvalue = minvalue;
    this.maxvalue = maxvalue;
    this.curvalue = curval;
  }

  override update(): void {
    const mousepos = getMousePos();
    this.changed = false;
    if (Number(this.minvalue) < Number(this.maxvalue) && Number(this.curvalue) < Number(this.minvalue)) {
      this.curvalue = this.minvalue!;
    }
    if (this.disabled) return;
    if (!Input.repeat(Input.MOUSELEFT)) return;
    if (!mousepos) return;
    const left = this.toAbsoluteRect(this.leftarrow);
    const right = this.toAbsoluteRect(this.rightarrow);
    const oldvalue = this.curvalue;
    const repeattime = mouseHeldMs();
    // Left arrow
    if (rectContains(left, mousepos[0], mousepos[1])) {
      if (repeattime > 2500) {
        this.curvalue = rSub(this.curvalue, 10);
      } else if (repeattime > 1250) {
        this.curvalue = rSub(this.curvalue, 5);
      } else {
        this.curvalue = rSub(this.curvalue, 1);
      }
      this.curvalue = Math.floor(Number(this.curvalue));
      this.changed = (Number(this.curvalue) !== Number(oldvalue));
      this.invalidate();
    }
    // Right arrow
    if (rectContains(right, mousepos[0], mousepos[1])) {
      if (repeattime > 2500) {
        this.curvalue = rAdd(this.curvalue, 10);
      } else if (repeattime > 1250) {
        this.curvalue = rAdd(this.curvalue, 5);
      } else {
        this.curvalue = rAdd(this.curvalue, 1);
      }
      this.curvalue = Math.floor(Number(this.curvalue));
      this.changed = (Number(this.curvalue) !== Number(oldvalue));
      this.invalidate();
    }
  }

  override refresh(): void {
    const bitmap = this.bitmap!;
    let x = this.x;
    const y = this.y;
    const width = this.width;
    const height = this.height;
    const color = new Color(120, 120, 120);
    bitmap.fillRect(x, y, width, height, new Color(0, 0, 0, 0));
    const size = bitmap.textSize(this.label).width;
    const leftarrows = bitmap.textSize(_INTL(" << "));
    const numbers = bitmap.textSize(" XXXX ").width;
    const rightarrows = bitmap.textSize(_INTL(" >> "));
    bitmap.font.color = color;
    shadowtext(bitmap, x, y, size, height, this.label);
    x += size;
    shadowtext(bitmap, x, y, leftarrows.width, height, _INTL(" << "),
      this.disabled || Number(this.curvalue) === Number(this.minvalue));
    this.leftarrow = new Rect(x, y, leftarrows.width, height);
    x += leftarrows.width;
    if (!this.disabled) {
      bitmap.font.color = color;
      shadowtext(bitmap, x, y, numbers, height, ` ${this.curvalue} `, false, 1);
    }
    x += numbers;
    shadowtext(bitmap, x, y, rightarrows.width, height, _INTL(" >> "),
      this.disabled || Number(this.curvalue) === Number(this.maxvalue));
    this.rightarrow = new Rect(x, y, rightarrows.width, height);
  }
}

//===============================================================================
//
//===============================================================================
/**
 * OptionalSlider < Slider in Ruby, but its initialize never calls super: it's
 * only a wrapper around a Slider and a Checkbox. Here it extends UIControl so
 * Slider's constructor doesn't run the overridden setters below.
 */
export class OptionalSlider extends UIControl implements ValueControl {
  private slider: Slider;
  private checkbox: Checkbox;

  constructor(label: string, minvalue: RNum, maxvalue: RNum, curvalue: RNum) {
    super(label);
    this.slider = new Slider(label, minvalue, maxvalue, curvalue);
    this.checkbox = new Checkbox("");
  }

  get curvalue(): RNum | null {
    return this.checkbox.checked ? this.slider.curvalue : null;
  }
  set curvalue(_value: RNum | null) {
    // NOTE (Ruby parity): `slider.curvalue = value` calls an undefined `slider`
    // (NameError; 002_AnimEditor_ControlsButtons.rb:469). Nothing calls it.
    throw new ReferenceError("undefined local variable or method `slider' for OptionalSlider");
  }

  get checked(): boolean { return this.checkbox.checked; }
  set checked(value: boolean) { this.checkbox.checked = value; }

  override invalid(): boolean {
    return this.slider.invalid() || this.checkbox.invalid();
  }

  override invalidate(): void {
    this.slider?.invalidate();
    this.checkbox?.invalidate();
  }

  /**
   * NOTE (Ruby parity): defined as `validate?` (002_AnimEditor_ControlsButtons.rb:489),
   * so repaint's `validate` is UIControl's and the slider and checkbox stay
   * invalid: the control is redrawn every frame.
   */
  validateQ(): void {
    this.slider.validate();
    this.checkbox.validate();
  }

  // (`changed` is a method here; UIControl's attribute is never set for this control.)
  override get changed(): boolean { return this.slider?.changed || this.checkbox?.changed; }
  override set changed(_value: boolean) {}

  get minvalue(): RNum | null { return this.slider.minvalue; }
  set minvalue(_value: RNum | null) {
    // NOTE (Ruby parity): undefined `slider` (NameError; 002_AnimEditor_ControlsButtons.rb:503).
    throw new ReferenceError("undefined local variable or method `slider' for OptionalSlider");
  }

  get maxvalue(): RNum | null { return this.slider.maxvalue; }
  set maxvalue(_value: RNum | null) {
    // NOTE (Ruby parity): undefined `slider` (NameError; 002_AnimEditor_ControlsButtons.rb:511).
    throw new ReferenceError("undefined local variable or method `slider' for OptionalSlider");
  }

  override update(): void {
    this.updatedefs();
    this.slider.update();
    this.checkbox.update();
  }

  override refresh(): void {
    this.updatedefs();
    this.slider.refresh();
    this.checkbox.refresh();
  }

  private updatedefs(): void {
    const checkboxwidth = 32;
    this.slider.bitmap = this.bitmap;
    this.slider.parent = this.parent;
    this.checkbox.x = this.x;
    this.checkbox.y = this.y;
    this.checkbox.width = checkboxwidth;
    this.checkbox.height = this.height;
    this.checkbox.bitmap = this.bitmap;
    this.checkbox.parent = this.parent;
    this.slider.x = this.x + checkboxwidth + 4;
    this.slider.y = this.y;
    this.slider.width = this.width - checkboxwidth;
    this.slider.height = this.height;
    this.slider.disabled = !this.checkbox.checked;
  }
}

//===============================================================================
//
//===============================================================================
/** Unused in Essentials. */
export class ArrayCountSlider extends Slider {
  private array!: unknown[];

  override get maxvalue(): RNum | null { return this.array ? this.array.length - 1 : this._maxvalue; }
  override set maxvalue(value: RNum | null) { super.maxvalue = value; }

  constructor(array: unknown[], label: string) {
    super(label, 0, 0, 0);
    this.array = array;
    // NOTE (Ruby parity): `super(label, 0, canvas.animation.length - 1, 0)`
    // reads an undefined `canvas` (NameError; 002_AnimEditor_ControlsButtons.rb:555).
    throw new ReferenceError("undefined local variable or method `canvas' for ArrayCountSlider");
  }
}

/** What the frame controls read from the canvas. */
interface CanvasLike {
  animation: { length: number };
}

export class FrameCountSlider extends Slider {
  private canvas!: CanvasLike;

  // (@canvas is set before super in Ruby; until then this reads the stored value.)
  override get maxvalue(): RNum | null { return this.canvas ? this.canvas.animation.length : this._maxvalue; }
  override set maxvalue(value: RNum | null) { super.maxvalue = value; }

  constructor(canvas: CanvasLike) {
    super(_INTL("Frame:"), 1, canvas.animation.length, 0);
    this.canvas = canvas;
  }
}

export class FrameCountButton extends Button {
  private canvas!: CanvasLike;

  override get label(): string {
    return this.canvas ? _INTL("Total Frames: {1}", this.canvas.animation.length) : "";
  }
  override set label(_value: string) {}

  constructor(canvas: CanvasLike) {
    super(_INTL("Total Frames: {1}", canvas.animation.length));
    this.canvas = canvas;
  }
}

//===============================================================================
//
//===============================================================================
export class TextSlider extends UIControl {
  protected _minvalue: number;
  protected _maxvalue: number;
  protected _curvalue: number;
  options: string[];
  maxoptionwidth: number | null = null;
  protected leftarrow = new Rect(0, 0, 0, 0);
  protected rightarrow = new Rect(0, 0, 0, 0);

  get curvalue(): number { return this._curvalue; }
  set curvalue(value: number) {
    this._curvalue = value;
    this.clamp();
    this.invalidate();
  }

  get minvalue(): number { return this._minvalue; }
  set minvalue(value: number) {
    this._minvalue = value;
    this.clamp();
    this.invalidate();
  }

  get maxvalue(): number { return this._maxvalue; }
  set maxvalue(value: number) {
    this._maxvalue = value;
    this.clamp();
    this.invalidate();
  }

  private clamp(): void {
    if (this.minvalue != null && this._curvalue < this.minvalue) this._curvalue = this.minvalue;
    if (this.maxvalue != null && this._curvalue > this.maxvalue) this._curvalue = this.maxvalue;
  }

  constructor(label: string, options: string[], curval: number) {
    super(label);
    this.label = label;
    this.options = options;
    this._minvalue = 0;
    this._maxvalue = options.length - 1;
    this._curvalue = curval;
    this.minvalue = this._minvalue;
    this.maxvalue = this._maxvalue;
    this.curvalue = this._curvalue;
  }

  override update(): void {
    const mousepos = getMousePos();
    this.changed = false;
    if (this.minvalue < this.maxvalue && this.curvalue < this.minvalue) {
      this.curvalue = this.minvalue;
    }
    if (this.disabled) return;
    if (!Input.repeat(Input.MOUSELEFT)) return;
    if (!mousepos) return;
    const left = this.toAbsoluteRect(this.leftarrow);
    const right = this.toAbsoluteRect(this.rightarrow);
    const oldvalue = this.curvalue;
    const repeattime = mouseHeldMs();
    // Left arrow
    if (rectContains(left, mousepos[0], mousepos[1])) {
      if (repeattime > 2500) {
        this.curvalue -= 10;
      } else if (repeattime > 1250) {
        this.curvalue -= 5;
      } else {
        this.curvalue -= 1;
      }
      this.changed = (this.curvalue !== oldvalue);
      this.invalidate();
    }
    // Right arrow
    if (rectContains(right, mousepos[0], mousepos[1])) {
      if (repeattime > 2500) {
        this.curvalue += 10;
      } else if (repeattime > 1250) {
        this.curvalue += 5;
      } else {
        this.curvalue += 1;
      }
      this.changed = (this.curvalue !== oldvalue);
      this.invalidate();
    }
  }

  override refresh(): void {
    const bitmap = this.bitmap!;
    if (this.maxoptionwidth == null) {
      for (let i = 0; i < this.options.length; i++) {
        const w = this.bitmap!.textSize(" " + this.options[i] + " ").width;
        if (this.maxoptionwidth == null || this.maxoptionwidth < w) this.maxoptionwidth = w;
      }
    }
    let x = this.x;
    const y = this.y;
    const width = this.width;
    const height = this.height;
    const color = new Color(120, 120, 120);
    bitmap.fillRect(x, y, width, height, new Color(0, 0, 0, 0));
    const size = bitmap.textSize(this.label).width;
    const leftarrows = bitmap.textSize(_INTL(" << "));
    const rightarrows = bitmap.textSize(_INTL(" >> "));
    bitmap.font.color = color;
    shadowtext(bitmap, x, y, size, height, this.label);
    x += size;
    shadowtext(bitmap, x, y, leftarrows.width, height, _INTL(" << "),
      this.disabled || this.curvalue === this.minvalue);
    this.leftarrow = new Rect(x, y, leftarrows.width, height);
    x += leftarrows.width;
    if (!this.disabled) {
      bitmap.font.color = color;
      shadowtext(bitmap, x, y, this.maxoptionwidth!, height, ` ${this.options[this.curvalue]} `, false, 1);
    }
    x += this.maxoptionwidth!;
    shadowtext(bitmap, x, y, rightarrows.width, height, _INTL(" >> "),
      this.disabled || this.curvalue === this.maxvalue);
    this.rightarrow = new Rect(x, y, rightarrows.width, height);
  }
}

//===============================================================================
//
//===============================================================================
/** OptionalTextSlider < TextSlider in Ruby, never calling super (see OptionalSlider). */
export class OptionalTextSlider extends UIControl implements ValueControl {
  private slider: TextSlider;
  private checkbox: Checkbox;

  constructor(label: string, options: string[], curval: number) {
    super(label);
    this.slider = new TextSlider(label, options, curval);
    this.checkbox = new Checkbox("");
  }

  get curvalue(): number | null {
    return this.checkbox.checked ? this.slider.curvalue : null;
  }
  set curvalue(_value: number | null) {
    // NOTE (Ruby parity): undefined `slider` (NameError; 002_AnimEditor_ControlsButtons.rb:717).
    throw new ReferenceError("undefined local variable or method `slider' for OptionalTextSlider");
  }

  get checked(): boolean { return this.checkbox.checked; }
  set checked(value: boolean) { this.checkbox.checked = value; }

  override invalid(): boolean {
    return this.slider.invalid() || this.checkbox.invalid();
  }

  override invalidate(): void {
    this.slider?.invalidate();
    this.checkbox?.invalidate();
  }

  /** NOTE (Ruby parity): `validate?` (002_AnimEditor_ControlsButtons.rb:737), as in OptionalSlider. */
  validateQ(): void {
    this.slider.validate();
    this.checkbox.validate();
  }

  override get changed(): boolean { return this.slider?.changed || this.checkbox?.changed; }
  override set changed(_value: boolean) {}

  get minvalue(): number { return this.slider.minvalue; }
  set minvalue(_value: number) {
    // NOTE (Ruby parity): undefined `slider` (NameError; 002_AnimEditor_ControlsButtons.rb:751).
    throw new ReferenceError("undefined local variable or method `slider' for OptionalTextSlider");
  }

  get maxvalue(): number { return this.slider.maxvalue; }
  set maxvalue(_value: number) {
    // NOTE (Ruby parity): undefined `slider` (NameError; 002_AnimEditor_ControlsButtons.rb:759).
    throw new ReferenceError("undefined local variable or method `slider' for OptionalTextSlider");
  }

  override update(): void {
    this.updatedefs();
    this.slider.update();
    this.checkbox.update();
  }

  override refresh(): void {
    this.updatedefs();
    this.slider.refresh();
    this.checkbox.refresh();
  }

  private updatedefs(): void {
    const checkboxwidth = 32;
    this.slider.bitmap = this.bitmap;
    this.slider.parent = this.parent;
    this.checkbox.x = this.x;
    this.checkbox.y = this.y;
    this.checkbox.width = checkboxwidth;
    this.checkbox.height = this.height;
    this.checkbox.bitmap = this.bitmap;
    this.checkbox.parent = this.parent;
    this.slider.x = this.x + checkboxwidth + 4;
    this.slider.y = this.y;
    this.slider.width = this.width - checkboxwidth;
    this.slider.height = this.height;
    this.slider.disabled = !this.checkbox.checked;
  }
}

//===============================================================================
//
//===============================================================================
export class ControlWindow extends SpriteWindow_Base {
  readonly controls: UIControl[] = [];

  constructor(x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
    this.contents = new Bitmap(width - 32, height - 32);
    pbSetNarrowFont(this.contents);
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this.contents?.dispose();
    super.dispose();
  }

  override refresh(): void {
    for (const ctrl of this.controls ?? []) ctrl.refresh();
  }

  repaint(): void {
    for (const ctrl of this.controls) ctrl.repaint();
  }

  invalidate(): void {
    for (const ctrl of this.controls) ctrl.invalidate();
  }

  /** hittest?(i) */
  hittest(i: number): boolean {
    const mousepos = getMousePos();
    if (!mousepos) return false;
    if (i < 0 || i >= this.controls.length) return false;
    const rc = new Rect(this.controls[i]!.parentX(), this.controls[i]!.parentY(),
      this.controls[i]!.width, this.controls[i]!.height);
    return rectContains(rc, mousepos[0], mousepos[1]);
  }

  addControl(control: UIControl): number {
    const i = this.controls.length;
    this.controls[i] = control;
    this.controls[i]!.x = 0;
    this.controls[i]!.y = i * 32;
    this.controls[i]!.width = this.contents!.width;
    this.controls[i]!.height = 32;
    this.controls[i]!.parent = this;
    this.controls[i]!.bitmap = this.contents;
    this.controls[i]!.invalidate();
    this.refresh();
    return i;
  }

  addLabel(label: string): number {
    return this.addControl(new Label(label));
  }

  addButton(label: string): number {
    return this.addControl(new Button(label));
  }

  addSlider(label: string, minvalue: RNum, maxvalue: RNum, curvalue: RNum): number {
    return this.addControl(new Slider(label, minvalue, maxvalue, curvalue));
  }

  addOptionalSlider(label: string, minvalue: RNum, maxvalue: RNum, curvalue: RNum): number {
    return this.addControl(new OptionalSlider(label, minvalue, maxvalue, curvalue));
  }

  addTextSlider(label: string, options: string[], curvalue: number): number {
    return this.addControl(new TextSlider(label, options, curvalue));
  }

  addOptionalTextSlider(label: string, options: string[], curvalue: number): number {
    return this.addControl(new OptionalTextSlider(label, options, curvalue));
  }

  addCheckbox(label: string): number {
    return this.addControl(new Checkbox(label));
  }

  addSpace(): number {
    return this.addControl(new UIControl(""));
  }

  override update(): void {
    super.update();
    for (const ctrl of this.controls) ctrl.update();
    this.repaint();
  }

  /** changed?(i) */
  isChanged(i: number): boolean {
    if (i < 0) return false;
    return this.controls[i]!.changed;
  }

  /** value(i): the control's curvalue (a number, a Checkbox's boolean, an optional control's nil). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value(i: number): any {
    if (i < 0) return false;
    return (this.controls[i] as unknown as ValueControl).curvalue;
  }
}
