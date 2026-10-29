// Every script call in the game's events (web/data/maps/*.json,
// common-events.json and system.json's script switches) resolves to something the port has: a function
// registered with defineScript, an Interpreter method, or a method/property of
// the real object a $global chain reaches. No untranslated Ruby is left
// (see data/reports/conversion.json), and every event command and move-route
// command is one the interpreter runs.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAssetIndex } from "../core/assets";
import { GameData } from "./gameData";
import { loadGameDataForTests } from "./gameData/testing";
import { loadGameData, preloadMaps, setMapConnections } from "./store";
import type { Command, CommonEvent, Expr } from "./events";
import type { MapData } from "./types";
import { SceneMap } from "../scenes/SceneMap";
import { GameEvent } from "../game/GameEvent";
import { GamePlayer } from "../game/GamePlayer";
import { G, GameSelfSwitches, GameSwitches, GameVariables, PokemonGlobalMetadata, PokemonSystem } from "../game/globals";
import { GameSystem } from "../game/GameSystem";
import { GameScreen } from "../game/GameScreen";
import { Interpreter } from "../game/Interpreter";
import { PokemonMapFactory } from "../game/MapFactory";
import { Pokemon } from "../game/pokemon/Pokemon";
import { SaveData } from "../game/save/SaveData";
import { camel, evaluate, isDefinedScript, missingScripts, RUBY_ARRAY_METHODS, runStatementsSync, scriptGlobal, type ScriptContext } from "../game/scriptApi";
import type { Player } from "../game/trainer/Player";
// The script modules the game loads (main.ts and what it imports).
import { initializeGame } from "../game/newGame";
import "../debug";
import "../ui/menus/menuScreens";
import "../ui/load/loadScreen";
import "../ui/save/saveScreen";
import "../game/Game";

void initializeGame; // imported for its script modules only

const DATA = resolve(import.meta.dirname, "../../data");
const GAME = resolve(import.meta.dirname, "../../..");
const read = <T>(path: string): T => JSON.parse(readFileSync(join(DATA, path), "utf8")) as T;

/** A command list with where it is ("Map025/EV1/p0", "CommonEvent46"). */
interface Site { where: string; list: Command[]; event: boolean }

function sites(): Site[] {
  const out: Site[] = [];
  for (const file of readdirSync(join(DATA, "maps")).sort()) {
    const map = read<MapData>(`maps/${file}`);
    for (const ev of map.events) {
      ev.pages.forEach((p, i) => out.push({ where: `${file.slice(0, -5)}/EV${ev.id}/p${i}`, list: p.list as Command[], event: true }));
      // Page conditions can be script switches too (Essentials' "s:" switch names aren't used here).
    }
  }
  for (const ce of read<(CommonEvent | null)[]>("common-events.json")) {
    if (ce) out.push({ where: `CommonEvent${ce.id}`, list: ce.list, event: false });
  }
  return out;
}

/** What a reference needs: a bare/dotted name, or a method on a computed receiver. */
interface Ref { name: string; on?: Expr; assign?: boolean; locals: Set<string>; where: string }

/** Every call/assign in a command list, with the Script command's locals in scope. */
function collect(list: unknown, where: string, locals: Set<string>, refs: Ref[], ruby: string[], cmds: Set<string>, moves: Set<string>): void {
  const expr = (e: unknown, scope: Set<string>): void => {
    if (Array.isArray(e)) return e.forEach((x) => expr(x, scope));
    if (!e || typeof e !== "object") return;
    const o = e as Record<string, unknown>;
    if (typeof o.call === "string") {
      refs.push({ name: o.call, ...(o.on !== undefined ? { on: o.on as Expr } : {}), locals: scope, where });
      expr(o.on, scope);
      expr(o.args, scope);
      return;
    }
    if (Array.isArray(o.proc)) return expr(o.body, new Set([...scope, ...(o.proc as string[])]));
    if (typeof o.ruby === "string") return void ruby.push(`${where}: ${o.ruby}`);
    for (const v of Object.values(o)) expr(v, scope);
  };
  const stmt = (c: Command, scope: Set<string>): void => {
    if (c.cmd === "call") {
      refs.push({ name: c.fn as string, ...(c.on !== undefined ? { on: c.on as Expr } : {}), locals: scope, where });
      expr(c.on, scope);
      expr(c.args, scope);
    } else if (c.cmd === "assign") {
      const target = c.target as string;
      if (!/^[a-z_]\w*$/.test(target) || !scope.has(target)) refs.push({ name: target, assign: true, locals: scope, where });
      expr(c.args, scope);
      expr(c.value, scope);
    }
  };
  for (const c of (list as Command[]) ?? []) {
    cmds.add(c.cmd);
    if (c.cmd === "call" || c.cmd === "assign") {
      stmt(c, locals);
      continue;
    }
    if (c.cmd === "script") {
      if (typeof c.ruby === "string") ruby.push(`${where}: ${c.ruby}`);
      const stmts = (c.do as Command[]) ?? [];
      const scope = new Set(stmts.filter((s) => s.cmd === "assign" && /^[a-z_]\w*$/.test(s.target as string)).map((s) => s.target as string));
      for (const s of stmts) {
        if (s.cmd !== "call" && s.cmd !== "assign") cmds.add(`script/${s.cmd}`);
        stmt(s, scope);
      }
      continue;
    }
    if (c.cmd === "moveRoute") {
      for (const m of (c.route as { list: { move: string; do?: Command[]; ruby?: string }[] }).list) {
        moves.add(m.move);
        if (m.move === "script") {
          if (m.ruby !== undefined) ruby.push(`${where} (move route): ${m.ruby}`);
          for (const s of m.do ?? []) stmt(s, new Set());
        }
      }
      continue;
    }
    if (c.cmd === "if") {
      expr(c.cond, locals);
      collect(c.then, where, locals, refs, ruby, cmds, moves);
      collect(c.else, where, locals, refs, ruby, cmds, moves);
      continue;
    }
    if (c.cmd === "choices") {
      for (const b of c.branches as Command[][]) collect(b, where, locals, refs, ruby, cmds, moves);
      continue;
    }
    if (c.cmd === "loop") {
      collect(c.body ?? c.list, where, locals, refs, ruby, cmds, moves);
      continue;
    }
    expr(c, locals);
  }
}

// --- resolving a reference against the running game's objects ---------------

let ctx: ScriptContext;
let samplePokemon: Pokemon;
let sampleEvent: GameEvent;

/** Receivers whose class is known from the call that produces them. */
const POKEMON_SOURCES = /^(pbGetPokemon|Pokemon\.new|pbFirstAblePokemon|\$player\.(first_pokemon|first_able_pokemon|last_party|party\[\]|pokemon_party\[\]|able_party\[\]))$/;
const EVENT_SOURCES = /^(get_self|get_character|get_event|\$game_player|\$game_map\.events\[\]|pbMapInterpreter\.get_character)$/;

function hasMember(obj: unknown, name: string): boolean {
  if (obj == null || (typeof obj !== "object" && typeof obj !== "function")) return false;
  if (name === "[]") return true;
  if (Array.isArray(obj) && RUBY_ARRAY_METHODS.includes(name)) return true;
  const o = obj as Record<string, unknown>;
  return name in o || camel(name) in o || o[camel(name)] !== undefined;
}

function receiverSample(on: Expr): unknown {
  if (on && typeof on === "object" && !Array.isArray(on) && "call" in on) {
    const name = (on as { call: string }).call;
    if (POKEMON_SOURCES.test(name)) return samplePokemon;
    if (EVENT_SOURCES.test(name)) return sampleEvent;
  }
  return undefined;
}

/** Why `ref` doesn't resolve, or null when it does. */
function problem(ref: Ref): string | null {
  const { name } = ref;
  if (ref.on !== undefined) {
    if (isDefinedScript(`#${name}`)) return null; // raises as in Ruby (scripts/rubyErrors.ts)
    const sample = receiverSample(ref.on);
    if (sample !== undefined) return hasMember(sample, name) ? null : `${name} on ${(ref.on as { call: string }).call}`;
    // Unknown receiver: the member must exist on one of the objects events handle.
    const pool = [samplePokemon, sampleEvent, G.player, G.gamePlayer, G.gameMap, G.bag, G.storage, []];
    return pool.some((o) => hasMember(o, name)) ? null : `${name} on an unknown receiver`;
  }
  const root = name.split(/[.[]/)[0]!;
  if (ref.locals.has(root)) return null;
  if (ref.assign) {
    if (isDefinedScript(`${name}=`)) return null;
    if (!name.includes(".") && !name.endsWith("[]")) return "assignment to an unknown name";
  } else if (isDefinedScript(name) || ["@event_id", "@map_id", "get_self", "self"].includes(name) || scriptGlobal(name)) {
    return null;
  } else if (camel(name) in Interpreter.prototype || camel(name) in sampleEvent) {
    return null;
  }
  // A chain: the receiver must evaluate on the real objects and have the member.
  const index = name.endsWith("[]");
  const path = index ? name.slice(0, -2) : name;
  const dot = index ? -1 : path.lastIndexOf(".");
  const recvPath = index ? path : dot < 0 ? null : path.slice(0, dot);
  if (recvPath === null) return "not registered";
  const before = missingScripts().length;
  const recv = evaluate({ call: recvPath }, ctx);
  if (missingScripts().length > before) return `receiver ${recvPath} doesn't resolve`;
  if (index) return recv == null ? `${recvPath} is nil` : null;
  const member = path.slice(dot + 1);
  if (recv == null) {
    if (/^\$player\.(first_|last_)/.test(recvPath)) return hasMember(samplePokemon, member) ? null : `${member} on a Pokémon`;
    return `receiver ${recvPath} is nil`;
  }
  return hasMember(recv, member) ? null : `${member} on ${recvPath}`;
}

// Commands Interpreter#executeCommand runs (and the importer emits).
const INTERPRETER_COMMANDS = new Set(readFileSync(resolve(import.meta.dirname, "../game/Interpreter.ts"), "utf8")
  .match(/case "([a-zA-Z]+)":/g)!.map((m) => m.slice(6, -2)));
const MOVE_COMMANDS = new Set(readFileSync(resolve(import.meta.dirname, "../game/GameCharacter.ts"), "utf8")
  .match(/case "([a-zA-Z0-9]+)":/g)!.map((m) => m.slice(6, -2)));

const refs: Ref[] = [];
const ruby: string[] = [];
const cmds = new Set<string>();
const moves = new Set<string>();

beforeAll(async () => {
  globalThis.fetch = (async (url: string) => {
    if (url === "/game/__index.json") {
      const files = (readdirSync(join(GAME, "Graphics/Characters"), { recursive: true }) as string[])
        .map((f) => `graphics/characters/${f.split("\\").join("/")}`.toLowerCase());
      return { ok: true, status: 200, json: async () => files.flatMap((f) => [f, f.replace(/\.[a-z]+$/, "")]) } as Response;
    }
    const text = readFileSync(join(DATA, String(url).replace(/^\/data\//, "")), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) as unknown } as Response;
  }) as typeof fetch;
  await loadAssetIndex();
  loadGameDataForTests();
  await loadGameData();
  const connections = read<{ map1: number; edge1: string; position1: number; map2: number; edge2: string; position2: number }[]>("pbs/map-connections.json");
  setMapConnections(connections.map((c) => [c.map1, c.edge1, c.position1, c.map2, c.edge2, c.position2]));
  await preloadMaps(8, 0);
  // A new game in Elm's Lab with a Pokémon in the party.
  SaveData.markValuesAsUnloaded();
  SaveData.loadNewGameValues();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.pokemonSystem = new PokemonSystem();
  G.gameSwitches = new GameSwitches();
  G.gameVariables = new GameVariables();
  G.gameSelfSwitches = new GameSelfSwitches();
  G.gameSystem = new GameSystem();
  G.gameScreen = new GameScreen();
  G.gameSystem.mapInterpreter = new Interpreter(0, true);
  const player = G.player as unknown as Player;
  samplePokemon = new Pokemon("CHIKORITA", 5, player as never);
  player.party.push(samplePokemon);
  G.scene = Object.create(SceneMap.prototype) as never;
  G.gamePlayer = new GamePlayer() as never;
  new PokemonMapFactory(8);
  sampleEvent = [...(G.gameMap as unknown as { events: Map<number, GameEvent> }).events.values()][0]!;
  expect(sampleEvent).toBeInstanceOf(GameEvent);
  const interp = G.gameSystem.mapInterpreter as unknown as Interpreter;
  ctx = { event: sampleEvent, interpreter: interp as never };
  // Map 194's duel assigns $speeches = [] before pushing to it.
  runStatementsSync([{ cmd: "assign", target: "$speeches", args: [], op: "=", value: [] }], ctx);
  for (const site of sites()) collect(site.list, site.where, new Set(), refs, ruby, cmds, moves);
  // Script switches ("s:" switch names, Game_Event#switchIsOn? evaluates them).
  for (const [id, expr] of Object.entries(read<{ scriptSwitches: Record<string, Expr> }>("system.json").scriptSwitches)) {
    collect([{ cmd: "if", cond: { script: expr }, then: [] }], `Switch${id}`, new Set(), refs, ruby, cmds, moves);
  }
  void GameData;
});

// Not ported yet, with why.
const PENDING: Record<string, string> = {};

describe("event scripts", () => {
  it("call only names the port has", () => {
    const bad = new Map<string, string>();
    for (const ref of refs) {
      if (ref.name in PENDING && isDefinedScript(ref.name)) throw new Error(`${ref.name} is ported now: drop it from PENDING`);
      if (ref.name in PENDING) continue;
      const key = `${ref.assign ? "=" : ""}${ref.name}${ref.on !== undefined ? " (on)" : ""}`;
      if (bad.has(key)) continue;
      const why = problem(ref);
      if (why) bad.set(key, `${why} (${ref.where})`);
    }
    expect([...bad].map(([k, v]) => `${k}: ${v}`).sort()).toEqual([]);
  });

  it("have no untranslated Ruby left", () => {
    expect(ruby).toEqual([]);
  });

  it("only use commands the interpreter runs", () => {
    expect([...cmds].filter((c) => !INTERPRETER_COMMANDS.has(c)).sort()).toEqual([]);
    expect([...moves].filter((m) => !MOVE_COMMANDS.has(m)).sort()).toEqual([]);
  });

  it("only use message codes pbMessageDisplay handles", () => {
    // The text replacements and controls of pbMessageDisplay (ui/messages.ts, 011_Messages.rb).
    const codes = [/\\sign\[[^\]]*\]/gi, /\\\\/g, /\\1/g, /\\n\[[1-8]\]/gi, /\\pn/gi, /\\pm/gi, /\\\[[0-9a-f]{8}\]/gi,
      /\\[Ww]\[[^\]]*\]/g, /\\c\[[0-9]+\]/gi, /\\v\[[0-9]+\]/gi, /\\l\[[0-9]+\]/gi,
      /\\(f|ff|ts|cl|me|se|wt|wtnp|ch)\[[^\]]*\]/gi, /\\n/gi, /\\pog/gi, /\\pg/gi, /\\b/gi, /\\r/gi,
      /\\(g|cn|pt|wd|wm|op|cl|wu|\.|\||!|\^)/gi];
    const left: string[] = [];
    const scan = (text: string, where: string) => {
      let t = text;
      for (const re of codes) t = t.replace(re, "");
      if (t.includes("\\")) left.push(`${where}: ${text}`);
    };
    const walk = (x: unknown, where: string): void => {
      if (Array.isArray(x)) return x.forEach((v) => walk(v, where));
      if (!x || typeof x !== "object") return;
      const c = x as Record<string, unknown>;
      if (c.cmd === "text") scan(c.text as string, where);
      if (c.cmd === "choices") (c.choices as string[]).forEach((t) => scan(t, where));
      if (c.cmd === "call" && c.fn === "pbMessage" && typeof (c.args as unknown[])[0] === "string") scan((c.args as string[])[0]!, where);
      Object.values(c).forEach((v) => walk(v, where));
    };
    for (const site of sites()) walk(site.list, site.where);
    // Typos in the original's text, shown as written there too (docs/original-game-bugs.md).
    expect(left.sort()).toEqual([
      "Map251/EV31/p0: \\f[faceNorman]\\bEntão a Equipe Magma ainda está com \\v [76]?!",
      "Map251/EV31/p0: \\f[faceNorman]\\bEntão a Equipe Magma ainda está com \\v [77]?!",
      "Map314/EV3/p0: \\Olá eu sou o Move Deleter.",
      "Map678/EV7/p0: \\Hm! Você está montado em um Pokémon ao invés de nadar sozinho...",
    ]);
  });

  it("match the conversion report", () => {
    const report = read<{ untranslatedScripts: unknown[]; untranslatedConditions: unknown[] }>("reports/conversion.json");
    expect(report.untranslatedScripts.length + report.untranslatedConditions.length).toBe(new Set(ruby.map((r) => r.slice(r.indexOf(": ") + 2))).size);
  });
});
