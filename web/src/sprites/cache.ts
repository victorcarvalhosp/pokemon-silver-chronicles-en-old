// RPG::Cache: bitmaps by path + hue. Ruby loads synchronously; here get()
// returns what's already loaded and ensure() fetches. Scenes preload what a
// map needs (preloadMapGraphics) so sprites don't pop in.

import { Bitmap } from "../rgss/Bitmap";
import type { MapData } from "../data/types";

const loaded = new Map<string, Bitmap | null>();
const pending = new Map<string, Promise<Bitmap | null>>();

const key = (path: string, hue: number) => `${path.toLowerCase()}#${hue}`;

export const Cache = {
  get(path: string, hue = 0): Bitmap | null | undefined {
    return loaded.get(key(path, hue));
  },

  ensure(path: string, hue = 0): Promise<Bitmap | null> {
    const k = key(path, hue);
    if (loaded.has(k)) return Promise.resolve(loaded.get(k)!);
    let p = pending.get(k);
    if (!p) {
      p = (async () => {
        const base = hue ? await Cache.ensure(path, 0) : await Bitmap.load(path);
        let bmp = base;
        if (base && hue) {
          bmp = base.clone();
          bmp.hueChange(hue);
        }
        loaded.set(k, bmp);
        pending.delete(k);
        return bmp;
      })();
      pending.set(k, p);
    }
    return p;
  },

  character(name: string, hue = 0) { return Cache.get(`Graphics/Characters/${name}`, hue); },
  ensureCharacter(name: string, hue = 0) { return Cache.ensure(`Graphics/Characters/${name}`, hue); },
  picture(name: string) { return Cache.get(`Graphics/Pictures/${name}`); },
  ensurePicture(name: string) { return Cache.ensure(`Graphics/Pictures/${name}`); },
};

/** Loads every character graphic the map's events can show. */
export async function preloadMapGraphics(map: MapData): Promise<void> {
  const names = new Set<string>();
  for (const ev of map.events) {
    for (const page of ev.pages) {
      if (page.graphic.characterName) names.add(`${page.graphic.characterName}#${page.graphic.characterHue}`);
      for (const m of page.moveRoute.list) {
        if (m.move === "graphic") names.add(`${(m as { characterName: string }).characterName}#0`);
      }
    }
  }
  await Promise.all([...names].map((n) => {
    const [name, hue] = n.split("#") as [string, string];
    return Cache.ensureCharacter(name, Number(hue));
  }));
}
