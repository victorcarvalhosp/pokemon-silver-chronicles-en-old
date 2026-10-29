// Player movement helpers from 012_Overworld/001_Overworld.rb: pbJumpToward
// (564-666), pbSlideOnIce, the :auto_move_player step handler (waterfall
// crests and ice), pbBridgeOn / pbBridgeOff and pbSetEscapePoint.
// (pbLedge is in GamePlayer.ts: it runs inside the player's move.)

import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { pokemonEncounters } from "../encounters/PokemonEncounters";
import { EventHandlers } from "../eventHandlers";
import type { GamePlayer } from "../GamePlayer";
import { pbSEPlay } from "../GameSystem";
import { G, pbUpdateSceneMap } from "../globals";
import { FieldMoves } from "./FieldMoves";

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;

/**
 * The part of pbJumpToward(dist, playSound, cancelSurf) before its wait:
 * jumps `dist` tiles ahead; true if the player moved.
 */
export function pbJumpTowardStart(dist = 1, playSound = false, cancelSurf = false): boolean {
  const p = gamePlayer();
  const x = p.x;
  const y = p.y;
  switch (p.direction) {
    case 2: p.jump(0, dist); break; // down
    case 4: p.jump(-dist, 0); break; // left
    case 6: p.jump(dist, 0); break; // right
    case 8: p.jump(0, -dist); break; // up
  }
  if (p.x !== x || p.y !== y) {
    if (playSound) pbSEPlay("Player jump");
    if (cancelSurf) pokemonEncounters().resetStepCount();
    if (cancelSurf) G.gameTemp.endingSurf = true;
    return true;
  }
  return false;
}

/** pbJumpToward's wait: `while $game_player.jumping?` */
export async function pbWaitWhileJumping(): Promise<void> {
  while (gamePlayer().jumping()) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

/** pbJumpToward(dist = 1, playSound = false, cancelSurf = false) */
export async function pbJumpToward(dist = 1, playSound = false, cancelSurf = false): Promise<boolean> {
  if (!pbJumpTowardStart(dist, playSound, cancelSurf)) return false;
  await pbWaitWhileJumping();
  return true;
}

/** pbSlideOnIce */
export async function pbSlideOnIce(): Promise<void> {
  const p = gamePlayer();
  if (!p.pbTerrainTag().ice) return;
  await G.gameTemp.followers?.update();
  G.pokemonGlobal.sliding = true;
  const direction = p.direction;
  const oldwalkanime = p.walkAnime;
  p.straighten();
  p.walkAnime = false;
  let firstLoop = true;
  for (;;) {
    if (!p.canMoveInDirection(direction)) break;
    if (!p.pbTerrainTag().ice) break;
    p.moveForward();
    if (firstLoop) G.gameTemp.followers?.moveFollowers();
    while (p.moving()) {
      await pbUpdateSceneMap();
      await Graphics.update();
      Input.update();
    }
    firstLoop = false;
  }
  p.center(p.x, p.y);
  p.straighten();
  p.walkAnime = oldwalkanime;
  G.pokemonGlobal.sliding = false;
}

// Auto-move the player over waterfalls and ice. :on_step_taken fires at the
// end of a step, inside the player's update, which can't wait here: the
// slide/descent runs as the player's blocking step instead (as the ledge
// jump does), at the same point of the next frame's update.
EventHandlers.add("on_step_taken", "auto_move_player", (event) => {
  if (!G.scene) return; // next if !$scene.is_a?(Scene_Map)
  const p = gamePlayer();
  if (event !== p) return;
  const currentTag = p.pbTerrainTag();
  if (currentTag.waterfallCrest) {
    p.queueBlocking(() => FieldMoves.pbDescendWaterfall());
  } else if (currentTag.ice && !G.pokemonGlobal.sliding) {
    p.queueBlocking(() => pbSlideOnIce());
  }
});

/** pbBridgeOn(height = 2) */
export function pbBridgeOn(height = 2): void {
  G.pokemonGlobal.bridge = height;
}

/** pbBridgeOff */
export function pbBridgeOff(): void {
  G.pokemonGlobal.bridge = 0;
}

/** pbSetEscapePoint: the tile behind the player, facing away (where Dig/Escape Rope return to). */
export function pbSetEscapePoint(): void {
  const g = G.pokemonGlobal;
  if (!g.escapePoint) g.escapePoint = [];
  const p = gamePlayer();
  let xco = p.x;
  let yco = p.y;
  let dir = 0;
  switch (p.direction) {
    case 2: yco -= 1; dir = 8; break; // Down
    case 4: xco += 1; dir = 6; break; // Left
    case 6: xco -= 1; dir = 4; break; // Right
    case 8: yco += 1; dir = 2; break; // Up
  }
  g.escapePoint = [G.gameMap!.mapId, xco, yco, dir];
}
