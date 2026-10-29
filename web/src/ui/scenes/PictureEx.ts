// Port of 005_Sprites/011_PictureEx.rb.
//
// Delays and durations are given in 1/20 s and scaled by Graphics.frame_rate
// (FRAME_RATE = 60 here), so processes advance once per 60 Hz tick.

import { FRAME_RATE } from "../../game/GameCharacter";
import { pbSEPlay } from "../../game/GameSystem";
import type { Sprite } from "../../rgss/display";
import { Color, Rect, Tone } from "../../rgss/types";
import { f32, rgssOpacity } from "./frames";

export const PictureOrigin = {
  TOP_LEFT: 0,
  CENTER: 1,
  TOP_RIGHT: 2,
  BOTTOM_LEFT: 3,
  LOWER_LEFT: 3,
  BOTTOM_RIGHT: 4,
  LOWER_RIGHT: 4,
  TOP: 5,
  BOTTOM: 6,
  LEFT: 7,
  RIGHT: 8,
} as const;

export const Processes = {
  XY: 0,
  DELTA_XY: 1,
  Z: 2,
  CURVE: 3,
  ZOOM: 4,
  ANGLE: 5,
  TONE: 6,
  COLOR: 7,
  HUE: 8,
  OPACITY: 9,
  VISIBLE: 10,
  BLEND_TYPE: 11,
  SE: 12,
  NAME: 13,
  ORIGIN: 14,
  SRC: 15,
  SRC_SIZE: 16,
  CROP_BOTTOM: 17,
} as const;

export function getCubicPoint2(src: number[], t: number): [number, number] {
  let x0 = src[0]!;
  let y0 = src[1]!;
  let cx0 = src[2]!;
  let cy0 = src[3]!;
  let cx1 = src[4]!;
  let cy1 = src[5]!;
  let x1 = src[6]!;
  let y1 = src[7]!;

  x1 = cx1 + (x1 - cx1) * t;
  x0 = x0 + (cx0 - x0) * t;
  cx0 = cx0 + (cx1 - cx0) * t;
  cx1 = cx0 + (x1 - cx0) * t;
  cx0 = x0 + (cx0 - x0) * t;
  const cx = cx0 + (cx1 - cx0) * t;
  y1 = cy1 + (y1 - cy1) * t;
  y0 = y0 + (cy0 - y0) * t;
  cy0 = cy0 + (cy1 - cy0) * t;
  cy1 = cy0 + (y1 - cy0) * t;
  cy0 = y0 + (cy0 - y0) * t;
  const cy = cy0 + (cy1 - cy0) * t;
  return [cx, cy];
}

/** A callback run when a process ends: a function, or [object, methodName, args]. */
export type PictureCallback = ((picture: PictureEx) => void) | [object, string, unknown[]?];

/** [type, delay, total_duration, frame_counter, cb, ...values] */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Process = [number | null, number, number, number, PictureCallback | null | undefined, ...any[]];

/**
 * Ruby's Integer#/ (floor) on ints, Float#/ otherwise. PictureEx starts x, y,
 * zoom and opacity as Floats (and Tone/Color hold Floats), so those always
 * divide as floats; z and angle start as Integers.
 */
function rdiv(a: number, b: number): number {
  return Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b;
}

//===============================================================================
// PictureEx
//===============================================================================
export class PictureEx {
  x = 0.0; // x-coordinate
  y = 0.0; // y-coordinate
  z: number; // z value
  zoomX = 100.0; // x directional zoom rate
  zoomY = 100.0; // y directional zoom rate
  angle = 0; // rotation angle
  tone = new Tone(0, 0, 0, 0); // tone
  color = new Color(0, 0, 0, 0); // color
  hue = 0; // filename hue
  opacity = 255.0; // opacity level
  visible = true; // visibility boolean
  blendType = 0; // blend method
  name = ""; // file name
  origin: number = PictureOrigin.TOP_LEFT; // starting point
  readonly srcRect = new Rect(0, 0, -1, -1); // source rect
  private _cropBottom = -1; // crops sprite to above this y-coordinate
  readonly frameUpdates: number[] = []; // Array of processes updated in a frame
  // process: [type, delay, total_duration, frame_counter, cb, etc.]
  private processes: (Process | null)[] = [];
  private rotateSpeed = 0;

  constructor(z: number) {
    this.z = z;
  }

  get cropBottom(): number { return this._cropBottom; }

  callback(cb: PictureCallback): void {
    if (typeof cb === "function") {
      cb(this);
    } else if (Array.isArray(cb)) {
      const [obj, method, args] = cb;
      (obj as Record<string, (...a: unknown[]) => void>)[method]!.call(obj, this, ...(args ?? []));
    }
  }

  setCallback(delay: number, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([null, delay, 0, 0, cb]);
  }

  running(): boolean {
    return this.processes.length > 0;
  }

  totalDuration(): number {
    let ret = 0;
    for (const process of this.processes) {
      if (!process) continue;
      const dur = process[1] + process[2];
      if (dur > ret) ret = dur;
    }
    ret *= 20.0 / FRAME_RATE;
    return Math.trunc(ret);
  }

  ensureDelayAndDuration(delay: number, duration: number): [number, number] {
    if (delay < 0) delay = this.totalDuration();
    delay *= FRAME_RATE / 20.0;
    duration *= FRAME_RATE / 20.0;
    return [Math.trunc(delay), Math.trunc(duration)];
  }

  ensureDelay(delay: number): number {
    if (delay < 0) delay = this.totalDuration();
    delay *= FRAME_RATE / 20.0;
    return Math.trunc(delay);
  }

  /**
   * speed is the angle to change by in 1/20 of a second. rotateSpeed is the
   * angle to change by per frame.
   * NOTE: This is not compatible with manually changing the angle at a certain
   *       point. If you make a sprite auto-rotate, you should not try to alter
   *       the angle another way too.
   */
  rotate(speed: number): void {
    this.rotateSpeed = (speed * 20.0) / FRAME_RATE;
    while (this.rotateSpeed < 0) this.rotateSpeed += 360;
    this.rotateSpeed %= 360;
  }

  erase(): void {
    this.name = "";
  }

  clearProcesses(): void {
    this.processes = [];
  }

  adjustPosition(xOffset: number, yOffset: number): void {
    for (const process of this.processes) {
      if (!process || process[0] !== Processes.XY) continue;
      process[5] += xOffset;
      process[6] += yOffset;
      process[7] += xOffset;
      process[8] += yOffset;
    }
  }

  move(delay: number, duration: number, origin: number, x: number, y: number, zoomX = 100.0, zoomY = 100.0, opacity = 255): void {
    this.setOrigin(delay, origin);
    this.moveXY(delay, duration, x, y);
    this.moveZoomXY(delay, duration, zoomX, zoomY);
    this.moveOpacity(delay, duration, opacity);
  }

  moveXY(delay: number, duration: number, x: number, y: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.XY, delay, duration, 0, cb, this.x, this.y, x, y]);
  }

  setXY(delay: number, x: number, y: number, cb: PictureCallback | null = null): void {
    this.moveXY(delay, 0, x, y, cb);
  }

  moveCurve(delay: number, duration: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.CURVE, delay, duration, 0, cb, [this.x, this.y, x1, y1, x2, y2, x3, y3]]);
  }

  moveDelta(delay: number, duration: number, x: number, y: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.DELTA_XY, delay, duration, 0, cb, this.x, this.y, x, y]);
  }

  setDelta(delay: number, x: number, y: number, cb: PictureCallback | null = null): void {
    this.moveDelta(delay, 0, x, y, cb);
  }

  moveZ(delay: number, duration: number, z: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.Z, delay, duration, 0, cb, this.z, z]);
  }

  setZ(delay: number, z: number, cb: PictureCallback | null = null): void {
    this.moveZ(delay, 0, z, cb);
  }

  moveZoomXY(delay: number, duration: number, zoomX: number, zoomY: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.ZOOM, delay, duration, 0, cb, this.zoomX, this.zoomY, zoomX, zoomY]);
  }

  setZoomXY(delay: number, zoomX: number, zoomY: number, cb: PictureCallback | null = null): void {
    this.moveZoomXY(delay, 0, zoomX, zoomY, cb);
  }

  moveZoom(delay: number, duration: number, zoom: number, cb: PictureCallback | null = null): void {
    this.moveZoomXY(delay, duration, zoom, zoom, cb);
  }

  setZoom(delay: number, zoom: number, cb: PictureCallback | null = null): void {
    this.moveZoomXY(delay, 0, zoom, zoom, cb);
  }

  moveAngle(delay: number, duration: number, angle: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.ANGLE, delay, duration, 0, cb, this.angle, angle]);
  }

  setAngle(delay: number, angle: number, cb: PictureCallback | null = null): void {
    this.moveAngle(delay, 0, angle, cb);
  }

  moveTone(delay: number, duration: number, tone: Tone | null, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    const target = tone ? tone.clone() : new Tone(0, 0, 0, 0);
    this.processes.push([Processes.TONE, delay, duration, 0, cb, this.tone.clone(), target]);
  }

  setTone(delay: number, tone: Tone | null, cb: PictureCallback | null = null): void {
    this.moveTone(delay, 0, tone, cb);
  }

  moveColor(delay: number, duration: number, color: Color | null, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    const target = color ? color.clone() : new Color(0, 0, 0, 0);
    this.processes.push([Processes.COLOR, delay, duration, 0, cb, this.color.clone(), target]);
  }

  setColor(delay: number, color: Color | null, cb: PictureCallback | null = null): void {
    this.moveColor(delay, 0, color, cb);
  }

  /** Hue changes don't actually work. */
  moveHue(delay: number, duration: number, hue: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.HUE, delay, duration, 0, cb, this.hue, hue]);
  }

  /** Hue changes don't actually work. */
  setHue(delay: number, hue: number, cb: PictureCallback | null = null): void {
    this.moveHue(delay, 0, hue, cb);
  }

  moveOpacity(delay: number, duration: number, opacity: number, cb: PictureCallback | null = null): void {
    [delay, duration] = this.ensureDelayAndDuration(delay, duration);
    this.processes.push([Processes.OPACITY, delay, duration, 0, cb, this.opacity, opacity]);
  }

  setOpacity(delay: number, opacity: number, cb: PictureCallback | null = null): void {
    this.moveOpacity(delay, 0, opacity, cb);
  }

  setVisible(delay: number, visible: boolean, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.VISIBLE, delay, 0, 0, cb, visible]);
  }

  /** Only values of 0 (normal), 1 (additive) and 2 (subtractive) are allowed. */
  setBlendType(delay: number, blend: number, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.BLEND_TYPE, delay, 0, 0, cb, blend]);
  }

  setSE(delay: number, seFile: string, volume: number | null = null, pitch: number | null = null, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.SE, delay, 0, 0, cb, seFile, volume, pitch]);
  }

  setName(delay: number, name: string, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.NAME, delay, 0, 0, cb, name]);
  }

  setOrigin(delay: number, origin: number, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.ORIGIN, delay, 0, 0, cb, origin]);
  }

  setSrc(delay: number, srcX: number, srcY: number, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.SRC, delay, 0, 0, cb, srcX, srcY]);
  }

  setSrcSize(delay: number, srcWidth: number, srcHeight: number, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.SRC_SIZE, delay, 0, 0, cb, srcWidth, srcHeight]);
  }

  /** Used to cut Pokémon sprites off when they faint and sink into the ground. */
  setCropBottom(delay: number, y: number, cb: PictureCallback | null = null): void {
    delay = this.ensureDelay(delay);
    this.processes.push([Processes.CROP_BOTTOM, delay, 0, 0, cb, y]);
  }

  update(): void {
    let procEnded = false;
    this.frameUpdates.length = 0;
    for (let i = 0; i < this.processes.length; i++) {
      const process = this.processes[i];
      if (!process) continue;
      // Decrease delay of processes that are scheduled to start later
      if (process[1] >= 0) {
        // Set initial values if the process will start this frame
        if (process[1] === 0) {
          switch (process[0]) {
            case Processes.XY:
              process[5] = this.x;
              process[6] = this.y;
              break;
            case Processes.DELTA_XY:
              process[5] = this.x;
              process[6] = this.y;
              process[7] += this.x;
              process[8] += this.y;
              break;
            case Processes.CURVE:
              process[5][0] = this.x;
              process[5][1] = this.y;
              break;
            case Processes.Z:
              process[5] = this.z;
              break;
            case Processes.ZOOM:
              process[5] = this.zoomX;
              process[6] = this.zoomY;
              break;
            case Processes.ANGLE:
              process[5] = this.angle;
              break;
            case Processes.TONE:
              process[5] = this.tone.clone();
              break;
            case Processes.COLOR:
              process[5] = this.color.clone();
              break;
            case Processes.HUE:
              process[5] = this.hue;
              break;
            case Processes.OPACITY:
              process[5] = this.opacity;
              break;
          }
        }
        // Decrease delay counter
        process[1] -= 1;
        // Process hasn't started yet, skip to the next one
        if (process[1] >= 0) continue;
      }
      // Update process
      if (process[0] !== null && !this.frameUpdates.includes(process[0])) this.frameUpdates.push(process[0]);
      const fra = process[2] === 0 ? 1 : process[3]; // Frame counter
      const dur = process[2] === 0 ? 1 : process[2]; // Total duration of process
      switch (process[0]) {
        case Processes.XY:
        case Processes.DELTA_XY:
          this.x = process[5] + (fra * (process[7] - process[5])) / dur;
          this.y = process[6] + (fra * (process[8] - process[6])) / dur;
          break;
        case Processes.CURVE:
          [this.x, this.y] = getCubicPoint2(process[5], fra / dur);
          break;
        case Processes.Z:
          this.z = process[5] + rdiv(fra * (process[6] - process[5]), dur);
          break;
        case Processes.ZOOM:
          this.zoomX = process[5] + (fra * (process[7] - process[5])) / dur;
          this.zoomY = process[6] + (fra * (process[8] - process[6])) / dur;
          break;
        case Processes.ANGLE:
          this.angle = process[5] + rdiv(fra * (process[6] - process[5]), dur);
          break;
        case Processes.TONE: {
          const [a, b] = [process[5] as Tone, process[6] as Tone];
          this.tone.red = a.red + (fra * (b.red - a.red)) / dur;
          this.tone.green = a.green + (fra * (b.green - a.green)) / dur;
          this.tone.blue = a.blue + (fra * (b.blue - a.blue)) / dur;
          this.tone.gray = a.gray + (fra * (b.gray - a.gray)) / dur;
          break;
        }
        case Processes.COLOR: {
          const [a, b] = [process[5] as Color, process[6] as Color];
          this.color.red = a.red + (fra * (b.red - a.red)) / dur;
          this.color.green = a.green + (fra * (b.green - a.green)) / dur;
          this.color.blue = a.blue + (fra * (b.blue - a.blue)) / dur;
          this.color.alpha = a.alpha + (fra * (b.alpha - a.alpha)) / dur;
          break;
        }
        case Processes.HUE:
          this.hue = (process[6] - process[5]) / dur;
          break;
        case Processes.OPACITY:
          this.opacity = process[5] + (fra * (process[6] - process[5])) / dur;
          break;
        case Processes.VISIBLE:
          this.visible = process[5];
          break;
        case Processes.BLEND_TYPE:
          this.blendType = process[5];
          break;
        case Processes.SE:
          pbSEPlay(process[5], process[6] ?? undefined, process[7] ?? undefined);
          break;
        case Processes.NAME:
          this.name = process[5];
          break;
        case Processes.ORIGIN:
          this.origin = process[5];
          break;
        case Processes.SRC:
          this.srcRect.x = process[5];
          this.srcRect.y = process[6];
          break;
        case Processes.SRC_SIZE:
          this.srcRect.width = process[5];
          this.srcRect.height = process[6];
          break;
        case Processes.CROP_BOTTOM:
          this._cropBottom = process[5];
          break;
      }
      // Increase frame counter
      process[3] += 1;
      if (process[3] <= process[2]) continue;
      // Process has ended, erase it
      if (process[4]) this.callback(process[4]);
      this.processes[i] = null;
      procEnded = true;
    }
    // Clear out empty spaces in processes array caused by finished processes
    if (procEnded) this.processes = this.processes.filter((p) => p !== null);
    // Add the constant rotation speed
    if (this.rotateSpeed !== 0) {
      if (!this.frameUpdates.includes(Processes.ANGLE)) this.frameUpdates.push(Processes.ANGLE);
      this.angle += this.rotateSpeed;
      while (this.angle < 0) this.angle += 360;
      this.angle %= 360;
    }
  }
}

//===============================================================================
//
//===============================================================================
/** What setPictureSprite touches; IconSprite adds `name`. */
export type PictureTarget = Sprite & { name?: string };

export function setPictureSprite(sprite: PictureTarget, picture: PictureEx, iconSprite = false): void {
  if (picture.frameUpdates.length === 0) return;
  const hasBitmap = !!sprite.bitmap && !sprite.bitmap.isDisposed();
  for (const type of picture.frameUpdates) {
    switch (type) {
      case Processes.XY:
      case Processes.DELTA_XY:
        sprite.x = Math.round(picture.x);
        sprite.y = Math.round(picture.y);
        break;
      case Processes.Z:
        sprite.z = Math.trunc(picture.z);
        break;
      case Processes.ZOOM:
        sprite.zoomX = f32(picture.zoomX / 100.0);
        sprite.zoomY = f32(picture.zoomY / 100.0);
        break;
      case Processes.ANGLE:
        sprite.angle = f32(picture.angle);
        break;
      case Processes.TONE:
        sprite.tone = picture.tone.clone();
        break;
      case Processes.COLOR:
        sprite.color = picture.color.clone();
        break;
      case Processes.HUE:
        // This doesn't do anything.
        break;
      case Processes.BLEND_TYPE:
        sprite.blendType = picture.blendType;
        break;
      case Processes.OPACITY:
        sprite.opacity = rgssOpacity(picture.opacity);
        break;
      case Processes.VISIBLE:
        sprite.visible = picture.visible;
        break;
      case Processes.NAME:
        if (iconSprite && sprite.name !== picture.name) {
          (sprite as unknown as { setBitmapFile(f: string): void }).setBitmapFile(picture.name);
        }
        break;
      case Processes.ORIGIN:
        switch (picture.origin) {
          case PictureOrigin.TOP_LEFT: case PictureOrigin.LEFT: case PictureOrigin.BOTTOM_LEFT:
            sprite.ox = 0;
            break;
          case PictureOrigin.TOP: case PictureOrigin.CENTER: case PictureOrigin.BOTTOM:
            sprite.ox = hasBitmap ? Math.floor(sprite.srcRect.width / 2) : 0;
            break;
          case PictureOrigin.TOP_RIGHT: case PictureOrigin.RIGHT: case PictureOrigin.BOTTOM_RIGHT:
            sprite.ox = hasBitmap ? sprite.srcRect.width : 0;
            break;
        }
        switch (picture.origin) {
          case PictureOrigin.TOP_LEFT: case PictureOrigin.TOP: case PictureOrigin.TOP_RIGHT:
            sprite.oy = 0;
            break;
          case PictureOrigin.LEFT: case PictureOrigin.CENTER: case PictureOrigin.RIGHT:
            sprite.oy = hasBitmap ? Math.floor(sprite.srcRect.height / 2) : 0;
            break;
          case PictureOrigin.BOTTOM_LEFT: case PictureOrigin.BOTTOM: case PictureOrigin.BOTTOM_RIGHT:
            sprite.oy = hasBitmap ? sprite.srcRect.height : 0;
            break;
        }
        break;
      case Processes.SRC:
        if (!iconSprite) break;
        sprite.srcRect.x = picture.srcRect.x;
        sprite.srcRect.y = picture.srcRect.y;
        break;
      case Processes.SRC_SIZE:
        if (!iconSprite) break;
        sprite.srcRect.width = picture.srcRect.width;
        sprite.srcRect.height = picture.srcRect.height;
        break;
    }
  }
  if (iconSprite && picture.cropBottom >= 0) {
    const spriteBottom = sprite.y - sprite.oy + sprite.srcRect.height;
    if (spriteBottom > picture.cropBottom) {
      sprite.srcRect.height = Math.max(picture.cropBottom - sprite.y + sprite.oy, 0);
    }
  }
}

export function setPictureIconSprite(sprite: PictureTarget, picture: PictureEx): void {
  setPictureSprite(sprite, picture, true);
}
