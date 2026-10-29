// Hooks up the party, Summary and Bag screens: registers them with the pause
// menu (MenuScreens), gives the menus their names/icons (MenuData), wires the
// data model's UI hooks (pbForgetMove) and registers the script functions
// events call, by their Ruby names.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { FieldActions, MenuData, MenuScreens, type MenuIconSprite } from "../../ui/menus/menuScreens";
import { PokemonBag_Scene, PokemonBagScreen } from "../../ui/bag/bag";
import {
  pbChooseApricorn, pbChooseFossil, pbChooseItem, pbChooseItemFromList, pbForgetMove, pbMoveTutorChoose, pbUseKeyItemInField,
} from "../../ui/bag/itemUtilities";
import {
  pbChooseAblePokemon, pbChooseNonEggPokemon, pbChoosePokemon, pbChoosePokemonForTrade, pbChooseTradablePokemon,
  pbPokemonScreen, PokemonParty_Scene, PokemonPartyScreen,
} from "../../ui/party/party";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../../ui/pokedex/pokedexEntry";
import { isBitmapPreloaded } from "../../ui/rpgCache";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { ItemIconSprite, itemIconFilename, preloadItemIcons } from "../../ui/sprites/itemIcon";
import { iconFilenameFromPokemon, PokemonIconSprite, preloadPokemonIcons } from "../../ui/sprites/pokemonIcon";
import { pbChooseMove, SummaryHooks } from "../../ui/summary/summary";
import { G } from "../globals";
import { ItemHandlers } from "../items/ItemHandlers";
import { setForgetMoveHook } from "../items/itemUtilities";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { defineRubyScript, defineScript } from "../scriptApi";

const player = () => G.player as unknown as Player;
const num = (v: unknown, d: number) => (v == null ? d : Number(v));

//===============================================================================
// Pause menu screens (the menu does the pbFadeOutIn)
//===============================================================================
MenuScreens.party = () => new PokemonPartyScreen(new PokemonParty_Scene(), player().party).pbPokemonScreen();
MenuScreens.bag = () => new PokemonBagScreen(new PokemonBag_Scene(), G.bag).pbStartScreen();

/** pbUseKeyItemInField / ItemHandlers.triggerConfirmUseInField, unless the overworld port set them. */
FieldActions.useKeyItemInField ??= (item) => pbUseKeyItemInField(item);
FieldActions.confirmUseInField ??= (item) => ItemHandlers.triggerConfirmUseInField(item);

//===============================================================================
// Names and icons the menus draw
//===============================================================================
MenuData.moveExists = (move) => MoveData.exists(move);
MenuData.moveName = (move) => MoveData.get(move).name;
MenuData.itemName = (item) => Item.get(item).name;
MenuData.itemIsImportant = (item) => Item.get(item).isImportant();

/** ItemIconSprite.new(x, y, item, viewport); a graphic not preloaded yet shows once it has loaded. */
MenuData.itemIconSprite = (x, y, item, viewport) => {
  const sprite = new ItemIconSprite(x, y, item, viewport);
  if (!isBitmapPreloaded(itemIconFilename(item))) {
    void preloadItemIcons([item]).then(() => {
      if (!sprite.isDisposed()) sprite.blankzero = sprite.blankzero; // reloads the icon
    });
  }
  return sprite as MenuIconSprite;
};

/** PokemonIconSprite.new(pokemon, viewport) with setOffset(PictureOrigin::CENTER). */
MenuData.pokemonIconSprite = (pkmn, viewport) => {
  const p = pkmn as Pokemon;
  const sprite = new PokemonIconSprite(null, viewport);
  const show = () => {
    if (sprite.isDisposed()) return;
    sprite.pokemon = p;
    sprite.setOffset(PictureOrigin.CENTER);
  };
  const file = iconFilenameFromPokemon(p);
  if (file && isBitmapPreloaded(file)) show();
  else void preloadPokemonIcons([p]).then(show);
  return sprite as MenuIconSprite;
};

//===============================================================================
// Data model hooks
//===============================================================================
setForgetMoveHook((pkmn, moveToLearn) => pbForgetMove(pkmn, moveToLearn));

/** View Pokédex from the Summary: PokemonPokedexInfoScreen#pbStartSceneSingle. */
SummaryHooks.pokedexInfoSingle ??= (species: Id) =>
  new PokemonPokedexInfoScreen(new PokemonPokedexInfo_Scene()).pbStartSceneSingle(species);

//===============================================================================
// Script functions events call
//===============================================================================
defineScript("pbPokemonScreen", () => pbPokemonScreen());
defineScript("pbChoosePokemon", (_c, variableNumber, nameVarNumber, ableProc, allowIneligible) =>
  pbChoosePokemon(Number(variableNumber), Number(nameVarNumber), (ableProc as ((p: Pokemon) => boolean) | null) ?? null, !!allowIneligible));
defineScript("pbChooseNonEggPokemon", (_c, variableNumber, nameVarNumber) => pbChooseNonEggPokemon(Number(variableNumber), Number(nameVarNumber)));
defineScript("pbChooseAblePokemon", (_c, variableNumber, nameVarNumber) => pbChooseAblePokemon(Number(variableNumber), Number(nameVarNumber)));
defineScript("pbChooseTradablePokemon", (_c, variableNumber, nameVarNumber, ableProc, allowIneligible) =>
  pbChooseTradablePokemon(Number(variableNumber), Number(nameVarNumber), (ableProc as ((p: Pokemon) => boolean) | null) ?? null, !!allowIneligible));
defineScript("pbChoosePokemonForTrade", (_c, variableNumber, nameVarNumber, wanted) =>
  pbChoosePokemonForTrade(Number(variableNumber), Number(nameVarNumber), String(wanted)));
defineScript("pbChooseMove", (_c, pokemon, variableNumber, nameVarNumber) =>
  pbChooseMove((pokemon as Pokemon | null) ?? null, Number(variableNumber), Number(nameVarNumber)));
defineScript("pbChooseItem", (_c, variable) => pbChooseItem(num(variable, 0)));
defineScript("pbChooseApricorn", (_c, variable) => pbChooseApricorn(num(variable, 0)));
defineScript("pbChooseFossil", (_c, variable) => pbChooseFossil(num(variable, 0)));
defineScript("pbChooseItemFromList", (_c, message, variable, ...items) =>
  pbChooseItemFromList(String(message), Number(variable), ...items.map(String)));
defineScript("pbMoveTutorChoose", (_c, move, movelist, bymachine, oneusemachine) =>
  pbMoveTutorChoose(String(move), (movelist as Id[] | null) ?? null, !!bymachine, !!oneusemachine));
defineScript("pbForgetMove", (_c, pkmn, moveToLearn) => pbForgetMove(pkmn as Pokemon, (moveToLearn as Id | null) ?? null));

// The event scripts with a Ruby proc the converter couldn't translate.
defineRubyScript("pbChoosePokemon(1, 3, proc{ |pkmn|\n  pkmn.can_relearn_move?\n  }, true\n)", () =>
  pbChoosePokemon(1, 3, (pkmn) => pkmn.canRelearnMove(), true));
for (const species of ["RAICHU", "VENONAT"]) {
  defineRubyScript(`pbChoosePokemon(1,2,\nproc {|poke|\n !poke.egg? and \n  poke.species==PBSpecies::${species}\n})`, () =>
    pbChoosePokemon(1, 2, (poke) => !poke.egg() && poke.species === species));
}
