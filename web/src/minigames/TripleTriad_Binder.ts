// Port of Plugins/Triple Triad Booster Packs/TripleTriad_Binder.rb: the TCG
// Binder (pbTriadBinder), a 6x3 page of the player's cards. Its
// TriadCard#createNewBitmap is in TripleTriad.ts.
//
// The binder's loop is per 60 Hz tick: nothing in it counts frames.

import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../game/GameSystem";
import type { Bitmap } from "../rgss/Bitmap";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color, Rect } from "../rgss/types";
import { AnimatedBitmap } from "../ui/AnimatedBitmap";
import { drawTextEx, pbDrawImagePositions, pbDrawTextPositions, type TextPosition } from "../ui/drawText";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../ui/fades";
import { _INTL, pbBottomLeftLines, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../ui/messageConfig";
import { pbPlayCloseMenuSE } from "../ui/options/options";
import { addBackgroundPlane } from "../ui/planes";
import { preloadBitmaps } from "../ui/rpgCache";
import { asHash, type Sprites } from "../ui/scenes/frames";
import { AnimatedSprite, BitmapSprite } from "../ui/SpriteWrapper";
import { MoveSelectionSprite } from "../ui/summary/summary";
import { Window_AdvancedTextPokemon } from "../ui/windows/SpriteWindowText";
import { preloadTriadCards, TriadCard, triads, type TriadStorage } from "./TripleTriad";

export const TOTAL_COLUMNS = 6;
export const TOTAL_VISIBLE_ROWS = 3;
export const CARD_WIDTH = 82; // Extra 2px for spacing
export const CARD_HEIGHT = 98; // Extra 2px for spacing
export const START_X_POS = 10;
export const START_Y_POS = 24;

/** Ruby's Integer#% and #/ (floored). */
const mod = (a: number, b: number) => ((a % b) + b) % b;
const div = (a: number, b: number) => Math.floor(a / b);

export const BINDER_BITMAPS = [
  "Graphics/Pictures/Triple Triad/bg", "Graphics/Pictures/Triple Triad/overlay",
  "Graphics/Pictures/Triple Triad/cursor_binder", "Graphics/Pictures/Summary/cursor_move",
  "Graphics/Pictures/uparrow", "Graphics/Pictures/downarrow",
];

export class TripleTriadBinder_Scene {
  private cardOffset = 0;
  private viewport!: Viewport;
  private sprites: Sprites = {};
  private partyindex = 0;
  private cards!: TriadStorage;
  private selCard = 0;
  private oldselribbon = 0;
  private switching = false;
  private numCards = 0;
  private numRows = 0;

  private get overlay(): Bitmap { return (this.sprites.overlay as BitmapSprite).bitmap!; }
  private get cardsel(): CardSelectionSprite { return this.sprites.cardsel as CardSelectionSprite; }
  private get cardpresel(): CardSelectionSprite { return this.sprites.cardpresel as CardSelectionSprite; }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbStartScene(): Promise<void> {
    this.cardOffset = 0;
    this.cards = triads();
    await preloadBitmaps(BINDER_BITMAPS);
    await preloadTriadCards(this.cards.items.map((slot) => slot[0]));
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    this.partyindex = 0;

    addBackgroundPlane(this.sprites, "background", "Triple Triad/bg", this.viewport);

    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites.overlay = overlay;
    pbSetSystemFont(overlay.bitmap!);
    const cardpresel = new CardSelectionSprite(this.viewport);
    this.sprites.cardpresel = cardpresel;
    cardpresel.show(false);
    cardpresel.preselected = true;
    const cardsel = new CardSelectionSprite(this.viewport);
    this.sprites.cardsel = cardsel;
    cardsel.show(false);
    const uparrow = AnimatedSprite.createLong("Graphics/Pictures/uparrow", 8, 28, 40, 2, this.viewport);
    this.sprites.uparrow = uparrow;
    uparrow.x = 350;
    uparrow.y = 56;
    uparrow.play();
    uparrow.visible = false;
    const downarrow = AnimatedSprite.createLong("Graphics/Pictures/downarrow", 8, 28, 40, 2, this.viewport);
    this.sprites.downarrow = downarrow;
    downarrow.x = 350;
    downarrow.y = 260;
    downarrow.play();
    downarrow.visible = false;
    const messagebox = new Window_AdvancedTextPokemon("");
    this.sprites.messagebox = messagebox;
    messagebox.viewport = this.viewport;
    messagebox.visible = false;
    messagebox.letterbyletter = true;
    pbBottomLeftLines(messagebox, 2);

    this.selCard = this.cardOffset * TOTAL_COLUMNS;
    this.oldselribbon = this.selCard;
    this.switching = false;
    this.numCards = this.cards.length();
    // NOTE (Ruby parity): TripleTriad_Binder.rb:51 rounds the row count with
    // TOTAL_VISIBLE_ROWS (3) instead of TOTAL_COLUMNS - 1 (5): with 19 or 20
    // cards (25-26, ...) the last row isn't counted and its cards can't be
    // reached.
    this.numRows = Math.max(div(this.numCards + TOTAL_VISIBLE_ROWS, TOTAL_COLUMNS), TOTAL_VISIBLE_ROWS);

    this.drawPage();
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  async pbDisplay(text: string): Promise<void> {
    const messagebox = this.sprites.messagebox as Window_AdvancedTextPokemon;
    messagebox.text = text;
    messagebox.visible = true;
    pbPlayDecisionSE();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (messagebox.busy()) {
        if (Input.trigger(Input.USE)) {
          if (messagebox.pausing()) pbPlayDecisionSE();
          messagebox.resume();
        }
      } else if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) {
        break;
      }
    }
    messagebox.visible = false;
  }

  drawPage(): void {
    const overlay = this.overlay;
    (this.sprites.uparrow as AnimatedSprite).visible = false;
    (this.sprites.downarrow as AnimatedSprite).visible = false;
    // Write various bits of text
    const textpos: TextPosition[] = [
      [_INTL("No. of Cards:"), 234, 2, 0, new Color(64, 64, 64), new Color(176, 176, 176)],
      [String(this.numCards), 450, 2, 1, new Color(64, 64, 64), new Color(176, 176, 176)],
    ];
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
    // Show all ribbons
    const imagepos: [Bitmap, number, number][] = [];
    let coord = 0;
    for (let i = this.cardOffset * TOTAL_COLUMNS; i < (this.cardOffset * TOTAL_COLUMNS) + (TOTAL_COLUMNS * TOTAL_VISIBLE_ROWS); i++) {
      // break if !@cards[i]
      let bitmapCard: Bitmap;
      if (!this.cards.at(i)) {
        // There's some bug on how I'm displaying the cards, so I can't break here, as it adds repeated cards somehow
        // To overcome this, I'm then displaying the first card of the deck, but with createModifiedBitmap(0)
        // which generates a flipped card
        // @todo: improve this!!
        // NOTE (Ruby parity): with no cards at all @cards[0] is nil (NoMethodError).
        const first = this.cards.at(0);
        if (!first) throw new TypeError("undefined method `[]' for nil (Triple Triad binder with no cards)");
        bitmapCard = new TriadCard(first[0]).createModifiedBitmap(0);
      } else {
        bitmapCard = new TriadCard(this.cards.at(i)![0]).createModifiedBitmap(1);
      }
      imagepos.push([bitmapCard,
        START_X_POS + (CARD_WIDTH * (coord % TOTAL_COLUMNS)), START_Y_POS + (CARD_HEIGHT * div(coord, TOTAL_COLUMNS))]);
      coord += 1;
    }
    // Draw all images
    this.pbDrawImagePositionsModified(overlay, imagepos);
  }

  pbDrawImagePositionsModified(bitmap: Bitmap, textpos: [Bitmap, number, number, number?, number?, number?, number?][]): void {
    for (const i of textpos) {
      const srcbitmap = i[0];
      const x = i[1];
      const y = i[2];
      const srcx = i[3] ?? 0;
      const srcy = i[4] ?? 0;
      const width = (i[5] != null && i[5] >= 0) ? i[5] : srcbitmap.width;
      const height = (i[6] != null && i[6] >= 0) ? i[6] : srcbitmap.height;
      const srcrect = new Rect(srcx, srcy, width, height);
      bitmap.blt(x, y, srcbitmap, srcrect);
      srcbitmap.dispose();
    }
  }

  drawSelectedRibbon(cardIndex: number): void {
    // Draw all of page
    this.drawPage();

    const overlay = this.overlay;
    const base = new Color(64, 64, 64);
    const shadow = new Color(176, 176, 176);
    const nameBase = new Color(248, 248, 248);
    const nameShadow = new Color(104, 104, 104);
    // Get data for selected ribbon
    if (cardIndex < this.numCards) {
      // item = $PokemonGlobal.triads[cardIndex]
      // species = GameData::Species.get(item[0])

      const item = this.cards.at(cardIndex)!;
      const species = new TriadCard(item[0]);
      // species = GameData::Species.get(@cards[cardIndex][0])

      const name = species.name; // Ruby: `cardIndex ? species.name : ""` (0 is truthy)
      const desc = `X ${item[1]}`;
      // Draw the description box
      pbDrawImagePositions(overlay, [["Graphics/Pictures/Triple Triad/overlay", 8, 320]]);
      // Draw name of selected ribbon
      pbDrawTextPositions(overlay, [[name, 18, 323, 0, nameBase, nameShadow]]);
      // Draw selected ribbon's description
      drawTextEx(overlay, 18, 332, 480, 2, desc, base, shadow);
    }
  }

  async pbScene(): Promise<number> {
    let hasMovedCursor = false;
    let switching = false;
    this.cardsel.show(true);
    this.cardsel.index = 0;

    this.drawSelectedRibbon(0);

    for (;;) {
      (this.sprites.uparrow as AnimatedSprite).visible = (this.cardOffset > 0);
      (this.sprites.downarrow as AnimatedSprite).visible = (this.cardOffset < this.numRows - TOTAL_VISIBLE_ROWS);
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      const dorefresh = false;
      if (this.cardpresel.index === this.cardsel.index) {
        this.cardpresel.z = this.cardsel.z + 1;
      } else {
        this.cardpresel.z = this.cardsel.z;
      }
      hasMovedCursor = false;
      // if Input.trigger?(Input::ACTION)
      //   pbSEStop
      //   @pokemon.play_cry
      // els
      if (Input.trigger(Input.BACK)) {
        // NOTE (Ruby parity): TripleTriad_Binder.rb:200-201 plays the close sound twice.
        pbPlayCloseMenuSE();
        (switching) ? pbPlayCancelSE() : pbPlayCloseMenuSE();
        if (!switching) break;
        this.cardpresel.show(false);
        switching = false;
      } else if (Input.trigger(Input.USE)) {
        pbPlayCancelSE();
        // This part is not working, but will not worry about switching cards position for now
        // as I'm not even sure I want that
      } else if (Input.trigger(Input.UP)) {
        this.selCard -= TOTAL_COLUMNS;
        if (this.selCard < 0) this.selCard += this.numRows * TOTAL_COLUMNS;
        hasMovedCursor = true;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.DOWN)) {
        this.selCard += TOTAL_COLUMNS;
        if (this.selCard >= this.numRows * TOTAL_COLUMNS) this.selCard -= this.numRows * TOTAL_COLUMNS;
        hasMovedCursor = true;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.LEFT)) {
        this.selCard -= 1;
        if (mod(this.selCard, TOTAL_COLUMNS) === TOTAL_COLUMNS - 1) this.selCard += TOTAL_COLUMNS;
        hasMovedCursor = true;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.RIGHT)) {
        this.selCard += 1;
        if (mod(this.selCard, TOTAL_COLUMNS) === 0) this.selCard -= TOTAL_COLUMNS;
        hasMovedCursor = true;
        pbPlayCursorSE();
      }
      if (!hasMovedCursor) continue;
      if (this.selCard < this.cardOffset * TOTAL_COLUMNS) this.cardOffset = div(this.selCard, TOTAL_COLUMNS);
      if (this.selCard >= (this.cardOffset + TOTAL_VISIBLE_ROWS) * TOTAL_COLUMNS) this.cardOffset = div(this.selCard, TOTAL_COLUMNS) - (TOTAL_VISIBLE_ROWS - 1);
      if (this.cardOffset < 0) this.cardOffset = 0;
      if (this.cardOffset > this.numRows - (TOTAL_VISIBLE_ROWS)) this.cardOffset = this.numRows - (TOTAL_VISIBLE_ROWS);
      this.cardsel.index = this.selCard - (this.cardOffset * TOTAL_COLUMNS);
      this.cardpresel.index = this.oldselribbon - (this.cardOffset * TOTAL_COLUMNS);
      this.drawSelectedRibbon(this.selCard);
      if (dorefresh) this.drawPage();
    }
    return this.partyindex;
  }
}

export class TripleTriadBinderScreen {
  constructor(private scene: TripleTriadBinder_Scene) {}

  async pbStartScreen(): Promise<number> {
    await this.scene.pbStartScene();
    const ret = await this.scene.pbScene();
    await this.scene.pbEndScene();
    return ret;
  }
}

export class CardSelectionSprite extends MoveSelectionSprite {
  /** MoveSelectionSprite's @spriteVisible: what visible= last set outside update. */
  spriteVisible = true;
  private cardUpdating = false;

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.movesel = new AnimatedBitmap("Graphics/Pictures/Triple Triad/cursor_binder");
    this.frame = 0;
    this._index = 0;
    this._preselected = false;
    this.cardUpdating = false;
    this.spriteVisible = true;
    this.refresh();
  }

  /** visible= (remembers the value unless it's update setting it). */
  show(value: boolean): void {
    this.visible = value;
    if (!this.cardUpdating) this.spriteVisible = value;
  }

  override refresh(): void {
    const w = this.movesel.width;
    const h = Math.floor(this.movesel.height / 2);
    this.z = 2;
    this.x = (START_X_POS - 2) + (mod(this.index, TOTAL_COLUMNS) * CARD_WIDTH);
    this.y = (START_Y_POS - 2) + (div(this.index, TOTAL_COLUMNS) * CARD_HEIGHT);
    this.setBitmap(this.movesel.bitmap);
    if (this.preselected) {
      this.srcRect.set(0, h, w, h);
    } else {
      this.srcRect.set(0, 0, w, h);
    }
  }

  override update(dt?: number): void {
    this.cardUpdating = true;
    super.update(dt);
    this.show(this.spriteVisible && this.index >= 0 && this.index < (TOTAL_COLUMNS * TOTAL_VISIBLE_ROWS));
    this.movesel.update();
    this.cardUpdating = false;
    this.refresh();
  }
}
