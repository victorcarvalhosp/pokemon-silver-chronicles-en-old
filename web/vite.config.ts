import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const GAME_ROOT = resolve(import.meta.dirname, "..");
const ASSET_DIRS = ["Graphics", "Audio", "Fonts"];
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mid": "audio/midi",
  ".ttf": "font/ttf",
};

// RPG Maker references assets without extension and with Windows' case
// insensitivity, so index every asset by its lowercased extension-less path.
function buildAssetIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const dir of ASSET_DIRS) {
    const base = join(GAME_ROOT, dir);
    for (const entry of readdirSync(base, { recursive: true }) as string[]) {
      const full = join(base, entry);
      if (!statSync(full).isFile()) continue;
      const rel = relative(GAME_ROOT, full).split("\\").join("/");
      const key = rel.slice(0, rel.length - extname(rel).length).toLowerCase();
      // Prefer PNG/OGG when the same name exists with several extensions.
      const existing = index.get(key);
      if (!existing || [".png", ".ogg"].includes(extname(rel).toLowerCase())) index.set(key, rel);
      index.set(rel.toLowerCase(), rel);
    }
  }
  // Audio rendered by tools/sound/convert.ts replaces the .mid/.wma it came from.
  const cache = join(GAME_ROOT, "web", ".audio-cache");
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache, { recursive: true }) as string[]) {
      if (!entry.endsWith(".ogg")) continue;
      const original = entry.split("\\").join("/");
      const key = original.slice(0, -4).toLowerCase();
      const rel = relative(GAME_ROOT, join(cache, entry)).split("\\").join("/");
      index.set(key, rel);
      for (const ext of [".mid", ".midi", ".wma"]) index.set(key + ext, rel);
    }
  }
  return index;
}

// Serves /game/<path> from the RPG Maker project folder.
function gameAssets(): Plugin {
  let index = buildAssetIndex();
  return {
    name: "game-assets",
    configureServer(server) {
      server.watcher.add([...ASSET_DIRS.map((d) => join(GAME_ROOT, d)), join(GAME_ROOT, "web", ".audio-cache")]);
      let rebuild: ReturnType<typeof setTimeout> | undefined;
      server.watcher.on("add", () => {
        clearTimeout(rebuild);
        rebuild = setTimeout(() => (index = buildAssetIndex()), 500);
      });
      server.middlewares.use("/game", (req, res, next) => {
        if (req.url === "/__index.json") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify([...index.keys()]));
          return;
        }
        const path = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\/+/, "");
        const rel = index.get(path.toLowerCase());
        if (!rel) return next();
        res.setHeader("Content-Type", MIME[extname(rel).toLowerCase()] ?? "application/octet-stream");
        createReadStream(join(GAME_ROOT, rel)).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [gameAssets()],
  server: { port: 5317 },
  test: { include: ["src/**/*.test.ts"] },
});
