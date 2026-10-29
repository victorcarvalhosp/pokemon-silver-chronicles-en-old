// Port of Data/Scripts/020_Debug/002_Animation editor/003_AnimEditor_Interpolation.rb:
// paths and interpolation ("Extrapolate Path...": a smooth curve through four
// control points, or a freehand path drawn with the mouse, spread over a
// number of frames for the selected cel).

import { AnimFrame, pbCreateCel } from "../../battle/scene/animationPlayer";
import { getMousePos } from "../../plugins/easyMouse/Mouse";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { _INTL } from "../../ui/messageConfig";
import { KeyboardInput } from "../../ui/textEntry/keyboard";
import { Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { ControlWindow } from "./AnimEditor_ControlsButtons";
import { isFloat, rAdd, rMul, rSub, type RNum } from "./AnimEditor_Data";
import { JsonFloat } from "../DebugMenuExtraCode";
import { editorInputUpdate, type AnimationCanvas } from "./AnimEditor_SceneElements";

/** A Float result (kept as one even when it's integer-valued; see AnimEditor_Data.ts). */
const f = (n: number): RNum => (Number.isInteger(n) ? new JsonFloat(n.toFixed(1)) : n);

//===============================================================================
// Paths and interpolation
//===============================================================================
export class ControlPointSprite extends Sprite {
  dragging = false;

  constructor(red: boolean, viewport: Viewport | null = null) {
    super(viewport);
    this.setBitmap(new Bitmap(6, 6));
    this.bitmap!.fillRect(0, 0, 6, 1, new Color(0, 0, 0));
    this.bitmap!.fillRect(0, 0, 1, 6, new Color(0, 0, 0));
    this.bitmap!.fillRect(0, 5, 6, 1, new Color(0, 0, 0));
    this.bitmap!.fillRect(5, 0, 1, 6, new Color(0, 0, 0));
    const color = red ? new Color(255, 0, 0) : new Color(0, 0, 0);
    this.bitmap!.fillRect(2, 2, 2, 2, color);
    this.x = -6;
    this.y = -6;
    this.visible = false;
    this.dragging = false;
  }

  mouseover(): void {
    if (Input.time(Input.MOUSELEFT) === 0 || !this.dragging) {
      this.dragging = false;
      return;
    }
    const mouse = getMousePos(true);
    if (!mouse) return;
    this.x = Math.min(Math.max(mouse[0], 0), 512);
    this.y = Math.min(Math.max(mouse[1], 0), 384);
  }

  /** hittest? */
  hittest(): boolean {
    if (!this.visible) return true;
    const mouse = getMousePos(true);
    if (!mouse) return false;
    return mouse[0] >= this.x && mouse[0] < this.x + 6 &&
           mouse[1] >= this.y && mouse[1] < this.y + 6;
  }

  inspect(): string {
    return `[${this.x},${this.y}]`;
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this.bitmap?.dispose();
    super.dispose();
  }
}

export class PointSprite extends Sprite {
  constructor(x: number, y: number, viewport: Viewport | null = null) {
    super(viewport);
    this.setBitmap(new Bitmap(2, 2));
    this.bitmap!.fillRect(0, 0, 2, 2, new Color(0, 0, 0));
    this.x = x;
    this.y = y;
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this.bitmap?.dispose();
    super.dispose();
  }
}

export type PathPoint = [RNum, RNum];

export class PointPath {
  private points: PathPoint[] = [];
  private distances: number[] = [];
  private totaldist = 0;

  /** [](x) */
  at(x: number): PathPoint {
    return [...this.points[x]!] as PathPoint;
  }

  /** each: copies of the points */
  *[Symbol.iterator](): IterableIterator<PathPoint> {
    for (const o of this.points) yield [...o] as PathPoint;
  }

  get size(): number {
    return this.points.length;
  }

  get length(): number {
    return this.points.length;
  }

  totalDistance(): number {
    return this.totaldist;
  }

  inspect(): string {
    const p: string[] = [];
    for (const point of this.points) p.push(`[${Math.trunc(Number(point[0]))}, ${Math.trunc(Number(point[1]))}]`);
    return `[${p.join(", ")}]`;
  }

  /** isEndPoint?(x, y) */
  isEndPoint(x: number, y: number): boolean {
    if (this.points.length === 0) return false;
    const index = this.points.length - 1;
    return Number(this.points[index]![0]) === x && Number(this.points[index]![1]) === y;
  }

  addPoint(x: RNum, y: RNum): void {
    this.points.push([x, y]);
    if (this.points.length > 1) {
      const len = this.points.length;
      const dx = Number(this.points[len - 2]![0]) - Number(this.points[len - 1]![0]);
      const dy = Number(this.points[len - 2]![1]) - Number(this.points[len - 1]![1]);
      const dist = Math.sqrt((dx * dx) + (dy * dy));
      this.distances.push(dist);
      this.totaldist += dist;
    }
  }

  clear(): void {
    this.points.length = 0;
    this.distances.length = 0;
    this.totaldist = 0;
  }

  smoothPointPath(frames: number, roundValues = false): PointPath {
    if (frames < 0) throw new RangeError(`frames out of range: ${frames}`); // ArgumentError
    const ret = new PointPath();
    if (this.points.length === 0) return ret;
    const step = 1.0 / frames;
    let t = 0.0;
    for (let n = 0; n < frames + 2; n++) {
      const point = this.pointOnPath(t)!;
      if (roundValues) {
        // Float#round: half away from zero
        const round = (v: RNum) => (isFloat(v) ? Math.sign(Number(v)) * Math.round(Math.abs(Number(v))) : v);
        ret.addPoint(round(point[0]), round(point[1]));
      } else {
        ret.addPoint(point[0], point[1]);
      }
      t += step;
      t = Math.min(1.0, t);
    }
    return ret;
  }

  pointOnPath(t: number): PathPoint | null {
    if (t < 0 || t > 1) throw new RangeError(`t out of range for pointOnPath: ${t}`); // ArgumentError
    if (this.points.length === 0) return null;
    let ret = [...this.points[this.points.length - 1]!] as PathPoint;
    if (this.points.length === 1) return ret;
    let curdist = 0;
    const distForT = this.totaldist * t;
    let i = 0;
    for (const dist of this.distances) {
      curdist += dist;
      if (dist > 0.0 && curdist >= distForT) {
        const distT = f(1.0 - ((curdist - distForT) / dist));
        const dx = rSub(this.points[i + 1]![0], this.points[i]![0]);
        const dy = rSub(this.points[i + 1]![1], this.points[i]![1]);
        ret = [rAdd(this.points[i]![0], rMul(dx, distT)),
          rAdd(this.points[i]![1], rMul(dy, distT))];
        break;
      }
      i += 1;
    }
    return ret;
  }
}

/** p1=prevPoint, p2=startPoint, p3=endPoint, p4=nextPoint, t is from 0 through 1 */
export function catmullRom(p1: number, p2: number, p3: number, p4: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p2) + (t * (p3 - p1)) +
         (t2 * ((2 * p1) - (5 * p2) + (4 * p3) - p4)) +
         (t3 * (p4 - (3 * p3) + (3 * p2) - p1)));
}

/** What a curve's control points are (ControlPointSprites). */
type CurvePoint = { x: number; y: number };

export function getCatmullRomPoint(src: CurvePoint[], t: number): [number, number] {
  let x = 0;
  let y = 0;
  t *= 3.0;
  if (t < 1.0) {
    x = catmullRom(src[0]!.x, src[0]!.x, src[1]!.x, src[2]!.x, t);
    y = catmullRom(src[0]!.y, src[0]!.y, src[1]!.y, src[2]!.y, t);
  } else if (t < 2.0) {
    t -= 1.0;
    x = catmullRom(src[0]!.x, src[1]!.x, src[2]!.x, src[3]!.x, t);
    y = catmullRom(src[0]!.y, src[1]!.y, src[2]!.y, src[3]!.y, t);
  } else {
    t -= 2.0;
    x = catmullRom(src[1]!.x, src[2]!.x, src[3]!.x, src[3]!.x, t);
    y = catmullRom(src[1]!.y, src[2]!.y, src[3]!.y, src[3]!.y, t);
  }
  return [x, y];
}

export function getCurvePoint(src: CurvePoint[], t: number): [number, number] {
  return getCatmullRomPoint(src, t);
}

export function curveToPointPath(curve: CurvePoint[], numpoints: number): PointPath | null {
  if (numpoints < 2) return null;
  const path = new PointPath();
  const step = 1.0 / (numpoints - 1);
  let t = 0.0;
  for (let n = 0; n < numpoints; n++) {
    const point = getCurvePoint(curve, t);
    path.addPoint(f(point[0]), f(point[1])); // catmullRom returns Floats
    t += step;
  }
  return path;
}

/** sprintf("(%d,%d)", ...) of the mouse position */
const mouseText = (mousepos: [number, number] | null) => (mousepos ? `(${mousepos[0]},${mousepos[1]})` : "(??,??)");

export async function pbDefinePath(canvas: AnimationCanvas): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 320);
  sliderwin2.viewport = canvas.viewport;
  sliderwin2.addSlider(_INTL("Number of frames:"), 2, 500, 20);
  sliderwin2.opacity = 200;
  const defcurvebutton = sliderwin2.addButton(_INTL("Define Smooth Curve"));
  const defpathbutton = sliderwin2.addButton(_INTL("Define Freehand Path"));
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  let points: (PointSprite | null)[] = [];
  let path: PointPath | null = null;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(0)) { // Number of frames
      if (path) {
        path = path.smoothPointPath(Number(sliderwin2.value(0)), false);
        let i = 0;
        for (const point of path) {
          if (i < points.length) {
            points[i]!.x = Number(point[0]);
            points[i]!.y = Number(point[1]);
          } else {
            points.push(new PointSprite(Number(point[0]), Number(point[1]), canvas.viewport));
          }
          i += 1;
        }
        for (let j = i; j < points.length; j++) {
          points[j]!.dispose();
          points[j] = null;
        }
        points = points.filter((p) => p !== null);
      }
    } else if (sliderwin2.isChanged(defcurvebutton)) {
      for (const point of points) point!.dispose();
      points.length = 0;
      for (let n = 0; n < 30; n++) {
        const point = new PointSprite(0, 0, canvas.viewport);
        point.visible = false;
        points.push(point);
      }
      const curve = [
        new ControlPointSprite(true, canvas.viewport),
        new ControlPointSprite(false, canvas.viewport),
        new ControlPointSprite(false, canvas.viewport),
        new ControlPointSprite(true, canvas.viewport),
      ];
      let showline = false;
      sliderwin2.visible = false;
      // This window displays the mouse's current position
      const window = Window_UnformattedTextPokemon.newWithSize(
        "", 0, 320 - 64, 128, 64, canvas.viewport,
      );
      for (;;) {
        await Graphics.update();
        editorInputUpdate();
        if (Input.trigger(Input.BACK)) break;
        if (Input.trigger(Input.MOUSELEFT)) {
          for (let j = 0; j < 4; j++) {
            if (!curve[j]!.hittest()) continue;
            if ([1, 2].includes(j) && (!curve[0]!.visible || !curve[3]!.visible)) continue;
            curve[j]!.visible = true;
            for (let k = 0; k < 4; k++) curve[k]!.dragging = (k === j);
            break;
          }
        }
        for (let j = 0; j < 4; j++) curve[j]!.mouseover();
        const mousepos = getMousePos(true);
        const newtext = mouseText(mousepos);
        if (window.text !== newtext) window.text = newtext;
        if (curve[0]!.visible && curve[3]!.visible &&
            !curve[0]!.dragging && !curve[3]!.dragging) {
          for (const point of points) point!.visible = true;
          if (!showline) {
            curve[1]!.visible = true;
            curve[2]!.visible = true;
            // (Sprite#x= keeps an Integer, so the control points are whole pixels.)
            curve[1]!.x = Math.trunc(curve[0]!.x + (0.3333 * (curve[3]!.x - curve[0]!.x)));
            curve[1]!.y = Math.trunc(curve[0]!.y + (0.3333 * (curve[3]!.y - curve[0]!.y)));
            curve[2]!.x = Math.trunc(curve[0]!.x + (0.6666 * (curve[3]!.x - curve[0]!.x)));
            curve[2]!.y = Math.trunc(curve[0]!.y + (0.6666 * (curve[3]!.y - curve[0]!.y)));
          }
          showline = true;
        }
        if (showline) {
          const step = 1.0 / (points.length - 1);
          let t = 0.0;
          for (let i = 0; i < points.length; i++) {
            const point = getCurvePoint(curve, t);
            points[i]!.x = point[0];
            points[i]!.y = point[1];
            t += step;
          }
        }
      }
      window.dispose();
      // dispose temporary path
      for (const point of points) point!.dispose();
      points.length = 0;
      if (showline) {
        path = curveToPointPath(curve, Number(sliderwin2.value(0)));
        // File.open("pointpath.txt","wb") { |f| f.write(path.inspect) }
        for (const point of path!) {
          points.push(new PointSprite(Number(point[0]), Number(point[1]), canvas.viewport));
        }
      }
      for (const point of curve) point.dispose();
      sliderwin2.visible = true;
      continue;
    } else if (sliderwin2.isChanged(defpathbutton)) {
      let canceled = false;
      const pointpath = new PointPath();
      for (const point of points) point!.dispose();
      points.length = 0;
      const window = Window_UnformattedTextPokemon.newWithSize(
        "", 0, 320 - 64, 128, 64, canvas.viewport,
      );
      sliderwin2.visible = false;
      for (;;) {
        await Graphics.update();
        editorInputUpdate();
        if (KeyboardInput.triggerex("ESCAPE")) {
          canceled = true;
          break;
        }
        if (Input.trigger(Input.MOUSELEFT)) break;
        const mousepos = getMousePos(true);
        window.text = mouseText(mousepos);
      }
      while (!canceled) {
        const mousepos = getMousePos(true);
        if (mousepos && !pointpath.isEndPoint(mousepos[0], mousepos[1])) {
          pointpath.addPoint(mousepos[0], mousepos[1]);
          points.push(new PointSprite(mousepos[0], mousepos[1], canvas.viewport));
        }
        window.text = mouseText(mousepos);
        await Graphics.update();
        editorInputUpdate();
        if (KeyboardInput.triggerex("ESCAPE") || Input.time(Input.MOUSELEFT) === 0) break;
      }
      window.dispose();
      // dispose temporary path
      for (const point of points) point!.dispose();
      points.length = 0;
      // generate smooth path from temporary path
      path = pointpath.smoothPointPath(Number(sliderwin2.value(0)), true);
      // redraw path from smooth path
      for (const point of path) {
        points.push(new PointSprite(Number(point[0]), Number(point[1]), canvas.viewport));
      }
      // File.open("pointpath.txt","wb") { |f| f.write(path.inspect) }
      sliderwin2.visible = true;
      continue;
    } else if (sliderwin2.isChanged(okbutton) && path) {
      // File.open("pointpath.txt","wb") { |f| f.write(path.inspect) }
      const neededsize = canvas.currentframe + Number(sliderwin2.value(0));
      if (neededsize > canvas.animation.length) canvas.animation.resize(neededsize);
      const thiscel = canvas.currentCel()!;
      const celnumber = canvas.currentcel;
      for (let i = canvas.currentframe; i < neededsize; i++) {
        let cel = canvas.animation.array[i]![celnumber];
        if (!canvas.animation.array[i]![celnumber]) {
          cel = pbCreateCel(0, 0, thiscel[AnimFrame.PATTERN] as number, canvas.animation.position);
          canvas.animation.array[i]![celnumber] = cel;
        }
        cel![AnimFrame.X] = path.at(i - canvas.currentframe)[0] as number;
        cel![AnimFrame.Y] = path.at(i - canvas.currentframe)[1] as number;
      }
      break;
    } else if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) {
      break;
    }
  }
  // dispose all points
  for (const point of points) point!.dispose();
  points.length = 0;
  sliderwin2.dispose();
}
