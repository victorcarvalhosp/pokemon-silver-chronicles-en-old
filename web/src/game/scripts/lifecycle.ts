// The Pokémon lifecycle functions event scripts call, registered under their
// Ruby names (see scriptApi.ts): berry plants (game/berries), the Day Care
// (game/daycare), trades (ui/trading), the Hall of Fame and credits
// (ui/hallOfFame), hatching (ui/hatching). Importing the modules also
// registers their step handlers, save values and PC menu entry.

import type { Id } from "../../data/gameData/gameData";
import { SceneMap } from "../../scenes/SceneMap";
import { CreditsHooks, Scene_Credits } from "../../ui/hallOfFame/Credits";
import { pbHallOfFameEntry, pbHallOfFamePC } from "../../ui/hallOfFame/HallOfFame";
import { pbHatch, pbHatchAnimation } from "../../ui/hatching/EggHatching";
import { pbStartTrade } from "../../ui/trading/Trading";
import { pbBerryPlant, pbPickBerry } from "../berries/BerryPlants";
import { DayCare } from "../daycare/DayCare";
import { pbDayCareShowPokemonOW, pbDaycareInteract } from "../daycare/DayCareOverworld";
import { G } from "../globals";
import { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { defineScript } from "../scriptApi";

const num = (v: unknown, d: number) => (v == null ? d : Number(v));

// --- Berry plants (012_Overworld/006_Overworld_BerryPlants.rb) -------------------
defineScript("pbBerryPlant", () => pbBerryPlant());
defineScript("pbPickBerry", (_c, berry, qty) => pbPickBerry(String(berry), num(qty, 1)));

// --- Day Care (012_Overworld/007_Overworld_DayCare.rb) ----------------------------
defineScript("DayCare.count", () => DayCare.count());
defineScript("DayCare.egg_generated?", () => DayCare.eggGeneratedQ());
defineScript("DayCare.reset_egg_counters", () => DayCare.resetEggCounters());
defineScript("DayCare.get_details", (_c, index, nameVar, costVar) => DayCare.getDetails(Number(index), Number(nameVar), Number(costVar)));
defineScript("DayCare.get_level_gain", (_c, index, nameVar, levelVar) => DayCare.getLevelGain(Number(index), Number(nameVar), Number(levelVar)));
defineScript("DayCare.get_compatibility", (_c, compatVar) => DayCare.getCompatibility(Number(compatVar)));
defineScript("DayCare.deposit", (_c, partyIndex) => DayCare.deposit(Number(partyIndex)));
defineScript("DayCare.withdraw", (_c, index) => DayCare.withdraw(Number(index)));
defineScript("DayCare.choose", (_c, message, choiceVar) => DayCare.choose(String(message), Number(choiceVar)));
defineScript("DayCare.collect_egg", () => DayCare.collectEgg());
// Deprecated (v21) names
defineScript("pbDayCareDeposited", () => DayCare.count());
defineScript("pbDayCareGetDeposited", (_c, index, nameVar, costVar) => DayCare.getDetails(Number(index), Number(nameVar), Number(costVar)));
defineScript("pbDayCareGetLevelGain", (_c, index, nameVar, levelVar) => DayCare.getLevelGain(Number(index), Number(nameVar), Number(levelVar)));
defineScript("pbDayCareDeposit", (_c, partyIndex) => DayCare.deposit(Number(partyIndex)));
defineScript("pbDayCareWithdraw", (_c, index) => DayCare.withdraw(Number(index)));
defineScript("pbDayCareChoose", (_c, text, choiceVar) => DayCare.choose(String(text), Number(choiceVar)));
defineScript("pbDayCareGetCompatibility", (_c, compatVar) => DayCare.getCompatibility(Number(compatVar)));
defineScript("pbEggGenerated?", () => DayCare.eggGeneratedQ());
defineScript("pbDayCareGenerateEgg", () => DayCare.collectEgg());
// DayCare Overworld Pokemon
defineScript("pbDayCareShowPokemonOW", () => pbDayCareShowPokemonOW());
defineScript("pbDaycareInteract", (_c, i) => pbDaycareInteract(Number(i)));

// --- Eggs (016_UI/001_Non-interactive UI/003_UI_EggHatching.rb) -------------------
defineScript("pbHatch", (_c, pkmn) => pbHatch(pkmn as Pokemon));
defineScript("pbHatchAnimation", (_c, pkmn) => pbHatchAnimation(pkmn as Pokemon));

// --- Trades (016_UI/001_Non-interactive UI/005_UI_Trading.rb) ---------------------
defineScript("pbStartTrade", (_c, pokemonIndex, newpoke, nickname, trainerName, trainerGender) =>
  pbStartTrade(Number(pokemonIndex), newpoke instanceof Pokemon ? newpoke : (newpoke as Id),
    nickname == null ? null : String(nickname), String(trainerName), num(trainerGender, 0)));

// --- Hall of Fame and credits (006_UI_HallOfFame.rb, 007_UI_Credits.rb) -------------
defineScript("pbHallOfFameEntry", () => pbHallOfFameEntry());
defineScript("pbHallOfFamePC", () => pbHallOfFamePC());
CreditsHooks.newSceneMap = () => new SceneMap();
defineScript("Scene_Credits.new", () => new Scene_Credits());
defineScript("Scene_Map.new", () => new SceneMap());
/** $scene = ...: Scene_Map#main ends at the end of this frame and main.ts runs the new scene. */
defineScript("$scene=", (_c, value) => { G.scene = value as never; });
