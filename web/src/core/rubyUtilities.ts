// Port of Data/Scripts/001_Technical/002_RubyUtilities.rb: Essentials'
// additions to Ruby's core classes, as functions (TypeScript doesn't patch
// String/Array/Hash). Object#inspect and Class#to_sym only matter to Ruby's
// own debugging and have no equivalent here.

import { _INTL } from "./intl";
import { rand as randN } from "./random";
import { Color } from "../rgss/types";

//===============================================================================
// class String
//===============================================================================
export function startsWithVowel(str: string): boolean {
  return ["a", "e", "i", "o", "u"].includes(str.charAt(0).toLowerCase());
}

export const first = (str: string, n = 1): string => str.slice(0, n);
export const last = (str: string, n = 1): string => (n > str.length ? str : str.slice(-n));
export const blank = (str: string): boolean => str.trim() === "";

/** String#cut(bitmap, width): the text cut to fit `width`, with "..." when cut. */
export function cut(str: string, bitmap: { textSize(text: string): { width: number } }, width: number): string {
  width -= bitmap.textSize("...").width;
  let stringWidth = 0;
  const text: string[] = [];
  const chars = [...str].filter((c) => c !== "\n"); // scan(/./)
  for (const char of chars) {
    const wdh = bitmap.textSize(char).width;
    if (wdh + stringWidth > width) continue;
    stringWidth += wdh;
    text.push(char);
  }
  if (text.length < str.length) text.push("...");
  return text.join("");
}

export const isNumeric = (str: string): boolean => /^[+-]?\d+(?:\.\d+)?$/.test(str);

//===============================================================================
// class Numeric
//===============================================================================
/** Turns a number into a string formatted like 12,345,678. */
export function toSFormatted(n: number): string {
  return [...[...String(n)].reverse().join("").replace(/(\d{3})(?=\d)/g, "$1,")].reverse().join("");
}

export function toWord(n: number): string {
  const ret = [_INTL("zero"), _INTL("one"), _INTL("two"), _INTL("three"),
    _INTL("four"), _INTL("five"), _INTL("six"), _INTL("seven"),
    _INTL("eight"), _INTL("nine"), _INTL("ten"), _INTL("eleven"),
    _INTL("twelve"), _INTL("thirteen"), _INTL("fourteen"), _INTL("fifteen"),
    _INTL("sixteen"), _INTL("seventeen"), _INTL("eighteen"), _INTL("nineteen"),
    _INTL("twenty")];
  // NOTE (Ruby parity): `self <= ret.length` lets 21 through, which is nil
  // (to_word returns nil), 002_RubyUtilities.rb:78.
  if (Number.isInteger(n) && n >= 0 && n <= ret.length) return ret[n] as string;
  return String(n);
}

//===============================================================================
// class Array
//===============================================================================
/** Array#^: the xor of two arrays ((self | other) - (self & other)). */
export function arrayXor<T>(a: readonly T[], b: readonly T[]): T[] {
  const union = [...new Set([...a, ...b])];
  return union.filter((x) => !(a.includes(x) && b.includes(x)));
}

export function arraySwap<T>(arr: T[], val1: T, val2: T): void {
  const index1 = arr.indexOf(val1);
  const index2 = arr.indexOf(val2);
  arr[index1] = val2;
  arr[index2] = val1;
}

//===============================================================================
// class Hash
//===============================================================================
type Hash = Record<string, unknown>;
const isHash = (v: unknown): v is Hash => !!v && typeof v === "object" && !Array.isArray(v);

export function deepMerge(self: Hash, hash: unknown): Hash {
  const merged = { ...self };
  if (isHash(hash)) deepMergeBang(merged, hash);
  return merged;
}

export function deepMergeBang(self: Hash, hash: unknown): void {
  if (!isHash(hash)) return; // failsafe
  for (const [key, val] of Object.entries(hash)) {
    if (isHash(self[key])) deepMergeBang(self[key], val);
    else self[key] = val;
  }
}

/** Enumerable#transform */
export const transform = <T, U>(list: Iterable<T>, fn: (item: T) => U): U[] => [...list].map(fn);

//===============================================================================
// class File (through the dev server's file endpoint, docs/data.md)
//===============================================================================
/** File.copy(source, destination) */
export async function fileCopy(source: string, destination: string): Promise<void> {
  const { DevFiles } = await import("../debug/devFiles");
  const content = await DevFiles.read(source);
  if (content == null) throw new Error(`No such file - ${source}`);
  await DevFiles.write(destination, content);
}

/** File.move(source, destination) */
export async function fileMove(source: string, destination: string): Promise<void> {
  const { DevFiles } = await import("../debug/devFiles");
  await DevFiles.move(source, destination);
}

//===============================================================================
// class Color
//===============================================================================
/** Color.new(*args): also accepts a hex number or string, or an "r,g,b(,a)" string. */
export function colorNew(...args: (number | string)[]): Color {
  if (args.length < 1) throw new Error("Wrong number of arguments! At least 1 is needed!");
  if (args.length === 1) {
    let hex: string | null = null;
    const a = args[0]!;
    if (typeof a === "number") {
      hex = a.toString(16);
    } else {
      const tryRgbFormat = a.split(",");
      if (tryRgbFormat.length >= 3 && tryRgbFormat.length <= 4) {
        const [r, g, b, al] = tryRgbFormat.map((s) => parseInt(s, 10) || 0);
        return new Color(r!, g!, b!, al ?? 255);
      }
      hex = a.replaceAll("#", "");
    }
    return new Color(parseInt(hex.slice(0, 2), 16) || 0, parseInt(hex.slice(2, 4), 16) || 0, parseInt(hex.slice(4, 6), 16) || 0);
  }
  const [r, g, b, al] = args.map(Number);
  return new Color(r!, g!, b!, al ?? 255);
}

/** Color#to_hex: "#RRGGBB" */
export function colorToHex(c: Color): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return ("#" + h(c.red) + h(c.green) + h(c.blue)).toUpperCase();
}

/** Color#to_i: a 24-bit integer */
export const colorToI = (c: Color): number => parseInt(colorToHex(c).slice(1), 16);

/** Color.hex_to_rgb(hex) */
export function hexToRgb(hex: string | number): [number, number, number] {
  const s = typeof hex === "number" ? hex.toString(16) : hex.replaceAll("#", "");
  return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
}

/** Color.parse(color): nil for anything but a Color, String or Numeric. */
export function colorParse(color: unknown): Color | null {
  if (color instanceof Color) return color;
  if (typeof color === "string" || typeof color === "number") return colorNew(color);
  return null;
}

/** Commonly used colors (Color.red, Color.green...) */
export const Colors = {
  red: () => new Color(255, 0, 0),
  green: () => new Color(0, 255, 0),
  blue: () => new Color(0, 0, 255),
  black: () => new Color(0, 0, 0),
  white: () => new Color(255, 255, 255),
  yellow: () => new Color(255, 255, 0),
  magenta: () => new Color(255, 0, 255),
  teal: () => new Color(0, 255, 255),
  orange: () => new Color(255, 155, 0),
  purple: () => new Color(155, 0, 255),
  brown: () => new Color(112, 72, 32),
};

//===============================================================================
// Wraps a code block in a class that passes data to it (Ruby: as instance
// variables of the block's self; here as `this`).
//===============================================================================
export class CallbackWrapper {
  private params: Record<string, unknown> = {};

  constructor(private codeBlock: ((this: Record<string, unknown>, ...args: unknown[]) => unknown) | null = null) {}

  execute(givenBlock: ((this: Record<string, unknown>, ...args: unknown[]) => unknown) | null = null, ...args: unknown[]): unknown {
    const executeBlock = givenBlock ?? this.codeBlock;
    const self: Record<string, unknown> = { args };
    for (const [key, value] of Object.entries(this.params)) self[key] = value;
    return executeBlock?.apply(self, args);
  }

  set(params: Record<string, unknown> = {}): void {
    this.params = params;
  }
}

//===============================================================================
// Kernel methods
//===============================================================================
/** Kernel.rand(a, b): rand(n), rand(a, b) inclusive, or a float without arguments. */
export function rand(a: number | [number, number] | null = null, b: number | null = null): number {
  if (Array.isArray(a)) return a[0] + randN(a[1] - a[0] + 1); // a Range
  if (typeof a === "number") return typeof b === "number" ? a + randN(b - a + 1) : randN(a);
  if (a == null && typeof b === "number") return randN(b);
  return randN(0);
}

export function nilOrEmpty(string: unknown): boolean {
  return string == null || typeof string !== "string" || string.length === 0;
}
