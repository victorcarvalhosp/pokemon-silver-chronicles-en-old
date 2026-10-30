// The dev server's file endpoint (tools/devFiles.ts): which paths it accepts,
// and that writes outside web/data/ and PBS/ are refused end to end.

import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { devFiles } from "../../tools/devFiles";
import { checkDevPath, DEV_READ_ROOTS } from "./devFilesPolicy";

describe("checkDevPath", () => {
  it("accepts files under web/data/ and PBS/", () => {
    expect(checkDevPath("PBS/items.txt")).toBe("PBS/items.txt");
    expect(checkDevPath("web/data/maps/Map001.json")).toBe("web/data/maps/Map001.json");
    expect(checkDevPath("PBS\\Plugins\\x.txt")).toBe("PBS/Plugins/x.txt");
    expect(checkDevPath("./PBS/./a/../items.txt")).toBe("PBS/items.txt");
  });

  it("refuses everything else", () => {
    for (const p of [
      "", "PBS", "PBS/", "web/data", "Graphics/Characters/a.png", "Audio/SE/x.ogg", "web/src/main.ts",
      "web/vite.config.ts", "/etc/passwd", "C:/Windows/x", "PBS/../web/src/main.ts", "../PBS/items.txt",
      "web/data/../../Data/Scripts/x.rb", "pbs/items.txt", "PBS/items.txt\0.png", "Animations/x/y.png",
    ]) {
      expect(checkDevPath(p), p).toBeNull();
    }
  });

  it("lets the asset folders be read but not written", () => {
    expect(checkDevPath("Graphics/Pictures/a.png", DEV_READ_ROOTS)).toBe("Graphics/Pictures/a.png");
    expect(checkDevPath("Graphics/Pictures/a.png")).toBeNull();
  });
});

/** Runs one request through the plugin's middleware against a temporary game root. */
async function request(root: string, method: string, url: string, body?: unknown): Promise<{ status: number; text: string }> {
  let handler: ((req: unknown, res: unknown, next: () => void) => void) | null = null;
  const plugin = devFiles(root);
  (plugin.configureServer as (s: unknown) => void)({
    middlewares: { use: (_path: string, fn: typeof handler) => { handler = fn; } },
  });
  const req = new PassThrough() as PassThrough & { url: string; method: string };
  req.url = url;
  req.method = method;
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      set statusCode(v: number) { status = v; },
      setHeader() {},
      end(data?: string | Buffer) { resolve({ status, text: data === undefined ? "" : String(data) }); },
    };
    handler!(req, res, () => resolve({ status: 404, text: "next" }));
    req.end(body === undefined ? "" : JSON.stringify(body));
  });
}

describe("dev file endpoint", () => {
  const root = mkdtempSync(join(tmpdir(), "devfiles-"));
  mkdirSync(join(root, "PBS"));
  mkdirSync(join(root, "web", "data"), { recursive: true });
  mkdirSync(join(root, "Graphics"));
  writeFileSync(join(root, "Graphics", "a.txt"), "graphic");
  const outside = mkdtempSync(join(tmpdir(), "devfiles-outside-"));
  symlinkSync(outside, join(root, "PBS", "escape"));

  it("answers ping", async () => {
    expect(JSON.parse((await request(root, "GET", "/ping")).text).ok).toBe(true);
  });

  it("writes, appends and reads PBS and web/data files", async () => {
    expect((await request(root, "POST", "/write", { path: "PBS/test.txt", content: "a\r\n" })).status).toBe(200);
    expect((await request(root, "POST", "/write", { path: "PBS/test.txt", content: "b", append: true })).status).toBe(200);
    expect(readFileSync(join(root, "PBS", "test.txt"), "utf8")).toBe("a\r\nb");
    await request(root, "POST", "/write", { path: "web/data/maps/Map999.json", content: Buffer.from("{}").toString("base64"), encoding: "base64" });
    expect(readFileSync(join(root, "web", "data", "maps", "Map999.json"), "utf8")).toBe("{}");
    expect((await request(root, "GET", "/read?path=PBS/test.txt")).text).toBe("a\r\nb");
    expect((await request(root, "GET", "/read?path=Graphics/a.txt")).text).toBe("graphic");
    expect(JSON.parse((await request(root, "GET", "/list?dir=web/data")).text)).toEqual(["maps/Map999.json"]);
  });

  it("refuses writes outside web/data/ and PBS/", async () => {
    for (const path of ["Graphics/a.txt", "web/src/x.ts", "../x.txt", "PBS/../x.txt", "/tmp/x.txt", "PBS/escape/x.txt"]) {
      const res = await request(root, "POST", "/write", { path, content: "x" });
      expect(res.status, path).toBe(403);
    }
    expect(readFileSync(join(root, "Graphics", "a.txt"), "utf8")).toBe("graphic");
    expect(existsSync(join(outside, "x.txt"))).toBe(false);
    expect((await request(root, "POST", "/move", { from: "PBS/test.txt", to: "Graphics/b.txt" })).status).toBe(403);
    expect((await request(root, "GET", "/read?path=web/vite.config.ts")).status).toBe(403);
  });

  it("moves within the allowed folders", async () => {
    await request(root, "POST", "/write", { path: "PBS/old.txt", content: "x" });
    expect((await request(root, "POST", "/move", { from: "PBS/old.txt", to: "PBS/new.txt" })).status).toBe(200);
    expect(existsSync(join(root, "PBS", "new.txt"))).toBe(true);
  });

  it("makes folders, lists them, and deletes files and empty folders (Dir.create / all_dirs / delete_all)", async () => {
    expect((await request(root, "POST", "/mkdir", { path: "PBS/tree/a/b" })).status).toBe(200);
    await request(root, "POST", "/write", { path: "PBS/tree/a/f.txt", content: "x" });
    expect(JSON.parse((await request(root, "GET", "/list?dir=PBS/tree&dirs=1")).text).sort()).toEqual(["a", "a/b"]);
    // A folder that isn't empty stays
    expect((await request(root, "POST", "/delete", { path: "PBS/tree/a" })).status).toBe(500);
    expect((await request(root, "POST", "/delete", { path: "PBS/tree/a/f.txt" })).status).toBe(200);
    for (const d of ["PBS/tree/a/b", "PBS/tree/a", "PBS/tree"]) {
      expect((await request(root, "POST", "/delete", { path: d })).status, d).toBe(200);
    }
    expect(existsSync(join(root, "PBS", "tree"))).toBe(false);
    expect((await request(root, "POST", "/delete", { path: "PBS/tree" })).status).toBe(404);
  });

  it("refuses to create or delete outside web/data/ and PBS/ (or those folders themselves, or through symlinks)", async () => {
    writeFileSync(join(outside, "keep.txt"), "k");
    for (const path of ["Graphics/a.txt", "Graphics", "PBS", "PBS/", "web/data", "../x", "PBS/../Graphics/a.txt",
      "PBS/escape/keep.txt", "PBS/escape", "/tmp"]) {
      expect((await request(root, "POST", "/delete", { path })).status, `delete ${path}`).toBe(403);
      expect((await request(root, "POST", "/mkdir", { path })).status, `mkdir ${path}`).toBe(403);
    }
    expect(readFileSync(join(root, "Graphics", "a.txt"), "utf8")).toBe("graphic");
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("k");
    expect(existsSync(join(root, "PBS"))).toBe(true);
  });

  it("is a dev-server-only plugin", () => {
    expect(devFiles(root).apply).toBe("serve");
  });
});

describe("Dir.create / all_dirs / delete_all through the endpoint", () => {
  it("lists folders deepest first, as Dir.all_dirs, and deletes files before folders", async () => {
    const { Dir } = await import("../core/fileTests");
    const { DevFiles } = await import("./devFiles");
    const calls: string[] = [];
    const fake = async (url: string, init?: { body?: string }) => {
      calls.push(init?.body ? `${url} ${init.body}` : url);
      const json = url === "/__dev/ping" ? { ok: true }
        : url.includes("dirs=1") ? ["b", "a", "a/x"]
        : url.startsWith("/__dev/list") ? ["a/x/f.txt", "g.txt"] : { ok: true };
      return { ok: true, status: 200, json: async () => json } as Response;
    };
    const orig = globalThis.fetch;
    globalThis.fetch = fake as typeof fetch;
    DevFiles.resetAvailability();
    try {
      expect(await Dir.allDirs("PBS/t")).toEqual(["PBS/t/a/x", "PBS/t/a", "PBS/t/b", "PBS/t"]);
      calls.length = 0;
      await Dir.deleteAll("PBS/t");
      const deleted = calls.filter((c) => c.startsWith("/__dev/delete")).map((c) => JSON.parse(c.split(" ")[1]!).path);
      expect(deleted).toEqual(["PBS/t/a/x/f.txt", "PBS/t/g.txt", "PBS/t/a/x", "PBS/t/a", "PBS/t/b", "PBS/t"]);
      await Dir.create("PBS\\t\\new");
      expect(calls.at(-1)).toBe('/__dev/mkdir {"path":"PBS/t/new"}');
    } finally {
      globalThis.fetch = orig;
      DevFiles.resetAvailability();
    }
  });
});
