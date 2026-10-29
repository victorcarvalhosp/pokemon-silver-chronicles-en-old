// Port of 018_Alternate battle modes/002_Battle Frontier rules/004_Challenge_LevelAdjustment.rb:
// how a challenge sets the levels of the player's and the opponent's Pokémon
// for a battle, and puts them back afterwards.

import { GrowthRate } from "../../data/gameData/growthRate";
import type { Pokemon } from "../pokemon/Pokemon";
import { pbBaseStatTotal } from "./generatorPokemon";

const clampLevel = (level: number) => Math.min(Math.max(level, 1), GrowthRate.maxLevel());

/** [team 1's old Exp, team 2's old Exp] */
export type LevelAdjustments = [number[], number[]];

//===============================================================================
//
//===============================================================================
export class LevelAdjustment {
  static readonly BothTeams = 0;
  static readonly EnemyTeam = 1;
  static readonly MyTeam = 2;
  static readonly BothTeamsDifferent = 3;

  protected adjustment: number;

  constructor(adjustment: number) {
    this.adjustment = adjustment;
  }

  get type(): number {
    return this.adjustment;
  }

  static getNullAdjustment(thisTeam: Pokemon[], _otherTeam: Pokemon[]): number[] {
    const ret: number[] = [];
    thisTeam.forEach((pkmn, i) => (ret[i] = pkmn.level));
    return ret;
  }

  /**
   * NOTE (Ruby parity): calls self.getNullAdjustment on the instance, but it's
   * a class method (NoMethodError, 004_Challenge_LevelAdjustment.rb:25). Every
   * subclass the game uses overrides this.
   */
  getAdjustment(_thisTeam: Pokemon[], _otherTeam: Pokemon[]): number[] {
    throw new Error(`undefined method \`getNullAdjustment' for #<${this.constructor.name}>`);
  }

  /** Only CombinedLevelAdjustment has these (NoMethodError otherwise). */
  getMyAdjustment(_myTeam: Pokemon[], _theirTeam: Pokemon[]): number[] {
    throw new Error(`undefined method \`getMyAdjustment' for #<${this.constructor.name}>`);
  }

  getTheirAdjustment(_theirTeam: Pokemon[], _myTeam: Pokemon[]): number[] {
    throw new Error(`undefined method \`getTheirAdjustment' for #<${this.constructor.name}>`);
  }

  getOldExp(team1: Pokemon[], _team2: Pokemon[]): number[] {
    const ret: number[] = [];
    team1.forEach((pkmn, i) => (ret[i] = pkmn.exp));
    return ret;
  }

  unadjustLevels(team1: Pokemon[], team2: Pokemon[], adjustments: LevelAdjustments): void {
    team1.forEach((pkmn, i) => {
      const exp = adjustments[0][i];
      if (exp == null || pkmn.exp === exp) return;
      pkmn.exp = exp;
      pkmn.calcStats();
    });
    team2.forEach((pkmn, i) => {
      const exp = adjustments[1][i];
      if (exp == null || pkmn.exp === exp) return;
      pkmn.exp = exp;
      pkmn.calcStats();
    });
  }

  adjustLevels(team1: Pokemon[], team2: Pokemon[]): LevelAdjustments {
    let adj1: number[] | null = null;
    let adj2: number[] | null = null;
    const ret: LevelAdjustments = [this.getOldExp(team1, team2), this.getOldExp(team2, team1)];
    if (this.adjustment === LevelAdjustment.BothTeams || this.adjustment === LevelAdjustment.MyTeam) {
      adj1 = this.getAdjustment(team1, team2);
    } else if (this.adjustment === LevelAdjustment.BothTeamsDifferent) {
      adj1 = this.getMyAdjustment(team1, team2);
    }
    if (this.adjustment === LevelAdjustment.BothTeams || this.adjustment === LevelAdjustment.EnemyTeam) {
      adj2 = this.getAdjustment(team2, team1);
    } else if (this.adjustment === LevelAdjustment.BothTeamsDifferent) {
      adj2 = this.getTheirAdjustment(team2, team1);
    }
    if (adj1) {
      team1.forEach((pkmn, i) => {
        if (pkmn.level === adj1[i]) return;
        pkmn.level = adj1[i]!;
        pkmn.calcStats();
      });
    }
    if (adj2) {
      team2.forEach((pkmn, i) => {
        if (pkmn.level === adj2[i]) return;
        pkmn.level = adj2[i]!;
        pkmn.calcStats();
      });
    }
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class FixedLevelAdjustment extends LevelAdjustment {
  protected level: number;

  constructor(level: number) {
    super(LevelAdjustment.BothTeams);
    this.level = clampLevel(level);
  }

  override getAdjustment(thisTeam: Pokemon[], _otherTeam: Pokemon[]): number[] {
    const ret: number[] = [];
    thisTeam.forEach((_pkmn, i) => (ret[i] = this.level));
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class TotalLevelAdjustment extends LevelAdjustment {
  protected minLevel: number;
  protected maxLevel: number;
  protected totalLevel: number;

  constructor(minLevel: number, maxLevel: number, totalLevel: number) {
    super(LevelAdjustment.EnemyTeam);
    this.minLevel = clampLevel(minLevel);
    this.maxLevel = clampLevel(maxLevel);
    this.totalLevel = totalLevel;
  }

  override getAdjustment(thisTeam: Pokemon[], _otherTeam: Pokemon[]): number[] {
    const ret: number[] = [];
    let total = 0;
    thisTeam.forEach((_pkmn, i) => {
      ret[i] = this.minLevel;
      total += this.minLevel;
    });
    for (;;) {
      let work = false;
      thisTeam.forEach((_pkmn, i) => {
        if (ret[i]! >= this.maxLevel || total >= this.totalLevel) return;
        ret[i]! += 1;
        total += 1;
        work = true;
      });
      if (!work) break;
    }
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class CombinedLevelAdjustment extends LevelAdjustment {
  protected my: LevelAdjustment | null;
  protected their: LevelAdjustment | null;

  constructor(my: LevelAdjustment | null, their: LevelAdjustment | null) {
    super(LevelAdjustment.BothTeamsDifferent);
    this.my = my;
    this.their = their;
  }

  override getMyAdjustment(myTeam: Pokemon[], theirTeam: Pokemon[]): number[] {
    if (this.my) return this.my.getAdjustment(myTeam, theirTeam);
    return LevelAdjustment.getNullAdjustment(myTeam, theirTeam);
  }

  override getTheirAdjustment(theirTeam: Pokemon[], myTeam: Pokemon[]): number[] {
    if (this.their) return this.their.getAdjustment(theirTeam, myTeam);
    return LevelAdjustment.getNullAdjustment(theirTeam, myTeam);
  }
}

//===============================================================================
//
//===============================================================================
export class SinglePlayerCappedLevelAdjustment extends CombinedLevelAdjustment {
  constructor(level: number) {
    super(new CappedLevelAdjustment(level), new FixedLevelAdjustment(level));
  }
}

//===============================================================================
//
//===============================================================================
export class CappedLevelAdjustment extends LevelAdjustment {
  protected level: number;

  constructor(level: number) {
    super(LevelAdjustment.BothTeams);
    this.level = clampLevel(level);
  }

  override getAdjustment(thisTeam: Pokemon[], _otherTeam: Pokemon[]): number[] {
    const ret: number[] = [];
    thisTeam.forEach((pkmn, i) => (ret[i] = Math.min(pkmn.level, this.level)));
    return ret;
  }
}

//===============================================================================
// Unused
//===============================================================================
export class LevelBalanceAdjustment extends LevelAdjustment {
  protected minLevel: number;

  constructor(minLevel: number) {
    super(LevelAdjustment.BothTeams);
    this.minLevel = minLevel;
  }

  override getAdjustment(thisTeam: Pokemon[], _otherTeam: Pokemon[]): number[] {
    const ret: number[] = [];
    thisTeam.forEach((pkmn, i) => (ret[i] = Math.round(113 - pbBaseStatTotal(pkmn.species) * 0.072)));
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class EnemyLevelAdjustment extends LevelAdjustment {
  protected level: number;

  constructor(level: number) {
    super(LevelAdjustment.EnemyTeam);
    this.level = clampLevel(level);
  }

  override getAdjustment(thisTeam: Pokemon[], _otherTeam: Pokemon[]): number[] {
    const ret: number[] = [];
    thisTeam.forEach((_pkmn, i) => (ret[i] = this.level));
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class OpenLevelAdjustment extends LevelAdjustment {
  readonly minLevel: number;

  constructor(minLevel = 1) {
    super(LevelAdjustment.EnemyTeam);
    this.minLevel = minLevel;
  }

  override getAdjustment(thisTeam: Pokemon[], otherTeam: Pokemon[]): number[] {
    let maxLevel = 1;
    for (const pkmn of otherTeam) {
      const level = pkmn.level;
      if (maxLevel < level) maxLevel = level;
    }
    if (maxLevel < this.minLevel) maxLevel = this.minLevel;
    const ret: number[] = [];
    thisTeam.forEach((_pkmn, i) => (ret[i] = maxLevel));
    return ret;
  }
}
