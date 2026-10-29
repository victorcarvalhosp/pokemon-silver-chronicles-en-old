// Port of the mail functions in 013_Items/006_Item_Mail.rb (pbMoveToMailbox,
// pbStoreMail, pbDisplayMail, pbWriteMail) and of pbFreeText /
// pbMessageFreeText (007_Objects and windows/011_Messages.rb), which
// pbWriteMail uses to type the message.

import { Item } from "../../data/gameData/item";
import type { Id } from "../../data/gameData/gameData";
import { G } from "../../game/globals";
import { Mail, type MailPokemon } from "../../game/pokemon/Mail";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { drawTextEx } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import {
  _INTL, isDarkBackground, pbDisposeSpriteHash, pbPositionNearMsgWindow, pbSetSystemFont, pbUpdateSpriteHash,
} from "../messageConfig";
import { pbCreateMessageWindow, pbDisposeMessageWindow, pbMessageDisplay, type FrameBlock } from "../messages";
import { addBackgroundPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { preloadSpeciesIcons, speciesIconFilename } from "../sprites/pokemonIcon";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { Window_TextEntry_Keyboard } from "../textEntry/TextEntry";
import { KeyboardInput } from "../textEntry/keyboard";
import { resolveBitmap } from "../sprites/pokemonIcon";
import type { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";

const player = () => G.player as unknown as Player;

interface MailGlobals { mailbox?: Mail[] | null }
const globals = () => G.pokemonGlobal as unknown as MailGlobals;

/** pbMoveToMailbox(pokemon) */
export function pbMoveToMailbox(pokemon: Pokemon): boolean {
  if (!globals().mailbox) globals().mailbox = [];
  const mailbox = globals().mailbox!;
  if (mailbox.length >= 10) return false;
  if (!pokemon.mail) return false;
  mailbox.push(pokemon.mail);
  pokemon.mail = null;
  return true;
}

/** pbStoreMail(pkmn, item, message, poke1, poke2, poke3) */
export function pbStoreMail(pkmn: Pokemon, item: Id, message: string, poke1: MailPokemon | null = null, poke2: MailPokemon | null = null, poke3: MailPokemon | null = null): void {
  if (pkmn.mail) throw new Error(_INTL("Pokémon already has mail"));
  pkmn.mail = new Mail(item, message, player().name, poke1, poke2, poke3);
}

function mailBearerParams(p: MailPokemon) {
  // GameData::Species.icon_filename(species, form, gender, shiny, shadow, egg)
  return { species: p[0], form: p[3], gender: p[1], shiny: p[2], shadow: p[4], egg: !!p[5] };
}

/** pbDisplayMail(mail, bearer) */
export async function pbDisplayMail(mail: Mail, _bearer: Pokemon | null = null): Promise<void> {
  const mailFile = Item.mailFilename(mail.item, resolveBitmap);
  await preloadBitmaps(["Graphics/Pictures/mailbg", ...(mailFile ? [mailFile] : [])]);
  const bearers = [mail.poke1, mail.poke2, mail.poke3].filter((p): p is MailPokemon => !!p);
  await preloadSpeciesIcons(bearers.map(mailBearerParams));
  const sprites: Record<string, any> = {};
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  addBackgroundPlane(sprites, "background", "mailbg", viewport);
  sprites.card = new IconSprite(0, 0, viewport);
  sprites.card.setBitmapFile(Item.mailFilename(mail.item, resolveBitmap));
  sprites.overlay = new BitmapSprite(Graphics.width, Graphics.height, viewport);
  const overlay = sprites.overlay.bitmap;
  pbSetSystemFont(overlay);
  if (Item.get(mail.item).isIconMail()) {
    ([["bearer", mail.poke1, 64], ["bearer2", mail.poke2, 144], ["bearer3", mail.poke3, 224]] as const).forEach(([key, poke, x]) => {
      if (!poke) return;
      sprites[key] = new IconSprite(x, 288, viewport);
      sprites[key].setBitmapFile(speciesIconFilename(mailBearerParams(poke)));
      sprites[key].srcRect.set(0, 0, 64, 64);
    });
  }
  const baseForDarkBG = new Color(248, 248, 248);
  const shadowForDarkBG = new Color(72, 80, 88);
  const baseForLightBG = new Color(80, 80, 88);
  const shadowForLightBG = new Color(168, 168, 176);
  if (mail.message && mail.message !== "") {
    const isDark = isDarkBackground(sprites.card.bitmap, new Rect(48, 48, Graphics.width - 96, 32 * 7));
    drawTextEx(overlay, 48, 52, Graphics.width - 94, 7, mail.message,
      isDark ? baseForDarkBG : baseForLightBG, isDark ? shadowForDarkBG : shadowForLightBG);
  }
  if (mail.sender && mail.sender !== "") {
    const isDark = isDarkBackground(sprites.card.bitmap, new Rect(336, 322, 144, 32 * 1));
    drawTextEx(overlay, 336, 328, 144, 1, mail.sender,
      isDark ? baseForDarkBG : baseForLightBG, isDark ? shadowForDarkBG : shadowForLightBG);
  }
  await pbFadeInAndShow(sprites);
  for (;;) {
    await Graphics.update();
    Input.update();
    pbUpdateSpriteHash(sprites);
    if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) break;
  }
  await pbFadeOutAndHide(sprites);
  pbDisposeSpriteHash(sprites);
  viewport.dispose();
}

/** pbFreeText(msgwindow, currenttext, passwordbox, maxlength, width) */
export async function pbFreeText(msgwindow: Window_AdvancedTextPokemon | null, currenttext: string, passwordbox: boolean, maxlength: number, width = 240, block?: FrameBlock): Promise<string> {
  const window = new Window_TextEntry_Keyboard(currenttext, 0, 0, width, 64);
  let ret = "";
  window.maxlength = maxlength;
  window.visible = true;
  window.z = 99999;
  pbPositionNearMsgWindow(window, msgwindow, "right");
  window.text = currenttext;
  if (passwordbox) window.passwordChar = "*";
  KeyboardInput.textInput = true;
  for (;;) {
    await Graphics.update();
    Input.update();
    KeyboardInput.update();
    if (KeyboardInput.triggerex("ESCAPE")) {
      ret = currenttext;
      break;
    } else if (KeyboardInput.triggerex("RETURN")) {
      ret = window.text;
      break;
    }
    window.update();
    msgwindow?.update();
    if (block) await block();
  }
  KeyboardInput.textInput = false;
  window.dispose();
  Input.update();
  return ret;
}

/** pbMessageFreeText(message, currenttext, passwordbox, maxlength, width) */
export async function pbMessageFreeText(message: string, currenttext: string, passwordbox: boolean, maxlength: number, width = 240, block?: FrameBlock): Promise<string> {
  const msgwindow = pbCreateMessageWindow();
  let retval = "";
  await pbMessageDisplay(msgwindow, message, true, async (win) => {
    retval = await pbFreeText(win, currenttext, passwordbox, maxlength, width, block);
    return 0;
  }, block);
  pbDisposeMessageWindow(msgwindow);
  return retval;
}

function mailPokemon(p: Pokemon): MailPokemon {
  // [species, gender, shiny?, form, shadowPokemon?] + true if an egg
  return [p.species, p.gender, p.shiny, p.form, p.shadowPokemon(), p.egg()];
}

/** pbWriteMail(item, pkmn, pkmnid, scene) */
export async function pbWriteMail(item: Id, pkmn: Pokemon, pkmnid: number, scene: { pbConfirm(text: string): Promise<boolean>; pbUpdate?(): void }): Promise<boolean> {
  let message = "";
  for (;;) {
    message = await pbMessageFreeText(_INTL("Please enter a message (max. 250 characters)."),
      "", false, 250, Graphics.width, () => scene.pbUpdate?.());
    if (message !== "") {
      // Store mail if a message was written
      let poke1: MailPokemon | null = null;
      let poke2: MailPokemon | null = null;
      const party = player().party;
      if (party[pkmnid + 2]) poke1 = mailPokemon(party[pkmnid + 2]!);
      if (party[pkmnid + 1]) poke2 = mailPokemon(party[pkmnid + 1]!);
      const poke3 = mailPokemon(pkmn);
      pbStoreMail(pkmn, item, message, poke1, poke2, poke3);
      return true;
    }
    if (await scene.pbConfirm(_INTL("Stop giving the Pokémon Mail?"))) return false;
  }
}
