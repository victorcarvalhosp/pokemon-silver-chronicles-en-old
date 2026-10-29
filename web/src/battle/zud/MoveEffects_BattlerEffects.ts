// Port of Plugins/ZUD Mechanics/[007] Move Effects/MoveEffects_BattlerEffects.rb:
// Power Moves that apply effects on battlers (@battler_effects: [effect,
// setting, message, chance]; see GeneralEffect in PowerMove_BaseEffects.ts).

import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import { PBEffects } from "../other/PBEffects";
import { registerPowerMoveClass } from "./Battle_PowerMove";
import { GeneralEffect } from "./PowerMove_BaseEffects";

//===============================================================================
// Increases the critical hit rate of the user and its allies. (G-Max Chi Strike)
//===============================================================================
export class ZUDRaiseUserAndAlliesCriticalHitRate1 extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.battlerEffects = {
      allies: [[PBEffects.CriticalBoost, 1, "{1} is getting pumped!"]],
    };
  }
}
registerPowerMoveClass("ZUDRaiseUserAndAlliesCriticalHitRate1", ZUDRaiseUserAndAlliesCriticalHitRate1);

//===============================================================================
// May make the target drowsy; it falls asleep at the end of the next turn. (G-Max Snooze)
// Effect chance is set here to prevent Sheer Force and Serene Grace from triggering.
//===============================================================================
export class ZUDYawnTarget extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.battlerEffects = {
      target: [[PBEffects.Yawn, 2, "{1} became drowsy!", 50]],
    };
  }
}
registerPowerMoveClass("ZUDYawnTarget", ZUDYawnTarget);

//===============================================================================
// Opposing Pokemon become subjected to the Torment effect. (G-Max Meltdown)
//===============================================================================
export class ZUDTormentAllFoes extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.battlerEffects = {
      opponents: [[PBEffects.Torment, true, "{1} was subjected to torment!"]],
    };
  }
}
registerPowerMoveClass("ZUDTormentAllFoes", ZUDTormentAllFoes);
