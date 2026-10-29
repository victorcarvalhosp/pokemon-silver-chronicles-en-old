// Port of 003_Game processing/005_Event_Handlers.rb: named hooks that
// Essentials and plugins register handlers on (on_step_taken,
// on_enter_map, on_frame_update, ...).

type Handler = (...args: unknown[]) => unknown;

const handlers = new Map<string, Map<string, Handler>>();

export const EventHandlers = {
  add(event: string, key: string, handler: Handler): void {
    if (!handlers.has(event)) handlers.set(event, new Map());
    handlers.get(event)!.set(key, handler);
  },

  remove(event: string, key: string): void {
    handlers.get(event)?.delete(key);
  },

  /** Calls every handler; handlers may be async and are awaited in order. */
  async trigger(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event)?.values() ?? []) await h(...args);
  },

  /** Synchronous variant for hooks that can't wait (called mid-update). */
  triggerSync(event: string, ...args: unknown[]): void {
    for (const h of handlers.get(event)?.values() ?? []) void h(...args);
  },

  /**
   * EventHandlers.trigger_2 (Following Pokemon EX, Compatibility.rb): the first
   * handler result that isn't nil (null/undefined), else -1; nil when nothing
   * was ever registered for the event.
   */
  async trigger2(event: string, ...args: unknown[]): Promise<unknown> {
    const hs = handlers.get(event);
    if (!hs) return null;
    for (const h of hs.values()) {
      const ret = await h(...args);
      if (ret != null) return ret;
    }
    return -1;
  },

  /** trigger_2 for handlers that don't wait. */
  trigger2Sync(event: string, ...args: unknown[]): unknown {
    const hs = handlers.get(event);
    if (!hs) return null;
    for (const h of hs.values()) {
      const ret = h(...args);
      if (ret != null) return ret;
    }
    return -1;
  },
};
