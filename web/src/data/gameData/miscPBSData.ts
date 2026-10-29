// Port of Data/Scripts/010_Data/002_PBS data/001_MiscPBSData.rb and
// 002_PhoneDatabase.rb: the PBS data that isn't a GameData class (town map,
// phone messages, Regional Dexes; plus ZUD's raid ranks), and the Regional
// Dex helpers from 019_Utilities/001_Utilities.rb that read it.
//
// Ruby caches these in $game_temp on first use; here they're loaded with the
// rest of the PBS data (GameData.loadAll).

import type { PhoneData, RaidRanks, RegionalDexes, TownMap } from "../pbs/types";
import type { Id } from "./gameData";
import { Species } from "./species";

const misc = {
  townMap: [] as TownMap,
  phone: null as PhoneDatabase | null,
  regionalDexes: [] as RegionalDexes,
  raidRanks: { ranks: [], total: [], banned: [] } as RaidRanks,
};

/** PhoneDatabase */
export class PhoneDatabase {
  generics: string[] = [];
  greetings: string[] = [];
  greetingsMorning: string[] = [];
  greetingsEvening: string[] = [];
  bodies1: string[] = [];
  bodies2: string[] = [];
  battleRequests: string[] = [];
  trainers: unknown[] = [];

  static from(data: PhoneData): PhoneDatabase {
    return Object.assign(new PhoneDatabase(), data);
  }
}

export function setMiscPBSData(data: { townMap?: TownMap; phone?: PhoneData | null; regionalDexes?: RegionalDexes; raidRanks?: RaidRanks }): void {
  if (data.townMap) misc.townMap = data.townMap;
  if (data.phone !== undefined) misc.phone = data.phone ? PhoneDatabase.from(data.phone) : null;
  if (data.regionalDexes) misc.regionalDexes = data.regionalDexes;
  if (data.raidRanks) misc.raidRanks = data.raidRanks;
}

export function pbLoadTownMapData(): TownMap {
  return misc.townMap;
}

export function pbLoadPhoneData(): PhoneDatabase | null {
  return misc.phone;
}

export function pbLoadRegionalDexes(): RegionalDexes {
  return misc.regionalDexes;
}

/** ZUD Mechanics' pbGetRaidRank (the compiled raid_ranks.dat). */
export function pbGetRaidRank(): RaidRanks {
  return misc.raidRanks;
}

/** pbGetRegionalNumber(region, species): 1-based number in that dex, or 0. */
export function pbGetRegionalNumber(region: number, species: Id): number {
  const dexList = misc.regionalDexes[region];
  if (!dexList || dexList.length === 0) return 0;
  const speciesData = Species.tryGet(species);
  if (!speciesData) return 0;
  const i = dexList.indexOf(speciesData.species);
  return i >= 0 ? i + 1 : 0;
}

/** pbAllRegionalSpecies(region_dex): a copy of that dex's species list, or null. */
export function pbAllRegionalSpecies(regionDex: number): Id[] | null {
  if (regionDex < 0) return null;
  const dexList = misc.regionalDexes[regionDex];
  if (!dexList || dexList.length === 0) return null;
  return [...dexList];
}

/** pbGetRegionalDexLength(region_dex): negative means the National Dex. */
export function pbGetRegionalDexLength(regionDex: number): number {
  if (regionDex < 0) return Species.eachSpecies().length;
  const dexList = misc.regionalDexes[regionDex];
  return dexList ? dexList.length : 0;
}
