// Port of Data/Scripts/010_Data/001_Hardcoded data/013_EncounterType.rb.

import { type Id, SymbolData } from "./gameData";

export type EncounterTypeKind = "land" | "cave" | "water" | "fishing" | "contest" | "none";

export class EncounterType extends SymbolData {
  static DATA = new Map<Id, EncounterType>();
  readonly id: Id;
  readonly realName: string;
  readonly type: EncounterTypeKind;
  readonly triggerChance: number;

  constructor(hash: { id: Id; type?: EncounterTypeKind; triggerChance?: number }) {
    super();
    this.id = hash.id;
    this.realName = hash.id;
    this.type = hash.type ?? "none";
    this.triggerChance = hash.triggerChance ?? 0;
  }

  get name(): string { return this.realName; }
}

EncounterType.register({id: "Land", type: "land", triggerChance: 21});
EncounterType.register({id: "LandDay", type: "land", triggerChance: 21});
EncounterType.register({id: "LandNight", type: "land", triggerChance: 21});
EncounterType.register({id: "LandMorning", type: "land", triggerChance: 21});
EncounterType.register({id: "LandAfternoon", type: "land", triggerChance: 21});
EncounterType.register({id: "LandEvening", type: "land", triggerChance: 21});
EncounterType.register({id: "TallGrass", type: "land", triggerChance: 21});
EncounterType.register({id: "Cave", type: "cave", triggerChance: 5});
EncounterType.register({id: "CaveDay", type: "cave", triggerChance: 5});
EncounterType.register({id: "CaveNight", type: "cave", triggerChance: 5});
EncounterType.register({id: "CaveMorning", type: "cave", triggerChance: 5});
EncounterType.register({id: "CaveAfternoon", type: "cave", triggerChance: 5});
EncounterType.register({id: "CaveEvening", type: "cave", triggerChance: 5});
EncounterType.register({id: "Water", type: "water", triggerChance: 2});
EncounterType.register({id: "WaterDay", type: "water", triggerChance: 2});
EncounterType.register({id: "WaterNight", type: "water", triggerChance: 2});
EncounterType.register({id: "WaterMorning", type: "water", triggerChance: 2});
EncounterType.register({id: "WaterAfternoon", type: "water", triggerChance: 2});
EncounterType.register({id: "WaterEvening", type: "water", triggerChance: 2});
EncounterType.register({id: "OldRod", type: "fishing", triggerChance: 0});
EncounterType.register({id: "GoodRod", type: "fishing", triggerChance: 0});
EncounterType.register({id: "SuperRod", type: "fishing", triggerChance: 0});
EncounterType.register({id: "RockSmash", type: "none", triggerChance: 50});
EncounterType.register({id: "HeadbuttLow", type: "none", triggerChance: 0});
EncounterType.register({id: "HeadbuttHigh", type: "none", triggerChance: 0});
EncounterType.register({id: "BugContest", type: "contest", triggerChance: 21});
