// Port of Plugins/Unown Report/Unown_Report_Mechanic.rb (Richard PT):
// UnownreportButton and Scene_Unownreport, the Unown Report key item's
// screen. It lists one page per Unown form seen in the Pokédex (any gender,
// any sprite set Essentials Deluxe's seen_form? checks), in alphabet order,
// as a scrolling column of buttons driven by an invisible command window.
// Pages are "unlocked" only by that Pokédex data: the plugin stores nothing.
//
// Scene_Unownreport is a $scene (Scene_Map's main loop ends when $scene
// changes, then main.ts runs this one's main), as in Ruby: the item handler
// sets G.scene (ItemUnownReport.ts) and BACK sets it to a new Scene_Map.
//
// NOTE (Ruby parity): USE does nothing (update_command's `if` for Anger has
// an empty body, Unown_Report_Mechanic.rb:214-216), so a page can't be
// opened. The unused viewport2 and @button (:148-150) aren't recreated.

import { _INTL } from "../../core/intl";
import { pbPlayCancelSE } from "../../game/GameSystem";
import { G } from "../../game/globals";
import type { Player } from "../../game/trainer/Player";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { SceneMap } from "../../scenes/SceneMap";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { type ImagePosition, pbDrawImagePositions, pbDrawTextPositions, type TextPosition } from "../../ui/drawText";
import { pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { pbResolveBitmap, preloadBitmaps } from "../../ui/rpgCache";
import { IconSprite } from "../../ui/SpriteWrapper";
import { Window_CommandPokemon } from "../../ui/windows/SpriteWindowText";

const DIR = "Graphics/Pictures/UnownReport/";

/** The pages in Unown form order (form 0 = A ... 25 = Z, 26 = ?, 27 = !). */
export const UNOWN_REPORT_PAGES = [
  "Anger", "Bear", "Chase", "Direct", "Engage", "Find", "Give", "Help", "Increase", "Join", "Keep", "Laugh", "Make",
  "Nuzzle", "Observe", "Perform", "Quicken", "Reassure", "Search", "Tell", "Undo", "Vanish", "Want", "XXXXX", "Yield",
  "Zoom", "?????", "!!!!!",
] as const;

/** The icon file for a page: "?????" and "!!!!!" use unownreport1 / unownreport2. */
export function unownReportIcon(name: string): string {
  let iconName = name;
  if (iconName === _INTL("?????")) iconName = "1";
  if (iconName === _INTL("!!!!!")) iconName = "2";
  return `${DIR}unownreport` + iconName;
}

export class UnownreportButton extends Sprite {
  readonly index: number;
  readonly name: string;
  selected = false;
  private button: AnimatedBitmap;
  private contents: Bitmap;

  constructor(x: number, y: number, name = "", index = 0, viewport: Viewport | null = null) {
    super(viewport);
    this.index = index;
    this.name = name;
    this.selected = false;

    this.button = new AnimatedBitmap(`${DIR}unownreportButton`);
    this.contents = new Bitmap(this.button.width, this.button.height);
    this.setBitmap(this.contents);
    this.x = x;
    this.y = y;
    this.refresh();
    this.update();
  }

  override dispose(): void {
    this.button.dispose();
    this.contents.dispose();
    super.dispose();
  }

  /** What refresh draws: the name and the icon on both halves (unselected, selected). */
  static drawPositions(name: string, width: number): { textpos: TextPosition[]; imagepos: ImagePosition[] } {
    const base = new Color(248, 248, 248);
    const shadow = new Color(40, 40, 40);
    const icon = unownReportIcon(name);
    return {
      textpos: [ // Name is written on both unselected and selected buttons
        [name, Math.floor(width / 2), 10, 2, base, shadow],
        [name, Math.floor(width / 2), 62, 2, base, shadow],
      ],
      imagepos: [ // Icon is put on both unselected and selected buttons
        [icon, 18, 10, 0, 0, -1, -1],
        [icon, 18, 62, 0, 0, -1, -1],
      ],
    };
  }

  refresh(): void {
    const bitmap = this.bitmap!;
    bitmap.clear();
    bitmap.blt(0, 0, this.button.bitmap, new Rect(0, 0, this.button.width, this.button.height));
    pbSetSystemFont(bitmap);
    const { textpos, imagepos } = UnownreportButton.drawPositions(this.name, bitmap.width);
    pbDrawTextPositions(bitmap, textpos);
    pbDrawImagePositions(bitmap, imagepos);
  }

  override update(dt?: number): void {
    const half = Math.floor(this.bitmap!.height / 2);
    if (this.selected) {
      this.srcRect.set(0, half, this.bitmap!.width, half);
    } else {
      this.srcRect.set(0, 0, this.bitmap!.width, half);
    }
    super.update(dt);
  }
}

/**
 * Scene_Unownreport#update's placement of button i: its row on screen
 * (1-5 are shown, at y = 24 + row * 48), with the cursor kept on the middle
 * row except near the ends of the list.
 */
export function unownReportButtonRow(i: number, windowsIndex: number, windowsLength: number, optionsSize = 2): { visible: boolean; y: number } {
  let screenIndex = i - windowsIndex + optionsSize + 1;
  if (windowsIndex < optionsSize) screenIndex += windowsIndex - optionsSize;
  if (windowsLength - windowsIndex <= optionsSize) {
    screenIndex += 1 + optionsSize - (windowsLength - windowsIndex);
  }
  const visible = 0 < screenIndex && screenIndex < (optionsSize + 1) * 2;
  return { visible, y: 24 + screenIndex * 48 };
}

//===============================================================================
// - Scene_Unownreport
//-------------------------------------------------------------------------------
// Modified By Richard PT
//===============================================================================
export class Scene_Unownreport {
  private menuIndex: number;
  /** @cmdAnger ... @cmd2: each page's index in the list, -1 if not listed. */
  readonly cmd: Record<string, number> = {};
  private viewport: Viewport | null = null;
  sprites: Record<string, Sprite | Window_CommandPokemon> = {};

  /** initialize */
  constructor(menuIndex = 0) {
    this.menuIndex = menuIndex;
  }

  seenUnownFormAnyGender(form: number): boolean {
    const dex = (G.player as unknown as Player).pokedex;
    return dex.seenForm("UNOWN", 0, form) || dex.seenForm("UNOWN", 1, form);
  }

  /** The commands main lists (OPTIONS: one per seen form), setting @cmd... */
  buildCommands(): string[] {
    const commands: string[] = [];
    for (const name of UNOWN_REPORT_PAGES) this.cmd[name] = -1;
    UNOWN_REPORT_PAGES.forEach((name, form) => {
      if (!this.seenUnownFormAnyGender(form)) return;
      this.cmd[name] = commands.length;
      commands.push(_INTL(name));
    });
    return commands;
  }

  private commandWindow(): Window_CommandPokemon {
    return this.sprites["command_window"] as Window_CommandPokemon;
  }

  /** main */
  async main(): Promise<void> {
    const commands = this.buildCommands();
    const female = (G.player as unknown as Player).gender === 1;
    await preloadBitmaps([`${DIR}unownreportbg`, `${DIR}unownreportbgf`, `${DIR}unownreportButton`, ...commands.map(unownReportIcon)]);

    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const background = new IconSprite(0, 0);
    this.sprites["background"] = background;
    const femback = pbResolveBitmap(`${DIR}unownreportbgf`);
    if (female && femback) { // ($Trainer.gender: $Trainer is $player)
      background.setBitmapFile(`${DIR}unownreportbgf`);
    } else {
      background.setBitmapFile(`${DIR}unownreportbg`);
    }
    const win = new Window_CommandPokemon(commands, 160);
    this.sprites["command_window"] = win;
    win.visible = false;
    win.index = this.menuIndex;
    for (let i = 0; i < commands.length; i++) {
      const button = new UnownreportButton(42, 0, commands[i], i, this.viewport);
      this.sprites[`button${i}`] = button;
      button.visible = false;
      button.update();
    }
    await Graphics.transition();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.update();
      if (G.scene !== (this as unknown)) break;
    }
    Graphics.freeze();
    pbDisposeSpriteHash(this.sprites as never);
    // (Ruby never disposes @viewport; nothing is left in it.)
    this.viewport.dispose();
  }

  /** update the scene */
  update(): void {
    const win = this.commandWindow();
    const windowsLength = win.commands.length;
    const optionsSize = 2; // Number of lines above mid
    for (let i = 0; i < windowsLength; i++) {
      const sprite = this.sprites[`button${i}`] as UnownreportButton;
      const windowsIndex = win.index;
      const { visible, y } = unownReportButtonRow(i, windowsIndex, windowsLength, optionsSize);
      if (visible) sprite.y = y;
      sprite.visible = visible;
      sprite.selected = i === windowsIndex;
    }
    pbUpdateSpriteHash(this.sprites as never);
    // update command window and the info if it's active
    if (win.active) {
      this.updateCommand();
      return;
    }
  }

  /** update the command window */
  updateCommand(): void {
    if (Input.trigger(Input.BACK)) {
      pbPlayCancelSE();
      G.scene = new SceneMap() as never;
      return;
    }
    if (Input.trigger(Input.USE)) {
      if (this.cmd["Anger"]! >= 0 && this.commandWindow().index === this.cmd["Anger"]) {
        // (empty in Ruby)
      }
      return;
    }
  }
}
