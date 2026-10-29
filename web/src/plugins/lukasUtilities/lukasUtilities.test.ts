// Replays tools/ruby-ref/lukas_utilities_reference.rb (the real Plugins/Luka's
// Scripting Utilities/script.rb run headless on system Ruby over the
// Essentials scripts) against the TypeScript port. Randomness is a queue of
// raw numbers (rand(n) = raw % n) recorded by the harness. Bitmaps draw on a
// pixel-array OffscreenCanvas stand-in (no blending; drawImage copies), which
// is all the compared pixel functions need.

import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import ref from "./lukasUtilitiesReference.json";

const rnd = vi.hoisted(() => ({ rolls: [] as number[] }));
vi.mock("../../core/random", () => ({
  rand: (n: number) => {
    if (rnd.rolls.length === 0) throw new Error("out of scripted rolls");
    if (!(n > 0)) throw new Error(`unexpected rand(${n})`);
    return rnd.rolls.shift()! % n;
  },
  random: () => 0.5,
  seedRandom: () => {},
}));
const logs = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("../../debug/devFiles", () => ({
  DevFiles: { available: async () => true, write: async (_p: string, line: string) => void logs.lines.push(line) },
}));
vi.mock("../../ui/rpgCache", async () => {
  const { Bitmap } = await import("../../rgss/Bitmap");
  const sizes: Record<string, [number, number]> = { "Graphics/Pictures/sel": [16, 12], "img/window001.png": [48, 48] };
  return {
    RPGCache: { loadBitmap: (dir: string, file = "") => (sizes[dir + file] ? new Bitmap(...sizes[dir + file]!) : null) },
    pbResolveBitmap: (p: string | null) => p,
    preloadBitmaps: async () => {},
  };
});

// A 2D canvas over a plain RGBA array.
class PixelCanvas {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  getContext() {
    const c = this;
    const put = (x: number, y: number, px: ArrayLike<number>, o: number) => {
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
      const i = (y * c.width + x) * 4;
      for (let k = 0; k < 4; k++) c.data[i + k] = px[o + k]!;
    };
    return {
      canvas: c,
      fillStyle: "",
      globalAlpha: 1,
      imageSmoothingEnabled: false,
      clearRect(x: number, y: number, w: number, h: number) {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, [0, 0, 0, 0], 0);
      },
      fillRect(x: number, y: number, w: number, h: number) {
        const m = /rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/.exec(this.fillStyle)!;
        const px = [+m[1]!, +m[2]!, +m[3]!, Math.round(+m[4]! * 255)];
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, px, 0);
      },
      createImageData(w: number, h: number) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      getImageData(x: number, y: number, w: number, h: number) {
        const img = this.createImageData(w, h);
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            const sx = x + xx, sy = y + yy;
            if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
            img.data.set(c.data.subarray((sy * c.width + sx) * 4, (sy * c.width + sx) * 4 + 4), (yy * w + xx) * 4);
          }
        }
        return img;
      },
      putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) {
        for (let yy = 0; yy < img.height; yy++) for (let xx = 0; xx < img.width; xx++) put(x + xx, y + yy, img.data, (yy * img.width + xx) * 4);
      },
      drawImage(src: PixelCanvas, ...a: number[]) {
        const [sx, sy, sw, sh, dx, dy] = a.length === 2 ? [0, 0, src.width, src.height, a[0]!, a[1]!] : a;
        for (let yy = 0; yy < sh!; yy++) for (let xx = 0; xx < sw!; xx++) {
          const X = sx! + xx, Y = sy! + yy;
          if (X >= 0 && Y >= 0 && X < src.width && Y < src.height) put(dx! + xx, dy! + yy, src.data, (Y * src.width + X) * 4);
        }
      },
    };
  }
}
(globalThis as Record<string, unknown>).OffscreenCanvas = PixelCanvas;

const { attachStage, Sprite } = await import("../../rgss/display");
const { Bitmap } = await import("../../rgss/Bitmap");
const { Color, Rect, Tone } = await import("../../rgss/types");
const L = await import("./index");
const { strToF, strToI } = await import("./rubyHelpers");
attachStage(new Container());

type Px = number[][];
function errorOf(fn: () => unknown): { class: string; message: string } | null {
  try {
    fn();
    return null;
  } catch (e) {
    const err = e as Error & { rubyClass?: string };
    return { class: err.rubyClass ?? err.name, message: err.message.split("\n")[0]!.replace(/ for #<.*>$/, "") };
  }
}
function resultOf(fn: () => unknown): { value?: unknown; error?: unknown } {
  let value: unknown;
  const error = errorOf(() => (value = fn()));
  return error ? { error } : { value };
}
const col = (c: unknown) => (c instanceof Color ? [c.red, c.green, c.blue, c.alpha] : c);
function bmpFrom(w: number, h: number, px: Px) {
  const b = new Bitmap(w, h);
  b.ctx.putImageData({ width: w, height: h, data: new Uint8ClampedArray(px.flat()) } as ImageData, 0, 0);
  return b;
}
function pixels(b: InstanceType<typeof Bitmap>): Px {
  const d = b.ctx.getImageData(0, 0, b.width, b.height).data;
  const out: Px = [];
  for (let i = 0; i < d.length; i += 4) out.push([d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!]);
  return out;
}
function spriteWith(b: InstanceType<typeof Bitmap> | null) {
  const s = new Sprite();
  L.assignBitmap(s, b);
  return s;
}
type Op = [string, ...unknown[]];
const blts = (ops: Op[]) => ops.filter((o) => o[0] === "blt");

describe("Numeric, String, Array, Hash", () => {
  it("delta at 40 and 60 fps", () => {
    for (const d of ref.delta) expect(L.delta(d.v, d.type, d.round, d.fr)).toBeCloseTo(d.out, 12);
  });
  it("Numeric#round override never runs (Ruby's own rounding)", () => {
    expect(ref.round).toEqual([2.57, 5, 3, -3, 1200]);
  });
  it("is_numeric?, to_i, to_f", () => {
    for (const s of ref.strings) {
      expect([s.s, L.isNumeric(s.s), strToI(s.s), strToF(s.s), Object.is(strToF(s.s), -0)]).toEqual([s.s, s.numeric, s.to_i, s.to_f, s.neg0]);
    }
    expect(L.stringBytes("héllo~")).toEqual(ref.bytes);
  });
  it("swap_at, to_last, string_include?", () => {
    for (const c of ref.swap_at) {
      const arr = structuredClone(c.arr) as unknown[];
      const e = errorOf(() => L.swapAt(arr, c.i, c.j));
      expect([arr, e]).toEqual([c.out, c.error]);
    }
    for (const c of ref.to_last) expect(L.toLast([...c.arr] as number[], c.v)).toEqual(c.out);
    for (const c of ref.string_include) expect(L.stringInclude(c.arr as unknown[], c.v)).toBe(c.out);
  });
  it("has_key?, try_key?, get_key, deep_merge(!)", () => {
    const h = { a: 1, b: null, c: false, d: 0 };
    for (const [keys, out] of ref.hash.has_key) expect(L.hasKey(h, ...(keys as string[]))).toBe(out);
    for (const [keys, out] of ref.hash.try_key) expect(L.tryKey(h, ...(keys as string[]))).toBe(out);
    for (const [key, out] of ref.hash.get_key) expect(L.getKey(h, key as string)).toEqual(out);
    for (const c of ref.deep_merge) {
      const bang = structuredClone(c.a) as Record<string, unknown>;
      L.deepMergeBang(bang, c.b);
      expect(bang).toEqual(c.bang);
      expect(resultOf(() => L.deepMerge(structuredClone(c.a) as Record<string, unknown>, structuredClone(c.b)))).toEqual(c.merge);
    }
  });
});

describe("Color and Tone", () => {
  it("Color.new", () => {
    for (const c of ref.color_new) {
      // [1, 2]: the harness's stand-in Color accepts 2 arguments; mkxp-z's raises ArgumentError.
      if (c.args.length === 2) continue;
      expect([c.args, resultOf(() => col(L.colorNew(...c.args)))]).toEqual([c.args, c.out]);
    }
    expect(errorOf(() => L.colorNew(1, 2))?.class).toBe("ArgumentError");
  });
  it("to_hex, to_dec, to_i, darken, to_rgb, from_i, parse, named colours", () => {
    for (const c of ref.color_methods) {
      const color = new Color(...(c.c as [number, number, number, number]));
      expect([L.colorToHex(color), L.colorToDec(color), L.colorToI(color), col(L.colorDarken(color)), col(L.colorDarken(color, 0.5))]).toEqual([c.hex, c.dec, c.i, c.darken, c.darken5]);
    }
    for (const c of ref.to_rgb) expect(resultOf(() => L.colorToRgb(null, c.v))).toEqual(c.out);
    expect(errorOf(() => L.colorFromI(5))).toEqual(ref.from_i);
    for (const c of ref.parse) expect(resultOf(() => col(L.colorParse(c.sym ? Symbol("sym") : c.v)))).toEqual(c.out);
    expect(col(L.colorParse(new Color(1, 2, 3)))).toEqual(ref.parse_color);
    for (const [name, c] of ref.named) expect(col(L.Colors[name as keyof typeof L.Colors]())).toEqual(c);
  });
  it("Tone#all", () => {
    const t = new Tone(10, 20, 31);
    const all1 = L.toneAll(t);
    L.setToneAll(t, -40);
    expect({ all: all1, after: [t.red, t.green, t.blue, t.gray], all2: L.toneAll(t) }).toEqual(ref.tone);
  });
});

describe("globals", () => {
  it("getPolygonPoints", () => {
    for (const c of ref.polygon) {
      const pts = L.getPolygonPoints(...(c.args as [number]));
      expect(pts.length).toBe(c.out.length);
      pts.forEach((p, i) => {
        expect(p[0]).toBeCloseTo(c.out[i]![0]!, 9);
        expect(p[1]).toBeCloseTo(c.out[i]![1]!, 9);
      });
    }
  });
  it("randCircleCord", () => {
    for (const c of ref.circle) {
      rnd.rolls = [...c.rolls];
      expect(L.randCircleCord(c.args[0]!, c.args[1] ?? null)).toEqual(c.out);
    }
  });
});

describe("Env, ErrorLogger, CallbackWrapper", () => {
  it("char_esc / char_dsc / guid_to_hex / path / directory", () => {
    for (const c of ref.char) expect([L.Env.charEsc(c.s), L.Env.charDsc(L.Env.charEsc(c.s)), L.Env.charDsc(c.s)]).toEqual([c.esc, c.dsc, c.dsc_raw]);
    for (const [k, hex] of ref.guid) expect(L.Env.guidToHex(L.COMMON_PATHS[k as string]!)).toEqual(hex);
    expect([errorOf(() => L.Env.path("DESKTOP")), errorOf(() => L.Env.path("NOPE"))]).toEqual(ref.env_path);
    expect(L.Env.directory()).toBe("\\game");
  });
  it("interpret", async () => {
    for (const f of ref.interpret) {
      const r = resultOf(() => L.Env.interpretContents(f.text, "FILE"));
      expect([f.name, r]).toEqual([f.name, f.out.error ? { error: f.out.error } : { value: f.out.value }]);
      if (f.out.full) {
        try { L.Env.interpretContents(f.text, "FILE"); } catch (e) { expect((e as Error).message).toBe(f.out.full); }
      }
    }
    expect(await L.Env.interpret("Graphics/nope.txt")).toEqual(ref.interpret_missing);
    expect(L.Env.formatError("f.txt", "Sec", "__pk__", "Float", "K", "v")).toBe(ref.format_error);
    expect(L.Env.formatError("f.txt", "Sec", "Sub", "Integer", "K", "v")).toBe(ref.format_error_sub);
  });
  it("ErrorLogger: echo, file line, error raises", async () => {
    logs.lines = [];
    L.Env.log.warn("careful");
    expect(errorOf(() => L.Env.log.error("boom"))).toEqual({ class: "RuntimeError", message: "boom" });
    await L.flushLogs();
    expect(logs.lines.map((l) => l.replace(/^\[[^\]]+\] /, ""))).toEqual(["[WARN] careful\r\n", "[ERROR] boom\r\n"]);
    expect(L.timeStamp(new Date(2026, 9, 29, 7, 5, 3))).toBe("[07:05:03 Thu 29-Oct-2026]");
  });
  it("CallbackWrapper", () => {
    const cw = new L.CallbackWrapper();
    expect(errorOf(() => cw.execute(() => 1, 1, 2))).toEqual(ref.callback_unset);
    cw.set({ a: 5, b: "x" });
    expect(cw.execute(function (me) { return [this.a, this.b, this.length, me.length, this[0]]; }, 7, 8, 9)).toEqual(ref.callback);
  });
});

describe("Sprite and Bitmap helpers", () => {
  it("center!, bottom!, center, bottom, zoom, default!, x_mid", () => {
    for (const c of ref.anchors) {
      const s = { srcRect: { width: c.w, height: c.h }, x: 0, y: 0, ox: 0, oy: 0, zoomX: 1, zoomY: 1, viewport: c.vp ? { rect: new Rect(0, 0, 301, 217) } : null };
      const r: Record<string, unknown> = { w: c.w, h: c.h, vp: c.vp, center: L.center(s), bottom: L.bottom(s) };
      L.centerBang(s); r["center!"] = [s.ox, s.oy, s.x, s.y];
      L.centerBang(s, true); r["center!snap"] = [s.ox, s.oy, s.x, s.y];
      L.bottomBang(s); r["bottom!"] = [s.ox, s.oy];
      L.setZoom(s, 1.75); r.zoom = [L.getZoom(s), s.zoomX, s.zoomY];
      expect(r).toEqual(c);
    }
    const d: Record<string, number> = {};
    L.defaultBang(d);
    expect(["speed", "toggle", "endX", "endY", "ex", "ey", "zx", "zy", "param", "direction"].map((k) => d[k])).toEqual(ref.default);
    const s = spriteWith(new Bitmap(10, 4));
    const mids = [L.xMid(s)];
    s.ox = 3;
    L.assignBitmap(s, null);
    mids.push(L.xMid(s));
    expect(mids).toEqual(ref.x_mid);
  });
  it("blur_sprite, skew, pbSelBitmap, smartWindow layouts", () => {
    for (const c of ref.blur) {
      const b = blts(c.ops as Op[]);
      expect(b[0]!.slice(1, 3)).toEqual([0, 0]);
      expect(L.blurOffsets(c.args[0]).map(([x, y]) => [x, y, c.args[1]])).toEqual(b.slice(1).map((o) => [o[1], o[2], o[4]]));
    }
    for (const c of ref.skew) {
      const [w, h, a] = c.args as [number, number, number];
      const layout = L.skewLayout(w, h, a);
      expect(layout.width).toBe((c.ops as Op[]).find((o) => o[0] === "new")![1]);
      expect(layout.rows.map(([x, y]) => [x, y, [0, y, w, 1]])).toEqual(blts(c.ops as Op[]).map((o) => [o[1], o[2], o[3]]));
      expect(layout.calMidX).toBe(c.mid);
      const s = spriteWith(new Bitmap(w, h));
      L.skew(s, a);
      expect([s.bitmap!.width, L.xMid(s), L.skew(s, a)]).toEqual([layout.width, c.mid, c.again]);
    }
    for (const c of ref.sel) {
      const layout = L.selBitmapLayout(16, 12, { width: c.rect[0]!, height: c.rect[1]! });
      expect([layout.width, layout.height]).toEqual((c.ops as Op[]).filter((o) => o[0] === "new")[1]!.slice(1));
      expect(layout.blits.map((b) => [b.x, b.y, [b.src.x, b.src.y, b.src.width, b.src.height]])).toEqual(blts(c.ops as Op[]).map((o) => [o[1], o[2], o[3]]));
      const full = L.pbSelBitmap("Graphics/Pictures/sel", new Rect(0, 0, c.rect[0], c.rect[1]));
      expect([full.width, full.height]).toEqual([layout.width, layout.height]);
    }
    for (const c of ref.smart) {
      const { slices, rects } = L.smartWindowRects(new Rect(...c.slice), new Rect(...c.rect), 48, 48);
      const r = (x: InstanceType<typeof Rect>) => [x.x, x.y, x.width, x.height];
      expect(rects.map((d, i) => [r(d), r(slices[i]!)])).toEqual((c.ops as Op[]).filter((o) => o[0] === "stretch_blt").map((o) => [o[1], o[2]]));
      const out = L.smartWindow(new Rect(...c.slice), new Rect(...c.rect));
      expect([out.width, out.height]).toEqual([c.rect[2], c.rect[3]]);
    }
  });
  it("pbBitmap", async () => {
    const b = L.pbBitmap("Graphics/Pictures/sel");
    expect({ size: [b.width, b.height], stored: L.storedPath(b) }).toEqual(ref.pbBitmap);
    logs.lines = [];
    const m = L.pbBitmap("Graphics/Pictures/missing");
    await L.flushLogs();
    expect({ size: [m.width, m.height], logs: logs.lines.map((l) => ["WARN", l.replace(/^\[[^\]]+\] \[WARN\] /, "").trimEnd()]) }).toEqual(ref.pbBitmap_missing);
  });
  it("bmp_circle, swap_colors, mask!, avg_color, colorize", () => {
    for (const c of ref.circle_px) {
      const b = new Bitmap(c.w, c.h);
      const args = c.args.map((a, i) => (i === 0 ? new Color(...(a as [number, number, number, number])) : a)) as Parameters<typeof L.bmpCircle> extends [unknown, ...infer R] ? R : never;
      L.bmpCircle(b, ...args);
      expect(pixels(b)).toEqual(c.px);
    }
    const b1 = bmpFrom(4, 3, ref.swap.src);
    L.swapColors(b1, { "#FF0000": "#00FF00", "#0000FF": "#FFFFFF", "#FFFFFF": "#000000" });
    expect(pixels(b1)).toEqual(ref.swap.hash);
    const b2 = bmpFrom(4, 3, ref.swap.src);
    L.swapColors(b2, bmpFrom(2, 2, ref.swap.map));
    expect(pixels(b2)).toEqual(ref.swap.bitmap);
    expect(errorOf(() => L.swapColors(bmpFrom(4, 3, ref.swap.src), { "255,0,0": "#000000" }))).toEqual(ref.swap.badkey);
    for (const c of ref.mask) {
      const r = L.maskBang(bmpFrom(6, 6, ref.mask_src), bmpFrom(4, 4, ref.mask_mask), c.push[0], c.push[1]);
      expect(pixels(r as InstanceType<typeof Bitmap>)).toEqual(c.px);
    }
    expect(L.maskBang(bmpFrom(6, 6, ref.mask_src), 5 as never)).toBe(ref.mask_bad);
    for (const c of ref.avg) expect(col(L.avgColor(spriteWith(bmpFrom(5, 4, ref.avg_src)), c.freq))).toEqual(c.out);
    expect(errorOf(() => L.avgColor(spriteWith(new Bitmap(1, 1)), 2))).toEqual(ref.avg_zero);
    for (const c of ref.colorize) {
      const s = spriteWith(bmpFrom(3, 2, ref.colorize_src));
      L.colorize(s, new Color(...(c.color as [number, number, number])), c.amt);
      expect(pixels(s.bitmap!)).toEqual(c.px);
    }
    const s = spriteWith(new Bitmap(2, 2));
    expect({
      outline: errorOf(() => L.createOutline(s, new Color(1, 1, 1))),
      mask: errorOf(() => L.mask(s, new Bitmap(1, 1))),
      outline_nil: L.createOutline(new Sprite(), new Color(1, 1, 1)),
      mask_nil: L.mask(new Sprite(), null),
    }).toEqual(ref.errors);
  });
  it("Viewport#sprites keeps only the last sprite (under 0)", async () => {
    const { Viewport } = await import("../../rgss/display");
    const vp = new Viewport(0, 0, 10, 10);
    const a = new Sprite(vp);
    const b = new Sprite(vp);
    new Sprite();
    expect(L.viewportSprites(vp)).toEqual({ 0: b });
    expect(L.viewportSprites(vp)[0]).not.toBe(a);
  });
});

describe("sprite classes (60 fps)", () => {
  it("ScrollingSprite", () => {
    for (const c of ref.scrolling) {
      const s = new L.ScrollingSprite();
      if (c.speed !== null) s.speed = c.speed;
      if (c.direction !== null) s.direction = c.direction;
      s.setBitmap(new Bitmap(40, 30), c.vertical, c.pulse);
      const frames = [[[s.srcRect.x, s.srcRect.y, s.srcRect.width, s.srcRect.height], s.opacity]];
      for (let i = 1; i < c.frames.length; i++) {
        s.update();
        frames.push([[s.srcRect.x, s.srcRect.y, s.srcRect.width, s.srcRect.height], s.opacity]);
      }
      expect(frames).toEqual(c.frames);
    }
  });
  it("SpriteSheet and SelectorSprite", () => {
    const r = (x: { x: number; y: number; width: number; height: number }) => [x.x, x.y, x.width, x.height];
    for (const c of ref.sheet) {
      const s = new L.SpriteSheet(null, c.frames);
      s.speed = c.speed;
      s.setBitmap(new Bitmap(60, 45), c.vertical);
      const tr = [r(s.srcRect)];
      for (let i = 0; i < 12; i++) { s.update(); tr.push(r(s.srcRect)); }
      expect(tr).toEqual(c.trace);
    }
    const anchor = spriteWith(new Bitmap(33, 21));
    Object.assign(anchor, { x: 100, y: 50, ox: 5, oy: 3, opacity: 120 });
    const sel = new L.SelectorSprite(null, 4);
    sel.filename = "Graphics/Pictures/sel";
    sel.target(anchor);
    const tr: unknown[] = [[r(sel.srcRect), sel.ox, sel.oy, sel.bitmap!.width, sel.bitmap!.height]];
    for (let i = 0; i < 10; i++) { sel.update(); tr.push([r(sel.srcRect), sel.x, sel.y, sel.opacity, sel.visible]); }
    expect(tr).toEqual(ref.selector);
  });
  it("TrailingSprite and RainbowSprite", () => {
    const tr = new L.TrailingSprite(null, new Bitmap(8, 8));
    tr.keyFrame = 2; tr.x = 10; tr.y = 20; tr.color = new Color(5, 6, 7, 8);
    const trace: unknown[] = [tr.isDisposed()];
    for (let i = 0; i < 9; i++) {
      tr.x += 3;
      tr.update();
      const sprites = (tr as unknown as { sprites: Map<string, InstanceType<typeof Sprite>> }).sprites;
      trace.push([...sprites].map(([k, v]) => [k, v.x, v.y, v.opacity, Math.round(v.zoomX * 1e9) / 1e9, v.ox, col(v.color)]));
    }
    expect(trace).toEqual(ref.trailing);
    const hues: number[][] = [];
    const spy = vi.spyOn(Bitmap.prototype, "hueChange").mockImplementation(function (h) { hues[hues.length - 1]!.push(h); });
    const rb = new L.RainbowSprite();
    rb.setBitmap(new Bitmap(4, 4), 400);
    for (let i = 0; i < 5; i++) { hues.push([]); rb.update(); }
    rb.setBitmap(new Bitmap(4, 4), 1);
    for (let i = 0; i < 3; i++) { hues.push([]); rb.update(); }
    spy.mockRestore();
    expect(hues).toEqual(ref.rainbow.map((h) => h.map(Math.trunc)));
  });
});
