import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Graphics } from "../../rgss/Graphics";
import { ElapsedFrames, FrameWaiter } from "./frameClock";

// Each Graphics.update() is one 60 Hz tick.
const realUpdate = Graphics.update;
beforeEach(() => {
  Graphics.update = async () => {
    Graphics.frameCount++;
  };
});
afterEach(() => {
  Graphics.update = realUpdate;
});

async function ticksFor(body: () => Promise<void>): Promise<number> {
  const start = Graphics.frameCount;
  await body();
  return Graphics.frameCount - start;
}

describe("FrameWaiter", () => {
  it("adds back-to-back 1-frame waits up exactly (7 frames at 40 fps = 10.5 ticks)", async () => {
    const waiter = new FrameWaiter();
    const ticks = await ticksFor(async () => {
      for (let i = 0; i < 7; i++) await waiter.wait(1);
    });
    expect(ticks).toBe(11);
  });

  it("rounds a single wait up to whole ticks", async () => {
    const waiter = new FrameWaiter();
    expect(await ticksFor(() => waiter.wait(3))).toBe(5); // 4.5 ticks
  });
});

describe("ElapsedFrames", () => {
  it("counts 40 fps frames from elapsed ticks", async () => {
    const clock = new ElapsedFrames();
    let n = 0;
    for (let i = 0; i < 6; i++) {
      await Graphics.update();
      n += clock.take();
    }
    expect(n).toBe(4); // 6 ticks = 0.1 s = 4 frames
  });
});
