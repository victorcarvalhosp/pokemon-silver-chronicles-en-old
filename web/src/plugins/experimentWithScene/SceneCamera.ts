// Port of Plugins/ExperimentWithScene/Scene Camera.rb: reopens MyUI::Scene
// with Elite Battle: DX's scene-camera helpers (animateScene,
// moveEntireScene, wait, setVector, revertMoveTransformations), most of
// whose bodies the game's author commented out. scale_y and the
// vector/sprites readers are the same as in MyUI_Scene.rb (MyUIScene.ts).
//
// wait(frames) counts original 40 fps frames: animateScene runs once per
// original frame (eachFrame), as Ruby's `frames.times { animateScene;
// Graphics.update }`.

import { rand } from "../../core/random";
import { DEBUG } from "../../core/debug";
import { rubyNoMethodError } from "../../game/scripts/rubyErrors";
import { eachFrame } from "../../ui/scenes/frames";
import { MyUI } from "./MyUIModule";
import { MyUIScene } from "./MyUIScene";

/** Console.echo_li */
const echoLi = (msg: string): void => {
  if (DEBUG) console.info(msg);
};

const methods = {
  //-----------------------------------------------------------------------------
  //  Misc code to automate sprite animation and placement
  //-----------------------------------------------------------------------------
  animateScene(this: MyUIScene, _align = false, _smanim = false, _block?: () => void): void {
    echoLi("ARRIVED ON animateScene");
    echoLi(`${this.sprites["player"]}`);
    echoLi(`${this.vector}`);

    if (this.orgPos == null) this.orgPos = [this.vector.x, this.vector.y, this.vector.angle, this.vector.scale, this.vector.zoom1];

    // (special intro animations, line-ups, dex data: commented out)
    // vector update
    this.vector.update();
    // backdrop update
    this.sprites["bg"]!.update();
    this.sprites["player"]!.x += 200;
    // @sprites["bg"].scale_y = 0.1
    this.sprites["player"]!.update();

    this.vector.inc = 0.005 * (rand(4) + 1);
    this.setVector(0, 0, 2, 0, 2);
    // (battler and trainer sprite updates and alignment: commented out)
  },

  /** NOTE (Ruby parity): reads @sprite, which is never set: NoMethodError (Scene Camera.rb:127). */
  disposed(this: MyUIScene): boolean {
    return rubyNoMethodError("undefined method `disposed?' for nil:NilClass");
  },

  //-----------------------------------------------------------------------------
  //  moves all elements inside the scene
  //-----------------------------------------------------------------------------
  moveEntireScene(this: MyUIScene, x = 0, y = 0, lock = true, _bypass = false, except: number | null = null): void {
    // return if !bypass && EliteMyUI::DISABLE_SCENE_MOTION
    for (let i = 0; i < 4; i++) {
      if (i === except) continue;
      const s = this.sprites[`pokemon_${i}`];
      if (s) s.x += x;
      if (s) s.y += y;
    }
    this.vector.x += x;
    this.vector.y += y;
    if (!lock) return;
    if (this.orgPos == null) return;
    this.orgPos[0]! += x;
    this.orgPos[1]! += y;
  },

  //-----------------------------------------------------------------------------
  //  scene wait with animation
  //-----------------------------------------------------------------------------
  async wait(this: MyUIScene, frames = 1, align = false, block?: () => void): Promise<void> {
    const framesToWait = Math.trunc(frames);
    // Graphics.update if !MyUI.get(:smAnim) (always nil: MyUI has no @smAnim)
    if (MyUI.get("smAnim")) {
      for (let i = 0; i < framesToWait; i++) this.animateScene(align, false, block);
      return;
    }
    await eachFrame(framesToWait, () => this.animateScene(align, false, block));
  },

  //-----------------------------------------------------------------------------
  //  sets scene vector (everything after reading the arguments is commented out)
  //-----------------------------------------------------------------------------
  setVector(this: MyUIScene, ...args: (number | number[])[]): void {
    // return if EliteMyUI::DISABLE_SCENE_MOTION
    if (Array.isArray(args[0])) {
      if (args[0].length < 5) return;
    } else {
      if (args.length < 5) return;
    }
  },

  //-----------------------------------------------------------------------------
  //  resets sprites for move transformations
  //-----------------------------------------------------------------------------
  revertMoveTransformations(this: MyUIScene, index: number): void {
    const s = this.sprites[`pokemon_${index}`] as unknown as { hidden?: boolean; visible: boolean } | undefined;
    if (s && s.hidden) {
      s.hidden = false;
      s.visible = true;
    }
  },
};

type Methods = typeof methods;
declare module "./MyUIScene" {
  interface MyUIScene extends Methods {}
}
Object.assign(MyUIScene.prototype, methods);
