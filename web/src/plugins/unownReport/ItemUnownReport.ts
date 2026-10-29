// Port of Plugins/Unown Report/Item_Unown_Report.rb: the UNOWNREPORT item's
// UseFromBag and UseInField handlers (`$scene = Scene_Unownreport.new;
// next 2`). The handlers themselves are registered in
// game/items/pluginItems.ts (they must exist before plugins load, as in
// Ruby's load order); this sets the hook they call. Setting G.scene ends
// Scene_Map's loop once the Bag/menu closes (2 = close the Bag), then
// main.ts runs Scene_Unownreport#main.

import { G } from "../../game/globals";
import { PluginItemHooks } from "../../game/items/pluginItems";
import { Scene_Unownreport } from "./UnownReportMechanic";

PluginItemHooks.unownReport = async () => {
  G.scene = new Scene_Unownreport() as never;
};
