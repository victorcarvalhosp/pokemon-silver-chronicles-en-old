// ZUD Mechanics on the battle scene: import this module (once) wherever a
// BattleScene is created, as with battle/deluxe. It puts the Battle::Scene
// methods ZUD adds (the Dynamax, Z-Move and Ultra Burst cinematics,
// pbDynamaxSendOut, pbRevertDynamax; see Scene.ts) on BattleScene's prototype,
// as Ruby reopens Battle::Scene, and has the scene preload the Dynamax colour
// patterns its sprites and the party icons use (dynamaxSprite.ts).

import { preloadBitmaps } from "../../../ui/rpgCache";
import { BattleScene } from "../../scene/BattleScene";
import { DYNAMAX_PATTERN_GRAPHICS } from "./dynamaxSprite";
import { zudSceneMethods } from "./Scene";
import "../Debug"; // the ZUD Debug menu options (MenuHandlers)

Object.assign(BattleScene.prototype, zudSceneMethods);

type ZudSceneMethods = typeof zudSceneMethods;
declare module "../../scene/BattleScene" {
  interface BattleScene extends ZudSceneMethods {}
}

BattleScene.extraPreloads.push(() => preloadBitmaps(DYNAMAX_PATTERN_GRAPHICS));

export { BattlerDynamax, BattlerDynamaxWild } from "./Scene_Animation_Dynamax";
export { BattlerZMove } from "./Scene_Animation_ZMove";
export { BattlerUltraBurst } from "./Scene_Animation_UltraBurst";
