// The "[id] then XXX=YYY lines" loop that compile_abilities, compile_moves,
// compile_items, compile_ribbons, compile_trainer_types, etc. all repeat.

import type { Ctx } from "./context.ts";
import { getCsvRecord, type Schema, type Value } from "./csv.ts";
import { preppedLines, type Line } from "./readers.ts";
import { rx } from "./ruby.ts";

export const LINE_SECTION = rx(String.raw`^\s*\[\s*(.+)\s*\]\s*$`);
export const LINE_KEY_VALUE = rx(String.raw`^\s*(\w+)\s*=\s*(.*)\s*$`);

export interface LineSection {
  id: string;
  line: number;
  /** Parsed values keyed by the schema's target (e.g. "name", "base_damage"). */
  hash: Record<string, Value>;
  /** Line of each PBS key, for error reporting. */
  keyLines: Record<string, number>;
}

export interface LineSectionOptions {
  /** Called for lines that are neither a header nor XXX=YYY (Essentials' pre-v20 CSV formats). */
  oldFormat?: (line: Line) => void;
  /** Called for XXX=YYY lines appearing before any section (berry plants/Shadow Pokémon old format). */
  headerless?: (key: string, value: string, line: Line) => void;
}

/**
 * Reads a sectioned PBS file line by line. Sections whose ID was already used
 * are reported (Essentials raises "ID is used twice") and dropped, along with
 * their lines.
 */
export function eachLineSection(ctx: Ctx, path: string, schema: Record<string, Schema>, label: string, opts: LineSectionOptions = {}): LineSection[] {
  const sections: LineSection[] = [];
  const seen = new Set<string>();
  let current: LineSection | null = null;
  for (const ln of preppedLines(ctx, path)) {
    const header = LINE_SECTION.exec(ln.text);
    if (header) {
      const id = header[1]!;
      if (seen.has(id)) {
        ctx.error(ln.line, `${label} ID '${id}' is used twice.`, { section: id });
        current = { id, line: ln.line, hash: {}, keyLines: {} };
        continue;
      }
      seen.add(id);
      current = { id, line: ln.line, hash: {}, keyLines: {} };
      sections.push(current);
      continue;
    }
    const kv = LINE_KEY_VALUE.exec(ln.text);
    if (kv) {
      if (!current) {
        if (opts.headerless) opts.headerless(kv[1]!, kv[2]!, ln);
        else ctx.error(ln.line, "Expected a section at the beginning of the file.");
        continue;
      }
      const key = kv[1]!;
      const lineSchema = schema[key];
      if (!lineSchema) continue;
      const section = current;
      ctx.attempt(
        ln.line,
        () => {
          section.hash[lineSchema[0] as string] = getCsvRecord(ctx, kv[2]!, lineSchema);
          section.keyLines[key] = ln.line;
        },
        { section: section.id, key },
      );
      continue;
    }
    if (opts.oldFormat) opts.oldFormat(ln);
    else ctx.error(ln.line, `Unrecognised line (pre-v20 CSV format is not supported): ${ln.text}`);
  }
  return sections;
}

/** `hash[key] || fallback` for values from getCsvRecord (Ruby truthiness: only nil/false are falsy). */
export function or<T>(value: Value | undefined, fallback: T): T {
  return value === undefined || value === null || value === false ? fallback : (value as T);
}
