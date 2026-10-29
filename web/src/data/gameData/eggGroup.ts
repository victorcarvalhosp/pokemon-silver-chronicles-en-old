// Port of Data/Scripts/010_Data/001_Hardcoded data/003_EggGroup.rb.

import { type Id, SymbolData } from "./gameData";

export class EggGroup extends SymbolData {
  static DATA = new Map<Id, EggGroup>();
  readonly id: Id;
  readonly realName: string;

  constructor(hash: { id: Id; name?: string }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
  }

  get name(): string { return this.realName; }
}

EggGroup.register({id: "Undiscovered", name: "Undiscovered"});
EggGroup.register({id: "Monster", name: "Monster"});
EggGroup.register({id: "Water1", name: "Water 1"});
EggGroup.register({id: "Bug", name: "Bug"});
EggGroup.register({id: "Flying", name: "Flying"});
EggGroup.register({id: "Field", name: "Field"});
EggGroup.register({id: "Fairy", name: "Fairy"});
EggGroup.register({id: "Grass", name: "Grass"});
EggGroup.register({id: "Humanlike", name: "Humanlike"});
EggGroup.register({id: "Water3", name: "Water 3"});
EggGroup.register({id: "Mineral", name: "Mineral"});
EggGroup.register({id: "Amorphous", name: "Amorphous"});
EggGroup.register({id: "Water2", name: "Water 2"});
EggGroup.register({id: "Ditto", name: "Ditto"});
EggGroup.register({id: "Dragon", name: "Dragon"});
