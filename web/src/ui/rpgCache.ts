// Port of the parts of 001_RPG_Cache.rb / pbResolveBitmap the window and
// message code needs. Ruby loads bitmaps synchronously; the browser can't, so
// graphics are fetched ahead of time (preloadBitmaps) and then read
// synchronously exactly where Essentials reads them. Reading a graphic that
// wasn't preloaded logs a warning, starts loading it and behaves as if the
// file didn't exist for that call.

import { Bitmap } from "../rgss/Bitmap";

const loaded = new Map<string, Bitmap | null>();
const pending = new Map<string, Promise<Bitmap | null>>();
const warned = new Set<string>();

function cacheKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\.(png|gif|jpe?g|bmp)$/i, "").toLowerCase();
}

/** Fetches a graphic ("Graphics/Pictures/pause", extension optional) into the cache. */
export function preloadBitmap(path: string): Promise<Bitmap | null> {
  const key = cacheKey(path);
  if (loaded.has(key)) return Promise.resolve(loaded.get(key)!);
  let p = pending.get(key);
  if (!p) {
    p = Bitmap.load(path.replace(/\\/g, "/"))
      .catch(() => null)
      .then((bmp) => {
        loaded.set(key, bmp);
        pending.delete(key);
        return bmp;
      });
    pending.set(key, p);
  }
  return p;
}

export async function preloadBitmaps(paths: Iterable<string>): Promise<void> {
  await Promise.all([...paths].map((p) => preloadBitmap(p)));
}

/** True once the graphic was fetched (whether or not it exists). */
export function isBitmapPreloaded(path: string): boolean {
  return loaded.has(cacheKey(path));
}

function lookup(path: string): Bitmap | null {
  const key = cacheKey(path);
  if (loaded.has(key)) return loaded.get(key)!;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`Graphic not preloaded, treated as missing this time: ${path}`);
  }
  void preloadBitmap(path);
  return null;
}

/** pbResolveBitmap: the path if the graphic exists, else null. */
export function pbResolveBitmap(path: string | null | undefined): string | null {
  if (!path) return null;
  return lookup(path) ? path : null;
}

/** pbBitmapName */
export function pbBitmapName(path: string): string {
  return pbResolveBitmap(path) ?? path;
}

/**
 * RPG::Cache.load_bitmap(folder, name): the shared cached bitmap. Callers must
 * not draw onto or dispose it (Ruby's cache is reference counted; here cached
 * bitmaps simply live forever).
 */
export const RPGCache = {
  loadBitmap(folder: string, name = ""): Bitmap | null {
    return lookup(folder + name);
  },
};
