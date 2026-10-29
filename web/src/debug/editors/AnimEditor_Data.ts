// The editor-only parts of 011_Battle/006_Other battle code/007_BattleAnimationPlayer.rb
// that aren't methods of PBAnimation/PBAnimations (those are in
// battle/scene/animationPlayer.ts): PBAnimTiming.new and #to_s,
// pbConvertRPGAnimation and RPG::Animation.fromOther/#addSound/#addAnimation.
// Plus what the animation editor needs to stand in for Ruby itself: its
// Integer/Float arithmetic on cel values, Marshal-style deep copies and
// loading/saving web/data/pkmn-animations.json (Data/PkmnAnimations.rxdata).
//
// Floats: the data file keeps Ruby's Floats as it found them ("64.0" for a
// cel X, "255.0" in a flash colour). The editor reads it with
// parseKeepingFloats, which keeps integer-valued floats as JsonFloat (whose valueOf/toString are the
// number and "64.0"), so a file saved without changes is byte-identical and
// Ruby's Integer/Float rules (integer division, `%`, "72.0" after moving a
// float cel 8 pixels) can be followed with the r* helpers below.

import type { AudioRef } from "../../data/events";
import {
  FOCUSTARGET_X, FOCUSTARGET_Y, FOCUSUSER_X, FOCUSUSER_Y, PBAnimation, PBAnimations, pbCreateCel, AnimFrame,
  transformPoint, type Cel, type PBAnimationData, type PBAnimTiming,
} from "../../battle/scene/animationPlayer";
import type { AnimationData } from "../../sprites/SpriteAnimation";
import { DevFiles } from "../devFiles";
import { JsonFloat, pkmnAnimationsJSON } from "../DebugMenuExtraCode";

/** The battle animations file (save_data(..., "Data/PkmnAnimations.rxdata")). */
export const PKMN_ANIMATIONS_FILE = "web/data/pkmn-animations.json";

//===============================================================================
// Ruby numbers
//===============================================================================
/** An Integer, or a Float (a non-integer number, or a JsonFloat for an integer-valued one). */
export type RNum = number | JsonFloat;

/** Float? */
export function isFloat(v: unknown): boolean {
  return v instanceof JsonFloat || (typeof v === "number" && !Number.isInteger(v));
}

function mk(n: number, float: boolean): RNum {
  return float && Number.isFinite(n) && Number.isInteger(n) ? new JsonFloat(n.toFixed(1)) : n;
}

const num = (v: unknown): number => Number(v ?? 0);

/** a + b */
export function rAdd(a: unknown, b: unknown): RNum { return mk(num(a) + num(b), isFloat(a) || isFloat(b)); }
/** a - b */
export function rSub(a: unknown, b: unknown): RNum { return mk(num(a) - num(b), isFloat(a) || isFloat(b)); }
/** a * b */
export function rMul(a: unknown, b: unknown): RNum { return mk(num(a) * num(b), isFloat(a) || isFloat(b)); }
/** a / b (Integer division floors, as Ruby's does) */
export function rDiv(a: unknown, b: unknown): RNum {
  if (isFloat(a) || isFloat(b)) return mk(num(a) / num(b), true);
  if (num(b) === 0) throw new RangeError("divided by 0"); // ZeroDivisionError
  return Math.floor(num(a) / num(b));
}
/** a % b (Ruby's modulo: the sign of b) */
export function rMod(a: unknown, b: unknown): RNum {
  const x = num(a), y = num(b);
  return mk(x - y * Math.floor(x / y), isFloat(a) || isFloat(b));
}

/** What a Float JS would print differently ("64.0", "1.0e-05") becomes while parsing. */
const FLOAT_MARK = "\u0000float:";

/**
 * JSON.parse that keeps the Floats JS would print differently from Ruby
 * (integer-valued ones, exponents) as JsonFloat, and every other number as a
 * plain number. (parseDataJSON keeps every Float, through a reviver, which is
 * much slower on the 16 MB animations file.)
 */
export function parseKeepingFloats(text: string): unknown {
  const out: string[] = [];
  let last = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text.charCodeAt(i);
    if (ch === 34) { // a string: skip it
      i += 1;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 92) i += 2;
        else if (c === 34) { i += 1; break; } else i += 1;
      }
      continue;
    }
    if (ch === 45 || (ch >= 48 && ch <= 57)) { // a number
      const start = i;
      i += 1;
      while (i < n && /[0-9.eE+-]/.test(text[i]!)) i += 1;
      const token = text.slice(start, i);
      if (/[.eE]/.test(token) && String(Number(token)) !== token) {
        out.push(text.slice(last, start), JSON.stringify(FLOAT_MARK + token));
        last = i;
      }
      continue;
    }
    i += 1;
  }
  out.push(text.slice(last));
  return markedFloats(JSON.parse(out.join("")));
}

function markedFloats(v: unknown): unknown {
  if (typeof v === "string") return v.startsWith(FLOAT_MARK) ? new JsonFloat(v.slice(FLOAT_MARK.length)) : v;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (x !== null && typeof x !== "number") v[i] = markedFloats(x);
    }
    return v;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) (v as Record<string, unknown>)[k] = markedFloats((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Marshal.load(Marshal.dump(x)) for the editor's data (JsonFloats are immutable, so they're shared). */
export function deepClone<T>(v: T): T {
  if (Array.isArray(v)) return Array.from(v, (x) => deepClone(x)) as T;
  if (v && typeof v === "object" && !(v instanceof JsonFloat)) {
    if (v instanceof PBAnimation) return clonePBAnimation(v) as T;
    const ret: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) ret[k] = deepClone(x);
    return ret as T;
  }
  return v;
}

function clonePBAnimation(a: PBAnimation): PBAnimation {
  return new PBAnimation({
    id: a.id, name: a.name, graphic: a.graphic, hue: a.hue, position: a.position, speed: a.rawSpeed, scope: a.scope,
    timing: deepClone(a.timing), frames: deepClone(a.array),
  });
}

//===============================================================================
// Loading and saving the animations
//===============================================================================
export interface PkmnAnimationsFile {
  move2anim: unknown[];
  animations: PBAnimations;
}

/** Parses pkmn-animations.json the way the editor keeps it (see the top of this file). */
export function parsePkmnAnimations(text: string): PkmnAnimationsFile {
  const data = parseKeepingFloats(text) as { move2anim: unknown[]; animations: (PBAnimationData | null)[] };
  return {
    move2anim: data.move2anim,
    animations: new PBAnimations(data.animations.map((a) => (a ? new PBAnimation(a) : null))),
  };
}

/**
 * pbLoadBattleAnimations for the editors: the file as it is on disk (through
 * the dev server, so a save shows at once), else as served; null if missing.
 */
export async function loadPkmnAnimationsForEditor(): Promise<PkmnAnimationsFile | null> {
  let text: string | null = null;
  try {
    text = await DevFiles.read(PKMN_ANIMATIONS_FILE);
  } catch {
    text = null;
  }
  if (text === null) {
    try {
      const res = await fetch("/data/pkmn-animations.json", { cache: "no-store" });
      if (res.ok) text = await res.text();
    } catch {
      text = null;
    }
  }
  return text === null ? null : parsePkmnAnimations(text);
}

/** save_data(animations, "Data/PkmnAnimations.rxdata"): the text written. */
export function pkmnAnimationsText(file: PkmnAnimationsFile): string {
  return pkmnAnimationsJSON(file.animations, file.move2anim);
}

/** save_data(animations, "Data/PkmnAnimations.rxdata") (throws if the dev server can't write it). */
export async function savePkmnAnimations(file: PkmnAnimationsFile): Promise<void> {
  await DevFiles.write(PKMN_ANIMATIONS_FILE, pkmnAnimationsText(file));
}

//===============================================================================
// PBAnimTiming
//===============================================================================
/** PBAnimTiming.new(type = 0) */
export function newPBAnimTiming(type = 0): PBAnimTiming {
  return {
    frame: 0,
    timingType: type,
    name: "",
    volume: 80,
    pitch: 100,
    bgX: null,
    bgY: null,
    opacity: null,
    colorRed: null,
    colorGreen: null,
    colorBlue: null,
    colorAlpha: null,
    duration: 5,
    flashScope: 0,
    // Color.new(255, 255, 255, 255): a Color's values are Floats.
    flashColor: [255, 255, 255, 255].map((v) => new JsonFloat(`${v}.0`)) as unknown as number[],
    flashDuration: 5,
  };
}

/** PBAnimTiming#timingType */
export const timingTypeOf = (t: PBAnimTiming): number => t.timingType ?? 0;
/** PBAnimTiming#duration */
export const durationOf = (t: PBAnimTiming): number => t.duration ?? 5;

/** sprintf("%d", v): a nil raises TypeError, a Float is truncated. */
function fmtD(v: unknown): string {
  if (v == null) throw new TypeError("can't convert nil into Integer");
  return String(Math.trunc(Number(v)));
}

/** sprintf("%s", v || "-") */
const orDash = (v: unknown): string => (v == null || v === false ? "-" : String(v));

/** PBAnimTiming#to_s */
export function pbAnimTimingToS(t: PBAnimTiming): string {
  const name = t.name;
  switch (timingTypeOf(t)) {
    case 0:
      return `[${t.frame + 1}] Play SE: ${name ?? ""} (volume ${t.volume}, pitch ${t.pitch})`;
    case 1: {
      let text = `[${fmtD(t.frame + 1)}] Set BG: "${name ?? ""}"`;
      text += ` (color=${orDash(t.colorRed)},${orDash(t.colorGreen)},${orDash(t.colorBlue)},${orDash(t.colorAlpha)})`;
      // NOTE (Ruby parity): %d of a nil opacity raises TypeError (007_BattleAnimationPlayer.rb:294, :316).
      text += ` (opacity=${fmtD(t.opacity)})`;
      text += ` (coords=${orDash(t.bgX)},${orDash(t.bgY)})`;
      return text;
    }
    case 2: {
      let text = `[${fmtD(t.frame + 1)}] Change BG: @${fmtD(durationOf(t))}`;
      if (t.colorRed != null || t.colorGreen != null || t.colorBlue != null || t.colorAlpha != null) {
        text += ` (color=${orDash(t.colorRed)},${orDash(t.colorGreen)},${orDash(t.colorBlue)},${orDash(t.colorAlpha)})`;
      }
      if (t.opacity != null) text += ` (opacity=${fmtD(t.opacity)})`;
      if (t.bgX != null || t.bgY != null) text += ` (coords=${orDash(t.bgX)},${orDash(t.bgY)})`;
      return text;
    }
    case 3: {
      let text = `[${fmtD(t.frame + 1)}] Set FG: "${name ?? ""}"`;
      // NOTE (Ruby parity): `@colorGreen | "-"` (a bitwise or, not ||;
      // 007_BattleAnimationPlayer.rb:313): nil | "-" is true, and an Integer
      // green raises TypeError (String can't be coerced into Integer).
      let green: string;
      if (t.colorGreen == null) green = "true";
      else throw new TypeError("String can't be coerced into Integer");
      text += ` (color=${orDash(t.colorRed)},${green},${orDash(t.colorBlue)},${orDash(t.colorAlpha)})`;
      text += ` (opacity=${fmtD(t.opacity)})`;
      text += ` (coords=${orDash(t.bgX)},${orDash(t.bgY)})`;
      return text;
    }
    case 4: {
      let text = `[${fmtD(t.frame + 1)}] Change FG: @${fmtD(durationOf(t))}`;
      if (t.colorRed != null || t.colorGreen != null || t.colorBlue != null || t.colorAlpha != null) {
        text += ` (color=${orDash(t.colorRed)},${orDash(t.colorGreen)},${orDash(t.colorBlue)},${orDash(t.colorAlpha)})`;
      }
      if (t.opacity != null) text += ` (opacity=${fmtD(t.opacity)})`;
      if (t.bgX != null || t.bgY != null) text += ` (coords=${orDash(t.bgX)},${orDash(t.bgY)})`;
      return text;
    }
  }
  return "";
}

//===============================================================================
// pbConvertRPGAnimation and RPG::Animation (map animations, web/data/animations.json)
//===============================================================================
/** pbConvertRPGAnimation(animation) */
export function pbConvertRPGAnimation(animation: AnimationData): PBAnimation {
  const pbAnim = new PBAnimation();
  pbAnim.id = animation.id;
  pbAnim.name = animation.name;
  pbAnim.graphic = animation.animationName;
  pbAnim.hue = animation.animationHue;
  pbAnim.array.length = 0;
  let yOffset = 0;
  pbAnim.position = animation.position;
  if (animation.position === 0) yOffset = -64;
  if (animation.position === 2) yOffset = 64;
  for (let i = 0; i < animation.frames.length; i++) {
    const frame = pbAnim.addFrame();
    const animFrame = animation.frames[i]!;
    for (let j = 0; j < animFrame.length; j++) { // cell_max
      const data = animFrame[j]!;
      if (data[0] === -1) {
        frame.push(null);
        continue;
      }
      let cel: Cel;
      if (animation.position === 3) { // Screen
        const point = transformPoint(
          -160, 80, 160, -80,
          FOCUSUSER_X, FOCUSUSER_Y,
          FOCUSTARGET_X, FOCUSTARGET_Y,
          data[1]!, data[2]!,
        );
        // transformPoint works in Floats
        cel = pbCreateCel(mk(point[0], true) as number, mk(point[1], true) as number, data[0]!);
      } else {
        cel = pbCreateCel(data[1]!, data[2]! + yOffset, data[0]!);
      }
      cel[AnimFrame.ZOOMX] = data[3]!;
      cel[AnimFrame.ZOOMY] = data[3]!;
      cel[AnimFrame.ANGLE] = data[4]!;
      cel[AnimFrame.MIRROR] = data[5]!;
      cel[AnimFrame.OPACITY] = data[6]!;
      cel[AnimFrame.BLENDTYPE] = 0;
      frame.push(cel);
    }
  }
  for (const timing of animation.timings) {
    const newTiming = newPBAnimTiming();
    newTiming.frame = timing.frame;
    newTiming.name = timing.se.name;
    newTiming.volume = timing.se.volume;
    newTiming.pitch = timing.se.pitch;
    newTiming.flashScope = timing.flashScope;
    newTiming.flashColor = [...timing.flashColor];
    newTiming.flashDuration = timing.flashDuration;
    pbAnim.timing.push(newTiming);
  }
  return pbAnim;
}

/** The parts of RPG::Animation 007_BattleAnimationPlayer.rb adds. */
export const RPGAnimation = {
  /** RPG::Animation.fromOther(otherAnim, id) */
  fromOther(otherAnim: AnimationData, id: number): AnimationData {
    return {
      id,
      name: otherAnim.name,
      animationName: otherAnim.animationName,
      animationHue: otherAnim.animationHue,
      position: otherAnim.position,
      // RPG::Animation.new: one empty frame, no timings
      frameMax: 1,
      frames: [[]],
      timings: [],
    };
  },

  /** animation.addSound(frame, se) */
  addSound(self: AnimationData, frame: number, se: string): void {
    // RPG::Animation::Timing.new (flash_color Color.new(255, 255, 255, 255)), se RPG::AudioFile.new(se, 100)
    self.timings.push({ frame, se: { name: se, volume: 100, pitch: 100 } as AudioRef, flashScope: 0,
      flashColor: [255, 255, 255, 255], flashDuration: 5, condition: 0 });
  },

  /** animation.addAnimation(otherAnim, frame, x, y): frame is zero-based. */
  addAnimation(self: AnimationData, otherAnim: AnimationData, frame: number, x: number, y: number): void {
    if (frame + otherAnim.frames.length >= self.frames.length) {
      const totalframes = frame + otherAnim.frames.length + 1;
      const n = totalframes - self.frames.length;
      for (let i = 0; i < n; i++) self.frames.push([]); // RPG::Animation::Frame.new
    }
    self.frameMax = self.frames.length;
    for (let i = 0; i < otherAnim.frameMax; i++) {
      const thisframe = self.frames[frame + i]!;
      const otherframe = otherAnim.frames[i]!;
      for (let j = 0; j < otherframe.length; j++) {
        const d = otherframe[j]!;
        thisframe.push([d[0]!, d[1]! + x, d[2]! + y, d[3]!, d[4]!, d[5]!, d[6]!, d[7]!]);
      }
    }
    for (const othertiming of otherAnim.timings) {
      self.timings.push({
        frame: frame + othertiming.frame,
        se: { name: othertiming.se.name, volume: othertiming.se.volume, pitch: othertiming.se.pitch } as AudioRef,
        flashScope: othertiming.flashScope,
        flashColor: [...othertiming.flashColor],
        flashDuration: othertiming.flashDuration,
        condition: othertiming.condition,
      });
    }
    // sort! by frame (not stable in Ruby; Array#sort here is)
    self.timings.sort((a, b) => a.frame - b.frame);
  },
};
