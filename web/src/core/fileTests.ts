// Port of Data/Scripts/001_Technical/002_Files/001_FileTests.rb and
// 002_FileMixins.rb for the browser. The game's files are the dev server's
// /game/ assets: existence checks use the asset index (core/assets.ts, which
// lists every file with and without its extension, lowercased) instead of
// the disk, file contents are fetched, and the "save folder" is IndexedDB
// (game/save/SaveData.ts); Dir.create/all_dirs/delete_all write through the
// dev server's file endpoint. There's no Game.rgssad archive, so the archive
// branches of pbRgssExists?/pbRgssOpen/pbGetFileChar never apply.
// pbResolveBitmap / pbBitmapName are in ui/rpgCache.ts.

import { assetExists, assetPaths } from "./assets";

const nilOrEmpty = (s: unknown) => s == null || typeof s !== "string" || s.length === 0;

//===============================================================================
//  Reads files of certain format from a directory
//===============================================================================
/** A filter like "*.png" or "*" as a regexp on a file name. */
function globRegExp(filter: string): RegExp {
  return new RegExp("^" + filter.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + "$", "i");
}

/** The entries (files and folders) directly in `dir`. */
function entries(dir: string): string[] {
  const prefix = dir.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() + "/";
  const ret = new Set<string>();
  for (const p of assetPaths()) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!/\.[a-z0-9]+$/.test(rest) && !rest.includes("/")) continue; // the extensionless copy of a file
    ret.add(rest.split("/")[0]!);
  }
  return [...ret];
}

export const Dir = {
  /** Dir.get(dir, filters, full): the files in a directory matching the filters, sorted. */
  get(dir: string, filters: string | string[] = "*", full = true): string[] {
    const files: string[] = [];
    for (const filter of Array.isArray(filters) ? filters : [filters]) {
      const re = globRegExp(filter);
      for (const f of entries(dir)) if (re.test(f)) files.push(full ? dir + "/" + f : f);
    }
    return files.sort();
  },

  /** Dir.all(dir, filters, full): the whole file tree under a directory. */
  all(dir: string, filters: string | string[] = "*", full = true): string[] {
    let files: string[] = [];
    let subfolders: string[] = [];
    for (const file of Dir.get(dir, filters, full)) {
      if (Dir.safe(full ? file : dir + "/" + file)) subfolders = subfolders.concat(Dir.all(full ? file : dir + "/" + file, filters, full));
      else files = files.concat([file]);
    }
    return files.concat(subfolders);
  },

  /** Dir.safe?(dir): whether it's an existing directory. */
  safe(dir: string): boolean {
    const prefix = dir.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() + "/";
    return assetPaths().some((p) => p.startsWith(prefix));
  },

  // The writing helpers (:48-88) go through the dev server's file endpoint
  // (debug/devFiles.ts), so they only work under `pnpm dev`, on paths under
  // web/data/ or PBS/ (game-root relative). Nothing in the game calls them.

  /** Dir.create(path): creates all the folders of the path. */
  async create(path: string): Promise<void> {
    const { DevFiles } = await import("../debug/devFiles");
    await DevFiles.mkdir(path.replace(/\\/g, "/")); // Windows compatibility
  },

  /** Dir.all_dirs(dir): the folder tree under dir, deepest first, dir last. */
  async allDirs(dir: string): Promise<string[]> {
    const { DevFiles } = await import("../debug/devFiles");
    const rel = await DevFiles.listDirs(dir);
    const walk = (full: string, relDir: string): string[] => {
      let dirs: string[] = [];
      const children = rel.filter((r) => r.includes("/") ? r.slice(0, r.lastIndexOf("/")) === relDir : relDir === "")
        .map((r) => (r.includes("/") ? r.slice(r.lastIndexOf("/") + 1) : r)).sort();
      for (const c of children) dirs = dirs.concat(walk(full + "/" + c, relDir === "" ? c : relDir + "/" + c));
      return dirs.length > 0 ? dirs.concat([full]) : [full];
    };
    return walk(dir, "");
  },

  /** Dir.delete_all(dir): deletes every file under dir, then every folder (dir included). */
  async deleteAll(dir: string): Promise<void> {
    const { DevFiles } = await import("../debug/devFiles");
    for (const f of await DevFiles.list(dir)) await DevFiles.delete(dir + "/" + f);
    for (const d of await Dir.allDirs(dir)) await DevFiles.delete(d);
  },
};

export const File = {
  /** File.safe?(file): whether the file exists. */
  safe: (file: string): boolean => assetExists(file.replace(/\\/g, "/")),
  /** File.safeData?(file): whether a data file loads (the port's data is JSON under web/data). */
  safeData: (file: string): boolean => assetExists(file.replace(/\\/g, "/")),
};

export const safeIsDirectory = (f: string): boolean => Dir.safe(f);
export const safeExists = (f: string): boolean => assetExists(f.replace(/\\/g, "/"));

export function safeGlob(dir: string, wildcard: string): string[] {
  return Dir.get(dir, wildcard, false).map((f) => dir.replace(/\/$/, "") + "/" + f);
}

export function pbResolveAudioSE(file: string | null): string | null {
  if (!file) return null;
  if (RTP.exists("Audio/SE/" + file, ["", ".wav", ".ogg"])) return RTP.getPath("Audio/SE/" + file, ["", ".wav", ".ogg"]);
  return null;
}

export function strsplit(str: string, re: RegExp): string[] {
  const ret: string[] = [];
  const g = new RegExp(re.source, re.flags.replace("g", ""));
  let tstr = str;
  for (let m = g.exec(tstr); m; m = g.exec(tstr)) {
    ret.push(tstr.slice(0, m.index));
    tstr = tstr.slice(m.index + m[0].length);
  }
  ret.push(tstr);
  return ret;
}

export function canonicalize(c: string): string {
  const ret: string[] = [];
  for (const x of strsplit(c, /[/\\]/)) {
    if (x === "..") ret.pop();
    else if (x !== ".") ret.push(x);
  }
  return ret.join("/");
}

export const RTP = {
  exists(filename: string | null, extensions: string[] = []): boolean {
    if (nilOrEmpty(filename)) return false;
    for (const path of RTP.eachPathFor(filename!)) {
      if (safeExists(path)) return true;
      for (const ext of extensions) if (safeExists(path + ext)) return true;
    }
    return false;
  },
  getImagePath: (filename: string) => RTP.getPath(filename, ["", ".png", ".gif"]),
  getAudioPath: (filename: string) => RTP.getPath(filename, ["", ".wav", ".wma", ".mid", ".ogg", ".midi"]),
  getPath(filename: string, extensions: string[] = []): string {
    if (nilOrEmpty(filename)) return filename;
    for (const path of RTP.eachPathFor(filename)) {
      if (safeExists(path)) return path;
      for (const ext of extensions) if (safeExists(path + ext)) return path + ext;
    }
    return filename;
  },
  /** The paths searched for a file: just the game folder (the assets' root). */
  *eachPathFor(filename: string): Generator<string> {
    if (!filename) return;
    yield filename.replace(/^\.\//, "");
  },
  *eachPath(): Generator<string> {
    yield "./";
  },
  getSaveFileName: (fileName: string) => RTP.getSaveFolder() + "/" + fileName,
  /** System.data_directory: saves live in the browser's IndexedDB under this name. */
  getSaveFolder: () => "indexeddb:pokemon-silver-chronicles",
};

export const FileTest = {
  IMAGE_EXTENSIONS: [".png", ".gif"],
  AUDIO_EXTENSIONS: [".mid", ".midi", ".ogg", ".wav", ".wma"],
  audioExist: (filename: string) => RTP.exists(filename, FileTest.AUDIO_EXTENSIONS),
  imageExist: (filename: string) => RTP.exists(filename, FileTest.IMAGE_EXTENSIONS),
};

/** Whether a data file exists (rather than a graphics or audio file). */
export const pbRgssExists = (filename: string): boolean => safeExists(canonicalize(filename));

/** pbGetFileString(file): the file's contents, or null (fetched from the game folder). */
export async function pbGetFileString(file: string): Promise<string | null> {
  file = canonicalize(file);
  if (!safeExists(file)) return null;
  try {
    const res = await fetch("/game/" + file);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** pbGetFileChar(file): at least the first byte of a file, or null. */
export async function pbGetFileChar(file: string): Promise<string | null> {
  if (file.endsWith("/")) return null; // Is a directory
  const s = await pbGetFileString(file);
  return s == null ? null : s.slice(0, 1);
}

export async function pbTryString(x: string): Promise<string | null> {
  const ret = await pbGetFileChar(x);
  return nilOrEmpty(ret) ? null : x;
}

/** pbRgssOpen(file, mode) { |f| }: a StringInput over the fetched file. */
export async function pbRgssOpen<T>(file: string, block: (f: StringInput) => T | Promise<T>): Promise<T | null> {
  const str = await pbGetFileString(file);
  if (str == null) throw new Error(`No such file or directory - ${file}`);
  return block(new StringInput(new TextEncoder().encode(str)));
}

//===============================================================================
// 002_FileMixins.rb: little-endian reads/writes on files and strings
//===============================================================================
export class StringInput {
  private bytes: Uint8Array;
  private position = 0;
  private closed = false;

  constructor(str: Uint8Array | string) {
    this.bytes = typeof str === "string" ? new TextEncoder().encode(str) : str;
  }

  static open<T>(str: Uint8Array | string, block?: (f: StringInput) => T): T | StringInput {
    const f = new StringInput(str);
    if (!block) return f;
    try {
      return block(f);
    } finally {
      f.close();
    }
  }

  close(): void { this.closed = true; }
  isClosed(): boolean { return this.closed; }
  get pos(): number { return this.position; }
  set pos(value: number) { this.seek(value); }
  rewind(): void { this.seek(0); }
  seek(offset: number, whence: 0 | 1 | 2 = 0): number {
    const base = whence === 1 ? this.position : whence === 2 ? this.bytes.length : 0;
    this.position = Math.max(0, Math.min(this.bytes.length, base + offset));
    return 0;
  }
  eof(): boolean { return this.position >= this.bytes.length; }
  binmode(): void {}
  getc(): number | null { return this.eof() ? null : this.bytes[this.position++]!; }
  *eachByte(): Generator<number | null> { while (!this.eof()) yield this.getc(); }
  read(len: number | null = null): Uint8Array {
    const end = len == null ? this.bytes.length : Math.min(this.bytes.length, this.position + len);
    const ret = this.bytes.slice(this.position, end);
    this.position = end;
    return ret;
  }
  gets(): string | null {
    if (this.eof()) return null;
    let end = this.bytes.indexOf(10, this.position);
    end = end < 0 ? this.bytes.length : end + 1;
    const ret = new TextDecoder().decode(this.bytes.slice(this.position, end));
    this.position = end;
    return ret;
  }

  // FileInputMixin
  fgetb(): number { return this.getc() ?? 0; }
  fgetw(): number { return this.fgetn(2); }
  fgetdw(): number { return this.fgetn(4); }
  private fgetn(n: number): number {
    let ret = 0;
    for (let x = 0; x < n * 8; x += 8) {
      const i = this.getc();
      if (i == null) break;
      ret += i * 2 ** x;
    }
    return ret;
  }
  fgetsb(): number {
    const ret = this.fgetb();
    return (ret & 0x80) !== 0 ? ret - 256 : ret;
  }
  xfgetb(offset: number): number { this.pos = offset; return this.fgetb(); }
  xfgetw(offset: number): number { this.pos = offset; return this.fgetw(); }
  xfgetdw(offset: number): number { this.pos = offset; return this.fgetdw(); }
  getOffset(index: number): number {
    this.pos = 0;
    const offset = this.fgetdw() >>> 3;
    if (index >= offset) return 0;
    this.pos = index * 8;
    return this.fgetdw();
  }
  getLength(index: number): number {
    this.pos = 0;
    const offset = this.fgetdw() >>> 3;
    if (index >= offset) return 0;
    this.pos = index * 8 + 4;
    return this.fgetdw();
  }
  readName(index: number): string {
    this.pos = 0;
    let offset = this.fgetdw() >>> 3;
    if (index >= offset) return "";
    this.pos = index << 3;
    offset = this.fgetdw();
    const length = this.fgetdw();
    if (length === 0) return "";
    this.pos = offset;
    return new TextDecoder().decode(this.read(length));
  }
}

/** StringOutput (FileOutputMixin): bytes written little-endian. */
export class StringOutput {
  private out: number[] = [];
  write(bytes: string | ArrayLike<number>): void {
    if (typeof bytes === "string") for (const b of new TextEncoder().encode(bytes)) this.out.push(b);
    else for (let i = 0; i < bytes.length; i++) this.out.push(bytes[i]! & 0xff);
  }
  fputb(b: number): void { this.out.push(b & 0xff); }
  fputw(w: number): void { for (let i = 0; i < 2; i++, w = Math.floor(w / 256)) this.out.push(w & 0xff); }
  fputdw(w: number): void { for (let i = 0; i < 4; i++, w = Math.floor(w / 256)) this.out.push(w & 0xff); }
  bytes(): Uint8Array { return Uint8Array.from(this.out); }
}
