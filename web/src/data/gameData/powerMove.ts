// Port of Plugins/ZUD Mechanics/[001] Data/Data_PowerMove.rb (GameData::PowerMove):
// Z-Moves, Ultra Burst and Max Moves, compiled into power-moves.json.
//
// Where Ruby switches on the parameter's class (an array of Pokémon/battle
// moves, a Battle::PowerMove, a Battle::Move or Pokemon::Move, or an ID),
// this takes the same shapes: an array of { id, type } moves, a single
// { id, type } move (pass { powerMove: true } for a Battle::PowerMove; a
// Battle::Move object works too), or a move/type ID string.

import type { PowerMoveData, StagedMoves } from "../pbs/types";
import { type Id, SymbolData } from "./gameData";
import { Move } from "./move";
import { Type } from "./type";

export interface MoveLike { id: Id; type: Id | null; powerMove?: boolean | (() => boolean) }
type MoveParam = MoveLike[] | MoveLike | Id;

/**
 * `when Battle::PowerMove`: { powerMove: true }, or a Battle::PowerMove
 * instance (battle/zud/Battle_PowerMove.ts marks them with isPowerMoveClass).
 * A Battle::Move's powerMove() method doesn't count.
 */
function isBattlePowerMove(param: MoveLike): boolean {
  return param.powerMove === true || (param as { isPowerMoveClass?: boolean }).isPowerMoveClass === true;
}

export class PowerMove extends SymbolData {
  static DATA = new Map<Id, PowerMove>();
  readonly id: Id;
  readonly zmove: Id | null;
  readonly ultra: number | null;
  readonly maxmove: Id | null;
  readonly type: Id | null;
  readonly item: Id | null;
  readonly move: Id | null;
  readonly species: (Id | null)[];
  readonly flag: string | null;
  private readonly _gmax: boolean;
  readonly statusAtk: StagedMoves | null = null;
  readonly statusDef: StagedMoves | null = null;
  readonly statusSpatk: StagedMoves | null = null;
  readonly statusSpdef: StagedMoves | null = null;
  readonly statusSpeed: StagedMoves | null = null;
  readonly statusAcc: StagedMoves | null = null;
  readonly statusEva: StagedMoves | null = null;
  readonly statusOmni: StagedMoves | null = null;
  readonly statusHeal: StagedMoves | null = null;
  readonly statusCrit: Id[] | null = null;
  readonly statusReset: Id[] | null = null;
  readonly statusFocus: Id[] | null = null;

  constructor(hash: Partial<PowerMoveData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.zmove = hash.zmove ?? null;
    this.ultra = hash.ultra ?? null;
    this.maxmove = hash.maxmove ?? null;
    this.type = Type.exists(this.id) ? this.id : (hash.type ?? null);
    this.item = hash.item ?? null;
    this.move = hash.move ?? null;
    this._gmax = hash.gmax ?? this.id.includes("GMAX");
    this.species = hash.species ?? [];
    this.flag = hash.flag ?? null;
    if (this.id === "ZSTATUS") {
      const staged = (s: StagedMoves | undefined, n: number): StagedMoves => {
        const ret: StagedMoves = {};
        for (let i = 1; i <= n; i++) ret[String(i)] = s?.[String(i)] ?? [];
        return ret;
      };
      this.statusAtk = staged(hash.statusAtk, 3);
      this.statusDef = staged(hash.statusDef, 3);
      this.statusSpatk = staged(hash.statusSpatk, 3);
      this.statusSpdef = staged(hash.statusSpdef, 3);
      this.statusSpeed = staged(hash.statusSpeed, 3);
      this.statusAcc = staged(hash.statusAcc, 3);
      this.statusEva = staged(hash.statusEva, 3);
      this.statusOmni = staged(hash.statusOmni, 3);
      this.statusHeal = staged(hash.statusHeal, 2);
      this.statusCrit = hash.statusCrit ?? [];
      this.statusReset = hash.statusReset ?? [];
      this.statusFocus = hash.statusFocus ?? [];
    }
  }

  /** z_move? */
  isZMove(): boolean { return this.zmove !== null; }
  /** ultra? */
  isUltra(): boolean { return this.ultra !== null; }
  /** max_move? */
  isMaxMove(): boolean { return this.maxmove !== null; }
  /** generic? */
  generic(): boolean { return Type.exists(this.id); }
  /** exclusive? */
  exclusive(): boolean { return this.species.length > 0; }
  /** gmax? */
  gmax(): boolean { return this._gmax; }

  static getCount(mode: number | string = 0): number {
    let num = 0;
    for (const pm of PowerMove.each()) {
      if (mode === 1 || mode === "Z-Move") { if (pm.isZMove()) num += 1; }
      else if (mode === 2 || mode === "Max Move") { if (pm.isMaxMove()) num += 1; }
      else num += 1;
    }
    return num;
  }

  /** species_list(mode): species with exclusive power moves (mode "Z-Move", "Ultra" or "G-Max"). */
  static speciesList(mode: number | string = 0): (Id | null)[] {
    const list: (Id | null)[] = [];
    for (const pm of PowerMove.each()) {
      if (!pm.exclusive()) continue;
      if ((mode === 1 || mode === "Z-Move") && !pm.isZMove()) continue;
      if ((mode === 2 || mode === "Ultra") && !pm.isUltra()) continue;
      if ((mode === 3 || mode === "G-Max") && !pm.gmax()) continue;
      list.push(...pm.species);
    }
    return list;
  }

  /** compat?(mode, *params) */
  static compat(mode: number | string, ...params: unknown[]): boolean {
    switch (mode) {
      case 0: case "Z-Move": return PowerMove.zmoveFrom(params[0] as MoveParam, params[1] as Id | null, params[2] as Id) !== null;
      case 1: case "Ultra": return PowerMove.ultraFrom(params[0] as Id | null, params[1] as Id) !== null;
      case 2: case "Max Move": return PowerMove.maxmoveFrom(params[0] as MoveParam, params[1] as Id, params[2] as boolean | undefined) !== null;
    }
    return false;
  }

  static zmoveFrom(param: MoveParam, item: Id | null, species: Id): Id | null {
    let ret: Id | null = null;
    for (const pm of PowerMove.each()) {
      if (!pm.isZMove()) continue;
      if (pm.exclusive() && !pm.species.includes(species)) continue;
      if (item === pm.item || item == null) {
        if (Array.isArray(param)) {
          for (const move of param) if (move.id === pm.move || move.type === pm.type) ret = pm.zmove;
        } else if (typeof param === "object" && isBattlePowerMove(param)) {
          if (param.id === pm.zmove) ret = pm.zmove;
        } else if (typeof param === "object") {
          if (param.id === pm.move || param.id === pm.zmove || param.type === pm.type) ret = pm.zmove;
        } else if (Move.exists(param)) {
          if (param === pm.move || param === pm.zmove) ret = pm.zmove;
          if (Move.get(param).type === pm.type) ret = pm.zmove;
        } else if (Type.exists(param)) {
          if (param === pm.type) ret = pm.zmove;
        }
      }
    }
    return ret;
  }

  static ultraFrom(item: Id | null, species: Id): number | null {
    let ret: number | null = null;
    for (const pm of PowerMove.each()) {
      if (!pm.isUltra()) continue;
      if (!pm.species.includes(species)) continue;
      if (item === pm.item) ret = pm.ultra;
    }
    return ret;
  }

  static maxmoveFrom(param: MoveParam, species: Id, gmax = false): Id | null {
    let ret: Id | null = null;
    for (const pm of PowerMove.each()) {
      if (!pm.isMaxMove()) continue;
      if (pm.exclusive() && (!pm.species.includes(species) || !gmax)) continue;
      if (Array.isArray(param)) {
        for (const move of param) if (move.type === pm.type) ret = pm.maxmove;
      } else if (typeof param === "object" && isBattlePowerMove(param)) {
        if (param.id === pm.maxmove) ret = pm.maxmove;
      } else if (typeof param === "object") {
        if (param.type === pm.type) ret = pm.maxmove;
      } else if (Move.exists(param)) {
        if (Move.get(param).type === pm.type) ret = pm.maxmove;
      } else if (Type.exists(param)) {
        if (param === pm.type) ret = pm.maxmove;
      }
    }
    return ret;
  }

  private static zstatus(): PowerMove {
    return PowerMove.get("ZSTATUS");
  }

  /** stat_booster?(move) */
  static statBooster(move: Id): boolean {
    const data = PowerMove.zstatus();
    for (const s of [data.statusAtk, data.statusDef, data.statusSpatk, data.statusSpdef, data.statusSpeed,
      data.statusAcc, data.statusEva, data.statusOmni]) {
      for (const key of Object.keys(s!)) if (s![key]!.includes(move)) return true;
    }
    return false;
  }

  /** stat_with_stage(move): [stats, stage], or null. */
  static statWithStage(move: Id): [Id[], number] | null {
    if (!PowerMove.statBooster(move)) return null;
    const data = PowerMove.zstatus();
    for (let stage = 1; stage <= 3; stage++) {
      const k = String(stage);
      let stats: Id[] | null = null;
      if (data.statusAtk![k]!.includes(move)) stats = ["ATTACK"];
      else if (data.statusDef![k]!.includes(move)) stats = ["DEFENSE"];
      else if (data.statusSpatk![k]!.includes(move)) stats = ["SPECIAL_ATTACK"];
      else if (data.statusSpdef![k]!.includes(move)) stats = ["SPECIAL_DEFENSE"];
      else if (data.statusSpeed![k]!.includes(move)) stats = ["SPEED"];
      else if (data.statusAcc![k]!.includes(move)) stats = ["ACCURACY"];
      else if (data.statusEva![k]!.includes(move)) stats = ["EVASION"];
      else if (data.statusOmni![k]!.includes(move)) stats = ["ATTACK", "DEFENSE", "SPECIAL_ATTACK", "SPECIAL_DEFENSE", "SPEED"];
      if (stats) return [stats, stage];
    }
    return null;
  }

  static healsSelf(move: Id): boolean { return PowerMove.zstatus().statusHeal!["1"]!.includes(move); }
  static healsSwitch(move: Id): boolean { return PowerMove.zstatus().statusHeal!["2"]!.includes(move); }
  static boostsCrit(move: Id): boolean { return PowerMove.zstatus().statusCrit!.includes(move); }
  static resetsStats(move: Id): boolean { return PowerMove.zstatus().statusReset!.includes(move); }
  static focusUser(move: Id): boolean { return PowerMove.zstatus().statusFocus!.includes(move); }
}
