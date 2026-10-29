// RGSS Graphics on a fixed 60 Hz step.
//
// The game runs as ONE async coroutine, mirroring Essentials' blocking loops:
//   loop { await Graphics.update(); Input.update(); scene.update(); }
// Graphics.update() returns a promise that resolves on the next logic tick.
// The scheduler resolves it, waits until the coroutine reaches its next
// Graphics.update() (the tick's work is done), then moves on. Rendering
// happens once per display refresh.

import { Container, Sprite as PixiSprite, Texture, type Application } from "pixi.js";
import { TICK } from "../core/loop";
import { attachStage, syncDisplay } from "./display";

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

  /** Fades from the frozen image to the current screen. */
  async transition(seconds = 0.2): Promise<void> {
    if (!frozen) return;
    const f = frozen;
    const ticks = Math.max(1, Math.round(seconds / TICK));
    for (let i = 1; i <= ticks; i++) {
      f.alpha = 1 - i / ticks;
      if (i < ticks) await Graphics.update();
    }
    f.destroy({ texture: true });
    if (frozen === f) frozen = null;
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
