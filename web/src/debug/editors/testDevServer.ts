// Test helper for the editors: runs the dev server's file endpoint
// (tools/devFiles.ts) against a temporary game root and routes the browser
// side's fetch("/__dev/...") to it, so DevFiles.write/read/list work end to
// end in vitest without touching the repo's files. Only imported by tests.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { devFiles } from "../../../tools/devFiles";
import { DevFiles } from "../devFiles";

/** The repo's game root (web/..). */
export const GAME_ROOT = join(__dirname, "..", "..", "..", "..");

export interface TempDevServer {
  root: string;
  /** A file under the temp root (game-root-relative path), or null. */
  read(path: string): string | null;
  write(path: string, content: string | Buffer): void;
  restore(): void;
}

type Handler = (req: unknown, res: unknown, next: () => void) => void;

/**
 * Starts the endpoint on a fresh temp root holding `files` (game-root-relative
 * path -> content; `true` copies the repo's file). Other fetches go to
 * `fallback` (default: the repo's web/ folder for "/data/..." URLs).
 */
export function installTempDevServer(files: Record<string, string | Buffer | true> = {}): TempDevServer {
  const root = mkdtempSync(join(tmpdir(), "editors-"));
  const write = (path: string, content: string | Buffer) => {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };
  for (const [path, content] of Object.entries(files)) {
    write(path, content === true ? readFileSync(join(GAME_ROOT, path)) : content);
  }
  let handler: Handler | null = null;
  (devFiles(root).configureServer as (s: unknown) => void)({
    middlewares: { use: (_path: string, fn: Handler) => { handler = fn; } },
  });
  const originalFetch = globalThis.fetch;
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/__dev")) {
      const req = new PassThrough() as PassThrough & { url: string; method: string };
      req.url = url.slice("/__dev".length);
      req.method = init?.method ?? "GET";
      return new Promise<Response>((resolve) => {
        let status = 200;
        const res = {
          set statusCode(v: number) { status = v; },
          get statusCode() { return status; },
          setHeader() {},
          end(data?: string | Buffer) {
            resolve(new Response(data === undefined ? "" : (typeof data === "string" ? data : new Uint8Array(data)), { status }));
          },
        };
        handler!(req, res, () => resolve(new Response("next", { status: 404 })));
        req.end(typeof init?.body === "string" ? init.body : "");
      });
    }
    if (url.startsWith("/data/")) {
      return new Response(readFileSync(join(GAME_ROOT, "web", url)));
    }
    return originalFetch(input, init);
  };
  globalThis.fetch = fetchImpl as typeof fetch;
  DevFiles.resetAvailability();
  return {
    root,
    read(path: string) {
      try {
        return readFileSync(join(root, path), "utf8");
      } catch {
        return null;
      }
    },
    write,
    restore() {
      globalThis.fetch = originalFetch;
      DevFiles.resetAvailability();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
