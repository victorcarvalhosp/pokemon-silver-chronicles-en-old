// Port of Plugins/ZUD Mechanics/[007] Move Effects/MoveEffects_BattleSides.rb:
// Power Moves that apply effects to one side of the field (@team_effects:
// [effect, setting, message, focus]; see GeneralEffect in PowerMove_BaseEffects.ts).

import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import { PBEffects } from "../other/PBEffects";
import { registerPowerMoveClass } from "./Battle_PowerMove";
import { GeneralEffect, type TeamEffect } from "./PowerMove_BaseEffects";

/** The @team_effects = { :<side> => [[effect, setting, message]] } classes. */
function teamEffectClass(name: string, side: "allies" | "opponents", effects: TeamEffect[]): void {
  const cls = class extends GeneralEffect {
    constructor(battle: Battle, move: PokemonMove | null) {
      super(battle, move);
      this.teamEffects = { [side]: effects.map((e) => [...e] as TeamEffect) };
    }
  };
  Object.defineProperty(cls, "name", { value: name });
  registerPowerMoveClass(name, cls);
}

//===============================================================================
// Starts the Vine Lash effect on the opposing side for 4 turns. (G-Max Vine Lash)
//===============================================================================
teamEffectClass("ZUDStartVineLashOnFoeSide", "opponents", [[PBEffects.VineLash, 4, "{1} got trapped with vines!"]]);

//===============================================================================
// Starts the Wildfire effect on the opposing side for 4 turns. (G-Max Wildfire)
//===============================================================================
teamEffectClass("ZUDStartWildfireOnFoeSide", "opponents", [[PBEffects.Wildfire, 4, "{1} were surrounded by fire!"]]);

//===============================================================================
// Starts the Cannonade effect on the opposing side for 4 turns. (G-Max Cannonade)
//===============================================================================
teamEffectClass("ZUDStartCannonadeOnFoeSide", "opponents", [[PBEffects.Cannonade, 4, "{1} got caught in a vortex of water!"]]);

//===============================================================================
// Starts the Volcalith effect on the opposing side for 4 turns. (G-Max Volcalith)
//===============================================================================
teamEffectClass("ZUDStartVolcalithOnFoeSide", "opponents", [[PBEffects.Volcalith, 4, "{1} became surrounded by rocks!"]]);

//===============================================================================
// Entry hazard. Lays stealth rocks on the opposing side. (G-Max Stonesurge)
//===============================================================================
teamEffectClass("ZUDAddStealthRocksToFoeSide", "opponents",
  [[PBEffects.StealthRock, true, "Pointed stones float in the air around {1}!"]]);

//===============================================================================
// Entry hazard. Lays sharp steel on the opposing side. (G-Max Steelsurge)
//===============================================================================
teamEffectClass("ZUDAddSteelsurgeToFoeSide", "opponents",
  [[PBEffects.Steelsurge, true, "Sharp-pointed pieces of steel started floating around {1}!"]]);

//===============================================================================
// For 5 rounds, lowers power of attacks against the user's side. (G-Max Resonance)
//===============================================================================
teamEffectClass("ZUDStartAuroraVeilOnUserSide", "allies",
  [[PBEffects.AuroraVeil, 5, "{1} became stronger against physical and special moves!"]]);

//===============================================================================
// Ends terrain, all barriers and entry hazards for the target's side, and entry
// hazards for the user's side. (G-Max Wind Rage)
//===============================================================================
export class ZUDRemoveTerrainAndSideEffects extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.terrain = "None";
    this.teamEffects = {
      allies: [
        [PBEffects.Spikes, 0, "{1} blew away spikes!", true],
        [PBEffects.ToxicSpikes, 0, "{1} blew away poison spikes!", true],
        [PBEffects.StealthRock, false, "{1} blew away stealth rocks!", true],
        [PBEffects.Steelsurge, false, "{1} blew away the pointed steel!", true],
        [PBEffects.StickyWeb, false, "{1} blew away sticky webs!", true],
      ],
      opponents: [
        [PBEffects.AuroraVeil, 0, "{1}'s Aurora Veil wore off!"],
        [PBEffects.LightScreen, 0, "{1}'s Light Screen wore off!"],
        [PBEffects.Reflect, 0, "{1}'s Reflect wore off!"],
        [PBEffects.Mist, 0, "{1}'s Mist faded!"],
        [PBEffects.Safeguard, 0, "{1} is no longer protected by Safeguard!"],
        [PBEffects.Spikes, 0, "{1} blew away spikes!", true],
        [PBEffects.ToxicSpikes, 0, "{1} blew away poison spikes!", true],
        [PBEffects.StealthRock, false, "{1} blew away stealth rocks!", true],
        [PBEffects.Steelsurge, false, "{1} blew away the pointed steel!", true],
        [PBEffects.StickyWeb, false, "{1} blew away sticky webs!", true],
      ],
    };
  }
}
registerPowerMoveClass("ZUDRemoveTerrainAndSideEffects", ZUDRemoveTerrainAndSideEffects);
