// Port of Plugins/Roulette Game/Roulette Game.rb (FL's Roulette Minigame
// v1.1.6): the Game Corner Roulette from Ruby/Sapphire/Emerald. The ball
// never stops at an occupied slot, so there's no Taillow and Shroomish bonus.
// Use with Roulette.start(X) where X is the wager; Roulette.start(1,
// Roulette.BLUE) uses another board color set (RED, GREEN, BLUE, or any
// [background, used ball icon] pair).
//
// Timing: on v20 the plugin's Bridge.delta is a fixed 0.025 s per frame, so
// the main loop runs once per original 40 fps frame (common.ts) and
// Scene#update's timed part (cursor blink, wheel spin, credits counting up)
// steps once per original frame wherever it's called from (the message
// boxes call it every tick). Only the v20 branches of Bridge are kept.

import { rand } from "../core/random";
import { Settings } from "../data/gameData/settings";
import { pbPlayBuzzerSE, pbPlayCursorSE, pbSEPlay, pbSEStop } from "../game/GameSystem";
import { Bitmap } from "../rgss/Bitmap";
import type { Sprite } from "../rgss/display";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color } from "../rgss/types";
import { pbDrawTextPositions, type TextPosition } from "../ui/drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../ui/fades";
import { FrameCounter } from "../ui/frameTime";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../ui/messageConfig";
import { pbConfirmMessage, pbMessage, type FrameBlock } from "../ui/messages";
import { RPGCache, preloadBitmaps } from "../ui/rpgCache";
import { asHash, type Sprites } from "../ui/scenes/frames";
import { BitmapSprite, IconSprite } from "../ui/SpriteWrapper";
import { bag, OriginalFrames, player } from "./common";

const UI = "Graphics/UI/Roulette/";
export const ROULETTE_BITMAPS = ["ball", "ballicon", "ballusedicon", "creditbox", "multiplierbox", "roulette",
  "selectedcolor", "selectedsingle", "selectedspecies", "table"].map((f) => UI + f);

const RED = [new Color(0xc0, 0x20, 0x50), new Color(0xf8, 0x98, 0xa0)] as const;
const GREEN = [new Color(0x51, 0x96, 0x31), new Color(0x84, 0xdd, 0x57)] as const;
const BLUE = [new Color(0x20, 0x50, 0xc0), new Color(0x98, 0xa0, 0xf8)] as const;
type ColorSet = readonly [Color, Color];

const TABLE_POSITIONS = [
  [1, 10, 7, 4],
  [5, 2, 11, 8],
  [9, 6, 3, 0],
];
const COLUMNS = 4;
const ROWS = 3;
const ROUNDS: number = 6; // Before clean the board

/** Ruby's Integer#% (floored). */
const mod = (a: number, b: number) => ((a % b) + b) % b;

// Essentials multiversion layer (v20 branches)
const Bridge = {
  delta: () => 0.025, // MAJOR_VERSION < 21
  message: (string: string, block?: FrameBlock) => pbMessage(string, null, 0, null, 0, block),
  confirmMessage: (string: string, block?: FrameBlock) => pbConfirmMessage(string, block),
  drawTextPositions: (bitmap: Bitmap, textpos: TextPosition[]) => pbDrawTextPositions(bitmap, textpos),
  get coins(): number { return player().coins; },
  set coins(value: number) { player().coins = value; },
  maxCoins: () => Settings.MAX_COINS,
  hasCoinCase: () => bag().has("COINCASE"),
  getAudioName: (baseName: string) => baseName, // @@audioNameHash is {} on v17+
};

class Cursor {
  indexX = -1;
  indexY = -1;
  private blinkTimeCounter = 0;

  constructor(readonly sprite: IconSprite, private playedBalls: boolean[], private tableX: number, private tableY: number) {
    this.sprite.x = 8;
    this.sprite.y = 8;
    this.blinkTimeCounter = 0;
    this.indexX = -1;
    this.indexY = -1;
    this.setIndex(1, 1);
  }

  update(): void {
    this.updateBlink();
  }

  updateBlink(): void {
    this.blinkTimeCounter += Bridge.delta();
    if (this.blinkTimeCounter >= 0.4) {
      this.sprite.visible = !this.sprite.visible;
      this.blinkTimeCounter = 0;
    }
  }

  resetFlash(): void {
    this.blinkTimeCounter = 0;
    this.sprite.visible = true;
  }

  moveUp(): void { this.setIndex(this.indexX, this.indexY - 1); }
  moveDown(): void { this.setIndex(this.indexX, this.indexY + 1); }
  moveLeft(): void { this.setIndex(this.indexX - 1, this.indexY); }
  moveRight(): void { this.setIndex(this.indexX + 1, this.indexY); }

  setIndex(x: number, y: number): void {
    if (this.indexX !== -1) pbPlayCursorSE(); // Ignores first time
    x = mod(x, COLUMNS + 1);
    y = mod(y, ROWS + 1);
    // Small adjustment
    if (this.indexY === 0 && x === 0) {
      x = this.indexX === 1 ? COLUMNS : 1;
    }
    if (this.indexX === 0 && y === 0) {
      y = this.indexY === 1 ? ROWS : 1;
    }
    // Change index format
    if (x === 0 && this.indexX !== 0) {
      this.sprite.setBitmapFile(`${UI}selectedcolor`);
    }
    if (y === 0 && this.indexY !== 0) {
      this.sprite.setBitmapFile(`${UI}selectedspecies`);
    }
    if ((y !== 0 && this.indexY <= 0) || (x !== 0 && this.indexX <= 0)) {
      this.sprite.setBitmapFile(`${UI}selectedsingle`);
    }
    this.indexX = x;
    this.indexY = y;
    this.refreshSpritePos();
    this.resetFlash();
  }

  refreshSpritePos(extraX = 0): void {
    this.sprite.x = this.tableX - 2 + this.indexX * 48 + extraX;
    if (this.indexX === 0) this.sprite.x += 4;
    this.sprite.y = this.tableY - 2 + this.indexY * 48;
    if (this.indexY === 0) this.sprite.y += 4;
  }

  bentPositions(): number[] {
    if (this.indexX === 0) {
      return TABLE_POSITIONS[this.indexY - 1]!;
    } else if (this.indexY === 0) {
      return TABLE_POSITIONS.map((row) => row[this.indexX - 1]!); // transpose
    } else {
      return [TABLE_POSITIONS[this.indexY - 1]![this.indexX - 1]!];
    }
  }

  multiplier(): number { // Picks the multiplier value
    let checkedPositions: boolean[] = [];
    if (this.indexX === 0) {
      checkedPositions = this.playedBalls.slice((this.indexY - 1) * COLUMNS, (this.indexY - 1) * COLUMNS + COLUMNS);
    } else if (this.indexY === 0) {
      for (let i = 0; i < ROWS; i++) checkedPositions.push(this.playedBalls[this.indexX - 1 + i * COLUMNS]!);
    } else {
      checkedPositions.push(this.playedBalls[this.indexX - 1 + (this.indexY - 1) * COLUMNS]!);
    }
    const div = Roulette.count(checkedPositions, false);
    let result = 0;
    if (div !== 0) result = Math.floor(COLUMNS * ROWS / div);
    return result;
  }
}

class RouletteObject {
  readonly balls: Sprite[] = [];
  private ballHeights: (number | null)[] = [];

  constructor(readonly roulette: IconSprite) {}

  addBall(sprite: Sprite): void {
    sprite.x = this.roulette.x;
    sprite.y = this.roulette.y;
    sprite.visible = true;
    sprite.angle = this.roulette.angle - 10;
    this.balls.push(sprite);
  }

  clearBalls(): void {
    for (let i = 0; i < this.balls.length; i++) {
      this.balls[i]!.visible = false;
      this.ballHeights[i] = null;
    }
    this.balls.length = 0;
  }

  // Redraws the bitmap with the height and the changed ox and oy where
  // the ball picture will be at the top to create the illusion that the
  // ball is spinning.
  // The lower the height, the lower the distance to the roulette center.
  adjustBitmapBall(i: number, height: number): void {
    if (this.ballHeights[i] === height) return;
    this.ballHeights[i] = height;
    const bitmapBall = RPGCache.loadBitmap(`${UI}ball`);
    const ball = this.balls[i]!;
    ball.setBitmap(new Bitmap(30, height));
    if (bitmapBall) ball.bitmap!.blt(0, 0, bitmapBall, bitmapBall.rect());
    ball.ox = Math.floor(ball.bitmap!.width / 2);
    ball.oy = ball.bitmap!.height;
  }

  set x(value: number) {
    this.roulette.x = value;
    for (const ball of this.balls) ball.x = value;
  }

  set y(value: number) {
    this.roulette.y = value;
  }

  sumAngle(value: number): void {
    this.roulette.angle += value;
    for (const ball of this.balls) ball.angle += value;
  }

  update(): void {
    this.sumAngle(80.0 * Bridge.delta());
  }
}

const SPINS = [60 * 30, 36 * 20, 30 * 10, 20 * 3]; // Spins quantity and tiers
const BLINK_TIMES = 4;
const SECONDS_PER_BLINK = 0.1;
const BLINK_LAST_WAIT = 0.05;

class Scene {
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private backgroundColor!: Color;
  private usedIconColor!: Color;
  private roulette!: RouletteObject;
  private playedBalls: boolean[] = [];
  private wager = 0;
  private centralizeRoulette = false;
  private movedDistance = 0;
  private waitingMovement = false;
  private degreesToSpin = 0;
  private endingSpin = false;
  private remainingTimeToBlink = 0;
  private remainingTimeToAddCredit = 0;
  private displayedCredits = 0;
  private exit = false;
  private tableBallPosArray: [number, number][] = [];
  private cursor: Cursor | null = null;
  private result = -1;
  private variableDegrees = 0;
  private multiplierBoxUnclampedX = 0;
  private frames = new OriginalFrames();
  private clock = new FrameCounter();

  private icon(key: string): IconSprite { return this.sprites[key] as IconSprite; }
  private overlay(key: string): Bitmap { return (this.sprites[key] as BitmapSprite).bitmap!; }

  async startScene(wager: number, backgroundColor: Color, usedIconColor: Color): Promise<void> {
    await preloadBitmaps(ROULETTE_BITMAPS);
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.backgroundColor = backgroundColor;
    this.usedIconColor = usedIconColor;
    const background = new IconSprite(0, 0, this.viewport);
    this.sprites.background = background;
    background.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    background.bitmap!.fillRect(0, 0,
      background.bitmap!.width,
      background.bitmap!.height, this.backgroundColor,
    );
    const roulette = new IconSprite(0, 0, this.viewport);
    this.sprites.roulette = roulette;
    roulette.setBitmapFile(`${UI}roulette`);
    roulette.ox = Math.floor(roulette.bitmap!.width / 2);
    roulette.oy = Math.floor(roulette.bitmap!.height / 2);
    this.roulette = new RouletteObject(roulette);
    const table = new IconSprite(0, 0, this.viewport);
    this.sprites.table = table;
    table.setBitmapFile(`${UI}table`);
    const multiplierbox = new IconSprite(0, 0, this.viewport);
    this.sprites.multiplierbox = multiplierbox;
    multiplierbox.setBitmapFile(`${UI}multiplierbox`);
    multiplierbox.z = 1;
    this.multiplierBoxUnclampedX = multiplierbox.x;
    const creditbox = new IconSprite(0, 0, this.viewport);
    this.sprites.creditbox = creditbox;
    creditbox.setBitmapFile(`${UI}creditbox`);
    creditbox.x = Graphics.width - creditbox.bitmap!.width - 6;
    creditbox.y = 6;
    creditbox.z = 1;
    for (let i = 0; i < ROUNDS; i++) {
      const ball = new IconSprite(0, 0, this.viewport);
      this.sprites[`ball${i}`] = ball;
      ball.visible = false;
      const balltable = new IconSprite(0, 0, this.viewport);
      this.sprites[`balltable${i}`] = balltable;
      balltable.setBitmapFile(`${UI}ball`);
      balltable.visible = false;
      if (ROUNDS !== 1) {
        const ballicon = new IconSprite(0, 0, this.viewport);
        this.sprites[`ballicon${i}`] = ballicon;
        ballicon.setBitmapFile(`${UI}ballicon`);
        // Right to left
        ballicon.x = (
          creditbox.x + 10 + (ROUNDS - i - 1) * 16
        );
        ballicon.y = (
          creditbox.y + creditbox.bitmap!.height + 2
        );
      }
    }
    this.sprites.cursor = new IconSprite(0, 0, this.viewport);
    this.playedBalls = [];
    for (let n = 0; n < COLUMNS * ROWS; n++) this.playedBalls.push(false);
    const overlaycredits = new BitmapSprite(
      Graphics.width, Graphics.height, this.viewport,
    );
    this.sprites.overlaycredits = overlaycredits;
    overlaycredits.z = 2;
    const overlaymultiplier = new BitmapSprite(
      Graphics.width, Graphics.height, this.viewport,
    );
    this.sprites.overlaymultiplier = overlaymultiplier;
    overlaymultiplier.z = 2;
    pbSetSystemFont(overlaycredits.bitmap!);
    pbSetSystemFont(overlaymultiplier.bitmap!);
    overlaycredits.bitmap!.font.bold = true;
    overlaymultiplier.bitmap!.font.bold = true;
    this.wager = wager;
    this.centralizeRoulette = false;
    this.movedDistance = 0;
    this.waitingMovement = false;
    this.degreesToSpin = 0;
    this.endingSpin = false;
    this.remainingTimeToBlink = 0;
    this.remainingTimeToAddCredit = 0;
    this.displayedCredits = Bridge.coins;
    this.exit = false;
    this.tableBallPosArray = [];
    this.refreshBottomElementsPos();
    this.cursor = new Cursor(
      this.icon("cursor"), this.playedBalls, table.x, table.y,
    );
    this.drawCredits();
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.update());
    await this.displayMessage(
      _INTL("Place your wager with the arrows, then press the C key."),
    );
    this.drawMultiplier();
  }

  refreshBottomElementsPos(): void {
    this.cursor?.refreshSpritePos(this.movedDistance);
    const table = this.icon("table");
    const multiplierbox = this.icon("multiplierbox");
    // Roulette
    this.roulette.x = Math.min(
      Math.floor(this.icon("roulette").bitmap!.width / 2) + 4 + Math.floor(this.movedDistance / 2.0),
      Math.floor(Graphics.width / 2),
    );
    this.roulette.y = Math.floor(Graphics.height / 2);
    // Table
    table.x = (
      Graphics.width - table.bitmap!.width - 10 + Math.floor(this.movedDistance)
    );
    table.y = Graphics.height - table.bitmap!.height - 10;
    for (let i = 0; i < this.tableBallPosArray.length; i++) {
      this.icon(`balltable${i}`).x = (
        this.tableBallPosArray[i]![0] + Math.floor(this.movedDistance)
      );
      this.icon(`balltable${i}`).y = this.tableBallPosArray[i]![1];
    }
    // Multiplier
    const baseMultiplierBoxX = table.x - 14;
    multiplierbox.x = Math.min(
      baseMultiplierBoxX,
      Graphics.width - multiplierbox.bitmap!.width - 10,
    );
    multiplierbox.y = table.y + 6;
    (this.sprites.overlaymultiplier as BitmapSprite).x = (
      Math.floor(this.movedDistance) + multiplierbox.x - baseMultiplierBoxX
    );
  }

  /** pbUpdateSpriteHash every call; the Bridge.delta part once per original frame (see the header). */
  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
    for (let n = this.clock.tick(); n > 0; n--) {
      this.cursor!.update();
      this.roulette.update();
      this.remainingTimeToAddCredit -= Bridge.delta();
      if (this.displayedCredits < Bridge.coins && this.remainingTimeToAddCredit <= 0) {
        this.addDisplayedCredit();
      }
    }
  }

  addDisplayedCredit(): void {
    this.remainingTimeToAddCredit = 0.075;
    this.displayedCredits += 1;
    this.drawCredits();
  }

  drawMultiplier(): void {
    const overlay = this.overlay("overlaymultiplier");
    overlay.clear();
    const multiplier = this.cursor!.multiplier();
    if (multiplier === 0) return;
    const baseColor = ({
      6: new Color(0xf7, 0xc7, 0x0e), // Yellow
      4: new Color(0xc1, 0xa1, 0xf4), // Purple
      3: new Color(0xf8, 0xf8, 0xf8), // White
    } as Record<number, Color>)[multiplier] ?? new Color(0xf8, 0xa8, 0x88); // Default Red
    const box = this.icon("multiplierbox");
    const textPosition: TextPosition = [String(multiplier),
      box.x + box.bitmap!.width - 8,
      box.y + 6, true, baseColor, new Color(0x60, 0x60, 0x70),
    ];
    Bridge.drawTextPositions(overlay, [textPosition]);
  }

  drawCredits(): void {
    const overlay = this.overlay("overlaycredits");
    overlay.clear();
    const box = this.icon("creditbox");
    const textPosition: TextPosition = [String(this.displayedCredits),
      box.x + box.bitmap!.width - 26,
      box.y + 32,
      true, new Color(248, 248, 248), new Color(0, 0, 0),
    ];
    Bridge.drawTextPositions(overlay, [textPosition]);
  }

  // Adds the coins and updates the credit box. Return false if coins+number<0
  addCredits(number: number, instant = true): boolean {
    if (Bridge.coins + number < 0) return false;
    Bridge.coins = Math.min(
      Bridge.maxCoins(), Bridge.coins + number,
    );
    if (instant) {
      this.displayedCredits = Bridge.coins;
      this.drawCredits();
    }
    return true;
  }

  displayMessage(message: string): Promise<number> {
    return Bridge.message(message, () => this.update());
  }

  confirmMessage(message: string): Promise<boolean> {
    return Bridge.confirmMessage(message, () => this.update());
  }

  async main(): Promise<void> {
    for (;;) {
      await this.frames.update(() => this.update());
      Input.update();
      if (this.remainingTimeToBlink > 0) {
        await this.blink();
      } else if (this.waitingMovement) {
        this.movePictures();
      } else if (this.degreesToSpin > 0) {
        this.spinRoulette();
      } else {
        if (Input.trigger(Input.C)) {
          if (this.cursor!.multiplier() !== 0) {
            pbSEPlay(Bridge.getAudioName("Slots coin"));
            this.addCredits(-this.wager);
            this.centralizeRoulette = !this.centralizeRoulette;
            this.waitingMovement = true;
          } else {
            pbPlayBuzzerSE();
          }
        }
        if (this.exit) break;
        if (Input.trigger(Input.UP)) { this.cursor!.moveUp(); this.drawMultiplier(); }
        if (Input.trigger(Input.DOWN)) { this.cursor!.moveDown(); this.drawMultiplier(); }
        if (Input.trigger(Input.LEFT)) { this.cursor!.moveLeft(); this.drawMultiplier(); }
        if (Input.trigger(Input.RIGHT)) { this.cursor!.moveRight(); this.drawMultiplier(); }
      }
    }
  }

  movePictures(): void {
    let speed = 480 * Bridge.delta();
    if (!this.centralizeRoulette) speed *= -1; // Reverse the way
    this.movedDistance = Math.max(speed + this.movedDistance, 0);
    this.refreshBottomElementsPos();
    // The conditions for finish centralize and decentralize
    if (
      (this.centralizeRoulette && Graphics.width < this.icon("table").x) ||
      (!this.centralizeRoulette && this.movedDistance === 0)
    ) {
      this.waitingMovement = false;
      this.centralizeRoulette ? this.startSpin() : this.endSpin();
    }
  }

  startSpin(): void {
    const i = Roulette.count(this.playedBalls, true);
    if (ROUNDS !== 1) {
      this.icon(`ballicon${i}`).setBitmapFile(`${UI}ballusedicon`);
      this.icon(`ballicon${i}`).color = this.usedIconColor;
    }
    this.result = -1;
    for (;;) {
      this.result = rand(this.playedBalls.length);
      if (!this.playedBalls[this.result]) break;
    }
    this.roulette.addBall(this.icon(`ball${i}`));
    this.roulette.adjustBitmapBall(i, 148);
    this.variableDegrees = 10 * 3 * TABLE_POSITIONS.flat()[this.result]! + SPINS[3]!;
    this.degreesToSpin = SPINS[0]! + SPINS[1]! + SPINS[2]! + this.variableDegrees;
    this.endingSpin = false;
    pbSEPlay(Bridge.getAudioName("Roulette Ball"));
  }

  spinRoulette(): void {
    const i = Roulette.count(this.playedBalls, true);
    // Spins tier speeds
    let degrees = 0;
    if (this.degreesToSpin > SPINS[1]! + SPINS[2]! + this.variableDegrees) {
      degrees = 1200;
    } else if (this.degreesToSpin > SPINS[2]! + this.variableDegrees) {
      degrees = 800;
    } else if (this.degreesToSpin > this.variableDegrees) {
      degrees = 400;
    } else if (this.degreesToSpin > 0) {
      degrees = 120;
    }
    const angleGain = Math.min(degrees * Bridge.delta(), this.degreesToSpin);
    this.icon(`ball${i}`).angle -= angleGain;
    this.degreesToSpin -= angleGain;
    // Makes the ball more near of the center after some spins
    const minDegreePerHeights: Record<number, number> = {
      128: SPINS[1]! + SPINS[2]! + this.variableDegrees,
      118: Math.floor(SPINS[1]! / 2) + SPINS[2]! + this.variableDegrees,
      108: SPINS[2]! + this.variableDegrees,
      98: Math.floor(SPINS[2]! / 2) + this.variableDegrees,
      88: this.variableDegrees,
      74: 0,
    };
    for (const height of Object.keys(minDegreePerHeights).map(Number).sort((a, b) => a - b)) {
      if (this.degreesToSpin > minDegreePerHeights[height]!) continue;
      this.roulette.adjustBitmapBall(i, height);
      break;
    }
    // Play ending SFX
    if (!this.endingSpin && this.degreesToSpin <= SPINS[2]! + this.variableDegrees) {
      this.endingSpin = true;
      pbSEStop();
      pbSEPlay(Bridge.getAudioName("Roulette Ball End"));
    }
    if (this.degreesToSpin === 0) { // End
      pbSEPlay(Bridge.getAudioName("Battle ball drop"));
      this.centralizeRoulette = !this.centralizeRoulette;
      this.waitingMovement = true;
    }
  }

  endSpin(): void {
    const table = this.icon("table");
    this.tableBallPosArray.push([
      6 + table.x + (this.result % COLUMNS + 1) * 48,
      6 + table.y + (Math.floor(this.result / COLUMNS) + 1) * 48,
    ]);
    this.remainingTimeToBlink = (BLINK_TIMES + BLINK_LAST_WAIT) * SECONDS_PER_BLINK * 2;
    this.refreshBottomElementsPos();
  }

  async blink(): Promise<void> {
    const i = Roulette.count(this.playedBalls, true);
    this.remainingTimeToBlink -= Bridge.delta();
    const lastWait = this.remainingTimeToBlink / SECONDS_PER_BLINK <= BLINK_LAST_WAIT;
    this.icon(`balltable${i}`).visible = (
      mod(Math.floor(this.remainingTimeToBlink / SECONDS_PER_BLINK), 2) === 0 || lastWait
    );
    if (this.remainingTimeToBlink <= 0) await this.processResults();
  }

  async processResults(): Promise<void> {
    const cursor = this.cursor!;
    const wins = cursor.bentPositions().includes(TABLE_POSITIONS.flat()[this.result]!);
    if (wins) {
      if (cursor.multiplier() === 12) {
        await this.displayMessage(_INTL(
          "\\me[{1}]Jackpot!\\wtnp[50]", Bridge.getAudioName("Slots big win"),
        ));
      } else {
        await this.displayMessage(_INTL(
          "\\me[{1}]It's a hit!\\wtnp[30]", Bridge.getAudioName("Slots win"),
        ));
      }
      this.addCredits(this.wager * cursor.multiplier(), false);
      await this.displayMessage(_INTL("You've won {1} Coins!", this.wager * cursor.multiplier()));
    } else {
      pbPlayBuzzerSE();
      await this.displayMessage(_INTL("Nothing doing!"));
    }
    this.playedBalls[this.result] = true;
    if (Roulette.count(this.playedBalls, true) === ROUNDS) { // Clear
      if (ROUNDS !== 1) {
        await this.displayMessage(_INTL("The Roulette board will be cleared."));
      }
      this.roulette.clearBalls();
      this.playedBalls.length = 0;
      this.tableBallPosArray.length = 0;
      for (let n = 0; n < COLUMNS * ROWS; n++) this.playedBalls.push(false);
      for (let i = 0; i < ROUNDS; i++) {
        this.icon(`balltable${i}`).visible = false;
        if (ROUNDS !== 1) {
          this.icon(`ballicon${i}`).setBitmapFile(`${UI}ballicon`);
          this.icon(`ballicon${i}`).color = new Color(0, 0, 0, 0);
        }
      }
    }
    this.drawMultiplier();
    if (await this.confirmMessage(_INTL("Keep playing?"))) {
      if (Bridge.coins < this.wager) {
        await this.displayMessage(_INTL("You don't have enough Coins to play!"));
        this.exit = true;
      }
    } else {
      this.exit = true;
    }
  }

  async endScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.update());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

class Screen {
  constructor(private scene: Scene) {}

  async startScreen(wager: number, backgroundAndIconColor: ColorSet | null): Promise<void> {
    backgroundAndIconColor ??= RED;
    await this.scene.startScene(
      wager, backgroundAndIconColor[0], backgroundAndIconColor[1],
    );
    await this.scene.main();
    await this.scene.endScene();
  }
}

export const Roulette = {
  RED, GREEN, BLUE, TABLE_POSITIONS, COLUMNS, ROWS, ROUNDS,
  Cursor, RouletteObject, Scene, Screen, Bridge,

  // Added since Ruby 1.8 Array class doesn't have count
  count<T>(array: T[], value: T): number {
    let ret = 0;
    for (const element of array) if (element === value) ret += 1;
    return ret;
  },

  async start(wager = 1, backgroundAndIconColor: ColorSet | null = null): Promise<void> {
    if (!Bridge.hasCoinCase()) {
      await Bridge.message(_INTL("It's a Roulette."));
    } else if (await Bridge.confirmMessage(_INTL(
      "\\CNThe minimum wanger at this table is {1}. Do you want to play?", wager,
    ))) {
      if (Bridge.coins < wager) {
        await Bridge.message(_INTL("You don't have enough Coins to play!"));
      } else if (Bridge.coins === Bridge.maxCoins()) {
        await Bridge.message(_INTL("Your Coin Case is full!"));
      } else {
        await pbFadeOutIn(async () => {
          const scene = new Scene();
          const screen = new Screen(scene);
          await screen.startScreen(wager, backgroundAndIconColor);
        }, 99999);
      }
    }
  },
};
