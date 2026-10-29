// Port of 004_Game classes/007_Game_Character.rb.
//
// Essentials v20.1 already scales movement by Graphics.frame_rate
// (move_speed_real = val * 40 / frame_rate), so with FRAME_RATE = 60 walking,
// running and animation speeds match the original 40 fps game.

import { TICK_RATE } from "../core/loop";
import { rand } from "../core/random";
import type { MoveCommand, MoveRoute } from "../data/events";
import { terrainTag, type TerrainTag } from "../data/gameData/terrainTag";
import { EventHandlers } from "./eventHandlers";
import type { GameMap } from "./GameMap";
import { G } from "./globals";
import { pbSEPlay } from "./GameSystem";

export const FRAME_RATE = TICK_RATE;
export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 32;
export const X_SUBPIXELS = 4;
export const Y_SUBPIXELS = 4;
export const REAL_RES_X = TILE_WIDTH * X_SUBPIXELS;
export const REAL_RES_Y = TILE_HEIGHT * Y_SUBPIXELS;

/** The player as Game_Character code sees it (set by GamePlayer). */
export interface PlayerRef extends GameCharacter {
  readonly isPlayer: true;
}
export function player(): GameCharacter {
  return G.gamePlayer as unknown as GameCharacter;
}

export class GameCharacter {
  id = 0;
  originalX = 0;
  originalY = 0;
  x = 0;
  y = 0;
  realX = 0;
  realY = 0;
  xOffset = 0;
  yOffset = 0;
  width = 1;
  height = 1;
  spriteSize: [number, number] = [TILE_WIDTH, TILE_HEIGHT];
  tileId = 0;
  characterName = "";
  characterHue = 0;
  opacity = 255;
  blendType = 0;
  direction = 2;
  pattern = 0;
  patternSurf = 0;
  lockPattern = false;
  moveRouteForcing = false;
  through = false;
  animationId = 0;
  transparent = false;
  walkAnime = true;
  bobHeight = 0;
  protected originalDirection = 2;
  protected originalPattern = 0;
  protected moveType = 0;
  protected moveSpeed_ = 0;
  protected moveSpeedReal_ = 0;
  protected jumpSpeedReal_: number | null = null;
  protected moveFrequency_ = 0;
  protected moveFrequencyReal_ = 0;
  protected moveRoute: MoveRoute | null = null;
  protected moveRouteIndex = 0;
  protected originalMoveRoute: MoveRoute | null = null;
  protected originalMoveRouteIndex = 0;
  protected stepAnime = false;
  protected directionFix = false;
  protected alwaysOnTop = false;
  protected animeCount = 0;
  protected stopCount = 0;
  protected jumpPeak = 0;
  protected jumpDistance = 0;
  protected jumpDistanceLeft = 0;
  protected jumpCount = 0;
  protected waitCount = 0;
  protected movedThisFrame = false;
  protected movedLastFrame = false;
  protected stoppedThisFrame = false;
  protected stoppedLastFrame = false;
  protected movetoHappened = false;
  protected locked = false;
  protected prelockDirection = 0;
  protected starting = false;
  protected bushDepth_ = 0;
  private oldX: number | null = null;
  private oldY: number | null = null;
  private oldMap: number | null = null;

  constructor(protected map_: GameMap | null = null) {
    this.moveSpeed = 3;
    this.moveFrequency = 6;
  }

  get map(): GameMap {
    return this.map_ ?? (G.gameMap as unknown as GameMap);
  }

  get moveSpeed(): number { return this.moveSpeed_; }
  set moveSpeed(val: number) {
    if (val === this.moveSpeed_) return;
    this.moveSpeed_ = val;
    this.moveSpeedReal = val === 6 ? 64 : val === 5 ? 32 : 2 ** (val + 1) * 0.8;
  }
  get moveSpeedReal(): number { return this.moveSpeedReal_; }
  set moveSpeedReal(val: number) { this.moveSpeedReal_ = (val * 40) / FRAME_RATE; }

  get jumpSpeedReal(): number {
    if (this.jumpSpeedReal_ == null) this.jumpSpeedReal_ = (2 ** (3 + 1) * 0.8 * 40) / FRAME_RATE; // 3 is walking speed
    return this.jumpSpeedReal_;
  }

  get moveFrequency(): number { return this.moveFrequency_; }
  set moveFrequency(val: number) {
    if (val === this.moveFrequency_) return;
    this.moveFrequency_ = val;
    this.moveFrequencyReal_ = ((40 - val * 2) * (6 - val) * FRAME_RATE) / 40;
  }
  get moveFrequencyReal(): number { return this.moveFrequencyReal_; }

  /** Dynamic state for save files (Essentials marshals the whole object). */
  saveState(): Record<string, unknown> {
    const self = this as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = { moveSpeed: this.moveSpeed, moveFrequency: this.moveFrequency };
    for (const k of CHARACTER_STATE) out[k] = self[k];
    return out;
  }

  loadState(state: Record<string, unknown>): void {
    const self = this as unknown as Record<string, unknown>;
    for (const k of CHARACTER_STATE) if (k in state) self[k] = state[k];
    if (typeof state.moveSpeed === "number") this.moveSpeed = state.moveSpeed;
    if (typeof state.moveFrequency === "number") this.moveFrequency = state.moveFrequency;
  }

  lock(): void {
    if (this.locked) return;
    this.prelockDirection = 0; // Was @direction but disabled
    this.turnTowardPlayer();
    this.locked = true;
  }
  minilock(): void {
    this.prelockDirection = 0;
    this.locked = true;
  }
  isLocked(): boolean { return this.locked; }
  unlock(): void {
    if (!this.locked) return;
    this.locked = false;
    if (!this.directionFix && this.prelockDirection !== 0) this.direction = this.prelockDirection;
  }

  atCoordinate(cx: number, cy: number): boolean {
    return cx >= this.x && cx < this.x + this.width && cy > this.y - this.height && cy <= this.y;
  }

  inLineWithCoordinate(cx: number, cy: number): boolean {
    return (cx >= this.x && cx < this.x + this.width) || (cy > this.y - this.height && cy <= this.y);
  }

  *eachOccupiedTile(): Generator<[number, number]> {
    for (let i = this.x; i < this.x + this.width; i++) {
      for (let j = this.y - this.height + 1; j <= this.y; j++) yield [i, j];
    }
  }

  terrainTag(): TerrainTag {
    return this.map.terrainTag(this.x, this.y);
  }

  get bushDepth(): number { return this.bushDepth_; }

  calculateBushDepth(): void {
    if (this.tileId > 0 || this.alwaysOnTop || this.jumping()) {
      this.bushDepth_ = 0;
      return;
    }
    const thisMap = this.map.valid(this.x, this.y) ? ([this.map, this.x, this.y] as const) : G.mapFactory ? mapFactory().getNewMap(this.x, this.y, this.map.mapId) : null;
    if (thisMap && thisMap[0].deepBush(thisMap[1], thisMap[2])) {
      const xbehind = this.x + (this.direction === 4 ? 1 : this.direction === 6 ? -1 : 0);
      const ybehind = this.y + (this.direction === 8 ? 1 : this.direction === 2 ? -1 : 0);
      if (this.moving()) {
        const behind = this.map.valid(xbehind, ybehind) ? ([this.map, xbehind, ybehind] as const) : mapFactory().getNewMap(xbehind, ybehind, this.map.mapId);
        if (behind && behind[0].deepBush(behind[1], behind[2])) this.bushDepth_ = TILE_HEIGHT;
      } else {
        this.bushDepth_ = TILE_HEIGHT;
      }
    } else if (thisMap && thisMap[0].bush(thisMap[1], thisMap[2]) && !this.moving()) {
      this.bushDepth_ = 12;
    } else {
      this.bushDepth_ = 0;
    }
  }

  fullPattern(): number {
    switch (this.direction) {
      case 2: return this.pattern;
      case 4: return this.pattern + 4;
      case 6: return this.pattern + 8;
      case 8: return this.pattern + 12;
    }
    return 0;
  }

  passable(x: number, y: number, d: number, strict = false): boolean {
    const newX = x + (d === 6 ? 1 : d === 4 ? -1 : 0);
    const newY = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
    if (!this.map.valid(newX, newY)) return false;
    if (this.through) return true;
    if (strict) {
      if (!this.map.passableStrict(x, y, d, this)) return false;
      if (!this.map.passableStrict(newX, newY, 10 - d, this)) return false;
    } else {
      if (!this.map.passable(x, y, d, this)) return false;
      if (!this.map.passable(newX, newY, 10 - d, this)) return false;
    }
    const p = player();
    for (const event of this.map.events.values()) {
      if ((event as GameCharacter) === this || !event.atCoordinate(newX, newY) || event.through) continue;
      if (this !== p || event.characterName !== "") return false;
    }
    if (p.x === newX && p.y === newY && !p.through && this.characterName !== "") return false;
    return true;
  }

  canMoveFromCoordinate(startX: number, startY: number, dir: number, strict = false): boolean {
    switch (dir) {
      case 2: case 8: {
        const yDiff = dir === 8 ? this.height - 1 : 0;
        for (let i = startX; i < startX + this.width; i++) if (!this.passable(i, startY - yDiff, dir, strict)) return false;
        return true;
      }
      case 4: case 6: {
        const xDiff = dir === 6 ? this.width - 1 : 0;
        for (let i = startY - this.height + 1; i <= startY; i++) if (!this.passable(startX + xDiff, i, dir, strict)) return false;
        return true;
      }
      case 1: case 3: {
        for (let i = startX; i < startX + this.width; i++) if (!this.passable(i, startY, 2, strict)) return false;
        const xDiff = dir === 3 ? this.width - 1 : 0;
        for (let i = startY - this.height + 1; i <= startY; i++) if (!this.passable(startX + xDiff, i + 1, dir + 3, strict)) return false;
        return true;
      }
      case 7: case 9: {
        const xDiff = dir === 9 ? this.width - 1 : 0;
        for (let i = startY - this.height + 1; i <= startY; i++) if (!this.passable(startX + xDiff, i, dir - 3, strict)) return false;
        const xTile = dir === 9 ? 1 : -1;
        for (let i = startX; i < startX + this.width; i++) if (!this.passable(i + xTile, startY - this.height + 1, 8, strict)) return false;
        return true;
      }
    }
    return false;
  }

  canMoveInDirection(dir: number, strict = false): boolean {
    return this.canMoveFromCoordinate(this.x, this.y, dir, strict);
  }

  screenX(): number {
    let ret = Math.round((this.realX - this.map.displayX) / X_SUBPIXELS);
    ret += (this.width * TILE_WIDTH) / 2;
    return ret + this.xOffset;
  }

  screenYGround(): number {
    return Math.round((this.realY - this.map.displayY) / Y_SUBPIXELS) + TILE_HEIGHT;
  }

  screenY(): number {
    let ret = this.screenYGround();
    if (this.jumping()) {
      const fraction = this.jumpCount > 0
        ? Math.abs((this.jumpCount * this.jumpSpeedReal) / REAL_RES_X - 0.5)
        : Math.abs(this.jumpDistanceLeft / this.jumpDistance - 0.5);
      ret += this.jumpPeak * (4 * fraction ** 2 - 1);
    }
    return ret + this.yOffset;
  }

  screenZ(height = 0): number {
    if (this.alwaysOnTop) return 999;
    const z = this.screenYGround();
    if (this.tileId > 0) return z + (this.map.priorities[this.tileId] ?? 0) * 32;
    return z + (height > TILE_HEIGHT ? TILE_HEIGHT - 1 : 0);
  }

  moving(): boolean {
    return this.realX !== this.x * REAL_RES_X || this.realY !== this.y * REAL_RES_Y;
  }

  jumping(): boolean {
    return this.jumpDistanceLeft > 0 || this.jumpCount > 0;
  }

  straighten(): void {
    if (this.walkAnime || this.stepAnime) this.pattern = 0;
    this.animeCount = 0;
    this.prelockDirection = 0;
  }

  forceMoveRoute(route: MoveRoute): void {
    if (this.originalMoveRoute == null) {
      this.originalMoveRoute = this.moveRoute;
      this.originalMoveRouteIndex = this.moveRouteIndex;
    }
    this.moveRoute = route;
    this.moveRouteIndex = 0;
    this.moveRouteForcing = true;
    this.prelockDirection = 0;
    this.waitCount = 0;
    this.moveTypeCustom();
  }

  moveto(x: number, y: number): void {
    this.x = mod(x, this.map.width);
    this.y = mod(y, this.map.height);
    this.realX = this.x * REAL_RES_X;
    this.realY = this.y * REAL_RES_Y;
    this.prelockDirection = 0;
    this.movetoHappened = true;
    this.calculateBushDepth();
    this.triggerLeaveTile();
  }

  triggerLeaveTile(): void {
    if (this.oldX != null && this.oldY != null && this.oldMap != null &&
        (this.oldX !== this.x || this.oldY !== this.y || this.oldMap !== this.map.mapId)) {
      EventHandlers.triggerSync("on_leave_tile", this, this.oldMap, this.oldX, this.oldY);
    }
    this.oldX = this.x;
    this.oldY = this.y;
    this.oldMap = this.map.mapId;
  }

  increaseSteps(): void {
    this.stopCount = 0;
    this.triggerLeaveTile();
  }

  // --- movement types -------------------------------------------------------

  protected moveTypeRandom(): void {
    switch (rand(6)) {
      case 0: case 1: case 2: case 3: this.moveRandom(); break;
      case 4: this.moveForward(); break;
      case 5: this.stopCount = 0; break;
    }
  }

  protected moveTypeTowardPlayer(): void {
    const [sx, sy] = this.distanceToPlayer();
    if (Math.abs(sx) + Math.abs(sy) >= 20) {
      this.moveRandom();
      return;
    }
    switch (rand(6)) {
      case 0: case 1: case 2: case 3: this.moveTowardPlayer(); break;
      case 4: this.moveRandom(); break;
      case 5: this.moveForward(); break;
    }
  }

  protected moveTypeCustom(): void {
    if (this.jumping() || this.moving() || !this.moveRoute) return;
    const route = this.moveRoute;
    while (this.moveRouteIndex <= route.list.length) {
      const command = route.list[this.moveRouteIndex];
      if (!command) {
        // End of the list (RMXP's code 0).
        if (route.repeat) {
          this.moveRouteIndex = 0;
        } else {
          if (this.moveRouteForcing) {
            this.moveRouteForcing = false;
            this.moveRoute = this.originalMoveRoute;
            this.moveRouteIndex = this.originalMoveRouteIndex;
            this.originalMoveRoute = null;
          }
          this.stopCount = 0;
        }
        return;
      }
      if (this.runMoveCommand(command, route)) return;
    }
  }

  /** Runs one move-route command; returns true when the route must pause. */
  private runMoveCommand(c: MoveCommand, route: MoveRoute): boolean {
    const step = (fn: () => void) => {
      fn();
      if (route.skippable || this.moving() || this.jumping()) this.moveRouteIndex += 1;
      return true;
    };
    const turn = (fn: () => void) => {
      fn();
      this.moveRouteIndex += 1;
      return true;
    };
    switch (c.move) {
      case "down": return step(() => this.moveDown());
      case "left": return step(() => this.moveLeft());
      case "right": return step(() => this.moveRight());
      case "up": return step(() => this.moveUp());
      case "lowerLeft": return step(() => this.moveLowerLeft());
      case "lowerRight": return step(() => this.moveLowerRight());
      case "upperLeft": return step(() => this.moveUpperLeft());
      case "upperRight": return step(() => this.moveUpperRight());
      case "random": return step(() => this.moveRandom());
      case "towardPlayer": return step(() => this.moveTowardPlayer());
      case "awayFromPlayer": return step(() => this.moveAwayFromPlayer());
      case "forward": return step(() => this.moveForward());
      case "backward": return step(() => this.moveBackward());
      case "jump": {
        const j = c as { x: number; y: number };
        return step(() => this.jump(j.x, j.y));
      }
      case "wait":
        // Essentials: (param * frame_rate / 20) - 1 frames.
        this.waitCount = Math.round((c as { seconds: number }).seconds * FRAME_RATE) - 1;
        this.moveRouteIndex += 1;
        return true;
      case "turnDown": return turn(() => this.turnDown());
      case "turnLeft": return turn(() => this.turnLeft());
      case "turnRight": return turn(() => this.turnRight());
      case "turnUp": return turn(() => this.turnUp());
      case "turnRight90": return turn(() => this.turnRight90());
      case "turnLeft90": return turn(() => this.turnLeft90());
      case "turn180": return turn(() => this.turn180());
      case "turnRightOrLeft90": return turn(() => this.turnRightOrLeft90());
      case "turnRandom": return turn(() => this.turnRandom());
      case "turnTowardPlayer": return turn(() => this.turnTowardPlayer());
      case "turnAwayFromPlayer": return turn(() => this.turnAwayFromPlayer());
    }
    // Codes >= 27: apply and continue with the next command this frame.
    const v = c as unknown as { value: number; id: number };
    switch (c.move) {
      case "switchOn": G.gameSwitches.set(v.id, true); this.map.needRefresh = true; break;
      case "switchOff": G.gameSwitches.set(v.id, false); this.map.needRefresh = true; break;
      case "speed": this.moveSpeed = v.value; break;
      case "frequency": this.moveFrequency = v.value; break;
      case "walkAnimeOn": this.walkAnime = true; break;
      case "walkAnimeOff": this.walkAnime = false; break;
      case "stepAnimeOn": this.stepAnime = true; break;
      case "stepAnimeOff": this.stepAnime = false; break;
      case "directionFixOn": this.directionFix = true; break;
      case "directionFixOff": this.directionFix = false; break;
      case "throughOn": this.through = true; break;
      case "throughOff": this.through = false; break;
      case "alwaysOnTopOn": case "alwaysOnTopOff": {
        const old = this.alwaysOnTop;
        this.alwaysOnTop = c.move === "alwaysOnTopOn";
        if (old !== this.alwaysOnTop) this.calculateBushDepth();
        break;
      }
      case "graphic": {
        const g = c as { characterName: string; characterHue: number; direction: number; pattern: number };
        const oldTile = this.tileId;
        this.tileId = 0;
        this.characterName = g.characterName;
        this.characterHue = g.characterHue;
        if (this.originalDirection !== g.direction) {
          this.direction = g.direction;
          this.originalDirection = this.direction;
          this.prelockDirection = 0;
        }
        if (this.originalPattern !== g.pattern) {
          this.pattern = g.pattern;
          this.originalPattern = this.pattern;
        }
        if (this.tileId !== oldTile) this.calculateBushDepth();
        break;
      }
      case "opacity": this.opacity = v.value; break;
      case "blendType": this.blendType = v.value; break;
      case "playSe": pbSEPlay((c as { audio: { name: string; volume: number; pitch: number } }).audio); break;
      case "script": moveRouteScript(this, c as { do?: unknown[]; ruby?: string }); break;
      default: console.warn("Unknown move command", c);
    }
    this.moveRouteIndex += 1;
    return false;
  }

  // --- movement ---------------------------------------------------------------

  protected moveGeneric(dir: number, turnEnabled = true): void {
    if (turnEnabled) this.turnGeneric(dir);
    if (this.canMoveInDirection(dir)) {
      this.turnGeneric(dir);
      this.x += dir === 4 ? -1 : dir === 6 ? 1 : 0;
      this.y += dir === 8 ? -1 : dir === 2 ? 1 : 0;
      this.increaseSteps();
    } else {
      this.checkEventTriggerTouch(dir);
    }
  }

  moveDown(turnEnabled = true): void { this.moveGeneric(2, turnEnabled); }
  moveLeft(turnEnabled = true): void { this.moveGeneric(4, turnEnabled); }
  moveRight(turnEnabled = true): void { this.moveGeneric(6, turnEnabled); }
  moveUp(turnEnabled = true): void { this.moveGeneric(8, turnEnabled); }

  private moveDiagonal(dir: number, dx: number, dy: number, faces: Record<number, number>): void {
    if (!this.directionFix) this.direction = faces[this.direction] ?? this.direction;
    if (this.canMoveInDirection(dir)) {
      this.x += dx;
      this.y += dy;
      this.increaseSteps();
    }
  }
  moveUpperLeft(): void { this.moveDiagonal(7, -1, -1, { 6: 4, 2: 8 }); }
  moveUpperRight(): void { this.moveDiagonal(9, 1, -1, { 4: 6, 2: 8 }); }
  moveLowerLeft(): void { this.moveDiagonal(1, -1, 1, { 6: 4, 8: 2 }); }
  moveLowerRight(): void { this.moveDiagonal(3, 1, 1, { 4: 6, 8: 2 }); }

  moveRandom(): void {
    switch (rand(4)) {
      case 0: this.moveDown(false); break;
      case 1: this.moveLeft(false); break;
      case 2: this.moveRight(false); break;
      case 3: this.moveUp(false); break;
    }
  }

  moveRandomRange(xrange = -1, yrange = -1): void {
    const dirs: number[] = []; // 0=down, 1=left, 2=right, 3=up
    if (xrange < 0) dirs.push(1, 2);
    else if (xrange > 0) {
      if (this.x > this.originalX - xrange) dirs.push(1);
      if (this.x < this.originalX + xrange) dirs.push(2);
    }
    if (yrange < 0) dirs.push(0, 3);
    else if (yrange > 0) {
      if (this.y < this.originalY + yrange) dirs.push(0);
      if (this.y > this.originalY - yrange) dirs.push(3);
    }
    if (dirs.length === 0) return;
    switch (dirs[rand(dirs.length)]) {
      case 0: this.moveDown(false); break;
      case 1: this.moveLeft(false); break;
      case 2: this.moveRight(false); break;
      case 3: this.moveUp(false); break;
    }
  }

  private distanceToPlayer(): [number, number] {
    const p = player();
    return [this.x + this.width / 2 - (p.x + p.width / 2), this.y - this.height / 2 - (p.y - p.height / 2)];
  }

  moveTowardPlayer(): void {
    const [sx, sy] = this.distanceToPlayer();
    if (sx === 0 && sy === 0) return;
    let ax = Math.abs(sx), ay = Math.abs(sy);
    if (ax === ay) rand(2) === 0 ? (ax += 1) : (ay += 1);
    if (ax > ay) {
      sx > 0 ? this.moveLeft() : this.moveRight();
      if (!this.moving() && sy !== 0) sy > 0 ? this.moveUp() : this.moveDown();
    } else {
      sy > 0 ? this.moveUp() : this.moveDown();
      if (!this.moving() && sx !== 0) sx > 0 ? this.moveLeft() : this.moveRight();
    }
  }

  moveAwayFromPlayer(): void {
    const [sx, sy] = this.distanceToPlayer();
    if (sx === 0 && sy === 0) return;
    let ax = Math.abs(sx), ay = Math.abs(sy);
    if (ax === ay) rand(2) === 0 ? (ax += 1) : (ay += 1);
    if (ax > ay) {
      sx > 0 ? this.moveRight() : this.moveLeft();
      if (!this.moving() && sy !== 0) sy > 0 ? this.moveDown() : this.moveUp();
    } else {
      sy > 0 ? this.moveDown() : this.moveUp();
      if (!this.moving() && sx !== 0) sx > 0 ? this.moveRight() : this.moveLeft();
    }
  }

  moveForward(): void {
    switch (this.direction) {
      case 2: this.moveDown(false); break;
      case 4: this.moveLeft(false); break;
      case 6: this.moveRight(false); break;
      case 8: this.moveUp(false); break;
    }
  }

  moveBackward(): void {
    const last = this.directionFix;
    this.directionFix = true;
    switch (this.direction) {
      case 2: this.moveUp(false); break;
      case 4: this.moveRight(false); break;
      case 6: this.moveLeft(false); break;
      case 8: this.moveDown(false); break;
    }
    this.directionFix = last;
  }

  jump(xPlus: number, yPlus: number): void {
    if (xPlus !== 0 || yPlus !== 0) {
      if (Math.abs(xPlus) > Math.abs(yPlus)) xPlus < 0 ? this.turnLeft() : this.turnRight();
      else yPlus < 0 ? this.turnUp() : this.turnDown();
      for (const [i, j] of this.eachOccupiedTile()) if (!this.passable(i + xPlus, j + yPlus, 0)) return;
    }
    this.x += xPlus;
    this.y += yPlus;
    this.startJump(xPlus, yPlus);
  }

  protected startJump(xPlus: number, yPlus: number): void {
    const realDistance = Math.sqrt(xPlus * xPlus + yPlus * yPlus);
    const distance = Math.max(1, realDistance);
    this.jumpPeak = (distance * TILE_HEIGHT * 3) / 8; // 3/4 of tile for ledge jumping
    this.jumpDistance = Math.max(Math.abs(xPlus) * REAL_RES_X, Math.abs(yPlus) * REAL_RES_Y);
    this.jumpDistanceLeft = 1; // Just needs to be non-zero
    if (realDistance > 0) {
      this.jumpCount = 0;
    } else {
      this.jumpSpeedReal_ = null;
      this.jumpCount = REAL_RES_X / this.jumpSpeedReal; // frames to jump one tile
    }
    this.stopCount = 0;
    this.triggerLeaveTile();
  }

  jumpForward(): void {
    const [dx, dy] = ({ 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] } as Record<number, [number, number]>)[this.direction] ?? [0, 0];
    this.jump(dx, dy);
  }

  jumpBackward(): void {
    const [dx, dy] = ({ 2: [0, -1], 4: [1, 0], 6: [-1, 0], 8: [0, 1] } as Record<number, [number, number]>)[this.direction] ?? [0, 0];
    this.jump(dx, dy);
  }

  turnGeneric(dir: number): void {
    if (this.directionFix) return;
    const old = this.direction;
    this.direction = dir;
    this.stopCount = 0;
    if (dir !== old) this.checkEventTriggerAfterTurning();
  }

  turnDown(): void { this.turnGeneric(2); }
  turnLeft(): void { this.turnGeneric(4); }
  turnRight(): void { this.turnGeneric(6); }
  turnUp(): void { this.turnGeneric(8); }

  turnRight90(): void {
    ({ 2: () => this.turnLeft(), 4: () => this.turnUp(), 6: () => this.turnDown(), 8: () => this.turnRight() } as Record<number, () => void>)[this.direction]?.();
  }
  turnLeft90(): void {
    ({ 2: () => this.turnRight(), 4: () => this.turnDown(), 6: () => this.turnUp(), 8: () => this.turnLeft() } as Record<number, () => void>)[this.direction]?.();
  }
  turn180(): void {
    ({ 2: () => this.turnUp(), 4: () => this.turnRight(), 6: () => this.turnLeft(), 8: () => this.turnDown() } as Record<number, () => void>)[this.direction]?.();
  }
  turnRightOrLeft90(): void {
    rand(2) === 0 ? this.turnRight90() : this.turnLeft90();
  }
  turnRandom(): void {
    [() => this.turnUp(), () => this.turnRight(), () => this.turnLeft(), () => this.turnDown()][rand(4)]!();
  }
  turnTowardPlayer(): void {
    const [sx, sy] = this.distanceToPlayer();
    if (sx === 0 && sy === 0) return;
    if (Math.abs(sx) > Math.abs(sy)) sx > 0 ? this.turnLeft() : this.turnRight();
    else sy > 0 ? this.turnUp() : this.turnDown();
  }
  turnAwayFromPlayer(): void {
    const [sx, sy] = this.distanceToPlayer();
    if (sx === 0 && sy === 0) return;
    if (Math.abs(sx) > Math.abs(sy)) sx > 0 ? this.turnRight() : this.turnLeft();
    else sy > 0 ? this.turnDown() : this.turnUp();
  }

  /** Overridden by Game_Event / Game_Player. */
  checkEventTriggerAfterTurning(): void {}
  checkEventTriggerTouch(_dir: number): boolean { return false; }

  // --- per-frame update -------------------------------------------------------

  update(): void {
    this.movedLastFrame = this.movedThisFrame;
    this.stoppedLastFrame = this.stoppedThisFrame;
    this.movedThisFrame = false;
    this.stoppedThisFrame = false;
    if (!G.gameTemp.inMenu) {
      this.updateCommand();
      this.moving() || this.jumping() ? this.updateMove() : this.updateStop();
    }
    this.updatePattern();
  }

  protected updateCommand(): void {
    if (this.waitCount > 0) this.waitCount -= 1;
    else if (this.moveRouteForcing) this.moveTypeCustom();
    else if (!this.starting && !this.isLocked() && !this.moving() && !this.jumping()) this.updateCommandNew();
  }

  protected updateCommandNew(): void {
    if (this.stopCount >= this.moveFrequencyReal) {
      switch (this.moveType) {
        case 1: this.moveTypeRandom(); break;
        case 2: this.moveTypeTowardPlayer(); break;
        case 3: this.moveTypeCustom(); break;
      }
    }
  }

  protected updateMove(): void {
    const distance = this.jumping() ? this.jumpSpeedReal : this.moveSpeedReal;
    const destX = this.x * REAL_RES_X;
    const destY = this.y * REAL_RES_Y;
    if (this.realX < destX) {
      this.realX += distance;
      if (this.realX > destX - 0.1) this.realX = destX;
    } else {
      this.realX -= distance;
      if (this.realX < destX + 0.1) this.realX = destX;
    }
    if (this.realY < destY) {
      this.realY += distance;
      if (this.realY > destY - 0.1) this.realY = destY;
    } else {
      this.realY -= distance;
      if (this.realY < destY + 0.1) this.realY = destY;
    }
    if (this.jumping()) {
      if (this.jumpCount > 0) this.jumpCount -= 1; // For stationary jumps only
      this.jumpDistanceLeft = Math.max(Math.abs(destX - this.realX), Math.abs(destY - this.realY));
    }
    if (!this.jumping() && !this.moving()) {
      EventHandlers.triggerSync("on_step_taken", this);
      this.calculateBushDepth();
      this.stoppedThisFrame = true;
    } else if (!this.movedLastFrame || this.stoppedLastFrame) {
      this.calculateBushDepth(); // Started a new step
    }
    if (this.walkAnime || this.stepAnime) this.animeCount += 1;
    this.movedThisFrame = true;
  }

  protected updateStop(): void {
    if (this.stepAnime) this.animeCount += 1;
    if (!this.starting && !this.isLocked()) this.stopCount += 1;
  }

  protected updatePattern(): void {
    if (this.lockPattern) return;
    if (this.movedLastFrame && !this.movedThisFrame && !this.stepAnime) {
      this.pattern = this.originalPattern;
      this.animeCount = 0;
      return;
    }
    if (!this.movedLastFrame && this.movedThisFrame && !this.stepAnime) {
      if (this.walkAnime) this.pattern = (this.pattern + 1) % 4;
      this.animeCount = 0;
      return;
    }
    const realSpeed = this.jumping() ? this.jumpSpeedReal : this.moveSpeedReal;
    let framesPerPattern = REAL_RES_X / (realSpeed * 2);
    if (this.moveSpeed >= 5) framesPerPattern *= 2; // Cycling speed or faster
    if (this.animeCount < framesPerPattern) return;
    this.pattern = (this.pattern + 1) % 4;
    this.animeCount -= framesPerPattern;
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

// Late-bound hooks, filled in by modules that would otherwise import this one.
type MapFactoryApi = { getNewMap(x: number, y: number, mapId?: number): [GameMap, number, number] | null };
let mapFactoryRef: () => MapFactoryApi = () => G.mapFactory as unknown as MapFactoryApi;
export function mapFactory(): MapFactoryApi {
  return mapFactoryRef();
}
export function setMapFactoryRef(fn: () => MapFactoryApi): void {
  mapFactoryRef = fn;
}

let moveRouteScriptHook: (ch: GameCharacter, c: { do?: unknown[]; ruby?: string }) => void = () => {};
export function moveRouteScript(ch: GameCharacter, c: { do?: unknown[]; ruby?: string }): void {
  moveRouteScriptHook(ch, c);
}
export function setMoveRouteScriptHook(fn: typeof moveRouteScriptHook): void {
  moveRouteScriptHook = fn;
}

export { terrainTag };

/** Fields saveState() keeps (move speed/frequency go through their setters). */
const CHARACTER_STATE = [
  "x", "y", "realX", "realY", "xOffset", "yOffset", "tileId", "characterName", "characterHue",
  "opacity", "blendType", "direction", "pattern", "patternSurf", "lockPattern", "through",
  "transparent", "walkAnime", "originalDirection", "originalPattern", "moveType", "moveRoute",
  "moveRouteIndex", "moveRouteForcing", "originalMoveRoute", "originalMoveRouteIndex", "stepAnime",
  "directionFix", "alwaysOnTop", "animeCount", "stopCount", "jumpPeak", "jumpDistance",
  "jumpDistanceLeft", "jumpCount", "waitCount", "locked", "prelockDirection", "bushDepth_",
] as const;
