// Port of Plugins/Marin's Enhanced Staircases/script.rb: pixel movement on
// staircases. An event named "Slope" at each end of a staircase carries
// comments ("Slope: AxB", "Width: i/n", "Offset: Apx"); stepping on one puts
// the character "on the stair", and while it walks sideways across the
// staircase its sprite climbs by the slope (screen_y_ground), it walks slower
// and (for the player) the screen follows smoothly.
//
// Game_Character / Game_Event / Game_Player / Scene_Map get the plugin's
// aliases here: prototype wrappers where the method is reached through the
// prototype, and GameCharacter's CharacterHooks / GamePlayer's PlayerHooks /
// SceneMapHooks where the port inlines the method or Following Pokemon EX's
// alias must wrap this one. The follower parts (Game_Follower#follow_leader,
// Game_FollowerFactory#update's `through`, pbTurnTowardEvent) read the
// stair state through the methods added to GameCharacter below.
//
// The plugin's Game_Player#move_generic (copy of the core's with a `yield`)
// also replaces Side Stairs Tiles' version, so Boonzeet's sideways stairs
// never reach the player in the original either; no tileset of this game
// uses their StairLeft/StairRight terrain tags anyway.

import { CharacterHooks, GameCharacter, REAL_RES_X, REAL_RES_Y, TILE_HEIGHT, TILE_WIDTH, X_SUBPIXELS, Y_SUBPIXELS } from "../GameCharacter";
import { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { GamePlayer, PlayerHooks } from "../GamePlayer";
import { G } from "../globals";
import { SceneMapHooks } from "../../scenes/SceneMap";

/** If true, overwrites default scrolling behaviour to make stair movement smooth. */
const SMOOTH_SCROLLING = true;
/** The factor at which move speed is reduced when walking on stairs. */
const SPEED_REDUCTION_ON_STAIRS = 0.85;

/** $DisableScrollCounter: 2 during the player's update on a stair, 1 once its pattern updated. */
let disableScrollCounter = 0;

declare module "../GameCharacter" {
  interface GameCharacter {
    stairStartX?: number | null;
    stairStartY?: number | null;
    stairEndX?: number | null;
    stairEndY?: number | null;
    stairYPosition?: number | null;
    stairYHeight?: number | null;
    stairBeginOffset?: number | null;
    stairLastIncrement?: number | null;
    viewOffsetX?: number;
    viewOffsetY?: number;
    onStair(): boolean;
    onMiddleOfStair(): boolean;
    slope(x: number, y: number, ypos?: number, yheight?: number, beginOffset?: number): void;
    clearStairData(): void;
    movingVertically(value: number): void;
    /** Game_Follower#follow_leader's stair block: keeps a follower's target row while the leader walks a stair. */
    stairFollowTarget(leader: GameCharacter, target: [number, number, number]): void;
  }
}

declare module "../GameEvent" {
  interface GameEvent {
    isStairEvent(): boolean;
    getStairData(): [number, number, number, number, number] | undefined;
  }
}

const proto = GameCharacter.prototype;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const isPlayer = (c: GameCharacter) => c === (G.gamePlayer as unknown);

//===============================================================================
// Game_Character: stair state
//===============================================================================
proto.onStair = function (this: GameCharacter): boolean {
  return this.stairBeginOffset != null && this.stairStartX != null && this.stairStartY != null &&
    this.stairEndX != null && this.stairEndY != null && this.stairYPosition != null && this.stairYHeight != null;
};

proto.onMiddleOfStair = function (this: GameCharacter): boolean {
  if (!this.onStair()) return false;
  const sx = this.stairStartX!, ex = this.stairEndX!, off = this.stairBeginOffset!;
  if (sx > ex) {
    return this.realX < (sx * TILE_WIDTH - off) * X_SUBPIXELS && this.realX > (ex * TILE_WIDTH + off) * X_SUBPIXELS;
  }
  return this.realX > (sx * TILE_WIDTH + off) * X_SUBPIXELS && this.realX < (ex * TILE_WIDTH - off) * X_SUBPIXELS;
};

proto.slope = function (this: GameCharacter, x: number, y: number, ypos = 0, yheight = 1, beginOffset = 0): void {
  this.stairStartX = this instanceof GamePlayer ? this.x : Math.round(this.realX / REAL_RES_X);
  this.stairStartY = this instanceof GamePlayer ? this.y : Math.round(this.realY / REAL_RES_Y);
  this.stairEndX = this.stairStartX + x;
  this.stairEndY = this.stairStartY + y;
  this.stairYPosition = ypos;
  this.stairYHeight = yheight;
  this.stairBeginOffset = beginOffset;
  this.stairStartY += ypos;
  this.stairEndY += ypos;
};

proto.clearStairData = function (this: GameCharacter): void {
  this.stairBeginOffset = null;
  this.stairStartX = null;
  this.stairStartY = null;
  this.stairEndX = null;
  this.stairEndY = null;
  this.stairYPosition = null;
  this.stairYHeight = null;
  this.stairLastIncrement = null;
};

proto.movingVertically = function (this: GameCharacter, value: number): void {
  if (!this.onStair()) return;
  this.stairYPosition! -= value;
  if (this.stairYPosition! >= this.stairYHeight! || this.stairYPosition! < 0) this.clearStairData();
};

proto.stairFollowTarget = function (this: GameCharacter, leader: GameCharacter, target: [number, number, number]): void {
  if (!this.onStair()) return;
  if (leader.onStair()) {
    if (leader.stairStartX !== this.stairStartX) {
      // Leader stepped on other side so start/end swapped, but not for follower yet
      target[2] = this.y;
    } else if (leader.stairStartX! < leader.stairEndX!) {
      // Left to Right
      if (leader.x < leader.stairStartX! && this.x !== this.stairStartX) target[2] = this.y; // Leader stepped off
    } else if (leader.stairEndX! < leader.stairStartX!) {
      // Right to Left
      if (leader.x > leader.stairStartX! && this.x !== this.stairStartX) target[2] = this.y; // Leader stepped off
    }
  } else if (this.onMiddleOfStair()) {
    // Leader is no longer on stair but follower is, so player moved up or down at the start or end of the stair
    if (leader.y < this.stairEndY! - this.stairYHeight! + 1 || leader.y > this.stairEndY!) target[2] = this.y;
  }
};

//===============================================================================
// Game_Character: passable?, move_down / move_up, update, update_pattern,
// screen_y_ground
//===============================================================================
CharacterHooks.passable = (c, x, y, d) => {
  if (!c.onMiddleOfStair()) return undefined;
  const newY = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
  if (newY > c.y) return c.stairYPosition! > 0;
  if (newY < c.y) return c.stairYPosition! + 1 < c.stairYHeight!;
  return true;
};

// move_down / move_up pass `moving_vertically` as move_generic's block, which
// runs once the step has been taken. The player's move_generic yields
// earlier (before the step), through PlayerHooks.beforeStep.
for (const [name, value] of [["moveDown", 1], ["moveUp", -1]] as const) {
  const orig = proto[name];
  proto[name] = function (this: GameCharacter, turnEnabled = true) {
    if (isPlayer(this)) return orig.call(this, turnEnabled);
    const x = this.x, y = this.y;
    orig.call(this, turnEnabled);
    if (this.x !== x || this.y !== y) this.movingVertically(value);
  };
}
PlayerHooks.beforeStep = (p, dir) => {
  if (dir === 2) p.movingVertically(1);
  else if (dir === 8) p.movingVertically(-1);
};

CharacterHooks.beforeUpdate = (c) => {
  // Game_Player#update called; now disable Game_Map#scroll_*
  if (isPlayer(c) && SMOOTH_SCROLLING && c.onStair()) disableScrollCounter = 2;
};

CharacterHooks.afterUpdate = (c) => {
  if (c.onMiddleOfStair()) {
    const dx = c.stairEndX! - c.stairStartX!;
    const dy = c.stairEndY! - c.stairStartY!;
    const ptgrs = Math.sqrt(dx ** 2 + dy ** 2);
    const fraction = (Math.abs(dx) / ptgrs) * SPEED_REDUCTION_ON_STAIRS;
    c.moveSpeedReal = 2 ** (fraction * c.moveSpeed + 1) * 0.8;
  } else {
    const oldspeed = c.moveSpeed;
    c.moveSpeed = 0;
    c.moveSpeed = oldspeed;
  }
};

const updatePattern = (proto as unknown as { updatePattern(): void }).updatePattern;
(proto as unknown as { updatePattern(): void }).updatePattern = function (this: GameCharacter) {
  if (isPlayer(this) && disableScrollCounter === 2) disableScrollCounter = 1;
  updatePattern.call(this);
};

// moving?'s alias: the first call after the player's pattern update (in
// Game_Player#update, right after update_screen_position) re-centres the
// screen on the player plus the stair's view offset.
PlayerHooks.afterScreenPosition = (p) => {
  if (disableScrollCounter !== 1) return;
  // New Game_Player#update scroll method
  disableScrollCounter = 0;
  p.viewOffsetX ??= 0;
  p.viewOffsetY ??= 0;
  p.center((p.realX + p.viewOffsetX) / 4 / TILE_WIDTH, (p.realY + p.viewOffsetY) / 4 / TILE_HEIGHT);
};

const screenYGround = proto.screenYGround;
proto.screenYGround = function (this: GameCharacter): number {
  let realY = this.realY;
  if (this.onStair()) {
    const sx = this.stairStartX!, ex = this.stairEndX!, sy = this.stairStartY!, ey = this.stairEndY!, off = this.stairBeginOffset!;
    const map = this.map as GameMap;
    if (this.realX / X_SUBPIXELS <= sx * TILE_WIDTH && ex < sx) {
      const distance = (sx - ex) * REAL_RES_X - 2.0 * off * X_SUBPIXELS;
      const rpos = this.realX - ex * REAL_RES_X - off * X_SUBPIXELS;
      const fraction = 1 - rpos / distance;
      if (fraction >= 0 && fraction <= 1) {
        const diff = fraction * (ey - sy) * REAL_RES_Y;
        realY += diff;
        if (this instanceof GamePlayer) {
          if (SMOOTH_SCROLLING) this.viewOffsetY = (this.viewOffsetY ?? 0) + diff - (this.stairLastIncrement ?? 0);
          else map.scrollDown(diff - (this.stairLastIncrement ?? 0));
        }
        this.stairLastIncrement = diff;
      }
      if (fraction >= 1) {
        const endy = ey - this.stairYPosition!;
        this.y = endy;
        this.realY = endy * REAL_RES_Y;
        if (SMOOTH_SCROLLING && this instanceof GamePlayer) this.viewOffsetY = 0;
        this.clearStairData();
        return screenYGround.call(this);
      }
    } else if (this.realX / X_SUBPIXELS >= sx * TILE_WIDTH && ex > sx) {
      const distance = (ex - sx) * REAL_RES_X - 2.0 * off * X_SUBPIXELS;
      const rpos = sx * REAL_RES_X - this.realX + off * X_SUBPIXELS;
      const fraction = rpos / distance;
      if (fraction <= 0 && fraction >= -1) {
        const diff = fraction * (sy - ey) * REAL_RES_Y;
        realY += diff;
        if (this instanceof GamePlayer) {
          if (SMOOTH_SCROLLING) this.viewOffsetY = (this.viewOffsetY ?? 0) + diff - (this.stairLastIncrement ?? 0);
          else map.scrollDown(diff - (this.stairLastIncrement ?? 0));
        }
        this.stairLastIncrement = diff;
      }
      if (fraction <= -1) {
        const endy = ey - this.stairYPosition!;
        this.y = endy;
        this.realY = endy * REAL_RES_Y;
        if (SMOOTH_SCROLLING && this instanceof GamePlayer) this.viewOffsetY = 0;
        this.clearStairData();
        return screenYGround.call(this);
      }
    } else {
      this.clearStairData();
    }
  }
  return Math.round((realY - this.map.displayY) / Y_SUBPIXELS + TILE_HEIGHT);
};

//===============================================================================
// Game_Event: stair events, check_event_trigger_touch / _auto, start
//===============================================================================
const eventProto = GameEvent.prototype;

eventProto.isStairEvent = function (this: GameEvent): boolean {
  return this.name === "Slope";
};

eventProto.getStairData = function (this: GameEvent): [number, number, number, number, number] | undefined {
  if (!this.isStairEvent()) return undefined;
  if (!this.list) return undefined;
  let xincline: number | undefined, yincline: number | undefined;
  let ypos: number | undefined, yheight: number | undefined, offset: number | undefined;
  for (const cmd of this.list) {
    // code 108: a comment's first line (its other lines are code 408)
    if (cmd.cmd === "comment") {
      const text = (cmd as unknown as { lines: string[] }).lines[0] ?? "";
      let m: RegExpExecArray | null;
      if ((m = /Slope: (\d+)x(\d+)/.exec(text))) {
        xincline = Number(m[1]); yincline = Number(m[2]);
      } else if ((m = /Slope: -(\d+)x(\d+)/.exec(text))) {
        xincline = -Number(m[1]); yincline = Number(m[2]);
      } else if ((m = /Slope: (\d+)x-(\d+)/.exec(text))) {
        xincline = Number(m[1]); yincline = -Number(m[2]);
      } else if ((m = /Slope: -(\d+)x-(\d+)/.exec(text))) {
        xincline = -Number(m[1]); yincline = -Number(m[2]);
      } else if ((m = /Width: (\d+)\/(\d+)/.exec(text))) {
        ypos = Number(m[1]); yheight = Number(m[2]);
      } else if ((m = /Offset: (\d+)px/.exec(text))) {
        offset = Number(m[1]);
      }
    }
    if (xincline !== undefined && yincline !== undefined && ypos !== undefined && yheight !== undefined && offset !== undefined) {
      return [xincline, yincline, ypos, yheight, offset];
    }
  }
  // NOTE (Ruby parity): without an "Offset:" comment (or a "Width:" one) the
  //       missing values are nil; slope() then gets nil for them (script.rb:136).
  return [xincline!, yincline!, ypos!, yheight!, 16];
};

const eventTouch = eventProto.checkEventTriggerTouch;
eventProto.checkEventTriggerTouch = function (this: GameEvent, dir: number): boolean {
  if (this.onStair()) return false;
  return eventTouch.call(this, dir);
};

const eventAuto = eventProto.checkEventTriggerAuto;
eventProto.checkEventTriggerAuto = function (this: GameEvent): void {
  const map = G.gameMap as unknown as GameMap | null;
  if (map && map.events) {
    for (const event of map.events.values()) {
      if (this.isStairEvent() || this.id === event.id) continue;
      if (!this.onStair() && Math.round(this.realX / REAL_RES_X) === event.x && Math.round(this.realY / REAL_RES_Y) === event.y) {
        if (event.isStairEvent()) {
          const p = gamePlayer();
          if (p.x === event.x && p.y === event.y) continue;
          const data = event.getStairData()!;
          this.slope(...data);
          return;
        }
      }
    }
  }
  if (this.onStair() || gamePlayer().onStair()) return;
  eventAuto.call(this);
};

const eventStart = eventProto.start;
eventProto.start = function (this: GameEvent): void {
  if (this.isStairEvent()) {
    gamePlayer().slope(...this.getStairData()!);
  } else {
    eventStart.call(this);
  }
};

//===============================================================================
// Game_Player: check_event_trigger_touch / _here / _there
//===============================================================================
const playerProto = GamePlayer.prototype;
const playerTouch = playerProto.checkEventTriggerTouch;
playerProto.checkEventTriggerTouch = function (this: GamePlayer, dir: number): boolean {
  if (this.onStair()) return false;
  return playerTouch.call(this, dir);
};
const playerHere = playerProto.checkEventTriggerHere;
playerProto.checkEventTriggerHere = function (this: GamePlayer, triggers: number[]): boolean {
  if (this.onStair()) return false;
  return playerHere.call(this, triggers);
};
const playerThere = playerProto.checkEventTriggerThere;
playerProto.checkEventTriggerThere = function (this: GamePlayer, triggers: number[]): boolean {
  if (this.onStair()) return false;
  return playerThere.call(this, triggers);
};

//===============================================================================
// Scene_Map#transfer_player: the stair state doesn't carry over
//===============================================================================
SceneMapHooks.afterTransferPlayer = () => gamePlayer().clearStairData();
