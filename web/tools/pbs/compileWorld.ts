// compile_encounters, compile_metadata and compile_map_metadata.

import type { EncounterData, EncounterSlot, MapMetadataData, MetadataData, PlayerMetadataData } from "../../src/data/pbs/types.ts";
import { PbsError, type Ctx } from "./context.ts";
import { getCsvRecord, type Schema, type Value } from "./csv.ts";
import { eachFileSectionNumbered, preppedLines, type Section } from "./readers.ts";
import { rubySplit, rubyToI, rx } from "./ruby.ts";

//------------------------------------------------------------------------------
// Encounters
//------------------------------------------------------------------------------
const SPECIES_LINE = /^\d+,/;
const MAP_LINE = rx(String.raw`^\[\s*(.+)\s*\]$`);

/** Merges identical slots and sorts by descending chance, then species ID (as compile_encounters does). */
function finishSlots(ctx: Ctx, enc: EncounterData, line: number): void {
  const types = enc.types;
  for (const key of Object.keys(types)) {
    const slots: (EncounterSlot | null)[] = types[key]!;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot) continue;
      for (let j = 0; j < slots.length; j++) {
        const other = slots[j];
        if (i === j || !other) continue;
        if (slot.species !== other.species || slot.minLevel !== other.minLevel || slot.maxLevel !== other.maxLevel) continue;
        slot.chance += other.chance;
        slots[j] = null;
      }
    }
    // Ruby's sort! isn't stable; equal elements (same chance and species,
    // different levels) keep file order here.
    const sorted = (slots.filter((s) => s !== null) as EncounterSlot[]).sort((a, b) =>
      a.chance === b.chance ? (a.species < b.species ? -1 : a.species > b.species ? 1 : 0) : b.chance - a.chance,
    );
    const warned = new Set<string>();
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1]!, sorted[i]!];
      if (a.chance !== b.chance || a.species !== b.species || warned.has(`${a.chance}:${a.species}`)) continue;
      warned.add(`${a.chance}:${a.species}`);
      ctx.warn(line, `${key}: ${a.species} slots with chance ${a.chance} tie in Essentials' (unstable) sort; kept in file order here.`, { section: enc.id });
    }
    types[key] = sorted;
  }
}

export function compileEncounters(ctx: Ctx, maxLevel: number, path = ctx.pbsPath("encounters.txt")): void {
  const table = ctx.table<EncounterData>("Encounter");
  table.clear();
  const triggerChance = new Map<string, number>();
  for (const r of ctx.ruby.registrations.get("EncounterType") ?? []) {
    triggerChance.set(r.id, parseInt(r.props.get("trigger_chance") ?? "0", 10) || 0);
  }
  let current: EncounterData | null = null;
  let currentLine = 0;
  let currentType: string | null = null;
  const flush = () => {
    if (current) finishSlots(ctx, current, currentLine);
  };
  for (const ln of preppedLines(ctx, path)) {
    const line = ln.text;
    if (currentType && current && SPECIES_LINE.test(line)) {
      const enc = current;
      const type = currentType;
      ctx.attempt(
        ln.line,
        () => {
          const values = rubySplit(line, ",").map((v) => v.trim());
          if (values.length < 3) throw new PbsError(`Expected a species entry line for encounter type ${type} for map '${enc.map}', got "${line}" instead.`);
          const r = getCsvRecord(ctx, line, [0, "vevV", null, "Species"]) as (number | string | null)[];
          const slot: EncounterSlot = { chance: r[0] as number, species: r[1] as string, minLevel: r[2] as number, maxLevel: (r[3] ?? r[2]) as number };
          if (slot.minLevel > maxLevel) throw new PbsError(`Level number ${slot.minLevel} is not valid (max. ${maxLevel}).`);
          if (slot.maxLevel > maxLevel) throw new PbsError(`Level number ${slot.maxLevel} is not valid (max. ${maxLevel}).`);
          if (slot.minLevel > slot.maxLevel) throw new PbsError(`Minimum level is greater than maximum level: ${line}`);
          enc.types[type]!.push(slot);
        },
        { section: enc.id },
      );
      continue;
    }
    const mapLine = MAP_LINE.exec(line);
    if (mapLine) {
      flush();
      const values = rubySplit(mapLine[1]!, ",").map((v) => rubyToI(v.trim()));
      const map = values[0] ?? 0;
      const version = values[1] ?? 0;
      const id = `${map}_${version}`;
      currentType = null;
      current = { id, map, version, stepChances: {}, types: {} };
      currentLine = ln.line;
      // A repeated map is reported and its encounters are read but dropped.
      if (table.has(id)) ctx.error(ln.line, `Encounters for map '${map}' are defined twice.`, { section: id });
      else table.set(id, current);
      continue;
    }
    if (!current) {
      ctx.error(ln.line, `Expected a map number, got "${line}" instead.`);
      continue;
    }
    const values = rubySplit(line, ",").map((v) => v.trim());
    currentType = values[0] ? values[0] : null;
    if (currentType && triggerChance.has(currentType)) {
      if (values[1]) current.stepChances[currentType] = rubyToI(values[1]);
      current.stepChances[currentType] ??= triggerChance.get(currentType)!;
      current.types[currentType] = [];
    } else {
      ctx.error(ln.line, `Undefined encounter type "${line}" for map '${current.map}'.`, { section: current.id });
      currentType = null;
    }
  }
  flush();
}

//------------------------------------------------------------------------------
// Metadata
//------------------------------------------------------------------------------
const METADATA_SCHEMA: Record<string, Schema> = {
  StartMoney: [1, "u"],
  StartItemStorage: [2, "*e", "Item"],
  Home: [3, "vuuu"],
  StorageCreator: [4, "s"],
  WildBattleBGM: [5, "s"],
  TrainerBattleBGM: [6, "s"],
  WildVictoryBGM: [7, "s"],
  TrainerVictoryBGM: [8, "s"],
  WildCaptureME: [9, "s"],
  SurfBGM: [10, "s"],
  BicycleBGM: [11, "s"],
};

const PLAYER_METADATA_SCHEMA: Record<string, Schema> = {
  TrainerType: [1, "e", "TrainerType"],
  WalkCharset: [2, "s"],
  RunCharset: [3, "s"],
  CycleCharset: [4, "s"],
  SurfCharset: [5, "s"],
  DiveCharset: [6, "s"],
  FishCharset: [7, "s"],
  SurfFishCharset: [8, "s"],
  Home: [9, "vuuu"],
};

/** Parses the keys present in a section; keys whose value fails to parse are reported and left out. */
function parseSection(ctx: Ctx, section: Section, schema: Record<string, Schema>): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const key of Object.keys(schema)) {
    const entry = section.entries.get(key);
    if (!entry) continue;
    ctx.attempt(
      entry.line,
      () => {
        let value = getCsvRecord(ctx, entry.value, schema[key]!);
        if (Array.isArray(value) && value.length === 0) value = null;
        out[key] = value;
      },
      { section: section.name, key },
    );
  }
  return out;
}

const v = <T>(value: Value | undefined): T | null => (value === undefined ? null : (value as T));

export function compileMetadata(ctx: Ctx, path = ctx.pbsPath("metadata.txt")): { metadata: MetadataData | null; players: PlayerMetadataData[] } {
  let metadata: MetadataData | null = null;
  const players = new Map<number, PlayerMetadataData>();
  for (const section of eachFileSectionNumbered(ctx, path)) {
    if (section.id === 0) {
      if (!section.entries.has("Home")) ctx.error(section.line, `The entry Home is required in ${ctx.file} section 0.`);
      const c = parseSection(ctx, section, METADATA_SCHEMA);
      metadata = {
        id: 0,
        startMoney: v<number>(c.StartMoney) ?? 3000,
        startItemStorage: v<string[]>(c.StartItemStorage) ?? [],
        home: v(c.Home),
        storageCreator: v(c.StorageCreator),
        wildBattleBGM: v(c.WildBattleBGM),
        trainerBattleBGM: v(c.TrainerBattleBGM),
        wildVictoryBGM: v(c.WildVictoryBGM),
        trainerVictoryBGM: v(c.TrainerVictoryBGM),
        wildCaptureME: v(c.WildCaptureME),
        surfBGM: v(c.SurfBGM),
        bicycleBGM: v(c.BicycleBGM),
      };
    } else {
      const c = parseSection(ctx, section, PLAYER_METADATA_SCHEMA);
      players.set(section.id, {
        id: section.id,
        trainerType: v(c.TrainerType),
        walkCharset: v(c.WalkCharset),
        runCharset: v(c.RunCharset),
        cycleCharset: v(c.CycleCharset),
        surfCharset: v(c.SurfCharset),
        diveCharset: v(c.DiveCharset),
        fishCharset: v(c.FishCharset),
        surfFishCharset: v(c.SurfFishCharset),
        // compile_metadata (v20.1) parses Home but never puts it in the hash.
        home: null,
      });
    }
  }
  if (!players.has(1)) ctx.error(null, `Metadata for player character 1 in ${ctx.file} is not defined but should be.`);
  if (!metadata) ctx.error(null, `Section [0] (game metadata) is missing from ${ctx.file}.`);
  return { metadata, players: [...players.values()] };
}

//------------------------------------------------------------------------------
// Map metadata
//------------------------------------------------------------------------------
const MAP_METADATA_SCHEMA: Record<string, Schema> = {
  Name: [1, "s"],
  Outdoor: [2, "b"],
  ShowArea: [3, "b"],
  Bicycle: [4, "b"],
  BicycleAlways: [5, "b"],
  HealingSpot: [6, "vuu"],
  Weather: [7, "eu", "Weather"],
  MapPosition: [8, "uuu"],
  DiveMap: [9, "v"],
  DarkMap: [10, "b"],
  SafariMap: [11, "b"],
  SnapEdges: [12, "b"],
  Dungeon: [13, "b"],
  BattleBack: [14, "s"],
  WildBattleBGM: [15, "s"],
  TrainerBattleBGM: [16, "s"],
  WildVictoryBGM: [17, "s"],
  TrainerVictoryBGM: [18, "s"],
  WildCaptureME: [19, "s"],
  MapSize: [20, "us"],
  Environment: [21, "e", "Environment"],
  Flags: [22, "*s"],
};

export function compileMapMetadata(ctx: Ctx, path = ctx.pbsPath("map_metadata.txt")): MapMetadataData[] {
  const table = new Map<number, MapMetadataData>();
  for (const section of eachFileSectionNumbered(ctx, path)) {
    const c = parseSection(ctx, section, MAP_METADATA_SCHEMA);
    table.set(section.id, {
      id: section.id,
      name: v(c.Name),
      outdoorMap: v(c.Outdoor),
      announceLocation: v(c.ShowArea),
      canBicycle: v(c.Bicycle),
      alwaysBicycle: v(c.BicycleAlways),
      teleportDestination: v(c.HealingSpot),
      weather: v(c.Weather),
      townMapPosition: v(c.MapPosition),
      diveMapId: v(c.DiveMap),
      darkMap: v(c.DarkMap),
      safariMap: v(c.SafariMap),
      snapEdges: v(c.SnapEdges),
      randomDungeon: v(c.Dungeon),
      battleBackground: v(c.BattleBack),
      wildBattleBGM: v(c.WildBattleBGM),
      trainerBattleBGM: v(c.TrainerBattleBGM),
      wildVictoryBGM: v(c.WildVictoryBGM),
      trainerVictoryBGM: v(c.TrainerVictoryBGM),
      wildCaptureME: v(c.WildCaptureME),
      townMapSize: v(c.MapSize),
      battleEnvironment: v(c.Environment),
      flags: v<string[]>(c.Flags) ?? [],
    });
  }
  return [...table.values()];
}
