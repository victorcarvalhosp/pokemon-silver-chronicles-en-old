// Shared bits of the Pokédex screens: the $PokemonGlobal Pokédex fields,
// Settings the screens read, and System.user_language's country check.

import { pbLoadRegionalDexes } from "../../data/gameData/miscPBSData";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import type { Player } from "../../game/trainer/Player";

/** Settings::DEXES_WITH_OFFSETS (Dex lists numbered from 0; none in this game). */
export const DEXES_WITH_OFFSETS: number[] = [];

export const player = () => G.player as unknown as Player;

/** $PokemonGlobal's Pokédex fields (PokemonGlobalMetadata#initialize sets them up). */
export interface DexGlobals {
  /** Dex being looked at: Regional Dex number, or -1 for the National Dex. */
  pokedexDex: number;
  /** Last species looked at in each Dex (regional ones, then the National Dex). */
  pokedexIndex: number[];
  /** Search/sort mode (MODENUMERICAL...). */
  pokedexMode: number;
}

export function dexGlobals(): DexGlobals {
  const g = G.pokemonGlobal as unknown as Partial<DexGlobals>;
  const numRegions = pbLoadRegionalDexes().length;
  if (g.pokedexDex == null) g.pokedexDex = numRegions === 0 ? -1 : 0;
  if (!Array.isArray(g.pokedexIndex)) g.pokedexIndex = [];
  for (let i = 0; i <= numRegions; i++) g.pokedexIndex[i] ??= 0;
  if (g.pokedexMode == null) g.pokedexMode = 0;
  return g as DexGlobals;
}

/** System.user_language[3..4] == "US": imperial units for players in the United States. */
export function userInUS(): boolean {
  const lang = typeof navigator !== "undefined" ? navigator.language : "";
  return lang.slice(3, 5).toUpperCase() === "US";
}

/** Settings.pokedex_names */
export function pokedexNames(): ([string, number] | string)[] {
  return Settings.pokedexNames();
}

/** sprintf("%03d", n) (negative numbers keep their sign before the padding, like Ruby). */
export function pad3(n: number): string {
  return n < 0 ? "-" + String(-n).padStart(2, "0") : String(n).padStart(3, "0");
}

/** sprintf("%.1f", n) */
export function f1(n: number): string {
  return n.toFixed(1);
}
