// Scene helpers from 007_Objects and windows/002_MessageConfig.rb:
// pbFadeOutIn and friends, sprite-hash colour fades, window activation.
// Fades last frame_rate * 0.4 frames, i.e. 0.4 s at any frame rate.

import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color } from "../rgss/types";
import { FRAME_RATE } from "../game/GameCharacter";
import { G } from "../game/globals";
import { pbUpdateSpriteHash } from "./messageConfig";


/** Anything in a scene's sprite hash. */
export interface HashItem {
  update?(): void;
  dispose?(): void;
  isDisposed?(): boolean;
  disposed?: boolean;
  visible?: boolean;
  color?: Color;
  active?: boolean;
}
export type SpriteHash = Record<string, HashItem | null | undefined>;

const FADE_FRAMES = Math.floor(FRAME_RATE * 0.4);
const ALPHA_DIFF = Math.ceil(255 / FADE_FRAMES);

function disposed(x: HashItem | null | undefined): boolean {
  if (!x) return true;
  if (typeof x.isDisposed === "function") return x.isDisposed();
  return !!x.disposed;
}

/** Window-like objects (Essentials checks is_a?(Window)). */
function isWindow(x: HashItem | null | undefined): x is HashItem & { active: boolean } {
  return !!x && typeof x.active === "boolean";
}

function gameTemp(): { fadestate?: number } | null {
  return (G.gameTemp as unknown as { fadestate?: number }) ?? null;
}

export function pbPushFade(): void {
  const t = gameTemp();
  if (t) t.fadestate = Math.max((t.fadestate ?? 0) + 1, 0);
}

export function pbPopFade(): void {
  const t = gameTemp();
  if (t) t.fadestate = Math.max((t.fadestate ?? 0) - 1, 0);
}

export function pbIsFaded(): boolean {
  return (gameTemp()?.fadestate ?? 0) > 0;
}

export function pbSrcOver(dst: Color, src: Color): Color {
  const er = Math.floor((src.red * src.alpha) / 255);
  const eg = Math.floor((src.green * src.alpha) / 255);
  const eb = Math.floor((src.blue * src.alpha) / 255);
  const iea = 255 - src.alpha;
  const cr = Math.floor((dst.red * dst.alpha) / 255);
  const cg = Math.floor((dst.green * dst.alpha) / 255);
  const cb = Math.floor((dst.blue * dst.alpha) / 255);
  const ica = 255 - dst.alpha;
  const a = 255 - Math.floor((iea * ica) / 255);
  let r = Math.floor((iea * cr) / 255) + er;
  let g = Math.floor((iea * cg) / 255) + eg;
  let b = Math.floor((iea * cb) / 255) + eb;
  r = a === 0 ? 0 : Math.floor((r * 255) / a);
  g = a === 0 ? 0 : Math.floor((g * 255) / a);
  b = a === 0 ? 0 : Math.floor((b * 255) / a);
  return new Color(r, g, b, a);
}

export async function pbSetSpritesToColor(sprites: SpriteHash, color: Color): Promise<void> {
  const colors: Record<string, Color> = {};
  for (const [k, s] of Object.entries(sprites)) {
    if (!s || disposed(s) || !s.color) continue;
    colors[k] = s.color.clone();
    s.color = pbSrcOver(s.color, color);
  }
  await Graphics.update();
  Input.update();
  for (const [k, c] of Object.entries(colors)) {
    const s = sprites[k];
    if (s) s.color = c;
  }
}

/** pbFadeOutIn { ... }: fade to black, run `block`, fade back in. */
export async function pbFadeOutIn<T>(block?: () => Promise<T> | T, z = 99999, nofadeout = false): Promise<T | undefined> {
  const col = new Color(0, 0, 0, 0);
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = z;
  for (let j = 0; j <= FADE_FRAMES; j++) {
    col.set(0, 0, 0, j * ALPHA_DIFF);
    viewport.color = col.clone();
    await Graphics.update();
    Input.update();
  }
  pbPushFade();
  let val: T | undefined;
  try {
    val = block ? await block() : undefined;
    if ((val as unknown) === 99999) nofadeout = true; // Ugly hack used by Town Map in the Bag/Pokégear
  } finally {
    pbPopFade();
    if (!nofadeout) {
      for (let j = 0; j <= FADE_FRAMES; j++) {
        col.set(0, 0, 0, (FADE_FRAMES - j) * ALPHA_DIFF);
        viewport.color = col.clone();
        await Graphics.update();
        Input.update();
      }
    }
    viewport.dispose();
  }
  return val;
}

/**
 * pbFadeOutInWithMusic { ... } (002_MessageConfig.rb): pbFadeOutIn that pauses
 * the map BGM/BGS (1 s fade) and resumes them where they were afterwards.
 */
export async function pbFadeOutInWithMusic<T>(block?: () => Promise<T> | T, z = 99999): Promise<void> {
  const sys = G.gameSystem;
  const playingBGS = sys.getPlayingBGS();
  const playingBGM = sys.getPlayingBGM();
  sys.bgmPause(1.0);
  sys.bgsPause(1.0);
  const pos = sys.bgmPosition;
  await pbFadeOutIn(async () => {
    if (block) await block();
    sys.bgmPosition = pos;
    sys.bgmResume(playingBGM);
    sys.bgsResume(playingBGS);
  }, z);
}

export async function pbFadeOutInWithUpdate<T>(z: number, sprites: SpriteHash, block?: () => Promise<T> | T, nofadeout = false): Promise<void> {
  const col = new Color(0, 0, 0, 0);
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = z;
  for (let j = 0; j <= FADE_FRAMES; j++) {
    col.set(0, 0, 0, j * ALPHA_DIFF);
    viewport.color = col.clone();
    pbUpdateSpriteHash(sprites as never);
    await Graphics.update();
    Input.update();
  }
  pbPushFade();
  try {
    if (block) await block();
  } finally {
    pbPopFade();
    if (!nofadeout) {
      for (let j = 0; j <= FADE_FRAMES; j++) {
        col.set(0, 0, 0, (FADE_FRAMES - j) * ALPHA_DIFF);
        viewport.color = col.clone();
        pbUpdateSpriteHash(sprites as never);
        await Graphics.update();
        Input.update();
      }
    }
    viewport.dispose();
  }
}

/** Fades the scene's sprites to black and hides them; returns which were visible. */
export async function pbFadeOutAndHide(sprites: SpriteHash, block?: () => void): Promise<Record<string, boolean>> {
  const visible: Record<string, boolean> = {};
  await pbDeactivateWindows(sprites, async () => {
    for (let j = 0; j <= FADE_FRAMES; j++) {
      await pbSetSpritesToColor(sprites, new Color(0, 0, 0, j * ALPHA_DIFF));
      block ? block() : pbUpdateSpriteHash(sprites as never);
    }
  });
  for (const [k, s] of Object.entries(sprites)) {
    if (!s || disposed(s)) continue;
    if (s.visible) visible[k] = true;
    s.visible = false;
  }
  return visible;
}

export async function pbFadeInAndShow(sprites: SpriteHash, visibleSprites: Record<string, boolean> | null = null, block?: () => void): Promise<void> {
  if (visibleSprites) {
    for (const k of Object.keys(visibleSprites)) {
      const s = sprites[k];
      if (visibleSprites[k] && s && !disposed(s)) s.visible = true;
    }
  }
  await pbDeactivateWindows(sprites, async () => {
    for (let j = 0; j <= FADE_FRAMES; j++) {
      await pbSetSpritesToColor(sprites, new Color(0, 0, 0, (FADE_FRAMES - j) * ALPHA_DIFF));
      block ? block() : pbUpdateSpriteHash(sprites as never);
    }
  });
}

export function pbRestoreActivations(sprites: SpriteHash, statuses: Record<string, boolean> | null): void {
  if (!statuses) return;
  for (const k of Object.keys(statuses)) {
    const s = sprites[k];
    if (isWindow(s) && !disposed(s)) s.active = !!statuses[k];
  }
}

export async function pbDeactivateWindows(sprites: SpriteHash, block?: () => Promise<void> | void): Promise<Record<string, boolean>> {
  return pbActivateWindow(sprites, null, block);
}

/** Activates only `key` (or none); with a block, restores the old states afterwards. */
export async function pbActivateWindow(sprites: SpriteHash, key: string | null, block?: () => Promise<void> | void): Promise<Record<string, boolean>> {
  const statuses: Record<string, boolean> = {};
  for (const [k, s] of Object.entries(sprites)) {
    if (isWindow(s) && !disposed(s)) {
      statuses[k] = s.active;
      s.active = k === key;
    }
  }
  if (block) {
    try {
      await block();
    } finally {
      pbRestoreActivations(sprites, statuses);
    }
  }
  return statuses;
}
