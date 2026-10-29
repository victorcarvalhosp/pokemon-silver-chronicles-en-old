// Port of 004_Game classes/001_Game_Screen.rb and 003_Game_Picture.rb.
//
// Durations are in seconds and converted to 60 Hz ticks, matching
// Essentials' `param * frame_rate / 20`. Per-frame increments Essentials
// never scaled (shake, picture rotation) use ORIGINAL_STEP so they move at
// the speed they had at the original 40 fps.

import { TICK } from "../core/loop";
import { Weather } from "../data/gameData/weather";
import { Color, Tone } from "../rgss/types";

/** Ratio of an original 40 fps frame to one of our ticks. */
export const ORIGINAL_STEP = 40 / 60;

export const ticks = (seconds: number) => Math.round(seconds / TICK);

export class GamePicture {
  name = "";
  origin = 0;
  x = 0;
  y = 0;
  zoomX = 100;
  zoomY = 100;
  opacity = 255;
  blendType = 1;
  angle = 0;
  tone = new Tone();
  private duration = 0;
  private targetX = 0;
  private targetY = 0;
  private targetZoomX = 100;
  private targetZoomY = 100;
  private targetOpacity = 255;
  private rotateSpeed = 0;
  private toneTarget = new Tone();
  private toneDuration = 0;

  constructor(readonly number: number) {}

  show(name: string, origin: number, x: number, y: number, zoomX = 100, zoomY = 100, opacity = 255, blendType = 0): void {
    this.name = name;
    this.origin = origin;
    this.x = x;
    this.y = y;
    this.zoomX = zoomX;
    this.zoomY = zoomY;
    this.opacity = opacity;
    this.blendType = blendType || 0;
    this.duration = 0;
    this.targetX = x;
    this.targetY = y;
    this.targetZoomX = zoomX;
    this.targetZoomY = zoomY;
    this.targetOpacity = opacity;
    this.tone = new Tone();
    this.toneTarget = new Tone();
    this.toneDuration = 0;
    this.angle = 0;
    this.rotateSpeed = 0;
  }

  move(seconds: number, origin: number, x: number, y: number, zoomX: number, zoomY: number, opacity: number, blendType: number): void {
    this.duration = ticks(seconds);
    this.origin = origin;
    this.targetX = x;
    this.targetY = y;
    this.targetZoomX = zoomX;
    this.targetZoomY = zoomY;
    this.targetOpacity = opacity;
    this.blendType = blendType || 0;
  }

  rotate(speed: number): void {
    this.rotateSpeed = speed;
  }

  startToneChange(tone: Tone, seconds: number): void {
    this.toneTarget = tone.clone();
    this.toneDuration = ticks(seconds);
    if (this.toneDuration === 0) this.tone = this.toneTarget.clone();
  }

  erase(): void {
    this.name = "";
  }

  update(): void {
    if (this.duration >= 1) {
      const d = this.duration;
      this.x = (this.x * (d - 1) + this.targetX) / d;
      this.y = (this.y * (d - 1) + this.targetY) / d;
      this.zoomX = (this.zoomX * (d - 1) + this.targetZoomX) / d;
      this.zoomY = (this.zoomY * (d - 1) + this.targetZoomY) / d;
      this.opacity = (this.opacity * (d - 1) + this.targetOpacity) / d;
      this.duration -= 1;
    }
    if (this.toneDuration >= 1) {
      stepTone(this.tone, this.toneTarget, this.toneDuration);
      this.toneDuration -= 1;
    }
    if (this.rotateSpeed !== 0) {
      this.angle += (this.rotateSpeed / 2) * ORIGINAL_STEP;
      this.angle = ((this.angle % 360) + 360) % 360;
    }
  }
}

function stepTone(tone: Tone, target: Tone, d: number): void {
  tone.red = (tone.red * (d - 1) + target.red) / d;
  tone.green = (tone.green * (d - 1) + target.green) / d;
  tone.blue = (tone.blue * (d - 1) + target.blue) / d;
  tone.gray = (tone.gray * (d - 1) + target.gray) / d;
}

export class GameScreen {
  brightness = 255;
  tone = new Tone();
  flashColor = new Color(0, 0, 0, 0);
  shake = 0;
  weatherType = "None";
  weatherMax = 0;
  weatherDuration = 0;
  readonly pictures: GamePicture[] = [];
  private toneTarget = new Tone();
  private toneDuration = 0;
  private flashDuration = 0;
  private shakePower = 0;
  private shakeSpeed = 0;
  private shakeDuration = 0;
  private shakeDirection = 1;

  constructor() {
    for (let i = 0; i <= 100; i++) this.pictures.push(new GamePicture(i));
  }

  startToneChange(tone: Tone, seconds: number): void {
    this.toneTarget = tone.clone();
    this.toneDuration = ticks(seconds);
    if (this.toneDuration === 0) this.tone = this.toneTarget.clone();
  }

  /** True while a tone change is in progress. */
  toneChanging(): boolean {
    return this.toneDuration > 0;
  }

  startFlash(color: Color, seconds: number): void {
    this.flashColor = color.clone();
    this.flashDuration = ticks(seconds);
  }

  startShake(power: number, speed: number, seconds: number): void {
    this.shakePower = power;
    this.shakeSpeed = speed;
    this.shakeDuration = ticks(seconds);
  }

  /** Set Weather. `seconds` is the fade duration (Ruby: 1/20ths of a second); RPG::Weather only checks it's > 0. */
  weather(type: string | number, power: number, seconds: number): void {
    this.weatherType = Weather.get(type).id;
    const max = (power + 1) * 60; // * RPG::Weather::MAX_SPRITES
    this.weatherMax = Number.isInteger(max) ? Math.floor(max / 10) : max / 10;
    this.weatherDuration = seconds;
  }

  update(inBattle: boolean): void {
    if (this.toneDuration >= 1) {
      stepTone(this.tone, this.toneTarget, this.toneDuration);
      this.toneDuration -= 1;
    }
    if (this.flashDuration >= 1) {
      const d = this.flashDuration;
      this.flashColor.alpha = (this.flashColor.alpha * (d - 1)) / d;
      this.flashDuration -= 1;
    }
    if (this.shakeDuration >= 1 || this.shake !== 0) {
      const delta = ((this.shakePower * this.shakeSpeed * this.shakeDirection) / 10) * ORIGINAL_STEP;
      if (this.shakeDuration <= 1 && this.shake * (this.shake + delta) < 0) this.shake = 0;
      else this.shake += delta;
      if (this.shake > this.shakePower * 2) this.shakeDirection = -1;
      if (this.shake < -this.shakePower * 2) this.shakeDirection = 1;
      if (this.shakeDuration >= 1) this.shakeDuration -= 1;
    }
    const [from, to] = inBattle ? [51, 100] : [1, 50];
    for (let i = from; i <= to; i++) this.pictures[i]!.update();
  }
}
