// Port of Data/Scripts/011_Battle/005_AI/005_AI_Move_EffectScores_1.rb: the
// first part of pbGetMoveScoreFunctionCode (function codes with no case here
// keep the score). Later parts wrap it (AI_Move_EffectScores_2.ts, ...).
//
// Ruby's `user.eachMove do |m| ... break end` loops are for-of loops over
// user.moves (Battler#eachMove yields each of @moves). Ruby's bugs are kept
// (marked "Ruby bug" below), e.g. the multi-battler stat moves that score the
// user's stages instead of each battler's.

import { Stat } from "../../data/gameData/stat";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { rubyDiv } from "../rubyMath";
import { AI, PBTrainerAI, truthy } from "./Battle_AI";

/** Ruby's `[0, false, nil].include?(x)` (and `[0, 1, false, nil]`): nil for a missing effect. */
function includesValue(values: unknown[], x: unknown): boolean {
  return values.includes(x ?? null);
}

const methods = {
  //=============================================================================
  // Get a score for the given move based on its effect
  //=============================================================================
  async pbGetMoveScoreFunctionCode(this: AI, score: number, move: Move, user: Battler, target: Battler,
    skill = 100): Promise<number> {
    switch (move.function) {
      //---------------------------------------------------------------------------
      case "Struggle":
        break;
      //---------------------------------------------------------------------------
      case "None": // No extra effect
        break;
      //---------------------------------------------------------------------------
      case "DoesNothingCongratulations": case "DoesNothingFailsIfNoAlly":
      case "DoesNothingUnusableInGravity":
        score -= 95;
        if (skill >= PBTrainerAI.highSkill()) score = 0;
        break;
      //---------------------------------------------------------------------------
      case "AddMoneyGainedFromBattle":
        break;
      //---------------------------------------------------------------------------
      case "DoubleMoneyGainedFromBattle":
        score -= 90;
        break;
      //---------------------------------------------------------------------------
      case "FailsIfNotUserFirstTurn":
        if (user.turnCount > 0) score -= 90;
        break;
      //---------------------------------------------------------------------------
      case "FailsIfUserHasUnusedMove":
        break;
      //---------------------------------------------------------------------------
      case "FailsIfUserNotConsumedBerry":
        if (!user.belched()) score -= 90;
        break;
      //---------------------------------------------------------------------------
      case "FailsIfTargetHasNoItem":
        if (skill >= PBTrainerAI.mediumSkill()) {
          if (!target.item || !target.itemActive()) {
            score -= 90;
          } else {
            score += 50;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "FailsUnlessTargetSharesTypeWithUser":
        if (!(user.types[0] != null && target.pbHasType(user.types[0])) &&
          !(user.types[1] != null && target.pbHasType(user.types[1]))) {
          score -= 90;
        }
        break;
      //---------------------------------------------------------------------------
      case "FailsIfUserDamagedThisTurn":
        if (target.effects[PBEffects.HyperBeam] > 0) score += 50;
        if (target.hp <= rubyDiv(target.totalhp, 2)) score -= 35; // If target is weak, no
        if (target.hp <= rubyDiv(target.totalhp, 4)) score -= 70; // need to risk this move
        break;
      //---------------------------------------------------------------------------
      case "FailsIfTargetActed":
        break;
      //---------------------------------------------------------------------------
      case "CrashDamageIfFailsUnusableInGravity":
        score += 10 * (user.stages.ACCURACY! - target.stages.EVASION!);
        break;
      //---------------------------------------------------------------------------
      case "StartSunWeather":
        if (this.battle.pbCheckGlobalAbility("AIRLOCK") ||
          this.battle.pbCheckGlobalAbility("CLOUDNINE")) {
          score -= 90;
        } else if (this.battle.field.weather === "Sun") {
          score -= 90;
        } else {
          for (const m of user.moves) {
            if (!m.damagingMove() || m.type !== "FIRE") continue;
            score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "StartRainWeather":
        if (this.battle.pbCheckGlobalAbility("AIRLOCK") ||
          this.battle.pbCheckGlobalAbility("CLOUDNINE")) {
          score -= 90;
        } else if (this.battle.field.weather === "Rain") {
          score -= 90;
        } else {
          for (const m of user.moves) {
            if (!m.damagingMove() || m.type !== "WATER") continue;
            score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "StartSandstormWeather":
        if (this.battle.pbCheckGlobalAbility("AIRLOCK") ||
          this.battle.pbCheckGlobalAbility("CLOUDNINE")) {
          score -= 90;
        } else if (this.battle.field.weather === "Sandstorm") {
          score -= 90;
        }
        break;
      //---------------------------------------------------------------------------
      case "StartHailWeather":
        if (this.battle.pbCheckGlobalAbility("AIRLOCK") ||
          this.battle.pbCheckGlobalAbility("CLOUDNINE")) {
          score -= 90;
        } else if (this.battle.field.weather === "Hail") {
          score -= 90;
        }
        break;
      //---------------------------------------------------------------------------
      case "StartElectricTerrain":
        break;
      //---------------------------------------------------------------------------
      case "StartGrassyTerrain":
        break;
      //---------------------------------------------------------------------------
      case "StartMistyTerrain":
        break;
      //---------------------------------------------------------------------------
      case "StartPsychicTerrain":
        break;
      //---------------------------------------------------------------------------
      case "RemoveTerrain":
        if (this.battle.field.terrain === "None") score -= 100;
        break;
      //---------------------------------------------------------------------------
      case "AddSpikesToFoeSide":
        if (user.pbOpposingSide().effects[PBEffects.Spikes] >= 3) {
          score -= 90;
        } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index))) {
          score -= 90; // Opponent can't switch in any Pokemon
        } else {
          score += 10 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
          score += [40, 26, 13][user.pbOpposingSide().effects[PBEffects.Spikes] as number]!;
        }
        break;
      //---------------------------------------------------------------------------
      case "AddToxicSpikesToFoeSide":
        if (user.pbOpposingSide().effects[PBEffects.ToxicSpikes] >= 2) {
          score -= 90;
        } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index))) {
          score -= 90; // Opponent can't switch in any Pokemon
        } else {
          score += 8 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
          score += [26, 13][user.pbOpposingSide().effects[PBEffects.ToxicSpikes] as number]!;
        }
        break;
      //---------------------------------------------------------------------------
      case "AddStealthRocksToFoeSide":
        if (truthy(user.pbOpposingSide().effects[PBEffects.StealthRock])) {
          score -= 90;
        } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index))) {
          score -= 90; // Opponent can't switch in any Pokemon
        } else {
          score += 10 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
        }
        break;
      //---------------------------------------------------------------------------
      case "AddStickyWebToFoeSide":
        if (truthy(user.pbOpposingSide().effects[PBEffects.StickyWeb])) score -= 95;
        break;
      //---------------------------------------------------------------------------
      case "SwapSideEffects":
        if (skill >= PBTrainerAI.mediumSkill()) {
          const goodEffects = [PBEffects.Reflect, PBEffects.LightScreen, PBEffects.AuroraVeil, PBEffects.SeaOfFire,
            PBEffects.Swamp, PBEffects.Rainbow, PBEffects.Mist, PBEffects.Safeguard,
            PBEffects.Tailwind];
          const badEffects = [PBEffects.Spikes, PBEffects.StickyWeb, PBEffects.ToxicSpikes, PBEffects.StealthRock];
          for (const e of badEffects) {
            if (!includesValue([0, false, null], user.pbOwnSide().effects[e])) score += 10;
            if (!includesValue([0, 1, false, null], user.pbOpposingSide().effects[e])) score -= 10;
          }
          if (skill >= PBTrainerAI.highSkill()) {
            for (const e of goodEffects) {
              if (!includesValue([0, 1, false, null], user.pbOpposingSide().effects[e])) score += 10;
              if (!includesValue([0, false, null], user.pbOwnSide().effects[e])) score -= 10;
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "UserMakeSubstitute":
        if (user.effects[PBEffects.Substitute] > 0) {
          score -= 90;
        } else if (user.hp <= rubyDiv(user.totalhp, 4)) {
          score -= 90;
        }
        break;
      //---------------------------------------------------------------------------
      case "RemoveUserBindingAndEntryHazards":
        if (user.effects[PBEffects.Trapping] > 0) score += 30;
        if (user.effects[PBEffects.LeechSeed] >= 0) score += 30;
        if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) > 0) {
          if (user.pbOwnSide().effects[PBEffects.Spikes] > 0) score += 80;
          if (user.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) score += 80;
          if (truthy(user.pbOwnSide().effects[PBEffects.StealthRock])) score += 80;
        }
        break;
      //---------------------------------------------------------------------------
      case "AttackTwoTurnsLater":
        if (this.battle.positions[target.index]!.effects[PBEffects.FutureSightCounter] > 0) {
          score -= 100;
        } else if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) === 0) {
          // Future Sight tends to be wasteful if down to last Pokemon
          score -= 70;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserSwapsPositionsWithAlly":
        break;
      //---------------------------------------------------------------------------
      case "BurnAttackerBeforeUserActs":
        score += 20; // Because of possible burning
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAttack1":
        if (move.statusMove()) {
          if (user.statStageAtMax("ATTACK")) {
            score -= 90;
          } else {
            score -= user.stages.ATTACK! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              let hasPhysicalAttack = false;
              for (const m of user.moves) {
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
        } else {
          if (user.stages.ATTACK! < 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
              if (!m.physicalMove(m.type)) continue;
              hasPhysicalAttack = true;
              break;
            }
            if (hasPhysicalAttack) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAttack2": case "RaiseUserAttack2IfTargetFaints":
      case "RaiseUserAttack3": case "RaiseUserAttack3IfTargetFaints":
        if (move.statusMove()) {
          if (user.statStageAtMax("ATTACK")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.ATTACK! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              let hasPhysicalAttack = false;
              for (const m of user.moves) {
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
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.ATTACK! < 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
              if (!m.physicalMove(m.type)) continue;
              hasPhysicalAttack = true;
              break;
            }
            if (hasPhysicalAttack) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "MaxUserAttackLoseHalfOfTotalHP":
        if (user.statStageAtMax("ATTACK") ||
          user.hp <= rubyDiv(user.totalhp, 2)) {
          score -= 100;
        } else {
          score += (6 - user.stages.ATTACK!) * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
              if (!m.physicalMove(m.type)) continue;
              hasPhysicalAttack = true;
              break;
            }
            if (hasPhysicalAttack) {
              score += 40;
            } else if (skill >= PBTrainerAI.highSkill()) {
              score -= 90;
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserDefense1": case "RaiseUserDefense1CurlUpUser":
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
      case "RaiseUserDefense2":
        if (move.statusMove()) {
          if (user.statStageAtMax("DEFENSE")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.DEFENSE! * 20;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.DEFENSE! < 0) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserDefense3":
        if (move.statusMove()) {
          if (user.statStageAtMax("DEFENSE")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.DEFENSE! * 30;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.DEFENSE! < 0) score += 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpAtk1":
        if (move.statusMove()) {
          if (user.statStageAtMax("SPECIAL_ATTACK")) {
            score -= 90;
          } else {
            score -= user.stages.SPECIAL_ATTACK! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              let hasSpecicalAttack = false;
              for (const m of user.moves) {
                if (!m.specialMove(m.type)) continue;
                hasSpecicalAttack = true;
                break;
              }
              if (hasSpecicalAttack) {
                score += 20;
              } else if (skill >= PBTrainerAI.highSkill()) {
                score -= 90;
              }
            }
          }
        } else {
          if (user.stages.SPECIAL_ATTACK! < 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasSpecicalAttack = false;
            for (const m of user.moves) {
              if (!m.specialMove(m.type)) continue;
              hasSpecicalAttack = true;
              break;
            }
            if (hasSpecicalAttack) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpAtk2":
        if (move.statusMove()) {
          if (user.statStageAtMax("SPECIAL_ATTACK")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.SPECIAL_ATTACK! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              let hasSpecicalAttack = false;
              for (const m of user.moves) {
                if (!m.specialMove(m.type)) continue;
                hasSpecicalAttack = true;
                break;
              }
              if (hasSpecicalAttack) {
                score += 20;
              } else if (skill >= PBTrainerAI.highSkill()) {
                score -= 90;
              }
            }
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.SPECIAL_ATTACK! < 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasSpecicalAttack = false;
            for (const m of user.moves) {
              if (!m.specialMove(m.type)) continue;
              hasSpecicalAttack = true;
              break;
            }
            if (hasSpecicalAttack) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpAtk3":
        if (move.statusMove()) {
          if (user.statStageAtMax("SPECIAL_ATTACK")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.SPECIAL_ATTACK! * 30;
            if (skill >= PBTrainerAI.mediumSkill()) {
              let hasSpecicalAttack = false;
              for (const m of user.moves) {
                if (!m.specialMove(m.type)) continue;
                hasSpecicalAttack = true;
                break;
              }
              if (hasSpecicalAttack) {
                score += 20;
              } else if (skill >= PBTrainerAI.highSkill()) {
                score -= 90;
              }
            }
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.SPECIAL_ATTACK! < 0) score += 30;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasSpecicalAttack = false;
            for (const m of user.moves) {
              if (!m.specialMove(m.type)) continue;
              hasSpecicalAttack = true;
              break;
            }
            if (hasSpecicalAttack) score += 30;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpDef1": case "RaiseUserSpDef2": case "RaiseUserSpDef3":
        if (move.statusMove()) {
          if (user.statStageAtMax("SPECIAL_DEFENSE")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.SPECIAL_DEFENSE! * 20;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.SPECIAL_DEFENSE! < 0) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpDef1PowerUpElectricMove": {
        let foundMove = false;
        for (const m of user.moves) {
          if (m.type !== "ELECTRIC" || !m.damagingMove()) continue;
          foundMove = true;
          break;
        }
        if (foundMove) score += 20;
        if (move.statusMove()) {
          if (user.statStageAtMax("SPECIAL_DEFENSE")) {
            score -= 90;
          } else {
            score -= user.stages.SPECIAL_DEFENSE! * 20;
          }
        } else if (user.stages.SPECIAL_DEFENSE! < 0) {
          score += 20;
        }
        break;
      }
      //---------------------------------------------------------------------------
      case "RaiseUserSpeed1":
        if (move.statusMove()) {
          if (user.statStageAtMax("SPEED")) {
            score -= 90;
          } else {
            score -= user.stages.SPEED! * 10;
            if (skill >= PBTrainerAI.highSkill()) {
              const aspeed = this.pbRoughStat(user, "SPEED", skill);
              const ospeed = this.pbRoughStat(target, "SPEED", skill);
              if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
            }
          }
        } else if (user.stages.SPEED! < 0) {
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpeed2": case "RaiseUserSpeed2LowerUserWeight": case "RaiseUserSpeed3":
        if (move.statusMove()) {
          if (user.statStageAtMax("SPEED")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 20;
            score -= user.stages.SPEED! * 10;
            if (skill >= PBTrainerAI.highSkill()) {
              const aspeed = this.pbRoughStat(user, "SPEED", skill);
              const ospeed = this.pbRoughStat(target, "SPEED", skill);
              if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
            }
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.SPEED! < 0) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAccuracy1": case "RaiseUserAccuracy2": case "RaiseUserAccuracy3":
        if (move.statusMove()) {
          if (user.statStageAtMax("ACCURACY")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.ACCURACY! * 20;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.ACCURACY! < 0) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserEvasion1":
        if (move.statusMove()) {
          if (user.statStageAtMax("EVASION")) {
            score -= 90;
          } else {
            score -= user.stages.EVASION! * 10;
          }
        } else if (user.stages.EVASION! < 0) {
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserEvasion2": case "RaiseUserEvasion2MinimizeUser": case "RaiseUserEvasion3":
        if (move.statusMove()) {
          if (user.statStageAtMax("EVASION")) {
            score -= 90;
          } else {
            if (user.turnCount === 0) score += 40;
            score -= user.stages.EVASION! * 10;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (user.stages.EVASION! < 0) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserCriticalHitRate2":
        if (move.statusMove()) {
          if (user.effects[PBEffects.FocusEnergy] >= 2) {
            score -= 80;
          } else {
            score += 30;
          }
        } else if (user.effects[PBEffects.FocusEnergy] < 2) {
          score += 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAtkDef1":
        if (user.statStageAtMax("ATTACK") &&
          user.statStageAtMax("DEFENSE")) {
          score -= 90;
        } else {
          score -= user.stages.ATTACK! * 10;
          score -= user.stages.DEFENSE! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
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
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAtkDefAcc1":
        if (user.statStageAtMax("ATTACK") &&
          user.statStageAtMax("DEFENSE") &&
          user.statStageAtMax("ACCURACY")) {
          score -= 90;
        } else {
          score -= user.stages.ATTACK! * 10;
          score -= user.stages.DEFENSE! * 10;
          score -= user.stages.ACCURACY! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
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
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAtkSpAtk1": case "RaiseUserAtkSpAtk1Or2InSun":
        if (user.statStageAtMax("ATTACK") &&
          user.statStageAtMax("SPECIAL_ATTACK")) {
          score -= 90;
        } else {
          score -= user.stages.ATTACK! * 10;
          score -= user.stages.SPECIAL_ATTACK! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasDamagingAttack = false;
            for (const m of user.moves) {
              if (!m.damagingMove()) continue;
              hasDamagingAttack = true;
              break;
            }
            if (hasDamagingAttack) {
              score += 20;
            } else if (skill >= PBTrainerAI.highSkill()) {
              score -= 90;
            }
          }
          if (move.function === "RaiseUserAtkSpAtk1Or2InSun") { // Growth
            if (["Sun", "HarshSun"].includes(user.effectiveWeather())) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerUserDefSpDef1RaiseUserAtkSpAtkSpd2":
        score -= user.stages.ATTACK! * 20;
        score -= user.stages.SPEED! * 20;
        score -= user.stages.SPECIAL_ATTACK! * 20;
        score += user.stages.DEFENSE! * 10;
        score += user.stages.SPECIAL_DEFENSE! * 10;
        if (skill >= PBTrainerAI.mediumSkill()) {
          let hasDamagingAttack = false;
          for (const m of user.moves) {
            if (!m.damagingMove()) continue;
            hasDamagingAttack = true;
            break;
          }
          if (hasDamagingAttack) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAtkSpd1":
        if (user.turnCount === 0) score += 40; // Dragon Dance tends to be popular
        if (user.statStageAtMax("ATTACK") &&
          user.statStageAtMax("SPEED")) {
          score -= 90;
        } else {
          score -= user.stages.ATTACK! * 10;
          score -= user.stages.SPEED! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
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
          if (skill >= PBTrainerAI.highSkill()) {
            const aspeed = this.pbRoughStat(user, "SPEED", skill);
            const ospeed = this.pbRoughStat(target, "SPEED", skill);
            if (aspeed < ospeed && aspeed * 2 > ospeed) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAtk1Spd2":
        if (user.statStageAtMax("ATTACK") &&
          user.statStageAtMax("SPEED")) {
          score -= 90;
        } else {
          score -= user.stages.ATTACK! * 10;
          score -= user.stages.SPEED! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
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
          if (skill >= PBTrainerAI.highSkill()) {
            const aspeed = this.pbRoughStat(user, "SPEED", skill);
            const ospeed = this.pbRoughStat(target, "SPEED", skill);
            if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserAtkAcc1":
        if (user.statStageAtMax("ATTACK") &&
          user.statStageAtMax("ACCURACY")) {
          score -= 90;
        } else {
          score -= user.stages.ATTACK! * 10;
          score -= user.stages.ACCURACY! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of user.moves) {
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
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserDefSpDef1":
        if (user.statStageAtMax("DEFENSE") &&
          user.statStageAtMax("SPECIAL_DEFENSE")) {
          score -= 90;
        } else {
          score -= user.stages.DEFENSE! * 10;
          score -= user.stages.SPECIAL_DEFENSE! * 10;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpAtkSpDef1":
        if (user.statStageAtMax("SPECIAL_ATTACK") &&
          user.statStageAtMax("SPECIAL_DEFENSE")) {
          score -= 90;
        } else {
          if (user.turnCount === 0) score += 40; // Calm Mind tends to be popular
          score -= user.stages.SPECIAL_ATTACK! * 10;
          score -= user.stages.SPECIAL_DEFENSE! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasSpecicalAttack = false;
            for (const m of user.moves) {
              if (!m.specialMove(m.type)) continue;
              hasSpecicalAttack = true;
              break;
            }
            if (hasSpecicalAttack) {
              score += 20;
            } else if (skill >= PBTrainerAI.highSkill()) {
              score -= 90;
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserSpAtkSpDefSpd1":
        if (user.statStageAtMax("SPEED") &&
          user.statStageAtMax("SPECIAL_ATTACK") &&
          user.statStageAtMax("SPECIAL_DEFENSE")) {
          score -= 90;
        } else {
          score -= user.stages.SPECIAL_ATTACK! * 10;
          score -= user.stages.SPECIAL_DEFENSE! * 10;
          score -= user.stages.SPEED! * 10;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasSpecicalAttack = false;
            for (const m of user.moves) {
              if (!m.specialMove(m.type)) continue;
              hasSpecicalAttack = true;
              break;
            }
            if (hasSpecicalAttack) {
              score += 20;
            } else if (skill >= PBTrainerAI.highSkill()) {
              score -= 90;
            }
          }
          if (skill >= PBTrainerAI.highSkill()) {
            const aspeed = this.pbRoughStat(user, "SPEED", skill);
            const ospeed = this.pbRoughStat(target, "SPEED", skill);
            if (aspeed < ospeed && aspeed * 2 > ospeed) {
              score += 20;
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserMainStats1":
        for (const s of Stat.eachMainBattle()) if (user.stages[s.id]! < 0) score += 10;
        if (skill >= PBTrainerAI.mediumSkill()) {
          let hasDamagingAttack = false;
          for (const m of user.moves) {
            if (!m.damagingMove()) continue;
            hasDamagingAttack = true;
            break;
          }
          if (hasDamagingAttack) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserMainStats1LoseThirdOfTotalHP":
        if (user.hp <= rubyDiv(user.totalhp, 2)) {
          score -= 100;
        } else if (user.hasActiveAbility("CONTRARY")) {
          score -= 100;
        } else {
          let statsMaxed = true;
          for (const s of Stat.eachMainBattle()) {
            if (user.statStageAtMax(s.id)) continue;
            statsMaxed = false;
            break;
          }
          if (statsMaxed) {
            score -= 100;
          } else {
            if (skill >= PBTrainerAI.highSkill() && user.hp >= user.totalhp * 0.75) {
              score += 30;
            }
            for (const s of Stat.eachMainBattle()) if (user.stages[s.id]! <= 0) score += 10;
            if (skill >= PBTrainerAI.mediumSkill()) {
              const hasDamagingAttack = user.moves.some((m) => m != null && m.damagingMove());
              if (hasDamagingAttack) score += 20;
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseUserMainStats1TrapUserInBattle":
        if (truthy(user.effects[PBEffects.NoRetreat])) {
          score -= 100;
        } else if (user.hasActiveAbility("CONTRARY")) {
          score -= 100;
        } else {
          let statsMaxed = true;
          for (const s of Stat.eachMainBattle()) {
            if (user.statStageAtMax(s.id)) continue;
            statsMaxed = false;
            break;
          }
          if (statsMaxed) {
            score -= 100;
          } else {
            if (skill >= PBTrainerAI.highSkill()) {
              if (user.hp <= rubyDiv(user.totalhp, 2)) score -= 50;
              if (user.trappedInBattle()) score += 30;
            }
            for (const s of Stat.eachMainBattle()) if (user.stages[s.id]! <= 0) score += 10;
            if (skill >= PBTrainerAI.mediumSkill()) {
              const hasDamagingAttack = user.moves.some((m) => m != null && m.damagingMove());
              if (hasDamagingAttack) score += 20;
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "StartRaiseUserAtk1WhenDamaged":
        if (truthy(user.effects[PBEffects.Rage])) score += 25;
        break;
      //---------------------------------------------------------------------------
      case "LowerUserAttack1": case "LowerUserAttack2":
        score += user.stages.ATTACK! * 10;
        break;
      //---------------------------------------------------------------------------
      case "LowerUserDefense1": case "LowerUserDefense2":
        score += user.stages.DEFENSE! * 10;
        break;
      //---------------------------------------------------------------------------
      case "LowerUserSpAtk1": case "LowerUserSpAtk2":
        score += user.stages.SPECIAL_ATTACK! * 10;
        break;
      //---------------------------------------------------------------------------
      case "LowerUserSpDef1": case "LowerUserSpDef2":
        score += user.stages.SPECIAL_DEFENSE! * 10;
        break;
      //---------------------------------------------------------------------------
      case "LowerUserSpeed1": case "LowerUserSpeed2":
        score += user.stages.SPEED! * 10;
        break;
      //---------------------------------------------------------------------------
      case "LowerUserAtkDef1": {
        let avg = user.stages.ATTACK! * 10;
        avg += user.stages.DEFENSE! * 10;
        score += rubyDiv(avg, 2);
        break;
      }
      //---------------------------------------------------------------------------
      case "LowerUserDefSpDef1": {
        let avg = user.stages.DEFENSE! * 10;
        avg += user.stages.SPECIAL_DEFENSE! * 10;
        score += rubyDiv(avg, 2);
        break;
      }
      //---------------------------------------------------------------------------
      case "LowerUserDefSpDefSpd1": {
        let avg = user.stages.DEFENSE! * 10;
        avg += user.stages.SPEED! * 10;
        avg += user.stages.SPECIAL_DEFENSE! * 10;
        score += rubyDiv(avg, 3); // (avg / 3).floor: Integer division already floors
        break;
      }
      //---------------------------------------------------------------------------
      case "RaiseTargetAttack1":
        break;
      //---------------------------------------------------------------------------
      case "RaiseTargetAttack2ConfuseTarget":
        if (!target.pbCanConfuse(user, false)) {
          score -= 90;
        } else if (target.stages.ATTACK! < 0) {
          score += 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseTargetSpAtk1ConfuseTarget":
        if (!target.pbCanConfuse(user, false)) {
          score -= 90;
        } else if (target.stages.SPECIAL_ATTACK! < 0) {
          score += 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseTargetSpDef1":
        if (target.statStageAtMax("SPECIAL_DEFENSE")) {
          score -= 90;
        } else {
          score -= target.stages.SPECIAL_DEFENSE! * 10;
        }
        break;
      //---------------------------------------------------------------------------
      case "RaiseTargetRandomStat2": {
        let avgStat = 0;
        let canChangeStat = false;
        for (const s of Stat.eachBattle()) {
          if (target.statStageAtMax(s.id)) continue;
          avgStat -= target.stages[s.id]!;
          canChangeStat = true;
        }
        if (canChangeStat) {
          if (avgStat < 0) avgStat = rubyDiv(avgStat, 2); // More chance of getting even better
          score += avgStat * 10;
        } else {
          score -= 90;
        }
        break;
      }
      //---------------------------------------------------------------------------
      case "RaiseTargetAtkSpAtk2":
        if (target.opposes(user)) {
          score -= 100;
        } else if (skill >= PBTrainerAI.mediumSkill() && target.hasActiveAbility("CONTRARY")) {
          score -= 90;
        } else {
          score -= target.stages.ATTACK! * 20;
          score -= target.stages.SPECIAL_ATTACK! * 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetAttack1":
        if (move.statusMove()) {
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
          } else {
            score -= 90;
          }
        } else {
          if (target.stages.ATTACK! > 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of target.moves) {
              if (!m.physicalMove(m.type)) continue;
              hasPhysicalAttack = true;
              break;
            }
            if (hasPhysicalAttack) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetAttack1BypassSubstitute":
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
        } else {
          score -= 90;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetAttack2": case "LowerTargetAttack3":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("ATTACK", user)) {
            if (user.turnCount === 0) score += 40;
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
          } else {
            score -= 90;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (target.stages.ATTACK! > 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasPhysicalAttack = false;
            for (const m of target.moves) {
              if (!m.physicalMove(m.type)) continue;
              hasPhysicalAttack = true;
              break;
            }
            if (hasPhysicalAttack) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetDefense1":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("DEFENSE", user)) {
            score += target.stages.DEFENSE! * 20;
          } else {
            score -= 90;
          }
        } else if (target.stages.DEFENSE! > 0) {
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetDefense1PowersUpInGravity":
        if (await target.pbCanLowerStatStage("DEFENSE", user)) {
          score += 20;
          score += target.stages.DEFENSE! * 20;
        } else {
          score -= 90;
        }
        if (this.battle.field.effects[PBEffects.Gravity] > 0) score += 30;
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetDefense2": case "LowerTargetDefense3":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("DEFENSE", user)) {
            if (user.turnCount === 0) score += 40;
            score += target.stages.DEFENSE! * 20;
          } else {
            score -= 90;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (target.stages.DEFENSE! > 0) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpAtk1":
        // Ruby bug: both branches score the user's Special Attack stage, not the target's
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("SPECIAL_ATTACK", user)) {
            score += user.stages.SPECIAL_ATTACK! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              let hasSpecicalAttack = false;
              for (const m of target.moves) {
                if (!m.specialMove(m.type)) continue;
                hasSpecicalAttack = true;
                break;
              }
              if (hasSpecicalAttack) {
                score += 20;
              } else if (skill >= PBTrainerAI.highSkill()) {
                score -= 90;
              }
            }
          } else {
            score -= 90;
          }
        } else {
          if (user.stages.SPECIAL_ATTACK! > 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasSpecicalAttack = false;
            for (const m of target.moves) {
              if (!m.specialMove(m.type)) continue;
              hasSpecicalAttack = true;
              break;
            }
            if (hasSpecicalAttack) score += 20;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpAtk2":
        if (await target.pbCanLowerStatStage("SPECIAL_ATTACK", user)) {
          if (user.turnCount === 0) score += 40;
          score += target.stages.SPECIAL_ATTACK! * 20;
        } else {
          score -= 90;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpAtk2IfCanAttract":
        if (user.gender() === 2 || target.gender() === 2 || user.gender() === target.gender() ||
          target.hasActiveAbility("OBLIVIOUS")) {
          score -= 90;
        } else if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("SPECIAL_ATTACK", user)) {
            if (user.turnCount === 0) score += 40;
            score += target.stages.SPECIAL_ATTACK! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              let hasSpecicalAttack = false;
              for (const m of target.moves) {
                if (!m.specialMove(m.type)) continue;
                hasSpecicalAttack = true;
                break;
              }
              if (hasSpecicalAttack) {
                score += 20;
              } else if (skill >= PBTrainerAI.highSkill()) {
                score -= 90;
              }
            }
          } else {
            score -= 90;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (target.stages.SPECIAL_ATTACK! > 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            let hasSpecicalAttack = false;
            for (const m of target.moves) {
              if (!m.specialMove(m.type)) continue;
              hasSpecicalAttack = true;
              break;
            }
            if (hasSpecicalAttack) score += 30;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpAtk3":
        if (await target.pbCanLowerStatStage("SPECIAL_ATTACK", user)) {
          if (user.turnCount === 0) score += 40;
          score += target.stages.SPECIAL_ATTACK! * 20;
        } else {
          score -= 90;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpDef1":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("SPECIAL_DEFENSE", user)) {
            score += target.stages.SPECIAL_DEFENSE! * 20;
          } else {
            score -= 90;
          }
        } else if (target.stages.SPECIAL_DEFENSE! > 0) {
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpDef2": case "LowerTargetSpDef3":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("SPECIAL_DEFENSE", user)) {
            if (user.turnCount === 0) score += 40;
            score += target.stages.SPECIAL_DEFENSE! * 20;
          } else {
            score -= 90;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (target.stages.SPECIAL_DEFENSE! > 0) score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpeed1": case "LowerTargetSpeed1WeakerInGrassyTerrain":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("SPEED", user)) {
            score += target.stages.SPEED! * 10;
            if (skill >= PBTrainerAI.highSkill()) {
              const aspeed = this.pbRoughStat(user, "SPEED", skill);
              const ospeed = this.pbRoughStat(target, "SPEED", skill);
              if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
            }
          } else {
            score -= 90;
          }
        } else if (user.stages.SPEED! > 0) { // Ruby bug: the user's Speed stage, not the target's
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpeed1MakeTargetWeakerToFire":
        if (!(await target.pbCanLowerStatStage("SPEED", user)) && truthy(target.effects[PBEffects.TarShot])) {
          score -= 100;
        } else {
          score += target.stages.SPEED! * 10;
          if (skill >= PBTrainerAI.highSkill()) {
            const aspeed = this.pbRoughStat(user, "SPEED", skill);
            const ospeed = this.pbRoughStat(target, "SPEED", skill);
            if (aspeed < ospeed && aspeed * 2 > ospeed) score += 50;
          }
        }
        if (user.moves.some((m) => m.damagingMove() && m.pbCalcType(user) === "FIRE")) score += 20;
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetSpeed2": case "LowerTargetSpeed3":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("SPEED", user)) {
            if (user.turnCount === 0) score += 20;
            score += target.stages.SPEED! * 20;
            if (skill >= PBTrainerAI.highSkill()) {
              const aspeed = this.pbRoughStat(user, "SPEED", skill);
              const ospeed = this.pbRoughStat(target, "SPEED", skill);
              if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
            }
          } else {
            score -= 90;
          }
        } else {
          if (user.turnCount === 0) score += 10;
          if (target.stages.SPEED! > 0) score += 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetAccuracy1": case "LowerTargetAccuracy2": case "LowerTargetAccuracy3":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("ACCURACY", user)) {
            score += target.stages.ACCURACY! * 10;
          } else {
            score -= 90;
          }
        } else if (target.stages.ACCURACY! > 0) {
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetEvasion1":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("EVASION", user)) {
            score += target.stages.EVASION! * 10;
          } else {
            score -= 90;
          }
        } else if (target.stages.EVASION! > 0) {
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetEvasion1RemoveSideEffects":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("EVASION", user)) {
            score += target.stages.EVASION! * 10;
          } else {
            score -= 90;
          }
        } else if (target.stages.EVASION! > 0) {
          score += 20;
        }
        if (target.pbOwnSide().effects[PBEffects.AuroraVeil] > 0 ||
          target.pbOwnSide().effects[PBEffects.Reflect] > 0 ||
          target.pbOwnSide().effects[PBEffects.LightScreen] > 0 ||
          target.pbOwnSide().effects[PBEffects.Mist] > 0 ||
          target.pbOwnSide().effects[PBEffects.Safeguard] > 0) score += 30;
        if (target.pbOwnSide().effects[PBEffects.Spikes] > 0 ||
          target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0 ||
          truthy(target.pbOwnSide().effects[PBEffects.StealthRock])) score -= 30;
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetEvasion2": case "LowerTargetEvasion3":
        if (move.statusMove()) {
          if (await target.pbCanLowerStatStage("EVASION", user)) {
            score += target.stages.EVASION! * 10;
          } else {
            score -= 90;
          }
        } else if (target.stages.EVASION! > 0) {
          score += 20;
        }
        break;
      //---------------------------------------------------------------------------
      case "LowerTargetAtkDef1": {
        let avg = target.stages.ATTACK! * 10;
        avg += target.stages.DEFENSE! * 10;
        score += rubyDiv(avg, 2);
        break;
      }
      //---------------------------------------------------------------------------
      case "LowerTargetAtkSpAtk1": {
        let avg = target.stages.ATTACK! * 10;
        avg += target.stages.SPECIAL_ATTACK! * 10;
        score += rubyDiv(avg, 2);
        break;
      }
      //---------------------------------------------------------------------------
      case "LowerPoisonedTargetAtkSpAtkSpd1": {
        let count = 0;
        for (const b of this.battle.allBattlers()) {
          if (b.poisoned() &&
            (!b.statStageAtMin("ATTACK") ||
              !b.statStageAtMin("SPECIAL_ATTACK") ||
              !b.statStageAtMin("SPEED"))) {
            count += 1;
            if (user.opposes(b)) {
              // Ruby bug: the user's stages, not b's
              score += user.stages.ATTACK! * 10;
              score += user.stages.SPECIAL_ATTACK! * 10;
              score += user.stages.SPEED! * 10;
            } else {
              score -= 20;
            }
          }
        }
        if (count === 0) score -= 95;
        break;
      }
      //---------------------------------------------------------------------------
      case "RaiseUserAndAlliesAtkDef1": {
        // Ruby bug: checks whether each ally's Attack/Sp. Atk can be *lowered*
        // and scores Sp. Atk instead of Defense
        let hasAlly = false;
        for (const b of user.allAllies()) {
          if (!(await b.pbCanLowerStatStage("ATTACK", user)) &&
            !(await b.pbCanLowerStatStage("SPECIAL_ATTACK", user))) continue;
          hasAlly = true;
          if (skill >= PBTrainerAI.mediumSkill() && b.hasActiveAbility("CONTRARY")) {
            score -= 90;
          } else {
            score += 40;
            score -= b.stages.ATTACK! * 20;
            score -= b.stages.SPECIAL_ATTACK! * 20;
          }
        }
        if (!hasAlly) score = 0;
        break;
      }
      //---------------------------------------------------------------------------
      case "RaisePlusMinusUserAndAlliesAtkSpAtk1": {
        let hasEffect = user.statStageAtMax("ATTACK") &&
          user.statStageAtMax("SPECIAL_ATTACK");
        for (const b of user.allAllies()) {
          if (b.statStageAtMax("ATTACK") && b.statStageAtMax("SPECIAL_ATTACK")) continue;
          hasEffect = true;
          score -= b.stages.ATTACK! * 10;
          score -= b.stages.SPECIAL_ATTACK! * 10;
        }
        if (hasEffect) {
          score -= user.stages.ATTACK! * 10;
          score -= user.stages.SPECIAL_ATTACK! * 10;
        } else {
          score -= 90;
        }
        break;
      }
      //---------------------------------------------------------------------------
      case "RaisePlusMinusUserAndAlliesDefSpDef1": {
        let hasEffect = user.statStageAtMax("DEFENSE") &&
          user.statStageAtMax("SPECIAL_DEFENSE");
        for (const b of user.allAllies()) {
          if (b.statStageAtMax("DEFENSE") && b.statStageAtMax("SPECIAL_DEFENSE")) continue;
          hasEffect = true;
          score -= b.stages.DEFENSE! * 10;
          score -= b.stages.SPECIAL_DEFENSE! * 10;
        }
        if (hasEffect) {
          score -= user.stages.DEFENSE! * 10;
          score -= user.stages.SPECIAL_DEFENSE! * 10;
        } else {
          score -= 90;
        }
        break;
      }
      //---------------------------------------------------------------------------
      case "RaiseGroundedGrassBattlersAtkSpAtk1": {
        let count = 0;
        for (const b of this.battle.allBattlers()) {
          if (b.pbHasType("GRASS") && !b.airborne() &&
            (!b.statStageAtMax("ATTACK") || !b.statStageAtMax("SPECIAL_ATTACK"))) {
            count += 1;
            if (user.opposes(b)) {
              score -= 20;
            } else {
              // Ruby bug: the user's stages, not b's
              score -= user.stages.ATTACK! * 10;
              score -= user.stages.SPECIAL_ATTACK! * 10;
            }
          }
        }
        if (count === 0) score -= 95;
        break;
      }
      //---------------------------------------------------------------------------
      case "RaiseGrassBattlersDef1": {
        let count = 0;
        for (const b of this.battle.allBattlers()) {
          if (b.pbHasType("GRASS") && !b.statStageAtMax("DEFENSE")) {
            count += 1;
            if (user.opposes(b)) {
              score -= 20;
            } else {
              score -= user.stages.DEFENSE! * 10; // Ruby bug: the user's stage, not b's
            }
          }
        }
        if (count === 0) score -= 95;
        break;
      }
      //---------------------------------------------------------------------------
      case "UserTargetSwapAtkSpAtkStages":
        if (skill >= PBTrainerAI.mediumSkill()) {
          const aatk = user.stages.ATTACK!;
          const aspa = user.stages.SPECIAL_ATTACK!;
          const oatk = target.stages.ATTACK!;
          const ospa = target.stages.SPECIAL_ATTACK!;
          if (aatk >= oatk && aspa >= ospa) {
            score -= 80;
          } else {
            score += (oatk - aatk) * 10;
            score += (ospa - aspa) * 10;
          }
        } else {
          score -= 50;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserTargetSwapDefSpDefStages":
        if (skill >= PBTrainerAI.mediumSkill()) {
          const adef = user.stages.DEFENSE!;
          const aspd = user.stages.SPECIAL_DEFENSE!;
          const odef = target.stages.DEFENSE!;
          const ospd = target.stages.SPECIAL_DEFENSE!;
          if (adef >= odef && aspd >= ospd) {
            score -= 80;
          } else {
            score += (odef - adef) * 10;
            score += (ospd - aspd) * 10;
          }
        } else {
          score -= 50;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserTargetSwapStatStages":
        if (skill >= PBTrainerAI.mediumSkill()) {
          let userStages = 0;
          let targetStages = 0;
          for (const s of Stat.eachBattle()) {
            userStages += user.stages[s.id]!;
            targetStages += target.stages[s.id]!;
          }
          score += (targetStages - userStages) * 10;
        } else {
          score -= 50;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserCopyTargetStatStages":
        if (skill >= PBTrainerAI.mediumSkill()) {
          let equal = true;
          for (const s of Stat.eachBattle()) {
            const stagediff = target.stages[s.id]! - user.stages[s.id]!;
            score += stagediff * 10;
            if (stagediff !== 0) equal = false;
          }
          if (equal) score -= 80;
        } else {
          score -= 50;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserStealTargetPositiveStatStages": {
        let numStages = 0;
        for (const s of Stat.eachBattle()) {
          if (target.stages[s.id]! <= 0) continue;
          numStages += target.stages[s.id]!;
        }
        score += numStages * 20;
        break;
      }
      //---------------------------------------------------------------------------
      case "InvertTargetStatStages":
        if (target.effects[PBEffects.Substitute] > 0) {
          score -= 90;
        } else {
          let numpos = 0;
          let numneg = 0;
          for (const s of Stat.eachBattle()) {
            if (target.stages[s.id]! > 0) numpos += target.stages[s.id]!;
            if (target.stages[s.id]! < 0) numneg += target.stages[s.id]!;
          }
          if (numpos !== 0 || numneg !== 0) {
            score += (numpos - numneg) * 10;
          } else {
            score -= 95;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "ResetTargetStatStages":
        if (target.effects[PBEffects.Substitute] > 0) {
          score -= 90;
        } else {
          let avg = 0;
          let anyChange = false;
          for (const s of Stat.eachBattle()) {
            if (target.stages[s.id] === 0) continue;
            avg += target.stages[s.id]!;
            anyChange = true;
          }
          if (anyChange) {
            score += avg * 10;
          } else {
            score -= 90;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "ResetAllBattlersStatStages":
        if (skill >= PBTrainerAI.mediumSkill()) {
          let stages = 0;
          for (const b of this.battle.allBattlers()) {
            let totalStages = 0;
            for (const s of Stat.eachBattle()) totalStages += b.stages[s.id]!;
            if (b.opposes(user)) {
              stages += totalStages;
            } else {
              stages -= totalStages;
            }
          }
          score += stages * 10;
        }
        break;
      //---------------------------------------------------------------------------
      case "StartUserSideImmunityToStatStageLowering":
        if (user.pbOwnSide().effects[PBEffects.Mist] > 0) score -= 80;
        break;
      //---------------------------------------------------------------------------
      case "UserSwapBaseAtkDef":
        if (skill >= PBTrainerAI.mediumSkill()) {
          const aatk = this.pbRoughStat(user, "ATTACK", skill);
          const adef = this.pbRoughStat(user, "DEFENSE", skill);
          if (aatk === adef ||
            truthy(user.effects[PBEffects.PowerTrick])) { // No flip-flopping
            score -= 90;
          } else if (adef > aatk) { // Prefer a higher Attack
            score += 30;
          } else {
            score -= 30;
          }
        } else {
          score -= 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserTargetSwapBaseSpeed":
        if (skill >= PBTrainerAI.mediumSkill()) {
          if (user.speed > target.speed) {
            score += 50;
          } else {
            score -= 70;
          }
        }
        break;
      //---------------------------------------------------------------------------
      case "UserTargetAverageBaseAtkSpAtk":
        if (skill >= PBTrainerAI.mediumSkill()) {
          const aatk = this.pbRoughStat(user, "ATTACK", skill);
          const aspatk = this.pbRoughStat(user, "SPECIAL_ATTACK", skill);
          const oatk = this.pbRoughStat(target, "ATTACK", skill);
          const ospatk = this.pbRoughStat(target, "SPECIAL_ATTACK", skill);
          if (aatk < oatk && aspatk < ospatk) {
            score += 50;
          } else if (aatk + aspatk < oatk + ospatk) {
            score += 30;
          } else {
            score -= 50;
          }
        } else {
          score -= 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserTargetAverageBaseDefSpDef":
        if (skill >= PBTrainerAI.mediumSkill()) {
          const adef = this.pbRoughStat(user, "DEFENSE", skill);
          const aspdef = this.pbRoughStat(user, "SPECIAL_DEFENSE", skill);
          const odef = this.pbRoughStat(target, "DEFENSE", skill);
          const ospdef = this.pbRoughStat(target, "SPECIAL_DEFENSE", skill);
          if (adef < odef && aspdef < ospdef) {
            score += 50;
          } else if (adef + aspdef < odef + ospdef) {
            score += 30;
          } else {
            score -= 50;
          }
        } else {
          score -= 30;
        }
        break;
      //---------------------------------------------------------------------------
      case "UserTargetAverageHP":
        if (target.effects[PBEffects.Substitute] > 0) {
          score -= 90;
        } else if (user.hp >= rubyDiv(user.hp + target.hp, 2)) {
          score -= 90;
        } else {
          score += 40;
        }
        break;
      //---------------------------------------------------------------------------
      case "StartUserSideDoubleSpeed":
        if (user.pbOwnSide().effects[PBEffects.Tailwind] > 0) score -= 90;
        break;
      //---------------------------------------------------------------------------
      case "StartSwapAllBattlersBaseDefensiveStats":
        break;
      //---------------------------------------------------------------------------
    }
    return score;
  },
};

type Methods = typeof methods;
declare module "./Battle_AI" {
  interface AI extends Methods {}
}
Object.assign(AI.prototype, methods);
