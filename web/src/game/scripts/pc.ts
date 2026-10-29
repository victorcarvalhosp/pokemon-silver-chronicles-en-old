// The PC menus (016_UI/019_UI_PC.rb, the :pokemon_storage handler as the
// v20.1 Hotfixes fix it, and Following Pokémon EX's refresh after
// pbPokeCenterPC). The Pokémon Storage screen and the item storage scenes
// (WithdrawItemScene / TossItemScene) and Mail display aren't ported yet;
// those options say so and return to the menu.

import { Metadata } from "../../data/gameData/metadata";
import { FieldActions } from "../../ui/menus/menuScreens";
import { MenuHandlers } from "../../ui/menus/menuHandlers";
import { _INTL } from "../../ui/messageConfig";
import { pbMessage, pbShowCommands, pbShowCommandsWithHelp } from "../../ui/messages";
import { pbPlayCloseMenuSE } from "../../ui/options/options";
import { pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Player } from "../trainer/Player";
import { defineScript } from "../scriptApi";

const player = () => G.player as unknown as Player;

async function notPorted(what: string): Promise<void> {
  console.warn(`${what} isn't ported yet`);
  await pbMessage(`(${what} isn't ported yet.)`);
}

type Global = { pcItemStorage?: { empty(): boolean } | null; mailbox?: { sender: string }[] | null };
const global = () => G.pokemonGlobal as unknown as Global;

/** pbPCItemStorage */
export async function pbPCItemStorage(): Promise<void> {
  let command = 0;
  for (;;) {
    command = await pbShowCommandsWithHelp(null,
      [_INTL("Withdraw Item"), _INTL("Deposit Item"), _INTL("Toss Item"), _INTL("Exit")],
      [_INTL("Take out items from the PC."), _INTL("Store items in the PC."),
        _INTL("Throw away items stored in the PC."), _INTL("Go back to the previous menu.")], -1, command);
    switch (command) {
      case 0: // Withdraw Item
      case 2: // Toss Item
        if (!global().pcItemStorage || global().pcItemStorage!.empty()) await pbMessage(_INTL("There are no items."));
        else await notPorted(command === 0 ? "WithdrawItemScene" : "TossItemScene"); // TODO(pc)
        break;
      case 1: // Deposit Item
        await notPorted("The Deposit Item screen"); // TODO(pc): PokemonBagScreen#pbDepositItemScreen with the bag scene
        break;
      default:
        return;
    }
  }
}

/** pbPCMailbox */
export async function pbPCMailbox(): Promise<void> {
  const mailbox = global().mailbox;
  if (!mailbox || mailbox.length === 0) {
    await pbMessage(_INTL("There's no Mail here."));
    return;
  }
  for (;;) {
    const commands = [...mailbox.map((m) => m.sender), _INTL("Cancel")];
    const command = await pbShowCommands(null, commands, -1, 0);
    if (command < 0 || command >= mailbox.length) break;
    await notPorted("The Mailbox"); // TODO(pc): Read / Move to Bag / Give
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
      if (command === 0) {
        await notPorted("PokemonStorageScreen"); // TODO(pc): pbStartScreen(0)
      } else if (command === 1) {
        if (player().partyFull()) {
          await pbMessage(_INTL("Your party is full!"));
          continue;
        }
        await notPorted("PokemonStorageScreen"); // TODO(pc): pbStartScreen(1)
      } else if (command === 2) {
        const count = player().party.filter((p) => p && !p.egg() && p.hp > 0).length;
        if (count <= 1) {
          await pbMessage(_INTL("Can't deposit the last Pokémon!"));
          continue;
        }
        await notPorted("PokemonStorageScreen"); // TODO(pc): pbStartScreen(2)
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
