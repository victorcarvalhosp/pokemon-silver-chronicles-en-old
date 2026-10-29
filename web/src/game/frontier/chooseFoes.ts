// Port of 018_Alternate battle modes/001_Battle Frontier/003_Challenge_ChooseFoes.rb:
// which trainers a challenge's battles are against, their Pokémon, and the
// Battle Factory's rental Pokémon. Also Ruby's Array#sample, which these
// scripts use, with its exact draws (rand(len), rand(len - 1), ...).

import { rand } from "../../core/random";
import { GrowthRate } from "../../data/gameData/growthRate";
import type { Pokemon } from "../pokemon/Pokemon";
import { NPCTrainer } from "../trainer/Trainer";
import { pbBattleChallenge, pbGetBTPokemon, pbGetBTTrainers, type BTTrainer } from "./challengeData";
import type { PokemonChallengeRules } from "./challengeRules";

/** Array#sample: one random element (no random number for arrays shorter than 2). */
export function sample<T>(array: T[]): T | undefined {
  const i = array.length < 2 ? 0 : rand(array.length);
  return array[i];
}

/** Array#sample(n): n distinct random elements, drawn as Ruby's rb_ary_sample does. */
export function sampleN<T>(array: T[], n: number): T[] {
  const len = array.length;
  if (n < 0) throw new Error("negative sample number");
  if (n > len) n = len;
  const rnds: number[] = [];
  for (let i = 0; i < n; i++) rnds[i] = rand(len - i);
  if (n === 0) return [];
  const idx: number[] = [rnds[0]!];
  const sorted: number[] = [rnds[0]!];
  for (let i = 1; i < n; i++) {
    let k = rnds[i]!;
    let j = 0;
    for (; j < i; j++) {
      if (k < sorted[j]!) break;
      k += 1;
    }
    sorted.splice(j, 0, k);
    idx[i] = k;
  }
  return idx.map((i) => array[i]!);
}

//===============================================================================
// Given an array of trainers and the number of wins the player already has,
// returns a random trainer index. The more wins, the later in the list the
// trainer comes from.
//===============================================================================
export function pbBattleChallengeTrainer(winCount: number, bttrainers: BTTrainer[]): number {
  // This table's start points and lengths are based on a bttrainers size of 300.
  // They are scaled based on the actual size of bttrainers later.
  const table = [ // Each value is [minimum win count, range start point, range length]
    [0, 0, 100], // 0-100
    [6, 80, 40], // 80-120
    [7, 80, 40], // 80-120
    [13, 120, 20], // 120-140
    [14, 100, 40], // 100-140
    [20, 140, 20], // 140-160
    [21, 120, 40], // 120-160
    [27, 160, 20], // 160-180
    [28, 140, 40], // 140-180
    [34, 180, 20], // 180-200
    [35, 160, 40], // 160-200
    [41, 200, 20], // 200-220
    [42, 180, 40], // 180-220
    [48, 220, 40], // 220-260
    [49, 200, 100], // 200-300 - This line is used for all higher win_counts
  ] as const;
  let slot: readonly number[] | null = null;
  for (const val of table) if (val[0] <= winCount && (!slot || slot[0]! < val[0])) slot = val;
  if (!slot) return 0;
  // Scale the start point and length based on how many trainers are in bttrainers
  const offset = Math.floor(slot[1]! * bttrainers.length / 300);
  const length = Math.floor(slot[2]! * bttrainers.length / 300);
  // Return a random trainer index from the chosen range
  // (Ruby: with a length of 0, rand(0) is a float in 0...1, which indexing truncates.)
  return offset + Math.trunc(rand(length));
}

//===============================================================================
//
//===============================================================================
export function pbGenerateBattleTrainer(idxTrainer: number, rules: PokemonChallengeRules): NPCTrainer {
  const bttrainers = pbGetBTTrainers(pbBattleChallenge().currentChallenge);
  const btpokemon = pbGetBTPokemon(pbBattleChallenge().currentChallenge);
  const level = rules.ruleset.suggestedLevel;
  // Create the trainer
  const trainerdata = bttrainers[idxTrainer]!;
  // pbGetMessageFromHash(MessageTypes::TrainerNames, trainerdata[1])
  const opponent = new NPCTrainer(trainerdata[1], trainerdata[0]);
  // Determine how many IVs the trainer's Pokémon will have
  let indvalues = 31;
  if (idxTrainer < 220) indvalues = 21;
  if (idxTrainer < 200) indvalues = 18;
  if (idxTrainer < 180) indvalues = 15;
  if (idxTrainer < 160) indvalues = 12;
  if (idxTrainer < 140) indvalues = 9;
  if (idxTrainer < 120) indvalues = 6;
  if (idxTrainer < 100) indvalues = 3;
  // Get the indices within bypokemon of the Pokémon the trainer may have
  const pokemonnumbers = trainerdata[5];
  // The number of possible Pokémon is <= the required number; make them
  // all Pokémon and use them
  if (pokemonnumbers.length <= rules.ruleset.suggestedNumber) {
    for (const n of pokemonnumbers) {
      const rndpoke = btpokemon[n]!;
      const pkmn = rndpoke.createPokemon(level, indvalues, opponent);
      opponent.party.push(pkmn);
    }
    return opponent;
  }
  // There are more possible Pokémon than there are spaces available in the
  // trainer's party; randomly choose Pokémon
  // NOTE (Ruby parity): with the Pika/Poké/Fancy Cup rules no team is ever
  // valid (their TotalLevelRestriction is a team rule, see addSubsetRule, and
  // the suggested level is the maximum), so this never ends
  // (003_Challenge_ChooseFoes.rb:74-80).
  for (;;) {
    opponent.party.length = 0;
    while (opponent.party.length < rules.ruleset.suggestedNumber) {
      const rnd = pokemonnumbers[rand(pokemonnumbers.length)]!;
      const rndpoke = btpokemon[rnd]!;
      const pkmn = rndpoke.createPokemon(level, indvalues, opponent);
      opponent.party.push(pkmn);
    }
    if (rules.ruleset.isValid(opponent.party)) break;
  }
  return opponent;
}

//===============================================================================
// Generate a full team's worth of Pokémon which obey the given rules.
//===============================================================================
export function pbBattleFactoryPokemon(rules: PokemonChallengeRules, winCount: number, swapCount: number, rentals: Pokemon[]): Pokemon[] {
  const btpokemon = pbGetBTPokemon(pbBattleChallenge().currentChallenge);
  const level = rules.ruleset.suggestedLevel;
  const pokemonNumbers = [0, 0]; // Start and end indices in btpokemon
  let ivs = [0, 0]; // Lower and higher IV values for Pokémon to use
  let ivThreshold = 6; // Number of Pokémon that use the lower IV
  const set = Math.min(Math.floor(winCount / 7), 7); // The set of 7 battles win_count is part of (minus 1)
  // Choose a range of Pokémon in btpokemon to randomly select from. The higher
  // the set number, the later the range lies within btpokemon (typically).
  // This table's start point and end point values are based on a btpokemon size
  // of 881. They are scaled based on the actual size of btpokemon.
  // Group 1 is 0 - 173. Group 2 is 174 - 371. Group 3 is 372 - 881.
  let table: number[][];
  if (level === GrowthRate.maxLevel()) { // Open Level (Level 100)
    table = [
      [372, 491], // Group 3 (first quarter)
      [492, 610], // Group 3 (second quarter)
      [611, 729], // Group 3 (third quarter)
      [730, 849], // Group 3 (fourth quarter)
      [372, 881], // All of Group 3
      [372, 881], // All of Group 3
      [372, 881], // All of Group 3
      [372, 881], // This line is used for all higher sets (all of Group 3)
    ];
  } else {
    table = [
      [0, 173], // Group 1
      [174, 272], // Group 2 (first half)
      [273, 371], // Group 2 (second half)
      [372, 491], // Group 3 (first quarter)
      [492, 610], // Group 3 (second quarter)
      [611, 729], // Group 3 (third quarter)
      [730, 849], // Group 3 (fourth quarter)
      [372, 881], // This line is used for all higher sets (all of Group 3)
    ];
  }
  pokemonNumbers[0] = Math.floor(table[set]![0]! * btpokemon.length / 881);
  pokemonNumbers[1] = Math.floor(table[set]![1]! * btpokemon.length / 881);
  // Choose two IV values for Pokémon to use (the one for the current set, and
  // the one for the next set). The iv_threshold below determines which of these
  // two values a given Pokémon uses. The higher the set number, the higher these
  // values are.
  const ivtable = [3, 6, 9, 12, 15, 21, 31, 31]; // Last value is used for all higher sets
  ivs = [ivtable[set]!, ivtable[Math.min(set + 1, 7)]!];
  // Choose a threshold, which is the number of Pokémon with the lower IV out of
  // the two chosen above. The higher the swap_count, the lower this threshold
  // (i.e. the more Pokémon will have the higher IV).
  const thresholds = [ // Each value is [minimum swap count, threshold value]
    [0, 6],
    [15, 5],
    [22, 4],
    [29, 3],
    [36, 2],
    [43, 1],
  ];
  for (const val of thresholds) if (swapCount >= val[0]!) ivThreshold = val[1]!;
  // Randomly choose Pokémon from the range to fill the party with
  const oldMin = rules.ruleset.minLength;
  const oldMax = rules.ruleset.maxLength;
  if (rentals.length === 0) {
    rules.ruleset.setNumber(6); // Rentals
  } else {
    rules.ruleset.setNumber(oldMax + rentals.length); // Opponent
  }
  const party: Pokemon[] = [];
  for (;;) {
    party.length = 0;
    while (party.length < (rentals.length === 0 ? 6 : oldMax)) {
      // NOTE (Ruby parity): the end index is scaled from 881 to the list's
      // length, so with 882 Pokémon it can be 882, past the end (nil:
      // NoMethodError, 003_Challenge_ChooseFoes.rb:124,155).
      const rnd = pokemonNumbers[0]! + rand(pokemonNumbers[1]! - pokemonNumbers[0]! + 1);
      const rndpoke = btpokemon[rnd]!;
      const indvalue = party.length < ivThreshold ? ivs[0]! : ivs[1]!;
      party.push(rndpoke.createPokemon(level, indvalue, null));
    }
    if (rules.ruleset.isValid([...party, ...rentals])) break;
  }
  rules.ruleset.setNumberRange(oldMin, oldMax);
  return party;
}
