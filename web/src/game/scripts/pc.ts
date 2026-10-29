// The PC menus (016_UI/019_UI_PC.rb, the :pokemon_storage handler as the
// v20.1 Hotfixes fix it, and Following Pokémon EX's refresh after
// pbPokeCenterPC). The screens they open are in ui/storage (Pokémon storage,
// WithdrawItemScene / TossItemScene), ui/bag (PokemonBagScreen's item storage
// screens) and ui/party (Mail display, giving Mail).

import { Metadata } from "../../data/gameData/metadata";
import { PokemonBag_Scene, PokemonBagScreen } from "../../ui/bag/bag";
import { pbFadeOutIn } from "../../ui/fades";
import { FieldActions } from "../../ui/menus/menuScreens";
import { MenuHandlers } from "../../ui/menus/menuHandlers";
import { _INTL } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage, pbShowCommands, pbShowCommandsWithHelp } from "../../ui/messages";
import { pbPlayCloseMenuSE } from "../../ui/options/options";
import { pbDisplayMail } from "../../ui/party/mail";
import { PokemonParty_Scene, PokemonPartyScreen } from "../../ui/party/party";
import { TossItemScene, WithdrawItemScene } from "../../ui/storage/ItemStorage";
import { pbOpenPokemonStorage } from "../../ui/storage/PokemonStorageScene";
import { pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import { PCItemStorage, type PokemonBag } from "../items/PokemonBag";
import type { Mail } from "../pokemon/Mail";
import type { Player } from "../trainer/Player";
import { defineScript } from "../scriptApi";

const player = () => G.player as unknown as Player;
const bag = () => G.bag as PokemonBag;

type Global = { pcItemStorage: PCItemStorage | null; mailbox: Mail[] | null };
const global = () => G.pokemonGlobal as unknown as Global;

/** pbPCItemStorage */
export async function pbPCItemStorage(): Promise<void> {
  let command = 0;
  for (;;) {
    command = await pbShowCommandsWithHelp(null,
      [_INTL("Withdraw Item"), _INTL("Deposit Item"), _INTL("Toss Item"), _INTL("Exit")],
      [_INTL("Take out items from the PC."), _INTL("Store items in the PC."),
        _INTL("Throw away items stored in the PC."), _INTL("Go back to the previous menu.")], -1, command);
    if (command === 0) { // Withdraw Item
      if (!global().pcItemStorage) global().pcItemStorage = new PCItemStorage();
      if (global().pcItemStorage!.empty()) {
        await pbMessage(_INTL("There are no items."));
      } else {
        await pbFadeOutIn(async () => {
          const scene = new WithdrawItemScene();
          const screen = new PokemonBagScreen(scene as never, bag());
          await screen.pbWithdrawItemScreen();
        });
      }
    } else if (command === 1) { // Deposit Item
      await pbFadeOutIn(async () => {
        const scene = new PokemonBag_Scene();
        const screen = new PokemonBagScreen(scene, bag());
        await screen.pbDepositItemScreen();
      });
    } else if (command === 2) { // Toss Item
      if (!global().pcItemStorage) global().pcItemStorage = new PCItemStorage();
      if (global().pcItemStorage!.empty()) {
        await pbMessage(_INTL("There are no items."));
      } else {
        await pbFadeOutIn(async () => {
          const scene = new TossItemScene();
          const screen = new PokemonBagScreen(scene as never, bag());
          await screen.pbTossItemScreen();
        });
      }
    } else {
      break;
    }
  }
}

/** pbPCMailbox */
export async function pbPCMailbox(): Promise<void> {
  if (!global().mailbox || global().mailbox!.length === 0) {
    await pbMessage(_INTL("There's no Mail here."));
    return;
  }
  for (;;) {
    let command = 0;
    const commands: string[] = [];
    for (const mail of global().mailbox!) commands.push(mail.sender);
    commands.push(_INTL("Cancel"));
    command = await pbShowCommands(null, commands, -1, command);
    if (command >= 0 && command < global().mailbox!.length) {
      const mailIndex = command;
      const commandMail = await pbMessage(
        _INTL("What do you want to do with {1}'s Mail?", global().mailbox![mailIndex]!.sender),
        [_INTL("Read"), _INTL("Move to Bag"), _INTL("Give"), _INTL("Cancel")], -1);
      if (commandMail === 0) { // Read
        await pbFadeOutIn(() => pbDisplayMail(global().mailbox![mailIndex]!));
      } else if (commandMail === 1) { // Move to Bag
        if (await pbConfirmMessage(_INTL("The message will be lost. Is that OK?"))) {
          if (bag().add(global().mailbox![mailIndex]!.item)) {
            await pbMessage(_INTL("The Mail was returned to the Bag with its message erased."));
            global().mailbox!.splice(mailIndex, 1);
          } else {
            await pbMessage(_INTL("The Bag is full."));
          }
        }
      } else if (commandMail === 2) { // Give
        await pbFadeOutIn(async () => {
          const sscene = new PokemonParty_Scene();
          const sscreen = new PokemonPartyScreen(sscene, player().party);
          await sscreen.pbPokemonGiveMailScreen(mailIndex);
        });
      }
    } else {
      break;
    }
  }
}

/** pbTrainerPC */
export async function pbTrainerPC(): Promise<void> {
  await pbMessage(_INTL("\\se[PC open]{1} booted up the PC.", player().name));
  await pbTrainerPCMenu();
  pbSEPlay("PC close");
}

/** pbTrainerPCMenu */
export async function pbTrainerPCMenu(): Promise<void> {
  let command = 0;
  for (;;) {
    command = await pbMessage(_INTL("What do you want to do?"), [_INTL("Item Storage"), _INTL("Mailbox"), _INTL("Turn Off")], -1, null, command);
    if (command === 0) await pbPCItemStorage();
    else if (command === 1) await pbPCMailbox();
    else break;
  }
}

/** pbPokeCenterPC (+ Following Pokémon EX's FollowingPkmn.refresh(false) afterwards) */
export async function pbPokeCenterPC(): Promise<void> {
  await pbMessage(_INTL("\\se[PC open]{1} booted up the PC.", player().name));
  // Get all commands
  const commandList: string[] = [];
  const commands: { effect: (menu?: unknown) => Promise<boolean> }[] = [];
  for (const [, hash, name] of MenuHandlers.eachAvailable("pc_menu")) {
    commandList.push(name);
    commands.push(hash as unknown as { effect: () => Promise<boolean> });
  }
  // Main loop
  let command = 0;
  for (;;) {
    const choice = await pbMessage(_INTL("Which PC should be accessed?"), commandList, -1, null, command);
    if (choice < 0) {
      pbPlayCloseMenuSE();
      break;
    }
    command = choice;
    if (await commands[choice]!.effect()) break;
  }
  pbSEPlay("PC close");
  FieldActions.followingPkmn?.refresh(false);
}

/** pbGetStorageCreator */
export function pbGetStorageCreator(): string {
  return Metadata.get().storageCreator;
}

MenuHandlers.add("pc_menu", "pokemon_storage", {
  name: () => (player().seenStorageCreator ? _INTL("{1}'s PC", pbGetStorageCreator()) : _INTL("Someone's PC")),
  order: 10,
  effect: async () => {
    await pbMessage(_INTL("\\se[PC access]The Pokémon Storage System was opened."));
    let command = 0;
    for (;;) {
      command = await pbShowCommandsWithHelp(null,
        [_INTL("Organize Boxes"), _INTL("Withdraw Pokémon"), _INTL("Deposit Pokémon"), _INTL("See ya!")],
        [_INTL("Organize the Pokémon in Boxes and in your party."), _INTL("Move Pokémon stored in Boxes to your party."),
          _INTL("Store Pokémon in your party in Boxes."), _INTL("Return to the previous menu.")], -1, command);
      if (command < 0) break;
      if (command === 0) { // Organize
        await pbOpenPokemonStorage(0);
      } else if (command === 1) { // Withdraw
        if (G.storage.partyFull()) {
          await pbMessage(_INTL("Your party is full!"));
          continue;
        }
        await pbOpenPokemonStorage(1);
      } else if (command === 2) { // Deposit
        let count = 0;
        for (const p of G.storage.party) if (p && !p.egg() && p.hp > 0) count += 1;
        if (count <= 1) {
          await pbMessage(_INTL("Can't deposit the last Pokémon!"));
          continue;
        }
        await pbOpenPokemonStorage(2);
      } else {
        break;
      }
    }
    return false;
  },
});

MenuHandlers.add("pc_menu", "player_pc", {
  name: () => _INTL("{1}'s PC", player().name),
  order: 20,
  effect: async () => {
    await pbMessage(_INTL("\\se[PC access]Accessed {1}'s PC.", player().name));
    await pbTrainerPCMenu();
    return false;
  },
});

MenuHandlers.add("pc_menu", "close", {
  name: "Log off",
  order: 100,
  effect: async () => true,
});

defineScript("pbPokeCenterPC", () => pbPokeCenterPC());
defineScript("pbTrainerPC", () => pbTrainerPC());
