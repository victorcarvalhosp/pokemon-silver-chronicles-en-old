// Shared compile state: the GameData registries filled as files are compiled
// (in Essentials' dependency order), hardcoded enums, settings, and the list of
// problems found. Mirrors FileLineData's role in error reporting.

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { Issue } from "../../src/data/pbs/types.ts";
import type { RubySources } from "./scripts.ts";

/** Raised for anything Essentials' compiler would raise on. */
export class PbsError extends Error {}

/** A thing the compiler emits, keyed by Essentials' symbol ID. */
export interface Registered {
  id: unknown;
}

export class Ctx {
  readonly gameRoot: string;
  readonly pbsDir: string;
  readonly ruby: RubySources;
  readonly issues: Issue[] = [];
  /** Every file read, relative to the game root. */
  readonly sources = new Set<string>();
  /** GameData::X::DATA for PBS-backed classes, in registration order. */
  readonly data = new Map<string, Map<string, Registered>>();
  /** File currently being read, relative to the game root (FileLineData.file). */
  file = "";

  constructor(gameRoot: string, pbsDir: string, ruby: RubySources) {
    this.gameRoot = gameRoot;
    this.pbsDir = pbsDir;
    this.ruby = ruby;
  }

  pbsPath(name: string): string {
    return join(this.pbsDir, name);
  }

  pbsExists(name: string): boolean {
    return existsSync(this.pbsPath(name));
  }

  /** Sets FileLineData.file for subsequent issues. */
  setFile(absPath: string): void {
    this.file = relative(this.gameRoot, absPath).split("\\").join("/");
  }

  table<T extends Registered>(cls: string): Map<string, T> {
    let t = this.data.get(cls);
    if (!t) {
      t = new Map();
      this.data.set(cls, t);
    }
    return t as Map<string, T>;
  }

  /** GameData::X.register — replaces in place, keeping the original position (Ruby Hash semantics). */
  register<T extends Registered>(cls: string, key: string, record: T): void {
    this.table<T>(cls).set(key, record);
  }

  get<T extends Registered>(cls: string, key: string): T | undefined {
    return this.table<T>(cls).get(key);
  }

  /** GameData::X.exists? for PBS-backed or hardcoded classes. */
  exists(cls: string, id: string): boolean {
    const t = this.data.get(cls);
    if (t) return t.has(id);
    const e = this.ruby.enums.get(cls);
    if (e) return e.has(id);
    throw new PbsError(`Enumeration GameData::${cls} not defined`);
  }

  hasClass(cls: string): boolean {
    return this.data.has(cls) || this.ruby.enums.has(cls);
  }

  error(line: number | null, message: string, extra: Partial<Issue> = {}): void {
    this.issues.push({ severity: "error", file: this.file, line, message, ...extra });
  }

  warn(line: number | null, message: string, extra: Partial<Issue> = {}): void {
    this.issues.push({ severity: "warning", file: this.file, line, message, ...extra });
  }

  /** Runs fn, turning a PbsError into a recorded issue. Returns false on failure. */
  attempt(line: number | null, fn: () => void, extra: Partial<Issue> = {}): boolean {
    try {
      fn();
      return true;
    } catch (e) {
      if (!(e instanceof PbsError)) throw e;
      this.error(line, e.message, extra);
      return false;
    }
  }
}
