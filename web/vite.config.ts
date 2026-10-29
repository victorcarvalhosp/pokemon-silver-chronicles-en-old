import { createReadStream, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const GAME_ROOT = resolve(__dirname, "..");
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
  return index;
}

// Serves /game/<path> from the RPG Maker project folder.
function gameAssets(): Plugin {
  let index = buildAssetIndex();
  return {
    name: "game-assets",
    configureServer(server) {
      server.watcher.add(ASSET_DIRS.map((d) => join(GAME_ROOT, d)));
      server.watcher.on("add", () => (index = buildAssetIndex()));
      server.middlewares.use("/game", (req, res, next) => {
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
