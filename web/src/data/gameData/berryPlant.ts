// Port of Data/Scripts/010_Data/002_PBS data/007_BerryPlant.rb.

import type { BerryPlantData } from "../pbs/types";
import { type Id, SymbolData } from "./gameData";

export class BerryPlant extends SymbolData {
  static DATA = new Map<Id, BerryPlant>();
  static readonly NUMBER_OF_REPLANTS = 9;
  static readonly NUMBER_OF_GROWTH_STAGES = 4;
  static readonly NUMBER_OF_FULLY_GROWN_STAGES = 4;
  static readonly WATERING_CANS = ["SPRAYDUCK", "SQUIRTBOTTLE", "WAILMERPAIL", "SPRINKLOTAD"];

  readonly id: Id;
  readonly hoursPerStage: number;
  readonly dryingPerHour: number;
  readonly yield: [number, number];

  constructor(hash: Partial<BerryPlantData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.hoursPerStage = hash.hoursPerStage ?? 3;
    this.dryingPerHour = hash.dryingPerHour ?? 15;
    this.yield = hash.yield ? [...hash.yield] : [2, 5];
    if (this.yield[1] < this.yield[0]) this.yield.reverse();
  }

  minimumYield(): number { return this.yield[0]; }
  maximumYield(): number { return this.yield[1]; }
}
