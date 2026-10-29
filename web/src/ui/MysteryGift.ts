// Port of Data/Scripts/016_UI/023_UI_MysteryGift.rb (Mystery Gift system, by
// Maruno): creating and editing gifts for the Master file
// (pbEditMysteryGift, pbCreateMysteryGift), the Debug menu's "Manage Mystery
// Gifts" (pbManageMysteryGifts, pbRefreshMGCommands), downloading new gifts
// from the load screen (pbDownloadMysteryGift) and the gift file format
// (pbMysteryGiftEncrypt/Decrypt). Collecting a gift from the deliveryman
// (pbNextMysteryGiftID, pbReceiveMysteryGift) is in
// game/scripts/eventScripts.ts, which events call. Registers
// EditorScreens.pbCreateMysteryGift and pbManageMysteryGifts.
//
// Differences forced by the browser:
// - Ruby writes MysteryGiftMaster.txt / MysteryGift.txt in the game folder;
//   the dev server only writes under web/data/ (debug/devFilesPolicy.ts), so
//   they are web/data/MysteryGiftMaster.txt and web/data/MysteryGift.txt.
// - The gift files are base64(Zlib::Deflate(Marshal.dump(gifts))). There is no
//   Marshal here: the port writes base64 of the deflated JSON of the gifts (a
//   Pokémon as its Pokemon#toJSON), with pack("m")'s 60-character lines.
//   Files made by the Ruby game don't decode (they read as no gifts).
// - The download uses fetch (pbDownloadToString). MysteryGift::URL is a
//   pastebin page holding a Ruby-format file, and pastebin doesn't allow
//   cross-origin requests, so the browser finds no online gifts there.

import { GameData, type Id } from "../data/gameData";
import { pbDownloadToString } from "../core/httpUtilities";
import { pbMEPlay } from "../game/GameSystem";
import { G } from "../game/globals";
import { Pokemon, type PokemonJSON } from "../game/pokemon/Pokemon";
import { pbReceiveMysteryGift } from "../game/scripts/eventScripts";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { DevFiles } from "../debug/devFiles";
import { EditorScreens } from "../debug/editorScreens";
import { pbFadeInAndShow, pbFadeOutAndHide, type SpriteHash } from "./fades";
import { _INTL, pbDisposeSpriteHash } from "./messageConfig";
import {
  ChooseNumberParams, pbConfirmMessage, pbCreateMessageWindow, pbDisposeMessageWindow, pbMessage, pbMessageChooseNumber,
  pbMessageDisplay, pbShowCommands,
} from "./messages";
import { pbMessageFreeText } from "./party/mail";
import { addBackgroundPlane } from "./planes";
import { preloadBitmap } from "./rpgCache";
import { ItemIconSprite, preloadItemIcons } from "./sprites/itemIcon";
import { PictureOrigin, PokemonSprite, preloadPokemonSprite } from "./sprites/pokemonSprite";

//===============================================================================
// This url is the location of an example Mystery Gift file.
// You should change it to your file's url once you upload it.
//===============================================================================
export const MysteryGift = {
  URL: "https://pastebin.com/raw/w6BqqUsm",
  /** "MysteryGiftMaster.txt" (see the top of this file). */
  MASTER_FILE: "web/data/MysteryGiftMaster.txt",
  /** "MysteryGift.txt" */
  EXPORT_FILE: "web/data/MysteryGift.txt",
};

/** [id, type (0 = Pokémon, 1+ = the item's quantity), Pokémon or item ID, name]; [id] once collected. */
export type Gift = [number, number, Pokemon | Id, string];

/** safeExists?(f) + IO.read(f): the file's text, or null. */
async function readFile(path: string): Promise<string | null> {
  try {
    return await DevFiles.read(path);
  } catch {
    return null;
  }
}

//===============================================================================
// Creating a new Mystery Gift for the Master file, and editing an existing one.
//===============================================================================
// type: 0=Pokémon; 1 or higher=item (is the item's quantity).
// item: The thing being turned into a Mystery Gift (Pokémon object or item ID).
export async function pbEditMysteryGift(type: number, item: Pokemon | Id, id = 0, giftname = ""): Promise<Gift | null> {
  try {
    if (type === 0) { // Pokémon
      const pkmn = item as Pokemon;
      const commands = [_INTL("Mystery Gift"), _INTL("Faraway place")];
      if (pkmn.obtainText && pkmn.obtainText !== "") commands.push(pkmn.obtainText);
      commands.push(_INTL("[Custom]"));
      for (;;) {
        const command = await pbMessage(_INTL("Choose a phrase to be where the gift Pokémon was obtained from."), commands, -1);
        if (command < 0) {
          if (await pbConfirmMessage(_INTL("Stop editing this gift?"))) return null;
        } else if (command < commands.length - 1) {
          pkmn.obtainText = commands[command]!;
          break;
        } else if (command === commands.length - 1) {
          const obtainname = await pbMessageFreeText(_INTL("Enter a phrase."), "", false, 30);
          if (obtainname !== "") {
            pkmn.obtainText = obtainname;
            break;
          }
          if (await pbConfirmMessage(_INTL("Stop editing this gift?"))) return null;
        }
      }
    } else if (type > 0) { // Item
      const params = new ChooseNumberParams();
      params.setRange(1, 99_999);
      params.setDefaultValue(type);
      params.setCancelValue(0);
      for (;;) {
        const newtype = await pbMessageChooseNumber(_INTL("Choose a quantity of {1}.", GameData.Item.get(item as Id).name), params);
        if (newtype === 0) {
          if (await pbConfirmMessage(_INTL("Stop editing this gift?"))) return null;
        } else {
          type = newtype;
          break;
        }
      }
    }
    if (id === 0) {
      let master: Gift[] = [];
      const idlist: number[] = [];
      const text = await readFile(MysteryGift.MASTER_FILE);
      if (text !== null) master = await pbMysteryGiftDecrypt(text);
      for (const i of master) idlist.push(i[0]);
      const params = new ChooseNumberParams();
      params.setRange(0, 99_999);
      params.setDefaultValue(id);
      params.setCancelValue(0);
      for (;;) {
        const newid = await pbMessageChooseNumber(_INTL("Choose a unique ID for this gift."), params);
        if (newid === 0) {
          if (await pbConfirmMessage(_INTL("Stop editing this gift?"))) return null;
        } else if (idlist.includes(newid)) {
          await pbMessage(_INTL("That ID is already used by a Mystery Gift."));
        } else {
          id = newid;
          break;
        }
      }
    }
    for (;;) {
      const newgiftname = await pbMessageFreeText(_INTL("Enter a name for the gift."), giftname, false, 250);
      if (newgiftname !== "") {
        giftname = newgiftname;
        break;
      }
      if (await pbConfirmMessage(_INTL("Stop editing this gift?"))) return null;
    }
    return [id, type, item, giftname];
  } catch (e) {
    console.warn(e);
    await pbMessage(_INTL("Couldn't edit the gift."));
    return null;
  }
}

export async function pbCreateMysteryGift(type: number, item: Pokemon | Id): Promise<void> {
  const gift = await pbEditMysteryGift(type, item);
  if (gift) {
    try {
      let master: Gift[];
      const text = await readFile(MysteryGift.MASTER_FILE);
      if (text !== null) {
        master = await pbMysteryGiftDecrypt(text);
        master.push(gift);
      } else {
        master = [gift];
      }
      const string = await pbMysteryGiftEncrypt(master);
      await DevFiles.write(MysteryGift.MASTER_FILE, string);
      await pbMessage(_INTL("The gift was saved to MysteryGiftMaster.txt."));
    } catch (e) {
      console.warn(e);
      await pbMessage(_INTL("Couldn't save the gift to MysteryGiftMaster.txt."));
    }
  } else {
    await pbMessage(_INTL("Didn't create a gift."));
  }
}

//===============================================================================
// Debug option for managing gifts in the Master file and exporting them to a
// file to be uploaded.
//===============================================================================
export async function pbManageMysteryGifts(): Promise<void> {
  const text = await readFile(MysteryGift.MASTER_FILE);
  if (text === null) {
    await pbMessage(_INTL("There are no Mystery Gifts defined."));
    return;
  }
  // Load all gifts from the Master file.
  const master = await pbMysteryGiftDecrypt(text);
  if (!master || !Array.isArray(master) || master.length === 0) {
    await pbMessage(_INTL("There are no Mystery Gifts defined."));
    return;
  }
  // Download all gifts from online
  const msgwindow = pbCreateMessageWindow();
  await pbMessageDisplay(msgwindow, _INTL("Searching for online gifts...\\wtnp[0]"));
  const onlineText = await pbDownloadToString(MysteryGift.URL);
  pbDisposeMessageWindow(msgwindow);
  let online: number[];
  if (!onlineText) {
    await pbMessage(_INTL("No online Mystery Gifts found.\\wtnp[20]"));
    online = [];
  } else {
    await pbMessage(_INTL("Online Mystery Gifts found.\\wtnp[20]"));
    online = (await pbMysteryGiftDecrypt(onlineText)).map((gift) => gift[0]);
  }
  // Show list of all gifts.
  let command = 0;
  for (;;) {
    let commands = pbRefreshMGCommands(master, online);
    command = await pbMessage(_INTL("\\ts[]Manage Mystery Gifts (X=online)."), commands, -1, null, command);
    // Gift chosen
    if (command === -1 || command === commands.length - 1) { // Cancel
      break;
    } else if (command === commands.length - 2) { // Export selected to file
      try {
        const newfile = master.filter((gift) => online.includes(gift[0]));
        const string = await pbMysteryGiftEncrypt(newfile);
        await DevFiles.write(MysteryGift.EXPORT_FILE, string);
        await pbMessage(_INTL("The gifts were saved to MysteryGift.txt."));
        await pbMessage(_INTL("Upload MysteryGift.txt to the Internet."));
      } catch (e) {
        console.warn(e);
        await pbMessage(_INTL("Couldn't save the gifts to MysteryGift.txt."));
      }
    } else if (command >= 0 && command < commands.length - 2) { // A gift
      let cmd = 0;
      for (;;) {
        commands = pbRefreshMGCommands(master, online);
        const gift = master[command]!;
        const cmds = [_INTL("Toggle on/offline"), _INTL("Edit"), _INTL("Receive"), _INTL("Delete"), _INTL("Cancel")];
        cmd = await pbMessage("\\ts[]" + commands[command], cmds, -1, null, cmd);
        if (cmd === -1 || cmd === cmds.length - 1) break;
        if (cmd === 0) { // Toggle on/offline
          if (online.includes(gift[0])) online.splice(online.indexOf(gift[0]), 1);
          else online.push(gift[0]);
        } else if (cmd === 1) { // Edit
          const newgift = await pbEditMysteryGift(gift[1], gift[2], gift[0], gift[3]);
          if (newgift) master[command] = newgift;
        } else if (cmd === 2) { // Receive
          if (!G.player) {
            await pbMessage(_INTL("There is no save file loaded. Cannot receive any gifts."));
            continue;
          }
          const gifts = (G.player as unknown as { mysteryGifts: unknown[][] }).mysteryGifts;
          let replaced = false;
          for (let i = 0; i < gifts.length; i++) {
            if (gifts[i]![0] === gift[0]) {
              gifts[i] = gift;
              replaced = true;
            }
          }
          if (!replaced) gifts.push(gift);
          await pbReceiveMysteryGift(gift[0]);
        } else if (cmd === 3) { // Delete
          // NOTE (Ruby parity): the Master file isn't saved again, so deletions
          // and edits made here only last until the screen is closed
          // (016_UI/023_UI_MysteryGift.rb:196, 212: Ruby never writes it back).
          if (await pbConfirmMessage(_INTL("Are you sure you want to delete this gift?"))) master.splice(command, 1);
          break;
        }
      }
    }
  }
}

export function pbRefreshMGCommands(master: Gift[], online: number[]): string[] {
  const commands: string[] = [];
  for (const gift of master) {
    let itemname = "BLANK";
    if (gift[1] === 0) {
      itemname = (gift[2] as Pokemon).speciesName();
    } else if (gift[1] > 0) {
      itemname = GameData.Item.get(gift[2] as Id).name + ` x${gift[1]}`;
    }
    const ontext = ["[  ]", "[X]"][online.includes(gift[0]) ? 1 : 0];
    commands.push(_INTL("{1} {2}: {3} ({4})", ontext, gift[0], gift[3], itemname));
  }
  commands.push(_INTL("Export selected to file"));
  commands.push(_INTL("Cancel"));
  return commands;
}

//===============================================================================
// Downloads all available Mystery Gifts that haven't been downloaded yet.
//===============================================================================
// Called from the Continue/New Game screen.
export async function pbDownloadMysteryGift(trainer: { mysteryGifts: unknown[][] }): Promise<void> {
  const sprites: SpriteHash = {};
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  await preloadBitmap("Graphics/Pictures/mysteryGiftbg");
  addBackgroundPlane(sprites as never, "background", "mysteryGiftbg", viewport);
  await pbFadeInAndShow(sprites);
  const msgwindow = pbCreateMessageWindow();
  sprites.msgwindow = msgwindow as never;
  await pbMessageDisplay(msgwindow, _INTL("Searching for a gift.\nPlease wait...\\wtnp[0]"));
  const string = await pbDownloadToString(MysteryGift.URL);
  if (!string) {
    await pbMessageDisplay(msgwindow, _INTL("No new gifts are available."));
  } else {
    const online = await pbMysteryGiftDecrypt(string);
    const pending: Gift[] = [];
    for (const gift of online) {
      let notgot = true;
      for (const j of trainer.mysteryGifts) if (j[0] === gift[0]) notgot = false;
      if (notgot) pending.push(gift);
    }
    if (pending.length === 0) {
      await pbMessageDisplay(msgwindow, _INTL("No new gifts are available."));
    } else {
      for (;;) {
        const commands = pending.map((gift) => gift[3]);
        commands.push(_INTL("Cancel"));
        await pbMessageDisplay(msgwindow, _INTL("Choose the gift you want to receive.\\wtnp[0]"));
        const command = await pbShowCommands(msgwindow, commands, -1);
        if (command === -1 || command === commands.length - 1) break;
        const gift = pending[command]!;
        msgwindow.visible = false;
        let sprite: PokemonSprite | ItemIconSprite;
        if (gift[1] === 0) {
          await preloadPokemonSprite(gift[2] as Pokemon);
          const s = new PokemonSprite(viewport);
          s.setOffset(PictureOrigin.CENTER);
          s.setPokemonBitmap(gift[2] as Pokemon);
          s.x = Math.floor(Graphics.width / 2);
          s.y = -Math.floor((s.bitmap?.height ?? 0) / 2);
          sprite = s;
        } else {
          await preloadItemIcons([gift[2] as Id]);
          const s = new ItemIconSprite(0, 0, gift[2] as Id, viewport);
          s.x = Math.floor(Graphics.width / 2);
          s.y = -Math.floor(s.height / 2);
          sprite = s;
        }
        // 8 pixels per frame at 20 fps (distanceDiff = 8 * 20 / Graphics.frame_rate)
        const distanceDiff = 8 * 20 * Graphics.deltaS;
        let y = sprite.y;
        for (;;) {
          await Graphics.update();
          Input.update();
          sprite.update();
          y += distanceDiff;
          sprite.y = Math.floor(y);
          if (sprite.y >= Graphics.height / 2) break;
        }
        pbMEPlay("Battle capture success");
        await Graphics.wait(3, () => sprite.update()); // (Graphics.frame_rate * 3) frames
        msgwindow.visible = true;
        await pbMessageDisplay(msgwindow, _INTL("The gift has been received!"), true, null, () => sprite.update());
        await pbMessageDisplay(msgwindow, _INTL("Please pick up your gift from the deliveryman in any Poké Mart."), true, null, () => sprite.update());
        trainer.mysteryGifts.push(gift);
        pending.splice(command, 1);
        const opacityDiff = 16 * 20 * Graphics.deltaS;
        let opacity = sprite.opacity;
        for (;;) {
          await Graphics.update();
          Input.update();
          sprite.update();
          opacity -= opacityDiff;
          sprite.opacity = opacity;
          if (sprite.opacity <= 0) break;
        }
        sprite.dispose();
        if (pending.length === 0) {
          await pbMessageDisplay(msgwindow, _INTL("No new gifts are available."));
          break;
        }
      }
    }
  }
  delete sprites.msgwindow;
  await pbFadeOutAndHide(sprites);
  pbDisposeMessageWindow(msgwindow);
  pbDisposeSpriteHash(sprites as never);
  viewport.dispose();
}

//===============================================================================
// Converts an array of gifts into a string and back.
//===============================================================================
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

/** [Zlib::Deflate.deflate(Marshal.dump(gift))].pack("m"): 60 characters per line, each ending in "\n". */
export async function pbMysteryGiftEncrypt(gift: Gift[]): Promise<string> {
  const json = JSON.stringify(gift.map((g) => (g[1] === 0 ? [g[0], g[1], (g[2] as Pokemon).toJSON(), g[3]] : g)));
  const b64 = toBase64(await pipe(new TextEncoder().encode(json), new CompressionStream("deflate")));
  let ret = "";
  for (let i = 0; i < b64.length; i += 60) ret += b64.slice(i, i + 60) + "\n";
  return ret;
}

export async function pbMysteryGiftDecrypt(gift: string | null): Promise<Gift[]> {
  if (!gift) return [];
  let ret: Gift[];
  try {
    const inflated = await pipe(fromBase64(gift), new DecompressionStream("deflate"));
    ret = JSON.parse(new TextDecoder().decode(inflated)) as Gift[];
  } catch {
    return []; // (not this port's format: Ruby's Marshal.restore raises)
  }
  if (ret) {
    for (const g of ret) {
      if (g[1] === 0) { // Pokémon
        g[2] = Pokemon.fromJSON(g[2] as unknown as PokemonJSON);
      } else { // Item
        g[2] = GameData.Item.get(g[2] as Id).id;
      }
    }
  }
  return ret;
}

EditorScreens.pbCreateMysteryGift = (type: number, item: unknown) => pbCreateMysteryGift(type, item as Pokemon | Id);
EditorScreens.pbManageMysteryGifts = pbManageMysteryGifts;
