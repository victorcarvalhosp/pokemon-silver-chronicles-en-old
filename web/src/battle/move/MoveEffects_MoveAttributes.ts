// Port of Data/Scripts/011_Battle/003_Move/008_MoveEffects_MoveAttributes.rb
// (92 classes, plus the top-level pbHiddenPower), with:
// - v20.1 Hotfixes (Battle bug fixes.rb:428): IgnoreTargetDefSpDefEvaStatStages
//   gets pbCalcAccuracyModifiers (ignores the target's evasion); the core's
//   misnamed pbCalcAccuracyMultipliers is never called and isn't ported.
//   (The Battle::Move patch at :417, pbEffectivenessMessage, is in Move_Usage.ts.)
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:106):
//   DoublePowerIfTargetAsleepCureTarget#pbEffectAfterAllHits is redefined (also
//   cures Drowsy); :492 CategoryDependsOnHigherDamageIgnoreTargetAbility#pbOnStartUse
//   (Ability Shield stops Mold Breaker); :533 OHKO#pbAccuracyCheck and :547
//   OHKOIce#pbAccuracyCheck (Commander, Glaive Rush); :577 TypeDependsOnUserPlate
//   gets pbOnStartUse and pbBaseType (Legend Plate; see [001] Battle/[006]
//   Legend Plate Functions.rb).
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:36): FixedDamageHalfTargetHP#pbFixedDamage
//   and :48 LowerTargetHPToUserHP#pbFixedDamage use the non-Dynamax HP.
// Alias chains (load order Hotfixes → Gen 9 → Mega → Deluxe → ZUD):
//   OHKO#pbAccuracyCheck = Gen 9( core ); OHKOIce#pbAccuracyCheck = Gen 9( core OHKOIce )
//   CategoryDependsOnHigherDamageIgnoreTargetAbility#pbOnStartUse = Gen 9( core )
//   TypeDependsOnUserPlate#pbBaseType = Gen 9( core ); #pbOnStartUse = Gen 9 (new)
//   DoublePowerIfTargetAsleepCureTarget#pbEffectAfterAllHits = Gen 9 (redefined)
//   FixedDamageHalfTargetHP/LowerTargetHPToUserHP#pbFixedDamage = ZUD (redefined)
//
// Sync/async of the overridden methods: see the table in Move_Usage.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Effectiveness, Type } from "../../data/gameData/type";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Scene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import type { AccuracyModifiers } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { registerMoveClass, Move } from "./Move";
import { FixedDamageMove, ProtectMove, RecoilMove, StatDownMove } from "./Move_BaseEffects";
import { RaiseUserSpeed1 } from "./MoveEffects_BattlerStats";
import { IgnoreTargetAbility, PoisonTarget } from "./MoveEffects_BattlerOther";

/**
 * Ruby's Integer#<<: a negative shift count shifts right (floor), e.g.
 * `40 << -1` is 20 (JS's `<<` would use the count mod 32).
 */
function rubyShiftLeft(x: number, n: number): number {
  return n >= 0 ? x * (2 ** n) : Math.floor(x / (2 ** -n));
}

/** Battle#pbGetBestTypeJudgment (Generation 9 Pack, [006] Legend Plate Functions.rb:34). */
type BattleWithJudgment = {
  pbGetBestTypeJudgment(user: Battler, target: Battler | null, move: Move | null,
    checkType: Id | null): Promise<Id>;
};

//===============================================================================
// Inflicts a fixed 20HP damage. (Sonic Boom)
//===============================================================================
export class FixedDamage20 extends FixedDamageMove {
  override pbFixedDamage(_user: Battler, _target: Battler): number {
    return 20;
  }
}
registerMoveClass("FixedDamage20", FixedDamage20);

//===============================================================================
// Inflicts a fixed 40HP damage. (Dragon Rage)
//===============================================================================
export class FixedDamage40 extends FixedDamageMove {
  override pbFixedDamage(_user: Battler, _target: Battler): number {
    return 40;
  }
}
registerMoveClass("FixedDamage40", FixedDamage40);

//===============================================================================
// Halves the target's current HP. (Nature's Madness, Super Fang)
//===============================================================================
export class FixedDamageHalfTargetHP extends FixedDamageMove {
  /** ZUD Mechanics (redefined): damage dealt is based on the target's non-Dynamax HP. */
  override pbFixedDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.realHp()! / 2.0);
  }
}
registerMoveClass("FixedDamageHalfTargetHP", FixedDamageHalfTargetHP);

//===============================================================================
// Inflicts damage equal to the user's level. (Night Shade, Seismic Toss)
//===============================================================================
export class FixedDamageUserLevel extends FixedDamageMove {
  override pbFixedDamage(user: Battler, _target: Battler): number {
    return user.level;
  }
}
registerMoveClass("FixedDamageUserLevel", FixedDamageUserLevel);

//===============================================================================
// Inflicts damage between 0.5 and 1.5 times the user's level. (Psywave)
//===============================================================================
export class FixedDamageUserLevelRandom extends FixedDamageMove {
  override pbFixedDamage(user: Battler, _target: Battler): number {
    const min = Math.floor(user.level / 2);
    const max = Math.floor(user.level * 3 / 2);
    return min + this.battle.pbRandom(max - min + 1);
  }
}
registerMoveClass("FixedDamageUserLevelRandom", FixedDamageUserLevelRandom);

//===============================================================================
// Inflicts damage to bring the target's HP down to equal the user's HP. (Endeavor)
//===============================================================================
export class LowerTargetHPToUserHP extends FixedDamageMove {
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (user.hp >= target.hp) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 1; }

  /**
   * ZUD Mechanics (redefined): damage dealt is based on the user/target's
   * non-Dynamax HP. (A Float if either is Dynamaxed, as in Ruby.)
   */
  override pbFixedDamage(user: Battler, target: Battler): number {
    return target.realHp()! - user.realHp()!;
  }
}
registerMoveClass("LowerTargetHPToUserHP", LowerTargetHPToUserHP);

//===============================================================================
// OHKO. Accuracy increases by difference between levels of user and target.
//===============================================================================
export class OHKO extends FixedDamageMove {
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.level > user.level) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
      return true;
    }
    if (target.hasActiveAbility("STURDY") && !this.battle.moldBreaker) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("But it failed to affect {1}!", target.pbThis(true)));
        } else {
          await this.battle.pbDisplay(_INTL("But it failed to affect {1} because of its {2}!",
            target.pbThis(true), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    return false;
  }

  /**
   * Generation 9 Pack (alias): moves on a Pokémon whose Commander ability is
   * active always miss; Glaive Rush's drawback makes them always hit.
   */
  override pbAccuracyCheck(user: Battler, target: Battler): boolean {
    if (target.isCommander()) return false;
    if (target.effects[PBEffects.GlaiveRush] > 0) return true;
    // Essentials
    const acc = this.accuracy + user.level - target.level;
    return this.battle.pbRandom(100) < acc;
  }

  override pbFixedDamage(_user: Battler, target: Battler): number {
    return target.totalhp;
  }

  override async pbHitEffectivenessMessages(user: Battler, target: Battler, numTargets = 1): Promise<void> {
    await super.pbHitEffectivenessMessages(user, target, numTargets);
    if (target.fainted()) {
      await this.battle.pbDisplay(_INTL("It's a one-hit KO!"));
    }
  }
}
registerMoveClass("OHKO", OHKO);

//===============================================================================
// OHKO. Accuracy increases by difference between levels of user and target.
// Lower accuracy when used by a non-Ice-type Pokémon. Doesn't affect Ice-type
// Pokémon. (Sheer Cold (Gen 7+))
//===============================================================================
export class OHKOIce extends OHKO {
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.pbHasType("ICE")) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return super.pbFailsAgainstTarget(user, target, showMessage);
  }

  /** Generation 9 Pack (alias): Commander, Glaive Rush (see OHKO). */
  override pbAccuracyCheck(user: Battler, target: Battler): boolean {
    if (target.isCommander()) return false;
    if (target.effects[PBEffects.GlaiveRush] > 0) return true;
    // Essentials
    let acc = this.accuracy + user.level - target.level;
    if (!user.pbHasType("ICE")) acc -= 10;
    return this.battle.pbRandom(100) < acc;
  }
}
registerMoveClass("OHKOIce", OHKOIce);

//===============================================================================
// OHKO. Accuracy increases by difference between levels of user and target. Hits
// targets that are semi-invulnerable underground. (Fissure)
//===============================================================================
export class OHKOHitsUndergroundTarget extends OHKO {
  override hitsDiggingTargets(): boolean { return true; }
}
registerMoveClass("OHKOHitsUndergroundTarget", OHKOHitsUndergroundTarget);

//===============================================================================
// The target's ally loses 1/16 of its max HP. (Flame Burst)
//===============================================================================
export class DamageTargetAlly extends Move {
  override async pbEffectWhenDealingDamage(_user: Battler, target: Battler): Promise<void> {
    const hitAlly: [number, number][] = [];
    for (const b of target.allAllies()) {
      if (!b.near(target.index)) continue;
      if (!b.takesIndirectDamage()) continue;
      hitAlly.push([b.index, b.hp]);
      await b.pbReduceHP(Math.floor(b.totalhp / 16), false);
    }
    if (hitAlly.length === 2) {
      await this.battle.pbDisplay(_INTL("The bursting flame hit {1} and {2}!",
        this.battle.battlers[hitAlly[0]![0]]!.pbThis(true),
        this.battle.battlers[hitAlly[1]![0]]!.pbThis(true)));
    } else if (hitAlly.length > 0) {
      for (const b of hitAlly) {
        await this.battle.pbDisplay(_INTL("The bursting flame hit {1}!",
          this.battle.battlers[b[0]]!.pbThis(true)));
      }
    }
    for (const b of hitAlly) await this.battle.battlers[b[0]]!.pbItemHPHealCheck();
  }
}
registerMoveClass("DamageTargetAlly", DamageTargetAlly);

//===============================================================================
// Power increases with the user's HP. (Eruption, Water Spout)
//===============================================================================
export class PowerHigherWithUserHP extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    return Math.max(Math.floor(150 * user.hp / user.totalhp), 1);
  }
}
registerMoveClass("PowerHigherWithUserHP", PowerHigherWithUserHP);

//===============================================================================
// Power increases the less HP the user has. (Flail, Reversal)
//===============================================================================
export class PowerLowerWithUserHP extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    let ret = 20;
    const n = Math.floor(48 * user.hp / user.totalhp);
    if (n < 2) {
      ret = 200;
    } else if (n < 5) {
      ret = 150;
    } else if (n < 10) {
      ret = 100;
    } else if (n < 17) {
      ret = 80;
    } else if (n < 33) {
      ret = 40;
    }
    return ret;
  }
}
registerMoveClass("PowerLowerWithUserHP", PowerLowerWithUserHP);

//===============================================================================
// Power increases with the target's HP. (Crush Grip, Wring Out)
//===============================================================================
export class PowerHigherWithTargetHP extends Move {
  override pbBaseDamage(_baseDmg: number, _user: Battler, target: Battler): number {
    return Math.max(Math.floor(120 * target.hp / target.totalhp), 1);
  }
}
registerMoveClass("PowerHigherWithTargetHP", PowerHigherWithTargetHP);

//===============================================================================
// Power increases with the user's happiness. (Return)
//===============================================================================
export class PowerHigherWithUserHappiness extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    return Math.max(Math.floor(user.happiness() * 2 / 5), 1);
  }
}
registerMoveClass("PowerHigherWithUserHappiness", PowerHigherWithUserHappiness);

//===============================================================================
// Power decreases with the user's happiness. (Frustration)
//===============================================================================
export class PowerLowerWithUserHappiness extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    return Math.max(Math.floor((255 - user.happiness()) * 2 / 5), 1);
  }
}
registerMoveClass("PowerLowerWithUserHappiness", PowerLowerWithUserHappiness);

//===============================================================================
// Power increases with the user's positive stat changes (ignores negative ones).
// (Power Trip, Stored Power)
//===============================================================================
export class PowerHigherWithUserPositiveStatStages extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    let mult = 1;
    for (const s of Stat.eachBattle()) {
      if (user.stages[s.id]! > 0) mult += user.stages[s.id]!;
    }
    return 20 * mult;
  }
}
registerMoveClass("PowerHigherWithUserPositiveStatStages", PowerHigherWithUserPositiveStatStages);

//===============================================================================
// Power increases with the target's positive stat changes (ignores negative ones).
// (Punishment)
//===============================================================================
export class PowerHigherWithTargetPositiveStatStages extends Move {
  override pbBaseDamage(_baseDmg: number, _user: Battler, target: Battler): number {
    let mult = 3;
    for (const s of Stat.eachBattle()) {
      if (target.stages[s.id]! > 0) mult += target.stages[s.id]!;
    }
    return Math.min(20 * mult, 200);
  }
}
registerMoveClass("PowerHigherWithTargetPositiveStatStages", PowerHigherWithTargetPositiveStatStages);

//===============================================================================
// Power increases the quicker the user is than the target. (Electro Ball)
//===============================================================================
export class PowerHigherWithUserFasterThanTarget extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, target: Battler): number {
    let ret = 40;
    const n = Math.floor(user.pbSpeed() / target.pbSpeed());
    if (n >= 4) {
      ret = 150;
    } else if (n >= 3) {
      ret = 120;
    } else if (n >= 2) {
      ret = 80;
    } else if (n >= 1) {
      ret = 60;
    }
    return ret;
  }
}
registerMoveClass("PowerHigherWithUserFasterThanTarget", PowerHigherWithUserFasterThanTarget);

//===============================================================================
// Power increases the quicker the target is than the user. (Gyro Ball)
//===============================================================================
export class PowerHigherWithTargetFasterThanUser extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, target: Battler): number {
    return Math.max(Math.min(Math.floor(25 * target.pbSpeed() / user.pbSpeed()), 150), 1);
  }
}
registerMoveClass("PowerHigherWithTargetFasterThanUser", PowerHigherWithTargetFasterThanUser);

//===============================================================================
// Power increases the less PP this move has. (Trump Card)
//===============================================================================
export class PowerHigherWithLessPP extends Move {
  override pbBaseDamage(_baseDmg: number, _user: Battler, _target: Battler): number {
    const dmgs = [200, 80, 60, 50, 40];
    const ppLeft = Math.min(this.pp, dmgs.length - 1); // PP is reduced before the move is used
    return dmgs.at(ppLeft)!; // (Ruby Array#[]: a negative index counts from the end)
  }
}
registerMoveClass("PowerHigherWithLessPP", PowerHigherWithLessPP);

//===============================================================================
// Power increases the heavier the target is. (Grass Knot, Low Kick)
//===============================================================================
export class PowerHigherWithTargetWeight extends Move {
  override pbBaseDamage(_baseDmg: number, _user: Battler, target: Battler): number {
    let ret = 20;
    const weight = target.pbWeight();
    if (weight >= 2000) {
      ret = 120;
    } else if (weight >= 1000) {
      ret = 100;
    } else if (weight >= 500) {
      ret = 80;
    } else if (weight >= 250) {
      ret = 60;
    } else if (weight >= 100) {
      ret = 40;
    }
    return ret;
  }
}
registerMoveClass("PowerHigherWithTargetWeight", PowerHigherWithTargetWeight);

//===============================================================================
// Power increases the heavier the user is than the target. (Heat Crash, Heavy Slam)
//===============================================================================
export class PowerHigherWithUserHeavierThanTarget extends Move {
  override pbBaseDamage(_baseDmg: number, user: Battler, target: Battler): number {
    let ret = 40;
    const n = Math.floor(user.pbWeight() / target.pbWeight());
    if (n >= 5) {
      ret = 120;
    } else if (n >= 4) {
      ret = 100;
    } else if (n >= 3) {
      ret = 80;
    } else if (n >= 2) {
      ret = 60;
    }
    return ret;
  }
}
registerMoveClass("PowerHigherWithUserHeavierThanTarget", PowerHigherWithUserHeavierThanTarget);

//===============================================================================
// Power doubles for each consecutive use. (Fury Cutter)
//===============================================================================
export class PowerHigherWithConsecutiveUse extends Move {
  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    const oldVal: number = user.effects[PBEffects.FuryCutter];
    super.pbChangeUsageCounters(user, specialUsage);
    let maxMult = 1;
    // NOTE (Ruby parity): loops forever if the move's base damage is 0, as in Ruby.
    while (rubyShiftLeft(this.baseDamage, maxMult - 1) < 160) {
      maxMult += 1; // 1-4 for base damage of 20, 1-3 for base damage of 40
    }
    user.effects[PBEffects.FuryCutter] = (oldVal >= maxMult) ? maxMult : oldVal + 1;
  }

  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    // (Ruby's << with a negative count, FuryCutter = 0 when the AI asks, shifts right.)
    return rubyShiftLeft(baseDmg, user.effects[PBEffects.FuryCutter] - 1);
  }
}
registerMoveClass("PowerHigherWithConsecutiveUse", PowerHigherWithConsecutiveUse);

//===============================================================================
// Power is multiplied by the number of consecutive rounds in which this move was
// used by any Pokémon on the user's side. (Echoed Voice)
//===============================================================================
export class PowerHigherWithConsecutiveUseOnUserSide extends Move {
  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    const oldVal: number = user.pbOwnSide().effects[PBEffects.EchoedVoiceCounter];
    super.pbChangeUsageCounters(user, specialUsage);
    if (!user.pbOwnSide().effects[PBEffects.EchoedVoiceUsed]) {
      user.pbOwnSide().effects[PBEffects.EchoedVoiceCounter] = (oldVal >= 5) ? 5 : oldVal + 1;
    }
    user.pbOwnSide().effects[PBEffects.EchoedVoiceUsed] = true;
  }

  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    return baseDmg * user.pbOwnSide().effects[PBEffects.EchoedVoiceCounter]; // 1-5
  }
}
registerMoveClass("PowerHigherWithConsecutiveUseOnUserSide", PowerHigherWithConsecutiveUseOnUserSide);

//===============================================================================
// Power is chosen at random. Power is doubled if the target is using Dig. Hits
// some semi-invulnerable targets. (Magnitude)
//===============================================================================
export class RandomPowerDoublePowerIfTargetUnderground extends Move {
  magnitudeDmg: number | null = null;

  override hitsDiggingTargets(): boolean { return true; }

  override async pbOnStartUse(_user: Battler, _targets: Battler[]): Promise<void> {
    const baseDmg = [10, 30, 50, 70, 90, 110, 150];
    const magnitudes = [
      4,
      5, 5,
      6, 6, 6, 6,
      7, 7, 7, 7, 7, 7,
      8, 8, 8, 8,
      9, 9,
      10,
    ];
    const magni = magnitudes[this.battle.pbRandom(magnitudes.length)]!;
    this.magnitudeDmg = baseDmg[magni - 4]!;
    await this.battle.pbDisplay(_INTL("Magnitude {1}!", magni));
  }

  override pbBaseDamage(_baseDmg: number, _user: Battler, _target: Battler): number {
    return this.magnitudeDmg!;
  }

  override pbModifyDamage(damageMult: number, _user: Battler, target: Battler): number {
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderground")) damageMult *= 2;
    if (this.battle.field.terrain === "Grassy") damageMult /= 2;
    return damageMult;
  }
}
registerMoveClass("RandomPowerDoublePowerIfTargetUnderground", RandomPowerDoublePowerIfTargetUnderground);

//===============================================================================
// Power is doubled if the target's HP is down to 1/2 or less. (Brine)
//===============================================================================
export class DoublePowerIfTargetHPLessThanHalf extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    if (target.hp <= Math.floor(target.totalhp / 2)) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetHPLessThanHalf", DoublePowerIfTargetHPLessThanHalf);

//===============================================================================
// Power is doubled if the user is burned, poisoned or paralyzed. (Facade)
// Burn's halving of Attack is negated (new mechanics).
//===============================================================================
export class DoublePowerIfUserPoisonedBurnedParalyzed extends Move {
  override damageReducedByBurn(): boolean { return Settings.MECHANICS_GENERATION_AT_RUNTIME <= 5; }

  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    if (user.poisoned() || user.burned() || user.paralyzed()) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfUserPoisonedBurnedParalyzed", DoublePowerIfUserPoisonedBurnedParalyzed);

//===============================================================================
// Power is doubled if the target is asleep. Wakes the target up. (Wake-Up Slap)
//===============================================================================
export class DoublePowerIfTargetAsleepCureTarget extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (target.asleep() &&
        (target.effects[PBEffects.Substitute] === 0 || this.ignoresSubstitute(user))) {
      baseDmg *= 2;
    }
    return baseDmg;
  }

  /** Generation 9 Pack (redefined): also removes Drowsiness. */
  override async pbEffectAfterAllHits(_user: Battler, target: Battler): Promise<void> {
    if (target.fainted()) return;
    if (target.damageState.unaffected || target.damageState.substitute) return;
    if (!["SLEEP", "DROWSY"].includes(target.status)) return;
    await target.pbCureStatus();
  }
}
registerMoveClass("DoublePowerIfTargetAsleepCureTarget", DoublePowerIfTargetAsleepCureTarget);

//===============================================================================
// Power is doubled if the target is poisoned. (Venoshock)
//===============================================================================
export class DoublePowerIfTargetPoisoned extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (target.poisoned() &&
        (target.effects[PBEffects.Substitute] === 0 || this.ignoresSubstitute(user))) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetPoisoned", DoublePowerIfTargetPoisoned);

//===============================================================================
// Power is doubled if the target is paralyzed. Cures the target of paralysis.
// (Smelling Salts)
//===============================================================================
export class DoublePowerIfTargetParalyzedCureTarget extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (target.paralyzed() &&
        (target.effects[PBEffects.Substitute] === 0 || this.ignoresSubstitute(user))) {
      baseDmg *= 2;
    }
    return baseDmg;
  }

  override async pbEffectAfterAllHits(_user: Battler, target: Battler): Promise<void> {
    if (target.fainted()) return;
    if (target.damageState.unaffected || target.damageState.substitute) return;
    if (target.status !== "PARALYSIS") return;
    await target.pbCureStatus();
  }
}
registerMoveClass("DoublePowerIfTargetParalyzedCureTarget", DoublePowerIfTargetParalyzedCureTarget);

//===============================================================================
// Power is doubled if the target has a status problem. (Hex)
//===============================================================================
export class DoublePowerIfTargetStatusProblem extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (target.pbHasAnyStatus() &&
        (target.effects[PBEffects.Substitute] === 0 || this.ignoresSubstitute(user))) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetStatusProblem", DoublePowerIfTargetStatusProblem);

//===============================================================================
// Power is doubled if the user has no held item. (Acrobatics)
//===============================================================================
export class DoublePowerIfUserHasNoItem extends Move {
  override pbBaseDamageMultiplier(damageMult: number, user: Battler, _target: Battler): number {
    if (!user.item || user.effects[PBEffects.GemConsumed]) damageMult *= 2;
    return damageMult;
  }
}
registerMoveClass("DoublePowerIfUserHasNoItem", DoublePowerIfUserHasNoItem);

//===============================================================================
// Power is doubled if the target is using Dive. Hits some semi-invulnerable
// targets. (Surf)
//===============================================================================
export class DoublePowerIfTargetUnderwater extends Move {
  override hitsDivingTargets(): boolean { return true; }

  override pbModifyDamage(damageMult: number, _user: Battler, target: Battler): number {
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderwater")) damageMult *= 2;
    return damageMult;
  }
}
registerMoveClass("DoublePowerIfTargetUnderwater", DoublePowerIfTargetUnderwater);

//===============================================================================
// Power is doubled if the target is using Dig. Power is halved if Grassy Terrain
// is in effect. Hits some semi-invulnerable targets. (Earthquake)
//===============================================================================
export class DoublePowerIfTargetUnderground extends Move {
  override hitsDiggingTargets(): boolean { return true; }

  override pbModifyDamage(damageMult: number, _user: Battler, target: Battler): number {
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderground")) damageMult *= 2;
    if (this.battle.field.terrain === "Grassy") damageMult /= 2;
    return damageMult;
  }
}
registerMoveClass("DoublePowerIfTargetUnderground", DoublePowerIfTargetUnderground);

//===============================================================================
// Power is doubled if the target is using Bounce, Fly or Sky Drop. Hits some
// semi-invulnerable targets. (Gust)
//===============================================================================
export class DoublePowerIfTargetInSky extends Move {
  override hitsFlyingTargets(): boolean { return true; }

  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
          "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
          "TwoTurnAttackInvulnerableInSkyTargetCannotAct") ||
        target.effects[PBEffects.SkyDrop] >= 0) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetInSky", DoublePowerIfTargetInSky);

//===============================================================================
// Power is doubled if Electric Terrain applies. (Rising Voltage)
//===============================================================================
export class DoublePowerInElectricTerrain extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    if (this.battle.field.terrain === "Electric" && target.affectedByTerrain()) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerInElectricTerrain", DoublePowerInElectricTerrain);

//===============================================================================
// Power is doubled if the user's last move failed. (Stomping Tantrum)
//===============================================================================
export class DoublePowerIfUserLastMoveFailed extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    if (user.lastRoundMoveFailed) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfUserLastMoveFailed", DoublePowerIfUserLastMoveFailed);

//===============================================================================
// Power is doubled if a user's teammate fainted last round. (Retaliate)
//===============================================================================
export class DoublePowerIfAllyFaintedLastTurn extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    const lrf: number = user.pbOwnSide().effects[PBEffects.LastRoundFainted];
    if (lrf >= 0 && lrf === this.battle.turnCount - 1) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfAllyFaintedLastTurn", DoublePowerIfAllyFaintedLastTurn);

//===============================================================================
// Power is doubled if the user has lost HP due to the target's move this round.
// (Avalanche, Revenge)
//===============================================================================
export class DoublePowerIfUserLostHPThisTurn extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (user.lastAttacker.includes(target.index)) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfUserLostHPThisTurn", DoublePowerIfUserLostHPThisTurn);

//===============================================================================
// Power is doubled if the target has already lost HP this round. (Assurance)
//===============================================================================
export class DoublePowerIfTargetLostHPThisTurn extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    if (target.tookDamageThisRound) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetLostHPThisTurn", DoublePowerIfTargetLostHPThisTurn);

//===============================================================================
// Power is doubled if any of the user's stats were lowered this round. (Lash Out)
//===============================================================================
export class DoublePowerIfUserStatsLoweredThisTurn extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    if (user.statsLoweredThisRound) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfUserStatsLoweredThisTurn", DoublePowerIfUserStatsLoweredThisTurn);

//===============================================================================
// Power is doubled if the target has already moved this round. (Payback)
//===============================================================================
export class DoublePowerIfTargetActed extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    const choice = this.battle.choices[target.index]![0];
    if (choice !== "None" &&
        ((choice !== "UseMove" && choice !== "Shift") || target.movedThisRound())) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetActed", DoublePowerIfTargetActed);

//===============================================================================
// Power is doubled if the user moves before the target, or if the target
// switched in this round. (Bolt Beak, Fishious Rend)
//===============================================================================
export class DoublePowerIfTargetNotActed extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    const choice = this.battle.choices[target.index]![0];
    if (choice === "None" || // Switched in
        (["UseMove", "Shift"].includes(choice) && !target.movedThisRound())) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetNotActed", DoublePowerIfTargetNotActed);

//===============================================================================
// This attack is always a critical hit. (Frost Breath, Storm Throw)
//===============================================================================
export class AlwaysCriticalHit extends Move {
  override pbCritialOverride(_user: Battler, _target: Battler): number { return 1; }
}
registerMoveClass("AlwaysCriticalHit", AlwaysCriticalHit);

//===============================================================================
// Until the end of the next round, the user's moves will always be critical hits.
// (Laser Focus)
//===============================================================================
export class EnsureNextCriticalHit extends Move {
  override canSnatch(): boolean { return true; }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.LaserFocus] = 2;
    await this.battle.pbDisplay(_INTL("{1} concentrated intensely!", user.pbThis()));
  }
}
registerMoveClass("EnsureNextCriticalHit", EnsureNextCriticalHit);

//===============================================================================
// For 5 rounds, foes' attacks cannot become critical hits. (Lucky Chant)
//===============================================================================
export class StartPreventCriticalHitsAgainstUserSide extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOwnSide().effects[PBEffects.LuckyChant] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.LuckyChant] = 5;
    await this.battle.pbDisplay(_INTL("The Lucky Chant shielded {1} from critical hits!", user.pbTeam(true)));
  }
}
registerMoveClass("StartPreventCriticalHitsAgainstUserSide", StartPreventCriticalHitsAgainstUserSide);

//===============================================================================
// If target would be KO'd by this attack, it survives with 1HP instead.
// (False Swipe, Hold Back)
//===============================================================================
export class CannotMakeTargetFaint extends Move {
  override nonLethal(_user: Battler, _target: Battler): boolean { return true; }
}
registerMoveClass("CannotMakeTargetFaint", CannotMakeTargetFaint);

//===============================================================================
// If user would be KO'd this round, it survives with 1HP instead. (Endure)
//===============================================================================
export class UserEnduresFaintingThisTurn extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.Endure;
  }

  override async pbProtectMessage(user: Battler): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} braced itself!", user.pbThis()));
  }
}
registerMoveClass("UserEnduresFaintingThisTurn", UserEnduresFaintingThisTurn);

//===============================================================================
// Weakens Electric attacks. (Mud Sport)
//===============================================================================
export class StartWeakenElectricMoves extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      if (this.battle.field.effects[PBEffects.MudSportField] > 0) {
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
    } else if (this.battle.allBattlers().some((b) => b.effects[PBEffects.MudSport])) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      this.battle.field.effects[PBEffects.MudSportField] = 5;
    } else {
      user.effects[PBEffects.MudSport] = true;
    }
    await this.battle.pbDisplay(_INTL("Electricity's power was weakened!"));
  }
}
registerMoveClass("StartWeakenElectricMoves", StartWeakenElectricMoves);

//===============================================================================
// Weakens Fire attacks. (Water Sport)
//===============================================================================
export class StartWeakenFireMoves extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      if (this.battle.field.effects[PBEffects.WaterSportField] > 0) {
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
    } else if (this.battle.allBattlers().some((b) => b.effects[PBEffects.WaterSport])) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      this.battle.field.effects[PBEffects.WaterSportField] = 5;
    } else {
      user.effects[PBEffects.WaterSport] = true;
    }
    await this.battle.pbDisplay(_INTL("Fire's power was weakened!"));
  }
}
registerMoveClass("StartWeakenFireMoves", StartWeakenFireMoves);

//===============================================================================
// For 5 rounds, lowers power of physical attacks against the user's side.
// (Reflect)
//===============================================================================
export class StartWeakenPhysicalDamageAgainstUserSide extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOwnSide().effects[PBEffects.Reflect] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.Reflect] = 5;
    if (user.hasActiveItem("LIGHTCLAY")) user.pbOwnSide().effects[PBEffects.Reflect] = 8;
    await this.battle.pbDisplay(_INTL("{1} raised {2}'s Defense!", this.name, user.pbTeam(true)));
  }
}
registerMoveClass("StartWeakenPhysicalDamageAgainstUserSide", StartWeakenPhysicalDamageAgainstUserSide);

//===============================================================================
// For 5 rounds, lowers power of special attacks against the user's side. (Light Screen)
//===============================================================================
export class StartWeakenSpecialDamageAgainstUserSide extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOwnSide().effects[PBEffects.LightScreen] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.LightScreen] = 5;
    if (user.hasActiveItem("LIGHTCLAY")) user.pbOwnSide().effects[PBEffects.LightScreen] = 8;
    await this.battle.pbDisplay(_INTL("{1} raised {2}'s Special Defense!", this.name, user.pbTeam(true)));
  }
}
registerMoveClass("StartWeakenSpecialDamageAgainstUserSide", StartWeakenSpecialDamageAgainstUserSide);

//===============================================================================
// For 5 rounds, lowers power of attacks against the user's side. Fails if
// weather is not hail. (Aurora Veil)
//===============================================================================
export class StartWeakenDamageAgainstUserSideIfHail extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effectiveWeather() !== "Hail") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (user.pbOwnSide().effects[PBEffects.AuroraVeil] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.AuroraVeil] = 5;
    if (user.hasActiveItem("LIGHTCLAY")) user.pbOwnSide().effects[PBEffects.AuroraVeil] = 8;
    await this.battle.pbDisplay(_INTL("{1} made {2} stronger against physical and special moves!",
      this.name, user.pbTeam(true)));
  }
}
registerMoveClass("StartWeakenDamageAgainstUserSideIfHail", StartWeakenDamageAgainstUserSideIfHail);

//===============================================================================
// Ends the opposing side's Light Screen, Reflect and Aurora Break. (Brick Break,
// Psychic Fangs)
//===============================================================================
export class RemoveScreens extends Move {
  override ignoresReflect(): boolean { return true; }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.pbOpposingSide().effects[PBEffects.LightScreen] > 0) {
      user.pbOpposingSide().effects[PBEffects.LightScreen] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s Light Screen wore off!", user.pbOpposingTeam()));
    }
    if (user.pbOpposingSide().effects[PBEffects.Reflect] > 0) {
      user.pbOpposingSide().effects[PBEffects.Reflect] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s Reflect wore off!", user.pbOpposingTeam()));
    }
    if (user.pbOpposingSide().effects[PBEffects.AuroraVeil] > 0) {
      user.pbOpposingSide().effects[PBEffects.AuroraVeil] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s Aurora Veil wore off!", user.pbOpposingTeam()));
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (user.pbOpposingSide().effects[PBEffects.LightScreen] > 0 ||
        user.pbOpposingSide().effects[PBEffects.Reflect] > 0 ||
        user.pbOpposingSide().effects[PBEffects.AuroraVeil] > 0) {
      hitNum = 1; // Wall-breaking anim
    }
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("RemoveScreens", RemoveScreens);

//===============================================================================
// User is protected against moves with the "B" flag this round. (Detect, Protect)
//===============================================================================
export class ProtectUser extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.Protect;
  }
}
registerMoveClass("ProtectUser", ProtectUser);

//===============================================================================
// User is protected against moves with the "B" flag this round. If a Pokémon
// makes contact with the user while this effect applies, that Pokémon is
// poisoned. (Baneful Bunker)
//===============================================================================
export class ProtectUserBanefulBunker extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.BanefulBunker;
  }
}
registerMoveClass("ProtectUserBanefulBunker", ProtectUserBanefulBunker);

//===============================================================================
// User is protected against damaging moves this round. Decreases the Attack of
// the user of a stopped contact move by 2 stages. (King's Shield)
//===============================================================================
export class ProtectUserFromDamagingMovesKingsShield extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.KingsShield;
  }
}
registerMoveClass("ProtectUserFromDamagingMovesKingsShield", ProtectUserFromDamagingMovesKingsShield);

//===============================================================================
// For the rest of this round, the user avoids all damaging moves that would hit
// it. If a move that makes contact is stopped by this effect, decreases the
// Defense of the Pokémon using that move by 2 stages. Contributes to Protect's
// counter. (Obstruct)
//===============================================================================
export class ProtectUserFromDamagingMovesObstruct extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.Obstruct;
  }
}
registerMoveClass("ProtectUserFromDamagingMovesObstruct", ProtectUserFromDamagingMovesObstruct);

//===============================================================================
// User is protected against moves that target it this round. Damages the user of
// a stopped contact move by 1/8 of its max HP. (Spiky Shield)
//===============================================================================
export class ProtectUserFromTargetingMovesSpikyShield extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.SpikyShield;
  }
}
registerMoveClass("ProtectUserFromTargetingMovesSpikyShield", ProtectUserFromTargetingMovesSpikyShield);

//===============================================================================
// This round, the user's side is unaffected by damaging moves. (Mat Block)
//===============================================================================
export class ProtectUserSideFromDamagingMovesIfUserFirstTurn extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.turnCount > 1) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedLastInRound(user)) return true;
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.MatBlock] = true;
    await this.battle.pbDisplay(_INTL("{1} intends to flip up a mat and block incoming attacks!", user.pbThis()));
  }
}
registerMoveClass("ProtectUserSideFromDamagingMovesIfUserFirstTurn", ProtectUserSideFromDamagingMovesIfUserFirstTurn);

//===============================================================================
// User's side is protected against status moves this round. (Crafty Shield)
//===============================================================================
export class ProtectUserSideFromStatusMoves extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOwnSide().effects[PBEffects.CraftyShield]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedLastInRound(user)) return true;
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.CraftyShield] = true;
    await this.battle.pbDisplay(_INTL("Crafty Shield protected {1}!", user.pbTeam(true)));
  }
}
registerMoveClass("ProtectUserSideFromStatusMoves", ProtectUserSideFromStatusMoves);

//===============================================================================
// User's side is protected against moves with priority greater than 0 this round.
// (Quick Guard)
//===============================================================================
export class ProtectUserSideFromPriorityMoves extends ProtectMove {
  override canSnatch(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.QuickGuard;
    this.sidedEffect = true;
  }
}
registerMoveClass("ProtectUserSideFromPriorityMoves", ProtectUserSideFromPriorityMoves);

//===============================================================================
// User's side is protected against moves that target multiple battlers this round.
// (Wide Guard)
//===============================================================================
export class ProtectUserSideFromMultiTargetDamagingMoves extends ProtectMove {
  override canSnatch(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.WideGuard;
    this.sidedEffect = true;
  }
}
registerMoveClass("ProtectUserSideFromMultiTargetDamagingMoves", ProtectUserSideFromMultiTargetDamagingMoves);

/** The protection-ending effect shared by Feint, Hyperspace Hole and Hyperspace Fury. */
function removeProtections(target: Battler): void {
  target.effects[PBEffects.BanefulBunker] = false;
  target.effects[PBEffects.KingsShield] = false;
  target.effects[PBEffects.Obstruct] = false;
  target.effects[PBEffects.Protect] = false;
  target.effects[PBEffects.SpikyShield] = false;
  target.pbOwnSide().effects[PBEffects.CraftyShield] = false;
  target.pbOwnSide().effects[PBEffects.MatBlock] = false;
  target.pbOwnSide().effects[PBEffects.QuickGuard] = false;
  target.pbOwnSide().effects[PBEffects.WideGuard] = false;
}

//===============================================================================
// Ends target's protections immediately. (Feint)
//===============================================================================
export class RemoveProtections extends Move {
  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    removeProtections(target);
  }
}
registerMoveClass("RemoveProtections", RemoveProtections);

//===============================================================================
// Ends target's protections immediately. (Hyperspace Hole)
//===============================================================================
export class RemoveProtectionsBypassSubstitute extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    removeProtections(target);
  }
}
registerMoveClass("RemoveProtectionsBypassSubstitute", RemoveProtectionsBypassSubstitute);

//===============================================================================
// Decreases the user's Defense by 1 stage. Ends target's protections
// immediately. (Hyperspace Fury)
//===============================================================================
export class HoopaRemoveProtectionsBypassSubstituteLowerUserDef1 extends StatDownMove {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 1];
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.isSpecies("HOOPA")) {
      await this.battle.pbDisplay(_INTL("But {1} can't use the move!", user.pbThis(true)));
      return true;
    } else if (user.form !== 1) {
      await this.battle.pbDisplay(_INTL("But {1} can't use it the way it is now!", user.pbThis(true)));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    removeProtections(target);
  }
}
registerMoveClass("HoopaRemoveProtectionsBypassSubstituteLowerUserDef1", HoopaRemoveProtectionsBypassSubstituteLowerUserDef1);

//===============================================================================
// User takes recoil damage equal to 1/4 of the damage this move dealt.
//===============================================================================
export class RecoilQuarterOfDamageDealt extends RecoilMove {
  override pbRecoilDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.damageState.totalHPLost / 4.0);
  }
}
registerMoveClass("RecoilQuarterOfDamageDealt", RecoilQuarterOfDamageDealt);

//===============================================================================
// User takes recoil damage equal to 1/3 of the damage this move dealt.
//===============================================================================
export class RecoilThirdOfDamageDealt extends RecoilMove {
  override pbRecoilDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.damageState.totalHPLost / 3.0);
  }
}
registerMoveClass("RecoilThirdOfDamageDealt", RecoilThirdOfDamageDealt);

//===============================================================================
// User takes recoil damage equal to 1/3 of the damage this move dealt.
// May paralyze the target. (Volt Tackle)
//===============================================================================
export class RecoilThirdOfDamageDealtParalyzeTarget extends RecoilMove {
  override pbRecoilDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.damageState.totalHPLost / 3.0);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user);
  }
}
registerMoveClass("RecoilThirdOfDamageDealtParalyzeTarget", RecoilThirdOfDamageDealtParalyzeTarget);

//===============================================================================
// User takes recoil damage equal to 1/3 of the damage this move dealt.
// May burn the target. (Flare Blitz)
//===============================================================================
export class RecoilThirdOfDamageDealtBurnTarget extends RecoilMove {
  override pbRecoilDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.damageState.totalHPLost / 3.0);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanBurn(user, false, this)) await target.pbBurn(user);
  }
}
registerMoveClass("RecoilThirdOfDamageDealtBurnTarget", RecoilThirdOfDamageDealtBurnTarget);

//===============================================================================
// User takes recoil damage equal to 1/2 of the damage this move dealt.
// (Head Smash, Light of Ruin)
//===============================================================================
export class RecoilHalfOfDamageDealt extends RecoilMove {
  override pbRecoilDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.damageState.totalHPLost / 2.0);
  }
}
registerMoveClass("RecoilHalfOfDamageDealt", RecoilHalfOfDamageDealt);

//===============================================================================
// Type effectiveness is multiplied by the Flying-type's effectiveness against
// the target. (Flying Press)
//===============================================================================
export class EffectivenessIncludesFlyingType extends Move {
  override pbCalcTypeModSingle(moveType: Id, defType: Id, user: Battler, target: Battler): number {
    let ret = super.pbCalcTypeModSingle(moveType, defType, user, target);
    if (Type.exists("FLYING")) {
      const flyingEff = Effectiveness.calculateOne("FLYING", defType);
      ret *= flyingEff / Effectiveness.NORMAL_EFFECTIVE_ONE;
    }
    return ret;
  }
}
registerMoveClass("EffectivenessIncludesFlyingType", EffectivenessIncludesFlyingType);

//===============================================================================
// Poisons the target. This move becomes physical or special, whichever will deal
// more damage (only considers stats, stat stages and Wonder Room). Makes contact
// if it is a physical move. Has a different animation depending on the move's
// category. (Shell Side Arm)
//===============================================================================
export class CategoryDependsOnHigherDamagePoisonTarget extends PoisonTarget {
  calcCategory: number;

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.calcCategory = 1;
  }

  override physicalMove(_thisType: Id | null = null): boolean { return this.calcCategory === 0; }
  override specialMove(_thisType: Id | null = null): boolean { return this.calcCategory === 1; }
  override contactMove(): boolean { return this.physicalMove(); }

  override async pbOnStartUse(user: Battler, targets: Battler[]): Promise<void> {
    const target = targets[0]!;
    const stageMul = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
    const stageDiv = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
    // Calculate user's effective attacking values
    const attackStage = user.stages.ATTACK! + 6;
    const realAttack = Math.floor(user.attack * stageMul[attackStage]! / stageDiv[attackStage]!);
    const specialAttackStage = user.stages.SPECIAL_ATTACK! + 6;
    const realSpecialAttack = Math.floor(user.spatk * stageMul[specialAttackStage]! / stageDiv[specialAttackStage]!);
    // Calculate target's effective defending values
    const defenseStage = target.stages.DEFENSE! + 6;
    const realDefense = Math.floor(target.defense * stageMul[defenseStage]! / stageDiv[defenseStage]!);
    const specialDefenseStage = target.stages.SPECIAL_DEFENSE! + 6;
    const realSpecialDefense = Math.floor(target.spdef * stageMul[specialDefenseStage]! / stageDiv[specialDefenseStage]!);
    // Perform simple damage calculation
    const physicalDamage = realAttack / realDefense;
    const specialDamage = realSpecialAttack / realSpecialDefense;
    // Determine move's category
    if (physicalDamage === specialDamage) {
      // NOTE (Ruby parity): Ruby assigns the random category to a misspelled
      //       @calcCategry, so on a tie the random number is drawn but the
      //       category stays what it was (special unless a previous use made it
      //       physical).
      this.battle.pbRandom(2);
    } else {
      this.calcCategory = (physicalDamage > specialDamage) ? 0 : 1;
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.physicalMove()) hitNum = 1;
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("CategoryDependsOnHigherDamagePoisonTarget", CategoryDependsOnHigherDamagePoisonTarget);

//===============================================================================
// Ignores all abilities that alter this move's success or damage. This move is
// physical if user's Attack is higher than its Special Attack (after applying
// stat stages), and special otherwise. (Photon Geyser)
//===============================================================================
export class CategoryDependsOnHigherDamageIgnoreTargetAbility extends IgnoreTargetAbility {
  calcCategory: number;

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.calcCategory = 1;
  }

  override physicalMove(_thisType: Id | null = null): boolean { return this.calcCategory === 0; }
  override specialMove(_thisType: Id | null = null): boolean { return this.calcCategory === 1; }

  /**
   * Generation 9 Pack (alias): adds Ability Shield immunity. (The core method
   * replaces IgnoreTargetAbility's pbOnStartUse without calling it.)
   */
  override async pbOnStartUse(user: Battler, targets: Battler[]): Promise<void> {
    // Essentials
    // Calculate user's effective attacking value
    const stageMul = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
    const stageDiv = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
    const atk = user.attack;
    const atkStage = user.stages.ATTACK! + 6;
    const realAtk = Math.floor(atk * stageMul[atkStage]! / stageDiv[atkStage]!);
    const spAtk = user.spatk;
    const spAtkStage = user.stages.SPECIAL_ATTACK! + 6;
    const realSpAtk = Math.floor(spAtk * stageMul[spAtkStage]! / stageDiv[spAtkStage]!);
    // Determine move's category
    this.calcCategory = (realAtk > realSpAtk) ? 0 : 1;
    // Generation 9 Pack
    if (this.battle.moldBreaker && targets[0]!.hasActiveItem("ABILITYSHIELD")) {
      this.battle.moldBreaker = false;
    }
  }
}
registerMoveClass("CategoryDependsOnHigherDamageIgnoreTargetAbility", CategoryDependsOnHigherDamageIgnoreTargetAbility);

//===============================================================================
// The user's Defense (and its Defense stat stages) are used instead of the
// user's Attack (and Attack stat stages) to calculate damage. All other effects
// are applied normally, applying the user's Attack modifiers and not the user's
// Defence modifiers. (Body Press)
//===============================================================================
export class UseUserBaseDefenseInsteadOfUserBaseAttack extends Move {
  override pbGetAttackStats(user: Battler, _target: Battler): [number, number] {
    return [user.defense, user.stages.DEFENSE! + 6];
  }
}
registerMoveClass("UseUserBaseDefenseInsteadOfUserBaseAttack", UseUserBaseDefenseInsteadOfUserBaseAttack);

//===============================================================================
// Target's Attack is used instead of user's Attack for this move's calculations.
// (Foul Play)
//===============================================================================
export class UseTargetAttackInsteadOfUserAttack extends Move {
  override pbGetAttackStats(_user: Battler, target: Battler): [number, number] {
    if (this.specialMove()) {
      return [target.spatk, target.stages.SPECIAL_ATTACK! + 6];
    }
    return [target.attack, target.stages.ATTACK! + 6];
  }
}
registerMoveClass("UseTargetAttackInsteadOfUserAttack", UseTargetAttackInsteadOfUserAttack);

//===============================================================================
// Target's Defense is used instead of its Special Defense for this move's
// calculations. (Psyshock, Psystrike, Secret Sword)
//===============================================================================
export class UseTargetDefenseInsteadOfTargetSpDef extends Move {
  override pbGetDefenseStats(_user: Battler, target: Battler): [number, number] {
    return [target.defense, target.stages.DEFENSE! + 6];
  }
}
registerMoveClass("UseTargetDefenseInsteadOfTargetSpDef", UseTargetDefenseInsteadOfTargetSpDef);

//===============================================================================
// User's attack next round against the target will definitely hit.
// (Lock-On, Mind Reader)
//===============================================================================
export class EnsureNextMoveAlwaysHits extends Move {
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    user.effects[PBEffects.LockOn] = 2;
    user.effects[PBEffects.LockOnPos] = target.index;
    await this.battle.pbDisplay(_INTL("{1} took aim at {2}!", user.pbThis(), target.pbThis(true)));
  }
}
registerMoveClass("EnsureNextMoveAlwaysHits", EnsureNextMoveAlwaysHits);

//===============================================================================
// Target's evasion stat changes are ignored from now on. (Foresight, Odor Sleuth)
// Normal and Fighting moves have normal effectiveness against the Ghost-type target.
//===============================================================================
export class StartNegateTargetEvasionStatStageAndGhostImmunity extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Foresight] = true;
    await this.battle.pbDisplay(_INTL("{1} was identified!", target.pbThis()));
  }
}
registerMoveClass("StartNegateTargetEvasionStatStageAndGhostImmunity", StartNegateTargetEvasionStatStageAndGhostImmunity);

//===============================================================================
// Target's evasion stat changes are ignored from now on. (Miracle Eye)
// Psychic moves have normal effectiveness against the Dark-type target.
//===============================================================================
export class StartNegateTargetEvasionStatStageAndDarkImmunity extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.MiracleEye] = true;
    await this.battle.pbDisplay(_INTL("{1} was identified!", target.pbThis()));
  }
}
registerMoveClass("StartNegateTargetEvasionStatStageAndDarkImmunity", StartNegateTargetEvasionStatStageAndDarkImmunity);

//===============================================================================
// This move ignores target's Defense, Special Defense and evasion stat changes.
// (Chip Away, Darkest Lariat, Sacred Sword)
//===============================================================================
export class IgnoreTargetDefSpDefEvaStatStages extends Move {
  // (The core defines pbCalcAccuracyMultipliers, a method nothing calls, so it
  // doesn't ignore evasion; the v20.1 Hotfix below adds the right method.)

  /** v20.1 Hotfixes: fixed Chip Away/Darkest Lariat/Sacred Sword not ignoring the target's evasion. */
  override pbCalcAccuracyModifiers(user: Battler, target: Battler, modifiers: AccuracyModifiers): void {
    super.pbCalcAccuracyModifiers(user, target, modifiers);
    modifiers.evasion_stage = 0;
  }

  override pbGetDefenseStats(user: Battler, target: Battler): [number, number] {
    const [ret1] = super.pbGetDefenseStats(user, target);
    return [ret1, 6]; // Def/SpDef stat stage
  }
}
registerMoveClass("IgnoreTargetDefSpDefEvaStatStages", IgnoreTargetDefSpDefEvaStatStages);

//===============================================================================
// This move's type is the same as the user's first type. (Revelation Dance)
//===============================================================================
export class TypeIsUserFirstType extends Move {
  override pbBaseType(user: Battler): Id | null {
    const userTypes = user.pbTypes(true);
    return userTypes[0] || this.type;
  }
}
registerMoveClass("TypeIsUserFirstType", TypeIsUserFirstType);

//===============================================================================
// Power and type depends on the user's IVs. (Hidden Power)
//===============================================================================
export class TypeDependsOnUserIVs extends Move {
  override pbBaseType(user: Battler): Id | null {
    const hp = pbHiddenPower(user.pokemon!);
    return hp[0];
  }

  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) return super.pbBaseDamage(baseDmg, user, target);
    const hp = pbHiddenPower(user.pokemon!);
    return hp[1];
  }
}
registerMoveClass("TypeDependsOnUserIVs", TypeDependsOnUserIVs);

/**
 * Hidden Power's [type, power] for a Pokémon (Ruby's top-level pbHiddenPower;
 * also used by GameData::Move and Anticipation). The type is null if no type
 * qualifies.
 * NOTE: This allows Hidden Power to be Fairy-type (if you have that type in your
 *       game). I don't care that the official games don't work like that.
 */
export function pbHiddenPower(pkmn: Pokemon): [Id | null, number] {
  const iv = pkmn.iv;
  let idxType = 0;
  let power = 60;
  const byIcon: Id[][] = [];
  for (const t of Type.each()) {
    byIcon[t.iconPosition] ??= [];
    if (!t.pseudoType && !["NORMAL", "SHADOW"].includes(t.id)) byIcon[t.iconPosition]!.push(t.id);
  }
  // types.flatten!.compact! (flat() also skips the holes)
  const types = byIcon.flat().filter((t) => t != null);
  idxType |= (iv.HP! & 1);
  idxType |= (iv.ATTACK! & 1) << 1;
  idxType |= (iv.DEFENSE! & 1) << 2;
  idxType |= (iv.SPEED! & 1) << 3;
  idxType |= (iv.SPECIAL_ATTACK! & 1) << 4;
  idxType |= (iv.SPECIAL_DEFENSE! & 1) << 5;
  idxType = Math.floor((types.length - 1) * idxType / 63);
  const type = types.at(idxType) ?? null; // (Ruby Array#[]: -1 if there are no types)
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME <= 5) {
    const powerMin = 30;
    const powerMax = 70;
    // NOTE (Ruby parity): the bits are ORed into the initial 60, as in Ruby.
    power |= (iv.HP! & 2) >> 1;
    power |= (iv.ATTACK! & 2);
    power |= (iv.DEFENSE! & 2) << 1;
    power |= (iv.SPEED! & 2) << 2;
    power |= (iv.SPECIAL_ATTACK! & 2) << 3;
    power |= (iv.SPECIAL_DEFENSE! & 2) << 4;
    power = powerMin + Math.floor((powerMax - powerMin) * power / 63);
  }
  return [type, power];
}

//===============================================================================
// Power and type depend on the user's held berry. Destroys the berry.
// (Natural Gift)
//===============================================================================
export class TypeAndPowerDependOnUserBerry extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    // NOTE: Unnerve does not stop a Pokémon using this move.
    const item = user.item;
    if (!item || !item.isBerry() || !user.itemActive() ||
        !item.flags.some((f) => /^NaturalGift_/i.test(f))) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  // NOTE: The AI calls this method via pbCalcType, and this method returns a
  //       type assuming user has an item even though it might not. Since the AI
  //       won't want to use this move if the user has no item, though, perhaps
  //       this is good enough.
  override pbBaseType(user: Battler): Id | null {
    const item = user.item;
    let ret: Id = "NORMAL";
    if (item) {
      for (const flag of item.flags) {
        const m = /^NaturalGift_(\w+)_(?:\d+)$/i.exec(flag);
        if (!m) continue;
        const typ = m[1]!;
        if (Type.exists(typ)) ret = typ;
        break;
      }
    }
    return ret;
  }

  /** This is a separate method so that the AI can use it as well */
  pbNaturalGiftBaseDamage(heldItem: Id | null): number {
    if (heldItem) {
      for (const flag of Item.get(heldItem).flags) {
        const m = /^NaturalGift_(?:\w+)_(\d+)$/i.exec(flag);
        if (m) return Math.max(parseInt(m[1]!, 10), 10);
      }
    }
    return 1;
  }

  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    return this.pbNaturalGiftBaseDamage(user.item!.id);
  }

  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], _numHits: number,
    _switchedBattlers: number[]): Promise<void> {
    // NOTE: The item is consumed even if this move was Protected against or it
    //       missed. The item is not consumed if the target was switched out by
    //       an effect like a target's Red Card.
    // NOTE: There is no item consumption animation.
    if (user.item) await user.pbConsumeItem(true, true, false);
  }
}
registerMoveClass("TypeAndPowerDependOnUserBerry", TypeAndPowerDependOnUserBerry);

/** pbBaseType of the Plate/Memory/Drive moves: the type of the user's held item, if active. */
function itemTypesBaseType(user: Battler, itemTypes: Map<Id, Id>): Id {
  let ret: Id = "NORMAL";
  if (user.itemActive()) {
    for (const [item, itemType] of itemTypes) {
      if (user.item?.id !== item) continue;
      if (Type.exists(itemType)) ret = itemType;
      break;
    }
  }
  return ret;
}

//===============================================================================
// Type depends on the user's held Plate. (Judgment)
//===============================================================================
export class TypeDependsOnUserPlate extends Move {
  itemTypes: Map<Id, Id>;

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.itemTypes = new Map<Id, Id>([
      ["FISTPLATE", "FIGHTING"],
      ["SKYPLATE", "FLYING"],
      ["TOXICPLATE", "POISON"],
      ["EARTHPLATE", "GROUND"],
      ["STONEPLATE", "ROCK"],
      ["INSECTPLATE", "BUG"],
      ["SPOOKYPLATE", "GHOST"],
      ["IRONPLATE", "STEEL"],
      ["FLAMEPLATE", "FIRE"],
      ["SPLASHPLATE", "WATER"],
      ["MEADOWPLATE", "GRASS"],
      ["ZAPPLATE", "ELECTRIC"],
      ["MINDPLATE", "PSYCHIC"],
      ["ICICLEPLATE", "ICE"],
      ["DRACOPLATE", "DRAGON"],
      ["DREADPLATE", "DARK"],
      ["PIXIEPLATE", "FAIRY"],
    ]);
  }

  /**
   * Generation 9 Pack: Legend Plate. Judgment becomes the best type against the
   * (last non-fainted, non-Commander) target and Arceus changes form to match.
   */
  override async pbOnStartUse(user: Battler, targets: Battler[]): Promise<void> {
    if (user.hasLegendPlateJudgment() && targets.length > 0) {
      let target: Battler | null = null;
      for (const b of targets) {
        if (!b || b.fainted() || b.isCommander()) continue;
        target = b;
      }
      const newType = await (this.battle as unknown as BattleWithJudgment)
        .pbGetBestTypeJudgment(user, target, this, user.legendPlateType);
      const newForm = Type.get(newType).iconPosition;
      const typeName = Type.get(newType).name;
      this.calcType = newType;
      if (user.form !== newForm) {
        await this.battle.scene.pbArceusTransform?.(user.index, newType);
        await user.pbChangeForm(newForm,
          _INTL("{1} transformed into the {2} type!", user.pbThis(), typeName));
      }
    }
  }

  /** Generation 9 Pack (alias): Arceus holding the Legend Plate uses its Legend Plate type. */
  override pbBaseType(user: Battler): Id | null {
    if (user.hasLegendPlateJudgment()) {
      return user.legendPlateType;
    }
    // Essentials
    return itemTypesBaseType(user, this.itemTypes);
  }
}
registerMoveClass("TypeDependsOnUserPlate", TypeDependsOnUserPlate);

//===============================================================================
// Type depends on the user's held Memory. (Multi-Attack)
//===============================================================================
export class TypeDependsOnUserMemory extends Move {
  itemTypes: Map<Id, Id>;

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.itemTypes = new Map<Id, Id>([
      ["FIGHTINGMEMORY", "FIGHTING"],
      ["FLYINGMEMORY", "FLYING"],
      ["POISONMEMORY", "POISON"],
      ["GROUNDMEMORY", "GROUND"],
      ["ROCKMEMORY", "ROCK"],
      ["BUGMEMORY", "BUG"],
      ["GHOSTMEMORY", "GHOST"],
      ["STEELMEMORY", "STEEL"],
      ["FIREMEMORY", "FIRE"],
      ["WATERMEMORY", "WATER"],
      ["GRASSMEMORY", "GRASS"],
      ["ELECTRICMEMORY", "ELECTRIC"],
      ["PSYCHICMEMORY", "PSYCHIC"],
      ["ICEMEMORY", "ICE"],
      ["DRAGONMEMORY", "DRAGON"],
      ["DARKMEMORY", "DARK"],
      ["FAIRYMEMORY", "FAIRY"],
    ]);
  }

  override pbBaseType(user: Battler): Id | null {
    return itemTypesBaseType(user, this.itemTypes);
  }
}
registerMoveClass("TypeDependsOnUserMemory", TypeDependsOnUserMemory);

//===============================================================================
// Type depends on the user's held Drive. (Techno Blast)
//===============================================================================
export class TypeDependsOnUserDrive extends Move {
  itemTypes: Map<Id, Id>;

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.itemTypes = new Map<Id, Id>([
      ["SHOCKDRIVE", "ELECTRIC"],
      ["BURNDRIVE", "FIRE"],
      ["CHILLDRIVE", "ICE"],
      ["DOUSEDRIVE", "WATER"],
    ]);
  }

  override pbBaseType(user: Battler): Id | null {
    return itemTypesBaseType(user, this.itemTypes);
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, _hitNum = 0,
    showAnimation = true): Promise<void> {
    const t = this.pbBaseType(user);
    let hitNum = 0;
    if (t === "ELECTRIC") hitNum = 1;
    if (t === "FIRE") hitNum = 2;
    if (t === "ICE") hitNum = 3;
    if (t === "WATER") hitNum = 4;
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("TypeDependsOnUserDrive", TypeDependsOnUserDrive);

//===============================================================================
// Increases the user's Speed by 1 stage. This move's type depends on the user's
// form (Electric if Full Belly, Dark if Hangry). Fails if the user is not
// Morpeko (works if transformed into Morpeko). (Aura Wheel)
//===============================================================================
export class TypeDependsOnUserMorpekoFormRaiseUserSpeed1 extends RaiseUserSpeed1 {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.isSpecies("MORPEKO") && user.effects[PBEffects.TransformSpecies] !== "MORPEKO") {
      await this.battle.pbDisplay(_INTL("But {1} can't use the move!", user.pbThis()));
      return true;
    }
    return false;
  }

  override pbBaseType(user: Battler): Id | null {
    if (user.form === 1 && Type.exists("DARK")) return "DARK";
    return this.type;
  }
}
registerMoveClass("TypeDependsOnUserMorpekoFormRaiseUserSpeed1", TypeDependsOnUserMorpekoFormRaiseUserSpeed1);

//===============================================================================
// Power is doubled in weather. Type changes depending on the weather. (Weather Ball)
//===============================================================================
export class TypeAndPowerDependOnWeather extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    if (user.effectiveWeather() !== "None") baseDmg *= 2;
    return baseDmg;
  }

  override pbBaseType(user: Battler): Id | null {
    let ret: Id = "NORMAL";
    switch (user.effectiveWeather()) {
      case "Sun": case "HarshSun":
        if (Type.exists("FIRE")) ret = "FIRE";
        break;
      case "Rain": case "HeavyRain":
        if (Type.exists("WATER")) ret = "WATER";
        break;
      case "Sandstorm":
        if (Type.exists("ROCK")) ret = "ROCK";
        break;
      case "Hail":
        if (Type.exists("ICE")) ret = "ICE";
        break;
    }
    return ret;
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    const t = this.pbBaseType(user);
    if (t === "FIRE") hitNum = 1; // Type-specific anims
    if (t === "WATER") hitNum = 2;
    if (t === "ROCK") hitNum = 3;
    if (t === "ICE") hitNum = 4;
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("TypeAndPowerDependOnWeather", TypeAndPowerDependOnWeather);

//===============================================================================
// Power is doubled if a terrain applies and user is grounded; also, this move's
// type and animation depends on the terrain. (Terrain Pulse)
//===============================================================================
export class TypeAndPowerDependOnTerrain extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    if (this.battle.field.terrain !== "None" && user.affectedByTerrain()) baseDmg *= 2;
    return baseDmg;
  }

  override pbBaseType(_user: Battler): Id | null {
    let ret: Id = "NORMAL";
    switch (this.battle.field.terrain) {
      case "Electric":
        if (Type.exists("ELECTRIC")) ret = "ELECTRIC";
        break;
      case "Grassy":
        if (Type.exists("GRASS")) ret = "GRASS";
        break;
      case "Misty":
        if (Type.exists("FAIRY")) ret = "FAIRY";
        break;
      case "Psychic":
        if (Type.exists("PSYCHIC")) ret = "PSYCHIC";
        break;
    }
    return ret;
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    const t = this.pbBaseType(user);
    if (t === "ELECTRIC") hitNum = 1; // Type-specific anims
    if (t === "GRASS") hitNum = 2;
    if (t === "FAIRY") hitNum = 3;
    if (t === "PSYCHIC") hitNum = 4;
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("TypeAndPowerDependOnTerrain", TypeAndPowerDependOnTerrain);

//===============================================================================
// Target's moves become Electric-type for the rest of the round. (Electrify)
//===============================================================================
export class TargetMovesBecomeElectric extends Move {
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Electrify]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedTargetAlreadyMoved(target, showMessage)) return true;
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Electrify] = true;
    await this.battle.pbDisplay(_INTL("{1}'s moves have been electrified!", target.pbThis()));
  }
}
registerMoveClass("TargetMovesBecomeElectric", TargetMovesBecomeElectric);

//===============================================================================
// All Normal-type moves become Electric-type for the rest of the round.
// (Ion Deluge, Plasma Fists)
//===============================================================================
export class NormalMovesBecomeElectric extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (this.battle.field.effects[PBEffects.IonDeluge]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedLastInRound(user)) return true;
    return false;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    if (this.battle.field.effects[PBEffects.IonDeluge]) return;
    this.battle.field.effects[PBEffects.IonDeluge] = true;
    await this.battle.pbDisplay(_INTL("A deluge of ions showers the battlefield!"));
  }
}
registerMoveClass("NormalMovesBecomeElectric", NormalMovesBecomeElectric);
