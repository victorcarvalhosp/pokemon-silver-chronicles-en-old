// Port of Data/Scripts/020_Debug/002_Animation editor/004_AnimEditor_ExportImport.rb:
// exporting/importing one animation as an .anm text file, and converting old
// animations to the cel-focus format. Sets the AnimEditorHooks the Debug
// menu's Export/Import All Battle Animations use (debug/DebugMenuExtraCode.ts).
//
// The .anm format: Ruby's is base64(Zlib::Deflate(Marshal.dump(animation)))
// with "\r\n" line breaks. There is no Marshal in the browser, so here it's
// base64 of the zlib-deflated JSON of the animation (its record in
// pkmn-animations.json), with the same line breaks. Files written by the Ruby
// game can't be read (loadBase64Anim returns nil, as for any bad file).
//
// Where Ruby writes "<name>.anm" in the game folder and lists "*.anm" there,
// the browser can only write under web/data/ (debug/devFilesPolicy.ts), so the
// files go in web/data/ itself (ANM_FOLDER).

import {
  AnimFrame, FOCUSTARGET_X, FOCUSTARGET_Y, FOCUSUSER_X, FOCUSUSER_Y, PBAnimation, type PBAnimationData,
  type PBAnimations, resetBattleAnimationsData,
} from "../../battle/scene/animationPlayer";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { _INTL } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import { pbMessageFreeText } from "../../ui/party/mail";
import { pbResolveBitmap, preloadBitmap } from "../../ui/rpgCache";
import { AnimEditorHooks, parseDataJSON, prettyDataJSON } from "../DebugMenuExtraCode";
import { DevFiles, devWriteOrExplain } from "../devFiles";
import { pbListWindow } from "../EditorListers";
import {
  loadPkmnAnimationsForEditor, parseKeepingFloats, PKMN_ANIMATIONS_FILE, rAdd, savePkmnAnimations,
} from "./AnimEditor_Data";
import { editorInputUpdate, type AnimationCanvas, type CanvasAnimationWindow } from "./AnimEditor_SceneElements";

/** Where .anm files are written and listed ("the game folder" in Ruby). */
export const ANM_FOLDER = "web/data/";

//===============================================================================
// Importing and exporting
//===============================================================================
// pbRgssChdir(dir) { ... } (Dir.chdir into each RTP path): the editors list
// folders through EditorListers.globFolder instead.

/** tryLoadData(file): load_data(file), or nil if it fails (here: the parsed JSON file). */
export async function tryLoadData(file: string): Promise<unknown> {
  try {
    const text = await DevFiles.read(file);
    return text === null ? null : parseDataJSON(text);
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ""));
  const ret = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) ret[i] = bin.charCodeAt(i);
  return ret;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** The animation's record, as in pkmn-animations.json. */
function animRecord(s: PBAnimation): PBAnimationData {
  return {
    id: s.id, name: s.name, graphic: s.graphic, hue: s.hue, position: s.position, speed: s.rawSpeed, scope: s.scope,
    timing: s.timing, frames: s.array.map((f) => Array.from(f, (c) => (c ? Array.from(c, (v) => v ?? null) : null))),
  };
}

/** dumpBase64Anim(s): pack("m") puts 60 base64 characters on each line. */
export async function dumpBase64Anim(s: PBAnimation): Promise<string> {
  const json = prettyDataJSON(animRecord(s));
  const deflated = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate"));
  const b64 = toBase64(deflated);
  let ret = "";
  for (let i = 0; i < b64.length; i += 60) ret += b64.slice(i, i + 60) + "\r\n";
  return ret;
}

/** loadBase64Anim(s): the animation, or null (Ruby raises) if the text isn't one. */
export async function loadBase64Anim(s: string): Promise<PBAnimation | null> {
  try {
    const inflated = await pipe(fromBase64(s), new DecompressionStream("deflate"));
    const data = parseKeepingFloats(new TextDecoder().decode(inflated)) as PBAnimationData | null;
    if (!data || typeof data !== "object" || !Array.isArray(data.frames) || !Array.isArray(data.timing)) return null;
    return new PBAnimation(data);
  } catch {
    return null;
  }
}

export async function pbExportAnim(animations: PBAnimations): Promise<void> {
  let filename = await pbMessageFreeText(_INTL("Enter a filename."), "", false, 32);
  if (filename !== "") {
    let failed: boolean;
    try {
      filename += ".anm";
      const text = await dumpBase64Anim(animations.get(animations.selected)!);
      await DevFiles.write(ANM_FOLDER + filename, text);
      failed = false;
    } catch (e) {
      console.warn(e);
      await pbMessage(_INTL("Couldn't save the animation to {1}.", filename));
      failed = true;
    }
    if (!failed) {
      await pbMessage(_INTL("Animation was saved to {1} in the game folder.", ANM_FOLDER + filename));
      await pbMessage(_INTL("It's a text file, so it can be transferred to others easily."));
    }
  }
}

export async function pbImportAnim(animations: PBAnimations, canvas: AnimationCanvas, animwin: CanvasAnimationWindow): Promise<void> {
  const animfiles: string[] = [];
  try {
    const files = (await DevFiles.list(ANM_FOLDER)).filter((f) => !f.includes("/") && /\.anm$/i.test(f));
    animfiles.push(...files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))); // Dir.glob("*.anm")
  } catch {
    // (no dev server: no files)
  }
  const cmdwin = pbListWindow(animfiles, 320);
  cmdwin.opacity = 200;
  cmdwin.height = 480;
  cmdwin.viewport = canvas.viewport;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    cmdwin.update();
    if (Input.trigger(Input.USE) && animfiles.length > 0) {
      let textdata: PBAnimation | null = null;
      try {
        textdata = await loadBase64Anim((await DevFiles.read(ANM_FOLDER + animfiles[cmdwin.index]!)) ?? "");
        if (!(textdata instanceof PBAnimation)) throw new Error("Bad data");
        textdata.id = -1; // this is not an RPG Maker XP animation
        pbConvertAnimToNewFormat(textdata);
        animations.set(animations.selected, textdata);
      } catch {
        await pbMessage(_INTL("The animation is invalid or could not be loaded."));
        continue;
      }
      let graphic: string | null = animations.get(animations.selected)!.graphic;
      graphic = `Graphics/Animations/${graphic}`;
      await preloadBitmap(graphic);
      // NOTE (Ruby parity): the folder is prefixed before the empty check, so an
      // animation without a graphic also gets the "not found" message
      // (004_AnimEditor_ExportImport.rb:69-70).
      if (graphic && graphic !== "" && !pbResolveBitmap(graphic)) { // FileTest.image_exist?
        await pbMessage(_INTL("The animation file {1} was not found. The animation will load anyway.", graphic));
      }
      await canvas.loadAnimation(animations.get(animations.selected)!);
      animwin.animbitmap = canvas.animbitmap;
      break;
    }
    if (Input.trigger(Input.BACK)) break;
  }
  cmdwin.dispose();
}

//===============================================================================
// Format conversion
//===============================================================================
export function pbConvertAnimToNewFormat(textdata: PBAnimation): boolean {
  let needconverting = false;
  for (let i = 0; i < textdata.length; i++) {
    const frame = textdata.array[i];
    if (!frame) continue;
    for (let j = 0; j < PBAnimation.MAX_SPRITES; j++) {
      if (!frame[j]) continue;
      if (frame[j]![AnimFrame.FOCUS] == null) needconverting = true;
      if (needconverting) break;
    }
    if (needconverting) break;
  }
  if (needconverting) {
    for (let i = 0; i < textdata.length; i++) {
      const frame = textdata.array[i];
      if (!frame) continue;
      for (let j = 0; j < PBAnimation.MAX_SPRITES; j++) {
        const cel = frame[j];
        if (!cel) continue;
        if (cel[AnimFrame.PRIORITY] == null) cel[AnimFrame.PRIORITY] = 1;
        switch (j) {
          case 0: // User battler
            cel[AnimFrame.FOCUS] = 2;
            cel[AnimFrame.X] = FOCUSUSER_X;
            cel[AnimFrame.Y] = FOCUSUSER_Y;
            break;
          case 1: // Target battler
            cel[AnimFrame.FOCUS] = 1;
            cel[AnimFrame.X] = FOCUSTARGET_X;
            cel[AnimFrame.Y] = FOCUSTARGET_Y;
            break;
          default:
            cel[AnimFrame.FOCUS] = (textdata.position || 4);
            if (textdata.position === 1) {
              cel[AnimFrame.X] = rAdd(cel[AnimFrame.X], FOCUSTARGET_X) as number;
              cel[AnimFrame.Y] = rAdd(cel[AnimFrame.Y], FOCUSTARGET_Y - 2) as number;
            }
        }
      }
    }
  }
  return needconverting;
}

export async function pbConvertAnimsToNewFormat(): Promise<void> {
  await pbMessage(_INTL("Will convert animations now."));
  let count = 0;
  const file = await loadPkmnAnimationsForEditor(); // pbLoadBattleAnimations
  const animations = file?.animations ?? null;
  if (!animations || !animations.get(0)) {
    await pbMessage(_INTL("No animations exist."));
    return;
  }
  for (let k = 0; k < animations.length; k++) {
    if (!animations.get(k)) continue;
    const ret = pbConvertAnimToNewFormat(animations.get(k)!);
    if (ret) count += 1;
  }
  if (count > 0) {
    await devWriteOrExplain(PKMN_ANIMATIONS_FILE, () => savePkmnAnimations(file!));
    resetBattleAnimationsData(); // $game_temp.battle_animations_data = nil
  }
  await pbMessage(_INTL("{1} animations converted to new format.", count));
}

AnimEditorHooks.dumpBase64Anim = dumpBase64Anim;
AnimEditorHooks.loadBase64Anim = loadBase64Anim;
AnimEditorHooks.pbConvertAnimToNewFormat = pbConvertAnimToNewFormat;
