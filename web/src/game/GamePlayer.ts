// Port of 004_Game classes/009_Game_Player.rb (+ pbLedge / pbJumpToward /
// pbEndSurf / pbOnStepTaken from 012_Overworld).
//
// Ruby blocks inside the player's update for ledge jumps (pbJumpToward loops
// on Graphics.update). Here the sync movement code queues that as
// `this.blocking`, and update() awaits it at the same point in the frame.

import { assetExists } from "../core/assets";
import { rand } from "../core/random";
import { Input } from "../rgss/Input";
import { Graphics } from "../rgss/Graphics";
import { EventHandlers } from "./eventHandlers";
import { CharacterHooks, GameCharacter, REAL_RES_X, REAL_RES_Y, TILE_HEIGHT, TILE_WIDTH, FRAME_RATE } from "./GameCharacter";
import type { GameEvent } from "./GameEvent";
import { eventCanReachPlayer, pbEventFacesPlayer } from "./GameEvent";
import type { GameMap } from "./GameMap";
import { G, pbUpdateSceneMap } from "./globals";
import { pbSEPlay } from "./GameSystem";
import { mapMetadata, playerMetadata } from "./metadata";
import { terrainTag, type TerrainTag } from "../data/gameData/terrainTag";

const SCREEN_CENTER_X = (512 / 2 - TILE_WIDTH / 2) * 4;
const SCREEN_CENTER_Y = (384 / 2 - TILE_HEIGHT / 2) * 4;
const BOB_FRAME_SPEED = 1 / 15;
/** Settings::DUST_ANIMATION_ID */
const DUST_ANIMATION_ID = 2;

/** $player as the overworld needs it, until the full Player class lands. */
export interface OverworldTrainer {
  name: string;
  gender: number;
  money: number;
  characterID: number;
  outfit: number;
  hasRunningShoes: boolean;
}

export function trainer(): OverworldTrainer | null {
  return G.player as unknown as OverworldTrainer | null;
}

export function pbMapInterpreterRunning(): boolean {
  return G.gameSystem.mapInterpreter.running();
}

export class GamePlayer extends GameCharacter {
  readonly isPlayer = true;
  bumpSe = 0;
  charsetData: [number, string, number] | null = null;
  encounterCount = 0;
  /** A blocking action (ledge jump) to await during this frame's update. */
  private blocking: (() => Promise<void>) | null = null;
  private lastdir = 0;
  private lastdirframe = 0;

  override get map(): GameMap {
    return G.gameMap as unknown as GameMap;
  }

  get mapId(): number {
    return this.map.mapId;
  }

  /** Queues a blocking action for this frame's await point (wild battles started while turning). */
  queueBlocking(fn: () => Promise<void>): void {
    const prev = this.blocking;
    this.blocking = prev ? async () => { await prev(); await fn(); } : fn;
  }

  hasFollower(): boolean {
    return G.pokemonGlobal.followers.length > 0;
  }

  /** Following Pokemon EX aliases this (game/following/aliases.ts). */
  canMapTransferWithFollower(): boolean {
    return G.pokemonGlobal.followers.length === 0;
  }

  /** Following Pokemon EX aliases this (game/following/aliases.ts). */
  canRideVehicleWithFollower(): boolean {
    return G.pokemonGlobal.followers.length === 0;
  }

  override screenZ(height = 0): number {
    return super.screenZ(height) + 1;
  }

  canRun(): boolean {
    if (this.moveRouteForcing) return this.moveSpeed > 3;
    const t = G.gameTemp;
    if (t.inMenu || t.inBattle || t.messageWindowShowing || pbMapInterpreterRunning()) return false;
    const g = G.pokemonGlobal;
    if (!trainer()?.hasRunningShoes && !g.diving && !g.surfing && !g.bicycle) return false;
    if (this.jumping()) return false;
    if (this.pbTerrainTag().mustWalk) return false;
    return (G.pokemonSystem.runstyle === 1) !== Input.press(Input.BACK);
  }

  /** The v20.1 Hotfixes' set_movement_type (Overworld bug fixes.rb): this game's copy cycles at speed 6. */
  setMovementType(type: string): void {
    const meta = playerMetadata(trainer()?.characterID ?? 1);
    let charset: string | null | undefined = null;
    const force = !this.moveRouteForcing;
    switch (type) {
      case "fishing": charset = pbGetPlayerCharset(fishCharset(meta)); break;
      case "surf_fishing": charset = pbGetPlayerCharset(meta?.surfFishCharset ?? fishCharset(meta)); break;
      case "diving": case "diving_fast": case "diving_jumping": case "diving_stopped":
        if (force) this.moveSpeed = 3;
        charset = pbGetPlayerCharset(meta?.diveCharset ?? surfCharset(meta));
        break;
      case "surfing": case "surfing_fast": case "surfing_jumping": case "surfing_stopped":
        if (force) this.moveSpeed = type === "surfing_jumping" ? 3 : 4;
        charset = pbGetPlayerCharset(surfCharset(meta));
        break;
      case "cycling": case "cycling_fast": case "cycling_jumping": case "cycling_stopped":
        if (force) this.moveSpeed = type === "cycling_jumping" ? 3 : 6;
        charset = pbGetPlayerCharset(cycleCharset(meta));
        break;
      case "running":
        if (force) this.moveSpeed = 4;
        charset = pbGetPlayerCharset(runCharset(meta));
        break;
      case "ice_sliding":
        if (force) this.moveSpeed = 4;
        charset = pbGetPlayerCharset(meta?.walkCharset);
        break;
      default: // walking, jumping, walking_stopped
        if (force) this.moveSpeed = 3;
        charset = pbGetPlayerCharset(meta?.walkCharset);
    }
    if (charset) this.characterName = charset;
  }

  refreshCharset(): void {
    const meta = playerMetadata(trainer()?.characterID ?? 1);
    const g = G.pokemonGlobal;
    const charset = g.diving ? meta?.diveCharset ?? surfCharset(meta) : g.surfing ? surfCharset(meta) : g.bicycle ? cycleCharset(meta) : meta?.walkCharset;
    const resolved = pbGetPlayerCharset(charset);
    if (resolved) this.characterName = resolved;
  }

  bumpIntoObject(): void {
    if (this.bumpSe > 0) return;
    if (!this.moveRouteForcing) pbSEPlay("Player bump");
    this.bumpSe = FRAME_RATE / 4;
  }

  protected override moveGeneric(dir: number, turnEnabled = true): void {
    if (turnEnabled) this.turnGeneric(dir, true);
    if (!G.gameTemp.encounterTriggered) {
      if (this.canMoveInDirection(dir)) {
        const xo = dir === 4 ? -1 : dir === 6 ? 1 : 0;
        const yo = dir === 8 ? -1 : dir === 2 ? 1 : 0;
        if (this.pbLedge(xo, yo)) return;
        if (this.pbEndSurf(xo, yo)) return;
        this.turnGeneric(dir, true);
        PlayerHooks.beforeStep?.(this, dir); // Marin's Enhanced Staircases' `yield`
        if (!G.gameTemp.encounterTriggered) {
          this.x += xo;
          this.y += yo;
          // $stats.distance_walked etc. arrive with the Stats port.
          this.increaseSteps();
        }
      } else if (!this.checkEventTriggerTouch(dir)) {
        this.bumpIntoObject();
      }
    }
    G.gameTemp.encounterTriggered = false;
  }

  override turnGeneric(dir: number, keepEncIndicator = false): void {
    const old = this.direction;
    super.turnGeneric(dir);
    if (this.direction !== old && !this.moveRouteForcing && !pbMapInterpreterRunning()) {
      EventHandlers.triggerSync("on_player_change_direction");
      if (!keepEncIndicator) G.gameTemp.encounterTriggered = false;
    }
  }

  override jump(xPlus: number, yPlus: number): void {
    if (xPlus !== 0 || yPlus !== 0) {
      if (Math.abs(xPlus) > Math.abs(yPlus)) xPlus < 0 ? this.turnLeft() : this.turnRight();
      else yPlus < 0 ? this.turnUp() : this.turnDown();
      for (const [i, j] of this.eachOccupiedTile()) if (!this.passable(i + xPlus, j + yPlus, 0)) return;
    }
    this.x += xPlus;
    this.y += yPlus;
    this.startJump(xPlus, yPlus);
  }

  /** pbLedge: hop down a ledge (blocks until the jump lands). */
  private pbLedge(_xo: number, _yo: number): boolean {
    if (!this.pbFacingTerrainTag().ledge) return false;
    const x = this.x, y = this.y;
    this.jumpTowardStart(2);
    if (this.x !== x || this.y !== y) {
      pbSEPlay("Player jump");
      this.blocking = async () => {
        while (this.jumping()) {
          await Graphics.update();
          Input.update();
          await pbUpdateSceneMap();
        }
        // $scene.spriteset.addUserAnimation(Settings::DUST_ANIMATION_ID, x, y, true, 1)
        const scene = G.scene as unknown as { spriteset?(): { addUserAnimation(id: number, x: number, y: number, t: boolean, h: number): unknown } | undefined };
        scene.spriteset?.()?.addUserAnimation(DUST_ANIMATION_ID, this.x, this.y, true, 1);
        this.increaseSteps();
        this.checkEventTriggerHere([1, 2]);
      };
    }
    return true;
  }

  private jumpTowardStart(dist: number): void {
    switch (this.direction) {
      case 2: this.jump(0, dist); break;
      case 4: this.jump(-dist, 0); break;
      case 6: this.jump(dist, 0); break;
      case 8: this.jump(0, -dist); break;
    }
  }

  /** pbEndSurf (012_Overworld/004_Overworld_FieldMoves.rb): game/field/FieldMoves.ts. */
  private pbEndSurf(xo: number, yo: number): boolean {
    return PlayerHooks.endSurf(xo, yo);
  }

  pbTriggeredTrainerEvents(triggers: number[], checkIfRunning = true, trainerOnly = false): GameEvent[] {
    const result: GameEvent[] = [];
    if (checkIfRunning && pbMapInterpreterRunning()) return result;
    for (const event of this.map.events.values()) {
      if (event.trigger == null || !triggers.includes(event.trigger)) continue;
      const tr = /trainer\((\d+)\)/i.exec(event.name);
      const sight = /sight\((\d+)\)/i.exec(event.name);
      if (!tr && (trainerOnly || !sight)) continue;
      const distance = Number((tr ?? sight)![1]);
      if (!eventCanReachPlayer(event, this, distance)) continue;
      if (event.jumping() || event.overTrigger()) continue;
      result.push(event);
    }
    return result;
  }

  pbTriggeredCounterEvents(triggers: number[], checkIfRunning = true): GameEvent[] {
    const result: GameEvent[] = [];
    if (checkIfRunning && pbMapInterpreterRunning()) return result;
    for (const event of this.map.events.values()) {
      if (event.trigger == null || !triggers.includes(event.trigger)) continue;
      const m = /counter\((\d+)\)/i.exec(event.name);
      if (!m) continue;
      if (!pbEventFacesPlayer(event, this, Number(m[1]))) continue;
      if (event.jumping() || event.overTrigger()) continue;
      result.push(event);
    }
    return result;
  }

  override checkEventTriggerAfterTurning(): void {}

  pbCheckEventTriggerFromDistance(triggers: number[]): boolean {
    const ret = [...this.pbTriggeredTrainerEvents(triggers), ...this.pbTriggeredCounterEvents(triggers)];
    if (ret.length === 0) return false;
    for (const e of ret) e.start();
    return true;
  }

  pbTerrainTag(countBridge = false): TerrainTag {
    const f = G.mapFactory as unknown as { getTerrainTagFromCoords(m: number, x: number, y: number, b: boolean): TerrainTag } | null;
    if (f) return f.getTerrainTagFromCoords(this.map.mapId, this.x, this.y, countBridge);
    return this.map.terrainTag(this.x, this.y, countBridge);
  }

  pbFacingEvent(ignoreInterpreter = false): GameEvent | null {
    if (pbMapInterpreterRunning() && !ignoreInterpreter) return null;
    let nx = this.x + (this.direction === 6 ? 1 : this.direction === 4 ? -1 : 0);
    let ny = this.y + (this.direction === 2 ? 1 : this.direction === 8 ? -1 : 0);
    if (!this.map.valid(nx, ny)) return null;
    for (const e of this.map.events.values()) {
      if (e.atCoordinate(nx, ny) && !e.jumping() && !e.overTrigger()) return e;
    }
    if (this.map.counter(nx, ny)) {
      nx += this.direction === 6 ? 1 : this.direction === 4 ? -1 : 0;
      ny += this.direction === 2 ? 1 : this.direction === 8 ? -1 : 0;
      for (const e of this.map.events.values()) {
        if (e.atCoordinate(nx, ny) && !e.jumping() && !e.overTrigger()) return e;
      }
    }
    return null;
  }

  pbFacingTerrainTag(dir?: number): TerrainTag {
    const f = G.mapFactory as unknown as { getFacingTerrainTag(d: number, e: GameCharacter): TerrainTag } | null;
    if (f) return f.getFacingTerrainTag(dir ?? this.direction, this);
    const d = dir ?? this.direction;
    const xo = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1][d] ?? 0;
    const yo = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1][d] ?? 0;
    return this.map.terrainTag(this.x + xo, this.y + yo);
  }

  override passable(x: number, y: number, d: number, strict = false): boolean {
    const nx = x + (d === 6 ? 1 : d === 4 ? -1 : 0);
    const ny = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
    if (!this.map.validLax(nx, ny)) return false;
    if (!this.map.valid(nx, ny)) {
      const f = G.mapFactory as unknown as { isPassableFromEdge(x: number, y: number): boolean } | null;
      return f ? f.isPassableFromEdge(nx, ny) : false;
    }
    return super.passable(x, y, d, strict);
  }

  center(x: number, y: number): void {
    this.map.displayX = x * REAL_RES_X - SCREEN_CENTER_X;
    this.map.displayY = y * REAL_RES_Y - SCREEN_CENTER_Y;
  }

  override moveto(x: number, y: number): void {
    super.moveto(x, y);
    this.center(x, y);
    this.makeEncounterCount();
  }

  makeEncounterCount(): void {
    if (this.map.mapId !== 0) {
      const n = this.map.encounterStep;
      this.encounterCount = rand(n) + rand(n) + 1;
    }
  }

  refresh(): void {
    this.opacity = 255;
    this.blendType = 0;
  }

  checkEventTriggerHere(triggers: number[]): boolean {
    let result = false;
    if (pbMapInterpreterRunning()) return result;
    for (const e of this.map.events.values()) {
      if (!e.atCoordinate(this.x, this.y) || e.trigger == null || !triggers.includes(e.trigger)) continue;
      if (e.jumping() || !e.overTrigger()) continue;
      e.start();
      result = true;
    }
    return result;
  }

  checkEventTriggerThere(triggers: number[]): boolean {
    let result = false;
    if (pbMapInterpreterRunning()) return result;
    let nx = this.x + (this.direction === 6 ? 1 : this.direction === 4 ? -1 : 0);
    let ny = this.y + (this.direction === 2 ? 1 : this.direction === 8 ? -1 : 0);
    if (!this.map.valid(nx, ny)) return false;
    const scan = () => {
      for (const e of this.map.events.values()) {
        if (e.trigger == null || !triggers.includes(e.trigger) || !e.atCoordinate(nx, ny)) continue;
        if (e.jumping() || e.overTrigger()) continue;
        e.start();
        result = true;
      }
    };
    scan();
    if (!result && this.map.counter(nx, ny)) {
      nx += this.direction === 6 ? 1 : this.direction === 4 ? -1 : 0;
      ny += this.direction === 2 ? 1 : this.direction === 8 ? -1 : 0;
      if (!this.map.valid(nx, ny)) return false;
      scan();
    }
    return result;
  }

  override checkEventTriggerTouch(dir: number): boolean {
    let result = false;
    if (pbMapInterpreterRunning()) return result;
    const xo = dir === 4 ? -1 : dir === 6 ? 1 : 0;
    const yo = dir === 8 ? -1 : dir === 2 ? 1 : 0;
    for (const e of this.map.events.values()) {
      if (e.trigger !== 1 && e.trigger !== 2) continue;
      if (!e.atCoordinate(this.x + xo, this.y + yo)) continue;
      const sight = /(?:sight|trainer)\((\d+)\)/i.exec(e.name);
      const counter = /counter\((\d+)\)/i.exec(e.name);
      if (sight) {
        if (!eventCanReachPlayer(e, this, Number(sight[1]))) continue;
      } else if (counter) {
        if (!pbEventFacesPlayer(e, this, Number(counter[1]))) continue;
      }
      if (e.jumping() || e.overTrigger()) continue;
      e.start();
      result = true;
    }
    return result;
  }

  override async update(): Promise<void> {
    const lastRealX = this.realX, lastRealY = this.realY;
    // Game_Character#update, with await points for blocking movement (after
    // the command: ledges/surf; after the move: what :on_step_taken starts).
    CharacterHooks.beforeUpdate?.(this);
    this.movedLastFrame = this.movedThisFrame;
    this.stoppedLastFrame = this.stoppedThisFrame;
    this.movedThisFrame = false;
    this.stoppedThisFrame = false;
    if (!G.gameTemp.inMenu) {
      this.updateCommand();
      await this.runBlocking();
      this.moving() || this.jumping() ? this.updateMove() : this.updateStop();
      await this.runBlocking();
    }
    this.updatePattern();
    CharacterHooks.afterUpdate?.(this);
    if (G.gameTemp.inMenu && this.stoppedLastFrame) this.updateStop();
    this.updateScreenPosition(lastRealX, lastRealY);
    PlayerHooks.afterScreenPosition?.(this);
    // Update dependent events
    if ((!this.movedLastFrame || this.stoppedLastFrame || (this.stoppedThisFrame && G.pokemonGlobal.sliding)) &&
        (this.moving() || this.jumping())) {
      G.gameTemp.followers?.moveFollowers();
    }
    await G.gameTemp.followers?.update();
    if (this.bumpSe > 0) this.bumpSe -= 1;
    // Finish up dismounting from surfing
    if (G.gameTemp.endingSurf && !this.moving()) {
      pbCancelVehicles();
      (G.gameTemp as unknown as { surfBaseCoords: unknown }).surfBaseCoords = null;
      G.gameTemp.endingSurf = false;
    }
    await this.updateEventTriggering();
  }

  private async runBlocking(): Promise<void> {
    while (this.blocking) {
      const b = this.blocking;
      this.blocking = null;
      await b();
    }
  }

  protected override updateCommandNew(): void {
    const dir = Input.dir4();
    const t = G.gameTemp;
    if (!(pbMapInterpreterRunning() || t.messageWindowShowing || t.inMiniUpdate || t.inMenu)) {
      if (this.movedLastFrame || (dir > 0 && dir === this.lastdir && Graphics.frameCount - this.lastdirframe > FRAME_RATE / 20)) {
        switch (dir) {
          case 2: this.moveDown(); break;
          case 4: this.moveLeft(); break;
          case 6: this.moveRight(); break;
          case 8: this.moveUp(); break;
        }
      } else if (dir !== this.lastdir) {
        switch (dir) {
          case 2: this.turnDown(); break;
          case 4: this.turnLeft(); break;
          case 6: this.turnRight(); break;
          case 8: this.turnUp(); break;
        }
      }
    }
    if (dir !== this.lastdir) this.lastdirframe = Graphics.frameCount;
    this.lastdir = dir;
  }

  protected override updateMove(): void {
    if (!this.movedLastFrame || this.stoppedLastFrame) {
      const g = G.pokemonGlobal;
      if (this.pbTerrainTag().ice) {
        this.setMovementType("ice_sliding");
      } else {
        const faster = this.canRun();
        if (g.diving) this.setMovementType(faster ? "diving_fast" : "diving");
        else if (g.surfing) this.setMovementType(faster ? "surfing_fast" : "surfing");
        else if (g.bicycle) this.setMovementType(faster ? "cycling_fast" : "cycling");
        else this.setMovementType(faster ? "running" : "walking");
      }
      if (this.jumping()) {
        if (g.diving) this.setMovementType("diving_jumping");
        else if (g.surfing) this.setMovementType("surfing_jumping");
        else if (g.bicycle) this.setMovementType("cycling_jumping");
        else this.setMovementType("jumping");
      }
    }
    super.updateMove();
  }

  protected override updateStop(): void {
    if (this.stoppedLastFrame) {
      const g = G.pokemonGlobal;
      if (g.diving) this.setMovementType("diving_stopped");
      else if (g.surfing) this.setMovementType("surfing_stopped");
      else if (g.bicycle) this.setMovementType("cycling_stopped");
      else this.setMovementType("walking_stopped");
    }
    super.updateStop();
  }

  protected override updatePattern(): void {
    const g = G.pokemonGlobal;
    if (g.surfing || g.diving) {
      // Essentials counts 60 frames per bob cycle; scaled to the original 40 fps.
      const p = Math.floor(((Graphics.frameCount * (40 / FRAME_RATE)) % 60) * BOB_FRAME_SPEED);
      if (!this.lockPattern) this.pattern = p;
      this.patternSurf = p;
      this.bobHeight = p >= 2 ? 2 : 0;
      this.animeCount = 0;
    } else {
      this.bobHeight = 0;
      super.updatePattern();
    }
  }

  private updateScreenPosition(_lx: number, _ly: number): void {
    if (this.map.scrolling() || !(this.movedLastFrame || this.movedThisFrame)) return;
    this.map.displayX = this.realX - SCREEN_CENTER_X;
    this.map.displayY = this.realY - SCREEN_CENTER_Y;
  }

  private async updateEventTriggering(): Promise<void> {
    if (this.moving()) return;
    if (this.movedThisFrame) {
      G.gameTemp.followers?.turnFollowers();
      let result = this.pbCheckEventTriggerFromDistance([2]);
      result = this.checkEventTriggerHere([1, 2]) || result;
      await pbOnStepTaken(result);
    }
    if (Input.trigger(Input.USE) && !G.gameTemp.inMiniUpdate) {
      this.checkEventTriggerHere([0]);
      this.checkEventTriggerThere([0, 2]);
    }
  }
}

type CharsetMeta = ReturnType<typeof playerMetadata>;
/** GameData::PlayerMetadata's charset fallbacks (run -> walk, cycle -> run, surf -> cycle, fish -> walk). */
const runCharset = (m: CharsetMeta) => m?.runCharset ?? m?.walkCharset;
const cycleCharset = (m: CharsetMeta) => m?.cycleCharset ?? runCharset(m);
const surfCharset = (m: CharsetMeta) => m?.surfCharset ?? cycleCharset(m);
const fishCharset = (m: CharsetMeta) => m?.fishCharset ?? m?.walkCharset;

/** Overworld code the player's update calls into (game/field). */
export const PlayerHooks: {
  /** pbEndSurf(x_offset, y_offset): true if it took over the move. */
  endSurf: (xOffset: number, yOffset: number) => boolean;
  /** Marin's Enhanced Staircases: the block move_up/move_down pass to move_generic. */
  beforeStep?: (p: GamePlayer, dir: number) => void;
  /** Marin's Enhanced Staircases: its moving? alias re-centres the screen here. */
  afterScreenPosition?: (p: GamePlayer) => void;
} = { endSurf: () => false };

/** pbOnStepTaken (012_Overworld/001_Overworld.rb), without wild encounters. */
async function pbOnStepTakenBase(eventTriggered: boolean): Promise<void> {
  const p = G.gamePlayer as unknown as GamePlayer;
  if (p.moveRouteForcing || pbMapInterpreterRunning()) {
    EventHandlers.triggerSync("on_step_taken", p);
    return;
  }
  const g = G.pokemonGlobal as unknown as { stepcount?: number };
  g.stepcount = ((g.stepcount ?? 0) + 1) & 0x7fffffff;
  EventHandlers.triggerSync("on_player_step_taken");
  void eventTriggered;
  G.gameTemp.encounterTriggered = false;
}

/**
 * pbOnStepTaken: Visible Overworld Wild Encounters replaces it with the one
 * that also starts wild battles / spawns Pokémon (game/encounters/visibleEncounters.ts).
 */
export let pbOnStepTaken: (eventTriggered: boolean) => Promise<void> = pbOnStepTakenBase;
export function setOnStepTaken(fn: (eventTriggered: boolean) => Promise<void>): void {
  pbOnStepTaken = fn;
}

/** pbGetPlayerCharset: the charset, or its "_<outfit>" variant when that file exists. */
export function pbGetPlayerCharset(charset: string | undefined, force = false, forTrainer: OverworldTrainer | null = null): string | null {
  if (!charset) return null;
  const t = forTrainer ?? trainer();
  const outfit = t?.outfit ?? 0;
  const p = G.gamePlayer as unknown as GamePlayer | null;
  if (!force && p?.charsetData && p.charsetData[0] === t?.characterID && p.charsetData[1] === charset && p.charsetData[2] === outfit) {
    return null;
  }
  if (p) p.charsetData = [t?.characterID ?? 1, charset, outfit];
  if (assetExists(`Graphics/Characters/${charset}_${outfit}`)) return `${charset}_${outfit}`;
  return charset;
}

export { terrainTag };

/** pbUpdateVehicle (009_Game_Player.rb) */
export function pbUpdateVehicle(): void {
  const g = G.pokemonGlobal;
  const p = G.gamePlayer as unknown as GamePlayer;
  if (g.diving) p.setMovementType("diving_stopped");
  else if (g.surfing) p.setMovementType("surfing_stopped");
  else if (g.bicycle) p.setMovementType("cycling_stopped");
  else p.setMovementType("walking_stopped");
}

/** pbCancelVehicles (009_Game_Player.rb) */
export function pbCancelVehicles(destination: number | null = null, cancelSwimming = true): void {
  const g = G.pokemonGlobal;
  if (cancelSwimming) {
    g.surfing = false;
    g.diving = false;
  }
  if (destination == null || !pbCanUseBike(destination)) g.bicycle = false;
  pbUpdateVehicle();
}

/** pbCanUseBike? (009_Game_Player.rb) */
export function pbCanUseBike(mapId: number): boolean {
  const m = mapMetadata(mapId);
  if (!m) return false;
  return !!(m.alwaysBicycle || m.canBicycle || m.outdoorMap);
}
