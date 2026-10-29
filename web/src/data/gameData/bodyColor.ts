// Port of Data/Scripts/010_Data/001_Hardcoded data/005_BodyColor.rb.

import { type Id, SymbolData } from "./gameData";

export class BodyColor extends SymbolData {
  static DATA = new Map<Id, BodyColor>();
  readonly id: Id;
  readonly realName: string;

  constructor(hash: { id: Id; name?: string }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
  }

  get name(): string { return this.realName; }
}

BodyColor.register({id: "Red", name: "Red"});
BodyColor.register({id: "Blue", name: "Blue"});
BodyColor.register({id: "Yellow", name: "Yellow"});
BodyColor.register({id: "Green", name: "Green"});
BodyColor.register({id: "Black", name: "Black"});
BodyColor.register({id: "Brown", name: "Brown"});
BodyColor.register({id: "Purple", name: "Purple"});
BodyColor.register({id: "Gray", name: "Gray"});
BodyColor.register({id: "White", name: "White"});
BodyColor.register({id: "Pink", name: "Pink"});
