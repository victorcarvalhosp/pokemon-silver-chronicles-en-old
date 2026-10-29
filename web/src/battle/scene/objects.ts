// Port of Data/Scripts/011_Battle/004_Scene/006_Battle_Scene_Objects.rb:
// Battle::Scene::PokemonDataBox, AbilitySplashBar, BattlerSprite and
// BattlerShadowSprite, with the plugin changes this game loads, in plugin
// load order (Data/PluginScripts.rxdata):
//   26 Generation 8 Pack: Pokémon sprites are EBDXBitmapWrappers (scaled,
//      animated strips), via Essentials Deluxe's sprite_bitmap_from_pokemon.
//   29 Essentials Deluxe: PokemonDataBox#initializeDataBoxGraphic / x= / y= /
//      refresh ([000] Databoxes.rb), #draw_special_form_icon ([000] Mega
//      Evolution.rb), BattlerSprite/BattlerShadowSprite #setPokemonBitmap /
//      #pbSetPosition with Dynamax metrics ([000] Species Files.rb) and
//      Sprite#applyEffects ([000] Battle_Scene.rb).
//   30 ZUD Mechanics: PokemonDataBox draw_* aliases (Ultra Burst / Dynamax
//      icons; Max Raid databoxes), Sprite#applyDynamax / #unDynamax, Dynamax
//      shadows (shadow_filename).
// Not ported: Max Raid boss databoxes (draw_raid_shield/_counters, raid name,
// status, shiny and owned icons; ZUD [005] Scene_PokemonDataBox.rb:8-169),
// the Dynamax colour pattern (mkxp-z Sprite#pattern, ZUD [000] Sprite.rb:18-24).
//
// Timing: Ruby scales these by Graphics.frame_rate (40); here they are scaled
// by the 60 Hz tick (FRAME_RATE = 60), so they last the same in seconds.

import { Settings } from "../../data/gameData/settings";
import { SpeciesMetrics } from "../../data/gameData/speciesMetrics";
import { Status } from "../../data/gameData/status";
import { FRAME_RATE } from "../../game/GameCharacter";
import { pbSEPlay, pbSEStop } from "../../game/GameSystem";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { pbDrawImagePositions, pbDrawTextPositions, type TextPosition } from "../../ui/drawText";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { isBitmapPreloaded, preloadBitmap } from "../../ui/rpgCache";
import { BitmapSprite } from "../../ui/SpriteWrapper";
import { EBDXBitmapWrapper, pokemonBitmapRequest, SpeciesFiles, type BitmapRequest } from "../../ui/sprites/pokemonSprite";
import { PBEffects } from "../other/PBEffects";
import { shadowFilenameFromPokemon } from "./sceneFiles";
import { SpriteProxy } from "./SpriteProxy";
import type { SceneBattler } from "./types";

/** Battle::Scene.pbBattlerPosition (defined with the scene's constants in BattleScene.ts). */
let battlerPosition: (index: number, sideSize?: number) => [number, number] = () => [0, 0];
export function setBattlerPositionFunction(fn: (index: number, sideSize?: number) => [number, number]): void {
  battlerPosition = fn;
}

type DynamaxSet = "none" | "dmax" | "gmax" | null | undefined;

//===============================================================================
// Data box for regular battles
//===============================================================================
export class PokemonDataBox extends SpriteProxy {
  /** Time in seconds to fully fill the Exp bar (from empty). */
  static readonly EXP_BAR_FILL_TIME = 1.75;
  /** Maximum time in seconds to make a change to the HP bar. */
  static readonly HP_BAR_CHANGE_TIME = 1.0;
  static readonly STATUS_ICON_HEIGHT = 16;
  static readonly NAME_BASE_COLOR = new Color(72, 72, 72);
  static readonly NAME_SHADOW_COLOR = new Color(184, 184, 184);
  static readonly MALE_BASE_COLOR = new Color(48, 96, 216);
  static readonly MALE_SHADOW_COLOR = PokemonDataBox.NAME_SHADOW_COLOR;
  static readonly FEMALE_BASE_COLOR = new Color(248, 88, 40);
  static readonly FEMALE_SHADOW_COLOR = PokemonDataBox.NAME_SHADOW_COLOR;
  static readonly QUARTER_ANIM_PERIOD = Math.floor((FRAME_RATE * 3) / 20);

  private _battler: SceneBattler;
  selected = 0;
  private _animatingHP = false;
  private _animatingExp = false;
  private sprites: Record<string, Sprite> = {};
  private spriteX = 0;
  private spriteY = 0;
  private spriteBaseX = 0;
  private showHP = false; // Specifically, show the HP numbers
  private showExp = false; // Specifically, show the Exp bar
  private expFlash = 0;
  private raidBoss = false;
  private databoxBitmap: AnimatedBitmap | null = null;
  private numbersBitmap!: AnimatedBitmap;
  private hpBarBitmap!: AnimatedBitmap;
  private expBarBitmap!: AnimatedBitmap;
  private hpNumbers!: BitmapSprite;
  private hpBar!: Sprite;
  private expBar!: Sprite;
  private contents!: Bitmap;
  private currentHP = 0;
  private endHP = 0;
  private hpIncPerFrame = 0;
  private currentExp = 0;
  private endExp = 0;
  private rangeExp: number | null = null;
  private expIncPerFrame = 0;

  constructor(battler: SceneBattler, sideSize: number, viewport: Viewport | null = null) {
    super(viewport);
    this._battler = battler;
    this.initializeDataBoxGraphic(sideSize);
    this.initializeOtherGraphics(viewport);
    this.refresh();
  }

  get battler(): SceneBattler { return this._battler; }
  set battler(b: SceneBattler) {
    this._battler = b;
    this.visible = !!this._battler && !this._battler.fainted();
  }
  get animatingHP(): boolean { return this._animatingHP; }
  get animatingExp(): boolean { return this._animatingExp; }

  /** Essentials Deluxe's version (Focus Meter and Modular Battler Scene aren't installed). */
  initializeDataBoxGraphic(sideSize: number): void {
    const onPlayerSide = this._battler.index % 2 === 0;
    this.raidBoss = !!this._battler.effects?.[PBEffects.MaxRaidBoss];
    const path = "Graphics/Pictures/Battle/";
    const playerNormal = path + "databox_normal";
    const playerThin = path + "databox_thin";
    const enemyNormal = path + "databox_normal_foe";
    const enemyThin = path + "databox_thin_foe";
    const playerData = sideSize === 1 ? playerNormal : playerThin;
    let enemyData = sideSize === 1 ? enemyNormal : enemyThin;
    if (this.raidBoss) enemyData = "Graphics/Plugins/ZUD/Battle/databox_raid";
    const bgFilename = [playerData, enemyData][this._battler.index % 2]!;
    this.databoxBitmap?.dispose();
    this.databoxBitmap = new AnimatedBitmap(bgFilename);
    if (onPlayerSide) {
      if (sideSize === 1) this.showHP = true;
      if (sideSize === 1) this.showExp = true;
      this.spriteX = 512 - 244;
      this.spriteY = 384 - 192;
      this.spriteBaseX = 34;
    } else if (this.raidBoss) {
      this.spriteX = this.spriteY = this.spriteBaseX = 0;
    } else {
      this.spriteX = -16;
      this.spriteY = 36;
      this.spriteBaseX = 16;
    }
    const i = this._battler.index;
    switch (sideSize) {
      case 2:
        this.spriteX += [-12, 12, 0, 0][i]!;
        this.spriteY += [-20, -34, 34, 20][i]!;
        break;
      case 3:
        this.spriteX += [-12, 12, -6, 6, 0, 0][i]!;
        this.spriteY += [-42, -46, 4, 0, 50, 46][i]!;
        break;
      case 4:
        this.spriteX += [0, 0, 0, 0, 0, 0, 0, 0][i]!;
        this.spriteY += [-88, -46, -42, 0, 4, 46, 50, 92][i]!;
        break;
      case 5:
        this.spriteX += [0, 0, 0, 0, 0, 0, 0, 0, 0, 0][i]!;
        this.spriteY += [-134, -46, -88, 0, -42, 46, 4, 92, 50, 138][i]!;
        break;
    }
  }

  initializeOtherGraphics(viewport: Viewport | null): void {
    // Create other bitmaps
    this.numbersBitmap = new AnimatedBitmap("Graphics/Pictures/Battle/icon_numbers");
    this.hpBarBitmap = new AnimatedBitmap("Graphics/Pictures/Battle/overlay_hp");
    this.expBarBitmap = new AnimatedBitmap("Graphics/Pictures/Battle/overlay_exp");
    // Create sprite to draw HP numbers on
    this.hpNumbers = new BitmapSprite(124, 16, viewport);
    this.sprites.hpNumbers = this.hpNumbers;
    // Create sprite wrapper that displays HP bar
    this.hpBar = new Sprite(viewport);
    this.hpBar.setBitmap(this.hpBarBitmap.bitmap);
    this.hpBar.srcRect.height = Math.floor(this.hpBarBitmap.height / 3);
    this.sprites.hpBar = this.hpBar;
    // Create sprite wrapper that displays Exp bar
    this.expBar = new Sprite(viewport);
    this.expBar.setBitmap(this.expBarBitmap.bitmap);
    this.sprites.expBar = this.expBar;
    // Create sprite wrapper that displays everything except the above
    this.contents = new Bitmap(this.databoxBitmap!.width, this.databoxBitmap!.height);
    this.bitmap = this.contents;
    this.visible = false;
    this.z = 150 + Math.floor(this._battler.index / 2) * 5;
    pbSetSystemFont(this.bitmap);
  }

  override dispose(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.databoxBitmap?.dispose();
    this.numbersBitmap.dispose();
    this.hpBarBitmap.dispose();
    this.expBarBitmap.dispose();
    this.contents.dispose();
    super.dispose();
  }

  override get x(): number { return super.x; }
  override set x(value: number) {
    super.x = value;
    this.hpBar.x = value + this.spriteBaseX + 102;
    this.expBar.x = value + this.spriteBaseX + 6;
    this.hpNumbers.x = value + this.spriteBaseX + 80;
    if (this.raidBoss) this.hpBar.x = value + 20;
  }

  override get y(): number { return super.y; }
  override set y(value: number) {
    super.y = value;
    this.hpBar.y = value + 40;
    this.expBar.y = value + 74;
    this.hpNumbers.y = value + 52;
    if (this.raidBoss) this.hpBar.y = value + 34;
  }

  override get z(): number { return super.z; }
  override set z(value: number) {
    super.z = value;
    this.hpBar.z = value + 1;
    this.expBar.z = value + 1;
    this.hpNumbers.z = value + 2;
  }

  override get opacity(): number { return super.opacity; }
  override set opacity(value: number) {
    super.opacity = value;
    for (const s of Object.values(this.sprites)) if (!s.isDisposed()) s.opacity = this.opacity;
  }

  override get visible(): boolean { return super.visible; }
  override set visible(value: boolean) {
    super.visible = value;
    for (const s of Object.values(this.sprites)) if (!s.isDisposed()) s.visible = value;
    this.expBar.visible = value && this.showExp;
  }

  override get color(): Color { return super.color; }
  override set color(value: Color) {
    super.color = value;
    for (const s of Object.values(this.sprites)) if (!s.isDisposed()) s.color = value.clone();
  }

  get hp(): number {
    return this._animatingHP ? this.currentHP : this._battler.hp;
  }

  expFraction(): number {
    if (this.rangeExp === 0) return 0.0;
    return this._animatingExp ? this.currentExp / this.rangeExp! : this._battler.pokemon!.expFraction();
  }

  animateHP(oldHP: number, newHP: number, rangeHP: number): void {
    this.currentHP = oldHP;
    this.endHP = newHP;
    // NOTE: A change in HP takes the same amount of time to animate, no matter
    //       how big a change it is.
    this.hpIncPerFrame = Math.abs(newHP - oldHP) / (PokemonDataBox.HP_BAR_CHANGE_TIME * FRAME_RATE);
    // minInc is the smallest amount that HP is allowed to change per frame.
    // This avoids a tiny change in HP still taking HP_BAR_CHANGE_TIME seconds.
    const minInc = (rangeHP * 4) / (this.hpBarBitmap.width * PokemonDataBox.HP_BAR_CHANGE_TIME * FRAME_RATE);
    if (this.hpIncPerFrame < minInc) this.hpIncPerFrame = minInc;
    this._animatingHP = true;
  }

  animateExp(oldExp: number, newExp: number, rangeExp: number): void {
    if (rangeExp === 0) return;
    this.currentExp = oldExp;
    this.endExp = newExp;
    this.rangeExp = rangeExp;
    // NOTE: Filling the Exp bar from empty to full takes EXP_BAR_FILL_TIME
    //       seconds no matter what. Filling half of it takes half as long, etc.
    this.expIncPerFrame = rangeExp / (PokemonDataBox.EXP_BAR_FILL_TIME * FRAME_RATE);
    this._animatingExp = true;
    if (this.showExp) pbSEPlay("Pkmn exp gain");
  }

  pbDrawNumber(number: number, btmp: Bitmap, startX: number, startY: number, align = 0): void {
    // -1 means draw the / character
    const n = number === -1 ? [10] : String(Math.trunc(number)).split("").map(Number);
    const charWidth = Math.floor(this.numbersBitmap.width / 11);
    const charHeight = this.numbersBitmap.height;
    if (align === 1) startX -= charWidth * n.length;
    for (const i of n) {
      btmp.blt(startX, startY, this.numbersBitmap.bitmap, new Rect(i * charWidth, 0, charWidth, charHeight));
      startX += charWidth;
    }
  }

  drawBackground(): void {
    const b = this.databoxBitmap!;
    this.bitmap!.blt(0, 0, b.bitmap, new Rect(0, 0, b.width, b.height));
  }

  drawName(): void {
    const nameWidth = this.bitmap!.textSize(this._battler.name).width;
    let nameOffset = 0;
    if (nameWidth > 116) nameOffset = nameWidth - 116;
    pbDrawTextPositions(this.bitmap!, [
      [this._battler.name, this.spriteBaseX + 8 - nameOffset, 12, false, PokemonDataBox.NAME_BASE_COLOR, PokemonDataBox.NAME_SHADOW_COLOR],
    ]);
  }

  drawLevel(): void {
    // "Lv" graphic
    pbDrawImagePositions(this.bitmap!, [["Graphics/Pictures/Battle/overlay_lv", this.spriteBaseX + 140, 16]]);
    // Level number
    this.pbDrawNumber(this._battler.level, this.bitmap!, this.spriteBaseX + 162, 16);
  }

  drawGender(): void {
    const gender = this._battler.displayGender();
    if (gender !== 0 && gender !== 1) return;
    const genderText = gender === 0 ? _INTL("♂") : _INTL("♀");
    const baseColor = gender === 0 ? PokemonDataBox.MALE_BASE_COLOR : PokemonDataBox.FEMALE_BASE_COLOR;
    const shadowColor = gender === 0 ? PokemonDataBox.MALE_SHADOW_COLOR : PokemonDataBox.FEMALE_SHADOW_COLOR;
    pbDrawTextPositions(this.bitmap!, [[genderText, this.spriteBaseX + 126, 12, false, baseColor, shadowColor]]);
  }

  drawStatus(): void {
    if (this._battler.status === "NONE") return;
    let s: number;
    if (this._battler.status === "POISON" && this._battler.statusCount > 0) { // Badly poisoned
      s = Status.count() - 1;
    } else {
      s = Status.get(this._battler.status).iconPosition;
    }
    if (s < 0) return;
    pbDrawImagePositions(this.bitmap!, [["Graphics/Pictures/Battle/icon_statuses", this.spriteBaseX + 24, 36,
      0, s * PokemonDataBox.STATUS_ICON_HEIGHT, -1, PokemonDataBox.STATUS_ICON_HEIGHT]]);
  }

  drawShinyIcon(): void {
    if (!this._battler.shiny()) return;
    const shinyX = this._battler.opposes(0) ? 206 : -6; // Foe's/player's
    pbDrawImagePositions(this.bitmap!, [["Graphics/Pictures/shiny", this.spriteBaseX + shinyX, 36]]);
  }

  /** ZUD Mechanics' alias (Ultra Burst / Dynamax icons) over Essentials Deluxe's version (Mega / Primal icons). */
  drawSpecialFormIcon(): void {
    if (this.raidBoss) return;
    const specialX = this._battler.opposes(0) ? 208 : -28;
    if (this._battler.ultra?.()) {
      pbDrawImagePositions(this.bitmap!, [["Graphics/Plugins/ZUD/Battle/icon_ultra", this.spriteBaseX + specialX, 4]]);
      return;
    } else if (this._battler.dynamax?.()) {
      pbDrawImagePositions(this.bitmap!, [["Graphics/Plugins/ZUD/Battle/icon_dynamax", this.spriteBaseX + specialX, 4]]);
      return;
    }
    // Essentials Deluxe ([000] Mega Evolution.rb)
    let filename: string | null = null;
    let ypos = 4;
    if (this._battler.mega()) {
      filename = "Graphics/Plugins/Essentials Deluxe/icon_mega";
      ypos = 6;
    } else if (this._battler.primal()) {
      if (this._battler.isSpecies("GROUDON")) filename = "Graphics/Pictures/Battle/icon_primal_Groudon";
      else if (this._battler.isSpecies("KYOGRE")) filename = "Graphics/Pictures/Battle/icon_primal_Kyogre";
    }
    if (filename) pbDrawImagePositions(this.bitmap!, [[filename, this.spriteBaseX + specialX, ypos]]);
  }

  drawOwnedIcon(): void {
    if (!this._battler.owned() || !this._battler.opposes(0)) return; // Draw for foe Pokémon only
    pbDrawImagePositions(this.bitmap!, [["Graphics/Pictures/Battle/icon_own", this.spriteBaseX + 8, 36]]);
  }

  refresh(): void {
    this.bitmap!.clear();
    if (!this._battler.pokemon) return;
    this.drawBackground();
    if (!this.raidBoss) this.drawName();
    if (!this.raidBoss) this.drawLevel();
    if (!this.raidBoss) this.drawGender();
    this.drawStatus();
    this.drawShinyIcon();
    this.drawSpecialFormIcon();
    this.drawOwnedIcon();
    this.refreshHP();
    this.refreshExp();
  }

  refreshHP(): void {
    this.hpNumbers.bitmap!.clear();
    if (!this._battler.pokemon) return;
    // Show HP numbers
    if (this.showHP) {
      this.pbDrawNumber(this.hp, this.hpNumbers.bitmap!, 54, 2, 1);
      this.pbDrawNumber(-1, this.hpNumbers.bitmap!, 54, 2); // / char
      this.pbDrawNumber(this._battler.totalhp, this.hpNumbers.bitmap!, 70, 2);
    }
    // Resize HP bar
    let w = 0;
    if (this.hp > 0) {
      w = (this.hpBarBitmap.width * this.hp) / this._battler.totalhp;
      if (w < 1) w = 1;
      // NOTE: The line below snaps the bar's width to the nearest 2 pixels, to
      //       fit in with the rest of the graphics which are doubled in size.
      w = Math.round(w / 2.0) * 2;
    }
    this.hpBar.srcRect.width = w;
    let hpColor = 0; // Green bar
    if (this.hp <= Math.floor(this._battler.totalhp / 2)) hpColor = 1; // Yellow bar
    if (this.hp <= Math.floor(this._battler.totalhp / 4)) hpColor = 2; // Red bar
    this.hpBar.srcRect.y = Math.floor((hpColor * this.hpBarBitmap.height) / 3);
  }

  refreshExp(): void {
    if (!this.showExp) return;
    let w = this.expFraction() * this.expBarBitmap.width;
    // NOTE: The line below snaps the bar's width to the nearest 2 pixels, to
    //       fit in with the rest of the graphics which are doubled in size.
    w = Math.round(w / 2) * 2;
    this.expBar.srcRect.width = w;
  }

  updateHPAnimation(): void {
    if (!this._animatingHP) return;
    if (this.currentHP < this.endHP) { // Gaining HP
      this.currentHP += this.hpIncPerFrame;
      if (this.currentHP >= this.endHP) this.currentHP = this.endHP;
    } else if (this.currentHP > this.endHP) { // Losing HP
      this.currentHP -= this.hpIncPerFrame;
      if (this.currentHP <= this.endHP) this.currentHP = this.endHP;
    }
    // Refresh the HP bar/numbers
    this.refreshHP();
    if (this.currentHP === this.endHP) this._animatingHP = false;
  }

  updateExpAnimation(): void {
    if (!this._animatingExp) return;
    if (!this.showExp) { // Not showing the Exp bar, no need to waste time animating it
      this.currentExp = this.endExp;
      this._animatingExp = false;
      return;
    }
    if (this.currentExp < this.endExp) { // Gaining Exp
      this.currentExp += this.expIncPerFrame;
      if (this.currentExp >= this.endExp) this.currentExp = this.endExp;
    } else if (this.currentExp > this.endExp) { // Losing Exp
      this.currentExp -= this.expIncPerFrame;
      if (this.currentExp <= this.endExp) this.currentExp = this.endExp;
    }
    // Refresh the Exp bar
    this.refreshExp();
    if (this.currentExp !== this.endExp) return; // Exp bar still has more to animate
    // Exp bar is completely filled, level up with a flash and sound effect
    if (this.currentExp >= this.rangeExp!) {
      if (this.expFlash === 0) {
        pbSEStop();
        this.expFlash = Math.floor(FRAME_RATE / 5);
        pbSEPlay("Pkmn exp full");
        // Sprite#flash counts frames; ours takes seconds.
        this.flash(new Color(64, 200, 248, 192), this.expFlash / FRAME_RATE);
        for (const s of Object.values(this.sprites)) {
          if (!s.isDisposed()) s.flash(new Color(64, 200, 248, 192), this.expFlash / FRAME_RATE);
        }
      } else {
        this.expFlash -= 1;
        if (this.expFlash === 0) this._animatingExp = false;
      }
    } else {
      pbSEStop();
      // Exp bar has finished filling, end animation
      this._animatingExp = false;
    }
  }

  updatePositions(frameCounter: number): void {
    this.x = this.spriteX;
    this.y = this.spriteY;
    // Data box bobbing while Pokémon is selected
    if (this.selected === 1 || this.selected === 2) { // Choosing commands/targeted or damaged
      switch (Math.floor(frameCounter / PokemonDataBox.QUARTER_ANIM_PERIOD)) {
        case 1: this.y = this.spriteY - 2; break;
        case 3: this.y = this.spriteY + 2; break;
      }
    }
  }

  override update(frameCounter = 0): void {
    super.update();
    // Animate HP bar
    this.updateHPAnimation();
    // Animate Exp bar
    this.updateExpAnimation();
    // Update coordinates of the data box
    this.updatePositions(frameCounter);
    pbUpdateSpriteHash(this.sprites as never);
  }
}

//===============================================================================
// Splash bar to announce a triggered ability
//===============================================================================
export class AbilitySplashBar extends SpriteProxy {
  static readonly TEXT_BASE_COLOR = new Color(0, 0, 0);
  static readonly TEXT_SHADOW_COLOR = new Color(248, 248, 248);

  private side: number;
  private _battler: SceneBattler | null = null;
  private bgBitmap: AnimatedBitmap;
  private bgSprite: Sprite;
  private contents: Bitmap;

  constructor(side: number, viewport: Viewport | null = null) {
    super(viewport);
    this.side = side;
    // Create sprite wrapper that displays background graphic
    this.bgBitmap = new AnimatedBitmap("Graphics/Pictures/Battle/ability_bar");
    this.bgSprite = new Sprite(viewport);
    this.bgSprite.setBitmap(this.bgBitmap.bitmap);
    this.bgSprite.srcRect.y = side === 0 ? 0 : Math.floor(this.bgBitmap.height / 2);
    this.bgSprite.srcRect.height = Math.floor(this.bgBitmap.height / 2);
    // Create bitmap that displays the text
    this.contents = new Bitmap(this.bgBitmap.width, Math.floor(this.bgBitmap.height / 2));
    this.bitmap = this.contents;
    pbSetSystemFont(this.bitmap);
    // Position the bar
    this.x = side === 0 ? -Math.floor(512 / 2) : 512;
    this.y = side === 0 ? 180 : 80;
    this.z = 120;
    this.visible = false;
  }

  override dispose(): void {
    this.bgSprite.dispose();
    this.bgBitmap.dispose();
    this.contents.dispose();
    super.dispose();
  }

  override get x(): number { return super.x; }
  override set x(value: number) { super.x = value; this.bgSprite.x = value; }
  override get y(): number { return super.y; }
  override set y(value: number) { super.y = value; this.bgSprite.y = value; }
  override get z(): number { return super.z; }
  override set z(value: number) { super.z = value; this.bgSprite.z = value - 1; }
  override get opacity(): number { return super.opacity; }
  override set opacity(value: number) { super.opacity = value; this.bgSprite.opacity = this.opacity; }
  override get visible(): boolean { return super.visible; }
  override set visible(value: boolean) { super.visible = value; this.bgSprite.visible = value; }
  override get color(): Color { return super.color; }
  override set color(value: Color) { super.color = value; this.bgSprite.color = value.clone(); }

  get battler(): SceneBattler | null { return this._battler; }
  set battler(value: SceneBattler | null) {
    this._battler = value;
    this.refresh();
  }

  refresh(): void {
    this.bitmap!.clear();
    if (!this._battler) return;
    const textPos: TextPosition[] = [];
    const textX = this.side === 0 ? 10 : this.bitmap!.width - 8;
    // Draw Pokémon's name
    textPos.push([_INTL("{1}'s", this._battler.name), textX, 8, this.side === 1,
      AbilitySplashBar.TEXT_BASE_COLOR, AbilitySplashBar.TEXT_SHADOW_COLOR, true]);
    // Draw Pokémon's ability
    textPos.push([this._battler.abilityName(), textX, 38, this.side === 1,
      AbilitySplashBar.TEXT_BASE_COLOR, AbilitySplashBar.TEXT_SHADOW_COLOR, true]);
    pbDrawTextPositions(this.bitmap!, textPos);
  }

  override update(): void {
    super.update();
    this.bgSprite.update();
  }
}

//===============================================================================
// Pokémon sprite (used in battle)
//===============================================================================
/** The bitmap file a battler sprite shows for these setPokemonBitmap params (preload it first). */
export function battlerBitmapRequest(pkmn: Pokemon, back = false, species: string | null = null, setDmax: DynamaxSet = null): BitmapRequest {
  return pokemonBitmapRequest(pkmn, back, species, setDmax ?? null);
}

export class BattlerSprite extends SpriteProxy {
  static readonly QUARTER_ANIM_PERIOD = Math.floor((FRAME_RATE * 3) / 20);
  static readonly SIXTH_ANIM_PERIOD = Math.floor((FRAME_RATE * 2) / 20);

  pkmn: Pokemon | null = null;
  index: number;
  /** 0 = not selected, 1 = choosing action bobbing for this Pokémon, 2 = flashing when targeted */
  selected = 0;
  readonly sideSize: number;
  /** Essentials Deluxe: 0 = normal, 1 = Dynamax, 2 = Gigantamax metrics/sprite. */
  dynamax = 0;
  private battleAnimations: unknown[];
  private updating = false;
  private spriteX = 0; // Actual x coordinate
  private spriteY = 0; // Actual y coordinate
  private spriteXExtra = 0; // Offset due to "bobbing" animation
  private spriteYExtra = 0; // Offset due to "bobbing" animation
  private spriteVisible = false;
  private _iconBitmap: EBDXBitmapWrapper | null = null;
  /** Bumped by every setPokemonBitmap; a load that finishes after a newer one is dropped. */
  private request = 0;

  constructor(viewport: Viewport | null, sideSize: number, index: number, battleAnimations: unknown[]) {
    super(viewport);
    this.sideSize = sideSize;
    this.index = index;
    this.battleAnimations = battleAnimations;
    this.visible = false;
  }

  override dispose(): void {
    this._iconBitmap?.dispose();
    this._iconBitmap = null;
    this.request++;
    if (!this.isDisposed()) this.setBitmap(null);
    super.dispose();
  }

  override get x(): number { return this.spriteX; }
  override set x(value: number) {
    this.spriteX = value;
    super.x = value + this.spriteXExtra;
  }

  override get y(): number { return this.spriteY; }
  override set y(value: number) {
    this.spriteY = value;
    super.y = value + this.spriteYExtra;
  }

  override get width(): number { return this.bitmap ? this.bitmap.width : 0; }
  override get height(): number { return this.bitmap ? this.bitmap.height : 0; }

  override get visible(): boolean { return super.visible; }
  override set visible(value: boolean) {
    if (!this.updating) this.spriteVisible = value; // For selection/targeting flashing
    super.visible = value;
  }

  /** Set sprite's origin to bottom middle */
  pbSetOrigin(): void {
    if (!this._iconBitmap) return;
    this.ox = Math.floor(this._iconBitmap.width / 2);
    this.oy = this._iconBitmap.height;
  }

  /** Essentials Deluxe's version (Dynamax metrics). */
  pbSetPosition(): void {
    if (!this._iconBitmap) return;
    this.pbSetOrigin();
    if (this.index % 2 === 0) {
      this.z = 50 + Math.floor((5 * this.index) / 2);
    } else {
      this.z = 50 - Math.floor((5 * (this.index + 1)) / 2);
    }
    // Set original position
    const p = battlerPosition(this.index, this.sideSize);
    this.spriteX = p[0];
    this.spriteY = p[1];
    // Apply metrics
    const sd = this.pkmn!.speciesData();
    SpeciesMetrics.getSpeciesForm(sd.species, sd.form)!.applyMetricsToSprite(this, this.index, false, this.dynamax);
  }

  /**
   * setPokemonBitmap(pkmn, back = false, species = nil, setDmax = nil)
   * (Essentials Deluxe). Ruby loads the bitmap synchronously; here the sprite
   * is set at once if its graphic is preloaded, otherwise once it has loaded
   * (the returned promise resolves then).
   */
  setPokemonBitmap(pkmn: Pokemon, back = false, species: string | null = null, setDmax: DynamaxSet = null): Promise<void> {
    this.pkmn = pkmn;
    switch (setDmax) {
      case "none": this.dynamax = 0; break;
      case "dmax": this.dynamax = 1; break;
      case "gmax": this.dynamax = 2; break;
      default: this.dynamax = pkmn.gmax ? 2 : pkmn.dynamax ? 1 : 0;
    }
    this._iconBitmap?.dispose();
    this._iconBitmap = null;
    const req = battlerBitmapRequest(pkmn, back, species, setDmax);
    const token = ++this.request;
    const apply = () => {
      if (token !== this.request || this.isDisposed()) return;
      this._iconBitmap = req ? new EBDXBitmapWrapper(req.file, req.scale) : null;
      this.setBitmap(this._iconBitmap ? this._iconBitmap.bitmap : null);
      this.pbSetPosition();
    };
    if (!req || isBitmapPreloaded(req.file)) {
      apply();
      return Promise.resolve();
    }
    this.setBitmap(null);
    return preloadBitmap(req.file).then(apply);
  }

  /** Sprite#applyEffects(pokemon) (Essentials Deluxe; Dynamax from ZUD Mechanics, no Terastal plugin). */
  applyEffects(battler: SceneBattler | Pokemon | null): void {
    if (!battler) return;
    this.resetEffects();
    const dynamax = "index" in battler ? !!battler.dynamax?.() : battler.dynamax;
    if (dynamax) this.applyDynamax();
  }

  /** ZUD's Sprite#applyDynamax: double size (SHOW_DYNAMAX_SIZE); the colour pattern isn't supported. */
  applyDynamax(): void {
    if (Settings.SHOW_DYNAMAX_SIZE) this.zoomX = this.zoomY = 2;
  }

  /** ZUD's Sprite#unDynamax */
  unDynamax(): void {
    if (this.zoomX > 1) this.zoomX = 1;
    if (this.zoomY > 1) this.zoomY = 1;
  }

  resetEffects(): void {
    this.unDynamax();
  }

  /**
   * This method plays the battle entrance animation of a Pokémon. By default
   * this is just playing the Pokémon's cry, but you can expand on it. The
   * recommendation is to create a PictureEx animation and push it into
   * the @battleAnimations array.
   */
  pbPlayIntroAnimation(_pictureEx: unknown = null): void {
    if (this.pkmn) SpeciesFiles.playPokemonCry(this.pkmn);
  }

  override update(frameCounter = 0): void {
    if (!this._iconBitmap) return;
    this.updating = true;
    // Update bitmap
    this._iconBitmap.update();
    this.bitmap = this._iconBitmap.bitmap;
    // Pokémon sprite bobbing while Pokémon is selected
    this.spriteYExtra = 0;
    if (this.selected === 1) { // When choosing commands for this Pokémon
      switch (Math.floor(frameCounter / BattlerSprite.QUARTER_ANIM_PERIOD)) {
        case 1: this.spriteYExtra = 2; break;
        case 3: this.spriteYExtra = -2; break;
      }
    }
    this.x = this.x;
    this.y = this.y;
    this.visible = this.spriteVisible;
    // Pokémon sprite blinking when targeted
    if (this.selected === 2 && this.spriteVisible) {
      switch (Math.floor(frameCounter / BattlerSprite.SIXTH_ANIM_PERIOD)) {
        case 2: case 5: this.visible = false; break;
        default: this.visible = true;
      }
    }
    this.updating = false;
  }
}

//===============================================================================
// Shadow sprite for Pokémon (used in battle)
//===============================================================================
export class BattlerShadowSprite extends Sprite {
  pkmn: Pokemon | null = null;
  index: number;
  selected = 0;
  /** Essentials Deluxe: 0 = normal, 1 = Dynamax, 2 = Gigantamax metrics. */
  dynamax = 0;
  private sideSize: number;
  private _iconBitmap: AnimatedBitmap | null = null;

  constructor(viewport: Viewport | null, sideSize: number, index: number) {
    super(viewport);
    this.sideSize = sideSize;
    this.index = index;
    this.visible = false;
  }

  override dispose(): void {
    this._iconBitmap?.dispose();
    this._iconBitmap = null;
    if (!this.isDisposed()) this.setBitmap(null);
    super.dispose();
  }

  override get width(): number { return this.bitmap ? this.bitmap.width : 0; }
  override get height(): number { return this.bitmap ? this.bitmap.height : 0; }

  /** Set sprite's origin to centre */
  pbSetOrigin(): void {
    if (!this._iconBitmap) return;
    this.ox = Math.floor(this._iconBitmap.width / 2);
    this.oy = Math.floor(this._iconBitmap.height / 2);
  }

  pbSetPosition(): void {
    if (!this._iconBitmap) return;
    this.pbSetOrigin();
    this.z = 3;
    // Set original position
    const p = battlerPosition(this.index, this.sideSize);
    this.x = p[0];
    this.y = p[1];
    // Apply metrics
    const sd = this.pkmn!.speciesData();
    SpeciesMetrics.getSpeciesForm(sd.species, sd.form)!.applyMetricsToSprite(this, this.index, true, this.dynamax);
  }

  /** setPokemonBitmap(pkmn, setDmax = nil) (Essentials Deluxe; ZUD's Dynamax shadows). */
  setPokemonBitmap(pkmn: Pokemon, setDmax: DynamaxSet = null): Promise<void> {
    this.pkmn = pkmn;
    switch (setDmax) {
      case "none": this.dynamax = 0; break;
      case "dmax": this.dynamax = 1; break;
      case "gmax": this.dynamax = 2; break;
      default: this.dynamax = pkmn.gmax ? 2 : pkmn.dynamax ? 1 : 0;
    }
    this._iconBitmap?.dispose();
    this._iconBitmap = null;
    const file = shadowFilenameFromPokemon(pkmn, this.dynamax > 0);
    const apply = () => {
      if (this.isDisposed() || this.pkmn !== pkmn) return;
      this._iconBitmap = file ? new AnimatedBitmap(file) : null;
      this.setBitmap(this._iconBitmap ? this._iconBitmap.bitmap : null);
      this.pbSetPosition();
    };
    if (!file || isBitmapPreloaded(file)) {
      apply();
      return Promise.resolve();
    }
    return preloadBitmap(file).then(apply);
  }

  override update(_frameCounter = 0): void {
    if (!this._iconBitmap) return;
    // Update bitmap
    this._iconBitmap.update();
    if (this.bitmap !== this._iconBitmap.bitmap) this.setBitmap(this._iconBitmap.bitmap);
  }
}

/** Images the data boxes, ability bars and shadows draw (for preloading). */
export const OBJECT_GRAPHICS: string[] = [
  "Graphics/Pictures/Battle/databox_normal", "Graphics/Pictures/Battle/databox_normal_foe",
  "Graphics/Pictures/Battle/databox_thin", "Graphics/Pictures/Battle/databox_thin_foe",
  "Graphics/Pictures/Battle/icon_numbers", "Graphics/Pictures/Battle/overlay_hp", "Graphics/Pictures/Battle/overlay_exp",
  "Graphics/Pictures/Battle/overlay_lv", "Graphics/Pictures/Battle/icon_statuses", "Graphics/Pictures/shiny",
  "Graphics/Pictures/Battle/icon_own", "Graphics/Pictures/Battle/icon_primal_Groudon", "Graphics/Pictures/Battle/icon_primal_Kyogre",
  "Graphics/Plugins/Essentials Deluxe/icon_mega", "Graphics/Plugins/ZUD/Battle/icon_ultra", "Graphics/Plugins/ZUD/Battle/icon_dynamax",
  "Graphics/Pictures/Battle/ability_bar",
];
