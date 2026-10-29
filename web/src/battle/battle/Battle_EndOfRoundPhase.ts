// Port of Data/Scripts/011_Battle/001_Battle/011_Battle_EndOfRoundPhase.rb
// v20.1 Hotfixes (Battle bug fixes.rb:180): pbEORShiftDistantBattlers.
// Generation 9 Pack ([001] Battle/[001] Battle.rb:81-130): pbEOREndBattlerEffects
//   (Splinters), pbEndOfRoundPhase (Ally Switch/Charge/Glaive Rush),
//   pbEOREffectDamage (Splinters, Salt Cure); ([001] Battle/[005] Weather and
//   Status.rb:82-140): pbEOREndWeather (Snow), pbEORWeatherDamage,
//   pbEORStatusProblemDamage (Frostbite).
// Essentials Deluxe ([002] Battle Deluxe/Midbattle_Triggers.rb:156-217):
//   pbEORCountDownBattlerEffect/SideEffect/FieldEffect, pbEOREndWeather,
//   pbEOREndTerrain, pbEndOfRoundPhase (midbattle triggers);
//   Midbattle_Effects.rb:274 dxConvertToPBEffect.
// ZUD Mechanics ([003] Battle/Battle_Overrides.rb:128-250): pbEORSeaOfFireDamage
//   (G-Max lingering damage), pbEOREndSideEffects, pbEndOfRoundPhase (Z-Move
//   and Dynamax end of round).
//
// Alias chains (plugins load after every core script, in the order Hotfixes,
// Gen 9, ..., Essentials Deluxe, ZUD):
//   pbEOREndWeather   = Deluxe( Gen 9( core ) )
//   pbEndOfRoundPhase = ZUD( Deluxe( Gen 9( Clauses( core ) ) ) )
// 006_Battle_Clauses.rb (a core script loaded after this file) wraps the core
// pbEndOfRoundPhase before the plugins wrap it, so the core body is the
// separate method pbEndOfRoundPhaseCore, which Clauses.ts wraps.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Status } from "../../data/gameData/status";
import { Effectiveness } from "../../data/gameData/type";
import { Scene } from "../BattleSceneInterface";
import { Battler } from "../battler/Battler";
import { AbilityEffects } from "../other/AbilityEffects";
import type { ActivePosition } from "../other/ActiveField";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Battle } from "./Battle";

/** Battle::TRAPPING_MOVE_COMMON_ANIMATIONS */
export const TRAPPING_MOVE_COMMON_ANIMATIONS: Record<Id, string> = {
  BIND: "Bind",
  CLAMP: "Clamp",
  FIRESPIN: "FireSpin",
  MAGMASTORM: "MagmaStorm",
  SANDTOMB: "SandTomb",
  WRAP: "Wrap",
  INFESTATION: "Infestation",
};

/**
 * Essentials Deluxe (Midbattle_Effects.rb:274): used for getting the name of
 * various effects that count down each turn. Matches the PBEffects numbers, as
 * in Ruby (FocusLock 313 and FocusedGuard 206 belong to plugins that aren't
 * installed).
 */
export function dxConvertToPBEffect(effect: number, type: "battler" | "side" | "field"): string | null {
  switch (type) {
    case "battler":
      switch (effect) {
        case 19: return "Disable";
        case 22: return "Embargo";
        case 37: return "HealBlock";
        case 53: return "MagnetRise";
        case 99: return "Taunt";
        case 100: return "Telekinesis";
        case 116: return "Yawn";
        case 313: return "FocusLock";
        case 410: return "Splinters";
      }
      break;
    case "side":
      switch (effect) {
        case 0: return "AuroraVeil";
        case 5: return "LightScreen";
        case 6: return "LuckyChant";
        case 8: return "Mist";
        case 10: return "Rainbow";
        case 11: return "Reflect";
        case 13: return "Safeguard";
        case 14: return "SeaOfFire";
        case 18: return "Swamp";
        case 19: return "Tailwind";
        case 201: return "VineLash";
        case 202: return "Wildfire";
        case 203: return "Cannonade";
        case 204: return "Volcalith";
        case 206: return "FocusedGuard";
      }
      break;
    case "field":
      switch (effect) {
        case 4: return "Gravity";
        case 7: return "MagicRoom";
        case 8: return "MudSportField";
        case 10: return "TrickRoom";
        case 11: return "WaterSportField";
        case 12: return "WonderRoom";
      }
      break;
  }
  return null;
}

/** The block of pbEORCountDownBattlerEffect: runs when the effect reaches 0. */
export type CountDownCallback = (battler: Battler) => void | Promise<void>;

const methods = {
  //=============================================================================
  // End Of Round end weather check and weather effects
  //=============================================================================
  async pbEOREndWeather(this: Battle, priority: Battler[]): Promise<void> {
    // --- Core Essentials ---
    const core = async (): Promise<void> => {
      // NOTE: Primordial weather doesn't need to be checked here, because if it
      //       could wear off here, it will have worn off already.
      // Count down weather duration
      if (this.field.weatherDuration > 0) this.field.weatherDuration -= 1;
      // Weather wears off
      if (this.field.weatherDuration === 0) {
        switch (this.field.weather) {
          case "Sun": await this.pbDisplay(_INTL("The sunlight faded.")); break;
          case "Rain": await this.pbDisplay(_INTL("The rain stopped.")); break;
          case "Sandstorm": await this.pbDisplay(_INTL("The sandstorm subsided.")); break;
          case "Hail": await this.pbDisplay(_INTL("The hail stopped.")); break;
          case "ShadowSky": await this.pbDisplay(_INTL("The shadow sky faded.")); break;
        }
        this.field.weather = "None";
        // Check for form changes caused by the weather changing
        for (const battler of this.allBattlers()) await battler.pbCheckFormOnWeatherChange();
        // Start up the default weather
        if (this.field.defaultWeather !== "None") await this.pbStartWeather(null, this.field.defaultWeather);
        if (this.field.weather === "None") return;
      }
      // Weather continues
      const weatherData = BattleWeather.tryGet(this.field.weather);
      if (weatherData) await this.pbCommonAnimation(weatherData.animation!);
      switch (this.field.weather) {
        // case "Sun": await this.pbDisplay(_INTL("The sunlight is strong.")); break;
        // case "Rain": await this.pbDisplay(_INTL("Rain continues to fall.")); break;
        case "Sandstorm": await this.pbDisplay(_INTL("The sandstorm is raging.")); break;
        case "Hail": await this.pbDisplay(_INTL("The hail is crashing down.")); break;
        // case "HarshSun": await this.pbDisplay(_INTL("The sunlight is extremely harsh.")); break;
        // case "HeavyRain": await this.pbDisplay(_INTL("It is raining heavily.")); break;
        // case "StrongWinds": await this.pbDisplay(_INTL("The wind is strong.")); break;
        case "ShadowSky": await this.pbDisplay(_INTL("The shadow sky continues.")); break;
      }
      // Effects due to weather
      for (const battler of priority) {
        // Weather-related abilities
        if (battler.abilityActive()) {
          await AbilityEffects.triggerEndOfRoundWeather(battler.ability, battler.effectiveWeather(), battler, this);
          if (battler.fainted()) await battler.pbFaint();
        }
        // Weather damage
        await this.pbEORWeatherDamage(battler);
      }
    };
    // --- Generation 9 Pack: the correct weather end messages for Snow ---
    const gen9 = async (): Promise<void> => {
      if (this.field.weather === "Hail" && Settings.HAIL_WEATHER_TYPE > 0) {
        if (this.field.weatherDuration > 0) this.field.weatherDuration -= 1;
        if (this.field.weatherDuration === 0) {
          if (Settings.HAIL_WEATHER_TYPE === 2) {
            await this.pbDisplay(_INTL("The hailstorm ended."));
          } else {
            await this.pbDisplay(_INTL("The snow stopped."));
          }
          this.field.weather = "None";
          for (const battler of this.allBattlers()) await battler.pbCheckFormOnWeatherChange();
          if (this.field.defaultWeather !== "None") await this.pbStartWeather(null, this.field.defaultWeather);
          if (this.field.weather === "None") return;
        }
        const weatherData = BattleWeather.tryGet(this.field.weather);
        // Ruby: `if weather_data && !@weather` — Battle has no @weather (always nil).
        if (weatherData) await this.pbCommonAnimation(weatherData.animation!);
        if (Settings.HAIL_WEATHER_TYPE === 2) await this.pbDisplay(_INTL("The hail is crashing down."));
        for (const battler of priority) {
          if (battler.abilityActive()) {
            await AbilityEffects.triggerEndOfRoundWeather(battler.ability, battler.effectiveWeather(), battler, this);
            if (battler.fainted()) await battler.pbFaint();
          }
          await this.pbEORWeatherDamage(battler);
        }
      } else {
        await core();
      }
    };
    // --- Essentials Deluxe: midbattle triggers for the weather ending ---
    const oldWeather = this.field.weather;
    await gen9();
    const newWeather = this.field.weather;
    if (newWeather === "None" && oldWeather !== "None") {
      await this.scene.pbDeluxeTriggers?.(null, null, ["endWeather", "endWeather" + oldWeather.toUpperCase()]);
    }
  },

  async pbEORWeatherDamage(this: Battle, battler: Battler): Promise<void> {
    // Generation 9 Pack: Hail doesn't cause end of round damage if set to Snow weather.
    if (Settings.HAIL_WEATHER_TYPE === 1 &&
        !battler.fainted() && battler.effectiveWeather() === "Hail") return;
    // --- Core Essentials ---
    if (battler.fainted()) return;
    let amt = -1;
    switch (battler.effectiveWeather()) {
      case "Sandstorm":
        if (!battler.takesSandstormDamage()) return;
        await this.pbDisplay(_INTL("{1} is buffeted by the sandstorm!", battler.pbThis()));
        amt = Math.floor(battler.totalhp / 16);
        break;
      case "Hail":
        if (!battler.takesHailDamage()) return;
        await this.pbDisplay(_INTL("{1} is buffeted by the hail!", battler.pbThis()));
        amt = Math.floor(battler.totalhp / 16);
        break;
      case "ShadowSky":
        if (!battler.takesShadowSkyDamage()) return;
        await this.pbDisplay(_INTL("{1} is hurt by the shadow sky!", battler.pbThis()));
        amt = Math.floor(battler.totalhp / 16);
        break;
    }
    if (amt < 0) return;
    await this.scene.pbDamageAnimation(battler);
    await battler.pbReduceHP(amt, false);
    await battler.pbItemHPHealCheck();
    if (battler.fainted()) await battler.pbFaint();
  },

  //=============================================================================
  // End Of Round use delayed moves (Future Sight, Doom Desire)
  //=============================================================================
  async pbEORUseFutureSight(this: Battle, position: ActivePosition | null | undefined, positionIndex: number): Promise<void> {
    if (!position || position.effects[PBEffects.FutureSightCounter] === 0) return;
    position.effects[PBEffects.FutureSightCounter] -= 1;
    if (position.effects[PBEffects.FutureSightCounter] > 0) return;
    if (!this.battlers[positionIndex] || this.battlers[positionIndex]!.fainted()) return; // No target
    let moveUser: Battler | null = null;
    for (const battler of this.allBattlers()) {
      if (battler.opposes(position.effects[PBEffects.FutureSightUserIndex])) continue;
      if (battler.pokemonIndex !== position.effects[PBEffects.FutureSightUserPartyIndex]) continue;
      moveUser = battler;
      break;
    }
    if (moveUser && moveUser.index === positionIndex) return; // Target is the user
    if (!moveUser) { // User isn't in battle, get it from the party
      const party = this.pbParty(position.effects[PBEffects.FutureSightUserIndex]);
      const pkmn = party[position.effects[PBEffects.FutureSightUserPartyIndex]];
      if (pkmn?.able()) {
        moveUser = new Battler(this, position.effects[PBEffects.FutureSightUserIndex]);
        moveUser.pbInitDummyPokemon(pkmn, position.effects[PBEffects.FutureSightUserPartyIndex]);
      }
    }
    if (!moveUser) return; // User is fainted
    const move = position.effects[PBEffects.FutureSightMove] as Id;
    await this.pbDisplay(_INTL("{1} took the {2} attack!", this.battlers[positionIndex]!.pbThis(),
      MoveData.get(move).name));
    // NOTE: Future Sight failing against the target here doesn't count towards
    //       Stomping Tantrum.
    const userLastMoveFailed = moveUser.lastMoveFailed;
    this.futureSight = true;
    await moveUser.pbUseMoveSimple(move, positionIndex);
    this.futureSight = false;
    moveUser.lastMoveFailed = userLastMoveFailed;
    if (this.battlers[positionIndex]!.fainted()) await this.battlers[positionIndex]!.pbFaint();
    position.effects[PBEffects.FutureSightCounter] = 0;
    position.effects[PBEffects.FutureSightMove] = null;
    position.effects[PBEffects.FutureSightUserIndex] = -1;
    position.effects[PBEffects.FutureSightUserPartyIndex] = -1;
  },

  //=============================================================================
  // End Of Round healing from Wish
  //=============================================================================
  async pbEORWishHealing(this: Battle): Promise<void> {
    for (let idxPos = 0; idxPos < this.positions.length; idxPos++) {
      const pos = this.positions[idxPos];
      if (!pos || pos.effects[PBEffects.Wish] === 0) continue;
      pos.effects[PBEffects.Wish] -= 1;
      if (pos.effects[PBEffects.Wish] > 0) continue;
      if (!this.battlers[idxPos] || !this.battlers[idxPos]!.canHeal()) continue;
      const wishMaker = this.pbThisEx(idxPos, pos.effects[PBEffects.WishMaker]);
      await this.battlers[idxPos]!.pbRecoverHP(pos.effects[PBEffects.WishAmount]);
      await this.pbDisplay(_INTL("{1}'s wish came true!", wishMaker));
    }
  },

  //=============================================================================
  // End Of Round Sea of Fire damage (Fire Pledge + Grass Pledge combination)
  //=============================================================================
  async pbEORSeaOfFireDamage(this: Battle, priority: Battler[]): Promise<void> {
    // --- Core Essentials ---
    for (let side = 0; side < 2; side++) {
      if (this.sides[side]!.effects[PBEffects.SeaOfFire] === 0) continue;
      if (side === 0) await this.pbCommonAnimation("SeaOfFire");
      if (side === 1) await this.pbCommonAnimation("SeaOfFireOpp");
      for (const battler of priority) {
        if (battler.opposes(side)) continue;
        if (!battler.takesIndirectDamage() || battler.pbHasType("FIRE")) continue;
        await this.scene.pbDamageAnimation(battler);
        await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 8), false, async (_hpLost: number) => {
          await this.pbDisplay(_INTL("{1} is hurt by the sea of fire!", battler.pbThis()));
        });
      }
    }
    // --- ZUD Mechanics: end of round damage for G-Max Vine Lash/Wildfire/Cannonade/Volcalith ---
    for (let side = 0; side < 2; side++) {
      // G-Max Vine Lash
      if (this.sides[side]!.effects[PBEffects.VineLash] > 0) {
        if (this.scene.pbCommonAnimationExists?.("VineLash")) {
          if (side === 0) await this.pbCommonAnimation("VineLash");
          if (side === 1) await this.pbCommonAnimation("VineLashOpp");
        }
        for (const battler of priority) {
          if (battler.opposes(side)) continue;
          if (!battler.takesIndirectDamage() || battler.pbHasType("GRASS")) continue;
          await this.scene.pbDamageAnimation(battler);
          await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 6), false, async (_hpLost: number) => {
            await this.pbDisplay(_INTL("{1} is hurt by G-Max Vine Lash's ferocious beating!", battler.pbThis()));
          });
        }
      }
      // G-Max Wildfire
      if (this.sides[side]!.effects[PBEffects.Wildfire] > 0) {
        if (this.scene.pbCommonAnimationExists?.("Wildfire")) {
          if (side === 0) await this.pbCommonAnimation("Wildfire");
          if (side === 1) await this.pbCommonAnimation("WildfireOpp");
        }
        for (const battler of priority) {
          if (battler.opposes(side)) continue;
          if (!battler.takesIndirectDamage() || battler.pbHasType("FIRE")) continue;
          await this.scene.pbDamageAnimation(battler);
          await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 6), false, async (_hpLost: number) => {
            await this.pbDisplay(_INTL("{1} is burning up within G-Max Wildfire's flames!", battler.pbThis()));
          });
        }
      }
      // G-Max Cannonade
      if (this.sides[side]!.effects[PBEffects.Cannonade] > 0) {
        if (this.scene.pbCommonAnimationExists?.("Cannonade")) {
          if (side === 0) await this.pbCommonAnimation("Cannonade");
          if (side === 1) await this.pbCommonAnimation("CannonadeOpp");
        }
        for (const battler of priority) {
          if (battler.opposes(side)) continue;
          if (!battler.takesIndirectDamage() || battler.pbHasType("WATER")) continue;
          await this.scene.pbDamageAnimation(battler);
          await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 6), false, async (_hpLost: number) => {
            await this.pbDisplay(_INTL("{1} is hurt by G-Max Cannonade's vortex!", battler.pbThis()));
          });
        }
      }
      // G-Max Volcalith
      if (this.sides[side]!.effects[PBEffects.Volcalith] > 0) {
        if (this.scene.pbCommonAnimationExists?.("Volcalith")) {
          if (side === 0) await this.pbCommonAnimation("Volcalith");
          if (side === 1) await this.pbCommonAnimation("VolcalithOpp");
        }
        for (const battler of priority) {
          if (battler.opposes(side)) continue;
          if (!battler.takesIndirectDamage() || battler.pbHasType("ROCK")) continue;
          await this.scene.pbDamageAnimation(battler);
          await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 6), false, async (_hpLost: number) => {
            await this.pbDisplay(_INTL("{1} is hurt by the rocks thrown out by G-Max Volcalith!", battler.pbThis()));
          });
        }
      }
    }
  },

  //=============================================================================
  // End Of Round healing from Grassy Terrain
  //=============================================================================
  async pbEORTerrainHealing(this: Battle, battler: Battler): Promise<void> {
    if (battler.fainted()) return;
    // Grassy Terrain (healing)
    if (this.field.terrain === "Grassy" && battler.affectedByTerrain() && battler.canHeal()) {
      PBDebug.log(`[Lingering effect] Grassy Terrain heals ${battler.pbThis(true)}`);
      await battler.pbRecoverHP(Math.floor(battler.totalhp / 16));
      await this.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
    }
  },

  //=============================================================================
  // End Of Round various healing effects
  //=============================================================================
  async pbEORHealingEffects(this: Battle, priority: Battler[]): Promise<void> {
    // Aqua Ring
    for (const battler of priority) {
      if (!battler.effects[PBEffects.AquaRing]) continue;
      if (!battler.canHeal()) continue;
      let hpGain = Math.floor(battler.totalhp / 16);
      if (battler.hasActiveItem("BIGROOT")) hpGain = Math.floor(hpGain * 1.3);
      await battler.pbRecoverHP(hpGain);
      await this.pbDisplay(_INTL("Aqua Ring restored {1}'s HP!", battler.pbThis(true)));
    }
    // Ingrain
    for (const battler of priority) {
      if (!battler.effects[PBEffects.Ingrain]) continue;
      if (!battler.canHeal()) continue;
      let hpGain = Math.floor(battler.totalhp / 16);
      if (battler.hasActiveItem("BIGROOT")) hpGain = Math.floor(hpGain * 1.3);
      await battler.pbRecoverHP(hpGain);
      await this.pbDisplay(_INTL("{1} absorbed nutrients with its roots!", battler.pbThis()));
    }
    // Leech Seed
    for (const battler of priority) {
      if (battler.effects[PBEffects.LeechSeed] < 0) continue;
      if (!battler.takesIndirectDamage()) continue;
      const recipient = this.battlers[battler.effects[PBEffects.LeechSeed]];
      if (!recipient || recipient.fainted()) continue;
      await this.pbCommonAnimation("LeechSeed", recipient, battler);
      await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 8), true, async (hpLost: number) => {
        await recipient.pbRecoverHPFromDrain(hpLost, battler,
          _INTL("{1}'s health is sapped by Leech Seed!", battler.pbThis()));
        await recipient.pbAbilitiesOnDamageTaken();
      });
      if (recipient.fainted()) await recipient.pbFaint();
    }
  },

  //=============================================================================
  // End Of Round deal damage from status problems
  //=============================================================================
  async pbEORStatusProblemDamage(this: Battle, priority: Battler[]): Promise<void> {
    // --- Core Essentials ---
    // Damage from poisoning
    for (const battler of priority) {
      if (battler.fainted()) continue;
      if (battler.status !== "POISON") continue;
      if (battler.statusCount > 0) {
        battler.effects[PBEffects.Toxic] += 1;
        if (battler.effects[PBEffects.Toxic] > 16) battler.effects[PBEffects.Toxic] = 16;
      }
      if (battler.hasActiveAbility("POISONHEAL")) {
        if (battler.canHeal()) {
          const animName = Status.get("POISON").animation;
          if (animName) await this.pbCommonAnimation(animName, battler);
          await this.pbShowAbilitySplash(battler);
          await battler.pbRecoverHP(Math.floor(battler.totalhp / 8));
          if (Scene.USE_ABILITY_SPLASH) {
            await this.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
          } else {
            await this.pbDisplay(_INTL("{1}'s {2} restored its HP.", battler.pbThis(), battler.abilityName()));
          }
          await this.pbHideAbilitySplash(battler);
        }
      } else if (battler.takesIndirectDamage()) {
        battler.droppedBelowHalfHP = false;
        let dmg = Math.floor(battler.totalhp / 8);
        if (battler.statusCount > 0) dmg = Math.floor(battler.totalhp * battler.effects[PBEffects.Toxic] / 16);
        await battler.pbContinueStatus(async () => { await battler.pbReduceHP(dmg, false); });
        await battler.pbItemHPHealCheck();
        await battler.pbAbilitiesOnDamageTaken();
        if (battler.fainted()) await battler.pbFaint();
        battler.droppedBelowHalfHP = false;
      }
    }
    // Damage from burn
    for (const battler of priority) {
      if (battler.status !== "BURN" || !battler.takesIndirectDamage()) continue;
      battler.droppedBelowHalfHP = false;
      let dmg = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 ? Math.floor(battler.totalhp / 16) : Math.floor(battler.totalhp / 8);
      if (battler.hasActiveAbility("HEATPROOF")) dmg = rubyRound(dmg / 2.0);
      await battler.pbContinueStatus(async () => { await battler.pbReduceHP(dmg, false); });
      await battler.pbItemHPHealCheck();
      await battler.pbAbilitiesOnDamageTaken();
      if (battler.fainted()) await battler.pbFaint();
      battler.droppedBelowHalfHP = false;
    }
    // --- Generation 9 Pack: end of round damage from Frostbite ---
    for (const battler of priority) {
      if (battler.status !== "FROSTBITE" || !battler.takesIndirectDamage()) continue;
      battler.droppedBelowHalfHP = false;
      const dmg = Math.floor(battler.totalhp / 16);
      await battler.pbContinueStatus(async () => { await battler.pbReduceHP(dmg, false); });
      await battler.pbItemHPHealCheck();
      await battler.pbAbilitiesOnDamageTaken();
      if (battler.fainted()) await battler.pbFaint();
      battler.droppedBelowHalfHP = false;
    }
  },

  //=============================================================================
  // End Of Round deal damage from effects (except by trapping)
  //=============================================================================
  async pbEOREffectDamage(this: Battle, priority: Battler[]): Promise<void> {
    // --- Core Essentials ---
    // Damage from sleep (Nightmare)
    for (const battler of priority) {
      if (!battler.asleep()) battler.effects[PBEffects.Nightmare] = false;
      if (!battler.effects[PBEffects.Nightmare] || !battler.takesIndirectDamage()) continue;
      await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 4), true, async (_hpLost: number) => {
        await this.pbDisplay(_INTL("{1} is locked in a nightmare!", battler.pbThis()));
      });
    }
    // Curse
    for (const battler of priority) {
      if (!battler.effects[PBEffects.Curse] || !battler.takesIndirectDamage()) continue;
      await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 4), true, async (_hpLost: number) => {
        await this.pbDisplay(_INTL("{1} is afflicted by the curse!", battler.pbThis()));
      });
    }
    // --- Generation 9 Pack: splinters and Salt Cure effect damage ---
    for (const battler of priority) {
      if (battler.effects[PBEffects.Splinters] === 0 || !battler.takesIndirectDamage()) continue;
      await this.pbCommonAnimation("Splinters", battler);
      const battlerTypes = battler.pbTypes(true);
      const splinterType: Id = battler.effects[PBEffects.SplintersType] ?? "QMARKS";
      const effectiveness = Math.max(1, Effectiveness.calculate(splinterType,
        battlerTypes[0] ?? null, battlerTypes[1] ?? null, battlerTypes[2] ?? null));
      let damage = Math.floor(Math.floor(Math.floor(Math.floor((2.0 * battler.level / 5) + 2) * 25 * battler.attack / battler.defense) / 50)) + 2;
      damage *= effectiveness / Effectiveness.NORMAL_EFFECTIVE; // Float, as in Ruby (pbReduceHP rounds it)
      await battler.pbTakeEffectDamage(damage, true, async (_hpLost: number) => {
        await this.pbDisplay(_INTL("{1} is hurt by the jagged splinters!", battler.pbThis()));
      });
    }
    for (const battler of priority) {
      if (!battler.effects[PBEffects.SaltCure] || !battler.takesIndirectDamage()) continue;
      await this.pbCommonAnimation("SaltCure", battler);
      const fraction = (battler.pbHasType("STEEL") || battler.pbHasType("WATER")) ? 4 : 8;
      await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / fraction), true, async (_hpLost: number) => {
        await this.pbDisplay(_INTL("{1} is hurt by Salt Cure!", battler.pbThis()));
      });
    }
  },

  //=============================================================================
  // End Of Round deal damage to trapped battlers
  //=============================================================================
  async pbEORTrappingDamage(this: Battle, battler: Battler): Promise<void> {
    if (battler.fainted() || battler.effects[PBEffects.Trapping] === 0) return;
    battler.effects[PBEffects.Trapping] -= 1;
    const moveName = MoveData.get(battler.effects[PBEffects.TrappingMove]).name;
    if (battler.effects[PBEffects.Trapping] === 0) {
      await this.pbDisplay(_INTL("{1} was freed from {2}!", battler.pbThis(), moveName));
      return;
    }
    const anim = TRAPPING_MOVE_COMMON_ANIMATIONS[battler.effects[PBEffects.TrappingMove]] ?? "Wrap";
    await this.pbCommonAnimation(anim, battler);
    if (!battler.takesIndirectDamage()) return;
    let hpLoss = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 ? Math.floor(battler.totalhp / 8) : Math.floor(battler.totalhp / 16);
    if (this.battlers[battler.effects[PBEffects.TrappingUser]]!.hasActiveItem("BINDINGBAND")) {
      hpLoss = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 ? Math.floor(battler.totalhp / 6) : Math.floor(battler.totalhp / 8);
    }
    await this.scene.pbDamageAnimation(battler);
    await battler.pbTakeEffectDamage(hpLoss, false, async (_hpLost: number) => {
      await this.pbDisplay(_INTL("{1} is hurt by {2}!", battler.pbThis(), moveName));
    });
  },

  //=============================================================================
  // End Of Round end effects that apply to a battler
  //=============================================================================
  /**
   * Essentials Deluxe (Midbattle_Triggers.rb:156) redefines this to add
   * midbattle triggers. NOTE: as in Ruby, the triggers fire every time the
   * effect counts down, not only when it ends.
   */
  async pbEORCountDownBattlerEffect(this: Battle, priority: Battler[], effect: number,
    callback?: CountDownCallback): Promise<void> {
    for (const battler of priority) {
      if (battler.fainted() || battler.effects[effect] === 0) continue;
      battler.effects[effect] -= 1;
      if (callback && battler.effects[effect] === 0) await callback(battler);
      const sym = dxConvertToPBEffect(effect, "battler");
      if (sym) await this.scene.pbDeluxeTriggers?.(battler, null, ["endEffect", "endEffect" + sym.toUpperCase()]);
    }
  },

  async pbEOREndBattlerEffects(this: Battle, priority: Battler[]): Promise<void> {
    // --- Core Essentials ---
    const core = async (): Promise<void> => {
      // Taunt
      await this.pbEORCountDownBattlerEffect(priority, PBEffects.Taunt, async (battler) => {
        await this.pbDisplay(_INTL("{1}'s taunt wore off!", battler.pbThis()));
      });
      // Encore
      for (const battler of priority) {
        if (battler.fainted() || battler.effects[PBEffects.Encore] === 0) continue;
        const idxEncoreMove = battler.pbEncoredMoveIndex();
        if (idxEncoreMove >= 0) {
          battler.effects[PBEffects.Encore] -= 1;
          if (battler.effects[PBEffects.Encore] === 0 || battler.moves[idxEncoreMove]!.pp === 0) {
            battler.effects[PBEffects.Encore] = 0;
            await this.pbDisplay(_INTL("{1}'s encore ended!", battler.pbThis()));
          }
        } else {
          PBDebug.log(`[End of effect] ${battler.pbThis()}'s encore ended (encored move no longer known)`);
          battler.effects[PBEffects.Encore] = 0;
          battler.effects[PBEffects.EncoreMove] = null;
        }
      }
      // Disable/Cursed Body
      await this.pbEORCountDownBattlerEffect(priority, PBEffects.Disable, async (battler) => {
        battler.effects[PBEffects.DisableMove] = null;
        await this.pbDisplay(_INTL("{1} is no longer disabled!", battler.pbThis()));
      });
      // Magnet Rise
      await this.pbEORCountDownBattlerEffect(priority, PBEffects.MagnetRise, async (battler) => {
        await this.pbDisplay(_INTL("{1}'s electromagnetism wore off!", battler.pbThis()));
      });
      // Telekinesis
      await this.pbEORCountDownBattlerEffect(priority, PBEffects.Telekinesis, async (battler) => {
        await this.pbDisplay(_INTL("{1} was freed from the telekinesis!", battler.pbThis()));
      });
      // Heal Block
      await this.pbEORCountDownBattlerEffect(priority, PBEffects.HealBlock, async (battler) => {
        await this.pbDisplay(_INTL("{1}'s Heal Block wore off!", battler.pbThis()));
      });
      // Embargo
      await this.pbEORCountDownBattlerEffect(priority, PBEffects.Embargo, async (battler) => {
        await this.pbDisplay(_INTL("{1} can use items again!", battler.pbThis()));
        await battler.pbItemTerrainStatBoostCheck();
      });
      // Yawn
      await this.pbEORCountDownBattlerEffect(priority, PBEffects.Yawn, async (battler) => {
        if (battler.pbCanSleepYawn()) {
          PBDebug.log(`[Lingering effect] ${battler.pbThis()} fell asleep because of Yawn`);
          await battler.pbSleep();
        }
      });
      // Perish Song
      const perishSongUsers: number[] = [];
      for (const battler of priority) {
        if (battler.fainted() || battler.effects[PBEffects.PerishSong] === 0) continue;
        battler.effects[PBEffects.PerishSong] -= 1;
        await this.pbDisplay(_INTL("{1}'s perish count fell to {2}!", battler.pbThis(), battler.effects[PBEffects.PerishSong]));
        if (battler.effects[PBEffects.PerishSong] === 0) {
          perishSongUsers.push(battler.effects[PBEffects.PerishSongUser]);
          await battler.pbReduceHP(battler.hp);
        }
        await battler.pbItemHPHealCheck();
        if (battler.fainted()) await battler.pbFaint();
      }
      // Judge if all remaining Pokemon fainted by a Perish Song triggered by a single side
      if (perishSongUsers.length > 0 &&
          ((perishSongUsers.filter((idxBattler) => this.opposes(idxBattler)).length === perishSongUsers.length) ||
          (perishSongUsers.filter((idxBattler) => !this.opposes(idxBattler)).length === perishSongUsers.length))) {
        this.pbJudgeCheckpoint(this.battlers[perishSongUsers[0]!]!);
      }
      if (this.decision > 0) return;
    };
    await core();
    // --- Generation 9 Pack: counts down the remaining turns of the Splinter effect ---
    await this.pbEORCountDownBattlerEffect(priority, PBEffects.Splinters, async (battler) => {
      await this.pbDisplay(_INTL("{1} was freed from the jagged splinters!", battler.pbThis()));
      battler.effects[PBEffects.SplintersType] = null;
    });
  },

  //=============================================================================
  // End Of Round end effects that apply to one side of the field
  //=============================================================================
  /** Essentials Deluxe (Midbattle_Triggers.rb:166) redefines this to add midbattle triggers. */
  async pbEORCountDownSideEffect(this: Battle, side: number, effect: number, msg: string): Promise<void> {
    if (this.sides[side]!.effects[effect] <= 0) return;
    this.sides[side]!.effects[effect] -= 1;
    if (this.sides[side]!.effects[effect] === 0) {
      await this.pbDisplay(msg);
      const sym = dxConvertToPBEffect(effect, "side");
      if (sym) await this.scene.pbDeluxeTriggers?.(side, null, ["endTeamEffect", "endTeamEffect" + sym.toUpperCase()]);
    }
  },

  async pbEOREndSideEffects(this: Battle, side: number, _priority: Battler[]): Promise<void> {
    // --- Core Essentials ---
    // Reflect
    await this.pbEORCountDownSideEffect(side, PBEffects.Reflect,
      _INTL("{1}'s Reflect wore off!", this.battlers[side]!.pbTeam()));
    // Light Screen
    await this.pbEORCountDownSideEffect(side, PBEffects.LightScreen,
      _INTL("{1}'s Light Screen wore off!", this.battlers[side]!.pbTeam()));
    // Safeguard
    await this.pbEORCountDownSideEffect(side, PBEffects.Safeguard,
      _INTL("{1} is no longer protected by Safeguard!", this.battlers[side]!.pbTeam()));
    // Mist
    await this.pbEORCountDownSideEffect(side, PBEffects.Mist,
      _INTL("{1} is no longer protected by mist!", this.battlers[side]!.pbTeam()));
    // Tailwind
    await this.pbEORCountDownSideEffect(side, PBEffects.Tailwind,
      _INTL("{1}'s Tailwind petered out!", this.battlers[side]!.pbTeam()));
    // Lucky Chant
    await this.pbEORCountDownSideEffect(side, PBEffects.LuckyChant,
      _INTL("{1}'s Lucky Chant wore off!", this.battlers[side]!.pbTeam()));
    // Pledge Rainbow
    await this.pbEORCountDownSideEffect(side, PBEffects.Rainbow,
      _INTL("The rainbow on {1}'s side disappeared!", this.battlers[side]!.pbTeam(true)));
    // Pledge Sea of Fire
    await this.pbEORCountDownSideEffect(side, PBEffects.SeaOfFire,
      _INTL("The sea of fire around {1} disappeared!", this.battlers[side]!.pbTeam(true)));
    // Pledge Swamp
    await this.pbEORCountDownSideEffect(side, PBEffects.Swamp,
      _INTL("The swamp around {1} disappeared!", this.battlers[side]!.pbTeam(true)));
    // Aurora Veil
    await this.pbEORCountDownSideEffect(side, PBEffects.AuroraVeil,
      _INTL("{1}'s Aurora Veil wore off!", this.battlers[side]!.pbTeam()));
    // --- ZUD Mechanics: G-Max lingering effects ---
    // Vine Lash
    await this.pbEORCountDownSideEffect(side, PBEffects.VineLash,
      _INTL("{1} was released from G-Max Vine Lash's beating!", this.battlers[side]!.pbTeam()));
    // Wildfire
    await this.pbEORCountDownSideEffect(side, PBEffects.Wildfire,
      _INTL("{1} was released from G-Max Wildfire's flames!", this.battlers[side]!.pbTeam()));
    // Cannonade
    await this.pbEORCountDownSideEffect(side, PBEffects.Cannonade,
      _INTL("{1} was released from G-Max Cannonade's vortex!", this.battlers[side]!.pbTeam()));
    // Volcalith
    await this.pbEORCountDownSideEffect(side, PBEffects.Volcalith,
      _INTL("Rocks stopped being thrown out by G-Max Volcalith on {1}!", this.battlers[side]!.pbTeam(true)));
  },

  //=============================================================================
  // End Of Round end effects that apply to the whole field
  //=============================================================================
  /** Essentials Deluxe (Midbattle_Triggers.rb:176) redefines this to add midbattle triggers. */
  async pbEORCountDownFieldEffect(this: Battle, effect: number, msg: string): Promise<void> {
    if (this.field.effects[effect] <= 0) return;
    this.field.effects[effect] -= 1;
    if (this.field.effects[effect] > 0) return;
    await this.pbDisplay(msg);
    if (effect === PBEffects.MagicRoom) {
      for (const battler of this.pbPriority(true)) await battler.pbItemTerrainStatBoostCheck();
    }
    const sym = dxConvertToPBEffect(effect, "field");
    if (sym) await this.scene.pbDeluxeTriggers?.(null, null, ["endFieldEffect", "endFieldEffect" + sym.toUpperCase()]);
  },

  async pbEOREndFieldEffects(this: Battle, _priority: Battler[]): Promise<void> {
    // Trick Room
    await this.pbEORCountDownFieldEffect(PBEffects.TrickRoom,
      _INTL("The twisted dimensions returned to normal!"));
    // Gravity
    await this.pbEORCountDownFieldEffect(PBEffects.Gravity,
      _INTL("Gravity returned to normal!"));
    // Water Sport
    await this.pbEORCountDownFieldEffect(PBEffects.WaterSportField,
      _INTL("The effects of Water Sport have faded."));
    // Mud Sport
    await this.pbEORCountDownFieldEffect(PBEffects.MudSportField,
      _INTL("The effects of Mud Sport have faded."));
    // Wonder Room
    await this.pbEORCountDownFieldEffect(PBEffects.WonderRoom,
      _INTL("Wonder Room wore off, and Defense and Sp. Def stats returned to normal!"));
    // Magic Room
    await this.pbEORCountDownFieldEffect(PBEffects.MagicRoom,
      _INTL("Magic Room wore off, and held items' effects returned to normal!"));
  },

  //=============================================================================
  // End Of Round end terrain check
  //=============================================================================
  async pbEOREndTerrain(this: Battle): Promise<void> {
    // --- Core Essentials ---
    const core = async (): Promise<void> => {
      // Count down terrain duration
      if (this.field.terrainDuration > 0) this.field.terrainDuration -= 1;
      // Terrain wears off
      if (this.field.terrain !== "None" && this.field.terrainDuration === 0) {
        switch (this.field.terrain) {
          case "Electric":
            await this.pbDisplay(_INTL("The electric current disappeared from the battlefield!"));
            break;
          case "Grassy":
            await this.pbDisplay(_INTL("The grass disappeared from the battlefield!"));
            break;
          case "Misty":
            await this.pbDisplay(_INTL("The mist disappeared from the battlefield!"));
            break;
          case "Psychic":
            await this.pbDisplay(_INTL("The weirdness disappeared from the battlefield!"));
            break;
        }
        this.field.terrain = "None";
        for (const battler of this.allBattlers()) await battler.pbAbilityOnTerrainChange();
        // Start up the default terrain
        if (this.field.defaultTerrain !== "None") {
          await this.pbStartTerrain(null, this.field.defaultTerrain, false);
          for (const battler of this.allBattlers()) await battler.pbAbilityOnTerrainChange();
          for (const battler of this.allBattlers()) await battler.pbItemTerrainStatBoostCheck();
        }
        if (this.field.terrain === "None") return;
      }
      // Terrain continues
      const terrainData = BattleTerrain.tryGet(this.field.terrain);
      if (terrainData) await this.pbCommonAnimation(terrainData.animation!);
      switch (this.field.terrain) {
        case "Electric": await this.pbDisplay(_INTL("An electric current is running across the battlefield.")); break;
        case "Grassy": await this.pbDisplay(_INTL("Grass is covering the battlefield.")); break;
        case "Misty": await this.pbDisplay(_INTL("Mist is swirling about the battlefield.")); break;
        case "Psychic": await this.pbDisplay(_INTL("The battlefield is weird.")); break;
      }
    };
    // --- Essentials Deluxe: midbattle triggers for the terrain ending ---
    const oldTerrain = this.field.terrain;
    await core();
    const newTerrain = this.field.terrain;
    if (newTerrain === "None" && oldTerrain !== "None") {
      await this.scene.pbDeluxeTriggers?.(null, null, ["endTerrain", "endTerrain" + oldTerrain.toUpperCase()]);
    }
  },

  //=============================================================================
  // End Of Round end self-inflicted effects on battler
  //=============================================================================
  async pbEOREndBattlerSelfEffects(this: Battle, battler: Battler): Promise<void> {
    if (battler.fainted()) return;
    // Hyper Mode (Shadow Pokémon)
    if (battler.inHyperMode()) {
      if (this.pbRandom(100) < 10) {
        battler.pokemon!.hyperMode = false;
        await this.pbDisplay(_INTL("{1} came to its senses!", battler.pbThis()));
      } else {
        await this.pbDisplay(_INTL("{1} is in Hyper Mode!", battler.pbThis()));
      }
    }
    // Uproar
    if (battler.effects[PBEffects.Uproar] > 0) {
      battler.effects[PBEffects.Uproar] -= 1;
      if (battler.effects[PBEffects.Uproar] === 0) {
        await this.pbDisplay(_INTL("{1} calmed down.", battler.pbThis()));
      } else {
        await this.pbDisplay(_INTL("{1} is making an uproar!", battler.pbThis()));
      }
    }
    // Slow Start's end message
    if (battler.effects[PBEffects.SlowStart] > 0) {
      battler.effects[PBEffects.SlowStart] -= 1;
      if (battler.effects[PBEffects.SlowStart] === 0) {
        await this.pbDisplay(_INTL("{1} finally got its act together!", battler.pbThis()));
      }
    }
  },

  //=============================================================================
  // End Of Round shift distant battlers to middle positions
  //=============================================================================
  /** v20.1 Hotfixes (Battle bug fixes.rb:180): fixed error when shifting Pokémon (pbSideSize(pair[1])). */
  async pbEORShiftDistantBattlers(this: Battle): Promise<void> {
    // Move battlers around if none are near to each other
    // NOTE: This code assumes each side has a maximum of 3 battlers on it, and
    //       is not generalised to larger side sizes.
    if (!this.singleBattle()) {
      const swaps: [number, number][] = []; // Each element is an array of two battler indices to swap
      for (let side = 0; side < 2; side++) {
        if (this.pbSideSize(side) === 1) continue; // Only battlers on sides of size 2+ need to move
        // Check if any battler on this side is near any battler on the other side
        let anyNear = false;
        for (const battler of this.allSameSideBattlers(side)) {
          anyNear = this.allOtherSideBattlers(battler).some((other) => this.nearBattlers(other.index, battler.index));
          if (anyNear) break;
        }
        if (anyNear) break;
        // No battlers on this side are near any battlers on the other side; try
        // to move them
        // NOTE: If we get to here (assuming both sides are of size 3 or less),
        //       there is definitely only 1 able battler on this side, so we
        //       don't need to worry about multiple battlers trying to move into
        //       the same position. If you add support for a side of size 4+,
        //       this code will need revising to account for that, as well as to
        //       add more complex code to ensure battlers will end up near each
        //       other.
        for (const battler of this.allSameSideBattlers(side)) {
          // Get the position to move to
          let pos = -1;
          switch (this.pbSideSize(side)) {
            case 2: pos = [2, 3, 0, 1][battler.index] ?? -1; break; // The unoccupied position
            case 3: pos = side === 0 ? 2 : 3; break; // The centre position
          }
          if (pos < 0) continue;
          // Can't move if the same trainer doesn't control both positions
          const idxOwner = this.pbGetOwnerIndexFromBattlerIndex(battler.index);
          if (this.pbGetOwnerIndexFromBattlerIndex(pos) !== idxOwner) continue;
          swaps.push([battler.index, pos]);
        }
      }
      // Move battlers around
      for (const pair of swaps) {
        if (this.pbSideSize(pair[0]) === 2 && swaps.length > 1) continue;
        if (!this.pbSwapBattlers(pair[0], pair[1])) continue;
        switch (this.pbSideSize(pair[1])) {
          case 2:
            await this.pbDisplay(_INTL("{1} moved across!", this.battlers[pair[1]]!.pbThis()));
            break;
          case 3:
            await this.pbDisplay(_INTL("{1} moved to the center!", this.battlers[pair[1]]!.pbThis()));
            break;
        }
      }
    }
  },

  //=============================================================================
  // Main End Of Round phase method
  //=============================================================================
  /**
   * The patched pbEndOfRoundPhase: ZUD( Deluxe( Gen 9( Clauses( core ) ) ) ).
   * The core (with Clauses' sudden death check around it) is
   * pbEndOfRoundPhaseCore; its early returns don't skip the plugin parts here.
   */
  async pbEndOfRoundPhase(this: Battle): Promise<void> {
    // --- ZUD Mechanics: counts down Dynamax turns if the battle has ended ---
    if (this.decision > 0) {
      for (const battler of this.allBattlers()) {
        if (battler.effects[PBEffects.MaxRaidBoss]) continue;
        battler.effects[PBEffects.Dynamax] -= 1;
        if (battler.effects[PBEffects.Dynamax] === 0) await battler.unmax();
      }
      return;
    }
    // --- (Essentials Deluxe → Generation 9 Pack → Clauses →) core ---
    await this.pbEndOfRoundPhaseCore();
    // --- Generation 9 Pack: resets various effects at the end of round ---
    for (const battler of this.allBattlers()) {
      battler.effects[PBEffects.AllySwitch] = false;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9) {
        if (battler.effects[PBEffects.Charge] > 0) battler.effects[PBEffects.Charge] += 1;
      }
      if (battler.effects[PBEffects.GlaiveRush] > 0) battler.effects[PBEffects.GlaiveRush] -= 1;
    }
    // --- Essentials Deluxe: midbattle triggers for the end of the round ---
    const triggers = ["turnEnd", "turnEnd_" + String(1 + this.turnCount)];
    await this.scene.pbDeluxeTriggers?.(null, null, triggers);
    // --- ZUD Mechanics: resets to base moves if a Z-Move was selected; counts
    // down Dynamax turns and reverts each Pokemon whose Dynamax turns expired ---
    for (const battler of this.allBattlers()) {
      battler.effects[PBEffects.MaxGuard] = false;
      battler.powerIndex = -1;
      if (battler.selectedMoveIsZMove) {
        battler.displayBaseMoves();
        battler.selectedMoveIsZMove = false;
      }
      // Deferred: raid_EndOfRound(battler) — Max Raids (ZUD Mechanics/[009] Max Raid/Raid_Battle.rb:382)
      if (battler.effects[PBEffects.Dynamax] <= 0) continue;
      // Converts any newly-learned moves into Max Moves while Dynamaxed.
      if (!battler.effects[PBEffects.MaxRaidBoss]) {
        battler.moves.forEach((move, i) => {
          if (move.maxMove()) return;
          battler.baseMoves[i] = move;
          // NOTE (Ruby parity): Ruby then does `move = battler.convert_maxmove(move)`
          // and copies pp and total_pp onto the new Max Move, but only reassigns
          // the block's local variable, so battler.moves is unchanged
          // (Battle_Overrides.rb:240-244); building that discarded Max Move has no
          // other effect, so it's skipped here.
        });
      }
      battler.effects[PBEffects.Dynamax] -= 1;
      if (battler.effects[PBEffects.Dynamax] === 0) {
        if (!battler.effects[PBEffects.MaxRaidBoss]) await battler.unmax();
      }
      // Deferred: raid_EndOfRound2(battler) — Max Raids (ZUD Mechanics/[009] Max Raid/Raid_Battle.rb:432)
    }
  },

  /** Core Essentials' pbEndOfRoundPhase (wrapped by Clauses.ts, then by the plugins in pbEndOfRoundPhase). */
  async pbEndOfRoundPhaseCore(this: Battle): Promise<void> {
    PBDebug.log("");
    PBDebug.log("[End of round]");
    this.endOfRound = true;
    await this.scene.pbBeginEndOfRoundPhase();
    this.pbCalculatePriority(); // recalculate speeds
    const priority = this.pbPriority(true); // in order of fastest -> slowest speeds only
    // Weather
    await this.pbEOREndWeather(priority);
    // Future Sight/Doom Desire
    for (let idxPos = 0; idxPos < this.positions.length; idxPos++) {
      await this.pbEORUseFutureSight(this.positions[idxPos], idxPos);
    }
    // Wish
    await this.pbEORWishHealing();
    // Sea of Fire damage (Fire Pledge + Grass Pledge combination)
    await this.pbEORSeaOfFireDamage(priority);
    // Status-curing effects/abilities and HP-healing items
    for (const battler of priority) {
      await this.pbEORTerrainHealing(battler);
      // Healer, Hydration, Shed Skin
      if (battler.abilityActive()) {
        await AbilityEffects.triggerEndOfRoundHealing(battler.ability, battler, this);
      }
      // Black Sludge, Leftovers
      if (battler.itemActive()) {
        await ItemEffects.triggerEndOfRoundHealing(battler.item, battler, this);
      }
    }
    // Self-curing of status due to affection
    if (Settings.AFFECTION_EFFECTS && this.internalBattle) {
      for (const battler of priority) {
        if (battler.fainted() || battler.status === "NONE") continue;
        if (!battler.pbOwnedByPlayer() || battler.affectionLevel() < 4 || battler.mega()) continue;
        if (this.pbRandom(100) < 80) continue;
        const oldStatus = battler.status;
        await battler.pbCureStatus(false);
        switch (oldStatus) {
          case "SLEEP":
            await this.pbDisplay(_INTL("{1} shook itself awake so you wouldn't worry!", battler.pbThis()));
            break;
          case "POISON":
            await this.pbDisplay(_INTL("{1} managed to expel the poison so you wouldn't worry!", battler.pbThis()));
            break;
          case "BURN":
            await this.pbDisplay(_INTL("{1} healed its burn with its sheer determination so you wouldn't worry!", battler.pbThis()));
            break;
          case "PARALYSIS":
            await this.pbDisplay(_INTL("{1} gathered all its energy to break through its paralysis so you wouldn't worry!", battler.pbThis()));
            break;
          case "FROZEN":
            await this.pbDisplay(_INTL("{1} melted the ice with its fiery determination so you wouldn't worry!", battler.pbThis()));
            break;
        }
      }
    }
    // Healing from Aqua Ring, Ingrain, Leech Seed
    await this.pbEORHealingEffects(priority);
    // Damage from Hyper Mode (Shadow Pokémon)
    for (const battler of priority) {
      if (!battler.inHyperMode() || this.choices[battler.index]![0] !== "UseMove") continue;
      const hpLoss = Math.floor(battler.totalhp / 24);
      await this.scene.pbDamageAnimation(battler);
      await battler.pbReduceHP(hpLoss, false);
      await this.pbDisplay(_INTL("The Hyper Mode attack hurts {1}!", battler.pbThis(true)));
      if (battler.fainted()) await battler.pbFaint();
    }
    // Damage from poison/burn
    await this.pbEORStatusProblemDamage(priority);
    // Damage from Nightmare and Curse
    await this.pbEOREffectDamage(priority);
    // Trapping attacks (Bind/Clamp/Fire Spin/Magma Storm/Sand Tomb/Whirlpool/Wrap)
    for (const battler of priority) await this.pbEORTrappingDamage(battler);
    // Octolock
    for (const battler of priority) {
      if (battler.fainted() || battler.effects[PBEffects.Octolock] < 0) continue;
      await this.pbCommonAnimation("Octolock", battler);
      if (await battler.pbCanLowerStatStage("DEFENSE")) await battler.pbLowerStatStage("DEFENSE", 1, null);
      if (await battler.pbCanLowerStatStage("SPECIAL_DEFENSE")) await battler.pbLowerStatStage("SPECIAL_DEFENSE", 1, null);
      await battler.pbItemOnStatDropped();
    }
    // Effects that apply to a battler that wear off after a number of rounds
    await this.pbEOREndBattlerEffects(priority);
    // Check for end of battle (i.e. because of Perish Song)
    if (this.decision > 0) {
      await this.pbGainExp();
      return;
    }
    // Effects that apply to a side that wear off after a number of rounds
    for (let side = 0; side < 2; side++) await this.pbEOREndSideEffects(side, priority);
    // Effects that apply to the whole field that wear off after a number of rounds
    await this.pbEOREndFieldEffects(priority);
    // End of terrains
    await this.pbEOREndTerrain();
    for (const battler of priority) {
      // Self-inflicted effects that wear off after a number of rounds
      await this.pbEOREndBattlerSelfEffects(battler);
      // Bad Dreams, Moody, Speed Boost
      if (battler.abilityActive()) {
        await AbilityEffects.triggerEndOfRoundEffect(battler.ability, battler, this);
      }
      // Flame Orb, Sticky Barb, Toxic Orb
      if (battler.itemActive()) {
        await ItemEffects.triggerEndOfRoundEffect(battler.item, battler, this);
      }
      // Harvest, Pickup, Ball Fetch
      if (battler.abilityActive()) {
        await AbilityEffects.triggerEndOfRoundGainItem(battler.ability, battler, this);
      }
    }
    await this.pbGainExp();
    if (this.decision > 0) return;
    // Form checks
    for (const battler of priority) await battler.pbCheckForm(true);
    // Switch Pokémon in if possible
    await this.pbEORSwitch();
    if (this.decision > 0) return;
    // In battles with at least one side of size 3+, move battlers around if none
    // are near to any foes
    await this.pbEORShiftDistantBattlers();
    // Try to make Trace work, check for end of primordial weather
    for (const battler of priority) await battler.pbContinualAbilityChecks();
    // Reset/count down battler-specific effects (no messages)
    for (const battler of this.allBattlers()) {
      battler.effects[PBEffects.BanefulBunker] = false;
      if (battler.effects[PBEffects.Charge] > 0) battler.effects[PBEffects.Charge] -= 1;
      battler.effects[PBEffects.Counter] = -1;
      battler.effects[PBEffects.CounterTarget] = -1;
      battler.effects[PBEffects.Electrify] = false;
      battler.effects[PBEffects.Endure] = false;
      battler.effects[PBEffects.FirstPledge] = null;
      battler.effects[PBEffects.Flinch] = false;
      battler.effects[PBEffects.FocusPunch] = false;
      battler.effects[PBEffects.FollowMe] = 0;
      battler.effects[PBEffects.HelpingHand] = false;
      if (battler.effects[PBEffects.HyperBeam] > 0) battler.effects[PBEffects.HyperBeam] -= 1;
      battler.effects[PBEffects.KingsShield] = false;
      if (battler.effects[PBEffects.LaserFocus] > 0) battler.effects[PBEffects.LaserFocus] -= 1;
      if (battler.effects[PBEffects.LockOn] > 0) { // Also Mind Reader
        battler.effects[PBEffects.LockOn] -= 1;
        if (battler.effects[PBEffects.LockOn] === 0) battler.effects[PBEffects.LockOnPos] = -1;
      }
      battler.effects[PBEffects.MagicBounce] = false;
      battler.effects[PBEffects.MagicCoat] = false;
      battler.effects[PBEffects.MirrorCoat] = -1;
      battler.effects[PBEffects.MirrorCoatTarget] = -1;
      battler.effects[PBEffects.Obstruct] = false;
      battler.effects[PBEffects.Powder] = false;
      battler.effects[PBEffects.Prankster] = false;
      battler.effects[PBEffects.PriorityAbility] = false;
      battler.effects[PBEffects.PriorityItem] = false;
      battler.effects[PBEffects.Protect] = false;
      battler.effects[PBEffects.RagePowder] = false;
      battler.effects[PBEffects.Roost] = false;
      battler.effects[PBEffects.Snatch] = 0;
      battler.effects[PBEffects.SpikyShield] = false;
      battler.effects[PBEffects.Spotlight] = 0;
      if (battler.effects[PBEffects.ThroatChop] > 0) battler.effects[PBEffects.ThroatChop] -= 1;
      battler.lastHPLost = 0;
      battler.lastHPLostFromFoe = 0;
      battler.droppedBelowHalfHP = false;
      battler.statsDropped = false;
      battler.tookDamageThisRound = false;
      battler.tookPhysicalHit = false;
      battler.statsRaisedThisRound = false;
      battler.statsLoweredThisRound = false;
      battler.canRestoreIceFace = false;
      battler.lastRoundMoveFailed = battler.lastMoveFailed;
      battler.lastAttacker.length = 0;
      battler.lastFoeAttacker.length = 0;
    }
    // Reset/count down side-specific effects (no messages)
    for (let side = 0; side < 2; side++) {
      this.sides[side]!.effects[PBEffects.CraftyShield] = false;
      if (!this.sides[side]!.effects[PBEffects.EchoedVoiceUsed]) {
        this.sides[side]!.effects[PBEffects.EchoedVoiceCounter] = 0;
      }
      this.sides[side]!.effects[PBEffects.EchoedVoiceUsed] = false;
      this.sides[side]!.effects[PBEffects.MatBlock] = false;
      this.sides[side]!.effects[PBEffects.QuickGuard] = false;
      this.sides[side]!.effects[PBEffects.Round] = false;
      this.sides[side]!.effects[PBEffects.WideGuard] = false;
    }
    // Reset/count down field-specific effects (no messages)
    this.field.effects[PBEffects.IonDeluge] = false;
    if (this.field.effects[PBEffects.FairyLock] > 0) this.field.effects[PBEffects.FairyLock] -= 1;
    this.field.effects[PBEffects.FusionBolt] = false;
    this.field.effects[PBEffects.FusionFlare] = false;
    this.endOfRound = false;
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
