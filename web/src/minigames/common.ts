// Shared helpers for the minigame ports (017_Minigames and the minigame
// plugins).
//
// Timing: the minigames count frames. Most of them scale by
// Graphics.frame_rate (40 in the original), but they also move things by a
// fixed amount per frame (reel scrolling, curtain angles, the Roulette's
// Bridge.delta of 0.025 s per frame). So the loops run once per *original*
// 40 fps frame: OriginalFrames.update() is their `Graphics.update`, and it
// waits 60 Hz ticks until the next original frame starts. Input.update is
// called after it, as in Ruby, so a key pressed during a tick without an
// original frame is still seen on the next one. Ruby's `Graphics.frame_rate`
// is RUBY_FRAME_RATE.
//
// Randomness: Kernel#rand is core/random's rand (rand(a..b) is a + rand(b - a + 1)).
// Array#shuffle! and Array#sample use Ruby 2.6's algorithms on top of it, so
// the differential tests can replay the same numbers as the Ruby harnesses.

import { ORIGINAL_FPS } from "../core/loop";
import { rand } from "../core/random";
import type { GameStats } from "../game/trainer/GameStats";
import type { PokemonBag } from "../game/items/PokemonBag";
import type { Player } from "../game/trainer/Player";
import { G } from "../game/globals";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { FrameCounter } from "../ui/frameTime";

/** Graphics.frame_rate in the original game. */
export const RUBY_FRAME_RATE = ORIGINAL_FPS;

/** `Graphics.update` at the original 40 fps (see the header). */
export class OriginalFrames {
  private clock = new FrameCounter();

  /**
   * eachTick runs after every 60 Hz tick of the wait: sprite hashes and the
   * map (pbUpdateSceneMap) are updated per tick, they keep their own time.
   */
  async update(eachTick?: () => unknown): Promise<void> {
    do {
      await Graphics.update();
      await eachTick?.();
    } while (this.clock.tick() === 0);
  }

  /** Graphics.update; Input.update (+ eachTick, see update). */
  async updateWithInput(eachTick?: () => unknown): Promise<void> {
    await this.update(eachTick);
    Input.update();
  }

  /** `frames.times { Graphics.update; Input.update; eachTick }`, frames at 40 fps. */
  async wait(frames: number, eachTick?: () => unknown): Promise<void> {
    for (let i = 0; i < frames; i++) await this.updateWithInput(eachTick);
  }
}

/** Array#shuffle! (Ruby 2.6 array.c: `while (i) { j = RAND_UPTO(i--); swap(ptr[i], ptr[j]); }`). */
export function rubyShuffle<T>(arr: T[]): T[] {
  let i = arr.length;
  while (i) {
    const j = rand(i--);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Array#sample (no random number for a one-element array, nil for an empty one). */
export function rubySample<T>(arr: readonly T[]): T | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0]!;
  return arr[rand(arr.length)]!;
}

/** Ruby's <=> on Integers/Strings. */
export function spaceship(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** sprintf("%0Nd", n) */
export function zeroPad(n: number, digits: number): string {
  return String(Math.trunc(n)).padStart(digits, "0");
}

export const player = () => G.player as unknown as Player;
export const bag = () => G.bag as PokemonBag;
export const stats = () => G.stats as GameStats;
/** $PokemonGlobal, with the fields the minigames add to PokemonGlobalMetadata. */
export const pokemonGlobal = () => G.pokemonGlobal as unknown as Record<string, unknown>;

//===============================================================================
// Ruby's Mersenne Twister (random.c), for Kernel#srand in pbSetLotteryNumber
//===============================================================================
/**
 * MT19937 seeded like Ruby 2.6's srand(Integer) (random.c rand_init):
 * init_genrand for a seed that fits in 32 bits, else init_by_array with its
 * 32-bit words. rand(n) for n <= 2**32 is limited_rand: genrand_int32 masked
 * to the bits of n - 1, retried while above it.
 */
export class RubyMT {
  private mt = new Uint32Array(624);
  private mti = 625;

  constructor(seed: number) {
    const key: number[] = [];
    let s = Math.abs(Math.trunc(seed));
    do {
      key.push(s % 0x1_0000_0000);
      s = Math.floor(s / 0x1_0000_0000);
    } while (s > 0);
    if (key.length <= 1) this.initGenrand(key[0]!);
    else this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = 624;
  }

  private initByArray(key: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(624, key.length); k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1664525)) + key[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= 624) { mt[0] = mt[623]!; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) { mt[0] = mt[623]!; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  genrandInt32(): number {
    const mt = this.mt;
    if (this.mti >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k]! & 0x80000000) | (mt[(k + 1) % 624]! & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.mti = 0;
    }
    let y = mt[this.mti++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** rand(n), 0 < n <= 2**32 */
  rand(n: number): number {
    const limit = n - 1;
    if (limit <= 0) return 0;
    let mask = limit;
    for (let s = 1; s < 32; s <<= 1) mask |= mask >>> s;
    mask >>>= 0;
    for (;;) {
      const val = (this.genrandInt32() & mask) >>> 0;
      if (val <= limit) return val;
    }
  }
}
