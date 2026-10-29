// Ruby's Array#sample and Array#shuffle on Kernel#rand (core/random), for the
// Max Raid and Dynamax Adventure code outside battle. They pick the way Ruby
// 2.6's do (sample: self[rand(size)]; shuffle: from the end, swapping each
// element with one at rand(i)), so tests that script the random numbers see
// the same picks as the Ruby harness (tools/ruby-ref/raid_reference.rb).

import { rand } from "../../core/random";

/** Array#sample (nil for an empty array). */
export function sample<T>(arr: readonly T[]): T | null {
  if (arr.length === 0) return null;
  return arr[rand(arr.length)]!;
}

/** Array#shuffle */
export function shuffle<T>(arr: readonly T[]): T[] {
  const ret = [...arr];
  let i = ret.length;
  while (i > 0) {
    const j = rand(i);
    i -= 1;
    [ret[i], ret[j]] = [ret[j]!, ret[i]!];
  }
  return ret;
}

/** Array#shuffle! */
export function shuffleInPlace<T>(arr: T[]): void {
  const s = shuffle(arr);
  for (let i = 0; i < s.length; i++) arr[i] = s[i]!;
}
