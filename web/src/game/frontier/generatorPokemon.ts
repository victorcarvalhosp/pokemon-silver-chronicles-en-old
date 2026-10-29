// Port of 018_Alternate battle modes/003_Battle Frontier generator/002_ChallengeGenerator_Pokemon.rb:
// random Pokémon (species, nature, EVs, item and a moveset) for generating a
// challenge's Pokémon list, with the species/move caches it keeps in globals.

import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move } from "../../data/gameData/move";
import { Nature } from "../../data/gameData/nature";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import type { EvolutionTuple } from "../../data/gameData/species";
import { Pokemon } from "../pokemon/Pokemon";
import type { Trainer } from "../trainer/Trainer";
import { PBPokemon } from "./challengeData";
import type { PokemonChallengeRules } from "./challengeRules";
import { sample } from "./chooseFoes";

/** $baseStatTotal, $babySpecies, $minimumLevel, $evolutions, $legalMoves, $legalMovesLevel, $tmMoves */
export const generatorCaches = {
  baseStatTotal: {} as Record<Id, number>,
  babySpecies: {} as Record<Id, Id>,
  minimumLevel: {} as Record<Id, number>,
  evolutions: {} as Record<Id, EvolutionTuple[]>,
  /** For each species, all the moves they have access to */
  legalMoves: {} as Record<Id, Id[]>,
  /** Level for which $legalMoves were calculated */
  legalMovesLevel: 0,
  /** Array of all moves teachable by a HM/TM/TR */
  tmMoves: null as Id[] | null,
};
const $ = generatorCaches;

export function pbBaseStatTotal(species: Id): number {
  const baseStats = Species.get(species).baseStats;
  let ret = 0;
  for (const s of Object.values(baseStats)) ret += s;
  return ret;
}

export function baseStatTotal(species: Id): number {
  if (!$.baseStatTotal[species]) $.baseStatTotal[species] = pbBaseStatTotal(species);
  return $.baseStatTotal[species];
}

export function babySpecies(species: Id): Id {
  if (!$.babySpecies[species]) $.babySpecies[species] = Species.get(species).getBabySpecies();
  return $.babySpecies[species];
}

export function minimumLevel(species: Id): number {
  if (!$.minimumLevel[species]) $.minimumLevel[species] = Species.get(species).minimumLevel();
  return $.minimumLevel[species];
}

export function evolutions(species: Id): EvolutionTuple[] {
  if (!$.evolutions[species]) $.evolutions[species] = Species.get(species).getEvolutions(true);
  return $.evolutions[species];
}

//===============================================================================
//
//===============================================================================
/** Used to replace Sketch with any other move. */
export function pbRandomMove(): Id {
  const keys = Move.keys();
  for (;;) {
    const moveId = sample(keys)!;
    const move = Move.get(moveId);
    if (move.id === "SKETCH" || move.id === "STRUGGLE") continue;
    return move.id;
  }
}

export function pbGetLegalMoves2(species: Id, maxlevel: number): Id[] {
  const speciesData = Species.get(species);
  const moves: Id[] = [];
  if (!speciesData) return moves;
  // Populate available moves array (moves)
  for (const m of speciesData.moves) if (m.level <= maxlevel) addMove(moves, m.move, 2);
  if (!$.tmMoves) {
    $.tmMoves = [];
    for (const i of Item.each()) if (i.isMachine()) $.tmMoves.push(i.move!);
  }
  for (const m of speciesData.tutorMoves) if ($.tmMoves.includes(m)) addMove(moves, m, 0);
  const babyspecies = babySpecies(species);
  for (const m of Species.get(babyspecies).eggMoves) addMove(moves, m, 2);
  const movedatas: [Id, Move][] = [];
  for (const move of moves) movedatas.push([move, Move.get(move)]);
  // Delete less powerful moves
  const deleteAll = (a: Id[], item: Id) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] === item) a.splice(i, 1);
  };
  // (Array#each reads moves[i] while the loop deletes from moves, as in Ruby.)
  for (let i = 0; i < moves.length; i++) {
    const md = Move.get(moves[i]!);
    for (const move2 of movedatas) {
      // If we have a move that always hits, remove all other moves with no
      // effect of the same type and <= base power
      if (md.accuracy === 0 && move2[1].functionCode === "None" &&
          md.type === move2[1].type && md.baseDamage >= move2[1].baseDamage) {
        deleteAll(moves, move2[0]);
      // If we have two status moves that have the same function code, delete the
      // one with lower accuracy (Supersonic vs. Confuse Ray, etc.)
      } else if (md.functionCode === move2[1].functionCode && md.baseDamage === 0 &&
                 move2[1].baseDamage === 0 && md.accuracy > move2[1].accuracy) {
        deleteAll(moves, move2[0]);
      // Delete poison-causing moves if we have a move that causes toxic
      } else if (md.functionCode === "BadPoisonTarget" && move2[1].functionCode === "PoisonTarget") {
        deleteAll(moves, move2[0]);
      // If we have two moves with the same function code and type, and one of
      // them is damaging and has 10/15/the same PP as the other move and EITHER
      // does more damage than the other move OR does the same damage but is more
      // accurate, delete the other move (Surf, Flamethrower, Thunderbolt, etc.)
      } else if (md.functionCode === move2[1].functionCode && md.baseDamage !== 0 &&
                 md.type === move2[1].type &&
                 (md.totalPp === 15 || md.totalPp === 10 || md.totalPp === move2[1].totalPp) &&
                 (md.baseDamage > move2[1].baseDamage ||
                 (md.baseDamage === move2[1].baseDamage && md.accuracy > move2[1].accuracy))) {
        deleteAll(moves, move2[0]);
      }
    }
  }
  return moves;
}

export function addMove(moves: Id[], move: Id, base: number): void {
  const data = Move.get(move);
  if (moves.includes(data.id)) return;
  if (["BUBBLE", "BUBBLEBEAM"].includes(data.id)) return; // Never add these moves
  let count = base + 1; // Number of times to add move to moves
  if (data.functionCode === "None" && data.baseDamage <= 40) count = base;
  if (data.baseDamage <= 30 || ["GROWL", "TAILWHIP", "LEER"].includes(data.id)) {
    count = base;
  }
  if (data.baseDamage >= 60 ||
      ["REFLECT", "LIGHTSCREEN", "SAFEGUARD", "SUBSTITUTE", "FAKEOUT"].includes(data.id)) {
    count = base + 2;
  }
  if (data.baseDamage >= 80 && data.type === "NORMAL") {
    count = base + 3;
  }
  if (["PROTECT", "DETECT", "TOXIC", "AERIALACE", "WILLOWISP", "SPORE", "THUNDERWAVE",
    "HYPNOSIS", "CONFUSERAY", "ENDURE", "SWORDSDANCE"].includes(data.id)) {
    count = base + 3;
  }
  for (let i = 0; i < count; i++) moves.push(data.id);
}

/**
 * Returns whether moves contains any move with the same type as thismove but
 * with a higher base damage than it.
 */
export function hasMorePowerfulMove(moves: (Id | null)[], thismove: Id): boolean {
  const thisdata = Move.get(thismove);
  if (thisdata.baseDamage === 0) return false;
  for (const move of moves) {
    if (!move) continue;
    const moveData = Move.get(move);
    if (moveData.type === thisdata.type && moveData.baseDamage > thisdata.baseDamage) {
      return true;
    }
  }
  return false;
}

const ITEM_LIST: Id[] = [
  "ORANBERRY", "SITRUSBERRY", "ADAMANTORB", "BABIRIBERRY",
  "BLACKSLUDGE", "BRIGHTPOWDER", "CHESTOBERRY", "CHOICEBAND",
  "CHOICESCARF", "CHOICESPECS", "CHOPLEBERRY", "DAMPROCK",
  "DEEPSEATOOTH", "EXPERTBELT", "FLAMEORB", "FOCUSSASH",
  "FOCUSBAND", "HEATROCK", "LEFTOVERS", "LIFEORB", "LIGHTBALL",
  "LIGHTCLAY", "LUMBERRY", "OCCABERRY", "PETAYABERRY", "SALACBERRY",
  "SCOPELENS", "SHEDSHELL", "SHELLBELL", "SHUCABERRY", "LIECHIBERRY",
  "SILKSCARF", "THICKCLUB", "TOXICORB", "WIDELENS", "YACHEBERRY",
  "HABANBERRY", "SOULDEW", "PASSHOBERRY", "QUICKCLAW", "WHITEHERB",
];

/** Picks the held item (the item loop). Returns null to pick again. */
function pickItem(species: Id, ev: Id[]): Id | null {
  const item = ITEM_LIST[rand(ITEM_LIST.length)]!;
  switch (item) {
    case "LIGHTBALL":
      if (species !== "PIKACHU") return null;
      break;
    case "SHEDSHELL":
      if (species !== "FORRETRESS" && species !== "SKARMORY") return null;
      break;
    case "SOULDEW":
      if (species !== "LATIOS" && species !== "LATIAS") return null;
      break;
    case "FOCUSSASH":
      if (baseStatTotal(species) > 450 && rand(10) < 8) return null;
      break;
    case "ADAMANTORB":
      if (species !== "DIALGA") return null;
      break;
    case "PASSHOBERRY":
      if (species !== "STEELIX") return null;
      break;
    case "BABIRIBERRY":
      if (species !== "TYRANITAR") return null;
      break;
    case "HABANBERRY":
      if (species !== "GARCHOMP") return null;
      break;
    case "OCCABERRY":
      if (species !== "METAGROSS") return null;
      break;
    case "CHOPLEBERRY":
      if (species !== "UMBREON") return null;
      break;
    case "YACHEBERRY":
      if (!["TORTERRA", "GLISCOR", "DRAGONAIR"].includes(species)) return null;
      break;
    case "SHUCABERRY":
      if (species !== "HEATRAN") return null;
      break;
    case "DEEPSEATOOTH":
      if (species !== "CLAMPERL") return null;
      break;
    case "THICKCLUB":
      if (!["CUBONE", "MAROWAK"].includes(species)) return null;
      break;
    case "LIECHIBERRY":
      if (!ev.includes("ATTACK") && rand(100) < 50) ev.push("ATTACK");
      break;
    case "SALACBERRY":
      if (!ev.includes("SPEED") && rand(100) < 50) ev.push("SPEED");
      break;
    case "PETAYABERRY":
      if (!ev.includes("SPECIAL_ATTACK") && rand(100) < 50) ev.push("SPECIAL_ATTACK");
      break;
  }
  return item;
}

/** Array#delete: removes every occurrence. */
function deleteEvery(a: Id[], item: Id): void {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] === item) a.splice(i, 1);
}

/** Array#| [] : the array without duplicates (a new array). */
const uniq = (a: Id[]) => [...new Set(a)];

//===============================================================================
// Generate a random Pokémon that adheres to the given rules.
//===============================================================================
export function pbRandomPokemonFromRule(rules: PokemonChallengeRules, trainer: Trainer | null): Pokemon {
  let pkmn: Pokemon | null = null;
  let iteration = -1;
  for (;;) {
    iteration += 1;
    let species: Id = "";
    const level = rules.ruleset.suggestedLevel;
    const speciesKeys = Species.keys();
    for (;;) {
      for (;;) {
        species = sample(speciesKeys)!;
        if (Species.get(species).form === 0) break;
      }
      const r = rand(20);
      const bst = baseStatTotal(species);
      if (level < minimumLevel(species)) continue;
      if (iteration % 2 === 0) {
        if (r < 16 && bst < 400) continue;
        if (r < 13 && bst < 500) continue;
      } else {
        if (bst > 400) continue;
        if (r < 10 && babySpecies(species) !== species) continue;
      }
      if (r < 10 && babySpecies(species) === species) continue;
      if (r < 7 && evolutions(species).length > 0) continue;
      break;
    }
    const ev: Id[] = [];
    for (const s of Stat.eachMain()) if (rand(100) < 50) ev.push(s.id);
    let nature: Id = "";
    const natureKeys = Nature.keys();
    for (;;) {
      nature = sample(natureKeys)!;
      const natureData = Nature.get(nature);
      if (["LAX", "GENTLE"].includes(natureData.id) || natureData.statChanges.length === 0) {
        if (rand(20) < 19) continue;
      } else {
        let raisedEmphasis = false;
        let loweredEmphasis = false;
        for (const change of natureData.statChanges) {
          if (!ev.includes(change[0])) continue;
          if (change[1] > 0) raisedEmphasis = true;
          if (change[1] < 0) loweredEmphasis = true;
        }
        if (rand(10) < 6 && !raisedEmphasis) continue;
        if (rand(10) < 9 && loweredEmphasis) continue;
      }
      break;
    }
    if (level !== $.legalMovesLevel) $.legalMoves = {};
    $.legalMovesLevel = level;
    if (!$.legalMoves[species]) $.legalMoves[species] = pbGetLegalMoves2(species, level);
    // Most used: Leftovers, Life Orb, Choice Band, Choice Scarf, Focus Sash
    let item: Id | null = null;
    for (;;) {
      if (rand(40) === 0) {
        item = "LEFTOVERS";
        break;
      }
      item = pickItem(species, ev);
      if (item) break;
    }
    if (level < 10 && Item.exists("ORANBERRY")) {
      if (rand(40) === 0 || item === "SITRUSBERRY") item = "ORANBERRY";
    } else if (level > 20 && Item.exists("SITRUSBERRY")) {
      if (rand(40) === 0 || item === "ORANBERRY") item = "SITRUSBERRY";
    }
    let moves = $.legalMoves[species]!;
    let sketch = false;
    if (moves[0] === "SKETCH") {
      sketch = true;
      // (Overwrites the cached list in $legalMoves, as in Ruby.)
      for (let m = 0; m < Pokemon.MAX_MOVES; m++) moves[m] = pbRandomMove();
    }
    if (moves.length === 0) continue;
    if (uniq(moves).length < Pokemon.MAX_MOVES) {
      if (moves.length === 0) moves = ["TACKLE"];
      moves = uniq(moves);
    } else {
      const newmoves: Id[] = [];
      const rest = Move.exists("REST") ? "REST" : null;
      const spitup = Move.exists("SPITUP") ? "SPITUP" : null;
      const swallow = Move.exists("SWALLOW") ? "SWALLOW" : null;
      const stockpile = Move.exists("STOCKPILE") ? "STOCKPILE" : null;
      const snore = Move.exists("SNORE") ? "SNORE" : null;
      const sleeptalk = Move.exists("SLEEPTALK") ? "SLEEPTALK" : null;
      const has = (a: Id[], m: Id | null) => m !== null && a.includes(m);
      for (;;) {
        newmoves.length = 0;
        while (newmoves.length < Math.min(moves.length, Pokemon.MAX_MOVES)) {
          const m = moves[rand(moves.length)]!;
          if (rand(100) < 50 && hasMorePowerfulMove(moves, m)) continue;
          if (m && !newmoves.includes(m)) newmoves.push(m);
        }
        if ((has(newmoves, spitup) || has(newmoves, swallow)) &&
            !has(newmoves, stockpile) && !sketch) {
          continue;
        }
        if ((!has(newmoves, spitup) && !has(newmoves, swallow)) &&
            has(newmoves, stockpile) && !sketch) {
          continue;
        }
        if (has(newmoves, sleeptalk) && !has(newmoves, rest) &&
            !((sketch || !has(moves, rest)) && rand(100) < 20)) {
          continue;
        }
        if (has(newmoves, snore) && !has(newmoves, rest) &&
            !((sketch || !has(moves, rest)) && rand(100) < 20)) {
          continue;
        }
        let totalbasedamage = 0;
        let hasPhysical = false;
        let hasSpecial = false;
        let hasNormal = false;
        for (const move of newmoves) {
          const d = Move.get(move);
          if (d.baseDamage === 0) continue;
          totalbasedamage += d.baseDamage;
          if (d.type === "NORMAL") hasNormal = true;
          if (d.category === 0) hasPhysical = true;
          if (d.category === 1) hasSpecial = true;
        }
        if (!hasPhysical && ev.includes("ATTACK") && rand(100) < 80) {
          // No physical attack, but emphasizes Attack
          continue;
        }
        if (!hasSpecial && ev.includes("SPECIAL_ATTACK") && rand(100) < 80) {
          // No special attack, but emphasizes Special Attack
          continue;
        }
        const r = rand(10);
        if (r > 6 && totalbasedamage > 180) continue;
        if (r > 8 && totalbasedamage > 140) continue;
        if (totalbasedamage === 0 && rand(100) < 95) continue;
        //############
        // Moves accepted
        if (hasPhysical && !hasSpecial) {
          if (rand(100) < 80) ev.push("ATTACK");
          if (rand(100) < 80) deleteEvery(ev, "SPECIAL_ATTACK");
        }
        if (!hasPhysical && hasSpecial) {
          if (rand(100) < 80) deleteEvery(ev, "ATTACK");
          if (rand(100) < 80) ev.push("SPECIAL_ATTACK");
        }
        if (!hasNormal && item === "SILKSCARF") item = "LEFTOVERS";
        moves = newmoves;
        break;
      }
    }
    if (item === "LIGHTCLAY" && !moves.some((m) => ["LIGHTSCREEN", "REFLECT"].includes(m))) {
      item = "LEFTOVERS";
    }
    if (item === "BLACKSLUDGE") {
      const types = Species.get(species).types;
      if (!types.includes("POISON")) item = "LEFTOVERS";
    }
    if (item === "HEATROCK" && !moves.some((m) => m === "SUNNYDAY")) {
      item = "LEFTOVERS";
    }
    if (item === "DAMPROCK" && !moves.some((m) => m === "RAINDANCE")) {
      item = "LEFTOVERS";
    }
    if (moves.some((m) => m === "REST")) {
      if (rand(100) < 33) item = "LUMBERRY";
      if (rand(100) < 25) item = "CHESTOBERRY";
    }
    const pk = new PBPokemon(species, item, nature, moves[0] ?? null, moves[1] ?? null, moves[2] ?? null, moves[3] ?? null, ev);
    pkmn = pk.createPokemon(level, 31, trainer);
    if (rules.ruleset.isPokemonValid(pkmn)) break;
  }
  return pkmn;
}
