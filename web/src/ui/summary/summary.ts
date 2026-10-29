// Port of 016_UI/006_UI_Summary.rb: MoveSelectionSprite, RibbonSelectionSprite,
// PokemonSummary_Scene (all five pages, the move/ribbon/marking modes and the
// move-forget mode pbForgetMove uses), PokemonSummaryScreen and pbChooseMove.
// Plugin changes, in plugin load order (Data/PluginScripts.rxdata):
//   01 Generation 9 Pack ([000] General/[001] Summary.rb): pbScene (Use on the
//      Moves page opens the options instead of the move list) and pbOptions
//      (Nickname; on the Moves page: Check/Remember/Forget Moves, Use TM's).
//   26 Generation 8 Pack (EBDX Wrapper Compatibility.rb): pbFadeInAndShow and
//      pbChangePokemon constrict the Pokémon sprite to 208x164.
//   30 ZUD Mechanics ([002] UI/UI_Summary.rb): G-Max Factor icon on every page,
//      the Dynamax level meter on the Skills page ("zud_overlay").
//   34 Enhanced UI ([001] Pokemon UI.rb): Shiny Leaf (all pages), happiness
//      meter (Info), Egg Groups (Memo), IV ratings (Skills). It loads after
//      ZUD, so its drawPage/drawPageTwo/drawPageThree wrap ZUD's.
// "BW Summary Screen" isn't installed, so the plugins use their default
// coordinates.

import type { Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Item } from "../../data/gameData/item";
import { pbGetRegionalNumber } from "../../data/gameData/miscPBSData";
import { Ribbon } from "../../data/gameData/ribbon";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { Status } from "../../data/gameData/status";
import { Type } from "../../data/gameData/type";
import { G } from "../../game/globals";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay, pbSEStop } from "../../game/GameSystem";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Player } from "../../game/trainer/Player";
import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { drawFormattedTextEx, drawTextEx, pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { _INTL, pbBottomLeftLines, pbBottomRight, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbMessage } from "../messages";
import { MenuFlags } from "../menus/menuScreens";
import { pbPlayCloseMenuSE } from "../options/options";
import { pbGetMapNameFromId } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { PictureOrigin } from "../scenes/PictureEx";
import { ItemIconSprite, preloadItemIcons } from "../sprites/itemIcon";
import { PokemonIconSprite, preloadPokemonIcons } from "../sprites/pokemonIcon";
import { PokemonSprite, preloadPokemonSprite } from "../sprites/pokemonSprite";
import { AnimatedSprite, BitmapSprite, IconSprite } from "../SpriteWrapper";
import { pbEnterPokemonName } from "../textEntry/UI_TextEntry";
import { Window_AdvancedTextPokemon, Window_CommandPokemon } from "../windows/SpriteWindowText";
import { PokemonBag_Scene, PokemonBagScreen } from "../bag/bag";
import { pbForgetMove, pbGiveItemToPokemon, pbTakeItemFromPokemon, pbUseItemOnPokemon } from "../bag/itemUtilities";
import { onPropertySet } from "../party/ChangelingSprite";
import { FieldSkillHooks } from "../party/fieldSkills";
import { pbDisplayEggGroups, pbDisplayGmaxFactor, pbDisplayHappiness, pbDisplayIVRatings, pbDisplayShinyLeaf, SUMMARY_PLUGIN_BITMAPS } from "./pluginDisplays";

const player = () => G.player as unknown as Player;

/** Screens the Summary opens that are ported elsewhere (set by those ports). */
export const SummaryHooks: {
  /** pbFadeOutIn { PokemonPokedexInfoScreen.new(PokemonPokedexInfo_Scene.new).pbStartSceneSingle(species) } */
  pokedexInfoSingle?: (species: Id) => Promise<void>;
} = {};

/** Integer#to_s_formatted: thousands separators. */
function toSFormatted(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** pbGetMonthName(month) (012_Overworld/003_Overworld_Time.rb) */
export function pbGetMonthName(month: number): string {
  return [_INTL("January"), _INTL("February"), _INTL("March"), _INTL("April"), _INTL("May"), _INTL("June"),
    _INTL("July"), _INTL("August"), _INTL("September"), _INTL("October"), _INTL("November"), _INTL("December")][month - 1] ?? "";
}

/** RGSS skips the src_rect reset when the same bitmap is assigned again. */
function assignBitmap(sprite: Sprite, bitmap: Bitmap | null): void {
  if (sprite.bitmap !== bitmap) sprite.setBitmap(bitmap);
}

const SUMMARY_BITMAPS = [
  ...["bg_1", "bg_2", "bg_3", "bg_4", "bg_5", "bg_egg", "bg_learnmove", "bg_movedetail", "cursor_marking", "cursor_move",
    "cursor_ribbon", "icon_pokerus", "markings", "overlay_exp", "overlay_hp", "overlay_marking", "overlay_ribbon",
    "overlay_shadow", "overlay_shadowbar"].map((f) => `Graphics/Pictures/Summary/${f}`),
  "Graphics/Pictures/types", "Graphics/Pictures/statuses", "Graphics/Pictures/shiny", "Graphics/Pictures/category",
  "Graphics/Pictures/ribbons", "Graphics/Pictures/uparrow", "Graphics/Pictures/downarrow",
];

/** Fetches what the Summary shows for these Pokémon. */
export async function preloadSummary(party: (Pokemon | null | undefined)[]): Promise<void> {
  const pkmns = party.filter((p): p is Pokemon => !!p);
  await Promise.all([
    preloadBitmaps([...SUMMARY_BITMAPS, ...SUMMARY_PLUGIN_BITMAPS,
      ...pkmns.map((p) => `Graphics/Pictures/Summary/icon_ball_${p.pokeBall}`)]),
    preloadPokemonIcons(pkmns),
    preloadItemIcons(pkmns.map((p) => p.itemId)),
    ...pkmns.map((p) => preloadPokemonSprite(p)),
  ]);
}

//===============================================================================
//
//===============================================================================
export class MoveSelectionSprite extends Sprite {
  protected movesel: AnimatedBitmap;
  protected frame = 0;
  protected _index = 0;
  protected fifthmove: boolean;
  protected _preselected = false;
  protected updating = false;

  constructor(viewport: Viewport | null = null, fifthmove = false, cursor = "Graphics/Pictures/Summary/cursor_move") {
    super(viewport);
    this.movesel = new AnimatedBitmap(cursor);
    this.frame = 0;
    this._index = 0;
    this.fifthmove = fifthmove;
    this._preselected = false;
    this.updating = false;
    this.refresh();
  }

  override dispose(): void {
    this.movesel.dispose();
    super.dispose();
  }

  get index(): number { return this._index; }
  set index(value: number) {
    this._index = value;
    this.refresh();
  }

  get preselected(): boolean { return this._preselected; }
  set preselected(value: boolean) {
    this._preselected = value;
    this.refresh();
  }

  refresh(): void {
    const w = this.movesel.width;
    const h = Math.floor(this.movesel.height / 2);
    this.x = 240;
    this.y = 92 + this.index * 64;
    if (this.fifthmove) this.y -= 76;
    if (this.fifthmove && this.index === Pokemon.MAX_MOVES) this.y += 20; // Add a gap
    assignBitmap(this, this.movesel.bitmap);
    if (this.preselected) this.srcRect.set(0, h, w, h);
    else this.srcRect.set(0, 0, w, h);
  }

  override update(dt?: number): void {
    this.updating = true;
    super.update(dt);
    this.movesel.update();
    this.updating = false;
    this.refresh();
  }
}

//===============================================================================
//
//===============================================================================
export class RibbonSelectionSprite extends MoveSelectionSprite {
  private spriteVisible = true;

  constructor(viewport: Viewport | null = null) {
    super(viewport, false, "Graphics/Pictures/Summary/cursor_ribbon");
    this.frame = 0;
    this._index = 0;
    this._preselected = false;
    this.updating = false;
    this.spriteVisible = true;
    // def visible=(value); super; @spriteVisible = value if !@updating; end
    onPropertySet(this, ["visible"], () => {
      if (!this.updating) this.spriteVisible = this.visible;
    });
    this.refresh();
  }

  override refresh(): void {
    const w = this.movesel.width;
    const h = Math.floor(this.movesel.height / 2);
    this.x = 228 + (this.index % 4) * 68;
    this.y = 76 + Math.floor(this.index / 4) * 68;
    assignBitmap(this, this.movesel.bitmap);
    if (this.preselected) this.srcRect.set(0, h, w, h);
    else this.srcRect.set(0, 0, w, h);
  }

  override update(dt?: number): void {
    this.updating = true;
    super.update(dt); // (MoveSelectionSprite#update clears @updating again)
    this.visible = this.spriteVisible && this._index >= 0 && this._index < 12;
    this.movesel.update();
    this.updating = false;
    this.refresh();
  }
}

//===============================================================================
//
//===============================================================================
type SummarySprites = Record<string, any>;

export class PokemonSummary_Scene {
  static readonly MARK_WIDTH = 16;
  static readonly MARK_HEIGHT = 16;

  sprites: SummarySprites = {};
  private viewport!: Viewport;
  private party: Pokemon[] = [];
  private partyindex = 0;
  private pokemon!: Pokemon;
  private inbattle = false;
  private page = 1;
  private typebitmap!: AnimatedBitmap;
  private markingbitmap: AnimatedBitmap | null = null;
  private nationalDexList: Id[] = [];
  private ribbonOffset = 0;

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites);
  }

  async pbStartScene(party: Pokemon[], partyindex: number, inbattle = false): Promise<void> {
    await preloadSummary(party);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.party = party;
    this.partyindex = partyindex;
    this.pokemon = this.party[this.partyindex]!;
    this.inbattle = inbattle;
    this.page = 1;
    this.typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
    this.markingbitmap = new AnimatedBitmap("Graphics/Pictures/Summary/markings");
    const vp = this.viewport;
    const s: SummarySprites = (this.sprites = {});
    s.background = new IconSprite(0, 0, vp);
    s.pokemon = new PokemonSprite(vp);
    s.pokemon.setOffset(PictureOrigin.CENTER);
    s.pokemon.x = 104;
    s.pokemon.y = 206;
    s.pokemon.setPokemonBitmap(this.pokemon);
    s.pokeicon = new PokemonIconSprite(this.pokemon, vp);
    s.pokeicon.setOffset(PictureOrigin.CENTER);
    s.pokeicon.x = 46;
    s.pokeicon.y = 92;
    s.pokeicon.visible = false;
    s.itemicon = new ItemIconSprite(30, 320, this.pokemon.itemId, vp);
    s.itemicon.blankzero = true;
    s.overlay = new BitmapSprite(Graphics.width, Graphics.height, vp);
    pbSetSystemFont(s.overlay.bitmap);
    s.movepresel = new MoveSelectionSprite(vp);
    s.movepresel.visible = false;
    s.movepresel.preselected = true;
    s.movesel = new MoveSelectionSprite(vp);
    s.movesel.visible = false;
    s.ribbonpresel = new RibbonSelectionSprite(vp);
    s.ribbonpresel.visible = false;
    s.ribbonpresel.preselected = true;
    s.ribbonsel = new RibbonSelectionSprite(vp);
    s.ribbonsel.visible = false;
    s.uparrow = AnimatedSprite.createLong("Graphics/Pictures/uparrow", 8, 28, 40, 2, vp);
    s.uparrow.x = 350;
    s.uparrow.y = 56;
    s.uparrow.play();
    s.uparrow.visible = false;
    s.downarrow = AnimatedSprite.createLong("Graphics/Pictures/downarrow", 8, 28, 40, 2, vp);
    s.downarrow.x = 350;
    s.downarrow.y = 260;
    s.downarrow.play();
    s.downarrow.visible = false;
    s.markingbg = new IconSprite(260, 88, vp);
    s.markingbg.setBitmapFile("Graphics/Pictures/Summary/overlay_marking");
    s.markingbg.visible = false;
    s.markingoverlay = new BitmapSprite(Graphics.width, Graphics.height, vp);
    s.markingoverlay.visible = false;
    pbSetSystemFont(s.markingoverlay.bitmap);
    s.markingsel = new IconSprite(0, 0, vp);
    s.markingsel.setBitmapFile("Graphics/Pictures/Summary/cursor_marking");
    s.markingsel.srcRect.height = Math.floor(s.markingsel.bitmap.height / 2);
    s.markingsel.visible = false;
    s.messagebox = new Window_AdvancedTextPokemon("");
    s.messagebox.viewport = vp;
    s.messagebox.visible = false;
    s.messagebox.letterbyletter = true;
    pbBottomLeftLines(s.messagebox, 2);
    this.nationalDexList = ["NONE"];
    for (const sp of Species.eachSpecies()) this.nationalDexList.push(sp.species);
    this.drawPage(this.page);
    await this.pbFadeInAndShow(this.sprites, null, () => this.pbUpdate());
  }

  async pbStartForgetScene(party: Pokemon[], partyindex: number, moveToLearn: Id | null): Promise<void> {
    await preloadSummary(party);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.party = party;
    this.partyindex = partyindex;
    this.pokemon = this.party[this.partyindex]!;
    this.page = 4;
    this.typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
    const vp = this.viewport;
    const s: SummarySprites = (this.sprites = {});
    s.background = new IconSprite(0, 0, vp);
    s.overlay = new BitmapSprite(Graphics.width, Graphics.height, vp);
    pbSetSystemFont(s.overlay.bitmap);
    s.pokeicon = new PokemonIconSprite(this.pokemon, vp);
    s.pokeicon.setOffset(PictureOrigin.CENTER);
    s.pokeicon.x = 46;
    s.pokeicon.y = 92;
    s.movesel = new MoveSelectionSprite(vp, moveToLearn != null);
    s.movesel.visible = false;
    s.movesel.visible = true;
    s.movesel.index = 0;
    const newMove = moveToLearn ? new PokemonMove(moveToLearn) : null;
    this.drawSelectedMove(newMove, this.pokemon.moves[0]!);
    await this.pbFadeInAndShow(this.sprites);
  }

  /** Generation 8 Pack's PokemonSummary_Scene#pbFadeInAndShow: constricts the Pokémon sprite first. */
  async pbFadeInAndShow(sprites: SummarySprites, visiblesprites: Record<string, boolean> | null = null, block?: () => void): Promise<void> {
    if (this.sprites.pokemon) (this.sprites.pokemon as PokemonSprite).constrict([208, 164]);
    await pbFadeInAndShow(sprites, visiblesprites, block);
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(this.sprites, () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites);
    this.typebitmap.dispose();
    this.markingbitmap?.dispose();
    this.viewport.dispose();
  }

  async pbDisplay(text: string): Promise<void> {
    const messagebox: Window_AdvancedTextPokemon = this.sprites.messagebox;
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

  async pbConfirm(text: string): Promise<boolean> {
    let ret = false;
    const messagebox: Window_AdvancedTextPokemon = this.sprites.messagebox;
    messagebox.text = text;
    messagebox.visible = true;
    const cmdwindow = new Window_CommandPokemon([_INTL("Yes"), _INTL("No")]);
    try {
      cmdwindow.z = this.viewport.z + 1;
      cmdwindow.visible = false;
      pbBottomRight(cmdwindow);
      cmdwindow.y -= messagebox.height;
      for (;;) {
        await Graphics.update();
        Input.update();
        if (!messagebox.busy()) cmdwindow.visible = true;
        cmdwindow.update();
        this.pbUpdate();
        if (!messagebox.busy()) {
          if (Input.trigger(Input.BACK)) {
            ret = false;
            break;
          } else if (Input.trigger(Input.USE) && messagebox.resume()) {
            ret = cmdwindow.index === 0;
            break;
          }
        }
      }
    } finally {
      cmdwindow.dispose();
    }
    messagebox.visible = false;
    return ret;
  }

  async pbShowCommands(commands: string[], index = 0): Promise<number> {
    let ret = -1;
    const cmdwindow = new Window_CommandPokemon(commands);
    try {
      cmdwindow.z = this.viewport.z + 1;
      cmdwindow.index = index;
      pbBottomRight(cmdwindow);
      for (;;) {
        await Graphics.update();
        Input.update();
        cmdwindow.update();
        this.pbUpdate();
        if (Input.trigger(Input.BACK)) {
          pbPlayCancelSE();
          ret = -1;
          break;
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          ret = cmdwindow.index;
          break;
        }
      }
    } finally {
      cmdwindow.dispose();
    }
    return ret;
  }

  drawMarkings(bitmap: Bitmap, x: number, y: number): void {
    const mb = this.markingbitmap!.bitmap;
    const markVariants = Math.floor(mb.height / PokemonSummary_Scene.MARK_HEIGHT);
    const markings = this.pokemon.markings;
    const markrect = new Rect(0, 0, PokemonSummary_Scene.MARK_WIDTH, PokemonSummary_Scene.MARK_HEIGHT);
    for (let i = 0; i < Math.floor(mb.width / PokemonSummary_Scene.MARK_WIDTH); i++) {
      markrect.x = i * PokemonSummary_Scene.MARK_WIDTH;
      markrect.y = Math.min(markings[i] || 0, markVariants - 1) * PokemonSummary_Scene.MARK_HEIGHT;
      bitmap.blt(x + i * PokemonSummary_Scene.MARK_WIDTH, y, mb, markrect);
    }
  }

  /**
   * drawPage(page) as the plugins wrap it: Enhanced UI's version (Shiny Leaf)
   * around ZUD's (zud_overlay, G-Max Factor) around Essentials'.
   */
  drawPage(page: number): void {
    // ZUD Mechanics
    // (@sprites["pokemon"].unDynamax if @pokemon.dynamax?: battle-only, no-op here)
    if (!this.sprites.zud_overlay) this.sprites.zud_overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    else this.sprites.zud_overlay.bitmap.clear();
    this.drawPageBase(page);
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    pbDisplayGmaxFactor(this.pokemon, overlay, 88, 95);
    // Enhanced UI: Shiny Leaf
    pbDisplayShinyLeaf(this.pokemon, overlay, 182, 124);
  }

  /** Essentials' drawPage */
  private drawPageBase(page: number): void {
    if (this.pokemon.egg()) {
      this.drawPageOneEgg();
      return;
    }
    const s = this.sprites;
    s.itemicon.item = this.pokemon.itemId;
    const overlay: Bitmap = s.overlay.bitmap;
    overlay.clear();
    const base = new Color(248, 248, 248);
    const shadow = new Color(104, 104, 104);
    // Set background image
    s.background.setBitmapFile(`Graphics/Pictures/Summary/bg_${page}`);
    const imagepos: ImagePosition[] = [];
    // Show the Poké Ball containing the Pokémon
    imagepos.push([`Graphics/Pictures/Summary/icon_ball_${this.pokemon.pokeBall}`, 14, 60]);
    // Show status/fainted/Pokérus infected icon
    let status = -1;
    if (this.pokemon.fainted()) status = Status.count() - 1;
    else if (this.pokemon.status !== "NONE") status = Status.get(this.pokemon.status).iconPosition;
    else if (this.pokemon.pokerusStage() === 1) status = Status.count();
    if (status >= 0) imagepos.push(["Graphics/Pictures/statuses", 124, 100, 0, 16 * status, 44, 16]);
    // Show Pokérus cured icon
    if (this.pokemon.pokerusStage() === 2) imagepos.push(["Graphics/Pictures/Summary/icon_pokerus", 176, 100]);
    // Show shininess star
    if (this.pokemon.shiny) imagepos.push(["Graphics/Pictures/shiny", 2, 134]);
    // Draw all images
    pbDrawImagePositions(overlay, imagepos);
    // Write various bits of text
    const pagename = [_INTL("INFO"), _INTL("TRAINER MEMO"), _INTL("SKILLS"), _INTL("MOVES"), _INTL("RIBBONS")][page - 1]!;
    const textpos: TextPosition[] = [
      [pagename, 26, 22, 0, base, shadow],
      [this.pokemon.name, 46, 68, 0, base, shadow],
      [String(this.pokemon.level), 46, 98, 0, new Color(64, 64, 64), new Color(176, 176, 176)],
      [_INTL("Item"), 66, 324, 0, base, shadow],
    ];
    // Write the held item's name
    if (this.pokemon.hasItem()) {
      textpos.push([this.pokemon.item!.name, 16, 358, 0, new Color(64, 64, 64), new Color(176, 176, 176)]);
    } else {
      textpos.push([_INTL("None"), 16, 358, 0, new Color(192, 200, 208), new Color(208, 216, 224)]);
    }
    // Write the gender symbol
    if (this.pokemon.male()) {
      textpos.push([_INTL("♂"), 178, 68, 0, new Color(24, 112, 216), new Color(136, 168, 208)]);
    } else if (this.pokemon.female()) {
      textpos.push([_INTL("♀"), 178, 68, 0, new Color(248, 56, 32), new Color(224, 152, 144)]);
    }
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
    // Draw the Pokémon's markings
    this.drawMarkings(overlay, 84, 292);
    // Draw page-specific information
    switch (page) {
      case 1: this.drawPageOne(); break;
      case 2: this.drawPageTwo(); break;
      case 3: this.drawPageThree(); break;
      case 4: this.drawPageFour(); break;
      case 5: this.drawPageFive(); break;
    }
  }

  /** drawPageOne (+ Enhanced UI's happiness meter) */
  drawPageOne(): void {
    this.drawPageOneBase();
    pbDisplayHappiness(this.pokemon, this.sprites.overlay.bitmap, 242, 336);
  }

  private drawPageOneBase(): void {
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    const pkmn = this.pokemon;
    const base = new Color(248, 248, 248);
    const shadow = new Color(104, 104, 104);
    const dexNumBase = pkmn.shiny ? new Color(248, 56, 32) : new Color(64, 64, 64);
    const dexNumShadow = pkmn.shiny ? new Color(224, 152, 144) : new Color(176, 176, 176);
    // If a Shadow Pokémon, draw the heart gauge area and bar
    if (pkmn.shadowPokemon()) {
      const shadowfract = pkmn.heartGauge / pkmn.maxGaugeSize();
      pbDrawImagePositions(overlay, [
        ["Graphics/Pictures/Summary/overlay_shadow", 224, 240],
        ["Graphics/Pictures/Summary/overlay_shadowbar", 242, 280, 0, 0, Math.floor(shadowfract * 248), -1],
      ]);
    }
    // Write various bits of text
    const textpos: TextPosition[] = [
      [_INTL("Dex No."), 238, 86, 0, base, shadow],
      [_INTL("Species"), 238, 118, 0, base, shadow],
      [pkmn.speciesName(), 435, 118, 2, new Color(64, 64, 64), new Color(176, 176, 176)],
      [_INTL("Type"), 238, 150, 0, base, shadow],
      [_INTL("OT"), 238, 182, 0, base, shadow],
      [_INTL("ID No."), 238, 214, 0, base, shadow],
    ];
    // Write the Regional/National Dex number
    let dexnum = 0;
    let dexnumshift = false;
    const dexesWithOffsets: number[] = []; // Settings::DEXES_WITH_OFFSETS
    const pokedex = player().pokedex;
    if (pokedex.unlocked(-1)) { // National Dex is unlocked
      dexnum = Math.max(this.nationalDexList.indexOf(pkmn.speciesData().species), 0);
      if (dexesWithOffsets.includes(-1)) dexnumshift = true;
    } else {
      for (let i = 0; i < pokedex.dexesCount() - 1; i++) {
        if (!pokedex.unlocked(i)) continue;
        const num = pbGetRegionalNumber(i, pkmn.species);
        if (num <= 0) break;
        dexnum = num;
        if (dexesWithOffsets.includes(i)) dexnumshift = true;
        break;
      }
    }
    if (dexnum <= 0) {
      textpos.push(["???", 435, 86, 2, dexNumBase, dexNumShadow]);
    } else {
      if (dexnumshift) dexnum -= 1;
      textpos.push([String(dexnum).padStart(3, "0"), 435, 86, 2, dexNumBase, dexNumShadow]);
    }
    // Write Original Trainer's name and ID number
    if (pkmn.owner.name === "") {
      textpos.push([_INTL("RENTAL"), 435, 182, 2, new Color(64, 64, 64), new Color(176, 176, 176)]);
      textpos.push(["?????", 435, 214, 2, new Color(64, 64, 64), new Color(176, 176, 176)]);
    } else {
      let ownerbase = new Color(64, 64, 64);
      let ownershadow = new Color(176, 176, 176);
      switch (pkmn.owner.gender) {
        case 0:
          ownerbase = new Color(24, 112, 216);
          ownershadow = new Color(136, 168, 208);
          break;
        case 1:
          ownerbase = new Color(248, 56, 32);
          ownershadow = new Color(224, 152, 144);
          break;
      }
      textpos.push([pkmn.owner.name, 435, 182, 2, ownerbase, ownershadow]);
      textpos.push([String(pkmn.owner.publicId()).padStart(5, "0"), 435, 214, 2, new Color(64, 64, 64), new Color(176, 176, 176)]);
    }
    // Write Exp text OR heart gauge message (if a Shadow Pokémon)
    if (pkmn.shadowPokemon()) {
      textpos.push([_INTL("Heart Gauge"), 238, 246, 0, base, shadow]);
      const heartmessage = [_INTL("The door to its heart is open! Undo the final lock!"),
        _INTL("The door to its heart is almost fully open."),
        _INTL("The door to its heart is nearly open."),
        _INTL("The door to its heart is opening wider."),
        _INTL("The door to its heart is opening up."),
        _INTL("The door to its heart is tightly shut.")][pkmn.heartStage()];
      const memo = `<c3=404040,B0B0B0>${heartmessage}\n`;
      drawFormattedTextEx(overlay, 234, 308, 264, memo);
    } else {
      const endexp = pkmn.growthRate().minimumExpForLevel(pkmn.level + 1);
      textpos.push([_INTL("Exp. Points"), 238, 246, 0, base, shadow]);
      textpos.push([toSFormatted(pkmn.exp), 488, 278, 1, new Color(64, 64, 64), new Color(176, 176, 176)]);
      textpos.push([_INTL("To Next Lv."), 238, 310, 0, base, shadow]);
      textpos.push([toSFormatted(endexp - pkmn.exp), 488, 342, 1, new Color(64, 64, 64), new Color(176, 176, 176)]);
    }
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
    // Draw Pokémon type(s)
    const types = pkmn.types();
    types.forEach((type, i) => {
      const typeNumber = Type.get(type).iconPosition;
      const typeRect = new Rect(0, typeNumber * 28, 64, 28);
      const typeX = types.length === 1 ? 402 : 370 + 66 * i;
      overlay.blt(typeX, 146, this.typebitmap.bitmap, typeRect);
    });
    // Draw Exp bar
    if (pkmn.level < GrowthRate.maxLevel()) {
      let w = pkmn.expFraction() * 128;
      w = Math.round(w / 2) * 2;
      pbDrawImagePositions(overlay, [["Graphics/Pictures/Summary/overlay_exp", 362, 372, 0, 0, w, 6]]);
    }
  }

  drawPageOneEgg(): void {
    const s = this.sprites;
    const pkmn = this.pokemon;
    s.itemicon.item = pkmn.itemId;
    const overlay: Bitmap = s.overlay.bitmap;
    overlay.clear();
    const base = new Color(248, 248, 248);
    const shadow = new Color(104, 104, 104);
    // Set background image
    s.background.setBitmapFile("Graphics/Pictures/Summary/bg_egg");
    // Show the Poké Ball containing the Pokémon
    pbDrawImagePositions(overlay, [[`Graphics/Pictures/Summary/icon_ball_${pkmn.pokeBall}`, 14, 60]]);
    // Write various bits of text
    const textpos: TextPosition[] = [
      [_INTL("TRAINER MEMO"), 26, 22, 0, base, shadow],
      [pkmn.name, 46, 68, 0, base, shadow],
      [_INTL("Item"), 66, 324, 0, base, shadow],
    ];
    // Write the held item's name
    if (pkmn.hasItem()) {
      textpos.push([pkmn.item!.name, 16, 358, 0, new Color(64, 64, 64), new Color(176, 176, 176)]);
    } else {
      textpos.push([_INTL("None"), 16, 358, 0, new Color(192, 200, 208), new Color(208, 216, 224)]);
    }
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
    let memo = "";
    // Write date received
    const received = pkmn.timeReceived;
    memo += _INTL("<c3=404040,B0B0B0>{1} {2}, {3}\n", received.getDate(), pbGetMonthName(received.getMonth() + 1), received.getFullYear());
    // Write map name egg was received on
    let mapname = pbGetMapNameFromId(pkmn.obtainMap);
    if (pkmn.obtainText && pkmn.obtainText !== "") mapname = pkmn.obtainText;
    if (mapname && mapname !== "") {
      memo += _INTL("<c3=404040,B0B0B0>A mysterious Pokémon Egg received from <c3=F83820,E09890>{1}<c3=404040,B0B0B0>.\n", mapname);
    } else {
      memo += _INTL("<c3=404040,B0B0B0>A mysterious Pokémon Egg.\n", mapname);
    }
    memo += "\n"; // Empty line
    // Write Egg Watch blurb
    memo += _INTL("<c3=404040,B0B0B0>\"The Egg Watch\"\n");
    let eggstate = _INTL("It looks like this Egg will take a long time to hatch.");
    if (pkmn.stepsToHatch < 10_200) eggstate = _INTL("What will hatch from this? It doesn't seem close to hatching.");
    if (pkmn.stepsToHatch < 2550) eggstate = _INTL("It appears to move occasionally. It may be close to hatching.");
    if (pkmn.stepsToHatch < 1275) eggstate = _INTL("Sounds can be heard coming from inside! It will hatch soon!");
    memo += `<c3=404040,B0B0B0>${eggstate}\n`;
    // Draw all text
    drawFormattedTextEx(overlay, 232, 86, 268, memo);
    // Draw the Pokémon's markings
    this.drawMarkings(overlay, 84, 292);
  }

  /** drawPageTwo (ZUD's version only adds to it with BW Summary Screen; + Enhanced UI's Egg Groups) */
  drawPageTwo(): void {
    this.drawPageTwoBase();
    pbDisplayEggGroups(this.pokemon, this.sprites.overlay.bitmap, 364, 338, "Egg Groups:", false);
  }

  private drawPageTwoBase(): void {
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    const pkmn = this.pokemon;
    let memo = "";
    // Write nature
    const showNature = !pkmn.shadowPokemon() || pkmn.heartStage() <= 3;
    if (showNature) {
      const natureName = pkmn.nature!.name;
      memo += _INTL("<c3=F83820,E09890>{1}<c3=404040,B0B0B0> nature.\n", natureName);
    }
    // Write date received
    const received = pkmn.timeReceived;
    memo += _INTL("<c3=404040,B0B0B0>{1} {2}, {3}\n", received.getDate(), pbGetMonthName(received.getMonth() + 1), received.getFullYear());
    // Write map name Pokémon was received on
    let mapname = pbGetMapNameFromId(pkmn.obtainMap);
    if (pkmn.obtainText && pkmn.obtainText !== "") mapname = pkmn.obtainText;
    if (!mapname) mapname = _INTL("Faraway place");
    memo += `<c3=F83820,E09890>${mapname}\n`;
    // Write how Pokémon was obtained
    const mettext = [_INTL("Met at Lv. {1}.", pkmn.obtainLevel),
      _INTL("Egg received."),
      _INTL("Traded at Lv. {1}.", pkmn.obtainLevel),
      "",
      _INTL("Had a fateful encounter at Lv. {1}.", pkmn.obtainLevel)][pkmn.obtainMethod];
    if (mettext && mettext !== "") memo += `<c3=404040,B0B0B0>${mettext}\n`;
    // If Pokémon was hatched, write when and where it hatched
    if (pkmn.obtainMethod === 1) {
      const hatched = pkmn.timeEggHatched;
      if (hatched) {
        memo += _INTL("<c3=404040,B0B0B0>{1} {2}, {3}\n", hatched.getDate(), pbGetMonthName(hatched.getMonth() + 1), hatched.getFullYear());
      }
      let hatchmap = pbGetMapNameFromId(pkmn.hatchedMap);
      if (!hatchmap) hatchmap = _INTL("Faraway place");
      memo += `<c3=F83820,E09890>${hatchmap}\n`;
      memo += _INTL("<c3=404040,B0B0B0>Egg hatched.\n");
    } else {
      memo += "\n"; // Empty line
    }
    // Write characteristic
    if (showNature) {
      let bestStat: Id | null = null;
      let bestIv = 0;
      const statsOrder = ["HP", "ATTACK", "DEFENSE", "SPEED", "SPECIAL_ATTACK", "SPECIAL_DEFENSE"];
      const startPoint = pkmn.personalID % statsOrder.length; // Tiebreaker
      for (let i = 0; i < statsOrder.length; i++) {
        const stat = statsOrder[(i + startPoint) % statsOrder.length]!;
        if (!bestStat || pkmn.iv[stat]! > pkmn.iv[bestStat]!) {
          bestStat = stat;
          bestIv = pkmn.iv[bestStat]!;
        }
      }
      const characteristics: Record<string, string[]> = {
        HP: [_INTL("Loves to eat."), _INTL("Takes plenty of siestas."), _INTL("Nods off a lot."),
          _INTL("Scatters things often."), _INTL("Likes to relax.")],
        ATTACK: [_INTL("Proud of its power."), _INTL("Likes to thrash about."), _INTL("A little quick tempered."),
          _INTL("Likes to fight."), _INTL("Quick tempered.")],
        DEFENSE: [_INTL("Sturdy body."), _INTL("Capable of taking hits."), _INTL("Highly persistent."),
          _INTL("Good endurance."), _INTL("Good perseverance.")],
        SPECIAL_ATTACK: [_INTL("Highly curious."), _INTL("Mischievous."), _INTL("Thoroughly cunning."),
          _INTL("Often lost in thought."), _INTL("Very finicky.")],
        SPECIAL_DEFENSE: [_INTL("Strong willed."), _INTL("Somewhat vain."), _INTL("Strongly defiant."),
          _INTL("Hates to lose."), _INTL("Somewhat stubborn.")],
        SPEED: [_INTL("Likes to run."), _INTL("Alert to sounds."), _INTL("Impetuous and silly."),
          _INTL("Somewhat of a clown."), _INTL("Quick to flee.")],
      };
      memo += `<c3=404040,B0B0B0>${characteristics[bestStat!]![bestIv % 5]}\n`;
    }
    // Write all text
    drawFormattedTextEx(overlay, 232, 86, 268, memo);
  }

  /** drawPageThree: Enhanced UI's (IV ratings) around ZUD's (Dynamax meter) around Essentials'. */
  drawPageThree(): void {
    // ZUD Mechanics (BW Summary Screen isn't installed)
    const pkmn = this.pokemon;
    if (pkmn.dynamaxAble && !pkmn.isSpecies("ETERNATUS") && !G.gameSwitches.get(NO_DYNAMAX)) {
      const path = "Graphics/Plugins/ZUD/UI/";
      const overlay: Bitmap = this.sprites.zud_overlay.bitmap;
      pbDrawImagePositions(overlay, [[`${path}dynamax_meter`, 56, 308]]);
      const dlevel = pkmn.dynamaxLvl;
      const levels = new AnimatedBitmap(_INTL(path + "dynamax_levels"));
      overlay.blt(69, 325, levels.bitmap, new Rect(0, 0, dlevel * 12, 21));
    }
    this.drawPageThreeBase();
    // Enhanced UI
    pbDisplayIVRatings(this.pokemon, this.sprites.overlay.bitmap, 465, 82);
  }

  private drawPageThreeBase(): void {
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    const pkmn = this.pokemon;
    const base = new Color(248, 248, 248);
    const shadow = new Color(104, 104, 104);
    // Determine which stats are boosted and lowered by the Pokémon's nature
    const statshadows: Record<string, Color> = {};
    for (const s of Stat.eachMain()) statshadows[s.id] = shadow;
    if (!pkmn.shadowPokemon() || pkmn.heartStage() <= 3) {
      for (const change of pkmn.natureForStats!.statChanges) {
        if (change[1] > 0) statshadows[change[0]] = new Color(136, 96, 72);
        if (change[1] < 0) statshadows[change[0]] = new Color(64, 120, 152);
      }
    }
    const dark = () => new Color(64, 64, 64);
    const light = () => new Color(176, 176, 176);
    // Write various bits of text
    const textpos: TextPosition[] = [
      [_INTL("HP"), 292, 82, 2, base, statshadows.HP!],
      [`${pkmn.hp}/${pkmn.totalhp}`, 462, 82, 1, dark(), light()],
      [_INTL("Attack"), 248, 126, 0, base, statshadows.ATTACK!],
      [String(pkmn.attack), 456, 126, 1, dark(), light()],
      [_INTL("Defense"), 248, 158, 0, base, statshadows.DEFENSE!],
      [String(pkmn.defense), 456, 158, 1, dark(), light()],
      [_INTL("Sp. Atk"), 248, 190, 0, base, statshadows.SPECIAL_ATTACK!],
      [String(pkmn.spatk), 456, 190, 1, dark(), light()],
      [_INTL("Sp. Def"), 248, 222, 0, base, statshadows.SPECIAL_DEFENSE!],
      [String(pkmn.spdef), 456, 222, 1, dark(), light()],
      [_INTL("Speed"), 248, 254, 0, base, statshadows.SPEED!],
      [String(pkmn.speed), 456, 254, 1, dark(), light()],
      [_INTL("Ability"), 224, 290, 0, base, shadow],
    ];
    // Draw ability name and description
    const ability = pkmn.ability;
    if (ability) {
      textpos.push([ability.name, 362, 290, 0, dark(), light()]);
      drawTextEx(overlay, 224, 322, 282, 2, ability.description, dark(), light());
    }
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
    // Draw HP bar
    if (pkmn.hp > 0) {
      let w = (pkmn.hp * 96) / pkmn.totalhp;
      if (w < 1) w = 1;
      w = Math.round(w / 2) * 2;
      let hpzone = 0;
      if (pkmn.hp <= Math.floor(pkmn.totalhp / 2)) hpzone = 1;
      if (pkmn.hp <= Math.floor(pkmn.totalhp / 4)) hpzone = 2;
      pbDrawImagePositions(overlay, [["Graphics/Pictures/Summary/overlay_hp", 360, 110, 0, hpzone * 6, w, 6]]);
    }
  }

  /** Writes move names, types and PP amounts for each known move (shared by pages 4 and the move list). */
  private drawMoveList(moves: (PokemonMove | null | undefined)[], yStart: number, gapBeforeLast: boolean, textpos: TextPosition[], imagepos: ImagePosition[]): void {
    const moveBase = new Color(64, 64, 64);
    const moveShadow = new Color(176, 176, 176);
    const ppBase = [moveBase, // More than 1/2 of total PP
      new Color(248, 192, 0), // 1/2 of total PP or less
      new Color(248, 136, 32), // 1/4 of total PP or less
      new Color(248, 72, 72)]; // Zero PP
    const ppShadow = [moveShadow, // More than 1/2 of total PP
      new Color(144, 104, 0), // 1/2 of total PP or less
      new Color(144, 72, 24), // 1/4 of total PP or less
      new Color(136, 48, 48)]; // Zero PP
    let yPos = yStart;
    moves.forEach((move, i) => {
      if (gapBeforeLast && i === Pokemon.MAX_MOVES) yPos += 20;
      if (move) {
        const typeNumber = Type.get(move.displayType(this.pokemon)).iconPosition;
        imagepos.push(["Graphics/Pictures/types", 248, yPos - 4, 0, typeNumber * 28, 64, 28]);
        textpos.push([move.name, 316, yPos, 0, moveBase, moveShadow]);
        if (move.totalPp > 0) {
          textpos.push([_INTL("PP"), 342, yPos + 32, 0, moveBase, moveShadow]);
          let ppfraction = 0;
          if (move.pp === 0) ppfraction = 3;
          else if (move.pp * 4 <= move.totalPp) ppfraction = 2;
          else if (move.pp * 2 <= move.totalPp) ppfraction = 1;
          textpos.push([`${move.pp}/${move.totalPp}`, 460, yPos + 32, 1, ppBase[ppfraction]!, ppShadow[ppfraction]!]);
        }
      } else {
        textpos.push(["-", 316, yPos, 0, moveBase, moveShadow]);
        textpos.push(["--", 442, yPos + 32, 1, moveBase, moveShadow]);
      }
      yPos += 64;
    });
  }

  drawPageFour(): void {
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    this.sprites.pokemon.visible = true;
    this.sprites.pokeicon.visible = false;
    this.sprites.itemicon.visible = true;
    const textpos: TextPosition[] = [];
    const imagepos: ImagePosition[] = [];
    const moves: (PokemonMove | undefined)[] = [];
    for (let i = 0; i < Pokemon.MAX_MOVES; i++) moves.push(this.pokemon.moves[i]);
    this.drawMoveList(moves, 104, false, textpos, imagepos);
    // Draw all text and images
    pbDrawTextPositions(overlay, textpos);
    pbDrawImagePositions(overlay, imagepos);
  }

  drawPageFourSelecting(moveToLearn: PokemonMove | null): void {
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    overlay.clear();
    const base = new Color(248, 248, 248);
    const shadow = new Color(104, 104, 104);
    // Set background image
    if (moveToLearn) this.sprites.background.setBitmapFile("Graphics/Pictures/Summary/bg_learnmove");
    else this.sprites.background.setBitmapFile("Graphics/Pictures/Summary/bg_movedetail");
    // Write various bits of text
    const textpos: TextPosition[] = [
      [_INTL("MOVES"), 26, 22, 0, base, shadow],
      [_INTL("CATEGORY"), 20, 128, 0, base, shadow],
      [_INTL("POWER"), 20, 160, 0, base, shadow],
      [_INTL("ACCURACY"), 20, 192, 0, base, shadow],
    ];
    const imagepos: ImagePosition[] = [];
    // Write move names, types and PP amounts for each known move
    const limit = moveToLearn ? Pokemon.MAX_MOVES + 1 : Pokemon.MAX_MOVES;
    const moves: (PokemonMove | null | undefined)[] = [];
    for (let i = 0; i < limit; i++) moves.push(i === Pokemon.MAX_MOVES ? moveToLearn : this.pokemon.moves[i]);
    this.drawMoveList(moves, moveToLearn ? 104 - 76 : 104, true, textpos, imagepos);
    // Draw all text and images
    pbDrawTextPositions(overlay, textpos);
    pbDrawImagePositions(overlay, imagepos);
    // Draw Pokémon's type icon(s)
    const types = this.pokemon.types();
    types.forEach((type, i) => {
      const typeNumber = Type.get(type).iconPosition;
      const typeRect = new Rect(0, typeNumber * 28, 64, 28);
      const typeX = types.length === 1 ? 130 : 96 + 70 * i;
      overlay.blt(typeX, 78, this.typebitmap.bitmap, typeRect);
    });
  }

  drawSelectedMove(moveToLearn: PokemonMove | null, selectedMove: PokemonMove): void {
    // Draw all of page four, except selected move's details
    this.drawPageFourSelecting(moveToLearn);
    // Set various values
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    const base = new Color(64, 64, 64);
    const shadow = new Color(176, 176, 176);
    if (this.sprites.pokemon) this.sprites.pokemon.visible = false;
    this.sprites.pokeicon.pokemon = this.pokemon;
    this.sprites.pokeicon.visible = true;
    if (this.sprites.itemicon) this.sprites.itemicon.visible = false;
    const textpos: TextPosition[] = [];
    // Write power and accuracy values for selected move
    const damage = selectedMove.displayDamage(this.pokemon);
    switch (damage) {
      case 0: textpos.push(["---", 216, 160, 1, base, shadow]); break; // Status move
      case 1: textpos.push(["???", 216, 160, 1, base, shadow]); break; // Variable power move
      default: textpos.push([String(damage), 216, 160, 1, base, shadow]);
    }
    const accuracy = selectedMove.displayAccuracy(this.pokemon);
    if (accuracy === 0) textpos.push(["---", 216, 192, 1, base, shadow]);
    else textpos.push([`${accuracy}%`, 216 + overlay.textSize("%").width, 192, 1, base, shadow]);
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
    // Draw selected move's damage category icon
    pbDrawImagePositions(overlay, [["Graphics/Pictures/category", 166, 124, 0, selectedMove.displayCategory(this.pokemon) * 28, 64, 28]]);
    // Draw selected move's description
    drawTextEx(overlay, 4, 224, 230, 5, selectedMove.description, base, shadow);
  }

  drawPageFive(): void {
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    this.sprites.uparrow.visible = false;
    this.sprites.downarrow.visible = false;
    // Write various bits of text
    pbDrawTextPositions(overlay, [
      [_INTL("No. of Ribbons:"), 234, 338, 0, new Color(64, 64, 64), new Color(176, 176, 176)],
      [String(this.pokemon.numRibbons()), 450, 338, 1, new Color(64, 64, 64), new Color(176, 176, 176)],
    ]);
    // Show all ribbons
    const imagepos: ImagePosition[] = [];
    let coord = 0;
    for (let i = this.ribbonOffset * 4; i < this.ribbonOffset * 4 + 12; i++) {
      if (!this.pokemon.ribbons[i]) break;
      const ribbonData = Ribbon.get(this.pokemon.ribbons[i]!);
      const ribn = ribbonData.iconPosition;
      imagepos.push(["Graphics/Pictures/ribbons", 230 + 68 * (coord % 4), 78 + 68 * Math.floor(coord / 4),
        64 * (ribn % 8), 64 * Math.floor(ribn / 8), 64, 64]);
      coord += 1;
    }
    // Draw all images
    pbDrawImagePositions(overlay, imagepos);
  }

  drawSelectedRibbon(cardIndex: Id | null | undefined): void {
    // Draw all of page five
    this.drawPage(5);
    // Set various values
    const overlay: Bitmap = this.sprites.overlay.bitmap;
    const base = new Color(64, 64, 64);
    const shadow = new Color(176, 176, 176);
    const nameBase = new Color(248, 248, 248);
    const nameShadow = new Color(104, 104, 104);
    // Get data for selected ribbon
    const name = cardIndex ? Ribbon.get(cardIndex).name : "";
    const desc = cardIndex ? Ribbon.get(cardIndex).description : "";
    // Draw the description box
    pbDrawImagePositions(overlay, [["Graphics/Pictures/Summary/overlay_ribbon", 8, 280]]);
    // Draw name of selected ribbon
    pbDrawTextPositions(overlay, [[name, 18, 292, 0, nameBase, nameShadow]]);
    // Draw selected ribbon's description
    drawTextEx(overlay, 18, 324, 480, 2, desc, base, shadow);
  }

  pbGoToPrevious(): void {
    let newindex = this.partyindex;
    while (newindex > 0) {
      newindex -= 1;
      if (this.party[newindex] && (this.page === 1 || !this.party[newindex]!.egg())) {
        this.partyindex = newindex;
        break;
      }
    }
  }

  pbGoToNext(): void {
    let newindex = this.partyindex;
    while (newindex < this.party.length - 1) {
      newindex += 1;
      if (this.party[newindex] && (this.page === 1 || !this.party[newindex]!.egg())) {
        this.partyindex = newindex;
        break;
      }
    }
  }

  /** pbChangePokemon (+ Generation 8 Pack's constrict) */
  pbChangePokemon(): void {
    this.pokemon = this.party[this.partyindex]!;
    this.sprites.pokemon.setPokemonBitmap(this.pokemon);
    this.sprites.itemicon.item = this.pokemon.itemId;
    pbSEStop();
    this.pokemon.playCry();
    (this.sprites.pokemon as PokemonSprite).constrict([208, 164]);
  }

  async pbMoveSelection(): Promise<void> {
    const s = this.sprites;
    s.movesel.visible = true;
    s.movesel.index = 0;
    let selmove = 0;
    let oldselmove = 0;
    let switching = false;
    this.drawSelectedMove(null, this.pokemon.moves[selmove]!);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (s.movepresel.index === s.movesel.index) s.movepresel.z = s.movesel.z + 1;
      else s.movepresel.z = s.movesel.z;
      if (Input.trigger(Input.BACK)) {
        if (switching) pbPlayCancelSE();
        else pbPlayCloseMenuSE();
        if (!switching) break;
        s.movepresel.visible = false;
        switching = false;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        if (selmove === Pokemon.MAX_MOVES) {
          if (!switching) break;
          s.movepresel.visible = false;
          switching = false;
        } else if (!this.pokemon.shadowPokemon()) {
          if (switching) {
            const tmpmove = this.pokemon.moves[oldselmove]!;
            this.pokemon.moves[oldselmove] = this.pokemon.moves[selmove]!;
            this.pokemon.moves[selmove] = tmpmove;
            s.movepresel.visible = false;
            switching = false;
            this.drawSelectedMove(null, this.pokemon.moves[selmove]!);
          } else {
            s.movepresel.index = selmove;
            s.movepresel.visible = true;
            oldselmove = selmove;
            switching = true;
          }
        }
      } else if (Input.trigger(Input.UP)) {
        selmove -= 1;
        if (selmove < Pokemon.MAX_MOVES && selmove >= this.pokemon.numMoves()) selmove = this.pokemon.numMoves() - 1;
        if (selmove >= Pokemon.MAX_MOVES) selmove = 0;
        if (selmove < 0) selmove = this.pokemon.numMoves() - 1;
        s.movesel.index = selmove;
        pbPlayCursorSE();
        this.drawSelectedMove(null, this.pokemon.moves[selmove]!);
      } else if (Input.trigger(Input.DOWN)) {
        selmove += 1;
        if (selmove < Pokemon.MAX_MOVES && selmove >= this.pokemon.numMoves()) selmove = 0;
        if (selmove >= Pokemon.MAX_MOVES) selmove = 0;
        if (selmove < 0) selmove = Pokemon.MAX_MOVES;
        s.movesel.index = selmove;
        pbPlayCursorSE();
        this.drawSelectedMove(null, this.pokemon.moves[selmove]!);
      }
    }
    s.movesel.visible = false;
  }

  async pbRibbonSelection(): Promise<void> {
    const s = this.sprites;
    const ribbons = this.pokemon.ribbons as (Id | null | undefined)[];
    s.ribbonsel.visible = true;
    s.ribbonsel.index = 0;
    let selribbon = this.ribbonOffset * 4;
    let oldselribbon = selribbon;
    let switching = false;
    const numRibbons = ribbons.length;
    const numRows = Math.max(Math.floor((numRibbons + 3) / 4), 3);
    this.drawSelectedRibbon(ribbons[selribbon]);
    for (;;) {
      s.uparrow.visible = this.ribbonOffset > 0;
      s.downarrow.visible = this.ribbonOffset < numRows - 3;
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (s.ribbonpresel.index === s.ribbonsel.index) s.ribbonpresel.z = s.ribbonsel.z + 1;
      else s.ribbonpresel.z = s.ribbonsel.z;
      let hasMovedCursor = false;
      if (Input.trigger(Input.BACK)) {
        if (switching) pbPlayCancelSE();
        else pbPlayCloseMenuSE();
        if (!switching) break;
        s.ribbonpresel.visible = false;
        switching = false;
      } else if (Input.trigger(Input.USE)) {
        if (switching) {
          pbPlayDecisionSE();
          const tmpribbon = ribbons[oldselribbon];
          ribbons[oldselribbon] = ribbons[selribbon];
          ribbons[selribbon] = tmpribbon;
          if (ribbons[oldselribbon] || ribbons[selribbon]) {
            // ribbons.compact!
            for (let i = ribbons.length - 1; i >= 0; i--) if (ribbons[i] == null) ribbons.splice(i, 1);
            if (selribbon >= numRibbons) {
              selribbon = numRibbons - 1;
              hasMovedCursor = true;
            }
          }
          s.ribbonpresel.visible = false;
          switching = false;
          this.drawSelectedRibbon(ribbons[selribbon]);
        } else if (ribbons[selribbon]) {
          pbPlayDecisionSE();
          s.ribbonpresel.index = selribbon - this.ribbonOffset * 4;
          oldselribbon = selribbon;
          s.ribbonpresel.visible = true;
          switching = true;
        }
      } else if (Input.trigger(Input.UP)) {
        selribbon -= 4;
        if (selribbon < 0) selribbon += numRows * 4;
        hasMovedCursor = true;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.DOWN)) {
        selribbon += 4;
        if (selribbon >= numRows * 4) selribbon -= numRows * 4;
        hasMovedCursor = true;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.LEFT)) {
        selribbon -= 1;
        if (((selribbon % 4) + 4) % 4 === 3) selribbon += 4;
        hasMovedCursor = true;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.RIGHT)) {
        selribbon += 1;
        if (selribbon % 4 === 0) selribbon -= 4;
        hasMovedCursor = true;
        pbPlayCursorSE();
      }
      if (!hasMovedCursor) continue;
      if (selribbon < this.ribbonOffset * 4) this.ribbonOffset = Math.floor(selribbon / 4);
      if (selribbon >= (this.ribbonOffset + 3) * 4) this.ribbonOffset = Math.floor(selribbon / 4) - 2;
      if (this.ribbonOffset < 0) this.ribbonOffset = 0;
      if (this.ribbonOffset > numRows - 3) this.ribbonOffset = numRows - 3;
      s.ribbonsel.index = selribbon - this.ribbonOffset * 4;
      s.ribbonpresel.index = oldselribbon - this.ribbonOffset * 4;
      this.drawSelectedRibbon(ribbons[selribbon]);
    }
    s.ribbonsel.visible = false;
  }

  async pbMarking(pokemon: Pokemon): Promise<boolean> {
    const s = this.sprites;
    s.markingbg.visible = true;
    s.markingoverlay.visible = true;
    s.markingsel.visible = true;
    const base = new Color(248, 248, 248);
    const shadow = new Color(104, 104, 104);
    let ret = [...pokemon.markings];
    const markings = [...pokemon.markings];
    const mb = this.markingbitmap!.bitmap;
    const markVariants = Math.floor(mb.height / PokemonSummary_Scene.MARK_HEIGHT);
    let index = 0;
    let redraw = true;
    const markrect = new Rect(0, 0, PokemonSummary_Scene.MARK_WIDTH, PokemonSummary_Scene.MARK_HEIGHT);
    for (;;) {
      // Redraw the markings and text
      if (redraw) {
        const ob: Bitmap = s.markingoverlay.bitmap;
        ob.clear();
        for (let i = 0; i < Math.floor(mb.width / PokemonSummary_Scene.MARK_WIDTH); i++) {
          markrect.x = i * PokemonSummary_Scene.MARK_WIDTH;
          markrect.y = Math.min(markings[i] || 0, markVariants - 1) * PokemonSummary_Scene.MARK_HEIGHT;
          ob.blt(300 + 58 * (i % 3), 154 + 50 * Math.floor(i / 3), mb, markrect);
        }
        pbDrawTextPositions(ob, [
          [_INTL("Mark {1}", pokemon.name), 366, 102, 2, base, shadow],
          [_INTL("OK"), 366, 254, 2, base, shadow],
          [_INTL("Cancel"), 366, 304, 2, base, shadow],
        ]);
        redraw = false;
      }
      // Reposition the cursor
      s.markingsel.x = 284 + 58 * (index % 3);
      s.markingsel.y = 144 + 50 * Math.floor(index / 3);
      switch (index) {
        case 6: // OK
          s.markingsel.x = 284;
          s.markingsel.y = 244;
          s.markingsel.srcRect.y = Math.floor(s.markingsel.bitmap.height / 2);
          break;
        case 7: // Cancel
          s.markingsel.x = 284;
          s.markingsel.y = 294;
          s.markingsel.srcRect.y = Math.floor(s.markingsel.bitmap.height / 2);
          break;
        default:
          s.markingsel.srcRect.y = 0;
      }
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        if (index === 6) { // OK
          ret = markings;
          break;
        } else if (index === 7) { // Cancel
          break;
        } else {
          markings[index] = ((markings[index] || 0) + 1) % markVariants;
          redraw = true;
        }
      } else if (Input.trigger(Input.ACTION)) {
        if (index < 6 && (markings[index] ?? 0) > 0) {
          pbPlayDecisionSE();
          markings[index] = 0;
          redraw = true;
        }
      } else if (Input.trigger(Input.UP)) {
        if (index === 7) index = 6;
        else if (index === 6) index = 4;
        else if (index < 3) index = 7;
        else index -= 3;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.DOWN)) {
        if (index === 7) index = 1;
        else if (index === 6) index = 7;
        else if (index >= 3) index = 6;
        else index += 3;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.LEFT)) {
        if (index < 6) {
          index -= 1;
          if (((index % 3) + 3) % 3 === 2) index += 3;
          pbPlayCursorSE();
        }
      } else if (Input.trigger(Input.RIGHT)) {
        if (index < 6) {
          index += 1;
          if (index % 3 === 0) index -= 3;
          pbPlayCursorSE();
        }
      }
    }
    s.markingbg.visible = false;
    s.markingoverlay.visible = false;
    s.markingsel.visible = false;
    const same = pokemon.markings.length === ret.length && pokemon.markings.every((m, i) => m === ret[i]);
    if (!same) {
      pokemon.markings = ret;
      return true;
    }
    return false;
  }

  /** pbOptions (Generation 9 Pack version) */
  async pbOptions(): Promise<boolean> {
    let dorefresh = false;
    const pkmn = this.pokemon;
    const commands: string[] = [];
    let cmdGiveItem = -1;
    let cmdTakeItem = -1;
    let cmdNickname = -1;
    let cmdPokedex = -1;
    let cmdMark = -1;
    let cmdCheckMoves = -1;
    let cmdLearnMoves = -1;
    let cmdForgetMove = -1;
    let cmdTeachTMs = -1;
    if (this.page === 4) {
      if (pkmn.moves.length > 0) commands[(cmdCheckMoves = commands.length)] = _INTL("Check Moves");
      if (pkmn.canRelearnMove()) commands[(cmdLearnMoves = commands.length)] = _INTL("Remember Moves");
      if (pkmn.moves.length > 1) commands[(cmdForgetMove = commands.length)] = _INTL("Forget Moves");
      commands[(cmdTeachTMs = commands.length)] = _INTL("Use TM's");
    } else {
      if (!pkmn.egg()) {
        commands[(cmdGiveItem = commands.length)] = _INTL("Give item");
        if (pkmn.hasItem()) commands[(cmdTakeItem = commands.length)] = _INTL("Take item");
        if (!pkmn.foreign()) commands[(cmdNickname = commands.length)] = _INTL("Nickname");
        if (player().hasPokedex) commands[(cmdPokedex = commands.length)] = _INTL("View Pokédex");
      }
      commands[(cmdMark = commands.length)] = _INTL("Mark");
    }
    commands[commands.length] = _INTL("Cancel");
    const command = await this.pbShowCommands(commands);
    if (cmdGiveItem >= 0 && command === cmdGiveItem) {
      let item: Id | null = null;
      await pbFadeOutIn(async () => {
        const scene = new PokemonBag_Scene();
        const screen = new PokemonBagScreen(scene, G.bag);
        item = await screen.pbChooseItemScreen((itm) => Item.get(itm).canHold());
      });
      if (item) dorefresh = await pbGiveItemToPokemon(item, pkmn, this, this.partyindex);
    } else if (cmdTakeItem >= 0 && command === cmdTakeItem) {
      dorefresh = await pbTakeItemFromPokemon(pkmn, this);
    } else if (cmdNickname >= 0 && command === cmdNickname) {
      const nickname = await pbEnterPokemonName(_INTL("{1}'s nickname?", pkmn.name), 0, Pokemon.MAX_NAME_SIZE, "", pkmn, true);
      pkmn.name = nickname;
      dorefresh = true;
    } else if (cmdPokedex >= 0 && command === cmdPokedex) {
      player().pokedex.registerLastSeen(pkmn);
      if (SummaryHooks.pokedexInfoSingle) await pbFadeOutIn(() => SummaryHooks.pokedexInfoSingle!(pkmn.species));
      dorefresh = true;
    } else if (cmdMark >= 0 && command === cmdMark) {
      dorefresh = await this.pbMarking(pkmn);
    } else if (cmdCheckMoves >= 0 && command === cmdCheckMoves) {
      pbPlayDecisionSE();
      await this.pbMoveSelection();
      dorefresh = true;
    } else if (cmdLearnMoves >= 0 && command === cmdLearnMoves) {
      await FieldSkillHooks.relearnMoveScreen?.(pkmn); // pbRelearnMoveScreen(@pokemon)
      dorefresh = true;
    } else if (cmdForgetMove >= 0 && command === cmdForgetMove) {
      const moveIndex = await pbForgetMove(pkmn, null);
      if (moveIndex >= 0) {
        const oldMoveName = pkmn.moves[moveIndex]!.name;
        await pbMessage(_INTL("{1} forgot how to use {2}.", pkmn.name, oldMoveName));
        pkmn.forgetMoveAtIndex(moveIndex);
        dorefresh = true;
      }
    } else if (cmdTeachTMs >= 0 && command === cmdTeachTMs) {
      let item: Id | null = null;
      await pbFadeOutIn(async () => {
        const scene = new PokemonBag_Scene();
        const screen = new PokemonBagScreen(scene, G.bag);
        item = await screen.pbChooseItemScreen((itm) => {
          const move = Item.get(itm).move;
          if (!move || pkmn.hasMove(move) || !pkmn.compatibleWithMove(move)) return false;
          return true;
        });
      });
      if (item) {
        await pbUseItemOnPokemon(item, pkmn, this);
        dorefresh = true;
      }
    }
    return dorefresh;
  }

  async pbChooseMoveToForget(moveToLearn: Id | null): Promise<number> {
    const newMove = moveToLearn ? new PokemonMove(moveToLearn) : null;
    let selmove = 0;
    const maxmove = newMove ? Pokemon.MAX_MOVES : Pokemon.MAX_MOVES - 1;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK)) {
        selmove = Pokemon.MAX_MOVES;
        if (newMove) pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        break;
      } else if (Input.trigger(Input.UP)) {
        selmove -= 1;
        if (selmove < 0) selmove = maxmove;
        if (selmove < Pokemon.MAX_MOVES && selmove >= this.pokemon.numMoves()) selmove = this.pokemon.numMoves() - 1;
        this.sprites.movesel.index = selmove;
        const selectedMove = selmove === Pokemon.MAX_MOVES ? newMove! : this.pokemon.moves[selmove]!;
        this.drawSelectedMove(newMove, selectedMove);
      } else if (Input.trigger(Input.DOWN)) {
        selmove += 1;
        if (selmove > maxmove) selmove = 0;
        if (selmove < Pokemon.MAX_MOVES && selmove >= this.pokemon.numMoves()) selmove = newMove ? maxmove : 0;
        this.sprites.movesel.index = selmove;
        const selectedMove = selmove === Pokemon.MAX_MOVES ? newMove! : this.pokemon.moves[selmove]!;
        this.drawSelectedMove(newMove, selectedMove);
      }
    }
    return selmove === Pokemon.MAX_MOVES ? -1 : selmove;
  }

  /** pbScene (Generation 9 Pack version: Use on the Moves page opens the options) */
  async pbScene(): Promise<number> {
    this.pokemon.playCry();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      let dorefresh = false;
      if (Input.trigger(Input.ACTION)) {
        pbSEStop();
        this.pokemon.playCry();
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        if (this.page === 5) {
          pbPlayDecisionSE();
          await this.pbRibbonSelection();
          dorefresh = true;
        } else if (!this.inbattle) {
          pbPlayDecisionSE();
          dorefresh = await this.pbOptions();
        }
      } else if (Input.trigger(Input.UP) && this.partyindex > 0) {
        const oldindex = this.partyindex;
        this.pbGoToPrevious();
        if (this.partyindex !== oldindex) {
          this.pbChangePokemon();
          this.ribbonOffset = 0;
          dorefresh = true;
        }
      } else if (Input.trigger(Input.DOWN) && this.partyindex < this.party.length - 1) {
        const oldindex = this.partyindex;
        this.pbGoToNext();
        if (this.partyindex !== oldindex) {
          this.pbChangePokemon();
          this.ribbonOffset = 0;
          dorefresh = true;
        }
      } else if (Input.trigger(Input.LEFT) && !this.pokemon.egg()) {
        const oldpage = this.page;
        this.page -= 1;
        if (this.page < 1) this.page = 1;
        if (this.page > 5) this.page = 5;
        if (this.page !== oldpage) {
          pbSEPlay("GUI summary change page");
          this.ribbonOffset = 0;
          dorefresh = true;
        }
      } else if (Input.trigger(Input.RIGHT) && !this.pokemon.egg()) {
        const oldpage = this.page;
        this.page += 1;
        if (this.page < 1) this.page = 1;
        if (this.page > 5) this.page = 5;
        if (this.page !== oldpage) {
          pbSEPlay("GUI summary change page");
          this.ribbonOffset = 0;
          dorefresh = true;
        }
      }
      if (dorefresh) this.drawPage(this.page);
    }
    return this.partyindex;
  }
}

/** Settings::NO_DYNAMAX (Essentials Deluxe): the switch that disables Dynamax. */
const NO_DYNAMAX = 972;

//===============================================================================
//
//===============================================================================
export class PokemonSummaryScreen {
  constructor(private scene: PokemonSummary_Scene, private inbattle = false) {}

  async pbStartScreen(party: Pokemon[], partyindex: number): Promise<number> {
    await this.scene.pbStartScene(party, partyindex, this.inbattle);
    const ret = await this.scene.pbScene();
    await this.scene.pbEndScene();
    return ret;
  }

  async pbStartForgetScreen(party: Pokemon[], partyindex: number, moveToLearn: Id | null): Promise<number> {
    let ret = -1;
    await this.scene.pbStartForgetScene(party, partyindex, moveToLearn);
    for (;;) {
      ret = await this.scene.pbChooseMoveToForget(moveToLearn);
      if (ret < 0 || !moveToLearn) break;
      if (MenuFlags.DEBUG || !party[partyindex]!.moves[ret]!.hiddenMove()) break;
      await pbMessage(_INTL("HM moves can't be forgotten now."), null, 0, null, 0, () => this.scene.pbUpdate());
    }
    await this.scene.pbEndScene();
    return ret;
  }

  async pbStartChooseMoveScreen(party: Pokemon[], partyindex: number, message: string): Promise<number> {
    let ret = -1;
    await this.scene.pbStartForgetScene(party, partyindex, null);
    await pbMessage(message, null, 0, null, 0, () => this.scene.pbUpdate());
    for (;;) {
      ret = await this.scene.pbChooseMoveToForget(null);
      if (ret >= 0) break;
      await pbMessage(_INTL("You must choose a move!"), null, 0, null, 0, () => this.scene.pbUpdate());
    }
    await this.scene.pbEndScene();
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
/** pbChooseMove(pokemon, variableNumber, nameVarNumber) */
export async function pbChooseMove(pokemon: Pokemon | null, variableNumber: number, nameVarNumber: number): Promise<void> {
  if (!pokemon) return;
  let ret = -1;
  await pbFadeOutIn(async () => {
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene);
    ret = await screen.pbStartForgetScreen([pokemon], 0, null);
  });
  G.gameVariables.set(variableNumber, ret);
  G.gameVariables.set(nameVarNumber, ret >= 0 ? pokemon.moves[ret]!.name : "");
  if (G.gameMap) (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
}
