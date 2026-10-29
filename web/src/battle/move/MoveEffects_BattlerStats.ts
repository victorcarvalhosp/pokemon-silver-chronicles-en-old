// Port of Data/Scripts/011_Battle/003_Move/006_MoveEffects_BattlerStats.rb —
// PARTIAL: only the first few one-stage stat moves the headless battle tests
// use. The rest of this file (and 005, 007-013) is ported separately; add the
// remaining classes here in the Ruby file's order.

import { registerMoveClass } from "./Move";
import { StatUpMove, TargetStatDownMove } from "./Move_BaseEffects";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";

//===============================================================================
// Increases the user's Attack by 1 stage.
//===============================================================================
export class RaiseUserAttack1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1];
  }
}
registerMoveClass("RaiseUserAttack1", RaiseUserAttack1);

//===============================================================================
// Increases the user's Defense by 1 stage. (Harden, Steel Wing, Withdraw)
//===============================================================================
export class RaiseUserDefense1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["DEFENSE", 1];
  }
}
registerMoveClass("RaiseUserDefense1", RaiseUserDefense1);

//===============================================================================
// Decreases the target's Attack by 1 stage.
//===============================================================================
export class LowerTargetAttack1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1];
  }
}
registerMoveClass("LowerTargetAttack1", LowerTargetAttack1);

//===============================================================================
// Decreases the target's Defense by 1 stage.
//===============================================================================
export class LowerTargetDefense1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 1];
  }
}
registerMoveClass("LowerTargetDefense1", LowerTargetDefense1);

//===============================================================================
// Decreases the target's accuracy by 1 stage.
//===============================================================================
export class LowerTargetAccuracy1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ACCURACY", 1];
  }
}
registerMoveClass("LowerTargetAccuracy1", LowerTargetAccuracy1);
