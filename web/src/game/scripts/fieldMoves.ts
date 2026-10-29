// Field moves events call directly (012_Overworld/004_Overworld_FieldMoves.rb).
// Only what the slice's maps use: pbCut (Route 29's tree).

import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { _INTL } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { G } from "../globals";
import type { Player } from "../trainer/Player";
import { defineScript } from "../scriptApi";

const player = () => G.player as unknown as Player;
const FIELD_MOVES_COUNT_BADGES = true; // Settings::FIELD_MOVES_COUNT_BADGES

/** pbCheckHiddenMoveBadge(badge = -1, showmsg = true) */
export async function pbCheckHiddenMoveBadge(badge = -1, showmsg = true): Promise<boolean> {
  if (badge < 0) return true; // No badge requirement
  // ($DEBUG skips the check.)
  if (FIELD_MOVES_COUNT_BADGES ? player().badgeCount() >= badge : player().badges[badge]) return true;
  if (showmsg) await pbMessage(_INTL("Sorry, a new Badge is required."));
  return false;
}

/** pbCut: offers to cut the tree the player faces. */
export async function pbCut(): Promise<boolean> {
  const move = "CUT";
  const movefinder = player().getPokemonWithMove(move);
  if (!(await pbCheckHiddenMoveBadge(Settings.BADGE_FOR_CUT, false)) || !movefinder) {
    await pbMessage(_INTL("This tree looks like it can be cut down."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("This tree looks like it can be cut down!\nWould you like to cut it?"))) {
    G.stats.cutCount += 1;
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, Move.get(move).name));
    // TODO(field moves): pbHiddenMoveAnimation(movefinder).
    return true;
  }
  return false;
}
defineScript("pbCut", () => pbCut());
