// GameData::Metadata / PlayerMetadata / MapMetadata lookups over the JSON
// compiled from PBS (metadata.txt, map_metadata.txt).

export interface MapMetadata {
  id: number;
  realName?: string;
  outdoorMap?: boolean;
  showArea?: boolean;
  bicycle?: boolean;
  bicycleAlways?: boolean;
  healingSpot?: number[];
  weather?: unknown;
  townMapPosition?: number[];
  diveMap?: number;
  darkMap?: boolean;
  safariMap?: boolean;
  snapEdges?: boolean;
  randomDungeon?: boolean;
  battleBackground?: string;
  wildBattleBGM?: string;
  trainerBattleBGM?: string;
  wildVictoryBGM?: string;
  trainerVictoryBGM?: string;
  wildCaptureME?: string;
  townMapSize?: unknown;
  battleEnvironment?: string;
  flags?: string[];
  [field: string]: unknown;
}

export interface PlayerMetadata {
  id: number;
  trainerType?: string;
  walkCharset?: string;
  runCharset?: string;
  cycleCharset?: string;
  surfCharset?: string;
  diveCharset?: string;
  fishCharset?: string;
  surfFishCharset?: string;
  [field: string]: unknown;
}

export interface Metadata {
  [field: string]: unknown;
}

const maps = new Map<number, MapMetadata>();
const players = new Map<number, PlayerMetadata>();
let global: Metadata = {};

function records<T extends { id: number }>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, T>).map(([k, v]) => ({ ...v, id: v.id ?? Number(k) }));
  }
  return [];
}

export function setMetadata(data: { maps?: unknown; players?: unknown; metadata?: unknown }): void {
  maps.clear();
  players.clear();
  for (const m of records<MapMetadata>(data.maps)) maps.set(Number(m.id), m);
  for (const p of records<PlayerMetadata>(data.players)) players.set(Number(p.id), p);
  const meta = data.metadata;
  global = (Array.isArray(meta) ? meta[0] : meta) as Metadata ?? {};
}

export function mapMetadata(id: number): MapMetadata | undefined {
  return maps.get(id);
}

export function playerMetadata(id: number): PlayerMetadata | undefined {
  return players.get(id) ?? players.get(1);
}

export function metadata(): Metadata {
  return global;
}

/**
 * The editors (debug/editors/EditorScreens.ts) replace one record after
 * GameData::*Metadata.register, as Ruby's lookups then see the new data.
 * The records have the compiled JSON's keys (data/pbs/types.ts).
 */
export const MetadataRecords = {
  setMap(record: MapMetadata): void { maps.set(Number(record.id), record); },
  setPlayer(record: PlayerMetadata): void { players.set(Number(record.id), record); },
  setGlobal(record: Metadata): void { global = record; },
};
