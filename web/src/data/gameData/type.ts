// Port of Data/Scripts/010_Data/002_PBS data/003_Type.rb (GameData::Type and Effectiveness).

import type { TypeData } from "../pbs/types";
import { type Id, SymbolData, hasFlag } from "./gameData";
import { MessageTypes, pbGetMessageFromHash } from "../../core/intl";

export class Type extends SymbolData {
  static DATA = new Map<Id, Type>();
  readonly id: Id;
  readonly realName: string;
  readonly specialType: boolean;
  readonly pseudoType: boolean;
  readonly flags: string[];
  readonly weaknesses: Id[];
  readonly resistances: Id[];
  readonly immunities: Id[];
  /** Where this type's icon is within types.png. */
  readonly iconPosition: number;

  constructor(hash: Partial<TypeData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.specialType = hash.specialType ?? false;
    this.pseudoType = hash.pseudoType ?? false;
    this.flags = hash.flags ?? [];
    this.weaknesses = toArray(hash.weaknesses);
    this.resistances = toArray(hash.resistances);
    this.immunities = toArray(hash.immunities);
    this.iconPosition = hash.iconPosition ?? 0;
  }

  get name(): string { return pbGetMessageFromHash(MessageTypes.Types, this.realName); }

  /** physical? */
  physical(): boolean { return !this.specialType; }
  /** special? */
  special(): boolean { return this.specialType; }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }

  /** How effective an attack of other_type is against this type (an Effectiveness value). */
  effectiveness(otherType: Id | null | undefined): number {
    if (!otherType) return Effectiveness.NORMAL_EFFECTIVE_ONE;
    if (this.weaknesses.includes(otherType)) return Effectiveness.SUPER_EFFECTIVE_ONE;
    if (this.resistances.includes(otherType)) return Effectiveness.NOT_VERY_EFFECTIVE_ONE;
    if (this.immunities.includes(otherType)) return Effectiveness.INEFFECTIVE;
    return Effectiveness.NORMAL_EFFECTIVE_ONE;
  }
}

function toArray(v: Id[] | Id | null | undefined): Id[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

type T = Id | null | undefined;

export const Effectiveness = {
  INEFFECTIVE: 0,
  NOT_VERY_EFFECTIVE_ONE: 1,
  NORMAL_EFFECTIVE_ONE: 2,
  SUPER_EFFECTIVE_ONE: 4,
  NORMAL_EFFECTIVE: 2 ** 3,

  /** ineffective? */
  ineffective(value: number): boolean { return value === Effectiveness.INEFFECTIVE; },
  /** not_very_effective? */
  notVeryEffective(value: number): boolean { return value > Effectiveness.INEFFECTIVE && value < Effectiveness.NORMAL_EFFECTIVE; },
  /** resistant? */
  resistant(value: number): boolean { return value < Effectiveness.NORMAL_EFFECTIVE; },
  /** normal? */
  normal(value: number): boolean { return value === Effectiveness.NORMAL_EFFECTIVE; },
  /** super_effective? */
  superEffective(value: number): boolean { return value > Effectiveness.NORMAL_EFFECTIVE; },

  ineffectiveType(attackType: Id, d1: T, d2: T = null, d3: T = null): boolean {
    return Effectiveness.ineffective(Effectiveness.calculate(attackType, d1, d2, d3));
  },
  notVeryEffectiveType(attackType: Id, d1: T, d2: T = null, d3: T = null): boolean {
    return Effectiveness.notVeryEffective(Effectiveness.calculate(attackType, d1, d2, d3));
  },
  resistantType(attackType: Id, d1: T, d2: T = null, d3: T = null): boolean {
    return Effectiveness.resistant(Effectiveness.calculate(attackType, d1, d2, d3));
  },
  normalType(attackType: Id, d1: T, d2: T = null, d3: T = null): boolean {
    return Effectiveness.normal(Effectiveness.calculate(attackType, d1, d2, d3));
  },
  superEffectiveType(attackType: Id, d1: T, d2: T = null, d3: T = null): boolean {
    return Effectiveness.superEffective(Effectiveness.calculate(attackType, d1, d2, d3));
  },

  calculateOne(attackType: Id, defendType: Id): number {
    return Type.get(defendType).effectiveness(attackType);
  },

  /** Product of the per-type multipliers (NORMAL_EFFECTIVE = 8 means 1x). */
  calculate(attackType: Id, defendType1: T, defendType2: T = null, defendType3: T = null): number {
    const mod1 = defendType1 ? Effectiveness.calculateOne(attackType, defendType1) : Effectiveness.NORMAL_EFFECTIVE_ONE;
    let mod2 = Effectiveness.NORMAL_EFFECTIVE_ONE;
    let mod3 = Effectiveness.NORMAL_EFFECTIVE_ONE;
    if (defendType2 && defendType1 !== defendType2) mod2 = Effectiveness.calculateOne(attackType, defendType2);
    if (defendType3 && defendType1 !== defendType3 && defendType2 !== defendType3) {
      mod3 = Effectiveness.calculateOne(attackType, defendType3);
    }
    return mod1 * mod2 * mod3;
  },
};
