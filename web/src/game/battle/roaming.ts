// Port of 012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb:
// roaming Pokémon move between maps whenever the player enters a map with a
// different name, may replace a regular wild encounter, and stay defeated or
// caught. Visible Overworld Wild Encounters replaces pbRoamingMethodAllowed
// (game/encounters/visibleEncounters.ts). The settings are this game's
// 001_Settings.rb:273-330. The Roaming Icon plugin (icons on the Town Map) is
// in ui/pokegear/regionMap.ts, which reads roamPosition/roamPokemon.

import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { Species } from "../../data/gameData/species";
import { Data } from "../../data/store";
import { pbGetMapNameFromId } from "../../ui/planes";
import { pbGenerateWildPokemon } from "../encounters/PokemonEncounters";
import { pbRoamingMethodAllowed } from "../encounters/visibleEncounters";
import { EventHandlers } from "../eventHandlers";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { mapMetadata } from "../metadata";
import { Pokemon } from "../pokemon/Pokemon";
import { defineScript } from "../scriptApi";
import { setBattleRule, WildBattle } from "./BattleStarting";
import { PokemonGlobalExtras, pokemonJSON } from "./globalExtras";

/** map ID => maps it can lead to (a Ruby Hash: keys in insertion order). */
type RoamingAreas = Map<number, number[]>;
const areas = (o: [number, number[]][]): RoamingAreas => new Map(o);

/** Settings::ROAMING_AREAS: the maps roaming Pokémon use, each with the maps it leads to. */
export const ROAMING_AREAS = areas([
  [5, [21, 28, 31, 39, 41, 44, 47, 66, 69]],
  [21, [5, 28, 31, 39, 41, 44, 47, 66, 69]],
  [28, [5, 21, 31, 39, 41, 44, 47, 66, 69]],
  [31, [5, 21, 28, 39, 41, 44, 47, 66, 69]],
  [39, [5, 21, 28, 31, 41, 44, 47, 66, 69]],
  [41, [5, 21, 28, 31, 39, 44, 47, 66, 69]],
  [44, [5, 21, 28, 31, 39, 41, 47, 66, 69]],
  [47, [5, 21, 28, 31, 39, 41, 44, 66, 69]],
  [66, [5, 21, 28, 31, 39, 41, 44, 47, 69]],
  [69, [5, 21, 28, 31, 39, 41, 44, 47, 66]],
]);

/** Settings::JOHTO_ROAMING_AREAS */
export const JOHTO_ROAMING_AREAS = areas([
  [4, [9, 11, 13, 41, 53, 78, 82, 93, 95, 136, 152, 169]],
  [9, [4, 11, 13, 41, 53, 78, 82, 93, 95, 136, 152, 169]],
  [11, [4, 9, 13, 41, 53, 78, 82, 93, 95, 136, 152, 169]],
  [13, [4, 9, 11, 41, 53, 78, 82, 93, 95, 136, 152, 169]],
  [41, [4, 9, 11, 13, 53, 78, 82, 93, 95, 136, 152, 169]],
  [53, [4, 9, 11, 13, 41, 78, 82, 93, 95, 136, 152, 169]],
  [78, [4, 9, 11, 13, 41, 53, 82, 93, 95, 136, 152, 169]],
  [82, [4, 9, 11, 13, 41, 53, 78, 93, 95, 136, 152, 169]],
  [93, [4, 9, 11, 13, 41, 53, 78, 82, 95, 136, 152, 169]],
  [95, [4, 9, 11, 13, 41, 53, 78, 82, 93, 136, 152, 169]],
  [136, [4, 9, 11, 13, 41, 53, 78, 82, 93, 95, 152, 169]],
  [152, [4, 9, 11, 13, 41, 53, 78, 82, 93, 95, 136, 169]],
  [169, [4, 9, 11, 13, 41, 53, 78, 82, 93, 95, 136, 152]],
]);

/** Settings::GENERIC_ROAMING_AREAS_FALLBACK ("fallback for old game versions that had the roaming Latias and Latios in Johto") */
export const GENERIC_ROAMING_AREAS_FALLBACK = areas([
  [849, [850]],
  [850, [849]],
]);

/**
 * Settings::ROAMING_SPECIES: [species, level, Game Switch (roams while ON),
 * encounter type (0=any, 1=grass/walking in cave, 2=surfing, 3=fishing,
 * 4=surfing/fishing), battle BGM (optional), roaming areas (optional)].
 * The Rattata replace Essentials' example Latias/Latios, which old saves need.
 */
export type RoamingSpecies = [Id, number, number, number, string | null, RoamingAreas | null];
export const ROAMING_SPECIES: RoamingSpecies[] = [
  ["RATTATA", 5, 999, 0, "Battle roaming", GENERIC_ROAMING_AREAS_FALLBACK],
  ["RATTATA", 5, 999, 0, "Battle roaming", GENERIC_ROAMING_AREAS_FALLBACK],
  ["RATTATA", 5, 999, 2, null, areas([
    [2, [21, 31]],
    [21, [2, 31, 69]],
    [31, [2, 21, 69]],
    [69, [21, 31]],
  ])],
  ["RATTATA", 5, 999, 0, "Battle roaming", GENERIC_ROAMING_AREAS_FALLBACK],
  ["MEOWTH_2", 40, 752, 1, null, JOHTO_ROAMING_AREAS],
];

declare module "../globals" {
  interface PokemonGlobalMetadata {
    /** roamer index => map ID */
    roamPosition?: Record<number, number> | null;
    /** Per roamer: its Pokémon once met, or true once defeated/caught. */
    roamPokemon?: (Pokemon | true | null)[] | null;
    roamPokemonCaught_?: boolean[] | null;
  }
}

const g = () => G.pokemonGlobal;
const gameMap = () => G.gameMap as unknown as GameMap;
const switchOn = (id: number) => !!G.gameSwitches.get(id);

/**
 * PokemonGlobalMetadata#roamPokemonCaught: `@roamPokemonCaught || []`.
 * NOTE (Ruby parity): the reader returns a new array when the variable was
 * never set, and nothing ever sets it (attr_writer is unused), so
 * `roamPokemonCaught[i] = ...` in pbRoamingPokemonBattle writes into a
 * throwaway array (005_Overworld_RoamingPokemon.rb:7, :221): pbResetAllRoamers
 * never resets a roamer.
 */
export function roamPokemonCaught(): boolean[] {
  return g().roamPokemonCaught_ || [];
}

//===============================================================================
// Making roaming Pokémon roam around.
//===============================================================================
/** Resets all roaming Pokemon that were defeated without having been caught. */
export function pbResetAllRoamers(): void {
  const roam = g().roamPokemon;
  if (!roam) return;
  for (let i = 0; i < roam.length; i++) {
    if (roam[i] !== true || !roamPokemonCaught()[i]) continue;
    roam[i] = null;
  }
}

/** Gets the roaming areas for a particular Pokémon. */
export function pbRoamingAreas(idxRoamer: number): RoamingAreas {
  // [species ID, level, Game Switch, encounter type, battle BGM, area maps hash]
  const roamData = ROAMING_SPECIES[idxRoamer];
  if (roamData && roamData[5]) return roamData[5];
  return ROAMING_AREAS;
}

/** Puts a roamer in a completely random map available to it. */
export function pbRandomRoam(index: number): void {
  const pos = g().roamPosition;
  if (!pos) return;
  const keys = [...pbRoamingAreas(index).keys()];
  pos[index] = keys[rand(keys.length)]!;
}

/** Makes all roaming Pokémon roam to another map. */
export function pbRoamPokemon(): void {
  g().roamPokemon ??= [];
  // Start all roamers off in random maps
  if (!g().roamPosition) {
    const pos: Record<number, number> = {};
    g().roamPosition = pos;
    for (let i = 0; i < ROAMING_SPECIES.length; i++) {
      if (!Species.exists(ROAMING_SPECIES[i]![0])) continue;
      const keys = [...pbRoamingAreas(i).keys()];
      pos[i] = keys[rand(keys.length)]!;
    }
  }
  // Roam each Pokémon in turn
  for (let i = 0; i < ROAMING_SPECIES.length; i++) pbRoamPokemonOne(i);
}

/**
 * Makes a single roaming Pokémon roam to another map. Doesn't roam if it isn't
 * currently possible to encounter it (i.e. its Game Switch is off).
 */
export function pbRoamPokemonOne(idxRoamer: number): void {
  // [species ID, level, Game Switch, encounter type, battle BGM, area maps hash]
  const roamData = ROAMING_SPECIES[idxRoamer]!;
  if (roamData[2] > 0 && !switchOn(roamData[2])) return; // Game Switch is off
  if (!Species.exists(roamData[0])) return;
  // Get hash of area patrolled by the roaming Pokémon
  const mapIDs = [...pbRoamingAreas(idxRoamer).keys()];
  if (mapIDs.length === 0) return; // No roaming area defined somehow
  // Get the roaming Pokémon's current map
  const pos = g().roamPosition!;
  let currentMap = pos[idxRoamer];
  if (!currentMap) {
    currentMap = mapIDs[rand(mapIDs.length)]!;
    pos[idxRoamer] = currentMap;
  }
  // Make an array of all possible maps the roaming Pokémon could roam to
  const newMapChoices: number[] = [];
  const nextMaps = pbRoamingAreas(idxRoamer).get(currentMap);
  if (!nextMaps) return;
  for (const map of nextMaps) newMapChoices.push(map);
  // Rarely, add a random possible map into the mix
  if (rand(32) === 0) newMapChoices.push(mapIDs[rand(mapIDs.length)]!);
  // Choose a random new map to roam to
  if (newMapChoices.length > 0) pos[idxRoamer] = newMapChoices[rand(newMapChoices.length)]!;
}

// When the player moves to a new map (with a different name), make all roaming
// Pokémon roam.
EventHandlers.add("on_enter_map", "move_roaming_pokemon", (o) => {
  const oldMapId = o as number;
  // Get and compare map names
  const mapInfos = Data.mapInfos;
  const oldName = oldMapId > 0 ? mapInfos.get(oldMapId)?.name : undefined;
  if (oldMapId > 0 && oldName && gameMap().name === oldName) return;
  // Make roaming Pokémon roam
  pbRoamPokemon();
  g().roamedAlready = false;
});

//===============================================================================
// Encountering a roaming Pokémon in a wild battle.
//===============================================================================
/** pbGetCurrentRegion(default = -1) (019_Utilities/001_Utilities.rb) */
function pbGetCurrentRegion(defaultRegion = -1): number {
  if (!G.gameMap) return defaultRegion;
  const pos = mapMetadata(gameMap().mapId)?.townMapPosition;
  return pos ? (pos[0] as number) : defaultRegion;
}

EventHandlers.add("on_wild_species_chosen", "roaming_pokemon", (e) => {
  const encounter = e as [Id, number] | null;
  const t = G.gameTemp;
  t.roamerIndexForEncounter = null;
  if (!encounter) return;
  // Give the regular encounter if encountering a roaming Pokémon isn't possible
  if (g().roamedAlready) return;
  if (g().partner) return;
  if (t.pokeRadarData) return;
  if (rand(100) < 75) return; // 25% chance of encountering a roaming Pokémon
  // Look at each roaming Pokémon in turn and decide whether it's possible to
  // encounter it
  const currentRegion = pbGetCurrentRegion();
  const currentMapName = gameMap().name;
  const possibleRoamers: [number, Id, number, string | null][] = [];
  ROAMING_SPECIES.forEach((data, i) => {
    // data = [species, level, Game Switch, roamer method, battle BGM, area maps hash]
    if (!Species.exists(data[0])) return;
    if (data[2] > 0 && !switchOn(data[2])) return; // Isn't roaming
    // NOTE (Ruby parity): $PokemonGlobal.roamPokemon and roamPosition are only
    // created by pbRoamPokemon (on entering a map), so a game that hasn't
    // entered a map since they were added raises NoMethodError here (:153).
    if (g().roamPokemon![i] === true) return; // Roaming Pokémon has been caught
    // Get the roamer's current map
    let roamerMap = g().roamPosition![i];
    if (!roamerMap) {
      const mapIDs = [...pbRoamingAreas(i).keys()]; // Hash of area patrolled by the roaming Pokémon
      if (mapIDs.length === 0) return; // No roaming area defined somehow
      roamerMap = mapIDs[rand(mapIDs.length)]!;
      g().roamPosition![i] = roamerMap;
    }
    // If roamer isn't on the current map, check if it's on a map with the same
    // name and in the same region
    if (roamerMap !== gameMap().mapId) {
      const mapMetadataR = MapMetadata.tryGet(roamerMap);
      if (!mapMetadataR || !mapMetadataR.townMapPosition || mapMetadataR.townMapPosition[0] !== currentRegion) return;
      if (pbGetMapNameFromId(roamerMap) !== currentMapName) return;
    }
    // Check whether the roamer's roamer method is currently possible
    if (!pbRoamingMethodAllowed(data[3])) return;
    // Add this roaming Pokémon to the list of possible roaming Pokémon to encounter
    possibleRoamers.push([i, data[0], data[1], data[4]]); // [i, species, level, BGM]
  });
  // No encounterable roaming Pokémon were found, just have the regular encounter
  if (possibleRoamers.length === 0) return;
  // Pick a roaming Pokémon to encounter out of those available
  const roamer = possibleRoamers[rand(possibleRoamers.length)]!; // .sample
  g().roamEncounter = roamer;
  t.roamerIndexForEncounter = roamer[0];
  if (roamer[3] && roamer[3] !== "") g().nextBattleBGM = roamer[3];
  t.forceSingleBattle = true;
  encounter[0] = roamer[1]; // Species
  encounter[1] = roamer[2]; // Level
});

EventHandlers.add("on_calling_wild_battle", "roaming_pokemon", async (p, l, h) => {
  const handled = h as (boolean | null)[];
  // handled is an array: [nil]. If [true] or [false], the battle has already
  // been overridden (the boolean is its outcome), so don't do anything that
  // would override it again
  if (handled[0] != null) return;
  if (!g().roamEncounter || G.gameTemp.roamerIndexForEncounter == null) return;
  handled[0] = await pbRoamingPokemonBattle(p as Pokemon | Id, l as number);
});

/** pbRoamingPokemonBattle(pkmn, level) */
export async function pbRoamingPokemonBattle(pkmn: Pokemon | Id, level: number): Promise<boolean> {
  console.log("Roaming Pokemon Battle"); // Console.echo
  console.log(pkmn);
  // Get the roaming Pokémon to encounter; generate it based on the species and
  // level if it doesn't already exist
  const idxRoamer = G.gameTemp.roamerIndexForEncounter!;
  const roam = g().roamPokemon!;
  if (!roam[idxRoamer] || !(roam[idxRoamer] instanceof Pokemon)) {
    if (pkmn instanceof Pokemon) roam[idxRoamer] = pbGenerateWildPokemon(pkmn.speciesData().id, pkmn.level, true);
    else roam[idxRoamer] = pbGenerateWildPokemon(pkmn, level, true);
  }
  // Set some battle rules
  setBattleRule("single");
  setBattleRule("roamerFlees");
  // Perform the battle
  const decision = await WildBattle.startCore([roam[idxRoamer] as Pokemon]);
  // Update Roaming Pokémon data based on result of battle
  if (decision === 1 || decision === 4) { // Defeated or caught
    roam[idxRoamer] = true;
    roamPokemonCaught()[idxRoamer] = decision === 4;
  }
  g().roamEncounter = null;
  g().roamedAlready = true;
  G.gameTemp.roamerIndexForEncounter = null;
  // Used by the Poké Radar to update/break the chain
  // NOTE (Ruby parity): pkmn.species on what may be a species symbol (:226)
  // would raise; the battle override always passes a Pokémon here.
  await EventHandlers.trigger("on_wild_battle_end", (pkmn as Pokemon).species, level, decision);
  // Return false if the player lost or drew the battle, and true if any other result
  return decision !== 2 && decision !== 5;
}

PokemonGlobalExtras.register("roamPosition");
PokemonGlobalExtras.register("roamPokemon", pokemonJSON);
PokemonGlobalExtras.register("roamPokemonCaught_");
PokemonGlobalExtras.register("roamEncounter");
PokemonGlobalExtras.register("roamedAlready");

defineScript("pbResetAllRoamers", () => pbResetAllRoamers());
defineScript("pbRoamPokemon", () => pbRoamPokemon());
defineScript("pbRandomRoam", (_c, i) => pbRandomRoam(Number(i)));
defineScript("pbRoamingPokemonBattle", (_c, pkmn, level) => pbRoamingPokemonBattle(pkmn as Pokemon | Id, Number(level)));
