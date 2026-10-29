// Ruby numeric semantics the battle code relies on.

/** Float#round / Integer#round: rounds half away from zero (Math.round rounds -2.5 to -2). */
export function rubyRound(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** Integer#/ with two Integers: floors toward negative infinity. */
export function rubyDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Integer#%: the result has the sign of the divisor. */
export function rubyMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}
