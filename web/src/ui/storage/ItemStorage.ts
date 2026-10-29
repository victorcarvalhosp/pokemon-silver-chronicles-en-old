// Port of 016_UI/018_UI_ItemStorage.rb: Window_PokemonItemStorage,
// ItemStorage_Scene, WithdrawItemScene and TossItemScene (UIHelper is in
// ui/bag/UIHelper.ts). PokemonBagScreen#pbWithdrawItemScreen /
// pbDepositItemScreen / pbTossItemScreen (ui/bag/bag.ts) drive these scenes.
// No plugin changes them (Essentials Deluxe's "Interactable Bag Screen" patch
// needs a plugin this game doesn't have).

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import type { ItemSlot, PCItemStorage, PokemonBag } from "../../game/items/PokemonBag";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, type Rect } from "../../rgss/types";
import { itemDisplayName } from "../bag/bag";
import { UIHelper } from "../bag/UIHelper";
import { drawTextEx, pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbActivateWindow, pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbBottomLeftLines, pbDisposeSpriteHash, pbSetNarrowFont, pbUpdateSpriteHash } from "../messageConfig";
import { preloadBitmaps } from "../rpgCache";
import { asHash } from "../scenes/frames";
import { ItemIconSprite, preloadItemIcons } from "../sprites/itemIcon";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { Window_AdvancedTextPokemon, Window_DrawableCommand, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";

/** The item storage shows PCItemStorage (withdraw / toss) or, for Deposit, the Bag's scene instead. */
type ItemList = PCItemStorage | PokemonBag;

/** The storage's slots (PCItemStorage#[] / #length). */
function slots(bag: ItemList): ItemSlot[] {
  return (bag as PCItemStorage).items;
}

//===============================================================================
//
//===============================================================================
export class Window_PokemonItemStorage extends Window_DrawableCommand {
  private _bag!: ItemList;
  private _sortIndex = -1;

  constructor(bag: ItemList, x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
    this._bag = bag;
    this._sortIndex = -1;
    this.windowskin = null;
    this.refresh();
  }

  get bag(): ItemList { return this._bag; }

  get sortIndex(): number { return this._sortIndex; }
  set sortIndex(value: number) {
    this._sortIndex = value;
    this.refresh();
  }

  get item(): Id | null {
    const item = slots(this._bag)[this.index];
    return item ? item[0] : null;
  }

  override itemCount(): number {
    if (!this._bag) return 1; // (called from the superclass before Ruby's ivars exist)
    return slots(this._bag).length + 1;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    if (!this._bag) return;
    rect = this.drawCursor(index, rect);
    const textpos: TextPosition[] = [];
    const list = slots(this._bag);
    if (index === list.length) {
      textpos.push([_INTL("CANCEL"), rect.x, rect.y, false, this.baseColor, this.shadowColor]);
    } else {
      const item = list[index]![0];
      const itemname = itemDisplayName(item); // PokemonMartAdapter#getDisplayName
      const baseColor = index === this._sortIndex ? new Color(248, 24, 24) : this.baseColor;
      textpos.push([itemname, rect.x, rect.y, false, this.baseColor, this.shadowColor]);
      if (!Item.get(item).isImportant()) { // Not a Key item/HM/TM
        const qty = `x ${list[index]![1]}`; // _ISPRINTF("x{1: 2d}")
        const sizeQty = this.contents!.textSize(qty).width;
        const xQty = rect.x + rect.width - sizeQty - 2;
        textpos.push([qty, xQty, rect.y, false, baseColor, this.shadowColor]);
      }
    }
    pbDrawTextPositions(this.contents!, textpos);
  }
}

//===============================================================================
//
//===============================================================================
type ItemStorageSprites = {
  background: IconSprite;
  icon: ItemIconSprite;
  itemwindow: Window_PokemonItemStorage;
  pocketwindow: BitmapSprite;
  itemtextwindow: Window_UnformattedTextPokemon;
  helpwindow: Window_UnformattedTextPokemon;
  msgwindow: Window_AdvancedTextPokemon;
};

export class ItemStorage_Scene {
  static readonly ITEMLISTBASECOLOR = new Color(88, 88, 80);
  static readonly ITEMLISTSHADOWCOLOR = new Color(168, 184, 184);
  static readonly ITEMTEXTBASECOLOR = new Color(248, 248, 248);
  static readonly ITEMTEXTSHADOWCOLOR = new Color(0, 0, 0);
  static readonly TITLEBASECOLOR = new Color(248, 248, 248);
  static readonly TITLESHADOWCOLOR = new Color(0, 0, 0);
  static readonly ITEMSVISIBLE = 7;

  private viewport!: Viewport;
  private bag!: ItemList;
  sprites!: ItemStorageSprites;

  constructor(private title: string) {}

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbStartScene(bag: ItemList): Promise<void> {
    await Promise.all([preloadBitmaps(["Graphics/Pictures/pcItembg"]), preloadItemIcons(slots(bag).map((s) => s[0]))]);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.bag = bag;
    const vp = this.viewport;
    const background = new IconSprite(0, 0, vp);
    background.setBitmapFile("Graphics/Pictures/pcItembg");
    const icon = new ItemIconSprite(50, 334, null, vp);
    // Item list
    const itemwindow = new Window_PokemonItemStorage(this.bag, 98, 14, 334, 32 + ItemStorage_Scene.ITEMSVISIBLE * 32);
    itemwindow.viewport = vp;
    itemwindow.index = 0;
    itemwindow.baseColor = ItemStorage_Scene.ITEMLISTBASECOLOR;
    itemwindow.shadowColor = ItemStorage_Scene.ITEMLISTSHADOWCOLOR;
    itemwindow.refresh();
    // Title
    const pocketwindow = new BitmapSprite(88, 64, vp);
    pocketwindow.x = 14;
    pocketwindow.y = 16;
    pbSetNarrowFont(pocketwindow.bitmap!);
    // Item description
    const itemtextwindow = Window_UnformattedTextPokemon.newWithSize("", 84, 272, Graphics.width - 84, 128, vp);
    itemtextwindow.baseColor = ItemStorage_Scene.ITEMTEXTBASECOLOR;
    itemtextwindow.shadowColor = ItemStorage_Scene.ITEMTEXTSHADOWCOLOR;
    itemtextwindow.windowskin = null;
    const helpwindow = new Window_UnformattedTextPokemon("");
    helpwindow.visible = false;
    helpwindow.viewport = vp;
    // Letter-by-letter message window
    const msgwindow = new Window_AdvancedTextPokemon("");
    msgwindow.visible = false;
    msgwindow.viewport = vp;
    this.sprites = { background, icon, itemwindow, pocketwindow, itemtextwindow, helpwindow, msgwindow };
    pbBottomLeftLines(helpwindow, 1);
    await pbDeactivateWindows(asHash(this.sprites));
    this.pbRefresh();
    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  async pbChooseNumber(helptext: string, maximum: number): Promise<number> {
    return UIHelper.pbChooseNumber(this.sprites.helpwindow, helptext, maximum, 1, () => this.update());
  }

  async pbDisplay(msg: string, brief = false): Promise<void> {
    await UIHelper.pbDisplay(this.sprites.msgwindow, msg, brief, () => this.update());
  }

  async pbConfirm(msg: string): Promise<boolean> {
    return UIHelper.pbConfirm(this.sprites.msgwindow, msg, () => this.update());
  }

  async pbShowCommands(helptext: string, commands: string[]): Promise<number> {
    return UIHelper.pbShowCommands(this.sprites.helpwindow, helptext, commands, 0, () => this.update());
  }

  pbRefresh(): void {
    const bm = this.sprites.pocketwindow.bitmap!;
    // Draw title at upper left corner ("Toss Item/Withdraw Item")
    drawTextEx(bm, 0, 8, bm.width, 2, this.title, ItemStorage_Scene.TITLEBASECOLOR, ItemStorage_Scene.TITLESHADOWCOLOR);
    const itemwindow = this.sprites.itemwindow;
    // Draw item icon
    this.sprites.icon.item = itemwindow.item;
    // Get item description
    if (itemwindow.item) {
      this.sprites.itemtextwindow.text = Item.get(itemwindow.item).description;
    } else {
      this.sprites.itemtextwindow.text = _INTL("Close storage.");
    }
    itemwindow.refresh();
  }

  async pbChooseItem(): Promise<Id | null> {
    this.pbRefresh();
    this.sprites.helpwindow.visible = false;
    const itemwindow = this.sprites.itemwindow;
    itemwindow.refresh();
    let ret: Id | null = null;
    await pbActivateWindow(asHash(this.sprites), "itemwindow", async () => {
      for (;;) {
        await Graphics.update();
        Input.update();
        const olditem = itemwindow.item;
        this.update();
        if (itemwindow.item !== olditem) this.pbRefresh();
        if (Input.trigger(Input.BACK)) {
          ret = null;
          return;
        } else if (Input.trigger(Input.USE)) {
          if (itemwindow.index < slots(this.bag).length) {
            this.pbRefresh();
            ret = slots(this.bag)[itemwindow.index]![0];
          } else {
            ret = null;
          }
          return;
        }
      }
    });
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class WithdrawItemScene extends ItemStorage_Scene {
  constructor() {
    super(_INTL("Withdraw\nItem"));
  }
}

//===============================================================================
//
//===============================================================================
export class TossItemScene extends ItemStorage_Scene {
  constructor() {
    super(_INTL("Toss\nItem"));
  }
}
