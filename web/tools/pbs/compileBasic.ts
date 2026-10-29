// compile_town_map, compile_connections, compile_phone, compile_types,
// compile_abilities, compile_moves, compile_items, compile_berry_plants,
// compile_shadow_pokemon, compile_regional_dexes and compile_ribbons
// (Data/Scripts/021_Compiler/002_Compiler_CompilePBS.rb), with the defaults of
// the matching GameData initialize methods (Data/Scripts/010_Data/002_PBS data).

import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AbilityData,
  BerryPlantData,
  ItemData,
  MapConnection,
  MapEdge,
  MoveCategory,
  MoveData,
  PhoneData,
  RegionalDexes,
  RibbonData,
  ShadowPokemonData,
  TownMap,
  TownMapPoint,
  TypeData,
} from "../../src/data/pbs/types.ts";
import { PbsError, type Ctx } from "./context.ts";
import { csvEnumOrInt, csvInt, getCsvRecord, type Rec, type Schema, type Value } from "./csv.ts";
import { commentedLines, eachFileSection, eachSection, preppedLines } from "./readers.ts";
import { rubySplit, rx, uniq } from "./ruby.ts";
import { eachLineSection, or } from "./sections.ts";

const str = (v: Value | undefined): string | null => (v === undefined || v === null ? null : (v as string));

/** Item/Species/etc. flag check: GameData has_flag? is case-insensitive. */
export function hasFlag(flags: readonly string[], flag: string): boolean {
  return flags.some((f) => f.toLowerCase() === flag.toLowerCase());
}

//------------------------------------------------------------------------------
// Town map
//------------------------------------------------------------------------------
const TOWN_SECTION = rx(String.raw`^\s*\[\s*(\d+)\s*\]\s*$`);
const KEY_VALUE_RAW = rx(String.raw`^\s*(\w+)\s*=\s*(.*)$`);

export function compileTownMap(ctx: Ctx, path = ctx.pbsPath("town_map.txt")): TownMap {
  const schemas: Record<string, Schema> = {
    Name: [0, "s"],
    Filename: [1, "s"],
    Point: [2, "uussUUUU"],
  };
  const regions: TownMap = [];
  let current = -1;
  for (const ln of commentedLines(ctx, path)) {
    const sec = TOWN_SECTION.exec(ln.text);
    if (sec) {
      current = parseInt(sec[1]!, 10);
      regions[current] = { name: null, filename: null, points: [] };
      continue;
    }
    if (current < 0) {
      ctx.error(ln.line, "Expected a section at the beginning of the file");
      continue;
    }
    const kv = KEY_VALUE_RAW.exec(ln.text);
    if (!kv) {
      ctx.error(ln.line, "Bad line syntax (expected syntax like XXX=YYY)");
      continue;
    }
    const schema = schemas[kv[1]!];
    if (!schema) continue;
    const region = regions[current]!;
    ctx.attempt(ln.line, () => {
      const record = getCsvRecord(ctx, kv[2]!, schema);
      if (kv[1] === "Name") region.name = record as string;
      else if (kv[1] === "Filename") region.filename = record as string;
      else {
        const r = record as (string | number | null)[];
        const point: TownMapPoint = {
          x: r[0] as number,
          y: r[1] as number,
          name: r[2] as string,
          poi: r[3] as string,
          flyMapId: r[4] as number | null,
          flyX: r[5] as number | null,
          flyY: r[6] as number | null,
          switchId: r[7] as number | null,
        };
        region.points.push(point);
      }
    });
  }
  for (let i = 0; i < regions.length; i++) regions[i] ??= null;
  return regions;
}

//------------------------------------------------------------------------------
// Map connections
//------------------------------------------------------------------------------
const EDGES = { N: "N", North: "N", E: "E", East: "E", S: "S", South: "S", W: "W", West: "W" } as const;
const OPPOSITE: Record<string, string> = { N: "S", S: "N", E: "W", W: "E" };
const EDGE_NAMES: Record<string, string> = { N: "North", S: "South", E: "East", W: "West" };

export function compileConnections(ctx: Ctx, path = ctx.pbsPath("map_connections.txt")): MapConnection[] {
  const records: MapConnection[] = [];
  const mapExists = (id: number) => existsSync(join(ctx.gameRoot, "Data", `Map${String(id).padStart(3, "0")}.rxdata`));
  for (const ln of preppedLines(ctx, path)) {
    ctx.attempt(ln.line, () => {
      const rec: Rec = { s: ln.text };
      const c: MapConnection = {
        map1: csvInt(rec),
        edge1: csvEnumOrInt(ctx, rec, EDGES) as MapEdge,
        position1: csvInt(rec),
        map2: csvInt(rec),
        edge2: csvEnumOrInt(ctx, rec, EDGES) as MapEdge,
        position2: csvInt(rec),
      };
      for (const m of [c.map1, c.map2]) {
        if (!mapExists(m)) ctx.warn(ln.line, `Map ${m}, as mentioned in the map connection data, was not found.`);
      }
      if (typeof c.edge1 === "string" && c.edge2 !== OPPOSITE[c.edge1]) {
        throw new PbsError(`${EDGE_NAMES[c.edge1]} side of first map must connect with ${EDGE_NAMES[OPPOSITE[c.edge1]!]!.toLowerCase()} side of second map`);
      }
      records.push(c);
    });
  }
  return records;
}

//------------------------------------------------------------------------------
// Phone
//------------------------------------------------------------------------------
export function compilePhone(ctx: Ctx, path = ctx.pbsPath("phone.txt")): PhoneData {
  const db: PhoneData = {
    generics: [],
    greetings: [],
    greetingsMorning: [],
    greetingsEvening: [],
    bodies1: [],
    bodies2: [],
    battleRequests: [],
    trainers: [],
  };
  if (!existsSync(path)) return db;
  const fields: Record<string, keyof PhoneData> = {
    "<Generics>": "generics",
    "<BattleRequests>": "battleRequests",
    "<GreetingsMorning>": "greetingsMorning",
    "<GreetingsEvening>": "greetingsEvening",
    "<Greetings>": "greetings",
    "<Bodies1>": "bodies1",
    "<Bodies2>": "bodies2",
  };
  for (const section of eachSection(ctx, path)) {
    const field = fields[section.name];
    if (field) db[field] = section.lines;
    else ctx.warn(section.line, `Section [${section.name}] is ignored by Essentials.`);
  }
  return db;
}

//------------------------------------------------------------------------------
// Types
//------------------------------------------------------------------------------
const TYPE_SCHEMA: Record<string, Schema> = {
  Name: [0, "s"],
  InternalName: [0, "s"],
  IsSpecialType: [0, "b"],
  IsPseudoType: [0, "b"],
  Flags: [0, "*s"],
  Weaknesses: [0, "*s"],
  Resistances: [0, "*s"],
  Immunities: [0, "*s"],
  IconPosition: [0, "u"],
};

export function compileTypes(ctx: Ctx, path = ctx.pbsPath("types.txt")): void {
  const table = ctx.table<TypeData>("Type");
  table.clear();
  const sectionLines = new Map<string, number>();
  for (const section of eachFileSection(ctx, path)) {
    const contents = new Map<string, { value: string; line: number }>(section.entries);
    if (!/^\d+/.test(section.name)) contents.set("InternalName", { value: section.name, line: section.line });
    const iconPos = /^\d+/.test(section.name) ? parseInt(section.name, 10) : null;
    const parsed: Record<string, Value> = {};
    let ok = true;
    for (const key of Object.keys(TYPE_SCHEMA)) {
      const entry = contents.get(key);
      if (!entry) {
        if (key === "Name" || key === "InternalName") {
          ctx.error(section.line, `The entry ${key} is required in ${ctx.file} section ${section.name}.`, { section: section.name });
          ok = false;
        }
        continue;
      }
      const parsedOk = ctx.attempt(
        entry.line,
        () => {
          let value = getCsvRecord(ctx, entry.value, TYPE_SCHEMA[key]!);
          if (Array.isArray(value) && value.length === 0) value = null;
          if (value && ["Weaknesses", "Resistances", "Immunities"].includes(key)) value = uniq(value as string[]);
          parsed[key] = value;
        },
        { section: section.name, key },
      );
      if (!parsedOk) ok = false;
    }
    if (!ok) continue;
    const id = parsed.InternalName as string;
    table.set(id, {
      id,
      name: or(parsed.Name, "Unnamed"),
      specialType: or(parsed.IsSpecialType, false),
      pseudoType: or(parsed.IsPseudoType, false),
      flags: or(parsed.Flags, [] as string[]),
      weaknesses: or(parsed.Weaknesses, [] as string[]),
      resistances: or(parsed.Resistances, [] as string[]),
      immunities: or(parsed.Immunities, [] as string[]),
      iconPosition: or(parsed.IconPosition, null) ?? iconPos ?? 0,
    });
    sectionLines.set(id, section.line);
  }
  for (const type of table.values()) {
    for (const key of ["weaknesses", "resistances", "immunities"] as const) {
      for (const other of type[key]) {
        if (!table.has(other)) {
          const label = key[0]!.toUpperCase() + key.slice(1);
          ctx.error(sectionLines.get(type.id) ?? null, `'${other}' is not a defined type (section ${type.id}, ${label}).`, { section: type.id });
        }
      }
    }
  }
}

//------------------------------------------------------------------------------
// Abilities
//------------------------------------------------------------------------------
export const ABILITY_SCHEMA: Record<string, Schema> = {
  Name: ["name", "s"],
  Description: ["description", "q"],
  Flags: ["flags", "*s"],
};

export function compileAbilities(ctx: Ctx, path = ctx.pbsPath("abilities.txt")): void {
  const table = ctx.table<AbilityData>("Ability");
  table.clear();
  for (const s of eachLineSection(ctx, path, ABILITY_SCHEMA, "Ability")) {
    table.set(s.id, {
      id: s.id,
      name: or(s.hash.name, "Unnamed"),
      description: or(s.hash.description, "???"),
      flags: or(s.hash.flags, [] as string[]),
    });
  }
}

//------------------------------------------------------------------------------
// Moves
//------------------------------------------------------------------------------
export const MOVE_SCHEMA: Record<string, Schema> = {
  Name: ["name", "s"],
  Type: ["type", "e", "Type"],
  Category: ["category", "e", ["Physical", "Special", "Status"]],
  Power: ["base_damage", "u"],
  Accuracy: ["accuracy", "u"],
  TotalPP: ["total_pp", "u"],
  Target: ["target", "e", "Target"],
  Priority: ["priority", "i"],
  FunctionCode: ["function_code", "s"],
  Flags: ["flags", "*s"],
  EffectChance: ["effect_chance", "u"],
  Description: ["description", "q"],
  BaseDamage: ["base_damage", "u"],
};

export function compileMoves(ctx: Ctx, path = ctx.pbsPath("moves.txt")): void {
  const table = ctx.table<MoveData>("Move");
  table.clear();
  for (const s of eachLineSection(ctx, path, MOVE_SCHEMA, "Move")) {
    const h = s.hash;
    const category = or(h.category, 2);
    const power = or(h.base_damage, 0);
    if (category === 2 && power !== 0) {
      ctx.error(s.line, `Move ${or(h.name, s.id)} is defined as a Status move with a non-zero base damage.`, { section: s.id });
      continue;
    }
    if (category !== 2 && power === 0) {
      ctx.warn(s.line, `Move ${or(h.name, s.id)} was defined as Physical or Special but had a base damage of 0. Changing it to a Status move.`, {
        section: s.id,
      });
      h.category = 2;
    }
    const functionCode = or(h.function_code, "None");
    if (/^[0-9A-F]{3}$/.test(functionCode)) {
      // GameData::Move#convert_move_data would rename these pre-v20 codes.
      ctx.error(s.keyLines.FunctionCode ?? s.line, `Old-style function code ${functionCode} is not converted by this compiler.`, { section: s.id });
    }
    table.set(s.id, {
      id: s.id,
      name: or(h.name, "Unnamed"),
      type: or(h.type, "NONE"),
      category: or(h.category, 2) as MoveCategory,
      baseDamage: or(h.base_damage, 0),
      accuracy: or(h.accuracy, 100),
      totalPp: or(h.total_pp, 5),
      target: or(h.target, "None"),
      priority: or(h.priority, 0),
      functionCode,
      flags: or(h.flags, [] as string[]),
      effectChance: or(h.effect_chance, 0),
      description: or(h.description, "???"),
    });
  }
}

//------------------------------------------------------------------------------
// Items
//------------------------------------------------------------------------------
export const ITEM_SCHEMA: Record<string, Schema> = {
  Name: ["name", "s"],
  NamePlural: ["name_plural", "s"],
  Pocket: ["pocket", "v"],
  Price: ["price", "u"],
  SellPrice: ["sell_price", "u"],
  Description: ["description", "q"],
  FieldUse: ["field_use", "e", { OnPokemon: 1, Direct: 2, TM: 3, HM: 4, TR: 5 }],
  BattleUse: ["battle_use", "e", { OnPokemon: 1, OnMove: 2, OnBattler: 3, OnFoe: 4, Direct: 5 }],
  Consumable: ["consumable", "b"],
  Flags: ["flags", "*s"],
  Move: ["move", "e", "Move"],
  // Essentials Deluxe (Plugins/Essentials Deluxe/[000] Essentials Patches/Miscellaneous.rb)
  HeldDescription: ["real_held_description", "q"],
};

/** GameData::Item#is_important?, including ZUD's Z-Crystal override. */
export function isImportantItem(fieldUse: number, flags: readonly string[]): boolean {
  return hasFlag(flags, "KeyItem") || fieldUse === 4 || fieldUse === 3 || hasFlag(flags, "ZCrystal");
}

export function compileItems(ctx: Ctx, path = ctx.pbsPath("items.txt")): void {
  const table = ctx.table<ItemData>("Item");
  table.clear();
  for (const s of eachLineSection(ctx, path, ITEM_SCHEMA, "Item")) {
    const h = s.hash;
    const price = or(h.price, 0);
    const fieldUse = or(h.field_use, 0);
    const flags = or(h.flags, [] as string[]);
    const consumable = h.consumable === undefined || h.consumable === null ? !isImportantItem(fieldUse, flags) : (h.consumable as boolean);
    table.set(s.id, {
      id: s.id,
      name: or(h.name, "Unnamed"),
      namePlural: or(h.name_plural, "Unnamed"),
      pocket: or(h.pocket, 1),
      price,
      sellPrice: or(h.sell_price, null) ?? Math.floor(price / 2),
      description: or(h.description, "???"),
      heldDescription: str(h.real_held_description),
      fieldUse,
      battleUse: or(h.battle_use, 0),
      consumable,
      flags,
      move: str(h.move),
    });
  }
}

//------------------------------------------------------------------------------
// Berry plants
//------------------------------------------------------------------------------
const BERRY_SCHEMA: Record<string, Schema> = {
  HoursPerStage: ["hours_per_stage", "v"],
  DryingPerHour: ["drying_per_hour", "u"],
  Yield: ["yield", "uv"],
};

function berryPlant(id: string, h: Record<string, Value>): BerryPlantData {
  const y = [...or(h.yield, [2, 5] as number[])] as [number, number];
  if (y[1] < y[0]) y.reverse();
  return { id, hoursPerStage: or(h.hours_per_stage, 3), dryingPerHour: or(h.drying_per_hour, 15), yield: y };
}

export function compileBerryPlants(ctx: Ctx, path = ctx.pbsPath("berry_plants.txt")): void {
  const table = ctx.table<BerryPlantData>("BerryPlant");
  table.clear();
  const sections = eachLineSection(ctx, path, BERRY_SCHEMA, "Item", {
    // Old format: ITEM = hours,drying,min,max
    headerless: (key, value, ln) => {
      ctx.attempt(ln.line, () => {
        const id = parseItem(ctx, key);
        const r = getCsvRecord(ctx, value, [0, "vuuv"]) as number[];
        table.set(id, berryPlant(id, { hours_per_stage: r[0]!, drying_per_hour: r[1]!, yield: [r[2]!, r[3]!] }));
      });
    },
  });
  for (const s of sections) table.set(s.id, berryPlant(s.id, s.hash));
}

/** Compiler.parseItem */
export function parseItem(ctx: Ctx, item: string): string {
  const id = item.toUpperCase().trim();
  if (!ctx.exists("Item", id)) throw new PbsError(`Undefined item constant name: ${item}. Make sure the item is defined in PBS/items.txt.`);
  return id;
}

/** Compiler.parseSpecies */
export function parseSpecies(ctx: Ctx, species: string): string {
  let id = species.toUpperCase().trim();
  if (id === "NIDORANMA") id = "NIDORANmA";
  if (id === "NIDORANFE") id = "NIDORANfE";
  if (!ctx.exists("Species", id)) throw new PbsError(`Undefined species constant name: ${species}. Make sure the species is defined in PBS/pokemon.txt.`);
  return id;
}

//------------------------------------------------------------------------------
// Shadow Pokémon
//------------------------------------------------------------------------------
const SHADOW_SCHEMA: Record<string, Schema> = {
  GaugeSize: ["gauge_size", "v"],
  Moves: ["moves", "*s"],
  Flags: ["flags", "*s"],
};

export function compileShadowPokemon(ctx: Ctx, path = ctx.pbsPath("shadow_pokemon.txt")): void {
  const table = ctx.table<ShadowPokemonData>("ShadowPokemon");
  table.clear();
  const make = (id: string, h: Record<string, Value>): ShadowPokemonData => ({
    id,
    moves: or(h.moves, [] as string[]),
    gaugeSize: or(h.gauge_size, 4000),
    flags: or(h.flags, [] as string[]),
  });
  const sections = eachLineSection(ctx, path, SHADOW_SCHEMA, "Shadow Pokémon", {
    // Old format: SPECIES = move,move,...
    headerless: (key, value, ln) => {
      ctx.attempt(ln.line, () => {
        const id = parseSpecies(ctx, key);
        const moves = rubySplit(value, ",").map((v) => v.trim()).filter((v) => v.length > 0);
        table.set(id, make(id, { moves }));
      });
    },
  });
  for (const s of sections) table.set(s.id, make(s.id, s.hash));
}

//------------------------------------------------------------------------------
// Regional Dexes
//------------------------------------------------------------------------------
const DEX_SECTION = rx(String.raw`^\s*\[\s*(\d+)\s*\]\s*$`);

export function compileRegionalDexes(ctx: Ctx, path = ctx.pbsPath("regional_dexes.txt")): RegionalDexes {
  const lists: RegionalDexes = [];
  let section: number | null = null;
  const firstLine = new Map<string, number>();
  for (const ln of preppedLines(ctx, path)) {
    const sec = DEX_SECTION.exec(ln.text);
    if (sec) {
      section = parseInt(sec[1]!, 10);
      if (lists[section]) ctx.error(ln.line, `Dex list number ${section} is defined at least twice.`);
      lists[section] = [];
      continue;
    }
    if (section === null) {
      ctx.error(ln.line, "Expected a section at the beginning of the file.");
      continue;
    }
    const list = lists[section]!;
    for (const species of rubySplit(ln.text, ",")) {
      if (!species) continue;
      ctx.attempt(ln.line, () => {
        const s = parseSpecies(ctx, species);
        const key = `${section}:${s}`;
        if (firstLine.has(key)) throw new PbsError(`Dex list number ${section} has species ${s} listed twice (first on line ${firstLine.get(key)}).`);
        firstLine.set(key, ln.line);
        list.push(s);
      });
    }
  }
  for (let i = 0; i < lists.length; i++) lists[i] ??= null;
  return lists;
}

//------------------------------------------------------------------------------
// Ribbons
//------------------------------------------------------------------------------
const RIBBON_SCHEMA: Record<string, Schema> = {
  Name: ["name", "s"],
  IconPosition: ["icon_position", "u"],
  Description: ["description", "q"],
  Flags: ["flags", "*s"],
};

export function compileRibbons(ctx: Ctx, path = ctx.pbsPath("ribbons.txt")): void {
  const table = ctx.table<RibbonData>("Ribbon");
  table.clear();
  for (const s of eachLineSection(ctx, path, RIBBON_SCHEMA, "Ribbon")) {
    table.set(s.id, {
      id: s.id,
      name: or(s.hash.name, "Unnamed"),
      iconPosition: or(s.hash.icon_position, 0),
      description: or(s.hash.description, "???"),
      flags: or(s.hash.flags, [] as string[]),
    });
  }
}

