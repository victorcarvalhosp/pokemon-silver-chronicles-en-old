// Port of 005_Sprites/012_Interpolators.rb. Frame counts are whatever the
// caller passes (callers scale by Graphics.frame_rate themselves).

import type { Sprite } from "../../rgss/display";
import { Color, Rect } from "../../rgss/types";

type TweenStep = [number, number] | [Color, Color];

export class Interpolator {
  static readonly ZOOM_X = 1;
  static readonly ZOOM_Y = 2;
  static readonly X = 3;
  static readonly Y = 4;
  static readonly OPACITY = 5;
  static readonly COLOR = 6;
  static readonly WAIT = 7;

  private _tweening = false;
  private tweensteps: (TweenStep | undefined)[] = [];
  private sprite: Sprite | null = null;
  private frames = 0;
  private step = 0;

  tweening(): boolean {
    return this._tweening;
  }

  tween(sprite: Sprite | null, items: [number, number | Color][], frames: number): void {
    this.tweensteps = [];
    if (sprite && !sprite.isDisposed() && frames > 0) {
      this.frames = frames;
      this.step = 0;
      this.sprite = sprite;
      for (const item of items) {
        const target = item[1];
        switch (item[0]) {
          case Interpolator.ZOOM_X:
            this.tweensteps[item[0]] = [sprite.zoomX, (target as number) - sprite.zoomX];
            break;
          case Interpolator.ZOOM_Y:
            this.tweensteps[item[0]] = [sprite.zoomY, (target as number) - sprite.zoomY];
            break;
          case Interpolator.X:
            this.tweensteps[item[0]] = [sprite.x, (target as number) - sprite.x];
            break;
          case Interpolator.Y:
            this.tweensteps[item[0]] = [sprite.y, (target as number) - sprite.y];
            break;
          case Interpolator.OPACITY:
            this.tweensteps[item[0]] = [sprite.opacity, (target as number) - sprite.opacity];
            break;
          case Interpolator.COLOR: {
            const c = target as Color;
            // Color.new clamps each component, as in RGSS.
            this.tweensteps[item[0]] = [sprite.color.clone(),
              new Color(c.red - sprite.color.red, c.green - sprite.color.green,
                c.blue - sprite.color.blue, c.alpha - sprite.color.alpha)];
            break;
          }
        }
      }
      this._tweening = true;
    }
  }

  update(): void {
    if (!this._tweening || !this.sprite) return;
    const t = this.step / this.frames;
    for (let i = 0; i < this.tweensteps.length; i++) {
      const item = this.tweensteps[i];
      if (!item) continue;
      switch (i) {
        case Interpolator.ZOOM_X:
          this.sprite.zoomX = (item[0] as number) + (item[1] as number) * t;
          break;
        case Interpolator.ZOOM_Y:
          this.sprite.zoomY = (item[0] as number) + (item[1] as number) * t;
          break;
        case Interpolator.X:
          this.sprite.x = Math.trunc((item[0] as number) + (item[1] as number) * t);
          break;
        case Interpolator.Y:
          this.sprite.y = Math.trunc((item[0] as number) + (item[1] as number) * t);
          break;
        case Interpolator.OPACITY:
          this.sprite.opacity = Math.min(255, Math.max(0, Math.trunc((item[0] as number) + (item[1] as number) * t)));
          break;
        case Interpolator.COLOR: {
          const [a, b] = item as [Color, Color];
          this.sprite.color = new Color(a.red + b.red * t, a.green + b.green * t, a.blue + b.blue * t, a.alpha + b.alpha * t);
          break;
        }
      }
    }
    this.step += 1;
    if (this.step === this.frames) {
      this.step = 0;
      this.frames = 0;
      this._tweening = false;
    }
  }
}

export class RectInterpolator {
  private oldrect!: Rect;
  private newrect!: Rect;
  private frames = 1;
  private curframe = 0;
  private rect!: Rect;

  constructor(oldrect: Rect, newrect: Rect, frames: number) {
    this.restart(oldrect, newrect, frames);
  }

  restart(oldrect: Rect, newrect: Rect, frames: number): void {
    this.oldrect = oldrect;
    this.newrect = newrect;
    this.frames = Math.max(frames, 1);
    this.curframe = 0;
    this.rect = oldrect.clone();
  }

  set(rect: Rect): void {
    rect.set(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
  }

  done(): boolean {
    return this.curframe > this.frames;
  }

  update(): void {
    if (this.done()) return;
    const t = this.curframe / this.frames;
    const x1 = this.oldrect.x;
    const x2 = this.newrect.x;
    const x = x1 + t * (x2 - x1);
    const y1 = this.oldrect.y;
    const y2 = this.newrect.y;
    const y = y1 + t * (y2 - y1);
    const rx1 = this.oldrect.x + this.oldrect.width;
    const rx2 = this.newrect.x + this.newrect.width;
    const rx = rx1 + t * (rx2 - rx1);
    const ry1 = this.oldrect.y + this.oldrect.height;
    const ry2 = this.newrect.y + this.newrect.height;
    const ry = ry1 + t * (ry2 - ry1);
    const minx = x < rx ? x : rx;
    const maxx = x > rx ? x : rx;
    const miny = y < ry ? y : ry;
    const maxy = y > ry ? y : ry;
    // Rect stores ints in RGSS.
    this.rect.set(Math.trunc(minx), Math.trunc(miny), Math.trunc(maxx - minx), Math.trunc(maxy - miny));
    this.curframe += 1;
  }
}

export class PointInterpolator {
  x = 0;
  y = 0;
  private oldx = 0;
  private oldy = 0;
  private newx = 0;
  private newy = 0;
  private frames = 0;
  private curframe = 0;

  constructor(oldx: number, oldy: number, newx: number, newy: number, frames: number) {
    this.restart(oldx, oldy, newx, newy, frames);
  }

  restart(oldx: number, oldy: number, newx: number, newy: number, frames: number): void {
    this.oldx = oldx;
    this.oldy = oldy;
    this.newx = newx;
    this.newy = newy;
    this.frames = frames;
    this.curframe = 0;
    this.x = oldx;
    this.y = oldy;
  }

  done(): boolean {
    return this.curframe > this.frames;
  }

  update(): void {
    if (this.done()) return;
    const t = this.curframe / this.frames;
    const rx1 = this.oldx;
    const rx2 = this.newx;
    this.x = rx1 + t * (rx2 - rx1);
    const ry1 = this.oldy;
    const ry2 = this.newy;
    this.y = ry1 + t * (ry2 - ry1);
    this.curframe += 1;
  }
}
