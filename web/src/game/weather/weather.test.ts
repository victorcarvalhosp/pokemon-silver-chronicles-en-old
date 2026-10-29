// RPG::Weather and the Particle_Engine against the game's own Ruby
// (weatherReference.json, written by web/tools/ruby-ref/weather_reference.rb,
// which runs 001_Overworld_Weather.rb / 012_Weather.rb / 010_ParticleEngine.rb
// headless). Both sides draw the same raw random numbers
// ((k * 829348651 + 12345) % 2147483647; rand(n) = raw % n) and tick at 60 Hz;
// every 20th frame (10th for particles) the sprites' positions, opacities and
// visibility, the tiles and the screen tone must match exactly.
import { readFileSync } from "node:fs";
import { Container } from "pixi.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { attachStage, Viewport } from "../../rgss/display";
import ref from "./weatherReference.json";

let k = 0;
const nextRaw = () => {
  const v = (k * 829_348_651 + 12_345) % 2_147_483_647;
  k++;
  return v;
};
vi.mock("../../core/random", () => ({
  rand: (n: number) => nextRaw() % n,
  random: () => nextRaw() / 2_147_483_647,
  seedRandom: () => {},
}));

const ROOT = new URL("../../../../", import.meta.url);
/** Stand-ins with the real files' sizes (RPG::Cache.load_bitmap). */
function fakeBitmap(path: string) {
  const d = readFileSync(new URL(`${path}.png`, ROOT));
  const b = { width: d.readUInt32BE(16), height: d.readUInt32BE(20), disposed: false,
    isDisposed: () => b.disposed, dispose: () => { b.disposed = true; },
    clone: () => fakeBitmap(path), hueChange: () => {} };
  return b;
}
const bitmaps = new Map<string, ReturnType<typeof fakeBitmap>>();
vi.mock("../../ui/rpgCache", () => ({
  RPGCache: {
    loadBitmap: (folder: string, name = "") => {
      const p = folder + name;
      if (!bitmaps.has(p)) bitmaps.set(p, fakeBitmap(p));
      return bitmaps.get(p);
    },
  },
  preloadBitmaps: async () => {},
}));

const { RPGWeather } = await import("./Weather");
const { ParticleEngine } = await import("../../sprites/ParticleEngine");

type Step = [number, string, number, number, number, number];
interface Snapshot {
  frame: number; type: string; max: number; fading: boolean; tone: number[];
  sprites: unknown[]; newSprites: unknown[]; tiles: unknown[]; tileX: number; tileY: number;
}
type Scenario = { steps: Step[]; snapshots: Snapshot[]; flashes: [number, number[], number][]; rawCalls: number };
const scenarios = Object.entries(ref).filter(([name]) => name !== "particles") as unknown as [string, Scenario][];

beforeAll(() => {
  attachStage(new Container());
});

describe("RPG::Weather matches the Ruby", () => {
  it.each(scenarios)("%s", (_name, scenario) => {
    k = 0;
    const flashes: [number, number[], number][] = [];
    let frame = 0;
    const flash = vi.spyOn(Viewport.prototype, "flash").mockImplementation((c, seconds) => {
      flashes.push([frame, [c!.red, c!.green, c!.blue, c!.alpha], Math.round(seconds * 40)]);
    });
    const w = new RPGWeather(new Viewport(0, 0, 512, 384));
    let ox = 0;
    let oy = 0;
    const snaps: Snapshot[] = [];
    for (const [frames, type, max, duration, dox, doy] of scenario.steps) {
      for (let i = 0; i < frames; i++) {
        w.fadeIn(type, max, duration);
        ox += dox;
        oy += doy;
        w.ox = ox;
        w.oy = oy;
        w.update();
        frame++;
        if (frame % 20 === 0) snaps.push({ frame, ...w.debugState() } as Snapshot);
      }
    }
    flash.mockRestore();
    w.dispose();
    for (let i = 0; i < scenario.snapshots.length; i++) {
      const want = scenario.snapshots[i]!;
      const got = snaps[i]!;
      expect({ ...got, fadeTime: undefined }, `frame ${want.frame}`).toEqual({ ...want, fadeTime: undefined });
    }
    expect(snaps.length).toBe(scenario.snapshots.length);
    expect(flashes).toEqual(scenario.flashes);
    expect(k).toBe(scenario.rawCalls);
  });

  it("covers every weather type with particles, tiles, tone and storm flashes", () => {
    const types = new Set(scenarios.flatMap(([, s]) => s.steps.map((st) => st[1])));
    expect([...types].sort()).toEqual(["Blizzard", "HeavyRain", "None", "Rain", "Sandstorm", "Snow", "Storm", "Sun", "Fog"].sort());
    const last = (name: string) => (ref as unknown as Record<string, Scenario>)[name]!.snapshots.at(-1)!;
    // Particle counts: power 9 = 60 sprites, all on screen once faded in.
    expect((last("rain").sprites as [number, number, number, boolean][]).filter((s) => s[3]).length).toBe(60);
    expect(last("fog").tiles.length).toBe(20); // (512/128 + 1) * (384/128 + 1)
    expect((ref as unknown as Record<string, Scenario>).rainToStorm!.flashes.length).toBeGreaterThan(0);
  });
});

/** The event the particles come from: Game_Event's position fields. */
function particleEvent(type: string) {
  return {
    id: 3, realX: 10 * 128, realY: 8 * 128, sx: 256, sy: 224, tileId: 0, characterName: "",
    list: [{ cmd: "comment", lines: ["Particle Engine Type", type] }],
    screenX() { return this.sx; },
    screenY() { return this.sy; },
    screenZ(h = 0) { return this.sy + 32 - h; },
  };
}

describe("Particle_Engine matches the Ruby", () => {
  it.each(Object.entries(ref.particles))("%s", (type, want) => {
    k = 0;
    const ev = particleEvent(type);
    const map = { events: new Map([[3, ev]]) };
    const engine = new ParticleEngine(new Viewport(0, 0, 512, 384), map as never);
    const snaps: number[][][] = [];
    for (let f = 0; f < 120; f++) {
      if (f >= 60 && f < 90) {
        ev.realX -= 4;
        ev.sx -= 1;
      }
      engine.update();
      const eff = (engine as unknown as { effect: { debugState(): number[][] }[] }).effect[3]!;
      if ((f + 1) % 10 === 0) snaps.push(eff.debugState());
    }
    engine.dispose();
    expect(snaps).toEqual(want.snapshots);
    expect(k).toBe(want.rawCalls);
  });
});
