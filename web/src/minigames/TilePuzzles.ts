// Port of 017_Minigames/007_Minigame_TilePuzzles.rb ("Tile Puzzle"
// mini-games, by Maruno; graphics by the__end).
// Run with pbTilePuzzle(game, board, width, height):
//   game = 1 (Ruins of Alph puzzle), 2 (Ruins of Alph puzzle plus tile rotations),
//          3 (Mystic Square), 4 (swap two adjacent tiles),
//          5 (swap two adjacent tiles plus tile rotations), 6 (Rubik's square),
//          7 (rotate selected tile plus adjacent tiles at once).
//   board = The name/number of the graphics to be used.
//   width,height = Optional, the number of tiles wide/high the puzzle is (0 for
//                  the default value of 4).
//
// The animations count frames (scaled by Graphics.frame_rate) and move
// tiles a fixed distance per frame, so the loops run per original 40 fps
// frame (common.ts).

import { rand } from "../core/random";
import { pbSEPlay } from "../game/GameSystem";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Rect, Tone } from "../rgss/types";
import { AnimatedBitmap } from "../ui/AnimatedBitmap";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../ui/fades";
import { pbDisposeSpriteHash, pbUpdateSpriteHash } from "../ui/messageConfig";
import { addBackgroundPlane } from "../ui/planes";
import { pbResolveBitmap, preloadBitmaps } from "../ui/rpgCache";
import { asHash, f32, pbWait, rgssOpacity, type Sprites } from "../ui/scenes/frames";
import { BitmapSprite } from "../ui/SpriteWrapper";
import { OriginalFrames, RUBY_FRAME_RATE, rubyShuffle } from "./common";

const DIR = "Graphics/Pictures/Tile Puzzle/";
const div = (a: number, b: number) => Math.floor(a / b);

export class TilePuzzleCursor extends BitmapSprite {
  game: number;
  position: number;
  arrows: boolean[] = [];
  selected = false;
  holding = false;
  private cursorbitmap: AnimatedBitmap;
  private cursorViewport: Viewport;

  constructor(game: number, position: number, private tilewidth: number, private tileheight: number,
    private boardwidth: number, private boardheight: number) {
    const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    viewport.z = 99999;
    super(Graphics.width, Graphics.height, viewport);
    this.cursorViewport = viewport;
    this.game = game;
    this.position = position;
    this.arrows = [];
    this.selected = false;
    this.holding = false;
    this.cursorbitmap = new AnimatedBitmap(`${DIR}cursor`);
    this.update();
  }

  override dispose(): void {
    super.dispose();
    this.cursorViewport.dispose();
  }

  override update(dt?: number): void {
    super.update(dt);
    const bitmap = this.bitmap!;
    bitmap.clear();
    const { tilewidth, tileheight, boardwidth, boardheight } = this;
    const cb = this.cursorbitmap;
    let x = div(Graphics.width - (tilewidth * boardwidth), 2);
    if (this.position >= boardwidth * boardheight) {
      x = div(x - (tilewidth * div(boardwidth, 2)), 2) - 10;
      if ((this.position % boardwidth) >= div(boardwidth, 2)) {
        x = Graphics.width - x - (tilewidth * boardwidth);
      }
    }
    x += tilewidth * (this.position % boardwidth);
    let y = div(Graphics.height - (tileheight * boardheight), 2) - 32;
    y += tileheight * div(this.position % (boardwidth * boardheight), boardwidth);
    this.tone = new Tone(0, (this.holding ? 64 : 0), (this.holding ? 64 : 0), 0);
    // Cursor
    if (this.game !== 3) {
      const expand = (this.holding) ? 0 : 4;
      for (let i = 0; i < 4; i++) {
        bitmap.blt(
          x + ((i % 2) * (tilewidth - div(cb.width, 4))) + (expand * (((i % 2) * 2) - 1)),
          y + (div(i, 2) * (tileheight - div(cb.height, 2))) + (expand * ((div(i, 2) * 2) - 1)),
          cb.bitmap, new Rect(div((i % 2) * cb.width, 4),
            div(div(i, 2) * cb.height, 2),
            div(cb.width, 4), div(cb.height, 2)),
        );
      }
    }
    // Arrows
    if (this.selected || this.game === 3) {
      const expand = (this.game === 3) ? 0 : 4;
      const xin = [div(tilewidth - div(cb.width, 4), 2), -expand,
        tilewidth - div(cb.width, 4) + expand, div(tilewidth - div(cb.width, 4), 2)];
      const yin = [tileheight - div(cb.height, 2) + expand, div(tileheight - div(cb.height, 2), 2),
        div(tileheight - div(cb.height, 2), 2), -expand];
      for (let i = 0; i < 4; i++) {
        if (!this.arrows[i]) continue;
        bitmap.blt(x + xin[i]!, y + yin[i]!, cb.bitmap,
          new Rect(div(cb.width, 2) + ((i % 2) * div(cb.width, 4)),
            div(i, 2) * div(cb.height, 2),
            div(cb.width, 4), div(cb.height, 2)));
      }
    }
  }
}

export class TilePuzzleScene {
  private game: number;
  private board: string;
  boardwidth: number;
  boardheight: number;
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private tilebitmap!: AnimatedBitmap;
  private tilebitmap1: AnimatedBitmap | null = null;
  private tilebitmap2: AnimatedBitmap | null = null;
  private tilebitmap3: AnimatedBitmap | null = null;
  tilewidth = 0;
  tileheight = 0;
  heldtile = -1;
  angles: number[] = [];
  tiles: number[] = [];
  private frames = new OriginalFrames();

  constructor(game: number, board: unknown, width: number, height: number) {
    this.game = game;
    this.board = String(board);
    this.boardwidth = (width > 0) ? width : 4;
    this.boardheight = (height > 0) ? height : 4;
  }

  private tile(i: number): BitmapSprite { return this.sprites[`tile${i}`] as BitmapSprite; }
  private get cursor(): TilePuzzleCursor { return this.sprites.cursor as TilePuzzleCursor; }

  /** Graphics.update; Input.update (sprites updated every tick, see common.ts) */
  private async frame(): Promise<void> {
    await this.frames.update(() => pbUpdateSpriteHash(this.sprites as never));
    Input.update();
  }

  update(): void {
    const xtop = div(Graphics.width - (this.tilewidth * this.boardwidth), 2);
    const ytop = div(Graphics.height - (this.tileheight * this.boardheight), 2) + div(this.tileheight, 2) - 32;
    for (let i = 0; i < this.boardwidth * this.boardheight; i++) {
      let pos = -1;
      for (let j = 0; j < this.tiles.length; j++) {
        if (this.tiles[j] === i) pos = j;
      }
      const t = this.tile(i);
      t.z = 0;
      t.tone = new Tone(0, 0, 0, 0);
      if (this.heldtile === i) {
        pos = this.cursor.position;
        t.z = 1;
        if (this.tiles[pos]! >= 0) t.tone = new Tone(64, 0, 0, 0);
      }
      let thisx = xtop;
      if (pos >= 0) {
        if (pos >= this.boardwidth * this.boardheight) {
          thisx = div(xtop - (this.tilewidth * div(this.boardwidth, 2)), 2) - 10;
          if ((pos % this.boardwidth) >= div(this.boardwidth, 2)) {
            thisx = Graphics.width - thisx - (this.tilewidth * this.boardwidth);
          }
        }
        t.x = thisx + (this.tilewidth * (pos % this.boardwidth)) + div(this.tilewidth, 2);
        t.y = ytop + (this.tileheight * div(pos % (this.boardwidth * this.boardheight), this.boardwidth));
        if (this.game === 3) continue;
        const rotatebitmaps = [this.tilebitmap, this.tilebitmap1, this.tilebitmap2, this.tilebitmap3];
        t.bitmap!.clear();
        const src = new Rect(this.tilewidth * (i % this.boardwidth), this.tileheight * div(i, this.boardwidth), this.tilewidth, this.tileheight);
        const rotated = rotatebitmaps[this.angles[i]!];
        if (rotated) {
          t.bitmap!.blt(0, 0, rotated.bitmap, src);
          t.angle = 0;
        } else {
          t.bitmap!.blt(0, 0, this.tilebitmap.bitmap, src);
          t.angle = this.angles[i]! * 90;
        }
      }
    }
    this.updateCursor();
    pbUpdateSpriteHash(this.sprites as never);
  }

  updateCursor(): void {
    const arrows: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      arrows.push(this.pbCanMoveInDir(this.cursor.position, (i + 1) * 2, this.game === 6));
    }
    this.cursor.arrows = arrows;
  }

  /** The graphics this puzzle uses. */
  static bitmaps(board: string): string[] {
    return [`${DIR}bg${board}`, `${DIR}bg`, `${DIR}tiles${board}`, `${DIR}tiles${board}_1`, `${DIR}tiles${board}_2`,
      `${DIR}tiles${board}_3`, `${DIR}cursor`];
  }

  async pbStartScene(): Promise<void> {
    await preloadBitmaps(TilePuzzleScene.bitmaps(this.board));
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    if (pbResolveBitmap(`${DIR}bg${this.board}`)) {
      addBackgroundPlane(this.sprites, "bg", `Tile Puzzle/bg${this.board}`, this.viewport);
    } else {
      addBackgroundPlane(this.sprites, "bg", "Tile Puzzle/bg", this.viewport);
    }
    this.tilebitmap = new AnimatedBitmap(`${DIR}tiles${this.board}`);
    this.tilebitmap1 = null;
    this.tilebitmap2 = null;
    this.tilebitmap3 = null;
    if (pbResolveBitmap(`${DIR}tiles${this.board}_1`)) {
      this.tilebitmap1 = new AnimatedBitmap(`${DIR}tiles${this.board}_1`);
    }
    if (pbResolveBitmap(`${DIR}tiles${this.board}_2`)) {
      this.tilebitmap2 = new AnimatedBitmap(`${DIR}tiles${this.board}_2`);
    }
    if (pbResolveBitmap(`${DIR}tiles${this.board}_3`)) {
      this.tilebitmap3 = new AnimatedBitmap(`${DIR}tiles${this.board}_3`);
    }
    this.tilewidth = div(this.tilebitmap.width, this.boardwidth);
    this.tileheight = div(this.tilebitmap.height, this.boardheight);
    for (let i = 0; i < this.boardwidth * this.boardheight; i++) {
      const t = new BitmapSprite(this.tilewidth, this.tileheight, this.viewport);
      this.sprites[`tile${i}`] = t;
      t.ox = div(this.tilewidth, 2);
      t.oy = div(this.tileheight, 2);
      if (this.game === 3 && i >= (this.boardwidth * this.boardheight) - 1) break;
      t.bitmap!.blt(0, 0, this.tilebitmap.bitmap,
        new Rect(this.tilewidth * (i % this.boardwidth), this.tileheight * div(i, this.boardwidth), this.tilewidth, this.tileheight));
    }
    this.heldtile = -1;
    this.angles = [];
    this.tiles = this.pbShuffleTiles();
    this.sprites.cursor = new TilePuzzleCursor(this.game, this.pbDefaultCursorPosition(),
      this.tilewidth, this.tileheight, this.boardwidth, this.boardheight);
    this.update();
    await pbFadeInAndShow(asHash(this.sprites));
  }

  pbShuffleTiles(): number[] {
    let ret: number[] = [];
    for (let i = 0; i < this.boardwidth * this.boardheight; i++) {
      ret.push(i);
      this.angles.push(0);
    }
    switch (this.game) {
      case 6:
        this.tiles = ret;
        for (let n = 0; n < 5; n++) {
          void this.pbShiftLine([2, 4, 6, 8][rand(4)]!, rand(this.boardwidth * this.boardheight), false);
        }
        return this.tiles;
      case 7:
        this.tiles = ret;
        for (let n = 0; n < 5; n++) {
          void this.pbRotateTile(rand(this.boardwidth * this.boardheight), false);
        }
        break;
      default:
        rubyShuffle(ret);
        if (this.game === 3) { // Make sure only solvable Mystic Squares are allowed.
          let num = 0;
          let blank = -1;
          const last = (this.boardwidth * this.boardheight) - 1;
          for (let i = 0; i < ret.length - 1; i++) {
            if (ret[i] === last) blank = i;
            for (let j = i; j < ret.length; j++) {
              if (ret[j]! < ret[i]! && ret[i] !== last && ret[j] !== last) num += 1;
            }
          }
          if (this.boardwidth % 2 === 1) {
            if (num % 2 === 1) ret = this.pbShuffleTiles();
          } else if ((num % 2 === 0) === ((this.boardheight - div(blank, this.boardwidth)) % 2 === 0)) {
            ret = this.pbShuffleTiles();
          }
        }
        if (this.game === 1 || this.game === 2) {
          const ret2: number[] = [];
          for (let i = 0; i < this.boardwidth * this.boardheight; i++) ret2.push(-1);
          ret = ret2.concat(ret);
        }
        if (this.game === 2 || this.game === 5) {
          for (let i = 0; i < this.angles.length; i++) this.angles[i] = rand(4);
        }
    }
    return ret;
  }

  pbDefaultCursorPosition(): number {
    if (this.game === 3) {
      for (let i = 0; i < this.boardwidth * this.boardheight; i++) {
        if (this.tiles[i] === (this.boardwidth * this.boardheight) - 1) return i;
      }
    }
    return 0;
  }

  pbMoveCursor(pos: number, dir: number): number {
    const w = this.boardwidth;
    const h = this.boardheight;
    switch (dir) {
      case 2:
        pos += w;
        break;
      case 4:
        if (pos >= w * h) {
          if (pos % w === div(w, 2)) {
            pos = (div(pos % (w * h), w) * w) + w - 1;
          } else {
            pos -= 1;
          }
        } else if ((pos % w) === 0) {
          pos = ((div(pos, w) + h) * w) + div(w, 2) - 1;
        } else {
          pos -= 1;
        }
        break;
      case 6:
        if (pos >= w * h) {
          if (pos % w === div(w, 2) - 1) {
            pos = div(pos % (w * h), w) * w;
          } else {
            pos += 1;
          }
        } else if (pos % w >= w - 1) {
          pos = ((div(pos, w) + h) * w) + div(w, 2);
        } else {
          pos += 1;
        }
        break;
      case 8:
        pos -= w;
        break;
    }
    return pos;
  }

  pbCanMoveInDir(pos: number, dir: number, swapping: boolean): boolean {
    const w = this.boardwidth;
    const h = this.boardheight;
    if (this.game === 6 && swapping) return true;
    switch (dir) {
      case 2:
        if (div(pos, w) % h >= h - 1) return false;
        break;
      case 4:
        if (this.game === 1 || this.game === 2) {
          if (pos >= w * h && pos % w === 0) return false;
        } else if (pos % w === 0) {
          return false;
        }
        break;
      case 6:
        if (this.game === 1 || this.game === 2) {
          if (pos >= w * h && pos % w >= w - 1) return false;
        } else if (pos % w >= w - 1) {
          return false;
        }
        break;
      case 8:
        if (div(pos, w) % h === 0) return false;
        break;
    }
    return true;
  }

  async pbRotateTile(pos: number, anim = true): Promise<void> {
    if (this.heldtile >= 0) {
      if (anim) {
        this.cursor.visible = false;
        const t = this.tile(this.heldtile);
        t.z = 1;
        const oldAngle = t.angle;
        const rotateTime = Math.floor(RUBY_FRAME_RATE / 4);
        const angleDiff = 90.0 / rotateTime;
        for (let n = 0; n < rotateTime; n++) {
          t.angle = f32(t.angle - angleDiff);
          await this.frame();
        }
        t.z = 0;
        t.angle = oldAngle - 90;
        if (!this.pbCheckWin()) this.cursor.visible = true;
      }
      this.angles[this.heldtile]! -= 1;
      if (this.angles[this.heldtile]! < 0) this.angles[this.heldtile]! += 4;
    } else {
      if (this.tiles[pos]! < 0) return;
      const group = this.pbGetNearTiles(pos);
      if (anim) {
        this.cursor.visible = false;
        const oldAngles: number[] = [];
        for (const i of group) {
          this.tile(this.tiles[i]!).z = 1;
          oldAngles[i] = this.tile(this.tiles[i]!).angle;
        }
        const rotateTime = Math.floor(RUBY_FRAME_RATE / 4);
        const angleDiff = 90.0 / rotateTime;
        for (let n = 0; n < rotateTime; n++) {
          for (const i of group) {
            const t = this.tile(this.tiles[i]!);
            t.angle = f32(t.angle - angleDiff);
          }
          await this.frame();
        }
        for (const i of group) {
          this.tile(this.tiles[i]!).z = 0;
          this.tile(this.tiles[i]!).angle = oldAngles[i]! - 90;
        }
        if (!this.pbCheckWin()) this.cursor.visible = true;
      }
      for (const i of group) {
        const tile = this.tiles[i]!;
        this.angles[tile]! -= 1;
        if (this.angles[tile]! < 0) this.angles[tile]! += 4;
      }
    }
  }

  pbGetNearTiles(pos: number): number[] {
    const ret = [pos];
    if (this.game === 7) {
      for (const i of [2, 4, 6, 8]) {
        if (this.pbCanMoveInDir(pos, i, true)) ret.push(this.pbMoveCursor(pos, i));
      }
    }
    return ret;
  }

  async pbSwapTiles(dir: number): Promise<boolean> {
    const cursor = this.cursor.position;
    if (this.game === 6) return this.pbShiftLine(dir, cursor);
    const movetile = this.pbMoveCursor(cursor, dir);
    this.cursor.visible = false;
    this.tile(this.tiles[cursor]!).z = 1;
    const swapTime = Math.floor((RUBY_FRAME_RATE * 3) / 10);
    if ([2, 8].includes(dir)) { // Swap vertically
      const distancePerFrame = Math.ceil(this.tileheight / swapTime);
      const dist = div(dir, 4) - 1;
      for (let n = 0; n < swapTime; n++) {
        this.tile(this.tiles[movetile]!).y += dist * distancePerFrame;
        this.tile(this.tiles[cursor]!).y -= dist * distancePerFrame;
        await this.frame();
      }
    } else { // Swap horizontally
      const distancePerFrame = Math.ceil(this.tilewidth / swapTime);
      const dist = dir - 5;
      for (let n = 0; n < swapTime; n++) {
        this.tile(this.tiles[movetile]!).x -= dist * distancePerFrame;
        this.tile(this.tiles[cursor]!).x += dist * distancePerFrame;
        await this.frame();
      }
    }
    [this.tiles[cursor], this.tiles[movetile]] = [this.tiles[movetile]!, this.tiles[cursor]!];
    this.tile(this.tiles[cursor]!).z = 0;
    this.cursor.position = movetile;
    this.cursor.selected = false;
    if (!this.pbCheckWin()) this.cursor.visible = true;
    return true;
  }

  async pbShiftLine(dir: number, cursor: number, anim = true): Promise<boolean> {
    // Get tiles involved
    const tiles: number[] = [];
    let dist = 0;
    if ([2, 8].includes(dir)) {
      dist = div(dir, 4) - 1;
      // NOTE (Ruby parity): 007_Minigame_TilePuzzles.rb:412 bounds the column
      // walk with (width - 1) * height instead of (height - 1) * width; the
      // same on square boards (all of this game's), wrong on others.
      while ((dist > 0 && cursor < (this.boardwidth - 1) * this.boardheight) ||
             (dist < 0 && cursor >= this.boardwidth)) {
        cursor += (this.boardwidth * dist);
      }
      for (let i = 0; i < this.boardheight; i++) tiles.push(cursor - (i * dist * this.boardwidth));
    } else {
      dist = dir - 5;
      while ((dist > 0 && cursor % this.boardwidth > 0) ||
             (dist < 0 && cursor % this.boardwidth < this.boardwidth - 1)) {
        cursor -= dist;
      }
      for (let i = 0; i < this.boardwidth; i++) tiles.push(cursor + (i * dist));
    }
    // Shift tiles
    const fadeTime = Math.floor((RUBY_FRAME_RATE * 4) / 10);
    const fadeDiff = Math.ceil(255.0 / fadeTime);
    if (anim) {
      this.cursor.visible = false;
      for (let n = 0; n < fadeTime; n++) {
        const t = this.tile(this.tiles[tiles[tiles.length - 1]!]!);
        t.opacity = rgssOpacity(t.opacity - fadeDiff);
        await this.frames.update();
        Input.update();
      }
      const shiftTime = Math.floor((RUBY_FRAME_RATE * 3) / 10);
      if ([2, 8].includes(dir)) {
        const distancePerFrame = Math.ceil(this.tileheight / shiftTime);
        for (let n = 0; n < shiftTime; n++) {
          for (const i of tiles) this.tile(this.tiles[i]!).y -= dist * distancePerFrame;
          await this.frame();
        }
      } else {
        const distancePerFrame = Math.ceil(this.tilewidth / shiftTime);
        for (let n = 0; n < shiftTime; n++) {
          for (const i of tiles) this.tile(this.tiles[i]!).x += dist * distancePerFrame;
          await this.frame();
        }
      }
    }
    const temp: number[] = [];
    for (const i of tiles) temp.push(this.tiles[i]!);
    for (let i = 0; i < temp.length; i++) {
      this.tiles[tiles[(i + 1) % (temp.length)]!] = temp[i]!;
    }
    if (anim) {
      this.update();
      for (let n = 0; n < fadeTime; n++) {
        const t = this.tile(this.tiles[tiles[0]!]!);
        t.opacity = rgssOpacity(t.opacity + fadeDiff);
        await this.frames.update();
        Input.update();
      }
      this.cursor.selected = false;
      if (!this.pbCheckWin()) this.cursor.visible = true;
    }
    return true;
  }

  pbGrabTile(pos: number): void {
    [this.heldtile, this.tiles[pos]] = [this.tiles[pos]!, this.heldtile];
    this.cursor.holding = (this.heldtile >= 0);
    if (this.pbCheckWin()) this.cursor.visible = false;
  }

  pbCheckWin(): boolean {
    for (let i = 0; i < this.boardwidth * this.boardheight; i++) {
      if (this.tiles[i] !== i) return false;
      if (this.angles[i] !== 0) return false;
    }
    return true;
  }

  async pbMain(): Promise<boolean> {
    for (;;) {
      this.update();
      await this.frames.update(() => this.update());
      Input.update();
      // Check end conditions
      if (this.pbCheckWin()) {
        this.cursor.visible = false;
        if (this.game === 3) {
          const extratile = this.tile((this.boardwidth * this.boardheight) - 1);
          extratile.bitmap!.clear();
          extratile.bitmap!.blt(0, 0, this.tilebitmap.bitmap,
            new Rect(this.tilewidth * (this.boardwidth - 1), this.tileheight * (this.boardheight - 1),
              this.tilewidth, this.tileheight));
          extratile.opacity = 0;
          const appearTime = Math.floor((RUBY_FRAME_RATE * 8) / 10);
          const opacityDiff = Math.ceil(255.0 / appearTime);
          for (let n = 0; n < appearTime; n++) {
            extratile.opacity = rgssOpacity(extratile.opacity + opacityDiff);
            await this.frames.update();
            Input.update();
          }
        } else {
          await pbWait(Math.floor(RUBY_FRAME_RATE / 2));
        }
        for (;;) {
          await this.frames.update();
          Input.update();
          if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) break;
        }
        return true;
      }
      // Input
      this.cursor.selected = (Input.press(Input.USE) && this.game >= 3 && this.game <= 6);
      let dir = 0;
      if (Input.trigger(Input.DOWN) || Input.repeat(Input.DOWN)) dir = 2;
      if (Input.trigger(Input.LEFT) || Input.repeat(Input.LEFT)) dir = 4;
      if (Input.trigger(Input.RIGHT) || Input.repeat(Input.RIGHT)) dir = 6;
      if (Input.trigger(Input.UP) || Input.repeat(Input.UP)) dir = 8;
      if (dir > 0) {
        if (this.game === 3 || (this.game !== 3 && this.cursor.selected)) {
          if (this.pbCanMoveInDir(this.cursor.position, dir, true)) {
            pbSEPlay("Tile Game cursor");
            await this.pbSwapTiles(dir);
          }
        } else if (this.pbCanMoveInDir(this.cursor.position, dir, false)) {
          pbSEPlay("Tile Game cursor");
          this.cursor.position = this.pbMoveCursor(this.cursor.position, dir);
        }
      } else if ((this.game === 1 || this.game === 2) && Input.trigger(Input.USE)) {
        this.pbGrabTile(this.cursor.position);
      } else if ((this.game === 2 && Input.trigger(Input.ACTION)) ||
                 (this.game === 5 && Input.trigger(Input.ACTION)) ||
                 (this.game === 7 && Input.trigger(Input.USE))) {
        await this.pbRotateTile(this.cursor.position);
      } else if (Input.trigger(Input.BACK)) {
        return false;
      }
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class TilePuzzle {
  constructor(private scene: TilePuzzleScene) {}

  async pbStartScreen(): Promise<boolean> {
    await this.scene.pbStartScene();
    const ret = await this.scene.pbMain();
    await this.scene.pbEndScene();
    return ret;
  }
}

export async function pbTilePuzzle(game: number, board: unknown, width = 0, height = 0): Promise<boolean> {
  let ret = false;
  await pbFadeOutIn(async () => {
    const scene = new TilePuzzleScene(game, board, width, height);
    const screen = new TilePuzzle(scene);
    ret = await screen.pbStartScreen();
  });
  return ret;
}
