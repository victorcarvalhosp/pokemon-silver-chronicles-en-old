// Shadow Pokémon purification (016_UI/022_UI_PurifyChamber.rb and the Relic
// Stone from 014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb):
// registers the event-script entry points and the Debug menu's hooks.

import { DebugMenuCommandHooks } from "../../debug/DebugMenuCommands";
import { defineScript } from "../../game/scriptApi";
import "../../game/pokemon/shadowPokemonOther";
import "./PurifyChamber";
import { pbPurifyChamber } from "./PurifyChamberScreen";
import { pbRelicStone } from "./RelicStone";

defineScript("pbPurifyChamber", () => pbPurifyChamber());
defineScript("pbRelicStone", () => pbRelicStone());

DebugMenuCommandHooks.pbPurifyChamber = pbPurifyChamber;
DebugMenuCommandHooks.pbRelicStone = pbRelicStone;

export { pbPurifyChamber } from "./PurifyChamberScreen";
export { pbRelicStone, pbRelicStoneScreen } from "./RelicStone";
export { PurifyChamber, PurifyChamberHelper, PurifyChamberSet } from "./PurifyChamber";
