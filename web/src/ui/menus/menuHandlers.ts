// Port of MenuHandlers (003_Game processing/006_Event_HandlerCollections.rb):
// named, ordered option lists that menus build themselves from. This game's
// pause menu (DP Pause Menu) doesn't use it; the Options screen does
// (:options_menu).

import { _INTL } from "../messageConfig";

export interface MenuHandlerHash {
  /** A string (passed through _INTL) or a proc returning the name. */
  name: string | (() => string);
  order?: number;
  condition?: (...args: unknown[]) => boolean;
  [key: string]: unknown;
}

const handlers = new Map<string, Map<string, MenuHandlerHash>>();

export const MenuHandlers = {
  add(menu: string, option: string, hash: MenuHandlerHash): void {
    if (!handlers.has(menu)) handlers.set(menu, new Map());
    handlers.get(menu)!.set(option, hash);
  },

  remove(menu: string, option: string): void {
    handlers.get(menu)?.delete(option);
  },

  clear(menu: string): void {
    handlers.get(menu)?.clear();
  },

  each(menu: string, block: (option: string, hash: MenuHandlerHash) => void): void {
    const options = handlers.get(menu);
    if (!options) return;
    for (const [option, hash] of options) block(option, hash);
  },

  /** Options sorted by "order" (else their position), skipping those whose "condition" fails. */
  eachAvailable(menu: string, ...args: unknown[]): [string, MenuHandlerHash, string][] {
    const options = handlers.get(menu);
    if (!options) return [];
    const keys = [...options.keys()];
    const sortedKeys = [...keys].sort(
      (a, b) => (options.get(a)!.order ?? keys.indexOf(a)) - (options.get(b)!.order ?? keys.indexOf(b)),
    );
    const ret: [string, MenuHandlerHash, string][] = [];
    for (const option of sortedKeys) {
      const hash = options.get(option)!;
      if (hash.condition && !hash.condition(...args)) continue;
      const name = typeof hash.name === "function" ? hash.name() : _INTL(hash.name);
      ret.push([option, hash, name]);
    }
    return ret;
  },

  call(menu: string, option: string, fn: string, ...args: unknown[]): unknown {
    const optionHash = handlers.get(menu)?.get(option);
    const f = optionHash?.[fn];
    if (typeof f !== "function") return null;
    return (f as (...a: unknown[]) => unknown)(...args);
  },
};
