// Port of Plugins/Generation 9 Pack Scripts/[001] Battle/[004] AI_Move_EffectScores.rb:
// the Generation 9 Pack's pbGetMoveScoreFunctionCode (alias
// paldea_pbGetMoveScoreFunctionCode), which adds move scores for Gen 9
// function codes and edits several old ones to consider Gen 9 mechanics. Other
// function codes fall through to core's three parts.
// Alias chain: Gen 9( part 3( part 2( part 1 ))).
//
// Async: only because the battler's pbCanLowerStatStage is async (see
// Battler_StatStages.ts); everything else here is sync.

import type { Id } from "../../data/gameData/gameData";
import { Stat } from "../../data/gameData/stat";
import { Effectiveness } from "../../data/gameData/type";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { rubyDiv } from "../rubyMath";
import { AI, PBTrainerAI, truthy } from "./Battle_AI";
import "./AI_Move_EffectScores_3"; // the method this part wraps (type declaration + load order)

const paldea_pbGetMoveScoreFunctionCode = AI.prototype.pbGetMoveScoreFunctionCode;

//-----------------------------------------------------------------------------
// -Aliased to add move scores for Gen 9 function codes.
// -Edits several old function codes to consider Gen 9 mechanics.
//-----------------------------------------------------------------------------
AI.prototype.pbGetMoveScoreFunctionCode = async function (this: AI, score: number, move: Move, user: Battler,
  target: Battler, skill = 100): Promise<number> {
  switch (move.function) {
    ////////////////////////////////////////////////////////////////////////////
    //
    // Old function codes.
    //
    ////////////////////////////////////////////////////////////////////////////
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetAsleepCureTarget": // Wake-Up Slap
    //---------------------------------------------------------------------------
      if (["SLEEP", "DROWSY"].includes(target.status) && target.statusCount > 1) score -= 20;
      break;
    //---------------------------------------------------------------------------
    case "HealUserFullyAndFallAsleep": // Rest
    //---------------------------------------------------------------------------
      if (user.hp === user.totalhp || user.hasActiveAbility("PURIFYINGSALT") ||
        !user.pbCanSleep(user, false, null, true)) {
        score -= 90;
      } else {
        score += 70;
        score -= rubyDiv(user.hp * 140, user.totalhp);
        if (user.status !== "NONE") score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "SwitchOutTargetStatusMove": { // Roar, Whirlwind
    //---------------------------------------------------------------------------
      if (target.effects[PBEffects.Ingrain] ||
        (skill >= PBTrainerAI.highSkill() &&
          target.hasActiveAbility(["SUCTIONCUPS", "GUARDDOG"]))) {
        score -= 90;
      } else {
        let ch = 0;
        const party = this.battle.pbParty(target.index);
        for (let i = 0; i < party.length; i++) {
          if (this.battle.pbCanSwitchLax(target.index, i)) ch += 1;
        }
        if (ch === 0) score -= 90;
      }
      if (score > 20) {
        if (target.pbOwnSide().effects[PBEffects.Spikes] > 0) score += 50;
        if (target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) score += 50;
        if (target.pbOwnSide().effects[PBEffects.StealthRock]) score += 50;
      }
      break;
    }
    //---------------------------------------------------------------------------
    case "SwitchOutTargetDamagingMove": // Circle Throw, Dragon Tail
    //---------------------------------------------------------------------------
      if (!target.effects[PBEffects.Ingrain] &&
        !(skill >= PBTrainerAI.highSkill() && target.hasActiveAbility(["SUCTIONCUPS", "GUARDDOG"]))) {
        if (target.pbOwnSide().effects[PBEffects.Spikes] > 0) score += 40;
        if (target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) score += 40;
        if (target.pbOwnSide().effects[PBEffects.StealthRock]) score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "UserSwapsPositionsWithAlly": // Ally Switch
    //---------------------------------------------------------------------------
      if (skill >= PBTrainerAI.mediumSkill() && user.effects[PBEffects.AllySwitch] === true) {
        score -= 100;
      }
      break;
    //---------------------------------------------------------------------------
    case "SetTargetAbilityToSimple": // Simple Beam
    case "SetTargetAbilityToInsomnia": // Worry Seed
    //---------------------------------------------------------------------------
      if (target.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (target.unstoppableAbility() ||
          target.hasActiveItem("ABILITYSHIELD") ||
          false) { // Ruby: `[:TRUANT, :SLOWSTART, :SIMPLE].include?(target.ability)`, always false (Symbol#== with a GameData object)
          score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "SetUserAbilityToTargetAbility": // Role Play
    //---------------------------------------------------------------------------
      score -= 40;
      if (skill >= PBTrainerAI.mediumSkill()) {
        if (!target.ability || user.abilityId === target.abilityId ||
          user.unstoppableAbility() || target.uncopyableAbility() ||
          user.hasActiveItem("ABILITYSHIELD")) {
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
    case "SetTargetAbilityToUserAbility": // Entrainment
    //---------------------------------------------------------------------------
      score -= 40;
      if (target.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (!user.ability || user.abilityId === target.abilityId ||
          target.unstoppableAbility() ||
          false || // Ruby: `[:TRUANT, :SLOWSTART].include?(target.ability)`, always false (Symbol#== with a GameData object)
          user.uncopyableAbility() || target.hasActiveItem("ABILITYSHIELD")) {
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
    case "UserTargetSwapAbilities": // Skill Swap
    //---------------------------------------------------------------------------
      score -= 40;
      if (skill >= PBTrainerAI.mediumSkill()) {
        // Ruby checks the user's Ability Shield twice (the target's is never checked)
        if ((!user.ability && !target.ability) || user.abilityId === target.abilityId ||
          user.uncopyableAbility() || target.uncopyableAbility() ||
          user.hasActiveItem("ABILITYSHIELD") || user.hasActiveItem("ABILITYSHIELD")) {
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
    case "NegateTargetAbility": // Gastro Acid
    //---------------------------------------------------------------------------
      if (target.effects[PBEffects.Substitute] > 0 ||
        target.effects[PBEffects.GastroAcid]) {
        score -= 90;
      } else if (skill >= PBTrainerAI.highSkill()) {
        if (target.unstoppableAbility() || target.hasActiveItem("ABILITYSHIELD")) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "OHKO":
    case "OHKOIce":
    case "OHKOHitsUndergroundTarget": // OHKO moves
    //---------------------------------------------------------------------------
      if (target.hasActiveAbility("STURDY")) score -= 90;
      if (target.level > user.level) score -= 90;
      if (target.effects[PBEffects.GlaiveRush] > 0) score += 90;
      break;
    //---------------------------------------------------------------------------
    case "TypeDependsOnUserPlate": // Judgment
    //---------------------------------------------------------------------------
      if (user.hasLegendPlateJudgment()) score += 20;
      break;
    ////////////////////////////////////////////////////////////////////////////
    //
    // New function codes.
    //
    ////////////////////////////////////////////////////////////////////////////
    //---------------------------------------------------------------------------
    case "DrowseTarget": // Drowsy moves
    //---------------------------------------------------------------------------
      if (target.pbCanSleep(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET"])) score -= 40;
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "FrostbiteTarget": // Frostbite moves
    //---------------------------------------------------------------------------
      if (target.pbCanFrostbite(user, false)) {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET"])) score -= 40;
        }
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "PoisonParalyzeOrSleepTarget": // Dire Claw
    //---------------------------------------------------------------------------
      if (target.pbHasAnyStatus()) score -= 20;
      if (target.effects[PBEffects.Yawn] > 0 && skill >= PBTrainerAI.mediumSkill()) score -= 30;
      if (skill >= PBTrainerAI.bestSkill() &&
        target.pbHasMoveFunction("FlinchTargetFailsIfUserNotAsleep", "UseRandomUserMoveIfAsleep")) {
        score -= 30;
      }
      if (skill >= PBTrainerAI.highSkill()) {
        if (target.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET", "TOXICBOOST"])) score -= 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetPoisonedPoisonTarget": // Barb Barrage
    //---------------------------------------------------------------------------
      if (target.status === "POISON") {
        score += 40;
      } else if (target.pbCanPoison(user, false)) {
        score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "DoublePowerIfTargetStatusProblemBurnTarget": // Infernal Parade
    //---------------------------------------------------------------------------
      if (!target.pbHasAnyStatus()) {
        score += 40;
      } else if (target.pbCanBurn(user, false)) {
        score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    case "DamageTargetAddSpikesToFoeSide": // Ceaseless Edge (Gen 9)
    //---------------------------------------------------------------------------
      if (user.pbOpposingSide().effects[PBEffects.Spikes] >= 3) {
        score -= 90;
      } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index))) {
        score -= 90;
      } else {
        score += 10 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
        score += [40, 26, 13][user.pbOpposingSide().effects[PBEffects.Spikes] as number]!;
      }
      break;
    //---------------------------------------------------------------------------
    case "DamageTargetAddStealthRocksToFoeSide": // Stone Axe (Gen 9)
    //---------------------------------------------------------------------------
      if (user.pbOpposingSide().effects[PBEffects.StealthRock]) {
        score -= 90;
      } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index))) {
        score -= 90;
      } else {
        score += 10 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
      }
      break;
    //---------------------------------------------------------------------------
    case "StartSplintersTarget": // Ceaseless Edge, Stone Axe (PLA)
    //---------------------------------------------------------------------------
      if (move.statusMove()) {
        if (target.effects[PBEffects.Splinters] > 0 ||
          target.effects[PBEffects.Substitute] > 0) {
          score -= 90;
        } else {
          if (user.turnCount === 0) score += 40;
        }
      } else {
        if (user.turnCount === 0) score += 10;
        if (target.effects[PBEffects.Splinters]  === 0 &&
          target.effects[PBEffects.Substitute] === 0) score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "LowerTargetDefense1FlinchTarget": // Triple Arrows
    //---------------------------------------------------------------------------
      if (target.stages.DEFENSE! > 0) score += 20;
      break;
    //---------------------------------------------------------------------------
    case "RaiseUserAtkDefSpd1": // Victory Dance
    //---------------------------------------------------------------------------
      if (user.statStageAtMax("SPEED") &&
        user.statStageAtMax("ATTACK") &&
        user.statStageAtMax("DEFENSE")) {
        score -= 90;
      } else {
        score -= user.stages.ATTACK! * 10;
        score -= user.stages.DEFENSE! * 10;
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
          if (aspeed < ospeed && aspeed * 2 > ospeed) {
            score += 20;
          }
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "RaiseUserSpAtkSpDef1CureStatus": // Take Heart
    //---------------------------------------------------------------------------
      if (user.pbHasAnyStatus()) score += 40;
      if (user.statStageAtMax("SPECIAL_ATTACK") &&
        user.statStageAtMax("SPECIAL_DEFENSE")) {
        score -= 90;
      } else {
        if (user.turnCount === 0) score += 40;
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
    case "RecoilHalfOfTotalHP": // Chloroblast
    //---------------------------------------------------------------------------
      score -= 50;
      break;
    //---------------------------------------------------------------------------
    case "TypeIsUserSecondTypeRemoveScreens": // Raging Bull
    //---------------------------------------------------------------------------
      if (user.pbOpposingSide().effects[PBEffects.AuroraVeil] > 0) score += 20;
      if (user.pbOpposingSide().effects[PBEffects.Reflect] > 0) score += 20;
      if (user.pbOpposingSide().effects[PBEffects.LightScreen] > 0) score += 20;
      break;
    //---------------------------------------------------------------------------
    case "IncreasePowerEachFaintedAlly": // Last Respects
    //---------------------------------------------------------------------------
      score += Math.min(this.battle.pbFaintedAllyCount(user), 10) * 10;
      break;
    //---------------------------------------------------------------------------
    case "IncreasePowerEachTimeHit": // Rage Fist
    //---------------------------------------------------------------------------
      score += Math.min(this.battle.pbRageHitCount(user), 10) * 10;
      break;
    //---------------------------------------------------------------------------
    case "IncreasePowerSuperEffective": // Collision Course, Electro Drift
    //---------------------------------------------------------------------------
      if (Effectiveness.superEffective(this.pbCalcTypeMod(move.type, user, target))) {
        if (skill >= PBTrainerAI.mediumSkill()) score += 60;
      }
      break;
    //---------------------------------------------------------------------------
    case "IncreasePowerInSunWeather": // Hydro Steam
    //---------------------------------------------------------------------------
      if (["Sun", "HarshSun"].includes(user.effectiveWeather())) score += 20;
      break;
    //---------------------------------------------------------------------------
    case "IncreasePowerWhileElectricTerrain": // Psyblade
    //---------------------------------------------------------------------------
      if (this.battle.field.terrain === "Electric") score += 20;
      break;
    //---------------------------------------------------------------------------
    case "HitThreeTimes": // Triple Dive
    //---------------------------------------------------------------------------
    // N/A
      break;
    //---------------------------------------------------------------------------
    case "HitTenTimes": // Population Bomb
    //---------------------------------------------------------------------------
      if (user.hasActiveItem("LOADEDDICE")) score += 20;
      break;
    //---------------------------------------------------------------------------
    case "CrashDamageIfFailsConfuseTarget": // Axe Kick
    //---------------------------------------------------------------------------
      score += 10 * (user.stages.ACCURACY! - target.stages.EVASION!);
      break;
    //---------------------------------------------------------------------------
    case "UserVulnerableUntilNextAction": // Glaive Rush
    //---------------------------------------------------------------------------
      score -= 40;
      break;
    //---------------------------------------------------------------------------
    case "CantSelectConsecutiveTurns": // Gigaton Hammer
    //---------------------------------------------------------------------------
      if (user.hasActiveItem(["CHOICEBAND", "CHOICESPECS", "CHOICESCARF"]) ||
        user.hasActiveAbility("GORILLATACTICS") || user.effects[PBEffects.Encore] > 0) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "AddMoneyGainedFromBattleLowerUserSpAtk1": // Make it Rain
    //---------------------------------------------------------------------------
      score += user.stages.SPECIAL_ATTACK! * 10;
      break;
    //---------------------------------------------------------------------------
    case "UserLosesElectricType": // Double Shock
    //---------------------------------------------------------------------------
      if (!user.pbHasType("ELECTRIC")) score -= 90;
      break;
    //---------------------------------------------------------------------------
    case "StartSaltCureTarget": // Salt Cure
    //---------------------------------------------------------------------------
      if (target.effects[PBEffects.SaltCure]) {
        score -= 40;
      } else {
        if (user.turnCount === 0) score += 60;
        if (skill >= PBTrainerAI.mediumSkill()) {
          if (target.pbHasType("WATER") || target.pbHasType("STEEL")) score += 80;
        }
      }
      break;
    //---------------------------------------------------------------------------
    case "ProtectUserFromDamagingMovesSilkTrap": // Silk Trap
    //---------------------------------------------------------------------------
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
    case "RaiseUserStat1Commander": // Order Up
    //---------------------------------------------------------------------------
      if (user.isCommanderHost()) {
        const form = (user.effects[PBEffects.Commander] as number[])[1]!;
        const stat = (["ATTACK", "DEFENSE", "SPEED"] as Id[])[form]!;
        if (user.stages[stat]! < 2) score += 20;
      } else {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "RaiseTargetAtkLowerTargetDef2": // Spicy Extract
    //---------------------------------------------------------------------------
      if (await target.pbCanLowerStatStage("DEFENSE", user)) {
        score -= target.stages.ATTACK! * 20;
        score += target.stages.DEFENSE! * 20;
        if (skill >= PBTrainerAI.mediumSkill()) {
          let hasPhysicalAttack = false;
          for (const m of target.moves) {
            if (!m.physicalMove(m.type)) continue;
            hasPhysicalAttack = true;
            break;
          }
          if (hasPhysicalAttack) {
            score -= 20;
          } else if (skill >= PBTrainerAI.highSkill()) {
            score += 60;
          }
        }
      } else {
        score -= 60;
      }
      break;
    //---------------------------------------------------------------------------
    case "RaiseUserAtk2SpAtk2Speed2LoseHalfOfTotalHP": // Fillet Away
    //---------------------------------------------------------------------------
      if ((user.statStageAtMax("ATTACK") &&
        user.statStageAtMax("SPECIAL_ATTACK") &&
        user.statStageAtMax("SPEED")) || user.hp <= rubyDiv(user.totalhp, 2)) {
        score -= 100;
      } else {
        score += (6 - user.stages.ATTACK!) * 3;
        score += (6 - user.stages.SPECIAL_ATTACK!) * 3;
        score += (6 - user.stages.SPEED!) * 3;
      }
      break;
    //---------------------------------------------------------------------------
    case "RaiseUserAtkSpd1RemoveHazardsSubstitutes": // Tidy Up
    //---------------------------------------------------------------------------
      if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) > 0) {
        if (user.pbOwnSide().effects[PBEffects.Spikes] > 0 ||
          user.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0 ||
          user.pbOwnSide().effects[PBEffects.StealthRock] ||
          user.pbOwnSide().effects[PBEffects.StickyWeb]) score += 30;
      }
      for (const b of user.allAllies()) if (b.effects[PBEffects.Substitute] > 0) score -= 20;
      if (this.battle.pbAbleNonActiveCount(target.idxOwnSide()) > 0) {
        if (target.pbOwnSide().effects[PBEffects.Spikes] > 0 ||
          target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0 ||
          target.pbOwnSide().effects[PBEffects.StealthRock] ||
          target.pbOwnSide().effects[PBEffects.StickyWeb]) score -= 30;
      }
      for (const b of user.allOpposing()) if (b.effects[PBEffects.Substitute] > 0) score += 20;
      if (user.turnCount === 0) score += 40;
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
    case "RemoveUserBindingAndEntryHazardsPoisonTarget": // Mortal Spin
    //---------------------------------------------------------------------------
      if (user.effects[PBEffects.Trapping] > 0) score += 30;
      if (user.effects[PBEffects.LeechSeed] >= 0) score += 30;
      if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) > 0) {
        if (user.pbOwnSide().effects[PBEffects.Spikes] > 0) score += 80;
        if (user.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) score += 80;
        if (user.pbOwnSide().effects[PBEffects.StealthRock]) score += 80;
      }
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
      break;
    //---------------------------------------------------------------------------
    case "RemoveTerrainIceSpinner": // Ice Spinner
    //---------------------------------------------------------------------------
      if (this.battle.field.terrain !== "None") score += 20;
      break;
    //---------------------------------------------------------------------------
    case "StartHailWeatherSwitchOutUser": // Chilly Reception
    //---------------------------------------------------------------------------
      if (!this.battle.pbCanChooseNonActive(user.index) ||
        this.battle.pbTeamAbleNonActiveCount(user.index) > 1) {
        score -= 100;
      } else {
        if (user.effects[PBEffects.Confusion] > 0) score += 40;
        let total = 0;
        for (const s of Stat.eachBattle()) total += user.stages[s.id]!;
        if (total <= 0 || user.turnCount === 0) {
          score += 60;
        } else {
          score -= total * 10;
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
    case "UserMakeSubstituteSwitchOut": // Shed Tail
    //---------------------------------------------------------------------------
      if (user.effects[PBEffects.Substitute] > 0) {
        score -= 90;
      } else if (user.hp <= rubyDiv(user.totalhp, 2)) {
        score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    case "SetUserAlliesAbilityToTargetAbility": // Doodle
    //---------------------------------------------------------------------------
      score -= 40;
      if (skill >= PBTrainerAI.mediumSkill()) {
        if (!target.ability || user.abilityId === target.abilityId ||
          user.unstoppableAbility() || target.uncopyableAbility() ||
          user.hasActiveItem("ABILITYSHIELD") || target.hasActiveItem("ABILITYSHIELD")) {
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
    case "RevivePokemonHalfHP": { // Revival Blessing
    //---------------------------------------------------------------------------
      let numFainted = 0;
      const party = this.battle.pbParty(user.idxOwnSide());
      for (const b of party) if (b!.fainted()) numFainted += 1;
      // Ruby: Integer division, so this is 0 unless every party member has fainted
      if (numFainted > 0) score += rubyDiv(numFainted, party.length) * 100;
      break;
    }
    default:
      return paldea_pbGetMoveScoreFunctionCode.call(this, score, move, user, target, skill);
  }
  return score;
};
