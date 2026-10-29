// Port of Data/Scripts/013_Items/008_PokemonBag.rb (PokemonBag, PCItemStorage,
// ItemStorageHelper), with ZUD Mechanics' Z-Crystal rules (a Z-Crystal can
// always be added, and only once) and its ninth "Z-Crystals" pocket.
//
// Pockets are 1-based like Essentials (pockets[0] is unused); each pocket is
// a list of [item ID, quantity] slots.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Metadata } from "../../data/gameData/metadata";
import { Settings } from "../../data/gameData/settings";

export type ItemSlot = [Id, number];

export interface PokemonBagJSON {
  pockets: ItemSlot[][];
  lastViewedPocket: number;
  lastPocketSelections: number[];
  registeredItems: Id[];
  readyMenuSelection: number[];
}

export class PokemonBag {
  lastViewedPocket = 1;
  lastPocketSelections: number[] = [];
  registeredItems: Id[] = [];
  /** Used by the Ready Menu to remember cursor positions. */
  readyMenuSelection: number[] = [0, 0, 1];
  private _pockets: ItemSlot[][] = [];

  static pocketNames(): string[] {
    return Settings.bagPocketNames();
  }

  static pocketCount(): number {
    return PokemonBag.pocketNames().length;
  }

  constructor() {
    this._pockets = [];
    for (let i = 0; i <= PokemonBag.pocketCount(); i++) this._pockets[i] = [];
    this.resetLastSelections();
    this.registeredItems = [];
    this.readyMenuSelection = [0, 0, 1];
  }

  resetLastSelections(): void {
    this.lastViewedPocket = 1;
    this.lastPocketSelections ??= [];
    for (let i = 0; i <= PokemonBag.pocketCount(); i++) this.lastPocketSelections[i] = 0;
  }

  clear(): void {
    for (const pocket of this._pockets) pocket.length = 0;
    for (let i = 0; i < PokemonBag.pocketCount() + 1; i++) this.lastPocketSelections[i] = 0;
  }

  /** The pockets (index = pocket number), rearranged first if the pocket count changed. */
  get pockets(): ItemSlot[][] {
    this.rearrange();
    return this._pockets;
  }

  //=============================================================================

  /** Gets the index of the current selected item in the pocket. */
  lastViewedIndex(pocket: number): number {
    if (pocket <= 0 || pocket > PokemonBag.pocketCount()) throw new RangeError(`Invalid pocket: ${pocket}`);
    this.rearrange();
    return Math.min(this.lastPocketSelections[pocket]!, this._pockets[pocket]!.length) || 0;
  }

  /** Sets the index of the current selected item in the pocket. */
  setLastViewedIndex(pocket: number, value: number): void {
    if (pocket <= 0 || pocket > PokemonBag.pocketCount()) throw new RangeError(`Invalid pocket: ${pocket}`);
    this.rearrange();
    if (value <= this._pockets[pocket]!.length) this.lastPocketSelections[pocket] = value;
  }

  //=============================================================================

  quantity(item: Id | Item): number {
    const itemData = Item.tryGet(item);
    if (!itemData) return 0;
    const pocket = itemData.pocket;
    return ItemStorageHelper.quantity(this._pockets[pocket]!, itemData.id);
  }

  /** has?(item, qty = 1) */
  has(item: Id | Item, qty = 1): boolean {
    return this.quantity(item) >= qty;
  }

  /** can_remove? (alias of has?) */
  canRemove(item: Id | Item, qty = 1): boolean {
    return this.has(item, qty);
  }

  /** can_add?(item, qty = 1) — ZUD: Z-Crystals can always be added. */
  canAdd(item: Id | Item, qty = 1): boolean {
    if (Item.get(item).isZCrystal()) return true;
    const itemData = Item.tryGet(item);
    if (!itemData) return false;
    const pocket = itemData.pocket;
    let maxSize = this.maxPocketSize(pocket);
    if (maxSize < 0) maxSize = this._pockets[pocket]!.length + 1; // Infinite size
    return ItemStorageHelper.canAdd(this._pockets[pocket]!, maxSize, Settings.BAG_MAX_PER_SLOT, itemData.id, qty);
  }

  /** add(item, qty = 1): true if all were added. ZUD: a Z-Crystal already held isn't added again. */
  add(item: Id | Item, qty = 1): boolean {
    if (this.has(item, 1) && Item.get(item).isZCrystal()) qty = 0;
    const itemData = Item.tryGet(item);
    if (!itemData) return false;
    const pocket = itemData.pocket;
    let maxSize = this.maxPocketSize(pocket);
    if (maxSize < 0) maxSize = this._pockets[pocket]!.length + 1; // Infinite size
    const ret = ItemStorageHelper.add(this._pockets[pocket]!, maxSize, Settings.BAG_MAX_PER_SLOT, itemData.id, qty);
    if (ret && Settings.BAG_POCKET_AUTO_SORT[pocket - 1]) sortPocket(this._pockets[pocket]!);
    return ret;
  }

  /** Adds qty number of item. Doesn't add anything if it can't add all of them. */
  addAll(item: Id | Item, qty = 1): boolean {
    if (!this.canAdd(item, qty)) return false;
    return this.add(item, qty);
  }

  /** Deletes as many of item as possible (up to qty), and returns whether it managed to delete qty of them. */
  remove(item: Id | Item, qty = 1): boolean {
    const itemData = Item.tryGet(item);
    if (!itemData) return false;
    const pocket = itemData.pocket;
    return ItemStorageHelper.remove(this._pockets[pocket]!, itemData.id, qty);
  }

  /** Deletes qty number of item. Doesn't delete anything if there are less than qty of the item in the Bag. */
  removeAll(item: Id | Item, qty = 1): boolean {
    if (!this.canRemove(item, qty)) return false;
    return this.remove(item, qty);
  }

  /** Changes every instance of old_item to new_item. */
  replaceItem(oldItem: Id, newItem: Id): boolean {
    const oldItemData = Item.tryGet(oldItem);
    const newItemData = Item.tryGet(newItem);
    if (!oldItemData || !newItemData) return false;
    const pocket = oldItemData.pocket;
    const oldId = oldItemData.id;
    const newId = newItemData.id;
    let ret = false;
    for (const item of this._pockets[pocket]!) {
      if (!item || item[0] !== oldId) continue;
      item[0] = newId;
      ret = true;
    }
    return ret;
  }

  //=============================================================================

  /** Returns whether item has been registered for quick access in the Ready Menu. */
  registered(item: Id): boolean {
    const itemData = Item.tryGet(item);
    if (!itemData) return false;
    return this.registeredItems.includes(itemData.id);
  }

  /** Registers the item in the Ready Menu. */
  register(item: Id): void {
    const itemData = Item.tryGet(item);
    if (!itemData) return;
    if (!this.registeredItems.includes(itemData.id)) this.registeredItems.push(itemData.id);
  }

  /** Unregisters the item from the Ready Menu. */
  unregister(item: Id): void {
    const itemData = Item.tryGet(item);
    if (itemData) this.registeredItems = this.registeredItems.filter((i) => i !== itemData.id);
  }

  //=============================================================================
  // Deprecated v20 aliases (still used by old events)
  //=============================================================================
  pbQuantity(item: Id): number { return this.quantity(item); }
  pbHasItem(item: Id): boolean { return this.has(item); }
  pbCanStore(item: Id, quantity = 1): boolean { return this.canAdd(item, quantity); }
  pbStoreItem(item: Id, quantity = 1): boolean { return this.add(item, quantity); }
  pbStoreAllOrNone(item: Id, quantity = 1): boolean { return this.addAll(item, quantity); }
  pbChangeItem(oldItem: Id, newItem: Id): boolean { return this.replaceItem(oldItem, newItem); }
  pbDeleteItem(item: Id, quantity = 1): boolean { return this.remove(item, quantity); }
  pbIsRegistered(item: Id): boolean { return this.registered(item); }
  pbRegisterItem(item: Id): void { this.register(item); }
  pbUnregisterItem(item: Id): void { this.unregister(item); }

  //=============================================================================

  private maxPocketSize(pocket: number): number {
    return Settings.BAG_MAX_POCKET_SIZE[pocket - 1] ?? -1;
  }

  /** Puts items into the right pockets if the number of pockets changed (e.g. a plugin added one). */
  private rearrange(): void {
    if (this._pockets.length === PokemonBag.pocketCount() + 1) return;
    this.lastViewedPocket = 1;
    const newPockets: ItemSlot[][] = [];
    this.lastPocketSelections = [];
    for (let i = 0; i < PokemonBag.pocketCount() + 1; i++) {
      newPockets[i] = [];
      this.lastPocketSelections[i] = 0;
    }
    for (const pocket of this._pockets) {
      if (!pocket) continue;
      for (const item of pocket) {
        const itemPocket = Item.get(item[0]).pocket;
        newPockets[itemPocket]!.push(item);
      }
    }
    newPockets.forEach((pocket, i) => {
      if (i === 0 || !Settings.BAG_POCKET_AUTO_SORT[i - 1]) return;
      sortPocket(pocket);
    });
    this._pockets = newPockets;
  }

  toJSON(): PokemonBagJSON {
    return {
      pockets: this._pockets.map((p) => p.map((s) => [s[0], s[1]] as ItemSlot)),
      lastViewedPocket: this.lastViewedPocket,
      lastPocketSelections: [...this.lastPocketSelections],
      registeredItems: [...this.registeredItems],
      readyMenuSelection: [...this.readyMenuSelection],
    };
  }

  static fromJSON(json: PokemonBagJSON): PokemonBag {
    const b = Object.create(PokemonBag.prototype) as PokemonBag;
    b._pockets = json.pockets.map((p) => (p ?? []).map((s) => [s[0], s[1]] as ItemSlot));
    b.lastViewedPocket = json.lastViewedPocket;
    b.lastPocketSelections = [...json.lastPocketSelections];
    b.registeredItems = [...json.registeredItems];
    b.readyMenuSelection = [...json.readyMenuSelection];
    return b;
  }
}

/** Sorts a pocket by item definition order (GameData::Item.keys.index). */
function sortPocket(pocket: ItemSlot[]): void {
  const keys = Item.keys();
  const index = new Map(keys.map((k, i) => [k, i]));
  pocket.sort((a, b) => (index.get(a[0]) ?? -1) - (index.get(b[0]) ?? -1));
}

//===============================================================================
// The PC item storage object, which actually contains all the items
//===============================================================================
export class PCItemStorage {
  /** Number of different slots in storage. */
  static readonly MAX_SIZE = 999;
  /** Max. number of items per slot. */
  static readonly MAX_PER_SLOT = 999;

  items: ItemSlot[] = [];

  constructor() {
    this.items = [];
    // Start storage with initial items (e.g. a Potion)
    for (const item of Metadata.get().startItemStorage) if (Item.exists(item)) this.add(item);
  }

  /** self[i] */
  get(i: number): ItemSlot | undefined { return this.items[i]; }

  get length(): number { return this.items.length; }

  /** empty? */
  empty(): boolean { return this.items.length === 0; }

  clear(): void { this.items.length = 0; }

  getItem(index: number): Id | null {
    return index < 0 || index >= this.items.length ? null : this.items[index]![0];
  }

  getItemCount(index: number): number {
    return index < 0 || index >= this.items.length ? 0 : this.items[index]![1];
  }

  quantity(item: Id): number {
    return ItemStorageHelper.quantity(this.items, Item.get(item).id);
  }

  canAdd(item: Id, qty = 1): boolean {
    return ItemStorageHelper.canAdd(this.items, PCItemStorage.MAX_SIZE, PCItemStorage.MAX_PER_SLOT, Item.get(item).id, qty);
  }

  add(item: Id, qty = 1): boolean {
    return ItemStorageHelper.add(this.items, PCItemStorage.MAX_SIZE, PCItemStorage.MAX_PER_SLOT, Item.get(item).id, qty);
  }

  remove(item: Id, qty = 1): boolean {
    return ItemStorageHelper.remove(this.items, Item.get(item).id, qty);
  }

  toJSON(): { items: ItemSlot[] } {
    return { items: this.items.map((s) => [s[0], s[1]] as ItemSlot) };
  }

  static fromJSON(json: { items: ItemSlot[] }): PCItemStorage {
    const s = Object.create(PCItemStorage.prototype) as PCItemStorage;
    s.items = json.items.map((x) => [x[0], x[1]] as ItemSlot);
    return s;
  }
}

//===============================================================================
// Implements methods that act on arrays of items. Used by both the Bag and PC
// item storage.
//===============================================================================
export const ItemStorageHelper = {
  /** Returns the quantity of item in items. */
  quantity(items: (ItemSlot | null | undefined)[], item: Id): number {
    let ret = 0;
    for (const i of items) if (i && i[0] === item) ret += i[1];
    return ret;
  },

  /** can_add?(items, max_slots, max_per_slot, item, qty) */
  canAdd(items: (ItemSlot | null | undefined)[], maxSlots: number, maxPerSlot: number, item: Id, qty: number): boolean {
    if (qty < 0) throw new Error(`Invalid value for qty: ${qty}`);
    if (qty === 0) return true;
    for (let i = 0; i < maxSlots; i++) {
      const itemSlot = items[i];
      if (!itemSlot) {
        qty -= Math.min(qty, maxPerSlot);
        if (qty === 0) return true;
      } else if (itemSlot[0] === item && itemSlot[1] < maxPerSlot) {
        let newAmt = itemSlot[1];
        newAmt = Math.min(newAmt + qty, maxPerSlot);
        qty -= newAmt - itemSlot[1];
        if (qty === 0) return true;
      }
    }
    return false;
  },

  add(items: (ItemSlot | null | undefined)[], maxSlots: number, maxPerSlot: number, item: Id, qty: number): boolean {
    if (qty < 0) throw new Error(`Invalid value for qty: ${qty}`);
    if (qty === 0) return true;
    for (let i = 0; i < maxSlots; i++) {
      const itemSlot = items[i];
      if (!itemSlot) {
        items[i] = [item, Math.min(qty, maxPerSlot)];
        qty -= items[i]![1];
        if (qty === 0) return true;
      } else if (itemSlot[0] === item && itemSlot[1] < maxPerSlot) {
        let newAmt = itemSlot[1];
        newAmt = Math.min(newAmt + qty, maxPerSlot);
        qty -= newAmt - itemSlot[1];
        itemSlot[1] = newAmt;
        if (qty === 0) return true;
      }
    }
    return false;
  },

  /** Deletes an item (up to qty); returns whether all qty were deleted. Compacts the list. */
  remove(items: (ItemSlot | null | undefined)[], item: Id, qty: number): boolean {
    if (qty < 0) throw new Error(`Invalid value for qty: ${qty}`);
    if (qty === 0) return true;
    let ret = false;
    for (let i = 0; i < items.length; i++) {
      const itemSlot = items[i];
      if (!itemSlot || itemSlot[0] !== item) continue;
      const amount = Math.min(qty, itemSlot[1]);
      itemSlot[1] -= amount;
      qty -= amount;
      if (itemSlot[1] === 0) items[i] = null;
      if (qty > 0) continue;
      ret = true;
      break;
    }
    // compact!
    let w = 0;
    for (let r = 0; r < items.length; r++) if (items[r] != null) items[w++] = items[r];
    items.length = w;
    return ret;
  },
};
