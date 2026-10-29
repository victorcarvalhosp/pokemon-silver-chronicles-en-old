// RGSS Graphics on a fixed 60 Hz step.
//
// The game runs as ONE async coroutine, mirroring Essentials' blocking loops:
//   loop { await Graphics.update(); Input.update(); scene.update(); }
// Graphics.update() returns a promise that resolves on the next logic tick.
// The scheduler resolves it, waits until the coroutine reaches its next
// Graphics.update() (the tick's work is done), then moves on. Rendering
// happens once per display refresh.

import { Container, Rectangle, Sprite as PixiSprite, Texture, type Application } from "pixi.js";
import { TICK } from "../core/loop";
import { Bitmap } from "./Bitmap";
import { attachStage, syncDisplay } from "./display";
import { TransitionFilter } from "./TransitionFilter";

/** A coded transition (Essentials' Transitions::*), updated once per frame until disposed. */
export interface SpecialTransition {
  update(): void;
  disposed(): boolean;
}

let app: Application;
let root: Container;
let waiter: (() => void) | null = null;
let tickDone: (() => void) | null = null;
let frozen: PixiSprite | null = null;
let blackout: PixiSprite;
let crashed = false;

const TOP_Z = 1_000_000;

export const Graphics = {
  width: 512,
  height: 384,
  /** Logic ticks since start. */
  frameCount: 0,
  /** Seconds per logic tick (Essentials' Graphics.delta_s). */
  deltaS: TICK,
  /** Ticks per tick-time; the Speed Up plugin raises this. */
  speed: 1,
  /** 0..255; 255 = normal. */
  brightness: 255,

  /** Called on every update() (Essentials aliases Graphics.update, e.g. GameStats' play time). */
  onUpdate: [] as (() => void)[],

  /** Waits for the next logic tick. */
  update(): Promise<void> {
    for (const hook of Graphics.onUpdate) hook();
    if (tickDone) {
      const done = tickDone;
      tickDone = null;
      done();
    }
    return new Promise((resolve) => {
      if (waiter) throw new Error("Two coroutines are waiting on Graphics.update()");
      waiter = resolve;
    });
  },

  async wait(seconds: number, each?: () => void): Promise<void> {
    const end = Graphics.frameCount + Math.round(seconds / TICK);
    while (Graphics.frameCount < end) {
      await Graphics.update();
      each?.();
    }
  },

  /** Captures the current screen and keeps showing it until transition(). */
  freeze(): void {
    syncDisplay();
    const texture = app.renderer.generateTexture({ target: root, frame: undefined });
    frozen?.destroy({ texture: true });
    frozen = new PixiSprite(texture);
    frozen.zIndex = TOP_Z - 1;
    app.stage.addChild(frozen);
  },

  /**
   * Essentials' Graphics.judge_special_transition (009_Scenes/001_Transitions.rb):
   * builds the coded transition for a name, or null. Set by game/battle/transitions.ts.
   */
  specialTransition: null as ((name: string, seconds: number) => Promise<SpecialTransition | null>) | null,

  /**
   * Graphics.transition(duration, filename, vague) as Essentials overrides it
   * (009_Scenes/001_Transitions.rb), with the duration in seconds. A name with
   * a coded transition swaps to the new screen at once and plays that over
   * it; otherwise a "Graphics/Transitions/..." image gives a threshold
   * transition (RGSS), and without one (or if it's missing) the frozen screen
   * fades out.
   */
  async transition(seconds = 8 / 20, filename = "", vague = 20): Promise<void> {
    if (filename && Graphics.specialTransition) {
      const base = filename.split("/").pop()!.toLowerCase();
      const special = await Graphics.specialTransition(base, seconds);
      if (special) {
        dropFrozen();
        // STOP_WHILE_TRANSITION: wait for it, updating it after every frame.
        while (!special.disposed()) {
          await Graphics.update();
          special.update();
        }
        return;
      }
    }
    if (!frozen) return;
    const f = frozen;
    const ticks = Math.max(1, Math.round(seconds / TICK));
    const map = filename ? await Bitmap.load(filename) : null;
    if (map) {
      const mapSprite = new PixiSprite(new Texture({ source: map.textureSource() }));
      mapSprite.width = Graphics.width;
      mapSprite.height = Graphics.height;
      app.stage.addChild(mapSprite);
      const filter = new TransitionFilter(mapSprite);
      f.filters = [filter];
      for (let i = 0; i < ticks; i++) {
        filter.set(i / ticks, vague);
        await Graphics.update();
      }
      mapSprite.destroy();
      map.dispose();
    } else {
      for (let i = 1; i <= ticks; i++) {
        f.alpha = 1 - i / ticks;
        if (i < ticks) await Graphics.update();
      }
    }
    f.destroy({ texture: true });
    if (frozen === f) frozen = null;
  },

  /** Graphics.snap_to_bitmap: the current screen as a Bitmap. */
  snapToBitmap(): Bitmap {
    syncDisplay();
    const texture = app.renderer.generateTexture({ target: root, frame: new Rectangle(0, 0, Graphics.width, Graphics.height) });
    const canvas = app.renderer.extract.canvas(texture) as unknown as OffscreenCanvas;
    texture.destroy(true);
    return Bitmap.fromImage(canvas);
  },

  /** Fades brightness to `target` over `seconds`. */
  async fadeTo(target: number, seconds: number): Promise<void> {
    const start = Graphics.brightness;
    const ticks = Math.max(1, Math.round(seconds / TICK));
    for (let i = 1; i <= ticks; i++) {
      Graphics.brightness = start + ((target - start) * i) / ticks;
      await Graphics.update();
    }
  },
};

function dropFrozen(): void {
  frozen?.destroy({ texture: true });
  frozen = null;
}

/** Sets up the stage hierarchy. Game objects go into `root`. */
export function initGraphics(application: Application): void {
  app = application;
  app.stage.sortableChildren = true;
  root = new Container();
  app.stage.addChild(root);
  attachStage(root);
  blackout = new PixiSprite(Texture.WHITE);
  blackout.tint = 0x000000;
  blackout.width = Graphics.width;
  blackout.height = Graphics.height;
  blackout.zIndex = TOP_Z;
  app.stage.addChild(blackout);
}

/** One logic tick: lets the game coroutine run until its next update(). */
export async function runTick(): Promise<void> {
  Graphics.frameCount++;
  const w = waiter;
  if (!w) return; // the coroutine is busy (e.g. loading files)
  waiter = null;
  await new Promise<void>((resolve) => {
    tickDone = resolve;
    w();
  });
}

export function render(): void {
  syncDisplay();
  blackout.alpha = 1 - Math.max(0, Math.min(255, Graphics.brightness)) / 255;
  blackout.visible = blackout.alpha > 0;
  app.render();
}

/** Starts the game coroutine and the frame scheduler. */
export function runGame(main: () => Promise<void>, onError: (e: unknown) => void): void {
  main()
    .catch((e) => {
      crashed = true;
      onError(e);
    })
    .finally(() => tickDone?.());
  let last = performance.now();
  let acc = 0;
  const frame = async (now: number) => {
    acc += Math.min((now - last) / 1000, 0.25) * Graphics.speed;
    last = now;
    while (acc >= TICK && !crashed) {
      acc -= TICK;
      await runTick();
    }
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
