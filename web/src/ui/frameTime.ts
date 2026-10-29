// Essentials counts frames at 40 fps; our logic ticks at 60 Hz. Frame-counted
// logic (text speed, waits, blinking, sprite animations) is ported as-is and
// driven by FrameCounter, which turns elapsed game time (Graphics.deltaS) into
// whole original frames. At 60 Hz that is 0 or 1 original frame per tick
// (two out of every three ticks).

import { ORIGINAL_FPS } from "../core/loop";
import { Graphics } from "../rgss/Graphics";

/** Units of 1/120 s: one 60 Hz tick is 2 units, one 40 fps frame is 3. */
const UNITS_PER_SECOND = 120;
const UNITS_PER_FRAME = UNITS_PER_SECOND / ORIGINAL_FPS;

export class FrameCounter {
  private acc: number;

  /** primed: the first tick() always yields a frame (like the first loop iteration in Ruby). */
  constructor(primed = true) {
    this.acc = primed ? UNITS_PER_FRAME - 2 : 0;
  }

  /** Original frames that elapsed during this logic tick. */
  tick(): number {
    this.acc += Math.round(Graphics.deltaS * UNITS_PER_SECOND);
    const n = Math.floor(this.acc / UNITS_PER_FRAME);
    this.acc -= n * UNITS_PER_FRAME;
    return n;
  }
}

/** Graphics.frame_count as the original game would see it (40 fps frames). */
export function originalFrameCount(): number {
  return Math.floor(Graphics.frameCount * Graphics.deltaS * ORIGINAL_FPS + 1e-6);
}

/** Graphics.frame_rate in Essentials. */
export const FRAME_RATE = ORIGINAL_FPS;
