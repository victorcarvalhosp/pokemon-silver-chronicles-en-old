// The ItemHandlers of this game's small plugins, in plugin load order:
// - Unown Report/Item_Unown_Report.rb: UNOWNREPORT opens Scene_Unownreport.
// - Pokemon Silver Chronicles Helpers/Items.rb: TCGBINDER opens the Triple
//   Triad binder (pbTriadBinder).
// - Triple Triad Booster Packs/TripleTriad_Booster_Packs.rb: the
//   BOOSTERPACK_* items give 5 Triple Triad cards (BoosterPack.give).
//
// The handlers are registered here (so the Bag shows "Use" and the items can
// be registered, as in Ruby) and call the hooks below; until a hook is set,
// using the item warns and does nothing (returns 0, item not used). The
// Triple Triad hooks are set by web/src/minigames/scripts.ts.
// TODO(items): the Unown Report scene isn't ported.

import type { Id } from "../../data/gameData/gameData";
import { ItemHandlers } from "./ItemHandlers";

export const PluginItemHooks: {
  /** $scene = Scene_Unownreport.new */
  unownReport: (() => Promise<void>) | null;
  /** pbTriadBinder() */
  triadBinder: (() => Promise<void>) | null;
  /** BoosterPack.give(item, numberOfCards, booster_index): the UseFromBag return value (1, consumed). */
  boosterPackGive: ((item: Id, numberOfCards: number, boosterIndex: number) => Promise<number>) | null;
} = { unownReport: null, triadBinder: null, boosterPackGive: null };

function notPorted(what: string): number {
  console.warn(`${what} isn't ported yet`);
  return 0;
}

//===============================================================================
// Unown Report
//===============================================================================
ItemHandlers.UseFromBag.add("UNOWNREPORT", async () => {
  if (!PluginItemHooks.unownReport) return notPorted("Scene_Unownreport");
  await PluginItemHooks.unownReport();
  return 2;
});

ItemHandlers.UseInField.add("UNOWNREPORT", async () => {
  if (!PluginItemHooks.unownReport) return notPorted("Scene_Unownreport") !== 0;
  await PluginItemHooks.unownReport();
  return true; // Ruby: next 2 (truthy)
});

//===============================================================================
// Pokemon Silver Chronicles Helpers: TCG Binder
//===============================================================================
ItemHandlers.UseInField.add("TCGBINDER", async () => {
  if (!PluginItemHooks.triadBinder) return notPorted("pbTriadBinder") !== 0;
  await PluginItemHooks.triadBinder();
  return true; // Ruby: next 2 (truthy)
});

//===============================================================================
// Triple Triad Booster Packs
//===============================================================================
const BOOSTER_PACKS: [Id, number][] = [
  ["BOOSTERPACK_GENESIS", 1], ["BOOSTERPACK_COLOSSEUM", 2], ["BOOSTERPACK_DISCOVERY", 3],
  ["BOOSTERPACK_DESTINY", 4], ["BOOSTERPACK_EVOLUTION", 5], ["BOOSTERPACK_MYSTERY", 6],
  ["BOOSTERPACK_REVELATION", 7], ["BOOSTERPACK_LABORATORY", 8],
];
for (const [pack, boosterIndex] of BOOSTER_PACKS) {
  ItemHandlers.UseFromBag.add(pack, async (item) => {
    if (!PluginItemHooks.boosterPackGive) return notPorted("BoosterPack.give (Triple Triad)");
    return PluginItemHooks.boosterPackGive(item, 5, boosterIndex);
  });
}
