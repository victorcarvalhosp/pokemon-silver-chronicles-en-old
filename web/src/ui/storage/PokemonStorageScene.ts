// Port of the Pokémon storage visuals (016_UI/017_UI_PokemonStorage.rb):
// PokemonBoxIcon, MosaicPokemonSprite, AutoMosaicPokemonSprite,
// PokemonBoxArrow, PokemonBoxSprite, PokemonBoxPartySprite and
// PokemonStorageScene. Plugin changes, in load order:
// - v20.1 Hotfixes (Misc bug fixes.rb:75-97): PokemonBoxPartySprite and
//   PokemonBoxSprite#refresh put every icon at z 1.
// - Generation 8 Pack (EBDX Wrapper Compatibility.rb:105) wraps
//   pbUpdateOverlay to constrict the sprite to 168 px, but Essentials Deluxe
//   loads after it and replaces pbUpdateOverlay outright, so the constrict
//   never runs here either.
// - Essentials Deluxe ([000] Essentials Patches/Miscellaneous.rb:332):
//   pbUpdateOverlay draws the shiny icon, ZUD's G-Max Factor and Enhanced UI's
//   Shiny Leaf / IV ratings (STORAGE_SHINY_LEAF / STORAGE_IV_RATINGS are true)
//   on a "plugin_overlay" sprite. Its "BW Storage System" patch is inactive
//   (that plugin isn't installed).
//
// Timing: the arrow, box scrolling, party tab, wallpaper fade and mosaic all
// scale by Graphics.frame_rate, so they're ported as written with
// FRAME_RATE = 60. Two fixed frame counts are converted to the same duration
// at 60 Hz: the release tween (100 frames) and pbSwap's mosaic (10).

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Type } from "../../data/gameData/type";
import { ORIGINAL_FPS } from "../../core/loop";
import { FRAME_RATE } from "../../game/GameCharacter";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../../game/GameSystem";
import { G } from "../../game/globals";
import type { PokemonBag } from "../../game/items/PokemonBag";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { pbEachPokemon, PokemonBox, PokemonStorage } from "../../game/pokemon/PokemonStorage";
import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { PokemonBag_Scene, PokemonBagScreen } from "../bag/bag";
import { pbDrawImagePositions, pbDrawShadowText, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn, pbSrcOver } from "../fades";
import { _INTL, pbBottomRight, pbDisposeSpriteHash, pbDoEnsureBitmap, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { ChangelingSprite, onPropertySet } from "../party/ChangelingSprite";
import { PartyHooks } from "../party/party";
import { addBackgroundPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { Interpolator } from "../scenes/Interpolators";
import { iconFilenameFromPokemon, preloadPokemonIcons } from "../sprites/pokemonIcon";
import { PictureOrigin, PokemonSprite } from "../sprites/pokemonSprite";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { pbDisplayGmaxFactor, pbDisplayIVRatings, pbDisplayShinyLeaf, SUMMARY_PLUGIN_BITMAPS } from "../summary/pluginDisplays";
import { PokemonSummary_Scene, PokemonSummaryScreen } from "../summary/summary";
import { pbEnterBoxName } from "../textEntry/UI_TextEntry";
import { Window_CommandPokemon, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";
import { PokemonStorageScreen, type Selection, type StorageScene } from "./PokemonStorageScreen";

/** PokemonBoxIcon#release's tween: 100 frames at 40 fps. */
const RELEASE_FRAMES = Math.round((100 * FRAME_RATE) / ORIGINAL_FPS);
/** pbSwap's mosaic: 10 frames at 40 fps. */
const SWAP_MOSAIC = Math.round((10 * FRAME_RATE) / ORIGINAL_FPS);

/** Graphics the storage screen draws (for preloading). */
function storageBitmaps(): string[] {
  const s = "Graphics/Pictures/Storage/";
  const ret = [`${s}bg`, `${s}overlay_main`, `${s}overlay_party`, `${s}overlay_marking`, `${s}markings`, `${s}overlay_lv`,
    "Graphics/Pictures/shiny", "Graphics/Pictures/types", ...SUMMARY_PLUGIN_BITMAPS];
  for (const c of ["point_1", "point_2", "grab", "fist"]) ret.push(`${s}cursor_${c}`, `${s}cursor_${c}_q`);
  for (let i = 0; i < new PokemonStorage(0).allWallpapers().length; i++) ret.push(`${s}box_${i}`);
  return ret;
}

/** Fetches the storage screen's graphics and the icons of every stored Pokémon. */
export async function preloadStorage(): Promise<void> {
  await Promise.all([preloadBitmaps(storageBitmaps()), preloadPokemonIcons(pbEachPokemon().map(([p]) => p))]);
}

/** Array#compact! */
function compact<T>(a: (T | null | undefined)[]): void {
  let w = 0;
  for (let r = 0; r < a.length; r++) if (a[r] != null) a[w++] = a[r];
  a.length = w;
}

//===============================================================================
// Pokémon icons
//===============================================================================
export class PokemonBoxIcon extends IconSprite {
  private pokemon: Pokemon | null;
  private _release = new Interpolator();
  private startRelease = false;

  constructor(pokemon: Pokemon | null, viewport: Viewport | null = null) {
    super(0, 0, viewport);
    this.pokemon = pokemon;
    this.refresh();
  }

  releasing(): boolean {
    return this._release.tweening();
  }

  release(): void {
    this.ox = Math.floor(this.srcRect.width / 2); // 32
    this.oy = Math.floor(this.srcRect.height / 2); // 32
    this.x += Math.floor(this.srcRect.width / 2); // 32
    this.y += Math.floor(this.srcRect.height / 2); // 32
    this._release.tween(this, [[Interpolator.ZOOM_X, 0], [Interpolator.ZOOM_Y, 0], [Interpolator.OPACITY, 0]], RELEASE_FRAMES);
    this.startRelease = true;
  }

  refresh(): void {
    if (!this.pokemon) return;
    this.setBitmapFile(iconFilenameFromPokemon(this.pokemon));
    if (this.bitmap) this.srcRect = new Rect(0, 0, this.bitmap.height, this.bitmap.height);
  }

  override update(dt?: number): void {
    super.update(dt);
    this._release.update();
    this.color = new Color(0, 0, 0, 0);
    if (this.startRelease && !this.releasing()) this.dispose();
  }
}

//===============================================================================
// Pokémon sprite
//===============================================================================
export class MosaicPokemonSprite extends PokemonSprite {
  private _mosaic = 0;
  private inrefresh = false;
  private mosaicbitmap: Bitmap | null = null;
  private mosaicbitmap2: Bitmap | null = null;
  private oldbitmap: Bitmap | null = null;

  override dispose(): void {
    super.dispose();
    this.mosaicbitmap?.dispose();
    this.mosaicbitmap = null;
    this.mosaicbitmap2?.dispose();
    this.mosaicbitmap2 = null;
  }

  /** bitmap= */
  override setBitmap(value: Bitmap | null): void {
    super.setBitmap(value);
    this.mosaicRefresh(value);
  }

  get mosaic(): number { return this._mosaic; }
  set mosaic(value: number) {
    this._mosaic = value;
    if (this._mosaic < 0) this._mosaic = 0;
    this.mosaicRefresh(this.oldbitmap);
  }

  mosaicRefresh(bitmap: Bitmap | null): void {
    if (this.inrefresh) return;
    this.inrefresh = true;
    this.oldbitmap = bitmap;
    if (this._mosaic <= 0 || !this.oldbitmap) {
      this.mosaicbitmap?.dispose();
      this.mosaicbitmap = null;
      this.mosaicbitmap2?.dispose();
      this.mosaicbitmap2 = null;
      this.setBitmap(this.oldbitmap);
    } else {
      const newWidth = Math.max(Math.floor(this.oldbitmap.width / this._mosaic), 1);
      const newHeight = Math.max(Math.floor(this.oldbitmap.height / this._mosaic), 1);
      this.mosaicbitmap2?.dispose();
      this.mosaicbitmap = pbDoEnsureBitmap(this.mosaicbitmap, newWidth, newHeight);
      this.mosaicbitmap.clear();
      this.mosaicbitmap2 = pbDoEnsureBitmap(null, this.oldbitmap.width, this.oldbitmap.height);
      this.mosaicbitmap2.clear();
      this.mosaicbitmap.stretchBlt(new Rect(0, 0, newWidth, newHeight), this.oldbitmap,
        new Rect(0, 0, this.oldbitmap.width, this.oldbitmap.height));
      this.mosaicbitmap2.stretchBlt(
        new Rect(Math.floor(-this._mosaic / 2) + 1, Math.floor(-this._mosaic / 2) + 1, this.mosaicbitmap2.width, this.mosaicbitmap2.height),
        this.mosaicbitmap, new Rect(0, 0, newWidth, newHeight));
      this.setBitmap(this.mosaicbitmap2);
    }
    this.inrefresh = false;
  }
}

//===============================================================================
//
//===============================================================================
export class AutoMosaicPokemonSprite extends MosaicPokemonSprite {
  override update(dt?: number): void {
    super.update(dt);
    this.mosaic -= 1;
  }
}

//===============================================================================
// Cursor
//===============================================================================
export class PokemonBoxArrow extends Sprite {
  quickswap = false;
  private frame = 0;
  private holding = false;
  private updating = false;
  private grabbingState = 0;
  private placingState = 0;
  private heldpkmn: PokemonBoxIcon | null = null;
  private handsprite: ChangelingSprite;
  private spriteX: number;
  private spriteY: number;

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.handsprite = new ChangelingSprite(0, 0, viewport);
    const s = "Graphics/Pictures/Storage/";
    this.handsprite.addBitmap("point1", `${s}cursor_point_1`);
    this.handsprite.addBitmap("point2", `${s}cursor_point_2`);
    this.handsprite.addBitmap("grab", `${s}cursor_grab`);
    this.handsprite.addBitmap("fist", `${s}cursor_fist`);
    this.handsprite.addBitmap("point1q", `${s}cursor_point_1_q`);
    this.handsprite.addBitmap("point2q", `${s}cursor_point_2_q`);
    this.handsprite.addBitmap("grabq", `${s}cursor_grab_q`);
    this.handsprite.addBitmap("fistq", `${s}cursor_fist_q`);
    this.handsprite.changeBitmap("fist");
    this.spriteX = this.x;
    this.spriteY = this.y;
    // visible= / color= / x= / y= / z= overrides
    onPropertySet(this, ["visible"], () => {
      this.handsprite.visible = this.visible;
      const sprite = this.heldPokemon();
      if (sprite) sprite.visible = this.visible;
    });
    onPropertySet(this, ["color"], () => {
      this.handsprite.color = this.color;
      const sprite = this.heldPokemon();
      if (sprite) sprite.color = this.color;
    });
    onPropertySet(this, ["x"], () => {
      this.handsprite.x = this.x;
      if (!this.updating) this.spriteX = this.x;
      if (this.isHolding()) this.heldPokemon()!.x = this.x;
    });
    onPropertySet(this, ["y"], () => {
      this.handsprite.y = this.y;
      if (!this.updating) this.spriteY = this.y;
      if (this.isHolding()) this.heldPokemon()!.y = this.y + 16;
    });
    onPropertySet(this, ["z"], () => {
      this.handsprite.z = this.z;
    });
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this.handsprite.dispose();
    this.heldpkmn?.dispose();
    super.dispose();
  }

  heldPokemon(): PokemonBoxIcon | null {
    if (this.heldpkmn?.isDisposed()) this.heldpkmn = null;
    if (!this.heldpkmn) this.holding = false;
    return this.heldpkmn;
  }

  /** holding? */
  isHolding(): boolean {
    return !!this.heldPokemon() && this.holding;
  }

  grabbing(): boolean {
    return this.grabbingState > 0;
  }

  placing(): boolean {
    return this.placingState > 0;
  }

  setSprite(sprite: PokemonBoxIcon | null): void {
    if (this.isHolding()) {
      this.heldpkmn = sprite;
      if (this.heldpkmn) this.heldpkmn.viewport = this.viewport;
      if (this.heldpkmn) this.heldpkmn.z = 1;
      if (!this.heldpkmn) this.holding = false;
      this.z = 2;
    }
  }

  deleteSprite(): void {
    this.holding = false;
    if (this.heldpkmn) {
      this.heldpkmn.dispose();
      this.heldpkmn = null;
    }
  }

  grab(sprite: PokemonBoxIcon): void {
    this.grabbingState = 1;
    this.heldpkmn = sprite;
    this.heldpkmn.viewport = this.viewport;
    this.heldpkmn.z = 1;
    this.z = 2;
  }

  place(): void {
    this.placingState = 1;
  }

  release(): void {
    this.heldpkmn?.release();
  }

  override update(dt?: number): void {
    this.updating = true;
    super.update(dt);
    const heldpkmn = this.heldPokemon();
    heldpkmn?.update();
    this.handsprite.update();
    if (!heldpkmn) this.holding = false;
    const fr = FRAME_RATE;
    if (this.grabbingState > 0) {
      if (this.grabbingState <= Math.floor((4 * fr) / 20)) {
        this.handsprite.changeBitmap(this.quickswap ? "grabq" : "grab");
        this.y = Math.trunc(this.spriteY + (4.0 * this.grabbingState * 20) / fr);
        this.grabbingState += 1;
      } else if (this.grabbingState <= Math.floor((8 * fr) / 20)) {
        this.holding = true;
        this.handsprite.changeBitmap(this.quickswap ? "fistq" : "fist");
        this.y = this.spriteY + Math.floor((4 * (Math.floor((8 * fr) / 20) - this.grabbingState) * 20) / fr);
        this.grabbingState += 1;
      } else {
        this.grabbingState = 0;
      }
    } else if (this.placingState > 0) {
      if (this.placingState <= Math.floor((4 * fr) / 20)) {
        this.handsprite.changeBitmap(this.quickswap ? "fistq" : "fist");
        this.y = Math.trunc(this.spriteY + (4.0 * this.placingState * 20) / fr);
        this.placingState += 1;
      } else if (this.placingState <= Math.floor((8 * fr) / 20)) {
        this.holding = false;
        this.heldpkmn = null;
        this.handsprite.changeBitmap(this.quickswap ? "grabq" : "grab");
        this.y = this.spriteY + Math.floor((4 * (Math.floor((8 * fr) / 20) - this.placingState) * 20) / fr);
        this.placingState += 1;
      } else {
        this.placingState = 0;
      }
    } else if (this.isHolding()) {
      this.handsprite.changeBitmap(this.quickswap ? "fistq" : "fist");
    } else {
      this.x = this.spriteX;
      this.y = this.spriteY;
      if (this.frame < Math.floor(fr / 2)) {
        this.handsprite.changeBitmap(this.quickswap ? "point1q" : "point1");
      } else {
        this.handsprite.changeBitmap(this.quickswap ? "point2q" : "point2");
      }
    }
    this.frame += 1;
    if (this.frame >= fr) this.frame = 0;
    this.updating = false;
  }
}

//===============================================================================
// Box
//===============================================================================
export class PokemonBoxSprite extends Sprite {
  refreshBox = true;
  refreshSprites = true;
  private storage: PokemonStorage;
  private boxnumber: number;
  private pokemonsprites: (PokemonBoxIcon | null)[] = [];
  private contents: Bitmap;
  private bg: number | null = null;
  private boxbitmap: AnimatedBitmap | null = null;

  constructor(storage: PokemonStorage, boxnumber: number, viewport: Viewport | null = null) {
    super(viewport);
    this.storage = storage;
    this.boxnumber = boxnumber;
    for (let i = 0; i < PokemonBox.BOX_SIZE; i++) {
      this.pokemonsprites[i] = null;
      const pokemon = this.storage.get(boxnumber, i);
      this.pokemonsprites[i] = new PokemonBoxIcon(pokemon, viewport);
    }
    this.contents = pbDoEnsureBitmap(null, 324, 296);
    this.setBitmap(this.contents);
    onPropertySet(this, ["x", "y"], () => this.refresh());
    onPropertySet(this, ["color"], () => {
      if (this.refreshSprites) {
        for (let i = 0; i < PokemonBox.BOX_SIZE; i++) {
          const s = this.pokemonsprites[i];
          if (s && !s.isDisposed()) s.color = this.color;
        }
      }
      this.refresh();
    });
    onPropertySet(this, ["visible"], () => {
      for (let i = 0; i < PokemonBox.BOX_SIZE; i++) {
        const s = this.pokemonsprites[i];
        if (s && !s.isDisposed()) s.visible = this.visible;
      }
      this.refresh();
    });
    this.x = 184;
    this.y = 18;
    this.refresh();
  }

  override dispose(): void {
    if (!this.isDisposed()) {
      for (let i = 0; i < PokemonBox.BOX_SIZE; i++) {
        this.pokemonsprites[i]?.dispose();
        this.pokemonsprites[i] = null;
      }
      this.boxbitmap?.dispose();
      this.contents.dispose();
      super.dispose();
    }
  }

  private box(): PokemonBox {
    return this.storage.get(this.boxnumber) as PokemonBox;
  }

  getBoxBitmap(): void {
    if (this.bg == null || this.bg !== this.box().background) {
      // (Ruby also accepts nil/"" and the old "boxN" strings here; the port's
      // PokemonBox#background is always a number.)
      this.bg = this.box().background;
      if (!this.storage.isAvailableWallpaper(this.bg)) {
        this.bg = this.boxnumber % PokemonStorage.BASICWALLPAPERQTY;
        this.box().background = this.bg;
      }
      this.boxbitmap?.dispose();
      this.boxbitmap = new AnimatedBitmap(`Graphics/Pictures/Storage/box_${this.bg}`);
    }
  }

  getPokemon(index: number): PokemonBoxIcon | null {
    return this.pokemonsprites[index] ?? null;
  }

  setPokemon(index: number, sprite: PokemonBoxIcon | null): void {
    this.pokemonsprites[index] = sprite;
    this.pokemonsprites[index]!.refresh();
    this.refresh();
  }

  grabPokemon(index: number, arrow: PokemonBoxArrow): void {
    const sprite = this.pokemonsprites[index];
    if (sprite) {
      arrow.grab(sprite);
      this.pokemonsprites[index] = null;
      this.refresh();
    }
  }

  deletePokemon(index: number): void {
    this.pokemonsprites[index]!.dispose();
    this.pokemonsprites[index] = null;
    this.refresh();
  }

  refresh(): void {
    if (!this.contents) return; // (x= during construction)
    if (this.refreshBox) {
      const boxname = this.box().name;
      this.getBoxBitmap();
      this.contents.blt(0, 0, this.boxbitmap!.bitmap, new Rect(0, 0, 324, 296));
      pbSetSystemFont(this.contents);
      const widthval = this.contents.textSize(boxname).width;
      const xval = 162 - Math.floor(widthval / 2);
      pbDrawShadowText(this.contents, xval, 14, widthval, 32, boxname, new Color(248, 248, 248), new Color(40, 48, 48));
      this.refreshBox = false;
    }
    let yval = this.y + 30;
    for (let j = 0; j < PokemonBox.BOX_HEIGHT; j++) {
      let xval = this.x + 10;
      for (let k = 0; k < PokemonBox.BOX_WIDTH; k++) {
        const sprite = this.pokemonsprites[j * PokemonBox.BOX_WIDTH + k];
        if (sprite && !sprite.isDisposed()) {
          sprite.viewport = this.viewport;
          sprite.x = xval;
          sprite.y = yval;
          sprite.z = 1;
        }
        xval += 48;
      }
      yval += 48;
    }
    // v20.1 Hotfixes: icons sometimes disappearing
    for (let j = 0; j < PokemonBox.BOX_HEIGHT; j++) {
      for (let k = 0; k < PokemonBox.BOX_WIDTH; k++) {
        const sprite = this.pokemonsprites[j * PokemonBox.BOX_WIDTH + k];
        if (sprite && !sprite.isDisposed()) sprite.z = 1;
      }
    }
  }

  override update(dt?: number): void {
    super.update(dt);
    for (let i = 0; i < PokemonBox.BOX_SIZE; i++) {
      const s = this.pokemonsprites[i];
      if (s && !s.isDisposed()) s.update();
    }
  }
}

//===============================================================================
// Party pop-up panel
//===============================================================================
export class PokemonBoxPartySprite extends Sprite {
  private party: Pokemon[];
  private boxbitmap: AnimatedBitmap;
  private pokemonsprites: (PokemonBoxIcon | null)[] = [];
  private contents: Bitmap;

  constructor(party: Pokemon[], viewport: Viewport | null = null) {
    super(viewport);
    this.party = party;
    this.boxbitmap = new AnimatedBitmap("Graphics/Pictures/Storage/overlay_party");
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      this.pokemonsprites[i] = null;
      const pokemon = this.party[i];
      if (pokemon) this.pokemonsprites[i] = new PokemonBoxIcon(pokemon, viewport);
    }
    this.contents = pbDoEnsureBitmap(null, 172, 352);
    this.setBitmap(this.contents);
    onPropertySet(this, ["x", "y"], () => this.refresh());
    onPropertySet(this, ["color"], () => {
      for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
        const s = this.pokemonsprites[i];
        if (s && !s.isDisposed()) s.color = pbSrcOver(s.color, this.color);
      }
    });
    onPropertySet(this, ["visible"], () => {
      for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
        const s = this.pokemonsprites[i];
        if (s && !s.isDisposed()) s.visible = this.visible;
      }
    });
    this.x = 182;
    this.y = Graphics.height - 352;
    pbSetSystemFont(this.bitmap!);
    this.refresh();
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) this.pokemonsprites[i]?.dispose();
    this.boxbitmap.dispose();
    this.contents.dispose();
    super.dispose();
  }

  getPokemon(index: number): PokemonBoxIcon | null {
    return this.pokemonsprites[index] ?? null;
  }

  setPokemon(index: number, sprite: PokemonBoxIcon | null): void {
    this.pokemonsprites[index] = sprite;
    compact(this.pokemonsprites);
    this.refresh();
  }

  grabPokemon(index: number, arrow: PokemonBoxArrow): void {
    const sprite = this.pokemonsprites[index];
    if (sprite) {
      arrow.grab(sprite);
      this.pokemonsprites.splice(index, 1);
      this.refresh();
    }
  }

  deletePokemon(index: number): void {
    this.pokemonsprites[index]!.dispose();
    this.pokemonsprites[index] = null;
    compact(this.pokemonsprites);
    this.refresh();
  }

  refresh(): void {
    if (!this.contents) return; // (x= during construction)
    this.contents.blt(0, 0, this.boxbitmap.bitmap, new Rect(0, 0, 172, 352));
    pbDrawTextPositions(this.bitmap!, [[_INTL("Back"), 86, 248, 2, new Color(248, 248, 248), new Color(80, 80, 80), 1]]);
    const xvalues: number[] = []; // [18, 90, 18, 90, 18, 90]
    const yvalues: number[] = []; // [2, 18, 66, 82, 130, 146]
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      xvalues.push(18 + 72 * (i % 2));
      yvalues.push(2 + 16 * (i % 2) + 64 * Math.floor(i / 2));
    }
    for (let i = this.pokemonsprites.length - 1; i >= 0; i--) {
      if (this.pokemonsprites[i]?.isDisposed()) this.pokemonsprites.splice(i, 1);
    }
    for (const sprite of this.pokemonsprites) sprite?.refresh();
    for (let j = 0; j < Settings.MAX_PARTY_SIZE; j++) {
      const sprite = this.pokemonsprites[j];
      if (sprite == null || sprite.isDisposed()) continue;
      sprite.viewport = this.viewport;
      sprite.x = this.x + xvalues[j]!;
      sprite.y = this.y + yvalues[j]!;
      sprite.z = 1;
    }
    // v20.1 Hotfixes: icons sometimes disappearing
    for (let j = 0; j < Settings.MAX_PARTY_SIZE; j++) {
      const sprite = this.pokemonsprites[j];
      if (sprite && !sprite.isDisposed()) sprite.z = 1;
    }
  }

  override update(dt?: number): void {
    super.update(dt);
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      const s = this.pokemonsprites[i];
      if (s && !s.isDisposed()) s.update();
    }
  }
}

//===============================================================================
// Pokémon storage visuals
//===============================================================================
type StorageSprites = {
  background?: Sprite;
  box: PokemonBoxSprite;
  boxsides: IconSprite;
  overlay: BitmapSprite;
  pokemon: AutoMosaicPokemonSprite;
  boxparty: PokemonBoxPartySprite;
  markingbg: IconSprite;
  markingoverlay: BitmapSprite;
  arrow: PokemonBoxArrow;
  plugin_overlay?: BitmapSprite;
};

export class PokemonStorageScene implements StorageScene {
  static readonly MARK_WIDTH = 16;
  static readonly MARK_HEIGHT = 16;

  quickswap = false;
  private command = 1;
  private screen!: PokemonStorageScreen;
  private storage!: PokemonStorage;
  private bgviewport!: Viewport;
  private boxviewport!: Viewport;
  private boxsidesviewport!: Viewport;
  private arrowviewport!: Viewport;
  private viewport!: Viewport;
  private selection = 0;
  private sprites!: StorageSprites;
  private choseFromParty = false;
  private markingbitmap: AnimatedBitmap | null = null;
  private boxForMosaic: number | null = null;
  private selectionForMosaic: number | null = null;

  async pbStartBox(screen: PokemonStorageScreen, command: number): Promise<void> {
    await preloadStorage();
    this.screen = screen;
    this.storage = screen.storage;
    this.bgviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.bgviewport.z = 99999;
    this.boxviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.boxviewport.z = 99999;
    this.boxsidesviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.boxsidesviewport.z = 99999;
    this.arrowviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.arrowviewport.z = 99999;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.selection = 0;
    this.quickswap = false;
    const sprites: Sprites = {};
    this.choseFromParty = false;
    this.command = command;
    addBackgroundPlane(sprites, "background", "Storage/bg", this.bgviewport);
    sprites.box = new PokemonBoxSprite(this.storage, this.storage.currentBox, this.boxviewport);
    const boxsides = new IconSprite(0, 0, this.boxsidesviewport);
    boxsides.setBitmapFile("Graphics/Pictures/Storage/overlay_main");
    sprites.boxsides = boxsides;
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.boxsidesviewport);
    pbSetSystemFont(overlay.bitmap!);
    sprites.overlay = overlay;
    const pokemon = new AutoMosaicPokemonSprite(this.boxsidesviewport);
    pokemon.setOffset(PictureOrigin.CENTER);
    pokemon.x = 90;
    pokemon.y = 134;
    sprites.pokemon = pokemon;
    const boxparty = new PokemonBoxPartySprite(this.storage.party, this.boxsidesviewport);
    if (command !== 2) { // Drop down tab only on Deposit
      boxparty.x = 182;
      boxparty.y = Graphics.height;
    }
    sprites.boxparty = boxparty;
    this.markingbitmap = new AnimatedBitmap("Graphics/Pictures/Storage/markings");
    const markingbg = new IconSprite(292, 68, this.boxsidesviewport);
    markingbg.setBitmapFile("Graphics/Pictures/Storage/overlay_marking");
    markingbg.visible = false;
    sprites.markingbg = markingbg;
    const markingoverlay = new BitmapSprite(Graphics.width, Graphics.height, this.boxsidesviewport);
    markingoverlay.visible = false;
    pbSetSystemFont(markingoverlay.bitmap!);
    sprites.markingoverlay = markingoverlay;
    const arrow = new PokemonBoxArrow(this.arrowviewport);
    arrow.z += 1;
    sprites.arrow = arrow;
    this.sprites = sprites as unknown as StorageSprites;
    if (command === 2) {
      this.pbPartySetArrow(this.sprites.arrow, this.selection);
      this.pbUpdateOverlay(this.selection, this.storage.party);
    } else {
      this.pbSetArrow(this.sprites.arrow, this.selection);
      this.pbUpdateOverlay(this.selection);
    }
    this.pbSetMosaic(this.selection);
    pbSEPlay("PC access");
    await pbFadeInAndShow(this.hash());
  }

  private hash() {
    return asHash(this.sprites as unknown as Sprites);
  }

  async pbCloseBox(): Promise<void> {
    await pbFadeOutAndHide(this.hash());
    pbDisposeSpriteHash(this.sprites as never);
    this.markingbitmap?.dispose();
    this.boxviewport.dispose();
    this.boxsidesviewport.dispose();
    this.arrowviewport.dispose();
    // (Ruby leaves @bgviewport and @viewport undisposed.)
    this.bgviewport.dispose();
    this.viewport.dispose();
  }

  async pbDisplay(message: string): Promise<void> {
    const msgwindow = Window_UnformattedTextPokemon.newWithSize("", 180, 0, Graphics.width - 180, 32);
    msgwindow.viewport = this.viewport;
    msgwindow.visible = true;
    msgwindow.letterbyletter = false;
    msgwindow.resizeHeightToFit(message, Graphics.width - 180);
    msgwindow.text = message;
    pbBottomRight(msgwindow);
    for (;;) {
      await Graphics.update();
      Input.update();
      if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) break;
      msgwindow.update();
      this.update();
    }
    msgwindow.dispose();
    Input.update();
  }

  async pbShowCommands(message: string, commands: string[], index = 0): Promise<number> {
    let ret = -1;
    const msgwindow = Window_UnformattedTextPokemon.newWithSize("", 180, 0, Graphics.width - 180, 32);
    msgwindow.viewport = this.viewport;
    msgwindow.visible = true;
    msgwindow.letterbyletter = false;
    msgwindow.text = message;
    msgwindow.resizeHeightToFit(message, Graphics.width - 180);
    pbBottomRight(msgwindow);
    const cmdwindow = new Window_CommandPokemon(commands);
    cmdwindow.viewport = this.viewport;
    cmdwindow.visible = true;
    cmdwindow.resizeToFit(cmdwindow.commands);
    if (cmdwindow.height > Graphics.height - msgwindow.height) cmdwindow.height = Graphics.height - msgwindow.height;
    pbBottomRight(cmdwindow);
    cmdwindow.y -= msgwindow.height;
    cmdwindow.index = index;
    for (;;) {
      await Graphics.update();
      Input.update();
      msgwindow.update();
      cmdwindow.update();
      if (Input.trigger(Input.BACK)) {
        ret = -1;
        break;
      } else if (Input.trigger(Input.USE)) {
        ret = cmdwindow.index;
        break;
      }
      this.update();
    }
    msgwindow.dispose();
    cmdwindow.dispose();
    Input.update();
    return ret;
  }

  pbSetArrow(arrow: PokemonBoxArrow, selection: number): void {
    switch (selection) {
      case -1: case -4: case -5: // Box name, move left, move right
        arrow.x = 157 * 2;
        arrow.y = -12 * 2;
        break;
      case -2: // Party Pokémon
        arrow.x = 119 * 2;
        arrow.y = 139 * 2;
        break;
      case -3: // Close Box
        arrow.x = 207 * 2;
        arrow.y = 139 * 2;
        break;
      default:
        arrow.x = (97 + 24 * (selection % PokemonBox.BOX_WIDTH)) * 2;
        arrow.y = (8 + 24 * Math.floor(selection / PokemonBox.BOX_WIDTH)) * 2;
    }
  }

  pbChangeSelection(key: number, selection: number): number {
    const W = PokemonBox.BOX_WIDTH;
    const SIZE = PokemonBox.BOX_SIZE;
    switch (key) {
      case Input.UP:
        if (selection === -1) { // Box name
          selection = -2;
        } else if (selection === -2) { // Party
          selection = SIZE - 1 - Math.floor((W * 2) / 3); // 25
        } else if (selection === -3) { // Close Box
          selection = SIZE - Math.floor(W / 3); // 28
        } else {
          selection -= W;
          if (selection < 0) selection = -1;
        }
        break;
      case Input.DOWN:
        if (selection === -1) { // Box name
          selection = Math.floor(W / 3); // 2
        } else if (selection === -2) { // Party
          selection = -1;
        } else if (selection === -3) { // Close Box
          selection = -1;
        } else {
          selection += W;
          if (selection >= SIZE) {
            if (selection < SIZE + Math.floor(W / 2)) selection = -2; // Party
            else selection = -3; // Close Box
          }
        }
        break;
      case Input.LEFT:
        if (selection === -1) { // Box name
          selection = -4; // Move to previous box
        } else if (selection === -2) {
          selection = -3;
        } else if (selection === -3) {
          selection = -2;
        } else if (selection % W === 0) { // Wrap around
          selection += W - 1;
        } else {
          selection -= 1;
        }
        break;
      case Input.RIGHT:
        if (selection === -1) { // Box name
          selection = -5; // Move to next box
        } else if (selection === -2) {
          selection = -3;
        } else if (selection === -3) {
          selection = -2;
        } else if (selection % W === W - 1) { // Wrap around
          selection -= W - 1;
        } else {
          selection += 1;
        }
        break;
    }
    return selection;
  }

  pbPartySetArrow(arrow: PokemonBoxArrow, selection: number): void {
    if (selection < 0) return;
    const xvalues: number[] = []; // [200, 272, 200, 272, 200, 272, 236]
    const yvalues: number[] = []; // [2, 18, 66, 82, 130, 146, 220]
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      xvalues.push(200 + 72 * (i % 2));
      yvalues.push(2 + 16 * (i % 2) + 64 * Math.floor(i / 2));
    }
    xvalues.push(236);
    yvalues.push(220);
    arrow.angle = 0;
    arrow.mirror = false;
    arrow.ox = 0;
    arrow.oy = 0;
    arrow.x = xvalues[selection]!;
    arrow.y = yvalues[selection]!;
  }

  pbPartyChangeSelection(key: number, selection: number): number {
    const MAX = Settings.MAX_PARTY_SIZE;
    switch (key) {
      case Input.LEFT:
        selection -= 1;
        if (selection < 0) selection = MAX;
        break;
      case Input.RIGHT:
        selection += 1;
        if (selection > MAX) selection = 0;
        break;
      case Input.UP:
        if (selection === MAX) {
          selection = MAX - 1;
        } else {
          selection -= 2;
          if (selection < 0) selection = MAX;
        }
        break;
      case Input.DOWN:
        if (selection === MAX) {
          selection = 0;
        } else {
          selection += 2;
          if (selection > MAX) selection = MAX;
        }
        break;
    }
    return selection;
  }

  private repeatedKey(): number {
    let key = -1;
    if (Input.repeat(Input.DOWN)) key = Input.DOWN;
    if (Input.repeat(Input.RIGHT)) key = Input.RIGHT;
    if (Input.repeat(Input.LEFT)) key = Input.LEFT;
    if (Input.repeat(Input.UP)) key = Input.UP;
    return key;
  }

  async pbSelectBoxInternal(_party: Pokemon[]): Promise<Selection | null> {
    let selection = this.selection;
    this.pbSetArrow(this.sprites.arrow, selection);
    this.pbUpdateOverlay(selection);
    this.pbSetMosaic(selection);
    for (;;) {
      await Graphics.update();
      Input.update();
      const key = this.repeatedKey();
      if (key >= 0) {
        pbPlayCursorSE();
        selection = this.pbChangeSelection(key, selection);
        this.pbSetArrow(this.sprites.arrow, selection);
        if (selection === -4) {
          const nextbox = (this.storage.currentBox + this.storage.maxBoxes() - 1) % this.storage.maxBoxes();
          await this.pbSwitchBoxToLeft(nextbox);
          this.storage.currentBox = nextbox;
        } else if (selection === -5) {
          const nextbox = (this.storage.currentBox + 1) % this.storage.maxBoxes();
          await this.pbSwitchBoxToRight(nextbox);
          this.storage.currentBox = nextbox;
        }
        if (selection === -4 || selection === -5) selection = -1;
        this.pbUpdateOverlay(selection);
        this.pbSetMosaic(selection);
      }
      this.update();
      if (Input.trigger(Input.JUMPUP)) {
        pbPlayCursorSE();
        const nextbox = (this.storage.currentBox + this.storage.maxBoxes() - 1) % this.storage.maxBoxes();
        await this.pbSwitchBoxToLeft(nextbox);
        this.storage.currentBox = nextbox;
        this.pbUpdateOverlay(selection);
        this.pbSetMosaic(selection);
      } else if (Input.trigger(Input.JUMPDOWN)) {
        pbPlayCursorSE();
        const nextbox = (this.storage.currentBox + 1) % this.storage.maxBoxes();
        await this.pbSwitchBoxToRight(nextbox);
        this.storage.currentBox = nextbox;
        this.pbUpdateOverlay(selection);
        this.pbSetMosaic(selection);
      } else if (Input.trigger(Input.SPECIAL)) { // Jump to box name
        if (selection !== -1) {
          pbPlayCursorSE();
          selection = -1;
          this.pbSetArrow(this.sprites.arrow, selection);
          this.pbUpdateOverlay(selection);
          this.pbSetMosaic(selection);
        }
      } else if (Input.trigger(Input.ACTION) && this.command === 0) { // Organize only
        pbPlayDecisionSE();
        this.pbSetQuickSwap(!this.quickswap);
      } else if (Input.trigger(Input.BACK)) {
        this.selection = selection;
        return null;
      } else if (Input.trigger(Input.USE)) {
        this.selection = selection;
        if (selection >= 0) return [this.storage.currentBox, selection];
        else if (selection === -1) return [-4, -1]; // Box name
        else if (selection === -2) return [-2, -1]; // Party Pokémon
        else if (selection === -3) return [-3, -1]; // Close Box
      }
    }
  }

  async pbSelectBox(party: Pokemon[]): Promise<Selection | null> {
    if (this.command === 1) return this.pbSelectBoxInternal(party); // Withdraw
    let ret: Selection | null = null;
    for (;;) {
      if (!this.choseFromParty) ret = await this.pbSelectBoxInternal(party);
      if (this.choseFromParty || (ret && ret[0] === -2)) { // Party Pokémon
        if (!this.choseFromParty) {
          await this.pbShowPartyTab();
          this.selection = 0;
        }
        const r = await this.pbSelectPartyInternal(party, false);
        if (r < 0) {
          await this.pbHidePartyTab();
          this.selection = 0;
          this.choseFromParty = false;
        } else {
          this.choseFromParty = true;
          return [-1, r];
        }
      } else {
        this.choseFromParty = false;
        return ret;
      }
    }
  }

  async pbSelectPartyInternal(party: Pokemon[], depositing: boolean): Promise<number> {
    let selection = this.selection;
    this.pbPartySetArrow(this.sprites.arrow, selection);
    this.pbUpdateOverlay(selection, party);
    this.pbSetMosaic(selection);
    let lastsel = 1;
    for (;;) {
      await Graphics.update();
      Input.update();
      const key = this.repeatedKey();
      if (key >= 0) {
        pbPlayCursorSE();
        const newselection = this.pbPartyChangeSelection(key, selection);
        if (newselection === -1) {
          if (!depositing) return -1;
        } else if (newselection === -2) {
          selection = lastsel;
        } else {
          selection = newselection;
        }
        this.pbPartySetArrow(this.sprites.arrow, selection);
        if (selection > 0) lastsel = selection;
        this.pbUpdateOverlay(selection, party);
        this.pbSetMosaic(selection);
      }
      this.update();
      if (Input.trigger(Input.ACTION) && this.command === 0) { // Organize only
        pbPlayDecisionSE();
        this.pbSetQuickSwap(!this.quickswap);
      } else if (Input.trigger(Input.BACK)) {
        this.selection = selection;
        return -1;
      } else if (Input.trigger(Input.USE)) {
        if (selection >= 0 && selection < Settings.MAX_PARTY_SIZE) {
          this.selection = selection;
          return selection;
        } else if (selection === Settings.MAX_PARTY_SIZE) { // Close Box
          this.selection = selection;
          return depositing ? -3 : -1;
        }
      }
    }
  }

  async pbSelectParty(party: Pokemon[]): Promise<number> {
    return this.pbSelectPartyInternal(party, true);
  }

  async pbChangeBackground(wp: number): Promise<void> {
    this.sprites.box.refreshSprites = false;
    let alpha = 0;
    await Graphics.update();
    this.update();
    const timeTaken = Math.floor((FRAME_RATE * 4) / 10);
    const alphaDiff = Math.ceil(255.0 / timeTaken);
    for (let i = 0; i < timeTaken; i++) {
      alpha += alphaDiff;
      await Graphics.update();
      Input.update();
      this.sprites.box.color = new Color(248, 248, 248, alpha);
      this.update();
    }
    this.sprites.box.refreshBox = true;
    (this.storage.get(this.storage.currentBox) as PokemonBox).background = wp;
    for (let i = 0; i < Math.floor(FRAME_RATE / 10); i++) {
      await Graphics.update();
      Input.update();
      this.update();
    }
    for (let i = 0; i < timeTaken; i++) {
      alpha -= alphaDiff;
      await Graphics.update();
      Input.update();
      this.sprites.box.color = new Color(248, 248, 248, alpha);
      this.update();
    }
    this.sprites.box.refreshSprites = true;
  }

  async pbSwitchBoxToRight(newboxNumber: number): Promise<void> {
    await preloadPokemonIcons((this.storage.get(newboxNumber) as PokemonBox).pokemon);
    const newbox = new PokemonBoxSprite(this.storage, newboxNumber, this.boxviewport);
    newbox.x = 520;
    const distancePerFrame = Math.floor((64 * 20) / FRAME_RATE);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.sprites.box.x -= distancePerFrame;
      newbox.x -= distancePerFrame;
      this.update();
      if (newbox.x <= 184) break;
    }
    const diff = newbox.x - 184;
    newbox.x = 184;
    this.sprites.box.x -= diff;
    this.sprites.box.dispose();
    this.sprites.box = newbox;
  }

  async pbSwitchBoxToLeft(newboxNumber: number): Promise<void> {
    await preloadPokemonIcons((this.storage.get(newboxNumber) as PokemonBox).pokemon);
    const newbox = new PokemonBoxSprite(this.storage, newboxNumber, this.boxviewport);
    newbox.x = -152;
    const distancePerFrame = Math.floor((64 * 20) / FRAME_RATE);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.sprites.box.x += distancePerFrame;
      newbox.x += distancePerFrame;
      this.update();
      if (newbox.x >= 184) break;
    }
    const diff = newbox.x - 184;
    newbox.x = 184;
    this.sprites.box.x -= diff;
    this.sprites.box.dispose();
    this.sprites.box = newbox;
  }

  async pbJumpToBox(newbox: number): Promise<void> {
    if (this.storage.currentBox === newbox) return;
    if (newbox > this.storage.currentBox) await this.pbSwitchBoxToRight(newbox);
    else await this.pbSwitchBoxToLeft(newbox);
    this.storage.currentBox = newbox;
  }

  pbSetMosaic(selection: number): void {
    if (this.screen.pbHeldPokemon()) return;
    if (this.boxForMosaic === this.storage.currentBox && this.selectionForMosaic === selection) return;
    this.sprites.pokemon.mosaic = Math.floor(FRAME_RATE / 4);
    this.boxForMosaic = this.storage.currentBox;
    this.selectionForMosaic = selection;
  }

  pbSetQuickSwap(value: boolean): void {
    this.quickswap = value;
    this.sprites.arrow.quickswap = value;
  }

  async pbShowPartyTab(): Promise<void> {
    pbSEPlay("GUI storage show party panel");
    const distancePerFrame = Math.floor((48 * 20) / FRAME_RATE);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.sprites.boxparty.y -= distancePerFrame;
      this.update();
      if (this.sprites.boxparty.y <= Graphics.height - 352) break;
    }
    this.sprites.boxparty.y = Graphics.height - 352;
  }

  async pbHidePartyTab(): Promise<void> {
    pbSEPlay("GUI storage hide party panel");
    const distancePerFrame = Math.floor((48 * 20) / FRAME_RATE);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.sprites.boxparty.y += distancePerFrame;
      this.update();
      if (this.sprites.boxparty.y >= Graphics.height) break;
    }
    this.sprites.boxparty.y = Graphics.height;
  }

  async pbHold(selected: Selection): Promise<void> {
    pbSEPlay("GUI storage pick up");
    if (selected[0] === -1) this.sprites.boxparty.grabPokemon(selected[1], this.sprites.arrow);
    else this.sprites.box.grabPokemon(selected[1], this.sprites.arrow);
    while (this.sprites.arrow.grabbing()) {
      await Graphics.update();
      Input.update();
      this.update();
    }
  }

  async pbSwap(selected: Selection, _heldpoke: Pokemon | null): Promise<void> {
    pbSEPlay("GUI storage pick up");
    const heldpokesprite = this.sprites.arrow.heldPokemon();
    let boxpokesprite: PokemonBoxIcon | null = null;
    if (selected[0] === -1) boxpokesprite = this.sprites.boxparty.getPokemon(selected[1]);
    else boxpokesprite = this.sprites.box.getPokemon(selected[1]);
    if (selected[0] === -1) this.sprites.boxparty.setPokemon(selected[1], heldpokesprite);
    else this.sprites.box.setPokemon(selected[1], heldpokesprite);
    this.sprites.arrow.setSprite(boxpokesprite);
    this.sprites.pokemon.mosaic = SWAP_MOSAIC;
    this.boxForMosaic = this.storage.currentBox;
    this.selectionForMosaic = selected[1];
  }

  async pbPlace(selected: Selection, _heldpoke: Pokemon | null): Promise<void> {
    pbSEPlay("GUI storage put down");
    const heldpokesprite = this.sprites.arrow.heldPokemon();
    this.sprites.arrow.place();
    while (this.sprites.arrow.placing()) {
      await Graphics.update();
      Input.update();
      this.update();
    }
    if (selected[0] === -1) this.sprites.boxparty.setPokemon(selected[1], heldpokesprite);
    else this.sprites.box.setPokemon(selected[1], heldpokesprite);
    this.boxForMosaic = this.storage.currentBox;
    this.selectionForMosaic = selected[1];
  }

  async pbWithdraw(selected: Selection, heldpoke: Pokemon | null, partyindex: number): Promise<void> {
    if (!heldpoke) await this.pbHold(selected);
    await this.pbShowPartyTab();
    this.pbPartySetArrow(this.sprites.arrow, partyindex);
    await this.pbPlace([-1, partyindex], heldpoke);
    await this.pbHidePartyTab();
  }

  async pbStore(selected: Selection, heldpoke: Pokemon | null, destbox: number, firstfree: number): Promise<void> {
    if (heldpoke) {
      if (destbox === this.storage.currentBox) {
        const heldpokesprite = this.sprites.arrow.heldPokemon();
        this.sprites.box.setPokemon(firstfree, heldpokesprite);
        this.sprites.arrow.setSprite(null);
      } else {
        this.sprites.arrow.deleteSprite();
      }
    } else {
      const sprite = this.sprites.boxparty.getPokemon(selected[1]);
      if (destbox === this.storage.currentBox) {
        this.sprites.box.setPokemon(firstfree, sprite);
        this.sprites.boxparty.setPokemon(selected[1], null);
      } else {
        this.sprites.boxparty.deletePokemon(selected[1]);
      }
    }
  }

  async pbRelease(selected: Selection, heldpoke: Pokemon | null): Promise<void> {
    const box = selected[0];
    const index = selected[1];
    let sprite: PokemonBoxIcon | null;
    if (heldpoke) sprite = this.sprites.arrow.heldPokemon();
    else if (box === -1) sprite = this.sprites.boxparty.getPokemon(index);
    else sprite = this.sprites.box.getPokemon(index);
    if (sprite) {
      sprite.release();
      while (sprite.releasing()) {
        await Graphics.update();
        sprite.update();
        this.update();
      }
    }
  }

  async pbChooseBox(msg: string): Promise<number> {
    const commands: string[] = [];
    for (let i = 0; i < this.storage.maxBoxes(); i++) {
      const box = this.storage.get(i) as PokemonBox;
      if (box) commands.push(_INTL("{1} ({2}/{3})", box.name, box.nitems(), box.length));
    }
    return this.pbShowCommands(msg, commands, this.storage.currentBox);
  }

  async pbBoxName(helptext: string, minchars: number, maxchars: number): Promise<void> {
    const oldsprites = await pbFadeOutAndHide(this.hash());
    const ret = await pbEnterBoxName(helptext, minchars, maxchars);
    if (ret.length > 0) (this.storage.get(this.storage.currentBox) as PokemonBox).name = ret;
    this.sprites.box.refreshBox = true;
    this.pbRefresh();
    await pbFadeInAndShow(this.hash(), oldsprites);
  }

  async pbChooseItem(bag: PokemonBag): Promise<Id | null> {
    let ret: Id | null = null;
    await pbFadeOutIn(async () => {
      const scene = new PokemonBag_Scene();
      const screen = new PokemonBagScreen(scene, bag);
      ret = await screen.pbChooseItemScreen((item) => Item.get(item).canHold());
    });
    return ret;
  }

  async pbSummary(selected: Selection, heldpoke: Pokemon | null): Promise<void> {
    const oldsprites = await pbFadeOutAndHide(this.hash());
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene);
    if (heldpoke) {
      await screen.pbStartScreen([heldpoke], 0);
    } else if (selected[0] === -1) {
      this.selection = await screen.pbStartScreen(this.storage.party, selected[1]);
      this.pbPartySetArrow(this.sprites.arrow, this.selection);
      this.pbUpdateOverlay(this.selection, this.storage.party);
    } else {
      this.selection = await screen.pbStartScreen(this.storage.boxes[selected[0]]!.pokemon as Pokemon[], selected[1]);
      this.pbSetArrow(this.sprites.arrow, this.selection);
      this.pbUpdateOverlay(this.selection);
    }
    await pbFadeInAndShow(this.hash(), oldsprites);
  }

  pbMarkingSetArrow(arrow: PokemonBoxArrow, selection: number): void {
    if (selection >= 0) {
      const xvalues = [162, 191, 220, 162, 191, 220, 184, 184];
      const yvalues = [24, 24, 24, 49, 49, 49, 77, 109];
      arrow.angle = 0;
      arrow.mirror = false;
      arrow.ox = 0;
      arrow.oy = 0;
      arrow.x = xvalues[selection]! * 2;
      arrow.y = yvalues[selection]! * 2;
    }
  }

  pbMarkingChangeSelection(key: number, selection: number): number {
    switch (key) {
      case Input.LEFT:
        if (selection < 6) {
          selection -= 1;
          if (((selection % 3) + 3) % 3 === 2) selection += 3;
        }
        break;
      case Input.RIGHT:
        if (selection < 6) {
          selection += 1;
          if (selection % 3 === 0) selection -= 3;
        }
        break;
      case Input.UP:
        if (selection === 7) selection = 6;
        else if (selection === 6) selection = 4;
        else if (selection < 3) selection = 7;
        else selection -= 3;
        break;
      case Input.DOWN:
        if (selection === 7) selection = 1;
        else if (selection === 6) selection = 7;
        else if (selection >= 3) selection = 6;
        else selection += 3;
        break;
    }
    return selection;
  }

  async pbMark(selected: Selection, heldpoke: Pokemon | null): Promise<void> {
    this.sprites.markingbg.visible = true;
    this.sprites.markingoverlay.visible = true;
    const msg = _INTL("Mark your Pokémon.");
    const msgwindow = Window_UnformattedTextPokemon.newWithSize("", 180, 0, Graphics.width - 180, 32);
    msgwindow.viewport = this.viewport;
    msgwindow.visible = true;
    msgwindow.letterbyletter = false;
    msgwindow.text = msg;
    msgwindow.resizeHeightToFit(msg, Graphics.width - 180);
    pbBottomRight(msgwindow);
    const base = new Color(248, 248, 248);
    const shadow = new Color(80, 80, 80);
    let pokemon: Pokemon;
    if (heldpoke) pokemon = heldpoke;
    else if (selected[0] === -1) pokemon = this.storage.party[selected[1]]!;
    else pokemon = this.storage.boxes[selected[0]]!.get(selected[1])!;
    const markings = [...pokemon.markings];
    const mb = this.markingbitmap!.bitmap;
    const markVariants = Math.floor(mb.height / PokemonStorageScene.MARK_HEIGHT);
    let index = 0;
    let redraw = true;
    const markrect = new Rect(0, 0, PokemonStorageScene.MARK_WIDTH, PokemonStorageScene.MARK_HEIGHT);
    for (;;) {
      // Redraw the markings and text
      if (redraw) {
        const bmp = this.sprites.markingoverlay.bitmap!;
        bmp.clear();
        for (let i = 0; i < Math.floor(mb.width / PokemonStorageScene.MARK_WIDTH); i++) {
          markrect.x = i * PokemonStorageScene.MARK_WIDTH;
          markrect.y = Math.min(markings[i] || 0, markVariants - 1) * PokemonStorageScene.MARK_HEIGHT;
          bmp.blt(336 + 58 * (i % 3), 106 + 50 * Math.floor(i / 3), mb, markrect);
        }
        const textpos: TextPosition[] = [
          [_INTL("OK"), 402, 216, 2, base, shadow, 1],
          [_INTL("Cancel"), 402, 280, 2, base, shadow, 1],
        ];
        pbDrawTextPositions(bmp, textpos);
        this.pbMarkingSetArrow(this.sprites.arrow, index);
        redraw = false;
      }
      await Graphics.update();
      Input.update();
      const key = this.repeatedKey();
      if (key >= 0) {
        const oldindex = index;
        index = this.pbMarkingChangeSelection(key, index);
        if (index !== oldindex) pbPlayCursorSE();
        this.pbMarkingSetArrow(this.sprites.arrow, index);
      }
      this.update();
      if (Input.trigger(Input.BACK)) {
        pbPlayCancelSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        if (index === 6) { // OK
          pokemon.markings = markings;
          break;
        } else if (index === 7) { // Cancel
          break;
        } else {
          markings[index] = ((markings[index] || 0) + 1) % markVariants;
          redraw = true;
        }
      }
    }
    this.sprites.markingbg.visible = false;
    this.sprites.markingoverlay.visible = false;
    msgwindow.dispose();
  }

  pbRefresh(): void {
    this.sprites.box.refresh();
    this.sprites.boxparty.refresh();
  }

  pbHardRefresh(): void {
    const oldPartyY = this.sprites.boxparty.y;
    this.sprites.box.dispose();
    this.sprites.box = new PokemonBoxSprite(this.storage, this.storage.currentBox, this.boxviewport);
    this.sprites.boxparty.dispose();
    this.sprites.boxparty = new PokemonBoxPartySprite(this.storage.party, this.boxsidesviewport);
    this.sprites.boxparty.y = oldPartyY;
  }

  drawMarkings(bitmap: Bitmap, x: number, y: number, _width: number, _height: number, markings: number[]): void {
    const mb = this.markingbitmap!.bitmap;
    const markVariants = Math.floor(mb.height / PokemonStorageScene.MARK_HEIGHT);
    const markrect = new Rect(0, 0, PokemonStorageScene.MARK_WIDTH, PokemonStorageScene.MARK_HEIGHT);
    for (let i = 0; i < Math.floor(mb.width / PokemonStorageScene.MARK_WIDTH); i++) {
      markrect.x = i * PokemonStorageScene.MARK_WIDTH;
      markrect.y = Math.min(markings[i] || 0, markVariants - 1) * PokemonStorageScene.MARK_HEIGHT;
      bitmap.blt(x + i * PokemonStorageScene.MARK_WIDTH, y, mb, markrect);
    }
  }

  /** Essentials Deluxe's pbUpdateOverlay (Miscellaneous.rb:333). */
  pbUpdateOverlay(selection: number, party: Pokemon[] | null = null): void {
    const overlay = this.sprites.overlay.bitmap!;
    overlay.clear();
    if (!this.sprites.plugin_overlay) {
      this.sprites.plugin_overlay = new BitmapSprite(Graphics.width, Graphics.height, this.boxsidesviewport);
      pbSetSystemFont(this.sprites.plugin_overlay.bitmap!);
    }
    const pluginOverlay = this.sprites.plugin_overlay.bitmap!;
    pluginOverlay.clear();
    const buttonbase = new Color(248, 248, 248);
    const buttonshadow = new Color(80, 80, 80);
    pbDrawTextPositions(overlay, [
      [_INTL("Party: {1}", this.storage.party ? this.storage.party.length : 0), 270, 334, 2, buttonbase, buttonshadow, 1],
      [_INTL("Exit"), 446, 334, 2, buttonbase, buttonshadow, 1],
    ]);
    let pokemon: Pokemon | null = null;
    if (this.screen.pbHeldPokemon()) {
      pokemon = this.screen.pbHeldPokemon();
    } else if (selection >= 0) {
      pokemon = party ? (party[selection] ?? null) : this.storage.get(this.storage.currentBox, selection);
    }
    if (!pokemon) {
      this.sprites.pokemon.visible = false;
      return;
    }
    this.sprites.pokemon.visible = true;
    const base = new Color(88, 88, 80);
    const shadow = new Color(168, 184, 184);
    const nonbase = new Color(208, 208, 208);
    const nonshadow = new Color(224, 224, 224);
    const pokename = pokemon.name;
    const textstrings: TextPosition[] = [[pokename, 10, 14, false, base, shadow]];
    if (!pokemon.egg()) {
      const imagepos: ImagePosition[] = [];
      if (pokemon.male()) {
        textstrings.push([_INTL("♂"), 148, 14, false, new Color(24, 112, 216), new Color(136, 168, 208)]);
      } else if (pokemon.female()) {
        textstrings.push([_INTL("♀"), 148, 14, false, new Color(248, 56, 32), new Color(224, 152, 144)]);
      }
      imagepos.push(["Graphics/Pictures/Storage/overlay_lv", 6, 246]);
      textstrings.push([String(pokemon.level), 28, 240, false, base, shadow]);
      if (pokemon.ability) textstrings.push([pokemon.ability.name, 86, 312, 2, base, shadow]);
      else textstrings.push([_INTL("No ability"), 86, 312, 2, nonbase, nonshadow]);
      if (pokemon.item) textstrings.push([pokemon.item.name, 86, 348, 2, base, shadow]);
      else textstrings.push([_INTL("No item"), 86, 348, 2, nonbase, nonshadow]);
      if (pokemon.shiny) pbDrawImagePositions(pluginOverlay, [["Graphics/Pictures/shiny", 134, 16]]);
      pbDisplayGmaxFactor(pokemon, pluginOverlay, 8, 52); // ZUD Mechanics
      // Enhanced UI (Settings::STORAGE_SHINY_LEAF / STORAGE_IV_RATINGS)
      pbDisplayShinyLeaf(pokemon, pluginOverlay, 158, 50);
      pbDisplayIVRatings(pokemon, pluginOverlay, 8, 198, true);
      const typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
      const types = pokemon.types();
      types.forEach((type, i) => {
        const typeNumber = Type.get(type).iconPosition;
        const typeRect = new Rect(0, typeNumber * 28, 64, 28);
        const typeX = types.length === 1 ? 52 : 18 + 70 * i;
        overlay.blt(typeX, 272, typebitmap.bitmap, typeRect);
      });
      this.drawMarkings(overlay, 70, 240, 128, 20, pokemon.markings);
      pbDrawImagePositions(overlay, imagepos);
    }
    pbDrawTextPositions(overlay, textstrings);
    this.sprites.pokemon.setPokemonBitmap(pokemon);
  }

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }
}

/** pbFadeOutIn { PokemonStorageScreen.new(PokemonStorageScene.new, $PokemonStorage).pbStartScreen(command) } */
export async function pbOpenPokemonStorage(command: number, after?: () => void): Promise<void> {
  await pbFadeOutIn(async () => {
    const scene = new PokemonStorageScene();
    const screen = new PokemonStorageScreen(scene, G.storage);
    await screen.pbStartScreen(command);
    after?.();
  });
}

// The party screen's [Special]: To Boxes (Pokémon Box Link), 005_UI_Party.rb:765.
PartyHooks.pokemonStorage = (hardRefresh) => pbOpenPokemonStorage(0, hardRefresh);
