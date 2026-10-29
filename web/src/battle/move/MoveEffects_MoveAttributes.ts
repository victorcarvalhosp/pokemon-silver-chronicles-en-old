// Port of Data/Scripts/011_Battle/003_Move/008_MoveEffects_MoveAttributes.rb —
// PARTIAL: only the classes the Ruby reference tests use. The rest of this file
// is ported separately; add the remaining classes here in the Ruby file's order.

import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { registerMoveClass } from "./Move";
import { FixedDamageMove } from "./Move_BaseEffects";

//===============================================================================
// Inflicts damage equal to the user's level. (Night Shade, Seismic Toss)
//===============================================================================
export class FixedDamageUserLevel extends FixedDamageMove {
  constructor(battle: Battle, move: PokemonMove | null) { super(battle, move); }

  override pbFixedDamage(user: Battler, _target: Battler): number {
    return user.level;
  }
}
registerMoveClass("FixedDamageUserLevel", FixedDamageUserLevel);
