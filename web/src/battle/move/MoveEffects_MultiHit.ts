// Port of Data/Scripts/011_Battle/003_Move/009_MoveEffects_MultiHit.rb, with:
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:120):
//   MultiTurnAttackPreventSleeping (Uproar) pbEffectGeneral is redefined (also
//   wakes Drowsy battlers); :318 HitTwoToFiveTimes pbNumHits and :331
//   HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1 pbNumHits (Loaded Dice: always
//   4-5 hits); :344 HitThreeTimesPowersUpWithEachHit pbOnStartUse is redefined
//   (Loaded Dice skips the per-hit accuracy checks).
// Alias chains (load order Hotfixes → Gen 9 → ZUD):
//   HitTwoToFiveTimes#pbNumHits = Gen 9( core ) (inherited by
//     HitTwoToFiveTimesOrThreeForAshGreninja's super call)
//   HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1#pbNumHits = Gen 9( core )
//   HitThreeTimesPowersUpWithEachHit#pbOnStartUse = Gen 9 (redefined)
//   MultiTurnAttackPreventSleeping#pbEffectGeneral = Gen 9 (redefined)

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness } from "../../data/gameData/type";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { Move, registerMoveClass } from "./Move";
import { FixedDamageMove, TwoTurnMove } from "./Move_BaseEffects";
import { FlinchTarget, PoisonTarget } from "./MoveEffects_BattlerOther";

//===============================================================================
// Hits twice.
//===============================================================================
export class HitTwoTimes extends Move {
  override multiHitMove(): boolean { return true; }
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 2; }
}
registerMoveClass("HitTwoTimes", HitTwoTimes);

//===============================================================================
// Hits twice. May poison the target on each hit. (Twineedle)
//===============================================================================
export class HitTwoTimesPoisonTarget extends PoisonTarget {
  override multiHitMove(): boolean { return true; }
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 2; }
}
registerMoveClass("HitTwoTimesPoisonTarget", HitTwoTimesPoisonTarget);

//===============================================================================
// Hits twice. Causes the target to flinch. (Double Iron Bash)
//===============================================================================
export class HitTwoTimesFlinchTarget extends FlinchTarget {
  override multiHitMove(): boolean { return true; }
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 2; }
}
registerMoveClass("HitTwoTimesFlinchTarget", HitTwoTimesFlinchTarget);

//===============================================================================
// Hits in 2 volleys. The second volley targets the original target's ally if it
// has one (that can be targeted), or the original target if not. A battler
// cannot be targeted if it is is immune to or protected from this move somehow,
// or if this move will miss it. (Dragon Darts)
// NOTE: This move sometimes shows a different failure message compared to the
//       official games. This is because of the order in which failure checks are
//       done (all checks for each target in turn, versus all targets for each
//       check in turn). This is considered unimportant, and since correcting it
//       would involve extensive code rewrites, it is being ignored.
//===============================================================================
export class HitTwoTimesTargetThenTargetAlly extends Move {
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 1; }
  override pbRepeatHit(): boolean { return true; }

  override pbModifyTargets(targets: Battler[], user: Battler): void {
    if (targets.length !== 1) return;
    const choices: Battler[] = [];
    for (const b of targets[0]!.allAllies()) user.pbAddTarget(choices, user, b, this);
    if (choices.length === 0) return;
    const idxChoice = (choices.length > 1) ? this.battle.pbRandom(choices.length) : 0;
    user.pbAddTarget(targets, user, choices[idxChoice], this, !this.pbTarget(user).canChooseDistantTarget());
  }

  override pbShowFailMessages(targets: Battler[]): boolean {
    if (targets.length > 1) {
      const validTargets = targets.filter((b) => !b.fainted() && !b.damageState.unaffected);
      return validTargets.length <= 1;
    }
    return super.pbShowFailMessages(targets);
  }

  override pbDesignateTargetsForHit(targets: Battler[], hitNum: number): Battler[] {
    const validTargets: Battler[] = [];
    for (const b of targets) if (!b.damageState.unaffected) validTargets.push(b);
    if (validTargets[1] && hitNum === 1) return [validTargets[1]];
    // NOTE (Ruby parity): with no valid targets Ruby returns [nil]; this returns [undefined].
    return [validTargets[0]!];
  }
}
registerMoveClass("HitTwoTimesTargetThenTargetAlly", HitTwoTimesTargetThenTargetAlly);

//===============================================================================
// Hits 3 times. Power is multiplied by the hit number. (Triple Kick)
// An accuracy check is performed for each hit.
//===============================================================================
export class HitThreeTimesPowersUpWithEachHit extends Move {
  /** Ruby: nil until pbOnStartUse. */
  calcBaseDmg = 0;
  /** Ruby: nil until pbOnStartUse. */
  accCheckPerHit: boolean | null = null;

  override multiHitMove(): boolean { return true; }
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 3; }

  override successCheckPerHit(): boolean {
    return !!this.accCheckPerHit;
  }

  /** Generation 9 Pack (redefined): Loaded Dice bypasses the additional accuracy checks. */
  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    this.calcBaseDmg = 0;
    this.accCheckPerHit = !user.hasActiveAbility("SKILLLINK") && !user.hasActiveItem("LOADEDDICE");
  }

  override pbBaseDamage(baseDmg: number, _user: Battler, _target: Battler): number {
    this.calcBaseDmg += baseDmg;
    return this.calcBaseDmg;
  }
}
registerMoveClass("HitThreeTimesPowersUpWithEachHit", HitThreeTimesPowersUpWithEachHit);

//===============================================================================
// Hits 3 times in a row. If each hit could be a critical hit, it will definitely
// be a critical hit. (Surging Strikes)
//===============================================================================
export class HitThreeTimesAlwaysCriticalHit extends Move {
  override multiHitMove(): boolean { return true; }
  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 3; }
  override pbCritialOverride(_user: Battler, _target: Battler): number { return 1; }
}
registerMoveClass("HitThreeTimesAlwaysCriticalHit", HitThreeTimesAlwaysCriticalHit);

//===============================================================================
// Hits 2-5 times.
//===============================================================================
export class HitTwoToFiveTimes extends Move {
  override multiHitMove(): boolean { return true; }

  /** Generation 9 Pack (alias): Loaded Dice makes this always hit 4-5 times. */
  override pbNumHits(user: Battler, targets: Battler[]): number {
    // NOTE: Ruby uses Kernel#rand(2) here; deliberately routed through
    //       pbRandom so that the battle RNG stays the only source of randomness.
    if (user.hasActiveItem("LOADEDDICE")) return 4 + this.battle.pbRandom(2);
    return this.paldeaPbNumHits(user, targets);
  }

  /** Core Essentials' pbNumHits (aliased as paldea_pbNumHits by the Gen 9 Pack). */
  private paldeaPbNumHits(user: Battler, _targets: Battler[]): number {
    const hitChances = [
      2, 2, 2, 2, 2, 2, 2,
      3, 3, 3, 3, 3, 3, 3,
      4, 4, 4,
      5, 5, 5,
    ];
    let r = this.battle.pbRandom(hitChances.length);
    if (user.hasActiveAbility("SKILLLINK")) r = hitChances.length - 1;
    return hitChances[r]!;
  }
}
registerMoveClass("HitTwoToFiveTimes", HitTwoToFiveTimes);

//===============================================================================
// Hits 2-5 times. If the user is Ash Greninja, powers up and hits 3 times.
// (Water Shuriken)
//===============================================================================
export class HitTwoToFiveTimesOrThreeForAshGreninja extends HitTwoToFiveTimes {
  override pbNumHits(user: Battler, targets: Battler[]): number {
    if (user.isSpecies("GRENINJA") && user.form === 2) return 3;
    return super.pbNumHits(user, targets);
  }

  override pbBaseDamage(baseDmg: number, user: Battler, target: Battler): number {
    if (user.isSpecies("GRENINJA") && user.form === 2) return 20;
    return super.pbBaseDamage(baseDmg, user, target);
  }
}
registerMoveClass("HitTwoToFiveTimesOrThreeForAshGreninja", HitTwoToFiveTimesOrThreeForAshGreninja);

//===============================================================================
// Hits 2-5 times in a row. If the move does not fail, increases the user's Speed
// by 1 stage and decreases the user's Defense by 1 stage. (Scale Shot)
//===============================================================================
export class HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1 extends Move {
  override multiHitMove(): boolean { return true; }

  /** Generation 9 Pack (alias): Loaded Dice makes this always hit 4-5 times. */
  override pbNumHits(user: Battler, targets: Battler[]): number {
    // NOTE: Ruby uses Kernel#rand(2) here; deliberately routed through
    //       pbRandom so that the battle RNG stays the only source of randomness.
    if (user.hasActiveItem("LOADEDDICE")) return 4 + this.battle.pbRandom(2);
    return this.paldeaPbNumHits(user, targets);
  }

  /** Core Essentials' pbNumHits (aliased as paldea_pbNumHits by the Gen 9 Pack). */
  private paldeaPbNumHits(user: Battler, _targets: Battler[]): number {
    const hitChances = [
      2, 2, 2, 2, 2, 2, 2,
      3, 3, 3, 3, 3, 3, 3,
      4, 4, 4,
      5, 5, 5,
    ];
    let r = this.battle.pbRandom(hitChances.length);
    if (user.hasActiveAbility("SKILLLINK")) r = hitChances.length - 1;
    return hitChances[r]!;
  }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    if (await user.pbCanLowerStatStage("DEFENSE", user, this)) {
      await user.pbLowerStatStage("DEFENSE", 1, user);
    }
    if (await user.pbCanRaiseStatStage("SPEED", user, this)) {
      await user.pbRaiseStatStage("SPEED", 1, user);
    }
  }
}
registerMoveClass("HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1", HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1);

//===============================================================================
// Hits X times, where X is the number of non-user unfainted status-free Pokémon
// in the user's party (not including partner trainers). Fails if X is 0.
// Base power of each hit depends on the base Attack stat for the species of that
// hit's participant. (Beat Up)
//===============================================================================
export class HitOncePerUserTeamMember extends Move {
  /** Party indices of the participants (Ruby: nil until pbMoveFailed?). */
  beatUpList: number[] = [];

  override multiHitMove(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.beatUpList = [];
    this.battle.eachInTeamFromBattlerIndex(user.index, (pkmn, i) => {
      if (!pkmn.able() || pkmn.status !== "NONE") return;
      this.beatUpList.push(i);
    });
    if (this.beatUpList.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override pbNumHits(_user: Battler, _targets: Battler[]): number {
    return this.beatUpList.length;
  }

  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    const i = this.beatUpList.shift()!; // First element in array, and removes it from array
    const atk = this.battle.pbParty(user.index)[i]!.baseStats()["ATTACK"]!;
    return 5 + Math.floor(atk / 10);
  }
}
registerMoveClass("HitOncePerUserTeamMember", HitOncePerUserTeamMember);

//===============================================================================
// Attacks first turn, skips second turn (if successful).
//===============================================================================
export class AttackAndSkipNextTurn extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.HyperBeam] = 2;
    user.currentMove = this.id;
  }
}
registerMoveClass("AttackAndSkipNextTurn", AttackAndSkipNextTurn);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Razor Wind)
//===============================================================================
export class TwoTurnAttack extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} whipped up a whirlwind!", user.pbThis()));
  }
}
registerMoveClass("TwoTurnAttack", TwoTurnAttack);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Solar Beam, Solar Blade)
// Power halved in all weather except sunshine. In sunshine, takes 1 turn instead.
//===============================================================================
export class TwoTurnAttackOneTurnInSun extends TwoTurnMove {
  override pbIsChargingTurn(user: Battler): boolean {
    const ret = super.pbIsChargingTurn(user);
    if (!user.effects[PBEffects.TwoTurnAttack] &&
        ["Sun", "HarshSun"].includes(user.effectiveWeather())) {
      this.powerHerb = false;
      this.chargingTurn = true;
      this.damagingTurn = true;
      return false;
    }
    return ret;
  }

  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} took in sunlight!", user.pbThis()));
  }

  override pbBaseDamageMultiplier(damageMult: number, user: Battler, _target: Battler): number {
    if (!["None", "Sun", "HarshSun"].includes(user.effectiveWeather())) damageMult /= 2;
    return damageMult;
  }
}
registerMoveClass("TwoTurnAttackOneTurnInSun", TwoTurnAttackOneTurnInSun);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Freeze Shock)
// May paralyze the target.
//===============================================================================
export class TwoTurnAttackParalyzeTarget extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} became cloaked in a freezing light!", user.pbThis()));
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user);
  }
}
registerMoveClass("TwoTurnAttackParalyzeTarget", TwoTurnAttackParalyzeTarget);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Ice Burn)
// May burn the target.
//===============================================================================
export class TwoTurnAttackBurnTarget extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} became cloaked in freezing air!", user.pbThis()));
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanBurn(user, false, this)) await target.pbBurn(user);
  }
}
registerMoveClass("TwoTurnAttackBurnTarget", TwoTurnAttackBurnTarget);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Sky Attack)
// May make the target flinch.
//===============================================================================
export class TwoTurnAttackFlinchTarget extends TwoTurnMove {
  override flinchingMove(): boolean { return true; }

  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} became cloaked in a harsh light!", user.pbThis()));
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    target.pbFlinch(user);
  }
}
registerMoveClass("TwoTurnAttackFlinchTarget", TwoTurnAttackFlinchTarget);

//===============================================================================
// Two turn attack. Skips first turn, and increases the user's Special Attack,
// Special Defense and Speed by 2 stages each in the second turn. (Geomancy)
//===============================================================================
export class TwoTurnAttackRaiseUserSpAtkSpDefSpd2 extends TwoTurnMove {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.TwoTurnAttack]) return false; // Charging turn
    if (!(await user.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this)) &&
        !(await user.pbCanRaiseStatStage("SPECIAL_DEFENSE", user, this)) &&
        !(await user.pbCanRaiseStatStage("SPEED", user, this))) {
      await this.battle.pbDisplay(_INTL("{1}'s stats won't go any higher!", user.pbThis()));
      return true;
    }
    return false;
  }

  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} is absorbing power!", user.pbThis()));
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (!this.damagingTurn) return;
    let showAnim = true;
    for (const s of ["SPECIAL_ATTACK", "SPECIAL_DEFENSE", "SPEED"]) {
      if (!(await user.pbCanRaiseStatStage(s, user, this))) continue;
      if (await user.pbRaiseStatStage(s, 2, user, showAnim)) {
        showAnim = false;
      }
    }
  }
}
registerMoveClass("TwoTurnAttackRaiseUserSpAtkSpDefSpd2", TwoTurnAttackRaiseUserSpAtkSpDefSpd2);

//===============================================================================
// Two turn attack. Ups user's Defense by 1 stage first turn, attacks second turn.
// (Skull Bash)
//===============================================================================
export class TwoTurnAttackChargeRaiseUserDefense1 extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} tucked in its head!", user.pbThis()));
  }

  override async pbChargingTurnEffect(user: Battler, _target: Battler): Promise<void> {
    if (await user.pbCanRaiseStatStage("DEFENSE", user, this)) {
      await user.pbRaiseStatStage("DEFENSE", 1, user);
    }
  }
}
registerMoveClass("TwoTurnAttackChargeRaiseUserDefense1", TwoTurnAttackChargeRaiseUserDefense1);

//===============================================================================
// Two-turn attack. On the first turn, increases the user's Special Attack by 1
// stage. On the second turn, does damage. (Meteor Beam)
//===============================================================================
export class TwoTurnAttackChargeRaiseUserSpAtk1 extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} is overflowing with space power!", user.pbThis()));
  }

  override async pbChargingTurnEffect(user: Battler, _target: Battler): Promise<void> {
    if (await user.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this)) {
      await user.pbRaiseStatStage("SPECIAL_ATTACK", 1, user);
    }
  }
}
registerMoveClass("TwoTurnAttackChargeRaiseUserSpAtk1", TwoTurnAttackChargeRaiseUserSpAtk1);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Dig)
// (Handled in Battler's pbSuccessCheckPerHit): Is semi-invulnerable during use.
//===============================================================================
export class TwoTurnAttackInvulnerableUnderground extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} burrowed its way under the ground!", user.pbThis()));
  }
}
registerMoveClass("TwoTurnAttackInvulnerableUnderground", TwoTurnAttackInvulnerableUnderground);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Dive)
// (Handled in Battler's pbSuccessCheckPerHit): Is semi-invulnerable during use.
//===============================================================================
export class TwoTurnAttackInvulnerableUnderwater extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} hid underwater!", user.pbThis()));
  }
}
registerMoveClass("TwoTurnAttackInvulnerableUnderwater", TwoTurnAttackInvulnerableUnderwater);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Fly)
// (Handled in Battler's pbSuccessCheckPerHit): Is semi-invulnerable during use.
//===============================================================================
export class TwoTurnAttackInvulnerableInSky extends TwoTurnMove {
  override unusableInGravity(): boolean { return true; }

  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} flew up high!", user.pbThis()));
  }
}
registerMoveClass("TwoTurnAttackInvulnerableInSky", TwoTurnAttackInvulnerableInSky);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Bounce)
// May paralyze the target.
// (Handled in Battler's pbSuccessCheckPerHit): Is semi-invulnerable during use.
//===============================================================================
export class TwoTurnAttackInvulnerableInSkyParalyzeTarget extends TwoTurnMove {
  override unusableInGravity(): boolean { return true; }

  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} sprang up!", user.pbThis()));
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user);
  }
}
registerMoveClass("TwoTurnAttackInvulnerableInSkyParalyzeTarget", TwoTurnAttackInvulnerableInSkyParalyzeTarget);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. (Sky Drop)
// (Handled in Battler's pbSuccessCheckPerHit): Is semi-invulnerable during use.
// Target is also semi-invulnerable during use, and can't take any action.
// Doesn't damage airborne Pokémon (but still makes them unable to move during).
//===============================================================================
export class TwoTurnAttackInvulnerableInSkyTargetCannotAct extends TwoTurnMove {
  override unusableInGravity(): boolean { return true; }

  override pbIsChargingTurn(user: Battler): boolean {
    // NOTE: Sky Drop doesn't benefit from Power Herb, probably because it works
    //       differently (i.e. immobilises the target during use too).
    this.powerHerb = false;
    this.chargingTurn = (user.effects[PBEffects.TwoTurnAttack] == null);
    this.damagingTurn = (user.effects[PBEffects.TwoTurnAttack] != null);
    return !this.damagingTurn;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.opposes(user)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.effects[PBEffects.Substitute] > 0 && !this.ignoresSubstitute(user)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && target.pbWeight() >= 2000) { // 200.0kg
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.semiInvulnerable() ||
        (target.effects[PBEffects.SkyDrop] >= 0 && this.chargingTurn)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.effects[PBEffects.SkyDrop] !== user.index && this.damagingTurn) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override pbCalcTypeMod(moveType: Id | null, user: Battler, target: Battler): number {
    if (target.pbHasType("FLYING")) return Effectiveness.INEFFECTIVE;
    return super.pbCalcTypeMod(moveType, user, target);
  }

  override async pbChargingTurnMessage(user: Battler, targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} took {2} into the sky!", user.pbThis(), targets[0]!.pbThis(true)));
  }

  override async pbAttackingTurnMessage(_user: Battler, targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} was freed from the Sky Drop!", targets[0]!.pbThis()));
  }

  override async pbChargingTurnEffect(user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.SkyDrop] = user.index;
  }

  override async pbAttackingTurnEffect(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.SkyDrop] = -1;
  }
}
registerMoveClass("TwoTurnAttackInvulnerableInSkyTargetCannotAct", TwoTurnAttackInvulnerableInSkyTargetCannotAct);

//===============================================================================
// Two turn attack. Skips first turn, attacks second turn. Is invulnerable during
// use. Ends target's protections upon hit. (Shadow Force, Phantom Force)
//===============================================================================
export class TwoTurnAttackInvulnerableRemoveProtections extends TwoTurnMove {
  override async pbChargingTurnMessage(user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} vanished instantly!", user.pbThis()));
  }

  override async pbAttackingTurnEffect(_user: Battler, target: Battler): Promise<void> {
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
}
registerMoveClass("TwoTurnAttackInvulnerableRemoveProtections", TwoTurnAttackInvulnerableRemoveProtections);

//===============================================================================
// User must use this move for 2 more rounds. No battlers can sleep. (Uproar)
// NOTE: Bulbapedia claims that an uproar will wake up Pokémon even if they have
//       Soundproof, and will not allow Pokémon to fall asleep even if they have
//       Soundproof. I think this is an oversight, so I've let Soundproof Pokémon
//       be unaffected by Uproar waking/non-sleeping effects.
//===============================================================================
export class MultiTurnAttackPreventSleeping extends Move {
  /** Generation 9 Pack (redefined): also wakes Drowsy battlers. */
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.effects[PBEffects.Uproar] > 0) return;
    user.effects[PBEffects.Uproar] = 3;
    user.currentMove = this.id;
    await this.battle.pbDisplay(_INTL("{1} caused an uproar!", user.pbThis()));
    for (const b of this.battle.pbPriority(true)) {
      if (b.fainted() || !["SLEEP", "DROWSY"].includes(b.status)) continue;
      if (b.hasActiveAbility("SOUNDPROOF")) continue;
      await b.pbCureStatus();
    }
  }
}
registerMoveClass("MultiTurnAttackPreventSleeping", MultiTurnAttackPreventSleeping);

//===============================================================================
// User must use this move for 1 or 2 more rounds. At end, user becomes confused.
// (Outrage, Petal Dange, Thrash)
//===============================================================================
export class MultiTurnAttackConfuseUserAtEnd extends Move {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (!target.damageState.unaffected && user.effects[PBEffects.Outrage] === 0) {
      user.effects[PBEffects.Outrage] = 2 + this.battle.pbRandom(2);
      user.currentMove = this.id;
    }
    if (user.effects[PBEffects.Outrage] > 0) {
      user.effects[PBEffects.Outrage] -= 1;
      if (user.effects[PBEffects.Outrage] === 0 && user.pbCanConfuseSelf(false)) {
        await user.pbConfuse(_INTL("{1} became confused due to fatigue!", user.pbThis()));
      }
    }
  }
}
registerMoveClass("MultiTurnAttackConfuseUserAtEnd", MultiTurnAttackConfuseUserAtEnd);

//===============================================================================
// User must use this move for 4 more rounds. Power doubles each round.
// Power is also doubled if user has curled up. (Ice Ball, Rollout)
//===============================================================================
export class MultiTurnAttackPowersUpEachTurn extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    let shift = (5 - user.effects[PBEffects.Rollout]); // 0-4, where 0 is most powerful
    if (user.effects[PBEffects.Rollout] === 0) shift = 0; // For first turn
    if (user.effects[PBEffects.DefenseCurl]) shift += 1;
    baseDmg *= 2 ** shift;
    return baseDmg;
  }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (!target.damageState.unaffected && user.effects[PBEffects.Rollout] === 0) {
      user.effects[PBEffects.Rollout] = 5;
      user.currentMove = this.id;
    }
    if (user.effects[PBEffects.Rollout] > 0) user.effects[PBEffects.Rollout] -= 1;
  }
}
registerMoveClass("MultiTurnAttackPowersUpEachTurn", MultiTurnAttackPowersUpEachTurn);

//===============================================================================
// User bides its time this round and next round. The round after, deals 2x the
// total direct damage it took while biding to the last battler that damaged it.
// (Bide)
//===============================================================================
export class MultiTurnAttackBideThenReturnDoubleDamage extends FixedDamageMove {
  /** Ruby: nil until pbOnStartUse. */
  damagingTurn: boolean | null = null;

  override pbAddTarget(targets: Battler[], user: Battler): void {
    if (user.effects[PBEffects.Bide] !== 1) return; // Not the attack turn
    const idxTarget: number = user.effects[PBEffects.BideTarget];
    const t = (idxTarget >= 0) ? this.battle.battlers[idxTarget] : null;
    if (!user.pbAddTarget(targets, user, t, this, false)) {
      user.pbAddTargetRandomFoe(targets, user, this, false);
    }
  }

  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Bide] !== 1) return false; // Not the attack turn
    if (user.effects[PBEffects.BideDamage] === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      user.effects[PBEffects.Bide] = 0; // No need to reset other Bide variables
      return true;
    }
    if (targets.length === 0) {
      await this.battle.pbDisplay(_INTL("But there was no target..."));
      user.effects[PBEffects.Bide] = 0; // No need to reset other Bide variables
      return true;
    }
    return false;
  }

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    this.damagingTurn = (user.effects[PBEffects.Bide] === 1); // If attack turn
  }

  override async pbDisplayUseMessage(user: Battler): Promise<void> {
    if (this.damagingTurn) { // Attack turn
      await this.battle.pbDisplayBrief(_INTL("{1} unleashed energy!", user.pbThis()));
    } else if (user.effects[PBEffects.Bide] > 1) { // Charging turns
      await this.battle.pbDisplayBrief(_INTL("{1} is storing energy!", user.pbThis()));
    } else {
      await super.pbDisplayUseMessage(user); // Start using Bide
    }
  }

  /** pbDamagingMove? — Stops damage being dealt in the charging turns */
  override pbDamagingMove(): boolean {
    if (!this.damagingTurn) return false;
    return super.pbDamagingMove();
  }

  override pbFixedDamage(user: Battler, _target: Battler): number {
    return user.effects[PBEffects.BideDamage] * 2;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.effects[PBEffects.Bide] === 0) { // Starting using Bide
      user.effects[PBEffects.Bide] = 3;
      user.effects[PBEffects.BideDamage] = 0;
      user.effects[PBEffects.BideTarget] = -1;
      user.currentMove = this.id;
    }
    user.effects[PBEffects.Bide] -= 1;
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (!this.damagingTurn) hitNum = 1; // Charging anim
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("MultiTurnAttackBideThenReturnDoubleDamage", MultiTurnAttackBideThenReturnDoubleDamage);
