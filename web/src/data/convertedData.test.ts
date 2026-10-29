// Sanity checks over the game data in web/data/ (maps, events, tilesets...).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MapData, MapInfo, SystemData, Tileset } from "./types";

const DATA = join(__dirname, "../../data");
const read = <T>(path: string): T => JSON.parse(readFileSync(join(DATA, path), "utf8")) as T;

const tilesets = new Map(read<Tileset[]>("tilesets.json").map((t) => [t.id, t]));
const infos = read<MapInfo[]>("map-infos.json");
const mapFiles = readdirSync(join(DATA, "maps"));

describe("converted data", () => {
  it("has a map file for every map in the tree", () => {
    // Map999 exists without a tree entry (hidden in the editor), so files may outnumber infos.
    const missing = infos.filter((i) => !mapFiles.includes(`Map${String(i.id).padStart(3, "0")}.json`));
    expect(missing).toEqual([]);
  });

  it("starts on a map that exists", () => {
    const system = read<SystemData>("system.json");
    expect(infos.some((i) => i.id === system.startMapId)).toBe(true);
  });

  it("has well-formed maps", () => {
    const problems: string[] = [];
    for (const file of mapFiles) {
      const map = read<MapData>(`maps/${file}`);
      const tileset = tilesets.get(map.tilesetId);
      if (!tileset) problems.push(`${file}: unknown tileset ${map.tilesetId}`);
      if (map.layers.length !== 3) problems.push(`${file}: ${map.layers.length} layers`);
      for (const layer of map.layers) {
        if (layer.length !== map.height || layer.some((row) => row.length !== map.width)) {
          problems.push(`${file}: layer size doesn't match ${map.width}x${map.height}`);
          break;
        }
      }
      for (const ev of map.events) {
        if (ev.pages.length === 0) problems.push(`${file}: event ${ev.id} has no pages`);
      }
    }
    expect(problems).toEqual([]);
  });
});
