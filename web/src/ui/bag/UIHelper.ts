// Port of UIHelper (016_UI/018_UI_ItemStorage.rb): message, confirmation,
// number and command prompts drawn in a scene's own help window, used by the
// Bag, the party screen and the item storage screens.

import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../../game/GameSystem";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { _INTL, pbBottomLeft, pbBottomLeftLines, pbBottomRight } from "../messageConfig";
import { Window_AdvancedTextPokemon, Window_CommandPokemon, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";

type Block = (() => void | Promise<void>) | undefined;

/** _ISPRINTF("x{1:03d}", n) */
export function x03d(n: number): string {
  return `x${String(n).padStart(3, "0")}`;
}

/** _ISPRINTF("x{1: 3d}", n) */
export function xSpace3d(n: number): string {
  return `x${String(n).padStart(3, " ")}`;
}

export const UIHelper = {
  /** Letter by letter display of the message _msg_ by the window _helpwindow_. */
  async pbDisplay(helpwindow: Window_AdvancedTextPokemon, msg: string, brief: boolean, block?: Block): Promise<void> {
    const cw = helpwindow;
    const oldvisible = cw.visible;
    cw.letterbyletter = true;
    cw.text = msg + "\x01";
    cw.visible = true;
    pbBottomLeftLines(cw, 2);
    for (;;) {
      await Graphics.update();
      Input.update();
      if (block) await block();
      else cw.update();
      if (!cw.busy() && (brief || (Input.trigger(Input.USE) && cw.resume()))) break;
    }
    cw.visible = oldvisible;
  },

  async pbDisplayStatic(msgwindow: Window_AdvancedTextPokemon, message: string, block?: Block): Promise<void> {
    const oldvisible = msgwindow.visible;
    msgwindow.visible = true;
    msgwindow.letterbyletter = false;
    msgwindow.width = Graphics.width;
    msgwindow.resizeHeightToFit(message, Graphics.width);
    msgwindow.text = message;
    pbBottomRight(msgwindow);
    for (;;) {
      await Graphics.update();
      Input.update();
      if (block) await block();
      else msgwindow.update();
      if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) break;
    }
    msgwindow.visible = oldvisible;
    Input.update();
  },

  /**
   * Letter by letter display of the message _msg_ by the window _helpwindow_,
   * used to ask questions. Returns true if the user chose yes, false if no.
   */
  async pbConfirm(helpwindow: Window_AdvancedTextPokemon, msg: string, block?: Block): Promise<boolean> {
    const dw = helpwindow;
    const oldvisible = dw.visible;
    dw.letterbyletter = true;
    dw.text = msg;
    dw.visible = true;
    pbBottomLeftLines(dw, 2);
    const commands = [_INTL("Yes"), _INTL("No")];
    const cw = new Window_CommandPokemon(commands);
    cw.index = 0;
    cw.viewport = helpwindow.viewport;
    pbBottomRight(cw);
    cw.y -= dw.height;
    let ret = false;
    for (;;) {
      cw.visible = !dw.busy();
      await Graphics.update();
      Input.update();
      cw.update();
      if (block) await block();
      else dw.update();
      if (!dw.busy() && dw.resume()) {
        if (Input.trigger(Input.BACK)) {
          pbPlayCancelSE();
          break;
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          ret = cw.index === 0;
          break;
        }
      }
    }
    cw.dispose();
    dw.visible = oldvisible;
    return ret;
  },

  async pbChooseNumber(helpwindow: Window_UnformattedTextPokemon, helptext: string, maximum: number, initnum = 1, block?: Block): Promise<number> {
    const oldvisible = helpwindow.visible;
    helpwindow.visible = true;
    helpwindow.text = helptext;
    helpwindow.letterbyletter = false;
    let curnumber = initnum;
    let ret = 0;
    const numwindow = new Window_UnformattedTextPokemon("x000");
    numwindow.viewport = helpwindow.viewport;
    numwindow.letterbyletter = false;
    numwindow.text = x03d(curnumber);
    numwindow.resizeToFit(numwindow.text, Graphics.width);
    pbBottomRight(numwindow);
    helpwindow.resizeHeightToFit(helpwindow.text, Graphics.width - numwindow.width);
    pbBottomLeft(helpwindow);
    for (;;) {
      await Graphics.update();
      Input.update();
      numwindow.update();
      helpwindow.update();
      if (block) await block();
      const oldnumber = curnumber;
      if (Input.trigger(Input.BACK)) {
        ret = 0;
        pbPlayCancelSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        ret = curnumber;
        pbPlayDecisionSE();
        break;
      } else if (Input.repeat(Input.UP)) {
        curnumber += 1;
        if (curnumber > maximum) curnumber = 1;
        if (curnumber !== oldnumber) {
          numwindow.text = x03d(curnumber);
          pbPlayCursorSE();
        }
      } else if (Input.repeat(Input.DOWN)) {
        curnumber -= 1;
        if (curnumber < 1) curnumber = maximum;
        if (curnumber !== oldnumber) {
          numwindow.text = x03d(curnumber);
          pbPlayCursorSE();
        }
      } else if (Input.repeat(Input.LEFT)) {
        curnumber -= 10;
        if (curnumber < 1) curnumber = 1;
        if (curnumber !== oldnumber) {
          numwindow.text = x03d(curnumber);
          pbPlayCursorSE();
        }
      } else if (Input.repeat(Input.RIGHT)) {
        curnumber += 10;
        if (curnumber > maximum) curnumber = maximum;
        if (curnumber !== oldnumber) {
          numwindow.text = x03d(curnumber);
          pbPlayCursorSE();
        }
      }
    }
    numwindow.dispose();
    helpwindow.visible = oldvisible;
    return ret;
  },

  async pbShowCommands(helpwindow: Window_UnformattedTextPokemon, helptext: string | null, commands: string[], initcmd = 0, block?: Block): Promise<number> {
    let ret = -1;
    const oldvisible = helpwindow.visible;
    helpwindow.visible = !!helptext;
    helpwindow.letterbyletter = false;
    helpwindow.text = helptext || "";
    const cmdwindow = new Window_CommandPokemon(commands);
    cmdwindow.index = initcmd;
    try {
      cmdwindow.viewport = helpwindow.viewport;
      pbBottomRight(cmdwindow);
      helpwindow.resizeHeightToFit(helpwindow.text, Graphics.width - cmdwindow.width);
      pbBottomLeft(helpwindow);
      for (;;) {
        await Graphics.update();
        Input.update();
        if (block) await block();
        cmdwindow.update();
        if (Input.trigger(Input.BACK)) {
          ret = -1;
          pbPlayCancelSE();
          break;
        }
        if (Input.trigger(Input.USE)) {
          ret = cmdwindow.index;
          pbPlayDecisionSE();
          break;
        }
      }
    } finally {
      cmdwindow.dispose();
    }
    helpwindow.visible = oldvisible;
    return ret;
  },
};
