// Port of Data/Scripts/019_Utilities/002_Utilities_Pokemon.rb (adding Pokémon
// to the party/boxes, eggs, sizes), plus:
// - PokemonEvolutionScene.pbDuplicatePokemon (016_UI/.../004_UI_Evolution.rb),
//   used by Shedinja's evolution method;
// - pbNumOwnedSpecies (Essentials Deluxe);
// - is_first_pokemon_species? / has_species_index? / switchPositionIfHasPokemon
//   (Pokemon Silver Chronicles Helpers/Utils.rb).
//
// UI steps (naming screen, Pokédex entry) go through hooks the UI ports set.

import { setDuplicatePokemonHook } from "../../data/gameData/evolution";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { G } from "../globals";
import { pbConfirmMessageHook, pbMessageHook } from "../items/itemUtilities";
import type { Player } from "../trainer/Player";
import { Pokemon } from "./Pokemon";
import { PokemonOwner } from "./PokemonOwner";
import { pbEachNonEggPokemon, type PokemonStorage } from "./PokemonStorage";

const player = () => G.player as unknown as Player;
const storage = () => (G as unknown as { storage: PokemonStorage }).storage;

export const PokemonUIHooks = {
  /** pbEnterPokemonName(helptext, minlength, maxlength, initialText, pokemon): the naming screen. */
  enterPokemonName: null as ((helptext: string, minLength: number, maxLength: number, initialText: string, pkmn: Pokemon) => Promise<string>) | null,
  /** pbFadeOutIn { PokemonPokedexInfoScreen#pbDexEntry(species) } */
  dexEntry: null as ((species: Id) => Promise<void>) | null,
};

export function pbBoxesFull(): boolean {
  return player().partyFull() && storage().full();
}

export async function pbNickname(pkmn: Pokemon): Promise<void> {
  if (G.pokemonSystem.givenicknames !== 0) return;
  const speciesName = pkmn.speciesName();
  if (await pbConfirmMessageHook(_INTL("Would you like to give a nickname to {1}?", speciesName))) {
    if (!PokemonUIHooks.enterPokemonName) throw new Error("The naming screen isn't ported yet");
    pkmn.name = await PokemonUIHooks.enterPokemonName(_INTL("{1}'s nickname?", speciesName), 0, Pokemon.MAX_NAME_SIZE, "", pkmn);
  }
}

export async function pbStorePokemon(pkmn: Pokemon): Promise<void> {
  if (pbBoxesFull()) {
    await pbMessageHook(_INTL("There's no more room for Pokémon!\x01"));
    await pbMessageHook(_INTL("The Pokémon Boxes are full and can't accept any more!"));
    return;
  }
  pkmn.recordFirstMoves();
  if (player().partyFull()) {
    const storedBox = storage().pbStoreCaught(pkmn);
    const boxName = storage().boxes[storedBox]!.name;
    await pbMessageHook(_INTL("{1} has been sent to Box \"{2}\"!", pkmn.name, boxName));
  } else {
    player().party[player().party.length] = pkmn;
  }
}

export async function pbNicknameAndStore(pkmn: Pokemon): Promise<void> {
  if (pbBoxesFull()) {
    await pbMessageHook(_INTL("There's no more room for Pokémon!\x01"));
    await pbMessageHook(_INTL("The Pokémon Boxes are full and can't accept any more!"));
    return;
  }
  player().pokedex.setSeen(pkmn.species);
  player().pokedex.setOwned(pkmn.species);
  await pbNickname(pkmn);
  await pbStorePokemon(pkmn);
}

/** Shows the Pokédex entry of a newly owned species (SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN). */
async function showNewDexEntry(pkmn: Pokemon, message: string): Promise<void> {
  await pbMessageHook(message);
  player().pokedex.registerLastSeen(pkmn);
  if (PokemonUIHooks.dexEntry) await PokemonUIHooks.dexEntry(pkmn.species);
  else console.warn("pbAddPokemon: the Pokédex entry screen isn't ported yet");
}

export async function pbAddPokemon(pkmn: Pokemon | Id | null, level = 1, seeForm = true): Promise<boolean> {
  if (!pkmn) return false;
  if (pbBoxesFull()) {
    await pbMessageHook(_INTL("There's no more room for Pokémon!\x01"));
    await pbMessageHook(_INTL("The Pokémon Boxes are full and can't accept any more!"));
    return false;
  }
  const p = pkmn instanceof Pokemon ? pkmn : new Pokemon(pkmn, level);
  const speciesName = p.speciesName();
  await pbMessageHook(_INTL("{1} obtained {2}!\\me[Pkmn get]\\wtnp[80]\x01", player().name, speciesName));
  const wasOwned = player().owned(p.species);
  player().pokedex.setSeen(p.species);
  player().pokedex.setOwned(p.species);
  if (seeForm) player().pokedex.register(p);
  if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && seeForm && !wasOwned && player().hasPokedex) {
    await showNewDexEntry(p, _INTL("{1}'s data was added to the Pokédex.", speciesName));
  }
  await pbNicknameAndStore(p);
  return true;
}

export function pbAddPokemonSilent(pkmn: Pokemon | Id | null, level = 1, seeForm = true): boolean {
  if (!pkmn || pbBoxesFull()) return false;
  const p = pkmn instanceof Pokemon ? pkmn : new Pokemon(pkmn, level);
  player().pokedex.setSeen(p.species);
  player().pokedex.setOwned(p.species);
  if (seeForm) player().pokedex.register(p);
  p.recordFirstMoves();
  if (player().partyFull()) storage().pbStoreCaught(p);
  else player().party[player().party.length] = p;
  return true;
}

export async function pbAddToParty(pkmn: Pokemon | Id | null, level = 1, seeForm = true): Promise<boolean> {
  if (!pkmn || player().partyFull()) return false;
  const p = pkmn instanceof Pokemon ? pkmn : new Pokemon(pkmn, level);
  const speciesName = p.speciesName();
  await pbMessageHook(_INTL("{1} obtained {2}!\\me[Pkmn get]\\wtnp[80]\x01", player().name, speciesName));
  const wasOwned = player().owned(p.species);
  player().pokedex.setSeen(p.species);
  player().pokedex.setOwned(p.species);
  if (seeForm) player().pokedex.register(p);
  if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && seeForm && !wasOwned && player().hasPokedex) {
    await showNewDexEntry(p, _INTL("{1}'s data was added to the Pokédex.", speciesName));
  }
  await pbNicknameAndStore(p);
  return true;
}

/** pbAddToPartySilent(pkmn, level = nil, see_form = true): Ruby's level nil makes Pokemon.new raise for species IDs. */
export function pbAddToPartySilent(pkmn: Pokemon | Id | null, level: number | null = null, seeForm = true): boolean {
  if (!pkmn || player().partyFull()) return false;
  const p = pkmn instanceof Pokemon ? pkmn : new Pokemon(pkmn, level as number);
  if (seeForm) player().pokedex.register(p);
  player().pokedex.setOwned(p.species);
  p.recordFirstMoves();
  player().party[player().party.length] = p;
  return true;
}

export async function pbAddForeignPokemon(pkmn: Pokemon | Id | null, level = 1, ownerName: string | null = null,
  nickname: string | null = null, ownerGender = 0, seeForm = true): Promise<boolean> {
  if (!pkmn || player().partyFull()) return false;
  const p = pkmn instanceof Pokemon ? pkmn : new Pokemon(pkmn, level);
  p.owner = PokemonOwner.newForeign(ownerName ?? "", ownerGender);
  if (nickname) p.name = nickname.slice(0, Pokemon.MAX_NAME_SIZE);
  p.calcStats();
  if (ownerName) await pbMessageHook(_INTL("\\me[Pkmn get]{1} received a Pokémon from {2}.\x01", player().name, ownerName));
  else await pbMessageHook(_INTL("\\me[Pkmn get]{1} received a Pokémon.\x01", player().name));
  const wasOwned = player().owned(p.species);
  player().pokedex.setSeen(p.species);
  player().pokedex.setOwned(p.species);
  if (seeForm) player().pokedex.register(p);
  if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && seeForm && !wasOwned && player().hasPokedex) {
    await showNewDexEntry(p, _INTL("The Pokémon's data was added to the Pokédex."));
  }
  await pbStorePokemon(p);
  return true;
}

/** pbGenerateEgg (aliases pbAddEgg, pbGenEgg) */
export function pbGenerateEgg(pkmn: Pokemon | Id | null, text = ""): boolean {
  if (!pkmn || player().partyFull()) return false;
  const p = pkmn instanceof Pokemon ? pkmn : new Pokemon(pkmn, Settings.EGG_LEVEL);
  // Set egg's details
  p.name = _INTL("Egg");
  p.stepsToHatch = p.speciesData().hatchSteps;
  p.obtainText = text;
  p.calcStats();
  // Add egg to party
  player().party[player().party.length] = p;
  return true;
}

/** pbFirstAblePokemon(variable_ID): sets the variable to the index (or -1) and returns the Pokémon. */
export function pbFirstAblePokemon(variableID: number): Pokemon | null {
  const party = player().party;
  for (let i = 0; i < party.length; i++) {
    if (!party[i]!.able()) continue;
    G.gameVariables.set(variableID, i);
    return party[i]!;
  }
  G.gameVariables.set(variableID, -1);
  return null;
}

/** pbBalancedLevel(party): a level appropriate for the party, for scaled battles. */
export function pbBalancedLevel(party: Pokemon[]): number {
  if (party.length === 0) return 1;
  // Calculate the mean of all levels
  let sum = 0;
  for (const p of party) sum += p.level;
  if (sum === 0) return 1;
  const mLevel = GrowthRate.maxLevel();
  const average = sum / party.length;
  // Calculate the standard deviation
  let varianceTimesN = 0;
  for (const pkmn of party) {
    const deviation = pkmn.level - average;
    varianceTimesN += deviation * deviation;
  }
  // NOTE: This is the "population" standard deviation calculation, since no sample is being taken.
  const stdev = Math.sqrt(varianceTimesN / party.length);
  let mean = 0;
  const weights: number[] = [];
  // Skew weights according to standard deviation
  for (const pkmn of party) {
    let weight = pkmn.level / sum;
    if (weight < 0.5) {
      weight -= stdev / mLevel;
      if (weight <= 0.001) weight = 0.001;
    } else {
      weight += stdev / mLevel;
      if (weight >= 0.999) weight = 0.999;
    }
    weights.push(weight);
  }
  let weightSum = 0;
  for (const w of weights) weightSum += w;
  // Calculate the weighted mean, assigning each weight to each level's contribution to the sum
  party.forEach((pkmn, i) => { mean += pkmn.level * weights[i]!; });
  mean /= weightSum;
  mean = rubyRound(mean);
  if (mean < 1) mean = 1;
  // Add 2 to the mean to challenge the player
  mean += 2;
  // Adjust level to maximum
  if (mean > mLevel) mean = mLevel;
  return mean;
}

/** pbSize(pkmn): the Pokémon's size in millimetres (height scaled by IVs and personal ID). */
export function pbSize(pkmn: Pokemon): number {
  const baseheight = pkmn.height();
  const hpiv = pkmn.iv.HP! & 15;
  const ativ = pkmn.iv.ATTACK! & 15;
  const dfiv = pkmn.iv.DEFENSE! & 15;
  const saiv = pkmn.iv.SPECIAL_ATTACK! & 15;
  const sdiv = pkmn.iv.SPECIAL_DEFENSE! & 15;
  const spiv = pkmn.iv.SPEED! & 15;
  const m = pkmn.personalID & 0xFF;
  const n = (pkmn.personalID >>> 8) & 0xFF;
  const s = ((((ativ ^ dfiv) * hpiv) ^ m) * 256) + (((saiv ^ sdiv) * spiv) ^ n);
  let xyz = [1700, 1, 65_510];
  const ranges: [number, number, number[]][] = [
    [0, 10, [290, 1, 0]],
    [10, 110, [300, 1, 10]],
    [110, 310, [400, 2, 110]],
    [310, 710, [500, 4, 310]],
    [710, 2710, [600, 20, 710]],
    [2710, 7710, [700, 50, 2710]],
    [7710, 17_710, [800, 100, 7710]],
    [17_710, 32_710, [900, 150, 17_710]],
    [32_710, 47_710, [1000, 150, 32_710]],
    [47_710, 57_710, [1100, 100, 47_710]],
    [57_710, 62_710, [1200, 50, 57_710]],
    [62_710, 64_710, [1300, 20, 62_710]],
    [64_710, 65_210, [1400, 5, 64_710]],
    [65_210, 65_410, [1500, 2, 65_210]],
  ];
  for (const [lo, hi, v] of ranges) if (s >= lo && s < hi) { xyz = v; break; }
  return Math.floor((Math.floor(Math.floor((s - xyz[2]!) / xyz[1]!) + xyz[0]!) * baseheight) / 10);
}

/** pbHasEgg?(species): whether the species can come from an egg. */
export function pbHasEgg(species: Id): boolean {
  let speciesData = Species.tryGet(species);
  if (!speciesData) return false;
  species = speciesData.species;
  // species may be unbreedable, so check its evolution's compatibilities
  const evoSpecies = speciesData.getEvolutions(true);
  const compatSpecies = evoSpecies[0] ? evoSpecies[0][0] : species;
  speciesData = Species.tryGet(compatSpecies)!;
  const compat = speciesData.eggGroups;
  if (compat.includes("Undiscovered") || compat.includes("Ditto")) return false;
  let baby = Species.get(species).getBabySpecies();
  if (species === baby) return true; // Is a basic species
  baby = Species.get(species).getBabySpecies(true);
  if (species === baby) return true; // Is an egg species without incense
  return false;
}

/** PokemonEvolutionScene.pbDuplicatePokemon(pkmn, new_species) (Shedinja). */
export function pbDuplicatePokemon(pkmn: Pokemon, newSpecies: Id): void {
  const newPkmn = pkmn.clone();
  newPkmn.species = newSpecies;
  newPkmn.name = null;
  newPkmn.markings = [];
  newPkmn.pokeBall = "POKEBALL";
  newPkmn.item = null;
  newPkmn.clearAllRibbons();
  newPkmn.calcStats();
  newPkmn.heal();
  // Add duplicate Pokémon to party
  player().party.push(newPkmn);
  // See and own duplicate Pokémon
  player().pokedex.register(newPkmn);
  player().pokedex.setOwned(newSpecies);
}
setDuplicatePokemonHook(pbDuplicatePokemon);

/** Essentials Deluxe: pbNumOwnedSpecies(species = nil, attribute = nil, value = nil) */
export function pbNumOwnedSpecies(species: Id | null = null, attribute: string | null = null, value: unknown = null): number {
  let count = 0;
  for (const [p] of pbEachNonEggPokemon()) {
    if (!(species == null || p?.isSpecies(species))) continue;
    if (!p.checkForAttribute(attribute, value)) continue;
    count += 1;
  }
  return count;
}

// --- Pokemon Silver Chronicles Helpers (Utils.rb) -----------------------------

/** is_first_pokemon_species?(species, form = -1) */
export function isFirstPokemonSpecies(species: Id, form = -1): boolean {
  const pkmn = player().party[0]!;
  return pkmn.able() && pkmn.species === species && (form < 0 || pkmn.form === form);
}

/** has_species_index?(species, form = -1): index in the party, or -1. */
export function hasSpeciesIndex(species: Id, form = -1): number {
  const party = player().party;
  for (let index = 0; index < party.length; index++) {
    const pkmn = party[index]!;
    if (pkmn.species === species && (form < 0 || pkmn.form === form)) return index;
  }
  return -1;
}

/**
 * switchPositionIfHasPokemon(species, form = -1): 1 if the Pokémon is in the
 * party and healthy (moving it to the front), 0 if fainted, -1 if absent.
 * The follower toggles go through the hook the Following Pokémon port sets.
 */
export function switchPositionIfHasPokemon(species: Id, form = -1, toggleFollower: (on: boolean) => void = () => {}): number {
  const index = hasSpeciesIndex(species, form);
  if (index >= 0) {
    const party = player().party;
    if (!party[index]!.able()) return 0;
    if (index === 0) return 1; // Pokemon is already in the first position
    toggleFollower(false);
    const tmp = party[0]!;
    party[0] = party[index]!;
    party[index] = tmp;
    toggleFollower(true);
    return 1;
  }
  return -1;
}

/** Ruby's Float#round (half away from zero). */
function rubyRound(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}
