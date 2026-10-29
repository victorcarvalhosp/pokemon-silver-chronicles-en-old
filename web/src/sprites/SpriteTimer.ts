// Port of 005_Sprites/002_Sprite_Timer.rb: the "MM:SS" box in the top right
// corner while the event timer (Control Timer) runs. Spriteset_Global owns it.
//
// $game_system.timer counts frames in Ruby (shown as timer / frame_rate); the
// port's GameSystem keeps seconds.

import { G } from "../game/globals";
import type { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Window_AdvancedTextPokemon } from "../ui/windows/SpriteWindowText";

export class SpriteTimer {
  private timer: Window_AdvancedTextPokemon | null = null;
  private totalSec: number | null = null;
  private disposed = false;

  constructor(private viewport: Viewport | null = null) {}

  dispose(): void {
    this.timer?.dispose();
    this.timer = null;
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  update(): void {
    if (this.isDisposed()) return;
    if (G.gameSystem.timerWorking) {
      if (this.timer) this.timer.visible = true;
      if (!this.timer) {
        this.timer = Window_AdvancedTextPokemon.newWithSize("", Graphics.width - 120, 0, 120, 64);
        this.timer.width = this.timer.borderX + 96;
        this.timer.x = Graphics.width - this.timer.width;
        this.timer.viewport = this.viewport;
        this.timer.z = 99998;
      }
      let curtime = Math.floor(G.gameSystem.timer);
      if (curtime < 0) curtime = 0;
      if (curtime !== this.totalSec) {
        // Calculate total number of seconds
        this.totalSec = curtime;
        // Make a string for displaying the timer
        const min = Math.floor(this.totalSec / 60);
        const sec = this.totalSec % 60;
        this.timer.text = `<ac>${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; // _ISPRINTF("<ac>{1:02d}:{2:02d}")
      }
      this.timer.update();
    } else if (this.timer) {
      this.timer.visible = false;
    }
  }
}
