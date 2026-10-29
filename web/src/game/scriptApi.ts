// Runs the Ruby snippets from events after the converter turned them into
// JSON expressions (see tools/convert/ruby_expr.rb).
//
// Names resolve the way Ruby would, mapped onto the TypeScript port:
//   1. functions registered here under their Essentials name ("pbCallBub",
//      "Followers.follow_into_door", "$bag.quantity", "Tone.new", ...)
//   2. methods of the running Interpreter (snake_case -> camelCase)
//   3. globals ($player, $game_map, ...) and method/property chains on them,
//      again snake_case -> camelCase with ?/! dropped
// A Script command whose statements are grouped (`{"cmd": "script", "do": [...]}`)
// also has Ruby local variables: `pkmn = Pokemon.new(...)` assigns one, and a
// bare `pkmn` (or `pkmn.level`) reads it, as in Interpreter#execute_script's eval.
// A Ruby hash literal is `{"hash": {"rank": 3, ...}}` (Symbol keys become strings).
// A Ruby proc/block is `{"proc": ["pkmn"], "body": <expr>}`: a function whose
// parameters are locals while its body (one expression) is evaluated.
// Anything that doesn't resolve logs one warning and evaluates to null, so a
// missing port shows up in the console instead of stopping the game.

import { rand } from "../core/random";
import type { Command, Expr } from "../data/events";
import { SymbolAndNumberData, SymbolData } from "../data/gameData/gameData";
import { Color, Tone } from "../rgss/types";
import { G } from "./globals";

export interface ScriptContext {
  /** The event the script belongs to (get_self). */
  event: unknown | null;
  /** The interpreter running it (null for script switches). */
  interpreter: InterpreterLike | null;
  /** The Script command's local variables (grouped statements only). */
  locals?: Map<string, unknown>;
}

export interface InterpreterLike {
  eventId: number;
  mapId: number;
  [method: string]: unknown;
}

type Fn = (ctx: ScriptContext, ...args: unknown[]) => unknown;

const functions = new Map<string, Fn>();
const rubyScripts = new Map<string, (ctx: ScriptContext) => unknown>();
const warned = new Set<string>();

/** Registers an Essentials function/method by its Ruby name. */
export function defineScript(name: string, fn: Fn): void {
  functions.set(name, fn);
}

/** Registers a hand-port of a Ruby snippet the converter couldn't translate. */
export function defineRubyScript(ruby: string, fn: (ctx: ScriptContext) => unknown): void {
  rubyScripts.set(ruby.trim(), fn);
}

/** Whether `name` is registered with defineScript (for the event data scan). */
export function isDefinedScript(name: string): boolean {
  return functions.has(name);
}

/** The globals event scripts can name ($player, $game_map...). */
export function scriptGlobal(name: string): (() => unknown) | undefined {
  return GLOBALS[name];
}

export function camel(rubyName: string): string {
  return rubyName.replace(/[?!=]$/, "").replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

export function missingScripts(): string[] {
  return [...warned];
}

const GLOBALS: Record<string, () => unknown> = {
  $player: () => G.player,
  $Trainer: () => G.player,
  $game_map: () => G.gameMap,
  $game_player: () => G.gamePlayer,
  $game_switches: () => G.gameSwitches,
  $game_variables: () => G.gameVariables,
  $game_self_switches: () => G.gameSelfSwitches,
  $game_system: () => G.gameSystem,
  $game_screen: () => G.gameScreen,
  $game_temp: () => G.gameTemp,
  $PokemonGlobal: () => G.pokemonGlobal,
  $PokemonSystem: () => G.pokemonSystem,
  $PokemonStorage: () => (G as Record<string, unknown>).storage,
  $map_factory: () => G.mapFactory,
  $scene: () => G.scene,
  $bag: () => (G as Record<string, unknown>).bag,
  $stats: () => (G as Record<string, unknown>).stats,
};

/** Resolves a bare name (no receiver): @event_id, get_self, $globals, constants, functions. */
function resolveName(name: string, ctx: ScriptContext): { found: boolean; value?: unknown; fn?: (args: unknown[]) => unknown } {
  if (ctx.locals?.has(name)) return { found: true, value: ctx.locals.get(name) };
  const fn = functions.get(name);
  if (fn) return { found: true, fn: (args) => fn(ctx, ...args) };
  if (name === "@event_id") return { found: true, value: ctx.interpreter?.eventId ?? (ctx.event as { id?: number } | null)?.id ?? 0 };
  if (name === "@map_id") return { found: true, value: ctx.interpreter?.mapId ?? 0 };
  if (name === "get_self" || name === "self") return { found: true, value: ctx.event };
  const global = GLOBALS[name];
  if (global) return { found: true, value: global() };
  const interp = ctx.interpreter as Record<string, unknown> | null;
  if (interp) {
    const m = interp[camel(name)] ?? interp[name];
    if (typeof m === "function") return { found: true, fn: (args) => (m as (...a: unknown[]) => unknown).apply(interp, args) };
  }
  // Script switches call event methods directly (tsOn?, cooledDown?).
  const ev = ctx.event as Record<string, unknown> | null;
  if (ev) {
    const m = ev[camel(name)];
    if (typeof m === "function") return { found: true, fn: (args) => (m as (...a: unknown[]) => unknown).apply(ev, args) };
  }
  return { found: false };
}

/** Calls `name` on an object: methods via camelCase, else reads the property. */
function callOn(obj: unknown, name: string, args: unknown[], where: string): unknown {
  if (obj == null) {
    warnOnce(`nil.${name}`, `Script: called ${name} on nil (${where})`);
    return null;
  }
  if (name === "[]") return (obj as Record<string, unknown> & { get?: (k: unknown) => unknown }).get?.(args[0]) ?? (obj as unknown[])[args[0] as number];
  if (Array.isArray(obj) && name in RUBY_ARRAY) return RUBY_ARRAY[name]!(obj, args);
  const o = obj as Record<string, unknown>;
  const key = name in o ? name : camel(name);
  const v = o[key];
  if (typeof v === "function") return (v as (...a: unknown[]) => unknown).apply(obj, args);
  if (key in o || v !== undefined) return v;
  // A method the original game doesn't have either (scripts/rubyErrors.ts raises NoMethodError).
  const missing = functions.get(`#${name}`);
  if (missing) return missing({ event: null, interpreter: null }, obj, ...args);
  warnOnce(`${where}:${name}`, `Script: ${name} isn't ported yet (${where})`);
  return null;
}

/** Evaluates a call like "$player.pokedex.register" by walking the chain. */
function evalCall(path: string, args: unknown[], ctx: ScriptContext, on: unknown, hasOn: boolean): unknown {
  if (hasOn) return callOn(on, path, args, path);
  const direct = resolveName(path, ctx);
  if (direct.found) return direct.fn ? direct.fn(args) : indexOrValue(direct.value, path, args);
  // Indexing: "$game_switches[]" / "$player.badges[]"
  if (path.endsWith("[]")) {
    const target = evalCall(path.slice(0, -2), [], ctx, null, false);
    return callOn(target, "[]", args, path);
  }
  const dot = path.lastIndexOf(".");
  if (dot < 0) {
    warnOnce(path, `Script: ${path} isn't ported yet`);
    return null;
  }
  const recv = evalCall(path.slice(0, dot), [], ctx, null, false);
  return callOn(recv, path.slice(dot + 1), args, path);
}

function indexOrValue(value: unknown, _path: string, args: unknown[]): unknown {
  return args.length && typeof value === "function" ? (value as (...a: unknown[]) => unknown)(...args) : value;
}

/** Ruby Array methods events use that a JS array doesn't have under the same name. */
const RUBY_ARRAY: Record<string, (a: unknown[], args: unknown[]) => unknown> = {
  sample: (a) => (a.length === 0 ? null : a[rand(a.length)]),
  each: (a, [block]) => {
    for (const v of [...a]) (block as (v: unknown) => unknown)(v);
    return a;
  },
  "include?": (a, [v]) => a.some((x) => rubyEquals(x, v)),
  "empty?": (a) => a.length === 0,
  size: (a) => a.length,
};
export const RUBY_ARRAY_METHODS = Object.keys(RUBY_ARRAY);

/**
 * Ruby's ==: a GameData object equals its own ID (GameData::InstanceMethods#==,
 * so `pkmn.item == :LEEK` holds); anything else compares by identity/value.
 */
export function rubyEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a instanceof SymbolData || a instanceof SymbolAndNumberData) && typeof b === "string") return (a as { id: unknown }).id === b;
  return false;
}

const BINARY: Record<string, (a: unknown, b: unknown) => unknown> = {
  "==": (a, b) => rubyEquals(a, b),
  "!=": (a, b) => !rubyEquals(a, b),
  "<": (a, b) => (a as number) < (b as number),
  ">": (a, b) => (a as number) > (b as number),
  "<=": (a, b) => (a as number) <= (b as number),
  ">=": (a, b) => (a as number) >= (b as number),
  "+": (a, b) => (a as number) + (b as number),
  "-": (a, b) => (a as number) - (b as number),
  "*": (a, b) => (a as number) * (b as number),
  "/": (a, b) => Math.floor((a as number) / (b as number)),
  "%": (a, b) => (a as number) % (b as number),
};

/** Ruby truthiness: only nil and false are false. */
export function truthy(v: unknown): boolean {
  return v !== null && v !== undefined && v !== false;
}

/** Evaluates an expression; awaits functions that return promises (messages, battles). */
export async function evaluateAsync(expr: Expr | { ruby: string }, ctx: ScriptContext): Promise<unknown> {
  if (expr === null || typeof expr !== "object") return expr;
  if (Array.isArray(expr)) {
    const out: unknown[] = [];
    for (const e of expr) out.push(await evaluateAsync(e, ctx));
    return out;
  }
  if ("ruby" in expr) return runRuby(expr.ruby, ctx);
  if ("proc" in expr) return makeProc(expr, ctx);
  if ("hash" in expr) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(expr.hash)) out[k] = await evaluateAsync(v, ctx);
    return out;
  }
  if ("call" in expr) {
    const args: unknown[] = [];
    for (const a of expr.args ?? []) args.push(await evaluateAsync(a, ctx));
    const on = expr.on !== undefined ? await evaluateAsync(expr.on, ctx) : undefined;
    return await evalCall(expr.call, args, ctx, on, expr.on !== undefined);
  }
  if (expr.op === "!") return !truthy(await evaluateAsync((expr as { value: Expr }).value, ctx));
  const e = expr as { op: string; left: Expr; right: Expr };
  if (e.op === "&&") return truthy(await evaluateAsync(e.left, ctx)) ? evaluateAsync(e.right, ctx) : false;
  if (e.op === "||") {
    const l = await evaluateAsync(e.left, ctx);
    return truthy(l) ? l : evaluateAsync(e.right, ctx);
  }
  return BINARY[e.op]!(await evaluateAsync(e.left, ctx), await evaluateAsync(e.right, ctx));
}

/** Synchronous evaluation, for script switches checked during page refresh. */
export function evaluate(expr: Expr | { ruby: string }, ctx: ScriptContext): unknown {
  if (expr === null || typeof expr !== "object") return expr;
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, ctx));
  if ("ruby" in expr) return runRuby(expr.ruby, ctx);
  if ("proc" in expr) return makeProc(expr, ctx);
  if ("hash" in expr) return Object.fromEntries(Object.entries(expr.hash).map(([k, v]) => [k, evaluate(v, ctx)]));
  if ("call" in expr) {
    const args = (expr.args ?? []).map((a) => evaluate(a, ctx));
    const on = expr.on !== undefined ? evaluate(expr.on, ctx) : undefined;
    const v = evalCall(expr.call, args, ctx, on, expr.on !== undefined);
    if (v instanceof Promise) throw new Error(`${expr.call} is async and can't be used in a script switch`);
    return v;
  }
  if (expr.op === "!") return !truthy(evaluate((expr as { value: Expr }).value, ctx));
  const e = expr as { op: string; left: Expr; right: Expr };
  if (e.op === "&&") return truthy(evaluate(e.left, ctx)) ? evaluate(e.right, ctx) : false;
  if (e.op === "||") {
    const l = evaluate(e.left, ctx);
    return truthy(l) ? l : evaluate(e.right, ctx);
  }
  return BINARY[e.op]!(evaluate(e.left, ctx), evaluate(e.right, ctx));
}

/** proc { |a, b| body }: called synchronously (ableProc filters, Array#each). */
function makeProc(expr: { proc: string[]; body: Expr }, ctx: ScriptContext): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    const locals = new Map(ctx.locals ?? []);
    expr.proc.forEach((name, i) => locals.set(name, args[i] ?? null));
    return evaluate(expr.body, { ...ctx, locals });
  };
}

function runRuby(ruby: string, ctx: ScriptContext): unknown {
  const fn = rubyScripts.get(ruby.trim());
  if (fn) return fn(ctx);
  warnOnce(`ruby:${ruby}`, `Script: untranslated Ruby isn't ported yet:\n${ruby}`);
  return null;
}

/** Runs a translated Script command's statements (call / assign). */
export async function runStatements(stmts: Command[], ctx: ScriptContext): Promise<unknown> {
  let last: unknown = null;
  for (const s of stmts) {
    if (s.cmd === "call") {
      last = await evaluateAsync({ call: s.fn as string, args: s.args as Expr[], ...(s.on !== undefined ? { on: s.on as Expr } : {}) }, ctx);
    } else if (s.cmd === "assign") {
      const value = await evaluateAsync(s.value as Expr, ctx);
      const args: unknown[] = [];
      for (const a of (s.args as Expr[]) ?? []) args.push(await evaluateAsync(a, ctx));
      assign(s.target as string, args, s.op as string, value, ctx);
      last = value;
    }
  }
  return last;
}

/** runStatements for move-route Script commands, which run inside a frame update (no awaiting). */
export function runStatementsSync(stmts: Command[], ctx: ScriptContext): unknown {
  let last: unknown = null;
  for (const s of stmts) {
    if (s.cmd === "call") {
      last = evaluate({ call: s.fn as string, args: s.args as Expr[], ...(s.on !== undefined ? { on: s.on as Expr } : {}) }, ctx);
    } else if (s.cmd === "assign") {
      const value = evaluate(s.value as Expr, ctx);
      assign(s.target as string, ((s.args as Expr[]) ?? []).map((a) => evaluate(a, ctx)), s.op as string, value, ctx);
      last = value;
    }
  }
  return last;
}

function assign(target: string, args: unknown[], op: string, value: unknown, ctx: ScriptContext): void {
  const combine = (old: unknown) => (op === "=" ? value : BINARY[op.slice(0, -1)]!(old, value));
  if (target.endsWith("[]")) {
    const obj = evalCall(target.slice(0, -2), [], ctx, null, false) as { get?(k: unknown): unknown; set?(k: unknown, v: unknown): void } & Record<string, unknown>;
    if (obj?.set && obj.get) {
      obj.set(args[0], combine(obj.get(args[0])));
      (G.gameMap as unknown as { needRefresh: boolean } | null) && ((G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true);
    } else if (obj) {
      (obj as Record<string, unknown>)[args[0] as string] = combine((obj as Record<string, unknown>)[args[0] as string]);
    }
    return;
  }
  const custom = functions.get(`${target}=`);
  if (custom) {
    custom(ctx, combine(evalCall(target, [], ctx, null, false)));
    return;
  }
  const dot = target.lastIndexOf(".");
  if (dot < 0 && ctx.locals && /^[a-z_]\w*$/.test(target)) {
    ctx.locals.set(target, combine(ctx.locals.get(target)));
    return;
  }
  if (dot < 0) {
    warnOnce(`${target}=`, `Script: can't assign ${target} yet`);
    return;
  }
  const recv = evalCall(target.slice(0, dot), [], ctx, null, false) as Record<string, unknown> | null;
  if (!recv) {
    warnOnce(`${target}=`, `Script: can't assign ${target} (receiver is nil)`);
    return;
  }
  const key = camel(target.slice(dot + 1));
  recv[key] = combine(recv[key]);
}

// --- Ruby core classes used in event scripts --------------------------------

defineScript("Tone.new", (_c, r, g, b, gray) => new Tone(Number(r ?? 0), Number(g ?? 0), Number(b ?? 0), Number(gray ?? 0)));
defineScript("Color.new", (_c, r, g, b, a) => new Color(Number(r ?? 0), Number(g ?? 0), Number(b ?? 0), Number(a ?? 255)));
defineScript("_INTL", (_c, text, ...args) => String(text).replace(/\{(\d+)\}/g, (_, n: string) => String(args[Number(n) - 1] ?? "")));
defineScript("rand", (_c, n) => Math.floor(Math.random() * Number(n)));
