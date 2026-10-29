// Port of 017_Minigames/004_Minigame_VoltorbFlip.rb ("Voltorb Flip"
// mini-game, by KitsuneKouta). Run with pbVoltorbFlip. The level isn't kept
// between plays (every play starts at Level 1), as in Ruby.
//
// The loops run once per original 40 fps frame (common.ts): the curtain
// turns a fixed angle per frame and the waits count frames.
//
// generateBoard is pbNewGame's board generation, split out so the tests can
// compare it with Ruby; pbNewGame runs it at the same point.

import { rand } from "../core/random";
import { pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../game/GameSystem";
import { Settings } from "../data/gameData/settings";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color } from "../rgss/types";
import { pbDrawImagePositions, pbDrawShadowText, type ImagePosition } from "../ui/drawText";
import { pbFadeOutAndHide } from "../ui/fades";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../ui/messages";
import { toSFormatted } from "../ui/mart/PokemonMart";
import { RPGCache, preloadBitmaps } from "../ui/rpgCache";
import { asHash, pbWait, type Sprites } from "../ui/scenes/frames";
import { BitmapSprite } from "../ui/SpriteWrapper";
import { bag, OriginalFrames, player, RUBY_FRAME_RATE, stats, zeroPad } from "./common";

const DIRECTORY = "Graphics/Pictures/Voltorb Flip/";
export const VOLTORB_FLIP_BITMAPS = ["boardbg", "memo", "tiles", "cursor", "explosion", "flipAnimation",
  "numbersSmall", "numbersScore"].map((f) => DIRECTORY + f);

/** [x, y, points, selected] */
type Square = [number, number, number, boolean];

export class VoltorbFlip {
  // Ranges of total coins available in each level.
  static readonly LEVEL_RANGES = [[20, 50],
    [50, 100],
    [100, 200],
    [200, 350],
    [350, 600],
    [600, 1000],
    [1000, 2000],
    [2000, 3500]];

  level = 1;
  private firstRound = true;
  private sprites: Sprites = {};
  private cursor: ImagePosition[] = [];
  private marks: ImagePosition[] = [];
  private coins: ImagePosition[] = [];
  private numbers: ImagePosition[] = [];
  private voltorbNumbers: ImagePosition[] = [];
  private points = 0;
  private index = [0, 0];
  squares: Square[] = [];
  private directory = DIRECTORY;
  private viewport: Viewport | null = null;
  private quit = false;
  private frames = new OriginalFrames();

  private spr(key: string | number): BitmapSprite { return this.sprites[key] as BitmapSprite; }
  private bmp(key: string | number) { return this.spr(key).bitmap!; }

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  /** Graphics.update; Input.update (+ update) */
  private async frame(withUpdate = true): Promise<void> {
    await this.frames.update(withUpdate ? () => this.update() : undefined);
    Input.update();
  }

  async pbStart(): Promise<void> {
    await preloadBitmaps(VOLTORB_FLIP_BITMAPS);
    this.level = 1;
    this.firstRound = true;
    await this.pbNewGame();
  }

  /** pbNewGame's board: the 25 [x, y, points, selected] squares for this level. */
  static generateBoard(level: number): Square[] {
    const squares: Square[] = [];
    const range = VoltorbFlip.LEVEL_RANGES[level - 1]!;
    const squareValues: number[] = [];
    let total = 1;
    let voltorbs = 0;
    for (let i = 0; i < 25; i++) {
      // Sets the value to 1 by default
      squareValues[i] = 1;
      // Sets the value to 0 (a voltorb) if # for that level hasn't been reached
      if (voltorbs < 5 + level) {
        squareValues[i] = 0;
        voltorbs += 1;
      // Sets the value randomly to a 2 or 3 if the total is less than the max
      } else if (total < range[1]!) {
        squareValues[i] = 2 + rand(2);
        total *= squareValues[i]!;
      }
      if (total <= range[1]!) continue;
      // Lowers value of square to 1 if over max
      total = Math.floor(total / squareValues[i]!);
      squareValues[i] = 1;
    }
    // Randomize the values a little
    for (let i = 0; i < 25; i++) {
      const temp = squareValues[i]!;
      if (squareValues[i]! > 1 && rand(10) === 0) {
        total = Math.floor(total / squareValues[i]!);
        squareValues[i]! -= 1;
        total *= squareValues[i]!;
      }
      if (total >= range[0]! || squareValues[i]! <= 0) continue;
      total = Math.floor(total / squareValues[i]!);
      squareValues[i] = temp;
      total *= squareValues[i]!;
    }
    // Populate @squares array
    for (let i = 0; i < 25; i++) {
      const r = rand(squareValues.length);
      squares[i] = [((i % 5) * 64) + 128, Math.floor(i / 5) * 64, squareValues[r]!, false];
      squareValues.splice(r, 1);
    }
    return squares;
  }

  async pbNewGame(): Promise<void> {
    // Initialize variables
    this.sprites = {};
    this.cursor = [];
    this.marks = [];
    this.coins = [];
    this.numbers = [];
    this.voltorbNumbers = [];
    this.points = 0;
    this.index = [0, 0];
    // [x,y,points,selected]
    this.squares = [];
    this.directory = DIRECTORY;
    this.squares = VoltorbFlip.generateBoard(this.level);
    this.pbCreateSprites();
    // Display numbers (all zeroes, as no values have been calculated yet)
    for (let i = 0; i < 5; i++) {
      this.pbUpdateRowNumbers(0, 0, i);
      this.pbUpdateColumnNumbers(0, 0, i);
    }
    pbDrawShadowText(this.bmp("text"), 8, 22, 118, 26,
      _INTL("Your coins"), new Color(60, 60, 60), new Color(150, 190, 170), 1);
    pbDrawShadowText(this.bmp("text"), 8, 88, 118, 26,
      _INTL("Prize coins"), new Color(60, 60, 60), new Color(150, 190, 170), 1);
    // Draw current level
    pbDrawShadowText(this.bmp("level"), 8, 154, 118, 28,
      _INTL("Level {1}", String(this.level)), new Color(60, 60, 60), new Color(150, 190, 170), 1);
    // Displays total and current coins
    this.pbUpdateCoins();
    // Draw curtain effect
    if (this.firstRound) {
      const angleDiff = Math.floor((10 * 20) / RUBY_FRAME_RATE);
      for (;;) {
        this.spr("curtainL").angle -= angleDiff;
        this.spr("curtainR").angle += angleDiff;
        await this.frame();
        if (this.spr("curtainL").angle <= -180) break;
      }
    }
    this.spr("curtainL").visible = false;
    this.spr("curtainR").visible = false;
    this.spr("curtain").opacity = 100;
    if (player().coins >= Settings.MAX_COINS) {
      await pbMessage(_INTL("You've gathered {1} Coins. You cannot gather any more.", toSFormatted(Settings.MAX_COINS)));
      player().coins = Settings.MAX_COINS; // As a precaution
      this.quit = true;
    //    elsif !pbConfirmMessage(_INTL("Play Voltorb Flip Lv. {1}?",@level)) && $player.coins<Settings::MAX_COINS
    //      @quit=true
    } else {
      this.spr("curtain").opacity = 0;
      // Erase 0s to prepare to replace with values
      this.bmp("numbers").clear();
      // Reset arrays to empty
      this.voltorbNumbers = [];
      this.numbers = [];
      // Draw numbers for each row (precautionary)
      for (let i = 0; i < this.squares.length; i++) {
        if ((i % 5) !== 0) continue;
        let num = 0;
        let voltorbs = 0;
        const j = i + 5;
        for (let k = i; k < j; k++) {
          num += this.squares[k]![2];
          if (this.squares[k]![2] === 0) voltorbs += 1;
        }
        this.pbUpdateRowNumbers(num, voltorbs, Math.floor(i / 5));
      }
      // Reset arrays to empty
      this.voltorbNumbers = [];
      this.numbers = [];
      // Draw numbers for each column
      for (let i = 0; i < 5; i++) {
        let num = 0;
        let voltorbs = 0;
        for (let j = 0; j < 5; j++) {
          num += this.squares[i + (j * 5)]![2];
          if (this.squares[i + (j * 5)]![2] === 0) voltorbs += 1;
        }
        this.pbUpdateColumnNumbers(num, voltorbs, i);
      }
    }
  }

  pbCreateSprites(): void {
    // NOTE: Ruby makes a new viewport every round and never disposes the old
    // one (its sprites are disposed); here the old, empty one is disposed.
    this.viewport?.dispose();
    const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport = viewport;
    viewport.z = 99999;
    const s = this.sprites;
    const bg = new Sprite(viewport);
    s.bg = bg;
    bg.setBitmap(RPGCache.loadBitmap(this.directory, "boardbg"));
    s.text = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    pbSetSystemFont(this.bmp("text"));
    s.level = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    pbSetSystemFont(this.bmp("level"));
    const curtain = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    s.curtain = curtain;
    curtain.z = 99999;
    curtain.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0));
    curtain.opacity = 0;
    const curtainL = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    s.curtainL = curtainL;
    curtainL.z = 99999;
    curtainL.x = Math.floor(Graphics.width / 2);
    curtainL.angle = -90;
    curtainL.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0));
    const curtainR = new BitmapSprite(Graphics.width, Graphics.height * 2, viewport);
    s.curtainR = curtainR;
    curtainR.z = 99999;
    curtainR.x = Math.floor(Graphics.width / 2);
    curtainR.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height * 2, new Color(0, 0, 0));
    s.cursor = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    this.spr("cursor").z = 99998;
    s.icon = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    this.spr("icon").z = 99997;
    s.mark = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    const memo = new Sprite(viewport);
    s.memo = memo;
    memo.setBitmap(RPGCache.loadBitmap(this.directory, "memo"));
    memo.x = 10;
    memo.y = 244;
    memo.visible = false;
    s.numbers = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    s.totalCoins = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    s.currentCoins = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    s.animation = new BitmapSprite(Graphics.width, Graphics.height, viewport);
    this.spr("animation").z = 99999;
    for (let i = 0; i < 6; i++) {
      const spr = new BitmapSprite(Graphics.width, Graphics.height, viewport);
      s[i] = spr;
      spr.z = 99996;
      spr.visible = false;
    }
    // Creates images ahead of time for the display-all animation (reduces lag)
    let icons: ImagePosition[] = [];
    let points = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 25; j++) {
        if (i === 2) points = this.squares[j]![2];
        icons[j] = [this.directory + "tiles", this.squares[j]![0], this.squares[j]![1], 320 + (i * 64) + (points * 64), 0, 64, 64];
      }
      pbDrawImagePositions(this.bmp(i), icons);
    }
    icons = [];
    for (let i = 0; i < 25; i++) {
      icons[i] = [this.directory + "tiles", this.squares[i]![0], this.squares[i]![1], this.squares[i]![2] * 64, 0, 64, 64];
    }
    pbDrawImagePositions(this.bmp(5), icons);
    // Default cursor image
    this.cursor[0] = [this.directory + "cursor", 0 + 128, 0, 0, 0, 64, 64];
  }

  async getInput(): Promise<void> {
    const cursor = this.spr("cursor");
    if (Input.trigger(Input.UP)) {
      pbPlayCursorSE();
      if (this.index[1]! > 0) {
        this.index[1]! -= 1;
        cursor.y -= 64;
      } else {
        this.index[1] = 4;
        cursor.y = 256;
      }
    } else if (Input.trigger(Input.DOWN)) {
      pbPlayCursorSE();
      if (this.index[1]! < 4) {
        this.index[1]! += 1;
        cursor.y += 64;
      } else {
        this.index[1] = 0;
        cursor.y = 0;
      }
    } else if (Input.trigger(Input.LEFT)) {
      pbPlayCursorSE();
      if (this.index[0]! > 0) {
        this.index[0]! -= 1;
        cursor.x -= 64;
      } else {
        this.index[0] = 4;
        cursor.x = 256;
      }
    } else if (Input.trigger(Input.RIGHT)) {
      pbPlayCursorSE();
      if (this.index[0]! < 4) {
        this.index[0]! += 1;
        cursor.x += 64;
      } else {
        this.index[0] = 0;
        cursor.x = 0;
      }
    } else if (Input.trigger(Input.USE)) {
      const ix = (this.index[0]! * 64) + 128;
      const iy = this.index[1]! * 64;
      if (this.cursor[0]![3] === 64) { // If in mark mode
        for (const sq of this.squares) {
          if (ix === sq[0] && iy === sq[1] && sq[3] === false) {
            pbSEPlay("Voltorb Flip mark");
          }
        }
        const n = this.marks.length + 1;
        for (let i = 0; i < n; i++) {
          if (this.marks[i] == null) {
            this.marks[i] = [this.directory + "tiles", ix, iy, 256, 0, 64, 64];
          } else if (this.marks[i]![1] === ix && this.marks[i]![2] === iy) {
            this.marks.splice(i, 1);
            this.marks = this.marks.filter((m) => m != null);
            this.bmp("mark").clear();
            break;
          }
        }
        pbDrawImagePositions(this.bmp("mark"), this.marks);
        await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
      } else {
        // Display the tile for the selected spot
        const icons: ImagePosition[] = [];
        for (let i = 0; i < this.squares.length; i++) {
          const sq = this.squares[i]!;
          if ((this.index[0]! * 64) + 128 === sq[0] && this.index[1]! * 64 === sq[1] && sq[3] === false) {
            await this.pbAnimateTile((this.index[0]! * 64) + 128, this.index[1]! * 64, sq[2]);
            sq[3] = true;
            // If Voltorb (0), display all tiles on the board
            if (sq[2] === 0) {
              pbSEPlay("Voltorb Flip explosion");
              // Play explosion animation
              // Part1
              let animation: ImagePosition[] = [];
              for (let j = 0; j < 3; j++) {
                animation[0] = icons[0] = [this.directory + "tiles", (this.index[0]! * 64) + 128, this.index[1]! * 64,
                  704 + (64 * j), 0, 64, 64];
                pbDrawImagePositions(this.bmp("animation"), animation);
                await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
                this.bmp("animation").clear();
              }
              // Part2
              animation = [];
              for (let j = 0; j < 6; j++) {
                animation[0] = [this.directory + "explosion", (this.index[0]! * 64) - 32 + 128, (this.index[1]! * 64) - 32,
                  j * 128, 0, 128, 128];
                pbDrawImagePositions(this.bmp("animation"), animation);
                await pbWait(Math.floor(RUBY_FRAME_RATE / 10));
                this.bmp("animation").clear();
              }
              // Unskippable text block, parameter 2 = wait time (corresponds to ME length)
              await pbMessage(_INTL("\\me[Voltorb Flip game over]Oh no! You get 0 Coins!\\wtnp[50]"));
              await this.pbShowAndDispose();
              this.bmp("mark").clear();
              if (this.level > 1) {
                // Determine how many levels to reduce by
                let newLevel = 0;
                for (const sq2 of this.squares) {
                  if (sq2[3] === true && sq2[2] > 1) newLevel += 1;
                }
                if (newLevel > this.level) newLevel = this.level;
                if (this.level > newLevel) {
                  this.level = newLevel;
                  if (this.level < 1) this.level = 1;
                  await pbMessage(_INTL("\\se[Voltorb Flip level down]Dropped to Game Lv. {1}!", String(this.level)));
                }
              }
              // Update level text
              this.bmp("level").clear();
              pbDrawShadowText(this.bmp("level"), 8, 154, 118, 28, "Level " + String(this.level),
                new Color(60, 60, 60), new Color(150, 190, 170), 1);
              this.points = 0;
              this.pbUpdateCoins();
              // Revert numbers to 0s
              this.bmp("numbers").clear();
              for (let j = 0; j < 5; j++) {
                this.pbUpdateRowNumbers(0, 0, j);
                this.pbUpdateColumnNumbers(0, 0, j);
              }
              pbDisposeSpriteHash(this.sprites as never);
              this.firstRound = false;
              await this.pbNewGame();
            } else {
              // Play tile animation
              const animation: ImagePosition[] = [];
              for (let j = 0; j < 4; j++) {
                animation[0] = [this.directory + "flipAnimation", (this.index[0]! * 64) - 14 + 128, (this.index[1]! * 64) - 16,
                  j * 92, 0, 92, 96];
                pbDrawImagePositions(this.bmp("animation"), animation);
                await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
                this.bmp("animation").clear();
              }
              if (this.points === 0) {
                this.points += sq[2];
                pbSEPlay("Voltorb Flip point");
              } else if (sq[2] > 1) {
                this.points *= sq[2];
                pbSEPlay("Voltorb Flip point");
              }
              break;
            }
          }
        }
      }
      let count = 0;
      for (const sq of this.squares) {
        if (sq[3] === false && sq[2] > 1) count += 1;
      }
      this.pbUpdateCoins();
      // Game cleared
      if (count === 0) {
        this.spr("curtain").opacity = 100;
        await pbMessage(_INTL("\\me[Voltorb Flip win]Game clear!\\wtnp[40]"));
        //        pbMessage(_INTL("You've found all of the hidden x2 and x3 cards."))
        //        pbMessage(_INTL("This means you've found all the Coins in this game, so the game is now over."))
        await pbMessage(_INTL("\\se[Voltorb Flip gain coins]{1} received {2} Coins!", player().name, toSFormatted(this.points)));
        // Update level text
        this.bmp("level").clear();
        pbDrawShadowText(this.bmp("level"), 8, 154, 118, 28, _INTL("Level {1}", String(this.level)),
          new Color(60, 60, 60), new Color(150, 190, 170), 1);
        const oldCoins = player().coins;
        player().coins += this.points;
        if (player().coins > oldCoins) stats().coinsWon += player().coins - oldCoins;
        this.points = 0;
        this.pbUpdateCoins();
        this.spr("curtain").opacity = 0;
        await this.pbShowAndDispose();
        // Revert numbers to 0s
        this.bmp("numbers").clear();
        for (let i = 0; i < 5; i++) {
          this.pbUpdateRowNumbers(0, 0, i);
          this.pbUpdateColumnNumbers(0, 0, i);
        }
        this.spr("curtain").opacity = 100;
        if (this.level < 8) {
          this.level += 1;
          await pbMessage(_INTL("\\se[Voltorb Flip level up]Advanced to Game Lv. {1}!", String(this.level)));
          if (this.firstRound) {
            //            pbMessage(_INTL("Congratulations!"))
            //            pbMessage(_INTL("You can receive even more Coins in the next game!"))
            this.firstRound = false;
          }
        }
        pbDisposeSpriteHash(this.sprites as never);
        await this.pbNewGame();
      }
    } else if (Input.trigger(Input.ACTION)) {
      pbPlayDecisionSE();
      this.bmp("cursor").clear();
      if (this.cursor[0]![3] === 0) { // If in normal mode
        this.cursor[0] = [this.directory + "cursor", 128, 0, 64, 0, 64, 64];
        this.spr("memo").visible = true;
      } else { // Mark mode
        this.cursor[0] = [this.directory + "cursor", 128, 0, 0, 0, 64, 64];
        this.spr("memo").visible = false;
      }
    } else if (Input.trigger(Input.BACK)) {
      this.spr("curtain").opacity = 100;
      if (this.points === 0) {
        if (await pbConfirmMessage("You haven't found any Coins! Are you sure you want to quit?")) {
          this.spr("curtain").opacity = 0;
          await this.pbShowAndDispose();
          this.quit = true;
        }
      } else if (await pbConfirmMessage(_INTL("If you quit now, you will recieve {1} Coin(s). Will you quit?",
        toSFormatted(this.points)))) {
        await pbMessage(_INTL("{1} received {2} Coin(s)!", player().name, toSFormatted(this.points)));
        const oldCoins = player().coins;
        player().coins += this.points;
        if (player().coins > oldCoins) stats().coinsWon += player().coins - oldCoins;
        this.points = 0;
        this.pbUpdateCoins();
        this.spr("curtain").opacity = 0;
        await this.pbShowAndDispose();
        this.quit = true;
      }
      this.spr("curtain").opacity = 0;
    }
    // Draw cursor
    pbDrawImagePositions(this.bmp("cursor"), this.cursor);
  }

  pbUpdateRowNumbers(num: number, voltorbs: number, i: number): void {
    const numText = zeroPad(num, 2);
    [...numText].forEach((digit, j) => {
      this.numbers[j] = [this.directory + "numbersSmall", 472 + (j * 16), 8 + (i * 64), Number(digit) * 16, 0, 16, 16];
    });
    this.voltorbNumbers[i] = [this.directory + "numbersSmall", 488, 34 + (i * 64), voltorbs * 16, 0, 16, 16];
    // Display the numbers
    pbDrawImagePositions(this.bmp("numbers"), this.numbers);
    pbDrawImagePositions(this.bmp("numbers"), this.voltorbNumbers);
  }

  pbUpdateColumnNumbers(num: number, voltorbs: number, i: number): void {
    const numText = zeroPad(num, 2);
    [...numText].forEach((digit, j) => {
      this.numbers[j] = [this.directory + "numbersSmall", 152 + (i * 64) + (j * 16), 328, Number(digit) * 16, 0, 16, 16];
    });
    this.voltorbNumbers[i] = [this.directory + "numbersSmall", 168 + (i * 64), 354, voltorbs * 16, 0, 16, 16];
    // Display the numbers
    pbDrawImagePositions(this.bmp("numbers"), this.numbers);
    pbDrawImagePositions(this.bmp("numbers"), this.voltorbNumbers);
  }

  pbCreateCoins(source: number, y: number): void {
    const coinText = zeroPad(source, 5);
    [...coinText].forEach((digit, i) => {
      this.coins[i] = [this.directory + "numbersScore", 6 + (i * 24), y, Number(digit) * 24, 0, 24, 38];
    });
  }

  pbUpdateCoins(): void {
    // Update coins display
    this.bmp("totalCoins").clear();
    this.pbCreateCoins(player().coins, 46);
    pbDrawImagePositions(this.bmp("totalCoins"), this.coins);
    // Update points display
    this.bmp("currentCoins").clear();
    this.pbCreateCoins(this.points, 112);
    pbDrawImagePositions(this.bmp("currentCoins"), this.coins);
  }

  async pbAnimateTile(x: number, y: number, tile: number): Promise<void> {
    const icons: ImagePosition[] = [];
    let points = 0;
    for (let i = 0; i < 3; i++) {
      if (i === 2) points = tile;
      icons[i] = [this.directory + "tiles", x, y, 320 + (i * 64) + (points * 64), 0, 64, 64];
      pbDrawImagePositions(this.bmp("icon"), icons);
      await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
    }
    icons[3] = [this.directory + "tiles", x, y, tile * 64, 0, 64, 64];
    pbDrawImagePositions(this.bmp("icon"), icons);
    pbSEPlay("Voltorb Flip tile");
  }

  async pbShowAndDispose(): Promise<void> {
    // Make pre-rendered sprites visible (this approach reduces lag)
    for (let i = 0; i < 5; i++) {
      this.spr(i).visible = true;
      if (i < 3) await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
      this.bmp(i).clear();
      this.spr(i).z = 99997;
    }
    pbSEPlay("Voltorb Flip tile");
    this.spr(5).visible = true;
    this.bmp("mark").clear();
    await pbWait(Math.floor(RUBY_FRAME_RATE / 10));
    // Wait for user input to continue
    for (;;) {
      await this.frame();
      if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) break;
    }
    // "Dispose" of tiles by column
    for (let i = 0; i < 5; i++) {
      const icons: ImagePosition[] = [];
      pbSEPlay("Voltorb Flip tile");
      const sq = (j: number) => this.squares[i + (j * 5)]!;
      for (let j = 0; j < 5; j++) {
        icons[j] = [this.directory + "tiles", sq(j)[0], sq(j)[1], 448 + (sq(j)[2] * 64), 0, 64, 64];
      }
      pbDrawImagePositions(this.bmp(i), icons);
      await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
      for (let j = 0; j < 5; j++) icons[j] = [this.directory + "tiles", sq(j)[0], sq(j)[1], 384, 0, 64, 64];
      pbDrawImagePositions(this.bmp(i), icons);
      await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
      for (let j = 0; j < 5; j++) icons[j] = [this.directory + "tiles", sq(j)[0], sq(j)[1], 320, 0, 64, 64];
      pbDrawImagePositions(this.bmp(i), icons);
      await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
      for (let j = 0; j < 5; j++) icons[j] = [this.directory + "tiles", sq(j)[0], sq(j)[1], 896, 0, 64, 64];
      pbDrawImagePositions(this.bmp(i), icons);
      await pbWait(Math.floor(RUBY_FRAME_RATE / 20));
    }
    this.bmp("icon").clear();
    for (let i = 0; i < 6; i++) this.bmp(i).clear();
    this.bmp("cursor").clear();
  }

  //  def pbWaitText(msg,frames)
  //    msgwindow=pbCreateMessageWindow
  //    pbMessageDisplay(msgwindow,msg)
  //    frames.times do
  //      pbWait(1)
  //    end
  //    pbDisposeMessageWindow(msgwindow)
  //  end

  async pbEndScene(): Promise<void> {
    const curtainL = this.spr("curtainL");
    const curtainR = this.spr("curtainR");
    curtainL.angle = -180;
    curtainR.angle = 90;
    // Draw curtain effect
    curtainL.visible = true;
    curtainR.visible = true;
    const angleDiff = Math.floor((18 * 20) / RUBY_FRAME_RATE);
    for (;;) {
      curtainL.angle += angleDiff;
      curtainR.angle -= angleDiff;
      // Fixes a minor graphical bug
      if (curtainL.angle >= -90) curtainL.y -= 2;
      await this.frame();
      if (curtainL.angle >= -90) break;
    }
    await pbFadeOutAndHide(asHash(this.sprites), () => this.update());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport?.dispose();
  }

  async pbScene(): Promise<void> {
    for (;;) {
      await this.frame(false);
      await this.getInput();
      if (this.quit) break;
    }
  }
}

export class VoltorbFlipScreen {
  constructor(private scene: VoltorbFlip) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStart();
    await this.scene.pbScene();
    await this.scene.pbEndScene();
  }
}

export async function pbVoltorbFlip(): Promise<void> {
  if (!bag().has("COINCASE")) {
    await pbMessage(_INTL("You can't play unless you have a Coin Case."));
  } else if (player().coins === Settings.MAX_COINS) {
    await pbMessage(_INTL("Your Coin Case is full!"));
  } else {
    const scene = new VoltorbFlip();
    const screen = new VoltorbFlipScreen(scene);
    await screen.pbStartScreen();
  }
}
