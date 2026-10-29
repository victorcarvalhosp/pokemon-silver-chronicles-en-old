// Port of 018_Alternate battle modes/002_Battle Frontier rules/002_Challenge_Rulesets.rb:
// PokemonRuleSet (which Pokémon and teams may enter a challenge) and the
// Generation IV cups. Also pbEachCombination/_pbNextComb from
// 019_Utilities/001_Utilities.rb, which only the rulesets use.
//
// Pokemon Selection Before Battle (loaded after Essentials) replaces
// PokemonRuleSet#hasValidTeam? for Essentials before v21, so that version is
// the one here.

import { _INTL } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Settings } from "../../data/gameData/settings";
import type { Pokemon } from "../pokemon/Pokemon";
import {
  BabyRestriction, HeightRestriction, ItemClause, MaximumLevelRestriction, MinimumLevelRestriction, SpeciesClause,
  StandardRestriction, TotalLevelRestriction, WeightRestriction,
} from "./entryRestrictions";

/** A rule checking one Pokémon (isValid?; Ruby truthiness: nil counts as false). */
export interface PokemonRule {
  isValid(pkmn: Pokemon): boolean | null;
}

/** A rule checking a team or subset of one (isValid? and errorMessage). */
export interface TeamRule {
  isValid(team: (Pokemon | null)[]): boolean;
  errorMessage?(): string;
}

/** rule.errorMessage: rules without one raise NoMethodError, as in Ruby. */
export function ruleErrorMessage(rule: TeamRule): string {
  if (!rule.errorMessage) throw new Error(`undefined method \`errorMessage' for #<${rule.constructor.name}>`);
  return rule.errorMessage();
}

/** _pbNextComb(comb, length) */
function pbNextComb(comb: number[], length: number): boolean {
  let i = comb.length - 1;
  for (;;) {
    let valid = true;
    for (let j = i; j < comb.length; j++) {
      if (j === i) comb[j]! += 1;
      else comb[j] = comb[i]! + (j - i);
      if (comb[j]! >= length) {
        valid = false;
        break;
      }
    }
    if (valid) return true;
    i -= 1;
    if (!(i >= 0)) break;
  }
  return false;
}

/**
 * pbEachCombination(array, num): yields each combination of num elements of
 * the array (the same array object each time, as in Ruby). The block returns
 * true to stop (Ruby's `return` out of the block).
 */
export function pbEachCombination<T>(array: T[], num: number, block: (comb: T[]) => boolean | void): void {
  if (array.length < num || num <= 0) return;
  if (array.length === num) {
    block(array);
    return;
  } else if (num === 1) {
    for (const x of array) if (block([x])) return;
    return;
  }
  const currentComb: number[] = [];
  const arr: T[] = [];
  for (let i = 0; i < num; i++) currentComb[i] = i;
  for (;;) {
    for (let i = 0; i < num; i++) arr[i] = array[currentComb[i]!]!;
    if (block(arr)) return;
    if (!pbNextComb(currentComb, array.length)) break;
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonRuleSet {
  protected pokemonRules: PokemonRule[] = [];
  protected teamRules: TeamRule[] = [];
  protected subsetRules: TeamRule[] = [];
  protected _minLength: number | null = 1;
  protected _number: number;

  constructor(number = 0) {
    this._number = number;
  }

  copy(): PokemonRuleSet {
    const ret = new PokemonRuleSet(this._number);
    for (const rule of this.pokemonRules) ret.addPokemonRule(rule);
    for (const rule of this.teamRules) ret.addTeamRule(rule);
    for (const rule of this.subsetRules) ret.addSubsetRule(rule);
    return ret;
  }

  get minLength(): number {
    return this._minLength ? this._minLength : this.maxLength;
  }

  get maxLength(): number {
    return this._number < 0 ? Settings.MAX_PARTY_SIZE : this._number;
  }

  /** alias number maxLength */
  get number(): number {
    return this.maxLength;
  }

  get minTeamLength(): number {
    return Math.max(1, this.minLength);
  }

  get maxTeamLength(): number {
    return Math.max(Settings.MAX_PARTY_SIZE, this.maxLength);
  }

  /** Returns the length of a valid subset of a Pokemon team. */
  get suggestedNumber(): number {
    return this.maxLength;
  }

  /** Returns a valid level to assign to each member of a valid Pokemon team. */
  get suggestedLevel(): number {
    let minLevel = 1;
    let maxLevel = GrowthRate.maxLevel();
    const num = this.suggestedNumber;
    for (const rule of this.pokemonRules) {
      if (rule instanceof MinimumLevelRestriction) minLevel = rule.level;
      else if (rule instanceof MaximumLevelRestriction) maxLevel = rule.level;
    }
    let totalLevel = maxLevel * num;
    // NOTE (Ruby parity): @subsetRules is always empty (addSubsetRule fills
    // @teamRules), so a TotalLevelRestriction never lowers the level here.
    for (const rule of this.subsetRules) {
      if (rule instanceof TotalLevelRestriction) totalLevel = rule.level;
    }
    if (totalLevel >= maxLevel * num) return Math.max(maxLevel, minLevel);
    return Math.max(Math.floor(totalLevel / this.suggestedNumber), minLevel);
  }

  setNumberRange(minValue: number, maxValue: number): this {
    this._minLength = Math.max(1, minValue);
    this._number = Math.max(1, maxValue);
    return this;
  }

  setNumber(value: number): this {
    return this.setNumberRange(value, value);
  }

  /**
   * This rule checks either:
   * - the entire team to determine whether a subset of the team meets the rule, or
   * - whether the entire team meets the rule. If the condition holds for the
   *   entire team, the condition must also hold for any possible subset of the
   *   team with the suggested number.
   * Examples of team rules:
   * - No two Pokemon can be the same species.
   * - No two Pokemon can hold the same items.
   */
  addTeamRule(rule: TeamRule): this {
    this.teamRules.push(rule);
    return this;
  }

  /**
   * This rule checks:
   * - the entire team to determine whether a subset of the team meets the rule, or
   * - a list of Pokemon whose length is equal to the suggested number. For an
   *   entire team, the condition must hold for at least one possible subset of
   *   the team, but not necessarily for the entire team.
   * A subset rule is "number-dependent", that is, whether the condition is likely
   * to hold depends on the number of Pokemon in the subset.
   * Example of a subset rule:
   * - The combined level of X Pokemon can't exceed Y.
   *
   * NOTE (Ruby parity): pushes onto @teamRules, not @subsetRules
   * (002_Challenge_Rulesets.rb:103), so subset rules are checked against the
   * whole team.
   */
  addSubsetRule(rule: TeamRule): this {
    this.teamRules.push(rule);
    return this;
  }

  addPokemonRule(rule: PokemonRule): this {
    this.pokemonRules.push(rule);
    return this;
  }

  clearTeamRules(): this {
    this.teamRules.length = 0;
    return this;
  }

  clearSubsetRules(): this {
    this.subsetRules.length = 0;
    return this;
  }

  clearPokemonRules(): this {
    this.pokemonRules.length = 0;
    return this;
  }

  isPokemonValid(pkmn: Pokemon | null | undefined): boolean {
    if (!pkmn) return false;
    for (const rule of this.pokemonRules) if (!rule.isValid(pkmn)) return false;
    return true;
  }

  hasRegistrableTeam(list: (Pokemon | null)[] | null): boolean {
    if (!list || list.length < this.minTeamLength) return false;
    let ret = false;
    pbEachCombination(list, this.maxTeamLength, (comb) => {
      if (this.canRegisterTeam(comb)) return (ret = true);
    });
    return ret;
  }

  /**
   * Returns true if the team's length is greater or equal to the suggested
   * number and is Settings::MAX_PARTY_SIZE or less, the team as a whole meets
   * the requirements of any team rules, and at least one subset of the team
   * meets the requirements of any subset rules. Each Pokemon in the team must be
   * valid.
   */
  canRegisterTeam(team: (Pokemon | null)[] | null): boolean {
    if (!team || team.length < this.minTeamLength) return false;
    if (team.length > this.maxTeamLength) return false;
    const teamNumber = this.minTeamLength;
    for (const pkmn of team) if (!this.isPokemonValid(pkmn)) return false;
    for (const rule of this.teamRules) if (!rule.isValid(team)) return false;
    if (this.subsetRules.length > 0) {
      let ret = false;
      pbEachCombination(team, teamNumber, (comb) => {
        let isValid = true;
        for (const rule of this.subsetRules) {
          if (rule.isValid(comb)) continue;
          isValid = false;
          break;
        }
        if (isValid) return (ret = true);
      });
      return ret;
    }
    return true;
  }

  /**
   * hasValidTeam? as Pokemon Selection Before Battle redefines it for
   * Essentials before v21: at least minLength valid Pokémon, and a subset of
   * minLength Pokémon of the team that is valid. (Essentials' own version,
   * which this replaces, uses minTeamLength for both.)
   */
  hasValidTeam(team: (Pokemon | null)[] | null): boolean {
    if (!team || team.length < this.minTeamLength) return false;
    const validPokemon: Pokemon[] = [];
    for (const pokemon of team) if (this.isPokemonValid(pokemon)) validPokemon.push(pokemon!);
    if (validPokemon.length < this.minLength) return false;
    if (this.teamRules.length > 0) {
      let ret = false;
      pbEachCombination(team, this.minLength, (comb) => {
        if (this.isValid(comb)) return (ret = true);
      });
      return ret;
    }
    return true;
  }

  /**
   * Returns true if the team's length meets the subset length range requirements
   * and the team meets the requirements of any team rules and subset rules. Each
   * Pokemon in the team must be valid.
   */
  isValid(team: (Pokemon | null)[], error: string[] | null = null): boolean {
    if (team.length < this.minLength) {
      if (error && this.minLength === 1) error.push(_INTL("Choose a Pokémon."));
      if (error && this.minLength > 1) error.push(_INTL("{1} Pokémon are needed.", this.minLength));
      return false;
    } else if (team.length > this.maxLength) {
      error?.push(_INTL("No more than {1} Pokémon may enter.", this.maxLength));
      return false;
    }
    for (const pkmn of team) {
      if (this.isPokemonValid(pkmn)) continue;
      if (pkmn) error?.push(_INTL("{1} is not allowed.", pkmn.name));
      else if (error) error.push(_INTL("This team is not allowed."));
      return false;
    }
    for (const rule of this.teamRules) {
      if (rule.isValid(team)) continue;
      if (error) error.push(ruleErrorMessage(rule));
      return false;
    }
    for (const rule of this.subsetRules) {
      if (rule.isValid(team)) continue;
      if (error) error.push(ruleErrorMessage(rule));
      return false;
    }
    return true;
  }
}

//===============================================================================
//
//===============================================================================
export class StandardRules extends PokemonRuleSet {
  // (attr_reader :number reads @number, the same value as maxLength for the
  // non-negative numbers these rules get.)
  constructor(number: number, level: number | null = null) {
    super(number);
    this.addPokemonRule(new StandardRestriction());
    this.addTeamRule(new SpeciesClause());
    this.addTeamRule(new ItemClause());
    if (level) this.addPokemonRule(new MaximumLevelRestriction(level));
  }

  override get number(): number {
    return this._number;
  }
}

//===============================================================================
// Generation IV Cups
//===============================================================================
export class StandardCup extends StandardRules {
  constructor() {
    super(3, 50);
  }

  name(): string {
    return _INTL("Standard Cup");
  }
}

export class DoubleCup extends StandardRules {
  constructor() {
    super(4, 50);
  }

  name(): string {
    return _INTL("Double Cup");
  }
}

export class FancyCup extends PokemonRuleSet {
  constructor() {
    super(3);
    this.addPokemonRule(new StandardRestriction());
    this.addPokemonRule(new MaximumLevelRestriction(30));
    this.addSubsetRule(new TotalLevelRestriction(80));
    this.addPokemonRule(new HeightRestriction(2));
    this.addPokemonRule(new WeightRestriction(20));
    this.addPokemonRule(new BabyRestriction());
    this.addTeamRule(new SpeciesClause());
    this.addTeamRule(new ItemClause());
  }

  name(): string {
    return _INTL("Fancy Cup");
  }
}

export class LittleCup extends PokemonRuleSet {
  constructor() {
    super(3);
    this.addPokemonRule(new StandardRestriction());
    this.addPokemonRule(new MaximumLevelRestriction(5));
    this.addPokemonRule(new BabyRestriction());
    this.addTeamRule(new SpeciesClause());
    this.addTeamRule(new ItemClause());
  }

  name(): string {
    return _INTL("Little Cup");
  }
}

export class LightCup extends PokemonRuleSet {
  constructor() {
    super(3);
    this.addPokemonRule(new StandardRestriction());
    this.addPokemonRule(new MaximumLevelRestriction(50));
    this.addPokemonRule(new WeightRestriction(99));
    this.addPokemonRule(new BabyRestriction());
    this.addTeamRule(new SpeciesClause());
    this.addTeamRule(new ItemClause());
  }

  name(): string {
    return _INTL("Light Cup");
  }
}
