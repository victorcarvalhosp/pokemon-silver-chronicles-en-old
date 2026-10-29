// Plugin compile steps that Essentials Deluxe's compile_all runs after the base
// PBS files: Improved Field Skills (write_field_skills + compile_field_skills)
// and ZUD Mechanics (compile_lair_maps, compile_raid_ranks,
// compile_power_moves, compile_dynamax_metrics).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  AdventureMaps,
  PowerMoveData,
  RaidRanks,
  SpeciesData,
  SpeciesMetricsData,
  StagedMoves,
} from "../../src/data/pbs/types.ts";
import { makeMetrics, type MetricsDefaults } from "./compileSpecies.ts";
import { PbsError, type Ctx } from "./context.ts";
import { getCsvRecord, type Schema, type Value } from "./csv.ts";
import { commentedLines, eachFileSection, eachFileSectionEx, preppedLines } from "./readers.ts";
import { rubyRound, rx, uniq } from "./ruby.ts";
import { LINE_SECTION } from "./sections.ts";

//------------------------------------------------------------------------------
// Species helpers (GameData::Species methods used by the plugins)
//------------------------------------------------------------------------------
type SpeciesTable = Map<string, SpeciesData>;

/** GameData::Species.get_species_form */
function getSpeciesForm(table: SpeciesTable, species: string, form: number): SpeciesData {
  const trial = `${species}_${form}`;
  const ret = table.get(table.has(trial) ? trial : species);
  if (!ret) throw new PbsError(`Undefined species ${species}.`);
  return ret;
}

function getPreviousSpecies(s: SpeciesData): string {
  return s.evolutions.find((e) => e.prevolution)?.species ?? s.species;
}

function getBabySpecies(table: SpeciesTable, s: SpeciesData): string {
  const prevo = s.evolutions.find((e) => e.prevolution);
  if (!prevo || prevo.species === s.species) return s.species;
  return getBabySpecies(table, table.get(prevo.species)!);
}

function getEggMoves(table: SpeciesTable, s: SpeciesData): string[] {
  if (s.eggMoves.length > 0) return s.eggMoves;
  const prevo = getPreviousSpecies(s);
  if (prevo !== s.species) return getEggMoves(table, getSpeciesForm(table, prevo, s.form));
  return s.eggMoves;
}

/** Essentials Deluxe's GameData::Species#get_family_moves. */
function getFamilyMoves(table: SpeciesTable, s: SpeciesData): string[] {
  const moves: string[] = [];
  const baby = getSpeciesForm(table, getBabySpecies(table, s), s.form);
  const prev = getSpeciesForm(table, getPreviousSpecies(s), s.form);
  if (baby.species !== s.species) for (const m of baby.moves) moves.push(m.move);
  if (prev.species !== s.species && prev.species !== baby.species) for (const m of prev.moves) moves.push(m.move);
  for (const m of s.moves) moves.push(m.move);
  moves.push(...s.tutorMoves, ...getEggMoves(table, s));
  return uniq(moves);
}

//------------------------------------------------------------------------------
// Plugin overlay files (Essentials Deluxe compile_plugin_*)
//------------------------------------------------------------------------------
/**
 * Essentials Deluxe merges PBS/Plugins/<plugin>/{abilities,items,moves,
 * pokemon,map_metadata}.txt into the main data, rewrites the main PBS files and
 * deletes the overlays. Present overlays mean the PBS files are out of date.
 */
export function checkPluginOverlays(ctx: Ctx, pluginFolders: string[]): void {
  for (const plugin of pluginFolders) {
    for (const file of ["abilities", "items", "moves", "pokemon", "map_metadata"]) {
      const path = ctx.pbsPath(`Plugins/${plugin}/${file}.txt`);
      if (!existsSync(path)) continue;
      ctx.setFile(path);
      ctx.error(null, "Plugin overlay file isn't merged by this compiler; run the game's compiler once to merge it into the main PBS files.");
    }
  }
}

//------------------------------------------------------------------------------
// Improved Field Skills
//------------------------------------------------------------------------------
/**
 * write_field_skills then compile_field_skills: the plugin regenerates
 * field_skills.txt from species data on every compile, then reads it back, so
 * this computes the result directly. Returns how many species' skills differ
 * from the field_skills.txt on disk (stale until the game recompiles).
 */
export function compileFieldSkills(ctx: Ctx, path = ctx.pbsPath("Plugins/Improved Field Skills/field_skills.txt")): number {
  const table = ctx.table<SpeciesData>("Species");
  const skillLists = ["HM_SKILLS", "MISC_SKILLS", "HEAL_SKILLS", "CUSTOM_SKILLS"].map((n) => ctx.ruby.symbolArray(n));
  for (const s of table.values()) {
    ctx.attempt(null, () => {
      const moves = new Set(getFamilyMoves(table, s));
      s.fieldSkills = skillLists.flatMap((list) => list.filter((skill) => moves.has(skill)));
    }, { section: s.id });
  }
  if (!existsSync(path)) return 0;
  let differences = 0;
  const onDisk = new Map<string, string>();
  for (const section of eachFileSectionEx(ctx, path)) onDisk.set(section.name, section.entries.get("Skills")?.value ?? "");
  for (const s of table.values()) {
    if ((onDisk.get(s.id) ?? "") !== s.fieldSkills.join(",")) differences++;
  }
  return differences;
}

//------------------------------------------------------------------------------
// ZUD: Max Lair maps
//------------------------------------------------------------------------------
const ZUD_SECTION = rx(String.raw`^\s*\[\s*(\d+)\s*\]\s*$`);
const ZUD_KEY_VALUE = rx(String.raw`^\s*(\w+)\s*=\s*(.*)$`);

export function compileLairMaps(ctx: Ctx, path = ctx.pbsPath("Plugins/ZUD/adventure_maps.txt")): AdventureMaps {
  const coords = new Set<string>();
  const coordsSrc = ctx.ruby.find(/^LAIR_COORDINATES\s*=\s*\{([\s\S]*?)\n\}/);
  if (!coordsSrc) throw new Error("LAIR_COORDINATES not found in scripts");
  for (const m of coordsSrc[1]!.matchAll(/"(\w+)"\s*=>/g)) coords.add(m[1]!);
  const check = (c: string, mapName: unknown) => {
    if (!mapName) return;
    const chars = [...c];
    const x = chars[0] ?? "";
    const y = (chars[1] ?? "") + (chars[2] ?? "");
    if (!coords.has(x)) throw new PbsError(`${mapName} coordinate '${x}' in '${c}' doesn't exist. This coordinate must be a capital letter A-Z.`);
    if (!coords.has(y)) throw new PbsError(`${mapName} coordinate '${y}' in '${c}' doesn't exist. This coordinate must be a padded two-digit number 01-28.`);
  };
  const maps: AdventureMaps = [];
  let current = -1;
  for (const ln of commentedLines(ctx, path)) {
    const sec = ZUD_SECTION.exec(ln.text);
    if (sec) {
      current = parseInt(sec[1]!, 10);
      maps[current] = {};
      continue;
    }
    if (current < 0) {
      ctx.error(ln.line, "Expected a section at the beginning of the file");
      continue;
    }
    const kv = ZUD_KEY_VALUE.exec(ln.text);
    if (!kv) {
      ctx.error(ln.line, "Bad line syntax (expected syntax like XXX=YYY)");
      continue;
    }
    const map = maps[current]!;
    const key = kv[1]!;
    ctx.attempt(ln.line, () => {
      if (key === "Name" || key === "Start" || key === "Player") {
        const record = getCsvRecord(ctx, kv[2]!, [0, "s"]) as string;
        map[key] = record;
        if (key !== "Name") check(record, map.Name);
      } else if (key === "DarkMap") {
        map[key] = getCsvRecord(ctx, kv[2]!, [0, "b"]) as boolean;
      } else {
        const record = getCsvRecord(ctx, kv[2]!, [0, "*s"]) as string[];
        map[key] = record;
        for (const c of record) check(c, map.Name);
      }
    }, { section: String(current), key });
  }
  const graphicsDir = join(ctx.gameRoot, "Graphics", "Plugins", "ZUD", "Adventure", "Maps");
  const graphics = existsSync(graphicsDir) ? new Set(readdirSync(graphicsDir).map((f) => f.replace(/\.[^.]+$/, "").toLowerCase())) : new Set<string>();
  for (let i = 0; i < maps.length; i++) {
    const map = maps[i];
    if (!map) {
      ctx.error(null, `Lair map number ${i} is missing.`);
      maps[i] = null;
      continue;
    }
    if (!("Name" in map)) ctx.error(null, `Lair map number ${i} is missing a name entry.`);
    else if (!("Start" in map)) ctx.error(null, `'${map.Name}' lair map is missing a 'Start' tile. This is a required tile for each lair map.`);
    else if (!("Player" in map)) ctx.error(null, `'${map.Name}' lair map is missing a 'Player' tile. This is a required tile for each lair map.`);
    else if (!Array.isArray(map.Pokemon) || map.Pokemon.length !== 11) {
      ctx.error(null, `'${map.Name}' lair map has an incorrect number of Pokemon coordinates. Each lair map requires eleven Pokemon coordinates.`);
    }
    if (typeof map.Name === "string" && !graphics.has(map.Name.toLowerCase())) {
      ctx.warn(null, `Missing graphic named '${map.Name}' for lair map number ${i}.`);
    }
  }
  return maps;
}

//------------------------------------------------------------------------------
// ZUD: raid ranks
//------------------------------------------------------------------------------
/** ZUD's Species#regionalVariant? */
function regionalVariant(s: SpeciesData, regionalForms: string[]): boolean {
  for (const name of regionalForms) {
    if (!s.formName || s.formName.includes("Zen Mode")) return false;
    if (s.formName.includes(name)) return true;
  }
  return false;
}

function regionalFormNames(ctx: Ctx): string[] {
  const m = ctx.ruby.find(/^[ \t]*REGIONAL_FORMS\s*=\s*\[([\s\S]*?)\n[ \t]*\]/);
  if (!m) throw new Error("REGIONAL_FORMS not found in scripts");
  return [...m[1]!.matchAll(/\[\s*"([^"]*)"\s*,/g)].map((x) => x[1]!);
}

/** ZUD's raid_GenerateBanlist. */
function raidBanlist(ctx: Ctx): string[] {
  const banlist = ctx.ruby.symbolArray("raid_banlist");
  const allowedForms = ctx.ruby.symbolArray("allowed_forms");
  const regional = regionalFormNames(ctx);
  for (const sp of ctx.table<SpeciesData>("Species").values()) {
    if (sp.noDynamax) {
      banlist.push(sp.id);
      continue;
    }
    if (sp.form === 0 || regionalVariant(sp, regional) || allowedForms.includes(sp.species)) continue;
    if (sp.species === "MINIOR" && sp.form < 7) continue;
    banlist.push(sp.id);
  }
  return banlist;
}

export function compileRaidRanks(ctx: Ctx, path = ctx.pbsPath("Plugins/ZUD/raid_ranks.txt")): RaidRanks {
  const lists: string[][] = [[], [], [], [], [], [], [], []];
  const banlist = raidBanlist(ctx);
  lists[7] = [...banlist];
  const firstLine = new Map<string, number>();
  for (const ln of commentedLines(ctx, path)) {
    const kv = ZUD_KEY_VALUE.exec(ln.text);
    if (!kv) continue;
    const species = kv[1]!;
    ctx.attempt(ln.line, () => {
      if (banlist.includes(species)) throw new PbsError(`${species} is a banned raid species. Remove any raid rank entries for this species.`);
      const ranks = getCsvRecord(ctx, kv[2]!, [0, "*u"]) as number[];
      let included = false;
      for (const rank of ranks) {
        if (rank < 1 || rank > 6) continue;
        lists[rank - 1]!.push(species);
        included = true;
      }
      if (included) lists[6]!.push(species);
      firstLine.set(species, firstLine.get(species) ?? ln.line);
    });
  }
  lists.forEach((list, i) => {
    if (list.length < 5) ctx.error(null, `Raid Rank ${i + 1} doesn't contain enough species. Each Raid Rank should contain at least five exclusive species.`);
    const seen = new Set<string>();
    for (const s of list) {
      if (seen.has(s)) ctx.error(firstLine.get(s) ?? null, `Raid Rank ${i + 1} has species ${s} listed twice.`);
      seen.add(s);
    }
  });
  return { ranks: lists.slice(0, 6), total: lists[6]!, banned: lists[7]! };
}

//------------------------------------------------------------------------------
// ZUD: power moves
//------------------------------------------------------------------------------
const POWER_MOVE_SCHEMA: Record<string, Schema> = {
  ZMove: ["zmove", "e", "Move"],
  MaxMove: ["maxmove", "e", "Move"],
  Type: ["type", "e", "Type"],
  Item: ["item", "e", "Item"],
  Move: ["move", "e", "Move"],
  Species: ["species", "*e", "Species"],
  Flag: ["flag", "s"],
  Ultra: ["ultra", "u"],
  Name: [0, "q"],
  Height: [0, "f"],
  Pokedex: [0, "q"],
  ...Object.fromEntries(
    ["Atk", "Def", "SpAtk", "SpDef", "Speed", "Acc", "Eva", "Omni"].flatMap((stat) =>
      [1, 2, 3].map((n) => [`${stat}Boost${n}`, [`${stat.toLowerCase()}_${n}`, "*e", "Move"] as Schema]),
    ),
  ),
  HealUser: ["heal_1", "*e", "Move"],
  HealSwitch: ["heal_2", "*e", "Move"],
  CritBoost: ["crit", "*e", "Move"],
  ResetStats: ["reset", "*e", "Move"],
  FocusOnUser: ["focus", "*e", "Move"],
};

/** GameData::PowerMove#initialize */
function makePowerMove(ctx: Ctx, h: Record<string, Value>): PowerMoveData {
  const id = h.id as string;
  const s = (k: string) => (h[k] === undefined ? null : (h[k] as string));
  const pm: PowerMoveData = {
    id,
    zmove: s("zmove"),
    ultra: h.ultra === undefined ? null : (h.ultra as number),
    maxmove: s("maxmove"),
    type: ctx.exists("Type", id) ? id : s("type"),
    item: s("item"),
    move: s("move"),
    species: h.species ? [...(h.species as string[])] : [],
    flag: s("flag"),
    gmax: id.includes("GMAX"),
  };
  if (id === "ZSTATUS") {
    const staged = (prefix: string, n: number): StagedMoves =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), (h[`${prefix}_${i + 1}`] as string[] | undefined) ?? []]));
    Object.assign(pm, {
      statusAtk: staged("atk", 3),
      statusDef: staged("def", 3),
      statusSpatk: staged("spatk", 3),
      statusSpdef: staged("spdef", 3),
      statusSpeed: staged("speed", 3),
      statusAcc: staged("acc", 3),
      statusEva: staged("eva", 3),
      statusOmni: staged("omni", 3),
      statusHeal: staged("heal", 2),
      statusCrit: (h.crit as string[] | undefined) ?? [],
      statusReset: (h.reset as string[] | undefined) ?? [],
      statusFocus: (h.focus as string[] | undefined) ?? [],
    });
  }
  return pm;
}

export function compilePowerMoves(ctx: Ctx, path = ctx.pbsPath("Plugins/ZUD/power_moves.txt")): void {
  const table = ctx.table<PowerMoveData>("PowerMove");
  table.clear();
  const species = ctx.table<SpeciesData>("Species");
  const gmaxData = new Map<string, Record<string, Value>>();
  const counters: Record<string, number> = { ZMOVE: 0, ULTRA: 0, GMAX: 0 };
  let hash: Record<string, Value> | null = null;
  const register = () => {
    if (hash) table.set(hash.id as string, makePowerMove(ctx, hash));
  };
  for (const ln of preppedLines(ctx, path)) {
    const header = LINE_SECTION.exec(ln.text);
    if (header) {
      register();
      const name = header[1]!;
      let id: string;
      if (name in counters) id = `${name}_${++counters[name]!}`;
      else if (name === "ZSTATUS" || ctx.exists("Type", name)) id = name;
      else {
        // ZUD `next`s here, so the lines that follow still go to the previous section.
        ctx.warn(ln.line, `Section [${name}] isn't a type, ZMOVE, ULTRA, GMAX or ZSTATUS; its lines apply to the previous section.`);
        continue;
      }
      if (table.has(id)) {
        ctx.error(ln.line, `Power Move ID '${id}' is used twice.`);
        hash = null;
        continue;
      }
      hash = { id };
      continue;
    }
    const kv = ZUD_KEY_VALUE.exec(ln.text);
    if (!kv) continue;
    if (!hash) {
      ctx.error(ln.line, "Expected a section at the beginning of the file.");
      continue;
    }
    const key = kv[1]!;
    const schema = POWER_MOVE_SCHEMA[key];
    if (!schema) continue;
    const h = hash;
    ctx.attempt(ln.line, () => {
      const value = getCsvRecord(ctx, kv[2]!, schema);
      const id = h.id as string;
      if (id.includes("GMAX") && !gmaxData.has(id)) gmaxData.set(id, {});
      if (key === "Name" || key === "Height" || key === "Pokedex") {
        const g = gmaxData.get(id);
        if (!g) throw new PbsError(`${key} is only valid in a [GMAX] section.`);
        if (key === "Height") {
          const n = rubyRound((value as number) * 10);
          if (n <= 0) throw new PbsError("Value for 'Height' in G-Max data can't be less than or close to 0");
          g[key] = n;
        } else g[key] = value;
      } else {
        h[schema[0] as string] = value;
      }
    }, { section: hash.id as string, key });
  }
  register();
  // Add all flagged forms to each relevant power move.
  for (const entry of table.values()) {
    if (!entry.flag) continue;
    const first = entry.species[0];
    if (entry.flag === "AllForms") {
      for (const sp of species.values()) if (sp.species === first) entry.species.push(sp.id);
    } else if (entry.flag.includes("_")) {
      const form = parseInt(entry.flag.split("_").pop()!, 10) || 0;
      for (const sp of species.values()) {
        if (sp.species !== first) continue;
        if (entry.flag.includes("AllFormsAbove") && sp.form < form) continue;
        if (entry.flag.includes("AllFormsBelow") && sp.form >= form) continue;
        entry.species.push(sp.id);
      }
      entry.species.shift();
      if (entry.species.length === 0) entry.species.push(null);
    }
    entry.species = uniq(entry.species);
  }
  // Add G-Max data to each relevant species.
  for (const entry of table.values()) {
    if (!entry.id.includes("GMAX") || entry.species.length === 0) continue;
    const g = gmaxData.get(entry.id) ?? {};
    for (const sp of entry.species) {
      const data = sp === null ? undefined : species.get(sp);
      if (!data) {
        ctx.error(null, `G-Max entry ${entry.id} lists species ${sp}, which doesn't exist.`);
        continue;
      }
      data.gmaxName = (g.Name as string | undefined) ?? null;
      data.gmaxHeight = (g.Height as number | undefined) ?? null;
      data.gmaxDex = (g.Pokedex as string | undefined) ?? null;
    }
  }
}

//------------------------------------------------------------------------------
// ZUD: Dynamax metrics
//------------------------------------------------------------------------------
const DYNAMAX_SCHEMA: Record<string, [keyof SpeciesMetricsData, Schema]> = {
  DmaxBackSprite: ["dmaxBackSprite", [0, "ii"]],
  DmaxFrontSprite: ["dmaxFrontSprite", [0, "ii"]],
  DmaxAltitude: ["dmaxAltitude", [0, "i"]],
  DmaxShadowX: ["dmaxShadowX", [0, "i"]],
  DmaxShadowSize: ["dmaxShadowSize", [0, "u"]],
  GmaxBackSprite: ["gmaxBackSprite", [0, "ii"]],
  GmaxFrontSprite: ["gmaxFrontSprite", [0, "ii"]],
  GmaxAltitude: ["gmaxAltitude", [0, "i"]],
  GmaxShadowX: ["gmaxShadowX", [0, "i"]],
  GmaxShadowSize: ["gmaxShadowSize", [0, "u"]],
};

/** ZUD's compile_dynamax_metrics (reads dynamax_metrics_ebdx.txt when the Gen 8 Pack is installed). */
export function compileDynamaxMetrics(ctx: Ctx, defaults: MetricsDefaults, path: string): void {
  const metrics = ctx.table<SpeciesMetricsData>("SpeciesMetrics");
  for (const sp of ctx.table<SpeciesData>("Species").values()) {
    if (sp.noDynamax || metrics.has(sp.id)) continue;
    metrics.set(sp.id, makeMetrics({ id: sp.id, species: sp.species, form: sp.form }, defaults));
  }
  if (!existsSync(path)) {
    ctx.setFile(path);
    ctx.error(null, "File not found (ZUD would auto-position Dynamax sprites and write it).");
    return;
  }
  for (const section of eachFileSection(ctx, path)) {
    const data = metrics.get(section.name);
    if (!data) continue;
    for (const [key, [field, schema]] of Object.entries(DYNAMAX_SCHEMA)) {
      const entry = section.entries.get(key);
      if (!entry || entry.value.length === 0) continue;
      ctx.attempt(entry.line, () => {
        const value = getCsvRecord(ctx, entry.value, schema);
        (data as unknown as Record<string, Value>)[field] = value;
      }, { section: section.name, key });
    }
  }
}

export const zudMetricsFile = (ctx: Ctx): string =>
  ctx.pbsPath(ctx.ruby.installedPlugins.has("Generation 8 Pack Scripts") ? "Plugins/ZUD/dynamax_metrics_ebdx.txt" : "Plugins/ZUD/dynamax_metrics.txt");

