// Port of Plugins/ZUD Mechanics/[004] Battle_Battler/Battler_MoveConversion.rb:
// converting a battler's moves into Z-Moves/Max Moves (display_power_moves,
// convert_zmove, convert_maxmove) and retyping a Power Move from its base
// move's type (calc_power_move). Essentials Deluxe's display_base_moves (the
// way back) is in battler/Battler_ChangeSelf.ts.

import type { Id } from "../../data/gameData/gameData";
import { Type } from "../../data/gameData/type";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { PowerMove, powerMoveParam } from "./Battle_PowerMove";

const methods = {
  //-----------------------------------------------------------------------------
  // Converts base moves into Power Moves.
  //-----------------------------------------------------------------------------
  displayPowerMoves(this: Battler, mode: number | string = 0): void {
    // Set "mode" to 1 to convert to Z-Moves.
    // Set "mode" to 2 to convert to Max Moves.
    const transform = this.effects[PBEffects.TransformSpecies] as Id | null;
    for (let i = 0; i < this.moves.length; i++) {
      this.baseMoves.push(this.moves[i]!);
      const baseMove = this.baseMoves[i] as Move;
      switch (mode) {
        // Z-Moves
        case 1: case "Z-Move":
          if (!this.pokemon!.compatZmove(powerMoveParam(this.moves[i]!), null, transform)) continue;
          this.moves[i] = this.convertZmove(this.moves[i]!, this.pokemon!.itemId, transform);
          this.moves[i]!.pp = Math.min(1, baseMove.pp);
          this.moves[i]!.setTotalPp(1);
          break;
        // Max Moves
        case 2: case "Max Move":
          this.moves[i] = this.convertMaxmove(this.moves[i]!, transform);
          this.moves[i]!.pp = baseMove.pp;
          this.moves[i]!.setTotalPp(baseMove.totalPp());
          break;
      }
    }
  },

  //-----------------------------------------------------------------------------
  // Gets a battler's Z-Move based on the inputted base move.
  //-----------------------------------------------------------------------------
  convertZmove(this: Battler, move: Move, item: Id | null = null, transform: Id | null = null): Move {
    let pokeMove: PokemonMove;
    if (move.statusMove()) {
      pokeMove = new PokemonMove(move.id);
    } else {
      const id = this.pokemon!.getZmove(powerMoveParam(move), item, transform);
      pokeMove = new PokemonMove(id!);
    }
    pokeMove.oldMove = move;
    return PowerMove.fromPokemonMove(this.battle, pokeMove);
  },

  //-----------------------------------------------------------------------------
  // Gets a battler's Max Move based on the inputted base move.
  //-----------------------------------------------------------------------------
  convertMaxmove(this: Battler, move: Move, transform: Id | null = null): Move {
    const id = this.pokemon!.getMaxmove(powerMoveParam(move), move.category, transform);
    const pokeMove = new PokemonMove(id!);
    pokeMove.oldMove = move;
    return PowerMove.fromPokemonMove(this.battle, pokeMove);
  },

  //-----------------------------------------------------------------------------
  // Effects that may change a Power Move into one of a different type.
  //-----------------------------------------------------------------------------
  calcPowerMove(this: Battler, move: Move): Move {
    if (move.powerMove()) {
      const baseMove = this.baseMoves[this.powerIndex] as Move;
      if (move.function === "ZUDProtectUser") return move;
      if (["TypeDependsOnUserIVs",
        "TypeAndPowerDependOnUserBerry"].includes(baseMove.function)) return move;
      const newtype = baseMove.pbCalcType(this);
      if (newtype && Type.exists(newtype) && newtype !== move.type) {
        const transform = this.effects[PBEffects.TransformSpecies] as Id | null;
        if (move.zMove()) {
          const zMove = this.pokemon!.getZmove(newtype, null, transform);
          const pokeMove = new PokemonMove(zMove!);
          pokeMove.oldMove = baseMove;
          return PowerMove.fromPokemonMove(this.battle, pokeMove);
        } else if (move.maxMove()) {
          const maxMove = this.pokemon!.getMaxmove(newtype, null, transform);
          const pokeMove = new PokemonMove(maxMove!);
          pokeMove.oldMove = baseMove;
          return PowerMove.fromPokemonMove(this.battle, pokeMove);
        }
      }
    }
    return move;
  },
};

type Methods = typeof methods;
declare module "../battler/Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
