// Port of Data/Scripts/020_Debug/001_Editor screens/003_EditorScreens_MapConnections.rb:
// MapSprite and RegionMapSprite (what chooseMapPoint shows: set as
// MapPointSprites), SelectionSprite, and the visual map connections editor
// (MapScreenScene, pbConnectionsEditor). Registers EditorScreens.pbConnectionsEditor.
//
// The connections are the ones the game loaded from PBS/map_connections.txt
// (MapFactoryHelper.getMapConnections). Ruby saves them to
// Data/map_connections.dat and then rewrites the PBS file from it
// (Compiler.write_connections); here the PBS file is written straight from
// the editor's data through the dev server, and the game's connections are
// replaced (MapFactoryHelper.clear).
//
// createMinimap loads graphics asynchronously, so a map's sprite gets its
// bitmap a moment after it's created (MapSprite/getMapSprite); until then
// it's 0x0 and can't be clicked.

import { writeConnectionsSteps } from "../../compiler/WritePBS";
import { runWriteSteps } from "../../compiler/Compiler";
import { GameData } from "../../data/gameData";
import { pbLoadTownMapData } from "../../data/gameData/miscPBSData";
import type { MapConnection as PbsMapConnection } from "../../data/pbs/types";
import { Data, mapDims, setMapConnections } from "../../data/store";
import { G } from "../../game/globals";
import { getMousePos } from "../../plugins/easyMouse/Mouse";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { _INTL, pbDisposeSpriteHash, pbDoEnsureBitmap, pbUpdateSpriteHash, Settings } from "../../ui/messageConfig";
import { pbConfirmMessage } from "../../ui/messages";
import { pbSetResizeFactor } from "../../ui/options/options";
import { ColoredPlane } from "../../ui/planes";
import { KeyboardInput } from "../../ui/textEntry/keyboard";
import { Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { MapPointSprites } from "../EditorDataTypes";
import { MapLister, pbListScreen } from "../EditorListers";
import { devWriteOrExplain } from "../devFiles";
import { EditorScreens } from "../editorScreens";
import { pbCriticalCode } from "../Errors";
import { gameDataLoad, pad3 } from "./EditorData";
import { pbEditMapMetadata } from "./EditorScreens";
import { createMinimap } from "./TileDrawingHelper";

/** [map1, x1, y1, map2, x2, y2] (MapFactoryHelper's resolved connections). */
export type Conn = [number, number, number, number, number, number];

/** A sprite whose bitmap is still loading has no size yet. */
const bmpW = (s: Sprite) => s.bitmap?.width ?? 0;
const bmpH = (s: Sprite) => s.bitmap?.height ?? 0;

//===============================================================================
// Miniature game map drawing
//===============================================================================
export class MapSprite {
  private sprite: Sprite;

  constructor(map: number, viewport: Viewport | null = null) {
    this.sprite = new Sprite(viewport);
    void createMinimap(map).then((bitmap) => {
      if (this.sprite.isDisposed()) return bitmap.dispose();
      this.sprite.setBitmap(bitmap);
      this.sprite.x = Math.floor(Graphics.width / 2) - Math.floor(bitmap.width / 2);
      this.sprite.y = Math.floor(Graphics.height / 2) - Math.floor(bitmap.height / 2);
    });
  }

  dispose(): void {
    this.sprite.bitmap?.dispose();
    this.sprite.dispose();
  }

  set z(value: number) { this.sprite.z = value; }
  get z(): number { return this.sprite.z; }

  getXY(): [number, number] | null {
    if (!Input.trigger(Input.MOUSELEFT)) return null;
    const mouse = getMousePos(true);
    if (!mouse || !this.sprite.bitmap) return null;
    if (mouse[0] < this.sprite.x || mouse[0] >= this.sprite.x + this.sprite.bitmap.width) return null;
    if (mouse[1] < this.sprite.y || mouse[1] >= this.sprite.y + this.sprite.bitmap.height) return null;
    const x = mouse[0] - this.sprite.x;
    const y = mouse[1] - this.sprite.y;
    return [Math.floor(x / 4), Math.floor(y / 4)];
  }
}

//===============================================================================
//
//===============================================================================
export class SelectionSprite {
  private sprite: Sprite;
  private _othersprite: Sprite | null = null;

  constructor(viewport: Viewport | null = null) {
    this.sprite = new Sprite(viewport);
    this.sprite.setBitmap(null);
    this.sprite.z = 2;
  }

  isDisposed(): boolean {
    return this.sprite.isDisposed();
  }

  dispose(): void {
    this.sprite.bitmap?.dispose();
    this._othersprite = null;
    this.sprite.dispose();
  }

  set othersprite(value: Sprite | null) {
    this._othersprite = value;
    if (value && !value.isDisposed() && value.bitmap && !value.bitmap.isDisposed()) {
      const w = value.bitmap.width;
      const h = value.bitmap.height;
      this.sprite.setBitmap(pbDoEnsureBitmap(this.sprite.bitmap, w, h));
      const red = new Color(255, 0, 0);
      const bitmap = this.sprite.bitmap!;
      bitmap.clear();
      bitmap.fillRect(0, 0, w, 2, red);
      bitmap.fillRect(0, h - 2, w, 2, red);
      bitmap.fillRect(0, 0, 2, h, red);
      bitmap.fillRect(w - 2, 0, 2, h, red);
    }
  }

  update(): void {
    const other = this._othersprite;
    if (other && !other.isDisposed()) {
      this.sprite.visible = other.visible;
      this.sprite.x = other.x;
      this.sprite.y = other.y;
    } else {
      this.sprite.visible = false;
    }
  }
}

//===============================================================================
//
//===============================================================================
export class RegionMapSprite {
  private sprite: Sprite;

  constructor(map: number, viewport: Viewport | null = null) {
    this.sprite = new Sprite(viewport);
    void this.createRegionMap(map).then((bitmap) => {
      if (this.sprite.isDisposed()) return bitmap.dispose();
      this.sprite.setBitmap(bitmap);
      this.sprite.x = Math.floor(Graphics.width / 2) - Math.floor(bitmap.width / 2);
      this.sprite.y = Math.floor(Graphics.height / 2) - Math.floor(bitmap.height / 2);
    });
  }

  dispose(): void {
    this.sprite.bitmap?.dispose();
    this.sprite.dispose();
  }

  set z(value: number) { this.sprite.z = value; }
  get z(): number { return this.sprite.z; }

  async createRegionMap(map: number): Promise<Bitmap> {
    const mapdata = pbLoadTownMapData();
    const region = mapdata[map]!;
    const bitmap = (await Bitmap.load(`Graphics/Pictures/${region.filename}`)) ?? new Bitmap(32, 32);
    const retbitmap = new Bitmap(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2));
    retbitmap.stretchBlt(
      new Rect(0, 0, Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2)),
      bitmap,
      new Rect(0, 0, bitmap.width, bitmap.height),
    );
    bitmap.dispose();
    return retbitmap;
  }

  getXY(): [number, number] | null {
    if (!Input.trigger(Input.MOUSELEFT)) return null;
    const mouse = getMousePos(true);
    if (!mouse || !this.sprite.bitmap) return null;
    if (mouse[0] < this.sprite.x || mouse[0] >= this.sprite.x + this.sprite.bitmap.width) return null;
    if (mouse[1] < this.sprite.y || mouse[1] >= this.sprite.y + this.sprite.bitmap.height) return null;
    const x = mouse[0] - this.sprite.x;
    const y = mouse[1] - this.sprite.y;
    return [Math.floor(x / 8), Math.floor(y / 8)];
  }
}

MapPointSprites.MapSprite = MapSprite;
MapPointSprites.RegionMapSprite = RegionMapSprite;

/** MapFactoryHelper.getMapConnections, deduplicated as mapScreen does. */
export function currentMapConnections(): Conn[] {
  const ret: Conn[] = [];
  const ids = [...Data.connections.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    for (const c of Data.connections.get(id)!) {
      const conn: Conn = [c.mapA, c.xA, c.yA, c.mapB, c.xB, c.yB];
      if (!ret.some((x) => x[0] === conn[0] && x[3] === conn[3])) ret.push(conn);
    }
  }
  return ret;
}

/**
 * save_data(conndata, "Data/map_connections.dat"), Compiler.write_connections
 * and MapFactoryHelper.clear: rewrites PBS/map_connections.txt and makes the
 * game use the new connections.
 */
export async function saveConnectionData(conndata: Conn[]): Promise<boolean> {
  const records: PbsMapConnection[] = conndata.map((c) => ({
    map1: c[0], edge1: c[1] as never, position1: c[2], map2: c[3], edge2: c[4] as never, position2: c[5],
  }));
  const ok = await devWriteOrExplain("PBS/map_connections.txt",
    () => runWriteSteps(writeConnectionsSteps("PBS/map_connections.txt", records)));
  if (ok) setMapConnections(conndata.map((c) => [...c]));
  return ok;
}

//===============================================================================
// Visual Editor (map connections)
//===============================================================================
export class MapScreenScene {
  private sprites: Record<string, { update?(): void; dispose(): void } & object> = {};
  private mapsprites = new Map<number, Sprite>();
  private mapspritepos = new Map<number, [number, number]>();
  private viewport!: Viewport;
  private lasthitmap = -1;
  private lastclick = -1;
  private oldmousex: number | null = null;
  private oldmousey: number | null = null;
  private dragging = false;
  private dragmapid = -1;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private selmapid = -1;
  private mapinfos = Data.mapInfos;
  mapconns: Conn[] = [];
  private currentmap = 1;
  /** Minimaps still loading (getMapSprite). */
  private pending: Promise<void>[] = [];

  getMapSprite(id: number): Sprite {
    if (!this.mapsprites.has(id)) {
      const s = new Sprite(this.viewport);
      s.z = 0;
      s.setBitmap(null);
      this.mapsprites.set(id, s);
    }
    const sprite = this.mapsprites.get(id)!;
    if ((!sprite.bitmap || sprite.bitmap.isDisposed()) && !(sprite as { loading?: boolean }).loading) {
      (sprite as { loading?: boolean }).loading = true;
      this.pending.push(createMinimap(id).then((bitmap) => {
        (sprite as { loading?: boolean }).loading = false;
        if (sprite.isDisposed()) return bitmap.dispose();
        sprite.setBitmap(bitmap);
      }));
    }
    return sprite;
  }

  /** Waits for the minimaps being drawn (Ruby draws them at once). */
  async loadPending(): Promise<void> {
    while (this.pending.length > 0) await this.pending.shift();
  }

  close(): void {
    pbDisposeSpriteHash(this.sprites as never);
    for (const s of this.mapsprites.values()) { s.bitmap?.dispose(); s.dispose(); }
    this.viewport.dispose();
  }

  setMapSpritePos(id: number, x: number, y: number): void {
    const sprite = this.getMapSprite(id);
    sprite.x = x;
    sprite.y = y;
    sprite.visible = true;
  }

  putNeighbors(id: number, sprites: number[]): void {
    const conns = this.mapconns;
    const mapsprite = this.getMapSprite(id);
    const dispx = mapsprite.x;
    const dispy = mapsprite.y;
    for (const conn of conns) {
      if (conn[0] === id) {
        const b = sprites.some((i) => i === conn[3]);
        if (!b) {
          const x = ((conn[1] - conn[4]) * 4) + dispx;
          const y = ((conn[2] - conn[5]) * 4) + dispy;
          this.setMapSpritePos(conn[3], x, y);
          sprites.push(conn[3]);
          this.putNeighbors(conn[3], sprites);
        }
      } else if (conn[3] === id) {
        const b = sprites.some((i) => i === conn[0]);
        if (!b) {
          const x = ((conn[4] - conn[1]) * 4) + dispx;
          const y = ((conn[5] - conn[2]) * 4) + dispy;
          this.setMapSpritePos(conn[0], x, y);
          // NOTE (Ruby parity): pushes conn[3] (this map) instead of conn[0]
          // (003_EditorScreens_MapConnections.rb:177), so a map reached this
          // way can be placed again (and again) from its other neighbours.
          sprites.push(conn[3]);
          this.putNeighbors(conn[0], sprites);
        }
      }
    }
  }

  hasConnections(conns: Conn[], id: number): boolean {
    for (const conn of conns) {
      if (conn[0] === id || conn[3] === id) return true;
    }
    return false;
  }

  connectionsSymmetric(conn1: Conn, conn2: Conn): boolean {
    if (conn1[0] === conn2[0]) {
      // Equality
      for (let i = 1; i < 6; i++) if (conn1[i] !== conn2[i]) return false;
      return true;
    } else if (conn1[0] === conn2[3]) {
      // Symmetry
      if (conn1[1] !== -conn2[1]) return false;
      if (conn1[2] !== -conn2[2]) return false;
      if (conn1[3] !== conn2[0]) return false;
      if (conn1[4] !== -conn2[4]) return false;
      if (conn1[5] !== -conn2[5]) return false;
      return true;
    }
    return false;
  }

  removeOldConnections(ret: Conn[], mapid: number): void {
    for (let i = ret.length - 1; i >= 0; i--) {
      if (ret[i]![0] === mapid || ret[i]![3] === mapid) ret.splice(i, 1);
    }
  }

  // Returns the maps within _keys_ that are directly connected to this map, _map_.
  getDirectConnections(keys: number[], map: number): number[] {
    const thissprite = this.getMapSprite(map);
    const thisdims = mapDims(map);
    const ret: number[] = [];
    for (const i of keys) {
      if (i === map) continue;
      const othersprite = this.getMapSprite(i);
      const otherdims = mapDims(i);
      const x1 = Math.floor((thissprite.x - othersprite.x) / 4);
      const y1 = Math.floor((thissprite.y - othersprite.y) / 4);
      if (x1 === otherdims[0] || x1 === -thisdims[0] || y1 === otherdims[1] || y1 === -thisdims[1]) {
        ret.push(i);
      }
    }
    // If no direct connections, add an indirect connection
    if (ret.length === 0) {
      const key = map === keys[0] ? keys[1]! : keys[0]!;
      ret.push(key);
    }
    return ret;
  }

  generateConnectionData(): Conn[] {
    const ret: Conn[] = [];
    // Create a clone of current map connection
    for (const conn of this.mapconns) ret.push([...conn] as Conn);
    const keys = [...this.mapsprites.keys()];
    if (keys.length < 2) return ret;
    // Remove all connections containing any sprites on the canvas from the array
    for (const i of keys) this.removeOldConnections(ret, i);
    // Rebuild connections
    for (const i of keys) {
      const refs = this.getDirectConnections(keys, i);
      for (const refmap of refs) {
        const othersprite = this.getMapSprite(i);
        const refsprite = this.getMapSprite(refmap);
        const c1 = Math.floor((refsprite.x - othersprite.x) / 4);
        const c2 = Math.floor((refsprite.y - othersprite.y) / 4);
        const conn: Conn = [refmap, 0, 0, i, c1, c2];
        let j = 0;
        while (j < ret.length && !this.connectionsSymmetric(ret[j]!, conn)) j += 1;
        if (j === ret.length) ret.push(conn);
      }
    }
    return ret;
  }

  async serializeConnectionData(): Promise<void> {
    const conndata = this.generateConnectionData();
    await saveConnectionData(conndata);
    this.mapconns = conndata;
  }

  putSprite(id: number): void {
    this.addSprite(id);
    this.putNeighbors(id, []);
  }

  addSprite(id: number): void {
    const mapsprite = this.getMapSprite(id);
    const x = Math.floor((Graphics.width - bmpW(mapsprite)) / 2);
    const y = Math.floor((Graphics.height - bmpH(mapsprite)) / 2);
    mapsprite.x = x & ~3;
    mapsprite.y = y & ~3;
  }

  saveMapSpritePos(): void {
    this.mapspritepos.clear();
    for (const [i, s] of this.mapsprites) {
      if (s && !s.isDisposed()) this.mapspritepos.set(i, [s.x, s.y]);
    }
  }

  /** mapScreen: sets the scene up around the current map. */
  async mapScreen(): Promise<void> {
    this.sprites = {};
    this.mapsprites = new Map();
    this.mapspritepos = new Map();
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.lasthitmap = -1;
    this.lastclick = -1;
    this.oldmousex = null;
    this.oldmousey = null;
    this.dragging = false;
    this.dragmapid = -1;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.selmapid = -1;
    this.sprites.background = new ColoredPlane(new Color(160, 208, 240), this.viewport);
    this.sprites.selsprite = new SelectionSprite(this.viewport);
    const title = Window_UnformattedTextPokemon.newWithSize(
      _INTL("D: Help"), 0, Graphics.height - 64, Graphics.width, 64, this.viewport,
    );
    title.z = 2;
    this.sprites.title = title;
    this.mapinfos = Data.mapInfos; // pbLoadMapInfos
    this.mapconns = currentMapConnections();
    const gameMap = G.gameMap as { mapId: number } | null;
    if (gameMap) {
      this.currentmap = gameMap.mapId;
    } else {
      this.currentmap = (Data.system as { editMapId?: number } | null)?.editMapId ?? 1;
    }
    // (The minimaps' sizes are needed to centre the first map)
    this.getMapSprite(this.currentmap);
    await this.loadPending();
    this.putSprite(this.currentmap);
    await this.loadPending();
  }

  setTopSprite(id: number): void {
    for (const [i, s] of this.mapsprites) s.z = i === id ? 1 : 0;
  }

  async helpWindow(): Promise<void> {
    let helptext = _INTL("A: Add map to canvas\r\n");
    helptext += _INTL("DEL: Delete map from canvas\r\n");
    helptext += _INTL("S: Go to another map\r\n");
    helptext += _INTL("Click to select a map\r\n");
    helptext += _INTL("Double-click: Edit map's metadata\r\n");
    helptext += _INTL("Drag map to move it\r\n");
    helptext += _INTL("Arrow keys/drag canvas: Move around canvas");
    const title = Window_UnformattedTextPokemon.newWithSize(
      helptext, 0, 0, Math.floor(Graphics.width * 8 / 10), Graphics.height, this.viewport,
    );
    title.z = 2;
    for (;;) {
      await Graphics.update();
      Input.update();
      if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) break;
    }
    Input.update();
    title.dispose();
  }

  getMapRect(mapid: number): [number, number, number, number] | null {
    const sprite = this.getMapSprite(mapid);
    if (!sprite) return null;
    return [sprite.x, sprite.y, sprite.x + bmpW(sprite), sprite.y + bmpH(sprite)];
  }

  async onDoubleClick(mapId: number): Promise<void> {
    if (mapId > 0) await pbEditMapMetadata(mapId);
  }

  async onClick(mapid: number, x: number, y: number): Promise<void> {
    if (this.lastclick > 0 && Graphics.frameCount - this.lastclick < 0.5 / Graphics.deltaS) { // frame_rate * 0.5
      await this.onDoubleClick(mapid);
      this.lastclick = -1;
    } else {
      this.lastclick = Graphics.frameCount;
      const selsprite = this.sprites.selsprite as SelectionSprite;
      if (mapid >= 0) {
        this.dragging = true;
        this.dragmapid = mapid;
        const sprite = this.getMapSprite(mapid);
        selsprite.othersprite = sprite;
        this.selmapid = mapid;
        this.dragOffsetX = sprite.x - x;
        this.dragOffsetY = sprite.y - y;
        this.setTopSprite(mapid);
      } else {
        selsprite.othersprite = null;
        this.dragging = true;
        this.dragmapid = mapid;
        this.selmapid = -1;
        this.dragOffsetX = x;
        this.dragOffsetY = y;
        this.saveMapSpritePos();
      }
    }
  }

  onRightClick(_mapid: number, _x: number, _y: number): void {
    // echoln "rightclick (#{mapid})"
  }

  onMouseUp(_mapid: number): void {
    // echoln "mouseup (#{mapid})"
    if (this.dragging) this.dragging = false;
  }

  onRightMouseUp(_mapid: number): void {
    // echoln "rightmouseup (#{mapid})"
  }

  onMouseOver(_mapid: number, _x: number, _y: number): void {
    // echoln "mouseover (#{mapid},#{x},#{y})"
  }

  onMouseMove(mapid: number, x: number, y: number): void {
    const title = this.sprites.title as Window_UnformattedTextPokemon;
    if (this.dragging) {
      if (this.dragmapid >= 0) {
        const sprite = this.getMapSprite(this.dragmapid);
        x = x + this.dragOffsetX;
        y = y + this.dragOffsetY;
        sprite.x = x & ~3;
        sprite.y = y & ~3;
        // (_ISPRINTF("D: Help [{1:03d}: {2:s}]", mapid, ...): the hovered map's ID with the dragged map's name)
        title.text = `D: Help [${pad3(mapid)}: ${this.mapinfos.get(this.dragmapid)?.name ?? ""}]`;
      } else {
        const xpos = x - this.dragOffsetX;
        const ypos = y - this.dragOffsetY;
        for (const [i, pos] of this.mapspritepos) {
          const sprite = this.getMapSprite(i);
          sprite.x = (pos[0] + xpos) & ~3;
          sprite.y = (pos[1] + ypos) & ~3;
        }
        title.text = _INTL("D: Help");
      }
    } else if (mapid >= 0) {
      title.text = `D: Help [${pad3(mapid)}: ${this.mapinfos.get(mapid)?.name ?? ""}]`;
    } else {
      title.text = _INTL("D: Help");
    }
  }

  hittest(x: number, y: number): number {
    for (const [i, s] of this.mapsprites) {
      const sx = s.x;
      const sy = s.y;
      const sr = sx + bmpW(s);
      const sb = sy + bmpH(s);
      if (x >= sx && x < sr && y >= sy && y < sb) return i;
    }
    return -1;
  }

  chooseMapScreen(title: string, currentmap: number): Promise<number> {
    return pbListScreen(title, new MapLister(currentmap));
  }

  async update(): Promise<void> {
    const mousepos = getMousePos();
    if (mousepos) {
      const hitmap = this.hittest(mousepos[0], mousepos[1]);
      if (Input.trigger(Input.MOUSELEFT)) {
        await this.onClick(hitmap, mousepos[0], mousepos[1]);
      } else if (Input.trigger(Input.MOUSERIGHT)) {
        this.onRightClick(hitmap, mousepos[0], mousepos[1]);
      } else if (Input.release(Input.MOUSELEFT)) {
        this.onMouseUp(hitmap);
      } else if (Input.release(Input.MOUSERIGHT)) {
        this.onRightMouseUp(hitmap);
      } else {
        if (this.lasthitmap !== hitmap) {
          this.onMouseOver(hitmap, mousepos[0], mousepos[1]);
          this.lasthitmap = hitmap;
        }
        if (this.oldmousex !== mousepos[0] || this.oldmousey !== mousepos[1]) {
          this.onMouseMove(hitmap, mousepos[0], mousepos[1]);
          this.oldmousex = mousepos[0];
          this.oldmousey = mousepos[1];
        }
      }
    }
    if (Input.press(Input.UP)) for (const s of this.mapsprites.values()) s.y += 4;
    if (Input.press(Input.DOWN)) for (const s of this.mapsprites.values()) s.y -= 4;
    if (Input.press(Input.LEFT)) for (const s of this.mapsprites.values()) s.x += 4;
    if (Input.press(Input.RIGHT)) for (const s of this.mapsprites.values()) s.x -= 4;
    const selsprite = this.sprites.selsprite as SelectionSprite;
    if (KeyboardInput.triggerex("A")) {
      const id = await this.chooseMapScreen(_INTL("Add Map"), this.currentmap);
      if (id > 0) {
        this.getMapSprite(id);
        await this.loadPending();
        this.addSprite(id);
        this.setTopSprite(id);
        this.mapconns = this.generateConnectionData();
      }
    } else if (KeyboardInput.triggerex("S")) {
      const id = await this.chooseMapScreen(_INTL("Go to Map"), this.currentmap);
      if (id > 0) {
        this.mapconns = this.generateConnectionData();
        for (const s of this.mapsprites.values()) { s.bitmap?.dispose(); s.dispose(); } // pbDisposeSpriteHash
        this.mapsprites.clear();
        selsprite.othersprite = null;
        this.selmapid = -1;
        this.getMapSprite(id);
        await this.loadPending();
        this.putSprite(id);
        await this.loadPending();
        this.currentmap = id;
      }
    } else if (KeyboardInput.triggerex("DELETE")) {
      if (this.mapsprites.size > 1 && this.selmapid >= 0) {
        const s = this.mapsprites.get(this.selmapid)!;
        s.bitmap?.dispose();
        s.dispose();
        this.mapsprites.delete(this.selmapid);
        selsprite.othersprite = null;
        this.selmapid = -1;
      }
    } else if (KeyboardInput.triggerex("D")) {
      await this.helpWindow();
    }
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbMapScreenLoop(): Promise<void> {
    for (;;) {
      await Graphics.update();
      Input.update();
      KeyboardInput.update();
      await this.update();
      if (Input.trigger(Input.BACK)) {
        if (await pbConfirmMessage(_INTL("Save changes?"))) {
          await this.serializeConnectionData();
          // MapFactoryHelper.clear: saveConnectionData replaced the game's connections
        } else {
          // NOTE (Ruby parity): reloads the encounters, not the connections
          // (which this editor never changed outside itself) (003_EditorScreens_MapConnections.rb:561).
          await gameDataLoad(GameData.Encounter);
        }
        if (await pbConfirmMessage(_INTL("Exit from the editor?"))) break;
      }
    }
  }
}

//===============================================================================
//
//===============================================================================
export async function pbConnectionsEditor(): Promise<void> {
  await pbCriticalCode(async () => {
    Graphics.resizeScreen(Settings.SCREEN_WIDTH + 288, Settings.SCREEN_HEIGHT + 288);
    pbSetResizeFactor(1);
    try {
      const mapscreen = new MapScreenScene();
      await mapscreen.mapScreen();
      await mapscreen.pbMapScreenLoop();
      mapscreen.close();
    } finally {
      Graphics.resizeScreen(Settings.SCREEN_WIDTH, Settings.SCREEN_HEIGHT);
      pbSetResizeFactor((G.pokemonSystem as { screensize: number }).screensize);
    }
  });
}

EditorScreens.pbConnectionsEditor = pbConnectionsEditor;
