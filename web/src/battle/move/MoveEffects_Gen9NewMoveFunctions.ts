// Port of Plugins/Generation 9 Pack Scripts/[002] Moves/[001] New Move Functions.rb
// (the new Battle::Move classes the Generation 9 Pack adds).
// No later plugin (Essentials Deluxe, ZUD Mechanics) patches any of these
// classes; they're only referenced by the AI and Max Raid data.
//
// Load-time toggle: SplintersTargetGen8AddSpikesGen9/...StealthRocksGen9 are
// chosen with `if Settings::MECHANICS_GENERATION >= 9` at plugin load. The
// Generation 9 Pack's own Settings.rb (plugin root, loaded before its
// subfolders) has already redefined it to 9 by then, so the Gen 9 versions are
// used: Settings.MECHANICS_GENERATION_AT_RUNTIME (= 9) is the right value here.
//
// Sync/async of the overridden methods: see the table in Move_Usage.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness } from "../../data/gameData/type";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { Move, registerMoveClass } from "./Move";
import { MultiStatUpMove, ProtectMove, RecoilMove, WeatherMove } from "./Move_BaseEffects";
import { LowerUserSpAtk1 } from "./MoveEffects_BattlerStats";
import { BurnTarget, ConfuseTarget, PoisonTarget } from "./MoveEffects_BattlerOther";
import { RemoveScreens } from "./MoveEffects_MoveAttributes";

//##############################################################################
//
// Drowse & Frostbite effects.
//
//##############################################################################

//===============================================================================
// Drowses the target.
//===============================================================================
export class DrowseTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanDrowseAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbDrowse();
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanDrowse(user, false, this)) await target.pbDrowse();
  }
}
registerMoveClass("DrowseTarget", DrowseTarget);

//===============================================================================
// Frostbites the target.
//===============================================================================
export class FrostbiteTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanFrostbiteAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbFrostbite(user);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanFrostbite(user, false, this)) await target.pbFrostbite(user);
  }
}
registerMoveClass("FrostbiteTarget", FrostbiteTarget);

//##############################################################################
//
// New move effects (PLA).
//
//##############################################################################

//===============================================================================
// Dire Claw
//===============================================================================
// May paralyze, poison or put the target to sleep.
//-------------------------------------------------------------------------------
export class PoisonParalyzeOrSleepTarget extends Move {
  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    switch (this.battle.pbRandom(3)) {
      case 0: if (target.pbCanSleep(user, false, this)) await target.pbSleep(); break;
      case 1: if (target.pbCanPoison(user, false, this)) await target.pbPoison(user); break;
      case 2: if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user); break;
    }
  }
}
registerMoveClass("PoisonParalyzeOrSleepTarget", PoisonParalyzeOrSleepTarget);

//===============================================================================
// Barb Barrage
//===============================================================================
// Power is doubled if the target is poisoned. May poison the target.
//-------------------------------------------------------------------------------
export class DoublePowerIfTargetPoisonedPoisonTarget extends PoisonTarget {
  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (target.poisoned() &&
        (target.effects[PBEffects.Substitute] === 0 || this.ignoresSubstitute(user))) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetPoisonedPoisonTarget", DoublePowerIfTargetPoisonedPoisonTarget);

//===============================================================================
// Infernal Parade
//===============================================================================
// Power is doubled if the target has a status condition. May burn the target.
//-------------------------------------------------------------------------------
export class DoublePowerIfTargetStatusProblemBurnTarget extends BurnTarget {
  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (target.pbHasAnyStatus() &&
        (target.effects[PBEffects.Substitute] === 0 || this.ignoresSubstitute(user))) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoublePowerIfTargetStatusProblemBurnTarget", DoublePowerIfTargetStatusProblemBurnTarget);

//===============================================================================
// Ceaseless Edge (Gen 9+)
//===============================================================================
// Lays spikes on the opposing side if damage was dealt (max. 3 layers).
//-------------------------------------------------------------------------------
export class DamageTargetAddSpikesToFoeSide extends Move {
  override async pbEffectWhenDealingDamage(user: Battler, target: Battler): Promise<void> {
    if (target.pbOwnSide().effects[PBEffects.Spikes] === 3) return;
    target.pbOwnSide().effects[PBEffects.Spikes] += 1;
    await this.battle.pbAnimation("SPIKES", user, target);
    await this.battle.pbDisplay(_INTL("Spikes were scattered all around {1}'s feet!", user.pbOpposingTeam(true)));
  }
}
registerMoveClass("DamageTargetAddSpikesToFoeSide", DamageTargetAddSpikesToFoeSide);

//===============================================================================
// Stone Axe (Gen 9+)
//===============================================================================
// Lays stealth rocks on the opposing side if damage was dealt.
//-------------------------------------------------------------------------------
export class DamageTargetAddStealthRocksToFoeSide extends Move {
  override async pbEffectWhenDealingDamage(user: Battler, target: Battler): Promise<void> {
    if (target.pbOwnSide().effects[PBEffects.StealthRock]) return;
    target.pbOwnSide().effects[PBEffects.StealthRock] = true;
    await this.battle.pbAnimation("STEALTHROCK", user, target);
    await this.battle.pbDisplay(_INTL("Pointed stones float in the air around {1}!", user.pbOpposingTeam(true)));
  }
}
registerMoveClass("DamageTargetAddStealthRocksToFoeSide", DamageTargetAddStealthRocksToFoeSide);

//===============================================================================
// Ceaseless Edge, Stone Axe (PLA)
//===============================================================================
// Starts the splinters effect on the target.
//-------------------------------------------------------------------------------
export class StartSplintersTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (target.effects[PBEffects.Splinters] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    target.effects[PBEffects.Splinters] = 3;
    target.effects[PBEffects.SplintersType] = this.type;
    await this.battle.pbDisplay(_INTL("Jagged splinters dug into {1}!", target.pbThis(true)));
  }

  override async pbAdditionalEffect(_user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.effects[PBEffects.Splinters] > 0) return;
    target.effects[PBEffects.Splinters] = 3;
    target.effects[PBEffects.SplintersType] = this.type;
    await this.battle.pbDisplay(_INTL("Jagged splinters dug into {1}!", target.pbThis(true)));
  }
}
registerMoveClass("StartSplintersTarget", StartSplintersTarget);

//===============================================================================
// Ceaseless Edge, Stone Axe (Toggle)
//===============================================================================
// Toggles between the Gen 9 or PLA versions of these moves.
// (Evaluated at plugin load, when Settings::MECHANICS_GENERATION is already 9:
// see the file header.)
//-------------------------------------------------------------------------------
export const SplintersTargetGen8AddSpikesGen9 = (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9)
  ? class SplintersTargetGen8AddSpikesGen9 extends DamageTargetAddSpikesToFoeSide {}
  : class SplintersTargetGen8AddSpikesGen9 extends StartSplintersTarget {};
registerMoveClass("SplintersTargetGen8AddSpikesGen9", SplintersTargetGen8AddSpikesGen9);

export const SplintersTargetGen8AddStealthRocksGen9 = (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9)
  ? class SplintersTargetGen8AddStealthRocksGen9 extends DamageTargetAddStealthRocksToFoeSide {}
  : class SplintersTargetGen8AddStealthRocksGen9 extends StartSplintersTarget {};
registerMoveClass("SplintersTargetGen8AddStealthRocksGen9", SplintersTargetGen8AddStealthRocksGen9);

//===============================================================================
// Triple Arrows
//===============================================================================
// Lowers the target's Defense by 1 stage. May cause flinching.
//-------------------------------------------------------------------------------
export class LowerTargetDefense1FlinchTarget extends Move {
  override flinchingMove(): boolean { return true; }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    let chance = this.pbAdditionalEffectChance(user, target, 50);
    if (this.battle.pbRandom(100) < chance) {
      if (await target.pbCanLowerStatStage("DEFENSE", user, this)) {
        await target.pbLowerStatStage("DEFENSE", 1, user);
      }
    }
    chance = this.pbAdditionalEffectChance(user, target, 30);
    if (chance === 0) return;
    if (this.battle.pbRandom(100) < chance) target.pbFlinch(user);
  }
}
registerMoveClass("LowerTargetDefense1FlinchTarget", LowerTargetDefense1FlinchTarget);

//===============================================================================
// Victory Dance
//===============================================================================
// Increases the user's Attack, Defense and Speed by 1 stage each.
//-------------------------------------------------------------------------------
export class RaiseUserAtkDefSpd1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "DEFENSE", 1, "SPEED", 1];
  }
}
registerMoveClass("RaiseUserAtkDefSpd1", RaiseUserAtkDefSpd1);

//===============================================================================
// Take Heart
//===============================================================================
// Increases the user's Sp. Atk and Sp. Def by 1 stage each and cures its status.
//-------------------------------------------------------------------------------
export class RaiseUserSpAtkSpDef1CureStatus extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_ATTACK", 1, "SPECIAL_DEFENSE", 1];
  }

  // NOTE (Ruby parity): this replaces MultiStatUpMove#pbEffectGeneral without
  //       calling super, so Take Heart only cures the user's status and never
  //       raises its stats (and it still fails, via MultiStatUpMove's
  //       pbMoveFailed?, when neither stat can go higher).
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.pbHasAnyStatus()) await user.pbCureStatus();
  }
}
registerMoveClass("RaiseUserSpAtkSpDef1CureStatus", RaiseUserSpAtkSpDef1CureStatus);

//===============================================================================
// User takes recoil damage equal to 1/2 of its total HP. (Chloroblast)
//===============================================================================
export class RecoilHalfOfTotalHP extends RecoilMove {
  override pbRecoilDamage(user: Battler, _target: Battler): number {
    return Math.ceil(user.totalhp / 2.0);
  }
}
registerMoveClass("RecoilHalfOfTotalHP", RecoilHalfOfTotalHP);

//##############################################################################
//
// New move effects (SV).
//
//##############################################################################

//===============================================================================
// Raging Bull
//===============================================================================
// Ends Light Screen, Reflect and Aurora Veil on the target's side.
// If used by Tauros, the type of the move changes to reflect Tauros's type.
//-------------------------------------------------------------------------------
export class TypeIsUserSecondTypeRemoveScreens extends RemoveScreens {
  override pbBaseType(user: Battler): Id | null {
    if (!user.isSpecies("TAUROS")) return this.type;
    const userTypes = user.pokemon!.types();
    return userTypes[1] || userTypes[0] || this.type;
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    const t = this.pbBaseType(user);
    if (t === "FIRE") hitNum = 1; // Type-specific anims
    if (t === "WATER") hitNum = 2;
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("TypeIsUserSecondTypeRemoveScreens", TypeIsUserSecondTypeRemoveScreens);

//===============================================================================
// Last Respects
//===============================================================================
// Power is increased by 50 for each time a teammate fainted this battle.
//-------------------------------------------------------------------------------
export class IncreasePowerEachFaintedAlly extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    const numFainted = user.numFaintedAllies();
    if (numFainted <= 0) return baseDmg;
    baseDmg += 50 * numFainted;
    return baseDmg;
  }
}
registerMoveClass("IncreasePowerEachFaintedAlly", IncreasePowerEachFaintedAlly);

//===============================================================================
// Rage Fist
//===============================================================================
// Power is increased by 50 for each time the user has been hit this battle.
//-------------------------------------------------------------------------------
export class IncreasePowerEachTimeHit extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    const bonus = 50 * user.numTimesHit();
    return Math.min(baseDmg + bonus, 350);
  }
}
registerMoveClass("IncreasePowerEachTimeHit", IncreasePowerEachTimeHit);

//===============================================================================
// Collision Course, Electro Drift
//===============================================================================
// Damage is increased if the move would deal super effective damage.
//-------------------------------------------------------------------------------
export class IncreasePowerSuperEffective extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    // (A Float from here on, as in Ruby; pbCalcDamage rounds it.)
    if (Effectiveness.superEffective(target.damageState.typeMod)) baseDmg *= 4 / 3.0;
    return baseDmg;
  }
}
registerMoveClass("IncreasePowerSuperEffective", IncreasePowerSuperEffective);

//===============================================================================
// Triple Dive
//===============================================================================
// Hits the target 3 times.
//-------------------------------------------------------------------------------
export class HitThreeTimes extends Move {
  override multiHitMove(): boolean { return true; }
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 3; }
}
registerMoveClass("HitThreeTimes", HitThreeTimes);

//===============================================================================
// Population Bomb
//===============================================================================
// Hits 10 times. An accuracy check is performed for each hit.
//-------------------------------------------------------------------------------
export class HitTenTimes extends Move {
  /** @accCheckPerHit (nil until pbOnStartUse). */
  accCheckPerHit: boolean | null = null;

  override multiHitMove(): boolean { return true; }

  override pbNumHits(user: Battler, _targets: Battler[]): number {
    // NOTE: Ruby uses Kernel#rand(7) here; this goes through battle.pbRandom
    //       instead (deliberate deviation: all randomness via pbRandom).
    if (user.hasActiveItem("LOADEDDICE")) return 4 + this.battle.pbRandom(7);
    return 10;
  }

  override successCheckPerHit(): boolean {
    return !!this.accCheckPerHit;
  }

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    this.accCheckPerHit = !user.hasActiveAbility("SKILLLINK") && !user.hasActiveItem("LOADEDDICE");
  }
}
registerMoveClass("HitTenTimes", HitTenTimes);

//===============================================================================
// Axe Kick
//===============================================================================
// If attack misses, user takes crash damage of 1/2 of max HP. May cause confusion.
//-------------------------------------------------------------------------------
export class CrashDamageIfFailsConfuseTarget extends ConfuseTarget {
  override recoilMove(): boolean { return true; }

  override async pbCrashDamage(user: Battler): Promise<void> {
    if (!user.takesIndirectDamage()) return;
    await this.battle.pbDisplay(_INTL("{1} kept going and crashed!", user.pbThis()));
    await this.battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(Math.floor(user.totalhp / 2), false);
    await user.pbItemHPHealCheck();
    if (user.fainted()) await user.pbFaint();
  }
}
registerMoveClass("CrashDamageIfFailsConfuseTarget", CrashDamageIfFailsConfuseTarget);

//===============================================================================
// Glaive Rush
//===============================================================================
// The user becomes vulnerable to moves until it uses its next move.
//-------------------------------------------------------------------------------
export class UserVulnerableUntilNextAction extends Move {
  override async pbEffectWhenDealingDamage(user: Battler, _target: Battler): Promise<void> {
    user.effects[PBEffects.GlaiveRush] = 2;
  }
}
registerMoveClass("UserVulnerableUntilNextAction", UserVulnerableUntilNextAction);

//===============================================================================
// Gigaton Hammer
//===============================================================================
// This move becomes unselectable if you try to use it on consecutive turns.
//-------------------------------------------------------------------------------
export class CantSelectConsecutiveTurns extends Move {
  override async pbEffectWhenDealingDamage(user: Battler, _target: Battler): Promise<void> {
    user.effects[PBEffects.SuccessiveMove] = this.id;
  }
}
registerMoveClass("CantSelectConsecutiveTurns", CantSelectConsecutiveTurns);

//===============================================================================
// Make it Rain
//===============================================================================
// Lowers the user's Sp.Atk by 1 stage. Also scatters coins to be picked up.
//-------------------------------------------------------------------------------
export class AddMoneyGainedFromBattleLowerUserSpAtk1 extends LowerUserSpAtk1 {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.pbOwnedByPlayer()) {
      this.battle.field.effects[PBEffects.PayDay] += 5 * user.level;
    }
    await this.battle.pbDisplay(_INTL("Coins were scattered everywhere!"));
  }
}
registerMoveClass("AddMoneyGainedFromBattleLowerUserSpAtk1", AddMoneyGainedFromBattleLowerUserSpAtk1);

//===============================================================================
// Double Shock
//===============================================================================
// User loses their Electric type. Fails if user is not Electric-type.
//-------------------------------------------------------------------------------
export class UserLosesElectricType extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.pbHasType("ELECTRIC")) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAfterAllHits(user: Battler, _target: Battler): Promise<void> {
    if (!user.effects[PBEffects.DoubleShock]) {
      user.effects[PBEffects.DoubleShock] = true;
      await this.battle.pbDisplay(_INTL("{1} used up all its electricity!", user.pbThis()));
    }
  }
}
registerMoveClass("UserLosesElectricType", UserLosesElectricType);

//===============================================================================
// Salt Cure
//===============================================================================
// Target will lose 1/4 of max HP at end of each round, or 1/8th if Water or Steel.
//-------------------------------------------------------------------------------
export class StartSaltCureTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (target.effects[PBEffects.SaltCure]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    target.effects[PBEffects.SaltCure] = true;
    await this.battle.pbDisplay(_INTL("{1} is being salt cured!", target.pbThis()));
  }

  // NOTE (Ruby parity): no check for an existing Salt Cure here, so the
  //       message is shown again every time the move hits.
  override async pbAdditionalEffect(_user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    target.effects[PBEffects.SaltCure] = true;
    await this.battle.pbDisplay(_INTL("{1} is being salt cured!", target.pbThis()));
  }
}
registerMoveClass("StartSaltCureTarget", StartSaltCureTarget);

//===============================================================================
// Silk Trap
//===============================================================================
// User is protected against damaging moves this round. Decreases the Speed of
// the user of a stopped contact move by 1 stage.
//-------------------------------------------------------------------------------
export class ProtectUserFromDamagingMovesSilkTrap extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.SilkTrap;
  }
}
registerMoveClass("ProtectUserFromDamagingMovesSilkTrap", ProtectUserFromDamagingMovesSilkTrap);

//===============================================================================
// Order Up
//===============================================================================
// Increase the user's stat by 1 stage depending on the commanding Tatsugiri.
// This move can have different animations based on Tatsugiri's form.
//-------------------------------------------------------------------------------
export class RaiseUserStat1Commander extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.isCommanderHost()) {
      const form = (user.effects[PBEffects.Commander] as number[])[1]!;
      const stat = (["ATTACK", "DEFENSE", "SPEED"] as Id[])[form]!;
      if (await user.pbCanRaiseStatStage(stat, user, this)) {
        await user.pbRaiseStatStage(stat, 1, user, true);
      }
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    // Different animation based on Tatsugiri's form
    if (user.isCommanderHost()) hitNum = (user.effects[PBEffects.Commander] as number[])[1]! + 1;
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("RaiseUserStat1Commander", RaiseUserStat1Commander);

//===============================================================================
// Spicy Extract
//===============================================================================
// Increases the target's Attack by 2 stages.
// Decreases the target's Defense by 2 stages.
//-------------------------------------------------------------------------------
export class RaiseTargetAtkLowerTargetDef2 extends Move {
  statUp: (Id | number)[] = ["ATTACK", 2];
  statDown: (Id | number)[] = ["DEFENSE", 2];

  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, _showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    const failed = !(await target.pbCanRaiseStatStage(this.statUp[0] as Id, user, this)) &&
                   !(await target.pbCanLowerStatStage(this.statDown[0] as Id, user, this));
    // NOTE (Ruby parity): shown even when show_message is false.
    if (failed) {
      await this.battle.pbDisplay(_INTL("{1}'s stats can't be changed further!", target.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    if (await target.pbCanRaiseStatStage(this.statUp[0] as Id, user, this)) {
      await target.pbRaiseStatStage(this.statUp[0] as Id, this.statUp[1] as number, user);
    }
    if (await target.pbCanLowerStatStage(this.statDown[0] as Id, user, this)) {
      await target.pbLowerStatStage(this.statDown[0] as Id, this.statDown[1] as number, user);
    }
  }
}
registerMoveClass("RaiseTargetAtkLowerTargetDef2", RaiseTargetAtkLowerTargetDef2);

//===============================================================================
// Fillet Away
//===============================================================================
// Reduces the user's HP by half of max, and increases the user's Attack, Sp.Atk,
// and Speed by 2 stages.
//-------------------------------------------------------------------------------
export class RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    const hpLoss = Math.max(Math.floor(user.totalhp / 2), 1);
    if (user.hp <= hpLoss) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    let failed = true;
    for (const stat of ["ATTACK", "SPECIAL_ATTACK", "SPEED"] as Id[]) {
      if (!(await user.pbCanRaiseStatStage(stat, user, this))) continue;
      failed = false;
      break;
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("{1}'s stats won't go any higher!", user.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const hpLoss = Math.max(Math.floor(user.totalhp / 2), 1);
    await user.pbReduceHP(hpLoss, false, false);
    let showAnim = true;
    for (const stat of ["ATTACK", "SPECIAL_ATTACK", "SPEED"] as Id[]) {
      if (!(await user.pbCanRaiseStatStage(stat, user, this))) continue;
      if (await user.pbRaiseStatStage(stat, 2, user, showAnim)) {
        showAnim = false;
      }
    }
  }
}
registerMoveClass("RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP", RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP);

//===============================================================================
// Tidy Up
//===============================================================================
// Increases the user's Attack and Speed by 1 stage each.
// Clears all entry hazards and substitutes on both sides.
//-------------------------------------------------------------------------------
export class RaiseUserAtkSpd1RemoveHazardsSubstitutes extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "SPEED", 1];
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    let failed = true;
    for (let i = 0; i < 2; i++) {
      const side = (i === 0) ? user.pbOwnSide() : user.pbOpposingSide();
      // (defined?(PBEffects::Steelsurge) is true: ZUD Mechanics defines it.)
      if (!(side.effects[PBEffects.Spikes] > 0 ||
            side.effects[PBEffects.ToxicSpikes] > 0 ||
            side.effects[PBEffects.StealthRock] ||
            side.effects[PBEffects.StickyWeb] ||
            side.effects[PBEffects.Steelsurge])) continue;
      failed = false;
      break;
    }
    for (const b of this.battle.allBattlers()) {
      if (b.effects[PBEffects.Substitute] === 0) continue;
      failed = false;
      break;
    }
    let failed2 = true;
    for (let i = 0; i < Math.floor(this.statUp.length / 2); i++) {
      if (!(await user.pbCanRaiseStatStage(this.statUp[i * 2] as Id, user, this))) continue;
      failed2 = false;
      break;
    }
    if (failed && failed2) {
      await this.battle.pbDisplay(_INTL("But it failed!", user.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    let showMsg = false;
    for (let i = 0; i < 2; i++) {
      const side = (i === 0) ? user.pbOwnSide() : user.pbOpposingSide();
      const team = (i === 0) ? user.pbTeam(true) : user.pbOpposingTeam(true);
      if (side.effects[PBEffects.StealthRock]) {
        side.effects[PBEffects.StealthRock] = false;
        await this.battle.pbDisplay(_INTL("The pointed stones disappeared from around {1}!", team));
        showMsg = true;
      }
      // (defined?(PBEffects::Steelsurge) is true: ZUD Mechanics defines it.)
      if (side.effects[PBEffects.Steelsurge]) {
        side.effects[PBEffects.Steelsurge] = false;
        await this.battle.pbDisplay(_INTL("The pointed steel disappeared from around {1}!", team));
        showMsg = true;
      }
      if (side.effects[PBEffects.Spikes] > 0) {
        side.effects[PBEffects.Spikes] = 0;
        await this.battle.pbDisplay(_INTL("The spikes disappeared from the ground around {1}!", team));
        showMsg = true;
      }
      if (side.effects[PBEffects.ToxicSpikes] > 0) {
        side.effects[PBEffects.ToxicSpikes] = 0;
        await this.battle.pbDisplay(_INTL("The poison spikes disappeared from the ground around {1}!", team));
        showMsg = true;
      }
      if (side.effects[PBEffects.StickyWeb]) {
        side.effects[PBEffects.StickyWeb] = false;
        await this.battle.pbDisplay(_INTL("The sticky web has disappeared from the ground around {1}!", team));
        showMsg = true;
      }
    }
    for (const b of this.battle.allBattlers()) {
      if (b.effects[PBEffects.Substitute] === 0) continue;
      b.effects[PBEffects.Substitute] = 0;
      showMsg = true;
    }
    if (showMsg) await this.battle.pbDisplay(_INTL("Tidying up complete!"));
    await super.pbEffectGeneral(user);
  }
}
registerMoveClass("RaiseUserAtkSpd1RemoveHazardsSubstitutes", RaiseUserAtkSpd1RemoveHazardsSubstitutes);

//===============================================================================
// Mortal Spin
//===============================================================================
// Removes trapping moves, entry hazards and Leech Seed on user/user's side.
// Poisons the target.
//-------------------------------------------------------------------------------
export class RemoveUserBindingAndEntryHazardsPoisonTarget extends PoisonTarget {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (user.fainted() || target.damageState.unaffected) return;
    if (user.effects[PBEffects.Trapping] > 0) {
      const trapMove = MoveData.get(user.effects[PBEffects.TrappingMove]).name;
      const trapUser = this.battle.battlers[user.effects[PBEffects.TrappingUser]]!;
      await this.battle.pbDisplay(_INTL("{1} got free of {2}'s {3}!", user.pbThis(), trapUser.pbThis(true), trapMove));
      user.effects[PBEffects.Trapping] = 0;
      user.effects[PBEffects.TrappingMove] = null;
      user.effects[PBEffects.TrappingUser] = -1;
    }
    if (user.effects[PBEffects.LeechSeed] >= 0) {
      user.effects[PBEffects.LeechSeed] = -1;
      await this.battle.pbDisplay(_INTL("{1} shed Leech Seed!", user.pbThis()));
    }
    if (user.pbOwnSide().effects[PBEffects.StealthRock]) {
      user.pbOwnSide().effects[PBEffects.StealthRock] = false;
      await this.battle.pbDisplay(_INTL("{1} blew away stealth rocks!", user.pbThis()));
    }
    // (defined?(PBEffects::Steelsurge) is true: ZUD Mechanics defines it.)
    if (user.pbOwnSide().effects[PBEffects.Steelsurge]) {
      user.pbOwnSide().effects[PBEffects.Steelsurge] = false;
      await this.battle.pbDisplay(_INTL("{1} blew away the pointed steel!", user.pbThis()));
    }
    if (user.pbOwnSide().effects[PBEffects.Spikes] > 0) {
      user.pbOwnSide().effects[PBEffects.Spikes] = 0;
      await this.battle.pbDisplay(_INTL("{1} blew away spikes!", user.pbThis()));
    }
    if (user.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) {
      user.pbOwnSide().effects[PBEffects.ToxicSpikes] = 0;
      await this.battle.pbDisplay(_INTL("{1} blew away poison spikes!", user.pbThis()));
    }
    if (user.pbOwnSide().effects[PBEffects.StickyWeb]) {
      user.pbOwnSide().effects[PBEffects.StickyWeb] = false;
      await this.battle.pbDisplay(_INTL("{1} blew away sticky webs!", user.pbThis()));
    }
  }
}
registerMoveClass("RemoveUserBindingAndEntryHazardsPoisonTarget", RemoveUserBindingAndEntryHazardsPoisonTarget);

//===============================================================================
// Ice Spinner
//===============================================================================
// Removes the current terrain.
//-------------------------------------------------------------------------------
export class RemoveTerrainIceSpinner extends Move {
  override async pbEffectGeneral(_user: Battler): Promise<void> {
    if (this.battle.field.terrain === "None") return;
    switch (this.battle.field.terrain) {
      case "Electric":
        await this.battle.pbDisplay(_INTL("The electricity disappeared from the battlefield."));
        break;
      case "Grassy":
        await this.battle.pbDisplay(_INTL("The grass disappeared from the battlefield."));
        break;
      case "Misty":
        await this.battle.pbDisplay(_INTL("The mist disappeared from the battlefield."));
        break;
      case "Psychic":
        await this.battle.pbDisplay(_INTL("The weirdness disappeared from the battlefield."));
        break;
    }
    this.battle.field.terrain = "None";
    for (const battler of this.battle.allBattlers()) await battler.pbAbilityOnTerrainChange();
  }
}
registerMoveClass("RemoveTerrainIceSpinner", RemoveTerrainIceSpinner);

//===============================================================================
// Chilly Reception
//===============================================================================
// Starts hail weather, then switches out.
//-------------------------------------------------------------------------------
export class SwitchOutUserStartHailWeather extends WeatherMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.weatherType = "Hail";
  }

  override async pbDisplayUseMessage(user: Battler): Promise<void> {
    await this.battle.pbDisplayBrief(_INTL("{1} is preparing to tell a chillingly bad joke!", user.pbThis()));
    await super.pbDisplayUseMessage(user);
  }

  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], numHits: number,
    switchedBattlers: number[]): Promise<void> {
    if (user.fainted() || numHits === 0) return;
    if (!this.battle.pbCanChooseNonActive(user.index)) return;
    await this.battle.pbDisplay(_INTL("{1} went back to {2}!", user.pbThis(), this.battle.pbGetOwnerName(user.index)));
    await this.battle.pbPursuit(user.index);
    if (user.fainted()) return;
    const newPkmn = await this.battle.pbGetReplacementPokemonIndex(user.index);
    if (newPkmn < 0) return;
    await this.battle.pbRecallAndReplace(user.index, newPkmn);
    this.battle.pbClearChoice(user.index);
    this.battle.moldBreaker = false;
    await this.battle.pbOnBattlerEnteringBattle(user.index);
    switchedBattlers.push(user.index);
  }
}
registerMoveClass("SwitchOutUserStartHailWeather", SwitchOutUserStartHailWeather);

//===============================================================================
// Shed Tail
//===============================================================================
// User turns 1/4 of max HP into a substitute. Then, the user switches out. The
// switched-in Pokemon retains the user's substitute.
//-------------------------------------------------------------------------------
export class UserMakeSubstituteSwitchOut extends Move {
  lifeCost = 0;
  subLife = 0;

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Substitute] > 0) {
      await this.battle.pbDisplay(_INTL("{1} already has a substitute!", user.pbThis()));
      return true;
    }
    // NOTE (Ruby parity): Integer division, so the .ceil calls do nothing
    //       (both values are floored).
    this.lifeCost = Math.max(Math.floor(user.totalhp / 2), 1);
    this.subLife = Math.max(Math.floor(this.lifeCost / 4), 1);
    if (user.hp <= this.lifeCost) {
      await this.battle.pbDisplay(_INTL("But it does not have enough HP left to make a substitute!"));
      return true;
    }
    return false;
  }

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    await user.pbReduceHP(this.lifeCost, false, false);
    await user.pbItemHPHealCheck();
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Trapping] = 0;
    user.effects[PBEffects.TrappingMove] = null;
    user.effects[PBEffects.Substitute] = this.subLife;
    await this.battle.pbDisplay(_INTL("{1} shed its tail to create a decoy!", user.pbThis()));
  }

  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], numHits: number,
    switchedBattlers: number[]): Promise<void> {
    if (user.fainted() || numHits === 0) return;
    if (!this.battle.pbCanChooseNonActive(user.index)) return;
    await this.battle.pbDisplay(_INTL("{1} went back to {2}!", user.pbThis(), this.battle.pbGetOwnerName(user.index)));
    await this.battle.pbPursuit(user.index);
    const oldSub = user.effects[PBEffects.Substitute];
    if (user.fainted()) return;
    const newPkmn = await this.battle.pbGetReplacementPokemonIndex(user.index);
    if (newPkmn < 0) return;
    await this.battle.pbRecallAndReplace(user.index, newPkmn);
    this.battle.pbClearChoice(user.index);
    this.battle.moldBreaker = false;
    await this.battle.pbOnBattlerEnteringBattle(user.index);
    switchedBattlers.push(user.index);
    user.effects[PBEffects.Substitute] = oldSub;
  }
}
registerMoveClass("UserMakeSubstituteSwitchOut", UserMakeSubstituteSwitchOut);

//===============================================================================
// Doodle
//===============================================================================
// User and all allies copy the target's ability.
//-------------------------------------------------------------------------------
export class SetUserAlliesAbilityToTargetAbility extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    for (const b of this.battle.allSameSideBattlers(user.index)) {
      if (!b.unstoppableAbility()) continue;
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (user.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", user.pbThis()));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.ability || user.abilityId === target.abilityId) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.uncopyableAbility()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    for (const b of this.battle.allSameSideBattlers(user)) {
      if (b.abilityId === target.abilityId) continue;
      if (b.hasActiveItem("ABILITYSHIELD")) {
        await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", b.pbThis()));
      } else {
        await this.battle.pbShowAbilitySplash(b, true, false);
        const oldAbil = b.abilityId;
        b.ability = target.abilityId;
        await this.battle.pbReplaceAbilitySplash(b);
        // NOTE (Ruby parity): names the user (not b) for every ally.
        await this.battle.pbDisplay(_INTL("{1} copied {2}'s {3}!",
          user.pbThis(), target.pbThis(true), target.abilityName()));
        await this.battle.pbHideAbilitySplash(b);
        await b.pbOnLosingAbility(oldAbil);
        await b.pbTriggerAbilityOnGainingIt();
      }
    }
  }
}
registerMoveClass("SetUserAlliesAbilityToTargetAbility", SetUserAlliesAbilityToTargetAbility);

//===============================================================================
// Revival Blessing
//===============================================================================
// Revive one fainted Pokemon from party with up to 1/2 its total HP.
//-------------------------------------------------------------------------------
export class RevivePokemonHalfHP extends Move {
  numFainted = 0;

  override healingMove(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.numFainted = 0;
    // NOTE (Ruby parity): Ruby calls fainted? on every party slot, so an empty
    //       (nil) slot raises NoMethodError there; `!` keeps that (TypeError).
    for (const b of user.battle.pbParty(user.idxOwnSide())) if (b!.fainted()) this.numFainted += 1;
    if (this.numFainted === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], _numHits: number,
    _switchedBattlers: number[]): Promise<void> {
    if (user.fainted() || this.numFainted === 0) return;
    await this.battle.pbReviveInParty(user.index);
  }
}
registerMoveClass("RevivePokemonHalfHP", RevivePokemonHalfHP);
