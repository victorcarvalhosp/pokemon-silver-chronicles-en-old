// Port of 018_Alternate battle modes/001_Battle Frontier/002_Challenge_Data.rb:
// the challenge object ($PokemonGlobal.challenge), the trainer/Pokémon lists
// (Data/trainer_lists.dat), the entry screen, the event helpers and PBPokemon
// (a Battle Tower/Cup Pokémon set).
//
// Data/trainer_lists.dat is web/data/pbs/trainer-lists.json (compiled from
// PBS/battle_facility_lists.txt by tools/pbs), kept in memory; save_data of
// it (team generation, pbWriteCup) replaces that copy.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { pbLoadTrainerLists, setMiscPBSData } from "../../data/gameData/miscPBSData";
import { Move } from "../../data/gameData/move";
import { Nature } from "../../data/gameData/nature";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { TrainerType } from "../../data/gameData/trainerType";
import type { FacilityPokemon, TrainerList } from "../../data/pbs/types";
import { pbFadeOutIn } from "../../ui/fades";
import { PokemonParty_Scene, PokemonPartyScreen } from "../../ui/party/party";
import { pbResolveBitmap } from "../../ui/rpgCache";
import { rand } from "../../core/random";
import { REAL_RES_X, REAL_RES_Y } from "../GameCharacter";
import { G } from "../globals";
import { Pokemon } from "../pokemon/Pokemon";
import type { Trainer } from "../trainer/Trainer";
import type { Player } from "../trainer/Player";
import { BattleChallenge } from "./battleChallenge";

declare module "../globals" {
  interface PokemonGlobalMetadata {
    /** pbBattleChallenge (BattleChallenge) */
    challenge?: BattleChallenge | null;
  }
}

const player = () => G.player as unknown as Player;

/** A Battle Tower trainer: [trainer type, name, begin speech, win speech, lose speech, Pokémon numbers]. */
export type BTTrainer = [Id, string, string, string, string, number[]];
/** A trainer_lists.dat entry: [trainers, Pokémon, challenge IDs, trainers file, Pokémon file, is default]. */
export type TrainerListData = [BTTrainer[], PBPokemon[], string[], string, string, boolean];

//===============================================================================
//
//===============================================================================
export function pbBattleChallenge(): BattleChallenge {
  if (!G.pokemonGlobal.challenge) G.pokemonGlobal.challenge = new BattleChallenge();
  return G.pokemonGlobal.challenge;
}

export async function pbBattleChallengeBattle(): Promise<boolean> {
  return pbBattleChallenge().pbBattle();
}

/** Used in events */
export function pbHasEligible(..._arg: unknown[]): boolean {
  return pbBattleChallenge().rules.ruleset.hasValidTeam(player().party);
}

//===============================================================================
// Data/trainer_lists.dat
//===============================================================================
let datCache: { source: TrainerList[]; lists: TrainerListData[] } | null = null;

function toListData(list: TrainerList): TrainerListData {
  return [
    list.trainers.map((t): BTTrainer => [t.trainerType!, t.name!, t.beginSpeech!, t.endSpeechWin!, t.endSpeechLose!, t.pokemonNos ?? []]),
    list.pokemon.map((p) => PBPokemon.fromData(p)),
    [...list.challenges], list.trainersFile, list.pokemonFile, list.isDefault,
  ];
}

/** load_data("Data/trainer_lists.dat"): a fresh copy, as Marshal.load gives. */
export function loadTrainerListsDat(): TrainerListData[] {
  return pbLoadTrainerLists().map(toListData);
}

/** save_data(trlists, "Data/trainer_lists.dat") */
export function saveTrainerListsDat(trlists: TrainerListData[]): void {
  setMiscPBSData({
    trainerLists: trlists.map((tr) => ({
      trainers: tr[0].map((t) => ({
        trainerType: t[0], name: t[1], beginSpeech: t[2], endSpeechWin: t[3], endSpeechLose: t[4], pokemonNos: t[5],
      })),
      pokemon: tr[1].map((p) => p.toData()),
      challenges: [...tr[2]],
      trainersFile: tr[3],
      pokemonFile: tr[4],
      isDefault: tr[5],
    })),
  });
}

/** The lists as loaded (read-only uses only; reloaded when the data changes). */
function trainerLists(): TrainerListData[] {
  const source = pbLoadTrainerLists();
  if (!datCache || datCache.source !== source) datCache = { source, lists: source.map(toListData) };
  return datCache.lists;
}

export function pbGetBTTrainers(challengeID: unknown): BTTrainer[] {
  const trlists = trainerLists();
  for (const tr of trlists) if (!tr[5] && tr[2].includes(challengeID as string)) return tr[0];
  for (const tr of trlists) if (tr[5]) return tr[0]; // is default list
  return [];
}

export function pbGetBTPokemon(challengeID: unknown): PBPokemon[] {
  const trlists = trainerLists();
  for (const tr of trlists) if (!tr[5] && tr[2].includes(challengeID as string)) return tr[1];
  for (const tr of trlists) if (tr[5]) return tr[1]; // is default list
  return [];
}

//===============================================================================
//
//===============================================================================
export async function pbEntryScreen(..._arg: unknown[]): Promise<boolean> {
  let retval = false;
  await pbFadeOutIn(async () => {
    const scene = new PokemonParty_Scene();
    const screen = new PokemonPartyScreen(scene, player().party);
    const ret = await screen.pbPokemonMultipleEntryScreenEx(pbBattleChallenge().rules.ruleset);
    // Set party
    if (ret) pbBattleChallenge().setParty(ret);
    // Continue (return true) if Pokémon were chosen
    retval = !!ret && ret.length > 0;
  });
  return retval;
}

//===============================================================================
//
//===============================================================================
/** Game_Player#moveto2(x, y): moves the player without the usual moveto effects. */
export function gamePlayerMoveto2(gamePlayer: unknown, x: number, y: number): void {
  const p = gamePlayer as { x: number; y: number; realX: number; realY: number; prelockDirection: number };
  p.x = x;
  p.y = y;
  p.realX = p.x * REAL_RES_X;
  p.realY = p.y * REAL_RES_Y;
  p.prelockDirection = 0;
}

//===============================================================================
//
//===============================================================================
/** Game_Event#pbInChallenge? (script switch "s:pbInChallenge?") */
export function pbInChallenge(): boolean {
  return pbBattleChallenge().pbInChallenge();
}

//===============================================================================
//
//===============================================================================
export function pbBattleChallengeGraphic(event: { characterName: string }): void {
  const nextTrainer = pbBattleChallenge().nextTrainer;
  const bttrainers = pbGetBTTrainers(pbBattleChallenge().currentChallenge);
  let filename = TrainerType.charsetFilenameBrief(bttrainers[nextTrainer as number]?.[0] ?? (null as unknown as Id), pbResolveBitmap);
  // (Ruby: AnimatedBitmap.new raising for a missing file falls back to "NPC 01".)
  if (!filename) filename = "NPC 01";
  event.characterName = pbResolveBitmap(`Graphics/Characters/${filename}`) ? filename : "NPC 01";
}

export function pbBattleChallengeBeginSpeech(): string {
  if (!pbBattleChallenge().pbInProgress()) return "...";
  const bttrainers = pbGetBTTrainers(pbBattleChallenge().currentChallenge);
  const tr = bttrainers[pbBattleChallenge().nextTrainer as number];
  return tr ? tr[2] : "..."; // pbGetMessageFromHash(MessageTypes::BeginSpeech, tr[2])
}

//===============================================================================
//
//===============================================================================
export class PBPokemon {
  species: Id;
  item: Id | null;
  nature: Id | null;
  move1: Id | null;
  move2: Id | null;
  move3: Id | null;
  move4: Id | null;
  ev: Id[];

  /** This method is how each Pokémon is compiled from the PBS files listing Battle Tower/Cup Pokémon. */
  static fromInspected(str: string): PBPokemon {
    const insp = str.replace(/^\s+/gm, "").replace(/\s+$/gm, "");
    const pieces = insp.split(/\s*;\s*/);
    const species = Species.exists(pieces[0]) ? Species.get(pieces[0]!).id : null;
    const item = Item.exists(pieces[1]) ? Item.get(pieces[1]!).id : null;
    const nature = Nature.exists(pieces[2]) ? Nature.get(pieces[2]!).id : null;
    const ev = pieces[3]!.split(/\s*,\s*/);
    const evArray: Id[] = [];
    for (const stat of ev) {
      switch (stat.toUpperCase()) {
        case "HP": evArray.push("HP"); break;
        case "ATK": evArray.push("ATTACK"); break;
        case "DEF": evArray.push("DEFENSE"); break;
        case "SA": case "SPATK": evArray.push("SPECIAL_ATTACK"); break;
        case "SD": case "SPDEF": evArray.push("SPECIAL_DEFENSE"); break;
        case "SPD": evArray.push("SPEED"); break;
      }
    }
    const moves = pieces[4]!.split(/\s*,\s*/);
    const moveid: Id[] = [];
    for (let i = 0; i < Pokemon.MAX_MOVES; i++) {
      const moveData = Move.tryGet(moves[i] || null);
      if (moveData) moveid.push(moveData.id);
    }
    if (moveid.length === 0) moveid.push(Move.keys()[0]!); // Get any one move
    return new PBPokemon(species!, item, nature, moveid[0]!, moveid[1] ?? null, moveid[2] ?? null, moveid[3] ?? null, evArray);
  }

  static fromPokemon(pkmn: Pokemon): PBPokemon {
    const mov1 = pkmn.moves[0] ? pkmn.moves[0].id : null;
    const mov2 = pkmn.moves[1] ? pkmn.moves[1].id : null;
    const mov3 = pkmn.moves[2] ? pkmn.moves[2].id : null;
    const mov4 = pkmn.moves[3] ? pkmn.moves[3].id : null;
    const evArray: Id[] = [];
    for (const s of Stat.eachMain()) if (pkmn.ev[s.id]! > 60) evArray.push(s.id);
    return new PBPokemon(pkmn.species, pkmn.itemId, pkmn.natureId, mov1, mov2, mov3, mov4, evArray);
  }

  /** A compiled trainer-lists.json entry (what Marshal.load gives for the .dat). */
  static fromData(data: FacilityPokemon): PBPokemon {
    return new PBPokemon(data.species!, data.item, data.nature, data.move1, data.move2, data.move3, data.move4, [...data.ev]);
  }

  toData(): FacilityPokemon {
    return {
      species: this.species, item: this.item, nature: this.nature,
      move1: this.move1, move2: this.move2, move3: this.move3, move4: this.move4, ev: [...this.ev],
    };
  }

  constructor(species: Id, item: Id | null, nature: Id | null, move1: Id | null, move2: Id | null, move3: Id | null, move4: Id | null, ev: Id[]) {
    this.species = species;
    const itm = Item.tryGet(item);
    this.item = itm ? itm.id : null;
    this.nature = nature;
    this.move1 = move1;
    this.move2 = move2;
    this.move3 = move3;
    this.move4 = move4;
    this.ev = ev;
  }

  /**
   * NOTE (Ruby parity): @ev holds stat symbols, which have no real_name_brief
   * (NoMethodError for any Pokémon with EVs, 002_Challenge_Data.rb:173).
   */
  inspect(): string {
    const c1 = Species.get(this.species).id;
    const c2 = this.item ? Item.get(this.item).id : "";
    const c3 = this.nature ? Nature.get(this.nature).id : "";
    const evlist = "";
    if (this.ev.length > 0) throw new Error(`undefined method \`real_name_brief' for :${this.ev[0]}:Symbol`);
    const c4 = this.move1 ? Move.get(this.move1).id : "";
    const c5 = this.move2 ? Move.get(this.move2).id : "";
    const c6 = this.move3 ? Move.get(this.move3).id : "";
    const c7 = this.move4 ? Move.get(this.move4).id : "";
    return `${c1};${c2};${c3};${evlist};${c4},${c5},${c6},${c7}`;
  }

  /** Unused. ("#{ev}" is Array#inspect.) */
  tocompact(): string {
    const s = (v: Id | null) => v ?? "";
    return `${this.species},${s(this.item)},${s(this.nature)},${s(this.move1)},${s(this.move2)},${s(this.move3)},${s(this.move4)},` +
      `[${this.ev.map((e) => `:${e}`).join(", ")}]`;
  }

  convertMove(move: Id): Id {
    if (move === "RETURN" && Move.exists("FRUSTRATION")) move = "FRUSTRATION";
    return move;
  }

  createPokemon(level: number, iv: number, trainer: Trainer | null): Pokemon {
    const pkmn = new Pokemon(this.species, level, trainer, false);
    pkmn.item = this.item;
    pkmn.personalID = (rand(2 ** 16) | (rand(2 ** 16) << 16)) >>> 0;
    pkmn.nature = this.nature;
    pkmn.happiness = 0;
    pkmn.moves.push(new Pokemon.Move(this.convertMove(this.move1!)));
    if (this.move2) pkmn.moves.push(new Pokemon.Move(this.convertMove(this.move2)));
    if (this.move3) pkmn.moves.push(new Pokemon.Move(this.convertMove(this.move3)));
    if (this.move4) pkmn.moves.push(new Pokemon.Move(this.convertMove(this.move4)));
    if (this.ev.length > 0) {
      for (const stat of this.ev) pkmn.ev[stat] = Math.floor(Pokemon.EV_LIMIT / this.ev.length);
    }
    for (const s of Stat.eachMain()) pkmn.iv[s.id] = iv;
    pkmn.calcStats();
    return pkmn;
  }
}
