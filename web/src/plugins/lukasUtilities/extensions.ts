// Luka's Scripting Utilities (Plugins/Luka's Scripting Utilities/script.rb):
// the Numeric, String, Array and Hash extensions (script.rb:8-36, 113-228),
// as functions taking the receiver first.
//
// Graphics.frame_rate is the port's logic rate (FRAME_RATE = 60 in
// game/GameCharacter.ts: one update per 60 Hz tick), so Numeric#delta scales
// by 60 / 40 = 1.5 exactly as the plugin intends for frame rates above 40.

import { TICK_RATE } from "../../core/loop";
import { rclone, RubyError, toI, truthy } from "./rubyHelpers";

/** Graphics.frame_rate as the port's frame-counted code sees it (see GameCharacter.ts). */
export const FRAME_RATE = TICK_RATE;

//===============================================================================
//  Numeric
//===============================================================================
/** Numeric#delta(type = :add, round = true): a frame count / per-frame amount scaled for the frame rate. */
export function delta(value: number, type: "add" | "sub" | string = "add", round = true, frameRate = FRAME_RATE): number {
  const d = frameRate / 40.0;
  const a = round ? toI(value * d) : value * d;
  const s = round ? Math.floor(value / d) : value / d;
  return type === "add" ? a : s;
}
export const deltaAdd = (value: number, round = true, frameRate = FRAME_RATE): number => delta(value, "add", round, frameRate);
export const deltaSub = (value: number, round = true, frameRate = FRAME_RATE): number => delta(value, "sub", round, frameRate);

// NOTE (Ruby parity): script.rb:29-35 aliases Numeric#round to quick_mafs and
// redefines Numeric#round(n). Integer and Float define their own #round, so
// the override never runs for any number the game has; Ruby's own rounding is
// what everything gets. Nothing to port.

//===============================================================================
//  String
//===============================================================================
/** String#bytes (its UTF-8 bytes). */
export const stringBytes = (s: string): number[] => [...new TextEncoder().encode(s)];

/**
 * String#is_numeric?: true when every character but "." and "-" is a digit.
 * NOTE (Ruby parity, script.rb:128-133): "", "-", "." and "1-2.3.4" are all
 * numeric; a newline is skipped (scan(/./) doesn't match it).
 */
export function isNumeric(s: string): boolean {
  for (const c of s.replaceAll(".", "").replaceAll("-", "")) {
    if (c === "\n") continue;
    if (c < "0" || c > "9" || c.length !== 1) return false;
  }
  return true;
}

//===============================================================================
//  Array
//===============================================================================
function index(arr: unknown[], i: number): number {
  return i < 0 ? arr.length + i : i;
}

/** Array#swap_at(index1, index2): swaps (clones of) the values at two indexes (negative ones count from the end). */
export function swapAt(arr: unknown[], index1: number, index2: number): void {
  const get = (i: number) => (index(arr, i) >= 0 && index(arr, i) < arr.length ? arr[index(arr, i)] : null);
  const put = (i: number, v: unknown) => {
    const k = index(arr, i);
    if (k < 0) throw new RubyError("IndexError", `index ${i} too small for array; minimum: -${arr.length}`);
    while (arr.length < k) arr.push(null);
    arr[k] = v;
  };
  const val1 = rclone(get(index1));
  const val2 = rclone(get(index2));
  put(index1, val2);
  put(index2, val1);
}

/** Array#to_last(val): removes every occurrence of val and pushes it at the end. */
export function toLast<T>(arr: T[], val: T): T[] {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] === val) arr.splice(i, 1);
  arr.push(val);
  return arr;
}

/** Array#string_include?(val): whether any String element is part of val. */
export function stringInclude(arr: readonly unknown[], val: unknown): boolean {
  if (typeof val !== "string") return false;
  let ret = false;
  for (const a of arr) if (typeof a === "string" && val.includes(a)) ret = true;
  return ret;
}

//===============================================================================
//  Hash (plain objects)
//===============================================================================
type Hash = Record<string, unknown>;
const isHash = (v: unknown): v is Hash => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

/** Hash#has_key?(*args): whether every key is present. */
export function hasKey(h: Hash, ...keys: string[]): boolean {
  for (const key of keys) if (!Object.keys(h).includes(key)) return false;
  return true;
}

/** Hash#try_key?(*args): whether every key is present with a truthy value. */
export function tryKey(h: Hash, ...keys: string[]): boolean {
  for (const key of keys) if (!Object.keys(h).includes(key) || !truthy(h[key])) return false;
  return true;
}

/** Hash#get_key(key): the value, or nil if absent. */
export const getKey = (h: Hash, key: string): unknown => (hasKey(h, key) ? h[key] : null);

/** Hash#deep_merge!(hash): merges hash into h, recursing where h has a Hash. */
export function deepMergeBang(h: Hash, hash: unknown): void {
  if (!isHash(hash)) return; // failsafe
  for (const key of Object.keys(hash)) {
    if (isHash(h[key])) deepMergeBang(h[key], hash[key]);
    else h[key] = hash[key];
  }
}

/**
 * Hash#deep_merge(hash).
 * NOTE (Ruby parity, script.rb:214-226): the copy is never merged per key:
 * when h has no Hash under a key the result *becomes* that value
 * (`h = hash[key]`), and when it does, hash[key] is merged into the copy's
 * top level. {a: 1}.deep_merge({b: 2}) is 2; a Hash key after a non-Hash
 * result raises NoMethodError. This replaces Essentials' correct Hash#deep_merge
 * in the game (only Hash#deep_merge! is called anywhere, and it behaves the same).
 */
export function deepMerge(self: Hash, hash: unknown): unknown {
  let h: unknown = { ...self };
  if (!isHash(hash)) return h; // failsafe
  for (const key of Object.keys(hash)) {
    if (isHash(self[key])) {
      if (!isHash(h)) throw new RubyError("NoMethodError", `undefined method \`deep_merge!' for ${rubyInspect(h)}`);
      deepMergeBang(h, hash[key]);
    } else {
      h = hash[key];
    }
  }
  return h;
}

function rubyInspect(v: unknown): string {
  if (v === null || v === undefined) return "nil:NilClass";
  if (typeof v === "number") return `${v}:${Number.isInteger(v) ? "Integer" : "Float"}`;
  if (typeof v === "string") return `${JSON.stringify(v)}:String`;
  if (Array.isArray(v)) return `${JSON.stringify(v)}:Array`;
  return `${String(v)}:${typeof v}`;
}
