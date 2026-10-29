// Port of 016_UI/003_UI_Pokedex_Main.rb (Window_Pokedex,
// PokedexSearchSelectionSprite, PokemonPokedex_Scene, PokemonPokedexScreen)
// with this game's plugin patches, in load order:
//   26 Generation 8 Pack (EBDX Wrapper Compatibility.rb): setIconBitmap
//      constrains the sprite to 224x216 — superseded by:
//   29 Essentials Deluxe (Pokedex.rb): setIconBitmap shows the last seen
//      form's gender/shininess/Shadow/Gigantamax sprite (keeping Gen 8's box),
//      pbGetDexList reads the 4-value last_form_seen.
//   34 Enhanced UI: pbRefresh also draws the species' habitat icon.

import { BodyColor } from "../../data/gameData/bodyColor";
import { BodyShape } from "../../data/gameData/bodyShape";
import type { Id } from "../../data/gameData/gameData";
import { pbAllRegionalSpecies } from "../../data/gameData/miscPBSData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Type } from "../../data/gameData/type";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../../game/GameSystem";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbCopyBitmap, pbDrawShadowText, pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbActivateWindow, pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbDoEnsureBitmap, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbMessage } from "../messages";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundPlane, type AnimatedPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { PictureOrigin, PokemonSprite, preloadSpeciesSprite } from "../sprites/pokemonSprite";
import { BitmapSprite } from "../SpriteWrapper";
import { Window_DrawableCommand } from "../windows/SpriteWindowText";
import { DEXES_WITH_OFFSETS, dexGlobals, f1, pad3, player, pokedexNames, userInUS } from "./dexCommon";
import { enhancedUIGraphics, EnhancedUISettings, pbDisplayHabitat } from "./enhancedUI";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "./pokedexEntry";

const DEX = "Graphics/Pictures/Pokedex/";

/** [species, name, height, weight, dex number, number shift, type1, type2, color, shape] */
export type DexEntry = [Id, string, number, number, number, boolean, Id?, Id?, Id?, Id?];

/** Ruby's <=> for numbers and strings. */
const cmp = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0);
/** Integer division as in Ruby (floors). */
const idiv = (a: number, b: number) => Math.floor(a / b);

/** The graphics the Pokédex list and search screens use. */
export function pokedexMainGraphics(): string[] {
  return [
    "cursor_list", "icon_own", "icon_seen", "cursor_search", "icon_slider", "icon_types", "icon_shapes", "icon_hw",
    "icon_searchsel", "icon_searchslider", "bg_list", "bg_listsearch", "bg_search", "bg_search_order", "bg_search_name",
    "bg_search_type", "bg_search_type_18", "bg_search_size", "bg_search_color", "bg_search_shape",
  ].map((f) => DEX + f);
}

//===============================================================================
//
//===============================================================================
export class Window_Pokedex extends Window_DrawableCommand {
  private _commands: DexEntry[] = [];
  private pokeballOwn!: AnimatedBitmap;
  private pokeballSeen!: AnimatedBitmap;

  constructor(x: number, y: number, width: number, height: number, viewport: Viewport | null) {
    super(x, y, width, height, viewport);
    this._selarrow = new AnimatedBitmap(`${DEX}cursor_list`);
    this.pokeballOwn = new AnimatedBitmap(`${DEX}icon_own`);
    this.pokeballSeen = new AnimatedBitmap(`${DEX}icon_seen`);
    this.baseColor = new Color(88, 88, 80);
    this.shadowColor = new Color(168, 184, 184);
    this.windowskin = null;
  }

  get commands(): DexEntry[] { return this._commands; }
  set commands(value: DexEntry[]) {
    this._commands = value;
    this.refresh();
  }

  override dispose(): void {
    this.pokeballOwn?.dispose();
    this.pokeballSeen?.dispose();
    super.dispose();
  }

  get species(): Id | 0 {
    return this._commands.length === 0 ? 0 : this._commands[this.index]![0];
  }

  override itemCount(): number {
    return this._commands?.length ?? 0;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    if (index >= this.topRow + this.pageItemMax) return;
    rect = new Rect(rect.x + 16, rect.y, rect.width - 16, rect.height);
    const entry = this._commands[index]!;
    const species = entry[0];
    let indexNumber = entry[4];
    if (entry[5]) indexNumber -= 1;
    let numText: string;
    let nameText: string;
    if (player().seen(species)) {
      if (player().owned(species)) pbCopyBitmap(this.contents!, this.pokeballOwn.bitmap, rect.x - 6, rect.y + 10);
      else pbCopyBitmap(this.contents!, this.pokeballSeen.bitmap, rect.x - 6, rect.y + 10);
      numText = pad3(indexNumber);
      nameText = entry[1];
    } else {
      numText = pad3(indexNumber);
      nameText = "----------";
    }
    pbDrawShadowText(this.contents!, rect.x + 36, rect.y + 6, rect.width, rect.height, numText, this.baseColor, this.shadowColor);
    pbDrawShadowText(this.contents!, rect.x + 84, rect.y + 6, rect.width, rect.height, nameText, this.baseColor, this.shadowColor);
  }

  override refresh(): void {
    if (this._selarrow === undefined || !this.pokeballOwn) return;
    this._itemMax = this.itemCount();
    const dwidth = this.width - this.borderX;
    const dheight = this.height - this.borderY;
    this.contents = pbDoEnsureBitmap(this.contents, dwidth, dheight);
    this.contents.clear();
    for (let i = 0; i < this._itemMax; i++) {
      if (i < this.topItem || i > this.topItem + this.pageItemMax) continue;
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
//
//===============================================================================
export class PokedexSearchSelectionSprite extends Sprite {
  private selbitmap: AnimatedBitmap;
  private _index = 0;
  private _mode = -1;
  cmds = 0;
  minmax = 0;
  private xstart = 0;
  private ystart = 0;
  private xgap = 0;
  private ygap = 0;
  private cols = 0;

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.selbitmap = new AnimatedBitmap(`${DEX}cursor_search`);
    this.setBitmap(this.selbitmap.bitmap);
    this.mode = -1;
    this._index = 0;
    this.refresh();
  }

  override dispose(): void {
    this.selbitmap.dispose();
    super.dispose();
  }

  get index(): number { return this._index; }
  set index(value: number) {
    this._index = value;
    this.refresh();
  }

  set mode(value: number) {
    this._mode = value;
    switch (this._mode) {
      case 0: // Order
        [this.xstart, this.ystart, this.xgap, this.ygap, this.cols] = [46, 128, 236, 64, 2];
        break;
      case 1: // Name
        [this.xstart, this.ystart, this.xgap, this.ygap, this.cols] = [78, 114, 52, 52, 7];
        break;
      case 2: // Type
        [this.xstart, this.ystart, this.xgap, this.ygap, this.cols] = [8, 104, 124, 44, 4];
        break;
      case 3: case 4: // Height, weight
        [this.xstart, this.ystart, this.xgap, this.ygap] = [44, 110, 8, 112];
        break;
      case 5: // Color
        [this.xstart, this.ystart, this.xgap, this.ygap, this.cols] = [62, 114, 132, 52, 3];
        break;
      case 6: // Shape
        [this.xstart, this.ystart, this.xgap, this.ygap, this.cols] = [82, 116, 70, 70, 5];
        break;
    }
  }

  refresh(): void {
    const sr = this.srcRect;
    // Size and position cursor
    if (this._mode === -1) { // Main search screen
      switch (this._index) {
        case 0: sr.y = 0; sr.height = 44; break; // Order
        case 1: case 5: sr.y = 44; sr.height = 44; break; // Name, color
        case 2: sr.y = 88; sr.height = 44; break; // Type
        case 3: case 4: sr.y = 132; sr.height = 44; break; // Height, weight
        case 6: sr.y = 176; sr.height = 68; break; // Shape
        default: sr.y = 244; sr.height = 40; break; // Reset/start/cancel
      }
      switch (this._index) {
        case 0: this.x = 252; this.y = 52; break; // Order
        case 1: case 2: case 3: case 4: // Name, type, height, weight
          this.x = 114;
          this.y = 110 + (this._index - 1) * 52;
          break;
        case 5: this.x = 382; this.y = 110; break; // Color
        case 6: this.x = 420; this.y = 214; break; // Shape
        case 7: case 8: case 9: // Reset, start, cancel
          this.x = 4 + (this._index - 7) * 176;
          this.y = 334;
          break;
      }
    } else { // Parameter screen
      switch (this._index) {
        case -2: case -3: sr.y = 244; sr.height = 40; break; // OK, Cancel
        default:
          switch (this._mode) {
            case 0: sr.y = 0; sr.height = 44; break; // Order
            case 1: sr.y = 284; sr.height = 44; break; // Name
            case 2: case 5: sr.y = 44; sr.height = 44; break; // Type, color
            case 3: case 4: sr.y = this.minmax === 1 ? 328 : 424; sr.height = 96; break; // Height, weight
            case 6: sr.y = 176; sr.height = 68; break; // Shape
          }
      }
      switch (this._index) {
        case -1: // Blank option
          if (this._mode === 3 || this._mode === 4) { // Height/weight range
            this.x = this.xstart + (this.cmds + 1) * this.xgap * (this.minmax % 2);
            this.y = this.ystart + this.ygap * ((this.minmax + 1) % 2);
          } else {
            this.x = this.xstart + (this.cols - 1) * this.xgap;
            this.y = this.ystart + idiv(this.cmds, this.cols) * this.ygap;
          }
          break;
        case -2: this.x = 4; this.y = 334; break; // OK
        case -3: this.x = 356; this.y = 334; break; // Cancel
        default:
          switch (this._mode) {
            case 0: case 1: case 2: case 5: case 6: // Order, name, type, color, shape
              if (this._index >= this.cmds) {
                this.x = this.xstart + (this.cols - 1) * this.xgap;
                this.y = this.ystart + idiv(this.cmds, this.cols) * this.ygap;
              } else {
                this.x = this.xstart + (this._index % this.cols) * this.xgap;
                this.y = this.ystart + idiv(this._index, this.cols) * this.ygap;
              }
              break;
            case 3: case 4: // Height, weight
              if (this._index >= this.cmds) this.x = this.xstart + (this.cmds + 1) * this.xgap * ((this.minmax + 1) % 2);
              else this.x = this.xstart + (this._index + 1) * this.xgap;
              this.y = this.ystart + this.ygap * ((this.minmax + 1) % 2);
              break;
          }
      }
    }
  }
}

//===============================================================================
// Pokédex main screen
//===============================================================================
export class PokemonPokedex_Scene {
  static readonly MODENUMERICAL = 0;
  static readonly MODEATOZ = 1;
  static readonly MODETALLEST = 2;
  static readonly MODESMALLEST = 3;
  static readonly MODEHEAVIEST = 4;
  static readonly MODELIGHTEST = 5;

  private sliderbitmap!: AnimatedBitmap;
  private typebitmap!: AnimatedBitmap;
  private shapebitmap!: AnimatedBitmap;
  private hwbitmap!: AnimatedBitmap;
  private selbitmap!: AnimatedBitmap;
  private searchsliderbitmap!: AnimatedBitmap;
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private searchResults = false;
  private searchParams: number[] = [];
  private dexlist: DexEntry[] = [];
  private orderCommands: string[] = [];
  private nameCommands: string[] = [];
  private typeCommands: Type[] = [];
  private heightCommands: number[] = [];
  private weightCommands: number[] = [];
  private colorCommands: BodyColor[] = [];
  private shapeCommands: BodyShape[] = [];

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  private s<T>(key: string): T { return this.sprites[key] as T; }
  private get pokedexWindow(): Window_Pokedex { return this.s<Window_Pokedex>("pokedex"); }

  async pbStartScene(): Promise<void> {
    await preloadBitmaps([...pokedexMainGraphics(), "Graphics/Pictures/Pokedex/bg_list", ...enhancedUIGraphics()]);
    this.sliderbitmap = new AnimatedBitmap(`${DEX}icon_slider`);
    this.typebitmap = new AnimatedBitmap(_INTL(`${DEX}icon_types`));
    this.shapebitmap = new AnimatedBitmap(`${DEX}icon_shapes`);
    this.hwbitmap = new AnimatedBitmap(`${DEX}icon_hw`);
    this.selbitmap = new AnimatedBitmap(`${DEX}icon_searchsel`);
    this.searchsliderbitmap = new AnimatedBitmap(_INTL(`${DEX}icon_searchslider`));
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    addBackgroundPlane(this.sprites, "background", "Pokedex/bg_list", this.viewport);
    addBackgroundPlane(this.sprites, "searchbg", "Pokedex/bg_search", this.viewport);
    this.s<AnimatedPlane>("searchbg").visible = false;
    this.sprites.pokedex = new Window_Pokedex(206, 30, 276, 364, this.viewport);
    const icon = new PokemonSprite(this.viewport);
    icon.setOffset(PictureOrigin.CENTER);
    icon.x = 112;
    icon.y = 196;
    this.sprites.icon = icon;
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    pbSetSystemFont(overlay.bitmap!);
    this.sprites.overlay = overlay;
    const searchcursor = new PokedexSearchSelectionSprite(this.viewport);
    searchcursor.visible = false;
    this.sprites.searchcursor = searchcursor;
    this.searchResults = false;
    this.searchParams = [dexGlobals().pokedexMode, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    const index = dexGlobals().pokedexIndex[this.pbGetSavePositionIndex()] ?? 0;
    // Fetch the first species' sprite so it shows with the screen.
    const first = this.pbGetDexList()[index]?.[0];
    await preloadSpeciesSprite(...this.iconParams(first && player().seen(first) ? first : null));
    this.pbRefreshDexList(index);
    await pbDeactivateWindows(asHash(this.sprites));
    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.sliderbitmap.dispose();
    this.typebitmap.dispose();
    this.shapebitmap.dispose();
    this.hwbitmap.dispose();
    this.selbitmap.dispose();
    this.searchsliderbitmap.dispose();
    this.viewport.dispose();
  }

  /**
   * The Dex whose numbering and Area map are shown: $PokemonGlobal.pokedexDex
   * (National Dex -1, Regional Dexes 0, 1, ...; USE_CURRENT_REGION_DEX is off).
   */
  pbGetPokedexRegion(): number {
    return dexGlobals().pokedexDex;
  }

  /** Index of $PokemonGlobal.pokedexIndex for this Dex: regional dexes first, then the National Dex. */
  pbGetSavePositionIndex(): number {
    let index = this.pbGetPokedexRegion();
    if (index === -1) index = player().pokedex.dexesCount() - 1; // National Dex (comes after regional Dex indices)
    return index;
  }

  pbCanAddForModeList(mode: number, species: Id): boolean {
    const S = PokemonPokedex_Scene;
    switch (mode) {
      case S.MODEATOZ: return player().seen(species);
      case S.MODEHEAVIEST: case S.MODELIGHTEST: case S.MODETALLEST: case S.MODESMALLEST: return player().owned(species);
    }
    return true; // For MODENUMERICAL
  }

  /** pbGetDexList — Essentials Deluxe's (reads the 4-value last_form_seen). */
  pbGetDexList(): DexEntry[] {
    const region = this.pbGetPokedexRegion();
    let regionalSpecies: (Id | null)[] | null = pbAllRegionalSpecies(region);
    if (!regionalSpecies || regionalSpecies.length === 0) {
      regionalSpecies = Species.eachSpecies().map((s) => s.id);
    }
    const shift = DEXES_WITH_OFFSETS.includes(region);
    const ret: DexEntry[] = [];
    regionalSpecies.forEach((species, i) => {
      if (!species) return;
      if (!this.pbCanAddForModeList(dexGlobals().pokedexMode, species)) return;
      const [, form] = player().pokedex.lastFormSeen(species);
      const speciesData = Species.getSpeciesForm(species, form)!;
      const color = speciesData.color;
      const type1 = speciesData.types[0];
      const type2 = speciesData.types[1] ?? type1;
      const shape = speciesData.shape;
      ret.push([species, speciesData.name, speciesData.height, speciesData.weight, i + 1, shift, type1, type2, color, shape]);
    });
    return ret;
  }

  pbRefreshDexList(index = 0): void {
    const S = PokemonPokedex_Scene;
    let dexlist: (DexEntry | null)[] = this.pbGetDexList();
    switch (dexGlobals().pokedexMode) {
      case S.MODENUMERICAL: {
        // Hide the Dex number 0 species if unseen
        if (dexlist[0]![5] && !player().seen(dexlist[0]![0])) dexlist[0] = null;
        // Remove unseen species from the end of the list
        let i = dexlist.length - 1;
        for (;;) {
          if (i < 0 || !dexlist[i] || player().seen(dexlist[i]![0])) break;
          dexlist[i] = null;
          i -= 1;
        }
        dexlist = dexlist.filter((e) => e);
        // Sort species in ascending order by Regional Dex number
        dexlist.sort((a, b) => cmp(a![4], b![4]));
        break;
      }
      case S.MODEATOZ:
        dexlist.sort((a, b) => (a![1] === b![1] ? cmp(a![4], b![4]) : cmp(a![1], b![1])));
        break;
      case S.MODEHEAVIEST:
        dexlist.sort((a, b) => (a![3] === b![3] ? cmp(a![4], b![4]) : cmp(b![3], a![3])));
        break;
      case S.MODELIGHTEST:
        dexlist.sort((a, b) => (a![3] === b![3] ? cmp(a![4], b![4]) : cmp(a![3], b![3])));
        break;
      case S.MODETALLEST:
        dexlist.sort((a, b) => (a![2] === b![2] ? cmp(a![4], b![4]) : cmp(b![2], a![2])));
        break;
      case S.MODESMALLEST:
        dexlist.sort((a, b) => (a![2] === b![2] ? cmp(a![4], b![4]) : cmp(a![2], b![2])));
        break;
    }
    this.dexlist = dexlist as DexEntry[];
    const win = this.pokedexWindow;
    win.commands = this.dexlist;
    win.index = index;
    win.refresh();
    this.s<AnimatedPlane>("background").setBitmap(this.searchResults ? `${DEX}bg_listsearch` : `${DEX}bg_list`);
    this.pbRefresh();
  }

  pbRefresh(): void {
    const overlay = this.s<BitmapSprite>("overlay").bitmap!;
    overlay.clear();
    const base = new Color(88, 88, 80);
    const shadow = new Color(168, 184, 184);
    let iconspecies: Id | null = this.pokedexWindow.species || null;
    if (iconspecies && !player().seen(iconspecies)) iconspecies = null;
    // Write various bits of text
    let dexname = _INTL("Pokédex");
    if (player().pokedex.dexesCount() > 1) {
      const thisdex = pokedexNames()[this.pbGetSavePositionIndex()];
      if (thisdex) dexname = Array.isArray(thisdex) ? thisdex[0] : thisdex;
    }
    const textpos: TextPosition[] = [[dexname, Graphics.width / 2, 10, 2, new Color(248, 248, 248), new Color(0, 0, 0)]];
    if (iconspecies) textpos.push([Species.get(iconspecies).name, 112, 58, 2, base, shadow]);
    if (this.searchResults) {
      textpos.push([_INTL("Search results"), 112, 314, 2, base, shadow]);
      textpos.push([String(this.dexlist.length), 112, 346, 2, base, shadow]);
    } else {
      textpos.push([_INTL("Seen:"), 42, 314, 0, base, shadow]);
      textpos.push([String(player().pokedex.seenCount(this.pbGetPokedexRegion())), 182, 314, 1, base, shadow]);
      textpos.push([_INTL("Owned:"), 42, 346, 0, base, shadow]);
      textpos.push([String(player().pokedex.ownedCount(this.pbGetPokedexRegion())), 182, 346, 1, base, shadow]);
    }
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
    // Set Pokémon sprite
    this.setIconBitmap(iconspecies);
    // Draw slider arrows
    const itemlist = this.pokedexWindow;
    let showslider = false;
    if (itemlist.topRow > 0) {
      overlay.blt(468, 48, this.sliderbitmap.bitmap, new Rect(0, 0, 40, 30));
      showslider = true;
    }
    if (itemlist.topItem + itemlist.pageItemMax < itemlist.itemCount()) {
      overlay.blt(468, 346, this.sliderbitmap.bitmap, new Rect(0, 30, 40, 30));
      showslider = true;
    }
    // Draw slider box
    if (showslider) {
      const sliderheight = 268;
      let boxheight = Math.floor((sliderheight * itemlist.pageRowMax) / itemlist.rowMax);
      boxheight += Math.min(idiv(sliderheight - boxheight, 2), idiv(sliderheight, 6));
      boxheight = Math.max(Math.floor(boxheight), 40);
      let y = 78;
      y += Math.floor(((sliderheight - boxheight) * itemlist.topRow) / (itemlist.rowMax - itemlist.pageRowMax));
      overlay.blt(468, y, this.sliderbitmap.bitmap, new Rect(40, 0, 40, 8));
      let i = 0;
      while (i * 16 < boxheight - 8 - 16) {
        const height = Math.min(boxheight - 8 - 16 - i * 16, 16);
        overlay.blt(468, y + 8 + i * 16, this.sliderbitmap.bitmap, new Rect(40, 8, 40, height));
        i += 1;
      }
      overlay.blt(468, y + boxheight - 16, this.sliderbitmap.bitmap, new Rect(40, 24, 40, 16));
    }
    // --- Enhanced UI: habitat icon ---
    if (EnhancedUISettings.POKEDEX_HABITAT_ICONS) {
      const species = itemlist.species;
      if (!species || !player().seen(species)) return;
      const [, form] = player().pokedex.lastFormSeen(species);
      pbDisplayHabitat(Species.getSpeciesForm(species, form), overlay, 150, 249, this.searchResults ? 1 : 0);
    }
  }

  pbRefreshDexSearch(params: number[], _index: number): void {
    const overlay = this.s<BitmapSprite>("overlay").bitmap!;
    overlay.clear();
    const base = new Color(248, 248, 248);
    const shadow = new Color(72, 72, 72);
    // Write various bits of text
    const textpos: TextPosition[] = [
      [_INTL("Search Mode"), Graphics.width / 2, 10, 2, base, shadow],
      [_INTL("Order"), 136, 64, 2, base, shadow],
      [_INTL("Name"), 58, 122, 2, base, shadow],
      [_INTL("Type"), 58, 174, 2, base, shadow],
      [_INTL("Height"), 58, 226, 2, base, shadow],
      [_INTL("Weight"), 58, 278, 2, base, shadow],
      [_INTL("Color"), 326, 122, 2, base, shadow],
      [_INTL("Shape"), 454, 174, 2, base, shadow],
      [_INTL("Reset"), 80, 346, 2, base, shadow, 1],
      [_INTL("Start"), Graphics.width / 2, 346, 2, base, shadow, 1],
      [_INTL("Cancel"), Graphics.width - 80, 346, 2, base, shadow, 1],
    ];
    // Write order, name and color parameters
    textpos.push([this.orderCommands[params[0]!]!, 344, 66, 2, base, shadow, 1]);
    textpos.push([params[1]! < 0 ? "----" : this.nameCommands[params[1]!]!, 176, 124, 2, base, shadow, 1]);
    textpos.push([params[8]! < 0 ? "----" : this.colorCommands[params[8]!]!.name, 444, 124, 2, base, shadow, 1]);
    // Draw type icons
    if (params[2]! >= 0) {
      const typeNumber = this.typeCommands[params[2]!]!.iconPosition;
      overlay.blt(128, 168, this.typebitmap.bitmap, new Rect(0, typeNumber * 32, 96, 32));
    } else {
      textpos.push(["----", 176, 176, 2, base, shadow, 1]);
    }
    if (params[3]! >= 0) {
      const typeNumber = this.typeCommands[params[3]!]!.iconPosition;
      overlay.blt(256, 168, this.typebitmap.bitmap, new Rect(0, typeNumber * 32, 96, 32));
    } else {
      textpos.push(["----", 304, 176, 2, base, shadow, 1]);
    }
    // Write height and weight limits
    const hc = this.heightCommands;
    const wc = this.weightCommands;
    let ht1 = params[4]! < 0 ? 0 : params[4]! >= hc.length ? 999 : hc[params[4]!]!;
    let ht2 = params[5]! < 0 ? 999 : params[5]! >= hc.length ? 0 : hc[params[5]!]!;
    let wt1 = params[6]! < 0 ? 0 : params[6]! >= wc.length ? 9999 : wc[params[6]!]!;
    let wt2 = params[7]! < 0 ? 9999 : params[7]! >= wc.length ? 0 : wc[params[7]!]!;
    let hwoffset = false;
    if (userInUS()) { // If the user is in the United States
      ht1 = params[4]! >= hc.length ? 99 * 12 : Math.round(ht1 / 0.254);
      ht2 = params[5]! < 0 ? 99 * 12 : Math.round(ht2 / 0.254);
      wt1 = params[6]! >= wc.length ? 99_990 : Math.round(wt1 / 0.254);
      wt2 = params[7]! < 0 ? 99_990 : Math.round(wt2 / 0.254);
      textpos.push([`${idiv(ht1, 12)}'${String(ht1 % 12).padStart(2, "0")}''`, 166, 228, 2, base, shadow, 1]);
      textpos.push([`${idiv(ht2, 12)}'${String(ht2 % 12).padStart(2, "0")}''`, 294, 228, 2, base, shadow, 1]);
      textpos.push([f1(wt1 / 10.0), 166, 280, 2, base, shadow, 1]);
      textpos.push([f1(wt2 / 10.0), 294, 280, 2, base, shadow, 1]);
      hwoffset = true;
    } else {
      textpos.push([f1(ht1 / 10.0), 166, 228, 2, base, shadow, 1]);
      textpos.push([f1(ht2 / 10.0), 294, 228, 2, base, shadow, 1]);
      textpos.push([f1(wt1 / 10.0), 166, 280, 2, base, shadow, 1]);
      textpos.push([f1(wt2 / 10.0), 294, 280, 2, base, shadow, 1]);
    }
    overlay.blt(344, 214, this.hwbitmap.bitmap, new Rect(0, hwoffset ? 44 : 0, 32, 44));
    overlay.blt(344, 266, this.hwbitmap.bitmap, new Rect(32, hwoffset ? 44 : 0, 32, 44));
    // Draw shape icon
    if (params[9]! >= 0) {
      const shapeNumber = this.shapeCommands[params[9]!]!.iconPosition;
      overlay.blt(424, 218, this.shapebitmap.bitmap, new Rect(0, shapeNumber * 60, 60, 60));
    }
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
  }

  pbRefreshDexSearchParam(mode: number, cmds: unknown[], sel: number[], _index: number): void {
    const overlay = this.s<BitmapSprite>("overlay").bitmap!;
    overlay.clear();
    const base = new Color(248, 248, 248);
    const shadow = new Color(72, 72, 72);
    // Write various bits of text
    const textpos: TextPosition[] = [
      [_INTL("Search Mode"), Graphics.width / 2, 10, 2, base, shadow],
      [_INTL("OK"), 80, 346, 2, base, shadow, 1],
      [_INTL("Cancel"), Graphics.width - 80, 346, 2, base, shadow, 1],
    ];
    const title = [_INTL("Order"), _INTL("Name"), _INTL("Type"), _INTL("Height"), _INTL("Weight"), _INTL("Color"), _INTL("Shape")][mode]!;
    textpos.push([title, 102, mode === 6 ? 70 : 64, 0, base, shadow]);
    let xstart = 0, ystart = 0, xgap = 0, ygap = 0, halfwidth = 0, cols = 0, selbuttony = 0, selbuttonheight = 0;
    switch (mode) {
      case 0: [xstart, ystart, xgap, ygap, halfwidth, cols, selbuttony, selbuttonheight] = [46, 128, 236, 64, 92, 2, 0, 44]; break; // Order
      case 1: [xstart, ystart, xgap, ygap, halfwidth, cols, selbuttony, selbuttonheight] = [78, 114, 52, 52, 22, 7, 156, 44]; break; // Name
      case 2: [xstart, ystart, xgap, ygap, halfwidth, cols, selbuttony, selbuttonheight] = [8, 104, 124, 44, 62, 4, 44, 44]; break; // Type
      case 3: case 4: // Height, weight
        xstart = 44;
        ystart = 110;
        xgap = idiv(304, cmds.length + 1);
        ygap = 112;
        halfwidth = 60;
        cols = cmds.length + 1;
        break;
      case 5: [xstart, ystart, xgap, ygap, halfwidth, cols, selbuttony, selbuttonheight] = [62, 114, 132, 52, 62, 3, 44, 44]; break; // Color
      case 6: [xstart, ystart, xgap, ygap, halfwidth, cols, selbuttony, selbuttonheight] = [82, 116, 70, 70, 0, 5, 88, 68]; break; // Shape
    }
    // Draw selected option(s) text in top bar
    let txt1 = "";
    let txt2 = "";
    const hc = this.heightCommands;
    const wc = this.weightCommands;
    switch (mode) {
      case 2: // Type icons
        for (let i = 0; i < 2; i++) {
          if (sel[i] == null || sel[i]! < 0) {
            textpos.push(["----", 298 + 128 * i, 66, 2, base, shadow, 1]);
          } else {
            const typeNumber = this.typeCommands[sel[i]!]!.iconPosition;
            overlay.blt(250 + 128 * i, 58, this.typebitmap.bitmap, new Rect(0, typeNumber * 32, 96, 32));
          }
        }
        break;
      case 3: { // Height range
        let ht1 = sel[0]! < 0 ? 0 : sel[0]! >= hc.length ? 999 : hc[sel[0]!]!;
        let ht2 = sel[1]! < 0 ? 999 : sel[1]! >= hc.length ? 0 : hc[sel[1]!]!;
        let hwoffset = false;
        if (userInUS()) { // If the user is in the United States
          ht1 = sel[0]! >= hc.length ? 99 * 12 : Math.round(ht1 / 0.254);
          ht2 = sel[1]! < 0 ? 99 * 12 : Math.round(ht2 / 0.254);
          txt1 = `${idiv(ht1, 12)}'${String(ht1 % 12).padStart(2, "0")}''`;
          txt2 = `${idiv(ht2, 12)}'${String(ht2 % 12).padStart(2, "0")}''`;
          hwoffset = true;
        } else {
          txt1 = f1(ht1 / 10.0);
          txt2 = f1(ht2 / 10.0);
        }
        textpos.push([txt1, 286, 66, 2, base, shadow, 1]);
        textpos.push([txt2, 414, 66, 2, base, shadow, 1]);
        overlay.blt(462, 52, this.hwbitmap.bitmap, new Rect(0, hwoffset ? 44 : 0, 32, 44));
        break;
      }
      case 4: { // Weight range
        let wt1 = sel[0]! < 0 ? 0 : sel[0]! >= wc.length ? 9999 : wc[sel[0]!]!;
        let wt2 = sel[1]! < 0 ? 9999 : sel[1]! >= wc.length ? 0 : wc[sel[1]!]!;
        let hwoffset = false;
        if (userInUS()) { // If the user is in the United States
          wt1 = sel[0]! >= wc.length ? 99_990 : Math.round(wt1 / 0.254);
          wt2 = sel[1]! < 0 ? 99_990 : Math.round(wt2 / 0.254);
          txt1 = f1(wt1 / 10.0);
          txt2 = f1(wt2 / 10.0);
          hwoffset = true;
        } else {
          txt1 = f1(wt1 / 10.0);
          txt2 = f1(wt2 / 10.0);
        }
        textpos.push([txt1, 286, 66, 2, base, shadow, 1]);
        textpos.push([txt2, 414, 66, 2, base, shadow, 1]);
        overlay.blt(462, 52, this.hwbitmap.bitmap, new Rect(32, hwoffset ? 44 : 0, 32, 44));
        break;
      }
      case 5: // Color
        if (sel[0]! < 0) textpos.push(["----", 362, 66, 2, base, shadow, 1]);
        else textpos.push([(cmds[sel[0]!] as BodyColor).name, 362, 66, 2, base, shadow, 1]);
        break;
      case 6: // Shape icon
        if (sel[0]! >= 0) {
          overlay.blt(332, 50, this.shapebitmap.bitmap, new Rect(0, this.shapeCommands[sel[0]!]!.iconPosition * 60, 60, 60));
        }
        break;
      default:
        if (sel[0]! < 0) {
          const text = ["----", "-", "----", "", "", "----", ""][mode]!;
          textpos.push([text, 362, 66, 2, base, shadow, 1]);
        } else {
          textpos.push([cmds[sel[0]!] as string, 362, 66, 2, base, shadow, 1]);
        }
    }
    // Draw selected option(s) button graphic
    if (mode === 3 || mode === 4) { // Height, weight
      let xpos1 = xstart + (sel[0]! + 1) * xgap;
      if (sel[0]! < -1) xpos1 = xstart;
      let xpos2 = xstart + (sel[1]! + 1) * xgap;
      if (sel[1]! < 0) xpos2 = xstart + cols * xgap;
      if (sel[1]! >= cols - 1) xpos2 = xstart;
      const ypos1 = ystart + 180;
      const ypos2 = ystart + 36;
      if (sel[1]! < cols - 1) overlay.blt(16, 120, this.searchsliderbitmap.bitmap, new Rect(0, 192, 32, 44));
      if (sel[1]! >= 0) overlay.blt(464, 120, this.searchsliderbitmap.bitmap, new Rect(32, 192, 32, 44));
      if (sel[0]! >= 0) overlay.blt(16, 264, this.searchsliderbitmap.bitmap, new Rect(0, 192, 32, 44));
      if (sel[0]! < cols - 1) overlay.blt(464, 264, this.searchsliderbitmap.bitmap, new Rect(32, 192, 32, 44));
      const hwrect = new Rect(0, 0, 120, 96);
      overlay.blt(xpos2, ystart, this.searchsliderbitmap.bitmap, hwrect);
      hwrect.y = 96;
      overlay.blt(xpos1, ystart + ygap, this.searchsliderbitmap.bitmap, hwrect);
      textpos.push([txt1, xpos1 + halfwidth, ypos1, 2, base, null, 1]);
      textpos.push([txt2, xpos2 + halfwidth, ypos2, 2, base, null, 1]);
    } else {
      for (let i = 0; i < sel.length; i++) {
        const selrect = new Rect(0, selbuttony, this.selbitmap.bitmap.width, selbuttonheight);
        if (sel[i]! >= 0) {
          overlay.blt(xstart + (sel[i]! % cols) * xgap, ystart + idiv(sel[i]!, cols) * ygap, this.selbitmap.bitmap, selrect);
        } else {
          overlay.blt(xstart + (cols - 1) * xgap, ystart + idiv(cmds.length, cols) * ygap, this.selbitmap.bitmap, selrect);
        }
      }
    }
    // Draw options
    switch (mode) {
      case 0: case 1: // Order, name
        for (let i = 0; i < cmds.length; i++) {
          const x = xstart + halfwidth + (i % cols) * xgap;
          const y = ystart + 14 + idiv(i, cols) * ygap;
          textpos.push([cmds[i] as string, x, y, 2, base, shadow, 1]);
        }
        if (mode !== 0) {
          textpos.push([mode === 1 ? "-" : "----", xstart + halfwidth + (cols - 1) * xgap,
            ystart + 14 + idiv(cmds.length, cols) * ygap, 2, base, shadow, 1]);
        }
        break;
      case 2: { // Type
        const typerect = new Rect(0, 0, 96, 32);
        for (let i = 0; i < cmds.length; i++) {
          typerect.y = this.typeCommands[i]!.iconPosition * 32;
          overlay.blt(xstart + 14 + (i % cols) * xgap, ystart + 6 + idiv(i, cols) * ygap, this.typebitmap.bitmap, typerect);
        }
        textpos.push(["----", xstart + halfwidth + (cols - 1) * xgap, ystart + 14 + idiv(cmds.length, cols) * ygap, 2, base, shadow, 1]);
        break;
      }
      case 5: // Color
        for (let i = 0; i < cmds.length; i++) {
          const x = xstart + halfwidth + (i % cols) * xgap;
          const y = ystart + 14 + idiv(i, cols) * ygap;
          textpos.push([(cmds[i] as BodyColor).name, x, y, 2, base, shadow, 1]);
        }
        textpos.push(["----", xstart + halfwidth + (cols - 1) * xgap, ystart + 14 + idiv(cmds.length, cols) * ygap, 2, base, shadow, 1]);
        break;
      case 6: { // Shape
        const shaperect = new Rect(0, 0, 60, 60);
        for (let i = 0; i < cmds.length; i++) {
          shaperect.y = this.shapeCommands[i]!.iconPosition * 60;
          overlay.blt(xstart + 4 + (i % cols) * xgap, ystart + 4 + idiv(i, cols) * ygap, this.shapebitmap.bitmap, shaperect);
        }
        break;
      }
    }
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
  }

  /** The setSpeciesBitmap parameters for the last form seen of `species`. */
  iconParams(species: Id | null): unknown[] {
    let [gender, form, shiny, special] = species ? player().pokedex.lastFormSeen(species) : [0, 0, 0, 0];
    if (!Settings.POKEDEX_SHINY_FORMS) shiny = 0;
    if (special === 1 && !Settings.POKEDEX_SHADOW_FORMS) special = 0;
    const shinyParam = shiny === 2 ? "super_shiny" : shiny === 1;
    const shadow = special === 1;
    const gmax = special === 2;
    const celestial = special === 3;
    return [species, gender, form, shinyParam, shadow, false, false, false, gmax, celestial];
  }

  /** setIconBitmap(species) — Essentials Deluxe's, with Generation 8's sprite box. */
  setIconBitmap(species: Id | null): void {
    const icon = this.s<PokemonSprite>("icon");
    icon.setSpeciesBitmap(...this.iconParams(species));
    icon.constrict([224, 216]);
  }

  pbSearchDexList(params: number[]): DexEntry[] {
    const S = PokemonPokedex_Scene;
    dexGlobals().pokedexMode = params[0]!;
    let dexlist = this.pbGetDexList();
    // Filter by name
    if (params[1]! >= 0) {
      const scanNameCommand = [...this.nameCommands[params[1]!]!];
      dexlist = dexlist.filter((item) => {
        if (!player().seen(item[0])) return false;
        const firstChar = item[1].slice(0, 1);
        return scanNameCommand.some((v) => v === firstChar);
      });
    }
    // Filter by type
    if (params[2]! >= 0 || params[3]! >= 0) {
      const stype1 = params[2]! >= 0 ? this.typeCommands[params[2]!]!.id : null;
      const stype2 = params[3]! >= 0 ? this.typeCommands[params[3]!]!.id : null;
      dexlist = dexlist.filter((item) => {
        if (!player().owned(item[0])) return false;
        const type1 = item[6];
        const type2 = item[7];
        if (stype1 && stype2) {
          // Find species that match both types
          return (type1 === stype1 && type2 === stype2) || (type1 === stype2 && type2 === stype1);
        } else if (stype1) {
          // Find species that match first type entered
          return type1 === stype1 || type2 === stype1;
        } else if (stype2) {
          // Find species that match second type entered
          return type1 === stype2 || type2 === stype2;
        }
        return false;
      });
    }
    const hc = this.heightCommands;
    const wc = this.weightCommands;
    // Filter by height range
    if (params[4]! >= 0 || params[5]! >= 0) {
      const minh = params[4]! < 0 ? 0 : params[4]! >= hc.length ? 999 : hc[params[4]!]!;
      const maxh = params[5]! < 0 ? 999 : params[5]! >= hc.length ? 0 : hc[params[5]!]!;
      dexlist = dexlist.filter((item) => player().owned(item[0]) && item[2] >= minh && item[2] <= maxh);
    }
    // Filter by weight range
    if (params[6]! >= 0 || params[7]! >= 0) {
      const minw = params[6]! < 0 ? 0 : params[6]! >= wc.length ? 9999 : wc[params[6]!]!;
      const maxw = params[7]! < 0 ? 9999 : params[7]! >= wc.length ? 0 : wc[params[7]!]!;
      dexlist = dexlist.filter((item) => player().owned(item[0]) && item[3] >= minw && item[3] <= maxw);
    }
    // Filter by color
    if (params[8]! >= 0) {
      const scolor = this.colorCommands[params[8]!]!.id;
      dexlist = dexlist.filter((item) => player().seen(item[0]) && item[8] === scolor);
    }
    // Filter by shape
    if (params[9]! >= 0) {
      const sshape = this.shapeCommands[params[9]!]!.id;
      dexlist = dexlist.filter((item) => player().seen(item[0]) && item[9] === sshape);
    }
    // Remove all unseen species from the results
    dexlist = dexlist.filter((item) => player().seen(item[0]));
    switch (dexGlobals().pokedexMode) {
      case S.MODENUMERICAL: dexlist.sort((a, b) => cmp(a[4], b[4])); break;
      case S.MODEATOZ: dexlist.sort((a, b) => cmp(a[1], b[1])); break;
      case S.MODEHEAVIEST: dexlist.sort((a, b) => cmp(b[3], a[3])); break;
      case S.MODELIGHTEST: dexlist.sort((a, b) => cmp(a[3], b[3])); break;
      case S.MODETALLEST: dexlist.sort((a, b) => cmp(b[2], a[2])); break;
      case S.MODESMALLEST: dexlist.sort((a, b) => cmp(a[2], b[2])); break;
    }
    return dexlist;
  }

  async pbCloseSearch(): Promise<void> {
    const oldsprites = await pbFadeOutAndHide(asHash(this.sprites));
    const oldspecies = this.pokedexWindow.species;
    this.searchResults = false;
    dexGlobals().pokedexMode = PokemonPokedex_Scene.MODENUMERICAL;
    this.searchParams = [dexGlobals().pokedexMode, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    this.pbRefreshDexList(dexGlobals().pokedexIndex[this.pbGetSavePositionIndex()] ?? 0);
    for (let i = 0; i < this.dexlist.length; i++) {
      if (this.dexlist[i]![0] !== oldspecies) continue;
      this.pokedexWindow.index = i;
      this.pbRefresh();
      break;
    }
    dexGlobals().pokedexIndex[this.pbGetSavePositionIndex()] = this.pokedexWindow.index;
    await pbFadeInAndShow(asHash(this.sprites), oldsprites);
  }

  async pbDexEntry(index: number): Promise<void> {
    const oldsprites = await pbFadeOutAndHide(asHash(this.sprites));
    let region = -1;
    // (Settings::USE_CURRENT_REGION_DEX is false)
    const dexnames = pokedexNames();
    const thisdex = dexnames[this.pbGetSavePositionIndex()];
    if (Array.isArray(thisdex)) region = thisdex[1];
    const scene = new PokemonPokedexInfo_Scene();
    const screen = new PokemonPokedexInfoScreen(scene);
    let ret = await screen.pbStartScreen(this.dexlist, index, region);
    if (this.searchResults) {
      const dexlist = this.pbSearchDexList(this.searchParams);
      this.dexlist = dexlist;
      this.pokedexWindow.commands = this.dexlist;
      if (ret >= this.dexlist.length) ret = this.dexlist.length - 1;
      if (ret < 0) ret = 0;
    } else {
      this.pbRefreshDexList(dexGlobals().pokedexIndex[this.pbGetSavePositionIndex()] ?? 0);
      dexGlobals().pokedexIndex[this.pbGetSavePositionIndex()] = ret;
    }
    this.pokedexWindow.index = ret;
    this.pokedexWindow.refresh();
    this.pbRefresh();
    await pbFadeInAndShow(asHash(this.sprites), oldsprites);
  }

  async pbDexSearchCommands(mode: number, selitems: number[], mainindex: number): Promise<number[] | null> {
    const cmds: unknown[] = [this.orderCommands, this.nameCommands, this.typeCommands, this.heightCommands,
      this.weightCommands, this.colorCommands, this.shapeCommands][mode]!;
    const cols = [2, 7, 4, 1, 1, 3, 5][mode]!;
    let ret: number[] | null = null;
    // Set background
    const searchbg = this.s<AnimatedPlane>("searchbg");
    switch (mode) {
      case 0: searchbg.setBitmap(`${DEX}bg_search_order`); break;
      case 1: searchbg.setBitmap(`${DEX}bg_search_name`); break;
      case 2: {
        let count = 0;
        for (const t of Type.each()) if (!t.pseudoType && t.id !== "SHADOW") count += 1;
        searchbg.setBitmap(count === 18 ? `${DEX}bg_search_type_18` : `${DEX}bg_search_type`);
        break;
      }
      case 3: case 4: searchbg.setBitmap(`${DEX}bg_search_size`); break;
      case 5: searchbg.setBitmap(`${DEX}bg_search_color`); break;
      case 6: searchbg.setBitmap(`${DEX}bg_search_shape`); break;
    }
    const selindex = [...selitems];
    let index = selindex[0]!;
    let oldindex = index;
    let minmax = 1;
    let oldminmax = minmax;
    if (mode === 3 || mode === 4) index = oldindex = selindex[minmax]!;
    const cursor = this.s<PokedexSearchSelectionSprite>("searchcursor");
    cursor.mode = mode;
    cursor.cmds = cmds.length;
    cursor.minmax = minmax;
    cursor.index = index;
    let nextparam = cmds.length % 2;
    this.pbRefreshDexSearchParam(mode, cmds, selindex, index);
    for (;;) {
      this.pbUpdate();
      if (index !== oldindex || minmax !== oldminmax) {
        cursor.minmax = minmax;
        cursor.index = index;
        oldindex = index;
        oldminmax = minmax;
      }
      await Graphics.update();
      Input.update();
      if (mode === 3 || mode === 4) {
        if (Input.trigger(Input.UP)) {
          if (index < -1) { // From OK/Cancel
            minmax = 0;
            index = selindex[minmax]!;
          } else if (minmax === 0) {
            minmax = 1;
            index = selindex[minmax]!;
          }
          if (index !== oldindex || minmax !== oldminmax) {
            pbPlayCursorSE();
            this.pbRefreshDexSearchParam(mode, cmds, selindex, index);
          }
        } else if (Input.trigger(Input.DOWN)) {
          switch (minmax) {
            case 1: minmax = 0; index = selindex[minmax]!; break;
            case 0: minmax = -1; index = -2; break;
          }
          if (index !== oldindex || minmax !== oldminmax) {
            pbPlayCursorSE();
            this.pbRefreshDexSearchParam(mode, cmds, selindex, index);
          }
        } else if (Input.repeat(Input.LEFT)) {
          if (index === -3) {
            index = -2;
          } else if (index >= -1) {
            if (minmax === 1 && index === -1) {
              if (selindex[0]! < cmds.length - 1) index = cmds.length - 1;
            } else if (minmax === 1 && index === 0) {
              if (selindex[0]! < 0) index = cmds.length;
            } else if (index > -1 && !(minmax === 1 && index >= cmds.length)) {
              if (minmax === 0 || selindex[0]! <= index - 1) index -= 1;
            }
          }
          if (index !== oldindex) {
            if (minmax >= 0) selindex[minmax] = index;
            pbPlayCursorSE();
            this.pbRefreshDexSearchParam(mode, cmds, selindex, index);
          }
        } else if (Input.repeat(Input.RIGHT)) {
          if (index === -2) {
            index = -3;
          } else if (index >= -1) {
            if (minmax === 1 && index >= cmds.length) {
              index = 0;
            } else if (minmax === 1 && index === cmds.length - 1) {
              index = -1;
            } else if (index < cmds.length && !(minmax === 1 && index < 0)) {
              if (minmax === 1 || selindex[1] === -1 || (selindex[1]! < cmds.length && selindex[1]! >= index + 1)) index += 1;
            }
          }
          if (index !== oldindex) {
            if (minmax >= 0) selindex[minmax] = index;
            pbPlayCursorSE();
            this.pbRefreshDexSearchParam(mode, cmds, selindex, index);
          }
        }
      } else {
        if (Input.trigger(Input.UP)) {
          if (index === -1) { // From blank
            index = cmds.length - 1 - ((cmds.length - 1) % cols) - 1;
          } else if (index === -2) { // From OK
            index = idiv(cmds.length - 1, cols) * cols;
          } else if (index === -3 && mode === 0) { // From Cancel
            index = cmds.length - 1;
          } else if (index === -3) { // From Cancel
            index = -1;
          } else if (index >= cols) {
            index -= cols;
          }
          if (index !== oldindex) pbPlayCursorSE();
        } else if (Input.trigger(Input.DOWN)) {
          if (index === -1) { // From blank
            index = -3;
          } else if (index >= 0) {
            if (index + cols < cmds.length) {
              index += cols;
            } else if (idiv(index, cols) < idiv(cmds.length - 1, cols)) {
              index = index % cols < cols / 2.0 ? cmds.length - 1 : -1;
            } else {
              index = index % cols < cols / 2.0 ? -2 : -3;
            }
          }
          if (index !== oldindex) pbPlayCursorSE();
        } else if (Input.trigger(Input.LEFT)) {
          if (index === -3) index = -2;
          else if (index === -1) index = cmds.length - 1;
          else if (index > 0 && index % cols !== 0) index -= 1;
          if (index !== oldindex) pbPlayCursorSE();
        } else if (Input.trigger(Input.RIGHT)) {
          if (index === -2) index = -3;
          else if (index === cmds.length - 1 && mode !== 0) index = -1;
          else if (index >= 0 && index % cols !== cols - 1) index += 1;
          if (index !== oldindex) pbPlayCursorSE();
        }
      }
      if (Input.trigger(Input.ACTION)) {
        index = -2;
        if (index !== oldindex) pbPlayCursorSE();
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        ret = null;
        break;
      } else if (Input.trigger(Input.USE)) {
        if (index === -2) { // OK
          pbPlayDecisionSE();
          ret = selindex;
          break;
        } else if (index === -3) { // Cancel
          pbPlayCloseMenuSE();
          ret = null;
          break;
        } else if (mode !== 3 && mode !== 4) { // (selindex != index: an Array never equals a number)
          if (mode === 2) {
            if (index === -1) {
              nextparam = selindex[1]! >= 0 ? 1 : 0;
            } else if (index >= 0) {
              nextparam = selindex[0]! < 0 ? 0 : selindex[1]! < 0 ? 1 : nextparam;
            }
            if (index < 0 || selindex[(nextparam + 1) % 2] !== index) {
              pbPlayDecisionSE();
              selindex[nextparam] = index;
              nextparam = (nextparam + 1) % 2;
            }
          } else {
            pbPlayDecisionSE();
            selindex[0] = index;
          }
          this.pbRefreshDexSearchParam(mode, cmds, selindex, index);
        }
      }
    }
    Input.update();
    // Set background image
    searchbg.setBitmap(`${DEX}bg_search`);
    cursor.mode = -1;
    cursor.index = mainindex;
    return ret;
  }

  async pbDexSearch(): Promise<number> {
    const S = PokemonPokedex_Scene;
    const oldsprites = await pbFadeOutAndHide(asHash(this.sprites));
    const params = [...this.searchParams];
    this.orderCommands = [];
    this.orderCommands[S.MODENUMERICAL] = _INTL("Numerical");
    this.orderCommands[S.MODEATOZ] = _INTL("A to Z");
    this.orderCommands[S.MODEHEAVIEST] = _INTL("Heaviest");
    this.orderCommands[S.MODELIGHTEST] = _INTL("Lightest");
    this.orderCommands[S.MODETALLEST] = _INTL("Tallest");
    this.orderCommands[S.MODESMALLEST] = _INTL("Smallest");
    this.nameCommands = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => _INTL(c));
    this.typeCommands = Type.each().filter((t) => !t.pseudoType);
    this.heightCommands = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100];
    this.weightCommands = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 140, 160,
      180, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 1000, 1250, 1500, 2000, 3000, 5000];
    this.colorCommands = BodyColor.each().filter((c) => c.id !== "None");
    this.shapeCommands = BodyShape.each().filter((s) => s.id !== "None");
    this.s<AnimatedPlane>("searchbg").visible = true;
    this.s<BitmapSprite>("overlay").visible = true;
    const cursor = this.s<PokedexSearchSelectionSprite>("searchcursor");
    cursor.visible = true;
    let index = 0;
    let oldindex = index;
    cursor.mode = -1;
    cursor.index = index;
    this.pbRefreshDexSearch(params, index);
    await pbFadeInAndShow(asHash(this.sprites));
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (index !== oldindex) {
        cursor.index = index;
        oldindex = index;
      }
      if (Input.trigger(Input.UP)) {
        if (index >= 7) index = 4;
        else if (index === 5) index = 0;
        else if (index > 0) index -= 1;
        if (index !== oldindex) pbPlayCursorSE();
      } else if (Input.trigger(Input.DOWN)) {
        if (index === 4 || index === 6) index = 8;
        else if (index < 7) index += 1;
        if (index !== oldindex) pbPlayCursorSE();
      } else if (Input.trigger(Input.LEFT)) {
        if (index === 5) index = 1;
        else if (index === 6) index = 3;
        else if (index > 7) index -= 1;
        if (index !== oldindex) pbPlayCursorSE();
      } else if (Input.trigger(Input.RIGHT)) {
        if (index === 1) index = 5;
        else if (index >= 2 && index <= 4) index = 6;
        else if (index === 7 || index === 8) index += 1;
        if (index !== oldindex) pbPlayCursorSE();
      } else if (Input.trigger(Input.ACTION)) {
        index = 8;
        if (index !== oldindex) pbPlayCursorSE();
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        if (index !== 9) pbPlayDecisionSE();
        let stop = false;
        switch (index) {
          case 0: { // Choose sort order
            const newparam = await this.pbDexSearchCommands(0, [params[0]!], index);
            if (newparam) params[0] = newparam[0]!;
            this.pbRefreshDexSearch(params, index);
            break;
          }
          case 1: { // Filter by name
            const newparam = await this.pbDexSearchCommands(1, [params[1]!], index);
            if (newparam) params[1] = newparam[0]!;
            this.pbRefreshDexSearch(params, index);
            break;
          }
          case 2: { // Filter by type
            const newparam = await this.pbDexSearchCommands(2, [params[2]!, params[3]!], index);
            if (newparam) {
              params[2] = newparam[0]!;
              params[3] = newparam[1]!;
            }
            this.pbRefreshDexSearch(params, index);
            break;
          }
          case 3: { // Filter by height range
            const newparam = await this.pbDexSearchCommands(3, [params[4]!, params[5]!], index);
            if (newparam) {
              params[4] = newparam[0]!;
              params[5] = newparam[1]!;
            }
            this.pbRefreshDexSearch(params, index);
            break;
          }
          case 4: { // Filter by weight range
            const newparam = await this.pbDexSearchCommands(4, [params[6]!, params[7]!], index);
            if (newparam) {
              params[6] = newparam[0]!;
              params[7] = newparam[1]!;
            }
            this.pbRefreshDexSearch(params, index);
            break;
          }
          case 5: { // Filter by color filter
            const newparam = await this.pbDexSearchCommands(5, [params[8]!], index);
            if (newparam) params[8] = newparam[0]!;
            this.pbRefreshDexSearch(params, index);
            break;
          }
          case 6: { // Filter by shape
            const newparam = await this.pbDexSearchCommands(6, [params[9]!], index);
            if (newparam) params[9] = newparam[0]!;
            this.pbRefreshDexSearch(params, index);
            break;
          }
          case 7: // Clear filters
            for (let i = 0; i < 10; i++) params[i] = i === 0 ? S.MODENUMERICAL : -1;
            this.pbRefreshDexSearch(params, index);
            break;
          case 8: { // Start search (filter)
            const dexlist = this.pbSearchDexList(params);
            if (dexlist.length === 0) {
              await pbMessage(_INTL("No matching Pokémon were found."));
            } else {
              this.dexlist = dexlist;
              this.pokedexWindow.commands = this.dexlist;
              this.pokedexWindow.index = 0;
              this.pokedexWindow.refresh();
              this.searchResults = true;
              this.searchParams = params;
              stop = true;
            }
            break;
          }
          case 9: // Cancel
            pbPlayCloseMenuSE();
            stop = true;
            break;
        }
        if (stop) break;
      }
    }
    await pbFadeOutAndHide(asHash(this.sprites));
    this.s<AnimatedPlane>("background").setBitmap(this.searchResults ? `${DEX}bg_listsearch` : `${DEX}bg_list`);
    this.pbRefresh();
    await pbFadeInAndShow(asHash(this.sprites), oldsprites);
    Input.update();
    return 0;
  }

  async pbPokedex(): Promise<void> {
    await pbActivateWindow(asHash(this.sprites), "pokedex", async () => {
      const win = this.pokedexWindow;
      for (;;) {
        await Graphics.update();
        Input.update();
        const oldindex = win.index;
        this.pbUpdate();
        if (oldindex !== win.index) {
          if (!this.searchResults) dexGlobals().pokedexIndex[this.pbGetSavePositionIndex()] = win.index;
          this.pbRefresh();
        }
        if (Input.trigger(Input.ACTION)) {
          pbPlayDecisionSE();
          win.active = false;
          await this.pbDexSearch();
          win.active = true;
        } else if (Input.trigger(Input.BACK)) {
          if (this.searchResults) {
            pbPlayCancelSE();
            await this.pbCloseSearch();
          } else {
            pbPlayCloseMenuSE();
            break;
          }
        } else if (Input.trigger(Input.USE)) {
          if (win.species && player().seen(win.species)) {
            pbPlayDecisionSE();
            await this.pbDexEntry(win.index);
          }
        }
      }
    });
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonPokedexScreen {
  constructor(private scene: PokemonPokedex_Scene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbPokedex();
    await this.scene.pbEndScene();
  }
}
