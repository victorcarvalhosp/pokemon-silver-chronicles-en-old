// Port of Data/Scripts/010_Data/001_Hardcoded data/016_BattleTerrain.rb.

import { type Id, SymbolData } from "./gameData";

export class BattleTerrain extends SymbolData {
  static DATA = new Map<Id, BattleTerrain>();
  readonly id: Id;
  readonly realName: string;
  readonly animation: string | null;

  constructor(hash: { id: Id; name?: string; animation?: string | null }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.animation = hash.animation ?? null;
  }

  get name(): string { return this.realName; }
}

BattleTerrain.register({id: "None", name: "None", animation: null});
BattleTerrain.register({id: "Electric", name: "Electric", animation: "ElectricTerrain"});
BattleTerrain.register({id: "Grassy", name: "Grassy", animation: "GrassyTerrain"});
BattleTerrain.register({id: "Misty", name: "Misty", animation: "MistyTerrain"});
BattleTerrain.register({id: "Psychic", name: "Psychic", animation: "PsychicTerrain"});
