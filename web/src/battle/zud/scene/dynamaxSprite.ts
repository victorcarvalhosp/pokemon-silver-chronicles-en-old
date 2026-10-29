// Port of Plugins/ZUD Mechanics/[000] General/Sprite.rb: the Dynamax look of
// battler sprites and party icons (Sprite#applyDynamax, #unDynamax,
// #applyDynamaxIcon): double (icons 1.5x) size with SHOW_DYNAMAX_SIZE, and the
// red (Calyrex: cyan) pattern overlay with SHOW_DYNAMAX_COLOR, which uses
// mkxp-z's Sprite#pattern (rgss/display.ts). Sprites call these from their own
// applyDynamax/unDynamax (battle/scene/objects.ts, ui/sprites/pokemonIcon.ts,
// the cinematics in this folder). The pattern graphics must be preloaded
// (DYNAMAX_PATTERN_GRAPHICS).

import type { Id } from "../../../data/gameData/gameData";
import { Settings } from "../../../data/gameData/settings";
import type { Pokemon } from "../../../game/pokemon/Pokemon";
import type { Sprite } from "../../../rgss/display";
import { RPGCache } from "../../../ui/rpgCache";
import { PBEffects } from "../../other/PBEffects";

const PATH = "Graphics/Plugins/ZUD/";
/** The pattern bitmaps applyDynamax reads (preload them before a battle). */
export const DYNAMAX_PATTERN_GRAPHICS = [PATH + "dynamax_pattern", PATH + "calyrex_pattern"];

/** What Sprite#applyDynamax accepts: a battler (its displayed Pokémon), a Pokémon or a species ID. */
type DynamaxPokemon = { effects: unknown[]; displayPokemon(): Pokemon | null } | Pokemon | Id | null | undefined;

function isCalyrex(pokemon: DynamaxPokemon): boolean {
  if (pokemon == null) return false;
  if (typeof pokemon === "string") return pokemon === "CALYREX";
  if ("displayPokemon" in pokemon && "effects" in pokemon) { // Battle::Battler
    const p = (pokemon.effects[PBEffects.TransformPokemon] as Pokemon | null) ?? pokemon.displayPokemon();
    return p ? p.isSpecies("CALYREX") : false;
  }
  return (pokemon as Pokemon).isSpecies("CALYREX");
}

/** The pattern of a Dynamax Pokémon (calyrex_pattern for Calyrex). */
function setPattern(sprite: Sprite, calyrex: boolean): void {
  sprite.pattern = RPGCache.loadBitmap(PATH + (calyrex ? "calyrex_pattern" : "dynamax_pattern"));
  sprite.patternOpacity = 150;
}

/** Sprite#applyDynamax(pokemon) (the Terastal plugin's unTera isn't installed). */
export function applyDynamax(sprite: Sprite, pokemon: DynamaxPokemon = null): void {
  if (Settings.SHOW_DYNAMAX_SIZE) {
    sprite.zoomX = sprite.zoomY = 2; // Change Dynamax zoom here
  }
  if (Settings.SHOW_DYNAMAX_COLOR) setPattern(sprite, isCalyrex(pokemon));
}

/** Sprite#unDynamax */
export function unDynamax(sprite: Sprite): void {
  if (sprite.zoomX > 1) sprite.zoomX = 1;
  if (sprite.zoomY > 1) sprite.zoomY = 1;
  sprite.pattern = null;
}

/** Sprite#applyDynamaxIcon (for a sprite showing pokemon's icon). */
export function applyDynamaxIcon(sprite: Sprite, pokemon: Pokemon | null): void {
  if (pokemon?.dynamax) {
    if (Settings.SHOW_DYNAMAX_SIZE && sprite.bitmap && sprite.bitmap.height <= 64) {
      sprite.zoomX = sprite.zoomY = 1.5;
    } else {
      sprite.zoomX = sprite.zoomY = 1;
    }
    if (Settings.SHOW_DYNAMAX_COLOR) setPattern(sprite, pokemon.isSpecies("CALYREX"));
  } else {
    unDynamax(sprite);
  }
}
