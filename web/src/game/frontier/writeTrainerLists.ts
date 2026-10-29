// Port of Compiler.write_trainer_lists, write_battle_tower_trainers and
// write_battle_tower_pokemon (021_Compiler/003_Compiler_WritePBS.rb:699-806):
// saving Data/trainer_lists.dat (here challengeData's copy) as PBS files, which
// team generation and pbWriteCup do. Written with the PBS writer helpers of
// src/compiler/Compiler.ts (through the dev server's file endpoint).

import { _INTL } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move } from "../../data/gameData/move";
import { Nature } from "../../data/gameData/nature";
import { Species } from "../../data/gameData/species";
import {
  PbsFile, pbWriteCsvRecord, processPbsFileMessageEnd, runWriteSteps, type Schema, UPDATE, type WriteSteps,
  writePbsFileMessageStart,
} from "../../compiler/Compiler";
import { type BTTrainer, loadTrainerListsDat, type PBPokemon } from "./challengeData";

/** add_PBS_header_to_file(file) */
function addPBSHeaderToFile(file: PbsFile): void {
  file.write("﻿");
  file.write("# " + _INTL("See the documentation on the wiki to learn how to edit this file.") + "\r\n");
}

function* writeTrainerListsSteps(path = "PBS/battle_facility_lists.txt"): WriteSteps {
  const trainerlists = loadTrainerListsDat();
  if (!trainerlists) return;
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  for (const tr of trainerlists) {
    yield () => console.log("."); // echo "."
    f.write("#-------------------------------\r\n");
    f.write((tr[5] ? "[DefaultTrainerList]" : "[TrainerList]") + "\r\n");
    f.write("Trainers = " + tr[3] + "\r\n");
    f.write("Pokemon = " + tr[4] + "\r\n");
    if (!tr[5]) f.write("Challenges = " + tr[2].join(",") + "\r\n");
    yield* writeBattleTowerTrainers(tr[0], "PBS/" + tr[3]);
    yield* writeBattleTowerPokemon(tr[1], "PBS/" + tr[4]);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

/** Save Battle Tower trainer data to PBS file */
function* writeBattleTowerTrainers(bttrainers: BTTrainer[] | null, filename: string | null): WriteSteps {
  if (!bttrainers || !filename) return;
  const btTrainersRequiredTypes: Record<string, Schema> = {
    Type: [0, "e", null], // Specifies a trainer
    Name: [1, "s"],
    BeginSpeech: [2, "s"],
    EndSpeechWin: [3, "s"],
    EndSpeechLose: [4, "s"],
    PokemonNos: [5, "*u"],
  };
  const f = new PbsFile(filename);
  addPBSHeaderToFile(f);
  for (let i = 0; i < bttrainers.length; i++) {
    if (!bttrainers[i]) continue;
    f.write("#-------------------------------\r\n");
    f.write(`[${String(i).padStart(3, "0")}]\r\n`);
    for (const key of Object.keys(btTrainersRequiredTypes)) {
      const schema = btTrainersRequiredTypes[key]!;
      const record = bttrainers[i]![schema[0] as number];
      if (record == null) continue;
      f.write(`${key} = `);
      switch (key) {
        case "Type":
          f.write(String(record));
          break;
        case "PokemonNos":
          f.write((record as number[]).join(",")); // pbWriteCsvRecord somehow won't work here
          break;
        default:
          pbWriteCsvRecord(record, f, schema);
      }
      f.write("\r\n");
    }
  }
  yield f;
  yield UPDATE;
}

/** Save Battle Tower Pokémon data to PBS file */
function* writeBattleTowerPokemon(btpokemon: PBPokemon[] | null, filename: string | null): WriteSteps {
  if (!btpokemon || !filename) return;
  const evs: Record<string, string> = {
    HP: "HP",
    ATTACK: "ATK",
    DEFENSE: "DEF",
    SPECIAL_ATTACK: "SA",
    SPECIAL_DEFENSE: "SD",
    SPEED: "SPD",
  };
  const f = new PbsFile(filename);
  addPBSHeaderToFile(f);
  f.write("#-------------------------------\r\n");
  for (let i = 0; i < btpokemon.length; i++) {
    if (i % 500 === 0) yield UPDATE;
    const pkmn = btpokemon[i]!;
    const c1 = Species.get(pkmn.species).species;
    let c2: string | null = null;
    if (pkmn.item && Item.exists(pkmn.item)) c2 = Item.get(pkmn.item).id;
    const c3 = Nature.get(pkmn.nature!).id;
    const evlist = pkmn.ev.map((stat) => evs[stat] ?? "").join(",");
    const c = ["", "", "", ""];
    [pkmn.move1, pkmn.move2, pkmn.move3, pkmn.move4].forEach((move, j) => {
      if (move) c[j] = Move.get(move).id;
    });
    f.write(`${c1};${c2 ?? ""};${c3};${evlist};${c[0]},${c[1]},${c[2]},${c[3]}\r\n`);
  }
  yield f;
  yield UPDATE;
}

export const Compiler = {
  /** Compiler.write_trainer_lists */
  async writeTrainerLists(path?: string): Promise<void> {
    await runWriteSteps(writeTrainerListsSteps(path));
  },

  /** The files write_trainer_lists would write (path -> text), without writing them. */
  writeTrainerListsSteps,
};
