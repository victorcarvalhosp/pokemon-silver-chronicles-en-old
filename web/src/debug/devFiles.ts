// The browser side of the dev server's file endpoint (tools/devFiles.ts). The
// Debug menu's commands that write files in Ruby (File.open / File.move /
// Compiler.write_*) go through these. On a production build (or a static
// host) the endpoint doesn't exist: the calls throw DevFilesUnavailable and
// devWriteOrExplain says so in the message window. Paths are relative to the
// game root and must lie under web/data/ or PBS/ (devFilesPolicy.ts).

import { _INTL } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { checkDevPath, DEV_READ_ROOTS, DEV_WRITE_ROOTS } from "./devFilesPolicy";

export class DevFilesUnavailable extends Error {
  constructor(message = "The dev server's file endpoint isn't available") {
    super(message);
    this.name = "DevFilesUnavailable";
  }
}

let availability: Promise<boolean> | null = null;

async function post(route: string, body: unknown): Promise<Record<string, unknown>> {
  if (!(await DevFiles.available())) throw new DevFilesUnavailable();
  const res = await fetch(`/__dev/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.ok === false) throw new Error(String(json.error ?? json.output ?? `HTTP ${res.status}`));
  return json;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const DevFiles = {
  /** Whether the dev server's endpoint answers (checked once). */
  available(): Promise<boolean> {
    if (typeof fetch === "undefined") return Promise.resolve(false);
    availability ??= fetch("/__dev/ping")
      .then(async (r) => r.ok && ((await r.json().catch(() => null)) as { ok?: boolean } | null)?.ok === true)
      .catch(() => false);
    return availability;
  },

  /** For tests: forget the cached availability. */
  resetAvailability(): void {
    availability = null;
  },

  /** File.open(path, "wb") { |f| f.write(content) } (or "ab" with append). */
  async write(path: string, content: string | Uint8Array, append = false): Promise<void> {
    if (!checkDevPath(path, DEV_WRITE_ROOTS)) throw new Error(`Writing ${path} is not allowed (only under ${DEV_WRITE_ROOTS.join(", ")})`);
    const binary = typeof content !== "string";
    await post("write", { path, content: binary ? toBase64(content) : content, encoding: binary ? "base64" : "utf8", append });
  },

  /** File.move(from, to) */
  async move(from: string, to: string): Promise<void> {
    await post("move", { from, to });
  },

  /** File.read(path); null if it doesn't exist. */
  async read(path: string): Promise<string | null> {
    if (!checkDevPath(path, DEV_READ_ROOTS)) throw new Error(`Reading ${path} is not allowed`);
    if (!(await DevFiles.available())) throw new DevFilesUnavailable();
    const res = await fetch(`/__dev/read?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },

  /** Every file under dir (recursively), relative to it (Dir.glob with "**"). */
  async list(dir: string): Promise<string[]> {
    if (!(await DevFiles.available())) throw new DevFilesUnavailable();
    const res = await fetch(`/__dev/list?dir=${encodeURIComponent(dir)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as string[];
  },

  /** Compiler.compile_all: runs `pnpm pbs` (tools/pbs/compile.ts) on the dev server; returns its output. */
  async compilePbs(): Promise<string> {
    const json = await post("compile-pbs", {});
    return String(json.output ?? "");
  },
};

/** The message shown when a write can't be done. */
export function devFilesErrorMessage(e: unknown, what: string): string {
  if (e instanceof DevFilesUnavailable) {
    return _INTL("Can't write {1}: the browser has no file system, and the dev server's file endpoint isn't available (it only exists under `pnpm dev`).", what);
  }
  return _INTL("Couldn't write {1}: {2}", what, String((e as Error)?.message ?? e));
}

/**
 * Runs a block of file writes; if the endpoint is missing or refuses a write,
 * says so in the message window and returns false.
 */
export async function devWriteOrExplain(what: string, block: () => Promise<void>): Promise<boolean> {
  try {
    await block();
    return true;
  } catch (e) {
    console.warn(e);
    await pbMessage(devFilesErrorMessage(e, what));
    return false;
  }
}
