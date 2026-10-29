// The follower commands event scripts call, registered under their Ruby names
// (Followers.*, FollowingPkmn.*, the deprecated pbAddDependency* family,
// pbSetOverworldShadow, pbTurnTowardEvent, pbFacingTile). PBMoveRoute::*,
// pbMoveRoute, pbWait and Graphics.frame_rate are in game/scripts/moveRoute.ts.

import { defineScript } from "../scriptApi";
import { G } from "../globals";
import type { GameCharacter } from "../GameCharacter";
import type { GameEvent } from "../GameEvent";
import { pbMapInterpreter } from "../Interpreter";
import { FollowingPkmnConfig } from "./config";
import {
  Followers, pbAddDependency, pbAddDependency2, pbGetDependency, pbRemoveDependencies, pbRemoveDependency,
  pbRemoveDependency2,
} from "./Followers";
import { FollowingPkmn } from "./FollowingPkmn";
import { pbTurnTowardEvent } from "./moveRoute";
import { pbSetOverworldShadow } from "./SpriteOWShadow";

const str = (v: unknown) => (v == null ? null : String(v));
const optBool = (v: unknown) => (v == null ? null : !!v);

// --- Followers ----------------------------------------------------------------
defineScript("Followers.add", (_c, eventId, name, commonEventId) => Followers.add(Number(eventId), str(name), commonEventId == null ? null : Number(commonEventId)));
defineScript("Followers.add_event", (_c, event) => Followers.addEvent(event as GameEvent));
defineScript("Followers.remove", (_c, name) => Followers.remove(String(name)));
defineScript("Followers.remove_event", (_c, event) => Followers.removeEvent(event as GameEvent));
defineScript("Followers.clear", () => Followers.clear());
defineScript("Followers.get", (_c, name) => Followers.get(str(name)));
defineScript("Followers.follow_into_door", () => Followers.followIntoDoor());
defineScript("Followers.hide_followers", () => Followers.hideFollowers());
defineScript("Followers.put_followers_on_player", () => Followers.putFollowersOnPlayer());
defineScript("pbAddDependency2", (_c, id, name, ce) => pbAddDependency2(Number(id), String(name), Number(ce)));
defineScript("pbAddDependency", (_c, event) => pbAddDependency(event as GameEvent));
defineScript("pbRemoveDependency2", (_c, name) => pbRemoveDependency2(String(name)));
defineScript("pbRemoveDependency", (_c, event) => pbRemoveDependency(event as GameEvent));
defineScript("pbRemoveDependencies", () => pbRemoveDependencies());
defineScript("pbGetDependency", (_c, name) => pbGetDependency(String(name)));

// Interpreter#follower_move_route / #follower_animation on the map interpreter
// (inside an event, the bare names resolve to the running interpreter's methods).
defineScript("pbMapInterpreter.follower_move_route", (_c, id) => pbMapInterpreter().followerMoveRoute(str(id)));
defineScript("pbMapInterpreter.follower_animation", (_c, id) => pbMapInterpreter().followerAnimation(str(id)));

// --- FollowingPkmn ---------------------------------------------------------------
defineScript("FollowingPkmn.get", () => FollowingPkmn.get());
defineScript("FollowingPkmn.get_event", () => FollowingPkmn.getEvent());
defineScript("FollowingPkmn.get_data", () => FollowingPkmn.getData());
defineScript("FollowingPkmn.get_pokemon", () => FollowingPkmn.getPokemon());
defineScript("FollowingPkmn.airborne_follower?", () => FollowingPkmn.airborneFollower());
defineScript("FollowingPkmn.waterborne_follower?", () => FollowingPkmn.waterborneFollower());
defineScript("FollowingPkmn.refresh", (_c, anim) => FollowingPkmn.refresh(!!anim));
defineScript("FollowingPkmn.remove_sprite", () => FollowingPkmn.removeSprite());
defineScript("FollowingPkmn.active?", () => FollowingPkmn.active());
defineScript("FollowingPkmn.can_check?", () => FollowingPkmn.canCheck());
defineScript("FollowingPkmn.refresh_internal", () => FollowingPkmn.refreshInternal());
defineScript("FollowingPkmn.increase_time", () => FollowingPkmn.increaseTime());
defineScript("FollowingPkmn.item", (_c, item, qty, message) => FollowingPkmn.item(String(item), qty == null ? 1 : Number(qty), str(message)));
defineScript("FollowingPkmn.can_talk?", (_c, interact) => FollowingPkmn.canTalk(!!interact));
defineScript("FollowingPkmn.start_following", (_c, eventId, anim) =>
  FollowingPkmn.startFollowing(eventId == null ? null : Number(eventId), anim == null ? true : !!anim));
defineScript("FollowingPkmn.stop_following", () => FollowingPkmn.stopFollowing());
defineScript("FollowingPkmn.toggle", (_c, forced, anim) => FollowingPkmn.toggle(optBool(forced), optBool(anim)));
defineScript("FollowingPkmn.toggle_off", (_c, anim) => FollowingPkmn.toggleOff(optBool(anim)));
defineScript("FollowingPkmn.toggle_on", (_c, anim) => FollowingPkmn.toggleOn(optBool(anim)));
defineScript("FollowingPkmn.talk", () => FollowingPkmn.talk());
defineScript("FollowingPkmn.move_route", (_c, commands, wait) => FollowingPkmn.moveRoute((commands as unknown[] | null) ?? null, !!wait));
defineScript("FollowingPkmn.animation", (_c, id) => FollowingPkmn.animation(id == null ? null : Number(id)));
defineScript("$PokemonGlobal.follower_toggled=", (_c, value) => FollowingPkmn.setFollowerToggled(!!value));
for (const [name, value] of Object.entries(FollowingPkmnConfig)) {
  defineScript(`FollowingPkmn::${name}`, () => value);
}

// --- Overworld Shadows EX ---------------------------------------------------------
defineScript("pbSetOverworldShadow", (_c, name, eventId, mapId) =>
  pbSetOverworldShadow(String(name ?? ""), eventId == null ? null : Number(eventId), mapId == null ? null : Number(mapId)));

// --- 012_Overworld helpers -------------------------------------------------------
defineScript("pbTurnTowardEvent", (_c, event, other) => pbTurnTowardEvent(event as GameCharacter, other as GameCharacter));
defineScript("pbFacingTile", (_c, direction, event) =>
  (G.mapFactory as unknown as { getFacingTile(d?: number, e?: GameCharacter): unknown }).getFacingTile(direction == null ? undefined : Number(direction), (event as GameCharacter) ?? undefined));
