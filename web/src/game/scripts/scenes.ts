// Event-script entry points for the scenes the game's opening uses
// (ui/scenes, ui/textEntry), registered under their Ruby names.

import { ButtonEventScene } from "../../ui/scenes/ButtonEventScene";
import { type EventSceneClass, pbEventScreen } from "../../ui/scenes/EventScene";
import { pbGenderSelector } from "../../ui/scenes/GenderSelector";
import { pbGetKeyItem } from "../../ui/scenes/KeyItem";
import { pbUnlockOutfit, pbWardrobe } from "../../ui/scenes/Wardrobe";
import { pbTrainerName } from "../../ui/textEntry/playerName";
import { pbEnterBoxName, pbEnterNPCName, pbEnterPlayerName, pbEnterPokemonName, pbEnterText } from "../../ui/textEntry/UI_TextEntry";
import { defineScript, evaluateAsync, type ScriptContext } from "../scriptApi";

const str = (v: unknown, fallback = ""): string => (v == null ? fallback : String(v));
const num = (v: unknown, fallback: number): number => (v == null ? fallback : Number(v));
const bool = (v: unknown): boolean => v != null && v !== false;

// --- 009_Scenes/002_EventScene.rb, 016_UI/.../002_UI_Controls.rb --------------
// `pbEventScreen(ButtonEventScene)` passes {call: "ButtonEventScene"}: the class.
defineScript("ButtonEventScene", () => ButtonEventScene);
defineScript("pbEventScreen", (_c, cls) => pbEventScreen(cls as EventSceneClass));

// --- Plugins/BW Gender Selector ------------------------------------------------
defineScript("pbGenderSelector", () => pbGenderSelector());

// --- Plugins/BW Key Items ---------------------------------------------------------
/** Kernel.pbReceiveItem, through whatever the item/bag port registers. */
const receiveItem = (ctx: ScriptContext) => (item: string, quantity: number) =>
  evaluateAsync({ call: "pbReceiveItem", args: [item, quantity] }, ctx);
defineScript("pbGetKeyItem", (ctx, item, quantity, plural) =>
  pbGetKeyItem(str(item), num(quantity, 1), plural ?? null, receiveItem(ctx)));

// --- Plugins/TC Wardrobe -----------------------------------------------------------
defineScript("pbWardrobe", (_c, overlayText) => (overlayText == null ? pbWardrobe() : pbWardrobe(String(overlayText))));
defineScript("pbUnlockOutfit", (_c, index) => pbUnlockOutfit(Number(index)));
defineScript("$player.pbUnlockOutfit", (_c, index) => pbUnlockOutfit(Number(index)));

// --- 016_UI/024_UI_TextEntry.rb, 019_Utilities/001_Utilities.rb ---------------
defineScript("pbEnterText", (_c, helptext, minlength, maxlength, initialText, mode, pokemon, nofadeout) =>
  pbEnterText(str(helptext), num(minlength, 0), num(maxlength, 0), str(initialText), num(mode, 0), pokemon ?? null, bool(nofadeout)));
defineScript("pbEnterPlayerName", (_c, helptext, minlength, maxlength, initialText, nofadeout) =>
  pbEnterPlayerName(str(helptext), num(minlength, 0), num(maxlength, 0), str(initialText), bool(nofadeout)));
defineScript("pbEnterPokemonName", (_c, helptext, minlength, maxlength, initialText, pokemon, nofadeout) =>
  pbEnterPokemonName(str(helptext), num(minlength, 0), num(maxlength, 0), str(initialText), pokemon ?? null, bool(nofadeout)));
defineScript("pbEnterNPCName", (_c, helptext, minlength, maxlength, initialText, id, nofadeout) =>
  pbEnterNPCName(str(helptext), num(minlength, 0), num(maxlength, 0), str(initialText), id ?? 0, bool(nofadeout)));
defineScript("pbEnterBoxName", (_c, helptext, minlength, maxlength, initialText, nofadeout) =>
  pbEnterBoxName(str(helptext), num(minlength, 0), num(maxlength, 0), str(initialText), bool(nofadeout)));
defineScript("pbTrainerName", (_c, name, outfit) => pbTrainerName(name == null ? null : String(name), num(outfit, 0)));
