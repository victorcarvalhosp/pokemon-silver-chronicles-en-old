// Port of 004_Game classes/012_Game_FollowerFactory.rb (FollowerData and
// Game_FollowerFactory; FollowerSprites is FollowerSprites.ts and the
// Followers module Followers.ts), as this game runs it:
// - Game_FollowerFactory#update is Marin's Enhanced Staircases' version (it
//   loads after the v20.1 Hotfixes' one and replaces it), followed by
//   Following Pokemon EX's alias (Script Additions/Compatibility.rb);
// - Following Pokemon EX (New Event Type/Following Event.rb) adds
//   FollowerData#following_pkmn?, the interact alias, the Game_FollowingPkmn
//   class for the Following Pokémon and its own move_followers /
//   turn_followers / remove_all_except_following_pkmn.
//
// FollowerData lives in $PokemonGlobal.followers and is saved with it (the
// "global_metadata" save value snapshots its fields). The Game_Follower events
// are rebuilt from it whenever $game_temp.followers is created
// (GameTemp#followers in globals.ts).

import { Input } from "../../rgss/Input";
import type { GameCharacter } from "../GameCharacter";
import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { pbMapInterpreterRunning, type GamePlayer } from "../GamePlayer";
import { G, type FollowerFactoryLike } from "../globals";
import { pbMapInterpreter } from "../Interpreter";
import type { PokemonMapFactory } from "../MapFactory";
import { FollowingPkmn } from "./FollowingPkmn";
import { GameFollower, GameFollowingPkmn } from "./GameFollower";
import { PBMoveRoute, pbMoveRoute } from "./moveRoute";
import { updateShowsShadow } from "./OverworldShadows";

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;

/** Data saved in $PokemonGlobal.followers. */
export class FollowerData {
  originalMapId: number;
  eventId: number;
  eventName: string;
  currentMapId: number;
  x: number;
  y: number;
  direction: number;
  characterName: string;
  characterHue: number;
  name: string | null = null;
  commonEventId: number | null = null;
  visible = true;
  invisibleAfterTransfer = false;

  constructor(originalMapId: number, eventId: number, eventName: string, currentMapId: number, x: number, y: number,
    direction: number, characterName: string, characterHue: number) {
    this.originalMapId = originalMapId;
    this.eventId = eventId;
    this.eventName = eventName;
    this.currentMapId = currentMapId;
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.characterName = characterName;
    this.characterHue = characterHue;
  }

  /** A FollowerData again from its saved fields. */
  static fromJSON(json: unknown): FollowerData {
    if (json instanceof FollowerData) return json;
    return Object.assign(Object.create(FollowerData.prototype) as FollowerData, new FollowerData(0, 0, "", 0, 0, 0, 2, "", 0), json);
  }

  /** visible? */
  isVisible(): boolean {
    return this.visible && !this.invisibleAfterTransfer;
  }

  /**
   * following_pkmn?: name[/FollowingPkmn/]. Ruby raises on a nameless
   * follower (Followers.add_event); here it's simply not the Following Pokémon.
   */
  followingPkmn(): boolean {
    return /FollowingPkmn/.test(this.name ?? "");
  }

  /** interact(event), with Following Pokemon EX's alias. */
  async interact(event: GameFollower): Promise<void> {
    if (!this.followingPkmn()) return this.baseInteract(event);
    if (!this.commonEventId) {
      if (gameMap().needRefresh) gameMap().refresh();
      event.lock();
      await FollowingPkmn.talk();
      event.unlock();
    } else if (await FollowingPkmn.canTalk()) {
      return this.baseInteract(event);
    }
  }

  private baseInteract(event: GameFollower | null): void {
    if (!event || (event.list?.length ?? 0) < 1) return; // event.list.size <= 1 (only the terminator)
    if (!this.commonEventId) return;
    // Start event
    if (gameMap().needRefresh) gameMap().refresh();
    event.lock();
    pbMapInterpreter().setup(event.list, event.id, event.map.mapId);
  }
}

/** Stores Game_Follower instances just for the current play session ($game_temp.followers). */
export class GameFollowerFactory implements FollowerFactoryLike {
  lastUpdate: number;
  private events: (GameFollower | null)[] = [];

  constructor() {
    const followers = G.pokemonGlobal.followers;
    // Saved followers come back as plain objects.
    for (let i = 0; i < followers.length; i++) followers[i] = FollowerData.fromJSON(followers[i]);
    for (const follower of followers as FollowerData[]) this.events.push(this.createFollowerObject(follower));
    this.lastUpdate = -1;
  }

  private get followers(): FollowerData[] {
    return G.pokemonGlobal.followers as FollowerData[];
  }

  //=============================================================================

  addFollower(event: GameEvent | null | undefined, name: string | null = null, commonEventId: number | null = null): void {
    if (!event) return;
    const followers = this.followers;
    const mapId = gameMap().mapId;
    if (followers.some((data) => data.originalMapId === mapId && data.eventId === event.id)) {
      return; // Event is already dependent
    }
    const eventData = new FollowerData(mapId, event.id, event.name, mapId, event.x, event.y, event.direction,
      event.characterName, event.characterHue);
    eventData.name = name;
    eventData.commonEventId = commonEventId;
    const newEvent = this.createFollowerObject(eventData);
    followers.push(eventData);
    this.events.push(newEvent);
    this.lastUpdate += 1;
  }

  removeFollowerByEvent(event: GameEvent): void {
    const followers = this.followers;
    const mapId = gameMap().mapId;
    for (let i = 0; i < followers.length; i++) {
      const follower = followers[i]!;
      if (follower.currentMapId !== mapId) continue;
      if (follower.originalMapId !== event.mapId) continue;
      if (follower.eventId !== event.id) continue;
      (followers as (FollowerData | null)[])[i] = null;
      this.events[i] = null;
      this.lastUpdate += 1;
    }
    this.compact();
  }

  removeFollowerByName(name: string): void {
    const followers = this.followers;
    for (let i = 0; i < followers.length; i++) {
      if (followers[i]!.name !== name) continue;
      (followers as (FollowerData | null)[])[i] = null;
      this.events[i] = null;
      this.lastUpdate += 1;
    }
    this.compact();
  }

  removeAllFollowers(): void {
    this.followers.length = 0;
    this.events = [];
    this.lastUpdate += 1;
  }

  /** Following Pokemon EX: removes all followers except the Following Pokémon. */
  removeAllExceptFollowingPkmn(): void {
    const followers = this.followers;
    for (let i = 0; i < followers.length; i++) {
      if (followers[i]!.followingPkmn()) continue;
      (followers as (FollowerData | null)[])[i] = null;
      this.events[i] = null;
      this.lastUpdate += 1;
    }
    this.compact();
  }

  /** followers.compact! / @events.compact! */
  private compact(): void {
    const kept = this.followers.filter((f) => f != null);
    this.followers.length = 0;
    this.followers.push(...kept);
    this.events = this.events.filter((e) => e != null);
  }

  getFollowerByIndex(index = 0): GameFollower | null {
    return this.events[index] ?? null;
  }

  getFollowerByName(name: string): GameFollower | null {
    for (const [event, follower] of this.eachFollower()) if (follower?.name === name) return event;
    return null;
  }

  /** each_follower { |event, follower| } */
  eachFollower(): [GameFollower, FollowerData][] {
    return this.followers.map((follower, i) => [this.events[i]!, follower]);
  }

  //=============================================================================

  /** Following Pokemon EX: an inactive Following Pokemon isn't a leader. */
  turnFollowers(): void {
    let leader: GameCharacter = gamePlayer();
    this.followers.forEach((follower, i) => {
      const event = this.events[i]!;
      event.turnTowardsLeader(leader);
      follower.direction = event.direction;
      if (!(event instanceof GameFollowingPkmn) || FollowingPkmn.active()) leader = event;
    });
  }

  /** Following Pokemon EX: an inactive Following Pokemon isn't a leader. */
  moveFollowers(): void {
    let leader: GameCharacter = gamePlayer();
    this.followers.forEach((follower, i) => {
      const event = this.events[i]!;
      event.followLeader(leader, false, i === 0);
      follower.x = event.x;
      follower.y = event.y;
      follower.currentMapId = event.map.mapId;
      follower.direction = event.direction;
      if (!(event instanceof GameFollowingPkmn) || FollowingPkmn.active()) leader = event;
    });
  }

  mapTransferFollowers(): void {
    const p = gamePlayer();
    this.followers.forEach((follower, i) => {
      const event = this.events[i]!;
      event.map = gameMap();
      event.moveto(p.x, p.y);
      event.direction = p.direction;
      event.opacity = 255;
      follower.x = event.x;
      follower.y = event.y;
      follower.currentMapId = event.map.mapId;
      follower.direction = event.direction;
      follower.invisibleAfterTransfer = true;
    });
  }

  followIntoDoor(): void {
    // Setting an event's move route also makes it start along that move route,
    // so we need to record all followers' current positions first before setting
    // any move routes
    const p = gamePlayer();
    const followerPos: [number, number, number][] = [[p.map.mapId, p.x, p.y]];
    this.followers.forEach((_follower, i) => {
      const event = this.events[i]!;
      followerPos.push([event.map.mapId, event.x, event.y]);
    });
    // Calculate and set move route from each follower to player
    const moveRoute: number[] = [];
    const f = G.mapFactory as unknown as PokemonMapFactory;
    this.followers.forEach((_follower, i) => {
      const event = this.events[i]!;
      const leader = followerPos[i]!;
      const vector = f.getRelativePos(event.map.mapId, event.x, event.y, leader[0], leader[1], leader[2]);
      if (vector[0] !== 0) {
        moveRoute.unshift(vector[0] > 0 ? PBMoveRoute.Right : PBMoveRoute.Left);
      } else if (vector[1] !== 0) {
        moveRoute.unshift(vector[1] > 0 ? PBMoveRoute.Down : PBMoveRoute.Up);
      }
      pbMoveRoute(event, [...moveRoute, PBMoveRoute.Opacity, 0]);
    });
  }

  /** Used when coming out of a door. */
  hideFollowers(): void {
    this.followers.forEach((_follower, i) => {
      this.events[i]!.opacity = 0;
    });
  }

  /** Used when coming out of a door. Makes all followers invisible until the player starts moving. */
  putFollowersOnPlayer(): void {
    const p = gamePlayer();
    this.followers.forEach((follower, i) => {
      const event = this.events[i]!;
      event.moveto(p.x, p.y);
      event.opacity = 255;
      follower.x = event.x;
      follower.y = event.y;
      follower.invisibleAfterTransfer = true;
    });
  }

  //=============================================================================

  /** Marin's Enhanced Staircases' update, then Following Pokemon EX's alias. */
  async update(): Promise<void> {
    const followers = this.followers;
    if (followers.length === 0) return;
    // Update all followers
    let leader: GameCharacter = gamePlayer();
    const p = gamePlayer();
    const playerMoving = p.moving() || p.jumping();
    for (let i = 0; i < followers.length; i++) {
      const follower = followers[i]!;
      const event = this.events[i];
      if (!event) continue;
      if (follower.invisibleAfterTransfer && playerMoving) {
        follower.invisibleAfterTransfer = false;
        event.turnTowardsLeader(p);
      }
      event.through = event.onStair?.() ?? false; // Added
      event.copyMoveSpeedReal(leader);
      event.transparent = !follower.isVisible();
      updateShowsShadow(event); // Overworld Shadows EX's transparent= alias
      if (G.pokemonGlobal.sliding) {
        event.straighten();
        event.setWalkAnime(false);
      } else {
        event.setWalkAnime(true);
      }
      if (event.jumping() || event.moving() || !playerMoving) {
        await event.update();
      } else if (!event.isStarting) {
        event.setStarting();
        await event.update();
        event.clearStarting();
      }
      follower.direction = event.direction;
      leader = event;
    }
    // Check event triggers
    const t = G.gameTemp;
    if (Input.trigger(Input.USE) && !t.inMenu && !t.inBattle && !p.moveRouteForcing && !t.messageWindowShowing &&
        !pbMapInterpreterRunning()) {
      // Get position of tile facing the player
      const facingTile = (G.mapFactory as unknown as PokemonMapFactory).getFacingTile();
      // Assumes player is 1x1 tile in size
      for (const [event, follower] of this.eachFollower()) {
        if (event.atCoordinate(p.x, p.y)) { // Underneath player
          if (!event.overTrigger()) continue;
        } else if (facingTile && event.map.mapId === facingTile[0] && event.atCoordinate(facingTile[1], facingTile[2])) { // On facing tile
          if (event.overTrigger()) continue;
        } else { // Somewhere else
          continue;
        }
        if (event.jumping()) continue;
        await follower.interact(event);
      }
    }
    // Following Pokemon EX (Compatibility.rb): prevent Enhanced Stairs from
    // messing with FollowingPokemon
    leader = gamePlayer();
    for (let i = 0; i < this.followers.length; i++) {
      const event = this.events[i];
      if (!event) continue;
      event.moveSpeed = leader.moveSpeed;
      leader = event;
    }
  }

  //=============================================================================

  /** create_follower_object, with Following Pokemon EX's alias. */
  private createFollowerObject(eventData: FollowerData): GameFollower {
    if (eventData.followingPkmn()) return new GameFollowingPkmn(eventData);
    return new GameFollower(eventData);
  }
}

