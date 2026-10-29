// Port of Essentials Deluxe's Game_Temp additions ([002] Battle Deluxe/
// Battle_Deluxe.rb:8-65): the deluxe battle settings of the next battle
// (G.gameTemp.dxRules / dxPokemon / dxMidbattle, Ruby's @dx_rules etc.).

import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";

type DxHash = Record<string, unknown>;

/** $game_temp.dx_rules? */
export function dxRulesQ(): boolean {
  const r = G.gameTemp.dxRules;
  return !!r && Object.keys(r).length > 0;
}

/** $game_temp.dx_pokemon? */
export function dxPokemonQ(): boolean {
  const p = G.gameTemp.dxPokemon;
  return !!p && Object.keys(p).length > 0;
}

/** $game_temp.dx_midbattle? */
export function dxMidbattleQ(): boolean {
  const m = G.gameTemp.dxMidbattle;
  return !!m && Object.keys(m).length > 0;
}

/** $game_temp.dx_rules = value (nil becomes {}) */
export function setDxRules(value: DxHash | null | undefined): void {
  G.gameTemp.dxRules = value ?? {};
}

/** $game_temp.dx_pokemon = value */
export function setDxPokemon(value: DxHash | null | undefined): void {
  G.gameTemp.dxPokemon = value ?? {};
}

/** $game_temp.dx_midbattle = value. A preset's name (a Symbol) stays as it is until dx_start resolves it. */
export function setDxMidbattle(value: unknown): void {
  G.gameTemp.dxMidbattle = (value ?? {}) as DxHash;
}

/** Game_Temp#dx_clear: forgets the deluxe settings after the battle. */
export function dxClear(clearBattleRules: () => void, deregisterPartner: () => void): void {
  if (dxRulesQ()) {
    for (const key of Object.keys(G.gameTemp.dxRules!)) {
      switch (key) {
        case "nomega": G.gameSwitches.set(Settings.NO_MEGA_EVOLUTION, false); break;
        case "nozmove": case "noultra": case "nodynamax":
          // PluginManager.installed?("ZUD Mechanics")
          if (key === "nozmove") G.gameSwitches.set(Settings.NO_Z_MOVE, false);
          if (key === "noultra") G.gameSwitches.set(Settings.NO_ULTRA_BURST, false);
          if (key === "nodynamax") G.gameSwitches.set(Settings.NO_DYNAMAX, false);
          break;
        // :nostyles, :notera, :nozodiac, :nofocus: their plugins aren't installed.
      }
    }
    clearHash(G.gameTemp.dxRules!);
  }
  if (dxPokemonQ()) clearHash(G.gameTemp.dxPokemon!);
  if (dxMidbattleQ()) clearHash(G.gameTemp.dxMidbattle!);
  if (G.pokemonGlobal) (G.pokemonGlobal as unknown as { nextBattleBGM: unknown }).nextBattleBGM = null;
  deregisterPartner();
  clearBattleRules();
}

/** Hash#clear (in place: a battle that kept the hash sees it empty). */
function clearHash(h: DxHash): void {
  for (const k of Object.keys(h)) delete h[k];
}
