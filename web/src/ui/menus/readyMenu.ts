// Port of 016_UI/016_UI_ReadyMenu.rb (the registered-items / field-moves menu
// opened with the SPECIAL key), with pbUseKeyItem as Improved Field Skills
// ([001] Field Skills.rb) overrides it in this game.
//
// To stay free of the data model's imports, the bag is read from
// G.bag (registeredItems, readyMenuSelection, has(), quantity()), Pokémon
// through PokemonLike, names/icons through MenuData and field moves through
// FieldActions (menuScreens.ts). With no bag and no usable field moves this
// shows the "no registered items" message, as Essentials does.

import { G, pbUpdateSceneMap } from "../../game/globals";
import { pbPlayBuzzerSE, pbSEPlay } from "../../game/GameSystem";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Bitmap } from "../../rgss/Bitmap";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbFadeOutInWithUpdate, type SpriteHash } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbMessage } from "../messages";
import { pbPlayCloseMenuSE } from "../options/options";
import { preloadBitmaps } from "../rpgCache";
import { Window_CommandPokemon } from "../windows/SpriteWindowText";
import {
  FieldActions, type FlyDestination, flyTemp, isEgg, menuBag, MenuData, type MenuIconSprite, menuPlayer, MenuScreens, type PokemonLike,
} from "./menuScreens";

const BUTTONS = ["Graphics/Pictures/Ready Menu/icon_movebutton", "Graphics/Pictures/Ready Menu/icon_itembutton"];

/** [item/move ID, name, mode (true move / false item), pkmnIndex] */
export type ReadyCommand = [string, string, boolean, number?];

const itemIsImportant = (item: string) => MenuData.itemIsImportant?.(item) ?? false;

//===============================================================================
//
//===============================================================================
export class ReadyMenuButton extends Sprite {
  /** ID of button */
  readonly index: number;
  private _selected: number;
  private _side: number;
  private command: ReadyCommand;
  private button: AnimatedBitmap;
  private contents: Bitmap;
  private icon: MenuIconSprite | null;

  constructor(index: number, command: ReadyCommand, selected: number, side: number, viewport: Viewport | null = null) {
    super(viewport);
    this.index = index;
    this.command = command; // Item/move ID, name, mode (T move/F item), pkmnIndex
    this._selected = selected;
    this._side = side;
    this.button = new AnimatedBitmap(this.command[2] ? BUTTONS[0] : BUTTONS[1]);
    this.contents = new Bitmap(this.button.width, Math.floor(this.button.height / 2));
    this.setBitmap(this.contents);
    pbSetSystemFont(this.bitmap!);
    if (this.command[2]) {
      const pkmn = menuPlayer()?.party?.[this.command[3] ?? 0];
      this.icon = MenuData.pokemonIconSprite?.(pkmn, viewport) ?? null; // setOffset(PictureOrigin::CENTER)
    } else {
      this.icon = MenuData.itemIconSprite?.(0, 0, this.command[0], viewport) ?? null;
    }
    if (this.icon) this.icon.z = this.z + 1;
    this.refresh();
  }

  override dispose(): void {
    this.button.dispose();
    this.contents.dispose();
    this.icon?.dispose();
    super.dispose();
  }

  get selected(): number { return this._selected; }
  set selected(val: number) {
    const oldsel = this._selected;
    this._selected = val;
    if (oldsel !== val) this.refresh();
  }

  get side(): number { return this._side; }
  set side(val: number) {
    const oldsel = this._side;
    this._side = val;
    if (oldsel !== val) this.refresh();
  }

  setVisible(val: boolean): void {
    if (this.icon) this.icon.visible = val;
    this.visible = val;
  }

  refresh(): void {
    const half = Math.floor(this.button.height / 2);
    const sel = this._selected === this.index && (this._side === 0) === this.command[2];
    this.y = Math.floor((Graphics.height - half) / 2) - (this._selected - this.index) * (half + 4);
    if (this.command[2]) { // Pokémon
      this.x = sel ? 0 : -16;
      if (this.icon) {
        this.icon.x = this.x + 52;
        this.icon.y = this.y + 32;
      }
    } else { // Item
      this.x = sel ? Graphics.width - this.button.width : Graphics.width + 16 - this.button.width;
      if (this.icon) {
        this.icon.x = this.x + 32;
        this.icon.y = this.y + Math.floor(this.button.height / 4);
      }
    }
    this.bitmap!.clear();
    const rect = new Rect(0, sel ? half : 0, this.button.width, half);
    this.bitmap!.blt(0, 0, this.button.bitmap, rect);
    const textx = this.command[2] ? 164 : itemIsImportant(this.command[0]) ? 146 : 124;
    const white = new Color(248, 248, 248), dark = new Color(40, 40, 40);
    const textpos: TextPosition[] = [[this.command[1], textx, 24, 2, white, dark, 1]];
    if (!this.command[2] && !itemIsImportant(this.command[0])) {
      const qty = menuBag()?.quantity?.(this.command[0]) ?? 0;
      if (qty > 99) {
        textpos.push([_INTL(">99"), 230, 24, 1, white, dark, 1]);
      } else {
        textpos.push([_INTL("x{1}", qty), 230, 24, 1, white, dark, 1]);
      }
    }
    pbDrawTextPositions(this.bitmap!, textpos);
  }

  override update(dt?: number): void {
    this.icon?.update();
    super.update(dt);
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonReadyMenu_Scene {
  sprites: Record<string, Window_CommandPokemon | ReadyMenuButton> = {};
  private commands: [ReadyCommand[], ReadyCommand[]] = [[], []];
  private movecommands: string[] = [];
  private itemcommands: string[] = [];
  private index: number[] = [0, 0, 1];
  private viewport!: Viewport;

  private get cmdwindow(): Window_CommandPokemon {
    return this.sprites.cmdwindow as Window_CommandPokemon;
  }

  private button(kind: "move" | "item", i: number): ReadyMenuButton {
    return this.sprites[`${kind}button${i}`] as ReadyMenuButton;
  }

  async pbStartScene(commands: [ReadyCommand[], ReadyCommand[]]): Promise<void> {
    this.commands = commands;
    this.movecommands = this.commands[0].map((c) => c[1]);
    this.itemcommands = this.commands[1].map((c) => c[1]);
    // $bag.ready_menu_selection: the same array, so the cursor is remembered.
    const bag = menuBag();
    if (bag && !bag.readyMenuSelection) bag.readyMenuSelection = [0, 0, 1];
    this.index = bag?.readyMenuSelection ?? [0, 0, 1];
    const idx = this.index as [number, number, number];
    if (idx[0] >= this.movecommands.length && this.movecommands.length > 0) {
      idx[0] = this.movecommands.length - 1;
    }
    if (idx[1] >= this.itemcommands.length && this.itemcommands.length > 0) {
      idx[1] = this.itemcommands.length - 1;
    }
    if (idx[2] === 0 && this.movecommands.length === 0) {
      idx[2] = 1;
    } else if (idx[2] === 1 && this.itemcommands.length === 0) {
      idx[2] = 0;
    }
    await preloadBitmaps(BUTTONS);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    const cmdwindow = new Window_CommandPokemon(idx[2] === 0 ? this.movecommands : this.itemcommands);
    cmdwindow.height = 6 * 32;
    cmdwindow.visible = false;
    cmdwindow.viewport = this.viewport;
    this.sprites.cmdwindow = cmdwindow;
    this.commands[0].forEach((c, i) => {
      this.sprites[`movebutton${i}`] = new ReadyMenuButton(i, c, idx[0], idx[2], this.viewport);
    });
    this.commands[1].forEach((c, i) => {
      this.sprites[`itembutton${i}`] = new ReadyMenuButton(i, c, idx[1], idx[2], this.viewport);
    });
    pbSEPlay("GUI menu open");
  }

  pbShowMenu(): void {
    this.cmdwindow.visible = false;
    this.commands[0].forEach((_, i) => this.button("move", i).setVisible(true));
    this.commands[1].forEach((_, i) => this.button("item", i).setVisible(true));
  }

  pbHideMenu(): void {
    this.cmdwindow.visible = false;
    this.commands[0].forEach((_, i) => this.button("move", i).setVisible(false));
    this.commands[1].forEach((_, i) => this.button("item", i).setVisible(false));
  }

  async pbShowCommands(): Promise<-1 | [number, number]> {
    let ret: -1 | [number, number] = -1;
    const cmdwindow = this.cmdwindow;
    cmdwindow.commands = this.index[2] === 0 ? this.movecommands : this.itemcommands;
    cmdwindow.index = this.index[this.index[2]!]!;
    cmdwindow.visible = false;
    for (;;) {
      await this.pbUpdate();
      if (Input.trigger(Input.LEFT) && this.index[2] === 1 && this.movecommands.length > 0) {
        this.index[2] = 0;
        this.pbChangeSide();
      } else if (Input.trigger(Input.RIGHT) && this.index[2] === 0 && this.itemcommands.length > 0) {
        this.index[2] = 1;
        this.pbChangeSide();
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        ret = -1;
        break;
      } else if (Input.trigger(Input.USE)) {
        ret = [this.index[2]!, cmdwindow.index];
        break;
      }
    }
    return ret;
  }

  pbEndScene(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  pbChangeSide(): void {
    this.commands[0].forEach((_, i) => { this.button("move", i).side = this.index[2]!; });
    this.commands[1].forEach((_, i) => { this.button("item", i).side = this.index[2]!; });
    this.cmdwindow.commands = this.index[2] === 0 ? this.movecommands : this.itemcommands;
    this.cmdwindow.index = this.index[this.index[2]!]!;
  }

  pbRefresh(): void {}

  async pbUpdate(): Promise<void> {
    const side = this.index[2]!;
    const oldindex = this.index[side];
    this.index[side] = this.cmdwindow.index;
    if (this.index[side] !== oldindex) {
      switch (side) {
        case 0:
          this.commands[0].forEach((_, i) => { this.button("move", i).selected = this.index[side]!; });
          break;
        case 1:
          this.commands[1].forEach((_, i) => { this.button("item", i).selected = this.index[side]!; });
          break;
      }
    }
    pbUpdateSpriteHash(this.sprites as never);
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonReadyMenu {
  constructor(private scene: PokemonReadyMenu_Scene) {}

  pbHideMenu(): void {
    this.scene.pbHideMenu();
  }

  pbShowMenu(): void {
    this.scene.pbRefresh();
    this.scene.pbShowMenu();
  }

  /** moves: [move, party index][]; items: item IDs. */
  async pbStartReadyMenu(moves: [string, number][], items: string[]): Promise<void> {
    const commands: [ReadyCommand[], ReadyCommand[]] = [[], []]; // Moves, items
    for (const i of moves) commands[0].push([i[0], MenuData.moveName?.(i[0]) ?? i[0], true, i[1]]);
    commands[0].sort((a, b) => cmp(a[1], b[1]));
    for (const i of items) commands[1].push([i, MenuData.itemName?.(i) ?? i, false]);
    commands[1].sort((a, b) => cmp(a[1], b[1]));
    await this.scene.pbStartScene(commands);
    for (;;) {
      const command = await this.scene.pbShowCommands();
      if (command === -1) break;
      if (command[0] === 0) { // Use a move
        const move = commands[0][command[1]]![0];
        const user = menuPlayer()?.party?.[commands[0][command[1]]![3] ?? 0];
        // Without the pbUseHiddenMove hook (game/field sets it): buzzer, like an unregistered screen.
        if (!FieldActions.useHiddenMove) {
          pbPlayBuzzerSE();
          continue;
        }
        if (move === "FLY") {
          const holder: { ret: FlyDestination | null } = { ret: null };
          await pbFadeOutInWithUpdate(99999, this.scene.sprites as unknown as SpriteHash, async () => {
            this.pbHideMenu();
            holder.ret = (await MenuScreens.flyMap?.()) ?? null;
            if (!holder.ret) this.pbShowMenu();
          });
          const ret = holder.ret;
          if (ret) {
            flyTemp().flyDestination = ret;
            G.gameTemp.inMenu = false;
            await FieldActions.useHiddenMove?.(user, move);
            break;
          }
        } else {
          this.pbHideMenu();
          if (await FieldActions.confirmUseHiddenMove?.(user, move)) {
            G.gameTemp.inMenu = false;
            await FieldActions.useHiddenMove?.(user, move);
            break;
          } else {
            this.pbShowMenu();
          }
        }
      } else { // Use an item
        const item = commands[1][command[1]]![0];
        // Without the pbUseKeyItemInField hook (game/scripts/partyBag.ts sets it): buzzer, like an unregistered screen.
        if (!FieldActions.useKeyItemInField) {
          pbPlayBuzzerSE();
          continue;
        }
        this.pbHideMenu();
        // ItemHandlers.triggerConfirmUseInField is true when the item has no handler.
        if ((await FieldActions.confirmUseInField?.(item)) ?? true) {
          G.gameTemp.inMenu = false;
          if (await FieldActions.useKeyItemInField(item)) break;
          G.gameTemp.inMenu = true;
        }
      }
      this.pbShowMenu();
    }
    this.scene.pbEndScene();
  }
}

/** Ruby's String#<=> (byte order). */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

//===============================================================================
// Using a registered item (Improved Field Skills' version)
//===============================================================================
/** Settings::HM_SKILLS (Improved Field Skills/[000] Settings.rb): badge-gated. */
export const HM_SKILLS = ["CUT", "FLY", "SURF", "STRENGTH", "WATERFALL", "DIVE", "FLASH", "ROCKSMASH", "WHIRLPOOL"];
/** Settings::MISC_SKILLS */
export const MISC_SKILLS = [
  "DEFOG", "ROCKCLIMB", "DIG", "TELEPORT", "SWEETSCENT", "HEADBUTT", "SECRETPOWER",
  "SUNNYDAY", "RAINDANCE", "SANDSTORM", "HAIL", "EXTREMESPEED", "CAMOUFLAGE", "BOUNCE",
];
const HM_SKILLS_REQUIRE_BADGE = true;
const MISC_SKILLS_REQUIRE_MOVE = true;

function hasSkill(pkmn: PokemonLike, skill: string): boolean {
  return !!pkmn.speciesData?.hasSkill?.(skill) || !!pkmn.hasMove?.(skill);
}

export async function pbUseKeyItem(): Promise<void> {
  const realMoves: [string, number][] = [];
  const party = (menuPlayer()?.party ?? []) as PokemonLike[];
  const moveExists = (m: string) => MenuData.moveExists?.(m) ?? false;
  const hasHandler = (m: string) => FieldActions.hasHiddenMoveHandler?.(m) ?? false;
  const canUse = (p: PokemonLike, m: string) => FieldActions.canUseHiddenMove?.(p, m, false) ?? false;
  // Adds available HM Skills.
  for (const skill of HM_SKILLS) {
    if (!moveExists(skill)) continue;
    if (!hasHandler(skill)) continue;
    for (let i = 0; i < party.length; i++) {
      const pkmn = party[i]!;
      if (isEgg(pkmn)) continue;
      if (!hasSkill(pkmn, skill)) continue;
      if (HM_SKILLS_REQUIRE_BADGE) {
        const badge = FieldActions.badgeFromSkill?.(skill) ?? 0;
        if (badge > 0 && !(FieldActions.checkHiddenMoveBadge?.(badge, false) ?? false)) continue;
      }
      if (canUse(pkmn, skill)) realMoves.push([skill, i]);
      break;
    }
  }
  // Adds available Misc. Skills.
  for (const skill of MISC_SKILLS) {
    if (!moveExists(skill)) continue;
    if (!hasHandler(skill)) continue;
    for (let i = 0; i < party.length; i++) {
      const pkmn = party[i]!;
      if (isEgg(pkmn)) continue;
      if (MISC_SKILLS_REQUIRE_MOVE && !pkmn.hasMove?.(skill)) continue;
      if (!hasSkill(pkmn, skill)) continue;
      if (canUse(pkmn, skill)) realMoves.push([skill, i]);
      break;
    }
  }
  const realItems: string[] = [];
  const bag = menuBag();
  for (const i of bag?.registeredItems ?? []) {
    if (bag?.has?.(i)) realItems.push(i);
  }
  if (realItems.length === 0 && realMoves.length === 0) {
    await pbMessage(_INTL("An item in the Bag can be registered to this key for instant use."));
  } else {
    G.gameTemp.inMenu = true;
    await (G.gameMap as unknown as { update?(): Promise<void> } | null)?.update?.();
    const sscene = new PokemonReadyMenu_Scene();
    const sscreen = new PokemonReadyMenu(sscene);
    await sscreen.pbStartReadyMenu(realMoves, realItems);
    G.gameTemp.inMenu = false;
  }
}
