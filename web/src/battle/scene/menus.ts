// Port of Data/Scripts/011_Battle/004_Scene/005_Battle_Scene_Menus.rb:
// Battle::Scene::MenuBase, CommandMenu, FightMenu and TargetMenu (the
// USE_GRAPHICS = true versions, which this game uses), with:
//   00 v20.1 Hotfixes (Battle bug fixes.rb): FightMenu#refreshMoveData guard.
//   29 Essentials Deluxe ([000] Fight Menu.rb): the revamped FightMenu (one
//      "battle button" for Mega Evolution / Ultra Burst / Z-Moves / Dynamax,
//      short move names, refresh redraws the move names). PLA Battle Styles,
//      Terastal Phenomenon, Pokémon Birthsigns and Focus Meter aren't
//      installed, so their buttons don't exist; CUSTOM_MECH_BUTTON_PATH is "".
//   30 ZUD Mechanics: the cursor_ultra / cursor_zmove / cursor_dynamax buttons.

import type { Id } from "../../data/gameData/gameData";
import { Type } from "../../data/gameData/type";
import { Sprite, type Viewport } from "../../rgss/display";
import { Color } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../../ui/drawText";
import { _INTL, pbDisposeSpriteHash, pbSetNarrowFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { BitmapSprite, IconSprite } from "../../ui/SpriteWrapper";
import { Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import type { SceneBattler, SceneMove } from "./types";

/** Battle::Scene::MESSAGE_BASE_COLOR / MESSAGE_SHADOW_COLOR */
export const MESSAGE_BASE_COLOR = new Color(80, 80, 88);
export const MESSAGE_SHADOW_COLOR = new Color(160, 160, 168);

const SCREEN_W = 512;
const SCREEN_H = 384;
const MAX_MOVES = 4;

/** Anything a menu holds: sprites and windows. */
interface MenuItem {
  x: number;
  y: number;
  z: number;
  visible: boolean;
  color: Color;
  update(): void;
  dispose(): void;
  isDisposed(): boolean;
}

//===============================================================================
// Base class for all three menu classes below
//===============================================================================
export class MenuBase {
  /** NOTE: Button width is half the width of the graphic containing them all. */
  static readonly BUTTON_HEIGHT = 46;
  static readonly TEXT_BASE_COLOR = MESSAGE_BASE_COLOR;
  static readonly TEXT_SHADOW_COLOR = MESSAGE_SHADOW_COLOR;

  x = 0;
  y = 0;
  protected _z = 0;
  protected _visible = false;
  protected _color = new Color(0, 0, 0, 0);
  protected _index = 0;
  protected _mode = 0;
  protected disposed = false;
  protected sprites: Record<string, MenuItem> = {};
  protected visibility: Record<string, boolean> = {};

  constructor(_viewport: Viewport | null = null) {}

  dispose(): void {
    if (this.isDisposed()) return;
    pbDisposeSpriteHash(this.sprites as never);
    this.disposed = true;
  }

  isDisposed(): boolean { return this.disposed; }

  get z(): number { return this._z; }
  set z(value: number) {
    this._z = value;
    for (const s of Object.values(this.sprites)) if (s && !s.isDisposed()) s.z = value;
  }

  get visible(): boolean { return this._visible; }
  set visible(value: boolean) {
    this._visible = value;
    for (const [k, s] of Object.entries(this.sprites)) if (s && !s.isDisposed()) s.visible = value && !!this.visibility[k];
  }

  get color(): Color { return this._color; }
  set color(value: Color) {
    this._color = value;
    for (const s of Object.values(this.sprites)) if (s && !s.isDisposed()) s.color = value.clone();
  }

  get index(): number { return this._index; }
  set index(value: number) {
    const oldValue = this._index;
    this._index = value;
    if (this._index !== oldValue) this.refresh();
  }

  get mode(): number { return this._mode; }
  set mode(value: number) {
    const oldValue = this._mode;
    this._mode = value;
    if (this._mode !== oldValue) this.refresh();
  }

  addSprite(key: string, sprite: MenuItem): void {
    this.sprites[key] = sprite;
    this.visibility[key] = true;
  }

  setIndexAndMode(index: number, mode: number): void {
    const oldIndex = this._index;
    const oldMode = this._mode;
    this._index = index;
    this._mode = mode;
    if (this._index !== oldIndex || this._mode !== oldMode) this.refresh();
  }

  refresh(): void {}

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }
}

//===============================================================================
// Command menu (Fight/Pokémon/Bag/Run)
//===============================================================================
export class CommandMenu extends MenuBase {
  /** Lists of which button graphics to use in different situations/types of battle. */
  static readonly MODES = [
    [0, 2, 1, 3], // 0 = Regular battle
    [0, 2, 1, 9], // 1 = Regular battle with "Cancel" instead of "Run"
    [0, 2, 1, 4], // 2 = Regular battle with "Call" instead of "Run"
    [5, 7, 6, 3], // 3 = Safari Zone
    [0, 8, 1, 3], // 4 = Bug Catching Contest
  ];

  private msgBox: Window_UnformattedTextPokemon;
  private buttonBitmap: AnimatedBitmap;
  private buttons: Sprite[];

  constructor(viewport: Viewport | null, z: number) {
    super(viewport);
    this.x = 0;
    this.y = SCREEN_H - 96;
    // Create message box (shows "What will X do?")
    this.msgBox = Window_UnformattedTextPokemon.newWithSize("", this.x + 16, this.y + 2, 220, SCREEN_H - this.y, viewport);
    this.msgBox.baseColor = MenuBase.TEXT_BASE_COLOR;
    this.msgBox.shadowColor = MenuBase.TEXT_SHADOW_COLOR;
    this.msgBox.windowskin = null;
    this.addSprite("msgBox", this.msgBox as unknown as MenuItem);
    // Create background graphic
    const background = new IconSprite(this.x, this.y, viewport);
    background.setBitmapFile("Graphics/Pictures/Battle/overlay_command");
    this.addSprite("background", background);
    // Create bitmaps
    this.buttonBitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/Battle/cursor_command"));
    // Create action buttons
    this.buttons = [];
    for (let i = 0; i < 4; i++) { // 4 command options, therefore 4 buttons
      const button = new Sprite(viewport);
      button.setBitmap(this.buttonBitmap.bitmap);
      button.x = this.x + SCREEN_W - 260;
      button.x += i % 2 === 0 ? 0 : Math.floor(this.buttonBitmap.width / 2) - 4;
      button.y = this.y + 6;
      button.y += Math.floor(i / 2) === 0 ? 0 : MenuBase.BUTTON_HEIGHT - 4;
      button.srcRect.width = Math.floor(this.buttonBitmap.width / 2);
      button.srcRect.height = MenuBase.BUTTON_HEIGHT;
      this.addSprite(`button_${i}`, button);
      this.buttons.push(button);
    }
    this.z = z;
    this.refresh();
  }

  override dispose(): void {
    super.dispose();
    this.buttonBitmap.dispose();
  }

  override get z(): number { return super.z; }
  override set z(value: number) {
    super.z = value;
    this.msgBox.z += 1;
  }

  setTexts(value: string[]): void {
    this.msgBox.text = value[0] ?? "";
  }

  refreshButtons(): void {
    this.buttons.forEach((button, i) => {
      button.srcRect.x = i === this._index ? Math.floor(this.buttonBitmap.width / 2) : 0;
      button.srcRect.y = CommandMenu.MODES[this._mode]![i]! * MenuBase.BUTTON_HEIGHT;
      button.z = this.z + (i === this._index ? 3 : 2);
    });
  }

  override refresh(): void {
    this.msgBox.refresh();
    this.refreshButtons();
  }
}

//===============================================================================
// Fight menu (choose a move)
//===============================================================================
/** Essentials Deluxe's battle mechanic buttons. */
export type BattleButton = "none" | "mega" | "ultra" | "zmove" | "dynamax" | "style" | "tera" | "zodiac" | "custom";

export class FightMenu extends MenuBase {
  static readonly GET_MOVE_TEXT_COLOR_FROM_MOVE_BUTTON = true;
  static readonly TYPE_ICON_HEIGHT = 28;
  /** Text colours of PP of selected move */
  static readonly PP_COLORS = [
    new Color(248, 72, 72), new Color(136, 48, 48), // Red, zero PP
    new Color(248, 136, 32), new Color(144, 72, 24), // Orange, 1/4 of total PP or less
    new Color(248, 192, 0), new Color(144, 104, 0), // Yellow, 1/2 of total PP or less
    MenuBase.TEXT_BASE_COLOR, MenuBase.TEXT_SHADOW_COLOR, // Black, more than 1/2 of total PP
  ];

  private _battler: SceneBattler | null = null;
  private _shiftMode = 0;
  /** Focus Meter System (not installed) */
  focusMode = 0;
  /** PLA Battle Styles (not installed) */
  battleStyle = -1;
  /** Terastal Phenomenon (not installed) */
  teraType = -1;
  private _chosenButton: BattleButton = "none";
  private buttonBitmap: AnimatedBitmap;
  private typeBitmap: AnimatedBitmap;
  private shiftBitmap: AnimatedBitmap;
  private battleButtonBitmap: Partial<Record<BattleButton, AnimatedBitmap>> = {};
  private buttons: Sprite[];
  private overlay: BitmapSprite;
  private infoOverlay: BitmapSprite;
  private typeIcon: Sprite;
  private battleButton: Sprite;
  private shiftButton: Sprite;

  /** NOTE: @mode is for the display of the battle button: 0=don't show, 1=show unpressed, 2=show pressed */
  constructor(viewport: Viewport | null, z: number) {
    super(viewport);
    this.x = 0;
    this.y = SCREEN_H - 96;
    this.buttonBitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/Battle/cursor_fight"));
    this.typeBitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
    this.shiftBitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/Battle/cursor_shift"));
    this.battleButtonBitmap.mega = new AnimatedBitmap(_INTL("Graphics/Pictures/Battle/cursor_mega"));
    // ZUD Mechanics is installed
    const path = "Graphics/Plugins/ZUD/Battle/";
    this.battleButtonBitmap.ultra = new AnimatedBitmap(path + "cursor_ultra");
    this.battleButtonBitmap.zmove = new AnimatedBitmap(path + "cursor_zmove");
    this.battleButtonBitmap.dynamax = new AnimatedBitmap(path + "cursor_dynamax");
    this._chosenButton = "none";
    const background = new IconSprite(0, SCREEN_H - 96, viewport);
    background.setBitmapFile("Graphics/Pictures/Battle/overlay_fight");
    this.addSprite("background", background);
    this.buttons = [];
    for (let i = 0; i < MAX_MOVES; i++) {
      const button = new Sprite(viewport);
      button.setBitmap(this.buttonBitmap.bitmap);
      button.x = this.x + 4;
      button.x += i % 2 === 0 ? 0 : Math.floor(this.buttonBitmap.width / 2) - 4;
      button.y = this.y + 6;
      button.y += Math.floor(i / 2) === 0 ? 0 : MenuBase.BUTTON_HEIGHT - 4;
      button.srcRect.width = Math.floor(this.buttonBitmap.width / 2);
      button.srcRect.height = MenuBase.BUTTON_HEIGHT;
      this.addSprite(`button_${i}`, button);
      this.buttons.push(button);
    }
    this.overlay = new BitmapSprite(SCREEN_W, SCREEN_H - this.y, viewport);
    this.overlay.x = this.x;
    this.overlay.y = this.y;
    pbSetNarrowFont(this.overlay.bitmap!);
    this.addSprite("overlay", this.overlay);
    this.infoOverlay = new BitmapSprite(SCREEN_W, SCREEN_H - this.y, viewport);
    this.infoOverlay.x = this.x;
    this.infoOverlay.y = this.y;
    pbSetNarrowFont(this.infoOverlay.bitmap!);
    this.addSprite("infoOverlay", this.infoOverlay);
    this.typeIcon = new Sprite(viewport);
    this.typeIcon.setBitmap(this.typeBitmap.bitmap);
    this.typeIcon.x = this.x + 416;
    this.typeIcon.y = this.y + 20;
    this.typeIcon.srcRect.height = FightMenu.TYPE_ICON_HEIGHT;
    this.addSprite("typeIcon", this.typeIcon);
    this.battleButton = new Sprite(viewport); // For button graphic
    this.addSprite("battleButton", this.battleButton);
    this.shiftButton = new Sprite(viewport);
    this.shiftButton.setBitmap(this.shiftBitmap.bitmap);
    this.shiftButton.x = this.x + 4;
    this.shiftButton.y = this.y - this.shiftBitmap.height;
    this.addSprite("shiftButton", this.shiftButton);
    this.z = z;
  }

  override dispose(): void {
    super.dispose();
    this.buttonBitmap.dispose();
    this.typeBitmap.dispose();
    for (const bmp of Object.values(this.battleButtonBitmap)) bmp?.dispose();
    this.shiftBitmap.dispose();
  }

  override get z(): number { return super.z; }
  override set z(value: number) {
    super.z = value;
    this.overlay.z += 5;
    this.infoOverlay.z += 6;
    this.typeIcon.z += 1;
  }

  get battler(): SceneBattler | null { return this._battler; }
  set battler(value: SceneBattler | null) {
    this._battler = value;
    this.refresh();
    this.refreshButtonNames();
  }

  get shiftMode(): number { return this._shiftMode; }
  set shiftMode(value: number) {
    const oldValue = this._shiftMode;
    this._shiftMode = value;
    if (this._shiftMode !== oldValue) this.refreshShiftButton();
  }

  get chosenButton(): BattleButton { return this._chosenButton; }
  set chosenButton(value: BattleButton) {
    const oldValue = this._chosenButton;
    this._chosenButton = value;
    if (this._chosenButton !== oldValue) this.refresh();
  }

  private moves(): (SceneMove | null)[] {
    return this._battler ? this._battler.moves : [];
  }

  refreshBattleButton(): void {
    if (this._chosenButton === "none") {
      this.visibility.battleButton = false;
      return;
    }
    const bmp = this.battleButtonBitmap[this._chosenButton]!;
    if (this.battleButton.bitmap !== bmp.bitmap) this.battleButton.setBitmap(bmp.bitmap);
    // (:style and :tera rows are for plugins that aren't installed.)
    this.battleButton.y = this.y - Math.floor(bmp.height / 2);
    this.battleButton.srcRect.height = Math.floor(bmp.height / 2);
    this.battleButton.srcRect.y = Math.floor(((this._mode - 1) * bmp.height) / 2);
    this.battleButton.x = this.x + (this._shiftMode > 0 ? 204 : 120);
    this.battleButton.z = this.z - 1;
    this.visibility.battleButton = this._mode > 0;
  }

  refreshButtonNames(): void {
    const moves = this.moves();
    this.overlay.bitmap!.clear();
    const textPos: TextPosition[] = [];
    const imagePos: ImagePosition[] = [];
    this.buttons.forEach((button, i) => {
      if (!this.visibility[`button_${i}`]) return;
      const move = moves[i]!;
      const x = button.x - this.x + Math.floor(button.srcRect.width / 2);
      const y = button.y - this.y + 14;
      let moveNameBase = MenuBase.TEXT_BASE_COLOR;
      if (FightMenu.GET_MOVE_TEXT_COLOR_FROM_MOVE_BUTTON && move.displayType(this._battler!)) {
        // NOTE: This takes a color from a particular pixel in the button
        //       graphic and makes the move name's base color that same color.
        //       The pixel is at coordinates 10,34 in the button box. If you
        //       change the graphic, you may want to change the below line of
        //       code to ensure the font is an appropriate color.
        moveNameBase = button.bitmap!.getPixel(10, button.srcRect.y + 34);
      }
      textPos.push([move.shortName ?? move.name, x, y, 2, moveNameBase, MenuBase.TEXT_SHADOW_COLOR]);
    });
    pbDrawTextPositions(this.overlay.bitmap!, textPos);
    pbDrawImagePositions(this.overlay.bitmap!, imagePos);
  }

  refreshSelection(): void {
    const moves = this.moves();
    // Choose appropriate button graphics and z positions
    this.buttons.forEach((button, i) => {
      const move = moves[i];
      if (!move) {
        this.visibility[`button_${i}`] = false;
        return;
      }
      this.visibility[`button_${i}`] = true;
      button.srcRect.x = i === this._index ? Math.floor(this.buttonBitmap.width / 2) : 0;
      button.srcRect.y = Type.get(move.displayType(this._battler!) as Id).iconPosition * MenuBase.BUTTON_HEIGHT;
      button.z = this.z + (i === this._index ? 4 : 3);
    });
    this.refreshMoveData(moves[this._index] ?? null);
  }

  refreshMoveData(move: SceneMove | null): void {
    // Write PP and type of the selected move
    this.infoOverlay.bitmap!.clear();
    if (!move) {
      this.visibility.typeIcon = false;
      return;
    }
    this.visibility.typeIcon = true;
    // Type icon
    const typeNumber = Type.get(move.displayType(this._battler!) as Id).iconPosition;
    this.typeIcon.srcRect.y = typeNumber * FightMenu.TYPE_ICON_HEIGHT;
    // PP text
    if (move.totalPp() > 0) {
      const ppFraction = Math.min(Math.ceil((4.0 * move.pp) / move.totalPp()), 3);
      const textPos: TextPosition[] = [];
      textPos.push([_INTL("PP: {1}/{2}", move.pp, move.totalPp()),
        448, 56, 2, FightMenu.PP_COLORS[ppFraction * 2]!, FightMenu.PP_COLORS[ppFraction * 2 + 1]!]);
      pbDrawTextPositions(this.infoOverlay.bitmap!, textPos);
    }
  }

  refreshShiftButton(): void {
    this.shiftButton.srcRect.y = (this._shiftMode - 1) * this.shiftBitmap.height;
    this.shiftButton.z = this.z - 1;
    this.visibility.shiftButton = this._shiftMode > 0;
  }

  /** Essentials Deluxe's refresh (also redraws the move names). */
  override refresh(): void {
    if (!this._battler) return;
    this.refreshSelection();
    this.refreshBattleButton();
    this.refreshShiftButton();
    this.refreshButtonNames();
  }
}

//===============================================================================
// Target menu (choose a move's target)
// NOTE: Unlike the command and fight menus, this one doesn't have a textbox-only
//       version.
//===============================================================================
export class TargetMenu extends MenuBase {
  /** Lists of which button graphics to use in different situations/types of battle. */
  static readonly MODES = CommandMenu.MODES;
  static readonly CMD_BUTTON_WIDTH_SMALL = 170;
  static override readonly TEXT_BASE_COLOR = new Color(240, 248, 224);
  static override readonly TEXT_SHADOW_COLOR = new Color(64, 64, 64);

  private sideSizes: number[];
  private smallButtons: boolean;
  private texts: (string | null)[] = [];
  private buttonBitmap: AnimatedBitmap;
  private buttons: (Sprite | null)[];
  private overlay: BitmapSprite;

  /** NOTE: @mode is for which buttons are shown as selected: 0=select 1 button (@index), 1=select all buttons with text */
  constructor(viewport: Viewport | null, z: number, sideSizes: number[]) {
    super(viewport);
    this.sideSizes = sideSizes;
    const maxIndex = this.sideSizes[0]! > this.sideSizes[1]! ? (this.sideSizes[0]! - 1) * 2 : this.sideSizes[1]! * 2 - 1;
    this.smallButtons = Math.max(...this.sideSizes) > 2;
    this.x = 0;
    this.y = SCREEN_H - 96;
    this.buttonBitmap = new AnimatedBitmap("Graphics/Pictures/Battle/cursor_target");
    // Create target buttons
    this.buttons = [];
    for (let i = 0; i <= maxIndex; i++) {
      const numButtons = this.sideSizes[i % 2]!;
      if (numButtons <= Math.floor(i / 2)) {
        this.buttons.push(null);
        continue;
      }
      // NOTE: Battler indices go from left to right from the perspective of
      //       that side's trainer, so inc is different for each side for the
      //       same value of i/2.
      const inc = i % 2 === 0 ? Math.floor(i / 2) : numButtons - 1 - Math.floor(i / 2);
      const button = new Sprite(viewport);
      button.setBitmap(this.buttonBitmap.bitmap);
      button.srcRect.width = this.smallButtons ? TargetMenu.CMD_BUTTON_WIDTH_SMALL : Math.floor(this.buttonBitmap.width / 2);
      button.srcRect.height = MenuBase.BUTTON_HEIGHT;
      if (this.smallButtons) {
        button.x = this.x + 170 - [0, 82, 166][numButtons - 1]!;
      } else {
        button.x = this.x + 138 - [0, 116][numButtons - 1]!;
      }
      button.x += (button.srcRect.width - 4) * inc;
      button.y = this.y + 6;
      button.y += (MenuBase.BUTTON_HEIGHT - 4) * ((i + 1) % 2);
      this.addSprite(`button_${i}`, button);
      this.buttons.push(button);
    }
    // Create overlay (shows target names)
    this.overlay = new BitmapSprite(SCREEN_W, SCREEN_H - this.y, viewport);
    this.overlay.x = this.x;
    this.overlay.y = this.y;
    pbSetNarrowFont(this.overlay.bitmap!);
    this.addSprite("overlay", this.overlay);
    this.z = z;
    this.refresh();
  }

  override dispose(): void {
    super.dispose();
    this.buttonBitmap.dispose();
  }

  override get z(): number { return super.z; }
  override set z(value: number) {
    super.z = value;
    this.overlay.z += 5;
  }

  /** attr_accessor :mode (no refresh) */
  override get mode(): number { return this._mode; }
  override set mode(value: number) { this._mode = value; }

  setDetails(texts: (string | null)[], mode: number): void {
    this.texts = texts;
    this._mode = mode;
    this.refresh();
  }

  refreshButtons(): void {
    // Choose appropriate button graphics and z positions
    this.buttons.forEach((button, i) => {
      if (!button) return;
      let sel = false;
      let buttonType = 0;
      if (this.texts[i] != null) {
        sel ||= this._mode === 0 && i === this._index;
        sel ||= this._mode === 1;
        buttonType = i % 2 === 0 ? 1 : 2;
      }
      buttonType = 2 * buttonType + (this.smallButtons ? 1 : 0);
      button.srcRect.x = sel ? Math.floor(this.buttonBitmap.width / 2) : 0;
      button.srcRect.y = buttonType * MenuBase.BUTTON_HEIGHT;
      button.z = this.z + (sel ? 3 : 2);
    });
    // Draw target names onto overlay
    this.overlay.bitmap!.clear();
    const textpos: TextPosition[] = [];
    this.buttons.forEach((button, i) => {
      const text = this.texts[i];
      if (!button || !text) return;
      const x = button.x - this.x + Math.floor(button.srcRect.width / 2);
      const y = button.y - this.y + 14;
      textpos.push([text, x, y, 2, TargetMenu.TEXT_BASE_COLOR, TargetMenu.TEXT_SHADOW_COLOR]);
    });
    pbDrawTextPositions(this.overlay.bitmap!, textpos);
  }

  override refresh(): void {
    this.refreshButtons();
  }
}

/** Images the menus draw (for preloading). */
export const MENU_GRAPHICS: string[] = [
  "Graphics/Pictures/Battle/overlay_command", "Graphics/Pictures/Battle/cursor_command",
  "Graphics/Pictures/Battle/overlay_fight", "Graphics/Pictures/Battle/cursor_fight", "Graphics/Pictures/types",
  "Graphics/Pictures/Battle/cursor_shift", "Graphics/Pictures/Battle/cursor_mega",
  "Graphics/Plugins/ZUD/Battle/cursor_ultra", "Graphics/Plugins/ZUD/Battle/cursor_zmove", "Graphics/Plugins/ZUD/Battle/cursor_dynamax",
  "Graphics/Pictures/Battle/cursor_target",
];
