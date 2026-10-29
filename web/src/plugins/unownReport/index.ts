// Unown Report (Plugins/Unown Report: Item_Unown_Report.rb,
// Unown_Report_Mechanic.rb). Imported once at boot (game/newGame.ts): sets
// the UNOWNREPORT item hook and registers Scene_Unownreport for event scripts.

import { defineScript } from "../../game/scriptApi";
import "./ItemUnownReport";
import { Scene_Unownreport } from "./UnownReportMechanic";

defineScript("Scene_Unownreport.new", (_c, menuIndex) => new Scene_Unownreport(menuIndex == null ? 0 : Number(menuIndex)));
