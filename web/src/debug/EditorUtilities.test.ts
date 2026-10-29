// EditorUtilities.ts (001_Editor_Utilities.rb + TDW Debug List Search +
// Gen 9 pbChooseStatList): the pure helpers, and pbChooseList driven
// headless — Graphics.update advances a script of frames, each saying which
// buttons/keys are newly pressed and where the list's cursor is.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Frame = { keys?: (number | string)[]; index?: number };
const script: Frame[] = [];
let frame: Frame = {};
const windows: FakeWindow[] = [];
const freeText: string[] = [];
const messages: string[] = [];
const confirms: boolean[] = [];

class FakeWindow {
  commands: string[] = [];
  index = 0;
  x = 0; y = 0; width = 0; height = 0; z = 0; visible = true; active = false; rowHeight = 32;
  viewport: unknown = null;
  contents = { font: {} };
  disposed = false;
  constructor(commands: string[] = [], width = 0) { this.commands = commands; this.width = width; windows.push(this); }
  static newWithSize(commands: string[], _x: number, _y: number, width: number, height: number) {
    const w = new FakeWindow(commands, width);
    w.height = height;
    return w;
  }
  refresh(): void {}
  update(): void { if (frame.index !== undefined) this.index = frame.index; }
  dispose(): void { this.disposed = true; }
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
    press: (b: number) => frame.keys?.includes(b) ?? false,
    repeat: (b: number) => frame.keys?.includes(b) ?? false,
  },
}));
vi.mock("../ui/textEntry/keyboard", () => ({
  KeyboardInput: { update: () => {}, triggerex: (k: string) => frame.keys?.includes(k) ?? false },
}));
vi.mock("../rgss/Audio", () => ({ Audio: {}, unlockAudio: async () => {} }));
vi.mock("../ui/windows/SpriteWindowText", () => ({ Window_CommandPokemon: FakeWindow, Window_UnformattedTextPokemon: FakeWindow }));
vi.mock("../ui/messageConfig", async (orig) => ({
  ...(await orig<typeof import("../ui/messageConfig")>()),
  pbSetSmallFont: () => {},
}));
vi.mock("../ui/messages", () => ({
  pbMessage: async (m: string) => { messages.push(m); return 0; },
  pbConfirmMessage: async (m: string) => { messages.push(m); return confirms.shift() ?? false; },
}));
vi.mock("../ui/party/mail", () => ({ pbMessageFreeText: async () => freeText.shift() ?? "" }));

const { loadGameDataForTests } = await import("../data/gameData/testing");
const { GameData } = await import("../data/gameData");
const { Data } = await import("../data/store");
const { DevFiles } = await import("./devFiles");
const U = await import("./EditorUtilities");

const USE = 13, BACK = 12, ACTION = 11;

beforeAll(() => loadGameDataForTests());
beforeEach(() => {
  script.length = 0;
  windows.length = 0;
  freeText.length = 0;
  messages.length = 0;
  confirms.length = 0;
  frame = {};
});

/** The list window's commands the last time it was shown. */
const shown = () => windows[0]!.commands;

describe("pbGetLegalMoves", () => {
  it("lists level-up moves, then tutor moves, then the baby's egg moves, without duplicates", () => {
    const pikachu = GameData.Species.get("PIKACHU");
    const moves = U.pbGetLegalMoves("PIKACHU");
    expect(moves.slice(0, 3)).toEqual(["PLAYNICE", "SWEETKISS", "NUZZLE"]);
    expect(new Set(moves).size).toBe(moves.length);
    // Pikachu has no egg moves of its own: Pichu's are added
    expect(pikachu.eggMoves).toEqual([]);
    expect(moves).toEqual(expect.arrayContaining(["VOLTTACKLE", "WISH", ...pikachu.tutorMoves]));
    const expected = [...new Set([...pikachu.moves.map((m) => m.move), ...pikachu.tutorMoves,
      ...GameData.Species.get("PICHU").eggMoves])];
    expect(moves).toEqual(expected);
  });
});

describe("pbMapTree", () => {
  it("walks the map tree depth first, children by order", () => {
    const saved = new Map(Data.mapInfos);
    Data.mapInfos.clear();
    const add = (id: number, name: string, parentId: number, order: number) =>
      Data.mapInfos.set(id, { id, name, parentId, order, width: 1, height: 1, expanded: false, scrollX: 0, scrollY: 0 });
    add(5, "Town", 0, 2);
    add(1, "Intro", 0, 1);
    add(7, "House", 5, 2);
    add(3, "Mart", 5, 1);
    add(9, "Upstairs", 7, 1);
    try {
      expect(U.pbMapTree()).toEqual([
        [1, "Intro", 0], [5, "Town", 0], [3, "Mart", 1], [7, "House", 1], [9, "Upstairs", 2],
      ]);
    } finally {
      Data.mapInfos.clear();
      for (const [k, v] of saved) Data.mapInfos.set(k, v);
    }
  });
});

describe("pbAllocateAnimation", () => {
  const anim = (name: string, frames: unknown[][]) => ({ name, length: frames.length, frame: (i: number) => frames[i] ?? [] });
  const list = (anims: (ReturnType<typeof anim> | null)[]) => ({
    anims, get length() { return this.anims.length; }, get(i: number) { return this.anims[i]; },
    resize(len: number) { while (this.anims.length > len) this.anims.pop(); while (this.anims.length < len) this.anims.push(anim("", [[1, 2]])); },
  });

  it("reuses a missing or empty slot after the first", () => {
    expect(U.pbAllocateAnimation(list([anim("", [[1, 2]]), anim("A", [[1, 2, 3]]), null]), "X")).toBe(2);
    expect(U.pbAllocateAnimation(list([anim("", [[1, 2]]), anim("A", [[1, 2, 3]]), anim("", [[1, 2]])]), "X")).toBe(2);
  });

  it("NOTE (Ruby parity): otherwise resizes the list to 10 and returns the old length", () => {
    const l = list([anim("", [[1, 2]]), ...Array.from({ length: 11 }, (_, i) => anim(`A${i}`, [[1, 2, 3]]))]);
    expect(U.pbAllocateAnimation(l, "X")).toBe(12);
    expect(l.length).toBe(10);
  });
});

describe("moveListForSpecies (pbChooseMoveListForSpecies)", () => {
  it("lists the legal moves by name, then every move by name", () => {
    const { commands } = U.moveListForSpecies("PIKACHU");
    const legal = U.pbGetLegalMoves("PIKACHU");
    expect(commands.length).toBe(legal.length + GameData.Move.count());
    const names = commands.slice(0, legal.length).map((c) => c[1]);
    expect(names).toEqual([...names].sort());
  });

  it("starts on a legal default move", () => {
    const { commands, moveDefault } = U.moveListForSpecies("PIKACHU", "THUNDERBOLT");
    expect(commands[moveDefault]![2]).toBe("THUNDERBOLT");
  });

  it("NOTE (Ruby parity): an illegal default's row is counted from the second list's start", () => {
    expect(U.pbGetLegalMoves("PIKACHU")).not.toContain("SPORE");
    const { commands, moveDefault } = U.moveListForSpecies("PIKACHU", "SPORE");
    const legalCount = U.pbGetLegalMoves("PIKACHU").length;
    expect(commands[legalCount + moveDefault]![2]).toBe("SPORE");
    expect(commands[moveDefault]![2]).not.toBe("SPORE");
  });
});

describe("pbChooseList", () => {
  const cmds = (): [number, string, string][] => [[1, "Charlie", "C"], [2, "Alpha", "A"], [3, "Bravo", "B"]];

  it("sorts alphabetically and returns the chosen ID", async () => {
    script.push({}, { index: 1, keys: [USE] });
    expect(await U.pbChooseList(cmds(), 0, -1, 1)).toBe("B");
    expect(shown()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("starts on the default ID and returns cancelValue when cancelled", async () => {
    script.push({ keys: [BACK] });
    expect(await U.pbChooseList(cmds(), "C", null, -1)).toBeNull();
    expect(windows[0]!.index).toBe(0);
    script.push({ keys: [USE] });
    expect(await U.pbChooseList(cmds(), "B", null, -1)).toBe("B");
  });

  it("ACTION toggles between numbered and alphabetical order, keeping the selection", async () => {
    script.push({ index: 0, keys: [ACTION] });
    const pending = U.pbChooseList(cmds(), 0, -1, -1);
    // Numbered first ("001: Charlie"); after the toggle Charlie is last
    script.push({ keys: [USE] });
    expect(await pending).toBe("C");
    expect(shown()).toEqual(["002: Alpha", "003: Bravo", "001: Charlie"]);
    expect(windows[0]!.index).toBe(2);
  });

  it("returns the number when an entry has no ID", async () => {
    script.push({ index: 2, keys: [USE] });
    expect(await U.pbChooseList([[4, "D"], [2, "B"], [9, "Z"]], 0, -1, 0)).toBe(9);
  });

  it("F searches the shown entries (TDW Debug List Search)", async () => {
    freeText.push("ra");
    script.push({ keys: ["F"] }, { keys: [USE] });
    expect(await U.pbChooseList(cmds(), 0, -1, -1)).toBe("B");
    expect(shown()).toEqual(["003: Bravo"]);
  });

  it("a search with no results says so and keeps the list", async () => {
    freeText.push("zzz");
    script.push({ keys: ["F"] }, { index: 1, keys: [USE] });
    expect(await U.pbChooseList(cmds(), 0, -1, 1)).toBe("B");
    expect(messages).toEqual(["No results found."]);
  });
});

describe("pbOpenGenericListSearch", () => {
  it("returns indexes (type 0) or entries (type 1), false for no term", async () => {
    freeText.push("AL", "al", "");
    expect(await U.pbOpenGenericListSearch(["Alpha", "Beta", "Royal"], 0)).toEqual([0, 2]);
    expect(await U.pbOpenGenericListSearch(["Alpha", "Beta", "Royal"], 1)).toEqual(["Alpha", "Royal"]);
    expect(await U.pbOpenGenericListSearch(["Alpha"])).toBe(false);
  });
});

describe("pbChooseStatList (Gen 9 Pack)", () => {
  it("lists the battle stats numbered and returns the chosen ID", async () => {
    script.push({ index: 4, keys: [USE] });
    expect(await U.pbChooseStatList("main_battle", "ATTACK")).toBe("SPEED");
    expect(shown()).toEqual(["001: Attack", "002: Defense", "003: Special Attack", "004: Special Defense", "005: Speed"]);
  });

  it("main includes HP; battle includes accuracy and evasion", async () => {
    script.push({ keys: [BACK] });
    expect(await U.pbChooseStatList("main")).toBeNull();
    expect(shown()[0]).toBe("001: HP");
    expect(shown()).toHaveLength(6);
    windows.length = 0;
    script.push({ keys: [BACK] });
    await U.pbChooseStatList("battle");
    expect(shown()).toHaveLength(7);
  });
});

describe("pbChooseFromGameDataList", () => {
  it("leaves out what the block rejects (pbChooseTypeList skips pseudo-types)", async () => {
    script.push({ keys: [BACK] });
    await U.pbChooseTypeList();
    const names = shown().map((s) => s.slice(5));
    expect(names).not.toContain(GameData.Type.get("QMARKS").realName);
    expect(names).toContain("Fire");
  });

  it("throws for a class that isn't in GameData", async () => {
    await expect(U.pbChooseFromGameDataList("Nope")).rejects.toThrow("Couldn't find class Nope in module GameData.");
  });
});

describe("pbCommands2 / pbCommands3", () => {
  it("pbCommands2 returns the index, or cmdIfCancel (minus one when positive)", async () => {
    const w = new FakeWindow();
    script.push({ index: 2, keys: [USE] });
    expect(await U.pbCommands2(w, ["a", "b", "c"], -1)).toBe(2);
    expect(w.active).toBe(false);
    script.push({ keys: [BACK] });
    expect(await U.pbCommands2(w, ["a"], 3)).toBe(2);
    script.push({ keys: [BACK] }, { keys: [USE] }); // cmdIfCancel 0: BACK does nothing
    expect(await U.pbCommands2(w, ["a"], 0, 0)).toBe(0);
  });

  it("pbCommands3 reports ACTION+direction and SPECIAL", async () => {
    const w = new FakeWindow();
    script.push({ index: 1, keys: [ACTION, 8] });
    expect(await U.pbCommands3(w, ["a", "b"], -1)).toEqual([1, 1]);
    script.push({ keys: [16] });
    expect(await U.pbCommands3(w, ["a", "b"], -1)).toEqual([5, 1]);
    script.push({ keys: [BACK] });
    expect(await U.pbCommands3(w, ["a", "b"], -1)).toEqual([0, -1]);
  });
});

describe("pbSafeCopyFile", () => {
  const files = new Map<string, Uint8Array>();
  const written: [string, Uint8Array][] = [];
  beforeEach(() => {
    files.clear();
    written.length = 0;
    vi.spyOn(DevFiles, "available").mockResolvedValue(true);
    vi.spyOn(DevFiles, "write").mockImplementation(async (path, content) => { written.push([path, content as Uint8Array]); });
    vi.stubGlobal("fetch", async (url: string) => {
      const path = decodeURIComponent(url.split("path=")[1]!);
      const data = files.get(path);
      return data ? new Response(data as BodyInit) : new Response("", { status: 404 });
    });
  });

  it("copies when the destination is missing, to z if given", async () => {
    files.set("Graphics/Animations/a.png", new Uint8Array([1, 2, 3]));
    await U.pbSafeCopyFile("Graphics/Animations/a.png", "PBS/a.png", "web/data/a.png");
    expect(written).toEqual([["web/data/a.png", new Uint8Array([1, 2, 3])]]);
  });

  it("skips identical files and asks before overwriting a different one", async () => {
    files.set("Graphics/x.png", new Uint8Array([1, 2]));
    files.set("PBS/x.png", new Uint8Array([1, 2]));
    await U.pbSafeCopyFile("Graphics/x.png", "PBS/x.png");
    expect(written).toEqual([]);
    files.set("PBS/x.png", new Uint8Array([1, 3]));
    confirms.push(false);
    await U.pbSafeCopyFile("Graphics/x.png", "PBS/x.png");
    expect(messages).toEqual(["A different file named 'PBS/x.png' already exists. Overwrite it?"]);
    expect(written).toEqual([]);
    confirms.push(true);
    await U.pbSafeCopyFile("Graphics/x.png", "PBS/x.png");
    expect(written).toEqual([["PBS/x.png", new Uint8Array([1, 2])]]);
  });

  it("does nothing for a missing source; fails writing outside web/data and PBS", async () => {
    await U.pbSafeCopyFile("Graphics/none.png", "PBS/none.png");
    expect(written).toEqual([]);
    vi.mocked(DevFiles.write).mockRestore();
    files.set("Audio/SE/a.ogg", new Uint8Array([1]));
    await expect(U.pbSafeCopyFile("Audio/SE/a.ogg", "Animations/x/a.ogg")).rejects.toThrow("not allowed");
  });
});
