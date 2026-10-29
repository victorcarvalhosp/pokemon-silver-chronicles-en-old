// Luka's Scripting Utilities: Dir / File / PluginManager extensions
// (script.rb:37-112), CallbackWrapper (script.rb:1086-1107), ErrorLogger
// (script.rb:1108-1151) and the Env module (script.rb:1152-1347).
//
// Browser adaptations (there is no file system):
// - Existence checks and directory listings use the asset index
//   (core/assets.ts through core/fileTests.ts): only Graphics/, Audio/ and
//   Fonts/ are served, so PluginManager.find_dir finds nothing (Plugins/
//   isn't served) and Env.interpret reads files under those folders, fetched.
// - ErrorLogger echoes like Ruby (echoln) and appends each line to
//   web/data/logs/<file name> through the dev server's file endpoint
//   (debug/devFiles.ts, docs/data.md); without the endpoint the line goes to
//   the browser console. Writes are queued in order; flushLogs() awaits them.
// - Dir.create only normalizes the path: DevFiles.write creates parent folders.
//   Dir.delete_all can't run (the endpoint has no delete route) and throws.
// - Env.directory is the game's asset root ("\game"), Env.path raises like
//   Ruby (getKnownFolder doesn't exist anywhere).
// - String#gsub! in char_esc / char_dsc mutates the caller's string in Ruby;
//   JS strings are immutable, so the functions only return the result.

import { DEBUG } from "../../core/debug";
import { assetUrl } from "../../core/assets";
import { Dir as FileDir, File as FileFile, RTP, safeExists } from "../../core/fileTests";
import { echoln } from "../../debug/DebugConsole";
import { isNumeric } from "./extensions";
import { RubyError, rsplit, strToF, strToI, strToIHex } from "./rubyHelpers";

//===============================================================================
//  Dir / File / PluginManager
//===============================================================================
/** Dir.create(path): Ruby makes every folder of the path; returns the normalized path. */
export function dirCreate(path: string): string {
  return path.replaceAll("\\", "/"); // Windows compatibility
}

/** Dir.all_dirs(dir): every folder under dir (deepest first), then dir itself. */
export function dirAllDirs(dir: string): string[] {
  let dirs: string[] = [];
  for (const file of FileDir.get(dir, "*", true)) {
    if (FileDir.safe(file)) dirs = dirs.concat(dirAllDirs(file));
  }
  return dirs.length > 0 ? [...dirs, dir] : [dir];
}

/** Dir.delete_all(dir): not possible from the browser. */
export function dirDeleteAll(dir: string): never {
  throw new Error(`Dir.delete_all(${dir}): the browser can't delete files (the dev file endpoint has no delete route)`);
}

/** File.safeData?(file) */
export const fileSafeData = (file: string): boolean => FileFile.safeData(file);

/** PluginManager.find_dir(plugin): the folder whose meta.txt has `Name = plugin`, or nil. */
export async function findPluginDir(plugin: string): Promise<string | null> {
  for (const dir of FileDir.get("Plugins")) {
    if (!FileDir.safe(dir)) continue;
    if (!safeExists(dir + "/meta.txt")) continue;
    const res = await fetch(assetUrl(dir + "/meta.txt"));
    const meta = res.ok ? await res.text() : "";
    const name = /^\s*Name\s*=\s*(.*?)\s*$/im.exec(meta)?.[1];
    if (name === plugin) return dir;
  }
  return null;
}

//===============================================================================
//  CallbackWrapper
//===============================================================================
type Block = (this: unknown[] & Record<string, unknown>, self: unknown[] & Record<string, unknown>) => unknown;

/**
 * The plugin reopens Essentials' CallbackWrapper (whose initialize keeps the
 * block) and replaces #execute / #set: the block runs with the argument array
 * as self, each param set on it (Ruby: as instance variables).
 * NOTE (Ruby parity, script.rb:1090): `@params = {}` sits in the class body,
 * so instances start without params and #execute before #set raises
 * NoMethodError.
 */
export class CallbackWrapper {
  private params: Record<string, unknown> | null = null;

  constructor(readonly codeBlock: Block | null = null) {}

  execute(block: Block | null, ...args: unknown[]): unknown {
    if (this.params === null) throw new RubyError("NoMethodError", "undefined method `each' for nil:NilClass");
    const self = args as unknown[] & Record<string, unknown>;
    for (const [key, value] of Object.entries(this.params)) self[key] = value;
    if (!block) throw new RubyError("ArgumentError", "wrong number of arguments (given 0, expected 1..3)");
    return block.call(self, self);
  }

  set(params: Record<string, unknown>): void {
    this.params = params;
  }
}

//===============================================================================
//  ErrorLogger
//===============================================================================
let writes: Promise<void> = Promise.resolve();

/** Resolves once every queued log line was written. */
export function flushLogs(): Promise<void> {
  return writes;
}

function appendLog(file: string, line: string, type: string): void {
  const path = "web/data/logs/" + (file.split(/[/\\]/).pop() || "systemout.txt");
  writes = writes
    .then(async () => {
      const { DevFiles } = await import("../../debug/devFiles");
      if (await DevFiles.available()) await DevFiles.write(path, line, true);
      else (type === "ERROR" ? console.error : type === "WARN" ? console.warn : console.info)(line.trimEnd());
    })
    .catch((e: unknown) => console.warn(`ErrorLogger: couldn't write ${path}:`, e));
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Time#strftime("[%H:%M:%S %a %d-%b-%Y]") */
export function timeStamp(time = new Date()): string {
  return `[${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())} ${DAYS[time.getDay()]} ${pad(time.getDate())}-${MONTHS[time.getMonth()]}-${time.getFullYear()}]`;
}

export class ErrorLogger {
  readonly file: string;

  constructor(file: string | null = null) {
    this.file = RTP.getSaveFileName(file ?? "systemout.txt");
  }

  logMsg(msg: unknown, type = "INFO", file: string | null = null): void {
    file ??= this.file;
    echoln(`${type.toUpperCase()}: ${String(msg)}`);
    appendLog(file, `${timeStamp()} [${type.toUpperCase()}] ${String(msg)}\r\n`, type.toUpperCase());
  }

  timeStamp(): string {
    return timeStamp();
  }

  log(msg: unknown, file: string | null = null): void { this.logMsg(msg, "INFO", file); }
  info(msg: unknown, file: string | null = null): void { this.logMsg(msg, "INFO", file); }
  /** Logs, then raises the message (RuntimeError). */
  error(msg: unknown, file: string | null = null): never {
    this.logMsg(msg, "ERROR", file);
    throw new RubyError("RuntimeError", String(msg));
  }
  warn(msg: unknown, file: string | null = null): void { this.logMsg(msg, "WARN", file); }
  debug(msg: unknown, file: string | null = null): void {
    if (!DEBUG) return;
    this.logMsg(msg, "DEBUG", file);
  }
}

//===============================================================================
//  Env
//===============================================================================
/** GUIDs found on MSDN for common directories */
export const COMMON_PATHS: Readonly<Record<string, string>> = {
  CAMERA_ROLL: "AB5FB87B-7CE2-4F83-915D-550846C9537B",
  START_MENU: "A4115719-D62E-491D-AA7C-E74B8BE3B067",
  DESKTOP: "B4BFCC3A-DB2C-424C-B029-7FE99A87C641",
  DOCUMENTS: "FDD39AD0-238F-46AF-ADB4-6C85480369C7",
  DOWNLOADS: "374DE290-123F-4565-9164-39C4925E467B",
  HOME: "5E6C858F-0E22-4760-9AFE-EA3317B67173",
  MUSIC: "4BD8D571-6D19-48D3-BE97-422220080E43",
  PICTURES: "33E28130-4E1E-4676-835A-98395C3BC3BB",
  SAVED_GAMES: "4C5C32FF-BB9D-43b0-B5B4-2D72E54EAAA4",
  SCREENSHOTS: "b7bede81-df94-4682-a7d8-57a52620b86f",
  VIDEOS: "18989B1D-99B5-455B-841C-AB7C74E4DDFC",
  LOCAL: "F1B32785-6FBA-4FCF-9D55-7B8E7F157091",
  LOCALLOW: "A520A1A4-1780-4FF6-BD18-167343C5AF16",
  ROAMING: "3EB685DB-65F9-4CF6-A03A-E3EF65729F3D",
  PROGRAM_DATA: "62AB5D82-FDC1-4DC3-A9DD-070D1D495D97",
  PROGRAM_FILES_X64: "6D809377-6AF0-444b-8957-A3773F02200E",
  PROGRAM_FILES_X86: "7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E",
  COMMON_FILES: "F7F1ED05-9F6D-47A2-AAAE-29D317C6F066",
  PUBLIC: "DFDF76A2-C82A-4D63-906A-5644AC457385",
};

/** Escape chars for directories (in Ruby's hash order). */
const CHAR_SET: readonly [string, string][] = [
  ["\\", "&bs;"], ["/", "&fs;"], [":", "&cn;"], ["*", "&as;"],
  ["?", "&qm;"], ["\"", "&dq;"], ["<", "&lt;"], [">", "&gt;"],
  ["|", "&po;"],
];

type Section = Record<string, unknown[]>;
export type InterpretedData = Record<string, Record<string, Section>>;

/** Ruby's String#strip (ASCII whitespace; trailing NULs too). */
const strip = (s: string) => s.replace(/^[\t\n\v\f\r ]+/, "").replace(/[\0\t\n\v\f\r ]+$/, "");

/** String#each_line: the lines, each keeping its "\n". */
const eachLine = (s: string): string[] => (s === "" ? [] : s.split(/(?<=\n)/));

export const Env = {
  logger: new ErrorLogger(),

  /**
   * Env.path(type): a Windows known folder.
   * NOTE (Ruby parity, script.rb:1194): getKnownFolder isn't defined anywhere,
   * so this always raises (NoMethodError; an unknown type fails earlier in
   * guid_to_hex).
   */
  path(type: string): never {
    Env.guidToHex(COMMON_PATHS[type] as string);
    throw new RubyError("NoMethodError", "undefined method `getKnownFolder' for Env:Module");
  },

  /** Env.guid_to_hex(string): the first three chunks as numbers, the rest byte by byte. */
  guidToHex(string: string): number[] {
    if (typeof string !== "string") throw new RubyError("NoMethodError", "undefined method `split' for nil:NilClass");
    const hex: number[] = [];
    rsplit(string, "-").forEach((chunk, i) => {
      if (i < 3) hex.push(strToIHex(chunk));
      else for (const s of chunk.match(/[^\n]{2}/g) ?? []) hex.push(strToIHex(s));
    });
    return hex;
  },

  /** Env.directory: the working directory with backslashes (here the game's asset root). */
  directory(): string {
    return "/game".replaceAll("/", "\\");
  },

  /** Env.log: the shared ErrorLogger. */
  get log(): ErrorLogger {
    return Env.logger;
  },

  /** Env.char_esc(str): escapes the characters folder names can't have. */
  charEsc(str: string): string {
    for (const [key, val] of CHAR_SET) str = str.replaceAll(key, val);
    return str;
  },

  /** Env.char_dsc(str): undoes char_esc. */
  charDsc(str: string): string {
    for (const [key, val] of CHAR_SET) str = str.replaceAll(val, key);
    return str;
  },

  /** Env.interpret(filename): reads and parses a sectioned file ({} if it doesn't exist). */
  async interpret(filename: string): Promise<InterpretedData> {
    if (!safeExists(filename)) return {}; // failsafe
    const res = await fetch(assetUrl(filename.replaceAll("\\", "/")));
    return Env.interpretContents(res.ok ? await res.text() : "", filename);
  },

  /**
   * The parser of Env.interpret, on the file's contents:
   * {"Section" => {"__pk__" => {key => [values]}, "Sub-section" => {...}}}.
   * Values are split on ","; numeric ones become Integer/Float, true/false
   * Booleans. A line without a value starts a sub-section.
   * NOTE (Ruby parity, script.rb:1248-1334), reproduced as is:
   * - each section's text is cut from the whole file with gsub!, so a text
   *   repeated elsewhere is removed there too, and a repeated section name
   *   splits the file in more places;
   * - values aren't stripped one by one ("1, 2" gives [1, " 2"]), and "",
   *   "-" or "." count as numbers (0, 0, 0.0);
   * - a blank or whitespace-only line starts a sub-section named "";
   * - a file with text but no [section] raises NoMethodError (nil[0]);
   * - XY / XYZ keys with fewer than 2 / 3 values raise (lengthError); the
   *   conversion's rescue (formatError) can't trigger.
   * Plain objects order integer-like keys first (Ruby keeps insertion order).
   */
  interpretContents(raw: string, filename: string): InterpretedData {
    let contents = raw.replaceAll("\t", "  ");
    const data: InterpretedData = {};
    const entries: string[][] = [];
    if (!contents) return data; // skip if empty
    // Ruby's /./ excludes only "\n" (JS's also excludes "\r", U+2028/9).
    const indexes: (string[] | null)[] = [...contents.matchAll(/(?<=\[)([^\n]*?)(?=\])/g)].map((m) => [m[1]!]);
    indexes.push(indexes[indexes.length - 1] ?? null);
    // iterate through each index and compile data points
    for (let j = 0; j < indexes.length; j++) {
      const i = indexes[j];
      if (!i) throw new RubyError("NoMethodError", "undefined method `[]' for nil:NilClass");
      const sep = `[${i[0]}]`;
      let m: string | undefined;
      if (j === indexes.length - 1) { // when final entry
        m = rsplit(contents, sep)[1];
        if (m === undefined) continue;
      } else { // fetch data contents
        m = rsplit(contents, sep)[0];
        if (m === undefined) continue;
        contents = contents.replaceAll(m, "");
      }
      m = m.replaceAll(`${sep}\r\n`, "").replaceAll(`${sep}\n`, "");
      // safely read each line and push into array
      entries.push(eachLine(m).map((l) => l.replaceAll("\r\n", "").replaceAll("\n", "")));
    }
    // delete first empty data point
    entries.splice(0, 1);
    // loop to iterate through each data point and compile usable information
    for (let i = 0; i < entries.length; i++) {
      const d: Record<string, Section> = {};
      let section = "__pk__"; // set primary section
      for (const line of entries[i]!) {
        if (!Object.keys(d).includes(section)) d[section] = {};
        const e = rsplit(line, "#")[0];
        if (e === undefined || e === "" || (e.includes("[") && e.includes("]"))) continue;
        const a = rsplit(e, "=");
        const key = a[0] !== undefined ? strip(a[0]) : "";
        const value = a[1] !== undefined ? strip(a[1]) : "";
        if (value === "") {
          section = key;
          continue;
        }
        // split array
        const vals: unknown[] = rsplit(value, ",");
        // raise error
        if (key === "XY" && vals.length < 2) {
          throw new RubyError("RuntimeError", Env.lengthError(filename, indexes[i]![0]!, section, 2, key, vals));
        } else if (key === "XYZ" && vals.length < 3) {
          throw new RubyError("RuntimeError", Env.lengthError(filename, indexes[i]![0]!, section, 3, key, vals));
        }
        // convert to proper type
        for (let q = 0; q < vals.length; q++) {
          const v = vals[q] as string;
          if (isNumeric(v) && v.includes(".")) vals[q] = strToF(v);
          else if (isNumeric(v)) vals[q] = strToI(v);
          else if (v.toLowerCase() === "true" || v.toLowerCase() === "false") vals[q] = v.toLowerCase() === "true";
        }
        // add data to section
        d[section]![key] = vals;
      }
      // delete primary if empty
      if (d.__pk__ && Object.keys(d.__pk__).length === 0) delete d.__pk__;
      data[indexes[i]![0]!] = d;
    }
    return data;
  },

  /** Env.formatError: the message for a value that can't be converted. */
  formatError(filename: string, section: string, sub: string, type: string, key: string, val: unknown): string {
    const sectn = sub === "__pk__" ? `[${section}]` : `[${section}]\nSub-section: ${sub}`;
    return `File: ${filename}\nError compiling data in Section: ${sectn}\nCould not implicitly convert value for Key: ${key} to type (${type})\n${key} = ${String(val)}`;
  },

  /** Env.lengthError: the message for an XY / XYZ key with too few values. */
  lengthError(filename: string, section: string, sub: string, len: number, key: string, val: unknown[]): string {
    const sectn = sub === "__pk__" ? `[${section}]` : `[${section}]\nSub-section: ${sub}`;
    return `File: ${filename}\nError compiling data in Section: ${sectn}\nWrong number of arguments for Key: ${key}, got ${val.length} expected ${len}`;
  },
};
