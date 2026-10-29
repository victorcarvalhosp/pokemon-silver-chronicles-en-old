// Port of Data/Scripts/010_Data/002_PBS data/014_TrainerType.rb.
// The sprite filename helpers take pbResolveBitmap (and the player's outfit)
// as arguments so this module doesn't depend on the asset/UI layer.

import type { TrainerTypeData } from "../pbs/types";
import { type Id, SymbolData, hasFlag } from "./gameData";

type Resolve = (path: string) => string | null;

export class TrainerType extends SymbolData {
  static DATA = new Map<Id, TrainerType>();
  readonly id: Id;
  readonly realName: string;
  /** 0 = male, 1 = female, 2 = unknown/mixed. */
  readonly gender: number;
  readonly baseMoney: number;
  readonly skillLevel: number;
  readonly flags: string[];
  readonly introBGM: string | null;
  readonly battleBGM: string | null;
  readonly victoryBGM: string | null;

  /** check_file */
  static checkFile(trType: Id | TrainerType, path: string, resolve: Resolve, optionalSuffix = "", suffix = ""): string | null {
    const trTypeData = TrainerType.tryGet(trType);
    if (!trTypeData) return null;
    let ret: string;
    if (optionalSuffix) {
      ret = path + trTypeData.id + optionalSuffix + suffix;
      if (resolve(ret)) return ret;
    }
    ret = path + trTypeData.id + suffix;
    return resolve(ret) ? ret : null;
  }

  static charsetFilename(trType: Id, resolve: Resolve): string | null {
    return TrainerType.checkFile(trType, "Graphics/Characters/trainer_", resolve);
  }

  static charsetFilenameBrief(trType: Id, resolve: Resolve): string | null {
    return TrainerType.charsetFilename(trType, resolve)?.replace("Graphics/Characters/", "") ?? null;
  }

  static frontSpriteFilename(trType: Id, resolve: Resolve): string | null {
    return TrainerType.checkFile(trType, "Graphics/Trainers/", resolve);
  }

  /** player_front_sprite_filename ($player.outfit, or 0 with no player). */
  static playerFrontSpriteFilename(trType: Id, resolve: Resolve, outfit = 0): string | null {
    return TrainerType.checkFile(trType, "Graphics/Trainers/", resolve, `_${outfit}`);
  }

  static backSpriteFilename(trType: Id, resolve: Resolve): string | null {
    return TrainerType.checkFile(trType, "Graphics/Trainers/", resolve, "", "_back");
  }

  static playerBackSpriteFilename(trType: Id, resolve: Resolve, outfit = 0): string | null {
    return TrainerType.checkFile(trType, "Graphics/Trainers/", resolve, `_${outfit}`, "_back");
  }

  static mapIconFilename(trType: Id, resolve: Resolve): string | null {
    return TrainerType.checkFile(trType, "Graphics/Pictures/mapPlayer", resolve);
  }

  static playerMapIconFilename(trType: Id, resolve: Resolve, outfit = 0): string | null {
    return TrainerType.checkFile(trType, "Graphics/Pictures/mapPlayer", resolve, `_${outfit}`);
  }

  constructor(hash: Partial<TrainerTypeData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.gender = hash.gender ?? 2;
    this.baseMoney = hash.baseMoney ?? 30;
    this.skillLevel = hash.skillLevel ?? this.baseMoney;
    this.flags = hash.flags ?? [];
    this.introBGM = hash.introBGM ?? null;
    this.battleBGM = hash.battleBGM ?? null;
    this.victoryBGM = hash.victoryBGM ?? null;
  }

  get name(): string { return this.realName; }

  male(): boolean { return this.gender === 0; }
  female(): boolean { return this.gender === 1; }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }
}
