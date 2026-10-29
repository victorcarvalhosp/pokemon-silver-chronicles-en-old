// $scene.is_a?(Scene_Map) for the follower code. Only used at call time, so
// importing the scene here doesn't matter for the module cycle
// SceneMap -> spritesets -> FollowerSprites -> FollowingPkmn -> here.

import { SceneMap } from "../../scenes/SceneMap";
import { G } from "../globals";

export function sceneMap(): SceneMap | null {
  return G.scene instanceof SceneMap ? G.scene : null;
}
