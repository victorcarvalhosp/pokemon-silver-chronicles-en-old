// The overworld helpers followers are driven with, from
// 012_Overworld/001_Overworld.rb: PBMoveRoute / pbMoveRoute (ported in
// game/scripts/moveRoute.ts), pbWait and pbTurnTowardEvent (as Marin's
// Enhanced Staircases redefines it; it loads after Side Stairs Tiles, whose
// own version it replaces). Move route Wait parameters are 1/20 s.

import type { GameCharacter } from "../GameCharacter";
import { G } from "../globals";
import type { PokemonMapFactory } from "../MapFactory";
import { pbWaitSeconds } from "../scripts/overworld";

export { PBMoveRoute, pbMoveRoute } from "../scripts/moveRoute";

/** pbWait(numFrames): Essentials frames at its 40 fps (callers pass Graphics.frame_rate multiples). */
export function pbWait(numFrames: number): Promise<void> {
  return pbWaitSeconds(numFrames / ESSENTIALS_FRAME_RATE);
}

/** Graphics.frame_rate as event scripts and plugin code use it (frames for pbWait / move route waits). */
export const ESSENTIALS_FRAME_RATE = 40;

/**
 * pbTurnTowardEvent(event, otherEvent) — Marin's Enhanced Staircases version.
 * Marin's reads the old $MapFactory global, which v20.1 only sets when a save
 * is loaded (it falls back to plain coordinates in a new session); both give
 * the same answer for characters on the same map. Marin's stairs aren't
 * ported, so the "middle of a stair" case never applies.
 */
export function pbTurnTowardEvent(event: GameCharacter, otherEvent: GameCharacter): void {
  let sx: number, sy: number;
  const f = G.mapFactory as unknown as PokemonMapFactory | null;
  if (f) {
    [sx, sy] = f.getRelativePos(otherEvent.map.mapId, otherEvent.x, otherEvent.y, event.map.mapId, event.x, event.y);
  } else {
    sx = event.x - otherEvent.x;
    sy = event.y - otherEvent.y;
  }
  sx += (event.width - otherEvent.width) / 2;
  sy -= (event.height - otherEvent.height) / 2;
  if (sx === 0 && sy === 0) return;
  // TODO(stairs): Marin's `event.on_middle_of_stair? && !otherEvent.on_middle_of_stair?` turns sideways.
  if (Math.abs(sx) > Math.abs(sy)) sx > 0 ? event.turnLeft() : event.turnRight();
  else sy > 0 ? event.turnUp() : event.turnDown();
}
