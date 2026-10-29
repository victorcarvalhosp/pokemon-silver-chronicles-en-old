// Port of Data/Scripts/010_Data/002_PBS data/018_MapMetadata.rb.

import type { MapMetadataData } from "../pbs/types";
import { type Id, NumberData, hasFlag } from "./gameData";

export class MapMetadata extends NumberData {
  static DATA = new Map<number, MapMetadata>();
  readonly id: number;
  readonly realName: string | null;
  readonly outdoorMap: boolean | null;
  readonly announceLocation: boolean | null;
  readonly canBicycle: boolean | null;
  readonly alwaysBicycle: boolean | null;
  readonly teleportDestination: [number, number, number] | null;
  readonly weather: [Id, number] | null;
  readonly townMapPosition: [number, number, number] | null;
  readonly diveMapId: number | null;
  readonly darkMap: boolean | null;
  readonly safariMap: boolean | null;
  readonly snapEdges: boolean | null;
  readonly randomDungeon: boolean | null;
  readonly battleBackground: string | null;
  readonly wildBattleBGM: string | null;
  readonly trainerBattleBGM: string | null;
  readonly wildVictoryBGM: string | null;
  readonly trainerVictoryBGM: string | null;
  readonly wildCaptureME: string | null;
  readonly townMapSize: [number, string] | null;
  readonly battleEnvironment: Id | null;
  readonly flags: string[];

  static get(other: number | MapMetadata): MapMetadata {
    if (other instanceof MapMetadata) return other;
    const ret = MapMetadata.DATA.get(other);
    if (!ret) throw new Error(`Unknown ID ${other}.`);
    return ret;
  }

  constructor(hash: Partial<MapMetadataData> & { id: number }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? null;
    this.outdoorMap = hash.outdoorMap ?? null;
    this.announceLocation = hash.announceLocation ?? null;
    this.canBicycle = hash.canBicycle ?? null;
    this.alwaysBicycle = hash.alwaysBicycle ?? null;
    this.teleportDestination = hash.teleportDestination ?? null;
    this.weather = hash.weather ?? null;
    this.townMapPosition = hash.townMapPosition ?? null;
    this.diveMapId = hash.diveMapId ?? null;
    this.darkMap = hash.darkMap ?? null;
    this.safariMap = hash.safariMap ?? null;
    this.snapEdges = hash.snapEdges ?? null;
    this.randomDungeon = hash.randomDungeon ?? null;
    this.battleBackground = hash.battleBackground ?? null;
    this.wildBattleBGM = hash.wildBattleBGM ?? null;
    this.trainerBattleBGM = hash.trainerBattleBGM ?? null;
    this.wildVictoryBGM = hash.wildVictoryBGM ?? null;
    this.trainerVictoryBGM = hash.trainerVictoryBGM ?? null;
    this.wildCaptureME = hash.wildCaptureME ?? null;
    this.townMapSize = hash.townMapSize ?? null;
    this.battleEnvironment = hash.battleEnvironment ?? null;
    this.flags = hash.flags ?? [];
  }

  propertyFromString(str: string): unknown {
    switch (str) {
      case "Name": return this.realName;
      case "Outdoor": return this.outdoorMap;
      case "ShowArea": return this.announceLocation;
      case "Bicycle": return this.canBicycle;
      case "BicycleAlways": return this.alwaysBicycle;
      case "HealingSpot": return this.teleportDestination;
      case "Weather": return this.weather;
      case "MapPosition": return this.townMapPosition;
      case "DiveMap": return this.diveMapId;
      case "DarkMap": return this.darkMap;
      case "SafariMap": return this.safariMap;
      case "SnapEdges": return this.snapEdges;
      case "Dungeon": return this.randomDungeon;
      case "BattleBack": return this.battleBackground;
      case "WildBattleBGM": return this.wildBattleBGM;
      case "TrainerBattleBGM": return this.trainerBattleBGM;
      case "WildVictoryBGM": return this.wildVictoryBGM;
      case "TrainerVictoryBGM": return this.trainerVictoryBGM;
      case "WildCaptureME": return this.wildCaptureME;
      case "MapSize": return this.townMapSize;
      case "Environment": return this.battleEnvironment;
      case "Flags": return this.flags;
    }
    return null;
  }

  /**
   * name: pbGetMapNameFromId(id), i.e. the map's name from MapInfos with
   * \PN replaced. The map name lookup is passed in (MapInfos live in data/store).
   */
  name(mapNameFromId: (id: number) => string): string {
    return mapNameFromId(this.id);
  }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }
}
