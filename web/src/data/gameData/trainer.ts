// Port of Data/Scripts/010_Data/002_PBS data/015_Trainer.rb, with Essentials
// Deluxe's to_trainer patch ([000] Essentials Patches/Trainer Data.rb) for the
// plugin properties (size, ace, ZUD's Dynamax level / G-Max factor).
//
// Ruby keys trainers by [type, name, version]; here the key is that array
// as JSON.

import type { TrainerData, TrainerPokemon } from "../pbs/types";
import { G } from "../../game/globals";
import { MultipleForms } from "../../game/pokemon/formHandlers";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { NPCTrainer } from "../../game/trainer/Trainer";
import type { Player } from "../../game/trainer/Player";
import type { Id } from "./gameData";
import { Nature } from "./nature";
import { Settings } from "./settings";
import { Species } from "./species";
import { Stat } from "./stat";
import { TrainerType } from "./trainerType";
import { MessageTypes, pbGetMessageFromHash } from "../../core/intl";

const key = (trType: Id, trName: string, trVersion: number) => JSON.stringify([trType, trName, trVersion]);

export class Trainer {
  static DATA = new Map<string, Trainer>();
  readonly id: [Id, string, number];
  readonly trainerType: Id;
  readonly realName: string;
  readonly version: number;
  readonly items: Id[];
  readonly realLoseText: string;
  readonly pokemon: TrainerPokemon[];

  static register(hash: TrainerData): Trainer {
    const obj = new Trainer(hash);
    Trainer.DATA.set(key(...obj.id), obj);
    return obj;
  }

  static exists(trType: Id, trName: string, trVersion = 0): boolean {
    return Trainer.DATA.has(key(trType, trName, trVersion));
  }

  static get(trType: Id, trName: string, trVersion = 0): Trainer {
    const ret = Trainer.DATA.get(key(trType, trName, trVersion));
    if (!ret) throw new Error(`Unknown trainer ${trType} ${trName} ${trVersion}.`);
    return ret;
  }

  static tryGet(trType: Id, trName: string, trVersion = 0): Trainer | null {
    return Trainer.DATA.get(key(trType, trName, trVersion)) ?? null;
  }

  static keys(): [Id, string, number][] {
    return [...Trainer.DATA.values()].map((t) => t.id);
  }

  static each(): Trainer[] {
    return [...Trainer.DATA.values()];
  }

  static count(): number {
    return Trainer.DATA.size;
  }

  constructor(hash: Partial<TrainerData> & { trainerType: Id }) {
    this.trainerType = hash.trainerType;
    this.realName = hash.name ?? "Unnamed";
    this.version = hash.version ?? 0;
    this.id = hash.id ?? [this.trainerType, this.realName, this.version];
    this.items = hash.items ?? [];
    this.realLoseText = hash.loseText ?? "...";
    this.pokemon = (hash.pokemon ?? []).map((p) => ({ ...p }));
    for (const pkmn of this.pokemon) {
      for (const s of Stat.eachMain()) {
        if (pkmn.iv) pkmn.iv[s.id] ??= 0;
        if (pkmn.ev) pkmn.ev[s.id] ??= 0;
      }
    }
  }

  get name(): string { return pbGetMessageFromHash(MessageTypes.TrainerNames, this.realName); }
  get loseText(): string { return pbGetMessageFromHash(MessageTypes.TrainerLoseText, this.realLoseText); }

  /** to_trainer: builds the NPCTrainer and its party (Essentials, then Essentials Deluxe's additions). */
  toTrainer(): NPCTrainer {
    // --- Essentials ---
    let trName = this.name;
    for (const rival of Settings.RIVAL_NAMES) {
      const value = G.gameVariables.get(rival[1]);
      if (rival[0] !== this.trainerType || typeof value !== "string") continue;
      trName = value;
      break;
    }
    const trainer = new NPCTrainer(trName, this.trainerType);
    trainer.id = (G.player as unknown as Player).makeForeignID();
    trainer.items = [...this.items];
    trainer.loseText = this.loseText;
    for (const pkmnData of this.pokemon) {
      const species = Species.get(pkmnData.species).species;
      const pkmn = new Pokemon(species, pkmnData.level, trainer, false);
      trainer.party.push(pkmn);
      if (pkmnData.form != null) {
        if (MultipleForms.hasFunction(species, "getForm")) pkmn.forcedForm = pkmnData.form;
        pkmn.formSimple = pkmnData.form;
      }
      pkmn.item = pkmnData.item ?? null;
      if (pkmnData.moves && pkmnData.moves.length > 0) {
        for (const move of pkmnData.moves) pkmn.learnMove(move);
      } else {
        pkmn.resetMoves();
      }
      pkmn.abilityIndex = pkmnData.abilityIndex ?? 0;
      pkmn.ability = pkmnData.ability ?? null;
      pkmn.gender = pkmnData.gender ?? (trainer.male() ? 0 : 1);
      pkmn.shiny = !!pkmnData.shininess;
      pkmn.superShiny = !!pkmnData.superShininess;
      if (pkmnData.nature) {
        pkmn.nature = pkmnData.nature;
      } else { // Make the nature random but consistent for the same species used by the same trainer type
        const speciesNum = indexOrOne(Species.keys().indexOf(species));
        const trTypeNum = indexOrOne(TrainerType.keys().indexOf(this.trainerType));
        const idx = (speciesNum + trTypeNum) % Nature.count();
        pkmn.nature = Nature.get(Nature.keys()[idx]!).id;
      }
      for (const s of Stat.eachMain()) {
        if (pkmnData.iv) pkmn.iv[s.id] = pkmnData.iv[s.id]!;
        else pkmn.iv[s.id] = Math.min(Math.floor(pkmnData.level / 2), Pokemon.IV_STAT_LIMIT);
        if (pkmnData.ev) pkmn.ev[s.id] = pkmnData.ev[s.id]!;
        else pkmn.ev[s.id] = Math.min(Math.floor((pkmnData.level * 3) / 2), Math.floor(Pokemon.EV_LIMIT / 6));
      }
      if (pkmnData.happiness != null) pkmn.happiness = pkmnData.happiness;
      if (pkmnData.name) pkmn.name = pkmnData.name;
      if (pkmnData.shadowness) {
        pkmn.makeShadow();
        pkmn.updateShadowMoves(true);
        pkmn.shiny = false;
      }
      if (pkmnData.pokeBall) pkmn.pokeBall = pkmnData.pokeBall;
      pkmn.calcStats();
    }
    // --- Essentials Deluxe (only ZUD Mechanics of its plugin list is installed) ---
    trainer.party.forEach((pkmn, i) => {
      const pkmnData = this.pokemon[i]!;
      if (pkmnData.size != null) pkmn.scale = pkmnData.size;
      pkmn.ace = !!pkmnData.trainerAce;
      if (pkmn.shadowPokemon() || pkmnData.nodynamax) {
        pkmn.dynamaxAble = false;
        pkmn.dynamaxLvl = 0;
        pkmn.gmaxFactor = false;
      } else {
        pkmn.dynamaxLvl = pkmnData.dynamaxLvl ?? 0;
        pkmn.gmaxFactor = !!pkmnData.gmaxfactor;
      }
      pkmn.calcStats();
    });
    return trainer;
  }
}

/** Ruby's `keys.index(x) || 1` (nil only when not found; 0 stays 0). */
function indexOrOne(i: number): number {
  return i < 0 ? 1 : i;
}
