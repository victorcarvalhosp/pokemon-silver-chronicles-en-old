// Port of Data/Scripts/010_Data/002_PBS data/011_ShadowPokemon.rb.

import type { ShadowPokemonData } from "../pbs/types";
import { type Id, SymbolData, hasFlag } from "./gameData";

export class ShadowPokemon extends SymbolData {
  static DATA = new Map<Id, ShadowPokemon>();
  /** Default gauge size. */
  static readonly HEART_GAUGE_SIZE = 4000;

  readonly id: Id;
  readonly moves: string[];
  readonly gaugeSize: number;
  readonly flags: string[];

  constructor(hash: Partial<ShadowPokemonData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.moves = hash.moves ?? [];
    this.gaugeSize = hash.gaugeSize ?? ShadowPokemon.HEART_GAUGE_SIZE;
    this.flags = hash.flags ?? [];
  }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }
}
