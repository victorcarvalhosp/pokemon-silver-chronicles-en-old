// Checks the coded transitions against 009_Scenes/001_Transitions.rb: the
// names judge_special_transition knows, the graphics they load, and the
// timing maths of a few (run headless over a stand-in screenshot).
import { existsSync, readFileSync } from "node:fs";
import { Container } from "pixi.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { seedRandom } from "../../core/random";
import type { Bitmap } from "../../rgss/Bitmap";
import { attachStage } from "../../rgss/display";
import { Graphics, type SpecialTransition } from "../../rgss/Graphics";
import { Cache } from "../../sprites/cache";
import { G } from "../globals";
import { SPECIAL } from "./transitions";

const ROOT = new URL("../../../../", import.meta.url);
const ruby = readFileSync(new URL("Data/Scripts/009_Scenes/001_Transitions.rb", ROOT), "utf8");

/** A screenshot stand-in: what the transitions read from a Bitmap. */
function fakeScreenshot(width = Graphics.width, height = Graphics.height): Bitmap {
  const b = {
    width,
    height,
    disposed: false,
    isDisposed: () => b.disposed,
    dispose: () => { b.disposed = true; },
    clone: () => fakeScreenshot(),
    stretchBlt: () => {},
  };
  return b as unknown as Bitmap;
}

function build(name: string, seconds = 25 / 20): SpecialTransition & Record<string, unknown> {
  G.gameTemp.backgroundBitmap = fakeScreenshot();
  const [cls, ...args] = SPECIAL[name]!;
  return new cls(seconds, ...args) as unknown as SpecialTransition & Record<string, unknown>;
}

/** Width/height of a Graphics/Transitions PNG (its IHDR). */
function pngSize(name: string): [number, number] | null {
  const url = new URL(`Graphics/Transitions/${name}.png`, ROOT);
  if (!existsSync(url)) return null;
  const d = readFileSync(url);
  return [d.readUInt32BE(16), d.readUInt32BE(20)];
}

beforeAll(() => {
  attachStage(new Container());
  // RPG::Cache.transition: stand-ins the size of the real graphics.
  vi.spyOn(Cache, "get").mockImplementation((path: string) => {
    const size = pngSize(path.replace(/^Graphics\/Transitions\//, ""));
    return size ? fakeScreenshot(...size) : null;
  });
});

describe("judge_special_transition", () => {
  it("knows exactly the names Ruby's case statement handles, with the same arguments", () => {
    const rubyNames = [...ruby.matchAll(/when "([a-z_]+)"\s+then @@transition = Transitions::(\w+)\.new\(duration(?:, ([^)]+))?\)/g)];
    expect(rubyNames.length).toBe(35);
    expect(Object.keys(SPECIAL).sort()).toEqual(rubyNames.map((m) => m[1]).sort());
    for (const [, name, , arg] of rubyNames) {
      const [, ...args] = SPECIAL[name!]!;
      const expected = arg === undefined ? [] : [JSON.parse(arg)];
      expect(args, name).toEqual(expected);
    }
  });

  it("loads graphics that exist (VS ones for a trainer that has them)", () => {
    G.gameTemp.transitionAnimationData = ["LEADER_Bugsy", "Bugsy", "PkMnTRAINER_Male"];
    const special = new Set(["vselitefour", "vsrocketadmin"]);
    for (const [name, [cls]] of Object.entries(SPECIAL)) {
      if (special.has(name)) continue;
      for (const b of cls.bitmaps()) expect(existsSync(new URL(`Graphics/Transitions/${b}.png`, ROOT)), `${name}: ${b}`).toBe(true);
    }
    G.gameTemp.transitionAnimationData = ["ELITEFOUR_Will", "Will", "PkMnTRAINER_Male"];
    for (const b of SPECIAL.vselitefour![0].bitmaps()) expect(existsSync(new URL(`Graphics/Transitions/${b}.png`, ROOT)), b).toBe(true);
    G.gameTemp.transitionAnimationData = ["ROCKET_PROTON", "Proton"];
    for (const b of SPECIAL.vsrocketadmin![0].bitmaps()) expect(existsSync(new URL(`Graphics/Transitions/${b}.png`, ROOT)), b).toBe(true);
    G.gameTemp.transitionAnimationData = null;
  });
});

describe("coded transitions", () => {
  it("each runs to the end of its duration and disposes itself", () => {
    // (These draw text or a black fill onto a Bitmap of their own, which needs
    // a canvas; the browser check covers them.)
    const needCanvas = new Set(["splash", "vstrainer", "vselitefour", "vsrocketadmin"]);
    G.gameTemp.transitionAnimationData = ["LEADER_Bugsy", "Bugsy"];
    for (const name of Object.keys(SPECIAL)) {
      if (needCanvas.has(name)) continue;
      const t = build(name);
      expect(t.disposed(), `${name} built`).toBe(false);
      const duration = t.duration as number;
      let ticks = 0;
      while (!t.disposed() && ticks < 600) {
        t.update();
        ticks += 1;
      }
      // (timer += delta_s piles up float error, so it can take one tick more.)
      expect(ticks - Math.round(duration / Graphics.deltaS), name).toBeGreaterThanOrEqual(0);
      expect(ticks - Math.round(duration / Graphics.deltaS), name).toBeLessThanOrEqual(1);
    }
    G.gameTemp.transitionAnimationData = null;
  });

  it("ZoomIn zooms to 8x and fades out over its duration, then disposes", () => {
    const t = build("zoomin", 1.0);
    const sprite = t.overworldSprite as { zoomX: number; opacity: number; ox: number; oy: number };
    expect([sprite.ox, sprite.oy]).toEqual([256, 192]);
    for (let i = 0; i < 30; i++) t.update(); // 0.5 s
    expect(sprite.zoomX).toBeCloseTo(1 + 7 * 0.5, 5);
    expect(sprite.opacity).toBe(127); // mkxp-z truncates 127.5
    for (let i = 0; i < 30; i++) t.update();
    expect(t.disposed()).toBe(true);
  });

  it("ScrollScreen moves the screenshot the way its direction says", () => {
    const expected: Record<string, [number, number]> = {
      scrolldown: [0, 1], scrollleft: [-1, 0], scrollright: [1, 0], scrollup: [0, -1],
      scrolldownleft: [-1, 1], scrolldownright: [1, 1], scrollupleft: [-1, -1], scrollupright: [1, -1],
    };
    for (const [name, [dx, dy]] of Object.entries(expected)) {
      const t = build(name, 1.0);
      for (let i = 0; i < 15; i++) t.update(); // 0.25 s
      const s = t.overworldSprite as { x: number; y: number };
      expect(s.x, name).toBeCloseTo(dx * 512 * 0.25, 5);
      expect(s.y, name).toBeCloseTo(dy * 384 * 0.25, 5);
    }
  });

  it("RandomStripe hides every stripe once, in shuffled order", () => {
    seedRandom(1);
    const t = build("random_stripe_v", 1.0);
    const timings = [...(t.timings as number[])];
    expect(timings).toHaveLength(256);
    expect([...timings].sort((a, b) => a - b)).toEqual(timings.map((_, i) => i / 256));
    expect(timings).not.toEqual(timings.map((_, i) => i / 256));
  });

  it("TwoBallPass rolls its balls across in the first 40% then zooms the screen", () => {
    const t = build("twoballpass");
    expect(t.duration).toBe(1.0); // DURATION overrides the 1.25 s given
    const balls = t.ballSprites as { x: number; visible: boolean }[];
    expect(balls.map((b) => b.x)).toEqual([512 + 64, -64]);
    for (let i = 0; i < 12; i++) t.update(); // 0.2 s: half way through the roll
    expect(balls[0]!.x).toBeCloseTo(576 - (512 + 128) * 0.5, 5);
    for (let i = 0; i < 30; i++) t.update(); // 0.7 s
    expect(balls[0]!.visible).toBe(false);
    const p = (0.7 - 0.4) / 0.6;
    expect((t.overworldSprite as { zoomX: number }).zoomX).toBeCloseTo(1 + p * p, 5);
  });
});
