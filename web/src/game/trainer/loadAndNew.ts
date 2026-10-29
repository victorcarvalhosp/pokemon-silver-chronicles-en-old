// Port of Data/Scripts/015_Trainers and player/002_Trainer_LoadAndNew.rb.
// Outside Debug mode pbTrainerCheck/pbTrainerTypeCheck just return true and
// pbMissingTrainer raises; in Debug mode they offer to create the missing
// trainer (pbNewTrainer), saving PBS/trainers.txt through the dev server's
// file endpoint. The UI they need is imported lazily: this module is loaded
// by the battle code long before any window exists.

import { DEBUG } from "../../core/debug";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
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

/** pbNewTrainer(tr_type, tr_name, tr_version, save_changes = true): asks for a party and adds the trainer. */
export async function pbNewTrainer(trType: Id, trName: string, trVersion: number, saveChanges = true): Promise<[Id, string, unknown[], [Id, number][], number]> {
  const { pbMessage, pbConfirmMessage, pbMessageChooseNumber, ChooseNumberParams } = await import("../../ui/messages");
  const { pbChooseSpeciesList } = await import("../../debug/EditorUtilities");
  const party: [Id, number][] = [];
  for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
    if (i === 0) {
      await pbMessage(_INTL("Please enter the first Pokémon.", i));
    } else if (!(await pbConfirmMessage(_INTL("Add another Pokémon?")))) {
      break;
    }
    for (;;) {
      const species = await pbChooseSpeciesList();
      if (species) {
        const params = new ChooseNumberParams();
        params.setRange(1, GrowthRate.maxLevel());
        params.setDefaultValue(10);
        const level = await pbMessageChooseNumber(_INTL(`Set the level for {1} (max. ${params.maxNumber}).`,
          Species.get(species).name), params);
        party.push([species, level]);
        break;
      } else {
        if (i > 0) break;
        await pbMessage(_INTL("This trainer must have at least 1 Pokémon!"));
      }
    }
  }
  const trainer: [Id, string, unknown[], [Id, number][], number] = [trType, trName, [], party, trVersion];
  if (saveChanges) {
    const trainerHash = {
      trainerType: trType,
      name: trName,
      version: trVersion,
      pokemon: party.map(([species, level]) => ({ species, level })),
      id: [trType, trName, trVersion] as [Id, string, number],
    };
    // Add trainer's data to records
    TrainerData.register(trainerHash as unknown as Parameters<typeof TrainerData.register>[0]);
    // GameData::Trainer.save: the compiled data lives in memory until the next `pnpm pbs`.
    await pbConvertTrainerData();
    await pbMessage(_INTL("The Trainer's data was added to the list of battles and in PBS/trainers.txt."));
  }
  return trainer;
}

/** pbConvertTrainerData: rewrites PBS/trainer_types.txt and PBS/trainers.txt (MessageTypes aren't ported). */
export async function pbConvertTrainerData(): Promise<void> {
  const { Compiler } = await import("../../compiler/WritePBS");
  const { devWriteOrExplain } = await import("../../debug/devFiles");
  await devWriteOrExplain("PBS/trainer_types.txt", () => Compiler.writeTrainerTypes());
  await devWriteOrExplain("PBS/trainers.txt", () => Compiler.writeTrainers());
}

/** pbTrainerTypeCheck(trainer_type): always true outside Debug mode. */
export async function pbTrainerTypeCheck(trainerType: Id): Promise<boolean> {
  if (!DEBUG) return true;
  if (TrainerType.exists(trainerType)) return true;
  const { pbConfirmMessage } = await import("../../ui/messages");
  if (await pbConfirmMessage(_INTL("Add new trainer type {1}?", String(trainerType)))) {
    const { openEditorScreen } = await import("../../debug/editorScreens");
    await openEditorScreen("pbTrainerTypeEditorNew", String(trainerType));
  }
  const { pbMapInterpreter } = await import("../Interpreter");
  pbMapInterpreter()?.commandEnd();
  return false;
}

/** pbTrainerCheck(tr_type, tr_name, max_battles, tr_version = 0): called from trainer events to ensure the trainer exists. */
export async function pbTrainerCheck(trType: Id, trName: string, maxBattles: number, trVersion = 0): Promise<boolean> {
  if (!DEBUG) return true;
  // Check for existence of trainer type
  await pbTrainerTypeCheck(trType);
  const trTypeData = TrainerType.tryGet(trType);
  if (!trTypeData) return false;
  trType = trTypeData.id;
  // Check for existence of trainer with given ID number
  if (TrainerData.exists(trType, trName, trVersion)) return true;
  // Add new trainer
  const { pbConfirmMessage } = await import("../../ui/messages");
  if (await pbConfirmMessage(_INTL("Add new trainer variant {1} (of {2}) for {3} {4}?",
    trVersion, maxBattles, String(trType), trName))) {
    await pbNewTrainer(trType, trName, trVersion);
  }
  return true;
}

/** pbGetFreeTrainerParty(tr_type, tr_name): the first unused version number, or -1. */
export function pbGetFreeTrainerParty(trType: Id, trName: string): number {
  const trTypeData = TrainerType.tryGet(trType);
  if (!trTypeData) throw new Error(_INTL("Trainer type {1} does not exist.", trType));
  for (let i = 0; i < 256; i++) if (!TrainerData.tryGet(trTypeData.id, trName, i)) return i;
  return -1;
}

/**
 * pbMissingTrainer(tr_type, tr_name, tr_version): outside Debug mode this
 * raises; in Debug mode it offers to create the trainer (0 = Yes, 1 = No).
 */
export async function pbMissingTrainer(trType: Id, trName: string, trVersion: number): Promise<number> {
  const trTypeData = TrainerType.tryGet(trType);
  if (!trTypeData) throw new Error(_INTL("Trainer type {1} does not exist.", trType));
  trType = trTypeData.id;
  if (!DEBUG) throw new Error(_INTL("Can't find trainer ({1}, {2}, ID {3})", String(trType), trName, trVersion));
  let message = "";
  if (trVersion === 0) {
    message = _INTL("Add new trainer ({1}, {2})?", String(trType), trName);
  } else {
    message = _INTL("Add new trainer ({1}, {2}, ID {3})?", String(trType), trName, trVersion);
  }
  const { pbMessage } = await import("../../ui/messages");
  const cmd = await pbMessage(message, [_INTL("Yes"), _INTL("No")], 2);
  if (cmd === 0) await pbNewTrainer(trType, trName, trVersion);
  return cmd;
}
