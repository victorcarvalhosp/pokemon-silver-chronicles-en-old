// Followers (Essentials' Game_Follower / Game_FollowerFactory / Followers),
// Following Pokemon EX and Overworld Shadows EX. Imported once at boot
// (game/newGame.ts): registers $game_temp.followers' class, the plugin's
// aliases, event handlers and script commands.

import { AnimationHooks } from "../../battle/scene/animations";
import { setFollowerFactoryClass } from "../globals";
import { FollowingPkmnConfig } from "./config";
import { FollowingPkmn } from "./FollowingPkmn";
import { GameFollowerFactory } from "./GameFollowerFactory";
import "./OverworldShadows";
import "./SpriteOWShadow";
import "./dialogue";
import "./aliases";
import "./scripts";

setFollowerFactoryClass(() => new GameFollowerFactory());

// Script Additions/Animations.rb: the follower slides into battle instead of
// being thrown out of its ball.
AnimationHooks.followingPkmnActive = () => FollowingPkmn.active();
AnimationHooks.followerSlidesIntoBattle = FollowingPkmnConfig.SLIDE_INTO_BATTLE;

export { Followers } from "./Followers";
export { FollowingPkmn } from "./FollowingPkmn";
