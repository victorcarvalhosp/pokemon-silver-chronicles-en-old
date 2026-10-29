// Port of the data model of Data/Scripts/016_UI/022_UI_PurifyChamber.rb: the
// PokemonGlobalMetadata#purifyChamber addition (saved as its own SaveData
// value, like the Day Care), calcPoint, PurifyChamberSet, PurifyChamber (with
// update, the per-step heart gauge reduction called by
// ../../game/pokemon/shadowPokemonOther.ts's :lower_heart_gauges step handler)
// and PurifyChamberHelper. The windows, sprites, scene and screen are in
// ./PurifyChamberScene.ts and ./PurifyChamberScreen.ts. The Player additions
// (has_snag_machine, seen_purify_chamber) are in game/trainer/Player.ts.
//
// Ruby's Integer#/ floors; idiv() keeps that for the cursor/angle maths.

import type { Id } from "../../data/gameData/gameData";
import { Effectiveness } from "../../data/gameData/type";
import { G, PokemonGlobalMetadata } from "../../game/globals";
import { pbMessageHook } from "../../game/items/itemUtilities";
import { Pokemon, type PokemonJSON } from "../../game/pokemon/Pokemon";
import { SaveData } from "../../game/save/SaveData";
import { rubyNameError } from "../../game/scripts/rubyErrors";
import { _INTL } from "../messageConfig";

/** Ruby's Integer#/ (floored). */
export const idiv = (a: number, b: number): number => Math.floor(a / b);

/** Array#compact! */
function compact<T>(a: (T | null | undefined)[]): T[] {
  let w = 0;
  for (let r = 0; r < a.length; r++) if (a[r] != null) a[w++] = a[r];
  a.length = w;
  return a as T[];
}

/** Array#insert(index, value) for index >= 0 (pads with nil past the end). */
function rubyInsert<T>(a: (T | null)[], index: number, value: T | null): void {
  while (a.length < index) a.push(null);
  a.splice(index, 0, value);
}

/** Array#[]=(index, value) for index >= 0 (pads with nil past the end). */
function rubyStore<T>(a: (T | null)[], index: number, value: T | null): void {
  while (a.length < index) a.push(null);
  a[index] = value;
}

//===============================================================================
// General purpose utilities
//===============================================================================
/** calcPoint(x, y, distance, angle): angle in degrees, counter-clockwise from 3 o'clock. */
export function calcPoint(x: number, y: number, distance: number, angle: number): [number, number] {
  angle -= Math.floor(angle / 360.0) * 360; // normalize
  angle = (angle / 360.0) * (2 * Math.PI); // convert to radians
  angle = rubyFloatMod(-angle, 2 * Math.PI); // normalize radians
  const point: [number, number] = [Math.cos(angle) * distance, Math.sin(angle) * distance];
  point[0] += x;
  point[1] += y;
  return point;
}

/** Float#% (the result has the divisor's sign). */
function rubyFloatMod(a: number, b: number): number {
  const r = a % b;
  return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
}

//===============================================================================
//
//===============================================================================
export interface PurifyChamberSetJSON {
  list: PokemonJSON[];
  facing: number;
  shadow: PokemonJSON | null;
}

export class PurifyChamberSet {
  /** The Shadow Pokémon in the middle. */
  private _shadow: Pokemon | null = null;
  /** Index in list of Pokémon the Shadow Pokémon is facing. */
  private _facing = 0;
  private _list: Pokemon[] = [];

  partialSum(x: number): number {
    return idiv(x * x + x, 2); // pattern: 1, 3, 6, 10, 15, 21, 28, ...
  }

  get length(): number {
    return this._list.length;
  }

  get facing(): number { return this._facing; }
  set facing(value: number) {
    if (value >= 0 && value < this._list.length) this._facing = value;
  }

  get shadow(): Pokemon | null { return this._shadow; }
  set shadow(value: Pokemon | null) {
    if (value == null || value.shadowPokemon()) this._shadow = value;
  }

  /**
   * Main component is tempo.
   * Boosted if center has advantage over facing Pokemon.
   * Boosted based on number of best circles.
   */
  flow(): number {
    let ret = 0;
    if (!this._shadow) return 0;
    const n = this._list.length;
    for (let i = 0; i < n; i++) {
      ret += PurifyChamberSet.isSuperEffective(this._list[i]!, this._list[(i + 1) % n]!) ? 1 : 0;
    }
    if (this._list[this._facing]) {
      ret += PurifyChamberSet.isSuperEffective(this._shadow, this._list[this._facing]!) ? 1 : 0;
    }
    return ret + idiv(n, 2);
  }

  shadowAffinity(): number {
    if (this._facing < 0 || this._facing >= this._list.length || !this._shadow) return 0;
    return PurifyChamberSet.isSuperEffective(this._shadow, this._list[this._facing]!) ? 2 : 1;
  }

  affinity(i: number): number {
    if (i < 0 || i >= this._list.length) return 0;
    return PurifyChamberSet.isSuperEffective(this._list[i]!, this._list[(i + 1) % this._list.length]!) ? 2 : 1;
  }

  /**
   * Tempo refers to the type advantages of each Pokemon in a certain set in a
   * clockwise direction. Tempo also depends on the number of Pokemon in the set.
   */
  tempo(): number {
    let ret = 0;
    const n = this._list.length;
    for (let i = 0; i < n; i++) {
      ret += PurifyChamberSet.isSuperEffective(this._list[i]!, this._list[(i + 1) % n]!) ? 1 : 0;
    }
    return this.partialSum(n) + ret;
  }

  /** list (a copy). */
  get list(): Pokemon[] {
    return [...this._list];
  }

  /** [](index) */
  get(index: number): Pokemon | null {
    return this._list[index] ?? null;
  }

  insertAfter(index: number, value: Pokemon | null): void {
    if (this.length >= PurifyChamber.SETSIZE) return;
    if (index < 0 || index >= PurifyChamber.SETSIZE) return;
    if (!value?.shadowPokemon()) {
      const list = this._list as (Pokemon | null)[];
      rubyInsert(list, index + 1, value);
      compact(list);
      if (this._facing > index && value) this._facing += 1;
      this._facing = Math.max(Math.min(this._facing, this._list.length - 1), 0);
    }
  }

  insertAt(index: number, value: Pokemon | null): void {
    if (index < 0 || index >= PurifyChamber.SETSIZE) return;
    if (!value?.shadowPokemon()) {
      const list = this._list as (Pokemon | null)[];
      rubyStore(list, index, value);
      compact(list);
      this._facing = Math.max(Math.min(this._facing, this._list.length - 1), 0);
    }
  }

  /** Purify Chamber treats Normal/Normal matchup as super effective. */
  static typeAdvantage(p1: Id, p2: Id): boolean {
    if (p1 === "NORMAL" && p2 === "NORMAL") return true;
    return Effectiveness.superEffectiveType(p1, p2);
  }

  static isSuperEffective(p1: Pokemon, p2: Pokemon): boolean {
    const t1 = p1.types();
    const t2 = p2.types();
    if (PurifyChamberSet.typeAdvantage(t1[0]!, t2[0]!)) return true;
    if (t2[1] && PurifyChamberSet.typeAdvantage(t1[0]!, t2[1])) return true;
    if (t1[1] == null) return false;
    if (PurifyChamberSet.typeAdvantage(t1[1], t2[0]!)) return true;
    if (t2[1] && PurifyChamberSet.typeAdvantage(t1[1], t2[1])) return true;
    return false;
  }

  toJSON(): PurifyChamberSetJSON {
    return { list: this._list.map((p) => p.toJSON()), facing: this._facing, shadow: this._shadow?.toJSON() ?? null };
  }

  static fromJSON(json: PurifyChamberSetJSON): PurifyChamberSet {
    const s = new PurifyChamberSet();
    s._list = json.list.map((p) => Pokemon.fromJSON(p));
    s._facing = json.facing;
    s._shadow = json.shadow ? Pokemon.fromJSON(json.shadow) : null;
    return s;
  }
}

//===============================================================================
//
//===============================================================================
export interface PurifyChamberJSON {
  sets: PurifyChamberSetJSON[];
  currentSet: number;
}

export class PurifyChamber {
  static readonly NUMSETS = 9;
  static readonly SETSIZE = 4;

  sets: PurifyChamberSet[] = [];
  private _currentSet = 0;

  /** Calculates the maximum possible tempo. */
  static maximumTempo(): number {
    const x = PurifyChamber.SETSIZE + 1;
    return idiv(x * x + x, 2) - 1;
  }

  constructor() {
    for (let i = 0; i < PurifyChamber.NUMSETS; i++) this.sets[i] = new PurifyChamberSet();
  }

  get currentSet(): number { return this._currentSet; }
  set currentSet(value: number) {
    if (value >= 0 && value < PurifyChamber.NUMSETS) this._currentSet = value;
  }

  /** Number of regular Pokemon in a set. */
  setCount(set: number): number {
    return this.sets[set]!.length;
  }

  setList(set: number): Pokemon[] {
    if (set < 0 || set >= PurifyChamber.NUMSETS) return [];
    return this.sets[set]!.list;
  }

  /** for speeding up purification */
  chamberFlow(chamber: number): number {
    if (chamber < 0 || chamber >= PurifyChamber.NUMSETS) return 0;
    return this.sets[chamber]!.flow();
  }

  getShadow(chamber: number): Pokemon | null {
    if (chamber < 0 || chamber >= PurifyChamber.NUMSETS) return null;
    return this.sets[chamber]!.shadow;
  }

  /** allow only "shadow" Pokemon */
  setShadow(chamber: number, value: Pokemon | null): void {
    if (chamber < 0 || chamber >= PurifyChamber.NUMSETS) return;
    this.sets[chamber]!.shadow = value;
  }

  switch(set1: number, set2: number): void {
    if (set1 < 0 || set1 >= PurifyChamber.NUMSETS) return;
    if (set2 < 0 || set2 >= PurifyChamber.NUMSETS) return;
    const s = this.sets[set1]!;
    this.sets[set1] = this.sets[set2]!;
    this.sets[set2] = s;
  }

  insertAfter(set: number, index: number, value: Pokemon | null): void {
    if (set < 0 || set >= PurifyChamber.NUMSETS) return;
    this.sets[set]!.insertAfter(index, value);
  }

  insertAt(set: number, index: number, value: Pokemon | null): void {
    if (set < 0 || set >= PurifyChamber.NUMSETS) return;
    this.sets[set]!.insertAt(index, value);
  }

  /** [](chamber) is the set; [](chamber, slot) the Pokémon in that slot. */
  get(chamber: number): PurifyChamberSet;
  get(chamber: number, slot: number): Pokemon | null;
  get(chamber: number, slot?: number): PurifyChamberSet | Pokemon | null {
    if (slot == null) return this.sets.at(chamber)!;
    if (chamber < 0 || chamber >= PurifyChamber.NUMSETS) return null;
    if (slot < 0 || slot >= PurifyChamber.SETSIZE) return null;
    return this.sets[chamber]!.get(slot);
  }

  /** isPurifiableIgnoreRegular? */
  isPurifiableIgnoreRegular(set: number): boolean {
    const shadow = this.getShadow(set);
    if (!shadow) return false;
    if (shadow.heartGauge !== 0) return false;
    // Define an exception for Lugia
    if (shadow.isSpecies("LUGIA")) {
      const maxtempo = PurifyChamber.maximumTempo();
      for (let i = 0; i < PurifyChamber.NUMSETS; i++) {
        if (this.sets[i]!.tempo() !== maxtempo) return false;
      }
    }
    return true;
  }

  /** isPurifiable? */
  isPurifiable(set: number): boolean {
    return this.isPurifiableIgnoreRegular(set) && this.setCount(set) > 0;
  }

  /** Called upon each step taken in the overworld. */
  async update(): Promise<void> {
    for (let set = 0; set < PurifyChamber.NUMSETS; set++) {
      const shadow = this.sets[set]!.shadow;
      if (!shadow || shadow.heartGauge <= 0) continue;
      // If a Shadow Pokemon and a regular Pokemon are on the same set
      const flow = this.chamberFlow(set);
      shadow.adjustHeart(-flow);
      if (!this.isPurifiable(set)) continue;
      await pbMessageHook(_INTL("Your {1} in the Purify Chamber is ready for purification!", shadow.name));
    }
  }

  debugAddShadow(set: number, species: Id): void {
    const pkmn = new Pokemon(species, 1);
    pkmn.makeShadow();
    this.setShadow(set, pkmn);
  }

  debugAddNormal(set: number, species: Id): void {
    const pkmn = new Pokemon(species, 1);
    this.insertAfter(set, this.setCount(set), pkmn);
  }

  /**
   * NOTE (Ruby parity): 022_UI_PurifyChamber.rb:279 builds a PseudoPokemon,
   * a class v20.1 doesn't define, so this raises NameError (nothing calls it).
   */
  debugAdd(_set: number, _shadow: boolean, _type1: Id, _type2: Id | null = null): never {
    rubyNameError("uninitialized constant PurifyChamber::PseudoPokemon");
  }

  toJSON(): PurifyChamberJSON {
    return { sets: this.sets.map((s) => s.toJSON()), currentSet: this._currentSet };
  }

  static fromJSON(json: PurifyChamberJSON): PurifyChamber {
    const c = new PurifyChamber();
    c.sets = json.sets.map((s) => PurifyChamberSet.fromJSON(s));
    c._currentSet = json.currentSet;
    return c;
  }
}

//===============================================================================
// $PokemonGlobal.purifyChamber (created on first use)
//===============================================================================
declare module "../../game/globals" {
  interface PokemonGlobalMetadata {
    purifyChamber: PurifyChamber;
  }
}
const chambers = new WeakMap<PokemonGlobalMetadata, PurifyChamber>();
Object.defineProperty(PokemonGlobalMetadata.prototype, "purifyChamber", {
  configurable: true,
  get(this: PokemonGlobalMetadata): PurifyChamber {
    let c = chambers.get(this);
    if (!c) chambers.set(this, (c = new PurifyChamber()));
    return c;
  },
  set(this: PokemonGlobalMetadata, value: PurifyChamber) { chambers.set(this, value); },
});

SaveData.register({
  id: "purify_chamber",
  save: () => G.pokemonGlobal.purifyChamber.toJSON(),
  load: (v) => { G.pokemonGlobal.purifyChamber = PurifyChamber.fromJSON(v as PurifyChamberJSON); },
});

//===============================================================================
//
//===============================================================================
export const PurifyChamberHelper = {
  pbGetPokemon2(chamber: PurifyChamber, set: number, position: number): Pokemon | null {
    if (position === 0) {
      return chamber.getShadow(set);
    } else if (position > 0) {
      position -= 1;
      if (position % 2 === 0) return chamber.get(set, idiv(position, 2));
      return null; // In between two indices
    }
    return null;
  },

  pbGetPokemon(chamber: PurifyChamber, position: number): Pokemon | null {
    if (position === 0) {
      return chamber.getShadow(chamber.currentSet);
    } else if (position > 0) {
      position -= 1;
      if (position % 2 === 0) return chamber.get(chamber.currentSet, idiv(position, 2));
      return null; // In between two indices
    }
    return null;
  },

  adjustOnInsert(position: number): number {
    if (position > 0) {
      position -= 1;
      const oldpos = idiv(position, 2);
      if (position % 2 === 0) return position + 1;
      return (oldpos + 1) * 2 + 1;
    }
    return position;
  },

  pbSetPokemon(chamber: PurifyChamber, position: number, value: Pokemon | null): void {
    if (position === 0) {
      chamber.setShadow(chamber.currentSet, value);
    } else if (position > 0) {
      position -= 1;
      if (position % 2 === 0) {
        chamber.insertAt(chamber.currentSet, idiv(position, 2), value);
      } else { // In between two indices
        chamber.insertAfter(chamber.currentSet, idiv(position, 2), value);
      }
    }
  },
};
