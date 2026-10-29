// Tests for the PBS writers (Compiler.write_*): the CSV helpers, the text of
// the files written from the loaded GameData compared with the game's PBS
// files, a round trip (write every file, compile it back with tools/pbs, get
// the same JSON) and the writers' file writes and console output.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const consoleLog: string[] = [];
const writes: { path: string; content: string }[] = [];
let updates = 0;
vi.mock("../debug/DebugConsole", () => ({
  Console: {
    echoLi: (msg: string) => consoleLog.push(`li ${msg}`),
    echoDone: (status: boolean) => consoleLog.push(`done ${status}`),
    echoH1: (msg: string) => consoleLog.push(`h1 ${msg}`),
    echoH2: (msg: string) => consoleLog.push(`h2 ${msg}`),
  },
  echo: (msg: string) => consoleLog.push(`echo ${msg}`),
  echoln: (msg: string) => consoleLog.push(`echoln ${msg}`),
}));
vi.mock("../debug/devFiles", () => ({
  DevFiles: { write: async (path: string, content: string) => void writes.push({ path, content }) },
}));
vi.mock("../rgss/Graphics", () => ({ Graphics: { update: async () => void (updates += 1) } }));

import type { MapConnection, Report, TrainerList } from "../data/pbs/types";
import { loadGameDataForTests } from "../data/gameData/testing";
import { Data } from "../data/store";
import type { MapInfo } from "../data/types";
import { PbsFile, csvQuote, pbWriteCsvRecord } from "./Compiler";
import { Compiler, PBSText } from "./WritePBS";

const GAME = resolve(__dirname, "../../..");
const DATA = join(GAME, "web/data");
const json = <T>(file: string) => JSON.parse(readFileSync(join(DATA, file), "utf8")) as T;
/** A PBS file without its BOM, with LF line ends. */
const norm = (text: string) => text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
const pbsFile = (name: string) => norm(readFileSync(join(GAME, "PBS", name), "utf8"));

beforeAll(() => {
  loadGameDataForTests();
  for (const info of json<MapInfo[]>("map-infos.json")) Data.mapInfos.set(info.id, info);
});

describe("CSV helpers (001_Compiler.rb)", () => {
  const write = (record: unknown, schema: readonly unknown[]) => {
    const f = new PbsFile("PBS/test.txt");
    pbWriteCsvRecord(record, f, schema as never);
    return f.content;
  };

  it("csvQuote quotes text with commas or quotes", () => {
    expect(csvQuote("Route 29")).toBe("Route 29");
    expect(csvQuote('Say "hi", then go')).toBe('"Say \\"hi\\", then go"');
    expect(csvQuote(null)).toBe("");
    expect(csvQuote("x", true)).toBe('"x"');
  });

  it("pbWriteCsvRecord writes values per the schema", () => {
    expect(write([26, 13, "Route 29", "", null, null, null, null], [null, "uussUUUU"])).toBe("26,13,Route 29,,,,,");
    expect(write(["Rain", 50], [7, "eu", "Weather"])).toBe("Rain,50");
    expect(write(["A", "B, C"], [22, "*s"])).toBe('A,"B, C"');
    expect(write(true, [2, "b"])).toBe("true");
    expect(write(2, [0, "e", ["Physical", "Special", "Status"]])).toBe("Status");
    expect(write(3, [0, "e", { TM: 3, HM: 4 }])).toBe("TM");
    expect(write(9, [0, "y", { TM: 3 }])).toBe("9");
    expect(write([[1, "TACKLE"], [5, "GROWL"]], [0, "*ue"])).toBe("1,TACKLE,5,GROWL");
  });
});

describe("text written from GameData", () => {
  it("starts with the BOM and the wiki header, sections separated with CRLF", () => {
    const text = PBSText.types()!;
    expect(text.startsWith("﻿# See the documentation on the wiki to learn how to edit this file.\r\n#-------------------------------\r\n[NORMAL]\r\n")).toBe(true);
  });

  // These files are as Ruby's writers wrote them.
  it.each(["types.txt", "moves.txt", "pokemon.txt", "pokemon_metrics.txt", "berry_plants.txt", "ribbons.txt",
    "shadow_pokemon.txt", "phone.txt", "town_map.txt"])("%s matches the game's PBS file", (file) => {
    const text = {
      "types.txt": PBSText.types, "moves.txt": PBSText.moves, "pokemon.txt": PBSText.pokemon,
      "pokemon_metrics.txt": PBSText.pokemonMetrics, "berry_plants.txt": PBSText.berryPlants, "ribbons.txt": PBSText.ribbons,
      "shadow_pokemon.txt": PBSText.shadowPokemon, "phone.txt": PBSText.phone, "town_map.txt": PBSText.townMap,
    }[file]!();
    expect(norm(text!)).toBe(pbsFile(file));
  });

  it("abilities.txt matches the game's except where the file puts Flags before Description", () => {
    const text = norm(PBSText.abilities()!);
    const movedFlags = (s: string) => s.replace(/\nFlags = (\w+)\nDescription = ([^\n]*)/g, "\nDescription = $2\nFlags = $1");
    expect(text).toBe(movedFlags(pbsFile("abilities.txt")));
  });

  it("items.txt and trainer_types.txt match the game's but for hand-edited whitespace", () => {
    const tidy = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l !== "#-------------------------------").join("\n").trim();
    expect(tidy(norm(PBSText.items()!))).toBe(tidy(pbsFile("items.txt")));
    expect(tidy(norm(PBSText.trainerTypes()!))).toBe(tidy(pbsFile("trainer_types.txt")));
  });

  it("map connections are written with the edge letters the compiler keeps", () => {
    const text = PBSText.connections(json<MapConnection[]>("pbs/map-connections.json"))!;
    expect(text).toContain("# New Bark Town (1) - Route 29 (4)\r\n1,W,0,4,E,2\r\n");
  });

  it("writes the Battle Frontier files each trainer list names", () => {
    const files = PBSText.trainerLists(json<TrainerList[]>("pbs/trainer-lists.json"));
    expect([...files.keys()]).toContain("PBS/battle_facility_lists.txt");
    expect([...files.keys()]).toContain("PBS/battle_tower_trainers.txt");
    expect(norm(files.get("PBS/battle_tower_trainers.txt")!)).toContain(
      "[000]\nType = YOUNGSTER\nName = BRADY\nBeginSpeech = I AM NEVER GOING TO LOSE !\nEndSpeechWin = I AM STRONG AREN'T I ?\nEndSpeechLose = WHAT ? BUT HOW ?\nPokemonNos = 0,1,");
    // An item that doesn't exist (STICK) is left out, as in Ruby.
    expect(norm(files.get("PBS/battle_tower_pokemon.txt")!)).toContain("\nFARFETCHD;;RELAXED;HP,DEF,SD;SLASH,KNOCKOFF,SWORDSDANCE,AGILITY\n");
  });

  it("power_moves.txt writes a flagged entry's first species (none left for AllFormsAbove_7, as in ZUD)", () => {
    const text = norm(PBSText.powerMoves()!);
    expect(text).toContain("[ZMOVE]\nZMove   = CATASTROPIKA\nItem    = PIKANIUMZ\nMove    = VOLTTACKLE\nSpecies = PIKACHU\nFlag    = AllForms\n");
    expect(text).toContain("Move    = THUNDERBOLT\nSpecies = \nFlag    = AllFormsAbove_7\n");
    expect(text).toContain("[ZSTATUS]\nAtkBoost1 = BULKUP,");
  });

  it("field_skills.txt matches the plugin's file", () => {
    expect(norm(PBSText.fieldSkills()!)).toBe(pbsFile("Plugins/Improved Field Skills/field_skills.txt"));
  });
});

describe("round trip through the PBS compiler", () => {
  let root = "";
  let report: Report;
  const out = () => join(root, "out");

  beforeAll(async () => {
    // A copy of PBS overwritten with every file the writers write, next to the real scripts.
    root = mkdtempSync(join(tmpdir(), "pbs-write-"));
    for (const dir of ["Data", "Plugins", "Graphics"]) symlinkSync(join(GAME, dir), join(root, dir));
    cpSync(join(GAME, "PBS"), join(root, "PBS"), { recursive: true, filter: (src) => !/[/\\](Gen \d|EBDX)$/.test(src) });
    const files = new Map<string, string | null>([
      ["PBS/town_map.txt", PBSText.townMap()],
      ["PBS/map_connections.txt", PBSText.connections(json<MapConnection[]>("pbs/map-connections.json"))],
      ["PBS/phone.txt", PBSText.phone()],
      ["PBS/types.txt", PBSText.types()],
      ["PBS/abilities.txt", PBSText.abilities()],
      ["PBS/moves.txt", PBSText.moves()],
      ["PBS/items.txt", PBSText.items()],
      ["PBS/berry_plants.txt", PBSText.berryPlants()],
      ["PBS/pokemon.txt", PBSText.pokemon()],
      ["PBS/pokemon_forms.txt", PBSText.pokemonForms()],
      ["PBS/pokemon_metrics.txt", PBSText.pokemonMetrics()],
      ["PBS/shadow_pokemon.txt", PBSText.shadowPokemon()],
      ["PBS/regional_dexes.txt", PBSText.regionalDexes()],
      ["PBS/ribbons.txt", PBSText.ribbons()],
      ["PBS/encounters.txt", PBSText.encounters()],
      ["PBS/trainer_types.txt", PBSText.trainerTypes()],
      ["PBS/trainers.txt", PBSText.trainers()],
      ...PBSText.trainerLists(json<TrainerList[]>("pbs/trainer-lists.json")),
      ["PBS/metadata.txt", PBSText.metadata()],
      ["PBS/map_metadata.txt", PBSText.mapMetadata()],
      ["PBS/Plugins/Improved Field Skills/field_skills.txt", PBSText.fieldSkills()],
      ["PBS/Plugins/ZUD/dynamax_metrics_ebdx.txt", PBSText.dynamaxMetrics()],
      ["PBS/Plugins/ZUD/power_moves.txt", PBSText.powerMoves()],
      ["PBS/Plugins/ZUD/raid_ranks.txt", PBSText.raidRanks()],
      ["PBS/Plugins/ZUD/adventure_maps.txt", PBSText.lairMaps(json("pbs/adventure-maps.json"))],
    ]);
    for (const [path, text] of files) {
      expect(text, path).not.toBeNull();
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text!);
    }
    const tools = resolve(GAME, "web/tools/pbs/compile.ts");
    const { compileAll } = (await import(/* @vite-ignore */ tools)) as { compileAll: (p: string, o: string) => Report };
    report = compileAll(join(root, "PBS"), out());
  }, 120_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("compiles without errors but the species ZUD's writer loses", () => {
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([
      expect.objectContaining({ file: "PBS/Plugins/ZUD/power_moves.txt", key: "Species", message: "Undefined value  in GameData::Species" }),
    ]);
  });

  it.each([
    "abilities", "berry-plants", "encounters", "items", "map-connections", "map-metadata", "metadata", "moves", "phone",
    "player-metadata", "raid-ranks", "regional-dexes", "ribbons", "shadow-pokemon", "species", "species-metrics",
    "town-map", "trainer-lists", "trainer-types", "trainers", "types", "adventure-maps",
  ])("%s.json comes back the same", (name) => {
    const back = JSON.parse(readFileSync(join(out(), `${name}.json`), "utf8")) as unknown;
    expect(back).toEqual(json(`pbs/${name}.json`));
  });

  it("power-moves.json comes back the same but for the entry ZUD's writer loses the species of", () => {
    type PM = { id: string; species: (string | null)[]; flag: string | null };
    const back = JSON.parse(readFileSync(join(out(), "power-moves.json"), "utf8")) as PM[];
    const orig = json<PM[]>("pbs/power-moves.json");
    const lost = (pm: PM) => pm.flag?.includes("_") && pm.species[0] === null;
    expect(back.filter((pm) => !orig.some((o) => o.id === pm.id && lost(o)))).toEqual(orig.filter((pm) => !lost(pm)));
  });
});

describe("writing through the dev server", () => {
  it("Compiler.writeTypes says what it writes and writes it", async () => {
    consoleLog.length = 0;
    writes.length = 0;
    updates = 0;
    await Compiler.writeTypes();
    expect(consoleLog).toEqual(["li Writing PBS file `types.txt`...", "done true"]);
    expect(writes).toEqual([{ path: "PBS/types.txt", content: PBSText.types() }]);
    expect(updates).toBe(1);
  });

  it("Compiler.writeAll writes every PBS file, then the plugins' files", async () => {
    consoleLog.length = 0;
    writes.length = 0;
    const saved = Compiler.loadData;
    Compiler.loadData = async (file: string) => json(`pbs/${file}`);
    try {
      await Compiler.writeAll();
    } finally {
      Compiler.loadData = saved;
    }
    const paths = writes.map((w) => w.path);
    expect(paths.slice(0, 3)).toEqual(["PBS/town_map.txt", "PBS/map_connections.txt", "PBS/phone.txt"]);
    expect(paths).toContain("PBS/battle_facility_lists.txt");
    expect(paths.slice(-5)).toEqual([
      "PBS/Plugins/Improved Field Skills/field_skills.txt",
      "PBS/Plugins/ZUD/dynamax_metrics_ebdx.txt",
      "PBS/Plugins/ZUD/power_moves.txt",
      "PBS/Plugins/ZUD/raid_ranks.txt",
      "PBS/Plugins/ZUD/adventure_maps.txt",
    ]);
    expect(consoleLog[0]).toBe("h1 Writing all PBS files");
    expect(consoleLog).toContain("h2 Successfully rewrote all PBS files");
    expect(consoleLog.at(-1)).toBe("h2 Successfully compiled all additional PBS/Plugin files");
  });
});
