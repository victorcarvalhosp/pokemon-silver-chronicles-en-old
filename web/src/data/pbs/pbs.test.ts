// Compiles the game's PBS files with tools/pbs (into a temp dir) and checks the
// result: record counts, spot checks against PBS values, and that every ID one
// record uses points at a record that exists.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AbilityData,
  EncounterData,
  ItemData,
  MapMetadataData,
  MetadataData,
  MoveData,
  PlayerMetadataData,
  PowerMoveData,
  RaidRanks,
  RegionalDexes,
  Report,
  SpeciesData,
  SpeciesMetricsData,
  TrainerData,
  TrainerList,
  TrainerTypeData,
  TypeData,
} from "./types";

const GAME = resolve(__dirname, "../../../..");
const PBS = join(GAME, "PBS");

// The compiler is Node-run TypeScript with .ts import specifiers, which the app's
// tsconfig doesn't allow, so it is imported by path at runtime (tools/pbs has its own tsconfig).
async function loadCompiler(): Promise<(pbsDir: string, outDir: string) => Report> {
  const path = resolve(__dirname, "../../../tools/pbs/compile.ts");
  const mod = (await import(/* @vite-ignore */ path)) as { compileAll: (pbsDir: string, outDir: string) => Report };
  return mod.compileAll;
}

let out = "";
let report: Report;
const read = <T>(file: string): T => JSON.parse(readFileSync(join(out, file), "utf8")) as T;

/** Section headers in a PBS file (lines starting with "["). */
function sections(file: string): string[] {
  return readFileSync(join(PBS, file), "utf8")
    .split("\n")
    .map((l) => l.replace(/^﻿/, "").trim())
    .filter((l) => l.startsWith("["))
    .map((l) => l.replace(/\s*#.*$/, ""));
}

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "pbs-test-"));
  report = (await loadCompiler())(PBS, out);
}, 60_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

describe("PBS compile", () => {
  it("compiles without errors", () => {
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("writes every data file, with counts matching the files", () => {
    const expected = [
      "abilities", "adventure-maps", "berry-plants", "encounters", "items", "map-connections", "map-metadata",
      "metadata", "moves", "phone", "player-metadata", "power-moves", "raid-ranks", "regional-dexes", "ribbons",
      "shadow-pokemon", "species", "species-metrics", "town-map", "trainer-lists", "trainer-types", "trainers", "types",
    ];
    expect(Object.keys(report.counts).sort()).toEqual(expected.map((f) => `${f}.json`).sort());
    for (const [file, count] of Object.entries(report.counts)) {
      const data = read<unknown>(file);
      if (Array.isArray(data)) expect(data.filter((d) => d !== null).length, file).toBe(count);
    }
  });

  it("has one record per PBS section", () => {
    const counts: [string, string][] = [
      ["types.json", "types.txt"],
      ["abilities.json", "abilities.txt"],
      ["moves.json", "moves.txt"],
      ["items.json", "items.txt"],
      ["berry-plants.json", "berry_plants.txt"],
      ["ribbons.json", "ribbons.txt"],
      ["shadow-pokemon.json", "shadow_pokemon.txt"],
      ["trainer-types.json", "trainer_types.txt"],
      ["encounters.json", "encounters.txt"],
      ["map-metadata.json", "map_metadata.txt"],
    ];
    for (const [json, txt] of counts) expect(report.counts[json], json).toBe(sections(txt).length);
    expect(report.counts["species.json"]).toBe(sections("pokemon.txt").length + sections("pokemon_forms.txt").length);
    // A repeated [type,name,version] replaces the earlier trainer, as GameData::Trainer.register does.
    expect(report.counts["trainers.json"]).toBe(new Set(sections("trainers.txt")).size);
    expect(report.counts["player-metadata.json"]! + report.counts["metadata.json"]!).toBe(sections("metadata.txt").length);
  });

  it("lists which PBS files no compiler reads", () => {
    expect(report.unread).toContain("PBS/items copy.txt");
    expect(report.unread).toContain("PBS/tm.txt");
    expect(report.unread.some((f) => f.startsWith("PBS/Gen 8/"))).toBe(true);
    expect(report.sources).toContain("PBS/Plugins/ZUD/power_moves.txt");
    expect(report.sources).toContain("PBS/cup_poke_pkmn.txt");
  });
});

describe("spot checks", () => {
  const species = () => new Map(read<SpeciesData[]>("species.json").map((s) => [s.id, s]));

  it("species base data", () => {
    const bulbasaur = species().get("BULBASAUR")!;
    // PBS order is HP, Atk, Def, Speed, SpAtk, SpDef.
    expect(bulbasaur.baseStats).toEqual({ HP: 45, ATTACK: 49, DEFENSE: 49, SPECIAL_ATTACK: 65, SPECIAL_DEFENSE: 65, SPEED: 45 });
    expect(bulbasaur.types).toEqual(["GRASS", "POISON"]);
    expect(bulbasaur.evolutions).toEqual([{ species: "IVYSAUR", method: "Level", parameter: 16, prevolution: false }]);
    expect(bulbasaur.moves[0]).toEqual({ level: 1, move: "TACKLE" });
    expect(bulbasaur.height).toBe(7); // 0.7 m, stored in tenths
    expect(species().get("IVYSAUR")!.evolutions).toEqual([
      { species: "VENUSAUR", method: "Level", parameter: 32, prevolution: false },
      { species: "BULBASAUR", method: "Level", parameter: 16, prevolution: true },
    ]);
  });

  it("forms inherit from their base species", () => {
    const all = species();
    const alolan = all.get("RAICHU_1")!;
    const raichu = all.get("RAICHU")!;
    expect(alolan.species).toBe("RAICHU");
    expect(alolan.form).toBe(1);
    expect(alolan.formName).toBe("Alolan");
    expect(alolan.types).toEqual(["ELECTRIC", "PSYCHIC"]);
    expect(alolan.baseStats.SPECIAL_ATTACK).toBe(95);
    expect(alolan.moves[0]).toEqual({ level: 0, move: "PSYCHIC" });
    expect(alolan.name).toBe(raichu.name);
    expect(alolan.growthRate).toBe(raichu.growthRate);
    expect(alolan.pokedexForm).toBe(1);
    expect(alolan.evolutions.find((e) => e.prevolution)?.species).toBe("PIKACHU");
  });

  it("moves", () => {
    const moves = new Map(read<MoveData[]>("moves.json").map((m) => [m.id, m]));
    expect(moves.get("SURF")).toMatchObject({ type: "WATER", category: 1, baseDamage: 90, accuracy: 100, totalPp: 15 });
    expect(moves.get("THUNDERBOLT")).toMatchObject({ type: "ELECTRIC", baseDamage: 90, functionCode: "ParalyzeTarget", effectChance: 10 });
  });

  it("items", () => {
    const items = new Map(read<ItemData[]>("items.json").map((i) => [i.id, i]));
    expect(items.get("POTION")).toMatchObject({ pocket: 2, price: 200, sellPrice: 100, fieldUse: 1, battleUse: 1, consumable: true });
    expect(items.get("RARECANDY")).toMatchObject({ name: "Rare Candy", namePlural: "Rare Candies", pocket: 2, price: 10000, sellPrice: 5000 });
    expect(items.get("TM01")).toMatchObject({ fieldUse: 3, move: "FOCUSPUNCH", consumable: false });
  });

  it("trainers", () => {
    const trainers = read<TrainerData[]>("trainers.json");
    const falkner = trainers.find((t) => t.trainerType === "LEADER_Falkner" && t.name === "Falkner" && t.version === 0)!;
    expect(falkner.items).toEqual(["DYNAMAXBAND"]);
    expect(falkner.loseText).toBe("I understand...I'll blow out gracefully...");
    expect(falkner.pokemon[0]).toEqual({ species: "PIDGEY", level: 10, moves: ["SANDATTACK", "QUICKATTACK", "GUST", "MUDSLAP"] });
    expect(falkner.pokemon[2]).toMatchObject({ species: "SKARMORY", level: 12, gender: 0 });
    const types = new Map(read<TrainerTypeData[]>("trainer-types.json").map((t) => [t.id, t]));
    const youngster = types.get("YOUNGSTER")!;
    expect(youngster.skillLevel).toBeGreaterThan(0);
  });

  it("encounters", () => {
    const route29 = read<EncounterData[]>("encounters.json").find((e) => e.id === "4_0")!;
    expect(route29.stepChances.LandDay).toBe(21);
    expect(route29.types.LandDay![0]).toEqual({ chance: 20, species: "PIDGEY", minLevel: 3, maxLevel: 3 });
    // Slots are sorted by descending chance.
    const chances = route29.types.LandNight!.map((s) => s.chance);
    expect(chances).toEqual([...chances].sort((a, b) => b - a));
  });

  it("metadata", () => {
    const meta = read<MetadataData>("metadata.json");
    expect(meta.home).toEqual([3, 12, 8, 8]);
    expect(meta.startItemStorage).toEqual(["POTION"]);
    expect(read<PlayerMetadataData[]>("player-metadata.json")[0]).toMatchObject({ id: 1, trainerType: "PkMnTRAINER_Male", walkCharset: "hero_male_walk" });
    const newBark = read<MapMetadataData[]>("map-metadata.json").find((m) => m.id === 1)!;
    expect(newBark).toMatchObject({ name: "New Bark Town", outdoorMap: true, announceLocation: true, townMapPosition: [0, 23, 13] });
  });

  it("plugin data", () => {
    const charizard = species().get("CHARIZARD")!;
    expect(charizard.gmaxName).toBe("Gigantamax Charizard");
    expect(charizard.fieldSkills).toContain("FLY");
    expect(species().get("VENUSAUR_1")!.noDynamax).toBe(true); // Mega form
    const metrics = new Map(read<SpeciesMetricsData[]>("species-metrics.json").map((m) => [m.id, m]));
    expect(metrics.get("CHARIZARD")!.backSpriteScale).toBe(2);
    expect(read<RaidRanks>("raid-ranks.json").ranks).toHaveLength(6);
  });
});

describe("cross-references", () => {
  const ids = <T extends { id: unknown }>(file: string) => new Set(read<T[]>(file).map((r) => r.id as string));
  /** Collects references that don't resolve, as "where: id". */
  const missing: string[] = [];
  const check = (set: Set<string>, id: string | null | undefined, where: string) => {
    if (id !== null && id !== undefined && !set.has(id)) missing.push(`${where}: ${id}`);
  };

  it("every referenced ID exists", () => {
    const types = ids<TypeData>("types.json");
    const moves = ids<MoveData>("moves.json");
    const items = ids<ItemData>("items.json");
    const abilities = ids<AbilityData>("abilities.json");
    const speciesList = read<SpeciesData[]>("species.json");
    const species = new Set(speciesList.map((s) => s.id));
    const trainerTypes = ids<TrainerTypeData>("trainer-types.json");
    const itemData = new Map(read<ItemData[]>("items.json").map((i) => [i.id, i]));

    for (const t of read<TypeData[]>("types.json")) for (const o of [...t.weaknesses, ...t.resistances, ...t.immunities]) check(types, o, `type ${t.id}`);
    for (const m of read<MoveData[]>("moves.json")) check(types, m.type, `move ${m.id}`);
    for (const i of itemData.values()) check(moves, i.move, `item ${i.id}`);
    for (const s of speciesList) {
      const where = `species ${s.id}`;
      for (const t of s.types) check(types, t, where);
      for (const m of s.moves) check(moves, m.move, `${where} moves`);
      for (const m of [...s.tutorMoves, ...s.eggMoves, ...s.fieldSkills]) check(moves, m, `${where} tutor/egg/skills`);
      for (const a of [...s.abilities, ...s.hiddenAbilities]) check(abilities, a, `${where} abilities`);
      for (const i of [...s.wildItemCommon, ...s.wildItemUncommon, ...s.wildItemRare]) check(items, i, `${where} wild items`);
      check(items, s.incense, `${where} incense`);
      check(items, s.megaStone, `${where} mega stone`);
      check(moves, s.megaMove, `${where} mega move`);
      for (const o of s.offspring) check(species, o, `${where} offspring`);
      for (const e of s.evolutions) {
        check(species, e.species, `${where} evolution`);
        // LocationFlag's parameter is a map flag (GameData::Evolution parameter String), not an ID.
        if (typeof e.parameter !== "string" || e.method === "None" || e.method === "LocationFlag") continue;
        if (itemData.has(e.parameter) || moves.has(e.parameter) || species.has(e.parameter) || types.has(e.parameter)) continue;
        missing.push(`${where} evolution ${e.method} parameter: ${e.parameter}`);
      }
      check(species, s.species, `${where} base species`);
    }
    for (const m of read<SpeciesMetricsData[]>("species-metrics.json")) check(species, m.species, `metrics ${m.id}`);
    for (const t of read<TrainerData[]>("trainers.json")) {
      const where = `trainer ${t.id.join(",")}`;
      check(trainerTypes, t.trainerType, where);
      for (const i of t.items) check(items, i, `${where} items`);
      for (const p of t.pokemon) {
        check(species, p.species, `${where} party`);
        check(items, p.item, `${where} held item`);
        check(items, p.pokeBall, `${where} ball`);
        check(abilities, p.ability, `${where} ability`);
        for (const m of p.moves ?? []) check(moves, m, `${where} moves`);
      }
    }
    for (const e of read<EncounterData[]>("encounters.json")) {
      for (const [type, slots] of Object.entries(e.types)) for (const s of slots) check(species, s.species, `encounters ${e.id} ${type}`);
    }
    read<RegionalDexes>("regional-dexes.json").forEach((dex, i) => dex?.forEach((s) => check(species, s, `regional dex ${i}`)));
    for (const b of read<{ id: string }[]>("berry-plants.json")) check(items, b.id, "berry plant");
    for (const sh of read<{ id: string }[]>("shadow-pokemon.json")) check(species, sh.id, "shadow pokemon");
    for (const p of read<PlayerMetadataData[]>("player-metadata.json")) check(trainerTypes, p.trainerType, `player ${p.id}`);
    for (const i of read<MetadataData>("metadata.json").startItemStorage) check(items, i, "metadata start items");
    for (const pm of read<PowerMoveData[]>("power-moves.json")) {
      for (const m of [pm.zmove, pm.maxmove, pm.move]) check(moves, m, `power move ${pm.id}`);
      check(items, pm.item, `power move ${pm.id}`);
      check(types, pm.type, `power move ${pm.id}`);
      for (const s of pm.species) check(species, s, `power move ${pm.id}`);
    }
    const raid = read<RaidRanks>("raid-ranks.json");
    for (const s of [...raid.total, ...raid.banned]) check(species, s, "raid ranks");
    for (const list of read<TrainerList[]>("trainer-lists.json")) {
      for (const t of list.trainers) {
        check(trainerTypes, t.trainerType, `${list.trainersFile} ${t.name}`);
        for (const n of t.pokemonNos ?? []) if (n >= list.pokemon.length) missing.push(`${list.trainersFile} ${t.name}: pokemon #${n}`);
      }
      for (const p of list.pokemon) {
        check(species, p.species, list.pokemonFile);
        check(items, p.item, list.pokemonFile);
        for (const m of [p.move1, p.move2, p.move3, p.move4]) check(moves, m, list.pokemonFile);
      }
    }
    expect(missing).toEqual([]);
  });
});
