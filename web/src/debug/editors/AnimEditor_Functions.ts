// Port of Data/Scripts/020_Debug/002_Animation editor/005_AnimEditor_Functions.rb:
// the battle animation editor (Debug menu > Editors > Battle Animation
// Editor): its pop-up screens and animationEditorMain. Registers
// EditorScreens.pbAnimationEditor.
//
// The editor works on its own copy of web/data/pkmn-animations.json
// (loadPkmnAnimationsForEditor) and saves it back through the dev server's
// file endpoint (save_data(animation, "Data/PkmnAnimations.rxdata")). Leaving
// the editor forgets the battles' copy ($game_temp.battle_animations_data =
// nil), so the next battle reads the saved file.
//
// The screen is enlarged to 800x672 while the editor is open
// (Graphics.resize_screen), as in Essentials.

import "./AnimEditor_ExportImport";

import {
  AnimFrame, PBAnimation, PBAnimations, pbCreateCel, pbSpriteSetAnimFrame, resetBattleAnimationsData, type Cel,
  type PBAnimTiming,
} from "../../battle/scene/animationPlayer";
import { pbBGMStop, pbSEPlay, pbSEStop } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { getMousePos } from "../../plugins/easyMouse/Mouse";
import { Sprite } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Viewport } from "../../rgss/display";
import { _INTL, Settings } from "../../ui/messageConfig";
import { pbConfirmMessage, pbShowCommands } from "../../ui/messages";
import { pbSetResizeFactor } from "../../ui/options/options";
import { preloadBitmap } from "../../ui/rpgCache";
import { KeyboardInput } from "../../ui/textEntry/keyboard";
import type { Window_AdvancedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { devWriteOrExplain } from "../devFiles";
import { EditorScreens } from "../editorScreens";
import { globFolder, pbListWindow } from "../EditorListers";
import { ControlWindow, FrameCountButton, FrameCountSlider, Label, TextField } from "./AnimEditor_ControlsButtons";
import {
  loadPkmnAnimationsForEditor, newPBAnimTiming, pbAnimTimingToS, PKMN_ANIMATIONS_FILE, rAdd, rDiv, rMul, rSub,
  savePkmnAnimations, timingTypeOf, durationOf, type PkmnAnimationsFile,
} from "./AnimEditor_Data";
import { pbExportAnim, pbImportAnim } from "./AnimEditor_ExportImport";
import { pbDefinePath } from "./AnimEditor_Interpolation";
import {
  AnimationCanvas, AnimationNameWindow, AnimCanvasHooks, BitmapDisplayWindow, CanvasAnimationWindow, Clipboard,
  editorInputUpdate, loadAnimationBitmap, pbTrackPopupMenu,
} from "./AnimEditor_SceneElements";

export { MiniBattle, MiniBattler } from "./AnimEditor_SceneElements";

/** Ruby's String#<=> */
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** File.basename(name, ext) */
function basename(name: string, ext: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1);
  return ext && base.endsWith(ext) && base !== ext ? base.slice(0, -ext.length) : base;
}

/** Dir.glob("*.ext") in a folder, sorted (Ruby 3's glob sorts), one pattern after another. */
async function globSorted(folder: string, exts: string[]): Promise<string[]> {
  const ret: string[] = [];
  for (const ext of exts) ret.push(...(await globFolder(folder, [ext])).sort(cmpStr));
  return ret;
}

//===============================================================================
// Pop-up menus for buttons in bottom menu
//===============================================================================
export async function pbSelectAnim(canvas: AnimationCanvas, animwin: CanvasAnimationWindow): Promise<void> {
  const animfiles: string[] = [];
  animfiles.push(...(await globSorted("Graphics/Animations/", ["png"])));
  const cmdwin = pbListWindow(animfiles, 320);
  cmdwin.opacity = 200;
  cmdwin.height = 512;
  const bmpwin = new BitmapDisplayWindow(320, 0, 320, 448);
  const ctlwin = new ControlWindow(320, 448, 320, 64);
  cmdwin.viewport = canvas.viewport;
  bmpwin.viewport = canvas.viewport;
  ctlwin.viewport = canvas.viewport;
  ctlwin.addSlider(_INTL("Hue:"), 0, 359, 0);
  for (;;) {
    const name = cmdwin.commands[cmdwin.index];
    if (name !== undefined) await preloadBitmap("Graphics/Animations/" + name);
    bmpwin.bitmapname = name ?? "";
    await Graphics.update();
    editorInputUpdate();
    cmdwin.update();
    bmpwin.update();
    ctlwin.update();
    if (ctlwin.isChanged(0)) bmpwin.hue = Number(ctlwin.value(0));
    if (Input.trigger(Input.USE) && animfiles.length > 0) {
      const filename = cmdwin.commands[cmdwin.index]!;
      const bitmap = await loadAnimationBitmap(filename, Number(ctlwin.value(0)));
      canvas.animation.graphic = basename(filename, ".png");
      canvas.animation.hue = Number(ctlwin.value(0));
      canvas.animbitmap = bitmap;
      animwin.animbitmap = bitmap;
      break;
    }
    if (Input.trigger(Input.BACK)) break;
  }
  bmpwin.dispose();
  cmdwin.dispose();
  ctlwin.dispose();
}

export async function pbChangeMaximum(canvas: AnimationCanvas): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 32 * 4);
  sliderwin2.viewport = canvas.viewport;
  sliderwin2.addSlider(_INTL("Frames:"), 1, 1000, canvas.animation.length);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  sliderwin2.opacity = 200;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton)) {
      canvas.animation.resize(Number(sliderwin2.value(0)));
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin2.dispose();
}

/** The list window pbAnimList shows (its commands are edited in place). */
type ListWindow = ReturnType<typeof pbListWindow>;

export async function pbAnimName(animation: PBAnimation, cmdwin: ListWindow): Promise<void> {
  const window = new ControlWindow(320, 128, 320, 32 * 4);
  window.z = 99999;
  window.addControl(new TextField(_INTL("New Name:"), animation.name));
  KeyboardInput.textInput = true;
  const okbutton = window.addButton(_INTL("OK"));
  const cancelbutton = window.addButton(_INTL("Cancel"));
  window.opacity = 224;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    window.update();
    if (window.isChanged(okbutton) || KeyboardInput.triggerex("RETURN")) {
      cmdwin.commands[cmdwin.index] = _INTL("{1} {2}", cmdwin.index, window.controls[0]!.text);
      animation.name = window.controls[0]!.text;
      break;
    }
    if (window.isChanged(cancelbutton) || KeyboardInput.triggerex("ESCAPE")) break;
  }
  window.dispose();
  KeyboardInput.textInput = false;
}

export async function pbAnimList(animations: PBAnimations, canvas: AnimationCanvas, animwin: CanvasAnimationWindow): Promise<void> {
  const commands: string[] = [];
  for (let i = 0; i < animations.length; i++) {
    if (!animations.get(i)) animations.set(i, new PBAnimation());
    commands[commands.length] = _INTL("{1} {2}", i, animations.get(i)!.name);
  }
  const cmdwin = pbListWindow(commands, 320);
  cmdwin.height = 416;
  cmdwin.opacity = 224;
  cmdwin.index = animations.selected;
  cmdwin.viewport = canvas.viewport;
  const helpwindow = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Enter: Load/rename an animation\nEsc: Cancel"),
    320, 0, 320, 128, canvas.viewport,
  );
  const maxsizewindow = new ControlWindow(0, 416, 320, 32 * 3);
  maxsizewindow.addSlider(_INTL("Total Animations:"), 1, 2000, animations.length);
  maxsizewindow.addButton(_INTL("Resize Animation List"));
  maxsizewindow.opacity = 224;
  maxsizewindow.viewport = canvas.viewport;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    cmdwin.update();
    maxsizewindow.update();
    helpwindow.update();
    if (maxsizewindow.isChanged(1)) {
      const newsize = Number(maxsizewindow.value(0));
      animations.resize(newsize);
      commands.length = 0;
      for (let i = 0; i < animations.length; i++) {
        commands[commands.length] = _INTL("{1} {2}", i, animations.get(i)!.name);
      }
      cmdwin.commands = commands;
      cmdwin.index = animations.selected;
      continue;
    }
    if (Input.trigger(Input.USE) && animations.length > 0) {
      const cmd2 = await pbShowCommands(helpwindow as unknown as Window_AdvancedTextPokemon,
        [_INTL("Load Animation"), _INTL("Rename"), _INTL("Delete")], -1);
      switch (cmd2) {
        case 0: // Load Animation
          await canvas.loadAnimation(animations.get(cmdwin.index)!);
          animwin.animbitmap = canvas.animbitmap;
          animations.selected = cmdwin.index;
          break;
        case 1: // Rename
          await pbAnimName(animations.get(cmdwin.index)!, cmdwin);
          cmdwin.refresh();
          break;
        case 2: // Delete
          if (await pbConfirmMessage(_INTL("Are you sure you want to delete this animation?"))) {
            animations.set(cmdwin.index, new PBAnimation());
            cmdwin.commands[cmdwin.index] = _INTL("{1} {2}", cmdwin.index, animations.get(cmdwin.index)!.name);
            cmdwin.refresh();
          }
          break;
      }
      if (cmd2 === 0) break;
    }
    if (Input.trigger(Input.BACK)) break;
  }
  helpwindow.dispose();
  maxsizewindow.dispose();
  cmdwin.dispose();
}

//===============================================================================
// Pop-up menus for individual cels
//===============================================================================
export async function pbChooseNum(cel: number): Promise<number> {
  let ret = cel;
  const sliderwin2 = new ControlWindow(0, 0, 320, 32 * 5);
  sliderwin2.z = 99999;
  sliderwin2.addLabel(_INTL("Old Number: {1}", cel));
  // NOTE (Ruby parity): the highest number is MAX_SPRITES (60), one past the
  // last cel; a cel renumbered to 60 is never shown or played
  // (005_AnimEditor_Functions.rb:193).
  sliderwin2.addSlider(_INTL("New Number:"), 2, PBAnimation.MAX_SPRITES, cel);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton)) {
      ret = Number(sliderwin2.value(1));
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) {
      ret = -1;
      break;
    }
  }
  sliderwin2.dispose();
  return ret;
}

export async function pbSetTone(cel: Cel, previewsprite: Sprite): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 320);
  sliderwin2.z = 99999;
  sliderwin2.addSlider(_INTL("Red Offset:"), -255, 255, cel[AnimFrame.TONERED]!);
  sliderwin2.addSlider(_INTL("Green Offset:"), -255, 255, cel[AnimFrame.TONEGREEN]!);
  sliderwin2.addSlider(_INTL("Blue Offset:"), -255, 255, cel[AnimFrame.TONEBLUE]!);
  sliderwin2.addSlider(_INTL("Gray Tone:"), 0, 255, cel[AnimFrame.TONEGRAY]!);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  for (;;) {
    previewsprite.tone.set(Number(sliderwin2.value(0)), Number(sliderwin2.value(1)),
      Number(sliderwin2.value(2)), Number(sliderwin2.value(3)));
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton)) {
      cel[AnimFrame.TONERED] = sliderwin2.value(0);
      cel[AnimFrame.TONEGREEN] = sliderwin2.value(1);
      cel[AnimFrame.TONEBLUE] = sliderwin2.value(2);
      cel[AnimFrame.TONEGRAY] = sliderwin2.value(3);
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin2.dispose();
}

export async function pbSetFlash(cel: Cel, previewsprite: Sprite): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 320);
  sliderwin2.z = 99999;
  sliderwin2.addSlider(_INTL("Red:"), 0, 255, cel[AnimFrame.COLORRED]!);
  sliderwin2.addSlider(_INTL("Green:"), 0, 255, cel[AnimFrame.COLORGREEN]!);
  sliderwin2.addSlider(_INTL("Blue:"), 0, 255, cel[AnimFrame.COLORBLUE]!);
  sliderwin2.addSlider(_INTL("Alpha:"), 0, 255, cel[AnimFrame.COLORALPHA]!);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  for (;;) {
    // NOTE (Ruby parity): previews the blending color as a tone (copied from
    // pbSetTone; 005_AnimEditor_Functions.rb:253).
    previewsprite.tone.set(Number(sliderwin2.value(0)), Number(sliderwin2.value(1)),
      Number(sliderwin2.value(2)), Number(sliderwin2.value(3)));
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton)) {
      cel[AnimFrame.COLORRED] = sliderwin2.value(0);
      cel[AnimFrame.COLORGREEN] = sliderwin2.value(1);
      cel[AnimFrame.COLORBLUE] = sliderwin2.value(2);
      cel[AnimFrame.COLORALPHA] = sliderwin2.value(3);
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin2.dispose();
}

export async function pbCellProperties(canvas: AnimationCanvas): Promise<void> {
  const current = canvas.currentCel();
  const cel = current ? [...current] : null; // Clone cell, in case operation is canceled
  if (!cel) return;
  const sliderwin2 = new ControlWindow(0, 0, 320, 32 * 16);
  const previewwin = new ControlWindow(320, 0, 192, 192);
  sliderwin2.viewport = canvas.viewport;
  previewwin.viewport = canvas.viewport;
  const previewsprite = new Sprite(canvas.viewport);
  previewsprite.setBitmap(canvas.animbitmap);
  previewsprite.z = previewwin.z + 1;
  sliderwin2.z = previewwin.z + 2;
  const set0 = sliderwin2.addSlider(_INTL("Pattern:"), -2, 1000, cel[AnimFrame.PATTERN]!);
  const set1 = sliderwin2.addSlider(_INTL("X:"), -64, 512 + 64, cel[AnimFrame.X]!);
  const set2 = sliderwin2.addSlider(_INTL("Y:"), -64, 384 + 64, cel[AnimFrame.Y]!);
  const set3 = sliderwin2.addSlider(_INTL("Zoom X:"), 5, 1000, cel[AnimFrame.ZOOMX]!);
  const set4 = sliderwin2.addSlider(_INTL("Zoom Y:"), 5, 1000, cel[AnimFrame.ZOOMY]!);
  const set5 = sliderwin2.addSlider(_INTL("Angle:"), 0, 359, cel[AnimFrame.ANGLE]!);
  const set6 = sliderwin2.addSlider(_INTL("Opacity:"), 0, 255, cel[AnimFrame.OPACITY]!);
  const set7 = sliderwin2.addSlider(_INTL("Blending:"), 0, 2, cel[AnimFrame.BLENDTYPE]!);
  const set8 = sliderwin2.addTextSlider(_INTL("Flip:"), [_INTL("False"), _INTL("True")], cel[AnimFrame.MIRROR]!);
  const prio = [_INTL("Back"), _INTL("Front"), _INTL("Behind focus"), _INTL("Above focus")];
  const set9 = sliderwin2.addTextSlider(_INTL("Priority:"), prio, cel[AnimFrame.PRIORITY] ?? 1);
  const foc = [_INTL("User"), _INTL("Target"), _INTL("User and target"), _INTL("Screen")];
  const curfoc = [3, 1, 0, 2, 3][cel[AnimFrame.FOCUS] || canvas.animation.position || 4]!;
  const set10 = sliderwin2.addTextSlider(_INTL("Focus:"), foc, curfoc);
  const flashbutton = sliderwin2.addButton(_INTL("Set Blending Color"));
  const tonebutton = sliderwin2.addButton(_INTL("Set Color Tone"));
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  // Set X and Y for preview sprite
  cel[AnimFrame.X] = 320 + 96;
  cel[AnimFrame.Y] = 96;
  canvas.setSpriteBitmap(previewsprite, cel);
  pbSpriteSetAnimFrame(previewsprite, cel, null, null);
  previewsprite.z = previewwin.z + 1;
  sliderwin2.opacity = 200;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(set0) ||
        sliderwin2.isChanged(set3) ||
        sliderwin2.isChanged(set4) ||
        sliderwin2.isChanged(set5) ||
        sliderwin2.isChanged(set6) ||
        sliderwin2.isChanged(set7) ||
        sliderwin2.isChanged(set8) ||
        sliderwin2.isChanged(set9) ||
        sliderwin2.isChanged(set10)) {
      // Update preview sprite
      if (set0 >= 0) cel[AnimFrame.PATTERN] = sliderwin2.value(set0);
      cel[AnimFrame.ZOOMX] = sliderwin2.value(set3);
      cel[AnimFrame.ZOOMY] = sliderwin2.value(set4);
      cel[AnimFrame.ANGLE] = sliderwin2.value(set5);
      cel[AnimFrame.OPACITY] = sliderwin2.value(set6);
      cel[AnimFrame.BLENDTYPE] = sliderwin2.value(set7);
      cel[AnimFrame.MIRROR] = sliderwin2.value(set8);
      cel[AnimFrame.PRIORITY] = sliderwin2.value(set9);
      cel[AnimFrame.FOCUS] = [2, 1, 3, 4][sliderwin2.value(set10) as number]!;
      canvas.setSpriteBitmap(previewsprite, cel);
      pbSpriteSetAnimFrame(previewsprite, cel, null, null);
      previewsprite.z = previewwin.z + 1;
    }
    if (sliderwin2.isChanged(flashbutton)) {
      await pbSetFlash(cel, previewsprite);
      pbSpriteSetAnimFrame(previewsprite, cel, null, null);
      previewsprite.z = previewwin.z + 1;
    }
    if (sliderwin2.isChanged(tonebutton)) {
      await pbSetTone(cel, previewsprite);
      pbSpriteSetAnimFrame(previewsprite, cel, null, null);
      previewsprite.z = previewwin.z + 1;
    }
    if (sliderwin2.isChanged(okbutton)) {
      if (set0 >= 0) cel[AnimFrame.PATTERN] = sliderwin2.value(set0);
      cel[AnimFrame.X] = sliderwin2.value(set1);
      cel[AnimFrame.Y] = sliderwin2.value(set2);
      cel[AnimFrame.ZOOMX] = sliderwin2.value(set3);
      cel[AnimFrame.ZOOMY] = sliderwin2.value(set4);
      cel[AnimFrame.ANGLE] = sliderwin2.value(set5);
      cel[AnimFrame.OPACITY] = sliderwin2.value(set6);
      cel[AnimFrame.BLENDTYPE] = sliderwin2.value(set7);
      cel[AnimFrame.MIRROR] = sliderwin2.value(set8);
      cel[AnimFrame.PRIORITY] = sliderwin2.value(set9);
      cel[AnimFrame.FOCUS] = [2, 1, 3, 4][sliderwin2.value(set10) as number]!;
      const thiscel = canvas.currentCel()!;
      // Save by replacing current cell
      thiscel.splice(0, thiscel.length, ...cel);
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  previewwin.dispose();
  previewsprite.dispose();
  sliderwin2.dispose();
}

AnimCanvasHooks.pbCellProperties = pbCellProperties;

//===============================================================================
// Pop-up menus for buttons in right hand menu
//===============================================================================
export async function pbTimingList(canvas: AnimationCanvas): Promise<void> {
  const commands: string[] = [];
  let cmdNewSound = -1;
  let cmdNewBG = -1;
  let cmdEditBG = -1;
  let cmdNewFO = -1;
  let cmdEditFO = -1;
  for (const i of canvas.animation.timing) commands.push(pbAnimTimingToS(i));
  commands[cmdNewSound = commands.length] = _INTL("Add: Play Sound...");
  commands[cmdNewBG = commands.length] = _INTL("Add: Set Background Graphic...");
  commands[cmdEditBG = commands.length] = _INTL("Add: Edit Background Color/Location...");
  commands[cmdNewFO = commands.length] = _INTL("Add: Set Foreground Graphic...");
  commands[cmdEditFO = commands.length] = _INTL("Add: Edit Foreground Color/Location...");
  const cmdwin = pbListWindow(commands, 480);
  cmdwin.x = 0;
  cmdwin.y = 0;
  cmdwin.width = 640;
  cmdwin.height = 384;
  cmdwin.opacity = 200;
  cmdwin.viewport = canvas.viewport;
  const framewindow = new ControlWindow(0, 384, 640, 32 * 4);
  framewindow.addSlider(_INTL("Frame:"), 1, canvas.animation.length, canvas.currentframe + 1);
  framewindow.addButton(_INTL("Set Frame"));
  framewindow.addButton(_INTL("Delete Timing"));
  framewindow.opacity = 200;
  framewindow.viewport = canvas.viewport;
  const timing = canvas.animation.timing;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    cmdwin.update();
    framewindow.update();
    if (cmdwin.index !== cmdNewSound &&
        cmdwin.index !== cmdNewBG &&
        cmdwin.index !== cmdEditBG &&
        cmdwin.index !== cmdNewFO &&
        cmdwin.index !== cmdEditFO) {
      if (framewindow.isChanged(1)) { // Set Frame
        timing[cmdwin.index]!.frame = Number(framewindow.value(0)) - 1;
        cmdwin.commands[cmdwin.index] = pbAnimTimingToS(timing[cmdwin.index]!);
        cmdwin.refresh();
        continue;
      }
      if (framewindow.isChanged(2)) { // Delete Timing
        timing.splice(cmdwin.index, 1);
        cmdwin.commands.splice(cmdwin.index, 1);
        if (cmdNewSound >= 0) cmdNewSound -= 1;
        if (cmdNewBG >= 0) cmdNewBG -= 1;
        if (cmdEditBG >= 0) cmdEditBG -= 1;
        if (cmdNewFO >= 0) cmdNewFO -= 1;
        if (cmdEditFO >= 0) cmdEditFO -= 1;
        cmdwin.refresh();
        continue;
      }
    }
    if (Input.trigger(Input.USE)) {
      let redrawcmds = false;
      if (cmdwin.index === cmdNewSound) { // Add new sound
        const newaudio = newPBAnimTiming(0);
        if (await pbSelectSE(canvas, newaudio)) {
          newaudio.frame = Number(framewindow.value(0)) - 1;
          timing.push(newaudio);
          redrawcmds = true;
        }
      } else if (cmdwin.index === cmdNewBG) { // Add new background graphic set
        const newtiming = newPBAnimTiming(1);
        if (await pbSelectBG(canvas, newtiming)) {
          newtiming.frame = Number(framewindow.value(0)) - 1;
          timing.push(newtiming);
          redrawcmds = true;
        }
      } else if (cmdwin.index === cmdEditBG) { // Add new background edit
        const newtiming = newPBAnimTiming(2);
        if (await pbEditBG(canvas, newtiming)) {
          newtiming.frame = Number(framewindow.value(0)) - 1;
          timing.push(newtiming);
          redrawcmds = true;
        }
      } else if (cmdwin.index === cmdNewFO) { // Add new foreground graphic set
        const newtiming = newPBAnimTiming(3);
        if (await pbSelectBG(canvas, newtiming)) {
          newtiming.frame = Number(framewindow.value(0)) - 1;
          timing.push(newtiming);
          redrawcmds = true;
        }
      } else if (cmdwin.index === cmdEditFO) { // Add new foreground edit
        const newtiming = newPBAnimTiming(4);
        if (await pbEditBG(canvas, newtiming)) {
          newtiming.frame = Number(framewindow.value(0)) - 1;
          timing.push(newtiming);
          redrawcmds = true;
        }
      } else {
        // Edit a timing here
        switch (timingTypeOf(timing[cmdwin.index]!)) {
          case 0:
            await pbSelectSE(canvas, timing[cmdwin.index]!);
            break;
          case 1: case 3:
            await pbSelectBG(canvas, timing[cmdwin.index]!);
            break;
          case 2: case 4:
            await pbEditBG(canvas, timing[cmdwin.index]!);
            break;
        }
        cmdwin.commands[cmdwin.index] = pbAnimTimingToS(timing[cmdwin.index]!);
        cmdwin.refresh();
      }
      if (redrawcmds) {
        const cmds = cmdwin.commands as (string | null)[];
        if (cmdNewSound >= 0) cmds[cmdNewSound] = null;
        if (cmdNewBG >= 0) cmds[cmdNewBG] = null;
        if (cmdEditBG >= 0) cmds[cmdEditBG] = null;
        if (cmdNewFO >= 0) cmds[cmdNewFO] = null;
        if (cmdEditFO >= 0) cmds[cmdEditFO] = null;
        const kept = cmds.filter((c): c is string => c !== null); // compact!
        cmds.splice(0, cmds.length, ...kept);
        cmds.push(pbAnimTimingToS(timing[timing.length - 1]!));
        cmds[cmdNewSound = cmds.length] = _INTL("Add: Play Sound...");
        cmds[cmdNewBG = cmds.length] = _INTL("Add: Set Background Graphic...");
        cmds[cmdEditBG = cmds.length] = _INTL("Add: Edit Background Color/Location...");
        cmds[cmdNewFO = cmds.length] = _INTL("Add: Set Foreground Graphic...");
        cmds[cmdEditFO = cmds.length] = _INTL("Add: Edit Foreground Color/Location...");
        cmdwin.refresh();
      }
    } else if (Input.trigger(Input.BACK)) {
      break;
    }
  }
  cmdwin.dispose();
  framewindow.dispose();
}

export async function pbSelectSE(canvas: AnimationCanvas, audio: PBAnimTiming): Promise<boolean> {
  let filename = (audio.name !== "") ? (audio.name ?? "") : "";
  let displayname = (filename !== "") ? filename : _INTL("<user's cry>");
  let animfiles: string[] = [];
  let ret = false;
  animfiles.push(...(await globSorted("Audio/SE/Anim/", ["wav"])));
  // animfiles.concat(Dir.glob("*.mp3"))
  animfiles.push(...(await globSorted("Audio/SE/Anim/", ["ogg"])));
  animfiles.push(...(await globSorted("Audio/SE/Anim/", ["wma"])));
  animfiles = [...new Set(animfiles)];
  animfiles.sort((a, b) => cmpStr(a.toLowerCase(), b.toLowerCase()));
  animfiles = [_INTL("[Play user's cry]"), ...animfiles];
  const cmdwin = pbListWindow(animfiles, 320);
  cmdwin.height = 480;
  cmdwin.opacity = 200;
  cmdwin.viewport = canvas.viewport;
  const maxsizewindow = new ControlWindow(320, 0, 320, 32 * 8);
  maxsizewindow.addLabel(_INTL("File: \"{1}\"", displayname));
  maxsizewindow.addSlider(_INTL("Volume:"), 0, 100, audio.volume);
  maxsizewindow.addSlider(_INTL("Pitch:"), 20, 250, audio.pitch);
  maxsizewindow.addButton(_INTL("Play Sound"));
  maxsizewindow.addButton(_INTL("Stop Sound"));
  maxsizewindow.addButton(_INTL("OK"));
  maxsizewindow.addButton(_INTL("Cancel"));
  maxsizewindow.opacity = 200;
  maxsizewindow.viewport = canvas.viewport;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    cmdwin.update();
    maxsizewindow.update();
    if (maxsizewindow.isChanged(3) && animfiles.length > 0) { // Play Sound
      const fname = (cmdwin.index === 0) ? "Cries/001Cry" : "Anim/" + filename;
      pbSEPlay({ name: fname, volume: Number(maxsizewindow.value(1)), pitch: Number(maxsizewindow.value(2)) });
    }
    if (maxsizewindow.isChanged(4) && animfiles.length > 0) { // Stop Sound
      pbSEStop();
    }
    if (maxsizewindow.isChanged(5)) { // OK
      filename = basename(filename, ".wav");
      // filename = File.basename(filename,".mp3")
      filename = basename(filename, ".ogg");
      filename = basename(filename, ".wma");
      audio.name = filename;
      audio.volume = Number(maxsizewindow.value(1));
      audio.pitch = Number(maxsizewindow.value(2));
      ret = true;
      break;
    }
    if (maxsizewindow.isChanged(6)) break; // Cancel
    if (Input.trigger(Input.USE) && animfiles.length > 0) {
      filename = (cmdwin.index === 0) ? "" : cmdwin.commands[cmdwin.index]!;
      displayname = (filename !== "") ? filename : _INTL("<user's cry>");
      (maxsizewindow.controls[0] as Label).text = _INTL("File: \"{1}\"", displayname);
    } else if (Input.trigger(Input.BACK)) {
      break;
    }
  }
  cmdwin.dispose();
  maxsizewindow.dispose();
  return ret;
}

export async function pbSelectBG(canvas: AnimationCanvas, timing: PBAnimTiming): Promise<boolean> {
  let filename = timing.name;
  let cmdErase = -1;
  const animfiles: string[] = [];
  animfiles[cmdErase = animfiles.length] = _INTL("[Erase background graphic]");
  let ret = false;
  animfiles.push(...(await globSorted("Graphics/Animations/", ["png", "gif"])));
  //    animfiles.concat(Dir.glob("*.jpg"))
  //    animfiles.concat(Dir.glob("*.jpeg"))
  //    animfiles.concat(Dir.glob("*.bmp"))
  const cmdwin = pbListWindow(animfiles, 320);
  cmdwin.height = 480;
  cmdwin.opacity = 200;
  cmdwin.viewport = canvas.viewport;
  const maxsizewindow = new ControlWindow(320, 0, 320, 32 * 11);
  maxsizewindow.addLabel(_INTL("File: \"{1}\"", filename));
  maxsizewindow.addSlider(_INTL("X:"), -500, 500, timing.bgX ?? 0);
  maxsizewindow.addSlider(_INTL("Y:"), -500, 500, timing.bgY ?? 0);
  maxsizewindow.addSlider(_INTL("Opacity:"), 0, 255, timing.opacity ?? 0);
  maxsizewindow.addSlider(_INTL("Red:"), 0, 255, timing.colorRed ?? 0);
  maxsizewindow.addSlider(_INTL("Green:"), 0, 255, timing.colorGreen ?? 0);
  maxsizewindow.addSlider(_INTL("Blue:"), 0, 255, timing.colorBlue ?? 0);
  maxsizewindow.addSlider(_INTL("Alpha:"), 0, 255, timing.colorAlpha ?? 0);
  maxsizewindow.addButton(_INTL("OK"));
  maxsizewindow.addButton(_INTL("Cancel"));
  maxsizewindow.opacity = 200;
  maxsizewindow.viewport = canvas.viewport;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    cmdwin.update();
    maxsizewindow.update();
    if (maxsizewindow.isChanged(8)) { // OK
      timing.name = filename;
      timing.bgX = maxsizewindow.value(1);
      timing.bgY = maxsizewindow.value(2);
      timing.opacity = maxsizewindow.value(3);
      timing.colorRed = maxsizewindow.value(4);
      timing.colorGreen = maxsizewindow.value(5);
      timing.colorBlue = maxsizewindow.value(6);
      timing.colorAlpha = maxsizewindow.value(7);
      ret = true;
      break;
    }
    if (maxsizewindow.isChanged(9)) break; // Cancel
    if (Input.trigger(Input.USE) && animfiles.length > 0) {
      filename = (cmdwin.index === cmdErase) ? "" : cmdwin.commands[cmdwin.index]!;
      (maxsizewindow.controls[0] as Label).text = _INTL("File: \"{1}\"", filename);
    } else if (Input.trigger(Input.BACK)) {
      break;
    }
  }
  cmdwin.dispose();
  maxsizewindow.dispose();
  return ret;
}

export async function pbEditBG(canvas: AnimationCanvas, timing: PBAnimTiming): Promise<boolean> {
  let ret = false;
  const maxsizewindow = new ControlWindow(0, 0, 320, 32 * 11);
  maxsizewindow.addSlider(_INTL("Duration:"), 0, 50, durationOf(timing));
  maxsizewindow.addOptionalSlider(_INTL("X:"), -500, 500, timing.bgX ?? 0);
  maxsizewindow.addOptionalSlider(_INTL("Y:"), -500, 500, timing.bgY ?? 0);
  maxsizewindow.addOptionalSlider(_INTL("Opacity:"), 0, 255, timing.opacity ?? 0);
  maxsizewindow.addOptionalSlider(_INTL("Red:"), 0, 255, timing.colorRed ?? 0);
  maxsizewindow.addOptionalSlider(_INTL("Green:"), 0, 255, timing.colorGreen ?? 0);
  maxsizewindow.addOptionalSlider(_INTL("Blue:"), 0, 255, timing.colorBlue ?? 0);
  maxsizewindow.addOptionalSlider(_INTL("Alpha:"), 0, 255, timing.colorAlpha ?? 0);
  maxsizewindow.addButton(_INTL("OK"));
  maxsizewindow.addButton(_INTL("Cancel"));
  const opt = (i: number) => maxsizewindow.controls[i] as unknown as { checked: boolean };
  opt(1).checked = timing.bgX != null;
  opt(2).checked = timing.bgY != null;
  opt(3).checked = timing.opacity != null;
  opt(4).checked = timing.colorRed != null;
  opt(5).checked = timing.colorGreen != null;
  opt(6).checked = timing.colorBlue != null;
  opt(7).checked = timing.colorAlpha != null;
  maxsizewindow.opacity = 200;
  maxsizewindow.viewport = canvas.viewport;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    maxsizewindow.update();
    if (maxsizewindow.isChanged(8)) { // OK
      if (opt(1).checked || opt(2).checked || opt(3).checked || opt(4).checked ||
          opt(5).checked || opt(6).checked || opt(7).checked) {
        timing.duration = maxsizewindow.value(0);
        timing.bgX = maxsizewindow.value(1);
        timing.bgY = maxsizewindow.value(2);
        timing.opacity = maxsizewindow.value(3);
        timing.colorRed = maxsizewindow.value(4);
        timing.colorGreen = maxsizewindow.value(5);
        timing.colorBlue = maxsizewindow.value(6);
        timing.colorAlpha = maxsizewindow.value(7);
        ret = true;
      }
      break;
    }
    if (maxsizewindow.isChanged(9)) break; // Cancel
    if (Input.trigger(Input.BACK)) break;
  }
  maxsizewindow.dispose();
  return ret;
}

export async function pbCopyFrames(canvas: AnimationCanvas): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 32 * 6);
  sliderwin2.viewport = canvas.viewport;
  sliderwin2.addSlider(_INTL("First Frame:"), 1, canvas.animation.length, 1);
  sliderwin2.addSlider(_INTL("Last Frame:"), 1, canvas.animation.length, canvas.animation.length);
  sliderwin2.addSlider(_INTL("Copy to:"), 1, canvas.animation.length, canvas.currentframe + 1);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  sliderwin2.opacity = 200;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton)) {
      let startvalue = Number(sliderwin2.value(0)) - 1;
      const endvalue = Number(sliderwin2.value(1)) - 1;
      let dstvalue = Number(sliderwin2.value(2)) - 1;
      let length = (endvalue - startvalue) + 1;
      if (length > 0) { // Ensure correct overlap handling
        if (startvalue < dstvalue) {
          startvalue += length;
          dstvalue += length;
          while (length !== 0) {
            canvas.copyFrame(startvalue - 1, dstvalue - 1);
            startvalue -= 1;
            dstvalue -= 1;
            length -= 1;
          }
        } else if (startvalue !== dstvalue) {
          while (length !== 0) {
            canvas.copyFrame(startvalue, dstvalue);
            startvalue += 1;
            dstvalue += 1;
            length -= 1;
          }
        }
      }
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin2.dispose();
}

export async function pbClearFrames(canvas: AnimationCanvas): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 32 * 5);
  sliderwin2.viewport = canvas.viewport;
  sliderwin2.addSlider(_INTL("First Frame:"), 1, canvas.animation.length, 1);
  sliderwin2.addSlider(_INTL("Last Frame:"), 1, canvas.animation.length, canvas.animation.length);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  sliderwin2.opacity = 200;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton)) {
      const startframe = Number(sliderwin2.value(0)) - 1;
      const endframe = Number(sliderwin2.value(1)) - 1;
      for (let i = startframe; i <= endframe; i++) canvas.clearFrame(i);
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin2.dispose();
}

/** start + (diff * k / frames), with Ruby's Integer/Float arithmetic */
const lerp = (start: unknown, diff: unknown, k: number, frames: number) => rAdd(start, rDiv(rMul(diff, k), frames));

export async function pbTweening(canvas: AnimationCanvas): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 32 * 10);
  sliderwin2.viewport = canvas.viewport;
  sliderwin2.opacity = 200;
  const s1set0 = sliderwin2.addSlider(_INTL("Starting Frame:"), 1, canvas.animation.length, 1);
  const s1set1 = sliderwin2.addSlider(_INTL("Ending Frame:"), 1, canvas.animation.length, canvas.animation.length);
  const s1set2 = sliderwin2.addSlider(_INTL("First Cel:"), 0, PBAnimation.MAX_SPRITES - 1, 0);
  const s1set3 = sliderwin2.addSlider(_INTL("Last Cel:"), 0, PBAnimation.MAX_SPRITES - 1, PBAnimation.MAX_SPRITES - 1);
  const set0 = sliderwin2.addCheckbox(_INTL("Pattern"));
  const set1 = sliderwin2.addCheckbox(_INTL("Position/Zoom/Angle"));
  const set2 = sliderwin2.addCheckbox(_INTL("Opacity/Blending"));
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton) || Input.trigger(Input.USE)) {
      const startframe = Number(sliderwin2.value(s1set0)) - 1;
      const endframe = Number(sliderwin2.value(s1set1)) - 1;
      if (startframe >= endframe) break;
      const frames = endframe - startframe;
      const startcel = Number(sliderwin2.value(s1set2));
      const endcel = Number(sliderwin2.value(s1set3));
      for (let j = startcel; j <= endcel; j++) {
        const cel1 = canvas.animation.array[startframe]![j];
        const cel2 = canvas.animation.array[endframe]![j];
        if (!cel1 || !cel2) continue;
        const diffPattern = rSub(cel2[AnimFrame.PATTERN], cel1[AnimFrame.PATTERN]);
        const diffX = rSub(cel2[AnimFrame.X], cel1[AnimFrame.X]);
        const diffY = rSub(cel2[AnimFrame.Y], cel1[AnimFrame.Y]);
        const diffZoomX = rSub(cel2[AnimFrame.ZOOMX], cel1[AnimFrame.ZOOMX]);
        const diffZoomY = rSub(cel2[AnimFrame.ZOOMY], cel1[AnimFrame.ZOOMY]);
        const diffAngle = rSub(cel2[AnimFrame.ANGLE], cel1[AnimFrame.ANGLE]);
        const diffOpacity = rSub(cel2[AnimFrame.OPACITY], cel1[AnimFrame.OPACITY]);
        const diffBlend = rSub(cel2[AnimFrame.BLENDTYPE], cel1[AnimFrame.BLENDTYPE]);
        const startPattern = cel1[AnimFrame.PATTERN];
        const startX = cel1[AnimFrame.X];
        const startY = cel1[AnimFrame.Y];
        const startZoomX = cel1[AnimFrame.ZOOMX];
        const startZoomY = cel1[AnimFrame.ZOOMY];
        const startAngle = cel1[AnimFrame.ANGLE];
        const startOpacity = cel1[AnimFrame.OPACITY];
        const startBlend = cel1[AnimFrame.BLENDTYPE];
        for (let k = 0; k <= frames; k++) {
          let cel = canvas.animation.array[startframe + k]![j];
          const curcel = cel;
          if (!cel) {
            cel = pbCreateCel(0, 0, 0);
            canvas.animation.array[startframe + k]![j] = cel;
          }
          if (sliderwin2.value(set0) || !curcel) {
            cel[AnimFrame.PATTERN] = lerp(startPattern, diffPattern, k, frames) as number;
          }
          if (sliderwin2.value(set1) || !curcel) {
            cel[AnimFrame.X] = lerp(startX, diffX, k, frames) as number;
            cel[AnimFrame.Y] = lerp(startY, diffY, k, frames) as number;
            cel[AnimFrame.ZOOMX] = lerp(startZoomX, diffZoomX, k, frames) as number;
            cel[AnimFrame.ZOOMY] = lerp(startZoomY, diffZoomY, k, frames) as number;
            cel[AnimFrame.ANGLE] = lerp(startAngle, diffAngle, k, frames) as number;
          }
          if (sliderwin2.value(set2) || !curcel) {
            cel[AnimFrame.OPACITY] = lerp(startOpacity, diffOpacity, k, frames) as number;
            cel[AnimFrame.BLENDTYPE] = lerp(startBlend, diffBlend, k, frames) as number;
          }
        }
      }
      canvas.invalidate();
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin2.dispose();
}

export async function pbCellBatch(canvas: AnimationCanvas): Promise<void> {
  const sliderwin1 = new ControlWindow(0, 0, 300, 32 * 5);
  sliderwin1.viewport = canvas.viewport;
  sliderwin1.opacity = 200;
  const s1set0 = sliderwin1.addSlider(_INTL("First Frame:"), 1, canvas.animation.length, 1);
  const s1set1 = sliderwin1.addSlider(_INTL("Last Frame:"), 1, canvas.animation.length, canvas.animation.length);
  const s1set2 = sliderwin1.addSlider(_INTL("First Cel:"), 0, PBAnimation.MAX_SPRITES - 1, 0);
  const s1set3 = sliderwin1.addSlider(_INTL("Last Cel:"), 0, PBAnimation.MAX_SPRITES - 1, PBAnimation.MAX_SPRITES - 1);
  const sliderwin2 = new ControlWindow(300, 0, 340, 32 * 14);
  sliderwin2.viewport = canvas.viewport;
  sliderwin2.opacity = 200;
  const set0 = sliderwin2.addOptionalSlider(_INTL("Pattern:"), -2, 1000, 0);
  const set1 = sliderwin2.addOptionalSlider(_INTL("X:"), -64, 512 + 64, 0);
  const set2 = sliderwin2.addOptionalSlider(_INTL("Y:"), -64, 384 + 64, 0);
  const set3 = sliderwin2.addOptionalSlider(_INTL("Zoom X:"), 5, 1000, 100);
  const set4 = sliderwin2.addOptionalSlider(_INTL("Zoom Y:"), 5, 1000, 100);
  const set5 = sliderwin2.addOptionalSlider(_INTL("Angle:"), 0, 359, 0);
  const set6 = sliderwin2.addOptionalSlider(_INTL("Opacity:"), 0, 255, 255);
  const set7 = sliderwin2.addOptionalSlider(_INTL("Blending:"), 0, 2, 0);
  const set8 = sliderwin2.addOptionalTextSlider(_INTL("Flip:"), [_INTL("False"), _INTL("True")], 0);
  const prio = [_INTL("Back"), _INTL("Front"), _INTL("Behind focus"), _INTL("Above focus")];
  const set9 = sliderwin2.addOptionalTextSlider(_INTL("Priority:"), prio, 1);
  const foc = [_INTL("User"), _INTL("Target"), _INTL("User and target"), _INTL("Screen")];
  const curfoc = [3, 1, 0, 2, 3][canvas.animation.position || 4]!;
  const set10 = sliderwin2.addOptionalTextSlider(_INTL("Focus:"), foc, curfoc);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  // (an optional control's value is nil when unchecked; 0 is a value, as in Ruby)
  const has = (v: unknown) => v !== null && v !== undefined && v !== false;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin1.update();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton) || Input.trigger(Input.USE)) {
      const startframe = Number(sliderwin1.value(s1set0)) - 1;
      const endframe = Number(sliderwin1.value(s1set1)) - 1;
      const startcel = Number(sliderwin1.value(s1set2));
      const endcel = Number(sliderwin1.value(s1set3));
      for (let i = startframe; i <= endframe; i++) {
        for (let j = startcel; j <= endcel; j++) {
          if (!canvas.animation.array[i]![j]) continue;
          const cel = canvas.animation.array[i]![j]!;
          if (has(sliderwin2.value(set0))) cel[AnimFrame.PATTERN] = sliderwin2.value(set0);
          if (has(sliderwin2.value(set1))) cel[AnimFrame.X] = sliderwin2.value(set1);
          if (has(sliderwin2.value(set2))) cel[AnimFrame.Y] = sliderwin2.value(set2);
          if (has(sliderwin2.value(set3))) cel[AnimFrame.ZOOMX] = sliderwin2.value(set3);
          if (has(sliderwin2.value(set4))) cel[AnimFrame.ZOOMY] = sliderwin2.value(set4);
          if (has(sliderwin2.value(set5))) cel[AnimFrame.ANGLE] = sliderwin2.value(set5);
          if (has(sliderwin2.value(set6))) cel[AnimFrame.OPACITY] = sliderwin2.value(set6);
          if (has(sliderwin2.value(set7))) cel[AnimFrame.BLENDTYPE] = sliderwin2.value(set7);
          if (has(sliderwin2.value(set8))) cel[AnimFrame.MIRROR] = sliderwin2.value(set8);
          if (has(sliderwin2.value(set9))) cel[AnimFrame.PRIORITY] = sliderwin2.value(set9);
          if (has(sliderwin2.value(set10))) cel[AnimFrame.FOCUS] = [2, 1, 3, 4][sliderwin2.value(set10) as number]!;
        }
      }
      canvas.invalidate();
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin1.dispose();
  sliderwin2.dispose();
}

export async function pbEntireSlide(canvas: AnimationCanvas): Promise<void> {
  const sliderwin2 = new ControlWindow(0, 0, 320, 32 * 7);
  sliderwin2.viewport = canvas.viewport;
  sliderwin2.addSlider(_INTL("First Frame:"), 1, canvas.animation.length, 1);
  sliderwin2.addSlider(_INTL("Last Frame:"), 1, canvas.animation.length, canvas.animation.length);
  sliderwin2.addSlider(_INTL("X-Axis Movement"), -500, 500, 0);
  sliderwin2.addSlider(_INTL("Y-Axis Movement"), -500, 500, 0);
  const okbutton = sliderwin2.addButton(_INTL("OK"));
  const cancelbutton = sliderwin2.addButton(_INTL("Cancel"));
  sliderwin2.opacity = 200;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin2.update();
    if (sliderwin2.isChanged(okbutton)) {
      const startvalue = Number(sliderwin2.value(0)) - 1;
      const endvalue = Number(sliderwin2.value(1)) - 1;
      const xoffset = Number(sliderwin2.value(2));
      const yoffset = Number(sliderwin2.value(3));
      for (let i = startvalue; i <= endvalue; i++) canvas.offsetFrame(i, xoffset, yoffset);
      break;
    }
    if (sliderwin2.isChanged(cancelbutton) || Input.trigger(Input.BACK)) break;
  }
  sliderwin2.dispose();
}

export async function pbAnimEditorHelpWindow(): Promise<void> {
  const helptext = "" +
    "To add a cel to the scene, click on the canvas. The selected cel will have a black " +
    "frame. After a cel is selected, you can modify its properties using the keyboard:\n" +
    "E, R - Rotate left/right.\nP - Open properties screen.\nArrow keys - Move cel 8 pixels " +
    "(hold ALT for 2 pixels).\n+/- : Zoom in/out.\nL - Lock a cel. Locking a cel prevents it " +
    "from being moved or deleted.\nDEL - Deletes the cel.\nAlso press TAB to switch the selected cel.";
  const cmdwin = Window_UnformattedTextPokemon.newWithSize("", 0, 0, 640, 512);
  cmdwin.opacity = 224;
  cmdwin.z = 99999;
  cmdwin.text = helptext;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    cmdwin.update();
    if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) break;
  }
  cmdwin.dispose();
}

//===============================================================================
// Main
//===============================================================================
export async function animationEditorMain(file: PkmnAnimationsFile): Promise<void> {
  const animation = file.animations;
  const viewport = new Viewport(0, 0, Settings.SCREEN_WIDTH + 288, Settings.SCREEN_HEIGHT + 288);
  viewport.z = 99999;
  // Canvas
  const canvas = await AnimationCanvas.create(animation.get(animation.selected) ?? animation.get(0)!, viewport);
  // Right hand menu
  const sidewin = new ControlWindow(512 + 128, 0, 160, 384 + 128);
  sidewin.addButton(_INTL("SE and BG..."));
  sidewin.addButton(_INTL("Cel Focus..."));
  sidewin.addSpace();
  sidewin.addButton(_INTL("Paste Last"));
  sidewin.addButton(_INTL("Copy Frames..."));
  sidewin.addButton(_INTL("Clear Frames..."));
  sidewin.addButton(_INTL("Tweening..."));
  sidewin.addButton(_INTL("Cel Batch..."));
  sidewin.addButton(_INTL("Entire Slide..."));
  sidewin.addSpace();
  sidewin.addButton(_INTL("Play Animation"));
  sidewin.addButton(_INTL("Play Opp Anim"));
  sidewin.addButton(_INTL("Import Anim..."));
  sidewin.addButton(_INTL("Export Anim..."));
  sidewin.addButton(_INTL("Help"));
  sidewin.viewport = canvas.viewport;
  // Bottom left menu
  const sliderwin = new ControlWindow(0, 384 + 128, 240, 160);
  sliderwin.addControl(new FrameCountSlider(canvas));
  sliderwin.addControl(new FrameCountButton(canvas));
  sliderwin.addButton(_INTL("Set Animation Sheet"));
  sliderwin.addButton(_INTL("List of Animations"));
  sliderwin.viewport = canvas.viewport;
  const frameSlider = sliderwin.controls[0] as FrameCountSlider;
  // Animation sheet window
  const animwin = new CanvasAnimationWindow(canvas, 240, 384 + 128, 512, 96, canvas.viewport);
  // Name window
  const bottomwindow = new AnimationNameWindow(canvas, 240, 384 + 128 + 96, 512, 64, canvas.viewport);
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    sliderwin.update();
    await canvas.update();
    sidewin.update();
    animwin.update();
    bottomwindow.update();
    if (animwin.isChanged()) canvas.selectedPattern = animwin.selected;
    if (Input.trigger(Input.BACK)) {
      if (await pbConfirmMessage(_INTL("Save changes?"))) {
        await devWriteOrExplain(PKMN_ANIMATIONS_FILE, () => savePkmnAnimations(file));
      }
      if (await pbConfirmMessage(_INTL("Exit from the editor?"))) {
        resetBattleAnimationsData(); // $game_temp.battle_animations_data = nil
        break;
      }
    }
    if (KeyboardInput.triggerex("F5")) {
      await pbAnimEditorHelpWindow();
      continue;
    } else if (Input.trigger(Input.MOUSERIGHT) && sliderwin.hittest(0)) { // Right mouse button
      const commands = [
        _INTL("Copy Frame"),
        _INTL("Paste Frame"),
        _INTL("Clear Frame"),
        _INTL("Insert Frame"),
        _INTL("Delete Frame"),
      ];
      const hit = await pbTrackPopupMenu(commands);
      switch (hit) {
        case 0: // Copy
          if (canvas.currentframe >= 0) Clipboard.setData(canvas.animation.array[canvas.currentframe], "PBAnimFrame");
          break;
        case 1: // Paste
          if (canvas.currentframe >= 0) canvas.pasteFrame(canvas.currentframe);
          break;
        case 2: // Clear Frame
          canvas.clearFrame(canvas.currentframe);
          break;
        case 3: // Insert Frame
          canvas.insertFrame(canvas.currentframe);
          sliderwin.invalidate();
          break;
        case 4: // Delete Frame
          canvas.deleteFrame(canvas.currentframe);
          frameSlider.curvalue = canvas.currentframe + 1;
          sliderwin.invalidate();
          break;
      }
      continue;
    } else if (KeyboardInput.triggerex("Q")) {
      if (canvas.currentCel()) {
        await pbDefinePath(canvas);
        sliderwin.invalidate();
      }
      continue;
    } else if (Input.trigger(Input.MOUSERIGHT)) { // Right mouse button
      const mousepos = getMousePos() ?? [0, 0];
      const commands = [
        _INTL("Properties..."),
        _INTL("Cut"),
        _INTL("Copy"),
        _INTL("Paste"),
        _INTL("Delete"),
        _INTL("Renumber..."),
        _INTL("Extrapolate Path..."),
      ];
      const hit = await pbTrackPopupMenu(commands);
      switch (hit) {
        case 0: // Properties
          if (canvas.currentCel()) {
            await pbCellProperties(canvas);
            canvas.invalidateCel(canvas.currentcel);
          }
          break;
        case 1: // Cut
          if (canvas.currentCel()) {
            Clipboard.setData(canvas.currentCel(), "PBAnimCel");
            canvas.deleteCel(canvas.currentcel);
          }
          break;
        case 2: // Copy
          if (canvas.currentCel()) Clipboard.setData(canvas.currentCel(), "PBAnimCel");
          break;
        case 3: // Paste
          canvas.pasteCel(mousepos[0], mousepos[1]);
          break;
        case 4: // Delete
          canvas.deleteCel(canvas.currentcel);
          break;
        case 5: // Renumber
          if (canvas.currentcel != null && canvas.currentcel >= 2) {
            const cel1 = canvas.currentcel;
            const cel2 = await pbChooseNum(cel1);
            if (cel2 >= 2 && cel1 !== cel2) canvas.swapCels(cel1, cel2);
          }
          break;
        case 6: // Extrapolate Path
          if (canvas.currentCel()) {
            await pbDefinePath(canvas);
            sliderwin.invalidate();
          }
          break;
      }
      continue;
    }
    if (sliderwin.isChanged(0)) { // Current frame changed
      canvas.currentframe = Number(sliderwin.value(0)) - 1;
    }
    if (sliderwin.isChanged(1)) { // Change frame count
      await pbChangeMaximum(canvas);
      if (canvas.currentframe >= canvas.animation.length) {
        canvas.currentframe = canvas.animation.length - 1;
        frameSlider.curvalue = canvas.currentframe + 1;
      }
      sliderwin.refresh();
    }
    if (sliderwin.isChanged(2)) { // Set Animation Sheet
      await pbSelectAnim(canvas, animwin);
      animwin.refresh();
      sliderwin.refresh();
    }
    if (sliderwin.isChanged(3)) { // List of Animations
      await pbAnimList(animation, canvas, animwin);
      frameSlider.curvalue = canvas.currentframe + 1;
      bottomwindow.refresh();
      animwin.refresh();
      sliderwin.refresh();
    }
    if (sidewin.isChanged(0)) await pbTimingList(canvas);
    if (sidewin.isChanged(1)) {
      const positions = [_INTL("User"), _INTL("Target"), _INTL("User and target"), _INTL("Screen")];
      const indexes = [2, 1, 3, 4]; // Keeping backwards compatibility
      for (let i = 0; i < positions.length; i++) {
        let selected = "[  ]";
        if (animation.get(animation.selected)!.position === indexes[i]) selected = "[x]";
        positions[i] = `${selected} ${positions[i]}`;
      }
      const pos = await pbShowCommands(null, positions, -1);
      if (pos >= 0) {
        animation.get(animation.selected)!.position = indexes[pos]!;
        await canvas.update();
      }
    }
    if (sidewin.isChanged(3)) canvas.pasteLast();
    if (sidewin.isChanged(4)) await pbCopyFrames(canvas);
    if (sidewin.isChanged(5)) await pbClearFrames(canvas);
    if (sidewin.isChanged(6)) await pbTweening(canvas);
    if (sidewin.isChanged(7)) await pbCellBatch(canvas);
    if (sidewin.isChanged(8)) await pbEntireSlide(canvas);
    if (sidewin.isChanged(10)) await canvas.play();
    if (sidewin.isChanged(11)) await canvas.play(true);
    if (sidewin.isChanged(12)) {
      await pbImportAnim(animation, canvas, animwin);
      frameSlider.curvalue = canvas.currentframe + 1;
      bottomwindow.refresh();
      animwin.refresh();
      sliderwin.refresh();
    }
    if (sidewin.isChanged(13)) {
      await pbExportAnim(animation);
      bottomwindow.refresh();
      animwin.refresh();
      sliderwin.refresh();
    }
    if (sidewin.isChanged(14)) await pbAnimEditorHelpWindow();
  }
  canvas.dispose();
  animwin.dispose();
  sliderwin.dispose();
  sidewin.dispose();
  bottomwindow.dispose();
  viewport.dispose();
  // RPG::Cache.clear: the browser's bitmap cache is kept (ui/rpgCache.ts).
}

//===============================================================================
// Start
//===============================================================================
export async function pbAnimationEditor(): Promise<void> {
  pbBGMStop();
  let file = await loadPkmnAnimationsForEditor(); // pbLoadBattleAnimations
  if (!file || !file.animations.get(0)) {
    file = { move2anim: file?.move2anim ?? [{}, {}], animations: new PBAnimations() };
    file.animations.get(0)!.graphic = "";
  }
  Graphics.resizeScreen(Settings.SCREEN_WIDTH + 288, Settings.SCREEN_HEIGHT + 288);
  pbSetResizeFactor(1);
  try {
    await animationEditorMain(file);
  } finally {
    Graphics.resizeScreen(Settings.SCREEN_WIDTH, Settings.SCREEN_HEIGHT);
    pbSetResizeFactor(G.pokemonSystem.screensize);
  }
  (G.gameMap as { autoplay?: () => void } | null)?.autoplay?.();
}

EditorScreens.pbAnimationEditor = pbAnimationEditor;
