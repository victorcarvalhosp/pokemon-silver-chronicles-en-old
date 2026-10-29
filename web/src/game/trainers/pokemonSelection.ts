// Port of Plugins/Pokemon Selection Before Battle (FL's "Pokémon Selection"
// 1.3.3): events choose which Pokémon (and in what order) the player brings to
// a battle, then put the party back afterwards. Maps 86 (Dance Theater, 1v1)
// and 382 (Route 24, 3v3) use it.
//
// The plugin drives the Battle Frontier's challenge object
// (018_Alternate battle modes, game/frontier/): pbHasEligible?, pbEntryScreen
// and pbBattleChallenge's rules, party and pbCancel, and adds
// BattleChallenge#setSimple/#getParty (below). Its PokemonRuleSet#hasValidTeam?
// for Essentials before v21 is in game/frontier/rulesets.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { pbMessage } from "../../ui/messages";
import { PokemonGlobalExtras, pokemonJSON } from "../battle/globalExtras";
import { BattleChallenge } from "../frontier/battleChallenge";
import { pbBattleChallenge, pbEntryScreen, pbHasEligible } from "../frontier/challengeData";
import { PokemonChallengeRules } from "../frontier/challengeRules";
import { AblePokemonRestriction } from "../frontier/entryRestrictions";
import { OpenLevelAdjustment } from "../frontier/levelAdjustment";
import { FrontierMarshal } from "../frontier/marshal";
import type { PokemonRule } from "../frontier/rulesets";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import { defineScript } from "../scriptApi";
import type { Player } from "../trainer/Player";

declare module "../globals" {
  interface PokemonGlobalMetadata {
    pokemonSelectionOriginalParty?: Pokemon[] | null;
  }
}

declare module "../frontier/battleChallenge" {
  interface BattleChallenge {
    setSimple(rules: PokemonChallengeRules): void;
    getParty(): Pokemon[] | null;
  }
}

const player = () => G.player as unknown as Player;

// class BattleChallenge (the plugin's additions)
BattleChallenge.prototype.setSimple = function (this: BattleChallenge, rules: PokemonChallengeRules): void {
  this.id = "pokemonSelectionRules";
  this.numRounds = 1;
  this._rules = rules;
  this.register(this.id, false, 3, 0, 0);
};

BattleChallenge.prototype.getParty = function (this: BattleChallenge): Pokemon[] | null {
  return this.bc.party;
};

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
    pbBattleChallenge().setSimple(params.challenge());
    const ret = pbHasEligible();
    pbBattleChallenge().pbCancel();
    return ret;
  },

  async choose(...args: unknown[]): Promise<boolean> {
    if (G.pokemonGlobal.pokemonSelectionOriginalParty) {
      throw new Error("Can't choose a new party until restore the old one!");
    }
    const params = Parameters.factory(...args);
    if (!PokemonSelection.hasValidTeam(params)) throw new Error("Player hasn't a valid team!");
    let validPartyChosen = false;
    pbBattleChallenge().setSimple(params.challenge());
    for (;;) {
      await pbEntryScreen();
      validPartyChosen = pbBattleChallenge().getParty() != null;
      if (params.canCancel || pbBattleChallenge().getParty()) break;
      await pbMessage(_INTL("Choose a Pokémon."));
    }
    if (validPartyChosen) {
      // If the party size is the same, it is only an order change
      if (player().party.length !== pbBattleChallenge().getParty()!.length) {
        G.pokemonGlobal.pokemonSelectionOriginalParty = player().party;
      }
      player().party = pbBattleChallenge().getParty()!;
    }
    pbBattleChallenge().pbCancel();
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
FrontierMarshal.register({ TypeRestriction });

defineScript("PokemonSelection.choose", (_c, ...args) => PokemonSelection.choose(...args));
defineScript("PokemonSelection.restore", () => PokemonSelection.restore());
defineScript("PokemonSelection.hasValidTeam?", (_c, ...args) => PokemonSelection.hasValidTeam(...args));
defineScript("PokemonSelection::Parameters.new", () => new Parameters());
