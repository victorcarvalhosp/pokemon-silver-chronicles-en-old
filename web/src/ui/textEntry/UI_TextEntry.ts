// Port of 016_UI/024_UI_TextEntry.rb: Window_CharacterEntry,
// PokemonEntryScene (free typing), PokemonEntryScene2 (arrows to select
// letters), PokemonEntry and pbEnterText & co.
//
// $PokemonSystem.textinput picks the scene: 1 = keyboard, anything else
// (default 0) = cursor. Graphics are preloaded by pbEnterText before the
// scene starts. Animation steps Ruby scales by Graphics.frame_rate use
// FRAME_RATE = 60; raw frame counts (Graphics.frame_count % 5) use the
// original 40 fps frame count.

import { FRAME_RATE } from "../../game/GameCharacter";
import { pbPlayBuzzerSE, pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { playerMetadata } from "../../game/metadata";
import { pbGetPlayerCharset } from "../../game/GamePlayer";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, type Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { type ImagePosition, type TextPosition, pbDrawImagePositions, pbDrawShadowText, pbDrawTextPositions } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { originalFrameCount } from "../frameTime";
import { _INTL, getDefaultTextColors, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { preloadBitmaps } from "../rpgCache";
import { type Sprites, asHash } from "../scenes/frames";
import { addBackgroundPlane, TrainerWalkingCharSprite } from "../planes";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { Window_DrawableCommand, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";
import { KeyboardInput } from "./keyboard";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { PictureOrigin } from "../scenes/PictureEx";
import { PokemonIconSprite, preloadPokemonIcons } from "../sprites/pokemonIcon";
import { CharacterEntryHelper, Window_TextEntry, Window_TextEntry_Keyboard, chars } from "./TextEntry";

/** The few Pokémon methods the naming screen reads (no Pokémon class yet). */
export interface NamingPokemon {
  isMale?(): boolean;
  isFemale?(): boolean;
}

/** subject: 0 none, 1 player, 2 Pokémon, 3 NPC (pokemon = charset name), 4 storage box. */
type Subject = 0 | 1 | 2 | 3 | 4 | number;

//===============================================================================
//
//===============================================================================
export class Window_CharacterEntry extends Window_DrawableCommand {
  static readonly XSIZE = 13;
  static readonly YSIZE = 4;

  declare _charset: string[];
  declare _othercharset: string;

  constructor(charset: string[], viewport: Viewport | null = null) {
    super(0, 96, 480, 192);
    if (viewport) this.viewport = viewport;
    this._charset = charset;
    this._othercharset = "";
    const colors = getDefaultTextColors(this.windowskin);
    this.baseColor = colors[0];
    this.shadowColor = colors[1];
    this.columns = Window_CharacterEntry.XSIZE;
    this.refresh();
  }

  setOtherCharset(value: string): void {
    this._othercharset = value;
    this.refresh();
  }

  setCharset(value: string[]): void {
    this._charset = [...value];
    this.refresh();
  }

  character(): string {
    if (this.index < 0 || this.index >= this._charset.length) return "";
    return this._charset[this.index]!;
  }

  command(): number {
    if (this.index === this._charset.length) return -1;
    if (this.index === this._charset.length + 1) return -2;
    if (this.index === this._charset.length + 2) return -3;
    return this.index;
  }

  override itemCount(): number {
    return (this._charset?.length ?? -3) + 3;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    rect = this.drawCursor(index, rect);
    const draw = (s: string) => pbDrawShadowText(this.contents!, rect.x, rect.y, rect.width, rect.height, s, this.baseColor, this.shadowColor);
    if (index === this._charset.length) { // -1
      draw("[ ]");
    } else if (index === this._charset.length + 1) { // -2
      draw(this._othercharset);
    } else if (index === this._charset.length + 2) { // -3
      draw(_INTL("OK"));
    } else {
      draw(this._charset[index]!);
    }
  }
}

/** Shared by both scenes: the player / Pokémon / NPC / box icon at the top. */
function addSubjectSprites(
  sprites: Sprites, viewport: Viewport, subject: Subject, pokemon: unknown,
  pos: { shadow: [number, number]; char: [number, number]; box: [number, number] },
): void {
  const shadow = () => {
    const s = new IconSprite(0, 0, viewport);
    s.setBitmapFile("Graphics/Pictures/Naming/icon_shadow");
    s.x = pos.shadow[0];
    s.y = pos.shadow[1];
    sprites["shadow"] = s;
  };
  const placeChar = (s: TrainerWalkingCharSprite, cx: number, cy: number, ydiv: number) => {
    const charwidth = s.bitmap?.width ?? 0;
    const charheight = s.bitmap?.height ?? 0;
    s.x = cx - Math.floor(charwidth / 8);
    s.y = cy - Math.floor(charheight / ydiv);
  };
  switch (subject) {
    case 1: { // Player
      const meta = playerMetadata(characterID());
      if (meta) {
        shadow();
        const filename = pbGetPlayerCharset(meta.walkCharset, true);
        const s = new TrainerWalkingCharSprite(filename, viewport);
        sprites["subject"] = s;
        placeChar(s, pos.char[0], pos.char[1], 4);
      }
      break;
    }
    case 2: // Pokémon
      if (pokemon) {
        shadow();
        const icon = new PokemonIconSprite(pokemon as Pokemon, viewport);
        icon.setOffset(PictureOrigin.CENTER);
        icon.x = 88;
        icon.y = 54;
        sprites["subject"] = icon;
        const gender = new BitmapSprite(32, 32, viewport);
        gender.x = 430;
        gender.y = 54;
        gender.bitmap!.clear();
        pbSetSystemFont(gender.bitmap!);
        const textpos: TextPosition[] = [];
        const p = pokemon as NamingPokemon;
        if (p.isMale?.()) {
          textpos.push([_INTL("♂"), 0, 6, false, new Color(0, 128, 248), new Color(168, 184, 184)]);
        } else if (p.isFemale?.()) {
          textpos.push([_INTL("♀"), 0, 6, false, new Color(248, 24, 24), new Color(168, 184, 184)]);
        }
        pbDrawTextPositions(gender.bitmap!, textpos);
        sprites["gender"] = gender;
      }
      break;
    case 3: { // NPC
      shadow();
      const s = new TrainerWalkingCharSprite(String(pokemon ?? ""), viewport);
      sprites["subject"] = s;
      placeChar(s, pos.char[0], pos.char[1], 4);
      break;
    }
    case 4: { // Storage box
      const s = new TrainerWalkingCharSprite(null, viewport);
      s.altcharset = "Graphics/Pictures/Naming/icon_storage";
      s.animspeed = 4;
      sprites["subject"] = s;
      placeChar(s, pos.box[0], pos.box[1], 2);
      break;
    }
  }
}

function characterID(): number {
  return (G.player as unknown as { characterID?: number } | null)?.characterID ?? 0;
}

//===============================================================================
// Text entry screen - free typing.
//===============================================================================
export class PokemonEntryScene {
  static readonly Characters: [string[], string][] = [
    [chars("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"), "[*]"],
    [chars("0123456789   !@#$%^&*()   ~`-_+={}[]   :;'\"<>,.?/   "), "[A]"],
  ];
  static readonly USEKEYBOARD = true;

  private sprites: Sprites = {};
  private viewport!: Viewport;
  private minlength = 0;
  private maxlength = 0;
  private symtype = 0;

  private updateSprite(key: string): void {
    (this.sprites[key] as { update?(): void } | null | undefined)?.update?.();
  }

  private entry(): Window_TextEntry { return this.sprites["entry"] as unknown as Window_TextEntry; }
  private entry2(): Window_CharacterEntry { return this.sprites["entry2"] as unknown as Window_CharacterEntry; }

  async pbStartScene(helptext: string, minlength: number, maxlength: number, initialText: string, subject: Subject = 0, pokemon: unknown = null): Promise<void> {
    const USEKEYBOARD = PokemonEntryScene.USEKEYBOARD;
    const Characters = PokemonEntryScene.Characters;
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    let entry: Window_TextEntry;
    if (USEKEYBOARD) {
      entry = new Window_TextEntry_Keyboard(initialText, 0, 0, 400 - 112, 96, helptext, true);
      KeyboardInput.textInput = true;
    } else {
      entry = new Window_TextEntry(initialText, 0, 0, 400, 96, helptext, true);
    }
    this.sprites["entry"] = entry;
    entry.x = Math.floor(Graphics.width / 2) - Math.floor(entry.width / 2) + 32;
    entry.viewport = this.viewport;
    entry.visible = true;
    this.minlength = minlength;
    this.maxlength = maxlength;
    this.symtype = 0;
    entry.maxlength = maxlength;
    if (!USEKEYBOARD) {
      const entry2 = new Window_CharacterEntry(Characters[this.symtype]![0]);
      entry2.setOtherCharset(Characters[this.symtype]![1]);
      entry2.viewport = this.viewport;
      entry2.visible = true;
      entry2.x = Math.floor(Graphics.width / 2) - Math.floor(entry2.width / 2);
      this.sprites["entry2"] = entry2;
    }
    const help = Window_UnformattedTextPokemon.newWithSize(
      minlength === 0
        ? _INTL("Enter text using the keyboard. Press\nEnter to confirm, or Esc to cancel.")
        : _INTL("Enter text using the keyboard.\nPress Enter to confirm."),
      32, Graphics.height - 96, Graphics.width - 64, 96, this.viewport,
    );
    this.sprites["helpwindow"] = help;
    help.letterbyletter = false;
    help.viewport = this.viewport;
    help.visible = USEKEYBOARD;
    help.baseColor = new Color(16, 24, 32);
    help.shadowColor = new Color(168, 184, 184);
    addBackgroundPlane(this.sprites, "background", "Naming/bg_2", this.viewport);
    addSubjectSprites(this.sprites, this.viewport, subject, pokemon, {
      shadow: [33 * 2, 32 * 2], char: [44 * 2, 38 * 2], box: [44 * 2, 26 * 2],
    });
    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbEntry1(): Promise<string> {
    let ret = "";
    for (;;) {
      await Graphics.update();
      Input.update();
      KeyboardInput.update();
      if (KeyboardInput.triggerex("ESCAPE") && this.minlength === 0) {
        ret = "";
        break;
      } else if (KeyboardInput.triggerex("RETURN") && chars(this.entry().text).length >= this.minlength) {
        ret = this.entry().text;
        break;
      }
      this.updateSprite("helpwindow");
      this.entry().update();
      this.updateSprite("subject");
    }
    Input.update();
    KeyboardInput.update();
    return ret;
  }

  async pbEntry2(): Promise<string> {
    const Characters = PokemonEntryScene.Characters;
    let ret = "";
    for (;;) {
      await Graphics.update();
      Input.update();
      this.updateSprite("helpwindow");
      this.entry().update();
      this.entry2().update();
      this.updateSprite("subject");
      if (Input.trigger(Input.USE)) {
        const index = this.entry2().command();
        if (index === -3) { // Confirm text
          ret = this.entry().text;
          const len = chars(ret).length;
          if (len < this.minlength || len > this.maxlength) {
            pbPlayBuzzerSE();
          } else {
            pbPlayDecisionSE();
            break;
          }
        } else if (index === -1) { // Insert a space
          if (this.entry().insert(" ")) pbPlayDecisionSE();
          else pbPlayBuzzerSE();
        } else if (index === -2) { // Change character set
          pbPlayDecisionSE();
          this.symtype += 1;
          if (this.symtype >= Characters.length) this.symtype = 0;
          this.entry2().setCharset(Characters[this.symtype]![0]);
          this.entry2().setOtherCharset(Characters[this.symtype]![1]);
        } else { // Insert given character
          if (this.entry().insert(this.entry2().character())) pbPlayDecisionSE();
          else pbPlayBuzzerSE();
        }
        continue;
      }
    }
    Input.update();
    return ret;
  }

  pbEntry(): Promise<string> {
    return PokemonEntryScene.USEKEYBOARD ? this.pbEntry1() : this.pbEntry2();
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
    if (PokemonEntryScene.USEKEYBOARD) KeyboardInput.textInput = false;
  }
}

//===============================================================================
// Text entry screen - arrows to select letter.
//===============================================================================
export class PokemonEntryScene2 {
  static readonly Characters: [string[], string][] = [
    [chars("ABCDEFGHIJ ,." + "KLMNOPQRST '-" + "UVWXYZ     ♂♀" + "             " + "0123456789   "), _INTL("UPPER")],
    [chars("abcdefghij ,." + "klmnopqrst '-" + "uvwxyz     ♂♀" + "             " + "0123456789   "), _INTL("lower")],
    [chars("ÀÁÂÄÃàáâäã Ææ" + "ÈÉÊË èéêë  Çç" + "ÌÍÎÏ ìíîï  Œœ" + "ÒÓÔÖÕòóôöõ Ññ" + "ÙÚÛÜ ùúûü  Ýý"), _INTL("accents")],
    [chars(",.:;…•!?¡¿ ♂♀" + "“”‘’﴾﴿*~_^ ΡΚ" + "@#&%+-×÷/= ΠΜ" + "◎○□△♠♥♦♣★✨  $" + "♈♌♒♐♩♪♫☽☾    "), _INTL("other")],
  ];
  static readonly ROWS = 13;
  static readonly COLUMNS = 5;
  static readonly MODE1 = -6;
  static readonly MODE2 = -5;
  static readonly MODE3 = -4;
  static readonly MODE4 = -3;
  static readonly BACK = -2;
  static readonly OK = -1;

  private viewport!: Viewport;
  private helptext = "";
  private helper!: CharacterEntryHelper;
  private bitmaps: (AnimatedBitmap | Bitmap)[] = [];
  private sprites: Sprites = {};
  private blanks: number[] = [];
  private mode = 0;
  private minlength = 0;
  private maxlength = 0;
  private init = false;
  private cursorpos = 0;
  private refreshOverlay = false;

  private sprite<T>(key: string): T { return this.sprites[key] as unknown as T; }
  private cursor(): NameEntryCursor { return this.sprite<NameEntryCursor>("cursor"); }

  async pbStartScene(helptext: string, minlength: number, maxlength: number, initialText: string, subject: Subject = 0, pokemon: unknown = null): Promise<void> {
    const S = PokemonEntryScene2;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.helptext = helptext;
    this.helper = new CharacterEntryHelper(initialText);
    // Create bitmaps
    this.bitmaps = [];
    for (let i = 0; i < S.Characters.length; i++) {
      const anim = new AnimatedBitmap(`Graphics/Pictures/Naming/overlay_tab_${i + 1}`);
      this.bitmaps[i] = anim;
      const b = anim.bitmap.clone();
      pbSetSystemFont(b);
      const textPos: TextPosition[] = [];
      for (let y = 0; y < S.COLUMNS; y++) {
        for (let x = 0; x < S.ROWS; x++) {
          const pos = y * S.ROWS + x;
          textPos.push([S.Characters[i]![0][pos]!, 44 + x * 32, 24 + y * 38, 2, new Color(16, 24, 32), new Color(160, 160, 160)]);
        }
      }
      pbDrawTextPositions(b, textPos);
      this.bitmaps[S.Characters.length + i] = b;
    }
    const underlineBitmap = new Bitmap(24, 6);
    underlineBitmap.fillRect(2, 2, 22, 4, new Color(168, 184, 184));
    underlineBitmap.fillRect(0, 0, 22, 4, new Color(16, 24, 32));
    this.bitmaps.push(underlineBitmap);
    // Create sprites
    this.sprites = {};
    const bg = new IconSprite(0, 0, this.viewport);
    bg.setBitmapFile("Graphics/Pictures/Naming/bg");
    this.sprites["bg"] = bg;
    addSubjectSprites(this.sprites, this.viewport, subject, pokemon, { shadow: [66, 64], char: [88, 76], box: [88, 52] });
    this.sprites["bgoverlay"] = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.pbDoUpdateOverlay();
    this.blanks = [];
    this.mode = 0;
    this.minlength = minlength;
    this.maxlength = maxlength;
    for (let i = 0; i < this.maxlength; i++) {
      const blank = new Sprite(this.viewport);
      blank.x = 160 + 24 * i;
      blank.setBitmap(this.bitmaps[this.bitmaps.length - 1] as Bitmap);
      this.sprites[`blank${i}`] = blank;
      this.blanks[i] = 0;
    }
    const bottomtab = new Sprite(this.viewport); // Current tab
    bottomtab.x = 22;
    bottomtab.y = 162;
    bottomtab.setBitmap(this.bitmaps[S.Characters.length] as Bitmap);
    this.sprites["bottomtab"] = bottomtab;
    const toptab = new Sprite(this.viewport); // Next tab
    toptab.x = 22 - 504;
    toptab.y = 162;
    toptab.setBitmap(this.bitmaps[S.Characters.length + 1] as Bitmap);
    this.sprites["toptab"] = toptab;
    const controls = new IconSprite(0, 0, this.viewport);
    controls.x = 16;
    controls.y = 96;
    controls.setBitmapFile(_INTL("Graphics/Pictures/Naming/overlay_controls"));
    this.sprites["controls"] = controls;
    this.init = true;
    this.sprites["overlay"] = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.pbDoUpdateOverlay2();
    this.sprites["cursor"] = new NameEntryCursor(this.viewport);
    this.cursorpos = 0;
    this.refreshOverlay = true;
    this.cursor().setCursorPos(this.cursorpos);
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  pbUpdateOverlay(): void {
    this.refreshOverlay = true;
  }

  pbDoUpdateOverlay2(): void {
    const overlay = this.sprite<BitmapSprite>("overlay").bitmap!;
    overlay.clear();
    const modeIcon: ImagePosition[] = [[_INTL("Graphics/Pictures/Naming/icon_mode"), 44 + this.mode * 62, 120, this.mode * 60, 0, 60, 44]];
    pbDrawImagePositions(overlay, modeIcon);
  }

  pbDoUpdateOverlay(): void {
    if (!this.refreshOverlay) return;
    this.refreshOverlay = false;
    const bgoverlay = this.sprite<BitmapSprite>("bgoverlay").bitmap!;
    bgoverlay.clear();
    pbSetSystemFont(bgoverlay);
    const textPositions: TextPosition[] = [
      [this.helptext, 160, 18, false, new Color(16, 24, 32), new Color(168, 184, 184)],
    ];
    let x = 172;
    for (const ch of this.helper.textChars()) {
      textPositions.push([ch, x, 54, 2, new Color(16, 24, 32), new Color(168, 184, 184)]);
      x += 24;
    }
    pbDrawTextPositions(bgoverlay, textPositions);
  }

  async pbChangeTab(newtab = this.mode + 1): Promise<void> {
    const S = PokemonEntryScene2;
    const toptab = this.sprite<Sprite>("toptab");
    const bottomtab = this.sprite<Sprite>("bottomtab");
    pbSEPlay("GUI naming tab swap start");
    this.cursor().visible = false;
    toptab.setBitmap(this.bitmaps[(newtab % S.Characters.length) + S.Characters.length] as Bitmap);
    // Move bottom (old) tab down off the screen, and move top (new) tab right
    // onto the screen
    const deltaX = Math.floor((48 * 20) / FRAME_RATE);
    const deltaY = Math.floor((24 * 20) / FRAME_RATE);
    for (;;) {
      if (bottomtab.y < 414) {
        bottomtab.y += deltaY;
        if (bottomtab.y > 414) bottomtab.y = 414;
      }
      if (toptab.x < 22) {
        toptab.x += deltaX;
        if (toptab.x > 22) toptab.x = 22;
      }
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (toptab.x >= 22 && bottomtab.y >= 414) break;
    }
    // Swap top and bottom tab around
    [toptab.x, bottomtab.x] = [bottomtab.x, toptab.x];
    [toptab.y, bottomtab.y] = [bottomtab.y, toptab.y];
    const [tb, bb] = [toptab.bitmap, bottomtab.bitmap];
    toptab.setBitmap(bb);
    bottomtab.setBitmap(tb);
    await Graphics.update();
    Input.update();
    this.pbUpdate();
    // Set the current mode
    this.mode = newtab % S.Characters.length;
    // Set the top tab up to be the next tab
    const next = this.bitmaps[((this.mode + 1) % S.Characters.length) + S.Characters.length] as Bitmap;
    this.cursor().visible = true;
    toptab.setBitmap(next);
    toptab.x = 22 - 504;
    toptab.y = 162;
    pbSEPlay("GUI naming tab swap end");
    this.pbDoUpdateOverlay2();
  }

  pbUpdate(): void {
    const S = PokemonEntryScene2;
    for (let i = 0; i < S.Characters.length; i++) (this.bitmaps[i] as AnimatedBitmap).update();
    if (this.init || originalFrameCount() % 5 === 0) {
      this.init = false;
      let cursorpos = this.helper.cursor;
      if (cursorpos >= this.maxlength) cursorpos = this.maxlength - 1;
      if (cursorpos < 0) cursorpos = 0;
      for (let i = 0; i < this.maxlength; i++) {
        this.blanks[i] = i === cursorpos ? 1 : 0;
        this.sprite<Sprite>(`blank${i}`).y = [78, 82][this.blanks[i]!]!;
      }
    }
    this.pbDoUpdateOverlay();
    pbUpdateSpriteHash(this.sprites as never);
  }

  pbColumnEmpty(m: number): boolean {
    const S = PokemonEntryScene2;
    if (m >= S.ROWS - 1) return false;
    const chset = S.Characters[this.mode]![0];
    for (let i = 0; i < S.COLUMNS; i++) {
      if (chset[i * S.ROWS + m] !== " ") return false;
    }
    return true;
  }

  wrapmod(x: number, y: number): number {
    let result = x % y;
    if (result < 0) result += y;
    return result;
  }

  pbMoveCursor(): boolean {
    const { ROWS, COLUMNS, MODE1, MODE2, MODE3, MODE4, BACK, OK } = PokemonEntryScene2;
    const oldcursor = this.cursorpos;
    let cursordiv = Math.floor(this.cursorpos / ROWS); // The row the cursor is in
    let cursormod = this.wrapmod(this.cursorpos, ROWS); // The column the cursor is in
    const cursororigin = this.cursorpos - cursormod;
    if (Input.repeat(Input.LEFT)) {
      if (this.cursorpos < 0) { // Controls
        this.cursorpos -= 1;
        if (this.cursorpos < MODE1) this.cursorpos = OK;
      } else {
        for (;;) {
          cursormod = this.wrapmod(cursormod - 1, ROWS);
          this.cursorpos = cursororigin + cursormod;
          if (!this.pbColumnEmpty(cursormod)) break;
        }
      }
    } else if (Input.repeat(Input.RIGHT)) {
      if (this.cursorpos < 0) { // Controls
        this.cursorpos += 1;
        if (this.cursorpos > OK) this.cursorpos = MODE1;
      } else {
        for (;;) {
          cursormod = this.wrapmod(cursormod + 1, ROWS);
          this.cursorpos = cursororigin + cursormod;
          if (!this.pbColumnEmpty(cursormod)) break;
        }
      }
    } else if (Input.repeat(Input.UP)) {
      if (this.cursorpos < 0) { // Controls
        switch (this.cursorpos) {
          case MODE1: this.cursorpos = ROWS * (COLUMNS - 1); break;
          case MODE2: this.cursorpos = ROWS * (COLUMNS - 1) + 2; break;
          case MODE3: this.cursorpos = ROWS * (COLUMNS - 1) + 4; break;
          case MODE4: this.cursorpos = ROWS * (COLUMNS - 1) + 6; break;
          case BACK: this.cursorpos = ROWS * (COLUMNS - 1) + 9; break;
          case OK: this.cursorpos = ROWS * (COLUMNS - 1) + 11; break;
        }
      } else if (this.cursorpos < ROWS) { // Top row of letters
        switch (this.cursorpos) {
          case 0: case 1: this.cursorpos = MODE1; break;
          case 2: case 3: this.cursorpos = MODE2; break;
          case 4: case 5: this.cursorpos = MODE3; break;
          case 6: case 7: this.cursorpos = MODE4; break;
          case 8: case 9: case 10: this.cursorpos = BACK; break;
          case 11: case 12: this.cursorpos = OK; break;
        }
      } else {
        cursordiv = this.wrapmod(cursordiv - 1, COLUMNS);
        this.cursorpos = cursordiv * ROWS + cursormod;
      }
    } else if (Input.repeat(Input.DOWN)) {
      if (this.cursorpos < 0) { // Controls
        switch (this.cursorpos) {
          case MODE1: this.cursorpos = 0; break;
          case MODE2: this.cursorpos = 2; break;
          case MODE3: this.cursorpos = 4; break;
          case MODE4: this.cursorpos = 6; break;
          case BACK: this.cursorpos = 9; break;
          case OK: this.cursorpos = 11; break;
        }
      } else if (this.cursorpos >= ROWS * (COLUMNS - 1)) { // Bottom row of letters
        switch (cursormod) {
          case 0: case 1: this.cursorpos = MODE1; break;
          case 2: case 3: this.cursorpos = MODE2; break;
          case 4: case 5: this.cursorpos = MODE3; break;
          case 6: case 7: this.cursorpos = MODE4; break;
          case 8: case 9: case 10: this.cursorpos = BACK; break;
          default: this.cursorpos = OK; break;
        }
      } else {
        cursordiv = this.wrapmod(cursordiv + 1, COLUMNS);
        this.cursorpos = cursordiv * ROWS + cursormod;
      }
    }
    if (this.cursorpos !== oldcursor) { // Cursor position changed
      this.cursor().setCursorPos(this.cursorpos);
      pbPlayCursorSE();
      return true;
    }
    return false;
  }

  async pbEntry(): Promise<string> {
    const S = PokemonEntryScene2;
    let ret = "";
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (this.pbMoveCursor()) continue;
      if (Input.trigger(Input.SPECIAL)) {
        await this.pbChangeTab();
      } else if (Input.trigger(Input.ACTION)) {
        this.cursorpos = S.OK;
        this.cursor().setCursorPos(this.cursorpos);
      } else if (Input.trigger(Input.BACK)) {
        this.helper.delete();
        pbPlayCancelSE();
        this.pbUpdateOverlay();
      } else if (Input.trigger(Input.USE)) {
        switch (this.cursorpos) {
          case S.BACK: // Backspace
            this.helper.delete();
            pbPlayCancelSE();
            this.pbUpdateOverlay();
            break;
          case S.OK: // Done
            pbSEPlay("GUI naming confirm");
            if (this.helper.length >= this.minlength) {
              ret = this.helper.text;
              Input.update();
              return ret;
            }
            break;
          case S.MODE1:
            if (this.mode !== 0) await this.pbChangeTab(0);
            break;
          case S.MODE2:
            if (this.mode !== 1) await this.pbChangeTab(1);
            break;
          case S.MODE3:
            if (this.mode !== 2) await this.pbChangeTab(2);
            break;
          case S.MODE4:
            if (this.mode !== 3) await this.pbChangeTab(3);
            break;
          default: {
            const cursormod = this.cursorpos % S.ROWS;
            const cursordiv = Math.floor(this.cursorpos / S.ROWS);
            const charpos = cursordiv * S.ROWS + cursormod;
            const chset = S.Characters[this.mode]![0];
            if (this.helper.length >= this.maxlength) this.helper.delete();
            this.helper.insert(chset[charpos]!);
            pbPlayCursorSE();
            if (this.helper.length >= this.maxlength) {
              this.cursorpos = S.OK;
              this.cursor().setCursorPos(this.cursorpos);
            }
            this.pbUpdateOverlay();
            // Auto-switch to lowercase letters after the first uppercase letter is selected
            if (this.mode === 0 && this.helper.cursor === 1) await this.pbChangeTab(1);
            break;
          }
        }
      }
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    for (const bitmap of this.bitmaps) bitmap?.dispose();
    this.bitmaps.length = 0;
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

/** PokemonEntryScene2::NameEntryCursor */
export class NameEntryCursor {
  private sprite: Sprite;
  private cursortype = 0;
  private cursor1 = new AnimatedBitmap("Graphics/Pictures/Naming/cursor_1");
  private cursor2 = new AnimatedBitmap("Graphics/Pictures/Naming/cursor_2");
  private cursor3 = new AnimatedBitmap("Graphics/Pictures/Naming/cursor_3");
  private cursorPos = 0;

  constructor(viewport: Viewport) {
    this.sprite = new Sprite(viewport);
    this.updateInternal();
  }

  setCursorPos(value: number): void {
    this.cursorPos = value;
  }

  updateCursorPos(): void {
    const S = PokemonEntryScene2;
    const value = this.cursorPos;
    switch (value) {
      case S.MODE1: // Upper case
        this.sprite.x = 44;
        this.sprite.y = 120;
        this.cursortype = 1;
        break;
      case S.MODE2: // Lower case
        this.sprite.x = 106;
        this.sprite.y = 120;
        this.cursortype = 1;
        break;
      case S.MODE3: // Accents
        this.sprite.x = 168;
        this.sprite.y = 120;
        this.cursortype = 1;
        break;
      case S.MODE4: // Other symbols
        this.sprite.x = 230;
        this.sprite.y = 120;
        this.cursortype = 1;
        break;
      case S.BACK: // Back
        this.sprite.x = 314;
        this.sprite.y = 120;
        this.cursortype = 2;
        break;
      case S.OK: // OK
        this.sprite.x = 394;
        this.sprite.y = 120;
        this.cursortype = 2;
        break;
      default:
        if (value >= 0) {
          this.sprite.x = 52 + 32 * (value % S.ROWS);
          this.sprite.y = 180 + 38 * Math.floor(value / S.ROWS);
          this.cursortype = 0;
        }
    }
  }

  get visible(): boolean { return this.sprite.visible; }
  set visible(value: boolean) { this.sprite.visible = value; }

  get color(): Color { return this.sprite.color; }
  set color(value: Color) { this.sprite.color = value; }

  isDisposed(): boolean {
    return this.sprite.isDisposed();
  }

  updateInternal(): void {
    this.cursor1.update();
    this.cursor2.update();
    this.cursor3.update();
    this.updateCursorPos();
    const b = [this.cursor1, this.cursor2, this.cursor3][this.cursortype]!.bitmap;
    if (this.sprite.bitmap !== b) this.sprite.setBitmap(b);
  }

  update(): void {
    this.updateInternal();
  }

  dispose(): void {
    this.cursor1.dispose();
    this.cursor2.dispose();
    this.cursor3.dispose();
    this.sprite.dispose();
  }
}

//===============================================================================
//
//===============================================================================
export interface EntryScene {
  pbStartScene(helptext: string, minlength: number, maxlength: number, initialText: string, subject?: Subject, pokemon?: unknown): Promise<void>;
  pbEntry(): Promise<string>;
  pbEndScene(): Promise<void>;
}

export class PokemonEntry {
  constructor(private scene: EntryScene) {}

  async pbStartScreen(helptext: string, minlength: number, maxlength: number, initialText: string, mode: Subject = -1, pokemon: unknown = null): Promise<string> {
    await this.scene.pbStartScene(helptext, minlength, maxlength, initialText, mode, pokemon);
    const ret = await this.scene.pbEntry();
    await this.scene.pbEndScene();
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
const NAMING = "Graphics/Pictures/Naming/";

/** Every graphic the two naming scenes can draw, plus the subject's charset. */
export async function preloadTextEntry(mode: Subject = 0, pokemon: unknown = null): Promise<void> {
  const paths = [
    "bg", "bg_2", "cursor_1", "cursor_2", "cursor_3", "icon_mode", "icon_shadow", "icon_storage", "overlay_controls",
    "overlay_tab_1", "overlay_tab_2", "overlay_tab_3", "overlay_tab_4",
  ].map((n) => NAMING + n);
  if (mode === 1) {
    const walk = playerMetadata(characterID())?.walkCharset;
    const outfit = (G.player as unknown as { outfit?: number } | null)?.outfit ?? 0;
    if (walk) paths.push(`Graphics/Characters/${walk}`, `Graphics/Characters/${walk}_${outfit}`);
  } else if (mode === 3 && pokemon != null) {
    paths.push(`Graphics/Characters/${String(pokemon)}`);
  }
  await Promise.all([preloadBitmaps(paths), mode === 2 && pokemon ? preloadPokemonIcons([pokemon as Pokemon]) : null]);
}

export async function pbEnterText(
  helptext: string, minlength: number, maxlength: number, initialText = "", mode: Subject = 0, pokemon: unknown = null, nofadeout = false,
): Promise<string> {
  let ret = "";
  await preloadTextEntry(mode, pokemon);
  if (G.pokemonSystem?.textinput === 1) { // Keyboard
    await pbFadeOutIn(async () => {
      const sscene = new PokemonEntryScene();
      const sscreen = new PokemonEntry(sscene);
      ret = await sscreen.pbStartScreen(helptext, minlength, maxlength, initialText, mode, pokemon);
    }, 99999, nofadeout);
  } else { // Cursor
    await pbFadeOutIn(async () => {
      const sscene = new PokemonEntryScene2();
      const sscreen = new PokemonEntry(sscene);
      ret = await sscreen.pbStartScreen(helptext, minlength, maxlength, initialText, mode, pokemon);
    }, 99999, nofadeout);
  }
  return ret;
}

export function pbEnterPlayerName(helptext: string, minlength: number, maxlength: number, initialText = "", nofadeout = false): Promise<string> {
  return pbEnterText(helptext, minlength, maxlength, initialText, 1, null, nofadeout);
}

export function pbEnterPokemonName(helptext: string, minlength: number, maxlength: number, initialText = "", pokemon: unknown = null, nofadeout = false): Promise<string> {
  return pbEnterText(helptext, minlength, maxlength, initialText, 2, pokemon, nofadeout);
}

export function pbEnterNPCName(helptext: string, minlength: number, maxlength: number, initialText = "", id: unknown = 0, nofadeout = false): Promise<string> {
  return pbEnterText(helptext, minlength, maxlength, initialText, 3, id, nofadeout);
}

export function pbEnterBoxName(helptext: string, minlength: number, maxlength: number, initialText = "", nofadeout = false): Promise<string> {
  return pbEnterText(helptext, minlength, maxlength, initialText, 4, null, nofadeout);
}
