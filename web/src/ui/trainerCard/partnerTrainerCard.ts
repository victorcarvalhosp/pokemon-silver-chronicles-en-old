// Port of Plugins/Partner Trainer Card (plugin 17 in load order): the
// partner's card (a copy of Mr. Gela's HGSS card scene with partner data
// from game variables) and the partner management functions events call
// (pbIncreasePartnerHearts and friends). No event or menu opens the card
// itself in this game; it's reachable from the dev page.

import { assetExists } from "../../core/assets";
import { TrainerType } from "../../data/gameData/trainerType";
import { G } from "../../game/globals";
import { pbSEPlay } from "../../game/GameSystem";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundPlane, type AnimatedPlane } from "../planes";
import { pbResolveBitmap, preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { ElapsedFrames, FrameWaiter } from "../pokegear/frameClock";
import { pbCommonEvent } from "../pokegear/phone";

/** Switch that determines partner gender: ON = BOYFRIEND, OFF = GIRLFRIEND */
export const PARTNER_GENDER_SWITCH = 141;
// Variables for partner data
export const PARTNER_NAME_VAR_BOY = 77;
export const PARTNER_NAME_VAR_GIRL = 76;
export const PARTNER_LEVEL_VAR = 79;
export const PARTNER_MOOD_VAR = 80;
export const PARTNER_HEART_COUNT_VAR = 85;
/** 0 = Fire, 1 = Water, 2 = Grass */
export const PARTNER_STARTER_TYPE_VAR = 88;
/** Common event to call when partner levels up */
export const PARTNER_LEVEL_UP_COMMON_EVENT = 27;

const DIR = "Graphics/UI/Partner Trainer Card/";
const STARTER_TYPES = ["fire", "water", "grass"] as const;

/** $game_variables[id] || default (Ruby's || only replaces nil/false; unset variables read 0). */
function gameVar(id: number, def: unknown): unknown {
  const v = G.gameVariables.get(id);
  return v == null || v === false ? def : v;
}

const num = (v: unknown) => Number(v) || 0;

export class PokemonPartnerTrainerCard_Scene {
  partnerLevel: unknown = 1;
  heartCount: unknown = 0;
  starterType: string = "fire";
  mood: unknown = 0;
  private front = true;
  private flip = false;
  private viewport!: Viewport;
  private sprites: Sprites = {};
  private overlay: BitmapSprite["bitmap"] = null;
  private overlay2: BitmapSprite["bitmap"] = null;
  private bgClock = new ElapsedFrames();
  private waiter = new FrameWaiter();

  private s<T>(key: string): T { return this.sprites[key] as T; }

  /** Waits x frames */
  async wait(frames: number): Promise<void> {
    await this.waiter.wait(frames);
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
    const bg = this.sprites.bg as AnimatedPlane | undefined;
    if (bg) {
      const n = this.bgClock.take();
      bg.ox -= 2 * n;
      bg.oy -= 2 * n;
    }
  }

  private partnerTrainerType(): string {
    return G.gameSwitches.get(PARTNER_GENDER_SWITCH) ? "BOYFRIEND" : "GIRLFRIEND";
  }

  async pbStartScene(): Promise<void> {
    const trainerFile = TrainerType.frontSpriteFilename(this.partnerTrainerType(), (p) => (assetExists(p) ? p : null));
    const isBoy = G.gameSwitches.get(PARTNER_GENDER_SWITCH);
    const gender = isBoy ? "boy" : "girl";
    const files = ["Graphics/Pictures/Trainer Card/bg", `${DIR}card_0`, `${DIR}card_0b`, "Graphics/UI/PartnerTrainer Card/overlay_0"];
    for (const t of STARTER_TYPES) for (let l = 0; l <= 10; l++) files.push(`${DIR}team_${gender}_${t}_${l}`);
    for (let h = 0; h <= 10; h++) files.push(`${DIR}heartCount_${h}`);
    for (let m = 0; m <= 5; m++) files.push(`${DIR}mood_${gender}_${m}`);
    if (trainerFile) files.push(trainerFile);
    await preloadBitmaps(files.filter((f) => assetExists(f)));
    this.front = true;
    this.flip = false;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    // Initialize partner data from game variables (with defaults)
    this.partnerLevel = gameVar(PARTNER_LEVEL_VAR, 1);
    this.heartCount = gameVar(PARTNER_HEART_COUNT_VAR, 0);
    const starterTypeVal = num(gameVar(PARTNER_STARTER_TYPE_VAR, 0));
    this.starterType = STARTER_TYPES[starterTypeVal] ?? "fire";
    this.mood = gameVar(PARTNER_MOOD_VAR, 0);
    addBackgroundPlane(this.sprites, "bg", "Trainer Card/bg", this.viewport);
    const card = new IconSprite(128 * 2, 96 * 2, this.viewport);
    this.sprites.card = card;
    // TODO (in the plugin): Set partner-specific card bitmap
    card.setBitmapFile(`${DIR}card_0`);
    card.ox = Math.floor(card.bitmap!.width / 2);
    card.oy = Math.floor(card.bitmap!.height / 2);
    const bg = this.s<AnimatedPlane>("bg");
    bg.zoomX = 2;
    bg.zoomY = 2;
    bg.ox += 6;
    bg.oy -= 26;
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites.overlay = overlay;
    pbSetSystemFont(overlay.bitmap!);
    const overlay2 = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites.overlay2 = overlay2;
    pbSetSystemFont(overlay2.bitmap!);
    overlay.x = 128 * 2;
    overlay.y = 96 * 2;
    overlay.ox = Math.floor(overlay.bitmap!.width / 2);
    overlay.oy = Math.floor(overlay.bitmap!.height / 2);
    const help = new IconSprite(0, Graphics.height - 48, this.viewport);
    this.sprites.help_overlay = help;
    help.setBitmapFile("Graphics/UI/PartnerTrainer Card/overlay_0"); // (no such folder: a blank 32x32)
    help.zoomX = 2;
    help.zoomY = 2;
    // Position trainer sprite on the left side of the card
    const trainer = new IconSprite(90, 280, this.viewport);
    this.sprites.trainer = trainer;
    trainer.setBitmapFile(trainerFile);
    trainer.zoomX = 2;
    trainer.zoomY = 2;
    trainer.ox = Math.floor((trainer.bitmap?.width ?? 0) / 2);
    trainer.oy = trainer.bitmap?.height ?? 0;
    // Partner name / level sprites (drawn as text on the overlay instead)
    for (const [key, x] of [["partner_name", 120], ["partner_level", 200]] as const) {
      const spr = new IconSprite(x, 180, this.viewport);
      spr.zoomX = 2;
      spr.zoomY = 2;
      spr.visible = false;
      this.sprites[key] = spr;
    }
    // Heart count image (bottom), mood image (top right corner), Pokémon team image
    this.sprites.heart_count = new IconSprite(0, 0, this.viewport);
    this.sprites.mood = new IconSprite(0, 0, this.viewport);
    this.sprites.team = new IconSprite(0, 0, this.viewport);
    await this.pbDrawTrainerCardFront();
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async flip1(): Promise<void> {
    const overlay = this.s<BitmapSprite>("overlay");
    const card = this.s<IconSprite>("card");
    const trainer = this.s<IconSprite>("trainer");
    for (let i = 0; i < 7; i++) {
      overlay.zoomY = 1.03;
      card.zoomY = 2.06;
      overlay.zoomX -= 0.1;
      trainer.zoomX -= 0.2;
      trainer.x -= 12;
      card.zoomX -= 0.15;
      this.pbUpdate();
      await this.wait(1);
    }
    this.pbUpdate();
  }

  async flip2(): Promise<void> {
    const overlay = this.s<BitmapSprite>("overlay");
    const card = this.s<IconSprite>("card");
    const trainer = this.s<IconSprite>("trainer");
    for (let i = 0; i < 7; i++) {
      overlay.zoomX += 0.1;
      trainer.zoomX += 0.2;
      trainer.x += 12;
      card.zoomX += 0.15;
      overlay.zoomY = 1;
      card.zoomY = 1;
      this.pbUpdate();
      await this.wait(1);
    }
    overlay.zoomX = 1;
    this.pbUpdate();
  }

  private drawHelp(): void {
    const textPositions: TextPosition[] = [
      [_INTL("Press the Action Button to flip the card."), 16, 70 + 280, 0, new Color(216, 216, 216), new Color(80, 80, 80)],
    ];
    this.s<BitmapSprite>("overlay2").z += 20;
    pbDrawTextPositions(this.overlay2!, textPositions);
  }

  async pbDrawTrainerCardFront(): Promise<void> {
    if (this.flip === true) await this.flip1();
    this.front = true;
    this.s<IconSprite>("trainer").visible = true;
    // Show partner-specific images when showing front of card
    for (const key of ["team", "heart_count", "mood"]) {
      const spr = this.s<IconSprite>(key);
      if (spr.bitmap) spr.visible = true;
    }
    this.s<IconSprite>("card").setBitmapFile(`${DIR}card_0`);
    this.overlay = this.s<BitmapSprite>("overlay").bitmap;
    this.overlay2 = this.s<BitmapSprite>("overlay2").bitmap;
    this.overlay!.clear();
    this.overlay2!.clear();
    const base = new Color(72, 72, 72);
    const shadow = new Color(160, 160, 160);
    // (Partner star/score colours are a TODO in the plugin.)
    // Get partner-specific data from game variables
    const isBoy = G.gameSwitches.get(PARTNER_GENDER_SWITCH);
    const partnerNameVar = isBoy ? PARTNER_NAME_VAR_BOY : PARTNER_NAME_VAR_GIRL;
    const partnerName = String(gameVar(partnerNameVar, "Partner"));
    const partnerLevel = gameVar(PARTNER_LEVEL_VAR, 1);
    const heartCount = gameVar(PARTNER_HEART_COUNT_VAR, 0);
    const mood = Math.min(Math.max(num(gameVar(PARTNER_MOOD_VAR, 1)), 1), 5); // Clamp mood between 1 and 5
    const starterType = STARTER_TYPES[num(gameVar(PARTNER_STARTER_TYPE_VAR, 0))] ?? "fire";
    const gender = isBoy ? "boy" : "girl";
    // Pokémon team image
    const team = this.s<IconSprite>("team");
    const teamPath = `${DIR}team_${gender}_${starterType}_${num(partnerLevel)}`;
    if (pbResolveBitmap(teamPath)) {
      team.setBitmapFile(teamPath);
      team.x = 153;
      team.y = 138;
      team.visible = true;
    } else {
      team.visible = false;
    }
    // Heart count image
    const hearts = this.s<IconSprite>("heart_count");
    const heartCountPath = `${DIR}heartCount_${num(heartCount)}`;
    if (pbResolveBitmap(heartCountPath)) {
      hearts.setBitmapFile(heartCountPath);
      hearts.x = 128 * 2 - hearts.bitmap!.width + 200 + 50 - 14 + 3 + 1;
      hearts.y = Graphics.height - hearts.bitmap!.height - 20 - 20 + 10 - 2;
      hearts.visible = true;
    } else {
      hearts.visible = false;
    }
    // Mood image (top right corner) - gender-specific
    const moodSprite = this.s<IconSprite>("mood");
    const moodPath = `${DIR}mood_${gender}_${mood}`;
    if (pbResolveBitmap(moodPath)) {
      moodSprite.setBitmapFile(moodPath);
      const displayedWidth = moodSprite.bitmap!.width * moodSprite.zoomX;
      moodSprite.x = Graphics.width - displayedWidth - 20;
      moodSprite.y = 20;
      moodSprite.visible = true;
    } else {
      moodSprite.visible = false;
    }
    // Level text to the right of the name
    const nameWidth = this.overlay!.textSize(partnerName).width;
    const levelText = _INTL("Lv.{1}", Math.trunc(num(partnerLevel)));
    const levelX = 80 + nameWidth + 10;
    const textPositions: TextPosition[] = [
      [partnerName, 80, 82, 0, base, shadow],
      [levelText, levelX, 82, 0, base, shadow],
    ];
    this.s<BitmapSprite>("overlay").z += 10;
    pbDrawTextPositions(this.overlay!, textPositions);
    this.drawHelp();
    if (this.flip === true) await this.flip2();
  }

  async pbDrawTrainerCardBack(): Promise<void> {
    this.pbUpdate();
    this.flip = true;
    await this.flip1();
    this.front = false;
    this.s<IconSprite>("trainer").visible = false;
    // Hide partner-specific images when showing back of card
    for (const key of ["team", "heart_count", "mood"]) this.s<IconSprite>(key).visible = false;
    this.s<IconSprite>("card").setBitmapFile(`${DIR}card_0b`); // (no such file: blank)
    this.overlay = this.s<BitmapSprite>("overlay").bitmap;
    this.overlay2 = this.s<BitmapSprite>("overlay2").bitmap;
    this.overlay!.clear();
    this.overlay2!.clear();
    // (Back-of-card text and badges are TODOs in the plugin.)
    const textPositions: TextPosition[] = [];
    this.s<BitmapSprite>("overlay").z += 20;
    pbDrawTextPositions(this.overlay!, textPositions);
    this.drawHelp();
    const imagepos: ImagePosition[] = [];
    pbDrawImagePositions(this.overlay!, imagepos);
    await this.flip2();
  }

  async pbTrainerCard(): Promise<void> {
    pbSEPlay("GUI trainer card open");
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.C)) {
        pbSEPlay("GUI trainer card flip");
        if (this.front === true) await this.pbDrawTrainerCardBack();
        else if (this.front === false) await this.pbDrawTrainerCardFront();
        await this.wait(3);
      }
      if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      }
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class PokemonPartnerTrainerCardScreen {
  constructor(private scene: PokemonPartnerTrainerCard_Scene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbTrainerCard();
    await this.scene.pbEndScene();
  }
}

//===============================================================================
// Partner management functions - accessible from RPG Maker Scripts
//===============================================================================
export async function pbIncreasePartnerHearts(amount = 1): Promise<void> {
  if (amount <= 0) return;
  const currentHearts = num(gameVar(PARTNER_HEART_COUNT_VAR, 0));
  let newHearts = currentHearts + amount;
  // Check if we need to level up
  while (newHearts >= 10) {
    const currentLevel = num(gameVar(PARTNER_LEVEL_VAR, 1));
    G.gameVariables.set(PARTNER_LEVEL_VAR, currentLevel + 1);
    newHearts -= 10;
    // Call common event when leveling up
    if (PARTNER_LEVEL_UP_COMMON_EVENT > 0) await pbCommonEvent(PARTNER_LEVEL_UP_COMMON_EVENT);
  }
  G.gameVariables.set(PARTNER_HEART_COUNT_VAR, newHearts);
}

export function pbDecreasePartnerHearts(amount = 1): void {
  if (amount <= 0) return;
  const currentHearts = num(gameVar(PARTNER_HEART_COUNT_VAR, 0));
  G.gameVariables.set(PARTNER_HEART_COUNT_VAR, Math.max(currentHearts - amount, 0));
}

export function pbGetPartnerLevel(): unknown {
  return gameVar(PARTNER_LEVEL_VAR, 1);
}

export function pbGetPartnerHeartCount(): unknown {
  return gameVar(PARTNER_HEART_COUNT_VAR, 0);
}

export async function pbSetPartnerLevel(level: number): Promise<void> {
  G.gameVariables.set(PARTNER_LEVEL_VAR, Math.max(level, 1));
  // Call common event when leveling up
  if (PARTNER_LEVEL_UP_COMMON_EVENT > 0) await pbCommonEvent(PARTNER_LEVEL_UP_COMMON_EVENT);
}

export function pbSetPartnerHeartCount(count: number): void {
  G.gameVariables.set(PARTNER_HEART_COUNT_VAR, Math.max(count, 0));
}

export function pbSetPartnerMood(mood: number): void {
  G.gameVariables.set(PARTNER_MOOD_VAR, Math.min(Math.max(mood, 0), 5));
}

export function pbIncreasePartnerMood(amount = 1): void {
  if (amount <= 0) return;
  const currentMood = num(gameVar(PARTNER_MOOD_VAR, 0));
  G.gameVariables.set(PARTNER_MOOD_VAR, Math.min(Math.max(currentMood + amount, 0), 5));
}

export function pbDecreasePartnerMood(amount = 1): void {
  if (amount <= 0) return;
  const currentMood = num(gameVar(PARTNER_MOOD_VAR, 0));
  G.gameVariables.set(PARTNER_MOOD_VAR, Math.min(Math.max(currentMood - amount, 0), 5));
}
