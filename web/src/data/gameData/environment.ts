// Port of Data/Scripts/010_Data/001_Hardcoded data/014_Environment.rb.

import { type Id, SymbolData } from "./gameData";

export class Environment extends SymbolData {
  static DATA = new Map<Id, Environment>();
  readonly id: Id;
  readonly realName: string;
  readonly battleBase: string | null;

  constructor(hash: { id: Id; name?: string; battleBase?: string | null }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.battleBase = hash.battleBase ?? null;
  }

  get name(): string { return this.realName; }
}

Environment.register({id: "None", name: "None", battleBase: null});
Environment.register({id: "Grass", name: "Grass", battleBase: "grass"});
Environment.register({id: "TallGrass", name: "Tall grass", battleBase: "grass"});
Environment.register({id: "MovingWater", name: "Moving water", battleBase: "water"});
Environment.register({id: "StillWater", name: "Still water", battleBase: "water"});
Environment.register({id: "Puddle", name: "Puddle", battleBase: null});
Environment.register({id: "Underwater", name: "Underwater", battleBase: null});
Environment.register({id: "Cave", name: "Cave", battleBase: null});
Environment.register({id: "Rock", name: "Rock", battleBase: null});
Environment.register({id: "Sand", name: "Sand", battleBase: "sand"});
Environment.register({id: "Forest", name: "Forest", battleBase: null});
Environment.register({id: "ForestGrass", name: "Forest grass", battleBase: "grass"});
Environment.register({id: "Snow", name: "Snow", battleBase: null});
Environment.register({id: "Ice", name: "Ice", battleBase: "ice"});
Environment.register({id: "Volcano", name: "Volcano", battleBase: null});
Environment.register({id: "Graveyard", name: "Graveyard", battleBase: null});
Environment.register({id: "Sky", name: "Sky", battleBase: null});
Environment.register({id: "Space", name: "Space", battleBase: null});
Environment.register({id: "UltraSpace", name: "Ultra Space", battleBase: null});
