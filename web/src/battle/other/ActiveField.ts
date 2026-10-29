// Port of Data/Scripts/011_Battle/006_Other battle code/002_Battle_ActiveField.rb
// (+ ZUD Mechanics' ActiveSide#initialize: [003] Battle/Battle_Overrides.rb:6).

import type { Id } from "../../data/gameData/gameData";
import { type EffectsArray, PBEffects } from "./PBEffects";

//===============================================================================
//
//===============================================================================
export class ActiveField {
  effects: EffectsArray;
  defaultWeather: Id;
  weather: Id;
  weatherDuration: number;
  defaultTerrain: Id;
  terrain: Id;
  terrainDuration: number;

  constructor() {
    this.effects = [];
    this.effects[PBEffects.AmuletCoin] = false;
    this.effects[PBEffects.FairyLock] = 0;
    this.effects[PBEffects.FusionBolt] = false;
    this.effects[PBEffects.FusionFlare] = false;
    this.effects[PBEffects.Gravity] = 0;
    this.effects[PBEffects.HappyHour] = false;
    this.effects[PBEffects.IonDeluge] = false;
    this.effects[PBEffects.MagicRoom] = 0;
    this.effects[PBEffects.MudSportField] = 0;
    this.effects[PBEffects.PayDay] = 0;
    this.effects[PBEffects.TrickRoom] = 0;
    this.effects[PBEffects.WaterSportField] = 0;
    this.effects[PBEffects.WonderRoom] = 0;
    this.defaultWeather = "None";
    this.weather = "None";
    this.weatherDuration = 0;
    this.defaultTerrain = "None";
    this.terrain = "None";
    this.terrainDuration = 0;
  }
}

//===============================================================================
//
//===============================================================================
export class ActiveSide {
  effects: EffectsArray;

  constructor() {
    this.effects = [];
    this.effects[PBEffects.AuroraVeil] = 0;
    this.effects[PBEffects.CraftyShield] = false;
    this.effects[PBEffects.EchoedVoiceCounter] = 0;
    this.effects[PBEffects.EchoedVoiceUsed] = false;
    this.effects[PBEffects.LastRoundFainted] = -1;
    this.effects[PBEffects.LightScreen] = 0;
    this.effects[PBEffects.LuckyChant] = 0;
    this.effects[PBEffects.MatBlock] = false;
    this.effects[PBEffects.Mist] = 0;
    this.effects[PBEffects.QuickGuard] = false;
    this.effects[PBEffects.Rainbow] = 0;
    this.effects[PBEffects.Reflect] = 0;
    this.effects[PBEffects.Round] = false;
    this.effects[PBEffects.Safeguard] = 0;
    this.effects[PBEffects.SeaOfFire] = 0;
    this.effects[PBEffects.Spikes] = 0;
    this.effects[PBEffects.StealthRock] = false;
    this.effects[PBEffects.StickyWeb] = false;
    this.effects[PBEffects.Swamp] = 0;
    this.effects[PBEffects.Tailwind] = 0;
    this.effects[PBEffects.ToxicSpikes] = 0;
    this.effects[PBEffects.WideGuard] = false;
    // ZUD Mechanics
    this.effects[PBEffects.Cannonade] = 0;
    this.effects[PBEffects.Steelsurge] = false;
    this.effects[PBEffects.VineLash] = 0;
    this.effects[PBEffects.Volcalith] = 0;
    this.effects[PBEffects.Wildfire] = 0;
    this.effects[PBEffects.ZHeal] = false;
  }
}

//===============================================================================
//
//===============================================================================
export class ActivePosition {
  effects: EffectsArray;

  constructor() {
    this.effects = [];
    this.effects[PBEffects.FutureSightCounter] = 0;
    this.effects[PBEffects.FutureSightMove] = null;
    this.effects[PBEffects.FutureSightUserIndex] = -1;
    this.effects[PBEffects.FutureSightUserPartyIndex] = -1;
    this.effects[PBEffects.HealingWish] = false;
    this.effects[PBEffects.LunarDance] = false;
    this.effects[PBEffects.Wish] = 0;
    this.effects[PBEffects.WishAmount] = 0;
    this.effects[PBEffects.WishMaker] = -1;
  }
}
