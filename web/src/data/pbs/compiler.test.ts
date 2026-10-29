// Unit tests for the PBS compiler's ports of Essentials' line/CSV parsing, and
// for how it reports lines it can't parse.
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Report } from "./types";

const GAME = resolve(__dirname, "../../../..");
const TOOLS = resolve(__dirname, "../../../tools/pbs");

// Imported by path at runtime: the compiler uses .ts import specifiers, which the app's tsconfig doesn't allow.
type Value = string | number | boolean | null | Value[];
interface CsvModule {
  csvfield(rec: { s: string }): string;
  getCsvRecord(ctx: unknown, input: string, schema: readonly unknown[]): Value;
  PbsError?: unknown;
}
interface ReadersModule {
  prepline(line: string): string;
}
const load = async <T>(file: string): Promise<T> => (await import(/* @vite-ignore */ join(TOOLS, file))) as T;

/** Enough of Ctx for schemas whose enums are Arrays/Hashes. */
const noClasses = { hasClass: () => false, exists: () => false };

describe("csv parsing (Compiler.csvfield!/pbGetCsvRecord)", () => {
  let csv: CsvModule;
  let readers: ReadersModule;
  beforeAll(async () => {
    csv = await load<CsvModule>("csv.ts");
    readers = await load<ReadersModule>("readers.ts");
  });

  it("splits fields, honouring quotes and backslash escapes", () => {
    const rec = { s: ' "a, \\"b\\"" , c ,d' };
    expect(csv.csvfield(rec)).toBe('a, "b"');
    expect(csv.csvfield(rec)).toBe("c");
    expect(csv.csvfield(rec)).toBe("d");
    expect(rec.s).toBe("");
  });

  it("parses typed and repeated schemas", () => {
    expect(csv.getCsvRecord(noClasses, "1,2,3", [0, "*u"])).toEqual([1, 2, 3]);
    expect(csv.getCsvRecord(noClasses, "5,-2", [0, "ui"])).toEqual([5, -2]);
    expect(csv.getCsvRecord(noClasses, "0.7", [0, "f"])).toBe(0.7);
    expect(csv.getCsvRecord(noClasses, "Status", [0, "e", ["Physical", "Special", "Status"]])).toBe(2);
    expect(csv.getCsvRecord(noClasses, "TM", [0, "e", { TM: 3, HM: 4 }])).toBe(3);
    expect(csv.getCsvRecord(noClasses, "a,1,b,2", [0, "*su"])).toEqual([["a", 1], ["b", 2]]);
    expect(csv.getCsvRecord(noClasses, "Hello, world", [0, "q"])).toBe("Hello, world");
    expect(csv.getCsvRecord(noClasses, "3,,", [0, "uUU"])).toEqual([3, null, null]);
  });

  it("reads booleans the way Essentials does", () => {
    for (const t of ["true", "Yes", "1", "y"]) expect(csv.getCsvRecord(noClasses, t, [0, "b"]), t).toBe(true);
    for (const f of ["false", "No", "0", "n"]) expect(csv.getCsvRecord(noClasses, f, [0, "b"]), f).toBe(false);
    expect(() => csv.getCsvRecord(noClasses, "maybe", [0, "b"])).toThrow(/not a Boolean/);
  });

  it("rejects malformed values", () => {
    expect(() => csv.getCsvRecord(noClasses, "-1", [0, "u"])).toThrow(/not a positive integer/);
    expect(() => csv.getCsvRecord(noClasses, "0", [0, "v"])).toThrow(/greater than 0/);
    expect(() => csv.getCsvRecord(noClasses, "Nope", [0, "e", ["Physical"]])).toThrow(/Undefined value Nope/);
  });

  it("strips comments and whitespace like Compiler.prepline", () => {
    expect(readers.prepline("  Name = Potion   # a comment")).toBe("Name = Potion");
    expect(readers.prepline("[004] # Route 29")).toBe("[004]");
  });
});

describe("error reporting", () => {
  let root = "";
  let report: Report;
  let movesLine = 0;
  let itemsLine = 0;
  let trainersLine = 0;
  const lineCount = (path: string) => readFileSync(path, "utf8").split("\n").length;

  beforeAll(async () => {
    // A copy of PBS with a few broken entries, next to the real scripts.
    root = mkdtempSync(join(tmpdir(), "pbs-errors-"));
    for (const dir of ["Data", "Plugins", "Graphics"]) symlinkSync(join(GAME, dir), join(root, dir));
    cpSync(join(GAME, "PBS"), join(root, "PBS"), { recursive: true, filter: (src) => !/[/\\](Gen \d|EBDX)$/.test(src) });
    const pbs = join(root, "PBS");
    const append = (file: string, text: string) => {
      const first = lineCount(join(pbs, file));
      appendFileSync(join(pbs, file), text);
      return first; // line number of the first appended line (files end with a newline)
    };
    movesLine = append("moves.txt", "\n[BADMOVE]\nName = Bad Move\nType = NOTATYPE\nPower = lots\n");
    itemsLine = append("items.txt", "\n[POTION]\nName = Second Potion\n");
    trainersLine = append("trainers.txt", "\n[YOUNGSTER,Tester]\nPokemon = NOTAPOKEMON,5\nPokemon = RATTATA,500\nPokemon = RATTATA,5\n");
    const { compileAll } = await load<{ compileAll: (p: string, o: string) => Report }>("compile.ts");
    report = compileAll(pbs, join(root, "out"));
  }, 60_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const find = (file: string, re: RegExp) => report.issues.find((i) => i.file === file && re.test(i.message));

  it("reports unparsable values with file and line", () => {
    expect(find("PBS/moves.txt", /Undefined value NOTATYPE/)).toMatchObject({ severity: "error", line: movesLine + 3, section: "BADMOVE", key: "Type" });
    expect(find("PBS/moves.txt", /lots is not a positive integer/)).toMatchObject({ line: movesLine + 4, key: "Power" });
  });

  it("reports duplicate IDs and keeps the first definition", () => {
    expect(find("PBS/items.txt", /Item ID 'POTION' is used twice/)).toMatchObject({ line: itemsLine + 1 });
    const items = JSON.parse(readFileSync(join(root, "out", "items.json"), "utf8")) as { id: string; name: string }[];
    expect(items.find((i) => i.id === "POTION")!.name).toBe("Potion");
  });

  it("reports bad trainer Pokémon and skips them", () => {
    expect(find("PBS/trainers.txt", /Undefined value NOTAPOKEMON/)).toMatchObject({ line: trainersLine + 2 });
    expect(find("PBS/trainers.txt", /Bad level: 500/)).toMatchObject({ line: trainersLine + 3 });
    const trainers = JSON.parse(readFileSync(join(root, "out", "trainers.json"), "utf8")) as { name: string; pokemon: unknown[] }[];
    expect(trainers.find((t) => t.name === "Tester")!.pokemon).toEqual([{ species: "RATTATA", level: 5 }]);
  });
});
