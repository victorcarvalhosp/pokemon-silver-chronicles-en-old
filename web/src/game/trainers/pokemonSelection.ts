// Port of Plugins/Pokemon Selection Before Battle (FL's "Pokémon Selection"
// 1.3.3): events choose which Pokémon (and in what order) the player brings to
// a battle, then put the party back afterwards. Maps 86 (Dance Theater, 1v1)
// and 382 (Route 24, 3v3) use it.
//
// The plugin drives the Battle Frontier's challenge object
// (018_Alternate battle modes/001_Battle Frontier): pbBattleChallenge.setSimple,
// pbHasEligible?, pbEntryScreen, getParty and pbCancel, with the rules from
// 002_Battle Frontier rules (PokemonChallengeRules, PokemonRuleSet,
// AblePokemonRestriction, OpenLevelAdjustment). The Battle Frontier isn't
// ported, so the parts of those classes the plugin reaches are here.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Settings } from "../../data/gameData/settings";
import { pbFadeOutIn } from "../../ui/fades";
import { pbMessage } from "../../ui/messages";
import { PokemonParty_Scene, PokemonPartyScreen } from "../../ui/party/party";
import { PokemonGlobalExtras, pokemonJSON } from "../battle/globalExtras";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import { defineScript } from "../scriptApi";
import type { Player } from "../trainer/Player";

declare module "../globals" {
  interface PokemonGlobalMetadata {
    pokemonSelectionOriginalParty?: Pokemon[] | null;
  }
}

const player = () => G.player as unknown as Player;

//===============================================================================
// 002_Battle Frontier rules (the parts the plugin uses)
//===============================================================================
interface PokemonRule { isValid(pkmn: Pokemon | null): boolean }
interface TeamRule { isValid(team: (Pokemon | null)[]): boolean; errorMessage: string }

/** pbEachCombination(array, num) (019_Utilities/001_Utilities.rb:28); the block returns true to stop. */
function pbEachCombination<T>(array: T[], num: number, block: (comb: T[]) => boolean | void): void {
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
    if (i < 0) return false;
  }
}

/** class PokemonRuleSet (002_Challenge_Rulesets.rb) */
export class PokemonRuleSet {
  private pokemonRules: PokemonRule[] = [];
  private teamRules: TeamRule[] = [];
  private subsetRules: TeamRule[] = [];
  private _minLength: number | null = 1;

  constructor(private _number = 0) {}

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

  setNumberRange(minValue: number, maxValue: number): this {
    this._minLength = Math.max(1, minValue);
    this._number = Math.max(1, maxValue);
    return this;
  }

  setNumber(value: number): this {
    return this.setNumberRange(value, value);
  }

  addTeamRule(rule: TeamRule): this {
    this.teamRules.push(rule);
    return this;
  }

  /** NOTE (Ruby parity): pushes onto @teamRules, not @subsetRules (002_Challenge_Rulesets.rb:105). */
  addSubsetRule(rule: TeamRule): this {
    this.teamRules.push(rule);
    return this;
  }

  addPokemonRule(rule: PokemonRule): this {
    this.pokemonRules.push(rule);
    return this;
  }

  isPokemonValid(pkmn: Pokemon | null): boolean {
    if (!pkmn) return false;
    for (const rule of this.pokemonRules) if (!rule.isValid(pkmn)) return false;
    return true;
  }

  /** hasValidTeam? as the plugin redefines it for Essentials before v21 (counts minLength valid Pokémon). */
  hasValidTeam(team: (Pokemon | null)[] | null): boolean {
    if (!team || team.length < this.minTeamLength) return false;
    const validPokemon: Pokemon[] = [];
    for (const pokemon of team) if (this.isPokemonValid(pokemon)) validPokemon.push(pokemon!);
    if (validPokemon.length < this.minLength) return false;
    if (this.teamRules.length > 0) {
      let found = false;
      pbEachCombination(team, this.minLength, (comb) => {
        if (this.isValid(comb)) {
          found = true;
          return true;
        }
        return false;
      });
      return found;
    }
    return true;
  }

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
      error?.push(rule.errorMessage);
      return false;
    }
    for (const rule of this.subsetRules) {
      if (rule.isValid(team)) continue;
      error?.push(rule.errorMessage);
      return false;
    }
    return true;
  }
}

/** class AblePokemonRestriction (003_Challenge_EntryRestrictions.rb:154) */
export class AblePokemonRestriction implements PokemonRule {
  isValid(pkmn: Pokemon | null): boolean {
    return !!pkmn?.able();
  }
}

/**
 * OpenLevelAdjustment (004_Challenge_LevelAdjustment.rb:210): it only changes
 * levels in Battle Frontier battles, which the selection never starts.
 */
export class OpenLevelAdjustment {
  constructor(readonly minLevel = 1) {}
}

/** class PokemonChallengeRules (001_Challenge_ChallengeRules.rb), the rule-building half. */
export class PokemonChallengeRules {
  ruleset: PokemonRuleSet;
  levelAdjustment: OpenLevelAdjustment | null = null;

  constructor(ruleset: PokemonRuleSet | null = null) {
    this.ruleset = ruleset ?? new PokemonRuleSet();
  }

  setLevelAdjustment(rule: OpenLevelAdjustment | null): this {
    this.levelAdjustment = rule;
    return this;
  }

  addPokemonRule(rule: PokemonRule): this {
    this.ruleset.addPokemonRule(rule);
    return this;
  }

  addTeamRule(rule: TeamRule): this {
    this.ruleset.addTeamRule(rule);
    return this;
  }

  get number(): number {
    return this.ruleset.number;
  }

  /** Object#clone: a shallow copy (the ruleset is shared, as in Ruby). */
  clone(): PokemonChallengeRules {
    const ret = new PokemonChallengeRules(this.ruleset);
    ret.levelAdjustment = this.levelAdjustment;
    return ret;
  }
}

/**
 * The part of pbBattleChallenge the plugin uses (BattleChallenge#setSimple,
 * #rules, #getParty, #pbCancel and BattleChallengeData#setParty, as the plugin
 * extends them). Nothing else is in progress here, so setParty only records the
 * party and pbCancel just forgets it.
 */
const challenge = {
  rules: null as PokemonChallengeRules | null,
  party: null as Pokemon[] | null,
  setSimple(rules: PokemonChallengeRules): void {
    this.rules = rules;
  },
  getParty(): Pokemon[] | null {
    return this.party;
  },
  pbCancel(): void {
    this.party = null;
    this.rules = null;
  },
};

/** pbHasEligible? */
function pbHasEligible(): boolean {
  return challenge.rules!.ruleset.hasValidTeam(player().party);
}

/** pbEntryScreen */
async function pbEntryScreen(): Promise<boolean> {
  let retval = false;
  await pbFadeOutIn(async () => {
    const scene = new PokemonParty_Scene();
    const screen = new PokemonPartyScreen(scene, player().party);
    const ret = await screen.pbPokemonMultipleEntryScreenEx(challenge.rules!.ruleset);
    // Set party
    if (ret) challenge.party = ret;
    // Continue (return true) if Pokémon were chosen
    retval = !!ret && ret.length > 0;
  });
  return retval;
}

//===============================================================================
// The plugin
//===============================================================================
/** This plugin's TypeRestriction: valid with one of the types (or, if bannedTypes, with none of them). */
export class TypeRestriction implements PokemonRule {
  constructor(private types: Id[], private bannedTypes = false) {}

  isValid(pokemon: Pokemon | null): boolean {
    let ret = false;
    for (const singleType of this.types) {
      if (pokemon!.hasType(singleType)) {
        ret = true;
        break;
      }
    }
    if (this.bannedTypes) ret = !ret;
    return ret;
  }
}

export class Parameters {
  minPokemon = 1;
  maxPokemon = 6;
  canCancel = false;
  /** (and eggs) */
  acceptFainted = false;
  baseChallenge: PokemonChallengeRules | null = null;

  setMinPokemon(minPokemon: number): this { this.minPokemon = minPokemon; return this; }
  setMaxPokemon(maxPokemon: number): this { this.maxPokemon = maxPokemon; return this; }
  setCanCancel(canCancel: boolean): this { this.canCancel = canCancel; return this; }
  setAcceptFainted(acceptFainted: boolean): this { this.acceptFainted = acceptFainted; return this; }
  setBaseChallenge(baseChallenge: PokemonChallengeRules): this { this.baseChallenge = baseChallenge; return this; }

  challenge(): PokemonChallengeRules {
    const ret = this.baseChallenge ? this.baseChallenge.clone() : new PokemonChallengeRules();
    ret.setLevelAdjustment(new OpenLevelAdjustment(GrowthRate.maxLevel()));
    if (!this.acceptFainted) ret.addPokemonRule(new AblePokemonRestriction());
    ret.ruleset.setNumberRange(this.minPokemon, this.maxPokemon);
    return ret;
  }

  static factory(...args: unknown[]): Parameters {
    if (args.length > 0 && args[0] && args[0] instanceof Parameters) return args[0];
    const ret = new Parameters();
    if (args.length >= 1) ret.setMinPokemon(args[0] as number);
    if (args.length >= 2) ret.setMaxPokemon(args[1] as number);
    return ret;
  }
}

export const PokemonSelection = {
  Parameters,

  hasValidTeam(...args: unknown[]): boolean {
    const params = Parameters.factory(...args);
    challenge.setSimple(params.challenge());
    const ret = pbHasEligible();
    challenge.pbCancel();
    return ret;
  },

  async choose(...args: unknown[]): Promise<boolean> {
    if (G.pokemonGlobal.pokemonSelectionOriginalParty) {
      throw new Error("Can't choose a new party until restore the old one!");
    }
    const params = Parameters.factory(...args);
    if (!PokemonSelection.hasValidTeam(params)) throw new Error("Player hasn't a valid team!");
    let validPartyChosen = false;
    challenge.setSimple(params.challenge());
    for (;;) {
      await pbEntryScreen();
      validPartyChosen = challenge.getParty() != null;
      if (params.canCancel || challenge.getParty()) break;
      await pbMessage(_INTL("Choose a Pokémon."));
    }
    if (validPartyChosen) {
      // If the party size is the same, it is only an order change
      if (player().party.length !== challenge.getParty()!.length) {
        G.pokemonGlobal.pokemonSelectionOriginalParty = player().party;
      }
      player().party = challenge.getParty()!;
    }
    challenge.pbCancel();
    return validPartyChosen;
  },

  restore(): boolean {
    if (!G.pokemonGlobal.pokemonSelectionOriginalParty) {
      console.log("Trying to restore a party without party stored."); // echoln
      return false;
    }
    const newPokemon = PokemonSelection.newPokemonOnParty();
    player().party = G.pokemonGlobal.pokemonSelectionOriginalParty;
    G.pokemonGlobal.pokemonSelectionOriginalParty = null;
    PokemonSelection.addPokemonOnArray(newPokemon);
    return true;
  },

  newPokemonOnParty(): Pokemon[] {
    const original = G.pokemonGlobal.pokemonSelectionOriginalParty!;
    return player().party.filter((partyPokemon) =>
      !original.find((originalPartyPokemon) => originalPartyPokemon.personalID === partyPokemon.personalID));
  },

  addPokemonOnArray(pokemonArray: Pokemon[]): void {
    for (const pokemon of pokemonArray) {
      if (player().party.length === 6) G.storage.pbStoreCaught(pokemon);
      else player().party.push(pokemon);
    }
  },
};

PokemonGlobalExtras.register("pokemonSelectionOriginalParty", pokemonJSON);

defineScript("PokemonSelection.choose", (_c, ...args) => PokemonSelection.choose(...args));
defineScript("PokemonSelection.restore", () => PokemonSelection.restore());
defineScript("PokemonSelection.hasValidTeam?", (_c, ...args) => PokemonSelection.hasValidTeam(...args));
defineScript("PokemonSelection::Parameters.new", () => new Parameters());
