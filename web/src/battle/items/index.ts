// The item handlers (Battle::ItemEffects::X and ItemHandlers::X .add/.copy
// calls), in Ruby's load order: core Essentials' 011_Battle (held items) and
// 013_Items (field and battle use), then the plugins that add or replace
// handlers, in plugin load order (Data/PluginScripts.rxdata). Later
// registrations replace earlier ones, and .copy copies whatever handler is
// registered at that point, as in Ruby.
// The registries and trigger functions are in ../other/ItemEffects.ts and
// ../../game/items/ItemHandlers.ts.

// Data/Scripts/011_Battle/006_Other battle code/009_Battle_ItemEffects.rb
import "./Battle_ItemEffects";
// Data/Scripts/013_Items/002_Item_Effects.rb
import "../../game/items/Item_Effects";
// Data/Scripts/013_Items/003_Item_BattleEffects.rb
import "./Item_BattleEffects";
// Plugins
// Generation 9 Pack Scripts/[004] Items
import "./Gen9_ItemHandlers";
import "./Gen9_NewItemHandlers";
// ZUD Mechanics/[001] Data/Data_Item.rb, [008] Overrides/Override_Items.rb
import "./ZUD_Data_Item";
import "./ZUD_Override_Items";
// Unown Report, Pokemon Silver Chronicles Helpers/Items.rb, Triple Triad Booster Packs
import "../../game/items/pluginItems";
