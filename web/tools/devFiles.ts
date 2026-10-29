// The dev server's file endpoint: the browser has no file system, so the
// Debug menu's commands that write files in Ruby (Compile Data, Create PBS
// files, Fix Invalid Tiles, the editors...) send their writes here. Only
// `vite` (dev) installs it (`apply: "serve"`, configureServer); `vite build`
// and `vite preview` don't. Paths are relative to the game root and must lie
// under web/data/ or PBS/ (src/debug/devFilesPolicy.ts). See docs/data.md.
//
//   GET  /__dev/ping                       -> {ok: true}
//   GET  /__dev/read?path=PBS/items.txt    -> the file (also Graphics/Audio/Fonts)
//   GET  /__dev/list?dir=PBS               -> ["items.txt", ...] (recursive)
//   POST /__dev/write {path, content, encoding?: "utf8" | "base64", append?: boolean}
//   POST /__dev/move  {from, to}           (both under web/data/ or PBS/)
//   POST /__dev/compile-pbs                -> runs tools/pbs/compile.ts, {ok, output}

import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Connect, Plugin } from "vite";
import { checkDevPath, DEV_READ_ROOTS, DEV_WRITE_ROOTS } from "../src/debug/devFilesPolicy";

type Req = Parameters<Connect.NextHandleFunction>[0];
type Res = Parameters<Connect.NextHandleFunction>[1];

function send(res: Res, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: Req): Promise<string> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

export function devFiles(gameRoot: string): Plugin {
  // Resolves a checked relative path and makes sure no symlink leads out of the game root.
  const resolveChecked = (path: unknown, roots: string[]): string | null => {
    const rel = checkDevPath(String(path ?? ""), roots);
    if (!rel) return null;
    const full = resolve(gameRoot, rel);
    let dir = full;
    while (!existsSync(dir)) dir = dirname(dir);
    const real = relative(realpathSync(gameRoot), realpathSync(dir));
    if (real.startsWith("..")) return null;
    return full;
  };
  return {
    name: "dev-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev", (req, res, next) => {
        void (async () => {
          const url = new URL(req.url ?? "/", "http://localhost");
          const route = url.pathname;
          try {
            if (route === "/ping") return send(res, 200, { ok: true, roots: DEV_WRITE_ROOTS });
            if (route === "/read" && req.method === "GET") {
              const full = resolveChecked(url.searchParams.get("path"), DEV_READ_ROOTS);
              if (!full) return send(res, 403, { ok: false, error: "path not allowed" });
              if (!existsSync(full) || !statSync(full).isFile()) return send(res, 404, { ok: false, error: "not found" });
              res.setHeader("Content-Type", "application/octet-stream");
              return res.end(readFileSync(full));
            }
            if (route === "/list" && req.method === "GET") {
              const dir = url.searchParams.get("dir") ?? "";
              const full = resolveChecked(dir.endsWith("/") ? dir + "x" : dir + "/x", DEV_READ_ROOTS);
              if (!full) return send(res, 403, { ok: false, error: "path not allowed" });
              const base = dirname(full);
              if (!existsSync(base)) return send(res, 200, []);
              const files = (readdirSync(base, { recursive: true }) as string[])
                .filter((f) => statSync(join(base, f)).isFile())
                .map((f) => f.split("\\").join("/"));
              return send(res, 200, files);
            }
            if (req.method !== "POST") return next();
            if (route === "/compile-pbs") {
              const web = join(gameRoot, "web");
              execFile(process.execPath, ["tools/pbs/compile.ts"], { cwd: web, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
                send(res, err ? 500 : 200, { ok: !err, output: String(stdout) + String(stderr) });
              });
              return;
            }
            const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
            if (route === "/write") {
              const full = resolveChecked(body.path, DEV_WRITE_ROOTS);
              if (!full) return send(res, 403, { ok: false, error: `writing ${String(body.path)} is not allowed (only under ${DEV_WRITE_ROOTS.join(", ")})` });
              const data = body.encoding === "base64"
                ? Buffer.from(String(body.content ?? ""), "base64")
                : Buffer.from(String(body.content ?? ""), "utf8");
              mkdirSync(dirname(full), { recursive: true });
              if (body.append) appendFileSync(full, data);
              else writeFileSync(full, data);
              return send(res, 200, { ok: true, bytes: data.length });
            }
            if (route === "/move") {
              const from = resolveChecked(body.from, DEV_WRITE_ROOTS);
              const to = resolveChecked(body.to, DEV_WRITE_ROOTS);
              if (!from || !to) return send(res, 403, { ok: false, error: `moving ${String(body.from)} to ${String(body.to)} is not allowed (only under ${DEV_WRITE_ROOTS.join(", ")})` });
              if (!existsSync(from)) return send(res, 404, { ok: false, error: "not found" });
              mkdirSync(dirname(to), { recursive: true });
              renameSync(from, to);
              return send(res, 200, { ok: true });
            }
            return next();
          } catch (e) {
            return send(res, 500, { ok: false, error: String((e as Error).message ?? e) });
          }
        })();
      });
    },
  };
}
