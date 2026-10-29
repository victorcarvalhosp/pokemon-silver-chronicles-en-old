// Port of Data/Scripts/010_Data/001_Hardcoded data/009_Nature.rb.

import { type Id, SymbolData } from "./gameData";

export class Nature extends SymbolData {
  static DATA = new Map<Id, Nature>();
  readonly id: Id;
  readonly realName: string;
  /** [stat ID, change] pairs. */
  readonly statChanges: [Id, number][];

  constructor(hash: { id: Id; name?: string; statChanges?: [Id, number][] }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.statChanges = hash.statChanges ?? [];
  }

  get name(): string { return this.realName; }
}

Nature.register({id: "HARDY", name: "Hardy", statChanges: []});
Nature.register({id: "LONELY", name: "Lonely", statChanges: [["ATTACK", 10], ["DEFENSE", -10]]});
Nature.register({id: "BRAVE", name: "Brave", statChanges: [["ATTACK", 10], ["SPEED", -10]]});
Nature.register({id: "ADAMANT", name: "Adamant", statChanges: [["ATTACK", 10], ["SPECIAL_ATTACK", -10]]});
Nature.register({id: "NAUGHTY", name: "Naughty", statChanges: [["ATTACK", 10], ["SPECIAL_DEFENSE", -10]]});
Nature.register({id: "BOLD", name: "Bold", statChanges: [["DEFENSE", 10], ["ATTACK", -10]]});
Nature.register({id: "DOCILE", name: "Docile", statChanges: []});
Nature.register({id: "RELAXED", name: "Relaxed", statChanges: [["DEFENSE", 10], ["SPEED", -10]]});
Nature.register({id: "IMPISH", name: "Impish", statChanges: [["DEFENSE", 10], ["SPECIAL_ATTACK", -10]]});
Nature.register({id: "LAX", name: "Lax", statChanges: [["DEFENSE", 10], ["SPECIAL_DEFENSE", -10]]});
Nature.register({id: "TIMID", name: "Timid", statChanges: [["SPEED", 10], ["ATTACK", -10]]});
Nature.register({id: "HASTY", name: "Hasty", statChanges: [["SPEED", 10], ["DEFENSE", -10]]});
Nature.register({id: "SERIOUS", name: "Serious", statChanges: []});
Nature.register({id: "JOLLY", name: "Jolly", statChanges: [["SPEED", 10], ["SPECIAL_ATTACK", -10]]});
Nature.register({id: "NAIVE", name: "Naive", statChanges: [["SPEED", 10], ["SPECIAL_DEFENSE", -10]]});
Nature.register({id: "MODEST", name: "Modest", statChanges: [["SPECIAL_ATTACK", 10], ["ATTACK", -10]]});
Nature.register({id: "MILD", name: "Mild", statChanges: [["SPECIAL_ATTACK", 10], ["DEFENSE", -10]]});
Nature.register({id: "QUIET", name: "Quiet", statChanges: [["SPECIAL_ATTACK", 10], ["SPEED", -10]]});
Nature.register({id: "BASHFUL", name: "Bashful", statChanges: []});
Nature.register({id: "RASH", name: "Rash", statChanges: [["SPECIAL_ATTACK", 10], ["SPECIAL_DEFENSE", -10]]});
Nature.register({id: "CALM", name: "Calm", statChanges: [["SPECIAL_DEFENSE", 10], ["ATTACK", -10]]});
Nature.register({id: "GENTLE", name: "Gentle", statChanges: [["SPECIAL_DEFENSE", 10], ["DEFENSE", -10]]});
Nature.register({id: "SASSY", name: "Sassy", statChanges: [["SPECIAL_DEFENSE", 10], ["SPEED", -10]]});
Nature.register({id: "CAREFUL", name: "Careful", statChanges: [["SPECIAL_DEFENSE", 10], ["SPECIAL_ATTACK", -10]]});
Nature.register({id: "QUIRKY", name: "Quirky", statChanges: []});
