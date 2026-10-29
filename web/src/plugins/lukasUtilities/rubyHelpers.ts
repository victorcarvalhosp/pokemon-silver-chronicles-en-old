// Ruby core semantics the Scripting Utilities port relies on (integer
// division, String#to_i / #to_f / #split, raised Ruby errors).

/** A Ruby exception (NameError, NoMethodError, RuntimeError...) raised by the original code. */
export class RubyError extends Error {
  constructor(
    readonly rubyClass: string,
    message: string,
  ) {
    super(message);
    this.name = rubyClass;
  }
}

/** Ruby's `a / b`: floor division when both are integers, else float division. */
export function rdiv(a: number, b: number): number {
  if (Number.isInteger(a) && Number.isInteger(b)) {
    if (b === 0) throw new RubyError("ZeroDivisionError", "divided by 0");
    return Math.floor(a / b) || 0;
  }
  return a / b;
}

/** Float#to_i / Integer#to_i: truncation toward zero (never -0). */
export const toI = (v: number): number => Math.trunc(v) || 0;

/** String#to_i: the leading integer ("12_3abc" -> 123), else 0. */
export function strToI(s: string): number {
  const m = /^\s*([+-]?\d+(?:_\d+)*)/.exec(s);
  return m ? parseInt(m[1]!.replaceAll("_", ""), 10) || 0 : 0;
}

/** String#to_i(16) */
export function strToIHex(s: string): number {
  const m = /^\s*([+-]?)(?:0x)?([0-9a-f]+(?:_[0-9a-f]+)*)/i.exec(s);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * parseInt(m[2]!.replaceAll("_", ""), 16) || 0;
}

/** String#to_f: "1.2.3" -> 1.2, ".5" -> 0.5, "-0" -> -0.0, "-" -> 0.0. */
export function strToF(s: string): number {
  const m = /^\s*([+-]?)(\d+(?:_\d+)*)?(?:\.(\d+(?:_\d+)*))?/.exec(s)!;
  if (m[2] === undefined && m[3] === undefined) return 0;
  const exp = /^[eE][+-]?\d+/.exec(s.slice(m[0].length))?.[0] ?? "";
  return parseFloat(`${m[1]}${(m[2] ?? "0").replaceAll("_", "")}.${(m[3] ?? "0").replaceAll("_", "")}${exp}`);
}

/** String#split(string): like JS split, minus the trailing empty strings. */
export function rsplit(s: string, sep: string): string[] {
  const parts = s.split(sep);
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** Ruby truthiness: everything but nil and false. */
export const truthy = (v: unknown): boolean => v !== null && v !== undefined && v !== false;

/** Object#clone for the values the helpers copy (arrays and plain objects shallowly). */
export function rclone<T>(v: T): T {
  if (Array.isArray(v)) return [...v] as T;
  if (v && typeof v === "object") {
    const c = (v as { clone?: () => T }).clone;
    if (typeof c === "function") return c.call(v);
    return Object.assign(Object.create(Object.getPrototypeOf(v) as object) as object, v) as T;
  }
  return v;
}
