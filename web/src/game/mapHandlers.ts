// The map enter/leave handlers from 012_Overworld/001_Overworld.rb.

import { rand } from "../core/random";
import { Data } from "../data/store";
import { EventHandlers } from "./eventHandlers";
import type { GameMap } from "./GameMap";
import { G } from "./globals";
import { mapMetadata } from "./metadata";

const map = () => G.gameMap as unknown as GameMap;
const global = () => G.pokemonGlobal as unknown as Record<string, unknown> & { visitedMaps: boolean[] };

/** Weather in map metadata is [type, chance]. */
const weatherOf = (id: number) => mapMetadata(id)?.weather as [string, number] | null | undefined;

// Clears the weather of the old map, if the old map has defined weather and the
// new map either has the same name as the old map or doesn't have defined weather.
EventHandlers.add("on_leave_map", "end_weather", (newMapId) => {
  const id = newMapId as number;
  if (id === 0) return;
  if (!weatherOf(map().mapId)) return;
  if (map().name === Data.mapInfos.get(id)?.name && weatherOf(id)) return;
  G.gameScreen.weather("None", 0, 0);
});

// Set up various data related to the new map.
EventHandlers.add("on_enter_map", "setup_new_map", (oldMapId) => {
  const old = oldMapId as number;
  const meta = mapMetadata(map().mapId);
  if (meta?.teleportDestination) global().healingSpot = meta.teleportDestination;
  (G as unknown as { pokemonMap?: { clear(): void } }).pokemonMap?.clear();
  // Setup new wild encounter tables
  (G as unknown as { pokemonEncounters?: { setup(id: number): void } }).pokemonEncounters?.setup(map().mapId);
  global().visitedMaps[map().mapId] = true;
  if (old === 0 || old === map().mapId) return;
  const weather = weatherOf(map().mapId);
  if (!weather) return;
  if (map().name === Data.mapInfos.get(old)?.name && weatherOf(old)) return;
  if (rand(100) < weather[1]) G.gameScreen.weather(weather[0], 9, 0);
});

// Update trail of which maps the player has most recently visited.
EventHandlers.add("on_enter_map", "add_to_trail", () => {
  const g = global() as { mapTrail?: number[] };
  g.mapTrail ??= [];
  if (g.mapTrail[0] !== map().mapId && g.mapTrail.length >= 4) g.mapTrail.pop();
  g.mapTrail = [map().mapId, ...g.mapTrail];
});

// TODO(bicycle): :force_cycling (pbMountBike / pbDismountBike) arrives with the bike.
