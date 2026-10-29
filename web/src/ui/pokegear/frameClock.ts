// Timing helpers for scenes that count raw 40 fps frames (not scaled by
// Graphics.frame_rate) while we tick at 60 Hz. Both measure elapsed game
// time (Graphics.frameCount ticks), so they stay right however often the
// scene calls them.

import { ORIGINAL_FPS } from "../../core/loop";
import { Graphics } from "../../rgss/Graphics";

/** Elapsed time in original frames (fractional). */
function nowFrames(): number {
  return Graphics.frameCount * Graphics.deltaS * ORIGINAL_FPS;
}

/** Counts the original frames that passed between calls (e.g. a plane scrolling 2 px per frame). */
export class ElapsedFrames {
  private last = Math.floor(nowFrames() + 1e-6);

  take(): number {
    const now = Math.floor(nowFrames() + 1e-6);
    const n = Math.max(0, now - this.last);
    this.last = now;
    return n;
  }
}

/**
 * `frames.times { Graphics.update }` with frames at 40 fps. Back-to-back
 * waits add up exactly (seven 1-frame waits last 7/40 s); a wait that starts
 * later than the previous one ended counts from now.
 */
export class FrameWaiter {
  private until = 0;

  async wait(frames: number): Promise<void> {
    const now = nowFrames();
    // Continue from the previous deadline if it passed less than a tick ago.
    const base = now - this.until <= Graphics.deltaS * ORIGINAL_FPS + 1e-6 ? this.until : now;
    this.until = base + frames;
    do {
      await Graphics.update();
    } while (nowFrames() + 1e-6 < this.until);
  }
}
