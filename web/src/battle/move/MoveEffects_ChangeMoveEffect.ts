// Port of Data/Scripts/011_Battle/003_Move/012_MoveEffects_ChangeMoveEffect.rb, with:
// - v20.1 Hotfixes (Battle bug fixes.rb:40): UseRandomMoveFromUserParty
//   (Assist) initialize pushes Obstruct onto @moveBlacklist; :48 UseLastMoveUsed
//   (Copycat) likewise.
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:193):
//   ReplaceMoveThisBattleWithTargetLastMoveUsed (Mimic) pbFailsAgainstTarget?
//   (fails on Power Moves) and pbEffectAgainstTarget (records the mimicked move
//   in base_moves); :225 ReplaceMoveWithTargetLastMoveUsed (Sketch)
//   pbFailsAgainstTarget? (fails on Power Moves); :264 UseLastMoveUsed
//   (Copycat) pbChangeUsageCounters (@copy_target), pbMoveFailed? (fails on
//   Z-Moves), pbEffectGeneral (copies a Max Move's base move); :298
//   UseMoveTargetIsAboutToUse (Me First) pbFailsAgainstTarget? (fails on Power
//   Moves); :316 UseRandomUserMoveIfAsleep (Sleep Talk) pbEffectGeneral (passes
//   the move index, for Z-Sleep Talk); :329 UseRandomMoveFromUserParty (Assist)
//   pbMoveFailed? (ignores Power Moves); :356 UseRandomMove (Metronome)
//   pbMoveFailed? (ignores Power Moves).
// Alias chains (load order Hotfixes → ZUD): every ZUD patch above is a plain
//   redefinition (no alias). ZUD doesn't touch initialize, so the Hotfixes'
//   initialize aliases still apply: initialize = Hotfixes( core ) for Assist
//   and Copycat.
//
// Sync/async of the overridden methods: see the table in Move_Usage.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Target } from "../../data/gameData/target";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { Move, registerMoveClass } from "./Move";
import { FixedDamageMove, PledgeMove } from "./Move_BaseEffects";

//===============================================================================
// This round, user becomes the target of attacks that have single targets.
// (Follow Me, Rage Powder)
//===============================================================================
export class RedirectAllMovesToUser extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.FollowMe] = 1;
    for (const b of user.allAllies()) {
      if (b.effects[PBEffects.FollowMe] < user.effects[PBEffects.FollowMe]) continue;
      user.effects[PBEffects.FollowMe] = b.effects[PBEffects.FollowMe] + 1;
    }
    if (this.powderMove()) user.effects[PBEffects.RagePowder] = true;
    await this.battle.pbDisplay(_INTL("{1} became the center of attention!", user.pbThis()));
  }
}
registerMoveClass("RedirectAllMovesToUser", RedirectAllMovesToUser);

//===============================================================================
// This round, target becomes the target of attacks that have single targets.
// (Spotlight)
//===============================================================================
export class RedirectAllMovesToTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Spotlight] = 1;
    for (const b of target.allAllies()) {
      if (b.effects[PBEffects.Spotlight] < target.effects[PBEffects.Spotlight]) continue;
      target.effects[PBEffects.Spotlight] = b.effects[PBEffects.Spotlight] + 1;
    }
    await this.battle.pbDisplay(_INTL("{1} became the center of attention!", target.pbThis()));
  }
}
registerMoveClass("RedirectAllMovesToTarget", RedirectAllMovesToTarget);

//===============================================================================
// Unaffected by moves and abilities that would redirect this move. (Snipe Shot)
//===============================================================================
export class CannotBeRedirected extends Move {
  override cannotRedirect(): boolean { return true; }
}
registerMoveClass("CannotBeRedirected", CannotBeRedirected);

//===============================================================================
// Randomly damages or heals the target. (Present)
// NOTE: Apparently a Normal Gem should be consumed even if this move will heal,
//       but I think that's silly so I've omitted that effect.
//===============================================================================
export class RandomlyDamageOrHealTarget extends Move {
  /** 0 = heal, >0 = damage (nil until pbOnStartUse). */
  presentDmg: number | null = null;

  override async pbOnStartUse(_user: Battler, _targets: Battler[]): Promise<void> {
    this.presentDmg = 0; // 0 = heal, >0 = damage
    const r = this.battle.pbRandom(100);
    if (r < 40) {
      this.presentDmg = 40;
    } else if (r < 70) {
      this.presentDmg = 80;
    } else if (r < 80) {
      this.presentDmg = 120;
    }
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.presentDmg! > 0) return false;
    if (!target.canHeal()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** pbDamagingMove? */
  override pbDamagingMove(): boolean {
    if (this.presentDmg === 0) return false;
    return super.pbDamagingMove();
  }

  override pbBaseDamage(_baseDmg: number, _user: Battler, _target: Battler): number {
    return this.presentDmg!;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (this.presentDmg! > 0) return;
    await target.pbRecoverHP(Math.floor(target.totalhp / 4));
    await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", target.pbThis()));
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.presentDmg === 0) hitNum = 1; // Healing anim
    return super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("RandomlyDamageOrHealTarget", RandomlyDamageOrHealTarget);

//===============================================================================
// Damages target if target is a foe, or heals target by 1/2 of its max HP if
// target is an ally. (Pollen Puff)
//===============================================================================
export class HealAllyOrDamageFoe extends Move {
  healing: boolean | null = null;

  override pbTarget(user: Battler | null): Target {
    if (user!.effects[PBEffects.HealBlock] > 0) return Target.get("NearFoe");
    return super.pbTarget(user);
  }

  override async pbOnStartUse(user: Battler, targets: Battler[]): Promise<void> {
    this.healing = false;
    if (targets.length > 0) this.healing = !user.opposes(targets[0]!);
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!this.healing) return false;
    if (target.effects[PBEffects.Substitute] > 0 && !this.ignoresSubstitute(user)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (!target.canHeal()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** pbDamagingMove? */
  override pbDamagingMove(): boolean {
    if (this.healing) return false;
    return super.pbDamagingMove();
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (!this.healing) return;
    await target.pbRecoverHP(Math.floor(target.totalhp / 2));
    await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", target.pbThis()));
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.healing) hitNum = 1; // Healing anim
    return super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("HealAllyOrDamageFoe", HealAllyOrDamageFoe);

//===============================================================================
// User is Ghost: User loses 1/2 of max HP, and curses the target.
// Cursed Pokémon lose 1/4 of their max HP at the end of each round.
// User is not Ghost: Decreases the user's Speed by 1 stage, and increases the
// user's Attack and Defense by 1 stage each. (Curse)
//===============================================================================
export class CurseTargetOrLowerUserSpd1RaiseUserAtkDef1 extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override pbTarget(user: Battler | null): Target {
    if (user!.pbHasType("GHOST")) {
      const ghostTarget = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8 ? "RandomNearFoe" : "NearFoe";
      return Target.get(ghostTarget);
    }
    return super.pbTarget(user);
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbHasType("GHOST")) return false;
    if (!(await user.pbCanLowerStatStage("SPEED", user, this)) &&
        !(await user.pbCanRaiseStatStage("ATTACK", user, this)) &&
        !(await user.pbCanRaiseStatStage("DEFENSE", user, this))) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (user.pbHasType("GHOST") && target.effects[PBEffects.Curse]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.pbHasType("GHOST")) return;
    // Non-Ghost effect
    if (await user.pbCanLowerStatStage("SPEED", user, this)) {
      await user.pbLowerStatStage("SPEED", 1, user);
    }
    let showAnim = true;
    if (await user.pbCanRaiseStatStage("ATTACK", user, this)) {
      if (await user.pbRaiseStatStage("ATTACK", 1, user, showAnim)) showAnim = false;
    }
    if (await user.pbCanRaiseStatStage("DEFENSE", user, this)) {
      await user.pbRaiseStatStage("DEFENSE", 1, user, showAnim);
    }
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (!user.pbHasType("GHOST")) return;
    // Ghost effect
    await this.battle.pbDisplay(_INTL("{1} cut its own HP and laid a curse on {2}!", user.pbThis(), target.pbThis(true)));
    target.effects[PBEffects.Curse] = true;
    await user.pbReduceHP(Math.floor(user.totalhp / 2), false, false);
    await user.pbItemHPHealCheck();
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (!user.pbHasType("GHOST")) hitNum = 1; // Non-Ghost anim
    return super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("CurseTargetOrLowerUserSpd1RaiseUserAtkDef1", CurseTargetOrLowerUserSpd1RaiseUserAtkDef1);

//===============================================================================
// Effect depends on the environment. (Secret Power)
//===============================================================================
export class EffectDependsOnEnvironment extends Move {
  secretPower: number | null = null;

  // NOTE (Ruby parity): 6, 10 and 12 are Mud Shot, Incinerate and Gust; the
  // flinching variants are 7, 11 and 13. Kept as in Ruby.
  override flinchingMove(): boolean { return [6, 10, 12].includes(this.secretPower as number); }

  override async pbOnStartUse(_user: Battler, _targets: Battler[]): Promise<void> {
    // NOTE: This is Gen 7's list plus some of Gen 6 plus a bit of my own.
    this.secretPower = 0; // Body Slam, paralysis
    switch (this.battle.field.terrain) {
      case "Electric":
        this.secretPower = 1; // Thunder Shock, paralysis
        break;
      case "Grassy":
        this.secretPower = 2; // Vine Whip, sleep
        break;
      case "Misty":
        this.secretPower = 3; // Fairy Wind, lower Sp. Atk by 1
        break;
      case "Psychic":
        this.secretPower = 4; // Confusion, lower Speed by 1
        break;
      default:
        switch (this.battle.environment) {
          case "Grass": case "TallGrass": case "Forest": case "ForestGrass":
            this.secretPower = 2; // (Same as Grassy Terrain)
            break;
          case "MovingWater": case "StillWater": case "Underwater":
            this.secretPower = 5; // Water Pulse, lower Attack by 1
            break;
          case "Puddle":
            this.secretPower = 6; // Mud Shot, lower Speed by 1
            break;
          case "Cave":
            this.secretPower = 7; // Rock Throw, flinch
            break;
          case "Rock": case "Sand":
            this.secretPower = 8; // Mud-Slap, lower Acc by 1
            break;
          case "Snow": case "Ice":
            this.secretPower = 9; // Ice Shard, freeze
            break;
          case "Volcano":
            this.secretPower = 10; // Incinerate, burn
            break;
          case "Graveyard":
            this.secretPower = 11; // Shadow Sneak, flinch
            break;
          case "Sky":
            this.secretPower = 12; // Gust, lower Speed by 1
            break;
          case "Space":
            this.secretPower = 13; // Swift, flinch
            break;
          case "UltraSpace":
            this.secretPower = 14; // Psywave, lower Defense by 1
            break;
        }
    }
  }

  // NOTE: This intentionally doesn't use def pbAdditionalEffect, because that
  //       method is called per hit and this move's additional effect only occurs
  //       once per use, after all the hits have happened (two hits are possible
  //       via Parental Bond).
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.fainted()) return;
    if (target.damageState.unaffected || target.damageState.substitute) return;
    const chance = this.pbAdditionalEffectChance(user, target);
    if (this.battle.pbRandom(100) >= chance) return;
    switch (this.secretPower) {
      case 2:
        if (target.pbCanSleep(user, false, this)) await target.pbSleep();
        break;
      case 10:
        if (target.pbCanBurn(user, false, this)) await target.pbBurn(user);
        break;
      case 0: case 1:
        if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user);
        break;
      case 9:
        if (target.pbCanFreeze(user, false, this)) await target.pbFreeze();
        break;
      case 5:
        if (await target.pbCanLowerStatStage("ATTACK", user, this)) {
          await target.pbLowerStatStage("ATTACK", 1, user);
        }
        break;
      case 14:
        if (await target.pbCanLowerStatStage("DEFENSE", user, this)) {
          await target.pbLowerStatStage("DEFENSE", 1, user);
        }
        break;
      case 3:
        if (await target.pbCanLowerStatStage("SPECIAL_ATTACK", user, this)) {
          await target.pbLowerStatStage("SPECIAL_ATTACK", 1, user);
        }
        break;
      case 4: case 6: case 12:
        if (await target.pbCanLowerStatStage("SPEED", user, this)) {
          await target.pbLowerStatStage("SPEED", 1, user);
        }
        break;
      case 8:
        if (await target.pbCanLowerStatStage("ACCURACY", user, this)) {
          await target.pbLowerStatStage("ACCURACY", 1, user);
        }
        break;
      case 7: case 11: case 13:
        target.pbFlinch(user);
        break;
    }
  }

  override async pbShowAnimation(_id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    let id: Id = "BODYSLAM"; // Environment-specific anim
    switch (this.secretPower) {
      case 1: if (MoveData.exists("THUNDERSHOCK")) id = "THUNDERSHOCK"; break;
      case 2: if (MoveData.exists("VINEWHIP")) id = "VINEWHIP"; break;
      case 3: if (MoveData.exists("FAIRYWIND")) id = "FAIRYWIND"; break;
      // NOTE (Ruby parity): Ruby sets the misspelt id :CONFUSIO here.
      case 4: if (MoveData.exists("CONFUSION")) id = "CONFUSIO"; break;
      case 5: if (MoveData.exists("WATERPULSE")) id = "WATERPULSE"; break;
      case 6: if (MoveData.exists("MUDSHOT")) id = "MUDSHOT"; break;
      case 7: if (MoveData.exists("ROCKTHROW")) id = "ROCKTHROW"; break;
      case 8: if (MoveData.exists("MUDSLAP")) id = "MUDSLAP"; break;
      case 9: if (MoveData.exists("ICESHARD")) id = "ICESHARD"; break;
      case 10: if (MoveData.exists("INCINERATE")) id = "INCINERATE"; break;
      case 11: if (MoveData.exists("SHADOWSNEAK")) id = "SHADOWSNEAK"; break;
      case 12: if (MoveData.exists("GUST")) id = "GUST"; break;
      case 13: if (MoveData.exists("SWIFT")) id = "SWIFT"; break;
      case 14: if (MoveData.exists("PSYWAVE")) id = "PSYWAVE"; break;
    }
    return super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("EffectDependsOnEnvironment", EffectDependsOnEnvironment);

//===============================================================================
// If Psychic Terrain applies and the user is grounded, power is multiplied by
// 1.5 (in addition to Psychic Terrain's multiplier) and it targets all opposing
// Pokémon. (Expanding Force)
//===============================================================================
export class HitsAllFoesAndPowersUpInPsychicTerrain extends Move {
  override pbTarget(user: Battler | null): Target {
    if (this.battle.field.terrain === "Psychic" && user!.affectedByTerrain()) {
      return Target.get("AllNearFoes");
    }
    return super.pbTarget(user);
  }

  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    if (this.battle.field.terrain === "Psychic" && user.affectedByTerrain()) {
      baseDmg = Math.floor(baseDmg * 3 / 2);
    }
    return baseDmg;
  }
}
registerMoveClass("HitsAllFoesAndPowersUpInPsychicTerrain", HitsAllFoesAndPowersUpInPsychicTerrain);

//===============================================================================
// Powders the foe. This round, if it uses a Fire move, it loses 1/4 of its max
// HP instead. (Powder)
//===============================================================================
export class TargetNextFireMoveDamagesTarget extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Powder]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Powder] = true;
    await this.battle.pbDisplay(_INTL("{1} is covered in powder!", user.pbThis()));
  }
}
registerMoveClass("TargetNextFireMoveDamagesTarget", TargetNextFireMoveDamagesTarget);

//===============================================================================
// Power is doubled if Fusion Flare has already been used this round. (Fusion Bolt)
//===============================================================================
export class DoublePowerAfterFusionFlare extends Move {
  doublePower: boolean | null = null;

  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    this.doublePower = this.battle.field.effects[PBEffects.FusionFlare];
    super.pbChangeUsageCounters(user, specialUsage);
  }

  override pbBaseDamageMultiplier(damageMult: number, _user: Battler, _target: Battler): number {
    if (this.doublePower) damageMult *= 2;
    return damageMult;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    this.battle.field.effects[PBEffects.FusionBolt] = true;
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    const t = targets as Battler[];
    if ((t.length > 0 && t[0]!.damageState.critical) ||
        this.doublePower) hitNum = 1; // Charged anim
    return super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("DoublePowerAfterFusionFlare", DoublePowerAfterFusionFlare);

//===============================================================================
// Power is doubled if Fusion Bolt has already been used this round. (Fusion Flare)
//===============================================================================
export class DoublePowerAfterFusionBolt extends Move {
  doublePower: boolean | null = null;

  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    this.doublePower = this.battle.field.effects[PBEffects.FusionBolt];
    super.pbChangeUsageCounters(user, specialUsage);
  }

  override pbBaseDamageMultiplier(damageMult: number, _user: Battler, _target: Battler): number {
    if (this.doublePower) damageMult *= 2;
    return damageMult;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    this.battle.field.effects[PBEffects.FusionFlare] = true;
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    const t = targets as Battler[];
    if ((t.length > 0 && t[0]!.damageState.critical) ||
        this.doublePower) hitNum = 1; // Charged anim
    return super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("DoublePowerAfterFusionBolt", DoublePowerAfterFusionBolt);

//===============================================================================
// Powers up the ally's attack this round by 1.5. (Helping Hand)
//===============================================================================
export class PowerUpAllyMove extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.fainted() || target.effects[PBEffects.HelpingHand]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedTargetAlreadyMoved(target, showMessage)) return true;
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.HelpingHand] = true;
    await this.battle.pbDisplay(_INTL("{1} is ready to help {2}!", user.pbThis(), target.pbThis(true)));
  }
}
registerMoveClass("PowerUpAllyMove", PowerUpAllyMove);

//===============================================================================
// Counters a physical move used against the user this round, with 2x the power.
// (Counter)
//===============================================================================
export class CounterPhysicalDamage extends FixedDamageMove {
  override pbAddTarget(targets: Battler[], user: Battler): void {
    const t: number = user.effects[PBEffects.CounterTarget];
    if (t < 0 || !user.opposes(t)) return;
    user.pbAddTarget(targets, user, this.battle.battlers[t], this, false);
  }

  override async pbMoveFailed(_user: Battler, targets: Battler[]): Promise<boolean> {
    if (targets.length === 0) {
      await this.battle.pbDisplay(_INTL("But there was no target..."));
      return true;
    }
    return false;
  }

  override pbFixedDamage(user: Battler, _target: Battler): number {
    let dmg: number = user.effects[PBEffects.Counter] * 2;
    if (dmg === 0) dmg = 1;
    return dmg;
  }
}
registerMoveClass("CounterPhysicalDamage", CounterPhysicalDamage);

//===============================================================================
// Counters a specical move used against the user this round, with 2x the power.
// (Mirror Coat)
//===============================================================================
export class CounterSpecialDamage extends FixedDamageMove {
  override pbAddTarget(targets: Battler[], user: Battler): void {
    const t: number = user.effects[PBEffects.MirrorCoatTarget];
    if (t < 0 || !user.opposes(t)) return;
    user.pbAddTarget(targets, user, this.battle.battlers[t], this, false);
  }

  override async pbMoveFailed(_user: Battler, targets: Battler[]): Promise<boolean> {
    if (targets.length === 0) {
      await this.battle.pbDisplay(_INTL("But there was no target..."));
      return true;
    }
    return false;
  }

  override pbFixedDamage(user: Battler, _target: Battler): number {
    let dmg: number = user.effects[PBEffects.MirrorCoat] * 2;
    if (dmg === 0) dmg = 1;
    return dmg;
  }
}
registerMoveClass("CounterSpecialDamage", CounterSpecialDamage);

//===============================================================================
// Counters the last damaging move used against the user this round, with 1.5x
// the power. (Metal Burst)
//===============================================================================
export class CounterDamagePlusHalf extends FixedDamageMove {
  override pbAddTarget(targets: Battler[], user: Battler): void {
    if (user.lastFoeAttacker.length === 0) return;
    const lastAttacker = user.lastFoeAttacker[user.lastFoeAttacker.length - 1]!;
    if (lastAttacker < 0 || !user.opposes(lastAttacker)) return;
    user.pbAddTarget(targets, user, this.battle.battlers[lastAttacker], this, false);
  }

  override async pbMoveFailed(_user: Battler, targets: Battler[]): Promise<boolean> {
    if (targets.length === 0) {
      await this.battle.pbDisplay(_INTL("But there was no target..."));
      return true;
    }
    return false;
  }

  override pbFixedDamage(user: Battler, _target: Battler): number {
    let dmg = Math.floor(user.lastHPLostFromFoe * 1.5);
    if (dmg === 0) dmg = 1;
    return dmg;
  }
}
registerMoveClass("CounterDamagePlusHalf", CounterDamagePlusHalf);

//===============================================================================
// Increases the user's Defense and Special Defense by 1 stage each. Ups the
// user's stockpile by 1 (max. 3). (Stockpile)
//===============================================================================
export class UserAddStockpileRaiseDefSpDef1 extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Stockpile] >= 3) {
      await this.battle.pbDisplay(_INTL("{1} can't stockpile any more!", user.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Stockpile] += 1;
    await this.battle.pbDisplay(_INTL("{1} stockpiled {2}!",
      user.pbThis(), user.effects[PBEffects.Stockpile]));
    let showAnim = true;
    if (await user.pbCanRaiseStatStage("DEFENSE", user, this)) {
      if (await user.pbRaiseStatStage("DEFENSE", 1, user, showAnim)) {
        user.effects[PBEffects.StockpileDef] += 1;
        showAnim = false;
      }
    }
    if (await user.pbCanRaiseStatStage("SPECIAL_DEFENSE", user, this)) {
      if (await user.pbRaiseStatStage("SPECIAL_DEFENSE", 1, user, showAnim)) {
        user.effects[PBEffects.StockpileSpDef] += 1;
      }
    }
  }
}
registerMoveClass("UserAddStockpileRaiseDefSpDef1", UserAddStockpileRaiseDefSpDef1);

//===============================================================================
// Power is 100 multiplied by the user's stockpile (X). Resets the stockpile to
// 0. Decreases the user's Defense and Special Defense by X stages each. (Spit Up)
//===============================================================================
export class PowerDependsOnUserStockpile extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Stockpile] === 0) {
      await this.battle.pbDisplay(_INTL("But it failed to spit up a thing!"));
      return true;
    }
    return false;
  }

  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    return 100 * user.effects[PBEffects.Stockpile];
  }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (user.fainted() || user.effects[PBEffects.Stockpile] === 0) return;
    if (target.damageState.unaffected) return;
    await this.battle.pbDisplay(_INTL("{1}'s stockpiled effect wore off!", user.pbThis()));
    if (this.battle.pbAllFainted(target.idxOwnSide())) return;
    let showAnim = true;
    if (user.effects[PBEffects.StockpileDef] > 0 &&
        await user.pbCanLowerStatStage("DEFENSE", user, this)) {
      if (await user.pbLowerStatStage("DEFENSE", user.effects[PBEffects.StockpileDef], user, showAnim)) showAnim = false;
    }
    if (user.effects[PBEffects.StockpileSpDef] > 0 &&
        await user.pbCanLowerStatStage("SPECIAL_DEFENSE", user, this)) {
      await user.pbLowerStatStage("SPECIAL_DEFENSE", user.effects[PBEffects.StockpileSpDef], user, showAnim);
    }
    user.effects[PBEffects.Stockpile] = 0;
    user.effects[PBEffects.StockpileDef] = 0;
    user.effects[PBEffects.StockpileSpDef] = 0;
  }
}
registerMoveClass("PowerDependsOnUserStockpile", PowerDependsOnUserStockpile);

//===============================================================================
// Heals user depending on the user's stockpile (X). Resets the stockpile to 0.
// Decreases the user's Defense and Special Defense by X stages each. (Swallow)
//===============================================================================
export class HealUserDependingOnUserStockpile extends Move {
  override healingMove(): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Stockpile] === 0) {
      await this.battle.pbDisplay(_INTL("But it failed to swallow a thing!"));
      return true;
    }
    if (!user.canHeal() &&
        user.effects[PBEffects.StockpileDef] === 0 &&
        user.effects[PBEffects.StockpileSpDef] === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    let hpGain = 0;
    switch (Math.max(user.effects[PBEffects.Stockpile], 1)) {
      case 1: hpGain = Math.floor(user.totalhp / 4); break;
      case 2: hpGain = Math.floor(user.totalhp / 2); break;
      case 3: hpGain = user.totalhp; break;
    }
    if (await user.pbRecoverHP(hpGain) > 0) {
      await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", user.pbThis()));
    }
    await this.battle.pbDisplay(_INTL("{1}'s stockpiled effect wore off!", user.pbThis()));
    let showAnim = true;
    if (user.effects[PBEffects.StockpileDef] > 0 &&
        await user.pbCanLowerStatStage("DEFENSE", user, this)) {
      if (await user.pbLowerStatStage("DEFENSE", user.effects[PBEffects.StockpileDef], user, showAnim)) {
        showAnim = false;
      }
    }
    if (user.effects[PBEffects.StockpileSpDef] > 0 &&
        await user.pbCanLowerStatStage("SPECIAL_DEFENSE", user, this)) {
      await user.pbLowerStatStage("SPECIAL_DEFENSE", user.effects[PBEffects.StockpileSpDef], user, showAnim);
    }
    user.effects[PBEffects.Stockpile] = 0;
    user.effects[PBEffects.StockpileDef] = 0;
    user.effects[PBEffects.StockpileSpDef] = 0;
  }
}
registerMoveClass("HealUserDependingOnUserStockpile", HealUserDependingOnUserStockpile);

//===============================================================================
// Combos with another Pledge move used by the ally. (Grass Pledge)
// If the move is a combo, power is doubled and causes either a sea of fire or a
// swamp on the opposing side.
//===============================================================================
export class GrassPledge extends PledgeMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    // [Function code to combo with, effect, override type, override animation]
    this.combos = [["FirePledge", "SeaOfFire", "FIRE", "FIREPLEDGE"],
      ["WaterPledge", "Swamp", null, null]];
  }
}
registerMoveClass("GrassPledge", GrassPledge);

//===============================================================================
// Combos with another Pledge move used by the ally. (Fire Pledge)
// If the move is a combo, power is doubled and causes either a rainbow on the
// user's side or a sea of fire on the opposing side.
//===============================================================================
export class FirePledge extends PledgeMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    // [Function code to combo with, effect, override type, override animation]
    this.combos = [["WaterPledge", "Rainbow", "WATER", "WATERPLEDGE"],
      ["GrassPledge", "SeaOfFire", null, null]];
  }
}
registerMoveClass("FirePledge", FirePledge);

//===============================================================================
// Combos with another Pledge move used by the ally. (Water Pledge)
// If the move is a combo, power is doubled and causes either a swamp on the
// opposing side or a rainbow on the user's side.
//===============================================================================
export class WaterPledge extends PledgeMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    // [Function code to combo with, effect, override type, override animation]
    this.combos = [["GrassPledge", "Swamp", "GRASS", "GRASSPLEDGE"],
      ["FirePledge", "Rainbow", null, null]];
  }
}
registerMoveClass("WaterPledge", WaterPledge);

//===============================================================================
// Uses the last move that was used. (Copycat)
//===============================================================================
export class UseLastMoveUsed extends Move {
  moveBlacklist: string[];
  copiedMove: Id | null = null;
  /** ZUD Mechanics: @copy_target, the battler that used @copied_move. */
  copyTarget: number | null = null;

  override callsAnotherMove(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      // Struggle, Belch
      "Struggle", // Struggle
      "FailsIfUserNotConsumedBerry", // Belch              # Not listed on Bulbapedia
      // Moves that affect the moveset
      "ReplaceMoveThisBattleWithTargetLastMoveUsed", // Mimic
      "ReplaceMoveWithTargetLastMoveUsed", // Sketch
      "TransformUserIntoTarget", // Transform
      // Counter moves
      "CounterPhysicalDamage", // Counter
      "CounterSpecialDamage", // Mirror Coat
      "CounterDamagePlusHalf", // Metal Burst        # Not listed on Bulbapedia
      // Helping Hand, Feint (always blacklisted together, don't know why)
      "PowerUpAllyMove", // Helping Hand
      "RemoveProtections", // Feint
      // Protection moves
      "ProtectUser", // Detect, Protect
      "ProtectUserSideFromPriorityMoves", // Quick Guard        # Not listed on Bulbapedia
      "ProtectUserSideFromMultiTargetDamagingMoves", // Wide Guard         # Not listed on Bulbapedia
      "UserEnduresFaintingThisTurn", // Endure
      "ProtectUserSideFromDamagingMovesIfUserFirstTurn", // Mat Block
      "ProtectUserSideFromStatusMoves", // Crafty Shield      # Not listed on Bulbapedia
      "ProtectUserFromDamagingMovesKingsShield", // King's Shield
      "ProtectUserFromDamagingMovesObstruct", // Obstruct           # Not listed on Bulbapedia
      "ProtectUserFromTargetingMovesSpikyShield", // Spiky Shield
      "ProtectUserBanefulBunker", // Baneful Bunker
      // Moves that call other moves
      "UseLastMoveUsedByTarget", // Mirror Move
      "UseLastMoveUsed", // Copycat (this move)
      "UseMoveTargetIsAboutToUse", // Me First
      "UseMoveDependingOnEnvironment", // Nature Power       # Not listed on Bulbapedia
      "UseRandomUserMoveIfAsleep", // Sleep Talk
      "UseRandomMoveFromUserParty", // Assist
      "UseRandomMove", // Metronome
      // Move-redirecting and stealing moves
      "BounceBackProblemCausingStatusMoves", // Magic Coat         # Not listed on Bulbapedia
      "StealAndUseBeneficialStatusMove", // Snatch
      "RedirectAllMovesToUser", // Follow Me, Rage Powder
      "RedirectAllMovesToTarget", // Spotlight
      // Set up effects that trigger upon KO
      "ReduceAttackerMovePPTo0IfUserFaints", // Grudge             # Not listed on Bulbapedia
      "AttackerFaintsIfUserFaints", // Destiny Bond
      // Held item-moving moves
      "UserTakesTargetItem", // Covet, Thief
      "UserTargetSwapItems", // Switcheroo, Trick
      "TargetTakesUserItem", // Bestow
      // Moves that start focussing at the start of the round
      "FailsIfUserDamagedThisTurn", // Focus Punch
      "UsedAfterUserTakesPhysicalDamage", // Shell Trap
      "BurnAttackerBeforeUserActs", // Beak Blast
      // Event moves that do nothing
      "DoesNothingFailsIfNoAlly", // Hold Hands
      "DoesNothingCongratulations", // Celebrate
    ];
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      this.moveBlacklist = this.moveBlacklist.concat([
        // Target-switching moves
        "SwitchOutTargetStatusMove", // Roar, Whirlwind
        "SwitchOutTargetDamagingMove", // Circle Throw, Dragon Tail
      ]);
    }
    // v20.1 Hotfixes: Added Obstruct to the blacklist.
    // NOTE (Ruby parity): Obstruct is already in the list, so it's in it twice.
    this.moveBlacklist.push("ProtectUserFromDamagingMovesObstruct");
  }

  /** ZUD Mechanics: also records the user of the copied move. */
  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    super.pbChangeUsageCounters(user, specialUsage);
    this.copiedMove = this.battle.lastMoveUsed;
    this.copyTarget = this.battle.lastMoveUser;
  }

  /** ZUD Mechanics: fails when the last used move was a Z-Move. */
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.copiedMove || MoveData.get(this.copiedMove).zMove() ||
        this.moveBlacklist.includes(MoveData.get(this.copiedMove).functionCode)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** ZUD Mechanics: if the last move used was a Max Move, copies the base move of that Max Move. */
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (MoveData.get(this.copiedMove!).maxMove()) {
      this.battle.eachBattler((b) => {
        if (b.index !== this.copyTarget) return;
        const idxMove: number = this.battle.choices[b.index]![1];
        // .at: Ruby's base_moves[-1] when idxMove is -1 (a called move)
        this.copiedMove = b.baseMoves.at(idxMove)!.id;
      });
    }
    await user.pbUseMoveSimple(this.copiedMove!);
  }
}
registerMoveClass("UseLastMoveUsed", UseLastMoveUsed);

//===============================================================================
// Uses the last move that the target used. (Mirror Move)
//===============================================================================
export class UseLastMoveUsedByTarget extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override callsAnotherMove(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.lastRegularMoveUsed ||
        !MoveData.get(target.lastRegularMoveUsed).flags.some((f) => /^CanMirrorMove$/i.test(f))) {
      if (showMessage) await this.battle.pbDisplay(_INTL("The mirror move failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await user.pbUseMoveSimple(target.lastRegularMoveUsed!, target.index);
  }

  override async pbShowAnimation(_id: Id, _user: Battler, _targets: Battler | Battler[] | null, _hitNum = 0,
    _showAnimation = true): Promise<void> {
    // No animation
  }
}
registerMoveClass("UseLastMoveUsedByTarget", UseLastMoveUsedByTarget);

//===============================================================================
// Uses the move the target was about to use this round, with 1.5x power.
// (Me First)
//===============================================================================
export class UseMoveTargetIsAboutToUse extends Move {
  moveBlacklist: string[];

  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override callsAnotherMove(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      "UserTakesTargetItem", // Covet, Thief
      // Struggle, Belch
      "Struggle", // Struggle
      "FailsIfUserNotConsumedBerry", // Belch
      // Counter moves
      "CounterPhysicalDamage", // Counter
      "CounterSpecialDamage", // Mirror Coat
      "CounterDamagePlusHalf", // Metal Burst
      // Moves that start focussing at the start of the round
      "FailsIfUserDamagedThisTurn", // Focus Punch
      "UsedAfterUserTakesPhysicalDamage", // Shell Trap
      "BurnAttackerBeforeUserActs", // Beak Blast
    ];
  }

  /** ZUD Mechanics: fails when attempting to copy a target's Z-Move/Max Move. */
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (await this.pbMoveFailedTargetAlreadyMoved(target, showMessage)) return true;
    const oppMove = this.battle.choices[target.index]![2] as Move | null;
    if (!oppMove || oppMove.statusMove() || this.moveBlacklist.includes(oppMove.function) || oppMove.powerMove()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    user.effects[PBEffects.MeFirst] = true;
    await user.pbUseMoveSimple((this.battle.choices[target.index]![2] as Move).id);
    user.effects[PBEffects.MeFirst] = false;
  }
}
registerMoveClass("UseMoveTargetIsAboutToUse", UseMoveTargetIsAboutToUse);

//===============================================================================
// Uses a different move depending on the environment. (Nature Power)
// NOTE: This code does not support the Gen 5 and older definition of the move
//       where it targets the user. It makes more sense for it to target another
//       Pokémon.
//===============================================================================
export class UseMoveDependingOnEnvironment extends Move {
  npMove: Id | null = null;

  override callsAnotherMove(): boolean { return true; }

  override async pbOnStartUse(_user: Battler, _targets: Battler[]): Promise<void> {
    // NOTE: It's possible in theory to not have the move Nature Power wants to
    //       turn into, but what self-respecting game wouldn't at least have Tri
    //       Attack in it?
    this.npMove = "TRIATTACK";
    switch (this.battle.field.terrain) {
      case "Electric":
        if (MoveData.exists("THUNDERBOLT")) this.npMove = "THUNDERBOLT";
        break;
      case "Grassy":
        if (MoveData.exists("ENERGYBALL")) this.npMove = "ENERGYBALL";
        break;
      case "Misty":
        if (MoveData.exists("MOONBLAST")) this.npMove = "MOONBLAST";
        break;
      case "Psychic":
        if (MoveData.exists("PSYCHIC")) this.npMove = "PSYCHIC";
        break;
      default: {
        let tryMove: Id | null = null;
        switch (this.battle.environment) {
          case "Grass": case "TallGrass": case "Forest": case "ForestGrass":
            tryMove = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 ? "ENERGYBALL" : "SEEDBOMB";
            break;
          case "MovingWater": case "StillWater": case "Underwater":
            tryMove = "HYDROPUMP";
            break;
          case "Puddle":
            tryMove = "MUDBOMB";
            break;
          case "Cave":
            tryMove = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 ? "POWERGEM" : "ROCKSLIDE";
            break;
          case "Rock": case "Sand":
            tryMove = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 ? "EARTHPOWER" : "EARTHQUAKE";
            break;
          case "Snow":
            tryMove = "BLIZZARD";
            if (Settings.MECHANICS_GENERATION_AT_RUNTIME === 6) tryMove = "FROSTBREATH";
            if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7) tryMove = "ICEBEAM";
            break;
          case "Ice":
            tryMove = "ICEBEAM";
            break;
          case "Volcano":
            tryMove = "LAVAPLUME";
            break;
          case "Graveyard":
            tryMove = "SHADOWBALL";
            break;
          case "Sky":
            tryMove = "AIRSLASH";
            break;
          case "Space":
            tryMove = "DRACOMETEOR";
            break;
          case "UltraSpace":
            tryMove = "PSYSHOCK";
            break;
        }
        if (MoveData.exists(tryMove)) this.npMove = tryMove;
      }
    }
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} turned into {2}!", this.name, MoveData.get(this.npMove!).name));
    await user.pbUseMoveSimple(this.npMove!, target.index);
  }
}
registerMoveClass("UseMoveDependingOnEnvironment", UseMoveDependingOnEnvironment);

//===============================================================================
// Uses a random move that exists. (Metronome)
//===============================================================================
export class UseRandomMove extends Move {
  moveBlacklist: string[];
  metronomeMove: Id | null = null;

  override callsAnotherMove(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      "FlinchTargetFailsIfUserNotAsleep", // Snore
      "TargetActsNext", // After You
      "TargetActsLast", // Quash
      "TargetUsesItsLastUsedMoveAgain", // Instruct
      // Struggle, Belch
      "Struggle", // Struggle
      "FailsIfUserNotConsumedBerry", // Belch
      // Moves that affect the moveset
      "ReplaceMoveThisBattleWithTargetLastMoveUsed", // Mimic
      "ReplaceMoveWithTargetLastMoveUsed", // Sketch
      "TransformUserIntoTarget", // Transform
      // Counter moves
      "CounterPhysicalDamage", // Counter
      "CounterSpecialDamage", // Mirror Coat
      "CounterDamagePlusHalf", // Metal Burst        # Not listed on Bulbapedia
      // Helping Hand, Feint (always blacklisted together, don't know why)
      "PowerUpAllyMove", // Helping Hand
      "RemoveProtections", // Feint
      // Protection moves
      "ProtectUser", // Detect, Protect
      "ProtectUserSideFromPriorityMoves", // Quick Guard
      "ProtectUserSideFromMultiTargetDamagingMoves", // Wide Guard
      "UserEnduresFaintingThisTurn", // Endure
      "ProtectUserSideFromDamagingMovesIfUserFirstTurn", // Mat Block
      "ProtectUserSideFromStatusMoves", // Crafty Shield
      "ProtectUserFromDamagingMovesKingsShield", // King's Shield
      "ProtectUserFromDamagingMovesObstruct", // Obstruct
      "ProtectUserFromTargetingMovesSpikyShield", // Spiky Shield
      "ProtectUserBanefulBunker", // Baneful Bunker
      // Moves that call other moves
      "UseLastMoveUsedByTarget", // Mirror Move
      "UseLastMoveUsed", // Copycat
      "UseMoveTargetIsAboutToUse", // Me First
      "UseMoveDependingOnEnvironment", // Nature Power
      "UseRandomUserMoveIfAsleep", // Sleep Talk
      "UseRandomMoveFromUserParty", // Assist
      "UseRandomMove", // Metronome
      // Move-redirecting and stealing moves
      "BounceBackProblemCausingStatusMoves", // Magic Coat         # Not listed on Bulbapedia
      "StealAndUseBeneficialStatusMove", // Snatch
      "RedirectAllMovesToUser", // Follow Me, Rage Powder
      "RedirectAllMovesToTarget", // Spotlight
      // Set up effects that trigger upon KO
      "ReduceAttackerMovePPTo0IfUserFaints", // Grudge             # Not listed on Bulbapedia
      "AttackerFaintsIfUserFaints", // Destiny Bond
      // Held item-moving moves
      "UserTakesTargetItem", // Covet, Thief
      "UserTargetSwapItems", // Switcheroo, Trick
      "TargetTakesUserItem", // Bestow
      // Moves that start focussing at the start of the round
      "FailsIfUserDamagedThisTurn", // Focus Punch
      "UsedAfterUserTakesPhysicalDamage", // Shell Trap
      "BurnAttackerBeforeUserActs", // Beak Blast
      // Event moves that do nothing
      "DoesNothingFailsIfNoAlly", // Hold Hands
      "DoesNothingCongratulations", // Celebrate
    ];
  }

  /** ZUD Mechanics: ignores Z-Moves/Max Moves when calling a random move. */
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    this.metronomeMove = null;
    const moveKeys = MoveData.keys();
    // NOTE: You could be really unlucky and roll blacklisted moves 1000 times in
    //       a row. This is too unlikely to care about, though.
    for (let n = 0; n < 1000; n++) {
      const moveId = moveKeys[this.battle.pbRandom(moveKeys.length)]!;
      const moveData = MoveData.get(moveId);
      if (this.moveBlacklist.includes(moveData.functionCode)) continue;
      if (moveData.hasFlag("CannotMetronome")) continue;
      if (moveData.type === "SHADOW") continue;
      if (moveData.powerMove()) continue;
      this.metronomeMove = moveData.id;
      break;
    }
    if (!this.metronomeMove) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await user.pbUseMoveSimple(this.metronomeMove!);
  }
}
registerMoveClass("UseRandomMove", UseRandomMove);

//===============================================================================
// Uses a random move known by any non-user Pokémon in the user's party. (Assist)
//===============================================================================
export class UseRandomMoveFromUserParty extends Move {
  moveBlacklist: string[];
  assistMoves: Id[] = [];

  override callsAnotherMove(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      // Struggle, Belch
      "Struggle", // Struggle
      "FailsIfUserNotConsumedBerry", // Belch
      // Moves that affect the moveset
      "ReplaceMoveThisBattleWithTargetLastMoveUsed", // Mimic
      "ReplaceMoveWithTargetLastMoveUsed", // Sketch
      "TransformUserIntoTarget", // Transform
      // Counter moves
      "CounterPhysicalDamage", // Counter
      "CounterSpecialDamage", // Mirror Coat
      "CounterDamagePlusHalf", // Metal Burst        # Not listed on Bulbapedia
      // Helping Hand, Feint (always blacklisted together, don't know why)
      "PowerUpAllyMove", // Helping Hand
      "RemoveProtections", // Feint
      // Protection moves
      "ProtectUser", // Detect, Protect
      "ProtectUserSideFromPriorityMoves", // Quick Guard        # Not listed on Bulbapedia
      "ProtectUserSideFromMultiTargetDamagingMoves", // Wide Guard         # Not listed on Bulbapedia
      "UserEnduresFaintingThisTurn", // Endure
      "ProtectUserSideFromDamagingMovesIfUserFirstTurn", // Mat Block
      "ProtectUserSideFromStatusMoves", // Crafty Shield      # Not listed on Bulbapedia
      "ProtectUserFromDamagingMovesKingsShield", // King's Shield
      "ProtectUserFromDamagingMovesObstruct", // Obstruct           # Not listed on Bulbapedia
      "ProtectUserFromTargetingMovesSpikyShield", // Spiky Shield
      "ProtectUserBanefulBunker", // Baneful Bunker
      // Moves that call other moves
      "UseLastMoveUsedByTarget", // Mirror Move
      "UseLastMoveUsed", // Copycat
      "UseMoveTargetIsAboutToUse", // Me First
      // "UseMoveDependingOnEnvironment",                    # Nature Power       # See below
      "UseRandomUserMoveIfAsleep", // Sleep Talk
      "UseRandomMoveFromUserParty", // Assist
      "UseRandomMove", // Metronome
      // Move-redirecting and stealing moves
      "BounceBackProblemCausingStatusMoves", // Magic Coat         # Not listed on Bulbapedia
      "StealAndUseBeneficialStatusMove", // Snatch
      "RedirectAllMovesToUser", // Follow Me, Rage Powder
      "RedirectAllMovesToTarget", // Spotlight
      // Set up effects that trigger upon KO
      "ReduceAttackerMovePPTo0IfUserFaints", // Grudge             # Not listed on Bulbapedia
      "AttackerFaintsIfUserFaints", // Destiny Bond
      // Target-switching moves
      // "SwitchOutTargetStatusMove",                        # Roar, Whirlwind    # See below
      "SwitchOutTargetDamagingMove", // Circle Throw, Dragon Tail
      // Held item-moving moves
      "UserTakesTargetItem", // Covet, Thief
      "UserTargetSwapItems", // Switcheroo, Trick
      "TargetTakesUserItem", // Bestow
      // Moves that start focussing at the start of the round
      "FailsIfUserDamagedThisTurn", // Focus Punch
      "UsedAfterUserTakesPhysicalDamage", // Shell Trap
      "BurnAttackerBeforeUserActs", // Beak Blast
      // Event moves that do nothing
      "DoesNothingFailsIfNoAlly", // Hold Hands
      "DoesNothingCongratulations", // Celebrate
    ];
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      this.moveBlacklist = this.moveBlacklist.concat([
        // Moves that call other moves
        "UseMoveDependingOnEnvironment", // Nature Power
        // Two-turn attacks
        "TwoTurnAttack", // Razor Wind                # Not listed on Bulbapedia
        "TwoTurnAttackOneTurnInSun", // Solar Beam, Solar Blade   # Not listed on Bulbapedia
        "TwoTurnAttackParalyzeTarget", // Freeze Shock              # Not listed on Bulbapedia
        "TwoTurnAttackBurnTarget", // Ice Burn                  # Not listed on Bulbapedia
        "TwoTurnAttackFlinchTarget", // Sky Attack                # Not listed on Bulbapedia
        "TwoTurnAttackChargeRaiseUserDefense1", // Skull Bash                # Not listed on Bulbapedia
        "TwoTurnAttackInvulnerableInSky", // Fly
        "TwoTurnAttackInvulnerableUnderground", // Dig
        "TwoTurnAttackInvulnerableUnderwater", // Dive
        "TwoTurnAttackInvulnerableInSkyParalyzeTarget", // Bounce
        "TwoTurnAttackInvulnerableRemoveProtections", // Shadow Force/Phantom Force
        "TwoTurnAttackInvulnerableInSkyTargetCannotAct", // Sky Drop
        "AllBattlersLoseHalfHPUserSkipsNextTurn", // Shadow Half
        "TwoTurnAttackRaiseUserSpAtkSpDefSpd2", // Geomancy                  # Not listed on Bulbapedia
        // Target-switching moves
        "SwitchOutTargetStatusMove", // Roar, Whirlwind
      ]);
    }
    // v20.1 Hotfixes: Added Obstruct to the blacklist.
    // NOTE (Ruby parity): Obstruct is already in the list, so it's in it twice.
    this.moveBlacklist.push("ProtectUserFromDamagingMovesObstruct");
  }

  /** ZUD Mechanics: ignores Z-Moves/Max Moves when calling a move in the party. */
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.assistMoves = [];
    // NOTE: This includes the Pokémon of ally trainers in multi battles.
    this.battle.pbParty(user.index).forEach((pkmn, i) => {
      if (!pkmn || i === user.pokemonIndex) return;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && pkmn.egg()) return;
      for (const move of pkmn.moves) {
        if (move.powerMove()) continue;
        if (this.moveBlacklist.includes(move.functionCode)) continue;
        if (move.type === "SHADOW") continue;
        this.assistMoves.push(move.id);
      }
    });
    if (this.assistMoves.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const move = this.assistMoves[this.battle.pbRandom(this.assistMoves.length)]!;
    await user.pbUseMoveSimple(move);
  }
}
registerMoveClass("UseRandomMoveFromUserParty", UseRandomMoveFromUserParty);

//===============================================================================
// Uses a random move the user knows. Fails if user is not asleep. (Sleep Talk)
//===============================================================================
export class UseRandomUserMoveIfAsleep extends Move {
  moveBlacklist: string[];
  sleepTalkMoves: number[] = [];

  override usableWhenAsleep(): boolean { return true; }
  override callsAnotherMove(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      "MultiTurnAttackPreventSleeping", // Uproar
      "MultiTurnAttackBideThenReturnDoubleDamage", // Bide
      // Struggle, Belch
      "Struggle", // Struggle             # Not listed on Bulbapedia
      "FailsIfUserNotConsumedBerry", // Belch
      // Moves that affect the moveset (except Transform)
      "ReplaceMoveThisBattleWithTargetLastMoveUsed", // Mimic
      "ReplaceMoveWithTargetLastMoveUsed", // Sketch
      // Moves that call other moves
      "UseLastMoveUsedByTarget", // Mirror Move
      "UseLastMoveUsed", // Copycat
      "UseMoveTargetIsAboutToUse", // Me First
      "UseMoveDependingOnEnvironment", // Nature Power         # Not listed on Bulbapedia
      "UseRandomUserMoveIfAsleep", // Sleep Talk
      "UseRandomMoveFromUserParty", // Assist
      "UseRandomMove", // Metronome
      // Two-turn attacks
      "TwoTurnAttack", // Razor Wind
      "TwoTurnAttackOneTurnInSun", // Solar Beam, Solar Blade
      "TwoTurnAttackParalyzeTarget", // Freeze Shock
      "TwoTurnAttackBurnTarget", // Ice Burn
      "TwoTurnAttackFlinchTarget", // Sky Attack
      "TwoTurnAttackChargeRaiseUserDefense1", // Skull Bash
      "TwoTurnAttackInvulnerableInSky", // Fly
      "TwoTurnAttackInvulnerableUnderground", // Dig
      "TwoTurnAttackInvulnerableUnderwater", // Dive
      "TwoTurnAttackInvulnerableInSkyParalyzeTarget", // Bounce
      "TwoTurnAttackInvulnerableRemoveProtections", // Shadow Force/Phantom Force
      "TwoTurnAttackInvulnerableInSkyTargetCannotAct", // Sky Drop
      "AllBattlersLoseHalfHPUserSkipsNextTurn", // Shadow Half
      "TwoTurnAttackRaiseUserSpAtkSpDefSpd2", // Geomancy
      // Moves that start focussing at the start of the round
      "FailsIfUserDamagedThisTurn", // Focus Punch
      "UsedAfterUserTakesPhysicalDamage", // Shell Trap
      "BurnAttackerBeforeUserActs", // Beak Blast
    ];
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.sleepTalkMoves = [];
    user.eachMoveWithIndex((m, i) => {
      if (this.moveBlacklist.includes(m.function)) return;
      if (!this.battle.pbCanChooseMove(user.index, i, false, true)) return;
      this.sleepTalkMoves.push(i);
    });
    if (!user.asleep() || this.sleepTalkMoves.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** ZUD Mechanics: passes the move's index, so Z-Sleep Talk uses the Z-Powered version of the move. */
  override async pbEffectGeneral(user: Battler): Promise<void> {
    const choice = this.sleepTalkMoves[this.battle.pbRandom(this.sleepTalkMoves.length)]!;
    await user.pbUseMoveSimple(user.moves[choice]!.id, user.pbDirectOpposing().index, choice);
  }
}
registerMoveClass("UseRandomUserMoveIfAsleep", UseRandomUserMoveIfAsleep);

//===============================================================================
// This round, reflects all moves with the "C" flag targeting the user back at
// their origin. (Magic Coat)
//===============================================================================
export class BounceBackProblemCausingStatusMoves extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.MagicCoat] = true;
    await this.battle.pbDisplay(_INTL("{1} shrouded itself with Magic Coat!", user.pbThis()));
  }
}
registerMoveClass("BounceBackProblemCausingStatusMoves", BounceBackProblemCausingStatusMoves);

//===============================================================================
// This round, snatches all used moves with the "D" flag. (Snatch)
//===============================================================================
export class StealAndUseBeneficialStatusMove extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Snatch] = 1;
    for (const b of this.battle.allBattlers()) {
      if (b.effects[PBEffects.Snatch] < user.effects[PBEffects.Snatch]) continue;
      user.effects[PBEffects.Snatch] = b.effects[PBEffects.Snatch] + 1;
    }
    await this.battle.pbDisplay(_INTL("{1} waits for a target to make a move!", user.pbThis()));
  }
}
registerMoveClass("StealAndUseBeneficialStatusMove", StealAndUseBeneficialStatusMove);

//===============================================================================
// This move turns into the last move used by the target, until user switches
// out. (Mimic)
//===============================================================================
export class ReplaceMoveThisBattleWithTargetLastMoveUsed extends Move {
  moveBlacklist: string[];

  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      "UseRandomMove", // Metronome
      // Struggle
      "Struggle", // Struggle
      // Moves that affect the moveset
      "ReplaceMoveThisBattleWithTargetLastMoveUsed", // Mimic
      "ReplaceMoveWithTargetLastMoveUsed", // Sketch
      "TransformUserIntoTarget", // Transform
    ];
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Transform] || !user.pbHasMove(this.id)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** ZUD Mechanics: fails when attempting to Mimic a Z-Move/Max Move. */
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    const lastMoveData = MoveData.tryGet(target.lastRegularMoveUsed);
    if (!lastMoveData ||
        user.pbHasMove(target.lastRegularMoveUsed) ||
        this.moveBlacklist.includes(lastMoveData.functionCode) ||
        lastMoveData.type === "SHADOW" || lastMoveData.powerMove()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** ZUD Mechanics: records the mimicked move as a new base move to revert to after Z-Move/Dynamax. */
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    for (let i = 0; i < user.moves.length; i++) {
      const m = user.moves[i]!;
      if (m.id !== this.id) continue;
      const newMove = new PokemonMove(target.lastRegularMoveUsed!);
      user.moves[i] = Move.fromPokemonMove(this.battle, newMove);
      if (user.baseMoves.length > 0) user.baseMoves[i] = user.moves[i]!;
      await this.battle.pbDisplay(_INTL("{1} learned {2}!", user.pbThis(), newMove.name));
      await user.pbCheckFormOnMovesetChange();
      break;
    }
  }
}
registerMoveClass("ReplaceMoveThisBattleWithTargetLastMoveUsed", ReplaceMoveThisBattleWithTargetLastMoveUsed);

//===============================================================================
// This move permanently turns into the last move used by the target. (Sketch)
//===============================================================================
export class ReplaceMoveWithTargetLastMoveUsed extends Move {
  moveBlacklist: string[];

  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      "ReplaceMoveWithTargetLastMoveUsed", // Sketch (this move)
      // Struggle
      "Struggle", // Struggle
    ];
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Transform] || !user.pbHasMove(this.id)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** ZUD Mechanics: fails when attempting to Sketch a Z-Move/Max Move. */
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    const lastMoveData = MoveData.tryGet(target.lastRegularMoveUsed);
    if (!lastMoveData ||
        user.pbHasMove(target.lastRegularMoveUsed) ||
        this.moveBlacklist.includes(lastMoveData.functionCode) ||
        lastMoveData.type === "SHADOW" || lastMoveData.powerMove()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    for (let i = 0; i < user.moves.length; i++) {
      const m = user.moves[i]!;
      if (m.id !== this.id) continue;
      const newMove = new PokemonMove(target.lastRegularMoveUsed!);
      user.pokemon!.moves[i] = newMove;
      user.moves[i] = Move.fromPokemonMove(this.battle, newMove);
      await this.battle.pbDisplay(_INTL("{1} learned {2}!", user.pbThis(), newMove.name));
      await user.pbCheckFormOnMovesetChange();
      break;
    }
  }
}
registerMoveClass("ReplaceMoveWithTargetLastMoveUsed", ReplaceMoveWithTargetLastMoveUsed);
