// Which files the dev server's file endpoint (tools/devFiles.ts, see
// docs/data.md) may write: only the game's tracked data (web/data/) and the
// PBS sources. Pure string logic so the Vite plugin and the tests share it
// (no node imports: nothing in the browser bundle should pull in node:path).

/** Folders (relative to the game root) the endpoint may write under. */
export const DEV_WRITE_ROOTS = ["web/data/", "PBS/"];

/** Folders it may also read or list (the asset folders are served at /game/ anyway). */
export const DEV_READ_ROOTS = [...DEV_WRITE_ROOTS, "Graphics/", "Audio/", "Fonts/"];

/**
 * Normalises a game-root-relative path ("PBS/items.txt", "web/data/maps/Map001.json")
 * and returns it if it lies under one of `roots`, else null. Rejects absolute
 * paths, drive letters, NUL bytes and ".." that climbs out of the root.
 */
export function checkDevPath(path: string, roots: string[] = DEV_WRITE_ROOTS): string | null {
  if (typeof path !== "string" || path === "" || path.includes("\0")) return null;
  const slashed = path.replace(/\\/g, "/");
  if (slashed.startsWith("/") || /^[a-zA-Z]:/.test(slashed)) return null;
  const parts: string[] = [];
  for (const seg of slashed.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  if (parts.length === 0) return null;
  const normalized = parts.join("/");
  for (const root of roots) {
    if (normalized.startsWith(root) && normalized.length > root.length) return normalized;
  }
  return null;
}
