// Loads images from the RPG Maker project folders (served under /game/ by
// the dev server, which resolves missing extensions and letter case).

const cache = new Map<string, Promise<ImageBitmap | null>>();

export function assetUrl(path: string): string {
  return `/game/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function fetchBlob(path: string): Promise<Blob | null> {
  const res = await fetch(assetUrl(path));
  if (!res.ok) return null;
  // A file that doesn't exist falls through to the dev server's index.html.
  if ((res.headers.get("content-type") ?? "").startsWith("text/html")) return null;
  return res.blob();
}

/** Loads a whole image, or null when the file doesn't exist. */
export function loadImage(path: string): Promise<ImageBitmap | null> {
  const key = path.toLowerCase();
  let entry = cache.get(key);
  if (!entry) {
    entry = fetchBlob(path).then((blob) => (blob ? createImageBitmap(blob) : null));
    cache.set(key, entry);
  }
  return entry;
}

/**
 * Loads an image as horizontal strips no taller than maxHeight. Some
 * tilesets are ~38000px tall, past both canvas and GPU texture limits.
 */
export async function loadImageStrips(path: string, maxHeight: number): Promise<{ width: number; height: number; strips: ImageBitmap[] } | null> {
  const blob = await fetchBlob(path);
  if (!blob) return null;
  const image = await createImageBitmap(blob);
  if (image.height <= maxHeight) return { width: image.width, height: image.height, strips: [image] };
  const strips: ImageBitmap[] = [];
  for (let y = 0; y < image.height; y += maxHeight) {
    strips.push(await createImageBitmap(image, 0, y, image.width, Math.min(maxHeight, image.height - y)));
  }
  const result = { width: image.width, height: image.height, strips };
  image.close();
  return result;
}

export function graphicsPath(folder: string, name: string): string {
  return `Graphics/${folder}/${name}`;
}

// Every asset path (lowercased, with and without extension), so code ported
// from Ruby can check for a file synchronously (pbResolveBitmap,
// FileTest.audio_exist?).
let assetIndex = new Set<string>();

export async function loadAssetIndex(): Promise<void> {
  const res = await fetch("/game/__index.json");
  assetIndex = new Set((await res.json()) as string[]);
}

export function assetExists(path: string): boolean {
  return assetIndex.has(path.toLowerCase());
}

/** Every indexed asset path (lowercased), for Dir.get/Dir.all (core/fileTests.ts). */
export function assetPaths(): string[] {
  return [...assetIndex];
}
