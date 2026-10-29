// Port of Plugins/BW Gender Selector (BWGenderSelector.rb, BWGenderSettings.rb).
//
// The plugin animates with raw `n.times { Graphics.update; ... }` loops, i.e.
// steps of one 40 fps frame; eachFrame keeps those durations and values.
// Sprite arithmetic goes through rgssOpacity/f32 so the int opacity and
// float32 zoom behave like mkxp-z's (pbShow ends at opacity 250, and the
// `zoom_x != 2.0` checks see the same float32 values).

import { G } from "../../game/globals";
import { pbChangePlayer } from "../../game/scripts/overworld";
import { Sprite, Viewport } from "../../rgss/display";
import type { Bitmap } from "../../rgss/Bitmap";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { pbDisposeSpriteHash, _INTL } from "../messageConfig";
import { pbConfirmMessage, pbCreateMessageWindow, pbMessage, pbMessageDisplay } from "../messages";
import { RPGCache, preloadBitmaps } from "../rpgCache";
import type { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";
import { pbTrainerName } from "../textEntry/playerName";
import { preloadTextEntry } from "../textEntry/UI_TextEntry";
import { eachFrame, f32, rgssOpacity } from "./frames";

//===============================================================================
// CUSTOMITAZION (BWGenderSettings.rb)
//===============================================================================
export const WRITETRAINERNAME = true;
export const TRAINERMALE = "Graphics/Pictures/introBoy";
export const TRAINERFEMALE = "Graphics/Pictures/introGirl";
export const BOY_SELECTED_SWITCH = 140;
export const GIRL_SELECTED_SWITCH = 141;

type Sprites = {
  bg: Sprite; gendergirl: Sprite; genderboy: Sprite; girl: Sprite; boy: Sprite; msgwindow: Window_AdvancedTextPokemon;
};

const op = (s: Sprite, delta: number) => (s.opacity = rgssOpacity(s.opacity + delta));
const zoomBy = (s: Sprite, dx: number, dy: number) => {
  s.zoomX = f32(s.zoomX + dx);
  s.zoomY = f32(s.zoomY + dy);
};

/** $game_switches[id] = value (Game_Switches#[]= also refreshes the map). */
function setSwitch(id: number, value: boolean): void {
  G.gameSwitches.set(id, value);
  const map = G.gameMap as unknown as { needRefresh?: boolean } | null;
  if (map) map.needRefresh = true;
}

export class GenderSelectorScene {
  private sprites!: Sprites;
  private viewport!: Viewport;
  private select = -1;
  private finished = false;
  private barwidth = 0;
  private barheight = 0;
  private totalframeg = 1;
  private totalframeb = 1;
  BOYX = 0;
  GENDERBOYX = 0;
  GIRLX = 0;
  GENDERGIRLX = 0;

  pbStartScene(): void {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.select = -1;
    this.finished = false;
    const vp = this.viewport;
    const s = {} as Sprites;
    this.sprites = s;

    //===================================================
    // Create bars
    //===================================================
    s.bg = new Sprite(vp);
    s.bg.setBitmap(RPGCache.loadBitmap("Graphics/Pictures/", "introbg"));

    s.gendergirl = new Sprite(vp);
    s.gendergirl.setBitmap(RPGCache.loadBitmap("Graphics/Pictures/", "genderselect"));
    s.gendergirl.y = Math.floor(Graphics.height / 2);
    s.gendergirl.x = Graphics.width;
    s.genderboy = new Sprite(vp);
    s.genderboy.setBitmap(RPGCache.loadBitmap("Graphics/Pictures/", "genderselect"));
    s.genderboy.y = Math.floor(Graphics.height / 2);
    this.barwidth = s.gendergirl.bitmap?.width ?? 0;
    this.barheight = Math.floor((s.gendergirl.bitmap?.height ?? 0) / 2);
    const bw = this.barwidth, bh = this.barheight;
    s.gendergirl.srcRect.set(0, 0, bw, bh);
    s.genderboy.srcRect.set(0, bh, bw, bh);
    s.gendergirl.oy = Math.floor(bh / 2);
    s.genderboy.oy = Math.floor(bh / 2);
    s.gendergirl.ox = Math.floor(bw / 2) - Math.floor(bw / 6);
    s.genderboy.ox = Math.floor(bw / 2) + Math.floor(bw / 6);

    //===================================================
    // Create trainer sprites
    //===================================================
    const trainer = (file: string, x: number): [Sprite, number] => {
      const spr = new Sprite(vp);
      spr.setBitmap(RPGCache.loadBitmap(file));
      const bmp = spr.bitmap as Bitmap | null;
      const w = bmp?.width ?? 1, h = bmp?.height ?? 1;
      spr.zoomX = 2.0;
      spr.zoomY = 2.0;
      let totalframe = Math.floor(w / h);
      if (totalframe < 1) totalframe = 1;
      const realwidth = Math.floor(w / totalframe);
      spr.srcRect.set((totalframe - 1) * realwidth, 0, realwidth, h);
      spr.oy = Math.floor(h / 2);
      spr.ox = Math.floor(realwidth / 2);
      spr.x = x;
      spr.y = Math.floor(Graphics.height / 2);
      return [spr, totalframe];
    };
    [s.girl, this.totalframeg] = trainer(TRAINERFEMALE, 412);
    [s.boy, this.totalframeb] = trainer(TRAINERMALE, 100);

    this.BOYX = s.boy.x;
    this.GENDERBOYX = s.genderboy.x;

    this.GIRLX = s.girl.x;
    this.GENDERGIRLX = s.gendergirl.x;

    s.msgwindow = pbCreateMessageWindow(this.viewport);

    s.bg.opacity = 0;
    s.genderboy.opacity = 0;
    s.boy.opacity = 0;
    s.gendergirl.opacity = 0;
    s.girl.opacity = 0;
  }

  pbEndScene(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  private fadeAll(delta: number): Promise<void> {
    const s = this.sprites;
    return eachFrame(10, () => {
      op(s.bg, delta);
      op(s.genderboy, delta);
      op(s.boy, delta);
      op(s.gendergirl, delta);
      op(s.girl, delta);
    });
  }

  pbHide(): Promise<void> {
    return this.fadeAll(-25.5);
  }

  pbShow(): Promise<void> {
    return this.fadeAll(25.5);
  }

  async selectBoy(): Promise<void> {
    const s = this.sprites;
    let frame = 0;
    await eachFrame(6, () => {
      frame += 1;
      s.genderboy.tone.set(0, 0, 0, 0);
      s.boy.tone.set(0, 0, 0, 0);

      s.genderboy.x += 12;
      s.boy.x += 12;

      if (this.select === -1) {
        s.gendergirl.x += 6;
        s.girl.x += 6;
      } else {
        s.gendergirl.x += 12;
        s.girl.x += 12;
      }

      if (s.boy.zoomX !== 2.0) s.boy.zoomX = f32(s.boy.zoomX + 0.015 * 2);
      if (s.boy.zoomY !== 2.0) s.boy.zoomY = f32(s.boy.zoomY + 0.015 * 2);
      if (s.genderboy.zoomX !== 1.0) s.genderboy.zoomX = f32(s.genderboy.zoomX + 0.015 * 2);
      if (s.genderboy.zoomY !== 1.0) s.genderboy.zoomY = f32(s.genderboy.zoomY + 0.015 * 2);

      zoomBy(s.gendergirl, -0.015, -0.015);
      zoomBy(s.girl, -0.015 * 2, -0.015 * 2);

      if (frame === 4) {
        s.gendergirl.tone.set(-20, -20, -20, 100);
        s.girl.tone.set(-60, -60, -60, 100);
      }
    });
    this.select = 0;
  }

  async selectGirl(): Promise<void> {
    const s = this.sprites;
    let frame = 0;
    await eachFrame(6, () => {
      frame += 1;
      s.gendergirl.tone.set(0, 0, 0, 0);
      s.girl.tone.set(0, 0, 0, 0);
      s.gendergirl.x -= 12;
      s.girl.x -= 12;

      if (this.select === -1) {
        s.genderboy.x -= 6;
        s.boy.x -= 6;
      } else {
        s.genderboy.x -= 12;
        s.boy.x -= 12;
      }

      if (s.girl.zoomX !== 2.0) s.girl.zoomX = f32(s.girl.zoomX + 0.015 * 2);
      if (s.girl.zoomY !== 2.0) s.girl.zoomY = f32(s.girl.zoomY + 0.015 * 2);
      if (s.gendergirl.zoomX !== 1.0) s.gendergirl.zoomX = f32(s.gendergirl.zoomX + 0.015 * 2);
      if (s.gendergirl.zoomY !== 1.0) s.gendergirl.zoomY = f32(s.gendergirl.zoomY + 0.015 * 2);

      zoomBy(s.genderboy, -0.015, -0.015);
      zoomBy(s.boy, -0.015 * 2, -0.015 * 2);

      if (frame === 4) {
        s.genderboy.tone.set(-20, -20, -20, 100);
        s.boy.tone.set(-60, -60, -60, 100);
      }
    });
    this.select = 1;
  }

  async selection(): Promise<void> {
    const s = this.sprites;
    const half = Math.floor(Graphics.width / 2);
    if (this.select === 0) { // Boy is selected
      const actualboyx = s.boy.x;
      await eachFrame(22, () => { // Animation
        s.gendergirl.x += 16;
        s.girl.x += 12;
        s.genderboy.x += 16;
        s.genderboy.zoomY = f32(s.genderboy.zoomY - 0.008);
        if (s.boy.x !== half) s.boy.x += 12;
        if (s.boy.x > half) s.boy.x = half;
      });

      if (!(await pbConfirmMessage(_INTL("You're a boy, right?")))) {
        await eachFrame(22, () => {
          s.gendergirl.x -= 16;
          s.girl.x -= 12;
          s.genderboy.x -= 16;
          s.genderboy.zoomY = f32(s.genderboy.zoomY + 0.008);
          if (s.boy.x !== actualboyx) s.boy.x -= 12;
          if (s.boy.x < actualboyx) s.boy.x = actualboyx;
          s.msgwindow.visible = true;
        });
      } else {
        pbChangePlayer(1);
        setSwitch(BOY_SELECTED_SWITCH, true);
        setSwitch(GIRL_SELECTED_SWITCH, false);
        s.msgwindow.visible = false;
        await pbMessage("I'd like to know your name.\nPlease tell me.");
        await this.selectName();
      }
    } else { // Girl is selected
      const actualgirlx = s.girl.x;
      await eachFrame(22, () => { // Animation
        s.genderboy.x -= 16;
        s.boy.x -= 12;
        s.gendergirl.x -= 16;
        s.gendergirl.zoomY = f32(s.gendergirl.zoomY - 0.008);
        if (s.girl.x !== half) s.girl.x -= 12;
        if (s.girl.x < half) s.girl.x = half;
      });

      if (!(await pbConfirmMessage(_INTL("You're a girl, right?")))) {
        await eachFrame(22, () => {
          s.genderboy.x += 16;
          s.boy.x += 12;
          s.gendergirl.x += 16;
          s.gendergirl.zoomY = f32(s.gendergirl.zoomY + 0.008);
          if (s.girl.x !== actualgirlx) s.girl.x += 12;
          if (s.girl.x > actualgirlx) s.girl.x = actualgirlx;
          s.msgwindow.visible = true;
        });
      } else {
        pbChangePlayer(2);
        setSwitch(GIRL_SELECTED_SWITCH, true);
        setSwitch(BOY_SELECTED_SWITCH, false);
        s.msgwindow.visible = false;
        await pbMessage("I'd like to know your name.\nPlease tell me.");
        await this.selectName();
      }
    }
  }

  async selectName(): Promise<void> {
    if (WRITETRAINERNAME) {
      await this.pbHide();
      await pbTrainerName();
      const name = (G.player as unknown as { name: string }).name;
      if (!(await pbConfirmMessage(_INTL("Your name is {1}?", name)))) {
        await this.selectName();
      } else {
        this.finished = true;
      }
    } else {
      this.finished = true;
    }
  }

  async pbUpdate(): Promise<void> {
    await this.pbShow();
    await pbMessageDisplay(this.sprites.msgwindow, _INTL("Are you a boy?\nOr a girl?"));
    await this.selectBoy();
    for (;;) {
      await Graphics.update();
      Input.update();

      if (Input.trigger(Input.LEFT)) {
        if (this.select !== 0) await this.selectBoy();
      } else if (Input.trigger(Input.RIGHT)) {
        if (this.select !== 1) await this.selectGirl();
      }

      if (Input.trigger(Input.C)) await this.selection();

      if (this.finished) break;
    }
  }
}

//===============================================================================
//
//===============================================================================
export class GenderSelector {
  constructor(private scene: GenderSelectorScene) {}

  async pbStartScreen(): Promise<void> {
    this.scene.pbStartScene();
    await this.scene.pbUpdate();
    this.scene.pbEndScene();
  }
}

/** Graphics the scene draws (the name entry preloads its own). */
export const GENDER_SELECTOR_BITMAPS = ["Graphics/Pictures/introbg", "Graphics/Pictures/genderselect", TRAINERMALE, TRAINERFEMALE];

export async function pbGenderSelector(): Promise<void> {
  await preloadBitmaps(GENDER_SELECTOR_BITMAPS);
  await preloadTextEntry(0);
  const scene = new GenderSelectorScene();
  const screen = new GenderSelector(scene);
  await screen.pbStartScreen();
}
