// Port of Plugins/Side Stairs Tiles/Side Stairs Tiles.rb (Boonzeet's sideways
// stairs, v1.4): characters standing on a StairLeft/StairRight tile are drawn
// 16 pixels higher (offset_y, eased in 2 pixels per frame through
// real_offset_y) and the player can't walk up off the top of a staircase.
// The terrain tags themselves are registered in data/gameData/terrainTag.ts,
// and the followers' diagonal steps are in game/following/GameFollower.ts.
//
// What's left of the plugin once the later plugins have loaded:
// - its Game_Character#move_generic and Game_Player#move_generic (the
//   player's diagonal steps along the stairs) are replaced wholesale by
//   Marin's Enhanced Staircases, so they never run in the original either;
// - its pbTurnTowardEvent is replaced by Marin's too.
// No tileset of this game uses tags 18/19, so none of this shows in play; it
// is ported as the plugin leaves it and tested headless.

import { GameCharacter } from "../GameCharacter";
import { GamePlayer } from "../GamePlayer";
import { G } from "../globals";
import type { GameMap } from "../GameMap";

declare module "../GameCharacter" {
  interface GameCharacter {
    offsetX?: number;
    offsetY?: number;
    realOffsetX?: number;
    realOffsetY?: number;
  }
}

const proto = GameCharacter.prototype as unknown as {
  screenX(): number;
  screenY(): number;
  updateMove(): void;
  moveto(x: number, y: number): void;
  moveUpperLeft(): void;
  moveUpperRight(): void;
  moveLowerLeft(): void;
  moveLowerRight(): void;
};

/** `terrain_tag(@x, @y) == :StairLeft || == :StairRight` */
function onSideStair(c: GameCharacter): boolean {
  const id = c.map.terrainTag(c.x, c.y).id;
  return id === "StairLeft" || id === "StairRight";
}

const screenX = proto.screenX;
proto.screenX = function (this: GameCharacter) {
  this.realOffsetX ??= 0;
  return screenX.call(this) + this.realOffsetX;
};

const screenY = proto.screenY;
proto.screenY = function (this: GameCharacter) {
  this.realOffsetY ??= 0;
  return screenY.call(this) + this.realOffsetY;
};

const updateMove = proto.updateMove;
proto.updateMove = function (this: GameCharacter) {
  // compatibility with existing saves
  if (this.realOffsetX == null || this.realOffsetY == null || this.offsetY == null || this.offsetX == null) {
    this.realOffsetX = 0;
    this.realOffsetY = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }
  if (this.realOffsetX !== this.offsetX || this.realOffsetY !== this.offsetY) {
    if (this.realOffsetX > this.offsetX) this.realOffsetX -= 2;
    if (this.realOffsetX < this.offsetX) this.realOffsetX += 2;
    if (this.realOffsetY < this.offsetY) this.realOffsetY += 2;
    if (this.realOffsetY > this.offsetY) this.realOffsetY -= 2;
  }
  updateMove.call(this);
};

// moveto resets the offsets, then sets the position (the plugin copies the
// core's moveto before calling it, so the core's body runs twice).
const moveto = proto.moveto;
proto.moveto = function (this: GameCharacter, x: number, y: number) {
  this.realOffsetX = 0;
  this.realOffsetY = 0;
  this.offsetX = 0;
  this.offsetY = 0;
  moveto.call(this, x, y);
};

for (const name of ["moveUpperLeft", "moveUpperRight", "moveLowerLeft", "moveLowerRight"] as const) {
  const orig = proto[name];
  proto[name] = function (this: GameCharacter) {
    orig.call(this);
    this.offsetY = onSideStair(this) ? -16 : 0;
  };
}

// Game_Player#center: the screen follows the drawing offset.
const playerProto = GamePlayer.prototype;
const center = playerProto.center;
playerProto.center = function (this: GamePlayer, x: number, y: number) {
  center.call(this, x, y);
  this.map.displayX = this.map.displayX + (this.offsetX ?? 0);
  this.map.displayY = this.map.displayY + (this.offsetY ?? 0);
};

// Game_Player#passable?: prevent the player moving up past the top of the stairs.
const passable = playerProto.passable;
playerProto.passable = function (this: GamePlayer, x: number, y: number, d: number, strict = false) {
  const newX = x + (d === 6 ? 1 : d === 4 ? -1 : 0);
  const newY = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
  const map = G.gameMap as unknown as GameMap;
  if (map.valid(newX, newY) && d === 8 && newY > 0) {
    const here = map.terrainTag(newX, newY).id;
    const above = map.terrainTag(newX, newY - 1).id;
    if (here === "StairLeft" && above !== "StairLeft") return false;
    if (here === "StairRight" && above !== "StairRight") return false;
  }
  return passable.call(this, x, y, d, strict);
};
