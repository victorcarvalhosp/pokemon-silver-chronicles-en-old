// Helpers for porting scene code that counts raw 40 fps frames and relies on
// mkxp-z's typed Sprite properties.
//
// Plugin scenes like the BW Gender Selector animate with
// `n.times { Graphics.update; ... }` without scaling by Graphics.frame_rate,
// so each step is one 40 fps frame. eachFrame runs the step once per
// original frame (via FrameCounter) while still calling Graphics.update every
// 60 Hz tick, so the animation lasts as long and ends on the same values.
//
// mkxp-z stores Sprite#opacity as an int clamped to 0..255 (floats are
// truncated) and zoom/angle as 32-bit floats. Scenes that do arithmetic on
// those properties (opacity += 25.5, zoom_x != 2.0) need the same rounding to
// end up where the original did.

import { pbUpdateSceneMap } from "../../game/globals";
import { ORIGINAL_FPS } from "../../core/loop";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import type { SpriteHash } from "../fades";
import { FrameCounter } from "../frameTime";

/** `frames.times { Graphics.update; body }` with frames counted at 40 fps. */
export async function eachFrame(frames: number, body: (i: number) => void | Promise<void>): Promise<void> {
  const clock = new FrameCounter();
  let done = 0;
  while (done < frames) {
    await Graphics.update();
    for (let n = clock.tick(); n > 0 && done < frames; n--) {
      await body(done);
      done++;
    }
  }
}

/** pbWait(numFrames) (012_Overworld/001_Overworld.rb), frames at 40 fps. */
export async function pbWait(numFrames: number): Promise<void> {
  const end = Graphics.frameCount + Math.round((numFrames / ORIGINAL_FPS) / Graphics.deltaS);
  while (Graphics.frameCount < end) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

/** Value mkxp-z keeps when assigning Sprite#opacity. */
export function rgssOpacity(value: number): number {
  return Math.min(255, Math.max(0, Math.trunc(value)));
}

/** Value mkxp-z keeps when assigning a float property (zoom_x, angle). */
export const f32 = Math.fround;

/**
 * A scene's @sprites hash. Sprites keep `disposed` private, so they don't fit
 * fades.ts's HashItem structurally; asHash() hands the hash to those helpers.
 */
export type Sprites = Record<string, object | null | undefined>;
export const asHash = (sprites: Sprites): SpriteHash => sprites as unknown as SpriteHash;
