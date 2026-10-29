// Port of 004_Game classes/004_Game_Map.rb.

import { Data, getMapData } from "../data/store";
import { terrainTag, type TerrainTag } from "../data/gameData/terrainTag";
import type { MapData, Tileset } from "../data/types";
import { Tone } from "../rgss/types";
import { ORIGINAL_STEP } from "./GameScreen";
import { FRAME_RATE, REAL_RES_X, REAL_RES_Y, TILE_HEIGHT, TILE_WIDTH, type GameCharacter, player } from "./GameCharacter";
import { GameCommonEvent, GameEvent } from "./GameEvent";
import { EventHandlers } from "./eventHandlers";
import { G } from "./globals";
import { pbBGMPlay, pbBGSPlay } from "./GameSystem";
import { mapMetadata } from "./metadata";
import { autoplayAsCue } from "./mapAudio";

/** GameData::TerrainTag#can_surf_freely */
const canSurfFreely = (t: TerrainTag) => !!t.canSurf && !t.waterfall && !t.waterfallCrest;

const SCREEN_W = 512;
const SCREEN_H = 384;

export class GameMap {
  mapId = 0;
  map!: MapData;
  tileset!: Tileset;
  tilesetName = "";
  autotileNames: string[] = [];
  passages: number[] = [];
  priorities: number[] = [];
  terrainTags: number[] = [];
  events = new Map<number, GameEvent>();
  commonEvents = new Map<number, GameCommonEvent>();
  panoramaName = "";
  panoramaHue = 0;
  fogName = "";
  fogHue = 0;
  fogOpacity = 0;
  fogBlendType = 0;
  fogZoom = 100;
  fogSx = 0;
  fogSy = 0;
  fogOx = 0;
  fogOy = 0;
  fogTone = new Tone();
  battlebackName = "";
  needRefresh = false;
  private displayX_ = 0;
  private displayY_ = 0;
  private fogToneTarget = new Tone();
  private fogToneDuration = 0;
  private fogOpacityDuration = 0;
  private fogOpacityTarget = 0;
  private scrollDirection = 2;
  private scrollRest = 0;
  private scrollSpeed = 4;

  setup(mapId: number): void {
    this.mapId = mapId;
    this.map = getMapData(mapId);
    this.updateTileset();
    this.fogOx = 0;
    this.fogOy = 0;
    this.fogTone = new Tone();
    this.fogToneTarget = new Tone();
    this.fogToneDuration = 0;
    this.fogOpacityDuration = 0;
    this.fogOpacityTarget = 0;
    this.displayX = 0;
    this.displayY = 0;
    this.needRefresh = false;
    EventHandlers.triggerSync("on_game_map_setup", mapId, this.map, this.tileset);
    this.events = new Map();
    for (const ev of this.map.events) this.events.set(ev.id, new GameEvent(mapId, ev, this));
    this.commonEvents = new Map();
    for (const id of Data.commonEvents.keys()) this.commonEvents.set(id, new GameCommonEvent(id));
    this.scrollDirection = 2;
    this.scrollRest = 0;
    this.scrollSpeed = 4;
  }

  updateTileset(): void {
    const t = Data.tilesets.get(this.map.tilesetId);
    if (!t) throw new Error(`Map ${this.mapId} uses unknown tileset ${this.map.tilesetId}`);
    this.tileset = t;
    this.tilesetName = t.tilesetName;
    this.autotileNames = t.autotileNames;
    this.panoramaName = t.panoramaName;
    this.panoramaHue = t.panoramaHue;
    this.fogName = t.fog.name;
    this.fogHue = t.fog.hue;
    this.fogOpacity = t.fog.opacity;
    this.fogBlendType = t.fog.blendType;
    this.fogZoom = t.fog.zoom;
    this.fogSx = t.fog.sx;
    this.fogSy = t.fog.sy;
    this.battlebackName = t.battlebackName;
    this.passages = t.passages;
    this.priorities = t.priorities;
    this.terrainTags = t.terrainTags;
  }

  get width(): number { return this.map.width; }
  get height(): number { return this.map.height; }
  get encounterStep(): number { return this.map.encounterStep; }
  get tilesetId(): number { return this.map.tilesetId; }
  get name(): string { return Data.mapInfos.get(this.mapId)?.name ?? ""; }

  /** data[x, y, layer] */
  tile(x: number, y: number, layer: number): number {
    return this.map.layers[layer]?.[y]?.[x] ?? 0;
  }

  setTile(x: number, y: number, layer: number, id = 0): void {
    const row = this.map.layers[layer]?.[y];
    if (row && x >= 0 && x < row.length) row[x] = id;
  }

  bgmName(): string {
    // TODO(day/night): Essentials plays "<name>_n" at night when it exists.
    return this.map.bgm.name;
  }

  autoplay(): void {
    if (this.map.autoplayBgm) pbBGMPlay(this.bgmName(), this.map.bgm.volume, this.map.bgm.pitch);
    if (this.map.autoplayBgs) pbBGSPlay(this.map.bgs);
  }

  autoplayAsCue(): void {
    autoplayAsCue(this);
  }

  valid(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  validLax(x: number, y: number): boolean {
    return x >= -10 && x <= this.width + 10 && y >= -10 && y <= this.height + 10;
  }

  passable(x: number, y: number, d: number, selfEvent: GameCharacter | null = null): boolean {
    if (!this.valid(x, y)) return false;
    const bit = (1 << (d / 2 - 1)) & 0x0f;
    for (const event of this.events.values()) {
      if (event.tileId <= 0 || event === selfEvent || !event.atCoordinate(x, y) || event.through) continue;
      if (terrainTag(this.terrainTags[event.tileId] ?? 0).ignorePassability) continue;
      const passage = this.passages[event.tileId] ?? 0;
      if (passage & bit) return false;
      if ((passage & 0x0f) === 0x0f) return false;
      if ((this.priorities[event.tileId] ?? 0) === 0) return true;
    }
    if (selfEvent && selfEvent === player()) return this.playerPassable(x, y, d);
    let newx = x, newy = y;
    if ([1, 4, 7].includes(d)) newx -= 1;
    if ([3, 6, 9].includes(d)) newx += 1;
    if ([1, 2, 3].includes(d)) newy += 1;
    if ([7, 8, 9].includes(d)) newy -= 1;
    if (!this.valid(newx, newy)) return false;
    for (const i of [2, 1, 0]) {
      const tileId = this.tile(x, y, i);
      const terrain = terrainTag(this.terrainTags[tileId] ?? 0);
      // If already on water, only allow movement to another water tile
      // (GameData::TerrainTag#can_surf_freely: can_surf, not a waterfall or crest)
      if (selfEvent && canSurfFreely(terrain)) {
        for (const j of [2, 1, 0]) {
          const facing = this.tile(newx, newy, j);
          if (facing === 0) continue;
          const ft = terrainTag(this.terrainTags[facing] ?? 0);
          if (ft.id !== "None" && !ft.ignorePassability) return canSurfFreely(ft);
        }
        return false;
      } else if (terrain.ice) { // Can't walk onto ice
        return false;
      } else if (selfEvent && selfEvent.x === x && selfEvent.y === y) {
        for (const j of [2, 1, 0]) {
          const facing = this.tile(newx, newy, j);
          if (facing === 0) continue;
          const ft = terrainTag(this.terrainTags[facing] ?? 0);
          if (ft.ledge) return false;
          if (ft.id !== "None" && !ft.ignorePassability) break;
        }
      }
      if (terrain.ignorePassability) continue;
      if (tileId === 0) continue;
      const passage = this.passages[tileId] ?? 0;
      if (passage & bit || (passage & 0x0f) === 0x0f) return false;
      if ((this.priorities[tileId] ?? 0) === 0) return true;
    }
    return true;
  }

  playerPassable(x: number, y: number, d: number): boolean {
    const bit = (1 << (d / 2 - 1)) & 0x0f;
    const global = G.pokemonGlobal;
    for (const i of [2, 1, 0]) {
      const tileId = this.tile(x, y, i);
      if (tileId === 0) continue;
      const terrain = terrainTag(this.terrainTags[tileId] ?? 0);
      const passage = this.passages[tileId] ?? 0;
      if (terrain.bridge && global.bridge === 0) continue;
      if (global.surfing && terrain.canSurf && !terrain.waterfall) return true;
      if (global.bicycle && terrain.mustWalk) return false;
      if (terrain.bridge && global.bridge > 0) return (passage & bit) === 0 && (passage & 0x0f) !== 0x0f;
      if (terrain.ignorePassability) continue;
      if (passage & bit || (passage & 0x0f) === 0x0f) return false;
      if ((this.priorities[tileId] ?? 0) === 0) return true;
    }
    return true;
  }

  passableStrict(x: number, y: number, _d: number, selfEvent: GameCharacter | null = null): boolean {
    if (!this.valid(x, y)) return false;
    for (const event of this.events.values()) {
      if (event === selfEvent || event.tileId < 0 || event.through || !event.atCoordinate(x, y)) continue;
      if (terrainTag(this.terrainTags[event.tileId] ?? 0).ignorePassability) continue;
      if ((this.passages[event.tileId] ?? 0) & 0x0f) return false;
      if ((this.priorities[event.tileId] ?? 0) === 0) return true;
    }
    for (const i of [2, 1, 0]) {
      const tileId = this.tile(x, y, i);
      if (tileId === 0) continue;
      if (terrainTag(this.terrainTags[tileId] ?? 0).ignorePassability) continue;
      if ((this.passages[tileId] ?? 0) & 0x0f) return false;
      if ((this.priorities[tileId] ?? 0) === 0) return true;
    }
    return true;
  }

  bush(x: number, y: number): boolean {
    for (const i of [2, 1, 0]) {
      const tileId = this.tile(x, y, i);
      if (tileId === 0) continue;
      if (terrainTag(this.terrainTags[tileId] ?? 0).bridge && G.pokemonGlobal.bridge > 0) return false;
      if (((this.passages[tileId] ?? 0) & 0x40) === 0x40) return true;
    }
    return false;
  }

  deepBush(x: number, y: number): boolean {
    for (const i of [2, 1, 0]) {
      const tileId = this.tile(x, y, i);
      if (tileId === 0) continue;
      const terrain = terrainTag(this.terrainTags[tileId] ?? 0);
      if (terrain.bridge && G.pokemonGlobal.bridge > 0) return false;
      if (terrain.deepBush && ((this.passages[tileId] ?? 0) & 0x40) === 0x40) return true;
    }
    return false;
  }

  counter(x: number, y: number): boolean {
    for (const i of [2, 1, 0]) {
      const tileId = this.tile(x, y, i);
      if (tileId === 0) continue;
      if (((this.passages[tileId] ?? 0) & 0x80) === 0x80) return true;
    }
    return false;
  }

  terrainTag(x: number, y: number, countBridge = false): TerrainTag {
    if (this.valid(x, y)) {
      for (const i of [2, 1, 0]) {
        const tileId = this.tile(x, y, i);
        if (tileId === 0) continue;
        const terrain = terrainTag(this.terrainTags[tileId] ?? 0);
        if (terrain.id === "None" || terrain.ignorePassability) continue;
        if (!countBridge && terrain.bridge && G.pokemonGlobal.bridge === 0) continue;
        return terrain;
      }
    }
    return terrainTag(0);
  }

  checkEvent(x: number, y: number): number | undefined {
    for (const event of this.events.values()) if (event.atCoordinate(x, y)) return event.id;
    return undefined;
  }

  get displayX(): number { return this.displayX_; }
  set displayX(value: number) {
    if (this.displayX_ === value) return;
    this.displayX_ = value;
    if (mapMetadata(this.mapId)?.snapEdges) {
      const maxX = (this.width - SCREEN_W / TILE_WIDTH) * REAL_RES_X;
      this.displayX_ = Math.max(0, Math.min(this.displayX_, maxX));
    }
    G.mapFactory && (G.mapFactory as unknown as { setMapsInRange(): void }).setMapsInRange();
  }

  get displayY(): number { return this.displayY_; }
  set displayY(value: number) {
    if (this.displayY_ === value) return;
    this.displayY_ = value;
    if (mapMetadata(this.mapId)?.snapEdges) {
      const maxY = (this.height - SCREEN_H / TILE_HEIGHT) * REAL_RES_Y;
      this.displayY_ = Math.max(0, Math.min(this.displayY_, maxY));
    }
    G.mapFactory && (G.mapFactory as unknown as { setMapsInRange(): void }).setMapsInRange();
  }

  scrollUp(d: number): void { this.displayY -= d; }
  scrollDown(d: number): void { this.displayY += d; }
  scrollLeft(d: number): void { this.displayX -= d; }
  scrollRight(d: number): void { this.displayX += d; }
  // Diagonal scrolling (005_Game_Map_Autoscroll.rb), used by autoscroll.
  scrollDownright(d: number): void {
    this.displayX = Math.min(this.displayX + d, (this.width - SCREEN_W / TILE_WIDTH) * REAL_RES_X);
    this.displayY = Math.min(this.displayY + d, (this.height - SCREEN_H / TILE_HEIGHT) * REAL_RES_Y);
  }
  scrollDownleft(d: number): void {
    this.displayX = Math.max(this.displayX - d, 0);
    this.displayY = Math.min(this.displayY + d, (this.height - SCREEN_H / TILE_HEIGHT) * REAL_RES_Y);
  }
  scrollUpright(d: number): void {
    this.displayX = Math.min(this.displayX + d, (this.width - SCREEN_W / TILE_WIDTH) * REAL_RES_X);
    this.displayY = Math.max(this.displayY - d, 0);
  }
  scrollUpleft(d: number): void {
    this.displayX = Math.max(this.displayX - d, 0);
    this.displayY = Math.max(this.displayY - d, 0);
  }

  startScroll(direction: number, distance: number, speed: number): void {
    this.scrollDirection = direction;
    this.scrollRest = distance * ([2, 8].includes(direction) ? REAL_RES_Y : REAL_RES_X);
    this.scrollSpeed = speed;
  }

  scrolling(): boolean {
    return this.scrollRest > 0;
  }

  startFogToneChange(tone: Tone, seconds: number): void {
    this.fogToneTarget = tone.clone();
    this.fogToneDuration = Math.round(seconds * FRAME_RATE);
    if (this.fogToneDuration === 0) this.fogTone = this.fogToneTarget.clone();
  }

  startFogOpacityChange(opacity: number, seconds: number): void {
    this.fogOpacityTarget = opacity;
    this.fogOpacityDuration = Math.round(seconds * FRAME_RATE);
    if (this.fogOpacityDuration === 0) this.fogOpacity = this.fogOpacityTarget;
  }

  refresh(): void {
    for (const e of this.events.values()) e.refresh();
    for (const c of this.commonEvents.values()) c.refresh();
    this.needRefresh = false;
  }

  async update(): Promise<void> {
    const factory = G.mapFactory as unknown as { maps: GameMap[]; setCurrentMap(): void } | null;
    if (factory) {
      for (const m of factory.maps) if (m.needRefresh) m.refresh();
      factory.setCurrentMap();
    }
    if (this.scrollRest > 0) {
      const distance = Math.min(((1 << this.scrollSpeed) * 40) / FRAME_RATE, this.scrollRest);
      switch (this.scrollDirection) {
        case 1: this.scrollDownleft(distance); break;
        case 2: this.scrollDown(distance); break;
        case 3: this.scrollDownright(distance); break;
        case 4: this.scrollLeft(distance); break;
        case 6: this.scrollRight(distance); break;
        case 7: this.scrollUpleft(distance); break;
        case 8: this.scrollUp(distance); break;
        case 9: this.scrollUpright(distance); break;
      }
      this.scrollRest -= distance;
    }
    for (const e of this.events.values()) await e.update();
    for (const c of this.commonEvents.values()) await c.update();
    this.fogOx -= (this.fogSx / 8) * ORIGINAL_STEP;
    this.fogOy -= (this.fogSy / 8) * ORIGINAL_STEP;
    if (this.fogToneDuration >= 1) {
      const d = this.fogToneDuration, t = this.fogToneTarget;
      this.fogTone.set((this.fogTone.red * (d - 1) + t.red) / d, (this.fogTone.green * (d - 1) + t.green) / d,
        (this.fogTone.blue * (d - 1) + t.blue) / d, (this.fogTone.gray * (d - 1) + t.gray) / d);
      this.fogToneDuration -= 1;
    }
    if (this.fogOpacityDuration >= 1) {
      const d = this.fogOpacityDuration;
      this.fogOpacity = (this.fogOpacity * (d - 1) + this.fogOpacityTarget) / d;
      this.fogOpacityDuration -= 1;
    }
  }
}
