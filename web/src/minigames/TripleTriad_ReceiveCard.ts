// Port of Plugins/Triple Triad Booster Packs/TripleTriad_ReceiveCard.rb
// (pbGiveTriadCardWithAnimation): the BW Key Item animation (see
// ui/scenes/KeyItem.ts) showing a Triple Triad card, then pbGiveTriadCard.
//
// The animation counts raw 40 fps frames (eachFrame) with mkxp-z's int
// opacity and float32 zoom/angle (rgssOpacity, f32).

import type { Id } from "../data/gameData/gameData";
import { pbMEPlay } from "../game/GameSystem";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Color } from "../rgss/types";
import { _INTL, Settings, pbDisposeSpriteHash } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { RPGCache, preloadBitmaps } from "../ui/rpgCache";
import { eachFrame, f32, pbWait, rgssOpacity } from "../ui/scenes/frames";
import { pbGiveTriadCard, preloadTriadCards, TriadCard } from "./TripleTriad";

const op = (s: Sprite, delta: number) => (s.opacity = rgssOpacity(s.opacity + delta));

export class ReceiveCardScene {
  private sprites: { whitescreen: Sprite; bg: Sprite; item: Sprite } = null as never;
  private viewport!: Viewport;
  private finished = false;

  constructor(private card: Id, private quantity: number) {}

  async pbStartScene(): Promise<void> {
    await preloadBitmaps(["Graphics/Pictures/keyitembg"]);
    await preloadTriadCards([this.card]);
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
    const item = new Sprite();
    // (Settings::SCREEN_WIDTH/2,Settings::SCREEN_HEIGHT/2,@viewport)
    // # Updated DEFAULTSCREENHEIGHT and DEFAULTSCREENWIDTH
    const triadBitmap = new TriadCard(this.card).createModifiedBitmap(1);

    item.x = Math.floor(Graphics.width / 2);
    item.y = Math.floor(Graphics.height / 2);
    item.z = 99999;
    item.setBitmap(triadBitmap);

    //  @sprites["item"].setBitmap(TriadCard.new(cards[i]).createModifiedBitmap(2))
    item.ox = Math.floor(item.bitmap!.width / 2);
    item.oy = Math.floor(item.bitmap!.height / 2);
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
      item.zoomY = f32(item.zoomY + 0.34 / 2);
      item.zoomX = f32(item.zoomX + 0.34 / 2);
      op(item, 14.16);
    });
    await eachFrame(12, () => {
      if (item.angle !== 0) item.angle = f32(item.angle - Math.floor(15 / 2));
      if (item.angle < 0) item.angle = 0;

      if (bg.zoomY > 1) bg.zoomY = f32(bg.zoomY + 0.1 / 2);
      if (bg.zoomX > 1) bg.zoomX = f32(bg.zoomX + 0.1 / 2);
      if (bg.zoomX < 1) bg.zoomX = 1;
      if (bg.zoomY < 1) bg.zoomY = 1;

      if (item.zoomY > 2) item.zoomY = f32(item.zoomY - 0.17 / 2);
      if (item.zoomX > 2) item.zoomX = f32(item.zoomX - 0.17 / 2);
      if (item.zoomX < 2) item.zoomX = 1;
      if (item.zoomY < 2) item.zoomY = 1;
    });
    item.angle = 0;
    item.zoomY = 2;
    item.zoomX = 2;
    bg.zoomY = 1;
    bg.zoomX = 1;
    await this.shakeItem();
    await this.shakeItem();
    await pbWait(60);
    await eachFrame(18, () => {
      bg.zoomY = f32(bg.zoomY - 0.15 / 2);
      bg.zoomX = f32(bg.zoomX + 0.1 / 2);
      op(bg, -14.16);
      item.zoomY = f32(item.zoomY - 0.34 / 2);
      item.zoomX = f32(item.zoomX - 0.34 / 2);
      op(item, -14.16);
    });
    pbGiveTriadCard(this.card, this.quantity);
    const speciesname = new TriadCard(this.card).name;
    await pbMessage(_INTL("You obtained a\\c[1] {1}\\c[0] card!\\wtnp[30]", speciesname));
    await pbMessage(_INTL("You put the {1} Card in your Binder.", speciesname));
  }
}

//###################################################

export class ReceiveCard {
  constructor(private scene: ReceiveCardScene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbUpdate();
    this.scene.pbEndScene();
  }
}

export async function pbGiveTriadCardWithAnimation(item: Id, quantity = 1): Promise<void> {
  const scene = new ReceiveCardScene(item, quantity);
  const screen = new ReceiveCard(scene);
  await screen.pbStartScreen();
}
