// Port of Plugins/Improved AI/AI_EffectScores.rb: Improved AI's
// pbGetMoveScoreFunctionCode (alias improvedAI_pbGetMoveScoreFunctionCode):
// entry hazards, weather, screens and terrains. Other function codes fall
// through to Generation 9 Pack's version (AI_Move_EffectScores_Gen9.ts).

import { Settings } from "../../data/gameData/settings";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { AI, PBTrainerAI } from "./Battle_AI";
import "./AI_Move_EffectScores_Gen9"; // the method this part wraps

const improvedAI_pbGetMoveScoreFunctionCode = AI.prototype.pbGetMoveScoreFunctionCode;

/** Get a score for the given move based on its effect */
AI.prototype.pbGetMoveScoreFunctionCode = async function (this: AI, score: number, move: Move, user: Battler,
  target: Battler, skill = 100): Promise<number> {
  switch (move.function) {
    //---------------------------------------------------------------------------
    case "AddSpikesToFoeSide":
      if (user.pbOpposingSide().effects[PBEffects.Spikes] >= 3 && move.statusMove()) {
        score -= 90;
      } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index)) && move.statusMove()) {
        score -= 90; // Opponent can't switch in any Pokemon
      } else if (user.pbOpposingSide().effects[PBEffects.Spikes] < 3) {
        score += 15 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
        score += [40, 32, 24][user.pbOpposingSide().effects[PBEffects.Spikes]]!;
      }
      break;
    //---------------------------------------------------------------------------
    case "AddToxicSpikesToFoeSide":
      if (user.pbOpposingSide().effects[PBEffects.ToxicSpikes] >= 2) {
        score -= 90;
      } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index))) {
        score -= 90; // Opponent can't switch in any Pokemon
      } else {
        score += 10 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
        score += [26, 13][user.pbOpposingSide().effects[PBEffects.ToxicSpikes]]!;
      }
      break;
    //---------------------------------------------------------------------------
    case "AddStealthRocksToFoeSide":
      if (user.pbOpposingSide().effects[PBEffects.StealthRock] && move.statusMove()) {
        score -= 90;
      } else if (!user.allOpposing().some((b) => this.battle.pbCanChooseNonActive(b.index)) && move.statusMove()) {
        score -= 90; // Opponent can't switch in any Pokemon
      } else if (!user.pbOpposingSide().effects[PBEffects.StealthRock]) {
        score += 25 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
      }
      break;
    //---------------------------------------------------------------------------
    case "AddStickyWebToFoeSide":
      if (user.pbOpposingSide().effects[PBEffects.StickyWeb]) {
        score -= 95;
      } else {
        score += 15 * this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
      }
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
          if (m.damagingMove() && m.type === "FIRE") score += 20;
          if (m.function === "TwoTurnAttackOneTurnInSun") score += 40;
        }

        if (user.itemId === "HEATROCK") score += 40;
        if (user.abilityId === "CHLOROPHYLL" || user.abilityId === "FLOWERGIFT" || user.abilityId === "SOLARPOWER" ||
            user.abilityId === "PROTOSYNTHESIS" || user.abilityId === "ORICHALCUMPULSE") score += 40;
        if (user.abilityId === "LEAFGUARD") score += 10;
        if (user.abilityId === "DRYSKIN") score -= 20;
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
          if (m.damagingMove() && m.type === "WATER") score += 20;
          if (m.function === "ParalyzeTargetAlwaysHitsInRainHitsTargetInSky" ||
              m.function === "ConfuseTargetAlwaysHitsInRainHitsTargetInSky") score += 25;
        }

        if (user.itemId === "DAMPROCK") score += 40;
        if (user.abilityId === "SWIFTSWIM") score += 40;
        if (user.abilityId === "WATERDISH" || user.abilityId === "DRYSKIN") score += 20;
        if (user.abilityId === "HYDRATION") score += 10;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartSandstormWeather":
      if (this.battle.pbCheckGlobalAbility("AIRLOCK") ||
          this.battle.pbCheckGlobalAbility("CLOUDNINE")) {
        score -= 90;
      } else if (this.battle.field.weather === "Sandstorm") {
        score -= 90;
      } else {
        if (user.pbHasType("ROCK") && skill >= PBTrainerAI.highSkill()) {
          score += 40;
        } else if (user.pbHasType("STEEL") || user.pbHasType("GROUND") || user.pbHasType("ROCK")) {
          score += 15;
        } else if (user.abilityId !== "SANDRUSH" && user.abilityId !== "SANDFORCE" && user.abilityId !== "SANDVEIL") {
          score -= 90;
        }

        if (user.itemId === "SMOOTHROCK") score += 40;
        if (user.abilityId === "SANDRUSH" || user.abilityId === "SANDFORCE") score += 40;
        if (user.abilityId === "SANDVEIL") score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartHailWeather":
      if (this.battle.pbCheckGlobalAbility("AIRLOCK") ||
          this.battle.pbCheckGlobalAbility("CLOUDNINE")) {
        score -= 90;
      } else if (this.battle.field.weather === "Hail") {
        score -= 90;
      } else {
        for (const m of user.moves) {
          if (m.function === "FreezeTargetAlwaysHitsInHail" ||
              m.function === "StartWeakenDamageAgainstUserSideIfHail") score += 30;
        }

        // PluginManager.installed?("Generation 9 Pack") is true
        if (Settings.HAIL_WEATHER_TYPE !== 1 && user.pbHasType("ICE") && skill >= PBTrainerAI.highSkill()) {
          score += 40;
        } else if (user.pbHasType("ICE")) {
          score += 15;
        } else if (!(Settings.HAIL_WEATHER_TYPE === 0) && user.abilityId !== "SLUSHRUSH" &&
                   user.abilityId !== "ICEBODY" && user.abilityId !== "SNOWCLOAK") {
          score -= 90;
        }

        if (user.itemId === "ICYROCK") score += 40;
        if (user.abilityId === "SLUSHRUSH") score += 40;
        if (user.abilityId === "ICEBODY" || user.abilityId === "SNOWCLOAK") score += 20;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenPhysicalDamageAgainstUserSide":
      if (user.pbOwnSide().effects[PBEffects.Reflect] > 0) {
        score -= 90;
      } else if (user.itemId === "LIGHTCLAY") {
        score += 320;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenSpecialDamageAgainstUserSide":
      if (user.pbOwnSide().effects[PBEffects.LightScreen] > 0) {
        score -= 90;
      } else if (user.itemId === "LIGHTCLAY") {
        score += 340;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartWeakenDamageAgainstUserSideIfHail":
      if (user.pbOwnSide().effects[PBEffects.AuroraVeil] > 0 || user.effectiveWeather() !== "Hail") {
        score -= 90;
      } else if (user.itemId === "LIGHTCLAY") {
        score += 90;
      } else {
        score += 40;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartElectricTerrain":
      if (this.battle.field.terrain === "Electric") {
        score -= 90;
      } else if (user.itemId === "TERRAINEXTENDER") {
        score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartGrassyTerrain":
      if (this.battle.field.terrain === "Grassy") {
        score -= 90;
      } else if (user.itemId === "TERRAINEXTENDER") {
        score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartMistyTerrain":
      if (this.battle.field.terrain === "Misty") {
        score -= 90;
      } else if (user.itemId === "TERRAINEXTENDER") {
        score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    case "StartPsychicTerrain":
      if (this.battle.field.terrain === "Psychic") {
        score -= 90;
      } else if (user.itemId === "TERRAINEXTENDER") {
        score += 50;
      }
      break;
    //---------------------------------------------------------------------------
    default:
      return improvedAI_pbGetMoveScoreFunctionCode.call(this, score, move, user, target, skill);
  }
  return score;
};
