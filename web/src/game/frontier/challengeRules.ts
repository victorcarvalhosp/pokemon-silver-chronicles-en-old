// Port of 018_Alternate battle modes/002_Battle Frontier rules/001_Challenge_ChallengeRules.rb:
// PokemonChallengeRules (a ruleset plus the battle type, level adjustment and
// battle rules of a challenge) and the Stadium Cup / Battle Frontier rules.

import type { Battle } from "../../battle/battle/Battle";
import { GrowthRate } from "../../data/gameData/growthRate";
import type { Pokemon } from "../pokemon/Pokemon";
import {
  type BattleRule, DoubleBattle, FreezeClause, EvasionClause, OHKOClause, PerishSongClause, SelfdestructClause,
  SelfKOClause, SingleBattle, SleepClause, SonicBoomClause, SoulDewBattleClause, type RuledBattle,
} from "./battleRules";
import { BattleArena, BattlePalace, BattleTower, type BattleType, type ChallengeTrainer } from "./challengeBattles";
import {
  BabyRestriction, BannedSpeciesRestriction, HeightRestriction, ItemClause, LittleCupRestriction,
  MaximumLevelRestriction, MinimumLevelRestriction, SpeciesClause, StandardRestriction, TotalLevelRestriction,
  UnevolvedFormRestriction, WeightRestriction,
} from "./entryRestrictions";
import {
  CappedLevelAdjustment, EnemyLevelAdjustment, FixedLevelAdjustment, LevelAdjustment, type LevelAdjustments,
  OpenLevelAdjustment, TotalLevelAdjustment,
} from "./levelAdjustment";
import { type PokemonRule, PokemonRuleSet, type TeamRule } from "./rulesets";

//===============================================================================
//
//===============================================================================
export class PokemonChallengeRules {
  ruleset: PokemonRuleSet;
  battletype: BattleType;
  levelAdjustment: LevelAdjustment | null;
  protected battlerules: BattleRule[];

  constructor(ruleset: PokemonRuleSet | null = null) {
    this.ruleset = ruleset ? ruleset : new PokemonRuleSet();
    this.battletype = new BattleTower();
    this.levelAdjustment = null;
    this.battlerules = [];
  }

  copy(): PokemonChallengeRules {
    const ret = new PokemonChallengeRules(this.ruleset.copy());
    ret.setBattleType(this.battletype);
    ret.setLevelAdjustment(this.levelAdjustment);
    for (const rule of this.battlerules) ret.addBattleRule(rule);
    return ret;
  }

  /** Object#clone: a shallow copy (the ruleset and rule list are shared, as in Ruby). */
  clone(): PokemonChallengeRules {
    return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as PokemonChallengeRules, this);
  }

  setRuleset(rule: PokemonRuleSet): this {
    this.ruleset = rule;
    return this;
  }

  setBattleType(rule: BattleType): this {
    this.battletype = rule;
    return this;
  }

  setLevelAdjustment(rule: LevelAdjustment | null): this {
    this.levelAdjustment = rule;
    return this;
  }

  get number(): number {
    return this.ruleset.number;
  }

  setNumber(number: number): this {
    this.ruleset.setNumber(number);
    return this;
  }

  setDoubleBattle(value: unknown): this {
    if (value) {
      this.ruleset.setNumber(4);
      this.addBattleRule(new DoubleBattle());
    } else {
      this.ruleset.setNumber(3);
      this.addBattleRule(new SingleBattle());
    }
    return this;
  }

  adjustLevels(party1: Pokemon[], party2: Pokemon[]): LevelAdjustments | null {
    if (this.levelAdjustment) return this.levelAdjustment.adjustLevels(party1, party2);
    return null;
  }

  unadjustLevels(party1: Pokemon[], party2: Pokemon[], adjusts: LevelAdjustments | null): void {
    if (this.levelAdjustment && adjusts) this.levelAdjustment.unadjustLevels(party1, party2, adjusts);
  }

  adjustLevelsBilateral(party1: Pokemon[], party2: Pokemon[]): LevelAdjustments | null {
    if (this.levelAdjustment && this.levelAdjustment.type === LevelAdjustment.BothTeams) {
      return this.levelAdjustment.adjustLevels(party1, party2);
    }
    return null;
  }

  unadjustLevelsBilateral(party1: Pokemon[], party2: Pokemon[], adjusts: LevelAdjustments | null): void {
    if (this.levelAdjustment && adjusts && this.levelAdjustment.type === LevelAdjustment.BothTeams) {
      this.levelAdjustment.unadjustLevels(party1, party2, adjusts);
    }
  }

  addPokemonRule(rule: PokemonRule): this {
    this.ruleset.addPokemonRule(rule);
    return this;
  }

  addLevelRule(minLevel: number, maxLevel: number, totalLevel: number): this {
    this.addPokemonRule(new MinimumLevelRestriction(minLevel));
    this.addPokemonRule(new MaximumLevelRestriction(maxLevel));
    this.addSubsetRule(new TotalLevelRestriction(totalLevel));
    this.setLevelAdjustment(new TotalLevelAdjustment(minLevel, maxLevel, totalLevel));
    return this;
  }

  addSubsetRule(rule: TeamRule): this {
    this.ruleset.addSubsetRule(rule);
    return this;
  }

  addTeamRule(rule: TeamRule): this {
    this.ruleset.addTeamRule(rule);
    return this;
  }

  addBattleRule(rule: BattleRule): this {
    this.battlerules.push(rule);
    return this;
  }

  createBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    const battle = this.battletype.pbCreateBattle(scene, trainer1, trainer2);
    for (const p of this.battlerules) p.setRule(battle as unknown as RuledBattle);
    return battle;
  }
}

//===============================================================================
// Stadium Cups rules
//===============================================================================
export function pbPikaCupRules(double: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  ret.addPokemonRule(new StandardRestriction());
  ret.addLevelRule(15, 20, 50);
  ret.addTeamRule(new SpeciesClause());
  ret.addTeamRule(new ItemClause());
  ret.addBattleRule(new SleepClause());
  ret.addBattleRule(new FreezeClause());
  ret.addBattleRule(new SelfKOClause());
  ret.setDoubleBattle(double);
  ret.setNumber(3);
  return ret;
}

export function pbPokeCupRules(double: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  ret.addPokemonRule(new StandardRestriction());
  ret.addLevelRule(50, 55, 155);
  ret.addTeamRule(new SpeciesClause());
  ret.addTeamRule(new ItemClause());
  ret.addBattleRule(new SleepClause());
  ret.addBattleRule(new FreezeClause());
  ret.addBattleRule(new SelfdestructClause());
  ret.setDoubleBattle(double);
  ret.setNumber(3);
  return ret;
}

export function pbPrimeCupRules(double: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  ret.setLevelAdjustment(new OpenLevelAdjustment(GrowthRate.maxLevel()));
  ret.addTeamRule(new SpeciesClause());
  ret.addTeamRule(new ItemClause());
  ret.addBattleRule(new SleepClause());
  ret.addBattleRule(new FreezeClause());
  ret.addBattleRule(new SelfdestructClause());
  ret.setDoubleBattle(double);
  return ret;
}

export function pbFancyCupRules(double: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  ret.addPokemonRule(new StandardRestriction());
  ret.addLevelRule(25, 30, 80);
  ret.addPokemonRule(new HeightRestriction(2));
  ret.addPokemonRule(new WeightRestriction(20));
  ret.addPokemonRule(new BabyRestriction());
  ret.addTeamRule(new SpeciesClause());
  ret.addTeamRule(new ItemClause());
  ret.addBattleRule(new SleepClause());
  ret.addBattleRule(new FreezeClause());
  ret.addBattleRule(new PerishSongClause());
  ret.addBattleRule(new SelfdestructClause());
  ret.setDoubleBattle(double);
  ret.setNumber(3);
  return ret;
}

export function pbLittleCupRules(double: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  ret.addPokemonRule(new StandardRestriction());
  ret.addPokemonRule(new UnevolvedFormRestriction());
  ret.setLevelAdjustment(new EnemyLevelAdjustment(5));
  ret.addPokemonRule(new MaximumLevelRestriction(5));
  ret.addTeamRule(new SpeciesClause());
  ret.addTeamRule(new ItemClause());
  ret.addBattleRule(new SleepClause());
  ret.addBattleRule(new FreezeClause());
  ret.addBattleRule(new SelfdestructClause());
  ret.addBattleRule(new PerishSongClause());
  ret.addBattleRule(new SonicBoomClause());
  ret.setDoubleBattle(double);
  return ret;
}

export function pbStrictLittleCupRules(double: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  ret.addPokemonRule(new StandardRestriction());
  ret.addPokemonRule(new UnevolvedFormRestriction());
  ret.setLevelAdjustment(new EnemyLevelAdjustment(5));
  ret.addPokemonRule(new MaximumLevelRestriction(5));
  ret.addPokemonRule(new LittleCupRestriction());
  ret.addTeamRule(new SpeciesClause());
  ret.addBattleRule(new SleepClause());
  ret.addBattleRule(new EvasionClause());
  ret.addBattleRule(new OHKOClause());
  ret.addBattleRule(new SelfKOClause());
  ret.setDoubleBattle(double);
  ret.setNumber(3);
  return ret;
}

//===============================================================================
// Battle Frontier rules
//===============================================================================
export function pbBattleTowerRules(double: unknown, openlevel: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  if (openlevel) {
    ret.setLevelAdjustment(new OpenLevelAdjustment(60));
  } else {
    ret.setLevelAdjustment(new CappedLevelAdjustment(50));
  }
  ret.addPokemonRule(new StandardRestriction());
  ret.addTeamRule(new SpeciesClause());
  ret.addTeamRule(new ItemClause());
  ret.addBattleRule(new SoulDewBattleClause());
  ret.setDoubleBattle(double);
  return ret;
}

export function pbBattlePalaceRules(double: unknown, openlevel: unknown): PokemonChallengeRules {
  return pbBattleTowerRules(double, openlevel).setBattleType(new BattlePalace());
}

export function pbBattleArenaRules(openlevel: unknown): PokemonChallengeRules {
  return pbBattleTowerRules(false, openlevel).setBattleType(new BattleArena());
}

export function pbBattleFactoryRules(double: unknown, openlevel: unknown): PokemonChallengeRules {
  const ret = new PokemonChallengeRules();
  if (openlevel) {
    ret.setLevelAdjustment(new FixedLevelAdjustment(100));
    ret.addPokemonRule(new MaximumLevelRestriction(100));
  } else {
    ret.setLevelAdjustment(new FixedLevelAdjustment(50));
    ret.addPokemonRule(new MaximumLevelRestriction(50));
  }
  ret.addTeamRule(new SpeciesClause());
  ret.addPokemonRule(new BannedSpeciesRestriction("UNOWN"));
  ret.addTeamRule(new ItemClause());
  ret.addBattleRule(new SoulDewBattleClause());
  ret.setDoubleBattle(double);
  return ret;
}

// "Other Interesting Rulesets" (the official species restrictions, Pocket
// Monsters Stadium, the 1999-2010 tournament rules and the Colosseum rules)
// are commented out in the original (=begin/=end).
