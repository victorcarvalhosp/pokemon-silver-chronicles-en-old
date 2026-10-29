// Port of Data/Scripts/010_Data/002_PBS data/004_Ability.rb.

import type { AbilityData } from "../pbs/types";
import { type Id, SymbolData, hasFlag } from "./gameData";

export class Ability extends SymbolData {
  static DATA = new Map<Id, Ability>();
  readonly id: Id;
  // attr_accessor in Essentials Deluxe's Compiler patch (plugin compilers rewrite them).
  realName: string;
  realDescription: string;
  flags: string[];

  constructor(hash: Partial<AbilityData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.realDescription = hash.description ?? "???";
    this.flags = hash.flags ?? [];
  }

  get name(): string { return this.realName; }
  get description(): string { return this.realDescription; }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }
}
