// Port of Data/Scripts/015_Trainers and player/005_Player_Pokedex.rb
// (Player::Pokedex), with Essentials Deluxe's replacements
// ([000] Essentials Patches/Pokedex.rb): seen forms are recorded per
// gender, shininess (regular/shiny/super shiny) and "special" sprite set
// (0 base, 1 Shadow, 2 Gigantamax, 3 Celestial).

import { type Id } from "../../data/gameData/gameData";
import { pbAllRegionalSpecies, pbLoadRegionalDexes } from "../../data/gameData/miscPBSData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import type { Pokemon } from "../pokemon/Pokemon";

/** [gender][shiny][special][form] → seen. */
type SeenForms = (boolean | null)[][][][];
/** [gender, form, shiny, special] */
type LastSeen = [number, number, number, number] | [];

const newSeenForms = (): SeenForms => [
  //  [   Regular    ]  [    Shiny     ]  [  Super Shiny ]
  [[[], [], [], []], [[], [], [], []], [[], [], [], []]], // Male
  [[[], [], [], []], [[], [], [], []], [[], [], [], []]], // Female
];

const speciesId = (species: Id) => Species.tryGet(species)?.species ?? null;

export interface PokedexJSON {
  unlockedDexes: boolean[];
  seen: Record<Id, boolean>;
  owned: Record<Id, boolean>;
  seenForms: Record<Id, SeenForms>;
  seenEggs: Record<Id, boolean>;
  lastSeenForms: Record<Id, LastSeen>;
  ownedShadow: Record<Id, boolean>;
  caughtCounts: Record<Id, number>;
  defeatedCounts: Record<Id, number>;
}

export class Pokedex {
  /** Dexes the player can open: Regional Dex numbers, -1 for the National Dex. */
  accessibleDexes: number[] = [];
  private unlockedDexes: boolean[] = [];
  private _seen: Record<Id, boolean> = {};
  private _owned: Record<Id, boolean> = {};
  private seenForms: Record<Id, SeenForms> = {};
  private seenEggs: Record<Id, boolean> = {};
  private lastSeenForms: Record<Id, LastSeen> = {};
  private ownedShadow: Record<Id, boolean> = {};
  private caughtCounts: Record<Id, number> = {};
  private defeatedCounts: Record<Id, number> = {};

  constructor() {
    this.unlockedDexes = [];
    const n = pbLoadRegionalDexes().length;
    for (let i = 0; i <= n; i++) this.unlockedDexes[i] = i === 0;
    this.clear();
  }

  inspect(): string {
    return `#<Pokedex seen: ${this.seenCount()}, owned: ${this.ownedCount()}>`;
  }

  clear(): void {
    this._seen = {};
    this._owned = {};
    this.seenForms = {}; // Gender (0 or 1), shiny (0-2), special (0-3), form number
    this.seenEggs = {};
    this.lastSeenForms = {};
    this.ownedShadow = {};
    this.caughtCounts = {};
    this.defeatedCounts = {};
    this.refreshAccessibleDexes();
  }

  //=============================================================================
  // Seen
  //=============================================================================

  setSeen(species: Id, shouldRefreshDexes = true): void {
    const id = speciesId(species);
    if (id == null) return;
    this._seen[id] = true;
    if (shouldRefreshDexes) this.refreshAccessibleDexes();
  }

  /** seen?(species) */
  seen(species: Id): boolean {
    const id = speciesId(species);
    if (id == null) return false;
    return this._seen[id] === true;
  }

  /**
   * seen_form?(species, gender, form, shiny = nil, special = nil) — Essentials
   * Deluxe's. With neither shiny nor special, any sprite set counts.
   */
  seenForm(species: Id, gender: number, form: number, shiny: number | null = null, special: number | null = null): boolean {
    const id = speciesId(species);
    if (id == null) return false;
    const forms = (this.seenForms[id] ??= newSeenForms());
    if (shiny == null && special == null) {
      let sh = 0;
      let sp = 0;
      let ret: boolean | null | undefined = null;
      for (let i = 0; i < 9; i++) {
        ret = forms[gender]![sh]![sp]![form];
        if (ret != null) break;
        sp += 1;
        if (sp > 2) sp = 0;
        if ((i + 1) % 3 === 0) sh += 1;
      }
      return ret === true;
    }
    if (shiny == null || !Settings.POKEDEX_SHINY_FORMS) shiny = 0;
    if (special == null || (special === 1 && !Settings.POKEDEX_SHADOW_FORMS)) special = 0;
    return forms[gender]![shiny]![special]![form] === true;
  }

  setSeenEgg(species: Id): void {
    const id = speciesId(species);
    if (id == null) return;
    this.seenEggs[id] = true;
  }

  /** seen_egg?(species) */
  seenEgg(species: Id): boolean {
    const id = speciesId(species);
    if (id == null) return false;
    return this.seenEggs[id] === true;
  }

  /** seen_count(dex = -1) */
  seenCount(dex = -1): number {
    return this.countSpecies(this._seen, dex);
  }

  /** seen_any?(dex = -1) */
  seenAny(dex = -1): boolean {
    if (dex === -1) {
      for (const s of Species.eachSpecies()) if (this._seen[s.species]) return true;
    } else {
      for (const s of regionalSpecies(dex)) if (s && this._seen[s]) return true;
    }
    return false;
  }

  /** seen_forms_count(species) — Essentials Deluxe's (counts every sprite set). */
  seenFormsCount(species: Id): number {
    const id = speciesId(species);
    if (id == null) return 0;
    let ret = 0;
    const array = (this.seenForms[id] ??= newSeenForms());
    // Ruby takes the max of array[0].length and array[1].length, which is always 3 (the shiny dimension).
    const n = Math.max(array[0]!.length, array[1]!.length);
    for (let i = 0; i < n; i++) {
      let any = false;
      for (const special of [0, 1, 2, 3]) {
        for (const gender of [0, 1]) {
          for (const shiny of [0, 1, 2]) if (array[gender]![shiny]![special]![i]) any = true;
        }
      }
      if (any) ret += 1;
    }
    return ret;
  }

  /** last_form_seen(species): [gender, form, shiny, special]. */
  lastFormSeen(species: Id): [number, number, number, number] {
    const last = (this.lastSeenForms[species] ??= []);
    return [last[0] ?? 0, last[1] ?? 0, last[2] ?? 0, last[3] ?? 0];
  }

  setLastFormSeen(species: Id, gender = 0, form = 0, shiny = 0, special = 0): void {
    if (!Settings.POKEDEX_SHINY_FORMS) shiny = 0;
    if (special === 1 && !Settings.POKEDEX_SHADOW_FORMS) special = 0;
    this.lastSeenForms[species] = [gender, form, shiny, special];
  }

  //=============================================================================
  // Owned
  //=============================================================================

  setOwned(species: Id, shouldRefreshDexes = true): void {
    const id = speciesId(species);
    if (id == null) return;
    this._owned[id] = true;
    if (shouldRefreshDexes) this.refreshAccessibleDexes();
  }

  /** set_shadow_pokemon_owned (Essentials Deluxe: also records the form ID). */
  setShadowPokemonOwned(species: Id): void {
    const id = speciesId(species);
    if (id == null) return;
    this.ownedShadow[id] = true;
    if (species !== id) this.ownedShadow[species] = true;
    this.refreshAccessibleDexes();
  }

  /** owned?(species) */
  owned(species: Id): boolean {
    const id = speciesId(species);
    if (id == null) return false;
    return this._owned[id] === true;
  }

  /** owned_shadow_pokemon?(species) */
  ownedShadowPokemon(species: Id): boolean {
    const id = speciesId(species);
    if (id == null) return false;
    return !!(this.ownedShadow[species] || this.ownedShadow[id]);
  }

  /** Essentials Deluxe: owned_shadow_species?(species) — this exact form. */
  ownedShadowSpecies(species: Id): boolean {
    const id = Species.tryGet(species)?.id;
    if (id == null) return false;
    return this.ownedShadow[species] === true;
  }

  /** owned_count(dex = -1) */
  ownedCount(dex = -1): number {
    return this.countSpecies(this._owned, dex);
  }

  //=============================================================================

  /**
   * register(species or Pokémon, gender = 0, form = 0, shiny = 0, should_refresh_dexes = true, special = 0)
   * — Essentials Deluxe's. Records the species as seen and its form/sprite set.
   */
  register(species: Id | Pokemon, gender = 0, form = 0, shiny: number | boolean = 0, shouldRefreshDexes = true, special: number | boolean = 0): void {
    let speciesData: Species;
    if (typeof species !== "string") {
      const pkmn = species;
      speciesData = pkmn.speciesData();
      gender = pkmn.gender;
      shiny = !Settings.POKEDEX_SHINY_FORMS ? 0 : pkmn.superShiny ? 2 : pkmn.shiny ? 1 : 0;
      special = pkmn.shadowPokemon() && Settings.POKEDEX_SHADOW_FORMS ? 1 : pkmn.gmax ? 2 : pkmn.celestial() ? 3 : 0;
    } else {
      speciesData = Species.getSpeciesForm(species, form)!;
    }
    const sp = speciesData.species;
    if (gender >= 2) gender = 0;
    form = speciesData.form;
    if (shiny === true) shiny = 1;
    if (special === true) special = 1;
    if (form !== speciesData.pokedexForm) {
      speciesData = Species.getSpeciesForm(sp, speciesData.pokedexForm)!;
      form = speciesData.form;
    }
    if (!speciesData.formName) form = 0;
    this._seen[sp] = true;
    const forms = (this.seenForms[sp] ??= newSeenForms());
    forms[gender]![Number(shiny)]![Number(special)]![form] = true;
    this.lastSeenForms[sp] ??= [];
    if (this.lastSeenForms[sp]!.length === 0) this.lastSeenForms[sp] = [gender, form, Number(shiny), Number(special)];
    if (shouldRefreshDexes) this.refreshAccessibleDexes();
  }

  /** register_last_seen(pkmn) — Essentials Deluxe's. */
  registerLastSeen(pkmn: Pokemon): void {
    const speciesData = pkmn.speciesData();
    let form = speciesData.pokedexForm;
    if (!speciesData.formName) form = 0;
    const shiny = !Settings.POKEDEX_SHINY_FORMS ? 0 : pkmn.superShiny ? 2 : pkmn.shiny ? 1 : 0;
    const special = pkmn.shadowPokemon() && Settings.POKEDEX_SHADOW_FORMS ? 1 : pkmn.gmax ? 2 : pkmn.celestial() ? 3 : 0;
    this.lastSeenForms[pkmn.species] = [pkmn.gender, form, shiny, special];
  }

  //=============================================================================

  caughtCount(species: Id): number {
    const id = speciesId(species);
    if (id == null) return 0;
    return this.caughtCounts[id] ?? 0;
  }

  defeatedCount(species: Id): number {
    const id = speciesId(species);
    if (id == null) return 0;
    return this.defeatedCounts[id] ?? 0;
  }

  battledCount(species: Id): number {
    const id = speciesId(species);
    if (id == null) return 0;
    return (this.defeatedCounts[id] ?? 0) + (this.caughtCounts[id] ?? 0);
  }

  registerCaught(species: Id): void {
    const id = speciesId(species);
    if (id == null) return;
    this.caughtCounts[id] = (this.caughtCounts[id] ?? 0) + 1;
  }

  registerDefeated(species: Id): void {
    const id = speciesId(species);
    if (id == null) return;
    this.defeatedCounts[id] = (this.defeatedCounts[id] ?? 0) + 1;
  }

  //=============================================================================

  /** unlock(dex): -1 or out of range means the National Dex (the last one). */
  unlock(dex: number): void {
    if (dex < 0 || dex > this.unlockedDexes.length - 1) dex = this.unlockedDexes.length - 1;
    this.unlockedDexes[dex] = true;
    this.refreshAccessibleDexes();
  }

  lock(dex: number): void {
    if (dex < 0 || dex > this.unlockedDexes.length - 1) dex = this.unlockedDexes.length - 1;
    this.unlockedDexes[dex] = false;
    this.refreshAccessibleDexes();
  }

  /** unlocked?(dex) */
  unlocked(dex: number): boolean {
    if (dex === -1) dex = this.unlockedDexes.length - 1;
    return this.unlockedDexes[dex] === true;
  }

  dexesCount(): number {
    return this.unlockedDexes.length;
  }

  /** Settings::USE_CURRENT_REGION_DEX is false in this game. */
  refreshAccessibleDexes(): void {
    this.accessibleDexes = [];
    if (this.dexesCount() === 1) { // Only National Dex is defined
      if (this.unlocked(0) && this.seenAny()) this.accessibleDexes.push(-1);
    } else { // Regional Dexes + National Dex
      for (let i = 0; i < this.dexesCount(); i++) {
        const dexListToCheck = i === this.dexesCount() - 1 ? -1 : i;
        if (this.unlocked(i) && this.seenAny(dexListToCheck)) this.accessibleDexes.push(dexListToCheck);
      }
    }
  }

  private countSpecies(hash: Record<Id, boolean>, region = -1): number {
    let ret = 0;
    if (region === -1) {
      for (const s of Species.eachSpecies()) if (hash[s.species]) ret += 1;
    } else {
      for (const s of regionalSpecies(region)) if (s && hash[s]) ret += 1;
    }
    return ret;
  }

  //=============================================================================

  toJSON(): PokedexJSON {
    return {
      unlockedDexes: [...this.unlockedDexes], seen: { ...this._seen }, owned: { ...this._owned },
      seenForms: JSON.parse(JSON.stringify(this.seenForms)) as Record<Id, SeenForms>, seenEggs: { ...this.seenEggs },
      lastSeenForms: JSON.parse(JSON.stringify(this.lastSeenForms)) as Record<Id, LastSeen>,
      ownedShadow: { ...this.ownedShadow }, caughtCounts: { ...this.caughtCounts }, defeatedCounts: { ...this.defeatedCounts },
    };
  }

  static fromJSON(json: PokedexJSON): Pokedex {
    const d = Object.create(Pokedex.prototype) as Pokedex;
    d.unlockedDexes = [...json.unlockedDexes];
    d._seen = { ...json.seen };
    d._owned = { ...json.owned };
    d.seenForms = JSON.parse(JSON.stringify(json.seenForms)) as Record<Id, SeenForms>;
    d.seenEggs = { ...json.seenEggs };
    d.lastSeenForms = JSON.parse(JSON.stringify(json.lastSeenForms)) as Record<Id, LastSeen>;
    d.ownedShadow = { ...json.ownedShadow };
    d.caughtCounts = { ...json.caughtCounts };
    d.defeatedCounts = { ...json.defeatedCounts };
    d.refreshAccessibleDexes();
    return d;
  }
}

/**
 * pbAllRegionalSpecies(dex). Ruby would raise calling each on nil for a dex
 * with no list; that never happens for dexes the game unlocks, so treat it as empty.
 */
function regionalSpecies(dex: number): (Id | null)[] {
  return pbAllRegionalSpecies(dex) ?? [];
}
