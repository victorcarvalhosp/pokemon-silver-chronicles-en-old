// Port of Data/Scripts/010_Data/002_PBS data/013_Encounter.rb.
// Keyed "map_version" like Essentials' :"#{map}_#{version}" symbols.

import type { EncounterData, EncounterSlot } from "../pbs/types";
import type { Id } from "./gameData";

export class Encounter {
  static DATA = new Map<string, Encounter>();
  id: string;
  map: number;
  version: number;
  /** Encounter type ID → step chance. */
  readonly stepChances: Record<Id, number>;
  /** Encounter type ID → [chance, species, min level, max level] slots. */
  readonly types: Record<Id, EncounterSlot[]>;

  static register(hash: EncounterData): Encounter {
    const obj = new Encounter(hash);
    Encounter.DATA.set(obj.id, obj);
    return obj;
  }

  /** exists?(map_id, map_version = 0) */
  static exists(mapId: number, mapVersion = 0): boolean {
    return Encounter.DATA.has(`${mapId}_${mapVersion}`);
  }

  /** get(map_id, map_version = 0): falls back to version 0; nil if the map has none. */
  static get(mapId: number, mapVersion = 0): Encounter | null {
    const trialKey = `${mapId}_${mapVersion}`;
    const key = Encounter.DATA.has(trialKey) ? trialKey : `${mapId}_0`;
    return Encounter.DATA.get(key) ?? null;
  }

  static keys(): string[] {
    return [...Encounter.DATA.keys()];
  }

  /** each: by map, then version. */
  static each(): Encounter[] {
    return [...Encounter.DATA.values()].sort((a, b) => (a.map === b.map ? a.version - b.version : a.map - b.map));
  }

  /**
   * each_of_version: every table for that version, plus version 0 tables for
   * maps without one. (Ruby looks the latter up with an [map, version] key that
   * never exists, so version 0 tables are always included too; kept as is.)
   */
  static eachOfVersion(version = 0): Encounter[] {
    const ret: Encounter[] = [];
    for (const data of Encounter.each()) {
      if (data.version === version) ret.push(data);
      if (version > 0 && data.version === 0) ret.push(data);
    }
    return ret;
  }

  static count(): number {
    return Encounter.DATA.size;
  }

  constructor(hash: Partial<EncounterData> & { id: string; map: number }) {
    this.id = hash.id;
    this.map = hash.map;
    this.version = hash.version ?? 0;
    this.stepChances = hash.stepChances ?? {};
    this.types = hash.types ?? {};
  }
}
