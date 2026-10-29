// Port of Data/Scripts/015_Trainers and player/001_Trainer.rb (Trainer and
// NPCTrainer), with Improved Field Skills' get_pokemon_with_move/skill.

import { rand } from "../../core/random";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { TrainerType } from "../../data/gameData/trainerType";
import { Type } from "../../data/gameData/type";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";

/** pbGetLanguage (019_Utilities/001_Utilities.rb): from the system language, English by default. */
export function pbGetLanguage(): number {
  const lang = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2);
  switch (lang) {
    case "ja": return 1; // Japanese
    case "en": return 2; // English
    case "fr": return 3; // French
    case "it": return 4; // Italian
    case "de": return 5; // German
    case "es": return 7; // Spanish
    case "ko": return 8; // Korean
  }
  return 2; // Use 'English' by default
}

/** rand(2**16) | (rand(2**16) << 16) as an unsigned 32-bit ID. */
export function randomTrainerID(): number {
  return (rand(2 ** 16) | (rand(2 ** 16) << 16)) >>> 0;
}

export interface TrainerJSON {
  trainerType: Id;
  name: string;
  id: number;
  language: number;
  party: PokemonJSON[];
}

export class Trainer {
  protected _trainerType: Id;
  name: string;
  /** Trainer ID (32-bit unsigned; the low 16 bits are the public ID). */
  id: number;
  language: number;
  party: Pokemon[];

  constructor(name: string, trainerType: Id) {
    // Ruby: GameData::TrainerType.get(trainer_type).id (an unknown type raises).
    this._trainerType = TrainerType.get(trainerType).id;
    this.name = name;
    this.id = randomTrainerID();
    this.language = pbGetLanguage();
    this.party = [];
  }

  get trainerType(): Id { return this._trainerType; }
  set trainerType(value: Id) { this._trainerType = value; }

  inspect(): string {
    return `#<${this.constructor.name} ${this.fullName()} @party=${JSON.stringify(this.party.map((p) => p.speciesData().species))}>`;
  }

  fullName(): string {
    return _INTL("{1} {2}", this.trainerTypeName(), this.name);
  }

  //=============================================================================

  /** public_ID(id = nil): the 5-digit ID shown on the Trainer Card. */
  publicID(id: number | null = null): number {
    return (id ?? this.id) & 0xFFFF;
  }

  /** secret_ID(id = nil): the hidden high 16 bits. */
  secretID(id: number | null = null): number {
    return (id ?? this.id) >>> 16;
  }

  /** make_foreign_ID: a random ID that isn't this trainer's. */
  makeForeignID(): number {
    for (;;) {
      const ret = randomTrainerID();
      if (ret !== this.id) return ret;
    }
  }

  //=============================================================================

  trainerTypeName(): string { return TrainerType.get(this.trainerType).name; }
  baseMoney(): number { return TrainerType.get(this.trainerType).baseMoney; }
  /** 0 male, 1 female, 2 unknown (from the trainer type). */
  get gender(): number { return TrainerType.get(this.trainerType).gender; }
  male(): boolean { return TrainerType.get(this.trainerType).male(); }
  female(): boolean { return TrainerType.get(this.trainerType).female(); }
  skillLevel(): number { return TrainerType.get(this.trainerType).skillLevel; }
  flags(): string[] { return TrainerType.get(this.trainerType).flags; }
  hasFlag(flag: string): boolean { return TrainerType.get(this.trainerType).hasFlag(flag); }

  //=============================================================================

  /** Non-egg Pokémon in the party. */
  pokemonParty(): Pokemon[] { return this.party.filter((p) => p && !p.egg()); }

  /** Non-egg, non-fainted Pokémon in the party. */
  ableParty(): Pokemon[] { return this.party.filter((p) => p && !p.egg() && !p.fainted()); }

  partyCount(): number { return this.party.length; }

  pokemonCount(): number {
    let ret = 0;
    for (const p of this.party) if (p && !p.egg()) ret += 1;
    return ret;
  }

  ablePokemonCount(): number {
    let ret = 0;
    for (const p of this.party) if (p && !p.egg() && !p.fainted()) ret += 1;
    return ret;
  }

  /** party_full? */
  partyFull(): boolean { return this.partyCount() >= Settings.MAX_PARTY_SIZE; }

  /** all_fainted? */
  allFainted(): boolean { return this.ablePokemonCount() === 0; }

  firstParty(): Pokemon | null { return this.party[0] ?? null; }
  firstPokemon(): Pokemon | null { return this.pokemonParty()[0] ?? null; }
  firstAblePokemon(): Pokemon | null { return this.ableParty()[0] ?? null; }
  lastParty(): Pokemon | null { return this.party.length > 0 ? this.party[this.party.length - 1]! : null; }
  lastPokemon(): Pokemon | null { const p = this.pokemonParty(); return p.length > 0 ? p[p.length - 1]! : null; }
  lastAblePokemon(): Pokemon | null { const p = this.ableParty(); return p.length > 0 ? p[p.length - 1]! : null; }

  /** remove_pokemon_at_index: fails if it's the last able Pokémon. */
  removePokemonAtIndex(index: number): boolean {
    if (index < 0 || index >= this.partyCount()) return false;
    let haveAble = false;
    for (let i = 0; i < this.party.length; i++) {
      if (i !== index && this.party[i]!.able()) haveAble = true;
      if (haveAble) break;
    }
    if (!haveAble) return false;
    this.party.splice(index, 1);
    return true;
  }

  /** has_other_able_pokemon?(index) */
  hasOtherAblePokemon(index: number): boolean {
    return this.party.some((pkmn, i) => i !== index && pkmn.able());
  }

  /** has_species?(species, form = -1) */
  hasSpecies(species: Id, form = -1): boolean {
    return this.pokemonParty().some((p) => p && p.isSpecies(species) && (form < 0 || p.form === form));
  }

  /** has_fateful_species?(species) */
  hasFatefulSpecies(species: Id): boolean {
    return this.pokemonParty().some((p) => p && p.isSpecies(species) && p.obtainMethod === 4);
  }

  /** has_pokemon_of_type?(type) */
  hasPokemonOfType(type: Id): boolean {
    if (!Type.exists(type)) return false;
    const t = Type.get(type).id;
    return this.pokemonParty().some((p) => p && p.hasType(t));
  }

  /** get_pokemon_with_move(move) — Improved Field Skills also counts species field skills. */
  getPokemonWithMove(move: Id): Pokemon | null {
    for (const pkmn of this.pokemonParty()) if (pkmn.hasMove(move) || pkmn.speciesData().hasSkill(move)) return pkmn;
    return null;
  }

  /** Improved Field Skills: get_pokemon_with_skill(skill) */
  getPokemonWithSkill(skill: Id): Pokemon | null {
    for (const pkmn of this.pokemonParty()) if (pkmn.speciesData().hasSkill(skill)) return pkmn;
    return null;
  }

  healParty(): void {
    for (const pkmn of this.party) pkmn.heal();
  }

  toJSON(): TrainerJSON {
    return { trainerType: this._trainerType, name: this.name, id: this.id, language: this.language, party: this.party.map((p) => p.toJSON()) };
  }

  /** Copies saved fields onto an object made with Object.create (no constructor run). */
  protected loadJSON(json: TrainerJSON): void {
    this._trainerType = json.trainerType;
    this.name = json.name;
    this.id = json.id;
    this.language = json.language;
    this.party = json.party.map((p) => Pokemon.fromJSON(p));
  }

  static fromJSON(json: TrainerJSON): Trainer {
    const t = Object.create(Trainer.prototype) as Trainer;
    t.loadJSON(json);
    return t;
  }
}

export interface NPCTrainerJSON extends TrainerJSON {
  items: Id[];
  loseText: string | null;
  winText: string | null;
}

export class NPCTrainer extends Trainer {
  items: Id[];
  loseText: string | null;
  winText: string | null;

  constructor(name: string, trainerType: Id) {
    super(name, trainerType);
    this.items = [];
    this.loseText = null;
    this.winText = null;
  }

  override toJSON(): NPCTrainerJSON {
    return { ...super.toJSON(), items: [...this.items], loseText: this.loseText, winText: this.winText };
  }

  static override fromJSON(json: NPCTrainerJSON): NPCTrainer {
    const t = Object.create(NPCTrainer.prototype) as NPCTrainer;
    t.loadJSON(json);
    t.items = [...json.items];
    t.loseText = json.loseText;
    t.winText = json.winText;
    return t;
  }
}
