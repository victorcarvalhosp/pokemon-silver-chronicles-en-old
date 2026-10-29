// Port of 017_Minigames/003_Minigame_SlotMachine.rb ("Slot Machine"
// mini-game, by Maruno). Run with pbSlotMachine(1); the number is 0 (easy),
// 1 (default) or 2 (hard).
//
// The scene loop runs once per original 40 fps frame (common.ts). The reels
// scroll a fixed SCROLLSPEED per frame, so SlotMachineReel steps once per
// original frame however often the sprite hash updates it.
//
// Ruby clears the window sprites with `bitmap&.clear`, which blanks the
// shared cached graphic until the sprite's next setBitmap reloads it. Here
// the cached bitmaps are never reloaded, so the sprite drops its bitmap
// instead (clearIcon): it shows nothing until the next setBitmap, as in Ruby.

import { rand } from "../core/random";
import { pbMEPlay, pbSEPlay } from "../game/GameSystem";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Rect } from "../rgss/types";
import { AnimatedBitmap } from "../ui/AnimatedBitmap";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../ui/fades";
import { FrameCounter } from "../ui/frameTime";
import { Settings } from "../data/gameData/settings";
import { _INTL, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { toSFormatted } from "../ui/mart/PokemonMart";
import { addBackgroundPlane } from "../ui/planes";
import { preloadBitmaps } from "../ui/rpgCache";
import { asHash, type Sprites } from "../ui/scenes/frames";
import { BitmapSprite, IconSprite } from "../ui/SpriteWrapper";
import { bag, OriginalFrames, player, RUBY_FRAME_RATE, rubyShuffle, stats } from "./common";

const DIR = "Graphics/Pictures/Slot Machine/";

/** `sprite.bitmap&.clear` on an IconSprite (see the header). */
function clearIcon(sprite: IconSprite): void {
  if (sprite.bitmap) sprite.clearBitmaps();
}

export class SlotMachineReel extends BitmapSprite {
  reel: number[] = [];
  toppos = 0;
  spinning = false;
  stopping = false;
  slipping = 0;
  private index = 0;
  private images: AnimatedBitmap;
  private shading: AnimatedBitmap;
  private reelViewport: Viewport;
  private clock = new FrameCounter(false);

  static readonly SCROLLSPEED = 16; // Must be a divisor of 48
  static readonly ICONSPOOL = [[0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7], // 0 - Easy
    [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 6, 7], // 1 - Medium (default)
    [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 6, 7]]; // 2 - Hard
  static readonly SLIPPING = [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3];

  constructor(x: number, y: number, difficulty = 1) {
    const viewport = new Viewport(x, y, 64, 144);
    viewport.z = 99999;
    super(64, 144, viewport);
    this.reelViewport = viewport;
    this.reel = [];
    const pool = SlotMachineReel.ICONSPOOL[difficulty]!;
    for (let i = 0; i < pool.length; i++) this.reel.push(pool[i]!);
    rubyShuffle(this.reel);
    this.toppos = 0;
    this.spinning = false;
    this.stopping = false;
    this.slipping = 0;
    this.index = rand(this.reel.length);
    this.images = new AnimatedBitmap(_INTL(`${DIR}images`));
    this.shading = new AnimatedBitmap(`${DIR}ReelOverlay`);
    this.step();
    this.draw();
  }

  override dispose(): void {
    super.dispose();
    this.reelViewport.dispose();
  }

  startSpinning(): void {
    this.spinning = true;
  }

  stopSpinning(noslipping = false): void {
    this.stopping = true;
    this.slipping = SlotMachineReel.SLIPPING[rand(SlotMachineReel.SLIPPING.length)]!;
    if (noslipping) this.slipping = 0;
  }

  showing(): number[] {
    const array: number[] = [];
    for (let i = 0; i < 3; i++) {
      let num = this.index - i;
      if (num < 0) num += this.reel.length;
      array.push(this.reel[num]!);
    }
    return array; // [0] = top, [1] = middle, [2] = bottom
  }

  /** The logic half of Ruby's update (one original frame). */
  step(): void {
    if (this.toppos === 0 && this.stopping && this.slipping === 0) {
      this.spinning = this.stopping = false;
    }
    if (this.spinning) {
      this.toppos += SlotMachineReel.SCROLLSPEED;
      if (this.toppos > 0) {
        this.toppos -= 48;
        this.index = (this.index + 1) % this.reel.length;
        if (this.slipping > 0) this.slipping -= 1;
      }
    }
  }

  /** The drawing half of Ruby's update. */
  draw(): void {
    const bitmap = this.bitmap!;
    bitmap.clear();
    for (let i = 0; i < 4; i++) {
      let num = this.index - i;
      if (num < 0) num += this.reel.length;
      bitmap.blt(0, this.toppos + (i * 48), this.images.bitmap, new Rect(this.reel[num]! * 64, 0, 64, 48));
    }
    bitmap.blt(0, 0, this.shading.bitmap, new Rect(0, 0, 64, 144));
  }

  override update(dt?: number): void {
    super.update(dt);
    for (let n = this.clock.tick(); n > 0; n--) this.step();
    this.draw();
  }
}

export class SlotMachineScore extends BitmapSprite {
  private _score = 0;
  private numbers: AnimatedBitmap;
  private scoreViewport: Viewport;

  constructor(x: number, y: number, score = 0) {
    const viewport = new Viewport(x, y, 70, 22);
    viewport.z = 99999;
    super(70, 22, viewport);
    this.scoreViewport = viewport;
    this.numbers = new AnimatedBitmap(`${DIR}numbers`);
    this.score = score;
  }

  override dispose(): void {
    super.dispose();
    this.scoreViewport.dispose();
  }

  get score(): number { return this._score; }
  set score(value: number) {
    this._score = value;
    if (this._score > Settings.MAX_COINS) this._score = Settings.MAX_COINS;
    this.refresh();
  }

  refresh(): void {
    const bitmap = this.bitmap!;
    bitmap.clear();
    for (let i = 0; i < 5; i++) {
      const digit = Math.floor(this._score / (10 ** i)) % 10; // Least significant digit first
      bitmap.blt(14 * (4 - i), 0, this.numbers.bitmap, new Rect(digit * 14, 0, 14, 22));
    }
  }
}

export const SLOT_MACHINE_BITMAPS = ["bg", "images", "ReelOverlay", "numbers", "button", "line1", "line2", "line3a", "line3b",
  "lights", "insert", "press", "stop", "win", "bonus", "lose"].map((f) => DIR + f);

/** What pbPayout and pbMain read from the sprite hash. */
interface SlotSprites {
  reel1: SlotMachineReel; reel2: SlotMachineReel; reel3: SlotMachineReel;
  payout: SlotMachineScore; credit: SlotMachineScore;
  window1: IconSprite; window2: IconSprite; light1: IconSprite; light2: IconSprite;
  [key: string]: unknown;
}

export class SlotMachineScene {
  gameRunning = false;
  gameEnd = false;
  wager = 0;
  replay = false;
  sprites: Sprites = {};
  private viewport!: Viewport;
  private frames = new OriginalFrames();

  private get s(): SlotSprites { return this.sprites as unknown as SlotSprites; }
  private icon(key: string): IconSprite { return this.sprites[key] as IconSprite; }

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  /** Graphics.update; Input.update; update */
  private async frame(): Promise<void> {
    await this.frames.update(() => this.update());
    Input.update();
  }

  async pbPayout(): Promise<void> {
    const s = this.s;
    this.replay = false;
    let payout = 0;
    let bonus = 0;
    const wonRow: boolean[] = [];
    // Get reel pictures
    const reel1 = s.reel1.showing();
    const reel2 = s.reel2.showing();
    const reel3 = s.reel3.showing();
    const combinations = [[reel1[1]!, reel2[1]!, reel3[1]!], // Centre row
      [reel1[0]!, reel2[0]!, reel3[0]!], // Top row
      [reel1[2]!, reel2[2]!, reel3[2]!], // Bottom row
      [reel1[0]!, reel2[1]!, reel3[2]!], // Diagonal top left -> bottom right
      [reel1[2]!, reel2[1]!, reel3[0]!]]; // Diagonal bottom left -> top right
    for (let i = 0; i < combinations.length; i++) {
      if (i >= 1 && this.wager <= 1) break; // One coin = centre row only
      if (i >= 3 && this.wager <= 2) break; // Two coins = three rows only
      wonRow[i] = true;
      const key = combinations[i]!.join(",");
      switch (key) {
        case "1,1,1": // Three Magnemites
          payout += 8;
          break;
        case "2,2,2": // Three Shellders
          payout += 8;
          break;
        case "3,3,3": // Three Pikachus
          payout += 15;
          break;
        case "4,4,4": // Three Psyducks
          payout += 15;
          break;
        case "5,5,6": case "5,6,5": case "6,5,5": case "6,6,5": case "6,5,6": case "5,6,6": // 777 multi-colored
          payout += 90;
          if (bonus < 1) bonus = 1;
          break;
        case "5,5,5": case "6,6,6": // Red 777, blue 777
          payout += 300;
          if (bonus < 2) bonus = 2;
          break;
        case "7,7,7": // Three replays
          this.replay = true;
          break;
        default:
          if (combinations[i]![0] === 0) { // Left cherry
            if (combinations[i]![1] === 0) { // Centre cherry as well
              payout += 4;
            } else {
              payout += 2;
            }
          } else {
            wonRow[i] = false;
          }
      }
    }
    s.payout.score = payout;
    let frame = 0;
    if (payout > 0 || this.replay) {
      if (bonus > 0) {
        pbMEPlay("Slots big win");
      } else {
        pbMEPlay("Slots win");
      }
      // Show winning animation
      const timePerFrame = Math.floor(RUBY_FRAME_RATE / 8);
      while (frame !== RUBY_FRAME_RATE * 3) {
        await this.frame();
        clearIcon(s.window2);
        s.window1.setBitmapFile(`${DIR}win`);
        s.window1.srcRect.set(152 * (Math.floor(frame / timePerFrame) % 4), 0, 152, 208);
        if (bonus > 0) {
          s.window2.setBitmapFile(`${DIR}bonus`);
          s.window2.srcRect.set(152 * (bonus - 1), 0, 152, 208);
        }
        s.light1.visible = true;
        s.light1.srcRect.set(0, 26 * (Math.floor(frame / timePerFrame) % 4), 96, 26);
        s.light2.visible = true;
        s.light2.srcRect.set(0, 26 * (Math.floor(frame / timePerFrame) % 4), 96, 26);
        for (let i = 1; i <= 5; i++) {
          if (wonRow[i - 1]) {
            this.icon(`row${i}`).visible = Math.floor(frame / timePerFrame) % 2 === 0;
          } else {
            this.icon(`row${i}`).visible = false;
          }
        }
        frame += 1;
      }
      s.light1.visible = false;
      s.light2.visible = false;
      s.window1.srcRect.set(0, 0, 152, 208);
      // Pay out
      for (;;) {
        if (s.payout.score <= 0) break;
        await this.frame();
        s.payout.score -= 1;
        s.credit.score += 1;
        if (Input.trigger(Input.USE) || s.credit.score === Settings.MAX_COINS) {
          s.credit.score += s.payout.score;
          s.payout.score = 0;
        }
      }
      for (let n = 0; n < Math.floor(RUBY_FRAME_RATE / 2); n++) await this.frame();
    } else {
      // Show losing animation
      const timePerFrame = Math.floor(RUBY_FRAME_RATE / 4);
      while (frame !== RUBY_FRAME_RATE * 2) {
        await this.frame();
        clearIcon(s.window2);
        s.window1.setBitmapFile(`${DIR}lose`);
        s.window1.srcRect.set(152 * (Math.floor(frame / timePerFrame) % 2), 0, 152, 208);
        frame += 1;
      }
    }
    this.wager = 0;
  }

  async pbStartScene(difficulty: number): Promise<void> {
    await preloadBitmaps(SLOT_MACHINE_BITMAPS);
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    addBackgroundPlane(this.sprites, "bg", "Slot Machine/bg", this.viewport);
    this.sprites.reel1 = new SlotMachineReel(64, 112, difficulty);
    this.sprites.reel2 = new SlotMachineReel(144, 112, difficulty);
    this.sprites.reel3 = new SlotMachineReel(224, 112, difficulty);
    for (let i = 1; i <= 3; i++) {
      const button = new IconSprite(68 + (80 * (i - 1)), 260, this.viewport);
      this.sprites[`button${i}`] = button;
      button.setBitmapFile(`${DIR}button`);
      button.visible = false;
    }
    for (let i = 1; i <= 5; i++) {
      const y = [170, 122, 218, 82, 82][i - 1]!;
      const row = new IconSprite(2, y, this.viewport);
      this.sprites[`row${i}`] = row;
      row.setBitmapFile(`${DIR}line${1 + Math.floor(i / 2)}${(i >= 4) ? ((i === 4) ? "a" : "b") : ""}`);
      row.visible = false;
    }
    const light1 = new IconSprite(16, 32, this.viewport);
    this.sprites.light1 = light1;
    light1.setBitmapFile(`${DIR}lights`);
    light1.visible = false;
    const light2 = new IconSprite(240, 32, this.viewport);
    this.sprites.light2 = light2;
    light2.setBitmapFile(`${DIR}lights`);
    light2.mirror = true;
    light2.visible = false;
    const window1 = new IconSprite(358, 96, this.viewport);
    this.sprites.window1 = window1;
    window1.setBitmapFile(`${DIR}insert`);
    window1.srcRect.set(0, 0, 152, 208);
    this.sprites.window2 = new IconSprite(358, 96, this.viewport);
    this.sprites.credit = new SlotMachineScore(360, 66, player().coins);
    this.sprites.payout = new SlotMachineScore(438, 66, 0);
    this.wager = 0;
    this.update();
    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbMain(): Promise<void> {
    const s = this.s;
    let frame = 0;
    const spinFrameTime = Math.floor(RUBY_FRAME_RATE / 4);
    const insertFrameTime = Math.floor((RUBY_FRAME_RATE * 4) / 10);
    for (;;) {
      await this.frame();
      clearIcon(s.window1);
      clearIcon(s.window2);
      if (s.credit.score === Settings.MAX_COINS) {
        await pbMessage(_INTL("You've got {1} Coins.", toSFormatted(Settings.MAX_COINS)));
        break;
      } else if (player().coins === 0) {
        await pbMessage(_INTL("You've run out of Coins.\nGame over!"));
        break;
      } else if (this.gameRunning) { // Reels are spinning
        s.window1.setBitmapFile(`${DIR}stop`);
        s.window1.srcRect.set(152 * (Math.floor(frame / spinFrameTime) % 4), 0, 152, 208);
        if (Input.trigger(Input.USE)) {
          pbSEPlay("Slots stop");
          if (s.reel1.spinning) {
            s.reel1.stopSpinning(this.replay);
            this.icon("button1").visible = true;
          } else if (s.reel2.spinning) {
            s.reel2.stopSpinning(this.replay);
            this.icon("button2").visible = true;
          } else if (s.reel3.spinning) {
            s.reel3.stopSpinning(this.replay);
            this.icon("button3").visible = true;
          }
        }
        if (!s.reel3.spinning) {
          this.gameEnd = true;
          this.gameRunning = false;
        }
      } else if (this.gameEnd) { // Reels have been stopped
        await this.pbPayout();
        // Reset graphics
        this.icon("button1").visible = false;
        this.icon("button2").visible = false;
        this.icon("button3").visible = false;
        for (let i = 1; i <= 5; i++) this.icon(`row${i}`).visible = false;
        this.gameEnd = false;
      } else { // Awaiting coins for the next spin
        s.window1.setBitmapFile(`${DIR}insert`);
        s.window1.srcRect.set(152 * (Math.floor(frame / insertFrameTime) % 2), 0, 152, 208);
        if (this.wager > 0) {
          s.window2.setBitmapFile(`${DIR}press`);
          s.window2.srcRect.set(152 * (Math.floor(frame / insertFrameTime) % 2), 0, 152, 208);
        }
        if (Input.trigger(Input.DOWN) && this.wager < 3 && s.credit.score > 0) {
          pbSEPlay("Slots coin");
          this.wager += 1;
          s.credit.score -= 1;
          if (this.wager >= 3) {
            this.icon("row5").visible = true;
            this.icon("row4").visible = true;
          } else if (this.wager >= 2) {
            this.icon("row3").visible = true;
            this.icon("row2").visible = true;
          } else if (this.wager >= 1) {
            this.icon("row1").visible = true;
          }
        } else if (this.wager >= 3 || (this.wager > 0 && s.credit.score === 0) ||
                   (Input.trigger(Input.USE) && this.wager > 0) || this.replay) {
          if (this.replay) {
            this.wager = 3;
            for (let i = 1; i <= 5; i++) this.icon(`row${i}`).visible = true;
          }
          s.reel1.startSpinning();
          s.reel2.startSpinning();
          s.reel3.startSpinning();
          frame = 0;
          this.gameRunning = true;
        } else if (Input.trigger(Input.BACK) && this.wager === 0) {
          break;
        }
      }
      frame = (frame + 1) % (RUBY_FRAME_RATE * 4);
    }
    const oldCoins = player().coins;
    player().coins = s.credit.score;
    if (player().coins > oldCoins) {
      stats().coinsWon += player().coins - oldCoins;
    } else if (player().coins < oldCoins) {
      stats().coinsLost += oldCoins - player().coins;
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class SlotMachine {
  constructor(private scene: SlotMachineScene) {}

  async pbStartScreen(difficulty: number): Promise<void> {
    await this.scene.pbStartScene(difficulty);
    await this.scene.pbMain();
    await this.scene.pbEndScene();
  }
}

export async function pbSlotMachine(difficulty = 1): Promise<void> {
  if (!bag().has("COINCASE")) {
    await pbMessage(_INTL("It's a Slot Machine."));
  } else if (player().coins === 0) {
    await pbMessage(_INTL("You don't have any Coins to play!"));
  } else if (player().coins === Settings.MAX_COINS) {
    await pbMessage(_INTL("Your Coin Case is full!"));
  } else {
    await pbFadeOutIn(async () => {
      const scene = new SlotMachineScene();
      const screen = new SlotMachine(scene);
      await screen.pbStartScreen(difficulty);
    });
  }
}
