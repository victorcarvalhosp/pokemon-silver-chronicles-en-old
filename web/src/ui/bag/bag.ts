// Port of 016_UI/007_UI_Bag.rb: Window_PokemonBag, PokemonBag_Scene and
// PokemonBagScreen. Plugin changes, in load order:
// - Following Pokemon EX (Script Additions/Refresh.rb): refreshes the
//   follower after PokemonBagScreen#pbStartScreen.
// - Essentials Deluxe's "Interactable Bag Screen" patch only applies with the
//   "Bag Screen w/int. Party" plugin, which isn't installed.
// - ZUD Mechanics adds the ninth "Z-Crystals" pocket (PokemonBag / Settings).
//
// Item effects go through ItemHandlers (game/items/ItemHandlers.ts), which
// has no handlers yet; see itemUtilities.ts.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../../game/GameSystem";
import { ItemHandlers, pbCanRegisterItem } from "../../game/items/ItemHandlers";
import { PCItemStorage, PokemonBag, type ItemSlot } from "../../game/items/PokemonBag";
import { Mail } from "../../game/pokemon/Mail";
import type { Player } from "../../game/trainer/Player";
import type { Bitmap } from "../../rgss/Bitmap";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbCopyBitmap, pbDrawImagePositions, pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbActivateWindow, pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { FieldActions, flyTemp, MenuFlags } from "../menus/menuScreens";
import { _INTL, pbBottomLeftLines, pbDisposeSpriteHash, pbDoEnsureBitmap, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { ChooseNumberParams, pbMessageChooseNumber } from "../messages";
import { pbPlayCloseMenuSE } from "../options/options";
import { pbDisplayMail } from "../party/mail";
import { PokemonParty_Scene, PokemonPartyScreen } from "../party/party";
import { pbResolveBitmap, preloadBitmaps } from "../rpgCache";
import { ItemIconSprite, preloadItemIcons } from "../sprites/itemIcon";
import { AnimatedSprite, BitmapSprite, IconSprite } from "../SpriteWrapper";
import { Window_AdvancedTextPokemon, Window_DrawableCommand, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";
import { pbUseItem } from "./itemUtilities";
import { UIHelper, xSpace3d } from "./UIHelper";

const player = () => G.player as unknown as Player;

/** PokemonMartAdapter#getDisplayName: TMs show their move's name. */
export function itemDisplayName(item: Id): string {
  let itemName = Item.get(item).name;
  if (Item.get(item).isMachine()) {
    const machine = Item.get(item).move!;
    itemName = _INTL("{1} {2}", itemName, MoveData.get(machine).name);
  }
  return itemName;
}

/** Item filter list: per pocket, the indices of the items the filter accepts. */
type FilterList = number[][];

/** Bag graphics, for preloading. */
function bagBitmaps(): string[] {
  const ret = ["Graphics/Pictures/Bag/cursor", "Graphics/Pictures/Bag/cursor_swap", "Graphics/Pictures/Bag/icon_pocket",
    "Graphics/Pictures/Bag/icon_register", "Graphics/Pictures/Bag/icon_slider",
    "Graphics/Pictures/leftarrow", "Graphics/Pictures/rightarrow"];
  for (let i = 1; i <= PokemonBag.pocketCount(); i++) {
    ret.push(`Graphics/Pictures/Bag/bg_${i}`, `Graphics/Pictures/Bag/bag_${i}`, `Graphics/Pictures/Bag/bag_${i}_f`);
  }
  return ret;
}

/** Fetches the Bag's graphics and the icons of the items in it. */
async function preloadBag(bag: { pockets?: ItemSlot[][] }): Promise<void> {
  const items: Id[] = [];
  for (const pocket of bag.pockets ?? []) for (const slot of pocket ?? []) if (slot) items.push(slot[0]);
  await Promise.all([preloadBitmaps(bagBitmaps()), preloadItemIcons(items)]);
}

//===============================================================================
//
//===============================================================================
export class Window_PokemonBag extends Window_DrawableCommand {
  private bag!: PokemonBag;
  private filterlist!: FilterList | null;
  private _pocket!: number;
  sorting = false;
  private swaparrow!: AnimatedBitmap;

  constructor(bag: PokemonBag, filterlist: FilterList | null, pocket: number, x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
    this.bag = bag;
    this.filterlist = filterlist;
    this._pocket = pocket;
    this.sorting = false;
    this._selarrow = new AnimatedBitmap("Graphics/Pictures/Bag/cursor");
    this.swaparrow = new AnimatedBitmap("Graphics/Pictures/Bag/cursor_swap");
    this.windowskin = null;
  }

  override dispose(): void {
    this.swaparrow.dispose();
    super.dispose();
  }

  get pocket(): number { return this._pocket; }
  set pocket(value: number) {
    this._pocket = value;
    this._itemMax = this.filterlist ? this.filterlist[this._pocket]!.length + 1 : this.bag.pockets[this._pocket]!.length + 1;
    this.index = this.bag.lastViewedIndex(this._pocket);
  }

  override get pageRowMax(): number { return PokemonBag_Scene.ITEMSVISIBLE; }
  override get pageItemMax(): number { return PokemonBag_Scene.ITEMSVISIBLE; }

  get item(): Id | null {
    if (this.filterlist && this.filterlist[this._pocket]![this.index] == null) return null;
    const thispocket = this.bag.pockets[this._pocket]!;
    const item = this.filterlist ? thispocket[this.filterlist[this._pocket]![this.index]!] : thispocket[this.index];
    return item ? item[0] : null;
  }

  override itemCount(): number {
    return this.filterlist ? this.filterlist[this._pocket]!.length + 1 : this.bag.pockets[this._pocket]!.length + 1;
  }

  override itemRect(item: number): Rect {
    if (item < 0 || item >= this._itemMax || item < this.topItem - 1 || item > this.topItem + this.pageItemMax) {
      return new Rect(0, 0, 0, 0);
    }
    const cursorWidth = Math.floor((this.width - this.borderX - (this._columnMax - 1) * this._columnSpacing) / this._columnMax);
    const x = (item % this._columnMax) * (cursorWidth + this._columnSpacing);
    const y = Math.floor(item / this._columnMax) * this._rowHeight - this._virtualOy;
    return new Rect(x, y, cursorWidth, this._rowHeight);
  }

  override drawCursor(index: number, rect: Rect): Rect {
    if (this.index === index) {
      const bmp = this.sorting ? this.swaparrow.bitmap : this._selarrow.bitmap;
      pbCopyBitmap(this.contents!, bmp, rect.x, rect.y + 2);
    }
    return rect;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    const textpos: TextPosition[] = [];
    rect = new Rect(rect.x + 16, rect.y + 16, rect.width - 16, rect.height);
    const thispocket = this.bag.pockets[this._pocket]!;
    if (index === this.itemCount() - 1) {
      textpos.push([_INTL("CLOSE BAG"), rect.x, rect.y + 2, false, this.baseColor, this.shadowColor]);
    } else {
      const slot = this.filterlist ? thispocket[this.filterlist[this._pocket]![index]!]! : thispocket[index]!;
      const item = slot[0];
      let baseColor = this.baseColor;
      let shadowColor = this.shadowColor;
      if (this.sorting && index === this.index) {
        baseColor = new Color(224, 0, 0);
        shadowColor = new Color(248, 144, 144);
      }
      textpos.push([itemDisplayName(item), rect.x, rect.y + 2, false, baseColor, shadowColor]);
      if (Item.get(item).isImportant()) {
        if (this.bag.registered(item)) {
          pbDrawImagePositions(this.contents!,
            [["Graphics/Pictures/Bag/icon_register", rect.x + rect.width - 72, rect.y + 8, 0, 0, -1, 24]]);
        } else if (pbCanRegisterItem(item)) {
          pbDrawImagePositions(this.contents!,
            [["Graphics/Pictures/Bag/icon_register", rect.x + rect.width - 72, rect.y + 8, 0, 24, -1, 24]]);
        }
      } else {
        const qty = slot[1];
        const qtytext = xSpace3d(qty);
        const xQty = rect.x + rect.width - this.contents!.textSize(qtytext).width - 16;
        textpos.push([qtytext, xQty, rect.y + 2, false, baseColor, shadowColor]);
      }
    }
    pbDrawTextPositions(this.contents!, textpos);
  }

  override refresh(): void {
    if (!this.bag) return; // (called from the superclass before Ruby's ivars exist)
    this._itemMax = this.itemCount();
    this.updateCursorRect();
    const dwidth = this.width - this.borderX;
    const dheight = this.height - this.borderY;
    this.contents = pbDoEnsureBitmap(this.contents, dwidth, dheight);
    this.contents.clear();
    for (let i = 0; i < this._itemMax; i++) {
      if (i < this.topItem - 1 || i > this.topItem + this.pageItemMax) continue;
      this.drawItem(i, this._itemMax, this.itemRect(i));
    }
    this.drawCursor(this.index, this.itemRect(this.index));
  }

  override update(): void {
    super.update();
    this._uparrow.visible = false;
    this._downarrow.visible = false;
  }
}

//===============================================================================
// Bag visuals
//===============================================================================
type BagSprites = {
  background: IconSprite;
  overlay: BitmapSprite;
  bagsprite: IconSprite;
  pocketicon: BitmapSprite;
  leftarrow: AnimatedSprite;
  rightarrow: AnimatedSprite;
  itemlist: Window_PokemonBag;
  itemicon: ItemIconSprite;
  itemtext: Window_UnformattedTextPokemon;
  helpwindow: Window_UnformattedTextPokemon;
  msgwindow: Window_AdvancedTextPokemon;
};

export class PokemonBag_Scene {
  static readonly ITEMLISTBASECOLOR = new Color(88, 88, 80);
  static readonly ITEMLISTSHADOWCOLOR = new Color(168, 184, 184);
  static readonly ITEMTEXTBASECOLOR = new Color(248, 248, 248);
  static readonly ITEMTEXTSHADOWCOLOR = new Color(0, 0, 0);
  static readonly POCKETNAMEBASECOLOR = new Color(88, 88, 80);
  static readonly POCKETNAMESHADOWCOLOR = new Color(168, 184, 184);
  static readonly ITEMSVISIBLE = 7;

  private viewport!: Viewport;
  private bag!: PokemonBag;
  private choosing = false;
  private filterproc: ((item: Id) => boolean) | null = null;
  private filterlist: FilterList | null = null;
  private sliderbitmap!: AnimatedBitmap;
  private pocketbitmap!: AnimatedBitmap;
  sprites!: BagSprites;
  private oldsprites: Record<string, boolean> | null = null;

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbStartScene(bag: PokemonBag, choosing = false, filterproc: ((item: Id) => boolean) | null = null, resetpocket = true): Promise<void> {
    await preloadBag(bag);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.bag = bag;
    this.choosing = choosing;
    this.filterproc = filterproc;
    this.pbRefreshFilter();
    let lastpocket = this.bag.lastViewedPocket;
    let numfilledpockets = this.bag.pockets.length - 1;
    if (this.choosing) {
      numfilledpockets = 0;
      if (this.filterlist == null) {
        for (let i = 1; i < this.bag.pockets.length; i++) if (this.bag.pockets[i]!.length > 0) numfilledpockets += 1;
      } else {
        for (let i = 1; i < this.bag.pockets.length; i++) if (this.filterlist[i]!.length > 0) numfilledpockets += 1;
      }
      lastpocket = resetpocket ? 1 : this.bag.lastViewedPocket;
      if ((this.filterlist && this.filterlist[lastpocket]!.length === 0) ||
          (!this.filterlist && this.bag.pockets[lastpocket]!.length === 0)) {
        for (let i = 1; i < this.bag.pockets.length; i++) {
          if (this.filterlist && this.filterlist[i]!.length > 0) {
            lastpocket = i;
            break;
          } else if (!this.filterlist && this.bag.pockets[i]!.length > 0) {
            lastpocket = i;
            break;
          }
        }
      }
    }
    this.bag.lastViewedPocket = lastpocket;
    this.sliderbitmap = new AnimatedBitmap("Graphics/Pictures/Bag/icon_slider");
    this.pocketbitmap = new AnimatedBitmap("Graphics/Pictures/Bag/icon_pocket");
    const vp = this.viewport;
    const background = new IconSprite(0, 0, vp);
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, vp);
    pbSetSystemFont(overlay.bitmap!);
    const bagsprite = new IconSprite(30, 20, vp);
    const pocketicon = new BitmapSprite(186, 32, vp);
    pocketicon.x = 0;
    pocketicon.y = 224;
    const leftarrow = AnimatedSprite.createLong("Graphics/Pictures/leftarrow", 8, 40, 28, 2, vp);
    leftarrow.x = -4;
    leftarrow.y = 76;
    leftarrow.visible = !this.choosing || numfilledpockets > 1;
    leftarrow.play();
    const rightarrow = AnimatedSprite.createLong("Graphics/Pictures/rightarrow", 8, 40, 28, 2, vp);
    rightarrow.x = 150;
    rightarrow.y = 76;
    rightarrow.visible = !this.choosing || numfilledpockets > 1;
    rightarrow.play();
    const itemlist = new Window_PokemonBag(this.bag, this.filterlist, lastpocket, 168, -8, 314, 40 + 32 + PokemonBag_Scene.ITEMSVISIBLE * 32);
    itemlist.viewport = vp;
    itemlist.pocket = lastpocket;
    itemlist.index = this.bag.lastViewedIndex(lastpocket);
    itemlist.baseColor = PokemonBag_Scene.ITEMLISTBASECOLOR;
    itemlist.shadowColor = PokemonBag_Scene.ITEMLISTSHADOWCOLOR;
    const itemicon = new ItemIconSprite(48, Graphics.height - 48, null, vp);
    const itemtext = Window_UnformattedTextPokemon.newWithSize("", 72, 272, Graphics.width - 72 - 24, 128, vp);
    itemtext.baseColor = PokemonBag_Scene.ITEMTEXTBASECOLOR;
    itemtext.shadowColor = PokemonBag_Scene.ITEMTEXTSHADOWCOLOR;
    itemtext.visible = true;
    itemtext.windowskin = null;
    const helpwindow = new Window_UnformattedTextPokemon("");
    helpwindow.visible = false;
    helpwindow.viewport = vp;
    const msgwindow = new Window_AdvancedTextPokemon("");
    msgwindow.visible = false;
    msgwindow.viewport = vp;
    this.sprites = { background, overlay, bagsprite, pocketicon, leftarrow, rightarrow, itemlist, itemicon, itemtext, helpwindow, msgwindow };
    pbBottomLeftLines(helpwindow, 1);
    await pbDeactivateWindows(this.sprites as never);
    this.pbRefresh();
    await pbFadeInAndShow(this.sprites as never);
  }

  async pbFadeOutScene(): Promise<void> {
    this.oldsprites = await pbFadeOutAndHide(this.sprites as never);
  }

  async pbFadeInScene(): Promise<void> {
    await pbFadeInAndShow(this.sprites as never, this.oldsprites);
    this.oldsprites = null;
  }

  async pbEndScene(): Promise<void> {
    if (!this.oldsprites) await pbFadeOutAndHide(this.sprites as never);
    this.oldsprites = null;
    this.dispose();
  }

  dispose(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.sliderbitmap.dispose();
    this.pocketbitmap.dispose();
    this.viewport.dispose();
  }

  async pbDisplay(msg: string, brief = false): Promise<void> {
    await UIHelper.pbDisplay(this.sprites.msgwindow, msg, brief, () => this.pbUpdate());
  }

  async pbConfirm(msg: string): Promise<boolean> {
    return UIHelper.pbConfirm(this.sprites.msgwindow, msg, () => this.pbUpdate());
  }

  async pbChooseNumber(helptext: string, maximum: number, initnum = 1): Promise<number> {
    return UIHelper.pbChooseNumber(this.sprites.helpwindow, helptext, maximum, initnum, () => this.pbUpdate());
  }

  async pbShowCommands(helptext: string, commands: string[], index = 0): Promise<number> {
    return UIHelper.pbShowCommands(this.sprites.helpwindow, helptext, commands, index, () => this.pbUpdate());
  }

  pbRefresh(): void {
    const s = this.sprites;
    const pocket = this.bag.lastViewedPocket;
    // Set the background image
    s.background.setBitmapFile(`Graphics/Pictures/Bag/bg_${pocket}`);
    // Set the bag sprite
    const fbagexists = pbResolveBitmap(`Graphics/Pictures/Bag/bag_${pocket}_f`);
    if (player().female() && fbagexists) {
      s.bagsprite.setBitmapFile(`Graphics/Pictures/Bag/bag_${pocket}_f`);
    } else {
      s.bagsprite.setBitmapFile(`Graphics/Pictures/Bag/bag_${pocket}`);
    }
    // Draw the pocket icons
    const icons: Bitmap = s.pocketicon.bitmap!;
    icons.clear();
    if (this.choosing && this.filterlist) {
      for (let i = 1; i < this.bag.pockets.length; i++) {
        if (this.filterlist[i]!.length > 0) continue;
        icons.blt(6 + (i - 1) * 22, 6, this.pocketbitmap.bitmap, new Rect((i - 1) * 20, 28, 20, 20));
      }
    }
    icons.blt(2 + (s.itemlist.pocket - 1) * 22, 2, this.pocketbitmap.bitmap, new Rect((s.itemlist.pocket - 1) * 28, 0, 28, 28));
    // Refresh the item window
    s.itemlist.refresh();
    // Refresh more things
    this.pbRefreshIndexChanged();
  }

  pbRefreshIndexChanged(): void {
    const itemlist = this.sprites.itemlist;
    const overlay = this.sprites.overlay.bitmap!;
    overlay.clear();
    // Draw the pocket name
    pbDrawTextPositions(overlay, [[PokemonBag.pocketNames()[this.bag.lastViewedPocket - 1]!, 94, 186, 2,
      PokemonBag_Scene.POCKETNAMEBASECOLOR, PokemonBag_Scene.POCKETNAMESHADOWCOLOR]]);
    // Draw slider arrows
    let showslider = false;
    if (itemlist.topRow > 0) {
      overlay.blt(470, 16, this.sliderbitmap.bitmap, new Rect(0, 0, 36, 38));
      showslider = true;
    }
    if (itemlist.topItem + itemlist.pageItemMax < itemlist.itemCount()) {
      overlay.blt(470, 228, this.sliderbitmap.bitmap, new Rect(0, 38, 36, 38));
      showslider = true;
    }
    // Draw slider box
    if (showslider) {
      const sliderheight = 174;
      let boxheight = Math.floor((sliderheight * itemlist.pageRowMax) / itemlist.rowMax);
      boxheight += Math.min(Math.floor((sliderheight - boxheight) / 2), Math.floor(sliderheight / 6));
      boxheight = Math.max(Math.floor(boxheight), 38);
      let y = 54;
      y += Math.floor(((sliderheight - boxheight) * itemlist.topRow) / (itemlist.rowMax - itemlist.pageRowMax));
      overlay.blt(470, y, this.sliderbitmap.bitmap, new Rect(36, 0, 36, 4));
      let i = 0;
      while (i * 16 < boxheight - 4 - 18) {
        const height = Math.min(boxheight - 4 - 18 - i * 16, 16);
        overlay.blt(470, y + 4 + i * 16, this.sliderbitmap.bitmap, new Rect(36, 4, 36, height));
        i += 1;
      }
      overlay.blt(470, y + boxheight - 18, this.sliderbitmap.bitmap, new Rect(36, 20, 36, 18));
    }
    // Set the selected item's icon
    this.sprites.itemicon.item = itemlist.item;
    // Set the selected item's description
    this.sprites.itemtext.text = itemlist.item ? Item.get(itemlist.item).description : _INTL("Close bag.");
  }

  pbRefreshFilter(): void {
    this.filterlist = null;
    if (!this.choosing) return;
    if (this.filterproc == null) return;
    this.filterlist = [];
    for (let i = 1; i < this.bag.pockets.length; i++) {
      this.filterlist[i] = [];
      for (let j = 0; j < this.bag.pockets[i]!.length; j++) {
        if (this.filterproc(this.bag.pockets[i]![j]![0])) this.filterlist[i]!.push(j);
      }
    }
  }

  /** Called when the item screen wants an item to be chosen from the screen */
  async pbChooseItem(): Promise<Id | null> {
    this.sprites.helpwindow.visible = false;
    const itemwindow = this.sprites.itemlist;
    let thispocket = this.bag.pockets[itemwindow.pocket]!;
    let swapinitialpos = -1;
    let ret: Id | null = null;
    await pbActivateWindow(this.sprites as never, "itemlist", async () => {
      for (;;) {
        const oldindex = itemwindow.index;
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        if (itemwindow.sorting && itemwindow.index >= thispocket.length) {
          itemwindow.index = oldindex === thispocket.length - 1 ? 0 : thispocket.length - 1;
        }
        if (itemwindow.index !== oldindex) {
          // Move the item being switched
          if (itemwindow.sorting) thispocket.splice(itemwindow.index, 0, thispocket.splice(oldindex, 1)[0]!);
          // Update selected item for current pocket
          this.bag.setLastViewedIndex(itemwindow.pocket, itemwindow.index);
          this.pbRefresh();
        }
        if (itemwindow.sorting) {
          if (Input.trigger(Input.ACTION) || Input.trigger(Input.USE)) {
            itemwindow.sorting = false;
            pbPlayDecisionSE();
            this.pbRefresh();
          } else if (Input.trigger(Input.BACK)) {
            thispocket.splice(swapinitialpos, 0, thispocket.splice(itemwindow.index, 1)[0]!);
            itemwindow.index = swapinitialpos;
            itemwindow.sorting = false;
            pbPlayCancelSE();
            this.pbRefresh();
          }
        } else { // Change pockets
          if (Input.trigger(Input.LEFT)) {
            let newpocket = itemwindow.pocket;
            for (;;) {
              newpocket = newpocket === 1 ? PokemonBag.pocketCount() : newpocket - 1;
              if (!this.choosing || newpocket === itemwindow.pocket) break;
              if (this.filterlist) {
                if (this.filterlist[newpocket]!.length > 0) break;
              } else if (this.bag.pockets[newpocket]!.length > 0) {
                break;
              }
            }
            if (itemwindow.pocket !== newpocket) {
              itemwindow.pocket = newpocket;
              this.bag.lastViewedPocket = itemwindow.pocket;
              thispocket = this.bag.pockets[itemwindow.pocket]!;
              pbPlayCursorSE();
              this.pbRefresh();
            }
          } else if (Input.trigger(Input.RIGHT)) {
            let newpocket = itemwindow.pocket;
            for (;;) {
              newpocket = newpocket === PokemonBag.pocketCount() ? 1 : newpocket + 1;
              if (!this.choosing || newpocket === itemwindow.pocket) break;
              if (this.filterlist) {
                if (this.filterlist[newpocket]!.length > 0) break;
              } else if (this.bag.pockets[newpocket]!.length > 0) {
                break;
              }
            }
            if (itemwindow.pocket !== newpocket) {
              itemwindow.pocket = newpocket;
              this.bag.lastViewedPocket = itemwindow.pocket;
              thispocket = this.bag.pockets[itemwindow.pocket]!;
              pbPlayCursorSE();
              this.pbRefresh();
            }
          // (Registering with Input::SPECIAL is commented out in Essentials.)
          } else if (Input.trigger(Input.ACTION)) { // Start switching the selected item
            if (!this.choosing && thispocket.length > 1 && itemwindow.index < thispocket.length &&
                !Settings.BAG_POCKET_AUTO_SORT[itemwindow.pocket - 1]) {
              itemwindow.sorting = true;
              swapinitialpos = itemwindow.index;
              pbPlayDecisionSE();
              this.pbRefresh();
            }
          } else if (Input.trigger(Input.BACK)) { // Cancel the item screen
            pbPlayCloseMenuSE();
            ret = null;
            return;
          } else if (Input.trigger(Input.USE)) { // Choose selected item
            if (itemwindow.item) pbPlayDecisionSE();
            else pbPlayCloseMenuSE();
            ret = itemwindow.item;
            return;
          }
        }
      }
    });
    return ret;
  }
}

//===============================================================================
// Bag mechanics
//===============================================================================
/** The scene the item storage screens give PokemonBagScreen (ItemStorage_Scene). */
interface StorageScene {
  pbStartScene(storage: unknown): Promise<void> | void;
  pbChooseItem(): Promise<Id | null>;
  pbChooseNumber(helptext: string, maximum: number): Promise<number>;
  pbRefresh(): void;
  pbDisplay(text: string): Promise<void>;
  pbConfirm(text: string): Promise<boolean>;
  pbEndScene(): Promise<void>;
}

interface StorageGlobals { pcItemStorage?: PCItemStorage | null }
const storageGlobals = () => G.pokemonGlobal as unknown as StorageGlobals;

export class PokemonBagScreen {
  constructor(private scene: PokemonBag_Scene, private bag: PokemonBag) {}

  /** The item chosen to use in the field (the Bag closed for it), or null. */
  async pbStartScreen(): Promise<Id | null> {
    const ret = await this.pbStartScreenBase();
    FieldActions.followingPkmn?.refresh(false); // Following Pokemon EX
    return ret;
  }

  private async pbStartScreenBase(): Promise<Id | null> {
    await this.scene.pbStartScene(this.bag);
    let item: Id | null = null;
    for (;;) {
      item = await this.scene.pbChooseItem();
      if (!item) break;
      const itm = Item.get(item);
      let cmdRead = -1;
      let cmdUse = -1;
      let cmdRegister = -1;
      let cmdGive = -1;
      let cmdToss = -1;
      let cmdDebug = -1;
      const commands: string[] = [];
      // Generate command list
      if (itm.isMail()) commands[(cmdRead = commands.length)] = _INTL("Read");
      if (ItemHandlers.hasOutHandler(item) || (itm.isMachine() && player().party.length > 0)) {
        if (ItemHandlers.hasUseText(item)) commands[(cmdUse = commands.length)] = ItemHandlers.getUseText(item) ?? "";
        else commands[(cmdUse = commands.length)] = _INTL("Use");
      }
      if (player().pokemonParty().length > 0 && itm.canHold()) commands[(cmdGive = commands.length)] = _INTL("Give");
      if (!itm.isImportant() || MenuFlags.DEBUG) commands[(cmdToss = commands.length)] = _INTL("Toss");
      if (this.bag.registered(item)) {
        commands[(cmdRegister = commands.length)] = _INTL("Deselect");
      } else if (pbCanRegisterItem(item)) {
        commands[(cmdRegister = commands.length)] = _INTL("Register");
      }
      if (MenuFlags.DEBUG) commands[(cmdDebug = commands.length)] = _INTL("Debug");
      commands[commands.length] = _INTL("Cancel");
      // Show commands generated above
      let itemname = itm.name;
      let command = await this.scene.pbShowCommands(_INTL("{1} is selected.", itemname), commands);
      if (cmdRead >= 0 && command === cmdRead) { // Read mail
        await pbFadeOutIn(() => pbDisplayMail(new Mail(item!, "", "")));
      } else if (cmdUse >= 0 && command === cmdUse) { // Use item
        const ret = await pbUseItem(this.bag, item, this.scene);
        // ret: 0=Item wasn't used; 1=Item used; 2=Close Bag to use in field
        if (ret === 2) break; // End screen
        this.scene.pbRefresh();
        continue;
      } else if (cmdGive >= 0 && command === cmdGive) { // Give item to Pokémon
        if (player().pokemonCount() === 0) {
          await this.scene.pbDisplay(_INTL("There is no Pokémon."));
        } else if (itm.isImportant()) {
          await this.scene.pbDisplay(_INTL("The {1} can't be held.", itemname));
        } else {
          await pbFadeOutIn(async () => {
            const sscene = new PokemonParty_Scene();
            const sscreen = new PokemonPartyScreen(sscene, player().party);
            await sscreen.pbPokemonGiveScreen(item!);
            this.scene.pbRefresh();
          });
        }
      } else if (cmdToss >= 0 && command === cmdToss) { // Toss item
        let qty = this.bag.quantity(item);
        if (qty > 1) {
          const helptext = _INTL("Toss out how many {1}?", itm.namePlural);
          qty = await this.scene.pbChooseNumber(helptext, qty);
        }
        if (qty > 0) {
          if (qty > 1) itemname = itm.namePlural;
          if (await this.pbConfirm(_INTL("Is it OK to throw away {1} {2}?", qty, itemname))) {
            await this.pbDisplay(_INTL("Threw away {1} {2}.", qty, itemname));
            for (let i = 0; i < qty; i++) this.bag.remove(item);
            this.scene.pbRefresh();
          }
        }
      } else if (cmdRegister >= 0 && command === cmdRegister) { // Register item
        if (this.bag.registered(item)) this.bag.unregister(item);
        else this.bag.register(item);
        this.scene.pbRefresh();
      } else if (cmdDebug >= 0 && command === cmdDebug) { // Debug
        command = 0;
        for (;;) {
          command = await this.scene.pbShowCommands(_INTL("Do what with {1}?", itemname),
            [_INTL("Change quantity"), _INTL("Make Mystery Gift"), _INTL("Cancel")], command);
          if (command === -1 || command === 2) break; // Cancel
          if (command === 0) { // Change quantity
            const qty = this.bag.quantity(item);
            const itemplural = itm.namePlural;
            const params = new ChooseNumberParams();
            params.setRange(0, Settings.BAG_MAX_PER_SLOT);
            params.setDefaultValue(qty);
            const newqty = await pbMessageChooseNumber(
              _INTL("Choose new quantity of {1} (max. {2}).", itemplural, Settings.BAG_MAX_PER_SLOT), params, () => this.scene.pbUpdate());
            if (newqty > qty) this.bag.add(item, newqty - qty);
            else if (newqty < qty) this.bag.remove(item, qty - newqty);
            this.scene.pbRefresh();
            if (newqty === 0) break;
          }
          // Make Mystery Gift: pbCreateMysteryGift (016_UI/023_UI_MysteryGift.rb) isn't ported.
        }
      }
    }
    if (flyTemp().flyDestination) this.scene.dispose();
    else await this.scene.pbEndScene();
    return item;
  }

  async pbDisplay(text: string): Promise<void> {
    await this.scene.pbDisplay(text);
  }

  async pbConfirm(text: string): Promise<boolean> {
    return this.scene.pbConfirm(text);
  }

  /** UI logic for the item screen for choosing an item. */
  async pbChooseItemScreen(proc: ((item: Id) => boolean) | null = null): Promise<Id | null> {
    const oldlastpocket = this.bag.lastViewedPocket;
    const oldchoices = [...this.bag.lastPocketSelections];
    if (proc) this.bag.resetLastSelections();
    await this.scene.pbStartScene(this.bag, true, proc);
    const item = await this.scene.pbChooseItem();
    await this.scene.pbEndScene();
    this.bag.lastViewedPocket = oldlastpocket;
    this.bag.lastPocketSelections = oldchoices;
    return item;
  }

  /** UI logic for withdrawing an item in the item storage screen. */
  async pbWithdrawItemScreen(): Promise<void> {
    const scene = this.scene as unknown as StorageScene;
    if (!storageGlobals().pcItemStorage) storageGlobals().pcItemStorage = new PCItemStorage();
    const storage = storageGlobals().pcItemStorage!;
    await scene.pbStartScene(storage);
    for (;;) {
      const item = await scene.pbChooseItem();
      if (!item) break;
      const itm = Item.get(item);
      let qty = storage.quantity(item);
      if (qty > 1 && !itm.isImportant()) qty = await scene.pbChooseNumber(_INTL("How many do you want to withdraw?"), qty);
      if (qty <= 0) continue;
      if (this.bag.canAdd(item, qty)) {
        if (!storage.remove(item, qty)) throw new Error("Can't delete items from storage");
        if (!this.bag.add(item, qty)) throw new Error("Can't withdraw items from storage");
        scene.pbRefresh();
        const dispqty = itm.isImportant() ? 1 : qty;
        const itemname = dispqty > 1 ? itm.namePlural : itm.name;
        await scene.pbDisplay(_INTL("Withdrew {1} {2}.", dispqty, itemname));
      } else {
        await scene.pbDisplay(_INTL("There's no more room in the Bag."));
      }
    }
    await scene.pbEndScene();
  }

  /** UI logic for depositing an item in the item storage screen. */
  async pbDepositItemScreen(): Promise<void> {
    const scene = this.scene as unknown as StorageScene;
    await scene.pbStartScene(this.bag);
    if (!storageGlobals().pcItemStorage) storageGlobals().pcItemStorage = new PCItemStorage();
    const storage = storageGlobals().pcItemStorage!;
    for (;;) {
      const item = await scene.pbChooseItem();
      if (!item) break;
      const itm = Item.get(item);
      let qty = this.bag.quantity(item);
      if (qty > 1 && !itm.isImportant()) qty = await scene.pbChooseNumber(_INTL("How many do you want to deposit?"), qty);
      if (qty > 0) {
        if (storage.canAdd(item, qty)) {
          if (!this.bag.remove(item, qty)) throw new Error("Can't delete items from Bag");
          if (!storage.add(item, qty)) throw new Error("Can't deposit items to storage");
          scene.pbRefresh();
          const dispqty = itm.isImportant() ? 1 : qty;
          const itemname = dispqty > 1 ? itm.namePlural : itm.name;
          await scene.pbDisplay(_INTL("Deposited {1} {2}.", dispqty, itemname));
        } else {
          await scene.pbDisplay(_INTL("There's no room to store items."));
        }
      }
    }
    await scene.pbEndScene();
  }

  /** UI logic for tossing an item in the item storage screen. */
  async pbTossItemScreen(): Promise<void> {
    const scene = this.scene as unknown as StorageScene;
    if (!storageGlobals().pcItemStorage) storageGlobals().pcItemStorage = new PCItemStorage();
    const storage = storageGlobals().pcItemStorage!;
    await scene.pbStartScene(storage);
    for (;;) {
      const item = await scene.pbChooseItem();
      if (!item) break;
      const itm = Item.get(item);
      if (itm.isImportant()) {
        await scene.pbDisplay(_INTL("That's too important to toss out!"));
        continue;
      }
      let qty = storage.quantity(item);
      let itemname = itm.name;
      const itemnameplural = itm.namePlural;
      if (qty > 1) qty = await scene.pbChooseNumber(_INTL("Toss out how many {1}?", itemnameplural), qty);
      if (qty <= 0) continue;
      if (qty > 1) itemname = itemnameplural;
      if (!(await scene.pbConfirm(_INTL("Is it OK to throw away {1} {2}?", qty, itemname)))) continue;
      if (!storage.remove(item, qty)) throw new Error("Can't delete items from storage");
      scene.pbRefresh();
      await scene.pbDisplay(_INTL("Threw away {1} {2}.", qty, itemname));
    }
    await scene.pbEndScene();
  }
}
