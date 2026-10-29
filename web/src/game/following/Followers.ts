// Port of the Followers helper module (004_Game classes/012_Game_FollowerFactory.rb)
// with Following Pokemon EX's aliases (New Event Type/Misc.rb): removing
// followers refreshes the Following Pokémon, and Followers.clear keeps it
// while the game is starting over. Also the deprecated pbAddDependency* /
// pbRemoveDependency* / pbGetDependency wrappers.

import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { FollowingPkmn } from "./FollowingPkmn";
import type { GameFollower } from "./GameFollower";
import type { GameFollowerFactory } from "./GameFollowerFactory";

const factory = () => G.gameTemp.followers as unknown as GameFollowerFactory;
const gameMap = () => G.gameMap as unknown as GameMap;

export const Followers = {
  /**
   * @param eventId ID of the event on the current map to be added as a follower
   * @param name identifier name of the follower to be added
   * @param commonEventId ID of the Common Event triggered when interacting with this follower
   */
  add(eventId: number, name: string | null, commonEventId: number | null): void {
    factory().addFollower(gameMap().events.get(eventId), name, commonEventId);
  },

  /** @param event map event to be added as a follower */
  addEvent(event: GameEvent): void {
    factory().addFollower(event);
  },

  /** @param name identifier name of the follower to be removed */
  remove(name: string): void {
    factory().removeFollowerByName(name);
    void FollowingPkmn.refresh(false);
  },

  /** @param event map event to be removed as a follower */
  removeEvent(event: GameEvent): void {
    factory().removeFollowerByEvent(event);
    void FollowingPkmn.refresh(false);
  },

  /** Removes all followers (but not the Following Pokémon when starting over). */
  clear(): void {
    // $game_temp.starting_over: Following Pokemon EX's pbStartOver alias sets it (game/battle/startOver.ts).
    if ((G.gameTemp as { startingOver?: boolean }).startingOver) {
      factory().removeAllExceptFollowingPkmn();
    } else {
      factory().removeAllFollowers();
      G.pokemonGlobal.partner = null; // pbDeregisterPartner rescue nil (game/trainers/trainerEvents.ts)
    }
    void FollowingPkmn.refresh(false);
  },

  /**
   * @param name name of the follower to get, or null for the first follower
   * @returns follower object
   */
  get(name: string | null = null): GameFollower | null {
    if (name) return factory().getFollowerByName(name);
    return factory().getFollowerByIndex();
  },

  followIntoDoor(): void {
    factory().followIntoDoor();
  },

  hideFollowers(): void {
    factory().hideFollowers();
  },

  putFollowersOnPlayer(): void {
    factory().putFollowersOnPlayer();
  },
};

//===============================================================================
// Deprecated methods (slated to be removed in v21)
//===============================================================================
const deprecated = (method: string, replacement: string) =>
  console.warn(`WARN: method ${method} is deprecated and will be removed in v21. Use ${replacement} instead.`);

export function pbAddDependency2(eventId: number, name: string, commonEventId: number): void {
  deprecated("pbAddDependency2", "Followers.add(event_id, name, common_event_id)");
  Followers.add(eventId, name, commonEventId);
}

export function pbAddDependency(event: GameEvent): void {
  deprecated("pbAddDependency", "Followers.add_event(event)");
  Followers.addEvent(event);
}

export function pbRemoveDependency2(name: string): void {
  deprecated("pbRemoveDependency2", "Followers.remove(name)");
  Followers.remove(name);
}

export function pbRemoveDependency(event: GameEvent): void {
  deprecated("pbRemoveDependency", "Followers.remove_event(event)");
  Followers.removeEvent(event);
}

export function pbRemoveDependencies(): void {
  deprecated("pbRemoveDependencies", "Followers.clear");
  Followers.clear();
}

export function pbGetDependency(name: string): GameFollower | null {
  deprecated("pbGetDependency", "Followers.get(name)");
  return Followers.get(name);
}
