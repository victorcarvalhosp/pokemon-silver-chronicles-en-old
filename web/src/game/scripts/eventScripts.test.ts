// The event snippets translated from Ruby (scripts/eventScripts.ts, the
// grouped Script commands with locals, procs and hashes in scriptApi.ts) and
// the calls that raise as in the original (scripts/rubyErrors.ts).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../../data/events";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { Item } from "../../data/gameData/item";
import { G } from "../globals";
import { Interpreter } from "../Interpreter";
import { Pokemon } from "../pokemon/Pokemon";
import { SaveData } from "../save/SaveData";
import { evaluate, evaluateAsync, runStatements } from "../scriptApi";
import type { Player } from "../trainer/Player";
import { setMessageHook } from "../items/itemUtilities";
import { effortRibbonState, partySpeciesNames, pbNextMysteryGiftID, storePartySpecies, storeWholeParty } from "./eventScripts";
import "./pokemon";
import { RubyScriptError } from "./rubyErrors";

const messages: string[] = [];
vi.mock("../../ui/messages", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../ui/messages")>();
  return { ...orig, pbMessage: async (text: string) => { messages.push(text); return 0; } };
});
vi.mock("../../ui/fades", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../ui/fades")>();
  return { ...orig, pbFadeOutIn: async <T>(block?: () => Promise<T> | T) => block?.() };
});
vi.mock("../../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../rgss/Graphics")>();
  const graphics = orig.Graphics as unknown as { frameCount: number; update: () => Promise<void> };
  graphics.update = async () => { graphics.frameCount++; };
  return orig;
});

const ctx = { event: null, interpreter: null };
const player = () => G.player as unknown as Player;
const add = (species: string, level = 5) => {
  const p = new Pokemon(species, level, player() as never);
  player().party.push(p);
  return p;
};

beforeAll(() => {
  loadGameDataForTests();
  setMessageHook(async () => 0, async () => false);
});
beforeEach(() => {
  messages.length = 0;
  SaveData.markValuesAsUnloaded();
  SaveData.loadNewGameValues();
  G.gameMap = { mapId: 1, needRefresh: false, events: new Map() } as never;
});

describe("party snippets", () => {
  it("storePartySpecies stores every Pokémon of that species (compact! after the loop, fixed on purpose)", () => {
    add("RAIKOU");
    add("RAIKOU");
    add("PIDGEY");
    add("RAIKOU");
    storePartySpecies(() => "RAIKOU");
    expect(player().party.map((p) => p.species)).toEqual(["PIDGEY"]);
    expect([0, 1, 2].map((i) => G.storage.get(0, i)!.species)).toEqual(["RAIKOU", "RAIKOU", "RAIKOU"]);
  });

  it("storeWholeParty moves the party to the PC, last first", () => {
    add("PIDGEY");
    add("RATTATA");
    storeWholeParty();
    expect(player().party).toEqual([]);
    expect(G.storage.get(0, 0)!.species).toBe("RATTATA");
    expect(G.storage.get(0, 1)!.species).toBe("PIDGEY");
  });

  it("partySpeciesNames lists up to three non-egg species", () => {
    expect(partySpeciesNames()).toBe("No usable Pokémon.");
    add("PIDGEY");
    expect(partySpeciesNames()).toBe("Pidgey");
    const egg = add("TOGEPI");
    egg.stepsToHatch = 100;
    add("RATTATA");
    add("ZUBAT");
    add("ONIX");
    expect(partySpeciesNames()).toBe("Pidgey, Rattata and Zubat");
  });

  it("effortRibbonState: 0, 1 at the EV limit, 2 with the ribbon", () => {
    const p = add("PIDGEY");
    expect(effortRibbonState(p)).toBe(0);
    p.ev = { HP: 252, ATTACK: 252, DEFENSE: 6, SPECIAL_ATTACK: 0, SPECIAL_DEFENSE: 0, SPEED: 0 };
    expect(effortRibbonState(p)).toBe(1);
    p.giveRibbon("EFFORT");
    expect(effortRibbonState(p)).toBe(2);
  });

  it("Array#each with a proc gives every party Pokémon the ribbon", async () => {
    add("PIDGEY");
    add("RATTATA");
    await runStatements([{ cmd: "call", fn: "each", on: { call: "$player.pokemon_party" },
      args: [{ proc: ["pkmn"], body: { call: "giveRibbon", on: { call: "pkmn" }, args: ["CHAMPION"] } }] } as Command], ctx);
    expect(player().party.every((p) => p.hasRibbon("CHAMPION"))).toBe(true);
  });
});

describe("grouped Script commands", () => {
  it("share local variables, like one eval", async () => {
    const interp = new Interpreter();
    interp.setup([{ cmd: "script", do: [
      { cmd: "assign", target: "pkmn", args: [], op: "=", value: { call: "Pokemon.new", args: ["TYROGUE", 25] } },
      { cmd: "assign", target: "pkmn.item", args: [], op: "=", value: "BLACKBELT" },
      { cmd: "assign", target: "pkmn.beauty", args: [], op: "+=", value: 40 },
      { cmd: "call", fn: "pbSet", args: [1, { call: "pkmn" }] },
    ] }] as Command[], 0, 1);
    for (let i = 0; i < 5 && interp.running(); i++) await interp.update();
    const pkmn = G.gameVariables.get(1) as unknown as Pokemon;
    expect(pkmn.species).toBe("TYROGUE");
    expect(pkmn.level).toBe(25);
    expect(pkmn.itemId).toBe("BLACKBELT");
    expect(pkmn.beauty).toBe(40);
  });

  it("evaluates hashes, Array#sample and string +", async () => {
    expect(await evaluateAsync({ hash: { rank: 3, loot: ["DRAGONFANG"], obtaintext: { op: "+", left: "a", right: "b" } } }, ctx))
      .toEqual({ rank: 3, loot: ["DRAGONFANG"], obtaintext: "ab" });
    const stones = ["MOONSTONE", "SUNSTONE"];
    for (let i = 0; i < 10; i++) expect(stones).toContain(evaluate({ call: "sample", on: stones }, ctx));
  });

  it("compare a GameData object with its ID (pkmn.item == :GRASSMAIL)", () => {
    const p = add("SPEAROW");
    p.item = "GRASSMAIL";
    G.gameVariables.set(1, 0);
    const item = { call: "item", on: { call: "pbGetPokemon", args: [1] } };
    expect(evaluate({ op: "==", left: item, right: "GRASSMAIL" }, ctx)).toBe(true);
    expect(evaluate({ op: "==", left: item, right: "POTION" }, ctx)).toBe(false);
    expect(evaluate({ op: "!=", left: item, right: "POTION" }, ctx)).toBe(true);
    expect(Item.get("GRASSMAIL")).toBeInstanceOf(Item);
  });

  it("pass procs to pbChoosePokemon-style filters", () => {
    const proc = evaluate({ proc: ["poke"], body: { op: "!", value: { call: "egg?", on: { call: "poke" } } } }, ctx) as (p: Pokemon) => boolean;
    const p = add("PIDGEY");
    expect(proc(p)).toBe(true);
    p.stepsToHatch = 10;
    expect(proc(p)).toBe(false);
  });
});

describe("Mystery Gift", () => {
  it("receives an item gift once", async () => {
    player().mysteryGifts.push([3, 2, "POTION", "Gift"]);
    expect(pbNextMysteryGiftID()).toBe(3);
    expect(await evaluateAsync({ call: "pbReceiveMysteryGift", args: [{ call: "pbNextMysteryGiftID" }] }, ctx)).toBe(true);
    expect(G.bag.quantity("POTION")).toBe(2);
    expect(messages[0]).toContain("You obtained 2");
    expect(pbNextMysteryGiftID()).toBe(0);
    expect(await evaluateAsync({ call: "pbReceiveMysteryGift", args: [0] }, ctx)).toBe(false);
    expect(messages[1]).toBe("Couldn't find an unclaimed Mystery Gift with ID 0.");
  });
});

describe("names the original game doesn't have", () => {
  it("raise Ruby's error", async () => {
    await expect(evaluateAsync({ call: "pbSecretBaseMart", args: [[], "Welcome!"] }, ctx)).rejects.toThrow(RubyScriptError);
    await expect(evaluateAsync({ call: "GTS.open" }, ctx)).rejects.toThrow("uninitialized constant GTS");
    await expect(evaluateAsync({ call: "pbTalkToFollower" }, ctx)).rejects.toThrow("undefined method `pbTalkToFollower'");
  });

  it("the quest helpers check the MQS lists", () => {
    expect(evaluate({ call: "isQuestActive?", args: ["Quest1"] }, ctx)).toBe(false);
    expect(evaluate({ call: "isQuestComplete?", args: ["Quest1"] }, ctx)).toBe(false);
  });
});

describe("v16 scenes the events open (fixed on purpose)", () => {
  it("common event 32 opens the Hall of Fame entry screen", async () => {
    const { HallOfFameScreen } = await import("../../ui/hallOfFame/HallOfFame");
    const entry = vi.spyOn(HallOfFameScreen.prototype, "pbStartScreenEntry").mockResolvedValue();
    const { PBDebug } = await import("../../battle/other/PBDebug");
    const logonerr = vi.spyOn(PBDebug, "logonerr");
    const { Data } = await import("../../data/store");
    const system = Data.system;
    (Data as { system: unknown }).system = { sounds: {} };
    await evaluateAsync({ call: "callHallOfFameCommonEvent" }, ctx);
    expect(entry).toHaveBeenCalledTimes(1);
    await expect(logonerr.mock.results[0]!.value).resolves.toBeUndefined();
    (Data as { system: unknown }).system = system;
    entry.mockRestore();
    logonerr.mockRestore();
  });

  it("Map 438 opens the v20 load screen and starts the chosen game", async () => {
    const { PokemonLoadScreen } = await import("../../ui/load/loadScreen");
    const { Game } = await import("../Game");
    const { SceneMap } = await import("../../scenes/SceneMap");
    const init = vi.spyOn(PokemonLoadScreen.prototype, "init").mockResolvedValue();
    const start = vi.spyOn(PokemonLoadScreen.prototype, "pbStartLoadScreen").mockResolvedValue({ action: "new_game" });
    const startNew = vi.spyOn(Game, "startNew").mockResolvedValue();
    await evaluateAsync({ call: "startLoadScreen" }, ctx);
    expect(startNew).toHaveBeenCalledTimes(1);
    expect(G.scene).toBeInstanceOf(SceneMap);
    start.mockResolvedValue({ action: "quit" });
    await evaluateAsync({ call: "startLoadScreen" }, ctx);
    expect(G.scene).toBeNull();
    for (const s of [init, start, startNew]) s.mockRestore();
  });
});
