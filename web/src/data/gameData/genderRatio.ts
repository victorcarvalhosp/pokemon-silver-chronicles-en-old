// Port of Data/Scripts/010_Data/001_Hardcoded data/002_GenderRatio.rb.

import { type Id, SymbolData } from "./gameData";

export class GenderRatio extends SymbolData {
  static DATA = new Map<Id, GenderRatio>();
  readonly id: Id;
  readonly realName: string;
  readonly femaleChance: number | null;

  constructor(hash: { id: Id; name?: string; femaleChance?: number | null }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.femaleChance = hash.femaleChance ?? null;
  }

  get name(): string { return this.realName; }

  /** single_gendered? */
  singleGendered(): boolean { return this.femaleChance === null; }
}

GenderRatio.register({id: "AlwaysMale", name: "Always Male", femaleChance: null});
GenderRatio.register({id: "AlwaysFemale", name: "Always Female", femaleChance: null});
GenderRatio.register({id: "Genderless", name: "Genderless", femaleChance: null});
GenderRatio.register({id: "FemaleOneEighth", name: "Female One Eighth", femaleChance: 32});
GenderRatio.register({id: "Female25Percent", name: "Female 25 Percent", femaleChance: 64});
GenderRatio.register({id: "Female50Percent", name: "Female 50 Percent", femaleChance: 128});
GenderRatio.register({id: "Female75Percent", name: "Female 75 Percent", femaleChance: 192});
GenderRatio.register({id: "FemaleSevenEighths", name: "Female Seven Eighths", femaleChance: 224});
