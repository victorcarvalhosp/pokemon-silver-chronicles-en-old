// Port of Data/Scripts/015_Trainers and player/002_Trainer_LoadAndNew.rb,
// without the Debug-mode trainer creation ($DEBUG is false in the release
// game, so pbTrainerCheck/pbTrainerTypeCheck just return true).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Trainer as TrainerData } from "../../data/gameData/trainer";
import { TrainerType } from "../../data/gameData/trainerType";
import type { NPCTrainer } from "./Trainer";

/** pbLoadTrainer(tr_type, tr_name, tr_version = 0): the NPCTrainer with its party, or null. */
export function pbLoadTrainer(trType: Id, trName: string, trVersion = 0): NPCTrainer | null {
  const trTypeData = TrainerType.tryGet(trType);
  if (!trTypeData) throw new Error(_INTL("Trainer type {1} does not exist.", trType));
  const trainerData = TrainerData.tryGet(trTypeData.id, trName, trVersion);
  return trainerData ? trainerData.toTrainer() : null;
}

/** pbTrainerTypeCheck: always true outside Debug mode. */
export function pbTrainerTypeCheck(_trainerType: Id): boolean {
  return true;
}

/** pbTrainerCheck: always true outside Debug mode. */
export function pbTrainerCheck(_trType: Id, _trName: string, _maxBattles: number, _trVersion = 0): boolean {
  return true;
}

/** pbGetFreeTrainerParty(tr_type, tr_name): the first unused version number, or -1. */
export function pbGetFreeTrainerParty(trType: Id, trName: string): number {
  const trTypeData = TrainerType.tryGet(trType);
  if (!trTypeData) throw new Error(_INTL("Trainer type {1} does not exist.", trType));
  for (let i = 0; i < 256; i++) if (!TrainerData.tryGet(trTypeData.id, trName, i)) return i;
  return -1;
}

/** pbMissingTrainer: outside Debug mode this raises. */
export function pbMissingTrainer(trType: Id, trName: string, trVersion: number): never {
  const trTypeData = TrainerType.tryGet(trType);
  if (!trTypeData) throw new Error(_INTL("Trainer type {1} does not exist.", trType));
  throw new Error(_INTL("Can't find trainer ({1}, {2}, ID {3})", trTypeData.id, trName, trVersion));
}
