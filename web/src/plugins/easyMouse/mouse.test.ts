// Easy Mouse System (Mouse.ts) against the plugin's Ruby: replays
// easyMouseReference.json (web/tools/ruby-ref/easy_mouse_reference.rb).
// Input is replaced by the same scripted mkxp-z state the harness uses (mouse
// position, in-window flag, the left button's held microseconds), and the
// objects are the harness's: a plain sprite, a zoomed sprite with an origin in
// a viewport over a checkerboard bitmap, a sprite with a cropped src_rect, a
// Rect and the Viewport.
import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { Bitmap } from "../../rgss/Bitmap";
import { attachStage, Viewport } from "../../rgss/display";
import { Color, Rect } from "../../rgss/types";
import ref from "./easyMouseReference.json";

const state = { x: 0, y: 0, inWindow: false, held: 0 };
const hooks: (() => void)[] = [];
vi.mock("../../rgss/Input", () => ({
  Input: {
    MOUSELEFT: 38, MOUSEMIDDLE: 39, MOUSERIGHT: 40,
    get mouseX() { return state.x; },
    get mouseY() { return state.y; },
    get mouseInWindow() { return state.inWindow; },
    press: (b: number) => b === 38 && state.held > 0,
    time: (b: number) => (b === 38 ? state.held : 0),
    addUpdateHook: (h: () => void) => hooks.push(h),
    update: () => { for (const h of hooks) h(); },
  },
}));

const { Mouse } = await import("./Mouse");
const { Input } = await import("../../rgss/Input");

/** A Bitmap of the given size without a canvas; opaque(x, y) decides each pixel's alpha. */
function fakeBitmap(w: number, h: number, opaque: ((x: number, y: number) => boolean) | null = null): Bitmap {
  const b = Object.create(Bitmap.prototype) as Bitmap;
  Object.defineProperty(b, "width", { get: () => w });
  Object.defineProperty(b, "height", { get: () => h });
  b.getPixel = (x: number, y: number) => new Color(0, 0, 0, (!opaque || opaque(x, y)) && x >= 0 && y >= 0 && x < w && y < h ? 255 : 0);
  return b;
}

function sprite(bitmap: Bitmap, viewport: Viewport | null = null) {
  return { x: 0, y: 0, ox: 0, oy: 0, zoomX: 1, zoomY: 1, bitmap, srcRect: new Rect(0, 0, bitmap.width, bitmap.height), viewport };
}

describe("Easy Mouse System vs Ruby", () => {
  it("replays the scripted steps", () => {
    attachStage(new Container());
    const vp = new Viewport(16, 8, 200, 100);
    const plain = sprite(fakeBitmap(40, 30));
    plain.x = 50; plain.y = 40;
    const zoomed = sprite(fakeBitmap(20, 20, (x, y) => (x + y) % 2 === 0), vp);
    Object.assign(zoomed, { x: 30, y: 20, ox: 10, oy: 10, zoomX: 2, zoomY: 2 });
    const cropped = sprite(fakeBitmap(64, 64));
    cropped.srcRect = new Rect(0, 0, 32, 16);
    cropped.x = 200; cropped.y = 200;
    const area = new Rect(100, 100, 50, 50);
    const objects: Record<string, object> = { plain, zoomed, cropped, area, viewport: vp };
    Mouse.start();
    (ref.steps as [number, number, boolean, number][]).forEach(([mx, my, inWindow, held], i) => {
      Object.assign(state, { x: mx, y: my, inWindow, held });
      Input.update();
      const r = ref.out[i]!;
      const got = {
        x: Mouse.x, y: Mouse.y,
        params: Object.fromEntries(Object.entries(objects).map(([k, o]) => [k, Mouse.objectParams(o)])),
        over: Object.fromEntries(Object.entries(objects).map(([k, o]) => [k, Mouse.over(o)])),
        overPixel: { zoomed: Mouse.overPixel(zoomed), plain: Mouse.overPixel(plain) },
        overRect: Mouse.over(plain, new Rect(5, 5, 10, 10)),
        press: Mouse.press(plain),
        holdSym: Mouse.hold("left"),
        hold: Mouse.hold(cropped),
        clickPlain: Mouse.click(plain),
        clickAny: Mouse.click(),
        static: Mouse.static(),
      };
      expect(got, `step ${i}`).toEqual(r);
    });
  });
});
