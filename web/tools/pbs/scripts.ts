// Reads the game's Ruby scripts (Data/Scripts plus every plugin in Plugins/)
// for the few things the PBS compiler needs from code rather than PBS files:
// hardcoded GameData enums (including ones plugins register, e.g. Gen 9
// evolution methods or the Ultra Space habitat) and Settings constants. This
// keeps the TS compiler in step with the scripts instead of copying values.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface Registration {
  cls: string;
  id: string;
  /** Top-level `:key => value` pairs, values as raw Ruby source. */
  props: Map<string, string>;
  file: string;
}

export interface RubySources {
  /** Hardcoded GameData classes → registered symbol IDs, in registration order. */
  enums: Map<string, Set<string>>;
  registrations: Map<string, Registration[]>;
  /** Names (from meta.txt) of the plugins in Plugins/. */
  installedPlugins: Set<string>;
  intConst(name: string): number;
  /** Symbols in the last `name = [...]` array literal. */
  symbolArray(name: string): string[];
  /** Last match of a multiline regex across all scripts. */
  find(re: RegExp): RegExpExecArray | null;
  /** Text of every loaded script, in load order (comments removed). */
  files: { path: string; text: string }[];
}

function listRb(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listRb(full));
    else if (entry.endsWith(".rb")) out.push(full);
  }
  return out;
}

/** Drops =begin/=end blocks and full-line # comments. */
function stripComments(text: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of text.split(/\r?\n/)) {
    if (inBlock) {
      if (line.startsWith("=end")) inBlock = false;
      out.push("");
    } else if (line.startsWith("=begin")) {
      inBlock = true;
      out.push("");
    } else {
      out.push(/^\s*#/.test(line) ? "" : line);
    }
  }
  return out.join("\n");
}

/**
 * Loads Data/Scripts/**.rb in name order, then each installed plugin (a folder
 * in Plugins/ with a meta.txt) in folder order. PluginManager orders plugins by
 * their dependencies; nothing extracted here depends on that order.
 */
export function loadRubySources(gameRoot: string): RubySources {
  const paths = listRb(join(gameRoot, "Data", "Scripts"));
  const installedPlugins = new Set<string>();
  const pluginsDir = join(gameRoot, "Plugins");
  if (existsSync(pluginsDir)) {
    for (const plugin of readdirSync(pluginsDir).sort()) {
      const dir = join(pluginsDir, plugin);
      const meta = join(dir, "meta.txt");
      if (!statSync(dir).isDirectory() || !existsSync(meta)) continue;
      const name = /^\s*Name\s*=\s*(.+?)\s*$/m.exec(readFileSync(meta, "utf8"));
      if (name) installedPlugins.add(name[1]!);
      paths.push(...listRb(dir));
    }
  }
  const files = paths.map((p) => ({
    path: relative(gameRoot, p).split("\\").join("/"),
    text: stripComments(readFileSync(p, "utf8")),
  }));

  const registrations = new Map<string, Registration[]>();
  const enums = new Map<string, Set<string>>();
  const REG = /GameData::(\w+)\.register\(\{([\s\S]*?)\n[ \t]*\}\)/g;
  for (const f of files) {
    for (const m of f.text.matchAll(REG)) {
      const props = new Map<string, string>();
      for (const line of m[2]!.split("\n")) {
        const kv = /^[ \t]*:(\w+)[ \t]*=>[ \t]*(.*)$/.exec(line);
        if (!kv || props.has(kv[1]!)) continue;
        props.set(kv[1]!, kv[2]!.replace(/\s+#.*$/, "").replace(/,\s*$/, "").trim());
      }
      const id = props.get("id");
      if (!id || !/^:\w+$/.test(id)) continue;
      const reg: Registration = { cls: m[1]!, id: id.slice(1), props, file: f.path };
      if (!registrations.has(reg.cls)) registrations.set(reg.cls, []);
      registrations.get(reg.cls)!.push(reg);
      if (!enums.has(reg.cls)) enums.set(reg.cls, new Set());
      enums.get(reg.cls)!.add(reg.id);
    }
  }

  const lastMatch = (re: RegExp): RegExpExecArray | null => {
    let found: RegExpExecArray | null = null;
    for (const f of files) {
      for (const m of f.text.matchAll(new RegExp(re.source, "gm"))) found = m as RegExpExecArray;
    }
    return found;
  };

  return {
    enums,
    registrations,
    files,
    installedPlugins,
    find: lastMatch,
    intConst(name) {
      const m = lastMatch(new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*(-?\\d+)\\b`));
      if (!m) throw new Error(`Ruby constant ${name} not found in scripts`);
      return parseInt(m[1]!, 10);
    },
    symbolArray(name) {
      const m = lastMatch(new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*\\[([^\\]]*)\\]`));
      if (!m) throw new Error(`Ruby array ${name} not found in scripts`);
      return [...m[1]!.replace(/#[^\n]*/g, "").matchAll(/:(\w+)/g)].map((s) => s[1]!);
    },
  };
}
