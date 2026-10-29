// Port of the ItemHandlers module (013_Items/001_Item_Utilities.rb) and the
// HandlerHash2 it's built on (003_Game processing/005_Event_Handlers.rb).
//
// Only the registry is here: the handlers themselves (002_Item_Effects.rb in
// Item_Effects.ts, 003_Item_BattleEffects.rb and the plugins in battle/items/)
// register themselves when web/src/battle/items/index.ts is imported (in Ruby's
// load order). The Bag, party and summary screens go through these functions.

import type { Id } from "../../data/gameData/gameData";
import type { Pokemon } from "../pokemon/Pokemon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (item: Id, ...args: any[]) => unknown;

/** HandlerHash2 (ItemHandlerHash): handlers by item ID, then addIf conditions in order. */
export class ItemHandlerHash<F extends Handler = Handler> {
  private hash = new Map<Id, F>();
  private addIfs: [(item: Id) => boolean, F][] = [];

  get(sym: Id | { id: Id } | null | undefined): F | null {
    const id = typeof sym === "object" && sym ? sym.id : sym;
    if (id && this.hash.has(id)) return this.hash.get(id)!;
    for (const [cond, handler] of this.addIfs) if (cond(id as Id)) return handler;
    return null;
  }

  add(sym: Id, handler: F): void {
    if (sym) this.hash.set(sym, handler);
  }

  addIf(condition: (item: Id) => boolean, handler: F): void {
    this.addIfs.push([condition, handler]);
  }

  copy(src: Id, ...dests: Id[]): void {
    const handler = this.get(src);
    if (!handler) return;
    for (const dest of dests) this.add(dest, handler);
  }

  remove(key: Id): void {
    this.hash.delete(key);
  }

  clear(): void {
    this.hash.clear();
  }

  trigger(sym: Id | { id: Id }, ...args: unknown[]): ReturnType<F> | null {
    const id = typeof sym === "object" ? sym.id : sym;
    const handler = this.get(id);
    return handler ? (handler as (...a: unknown[]) => ReturnType<F>)(id, ...args) : null;
  }
}

/** The scene/screen an item handler talks to (party screen, summary, ...). */
export type ItemScene = unknown;

type MaybePromise<T> = T | Promise<T>;

export const ItemHandlers = {
  UseText: new ItemHandlerHash<(item: Id) => string>(),
  /** Returns 0 (not used), 1 (used, keep Bag open), 2 (used, close Bag) or 99999. */
  UseFromBag: new ItemHandlerHash<(item: Id) => MaybePromise<number>>(),
  ConfirmUseInField: new ItemHandlerHash<(item: Id) => MaybePromise<boolean>>(),
  UseInField: new ItemHandlerHash<(item: Id) => MaybePromise<boolean>>(),
  UseOnPokemon: new ItemHandlerHash<(item: Id, qty: number, pkmn: Pokemon, scene: ItemScene) => MaybePromise<boolean>>(),
  UseOnPokemonMaximum: new ItemHandlerHash<(item: Id, pkmn: Pokemon) => number>(),
  CanUseInBattle: new ItemHandlerHash<(item: Id, ...args: any[]) => MaybePromise<boolean>>(),
  UseInBattle: new ItemHandlerHash<(item: Id, ...args: any[]) => unknown>(),
  BattleUseOnBattler: new ItemHandlerHash<(item: Id, ...args: any[]) => unknown>(),
  BattleUseOnPokemon: new ItemHandlerHash<(item: Id, ...args: any[]) => unknown>(),

  hasUseText(item: Id): boolean { return ItemHandlers.UseText.get(item) != null; },

  /** Shows "Use" option in Bag */
  hasOutHandler(item: Id): boolean {
    return ItemHandlers.UseFromBag.get(item) != null || ItemHandlers.UseInField.get(item) != null ||
      ItemHandlers.UseOnPokemon.get(item) != null;
  },

  /** Shows "Register" option in Bag */
  hasUseInFieldHandler(item: Id): boolean { return ItemHandlers.UseInField.get(item) != null; },
  hasUseOnPokemon(item: Id): boolean { return ItemHandlers.UseOnPokemon.get(item) != null; },
  hasUseOnPokemonMaximum(item: Id): boolean { return ItemHandlers.UseOnPokemonMaximum.get(item) != null; },
  hasUseInBattle(item: Id): boolean { return ItemHandlers.UseInBattle.get(item) != null; },
  hasBattleUseOnBattler(item: Id): boolean { return ItemHandlers.BattleUseOnBattler.get(item) != null; },
  hasBattleUseOnPokemon(item: Id): boolean { return ItemHandlers.BattleUseOnPokemon.get(item) != null; },

  /** Returns text to display instead of "Use" */
  getUseText(item: Id): string | null { return ItemHandlers.UseText.trigger(item); },

  /** 0 - Item not used; 1 - Item used, don't end screen; 2 - Item used, end screen */
  async triggerUseFromBag(item: Id): Promise<number> {
    if (ItemHandlers.UseFromBag.get(item)) return (await ItemHandlers.UseFromBag.trigger(item)) ?? 0;
    // No UseFromBag handler exists; check the UseInField handler if present
    if (ItemHandlers.UseInField.get(item)) return (await ItemHandlers.UseInField.trigger(item)) ? 1 : 0;
    return 0;
  },

  /** Returns whether item can be used */
  async triggerConfirmUseInField(item: Id): Promise<boolean> {
    if (!ItemHandlers.ConfirmUseInField.get(item)) return true;
    return !!(await ItemHandlers.ConfirmUseInField.trigger(item));
  },

  /** -1 - Item effect not found; 0 - Item not used; 1 - Item used */
  async triggerUseInField(item: Id): Promise<number> {
    if (!ItemHandlers.UseInField.get(item)) return -1;
    return (await ItemHandlers.UseInField.trigger(item)) ? 1 : 0;
  },

  /** Returns whether item was used */
  async triggerUseOnPokemon(item: Id, qty: number, pkmn: Pokemon, scene: ItemScene): Promise<boolean> {
    if (!ItemHandlers.UseOnPokemon.get(item)) return false;
    return !!(await ItemHandlers.UseOnPokemon.trigger(item, qty, pkmn, scene));
  },

  /** Returns the maximum number of the item that can be used on the Pokémon at once. */
  triggerUseOnPokemonMaximum(item: Id, pkmn: Pokemon): number {
    if (!ItemHandlers.UseOnPokemonMaximum.get(item)) return 1;
    if (!USE_MULTIPLE_STAT_ITEMS_AT_ONCE) return 1;
    return Math.max(ItemHandlers.UseOnPokemonMaximum.trigger(item, pkmn) ?? 1, 1);
  },
};

/** Settings::USE_MULTIPLE_STAT_ITEMS_AT_ONCE (MECHANICS_GENERATION >= 8) */
const USE_MULTIPLE_STAT_ITEMS_AT_ONCE = true;

/** pbCanRegisterItem?(item) */
export function pbCanRegisterItem(item: Id): boolean {
  return ItemHandlers.hasUseInFieldHandler(item);
}
