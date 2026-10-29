// Ports of the PBS file readers in Data/Scripts/021_Compiler/001_Compiler.rb.
// Each returns plain data instead of yielding, and records (instead of raising)
// the syntax errors Essentials would raise, skipping the offending line.

import { existsSync, readFileSync } from "node:fs";
import type { Ctx } from "./context.ts";
import { rubyStrip, rx } from "./ruby.ts";

export interface Line {
  text: string;
  line: number;
}

export interface SectionValue {
  value: string;
  line: number;
}

export interface Section {
  name: string;
  line: number;
  /** XXX=YYY pairs in first-seen order; a repeated key keeps the last value. */
  entries: Map<string, SectionValue>;
}

/** Raw lines as Ruby's each_line yields them (BOM stripped from line 1, "\r\n" endings removed). */
function rawLines(ctx: Ctx, path: string): Line[] {
  ctx.setFile(path);
  if (!existsSync(path)) {
    ctx.error(null, "File not found.");
    return [];
  }
  ctx.sources.add(ctx.file);
  let text = readFileSync(path, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.split("\n").map((t, i) => ({ text: t.endsWith("\r") ? t.slice(0, -1) : t, line: i + 1 }));
}

const COMMENT_LINE = /^#/;
const BLANK_LINE = rx(String.raw`^\s*$`);
const PREP_COMMENT = rx(String.raw`\s*\#.*$`);
const PREP_LEAD = rx(String.raw`^\s+`);
const PREP_TRAIL = rx(String.raw`\s+$`);

/** Compiler.prepline: strips a trailing # comment (even inside quotes) and surrounding whitespace. */
export function prepline(line: string): string {
  return line.replace(PREP_COMMENT, "").replace(PREP_LEAD, "").replace(PREP_TRAIL, "");
}

const SECTION_EX = rx(String.raw`^\s*\[\s*(.*)\s*\]\s*$`);
const KEY_VALUE = rx(String.raw`^\s*(\w+)\s*=\s*(.*)$`);

/** pbEachFileSectionEx: [section] headers followed by XXX=YYY lines. */
export function eachFileSectionEx(ctx: Ctx, path: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const { text, line } of rawLines(ctx, path)) {
    if (COMMENT_LINE.test(text) || BLANK_LINE.test(text)) continue;
    const prepped = prepline(text);
    const header = SECTION_EX.exec(prepped);
    if (header) {
      current = { name: header[1]!, line, entries: new Map() };
      sections.push(current);
      continue;
    }
    if (!current) {
      ctx.error(line, `Expected a section at the beginning of the file: ${prepped}`);
      continue;
    }
    const kv = KEY_VALUE.exec(prepped);
    if (!kv) {
      ctx.error(line, `Bad line syntax (expected syntax like XXX=YYY): ${prepped}`, { section: current.name });
      continue;
    }
    current.entries.set(kv[1]!, { value: kv[2]!.replace(PREP_TRAIL, ""), line });
  }
  return sections;
}

/** pbEachFileSection: as above, but only non-empty section names. */
export function eachFileSection(ctx: Ctx, path: string): Section[] {
  return eachFileSectionEx(ctx, path).filter((s) => s.name.length > 0);
}

/** pbEachFileSectionNumbered: only sections named with digits; the name becomes its integer. */
export function eachFileSectionNumbered(ctx: Ctx, path: string): (Section & { id: number })[] {
  return eachFileSectionEx(ctx, path)
    .filter((s) => /^\d+$/.test(s.name))
    .map((s) => ({ ...s, id: parseInt(s.name, 10) }));
}

const PHONE_SECTION = rx(String.raw`^\s*\[\s*(.+?)\s*\]\s*$`);

/** pbEachSection (phone.txt): sections holding raw stripped lines. */
export function eachSection(ctx: Ctx, path: string): { name: string; line: number; lines: string[] }[] {
  const sections: { name: string; line: number; lines: string[] }[] = [];
  let current: { name: string; line: number; lines: string[] } | null = null;
  for (const { text, line } of rawLines(ctx, path)) {
    if (COMMENT_LINE.test(text) || BLANK_LINE.test(text)) continue;
    const header = PHONE_SECTION.exec(text);
    if (header) {
      current = { name: header[1]!, line, lines: [] };
      sections.push(current);
    } else if (!current) {
      ctx.error(line, "Expected a section at the beginning of the file. Sections begin with '[name of section]'");
    } else {
      current.lines.push(rubyStrip(text));
    }
  }
  return sections;
}

/** pbCompilerEachCommentedLine: raw lines, skipping full-line comments and blanks. */
export function commentedLines(ctx: Ctx, path: string): Line[] {
  return rawLines(ctx, path).filter(({ text }) => !COMMENT_LINE.test(text) && !BLANK_LINE.test(text));
}

/** pbCompilerEachPreppedLine: prepped lines, skipping those left empty. */
export function preppedLines(ctx: Ctx, path: string): Line[] {
  return rawLines(ctx, path)
    .map(({ text, line }) => ({ text: prepline(text), line }))
    .filter(({ text }) => !COMMENT_LINE.test(text) && !BLANK_LINE.test(text));
}
