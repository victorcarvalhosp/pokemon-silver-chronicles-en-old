// The Debug menu's helpers (DebugMenuExtraCode.ts, 003_Debug_MenuExtraCode.rb):
// pbDebugSetVariable's clamping, which script switches the Switches screen
// evaluates, pbCheckTileValidity, the map JSON writer (byte-identical to the
// importer's layout) and Fix Invalid Tiles over a scripted map.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Data } from "../data/store";
import type { MapData, Tileset } from "../data/types";
import { G, GameVariables } from "../game/globals";

const messages: string[] = [];
vi.mock("../ui/messages", async (orig) => ({
  ...(await orig<typeof import("../ui/messages")>()),
  pbMessage: async (msg: string) => { messages.push(msg); return 0; },
}));
const consoleLines: string[] = [];
vi.mock("./DebugConsole", () => {
  const log = (kind: string) => (msg: string) => { consoleLines.push(`${kind}: ${msg}`); };
  return {
    Console: {
      echoH1: log("h1"), echoH2: log("h2"), echoLi: log("li"), echolnLi: log("li"), echoWarn: log("warn"),
      echoError: log("error"), echoDone: () => {},
    },
    echo: () => {},
    echoln: () => {},
  };
});
const maps = new Map<number, MapData>();
const writes: [string, string][] = [];
const moves: [string, string][] = [];
let listing: Record<string, string[]> = {};
vi.mock("./devFiles", async (orig) => ({
  ...(await orig<typeof import("./devFiles")>()),
  DevFiles: {
    write: async (path: string, content: string) => { writes.push([path, content]); },
    move: async (from: string, to: string) => {
      moves.push([from, to]);
      throw new Error("path not allowed");
    },
    list: async (dir: string) => listing[dir] ?? [],
    read: async (path: string) => {
      const m = /Map(\d+)\.json$/.exec(path);
      const data = m ? maps.get(Number(m[1])) : undefined;
      return data ? JSON.stringify(data) : null;
    },
  },
  devWriteOrExplain: async (_what: string, block: () => Promise<void>) => { await block(); return true; },
}));
let move2anim: unknown = [{}, {}];
vi.mock("../battle/scene/animationPlayer", async (orig) => ({
  ...(await orig<typeof import("../battle/scene/animationPlayer")>()),
  pbLoadMoveToAnim: () => move2anim,
}));
vi.mock("../rgss/Graphics", async (orig) => {
  const mod = await orig<typeof import("../rgss/Graphics")>();
  return { ...mod, Graphics: Object.assign(Object.create(mod.Graphics), { update: async () => {} }) };
});

const {
  parseDataJSON, pkmnAnimationsJSON, pbCheckTileValidity, pbDebugFixInvalidTiles, pbDebugSetVariable, prettyDataJSON, scriptSwitchEvaluable,
} = await import("./DebugMenuExtraCode");
const { FilenameUpdater } = await import("./FilenameUpdater");
const { PBAnimation, PBAnimations } = await import("../battle/scene/animationPlayer");

const tileset = (autotileNames: string[], passages = 400): Tileset => ({
  id: 1, name: "T", tilesetName: "T", autotileNames, panoramaName: "", panoramaHue: 0,
  fog: { name: "", hue: 0, opacity: 0, blendType: 0, zoom: 100, sx: 0, sy: 0 }, battlebackName: "",
  passages: new Array<number>(passages).fill(0), priorities: [], terrainTags: [],
});

function page(tileId: number, characterName = "") {
  return {
    condition: { switch1: null, switch2: null, variable: null, selfSwitch: null },
    graphic: { tileId, characterName, characterHue: 0, direction: 2, pattern: 0, opacity: 255, blendType: 0 },
    moveType: 0, moveSpeed: 3, moveFrequency: 3, moveRoute: { repeat: true, skippable: false, list: [] },
    walkAnime: true, stepAnime: false, directionFix: false, through: false, alwaysOnTop: false, trigger: 0, list: [],
  };
}

function map(id: number, layers: number[][][], events: MapData["events"] = []): MapData {
  return {
    id, name: `Map ${id}`, tilesetId: 1, width: layers[0]![0]!.length, height: layers[0]!.length,
    autoplayBgm: false, bgm: { name: "", volume: 100, pitch: 100 }, autoplayBgs: false,
    bgs: { name: "", volume: 80, pitch: 100 }, encounterStep: 30, layers, events,
  } as MapData;
}

beforeEach(() => {
  G.gameVariables = new GameVariables();
  G.gameMap = null;
  messages.length = 0;
  consoleLines.length = 0;
  writes.length = 0;
  moves.length = 0;
  listing = {};
  maps.clear();
  Data.mapInfos.clear();
  Data.tilesets.clear();
});

describe("pbDebugSetVariable", () => {
  it("adds to numbers, clamped to ±99,999,999, and refreshes the map", () => {
    G.gameMap = { mapId: 1, events: new Map(), needRefresh: false } as never;
    pbDebugSetVariable(5, 1);
    expect(G.gameVariables.get(5)).toBe(1);
    G.gameVariables.set(5, 99_999_999);
    pbDebugSetVariable(5, 1);
    expect(G.gameVariables.get(5)).toBe(99_999_999);
    G.gameVariables.set(5, -99_999_999);
    pbDebugSetVariable(5, -1);
    expect(G.gameVariables.get(5)).toBe(-99_999_999);
    expect((G.gameMap as unknown as { needRefresh: boolean }).needRefresh).toBe(true);
  });

  it("leaves text variables alone", () => {
    G.gameVariables.set(6, "hello");
    pbDebugSetVariable(6, 1);
    expect(G.gameVariables.get(6)).toBe("hello");
  });
});

describe("script switches in the Switches screen", () => {
  it("evaluates code starting with a constant or a global method, not Interpreter/Game_Event methods", () => {
    expect(scriptSwitchEvaluable("PBDayNight.isDay?(pbGetTimeNow)")).toBe(true);
    expect(scriptSwitchEvaluable("pbIsWeekday(-1,2,4,6)")).toBe(true);
    expect(scriptSwitchEvaluable("!pbIsWeekday(-1,2,4,6)")).toBe(true);
    expect(scriptSwitchEvaluable("tsOn?(\"A\")")).toBe(false);
    expect(scriptSwitchEvaluable("tsOff?(\"A\")")).toBe(false);
    expect(scriptSwitchEvaluable("cooledDown?(86400)")).toBe(false);
  });
});

describe("pbCheckTileValidity", () => {
  const tilesets = new Map([[1, tileset(["", "Water", "", "", "", "", "Flowers"], 400)]]);
  const passages = tilesets.get(1)!.passages;
  const m = { tilesetId: 1 };

  it("accepts tiles of defined autotiles and tiles inside the tileset", () => {
    expect(pbCheckTileValidity(0, m, tilesets, passages)).toBe(true);
    expect(pbCheckTileValidity(96, m, tilesets, passages)).toBe(true); // autotile 1
    expect(pbCheckTileValidity(384, m, tilesets, passages)).toBe(true);
    expect(pbCheckTileValidity(399, m, tilesets, passages)).toBe(true);
  });

  it("rejects missing tiles, undefined autotiles and nil", () => {
    expect(pbCheckTileValidity(48, m, tilesets, passages)).toBe(false); // autotile 0 has no name
    expect(pbCheckTileValidity(400, m, tilesets, passages)).toBe(false);
    expect(pbCheckTileValidity(null, m, tilesets, passages)).toBe(false);
  });

  it("reads tiles 1-47 as the last autotile, like Ruby's [-1]", () => {
    expect(pbCheckTileValidity(5, m, tilesets, passages)).toBe(true);
    const noLast = new Map([[1, tileset(["", "Water", "", "", "", "", ""])]]);
    expect(pbCheckTileValidity(5, m, noLast, passages)).toBe(false);
  });
});

describe("prettyDataJSON", () => {
  const dir = resolve(import.meta.dirname, "../../data/maps");

  it("writes a map back exactly as the importer did (floats keep their spelling)", () => {
    for (const f of ["Map001.json", "Map002.json", "Map005.json"]) {
      const text = readFileSync(resolve(dir, f), "utf8");
      expect(prettyDataJSON(parseDataJSON(text)) + "\n" === text, f).toBe(true);
    }
  });

  it("is stable on every map (saving twice changes nothing more)", () => {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const once = prettyDataJSON(parseDataJSON(readFileSync(resolve(dir, f), "utf8")));
      expect(prettyDataJSON(parseDataJSON(once)) === once, f).toBe(true);
    }
  }, 120_000);
});

describe("pkmnAnimationsJSON", () => {
  it("writes pkmn-animations.json in the importer's layout", () => {
    const text = readFileSync(resolve(import.meta.dirname, "../../data/pkmn-animations.json"), "utf8");
    const data = parseDataJSON(text) as { move2anim: unknown; animations: (ConstructorParameters<typeof PBAnimation>[0] | null)[] };
    move2anim = data.move2anim;
    const animations = new PBAnimations(data.animations.map((a) => (a ? new PBAnimation(a) : null)));
    expect(pkmnAnimationsJSON(animations) === text).toBe(true);
  }, 120_000);
});

describe("pbDebugFixInvalidTiles", () => {
  it("erases invalid tiles and event tile graphics and saves only the maps it changed", async () => {
    Data.tilesets.set(1, tileset(["", "Water", "", "", "", "", ""], 400));
    Data.mapInfos.set(1, { id: 1, name: "Good", width: 2, height: 1 } as never);
    Data.mapInfos.set(2, { id: 2, name: "Bad", width: 2, height: 1 } as never);
    maps.set(1, map(1, [[[384, 96]], [[0, 0]], [[0, 0]]]));
    maps.set(2, map(2, [[[384, 500]], [[48, 0]], [[0, 0]]], [{ id: 1, name: "EV", x: 0, y: 0, pages: [page(900), page(390)] }]));
    await pbDebugFixInvalidTiles();
    expect(writes.map(([p]) => p)).toEqual(["web/data/maps/Map002.json"]);
    const saved = JSON.parse(writes[0]![1]) as MapData;
    expect(saved.layers).toEqual([[[384, 0]], [[0, 0]], [[0, 0]]]);
    expect(saved.events[0]!.pages.map((p) => p.graphic.tileId)).toEqual([0, 390]);
    expect(consoleLines).toContain("li: 3 error tile(s) found on map 2: Bad.");
    expect(messages).toEqual([
      "3 error(s) were found across 1 map(s) and fixed.",
      "Close RPG Maker XP to ensure the changes are applied properly.",
    ]);
  });

  it("says so when every tile is valid", async () => {
    Data.tilesets.set(1, tileset(["", "Water"], 400));
    Data.mapInfos.set(1, { id: 1, name: "Good", width: 1, height: 1 } as never);
    maps.set(1, map(1, [[[384]], [[0]], [[96]]]));
    await pbDebugFixInvalidTiles();
    expect(writes).toEqual([]);
    expect(messages).toEqual(["No invalid tiles were found."]);
  });
});

describe("FilenameUpdater", () => {
  it("reports refused charset renames, updates the berry tree events and saves their maps", async () => {
    listing["Graphics/Characters/"] = ["berrytreeCHERI.png", "berrytree_ORAN.png", "berrytreewet.png", "NPC 01.png", "sub/berrytreeX.png"];
    Data.mapInfos.set(3, { id: 3, name: "Route", width: 1, height: 1 } as never);
    Data.mapInfos.set(4, { id: 4, name: "Town", width: 1, height: 1 } as never);
    maps.set(3, map(3, [[[0]], [[0]], [[0]]], [
      { id: 1, name: "BerryPlant", x: 0, y: 0, pages: [page(0, "berrytreeCHERI"), page(0, "berrytreedry"), page(0, "berrytree_ORAN")] },
    ]));
    maps.set(4, map(4, [[[0]], [[0]], [[0]]], [{ id: 1, name: "NPC", x: 0, y: 0, pages: [page(0, "NPC 01")] }]));
    await FilenameUpdater.renameFiles();
    expect(moves).toEqual([["Graphics/Characters/berrytreeCHERI.png", "Graphics/Characters/berrytree_CHERI.png"]]);
    expect(consoleLines.some((l) => l.startsWith("error: Couldn't rename Graphics/Characters/berrytreeCHERI.png"))).toBe(true);
    expect(consoleLines).not.toContain("warn: Berry plant charset files were renamed.");
    expect(writes.map(([p]) => p)).toEqual(["web/data/maps/Map003.json"]);
    const saved = JSON.parse(writes[0]![1]) as MapData;
    expect(saved.events[0]!.pages.map((p) => p.graphic.characterName)).toEqual(["berrytree_CHERI", "berrytreedry", "berrytree_ORAN"]);
    expect(consoleLines).toContain("warn: Map 3: 'Route' was modified and saved.");
  });
});
