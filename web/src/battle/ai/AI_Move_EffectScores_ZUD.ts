// Port of the move scores in Plugins/ZUD Mechanics/[003] Battle/Battle_AI.rb:99
// (alias aiEffectScorePart3_pbGetMoveScoreFunctionCode): only the score for a
// regular move, Behemoth Blade/Behemoth Bash/Dynamax Cannon. Other function
// codes fall through to Improved AI's version (AI_Move_EffectScores_ImprovedAI.ts).
//
// Deferred: the scores of the Power Move function codes ("ZUDProtectUser" ...
// "ZUDIgnoreTargetAbility"/"ZUDPhotonGeyser", Battle_AI.rb:111-753). Z-Moves
// and Max Moves never reach the AI here (the core defers Z-Moves and
// Dynamax), so those codes fall through and keep their score.

import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AI } from "./Battle_AI";
import "./AI_Move_EffectScores_ImprovedAI"; // the method this part wraps

const aiEffectScorePart3_pbGetMoveScoreFunctionCode = AI.prototype.pbGetMoveScoreFunctionCode;

/** Adds AI move scores for each Power Move (deferred) and Behemoth Blade & co. */
AI.prototype.pbGetMoveScoreFunctionCode = async function (this: AI, score: number, move: Move, user: Battler,
  target: Battler, skill = 100): Promise<number> {
  switch (move.function) {
    //---------------------------------------------------------------------------
    // Behemoth Blade, Behemoth Bash, Dynamax Cannon
    //---------------------------------------------------------------------------
    case "DoubleDamageOnDynamaxTargets":
      if (target.dynamax()) score += 60;
      break;
    default:
      return aiEffectScorePart3_pbGetMoveScoreFunctionCode.call(this, score, move, user, target, skill);
  }
  return score;
};
