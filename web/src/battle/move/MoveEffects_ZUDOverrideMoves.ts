// Port of the new class of Plugins/ZUD Mechanics/[008] Overrides/Override_Moves.rb
// (:516 DoubleDamageOnDynamaxTargets). The rest of that file patches core move
// classes; those patches are folded into the classes in their core files (see
// each file's header). No other plugin patches this class.

import type { Battler } from "../battler/Battler";
import { Move, registerMoveClass } from "./Move";

//===============================================================================
// Behemoth Blade, Behemoth Bash, Dynamax Cannon
//===============================================================================
// Deals double damage vs Dynamax targets, except for Eternamax Eternatus.
//-------------------------------------------------------------------------------
export class DoubleDamageOnDynamaxTargets extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    if (target.dynamax() && !target.isSpecies("ETERNATUS")) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("DoubleDamageOnDynamaxTargets", DoubleDamageOnDynamaxTargets);
