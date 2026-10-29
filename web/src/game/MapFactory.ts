// Port of 004_Game classes/006_Game_MapFactory.rb: keeps the current map and
// the maps connected to it (PBS map_connections) loaded and aligned.

import { connectionsFor, hasMapData, mapDims, preloadMaps, type MapConnection } from "../data/store";
import { terrainTag, type TerrainTag } from "../data/gameData/terrainTag";
import { REAL_RES_X, REAL_RES_Y, TILE_HEIGHT, TILE_WIDTH, type GameCharacter, player } from "./GameCharacter";
import { GameMap } from "./GameMap";
import { EventHandlers } from "./eventHandlers";
import { G } from "./globals";
import { pbAutoplayOnTransition } from "./mapAudio";

const SCREEN_W = 512;
const SCREEN_H = 384;

export class PokemonMapFactory {
  maps: GameMap[] = [];
  private mapIndex = 0;
  private fixup = false;
  private mapChanged = false;

  constructor(id: number) {
    G.mapFactory = this as never;
    this.setup(id);
  }

  setup(id: number): void {
    this.maps = [];
    const map = new GameMap();
    this.maps[0] = map;
    this.mapIndex = 0;
    const oldID = G.gameMap?.mapId ?? 0;
    if (oldID !== 0 && oldID !== map.mapId) this.setMapChanging(id, map);
    G.gameMap = map as never;
    map.setup(id);
    this.setMapsInRange();
    this.setMapChanged(oldID);
  }

  get map(): GameMap {
    return this.maps[this.mapIndex] ?? this.maps[0]!;
  }

  hasMap(id: number): boolean {
    return this.maps.some((m) => m.mapId === id);
  }

  getMapIndex(id: number): number {
    return this.maps.findIndex((m) => m.mapId === id);
  }

  getMap(id: number, add = true): GameMap {
    const existing = this.maps.find((m) => m.mapId === id);
    if (existing) return existing;
    const map = new GameMap();
    map.setup(id);
    if (add) this.maps.push(map);
    return map;
  }

  getMapNoAdd(id: number): GameMap {
    return this.getMap(id, false);
  }

  getNewMap(playerX: number, playerY: number, mapId?: number): [GameMap, number, number] | null {
    const id = mapId ?? currentMap().mapId;
    for (const conn of connectionsFor(id)) {
      let other: number, newx: number, newy: number;
      if (conn.mapA === id) {
        other = conn.mapB;
        newx = conn.xB - conn.xA + playerX;
        newy = conn.yB - conn.yA + playerY;
      } else {
        other = conn.mapA;
        newx = conn.xA - conn.xB + playerX;
        newy = conn.yA - conn.yB + playerY;
      }
      const [w, h] = mapDims(other);
      if (newx >= 0 && newx < w && newy >= 0 && newy < h) {
        if (!hasMapData(other)) return null; // not loaded yet: treat as no connection for now
        return [mapId != null ? this.getMapNoAdd(other) : this.getMap(other), newx, newy];
      }
    }
    return null;
  }

  setCurrentMap(): void {
    const p = player();
    if (p.moving()) return;
    const cur = currentMap();
    if (cur.valid(p.x, p.y)) return;
    const newmap = this.getNewMap(p.x, p.y);
    if (!newmap) return;
    const oldmap = cur.mapId;
    if (oldmap !== 0 && oldmap !== newmap[0].mapId) this.setMapChanging(newmap[0].mapId, newmap[0]);
    G.gameMap = newmap[0] as never;
    this.mapIndex = this.getMapIndex(newmap[0].mapId);
    p.moveto(newmap[1], newmap[2]);
    void newmap[0].update();
    pbAutoplayOnTransition();
    newmap[0].refresh();
    this.setMapChanged(oldmap);
    G.gameScreen.weatherDuration = 1; // Essentials: weather_duration = 20 (frames)
    // Keep the maps beyond the new one loading in the background.
    void preloadMaps(newmap[0].mapId, 2);
  }

  setMapsInRange(): void {
    if (this.fixup) return;
    this.fixup = true;
    const id = currentMap().mapId;
    for (const conn of connectionsFor(id)) {
      const [aId, bId, dx, dy] = conn.mapA === id
        ? [conn.mapA, conn.mapB, conn.xB - conn.xA, conn.yB - conn.yA]
        : [conn.mapB, conn.mapA, conn.xA - conn.xB, conn.yA - conn.yB];
      if (!hasMapData(bId)) continue;
      const mapA = this.getMap(aId);
      const newdispx = dx * REAL_RES_X + mapA.displayX;
      const newdispy = dy * REAL_RES_Y + mapA.displayY;
      if (this.hasMap(bId) || mapInRangeById(bId, newdispx, newdispy)) {
        const mapB = this.getMap(bId);
        if (mapB.displayX !== newdispx) mapB.displayX = newdispx;
        if (mapB.displayY !== newdispy) mapB.displayY = newdispy;
      }
    }
    this.fixup = false;
  }

  setMapChanging(newID: number, newMap: GameMap): void {
    EventHandlers.triggerSync("on_leave_map", newID, newMap);
  }

  setMapChanged(prevMap: number): void {
    EventHandlers.triggerSync("on_enter_map", prevMap);
    this.mapChanged = true;
  }

  setSceneStarted(scene: unknown): void {
    EventHandlers.triggerSync("on_map_or_spriteset_change", scene, this.mapChanged);
    this.mapChanged = false;
  }

  isPassableFromEdge(x: number, y: number): boolean {
    if (currentMap().valid(x, y)) return true;
    const newmap = this.getNewMap(x, y, currentMap().mapId);
    if (!newmap) return false;
    return this.isPassable(newmap[0].mapId, newmap[1], newmap[2]);
  }

  isPassable(mapID: number, x: number, y: number, thisEvent: GameCharacter | null = null): boolean {
    const ev = thisEvent ?? player();
    const map = this.getMapNoAdd(mapID);
    if (!map.valid(x, y)) return false;
    if (ev.through) return true;
    if (!map.passable(x, y, 0, ev)) return false;
    for (const event of map.events.values()) {
      if (event === ev || !event.atCoordinate(x, y)) continue;
      if (!event.through && event.characterName !== "") return false;
    }
    const p = player();
    if (ev !== p && currentMap().mapId === mapID && p.x === x && p.y === y && !p.through && p.characterName !== "") return false;
    return true;
  }

  getTerrainTag(mapid: number, x: number, y: number, countBridge = false): TerrainTag {
    return this.getMapNoAdd(mapid).terrainTag(x, y, countBridge);
  }

  getFacingTerrainTag(dir?: number, event?: GameCharacter): TerrainTag {
    const tile = this.getFacingTile(dir, event);
    if (!tile) return terrainTag(0);
    return this.getTerrainTag(tile[0], tile[1], tile[2]);
  }

  getTerrainTagFromCoords(mapid: number, x: number, y: number, countBridge = false): TerrainTag {
    const tile = this.getRealTilePos(mapid, x, y);
    if (!tile) return terrainTag(0);
    return this.getTerrainTag(tile[0], tile[1], tile[2], countBridge);
  }

  areConnected(a: number, b: number): boolean {
    if (a === b) return true;
    return connectionsFor(a).some((c) => c.mapA === b || c.mapB === b);
  }

  getRelativePos(thisMapID: number, thisX: number, thisY: number, otherMapID: number, otherX: number, otherY: number): [number, number] {
    if (thisMapID === otherMapID) return [otherX - thisX, otherY - thisY];
    for (const c of connectionsFor(thisMapID)) {
      if (c.mapA === otherMapID) return [c.xB - c.xA + otherX - thisX, c.yB - c.yA + otherY - thisY];
      if (c.mapB === otherMapID) return [c.xA - c.xB + otherX - thisX, c.yA - c.yB + otherY - thisY];
    }
    return [0, 0];
  }

  getFacingTile(direction?: number, event?: GameCharacter, steps = 1): [number, number, number] | null {
    const ev = event ?? player();
    return this.getFacingTileFromPos(ev.map.mapId, ev.x, ev.y, direction ?? ev.direction, steps);
  }

  getFacingTileFromPos(mapID: number, x: number, y: number, direction = 0, steps = 1): [number, number, number] | null {
    const dx = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1][direction];
    const dy = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1][direction];
    if (dx === undefined || dy === undefined || direction === 0 || direction === 5) return [mapID, x, y];
    return this.getRealTilePos(mapID, x + dx * steps, y + dy * steps);
  }

  getRealTilePos(mapID: number, x: number, y: number): [number, number, number] | null {
    if (this.getMapNoAdd(mapID).valid(x, y)) return [mapID, x, y];
    for (const c of connectionsFor(mapID)) {
      const [other, nx, ny] = c.mapA === mapID ? [c.mapB, x + c.xB - c.xA, y + c.yB - c.yA] : [c.mapA, x + c.xA - c.xB, y + c.yA - c.yB];
      if (nx < 0 || ny < 0) continue;
      const [w, h] = mapDims(other);
      if (nx >= w || ny >= h) continue;
      return [other, nx, ny];
    }
    return null;
  }

  updateMaps(scene: unknown): void {
    this.updateMapsInternal();
    if (this.mapChanged) this.setSceneStarted(scene);
  }

  private updateMapsInternal(): void {
    if (player().moving()) return;
    const cur = currentMap().mapId;
    if (connectionsFor(cur).length === 0) {
      if (this.maps.length === 1) return;
      this.maps = this.maps.filter((m) => m.mapId === cur);
      this.mapIndex = this.getMapIndex(cur);
      return;
    }
    let n = this.maps.length;
    this.maps = this.maps.filter((m) => this.areConnected(cur, m.mapId));
    if (this.maps.length !== n) this.mapIndex = this.getMapIndex(cur);
    this.setMapsInRange();
    n = this.maps.length;
    this.maps = this.maps.filter((m) => mapInRange(m));
    if (this.maps.length !== n) this.mapIndex = this.getMapIndex(cur);
  }
}

function currentMap(): GameMap {
  return G.gameMap as unknown as GameMap;
}

function mapInRange(map: GameMap): boolean {
  return mapInRangeById(map.mapId, map.displayX, map.displayY);
}

function mapInRangeById(id: number, dispx: number, dispy: number): boolean {
  const range = 6;
  const [w, h] = mapDims(id);
  if (dispx >= (w + range) * REAL_RES_X) return false;
  if (dispy >= (h + range) * REAL_RES_Y) return false;
  if (dispx <= -(SCREEN_W + range * TILE_WIDTH) * 4) return false;
  if (dispy <= -(SCREEN_H + range * TILE_HEIGHT) * 4) return false;
  return true;
}

export type { MapConnection };
