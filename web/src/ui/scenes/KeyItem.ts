// Port of Plugins/BW Key Items/BW Key Item.rb (GetKeyItemScene, GetKeyItem,
// pbGetKeyItem).
//
// The animation counts raw 40 fps frames (eachFrame) and relies on mkxp-z's
// int opacity / float32 zoom and angle (rgssOpacity, f32).
//
// Ruby tells items (Symbols, :BICYCLE) from "fake items" (Strings,
// "iconPokegear") by class. The converted event scripts pass both as strings,
// so item IDs are recognised by their shape: Essentials item IDs are
// upper-case (A-Z, 0-9, _); fake item graphics are named in camelCase.

import { pbMEPlay } from "../../game/GameSystem";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color } from "../../rgss/types";
import { _INTL, Settings, pbDisposeSpriteHash } from "../messageConfig";
import { RPGCache, pbResolveBitmap, preloadBitmaps } from "../rpgCache";
import { IconSprite } from "../SpriteWrapper";
import { eachFrame, f32, pbWait, rgssOpacity } from "./frames";

/** True for an item ID (a Symbol in Ruby), false for a fake item's file name. */
export function isItemSymbol(item: string): boolean {
  return /^[A-Z0-9_]+$/.test(item);
}

/** pbReceiveItem(item, quantity): supplied by the caller (the item/bag port). */
export type ReceiveItem = (item: string, quantity: number) => Promise<unknown> | unknown;

const op = (s: Sprite, delta: number) => (s.opacity = rgssOpacity(s.opacity + delta));

export class GetKeyItemScene {
  private sprites: { whitescreen: Sprite; bg: Sprite; item: IconSprite } = null as never;
  private viewport!: Viewport;
  private finished = false;
  private fakeitem = false;

  constructor(
    private item: string,
    private quantity: number,
    private plural: unknown,
    private receiveItem: ReceiveItem | null = null,
  ) {}

  pbStartScene(): void {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height); // Updated DEFAULTSCREENHEIGHT
    this.viewport.z = 99999;
    this.finished = false;

    const whitescreen = new Sprite(this.viewport);
    whitescreen.color = new Color(255, 255, 255);
    whitescreen.opacity = 0;

    const bg = new Sprite(this.viewport);
    bg.setBitmap(RPGCache.loadBitmap("Graphics/Pictures/", "keyitembg"));
    bg.ox = Math.floor((bg.bitmap?.width ?? 0) / 2);
    bg.oy = Math.floor((bg.bitmap?.height ?? 0) / 2);
    bg.y = Math.floor(Settings.SCREEN_HEIGHT / 2); // Updated DEFAULTSCREENHEIGHT
    bg.x = Math.floor(Settings.SCREEN_WIDTH / 2); // Updated DEFAULTSCREENWIDTH
    bg.zoomY = 0;
    bg.zoomX = 0;
    bg.opacity = 0;

    let iconname: string;
    if (isItemSymbol(this.item)) {
      iconname = _INTL("Graphics/Items/Key Items/{1}_key", this.item);
      if (!pbResolveBitmap(iconname)) iconname = _INTL("Graphics/Items/{1}", this.item);
    } else {
      iconname = _INTL("Graphics/Items/Key Items/{1}", this.item);
      this.fakeitem = true;
    }

    const item = new IconSprite(Math.floor(Settings.SCREEN_WIDTH / 2), Math.floor(Settings.SCREEN_HEIGHT / 2), this.viewport);
    // Updated DEFAULTSCREENHEIGHT and DEFAULTSCREENWIDTH
    item.setBitmapFile(iconname);
    item.ox = Math.floor((item.bitmap?.width ?? 0) / 2);
    item.oy = Math.floor((item.bitmap?.height ?? 0) / 2);
    item.angle = 180;
    item.zoomY = 0;
    item.zoomX = 0;
    item.opacity = 0;
    this.sprites = { whitescreen, bg, item };
  }

  pbEndScene(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  private async turn(times: number, delta: number): Promise<void> {
    await eachFrame(times, () => {
      this.sprites.item.angle = f32(this.sprites.item.angle + delta);
    });
  }

  async shakeItem(): Promise<void> {
    await this.turn(3, 2);
    await this.turn(3, -2);
    await this.turn(3, -2);
    await this.turn(3, 2);
  }

  async pbUpdate(): Promise<void> {
    const { whitescreen, bg, item } = this.sprites;
    await pbWait(1);
    await eachFrame(10, () => void op(whitescreen, Math.floor(255 / 10)));
    await eachFrame(10, () => void op(whitescreen, -Math.floor(255 / 10)));
    let frametome = 0;
    await eachFrame(18, () => {
      frametome += 1;
      if (item.angle !== 0) item.angle = f32(item.angle - Math.floor(15 / 2));
      if (item.angle < 0) item.angle = 0;
      if (frametome === 7) pbMEPlay("Key item get"); // Updated ME to Essentials Default
      if (bg.zoomY < 1.75) bg.zoomY = f32(bg.zoomY + 0.1 / 2);
      if (bg.zoomX < 1.75) bg.zoomX = f32(bg.zoomX + 0.1 / 2);
      op(bg, 14.16);
      item.zoomY = f32(item.zoomY + 0.17 / 2);
      item.zoomX = f32(item.zoomX + 0.17 / 2);
      op(item, 14.16);
    });
    await eachFrame(12, () => {
      if (item.angle !== 0) item.angle = f32(item.angle - Math.floor(15 / 2));
      if (item.angle < 0) item.angle = 0;

      if (bg.zoomY > 1) bg.zoomY = f32(bg.zoomY + 0.1 / 2);
      if (bg.zoomX > 1) bg.zoomX = f32(bg.zoomX + 0.1 / 2);
      if (bg.zoomX < 1) bg.zoomX = 1;
      if (bg.zoomY < 1) bg.zoomY = 1;

      if (item.zoomY > 1) item.zoomY = f32(item.zoomY - 0.17 / 2);
      if (item.zoomX > 1) item.zoomX = f32(item.zoomX - 0.17 / 2);
      if (item.zoomX < 1) item.zoomX = 1;
      if (item.zoomY < 1) item.zoomY = 1;
    });
    item.angle = 0;
    item.zoomY = 1;
    item.zoomX = 1;
    bg.zoomY = 1;
    bg.zoomX = 1;
    await this.shakeItem();
    await this.shakeItem();
    await pbWait(6);
    await eachFrame(18, () => {
      bg.zoomY = f32(bg.zoomY - 0.15 / 2);
      bg.zoomX = f32(bg.zoomX + 0.1 / 2);
      op(bg, -14.16);
      item.zoomY = f32(item.zoomY - 0.17 / 2);
      item.zoomX = f32(item.zoomX - 0.17 / 2);
      op(item, -14.16);
    });
    // Deleted Kernel. and @plural
    if (!this.fakeitem) await this.receiveItem?.(this.item, this.quantity);
    void this.plural;
    void this.finished;
  }
}

//===============================================================================
//
//===============================================================================
export class GetKeyItem {
  constructor(private scene: GetKeyItemScene) {}

  async pbStartScreen(): Promise<void> {
    this.scene.pbStartScene();
    await this.scene.pbUpdate();
    this.scene.pbEndScene();
  }
}

/** Graphics the scene may draw for `item`. */
export function keyItemBitmaps(item: string): string[] {
  const paths = ["Graphics/Pictures/keyitembg"];
  if (isItemSymbol(item)) paths.push(`Graphics/Items/Key Items/${item}_key`, `Graphics/Items/${item}`);
  else paths.push(`Graphics/Items/Key Items/${item}`);
  return paths;
}

export async function pbGetKeyItem(item: string, quantity = 1, plural: unknown = null, receiveItem: ReceiveItem | null = null): Promise<void> {
  await preloadBitmaps(keyItemBitmaps(item));
  const scene = new GetKeyItemScene(item, quantity, plural, receiveItem);
  const screen = new GetKeyItem(scene);
  await screen.pbStartScreen();
}
