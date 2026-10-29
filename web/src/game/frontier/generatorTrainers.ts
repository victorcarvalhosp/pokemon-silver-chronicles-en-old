// Port of 018_Alternate battle modes/003_Battle Frontier generator/003_ChallengeGenerator_Trainers.rb:
// assigning a generated Pokémon list to a challenge's trainers and saving it
// as the challenge's trainer list. Also getRandomNameEx from
// 019_Utilities/001_Utilities.rb, which names generated trainers.

import { rand } from "../../core/random";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { TrainerType } from "../../data/gameData/trainerType";
import { Type } from "../../data/gameData/type";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import {
  type BTTrainer, loadTrainerListsDat, PBPokemon, pbGetBTPokemon, pbGetBTTrainers, saveTrainerListsDat, type TrainerListData,
} from "./challengeData";
import type { PokemonChallengeRules } from "./challengeRules";
import { sample } from "./chooseFoes";
import { Compiler } from "./writeTrainerLists";

export function getTypes(species: Id): Id[] {
  const speciesData = Species.get(species);
  return [...speciesData.types];
}

/** getRandomNameEx(type, variable, upper, maxLength = 100) (019_Utilities/001_Utilities.rb:263) */
export function getRandomNameEx(type: number, variable: number | null, upper: number | null, maxLength = 100): string {
  if (maxLength <= 0) return "";
  let name = "";
  for (let n = 0; n < 50; n++) {
    name = "";
    let formats: string[] = [];
    switch (type) {
      case 0: formats = ["F5", "BvE", "FE", "FE5", "FEvE"]; break; // Names for males
      case 1: formats = ["vE6", "vEvE6", "BvE6", "B4", "v3", "vEv3", "Bv3"]; break; // Names for females
      case 2: formats = ["WE", "WEU", "WEvE", "BvE", "BvEU", "BvEvE"]; break; // Neutral gender names
      default: return "";
    }
    const format = formats[rand(formats.length)]!;
    const pick = (set: string[]) => set[rand(set.length)]!;
    for (const c of format) {
      switch (c) {
        case "c": // consonant
          name += pick("b c d f g h j k l m n p r s t v w x z".split(" "));
          break;
        case "v": // vowel
          name += pick("a a a e e e i i i o o o u u u".split(" "));
          break;
        case "W": // beginning vowel
          name += pick("a a a e e e i i i o o o u u u au au ay ay ea ea ee ee oo oo ou ou".split(" "));
          break;
        case "U": // ending vowel
          name += pick("a a a a a e e e i i i o o o o o u u ay ay ie ie ee ue oo".split(" "));
          break;
        case "B": { // beginning consonant
          const set1 = "b c d f g h j k l l m n n p r r s s t t v w y z".split(" ");
          const set2 = ("bl br ch cl cr dr fr fl gl gr kh kl kr ph pl pr sc sk sl " +
            "sm sn sp st sw th tr tw vl zh").split(" ");
          name += rand(3) > 0 ? pick(set1) : pick(set2);
          break;
        }
        case "E": { // ending consonant
          const set1 = "b c d f g h j k k l l m n n p r r s s t t v z".split(" ");
          const set2 = ("bb bs ch cs ds fs ft gs gg ld ls nd ng nk rn kt ks " +
            "ms ns ph pt ps sk sh sp ss st rd rn rp rm rt rk ns th zh").split(" ");
          name += rand(3) > 0 ? pick(set1) : pick(set2);
          break;
        }
        case "f": // consonant and vowel
          name += pick("iz us or".split(" "));
          break;
        case "F": // consonant and vowel
          name += pick(("bo ba be bu re ro si mi zho se nya gru gruu glee gra glo ra do zo ri " +
            "di ze go ga pree pro po pa ka ki ku de da ma mo le la li").split(" "));
          break;
        case "2":
          name += pick("c f g k l p r s t".split(" "));
          break;
        case "3":
          name += pick("nka nda la li ndra sta cha chie".split(" "));
          break;
        case "4":
          name += pick("una ona ina ita ila ala ana ia iana".split(" "));
          break;
        case "5":
          name += pick("e e o o ius io u u ito io ius us".split(" "));
          break;
        case "6":
          name += pick("a a a elle ine ika ina ita ila ala ana".split(" "));
          break;
      }
    }
    if (name.length <= maxLength) break;
  }
  name = name.slice(0, maxLength);
  switch (upper) {
    case 0: name = name.toUpperCase(); break;
    case 1: name = name.slice(0, 1).toUpperCase() + name.slice(1); break;
  }
  if (G.gameVariables && variable) {
    G.gameVariables.set(variable, name);
    if (G.gameMap) (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
  }
  return name;
}

//===============================================================================
// If no trainers are defined for the current challenge, generate a set of random
// ones for it. If pokemonlist is given, assign Pokémon from it to all trainers.
// Save the results in the appropriate PBS files.
//===============================================================================
export async function pbTrainerInfo(pokemonlist: Pokemon[], trfile: string, rules: PokemonChallengeRules,
  block?: () => void | Promise<void>): Promise<void> {
  let bttrainers = pbGetBTTrainers(trfile);
  const btpokemon = pbGetBTPokemon(trfile);
  // No battle trainers found; fill bttrainers with 200 randomly chosen ones from
  // all that exist (with a base money < 100)
  if (bttrainers.length === 0) {
    bttrainers = [];
    for (let i = 0; i < 200; i++) {
      if (block && i % 50 === 0) await block();
      let trainerid: Id | null = null;
      if (TrainerType.exists("YOUNGSTER") && rand(30) === 0) {
        trainerid = "YOUNGSTER";
      } else {
        const trTypekeys = TrainerType.keys();
        // NOTE (Ruby parity): this loop has no break, so it never ends
        // (003_ChallengeGenerator_Trainers.rb:27-32). It only runs for a
        // challenge with no trainer list and no default list.
        for (;;) {
          const trType = sample(trTypekeys)!;
          const trTypeData = TrainerType.get(trType);
          if (trTypeData.baseMoney >= 100) continue;
          trainerid = trTypeData.id;
        }
      }
      // Create a random name for the trainer
      const gender = TrainerType.get(trainerid).gender;
      const randomName = getRandomNameEx(gender, null, 0, 12);
      // Add the trainer to bttrainers
      const tr: BTTrainer = [trainerid, randomName, _INTL("Here I come!"), _INTL("Yes, I won!"), _INTL("Man, I lost!"), []];
      bttrainers.push(tr);
    }
    // Sort all the randomly chosen trainers by their base money (smallest first)
    bttrainers.sort((a, b) => {
      const money1 = TrainerType.get(a[0]).baseMoney;
      const money2 = TrainerType.get(b[0]).baseMoney;
      if (money1 === money2) return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
      return money1 - money2;
    });
  }
  if (block) await block();
  // Set all Pokémon in pokemonlist to the appropriate level, and determine their
  // type(s) and whether they are valid for the given rules
  const suggestedLevel = rules.ruleset.suggestedLevel;
  const rulesetTeam = rules.ruleset.copy().clearPokemonRules();
  const pkmntypes: Id[][] = [];
  const validities: boolean[] = [];
  for (const pkmn of pokemonlist) {
    if (pkmn.level !== suggestedLevel) pkmn.level = suggestedLevel;
    pkmntypes.push(getTypes(pkmn.species));
    validities.push(rules.ruleset.isPokemonValid(pkmn));
  }
  // For each trainer in bttrainers, come up with a set of Pokémon taken from
  // pokemonlist for that trainer, and copy the trainer and their set of Pokémon
  // to newbttrainers
  const newbttrainers: BTTrainer[] = [];
  const WEIGHTS = [32, 12, 5, 2, 1, 0, 0, 0];
  for (let btt = 0; btt < bttrainers.length; btt++) {
    if (block && btt % 50 === 0) await block();
    const trainerdata = bttrainers[btt]!;
    const pokemonnumbers = trainerdata[5] || [];
    // Find all the Pokémon available to the trainer, and count up how often
    // those Pokémon have each type
    let species: Id[] = [];
    const types: Record<Id, number> = {};
    for (const t of Type.each()) types[t.id] = 0;
    for (const pn of pokemonnumbers) {
      const pkmn = btpokemon[pn]!;
      species.push(pkmn.species);
      const t = getTypes(pkmn.species);
      for (const typ of t) types[typ] = types[typ]! + 1;
    }
    species = [...new Set(species)]; // remove duplicates
    // Scale down the counts of each type to the range 0 -> 10
    let count = 0;
    for (const t of Type.each()) {
      if (types[t.id]! >= 5) {
        types[t.id] = Math.floor(types[t.id]! / 4);
        if (types[t.id]! > 10) types[t.id] = 10;
      } else {
        types[t.id] = 0;
      }
      count += types[t.id]!;
    }
    if (count === 0) types["NORMAL"] = 1; // All type counts are 0; add 1 to Normal
    // Trainer had no Pokémon available to it; make all the type counts 1
    if (pokemonnumbers.length === 0) {
      for (const t of Type.each()) types[t.id] = 1;
    }
    // Get Pokémon from pokemonlist, if there are any, and make sure enough are
    // gotten that a valid team can be made from them
    let numbers: number[] = [];
    if (pokemonlist) {
      // For each valid Pokémon in pokemonlist, add its index within pokemonlist
      // to numbers, but only if that species is available to the trainer.
      // Pokémon are less likely to be added if it is positioned later in
      // pokemonlist, or if the trainer is positioned earlier in bttrainers (i.e.
      // later trainers get better Pokémon).
      const numbersPokemon: Pokemon[] = [];
      for (let index = 0; index < pokemonlist.length; index++) {
        if (!validities[index]) continue;
        const pkmn = pokemonlist[index]!;
        const absDiff = Math.abs(Math.floor(index * 8 / pokemonlist.length) - Math.floor(btt * 8 / bttrainers.length));
        if (species.includes(pkmn.species)) {
          const weight = WEIGHTS[Math.min(absDiff, 7)]!;
          if (rand(40) < weight) {
            numbers.push(index);
            numbersPokemon.push(pokemonlist[index]!);
          }
        } else {
          // Pokémon's species isn't available to the trainer; try adding it
          // anyway (more likely to add it if the trainer has access to more
          // Pokémon of the same type(s) as this Pokémon)
          const t = pkmntypes[index]!;
          for (const typ of t) {
            let weight = WEIGHTS[Math.min(absDiff, 7)]!;
            weight *= types[typ]!;
            if (rand(40) < weight) {
              numbers.push(index);
              numbersPokemon.push(pokemonlist[index]!);
            }
          }
        }
      }
      numbers = [...new Set(numbers)]; // Remove duplicates
      // If there aren't enough Pokémon to form a full team, or a valid team
      // can't be made from them, fill up numbers with Pokémon in pokemonlist
      // that EITHER have the same species as one available to the trainer OR has
      // a type that is available to the trainer, until a valid team can be
      // formed from what's in numbers
      if (numbers.length < Settings.MAX_PARTY_SIZE ||
          !rulesetTeam.hasValidTeam(numbersPokemon)) {
        for (let index = 0; index < pokemonlist.length; index++) {
          const pkmn = pokemonlist[index]!;
          if (!validities[index]) continue;
          if (species.includes(pkmn.species)) {
            numbers.push(index);
            numbersPokemon.push(pokemonlist[index]!);
          } else {
            const t = pkmntypes[index]!;
            for (const typ of t) {
              if (types[typ]! <= 0 || numbers.includes(index)) continue;
              numbers.push(index);
              numbersPokemon.push(pokemonlist[index]!);
              break;
            }
          }
          if (numbers.length >= Settings.MAX_PARTY_SIZE && rules.ruleset.hasValidTeam(numbersPokemon)) break;
        }
        // If there STILL aren't enough Pokémon to form a full team, or a valid
        // team can't be made from them, add random Pokémon from pokemonlist
        // until a valid team can be formed from what's in numbers
        if (numbers.length < Settings.MAX_PARTY_SIZE || !rules.ruleset.hasValidTeam(numbersPokemon)) {
          while (numbers.length < pokemonlist.length &&
                 (numbers.length < Settings.MAX_PARTY_SIZE || !rules.ruleset.hasValidTeam(numbersPokemon))) {
            const index = rand(pokemonlist.length);
            if (!numbers.includes(index)) {
              numbers.push(index);
              numbersPokemon.push(pokemonlist[index]!);
            }
          }
        }
      }
      numbers.sort((a, b) => a - b);
    }
    // Add the trainer's data, including all Pokémon that should be available to
    // it (from pokemonlist), to newbttrainers
    newbttrainers.push([trainerdata[0], trainerdata[1], trainerdata[2],
      trainerdata[3], trainerdata[4], numbers]);
  }
  if (block) await block();
  // Add the trainer and Pokémon data from above to trainer_lists.dat, and then
  // create all PBS files from it
  const pbpokemonlist: PBPokemon[] = [];
  for (const pkmn of pokemonlist) pbpokemonlist.push(PBPokemon.fromPokemon(pkmn));
  const trlists = loadTrainerListsDat();
  let hasDefault = false;
  let trIndex = -1;
  for (let i = 0; i < trlists.length; i++) {
    if (!trlists[i]![5]) continue;
    hasDefault = true;
    break;
  }
  for (let i = 0; i < trlists.length; i++) {
    if (!trlists[i]![2].includes(trfile)) continue;
    trIndex = i;
    trlists[i]![0] = newbttrainers;
    trlists[i]![1] = pbpokemonlist;
    trlists[i]![5] = !hasDefault;
  }
  if (block) await block();
  if (trIndex < 0) {
    const info: TrainerListData = [newbttrainers, pbpokemonlist, [trfile],
      trfile + "_trainers.txt", trfile + "_pkmn.txt", !hasDefault];
    trlists.push(info);
  }
  if (block) await block();
  saveTrainerListsDat(trlists);
  if (block) await block();
  await Compiler.writeTrainerLists();
  if (block) await block();
}
