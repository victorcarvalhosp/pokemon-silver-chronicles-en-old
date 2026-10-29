// Port of 018_Alternate battle modes/002_Battle Frontier rules/005_Challenge_BattleRules.rb:
// rules a challenge applies to each battle it creates.

/** The part of Battle a battle rule sets. */
export interface RuledBattle {
  setBattleMode(mode: string): void;
  rules: Record<string, unknown>;
}

//===============================================================================
//
//===============================================================================
export class BattleRule {
  setRule(_battle: RuledBattle): void {}
}

export class DoubleBattle extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.setBattleMode("double"); }
}

export class SingleBattle extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.setBattleMode("single"); }
}

export class SoulDewBattleClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["souldewclause"] = true; }
}

export class SleepClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["sleepclause"] = true; }
}

export class FreezeClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["freezeclause"] = true; }
}

export class EvasionClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["evasionclause"] = true; }
}

export class OHKOClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["ohkoclause"] = true; }
}

export class PerishSongClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["perishsong"] = true; }
}

export class SelfKOClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["selfkoclause"] = true; }
}

export class SelfdestructClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["selfdestructclause"] = true; }
}

export class SonicBoomClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["sonicboomclause"] = true; }
}

export class ModifiedSleepClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["modifiedsleepclause"] = true; }
}

export class SkillSwapClause extends BattleRule {
  override setRule(battle: RuledBattle): void { battle.rules["skillswapclause"] = true; }
}
