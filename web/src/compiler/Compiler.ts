// Port of the parts of Data/Scripts/021_Compiler/001_Compiler.rb the PBS
// writers use (csvQuote, csvQuoteAlways, pbWriteCsvRecord,
// write_pbs_file_message_start, process_pbs_file_message_end), plus
// getConstantName/getConstantNameOrValue (019_Utilities/001_Utilities.rb:112)
// that pbWriteCsvRecord calls. The readers (pbGetCsvRecord, pbEachFileSection,
// ...) live in the node PBS compiler (web/tools/pbs/), which `pnpm pbs` runs.
//
// The writers are written as generators of WriteSteps so that the same body
// can produce a file's text synchronously (for tests and previews) or write
// it through the dev server, printing to the debug console and yielding to
// Graphics.update where Ruby does. A step is one of:
// - UPDATE: Ruby's Graphics.update.
// - a PbsFile: the end of a File.open(path, "wb") { |f| ... } block.
// - a function: console output (echo, Console.echo_li, ...).

import { _INTL } from "../data/gameData/gameData";
import { Console } from "../debug/DebugConsole";
import { DevFiles } from "../debug/devFiles";
import { Graphics } from "../rgss/Graphics";

/** A File.open(path, "wb") file: written by the writer, saved when its block ends. */
export class PbsFile {
  readonly path: string;
  private readonly parts: string[] = [];

  constructor(path: string) {
    this.path = path;
  }

  write(str: string): void {
    this.parts.push(str);
  }

  get content(): string {
    return this.parts.join("");
  }
}

/** Graphics.update */
export const UPDATE = Symbol("Graphics.update");
export type WriteStep = typeof UPDATE | PbsFile | (() => void);
/** A writer's body (see the top of this file). */
export type WriteSteps = Generator<WriteStep, void, void>;

/** Runs a writer: console output, Graphics.update and the file writes (through the dev server). */
export async function runWriteSteps(steps: WriteSteps): Promise<void> {
  for (const step of steps) {
    if (step === UPDATE) await Graphics.update();
    else if (step instanceof PbsFile) await DevFiles.write(step.path, step.content);
    else step();
  }
}

/** The files a writer would write (path -> content, in the order their blocks end), without writing them. */
export function writeStepsFiles(steps: WriteSteps): Map<string, string> {
  const ret = new Map<string, string>();
  for (const step of steps) {
    if (step instanceof PbsFile) ret.set(step.path, step.content);
  }
  return ret;
}

/** nil_or_empty? (002_RubyUtilities.rb:295) */
export function nilOrEmpty(str: unknown): boolean {
  return str == null || typeof str !== "string" || str.length === 0;
}

/** Ruby's #to_s for the values PBS data holds (nil -> ""). */
export function rubyToS(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return rubyInspect(value);
  return String(value);
}

/** Ruby's #inspect for the values PBS data holds. */
export function rubyInspect(value: unknown): string {
  if (value == null) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(rubyInspect).join(", ")}]`;
  return String(value);
}

/** Array#join: nested arrays are joined too, nil is "". */
export function rubyJoin(arr: readonly unknown[], sep = ""): string {
  return arr.map((v) => (Array.isArray(v) ? rubyJoin(v, sep) : rubyToS(v))).join(sep);
}

/** Ruby's == for PBS values: arrays element by element, hashes by keys and values (in any order). */
export function rubyEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => rubyEquals(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => kb.includes(k) && rubyEquals((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** Array#uniq + #compact */
export function uniqCompact<T>(arr: readonly (T | null | undefined)[]): T[] {
  return [...new Set(arr)].filter((v): v is T => v != null);
}

//===============================================================================
// 001_Compiler.rb
//===============================================================================
/** csvQuote(str, always = false) */
export function csvQuote(str: string | null | undefined, always = false): string {
  if (nilOrEmpty(str)) return "";
  let s = str!;
  if (always || /[,"]/.test(s)) {
    s = s.replace(/"/g, '\\"');
    s = `"${s}"`;
  }
  return s;
}

export function csvQuoteAlways(str: string | null | undefined): string {
  return csvQuote(str, true);
}

/**
 * An enumeration argument of a schema: an Array (index -> name), a Hash
 * (name -> value; a Map keeps Ruby's key order even for keys like "0") or a
 * constant name (Ruby looks it up with Object.const_get).
 */
export type EnumSpec = string | readonly string[] | ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>> | null | undefined;
/** [target, type characters, ...enumerations], like Ruby's SCHEMA arrays. */
export type Schema = readonly [unknown, string, ...EnumSpec[]];

/**
 * Object.const_get(name) for an enumeration given by name. No top-level Ruby
 * module holds enumeration constants in v20.1 (the GameData classes are
 * GameData::X, not X), so Ruby raises NameError here; v20.1 data stores
 * symbols for these fields, so the numeric branches that get here aren't reached.
 */
function constGet(name: string): Readonly<Record<string, unknown>> {
  throw new Error(`uninitialized constant ${name}`);
}

/** getConstantName(mod, value) (019_Utilities/001_Utilities.rb:112) */
export function getConstantName(mod: string | Readonly<Record<string, unknown>>, value: unknown): string {
  const m = typeof mod === "string" ? constGet(mod) : mod;
  for (const c of Object.keys(m)) {
    if (m[c] === value) return c;
  }
  throw new Error(_INTL("Value {1} not defined by a constant in {2}", value, typeof mod === "string" ? mod : ""));
}

/** getConstantNameOrValue(mod, value) (019_Utilities/001_Utilities.rb:120) */
export function getConstantNameOrValue(mod: string | Readonly<Record<string, unknown>>, value: unknown): string {
  const m = typeof mod === "string" ? constGet(mod) : mod;
  for (const c of Object.keys(m)) {
    if (m[c] === value) return c;
  }
  return rubyInspect(value);
}

type Hash = ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>;

function hashEntries(hash: Hash): [string, unknown][] {
  return hash instanceof Map ? [...hash.entries()] : Object.entries(hash);
}

/** Hash#key(value): the first key holding value, or null. */
export function hashKey(hash: Hash, value: unknown): string | null {
  for (const [k, v] of hashEntries(hash)) if (v === value) return k;
  return null;
}

/** pbWriteCsvRecord(record, file, schema): writes a value the way pbGetCsvRecord reads it back. */
export function pbWriteCsvRecord<T>(record: T, file: PbsFile, schema: Schema): T {
  const rec: unknown[] = Array.isArray(record) ? (record as unknown[]).flat(Infinity) : [record];
  const types = schema[1];
  const start = types.slice(0, 1) === "*" ? 1 : 0;
  let index = -1;
  for (;;) {
    for (let i = start; i < types.length; i++) {
      index += 1;
      if (index > 0) file.write(",");
      const value = rec[index];
      if (value == null) {
        // do nothing
      } else if (typeof value === "string") {
        // Ruby's String and Symbol branches (both csvQuote the text)
        file.write(csvQuote(value));
      } else if (value === true) {
        file.write("true");
      } else if (value === false) {
        file.write("false");
      } else if (typeof value === "number") {
        switch (types.slice(i, i + 1)) {
          case "e": case "E": { // Enumerable
            const enumer = schema[2 + i];
            if (Array.isArray(enumer)) {
              file.write(rubyToS(enumer[value]));
            } else if (typeof enumer === "string") {
              file.write(getConstantName(enumer, value));
            } else if (enumer && typeof enumer === "object") {
              for (const [key, v] of hashEntries(enumer as Hash)) {
                if (v === value) {
                  file.write(key);
                  break;
                }
              }
            }
            break;
          }
          case "y": case "Y": { // Enumerable or integer
            const enumer = schema[2 + i];
            if (Array.isArray(enumer)) {
              file.write(enumer[value] == null ? rubyToS(value) : rubyToS(enumer[value]));
            } else if (typeof enumer === "string") {
              file.write(getConstantNameOrValue(enumer, value));
            } else if (enumer && typeof enumer === "object") {
              let hasenum = false;
              for (const [key, v] of hashEntries(enumer as Hash)) {
                if (v !== value) continue;
                file.write(key);
                hasenum = true;
                break;
              }
              if (!hasenum) file.write(rubyToS(value));
            }
            break;
          }
          default: // Any other record type
            file.write(rubyInspect(value));
        }
      } else {
        file.write(rubyInspect(value));
      }
    }
    if (start > 0 && index >= rec.length - 1) break;
    if (start <= 0) break;
  }
  return record;
}

/** write_pbs_file_message_start(filename) */
export function writePbsFileMessageStart(filename: string): WriteStep {
  // The `` around the file's name turns it cyan
  return () => Console.echoLi(_INTL("Writing PBS file `{1}`...", filename.split("/").pop()));
}

/** process_pbs_file_message_end */
export function* processPbsFileMessageEnd(): WriteSteps {
  yield () => Console.echoDone(true);
  yield UPDATE;
}
