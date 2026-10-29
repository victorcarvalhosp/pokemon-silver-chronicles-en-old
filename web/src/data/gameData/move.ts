// Port of Data/Scripts/010_Data/002_PBS data/005_Move.rb
// (+ ZUD Mechanics' zMove?/maxMove?/powerMove? and its name override).
//
// convert_move_data (old function code renames) runs in the PBS compiler, so
// moves.json already has the converted codes. display_type/display_damage
// have their per-function-code cases commented out in v20.1 (=begin/=end), so
// they return the plain type/power, as here.

import type { MoveCategory, MoveData } from "../pbs/types";
import { type Id, SymbolData, hasFlag } from "./gameData";
import { Item } from "./item";
import { Settings } from "./settings";
import { Type } from "./type";

export class Move extends SymbolData {
  static DATA = new Map<Id, Move>();
  readonly id: Id;
  // attr_accessor in Essentials Deluxe's Compiler patch.
  realName: string;
  type: Id;
  category: MoveCategory;
  baseDamage: number;
  accuracy: number;
  totalPp: number;
  target: Id;
  priority: number;
  functionCode: string;
  flags: string[];
  effectChance: number;
  realDescription: string;

  constructor(hash: Partial<MoveData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.type = hash.type ?? "NONE";
    this.category = hash.category ?? 2;
    this.baseDamage = hash.baseDamage ?? 0;
    this.accuracy = hash.accuracy ?? 100;
    this.totalPp = hash.totalPp ?? 5;
    this.target = hash.target ?? "None";
    this.priority = hash.priority ?? 0;
    this.functionCode = hash.functionCode ?? "None";
    const flags = hash.flags ?? [];
    this.flags = Array.isArray(flags) ? flags : [flags];
    this.effectChance = hash.effectChance ?? 0;
    this.realDescription = hash.description ?? "???";
  }

  /** ZUD: "_" in a move name stands for "," (e.g. G-Max moves). */
  get name(): string { return this.realName.replaceAll("_", ","); }
  get description(): string { return this.realDescription; }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }

  /** physical? */
  physical(): boolean {
    if (this.baseDamage === 0) return false;
    if (Settings.MOVE_CATEGORY_PER_MOVE) return this.category === 0;
    return Type.get(this.type).physical();
  }

  /** special? */
  special(): boolean {
    if (this.baseDamage === 0) return false;
    if (Settings.MOVE_CATEGORY_PER_MOVE) return this.category === 1;
    return Type.get(this.type).special();
  }

  /** hidden_move?: taught by an HM. */
  hiddenMove(): boolean {
    for (const i of Item.each()) if (i.isHM() && i.move === this.id) return true;
    return false;
  }

  displayType(_pkmn?: unknown, _move?: unknown): Id { return this.type; }
  displayDamage(_pkmn?: unknown, _move?: unknown): number { return this.baseDamage; }
  displayCategory(_pkmn?: unknown, _move?: unknown): MoveCategory { return this.category; }
  displayAccuracy(_pkmn?: unknown, _move?: unknown): number { return this.accuracy; }

  // ZUD Mechanics ([001] Data/Data_PowerMove.rb)
  /** zMove? */
  zMove(): boolean { return this.flags.some((f) => /^ZMove$/i.test(f)); }
  /** maxMove? */
  maxMove(): boolean { return this.flags.some((f) => /^MaxMove$/i.test(f)); }
  /** powerMove? */
  powerMove(): boolean { return this.zMove() || this.maxMove(); }
}
