// Helpers that reproduce Ruby string/regex semantics the Essentials compiler
// relies on, so ported code behaves identically on edge cases.

/**
 * Builds a RegExp from Ruby-flavoured source. Ruby's `\s` is ASCII-only and its
 * `.` matches everything but "\n", while JS's `\s` also matches Unicode spaces
 * and its `.` also stops at "\r", so both are rewritten. Inputs are always
 * single lines, so Ruby's line anchors (^ $) behave like JS string anchors.
 */
export function rx(source: string, flags = ""): RegExp {
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (c === "\\" && i + 1 < source.length) {
      const next = source[i + 1]!;
      if (next === "s") out += inClass ? " \\t\\n\\v\\f\\r" : "[ \\t\\n\\v\\f\\r]";
      else out += c + next;
      i++;
      continue;
    }
    if (c === "[" && !inClass) inClass = true;
    else if (c === "]" && inClass) inClass = false;
    else if (c === "." && !inClass) {
      out += "[^\\n]";
      continue;
    }
    out += c;
  }
  return new RegExp(out, flags);
}

/** Ruby's String#split: drops trailing empty fields, and "" splits to []. */
export function rubySplit(str: string, sep: string | RegExp): string[] {
  if (str === "") return [];
  const parts = str.split(sep);
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

const TO_I = rx(String.raw`^\s*([-+]?\d+)`);

/** Ruby's String#to_i: leading integer or 0. */
export function rubyToI(str: string): number {
  const m = TO_I.exec(str);
  return m ? parseInt(m[1]!, 10) : 0;
}

/** Ruby's Float#round (half away from zero). */
export function rubyRound(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Ruby's String#length (code points, not UTF-16 units). */
export function rubyLength(str: string): number {
  return [...str].length;
}

const STRIP_START = rx(String.raw`^\s+`);
const STRIP_END = rx(String.raw`\s+$`);

/** gsub(/^\s+/, "").gsub(/\s+$/, "") */
export function rubyStrip(str: string): string {
  return str.replace(STRIP_START, "").replace(STRIP_END, "");
}

/** Array#uniq, keeping first occurrences. */
export function uniq<T>(arr: readonly T[]): T[] {
  return [...new Set(arr)];
}

/** Ruby's nil_or_empty? */
export function nilOrEmpty(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== "string" || value.length === 0;
}
