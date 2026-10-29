// Hooks up the Trainer Card, Pokégear (Town Map, Phone, Radio, Tasks,
// DexNav) and Pokédex screens: registers them with the pause menu
// (MenuScreens), the data model (PokemonUIHooks.dexEntry, Pokemon.playCry)
// and the script functions events call.

import type { Id } from "../../data/gameData/gameData";
import { pbFadeOutIn } from "../../ui/fades";
import { MenuScreens } from "../../ui/menus/menuScreens";
import { pbCallTrainer, pbCommonEvent, pbPhoneBattleCount, pbPhoneIncrement, pbPhoneReadyToBattle, pbPhoneReset } from "../../ui/pokegear/phone";
import { PokemonPokegear_Scene, PokemonPokegearScreen } from "../../ui/pokegear/pokegear";
import { pbShowMap, PokemonRegionMap_Scene, PokemonRegionMapScreen } from "../../ui/pokegear/regionMap";
import { pbViewEncounters } from "../../ui/pokegear/encounterList";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../../ui/pokedex/pokedexEntry";
import { PokemonPokedex_Scene, PokemonPokedexScreen } from "../../ui/pokedex/pokedexMain";
import { PokemonPokedexMenu_Scene, PokemonPokedexMenuScreen } from "../../ui/pokedex/pokedexMenu";
import { pbViewQuests } from "../../ui/quests/questList";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";
import {
  pbDecreasePartnerHearts, pbDecreasePartnerMood, pbGetPartnerHeartCount, pbGetPartnerLevel, pbIncreasePartnerHearts,
  pbIncreasePartnerMood, pbSetPartnerHeartCount, pbSetPartnerLevel, pbSetPartnerMood,
} from "../../ui/trainerCard/partnerTrainerCard";
import { PokemonTrainerCard_Scene, PokemonTrainerCardScreen } from "../../ui/trainerCard/trainerCard";
import { Pokemon } from "../pokemon/Pokemon";
import { PokemonUIHooks } from "../pokemon/utilities";
import { defineScript } from "../scriptApi";

//===============================================================================
// Pause menu screens (the menu does the pbFadeOutIn)
//===============================================================================
MenuScreens.pokedex = () => new PokemonPokedexScreen(new PokemonPokedex_Scene()).pbStartScreen();
MenuScreens.pokedexMenu = () => new PokemonPokedexMenuScreen(new PokemonPokedexMenu_Scene()).pbStartScreen();
MenuScreens.pokegear = () => new PokemonPokegearScreen(new PokemonPokegear_Scene()).pbStartScreen();
MenuScreens.townMap = () => new PokemonRegionMapScreen(new PokemonRegionMap_Scene(-1, false)).pbStartScreen();
MenuScreens.flyMap = () => new PokemonRegionMapScreen(new PokemonRegionMap_Scene(-1, false)).pbStartFlyScreen();
MenuScreens.trainerCard = () => new PokemonTrainerCardScreen(new PokemonTrainerCard_Scene()).pbStartScreen();

//===============================================================================
// Data model hooks
//===============================================================================
/** pbFadeOutIn { PokemonPokedexInfoScreen.new(PokemonPokedexInfo_Scene.new).pbDexEntry(species) } */
PokemonUIHooks.dexEntry = async (species: Id) => {
  await pbFadeOutIn(() => new PokemonPokedexInfoScreen(new PokemonPokedexInfo_Scene()).pbDexEntry(species));
};

/** Pokemon.play_cry(species, form) / Pokemon#play_cry (ZUD's), unless another port set it first. */
Pokemon.playCryHook ??= (pkmn, form) => {
  if (pkmn instanceof Pokemon) SpeciesFiles.playPokemonCry(pkmn);
  else SpeciesFiles.playCryFromSpecies(pkmn, form ?? 0);
};

//===============================================================================
// Script functions events call
//===============================================================================
defineScript("pbShowMap", (_c, region, wallmap) => pbShowMap((region as number | undefined) ?? -1, wallmap !== false));
defineScript("pbViewQuests", () => pbViewQuests());
defineScript("pbViewEncounters", () => pbViewEncounters());
defineScript("pbCallTrainer", (_c, type, name) => pbCallTrainer(type as string | number, String(name)));
defineScript("pbCommonEvent", (_c, id) => pbCommonEvent(Number(id)));
defineScript("pbPhoneIncrement", (_c, type, name, max) => pbPhoneIncrement(String(type), String(name), Number(max)));
defineScript("pbPhoneReset", (_c, type, name) => pbPhoneReset(String(type), String(name)));
defineScript("pbPhoneBattleCount", (_c, type, name) => pbPhoneBattleCount(String(type), String(name)));
defineScript("pbPhoneReadyToBattle?", (_c, type, name) => pbPhoneReadyToBattle(String(type), String(name)));
// Partner Trainer Card's partner functions
defineScript("pbIncreasePartnerHearts", (_c, amount) => pbIncreasePartnerHearts((amount as number | undefined) ?? 1));
defineScript("pbDecreasePartnerHearts", (_c, amount) => pbDecreasePartnerHearts((amount as number | undefined) ?? 1));
defineScript("pbGetPartnerLevel", () => pbGetPartnerLevel());
defineScript("pbGetPartnerHeartCount", () => pbGetPartnerHeartCount());
defineScript("pbSetPartnerLevel", (_c, level) => pbSetPartnerLevel(Number(level)));
defineScript("pbSetPartnerHeartCount", (_c, count) => pbSetPartnerHeartCount(Number(count)));
defineScript("pbSetPartnerMood", (_c, mood) => pbSetPartnerMood(Number(mood)));
defineScript("pbIncreasePartnerMood", (_c, amount) => pbIncreasePartnerMood((amount as number | undefined) ?? 1));
defineScript("pbDecreasePartnerMood", (_c, amount) => pbDecreasePartnerMood((amount as number | undefined) ?? 1));
