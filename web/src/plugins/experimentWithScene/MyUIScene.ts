// Port of Plugins/ExperimentWithScene/MyUI_Scene.rb: MyUI::Scene (the
// game author's experiment with Elite Battle: DX's scene camera on the
// Trainer Card background) and MyUIScreen. Scene Camera.rb reopens the class
// (SceneCamera.ts adds those methods).
//
// No event, item or plugin opens this scene; `MyUIScreen.new(MyUI::Scene.new)
// .pbStartScreen` is registered for event scripts (index.ts) and the dev page
// opens it (dev-plugin-scenes.html?scene=myui).
//
// NOTE (Ruby parity): pbStartScene never finishes: @vector.spoof(@vector)
// (MyUI_Scene.rb:153) raises TypeError ("can't convert nil into Float"), so
// pbMyUI and pbEndScene aren't reached and the scene's sprites stay on
// screen. The port raises the same error at the same point.

import { assetExists } from "../../core/assets";
import { DEBUG } from "../../core/debug";
import { TrainerType } from "../../data/gameData/trainerType";
import { pbSEPlay } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { rubyNoMethodError } from "../../game/scripts/rubyErrors";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { pbFadeOutAndHide } from "../../ui/fades";
import { pbDisposeSpriteHash } from "../../ui/messageConfig";
import { pbPlayCloseMenuSE } from "../../ui/options/options";
import { preloadBitmaps, RPGCache } from "../../ui/rpgCache";
import { asHash } from "../../ui/scenes/frames";
import { IconSprite } from "../../ui/SpriteWrapper";
import { FRAME_RATE } from "../../ui/frameTime";
import { Vector } from "./MathFunctions";
import { MyUI, type VectorData } from "./MyUIModule";

const CARD = "Graphics/Pictures/Trainer Card/card";
const resolve = (path: string): string | null => (assetExists(path) ? path : null);

/** PBDebug.log */
const debugLog = (msg: string): void => {
  if (DEBUG) console.info(msg);
};

/** MyUI::Scene */
export class MyUIScene {
  viewport!: Viewport;
  sprites: Record<string, Sprite> = {};
  pokemon: unknown = null;
  vector!: Vector;
  /** @orgPos (set by Scene Camera.rb's animateScene) */
  orgPos: number[] | null = null;
  /** @scale (adjustMetrics) */
  scale = 0;
  /** @scene and @defaultvector: read by spoof, never set. */
  scene: { vector: Vector } | null = null;
  defaultvector: VectorData | null = null;

  //-----------------------------------------------------------------------------
  //  updates scene graphics
  //-----------------------------------------------------------------------------
  async pbGraphicsUpdate(): Promise<void> {
    await Graphics.update();
  }

  async pbUpdate(_cw: unknown = null): Promise<void> {
    await this.pbGraphicsUpdate();
    // pbInputUpdate
    // pbFrameUpdate(cw)
    // pbUpdateSpriteHash(@sprites)
  }

  //-----------------------------------------------------------------------------
  // battler sprite positioning
  //-----------------------------------------------------------------------------
  delta(): number { return FRAME_RATE / 40.0; }
  scaleY(): number { return this.sprites["bg"]!.zoomY; }
  battler(i: number): Sprite | undefined { return this.sprites[`battler${i}`]; }
  trainer(i: number): Sprite | undefined { return this.sprites[`trainer_${i}`]; }

  /** NOTE (Ruby parity): @scene is never set, so this raises NoMethodError (MyUI_Scene.rb:48). */
  spoof(vector: VectorData, index = 1): [number, number] {
    const target = this.battler(index);
    if (!this.scene) rubyNoMethodError("undefined method `vector' for nil:NilClass");
    const [bx, by] = this.scene.vector.spoof(vector);
    // updates to the spatial warping with respect to the scene vector
    const dv = this.defaultvector!;
    const [dx, dy] = this.scene.vector.spoof(dv);
    const bzoomX = this.scale * ((bx - vector[0]!) * 1.0 / (dx - dv[0]!) * 1.0) ** 0.6;
    const bzoomY = this.scale * ((by - vector[1]!) * 1.0 / (dy - dv[1]!) * 1.0) ** 0.6;
    const t = target as unknown as { ex: number; ey: number };
    const x = bx - (this.sprites["bg"]!.ox - t.ex) * bzoomX;
    const y = by - (this.sprites["bg"]!.oy - t.ey) * bzoomY;
    return [x, y];
  }

  async pbStartScene(): Promise<void> {
    debugLog("");
    debugLog("START MY SCENE");

    this.orgPos = null;

    MyUI.addVector("PLAYER",
      238, 332,
      32,
      292,
      1,
    );

    const vec = MyUI.getVector("PLAYER", null);

    vec[0]! -= Math.floor(Graphics.width / 2);
    this.vector = new Vector(...vec);
    this.sprites = {};
    // @vector.battle = @battle

    // viewport setup
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;

    const player = G.player as unknown as { trainerType: string; outfit?: number };
    const plfile = TrainerType.playerFrontSpriteFilename(player.trainerType, resolve, player.outfit ?? 0);
    await preloadBitmaps([CARD, ...(plfile ? [plfile] : [])]); // (Ruby loads them where they're used)

    this.sprites["bg"] = new Sprite(this.viewport);
    this.sprites["bg"].z = 0;
    const tbmp = RPGCache.loadBitmap(CARD)!; // pbBitmap
    this.sprites["bg"].setBitmap(new Bitmap(tbmp.width, tbmp.height));
    this.sprites["bg"].bitmap!.blt(0, 0, tbmp, tbmp.rect());

    this.pbAddSprite("player", 0, 0, plfile, this.viewport);

    if (this.sprites["player"]!.bitmap == null) {
      if (DEBUG) console.info("ARRIVED DIDNT LOAD PLAYER BITMAP"); // Console.echo_li
    }

    // NOTE (Ruby parity): this replaces the IconSprite pbAddSprite just made
    // without disposing it, so the player's front sprite stays drawn at (0, 0)
    // until the viewport goes (MyUI_Scene.rb:130).
    this.sprites["player"] = new Sprite(this.viewport);
    this.sprites["player"].x = 40 * 100;
    // @sprites["player"].y = Graphics.height - @sprites["player"].bitmap.height
    this.sprites["player"].y = 50;

    this.sprites["player"].z = 50;
    this.sprites["player"].opacity = 0;
    this.sprites["player"].srcRect.width = Math.floor(this.sprites["player"].srcRect.width / 5);

    this.vector.force();
    this.vector.set(vec);
    this.vector.inc = 0.1;

    await this.wait(60, true);
    this.vector.inc = 0.2;

    this.moveEntireScene(-200, -200, true, false);
    await this.wait(1, false);

    this.animateScene(true);

    this.vector.spoof(this.vector); // raises TypeError (see the header)
    this.sprites["bg"].zoomX = 10;
    this.sprites["bg"].zoomY = 10;

    // battler sprite positioning
    this.adjustMetrics();

    // pbFadeInAndShow(@sprites) { pbUpdate }
  }

  pbAddSprite(id: string, x: number, y: number, filename: string | null, viewport: Viewport): Sprite {
    const sprite = (this.sprites[id] as IconSprite | undefined) ?? new IconSprite(x, y, viewport);
    if (filename) sprite.setBitmapFile(filename); // (setBitmap(filename) rescue nil)
    this.sprites[id] = sprite;
    return sprite;
  }

  adjustMetrics(): void {
    // Still need to understand what this does
    // @scale = EliteBattle::ROOM_SCALE
    this.scale = 2;
  }

  async pbMyUI(): Promise<void> {
    pbSEPlay("GUI trainer card open");
    for (;;) {
      await Graphics.update();
      Input.update();
      await this.pbUpdate(); // (a second Graphics.update per loop, as in Ruby)
      if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      }
    }
  }

  async pbEndScene(): Promise<void> {
    // The block (pbUpdate) only updates the screen, which pbFadeOutAndHide does itself.
    await pbFadeOutAndHide(asHash(this.sprites), () => {});
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

//===============================================================================
//
//===============================================================================
export class MyUIScreen {
  constructor(private scene: MyUIScene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbMyUI();
    await this.scene.pbEndScene();
  }
}
