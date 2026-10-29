// Port of Data/Scripts/011_Battle/001_Battle/004_Battle_ActionAttacksPriority.rb,
// with the plugin patches to these methods:
// - ZUD Mechanics ([003] Battle/Battle_Overrides.rb:67) rewrites pbCanChooseMove?;
//   that rewrite is ported in Battle_CommandPhase.ts (pbCanChooseMove /
//   pbCanChooseMoveAsync), not here, to avoid two definitions.
//
// Battler#pbCanChooseMove (Battler_UseMoveSuccessChecks.ts) is async, so
// pbCanChooseAnyMove, pbAutoChooseMove and pbRegisterMove are async and must
// be awaited (also by the AI).

import { _INTL, type Id } from "../../data/gameData/gameData";
import type { Target } from "../../data/gameData/target";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battle } from "./Battle";

/**
 * An entry of @priority: [battler, speed, sub-priority from ability,
 * sub-priority from item, final sub-priority, priority, tie-breaker order].
 */
export type PriorityEntry = [Battler, number, number, number, number, number, number];

/** Ruby's <=> for numbers. */
const cmp = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);

const methods = {
  //=============================================================================
  // Choosing a move/target
  //=============================================================================
  // pbCanChooseMove? (ZUD Mechanics' rewrite, Battle_Overrides.rb:67) is ported
  // in Battle_CommandPhase.ts as pbCanChooseMove (sync, no messages) and
  // pbCanChooseMoveAsync(idxBattler, idxMove, showMessages, sleepTalk).

  /** pbCanChooseAnyMove? */
  async pbCanChooseAnyMove(this: Battle, idxBattler: number, sleepTalk = false): Promise<boolean> {
    const battler = this.battlers[idxBattler]!;
    for (let i = 0; i < battler.moves.length; i++) {
      const m = battler.moves[i]!;
      if (m.pp === 0 && m.totalPp() > 0 && !sleepTalk) continue;
      if (battler.effects[PBEffects.Encore] > 0) {
        const idxEncoredMove = battler.pbEncoredMoveIndex();
        if (idxEncoredMove >= 0 && i !== idxEncoredMove) continue;
      }
      if (!(await battler.pbCanChooseMove(m, true, false, sleepTalk))) continue;
      return true;
    }
    return false;
  },

  /**
   * Called when the Pokémon is Encored, or if it can't use any of its moves.
   * Makes the Pokémon use the Encored move (if Encored), or Struggle.
   */
  async pbAutoChooseMove(this: Battle, idxBattler: number, showMessages = true): Promise<boolean> {
    const battler = this.battlers[idxBattler]!;
    if (battler.fainted()) {
      this.pbClearChoice(idxBattler);
      return true;
    }
    // Encore
    const idxEncoredMove = battler.pbEncoredMoveIndex();
    if (idxEncoredMove >= 0 && (await this.pbCanChooseMoveAsync(idxBattler, idxEncoredMove, false))) {
      const encoreMove = battler.moves[idxEncoredMove]!;
      const choice = this.choices[idxBattler]!;
      choice[0] = "UseMove"; // "Use move"
      choice[1] = idxEncoredMove; // Index of move to be used
      choice[2] = encoreMove; // Battle::Move object
      choice[3] = -1; // No target chosen yet
      if (this.singleBattle()) return true;
      if (this.pbOwnedByPlayer(idxBattler)) {
        if (showMessages) {
          await this.pbDisplayPaused(_INTL("{1} has to use {2}!", battler.name, encoreMove.name));
        }
        return await this.pbChooseTarget(battler, encoreMove);
      }
      return true;
    }
    // Struggle
    if (this.pbOwnedByPlayer(idxBattler) && showMessages) {
      await this.pbDisplayPaused(_INTL("{1} has no moves left!", battler.name));
    }
    const choice = this.choices[idxBattler]!;
    choice[0] = "UseMove"; // "Use move"
    choice[1] = -1; // Index of move to be used
    choice[2] = this.struggle; // Struggle Battle::Move object
    choice[3] = -1; // No target chosen yet
    return true;
  },

  async pbRegisterMove(this: Battle, idxBattler: number, idxMove: number, showMessages = true): Promise<boolean> {
    const battler = this.battlers[idxBattler]!;
    const move = battler.moves[idxMove];
    if (!(await this.pbCanChooseMoveAsync(idxBattler, idxMove, showMessages))) return false;
    const choice = this.choices[idxBattler]!;
    choice[0] = "UseMove"; // "Use move"
    choice[1] = idxMove; // Index of move to be used
    choice[2] = move; // Battle::Move object
    choice[3] = -1; // No target chosen yet
    return true;
  },

  /** pbChoseMove? */
  pbChoseMove(this: Battle, idxBattler: number, moveID: Id): boolean {
    if (!this.battlers[idxBattler] || this.battlers[idxBattler].fainted()) return false;
    const choice = this.choices[idxBattler]!;
    if (choice[0] === "UseMove" && choice[1] != null && choice[1] !== false) {
      return (choice[2] as Move).id === moveID;
    }
    return false;
  },

  /** pbChoseMoveFunctionCode? */
  pbChoseMoveFunctionCode(this: Battle, idxBattler: number, code: string): boolean {
    if (this.battlers[idxBattler]!.fainted()) return false;
    const choice = this.choices[idxBattler]!;
    if (choice[0] === "UseMove" && choice[1] != null && choice[1] !== false) {
      return (choice[2] as Move).function === code;
    }
    return false;
  },

  pbRegisterTarget(this: Battle, idxBattler: number, idxTarget: number): void {
    this.choices[idxBattler]![3] = idxTarget; // Set target of move
  },

  /**
   * pbMoveCanTarget? — Returns whether the idxTarget will be targeted by a move
   * with target_data used by a battler in idxUser.
   */
  pbMoveCanTarget(this: Battle, idxUser: number, idxTarget: number, targetData: Target): boolean {
    if (targetData.numTargets === 0) return false;
    switch (targetData.id) {
      case "NearAlly":
        if (this.opposes(idxUser, idxTarget)) return false;
        if (!this.nearBattlers(idxUser, idxTarget)) return false;
        break;
      case "UserOrNearAlly":
        if (idxUser === idxTarget) return true;
        if (this.opposes(idxUser, idxTarget)) return false;
        if (!this.nearBattlers(idxUser, idxTarget)) return false;
        break;
      case "AllAllies":
        if (idxUser === idxTarget) return false;
        if (this.opposes(idxUser, idxTarget)) return false;
        break;
      case "UserAndAllies":
        if (this.opposes(idxUser, idxTarget)) return false;
        break;
      case "NearFoe": case "RandomNearFoe": case "AllNearFoes":
        if (!this.opposes(idxUser, idxTarget)) return false;
        if (!this.nearBattlers(idxUser, idxTarget)) return false;
        break;
      case "Foe":
        if (!this.opposes(idxUser, idxTarget)) return false;
        break;
      case "AllFoes":
        if (!this.opposes(idxUser, idxTarget)) return false;
        break;
      case "NearOther": case "AllNearOthers":
        if (!this.nearBattlers(idxUser, idxTarget)) return false;
        break;
      case "Other":
        if (idxUser === idxTarget) return false;
        break;
    }
    return true;
  },

  //=============================================================================
  // Turn order calculation (priority)
  //=============================================================================
  pbCalculatePriority(this: Battle, fullCalc = false, indexArray: number[] | null = null): void {
    // @priority holds 7-element entries (see PriorityEntry); @choices entries get
    // a 5th element (the move's priority) here.
    const priority = this.priority as unknown as PriorityEntry[];
    let needRearranging = false;
    if (fullCalc) {
      this.priorityTrickRoom = (this.field.effects[PBEffects.TrickRoom] > 0);
      // Recalculate everything from scratch
      const randomOrder = Array.from({ length: this.maxBattlerIndex() + 1 }, (_, i) => i);
      for (let i = 0; i < randomOrder.length - 1; i++) { // Can't use shuffle! here
        const r = i + this.pbRandom(randomOrder.length - i);
        [randomOrder[i], randomOrder[r]] = [randomOrder[r]!, randomOrder[i]!];
      }
      priority.length = 0;
      for (let i = 0; i <= this.maxBattlerIndex(); i++) {
        const b = this.battlers[i];
        if (!b) continue;
        // [battler, speed, sub-priority from ability, sub-priority from item,
        //  final sub-priority, priority, tie-breaker order]
        const entry: PriorityEntry = [b, b.pbSpeed(), 0, 0, 0, 0, randomOrder[i]!];
        const choice = this.choices[b.index]! as unknown as unknown[];
        if (choice[0] === "UseMove" || choice[0] === "Shift") {
          // Calculate move's priority
          if (choice[0] === "UseMove") {
            const move = choice[2] as Move;
            let pri = move.pbPriority(b);
            if (b.abilityActive()) {
              pri = AbilityEffects.triggerPriorityChange(b.ability, b, move, pri);
            }
            entry[5] = pri;
            choice[4] = pri;
          }
          // Calculate sub-priority changes (first/last within priority bracket)
          // Abilities (Stall)
          if (b.abilityActive()) {
            entry[2] = AbilityEffects.triggerPriorityBracketChange(b.ability, b, this);
          }
          // Items (Quick Claw, Custap Berry, Lagging Tail, Full Incense)
          if (b.itemActive()) {
            entry[3] = ItemEffects.triggerPriorityBracketChange(b.item, b, this);
          }
        }
        priority.push(entry);
      }
      needRearranging = true;
    } else {
      if ((this.field.effects[PBEffects.TrickRoom] > 0) !== this.priorityTrickRoom) {
        needRearranging = true;
        this.priorityTrickRoom = (this.field.effects[PBEffects.TrickRoom] > 0);
      }
      // Recheck all battler speeds and changes to priority caused by abilities
      for (const entry of priority) {
        if (!entry) continue;
        if (indexArray && !indexArray.includes(entry[0].index)) continue;
        // Recalculate speed of battler
        const newSpeed = entry[0].pbSpeed();
        if (newSpeed !== entry[1]) needRearranging = true;
        entry[1] = newSpeed;
        // Recalculate move's priority in case ability has changed
        const choice = this.choices[entry[0].index]! as unknown as unknown[];
        if (choice[0] === "UseMove") {
          const move = choice[2] as Move;
          let pri = move.pbPriority(entry[0]);
          if (entry[0].abilityActive()) {
            pri = AbilityEffects.triggerPriorityChange(entry[0].ability, entry[0], move, pri);
          }
          if (pri !== entry[5]) needRearranging = true;
          entry[5] = pri;
          choice[4] = pri;
        }
        // Recalculate sub-priority change caused by ability (but not by item)
        if (entry[0].abilityActive()) {
          const subPri = AbilityEffects.triggerPriorityBracketChange(entry[0].ability, entry[0], this);
          if (subPri !== entry[2]) needRearranging = true;
          entry[2] = subPri;
        }
      }
    }
    // Calculate each battler's overall sub-priority, and whether its ability or
    // item is responsible
    // NOTE: Going fast beats going slow. A Pokémon with Stall and Quick Claw
    //       will go first in its priority bracket if Quick Claw triggers,
    //       regardless of Stall.
    for (const entry of priority) {
      entry[0].effects[PBEffects.PriorityAbility] = false;
      entry[0].effects[PBEffects.PriorityItem] = false;
      let subpri = entry[2]; // Sub-priority from ability
      if ((subpri === 0 && entry[3] !== 0) || // Ability has no effect, item has effect
          (subpri < 0 && entry[3] >= 1)) { // Ability makes it slower, item makes it faster
        subpri = entry[3]; // Sub-priority from item
        entry[0].effects[PBEffects.PriorityItem] = true;
      } else if (subpri !== 0) { // Ability has effect, item had superfluous/no effect
        entry[0].effects[PBEffects.PriorityAbility] = true;
      }
      entry[4] = subpri; // Final sub-priority
    }
    // Reorder the priority array
    if (needRearranging) {
      priority.sort((a, b) => {
        if (a[5] !== b[5]) {
          // Sort by priority (highest value first)
          return cmp(b[5], a[5]);
        } else if (a[4] !== b[4]) {
          // Sort by sub-priority (highest value first)
          return cmp(b[4], a[4]);
        } else if (this.priorityTrickRoom) {
          // Sort by speed (lowest first), and use tie-breaker if necessary
          return a[1] === b[1] ? cmp(b[6], a[6]) : cmp(a[1], b[1]);
        }
        // Sort by speed (highest first), and use tie-breaker if necessary
        return a[1] === b[1] ? cmp(b[6], a[6]) : cmp(b[1], a[1]);
      });
      // Write the priority order to the debug log
      let logMsg = fullCalc ? "[Round order] " : "[Round order recalculated] ";
      let comma = false;
      for (const entry of priority) {
        if (comma) logMsg += ", ";
        logMsg += `${entry[0].pbThis(comma)} (${entry[0].index})`;
        comma = true;
      }
      PBDebug.log(logMsg);
    }
  },

  pbPriority(this: Battle, onlySpeedSort = false): Battler[] {
    const priority = this.priority as unknown as PriorityEntry[];
    const ret: Battler[] = [];
    if (onlySpeedSort) {
      // Sort battlers by their speed stats and tie-breaker order only.
      const tempArray: [Battler, number, number][] = [];
      for (const pArray of priority) tempArray.push([pArray[0], pArray[1], pArray[6]]);
      tempArray.sort((a, b) => (a[1] === b[1] ? cmp(b[2], a[2]) : cmp(b[1], a[1])));
      for (const tArray of tempArray) ret.push(tArray[0]);
    } else {
      // Sort battlers by priority, sub-priority and their speed. Ties are
      // resolved in the same way each time this method is called in a round.
      for (const pArray of priority) if (!pArray[0].fainted()) ret.push(pArray[0]);
    }
    return ret;
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
