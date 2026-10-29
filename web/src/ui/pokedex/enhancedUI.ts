// The Pokédex parts of Plugins/Enhanced UI (plugin 34): the display methods
// from [001] Pokemon UI.rb that the Pokédex uses (body shapes, habitats, egg
// groups) and the settings they read ([000] Settings.rb), plus Essentials
// Deluxe's egg_group_hash. The graphics must be preloaded
// (enhancedUIGraphics()).

import { assetExists } from "../../core/assets";
import { BodyShape } from "../../data/gameData/bodyShape";
import type { Id } from "../../data/gameData/gameData";
import { Habitat } from "../../data/gameData/habitat";
import { Species } from "../../data/gameData/species";
import { Pokemon } from "../../game/pokemon/Pokemon";
import type { Bitmap } from "../../rgss/Bitmap";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbDrawImagePositions, pbDrawTextPositions, type ImagePosition } from "../drawText";
import { _INTL } from "../messageConfig";
import { pbResolveBitmap } from "../rpgCache";

export const EnhancedUISettings = {
  POKEDEX_EGG_GROUPS: true,
  POKEDEX_BODY_SHAPES: true,
  /** 0 = Modern, 1 = Retro */
  SHAPE_DISPLAY_STYLE: 0,
  POKEDEX_HABITAT_ICONS: true,
};

const PATH = "Graphics/Plugins/Enhanced UI/";

/** Every graphic these methods can draw. */
export function enhancedUIGraphics(): string[] {
  const files = [`${PATH}Body Shapes/pokedex_bg`, `${PATH}Habitats/pokedex_bg`, `${PATH}Egg Groups/groups`, `${PATH}Egg Groups/pokedex_bg`];
  const style = EnhancedUISettings.SHAPE_DISPLAY_STYLE === 0 ? "Modern/" : "Retro/";
  for (const s of BodyShape.each()) files.push(`${PATH}Body Shapes/${style}${s.id}`);
  for (const h of Habitat.each()) files.push(`${PATH}Habitats/Icons/${h.id}`);
  files.push(`${PATH}Habitats/Icons/None`);
  return files.filter((f) => assetExists(f));
}

/** Essentials Deluxe's egg_group_hash: row of each egg group in groups.png. */
export const EGG_GROUP_HASH: Record<string, number> = {
  Monster: 0, Water1: 1, Bug: 2, Flying: 3, Field: 4, Fairy: 5, Grass: 6, Humanlike: 7, Water3: 8, Mineral: 9,
  Amorphous: 10, Water2: 11, Ditto: 12, Dragon: 13, Undiscovered: 14, Skycrest: 15, Bestial: 16, Titan: 17,
  Overlord: 18, Nebulous: 19, Enchanted: 20, Ancestor: 21, Ultra: 22, Unused1: 23, Unused2: 24, Unknown: 25,
};

type SpeciesLike = Pokemon | Species | Id;

function speciesOf(pokemon: SpeciesLike): Species {
  if (pokemon instanceof Pokemon) return pokemon.speciesData();
  return Species.get(pokemon);
}

/** pbDisplayBodyShape(pokemon, overlay, xpos, ypos, showDisplay): showDisplay draws the Pokédex backdrop. */
export function pbDisplayBodyShape(pokemon: SpeciesLike | null, overlay: Bitmap, xpos: number, ypos: number, showDisplay = false): void {
  if (!pokemon) return;
  const shape = speciesOf(pokemon).shape;
  if (!BodyShape.exists(shape)) return;
  const imagepos: ImagePosition[] = [];
  let path = `${PATH}Body Shapes/`;
  if (showDisplay) imagepos.push([path + "pokedex_bg", xpos - 4, ypos - 8]);
  switch (EnhancedUISettings.SHAPE_DISPLAY_STYLE) {
    case 0: path += "Modern/" + shape; break;
    case 1: path += "Retro/" + shape; break;
  }
  if (pbResolveBitmap(path)) {
    imagepos.push([path, xpos, ypos]);
    pbDrawImagePositions(overlay, imagepos);
  }
}

/** pbDisplayHabitat(pokemon, overlay, xpos, ypos, showDisplay): true/0 red backdrop, 1 blue (search results). */
export function pbDisplayHabitat(pokemon: SpeciesLike | null, overlay: Bitmap, xpos: number, ypos: number, showDisplay: boolean | number = false): void {
  if (!pokemon) return;
  let habitat: string = speciesOf(pokemon).habitat;
  if (!Habitat.exists(habitat)) return;
  const imagepos: ImagePosition[] = [];
  const path = `${PATH}Habitats/`;
  if (!pbResolveBitmap(path + "Icons/" + habitat)) habitat = "None";
  const file = path + "Icons/" + habitat;
  if (pbResolveBitmap(file)) {
    if (showDisplay !== false) {
      const i = typeof showDisplay === "number" ? showDisplay : 0;
      imagepos.push([path + "pokedex_bg", xpos - 6, ypos - 15, 76 * i, 0, 76 * (i + 1), 68]);
    }
    imagepos.push([file, xpos, ypos]);
    pbDrawImagePositions(overlay, imagepos);
  }
}

/**
 * pbDisplayEggGroups(pokemon, overlay, xpos, ypos, showDisplay, vertical):
 * showDisplay as a string labels the icons (Summary); true draws the Pokédex backdrop.
 */
export function pbDisplayEggGroups(
  pokemon: SpeciesLike | null, overlay: Bitmap, xpos: number, ypos: number, showDisplay: string | boolean | null = null, vertical = false,
): void {
  if (!pokemon) return;
  let compat: Id[];
  let isGenderless: boolean;
  if (pokemon instanceof Pokemon) {
    const noeggs = pokemon.egg() || pokemon.shadowPokemon() || pokemon.celestial() || pokemon.hasAbility("BATTLEBOND");
    compat = noeggs ? ["Undiscovered"] : pokemon.speciesData().eggGroups;
    isGenderless = pokemon.genderless() && !pokemon.isSpecies("DITTO");
  } else {
    const sp = speciesOf(pokemon);
    compat = sp.eggGroups;
    isGenderless = sp.genderRatio === "Genderless" && (typeof pokemon === "string" ? pokemon : pokemon.id) !== "DITTO";
  }
  const compat1 = compat[0]!;
  const compat2 = compat[1] ?? compat[0]!;
  const eggGroups = EGG_GROUP_HASH;
  const path = `${PATH}Egg Groups/`;
  const eggGroupbitmap = new AnimatedBitmap(_INTL(path + "groups"));
  if (typeof showDisplay === "string") {
    let base: Color;
    let shadow: Color;
    if (eggGroups[compat1]! > 14 || eggGroups[compat2]! > 14) {
      base = new Color(250, 213, 165);
      shadow = new Color(204, 85, 0);
    } else {
      base = new Color(64, 64, 64);
      shadow = new Color(176, 176, 176);
    }
    pbDrawTextPositions(overlay, [[_INTL(`${showDisplay}`), xpos - 130, ypos + 2, 0, base, shadow]]);
  } else if (showDisplay) {
    pbDrawImagePositions(overlay, [[path + "pokedex_bg", xpos - 6, ypos - 14]]);
  }
  if (isGenderless && !compat.includes("Undiscovered")) {
    if (!vertical) xpos += 34;
    overlay.blt(xpos, ypos, eggGroupbitmap.bitmap, new Rect(0, eggGroups.Unknown! * 28, 64, 28));
  } else if (compat1 === compat2) {
    if (!vertical) xpos += 34;
    overlay.blt(xpos, ypos, eggGroupbitmap.bitmap, new Rect(0, eggGroups[compat1]! * 28, 64, 28));
  } else {
    const offsetX = vertical ? 0 : 68;
    const offsetY = vertical ? 28 : 0;
    overlay.blt(xpos, ypos, eggGroupbitmap.bitmap, new Rect(0, eggGroups[compat1]! * 28, 64, 28));
    overlay.blt(xpos + offsetX, ypos + offsetY, eggGroupbitmap.bitmap, new Rect(0, eggGroups[compat2]! * 28, 64, 28));
  }
}
