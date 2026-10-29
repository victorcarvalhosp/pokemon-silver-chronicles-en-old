// The PC storage mechanics (PokemonStorageScreen, with this game's League
// regulations), the item storage screens (PokemonBagScreen's withdraw /
// deposit / toss), the Poké Mart (PokemonMartScreen, pbPokemonMart, the
// v20.1 Hotfixes' sell price, setPrice) and Kurt (Apricorn To Ball) against
// the game's own Ruby: storageMartReference.json, written by
// web/tools/ruby-ref/storage_mart_reference.rb. Each scenario carries its
// setup; this file builds the same state, answers the same stub scenes and
// compares the calls the screens make, their messages and the resulting
// party / boxes / Bag / PC items / money / stats.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { Stat } from "../../data/gameData/stat";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { GameSystem } from "../../game/GameSystem";
import { G, GameSwitches, GameTemp, GameVariables, PokemonGlobalMetadata } from "../../game/globals";
import { setMessageHook } from "../../game/items/itemUtilities";
import { PCItemStorage, PokemonBag } from "../../game/items/PokemonBag";
import { Mail } from "../../game/pokemon/Mail";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonBox, PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { PokemonBagScreen } from "../bag/bag";
import { KurtClock, KurtEventPage, resetKurtSession } from "../mart/ApricornToBall";
import { MartHooks, type MartScene, pbPokemonMart, PokemonMartScreen, setPrice } from "../mart/PokemonMart";
import { PokemonStorageScreen, type Selection, type StorageScene } from "./PokemonStorageScreen";
import ref from "./storageMartReference.json";

type Answers = Record<string, unknown[]>;
const io = vi.hoisted(() => ({ log: [] as unknown[][], answers: {} as Record<string, unknown[]> }));
function next<T>(kind: string, dflt: T): T {
  const list = io.answers[kind];
  return list && list.length > 0 ? (list.shift() as T) : dflt;
}

// pbMessage / pbConfirmMessage, pbFadeOutIn and Kurt's filtered Bag, as the Ruby script stubs them.
vi.mock("../messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../messages")>()),
  pbMessage: async (message: string, commands: string[] | null = null, cmdIfCancel = 0, _skin = null, defaultCmd = 0) => {
    if (commands) {
      const list = io.answers.message;
      const ret = list && list.length > 0 ? list.shift() : cmdIfCancel;
      io.log.push(["message", message, commands, cmdIfCancel, defaultCmd, ret]);
      return ret;
    }
    io.log.push(["message", message]);
    return 0;
  },
  pbConfirmMessage: async (message: string) => {
    const list = io.answers.confirm;
    const ret = list && list.length > 0 ? list.shift() : false;
    io.log.push(["confirmMessage", message, ret]);
    return ret;
  },
}));
vi.mock("../fades", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../fades")>()),
  pbFadeOutIn: async (fn: () => unknown) => { await fn(); },
}));
vi.mock("../bag/bag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bag/bag")>()),
  PokemonBag_Scene: class {
    async pbStartScene(_bag: unknown, choosing = false) { io.log.push(["bagStart", choosing]); }
    async pbEndScene() { io.log.push(["bagEnd"]); }
    async pbChooseItem() {
      const list = io.answers.item;
      const ret = list && list.length > 0 ? list.shift() : null;
      io.log.push(["bagChooseItem", ret ?? null]);
      return ret;
    }
    async pbChooseNumber(helptext: string, maximum: number) {
      const list = io.answers.number;
      const ret = list && list.length > 0 ? list.shift() : 1;
      io.log.push(["bagChooseNumber", helptext, maximum, ret]);
      return ret;
    }
  },
}));

interface MonSpec {
  species: Id; level: number; hp?: number; hpLoss?: number; egg?: boolean; item?: Id; mail?: boolean;
  cannotStore?: boolean; cannotRelease?: boolean; markings?: number[];
}
interface Setup {
  name: string; kind: "storage" | "items" | "mart" | "kurt"; action: [string, ...unknown[]];
  party?: MonSpec[]; boxes?: [number, number, MonSpec][]; held?: MonSpec; bag?: [Id, number][]; pc?: [Id, number][];
  money?: number; switches?: Record<string, boolean>; quickswap?: boolean; current?: number; unlocked?: number[];
  backgrounds?: [number, number][]; prices?: [Id, number, number][];
  kurt?: { ball: Id; count: number; nextRun: number };
  answers?: Answers;
}
interface Result { log: unknown[][]; ret: unknown; state: Record<string, unknown>; error?: string }
const scenarios = ref as unknown as { setup: Setup; result: Result }[];

const player = () => G.player as unknown as Player;

function buildPokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.species, spec.level, player());
  for (const s of Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = "HARDY";
  pkmn.calcStats();
  pkmn.item = spec.item ?? null;
  if (spec.mail) pkmn.mail = new Mail(spec.item!, "Hello!", "Kris");
  if (spec.egg) {
    pkmn.stepsToHatch = 1000;
    pkmn.name = "Egg";
  }
  if (spec.hp !== undefined) pkmn.hp = spec.hp;
  if (spec.hpLoss) pkmn.hp = pkmn.totalhp - spec.hpLoss;
  if (spec.cannotStore) pkmn.cannotStore = true;
  if (spec.cannotRelease) pkmn.cannotRelease = true;
  if (spec.markings) pkmn.markings = spec.markings;
  return pkmn;
}

function pokemonState(pkmn: Pokemon | null | undefined): unknown {
  if (!pkmn) return null;
  return [pkmn.name, pkmn.hp, pkmn.totalhp, pkmn.itemId ?? null, !!pkmn.mail];
}

/** PokemonStorageScene, as the Ruby script stubs it. */
class StubStorageScene implements StorageScene {
  constructor(private storage: PokemonStorage, readonly quickswap: boolean) {}
  async pbStartBox(_screen: PokemonStorageScreen, command: number) { io.log.push(["startBox", command]); }
  async pbCloseBox() { io.log.push(["closeBox"]); }
  async pbSelectBox() {
    const ret = next<Selection | null>("select", null);
    io.log.push(["selectBox", ret]);
    return ret;
  }
  async pbSelectParty() {
    const ret = next("party", -1);
    io.log.push(["selectParty", ret]);
    return ret;
  }
  async pbDisplay(message: string) { io.log.push(["display", message]); }
  async pbShowCommands(message: string, commands: string[], index = 0) {
    const ret = next("command", -1);
    io.log.push(["commands", message, commands, index, ret]);
    return ret;
  }
  async pbChooseBox(msg: string) {
    const ret = next("box", -1);
    io.log.push(["chooseBox", msg, ret]);
    return ret;
  }
  async pbJumpToBox(newbox: number) {
    io.log.push(["jumpToBox", newbox]);
    this.storage.currentBox = newbox;
  }
  async pbChangeBackground(wp: number) {
    io.log.push(["changeBackground", wp]);
    this.storage.boxes[this.storage.currentBox]!.background = wp;
  }
  async pbBoxName(helptext: string, minchars: number, maxchars: number) {
    const ret = next("name", "");
    io.log.push(["boxName", helptext, minchars, maxchars, ret]);
    if (ret.length > 0) this.storage.boxes[this.storage.currentBox]!.name = ret;
  }
  async pbChooseItem() {
    const ret = next<Id | null>("item", null);
    io.log.push(["chooseItem", ret]);
    return ret;
  }
  async pbSummary(selected: Selection, held: Pokemon | null) { io.log.push(["summary", selected, held?.name ?? null]); }
  async pbMark(selected: Selection, held: Pokemon | null) { io.log.push(["mark", selected, held?.name ?? null]); }
  async pbHold(selected: Selection) { io.log.push(["hold", selected]); }
  async pbSwap(selected: Selection, held: Pokemon | null) { io.log.push(["swap", selected, held?.name ?? null]); }
  async pbPlace(selected: Selection, held: Pokemon | null) { io.log.push(["place", selected, held?.name ?? null]); }
  async pbWithdraw(selected: Selection, held: Pokemon | null, partyindex: number) {
    io.log.push(["withdraw", selected, held?.name ?? null, partyindex]);
  }
  async pbStore(selected: Selection, held: Pokemon | null, destbox: number, firstfree: number) {
    io.log.push(["store", selected, held?.name ?? null, destbox, firstfree]);
  }
  async pbRelease(selected: Selection, held: Pokemon | null) { io.log.push(["release", selected, held?.name ?? null]); }
  pbRefresh() { io.log.push(["refresh"]); }
  pbHardRefresh() { io.log.push(["hardRefresh"]); }
  pbUpdateOverlay() {}
  update() {}
}

/** The scenes PokemonBagScreen's item storage screens use. */
class StubItemScene {
  async pbStartScene(bag: unknown) { io.log.push(["startScene", bag instanceof PCItemStorage ? "storage" : "bag"]); }
  async pbEndScene() { io.log.push(["endScene"]); }
  async pbChooseItem() {
    const ret = next<Id | null>("item", null);
    io.log.push(["chooseItem", ret]);
    return ret;
  }
  async pbChooseNumber(helptext: string, maximum: number) {
    const ret = next("number", 1);
    io.log.push(["chooseNumber", helptext, maximum, ret]);
    return ret;
  }
  pbRefresh() { io.log.push(["refresh"]); }
  async pbDisplay(text: string) { io.log.push(["display", text]); }
  async pbConfirm(text: string) {
    const ret = next("confirm", false);
    io.log.push(["confirm", text, ret]);
    return ret;
  }
}

/** PokemonMart_Scene, as the Ruby script stubs it. */
class StubMartScene implements MartScene {
  async pbStartBuyScene(stock: Id[]) { io.log.push(["startBuyScene", [...stock]]); }
  async pbStartSellScene() { io.log.push(["startSellScene"]); }
  async pbEndBuyScene() { io.log.push(["endBuyScene"]); }
  async pbEndSellScene() { io.log.push(["endSellScene"]); }
  async pbChooseBuyItem() {
    const ret = next<Id | null>("item", null);
    io.log.push(["chooseBuyItem", ret]);
    return ret;
  }
  async pbChooseSellItem() {
    const ret = next<Id | null>("item", null);
    io.log.push(["chooseSellItem", ret]);
    return ret;
  }
  async pbChooseNumber(helptext: string, item: Id, maximum: number) {
    const ret = next("number", 1);
    io.log.push(["chooseNumber", helptext, item, maximum, ret]);
    return ret;
  }
  async pbDisplay(msg: string) { io.log.push(["display", msg]); }
  async pbDisplayPaused(msg: string, block?: () => void) {
    io.log.push(["displayPaused", msg]);
    block?.();
  }
  async pbConfirm(msg: string) {
    const ret = next("confirm", false);
    io.log.push(["confirm", msg, ret]);
    return ret;
  }
  pbShowMoney() { io.log.push(["showMoney"]); }
  pbHideMoney() { io.log.push(["hideMoney"]); }
  pbRefresh() { io.log.push(["refresh"]); }
}

function state(screen: PokemonStorageScreen | null): Record<string, unknown> {
  const storage = G.storage;
  const boxes: unknown[] = [];
  for (let b = 0; b < storage.maxBoxes(); b++) {
    for (let i = 0; i < storage.maxPokemon(b); i++) {
      const p = storage.get(b, i);
      if (p) boxes.push([b, i, pokemonState(p)]);
    }
  }
  const pc = G.pokemonGlobal.pcItemStorage;
  const temp = G.gameTemp;
  const p = player();
  const nextRun = p.nextRun;
  const var8 = G.gameVariables.get(8);
  return {
    party: p.party.map((x) => pokemonState(x)),
    boxes,
    currentBox: storage.currentBox,
    boxInfo: storage.boxes.slice(0, 10).map((b: PokemonBox) => [b.name, b.background]),
    held: screen ? pokemonState(screen.heldpkmn) : null,
    inStorage: temp.inStorage,
    bag: G.bag.pockets.flatMap((pocket) => (pocket ?? []).map(([item, qty]) => [item, qty])),
    pc: pc ? pc.items.map(([item, qty]) => [item, qty]) : null,
    money: p.money,
    stats: [G.stats.moneySpentAtMarts, G.stats.moneyEarnedAtMarts, G.stats.martItemsBought, G.stats.premierBallsEarned],
    martPrices: Object.entries(temp.martPrices),
    kurt: [p.ballForApricorn ?? null, p.ballForApricornCount ?? null,
      typeof nextRun === "number" && nextRun !== 0 ? Math.floor(nextRun / 1000) : (nextRun ?? null)],
    var8,
  };
}

/** Return values compared (the Ruby stubs make the others return whatever was logged last). */
const COMPARED_RETURNS = new Set(["pbCanWithdraw", "pbSwap", "pbChoosePokemon", "formatTime"]);

async function run(sc: Setup): Promise<Result> {
  io.log = [];
  io.answers = {};
  for (const [k, v] of Object.entries(sc.answers ?? {})) io.answers[k] = [...v];
  G.gameTemp = new GameTemp();
  G.gameSwitches = new GameSwitches();
  for (const [k, v] of Object.entries(sc.switches ?? {})) G.gameSwitches.set(Number(k), v);
  G.gameVariables = new GameVariables();
  const p = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = p as never;
  p.id = 12_345_678;
  if (sc.money !== undefined) p.money = sc.money;
  G.bag = new PokemonBag();
  for (const [item, qty] of sc.bag ?? []) G.bag.add(item, qty);
  G.stats = new GameStats();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  if (sc.pc) {
    const pc = new PCItemStorage();
    pc.items.length = 0;
    for (const [item, qty] of sc.pc) pc.add(item, qty);
    G.pokemonGlobal.pcItemStorage = pc;
  }
  const storage = new PokemonStorage();
  G.storage = storage;
  if (sc.current !== undefined) storage.currentBox = sc.current;
  for (const i of sc.unlocked ?? []) storage.unlockedWallpapers[i] = true;
  for (const [b, wp] of sc.backgrounds ?? []) storage.boxes[b]!.background = wp;
  p.party = (sc.party ?? []).map((s) => buildPokemon(s));
  for (const [b, i, s] of sc.boxes ?? []) storage.set(b, i, buildPokemon(s));
  for (const [item, buy, sell] of sc.prices ?? []) setPrice(item, buy, sell);
  if (sc.kurt) {
    p.ballForApricorn = sc.kurt.ball;
    p.ballForApricornCount = sc.kurt.count;
    p.nextRun = sc.kurt.nextRun * 1000;
  }
  let ret: unknown = null;
  let screen: PokemonStorageScreen | null = null;
  const [method, ...args] = sc.action;
  switch (sc.kind) {
    case "storage": {
      screen = new PokemonStorageScreen(new StubStorageScene(storage, sc.quickswap ?? false), storage);
      if (sc.held) screen.heldpkmn = buildPokemon(sc.held);
      // The screen's loop passes @heldpkmn as the second argument.
      if (["pbWithdraw", "pbStore", "pbRelease", "pbItem"].includes(method)) args.push(screen.heldpkmn);
      ret = await (screen as unknown as Record<string, (...a: unknown[]) => unknown>)[method]!(...args);
      break;
    }
    case "items": {
      const bagScreen = new PokemonBagScreen(new StubItemScene() as never, G.bag);
      ret = await (bagScreen as unknown as Record<string, () => unknown>)[method]!();
      break;
    }
    case "mart":
      MartHooks.createScene = () => new StubMartScene();
      if (method === "buy") await new PokemonMartScreen(new StubMartScene(), [...(args[0] as Id[])]).pbBuyScreen();
      else if (method === "sell") await new PokemonMartScreen(new StubMartScene(), []).pbSellScreen();
      else await pbPokemonMart([...(args[0] as Id[])], args[1] as string | null, args[2] as boolean);
      break;
    case "kurt":
      if (method === "formatTime") {
        const page = new KurtEventPage();
        ret = (args[0] as number[]).map((s) => page.formatTime(s));
      } else {
        resetKurtSession();
        await new KurtEventPage().call();
      }
      break;
  }
  return { log: io.log, ret: COMPARED_RETURNS.has(method) ? (ret ?? null) : null, state: state(screen) };
}

beforeAll(() => {
  loadGameDataForTests();
  G.gameSystem = new GameSystem();
  KurtClock.now = () => 1_700_000_000 * 1000;
  // pbReceiveItem (Kurt's finished balls) talks through the item utilities' message hook.
  setMessageHook(async (text) => { io.log.push(["message", text]); return 0; }, async () => false);
});

describe("storage / item storage / mart / Kurt vs the Ruby reference", () => {
  it("has scenarios that all ran in Ruby", () => {
    expect(scenarios.length).toBeGreaterThan(100);
    expect(scenarios.filter((s) => s.result.error).map((s) => s.setup.name)).toEqual([]);
  });

  for (const { setup, result } of scenarios) {
    it(setup.name, async () => {
      const got = await run(setup);
      expect(got.log).toEqual(result.log);
      if (COMPARED_RETURNS.has(setup.action[0])) expect(got.ret).toEqual(result.ret);
      expect(got.state).toEqual(result.state);
    });
  }
});
