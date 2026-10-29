// Port of Data/Scripts/010_Data/001_Hardcoded data/006_Habitat.rb (+ Essentials Deluxe's UltraSpace).

import { type Id, SymbolData } from "./gameData";

export class Habitat extends SymbolData {
  static DATA = new Map<Id, Habitat>();
  readonly id: Id;
  readonly realName: string;

  constructor(hash: { id: Id; name?: string }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
  }

  get name(): string { return this.realName; }
}

Habitat.register({id: "None", name: "None"});
Habitat.register({id: "Grassland", name: "Grassland"});
Habitat.register({id: "Forest", name: "Forest"});
Habitat.register({id: "WatersEdge", name: "Water's Edge"});
Habitat.register({id: "Sea", name: "Sea"});
Habitat.register({id: "Cave", name: "Cave"});
Habitat.register({id: "Mountain", name: "Mountain"});
Habitat.register({id: "RoughTerrain", name: "Rough Terrain"});
Habitat.register({id: "Urban", name: "Urban"});
Habitat.register({id: "Rare", name: "Rare"});
Habitat.register({id: "UltraSpace", name: "Ultra Space"});
