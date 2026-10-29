// The editors' data round trips (001-004 editor screens, Mystery Gift): open
// an editor's data, save it unchanged (the file comes out the same), edit a
// value, save, read the file back. Writes go through the real dev server
// endpoint (tools/devFiles.ts) over a temporary game root (testDevServer.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../DebugConsole", () => ({
  Console: { echoLi: () => {}, echoDone: () => {}, echoH1: () => {}, echoH2: () => {} },
  echo: () => {},
  echoln: () => {},
}));
// The writers call Graphics.update every 250 records: no frames run in tests.
vi.mock("../../rgss/Graphics", async (orig) => {
  const mod = await orig<typeof import("../../rgss/Graphics")>();
  mod.Graphics.update = async () => {};
  return mod;
});

import { PBSText } from "../../compiler/WritePBS";
import { GameData } from "../../data/gameData";
import { pbLoadRegionalDexes } from "../../data/gameData/miscPBSData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { Data, setMapConnections } from "../../data/store";
import type { MapInfo, Tileset } from "../../data/types";
import { G } from "../../game/globals";
import { metadata as globalMetadata, mapMetadata } from "../../game/metadata";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { Player } from "../../game/trainer/Player";
import { MysteryGift, pbMysteryGiftDecrypt, pbMysteryGiftEncrypt, pbRefreshMGCommands, type Gift } from "../../ui/MysteryGift";
import { EditorScreens } from "../editorScreens";
import { EditorDataSource, gameDataLoad } from "./EditorData";
import {
  generateEditorID, itemEditorData, itemEditorSave, mapMetadataEditorData, mapMetadataEditorSave, metadataEditorData,
  metadataEditorSave, pbEvoFamiliesToStrings, regionalDexesSave, slotToTuple, speciesEditorData, speciesEditorSave,
  trainerBattleEditorApply, trainerBattleEditorData, trainerPokemonData, trainerPokemonFromData, trainerTypeEditorData,
  trainerTypeEditorSave, tupleToSlot,
} from "./EditorScreens";
import { currentMapConnections, saveConnectionData, type Conn } from "./MapConnections";
import { findBottom, SpritePositioner } from "./SpritePositioning";
import { loadTilesetsData, saveTilesetsData, TILESETS_FILE } from "./TerrainTags";
import { GAME_ROOT, installTempDevServer, type TempDevServer } from "./testDevServer";
import "./index";

const PBS_DIR = join(GAME_ROOT, "web", "data", "pbs");
const json = <T>(file: string) => JSON.parse(readFileSync(join(GAME_ROOT, "web", "data", file), "utf8")) as T;
const norm = (text: string) => text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
const repoPbs = (name: string) => norm(readFileSync(join(GAME_ROOT, "PBS", name), "utf8"));
/** The lines of b that differ from a's. */
function changedLines(a: string, b: string): string[] {
  const count = new Map<string, number>();
  for (const l of a.split("\r\n")) count.set(l, (count.get(l) ?? 0) + 1);
  return b.split("\r\n").filter((l) => {
    const n = count.get(l) ?? 0;
    if (n > 0) count.set(l, n - 1);
    return n === 0;
  });
}

let server: TempDevServer;

beforeAll(() => {
  loadGameDataForTests();
  for (const info of json<MapInfo[]>("map-infos.json")) Data.mapInfos.set(info.id, info);
  for (const t of json<Tileset[]>("tilesets.json")) Data.tilesets.set(t.id, t);
  EditorDataSource.read = async (file) => JSON.parse(readFileSync(join(PBS_DIR, file), "utf8")) as unknown;
});

describe("editor screens", () => {
  beforeAll(() => {
    server = installTempDevServer({ [TILESETS_FILE]: true });
  });
  afterAll(() => server.restore());
  afterEach(async () => {
    // Undo the edits in the loaded data
    for (const cls of [GameData.Item, GameData.Species, GameData.SpeciesMetrics, GameData.Encounter,
      GameData.TrainerType, GameData.Trainer, GameData.MapMetadata]) await gameDataLoad(cls);
  });

  it("registers every editor screen in EditorScreens", () => {
    for (const name of ["pbMetadataScreen", "pbEditMetadata", "pbMapMetadataScreen", "pbEditMapMetadata",
      "pbConnectionsEditor", "pbTilesetScreen", "pbEncountersEditor", "pbTrainerTypeEditor", "pbTrainerTypeEditorNew",
      "pbTrainerBattleEditor", "pbItemEditor", "pbPokemonEditor", "pbRegionalDexEditorMain", "pbSpritePositioner",
      "pbAutoPositionAll", "pbAnimationEditor", "pbAnimationsOrganiser", "pbCreateMysteryGift", "pbManageMysteryGifts"]) {
      expect(typeof (EditorScreens as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("item editor: unchanged save gives the same items.txt; an edited price is written", async () => {
    const before = PBSText.items()!;
    await itemEditorSave("POTION", itemEditorData("POTION"));
    expect(server.read("PBS/items.txt")).toBe(before);
    const data = itemEditorData("POTION");
    data[4] = 321; // Price
    await itemEditorSave("POTION", data);
    const after = server.read("PBS/items.txt")!;
    expect(changedLines(before, after)).toEqual(["Price = 321", `SellPrice = ${data[5]}`]); // (SellPrice is no longer half the price)
    expect(GameData.Item.get("POTION").price).toBe(321);
  });

  it("species editor: unchanged save gives the game's pokemon.txt; an edit is written", async () => {
    const before = PBSText.pokemon()!;
    expect(norm(before)).toBe(repoPbs("pokemon.txt"));
    await speciesEditorSave("BULBASAUR", speciesEditorData("BULBASAUR"));
    expect(server.read("PBS/pokemon.txt")).toBe(before);
    const data = speciesEditorData("BULBASAUR");
    data[12] = 99; // CatchRate
    data[6] = data[5]; // Type 2 = Type 1: a single type
    await speciesEditorSave("BULBASAUR", data);
    expect(changedLines(before, server.read("PBS/pokemon.txt")!)).toEqual(["CatchRate = 99", "Types = GRASS"]);
  });

  it("trainer type editor: round trip and an edited base money", async () => {
    const before = PBSText.trainerTypes()!;
    const id = GameData.TrainerType.each()[0]!.id;
    await trainerTypeEditorSave(id, trainerTypeEditorData(id));
    expect(server.read("PBS/trainer_types.txt")).toBe(before);
    expect(server.read("PBS/trainers.txt")).toBe(PBSText.trainers());
    const data = trainerTypeEditorData(id);
    data[3] = 77;
    await trainerTypeEditorSave(id, data);
    expect(changedLines(before, server.read("PBS/trainer_types.txt")!)).toContain("BaseMoney = 77");
  });

  it("trainer battle editor: round trip, rename, and Essentials Deluxe's move bug", async () => {
    const tr = GameData.Trainer.each().find((t) => t.pokemon.some((p) => (p.moves?.length ?? 0) === 4))!;
    const id: [string, string, number] = [tr.trainerType, tr.realName, tr.version];
    const before = PBSText.trainers()!;
    expect(trainerBattleEditorApply(id, trainerBattleEditorData(id))).toBeNull();
    expect(PBSText.trainers()).toBe(before);
    // The property list's Pokémon data: the 4th move is lost (Trainer Data.rb:233)
    const pkmn = tr.pokemon.find((p) => (p.moves?.length ?? 0) === 4)!;
    const back = trainerPokemonFromData(trainerPokemonData(pkmn))!;
    expect(back.moves).toEqual(pkmn.moves!.slice(0, 3));
    expect(trainerPokemonFromData(trainerPokemonData({ ...pkmn, shadowness: true }))!.moves![0]).toBe(true);
    // Renaming moves the trainer
    const data = trainerBattleEditorData(id);
    data[1] = "Zed";
    expect(trainerBattleEditorApply(id, data)).toBeNull();
    expect(GameData.Trainer.exists(id[0], "Zed", id[2])).toBe(true);
    expect(GameData.Trainer.exists(...id)).toBe(false);
    data[1] = "";
    expect(trainerBattleEditorApply([id[0], "Zed", id[2]], data)).toMatch(/No name/);
  });

  it("encounter slots convert to the editor's [chance, species, min, max] and back", () => {
    const enc = GameData.Encounter.each()[0]!;
    const [type, slots] = Object.entries(enc.types)[0]!;
    for (const s of slots) expect(tupleToSlot(slotToTuple(s))).toEqual(s);
    expect(type).toBeTruthy();
  });

  it("global and map metadata editors: round trip and an edit", async () => {
    await metadataEditorSave(metadataEditorData());
    const metaBefore = server.read("PBS/metadata.txt")!;
    expect(metaBefore).toBe(PBSText.metadata());
    const data = metadataEditorData();
    data[0] = 1234; // StartMoney
    await metadataEditorSave(data);
    expect(changedLines(metaBefore, server.read("PBS/metadata.txt")!)).toEqual(["StartMoney = 1234"]);
    expect(globalMetadata().startMoney).toBe(1234);

    const mapId = GameData.MapMetadata.each()[0]!.id;
    const before = PBSText.mapMetadata()!;
    await mapMetadataEditorSave(mapId, mapMetadataEditorData(mapId));
    expect(server.read("PBS/map_metadata.txt")).toBe(before);
    const mdata = mapMetadataEditorData(mapId);
    mdata[13] = "forest"; // BattleBack
    await mapMetadataEditorSave(mapId, mdata);
    expect(changedLines(before, server.read("PBS/map_metadata.txt")!)).toContain("BattleBack = forest");
    expect(mapMetadata(mapId)?.battleBackground).toBe("forest");
  });

  it("regional dexes: round trip", async () => {
    const before = PBSText.regionalDexes()!;
    await regionalDexesSave(pbLoadRegionalDexes().map((d) => [...(d ?? [])]));
    expect(server.read("PBS/regional_dexes.txt")).toBe(before);
  });

  it("new item / trainer type IDs", () => {
    expect(generateEditorID("Poké Doll", "ITEM", 10, (i) => GameData.Item.exists(i))).toBe("POKEDOLL_1");
    expect(generateEditorID("Potion", "ITEM", 10, (i) => GameData.Item.exists(i))).toBe("POTION_1");
    expect(generateEditorID("9lives", "T", 5, () => false)).toBe("T_9LIVES");
    expect(generateEditorID("***", "T", 5, () => false)).toBe("T_005");
  });

  it("evolution families", () => {
    const fams = pbEvoFamiliesToStrings();
    expect(fams[0]).toBe("Bulbasaur/Ivysaur/Venusaur");
  });

  it("tileset editor: unchanged save is byte-identical; a terrain tag edit is the only change", async () => {
    const original = server.read(TILESETS_FILE)!;
    const tilesets = await loadTilesetsData();
    expect(await saveTilesetsData(tilesets)).toBe(true);
    expect(server.read(TILESETS_FILE)).toBe(original);
    const t = tilesets.find((x) => x.id === 1)!;
    const old = t.terrainTags[400];
    t.terrainTags[400] = old === 2 ? 3 : 2;
    await saveTilesetsData(tilesets);
    const after = server.read(TILESETS_FILE)!;
    const changed = after.split("\n").filter((l, i) => l !== original.split("\n")[i]);
    expect(changed.length).toBe(1);
    expect(changed[0]).toContain("\"terrainTags\"");
    expect(Data.tilesets.get(1)!.terrainTags[400]).toBe(t.terrainTags[400]);
  }, 60_000);

  it("map connections editor: saving the loaded connections gives the game's map_connections.txt", async () => {
    const raw = JSON.parse(readFileSync(join(PBS_DIR, "map-connections.json"), "utf8")) as
      { map1: number; edge1: string; position1: number; map2: number; edge2: string; position2: number }[];
    setMapConnections(raw.map((c) => [c.map1, c.edge1, c.position1, c.map2, c.edge2, c.position2]));
    const conns = currentMapConnections();
    expect(await saveConnectionData(conns)).toBe(true);
    const text = server.read("PBS/map_connections.txt")!;
    // The same connections. As in Ruby, they come out in the order the editor
    // gathers them (by map ID, MapFactoryHelper.getMapConnections), and the
    // "# map - map" comments follow maps renamed since the file was written.
    const data = (t: string) => t.split("\n").filter((l) => !l.startsWith("#")).sort();
    expect(data(norm(text))).toEqual(data(repoPbs("map_connections.txt")));
    // Moving map 4 one tile down next to map 1
    const edited: Conn[] = conns.map((c) => (c[0] === 1 && c[3] === 4 ? [c[0], c[1], c[2] + 1, c[3], c[4], c[5]] : c));
    await saveConnectionData(edited);
    expect(norm(server.read("PBS/map_connections.txt")!)).toContain("1,West,1,4,East,2");
    expect(currentMapConnections()).toContainEqual(edited.find((c) => c[0] === 1 && c[3] === 4));
  });

  it("sprite positioner: unchanged metrics round trip; an edit is written (normal and Dynamax mode)", async () => {
    const before = PBSText.pokemonMetrics()!;
    expect(norm(before)).toBe(repoPbs("pokemon_metrics.txt"));
    const sp = new SpritePositioner();
    await sp.pbSaveMetrics();
    expect(server.read("PBS/pokemon_metrics.txt")).toBe(before);
    const data = GameData.SpeciesMetrics.getSpeciesForm("PIKACHU", 0)!;
    sp.pbGetMetrics(data);
    const m = (sp as unknown as { metrics: { back: [number, number] } }).metrics;
    m.back[1] = 42;
    sp.pbApplyMetrics(data);
    await sp.pbSaveMetrics();
    expect(changedLines(before, server.read("PBS/pokemon_metrics.txt")!).some((l) => /^BackSprite = .*,42$/.test(l))).toBe(true);
    // Dynamax mode writes the ZUD file
    (sp as unknown as { dynamaxMode: boolean }).dynamaxMode = true;
    await sp.pbSaveMetrics();
    expect(server.read("PBS/Plugins/ZUD/dynamax_metrics_ebdx.txt")).toBe(PBSText.dynamaxMetrics());
  });

  it("findBottom finds the lowest opaque row", () => {
    const rows = 5, cols = 3;
    const pixels = new Uint8ClampedArray(rows * cols * 4);
    pixels[(2 * cols + 1) * 4 + 3] = 255; // (1, 2) opaque
    const fake = { width: cols, height: rows, ctx: { getImageData: () => ({ data: pixels }) } };
    expect(findBottom(fake as never)).toBe(2);
    expect(findBottom(null)).toBe(0);
  });
});

describe("Mystery Gift", () => {
  beforeAll(() => {
    server = installTempDevServer();
    G.player = new Player("Red", GameData.TrainerType.each()[0]!.id) as never;
  });
  afterAll(() => server.restore());

  it("encrypts and decrypts gifts (items and Pokémon) through the Master file", async () => {
    const pkmn = new Pokemon("PIKACHU", 7);
    pkmn.obtainText = "Faraway place";
    const gifts: Gift[] = [[1, 3, "POTION", "Potions"], [2, 0, pkmn, "A Pikachu"]];
    const { DevFiles } = await import("../devFiles");
    await DevFiles.write(MysteryGift.MASTER_FILE, await pbMysteryGiftEncrypt(gifts));
    const text = server.read(MysteryGift.MASTER_FILE)!;
    expect(text.split("\n").every((l) => l.length <= 60)).toBe(true);
    const back = await pbMysteryGiftDecrypt(text);
    expect(back[0]).toEqual([1, 3, "POTION", "Potions"]);
    const p = back[1]![2] as Pokemon;
    expect(p).toBeInstanceOf(Pokemon);
    expect([p.species, p.level, p.obtainText]).toEqual(["PIKACHU", 7, "Faraway place"]);
    expect(pbRefreshMGCommands(back, [2])).toEqual([
      "[  ] 1: Potions (Potion x3)", "[X] 2: A Pikachu (Pikachu)", "Export selected to file", "Cancel",
    ]);
    expect(await pbMysteryGiftDecrypt("not a gift file")).toEqual([]);
  });

  it("a saved Pokémon gift comes back as a Pokémon", () => {
    const player = G.player as unknown as Player;
    player.mysteryGifts.push([5, 0, new Pokemon("EEVEE", 5), "Eevee"]);
    const restored = Player.fromJSON(JSON.parse(JSON.stringify(player.toJSON())));
    expect((restored.mysteryGifts[0] as unknown[])[2]).toBeInstanceOf(Pokemon);
  });
});
