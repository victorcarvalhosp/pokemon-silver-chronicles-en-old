// The Debug menus (020_Debug/003_Debug menus) and the plugin options that go
// in them, registered in Essentials' load order, and wired to the screens
// that open them. Imported once by main.ts. The menus only appear with
// $DEBUG (core/debug.ts): the pause menu's "Debug", F9 on the map
// (SceneMap) and in a battle's command menu, the load screen's "Debug", and
// the party/storage/Bag "Debug" commands.
//
// Load order (each file folds in the plugin overrides of its own options, in
// plugin order; see their headers):
//   002_Debug_MenuCommands  (+ v20.1 Hotfixes, Essentials Deluxe's :debug_menu options)
//   004_Debug_BattleCommands, 005_Debug_BattlePkmnCommands (+ Generation 9 Pack)
//   007_Debug_PokemonCommands (+ v20.1 Hotfixes, Generation 9 Pack, Essentials Deluxe)
//   ZUD Mechanics [000] General/Debug.rb (battle/zud/Debug.ts, then game/maxRaid/Debug.ts)
//   Enhanced UI [001] Pokemon UI.rb (the shiny leaf option)

import "./DebugMenuCommands";
import "./DebugBattleCommands";
import "./DebugBattlePkmnCommands";
import "./DebugPokemonCommands";
import "../battle/zud/Debug";
import "../game/maxRaid/Debug"; // ZUD Debug.rb's Max Raid / Dynamax Adventure options (same file, next in order)
import "./DebugPokemonCommands_EnhancedUI";
import "./editors"; // the editor screens (EditorScreens)

import { SceneMapHooks } from "../scenes/SceneMap";
import { pbFadeOutIn } from "../ui/fades";
import { PartyHooks } from "../ui/party/party";
import { MenuScreens } from "../ui/menus/menuScreens";
import { StorageHooks } from "../ui/storage/PokemonStorageScreen";
import { pbDebugMenu, pbPokemonDebug } from "./DebugMenus";

export { pbBattleDebug, pbDebugMenu, pbPokemonDebug } from "./DebugMenus";

// DP Pause Menu's "DEBUG" (pbFadeOutIn { pbDebugMenu }), the load screen's Debug
// (pbDebugMenu(false)) and Scene_Map#call_debug (F9).
MenuScreens.debugMenu = (showAll = true) => pbDebugMenu(showAll);
SceneMapHooks.debugMenu = async () => { await pbFadeOutIn(() => pbDebugMenu()); };
// PokemonPartyScreen / PokemonStorageScreen include PokemonDebugMixin.
PartyHooks.pokemonDebug = (screen, pkmn, pkmnid) => pbPokemonDebug(screen, pkmn, pkmnid);
StorageHooks.pokemonDebug = (screen, pkmn, selected, heldpoke) => pbPokemonDebug(screen, pkmn, selected, heldpoke);
