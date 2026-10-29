// HiddenMoveHandlers and the hidden move entry points from
// 012_Overworld/004_Overworld_FieldMoves.rb:1-63, plus pbBadgeFromSkill from
// Plugins/Improved Field Skills/[001] Field Skills.rb.
//
// CanUseMove handlers only ever show a message right before they answer
// false (`pbMessage(...) if showmsg; next false`), so here they're
// synchronous and hand that message back instead: the menus can ask "can this
// move be used?" without awaiting (showmsg = false), and pbCanUseHiddenMove
// shows the message itself when showmsg is true, which is the same order of
// events as the Ruby.

import type { Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { _INTL } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";

const player = () => G.player as unknown as Player;

/** $DEBUG: off, as in a released game. */
export const FieldDebug = { DEBUG: false };
/** Settings::FIELD_MOVES_COUNT_BADGES */
const FIELD_MOVES_COUNT_BADGES = true;

/**
 * What a CanUseMove handler gets to report a failure: pbMessage(text) if
 * showmsg. The message is shown once the handler has returned.
 */
export class CanUseContext {
  messages: string[] = [];
  constructor(readonly showmsg: boolean) {}
  /** pbMessage(text) if showmsg */
  message(text: string): void {
    if (this.showmsg) this.messages.push(text);
  }
}

type CanUseProc = (move: Id, pkmn: Pokemon, ctx: CanUseContext) => boolean;
type ConfirmProc = (move: Id, pkmn: Pokemon) => Promise<boolean>;
type UseProc = (move: Id, pkmn: Pokemon) => Promise<unknown>;

/** MoveHandlerHash: handlers by move ID. */
class MoveHandlerHash<T> {
  private readonly hash = new Map<Id, T>();
  add(move: Id, proc: T): void { this.hash.set(move, proc); }
  get(move: Id): T | undefined { return this.hash.get(move); }
}

export const HiddenMoveHandlers = {
  CanUseMove: new MoveHandlerHash<CanUseProc>(),
  ConfirmUseMove: new MoveHandlerHash<ConfirmProc>(),
  UseMove: new MoveHandlerHash<UseProc>(),

  addCanUseMove(item: Id, proc: CanUseProc): void { HiddenMoveHandlers.CanUseMove.add(item, proc); },
  addConfirmUseMove(item: Id, proc: ConfirmProc): void { HiddenMoveHandlers.ConfirmUseMove.add(item, proc); },
  addUseMove(item: Id, proc: UseProc): void { HiddenMoveHandlers.UseMove.add(item, proc); },

  hasHandler(item: Id): boolean {
    return HiddenMoveHandlers.CanUseMove.get(item) != null && HiddenMoveHandlers.UseMove.get(item) != null;
  },

  /** Returns whether move can be used (the failure message, if any, is in ctx). */
  triggerCanUseMove(item: Id, pokemon: Pokemon, ctx: CanUseContext): boolean {
    const proc = HiddenMoveHandlers.CanUseMove.get(item);
    if (!proc) return false;
    return proc(item, pokemon, ctx);
  },

  /** Returns whether the player confirmed that they want to use the move. */
  async triggerConfirmUseMove(item: Id, pokemon: Pokemon): Promise<boolean> {
    const proc = HiddenMoveHandlers.ConfirmUseMove.get(item);
    if (!proc) return true;
    return proc(item, pokemon);
  },

  /** Returns whether move was used (the handler's raw result, as Ruby's `next` value). */
  async triggerUseMove(item: Id, pokemon: Pokemon): Promise<unknown> {
    const proc = HiddenMoveHandlers.UseMove.get(item);
    if (!proc) return false;
    return proc(item, pokemon);
  },
};

/** pbCanUseHiddenMove?(pkmn, move, showmsg) without the message (for menus). */
export function pbCanUseHiddenMoveSync(pkmn: Pokemon, move: Id, showmsg = false): boolean {
  return HiddenMoveHandlers.triggerCanUseMove(move, pkmn, new CanUseContext(showmsg));
}

/** pbCanUseHiddenMove?(pkmn, move, showmsg = true) */
export async function pbCanUseHiddenMove(pkmn: Pokemon, move: Id, showmsg = true): Promise<boolean> {
  const ctx = new CanUseContext(showmsg);
  const ret = HiddenMoveHandlers.triggerCanUseMove(move, pkmn, ctx);
  for (const text of ctx.messages) await pbMessage(text);
  return ret;
}

/** pbConfirmUseHiddenMove(pokemon, move) */
export function pbConfirmUseHiddenMove(pokemon: Pokemon, move: Id): Promise<boolean> {
  return HiddenMoveHandlers.triggerConfirmUseMove(move, pokemon);
}

/**
 * pbUseHiddenMove(pokemon, move): Following Pokemon EX wraps it
 * (game/field/followingFieldMoves.ts replaces this binding).
 */
export let pbUseHiddenMove = (pokemon: Pokemon, move: Id): Promise<unknown> => HiddenMoveHandlers.triggerUseMove(move, pokemon);
export function setUseHiddenMove(fn: typeof pbUseHiddenMove): void {
  pbUseHiddenMove = fn;
}

/** pbCheckHiddenMoveBadge(badge, showmsg) for a CanUseMove handler: the message goes into ctx. */
export function checkBadge(badge: number, ctx: CanUseContext): boolean {
  if (badge < 0) return true; // No badge requirement
  if (FieldDebug.DEBUG) return true;
  if (FIELD_MOVES_COUNT_BADGES ? player().badgeCount() >= badge : player().badges[badge]) return true;
  ctx.message(_INTL("Sorry, a new Badge is required."));
  return false;
}

/** pbCheckHiddenMoveBadge(badge = -1, showmsg = true) */
export async function pbCheckHiddenMoveBadge(badge = -1, showmsg = true): Promise<boolean> {
  const ctx = new CanUseContext(showmsg);
  const ret = checkBadge(badge, ctx);
  for (const text of ctx.messages) await pbMessage(text);
  return ret;
}

/** pbBadgeFromSkill(skill) (Improved Field Skills) */
export function pbBadgeFromSkill(skill: Id): number {
  switch (skill) {
    case "CUT": return Settings.BADGE_FOR_CUT;
    case "FLY": return Settings.BADGE_FOR_FLY;
    case "DIVE": return Settings.BADGE_FOR_DIVE;
    case "FLASH": return Settings.BADGE_FOR_FLASH;
    case "ROCKSMASH": return Settings.BADGE_FOR_ROCKSMASH;
    case "STRENGTH": return Settings.BADGE_FOR_STRENGTH;
    case "SURF": return Settings.BADGE_FOR_SURF;
    case "WATERFALL": return Settings.BADGE_FOR_WATERFALL;
    case "WHIRLPOOL": return Settings.BADGE_FOR_WHIRLPOOL;
    default: return -1;
  }
}
