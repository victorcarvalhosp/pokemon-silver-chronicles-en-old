// Port of Data/Scripts/010_Data/001_Hardcoded data/010_Status.rb (+ Generation 9 Pack's DROWSY and FROSTBITE).

import { type Id, SymbolData } from "./gameData";

export class Status extends SymbolData {
  static DATA = new Map<Id, Status>();
  readonly id: Id;
  readonly realName: string;
  readonly animation: string | null;
  /** Where this status's icon is within statuses.png. */
  readonly iconPosition: number;

  constructor(hash: { id: Id; name?: string; animation?: string | null; iconPosition?: number }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.animation = hash.animation ?? null;
    this.iconPosition = hash.iconPosition ?? 0;
  }

  get name(): string { return this.realName; }
}

Status.register({id: "NONE", name: "None", animation: null, iconPosition: 0});
Status.register({id: "SLEEP", name: "Sleep", animation: "Sleep", iconPosition: 0});
Status.register({id: "POISON", name: "Poison", animation: "Poison", iconPosition: 1});
Status.register({id: "BURN", name: "Burn", animation: "Burn", iconPosition: 2});
Status.register({id: "PARALYSIS", name: "Paralysis", animation: "Paralysis", iconPosition: 3});
Status.register({id: "FROZEN", name: "Frozen", animation: "Frozen", iconPosition: 4});
Status.register({id: "DROWSY", name: "Drowsy", animation: "Drowsy", iconPosition: 5});
Status.register({id: "FROSTBITE", name: "Frostbite", animation: "Frostbite", iconPosition: 6});
