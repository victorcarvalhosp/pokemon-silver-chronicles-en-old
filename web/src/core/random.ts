// Seedable random numbers (mulberry32) so recorded play sessions and tests
// replay identically. rand(n) matches Ruby's Kernel#rand(n).

let state = (Date.now() ^ 0x9e3779b9) >>> 0;

export function seedRandom(seed: number): void {
  state = seed >>> 0;
}

export function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Ruby rand(n): integer in 0...n (n <= 0 gives a float in 0...1). */
export function rand(n: number): number {
  return n > 0 ? Math.floor(random() * n) : random();
}
