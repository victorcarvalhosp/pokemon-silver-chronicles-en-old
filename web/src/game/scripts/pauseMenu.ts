// Hooks the pause menu (DP Pause Menu) and the Ready Menu into Scene_Map and
// the event script API.

import { SceneMapHooks } from "../../scenes/SceneMap";
import { callMenu, pbPauseMenu } from "../../ui/menus/pauseMenu";
import { pbUseKeyItem } from "../../ui/menus/readyMenu";
import { defineScript } from "../scriptApi";

// Scene_Map#call_menu (DP Pause Menu's override) and Scene_Map#update's pbUseKeyItem.
SceneMapHooks.pauseMenu = callMenu;
SceneMapHooks.useKeyItem = pbUseKeyItem;

defineScript("pbPauseMenu", () => pbPauseMenu());
defineScript("pbUseKeyItem", () => pbUseKeyItem());
