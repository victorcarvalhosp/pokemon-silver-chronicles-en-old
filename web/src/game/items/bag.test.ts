// PokemonBag / PCItemStorage / ItemStorageHelper and the "obtain item" flows.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData, Settings } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G } from "../globals";
import { pbItemBall, pbReceiveItem, setMessageHook } from "./itemUtilities";
import { ItemStorageHelper, PCItemStorage, PokemonBag, type ItemSlot } from "./PokemonBag";

const messages: string[] = [];

beforeAll(() => {
  loadGameDataForTests();
  setMessageHook(async (text) => { messages.push(text); return 0; }, async () => true);
});

beforeEach(() => {
  messages.length = 0;
  G.bag = new PokemonBag();
});

describe("PokemonBag", () => {
  it("has 9 pockets (ZUD adds Z-Crystals) and puts items in their pocket", () => {
    const bag = G.bag;
    expect(PokemonBag.pocketCount()).toBe(9);
    expect(PokemonBag.pocketNames()[8]).toBe("Z-Crystals");
    expect(bag.pockets.length).toBe(10);
    expect(bag.add("POTION", 3)).toBe(true);
    expect(bag.quantity("POTION")).toBe(3);
    expect(bag.has("POTION", 3)).toBe(true);
    expect(bag.has("POTION", 4)).toBe(false);
    const pocket = GameData.Item.get("POTION").pocket;
    expect(bag.pockets[pocket]).toEqual([["POTION", 3]]);
    expect(bag.add("NOTANITEM")).toBe(false);
    expect(bag.quantity("NOTANITEM")).toBe(0);
  });

  it("caps slots at BAG_MAX_PER_SLOT and splits into more slots", () => {
    const bag = G.bag;
    bag.add("POTION", 999);
    bag.add("POTION", 5);
    const pocket = GameData.Item.get("POTION").pocket;
    expect(bag.pockets[pocket]).toEqual([["POTION", 999], ["POTION", 5]]);
    expect(bag.quantity("POTION")).toBe(1004);
    expect(bag.remove("POTION", 1000)).toBe(true);
    expect(bag.pockets[pocket]).toEqual([["POTION", 4]]);
    expect(bag.remove("POTION", 10)).toBe(false); // removes what it can
    expect(bag.quantity("POTION")).toBe(0);
    expect(bag.removeAll("POTION", 1)).toBe(false);
  });

  it("auto-sorts the TM and Berry pockets by item definition order", () => {
    const bag = G.bag;
    const berries = GameData.Item.each().filter((i) => i.pocket === 5).map((i) => i.id);
    bag.add(berries[3]!);
    bag.add(berries[0]!);
    bag.add(berries[2]!);
    expect(bag.pockets[5]!.map((s) => s[0])).toEqual([berries[0], berries[2], berries[3]]);
    expect(Settings.BAG_POCKET_AUTO_SORT[4]).toBe(true);
    // Items pocket isn't sorted: insertion order
    bag.add("SUPERPOTION");
    bag.add("POTION");
    const medicine = GameData.Item.get("POTION").pocket;
    expect(bag.pockets[medicine]!.map((s) => s[0])).toEqual(["SUPERPOTION", "POTION"]);
  });

  it("respects a pocket size limit", () => {
    const items: ItemSlot[] = [];
    expect(ItemStorageHelper.add(items, 2, 999, "POTION", 1)).toBe(true);
    expect(ItemStorageHelper.add(items, 2, 999, "ANTIDOTE", 1)).toBe(true);
    expect(ItemStorageHelper.canAdd(items, 2, 999, "AWAKENING", 1)).toBe(false);
    expect(ItemStorageHelper.add(items, 2, 999, "AWAKENING", 1)).toBe(false);
    expect(ItemStorageHelper.canAdd(items, 2, 999, "POTION", 998)).toBe(true);
    expect(ItemStorageHelper.canAdd(items, 2, 999, "POTION", 999)).toBe(false);
    expect(() => ItemStorageHelper.add(items, 2, 999, "POTION", -1)).toThrow();
  });

  it("Z-Crystals: always addable, held once (ZUD)", () => {
    const bag = G.bag;
    const z = GameData.Item.each().find((i) => i.isZCrystal())!;
    expect(bag.add(z.id)).toBe(true);
    expect(bag.add(z.id)).toBe(true);
    expect(bag.quantity(z.id)).toBe(1);
    expect(bag.canAdd(z.id, 5)).toBe(true);
  });

  it("registers items, replaces items, remembers selections", () => {
    const bag = G.bag;
    bag.add("POTION", 2);
    bag.register("POTION");
    expect(bag.registered("POTION")).toBe(true);
    bag.unregister("POTION");
    expect(bag.registered("POTION")).toBe(false);
    expect(bag.replaceItem("POTION", "SUPERPOTION")).toBe(true);
    expect(bag.quantity("SUPERPOTION")).toBe(2);
    const pocket = GameData.Item.get("POTION").pocket;
    bag.setLastViewedIndex(pocket, 1);
    expect(bag.lastViewedIndex(pocket)).toBe(1);
    bag.setLastViewedIndex(pocket, 5); // beyond the pocket: ignored
    expect(bag.lastViewedIndex(pocket)).toBe(1);
    expect(() => bag.lastViewedIndex(0)).toThrow();
  });

  it("rearranges items saved with fewer pockets", () => {
    const bag = PokemonBag.fromJSON({
      pockets: [[], [["POTION", 2]], [], [], [], [], [], [], []], lastViewedPocket: 3,
      lastPocketSelections: [0, 0, 0, 0, 0, 0, 0, 0, 0], registeredItems: [], readyMenuSelection: [0, 0, 1],
    });
    expect(bag.pockets.length).toBe(10);
    expect(bag.lastViewedPocket).toBe(1);
    expect(bag.quantity("POTION")).toBe(2);
  });

  it("round-trips through JSON", () => {
    const bag = G.bag;
    // An unlimited pocket only gets one new slot per add (as in Ruby), so 1004 at once stops at 999.
    expect(bag.add("POTION", 1004)).toBe(false);
    bag.add("POTION", 5);
    bag.add("ORANBERRY", 3);
    bag.register("BICYCLE");
    bag.lastViewedPocket = 4;
    const json = JSON.parse(JSON.stringify(bag.toJSON())) as ReturnType<PokemonBag["toJSON"]>;
    const back = PokemonBag.fromJSON(json);
    expect(back).toBeInstanceOf(PokemonBag);
    expect(back.toJSON()).toEqual(json);
    expect(back.quantity("POTION")).toBe(1004);
  });
});

describe("PCItemStorage", () => {
  it("starts with Metadata's StartItemStorage and round-trips", () => {
    const pc = new PCItemStorage();
    expect(pc.items).toEqual(GameData.Metadata.get().startItemStorage.map((i) => [i, 1]));
    pc.add("ANTIDOTE", 5);
    expect(pc.getItem(1)).toBe("ANTIDOTE");
    expect(pc.getItemCount(1)).toBe(5);
    const back = PCItemStorage.fromJSON(JSON.parse(JSON.stringify(pc.toJSON())));
    expect(back.toJSON()).toEqual(pc.toJSON());
  });
});

describe("pbReceiveItem / pbItemBall", () => {
  it("shows Essentials' messages and adds the item", async () => {
    expect(await pbReceiveItem("POTION")).toBe(true);
    expect(G.bag.quantity("POTION")).toBe(1);
    const pocket = GameData.Item.get("POTION").pocket;
    expect(messages).toEqual([
      "\\me[Item get]You obtained a \\c[1]Potion\\c[0]!\\wtnp[30]",
      `You put the Potion in\\nyour Bag's <icon=bagPocket${pocket}>\\c[1]${PokemonBag.pocketNames()[pocket - 1]}\\c[0] pocket.`,
    ]);
    messages.length = 0;
    expect(await pbItemBall("ULTRABALL", 2)).toBe(true);
    expect(messages[0]).toBe("\\me[Item get]You found 2 \\c[1]Ultra Balls\\c[0]!\\wtnp[30]");
    messages.length = 0;
    await pbReceiveItem("ANTIDOTE");
    expect(messages[0]).toBe("\\me[Item get]You obtained an \\c[1]Antidote\\c[0]!\\wtnp[30]");
    messages.length = 0;
    await pbReceiveItem("ESCAPEROPE"); // a Key Item in this game
    expect(messages[0]).toBe("\\me[Key item get]You obtained an \\c[1]Escape Rope\\c[0]!\\wtnp[30]");
  });

  it("TMs show the move name", async () => {
    const tm = GameData.Item.each().find((i) => i.isTM())!;
    await pbItemBall(tm.id);
    expect(messages[0]).toBe(`\\me[Item get]You found \\c[1]${tm.name} ${GameData.Move.get(tm.move!).name}\\c[0]!\\wtnp[30]`);
  });
});
