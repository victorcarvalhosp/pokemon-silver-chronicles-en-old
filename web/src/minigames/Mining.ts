// Port of 017_Minigames/006_Minigame_Mining.rb ("Mining" mini-game, by
// Maruno). Run with pbMiningGame.
//
// The scene loop runs once per original 40 fps frame (common.ts); the
// cursor's 22-frame hit animation counts original frames however often the
// sprite hash updates it.

import { DEBUG } from "../core/debug";
import { rand } from "../core/random";
import type { Id } from "../data/gameData/gameData";
import { Item } from "../data/gameData/item";
import { pbSEPlay } from "../game/GameSystem";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color, Rect } from "../rgss/types";
import { AnimatedBitmap } from "../ui/AnimatedBitmap";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../ui/fades";
import { FrameCounter } from "../ui/frameTime";
import { _INTL, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../ui/messages";
import { addBackgroundPlane } from "../ui/planes";
import { preloadBitmaps } from "../ui/rpgCache";
import { asHash, pbWait, type Sprites } from "../ui/scenes/frames";
import { BitmapSprite, IconSprite } from "../ui/SpriteWrapper";
import { bag, OriginalFrames, RUBY_FRAME_RATE } from "./common";

const DIR = "Graphics/Pictures/Mining/";
export const MINING_BITMAPS = ["miningbg", "cracks", "tiles", "cursor", "tools", "hits", "items", "irons", "toolicons"]
  .map((f) => DIR + f);

export class MiningGameCounter extends BitmapSprite {
  hits = 0;
  private image: AnimatedBitmap;
  private counterViewport: Viewport;

  constructor(x: number, y: number) {
    const viewport = new Viewport(x, y, 416, 60);
    viewport.z = 99999;
    super(416, 60, viewport);
    this.counterViewport = viewport;
    this.hits = 0;
    this.image = new AnimatedBitmap(`${DIR}cracks`);
    this.update();
  }

  override dispose(): void {
    super.dispose();
    this.counterViewport.dispose();
  }

  override update(dt?: number): void {
    super.update(dt);
    const bitmap = this.bitmap!;
    bitmap.clear();
    let value = this.hits;
    let startx = 416 - 48;
    while (value > 6) {
      bitmap.blt(startx, 0, this.image.bitmap, new Rect(0, 0, 48, 52));
      startx -= 48;
      value -= 6;
    }
    startx -= 48;
    if (value > 0) {
      bitmap.blt(startx, 0, this.image.bitmap, new Rect(0, value * 52, 96, 52));
    }
  }
}

export class MiningGameTile extends BitmapSprite {
  private _layer = 0;
  private image: AnimatedBitmap;
  private tileViewport: Viewport;

  constructor(x: number, y: number) {
    const viewport = new Viewport(x, y, 32, 32);
    viewport.z = 99999;
    super(32, 32, viewport);
    this.tileViewport = viewport;
    const r = rand(100);
    if (r < 10) {
      this._layer = 2; // 10%
    } else if (r < 25) {
      this._layer = 3; // 15%
    } else if (r < 60) {
      this._layer = 4; // 35%
    } else if (r < 85) {
      this._layer = 5; // 25%
    } else {
      this._layer = 6; // 15%
    }
    this.image = new AnimatedBitmap(`${DIR}tiles`);
    this.update();
  }

  override dispose(): void {
    super.dispose();
    this.tileViewport.dispose();
  }

  get layer(): number { return this._layer; }
  set layer(value: number) {
    this._layer = value;
    if (this._layer < 0) this._layer = 0;
  }

  override update(dt?: number): void {
    super.update(dt);
    const bitmap = this.bitmap!;
    bitmap.clear();
    if (this._layer > 0) {
      bitmap.blt(0, 0, this.image.bitmap, new Rect(0, 32 * (this._layer - 1), 32, 32));
    }
  }
}

export class MiningGameCursor extends BitmapSprite {
  mode = 0;
  position = 0;
  hit = 0; // 0=regular, 1=hit item, 2=hit iron
  counter = 0;
  private cursorbitmap: AnimatedBitmap;
  private toolbitmap: AnimatedBitmap;
  private hitsbitmap: AnimatedBitmap;
  private cursorViewport: Viewport;
  private clock = new FrameCounter(false);

  static readonly TOOL_POSITIONS = [[1, 0], [1, 1], [1, 1], [0, 0], [0, 0],
    [0, 2], [0, 2], [0, 0], [0, 0], [0, 2], [0, 2]]; // Graphic, position

  constructor(position = 0, mode = 0) { // mode: 0=pick, 1=hammer
    const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    viewport.z = 99999;
    super(Graphics.width, Graphics.height, viewport);
    this.cursorViewport = viewport;
    this.position = position;
    this.mode = mode;
    this.hit = 0;
    this.counter = 0;
    this.cursorbitmap = new AnimatedBitmap(`${DIR}cursor`);
    this.toolbitmap = new AnimatedBitmap(`${DIR}tools`);
    this.hitsbitmap = new AnimatedBitmap(`${DIR}hits`);
    this.draw();
  }

  override dispose(): void {
    super.dispose();
    this.cursorViewport.dispose();
  }

  isAnimating(): boolean {
    return this.counter > 0;
  }

  animate(hit: number): void {
    this.counter = 22;
    this.hit = hit;
  }

  /** Ruby's update draws the current frame of the animation and counts it down. */
  private draw(): void {
    const bitmap = this.bitmap!;
    bitmap.clear();
    const x = 32 * (this.position % MiningGameScene.BOARD_WIDTH);
    const y = 32 * Math.floor(this.position / MiningGameScene.BOARD_WIDTH);
    if (this.counter > 0) {
      this.counter -= 1;
      let toolx = x;
      let tooly = y;
      const i = 10 - Math.floor(this.counter / 2);
      switch (MiningGameCursor.TOOL_POSITIONS[i]![1]) {
        case 1:
          toolx -= 8;
          tooly += 8;
          break;
        case 2:
          toolx += 6;
          break;
      }
      bitmap.blt(toolx, tooly, this.toolbitmap.bitmap,
        new Rect(96 * MiningGameCursor.TOOL_POSITIONS[i]![0]!, 96 * this.mode, 96, 96));
      if (i < 5 && i % 2 === 0) {
        if (this.hit === 2) {
          bitmap.blt(x - 64, y, this.hitsbitmap.bitmap, new Rect(160 * 2, 0, 160, 160));
        } else {
          bitmap.blt(x - 64, y, this.hitsbitmap.bitmap, new Rect(160 * this.mode, 0, 160, 160));
        }
      }
      if (this.hit === 1 && i < 3) {
        bitmap.blt(x - 64, y, this.hitsbitmap.bitmap, new Rect(160 * i, 160, 160, 160));
      }
    } else {
      bitmap.blt(x, y + 64, this.cursorbitmap.bitmap, new Rect(32 * this.mode, 0, 32, 32));
    }
  }

  override update(dt?: number): void {
    super.update(dt);
    // One step of the animation per original frame (none on ticks without one).
    const frames = this.clock.tick();
    if (frames > 0 || this.counter === 0) {
      for (let n = Math.max(1, frames); n > 0; n--) this.draw();
    }
  }
}

/** ITEMS / IRON rows: [item, probability, graphic x, graphic y, width, height, pattern] and [graphic x, graphic y, width, height, pattern]. */
type MiningItem = [Id, number, number, number, number, number, number[]];
type MiningIron = [number, number, number, number, number[]];
/** A buried item: [index in ITEMS, x, y, revealed?] / iron: [index in IRON, x, y]. */
type Buried = [number, number, number, boolean?];

export class MiningGameScene {
  static readonly BOARD_WIDTH = 13;
  static readonly BOARD_HEIGHT = 10;
  static readonly ITEMS: MiningItem[] = [ // Item, probability, graphic x, graphic y, width, height, pattern
    ["DOMEFOSSIL", 20, 0, 3, 5, 4, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0]],
    ["HELIXFOSSIL", 5, 5, 3, 4, 4, [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]],
    ["HELIXFOSSIL", 5, 9, 3, 4, 4, [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1]],
    ["HELIXFOSSIL", 5, 13, 3, 4, 4, [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]],
    ["HELIXFOSSIL", 5, 17, 3, 4, 4, [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1]],
    ["OLDAMBER", 10, 21, 3, 4, 4, [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]],
    ["OLDAMBER", 10, 25, 3, 4, 4, [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1]],
    ["ROOTFOSSIL", 5, 0, 7, 5, 5, [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0]],
    ["ROOTFOSSIL", 5, 5, 7, 5, 5, [0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0]],
    ["ROOTFOSSIL", 5, 10, 7, 5, 5, [0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1]],
    ["ROOTFOSSIL", 5, 15, 7, 5, 5, [0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0]],
    ["SKULLFOSSIL", 20, 20, 7, 4, 4, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0]],
    ["ARMORFOSSIL", 20, 24, 7, 5, 4, [0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0]],
    ["CLAWFOSSIL", 5, 0, 12, 4, 5, [0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0]],
    ["CLAWFOSSIL", 5, 4, 12, 5, 4, [1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1]],
    ["CLAWFOSSIL", 5, 9, 12, 4, 5, [0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0]],
    ["CLAWFOSSIL", 5, 13, 12, 5, 4, [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1]],
    ["FIRESTONE", 20, 20, 11, 3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["WATERSTONE", 20, 23, 11, 3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 0]],
    ["THUNDERSTONE", 20, 26, 11, 3, 3, [0, 1, 1, 1, 1, 1, 1, 1, 0]],
    ["LEAFSTONE", 10, 18, 14, 3, 4, [0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0]],
    ["LEAFSTONE", 10, 21, 14, 4, 3, [0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0]],
    ["MOONSTONE", 10, 25, 14, 4, 2, [0, 1, 1, 1, 1, 1, 1, 0]],
    ["MOONSTONE", 10, 27, 16, 2, 4, [1, 0, 1, 1, 1, 1, 0, 1]],
    ["SUNSTONE", 20, 21, 17, 3, 3, [0, 1, 0, 1, 1, 1, 1, 1, 1]],
    ["OVALSTONE", 150, 24, 17, 3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["EVERSTONE", 150, 21, 20, 4, 2, [1, 1, 1, 1, 1, 1, 1, 1]],
    ["STARPIECE", 100, 0, 17, 3, 3, [0, 1, 0, 1, 1, 1, 0, 1, 0]],
    ["REVIVE", 100, 0, 20, 3, 3, [0, 1, 0, 1, 1, 1, 0, 1, 0]],
    ["MAXREVIVE", 50, 0, 23, 3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["RAREBONE", 50, 3, 17, 6, 3, [1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1]],
    ["RAREBONE", 50, 3, 20, 3, 6, [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1]],
    ["LIGHTCLAY", 100, 6, 20, 4, 4, [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1]],
    ["HARDSTONE", 200, 6, 24, 2, 2, [1, 1, 1, 1]],
    ["HEARTSCALE", 200, 8, 24, 2, 2, [1, 0, 1, 1]],
    ["IRONBALL", 100, 9, 17, 3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["ODDKEYSTONE", 100, 10, 20, 4, 4, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["HEATROCK", 50, 12, 17, 4, 3, [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["DAMPROCK", 50, 14, 20, 3, 3, [1, 1, 1, 1, 1, 1, 1, 0, 1]],
    ["SMOOTHROCK", 50, 17, 18, 4, 4, [0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0]],
    ["ICYROCK", 50, 17, 22, 4, 4, [0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1]],
    ["REDSHARD", 100, 21, 22, 3, 3, [1, 1, 1, 1, 1, 0, 1, 1, 1]],
    ["GREENSHARD", 100, 25, 20, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1]],
    ["YELLOWSHARD", 100, 25, 23, 4, 3, [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1]],
    ["BLUESHARD", 100, 26, 26, 3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 0]],
    ["INSECTPLATE", 10, 0, 26, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["DREADPLATE", 10, 4, 26, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["DRACOPLATE", 10, 8, 26, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["ZAPPLATE", 10, 12, 26, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["FISTPLATE", 10, 16, 26, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["FLAMEPLATE", 10, 20, 26, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["MEADOWPLATE", 10, 0, 29, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["EARTHPLATE", 10, 4, 29, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["ICICLEPLATE", 10, 8, 29, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["TOXICPLATE", 10, 12, 29, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["MINDPLATE", 10, 16, 29, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["STONEPLATE", 10, 20, 29, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["SKYPLATE", 10, 0, 32, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["SPOOKYPLATE", 10, 4, 32, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["IRONPLATE", 10, 8, 32, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    ["SPLASHPLATE", 10, 12, 32, 4, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
  ];

  static readonly IRON: MiningIron[] = [ // Graphic x, graphic y, width, height, pattern
    [0, 0, 1, 4, [1, 1, 1, 1]],
    [1, 0, 2, 4, [1, 1, 1, 1, 1, 1, 1, 1]],
    [3, 0, 4, 2, [1, 1, 1, 1, 1, 1, 1, 1]],
    [3, 2, 4, 1, [1, 1, 1, 1]],
    [7, 0, 3, 3, [1, 1, 1, 1, 1, 1, 1, 1, 1]],
    [0, 5, 3, 2, [1, 1, 0, 0, 1, 1]],
    [0, 7, 3, 2, [0, 1, 0, 1, 1, 1]],
    [3, 5, 3, 2, [0, 1, 1, 1, 1, 0]],
    [3, 7, 3, 2, [1, 1, 1, 0, 1, 0]],
    [6, 3, 2, 3, [1, 0, 1, 1, 0, 1]],
    [8, 3, 2, 3, [0, 1, 1, 1, 1, 0]],
    [6, 6, 2, 3, [1, 0, 1, 1, 1, 0]],
    [8, 6, 2, 3, [0, 1, 1, 1, 0, 1]],
  ];

  sprites: Sprites = {};
  private viewport!: Viewport;
  private itembitmap!: AnimatedBitmap;
  private ironbitmap!: AnimatedBitmap;
  items: Buried[] = [];
  itemswon: Id[] = [];
  iron: Buried[] = [];
  private frames = new OriginalFrames();

  private tile(i: number): MiningGameTile { return this.sprites[`tile${i}`] as MiningGameTile; }
  private get cursor(): MiningGameCursor { return this.sprites.cursor as MiningGameCursor; }
  private get crack(): MiningGameCounter { return this.sprites.crack as MiningGameCounter; }

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbStartScene(): Promise<void> {
    await preloadBitmaps(MINING_BITMAPS);
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    addBackgroundPlane(this.sprites, "bg", "Mining/miningbg", this.viewport);
    this.sprites.itemlayer = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.itembitmap = new AnimatedBitmap(`${DIR}items`);
    this.ironbitmap = new AnimatedBitmap(`${DIR}irons`);
    this.items = [];
    this.itemswon = [];
    this.iron = [];
    this.pbDistributeItems();
    this.pbDistributeIron();
    for (let i = 0; i < MiningGameScene.BOARD_HEIGHT; i++) {
      for (let j = 0; j < MiningGameScene.BOARD_WIDTH; j++) {
        this.sprites[`tile${j + (i * MiningGameScene.BOARD_WIDTH)}`] = new MiningGameTile(32 * j, 64 + (32 * i));
      }
    }
    this.sprites.crack = new MiningGameCounter(0, 4);
    this.sprites.cursor = new MiningGameCursor(58, 0); // central position, pick
    const tool = new IconSprite(434, 254, this.viewport);
    this.sprites.tool = tool;
    tool.setBitmapFile(`${DIR}toolicons`);
    tool.srcRect.set(0, 0, 68, 100);
    this.update();
    await pbFadeInAndShow(asHash(this.sprites));
  }

  pbDistributeItems(): void {
    const ITEMS = MiningGameScene.ITEMS;
    // Set items to be buried (index in ITEMS, x coord, y coord)
    let ptotal = 0;
    for (const i of ITEMS) ptotal += i[1];
    let numitems = 2 + rand(3);
    let tries = 0;
    while (numitems > 0) {
      let rnd = rand(ptotal);
      let added = false;
      for (let i = 0; i < ITEMS.length; i++) {
        rnd -= ITEMS[i]![1];
        if (rnd < 0) {
          if (this.pbNoDuplicateItems(ITEMS[i]![0])) {
            while (!added) {
              const provx = rand(MiningGameScene.BOARD_WIDTH - ITEMS[i]![4] + 1);
              const provy = rand(MiningGameScene.BOARD_HEIGHT - ITEMS[i]![5] + 1);
              if (this.pbCheckOverlaps(false, provx, provy, ITEMS[i]![4], ITEMS[i]![5], ITEMS[i]![6])) {
                this.items.push([i, provx, provy]);
                numitems -= 1;
                added = true;
              }
            }
          } else {
            break;
          }
        }
        if (added) break;
      }
      tries += 1;
      if (tries >= 500) break;
    }
    // Draw items on item layer
    const layer = (this.sprites.itemlayer as BitmapSprite | undefined)?.bitmap;
    for (const i of this.items) {
      const ox = ITEMS[i[0]]![2];
      const oy = ITEMS[i[0]]![3];
      const rectx = ITEMS[i[0]]![4];
      const recty = ITEMS[i[0]]![5];
      layer?.blt(32 * i[1], 64 + (32 * i[2]), this.itembitmap.bitmap, new Rect(32 * ox, 32 * oy, 32 * rectx, 32 * recty));
    }
  }

  pbDistributeIron(): void {
    const IRON = MiningGameScene.IRON;
    // Set iron to be buried (index in IRON, x coord, y coord)
    let numitems = 4 + rand(3);
    let tries = 0;
    while (numitems > 0) {
      const rnd = rand(IRON.length);
      const provx = rand(MiningGameScene.BOARD_WIDTH - IRON[rnd]![2] + 1);
      const provy = rand(MiningGameScene.BOARD_HEIGHT - IRON[rnd]![3] + 1);
      if (this.pbCheckOverlaps(true, provx, provy, IRON[rnd]![2], IRON[rnd]![3], IRON[rnd]![4])) {
        this.iron.push([rnd, provx, provy]);
        numitems -= 1;
      }
      tries += 1;
      if (tries >= 500) break;
    }
    // Draw items on item layer
    const layer = (this.sprites.itemlayer as BitmapSprite | undefined)?.bitmap;
    for (const i of this.iron) {
      const ox = IRON[i[0]]![0];
      const oy = IRON[i[0]]![1];
      const rectx = IRON[i[0]]![2];
      const recty = IRON[i[0]]![3];
      layer?.blt(32 * i[1], 64 + (32 * i[2]), this.ironbitmap.bitmap, new Rect(32 * ox, 32 * oy, 32 * rectx, 32 * recty));
    }
  }

  pbNoDuplicateItems(newitem: Id): boolean {
    if (newitem === "HEARTSCALE") return true; // Allow multiple Heart Scales
    const fossils = ["DOMEFOSSIL", "HELIXFOSSIL", "OLDAMBER", "ROOTFOSSIL",
      "SKULLFOSSIL", "ARMORFOSSIL", "CLAWFOSSIL"];
    const plates = ["INSECTPLATE", "DREADPLATE", "DRACOPLATE", "ZAPPLATE", "FISTPLATE",
      "FLAMEPLATE", "MEADOWPLATE", "EARTHPLATE", "ICICLEPLATE", "TOXICPLATE",
      "MINDPLATE", "STONEPLATE", "SKYPLATE", "SPOOKYPLATE", "IRONPLATE", "SPLASHPLATE"];
    for (const i of this.items) {
      const preitem = MiningGameScene.ITEMS[i[0]]![0];
      if (preitem === newitem) return false; // No duplicate items
      if (fossils.includes(preitem) && fossils.includes(newitem)) return false;
      if (plates.includes(preitem) && plates.includes(newitem)) return false;
    }
    return true;
  }

  pbCheckOverlaps(checkiron: boolean, provx: number, provy: number, provwidth: number, provheight: number, provpattern: number[]): boolean {
    const check = (prex: number, prey: number, prewidth: number, preheight: number, prepattern: number[]): boolean => {
      if (provx + provwidth <= prex || provx >= prex + prewidth ||
          provy + provheight <= prey || provy >= prey + preheight) return true;
      for (let j = 0; j < prepattern.length; j++) {
        if (prepattern[j] === 0) continue;
        const xco = prex + (j % prewidth);
        const yco = prey + Math.floor(j / prewidth);
        if (provx + provwidth <= xco || provx > xco ||
            provy + provheight <= yco || provy > yco) continue;
        if (provpattern[xco - provx + ((yco - provy) * provwidth)] === 1) return false;
      }
      return true;
    };
    for (const i of this.items) {
      const item = MiningGameScene.ITEMS[i[0]]!;
      if (!check(i[1], i[2], item[4], item[5], item[6])) return false;
    }
    if (checkiron) { // Check other irons as well
      for (const i of this.iron) {
        const iron = MiningGameScene.IRON[i[0]]!;
        if (!check(i[1], i[2], iron[2], iron[3], iron[4])) return false;
      }
    }
    return true;
  }

  async pbHit(): Promise<void> {
    let hittype = 0;
    const position = this.cursor.position;
    let pattern: number[];
    if (this.cursor.mode === 1) { // Hammer
      pattern = [1, 2, 1,
        2, 2, 2,
        1, 2, 1];
      if (!(DEBUG && Input.press(Input.CTRL))) this.crack.hits += 2;
    } else { // Pick
      pattern = [0, 1, 0,
        1, 2, 1,
        0, 1, 0];
      if (!(DEBUG && Input.press(Input.CTRL))) this.crack.hits += 1;
    }
    if (this.tile(position).layer <= pattern[4]! && this.pbIsIronThere(position)) {
      this.tile(position).layer -= pattern[4]!;
      pbSEPlay("Mining iron");
      hittype = 2;
    } else {
      for (let i = 0; i < 3; i++) {
        const ytile = i - 1 + Math.floor(position / MiningGameScene.BOARD_WIDTH);
        if (ytile < 0 || ytile >= MiningGameScene.BOARD_HEIGHT) continue;
        for (let j = 0; j < 3; j++) {
          const xtile = j - 1 + (position % MiningGameScene.BOARD_WIDTH);
          if (xtile < 0 || xtile >= MiningGameScene.BOARD_WIDTH) continue;
          this.tile(xtile + (ytile * MiningGameScene.BOARD_WIDTH)).layer -= pattern[j + (i * 3)]!;
        }
      }
      if (this.cursor.mode === 1) { // Hammer
        pbSEPlay("Mining hammer");
      } else {
        pbSEPlay("Mining pick");
      }
    }
    this.update();
    await Graphics.update();
    const hititem = (this.tile(position).layer === 0 && this.pbIsItemThere(position));
    if (hititem) hittype = 1;
    this.cursor.animate(hittype);
    const revealed = this.pbCheckRevealed();
    if (revealed.length > 0) {
      pbSEPlay("Mining reveal full");
      await this.pbFlashItems(revealed);
    } else if (hititem) {
      pbSEPlay("Mining reveal");
    }
  }

  pbIsItemThere(position: number): boolean {
    const posx = position % MiningGameScene.BOARD_WIDTH;
    const posy = Math.floor(position / MiningGameScene.BOARD_WIDTH);
    for (const i of this.items) {
      const index = i[0];
      const width = MiningGameScene.ITEMS[index]![4];
      const height = MiningGameScene.ITEMS[index]![5];
      const pattern = MiningGameScene.ITEMS[index]![6];
      if (posx < i[1] || posx >= (i[1] + width)) continue;
      if (posy < i[2] || posy >= (i[2] + height)) continue;
      const dx = posx - i[1];
      const dy = posy - i[2];
      if (pattern[dx + (dy * width)]! > 0) return true;
    }
    return false;
  }

  pbIsIronThere(position: number): boolean {
    const posx = position % MiningGameScene.BOARD_WIDTH;
    const posy = Math.floor(position / MiningGameScene.BOARD_WIDTH);
    for (const i of this.iron) {
      const index = i[0];
      const width = MiningGameScene.IRON[index]![2];
      const height = MiningGameScene.IRON[index]![3];
      const pattern = MiningGameScene.IRON[index]![4];
      if (posx < i[1] || posx >= (i[1] + width)) continue;
      if (posy < i[2] || posy >= (i[2] + height)) continue;
      const dx = posx - i[1];
      const dy = posy - i[2];
      if (pattern[dx + (dy * width)]! > 0) return true;
    }
    return false;
  }

  pbCheckRevealed(): number[] {
    const ret: number[] = [];
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i]![3]) continue;
      let revealed = true;
      const index = this.items[i]![0];
      const width = MiningGameScene.ITEMS[index]![4];
      const height = MiningGameScene.ITEMS[index]![5];
      const pattern = MiningGameScene.ITEMS[index]![6];
      for (let j = 0; j < height; j++) {
        for (let k = 0; k < width; k++) {
          const layer = this.tile(this.items[i]![1] + k + ((this.items[i]![2] + j) * MiningGameScene.BOARD_WIDTH)).layer;
          if (layer > 0 && pattern[k + (j * width)]! > 0) revealed = false;
          if (!revealed) break;
        }
        if (!revealed) break;
      }
      if (revealed) ret.push(i);
    }
    return ret;
  }

  async pbFlashItems(revealed: number[]): Promise<void> {
    if (revealed.length <= 0) return;
    const revealeditems = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    const halfFlashTime = Math.floor(RUBY_FRAME_RATE / 8);
    const alphaDiff = Math.ceil(255.0 / halfFlashTime);
    for (let i = 1; i <= halfFlashTime * 2; i++) {
      for (const index of revealed) {
        const burieditem = this.items[index]!;
        const item = MiningGameScene.ITEMS[burieditem[0]]!;
        revealeditems.bitmap!.blt(32 * burieditem[1], 64 + (32 * burieditem[2]),
          this.itembitmap.bitmap,
          new Rect(32 * item[2], 32 * item[3], 32 * item[4], 32 * item[5]));
        if (i > halfFlashTime) {
          revealeditems.color = new Color(255, 255, 255, ((halfFlashTime * 2) - i) * alphaDiff);
        } else {
          revealeditems.color = new Color(255, 255, 255, i * alphaDiff);
        }
      }
      await this.frames.update(() => this.update());
    }
    revealeditems.dispose();
    for (const index of revealed) {
      this.items[index]![3] = true;
      const item = MiningGameScene.ITEMS[this.items[index]![0]]![0];
      this.itemswon.push(item);
    }
  }

  async pbMain(): Promise<void> {
    pbSEPlay("Mining ping");
    await pbMessage(_INTL("Something pinged in the wall!\n{1} confirmed!", this.items.length));
    for (;;) {
      await this.frames.update(() => this.update());
      Input.update();
      if (this.cursor.isAnimating()) continue;
      // Check end conditions
      if (this.crack.hits >= 49) {
        this.cursor.visible = false;
        pbSEPlay("Mining collapse");
        const collapseviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
        collapseviewport.z = 99999;
        const collapse = new BitmapSprite(Graphics.width, Graphics.height, collapseviewport);
        this.sprites.collapse = collapse;
        const collapseTime = Math.floor((RUBY_FRAME_RATE * 8) / 10);
        const collapseFraction = Math.ceil(Graphics.height / collapseTime);
        for (let i = 1; i <= collapseTime; i++) {
          collapse.bitmap!.fillRect(0, collapseFraction * (i - 1),
            Graphics.width, collapseFraction * i, new Color(0, 0, 0));
          await this.frames.update();
        }
        await pbMessage(_INTL("The wall collapsed!"));
        break;
      }
      let foundall = true;
      for (const i of this.items) {
        if (!i[3]) foundall = false;
        if (!foundall) break;
      }
      if (foundall) {
        this.cursor.visible = false;
        await pbWait(Math.floor((RUBY_FRAME_RATE * 3) / 4));
        pbSEPlay("Mining found all");
        await pbMessage(_INTL("Everything was dug up!"));
        break;
      }
      // Input
      const W = MiningGameScene.BOARD_WIDTH;
      const pressed = (b: number) => Input.trigger(b) || Input.repeat(b);
      if (pressed(Input.UP)) {
        if (this.cursor.position >= W) {
          pbSEPlay("Mining cursor");
          this.cursor.position -= W;
        }
      } else if (pressed(Input.DOWN)) {
        if (this.cursor.position < (W * (MiningGameScene.BOARD_HEIGHT - 1))) {
          pbSEPlay("Mining cursor");
          this.cursor.position += W;
        }
      } else if (pressed(Input.LEFT)) {
        if (this.cursor.position % W > 0) {
          pbSEPlay("Mining cursor");
          this.cursor.position -= 1;
        }
      } else if (pressed(Input.RIGHT)) {
        if (this.cursor.position % W < (W - 1)) {
          pbSEPlay("Mining cursor");
          this.cursor.position += 1;
        }
      } else if (Input.trigger(Input.ACTION)) { // Change tool mode
        pbSEPlay("Mining tool change");
        const newmode = (this.cursor.mode + 1) % 2;
        this.cursor.mode = newmode;
        const tool = this.sprites.tool as IconSprite;
        tool.srcRect.set(newmode * 68, 0, 68, 100);
        tool.y = 254 - (144 * newmode);
      } else if (Input.trigger(Input.USE)) { // Hit
        await this.pbHit();
      } else if (Input.trigger(Input.BACK)) { // Quit
        if (await pbConfirmMessage(_INTL("Are you sure you want to give up?"))) break;
      }
    }
    await this.pbGiveItems();
  }

  async pbGiveItems(): Promise<void> {
    if (this.itemswon.length > 0) {
      for (const i of this.itemswon) {
        if (bag().add(i)) {
          await pbMessage(_INTL("One {1} was obtained.\\se[Mining item get]\\wtnp[30]",
            Item.get(i).name));
        } else {
          await pbMessage(_INTL("One {1} was found, but you have no room for it.",
            Item.get(i).name));
        }
      }
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class MiningGame {
  constructor(private scene: MiningGameScene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbMain();
    await this.scene.pbEndScene();
  }
}

export async function pbMiningGame(): Promise<void> {
  await pbFadeOutIn(async () => {
    const scene = new MiningGameScene();
    const screen = new MiningGame(scene);
    await screen.pbStartScreen();
  });
}
