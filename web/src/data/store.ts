// Game data loaded once at boot (Essentials' $data_* globals) plus a map
// cache. Ruby loads maps synchronously; here maps are fetched ahead of time
// (preloadMaps) so the game code can read them synchronously.

import type { CommonEvent } from "./events";
import type { AnimationData } from "../sprites/SpriteAnimation";
import { loadMap, loadMapInfos, loadSystem } from "./loader";
import type { MapData, MapInfo, SystemData, Tileset } from "./types";

export interface MapConnection {
  /** Essentials' resolved connection: [mapA, xA, yA, mapB, xB, yB]. */
  mapA: number;
  xA: number;
  yA: number;
  mapB: number;
  xB: number;
  yB: number;
}

export const Data = {
  system: null as unknown as SystemData,
  tilesets: new Map<number, Tileset>(),
  commonEvents: new Map<number, CommonEvent>(),
  /** $data_animations */
  animations: new Map<number, AnimationData>(),
  mapInfos: new Map<number, MapInfo>(),
  /** Map id -> connections touching it (MapFactoryHelper.getMapConnections). */
  connections: new Map<number, MapConnection[]>(),
};

const maps = new Map<number, MapData>();
const pending = new Map<number, Promise<MapData>>();

export async function loadGameData(): Promise<void> {
  const [system, infos, tilesets, commonEvents, animations] = await Promise.all([
    loadSystem(),
    loadMapInfos(),
    fetch("/data/tilesets.json").then((r) => r.json() as Promise<Tileset[]>),
    fetch("/data/common-events.json").then((r) => r.json() as Promise<CommonEvent[]>),
    fetch("/data/animations.json").then((r) => r.json() as Promise<AnimationData[]>),
  ]);
  Data.system = system;
  for (const i of infos) Data.mapInfos.set(i.id, i);
  for (const t of tilesets) Data.tilesets.set(t.id, t);
  for (const c of commonEvents) Data.commonEvents.set(c.id, c);
  for (const a of animations) Data.animations.set(a.id, a);
}

/** Registers raw PBS map connections ([mapA, edgeA, posA, mapB, edgeB, posB]). */
export function setMapConnections(raw: [number, string | number, number, number, string | number, number][]): void {
  Data.connections.clear();
  for (const conn of raw) {
    const [a, edgeA, posA, b, edgeB, posB] = conn;
    const dimsA = mapDims(a);
    const dimsB = mapDims(b);
    if (!dimsA[0] || !dimsA[1] || !dimsB[0] || !dimsB[1]) continue;
    // Same resolution as MapFactoryHelper.getMapConnections.
    const resolve = (id: number, edge: string | number, pos: number): [number, number] => {
      const e = mapEdge(id, edge);
      if (edge === "N" || edge === "S") return [pos, e];
      if (edge === "E" || edge === "W") return [e, pos];
      return [edge as number, pos];
    };
    const [xA, yA] = resolve(a, edgeA, posA);
    const [xB, yB] = resolve(b, edgeB, posB);
    const c: MapConnection = { mapA: a, xA, yA, mapB: b, xB, yB };
    for (const id of [a, b]) {
      if (!Data.connections.has(id)) Data.connections.set(id, []);
      Data.connections.get(id)!.push(c);
    }
  }
}

export function mapDims(id: number): [number, number] {
  const info = Data.mapInfos.get(id);
  return [info?.width ?? 0, info?.height ?? 0];
}

function mapEdge(id: number, edge: string | number): number {
  if (edge === "N" || edge === "W") return 0;
  const dims = mapDims(id);
  if (edge === "E") return dims[0];
  if (edge === "S") return dims[1];
  return dims[0];
}

export function connectionsFor(id: number): MapConnection[] {
  return Data.connections.get(id) ?? [];
}

/** Map data that has been preloaded, or throws (a missing preload is a bug). */
export function getMapData(id: number): MapData {
  const m = maps.get(id);
  if (!m) throw new Error(`Map ${id} was used before it was loaded`);
  return m;
}

export function hasMapData(id: number): boolean {
  return maps.has(id);
}

/** Loads a map and every map within `hops` connections of it. */
export async function preloadMaps(id: number, hops = 2): Promise<void> {
  const ids = new Set([id]);
  let frontier = [id];
  for (let h = 0; h < hops; h++) {
    const next: number[] = [];
    for (const m of frontier) {
      for (const c of connectionsFor(m)) {
        for (const other of [c.mapA, c.mapB]) {
          if (!ids.has(other)) {
            ids.add(other);
            next.push(other);
          }
        }
      }
    }
    frontier = next;
  }
  await Promise.all([...ids].map(fetchMap));
}

function fetchMap(id: number): Promise<MapData> {
  const done = maps.get(id);
  if (done) return Promise.resolve(done);
  let p = pending.get(id);
  if (!p) {
    p = loadMap(id).then((m) => {
      maps.set(id, m);
      pending.delete(id);
      return m;
    });
    pending.set(id, p);
  }
  return p;
}
