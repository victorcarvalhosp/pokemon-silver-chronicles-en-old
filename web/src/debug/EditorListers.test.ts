// EditorListers.ts (003_Editor_Listers.rb + TDW Debug List Search): the
// listers' commands/value mapping, commands_override's id refresh, and
// pbListScreen/pbListScreenBlock driven headless (Graphics.update advances a
// script of frames: newly pressed buttons/keys and the list's cursor).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Frame = { keys?: (number | string)[]; index?: number };
const script: Frame[] = [];
let frame: Frame = {};
const windows: FakeWindow[] = [];
const freeText: string[] = [];
const messages: string[] = [];
let devList: string[] | null = [];

class FakeWindow {
  commands: string[] = [];
  index = 0;
  x = 0; y = 0; width = 0; height = 64; z = 0; visible = true; active = false; rowHeight = 32;
  viewport: unknown = null;
  contents = { font: {} };
  text = "";
  disposed = false;
  constructor(commands: string[] | string = []) { if (Array.isArray(commands)) this.commands = commands; else this.text = commands; windows.push(this); }
  static newWithSize(commands: string[] | string) { return new FakeWindow(commands); }
  refresh(): void {}
  resizeHeightToFit(): void {}
  update(): void { if (frame.index !== undefined) this.index = frame.index; }
  dispose(): void { this.disposed = true; }
}

class FakeSprite {
  bitmap: { width: number; height: number; dispose(): void } | null = null;
  x = 0; y = 0; z = 0; ox = 0; oy = 0; zoomX = 1; zoomY = 1; viewport: unknown = null; item: string | null = null; file: string | null = null;
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  setBitmap(b: FakeSprite["bitmap"]) { this.bitmap = b; }
  setBitmapFile(f: string | null) { this.file = f; this.bitmap = f ? { width: 1024, height: 64, dispose() {} } : null; }
  clearBitmaps() { this.bitmap = null; }
  dispose() {}
}

vi.mock("../rgss/Graphics", () => ({
  Graphics: {
    width: 512, height: 384,
    update: async () => {
      if (script.length === 0) throw new Error("input script ran out");
      frame = script.shift()!;
    },
  },
}));
vi.mock("../rgss/Input", () => ({
  Input: {
    DOWN: 2, LEFT: 4, RIGHT: 6, UP: 8, USE: 13, BACK: 12, ACTION: 11, SPECIAL: 16,
    update: () => {},
    trigger: (b: number) => frame.keys?.includes(b) ?? false,
  },
}));
vi.mock("../ui/textEntry/keyboard", () => ({
  KeyboardInput: { update: () => {}, triggerex: (k: string) => frame.keys?.includes(k) ?? false },
}));
vi.mock("../rgss/Audio", () => ({ Audio: {}, unlockAudio: async () => {} }));
vi.mock("../rgss/display", () => ({ Viewport: class { z = 0; dispose() {} }, Sprite: FakeSprite }));
vi.mock("../ui/SpriteWrapper", () => ({ IconSprite: FakeSprite }));
vi.mock("../ui/sprites/itemIcon", () => ({ ItemIconSprite: FakeSprite, preloadItemIcons: async () => {} }));
vi.mock("../ui/rpgCache", () => ({ preloadBitmap: async () => null, pbResolveBitmap: (p: string) => p }));
vi.mock("../ui/windows/SpriteWindowText", () => ({ Window_CommandPokemon: FakeWindow, Window_UnformattedTextPokemon: FakeWindow }));
vi.mock("../ui/messageConfig", async (orig) => ({
  ...(await orig<typeof import("../ui/messageConfig")>()),
  pbSetSmallFont: () => {},
}));
vi.mock("../ui/messages", () => ({
  pbMessage: async (m: string) => { messages.push(m); return 0; },
  pbConfirmMessage: async () => false,
}));
vi.mock("../ui/party/mail", () => ({ pbMessageFreeText: async () => freeText.shift() ?? "" }));
vi.mock("./devFiles", () => ({
  DevFiles: {
    list: async () => {
      if (!devList) throw new Error("no dev server");
      return devList;
    },
  },
}));

const { loadGameDataForTests } = await import("../data/gameData/testing");
const { GameData } = await import("../data/gameData");
const { Data } = await import("../data/store");
const L = await import("./EditorListers");

const USE = 13, BACK = 12, ACTION = 11;

beforeAll(() => loadGameDataForTests());
beforeEach(() => {
  script.length = 0;
  windows.length = 0;
  freeText.length = 0;
  messages.length = 0;
  devList = [];
  frame = {};
});

describe("SpeciesLister", () => {
  it("lists base species alphabetically as 'NNN: Name', with [NEW SPECIES] first", () => {
    const lister = new L.SpeciesLister(0, true);
    const cmds = lister.commands();
    const species = GameData.Species.eachSpecies();
    expect(cmds).toHaveLength(species.length + 1);
    expect(cmds[0]).toBe("[NEW SPECIES]");
    expect(lister.value(0)).toBe(true);
    const pikachu = cmds.indexOf(`${String(species.findIndex((s) => s.id === "PIKACHU") + 1).padStart(3, "0")}: Pikachu`);
    expect(lister.value(pikachu)).toBe("PIKACHU");
    const names = cmds.slice(1).map((c) => c.slice(c.indexOf(": ") + 2).toLowerCase());
    expect(names).toEqual([...names].sort());
    expect(lister.value(-1)).toBeNull();
  });

  it("clamps the starting index to the list", () => {
    const lister = new L.SpeciesLister(99999);
    const cmds = lister.commands();
    expect(lister.startIndex()).toBe(cmds.length - 1);
  });

  it("commands_override= narrows the list and its ids (TDW Debug List Search)", () => {
    const lister = new L.SpeciesLister(0, true);
    const cmds = lister.commands();
    const picks = [cmds.find((c) => c.endsWith(": Raichu"))!, cmds.find((c) => c.endsWith(": Bulbasaur"))!];
    lister.commandsOverride = picks;
    expect(lister.commands()).toEqual(picks);
    expect([lister.value(0), lister.value(1)]).toEqual(["RAICHU", "BULBASAUR"]);
    // Asking again doesn't remap
    lister.commands();
    expect(lister.value(0)).toBe("RAICHU");
  });

  it("NOTE (Ruby parity): searching the search results maps to the wrong ids", () => {
    const lister = new L.SpeciesLister(0, false);
    const cmds = lister.commands();
    const raichu = cmds.find((c) => c.endsWith(": Raichu"))!;
    const bulbasaur = cmds.find((c) => c.endsWith(": Bulbasaur"))!;
    lister.commandsOverride = [raichu, bulbasaur];
    lister.commands();
    lister.commandsOverride = [bulbasaur];
    lister.commands();
    // Bulbasaur's position in the full list, looked up in the narrowed ids
    expect(lister.value(0)).not.toBe("BULBASAUR");
  });
});

describe("ItemLister / TrainerTypeLister / TrainerBattleLister", () => {
  it("ItemLister lists every item and shows the selected one's icon", async () => {
    const lister = new L.ItemLister(0, true);
    const cmds = lister.commands();
    expect(cmds).toHaveLength(GameData.Item.count() + 1);
    expect(cmds[0]).toBe("[NEW ITEM]");
    const i = cmds.findIndex((c) => c.endsWith(": Potion"));
    expect(lister.value(i)).toBe("POTION");
    await lister.refresh(i);
    expect((lister as unknown as { sprite: FakeSprite }).sprite.item).toBe("POTION");
    await lister.refresh(0);
    expect((lister as unknown as { sprite: FakeSprite }).sprite.item).toBeNull();
  });

  it("TrainerTypeLister sorts by name, then by number", () => {
    const lister = new L.TrainerTypeLister(0, false);
    const cmds = lister.commands();
    expect(cmds).toHaveLength(GameData.TrainerType.count());
    const types = GameData.TrainerType.each();
    const first = types.map((t) => t.realName).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0))[0];
    expect(cmds[0]!.slice(cmds[0]!.indexOf(": ") + 2)).toBe(first);
  });

  it("TrainerBattleLister names each battle and lists its Pokémon", async () => {
    const lister = new L.TrainerBattleLister(0, true);
    const cmds = lister.commands();
    expect(cmds[0]).toBe("[NEW TRAINER BATTLE]");
    expect(cmds).toHaveLength(GameData.Trainer.count() + 1);
    const id = lister.value(1) as [string, string, number];
    const tr = GameData.Trainer.get(id[0], id[1], id[2]);
    const name = GameData.TrainerType.get(id[0]).name;
    expect(cmds[1]).toBe(id[2] > 0 ? `${name} ${id[1]} (${id[2]}) x${tr.pokemon.length}` : `${name} ${id[1]} x${tr.pokemon.length}`);
    await lister.refresh(1);
    const pkmnList = windows[windows.length - 1]!;
    expect(pkmnList.text.split("\r\n")).toEqual(tr.pokemon.map((p) => `${GameData.Species.get(p.species).realName} Lv.${p.level}`));
  });
});

describe("MetadataLister", () => {
  it("maps rows to global (0), players (their IDs) and new player (-2)", () => {
    const lister = new L.MetadataLister(-1, true);
    const ids = GameData.PlayerMetadata.each().map((p) => p.id);
    const cmds = lister.commands();
    expect(cmds).toEqual(["[GLOBAL METADATA]", ...ids.map((id) => `Player ${id}`), "[ADD NEW PLAYER]"]);
    expect(lister.value(-1)).toBe(-1);
    expect(lister.value(0)).toBe(0);
    expect(lister.value(1)).toBe(ids[0]);
    expect(lister.value(cmds.length - 1)).toBe(-2);
  });

  it("NOTE (Ruby parity): any selected player starts the cursor on the first player", () => {
    const last = GameData.PlayerMetadata.each().at(-1)!.id;
    expect(new L.MetadataLister(last).startIndex()).toBe(1);
    expect(new L.MetadataLister(-1).startIndex()).toBe(0);
  });
});

describe("MapLister", () => {
  it("lists the map tree indented by depth, with an optional [GLOBAL] row", () => {
    const saved = new Map(Data.mapInfos);
    Data.mapInfos.clear();
    const add = (id: number, name: string, parentId: number, order: number) =>
      Data.mapInfos.set(id, { id, name, parentId, order, width: 1, height: 1, expanded: false, scrollX: 0, scrollY: 0 });
    add(1, "Town", 0, 1);
    add(12, "House", 1, 1);
    try {
      const lister = new L.MapLister(12, true);
      expect(lister.commands()).toEqual(["[GLOBAL]", "001 Town", "  012 House"]);
      expect(lister.startIndex()).toBe(2);
      expect([lister.value(-1), lister.value(0), lister.value(1), lister.value(2)]).toEqual([-1, 0, 1, 12]);
      const plain = new L.MapLister(1);
      expect(plain.commands()).toEqual(["001 Town", "  012 House"]);
      expect(plain.value(0)).toBe(1);
    } finally {
      Data.mapInfos.clear();
      for (const [k, v] of saved) Data.mapInfos.set(k, v);
    }
  });
});

describe("GraphicsLister / MusicFileLister", () => {
  it("NOTE (Ruby parity): lists each picture once per (case-insensitive) glob, sorted", async () => {
    devList = ["b.png", "A.PNG", "sub/c.png", "d.gif", "e.txt"];
    const lister = new L.GraphicsLister("Graphics/Windowskins/", "b.png");
    expect(await lister.commands()).toEqual(["A.PNG", "A.PNG", "b.png", "b.png", "d.gif", "d.gif"]);
    expect(lister.startIndex()).toBe(3);
    expect(lister.value(-1)).toBe("");
    await lister.refresh(0);
    const sprite = (lister as unknown as { sprite: FakeSprite }).sprite;
    expect(sprite.file).toBe("Graphics/Windowskins/A.PNG");
    expect(sprite.zoomX).toBe(0.25); // 1024 px wide into half the screen
  });

  it("says when there are no files", async () => {
    devList = [];
    expect(await new L.GraphicsLister("Graphics/Characters/", "").commands()).toEqual([]);
    expect(messages).toEqual(["There are no files."]);
  });

  it("MusicFileLister lists audio once each, case-insensitively sorted", async () => {
    devList = ["town.ogg", "Battle.mid", "Battle.MID", "intro.wav", "x.mp3", "Gym.midi"];
    const lister = new L.MusicFileLister(true, "town.ogg");
    expect(await lister.commands()).toEqual(["Battle.mid", "Battle.MID", "Gym.midi", "intro.wav", "town.ogg"]);
    expect(lister.startIndex()).toBe(4);
  });

  it("falls back to the asset index without the dev file endpoint", async () => {
    devList = null;
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(["graphics/windowskins/choice 1", "graphics/windowskins/choice 1.png", "graphics/pictures/x.png"])));
    const assets = await import("../core/assets");
    await assets.loadAssetIndex();
    expect(await new L.GraphicsLister("Graphics/Windowskins/", "").commands()).toEqual(["choice 1.png", "choice 1.png"]);
    vi.unstubAllGlobals();
  });
});

describe("pbListScreen / pbListScreenBlock", () => {
  it("pbListScreen returns the chosen value, or the cancel value", async () => {
    script.push({ index: 3 }, { keys: [USE] });
    const lister = new L.MetadataLister(-1, false);
    expect(await L.pbListScreen("SET METADATA", lister)).toBe(GameData.PlayerMetadata.each()[2]!.id);
    script.push({ keys: [BACK] });
    expect(await L.pbListScreen("SET METADATA", new L.MetadataLister(-1, false))).toBe(-1);
  });

  it("pbListScreenBlock calls the block, and F narrows the list (TDW Debug List Search)", async () => {
    const calls: [number, unknown][] = [];
    freeText.push("potion");
    script.push({ keys: ["F"] }, { index: 0, keys: [USE] }, { keys: [BACK] });
    await L.pbListScreenBlock("ADD ITEM", new L.ItemLister(), (button, item) => { calls.push([button, item]); });
    const list = windows[0]!;
    expect(list.commands.every((c) => c.toLowerCase().includes("potion"))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(USE);
    expect(GameData.Item.get(calls[0]![1] as string).realName).toBe(list.commands[0]!.slice(list.commands[0]!.indexOf(": ") + 2));
  });

  it("pbListScreenBlock passes ACTION too", async () => {
    const calls: [number, unknown][] = [];
    script.push({ index: 0, keys: [ACTION] }, { keys: [BACK] });
    await L.pbListScreenBlock("Trainer Types", new L.TrainerTypeLister(0, true), (button, v) => { calls.push([button, v]); });
    expect(calls).toEqual([[ACTION, true]]);
  });
});
