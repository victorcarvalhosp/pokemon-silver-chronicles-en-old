// Port of Data/Scripts/011_Battle/005_AI/007_AI_Move_EffectScores_3.rb: the
// third part of pbGetMoveScoreFunctionCode; other function codes fall through
// to the second part (alias aiEffectScorePart2_pbGetMoveScoreFunctionCode).
//
// Ruby bugs kept as they are (the scores must match):
// - HitThreeTimesAlwaysCriticalHit reads an undefined local `targets`
//   (NameError at high skill): thrown here.
// - CannotBeRedirected calls move.pbCalcType with no argument (ArgumentError
//   when another foe has Lightning Rod/Storm Drain): thrown here.
// - ReplaceMoveThisBattleWithTargetLastMoveUsed/ReplaceMoveWithTargetLastMoveUsed
//   compare a Battle::Move with a Symbol, so "already knows the move" never
//   applies.
// - AllBattlersLoseHalfHPUserSkipsNextTurn: user.hp < user.hp / 2 is never true.
import type { Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Stat } from "../../data/gameData/stat";
import { Effectiveness } from "../../data/gameData/type";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { rubyDiv } from "../rubyMath";
import { AI, PBTrainerAI, truthy } from "./Battle_AI";
import "./AI_Move_EffectScores_2"; // the method this part wraps (type declaration + load order)

const aiEffectScorePart2_pbGetMoveScoreFunctionCode = AI.prototype.pbGetMoveScoreFunctionCode;

/** Get a score for the given move based on its effect */
AI.prototype.pbGetMoveScoreFunctionCode = async function (this: AI, score: number, move: Move, user: Battler,
  target: Battler, skill = 100): Promise<number> {
  switch (move.function) {
    //---------------------------------------------------------------------------
    case "FixedDamage20":
      if (target.hp <= 20) {
        score += 80;
      } else if (target.level >= 25) {
        score -= 60; // Not useful against high-level Pokemon
      }
      break;
    //---------------------------------------------------------------------------
    case "FixedDamage40":
      if (target.hp <= 40) score += 80;
      break;
    //---------------------------------------------------------------------------
    case "FixedDamageHalfTargetHP":
      score -= 50;
      score += rubyDiv(target.hp * 100, target.totalhp);
      break;
    //---------------------------------------------------------------------------
    case "FixedDamageUserLevel":
      if (target.hp <= user.level) score += 80;
      break;
    //---------------------------------------------------------------------------
    case "FixedDamageUserLevelRandom":
      if (target.hp <= user.level) score += 30;
      break;
    //---------------------------------------------------------------------------
    case "LowerTargetHPToUserHP":
      if (user.hp >= target.hp) {
        score -= 90;
      } else if (user.hp < rubyDiv(target.hp, 2)) {
        score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "OHKO": case "OHKOIce": case "OHKOHitsUndergroundTarget":
      if (target.hasActiveAbility("STURDY")) score -= 90;
      if (target.level > user.level) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "DamageTargetAlly":
      for (const b of target.allAllies()) {
        if (!b.near(target)) continue;
        score += 10;
      }
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithUserHP":
      break;
    //---------------------------------------------------------------------------
    case "PowerLowerWithUserHP":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithTargetHP":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithUserHappiness":
      break;
    //---------------------------------------------------------------------------
    case "PowerLowerWithUserHappiness":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithUserPositiveStatStages":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithTargetPositiveStatStages":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithUserFasterThanTarget":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithTargetFasterThanUser":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithLessPP":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithTargetWeight":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithUserHeavierThanTarget":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithConsecutiveUse":
      break;
    //---------------------------------------------------------------------------
    case "PowerHigherWithConsecutiveUseOnUserSide":
      break;
    //---------------------------------------------------------------------------
    case "RandomPowerDoublePowerIfTargetUnderground":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetHPLessThanHalf":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfUserPoisonedBurnedParalyzed":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetAsleepCureTarget":
      if (target.status === "SLEEP" && // Will cure status
          target.statusCount > 1) score -= 20;
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetPoisoned":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetParalyzedCureTarget":
      if (target.status === "PARALYSIS") score -= 20; // Will cure status
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetStatusProblem":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfUserHasNoItem":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetUnderwater":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetUnderground":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetInSky":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerInElectricTerrain":
      if (this.battle.field.terrain === "Electric" && target.affectedByTerrain()) score += 40;
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfUserLastMoveFailed":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfAllyFaintedLastTurn":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfUserLostHPThisTurn": {
      const attspeed = this.pbRoughStat(user, "SPEED", skill);
      const oppspeed = this.pbRoughStat(target, "SPEED", skill);
      if (oppspeed > attspeed) score += 30;
      break;
    }
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetLostHPThisTurn":
      if (this.battle.pbOpposingBattlerCount(user) > 1) score += 20;
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfUserStatsLoweredThisTurn":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetActed": {
      const attspeed = this.pbRoughStat(user, "SPEED", skill);
      const oppspeed = this.pbRoughStat(target, "SPEED", skill);
      if (oppspeed > attspeed) score += 30;
      break;
    }
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetNotActed":
      break;
    //---------------------------------------------------------------------------
    case "AlwaysCriticalHit":
      break;
    //---------------------------------------------------------------------------
    case "EnsureNextCriticalHit":
      if (user.effects[PBEffects.LaserFocus] > 0) {
        score -= 90;
      } else {
        score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartPreventCriticalHitsAgainstUserSide":
      if (user.pbOwnSide().effects[PBEffects.LuckyChant] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "CannotMakeTargetFaint":
      if (target.hp === 1) {
        score -= 90;
      } else if (target.hp <= rubyDiv(target.totalhp, 8)) {
        score -= 60;
      } else if (target.hp <= rubyDiv(target.totalhp, 4)) {
        score -= 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "UserEnduresFaintingThisTurn":
      if (user.hp > rubyDiv(user.totalhp, 2)) score -= 25;
      if (skill >= PBTrainerAI.mediumSkill()) {
        if (user.effects[PBEffects.ProtectRate] > 1) score -= 90;
        if (target.effects[PBEffects.HyperBeam] > 0) score -= 90;
      } else {
        score -= user.effects[PBEffects.ProtectRate] * 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenElectricMoves":
      if (truthy(user.effects[PBEffects.MudSport])) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenFireMoves":
      if (truthy(user.effects[PBEffects.WaterSport])) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenPhysicalDamageAgainstUserSide":
      if (user.pbOwnSide().effects[PBEffects.Reflect] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenSpecialDamageAgainstUserSide":
      if (user.pbOwnSide().effects[PBEffects.LightScreen] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenDamageAgainstUserSideIfHail":
      if (user.pbOwnSide().effects[PBEffects.AuroraVeil] > 0 || user.effectiveWeather() !== "Hail") {
        score -= 90;
      } else {
        score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "RemoveScreens":
      if (user.pbOpposingSide().effects[PBEffects.AuroraVeil] > 0) score += 20;
      if (user.pbOpposingSide().effects[PBEffects.Reflect] > 0) score += 20;
      if (user.pbOpposingSide().effects[PBEffects.LightScreen] > 0) score += 20;
      break;
    //---------------------------------------------------------------------------
    case "ProtectUser":
      if (user.effects[PBEffects.ProtectRate] > 1 ||
          target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        if (skill >= PBTrainerAI.mediumSkill()) {
          score -= user.effects[PBEffects.ProtectRate] * 40;
        }
        if (user.turnCount === 0) score += 50;
        if (truthy(target.effects[PBEffects.TwoTurnAttack])) score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserBanefulBunker":
      if (user.effects[PBEffects.ProtectRate] > 1 ||
          target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        if (skill >= PBTrainerAI.mediumSkill()) {
          score -= user.effects[PBEffects.ProtectRate] * 40;
        }
        if (user.turnCount === 0) score += 50;
        if (truthy(target.effects[PBEffects.TwoTurnAttack])) score += 30;
        score += 20; // Because of possible poisoning
      }
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserFromDamagingMovesKingsShield":
      if (user.effects[PBEffects.ProtectRate] > 1 ||
          target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        if (skill >= PBTrainerAI.mediumSkill()) {
          score -= user.effects[PBEffects.ProtectRate] * 40;
        }
        if (user.turnCount === 0) score += 50;
        if (truthy(target.effects[PBEffects.TwoTurnAttack])) score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserFromDamagingMovesObstruct":
      if (user.effects[PBEffects.ProtectRate] > 1 ||
          target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        if (skill >= PBTrainerAI.mediumSkill()) {
          score -= user.effects[PBEffects.ProtectRate] * 40;
        }
        if (user.turnCount === 0) score += 50;
        if (truthy(target.effects[PBEffects.TwoTurnAttack])) score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserFromTargetingMovesSpikyShield":
      if (user.effects[PBEffects.ProtectRate] > 1 ||
          target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        if (skill >= PBTrainerAI.mediumSkill()) {
          score -= user.effects[PBEffects.ProtectRate] * 40;
        }
        if (user.turnCount === 0) score += 50;
        if (truthy(target.effects[PBEffects.TwoTurnAttack])) score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserSideFromDamagingMovesIfUserFirstTurn":
      if (user.turnCount === 0) {
        score += 30;
      } else {
        score -= 90; // Because it will fail here
        if (skill >= PBTrainerAI.bestSkill()) score = 0;
      }
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserSideFromStatusMoves":
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserSideFromPriorityMoves":
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserSideFromMultiTargetDamagingMoves":
      break;
    //---------------------------------------------------------------------------
    case "RemoveProtections":
      break;
    //---------------------------------------------------------------------------
    case "RemoveProtectionsBypassSubstitute":
      break;
    //---------------------------------------------------------------------------
    case "HoopaRemoveProtectionsBypassSubstituteLowerUserDef1":
      if (!user.isSpecies("HOOPA") || user.form !== 1) {
        score -= 100;
      } else if (target.stages.DEFENSE! > 0) {
        score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "RecoilQuarterOfDamageDealt":
      score -= 25;
      break;
    //---------------------------------------------------------------------------
    case "RecoilThirdOfDamageDealt":
      score -= 30;
      break;
    //---------------------------------------------------------------------------
    case "RecoilThirdOfDamageDealtParalyzeTarget":
      score -= 30;
      if (target.pbCanParalyze(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.mediumSkill()) {
          const aspeed = this.pbRoughStat(user, "SPEED", skill);
          const ospeed = this.pbRoughStat(target, "SPEED", skill);
          if (aspeed < ospeed) {
            score += 30;
          } else if (aspeed > ospeed) {
            score -= 40;
          }
        }
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET"])) score -= 40;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "RecoilThirdOfDamageDealtBurnTarget":
      score -= 30;
      if (target.pbCanBurn(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET", "FLAREBOOST"])) score -= 40;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "RecoilHalfOfDamageDealt":
      score -= 40;
      break;
    //---------------------------------------------------------------------------
    case "EffectivenessIncludesFlyingType":
      break;
    //---------------------------------------------------------------------------
    case "CategoryDependsOnHigherDamagePoisonTarget":
      if (target.pbCanPoison(user, false)) score += 5;
      break;
    //---------------------------------------------------------------------------
    case "CategoryDependsOnHigherDamageIgnoreTargetAbility":
      break;
    //---------------------------------------------------------------------------
    case "UseUserBaseDefenseInsteadOfUserBaseAttack":
      break;
    //---------------------------------------------------------------------------
    case "UseTargetAttackInsteadOfUserAttack":
      break;
    //---------------------------------------------------------------------------
    case "UseTargetDefenseInsteadOfTargetSpDef":
      break;
    //---------------------------------------------------------------------------
    case "EnsureNextMoveAlwaysHits":
      if (target.effects[PBEffects.Substitute] > 0) score -= 90;
      if (user.effects[PBEffects.LockOn] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartNegateTargetEvasionStatStageAndGhostImmunity":
      if (truthy(target.effects[PBEffects.Foresight])) {
        score -= 90;
      } else if (target.pbHasType("GHOST")) {
        score += 70;
      } else if (target.stages.EVASION! <= 0) {
        score -= 60;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartNegateTargetEvasionStatStageAndDarkImmunity":
      if (truthy(target.effects[PBEffects.MiracleEye])) {
        score -= 90;
      } else if (target.pbHasType("DARK")) {
        score += 70;
      } else if (target.stages.EVASION! <= 0) {
        score -= 60;
      }
      break;
    //---------------------------------------------------------------------------
    case "IgnoreTargetDefSpDefEvaStatStages":
      break;
    //---------------------------------------------------------------------------
    case "TypeIsUserFirstType":
      break;
    //---------------------------------------------------------------------------
    case "TypeDependsOnUserIVs":
      break;
    //---------------------------------------------------------------------------
    case "TypeAndPowerDependOnUserBerry":
      if (!user.item || !user.item.isBerry() || !user.itemActive()) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "TypeDependsOnUserPlate": case "TypeDependsOnUserMemory": case "TypeDependsOnUserDrive":
      break;
    //---------------------------------------------------------------------------
    case "TypeDependsOnUserMorpekoFormRaiseUserSpeed1":
      if (user.stages.SPEED! <= 0) score += 20;
      break;
    //---------------------------------------------------------------------------
    case "TypeAndPowerDependOnWeather":
      break;
    //---------------------------------------------------------------------------
    case "TypeAndPowerDependOnTerrain":
      if (this.battle.field.terrain !== "None") score += 40;
      break;
    //---------------------------------------------------------------------------
    case "TargetMovesBecomeElectric": {
      const aspeed = this.pbRoughStat(user, "SPEED", skill);
      const ospeed = this.pbRoughStat(target, "SPEED", skill);
      if (aspeed > ospeed) score -= 90;
      break;
    }
    //---------------------------------------------------------------------------
    case "NormalMovesBecomeElectric":
      break;
    //---------------------------------------------------------------------------
    case "HitTwoTimes":
      break;
    //---------------------------------------------------------------------------
    case "HitTwoTimesPoisonTarget":
      if (target.pbCanPoison(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.mediumSkill()) {
          if (target.hp <= rubyDiv(target.totalhp, 4)) score += 30;
          if (target.hp <= rubyDiv(target.totalhp, 8)) score += 50;
          if (target.effects[PBEffects.Yawn] > 0) score -= 40;
        }
        if (skill >= PBTrainerAI.highSkill()) {
          if (this.pbRoughStat(target, "DEFENSE", skill) > 100) score += 10;
          if (this.pbRoughStat(target, "SPECIAL_DEFENSE", skill) > 100) score += 10;
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "TOXICBOOST"])) score -= 40;
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "HitTwoTimesFlinchTarget":
      if (truthy(target.effects[PBEffects.Minimize])) score += 30;
      break;
    //---------------------------------------------------------------------------
    case "HitTwoTimesTargetThenTargetAlly":
      break;
    //---------------------------------------------------------------------------
    case "HitThreeTimesPowersUpWithEachHit":
      break;
    //---------------------------------------------------------------------------
    case "HitThreeTimesAlwaysCriticalHit":
      if (skill >= PBTrainerAI.highSkill()) {
        // Ruby: stat = (move.physicalMove?) ? :DEFENSE : :SPECIAL_DEFENSE
        //       score += 50 if targets.stages[stat] > 1
        //       `targets` is not defined: NameError in Essentials v20.1.
        throw new Error("NameError: undefined local variable or method `targets' for #<Battle::AI>");
      }
      break;
    //---------------------------------------------------------------------------
    case "HitTwoToFiveTimes":
      break;
    //---------------------------------------------------------------------------
    case "HitTwoToFiveTimesOrThreeForAshGreninja":
      break;
    //---------------------------------------------------------------------------
    case "HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1": {
      const aspeed = this.pbRoughStat(user, "SPEED", skill);
      const ospeed = this.pbRoughStat(target, "SPEED", skill);
      if (aspeed > ospeed && rubyDiv(aspeed * 2, 3) < ospeed) {
        score -= 50;
      } else if (aspeed < ospeed && aspeed * 1.5 > ospeed) {
        score += 50;
      }
      score += user.stages.DEFENSE! * 30;
      break;
    }
    //---------------------------------------------------------------------------
    case "HitOncePerUserTeamMember":
      break;
    //---------------------------------------------------------------------------
    case "AttackAndSkipNextTurn":
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttack": case "TwoTurnAttackOneTurnInSun":
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackParalyzeTarget":
      if (target.pbCanParalyze(user, false) &&
          !(skill >= PBTrainerAI.mediumSkill() &&
          move.id === "THUNDERWAVE" &&
          Effectiveness.ineffective(this.pbCalcTypeMod(move.type, user, target)))) {
        score += 30;
        if (skill >= PBTrainerAI.mediumSkill()) {
          const aspeed = this.pbRoughStat(user, "SPEED", skill);
          const ospeed = this.pbRoughStat(target, "SPEED", skill);
          if (aspeed < ospeed) {
            score += 30;
          } else if (aspeed > ospeed) {
            score -= 40;
          }
        }
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET"])) score -= 40;
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackBurnTarget":
      if (target.pbCanBurn(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET", "FLAREBOOST"])) score -= 40;
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackFlinchTarget":
      if (user.effects[PBEffects.FocusEnergy] > 0) score += 20;
      if (skill >= PBTrainerAI.highSkill()) {
        if (!target.hasActiveAbility("INNERFOCUS") &&
            target.effects[PBEffects.Substitute] === 0) score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackRaiseUserSpAtkSpDefSpd2":
      if (user.statStageAtMax("SPECIAL_ATTACK") &&
          user.statStageAtMax("SPECIAL_DEFENSE") &&
          user.statStageAtMax("SPEED")) {
        score -= 90;
      } else {
        score -= user.stages.SPECIAL_ATTACK! * 10; // Only *10 instead of *20
        score -= user.stages.SPECIAL_DEFENSE! * 10; // because two-turn attack
        score -= user.stages.SPEED! * 10;
        if (skill >= PBTrainerAI.mediumSkill()) {
          let hasSpecialAttack = false;
          for (const m of user.moves) {
            if (!m.specialMove(m.type)) continue;
            hasSpecialAttack = true;
            break;
          }
          if (hasSpecialAttack) {
            score += 20;
          } else if (skill >= PBTrainerAI.highSkill()) {
            score -= 90;
          }
        }
        if (skill >= PBTrainerAI.highSkill()) {
          const aspeed = this.pbRoughStat(user, "SPEED", skill);
          const ospeed = this.pbRoughStat(target, "SPEED", skill);
          if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackChargeRaiseUserDefense1":
      if (move.statusMove()) {
        if (user.statStageAtMax("DEFENSE")) {
          score -= 90;
        } else {
          score -= user.stages.DEFENSE! * 20;
        }
      } else if (user.stages.DEFENSE! < 0) {
        score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackChargeRaiseUserSpAtk1": {
      const aspeed = this.pbRoughStat(user, "SPEED", skill);
      const ospeed = this.pbRoughStat(target, "SPEED", skill);
      if ((aspeed > ospeed && user.hp > rubyDiv(user.totalhp, 3)) || user.hp > rubyDiv(user.totalhp, 2)) {
        score += 60;
      } else {
        score -= 90;
      }
      score += user.stages.SPECIAL_ATTACK! * 20;
      break;
    }
    //---------------------------------------------------------------------------
    case "TwoTurnAttackInvulnerableUnderground":
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackInvulnerableUnderwater":
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackInvulnerableInSky":
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackInvulnerableInSkyParalyzeTarget":
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackInvulnerableInSkyTargetCannotAct":
      break;
    //---------------------------------------------------------------------------
    case "TwoTurnAttackInvulnerableRemoveProtections":
      break;
    //---------------------------------------------------------------------------
    case "MultiTurnAttackPreventSleeping":
      break;
    //---------------------------------------------------------------------------
    case "MultiTurnAttackConfuseUserAtEnd":
      break;
    //---------------------------------------------------------------------------
    case "MultiTurnAttackPowersUpEachTurn":
      break;
    //---------------------------------------------------------------------------
    case "MultiTurnAttackBideThenReturnDoubleDamage":
      if (user.hp <= rubyDiv(user.totalhp, 4)) {
        score -= 90;
      } else if (user.hp <= rubyDiv(user.totalhp, 2)) {
        score -= 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserFullyAndFallAsleep":
      if (user.hp === user.totalhp || !user.pbCanSleep(user, false, null, true)) {
        score -= 90;
      } else {
        score += 70;
        score -= rubyDiv(user.hp * 140, user.totalhp);
        if (user.status !== "NONE") score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserHalfOfTotalHP":
      if (user.hp === user.totalhp || (skill >= PBTrainerAI.mediumSkill() && !user.canHeal())) {
        score -= 90;
      } else {
        score += 50;
        score -= rubyDiv(user.hp * 100, user.totalhp);
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserDependingOnWeather":
      if (user.hp === user.totalhp || (skill >= PBTrainerAI.mediumSkill() && !user.canHeal())) {
        score -= 90;
      } else {
        switch (user.effectiveWeather()) {
          case "Sun": case "HarshSun":
            score += 30;
            break;
          case "None":
            break;
          default:
            score -= 30;
            break;
        }
        score += 50;
        score -= rubyDiv(user.hp * 100, user.totalhp);
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserDependingOnSandstorm":
      if (user.hp === user.totalhp || (skill >= PBTrainerAI.mediumSkill() && !user.canHeal())) {
        score -= 90;
      } else {
        score += 50;
        score -= rubyDiv(user.hp * 100, user.totalhp);
        if (user.effectiveWeather() === "Sandstorm") score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserHalfOfTotalHPLoseFlyingTypeThisTurn":
      if (user.hp === user.totalhp || (skill >= PBTrainerAI.mediumSkill() && !user.canHeal())) {
        score -= 90;
      } else {
        score += 50;
        score -= rubyDiv(user.hp * 100, user.totalhp);
      }
      break;
    //---------------------------------------------------------------------------
    case "CureTargetStatusHealUserHalfOfTotalHP":
      if (target.status === "NONE") {
        score -= 90;
      } else if (user.hp === user.totalhp && target.opposes(user)) {
        score -= 90;
      } else {
        score += rubyDiv((user.totalhp - user.hp) * 50, user.totalhp);
        if (target.opposes(user)) score -= 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserByTargetAttackLowerTargetAttack1":
      if (target.statStageAtMin("ATTACK")) {
        score -= 90;
      } else {
        if (await target.pbCanLowerStatStage("ATTACK", user)) {
          score += target.stages.ATTACK! * 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of target.moves) {
              if (!m.physicalMove(m.type)) continue;
              hasPhysicalAttack = true;
              break;
            }
            if (hasPhysicalAttack) {
              score += 20;
            } else if (skill >= PBTrainerAI.highSkill()) {
              score -= 90;
            }
          }
        }
        score += rubyDiv((user.totalhp - user.hp) * 50, user.totalhp);
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserByHalfOfDamageDone":
      if (skill >= PBTrainerAI.highSkill() && target.hasActiveAbility("LIQUIDOOZE")) {
        score -= 70;
      } else if (user.hp <= rubyDiv(user.totalhp, 2)) {
        score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserByHalfOfDamageDoneIfTargetAsleep":
      if (!target.asleep()) {
        score -= 100;
      } else if (skill >= PBTrainerAI.highSkill() && target.hasActiveAbility("LIQUIDOOZE")) {
        score -= 70;
      } else if (user.hp <= rubyDiv(user.totalhp, 2)) {
        score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserByThreeQuartersOfDamageDone":
      if (skill >= PBTrainerAI.highSkill() && target.hasActiveAbility("LIQUIDOOZE")) {
        score -= 80;
      } else if (user.hp <= rubyDiv(user.totalhp, 2)) {
        score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserAndAlliesQuarterOfTotalHP": {
      const allyAmt = 30;
      for (const b of this.battle.allSameSideBattlers(user.index)) {
        if (b.hp === b.totalhp || (skill >= PBTrainerAI.mediumSkill() && !b.canHeal())) {
          score -= rubyDiv(allyAmt, 2);
        } else if (b.hp < rubyDiv(b.totalhp * 3, 4)) {
          score += allyAmt;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "HealUserAndAlliesQuarterOfTotalHPCureStatus": {
      const allyAmt = rubyDiv(80, this.battle.pbSideSize(user.index));
      for (const b of this.battle.allSameSideBattlers(user.index)) {
        if (b.hp === b.totalhp || (skill >= PBTrainerAI.mediumSkill() && !b.canHeal())) {
          score -= allyAmt;
        } else if (b.hp < rubyDiv(b.totalhp * 3, 4)) {
          score += allyAmt;
        }
        if (b.pbHasAnyStatus()) score += rubyDiv(allyAmt, 2);
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "HealTargetHalfOfTotalHP":
      if (user.opposes(target)) {
        score -= 100;
      } else if (target.hp < rubyDiv(target.totalhp, 2) && target.effects[PBEffects.Substitute] === 0) {
        score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "HealTargetDependingOnGrassyTerrain":
      if (user.hp === user.totalhp || (skill >= PBTrainerAI.mediumSkill() && !user.canHeal())) {
        score -= 90;
      } else {
        score += 50;
        score -= rubyDiv(user.hp * 100, user.totalhp);
        if (skill >= PBTrainerAI.mediumSkill()) {
          if (this.battle.field.terrain === "Grassy") score += 30;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "HealUserPositionNextTurn":
      if (this.battle.positions[user.index]!.effects[PBEffects.Wish] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartHealUserEachTurn":
      if (truthy(user.effects[PBEffects.AquaRing])) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartHealUserEachTurnTrapUserInBattle":
      if (truthy(user.effects[PBEffects.Ingrain])) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartDamageTargetEachTurnIfTargetAsleep":
      if (truthy(target.effects[PBEffects.Nightmare]) ||
          target.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else if (!target.asleep()) {
        score -= 90;
      } else {
        if (target.statusCount <= 1) score -= 90;
        if (target.statusCount > 3) score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartLeechSeedTarget":
      if (target.effects[PBEffects.LeechSeed] >= 0) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill() && target.pbHasType("GRASS")) {
        score -= 90;
      } else if (user.turnCount === 0) {
        score += 60;
      }
      break;
    //---------------------------------------------------------------------------
    case "UserLosesHalfOfTotalHP":
      if (user.hp <= rubyDiv(user.totalhp, 2)) score -= 100;
      break;
    //---------------------------------------------------------------------------
    case "UserLosesHalfOfTotalHPExplosive": {
      const reserves = this.battle.pbAbleNonActiveCount(user.idxOwnSide());
      const foes = this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
      if (this.battle.pbCheckGlobalAbility("DAMP")) {
        score -= 100;
      } else if (skill >= PBTrainerAI.mediumSkill() && reserves === 0 && foes > 0) {
        score -= 100; // don't want to lose
      } else if (skill >= PBTrainerAI.highSkill() && reserves === 0 && foes === 0) {
        score += 80; // want to draw
      } else {
        score -= rubyDiv((user.totalhp - user.hp) * 75, user.totalhp);
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "UserFaintsExplosive": {
      const reserves = this.battle.pbAbleNonActiveCount(user.idxOwnSide());
      const foes = this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
      if (this.battle.pbCheckGlobalAbility("DAMP")) {
        score -= 100;
      } else if (skill >= PBTrainerAI.mediumSkill() && reserves === 0 && foes > 0) {
        score -= 100; // don't want to lose
      } else if (skill >= PBTrainerAI.highSkill() && reserves === 0 && foes === 0) {
        score += 80; // want to draw
      } else {
        score -= rubyDiv(user.hp * 100, user.totalhp);
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "UserFaintsPowersUpInMistyTerrainExplosive": {
      const reserves = this.battle.pbAbleNonActiveCount(user.idxOwnSide());
      const foes = this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
      if (this.battle.pbCheckGlobalAbility("DAMP")) {
        score -= 100;
      } else if (skill >= PBTrainerAI.mediumSkill() && reserves === 0 && foes > 0) {
        score -= 100; // don't want to lose
      } else if (skill >= PBTrainerAI.highSkill() && reserves === 0 && foes === 0) {
        score += 40; // want to draw
        if (this.battle.field.terrain === "Misty") score += 40;
      } else {
        score -= rubyDiv(user.hp * 100, user.totalhp);
        if (this.battle.field.terrain === "Misty") score += 20;
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "UserFaintsFixedDamageUserHP":
      break;
    //---------------------------------------------------------------------------
    case "UserFaintsLowerTargetAtkSpAtk2":
      if (!(await target.pbCanLowerStatStage("ATTACK", user)) &&
          !(await target.pbCanLowerStatStage("SPECIAL_ATTACK", user))) {
        score -= 100;
      } else if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) === 0) {
        score -= 100;
      } else {
        score += target.stages.ATTACK! * 10;
        score += target.stages.SPECIAL_ATTACK! * 10;
        score -= rubyDiv(user.hp * 100, user.totalhp);
      }
      break;
    //---------------------------------------------------------------------------
    case "UserFaintsHealAndCureReplacement": case "UserFaintsHealAndCureReplacementRestorePP":
      score -= 70;
      break;
    //---------------------------------------------------------------------------
    case "StartPerishCountsForAllBattlers":
      if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) === 0) {
        score -= 90;
      } else if (target.effects[PBEffects.PerishSong] > 0) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "AttackerFaintsIfUserFaints":
      score += 50;
      score -= rubyDiv(user.hp * 100, user.totalhp);
      if (user.hp <= rubyDiv(user.totalhp, 10)) score += 30;
      break;
    //---------------------------------------------------------------------------
    case "SetAttackerMovePPTo0IfUserFaints":
      score += 50;
      score -= rubyDiv(user.hp * 100, user.totalhp);
      if (user.hp <= rubyDiv(user.totalhp, 10)) score += 30;
      break;
    //---------------------------------------------------------------------------
    case "UserTakesTargetItem":
      if (skill >= PBTrainerAI.highSkill()) {
        if (!user.item && target.item) {
          score += 40;
        } else {
          score -= 90;
        }
      } else {
        score -= 80;
      }
      break;
    //---------------------------------------------------------------------------
    case "TargetTakesUserItem":
      if (!user.item || target.item) {
        score -= 90;
      } else if (user.hasActiveItem(["FLAMEORB", "TOXICORB", "STICKYBARB", "IRONBALL",
        "CHOICEBAND", "CHOICESCARF", "CHOICESPECS"])) {
        score += 50;
      } else {
        score -= 80;
      }
      break;
    //---------------------------------------------------------------------------
    case "UserTargetSwapItems":
      if (!user.item && !target.item) {
        score -= 90;
      } else if (skill >= PBTrainerAI.highSkill() && target.hasActiveAbility("STICKYHOLD")) {
        score -= 90;
      } else if (user.hasActiveItem(["FLAMEORB", "TOXICORB", "STICKYBARB", "IRONBALL",
        "CHOICEBAND", "CHOICESCARF", "CHOICESPECS"])) {
        score += 50;
      } else if (!user.item && target.item) {
        if (truthy(user.lastMoveUsed) &&
            MoveData.get(user.lastMoveUsed!).functionCode === "UserTargetSwapItems") score -= 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "RestoreUserConsumedItem":
      if (!truthy(user.recycleItem()) || user.item) {
        score -= 80;
      } else if (truthy(user.recycleItem())) {
        score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "RemoveTargetItem":
      if (skill >= PBTrainerAI.highSkill()) {
        if (target.item) score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "DestroyTargetBerryOrGem":
      if (target.effects[PBEffects.Substitute] === 0) {
        if (skill >= PBTrainerAI.highSkill() && target.item && target.item.isBerry()) {
          score += 30;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "CorrodeTargetItem":
      if (this.battle.corrosiveGas[target.index % 2]![target.pokemonIndex]) {
        score -= 100;
      } else if (!target.item || !target.itemActive() || target.unlosableItem(target.item) ||
                 target.hasActiveAbility("STICKYHOLD")) {
        score -= 90;
      } else if (target.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else {
        score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartTargetCannotUseItem":
      if (target.effects[PBEffects.Embargo] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartNegateHeldItems":
      if (this.battle.field.effects[PBEffects.MagicRoom] > 0) {
        score -= 90;
      } else if (!user.item && target.item) {
        score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "UserConsumeBerryRaiseDefense2":
      if (!user.item || !user.item.isBerry() || !user.itemActive()) {
        score -= 100;
      } else {
        if (skill >= PBTrainerAI.highSkill()) {
          const usefulBerries: Id[] = [
            "ORANBERRY", "SITRUSBERRY", "AGUAVBERRY", "APICOTBERRY", "CHERIBERRY",
            "CHESTOBERRY", "FIGYBERRY", "GANLONBERRY", "IAPAPABERRY", "KEEBERRY",
            "LANSATBERRY", "LEPPABERRY", "LIECHIBERRY", "LUMBERRY", "MAGOBERRY",
            "MARANGABERRY", "PECHABERRY", "PERSIMBERRY", "PETAYABERRY", "RAWSTBERRY",
            "SALACBERRY", "STARFBERRY", "WIKIBERRY",
          ];
          if (usefulBerries.includes(user.itemId!)) score += 30;
        }
        if (skill >= PBTrainerAI.mediumSkill()) {
          if (user.canHeal() && user.hp < rubyDiv(user.totalhp, 3) && user.hasActiveAbility("CHEEKPOUCH")) score += 20;
          if (user.hasActiveAbility(["HARVEST", "RIPEN"]) ||
              user.pbHasMoveFunction("RestoreUserConsumedItem")) score += 20; // Recycle
          if (!user.canConsumeBerry()) score += 20;
        }
        score -= user.stages.DEFENSE! * 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "AllBattlersConsumeBerry": {
      const usefulBerries: Id[] = [
        "ORANBERRY", "SITRUSBERRY", "AGUAVBERRY", "APICOTBERRY", "CHERIBERRY",
        "CHESTOBERRY", "FIGYBERRY", "GANLONBERRY", "IAPAPABERRY", "KEEBERRY",
        "LANSATBERRY", "LEPPABERRY", "LIECHIBERRY", "LUMBERRY", "MAGOBERRY",
        "MARANGABERRY", "PECHABERRY", "PERSIMBERRY", "PETAYABERRY",
        "RAWSTBERRY", "SALACBERRY", "STARFBERRY", "WIKIBERRY",
      ];
      for (const b of this.battle.allSameSideBattlers(user.index)) {
        if (!b.item || !b.item.isBerry() || !b.itemActive()) {
          score -= rubyDiv(100, this.battle.pbSideSize(user.index));
        } else {
          if (skill >= PBTrainerAI.highSkill()) {
            const amt = rubyDiv(30, this.battle.pbSideSize(user.index));
            if (usefulBerries.includes(b.itemId!)) score += amt;
          }
          if (skill >= PBTrainerAI.mediumSkill()) {
            const amt = rubyDiv(20, this.battle.pbSideSize(user.index));
            if (b.canHeal() && b.hp < rubyDiv(b.totalhp, 3) && b.hasActiveAbility("CHEEKPOUCH")) score += amt;
            if (b.hasActiveAbility(["HARVEST", "RIPEN"]) ||
                b.pbHasMoveFunction("RestoreUserConsumedItem")) score += amt; // Recycle
            if (!b.canConsumeBerry()) score += amt;
          }
        }
      }
      if (skill >= PBTrainerAI.highSkill()) {
        for (const b of this.battle.allOtherSideBattlers(user.index)) {
          const amt = rubyDiv(10, this.battle.pbSideSize(target.index));
          if (b.hasActiveItem(usefulBerries)) score -= amt;
          if (b.canHeal() && b.hp < rubyDiv(b.totalhp, 3) && b.hasActiveAbility("CHEEKPOUCH")) score -= amt;
          if (b.hasActiveAbility(["HARVEST", "RIPEN"]) ||
              b.pbHasMoveFunction("RestoreUserConsumedItem")) score -= amt; // Recycle
          if (!b.canConsumeBerry()) score -= amt;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "UserConsumeTargetBerry":
      if (target.effects[PBEffects.Substitute] === 0) {
        if (skill >= PBTrainerAI.highSkill() && target.item && target.item.isBerry()) {
          score += 30;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "ThrowUserItemAtTarget":
      if (!user.item || !user.itemActive() ||
          user.unlosableItem(user.item) || user.item.isPokeBall()) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "RedirectAllMovesToUser":
      if (user.allAllies().length === 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "RedirectAllMovesToTarget":
      if (user.allAllies().length === 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "CannotBeRedirected": {
      let redirection = false;
      for (const b of user.allOpposing()) {
        if (b.index === target.index) continue;
        // Ruby: move.pbCalcType is called with no argument but takes (user):
        //       ArgumentError in Essentials v20.1.
        if (truthy(b.effects[PBEffects.RagePowder]) ||
            b.effects[PBEffects.Spotlight] > 0 ||
            b.effects[PBEffects.FollowMe] > 0 ||
            (b.hasActiveAbility("LIGHTNINGROD") && pbCalcTypeNoArgs()) ||
            (b.hasActiveAbility("STORMDRAIN") && pbCalcTypeNoArgs())) {
          redirection = true;
          break;
        }
      }
      if (redirection && skill >= PBTrainerAI.mediumSkill()) score += 50;
      break;
    }
    //---------------------------------------------------------------------------
    case "RandomlyDamageOrHealTarget":
      break;
    //---------------------------------------------------------------------------
    case "HealAllyOrDamageFoe":
      if (!target.opposes(user)) {
        if (target.hp === target.totalhp || (skill >= PBTrainerAI.mediumSkill() && !target.canHeal())) {
          score -= 90;
        } else {
          score += 50;
          score -= rubyDiv(target.hp * 100, target.totalhp);
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "CurseTargetOrLowerUserSpd1RaiseUserAtkDef1":
      if (user.pbHasType("GHOST")) {
        if (truthy(target.effects[PBEffects.Curse])) {
          score -= 90;
        } else if (user.hp <= rubyDiv(user.totalhp, 2)) {
          if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) === 0) {
            score -= 90;
          } else {
            score -= 50;
            if (this.battle.switchStyle) score -= 30;
          }
        }
      } else {
        let avg = user.stages.SPEED! * 10;
        avg -= user.stages.ATTACK! * 10;
        avg -= user.stages.DEFENSE! * 10;
        score += rubyDiv(avg, 3);
      }
      break;
    //---------------------------------------------------------------------------
    case "EffectDependsOnEnvironment":
      break;
    //---------------------------------------------------------------------------
    case "HitsAllFoesAndPowersUpInPsychicTerrain":
      if (this.battle.field.terrain === "Psychic" && user.affectedByTerrain()) score += 40;
      break;
    //---------------------------------------------------------------------------
    case "TargetNextFireMoveDamagesTarget": {
      const aspeed = this.pbRoughStat(user, "SPEED", skill);
      const ospeed = this.pbRoughStat(target, "SPEED", skill);
      if (aspeed > ospeed) {
        score -= 90;
      } else if (target.pbHasMoveType("FIRE")) {
        score += 30;
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "DoublePowerAfterFusionFlare":
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerAfterFusionBolt":
      break;
    //---------------------------------------------------------------------------
    case "PowerUpAllyMove": {
      const hasAlly = user.allAllies().length > 0;
      if (hasAlly) score += 30;
      if (!hasAlly) score -= 90;
      break;
    }
    //---------------------------------------------------------------------------
    case "CounterPhysicalDamage":
      if (target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        const attack = this.pbRoughStat(user, "ATTACK", skill);
        const spatk = this.pbRoughStat(user, "SPECIAL_ATTACK", skill);
        if (attack * 1.5 < spatk) {
          score -= 60;
        } else if (skill >= PBTrainerAI.mediumSkill() && truthy(target.lastMoveUsed)) {
          const moveData = MoveData.get(target.lastMoveUsed!);
          if (moveData.physical()) score += 60;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "CounterSpecialDamage":
      if (target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        const attack = this.pbRoughStat(user, "ATTACK", skill);
        const spatk = this.pbRoughStat(user, "SPECIAL_ATTACK", skill);
        if (attack > spatk * 1.5) {
          score -= 60;
        } else if (skill >= PBTrainerAI.mediumSkill() && truthy(target.lastMoveUsed)) {
          const moveData = MoveData.get(target.lastMoveUsed!);
          if (moveData.special()) score += 60;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "CounterDamagePlusHalf":
      if (target.effects[PBEffects.HyperBeam] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "UserAddStockpileRaiseDefSpDef1": {
      let avg = 0;
      avg -= user.stages.DEFENSE! * 10;
      avg -= user.stages.SPECIAL_DEFENSE! * 10;
      score += rubyDiv(avg, 2);
      if (user.effects[PBEffects.Stockpile] >= 3) {
        score -= 80;
      } else if (user.pbHasMoveFunction("PowerDependsOnUserStockpile",
        "HealUserDependingOnUserStockpile")) { // Spit Up, Swallow
        score += 20; // More preferable if user also has Spit Up/Swallow
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "PowerDependsOnUserStockpile":
      if (user.effects[PBEffects.Stockpile] === 0) score -= 100;
      break;
    //---------------------------------------------------------------------------
    case "HealUserDependingOnUserStockpile":
      if (user.effects[PBEffects.Stockpile] === 0) {
        score -= 90;
      } else if (user.hp === user.totalhp) {
        score -= 90;
      } else {
        const mult = [0, 25, 50, 100][user.effects[PBEffects.Stockpile]]!;
        score += mult;
        score -= rubyDiv(user.hp * mult * 2, user.totalhp);
      }
      break;
    //---------------------------------------------------------------------------
    case "GrassPledge":
      break;
    //---------------------------------------------------------------------------
    case "FirePledge":
      break;
    //---------------------------------------------------------------------------
    case "WaterPledge":
      break;
    //---------------------------------------------------------------------------
    case "UseLastMoveUsed":
      break;
    //---------------------------------------------------------------------------
    case "UseLastMoveUsedByTarget":
      score -= 40;
      if (skill >= PBTrainerAI.highSkill()) {
        if (!truthy(target.lastRegularMoveUsed) ||
            !MoveData.get(target.lastRegularMoveUsed!).flags.some((f) => /^CanMirrorMove$/i.test(f))) score -= 100;
      }
      break;
    //---------------------------------------------------------------------------
    case "UseMoveTargetIsAboutToUse":
      break;
    //---------------------------------------------------------------------------
    case "UseMoveDependingOnEnvironment":
      break;
    //---------------------------------------------------------------------------
    case "UseRandomMove":
      break;
    //---------------------------------------------------------------------------
    case "UseRandomMoveFromUserParty":
      break;
    //---------------------------------------------------------------------------
    case "UseRandomUserMoveIfAsleep":
      if (user.asleep()) {
        score += 100; // Because it can only be used while asleep
      } else {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "BounceBackProblemCausingStatusMoves":
      break;
    //---------------------------------------------------------------------------
    case "StealAndUseBeneficialStatusMove":
      break;
    //---------------------------------------------------------------------------
    case "ReplaceMoveThisBattleWithTargetLastMoveUsed": {
      const moveBlacklist = [
        "Struggle", // Struggle
        "ReplaceMoveThisBattleWithTargetLastMoveUsed", // Mimic
        "ReplaceMoveWithTargetLastMoveUsed", // Sketch
        "UseRandomMove", // Metronome
      ];
      if (truthy(user.effects[PBEffects.Transform]) || !truthy(target.lastRegularMoveUsed)) {
        score -= 90;
      } else {
        const lastMoveData = MoveData.get(target.lastRegularMoveUsed!);
        if (moveBlacklist.includes(lastMoveData.functionCode) ||
            lastMoveData.type === "SHADOW") {
          score -= 90;
        }
        for (const m of user.moves) {
          // Ruby: m (a Battle::Move) != a Symbol is always true, so this never subtracts
          if ((m as unknown) !== target.lastRegularMoveUsed) continue;
          score -= 90;
          break;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "ReplaceMoveWithTargetLastMoveUsed": {
      const moveBlacklist = [
        "Struggle", // Struggle
        "ReplaceMoveWithTargetLastMoveUsed", // Sketch
      ];
      if (truthy(user.effects[PBEffects.Transform]) || !truthy(target.lastRegularMoveUsed)) {
        score -= 90;
      } else {
        const lastMoveData = MoveData.get(target.lastRegularMoveUsed!);
        if (moveBlacklist.includes(lastMoveData.functionCode) ||
            lastMoveData.type === "SHADOW") {
          score -= 90;
        }
        for (const m of user.moves) {
          // Ruby: m (a Battle::Move) != a Symbol is always true, so this never subtracts
          if ((m as unknown) !== target.lastRegularMoveUsed) continue;
          score -= 90; // User already knows the move that will be Sketched
          break;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "FleeFromBattle":
      if (this.battle.trainerBattle()) score -= 100;
      break;
    //---------------------------------------------------------------------------
    case "SwitchOutUserStatusMove":
      if (!this.battle.pbCanChooseNonActive(user.index) ||
          this.battle.pbTeamAbleNonActiveCount(user.index) > 1) { // Don't switch in ace
        score -= 100;
      } else {
        if (user.effects[PBEffects.Confusion] > 0) score += 40;
        let total = 0;
        for (const s of Stat.eachBattle()) total += user.stages[s.id]!;
        if (total <= 0 || user.turnCount === 0) {
          score += 60;
        } else {
          score -= total * 10;
          // special case: user has no damaging moves
          let hasDamagingMove = false;
          for (const m of user.moves) {
            if (!m.damagingMove()) continue;
            hasDamagingMove = true;
            break;
          }
          if (!hasDamagingMove) score += 75;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "SwitchOutUserDamagingMove":
      if (!this.battle.pbCanChooseNonActive(user.index) ||
          this.battle.pbTeamAbleNonActiveCount(user.index) > 1) { // Don't switch in ace
        score -= 100;
      }
      break;
    //---------------------------------------------------------------------------
    case "LowerTargetAtkSpAtk1SwitchOutUser": {
      let avg = target.stages.ATTACK! * 10;
      avg += target.stages.SPECIAL_ATTACK! * 10;
      score += rubyDiv(avg, 2);
      break;
    }
    //---------------------------------------------------------------------------
    case "SwitchOutUserPassOnEffects":
      if (this.battle.pbCanChooseNonActive(user.index)) {
        if (user.effects[PBEffects.Confusion] > 0) score -= 40;
        let total = 0;
        for (const s of Stat.eachBattle()) total += user.stages[s.id]!;
        if (total <= 0 || user.turnCount === 0) {
          score -= 60;
        } else {
          score += total * 10;
          // special case: user has no damaging moves
          let hasDamagingMove = false;
          for (const m of user.moves) {
            if (!m.damagingMove()) continue;
            hasDamagingMove = true;
            break;
          }
          if (!hasDamagingMove) score += 75;
        }
      } else {
        score -= 100;
      }
      break;
    //---------------------------------------------------------------------------
    case "SwitchOutTargetStatusMove":
      if (truthy(target.effects[PBEffects.Ingrain]) ||
          (skill >= PBTrainerAI.highSkill() && target.hasActiveAbility("SUCTIONCUPS"))) {
        score -= 90;
      } else {
        let ch = 0;
        this.battle.pbParty(target.index).forEach((_pkmn, i) => {
          if (this.battle.pbCanSwitchLax(target.index, i)) ch += 1;
        });
        if (ch === 0) score -= 90;
      }
      if (score > 20) {
        if (target.pbOwnSide().effects[PBEffects.Spikes] > 0) score += 50;
        if (target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) score += 50;
        if (truthy(target.pbOwnSide().effects[PBEffects.StealthRock])) score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "SwitchOutTargetDamagingMove":
      if (!truthy(target.effects[PBEffects.Ingrain]) &&
          !(skill >= PBTrainerAI.highSkill() && target.hasActiveAbility("SUCTIONCUPS"))) {
        if (target.pbOwnSide().effects[PBEffects.Spikes] > 0) score += 40;
        if (target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) score += 40;
        if (truthy(target.pbOwnSide().effects[PBEffects.StealthRock])) score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "BindTarget":
      if (target.effects[PBEffects.Trapping] === 0) score += 40;
      break;
    //---------------------------------------------------------------------------
    case "BindTargetDoublePowerIfTargetUnderwater":
      if (target.effects[PBEffects.Trapping] === 0) score += 40;
      break;
    //---------------------------------------------------------------------------
    case "TrapTargetInBattle":
      if (target.effects[PBEffects.MeanLook] >= 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "TrapTargetInBattleLowerTargetDefSpDef1EachTurn":
      if (target.effects[PBEffects.Octolock] >= 0) {
        score -= 100;
      } else {
        if (!target.trappedInBattle()) score += 30;
        if (!(await target.pbCanLowerStatStage("DEFENSE", user, move)) &&
            !(await target.pbCanLowerStatStage("SPECIAL_DEFENSE", user, move))) score -= 100;
      }
      break;
    //---------------------------------------------------------------------------
    case "TrapUserAndTargetInBattle":
      if (target.effects[PBEffects.JawLock] < 0) {
        if (!user.trappedInBattle() && !target.trappedInBattle()) score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "TrapAllBattlersInBattleForOneTurn":
      break;
    //---------------------------------------------------------------------------
    case "PursueSwitchingFoe":
      break;
    //---------------------------------------------------------------------------
    case "UsedAfterUserTakesPhysicalDamage":
      if (skill >= PBTrainerAI.mediumSkill()) {
        let hasPhysicalAttack = false;
        for (const m of target.moves) {
          if (!m.physicalMove(m.type)) continue;
          hasPhysicalAttack = true;
          break;
        }
        if (!hasPhysicalAttack) score -= 80;
      }
      break;
    //---------------------------------------------------------------------------
    case "UsedAfterAllyRoundWithDoublePower":
      if (skill >= PBTrainerAI.mediumSkill()) {
        for (const b of user.allAllies()) {
          if (!b.pbHasMove(move.id)) continue;
          score += 20;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "TargetActsNext":
      break;
    //---------------------------------------------------------------------------
    case "TargetActsLast":
      break;
    //---------------------------------------------------------------------------
    case "TargetUsesItsLastUsedMoveAgain":
      if (skill >= PBTrainerAI.mediumSkill()) {
        if (!truthy(target.lastRegularMoveUsed) ||
            !target.pbHasMove(target.lastRegularMoveUsed) ||
            target.usingMultiTurnAttack()) {
          score -= 90;
        } else {
          // Without lots of code here to determine good/bad moves and relative
          // speeds, using this move is likely to just be a waste of a turn
          score -= 50;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "StartSlowerBattlersActFirst":
      break;
    //---------------------------------------------------------------------------
    case "HigherPriorityInGrassyTerrain":
      if (skill >= PBTrainerAI.mediumSkill() && this.battle.field.terrain === "Grassy") {
        const aspeed = this.pbRoughStat(user, "SPEED", skill);
        const ospeed = this.pbRoughStat(target, "SPEED", skill);
        if (aspeed < ospeed) score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "LowerPPOfTargetLastMoveBy3": {
      const lastMove = target.pbGetMoveWithID(target.lastRegularMoveUsed);
      if (lastMove && lastMove.totalPp() > 0 && lastMove.pp <= 3) {
        score += 50;
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "LowerPPOfTargetLastMoveBy4":
      score -= 40;
      break;
    //---------------------------------------------------------------------------
    case "DisableTargetLastMoveUsed":
      if (target.effects[PBEffects.Disable] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "DisableTargetUsingSameMoveConsecutively":
      if (truthy(target.effects[PBEffects.Torment])) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "DisableTargetUsingDifferentMove": {
      const aspeed = this.pbRoughStat(user, "SPEED", skill);
      const ospeed = this.pbRoughStat(target, "SPEED", skill);
      if (target.effects[PBEffects.Encore] > 0) {
        score -= 90;
      } else if (aspeed > ospeed) {
        if (truthy(target.lastRegularMoveUsed)) {
          const moveData = MoveData.get(target.lastRegularMoveUsed!);
          if (moveData.category === 2 && // Status move
              ["User", "BothSides"].includes(moveData.target)) {
            score += 60;
          } else if (moveData.category !== 2 && // Damaging move
                     moveData.target === "NearOther" &&
                     Effectiveness.ineffective(this.pbCalcTypeMod(moveData.type, target, user))) {
            score += 60;
          }
        } else {
          score -= 90;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "DisableTargetStatusMoves":
      if (target.effects[PBEffects.Taunt] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "DisableTargetHealingMoves":
      if (target.effects[PBEffects.HealBlock] > 0) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "DisableTargetSoundMoves":
      if (target.effects[PBEffects.ThroatChop] === 0 && skill >= PBTrainerAI.highSkill()) {
        let hasSoundMove = false;
        for (const m of user.moves) {
          if (!m.soundMove()) continue;
          hasSoundMove = true;
          break;
        }
        if (hasSoundMove) score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "DisableTargetMovesKnownByUser":
      if (truthy(user.effects[PBEffects.Imprison])) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "AllBattlersLoseHalfHPUserSkipsNextTurn":
      score += 20; // Shadow moves are more preferable
      if (target.hp >= rubyDiv(target.totalhp, 2)) score += 20;
      if (user.hp < rubyDiv(user.hp, 2)) score -= 20; // Ruby bug kept: never true
      break;
    //---------------------------------------------------------------------------
    case "UserLosesHalfHP":
      score += 20; // Shadow moves are more preferable
      score -= 40;
      break;
    //---------------------------------------------------------------------------
    case "StartShadowSkyWeather":
      score += 20; // Shadow moves are more preferable
      if (this.battle.pbCheckGlobalAbility("AIRLOCK") ||
          this.battle.pbCheckGlobalAbility("CLOUDNINE")) {
        score -= 90;
      } else if (this.battle.field.weather === "ShadowSky") {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "RemoveAllScreens":
      score += 20; // Shadow moves are more preferable
      if (target.pbOwnSide().effects[PBEffects.AuroraVeil] > 0 ||
          target.pbOwnSide().effects[PBEffects.Reflect] > 0 ||
          target.pbOwnSide().effects[PBEffects.LightScreen] > 0 ||
          target.pbOwnSide().effects[PBEffects.Safeguard] > 0) {
        score += 30;
        if (user.pbOwnSide().effects[PBEffects.AuroraVeil] > 0 ||
            user.pbOwnSide().effects[PBEffects.Reflect] > 0 ||
            user.pbOwnSide().effects[PBEffects.LightScreen] > 0 ||
            user.pbOwnSide().effects[PBEffects.Safeguard] > 0) score -= 90;
      } else {
        score -= 110;
      }
      break;
    //---------------------------------------------------------------------------
    default:
      return aiEffectScorePart2_pbGetMoveScoreFunctionCode.call(this, score, move, user, target, skill);
  }
  return score;
};

/** Ruby's `move.pbCalcType` with no argument (pbCalcType takes user): ArgumentError. */
function pbCalcTypeNoArgs(): never {
  throw new Error("ArgumentError: wrong number of arguments (given 0, expected 1) (pbCalcType)");
}
