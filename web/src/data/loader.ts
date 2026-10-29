import type { MapData, MapInfo, SystemData, Tileset } from "./types";

async function json<T>(path: string): Promise<T> {
  const res = await fetch(`/data/${path}`);
  if (!res.ok) throw new Error(`Failed to load data/${path}: ${res.status}`);
  return (await res.json()) as T;
}

let tilesets: Map<number, Tileset> | undefined;

export async function loadTileset(id: number): Promise<Tileset> {
  if (!tilesets) {
    const list = await json<Tileset[]>("tilesets.json");
    tilesets = new Map(list.map((t) => [t.id, t]));
  }
  const tileset = tilesets.get(id);
  if (!tileset) throw new Error(`Unknown tileset ${id}`);
  return tileset;
}

export function loadMap(id: number): Promise<MapData> {
  return json<MapData>(`maps/Map${String(id).padStart(3, "0")}.json`);
}

export function loadMapInfos(): Promise<MapInfo[]> {
  return json<MapInfo[]>("map-infos.json");
}

export function loadSystem(): Promise<SystemData> {
  return json<SystemData>("system.json");
}
