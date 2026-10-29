// compile_trainer_types, compile_trainers (with Essentials Deluxe's extra
// trainer Pokémon properties) and compile_trainer_lists/
// compile_battle_tower_trainers (Battle Tower and Cup trainers/Pokémon).

import { existsSync } from "node:fs";
import type {
  FacilityPokemon,
  FacilityTrainer,
  ItemData,
  StatValues,
  TrainerData,
  TrainerList,
  TrainerPokemon,
  TrainerTypeData,
} from "../../src/data/pbs/types.ts";
import { hasFlag } from "./compileBasic.ts";
import { mainStats } from "./compileSpecies.ts";
import { PbsError, type Ctx } from "./context.ts";
import { getCsvRecord, type Schema, type Value } from "./csv.ts";
import { commentedLines, eachFileSection, preppedLines } from "./readers.ts";
import { rubyLength, rubySplit, rubyStrip, rx, uniq } from "./ruby.ts";
import { eachLineSection, LINE_SECTION, or } from "./sections.ts";

//------------------------------------------------------------------------------
// Trainer types
//------------------------------------------------------------------------------
const TRAINER_TYPE_SCHEMA: Record<string, Schema> = {
  Name: ["name", "s"],
  Gender: [
    "gender",
    "e",
    {
      Male: 0, male: 0, M: 0, m: 0, "0": 0,
      Female: 1, female: 1, F: 1, f: 1, "1": 1,
      Unknown: 2, unknown: 2, Other: 2, other: 2, Mixed: 2, mixed: 2, X: 2, x: 2, "2": 2,
    },
  ],
  BaseMoney: ["base_money", "u"],
  SkillLevel: ["skill_level", "u"],
  Flags: ["flags", "*s"],
  IntroBGM: ["intro_BGM", "s"],
  BattleBGM: ["battle_BGM", "s"],
  VictoryBGM: ["victory_BGM", "s"],
  // modify_pbs_file_contents_before_compiling renames VictoryME to VictoryBGM in the file.
  VictoryME: ["victory_BGM", "s"],
};

export function compileTrainerTypes(ctx: Ctx, path = ctx.pbsPath("trainer_types.txt")): void {
  const table = ctx.table<TrainerTypeData>("TrainerType");
  table.clear();
  for (const s of eachLineSection(ctx, path, TRAINER_TYPE_SCHEMA, "Trainer Type")) {
    const baseMoney = or(s.hash.base_money, 30);
    table.set(s.id, {
      id: s.id,
      name: or(s.hash.name, "Unnamed"),
      gender: or(s.hash.gender, 2),
      baseMoney,
      skillLevel: or(s.hash.skill_level, baseMoney),
      flags: or(s.hash.flags, [] as string[]),
      introBGM: or(s.hash.intro_BGM, null),
      battleBGM: or(s.hash.battle_BGM, null),
      victoryBGM: or(s.hash.victory_BGM, null),
    });
  }
}

//------------------------------------------------------------------------------
// Trainers
//------------------------------------------------------------------------------
const TRAINER_SCHEMA: Record<string, Schema> = {
  Items: ["items", "*e", "Item"],
  LoseText: ["lose_text", "q"],
  Pokemon: ["pokemon", "ev", "Species"],
  Form: ["form", "u"],
  Name: ["name", "s"],
  Moves: ["moves", "*e", "Move"],
  Ability: ["ability", "e", "Ability"],
  AbilityIndex: ["ability_index", "u"],
  Item: ["item", "e", "Item"],
  Gender: ["gender", "e", { M: 0, m: 0, Male: 0, male: 0, "0": 0, F: 1, f: 1, Female: 1, female: 1, "1": 1 }],
  Nature: ["nature", "e", "Nature"],
  IV: ["iv", "uUUUUU"],
  EV: ["ev", "uUUUUU"],
  Happiness: ["happiness", "u"],
  Shiny: ["shininess", "b"],
  SuperShiny: ["super_shininess", "b"],
  Shadow: ["shadowness", "b"],
  Ball: ["poke_ball", "e", "Item"],
  // Essentials Deluxe (Plugins/Essentials Deluxe/[000] Essentials Patches/Trainer Data.rb)
  Size: ["size", "u"],
  Ace: ["trainer_ace", "b"],
  Memento: ["memento", "u"],
  Focus: ["focus", "u"],
  Birthsign: ["birthsign", "u"],
  DynamaxLvl: ["dynamax_lvl", "u"],
  Gigantamax: ["gmaxfactor", "b"],
  NoDynamax: ["nodynamax", "b"],
  Mastery: ["mastery", "b"],
  TeraType: ["teratype", "u"],
};

/** Ruby trainer Pokémon hash keys → TrainerPokemon fields. */
const POKEMON_FIELDS: Record<string, keyof TrainerPokemon> = {
  form: "form",
  name: "name",
  moves: "moves",
  ability: "ability",
  ability_index: "abilityIndex",
  item: "item",
  gender: "gender",
  nature: "nature",
  iv: "iv",
  ev: "ev",
  happiness: "happiness",
  shininess: "shininess",
  super_shininess: "superShininess",
  shadowness: "shadowness",
  poke_ball: "pokeBall",
  size: "size",
  trainer_ace: "trainerAce",
  memento: "memento",
  focus: "focus",
  birthsign: "birthsign",
  dynamax_lvl: "dynamaxLvl",
  gmaxfactor: "gmaxfactor",
  nodynamax: "nodynamax",
  mastery: "mastery",
  teratype: "teratype",
};

const TRAINER_KEY_VALUE = rx(String.raw`^\s*(\w+)\s*=\s*(.*)$`);

export interface TrainerLimits {
  maxLevel: number;
  maxNameSize: number;
  ivStatLimit: number;
  evStatLimit: number;
  evLimit: number;
}

export function compileTrainers(ctx: Ctx, limits: TrainerLimits, path = ctx.pbsPath("trainers.txt")): void {
  const table = ctx.table<TrainerData>("Trainer");
  table.clear();
  const stats = mainStats(ctx);
  const items = ctx.table<ItemData>("Item");
  let trainer: TrainerData | null = null;
  let trainerLine = 0;
  let pkmn: TrainerPokemon | null = null;
  const finish = (line: number, atEnd: boolean) => {
    if (!trainer) return;
    if (!pkmn) {
      ctx.error(atEnd ? null : line, atEnd ? "End of file reached while last trainer has no Pokémon." : "Started new trainer while previous trainer has no Pokémon.", {
        section: `${trainer.trainerType},${trainer.name},${trainer.version}`,
      });
    }
    trainer.id = [trainer.trainerType, trainer.name, trainer.version];
    const key = JSON.stringify(trainer.id);
    if (table.has(key)) {
      // GameData::Trainer.register silently replaces the earlier definition (keeping its position).
      ctx.warn(trainerLine, `Trainer ${trainer.trainerType},${trainer.name},${trainer.version} is defined more than once; this later definition replaces the earlier one.`);
    }
    table.set(key, trainer);
  };
  for (const ln of preppedLines(ctx, path)) {
    const header = LINE_SECTION.exec(ln.text);
    if (header) {
      finish(ln.line, false);
      trainer = null;
      pkmn = null;
      ctx.attempt(ln.line, () => {
        const r = getCsvRecord(ctx, header[1]!, [0, "esU", "TrainerType"]) as [string, string, number | null];
        trainer = { id: [r[0], r[1], r[2] ?? 0], trainerType: r[0], name: r[1], version: r[2] ?? 0, items: [], loseText: "...", pokemon: [] };
        trainerLine = ln.line;
      });
      continue;
    }
    const kv = TRAINER_KEY_VALUE.exec(ln.text);
    if (!kv) continue;
    if (!trainer) {
      ctx.error(ln.line, "Expected a section at the beginning of the file.");
      continue;
    }
    const tr: TrainerData = trainer;
    const key = kv[1]!;
    const schema = TRAINER_SCHEMA[key];
    if (!schema) continue;
    const section = `${tr.trainerType},${tr.name},${tr.version}`;
    const ok = ctx.attempt(
      ln.line,
      () => {
        const value = getCsvRecord(ctx, kv[2]!, schema);
        switch (key) {
          case "Pokemon": {
            const [species, level] = value as [string, number];
            if (level > limits.maxLevel) throw new PbsError(`Bad level: ${level} (must be 1-${limits.maxLevel}).`);
            pkmn = { species, level };
            tr.pokemon.push(pkmn);
            return;
          }
          case "Items":
            tr.items = value as string[];
            return;
          case "LoseText":
            tr.loseText = value as string;
            return;
          case "Name":
            if (rubyLength(value as string) > limits.maxNameSize) {
              throw new PbsError(`Bad nickname: ${value} (must be 1-${limits.maxNameSize} characters).`);
            }
            break;
          case "IV":
            for (const iv of value as (number | null)[]) {
              if (iv !== null && iv > limits.ivStatLimit) throw new PbsError(`Bad IV: ${iv} (must be 0-${limits.ivStatLimit}).`);
            }
            break;
          case "EV": {
            const evs = value as (number | null)[];
            for (const ev of evs) {
              if (ev !== null && ev > limits.evStatLimit) throw new PbsError(`Bad EV: ${ev} (must be 0-${limits.evStatLimit}).`);
            }
            let total = 0;
            for (const s of stats) if (s.pbsOrder >= 0) total += evs[s.pbsOrder] ?? evs[0]!;
            if (total > limits.evLimit) throw new PbsError(`Total EVs are greater than allowed (${limits.evLimit}).`);
            break;
          }
          case "Happiness":
            if ((value as number) > 255) throw new PbsError(`Bad happiness: ${value} (must be 0-255).`);
            break;
          case "Ball": {
            const item = items.get(value as string)!;
            if (!hasFlag(item.flags, "PokeBall") && !hasFlag(item.flags, "SnagBall")) throw new PbsError(`Value ${value} isn't a defined Poké Ball.`);
            break;
          }
        }
        if (!pkmn) throw new PbsError("Pokémon hasn't been defined yet!");
        const field = POKEMON_FIELDS[schema[0] as string]!;
        let stored: Value | StatValues = key === "Moves" ? uniq(value as string[]) : value;
        if (key === "IV" || key === "EV") {
          const arr = value as (number | null)[];
          const hash: StatValues = {};
          for (const s of stats) if (s.pbsOrder >= 0) hash[s.id] = arr[s.pbsOrder] ?? arr[0]!;
          stored = hash;
        }
        (pkmn as unknown as Record<string, unknown>)[field] = stored;
      },
      { section, key },
    );
    // Keep later lines from attaching to the previous Pokémon after a bad Pokemon line.
    if (!ok && key === "Pokemon") pkmn = { species: "", level: 0 };
  }
  finish(trainerLine, true);
}

//------------------------------------------------------------------------------
// Battle Tower / Cup trainer lists
//------------------------------------------------------------------------------
function compileFacilityTrainers(ctx: Ctx, path: string): FacilityTrainer[] {
  const schemas: Record<string, Schema> = {
    Type: [0, "e", "TrainerType"],
    Name: [1, "s"],
    BeginSpeech: [2, "s"],
    EndSpeechWin: [3, "s"],
    EndSpeechLose: [4, "s"],
    PokemonNos: [5, "*u"],
  };
  const out: FacilityTrainer[] = [];
  for (const section of eachFileSection(ctx, path)) {
    const r: Record<string, Value> = {};
    for (const [key, entry] of section.entries) {
      const schema = schemas[key];
      if (!schema) continue;
      ctx.attempt(entry.line, () => void (r[key] = getCsvRecord(ctx, entry.value, schema)), { section: section.name, key });
    }
    out.push({
      trainerType: (r.Type as string | undefined) ?? null,
      name: (r.Name as string | undefined) ?? null,
      beginSpeech: (r.BeginSpeech as string | undefined) ?? null,
      endSpeechWin: (r.EndSpeechWin as string | undefined) ?? null,
      endSpeechLose: (r.EndSpeechLose as string | undefined) ?? null,
      pokemonNos: (r.PokemonNos as number[] | undefined) ?? null,
    });
  }
  return out;
}

const EV_STATS: Record<string, string> = {
  HP: "HP",
  ATK: "ATTACK",
  DEF: "DEFENSE",
  SA: "SPECIAL_ATTACK",
  SPATK: "SPECIAL_ATTACK",
  SD: "SPECIAL_DEFENSE",
  SPDEF: "SPECIAL_DEFENSE",
  SPD: "SPEED",
};

/** PBPokemon.fromInspected (Data/Scripts/018_Alternate battle modes/001_Battle Frontier/002_Challenge_Data.rb). */
function pokemonFromInspected(ctx: Ctx, line: string, maxMoves: number): FacilityPokemon {
  const pieces = rubySplit(rubyStrip(line), rx(String.raw`\s*;\s*`));
  const id = (cls: string, s: string | undefined) => (s !== undefined && s !== "" && ctx.exists(cls, s) ? s : null);
  if (pieces[3] === undefined || pieces[4] === undefined) throw new PbsError(`Expected 5 ';'-separated fields: ${line}`);
  const ev = rubySplit(pieces[3], rx(String.raw`\s*,\s*`))
    .map((s) => EV_STATS[s.toUpperCase()])
    .filter((s): s is string => s !== undefined);
  const moveNames = rubySplit(pieces[4], rx(String.raw`\s*,\s*`));
  const moves: string[] = [];
  for (let i = 0; i < maxMoves; i++) {
    const m = id("Move", moveNames[i]);
    if (m) moves.push(m);
  }
  if (moves.length === 0) moves.push(ctx.table("Move").keys().next().value!);
  return {
    species: id("Species", pieces[0]),
    item: id("Item", pieces[1]),
    nature: id("Nature", pieces[2]),
    move1: moves[0] ?? null,
    move2: moves[1] ?? null,
    move3: moves[2] ?? null,
    move4: moves[3] ?? null,
    ev,
  };
}

export function compileTrainerLists(ctx: Ctx, maxMoves: number, path = ctx.pbsPath("battle_facility_lists.txt")): TrainerList[] {
  const lists: TrainerList[] = [];
  if (!existsSync(path)) {
    // Essentials writes a default file pointing at the Battle Tower files.
    return lists;
  }
  const schemas: Record<string, Schema> = { Trainers: [0, "s"], Pokemon: [1, "s"], Challenges: [2, "*s"] };
  for (const section of eachFileSection(ctx, path)) {
    if (section.name !== "DefaultTrainerList" && section.name !== "TrainerList") continue;
    const r: Record<string, Value> = {};
    for (const [key, entry] of section.entries) {
      const schema = schemas[key];
      if (!schema || (key === "Challenges" && section.name === "DefaultTrainerList")) continue;
      ctx.attempt(entry.line, () => void (r[key] = getCsvRecord(ctx, entry.value, schema)), { section: section.name, key });
    }
    if (r.Trainers === undefined || r.Pokemon === undefined) {
      ctx.error(section.line, `No trainer data file given in section ${section.name}.`, { section: section.name });
      continue;
    }
    const trainersFile = r.Trainers as string;
    const pokemonFile = r.Pokemon as string;
    const list: TrainerList = {
      trainers: [],
      pokemon: [],
      challenges: ((r.Challenges as string[] | undefined) ?? []).filter((c) => c !== ""),
      trainersFile,
      pokemonFile,
      isDefault: section.name === "DefaultTrainerList",
    };
    if (ctx.pbsExists(trainersFile)) {
      list.trainers = compileFacilityTrainers(ctx, ctx.pbsPath(trainersFile));
    }
    if (ctx.pbsExists(pokemonFile)) {
      for (const ln of commentedLines(ctx, ctx.pbsPath(pokemonFile))) {
        ctx.attempt(ln.line, () => void list.pokemon.push(pokemonFromInspected(ctx, ln.text, maxMoves)));
      }
    }
    ctx.setFile(path);
    lists.push(list);
  }
  return lists;
}
