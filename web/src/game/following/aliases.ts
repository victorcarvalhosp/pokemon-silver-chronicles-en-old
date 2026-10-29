// Following Pokemon EX's hooks into the rest of the game, ported as the Ruby
// does them (aliases that run the original, then the plugin's code):
// - Script Additions/Refresh.rb: Scene_Map#update (party cycling, friendship
//   and item timers), #transfer_player, #miniupdate and #call_menu; the
//   :on_enter_map and :on_player_step_taken handlers; the refreshes after
//   the party screen / Bag (ui/party, ui/bag call FieldActions.followingPkmn);
// - New Event Type/Event Sprite.rb: :on_enter_map erases the follower's
//   original event;
// - New Event Type/Misc.rb: Game_Character#passable? (IMPASSABLE_FOLLOWER)
//   and Game_Player#can_map_transfer_with_follower? /
//   can_ride_vehicle_with_follower?;
// - Script Additions/Compatibility.rb: the Options entry (ui/options) through
//   FieldActions.followingPkmn.
// Carmaniac's Speech Bubble's pbCallBubFollower finds followers through
// SpeechBubbleHooks.getFollower.

import type { Command } from "../../data/events";
import { Input } from "../../rgss/Input";
import { SceneMap } from "../../scenes/SceneMap";
import { FieldActions } from "../../ui/menus/menuScreens";
import { SpeechBubbleHooks } from "../../ui/speechBubble";
import { EventHandlers } from "../eventHandlers";
import { GameCharacter } from "../GameCharacter";
import { GamePlayer } from "../GamePlayer";
import { Interpreter } from "../Interpreter";
import { G } from "../globals";
import type { PokemonMapFactory } from "../MapFactory";
import type { Player } from "../trainer/Player";
import { FollowingPkmnConfig } from "./config";
import { Followers } from "./Followers";
import { FollowingPkmn } from "./FollowingPkmn";
import { GameFollowingPkmn } from "./GameFollower";
import { pbTurnTowardEvent } from "./moveRoute";

type Proto = Record<string, (...args: unknown[]) => unknown>;

//-------------------------------------------------------------------------------
// Scene_Map
//-------------------------------------------------------------------------------
const sceneProto = SceneMap.prototype as unknown as Proto;

// Check for Toggle input and update Following Pokemon's time_taken for to
// track the happiness increase and hold item
const sceneUpdate = sceneProto.update!;
sceneProto.update = async function (this: SceneMap, ...args: unknown[]) {
  await sceneUpdate.apply(this, args);
  // TOGGLE_FOLLOWER_KEY is nil in this game.
  if (FollowingPkmnConfig.TOGGLE_FOLLOWER_KEY && Input.trigger((Input as unknown as Record<string, number>)[FollowingPkmnConfig.TOGGLE_FOLLOWER_KEY]!)) {
    await FollowingPkmn.toggle();
    return;
  }
  if (!FollowingPkmn.active()) return;
  FollowingPkmn.increaseTime();
  const key = FollowingPkmnConfig.CYCLE_PARTY_KEY;
  if (key && Input.trigger((Input as unknown as Record<string, number>)[key]!)) {
    await FollowingPkmn.toggleOff();
    const party = (G.player as unknown as Player).party;
    // Ruby loops until a Pokémon can follow; it always ends once the first one
    // comes back round, so the bound only guards against a freeze.
    for (let n = 0; n <= party.length; n++) {
      const pkmn = party.shift()!;
      party.push(pkmn);
      FollowingPkmn.setFollowerToggled(true);
      if (FollowingPkmn.active()) {
        FollowingPkmn.setFollowerToggled(false);
        break;
      }
      FollowingPkmn.setFollowerToggled(false);
    }
    await FollowingPkmn.toggleOn();
  }
};

// Forcefully set the Following Pokemon direction when the player transfers to
// a new area
const transferPlayer = sceneProto.transferPlayer!;
sceneProto.transferPlayer = async function (this: SceneMap, ...args: unknown[]) {
  await transferPlayer.apply(this, args);
  let leader: GameCharacter = G.gamePlayer as unknown as GameCharacter;
  await FollowingPkmn.refresh(false);
  for (const [event, follower] of G.gameTemp.followers?.eachFollower() ?? []) {
    pbTurnTowardEvent(event, leader);
    (follower as { direction: number }).direction = event.direction;
    leader = event;
  }
};

// Update Following Pokemon's time_taken for to tracking the happiness increase
// and hold item
const miniupdate = sceneProto.miniupdate!;
sceneProto.miniupdate = async function (this: SceneMap, ...args: unknown[]) {
  await miniupdate.apply(this, args);
  if (!FollowingPkmn.active()) return;
  FollowingPkmn.increaseTime();
};

// Refresh Following Pokemon upon closing the pause menu
const callMenu = sceneProto.callMenu!;
sceneProto.callMenu = async function (this: SceneMap, ...args: unknown[]) {
  await callMenu.apply(this, args);
  await FollowingPkmn.refresh(false);
};

//-------------------------------------------------------------------------------
// Event handlers
//-------------------------------------------------------------------------------

// Refresh Following Pokemon sprites whenever the map is refreshed
EventHandlers.add("on_enter_map", "erase_following_pkmn", (_oldMapId) => {
  const event = FollowingPkmn.getData();
  if (!event) return;
  void FollowingPkmn.refresh(false);
  for (const map of (G.mapFactory as unknown as PokemonMapFactory).maps) {
    if (event.originalMapId === event.currentMapId) map.events.get(event.eventId)?.erase();
  }
});

// Reset the queued pokecenter refresh if nothing changed
EventHandlers.add("on_enter_map", "pokecenter_follower_reset", (_oldMapId) => {
  G.gameTemp.pokecenterFollowingPkmn = 0;
});

// Refresh Following Pokemon after taking a step, when a refresh is queued
EventHandlers.add("on_player_step_taken", "forced_follower_refresh", async () => {
  const callRefresh = FollowingPkmn.callRefresh();
  if (!callRefresh[0]) return;
  // Wait for steps
  if (callRefresh[2] && (callRefresh[2] as number) > 0) {
    callRefresh[2] = (callRefresh[2] as number) - 1;
    if (callRefresh[2] === 0) callRefresh.splice(2, 1);
    return;
  }
  // Refresh queued
  await FollowingPkmn.refresh(!!callRefresh[1]);
  FollowingPkmn.setCallRefresh(false);
});

//-------------------------------------------------------------------------------
// Interpreter: the Poké Center healing animation (pbSetPokemonCenter queues it,
// game/scripts/fieldMoves.ts)
//-------------------------------------------------------------------------------
const interpProto = Interpreter.prototype as unknown as Proto;

// Toggle Following Pokemon off if a Pokecenter refresh is queued and the
// Pokemon are healed
const command = interpProto.command!;
interpProto.command = async function (this: Interpreter, ...args: unknown[]) {
  const ret = await command.apply(this, args);
  if ((args[0] as Command).cmd !== "recoverAll") return ret; // command_314
  if (FollowingPkmnConfig.SHOW_POKECENTER_ANIMATION && G.gameTemp.pokecenterFollowingPkmn > 0 && FollowingPkmn.active()) {
    await FollowingPkmn.toggleOff();
    G.gameTemp.pokecenterFollowingPkmn = 2;
  }
  return ret;
};

// Refresh Following Pokemon after using the Pokecneter healing event is
// completely done
const interpUpdate = interpProto.update!;
interpProto.update = async function (this: Interpreter, ...args: unknown[]) {
  await interpUpdate.apply(this, args);
  if (FollowingPkmnConfig.SHOW_POKECENTER_ANIMATION && G.gameTemp.pokecenterFollowingPkmn > 0 && !this.running()) {
    await FollowingPkmn.toggleOn();
    G.gameTemp.pokecenterFollowingPkmn = 0;
  }
};

// NOTE: Refresh.rb also "aliases" BattleCreationHelperMethods.after_battle,
//       but it defines an instance method on a module whose after_battle is
//       only ever called as a module function, so its refresh never runs in
//       Ruby; nothing is hooked into the battle port for it.

//-------------------------------------------------------------------------------
// Game_Character / Game_Player
//-------------------------------------------------------------------------------

// Prevent other events from passing through Following Pokemon. Toggleable
const charProto = GameCharacter.prototype as unknown as Proto;
const passable = charProto.passable!;
charProto.passable = function (this: GameCharacter, x: unknown, y: unknown, d: unknown, strict: unknown) {
  const ret = passable.call(this, x, y, d, strict) as boolean;
  if (!FollowingPkmn.active() || !FollowingPkmnConfig.IMPASSABLE_FOLLOWER) return ret;
  if (ret && this !== (G.gamePlayer as unknown) && !(this instanceof GameFollowingPkmn)) {
    const newX = (x as number) + (d === 6 ? 1 : d === 4 ? -1 : 0);
    const newY = (y as number) + (d === 2 ? 1 : d === 8 ? -1 : 0);
    for (const [e] of G.gameTemp.followers?.eachFollower() ?? []) {
      if (e.atCoordinate(newX, newY) && !e.through) return false;
    }
  }
  return ret;
};

// The player can travel anywhere with their Following Pokemon
const playerProto = GamePlayer.prototype as unknown as Proto;
const canMapTransferWithFollower = playerProto.canMapTransferWithFollower!;
playerProto.canMapTransferWithFollower = function (this: GamePlayer, ...args: unknown[]) {
  if (FollowingPkmn.get() && G.pokemonGlobal.followers.length === 1) return true;
  return canMapTransferWithFollower.apply(this, args);
};

// The player can ride (almost) any vehicle with their Following Pokemon
const canRideVehicleWithFollower = playerProto.canRideVehicleWithFollower!;
playerProto.canRideVehicleWithFollower = function (this: GamePlayer, ...args: unknown[]) {
  if (FollowingPkmn.get() && G.pokemonGlobal.followers.length === 1) return true;
  return canRideVehicleWithFollower.apply(this, args);
};

//-------------------------------------------------------------------------------
// UI hooks
//-------------------------------------------------------------------------------
FieldActions.followingPkmn = {
  canCheck: () => FollowingPkmn.canCheck(),
  getEvent: () => FollowingPkmn.getEvent(),
  refresh: (anim) => void FollowingPkmn.refresh(anim),
};

SpeechBubbleHooks.getFollower = (name) => Followers.get(name);
