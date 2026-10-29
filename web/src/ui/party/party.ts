// Port of 016_UI/005_UI_Party.rb: the party screen (panels, PokemonParty_Scene,
// PokemonPartyScreen, the :party_menu / :party_menu_item MenuHandlers) and the
// script helpers events call (pbPokemonScreen, pbChoosePokemon...). Plugin
// changes, in plugin load order (Data/PluginScripts.rxdata):
//   00 v20.1 Hotfixes: PokemonParty_Scene#pbChangeSelection / #pbHardRefresh
//      (cursor with an empty party).
//   28 Following Pokemon EX: refreshes the follower after
//      PokemonParty_Scene#pbEndScene.
//   29 Essentials Deluxe: Window_CommandPokemonColor (orange/purple/gray text)
//      and PokemonPartyScreen#pbPokemonScreen (coloured plugin commands; with
//      Improved Field Skills installed, field moves aren't listed one by one).
//      Its "BW Party Screen" patch only applies with that plugin (not installed).
//   33 Improved Field Skills: the "Skills" :party_menu option (fieldSkills.ts).
//   34 Enhanced UI: Poké Ball icons matching each Pokémon's ball (SHOW_PARTY_BALL).
//
// Timing: pbSwitchBegin/End scale by Graphics.frame_rate, so they're ported as
// written with FRAME_RATE = 60.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Status } from "../../data/gameData/status";
import { FRAME_RATE } from "../../game/GameCharacter";
import { G } from "../../game/globals";
import { pbPlayCursorSE, pbPlayDecisionSE, pbPlayCancelSE, pbSEPlay } from "../../game/GameSystem";
import { startsWithVowel } from "../../game/items/itemUtilities";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbDrawImagePositions, pbDrawShadowText, pbDrawTextPositions } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { MenuHandlers, type MenuHandlerHash } from "../menus/menuHandlers";
import { FieldActions, flyTemp, type HiddenMoveChoice, MenuFlags, MenuScreens } from "../menus/menuScreens";
import {
  _INTL, pbBottomLeft, pbBottomLeftLines, pbBottomRight, pbDisposeSpriteHash, pbSetSmallFont, pbSetSystemFont, pbUpdateSpriteHash,
} from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { HeldItemIconSprite, preloadHeldItemIcons } from "../sprites/itemIcon";
import { PokemonIconSprite, preloadPokemonIcons, resolveBitmap } from "../sprites/pokemonIcon";
import { BitmapSprite } from "../SpriteWrapper";
import { PictureOrigin } from "../scenes/PictureEx";
import { Window_AdvancedTextPokemon, Window_CommandPokemon, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";
import { UIHelper } from "../bag/UIHelper";
import { PokemonBag_Scene, PokemonBagScreen } from "../bag/bag";
import type { PokemonBag } from "../../game/items/PokemonBag";
import {
  pbCanUseOnPokemon, pbGiveItemToPokemon, pbItemRestoreHP, pbTakeItemFromPokemon, pbUseItemOnPokemon,
} from "../bag/itemUtilities";
import { ChangelingSprite, onPropertySet } from "./ChangelingSprite";
import { pbDisplayMail } from "./mail";

const player = () => G.player as unknown as Player;

/** Screens the party screen opens that are ported elsewhere (set by those ports). */
export const PartyHooks: {
  /** pbFadeOutIn { PokemonStorageScreen.new(PokemonStorageScene.new, $PokemonStorage).pbStartScreen(0); pbHardRefresh } (Box Link) */
  pokemonStorage?: (hardRefresh: () => void) => Promise<void>;
  /** PokemonPartyScreen#pbPokemonDebug(pkmn, pkmnid) (only with $DEBUG) */
  pokemonDebug?: (screen: PokemonPartyScreen, pkmn: Pokemon, pkmnid: number) => Promise<void>;
} = {};

/** "Choose a Pokémon." / "Choose Pokémon or cancel." */
function chooseText(party: unknown[]): string {
  return party.length > 1 ? _INTL("Choose a Pokémon.") : _INTL("Choose Pokémon or cancel.");
}

/** Graphics the party screen draws (for preloading). */
const PARTY_BITMAPS = [
  "Graphics/Pictures/Party/bg", "Graphics/Pictures/Party/panel_blank",
  ...["round", "rect"].flatMap((s) => ["", "_sel", "_faint", "_faint_sel", "_swap", "_swap_sel", "_swap_sel2"].map((v) => `Graphics/Pictures/Party/panel_${s}${v}`)),
  "Graphics/Pictures/Party/overlay_hp_back", "Graphics/Pictures/Party/overlay_hp_back_faint", "Graphics/Pictures/Party/overlay_hp_back_swap",
  "Graphics/Pictures/Party/icon_ball", "Graphics/Pictures/Party/icon_ball_sel", "Graphics/Pictures/Party/overlay_hp",
  "Graphics/Pictures/Party/overlay_lv", "Graphics/Pictures/statuses", "Graphics/Pictures/shiny",
  "Graphics/Pictures/Party/icon_cancel", "Graphics/Pictures/Party/icon_cancel_sel",
  "Graphics/Pictures/Party/icon_cancel_narrow", "Graphics/Pictures/Party/icon_cancel_narrow_sel",
];

/** Enhanced UI's Party Ball graphics: one (and a _sel) per Poké Ball. */
function partyBallPaths(): string[] {
  return Item.each().filter((b) => b.isPokeBall()).flatMap((b) => {
    const sprite = `Graphics/Plugins/Enhanced UI/Party Ball/${b.id}`;
    return [sprite, `${sprite}_sel`];
  });
}

/** Fetches everything the party screen shows for this party. */
export async function preloadParty(party: (Pokemon | null | undefined)[]): Promise<void> {
  await Promise.all([
    preloadBitmaps([...PARTY_BITMAPS, ...partyBallPaths()]),
    preloadPokemonIcons(party),
    preloadHeldItemIcons(party.map((p) => p?.itemId)),
  ]);
}

//===============================================================================
// Pokémon party buttons and menu
//===============================================================================
export class PokemonPartyConfirmCancelSprite extends Sprite {
  private _selected = false;
  private bgsprite: ChangelingSprite;
  private overlaysprite: BitmapSprite;

  constructor(text: string, x: number, y: number, narrowbox = false, viewport: Viewport | null = null) {
    super(viewport);
    this.bgsprite = new ChangelingSprite(0, 0, viewport);
    if (narrowbox) {
      this.bgsprite.addBitmap("desel", "Graphics/Pictures/Party/icon_cancel_narrow");
      this.bgsprite.addBitmap("sel", "Graphics/Pictures/Party/icon_cancel_narrow_sel");
    } else {
      this.bgsprite.addBitmap("desel", "Graphics/Pictures/Party/icon_cancel");
      this.bgsprite.addBitmap("sel", "Graphics/Pictures/Party/icon_cancel_sel");
    }
    this.bgsprite.changeBitmap("desel");
    this.overlaysprite = new BitmapSprite(this.bgsprite.bitmap!.width, this.bgsprite.bitmap!.height, viewport);
    this.overlaysprite.z = this.z + 1;
    pbSetSystemFont(this.overlaysprite.bitmap!);
    pbDrawTextPositions(this.overlaysprite.bitmap!,
      [[text, 56, narrowbox ? 8 : 14, 2, new Color(248, 248, 248), new Color(40, 40, 40)]]);
    onPropertySet(this, ["x", "y", "color"], () => this.refresh());
    this.x = x;
    this.y = y;
  }

  override dispose(): void {
    this.bgsprite.dispose();
    this.overlaysprite.dispose();
    super.dispose();
  }

  get selected(): boolean { return this._selected; }
  set selected(value: boolean) {
    if (this._selected !== value) {
      this._selected = value;
      this.refresh();
    }
  }

  refresh(): void {
    if (this.bgsprite && !this.bgsprite.isDisposed()) {
      this.bgsprite.changeBitmap(this._selected ? "sel" : "desel");
      this.bgsprite.x = this.x;
      this.bgsprite.y = this.y;
      this.bgsprite.color = this.color.clone();
    }
    if (this.overlaysprite && !this.overlaysprite.isDisposed()) {
      this.overlaysprite.x = this.x;
      this.overlaysprite.y = this.y;
      this.overlaysprite.color = this.color.clone();
    }
  }
}

export class PokemonPartyCancelSprite extends PokemonPartyConfirmCancelSprite {
  constructor(viewport: Viewport | null = null) {
    super(_INTL("CANCEL"), 398, 328, false, viewport);
  }
}

export class PokemonPartyConfirmSprite extends PokemonPartyConfirmCancelSprite {
  constructor(viewport: Viewport | null = null) {
    super(_INTL("CONFIRM"), 398, 308, true, viewport);
  }
}

export class PokemonPartyCancelSprite2 extends PokemonPartyConfirmCancelSprite {
  constructor(viewport: Viewport | null = null) {
    super(_INTL("CANCEL"), 398, 346, true, viewport);
  }
}

/** A command: its text, or [text, colour key] (1 blue, 2 orange, 3 purple, 4 gray). */
export type ColorCommand = string | [string, number];

/** Window_CommandPokemonColor as Essentials Deluxe rewrites drawItem. */
export class Window_CommandPokemonColor extends Window_CommandPokemon {
  declare colorKey: (number | undefined)[];

  constructor(commands: ColorCommand[], width: number | null = null) {
    const colorKey: (number | undefined)[] = [];
    const plain = commands.map((c, i) => {
      if (Array.isArray(c)) {
        colorKey[i] = c[1];
        return c[0];
      }
      return c;
    });
    super(plain, width);
    this.colorKey = colorKey;
    this.refresh();
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    if (this._starting) pbSetSystemFont(this.contents!);
    rect = this.drawCursor(index, rect);
    let base = this.baseColor;
    let shadow = this.shadowColor;
    const key = this.colorKey?.[index];
    if (key === 1) { // Blue text.
      base = new Color(0, 80, 160);
      shadow = new Color(128, 192, 240);
    }
    if (key === 2) { // Orange text.
      base = new Color(236, 88, 0);
      shadow = new Color(255, 170, 51);
    }
    if (key === 3) { // Purple text.
      base = new Color(149, 33, 246);
      shadow = new Color(255, 161, 326);
    }
    if (key === 4) { // Gray text.
      base = new Color(184, 184, 184);
      shadow = new Color(96, 96, 96);
    }
    pbDrawShadowText(this.contents!, rect.x, rect.y + (this.contents!.textOffsetY || 0),
      rect.width, rect.height, this._commands[index]!, base, shadow);
  }
}

//===============================================================================
// Blank party panel
//===============================================================================
export class PokemonPartyBlankPanel extends Sprite {
  text: string | null = null;
  private panelbgsprite: AnimatedBitmap;

  constructor(_pokemon: Pokemon | null | undefined, index: number, viewport: Viewport | null = null) {
    super(viewport);
    this.x = Math.floor(((index % 2) * Graphics.width) / 2);
    this.y = 16 * (index % 2) + 96 * Math.floor(index / 2);
    this.panelbgsprite = new AnimatedBitmap("Graphics/Pictures/Party/panel_blank");
    this.setBitmap(this.panelbgsprite.bitmap);
    this.text = null;
  }

  override dispose(): void {
    this.panelbgsprite.dispose();
    this.setBitmap(null);
    super.dispose();
  }

  get selected(): boolean { return false; }
  set selected(_value: boolean) {}
  get preselected(): boolean { return false; }
  set preselected(_value: boolean) {}
  get switching(): boolean { return false; }
  set switching(_value: boolean) {}
  refresh(): void {}
}

//===============================================================================
// Pokémon party panel
//===============================================================================
export class PokemonPartyPanel extends Sprite {
  static readonly TEXT_BASE_COLOR = new Color(248, 248, 248);
  static readonly TEXT_SHADOW_COLOR = new Color(40, 40, 40);
  static readonly HP_BAR_WIDTH = 96;
  static readonly STATUS_ICON_WIDTH = 44;
  static readonly STATUS_ICON_HEIGHT = 16;

  private _pokemon: Pokemon;
  readonly active: boolean;
  private _selected = false;
  private _preselected = false;
  private _switching = false;
  private _text: string | null = null;
  private refreshBitmap = true;
  private refreshing = true;
  private panelbgsprite: ChangelingSprite;
  private hpbgsprite: ChangelingSprite;
  private ballsprite: ChangelingSprite;
  private pkmnsprite: PokemonIconSprite;
  private helditemsprite: HeldItemIconSprite;
  private overlaysprite: BitmapSprite;
  private hpbar: AnimatedBitmap;
  private statuses: AnimatedBitmap;

  constructor(pokemon: Pokemon, index: number, viewport: Viewport | null = null) {
    super(viewport);
    this._pokemon = pokemon;
    this.active = index === 0; // true = rounded panel, false = rectangular panel
    this.refreshing = true;
    this.x = Math.floor(((index % 2) * Graphics.width) / 2);
    this.y = 16 * (index % 2) + 96 * Math.floor(index / 2);
    this.panelbgsprite = new ChangelingSprite(0, 0, viewport);
    this.panelbgsprite.z = this.z;
    const shape = this.active ? "round" : "rect"; // Rounded panel / Rectangular panel
    this.panelbgsprite.addBitmap("able", `Graphics/Pictures/Party/panel_${shape}`);
    this.panelbgsprite.addBitmap("ablesel", `Graphics/Pictures/Party/panel_${shape}_sel`);
    this.panelbgsprite.addBitmap("fainted", `Graphics/Pictures/Party/panel_${shape}_faint`);
    this.panelbgsprite.addBitmap("faintedsel", `Graphics/Pictures/Party/panel_${shape}_faint_sel`);
    this.panelbgsprite.addBitmap("swap", `Graphics/Pictures/Party/panel_${shape}_swap`);
    this.panelbgsprite.addBitmap("swapsel", `Graphics/Pictures/Party/panel_${shape}_swap_sel`);
    this.panelbgsprite.addBitmap("swapsel2", `Graphics/Pictures/Party/panel_${shape}_swap_sel2`);
    this.hpbgsprite = new ChangelingSprite(0, 0, viewport);
    this.hpbgsprite.z = this.z + 1;
    this.hpbgsprite.addBitmap("able", "Graphics/Pictures/Party/overlay_hp_back");
    this.hpbgsprite.addBitmap("fainted", "Graphics/Pictures/Party/overlay_hp_back_faint");
    this.hpbgsprite.addBitmap("swap", "Graphics/Pictures/Party/overlay_hp_back_swap");
    this.ballsprite = new ChangelingSprite(0, 0, viewport);
    this.ballsprite.z = this.z + 1;
    this.ballsprite.addBitmap("desel", "Graphics/Pictures/Party/icon_ball");
    this.ballsprite.addBitmap("sel", "Graphics/Pictures/Party/icon_ball_sel");
    this.pkmnsprite = new PokemonIconSprite(pokemon, viewport);
    this.pkmnsprite.setOffset(PictureOrigin.CENTER);
    this.pkmnsprite.active = this.active;
    this.pkmnsprite.z = this.z + 2;
    this.helditemsprite = new HeldItemIconSprite(0, 0, this._pokemon, viewport);
    this.helditemsprite.z = this.z + 3;
    this.overlaysprite = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    this.overlaysprite.z = this.z + 4;
    pbSetSystemFont(this.overlaysprite.bitmap!);
    this.hpbar = new AnimatedBitmap("Graphics/Pictures/Party/overlay_hp");
    this.statuses = new AnimatedBitmap(_INTL("Graphics/Pictures/statuses"));
    this._selected = false;
    this._preselected = false;
    this._switching = false;
    this._text = null;
    this.refreshBitmap = true;
    this.refreshing = false;
    // Enhanced UI: Party Ball (Settings::SHOW_PARTY_BALL)
    for (const ball of Item.each()) {
      if (!ball.isPokeBall()) continue;
      const sprite = `Graphics/Plugins/Enhanced UI/Party Ball/${ball.id}`;
      this.ballsprite.addBitmap(`${ball.id}_desel`, sprite);
      this.ballsprite.addBitmap(`${ball.id}_sel`, sprite + "_sel");
    }
    onPropertySet(this, ["x", "y", "color"], () => this.refresh());
    this.refresh();
  }

  override dispose(): void {
    this.panelbgsprite.dispose();
    this.hpbgsprite.dispose();
    this.ballsprite.dispose();
    this.pkmnsprite.dispose();
    this.helditemsprite.dispose();
    this.overlaysprite.dispose();
    this.hpbar.dispose();
    this.statuses.dispose();
    super.dispose();
  }

  get text(): string | null { return this._text; }
  set text(value: string | null) {
    if (this._text === value) return;
    this._text = value;
    this.refreshBitmap = true;
    this.refresh();
  }

  get pokemon(): Pokemon { return this._pokemon; }
  set pokemon(value: Pokemon) {
    this._pokemon = value;
    if (this.pkmnsprite && !this.pkmnsprite.isDisposed()) this.pkmnsprite.pokemon = value;
    if (this.helditemsprite && !this.helditemsprite.isDisposed()) this.helditemsprite.pokemon = value;
    this.refreshBitmap = true;
    this.refresh();
  }

  get selected(): boolean { return this._selected; }
  set selected(value: boolean) {
    if (this._selected === value) return;
    this._selected = value;
    this.refresh();
  }

  get preselected(): boolean { return this._preselected; }
  set preselected(value: boolean) {
    if (this._preselected === value) return;
    this._preselected = value;
    this.refresh();
  }

  get switching(): boolean { return this._switching; }
  set switching(value: boolean) {
    if (this._switching === value) return;
    this._switching = value;
    this.refresh();
  }

  get hp(): number { return this._pokemon.hp; }

  refreshPanelGraphic(): void {
    if (!this.panelbgsprite || this.panelbgsprite.isDisposed()) return;
    if (this.selected) {
      if (this.preselected) this.panelbgsprite.changeBitmap("swapsel2");
      else if (this._switching) this.panelbgsprite.changeBitmap("swapsel");
      else if (this._pokemon.fainted()) this.panelbgsprite.changeBitmap("faintedsel");
      else this.panelbgsprite.changeBitmap("ablesel");
    } else {
      if (this.preselected) this.panelbgsprite.changeBitmap("swap");
      else if (this._pokemon.fainted()) this.panelbgsprite.changeBitmap("fainted");
      else this.panelbgsprite.changeBitmap("able");
    }
    this.panelbgsprite.x = this.x;
    this.panelbgsprite.y = this.y;
    this.panelbgsprite.color = this.color.clone();
  }

  refreshHpBarGraphic(): void {
    if (!this.hpbgsprite || this.hpbgsprite.isDisposed()) return;
    this.hpbgsprite.visible = !this._pokemon.egg() && !(this._text && this._text.length > 0);
    if (!this.hpbgsprite.visible) return;
    if (this.preselected || (this.selected && this._switching)) this.hpbgsprite.changeBitmap("swap");
    else if (this._pokemon.fainted()) this.hpbgsprite.changeBitmap("fainted");
    else this.hpbgsprite.changeBitmap("able");
    this.hpbgsprite.x = this.x + 96;
    this.hpbgsprite.y = this.y + 50;
    this.hpbgsprite.color = this.color.clone();
  }

  /** refresh_ball_graphic, with Enhanced UI's ball-specific icons. */
  refreshBallGraphic(): void {
    if (!this.ballsprite || this.ballsprite.isDisposed()) return;
    this.ballsprite.changeBitmap(this.selected ? "sel" : "desel");
    this.ballsprite.x = this.x + 10;
    this.ballsprite.y = this.y;
    this.ballsprite.color = this.color.clone();
    // Enhanced UI
    const ball = this._pokemon.pokeBall;
    const path = `Graphics/Plugins/Enhanced UI/Party Ball/${ball}`;
    const ballSel = resolveBallBitmap(path + "_sel") ? `${ball}_sel` : "sel";
    const ballDesel = resolveBallBitmap(path) ? `${ball}_desel` : "desel";
    this.ballsprite.changeBitmap(this.selected ? ballSel : ballDesel);
  }

  refreshPokemonIcon(): void {
    if (!this.pkmnsprite || this.pkmnsprite.isDisposed()) return;
    this.pkmnsprite.x = this.x + 60;
    this.pkmnsprite.y = this.y + 40;
    this.pkmnsprite.color = this.color.clone();
    this.pkmnsprite.selected = this.selected;
  }

  refreshHeldItemIcon(): void {
    if (!this.helditemsprite || this.helditemsprite.isDisposed() || !this.helditemsprite.visible) return;
    this.helditemsprite.x = this.x + 62;
    this.helditemsprite.y = this.y + 48;
    this.helditemsprite.color = this.color.clone();
  }

  refreshOverlayInformation(): void {
    if (!this.refreshBitmap) return;
    this.overlaysprite.bitmap?.clear();
    this.drawName();
    this.drawLevel();
    this.drawGender();
    this.drawHp();
    this.drawStatus();
    this.drawShinyIcon();
    this.drawAnnotation();
  }

  drawName(): void {
    pbDrawTextPositions(this.overlaysprite.bitmap!,
      [[this._pokemon.name, 96, 22, 0, PokemonPartyPanel.TEXT_BASE_COLOR, PokemonPartyPanel.TEXT_SHADOW_COLOR]]);
  }

  drawLevel(): void {
    if (this._pokemon.egg()) return;
    const bmp = this.overlaysprite.bitmap!;
    // "Lv" graphic
    pbDrawImagePositions(bmp, [["Graphics/Pictures/Party/overlay_lv", 20, 70, 0, 0, 22, 14]]);
    // Level number
    pbSetSmallFont(bmp);
    pbDrawTextPositions(bmp, [[String(this._pokemon.level), 42, 68, 0, PokemonPartyPanel.TEXT_BASE_COLOR, PokemonPartyPanel.TEXT_SHADOW_COLOR]]);
    pbSetSystemFont(bmp);
  }

  drawGender(): void {
    if (this._pokemon.egg() || this._pokemon.genderless()) return;
    const male = this._pokemon.male();
    const genderText = male ? _INTL("♂") : _INTL("♀");
    const baseColor = male ? new Color(0, 112, 248) : new Color(232, 32, 16);
    const shadowColor = male ? new Color(120, 184, 232) : new Color(248, 168, 184);
    pbDrawTextPositions(this.overlaysprite.bitmap!, [[genderText, 224, 22, 0, baseColor, shadowColor]]);
  }

  drawHp(): void {
    const pkmn = this._pokemon;
    if (pkmn.egg() || (this._text && this._text.length > 0)) return;
    // HP numbers
    const hpText = `${spaceD3(pkmn.hp)} /${spaceD3(pkmn.totalhp)}`; // sprintf("% 3d /% 3d")
    pbDrawTextPositions(this.overlaysprite.bitmap!, [[hpText, 224, 66, 1, PokemonPartyPanel.TEXT_BASE_COLOR, PokemonPartyPanel.TEXT_SHADOW_COLOR]]);
    // HP bar
    if (pkmn.able()) {
      let w = (pkmn.hp * PokemonPartyPanel.HP_BAR_WIDTH) / pkmn.totalhp;
      if (w < 1) w = 1;
      w = Math.round(w / 2) * 2; // Round to the nearest 2 pixels
      let hpzone = 0;
      if (pkmn.hp <= Math.floor(pkmn.totalhp / 2)) hpzone = 1;
      if (pkmn.hp <= Math.floor(pkmn.totalhp / 4)) hpzone = 2;
      const hprect = new Rect(0, hpzone * 8, w, 8);
      this.overlaysprite.bitmap!.blt(128, 52, this.hpbar.bitmap, hprect);
    }
  }

  drawStatus(): void {
    const pkmn = this._pokemon;
    if (pkmn.egg() || (this._text && this._text.length > 0)) return;
    let status = -1;
    if (pkmn.fainted()) status = Status.count() - 1;
    else if (pkmn.status !== "NONE") status = Status.get(pkmn.status).iconPosition;
    else if (pkmn.pokerusStage() === 1) status = Status.count();
    if (status < 0) return;
    const h = PokemonPartyPanel.STATUS_ICON_HEIGHT;
    const statusrect = new Rect(0, h * status, PokemonPartyPanel.STATUS_ICON_WIDTH, h);
    this.overlaysprite.bitmap!.blt(78, 68, this.statuses.bitmap, statusrect);
  }

  drawShinyIcon(): void {
    if (this._pokemon.egg() || !this._pokemon.shiny) return;
    pbDrawImagePositions(this.overlaysprite.bitmap!, [["Graphics/Pictures/shiny", 80, 48, 0, 0, 16, 16]]);
  }

  drawAnnotation(): void {
    if (!this._text || this._text.length === 0) return;
    pbDrawTextPositions(this.overlaysprite.bitmap!,
      [[this._text, 96, 62, 0, PokemonPartyPanel.TEXT_BASE_COLOR, PokemonPartyPanel.TEXT_SHADOW_COLOR]]);
  }

  refresh(): void {
    if (this.isDisposed()) return;
    if (this.refreshing) return;
    this.refreshing = true;
    this.refreshPanelGraphic();
    this.refreshHpBarGraphic();
    this.refreshBallGraphic();
    this.refreshPokemonIcon();
    this.refreshHeldItemIcon();
    if (this.overlaysprite && !this.overlaysprite.isDisposed()) {
      this.overlaysprite.x = this.x;
      this.overlaysprite.y = this.y;
      this.overlaysprite.color = this.color.clone();
    }
    this.refreshOverlayInformation();
    this.refreshBitmap = false;
    this.refreshing = false;
  }

  override update(dt?: number): void {
    super.update(dt);
    for (const s of [this.panelbgsprite, this.hpbgsprite, this.ballsprite, this.pkmnsprite, this.helditemsprite] as Sprite[]) {
      if (s && !s.isDisposed()) s.update();
    }
  }
}

/** sprintf("% 3d", n) */
function spaceD3(n: number): string {
  return (n >= 0 ? ` ${n}` : String(n)).padStart(3, " ");
}

/** pbResolveBitmap for the Party Ball icons (preloaded with the screen). */
function resolveBallBitmap(path: string): boolean {
  return !!resolveBitmap(path);
}

//===============================================================================
// Pokémon party visuals
//===============================================================================
export class PokemonParty_Scene {
  sprites: Record<string, any> = {};
  private party: Pokemon[] = [];
  private viewport!: Viewport;
  private multiselect = false;
  private canAccessStorage = false;
  private activecmd = 0;

  /** @sprites["pokemon#{i}"] (blank panels and the Cancel/Confirm sprites answer the same calls). */
  private panel(i: number): PokemonPartyPanel {
    return this.sprites[`pokemon${i}`] as PokemonPartyPanel;
  }

  async pbStartScene(party: Pokemon[], starthelptext: string, annotations: (string | null)[] | null = null, multiselect = false, canAccessStorage = false): Promise<void> {
    await preloadParty(party);
    this.sprites = {};
    this.party = party;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.multiselect = multiselect;
    this.canAccessStorage = canAccessStorage;
    addBackgroundPlane(this.sprites, "partybg", "Party/bg", this.viewport);
    const messagebox = new Window_AdvancedTextPokemon("");
    messagebox.z = 50;
    messagebox.viewport = this.viewport;
    messagebox.visible = false;
    messagebox.letterbyletter = true;
    pbBottomLeftLines(messagebox, 2);
    this.sprites.messagebox = messagebox;
    const storagetext = new Window_UnformattedTextPokemon(this.canAccessStorage ? _INTL("[Special]: To Boxes") : "");
    storagetext.x = 32;
    storagetext.y = Graphics.height - messagebox.height - 16;
    storagetext.z = 10;
    storagetext.viewport = this.viewport;
    storagetext.baseColor = new Color(248, 248, 248);
    storagetext.shadowColor = new Color(0, 0, 0);
    storagetext.windowskin = null;
    this.sprites.storagetext = storagetext;
    const helpwindow = new Window_UnformattedTextPokemon(starthelptext);
    helpwindow.viewport = this.viewport;
    helpwindow.visible = true;
    pbBottomLeftLines(helpwindow, 1);
    this.sprites.helpwindow = helpwindow;
    this.pbSetHelpText(starthelptext);
    // Add party Pokémon sprites
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      if (this.party[i]) this.sprites[`pokemon${i}`] = new PokemonPartyPanel(this.party[i]!, i, this.viewport);
      else this.sprites[`pokemon${i}`] = new PokemonPartyBlankPanel(this.party[i], i, this.viewport);
      if (annotations) (this.panel(i) as PokemonPartyPanel).text = annotations[i] ?? null;
    }
    if (this.multiselect) {
      this.sprites[`pokemon${Settings.MAX_PARTY_SIZE}`] = new PokemonPartyConfirmSprite(this.viewport);
      this.sprites[`pokemon${Settings.MAX_PARTY_SIZE + 1}`] = new PokemonPartyCancelSprite2(this.viewport);
    } else {
      this.sprites[`pokemon${Settings.MAX_PARTY_SIZE}`] = new PokemonPartyCancelSprite(this.viewport);
    }
    // Select first Pokémon
    this.activecmd = 0;
    this.panel(0).selected = true;
    await pbFadeInAndShow(this.sprites, null, () => this.update());
  }

  /** pbEndScene (+ Following Pokemon EX's follower refresh) */
  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(this.sprites, () => this.update());
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
    FieldActions.followingPkmn?.refresh(false);
  }

  async pbDisplay(text: string): Promise<void> {
    const messagebox: Window_AdvancedTextPokemon = this.sprites.messagebox;
    messagebox.text = text;
    messagebox.visible = true;
    this.sprites.helpwindow.visible = false;
    pbPlayDecisionSE();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.update();
      if (messagebox.busy()) {
        if (Input.trigger(Input.USE)) {
          if (messagebox.pausing()) pbPlayDecisionSE();
          messagebox.resume();
        }
      } else if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) {
        break;
      }
    }
    messagebox.visible = false;
    this.sprites.helpwindow.visible = true;
  }

  async pbDisplayConfirm(text: string): Promise<boolean> {
    let ret = false;
    const messagebox: Window_AdvancedTextPokemon = this.sprites.messagebox;
    messagebox.text = text;
    messagebox.visible = true;
    this.sprites.helpwindow.visible = false;
    const cmdwindow = new Window_CommandPokemon([_INTL("Yes"), _INTL("No")]);
    try {
      cmdwindow.visible = false;
      pbBottomRight(cmdwindow);
      cmdwindow.y -= messagebox.height;
      cmdwindow.z = this.viewport.z + 1;
      for (;;) {
        await Graphics.update();
        Input.update();
        if (!messagebox.busy()) cmdwindow.visible = true;
        cmdwindow.update();
        this.update();
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
    this.sprites.helpwindow.visible = true;
    return ret;
  }

  async pbShowCommands(helptext: string, commands: ColorCommand[], index = 0): Promise<number> {
    let ret = -1;
    const helpwindow: Window_UnformattedTextPokemon = this.sprites.helpwindow;
    helpwindow.visible = true;
    const cmdwindow = new Window_CommandPokemonColor(commands);
    try {
      cmdwindow.z = this.viewport.z + 1;
      cmdwindow.index = index;
      pbBottomRight(cmdwindow);
      helpwindow.resizeHeightToFit(helptext, Graphics.width - cmdwindow.width);
      helpwindow.text = helptext;
      pbBottomLeft(helpwindow);
      for (;;) {
        await Graphics.update();
        Input.update();
        cmdwindow.update();
        this.update();
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

  async pbChooseNumber(helptext: string, maximum: number, initnum = 1): Promise<number> {
    return UIHelper.pbChooseNumber(this.sprites.helpwindow, helptext, maximum, initnum, () => this.update());
  }

  pbSetHelpText(helptext: string): void {
    const helpwindow: Window_UnformattedTextPokemon = this.sprites.helpwindow;
    pbBottomLeftLines(helpwindow, 1);
    helpwindow.text = helptext;
    helpwindow.width = 398;
    helpwindow.visible = true;
  }

  pbHasAnnotations(): boolean {
    return this.panel(0).text != null;
  }

  pbAnnotate(annot: (string | null)[] | null): void {
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      (this.panel(i) as PokemonPartyPanel).text = annot ? annot[i] ?? null : null;
    }
  }

  pbSelect(item: number): void {
    this.activecmd = item;
    const numsprites = Settings.MAX_PARTY_SIZE + (this.multiselect ? 2 : 1);
    for (let i = 0; i < numsprites; i++) this.panel(i).selected = i === this.activecmd;
  }

  pbPreSelect(item: number): void {
    this.activecmd = item;
  }

  async pbSwitchBegin(oldid: number, newid: number): Promise<void> {
    pbSEPlay("GUI party switch");
    const oldsprite = this.panel(oldid);
    const newsprite = this.panel(newid);
    const timeTaken = Math.floor((FRAME_RATE * 4) / 10);
    const distancePerFrame = Math.ceil(Graphics.width / (2.0 * timeTaken));
    for (let i = 0; i < timeTaken; i++) {
      oldsprite.x += (oldid & 1) === 0 ? -distancePerFrame : distancePerFrame;
      newsprite.x += (newid & 1) === 0 ? -distancePerFrame : distancePerFrame;
      await Graphics.update();
      Input.update();
      this.update();
    }
  }

  async pbSwitchEnd(oldid: number, newid: number): Promise<void> {
    pbSEPlay("GUI party switch");
    const oldsprite = this.panel(oldid) as PokemonPartyPanel;
    const newsprite = this.panel(newid) as PokemonPartyPanel;
    oldsprite.pokemon = this.party[oldid]!;
    newsprite.pokemon = this.party[newid]!;
    const timeTaken = Math.floor((FRAME_RATE * 4) / 10);
    const distancePerFrame = Math.ceil(Graphics.width / (2.0 * timeTaken));
    for (let i = 0; i < timeTaken; i++) {
      oldsprite.x -= (oldid & 1) === 0 ? -distancePerFrame : distancePerFrame;
      newsprite.x -= (newid & 1) === 0 ? -distancePerFrame : distancePerFrame;
      await Graphics.update();
      Input.update();
      this.update();
    }
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      this.panel(i).preselected = false;
      this.panel(i).switching = false;
    }
    this.pbRefresh();
  }

  pbClearSwitching(): void {
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      this.panel(i).preselected = false;
      this.panel(i).switching = false;
    }
  }

  /** pbSummary(pkmnid, inbattle) { block } */
  async pbSummary(pkmnid: number, inbattle = false, block?: () => void | Promise<void>): Promise<boolean> {
    const { PokemonSummary_Scene, PokemonSummaryScreen } = await import("../summary/summary");
    const oldsprites = await pbFadeOutAndHide(this.sprites);
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene, inbattle);
    await screen.pbStartScreen(this.party, pkmnid);
    if (block) await block();
    await pbFadeInAndShow(this.sprites, oldsprites);
    return true;
  }

  async pbChooseItem(bag: PokemonBag, block?: () => void | Promise<void>): Promise<Id | null> {
    let ret: Id | null = null;
    await pbFadeOutIn(async () => {
      const scene = new PokemonBag_Scene();
      const screen = new PokemonBagScreen(scene, bag);
      ret = await screen.pbChooseItemScreen((item) => Item.get(item).canHold());
      if (block) await block();
    });
    return ret;
  }

  async pbUseItem(bag: PokemonBag, pokemon: Pokemon, block?: () => void | Promise<void>): Promise<Id | null> {
    let ret: Id | null = null;
    await pbFadeOutIn(async () => {
      const scene = new PokemonBag_Scene();
      const screen = new PokemonBagScreen(scene, bag);
      ret = await screen.pbChooseItemScreen((item) => {
        const itm = Item.get(item);
        if (!pbCanUseOnPokemon(itm)) return false;
        if (pokemon.hyperMode && !Item.tryGet(item)?.isScent()) return false;
        if (itm.isMachine()) {
          const move = itm.move!;
          if (pokemon.hasMove(move) || !pokemon.compatibleWithMove(move)) return false;
        }
        return true;
      });
      if (block) await block();
    });
    return ret;
  }

  /**
   * pbChoosePokemon(switching, initialsel, canswitch): the chosen index, -1 to
   * cancel, or [1, index] when Action is pressed to quick switch (canswitch 1).
   */
  async pbChoosePokemon(switching?: boolean, initialsel?: number, canswitch?: 0 | 2): Promise<number>;
  async pbChoosePokemon(switching: boolean, initialsel: number, canswitch: 1): Promise<number | [number, number]>;
  async pbChoosePokemon(switching = false, initialsel = -1, canswitch = 0): Promise<number | [number, number]> {
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      this.panel(i).preselected = switching && i === this.activecmd;
      this.panel(i).switching = switching;
    }
    if (initialsel >= 0) this.activecmd = initialsel;
    this.pbRefresh();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.update();
      const oldsel = this.activecmd;
      let key = -1;
      if (Input.repeat(Input.DOWN)) key = Input.DOWN;
      if (Input.repeat(Input.RIGHT)) key = Input.RIGHT;
      if (Input.repeat(Input.LEFT)) key = Input.LEFT;
      if (Input.repeat(Input.UP)) key = Input.UP;
      if (key >= 0) this.activecmd = this.pbChangeSelection(key, this.activecmd);
      if (this.activecmd !== oldsel) { // Changing selection
        pbPlayCursorSE();
        const numsprites = Settings.MAX_PARTY_SIZE + (this.multiselect ? 2 : 1);
        for (let i = 0; i < numsprites; i++) this.panel(i).selected = i === this.activecmd;
      }
      const cancelsprite = Settings.MAX_PARTY_SIZE + (this.multiselect ? 1 : 0);
      if (Input.trigger(Input.SPECIAL) && this.canAccessStorage && canswitch !== 2) {
        pbPlayDecisionSE();
        if (PartyHooks.pokemonStorage) await PartyHooks.pokemonStorage(() => this.pbHardRefresh());
      } else if (Input.trigger(Input.ACTION) && canswitch === 1 && this.activecmd !== cancelsprite) {
        pbPlayDecisionSE();
        return [1, this.activecmd];
      } else if (Input.trigger(Input.ACTION) && canswitch === 2) {
        return -1;
      } else if (Input.trigger(Input.BACK)) {
        if (!switching) pbPlayCloseMenuSE();
        return -1;
      } else if (Input.trigger(Input.USE)) {
        if (this.activecmd === cancelsprite) {
          if (switching) pbPlayDecisionSE();
          else pbPlayCloseMenuSE();
          return -1;
        } else {
          pbPlayDecisionSE();
          return this.activecmd;
        }
      }
    }
  }

  /** pbChangeSelection (v20.1 Hotfixes version: works with an empty party) */
  pbChangeSelection(key: number, currentsel: number): number {
    const max = Settings.MAX_PARTY_SIZE;
    const numsprites = max + (this.multiselect ? 2 : 1);
    const party = this.party;
    switch (key) {
      case Input.LEFT:
        do {
          currentsel -= 1;
        } while (currentsel > 0 && currentsel < party.length && !party[currentsel]);
        if (currentsel >= party.length && currentsel < max) currentsel = party.length - 1;
        if (currentsel < 0) currentsel = numsprites - 1;
        break;
      case Input.RIGHT:
        do {
          currentsel += 1;
        } while (currentsel < party.length && !party[currentsel]);
        if (currentsel === party.length) {
          currentsel = max;
        } else if (currentsel === numsprites) {
          currentsel = 0;
          if (currentsel >= party.length) currentsel = numsprites - 1;
        }
        break;
      case Input.UP:
        if (currentsel >= max) {
          currentsel -= 1;
          while (currentsel > 0 && currentsel < max && !party[currentsel]) currentsel -= 1;
          if (currentsel >= party.length) currentsel = numsprites - 1;
        } else {
          do {
            currentsel -= 2;
          } while (currentsel > 0 && !party[currentsel]);
        }
        if (currentsel >= party.length && currentsel < max) currentsel = party.length - 1;
        if (currentsel < 0) currentsel = numsprites - 1;
        break;
      case Input.DOWN:
        if (currentsel >= max - 1) {
          currentsel += 1;
        } else {
          currentsel += 2;
          if (currentsel < max && !party[currentsel]) currentsel = max;
        }
        if (currentsel >= party.length && currentsel < max) {
          currentsel = max;
        } else if (currentsel >= numsprites) {
          currentsel = 0;
          if (currentsel >= party.length) currentsel = numsprites - 1;
        }
        break;
    }
    return currentsel;
  }

  /** pbHardRefresh (v20.1 Hotfixes version) */
  pbHardRefresh(): void {
    const oldtext: (string | null)[] = [];
    let lastselected = -1;
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      oldtext.push(this.panel(i).text as string | null);
      if (this.panel(i).selected) lastselected = i;
      this.panel(i).dispose();
    }
    if (lastselected >= this.party.length) lastselected = this.party.length - 1;
    if (lastselected < 0) lastselected = Settings.MAX_PARTY_SIZE;
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      if (this.party[i]) this.sprites[`pokemon${i}`] = new PokemonPartyPanel(this.party[i]!, i, this.viewport);
      else this.sprites[`pokemon${i}`] = new PokemonPartyBlankPanel(this.party[i], i, this.viewport);
      (this.panel(i) as PokemonPartyPanel).text = oldtext[i] ?? null;
    }
    this.pbSelect(lastselected);
  }

  pbRefresh(): void {
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) this.pbRefreshSingle(i);
  }

  pbRefreshSingle(i: number): void {
    const sprite = this.sprites[`pokemon${i}`];
    if (!sprite) return;
    if (sprite instanceof PokemonPartyPanel) sprite.pokemon = sprite.pokemon;
    else sprite.refresh();
  }

  update(): void {
    pbUpdateSpriteHash(this.sprites);
  }
}

//===============================================================================
// Pokémon party mechanics
//===============================================================================
/** A ruleset for pbPokemonMultipleEntryScreenEx (019_Utilities/... PokemonRuleSet). */
export interface PartyRuleset {
  number: number;
  hasValidTeam(party: Pokemon[]): boolean;
  isPokemonValid(pkmn: Pokemon): boolean;
  isValid(team: Pokemon[], error: string[]): boolean;
}

/** A :party_menu MenuHandlers hash: effect(screen, party, party_idx). */
interface PartyMenuHash extends MenuHandlerHash {
  effect: (screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number) => Promise<unknown>;
}

export class PokemonPartyScreen {
  constructor(readonly scene: PokemonParty_Scene, readonly party: Pokemon[]) {}

  async pbStartScene(helptext: string, _numBattlersOut: unknown, annotations: (string | null)[] | null = null): Promise<void> {
    await this.scene.pbStartScene(this.party, helptext, annotations);
  }

  async pbChoosePokemon(helptext: string | null = null): Promise<number> {
    if (helptext) this.scene.pbSetHelpText(helptext);
    return this.scene.pbChoosePokemon();
  }

  async pbPokemonGiveScreen(item: Id): Promise<boolean> {
    await this.scene.pbStartScene(this.party, _INTL("Give to which Pokémon?"));
    const pkmnid = await this.scene.pbChoosePokemon();
    let ret = false;
    if (pkmnid >= 0) ret = await pbGiveItemToPokemon(item, this.party[pkmnid]!, this, pkmnid);
    this.pbRefreshSingle(pkmnid);
    await this.scene.pbEndScene();
    return ret;
  }

  async pbPokemonGiveMailScreen(mailIndex: number): Promise<void> {
    await this.scene.pbStartScene(this.party, _INTL("Give to which Pokémon?"));
    const pkmnid = await this.scene.pbChoosePokemon();
    if (pkmnid >= 0) {
      const pkmn = this.party[pkmnid]!;
      const mailbox = (G.pokemonGlobal as unknown as { mailbox?: import("../../game/pokemon/Mail").Mail[] }).mailbox ?? [];
      if (pkmn.hasItem() || pkmn.mail) {
        await this.pbDisplay(_INTL("This Pokémon is holding an item. It can't hold mail."));
      } else if (pkmn.egg()) {
        await this.pbDisplay(_INTL("Eggs can't hold mail."));
      } else {
        await this.pbDisplay(_INTL("Mail was transferred from the Mailbox."));
        pkmn.mail = mailbox[mailIndex] ?? null;
        pkmn.item = pkmn.mail!.item;
        mailbox.splice(mailIndex, 1);
        this.pbRefreshSingle(pkmnid);
      }
    }
    await this.scene.pbEndScene();
  }

  async pbEndScene(): Promise<void> {
    await this.scene.pbEndScene();
  }

  pbUpdate(): void {
    this.scene.update();
  }

  pbHardRefresh(): void {
    this.scene.pbHardRefresh();
  }

  pbRefresh(): void {
    this.scene.pbRefresh();
  }

  pbRefreshSingle(i: number): void {
    this.scene.pbRefreshSingle(i);
  }

  async pbDisplay(text: string): Promise<void> {
    await this.scene.pbDisplay(text);
  }

  async pbConfirm(text: string): Promise<boolean> {
    return this.scene.pbDisplayConfirm(text);
  }

  async pbShowCommands(helptext: string, commands: ColorCommand[], index = 0): Promise<number> {
    return this.scene.pbShowCommands(helptext, commands, index);
  }

  /** Checks for identical species (unused) */
  pbCheckSpecies(array: Pokemon[]): boolean {
    for (let i = 0; i < array.length; i++) {
      for (let j = i + 1; j < array.length; j++) if (array[i]!.species === array[j]!.species) return false;
    }
    return true;
  }

  /** Checks for identical held items (unused) */
  pbCheckItems(array: Pokemon[]): boolean {
    for (let i = 0; i < array.length; i++) {
      if (!array[i]!.hasItem()) continue;
      for (let j = i + 1; j < array.length; j++) if (array[i]!.itemId === array[j]!.itemId) return false;
    }
    return true;
  }

  async pbSwitch(oldid: number, newid: number): Promise<void> {
    if (oldid !== newid) {
      await this.scene.pbSwitchBegin(oldid, newid);
      const tmp = this.party[oldid]!;
      this.party[oldid] = this.party[newid]!;
      this.party[newid] = tmp;
      await this.scene.pbSwitchEnd(oldid, newid);
    }
  }

  async pbChooseMove(pokemon: Pokemon, helptext: string, index = 0): Promise<number> {
    const movenames: string[] = [];
    for (const i of pokemon.moves) {
      if (!i || !i.id) continue;
      if (i.totalPp <= 0) movenames.push(_INTL("{1} (PP: ---)", i.name));
      else movenames.push(_INTL("{1} (PP: {2}/{3})", i.name, i.pp, i.totalPp));
    }
    return this.scene.pbShowCommands(helptext, movenames, index);
  }

  /** For after using an evolution stone */
  pbRefreshAnnotations(ableProc: (pkmn: Pokemon) => boolean): void {
    if (!this.scene.pbHasAnnotations()) return;
    const annot: string[] = [];
    for (const pkmn of this.party) annot.push(ableProc(pkmn) ? _INTL("ABLE") : _INTL("NOT ABLE"));
    this.scene.pbAnnotate(annot);
  }

  pbClearAnnotations(): void {
    this.scene.pbAnnotate(null);
  }

  async pbPokemonMultipleEntryScreenEx(ruleset: PartyRuleset): Promise<Pokemon[] | null> {
    const annot: string[] = [];
    const statuses: number[] = [];
    const ordinals = [_INTL("INELIGIBLE"), _INTL("NOT ENTERED"), _INTL("BANNED")];
    const positions = [_INTL("FIRST"), _INTL("SECOND"), _INTL("THIRD"), _INTL("FOURTH"),
      _INTL("FIFTH"), _INTL("SIXTH"), _INTL("SEVENTH"), _INTL("EIGHTH"),
      _INTL("NINTH"), _INTL("TENTH"), _INTL("ELEVENTH"), _INTL("TWELFTH")];
    for (let i = 0; i < Settings.MAX_PARTY_SIZE; i++) {
      if (i < positions.length) ordinals.push(positions[i]!);
      else ordinals.push(`${i + 1}th`);
    }
    if (!ruleset.hasValidTeam(this.party)) return null;
    let ret: Pokemon[] | null = null;
    let addedEntry = false;
    for (let i = 0; i < this.party.length; i++) {
      statuses[i] = ruleset.isPokemonValid(this.party[i]!) ? 1 : 2;
      annot[i] = ordinals[statuses[i]!]!;
    }
    await this.scene.pbStartScene(this.party, _INTL("Choose Pokémon and confirm."), annot, true);
    for (;;) {
      const realorder: number[] = [];
      for (let i = 0; i < this.party.length; i++) {
        for (let j = 0; j < this.party.length; j++) {
          if (statuses[j] === i + 3) {
            realorder.push(j);
            break;
          }
        }
      }
      for (let i = 0; i < realorder.length; i++) statuses[realorder[i]!] = i + 3;
      for (let i = 0; i < this.party.length; i++) annot[i] = ordinals[statuses[i]!]!;
      this.scene.pbAnnotate(annot);
      if (realorder.length === ruleset.number && addedEntry) this.scene.pbSelect(Settings.MAX_PARTY_SIZE);
      this.scene.pbSetHelpText(_INTL("Choose Pokémon and confirm."));
      const pkmnid = await this.scene.pbChoosePokemon();
      addedEntry = false;
      if (pkmnid === Settings.MAX_PARTY_SIZE) { // Confirm was chosen
        ret = [];
        for (const i of realorder) ret.push(this.party[i]!);
        const error: string[] = [];
        if (ruleset.isValid(ret, error)) break;
        await this.pbDisplay(error[0] ?? "");
        ret = null;
      }
      if (pkmnid < 0) break; // Cancelled
      let cmdEntry = -1;
      let cmdNoEntry = -1;
      let cmdSummary = -1;
      const commands: string[] = [];
      if ((statuses[pkmnid] || 0) === 1) commands[(cmdEntry = commands.length)] = _INTL("Entry");
      else if ((statuses[pkmnid] || 0) > 2) commands[(cmdNoEntry = commands.length)] = _INTL("No Entry");
      const pkmn = this.party[pkmnid];
      commands[(cmdSummary = commands.length)] = _INTL("Summary");
      commands[commands.length] = _INTL("Cancel");
      let command: number | undefined;
      if (pkmn) command = await this.scene.pbShowCommands(_INTL("Do what with {1}?", pkmn.name), commands);
      if (cmdEntry >= 0 && command === cmdEntry) {
        if (realorder.length >= ruleset.number && ruleset.number > 0) {
          await this.pbDisplay(_INTL("No more than {1} Pokémon may enter.", ruleset.number));
        } else {
          statuses[pkmnid] = realorder.length + 3;
          addedEntry = true;
          this.pbRefreshSingle(pkmnid);
        }
      } else if (cmdNoEntry >= 0 && command === cmdNoEntry) {
        statuses[pkmnid] = 1;
        this.pbRefreshSingle(pkmnid);
      } else if (cmdSummary >= 0 && command === cmdSummary) {
        await this.scene.pbSummary(pkmnid, false, () => this.scene.pbSetHelpText(chooseText(this.party)));
      }
    }
    await this.scene.pbEndScene();
    return ret;
  }

  async pbChooseAblePokemon(ableProc: (pkmn: Pokemon) => boolean, allowIneligible = false): Promise<number> {
    const annot: string[] = [];
    const eligibility: boolean[] = [];
    for (const pkmn of this.party) {
      const elig = ableProc(pkmn);
      eligibility.push(elig);
      annot.push(elig ? _INTL("ABLE") : _INTL("NOT ABLE"));
    }
    let ret = -1;
    await this.scene.pbStartScene(this.party, chooseText(this.party), annot);
    for (;;) {
      this.scene.pbSetHelpText(chooseText(this.party));
      const pkmnid = await this.scene.pbChoosePokemon();
      if (pkmnid < 0) break;
      if (!eligibility[pkmnid] && !allowIneligible) {
        await this.pbDisplay(_INTL("This Pokémon can't be chosen."));
      } else {
        ret = pkmnid;
        break;
      }
    }
    await this.scene.pbEndScene();
    return ret;
  }

  async pbChooseTradablePokemon(ableProc: (pkmn: Pokemon) => boolean, allowIneligible = false): Promise<number> {
    const annot: string[] = [];
    const eligibility: boolean[] = [];
    for (const pkmn of this.party) {
      let elig = ableProc(pkmn);
      if (pkmn.egg() || pkmn.shadowPokemon() || pkmn.cannotTrade) elig = false;
      eligibility.push(elig);
      annot.push(elig ? _INTL("ABLE") : _INTL("NOT ABLE"));
    }
    let ret = -1;
    await this.scene.pbStartScene(this.party, chooseText(this.party), annot);
    for (;;) {
      this.scene.pbSetHelpText(chooseText(this.party));
      const pkmnid = await this.scene.pbChoosePokemon();
      if (pkmnid < 0) break;
      if (!eligibility[pkmnid] && !allowIneligible) {
        await this.pbDisplay(_INTL("This Pokémon can't be chosen."));
      } else {
        ret = pkmnid;
        break;
      }
    }
    await this.scene.pbEndScene();
    return ret;
  }

  /** PokemonPartyScreen#pbPokemonDebug (020_Debug) isn't ported; used only with $DEBUG. */
  async pbPokemonDebug(pkmn: Pokemon, pkmnid: number): Promise<void> {
    await PartyHooks.pokemonDebug?.(this, pkmn, pkmnid);
  }

  /**
   * pbPokemonScreen as Essentials Deluxe rewrites it: the hidden move chosen
   * ([pokemon, move], for the pause menu to use) or null.
   */
  async pbPokemonScreen(): Promise<HiddenMoveChoice | null> {
    let ret: HiddenMoveChoice | null = null;
    let canAccessStorage = false;
    const mapId = G.gameMap?.mapId ?? 0;
    if ((player().hasBoxLink || G.bag.has("POKEMONBOXLINK")) &&
        !G.gameSwitches.get(Settings.DISABLE_BOX_LINK_SWITCH) &&
        !MapMetadata.tryGet(mapId)?.hasFlag("DisableBoxLink")) {
      canAccessStorage = true;
    }
    await this.scene.pbStartScene(this.party, chooseText(this.party), null, false, canAccessStorage);
    for (;;) {
      this.scene.pbSetHelpText(chooseText(this.party));
      let partyIdx: number | [number, number] = await this.scene.pbChoosePokemon(false, -1, 1);
      if ((typeof partyIdx === "number" && partyIdx < 0) || (Array.isArray(partyIdx) && partyIdx[1] < 0)) break;
      if (Array.isArray(partyIdx) && partyIdx[0] === 1) {
        this.scene.pbSetHelpText(_INTL("Move to where?"));
        const oldPartyIdx = partyIdx[1];
        const newIdx = await this.scene.pbChoosePokemon(true, -1, 2);
        if (newIdx >= 0 && newIdx !== oldPartyIdx) await this.pbSwitch(oldPartyIdx, newIdx);
        continue;
      }
      const idx = partyIdx as number;
      const pkmn = this.party[idx]!;
      const commandList: ColorCommand[] = [];
      const commands: ([string, PartyMenuHash] | number)[] = [];
      for (const [option, hash, name] of MenuHandlers.eachAvailable("party_menu", this, this.party, idx)) {
        if (option === "field_skill") commandList.push([name, 1]); // Improved Field Skills is installed
        else commandList.push(name);
        commands.push([option, hash as PartyMenuHash]);
      }
      commandList.push(_INTL("Cancel"));
      // (Improved Field Skills is installed, so field moves aren't inserted here.)
      const choice = await this.scene.pbShowCommands(_INTL("Do what with {1}?", pkmn.name), commandList);
      if (choice < 0 || choice >= commands.length) continue;
      const cmd = commands[choice]!;
      if (Array.isArray(cmd)) {
        if (cmd[0] === "field_skill" || cmd[0] === "birthsign_skill") {
          ret = ((await cmd[1].effect(this, this.party, idx)) as HiddenMoveChoice | null) ?? null;
          if (ret != null) break;
        } else {
          await cmd[1].effect(this, this.party, idx);
        }
      } else {
        // A field move's index; only with Improved Field Skills not installed.
        const move = pkmn.moves[cmd]!;
        if (move.id === "MILKDRINK" || move.id === "SOFTBOILED") {
          const amt = Math.max(Math.floor(pkmn.totalhp / 5), 1);
          if (pkmn.hp <= amt) {
            await this.pbDisplay(_INTL("Not enough HP..."));
            continue;
          }
          this.scene.pbSetHelpText(_INTL("Use on which Pokémon?"));
          const oldPartyIdx = idx;
          let target = idx;
          for (;;) {
            this.scene.pbPreSelect(oldPartyIdx);
            target = await this.scene.pbChoosePokemon(true, target);
            if (target < 0) break;
            const newpkmn = this.party[target]!;
            const movename = move.name;
            if (target === oldPartyIdx) {
              await this.pbDisplay(_INTL("{1} can't use {2} on itself!", pkmn.name, movename));
            } else if (newpkmn.egg()) {
              await this.pbDisplay(_INTL("{1} can't be used on an Egg!", movename));
            } else if (newpkmn.fainted() || newpkmn.hp === newpkmn.totalhp) {
              await this.pbDisplay(_INTL("{1} can't be used on that Pokémon.", movename));
            } else {
              pkmn.hp -= amt;
              const hpgain = pbItemRestoreHP(newpkmn, amt);
              await this.scene.pbDisplay(_INTL("{1}'s HP was restored by {2} points.", newpkmn.name, hpgain));
              this.pbRefresh();
            }
            if (pkmn.hp <= amt) break;
          }
          this.scene.pbSelect(oldPartyIdx);
          this.pbRefresh();
        } else if (FieldActions.canUseHiddenMoveAsync
          ? await FieldActions.canUseHiddenMoveAsync(pkmn, move.id, true)
          : FieldActions.canUseHiddenMove?.(pkmn, move.id, true)) {
          if (await FieldActions.confirmUseHiddenMove?.(pkmn, move.id)) {
            await this.scene.pbEndScene();
            if (move.id === "FLY") {
              const flyRet = (await MenuScreens.flyMap?.()) ?? null;
              if (flyRet) {
                flyTemp().flyDestination = flyRet;
                return [pkmn, move.id];
              }
              await this.scene.pbStartScene(this.party, chooseText(this.party));
              continue;
            }
            return [pkmn, move.id];
          }
        }
      }
    }
    await this.scene.pbEndScene();
    return ret;
  }
}

//===============================================================================
// Party screen menu commands.
// Note that field moves are inserted into the list of commands after the first
// command, which is usually "Summary". If playing in Debug mode, they are
// inserted after the second command instead, which is usually "Debug". See
// insert_index above if you need to change this.
//===============================================================================
type Screen = PokemonPartyScreen;

MenuHandlers.add("party_menu", "summary", {
  name: "Summary",
  order: 10,
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    await screen.scene.pbSummary(partyIdx, false, () => screen.scene.pbSetHelpText(chooseText(party)));
  },
});

MenuHandlers.add("party_menu", "debug", {
  name: "Debug",
  order: 20,
  condition: () => MenuFlags.DEBUG,
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    await screen.pbPokemonDebug(party[partyIdx]!, partyIdx);
  },
});

MenuHandlers.add("party_menu", "switch", {
  name: "Switch",
  order: 30,
  condition: (_screen, party) => (party as Pokemon[]).length > 1,
  effect: async (screen: Screen, _party: Pokemon[], partyIdx: number) => {
    screen.scene.pbSetHelpText(_INTL("Move to where?"));
    const oldPartyIdx = partyIdx;
    partyIdx = await screen.scene.pbChoosePokemon(true);
    if (partyIdx >= 0 && partyIdx !== oldPartyIdx) await screen.pbSwitch(oldPartyIdx, partyIdx);
  },
});

MenuHandlers.add("party_menu", "mail", {
  name: "Mail",
  order: 40,
  condition: (_screen, party, partyIdx) => {
    const p = (party as Pokemon[])[partyIdx as number]!;
    return !p.egg() && !!p.mail;
  },
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    const pkmn = party[partyIdx]!;
    const command = await screen.scene.pbShowCommands(_INTL("Do what with the mail?"),
      [_INTL("Read"), _INTL("Take"), _INTL("Cancel")]);
    switch (command) {
      case 0: // Read
        await pbFadeOutIn(async () => {
          await pbDisplayMail(pkmn.mail!, pkmn);
          screen.scene.pbSetHelpText(chooseText(party));
        });
        break;
      case 1: // Take
        if (await pbTakeItemFromPokemon(pkmn, screen)) screen.pbRefreshSingle(partyIdx);
        break;
    }
  },
});

MenuHandlers.add("party_menu", "item", {
  name: "Item",
  order: 50,
  condition: (_screen, party, partyIdx) => {
    const p = (party as Pokemon[])[partyIdx as number]!;
    return !p.egg() && !p.mail;
  },
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    // Get all commands
    const commandList: string[] = [];
    const commands: PartyMenuHash[] = [];
    for (const [, hash, name] of MenuHandlers.eachAvailable("party_menu_item", screen, party, partyIdx)) {
      commandList.push(name);
      commands.push(hash as PartyMenuHash);
    }
    commandList.push(_INTL("Cancel"));
    // Choose a menu option
    const choice = await screen.scene.pbShowCommands(_INTL("Do what with an item?"), commandList);
    if (choice < 0 || choice >= commands.length) return;
    await commands[choice]!.effect(screen, party, partyIdx);
  },
});

MenuHandlers.add("party_menu_item", "use", {
  name: "Use",
  order: 10,
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    const pkmn = party[partyIdx]!;
    const item = await screen.scene.pbUseItem(G.bag, pkmn, () => screen.scene.pbSetHelpText(chooseText(party)));
    if (!item) return;
    await pbUseItemOnPokemon(item, pkmn, screen);
    screen.pbRefreshSingle(partyIdx);
  },
});

MenuHandlers.add("party_menu_item", "give", {
  name: "Give",
  order: 20,
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    const pkmn = party[partyIdx]!;
    const item = await screen.scene.pbChooseItem(G.bag, () => screen.scene.pbSetHelpText(chooseText(party)));
    if (!item || !(await pbGiveItemToPokemon(item, pkmn, screen, partyIdx))) return;
    screen.pbRefreshSingle(partyIdx);
  },
});

MenuHandlers.add("party_menu_item", "take", {
  name: "Take",
  order: 30,
  condition: (_screen, party, partyIdx) => (party as Pokemon[])[partyIdx as number]!.hasItem(),
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    const pkmn = party[partyIdx]!;
    if (!(await pbTakeItemFromPokemon(pkmn, screen))) return;
    screen.pbRefreshSingle(partyIdx);
  },
});

MenuHandlers.add("party_menu_item", "move", {
  name: "Move",
  order: 40,
  condition: (_screen, party, partyIdx) => {
    const p = (party as Pokemon[])[partyIdx as number]!;
    return p.hasItem() && !p.item!.isMail();
  },
  effect: async (screen: Screen, party: Pokemon[], partyIdx: number) => {
    const pkmn = party[partyIdx]!;
    const item = pkmn.itemId!;
    const itemname = pkmn.item!.name;
    screen.scene.pbSetHelpText(_INTL("Move {1} to where?", itemname));
    const oldPartyIdx = partyIdx;
    let moved = false;
    for (;;) {
      screen.scene.pbPreSelect(oldPartyIdx);
      partyIdx = await screen.scene.pbChoosePokemon(true, partyIdx);
      if (partyIdx < 0) break;
      const newpkmn = party[partyIdx]!;
      if (partyIdx === oldPartyIdx) break;
      if (newpkmn.egg()) {
        await screen.pbDisplay(_INTL("Eggs can't hold items."));
        continue;
      } else if (!newpkmn.hasItem()) {
        newpkmn.item = item;
        pkmn.item = null;
        screen.scene.pbClearSwitching();
        screen.pbRefresh();
        await screen.pbDisplay(_INTL("{1} was given the {2} to hold.", newpkmn.name, itemname));
        moved = true;
        break;
      } else if (newpkmn.item!.isMail()) {
        await screen.pbDisplay(_INTL("{1}'s mail must be removed before giving it an item.", newpkmn.name));
        continue;
      }
      // New Pokémon is also holding an item; ask what to do with it
      const newitem = newpkmn.itemId!;
      const newitemname = newpkmn.item!.name;
      if (newitem === "LEFTOVERS") {
        await screen.pbDisplay(_INTL("{1} is already holding some {2}.\x01", newpkmn.name, newitemname));
      } else if (startsWithVowel(newitemname)) {
        await screen.pbDisplay(_INTL("{1} is already holding an {2}.\x01", newpkmn.name, newitemname));
      } else {
        await screen.pbDisplay(_INTL("{1} is already holding a {2}.\x01", newpkmn.name, newitemname));
      }
      if (!(await screen.pbConfirm(_INTL("Would you like to switch the two items?")))) continue;
      newpkmn.item = item;
      pkmn.item = newitem;
      screen.scene.pbClearSwitching();
      screen.pbRefresh();
      await screen.pbDisplay(_INTL("{1} was given the {2} to hold.", newpkmn.name, itemname));
      await screen.pbDisplay(_INTL("{1} was given the {2} to hold.", pkmn.name, newitemname));
      moved = true;
      break;
    }
    if (!moved) screen.scene.pbSelect(oldPartyIdx);
  },
});

//===============================================================================
// Open the party screen
//===============================================================================
/** pbPokemonScreen */
export async function pbPokemonScreen(): Promise<void> {
  await pbFadeOutIn(async () => {
    const sscene = new PokemonParty_Scene();
    const sscreen = new PokemonPartyScreen(sscene, player().party);
    await sscreen.pbPokemonScreen();
  });
}

//===============================================================================
// Choose a Pokémon in the party
//===============================================================================
/** pbSet(id, value) (019_Utilities/001_Utilities.rb) */
function pbSet(id: number | null | undefined, value: unknown): void {
  if (id == null || id < 0) return;
  G.gameVariables.set(id, value);
  if (G.gameMap) (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
}

/**
 * pbChoosePokemon(variableNumber, nameVarNumber, ableProc, allowIneligible):
 * Choose a Pokémon/egg from the party. Stores result in variable
 * _variableNumber_ and the chosen Pokémon's name in variable _nameVarNumber_;
 * result is -1 if no Pokémon was chosen.
 */
export async function pbChoosePokemon(variableNumber: number, nameVarNumber: number, ableProc: ((pkmn: Pokemon) => boolean) | null = null, allowIneligible = false): Promise<void> {
  let chosen = 0;
  await pbFadeOutIn(async () => {
    const scene = new PokemonParty_Scene();
    const screen = new PokemonPartyScreen(scene, player().party);
    if (ableProc) {
      chosen = await screen.pbChooseAblePokemon(ableProc, allowIneligible);
    } else {
      await screen.pbStartScene(_INTL("Choose a Pokémon."), false);
      chosen = await screen.pbChoosePokemon();
      await screen.pbEndScene();
    }
  });
  pbSet(variableNumber, chosen);
  pbSet(nameVarNumber, chosen >= 0 ? player().party[chosen]!.name : "");
}

export async function pbChooseNonEggPokemon(variableNumber: number, nameVarNumber: number): Promise<void> {
  await pbChoosePokemon(variableNumber, nameVarNumber, (pkmn) => !pkmn.egg());
}

export async function pbChooseAblePokemon(variableNumber: number, nameVarNumber: number): Promise<void> {
  await pbChoosePokemon(variableNumber, nameVarNumber, (pkmn) => !pkmn.egg() && pkmn.hp > 0);
}

/** Same as pbChoosePokemon, but prevents choosing an egg or a Shadow Pokémon. */
export async function pbChooseTradablePokemon(variableNumber: number, nameVarNumber: number, ableProc: ((pkmn: Pokemon) => boolean) | null = null, allowIneligible = false): Promise<void> {
  let chosen = 0;
  await pbFadeOutIn(async () => {
    const scene = new PokemonParty_Scene();
    const screen = new PokemonPartyScreen(scene, player().party);
    if (ableProc) {
      chosen = await screen.pbChooseTradablePokemon(ableProc, allowIneligible);
    } else {
      await screen.pbStartScene(_INTL("Choose a Pokémon."), false);
      chosen = await screen.pbChoosePokemon();
      await screen.pbEndScene();
    }
  });
  pbSet(variableNumber, chosen);
  pbSet(nameVarNumber, chosen >= 0 ? player().party[chosen]!.name : "");
}

export async function pbChoosePokemonForTrade(variableNumber: number, nameVarNumber: number, wanted: Id): Promise<void> {
  wanted = Species.get(wanted).species;
  await pbChooseTradablePokemon(variableNumber, nameVarNumber, (pkmn) => pkmn.species === wanted);
}
