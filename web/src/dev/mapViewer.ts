// M1 map viewer: draws any converted map with its tiles, animated autotiles,
// priority layering and event graphics. Replaced by the real Scene_Map in M2.
//
//   ?map=51   open a map      arrows/WASD scroll (Shift = fast)
//   [ / ]     previous/next map

import { Container, Rectangle, Sprite, Texture, TextureSource } from "pixi.js";
import { graphicsPath, loadImage } from "../core/assets";
import { startLoop } from "../core/loop";
import { SCREEN_HEIGHT, SCREEN_WIDTH, createScreen } from "../core/screen";
import { loadMap, loadMapInfos, loadSystem, loadTileset } from "../data/loader";
import type { MapData, MapInfo, Tileset } from "../data/types";
import { TILESET_START_ID } from "../map/autotiles";
import { TilemapRenderer } from "../map/TilemapRenderer";

const hud = document.getElementById("hud")!;
const app = await createScreen(document.getElementById("screen")!);
const viewport = new Container({ sortableChildren: true });
app.stage.addChild(viewport);
const tilemap = new TilemapRenderer(viewport);
const eventLayer: Sprite[] = [];

const [system, infos] = await Promise.all([loadSystem(), loadMapInfos()]);
const mapIds = infos.map((i) => i.id).sort((a, b) => a - b);
const infoById = new Map<number, MapInfo>(infos.map((i) => [i.id, i]));

let map: MapData | null = null;
let mapTileset: Tileset | null = null;
let camX = 0;
let camY = 0;
let loading = false;

async function eventSprite(ev: MapData["events"][number]): Promise<Sprite | null> {
  const g = ev.pages[0]?.graphic;
  if (!g) return null;
  if (g.tileId >= TILESET_START_ID) {
    const tex = mapTileset ? tilemap.textureFor(mapTileset, g.tileId) : null;
    if (!tex) return null;
    const s = new Sprite(tex);
    s.anchor.set(0.5, 1);
    return s;
  }
  if (!g.characterName) return null;
  const image = await loadImage(graphicsPath("Characters", g.characterName));
  if (!image) return null;
  const cw = image.width / 4;
  const ch = image.height / 4;
  const row = Math.max(0, g.direction / 2 - 1);
  const tex = new Texture({ source: TextureSource.from(image), frame: new Rectangle(g.pattern * cw, row * ch, cw, ch) });
  const s = new Sprite(tex);
  s.anchor.set(0.5, 1);
  s.alpha = g.opacity / 255;
  return s;
}

async function openMap(id: number, focus?: { x: number; y: number }) {
  if (loading) return;
  loading = true;
  try {
    const next = await loadMap(id);
    const tileset = await loadTileset(next.tilesetId);
    await tilemap.prepare(tileset);
    mapTileset = tileset;
    for (const s of eventLayer.splice(0)) s.destroy();
    for (const ev of next.events) {
      const s = await eventSprite(ev);
      if (!s) continue;
      s.label = `${ev.x},${ev.y}`;
      viewport.addChild(s);
      eventLayer.push(s);
    }
    map = next;
    const fx = focus ? focus.x * 32 + 16 : (next.width * 32) / 2;
    const fy = focus ? focus.y * 32 + 16 : (next.height * 32) / 2;
    camX = fx - SCREEN_WIDTH / 2;
    camY = fy - SCREEN_HEIGHT / 2;
    history.replaceState(null, "", `?map=${id}`);
  } catch (e) {
    console.error(e);
  } finally {
    loading = false;
  }
}

const held = new Set<string>();
addEventListener("keydown", (e) => {
  held.add(e.key.toLowerCase());
  if (!map) return;
  const index = mapIds.indexOf(map.id);
  if (e.key === "]") void openMap(mapIds[(index + 1) % mapIds.length]!);
  if (e.key === "[") void openMap(mapIds[(index - 1 + mapIds.length) % mapIds.length]!);
});
addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));

const requested = Number(new URLSearchParams(location.search).get("map"));
await openMap(requested || system.startMapId, requested ? undefined : { x: system.startX, y: system.startY });

startLoop({
  update(dt) {
    tilemap.update(dt);
    const speed = (held.has("shift") ? 960 : 320) * dt;
    if (held.has("arrowleft") || held.has("a")) camX -= speed;
    if (held.has("arrowright") || held.has("d")) camX += speed;
    if (held.has("arrowup") || held.has("w")) camY -= speed;
    if (held.has("arrowdown") || held.has("s")) camY += speed;
  },
  render() {
    if (map) {
      const m = map;
      tilemap.draw([{ mapId: m.id, width: m.width, height: m.height, tileset: mapTileset!, displayX: camX, displayY: camY, tile: (x, y, l) => m.layers[l]?.[y]?.[x] ?? 0 }], 0);
      for (const s of eventLayer) {
        const [x, y] = s.label.split(",").map(Number) as [number, number];
        s.x = Math.round(x * 32 + 16 - camX);
        s.y = Math.round(y * 32 + 32 - camY);
        s.zIndex = s.y + 32 - 1;
      }
      const info = infoById.get(map.id);
      hud.textContent = `Map ${map.id} · ${info?.name ?? ""} · ${map.width}×${map.height} · ${map.events.length} events   [ / ] switch map, arrows scroll`;
    }
    app.render();
  },
});
