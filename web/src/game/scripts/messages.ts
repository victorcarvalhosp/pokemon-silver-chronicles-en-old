// Connects the interpreter and event scripts to the message system (ui/).

import { ChooseNumberParams, pbChooseNumber, pbConfirmMessage, pbMessage, pbMessageChooseNumber, pbShowCommands } from "../../ui/messages";
import { pbCallBub, pbCallBubFollower } from "../../ui/speechBubble";
import { setMessageApi } from "../messageBridge";
import { defineScript, type ScriptContext } from "../scriptApi";
import type { CharacterLike } from "../globals";

setMessageApi({
  pbMessage: (text, commands, cmdIfCancel = 0, defaultCmd = 0) => pbMessage(text, commands ?? null, cmdIfCancel, null, defaultCmd),
  pbShowCommands: (commands, cmdIfCancel = 0, defaultCmd = 0) => pbShowCommands(null, commands, cmdIfCancel, defaultCmd),
  pbMessageChooseNumber: (text, p) => {
    const params = new ChooseNumberParams();
    params.setMaxDigits(p.maxDigits);
    params.setDefaultValue(p.defaultValue);
    return text == null ? pbChooseNumber(null, params) : pbMessageChooseNumber(text, params);
  },
});

/** Resolves characters the way Interpreter#get_character does for the running event. */
function characterGetter(ctx: ScriptContext) {
  const interp = ctx.interpreter as { getCharacter?(id: number): CharacterLike | null } | null;
  return (id: number) => (interp?.getCharacter ? interp.getCharacter(id) : null);
}

defineScript("pbCallBub", (ctx, status, value, position) =>
  pbCallBub(Number(status ?? 0), Number(value ?? 0), Number(position ?? 0), characterGetter(ctx)));
defineScript("pbCallBubFollower", (_ctx, status, name, position) =>
  pbCallBubFollower(Number(status ?? 0), (name as string | null) ?? null, Number(position ?? 0)));
defineScript("pbMessage", (_ctx, text, commands, cancel) => pbMessage(String(text), (commands as string[] | null) ?? null, Number(cancel ?? 0)));
defineScript("pbConfirmMessage", (_ctx, text) => pbConfirmMessage(String(text)));
