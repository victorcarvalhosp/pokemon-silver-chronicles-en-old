// Port of 018_Alternate battle modes/002_Battle Frontier rules/003_Challenge_EntryRestrictions.rb:
// the Pokémon rules (one Pokémon) and team rules (a team) rulesets combine.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Species } from "../../data/gameData/species";
import { Pokemon } from "../pokemon/Pokemon";
import type { PokemonRule, TeamRule } from "./rulesets";

//===============================================================================
//
//===============================================================================
export class StandardRestriction implements PokemonRule {
  isValid(pkmn: Pokemon | null): boolean {
    if (!pkmn || pkmn.egg()) return false;
    // Species with disadvantageous abilities are not banned
    for (const a of pkmn.speciesData().abilities) {
      if (a === "TRUANT" || a === "SLOWSTART") return true;
    }
    // Certain named species are not banned
    if (["DRAGONITE", "SALAMENCE", "TYRANITAR"].includes(pkmn.species)) return true;
    // Certain named species are banned
    if (["WYNAUT", "WOBBUFFET"].includes(pkmn.species)) return false;
    // Species with total base stat 600 or more are banned
    let bst = 0;
    for (const s of Object.values(pkmn.baseStats())) bst += s;
    if (bst >= 600) return false;
    // Is valid
    return true;
  }
}

//===============================================================================
//
//===============================================================================
export class HeightRestriction implements PokemonRule {
  private level: number;

  constructor(maxHeightInMeters: number) {
    this.level = maxHeightInMeters;
  }

  isValid(pkmn: Pokemon | Id): boolean {
    const height = pkmn instanceof Pokemon ? pkmn.height() : Species.get(pkmn).height;
    return height <= Math.round(this.level * 10);
  }
}

//===============================================================================
//
//===============================================================================
export class WeightRestriction implements PokemonRule {
  private level: number;

  constructor(maxWeightInKg: number) {
    this.level = maxWeightInKg;
  }

  isValid(pkmn: Pokemon | Id): boolean {
    const weight = pkmn instanceof Pokemon ? pkmn.weight() : Species.get(pkmn).weight;
    return weight <= Math.round(this.level * 10);
  }
}

//===============================================================================
// Unused
//===============================================================================
export class NegativeExtendedGameClause implements PokemonRule {
  /**
   * NOTE (Ruby parity): falls off the end returning nil when none of the
   * checks bans the Pokémon (003_Challenge_EntryRestrictions.rb:56-62), so
   * every Pokémon is invalid.
   */
  isValid(pkmn: Pokemon): boolean | null {
    if (pkmn.isSpecies("ARCEUS")) return false;
    if (pkmn.hasItem("MICLEBERRY")) return false;
    if (pkmn.hasItem("CUSTAPBERRY")) return false;
    if (pkmn.hasItem("JABOCABERRY")) return false;
    if (pkmn.hasItem("ROWAPBERRY")) return false;
    return null;
  }
}

//===============================================================================
//
//===============================================================================
/** $babySpeciesData */
export const babySpeciesData: Record<Id, Id> = {};

export class BabyRestriction implements PokemonRule {
  isValid(pkmn: Pokemon): boolean {
    if (!babySpeciesData[pkmn.species]) babySpeciesData[pkmn.species] = pkmn.speciesData().getBabySpecies();
    return pkmn.species === babySpeciesData[pkmn.species];
  }
}

//===============================================================================
//
//===============================================================================
/** $canEvolve */
export const canEvolve: Record<Id, boolean> = {};

export class UnevolvedFormRestriction implements PokemonRule {
  isValid(pkmn: Pokemon): boolean {
    if (!babySpeciesData[pkmn.species]) babySpeciesData[pkmn.species] = pkmn.speciesData().getBabySpecies();
    if (pkmn.species !== babySpeciesData[pkmn.species]) return false;
    if (canEvolve[pkmn.species] === undefined) canEvolve[pkmn.species] = pkmn.speciesData().getEvolutions(true).length > 0;
    return canEvolve[pkmn.species]!;
  }
}

//===============================================================================
//
//===============================================================================
/**
 * module NicknameChecker. Its methods are instance methods (the module has no
 * module_function), so NicknameChecker.check doesn't exist: see NicknameClause.
 */
export const NicknameChecker = {
  /** @@names */
  names: {} as Record<Id, string>,

  /**
   * NOTE (Ruby parity): stores the upcased name but returns it as it is the
   * first time (003_Challenge_EntryRestrictions.rb:103-109).
   */
  getName(species: Id): string {
    const n = NicknameChecker.names[species];
    if (n) return n;
    const name = Species.get(species).name;
    NicknameChecker.names[species] = name.toUpperCase();
    return name;
  },

  check(name: string, species: Id): boolean {
    name = name.toUpperCase();
    if (name === NicknameChecker.getName(species)) return true;
    if (Object.values(NicknameChecker.names).includes(name)) return false;
    for (const speciesData of Species.eachSpecies()) {
      if (speciesData.species !== species && NicknameChecker.getName(speciesData.id) === name) return false;
    }
    return true;
  },
};

//===============================================================================
// No two Pokemon can have the same nickname.
// No nickname can be the same as the (real) name of another Pokemon character.
//===============================================================================
export class NicknameClause implements TeamRule {
  /**
   * NOTE (Ruby parity): NicknameChecker.check is a module instance method, so
   * calling it on the module raises NoMethodError for any team of two or more
   * Pokémon with different nicknames (003_Challenge_EntryRestrictions.rb:131).
   * The last Pokémon's nickname would never be checked either.
   */
  isValid(team: Pokemon[]): boolean {
    for (let i = 0; i < team.length - 1; i++) {
      for (let j = i + 1; j < team.length; j++) {
        if (team[i]!.name === team[j]!.name) return false;
        throw new Error("undefined method `check' for NicknameChecker:Module");
      }
    }
    return true;
  }

  errorMessage(): string {
    return _INTL("No identical nicknames.");
  }
}

//===============================================================================
//
//===============================================================================
export class NonEggRestriction implements PokemonRule {
  isValid(pkmn: Pokemon | null): boolean {
    return !!pkmn && !pkmn.egg();
  }
}

//===============================================================================
//
//===============================================================================
export class AblePokemonRestriction implements PokemonRule {
  isValid(pkmn: Pokemon | null): boolean {
    return !!pkmn?.able();
  }
}

//===============================================================================
//
//===============================================================================
export class SpeciesRestriction implements PokemonRule {
  private specieslist: Id[];

  constructor(...specieslist: Id[]) {
    this.specieslist = [...specieslist];
  }

  isSpecies(species: Id, specieslist: Id[]): boolean {
    return specieslist.includes(species);
  }

  isValid(pkmn: Pokemon): boolean {
    return this.isSpecies(pkmn.species, this.specieslist);
  }
}

//===============================================================================
//
//===============================================================================
export class BannedSpeciesRestriction implements PokemonRule {
  private specieslist: Id[];

  constructor(...specieslist: Id[]) {
    this.specieslist = [...specieslist];
  }

  isSpecies(species: Id, specieslist: Id[]): boolean {
    return specieslist.includes(species);
  }

  isValid(pkmn: Pokemon): boolean {
    return !this.isSpecies(pkmn.species, this.specieslist);
  }
}

//===============================================================================
//
//===============================================================================
export class RestrictedSpeciesRestriction implements TeamRule {
  private specieslist: Id[];
  private maxValue: number;

  constructor(maxValue: number, ...specieslist: Id[]) {
    this.specieslist = [...specieslist];
    this.maxValue = maxValue;
  }

  isSpecies(species: Id, specieslist: Id[]): boolean {
    return specieslist.includes(species);
  }

  isValid(team: (Pokemon | null)[]): boolean {
    let count = 0;
    for (const pkmn of team) if (pkmn && this.isSpecies(pkmn.species, this.specieslist)) count += 1;
    return count <= this.maxValue;
  }
}

//===============================================================================
//
//===============================================================================
export class RestrictedSpeciesTeamRestriction extends RestrictedSpeciesRestriction {
  constructor(...specieslist: Id[]) {
    super(4, ...specieslist);
  }
}

//===============================================================================
//
//===============================================================================
export class RestrictedSpeciesSubsetRestriction extends RestrictedSpeciesRestriction {
  constructor(...specieslist: Id[]) {
    super(2, ...specieslist);
  }
}

//===============================================================================
//
//===============================================================================
export class SameSpeciesClause implements TeamRule {
  isValid(team: (Pokemon | null)[]): boolean {
    const species: Id[] = [];
    for (const pkmn of team) if (pkmn && !species.includes(pkmn.species)) species.push(pkmn.species);
    return species.length === 1;
  }

  errorMessage(): string {
    return _INTL("Pokémon must be the same species.");
  }
}

//===============================================================================
//
//===============================================================================
export class SpeciesClause implements TeamRule {
  isValid(team: (Pokemon | null)[]): boolean {
    const species: Id[] = [];
    for (const pkmn of team) {
      if (!pkmn) continue;
      if (species.includes(pkmn.species)) return false;
      species.push(pkmn.species);
    }
    return true;
  }

  errorMessage(): string {
    return _INTL("Pokémon can't be the same species.");
  }
}

//===============================================================================
//
//===============================================================================
export class MinimumLevelRestriction implements PokemonRule {
  readonly level: number;

  constructor(minLevel: number) {
    this.level = minLevel;
  }

  isValid(pkmn: Pokemon): boolean {
    return pkmn.level >= this.level;
  }
}

//===============================================================================
//
//===============================================================================
export class MaximumLevelRestriction implements PokemonRule {
  readonly level: number;

  constructor(maxLevel: number) {
    this.level = maxLevel;
  }

  isValid(pkmn: Pokemon): boolean {
    return pkmn.level <= this.level;
  }
}

//===============================================================================
//
//===============================================================================
export class TotalLevelRestriction implements TeamRule {
  readonly level: number;

  constructor(level: number) {
    this.level = level;
  }

  isValid(team: (Pokemon | null)[]): boolean {
    let totalLevel = 0;
    for (const pkmn of team) if (pkmn) totalLevel += pkmn.level;
    return totalLevel <= this.level;
  }

  errorMessage(): string {
    return _INTL("The combined levels exceed {1}.", this.level);
  }
}

//===============================================================================
//
//===============================================================================
export class BannedItemRestriction implements PokemonRule {
  private itemlist: Id[];

  constructor(...itemlist: Id[]) {
    this.itemlist = [...itemlist];
  }

  isSpecies(item: Id, itemlist: Id[]): boolean {
    return itemlist.includes(item);
  }

  isValid(pkmn: Pokemon): boolean {
    return !pkmn.itemId || !this.isSpecies(pkmn.itemId, this.itemlist);
  }
}

//===============================================================================
//
//===============================================================================
export class ItemsDisallowedClause implements PokemonRule {
  isValid(pkmn: Pokemon): boolean {
    return !pkmn.hasItem();
  }
}

//===============================================================================
//
//===============================================================================
export class SoulDewClause implements PokemonRule {
  isValid(pkmn: Pokemon): boolean {
    return !pkmn.hasItem("SOULDEW");
  }
}

//===============================================================================
//
//===============================================================================
export class ItemClause implements TeamRule {
  isValid(team: (Pokemon | null)[]): boolean {
    const items: Id[] = [];
    for (const pkmn of team) {
      if (!pkmn || !pkmn.hasItem()) continue;
      if (items.includes(pkmn.itemId!)) return false;
      items.push(pkmn.itemId!);
    }
    return true;
  }

  errorMessage(): string {
    return _INTL("No identical hold items.");
  }
}

//===============================================================================
//
//===============================================================================
export class LittleCupRestriction implements PokemonRule {
  isValid(pkmn: Pokemon): boolean {
    if (pkmn.hasItem("BERRYJUICE")) return false;
    if (pkmn.hasItem("DEEPSEATOOTH")) return false;
    if (pkmn.hasMove("SONICBOOM")) return false;
    if (pkmn.hasMove("DRAGONRAGE")) return false;
    if (pkmn.isSpecies("SCYTHER")) return false;
    if (pkmn.isSpecies("SNEASEL")) return false;
    if (pkmn.isSpecies("MEDITITE")) return false;
    if (pkmn.isSpecies("YANMA")) return false;
    if (pkmn.isSpecies("TANGELA")) return false;
    if (pkmn.isSpecies("MURKROW")) return false;
    return true;
  }
}
