// Port of Data/Scripts/011_Battle/003_Move/010_MoveEffects_Healing.rb, with:
// - v20.1 Hotfixes (Battle bug fixes.rb:469): HealUserByTargetAttackLowerTargetAttack1
//   (Strength Sap) pbEffectAgainstTarget is redefined (Liquid Ooze is checked
//   with ignore_fainted = true).
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:72):
//   HealUserAndAlliesQuarterOfTotalHPCureStatus (Jungle Healing)
//   pbEffectAgainstTarget is redefined (Drowsy/Frostbite messages); :139
//   HealUserFullyAndFallAsleep (Rest) pbMoveFailed? (Purifying Salt).
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:89):
//   HealUserByTargetAttackLowerTargetAttack1 pbEffectAgainstTarget (healing
//   isn't reduced while Dynamaxed); :402 UserFaintsExplosive pbMoveFailed? (fails
//   for a Max Raid Pokémon); :419 StartPerishCountsForAllBattlers pbMoveFailed?
//   (fails in a Max Raid battle); :433 AttackerFaintsIfUserFaints pbMoveFailed?
//   (fails for a Max Raid Pokémon).
// Alias chains (load order Hotfixes → Gen 9 → ZUD):
//   HealUserFullyAndFallAsleep#pbMoveFailed? = Gen 9( core )
//   HealUserAndAlliesQuarterOfTotalHPCureStatus#pbEffectAgainstTarget = Gen 9 (redefined)
//   HealUserByTargetAttackLowerTargetAttack1#pbEffectAgainstTarget = ZUD( Hotfixes ) (the
//     Hotfixes version replaces core's)
//   UserFaintsExplosive / StartPerishCountsForAllBattlers / AttackerFaintsIfUserFaints
//     #pbMoveFailed? = ZUD( core )

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Scene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Move, registerMoveClass } from "./Move";
import { FixedDamageMove, HealingMove, TargetMultiStatDownMove } from "./Move_BaseEffects";

//===============================================================================
// Heals user to full HP. User falls asleep for 2 more rounds. (Rest)
//===============================================================================
export class HealUserFullyAndFallAsleep extends HealingMove {
  /** Generation 9 Pack (alias): fails if the user has Purifying Salt. */
  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (user.hasActiveAbility("PURIFYINGSALT")) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return this.paldeaPbMoveFailed(user, targets);
  }

  /** Core Essentials' pbMoveFailed? (aliased as paldea_pbMoveFailed? by the Gen 9 Pack). */
  private async paldeaPbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (user.asleep()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (!(await user.pbCanSleepAsync(user, true, this, true))) return true;
    if (await super.pbMoveFailed(user, targets)) return true;
    return false;
  }

  override pbHealAmount(user: Battler): number {
    return user.totalhp - user.hp;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await user.pbSleepSelf(_INTL("{1} slept and became healthy!", user.pbThis()), 3);
    await super.pbEffectGeneral(user);
  }
}
registerMoveClass("HealUserFullyAndFallAsleep", HealUserFullyAndFallAsleep);

//===============================================================================
// Heals user by 1/2 of its max HP.
//===============================================================================
export class HealUserHalfOfTotalHP extends HealingMove {
  override pbHealAmount(user: Battler): number {
    return rubyRound(user.totalhp / 2.0);
  }
}
registerMoveClass("HealUserHalfOfTotalHP", HealUserHalfOfTotalHP);

//===============================================================================
// Heals user by an amount depending on the weather. (Moonlight, Morning Sun,
// Synthesis)
//===============================================================================
export class HealUserDependingOnWeather extends HealingMove {
  /** Ruby: nil until pbOnStartUse. */
  healAmount: number | null = null;

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    switch (user.effectiveWeather()) {
      case "Sun": case "HarshSun":
        this.healAmount = rubyRound(user.totalhp * 2 / 3.0);
        break;
      case "None": case "StrongWinds":
        this.healAmount = rubyRound(user.totalhp / 2.0);
        break;
      default:
        this.healAmount = rubyRound(user.totalhp / 4.0);
        break;
    }
  }

  override pbHealAmount(_user: Battler): number {
    return this.healAmount as number;
  }
}
registerMoveClass("HealUserDependingOnWeather", HealUserDependingOnWeather);

//===============================================================================
// Heals user by 1/2 of its max HP, or 2/3 of its max HP in a sandstorm. (Shore Up)
//===============================================================================
export class HealUserDependingOnSandstorm extends HealingMove {
  override pbHealAmount(user: Battler): number {
    if (user.effectiveWeather() === "Sandstorm") return rubyRound(user.totalhp * 2 / 3.0);
    return rubyRound(user.totalhp / 2.0);
  }
}
registerMoveClass("HealUserDependingOnSandstorm", HealUserDependingOnSandstorm);

//===============================================================================
// Heals user by 1/2 of its max HP. (Roost)
// User roosts, and its Flying type is ignored for attacks used against it.
//===============================================================================
export class HealUserHalfOfTotalHPLoseFlyingTypeThisTurn extends HealingMove {
  override pbHealAmount(user: Battler): number {
    return rubyRound(user.totalhp / 2.0);
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await super.pbEffectGeneral(user);
    user.effects[PBEffects.Roost] = true;
  }
}
registerMoveClass("HealUserHalfOfTotalHPLoseFlyingTypeThisTurn", HealUserHalfOfTotalHPLoseFlyingTypeThisTurn);

//===============================================================================
// Cures the target's permanent status problems. Heals user by 1/2 of its max HP.
// (Purify)
//===============================================================================
export class CureTargetStatusHealUserHalfOfTotalHP extends HealingMove {
  override canSnatch(): boolean { return false; } // Because it affects a target
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.status === "NONE") {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override pbHealAmount(user: Battler): number {
    return rubyRound(user.totalhp / 2.0);
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await target.pbCureStatus();
    await super.pbEffectAgainstTarget(user, target);
  }
}
registerMoveClass("CureTargetStatusHealUserHalfOfTotalHP", CureTargetStatusHealUserHalfOfTotalHP);

//===============================================================================
// Decreases the target's Attack by 1 stage. Heals user by an amount equal to the
// target's Attack stat (after applying stat stages, before this move decreases
// it). (Strength Sap)
//===============================================================================
export class HealUserByTargetAttackLowerTargetAttack1 extends Move {
  override healingMove(): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // NOTE: The official games appear to just check whether the target's Attack
    //       stat stage is -6 and fail if so, but I've added the "fail if target
    //       has Contrary and is at +6" check too for symmetry. This move still
    //       works even if the stat stage cannot be changed due to an ability or
    //       other effect.
    if (!this.battle.moldBreaker && target.hasActiveAbility("CONTRARY") &&
        target.statStageAtMax("ATTACK")) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    } else if (target.statStageAtMin("ATTACK")) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** ZUD Mechanics (alias): healing isn't reduced while Dynamaxed. */
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    user.ignoreDynamax = true;
    await this.zudPbEffectAgainstTarget(user, target);
    user.ignoreDynamax = false;
  }

  /**
   * v20.1 Hotfixes' pbEffectAgainstTarget (replaces core's; aliased as
   * zud_pbEffectAgainstTarget by ZUD Mechanics).
   */
  private async zudPbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    // Calculate target's effective attack value
    const stageMul = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
    const stageDiv = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
    const atk = target.attack;
    const atkStage = target.stages["ATTACK"]! + 6;
    let healAmt = Math.floor(atk * stageMul[atkStage]! / stageDiv[atkStage]!);
    // Reduce target's Attack stat
    if (await target.pbCanLowerStatStage("ATTACK", user, this)) {
      await target.pbLowerStatStage("ATTACK", 1, user);
    }
    // Heal user
    if (target.hasActiveAbility("LIQUIDOOZE", true)) {
      await this.battle.pbShowAbilitySplash(target);
      await user.pbReduceHP(healAmt);
      await this.battle.pbDisplay(_INTL("{1} sucked up the liquid ooze!", user.pbThis()));
      await this.battle.pbHideAbilitySplash(target);
      await user.pbItemHPHealCheck();
    } else if (user.canHeal()) {
      if (user.hasActiveItem("BIGROOT")) healAmt = Math.floor(healAmt * 1.3);
      await user.pbRecoverHP(healAmt);
      await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", user.pbThis()));
    }
  }
}
registerMoveClass("HealUserByTargetAttackLowerTargetAttack1", HealUserByTargetAttackLowerTargetAttack1);

//===============================================================================
// User gains half the HP it inflicts as damage.
//===============================================================================
export class HealUserByHalfOfDamageDone extends Move {
  override healingMove(): boolean { return Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.hpLost <= 0) return;
    const hpGain = rubyRound(target.damageState.hpLost / 2.0);
    await user.pbRecoverHPFromDrain(hpGain, target);
  }
}
registerMoveClass("HealUserByHalfOfDamageDone", HealUserByHalfOfDamageDone);

//===============================================================================
// User gains half the HP it inflicts as damage. Fails if target is not asleep.
// (Dream Eater)
//===============================================================================
export class HealUserByHalfOfDamageDoneIfTargetAsleep extends Move {
  override healingMove(): boolean { return Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.asleep()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} wasn't affected!", target.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.hpLost <= 0) return;
    const hpGain = rubyRound(target.damageState.hpLost / 2.0);
    await user.pbRecoverHPFromDrain(hpGain, target);
  }
}
registerMoveClass("HealUserByHalfOfDamageDoneIfTargetAsleep", HealUserByHalfOfDamageDoneIfTargetAsleep);

//===============================================================================
// User gains 3/4 the HP it inflicts as damage. (Draining Kiss, Oblivion Wing)
//===============================================================================
export class HealUserByThreeQuartersOfDamageDone extends Move {
  override healingMove(): boolean { return Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.hpLost <= 0) return;
    const hpGain = rubyRound(target.damageState.hpLost * 0.75);
    await user.pbRecoverHPFromDrain(hpGain, target);
  }
}
registerMoveClass("HealUserByThreeQuartersOfDamageDone", HealUserByThreeQuartersOfDamageDone);

//===============================================================================
// The user and its allies gain 25% of their total HP. (Life Dew)
//===============================================================================
export class HealUserAndAlliesQuarterOfTotalHP extends Move {
  override healingMove(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.allSameSideBattlers(user).some((b) => b.canHeal())) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, _showMessage: boolean): Promise<boolean> {
    return !target.canHeal();
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    await target.pbRecoverHP(Math.floor(target.totalhp / 4));
    await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", target.pbThis()));
  }
}
registerMoveClass("HealUserAndAlliesQuarterOfTotalHP", HealUserAndAlliesQuarterOfTotalHP);

//===============================================================================
// The user and its allies gain 25% of their total HP and are cured of their
// permanent status problems. (Jungle Healing)
//===============================================================================
export class HealUserAndAlliesQuarterOfTotalHPCureStatus extends Move {
  override healingMove(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.allSameSideBattlers(user).some((b) => b.canHeal() || b.status !== "NONE")) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, _showMessage: boolean): Promise<boolean> {
    return target.status === "NONE" && !target.canHeal();
  }

  /** Generation 9 Pack (redefined): adds messages for Drowsy/Frostbite. */
  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (target.canHeal()) {
      await target.pbRecoverHP(Math.floor(target.totalhp / 4));
      await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", target.pbThis()));
    }
    if (target.status !== "NONE") {
      const oldStatus = target.status;
      await target.pbCureStatus(false);
      switch (oldStatus) {
        case "SLEEP":
          await this.battle.pbDisplay(_INTL("{1} was woken from sleep.", target.pbThis()));
          break;
        case "POISON":
          await this.battle.pbDisplay(_INTL("{1} was cured of its poisoning.", target.pbThis()));
          break;
        case "BURN":
          await this.battle.pbDisplay(_INTL("{1}'s burn was healed.", target.pbThis()));
          break;
        case "PARALYSIS":
          await this.battle.pbDisplay(_INTL("{1} was cured of paralysis.", target.pbThis()));
          break;
        case "FROZEN":
          await this.battle.pbDisplay(_INTL("{1} was thawed out.", target.pbThis()));
          break;
        case "DROWSY":
          await this.battle.pbDisplay(_INTL("{1} became alert again.", target.pbThis()));
          break;
        case "FROSTBITE":
          await this.battle.pbDisplay(_INTL("{1}'s frostbite was healed.", target.pbThis()));
          break;
      }
    }
  }
}
registerMoveClass("HealUserAndAlliesQuarterOfTotalHPCureStatus", HealUserAndAlliesQuarterOfTotalHPCureStatus);

//===============================================================================
// Heals target by 1/2 of its max HP. (Heal Pulse)
//===============================================================================
export class HealTargetHalfOfTotalHP extends Move {
  override healingMove(): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.hp === target.totalhp) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s HP is full!", target.pbThis()));
      return true;
    } else if (!target.canHeal()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    let hpGain = rubyRound(target.totalhp / 2.0);
    if (this.pulseMove() && user.hasActiveAbility("MEGALAUNCHER")) {
      hpGain = rubyRound(target.totalhp * 3 / 4.0);
    }
    await target.pbRecoverHP(hpGain);
    await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", target.pbThis()));
  }
}
registerMoveClass("HealTargetHalfOfTotalHP", HealTargetHalfOfTotalHP);

//===============================================================================
// Heals target by 1/2 of its max HP, or 2/3 of its max HP in Grassy Terrain.
// (Floral Healing)
//===============================================================================
export class HealTargetDependingOnGrassyTerrain extends Move {
  override healingMove(): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.hp === target.totalhp) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s HP is full!", target.pbThis()));
      return true;
    } else if (!target.canHeal()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    let hpGain = rubyRound(target.totalhp / 2.0);
    if (this.battle.field.terrain === "Grassy") hpGain = rubyRound(target.totalhp * 2 / 3.0);
    await target.pbRecoverHP(hpGain);
    await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", target.pbThis()));
  }
}
registerMoveClass("HealTargetDependingOnGrassyTerrain", HealTargetDependingOnGrassyTerrain);

//===============================================================================
// Battler in user's position is healed by 1/2 of its max HP, at the end of the
// next round. (Wish)
//===============================================================================
export class HealUserPositionNextTurn extends Move {
  override healingMove(): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.positions[user.index]!.effects[PBEffects.Wish] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const position = this.battle.positions[user.index]!;
    position.effects[PBEffects.Wish] = 2;
    position.effects[PBEffects.WishAmount] = rubyRound(user.totalhp / 2.0);
    position.effects[PBEffects.WishMaker] = user.pokemonIndex;
  }
}
registerMoveClass("HealUserPositionNextTurn", HealUserPositionNextTurn);

//===============================================================================
// Rings the user. Ringed Pokémon gain 1/16 of max HP at the end of each round.
// (Aqua Ring)
//===============================================================================
export class StartHealUserEachTurn extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.AquaRing]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.AquaRing] = true;
    await this.battle.pbDisplay(_INTL("{1} surrounded itself with a veil of water!", user.pbThis()));
  }
}
registerMoveClass("StartHealUserEachTurn", StartHealUserEachTurn);

//===============================================================================
// Ingrains the user. Ingrained Pokémon gain 1/16 of max HP at the end of each
// round, and cannot flee or switch out. (Ingrain)
//===============================================================================
export class StartHealUserEachTurnTrapUserInBattle extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Ingrain]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Ingrain] = true;
    await this.battle.pbDisplay(_INTL("{1} planted its roots!", user.pbThis()));
  }
}
registerMoveClass("StartHealUserEachTurnTrapUserInBattle", StartHealUserEachTurnTrapUserInBattle);

//===============================================================================
// Target will lose 1/4 of max HP at end of each round, while asleep. (Nightmare)
//===============================================================================
export class StartDamageTargetEachTurnIfTargetAsleep extends Move {
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.asleep() || target.effects[PBEffects.Nightmare]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Nightmare] = true;
    await this.battle.pbDisplay(_INTL("{1} began having a nightmare!", target.pbThis()));
  }
}
registerMoveClass("StartDamageTargetEachTurnIfTargetAsleep", StartDamageTargetEachTurnIfTargetAsleep);

//===============================================================================
// Seeds the target. Seeded Pokémon lose 1/8 of max HP at the end of each round,
// and the Pokémon in the user's position gains the same amount. (Leech Seed)
//===============================================================================
export class StartLeechSeedTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.LeechSeed] >= 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} evaded the attack!", target.pbThis()));
      return true;
    }
    if (target.pbHasType("GRASS")) {
      if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      return true;
    }
    return false;
  }

  override async pbMissMessage(_user: Battler, target: Battler): Promise<boolean> {
    await this.battle.pbDisplay(_INTL("{1} evaded the attack!", target.pbThis()));
    return true;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.LeechSeed] = user.index;
    await this.battle.pbDisplay(_INTL("{1} was seeded!", target.pbThis()));
  }
}
registerMoveClass("StartLeechSeedTarget", StartLeechSeedTarget);

//===============================================================================
// The user takes damage equal to 1/2 of its total HP, even if the target is
// unaffected (this is not recoil damage). (Steel Beam)
//===============================================================================
export class UserLosesHalfOfTotalHP extends Move {
  override async pbEffectAfterAllHits(user: Battler, _target: Battler): Promise<void> {
    if (!user.takesIndirectDamage()) return;
    let amt = Math.ceil(user.totalhp / 2.0);
    if (amt < 1) amt = 1;
    await user.pbReduceHP(amt, false);
    await this.battle.pbDisplay(_INTL("{1} is damaged by recoil!", user.pbThis()));
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("UserLosesHalfOfTotalHP", UserLosesHalfOfTotalHP);

//===============================================================================
// Damages user by 1/2 of its max HP, even if this move misses. (Mind Blown)
//===============================================================================
export class UserLosesHalfOfTotalHPExplosive extends Move {
  override worksWithNoTargets(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.moldBreaker) {
      const bearer = this.battle.pbCheckGlobalAbility("DAMP");
      if (bearer) {
        await this.battle.pbShowAbilitySplash(bearer);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} cannot use {2}!", user.pbThis(), this.name));
        } else {
          await this.battle.pbDisplay(_INTL("{1} cannot use {2} because of {3}'s {4}!",
            user.pbThis(), this.name, bearer.pbThis(true), bearer.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(bearer);
        return true;
      }
    }
    return false;
  }

  override async pbSelfKO(user: Battler): Promise<void> {
    if (!user.takesIndirectDamage()) return;
    await user.pbReduceHP(rubyRound(user.totalhp / 2.0), false);
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("UserLosesHalfOfTotalHPExplosive", UserLosesHalfOfTotalHPExplosive);

//===============================================================================
// User faints, even if the move does nothing else. (Explosion, Self-Destruct)
//===============================================================================
export class UserFaintsExplosive extends Move {
  override worksWithNoTargets(): boolean { return true; }
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 1; }

  /** ZUD Mechanics (alias): fails when used by a Max Raid Pokémon. */
  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.MaxRaidBoss]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return this.zudPbMoveFailed(user, targets);
  }

  /** Core Essentials' pbMoveFailed? (aliased as zud_pbMoveFailed? by ZUD Mechanics). */
  private async zudPbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.moldBreaker) {
      const bearer = this.battle.pbCheckGlobalAbility("DAMP");
      if (bearer) {
        await this.battle.pbShowAbilitySplash(bearer);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} cannot use {2}!", user.pbThis(), this.name));
        } else {
          await this.battle.pbDisplay(_INTL("{1} cannot use {2} because of {3}'s {4}!",
            user.pbThis(), this.name, bearer.pbThis(true), bearer.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(bearer);
        return true;
      }
    }
    return false;
  }

  override async pbSelfKO(user: Battler): Promise<void> {
    if (user.fainted()) return;
    await user.pbReduceHP(user.hp, false);
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("UserFaintsExplosive", UserFaintsExplosive);

//===============================================================================
// User faints. If Misty Terrain applies, base power is multiplied by 1.5.
// (Misty Explosion)
//===============================================================================
export class UserFaintsPowersUpInMistyTerrainExplosive extends UserFaintsExplosive {
  override pbBaseDamage(baseDmg: number, _user: Battler, _target: Battler): number {
    if (this.battle.field.terrain === "Misty") baseDmg = Math.floor(baseDmg * 3 / 2);
    return baseDmg;
  }
}
registerMoveClass("UserFaintsPowersUpInMistyTerrainExplosive", UserFaintsPowersUpInMistyTerrainExplosive);

//===============================================================================
// Inflicts fixed damage equal to user's current HP. (Final Gambit)
// User faints (if successful).
//===============================================================================
export class UserFaintsFixedDamageUserHP extends FixedDamageMove {
  /** Ruby: nil until pbOnStartUse. */
  finalGambitDamage: number | null = null;

  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 1; }

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    this.finalGambitDamage = user.hp;
  }

  override pbFixedDamage(_user: Battler, _target: Battler): number {
    return this.finalGambitDamage as number;
  }

  override async pbSelfKO(user: Battler): Promise<void> {
    if (user.fainted()) return;
    await user.pbReduceHP(user.hp, false);
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("UserFaintsFixedDamageUserHP", UserFaintsFixedDamageUserHP);

//===============================================================================
// Decreases the target's Attack and Special Attack by 2 stages each. (Memento)
// User faints (if successful).
//===============================================================================
export class UserFaintsLowerTargetAtkSpAtk2 extends TargetMultiStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 2, "SPECIAL_ATTACK", 2];
  }

  override canMagicCoat(): boolean { return false; }

  // NOTE: The user faints even if the target's stats cannot be changed, so this
  //       method must always return false to allow the move's usage to continue.
  override async pbFailsAgainstTarget(_user: Battler, _target: Battler, _showMessage: boolean): Promise<boolean> {
    return false;
  }

  override async pbSelfKO(user: Battler): Promise<void> {
    if (user.fainted()) return;
    await user.pbReduceHP(user.hp, false);
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("UserFaintsLowerTargetAtkSpAtk2", UserFaintsLowerTargetAtkSpAtk2);

//===============================================================================
// User faints. The Pokémon that replaces the user is fully healed (HP and
// status). Fails if user won't be replaced. (Healing Wish)
//===============================================================================
export class UserFaintsHealAndCureReplacement extends Move {
  override healingMove(): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.pbCanChooseNonActive(user.index)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbSelfKO(user: Battler): Promise<void> {
    if (user.fainted()) return;
    await user.pbReduceHP(user.hp, false);
    await user.pbItemHPHealCheck();
    this.battle.positions[user.index]!.effects[PBEffects.HealingWish] = true;
  }
}
registerMoveClass("UserFaintsHealAndCureReplacement", UserFaintsHealAndCureReplacement);

//===============================================================================
// User faints. The Pokémon that replaces the user is fully healed (HP, PP and
// status). Fails if user won't be replaced. (Lunar Dance)
//===============================================================================
export class UserFaintsHealAndCureReplacementRestorePP extends Move {
  override healingMove(): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.pbCanChooseNonActive(user.index)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbSelfKO(user: Battler): Promise<void> {
    if (user.fainted()) return;
    await user.pbReduceHP(user.hp, false);
    await user.pbItemHPHealCheck();
    this.battle.positions[user.index]!.effects[PBEffects.LunarDance] = true;
  }
}
registerMoveClass("UserFaintsHealAndCureReplacementRestorePP", UserFaintsHealAndCureReplacementRestorePP);

//===============================================================================
// All current battlers will perish after 3 more rounds. (Perish Song)
//===============================================================================
export class StartPerishCountsForAllBattlers extends Move {
  /** ZUD Mechanics (alias): fails when used by any Pokémon in a Max Raid battle. */
  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    // NOTE (Ruby parity): ZUD fails the move here without showing a message.
    if (this.battle.raidBattle) return true;
    return this.zudPbMoveFailed(user, targets);
  }

  /** Core Essentials' pbMoveFailed? (aliased as zud_pbMoveFailed? by ZUD Mechanics). */
  private async zudPbMoveFailed(_user: Battler, targets: Battler[]): Promise<boolean> {
    let failed = true;
    for (const b of targets) {
      if (b.effects[PBEffects.PerishSong] > 0) continue; // Heard it before
      failed = false;
      break;
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, _showMessage: boolean): Promise<boolean> {
    return target.effects[PBEffects.PerishSong] > 0; // Heard it before
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.PerishSong] = 4;
    target.effects[PBEffects.PerishSongUser] = user.index;
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
    await this.battle.pbDisplay(_INTL("All Pokémon that hear the song will faint in three turns!"));
  }
}
registerMoveClass("StartPerishCountsForAllBattlers", StartPerishCountsForAllBattlers);

//===============================================================================
// If user is KO'd before it next moves, the battler that caused it also faints.
// (Destiny Bond)
//===============================================================================
export class AttackerFaintsIfUserFaints extends Move {
  /** ZUD Mechanics (alias): fails when used by a Max Raid Pokémon. */
  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.MaxRaidBoss]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return this.zudPbMoveFailed(user, targets);
  }

  /** Core Essentials' pbMoveFailed? (aliased as zud_pbMoveFailed? by ZUD Mechanics). */
  private async zudPbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 && user.effects[PBEffects.DestinyBondPrevious]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.DestinyBond] = true;
    await this.battle.pbDisplay(_INTL("{1} is hoping to take its attacker down with it!", user.pbThis()));
  }
}
registerMoveClass("AttackerFaintsIfUserFaints", AttackerFaintsIfUserFaints);

//===============================================================================
// If user is KO'd before it next moves, the attack that caused it loses all PP.
// (Grudge)
//===============================================================================
export class SetAttackerMovePPTo0IfUserFaints extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Grudge] = true;
    await this.battle.pbDisplay(_INTL("{1} wants its target to bear a grudge!", user.pbThis()));
  }
}
registerMoveClass("SetAttackerMovePPTo0IfUserFaints", SetAttackerMovePPTo0IfUserFaints);
