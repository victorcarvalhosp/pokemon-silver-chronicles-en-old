// Port of Data/Scripts/011_Battle/005_AI/006_AI_Move_EffectScores_2.rb: the
// second part of pbGetMoveScoreFunctionCode; other function codes fall through
// to the first part (alias aiEffectScorePart1_pbGetMoveScoreFunctionCode).
//
// Async: only because the battler's pbCanLowerStatStage is async (see
// Battler_StatStages.ts); everything else here is sync.

import type { Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness, Type } from "../../data/gameData/type";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { rubyDiv } from "../rubyMath";
import { AI, PBTrainerAI } from "./Battle_AI";
import "./AI_Move_EffectScores_1"; // the method this part wraps (type declaration + load order)

const aiEffectScorePart1_pbGetMoveScoreFunctionCode = AI.prototype.pbGetMoveScoreFunctionCode;

/** Get a score for the given move based on its effect */
AI.prototype.pbGetMoveScoreFunctionCode = async function (this: AI, score: number, move: Move, user: Battler,
  target: Battler, skill = 100): Promise<number> {
  switch (move.function) {
    //---------------------------------------------------------------------------
    case "SleepTarget":
    case "SleepTargetIfUserDarkrai":
    case "SleepTargetChangeUserMeloettaForm":
      if (target.pbCanSleep(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.mediumSkill()) {
          if (target.effects[PBEffects.Yawn] > 0) score -= 30;
        }
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility("MARVELSCALE")) score -= 30;
        }
        if (skill >= PBTrainerAI.bestSkill()) {
          if (target.pbHasMoveFunction("FlinchTargetFailsIfUserNotAsleep",
            "UseRandomUserMoveIfAsleep")) { // Snore, Sleep Talk
            score -= 50;
          }
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "SleepTargetNextTurn":
      if (target.effects[PBEffects.Yawn] > 0 || !target.pbCanSleep(user, false)) {
        if (skill >= PBTrainerAI.mediumSkill()) score -= 90;
      } else {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility("MARVELSCALE")) score -= 30;
        }
        if (skill >= PBTrainerAI.bestSkill()) {
          if (target.pbHasMoveFunction("FlinchTargetFailsIfUserNotAsleep",
            "UseRandomUserMoveIfAsleep")) { // Snore, Sleep Talk
            score -= 50;
          }
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "PoisonTarget":
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
    case "PoisonTargetLowerTargetSpeed1":
      if (!target.pbCanPoison(user, false) && !(await target.pbCanLowerStatStage("SPEED", user))) {
        score -= 90;
      } else {
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
        }
        if (await target.pbCanLowerStatStage("SPEED", user)) {
          score += target.stages.SPEED! * 10;
          if (skill >= PBTrainerAI.highSkill()) {
            const aspeed = this.pbRoughStat(user, "SPEED", skill);
            const ospeed = this.pbRoughStat(target, "SPEED", skill);
            if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
          }
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "BadPoisonTarget":
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
    case "ParalyzeTarget":
    case "ParalyzeTargetIfNotTypeImmune":
    case "ParalyzeTargetAlwaysHitsInRainHitsTargetInSky":
    case "ParalyzeFlinchTarget":
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
    case "BurnTarget":
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
    case "BurnTargetIfTargetStatsRaisedThisTurn":
      if (target.pbCanBurn(user, false)) {
        score += 40;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET", "FLAREBOOST"])) score -= 40;
        }
      } else {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "BurnFlinchTarget":
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
    case "FreezeTarget":
      if (target.pbCanFreeze(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility("MARVELSCALE")) score -= 20;
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "FreezeTargetSuperEffectiveAgainstWater":
      if (target.pbCanFreeze(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility("MARVELSCALE")) score -= 20;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "FreezeTargetAlwaysHitsInHail":
    case "FreezeFlinchTarget":
      if (target.pbCanFreeze(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility("MARVELSCALE")) score -= 20;
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "ParalyzeBurnOrFreezeTarget":
      if (target.status === "NONE") score += 30;
      break;
    //---------------------------------------------------------------------------
    case "GiveUserStatusToTarget":
      if (user.status === "NONE") {
        score -= 90;
      } else {
        score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "CureUserBurnPoisonParalysis":
      switch (user.status) {
        case "POISON":
          score += 40;
          if (skill >= PBTrainerAI.mediumSkill()) {
            if (user.hp < rubyDiv(user.totalhp, 8)) {
              score += 60;
            } else if (skill >= PBTrainerAI.highSkill() &&
              user.hp < rubyDiv((user.effects[PBEffects.Toxic] + 1) * user.totalhp, 16)) {
              score += 60;
            }
          }
          break;
        case "BURN":
        case "PARALYSIS":
          score += 40;
          break;
        default:
          score -= 90;
          break;
      }
      break;
    //---------------------------------------------------------------------------
    case "CureUserPartyStatus": {
      let statuses = 0;
      for (const pkmn of this.battle.pbParty(user.index)) {
        if (pkmn && pkmn.status !== "NONE") statuses += 1;
      }
      if (statuses === 0) {
        score -= 80;
      } else {
        score += 20 * statuses;
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "CureTargetBurn":
      if (target.opposes(user)) {
        if (target.status === "BURN") score -= 40;
      } else if (target.status === "BURN") {
        score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartUserSideImmunityToInflictedStatus":
      if (user.pbOwnSide().effects[PBEffects.Safeguard] > 0) {
        score -= 80;
      } else if (user.status !== "NONE") {
        score -= 40;
      } else {
        score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "FlinchTarget":
      score += 30;
      if (skill >= PBTrainerAI.highSkill()) {
        if (!target.hasActiveAbility("INNERFOCUS") &&
          target.effects[PBEffects.Substitute] === 0) score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "FlinchTargetFailsIfUserNotAsleep":
      if (user.asleep()) {
        score += 100; // Because it can only be used while asleep
        if (skill >= PBTrainerAI.highSkill()) {
          if (!target.hasActiveAbility("INNERFOCUS") &&
            target.effects[PBEffects.Substitute] === 0) score += 30;
        }
      } else {
        score -= 90; // Because it will fail here
        if (skill >= PBTrainerAI.bestSkill()) score = 0;
      }
      break;
    //---------------------------------------------------------------------------
    case "FlinchTargetFailsIfNotUserFirstTurn":
      if (user.turnCount === 0) {
        if (skill >= PBTrainerAI.highSkill()) {
          if (!target.hasActiveAbility("INNERFOCUS") &&
            target.effects[PBEffects.Substitute] === 0) score += 30;
        }
      } else {
        score -= 90; // Because it will fail here
        if (skill >= PBTrainerAI.bestSkill()) score = 0;
      }
      break;
    //---------------------------------------------------------------------------
    case "FlinchTargetDoublePowerIfTargetInSky":
      if (skill >= PBTrainerAI.highSkill()) {
        if (!target.hasActiveAbility("INNERFOCUS") &&
          target.effects[PBEffects.Substitute] === 0) score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "ConfuseTarget":
    case "ConfuseTargetAlwaysHitsInRainHitsTargetInSky":
      if (target.pbCanConfuse(user, false)) {
        score += 30;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "AttractTarget": {
      let canattract = true;
      const agender = user.gender();
      const ogender = target.gender();
      if (agender === 2 || ogender === 2 || agender === ogender) {
        score -= 90;
        canattract = false;
      } else if (target.effects[PBEffects.Attract] >= 0) {
        score -= 80;
        canattract = false;
      } else if (skill >= PBTrainerAI.bestSkill() && target.hasActiveAbility("OBLIVIOUS")) {
        score -= 80;
        canattract = false;
      }
      if (skill >= PBTrainerAI.highSkill()) {
        if (canattract && target.hasActiveItem("DESTINYKNOT") &&
          user.pbCanAttract(target, false)) {
          score -= 30;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "SetUserTypesBasedOnEnvironment":
      if (!user.canChangeType()) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        let newType: Id | null = null;
        switch (this.battle.field.terrain) {
          case "Electric":
            if (Type.exists("ELECTRIC")) newType = "ELECTRIC";
            break;
          case "Grassy":
            if (Type.exists("GRASS")) newType = "GRASS";
            break;
          case "Misty":
            if (Type.exists("FAIRY")) newType = "FAIRY";
            break;
          case "Psychic":
            if (Type.exists("PSYCHIC")) newType = "PSYCHIC";
            break;
        }
        if (!newType) {
          const envtypes: Record<string, Id> = {
            None:        "NORMAL",
            Grass:       "GRASS",
            TallGrass:   "GRASS",
            MovingWater: "WATER",
            StillWater:  "WATER",
            Puddle:      "WATER",
            Underwater:  "WATER",
            Cave:        "ROCK",
            Rock:        "GROUND",
            Sand:        "GROUND",
            Forest:      "BUG",
            ForestGrass: "BUG",
            Snow:        "ICE",
            Ice:         "ICE",
            Volcano:     "FIRE",
            Graveyard:   "GHOST",
            Sky:         "FLYING",
            Space:       "DRAGON",
            UltraSpace:  "PSYCHIC",
          };
          newType = envtypes[this.battle.environment] ?? null;
          if (!Type.exists(newType)) newType = null;
          newType ??= "NORMAL";
        }
        if (!user.pbHasOtherType(newType)) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "SetUserTypesToResistLastAttack":
      if (!user.canChangeType()) {
        score -= 90;
      } else if (!target.lastMoveUsed || !target.lastMoveUsedType ||
        Type.get(target.lastMoveUsedType).pseudoType) {
        score -= 90;
      } else {
        let aType: Id | null = null;
        for (const m of target.moves) {
          if (m.id !== target.lastMoveUsed) continue;
          aType = m.pbCalcType(user);
          break;
        }
        if (aType) {
          let hasPossibleType = false;
          for (const t of Type.each()) {
            if (t.pseudoType || user.pbHasType(t.id) ||
              !Effectiveness.resistantType(target.lastMoveUsedType, t.id)) continue;
            hasPossibleType = true;
            break;
          }
          if (!hasPossibleType) score -= 90;
        } else {
          score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "SetUserTypesToTargetTypes": {
      if (!user.canChangeType() || target.pbTypes(true).length === 0) {
        score -= 90;
      } else {
        // Ruby: Array#== (element-wise)
        const userTypes = user.pbTypes();
        const targetTypes = target.pbTypes();
        if (userTypes.length === targetTypes.length && userTypes.every((t, i) => t === targetTypes[i]) &&
          user.effects[PBEffects.Type3] === target.effects[PBEffects.Type3]) {
          score -= 90;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "SetUserTypesToUserMoveType":
      if (user.canChangeType()) {
        let hasPossibleType = false;
        for (let i = 0; i < user.moves.length; i++) {
          const m = user.moves[i]!;
          if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && i > 0) break;
          if (Type.get(m.type!).pseudoType) continue;
          if (user.pbHasType(m.type)) continue;
          hasPossibleType = true;
          break;
        }
        if (!hasPossibleType) score -= 90;
      } else {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "SetTargetTypesToPsychic":
      if (target.pbHasOtherType("PSYCHIC")) {
        score -= 90;
      } else if (!target.canChangeType()) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "SetTargetTypesToWater":
      if (target.effects[PBEffects.Substitute] > 0 || !target.canChangeType()) {
        score -= 90;
      } else if (!target.pbHasOtherType("WATER")) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "AddGhostTypeToTarget":
      if (target.pbHasType("GHOST")) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "AddGrassTypeToTarget":
      if (target.pbHasType("GRASS")) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "UserLosesFireType":
      if (!user.pbHasType("FIRE")) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "SetTargetAbilityToSimple":
      if (target.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (target.unstoppableAbility() ||
          false) { // Ruby: `[:TRUANT, :SIMPLE].include?(target.ability)`, always false (Symbol#== with a GameData object)
          score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "SetTargetAbilityToInsomnia":
      if (target.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (target.unstoppableAbility() || ["TRUANT", "INSOMNIA"].includes(target.abilityId!)) {
          score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "SetUserAbilityToTargetAbility":
      score -= 40; // don't prefer this move
      if (skill >= PBTrainerAI.mediumSkill()) {
        if (!target.ability || user.abilityId === target.abilityId ||
          ["MULTITYPE", "RKSSYSTEM"].includes(user.abilityId!) ||
          ["FLOWERGIFT", "FORECAST", "ILLUSION", "IMPOSTER", "MULTITYPE", "RKSSYSTEM",
            "TRACE", "WONDERGUARD", "ZENMODE"].includes(target.abilityId!)) {
          score -= 90;
        }
      }
      if (skill >= PBTrainerAI.highSkill()) {
        if (target.abilityId === "TRUANT" && user.opposes(target)) {
          score -= 90;
        } else if (target.abilityId === "SLOWSTART" && user.opposes(target)) {
          score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "SetTargetAbilityToUserAbility":
      score -= 40; // don't prefer this move
      if (target.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (!user.ability || user.abilityId === target.abilityId ||
          ["MULTITYPE", "RKSSYSTEM", "TRUANT"].includes(target.abilityId!) ||
          ["FLOWERGIFT", "FORECAST", "ILLUSION", "IMPOSTER", "MULTITYPE", "RKSSYSTEM",
            "TRACE", "ZENMODE"].includes(user.abilityId!)) {
          score -= 90;
        }
        if (skill >= PBTrainerAI.highSkill()) {
          if (user.abilityId === "TRUANT" && user.opposes(target)) {
            score += 90;
          } else if (user.abilityId === "SLOWSTART" && user.opposes(target)) {
            score += 90;
          }
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "UserTargetSwapAbilities":
      score -= 40; // don't prefer this move
      if (skill >= PBTrainerAI.mediumSkill()) {
        if ((!user.ability && !target.ability) ||
          user.abilityId === target.abilityId ||
          ["ILLUSION", "MULTITYPE", "RKSSYSTEM", "WONDERGUARD"].includes(user.abilityId!) ||
          ["ILLUSION", "MULTITYPE", "RKSSYSTEM", "WONDERGUARD"].includes(target.abilityId!)) {
          score -= 90;
        }
      }
      if (skill >= PBTrainerAI.highSkill()) {
        if (target.abilityId === "TRUANT" && user.opposes(target)) {
          score -= 90;
        } else if (target.abilityId === "SLOWSTART" && user.opposes(target)) {
          score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "NegateTargetAbility":
      if (target.effects[PBEffects.Substitute] > 0 ||
        target.effects[PBEffects.GastroAcid]) {
        score -= 90;
      } else if (skill >= PBTrainerAI.highSkill()) {
        if (["MULTITYPE", "RKSSYSTEM", "SLOWSTART", "TRUANT"].includes(target.abilityId!)) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "NegateTargetAbilityIfTargetActed":
      if (skill >= PBTrainerAI.mediumSkill()) {
        const userSpeed   = this.pbRoughStat(user, "SPEED", skill);
        const targetSpeed = this.pbRoughStat(target, "SPEED", skill);
        if (userSpeed < targetSpeed) {
          score += 30;
        }
      } else {
        score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "IgnoreTargetAbility":
      break;
    //---------------------------------------------------------------------------
    case "StartUserAirborne":
      if (user.effects[PBEffects.MagnetRise] > 0 ||
        user.effects[PBEffects.Ingrain] ||
        user.effects[PBEffects.SmackDown]) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartTargetAirborneAndAlwaysHitByMoves":
      if (target.effects[PBEffects.Telekinesis] > 0 ||
        target.effects[PBEffects.Ingrain] ||
        target.effects[PBEffects.SmackDown]) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "HitsTargetInSky":
      break;
    //---------------------------------------------------------------------------
    case "HitsTargetInSkyGroundsTarget":
      if (skill >= PBTrainerAI.mediumSkill()) {
        if (target.effects[PBEffects.MagnetRise] > 0) score += 20;
        if (target.effects[PBEffects.Telekinesis] > 0) score += 20;
        if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
          "TwoTurnAttackInvulnerableInSkyParalyzeTarget")) score += 20;
        if (target.pbHasType("FLYING")) score += 20;
        if (target.hasActiveAbility("LEVITATE")) score += 20;
        if (target.hasActiveItem("AIRBALLOON")) score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartGravity":
      if (this.battle.field.effects[PBEffects.Gravity] > 0) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        score -= 30;
        if (user.effects[PBEffects.SkyDrop] >= 0) score -= 20;
        if (user.effects[PBEffects.MagnetRise] > 0) score -= 20;
        if (user.effects[PBEffects.Telekinesis] > 0) score -= 20;
        if (user.pbHasType("FLYING")) score -= 20;
        if (user.hasActiveAbility("LEVITATE")) score -= 20;
        if (user.hasActiveItem("AIRBALLOON")) score -= 20;
        if (target.effects[PBEffects.SkyDrop] >= 0) score += 20;
        if (target.effects[PBEffects.MagnetRise] > 0) score += 20;
        if (target.effects[PBEffects.Telekinesis] > 0) score += 20;
        if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
          "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
          "TwoTurnAttackInvulnerableInSkyTargetCannotAct")) score += 20;
        if (target.pbHasType("FLYING")) score += 20;
        if (target.hasActiveAbility("LEVITATE")) score += 20;
        if (target.hasActiveItem("AIRBALLOON")) score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "TransformUserIntoTarget":
      score -= 70;
      break;
    //---------------------------------------------------------------------------
    default:
      return aiEffectScorePart1_pbGetMoveScoreFunctionCode.call(this, score, move, user, target, skill);
  }
  return score;
};
