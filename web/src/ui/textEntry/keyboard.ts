// The keyboard half of mkxp-z's Input that RGSS buttons don't cover:
// Input.text_input / Input.gets (typed characters) and
// Input.triggerex? / Input.repeatex? (raw keys by name), which the free-typing
// text entry uses. rgss/Input.ts only maps keys to buttons, so this module
// listens to the browser keyboard itself.
//
// Like Input, state only changes on update(): call KeyboardInput.update()
// wherever Ruby calls Input.update in code that reads these.

/** mkxp-z key symbols -> KeyboardEvent.code */
const CODES: Record<string, string[]> = {
  LEFT: ["ArrowLeft"],
  RIGHT: ["ArrowRight"],
  UP: ["ArrowUp"],
  DOWN: ["ArrowDown"],
  BACKSPACE: ["Backspace"],
  DELETE: ["Delete"],
  RETURN: ["Enter", "NumpadEnter"],
  ESCAPE: ["Escape"],
  HOME: ["Home"],
  END: ["End"],
  TAB: ["Tab"],
  // Enhanced UI's battle windows (MOVE_INFO_KEY / BATTLE_INFO_KEY)
  M: ["KeyM"],
  N: ["KeyN"],
};

/** Same repeat timing as rgss/Input (15 and 4 frames at 40 fps). */
const REPEAT_START = 15 / 40;
const REPEAT_EVERY = 4 / 40;

const down = new Set<string>();
const tapped = new Set<string>();
let held = new Map<string, number>();
let prevHeld = new Map<string, number>();
let pendingText = "";
let text = "";
let textInput = false;

if (typeof addEventListener !== "undefined") {
  addEventListener("keydown", (e) => {
    down.add(e.code);
    tapped.add(e.code);
    if (!textInput || e.ctrlKey || e.metaKey || e.altKey) return;
    // Printable characters (e.key is the character for those, a name otherwise).
    if ([...e.key].length === 1) {
      pendingText += e.key;
      e.preventDefault();
    }
  });
  addEventListener("keyup", (e) => down.delete(e.code));
  addEventListener("blur", () => down.clear());
}

function heldTime(sym: string, map: Map<string, number>): number | undefined {
  let best: number | undefined;
  for (const code of CODES[sym] ?? []) {
    const t = map.get(code);
    if (t !== undefined && (best === undefined || t > best)) best = t;
  }
  return best;
}

export const KeyboardInput = {
  /** Input.text_input= : starts/stops collecting typed characters. */
  get textInput(): boolean {
    return textInput;
  },
  set textInput(value: boolean) {
    textInput = value;
    pendingText = "";
    text = "";
    // update() only runs while a text entry is open: forget presses from
    // before (mkxp-z has long since consumed them), and treat keys still held
    // as held, not as new presses.
    tapped.clear();
    held = new Map([...down].map((c) => [c, 0]));
    prevHeld = new Map(held);
  },

  update(dt = 1 / 60): void {
    const now = new Set([...down, ...tapped]);
    tapped.clear();
    prevHeld = held;
    held = new Map();
    for (const c of now) held.set(c, (prevHeld.get(c) ?? -dt) + dt);
    text = pendingText;
    pendingText = "";
  },

  /** Input.gets: the characters typed before the last update(). */
  gets(): string {
    const t = text;
    text = "";
    return t;
  },

  pressex(sym: string): boolean {
    return heldTime(sym, held) !== undefined;
  },

  triggerex(sym: string): boolean {
    return heldTime(sym, held) !== undefined && heldTime(sym, prevHeld) === undefined;
  },

  releaseex(sym: string): boolean {
    return heldTime(sym, held) === undefined && heldTime(sym, prevHeld) !== undefined;
  },

  repeatex(sym: string): boolean {
    const t = heldTime(sym, held);
    if (t === undefined) return false;
    const prev = heldTime(sym, prevHeld);
    if (prev === undefined) return true;
    if (t < REPEAT_START) return false;
    return prev < REPEAT_START || Math.floor((t - REPEAT_START) / REPEAT_EVERY) !== Math.floor((prev - REPEAT_START) / REPEAT_EVERY);
  },
};
