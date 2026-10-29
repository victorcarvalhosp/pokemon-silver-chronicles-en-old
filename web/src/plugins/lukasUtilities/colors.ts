// Luka's Scripting Utilities: the Color and Tone extensions (script.rb:555-574,
// 719-831), as functions. In the game these replace Essentials' versions of
// Color#initialize / #to_i / .parse (Data/Scripts/001_Technical/
// 002_RubyUtilities.rb, ported in core/rubyUtilities.ts); nothing in the game
// relies on the differences, so the rest of the port keeps Essentials' ones.
// mkxp-z stores colour and tone components as floats, so Tone#all and
// Color#darken don't round.

import { Colors } from "../../core/rubyUtilities";
import { Color, Tone } from "../../rgss/types";
import { Env } from "./env";
import { RubyError, strToIHex, toI } from "./rubyHelpers";

/** Ruby's str[a...b]: nil when a is past the end, "" when a is the length. */
function slice(s: string, a: number, b: number): string | null {
  return a > s.length ? null : s.slice(a, b);
}

/** String#to_i(16), raising like nil.to_i(16) does for a missing slice. */
function hexPart(s: string | null): number {
  if (s === null) throw new RubyError("ArgumentError", "wrong number of arguments (given 1, expected 0)");
  return strToIHex(s);
}

/**
 * Color.new(*args): (r, g, b), (r, g, b, a), or one hex number / "#RRGGBB" string.
 * NOTE (Ruby parity, script.rb:728-746): a number is turned into hex without
 * padding (Color.new(0x00FF00) reads "ff00" as red 255, green 0, blue 0;
 * Color.new(255) raises ArgumentError: "ff"[4...6] is nil), a string isn't
 * checked ("255,0,0" reads as 0x25, 0x5, 0), and Color.new() raises.
 */
export function colorNew(...args: unknown[]): Color {
  if (args.length < 1) Env.log.error("Wrong number of arguments! At least 1 is needed!");
  if (args.length === 1) {
    let hex: string | null = null;
    const a = args[0];
    if (typeof a === "number" && Number.isInteger(a)) hex = a.toString(16);
    else if (typeof a === "string") hex = a.replaceAll("#", "");
    if (hex === null) Env.log.error("Wrong type of argument given!");
    const r = hexPart(slice(hex!, 0, 2));
    const g = hexPart(slice(hex!, 2, 4));
    const b = hexPart(slice(hex!, 4, 6));
    return new Color(r, g, b);
  }
  if (args.length === 3 || args.length === 4) {
    if (args.some((v) => typeof v !== "number")) throw new RubyError("TypeError", "no implicit conversion into Float");
    const [r, g, b, al] = args as number[];
    return new Color(r!, g!, b!, al ?? 255);
  }
  throw new RubyError("ArgumentError", `wrong number of arguments (given ${args.length}, expected 0, 3 or 4)`);
}

const hex2 = (v: number) => toI(v).toString(16).toUpperCase().padStart(2, "0");

/** Color#to_hex: "#RRGGBB" (sprintf("%02X") truncates the float components). */
export const colorToHex = (c: Color): string => ("#" + hex2(c.red) + hex2(c.green) + hex2(c.blue)).toUpperCase();

/**
 * Color#to_rgb(hex): [r, g, b] from a hex number or string (the receiver is unused).
 * NOTE (Ruby parity, script.rb:759-765): unlike Color.new it doesn't strip
 * "#", so "#FF0000" gives [0, 0xF0, 0x0] ("#F", "F0", "00").
 */
export function colorToRgb(_c: Color | null, hex: string | number): [number, number, number] {
  const s = typeof hex === "number" ? (Number.isInteger(hex) ? hex.toString(16) : String(hex)) : hex;
  return [hexPart(slice(s, 0, 2)), hexPart(slice(s, 2, 4)), hexPart(slice(s, 4, 6))];
}

/** Color#to_dec: 0xRRGGBB */
export const colorToDec = (c: Color): number => strToIHex(colorToHex(c).replaceAll("#", ""));

/** Color#to_i: alpha << 24 | blue << 16 | green << 8 | red (the byte order of Bitmap#raw_data). */
export const colorToI = (c: Color): number => ((toI(c.alpha) << 24) | (toI(c.blue) << 16) | (toI(c.green) << 8) | toI(c.red)) >>> 0;

/**
 * Color.from_i(value).
 * NOTE (Ruby parity, script.rb:781-787): the body reads `clr`, which doesn't
 * exist, so it always raises NameError.
 */
export function colorFromI(_value: number): Color {
  throw new RubyError("NameError", "undefined local variable or method `clr' for Color:Class");
}

/**
 * Color.parse(color): a Color as is, a "#hex" string or an integer through
 * Color.new, nil for other types.
 * NOTE (Ruby parity, script.rb:797): any string without "#" calls the
 * nonexistent String#include (no "?") and raises NoMethodError, so the
 * "r,g,b" form never works; a Float raises in Color.new.
 */
export function colorParse(color: unknown): Color | null {
  if (color instanceof Color) return color;
  if (typeof color === "string") {
    if (color.includes("#")) return colorNew(color);
    throw new RubyError("NoMethodError", `undefined method \`include' for ${JSON.stringify(color)}:String`);
  }
  if (typeof color === "number") return colorNew(color);
  return null;
}

/** Color.red, Color.green... (the same values as Essentials'). */
export { Colors };

/** Color#darken(amt = 0.2): every channel reduced by amt (alpha back to 255). */
export function colorDarken(c: Color, amt = 0.2): Color {
  return colorNew(c.red - c.red * amt, c.green - c.green * amt, c.blue - c.blue * amt);
}

/** Tone#all: the average of red, green and blue (float division: mkxp-z tones are floats). */
export const toneAll = (t: Tone): number => (t.red + t.green + t.blue) / 3;

/** Tone#all=(val) */
export function setToneAll(t: Tone, val: number): void {
  t.red = val;
  t.green = val;
  t.blue = val;
}
