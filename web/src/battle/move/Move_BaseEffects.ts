// Port of Data/Scripts/011_Battle/003_Move/004_Move_BaseEffects.rb, with:
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:7): TwoTurnMove#pbIsChargingTurn?
//   is redefined (Max Raid Pokémon skip the charging turn of moves that make
//   them semi-invulnerable).
//
// DO NOT USE ANY CLASS NAMES IN HERE AS FUNCTION CODES!
// These are base classes for other classes to build on; those other classes are
// named after function codes, so use those instead.
//
// Instance variables that subclasses set in their constructors (@statUp,
// @statDown, @effect, @combos, ...) are `declare`d here so that the field
// declaration doesn't overwrite them; the ones Ruby's initialize sets
// (@sidedEffect, @weatherType) have initialisers.
//
// Sync/async of these classes' methods: see the table in Move_Usage.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Type } from "../../data/gameData/type";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Scene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Move, registerMoveClass } from "./Move";

//===============================================================================
// Superclass that handles moves using a non-existent function code.
// Damaging moves just do damage with no additional effect.
// Status moves always fail.
//===============================================================================
export class Unimplemented extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.statusMove()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("Unimplemented", Unimplemented);

//===============================================================================
// Pseudomove for confusion damage.
//===============================================================================
export class Confusion extends Move {
  /**
   * Ruby's initialize doesn't call super: every field is set here (the fields
   * Ruby leaves nil keep the Move constructor's defaults for a null move).
   */
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, null);
    this.realMove = move;
    this.id = "CONFUSEDAMAGE";
    this.name = "";
    this.function = "None";
    this.baseDamage = 40;
    this.type = null;
    this.category = 0;
    this.accuracy = 100;
    this.pp = -1;
    this.target = "User";
    this.priority = 0;
    this.flags = [];
    this.addlEffect = 0;
    this.calcType = null;
    this.powerBoost = false;
    this.snatched = false;
  }

  override physicalMove(_thisType: Id | null = null): boolean { return true; }
  override specialMove(_thisType: Id | null = null): boolean { return false; }
  override pbCritialOverride(_user: Battler, _target: Battler): number { return -1; }
}
registerMoveClass("Confusion", Confusion);

//===============================================================================
// Struggle.
//===============================================================================
export class Struggle extends Move {
  /**
   * Ruby's initialize doesn't call super: every field is set here (the fields
   * Ruby leaves nil keep the Move constructor's defaults for a null move).
   */
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, null);
    this.realMove = null; // Not associated with a move
    this.id = move ? move.id : "STRUGGLE";
    this.name = move ? move.name : _INTL("Struggle");
    this.function = "Struggle";
    this.baseDamage = 50;
    this.type = null;
    this.category = 0;
    this.accuracy = 0;
    this.pp = -1;
    this.target = "NearOther";
    this.priority = 0;
    this.flags = ["Contact", "CanProtect"];
    this.addlEffect = 0;
    this.calcType = null;
    this.powerBoost = false;
    this.snatched = false;
    // (Ruby leaves Essentials Deluxe's @short_name nil here; the Move constructor
    // gave it the shortened empty name.)
  }

  override physicalMove(_thisType: Id | null = null): boolean { return true; }
  override specialMove(_thisType: Id | null = null): boolean { return false; }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    await user.pbReduceHP(rubyRound(user.totalhp / 4.0), false);
    await this.battle.pbDisplay(_INTL("{1} is damaged by recoil!", user.pbThis()));
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("Struggle", Struggle);

//===============================================================================
// Raise one of user's stats.
//===============================================================================
export class StatUpMove extends Move {
  /** [stat, stages], set by subclasses. */
  declare statUp: (Id | number)[];

  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await user.pbCanRaiseStatStage(this.statUp[0] as Id, user, this, true));
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await user.pbRaiseStatStage(this.statUp[0] as Id, this.statUp[1] as number, user);
  }

  override async pbAdditionalEffect(user: Battler, _target: Battler): Promise<void> {
    if (await user.pbCanRaiseStatStage(this.statUp[0] as Id, user, this)) {
      await user.pbRaiseStatStage(this.statUp[0] as Id, this.statUp[1] as number, user);
    }
  }
}
registerMoveClass("StatUpMove", StatUpMove);

//===============================================================================
// Raise multiple of user's stats.
//===============================================================================
export class MultiStatUpMove extends Move {
  /** [stat, stages, stat, stages, ...], set by subclasses. */
  declare statUp: (Id | number)[];

  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.damagingMove()) return false;
    let failed = true;
    for (let i = 0; i < Math.floor(this.statUp.length / 2); i++) {
      if (!(await user.pbCanRaiseStatStage(this.statUp[i * 2] as Id, user, this))) continue;
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
    if (this.damagingMove()) return;
    let showAnim = true;
    for (let i = 0; i < Math.floor(this.statUp.length / 2); i++) {
      if (!(await user.pbCanRaiseStatStage(this.statUp[i * 2] as Id, user, this))) continue;
      if (await user.pbRaiseStatStage(this.statUp[i * 2] as Id, this.statUp[(i * 2) + 1] as number, user, showAnim)) {
        showAnim = false;
      }
    }
  }

  override async pbAdditionalEffect(user: Battler, _target: Battler): Promise<void> {
    let showAnim = true;
    for (let i = 0; i < Math.floor(this.statUp.length / 2); i++) {
      if (!(await user.pbCanRaiseStatStage(this.statUp[i * 2] as Id, user, this))) continue;
      if (await user.pbRaiseStatStage(this.statUp[i * 2] as Id, this.statUp[(i * 2) + 1] as number, user, showAnim)) {
        showAnim = false;
      }
    }
  }
}
registerMoveClass("MultiStatUpMove", MultiStatUpMove);

//===============================================================================
// Lower multiple of user's stats.
//===============================================================================
export class StatDownMove extends Move {
  /** [stat, stages, stat, stages, ...], set by subclasses. */
  declare statDown: (Id | number)[];

  override async pbEffectWhenDealingDamage(user: Battler, target: Battler): Promise<void> {
    if (this.battle.pbAllFainted(target.idxOwnSide())) return;
    let showAnim = true;
    for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
      if (!(await user.pbCanLowerStatStage(this.statDown[i * 2] as Id, user, this))) continue;
      if (await user.pbLowerStatStage(this.statDown[i * 2] as Id, this.statDown[(i * 2) + 1] as number, user, showAnim)) {
        showAnim = false;
      }
    }
  }
}
registerMoveClass("StatDownMove", StatDownMove);

//===============================================================================
// Lower one of target's stats.
//===============================================================================
export class TargetStatDownMove extends Move {
  /** [stat, stages], set by subclasses. */
  declare statDown: (Id | number)[];

  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanLowerStatStage(this.statDown[0] as Id, user, this, showMessage));
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbLowerStatStage(this.statDown[0] as Id, this.statDown[1] as number, user);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (!(await target.pbCanLowerStatStage(this.statDown[0] as Id, user, this))) return;
    await target.pbLowerStatStage(this.statDown[0] as Id, this.statDown[1] as number, user);
  }
}
registerMoveClass("TargetStatDownMove", TargetStatDownMove);

//===============================================================================
// Lower multiple of target's stats.
//===============================================================================
export class TargetMultiStatDownMove extends Move {
  /** [stat, stages, stat, stages, ...], set by subclasses. */
  declare statDown: (Id | number)[];

  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    let failed = true;
    for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
      if (!(await target.pbCanLowerStatStage(this.statDown[i * 2] as Id, user, this))) continue;
      failed = false;
      break;
    }
    if (failed) {
      // NOTE: It's a bit of a faff to make sure the appropriate failure message
      //       is shown here, I know.
      let canLower = false;
      if (target.hasActiveAbility("CONTRARY") && !this.battle.moldBreaker) {
        for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
          if (target.statStageAtMax(this.statDown[i * 2] as Id)) continue;
          canLower = true;
          break;
        }
        if (!canLower && showMessage) {
          await this.battle.pbDisplay(_INTL("{1}'s stats won't go any higher!", user.pbThis()));
        }
      } else {
        for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
          if (target.statStageAtMin(this.statDown[i * 2] as Id)) continue;
          canLower = true;
          break;
        }
        if (!canLower && showMessage) {
          await this.battle.pbDisplay(_INTL("{1}'s stats won't go any lower!", user.pbThis()));
        }
      }
      if (canLower) {
        await target.pbCanLowerStatStage(this.statDown[0] as Id, user, this, showMessage);
      }
      return true;
    }
    return false;
  }

  async pbCheckForMirrorArmor(user: Battler, target: Battler): Promise<boolean> {
    if (target.hasActiveAbility("MIRRORARMOR") && user.index !== target.index) {
      let failed = true;
      for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
        if (target.statStageAtMin(this.statDown[i * 2] as Id)) continue;
        if (!(await user.pbCanLowerStatStage(this.statDown[i * 2] as Id, target, this, false, false, true))) continue;
        failed = false;
        break;
      }
      if (failed) {
        await this.battle.pbShowAbilitySplash(target);
        if (!Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1}'s {2} activated!", target.pbThis(), target.abilityName()));
        }
        await user.pbCanLowerStatStage(this.statDown[0] as Id, target, this, true, false, true); // Show fail message
        await this.battle.pbHideAbilitySplash(target);
        return false;
      }
    }
    return true;
  }

  async pbLowerTargetMultipleStats(user: Battler, target: Battler): Promise<void> {
    if (!(await this.pbCheckForMirrorArmor(user, target))) return;
    let showAnim = true;
    let showMirrorArmorSplash = true;
    for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
      if (!(await target.pbCanLowerStatStage(this.statDown[i * 2] as Id, user, this))) continue;
      if (await target.pbLowerStatStage(this.statDown[i * 2] as Id, this.statDown[(i * 2) + 1] as number, user,
        showAnim, false, showMirrorArmorSplash ? 1 : 3)) {
        showAnim = false;
      }
      showMirrorArmorSplash = false;
    }
    await this.battle.pbHideAbilitySplash(target); // To hide target's Mirror Armor splash
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (!this.damagingMove()) await this.pbLowerTargetMultipleStats(user, target);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (!target.damageState.substitute) await this.pbLowerTargetMultipleStats(user, target);
  }
}
registerMoveClass("TargetMultiStatDownMove", TargetMultiStatDownMove);

//===============================================================================
// Fixed damage-inflicting move.
//===============================================================================
export class FixedDamageMove extends Move {
  pbFixedDamage(_user: Battler, _target: Battler): number { return 1; }

  override async pbCalcDamage(user: Battler, target: Battler, _numTargets = 1): Promise<void> {
    target.damageState.critical = false;
    target.damageState.calcDamage = this.pbFixedDamage(user, target);
    if (target.damageState.calcDamage < 1) target.damageState.calcDamage = 1;
  }
}
registerMoveClass("FixedDamageMove", FixedDamageMove);

//===============================================================================
// Two turn move.
//===============================================================================
export class TwoTurnMove extends Move {
  /** attr_reader :chargingTurn (nil until pbIsChargingTurn? runs). */
  chargingTurn: boolean | null = null;
  powerHerb: boolean | null = null;
  damagingTurn: boolean | null = null;

  override chargingTurnMove(): boolean { return true; }

  /**
   * pbIsChargingTurn? — user.effects[PBEffects::TwoTurnAttack] is set to the
   * move's ID if this method returns true, or nil if false.
   * Non-nil means the charging turn. nil means the attacking turn.
   * ZUD Mechanics (redefined): Max Raid Pokémon skip the charging turn of moves
   * that make them semi-invulnerable.
   */
  override pbIsChargingTurn(user: Battler): boolean {
    this.powerHerb = false;
    this.chargingTurn = false; // Assume damaging turn by default
    this.damagingTurn = true;
    // nil at start of charging turn, move's ID at start of damaging turn
    if (!user.effects[PBEffects.TwoTurnAttack]) {
      this.powerHerb = user.hasActiveItem("POWERHERB");
      this.chargingTurn = true;
      this.damagingTurn = this.powerHerb;
      // ZUD Mechanics
      if (user.effects[PBEffects.MaxRaidBoss] &&
          ["TwoTurnAttackInvulnerableInSky",
            "TwoTurnAttackInvulnerableUnderground",
            "TwoTurnAttackInvulnerableUnderwater",
            "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
            "TwoTurnAttackInvulnerableRemoveProtections",
            "TwoTurnAttackInvulnerableInSkyTargetCannotAct",
            "TwoTurnAttackInvulnerableRemoveProtections"].includes(this.function)) {
        this.damagingTurn = true;
      }
    }
    return !this.damagingTurn; // Deliberately not "return @chargingTurn"
  }

  /** pbDamagingMove? — Stops damage being dealt in the first (charging) turn */
  override pbDamagingMove(): boolean {
    if (!this.damagingTurn) return false;
    return super.pbDamagingMove();
  }

  override pbAccuracyCheck(user: Battler, target: Battler): boolean {
    if (!this.damagingTurn) return true;
    return super.pbAccuracyCheck(user, target);
  }

  override async pbInitialEffect(user: Battler, targets: Battler[], _hitNum: number): Promise<void> {
    if (this.chargingTurn) await this.pbChargingTurnMessage(user, targets);
    if (this.chargingTurn && this.damagingTurn) { // Move only takes one turn to use
      await this.pbShowAnimation(this.id, user, targets, 1); // Charging anim
      for (const b of targets) await this.pbChargingTurnEffect(user, b);
      if (this.powerHerb) {
        // Moves that would make the user semi-invulnerable will hide the user
        // after the charging animation, so the "UseItem" animation shouldn't show
        // for it
        if (!["TwoTurnAttackInvulnerableInSky",
          "TwoTurnAttackInvulnerableUnderground",
          "TwoTurnAttackInvulnerableUnderwater",
          "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
          "TwoTurnAttackInvulnerableRemoveProtections",
          "TwoTurnAttackInvulnerableInSkyTargetCannotAct"].includes(this.function)) {
          await this.battle.pbCommonAnimation("UseItem", user);
        }
        await this.battle.pbDisplay(_INTL("{1} became fully charged due to its Power Herb!", user.pbThis()));
        await user.pbConsumeItem();
      }
    }
    if (this.damagingTurn) await this.pbAttackingTurnMessage(user, targets);
  }

  async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} began charging up!", user.pbThis()));
  }

  async pbAttackingTurnMessage(_user: Battler, _targets: Battler[]): Promise<void> {}

  async pbChargingTurnEffect(_user: Battler, _target: Battler): Promise<void> {
    // Skull Bash/Sky Drop are the only two-turn moves with an effect here, and
    // the latter just records the target is being Sky Dropped
  }

  async pbAttackingTurnEffect(_user: Battler, _target: Battler): Promise<void> {}

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingTurn) {
      await this.pbAttackingTurnEffect(user, target);
    } else if (this.chargingTurn) {
      await this.pbChargingTurnEffect(user, target);
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.chargingTurn && !this.damagingTurn) hitNum = 1; // Charging anim
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("TwoTurnMove", TwoTurnMove);

//===============================================================================
// Healing move.
//===============================================================================
export class HealingMove extends Move {
  override healingMove(): boolean { return true; }
  pbHealAmount(_user: Battler): number { return 1; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.hp === user.totalhp) {
      await this.battle.pbDisplay(_INTL("{1}'s HP is full!", user.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const amt = this.pbHealAmount(user);
    await user.pbRecoverHP(amt);
    await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", user.pbThis()));
  }
}
registerMoveClass("HealingMove", HealingMove);

//===============================================================================
// Recoil move.
//===============================================================================
export class RecoilMove extends Move {
  override recoilMove(): boolean { return true; }
  pbRecoilDamage(_user: Battler, _target: Battler): number { return 1; }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    if (!user.takesIndirectDamage()) return;
    if (user.hasActiveAbility("ROCKHEAD")) return;
    let amt = this.pbRecoilDamage(user, target);
    if (amt < 1) amt = 1;
    await user.pbReduceHP(amt, false);
    await this.battle.pbDisplay(_INTL("{1} is damaged by recoil!", user.pbThis()));
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("RecoilMove", RecoilMove);

//===============================================================================
// Protect move.
//===============================================================================
export class ProtectMove extends Move {
  sidedEffect = false;
  /** PBEffects index of the battler (or side, if sidedEffect) effect, set by subclasses. */
  declare effect: number;

  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    const oldVal = user.effects[PBEffects.ProtectRate];
    super.pbChangeUsageCounters(user, specialUsage);
    user.effects[PBEffects.ProtectRate] = oldVal;
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.sidedEffect) {
      if (user.pbOwnSide().effects[this.effect]) {
        user.effects[PBEffects.ProtectRate] = 1;
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
    } else if (user.effects[this.effect]) {
      user.effects[PBEffects.ProtectRate] = 1;
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if ((!this.sidedEffect || Settings.MECHANICS_GENERATION_AT_RUNTIME <= 5) &&
        user.effects[PBEffects.ProtectRate] > 1 &&
        this.battle.pbRandom(user.effects[PBEffects.ProtectRate]) !== 0) {
      user.effects[PBEffects.ProtectRate] = 1;
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedLastInRound(user)) {
      user.effects[PBEffects.ProtectRate] = 1;
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (this.sidedEffect) {
      user.pbOwnSide().effects[this.effect] = true;
    } else {
      user.effects[this.effect] = true;
    }
    user.effects[PBEffects.ProtectRate] *= (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) ? 3 : 2;
    await this.pbProtectMessage(user);
  }

  async pbProtectMessage(user: Battler): Promise<void> {
    if (this.sidedEffect) {
      await this.battle.pbDisplay(_INTL("{1} protected {2}!", this.name, user.pbTeam(true)));
    } else {
      await this.battle.pbDisplay(_INTL("{1} protected itself!", user.pbThis()));
    }
  }
}
registerMoveClass("ProtectMove", ProtectMove);

//===============================================================================
// Weather-inducing move.
//===============================================================================
export class WeatherMove extends Move {
  weatherType: Id = "None";

  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    switch (this.battle.field.weather) {
      case "HarshSun":
        await this.battle.pbDisplay(_INTL("The extremely harsh sunlight was not lessened at all!"));
        return true;
      case "HeavyRain":
        await this.battle.pbDisplay(_INTL("There is no relief from this heavy rain!"));
        return true;
      case "StrongWinds":
        await this.battle.pbDisplay(_INTL("The mysterious air current blows on regardless!"));
        return true;
      case this.weatherType:
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await this.battle.pbStartWeather(user, this.weatherType, true, false);
  }
}
registerMoveClass("WeatherMove", WeatherMove);

//===============================================================================
// Pledge move.
//===============================================================================
/** [function code of the other Pledge, combo effect, combined type, animation move]. */
export type PledgeCombo = [string, Id, Id | null, Id | null];

export class PledgeMove extends Move {
  /** Set by subclasses. */
  declare combos: PledgeCombo[];
  pledgeSetup: boolean | null = null;
  pledgeCombo: boolean | null = null;
  pledgeOtherUser: Battler | null = null;
  comboEffect: Id | null = null;
  overrideAnim: Id | null = null;

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    this.pledgeSetup = false;
    this.pledgeCombo = false;
    this.pledgeOtherUser = null;
    this.comboEffect = null;
    this.overrideAnim = null;
    // Check whether this is the use of a combo move
    for (const i of this.combos) {
      if (i[0] !== user.effects[PBEffects.FirstPledge]) continue;
      await this.battle.pbDisplay(_INTL("The two moves have become one! It's a combined move!"));
      this.pledgeCombo = true;
      this.comboEffect = i[1];
      this.overrideAnim = i[3];
      break;
    }
    if (this.pledgeCombo) return;
    // Check whether this is the setup of a combo move
    for (const b of user.allAllies()) {
      if (this.battle.choices[b.index]![0] !== "UseMove" || b.movedThisRound()) continue;
      const move = this.battle.choices[b.index]![2] as Move | null;
      if (!move) continue;
      for (const i of this.combos) {
        if (i[0] !== move.function) continue;
        this.pledgeSetup = true;
        this.pledgeOtherUser = b;
        break;
      }
      if (this.pledgeSetup) break;
    }
  }

  /** pbDamagingMove? */
  override pbDamagingMove(): boolean {
    if (this.pledgeSetup) return false;
    return super.pbDamagingMove();
  }

  override pbBaseType(user: Battler): Id | null {
    // This method is called before pbOnStartUse, so it has to calculate the type
    // separately
    for (const i of this.combos) {
      if (i[0] !== user.effects[PBEffects.FirstPledge]) continue;
      if (!Type.exists(i[2])) continue;
      return i[2];
    }
    return super.pbBaseType(user);
  }

  override pbBaseDamage(baseDmg: number, _user: Battler, _target: Battler): number {
    if (this.pledgeCombo) baseDmg *= 2;
    return baseDmg;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.FirstPledge] = null;
    if (!this.pledgeSetup) return;
    await this.battle.pbDisplay(_INTL("{1} is waiting for {2}'s move...",
      user.pbThis(), this.pledgeOtherUser!.pbThis(true)));
    this.pledgeOtherUser!.effects[PBEffects.FirstPledge] = this.function;
    this.pledgeOtherUser!.effects[PBEffects.MoveNext] = true;
    user.lastMoveFailed = true; // Treated as a failure for Stomping Tantrum
  }

  override async pbEffectAfterAllHits(user: Battler, _target: Battler): Promise<void> {
    if (!this.pledgeCombo) return;
    let msg: string | null = null;
    let animName: string | null = null;
    switch (this.comboEffect) {
      case "SeaOfFire": // Grass + Fire
        if (user.pbOpposingSide().effects[PBEffects.SeaOfFire] === 0) {
          user.pbOpposingSide().effects[PBEffects.SeaOfFire] = 4;
          msg = _INTL("A sea of fire enveloped {1}!", user.pbOpposingTeam(true));
          animName = user.opposes() ? "SeaOfFire" : "SeaOfFireOpp";
        }
        break;
      case "Rainbow": // Fire + Water
        if (user.pbOwnSide().effects[PBEffects.Rainbow] === 0) {
          user.pbOwnSide().effects[PBEffects.Rainbow] = 4;
          msg = _INTL("A rainbow appeared in the sky on {1}'s side!", user.pbTeam(true));
          animName = user.opposes() ? "RainbowOpp" : "Rainbow";
        }
        break;
      case "Swamp": // Water + Grass
        if (user.pbOpposingSide().effects[PBEffects.Swamp] === 0) {
          user.pbOpposingSide().effects[PBEffects.Swamp] = 4;
          msg = _INTL("A swamp enveloped {1}!", user.pbOpposingTeam(true));
          animName = user.opposes() ? "Swamp" : "SwampOpp";
        }
        break;
    }
    if (msg) await this.battle.pbDisplay(msg);
    if (animName) await this.battle.pbCommonAnimation(animName);
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.pledgeSetup) return; // No animation for setting up
    if (this.overrideAnim) id = this.overrideAnim;
    return super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("PledgeMove", PledgeMove);
