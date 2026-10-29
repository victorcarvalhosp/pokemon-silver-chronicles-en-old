// The display helpers plugins draw on the Summary with:
// - Enhanced UI ([001] Pokemon UI.rb): pbDisplayHappiness, pbDisplayShinyLeaf,
//   pbDisplayIVRatings, pbDisplayEggGroups (Settings::IV_DISPLAY_STYLE = 0,
//   stars), with Essentials Deluxe's egg_group_hash;
// - ZUD Mechanics ([002] UI/UI_Summary.rb): pbDisplayGmaxFactor.
// "BW Summary Screen" and "BW Party Screen" aren't installed.

import type { Id } from "../../data/gameData/gameData";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { Pokemon } from "../../game/pokemon/Pokemon";
import type { Bitmap } from "../../rgss/Bitmap";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbDrawImagePositions, pbDrawTextPositions, type ImagePosition } from "../drawText";
import { _INTL } from "../messageConfig";

const EUI = "Graphics/Plugins/Enhanced UI/";

/** Graphics these helpers draw (for preloading). */
export const SUMMARY_PLUGIN_BITMAPS = [
  `${EUI}Happiness Meter/meter`, `${EUI}Happiness Meter/hearts`, `${EUI}Shiny Leaf/crown`, `${EUI}Shiny Leaf/leaf`,
  `${EUI}IV Ratings/stars`, `${EUI}Egg Groups/groups`,
  "Graphics/Plugins/ZUD/UI/gfactor", "Graphics/Plugins/ZUD/UI/dynamax_meter", "Graphics/Plugins/ZUD/UI/dynamax_levels",
];

/** Happiness Meter */
export function pbDisplayHappiness(pokemon: Pokemon | null, overlay: Bitmap, xpos: number, ypos: number): void {
  if (!pokemon || pokemon.shadowPokemon() || pokemon.egg()) return;
  const path = `${EUI}Happiness Meter/`;
  pbDrawImagePositions(overlay, [[path + "meter", xpos, ypos]]);
  const heartsBitmap = new AnimatedBitmap(path + "hearts");
  let w = (heartsBitmap.width * pokemon.happiness) / 255;
  if (w < 1) w = 1;
  w = Math.round(w / 2.0) * 2;
  overlay.blt(xpos, ypos, heartsBitmap.bitmap, new Rect(0, 0, w, 30));
}

/**
 * Shiny Leaf. If "vertical" is set to true, Shiny Leaves will be displayed in
 * a vertically stacked layout. Otherwise, Shiny Leaves will be displayed
 * horizontally. This has no effect on how the Shiny Leaf Crown is displayed.
 */
export function pbDisplayShinyLeaf(pokemon: Pokemon | null, overlay: Bitmap, xpos: number, ypos: number, vertical = false): void {
  if (!pokemon) return;
  const imagepos: ImagePosition[] = [];
  const path = `${EUI}Shiny Leaf/`;
  if (pokemon.shinyCrown()) {
    imagepos.push([path + "crown", xpos - 18, ypos - 3]);
  } else if (pokemon.hasShinyLeaf()) {
    const offsetX = vertical ? 0 : 10;
    const offsetY = vertical ? 10 : 0;
    for (let i = 0; i < pokemon.shinyLeaf; i++) imagepos.push([path + "leaf", xpos - i * offsetX, ypos + i * offsetY]);
  }
  pbDrawImagePositions(overlay, imagepos);
}

/**
 * IV Ratings. If "horizontal" is set to true, IV stars will be displayed in a
 * horizontal layout, side by side. Otherwise, IV stars will be displayed
 * vertically and spaced out in a way to account for the stat display in the
 * Summary.
 */
export function pbDisplayIVRatings(pokemon: Pokemon | null, overlay: Bitmap, xpos: number, ypos: number, horizontal = false): void {
  if (!pokemon) return;
  const imagepos: ImagePosition[] = [];
  const path = `${EUI}IV Ratings/stars`; // Settings::IV_DISPLAY_STYLE = 0
  const maxIV = Pokemon.IV_STAT_LIMIT;
  const offsetX = horizontal ? 16 : 0;
  const offsetY = horizontal ? 0 : 32;
  let i = 0;
  for (const s of Stat.eachMain()) {
    const stat = pokemon.iv[s.id]!;
    let icon: number;
    if (stat === maxIV) icon = 5; // 31 IV
    else if (stat === maxIV - 1) icon = 4; // 30 IV
    else if (stat === 0) icon = 0; //  0 IV
    else if (stat > maxIV - Math.floor(maxIV / 4)) icon = 3; // 25-29 IV
    else if (stat > maxIV - Math.floor(maxIV / 2)) icon = 2; // 16-24 IV
    else icon = 1; //  1-15 IV
    imagepos.push([path, xpos + i * offsetX, ypos + i * offsetY, icon * 16, 0, 16, 16]);
    if (s.id === "HP" && !horizontal) ypos += 12; // ("BW Summary Screen" isn't installed)
    i += 1;
  }
  pbDrawImagePositions(overlay, imagepos);
}

/** egg_group_hash (Essentials Deluxe) */
const EGG_GROUPS: Record<string, number> = {
  Monster: 0, Water1: 1, Bug: 2, Flying: 3, Field: 4, Fairy: 5, Grass: 6, Humanlike: 7, Water3: 8, Mineral: 9,
  Amorphous: 10, Water2: 11, Ditto: 12, Dragon: 13, Undiscovered: 14, Skycrest: 15, Bestial: 16, Titan: 17,
  Overlord: 18, Nebulous: 19, Enchanted: 20, Ancestor: 21, Ultra: 22, Unused1: 23, Unused2: 24, Unknown: 25,
};

/**
 * Egg Groups. "pokemon" can be a Pokemon or a species ID. A string
 * showDisplay is written in front of the icons (Summary); true draws a
 * background behind them (Pokédex). "vertical" stacks two groups.
 */
export function pbDisplayEggGroups(pokemon: Pokemon | Id | null, overlay: Bitmap, xpos: number, ypos: number, showDisplay: string | boolean | null = null, vertical = false): void {
  if (!pokemon) return;
  let compat: Id[];
  let isGenderless: boolean;
  if (pokemon instanceof Pokemon) {
    const noeggs = pokemon.egg() || pokemon.shadowPokemon() || pokemon.celestial() || pokemon.hasAbility("BATTLEBOND");
    compat = noeggs ? ["Undiscovered"] : pokemon.speciesData().eggGroups;
    isGenderless = pokemon.genderless() && !pokemon.isSpecies("DITTO");
  } else {
    const data = Species.get(pokemon);
    compat = data.eggGroups;
    isGenderless = data.genderRatio === "Genderless" && pokemon !== "DITTO";
  }
  const compat1 = compat[0]!;
  const compat2 = compat[1] ?? compat[0]!;
  const eggGroups = EGG_GROUPS;
  const path = `${EUI}Egg Groups/`;
  const eggGroupbitmap = new AnimatedBitmap(_INTL(path + "groups"));
  if (typeof showDisplay === "string") {
    let base: Color;
    let shadow: Color;
    if ((eggGroups[compat1] ?? 0) > 14 || (eggGroups[compat2] ?? 0) > 14) {
      base = new Color(250, 213, 165);
      shadow = new Color(204, 85, 0);
    } else {
      base = new Color(64, 64, 64);
      shadow = new Color(176, 176, 176);
    }
    pbDrawTextPositions(overlay, [[_INTL(showDisplay), xpos - 130, ypos + 2, 0, base, shadow]]);
  } else if (showDisplay) {
    pbDrawImagePositions(overlay, [[path + "pokedex_bg", xpos - 6, ypos - 14]]);
  }
  if (isGenderless && !compat.includes("Undiscovered")) {
    if (!vertical) xpos += 34;
    overlay.blt(xpos, ypos, eggGroupbitmap.bitmap, new Rect(0, eggGroups.Unknown! * 28, 64, 28));
  } else if (compat1 === compat2) {
    if (!vertical) xpos += 34;
    overlay.blt(xpos, ypos, eggGroupbitmap.bitmap, new Rect(0, (eggGroups[compat1] ?? 0) * 28, 64, 28));
  } else {
    const offsetX = vertical ? 0 : 68;
    const offsetY = vertical ? 28 : 0;
    overlay.blt(xpos, ypos, eggGroupbitmap.bitmap, new Rect(0, (eggGroups[compat1] ?? 0) * 28, 64, 28));
    overlay.blt(xpos + offsetX, ypos + offsetY, eggGroupbitmap.bitmap, new Rect(0, (eggGroups[compat2] ?? 0) * 28, 64, 28));
  }
}

/** pbDisplayGmaxFactor (ZUD Mechanics): the G-Max Factor icon. */
export function pbDisplayGmaxFactor(pokemon: Pokemon, overlay: Bitmap, xpos: number, ypos: number): void {
  if (!pokemon.gmaxFactor || pokemon.isSpecies("ETERNATUS")) return;
  // "BW Party Screen" isn't installed
  pbDrawImagePositions(overlay, [["Graphics/Plugins/ZUD/UI/gfactor", xpos, ypos]]);
}
