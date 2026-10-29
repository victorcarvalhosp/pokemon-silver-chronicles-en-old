// Port of Data/Scripts/010_Data/002_PBS data/016_Metadata.rb.

import type { MapCoordsFacing, MetadataData } from "../pbs/types";
import { NumberData } from "./gameData";

export class Metadata extends NumberData {
  static DATA = new Map<number, Metadata>();
  readonly id: number;
  readonly startMoney: number;
  readonly startItemStorage: string[];
  readonly home: MapCoordsFacing | null;
  readonly realStorageCreator: string | null;
  readonly wildBattleBGM: string | null;
  readonly trainerBattleBGM: string | null;
  readonly wildVictoryBGM: string | null;
  readonly trainerVictoryBGM: string | null;
  readonly wildCaptureME: string | null;
  readonly surfBGM: string | null;
  readonly bicycleBGM: string | null;

  /** GameData::Metadata.get: the one global metadata record. */
  static get(): Metadata {
    return Metadata.DATA.get(0)!;
  }

  constructor(hash: Partial<MetadataData> & { id: number }) {
    super();
    this.id = hash.id;
    this.startMoney = hash.startMoney ?? 3000;
    this.startItemStorage = hash.startItemStorage ?? [];
    this.home = hash.home ?? null;
    this.realStorageCreator = hash.storageCreator ?? null;
    this.wildBattleBGM = hash.wildBattleBGM ?? null;
    this.trainerBattleBGM = hash.trainerBattleBGM ?? null;
    this.wildVictoryBGM = hash.wildVictoryBGM ?? null;
    this.trainerVictoryBGM = hash.trainerVictoryBGM ?? null;
    this.wildCaptureME = hash.wildCaptureME ?? null;
    this.surfBGM = hash.surfBGM ?? null;
    this.bicycleBGM = hash.bicycleBGM ?? null;
  }

  /** storage_creator: the translated StorageCreator, or "Bill". */
  get storageCreator(): string {
    const ret = this.realStorageCreator;
    return !ret ? "Bill" : ret;
  }

  propertyFromString(str: string): unknown {
    switch (str) {
      case "StartMoney": return this.startMoney;
      case "StartItemStorage": return this.startItemStorage;
      case "Home": return this.home;
      case "StorageCreator": return this.realStorageCreator;
      case "WildBattleBGM": return this.wildBattleBGM;
      case "TrainerBattleBGM": return this.trainerBattleBGM;
      case "WildVictoryBGM": return this.wildVictoryBGM;
      case "TrainerVictoryBGM": return this.trainerVictoryBGM;
      case "WildCaptureME": return this.wildCaptureME;
      case "SurfBGM": return this.surfBGM;
      case "BicycleBGM": return this.bicycleBGM;
    }
    return null;
  }
}
