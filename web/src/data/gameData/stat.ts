// Port of Data/Scripts/010_Data/001_Hardcoded data/008_Stat.rb.

import { type Id, SymbolData } from "./gameData";

export type StatType = "main" | "main_battle" | "battle" | "none";

export class Stat extends SymbolData {
  static DATA = new Map<Id, Stat>();
  readonly id: Id;
  readonly realName: string;
  readonly realNameBrief: string;
  readonly type: StatType;
  readonly pbsOrder: number;

  /** each_main: HP, Attack, Defense, Sp. Atk, Sp. Def, Speed. */
  static eachMain(): Stat[] { return Stat.each().filter((s) => s.type === "main" || s.type === "main_battle"); }
  /** each_main_battle */
  static eachMainBattle(): Stat[] { return Stat.each().filter((s) => s.type === "main_battle"); }
  /** each_battle */
  static eachBattle(): Stat[] { return Stat.each().filter((s) => s.type === "main_battle" || s.type === "battle"); }

  constructor(hash: { id: Id; name?: string; nameBrief?: string; type?: StatType; pbsOrder?: number | null }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.realNameBrief = hash.nameBrief ?? "None";
    this.type = hash.type ?? "none";
    this.pbsOrder = hash.pbsOrder ?? -1;
  }

  get name(): string { return this.realName; }
  get nameBrief(): string { return this.realNameBrief; }
}

Stat.register({id: "HP", name: "HP", nameBrief: "HP", type: "main", pbsOrder: 0});
Stat.register({id: "ATTACK", name: "Attack", nameBrief: "Atk", type: "main_battle", pbsOrder: 1});
Stat.register({id: "DEFENSE", name: "Defense", nameBrief: "Def", type: "main_battle", pbsOrder: 2});
Stat.register({id: "SPECIAL_ATTACK", name: "Special Attack", nameBrief: "SpAtk", type: "main_battle", pbsOrder: 4});
Stat.register({id: "SPECIAL_DEFENSE", name: "Special Defense", nameBrief: "SpDef", type: "main_battle", pbsOrder: 5});
Stat.register({id: "SPEED", name: "Speed", nameBrief: "Spd", type: "main_battle", pbsOrder: 3});
Stat.register({id: "ACCURACY", name: "accuracy", nameBrief: "Acc", type: "battle", pbsOrder: -1});
Stat.register({id: "EVASION", name: "evasiveness", nameBrief: "Eva", type: "battle", pbsOrder: -1});
