// Port of Data/Scripts/011_Battle/003_Move/002_Move_Usage.rb, with:
// - v20.1 Hotfixes (Battle bug fixes.rb:419): pbEffectivenessMessage shows
//   nothing for fixed damage moves.
// - Generation 9 Pack ([001] Battle/[001] Battle.rb:203): pbChangeUsageCounters
//   (Protean, Glaive Rush, Gigaton Hammer, move-count evolutions);
//   :215 pbContactMove? (Punching Glove).
// - Essentials Deluxe ([002] Battle Deluxe/Midbattle_Triggers.rb:358):
//   pbEffectivenessMessage returns midbattle triggers; :375
//   pbHitEffectivenessMessages is redefined to fire midbattle triggers.
// - ZUD Mechanics ([006] Battle_Move/Battle_Move.rb:27): pbInflictHPDamage
//   (Dynamax HP), :35 pbNumHits (no Parental Bond for Power Moves), :63
//   pbDisplayUseMessage (Z-Move messages); :84 status_zmove_effect is in ../zud/Battle_Move.ts.
// Alias chains (load order Hotfixes → Gen 9 → Mega → Deluxe → ZUD):
//   pbEffectivenessMessage = Deluxe( Hotfixes( core ) )
//   pbHitEffectivenessMessages = Deluxe (redefined, no alias)
//   pbChangeUsageCounters = Gen 9( core ); pbContactMove? = Gen 9( core )
//   pbInflictHPDamage = ZUD( core ); pbDisplayUseMessage = ZUD( core )
//   pbNumHits = ZUD (redefined, no alias)
//
// Sync/async of every Battle::Move method of 002-004 (and of the base effect
// classes). A method is async when it, or any override of it in the move
// effect files 005-013 or the plugins, can show a message, play an animation
// or call an async Battler/Battle method; callers must await those.
//
//   Method                          | sync/async
//   --------------------------------|-----------
//   pbCanChooseMove?                | sync (no messages) + pbCanChooseMoveAsync (Belch/Stuff Cheeks)
//   pbDisplayChargeMessage          | async
//   pbOnStartUse                    | async
//   pbAddTarget                     | sync
//   pbModifyTargets                 | sync
//   pbChangeUsageCounters           | sync
//   pbDisplayUseMessage             | async
//   pbShowFailMessages?             | sync
//   pbMissMessage                   | async (Leech Seed)
//   pbIsChargingTurn?               | sync
//   pbDamagingMove?                 | sync
//   pbContactMove?                  | sync
//   pbNumHits                       | sync
//   pbOverrideSuccessCheckPerHit    | sync
//   pbCrashDamage                   | async
//   pbInitialEffect                 | async
//   pbDesignateTargetsForHit        | sync
//   pbRepeatHit?                    | sync
//   pbShowAnimation                 | async
//   pbSelfKO                        | async
//   pbEffectWhenDealingDamage       | async
//   pbEffectAgainstTarget           | async
//   pbEffectGeneral                 | async
//   pbAdditionalEffect              | async
//   pbEffectAfterAllHits            | async
//   pbSwitchOutTargetEffect         | async
//   pbEndOfMoveUsageEffect          | async
//   pbImmunityByAbility             | async (AbilityEffects MoveImmunity is async)
//   pbMoveFailed?                   | async
//   pbFailsAgainstTarget?           | async
//   pbMoveFailedLastInRound?        | async
//   pbMoveFailedTargetAlreadyMoved? | async
//   pbMoveFailedAromaVeil?          | async
//   pbCheckDamageAbsorption         | sync
//   pbReduceDamage                  | sync
//   pbInflictHPDamage               | async (Battler#pbReduceHP)
//   pbAnimateHitAndHPLost           | async
//   pbEffectivenessMessage          | async
//   pbHitEffectivenessMessages      | async
//   pbEndureKOMessage               | async
//   pbRecordDamageLost              | sync
//   status_zmove_effect             | async (statusZmoveEffect, ../zud/Battle_Move.ts)
//   --- Move_UsageCalculations.ts ---
//   pbBaseType, pbCalcType          | sync
//   pbCalcTypeModSingle, pbCalcTypeMod | sync
//   pbBaseAccuracy                  | sync
//   pbAccuracyCheck                 | sync
//   pbCalcAccuracyModifiers         | sync
//   pbCritialOverride, pbIsCritical? | sync
//   pbBaseDamage, pbBaseDamageMultiplier, pbModifyDamage | sync
//   pbGetAttackStats, pbGetDefenseStats | sync
//   pbCalcDamage                    | async (Spectral Thief's override shows an
//                                   |   animation and raises stats first)
//   pbCalcDamageMultipliers         | sync
//   pbAdditionalEffectChance        | sync
//   pbFlinchChance                  | sync
//   --- Move_BaseEffects.ts ---
//   pbFixedDamage, pbHealAmount, pbRecoilDamage | sync
//   pbChargingTurnMessage, pbAttackingTurnMessage | async
//   pbChargingTurnEffect, pbAttackingTurnEffect   | async
//   pbProtectMessage                | async
//   pbCheckForMirrorArmor           | async
//   pbLowerTargetMultipleStats      | async
//   (Move.ts) pbTarget, pbPriority and the move property queries | sync

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness } from "../../data/gameData/type";
import { G } from "../../game/globals";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { FixedDamageMove } from "./Move_BaseEffects";
import { Move } from "./Move";

/** $game_temp fields set by BattleStarting (party_critical_hits_dealt, party_direct_damage_taken). */
type GameTempBattleCounters = {
  partyCriticalHitsDealt?: number[] | null;
  partyDirectDamageTaken?: number[] | null;
};
const gameTempCounters = (): GameTempBattleCounters => G.gameTemp as unknown as GameTempBattleCounters;

/** Essentials Deluxe: [user triggers, target triggers] returned by pbEffectivenessMessage. */
export type EffectivenessTriggers = [string[], string[]];

const methods = {
  //=============================================================================
  // Effect methods per move usage
  //=============================================================================
  /**
   * pbCanChooseMove? — For Belch. Without messages (showMessages = false);
   * subclasses that override it (Belch, Stuff Cheeks) override both this and
   * pbCanChooseMoveAsync, which shows the failure message when showMessages.
   */
  pbCanChooseMove(this: Move, _user: Battler, _commandPhase: boolean, _showMessages: false = false): boolean {
    return true;
  },
  /** pbCanChooseMove?(user, commandPhase, showMessages) with messages. */
  async pbCanChooseMoveAsync(this: Move, user: Battler, commandPhase: boolean, _showMessages: boolean): Promise<boolean> {
    return this.pbCanChooseMove(user, commandPhase, false);
  },
  /** For Focus Punch/shell Trap/Beak Blast */
  async pbDisplayChargeMessage(this: Move, _user: Battler): Promise<void> {},
  async pbOnStartUse(this: Move, _user: Battler, _targets: Battler[]): Promise<void> {},
  /** For Counter, etc. and Bide */
  pbAddTarget(this: Move, _targets: Battler[], _user: Battler): void {},
  /** For Dragon Darts */
  pbModifyTargets(this: Move, _targets: Battler[], _user: Battler): void {},

  /** Reset move usage counters (child classes can increment them). */
  pbChangeUsageCounters(this: Move, user: Battler, _specialUsage: boolean): void {
    user.effects[PBEffects.FuryCutter] = 0;
    user.effects[PBEffects.ParentalBond] = 0;
    user.effects[PBEffects.ProtectRate] = 1;
    this.battle.field.effects[PBEffects.FusionBolt] = false;
    this.battle.field.effects[PBEffects.FusionFlare] = false;
    // Generation 9 Pack: reset various checks upon using a move; counter for
    // Primeape -> Annihilape evolution method (and others).
    user.proteanTrigger = true;
    user.effects[PBEffects.GlaiveRush] = 0;
    if (user.effects[PBEffects.SuccessiveMove] !== this.id) user.effects[PBEffects.SuccessiveMove] = null;
    if (user.pbOwnedByPlayer()) user.pokemon!.moveCountEvolution(this.id);
  },

  async pbDisplayUseMessage(this: Move, user: Battler): Promise<void> {
    // ZUD Mechanics: animation and messages when using a Z-Move in battle. No
    // animation will play if Battle Animations were turned off in the Options.
    // Z-Moves that are used due to calling them with other moves, such as with
    // Sleep Talk, will not trigger the animation or special messages.
    if (this.zMove() && !this.specialUseZMove) {
      if (user.pbOwnedByPlayer()) G.stats.zmoveCount += 1;
      const triggers = ["zmove", "zmove" + String(user.species), "zmove" + String(this.type ?? "")];
      await this.battle.scene.pbDeluxeTriggers?.(user.index, null, triggers);
      if (Settings.SHOW_ZUD_ANIM && G.pokemonSystem.battlescene === 0) {
        await this.battle.scene.pbShowZMove?.(user.index, this.id);
      }
      if (this.statusMove() && this.zmoveFlag) {
        await this.statusZmoveEffect(user);
      } else {
        await this.battle.pbDisplayBrief(_INTL("{1} surrounded itself with its Z-Power!", user.pbThis()));
      }
      await this.battle.pbDisplayBrief(_INTL("{1} unleashed its full force Z-Move!", user.pbThis()));
    }
    await this.battle.pbDisplayBrief(_INTL("{1} used {2}!", user.pbThis(), this.name));
  },

  /** pbShowFailMessages? */
  pbShowFailMessages(this: Move, _targets: Battler[]): boolean { return true; },
  async pbMissMessage(this: Move, _user: Battler, _target: Battler): Promise<boolean> { return false; },

  // status_zmove_effect (ZUD Mechanics, [006] Battle_Move/Battle_Move.rb:84),
  // the effects of a Z-Powered status move: see ../zud/Battle_Move.ts.

  //=============================================================================
  //
  //=============================================================================
  /**
   * pbIsChargingTurn? — Whether the move is currently in the "charging" turn of
   * a two turn attack. Is false if Power Herb or another effect lets a two turn
   * move charge and attack in the same turn.
   * user.effects[PBEffects::TwoTurnAttack] is set to the move's ID during the
   * charging turn, and is nil during the attack turn.
   */
  pbIsChargingTurn(this: Move, _user: Battler): boolean { return false; },
  /** pbDamagingMove? */
  pbDamagingMove(this: Move): boolean { return this.damagingMove(); },

  /** pbContactMove? */
  pbContactMove(this: Move, user: Battler): boolean {
    // Generation 9 Pack: Punching Glove prevents contact for punching moves.
    if (user.hasActiveItem("PUNCHINGGLOVE") && this.punchingMove()) return false;
    if (user.hasActiveAbility("LONGREACH")) return false;
    return this.contactMove();
  },

  /**
   * The maximum number of hits in a round this move will actually perform. This
   * can be 1 for Beat Up, and can be 2 for any moves affected by Parental Bond.
   * ZUD Mechanics (redefined): Parental Bond doesn't trigger on Power Moves.
   */
  pbNumHits(this: Move, user: Battler, targets: Battler[]): number {
    if (user.hasActiveAbility("PARENTALBOND") && this.pbDamagingMove() &&
        !this.chargingTurnMove() && !this.powerMove() && targets.length === 1) {
      // Record that Parental Bond applies, to weaken the second attack
      user.effects[PBEffects.ParentalBond] = 3;
      return 2;
    }
    return 1;
  },

  //=============================================================================
  // Effect methods per hit
  //=============================================================================
  pbOverrideSuccessCheckPerHit(this: Move, _user: Battler, _target: Battler): boolean { return false; },
  async pbCrashDamage(this: Move, _user: Battler): Promise<void> {},
  async pbInitialEffect(this: Move, _user: Battler, _targets: Battler[], _hitNum: number): Promise<void> {},
  /** For Dragon Darts */
  pbDesignateTargetsForHit(this: Move, targets: Battler[], _hitNum: number): Battler[] { return targets; },
  /** pbRepeatHit? — For Dragon Darts */
  pbRepeatHit(this: Move): boolean { return false; },

  async pbShowAnimation(this: Move, id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (!showAnimation) return;
    if (user.effects[PBEffects.ParentalBond] === 1) {
      await this.battle.pbCommonAnimation("ParentalBond", user, targets);
    } else {
      await this.battle.pbAnimation(id, user, targets, hitNum);
    }
  },

  async pbSelfKO(this: Move, _user: Battler): Promise<void> {},
  async pbEffectWhenDealingDamage(this: Move, _user: Battler, _target: Battler): Promise<void> {},
  async pbEffectAgainstTarget(this: Move, _user: Battler, _target: Battler): Promise<void> {},
  async pbEffectGeneral(this: Move, _user: Battler): Promise<void> {},
  async pbAdditionalEffect(this: Move, _user: Battler, _target: Battler): Promise<void> {},
  /** Move effects that occur after all hits */
  async pbEffectAfterAllHits(this: Move, _user: Battler, _target: Battler): Promise<void> {},
  async pbSwitchOutTargetEffect(this: Move, _user: Battler, _targets: Battler[], _numHits: number,
    _switchedBattlers: number[]): Promise<void> {},
  async pbEndOfMoveUsageEffect(this: Move, _user: Battler, _targets: Battler[], _numHits: number,
    _switchedBattlers: number[]): Promise<void> {},

  //=============================================================================
  // Check if target is immune to the move because of its ability
  //=============================================================================
  async pbImmunityByAbility(this: Move, user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.battle.moldBreaker) return false;
    let ret = false;
    if (target.abilityActive()) {
      ret = await AbilityEffects.triggerMoveImmunity(target.ability, user, target,
        this, this.calcType as Id, this.battle, showMessage);
    }
    return ret;
  },

  //=============================================================================
  // Move failure checks
  //=============================================================================
  /** pbMoveFailed? — Check whether the move fails completely due to move-specific requirements. */
  async pbMoveFailed(this: Move, _user: Battler, _targets: Battler[]): Promise<boolean> { return false; },
  /** pbFailsAgainstTarget? — Checks whether the move will be ineffective against the target. */
  async pbFailsAgainstTarget(this: Move, _user: Battler, _target: Battler, _showMessage: boolean): Promise<boolean> {
    return false;
  },

  /** pbMoveFailedLastInRound? */
  async pbMoveFailedLastInRound(this: Move, user: Battler, showMessage = true): Promise<boolean> {
    const unmoved = this.battle.allBattlers().some((b) =>
      b.index !== user.index &&
      ["UseMove", "Shift"].includes(this.battle.choices[b.index]![0]) &&
      !b.movedThisRound());
    if (!unmoved) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  },

  /** pbMoveFailedTargetAlreadyMoved? */
  async pbMoveFailedTargetAlreadyMoved(this: Move, target: Battler, showMessage = true): Promise<boolean> {
    if ((this.battle.choices[target.index]![0] !== "UseMove" &&
         this.battle.choices[target.index]![0] !== "Shift") || target.movedThisRound()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  },

  /** pbMoveFailedAromaVeil? */
  async pbMoveFailedAromaVeil(this: Move, _user: Battler, target: Battler, showMessage = true): Promise<boolean> {
    if (this.battle.moldBreaker) return false;
    if (target.hasActiveAbility("AROMAVEIL")) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1} is unaffected because of its {2}!",
            target.pbThis(), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    for (const b of target.allAllies()) {
      if (!b.hasActiveAbility("AROMAVEIL")) continue;
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1} is unaffected because of {2}'s {3}!",
            target.pbThis(), b.pbThis(true), b.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    return false;
  },

  //=============================================================================
  // Weaken the damage dealt (doesn't actually change a battler's HP)
  //=============================================================================
  pbCheckDamageAbsorption(this: Move, user: Battler | null, target: Battler): void {
    // Substitute will take the damage
    if (target.effects[PBEffects.Substitute] > 0 && !this.ignoresSubstitute(user) &&
        (!user || user.index !== target.index)) {
      target.damageState.substitute = true;
      return;
    }
    // Ice Face will take the damage
    if (!this.battle.moldBreaker && target.isSpecies("EISCUE") &&
        target.form === 0 && target.abilityId === "ICEFACE" && this.physicalMove()) {
      target.damageState.iceFace = true;
      return;
    }
    // Disguise will take the damage
    if (!this.battle.moldBreaker && target.isSpecies("MIMIKYU") &&
        target.form === 0 && target.abilityId === "DISGUISE") {
      target.damageState.disguise = true;
      return;
    }
  },

  pbReduceDamage(this: Move, user: Battler, target: Battler): void {
    let damage = target.damageState.calcDamage;
    // Substitute takes the damage
    if (target.damageState.substitute) {
      if (damage > target.effects[PBEffects.Substitute]) damage = target.effects[PBEffects.Substitute];
      target.damageState.hpLost = damage;
      target.damageState.totalHPLost += damage;
      return;
    }
    // Disguise/Ice Face takes the damage
    if (target.damageState.disguise || target.damageState.iceFace) return;
    // Target takes the damage
    if (damage >= target.hp) {
      damage = target.hp;
      // Survive a lethal hit with 1 HP effects
      if (this.nonLethal(user, target)) {
        damage -= 1;
      } else if (target.effects[PBEffects.Endure]) {
        target.damageState.endured = true;
        damage -= 1;
      } else if (damage === target.totalhp) {
        if (target.hasActiveAbility("STURDY") && !this.battle.moldBreaker) {
          target.damageState.sturdy = true;
          damage -= 1;
        } else if (target.hasActiveItem("FOCUSSASH") && target.hp === target.totalhp) {
          target.damageState.focusSash = true;
          damage -= 1;
        } else if (target.hasActiveItem("FOCUSBAND") && this.battle.pbRandom(100) < 10) {
          target.damageState.focusBand = true;
          damage -= 1;
        } else if (Settings.AFFECTION_EFFECTS && this.battle.internalBattle &&
                   target.pbOwnedByPlayer() && !target.mega()) {
          const chance = [0, 0, 0, 10, 15, 25][target.affectionLevel()]!;
          if (chance > 0 && this.battle.pbRandom(100) < chance) {
            target.damageState.affectionEndured = true;
            damage -= 1;
          }
        }
      }
    }
    if (damage < 0) damage = 0;
    target.damageState.hpLost = damage;
    target.damageState.totalHPLost += damage;
  },

  //=============================================================================
  // Change the target's HP by the amount calculated above
  //=============================================================================
  async pbInflictHPDamage(this: Move, target: Battler): Promise<void> {
    // ZUD Mechanics: damage from attacks considers Dynamax HP, and not base HP.
    target.ignoreDynamax = target.damageState.hpLost > 0;
    if (target.damageState.substitute) {
      target.effects[PBEffects.Substitute] -= target.damageState.hpLost;
    } else if (target.damageState.hpLost > 0) {
      await target.pbReduceHP(target.damageState.hpLost, false, true, false);
    }
  },

  //=============================================================================
  // Animate the damage dealt, including lowering the HP
  //=============================================================================
  /** Animate being damaged and losing HP (by a move) */
  async pbAnimateHitAndHPLost(this: Move, user: Battler, targets: Battler[]): Promise<void> {
    // Animate allies first, then foes
    let animArray: [Battler, number, number][] = [];
    for (let side = 0; side < 2; side++) { // side here means "allies first, then foes"
      for (const b of targets) {
        if (b.damageState.unaffected || b.damageState.hpLost === 0) continue;
        if ((side === 0 && b.opposes(user)) || (side === 1 && !b.opposes(user))) continue;
        let oldHP = b.hp;
        if (b.damageState.substitute) {
          const oldSubHp = b.effects[PBEffects.Substitute] + b.damageState.hpLost;
          PBDebug.log(`[Move damage] ${b.pbThis()}'s substitute lost ${b.damageState.hpLost} HP (${oldSubHp}=>${b.effects[PBEffects.Substitute]})`);
        } else {
          oldHP += b.damageState.hpLost;
          PBDebug.log(`[Move damage] ${b.pbThis()} lost ${b.damageState.hpLost} HP (${oldHP}=>${b.hp})`);
        }
        let effectiveness = 0;
        if (Effectiveness.resistant(b.damageState.typeMod)) {
          effectiveness = 1;
        } else if (Effectiveness.superEffective(b.damageState.typeMod)) {
          effectiveness = 2;
        }
        animArray.push([b, oldHP, effectiveness]);
      }
      if (animArray.length > 0) {
        await this.battle.scene.pbHitAndHPLossAnimation(animArray);
        animArray = []; // animArray.clear
      }
    }
  },

  //=============================================================================
  // Messages upon being hit
  //=============================================================================
  /**
   * Essentials Deluxe: returns [user triggers, target triggers] for the
   * midbattle scripts (nil when the move wasn't super/not very effective).
   */
  async pbEffectivenessMessage(this: Move, user: Battler, target: Battler,
    numTargets = 1): Promise<EffectivenessTriggers | undefined> {
    // v20.1 Hotfixes: moves that deal fixed damage don't show an effectiveness message.
    if (!(this instanceof FixedDamageMove)) {
      // Core Essentials
      if (!(target.damageState.disguise || target.damageState.iceFace)) {
        if (Effectiveness.superEffective(target.damageState.typeMod)) {
          if (numTargets > 1) {
            await this.battle.pbDisplay(_INTL("It's super effective on {1}!", target.pbThis(true)));
          } else {
            await this.battle.pbDisplay(_INTL("It's super effective!"));
          }
        } else if (Effectiveness.notVeryEffective(target.damageState.typeMod)) {
          if (numTargets > 1) {
            await this.battle.pbDisplay(_INTL("It's not very effective on {1}...", target.pbThis(true)));
          } else {
            await this.battle.pbDisplay(_INTL("It's not very effective..."));
          }
        }
      }
    }
    // Essentials Deluxe: mid-battle triggers for type effectiveness of a used move.
    if (target.damageState.disguise || target.damageState.iceFace) return undefined;
    const id = String(this.id);
    const type = String(this.type ?? "");
    let userTriggers: string[];
    let targTriggers: string[];
    if (Effectiveness.superEffective(target.damageState.typeMod)) {
      userTriggers = ["attackerSEdmg", "attackerSEdmg" + id, "attackerSEdmg" + type, "attackerSEdmg" + String(user.species)];
      targTriggers = ["defenderSEdmg", "defenderSEdmg" + id, "defenderSEdmg" + type, "defenderSEdmg" + String(target.species)];
    } else if (Effectiveness.notVeryEffective(target.damageState.typeMod)) {
      userTriggers = ["attackerNVEdmg", "attackerNVEdmg" + id, "attackerNVEdmg" + type, "attackerNVEdmg" + String(user.species)];
      targTriggers = ["defenderNVEdmg", "defenderNVEdmg" + id, "defenderNVEdmg" + type, "defenderNVEdmg" + String(target.species)];
    } else {
      return undefined;
    }
    return [userTriggers, targTriggers];
  },

  /**
   * Essentials Deluxe (redefined): the core messages plus mid-battle triggers
   * for when a used move deals damage.
   */
  async pbHitEffectivenessMessages(this: Move, user: Battler, target: Battler, numTargets = 1): Promise<void> {
    if (target.damageState.disguise || target.damageState.iceFace) return;
    const id = String(this.id);
    const type = String(this.type ?? "");
    const userSpecies = String(user.species);
    const targSpecies = String(target.species);
    let effectiveness: EffectivenessTriggers | undefined = undefined;
    let userTriggers: string[] = [];
    let targTriggers: string[] = [];
    if (target.damageState.substitute) {
      await this.battle.pbDisplay(_INTL("The substitute took damage for {1}!", target.pbThis(true)));
      if (target.effects[PBEffects.Substitute] > 0) {
        userTriggers.push("attackerSubDamaged", "attackerSubDamaged" + userSpecies);
        targTriggers.push("defenderSubDamaged", "defenderSubDamaged" + targSpecies);
      }
    }
    if (target.damageState.critical) {
      const counters = gameTempCounters().partyCriticalHitsDealt;
      if (counters && counters[user.pokemonIndex] != null && user.pbOwnedByPlayer()) {
        counters[user.pokemonIndex]! += 1;
      }
      if (target.damageState.affectionCritical) {
        if (numTargets > 1) {
          await this.battle.pbDisplay(_INTL("{1} landed a critical hit on {2}, wishing to be praised!",
            user.pbThis(), target.pbThis(true)));
        } else {
          await this.battle.pbDisplay(_INTL("{1} landed a critical hit, wishing to be praised!", user.pbThis()));
        }
      } else if (numTargets > 1) {
        await this.battle.pbDisplay(_INTL("A critical hit on {1}!", target.pbThis(true)));
      } else {
        await this.battle.pbDisplay(_INTL("A critical hit!"));
      }
      userTriggers.push("attackerCrit", "attackerCrit" + id, "attackerCrit" + type, "attackerCrit" + userSpecies);
      if (!target.damageState.substitute) {
        targTriggers.push("defenderCrit", "defenderCrit" + id, "defenderCrit" + type, "defenderCrit" + targSpecies);
      }
    }
    // Effectiveness message, for moves with 1 hit
    if (!this.multiHitMove() && user.effects[PBEffects.ParentalBond] === 0) {
      effectiveness = await this.pbEffectivenessMessage(user, target, numTargets);
      if (Array.isArray(effectiveness)) userTriggers = userTriggers.concat(effectiveness[0]);
    }
    if (target.damageState.substitute && target.effects[PBEffects.Substitute] === 0) {
      target.effects[PBEffects.Substitute] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s substitute faded!", target.pbThis()));
      userTriggers.push("attackerSubBroken", "attackerSubBroken" + userSpecies);
      targTriggers.push("defenderSubBroken", "defenderSubBroken" + targSpecies);
    }
    if (!target.damageState.substitute) {
      userTriggers.push("attackerDamaged", "attackerDamaged" + id, "attackerDamaged" + type, "attackerDamaged" + userSpecies);
      if (user.opposes(target.index)) {
        targTriggers.push("defenderDamaged", "defenderDamaged" + id, "defenderDamaged" + type, "defenderDamaged" + targSpecies);
      }
      if (Array.isArray(effectiveness)) targTriggers = targTriggers.concat(effectiveness[1]);
      if (!user.fainted()) {
        if (user.hp <= Math.floor(user.totalhp / 2)) {
          const lowHP = user.hp <= Math.floor(user.totalhp / 4);
          const types = user.pokemon!.types().map((t) => String(t));
          if (this.battle.pbParty(user.index).length > this.battle.pbSideSize(user.index)) {
            if (this.battle.pbAbleNonActiveCount(user.index) === 0) {
              userTriggers.push("attackerHPHalfLast", "attackerHPHalfLast" + userSpecies);
              if (lowHP) userTriggers.push("attackerHPLowLast", "attackerHPLowLast" + userSpecies);
              for (const t of types) {
                userTriggers.push("attackerHPHalfLast" + t, "attackerHPHalfLast" + t);
                if (lowHP) userTriggers.push("attackerHPLowLast" + t, "attackerHPLowLast" + t);
              }
            } else {
              userTriggers.push("attackerHPHalf", "attackerHPHalf" + userSpecies);
              if (lowHP) userTriggers.push("attackerHPLow", "attackerHPLow" + userSpecies);
              for (const t of types) {
                userTriggers.push("attackerHPHalf" + t, "attackerHPHalf" + t);
                if (lowHP) userTriggers.push("attackerHPLow" + t, "attackerHPLow" + t);
              }
            }
          } else {
            userTriggers.push("attackerHPHalfLast", "attackerHPHalfLast" + userSpecies,
              "attackerHPHalf", "attackerHPHalf" + userSpecies);
            if (lowHP) {
              userTriggers.push("attackerHPLowLast", "attackerHPLowLast" + userSpecies,
                "attackerHPLow", "attackerHPLow" + userSpecies);
            }
            for (const t of types) {
              userTriggers.push("attackerHPHalfLast" + t, "attackerHPHalfLast" + t,
                "attackerHPHalf" + t, "attackerHPHalf" + t);
              if (lowHP) {
                userTriggers.push("attackerHPLowLast" + t, "attackerHPLowLast" + t,
                  "attackerHPLow" + t, "attackerHPLow" + t);
              }
            }
          }
        }
      }
      if (!target.fainted() && user.opposes(target.index)) {
        if (target.hp <= Math.floor(target.totalhp / 2)) {
          const lowHP = target.hp <= Math.floor(target.totalhp / 4);
          const types = target.pokemon!.types().map((t) => String(t));
          if (this.battle.pbParty(target.index).length > this.battle.pbSideSize(target.index)) {
            if (this.battle.pbAbleNonActiveCount(target.index) === 0) {
              targTriggers.push("defenderHPHalfLast", "defenderHPHalfLast" + targSpecies);
              if (lowHP) targTriggers.push("defenderHPLowLast", "defenderHPLowLast" + targSpecies);
              for (const t of types) {
                targTriggers.push("defenderHPHalfLast" + t, "defenderHPHalfLast" + t);
                if (lowHP) targTriggers.push("defenderHPLowLast" + t, "defenderHPLowLast" + t);
              }
            } else {
              targTriggers.push("defenderHPHalf", "defenderHPHalf" + targSpecies);
              if (lowHP) targTriggers.push("defenderHPLow", "defenderHPLow" + targSpecies);
              for (const t of types) {
                targTriggers.push("defenderHPHalf" + t, "defenderHPHalf" + t);
                if (lowHP) targTriggers.push("defenderHPLow" + t, "defenderHPLow" + t);
              }
            }
          } else {
            targTriggers.push("defenderHPHalfLast", "defenderHPHalfLast" + targSpecies,
              "defenderHPHalf", "defenderHPHalf" + targSpecies);
            if (lowHP) {
              targTriggers.push("defenderHPLowLast", "defenderHPLowLast" + targSpecies,
                "defenderHPLow", "defenderHPLow" + targSpecies);
            }
            for (const t of types) {
              targTriggers.push("defenderHPHalfLast" + t, "defenderHPHalfLast" + t,
                "defenderHPHalf" + t, "defenderHPHalf" + t);
              if (lowHP) {
                targTriggers.push("defenderHPLowLast" + t, "defenderHPLowLast" + t,
                  "defenderHPLow" + t, "defenderHPLow" + t);
              }
            }
          }
        }
      }
    }
    if (userTriggers.length > 0) await this.battle.scene.pbDeluxeTriggers?.(user.index, target.index, userTriggers);
    if (targTriggers.length > 0) await this.battle.scene.pbDeluxeTriggers?.(target.index, user.index, targTriggers);
  },

  async pbEndureKOMessage(this: Move, target: Battler): Promise<void> {
    if (target.damageState.disguise) {
      await this.battle.pbShowAbilitySplash(target);
      if (Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("Its disguise served it as a decoy!"));
      } else {
        await this.battle.pbDisplay(_INTL("{1}'s disguise served it as a decoy!", target.pbThis()));
      }
      await this.battle.pbHideAbilitySplash(target);
      await target.pbChangeForm(1, _INTL("{1}'s disguise was busted!", target.pbThis()));
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8) await target.pbReduceHP(Math.floor(target.totalhp / 8), false);
    } else if (target.damageState.iceFace) {
      await this.battle.pbShowAbilitySplash(target);
      if (!Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("{1}'s {2} activated!", target.pbThis(), target.abilityName()));
      }
      await target.pbChangeForm(1, _INTL("{1} transformed!", target.pbThis()));
      await this.battle.pbHideAbilitySplash(target);
    } else if (target.damageState.endured) {
      await this.battle.pbDisplay(_INTL("{1} endured the hit!", target.pbThis()));
    } else if (target.damageState.sturdy) {
      await this.battle.pbShowAbilitySplash(target);
      if (Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("{1} endured the hit!", target.pbThis()));
      } else {
        await this.battle.pbDisplay(_INTL("{1} hung on with Sturdy!", target.pbThis()));
      }
      await this.battle.pbHideAbilitySplash(target);
    } else if (target.damageState.focusSash) {
      await this.battle.pbCommonAnimation("UseItem", target);
      await this.battle.pbDisplay(_INTL("{1} hung on using its Focus Sash!", target.pbThis()));
      await target.pbConsumeItem();
    } else if (target.damageState.focusBand) {
      await this.battle.pbCommonAnimation("UseItem", target);
      await this.battle.pbDisplay(_INTL("{1} hung on using its Focus Band!", target.pbThis()));
    } else if (target.damageState.affectionEndured) {
      await this.battle.pbDisplay(_INTL("{1} toughed it out so you wouldn't feel sad!", target.pbThis()));
    }
  },

  /** Used by Counter/Mirror Coat/Metal Burst/Revenge/Focus Punch/Bide/Assurance. */
  pbRecordDamageLost(this: Move, user: Battler, target: Battler): void {
    const damage = target.damageState.hpLost;
    // NOTE: In Gen 3 where a move's category depends on its type, Hidden Power
    //       is for some reason countered by Counter rather than Mirror Coat,
    //       regardless of its calculated type. Hence the following two lines of
    //       code.
    let moveType: Id | null = null;
    if (this.function === "TypeDependsOnUserIVs") moveType = "NORMAL"; // Hidden Power
    if (this.physicalMove(moveType)) {
      target.effects[PBEffects.Counter] = damage;
      target.effects[PBEffects.CounterTarget] = user.index;
    } else if (this.specialMove(moveType)) {
      target.effects[PBEffects.MirrorCoat] = damage;
      target.effects[PBEffects.MirrorCoatTarget] = user.index;
    }
    if (target.effects[PBEffects.Bide] > 0) {
      target.effects[PBEffects.BideDamage] += damage;
      target.effects[PBEffects.BideTarget] = user.index;
    }
    if (target.fainted()) target.damageState.fainted = true;
    target.lastHPLost = damage; // For Focus Punch
    if (damage > 0) target.tookDamageThisRound = true; // For Assurance
    target.lastAttacker.push(user.index); // For Revenge
    if (target.opposes(user)) {
      target.lastHPLostFromFoe = damage; // For Metal Burst
      target.lastFoeAttacker.push(user.index); // For Metal Burst
    }
    const taken = gameTempCounters().partyDirectDamageTaken;
    if (taken && taken[target.pokemonIndex] != null && target.pbOwnedByPlayer()) {
      taken[target.pokemonIndex]! += damage;
    }
  },
};

type Methods = typeof methods;
declare module "./Move" {
  interface Move extends Methods {}
}
Object.assign(Move.prototype, methods);
