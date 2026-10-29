// Port of Data/Scripts/014_Pokemon/005_Pokemon_Owner.rb (Pokemon::Owner).

import { G } from "../globals";
import type { Trainer } from "../trainer/Trainer";

export interface PokemonOwnerJSON {
  id: number;
  name: string;
  gender: number;
  language: number;
}

export class PokemonOwner {
  /** The owner's trainer ID (32-bit unsigned). */
  id: number;
  name: string;
  /** 0 = male, 1 = female, 2 = unknown. */
  gender: number;
  language: number;

  constructor(id: number, name: string, gender: number, language: number) {
    this.id = id;
    this.name = name;
    this.gender = gender;
    this.language = language;
  }

  /** new_from_trainer(trainer) */
  static newFromTrainer(trainer: Trainer): PokemonOwner {
    return new PokemonOwner(trainer.id, trainer.name, trainer.gender, trainer.language);
  }

  /** new_foreign(name = "", gender = 2, language = 2): an owner with a new ID that isn't the player's. */
  static newForeign(name = "", gender = 2, language = 2): PokemonOwner {
    const player = G.player as unknown as Trainer;
    return new PokemonOwner(player.makeForeignID(), name, gender, language);
  }

  /** public_id: the 5-digit ID shown on the Trainer Card. */
  publicId(): number {
    return this.id & 0xFFFF;
  }

  clone(): PokemonOwner {
    return new PokemonOwner(this.id, this.name, this.gender, this.language);
  }

  toJSON(): PokemonOwnerJSON {
    return { id: this.id, name: this.name, gender: this.gender, language: this.language };
  }

  static fromJSON(json: PokemonOwnerJSON): PokemonOwner {
    return new PokemonOwner(json.id, json.name, json.gender, json.language);
  }
}
