// Ruby values in Essentials Deluxe's battle hashes (midbattle scripts, battle
// rules, wild Pokémon settings). Those hashes tell Symbols and Strings apart
// (:Opposing switches the speaker, "Opposing" is text; :GROWL plays a move
// animation, "StatUp" a common one), so a Ruby Symbol is a Sym here, and a
// Ruby String a plain string. Hashes are plain objects (keys as strings, in
// insertion order), Arrays arrays, nil null.
//
//   import { sym as $ } from "./rubyData";
//   { turnCommand: { text: [$("Opposing"), "{1} emited a powerful magnetic pulse!"] } }

import type { Id } from "../../data/gameData/gameData";

/** A Ruby Symbol. Interned: compare with === or isSym. */
export class Sym {
  constructor(readonly name: string) {}
  toString(): string { return this.name; }
}

const symbols = new Map<string, Sym>();

/** :name */
export function sym(name: string): Sym {
  let s = symbols.get(name);
  if (!s) {
    s = new Sym(name);
    symbols.set(name, s);
  }
  return s;
}

/** value.is_a?(Symbol) (and value == :name when a name is given). */
export function isSym(value: unknown, ...names: string[]): value is Sym {
  if (!(value instanceof Sym)) return false;
  return names.length === 0 || names.includes(value.name);
}

/** value.is_a?(Hash) */
export function isHash(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Sym);
}

/** A GameData ID given as a Symbol (or already as a string). */
export function idOf(value: unknown): Id | null {
  if (value instanceof Sym) return value.name;
  if (typeof value === "string") return value;
  return null;
}

/** value.to_s */
export function rubyToS(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/**
 * Ruby's ==: Symbols, Strings and numbers by value, Arrays element by element
 * (used where a midbattle choice is compared with the one it replaced).
 */
export function rubyEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => rubyEquals(v, b[i]));
  }
  if (isHash(a) && isHash(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => rubyEquals(a[k], b[k]));
  }
  return false;
}

/**
 * Decodes the JSON the Ruby harness writes for these hashes
 * (web/tools/ruby-ref/deluxe_reference.rb): a Symbol is {":": "name"}.
 */
export function decodeRuby(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeRuby);
  if (value != null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === ":") return sym(String(o[":"]));
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = decodeRuby(o[k]);
    return out;
  }
  return value;
}
