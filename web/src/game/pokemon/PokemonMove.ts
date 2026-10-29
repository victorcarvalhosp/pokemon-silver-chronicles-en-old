// Port of Data/Scripts/014_Pokemon/004_Pokemon_Move.rb (Pokemon::Move),
// with ZUD Mechanics' old_move and power move checks.

import type { MoveCategory } from "../../data/pbs/types";
import type { Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";

export interface PokemonMoveJSON {
  id: Id;
  pp: number;
  ppup: number;
  oldMove?: unknown;
}

export class PokemonMove {
  private _id: Id;
  private _pp: number;
  private _ppup: number;
  /** ZUD: the move a Z-Move/Max Move replaced while in battle. */
  oldMove: unknown = null;

  constructor(moveId: Id) {
    this._id = MoveData.get(moveId).id;
    this._ppup = 0;
    this._pp = 0;
    this._pp = this.totalPp;
  }

  /** Sets the move's ID. PP is capped at the new move's total. */
  get id(): Id { return this._id; }
  set id(value: Id) {
    this._id = MoveData.get(value).id;
    this._pp = clamp(this._pp, 0, this.totalPp);
  }

  get pp(): number { return this._pp; }
  set pp(value: number) { this._pp = clamp(value, 0, this.totalPp); }

  get ppup(): number { return this._ppup; }
  set ppup(value: number) {
    this._ppup = value;
    this._pp = clamp(this._pp, 0, this.totalPp);
  }

  /** total_pp: the move's PP, raised by PP Ups. */
  get totalPp(): number {
    const maxPp = MoveData.get(this._id).totalPp;
    return maxPp + Math.floor((maxPp * this._ppup) / 5);
  }
  get totalpp(): number { return this.totalPp; }

  get functionCode(): string { return MoveData.get(this._id).functionCode; }
  get baseDamage(): number { return MoveData.get(this._id).baseDamage; }
  get type(): Id { return MoveData.get(this._id).type; }
  get category(): MoveCategory { return MoveData.get(this._id).category; }
  get accuracy(): number { return MoveData.get(this._id).accuracy; }
  get effectChance(): number { return MoveData.get(this._id).effectChance; }
  get target(): Id { return MoveData.get(this._id).target; }
  get priority(): number { return MoveData.get(this._id).priority; }
  get flags(): string[] { return MoveData.get(this._id).flags; }
  get name(): string { return MoveData.get(this._id).name; }
  get description(): string { return MoveData.get(this._id).description; }
  /** hidden_move? */
  hiddenMove(): boolean { return MoveData.get(this._id).hiddenMove(); }

  displayType(pkmn: unknown): Id { return MoveData.get(this._id).displayType(pkmn, this); }
  displayCategory(pkmn: unknown): MoveCategory { return MoveData.get(this._id).displayCategory(pkmn, this); }
  displayDamage(pkmn: unknown): number { return MoveData.get(this._id).displayDamage(pkmn, this); }
  displayAccuracy(pkmn: unknown): number { return MoveData.get(this._id).displayAccuracy(pkmn, this); }

  // ZUD Mechanics
  zMove(): boolean { return MoveData.get(this._id).zMove(); }
  maxMove(): boolean { return MoveData.get(this._id).maxMove(); }
  powerMove(): boolean { return MoveData.get(this._id).powerMove(); }

  /** Ruby's Object#clone (a shallow copy). */
  clone(): PokemonMove {
    return PokemonMove.fromJSON(this.toJSON());
  }

  toJSON(): PokemonMoveJSON {
    const ret: PokemonMoveJSON = { id: this._id, pp: this._pp, ppup: this._ppup };
    if (this.oldMove != null) ret.oldMove = this.oldMove;
    return ret;
  }

  static fromJSON(json: PokemonMoveJSON): PokemonMove {
    const m = Object.create(PokemonMove.prototype) as PokemonMove;
    m._id = json.id;
    m._pp = json.pp;
    m._ppup = json.ppup;
    m.oldMove = json.oldMove ?? null;
    return m;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
