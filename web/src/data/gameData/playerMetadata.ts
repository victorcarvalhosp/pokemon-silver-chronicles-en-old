// Port of Data/Scripts/010_Data/002_PBS data/017_PlayerMetadata.rb.

import type { MapCoordsFacing, PlayerMetadataData } from "../pbs/types";
import { type Id, NumberData } from "./gameData";

export class PlayerMetadata extends NumberData {
  static DATA = new Map<number, PlayerMetadata>();
  readonly id: number;
  readonly trainerType: Id | null;
  readonly walkCharset: string | null;
  private readonly _runCharset: string | null;
  private readonly _cycleCharset: string | null;
  private readonly _surfCharset: string | null;
  private readonly _diveCharset: string | null;
  private readonly _fishCharset: string | null;
  private readonly _surfFishCharset: string | null;
  readonly home: MapCoordsFacing | null;

  /** get(player_id = 1): falls back to player 1. */
  static get(playerId = 1): PlayerMetadata {
    return PlayerMetadata.DATA.get(playerId) ?? PlayerMetadata.DATA.get(1)!;
  }

  constructor(hash: Partial<PlayerMetadataData> & { id: number }) {
    super();
    this.id = hash.id;
    this.trainerType = hash.trainerType ?? null;
    this.walkCharset = hash.walkCharset ?? null;
    this._runCharset = hash.runCharset ?? null;
    this._cycleCharset = hash.cycleCharset ?? null;
    this._surfCharset = hash.surfCharset ?? null;
    this._diveCharset = hash.diveCharset ?? null;
    this._fishCharset = hash.fishCharset ?? null;
    this._surfFishCharset = hash.surfFishCharset ?? null;
    this.home = hash.home ?? null;
  }

  get runCharset(): string | null { return this._runCharset || this.walkCharset; }
  get cycleCharset(): string | null { return this._cycleCharset || this.runCharset; }
  get surfCharset(): string | null { return this._surfCharset || this.cycleCharset; }
  get diveCharset(): string | null { return this._diveCharset || this.surfCharset; }
  get fishCharset(): string | null { return this._fishCharset || this.walkCharset; }
  get surfFishCharset(): string | null { return this._surfFishCharset || this.fishCharset; }

  propertyFromString(str: string): unknown {
    switch (str) {
      case "TrainerType": return this.trainerType;
      case "WalkCharset": return this.walkCharset;
      case "RunCharset": return this._runCharset;
      case "CycleCharset": return this._cycleCharset;
      case "SurfCharset": return this._surfCharset;
      case "DiveCharset": return this._diveCharset;
      case "FishCharset": return this._fishCharset;
      case "SurfFishCharset": return this._surfFishCharset;
      case "Home": return this.home;
    }
    return null;
  }
}
