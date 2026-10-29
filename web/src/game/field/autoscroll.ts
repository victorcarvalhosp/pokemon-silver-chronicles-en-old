// Interpreter#autoscroll / #autoscroll_player (004_Game classes/005_Game_Map_Autoscroll.rb):
// scrolls the map to centre on a tile, diagonally first, then straight.
// (The diagonal scroll_* methods are in GameMap.ts.) No event of this game
// calls them; they're here for event scripts that would.
//
// The Ruby is a Script command that returns false while it isn't done, so the
// interpreter runs it again next frame; here the script waits a frame instead.

import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { REAL_RES_X, REAL_RES_Y, TILE_HEIGHT, TILE_WIDTH } from "../GameCharacter";
import type { GameMap } from "../GameMap";
import { G, pbUpdateSceneMap } from "../globals";
import { defineScript, type ScriptContext } from "../scriptApi";

const SCROLL_SPEED_DEFAULT = 4;
const gameMap = () => G.gameMap as unknown as GameMap;

/** One run of the Ruby method: true when done, false to be called again; @diag lives on the interpreter. */
function autoscrollStep(state: { diag?: boolean }, x: number, y: number, speed: number): boolean | "skip" {
  const map = gameMap();
  if (map.scrolling()) return false;
  if (!map.valid(x, y)) {
    console.warn("Map Autoscroll: given x,y is invalid");
    return "skip";
  }
  if (!(speed >= 1 && speed <= 6)) {
    console.warn("Map Autoscroll: invalid speed (1-6 only)");
    return "skip";
  }
  const centerX = (Graphics.width / 2 - TILE_WIDTH / 2) * 4; // X coordinate in the center of the screen
  const centerY = (Graphics.height / 2 - TILE_HEIGHT / 2) * 4; // Y coordinate in the center of the screen
  const maxX = (map.width - Graphics.width / TILE_WIDTH) * 4 * TILE_WIDTH;
  const maxY = (map.height - Graphics.height / TILE_HEIGHT) * 4 * TILE_HEIGHT;
  // Ruby integer division (display_x is an Integer here)
  const countX = Math.floor((map.displayX - Math.max(0, Math.min(x * REAL_RES_X - centerX, maxX))) / REAL_RES_X);
  const countY = Math.floor((map.displayY - Math.max(0, Math.min(y * REAL_RES_Y - centerY, maxY))) / REAL_RES_Y);
  let dir: number | null = null;
  let count: number;
  if (state.diag) {
    state.diag = false;
    if (countX !== 0 && countY !== 0) return false;
    else if (countX > 0) dir = 4;
    else if (countX < 0) dir = 6;
    else if (countY > 0) dir = 8;
    else if (countY < 0) dir = 2;
    count = countX === 0 ? Math.abs(countY) : Math.abs(countX);
  } else {
    state.diag = true;
    if (countX > 0) {
      if (countY > 0) dir = 7;
      else if (countY < 0) dir = 1;
    } else if (countX < 0) {
      if (countY > 0) dir = 9;
      else if (countY < 0) dir = 3;
    }
    count = Math.min(Math.abs(countX), Math.abs(countY));
  }
  if (dir) map.startScroll(dir, count, speed);
  return !state.diag;
}

/** autoscroll(x, y, speed = SCROLL_SPEED_DEFAULT) */
export async function autoscroll(ctx: ScriptContext, x: number, y: number, speed = SCROLL_SPEED_DEFAULT): Promise<boolean> {
  const state = (ctx.interpreter ?? {}) as { diag?: boolean };
  for (;;) {
    const r = autoscrollStep(state, x, y, speed);
    if (r === "skip") return true; // command_skip
    if (r) return true;
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

defineScript("autoscroll", (ctx, x, y, speed) => autoscroll(ctx, Number(x), Number(y), speed == null ? SCROLL_SPEED_DEFAULT : Number(speed)));
defineScript("autoscroll_player", (ctx, speed) => {
  const p = G.gamePlayer!;
  return autoscroll(ctx, p.x, p.y, speed == null ? SCROLL_SPEED_DEFAULT : Number(speed));
});
