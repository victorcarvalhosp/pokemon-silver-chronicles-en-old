// Port of Plugins/Mr. Gela's HGSS Trainer Card Scene (plugin 19 in load
// order), which replaces 016_UI/012_UI_TrainerCard.rb's
// PokemonTrainerCard_Scene and PokemonTrainerCardScreen outright. Its Player
// fields (score, stars, halloffame, tclass) are in game/trainer/Player.ts; its
// HallOfFame_Scene#writeTrainerData change belongs to the Hall of Fame port.
//
// The card flip and the waits count raw 40 fps frames (wait(n) is
// `n.times { Graphics.update }`), as does the background scrolling 2 px per
// pbUpdate; they're timed in original frames here.

import { TrainerType } from "../../data/gameData/trainerType";
import { pbGetTimeNow } from "../../game/dayNight";
import { G } from "../../game/globals";
import { pbSEPlay } from "../../game/GameSystem";
import type { Player } from "../../game/trainer/Player";
import { assetExists } from "../../core/assets";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbGetGoldString } from "../messages";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundPlane, type AnimatedPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { ElapsedFrames, FrameWaiter } from "../pokegear/frameClock";

const CARD = "Graphics/UI/Trainer Card/";

/** pbGetAbbrevMonthName(month) (012_Overworld/003_Overworld_Time.rb), month 1-12. */
export function pbGetAbbrevMonthName(month: number): string {
  return [_INTL("Jan."), _INTL("Feb."), _INTL("Mar."), _INTL("Apr."), _INTL("May"), _INTL("Jun."),
    _INTL("Jul."), _INTL("Aug."), _INTL("Sep."), _INTL("Oct."), _INTL("Nov."), _INTL("Dec.")][month - 1]!;
}

/** A Ruby Time read back from the save: a Date, seconds since the epoch, or an ISO string. */
export function toDate(t: unknown): Date {
  if (t instanceof Date) return t;
  if (typeof t === "number") return new Date(t * 1000);
  return new Date(String(t));
}

/** $PokemonGlobal.startTime, set to now if missing (stored as seconds, like Player#birthdate reads it). */
export function pokemonGlobalStartTime(): Date {
  const g = G.pokemonGlobal as unknown as { startTime?: unknown };
  if (!g.startTime) g.startTime = Math.floor(pbGetTimeNow().getTime() / 1000);
  return toDate(g.startTime);
}

/** sprintf("%02d", n) */
export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, "0");

const resolve = (path: string) => (assetExists(path) ? path : null);

export class PokemonTrainerCard_Scene {
  private front = true;
  private flip = false;
  private viewport!: Viewport;
  private sprites: Sprites = {};
  private overlay!: BitmapSprite["bitmap"];
  private overlay2!: BitmapSprite["bitmap"];
  private tx = 0;
  private ty = 0;
  private bgClock = new ElapsedFrames();
  private waiter = new FrameWaiter();

  private get player(): Player { return G.player as unknown as Player; }

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

  async pbStartScene(): Promise<void> {
    const player = this.player;
    const trainerFile = TrainerType.playerFrontSpriteFilename(player.trainerType, resolve, player.outfit);
    await preloadBitmaps([
      "Graphics/Pictures/Trainer Card/bg", `${CARD}card_${player.stars}`, `${CARD}card_${player.stars}b`,
      `${CARD}overlay_0`, `${CARD}badges0`, `${CARD}badges1`, ...(trainerFile ? [trainerFile] : []),
    ]);
    this.front = true;
    this.flip = false;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    addBackgroundPlane(this.sprites, "bg", "Trainer Card/bg", this.viewport);
    const card = new IconSprite(128 * 2, 96 * 2, this.viewport);
    this.sprites.card = card;
    card.setBitmapFile(`${CARD}card_${player.stars}`);
    card.zoomX = 2; card.zoomY = 2;
    card.ox = Math.floor(card.bitmap!.width / 2);
    card.oy = Math.floor(card.bitmap!.height / 2);
    const bg = this.s<AnimatedPlane>("bg");
    bg.zoomX = 2; bg.zoomY = 2;
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
    help.setBitmapFile(`${CARD}overlay_0`);
    help.zoomX = 2; help.zoomY = 2;
    const trainer = new IconSprite(318, 106, this.viewport);
    this.sprites.trainer = trainer;
    trainer.setBitmapFile(trainerFile);
    trainer.zoomX = 2;
    trainer.zoomY = 2;
    const tw = trainer.bitmap?.width ?? 0;
    const th = trainer.bitmap?.height ?? 0;
    trainer.x -= Math.floor((tw - 128) / 2) + 36 - 4;
    trainer.y -= (th - 128) + 80 + 4;
    trainer.x += 85;
    trainer.y += 20;
    this.tx = trainer.x;
    this.ty = trainer.y;
    trainer.ox = Math.floor(tw / 2);
    await this.pbDrawTrainerCardFront();
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async flip1(): Promise<void> {
    // "Flip"
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
    // UNDO "Flip"
    const overlay = this.s<BitmapSprite>("overlay");
    const card = this.s<IconSprite>("card");
    const trainer = this.s<IconSprite>("trainer");
    for (let i = 0; i < 7; i++) {
      overlay.zoomX += 0.1;
      trainer.zoomX += 0.2;
      trainer.x += 12;
      card.zoomX += 0.15;
      overlay.zoomY = 1;
      card.zoomY = 2;
      this.pbUpdate();
      await this.wait(1);
    }
    this.pbUpdate();
  }

  private textColors(): [Color, Color] {
    let base = new Color(72, 72, 72);
    let shadow = new Color(160, 160, 160);
    const baseGold = new Color(255, 198, 74);
    const shadowGold = new Color(123, 107, 74);
    if (this.player.stars === 5) {
      base = baseGold;
      shadow = shadowGold;
    }
    return [base, shadow];
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
    const player = this.player;
    this.front = true;
    this.s<IconSprite>("trainer").visible = true;
    this.s<IconSprite>("card").setBitmapFile(`${CARD}card_${player.stars}`);
    this.overlay = this.s<BitmapSprite>("overlay").bitmap;
    this.overlay2 = this.s<BitmapSprite>("overlay2").bitmap;
    this.overlay!.clear();
    this.overlay2!.clear();
    const [base, shadow] = this.textColors();
    // totalsec = Graphics.frame_count / Graphics.frame_rate
    const totalsec = Math.floor(G.stats?.playTime ?? 0);
    const hour = Math.floor(totalsec / 60 / 60);
    const min = Math.floor(totalsec / 60) % 60;
    const time = `${pad2(hour)}:${pad2(min)}`;
    const start = pokemonGlobalStartTime();
    const starttime = _INTL("{1} {2},{3}", pbGetAbbrevMonthName(start.getMonth() + 1), start.getDate(), start.getFullYear());
    const textPositions: TextPosition[] = [
      [_INTL("NAME"), 332 - 60, 70 - 16, 0, base, shadow],
      [player.name, 302 + 89 * 2, 70 - 16, 1, base, shadow],
      [_INTL("ID No."), 32, 70 - 16, 0, base, shadow],
      [String(player.publicID(player.id)).padStart(5, "0"), 468 - 122 * 2, 70 - 16, 1, base, shadow],
      [_INTL("MONEY"), 32, 118 - 16, 0, base, shadow],
      [pbGetGoldString(), 302 + 2, 118 - 16, 1, base, shadow],
      [_INTL("POKÉDEX"), 32, 118 + 32, 0, base, shadow],
      [`${player.pokedex.ownedCount()}/${player.pokedex.seenCount()}`, 302 + 2, 118 + 32, 1, base, shadow],
      [_INTL("BADGES"), 32, 214, 0, base, shadow],
      [String(player.badgeCount()), 302 + 2, 214, 1, base, shadow],
      [_INTL("TIME"), 32, 214 + 48, 0, base, shadow],
      [time, 302 + 88 * 2, 214 + 48, 1, base, shadow],
      [_INTL("ADVENTURE STARTED"), 32, 262 + 32, 0, base, shadow],
      [starttime, 302 + 89 * 2, 262 + 32, 1, base, shadow],
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
    const player = this.player;
    this.front = false;
    this.s<IconSprite>("trainer").visible = false;
    this.s<IconSprite>("card").setBitmapFile(`${CARD}card_${player.stars}b`);
    this.overlay = this.s<BitmapSprite>("overlay").bitmap;
    this.overlay2 = this.s<BitmapSprite>("overlay2").bitmap;
    this.overlay!.clear();
    this.overlay2!.clear();
    // (The plugin works out the Hall of Fame debut date/time here, but the
    // lines that would draw it, and every other back-of-card text, are
    // commented out.)
    const textPositions: TextPosition[] = [];
    this.s<BitmapSprite>("overlay").z += 20;
    pbDrawTextPositions(this.overlay!, textPositions);
    this.drawHelp();
    // Draw Badges on overlay (doesn't support animations, might support .gif)
    const imagepos: ImagePosition[] = [];
    // Draw Region 0 badges
    let x = 64 - 28;
    for (let i = 0; i < 8; i++) {
      if (player.badges[i + 0 * 8]) imagepos.push([`${CARD}badges0`, x, 104 * 2, i * 48, 0 * 48, 48, 48]);
      x += 48 + 8;
    }
    // Draw Region 1 badges
    x = 64 - 28;
    for (let i = 0; i < 8; i++) {
      if (player.badges[i + 1 * 8]) imagepos.push([`${CARD}badges1`, x, 104 * 2 + 52, i * 48, 0 * 48, 48, 48]);
      x += 48 + 8;
    }
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
        if (this.front === true) {
          pbSEPlay("GUI trainer card flip");
          await this.pbDrawTrainerCardBack();
          await this.wait(3);
        } else {
          pbSEPlay("GUI trainer card flip");
          if (this.front === false) await this.pbDrawTrainerCardFront();
          await this.wait(3);
        }
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

export class PokemonTrainerCardScreen {
  constructor(private scene: PokemonTrainerCard_Scene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbTrainerCard();
    await this.scene.pbEndScene();
  }
}
