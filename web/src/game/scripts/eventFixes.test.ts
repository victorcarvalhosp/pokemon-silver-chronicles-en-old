// Event crashes of the original game fixed on purpose in the event data
// (docs/original-game-bugs.md, "Already fixed on purpose"): runs the fixed
// conditions and commands taken from web/data as the interpreter does.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../../data/events";
import { Item } from "../../data/gameData/item";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { pbTradePokemon } from "../../ui/trading/Trading";
import { DayCare } from "../daycare/DayCare";
import { G } from "../globals";
import { setMessageHook } from "../items/itemUtilities";
import { Pokemon } from "../pokemon/Pokemon";
import { PokemonOwner } from "../pokemon/PokemonOwner";
import { SaveData } from "../save/SaveData";
import { evaluate, evaluateAsync, runStatements } from "../scriptApi";
import type { Player } from "../trainer/Player";
import "./eventScripts";
import "./lifecycle";
import "./pokemon";

vi.mock("../../ui/messages", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../ui/messages")>();
  return { ...orig, pbMessage: async () => 0 };
});

const DATA = resolve(import.meta.dirname, "../../../data");
const read = (path: string): unknown => JSON.parse(readFileSync(join(DATA, path), "utf8"));
const map = (id: number) => read(`maps/Map${String(id).padStart(3, "0")}.json`) as { events: { id: number; pages: unknown[] }[] };
const event = (mapId: number, id: number) => map(mapId).events.find((e) => e.id === id)!;
const commonEvent = (id: number) => (read("common-events.json") as { id: number; list: Command[] }[]).find((c) => c.id === id)!;

/** Every object inside `root` (depth first) that `pred` accepts. */
function findAll<T = Record<string, unknown>>(root: unknown, pred: (o: Record<string, unknown>) => boolean): T[] {
  const out: T[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      if (pred(o as Record<string, unknown>)) out.push(o as T);
      Object.values(o).forEach(walk);
    }
  };
  walk(root);
  return out;
}
/** The command list (an array) directly holding a command matching `pred`. */
function listWith(root: unknown, pred: (c: Record<string, unknown>) => boolean): Command[] {
  const lists: Command[][] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      if (o.some((c) => c && typeof c === "object" && !Array.isArray(c) && pred(c as Record<string, unknown>))) lists.push(o as Command[]);
      o.forEach(walk);
    } else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(root);
  expect(lists.length).toBeGreaterThan(0);
  return lists[0]!;
}
/** The script statements of a command list (what runs without the message window). */
const statements = (list: Command[]) => list.filter((c) => c.cmd === "call" || c.cmd === "assign");

// Interpreter#pbGet is an interpreter method (Interpreter.ts).
const ctx = { event: null, interpreter: { pbGet: (id: number) => G.gameVariables.get(id) } as never };
const player = () => G.player as unknown as Player;
const add = (species: string, level = 20) => {
  const p = new Pokemon(species, level, player() as never);
  player().party.push(p);
  return p;
};
const choose = (index: number) => G.gameVariables.set(1, index);

beforeAll(() => {
  loadGameDataForTests();
  setMessageHook(async () => 0, async () => false);
});
beforeEach(() => {
  SaveData.markValuesAsUnloaded();
  SaveData.loadNewGameValues();
  G.gameMap = { mapId: 1, needRefresh: false, events: new Map() } as never;
});

describe("no event uses the names the original game doesn't define any more", () => {
  const files = [...readdirSync(join(DATA, "maps")).map((f) => `maps/${f}`), "common-events.json"];
  const calls = files.flatMap((f) => findAll(read(f), (o) => typeof o.call === "string" || typeof o.fn === "string")
    .map((o) => [f, String(o.call ?? o.fn)] as const));
  it("PBSpecies, the v16 PBItems names, Day Care / Name Rater / Move Deleter / load screen calls", () => {
    const old = /^(PBSpecies\b|PBItems::(POKeBALL|PARLYZHEAL|XDEFEND|XSPECIAL|POKeDOLL)$|eggsteps$|isForeign\?$|pbNumMoves$|pbDeleteMove$|PokemonLoadScene|pbHasSpecies\?$)/;
    expect(calls.filter(([, c]) => old.test(c))).toEqual([]);
    expect(findAll(read("maps/Map440.json"), (o) => String(o.target ?? "").startsWith("$PokemonGlobal.daycareEgg"))).toEqual([]);
  });
});

describe("Day Care (Map 440)", () => {
  it("event 1 tells an Egg apart (steps_to_hatch, was eggsteps)", () => {
    const [cond] = findAll<{ script: never }>(event(440, 1), (o) => (o.script as { left?: { call?: string } } | undefined)?.left?.call === "steps_to_hatch");
    add("PIDGEY");
    const egg = add("RATTATA");
    egg.stepsToHatch = 500;
    choose(0);
    expect(evaluate(cond!.script, ctx)).toBe(false);
    choose(1);
    expect(evaluate(cond!.script, ctx)).toBe(true);
  });

  const withEgg = () => {
    add("DITTO");
    add("PIDGEY");
    DayCare.depositInternal(0);
    DayCare.depositInternal(0);
    DayCare.current().eggGenerated = true;
  };
  it("event 2 gives the egg (no v16 daycareEgg variables)", async () => {
    withEgg();
    add("SENTRET");
    const list = listWith(event(440, 2), (c) => c.fn === "DayCare.collect_egg");
    await runStatements(statements(list), ctx);
    expect(player().party.length).toBe(2);
    expect(player().party[1]!.egg()).toBe(true);
    expect(DayCare.eggGeneratedQ()).toBe(false);
  });
  it("event 2 keeps the egg when you say no (reset_egg_counters)", async () => {
    withEgg();
    add("SENTRET");
    const list = listWith(event(440, 2), (c) => c.fn === "DayCare.reset_egg_counters");
    await runStatements(statements(list), ctx);
    expect(player().party.length).toBe(1);
    expect(DayCare.eggGeneratedQ()).toBe(false);
  });
});

describe("Name Rater (Map 215, event 3)", () => {
  it("checks foreign? and names the species", async () => {
    const [cond] = findAll<{ script: never }>(event(215, 3), (o) => (o.script as { call?: string } | undefined)?.call === "foreign?");
    const mine = add("PIDGEY");
    const traded = add("RATTATA");
    traded.owner = PokemonOwner.newForeign("Joey", 0);
    choose(0);
    expect(evaluate(cond!.script, ctx)).toBe(false);
    choose(1);
    expect(evaluate(cond!.script, ctx)).toBe(true);
    const [script] = findAll<{ do: Command[] }>(event(215, 3), (o) => o.cmd === "script");
    const locals = new Map<string, unknown>();
    choose(0);
    await runStatements(script!.do.filter((c) => c.cmd === "assign"), { ...ctx, locals });
    expect(locals.get("pkmn")).toBe(mine);
    expect(locals.get("species")).toBe("Pidgey");
  });
});

describe("Move Deleter (Maps 314 and 758)", () => {
  for (const mapId of [314, 758]) {
    it(`Map ${mapId} counts the moves and forgets the chosen one`, async () => {
      const pkmn = add("PIDGEY", 20);
      choose(0);
      const [cond] = findAll<{ script: never }>(map(mapId), (o) => (o.script as { left?: { call?: string } } | undefined)?.left?.call === "numMoves");
      expect(evaluate(cond!.script, ctx)).toBe(pkmn.numMoves() === 1);
      const before = pkmn.moves.map((m) => m.id);
      G.gameVariables.set(2, 0);
      const list = listWith(map(mapId), (c) => c.fn === "forget_move_at_index");
      await runStatements(statements(list), ctx);
      expect(pkmn.moves.map((m) => m.id)).toEqual(before.slice(1));
    });
  }
});

describe("trades", () => {
  it("Cinnabar Lab (Map 516) asks for Raichu and gives Electrode", async () => {
    const ev = map(516);
    const [proc] = findAll<{ proc: string[]; body: never }>(ev, (o) => Array.isArray(o.proc) && JSON.stringify(o.body).includes("RAICHU"));
    const filter = (await evaluateAsync(proc as never, ctx)) as (p: Pokemon) => unknown;
    expect(filter(new Pokemon("RAICHU", 20))).toBe(true);
    expect(filter(new Pokemon("PIKACHU", 20))).toBe(false);
    const [trade] = findAll<{ args: never[] }>(ev, (o) => o.fn === "pbStartTrade" && JSON.stringify(o.args).includes("ELECTRODE"));
    add("RAICHU");
    choose(0);
    const [index, species, nickname, trainer] = (await evaluateAsync(trade!.args as never, ctx)) as [number, string, string, string];
    expect(pbTradePokemon(index, species, nickname, trainer).species).toBe("ELECTRODE");
  });

  it("Map 704 gives a Galarian Darumaka (form 2)", async () => {
    const [trade] = findAll<{ args: never[] }>(map(704), (o) => o.fn === "pbStartTrade");
    add("SLAKOTH");
    choose(0);
    const [index, species, nickname, trainer] = (await evaluateAsync(trade!.args as never, ctx)) as [number, string, string, string];
    const got = pbTradePokemon(index, species, nickname, trainer);
    expect([got.species, got.form, got.name]).toEqual(["DARUMAKA", 2, "Ice Potato"]);
  });
});

describe("Marts with the old item names", () => {
  for (const mapId of [204, 218, 312, 357, 559, 568, 756, 784, 820, 822, 828]) {
    it(`Map ${mapId}: every item exists`, async () => {
      const calls = findAll<{ fn?: string; call?: string; args: never[] }>(map(mapId), (o) => o.fn === "pbPokemonMart" || o.call === "pbReceiveItem");
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        const items = (c.fn ? ((await evaluateAsync(c.args[0]!, ctx)) as string[]) : [await evaluateAsync(c.args[0]!, ctx)]) as string[];
        for (const item of items) expect(Item.exists(item), `${mapId}: ${item}`).toBe(true);
      }
    });
  }
});

describe("common events that store a species in the PC", () => {
  it("common event 7 stores every Bulbasaur, two in a row included", async () => {
    add("BULBASAUR");
    add("BULBASAUR");
    add("PIDGEY");
    add("BULBASAUR");
    const ce = commonEvent(7);
    const [cond] = findAll<{ script: never }>(ce.list, (o) => o.script !== undefined);
    expect(await evaluateAsync(cond!.script, ctx)).toBe(true);
    await runStatements(statements(listWith(ce.list, (c) => c.fn === "storePartySpecies")), ctx);
    expect(player().party.map((p) => p.species)).toEqual(["PIDGEY"]);
    expect([0, 1, 2].map((i) => G.storage.get(0, i)?.species)).toEqual(["BULBASAUR", "BULBASAUR", "BULBASAUR"]);
  });

  it("common event 2 (parallel on switch 488) checks Chikorita without raising", async () => {
    const ce = commonEvent(2);
    const [cond] = findAll<{ script: never }>(ce.list, (o) => o.script !== undefined);
    add("PIDGEY");
    expect(await evaluateAsync(cond!.script, ctx)).toBe(false);
    add("CHIKORITA");
    expect(await evaluateAsync(cond!.script, ctx)).toBe(true);
    await runStatements(statements(listWith(ce.list, (c) => c.fn === "storePartySpecies")), ctx);
    expect(player().party.map((p) => p.species)).toEqual(["PIDGEY"]);
  });
});
