// Fixed-step game loop: logic advances in exact 1/60 s steps (deterministic,
// replayable), drawing happens once per display refresh.

export const TICK_RATE = 60;
export const TICK = 1 / TICK_RATE;
/** The original game ran at 40 frames per second. */
export const ORIGINAL_FPS = 40;

/** Converts an original-game frame count to seconds. */
export function framesToSeconds(frames: number): number {
  return frames / ORIGINAL_FPS;
}

export interface LoopHooks {
  update(dt: number): void;
  render(): void;
}

export function startLoop(hooks: LoopHooks): () => void {
  let last = performance.now();
  let acc = 0;
  let handle = 0;
  const frame = (now: number) => {
    // Clamp long pauses (tab in background) so we don't fast-forward.
    acc += Math.min((now - last) / 1000, 0.25);
    last = now;
    while (acc >= TICK) {
      hooks.update(TICK);
      acc -= TICK;
    }
    hooks.render();
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(handle);
}
