// Port of 018_Alternate battle modes/003_Battle Frontier generator/001_ChallengeGenerator_Data.rb:
// generating a challenge's teams (random Pokémon, simulated battles, ranking
// by rating) and its trainer list, and pbWriteCup (the $DEBUG prompt that
// starts it when a challenge is set).
//
// The generator's working files (tag.rxdata, tag_teams.rxdata) are kept in
// memory (generatorFiles); Data/trainer_lists.dat is challengeData's copy, and
// Compiler.write_trainer_lists writes the PBS files through the dev server.

import { DEBUG } from "../../core/debug";
import { _INTL } from "../../data/gameData/gameData";
import { Stat } from "../../data/gameData/stat";
import { Graphics } from "../../rgss/Graphics";
import { pbConfirmMessage, pbMessage, pbMessageDisplay } from "../../ui/messages";
import { pbCreateMessageWindow, pbDisposeMessageWindow } from "../../ui/speechBubble";
import { rand } from "../../core/random";
import { Pokemon } from "../pokemon/Pokemon";
import { pbRuledBattle, RuledTeam } from "./battleSim";
import { loadTrainerListsDat, pbGetBTPokemon, saveTrainerListsDat } from "./challengeData";
import { PokemonChallengeRules } from "./challengeRules";
import { baseStatTotal, pbRandomPokemonFromRule } from "./generatorPokemon";
import { pbTrainerInfo } from "./generatorTrainers";
import type { PokemonRule } from "./rulesets";
import { Compiler } from "./writeTrainerLists";

/** load_data / save_data of the generator's working files (tag + ".rxdata", tag + "_teams.rxdata"). */
export const generatorFiles = new Map<string, unknown>();

/** A pbGenerateChallenge progress callback (Ruby's block): a message, or nil to just let the screen update. */
export type GeneratorBlock = (message: string | null) => void | Promise<void>;

//===============================================================================
//
//===============================================================================
export class BaseStatRestriction implements PokemonRule {
  private mn: number;
  private mx: number;

  constructor(mn: number, mx: number) {
    this.mn = mn;
    this.mx = mx;
  }

  isValid(pkmn: Pokemon): boolean {
    const bst = baseStatTotal(pkmn.species);
    return bst >= this.mn && bst <= this.mx;
  }
}

//===============================================================================
//
//===============================================================================
export class NonlegendaryRestriction implements PokemonRule {
  isValid(pkmn: Pokemon): boolean {
    if (!pkmn.genderless()) return true;
    if (pkmn.speciesData().eggGroups.includes("Undiscovered")) return false;
    return true;
  }
}

//===============================================================================
//
//===============================================================================
export class InverseRestriction implements PokemonRule {
  private r: PokemonRule;

  constructor(r: PokemonRule) {
    this.r = r;
  }

  isValid(pkmn: Pokemon): boolean {
    return !this.r.isValid(pkmn);
  }
}

//===============================================================================
//
//===============================================================================
// [3/10]
// 0-266 - 0-500
// [106]
// 267-372 - 380-500
// [95]
// 373-467 - 400-555 (nonlegendary)
// 468-563 - 400-555 (nonlegendary)
// 564-659 - 400-555 (nonlegendary)
// 660-755 - 400-555 (nonlegendary)
// 756-799 - 580-600 [legendary] (compat1==15 or compat2==15, genderbyte=255)
// 800-849 - 500-
// 850-881 - 580-

export function withRestr(_rule: unknown, minbs: number, maxbs: number, legendary: number): PokemonChallengeRules {
  const ret = new PokemonChallengeRules().addPokemonRule(new BaseStatRestriction(minbs, maxbs));
  switch (legendary) {
    case 0:
      ret.addPokemonRule(new NonlegendaryRestriction());
      break;
    case 1:
      ret.addPokemonRule(new InverseRestriction(new NonlegendaryRestriction()));
      break;
  }
  return ret;
}

export function pbArrangeByTier(pokemonlist: Pokemon[], rule: PokemonChallengeRules): Pokemon[] {
  const tiers = [
    withRestr(rule, 0, 500, 0),
    withRestr(rule, 380, 500, 0),
    withRestr(rule, 400, 555, 0),
    withRestr(rule, 400, 555, 0),
    withRestr(rule, 400, 555, 0),
    withRestr(rule, 400, 555, 0),
    withRestr(rule, 580, 680, 1),
    withRestr(rule, 500, 680, 0),
    withRestr(rule, 580, 680, 2),
  ];
  const tierPokemon: Pokemon[][] = [];
  for (let i = 0; i < tiers.length; i++) tierPokemon.push([]);
  // Sort each Pokémon into tiers. Which tier a Pokémon is put in deoends on the
  // Pokémon's position within pokemonlist (later = higher tier). pokemonlist is
  // already roughly arranged by rank from weakest to strongest.
  for (let i = 0; i < pokemonlist.length; i++) {
    if (!rule.ruleset.isPokemonValid(pokemonlist[i])) continue;
    const validtiers: number[] = [];
    for (let j = 0; j < tiers.length; j++) {
      if (tiers[j]!.ruleset.isPokemonValid(pokemonlist[i])) validtiers.push(j);
    }
    if (validtiers.length > 0) {
      const vt = Math.floor(validtiers.length * i / pokemonlist.length);
      tierPokemon[validtiers[vt]!]!.push(pokemonlist[i]!);
    }
  }
  // Now for each tier, sort the Pokemon in that tier by their BST (lowest first).
  // (Ruby's sort! isn't stable: Pokémon of the same species may come out in
  // another order there. This sort keeps them in list order.)
  const ret: Pokemon[] = [];
  for (let i = 0; i < tiers.length; i++) {
    tierPokemon[i]!.sort((a, b) => {
      const bstA = baseStatTotal(a.species);
      const bstB = baseStatTotal(b.species);
      if (bstA === bstB) return a.species < b.species ? -1 : a.species > b.species ? 1 : 0;
      return bstA - bstB;
    });
    ret.push(...tierPokemon[i]!);
  }
  return ret;
}

//===============================================================================
//
//===============================================================================
export function pbReplenishBattlePokemon(party: Pokemon[], rule: PokemonChallengeRules): void {
  while (party.length < 20) {
    const pkmn = pbRandomPokemonFromRule(rule, null);
    let found = false;
    for (const pk of party) {
      if (!isBattlePokemonDuplicate(pkmn, pk)) continue;
      found = true;
      break;
    }
    if (!found) party.push(pkmn);
  }
}

/**
 * NOTE (Ruby parity): `moves1.compact.sort` throws its result away and
 * moves1 always has MAX_MOVES entries (nil for empty slots), so the moves
 * only match in the same order, and any matching moves count as the same set
 * (001_ChallengeGenerator_Data.rb:136-139).
 */
export function isBattlePokemonDuplicate(pk: Pokemon, pk2: Pokemon): boolean {
  if (pk.species !== pk2.species) return false;
  const moves1: (string | null)[] = [];
  const moves2: (string | null)[] = [];
  for (let i = 0; i < Pokemon.MAX_MOVES; i++) {
    moves1.push(pk.moves[i] ? pk.moves[i]!.id : null);
    moves2.push(pk2.moves[i] ? pk2.moves[i]!.id : null);
  }
  // Accept as same if moves are same and there are MAX_MOVES number of moves each
  if (moves1.every((m, i) => m === moves2[i]) && moves1.length === Pokemon.MAX_MOVES) return true;
  let sameEvs = true;
  for (const s of Stat.eachMain()) if (pk.ev[s.id] !== pk2.ev[s.id]) sameEvs = false;
  return pk.itemId === pk2.itemId && pk.natureId === pk2.natureId && sameEvs;
}

export function pbRemoveDuplicates(party: Pokemon[]): Pokemon[] {
  const ret: Pokemon[] = [];
  for (const pk of party) {
    let found = false;
    let count = 0;
    let firstIndex = -1;
    for (let i = 0; i < ret.length; i++) {
      const pk2 = ret[i]!;
      if (isBattlePokemonDuplicate(pk, pk2)) {
        found = true;
        break;
      }
      if (pk.species === pk2.species) {
        if (count === 0) firstIndex = i;
        count += 1;
      }
    }
    if (!found) {
      if (count >= 10) ret.splice(firstIndex, 1);
      ret.push(pk);
    }
  }
  return ret;
}

//===============================================================================
//
//===============================================================================
export async function pbGenerateChallenge(rule: PokemonChallengeRules, tag: string, block: GeneratorBlock): Promise<void> {
  const oldrule = rule;
  await block(_INTL("Preparing to generate teams"));
  rule = rule.copy().setNumber(2);
  await block(null);
  let party = (generatorFiles.get(tag + ".rxdata") as Pokemon[] | undefined) ?? [];
  let teams = (generatorFiles.get(tag + "_teams.rxdata") as RuledTeam[] | undefined) ?? [];
  if (teams.length < 10) {
    const btpokemon = pbGetBTPokemon(tag);
    if (btpokemon && btpokemon.length !== 0) {
      const suggestedLevel = rule.ruleset.suggestedLevel;
      for (const pk of btpokemon) {
        const pkmn = pk.createPokemon(suggestedLevel, 31, null);
        if (rule.ruleset.isPokemonValid(pkmn)) party.push(pkmn);
      }
    }
  }
  await block(null);
  party = pbRemoveDuplicates(party);
  await block(null);
  const maxteams = 600;
  const cutoffrating = 65;
  const toolowrating = 40;
  const iterations = 11;
  for (let iter = 0; iter < iterations; iter++) {
    generatorFiles.set(tag + ".rxdata", party);
    await block(_INTL("Generating teams ({1} of {2})", iter + 1, iterations));
    let i = 0;
    while (i < teams.length) {
      if (i % 10 === 0) await block(null);
      pbReplenishBattlePokemon(party, rule);
      if (teams[i]!.rating < cutoffrating && teams[i]!.totalGames >= 80) {
        teams[i] = new RuledTeam(party, rule);
      } else if (teams[i]!.length < 2) {
        teams[i] = new RuledTeam(party, rule);
      } else if (i >= maxteams) {
        teams.splice(i, 1);
      } else if (teams[i]!.totalGames >= 250) {
        // retire
        for (let j = 0; j < teams[i]!.length; j++) party.push(teams[i]!.at(j)!);
        teams[i] = new RuledTeam(party, rule);
      } else if (teams[i]!.rating < toolowrating) {
        teams[i] = new RuledTeam(party, rule);
      }
      i += 1;
    }
    generatorFiles.set(tag + "_teams.rxdata", teams);
    await block(null);
    while (teams.length < maxteams) {
      if (teams.length % 10 === 0) await block(null);
      pbReplenishBattlePokemon(party, rule);
      teams.push(new RuledTeam(party, rule));
    }
    generatorFiles.set(tag + ".rxdata", party);
    // (Ruby's sort isn't stable; teams with equal ratings may come out in another order there.)
    teams = [...teams].sort((a, b) => b.rating - a.rating);
    await block(_INTL("Simulating battles ({1} of {2})", iter + 1, iterations));
    i = 0;
    for (;;) {
      for (let j = 0; j < teams.length; j++) {
        await block(null);
        let other = j;
        for (let k = 0; k < 5; k++) {
          other = rand(teams.length);
          if (other === j) continue;
        }
        if (other === j) continue;
        await pbRuledBattle(teams[j]!, teams[other]!, rule);
      }
      i += 1;
      let gameCount = 0;
      for (const team of teams) gameCount += team.games;
      await block(null);
      if (Math.floor(gameCount / teams.length) < 12) continue;
      for (const team of teams) team.updateRating();
      break;
    }
    teams.sort((a, b) => b.rating - a.rating);
    generatorFiles.set(tag + "_teams.rxdata", teams);
  }
  party = [];
  await block(null);
  teams.sort((a, b) => a.rating - b.rating);
  for (const team of teams) {
    if (team.rating <= cutoffrating) continue;
    for (let i = 0; i < team.length; i++) party.push(team.at(i)!);
  }
  rule = oldrule;
  await block(null);
  party = pbRemoveDuplicates(party);
  await block(_INTL("Writing results"));
  party = pbArrangeByTier(party, rule);
  await block(null);
  await pbTrainerInfo(party, tag, rule, () => block(null));
  await block(null);
}

//===============================================================================
//
//===============================================================================
export async function pbWriteCup(id: string, rules: PokemonChallengeRules): Promise<void> {
  if (!DEBUG) return;
  const trlists = loadTrainerListsDat();
  const list: string[] = [];
  for (let i = 0; i < trlists.length; i++) {
    const tr = trlists[i]!;
    if (tr[5]) {
      list.push("*" + tr[3].replace(/\.txt$/, ""));
    } else {
      list.push(tr[3].replace(/\.txt$/, ""));
    }
  }
  let cmd = 0;
  if (trlists.length === 0) {
    cmd = await pbMessage(_INTL("Generate Pokémon teams for this challenge?"),
      [_INTL("YES"), _INTL("NO")], 2);
    // NOTE (Ruby parity): canceling (2) is kept as 2, "YES, USE NEW".
    switch (cmd) {
      case 0: cmd = 2; break;
      case 1: cmd = 0; break;
    }
  } else {
    cmd = await pbMessage(_INTL("Generate Pokémon teams for this challenge?"),
      [_INTL("NO"), _INTL("YES, USE EXISTING"), _INTL("YES, USE NEW")], 1);
  }
  if (cmd === 0) return; // No
  switch (cmd) {
    case 1: { // Yes, use existing
      cmd = await pbMessage(_INTL("Choose a challenge."), list, -1);
      if (cmd >= 0) {
        await pbMessage(_INTL("This challenge will use the Pokémon list from {1}.", list[cmd]));
        for (let i = 0; i < trlists.length; i++) {
          const tr = trlists[i]!;
          while (!tr[5] && tr[2].includes(id)) tr[2].splice(tr[2].indexOf(id), 1);
        }
        if (!trlists[cmd]![5]) trlists[cmd]![2].push(id);
        saveTrainerListsDat(trlists);
        await Graphics.update();
        await Compiler.writeTrainerLists();
      }
      return;
    }
    case 2: { // Yes, use new
      if (!await pbConfirmMessage(_INTL("This may take a long time. Are you sure?"))) return;
      const mw = pbCreateMessageWindow();
      let t = Date.now();
      await pbGenerateChallenge(rules, id, async (message) => {
        if (Date.now() - t >= 5000) {
          await Graphics.update();
          t = Date.now();
        }
        if (message) {
          await pbMessageDisplay(mw, message, false);
          await Graphics.update();
          t = Date.now();
        }
      });
      pbDisposeMessageWindow(mw);
      await pbMessage(_INTL("Team generation complete."));
      break;
    }
  }
}
