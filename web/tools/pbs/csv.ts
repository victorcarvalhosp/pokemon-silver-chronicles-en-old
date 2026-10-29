// Port of Compiler.csvfield!/pbGetCsvRecord and the enum checks they use
// (Data/Scripts/021_Compiler/001_Compiler.rb).

import { PbsError, type Ctx } from "./context.ts";
import { nilOrEmpty, rubyToI, rx } from "./ruby.ts";

/** An enum argument of a schema: a GameData class name, an Array (→ index) or a Hash (→ value). */
export type EnumSpec = string | readonly string[] | Readonly<Record<string, number | string>> | null;

/** [target, type characters, ...enum specs], laid out exactly like the Ruby SCHEMA arrays. */
export type Schema = readonly [string | number, string, ...EnumSpec[]];

export type Value = string | number | boolean | null | Value[];

/** A mutable string, standing in for Ruby's in-place String mutation. */
export interface Rec {
  s: string;
}

const LEAD_WS = rx(String.raw`^\s*`);
const TRAIL_WS = rx(String.raw`\s+$`);
const AFTER_QUOTE_COMMA = rx(String.raw`^\s*,`);
const AFTER_QUOTE_END = rx(String.raw`^\s*$`);

/** csvfield!: takes the next comma-separated field off rec. */
export function csvfield(rec: Rec): string {
  let str = rec.s.replace(LEAD_WS, "");
  if (str.startsWith('"')) {
    str = str.slice(1);
    let ret = "";
    let escaped = false;
    let consumed = 0;
    for (const ch of str) {
      consumed += ch.length;
      if (ch === '"' && !escaped) break;
      if (ch === "\\" && !escaped) {
        escaped = true;
      } else {
        ret += ch;
        escaped = false;
      }
    }
    str = str.slice(consumed);
    const comma = AFTER_QUOTE_COMMA.exec(str);
    if (comma) {
      rec.s = str.slice(comma[0].length);
    } else if (AFTER_QUOTE_END.test(str)) {
      rec.s = "";
    } else {
      rec.s = str;
      throw new PbsError(`Invalid quoted field (in: ${str})`);
    }
    return ret;
  }
  const idx = str.indexOf(",");
  let ret: string;
  if (idx >= 0) {
    ret = str.slice(0, idx);
    rec.s = str.slice(idx + 1);
  } else {
    ret = str;
    rec.s = "";
  }
  return ret.replace(TRAIL_WS, "");
}

const BOOL_TRUE = /^1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss]|[Yy]$/;
const BOOL_FALSE = /^0|[Ff][Aa][Ll][Ss][Ee]|[Nn][Oo]|[Nn]$/;
const OPT_BOOL_TRUE = /^1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss]|[Tt]|[Yy]$/;
const INT = /^-?\d+$/;
const POS_INT = /^\d+$/;
const HEX = /^[A-Fa-f0-9]+$/;
const OPT_FLOAT = /^-?^\d*\.?\d*$/; // Sic: the second ^ means negatives never match.
const NAME = /^(?![0-9])\w+$/;
const ANY_INT = /-?\d+/;

export function csvBoolean(rec: Rec): boolean {
  const field = csvfield(rec);
  if (BOOL_TRUE.test(field)) return true;
  if (BOOL_FALSE.test(field)) return false;
  throw new PbsError(`Field ${field} is not a Boolean value (true, false, 1, 0)`);
}

export function csvInt(rec: Rec): number {
  const field = csvfield(rec);
  if (!INT.test(field)) throw new PbsError(`Field ${field} is not an integer`);
  return parseInt(field, 10);
}

export function csvPosInt(rec: Rec): number {
  const field = csvfield(rec);
  if (!POS_INT.test(field)) throw new PbsError(`Field ${field} is not a positive integer`);
  return parseInt(field, 10);
}

/** Ruby's Float(str), which is stricter than Number() about empty input. */
export function rubyFloat(field: string): number {
  const t = field.trim().replace(/(\d)_(?=\d)/g, "$1");
  const n = t === "" ? NaN : Number(t);
  if (Number.isNaN(n)) throw new PbsError(`Field ${field} is not a number`);
  return n;
}

export function csvFloat(rec: Rec): number {
  return rubyFloat(csvfield(rec));
}

/** checkEnumField */
export function checkEnumField(ctx: Ctx, ret: string, enumer: EnumSpec | undefined): number | string {
  if (typeof enumer === "string") {
    if (!ctx.hasClass(enumer)) throw new PbsError(`Enumeration ${enumer} not defined`);
    if (nilOrEmpty(ret) || !ctx.exists(enumer, ret)) throw new PbsError(`Undefined value ${ret} in GameData::${enumer}`);
    return ret;
  }
  if (Array.isArray(enumer)) {
    const idx = enumer.indexOf(ret);
    if (idx < 0) throw new PbsError(`Undefined value ${ret} (expected one of: ${enumer.join(", ")})`);
    return idx;
  }
  if (enumer && typeof enumer === "object") {
    const value = (enumer as Record<string, number | string>)[ret];
    if (value === undefined || !Object.hasOwn(enumer, ret)) {
      throw new PbsError(`Undefined value ${ret} (expected one of: ${Object.keys(enumer).join(", ")})`);
    }
    return value;
  }
  throw new PbsError("Enumeration not defined");
}

/** checkEnumFieldOrNil */
export function checkEnumFieldOrNil(ctx: Ctx, ret: string, enumer: EnumSpec | undefined): number | string | null {
  if (typeof enumer === "string") {
    if (!ctx.hasClass(enumer)) return null;
    if (nilOrEmpty(ret) || !ctx.exists(enumer, ret)) return null;
    return ret;
  }
  if (Array.isArray(enumer)) {
    const idx = enumer.indexOf(ret);
    return idx < 0 ? null : idx;
  }
  if (enumer && typeof enumer === "object") {
    return Object.hasOwn(enumer, ret) ? (enumer as Record<string, number | string>)[ret]! : null;
  }
  return null;
}

/** csvEnumField! */
export function csvEnumField(ctx: Ctx, rec: Rec, enumer: EnumSpec | undefined): number | string {
  return checkEnumField(ctx, csvfield(rec), enumer);
}

/** csvEnumFieldOrInt! (note the unanchored digit test, as in Essentials) */
function csvEnumFieldOrInt(ctx: Ctx, rec: Rec, enumer: EnumSpec | undefined): number | string {
  const ret = csvfield(rec);
  if (ANY_INT.test(ret)) return rubyToI(ret);
  return checkEnumField(ctx, ret, enumer);
}

/** Field-by-field form of csvEnumFieldOrInt! used by map_connections.txt. */
export function csvEnumOrInt(ctx: Ctx, rec: Rec, enumer: EnumSpec): number | string {
  return csvEnumFieldOrInt(ctx, rec, enumer);
}

/** pbGetCsvRecord: parses a value string according to a schema. */
export function getCsvRecord(ctx: Ctx, input: string, schema: Schema): Value {
  const rec: Rec = { s: input };
  const types = schema[1];
  const record: Value[] = [];
  let repeat = false;
  let start = 0;
  if (types.startsWith("*")) {
    repeat = true;
    start = 1;
  }
  const subarrays = repeat && types.length > 2;
  const enumAt = (i: number): EnumSpec | undefined => schema[2 + i - start] as EnumSpec | undefined;
  for (;;) {
    const sub: Value[] = [];
    for (let i = start; i < types.length; i++) {
      switch (types[i]) {
        case "i":
          sub.push(csvInt(rec));
          break;
        case "I": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else if (!INT.test(f)) throw new PbsError(`Field ${f} is not an integer`);
          else sub.push(parseInt(f, 10));
          break;
        }
        case "u":
          sub.push(csvPosInt(rec));
          break;
        case "U": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else if (!POS_INT.test(f)) throw new PbsError(`Field '${f}' must be 0 or greater`);
          else sub.push(parseInt(f, 10));
          break;
        }
        case "v": {
          const n = csvPosInt(rec);
          if (n === 0) throw new PbsError(`Field '${n}' must be greater than 0`);
          sub.push(n);
          break;
        }
        case "V": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else if (!POS_INT.test(f) || parseInt(f, 10) === 0) throw new PbsError(`Field '${f}' must be greater than 0`);
          else sub.push(parseInt(f, 10));
          break;
        }
        case "x": {
          const f = csvfield(rec);
          if (!HEX.test(f)) throw new PbsError(`Field '${f}' is not a hexadecimal number`);
          sub.push(parseInt(f, 16));
          break;
        }
        case "X": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else if (!HEX.test(f)) throw new PbsError(`Field '${f}' is not a hexadecimal number`);
          else sub.push(parseInt(f, 16));
          break;
        }
        case "f":
          sub.push(csvFloat(rec));
          break;
        case "F": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else if (!OPT_FLOAT.test(f)) throw new PbsError(`Field ${f} is not a floating point number`);
          else sub.push(parseFloat(f) || 0);
          break;
        }
        case "b":
          sub.push(csvBoolean(rec));
          break;
        case "B": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else sub.push(OPT_BOOL_TRUE.test(f));
          break;
        }
        case "n": {
          const f = csvfield(rec);
          if (!NAME.test(f)) {
            throw new PbsError(`Field '${f}' must contain only letters, digits, and underscores and can't begin with a number.`);
          }
          sub.push(f);
          break;
        }
        case "N": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else if (!NAME.test(f)) {
            throw new PbsError(`Field '${f}' must contain only letters, digits, and underscores and can't begin with a number.`);
          } else sub.push(f);
          break;
        }
        case "s":
          sub.push(csvfield(rec));
          break;
        case "S": {
          const f = csvfield(rec);
          sub.push(nilOrEmpty(f) ? null : f);
          break;
        }
        case "q":
          sub.push(rec.s);
          rec.s = "";
          break;
        case "Q":
          if (nilOrEmpty(rec.s)) sub.push(null);
          else {
            sub.push(rec.s);
            rec.s = "";
          }
          break;
        case "e":
          sub.push(csvEnumField(ctx, rec, enumAt(i)));
          break;
        case "E":
          sub.push(checkEnumFieldOrNil(ctx, csvfield(rec), enumAt(i)));
          break;
        case "y":
          sub.push(csvEnumFieldOrInt(ctx, { s: csvfield(rec) }, enumAt(i)));
          break;
        case "Y": {
          const f = csvfield(rec);
          if (nilOrEmpty(f)) sub.push(null);
          else if (INT.test(f)) sub.push(parseInt(f, 10));
          else sub.push(checkEnumFieldOrNil(ctx, f, enumAt(i)));
          break;
        }
      }
    }
    if (sub.length > 0) {
      if (subarrays) record.push(sub);
      else record.push(...sub);
    }
    if (repeat && nilOrEmpty(rec.s)) break;
    if (!repeat) break;
  }
  return types.length === 1 ? (record[0] ?? null) : record;
}
