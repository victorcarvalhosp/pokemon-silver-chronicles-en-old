// Port of the move scores in Plugins/ZUD Mechanics/[003] Battle/Battle_AI.rb:99-756
// (alias aiEffectScorePart3_pbGetMoveScoreFunctionCode): AI move scores for
// each Power Move (Z-Moves the AI may pick, see AI_Move.ts, and the Max Moves
// of a Dynamaxed AI battler) and for Behemoth Blade & co. Other function codes
// fall through to Improved AI's version (AI_Move_EffectScores_ImprovedAI.ts).
//
// NOTE (Ruby parity): two branches never match a move in this game's PBS:
// "ZUDRemoveSideEffects" (Battle_AI.rb:499; G-Max Wind Rage's code is
// "ZUDRemoveTerrainAndSideEffects"), and "ZUDPhotonGeyser" is matched but
// Light That Burns the Sky has no ZUD class (see zud/MoveEffects_Other.ts).

import { Item } from "../../data/gameData/item";
import type { Id } from "../../data/gameData/gameData";
import { Stat } from "../../data/gameData/stat";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { AI, PBTrainerAI } from "./Battle_AI";
import "./AI_Move_EffectScores_ImprovedAI"; // the method this part wraps

const aiEffectScorePart3_pbGetMoveScoreFunctionCode = AI.prototype.pbGetMoveScoreFunctionCode;

/** Whether b knows a move that the stat (Attack/Sp. Atk) benefits. */
function hasMoveCategory(b: Battler, stat: Id): boolean {
  for (const m of b.moves) { // eachMove
    if (stat === "ATTACK" && !m.physicalMove(m.type)) continue;
    if (stat === "SPECIAL_ATTACK" && !m.specialMove(m.type)) continue;
    return true;
  }
  return false;
}

/** Adds AI move scores for each Power Move and Behemoth Blade & co. */
AI.prototype.pbGetMoveScoreFunctionCode = async function (this: AI, score: number, move: Move, user: Battler,
  target: Battler, skill = 100): Promise<number> {
  const battle = this.battle;
  switch (move.function) {
    //---------------------------------------------------------------------------
    // Behemoth Blade, Behemoth Bash, Dynamax Cannon
    //---------------------------------------------------------------------------
    case "DoubleDamageOnDynamaxTargets":
      if (target.dynamax()) score += 60;
      break;
    //---------------------------------------------------------------------------
    // Max Guard
    //---------------------------------------------------------------------------
    case "ZUDProtectUser":
      if (user.effects[PBEffects.ProtectRate] > 1 ||
          target.effects[PBEffects.HyperBeam] > 0) {
        score -= 90;
      } else {
        if (skill >= PBTrainerAI.mediumSkill()) {
          score -= user.effects[PBEffects.ProtectRate] * 40;
        }
        if (user.turnCount === 0) score += 50;
        if (target.effects[PBEffects.TwoTurnAttack]) score += 30;
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max One Blow, G-Max Rapid Flow
    //---------------------------------------------------------------------------
    case "ZUDBypassProtect":
      if (target.pbHasMoveFunction("ZUDProtectUser", "ProtectUser",
        "ProtectUserBanefulBunker",
        "ProtectUserFromDamagingMovesObstruct",
        "ProtectUserFromDamagingMovesKingsShield",
        "ProtectUserFromTargetingMovesSpikyShield")) score += 40;
      break;
    //---------------------------------------------------------------------------
    // Max Knuckle, Max Ooze
    //---------------------------------------------------------------------------
    case "ZUDRaiseUserAndAlliesAtk1":
    case "ZUDRaiseUserAndAlliesSpAtk1": {
      const stat = (move.function === "ZUDRaiseUserAndAlliesAtk1") ? "ATTACK" : "SPECIAL_ATTACK";
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.statStageAtMax(stat)) {
            score -= 90;
          } else {
            score -= b.stages[stat]! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              if (hasMoveCategory(b, stat)) {
                score += 20;
              } else if (skill >= PBTrainerAI.highSkill()) {
                score -= 90;
              }
            }
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.stages[stat]! < 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            if (hasMoveCategory(b, stat)) score += 20;
          }
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Max Steelspike, Max Quake
    //---------------------------------------------------------------------------
    case "ZUDRaiseUserAndAlliesDef1":
    case "ZUDRaiseUserAndAlliesSpDef1": {
      const stat = (move.function === "ZUDRaiseUserAndAlliesDef1") ? "DEFENSE" : "SPECIAL_DEFENSE";
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.statStageAtMax(stat)) {
            score -= 90;
          } else {
            if (b.turnCount === 0) score += 40;
            score -= b.stages[stat]! * 20;
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.turnCount === 0) score += 10;
          if (b.stages[stat]! < 0) score += 20;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Max Airstream
    //---------------------------------------------------------------------------
    case "ZUDRaiseUserAndAlliesSpeed1":
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.statStageAtMax("SPEED")) {
            score -= 90;
          } else {
            score -= b.stages.SPEED! * 10;
            if (skill >= PBTrainerAI.highSkill()) {
              const aspeed = this.pbRoughStat(b, "SPEED", skill);
              const ospeed = this.pbRoughStat(target, "SPEED", skill);
              if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
            }
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.stages.SPEED! < 0) score += 20;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // Clangorous Soulblaze, Extreme Evoboost
    //---------------------------------------------------------------------------
    case "ZUDRaiseUserMainStats1":
    case "ZUDRaiseUserMainStats2": {
      for (const s of Stat.eachMainBattle()) if (user.stages[s.id]! < 0) score += 10;
      if (user.pbHasMoveFunction("SwitchOutUserPassOnEffects")) score += 40;
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
    }
    //---------------------------------------------------------------------------
    // G-Max Chi Strike
    //---------------------------------------------------------------------------
    case "ZUDRaiseUserAndAlliesCriticalHitRate1":
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.effects[PBEffects.CriticalBoost] >= 4) {
            score -= 80;
          } else {
            score += 30;
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(user.index)) {
          if (b.effects[PBEffects.CriticalBoost] < 2) score += 30;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // Max Wyrmwind, Max Flutterby
    //---------------------------------------------------------------------------
    case "ZUDLowerAllFoesAtk1":
    case "ZUDLowerAllFoesSpAtk1": {
      const stat = (move.function === "ZUDLowerAllFoesAtk1") ? "ATTACK" : "SPECIAL_ATTACK";
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (await b.pbCanLowerStatStage(stat, user)) {
            score += b.stages[stat]! * 20;
            if (skill >= PBTrainerAI.mediumSkill()) {
              if (hasMoveCategory(b, stat)) {
                score += 20;
              } else if (skill >= PBTrainerAI.highSkill()) {
                score -= 90;
              }
            }
          } else {
            score -= 90;
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(target.index)) {
          // NOTE (Ruby parity): checks the Attack stage for Max Flutterby too (Battle_AI.rb:276).
          if (b.stages.ATTACK! > 0) score += 20;
          if (skill >= PBTrainerAI.mediumSkill()) {
            if (hasMoveCategory(b, stat)) score += 20;
          }
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Max Phantasm, Max Darkness
    //---------------------------------------------------------------------------
    case "ZUDLowerAllFoesDef1":
    case "ZUDLowerAllFoesSpDef1": {
      const stat = (move.function === "ZUDLowerAllFoesDef1") ? "DEFENSE" : "SPECIAL_DEFENSE";
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (await b.pbCanLowerStatStage(stat, user)) {
            score += b.stages[stat]! * 20;
          } else {
            score -= 90;
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (b.stages[stat]! > 0) score += 20;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Max Strike, G-Max Foam Burst
    //---------------------------------------------------------------------------
    case "ZUDLowerAllFoesSpeed1":
    case "ZUDLowerAllFoesSpeed2":
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (await b.pbCanLowerStatStage("SPEED", user)) {
            score += b.stages.SPEED! * 10;
            if (skill >= PBTrainerAI.highSkill()) {
              const aspeed = this.pbRoughStat(user, "SPEED", skill);
              const ospeed = this.pbRoughStat(b, "SPEED", skill);
              if (aspeed < ospeed && aspeed * 2 > ospeed) score += 30;
            }
          } else {
            score -= 90;
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (b.stages.SPEED! > 0) score += 20;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Tartness
    //---------------------------------------------------------------------------
    case "ZUDLowerAllFoesEvasion1":
      if (move.statusMove()) {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (await b.pbCanLowerStatStage("EVASION", user)) {
            score += b.stages.EVASION! * 10;
          } else {
            score -= 90;
          }
        }
      } else {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (b.stages.EVASION! > 0) score += 20;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // Max Flare, Max Geyser
    //---------------------------------------------------------------------------
    case "ZUDStartSunWeather":
    case "ZUDStartRainWeather": {
      let moveWeather: Id;
      let moveType: Id;
      if (move.function === "ZUDStartSunWeather") {
        moveWeather = "Sun";
        moveType = "FIRE";
      } else {
        moveWeather = "Rain";
        moveType = "WATER";
      }
      if (battle.pbCheckGlobalAbility("AIRLOCK") ||
          battle.pbCheckGlobalAbility("CLOUDNINE")) {
        score -= 90;
      } else if (battle.field.weather === moveWeather) {
        score -= 90;
      } else {
        for (const b of battle.allSameSideBattlers(user.index)) {
          for (const m of b.moves) {
            if (!m.damagingMove() || m.type !== moveType) continue;
            score += 20;
          }
          switch (moveWeather) {
            case "Sun":
              if (b.hasActiveAbility(["CHLOROPHYLL", "FLOWERGIFT", "LEAFGUARD", "SOLARPOWER"])) score += 30;
              break;
            case "Rain":
              if (b.hasActiveAbility(["DRYSKIN", "HYDRATION", "RAINDISH", "SWIFTSWIM"])) score += 30;
              break;
          }
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Max Rockfall, Max Hailstorm
    //---------------------------------------------------------------------------
    case "ZUDStartSandstormWeather":
    case "ZUDStartHailWeather": {
      const moveWeather = (move.function === "ZUDStartSandstormWeather") ? "Sandstorm" : "Hail";
      if (battle.pbCheckGlobalAbility("AIRLOCK") ||
          battle.pbCheckGlobalAbility("CLOUDNINE")) {
        score -= 90;
      } else if (battle.field.weather === moveWeather) {
        score -= 90;
      } else {
        for (const b of battle.allSameSideBattlers(user.index)) {
          switch (moveWeather) {
            case "Sandstorm":
              if (b.hasActiveAbility(["SANDVEIL", "SANDRUSH", "SANDFORCE"])) score += 30;
              break;
            case "Hail":
              if (b.hasActiveAbility(["ICEBODY", "SNOWCLOAK", "SLUSHRUSH", "ICEFACE"])) score += 30;
              break;
          }
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // G-Max Gravitas
    //---------------------------------------------------------------------------
    case "ZUDStartGravity":
      if (battle.field.effects[PBEffects.Gravity] > 0) {
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
    // Genesis Supernova, Max Overgrowth, Max Lightning, Max Starfall, Max Mindstorm
    //---------------------------------------------------------------------------
    case "ZUDStartGrassyTerrain":
    case "ZUDStartElectricTerrain":
    case "ZUDStartMistyTerrain":
    case "ZUDStartPsychicTerrain": {
      let terrain: Id | null = null;
      switch (move.function) {
        case "ZUDStartGrassyTerrain": terrain = "Grassy"; break;
        case "ZUDStartElectricTerrain": terrain = "Electric"; break;
        case "ZUDStartMistyTerrain": terrain = "Misty"; break;
        case "ZUDStartPsychicTerrain": terrain = "Psychic"; break;
      }
      for (const b of battle.allSameSideBattlers(user.index)) {
        if (b.affectedByTerrain()) score += 20;
        if (b.pbHasMove("TERRAINPULSE")) score += 20;
        switch (terrain) {
          case "Grassy":
            if (b.pbHasMove("GRASSYGLIDE")) score += 30;
            if (b.hasActiveItem("GRASSYSEED")) score += 30;
            if (b.hasActiveAbility("GRASSPELT")) score += 30;
            break;
          case "Electric":
            if (b.pbHasMove("RISINGVOLTAGE")) score += 30;
            if (b.hasActiveItem("ELECTRICSEED")) score += 30;
            if (b.hasActiveAbility("SURGESURFER")) score += 30;
            if (b.status === "SLEEP") score += 40;
            break;
          case "Misty":
            if (b.pbHasMove("MISTYEXPLOSION")) score += 30;
            if (b.hasActiveItem("MISTYSEED")) score += 30;
            break;
          case "Psychic":
            if (b.pbHasMove("EXPANDINGFORCE")) score += 30;
            if (b.hasActiveItem("PSYCHICSEED")) score += 30;
            break;
        }
      }
      for (const b of battle.allSameSideBattlers(target.index)) {
        if (b.affectedByTerrain()) score -= 10;
        switch (terrain) {
          case "Grassy":
            if (b.pbHasMove("EARTHQUAKE")) score += 30;
            break;
          case "Electric":
            if (b.status === "SLEEP") score -= 40;
            break;
          case "Misty":
            if (b.pbHasType("DRAGON")) score += 30;
            break;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Splintered Stormshards
    //---------------------------------------------------------------------------
    case "ZUDRemoveTerrain":
      if (battle.field.terrain === "None") {
        if (move.statusMove()) {
          score -= 100;
        } else {
          score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Stonesurge, G-Max Steelsurge
    //---------------------------------------------------------------------------
    case "ZUDAddStealthRocksToFoeSide":
    case "ZUDAddSteelsurgeToFoeSide": {
      const effect = (move.function === "ZUDAddStealthRocksToFoeSide") ? PBEffects.StealthRock : PBEffects.Steelsurge;
      if (user.pbOpposingSide().effects[effect]) {
        score -= 90;
      } else if (user.allOpposing().every((b) => !battle.pbCanChooseNonActive(b.index))) {
        score -= 90;
      } else {
        score += 10 * battle.pbAbleNonActiveCount(user.idxOpposingSide());
      }
      break;
    }
    //---------------------------------------------------------------------------
    // G-Max Resonance
    //---------------------------------------------------------------------------
    case "ZUDStartAuroraVeilOnUserSide":
      if (user.pbOwnSide().effects[PBEffects.AuroraVeil] > 0) {
        score -= 90;
      } else {
        score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Wind Rage
    //---------------------------------------------------------------------------
    case "ZUDRemoveSideEffects":
      if (target.pbOwnSide().effects[PBEffects.AuroraVeil] > 0 ||
          target.pbOwnSide().effects[PBEffects.Reflect] > 0 ||
          target.pbOwnSide().effects[PBEffects.LightScreen] > 0 ||
          target.pbOwnSide().effects[PBEffects.Mist] > 0 ||
          target.pbOwnSide().effects[PBEffects.Safeguard] > 0) score += 30;
      if (target.pbOwnSide().effects[PBEffects.Spikes] > 0 ||
          target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0 ||
          target.pbOwnSide().effects[PBEffects.StealthRock]) score -= 30;
      break;
    //---------------------------------------------------------------------------
    // G-Max Vine Lash, G-Max Wildfire, G-Max Cannonade, G-Max Volcalith
    //---------------------------------------------------------------------------
    case "ZUDStartVineLashOnFoeSide":
    case "ZUDStartWildfireOnFoeSide":
    case "ZUDStartCannonadeOnFoeSide":
    case "ZUDStartVolcalithOnFoeSide": {
      let effect = 0;
      let type: Id = "";
      switch (move.function) {
        case "ZUDStartVineLashOnFoeSide": effect = PBEffects.VineLash; type = "GRASS"; break;
        case "ZUDStartWildfireOnFoeSide": effect = PBEffects.Wildfire; type = "FIRE"; break;
        case "ZUDStartCannonadeOnFoeSide": effect = PBEffects.Cannonade; type = "WATER"; break;
        case "ZUDStartVolcalithOnFoeSide": effect = PBEffects.Volcalith; type = "ROCK"; break;
      }
      if (target.pbOwnSide().effects[effect] > 0) {
        score -= 90;
      } else {
        for (const b of battle.allSameSideBattlers(target.index)) {
          if (b.pbHasType(type)) score -= 30;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Stoked Sparksurfer
    //---------------------------------------------------------------------------
    case "ZUDParalyzeTarget":
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
      } else if (skill >= PBTrainerAI.mediumSkill()) {
        if (move.statusMove()) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Volt Crash, G-Max Malodor, G-Max Stunshock, G-Max Befuddle
    //---------------------------------------------------------------------------
    case "ZUDParalyzeAllFoes":
    case "ZUDPoisonAllFoes":
    case "ZUDPoisonOrParalyzeAllFoes":
    case "ZUDPoisonParalyzeOrSleepAllFoes": {
      let statuses: Id[] = [];
      switch (move.function) {
        case "ZUDPoisonAllFoes": statuses = ["POISON"]; break;
        case "ZUDParalyzeAllFoes": statuses = ["PARALYSIS"]; break;
        case "ZUDPoisonOrParalyzeAllFoes": statuses = ["POISON", "PARALYSIS"]; break;
        case "ZUDPoisonParalyzeOrSleepAllFoes": statuses = ["POISON", "PARALYSIS", "SLEEP"]; break;
      }
      for (const b of battle.allSameSideBattlers(target.index)) {
        for (const status of statuses) {
          switch (status) {
            case "POISON":
              if (b.pbCanPoison(user, false)) {
                score += 30;
                if (skill >= PBTrainerAI.mediumSkill()) {
                  if (b.hp <= Math.floor(b.totalhp / 4)) score += 30;
                  if (b.hp <= Math.floor(b.totalhp / 8)) score += 50;
                  if (b.effects[PBEffects.Yawn] > 0) score -= 40;
                }
                if (skill >= PBTrainerAI.highSkill()) {
                  if (this.pbRoughStat(b, "DEFENSE", skill) > 100) score += 10;
                  if (this.pbRoughStat(b, "SPECIAL_DEFENSE", skill) > 100) score += 10;
                  if (b.hasActiveAbility(["GUTS", "MARVELSCALE", "TOXICBOOST"])) score -= 40;
                }
              } else if (skill >= PBTrainerAI.mediumSkill()) {
                if (move.statusMove()) score -= 90;
              }
              break;
            case "PARALYSIS":
              if (b.pbCanParalyze(user, false)) {
                score += 30;
                if (skill >= PBTrainerAI.mediumSkill()) {
                  const aspeed = this.pbRoughStat(user, "SPEED", skill);
                  const ospeed = this.pbRoughStat(b, "SPEED", skill);
                  if (aspeed < ospeed) {
                    score += 30;
                  } else if (aspeed > ospeed) {
                    score -= 40;
                  }
                }
                if (skill >= PBTrainerAI.highSkill()) {
                  if (b.hasActiveAbility(["GUTS", "MARVELSCALE", "QUICKFEET"])) score -= 40;
                }
              } else if (skill >= PBTrainerAI.mediumSkill()) {
                if (move.statusMove()) score -= 90;
              }
              break;
            case "SLEEP":
              if (b.pbCanSleep(user, false)) {
                score += 30;
                if (skill >= PBTrainerAI.mediumSkill()) {
                  if (b.effects[PBEffects.Yawn] > 0) score -= 30;
                }
                if (skill >= PBTrainerAI.highSkill()) {
                  if (b.hasActiveAbility("MARVELSCALE")) score -= 30;
                }
                if (skill >= PBTrainerAI.bestSkill()) {
                  if (b.pbHasMoveFunction("FlinchTargetFailsIfUserNotAsleep",
                    "UseRandomUserMoveIfAsleep")) score -= 50;
                }
              } else if (skill >= PBTrainerAI.mediumSkill()) {
                if (move.statusMove()) score -= 90;
              }
              break;
          }
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // G-Max Snooze
    //---------------------------------------------------------------------------
    case "ZUDYawnTarget":
      if (target.effects[PBEffects.Yawn] > 0 || !target.pbCanSleep(user, false)) {
        if (skill >= PBTrainerAI.mediumSkill()) score -= 90;
      } else {
        score += 30;
        if (skill >= PBTrainerAI.highSkill()) {
          if (target.hasActiveAbility("MARVELSCALE")) score -= 30;
        }
        if (skill >= PBTrainerAI.bestSkill()) {
          if (target.pbHasMoveFunction("FlinchTargetFailsIfUserNotAsleep",
            "UseRandomUserMoveIfAsleep")) score -= 50;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Smite, G-Max Goldrush
    //---------------------------------------------------------------------------
    case "ZUDConfuseAllFoes":
    case "ZUDConfuseAllFoesAddMoney":
      for (const b of battle.allSameSideBattlers(target.index)) {
        if (b.pbCanConfuse(user, false)) {
          score += 30;
        } else if (skill >= PBTrainerAI.mediumSkill()) {
          if (move.statusMove()) score -= 90;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Cuddle
    //---------------------------------------------------------------------------
    case "ZUDInfatuateAllFoes":
      for (const b of battle.allSameSideBattlers(target.index)) {
        let canattract = true;
        const agender = user.gender();
        const ogender = b.gender();
        if (agender === 2 || ogender === 2 || agender === ogender) {
          score -= 90;
          canattract = false;
        } else if (b.effects[PBEffects.Attract] >= 0) {
          score -= 80;
          canattract = false;
        } else if (skill >= PBTrainerAI.bestSkill() && b.hasActiveAbility("OBLIVIOUS")) {
          score -= 80;
          canattract = false;
        }
        if (skill >= PBTrainerAI.highSkill()) {
          if (canattract && b.hasActiveItem("DESTINYKNOT") &&
              user.pbCanAttract(b, false)) {
            score -= 30;
          }
        }
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Meltdown
    //---------------------------------------------------------------------------
    case "ZUDTormentAllFoes":
      for (const b of battle.allSameSideBattlers(target.index)) {
        if (b.effects[PBEffects.Torment]) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Sweetness
    //---------------------------------------------------------------------------
    case "ZUDCureUserAndAlliesStatus":
      for (const b of battle.allSameSideBattlers(user.index)) {
        switch (b.status) {
          case "POISON":
            score += 40;
            if (skill >= PBTrainerAI.mediumSkill()) {
              if (b.hp < Math.floor(b.totalhp / 8)) {
                score += 60;
              } else if (skill >= PBTrainerAI.highSkill() &&
                         b.hp < Math.floor((b.effects[PBEffects.Toxic] + 1) * b.totalhp / 16)) {
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
        }
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Replenish
    //---------------------------------------------------------------------------
    case "ZUDRestoreUserAndAlliesConsumedBerry":
      for (const b of battle.allSameSideBattlers(user.index)) {
        if (b.recycleItem() && Item.get(b.recycleItem()!).isBerry() && !b.item) {
          score += 60;
        } else {
          if (move.statusMove()) score -= 80;
        }
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Finale
    //---------------------------------------------------------------------------
    case "ZUDHealUserAndAlliesOneSixthOfTotalHP": {
      const allyAmt = 30;
      for (const b of battle.allSameSideBattlers(user.index)) {
        if (b.hp === b.totalhp || (skill >= PBTrainerAI.mediumSkill() && !b.canHeal())) {
          score -= Math.floor(allyAmt / 2);
        } else if (b.hp < Math.floor(b.totalhp * 3 / 4)) {
          score += allyAmt;
        }
      }
      break;
    }
    //---------------------------------------------------------------------------
    // Guardian of Alola
    //---------------------------------------------------------------------------
    case "ZUDFixedDamage75PercentTargetHP":
      score -= 50;
      score += Math.floor(target.hp * 100 / target.totalhp);
      break;
    //---------------------------------------------------------------------------
    // G-Max Depletion
    //---------------------------------------------------------------------------
    case "ZUDLowerPPOfAllFoesLastMoveBy2":
      score -= 20;
      break;
    //---------------------------------------------------------------------------
    // G-Max Terror
    //---------------------------------------------------------------------------
    case "ZUDTrapAllFoesInBattle":
      for (const b of battle.allSameSideBattlers(target.index)) {
        if (b.effects[PBEffects.MeanLook] >= 0) score -= 90;
      }
      break;
    //---------------------------------------------------------------------------
    // G-Max Centiferno, G-Max Sandblast
    //---------------------------------------------------------------------------
    case "ZUDBindAllFoesUserCanSwitch":
      for (const b of battle.allSameSideBattlers(target.index)) {
        if (b.effects[PBEffects.Trapping] === 0) score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    // Searing Sunraze Smash, Menacing Moonraze Malestrom, Light That Burns the Sky,
    // G-Max Drum Solo, G-Max Fireball, G-Max Hydrosnipe
    //---------------------------------------------------------------------------
    case "ZUDIgnoreTargetAbility":
    case "ZUDPhotonGeyser":
      if (target.hasActiveAbility(["DISGUISE", "ICEFACE", "MULTISCALE", "STURDY", "WONDERGUARD"])) score += 40;
      break;
    //---------------------------------------------------------------------------
    default:
      return aiEffectScorePart3_pbGetMoveScoreFunctionCode.call(this, score, move, user, target, skill);
  }
  return score;
};
