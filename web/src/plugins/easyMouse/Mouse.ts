// Port of Plugins/Easy Mouse System/Script.rb (Luka S.J.) and the Mouse
// module of 001_Technical/004_Input.rb (Mouse.getMousePos).
//
// The plugin only adds the Mouse API; nothing in Essentials' menus reads it.
// In this game, Pokémon Amie is its user. mkxp-z's mouse (Input::MOUSELEFT…,
// Input.mouse_x/y, Input.time?, System.mouse_in_window) is in rgss/Input.ts.
//
// Ruby's duck typing (`respond_to?(:x)`, `is_a?(Bitmap)`) becomes property
// checks: anything with x/y (Sprite, Rect, a window) can be passed, and a
// Viewport is recognised by its `rect`.

import { Bitmap } from "../../rgss/Bitmap";
import { TICK_RATE } from "../../core/loop";
import { Input } from "../../rgss/Input";
import { Rect } from "../../rgss/types";
import { Viewport } from "../../rgss/display";

export type MouseButton = "left" | "right" | "middle";

/** What object_params reads; every field is optional, as with respond_to?. */
type MouseObject = object | null | undefined;

interface Duck {
  x?: number; y?: number; ox?: number; oy?: number; zoomX?: number; zoomY?: number;
  width?: number; height?: number; bitmap?: unknown; srcRect?: unknown; viewport?: unknown;
}

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

//==============================================================================
// 004_Input.rb
//==============================================================================
/** Mouse.getMousePos: the position relative to the game window, or null outside it. */
export function getMousePos(catchAnywhere = false): [number, number] | null {
  if (!Input.mouseInWindow && !catchAnywhere) return null;
  return [Input.mouseX, Input.mouseY];
}

//==============================================================================
// Easy Mouse System
//==============================================================================
export const Mouse = {
  //  amount of time needed to pass (in seconds) for the mouse to be considered
  //  inactive
  //  negative value means the mouse is always active
  INACTIVITY_TIMER: -1,

  // amount of time needed to pass (in seconds) before the release of a mouse click
  // until that click is considered invalid
  CLICK_TIMEOUT: 0.5,

  _x: null as number | null,
  _y: null as number | null,
  staticX: 0 as number | null,
  staticY: 0 as number | null,
  inactivityTimer: 0,
  inputMapTable: {} as Record<string, number>,
  hold_: 0,
  drag: null as [number, number] | object | null,
  objectX: 0,
  objectY: 0,
  objectOx: 0,
  objectOy: 0,
  rectX: null as number | null,
  rectY: null as number | null,

  //---------------------------------------------------------------------------
  //  sets up mouse variables initially
  //---------------------------------------------------------------------------
  start(): void {
    this.staticX = 0;
    this.staticY = 0;
    this.inactivityTimer = 0;
    this.inputMapTable = {
      left: Input.MOUSELEFT,
      right: Input.MOUSERIGHT,
      middle: Input.MOUSEMIDDLE,
    };
    this.hold_ = 0;
    this.drag = null;
    this.objectX = 0;
    this.objectY = 0;
    this.objectOx = 0;
    this.objectOy = 0;
    this.rectX = null;
    this.rectY = null;
  },

  //---------------------------------------------------------------------------
  //  safe input map function
  //---------------------------------------------------------------------------
  inputMap(button: MouseButton | string): number {
    return this.inputMapTable[button] ?? Input.MOUSELEFT;
  },

  //---------------------------------------------------------------------------
  //  returns current mouse X position
  //---------------------------------------------------------------------------
  get x(): number {
    return this._x ?? 0;
  },

  //---------------------------------------------------------------------------
  //  returns current mouse Y position
  //---------------------------------------------------------------------------
  get y(): number {
    return this._y ?? 0;
  },

  //---------------------------------------------------------------------------
  //  updates required mouse variables
  //---------------------------------------------------------------------------
  update(): void {
    // `@x, @y = getMousePos`: both nil outside the window.
    const pos = getMousePos();
    this._x = pos ? pos[0] : null;
    this._y = pos ? pos[1] : null;
    if (this.INACTIVITY_TIMER >= 0 && !this.static()) {
      this.inactivityTimer += 1;
    } else {
      this.inactivityTimer = 0;
    }
  },

  //---------------------------------------------------------------------------
  //  checks if mouse is not moving
  //---------------------------------------------------------------------------
  /** static? — note it also records the position, so each call compares with the previous call. */
  static(): boolean {
    if (!(this.staticX === this._x && this.staticY === this._y)) {
      this.staticX = this._x;
      this.staticY = this._y;
      return false;
    }
    return true;
  },

  //---------------------------------------------------------------------------
  //  checks if mouse input is currently active
  //---------------------------------------------------------------------------
  active(): boolean {
    if (this.INACTIVITY_TIMER < 0) return true;
    // NOTE (Ruby parity): Easy Mouse System/Script.rb:83 reads @inactive_timer
    // (never set, so nil > n raises NoMethodError). INACTIVITY_TIMER is -1
    // here, so the line is never reached; the port reads the real timer.
    // The timer counts Input updates (60 a second here, frame_rate in Ruby).
    if (this.inactivityTimer > this.INACTIVITY_TIMER * TICK_RATE) return false;
    return true;
  },

  //---------------------------------------------------------------------------
  //  analyzes given object and returns valid coordinates from it
  //---------------------------------------------------------------------------
  objectParams(object: MouseObject = null): [number, number, number, number] {
    if (!object) return [0, 0, 0, 0];
    if (object instanceof Viewport) return [object.rect.x, object.rect.y, object.rect.width, object.rect.height];
    const o = object as Duck;
    let ox = 0, oy = 0, ow = 0, oh = 0;
    const zx = num(o.zoomX) ?? 1;
    const zy = num(o.zoomY) ?? 1;
    if (num(o.x) !== undefined) ox = o.x! - (num(o.ox) ?? 0);
    if (num(o.y) !== undefined) oy = o.y! - (num(o.oy) ?? 0);
    if (o.bitmap instanceof Bitmap) {
      ow = o.bitmap.width * zx;
      oh = o.bitmap.height * zy;
    } else {
      if (num(o.width) !== undefined) ow = o.width! * zx;
      if (num(o.height) !== undefined) oh = o.height! * zy;
    }
    if (o.srcRect instanceof Rect) {
      // As in the plugin, the (unzoomed) src_rect size is compared with the zoomed size.
      if (o.srcRect.width !== ow) ow = o.srcRect.width * zx;
      if (o.srcRect.height !== oh) oh = o.srcRect.height * zy;
    }
    if (o.viewport instanceof Viewport) {
      ox += o.viewport.rect.x;
      oy += o.viewport.rect.y;
    }
    return [ox, oy, ow, oh];
  },

  //---------------------------------------------------------------------------
  //  checks if object is being dragged with mouse
  //---------------------------------------------------------------------------
  dragging(object: object, button: MouseButton = "left"): boolean {
    if (!(this.press(object, button) || (Input.press(this.inputMap(button)) && this.drag === object))) {
      this.drag = null;
      this.objectOx = 0;
      this.objectOy = 0;
      return false;
    }
    if (this.drag == null) this.drag = [this.x, this.y];
    if (Array.isArray(this.drag) && (this.drag[0] !== this.x || this.drag[1] !== this.y)) {
      const o = object as Duck;
      this.drag = object;
      this.objectOx = this.x - (o.x ?? 0);
      this.objectOy = this.y - (o.y ?? 0);
    }
    return true;
  },

  //---------------------------------------------------------------------------
  //  method to drag object using mouse
  //    - `lock` argument decides which axis to lock the dragging on
  //    - `rect` parameter creates a maximum dragging area
  //---------------------------------------------------------------------------
  dragObject(object: { x: number; y: number }, button: MouseButton = "left", rect: Rect | null = null,
             lock: "vertical" | "horizontal" | null = null): boolean | undefined {
    if (!(this.dragging(object, button) && this.drag === object)) return false;
    if (lock !== "vertical") object.x = this.x - this.objectOx;
    if (lock !== "horizontal") object.y = this.y - this.objectOy;
    if (rect instanceof Rect) {
      const [rx, ry, rw, rh] = this.objectParams(rect);
      const [, , ow, oh] = this.objectParams(object);
      if (object.x < rx && lock !== "vertical") object.x = rx;
      if (object.y < ry && lock !== "horizontal") object.y = ry;
      if (object.x > rx + rw - ow && lock !== "vertical") object.x = rx + rw - ow;
      if (object.y > ry + rh - oh && lock !== "horizontal") object.y = ry + rh - oh;
    }
    return undefined;
  },

  //---------------------------------------------------------------------------
  //  method to drag object only on the X axis
  //---------------------------------------------------------------------------
  dragObjectX(object: { x: number; y: number }, button: MouseButton = "left", rect: Rect | null = null) {
    return this.dragObject(object, button, rect, "horizontal");
  },

  //---------------------------------------------------------------------------
  //  method to drag object only on the Y axis
  //---------------------------------------------------------------------------
  dragObjectY(object: { x: number; y: number }, button: MouseButton = "left", rect: Rect | null = null) {
    return this.dragObject(object, button, rect, "vertical");
  },

  //---------------------------------------------------------------------------
  //  method to create a rectangle based on mouse click and drag
  //---------------------------------------------------------------------------
  createRect(button: MouseButton = "left", object: MouseObject = null): Rect {
    if (object && !this.over(object) && Input.press(this.inputMap(button)) && this.rectX == null) return new Rect(0, 0, 0, 0);
    if (Input.press(this.inputMap(button))) {
      if (this.rectX == null) this.rectX = this.x;
      if (this.rectY == null) this.rectY = this.y;
      let rx = this.x < this.rectX ? this.x : this.rectX;
      let ry = this.y < this.rectY ? this.y : this.rectY;
      const rw = this.x < this.rectX ? this.rectX - this.x : this.x - this.rectX;
      const rh = this.y < this.rectY ? this.rectY - this.y : this.y - this.rectY;
      if (object) {
        const [ox, oy] = this.objectParams(object);
        rx -= ox;
        ry -= oy;
      }
      return new Rect(rx, ry, rw, rh);
    }
    this.rectX = null;
    this.rectY = null;
    return new Rect(0, 0, 0, 0);
  },

  //---------------------------------------------------------------------------
  //  end user specific functions
  //---------------------------------------------------------------------------
  //  checks if mouse is currently hovering over an object with valid
  //  coordinate functionality
  //  can pass an additional `Rect.new` argument to offset the observed area
  //---------------------------------------------------------------------------
  over(object: MouseObject, rect: Rect | null = null): boolean {
    if (!(this.active() && object)) return false;
    let [ox, oy, ow, oh] = this.objectParams(object);
    if (rect instanceof Rect) {
      ox += rect.x;
      oy += rect.y;
      ow -= rect.width - rect.x;
      oh -= rect.height - rect.y;
    }
    return this.x >= ox && this.x <= ox + ow && this.y >= oy && this.y <= oy + oh;
  },

  //---------------------------------------------------------------------------
  //  checks if mouse is hovering over sprite pixel
  //---------------------------------------------------------------------------
  overPixel(object: MouseObject): boolean {
    const o = object as Duck | null | undefined;
    // `object.is_a?(Sprite) && object.bitmap.is_a?(Bitmap)`: any sprite-like object with a Bitmap.
    if (!(o && o.bitmap instanceof Bitmap)) return this.over(object);
    if (!this.over(object)) return false;
    const [ox, oy] = this.objectParams(object);
    const mx = this.x - ox;
    const my = this.y - oy;
    // Bitmap#get_pixel outside the bitmap is transparent.
    const bmp = o.bitmap;
    if (mx < 0 || my < 0 || mx >= bmp.width || my >= bmp.height) return false;
    return bmp.getPixel(Math.floor(mx), Math.floor(my)).alpha > 0;
  },

  //---------------------------------------------------------------------------
  //  checks if mouse is over specific area of the game window
  //---------------------------------------------------------------------------
  overArea(arx: number, ary: number, arw: number, arh: number): boolean {
    return this.over(new Rect(arx, ary, arw, arh));
  },

  //---------------------------------------------------------------------------
  //  check if mouse is being pressed and held down for a specific period of time
  //---------------------------------------------------------------------------
  /** hold?(object = nil, button = :left). Pass `null` for "anywhere". */
  hold(object: MouseObject | MouseButton = null, button: MouseButton = "left"): boolean {
    if (!this.press(object, button)) return false;
    return Input.time(this.inputMap(button)) > this.CLICK_TIMEOUT * 1000000;
  },

  //---------------------------------------------------------------------------
  //  check if mouse is pressing on object
  //---------------------------------------------------------------------------
  press(object: MouseObject | MouseButton = null, button: MouseButton = "left"): boolean {
    // A Symbol passed as the object (`Mouse.hold?(:left)`) has no coordinates:
    // object_params gives 0,0,0,0, so it's "over" only at pixel (0, 0).
    if (object && !this.over(typeof object === "string" ? {} : object)) return false;
    return Input.press(this.inputMap(button));
  },

  //---------------------------------------------------------------------------
  //  check if mouse is clicking on object
  //---------------------------------------------------------------------------
  /**
   * click?: true on the update after the button is released, when it was held
   * for at most CLICK_TIMEOUT. The held time is shared by every click? call
   * (one @hold), as in the plugin.
   */
  click(object: MouseObject = null, button: MouseButton = "left"): boolean {
    if (object && !this.over(object)) return false;
    if (!Input.press(this.inputMap(button)) && this.hold_ >= 1 && this.hold_ <= this.CLICK_TIMEOUT * 1000000) {
      // `return @hold = 0 || true`: sets @hold to 0 and returns 0 (truthy).
      this.hold_ = 0;
      return true;
    }
    this.hold_ = Input.time(this.inputMap(button));
    return false;
  },
};

//===============================================================================
//  Input module override for mouse update
//===============================================================================
Input.addUpdateHook(() => Mouse.update());

//===============================================================================
//  start the mouse
//===============================================================================
Mouse.start();
