// RGSS Input with mkxp-z's default RGSS1 key bindings, plus gamepads.
// State only changes when game code calls Input.update(), like RGSS.

const DOWN = 2, LEFT = 4, RIGHT = 6, UP = 8;
const A = 11, B = 12, C = 13, X = 14, Y = 15, Z = 16, L = 17, R = 18;
const SHIFT = 21, CTRL = 22, ALT = 23, F5 = 25, F6 = 26, F7 = 27, F8 = 28, F9 = 29;

const KEYS: Record<string, number[]> = {
  ArrowDown: [DOWN], ArrowLeft: [LEFT], ArrowRight: [RIGHT], ArrowUp: [UP],
  ShiftLeft: [SHIFT, A], ShiftRight: [SHIFT, A], ControlLeft: [CTRL], ControlRight: [CTRL],
  AltLeft: [ALT], AltRight: [ALT],
  Escape: [B], Numpad0: [B], KeyX: [B],
  Space: [C], Enter: [C], NumpadEnter: [C], KeyC: [C],
  KeyZ: [A], KeyA: [X], KeyS: [Y], KeyD: [Z], KeyQ: [L], KeyW: [R],
  F5: [F5], F6: [F6], F7: [F7], F8: [F8], F9: [F9],
};

// Standard gamepad layout.
const PAD: Record<number, number> = { 0: C, 1: B, 2: A, 3: X, 4: L, 5: R, 12: UP, 13: DOWN, 14: LEFT, 15: RIGHT };

/** Seconds before a held button starts repeating, and between repeats (15 and 4 frames at 40 fps). */
const REPEAT_START = 15 / 40;
const REPEAT_EVERY = 4 / 40;

const down = new Set<number>(); // raw state from events
/** Pressed since the last update(), so a tap shorter than a frame still counts once. */
const tapped = new Set<number>();
const pressedAt = new Map<number, number>(); // button -> order it was pressed (for dir4/dir8)
let order = 0;
let held = new Map<number, number>(); // button -> seconds held, as of the last update()
let prevHeld = new Map<number, number>();

// Tests import game logic without a browser.
if (typeof addEventListener !== "undefined") {
  addEventListener("keydown", (e) => {
    const buttons = KEYS[e.code];
    if (!buttons) return;
    e.preventDefault();
    for (const b of buttons) {
      if (!down.has(b)) pressedAt.set(b, ++order);
      down.add(b);
      tapped.add(b);
    }
  });
  addEventListener("keyup", (e) => {
    for (const b of KEYS[e.code] ?? []) down.delete(b);
  });
  addEventListener("blur", () => down.clear());
}

function padButtons(): Set<number> {
  const out = new Set<number>();
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    pad.buttons.forEach((btn, i) => {
      const b = PAD[i];
      if (b && btn.pressed) out.add(b);
    });
    const [ax = 0, ay = 0] = pad.axes;
    if (ax < -0.5) out.add(LEFT);
    if (ax > 0.5) out.add(RIGHT);
    if (ay < -0.5) out.add(UP);
    if (ay > 0.5) out.add(DOWN);
  }
  return out;
}

export const Input = {
  DOWN, LEFT, RIGHT, UP, A, B, C, X, Y, Z, L, R, SHIFT, CTRL, ALT, F5, F6, F7, F8, F9,
  // Essentials' names (001_Technical/004_Input.rb)
  USE: C, BACK: B, ACTION: A, JUMPUP: X, JUMPDOWN: Y, SPECIAL: Z, AUX1: L, AUX2: R,

  update(dt = 1 / 60): void {
    const now = new Set([...down, ...tapped, ...padButtons()]);
    tapped.clear();
    for (const b of now) if (!pressedAt.has(b)) pressedAt.set(b, ++order);
    prevHeld = held;
    held = new Map();
    for (const b of now) held.set(b, (prevHeld.get(b) ?? -dt) + dt);
    for (const b of pressedAt.keys()) if (!now.has(b)) pressedAt.delete(b);
  },

  press(b: number): boolean {
    return held.has(b);
  },

  trigger(b: number): boolean {
    return held.has(b) && !prevHeld.has(b);
  },

  release(b: number): boolean {
    return !held.has(b) && prevHeld.has(b);
  },

  repeat(b: number): boolean {
    const t = held.get(b);
    if (t === undefined) return false;
    if (!prevHeld.has(b)) return true;
    if (t < REPEAT_START) return false;
    const prev = prevHeld.get(b)!;
    return Math.floor((t - REPEAT_START) / REPEAT_EVERY) !== Math.floor((prev - REPEAT_START) / REPEAT_EVERY) || prev < REPEAT_START;
  },

  /** Seconds the button has been held (0 if not held). */
  timeHeld(b: number): number {
    return held.get(b) ?? 0;
  },

  /** Most recently pressed of the held arrow keys: 2/4/6/8, or 0. */
  dir4(): number {
    let best = 0, bestOrder = -1;
    for (const d of [DOWN, LEFT, RIGHT, UP]) {
      if (!held.has(d)) continue;
      const o = pressedAt.get(d) ?? 0;
      if (o > bestOrder) { best = d; bestOrder = o; }
    }
    return best;
  },

  dir8(): number {
    const v = (held.has(DOWN) ? 1 : 0) - (held.has(UP) ? 1 : 0);
    const h = (held.has(RIGHT) ? 1 : 0) - (held.has(LEFT) ? 1 : 0);
    if (v && h) return v > 0 ? (h > 0 ? 3 : 1) : h > 0 ? 9 : 7;
    return Input.dir4();
  },
};
