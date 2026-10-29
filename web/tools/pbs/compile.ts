// Compiles the game's PBS files into JSON for the web runtime, the way
// Essentials v20.1's Compiler.compile_all does (as extended by Essentials
// Deluxe for plugin data). PBS stays the source of truth.
//
//   node tools/pbs/compile.ts [pbsDir] [outDir]     (or `pnpm pbs`)
//
// Defaults: ../PBS → data/pbs, relative to web/.

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Report } from "../../src/data/pbs/types.ts";
import {
  compileAbilities,
  compileBerryPlants,
  compileConnections,
  compileItems,
  compileMoves,
  compilePhone,
  compileRegionalDexes,
  compileRibbons,
  compileShadowPokemon,
  compileTownMap,
  compileTypes,
} from "./compileBasic.ts";
import {
  checkPluginOverlays,
  compileDynamaxMetrics,
  compileFieldSkills,
  compileLairMaps,
  compilePowerMoves,
  compileRaidRanks,
  zudMetricsFile,
} from "./compilePlugins.ts";
import { compilePokemon, compilePokemonForms, compilePokemonMetrics, type SpeciesSettings } from "./compileSpecies.ts";
import { compileTrainerLists, compileTrainers, compileTrainerTypes } from "./compileTrainers.ts";
import { compileEncounters, compileMapMetadata, compileMetadata } from "./compileWorld.ts";
import { Ctx } from "./context.ts";
import { loadRubySources } from "./scripts.ts";

/** GameData classes backed by PBS files (anything else is a hardcoded enum from the scripts). */
const PBS_CLASSES = [
  "Type",
  "Ability",
  "Move",
  "Item",
  "BerryPlant",
  "Species",
  "SpeciesMetrics",
  "ShadowPokemon",
  "Ribbon",
  "Encounter",
  "TrainerType",
  "Trainer",
  "PowerMove",
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (entry.endsWith(".txt")) out.push(full);
  }
  return out;
}

/** One record (or top-level key) per line keeps the files diffable without bloating them. */
function toJson(data: unknown): string {
  if (Array.isArray(data)) return data.length === 0 ? "[]\n" : `[\n${data.map((d) => JSON.stringify(d)).join(",\n")}\n]\n`;
  if (data && typeof data === "object") {
    const lines = Object.entries(data).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return `{\n${lines.join(",\n")}\n}\n`;
  }
  return `${JSON.stringify(data)}\n`;
}

/**
 * Compiles every PBS file Essentials (and this game's installed plugins) reads
 * from pbsDir, writing one JSON file per data type into outDir. The game's Ruby
 * scripts are read from pbsDir's parent (Data/Scripts, Plugins).
 */
export function compileAll(pbsDir: string, outDir: string): Report {
  const absPbs = resolve(pbsDir);
  const gameRoot = dirname(absPbs);
  const ruby = loadRubySources(gameRoot);
  const ctx = new Ctx(gameRoot, absPbs, ruby);
  for (const cls of PBS_CLASSES) ctx.table(cls);

  const plugins = ruby.installedPlugins;
  const zud = plugins.has("ZUD Mechanics");
  const extraBanned = ruby.find(/banned\s*\+=\s*\[([^\]]*)\]/);
  const settings: SpeciesSettings = {
    dynamaxBanlist: zud
      ? [...ruby.symbolArray("DYNAMAX_BANLIST"), ...[...(extraBanned?.[1] ?? "").matchAll(/:(\w+)/g)].map((m) => m[1]!)]
      : [],
    metrics: plugins.has("Generation 8 Pack Scripts")
      ? { frontSpriteScale: ruby.intConst("FRONT_BATTLER_SPRITE_SCALE"), backSpriteScale: ruby.intConst("BACK_BATTLER_SPRITE_SCALE") }
      : { frontSpriteScale: 1, backSpriteScale: 1 },
  };
  const maxLevel = ruby.intConst("MAXIMUM_LEVEL");

  const out: Record<string, unknown> = {};
  // Compiler.compile_pbs_files, in its dependency order.
  out["town-map"] = compileTownMap(ctx);
  out["map-connections"] = compileConnections(ctx);
  out.phone = compilePhone(ctx);
  compileTypes(ctx);
  compileAbilities(ctx);
  compileMoves(ctx);
  compileItems(ctx);
  compileBerryPlants(ctx);
  compilePokemon(ctx, settings);
  compilePokemonForms(ctx, settings);
  compilePokemonMetrics(ctx, settings);
  compileShadowPokemon(ctx);
  out["regional-dexes"] = compileRegionalDexes(ctx);
  compileRibbons(ctx);
  compileEncounters(ctx, maxLevel);
  compileTrainerTypes(ctx);
  compileTrainers(ctx, {
    maxLevel,
    maxNameSize: ruby.intConst("MAX_NAME_SIZE"),
    ivStatLimit: ruby.intConst("IV_STAT_LIMIT"),
    evStatLimit: ruby.intConst("EV_STAT_LIMIT"),
    evLimit: ruby.intConst("EV_LIMIT"),
  });
  out["trainer-lists"] = compileTrainerLists(ctx, ruby.intConst("MAX_MOVES"));
  const { metadata, players } = compileMetadata(ctx);
  out.metadata = metadata;
  out["player-metadata"] = players;
  out["map-metadata"] = compileMapMetadata(ctx);

  // Essentials Deluxe's compile_all: plugin data.
  const pluginFolders = ["Essentials Deluxe"];
  if (zud) pluginFolders.push("ZUD");
  if (plugins.has("Improved Field Skills")) pluginFolders.push("Improved Field Skills");
  checkPluginOverlays(ctx, pluginFolders);
  let staleFieldSkills = 0;
  if (plugins.has("Improved Field Skills")) staleFieldSkills = compileFieldSkills(ctx);
  if (zud) {
    out["adventure-maps"] = compileLairMaps(ctx);
    out["raid-ranks"] = compileRaidRanks(ctx);
    compilePowerMoves(ctx);
    compileDynamaxMetrics(ctx, settings.metrics, zudMetricsFile(ctx));
  }

  const tables: Record<string, string> = {
    types: "Type",
    abilities: "Ability",
    moves: "Move",
    items: "Item",
    "berry-plants": "BerryPlant",
    species: "Species",
    "species-metrics": "SpeciesMetrics",
    "shadow-pokemon": "ShadowPokemon",
    ribbons: "Ribbon",
    encounters: "Encounter",
    "trainer-types": "TrainerType",
    trainers: "Trainer",
  };
  if (zud) tables["power-moves"] = "PowerMove";
  for (const [file, cls] of Object.entries(tables)) out[file] = [...ctx.table(cls).values()];

  mkdirSync(outDir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const name of Object.keys(out).sort()) {
    const data = out[name];
    writeFileSync(join(outDir, `${name}.json`), toJson(data));
    counts[`${name}.json`] = Array.isArray(data) ? data.filter((d) => d !== null).length : data === null ? 0 : 1;
  }

  if (staleFieldSkills > 0) {
    ctx.issues.push({
      severity: "warning",
      file: "PBS/Plugins/Improved Field Skills/field_skills.txt",
      line: null,
      message: `${staleFieldSkills} species' skills differ from this file; Improved Field Skills regenerates it from species data on every compile, as this compiler does.`,
    });
  }
  const sources = [...ctx.sources].sort();
  const unread = listFiles(absPbs)
    .map((f) => relative(gameRoot, f).split("\\").join("/"))
    .filter((f) => !ctx.sources.has(f))
    .sort();
  return { counts, sources, issues: ctx.issues, unread };
}

function main(): void {
  const webDir = resolve(import.meta.dirname, "../..");
  const pbsDir = resolve(process.argv[2] ?? join(webDir, "../PBS"));
  const outDir = resolve(process.argv[3] ?? join(webDir, "data/pbs"));
  const started = performance.now();
  const report = compileAll(pbsDir, outDir);
  const ms = Math.round(performance.now() - started);
  console.log(`Compiled ${report.sources.length} PBS files into ${relative(process.cwd(), outDir) || "."} in ${ms} ms:`);
  for (const [file, count] of Object.entries(report.counts)) console.log(`  ${file.padEnd(24)} ${count}`);
  const errors = report.issues.filter((i) => i.severity === "error");
  const warnings = report.issues.filter((i) => i.severity === "warning");
  for (const i of [...errors, ...warnings]) {
    const where = i.line === null ? i.file : `${i.file}:${i.line}`;
    const ctx = [i.section && `[${i.section}]`, i.key].filter(Boolean).join(" ");
    console.log(`${i.severity === "error" ? "error" : "warn "} ${where}${ctx ? ` ${ctx}` : ""}: ${i.message}`);
  }
  console.log(`Not read (no compiler or installed plugin uses them): ${report.unread.length} files`);
  for (const f of report.unread) console.log(`  ${f}`);
  console.log(`${errors.length} errors, ${warnings.length} warnings`);
  if (errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
