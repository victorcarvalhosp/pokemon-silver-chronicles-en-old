// Port of Plugins/ZUD Mechanics/[007] Move Effects/MoveEffects_BattlerStats.rb:
// Power Moves that alter stat stages (@stat_changes; see GeneralEffect in
// PowerMove_BaseEffects.ts for the format).

import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import { registerPowerMoveClass } from "./Battle_PowerMove";
import { GeneralEffect } from "./PowerMove_BaseEffects";

//===============================================================================
// Raises all of the user's stats by 1 stage. (Clangorus Soulblaze)
//===============================================================================
export class ZUDRaiseUserMainStats1 extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statChanges = {
      user: [
        "ATTACK", 1,
        "DEFENSE", 1,
        "SPECIAL_ATTACK", 1,
        "SPECIAL_DEFENSE", 1,
        "SPEED", 1,
      ],
    };
  }
}
registerPowerMoveClass("ZUDRaiseUserMainStats1", ZUDRaiseUserMainStats1);

//===============================================================================
// Raises all of the user's stats by 2 stages. (Extreme Evoboost)
//===============================================================================
export class ZUDRaiseUserMainStats2 extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statChanges = {
      user: [
        "ATTACK", 2,
        "DEFENSE", 2,
        "SPECIAL_ATTACK", 2,
        "SPECIAL_DEFENSE", 2,
        "SPEED", 2,
      ],
    };
  }
}
registerPowerMoveClass("ZUDRaiseUserMainStats2", ZUDRaiseUserMainStats2);

/** The @stat_changes = { :<recipients> => [stat, stage] } classes. */
function statChangeClass(name: string, recipients: "allies" | "opponents", stat: string, stage: number): void {
  const cls = class extends GeneralEffect {
    constructor(battle: Battle, move: PokemonMove | null) {
      super(battle, move);
      this.statChanges = { [recipients]: [stat, stage] };
    }
  };
  Object.defineProperty(cls, "name", { value: name });
  registerPowerMoveClass(name, cls);
}

//===============================================================================
// Raises the Attack of the user and its allies by 1 stage. (Max Knuckle)
//===============================================================================
statChangeClass("ZUDRaiseUserAndAlliesAtk1", "allies", "ATTACK", 1);

//===============================================================================
// Raises the Defense of the user and its allies by 1 stage. (Max Steelspike)
//===============================================================================
statChangeClass("ZUDRaiseUserAndAlliesDef1", "allies", "DEFENSE", 1);

//===============================================================================
// Raises the Sp.Atk of the user and its allies by 1 stage. (Max Ooze)
//===============================================================================
statChangeClass("ZUDRaiseUserAndAlliesSpAtk1", "allies", "SPECIAL_ATTACK", 1);

//===============================================================================
// Raises the Sp.Def of the user and its allies by 1 stage. (Max Quake)
//===============================================================================
statChangeClass("ZUDRaiseUserAndAlliesSpDef1", "allies", "SPECIAL_DEFENSE", 1);

//===============================================================================
// Raises the Speed of the user and its allies by 1 stage. (Max Airstream)
//===============================================================================
statChangeClass("ZUDRaiseUserAndAlliesSpeed1", "allies", "SPEED", 1);

//===============================================================================
// Lowers the Attack of the target and its allies by 1 stage. (Max Wyrmwind)
//===============================================================================
statChangeClass("ZUDLowerAllFoesAtk1", "opponents", "ATTACK", -1);

//===============================================================================
// Lowers the Defense of the target and its allies by 1 stage. (Max Phantasm)
//===============================================================================
statChangeClass("ZUDLowerAllFoesDef1", "opponents", "DEFENSE", -1);

//===============================================================================
// Lowers the Sp.Atk of the target and its allies by 1 stage. (Max Flutterby)
//===============================================================================
statChangeClass("ZUDLowerAllFoesSpAtk1", "opponents", "SPECIAL_ATTACK", -1);

//===============================================================================
// Lowers the Sp.Def of the target and its allies by 1 stage. (Max Darkness)
//===============================================================================
statChangeClass("ZUDLowerAllFoesSpDef1", "opponents", "SPECIAL_DEFENSE", -1);

//===============================================================================
// Lowers the Speed of the target and its allies by 1 stage. (Max Strike)
//===============================================================================
statChangeClass("ZUDLowerAllFoesSpeed1", "opponents", "SPEED", -1);

//===============================================================================
// Lowers the Speed of the target and its allies by 2 stages. (G-Max Foamburst)
//===============================================================================
statChangeClass("ZUDLowerAllFoesSpeed2", "opponents", "SPEED", -2);

//===============================================================================
// Lowers the Evasion of the target and its allies by 1 stage. (G-Max Tartness)
//===============================================================================
statChangeClass("ZUDLowerAllFoesEvasion1", "opponents", "EVASION", -1);
