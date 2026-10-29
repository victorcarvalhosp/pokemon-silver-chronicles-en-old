// Port of Plugins/ExperimentWithScene/Math Functions.rb ("Elite Battle: DX
// Utilities for various calculations", trimmed by the game's author): the
// camera Vector, calculateCurve, singleDecInt? and three methods the plugin
// adds to Battle::Scene.
//
// The plugin is an unfinished experiment: nothing else in the game uses any
// of this (Elite Battle: DX isn't installed, no other plugin calls
// calculateCurve/singleDecInt?/alignSprites/getRealVector/
// applySpriteProperties), so the Battle::Scene methods are plain functions
// taking the scene instead of being added to BattleScene.

import { rand } from "../../core/random";
import { rubyNoMethodError } from "../../game/scripts/rubyErrors";
import type { Sprite } from "../../rgss/display";
import { getCubicPoint2 } from "../../ui/scenes/PictureEx";
import { FRAME_RATE } from "../../ui/frameTime";
import { MyUI, type VectorData } from "./MyUIModule";

/** Ruby's TypeError for Math.cos(nil) / Math.sin(nil). */
function toFloat(v: unknown): number {
  if (typeof v !== "number") throw new TypeError(`can't convert ${v == null ? "nil" : typeof v} into Float`);
  return v;
}

export class Vector {
  private _x: number;
  private _y: number;
  private _angle: number;
  private _scale: number;
  x2 = 0;
  y2 = 0;
  zoom1: number;
  zoom2: number;
  inc: number;
  /**
   * @set (attr_accessor :set, whose reader the set method below replaces).
   * NOTE (Ruby parity): Math Functions.rb:22 starts it as
   * [x, y, scale, angle, zoom1, zoom2] while update (:135-136) reads [2] as
   * the angle and [3] as the scale, so updating before the first set swaps
   * them. set() stores the caller's array itself, not a copy.
   */
  setValues: number[];
  battle: unknown = false;
  private _locked = false;
  private _force = false;
  private constant = 1;

  /** class constructor */
  constructor(x = 0, y = 0, angle = 0, scale = 1, zoom1 = 1, zoom2 = 1) {
    this._x = x;
    this._y = y;
    this._angle = angle;
    this._scale = scale;
    this.zoom1 = zoom1;
    this.zoom2 = zoom2;
    this.inc = 0.2;
    this.setValues = [this._x, this._y, this._scale, this._angle, this.zoom1, this.zoom2];
    this.calculate();
  }

  /** calculates the final positioning based on recorded vector data */
  calculate(): void {
    const angle = this._angle * (Math.PI / 180);
    const width = Math.cos(angle) * this._scale;
    const height = Math.sin(angle) * this._scale;
    this.x2 = this._x + width;
    this.y2 = this._y - height;
  }

  /**
   * returns finalized positioning of applied vector. The angle isn't turned
   * into radians (that line is commented out in Ruby). NOTE (Ruby parity):
   * a Vector argument isn't an Array, so it's splatted as x with every other
   * value nil, and Math.cos(nil) raises TypeError (MyUI_Scene.rb's
   * pbStartScene calls @vector.spoof(@vector)).
   */
  spoof(...args: unknown[]): [number, number] {
    const [x, y, angle, scale] = (Array.isArray(args[0]) ? args[0] : args) as unknown[];
    const width = Math.cos(toFloat(angle)) * toFloat(scale);
    const height = Math.sin(toFloat(angle)) * toFloat(scale);
    const x2 = toFloat(x) + width;
    const y2 = toFloat(y) - height;
    return [x2, y2];
  }

  get angle(): number { return this._angle; }
  /** sets vector angle */
  set angle(val: number) {
    this._angle = val;
    this.calculate();
  }

  get scale(): number { return this._scale; }
  /** sets vector scale */
  set scale(val: number) {
    this._scale = val;
    this.calculate();
  }

  get x(): number { return this._x; }
  /** sets vector start X position */
  set x(val: number) {
    this._x = val;
    this.setValues[0] = val;
    this.calculate();
  }

  get y(): number { return this._y; }
  /** sets vector start Y position */
  set y(val: number) {
    this._y = val;
    this.setValues[1] = val;
    this.calculate();
  }

  /** forces vector into position */
  force(): void {
    this._force = true;
  }

  /** resets vector to original position */
  reset(): void {
    this.inc = 0.2;
    this.set(MyUI.getVector("MAIN", this.battle));
  }

  /** sets next vector parameters */
  set(...args: (number | number[])[]): void {
    // return if MyUI::DISABLE_SCENE_MOTION && !@force
    this._force = false;
    this.setValues = Array.isArray(args[0]) ? args[0] : (args as number[]);
    this.constant = rand(4) + 1;
  }

  /** sets both start X and Y */
  setXY(x: number, y: number): void {
    this.setValues[0] = x;
    this.setValues[1] = y;
  }

  /** checks if vector is locked into position */
  locked(): boolean {
    return this._locked;
  }

  /** toggles vector lock into position */
  lock(): void {
    this._locked = !this._locked;
  }

  /** updates vector calculation based on incremental speed */
  update(): void {
    const s = this.setValues;
    this._x += ((s[0]! - this._x) * this.inc) / this.delta();
    this._y += ((s[1]! - this._y) * this.inc) / this.delta();
    this._angle += ((s[2]! - this._angle) * this.inc) / this.delta();
    this._scale += ((s[3]! - this._scale) * this.inc) / this.delta();
    this.zoom1 += ((s[4]! - this.zoom1) * this.inc) / this.delta();
    this.zoom2 += ((s[5]! - this.zoom2) * this.inc) / this.delta();
    this.calculate();
  }

  /** gets array of current values */
  get(): VectorData {
    return [this._x, this._y, this._angle, this._scale, this.zoom1, this.zoom2];
  }

  /** checks if vector has moved to next target */
  finished(): boolean {
    return Math.abs((this.setValues[0]! - this._x) * this.inc) <= 0.00001 * this.constant;
  }

  /** get delta shift (Graphics.frame_rate/40.0: 1 at the original 40 fps) */
  delta(): number {
    return FRAME_RATE / 40.0;
  }
}

//===============================================================================
// calculates curve based on 3 points and number of frames
//===============================================================================
export function calculateCurve(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, frames = 10): [number, number][] {
  const output: [number, number][] = [];
  const curve = [x1, y1, x2, y2, x3, y3, x3, y3];
  const step = 1.0 / frames;
  let t = 0.0;
  for (let i = 0; i < frames; i++) {
    const point = getCubicPoint2(curve, t);
    output.push([point[0], point[1]]);
    t += step;
  }
  return output;
}

//===============================================================================
// checks if number is single decimal integer
//===============================================================================
export function singleDecInt(number: number): boolean {
  number *= 10;
  return number % 10 === 0; // (Ruby's % and JS's differ only in sign; zero either way)
}

//===============================================================================
// Battle::Scene additions
//===============================================================================
interface SceneLike { battle?: unknown }

/**
 * aligns sprite to target. NOTE (Ruby parity): getCenter is Elite Battle:
 * DX's and isn't defined in this game, so this raises NoMethodError after
 * setting ox/oy (Math Functions.rb:191).
 */
export function alignSprites(_scene: SceneLike, sprite: Sprite, _target: Sprite): void {
  sprite.ox = Math.floor(sprite.srcRect.width / 2);
  sprite.oy = Math.floor(sprite.srcRect.height / 2);
  rubyNoMethodError("undefined method `getCenter'");
}

/**
 * get actual vector positioning depending on battle type and target index.
 * NOTE (Ruby parity): Battle has no doublebattle?/triplebattle? in v20.1
 * (Elite Battle: DX's), so this raises NoMethodError (Math Functions.rb:199).
 */
export function getRealVector(_scene: SceneLike, _targetindex: number, player: unknown): VectorData {
  MyUI.getVector("BATTLER", player);
  rubyNoMethodError("undefined method `doublebattle?'");
}

/** clones sprite properties from one sprite to the other */
export function applySpriteProperties(sprite1: Sprite, sprite2: Sprite): void {
  sprite2.x = sprite1.x;
  sprite2.y = sprite1.y;
  sprite2.z = sprite1.z;
  sprite2.zoomX = sprite1.zoomX;
  sprite2.zoomY = sprite1.zoomY;
  sprite2.opacity = sprite1.opacity;
  sprite2.angle = sprite1.angle;
  sprite2.tone = sprite1.tone;
  sprite2.color = sprite1.color;
  sprite2.visible = sprite1.visible;
}
