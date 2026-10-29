// Copies an object's own fields to JSON and back, turning Tone/Color into
// tagged arrays. Used for the plain state classes Essentials marshals
// (Game_System, Game_Screen, PokemonGlobalMetadata, ...).

import { Color, Tone } from "../../rgss/types";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function encode(v: unknown): Json | undefined {
  if (v === undefined || typeof v === "function") return undefined;
  if (v instanceof Tone) return { __tone: [v.red, v.green, v.blue, v.gray] };
  if (v instanceof Color) return { __color: [v.red, v.green, v.blue, v.alpha] };
  if (v instanceof Map) return { __map: [...v.entries()].map(([k, x]) => [encode(k) ?? null, encode(x) ?? null]) };
  if (v instanceof Set) return { __set: [...v].map((x) => encode(x) ?? null) };
  if (Array.isArray(v)) return v.map((x) => encode(x) ?? null);
  if (v && typeof v === "object") {
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v)) {
      const e = encode(x);
      if (e !== undefined) out[k] = e;
    }
    return out;
  }
  return v as Json;
}

function decode(v: Json): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    if ("__tone" in v) return Tone.fromArray(v.__tone as number[]);
    if ("__color" in v) return Color.fromArray(v.__color as number[]);
    if ("__map" in v) return new Map((v.__map as [Json, Json][]).map(([k, x]) => [decode(k), decode(x)]));
    if ("__set" in v) return new Set((v.__set as Json[]).map(decode));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = decode(x);
    return out;
  }
  return v;
}

/** The object's own fields as JSON, minus `skip`. */
export function snapshot(obj: object, skip: readonly string[] = []): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (skip.includes(k)) continue;
    const e = encode(v);
    if (e !== undefined) out[k] = e;
  }
  return out;
}

/** Writes a snapshot's fields back onto `obj` (fields it doesn't have are ignored). */
export function restore(obj: object, data: unknown, skip: readonly string[] = []): void {
  if (!data || typeof data !== "object") return;
  const target = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(data as Record<string, Json>)) {
    if (skip.includes(k) || !(k in target)) continue;
    target[k] = decode(v);
  }
}

/** Plain decode, for values whose classes rebuild themselves. */
export function decodeJson(v: unknown): unknown {
  return decode(v as Json);
}

export function encodeJson(v: unknown): unknown {
  return encode(v) ?? null;
}
