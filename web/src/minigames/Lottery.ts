// Port of 017_Minigames/005_Minigame_Lottery.rb ("Lottery" mini-game, by
// Maruno).
//
// pbSetLotteryNumber seeds Ruby's Mersenne Twister with the date
// (srand(hash); rand(65_536)) so the number is the same all day; RubyMT is
// that generator, so the port draws the same number as the original on the
// same date. The `srand` afterwards (reseeding from the system) doesn't
// apply: the port's random numbers come from core/random.

import { pbGetTimeNow } from "../game/dayNight";
import { G } from "../game/globals";
import { pbEachPokemon } from "../game/pokemon/PokemonStorage";
import { player, RubyMT, zeroPad } from "./common";

/** The number pbSetLotteryNumber draws on this date (srand(hash); rand(65_536)). */
export function lotteryNumber(t: Date): number {
  const hash = t.getDate() + ((t.getMonth() + 1) << 5) + (t.getFullYear() << 9);
  return new RubyMT(hash).rand(65_536); // seed RNG with fixed value depending on date; get a number
}

export function pbSetLotteryNumber(variable = 1): void {
  const t = pbGetTimeNow();
  const lottery = lotteryNumber(t);
  // srand # reseed RNG
  pbSet(variable, zeroPad(lottery, 5));
}

/** pbSet(id, value) (019_Utilities/001_Utilities.rb) */
function pbSet(id: number, value: unknown): void {
  if (id == null || id < 0) return;
  G.gameVariables?.set(id, value);
  const map = G.gameMap as unknown as { needRefresh?: boolean } | null;
  if (map) map.needRefresh = true;
}

/** $game_variables[id] = value */
function setVariable(id: number, value: unknown): void {
  G.gameVariables.set(id, value);
}

/** Ruby's String#to_i: the leading integer, 0 if none. */
function rubyToI(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  const m = /^\s*([+-]?\d+)/.exec(String(value ?? ""));
  return m ? parseInt(m[1]!, 10) : 0;
}

export function pbLottery(winnum: unknown, nameVar = 2, positionVar = 3, matchedVar = 4): void {
  const num = rubyToI(winnum);
  let winpoke: string | null = null;
  let winpos = 0;
  let winmatched = 0;
  for (const i of player().party) {
    let thismatched = 0;
    const id = i.owner.publicId();
    for (let j = 0; j < 5; j++) {
      if (Math.floor(id / (10 ** j)) % 10 !== Math.floor(num / (10 ** j)) % 10) break;
      thismatched += 1;
    }
    if (thismatched <= winmatched) continue;
    winpoke = i.name;
    winpos = 1; // Party
    winmatched = thismatched;
  }
  for (const [poke] of pbEachPokemon()) {
    let thismatched = 0;
    const id = poke.owner.publicId();
    for (let j = 0; j < 5; j++) {
      if (Math.floor(id / (10 ** j)) % 10 !== Math.floor(num / (10 ** j)) % 10) break;
      thismatched += 1;
    }
    if (thismatched <= winmatched) continue;
    winpoke = poke.name;
    winpos = 2; // Storage
    winmatched = thismatched;
  }
  setVariable(nameVar, winpoke);
  setVariable(positionVar, winpos);
  setVariable(matchedVar, winmatched);
}
