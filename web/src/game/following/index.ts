// Followers (Essentials' Game_Follower / Game_FollowerFactory / Followers),
// Following Pokemon EX and Overworld Shadows EX. Imported once at boot
// (game/newGame.ts): registers $game_temp.followers' class, the plugin's
// aliases, event handlers and script commands.

import { setFollowerFactoryClass } from "../globals";
import { GameFollowerFactory } from "./GameFollowerFactory";
import "./OverworldShadows";
import "./SpriteOWShadow";
import "./dialogue";
import "./aliases";
import "./scripts";

setFollowerFactoryClass(() => new GameFollowerFactory());

export { Followers } from "./Followers";
export { FollowingPkmn } from "./FollowingPkmn";
