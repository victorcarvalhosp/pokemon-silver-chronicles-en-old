// Replays tools/ruby-ref/experiment_scene_reference.rb (the real
// Plugins/ExperimentWithScene scripts run headless on system Ruby) against
// the TypeScript port: Vector, calculateCurve, singleDecInt?, MyUI's vector
// store, the Battle::Scene helpers and MyUI::Scene#pbStartScene's camera
// trace up to the TypeError it raises. Randomness is a queue of raw numbers
// (rand(n) = raw % n) recorded by the harness.

import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import ref from "./experimentSceneReference.json";

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
vi.mock("../../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../rgss/Graphics")>();
  orig.Graphics.update = async () => { orig.Graphics.frameCount++; };
  return orig;
});
vi.mock("../../core/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/assets")>()),
  assetExists: (p: string) => p === "Graphics/Trainers/PkMnTRAINER_Male",
}));
vi.mock("../../ui/rpgCache", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../ui/rpgCache")>();
  const { Bitmap } = await import("../../rgss/Bitmap");
  return {
    ...orig,
    preloadBitmaps: async () => {},
    pbResolveBitmap: (p: string | null) => p,
    RPGCache: { loadBitmap: () => new Bitmap(512, 384) },
  };
});
// No OffscreenCanvas in node: bitmaps that accept any drawing call.
(globalThis as Record<string, unknown>).OffscreenCanvas ??= class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return new Proxy({ canvas: this }, { get: (t, p) => (p in t ? (t as never)[p] : () => ({ data: new Uint8ClampedArray(4), width: 1 })), set: () => true });
  }
};

const { attachStage, Sprite } = await import("../../rgss/display");
const { G } = await import("../../game/globals");
const { Vector, calculateCurve, singleDecInt, alignSprites, getRealVector, applySpriteProperties } = await import("./MathFunctions");
const { MyUI } = await import("./MyUIModule");
const { MyUIScene } = await import("./MyUIScene");
await import("./SceneCamera");
attachStage(new Container());

type V = InstanceType<typeof Vector>;
function state(v: V) {
  const p = v as unknown as { constant: number };
  return { get: v.get(), x2: v.x2, y2: v.y2, inc: v.inc, finished: v.finished(), locked: v.locked(), set: [...v.setValues], constant: p.constant };
}
/**
 * Deep equality with numbers compared to 1e-9: Ruby's libm and V8 can round
 * Math.cos/Math.sin one ulp apart (x2/y2, spoof); everything else is exact.
 */
function expectClose(actual: unknown, expected: unknown): void {
  const walk = (a: unknown, e: unknown): unknown => {
    if (typeof a === "number" && typeof e === "number") return Math.abs(a - e) <= 1e-9 * Math.max(1, Math.abs(e)) ? e : a;
    if (Array.isArray(a) && Array.isArray(e)) return a.map((x, i) => walk(x, e[i]));
    if (a && e && typeof a === "object" && typeof e === "object") {
      return Object.fromEntries(Object.entries(a).map(([k, x]) => [k, walk(x, (e as Record<string, unknown>)[k])]));
    }
    return a;
  };
  expect(walk(actual, expected)).toEqual(expected);
}
function errorOf(fn: () => unknown): { class: string; message: string } | null {
  try {
    fn();
    return null;
  } catch (e) {
    return { class: (e as Error).name, message: (e as Error).message };
  }
}

describe("Math Functions.rb", () => {
  it("Vector: update / finished? toward a target, and before any set", () => {
    for (const sc of ref.vectors) {
      rnd.rolls = [...sc.rolls];
      const v = new Vector(...(sc.args as number[]));
      expectClose(state(v), sc.initial);
      if (sc.target) v.set(...(sc.target as (number | number[])[]));
      v.inc = sc.inc;
      for (const frame of sc.frames) {
        v.update();
        expectClose(state(v), frame);
      }
    }
  });

  it("Vector: setters, setXY, lock, force/set", () => {
    rnd.rolls = [...ref.setters.rolls];
    const v = new Vector(5, 6, 30, 50, 1, 1);
    const states = [state(v)];
    v.x = 12; states.push(state(v));
    v.y = -3.5; states.push(state(v));
    v.angle = 90; states.push(state(v));
    v.scale = 7.25; states.push(state(v));
    v.setXY(100, 200); states.push(state(v));
    v.lock(); states.push(state(v));
    v.lock(); states.push(state(v));
    v.force();
    v.set(1, 2, 3, 4, 5, 6); states.push(state(v));
    v.update(); states.push(state(v));
    expectClose(states, ref.setters.states);
  });

  it("Vector#spoof, and the TypeError for a Vector argument", () => {
    const v = new Vector();
    for (const sc of ref.spoof) expectClose(v.spoof(...(sc.args as unknown[])), sc.ret);
    expect(errorOf(() => v.spoof(v))).toEqual(ref.spoofVectorError);
  });

  it("calculateCurve, singleDecInt?", () => {
    for (const sc of ref.curves) {
      const [x1, y1, x2, y2, x3, y3] = sc.points as number[];
      expect(calculateCurve(x1!, y1!, x2!, y2!, x3!, y3!, sc.frames)).toEqual(sc.ret);
    }
    for (const [n, ret] of ref.singleDecInt as [number, boolean][]) expect([n, singleDecInt(n)]).toEqual([n, ret]);
  });
});

describe("MyUI Module.rb, MyUI_Scene.rb, Scene Camera.rb (in the harness's order)", () => {
  it("MyUI vector store before :PLAYER exists", () => {
    const m = ref.myui;
    expect((MyUI.get("vectors") as Map<string, unknown>).get("CAMERA_MOTION")).toEqual(m.cameraMotion);
    expect(MyUI.getVector("MAIN")).toEqual(m.getMainBefore);
    expect(MyUI.getVector("BATTLER", true)).toEqual(m.getBattlerBefore);
    expect(MyUI.getVector("CAMERA_MOTION")).toEqual(m.getCameraMotion);
    expect(MyUI.randomVector(null, null)).toEqual(m.randomBefore);
    expect(MyUI.randomVector(null, 3)).toEqual(m.randomBeforeLast3);
    const camera = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]];
    MyUI.addVector("CAMERA", ...camera);
    expect(MyUI.getVector("CAMERA")).toEqual(m.camera);
    expect(camera).toEqual(m.cameraArgsAfter);
    MyUI.addVector("ENEMY", 1, 2, 3);
    expect(MyUI.getVector("ENEMY")).toEqual(m.enemy);
    MyUI.nextVector([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], 7, [9, 9, 9, 9, 9, 9, 9]);
    expect(MyUI.randomVector(null, 0)).toEqual(m.randomNext);
    const inspect = (k: unknown) => (k == null ? "nil" : typeof k === "number" ? String(k) : k);
    const parsed = (["vectors", "nextVectors", "tviewport", "smAnim", 5, null] as unknown[]).map((k) => MyUI.parse(k));
    // Ruby's inspect shows :symbols and "strings"; compare the names only.
    expect(parsed.map(inspect)).toEqual(m.parse.map(([, r]) => (r === "nil" ? "nil" : r!.replace(/^:|"/g, ""))));
    expect(inspect(MyUI.get("tviewport"))).toEqual(m.getTviewport);
    expect(inspect(MyUI.get("smAnim"))).toEqual(m.getSmAnim);
  });

  it("Battle::Scene helpers", () => {
    const s1 = new Sprite();
    Object.assign(s1, { x: 3, y: 4, z: 5, zoomX: 1.5, zoomY: 0.5, opacity: 128, angle: 30, visible: false });
    (s1 as unknown as { tone: unknown; color: unknown }).tone = "tone";
    (s1 as unknown as { tone: unknown; color: unknown }).color = "color";
    const s2 = new Sprite();
    applySpriteProperties(s1, s2);
    expect([s2.x, s2.y, s2.z, s2.zoomX, s2.zoomY, s2.opacity, s2.angle, s2.tone, s2.color, s2.visible]).toEqual(ref.applySpriteProperties);
    const sp = new Sprite();
    sp.srcRect.set(0, 0, 81, 40);
    expect({ error: errorOf(() => alignSprites({}, sp, new Sprite())), ox: sp.ox, oy: sp.oy }).toEqual(ref.alignSprites);
    expect(errorOf(() => getRealVector({}, 0, true))).toEqual(ref.getRealVector);
  });

  it("MyUI::Scene#pbStartScene: camera trace, then TypeError", async () => {
    G.player = { trainerType: "PkMnTRAINER_Male", outfit: 0 } as never;
    const ss = ref.startScene;
    rnd.rolls = [...ss.rolls];
    const trace: unknown[] = [];
    const orig = MyUIScene.prototype.animateScene;
    MyUIScene.prototype.animateScene = function (this: InstanceType<typeof MyUIScene>, ...a: Parameters<typeof orig>) {
      orig.apply(this, a);
      trace.push({ vector: state(this.vector), playerX: this.sprites["player"]!.x, orgPos: [...this.orgPos!] });
    };
    const s = new MyUIScene();
    let err: { class: string; message: string } | null = null;
    try {
      await s.pbStartScene();
    } catch (e) {
      err = { class: (e as Error).name, message: (e as Error).message };
    }
    MyUIScene.prototype.animateScene = orig;
    expect(rnd.rolls).toEqual([]);
    expectClose(trace, ss.trace);
    expect(err).toEqual(ss.error);
    expectClose(state(s.vector), ss.vector);
    expect(MyUI.getVector("PLAYER")).toEqual(ss.playerVector);
    const p = s.sprites["player"]!;
    expect({ x: p.x, y: p.y, z: p.z, opacity: p.opacity, srcWidth: p.srcRect.width }).toEqual(ss.player);
    expect([s.sprites["bg"]!.zoomX, s.sprites["bg"]!.zoomY]).toEqual(ss.bgZoom);

    // After :PLAYER exists, get_vector returns it for every key.
    expect({ getMain: MyUI.getVector("MAIN"), getEnemy: MyUI.getVector("ENEMY"), random: MyUI.randomVector(null, null) }).toEqual(ref.myuiAfter);
    rnd.rolls = [...ref.reset.rolls];
    const v = new Vector(1, 2, 3, 4);
    v.inc = 0.7;
    v.reset();
    expectClose(state(v), ref.reset.state);

    s.moveEntireScene(5, -7, true, false, 2);
    expectClose({ vector: state(s.vector), orgPos: s.orgPos }, ref.moveEntireScene);
    s.moveEntireScene(1, 1, false);
    expectClose({ vector: state(s.vector), orgPos: s.orgPos }, ref.moveEntireSceneUnlocked);
    s.setVector(1, 2, 3, 4, 5);
    expectClose(state(s.vector), ref.setVector);
    expect(errorOf(() => s.spoof([1, 2, 3, 4, 5, 1]))).toEqual(ref.spoofScene);
    expect(errorOf(() => s.disposed())).toEqual(ref.disposed);
  });
});
