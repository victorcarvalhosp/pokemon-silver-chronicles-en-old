// Port of Plugins/ZUD Mechanics/[007] Move Effects/MoveEffects_BattleField.rb:
// Power Moves that apply effects to the entire field (@weather, @terrain and
// @field: [effect, setting, message]; see GeneralEffect in PowerMove_BaseEffects.ts).

import type { Id } from "../../data/gameData/gameData";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import { PBEffects } from "../other/PBEffects";
import { registerPowerMoveClass } from "./Battle_PowerMove";
import { GeneralEffect } from "./PowerMove_BaseEffects";

/** The @weather = .../@terrain = ... classes. */
export function weatherTerrainClass(name: string, weather: Id | null, terrain: Id | null): void {
  const cls = class extends GeneralEffect {
    constructor(battle: Battle, move: PokemonMove | null) {
      super(battle, move);
      if (weather) this.weather = weather;
      if (terrain) this.terrain = terrain;
    }
  };
  Object.defineProperty(cls, "name", { value: name });
  registerPowerMoveClass(name, cls);
}

//===============================================================================
// Starts sunny weather. (Max Flare)
//===============================================================================
weatherTerrainClass("ZUDStartSunWeather", "Sun", null);

//===============================================================================
// Starts rainy weather. (Max Geyser)
//===============================================================================
weatherTerrainClass("ZUDStartRainWeather", "Rain", null);

//===============================================================================
// Starts sandstorm weather. (Max Rockfall)
//===============================================================================
weatherTerrainClass("ZUDStartSandstormWeather", "Sandstorm", null);

//===============================================================================
// Starts hail weather. (Max Hailstorm)
//===============================================================================
weatherTerrainClass("ZUDStartHailWeather", "Hail", null);

//===============================================================================
// Starts grassy terrain. (Max Overgrowth)
//===============================================================================
weatherTerrainClass("ZUDStartGrassyTerrain", null, "Grassy");

//===============================================================================
// Starts electric terrain. (Max Lightning)
//===============================================================================
weatherTerrainClass("ZUDStartElectricTerrain", null, "Electric");

//===============================================================================
// Starts misty terrain. (Max Starfall)
//===============================================================================
weatherTerrainClass("ZUDStartMistyTerrain", null, "Misty");

//===============================================================================
// Starts psychic terrain. (Genesis Supernova, Max Mindstorm)
//===============================================================================
weatherTerrainClass("ZUDStartPsychicTerrain", null, "Psychic");

//===============================================================================
// Removes any active terrain. (Splintered Stormshards)
//===============================================================================
weatherTerrainClass("ZUDRemoveTerrain", null, "None");

//===============================================================================
// Starts gravity. (G-Max Gravitas)
//===============================================================================
export class ZUDStartGravity extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.field = [[PBEffects.Gravity, 5, "Gravity intensified!"]];
  }
}
registerPowerMoveClass("ZUDStartGravity", ZUDStartGravity);
