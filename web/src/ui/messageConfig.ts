// Port of 007_Objects and windows/002_MessageConfig.rb (plus the window skin
// lists from 001_Settings.rb). pbRepositionMessageWindow is overridden by
// Carmaniac's Speech Bubble in this game; see speechBubble.ts.

import { Data } from "../data/store";
import { G } from "../game/globals";
import { Bitmap, loadFonts } from "../rgss/Bitmap";
import { Graphics } from "../rgss/Graphics";
import { Color, Rect } from "../rgss/types";
import { colorToRgb32, fontExists, shadowc3tag, shadowctagFromColor } from "./drawText";
import { pbResolveBitmap, preloadBitmaps } from "./rpgCache";

/** The parts of Settings (001_Settings.rb) the window system reads. */
export const Settings = {
  SCREEN_WIDTH: 512,
  SCREEN_HEIGHT: 384,
  SPEECH_WINDOWSKINS: [
    "speech hgss 1", "speech hgss 2", "speech hgss 3", "speech hgss 4", "speech hgss 5",
    "speech hgss 6", "speech hgss 7", "speech hgss 8", "speech hgss 9", "speech hgss 10",
    "speech hgss 11", "speech hgss 12", "speech hgss 13", "speech hgss 14", "speech hgss 15",
    "speech hgss 16", "speech hgss 17", "speech hgss 18", "speech hgss 19", "speech hgss 20",
    "speech pl 18",
  ],
  MENU_WINDOWSKINS: Array.from({ length: 28 }, (_, i) => `choice ${i + 1}`),
};

let systemFrame: string | null = null;
let defaultTextSkin: string | null = null;
let textSpeed: number | null = null;
let systemFont: string | null = null;
let smallFont: string | null = null;
let narrowFont: string | null = null;

const nilOrEmpty = (s: string | null | undefined): boolean => !s;

export const MessageConfig = {
  LIGHT_TEXT_MAIN_COLOR: new Color(248, 248, 248),
  LIGHT_TEXT_SHADOW_COLOR: new Color(72, 80, 88),
  DARK_TEXT_MAIN_COLOR: new Color(80, 80, 88),
  DARK_TEXT_SHADOW_COLOR: new Color(160, 160, 168),
  FONT_NAME: "Power Green",
  FONT_SIZE: 27,
  FONT_Y_OFFSET: 8,
  SMALL_FONT_NAME: "Power Green Small",
  SMALL_FONT_SIZE: 21,
  SMALL_FONT_Y_OFFSET: 8,
  NARROW_FONT_NAME: "Power Green Narrow",
  NARROW_FONT_SIZE: 27,
  NARROW_FONT_Y_OFFSET: 8,
  // 0 = Pause cursor is displayed at end of text
  // 1 = Pause cursor is displayed at bottom right
  // 2 = Pause cursor is displayed at lower middle side
  CURSOR_POSITION: 1,
  WINDOW_OPACITY: 255,
  /** Can be positive to wait frames or negative to show multiple characters in a single frame. */
  TEXT_SPEED: null as number | null,
  // Carmaniac's Speech Bubble
  BUBBLETEXTBASE: new Color(248, 248, 248),
  BUBBLETEXTSHADOW: new Color(72, 80, 88),

  pbDefaultSystemFrame(): string {
    const name = Settings.MENU_WINDOWSKINS[G.pokemonSystem ? G.pokemonSystem.frame : 0] ?? "";
    return pbResolveBitmap("Graphics/Windowskins/" + name) ?? "";
  },

  pbDefaultSpeechFrame(): string {
    const name = Settings.SPEECH_WINDOWSKINS[G.pokemonSystem ? G.pokemonSystem.textskin : 0] ?? "";
    return pbResolveBitmap("Graphics/Windowskins/" + name) ?? "";
  },

  pbDefaultWindowskin(): string {
    let skin: string | null = Data.system ? Data.system.windowskinName : null;
    if (skin) skin = pbResolveBitmap("Graphics/Windowskins/" + skin) ?? "";
    if (nilOrEmpty(skin)) skin = pbResolveBitmap("Graphics/System/Window");
    if (nilOrEmpty(skin)) skin = pbResolveBitmap("Graphics/Windowskins/001-Blue01");
    return skin ?? "";
  },

  pbGetSystemFrame(): string {
    if (!systemFrame) {
      let skin = MessageConfig.pbDefaultSystemFrame();
      if (nilOrEmpty(skin)) skin = MessageConfig.pbDefaultWindowskin();
      systemFrame = skin || "";
    }
    return systemFrame;
  },

  pbGetSpeechFrame(): string {
    if (!defaultTextSkin) {
      let skin = MessageConfig.pbDefaultSpeechFrame();
      if (nilOrEmpty(skin)) skin = MessageConfig.pbDefaultWindowskin();
      defaultTextSkin = skin || "";
    }
    return defaultTextSkin;
  },

  pbSetSystemFrame(value: string): void {
    systemFrame = pbResolveBitmap(value) ?? "";
  },

  pbSetSpeechFrame(value: string): void {
    defaultTextSkin = pbResolveBitmap(value) ?? "";
  },

  //-----------------------------------------------------------------------------

  pbDefaultTextSpeed(): number {
    return MessageConfig.pbSettingToTextSpeed(G.pokemonSystem ? G.pokemonSystem.textspeed : null);
  },

  pbGetTextSpeed(): number {
    if (textSpeed === null) textSpeed = MessageConfig.pbDefaultTextSpeed();
    return textSpeed;
  },

  pbSetTextSpeed(value: number): void {
    textSpeed = value;
  },

  /** Frames per character at 40 fps (negative: characters per frame). */
  pbSettingToTextSpeed(speed: number | null): number {
    switch (speed) {
      case 0: return 2;
      case 1: return 1;
      case 2: return -2;
    }
    return MessageConfig.TEXT_SPEED ?? 1;
  },

  //-----------------------------------------------------------------------------

  pbDefaultSystemFontName(): string { return MessageConfig.pbTryFonts(MessageConfig.FONT_NAME); },
  pbDefaultSmallFontName(): string { return MessageConfig.pbTryFonts(MessageConfig.SMALL_FONT_NAME); },
  pbDefaultNarrowFontName(): string { return MessageConfig.pbTryFonts(MessageConfig.NARROW_FONT_NAME); },

  pbGetSystemFontName(): string {
    if (!systemFont) systemFont = MessageConfig.pbDefaultSystemFontName();
    return systemFont;
  },
  pbGetSmallFontName(): string {
    if (!smallFont) smallFont = MessageConfig.pbDefaultSmallFontName();
    return smallFont;
  },
  pbGetNarrowFontName(): string {
    if (!narrowFont) narrowFont = MessageConfig.pbDefaultNarrowFontName();
    return narrowFont;
  },

  pbSetSystemFontName(value: string): void {
    systemFont = MessageConfig.pbTryFonts(value);
    if (systemFont === "") systemFont = MessageConfig.pbDefaultSystemFontName();
  },
  pbSetSmallFontName(value: string): void {
    smallFont = MessageConfig.pbTryFonts(value);
    if (smallFont === "") smallFont = MessageConfig.pbDefaultSmallFontName();
  },
  pbSetNarrowFontName(value: string): void {
    narrowFont = MessageConfig.pbTryFonts(value);
    if (narrowFont === "") narrowFont = MessageConfig.pbDefaultNarrowFontName();
  },

  pbTryFonts(...args: (string | string[] | null | undefined)[]): string {
    for (const a of args) {
      if (!a) continue;
      if (typeof a === "string") {
        if (fontExists(a)) return a;
      } else {
        for (const aa of a) {
          const ret = MessageConfig.pbTryFonts(aa);
          if (ret !== "") return ret;
        }
      }
    }
    return "";
  },
};

/**
 * Not in Essentials: fetches what the window/message code reads synchronously
 * (fonts, every speech/menu frame, pause and cursor arrows, speech bubble
 * arrows). Call once at boot before showing any window.
 */
export async function initMessageSystem(): Promise<void> {
  const fontFiles = ["power green.ttf", "power green small.ttf", "power green narrow.ttf"];
  const missingFonts = fontFiles.filter((f) => !fontExists(f.replace(/\.ttf$/, "")));
  const skins = [...Settings.SPEECH_WINDOWSKINS, ...Settings.MENU_WINDOWSKINS, "frlgtextskin", "goldskin"];
  await Promise.all([
    loadFonts(missingFonts),
    preloadBitmaps([
      ...skins.map((s) => `Graphics/Windowskins/${s}`),
      Data.system?.windowskinName ? `Graphics/Windowskins/${Data.system.windowskinName}` : "Graphics/Windowskins/Windowskin",
      "Graphics/System/Window",
      "Graphics/Windowskins/001-Blue01",
      ...["pause", "selarrow", "selarrow_white", "uparrow", "downarrow", "Arrow1", "Arrow2", "Arrow3", "Arrow4"].map(
        (p) => `Graphics/Pictures/${p}`,
      ),
    ]),
  ]);
  // Frames chosen before the graphics were loaded resolve again now.
  systemFrame = null;
  defaultTextSkin = null;
  systemFont = smallFont = narrowFont = null;
}

//===============================================================================
// Position a window
//===============================================================================
export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pbBottomRight(window: WindowRect): void {
  window.x = Graphics.width - window.width;
  window.y = Graphics.height - window.height;
}

export function pbBottomLeft(window: WindowRect): void {
  window.x = 0;
  window.y = Graphics.height - window.height;
}

export function pbBottomLeftLines(window: WindowRect & { borderY?: number }, lines: number, width: number | null = null): void {
  window.x = 0;
  window.width = width ?? Graphics.width;
  window.height = (window.borderY ?? 32) + lines * 32;
  window.y = Graphics.height - window.height;
}

export function pbPositionFaceWindow(facewindow: WindowRect | null, msgwindow: WindowRect | null): void {
  if (!facewindow) return;
  if (msgwindow) {
    if (facewindow.height <= msgwindow.height) facewindow.y = msgwindow.y;
    else facewindow.y = msgwindow.y + msgwindow.height - facewindow.height;
    facewindow.x = Graphics.width - facewindow.width;
    msgwindow.x = 0;
    msgwindow.width = Graphics.width - facewindow.width;
  } else {
    if (facewindow.height > Graphics.height) facewindow.height = Graphics.height;
    facewindow.x = 0;
    facewindow.y = 0;
  }
}

export function pbPositionNearMsgWindow(cmdwindow: WindowRect | null, msgwindow: WindowRect | null, side: "left" | "right" | null): void {
  if (!cmdwindow) return;
  if (msgwindow) {
    const height = Math.min(cmdwindow.height, Graphics.height - msgwindow.height);
    if (cmdwindow.height !== height) cmdwindow.height = height;
    cmdwindow.y = msgwindow.y - cmdwindow.height;
    if (cmdwindow.y < 0) {
      cmdwindow.y = msgwindow.y + msgwindow.height;
      if (cmdwindow.y + cmdwindow.height > Graphics.height) cmdwindow.y = msgwindow.y - cmdwindow.height;
    }
    switch (side) {
      case "left": cmdwindow.x = msgwindow.x; break;
      case "right": cmdwindow.x = msgwindow.x + msgwindow.width - cmdwindow.width; break;
      default: cmdwindow.x = msgwindow.x + msgwindow.width - cmdwindow.width;
    }
  } else {
    if (cmdwindow.height > Graphics.height) cmdwindow.height = Graphics.height;
    cmdwindow.x = 0;
    cmdwindow.y = 0;
  }
}

/** internal function */
export function pbUpdateMsgWindowPos(
  msgwindow: WindowRect & { text: string; resizeToFit2(text: string, maxwidth: number, maxheight: number): void },
  event: { screenX(): number; screenY(): number } | null,
  eventChanged = false,
): void {
  if (event) {
    if (eventChanged) msgwindow.resizeToFit2(msgwindow.text, Math.floor((Graphics.width * 2) / 3), msgwindow.height);
    msgwindow.y = event.screenY() - 48 - msgwindow.height;
    if (msgwindow.y < 0) msgwindow.y = event.screenY() + 24;
    msgwindow.x = event.screenX() - Math.floor(msgwindow.width / 2);
    if (msgwindow.x < 0) msgwindow.x = 0;
    if (msgwindow.x > Graphics.width - msgwindow.width) msgwindow.x = Graphics.width - msgwindow.width;
  } else if (msgwindow.width !== Graphics.width) {
    msgwindow.width = Graphics.width;
  }
}

//===============================================================================
// Determine the colour of a background
//===============================================================================
const darkCache = new WeakMap<Bitmap, Map<string, boolean>>();

export function isDarkBackground(background: Bitmap | null, rect: Rect | null = null): boolean {
  if (!background || background.isDisposed()) return true;
  rect ??= background.rect();
  if (rect.width <= 0 || rect.height <= 0) return true;
  // Windowskins never change, so remember the answer (get_pixel is a GPU readback here).
  const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;
  let memo = darkCache.get(background);
  if (memo?.has(key)) return memo.get(key)!;
  const data = background.ctx.getImageData(0, 0, background.width, background.height).data;
  const pixel = (px: number, py: number) => {
    const i = (Math.floor(py) * background.width + Math.floor(px)) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0] as const;
  };
  const xSeg = Math.floor(rect.width / 16);
  const xLoop = xSeg === 0 ? 1 : 16;
  const xStart = xSeg === 0 ? rect.x + Math.floor(rect.width / 2) : rect.x + Math.floor(xSeg / 2);
  const ySeg = Math.floor(rect.height / 16);
  const yLoop = ySeg === 0 ? 1 : 16;
  const yStart = ySeg === 0 ? rect.y + Math.floor(rect.height / 2) : rect.y + Math.floor(ySeg / 2);
  let count = 0;
  let y = yStart;
  let r = 0, g = 0, b = 0;
  for (let j = 0; j < yLoop; j++) {
    let x = xStart;
    for (let i = 0; i < xLoop; i++) {
      const clr = pixel(x, y);
      if (clr[3] !== 0) {
        r += clr[0];
        g += clr[1];
        b += clr[2];
        count += 1;
      }
      x += xSeg;
    }
    y += ySeg;
  }
  let ret = true;
  if (count > 0) {
    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);
    ret = r * 0.299 + g * 0.587 + b * 0.114 < 160;
  }
  if (!memo) darkCache.set(background, (memo = new Map()));
  memo.set(key, ret);
  return ret;
}

export function isDarkWindowskin(windowskin: Bitmap | null): boolean {
  if (!windowskin || windowskin.isDisposed()) return true;
  if (windowskin.width === 192 && windowskin.height === 128) {
    return isDarkBackground(windowskin, new Rect(0, 0, 128, 128));
  } else if (windowskin.width === 128 && windowskin.height === 128) {
    return isDarkBackground(windowskin, new Rect(0, 0, 64, 64));
  } else if (windowskin.width === 96 && windowskin.height === 48) {
    return isDarkBackground(windowskin, new Rect(32, 16, 16, 16));
  }
  const clr = windowskin.getPixel(Math.floor(windowskin.width / 2), Math.floor(windowskin.height / 2));
  return clr.red * 0.299 + clr.green * 0.587 + clr.blue * 0.114 < 160;
}

//===============================================================================
// Determine which text colours to use based on the darkness of the background
//===============================================================================
export function getSkinColor(windowskin: Bitmap | null, color: number, isDarkSkin: boolean): string {
  if (!windowskin || windowskin.isDisposed() || windowskin.width !== 128 || windowskin.height !== 128) {
    // Base color, shadow color (these are reversed on dark windowskins)
    const textcolors = [
      "0070F8", "78B8E8", // 1  Blue
      "E82010", "F8A8B8", // 2  Red
      "60B048", "B0D090", // 3  Green
      "48D8D8", "A8E0E0", // 4  Cyan
      "D038B8", "E8A0E0", // 5  Magenta
      "E8D020", "F8E888", // 6  Yellow
      "A0A0A8", "D0D0D8", // 7  Grey
      "F0F0F8", "C8C8D0", // 8  White
      "9040E8", "B8A8E0", // 9  Purple
      "F89818", "F8C898", // 10 Orange
      colorToRgb32(MessageConfig.DARK_TEXT_MAIN_COLOR),
      colorToRgb32(MessageConfig.DARK_TEXT_SHADOW_COLOR), // 11 Dark default
      colorToRgb32(MessageConfig.LIGHT_TEXT_MAIN_COLOR),
      colorToRgb32(MessageConfig.LIGHT_TEXT_SHADOW_COLOR), // 12 Light default
    ];
    if (color === 0 || color > textcolors.length / 2) { // No special colour, use default
      if (isDarkSkin) { // Dark background, light text
        return shadowc3tag(MessageConfig.LIGHT_TEXT_MAIN_COLOR, MessageConfig.LIGHT_TEXT_SHADOW_COLOR);
      }
      // Light background, dark text
      return shadowc3tag(MessageConfig.DARK_TEXT_MAIN_COLOR, MessageConfig.DARK_TEXT_SHADOW_COLOR);
    }
    // Special colour as listed above
    if (isDarkSkin && color !== 12) { // Dark background, light text
      return `<c3=${textcolors[2 * (color - 1) + 1]},${textcolors[2 * (color - 1)]}>`;
    }
    // Light background, dark text
    return `<c3=${textcolors[2 * (color - 1)]},${textcolors[2 * (color - 1) + 1]}>`;
  }
  // VX windowskin
  if (color >= 32) color = 0;
  const x = 64 + (color % 8) * 8;
  const y = 96 + Math.floor(color / 8) * 8;
  return shadowctagFromColor(windowskin.getPixel(x, y));
}

export function getDefaultTextColors(windowskin: Bitmap | null): [Color, Color] {
  if (!windowskin || windowskin.isDisposed() || windowskin.width !== 128 || windowskin.height !== 128) {
    if (isDarkWindowskin(windowskin)) {
      return [MessageConfig.LIGHT_TEXT_MAIN_COLOR.clone(), MessageConfig.LIGHT_TEXT_SHADOW_COLOR.clone()]; // White
    }
    return [MessageConfig.DARK_TEXT_MAIN_COLOR.clone(), MessageConfig.DARK_TEXT_SHADOW_COLOR.clone()]; // Dark gray
  }
  // VX windowskin
  const color = windowskin.getPixel(64, 96);
  const isDark = (color.red + color.green + color.blue) / 3 < 128;
  const shadow = isDark
    ? new Color(color.red + 64, color.green + 64, color.blue + 64)
    : new Color(color.red - 64, color.green - 64, color.blue - 64);
  return [color, shadow];
}

//===============================================================================
// Makes sure a bitmap exists
//===============================================================================
export function pbDoEnsureBitmap(bitmap: Bitmap | null, dwidth: number, dheight: number): Bitmap {
  if (!bitmap || bitmap.isDisposed() || bitmap.width < dwidth || bitmap.height < dheight) {
    const oldfont = bitmap && !bitmap.isDisposed() ? bitmap.font : null;
    bitmap?.dispose();
    bitmap = new Bitmap(Math.max(1, dwidth), Math.max(1, dheight));
    // Like Ruby, only the font is carried over: text_offset_y resets to 0.
    if (oldfont) bitmap.font = oldfont.clone();
    else pbSetSystemFont(bitmap);
  }
  return bitmap;
}

//===============================================================================
// Set a bitmap's font
//===============================================================================
/** Sets a bitmap's font to the system font. */
export function pbSetSystemFont(bitmap: Bitmap): void {
  bitmap.font.name = MessageConfig.pbGetSystemFontName();
  bitmap.font.size = MessageConfig.FONT_SIZE;
  bitmap.textOffsetY = MessageConfig.FONT_Y_OFFSET;
}

/** Sets a bitmap's font to the system small font. */
export function pbSetSmallFont(bitmap: Bitmap): void {
  bitmap.font.name = MessageConfig.pbGetSmallFontName();
  bitmap.font.size = MessageConfig.SMALL_FONT_SIZE;
  bitmap.textOffsetY = MessageConfig.SMALL_FONT_Y_OFFSET;
}

/** Sets a bitmap's font to the system narrow font. */
export function pbSetNarrowFont(bitmap: Bitmap): void {
  bitmap.font.name = MessageConfig.pbGetNarrowFontName();
  bitmap.font.size = MessageConfig.NARROW_FONT_SIZE;
  bitmap.textOffsetY = MessageConfig.NARROW_FONT_Y_OFFSET;
}

//===============================================================================
// Blend colours
//===============================================================================
export function pbAlphaBlend(dstColor: Color, srcColor: Color): Color {
  const r = Math.floor((255 * (srcColor.red - dstColor.red)) / 255) + dstColor.red;
  const g = Math.floor((255 * (srcColor.green - dstColor.green)) / 255) + dstColor.green;
  const b = Math.floor((255 * (srcColor.blue - dstColor.blue)) / 255) + dstColor.blue;
  const a = Math.floor((255 * (srcColor.alpha - dstColor.alpha)) / 255) + dstColor.alpha;
  return new Color(r, g, b, a);
}

export function pbSrcOver(dstColor: Color, srcColor: Color): Color {
  const er = Math.floor((srcColor.red * srcColor.alpha) / 255);
  const eg = Math.floor((srcColor.green * srcColor.alpha) / 255);
  const eb = Math.floor((srcColor.blue * srcColor.alpha) / 255);
  const iea = 255 - srcColor.alpha;
  const cr = Math.floor((dstColor.red * dstColor.alpha) / 255);
  const cg = Math.floor((dstColor.green * dstColor.alpha) / 255);
  const cb = Math.floor((dstColor.blue * dstColor.alpha) / 255);
  const ica = 255 - dstColor.alpha;
  const a = 255 - Math.floor((iea * ica) / 255);
  let r = Math.floor((iea * cr) / 255) + er;
  let g = Math.floor((iea * cg) / 255) + eg;
  let b = Math.floor((iea * cb) / 255) + eb;
  r = a === 0 ? 0 : Math.floor((r * 255) / a);
  g = a === 0 ? 0 : Math.floor((g * 255) / a);
  b = a === 0 ? 0 : Math.floor((b * 255) / a);
  return new Color(r, g, b, a);
}

//===============================================================================
// Update and dispose sprite hashes
//===============================================================================
interface Updatable {
  update?(): void;
  dispose?(): void;
  isDisposed?(): boolean;
}

export function pbUpdateSpriteHash(windows: Record<string, Updatable | null | undefined>): void {
  for (const window of Object.values(windows)) {
    if (window && !window.isDisposed?.()) window.update?.();
  }
}

/** Disposes all objects in the specified hash. */
export function pbDisposeSpriteHash(sprites: Record<string, Updatable | null | undefined> | null): void {
  if (!sprites) return;
  for (const key of Object.keys(sprites)) pbDisposeSprite(sprites, key);
  for (const key of Object.keys(sprites)) delete sprites[key];
}

export function pbDisposeSprite(sprites: Record<string, Updatable | null | undefined>, id: string): void {
  const sprite = sprites[id];
  if (sprite && !sprite.isDisposed?.()) sprite.dispose?.();
  sprites[id] = null;
}

export function pbDisposed(x: { isDisposed(): boolean } | null | undefined): boolean {
  return !x || x.isDisposed();
}

/** _INTL (001_Technical/003_Intl_Messages.rb): the translated text, with {1}, {2}... filled in. */
export { _INTL } from "../core/intl";
