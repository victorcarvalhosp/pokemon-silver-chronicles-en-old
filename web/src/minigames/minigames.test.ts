// The minigames against the game's own Ruby (minigamesReference.json, written
// by web/tools/ruby-ref/minigames_reference.rb, which runs 017_Minigames/*.rb,
// the Triple Triad Booster Packs plugin and the Roulette plugin headless).
// Both sides replay the same random numbers (rand(n) = raw % n; Array#shuffle!
// and #sample on top of them), stub the same screens and graphics, sort with
// macOS's qsort_r (rubySort "bsd") and drive Triple Triad with the same
// scripted scene.
import { Container } from "pixi.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ref from "./minigamesReference.json";

//===============================================================================
// Scripted randomness, messages, engine
//===============================================================================
const rolls: number[] = [];
const used: number[] = [];
vi.mock("../core/random", () => ({
  rand: (n: number) => {
    if (rolls.length === 0) throw new Error("out of scripted rolls");
    const raw = rolls.shift()!;
    used.push(raw);
    if (!(n > 0)) throw new Error(`unexpected rand(${n})`);
    return raw % n;
  },
  random: () => 0.5,
  seedRandom: () => {},
}));
function script(raw: number[]): void {
  rolls.length = 0;
  rolls.push(...raw);
  used.length = 0;
}

type Log = unknown[][];
let messages: Log = [];
let answers: unknown[] = [];
vi.mock("../ui/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ui/messages")>()),
  pbMessage: async (text: string, commands: string[] | null = null) => {
    messages.push(["msg", text]);
    if (!commands) return 0;
    const ret = (Number(answers.shift() ?? 0)) % commands.length;
    messages.push(["choice", ret]);
    return ret;
  },
  pbConfirmMessage: async (text: string) => {
    const ret = answers.length > 0 ? answers.shift() as boolean : false;
    messages.push(["confirm", text, ret]);
    return ret;
  },
}));
vi.mock("../ui/drawText", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ui/drawText")>()),
  pbDrawTextPositions: () => {},
}));
vi.mock("../ui/scenes/frames", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ui/scenes/frames")>()),
  pbWait: async () => {},
}));
vi.mock("../rgss/Graphics", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../rgss/Graphics")>();
  orig.Graphics.update = async () => { orig.Graphics.frameCount++; };
  return orig;
});

// No OffscreenCanvas in node: bitmaps that accept any drawing call.
class FakeContext {
  constructor(readonly canvas: { width: number; height: number }) {}
}
const ctxProxy = (canvas: { width: number; height: number }) => new Proxy(new FakeContext(canvas), {
  get: (t, p) => (p in t ? (t as never)[p] : () => ({ data: new Uint8ClampedArray(4), width: 1 })),
  set: () => true,
});
(globalThis as Record<string, unknown>).OffscreenCanvas ??= class {
  constructor(public width: number, public height: number) {}
  getContext() { return ctxProxy(this); }
};
const warn = console.warn;
console.warn = (...a: unknown[]) => { if (!String(a[0]).includes("not preloaded")) warn(...a); };

const { loadGameDataForTests } = await import("../data/gameData/testing");
const { Species } = await import("../data/gameData/species");
const { Type } = await import("../data/gameData/type");
const { RubySort } = await import("../game/encounters/rubySort");
const { G, PokemonGlobalMetadata, GameVariables } = await import("../game/globals");
const { Player } = await import("../game/trainer/Player");
const { attachStage } = await import("../rgss/display");
const { TriadCard, TriadScreen, triads, TRIADS_SAVE } = await import("./TripleTriad");
const { BoosterPack } = await import("./TripleTriad_BoosterPacks");
const { PokemonDuel } = await import("./Duel");
const { NPCTrainer } = await import("../game/trainer/Trainer");
const { SlotMachineReel, SlotMachineScene, SlotMachineScore } = await import("./SlotMachine");
const { VoltorbFlip } = await import("./VoltorbFlip");
const { lotteryNumber, pbLottery } = await import("./Lottery");
const { RubyMT } = await import("./common");
const PokemonStorageModule = await import("../game/pokemon/PokemonStorage");
const { MiningGameScene, MiningGameTile, MiningGameCursor, MiningGameCounter } = await import("./Mining");
const { TilePuzzleScene } = await import("./TilePuzzles");
const { Roulette } = await import("./Roulette");
type TriadSceneInterface = import("./TripleTriad").TriadSceneInterface;
type TriadScreenT = InstanceType<typeof TriadScreen>;

const noop = () => {};
beforeAll(() => {
  loadGameDataForTests();
  RubySort.algorithm = "bsd";
  attachStage(new Container());
  G.gameSystem = { bgmPlay: noop, bgmFade: noop, mePlay: noop, sePlay: noop, getPlayingBGM: () => null } as never;
});

function newWorld(): void {
  const saved = [...rolls];
  script(Array(16).fill(0)); // Player.new's trainer ID (not part of what's compared)
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.player = new Player("Gold", "PkMnTRAINER_Male") as never;
  script(saved);
  messages = [];
  answers = [];
}
const player = () => G.player as unknown as InstanceType<typeof Player>;
const storageItems = () => triads().items.map((i) => [i[0], i[1]]);

//===============================================================================
// Triple Triad
//===============================================================================
describe("Triple Triad cards", () => {
  it("lists species and types in the same order as Ruby (decks and board elements are sampled from them)", () => {
    expect(Species.keys()).toEqual(ref.speciesKeys);
    expect(Type.keys()).toEqual(ref.typeKeys);
  });

  it("gives every card the same numbers, type, name and price", () => {
    for (const [id, expected] of Object.entries(ref.cards)) {
      const c = new TriadCard(id);
      expect([c.north, c.east, c.south, c.west, c.type, c.name, c.price()], id).toEqual(expected);
    }
  });

  it("gives the same type bonus (bonus)", () => {
    const types = Type.keys().filter((t) => !Type.get(t).pseudoType);
    for (const [a, row] of Object.entries(ref.bonus)) {
      const ca = new TriadCard("PIKACHU");
      ca.type = a;
      expect(types.map((d) => { const cd = new TriadCard("PIKACHU"); cd.type = d; return ca.bonus(cd); }), a).toEqual(row);
    }
  });
});

/** The harness's StubTriadScene. */
class StubTriadScene implements TriadSceneInterface {
  log: unknown[] = [];
  private turn = 0;
  private battle!: TriadScreenT;
  constructor(private cancelTurn: number) {}
  private snapshot() { return this.battle.board.map((sq) => [sq.owner, sq.card ? sq.card.species : null, sq.type]); }
  async pbStartScene(battle: TriadScreenT) { this.battle = battle; this.log.push(["start", this.snapshot()]); }
  async pbEndScene() { this.log.push(["end"]); }
  async pbDisplay(text: string) { this.log.push(["display", text]); }
  async pbDisplayPaused(text: string) { this.log.push(["paused", text]); }
  pbNotifyCards(p: string[], o: string[]) { this.log.push(["notify", [...p], [...o]]); }
  pbShowPlayerCards(cards: string[]) { this.log.push(["showPlayer", [...cards]]); }
  async pbShowOpponentCards(cards: string[]) { this.log.push(["showOpponent", [...cards]]); }
  pbUpdateScore() {}
  async pbChooseTriadCard(storage: [string, number][]) {
    const chosen: string[] = [];
    while (chosen.length < this.battle.maxCards()) {
      const item = storage[(chosen.length * 2) % storage.length]!;
      const id = item[0];
      chosen.push(id);
      this.battle.pbSubtract(storage, id);
    }
    this.log.push(["chosen", [...chosen]]);
    return chosen;
  }
  async pbPlayerChooseCard(num: number) {
    this.turn += 1;
    const idx = (this.turn * 7) % num;
    this.log.push(["choose", idx]);
    return idx;
  }
  async pbPlayerPlaceCard(): Promise<[number, number] | null> {
    if (this.turn === this.cancelTurn) {
      this.cancelTurn = -1;
      this.log.push(["place", null]);
      return null;
    }
    const start = (this.turn * 5) % 9;
    const i = [...Array(9).keys()].map((k) => (start + k) % 9).find((k) => !this.battle.isOccupied(k % 3, Math.floor(k / 3)))!;
    this.log.push(["place", [i % 3, Math.floor(i / 3)]]);
    return [i % 3, Math.floor(i / 3)];
  }
  pbEndPlaceCard(pos: [number, number], ci: number) { this.log.push(["endPlace", [...pos], ci, this.snapshot()]); }
  pbOpponentPlaceCard(card: InstanceType<typeof TriadCard>, pos: [number, number], ci: number) { this.log.push(["oppPlace", card.species, pos, ci]); }
  pbEndOpponentPlaceCard(pos: [number, number], ci: number) { this.log.push(["endOpp", pos, ci, this.snapshot()]); }
}

// The AI sorts its candidate moves with a comparator that answers ties at
// random (`rand(-1..1)`). In these two duels (an all-ARCEUS deck, so most
// moves tie) the macOS qsort_r the harness runs on takes a path rubySort's
// "bsd" emulation doesn't reproduce (Apple's bounded insertion sort, see
// game/encounters/rubySort.ts), so the AI picks another of the tied moves.
// The game itself sorts with the Windows CRT qsort ("msvcrt"). Those duels are
// checked up to the AI's first diverging move and for a finished game.
const SORT_DIVERGES = new Set([6, 31]);

describe("Triple Triad duels (TriadScreen#pbStartScreen)", () => {
  it.each(ref.duels.map((d, i) => [i, d] as const))("duel %i plays the same moves, flips and trades", async (_i, d) => {
    newWorld();
    for (const s of d.owned) player().pokedex.setOwned(s);
    for (const c of d.deck) triads().add(c);
    script(d.rolls);
    const scene = new StubTriadScene(d.cancelTurn);
    const screen = new TriadScreen(scene);
    let result: number | null = null;
    let error: string | null = null;
    try {
      result = await screen.pbStartScreen("Jack", d.minLevel, d.maxLevel, d.rules, d.oppdeck, d.prize);
    } catch (e) {
      error = String(e);
    }
    const where = `rules ${JSON.stringify(d.rules)}, deck ${d.deck}, opp ${d.oppdeck}`;
    if (SORT_DIVERGES.has(_i)) {
      const first = d.log.findIndex((e, k) => JSON.stringify(e) !== JSON.stringify(scene.log[k]));
      expect(d.log[first]![0], where).toBe("oppPlace");
      expect(scene.log.slice(0, first), where).toEqual(d.log.slice(0, first));
      expect([1, 2, 3]).toContain(result);
      return;
    }
    expect(scene.log, where).toEqual(d.log);
    expect(error !== null, `${where}: ${error} / ${d.error}`).toBe(d.error !== null);
    expect(result, where).toEqual(d.result);
    expect(used, where).toEqual(d.rolls);
    expect(storageItems(), where).toEqual(d.triads);
  });
});

describe("Triple Triad card storage", () => {
  it("survives a save and load ($PokemonGlobal.triads)", () => {
    newWorld();
    for (const c of ["PIKACHU", "OAK", "PIKACHU", "RATTATA_1"]) triads().add(c);
    const json = JSON.parse(JSON.stringify(TRIADS_SAVE.save(triads())));
    const loaded = TRIADS_SAVE.load(json);
    expect(loaded.items).toEqual([["PIKACHU", 2], ["OAK", 1], ["RATTATA_1", 1]]);
    expect(loaded.totalCards()).toBe(4);
  });
});

describe("Triple Triad booster packs (BoosterPack.give)", () => {
  it.each(ref.boosters.map((b, i) => [i, b] as const))("pack %i draws the same cards and keeps the same stock", async (_i, b) => {
    newWorld();
    script(b.rolls);
    if (b.init) BoosterPack.initializeAllPacks();
    const ret = await BoosterPack.give(b.item, b.n, b.index);
    expect(ret).toBe(b.ret);
    expect(messages).toEqual(b.messages);
    expect((G.pokemonGlobal as unknown as { boosterStock: unknown }).boosterStock).toEqual(b.stock);
    expect(storageItems()).toEqual(b.triads);
    expect(used).toEqual(b.rolls);
  });
});

//===============================================================================
// Duel
//===============================================================================
describe("Duel (PokemonDuel#pbDuel)", () => {
  it.each(ref.duel.map((d, i) => [i, d] as const))("duel %i: same choices, damage and winner", async (_i, d) => {
    newWorld();
    script(d.rolls);
    answers = [...d.answers];
    const duel = new PokemonDuel();
    const self = duel as unknown as Record<string, unknown> & { hp: number[] };
    self.pbStartDuel = async () => {};
    self.pbEndDuel = async () => {};
    self.pbFlashScreens = async () => {};
    self.pbRefresh = async () => { messages.push(["hp", [...self.hp]]); };
    const speeches = Array.from({ length: 12 }, (_, i) => `speech${i}`);
    const decision = await duel.pbDuel(new NPCTrainer("Cristian", "BLACKBELT"), null, speeches);
    expect(messages).toEqual(d.log);
    expect(decision).toBe(d.decision);
    expect(used).toEqual(d.rolls);
  });
});

//===============================================================================
// Slot machine
//===============================================================================
describe("Slot machine", () => {
  it.each(ref.reels.map((r, i) => [i, r] as const))("reel %i shuffles, spins, slips and stops like Ruby", (_i, r) => {
    script(r.rolls);
    const reel = new SlotMachineReel(0, 0, r.difficulty);
    expect({ reel: reel.reel, showing: reel.showing() }).toEqual(r.initial);
    reel.startSpinning();
    const steps: unknown[] = [];
    for (let n = 0; n < r.spins; n++) { reel.step(); steps.push([reel.toppos, reel.showing()]); }
    reel.stopSpinning(r.noslip);
    expect(reel.slipping).toBe(r.slipping);
    while (reel.spinning) { reel.step(); steps.push([reel.toppos, reel.showing()]); }
    expect(steps).toEqual(r.steps);
    expect(reel.showing()).toEqual(r.final);
    expect(used).toEqual(r.rolls);
    reel.dispose();
  });

  it("pays out the same coins for every line and wager (pbPayout)", async () => {
    const fake = () => ({ visible: false, srcRect: { set: noop }, setBitmapFile: noop, clearBitmaps: noop, bitmap: null, update: noop });
    for (const p of ref.payouts) {
      const scene = new SlotMachineScene();
      const sprites: Record<string, unknown> = {
        reel1: { showing: () => p.reels[0] }, reel2: { showing: () => p.reels[1] }, reel3: { showing: () => p.reels[2] },
        payout: new SlotMachineScore(0, 0, 0), credit: new SlotMachineScore(0, 0, 100),
        window1: fake(), window2: fake(), light1: fake(), light2: fake(),
      };
      for (let i = 1; i <= 5; i++) sprites[`row${i}`] = fake();
      scene.sprites = sprites as never;
      scene.wager = p.wager;
      await scene.pbPayout();
      expect([(sprites.credit as InstanceType<typeof SlotMachineScore>).score, scene.replay], JSON.stringify(p)).toEqual([p.credit, p.replay]);
    }
  });
});

//===============================================================================
// Voltorb Flip
//===============================================================================
describe("Voltorb Flip", () => {
  it.each(ref.voltorbFlip.map((b, i) => [i, b] as const))("board %i: same squares for its level", (_i, b) => {
    script(b.rolls);
    expect(VoltorbFlip.generateBoard(b.level)).toEqual(b.squares);
    expect(used).toEqual(b.rolls);
  });
});

//===============================================================================
// Lottery
//===============================================================================
describe("Lottery", () => {
  it("draws the same numbers as Ruby's seeded generator", () => {
    // Random.new(seed).rand(65_536): one-word and two-word seeds
    expect(new RubyMT(1037277).rand(65_536)).toBe(35062);
    expect(new RubyMT(2 ** 40 + 5).rand(65_536)).toBe(4388);
  });

  it("draws the same number as srand(date hash); rand(65_536) (pbSetLotteryNumber)", () => {
    for (const n of ref.lottery.numbers) {
      const [y, m, d] = n.date;
      expect(String(lotteryNumber(new Date(y!, m! - 1, d!, 12))).padStart(5, "0"), n.date.join("-")).toBe(n.number);
    }
  });

  it("finds the same winning Pokémon (pbLottery)", () => {
    const spy = vi.spyOn(PokemonStorageModule, "pbEachPokemon");
    for (const draw of ref.lottery.draws) {
      const mon = (name: string, id: number) => ({ name, owner: { publicId: () => id } });
      const party = draw.party.map((id, i) => mon(`P${i}`, id));
      const boxes = draw.boxes.map((box, b) => box.map((id, i) => mon(`${"BC"[b]}${i}`, id)));
      G.player = { party } as never;
      spy.mockReturnValue([...party.map((p) => [p, -1]), ...boxes.flatMap((box, b) => box.map((p) => [p, b]))] as never);
      G.gameVariables = new GameVariables();
      pbLottery(draw.winnum);
      expect([G.gameVariables.get(2), G.gameVariables.get(3), G.gameVariables.get(4)], draw.winnum).toEqual(draw.vars);
    }
    spy.mockRestore();
  });
});

//===============================================================================
// Mining
//===============================================================================
describe("Mining", () => {
  it.each(ref.mining.map((m, i) => [i, m] as const))("wall %i: same items, iron, layers and hits", async (_i, m) => {
    script(m.rolls);
    G.bag = { add: () => true } as never;
    const scene = new MiningGameScene();
    scene.sprites = {};
    scene.items = [];
    scene.itemswon = [];
    scene.iron = [];
    scene.pbDistributeItems();
    scene.pbDistributeIron();
    const layers: number[] = [];
    for (let i = 0; i < MiningGameScene.BOARD_HEIGHT; i++) {
      for (let j = 0; j < MiningGameScene.BOARD_WIDTH; j++) {
        const tile = new MiningGameTile(32 * j, 64 + (32 * i));
        scene.sprites[`tile${j + (i * MiningGameScene.BOARD_WIDTH)}`] = tile;
        layers.push(tile.layer);
      }
    }
    expect(scene.items).toEqual(m.items);
    expect(scene.iron).toEqual(m.iron);
    expect(layers).toEqual(m.layers);
    const cursor = new MiningGameCursor(58, 0);
    scene.sprites.cursor = cursor;
    const crack = new MiningGameCounter(0, 4);
    scene.sprites.crack = crack;
    const hits: unknown[] = [];
    for (let h = 0; h < 25; h++) {
      cursor.position = (h * 37 + _i * 11) % 130;
      cursor.mode = (h + _i) % 2;
      cursor.counter = 0;
      await scene.pbHit();
      hits.push([cursor.position, cursor.mode, crack.hits, cursor.hit, [...scene.itemswon]]);
    }
    expect(hits).toEqual(m.hits);
    expect([...Array(130).keys()].map((i) => (scene.sprites[`tile${i}`] as InstanceType<typeof MiningGameTile>).layer)).toEqual(m.finalLayers);
    expect(scene.items.map((i) => !!i[3])).toEqual(m.revealed);
    expect(used).toEqual(m.rolls);
  });
});

//===============================================================================
// Tile puzzles
//===============================================================================
describe("Tile puzzles (pbShuffleTiles)", () => {
  it.each(ref.tilePuzzles.map((p, i) => [i, p] as const))("puzzle %i: same shuffle", (_i, p) => {
    script(p.rolls);
    const scene = new TilePuzzleScene(p.game, "Kabuto", p.width, p.height);
    scene.heldtile = -1;
    scene.angles = [];
    const tiles = scene.pbShuffleTiles();
    scene.tiles = tiles;
    expect(tiles, `game ${p.game} ${p.width}x${p.height}`).toEqual(p.tiles);
    expect(scene.angles).toEqual(p.angles);
    expect(scene.pbDefaultCursorPosition()).toBe(p.cursor);
    expect(used).toEqual(p.rolls);
  });
});

//===============================================================================
// Roulette
//===============================================================================
describe("Roulette", () => {
  const fakeSprite = () => {
    const s = { x: 0, y: 0, visible: true, file: null as string | null, color: null as unknown,
      setBitmapFile(f: string) { s.file = f; }, bitmap: { width: 56, height: 32, clear: noop }, srcRect: { set: noop } };
    return s;
  };

  it("moves the cursor and computes multipliers and bets like Ruby (Roulette::Cursor)", () => {
    for (const c of ref.roulette.cursor) {
      const sprite = fakeSprite();
      const cursor = new Roulette.Cursor(sprite as never, [...c.played], 100, 200);
      const states = c.moves.map((m) => {
        (cursor as unknown as Record<string, () => void>)[`move${m[0]!.toUpperCase()}${m.slice(1)}`]!();
        return [cursor.indexX, cursor.indexY, cursor.multiplier(), cursor.bentPositions(), sprite.file, sprite.x, sprite.y];
      });
      expect(states).toEqual(c.states);
    }
  });

  it.each(ref.roulette.spins.map((s, i) => [i, s] as const))("spin %i lands on the same slot and pays the same (startSpin, processResults)", async (_i, s) => {
    newWorld();
    script(s.rolls);
    player().coins = 50;
    const scene = new Roulette.Scene() as unknown as Record<string, unknown>;
    const played = [...s.played];
    scene.sprites = new Proxy({}, { get: (t: Record<string, unknown>, k: string) => (t[k] ??= fakeSprite()) });
    scene.playedBalls = played;
    scene.roulette = { addBall: noop, adjustBitmapBall: noop, clearBalls: noop };
    scene.usedIconColor = null;
    scene.wager = s.wager;
    scene.tableBallPosArray = [];
    const cursor = new Roulette.Cursor(fakeSprite() as never, played, 100, 200);
    const target = [[0, 1], [2, 0], [3, 3], [0, 3], [1, 2], [4, 0]][_i]!;
    cursor.setIndex(target[0]!, target[1]!);
    scene.cursor = cursor;
    (scene.startSpin as () => void).call(scene);
    expect(scene.result).toBe(s.result);
    expect(scene.degreesToSpin).toBe(s.degrees);
    answers = [_i % 2 === 0];
    await (scene.processResults as () => Promise<void>).call(scene);
    expect([cursor.indexX, cursor.indexY]).toEqual(s.index);
    expect(player().coins).toBe(s.coins);
    expect(scene.exit).toBe(s.exit ?? false);
    expect(scene.playedBalls).toEqual(s.playedAfter);
    expect(messages).toEqual(s.messages);
    expect(used).toEqual(s.rolls);
  });
});
