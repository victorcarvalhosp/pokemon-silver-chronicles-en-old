// Port of Data/Scripts/010_Data/002_PBS data/012_Ribbon.rb.

import type { RibbonData } from "../pbs/types";
import { type Id, SymbolData, hasFlag } from "./gameData";

export class Ribbon extends SymbolData {
  static DATA = new Map<Id, Ribbon>();
  readonly id: Id;
  readonly realName: string;
  /** Where this ribbon's graphic is within ribbons.png. */
  readonly iconPosition: number;
  readonly realDescription: string;
  readonly flags: string[];

  constructor(hash: Partial<RibbonData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.iconPosition = hash.iconPosition ?? 0;
    this.realDescription = hash.description ?? "???";
    this.flags = hash.flags ?? [];
  }

  get name(): string { return this.realName; }
  get description(): string { return this.realDescription; }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }
}
