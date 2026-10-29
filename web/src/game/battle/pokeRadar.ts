// Port of 013_Items/005_Item_PokeRadar.rb: using the Poké Radar (shaking
// grass patches around the player), the encounters and chains it gives, and
// the item handlers.

import { DEBUG } from "../../core/debug";
import { Input } from "../../rgss/Input";
import { rand } from "../../core/random";
import { EncounterType } from "../../data/gameData/encounterType";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import type { SceneMap } from "../../scenes/SceneMap";
import { pbMessage } from "../../ui/messages";
import { pokemonEncounters, specialBattleHooks, type WildEncounter } from "../encounters/PokemonEncounters";
import { EventHandlers } from "../eventHandlers";
import type { GameMap } from "../GameMap";
import type { GamePlayer } from "../GamePlayer";
import { G } from "../globals";
import { ItemHandlers } from "../items/ItemHandlers";
import type { Pokemon } from "../pokemon/Pokemon";
import { pbWaitSeconds } from "../scripts/overworld";
import { defineScript } from "../scriptApi";
import { PokemonGlobalExtras } from "./globalExtras";

/** Settings::RUSTLE_*_ANIMATION_ID (001_Settings.rb:379-385) */
export const RUSTLE_NORMAL_ANIMATION_ID = 1;
export const RUSTLE_VIGOROUS_ANIMATION_ID = 5;
export const RUSTLE_SHINY_ANIMATION_ID = 6;

/**
 * Settings::POKE_RADAR_ENCOUNTERS (001_Settings.rb:343): wild encounters only
 * found with the Poké Radar: [map ID, probability %, species, minimum level,
 * maximum level (optional)].
 */
export const POKE_RADAR_ENCOUNTERS: [number, number, Id, number, number?][] = [
  [5, 20, "STARLY", 12, 15],
  [21, 10, "STANTLER", 14],
  [28, 20, "BUTTERFREE", 15, 18],
  [28, 20, "BEEDRILL", 15, 18],
];

/** A shaking grass patch: [x, y, ring (0-3 inner to outer), rarity (0 normal, 1 rare, 2 shiny)]. */
export type RadarGrass = [number, number, number, number];
/** $game_temp.poke_radar_data: [species, level, chain count, grasses, previous in chain was caught] */
export type PokeRadarData = [Id | number, number, number, RadarGrass[], boolean];

declare module "../globals" {
  interface PokemonGlobalMetadata {
    pokeradarBattery?: number;
  }
}

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;
const radar = () => G.gameTemp.pokeRadarData as PokeRadarData | null | undefined;

//===============================================================================
// Using the Poke Radar
//===============================================================================
export async function pbCanUsePokeRadar(): Promise<boolean> {
  // Can't use Radar if not in tall grass
  const terrain = gameMap().terrainTag(gamePlayer().x, gamePlayer().y);
  if (!terrain.landWildEncounters || !terrain.showsGrassRustle) {
    await pbMessage(_INTL("Can't use that here."));
    return false;
  }
  // Can't use Radar if map has no grass-based encounters (ignoring Bug Contest)
  if (!pokemonEncounters().hasNormalLandEncounters()) {
    await pbMessage(_INTL("Can't use that here."));
    return false;
  }
  // Can't use Radar while cycling
  if (G.pokemonGlobal.bicycle) {
    await pbMessage(_INTL("Can't use that while on a bicycle."));
    return false;
  }
  // Debug
  if (DEBUG && Input.press(Input.CTRL)) return true;
  // Can't use Radar if it isn't fully charged
  const battery = G.pokemonGlobal.pokeradarBattery;
  if (battery && battery > 0) {
    await pbMessage(_INTL("The battery has run dry!\nFor it to recharge, you need to walk another {1} steps.", battery));
    return false;
  }
  return true;
}

export async function pbUsePokeRadar(): Promise<boolean> {
  if (!(await pbCanUsePokeRadar())) return false;
  G.stats.pokeRadarCount += 1;
  G.gameTemp.pokeRadarData ??= [0, 0, 0, [], false] as PokeRadarData;
  radar()![4] = false;
  G.pokemonGlobal.pokeradarBattery = 50;
  await pbPokeRadarHighlightGrass();
  return true;
}

export function pbPokeRadarCancel(): void {
  G.gameTemp.pokeRadarData = null;
}

/** The tiles a radar use picks: one random tile in each of the 4 rings around the player. */
export function pbPokeRadarChooseGrasses(): RadarGrass[] {
  const grasses: RadarGrass[] = []; // x, y, ring (0-3 inner to outer), rarity
  const p = gamePlayer();
  // Choose 1 random tile from each ring around the player
  for (let i = 0; i < 4; i++) {
    const r = rand((i + 1) * 8);
    // Get coordinates of randomly chosen tile
    let x = p.x;
    let y = p.y;
    if (r <= (i + 1) * 2) {
      x = p.x - i - 1 + r;
      y = p.y - i - 1;
    } else if (r <= (i + 1) * 6 - 2) {
      x = [p.x + i + 1, p.x - i - 1][r % 2]!;
      y = p.y - i + Math.floor((r - 1 - (i + 1) * 2) / 2);
    } else {
      x = p.x - i + r - (i + 1) * 6;
      y = p.y + i + 1;
    }
    // Add tile to grasses array if it's a valid grass tile
    if (x < 0 || x >= gameMap().width || y < 0 || y >= gameMap().height) continue;
    const terrain = gameMap().terrainTag(x, y);
    if (!terrain.landWildEncounters || !terrain.showsGrassRustle) continue;
    // Choose a rarity for the grass (0=normal, 1=rare, 2=shiny)
    let s = rand(100) < 25 ? 1 : 0;
    const data = radar();
    if (data && data[2] > 0) {
      let v = Math.max(Math.floor(65_536 / Settings.SHINY_POKEMON_CHANCE) - Math.min(data[2], 40) * 200, 200);
      v = Math.ceil(65_536 / v);
      if (rand(65_536) < v) s = 2;
    }
    grasses.push([x, y, i, s]);
  }
  return grasses;
}

export async function pbPokeRadarHighlightGrass(showmessage = true): Promise<void> {
  const grasses = pbPokeRadarChooseGrasses();
  if (grasses.length === 0) {
    // No shaking grass found, break the chain
    if (showmessage) await pbMessage(_INTL("The grassy patch remained quiet..."));
    pbPokeRadarCancel();
  } else {
    // Show grass rustling animations
    const spriteset = (G.scene as unknown as SceneMap | null)?.spriteset();
    for (const grass of grasses) {
      switch (grass[3]) {
        case 0: spriteset?.addUserAnimation(RUSTLE_NORMAL_ANIMATION_ID, grass[0], grass[1], true, 1); break; // Normal rustle
        case 1: spriteset?.addUserAnimation(RUSTLE_VIGOROUS_ANIMATION_ID, grass[0], grass[1], true, 1); break; // Vigorous rustle
        case 2: spriteset?.addUserAnimation(RUSTLE_SHINY_ANIMATION_ID, grass[0], grass[1], true, 1); break; // Shiny rustle
      }
    }
    if (radar()) radar()![3] = grasses;
    await pbWaitSeconds(0.5); // pbWait(Graphics.frame_rate / 2)
  }
}

export function pbPokeRadarGetShakingGrass(): number {
  const data = radar();
  if (!data) return -1;
  const grasses = data[3];
  if (grasses.length === 0) return -1;
  for (const i of grasses) {
    if (gamePlayer().x === i[0] && gamePlayer().y === i[1]) return i[2];
  }
  return -1;
}

export function pbPokeRadarOnShakingGrass(): boolean {
  return pbPokeRadarGetShakingGrass() >= 0;
}

export function pbPokeRadarGetEncounter(rarity = 0): WildEncounter | null {
  // Poké Radar-exclusive encounters can only be found in vigorously-shaking grass
  if (rarity > 0) {
    // Get all Poké Radar-exclusive encounters for this map
    const map = gameMap().mapId;
    const array = POKE_RADAR_ENCOUNTERS.filter((enc) => enc[0] === map && Species.exists(enc[2]));
    // If there are any exclusives, first have a chance of encountering those
    if (array.length > 0) {
      let rnd = rand(100);
      for (const enc of array) {
        rnd -= enc[1];
        if (rnd >= 0) continue;
        const level = enc[4] && enc[4] > enc[3] ? enc[3] + rand(enc[4] - enc[3] + 1) : enc[3];
        return [enc[2], level];
      }
    }
  }
  // Didn't choose a Poké Radar-exclusive species, choose a regular encounter instead
  return pokemonEncounters().chooseWildPokemon(pokemonEncounters().encounterType()!, rarity + 1);
}

specialBattleHooks.pokeRadarOnShakingGrass = pbPokeRadarOnShakingGrass;

//===============================================================================
// Event handlers
//===============================================================================
EventHandlers.add("on_wild_species_chosen", "poke_radar_chain", (e) => {
  const encounter = e as WildEncounter | null;
  const t = G.gameTemp;
  if (EncounterType.get(t.encounterType!).type !== "land" || G.pokemonGlobal.bicycle || G.pokemonGlobal.partner) {
    pbPokeRadarCancel();
    return;
  }
  const ring = pbPokeRadarGetShakingGrass();
  if (ring >= 0) { // Encounter triggered by stepping into rustling grass
    const data = radar()!;
    // Get rarity of shaking grass
    let rarity = 0; // 0 = rustle, 1 = vigorous rustle, 2 = shiny rustle
    for (const g of data[3]) if (g[2] === ring) rarity = g[3];
    if (data[2] > 0) { // Chain count, i.e. is chaining
      let chainChance = 58 + ring * 10;
      chainChance += Math.floor(Math.min(data[2], 40) / 4); // Chain length
      if (data[4]) chainChance += 10; // Previous in chain was caught
      if (rarity === 2 || rand(100) < chainChance) {
        // Continue the chain
        encounter![0] = data[0] as Id; // Species
        encounter![1] = data[1]; // Level
        t.forceSingleBattle = true;
      } else {
        // Break the chain, force an encounter with a different species
        for (let n = 0; n < 100; n++) {
          if (encounter && encounter[0] !== data[0]) break;
          const newEncounter = pokemonEncounters().chooseWildPokemon(pokemonEncounters().encounterType()!)!;
          encounter![0] = newEncounter[0];
          encounter![1] = newEncounter[1];
        }
        if (encounter![0] === data[0] && encounter![1] === data[1]) {
          // Chain couldn't be broken somehow; continue it after all
          t.forceSingleBattle = true;
        } else {
          pbPokeRadarCancel();
        }
      }
    } else { // Not chaining; will start one
      // Force random wild encounter, vigorous shaking means rarer species
      const newEncounter = pbPokeRadarGetEncounter(rarity)!;
      encounter![0] = newEncounter[0];
      encounter![1] = newEncounter[1];
      t.forceSingleBattle = true;
    }
  } else if (encounter) { // Encounter triggered by stepping in non-rustling grass
    pbPokeRadarCancel();
  }
});

EventHandlers.add("on_wild_pokemon_created", "poke_radar_shiny", (p) => {
  const pkmn = p as Pokemon;
  const data = radar();
  if (!data) return;
  const grasses = data[3];
  if (!grasses) return;
  for (const grass of grasses) {
    if (gamePlayer().x !== grass[0] || gamePlayer().y !== grass[1]) continue;
    if (grass[3] === 2) pkmn.shiny = true;
    break;
  }
});

EventHandlers.add("on_wild_battle_end", "poke_radar_continue_chain", async (species, level, decision) => {
  const data = radar();
  if (data && (decision === 1 || decision === 4)) { // Defeated/caught
    data[0] = species as Id;
    data[1] = level as number;
    data[2] += 1;
    G.stats.pokeRadarLongestChain = Math.max(data[2], G.stats.pokeRadarLongestChain);
    // Catching makes the next Radar encounter more likely to continue the chain
    data[4] = decision === 4;
    await pbPokeRadarHighlightGrass(false);
  } else {
    pbPokeRadarCancel();
  }
});

EventHandlers.add("on_player_step_taken", "poke_radar", () => {
  const g = G.pokemonGlobal;
  if (g.pokeradarBattery && g.pokeradarBattery > 0 && !radar()) g.pokeradarBattery -= 1;
  const terrain = gameMap().terrainTag(gamePlayer().x, gamePlayer().y);
  if (!terrain.landWildEncounters || !terrain.showsGrassRustle) pbPokeRadarCancel();
});

EventHandlers.add("on_enter_map", "cancel_poke_radar", () => {
  pbPokeRadarCancel();
});

//===============================================================================
// Item handlers
//===============================================================================
ItemHandlers.UseInField.add("POKERADAR", () => pbUsePokeRadar());

ItemHandlers.UseFromBag.add("POKERADAR", async () => ((await pbCanUsePokeRadar()) ? 2 : 0));

PokemonGlobalExtras.register("pokeradarBattery");

defineScript("pbUsePokeRadar", () => pbUsePokeRadar());
defineScript("pbCanUsePokeRadar?", () => pbCanUsePokeRadar());
defineScript("pbPokeRadarCancel", () => pbPokeRadarCancel());
