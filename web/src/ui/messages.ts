// Port of 007_Objects and windows/011_Messages.rb, with this game's plugin
// versions: pbCreateMessageWindow / pbDisposeMessageWindow /
// pbRepositionMessageWindow from Carmaniac's Speech Bubble (speechBubble.ts),
// pbShowCommands from Map Zoom (same behaviour as Essentials') and
// pbShowCommandsWithHelp from v20.1 Hotfixes.
//
// Ruby's blocking loops become async functions: each `Graphics.update` is
// `await Graphics.update()`. Ruby blocks (`&block`, yielded once per frame)
// are optional callbacks. Waits counted in 40 fps frames are converted to
// game time (see frameTime.ts).

import type { AudioRef } from "../data/events";
import { pbMEPlay, pbPlayBuzzerSE, pbPlayCancelSE, pbPlayDecisionSE, pbSEPlay } from "../game/GameSystem";
import { G, pbUpdateSceneMap } from "../game/globals";
import { Bitmap } from "../rgss/Bitmap";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Rect } from "../rgss/types";
import { AnimatedBitmap } from "./AnimatedBitmap";
import { toUnformattedText } from "./drawText";
import { FRAME_RATE, FrameCounter } from "./frameTime";
import { _INTL, getSkinColor, isDarkWindowskin, pbPositionNearMsgWindow, pbBottomLeftLines, MessageConfig } from "./messageConfig";
import { pbResolveBitmap, preloadBitmaps } from "./rpgCache";
import { pbCreateMessageWindow, pbDisposeMessageWindow, pbRepositionMessageWindow } from "./speechBubble";
import { SpriteWindow_Base } from "./windows/SpriteWindow";
import { PictureWindow } from "./windows/SpriteWindowPictures";
import { Window_AdvancedTextPokemon, Window_CommandPokemonEx, Window_InputNumberPokemon } from "./windows/SpriteWindowText";

export { pbCallBub, pbCallBubFollower, pbCreateMessageWindow, pbDisposeMessageWindow, pbRepositionMessageWindow } from "./speechBubble";

/** A Ruby block yielded once per frame. */
export type FrameBlock = (() => void | Promise<void>) | null | undefined;

//===============================================================================
//
//===============================================================================
export class ChooseNumberParams {
  private _maxDigits = 0;
  private _minNumber = 0;
  private _maxNumber = 0;
  /** Set the full path for the message's window skin. */
  messageSkin: string | null = null;
  skin: string | null = null;
  private _negativeAllowed = false;
  private _initialNumber = 0;
  private _cancelNumber: number | null = null;

  setMessageSkin(value: string): void { this.messageSkin = value; }
  setSkin(value: string): void { this.skin = value; }
  setNegativesAllowed(value: boolean): void { this._negativeAllowed = value; }
  get negativesAllowed(): boolean { return !!this._negativeAllowed; }

  setRange(minNumber: number, maxNumber: number): void {
    if (minNumber > maxNumber) maxNumber = minNumber;
    this._maxDigits = 0;
    this._minNumber = minNumber;
    this._maxNumber = maxNumber;
  }

  setDefaultValue(number: number): void {
    this._initialNumber = number;
    this._cancelNumber = null;
  }

  setInitialValue(number: number): void { this._initialNumber = number; }
  setCancelValue(number: number): void { this._cancelNumber = number; }

  get initialNumber(): number {
    return clamp(this._initialNumber, this.minNumber, this.maxNumber);
  }

  get cancelNumber(): number {
    return this._cancelNumber ?? this.initialNumber;
  }

  get minNumber(): number {
    let ret = this._maxDigits > 0 ? -(10 ** this._maxDigits - 1) : this._minNumber;
    if (!this._negativeAllowed && ret < 0) ret = 0;
    return ret;
  }

  get maxNumber(): number {
    let ret = this._maxDigits > 0 ? 10 ** this._maxDigits - 1 : this._maxNumber;
    if (!this._negativeAllowed && ret < 0) ret = 0;
    return ret;
  }

  setMaxDigits(value: number): void {
    this._maxDigits = Math.max(1, value);
  }

  get maxDigits(): number {
    if (this._maxDigits > 0) return this._maxDigits;
    return Math.max(numDigits(this.minNumber), numDigits(this.maxNumber));
  }
}

function clamp(v: number, mn: number, mx: number): number {
  return v < mn ? mn : v > mx ? mx : v;
}

function numDigits(number: number): number {
  let ans = 1;
  number = Math.abs(number);
  while (number >= 10) {
    ans += 1;
    number = Math.floor(number / 10);
  }
  return ans;
}

export async function pbChooseNumber(msgwindow: Window_AdvancedTextPokemon | null, params: ChooseNumberParams | null, block?: FrameBlock): Promise<number> {
  if (!params) return 0;
  let ret = 0;
  const maximum = params.maxNumber;
  const minimum = params.minNumber;
  const defaultNumber = params.initialNumber;
  const cancelNumber = params.cancelNumber;
  const cmdwindow = new Window_InputNumberPokemon(params.maxDigits);
  cmdwindow.z = 99999;
  cmdwindow.visible = true;
  if (params.skin) cmdwindow.setSkin(params.skin);
  cmdwindow.sign = params.negativesAllowed; // must be set before number
  cmdwindow.number = defaultNumber;
  pbPositionNearMsgWindow(cmdwindow, msgwindow, "right");
  for (;;) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
    cmdwindow.update();
    msgwindow?.update();
    await block?.();
    if (Input.trigger(Input.USE)) {
      ret = cmdwindow.number;
      if (ret > maximum) {
        pbPlayBuzzerSE();
      } else if (ret < minimum) {
        pbPlayBuzzerSE();
      } else {
        pbPlayDecisionSE();
        break;
      }
    } else if (Input.trigger(Input.BACK)) {
      pbPlayCancelSE();
      ret = cancelNumber;
      break;
    }
  }
  cmdwindow.dispose();
  Input.update();
  return ret;
}

//===============================================================================
//
//===============================================================================
export class FaceWindowVX extends SpriteWindow_Base {
  declare _faceIndex: number;
  declare _facebitmaptmp: AnimatedBitmap;
  declare _facebitmap: Bitmap;

  constructor(face: string) {
    super(0, 0, 128, 128);
    const faceinfo = face.split(",");
    const facefile = pbResolveBitmap("Graphics/Faces/" + faceinfo[0]) ?? pbResolveBitmap("Graphics/Pictures/" + faceinfo[0]);
    this.contents?.dispose();
    this._faceIndex = parseInt(faceinfo[1] ?? "", 10) || 0;
    this._facebitmaptmp = new AnimatedBitmap(facefile ?? "Graphics/Faces/" + faceinfo[0]);
    this._facebitmap = new Bitmap(96, 96);
    this._facebitmap.blt(0, 0, this._facebitmaptmp.bitmap, this.faceRect());
    this.contents = this._facebitmap;
  }

  private faceRect(): Rect {
    return new Rect((this._faceIndex % 4) * 96, Math.floor(this._faceIndex / 4) * 96, 96, 96);
  }

  override update(): void {
    super.update();
    if (this._facebitmaptmp.totalFrames > 1) {
      this._facebitmaptmp.update();
      this._facebitmap.blt(0, 0, this._facebitmaptmp.bitmap, this.faceRect());
    }
  }

  override dispose(): void {
    this._facebitmaptmp.dispose();
    super.dispose(); // disposes contents (@facebitmap)
  }
}

//===============================================================================
//
//===============================================================================
/** pbCsvField!: removes and returns the first CSV field of holder.str. */
export function pbCsvField(holder: { str: string }): string {
  let ret = "";
  let str = holder.str.replace(/^\s*/, "");
  if (str.startsWith('"')) {
    str = str.slice(1);
    let escaped = false;
    let fieldbytes = 0;
    for (const s of str) {
      fieldbytes += s.length;
      if (s === '"' && !escaped) break;
      if (s === "\\" && !escaped) {
        escaped = true;
      } else {
        ret += s;
        escaped = false;
      }
    }
    str = str.slice(fieldbytes);
    const m = /^\s*,/.exec(str);
    if (!m && !/^\s*$/m.test(str)) throw new Error(`Invalid quoted field (in: ${ret})`);
    holder.str = m ? str.slice(m[0].length) : str.replace(/^\s*$/m, "");
    return ret;
  }
  const comma = str.indexOf(",");
  if (comma >= 0) {
    ret = str.slice(0, comma);
    holder.str = str.slice(comma + 1);
  } else {
    ret = str;
    holder.str = "";
  }
  return ret.replace(/\s+$/, "");
}

export function pbCsvPosInt(holder: { str: string }): number {
  const ret = pbCsvField(holder);
  if (!/^\d+$/.test(ret)) throw new Error(`Field ${ret} is not a positive integer`);
  return parseInt(ret, 10);
}

/** pbStringToAudioFile: "name", "name:volume" or "name:volume:pitch". */
export function pbStringToAudioFile(str: string): AudioRef {
  let m = /^(.*):\s*(\d+)\s*:\s*(\d+)\s*$/.exec(str);
  if (m) return { name: m[1]!, volume: Number(m[2]), pitch: Number(m[3]) };
  m = /^(.*):\s*(\d+)\s*$/.exec(str);
  if (m) return { name: m[1]!, volume: Number(m[2]), pitch: 100 };
  return { name: str, volume: 100, pitch: 100 };
}

/** Integer#to_s_formatted: thousands separators. */
function toSFormatted(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

//===============================================================================
// Money and coins windows
//===============================================================================
type PlayerExtras = { coins?: number; battlePoints?: number };

export function pbGetGoldString(): string {
  return _INTL("${1}", toSFormatted(G.player?.money ?? 0));
}

function currencyWindow(msgwindow: Window_AdvancedTextPokemon, text: string): Window_AdvancedTextPokemon {
  const win = new Window_AdvancedTextPokemon(text);
  win.setSkin("Graphics/Windowskins/goldskin");
  win.resizeToFit(win.text, Graphics.width);
  if (win.width <= 160) win.width = 160;
  return win;
}

export function pbDisplayGoldWindow(msgwindow: Window_AdvancedTextPokemon): Window_AdvancedTextPokemon {
  const goldwindow = currencyWindow(msgwindow, _INTL("Money:\n<ar>{1}</ar>", pbGetGoldString()));
  goldwindow.y = msgwindow.y === 0 ? Graphics.height - goldwindow.height : 0;
  goldwindow.viewport = msgwindow.viewport;
  goldwindow.z = msgwindow.z;
  return goldwindow;
}

export function pbDisplayCoinsWindow(msgwindow: Window_AdvancedTextPokemon, goldwindow: Window_AdvancedTextPokemon | null): Window_AdvancedTextPokemon {
  const coinString = G.player ? toSFormatted((G.player as PlayerExtras).coins ?? 0) : "0";
  const coinwindow = currencyWindow(msgwindow, _INTL("Coins:\n<ar>{1}</ar>", coinString));
  if (msgwindow.y === 0) {
    coinwindow.y = goldwindow ? goldwindow.y - coinwindow.height : Graphics.height - coinwindow.height;
  } else {
    coinwindow.y = goldwindow ? goldwindow.height : 0;
  }
  coinwindow.viewport = msgwindow.viewport;
  coinwindow.z = msgwindow.z;
  return coinwindow;
}

export function pbDisplayBattlePointsWindow(msgwindow: Window_AdvancedTextPokemon): Window_AdvancedTextPokemon {
  const pointsString = G.player ? toSFormatted((G.player as PlayerExtras).battlePoints ?? 0) : "0";
  const pointswindow = currencyWindow(msgwindow, _INTL("Battle Points:\n<ar>{1}</ar>", pointsString));
  pointswindow.y = msgwindow.y === 0 ? Graphics.height - pointswindow.height : 0;
  pointswindow.viewport = msgwindow.viewport;
  pointswindow.z = msgwindow.z;
  return pointswindow;
}

//===============================================================================
//
//===============================================================================
export function pbCreateStatusWindow(viewport: import("../rgss/display").Viewport | null = null): Window_AdvancedTextPokemon {
  const msgwindow = new Window_AdvancedTextPokemon("");
  if (viewport) msgwindow.viewport = viewport;
  else msgwindow.z = 99999;
  msgwindow.visible = false;
  msgwindow.letterbyletter = false;
  pbBottomLeftLines(msgwindow, 2);
  msgwindow.setSkin(MessageConfig.pbGetSpeechFrame());
  return msgwindow;
}

/**
 * Not in Essentials: fetches the graphics a message refers to (\f, \ff, \w,
 * \sign, <icon>, <img>) so the synchronous window code can use them.
 * Already-loaded graphics cost nothing.
 */
export async function preloadMessageGraphics(message: string): Promise<void> {
  const paths: string[] = [];
  for (const m of message.matchAll(/\\f\[([^\]]*)\]/gi)) paths.push(`Graphics/Pictures/${m[1]}`);
  for (const m of message.matchAll(/\\ff\[([^\],]*)[^\]]*\]/gi)) paths.push(`Graphics/Faces/${m[1]}`, `Graphics/Pictures/${m[1]}`);
  for (const m of message.matchAll(/\\[Ww]\[([^\]]+)\]/g)) paths.push(`Graphics/Windowskins/${m[1]}`);
  for (const m of message.matchAll(/\\sign\[([^\]]+)\]/gi)) paths.push(`Graphics/Windowskins/${m[1]}`);
  for (const m of message.matchAll(/<icon=([^>]*)>/gi)) paths.push(`Graphics/Icons/${m[1]!.trim()}`);
  for (const m of message.matchAll(/<img=([^|>]*)/gi)) paths.push(m[1]!.trim());
  if (paths.length) await preloadBitmaps(paths);
}

//===============================================================================
// Main message-displaying function
//===============================================================================
type Control = [string, string, number];

const CONTROL_RE = /(?:\\(f|ff|ts|cl|me|se|wt|wtnp|ch)\[([^\]]*)\]|\\(g|cn|pt|wd|wm|op|cl|wu|\.|\||!|\^))/i;

/** What the text-code replacement needs from the message window. */
export interface MessageSkinTarget {
  windowskin: Bitmap | null;
  setSkin(skin: string, redrawText?: boolean): void;
}

/**
 * The "### Text replacement" part of pbMessageDisplay (split out so it can be
 * tested): expands \PN \PM \n \v[] \c[] \b \r \pg \pog \[XXXXXXXX] \sign[]
 * \w[] \l[] and prefixes the default colour tag.
 */
export function pbMessageReplaceTextCodes(message: string, msgwindow: MessageSkinTarget): { text: string; linecount: number } {
  let text = message;
  let linecount = Graphics.height > 400 ? 3 : 2;
  //## Text replacement
  text = text.replace(/\\sign\[([^\]]*)\]/gi, (_m, p1: string) => // \sign[something] gets turned into
    "\\op\\cl\\ts[]\\w[" + p1 + "]"); // \op\cl\ts[]\w[something]
  text = text.replace(/\\\\/g, "\x05");
  text = text.replace(/\\1/g, "\x01");
  // (\n[1-8] actor names: $game_actors isn't ported.)
  const player = G.player;
  if (player) {
    text = text.replace(/\\pn/gi, () => player.name);
    text = text.replace(/\\pm/gi, () => _INTL("${1}", toSFormatted(player.money)));
  }
  text = text.replace(/\\n/gi, "\n");
  text = text.replace(/\\\[([0-9a-f]{8,8})\]/gi, (_m, p1: string) => "<c2=" + p1 + ">");
  if (player?.gender === 0) text = text.replace(/\\pg/gi, "\\b");
  if (player?.gender === 1) text = text.replace(/\\pg/gi, "\\r");
  if (player?.gender === 0) text = text.replace(/\\pog/gi, "\\r");
  if (player?.gender === 1) text = text.replace(/\\pog/gi, "\\b");
  text = text.replace(/\\pg/gi, "");
  text = text.replace(/\\pog/gi, "");
  text = text.replace(/\\b/gi, "<c3=3050C8,D0D0C8>");
  text = text.replace(/\\r/gi, "<c3=E00808,D0D0C8>");
  text = text.replace(/\\[Ww]\[([^\]]*)\]/g, (_m, w: string) => {
    if (w === "") msgwindow.windowskin = null;
    else msgwindow.setSkin(`Graphics/Windowskins/${w}`, false);
    return "";
  });
  const isDarkSkin = isDarkWindowskin(msgwindow.windowskin);
  text = text.replace(/\\c\[([0-9]+)\]/gi, (_m, p1: string) => getSkinColor(msgwindow.windowskin, Number(p1), isDarkSkin));
  for (;;) {
    const lastText = text;
    text = text.replace(/\\v\[([0-9]+)\]/gi, (_m, p1: string) => String(G.gameVariables.get(Number(p1))));
    if (text === lastText) break;
  }
  for (;;) {
    const lastText = text;
    text = text.replace(/\\l\[([0-9]+)\]/gi, (_m, p1: string) => {
      linecount = Math.max(1, Number(p1));
      return "";
    });
    if (text === lastText) break;
  }
  let colortag: string;
  if (G.gameSystem && G.gameSystem.messageFrame !== 0) colortag = getSkinColor(msgwindow.windowskin, 0, true);
  else colortag = getSkinColor(msgwindow.windowskin, 0, isDarkSkin);
  text = colortag + text;
  return { text, linecount };
}

/**
 * The "### Controls" part of pbMessageDisplay: removes \f[] \ff[] \ts[] \cl
 * \me[] \se[] \wt[] \wtnp[] \ch[] \g \cn \pt \wd \wm \op \wu \. \| \! \^
 * from the text and returns them with their position in the unformatted text
 * ("\x02" is added for waits, "\x01" for \!).
 */
export function pbMessageSplitControls(text: string): { text: string; controls: (Control | null)[] } {
  const textchunks: string[] = [];
  const controls: (Control | null)[] = [];
  let m: RegExpExecArray | null;
  while ((m = CONTROL_RE.exec(text))) {
    textchunks.push(text.slice(0, m.index));
    if (m[1] !== undefined) controls.push([m[1].toLowerCase(), m[2] ?? "", -1]);
    else controls.push([m[3]!.toLowerCase(), "", -1]);
    text = text.slice(m.index + m[0].length);
  }
  textchunks.push(text);
  for (let i = 0; i < textchunks.length; i++) textchunks[i] = textchunks[i]!.replace(/\x05/g, "\\");
  let textlen = 0;
  for (let i = 0; i < controls.length; i++) {
    const control = controls[i]![0];
    switch (control) {
      case "wt": case "wtnp": case ".": case "|":
        textchunks[i] += "\x02";
        break;
      case "!":
        textchunks[i] += "\x01";
        break;
    }
    textlen += Array.from(toUnformattedText(textchunks[i]!)).length;
    controls[i]![2] = textlen;
  }
  text = textchunks.join("");
  return { text, controls };
}

export async function pbMessageDisplay(
  msgwindow: Window_AdvancedTextPokemon | null,
  message: string,
  letterbyletter = true,
  commandProc: ((msgwindow: Window_AdvancedTextPokemon) => Promise<number> | number) | null = null,
  block?: FrameBlock,
): Promise<number | null> {
  if (!msgwindow) return null;
  await preloadMessageGraphics(message);
  const oldletterbyletter = msgwindow.letterbyletter;
  msgwindow.letterbyletter = !!letterbyletter;
  let ret: number | null = null;
  let commands: string[] | null = null;
  let facewindow: PictureWindow | FaceWindowVX | null = null;
  let goldwindow: Window_AdvancedTextPokemon | null = null;
  let coinwindow: Window_AdvancedTextPokemon | null = null;
  let battlepointswindow: Window_AdvancedTextPokemon | null = null;
  let cmdvariable = 0;
  let cmdIfCancel = 0;
  msgwindow.waitcount = 0;
  let autoresume = false;
  const replaced = pbMessageReplaceTextCodes(message, msgwindow);
  const linecount = replaced.linecount;
  const parsed = pbMessageSplitControls(replaced.text);
  let text = parsed.text;
  const controls = parsed.controls;
  let signWaitCount = 0;
  const signWaitTime = Math.floor(FRAME_RATE / 2);
  let haveSpecialClose = false;
  let specialCloseSE = "";
  let startSE: string | null = null;
  for (let i = 0; i < controls.length; i++) {
    const [control, param] = controls[i]!;
    switch (control) {
      case "op":
        signWaitCount = signWaitTime + 1;
        break;
      case "cl":
        text = text.replace(/\x01$/, ""); // fix: '$' can match end of line as well
        haveSpecialClose = true;
        specialCloseSE = param;
        break;
      case "f":
        facewindow?.dispose();
        facewindow = new PictureWindow(`Graphics/Pictures/${param}`);
        break;
      case "ff":
        facewindow?.dispose();
        facewindow = new FaceWindowVX(param);
        break;
      case "ch": {
        const cmds = { str: param };
        cmdvariable = pbCsvPosInt(cmds);
        cmdIfCancel = parseInt(pbCsvField(cmds), 10) || 0;
        commands = [];
        while (cmds.str.length > 0) commands.push(pbCsvField(cmds));
        break;
      }
      case "wtnp": case "^":
        text = text.replace(/\x01$/, ""); // fix: '$' can match end of line as well
        break;
      case "se":
        if (controls[i]![2] === 0) {
          startSE = param;
          controls[i] = null;
        }
        break;
    }
  }
  if (startSE) pbSEPlay(pbStringToAudioFile(startSE));
  else if (signWaitCount === 0 && letterbyletter) pbPlayDecisionSE();
  //######### Position message window  ##############
  pbRepositionMessageWindow(msgwindow, linecount);
  if (facewindow) {
    pbPositionNearMsgWindow(facewindow, msgwindow, "left");
    facewindow.viewport = msgwindow.viewport;
    facewindow.z = msgwindow.z;
  }
  let atTop = msgwindow.y === 0;
  //######### Show text #############################
  msgwindow.text = text;
  const signClock = new FrameCounter();
  const showFace = (w: PictureWindow | FaceWindowVX) => {
    facewindow?.dispose();
    facewindow = w;
    pbPositionNearMsgWindow(facewindow, msgwindow, "left");
    facewindow.viewport = msgwindow.viewport;
    facewindow.z = msgwindow.z;
  };
  for (;;) {
    if (signWaitCount > 0) {
      signWaitCount = Math.max(0, signWaitCount - signClock.tick());
      if (atTop) {
        msgwindow.y = Math.floor((-msgwindow.height * signWaitCount) / signWaitTime);
      } else {
        msgwindow.y = Graphics.height - Math.floor((msgwindow.height * (signWaitTime - signWaitCount)) / signWaitTime);
      }
    }
    for (let i = 0; i < controls.length; i++) {
      const c = controls[i];
      if (!c) continue;
      if (c[2] > msgwindow.position || msgwindow.waitcount !== 0) continue;
      const [control] = c;
      let param = c[1];
      switch (control) {
        case "f":
          showFace(new PictureWindow(`Graphics/Pictures/${param}`));
          break;
        case "ff":
          showFace(new FaceWindowVX(param));
          break;
        case "g": // Display gold window
          goldwindow?.dispose();
          goldwindow = pbDisplayGoldWindow(msgwindow);
          break;
        case "cn": // Display coins window
          coinwindow?.dispose();
          coinwindow = pbDisplayCoinsWindow(msgwindow, goldwindow);
          break;
        case "pt": // Display battle points window
          battlepointswindow?.dispose();
          battlepointswindow = pbDisplayBattlePointsWindow(msgwindow);
          break;
        case "wu":
          msgwindow.y = 0;
          atTop = true;
          pbPositionNearMsgWindow(facewindow, msgwindow, "left");
          msgwindow.y = Math.floor((-msgwindow.height * signWaitCount) / signWaitTime);
          break;
        case "wm":
          atTop = false;
          msgwindow.y = Math.floor((Graphics.height - msgwindow.height) / 2);
          pbPositionNearMsgWindow(facewindow, msgwindow, "left");
          break;
        case "wd":
          atTop = false;
          msgwindow.y = Graphics.height - msgwindow.height;
          pbPositionNearMsgWindow(facewindow, msgwindow, "left");
          msgwindow.y = Graphics.height - Math.floor((msgwindow.height * (signWaitTime - signWaitCount)) / signWaitTime);
          break;
        case "ts": // Change text speed
          msgwindow.textspeed = param === "" ? -999 : parseInt(param, 10) || 0;
          break;
        case ".": // Wait 0.25 seconds
          msgwindow.waitcount += Math.floor(FRAME_RATE / 4);
          break;
        case "|": // Wait 1 second
          msgwindow.waitcount += FRAME_RATE;
          break;
        case "wt": // Wait X/20 seconds
          param = param.trim();
          msgwindow.waitcount += Math.floor(((parseInt(param, 10) || 0) * FRAME_RATE) / 20);
          break;
        case "wtnp": // Wait X/20 seconds, no pause
          param = param.trim();
          msgwindow.waitcount = Math.floor(((parseInt(param, 10) || 0) * FRAME_RATE) / 20);
          autoresume = true;
          break;
        case "^": // Wait, no pause
          autoresume = true;
          break;
        case "se": // Play SE
          pbSEPlay(pbStringToAudioFile(param));
          break;
        case "me": // Play ME
          pbMEPlay(pbStringToAudioFile(param));
          break;
      }
      controls[i] = null;
    }
    if (!letterbyletter) break;
    await Graphics.update();
    Input.update();
    (facewindow as PictureWindow | FaceWindowVX | null)?.update();
    if (autoresume && msgwindow.waitcount === 0) {
      if (msgwindow.busy()) msgwindow.resume();
      if (!msgwindow.busy()) break;
    }
    if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) {
      if (msgwindow.busy()) {
        if (msgwindow.pausing()) pbPlayDecisionSE();
        msgwindow.resume();
      } else if (signWaitCount === 0) {
        break;
      }
    }
    await pbUpdateSceneMap();
    msgwindow.update();
    await block?.();
    if ((!letterbyletter || commandProc || commands) && !msgwindow.busy()) break;
  }
  Input.update(); // Must call Input.update again to avoid extra triggers
  msgwindow.letterbyletter = oldletterbyletter;
  if (commands) {
    G.gameVariables.set(cmdvariable, await pbShowCommands(msgwindow, commands, cmdIfCancel));
    if (G.gameMap) (G.gameMap as { needRefresh?: boolean }).needRefresh = true;
  }
  if (commandProc) ret = await commandProc(msgwindow);
  goldwindow?.dispose();
  coinwindow?.dispose();
  battlepointswindow?.dispose();
  (facewindow as PictureWindow | FaceWindowVX | null)?.dispose();
  if (haveSpecialClose) {
    pbSEPlay(pbStringToAudioFile(specialCloseSE));
    atTop = msgwindow.y === 0;
    const clock = new FrameCounter();
    for (let i = 0; i <= signWaitTime; i += clock.tick()) {
      if (atTop) msgwindow.y = Math.floor((-msgwindow.height * i) / signWaitTime);
      else msgwindow.y = Graphics.height - Math.floor((msgwindow.height * (signWaitTime - i)) / signWaitTime);
      await Graphics.update();
      Input.update();
      await pbUpdateSceneMap();
      msgwindow.update();
    }
  }
  return ret;
}

//===============================================================================
// Message-displaying functions
//===============================================================================
/**
 * Shows a message and waits for the player. With commands, shows a choice
 * list next to the message and returns the chosen index (cmdIfCancel: 0 =
 * can't cancel, n > 0 = cancelling picks n-1, n < 0 = cancelling returns n).
 */
export async function pbMessage(
  message: string, commands: string[] | null = null, cmdIfCancel = 0, skin: string | null = null, defaultCmd = 0, block?: FrameBlock,
): Promise<number> {
  let ret = 0;
  const msgwindow = pbCreateMessageWindow(null, skin);
  if (commands) {
    ret = (await pbMessageDisplay(msgwindow, message, true,
      (win) => pbShowCommands(win, commands, cmdIfCancel, defaultCmd, block), block)) ?? 0;
  } else {
    await pbMessageDisplay(msgwindow, message, true, null, block);
  }
  pbDisposeMessageWindow(msgwindow);
  Input.update();
  return ret;
}

export async function pbConfirmMessage(message: string, block?: FrameBlock): Promise<boolean> {
  return (await pbMessage(message, [_INTL("Yes"), _INTL("No")], 2, null, 0, block)) === 0;
}

export async function pbConfirmMessageSerious(message: string, block?: FrameBlock): Promise<boolean> {
  return (await pbMessage(message, [_INTL("No"), _INTL("Yes")], 1, null, 0, block)) === 1;
}

export async function pbMessageChooseNumber(message: string, params: ChooseNumberParams, block?: FrameBlock): Promise<number> {
  const msgwindow = pbCreateMessageWindow(null, params.messageSkin);
  const ret = await pbMessageDisplay(msgwindow, message, true, (win) => pbChooseNumber(win, params, block), block);
  pbDisposeMessageWindow(msgwindow);
  return ret ?? 0;
}

/** Map Zoom's version (identical to Essentials' apart from $game_temp.cmd_window). */
export async function pbShowCommands(
  msgwindow: Window_AdvancedTextPokemon | null, commands: string[] | null = null, cmdIfCancel = 0, defaultCmd = 0, block?: FrameBlock,
): Promise<number> {
  if (!commands) return 0;
  const cmdwindow = new Window_CommandPokemonEx(commands);
  G.gameTemp.cmdWindow = cmdwindow; // (Map Zoom hides it while it snaps the screen)
  cmdwindow.z = 99999;
  cmdwindow.visible = true;
  cmdwindow.resizeToFit(cmdwindow.commands);
  pbPositionNearMsgWindow(cmdwindow, msgwindow, "right");
  cmdwindow.index = defaultCmd;
  let command = 0;
  for (;;) {
    await Graphics.update();
    Input.update();
    cmdwindow.update();
    msgwindow?.update();
    await block?.();
    if (Input.trigger(Input.BACK)) {
      if (cmdIfCancel > 0) {
        command = cmdIfCancel - 1;
        break;
      } else if (cmdIfCancel < 0) {
        command = cmdIfCancel;
        break;
      }
    }
    if (Input.trigger(Input.USE)) {
      command = cmdwindow.index;
      break;
    }
    await pbUpdateSceneMap();
  }
  const ret = command;
  cmdwindow.dispose();
  Input.update();
  return ret;
}

/** v20.1 Hotfixes version (disposes the message window it creates properly). */
export async function pbShowCommandsWithHelp(
  msgwindow: Window_AdvancedTextPokemon | null, commands: string[] | null, help: string[], cmdIfCancel = 0, defaultCmd = 0, block?: FrameBlock,
): Promise<number> {
  const msgwin = msgwindow ?? pbCreateMessageWindow(null);
  const oldlbl = msgwin.letterbyletter;
  msgwin.letterbyletter = false;
  let ret = 0;
  if (commands) {
    const cmdwindow = new Window_CommandPokemonEx(commands);
    cmdwindow.z = 99999;
    cmdwindow.visible = true;
    cmdwindow.resizeToFit(cmdwindow.commands);
    if (cmdwindow.height > msgwin.y) cmdwindow.height = msgwin.y;
    cmdwindow.index = defaultCmd;
    let command = 0;
    msgwin.text = help[cmdwindow.index] ?? "";
    msgwin.width = msgwin.width; // Necessary evil to make it use the proper margins
    for (;;) {
      await Graphics.update();
      Input.update();
      const oldindex = cmdwindow.index;
      cmdwindow.update();
      if (oldindex !== cmdwindow.index) msgwin.text = help[cmdwindow.index] ?? "";
      msgwin.update();
      await block?.();
      if (Input.trigger(Input.BACK)) {
        if (cmdIfCancel > 0) {
          command = cmdIfCancel - 1;
          break;
        } else if (cmdIfCancel < 0) {
          command = cmdIfCancel;
          break;
        }
      }
      if (Input.trigger(Input.USE)) {
        command = cmdwindow.index;
        break;
      }
      await pbUpdateSceneMap();
    }
    ret = command;
    cmdwindow.dispose();
    Input.update();
  }
  msgwin.letterbyletter = oldlbl;
  if (!msgwindow) pbDisposeMessageWindow(msgwin);
  return ret;
}

/** frames is the number of 1/20 seconds to wait for */
export async function pbMessageWaitForInput(msgwindow: Window_AdvancedTextPokemon | null, frames: number, showPause = false, block?: FrameBlock): Promise<void> {
  if (!frames || frames <= 0) return;
  if (msgwindow && showPause) msgwindow.startPause();
  const total = Math.floor((frames * FRAME_RATE) / 20);
  const clock = new FrameCounter();
  for (let elapsed = 0; elapsed < total; ) {
    await Graphics.update();
    Input.update();
    msgwindow?.update();
    await pbUpdateSceneMap();
    if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) break;
    await block?.();
    elapsed += clock.tick();
  }
  if (msgwindow && showPause) msgwindow.stopPause();
}

//===============================================================================
// pbEventCommentInput (top of 011_Messages.rb)
//===============================================================================
/** One RPG::EventCommand as Ruby sees it: a comment's first line is code 108, the others 408. */
export interface RawCommand {
  code: number;
  parameters: unknown[];
}

/** A page list with comments split back into RPG Maker's 108/408 commands, plus the closing code 0. */
export function rawCommandList(list: readonly { cmd: string; [field: string]: unknown }[]): RawCommand[] {
  const ret: RawCommand[] = [];
  for (const c of list) {
    if (c.cmd === "comment") {
      const lines = (c.lines as string[] | undefined) ?? [];
      lines.forEach((line, i) => ret.push({ code: i === 0 ? 108 : 408, parameters: [line] }));
    } else {
      // Only comments are read through this; another command's parameters[0]
      // is reported as the command itself.
      ret.push({ code: -1, parameters: [c] });
    }
  }
  ret.push({ code: 0, parameters: [] });
  return ret;
}

/**
 * pbEventCommentInput(event, elements, trigger): the `elements` command lines
 * after the comment line `trigger` in the event's current page, or null.
 */
export function pbEventCommentInput(event: { list: readonly { cmd: string; [field: string]: unknown }[] | null } | null, elements: number, trigger: string): unknown[] | null {
  const parameters: unknown[] = [];
  const evList = event?.list;
  if (evList == null) return null;
  if (!Array.isArray(evList)) return null;
  const list = rawCommandList(evList as { cmd: string }[]);
  for (let index = 0; index < list.length; index++) {
    const item = list[index]!;
    if (item.code !== 108 && item.code !== 408) continue;
    if (item.parameters[0] !== trigger) continue;
    const start = index + 1;
    const finish = start + elements;
    for (let id = start; id < finish; id++) {
      if (list[id]) parameters.push(list[id]!.parameters[0]);
    }
    return parameters;
  }
  return null;
}
