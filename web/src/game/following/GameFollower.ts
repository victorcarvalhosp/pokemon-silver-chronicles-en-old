// Port of 004_Game classes/011_Game_Follower.rb as this game runs it:
// - Side Stairs Tiles redefines move_through / move_fancy / jump_fancy /
//   fancy_moveto (diagonal steps on StairLeft/StairRight tiles, the follower
//   turns towards its leader after each step);
// - Marin's Enhanced Staircases redefines follow_leader (its stair checks
//   apply on its stairs, game/field/EnhancedStaircases.ts);
// - Following Pokemon EX (New Event Type/Following Event.rb) adds
//   show_dust_animation and the Game_FollowingPkmn subclass, and
//   (Script Additions/Compatibility.rb) calculates the bush depth on creation.

import type { MapEvent, EventPage } from "../../data/types";
import { Data } from "../../data/store";
import { terrainTag } from "../../data/gameData/terrainTag";
import { FRAME_RATE, REAL_RES_X, REAL_RES_Y, player, type GameCharacter } from "../GameCharacter";
import { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import type { PokemonMapFactory } from "../MapFactory";
import { DUST_ANIMATION_ID, FollowingPkmnConfig } from "./config";
import { FollowingPkmn } from "./FollowingPkmn";
import { pbTurnTowardEvent } from "./moveRoute";
import { sceneMap } from "./scene";

const factory = () => G.mapFactory as unknown as PokemonMapFactory;

/** What a Game_Follower is built from (FollowerData, GameFollowerFactory.ts). */
export interface FollowerEventData {
  originalMapId: number;
  eventId: number;
  eventName: string;
  currentMapId: number;
  x: number;
  y: number;
  direction: number;
  characterName: string;
  characterHue: number;
  commonEventId: number | null;
}

/** RPG::Event::Page.new: the defaults of an editor event page. */
function defaultPage(): EventPage {
  return {
    condition: { switch1: null, switch2: null, variable: null, selfSwitch: null },
    graphic: { tileId: 0, characterName: "", characterHue: 0, direction: 2, pattern: 0, opacity: 255, blendType: 0 },
    moveType: 0,
    moveSpeed: 3,
    moveFrequency: 3,
    moveRoute: { repeat: true, skippable: false, list: [] },
    walkAnime: true,
    stepAnime: false,
    directionFix: false,
    through: false,
    alwaysOnTop: false,
    trigger: 0,
    list: [],
  };
}

/** Instances of this are stored in @realEvents. */
export class GameFollower extends GameEvent {
  constructor(eventData: FollowerEventData) {
    // Create RPG::Event to base self on
    const rpgEvent: MapEvent = { id: eventData.eventId, name: eventData.eventName, x: eventData.x, y: eventData.y, pages: [defaultPage()] };
    if (eventData.commonEventId) {
      // Must setup common event list here and now
      rpgEvent.pages[0]!.list = Data.commonEvents.get(eventData.commonEventId)?.list ?? [];
    }
    // Create self
    super(eventData.originalMapId, rpgEvent, factory().getMap(eventData.currentMapId));
    // Modify self
    this.characterName = eventData.characterName;
    this.characterHue = eventData.characterHue;
    switch (eventData.direction) {
      case 2: this.turnDown(); break;
      case 4: this.turnLeft(); break;
      case 6: this.turnRight(); break;
      case 8: this.turnUp(); break;
    }
    // Following Pokemon EX: make sure shadows of Following Pokemon exist
    this.calculateBushDepth();
  }

  override get map(): GameMap { return super.map; }
  /** attr_writer :map */
  override set map(map: GameMap) { this.map_ = map; }

  /** Marks Game_FollowingPkmn (is_a? checks in code that can't import it). */
  get isFollowingPkmn(): boolean { return false; }

  //=============================================================================

  moveThrough(direction: number): void {
    const oldThrough = this.through;
    this.through = true;
    switch (direction) {
      case 1: this.moveLowerLeft(); break;
      case 2: this.moveDown(); break;
      case 3: this.moveLowerRight(); break;
      case 4: this.moveLeft(); break;
      case 6: this.moveRight(); break;
      case 7: this.moveUpperLeft(); break;
      case 8: this.moveUp(); break;
      case 9: this.moveUpperRight(); break;
    }
    this.through = oldThrough;
  }

  moveFancy(direction: number, leader: GameCharacter): void {
    let deltaX = direction === 6 ? 1 : direction === 4 ? -1 : 0;
    let deltaY = direction === 2 ? 1 : direction === 8 ? -1 : 0;
    let dir = direction;
    const oldTag = this.map.terrainTag(this.x, this.y).id;
    const oldX = this.x;
    const tagAt = (x: number, y: number) => this.map.terrainTag(x, y).id;
    if (direction === 4) {
      if (oldTag === "StairLeft") {
        if (this.passable(this.x - 1, this.y + 1, 4) && tagAt(this.x - 1, this.y + 1) === "StairLeft") {
          deltaY += 1;
          dir = 1;
        }
      } else if (oldTag === "StairRight") {
        if (this.passable(this.x - 1, this.y - 1, 6)) {
          deltaY -= 1;
          dir = 7;
        }
      }
    } else if (direction === 6) {
      if (oldTag === "StairLeft" && this.passable(this.x + 1, this.y - 1, 4)) {
        deltaY -= 1;
        dir = 9;
      } else if (oldTag === "StairRight" && this.passable(this.x + 1, this.y + 1, 6) && tagAt(this.x + 1, this.y + 1) === "StairRight") {
        deltaY += 1;
        dir = 3;
      }
    }
    const newX = this.x + deltaX;
    const newY = this.y + deltaY;
    // Move if new position is the player's, or the new position is passable,
    // or self's current position is not passable
    const p = player();
    if ((p.x === newX && p.y === newY) ||
        this.locationPassable(newX, newY, 10 - direction) ||
        !this.locationPassable(this.x, this.y, direction)) {
      this.moveThrough(dir);
    }
    const newTag = this.map.terrainTag(this.x, this.y).id;
    if (oldX !== this.x) {
      if ((oldTag !== "StairLeft" && newTag === "StairLeft") || (oldTag !== "StairRight" && newTag === "StairRight")) {
        this.offsetY = -16; // game/field/SideStairs.ts draws it
        if ((newTag === "StairLeft" && direction === 4) || (newTag === "StairRight" && direction === 6)) this.y += 1;
      } else if ((oldTag === "StairLeft" && newTag !== "StairLeft") || (oldTag === "StairRight" && newTag !== "StairRight")) {
        this.offsetY = 0;
      }
    }
    this.turnTowardsLeader(leader);
  }

  jumpFancy(direction: number, leader: GameCharacter): void {
    const deltaX = direction === 6 ? 2 : direction === 4 ? -2 : 0;
    const deltaY = direction === 2 ? 2 : direction === 8 ? -2 : 0;
    const halfDeltaX = deltaX / 2;
    const halfDeltaY = deltaY / 2;
    if (this.locationPassable(this.x + halfDeltaX, this.y + halfDeltaY, 10 - direction)) {
      // Can walk over the middle tile normally; just take two steps
      this.moveFancy(direction, leader);
      this.moveFancy(direction, leader);
    } else if (this.locationPassable(this.x + deltaX, this.y + deltaY, 10 - direction)) {
      // Can't walk over the middle tile, but can walk over the end tile; jump over
      if (this.locationPassable(this.x, this.y, direction)) {
        if (leader.jumping()) {
          this.jumpSpeedReal_ = leader.jumpSpeedReal;
        } else {
          // This is doubled because self has to jump 2 tiles in the time it
          // takes the leader to move one tile.
          this.jumpSpeedReal_ = leader.moveSpeedReal * 2;
        }
        this.jump(deltaX, deltaY);
      } else {
        // self's current tile isn't passable; just take two steps ignoring passability
        this.moveThrough(direction);
        this.moveThrough(direction);
      }
    }
  }

  fancyMoveto(newX: number, newY: number, leader: GameCharacter): void {
    const dy = this.y - newY;
    if (this.x - newX === 1 && dy >= -1 && dy <= 1) {
      this.moveFancy(4, leader);
    } else if (this.x - newX === -1 && dy >= -1 && dy <= 1) {
      this.moveFancy(6, leader);
    } else if (this.x === newX && dy === 1) {
      this.moveFancy(8, leader);
    } else if (this.x === newX && dy === -1) {
      this.moveFancy(2, leader);
    } else if (this.x - newX === 2 && this.y === newY) {
      this.jumpFancy(4, leader);
    } else if (this.x - newX === -2 && this.y === newY) {
      this.jumpFancy(6, leader);
    } else if (this.x === newX && dy === 2) {
      this.jumpFancy(8, leader);
    } else if (this.x === newX && dy === -2) {
      this.jumpFancy(2, leader);
    } else if (this.x !== newX || this.y !== newY) {
      this.moveto(newX, newY);
    }
  }

  //=============================================================================

  turnTowardsLeader(leader: GameCharacter): void {
    pbTurnTowardEvent(this, leader);
  }

  /** The tile behind the leader, as follow_leader works it out. */
  protected followTarget(leader: GameCharacter): [number, number, number] {
    const f = factory();
    const behindDirection = 10 - leader.direction;
    let target = f.getFacingTile(behindDirection, leader);
    if (target && f.getTerrainTag(target[0], target[1], target[2]).ledge) {
      // Get the tile above the ledge (where the leader jumped from)
      target = f.getFacingTileFromPos(target[0], target[1], target[2], behindDirection);
    }
    return target ?? [leader.map.mapId, leader.x, leader.y];
  }

  /** Moves self onto the target's map, keeping its position relative to it. */
  protected changeMap(target: [number, number, number]): void {
    if (this.map.mapId === target[0]) return;
    const f = factory();
    const vector = f.getRelativePos(target[0], 0, 0, this.map.mapId, this.x, this.y);
    this.map_ = f.getMap(target[0]);
    // NOTE: Can't use moveto because vector is outside the boundaries of the
    //       map, and moveto doesn't allow setting invalid coordinates.
    this.x = vector[0];
    this.y = vector[1];
    this.realX = this.x * REAL_RES_X;
    this.realY = this.y * REAL_RES_Y;
  }

  /** Marin's Enhanced Staircases version. */
  followLeader(leader: GameCharacter, instant = false, _leaderIsTrueLeader = true): void {
    const mapsConnected = factory().areConnected(leader.map.mapId, this.map.mapId);
    let target: [number, number, number];
    // Get the target tile that self wants to move to
    if (mapsConnected) {
      target = this.followTarget(leader);
      // Added (game/field/EnhancedStaircases.ts)
      this.stairFollowTarget?.(leader, target);
    } else {
      // Map transfer to an unconnected map
      target = [leader.map.mapId, leader.x, leader.y];
    }
    // Move self to the target
    this.changeMap(target);
    if (instant || !mapsConnected) this.moveto(target[1], target[2]);
    else this.fancyMoveto(target[1], target[2], leader);
  }

  //=============================================================================

  protected override updateMove(): void {
    const wasJumping = this.jumping();
    super.updateMove();
    if (wasJumping && !this.jumping()) this.showDustAnimation();
  }

  showDustAnimation(): void {
    const spriteset = sceneMap()?.spriteset(this.mapId);
    spriteset?.addUserAnimation(DUST_ANIMATION_ID, this.x, this.y, true, 1);
  }

  /** walk_anime= (Game_FollowingPkmn guards it while sliding). */
  setWalkAnime(value: boolean): void {
    this.walkAnime = value;
  }

  /** move_speed_real= as Marin's factory assigns it (the leader's value, already per frame). */
  copyMoveSpeedReal(leader: GameCharacter): void {
    this.moveSpeedReal_ = leader.moveSpeedReal;
  }

  //=============================================================================

  protected locationPassable(x: number, y: number, direction: number): boolean {
    return locationPassable(this, x, y, direction, false);
  }
}

/** Game_Follower#location_passable? (+ Following Pokemon EX's water check). */
function locationPassable(self: GameFollower, x: number, y: number, direction: number, canSurf: boolean): boolean {
  const thisMap = self.map;
  if (!thisMap || !thisMap.valid(x, y)) return false;
  if (self.through) return true;
  const bridge = G.pokemonGlobal.bridge;
  let passedTileChecks = false;
  const bit = (1 << (Math.floor(direction / 2) - 1)) & 0x0f;
  // Check all events for ones using tiles as graphics, and see if they're passable
  for (const event of thisMap.events.values()) {
    // NOTE: tile_id is never < 0, so events with no tile graphic get here too
    //       (tile 0), as in Essentials.
    if (event.tileId < 0 || event.through || !event.atCoordinate(x, y)) continue;
    const tileData = terrainTag(thisMap.terrainTags[event.tileId] ?? 0);
    if (tileData.ignorePassability) continue;
    if (tileData.bridge && bridge === 0) continue;
    if (tileData.ledge) return false;
    // Allow Followers to surf if they can travel on water
    if (canSurf && tileData.canSurf && FollowingPkmn.waterborneFollower()) return true;
    const passage = thisMap.passages[event.tileId] ?? 0;
    if (passage & bit) return false;
    if ((tileData.bridge && bridge > 0) || (thisMap.priorities[event.tileId] ?? -1) === 0) passedTileChecks = true;
    if (passedTileChecks) break;
  }
  // Check if tiles at (x, y) allow passage for follower
  if (!passedTileChecks) {
    for (const i of [2, 1, 0]) {
      const tileId = thisMap.tile(x, y, i);
      if (tileId === 0) continue;
      const tileData = terrainTag(thisMap.terrainTags[tileId] ?? 0);
      if (tileData.ignorePassability) continue;
      if (tileData.bridge && bridge === 0) continue;
      if (tileData.ledge) return false;
      if (canSurf && tileData.canSurf && FollowingPkmn.waterborneFollower()) return true;
      const passage = thisMap.passages[tileId] ?? 0;
      if (passage & bit) return false;
      if (tileData.bridge && bridge > 0) break;
      if ((thisMap.priorities[tileId] ?? -1) === 0) break;
    }
  }
  // Check all events on the map to see if any are in the way
  for (const event of thisMap.events.values()) {
    if (!event.atCoordinate(x, y)) continue;
    if (!event.through && event.characterName !== "") return false;
  }
  return true;
}

//===============================================================================
// Following Pokemon EX (New Event Type/Following Event.rb): the Following
// Pokémon's event.
//===============================================================================
export class GameFollowingPkmn extends GameFollower {
  override get isFollowingPkmn(): boolean { return true; }

  /** Update pattern at a constant rate independent of move speed. */
  protected override updatePattern(): void {
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
    let framesPerPattern = REAL_RES_X / ((512 / FRAME_RATE) * 1.5);
    if (this.moveSpeed > 5) framesPerPattern *= 2;
    if (this.animeCount < framesPerPattern) return;
    this.pattern = (this.pattern + 1) % 4;
    this.animeCount -= framesPerPattern;
  }

  /** Don't turn off walk animation when sliding on ice if the following pokemon is airborne. */
  override setWalkAnime(value: boolean): void {
    if (G.pokemonGlobal.sliding && (!FollowingPkmn.active() || FollowingPkmn.airborneFollower())) return;
    super.setWalkAnime(value);
  }

  /** Don't reset walk animation when sliding on ice if the following pokemon is airborne. */
  override straighten(): void {
    if (G.pokemonGlobal.sliding && (!FollowingPkmn.active() || FollowingPkmn.airborneFollower())) return;
    super.straighten();
  }

  /** Don't show dust animation if Following Pokemon isn't active or is airborne. */
  override showDustAnimation(): void {
    if (!FollowingPkmn.active() || FollowingPkmn.airborneFollower()) return;
    super.showDustAnimation();
  }

  /** Allow following pokemon to freely walk on water. */
  protected override locationPassable(x: number, y: number, direction: number): boolean {
    return locationPassable(this, x, y, direction, true);
  }

  /** Prevents the follower from turning with the player unless ALWAYS_FACE_PLAYER. */
  override turnTowardsLeader(leader: GameCharacter): void {
    if (FollowingPkmn.active() && !FollowingPkmnConfig.ALWAYS_FACE_PLAYER) return;
    pbTurnTowardEvent(this, leader);
  }

  /** follow_leader with the changes for Marin's and Boonzeet's side stairs. */
  override followLeader(leader: GameCharacter, instant = false, _leaderIsTrueLeader = true): void {
    if (this.moveRouteForcing) return;
    const f = factory();
    const mapsConnected = f.areConnected(leader.map.mapId, this.map.mapId);
    let target: [number, number, number];
    // Get the target tile that self wants to move to
    if (mapsConnected) {
      target = this.followTarget(leader);
      // GameData::TerrainTag.exists?(:StairLeft) (Side Stairs Tiles registers it)
      const currentTag = f.getTerrainTag(this.map.mapId, this.x, this.y).id;
      const p = player();
      if (currentTag === "StairLeft") target[2] += target[1] > p.x ? -1 : 1;
      else if (currentTag === "StairRight") target[2] += target[1] < p.x ? -1 : 1;
      // `if defined?(on_stair?) && on_stair?` (game/field/EnhancedStaircases.ts)
      this.stairFollowTarget?.(leader, target);
    } else {
      // Map transfer to an unconnected map
      target = [leader.map.mapId, leader.x, leader.y];
    }
    // Move self to the target
    this.changeMap(target);
    if (instant || !mapsConnected) this.moveto(target[1], target[2]);
    else this.fancyMoveto(target[1], target[2], leader);
  }

  /** Make Follower Appear above player. */
  override screenZ(height = 0): number {
    return super.screenZ(height) + 1;
  }
}
