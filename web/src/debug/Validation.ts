// Port of 001_Technical/001_Debugging/004_Validation.rb: Kernel#validate,
// which checks that method arguments are of a given class or respond to a
// method. Ruby passes a Hash {value => condition}; JS objects can't be keyed
// by values, so this takes [value, condition] pairs.
//
//   validate([foo, Integer], [baz, "toString"])    // foo an integer, baz has #toString
//   validate([foo, [Sprite, Bitmap, Viewport]])      // foo one of these

/** Ruby's Integer (JS has no integer class): a number with no fraction. */
export const Integer = { name: "Integer", check: (v: unknown) => Number.isInteger(v) };
/** NilClass: null or undefined. */
export const NilClass = { name: "NilClass", check: (v: unknown) => v === null || v === undefined };
/** TrueClass / FalseClass */
export const TrueClass = { name: "TrueClass", check: (v: unknown) => v === true };
export const FalseClass = { name: "FalseClass", check: (v: unknown) => v === false };

type Checker = { name: string; check: (v: unknown) => boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klass = (abstract new (...args: any[]) => unknown) | Checker | StringConstructor | NumberConstructor | BooleanConstructor;
export type Condition = Klass | Klass[] | string;

function isA(value: unknown, klass: Klass): boolean {
  if ("check" in klass && typeof klass.check === "function") return klass.check(value);
  if (klass === String) return typeof value === "string" || value instanceof String;
  if (klass === Number) return typeof value === "number" || value instanceof Number;
  if (klass === Boolean) return typeof value === "boolean" || value instanceof Boolean;
  return value instanceof (klass as abstract new (...args: never[]) => unknown);
}

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "nil";
  return String(value);
}

function className(value: unknown): string {
  if (value === null || value === undefined) return "NilClass";
  if (Number.isInteger(value)) return "Integer";
  if (typeof value === "number") return "Float";
  if (typeof value === "string") return "String";
  if (value === true) return "TrueClass";
  if (value === false) return "FalseClass";
  return (value as object).constructor?.name ?? "Object";
}

/** Kernel#validate(value_pairs): raises ArgumentError (here an Error named so) if validation fails. */
export function validate(...valuePairs: [unknown, Condition][]): void {
  if (!Array.isArray(valuePairs)) {
    const err = new Error(`Non-hash argument ${inspect(valuePairs)} passed into validate.`);
    err.name = "ArgumentError";
    throw err;
  }
  const errors: string[] = [];
  for (const [value, condition] of valuePairs) {
    if (Array.isArray(condition)) {
      if (!condition.some((klass) => isA(value, klass))) {
        errors.push(`Expected ${inspect(value)} to be one of [${condition.map((k) => k.name).join(", ")}], but got ${className(value)}.`);
      }
    } else if (typeof condition === "string") {
      const fn = value === null || value === undefined ? undefined : (value as Record<string, unknown>)[condition];
      if (typeof fn !== "function") errors.push(`Expected ${inspect(value)} to respond to ${condition}.`);
    } else if (!isA(value, condition)) {
      errors.push(`Expected ${inspect(value)} to be a ${condition.name}, but got ${className(value)}.`);
    }
  }
  if (errors.length === 0) return;
  const err = new Error("Invalid argument passed to method.\r\n" + errors.join("\r\n"));
  err.name = "ArgumentError";
  throw err;
}
