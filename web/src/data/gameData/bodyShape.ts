// Port of Data/Scripts/010_Data/001_Hardcoded data/004_BodyShape.rb.

import { type Id, SymbolData } from "./gameData";

export class BodyShape extends SymbolData {
  static DATA = new Map<Id, BodyShape>();
  readonly id: Id;
  readonly realName: string;
  /** Where this shape's icon is within icon_shapes.png. */
  readonly iconPosition: number;

  constructor(hash: { id: Id; name?: string; iconPosition?: number }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.iconPosition = hash.iconPosition ?? 0;
  }

  get name(): string { return this.realName; }
}

BodyShape.register({id: "Head", name: "Head", iconPosition: 0});
BodyShape.register({id: "Serpentine", name: "Serpentine", iconPosition: 1});
BodyShape.register({id: "Finned", name: "Finned", iconPosition: 2});
BodyShape.register({id: "HeadArms", name: "Head and arms", iconPosition: 3});
BodyShape.register({id: "HeadBase", name: "Head and base", iconPosition: 4});
BodyShape.register({id: "BipedalTail", name: "Bipedal with tail", iconPosition: 5});
BodyShape.register({id: "HeadLegs", name: "Head and legs", iconPosition: 6});
BodyShape.register({id: "Quadruped", name: "Quadruped", iconPosition: 7});
BodyShape.register({id: "Winged", name: "Winged", iconPosition: 8});
BodyShape.register({id: "Multiped", name: "Multiped", iconPosition: 9});
BodyShape.register({id: "MultiBody", name: "Multi Body", iconPosition: 10});
BodyShape.register({id: "Bipedal", name: "Bipedal", iconPosition: 11});
BodyShape.register({id: "MultiWinged", name: "Multi Winged", iconPosition: 12});
BodyShape.register({id: "Insectoid", name: "Insectoid", iconPosition: 13});
