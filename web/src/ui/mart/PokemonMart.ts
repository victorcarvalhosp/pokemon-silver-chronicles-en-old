// Port of 016_UI/020_UI_PokeMart.rb: PokemonMartAdapter, BuyAdapter,
// SellAdapter, Window_PokemonMart, PokemonMart_Scene, PokemonMartScreen and
// pbPokemonMart, plus pbScrollMap (004_Game classes/004_Game_Map.rb:460) and
// the Interpreter's setPrice / setSellPrice (003_Interpreter.rb:451).
// Plugin changes:
// - v20.1 Hotfixes (Misc bug fixes.rb:315-428): "Fixed item sell prices being
//   25% of the buy prices rather than 50%": PokemonMart_Scene#pbChooseNumber
//   and PokemonMartScreen#pbSellScreen no longer halve the sell price.
// - Triple Triad Booster Packs (pbBuyTriads) is its own shop, not a mart.
//
// Timing: pbDisplay's auto-close (frame_rate * 3 / 2) and the sell screen's
// fade (frame_rate * 4 / 10) scale by Graphics.frame_rate, so they're ported
// as written with FRAME_RATE = 60.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { FRAME_RATE } from "../../game/GameCharacter";
import type { GameMap } from "../../game/GameMap";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../../game/GameSystem";
import { pbPlayCloseMenuSE } from "../options/options";
import { G, pbUpdateSceneMap } from "../../game/globals";
import type { PokemonBag } from "../../game/items/PokemonBag";
import type { GameStats } from "../../game/trainer/GameStats";
import type { Player } from "../../game/trainer/Player";
import { defineScript } from "../../game/scriptApi";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, type Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { PokemonBag_Scene } from "../bag/bag";
import { pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbActivateWindow, pbDeactivateWindows } from "../fades";
import { _INTL, pbBottomLeftLines, pbBottomRight, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbGetGoldString, pbMessage } from "../messages";
import { preloadBitmaps } from "../rpgCache";
import { asHash } from "../scenes/frames";
import { ItemIconSprite, itemIconFilename, preloadItemIcons } from "../sprites/itemIcon";
import { IconSprite } from "../SpriteWrapper";
import { Window_AdvancedTextPokemon, Window_CommandPokemon, Window_DrawableCommand, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";

const player = () => G.player as unknown as Player;
const bag = () => G.bag as PokemonBag;
const stats = () => G.stats as GameStats;
const martPrices = () => (G.gameTemp as unknown as { martPrices: Record<string, [number, number]> }).martPrices;

/** Settings::MORE_BONUS_PREMIER_BALLS (001_Settings.rb:86, MECHANICS_GENERATION is 8 there). */
const MORE_BONUS_PREMIER_BALLS = true;

/** Integer#to_s_formatted: thousands separators. */
export function toSFormatted(n: number): string {
  const s = String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${s}` : s;
}

//===============================================================================
// Abstraction layer for Pokemon Essentials
//===============================================================================
export class PokemonMartAdapter {
  getMoney(): number {
    return player().money;
  }

  getMoneyString(): string {
    return pbGetGoldString();
  }

  setMoney(value: number): void {
    player().money = value;
  }

  getInventory(): PokemonBag {
    return bag();
  }

  getName(item: Id): string {
    return Item.get(item).name;
  }

  getNamePlural(item: Id): string {
    return Item.get(item).namePlural;
  }

  getDisplayName(item: Id): string {
    let itemName = this.getName(item);
    if (Item.get(item).isMachine()) {
      const machine = Item.get(item).move!;
      itemName = _INTL("{1} {2}", itemName, MoveData.get(machine).name);
    }
    return itemName;
  }

  getDisplayNamePlural(item: Id): string {
    let itemNamePlural = this.getNamePlural(item);
    if (Item.get(item).isMachine()) {
      const machine = Item.get(item).move!;
      itemNamePlural = _INTL("{1} {2}", itemNamePlural, MoveData.get(machine).name);
    }
    return itemNamePlural;
  }

  getDescription(item: Id): string {
    return Item.get(item).description;
  }

  getItemIcon(item: Id | null): string | null {
    return item ? itemIconFilename(item) : null;
  }

  getQuantity(item: Id | null): number {
    return item ? bag().quantity(item) : 0;
  }

  /** showQuantity? */
  showQuantity(item: Id): boolean {
    return !Item.get(item).isImportant();
  }

  getPrice(item: Id, selling = false): number {
    const prices = martPrices();
    const entry = prices?.[item];
    if (entry) {
      if (selling) {
        if (entry[1] >= 0) return entry[1];
      } else if (entry[0] > 0) {
        return entry[0];
      }
    }
    if (selling) return Item.get(item).sellPrice;
    return Item.get(item).price;
  }

  getDisplayPrice(item: Id, selling = false): string {
    const price = toSFormatted(this.getPrice(item, selling));
    return _INTL("$ {1}", price);
  }

  /** canSell? */
  canSell(item: Id): boolean {
    return this.getPrice(item, true) > 0 && !Item.get(item).isImportant();
  }

  addItem(item: Id): boolean {
    return bag().add(item);
  }

  removeItem(item: Id): boolean {
    return bag().remove(item);
  }
}

//===============================================================================
// Buy and Sell adapters
//===============================================================================
interface WindowAdapter {
  getDisplayName(item: Id): string;
  getDisplayNamePlural(item: Id): string;
  getDisplayPrice(item: Id): string;
  isSelling(): boolean;
}

export class BuyAdapter implements WindowAdapter {
  constructor(private adapter: PokemonMartAdapter) {}
  getDisplayName(item: Id): string { return this.adapter.getDisplayName(item); }
  getDisplayNamePlural(item: Id): string { return this.adapter.getDisplayNamePlural(item); }
  getDisplayPrice(item: Id): string { return this.adapter.getDisplayPrice(item, false); }
  isSelling(): boolean { return false; }
}

//===============================================================================
//
//===============================================================================
export class SellAdapter implements WindowAdapter {
  constructor(private adapter: PokemonMartAdapter) {}
  getDisplayName(item: Id): string { return this.adapter.getDisplayName(item); }
  getDisplayNamePlural(item: Id): string { return this.adapter.getDisplayNamePlural(item); }
  getDisplayPrice(item: Id): string {
    if (this.adapter.showQuantity(item)) return `x${this.adapter.getQuantity(item)}`;
    return "";
  }
  isSelling(): boolean { return true; }
}

//===============================================================================
// Pokémon Mart
//===============================================================================
export class Window_PokemonMart extends Window_DrawableCommand {
  private stock!: Id[];
  private adapter!: WindowAdapter;

  constructor(stock: Id[], adapter: WindowAdapter, x: number, y: number, width: number, height: number, viewport: Viewport | null = null) {
    super(x, y, width, height, viewport);
    this.stock = stock;
    this.adapter = adapter;
    this._selarrow = new AnimatedBitmap("Graphics/Pictures/martSel");
    this._baseColor = new Color(88, 88, 80);
    this._shadowColor = new Color(168, 184, 184);
    this.windowskin = null;
    this.refresh();
  }

  override itemCount(): number {
    if (!this.stock) return 1; // (called from the superclass before Ruby's ivars exist)
    return this.stock.length + 1;
  }

  get item(): Id | null {
    return this.index >= this.stock.length ? null : this.stock[this.index]!;
  }

  override drawItem(index: number, count: number, rect: Rect): void {
    if (!this.stock) return;
    const textpos: TextPosition[] = [];
    rect = this.drawCursor(index, rect);
    const ypos = rect.y;
    if (index === count - 1) {
      textpos.push([_INTL("CANCEL"), rect.x, ypos + 2, false, this.baseColor, this.shadowColor]);
    } else {
      const item = this.stock[index]!;
      const itemname = this.adapter.getDisplayName(item);
      const qty = this.adapter.getDisplayPrice(item);
      const sizeQty = this.contents!.textSize(qty).width;
      const xQty = rect.x + rect.width - sizeQty - 2 - 16;
      textpos.push([itemname, rect.x, ypos + 2, false, this.baseColor, this.shadowColor]);
      textpos.push([qty, xQty, ypos + 2, false, this.baseColor, this.shadowColor]);
    }
    pbDrawTextPositions(this.contents!, textpos);
  }
}

//===============================================================================
//
//===============================================================================
type MartSprites = {
  background?: IconSprite;
  icon?: ItemIconSprite;
  itemwindow?: Window_PokemonMart;
  itemtextwindow?: Window_UnformattedTextPokemon;
  helpwindow: Window_AdvancedTextPokemon;
  moneywindow: Window_AdvancedTextPokemon;
  qtywindow?: Window_AdvancedTextPokemon;
};

/** What PokemonMartScreen asks of PokemonMart_Scene. */
export interface MartScene {
  pbStartBuyScene(stock: Id[], adapter: PokemonMartAdapter): Promise<void>;
  pbStartSellScene(bag: PokemonBag, adapter: PokemonMartAdapter): Promise<void>;
  pbEndBuyScene(): Promise<void>;
  pbEndSellScene(): Promise<void>;
  pbChooseBuyItem(): Promise<Id | null>;
  pbChooseSellItem(): Promise<Id | null>;
  pbChooseNumber(helptext: string, item: Id, maximum: number): Promise<number>;
  pbDisplay(msg: string, brief?: boolean): Promise<void>;
  pbDisplayPaused(msg: string, block?: () => void): Promise<void>;
  pbConfirm(msg: string): Promise<boolean>;
  pbShowMoney(): void;
  pbHideMoney(): void;
  pbRefresh(): void;
}

/** Fetches the mart screen's graphics and the stock's icons. */
async function preloadMart(stock: Id[]): Promise<void> {
  await Promise.all([
    preloadBitmaps(["Graphics/Pictures/martScreen", "Graphics/Pictures/martSel", "Graphics/Windowskins/goldskin"]),
    preloadItemIcons(stock),
  ]);
}

export class PokemonMart_Scene implements MartScene {
  private viewport!: Viewport;
  private viewport2: Viewport | null = null;
  private stock: Id[] = [];
  private adapter!: PokemonMartAdapter;
  private sprites!: MartSprites;
  private subscene: PokemonBag_Scene | null = null;
  private buying = false;

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
    this.subscene?.pbUpdate();
  }

  pbRefresh(): void {
    if (this.subscene) {
      this.subscene.pbRefresh();
    } else {
      const s = this.sprites;
      const itemwindow = s.itemwindow!;
      s.icon!.item = itemwindow.item;
      s.itemtextwindow!.text = itemwindow.item ? this.adapter.getDescription(itemwindow.item) : _INTL("Quit shopping.");
      s.qtywindow!.visible = itemwindow.item != null;
      s.qtywindow!.text = _INTL("In Bag:<r>{1}", this.adapter.getQuantity(itemwindow.item));
      s.qtywindow!.y = Graphics.height - 102 - s.qtywindow!.height;
      itemwindow.refresh();
    }
    this.sprites.moneywindow.text = _INTL("Money:\r\n<r>{1}", this.adapter.getMoneyString());
  }

  async pbStartBuyOrSellScene(buying: boolean, stock: Id[], adapter: PokemonMartAdapter): Promise<void> {
    await preloadMart(stock);
    // Scroll right before showing screen
    await pbScrollMap(6, 5, 5);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.stock = stock;
    this.adapter = adapter;
    const vp = this.viewport;
    const background = new IconSprite(0, 0, vp);
    background.setBitmapFile("Graphics/Pictures/martScreen");
    const icon = new ItemIconSprite(36, Graphics.height - 50, null, vp);
    const winAdapter = buying ? new BuyAdapter(adapter) : new SellAdapter(adapter);
    const itemwindow = new Window_PokemonMart(stock, winAdapter, Graphics.width - 316 - 16, 10, 330 + 16, Graphics.height - 124);
    itemwindow.viewport = vp;
    itemwindow.index = 0;
    itemwindow.refresh();
    const itemtextwindow = Window_UnformattedTextPokemon.newWithSize("", 64, Graphics.height - 96 - 16, Graphics.width - 64, 128, vp);
    this.pbPrepareWindow(itemtextwindow);
    itemtextwindow.baseColor = new Color(248, 248, 248);
    itemtextwindow.shadowColor = new Color(0, 0, 0);
    itemtextwindow.windowskin = null;
    const helpwindow = new Window_AdvancedTextPokemon("");
    this.pbPrepareWindow(helpwindow);
    helpwindow.visible = false;
    helpwindow.viewport = vp;
    pbBottomLeftLines(helpwindow, 1);
    const moneywindow = new Window_AdvancedTextPokemon("");
    this.pbPrepareWindow(moneywindow);
    moneywindow.setSkin("Graphics/Windowskins/goldskin");
    moneywindow.visible = true;
    moneywindow.viewport = vp;
    moneywindow.x = 0;
    moneywindow.y = 0;
    moneywindow.width = 190;
    moneywindow.height = 96;
    moneywindow.baseColor = new Color(88, 88, 80);
    moneywindow.shadowColor = new Color(168, 184, 184);
    const qtywindow = new Window_AdvancedTextPokemon("");
    this.pbPrepareWindow(qtywindow);
    qtywindow.setSkin("Graphics/Windowskins/goldskin");
    qtywindow.viewport = vp;
    qtywindow.width = 190;
    qtywindow.height = 64;
    qtywindow.baseColor = new Color(88, 88, 80);
    qtywindow.shadowColor = new Color(168, 184, 184);
    qtywindow.text = _INTL("In Bag:<r>{1}", this.adapter.getQuantity(itemwindow.item));
    qtywindow.y = Graphics.height - 102 - qtywindow.height;
    this.sprites = { background, icon, itemwindow, itemtextwindow, helpwindow, moneywindow, qtywindow };
    await pbDeactivateWindows(asHash(this.sprites));
    this.buying = buying;
    this.pbRefresh();
  }

  async pbStartBuyScene(stock: Id[], adapter: PokemonMartAdapter): Promise<void> {
    await this.pbStartBuyOrSellScene(true, stock, adapter);
  }

  async pbStartSellScene(bagArg: PokemonBag, adapter: PokemonMartAdapter): Promise<void> {
    if (G.bag) await this.pbStartSellScene2(bagArg, adapter);
    else await this.pbStartBuyOrSellScene(false, bagArg as unknown as Id[], adapter);
  }

  async pbStartSellScene2(bagArg: PokemonBag, adapter: PokemonMartAdapter): Promise<void> {
    await preloadMart([]);
    this.subscene = new PokemonBag_Scene();
    this.adapter = adapter;
    this.viewport2 = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport2.z = 99999;
    const numFrames = Math.floor((FRAME_RATE * 4) / 10);
    const alphaDiff = Math.ceil(255.0 / numFrames);
    for (let j = 0; j <= numFrames; j++) {
      this.viewport2.color = new Color(0, 0, 0, j * alphaDiff);
      await Graphics.update();
      Input.update();
    }
    await this.subscene.pbStartScene(bagArg);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const vp = this.viewport;
    const helpwindow = new Window_AdvancedTextPokemon("");
    this.pbPrepareWindow(helpwindow);
    helpwindow.visible = false;
    helpwindow.viewport = vp;
    pbBottomLeftLines(helpwindow, 1);
    const moneywindow = new Window_AdvancedTextPokemon("");
    this.pbPrepareWindow(moneywindow);
    moneywindow.setSkin("Graphics/Windowskins/goldskin");
    moneywindow.visible = false;
    moneywindow.viewport = vp;
    moneywindow.x = 0;
    moneywindow.y = 0;
    moneywindow.width = 186;
    moneywindow.height = 96;
    moneywindow.baseColor = new Color(88, 88, 80);
    moneywindow.shadowColor = new Color(168, 184, 184);
    this.sprites = { helpwindow, moneywindow };
    await pbDeactivateWindows(asHash(this.sprites));
    this.buying = false;
    this.pbRefresh();
  }

  async pbEndBuyScene(): Promise<void> {
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
    // Scroll left after showing screen
    await pbScrollMap(4, 5, 5);
  }

  async pbEndSellScene(): Promise<void> {
    if (this.subscene) await this.subscene.pbEndScene();
    pbDisposeSpriteHash(this.sprites as never);
    if (this.viewport2) {
      const numFrames = Math.floor((FRAME_RATE * 4) / 10);
      const alphaDiff = Math.ceil(255.0 / numFrames);
      for (let j = 0; j <= numFrames; j++) {
        this.viewport2.color = new Color(0, 0, 0, (numFrames - j) * alphaDiff);
        await Graphics.update();
        Input.update();
      }
      this.viewport2.dispose();
    }
    this.viewport.dispose();
    if (!this.subscene) await pbScrollMap(4, 5, 5);
  }

  pbPrepareWindow(window: { visible: boolean; letterbyletter: boolean }): void {
    window.visible = true;
    window.letterbyletter = false;
  }

  pbShowMoney(): void {
    this.pbRefresh();
    this.sprites.moneywindow.visible = true;
  }

  pbHideMoney(): void {
    this.pbRefresh();
    this.sprites.moneywindow.visible = false;
  }

  pbShowQuantity(): void {
    this.pbRefresh();
    this.sprites.qtywindow!.visible = true;
  }

  pbHideQuantity(): void {
    this.pbRefresh();
    this.sprites.qtywindow!.visible = false;
  }

  async pbDisplay(msg: string, brief = false): Promise<void> {
    const cw = this.sprites.helpwindow;
    cw.letterbyletter = true;
    cw.text = msg;
    pbBottomLeftLines(cw, 2);
    cw.visible = true;
    let i = 0;
    pbPlayDecisionSE();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.update();
      if (!cw.busy()) {
        if (brief) return;
        if (i === 0) this.pbRefresh();
      }
      if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) {
        if (cw.busy()) cw.resume();
      }
      if (i >= Math.floor((FRAME_RATE * 3) / 2)) return;
      if (!cw.busy()) i += 1;
    }
  }

  async pbDisplayPaused(msg: string, block?: () => void): Promise<void> {
    const cw = this.sprites.helpwindow;
    cw.letterbyletter = true;
    cw.text = msg;
    pbBottomLeftLines(cw, 2);
    cw.visible = true;
    let yielded = false;
    pbPlayDecisionSE();
    for (;;) {
      await Graphics.update();
      Input.update();
      const wasbusy = cw.busy();
      this.update();
      if (!cw.busy() && !yielded) {
        block?.(); // For playing SE as soon as the message is all shown
        yielded = true;
      }
      if (!cw.busy() && wasbusy) this.pbRefresh();
      if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) {
        if (cw.resume() && !cw.busy()) {
          this.sprites.helpwindow.visible = false;
          break;
        }
      }
    }
  }

  async pbConfirm(msg: string): Promise<boolean> {
    const dw = this.sprites.helpwindow;
    dw.letterbyletter = true;
    dw.text = msg;
    dw.visible = true;
    pbBottomLeftLines(dw, 2);
    const commands = [_INTL("Yes"), _INTL("No")];
    const cw = new Window_CommandPokemon(commands);
    cw.viewport = this.viewport;
    pbBottomRight(cw);
    cw.y -= dw.height;
    cw.index = 0;
    pbPlayDecisionSE();
    for (;;) {
      cw.visible = !dw.busy();
      await Graphics.update();
      Input.update();
      cw.update();
      this.update();
      if (Input.trigger(Input.BACK) && dw.resume() && !dw.busy()) {
        cw.dispose();
        this.sprites.helpwindow.visible = false;
        return false;
      }
      if (Input.trigger(Input.USE) && dw.resume() && !dw.busy()) {
        cw.dispose();
        this.sprites.helpwindow.visible = false;
        return cw.index === 0;
      }
    }
  }

  /** v20.1 Hotfixes' pbChooseNumber (the sell price isn't halved). */
  async pbChooseNumber(helptext: string, item: Id, maximum: number): Promise<number> {
    let curnumber = 1;
    let ret = 0;
    const helpwindow = this.sprites.helpwindow;
    const itemprice = this.adapter.getPrice(item, !this.buying);
    await this.pbDisplay(helptext, true);
    const numwindow = new Window_AdvancedTextPokemon(""); // Showing number of items
    try {
      this.pbPrepareWindow(numwindow);
      numwindow.viewport = this.viewport;
      numwindow.width = 224;
      numwindow.height = 64;
      numwindow.baseColor = new Color(88, 88, 80);
      numwindow.shadowColor = new Color(168, 184, 184);
      const text = () => _INTL("x{1}<r>$ {2}", curnumber, toSFormatted(curnumber * itemprice));
      numwindow.text = text();
      pbBottomRight(numwindow);
      numwindow.y -= helpwindow.height;
      for (;;) {
        await Graphics.update();
        Input.update();
        numwindow.update();
        this.update();
        const oldnumber = curnumber;
        if (Input.repeat(Input.LEFT)) {
          curnumber -= 10;
          if (curnumber < 1) curnumber = 1;
          if (curnumber !== oldnumber) {
            numwindow.text = text();
            pbPlayCursorSE();
          }
        } else if (Input.repeat(Input.RIGHT)) {
          curnumber += 10;
          if (curnumber > maximum) curnumber = maximum;
          if (curnumber !== oldnumber) {
            numwindow.text = text();
            pbPlayCursorSE();
          }
        } else if (Input.repeat(Input.UP)) {
          curnumber += 1;
          if (curnumber > maximum) curnumber = 1;
          if (curnumber !== oldnumber) {
            numwindow.text = text();
            pbPlayCursorSE();
          }
        } else if (Input.repeat(Input.DOWN)) {
          curnumber -= 1;
          if (curnumber < 1) curnumber = maximum;
          if (curnumber !== oldnumber) {
            numwindow.text = text();
            pbPlayCursorSE();
          }
        } else if (Input.trigger(Input.USE)) {
          ret = curnumber;
          break;
        } else if (Input.trigger(Input.BACK)) {
          pbPlayCancelSE();
          ret = 0;
          break;
        }
      }
    } finally {
      numwindow.dispose();
    }
    helpwindow.visible = false;
    return ret;
  }

  async pbChooseBuyItem(): Promise<Id | null> {
    const itemwindow = this.sprites.itemwindow!;
    this.sprites.helpwindow.visible = false;
    let ret: Id | null = null;
    await pbActivateWindow(asHash(this.sprites), "itemwindow", async () => {
      this.pbRefresh();
      for (;;) {
        await Graphics.update();
        Input.update();
        const olditem = itemwindow.item;
        this.update();
        if (itemwindow.item !== olditem) this.pbRefresh();
        if (Input.trigger(Input.BACK)) {
          pbPlayCloseMenuSE();
          ret = null;
          return;
        } else if (Input.trigger(Input.USE)) {
          if (itemwindow.index < this.stock.length) {
            this.pbRefresh();
            ret = this.stock[itemwindow.index]!;
          } else {
            ret = null;
          }
          return;
        }
      }
    });
    return ret;
  }

  async pbChooseSellItem(): Promise<Id | null> {
    if (this.subscene) return this.subscene.pbChooseItem();
    return this.pbChooseBuyItem();
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonMartScreen {
  private adapter = new PokemonMartAdapter();

  constructor(private scene: MartScene, private stock: Id[]) {}

  async pbConfirm(msg: string): Promise<boolean> {
    return this.scene.pbConfirm(msg);
  }

  async pbDisplay(msg: string): Promise<void> {
    await this.scene.pbDisplay(msg);
  }

  async pbDisplayPaused(msg: string, block?: () => void): Promise<void> {
    await this.scene.pbDisplayPaused(msg, block);
  }

  async pbBuyScreen(): Promise<void> {
    await this.scene.pbStartBuyScene(this.stock, this.adapter);
    let item: Id | null = null;
    for (;;) {
      item = await this.scene.pbChooseBuyItem();
      if (!item) break;
      let quantity = 0;
      const itemname = this.adapter.getDisplayName(item);
      const itemnameplural = this.adapter.getDisplayNamePlural(item);
      let price = this.adapter.getPrice(item);
      if (this.adapter.getMoney() < price) {
        await this.pbDisplayPaused(_INTL("You don't have enough money."));
        continue;
      }
      if (Item.get(item).isImportant()) {
        if (!(await this.pbConfirm(_INTL("So you want {1}?\nIt'll be ${2}. All right?", itemname, toSFormatted(price))))) continue;
        quantity = 1;
      } else {
        let maxafford = price <= 0 ? Settings.BAG_MAX_PER_SLOT : Math.floor(this.adapter.getMoney() / price);
        if (maxafford > Settings.BAG_MAX_PER_SLOT) maxafford = Settings.BAG_MAX_PER_SLOT;
        quantity = await this.scene.pbChooseNumber(_INTL("So how many {1}?", itemnameplural), item, maxafford);
        if (quantity === 0) continue;
        price *= quantity;
        if (quantity > 1) {
          if (!(await this.pbConfirm(_INTL("So you want {1} {2}?\nThey'll be ${3}. All right?",
            quantity, itemnameplural, toSFormatted(price))))) continue;
        } else if (quantity > 0) {
          if (!(await this.pbConfirm(_INTL("So you want {1} {2}?\nIt'll be ${3}. All right?",
            quantity, itemname, toSFormatted(price))))) continue;
        }
      }
      if (this.adapter.getMoney() < price) {
        await this.pbDisplayPaused(_INTL("You don't have enough money."));
        continue;
      }
      let added = 0;
      for (let i = 0; i < quantity; i++) {
        if (!this.adapter.addItem(item)) break;
        added += 1;
      }
      if (added === quantity) {
        stats().moneySpentAtMarts += price;
        stats().martItemsBought += quantity;
        this.adapter.setMoney(this.adapter.getMoney() - price);
        for (let i = this.stock.length - 1; i >= 0; i--) {
          const it = this.stock[i]!;
          if (Item.get(it).isImportant() && bag().has(it)) this.stock.splice(i, 1);
        }
        await this.pbDisplayPaused(_INTL("Here you are! Thank you!"), () => pbSEPlay("Mart buy item"));
        if (quantity >= 10 && Item.exists("PREMIERBALL")) {
          if (MORE_BONUS_PREMIER_BALLS && Item.get(item).isPokeBall()) {
            let premierBallsAdded = 0;
            for (let i = 0; i < Math.floor(quantity / 10); i++) {
              if (!this.adapter.addItem("PREMIERBALL")) break;
              premierBallsAdded += 1;
            }
            let ballName = Item.get("PREMIERBALL").name;
            if (premierBallsAdded > 1) ballName = Item.get("PREMIERBALL").namePlural;
            stats().premierBallsEarned += premierBallsAdded;
            await this.pbDisplayPaused(_INTL("And have {1} {2} on the house!", premierBallsAdded, ballName));
          } else if (!MORE_BONUS_PREMIER_BALLS && Item.get(item).id === "POKEBALL") {
            if (this.adapter.addItem("PREMIERBALL")) {
              const ballName = Item.get("PREMIERBALL").name;
              stats().premierBallsEarned += 1;
              await this.pbDisplayPaused(_INTL("And have 1 {1} on the house!", ballName));
            }
          }
        }
      } else {
        for (let i = 0; i < added; i++) {
          if (!this.adapter.removeItem(item)) throw new Error(_INTL("Failed to delete stored items"));
        }
        await this.pbDisplayPaused(_INTL("You have no room in your Bag."));
      }
    }
    await this.scene.pbEndBuyScene();
  }

  /** v20.1 Hotfixes' pbSellScreen (the sell price isn't halved). */
  async pbSellScreen(): Promise<void> {
    await this.scene.pbStartSellScene(this.adapter.getInventory(), this.adapter);
    let item: Id | null = null;
    for (;;) {
      item = await this.scene.pbChooseSellItem();
      if (!item) break;
      const itemname = this.adapter.getDisplayName(item);
      const itemnameplural = this.adapter.getDisplayNamePlural(item);
      if (!this.adapter.canSell(item)) {
        await this.pbDisplayPaused(_INTL("Oh, no. I can't buy {1}.", itemnameplural));
        continue;
      }
      let price = this.adapter.getPrice(item, true);
      let qty = this.adapter.getQuantity(item);
      if (qty === 0) continue;
      this.scene.pbShowMoney();
      if (qty > 1) qty = await this.scene.pbChooseNumber(_INTL("How many {1} would you like to sell?", itemnameplural), item, qty);
      if (qty === 0) {
        this.scene.pbHideMoney();
        continue;
      }
      price *= qty;
      if (await this.pbConfirm(_INTL("I can pay ${1}.\nWould that be OK?", toSFormatted(price)))) {
        const oldMoney = this.adapter.getMoney();
        this.adapter.setMoney(this.adapter.getMoney() + price);
        stats().moneyEarnedAtMarts += this.adapter.getMoney() - oldMoney;
        for (let i = 0; i < qty; i++) this.adapter.removeItem(item);
        const soldItemName = qty > 1 ? itemnameplural : itemname;
        await this.pbDisplayPaused(_INTL("You turned over the {1} and got ${2}.", soldItemName, toSFormatted(price)),
          () => pbSEPlay("Mart buy item"));
        this.scene.pbRefresh();
      }
      this.scene.pbHideMoney();
    }
    await this.scene.pbEndSellScene();
  }
}

//===============================================================================
//
//===============================================================================
/** Which scene pbPokemonMart opens (the tests swap in a recording stub). */
export const MartHooks = { createScene: (): MartScene => new PokemonMart_Scene() };

export async function pbPokemonMart(stock: Id[], speech: string | null = null, cantsell = false): Promise<void> {
  for (let i = stock.length - 1; i >= 0; i--) {
    const item = stock[i]!;
    if (Item.get(item).isImportant() && bag().has(item)) stock.splice(i, 1);
  }
  const commands: string[] = [];
  let cmdBuy = -1;
  let cmdSell = -1;
  let cmdQuit = -1;
  commands[(cmdBuy = commands.length)] = _INTL("I'm here to buy");
  if (!cantsell) commands[(cmdSell = commands.length)] = _INTL("I'm here to sell");
  commands[(cmdQuit = commands.length)] = _INTL("No, thanks");
  let cmd = await pbMessage(speech || _INTL("Welcome! How may I help you?"), commands, cmdQuit + 1);
  for (;;) {
    if (cmdBuy >= 0 && cmd === cmdBuy) {
      const scene = MartHooks.createScene();
      const screen = new PokemonMartScreen(scene, stock);
      await screen.pbBuyScreen();
    } else if (cmdSell >= 0 && cmd === cmdSell) {
      const scene = MartHooks.createScene();
      const screen = new PokemonMartScreen(scene, stock);
      await screen.pbSellScreen();
    } else {
      await pbMessage(_INTL("Do come again!"));
      break;
    }
    cmd = await pbMessage(_INTL("Is there anything else I can do for you?"), commands, cmdQuit + 1);
  }
  (G.gameTemp as unknown as { clearMartPrices(): void }).clearMartPrices();
}

//===============================================================================
// pbScrollMap (004_Game classes/004_Game_Map.rb:460)
//===============================================================================
const REAL_RES_X = 128;
const REAL_RES_Y = 128;

export async function pbScrollMap(direction: number, distance: number, speed: number): Promise<void> {
  const map = G.gameMap as unknown as GameMap | null;
  if (!map) return;
  if (speed === 0) {
    switch (direction) {
      case 2: map.scrollDown(distance * REAL_RES_Y); break;
      case 4: map.scrollLeft(distance * REAL_RES_X); break;
      case 6: map.scrollRight(distance * REAL_RES_X); break;
      case 8: map.scrollUp(distance * REAL_RES_Y); break;
    }
  } else {
    map.startScroll(direction, distance, speed);
    let oldx = map.displayX;
    let oldy = map.displayY;
    for (;;) {
      await Graphics.update();
      Input.update();
      if (!map.scrolling()) break;
      await pbUpdateSceneMap();
      if (map.displayX === oldx && map.displayY === oldy) break;
      oldx = map.displayX;
      oldy = map.displayY;
    }
  }
}

//===============================================================================
// Event scripts
//===============================================================================
defineScript("pbPokemonMart", async (_c, stock, speech, cantsell) => {
  const items = (Array.isArray(stock) ? stock : []) as (Id | null)[];
  // Old events name items through the PBItems constants (Plugins/Pokemon
  // Silver Chronicles Helpers/Pokemon Silver Chronicles Helpers.rb:7). Some
  // marts used names that class doesn't define (POKeBALL, PARLYZHEAL,
  // XDEFEND, XSPECIAL, POKeDOLL), a NameError in Ruby, so they never opened;
  // their event data now uses the v20 IDs (fixed on purpose). A stock naming
  // an item that doesn't exist still keeps the mart closed.
  if (items.some((i) => i == null || !Item.exists(i))) {
    console.warn("pbPokemonMart: the stock names an item that doesn't exist (a NameError in Ruby); the mart doesn't open", stock);
    return;
  }
  await pbPokemonMart(items as Id[], (speech as string | null) ?? null, !!cantsell);
});

/** Interpreter#setPrice (003_Interpreter.rb:451) */
export function setPrice(item: Id, buyPrice = -1, sellPrice = -1): void {
  const id = Item.get(item).id;
  const prices = martPrices();
  if (!prices[id]) prices[id] = [-1, -1];
  if (buyPrice > 0) prices[id]![0] = buyPrice;
  // NOTE (Ruby parity): 003_Interpreter.rb:455-458 store the sell price
  // doubled for the halving pbSellScreen used to do, which the v20.1 Hotfixes
  // removed (Misc bug fixes.rb:384), so a price set here sells for twice what
  // was asked (and a buy price alone sells at the full buy price).
  if (sellPrice >= 0) prices[id]![1] = sellPrice * 2; // 0=can't sell
  else if (buyPrice > 0) prices[id]![1] = buyPrice;
}

/** Interpreter#setSellPrice */
export function setSellPrice(item: Id, sellPrice: number): void {
  setPrice(item, -1, sellPrice);
}

defineScript("setPrice", (_c, item, buy, sell) => setPrice(item as Id, (buy as number) ?? -1, (sell as number) ?? -1));
defineScript("setSellPrice", (_c, item, sell) => setSellPrice(item as Id, sell as number));
