// Port of Plugins/Speed Up 2.0 (Better Speed Up): pressing AUX1 (Q) cycles
// the game speed through SPEEDUP_STAGES. Ruby skips the real Graphics.update
// on all but every Nth call; here Graphics.speed runs N logic ticks per tick
// of real time, which is the same thing (logic N times faster, drawn once).
// The plugin's F8 screen capture isn't ported (no ScreenCapture script here).

import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";

export const SPEEDUP_STAGES = [1, 2, 3, 4, 5, 10];

export const SpeedUp = {
  /** $GameSpeed: index into SPEEDUP_STAGES. */
  gameSpeed: 0,
  /** $CanToggle */
  canToggle: true,
};

const inputUpdate = Input.update;
Input.update = function (dt?: number): void {
  inputUpdate.call(Input, dt);
  if (SpeedUp.canToggle && Input.trigger(Input.AUX1)) {
    SpeedUp.gameSpeed += 1;
    if (SpeedUp.gameSpeed >= SPEEDUP_STAGES.length) SpeedUp.gameSpeed = 0;
    Graphics.speed = SPEEDUP_STAGES[SpeedUp.gameSpeed]!;
  }
};
