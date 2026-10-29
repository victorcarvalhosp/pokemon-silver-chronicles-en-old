// Port of 009_Scenes/002_EventScene.rb (PictureSprite, pbTextBitmap,
// EventScene, pbEventScreen) and the Event class it uses from
// 003_Game processing/005_Event_Handlers.rb.
//
// Ruby's EventScene subclasses do their setup in initialize, which may block
// (pictureWait, Graphics.transition). Constructors can't await here, so
// subclasses put that part in `async initialize()`, which pbEventScreen (and
// anyone else creating a scene) awaits right after `new`.

import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { drawFormattedTextEx } from "../drawText";
import { pbFadeOutIn } from "../fades";
import { pbSetSystemFont } from "../messageConfig";
import { PictureEx, setPictureSprite } from "./PictureEx";

type Callback = (sender: unknown, args: unknown[]) => void | Promise<void>;

/** Defines an event that procedures can subscribe to. */
export class Event {
  private callbacks: Callback[] = [];

  /** Sets an event handler for this event and removes all other event handlers. */
  set(method: Callback): void {
    this.callbacks.length = 0;
    this.callbacks.push(method);
  }

  /** Removes an event handler procedure from the event (Ruby's -). */
  remove(other: Callback): this {
    const i = this.callbacks.indexOf(other);
    if (i >= 0) this.callbacks.splice(i, 1);
    return this;
  }

  /** Adds an event handler procedure to the event (Ruby's +). */
  add(other: Callback): this {
    if (!this.callbacks.includes(other)) this.callbacks.push(other);
    return this;
  }

  /** Clears the event of event handlers. */
  clear(): void {
    this.callbacks.length = 0;
  }

  /**
   * Triggers the event and calls all its event handlers with (sender, [other
   * args]). Like Ruby's Array#each, handlers that clear or replace the list
   * while running end the iteration.
   */
  async trigger(sender: unknown, ...args: unknown[]): Promise<void> {
    for (let i = 0; i < this.callbacks.length; i++) await this.callbacks[i]!(sender, args);
  }
}

export class PictureSprite extends Sprite {
  private picture: PictureEx;
  private pictureBitmap: AnimatedBitmap | null = null;
  private customBitmap: Bitmap | AnimatedBitmap | null = null;
  private customBitmapIsBitmap = true;
  private hue = 0;
  private pictureName: string | undefined = undefined;

  constructor(viewport: Viewport | null, picture: PictureEx) {
    super(viewport);
    this.picture = picture;
    this.update();
  }

  override dispose(): void {
    this.pictureBitmap?.dispose();
    super.dispose();
  }

  /** Doesn't free the bitmap */
  setCustomBitmap(bitmap: Bitmap | AnimatedBitmap): void {
    this.customBitmap = bitmap;
    this.customBitmapIsBitmap = this.customBitmap instanceof Bitmap;
  }

  /** self.bitmap = b (mkxp-z only resets src_rect when the bitmap changes). */
  private assignBitmap(b: Bitmap | null): void {
    if (b !== this.bitmap) this.setBitmap(b);
  }

  override update(dt?: number): void {
    super.update(dt);
    this.pictureBitmap?.update();
    // If picture file name is different from current one
    if (this.customBitmap && this.picture.name === "") {
      this.assignBitmap(this.customBitmapIsBitmap ? (this.customBitmap as Bitmap) : (this.customBitmap as AnimatedBitmap).bitmap);
    } else if (this.pictureName !== this.picture.name || Math.trunc(this.picture.hue) !== Math.trunc(this.hue)) {
      // Remember file name to instance variables
      this.pictureName = this.picture.name;
      this.hue = Math.trunc(this.picture.hue);
      // If file name is not empty
      if (this.pictureName === "") {
        this.pictureBitmap?.dispose();
        this.pictureBitmap = null;
        this.visible = false;
        return;
      }
      // Get picture graphic
      this.pictureBitmap?.dispose();
      this.pictureBitmap = new AnimatedBitmap(this.pictureName, this.hue);
      this.assignBitmap(this.pictureBitmap ? this.pictureBitmap.bitmap : null);
    } else if (this.pictureName === "") {
      // Set sprite to invisible
      this.visible = false;
      return;
    }
    setPictureSprite(this, this.picture);
  }
}

export function pbTextBitmap(text: string, maxwidth = Graphics.width): Bitmap {
  const tmp = new Bitmap(maxwidth, Graphics.height);
  pbSetSystemFont(tmp);
  drawFormattedTextEx(tmp, 0, 4, maxwidth, text, new Color(248, 248, 248), new Color(168, 184, 184));
  return tmp;
}

//===============================================================================
// EventScene
//===============================================================================
export class EventScene {
  onCTrigger = new Event();
  onBTrigger = new Event();
  onUpdate = new Event();
  protected viewport: Viewport | null;
  protected pictures: PictureEx[] = [];
  protected picturesprites: PictureSprite[] = [];
  protected usersprites: (Sprite | null)[] = [];
  private _disposed = false;

  constructor(viewport: Viewport | null = null) {
    this.viewport = viewport;
  }

  /** The blocking part of Ruby's initialize (see the file header). */
  async initialize(): Promise<void> {}

  dispose(): void {
    if (this.disposed()) return;
    for (const sprite of this.picturesprites) sprite.dispose();
    for (const sprite of this.usersprites) sprite?.dispose();
    this.onCTrigger.clear();
    this.onBTrigger.clear();
    this.onUpdate.clear();
    this.pictures.length = 0;
    this.picturesprites.length = 0;
    this.usersprites.length = 0;
    this._disposed = true;
  }

  disposed(): boolean {
    return this._disposed;
  }

  /**
   * `bitmap` can be a Bitmap or an AnimatedBitmap (update method isn't called
   * if it's animated). EventScene doesn't take ownership of the passed-in bitmap.
   */
  addBitmap(x: number, y: number, bitmap: Bitmap | AnimatedBitmap): PictureEx {
    const num = this.pictures.length;
    const picture = new PictureEx(num);
    picture.setXY(0, x, y);
    picture.setVisible(0, true);
    this.pictures[num] = picture;
    this.picturesprites[num] = new PictureSprite(this.viewport, picture);
    this.picturesprites[num]!.setCustomBitmap(bitmap);
    return picture;
  }

  addLabel(x: number, y: number, width: number, text: string): PictureEx {
    return this.addBitmap(x, y, pbTextBitmap(text, width));
  }

  addImage(x: number, y: number, name: string): PictureEx {
    const num = this.pictures.length;
    const picture = new PictureEx(num);
    picture.name = name;
    picture.setXY(0, x, y);
    picture.setVisible(0, true);
    this.pictures[num] = picture;
    this.picturesprites[num] = new PictureSprite(this.viewport, picture);
    return picture;
  }

  addUserSprite(sprite: Sprite): void {
    this.usersprites.push(sprite);
  }

  getPicture(num: number): PictureEx | undefined {
    return this.pictures[num];
  }

  async wait(frames: number): Promise<void> {
    for (let i = 0; i < frames; i++) await this.update();
  }

  async pictureWait(extraframes = 0): Promise<void> {
    for (;;) {
      let hasRunning = false;
      for (const pic of this.pictures) if (pic.running()) hasRunning = true;
      if (!hasRunning) break;
      await this.update();
    }
    for (let i = 0; i < extraframes; i++) await this.update();
  }

  async update(): Promise<void> {
    if (this.disposed()) return;
    await Graphics.update();
    Input.update();
    for (const picture of this.pictures) picture.update();
    for (const sprite of this.picturesprites) sprite.update();
    for (const sprite of this.usersprites) {
      if (!sprite || sprite.isDisposed() || !(sprite instanceof Sprite)) continue;
      sprite.update();
    }
    await this.onUpdate.trigger(this);
    if (Input.trigger(Input.BACK)) {
      await this.onBTrigger.trigger(this);
    } else if (Input.trigger(Input.USE)) {
      await this.onCTrigger.trigger(this);
    }
  }

  async main(): Promise<void> {
    while (!this.disposed()) await this.update();
  }
}

//===============================================================================
//
//===============================================================================
/** An EventScene subclass; `preload` (if any) fetches its graphics first. */
export type EventSceneClass = (new (viewport: Viewport | null) => EventScene) & { preload?(): Promise<void> };

export async function pbEventScreen(cls: EventSceneClass): Promise<void> {
  await cls.preload?.(); // (Ruby loads graphics synchronously; see rpgCache.ts)
  await pbFadeOutIn(async () => {
    const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    viewport.z = 99999;
    try {
      // PBDebug.logonerr
      const scene = new cls(viewport);
      await scene.initialize();
      await scene.main();
    } finally {
      viewport.dispose();
    }
  });
}
