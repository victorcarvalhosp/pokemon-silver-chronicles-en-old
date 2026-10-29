// Port of 020_Debug/003_Debug menus/001_Debug_Menus.rb: CommandMenuList (the
// nested option lists the debug menus build from MenuHandlers), pbDebugMenu
// (the overworld Debug menu: pause menu "Debug" or F9), PokemonDebugMixin
// (the party/storage "Debug" option on a Pokémon) and Battle::DebugMixin (the
// battle Debug menu, F9 in the command menu), with Following Pokemon EX's
// pbDebugMenu alias (Script Additions/Refresh.rb:110: refresh the follower).
// The options themselves are registered by the other files of this folder
// and by plugin ports (battle/zud/Debug.ts...); debug/index.ts loads them in
// Essentials' order.

import type { Battle } from "../battle/battle/Battle";
import type { Battler } from "../battle/battler/Battler";
import { PBEffects } from "../battle/other/PBEffects";
import { GameData } from "../data/gameData";
import { pbPlayCancelSE, pbPlayDecisionSE } from "../game/GameSystem";
import { FollowingPkmn } from "../game/following/FollowingPkmn";
import type { Pokemon } from "../game/pokemon/Pokemon";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { type SpriteHash, pbFadeInAndShow, pbFadeOutAndHide } from "../ui/fades";
import { MenuHandlers, type MenuHandlerHash } from "../ui/menus/menuHandlers";
import { _INTL, pbDisposeSpriteHash } from "../ui/messageConfig";
import { pbCreateMessageWindow, pbDisposeMessageWindow, pbShowCommands } from "../ui/messages";
import { pbPlayCloseMenuSE } from "../ui/options/options";
import { Window_AdvancedTextPokemon, Window_CommandPokemonEx } from "../ui/windows/SpriteWindowText";

//===============================================================================
//
//===============================================================================
export class CommandMenuList {
  /** [option, parent, name, description] */
  private commands: [string, string | undefined, string, string | undefined][] = [];
  currentList = "main";

  add(option: string, hash: MenuHandlerHash, name: string | null = null, description: string | null = null): void {
    this.commands.push([option, hash.parent as string | undefined, name ?? String(hash.name),
      description ?? (hash.description as string | undefined)]);
  }

  list(): string[] {
    const ret: string[] = [];
    for (const cmd of this.commands) if (cmd[1] === this.currentList) ret.push(cmd[2]);
    return ret;
  }

  getCommand(index: number): string | null {
    let count = 0;
    for (const cmd of this.commands) {
      if (cmd[1] !== this.currentList) continue;
      if (count === index) return cmd[0];
      count += 1;
    }
    return null;
  }

  getDesc(index: number): string {
    let count = 0;
    for (const cmd of this.commands) {
      if (cmd[1] !== this.currentList) continue;
      if (count === index && cmd[3]) return cmd[3];
      if (count === index) break;
      count += 1;
    }
    return "<No description available>";
  }

  hasSubMenu(checkCmd: string | null): boolean {
    for (const cmd of this.commands) if (cmd[1] === checkCmd) return true;
    return false;
  }

  getParent(): [string, number] | null {
    let ret: string | undefined;
    for (const cmd of this.commands) {
      if (cmd[0] !== this.currentList) continue;
      ret = cmd[1];
      break;
    }
    if (!ret) return null;
    let count = 0;
    for (const cmd of this.commands) {
      if (cmd[1] !== ret) continue;
      if (cmd[0] === this.currentList) return [ret, count];
      count += 1;
    }
    return [ret, 0];
  }
}

/** A handler's description: a proc is called, a string goes through _INTL. */
function handlerDescription(hash: MenuHandlerHash): string | null {
  const desc = hash.description;
  if (typeof desc === "function") return String((desc as () => unknown)());
  if (desc !== undefined && desc !== null) return _INTL(String(desc));
  return null;
}

/** The sprites the Debug menu's windows live in (the Warp option disposes them itself). */
export interface DebugMenuSprites extends SpriteHash {
  textbox: Window_AdvancedTextPokemon;
  cmdwindow: Window_CommandPokemonEx;
}

/** The loop shared by pbDebugMenu and pbBattleDebug. */
async function runCommandMenu(
  commands: CommandMenuList, sprites: DebugMenuSprites,
  choose: (cmd: string) => Promise<boolean>,
): Promise<boolean> {
  const cmdwindow = sprites.cmdwindow;
  let ret = -1;
  let refresh = true;
  for (;;) {
    for (;;) {
      const oldindex = cmdwindow.index;
      cmdwindow.update();
      if (refresh || cmdwindow.index !== oldindex) {
        sprites.textbox.text = commands.getDesc(cmdwindow.index);
        refresh = false;
      }
      await Graphics.update();
      Input.update();
      if (Input.trigger(Input.BACK)) {
        const parent = commands.getParent();
        if (parent) {
          pbPlayCancelSE();
          commands.currentList = parent[0];
          cmdwindow.commands = commands.list();
          cmdwindow.index = parent[1];
          refresh = true;
        } else {
          ret = -1;
          break;
        }
      } else if (Input.trigger(Input.USE)) {
        ret = cmdwindow.index;
        break;
      }
    }
    if (ret < 0) break;
    const cmd = commands.getCommand(ret);
    if (commands.hasSubMenu(cmd)) {
      pbPlayDecisionSE();
      commands.currentList = cmd!;
      cmdwindow.commands = commands.list();
      cmdwindow.index = 0;
      refresh = true;
    } else if (cmd !== null && (await choose(cmd))) {
      return true;
    }
  }
  return false;
}

//===============================================================================
//
//===============================================================================
/** pbDebugMenu(show_all = true) */
export async function pbDebugMenu(showAll = true): Promise<void> {
  await pbDebugMenuEssentials(showAll);
  // Following Pokemon EX: refresh the follower upon closing the Debug menu.
  await FollowingPkmn.refresh(false);
}

async function pbDebugMenuEssentials(showAll: boolean): Promise<void> {
  // Get all commands
  const commands = new CommandMenuList();
  for (const [option, hash, name] of MenuHandlers.eachAvailable("debug_menu")) {
    if (!showAll && hash.always_show !== undefined && hash.always_show !== null && !hash.always_show) continue;
    commands.add(option, hash, name, handlerDescription(hash));
  }
  // Setup windows
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const textbox = pbCreateMessageWindow();
  textbox.letterbyletter = false;
  const cmdwindow = new Window_CommandPokemonEx(commands.list());
  const sprites: DebugMenuSprites = { textbox, cmdwindow };
  cmdwindow.x = 0;
  cmdwindow.y = 0;
  cmdwindow.width = Graphics.width;
  cmdwindow.height = Graphics.height - textbox.height;
  cmdwindow.viewport = viewport;
  cmdwindow.visible = true;
  textbox.text = commands.getDesc(cmdwindow.index);
  await pbFadeInAndShow(sprites);
  // Main loop
  const warped = await runCommandMenu(commands, sprites, async (cmd) => {
    if (cmd === "warp") {
      // The Warp option disposes the windows itself before warping.
      return Boolean(await MenuHandlers.call("debug_menu", cmd, "effect", sprites, viewport));
    }
    await MenuHandlers.call("debug_menu", cmd, "effect");
    return false;
  });
  if (warped) return;
  pbPlayCloseMenuSE();
  await pbFadeOutAndHide(sprites);
  pbDisposeMessageWindow(sprites.textbox);
  pbDisposeSpriteHash({ cmdwindow: sprites.cmdwindow });
  viewport.dispose();
}

//===============================================================================
//
//===============================================================================
/**
 * What a :pokemon_debug_menu handler gets as `screen`: the party screen, the
 * storage screen or PokemonDebugPartyScreen (the "Test Wild Battle Advanced"
 * Pokémon editor), all of which include PokemonDebugMixin in Ruby.
 */
export interface PokemonDebugScreen {
  pbShowCommands(helptext: string, commands: string[], index?: number): Promise<number>;
  pbDisplay(text: string): Promise<void>;
  pbConfirm(text: string): Promise<boolean>;
  pbChooseMove(pkmn: Pokemon, helptext: string, index?: number): Promise<number>;
  /** The party index, or for the storage screen its [box, index] selection. */
  pbRefreshSingle(index: unknown): void;
  pbHardRefresh?(): void;
  pbUpdate(): void;
}

/** The arguments every :pokemon_debug_menu "effect" receives. */
export type PokemonDebugEffect = (
  pkmn: Pokemon, pkmnid: unknown, heldpoke: Pokemon | null, settingUpBattle: boolean, screen: PokemonDebugScreen,
) => Promise<boolean | void> | boolean | void;

/** PokemonDebugMixin#pbPokemonDebug(pkmn, pkmnid, heldpoke = nil, settingUpBattle = false) */
export async function pbPokemonDebug(
  screen: PokemonDebugScreen, pkmn: Pokemon, pkmnid: unknown, heldpoke: Pokemon | null = null, settingUpBattle = false,
): Promise<void> {
  // Get all commands
  const commands = new CommandMenuList();
  for (const [option, hash, name] of MenuHandlers.eachAvailable("pokemon_debug_menu")) {
    if (settingUpBattle && hash.always_show !== undefined && hash.always_show !== null && !hash.always_show) continue;
    commands.add(option, hash, name);
  }
  // Main loop
  let command = 0;
  for (;;) {
    command = await screen.pbShowCommands(_INTL("Do what with {1}?", pkmn.name), commands.list(), command);
    if (command < 0) {
      const parent = commands.getParent();
      if (!parent) break;
      commands.currentList = parent[0];
      command = parent[1];
    } else {
      const cmd = commands.getCommand(command);
      if (commands.hasSubMenu(cmd)) {
        commands.currentList = cmd!;
        command = 0;
      } else if (await MenuHandlers.call("pokemon_debug_menu", cmd!, "effect", pkmn, pkmnid, heldpoke, settingUpBattle, screen)) {
        break;
      }
    }
  }
}

//===============================================================================
//
//===============================================================================
/** Battle::DebugMixin#pbBattleDebug(battle, show_all = true) */
export async function pbBattleDebug(battle: Battle, showAll = true): Promise<void> {
  // Get all commands
  const commands = new CommandMenuList();
  for (const [option, hash, name] of MenuHandlers.eachAvailable("battle_debug_menu")) {
    if (!showAll && hash.always_show !== undefined && hash.always_show !== null && !hash.always_show) continue;
    commands.add(option, hash, name, handlerDescription(hash));
  }
  // Setup windows
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const textbox = pbCreateMessageWindow();
  textbox.letterbyletter = false;
  const cmdwindow = new Window_CommandPokemonEx(commands.list());
  const sprites: DebugMenuSprites = { textbox, cmdwindow };
  cmdwindow.x = 0;
  cmdwindow.y = 0;
  cmdwindow.width = Graphics.width / 2;
  cmdwindow.height = Graphics.height - textbox.height;
  cmdwindow.viewport = viewport;
  cmdwindow.visible = true;
  textbox.text = commands.getDesc(cmdwindow.index);
  // Main loop
  await runCommandMenu(commands, sprites, async (cmd) => {
    await MenuHandlers.call("battle_debug_menu", cmd, "effect", battle);
    return false;
  });
  pbPlayCloseMenuSE();
  pbDisposeMessageWindow(sprites.textbox);
  pbDisposeSpriteHash({ cmdwindow: sprites.cmdwindow });
  viewport.dispose();
}

/** "♂" / "♀" / "genderless" */
function genderText(pkmn: Pokemon | null): string {
  if (pkmn?.male()) return "♂";
  if (pkmn?.female()) return "♀";
  return _INTL("genderless");
}

/** Battle::DebugMixin#pbBattleDebugBattlerInfo(battler) */
export function pbBattleDebugBattlerInfo(battler: Battler | null): string {
  let ret = "";
  if (!battler) return ret;
  // Battler index, name
  ret += `[${battler.index}] ${battler.pbThis()}`;
  ret += "\r\n";
  // Species
  ret += _INTL("Species: {1}", GameData.Species.get(battler.species).name);
  ret += "\r\n";
  // Form number
  ret += _INTL("Form: {1}", battler.form);
  ret += "\r\n";
  // Level, gender, shininess
  ret += _INTL("Level {1}, {2}", battler.level, genderText(battler.pokemon));
  if (battler.pokemon?.shiny) ret += ", " + _INTL("shiny");
  ret += "\r\n";
  // HP
  ret += _INTL("HP: {1}/{2} ({3}%)", battler.hp, battler.totalhp, Math.trunc((100.0 * battler.hp) / battler.totalhp));
  ret += "\r\n";
  // Status
  ret += _INTL("Status: {1}", GameData.Status.get(battler.status).name);
  switch (battler.status) {
    case "SLEEP":
      ret += " " + _INTL("({1} rounds left)", battler.statusCount);
      break;
    case "POISON":
      if (battler.statusCount > 0) ret += " " + _INTL("(toxic, {1}/16)", battler.effects[PBEffects.Toxic]);
      break;
  }
  ret += "\r\n";
  // Stat stages
  const stages: string[] = [];
  for (const stat of GameData.Stat.eachBattle()) {
    const stage = battler.stages[stat.id] ?? 0;
    if (stage === 0) continue;
    let stageText = "";
    if (stage > 0) stageText += "+";
    stageText += String(stage);
    stageText += " " + stat.nameBrief;
    stages.push(stageText);
  }
  ret += _INTL("Stat stages: {1}", stages.length === 0 ? "-" : stages.join(", "));
  ret += "\r\n";
  // Ability
  ret += _INTL("Ability: {1}", battler.ability ? battler.abilityName() : "-");
  ret += "\r\n";
  // Held item
  ret += _INTL("Item: {1}", battler.item ? battler.itemName() : "-");
  return ret;
}

/** Battle::DebugMixin#pbBattleDebugPokemonInfo(pkmn) */
export function pbBattleDebugPokemonInfo(pkmn: Pokemon | null): string {
  let ret = "";
  if (!pkmn) return ret;
  const spData = pkmn.speciesData();
  // Name, species
  ret += `${pkmn.name} (${spData.name})`;
  ret += "\r\n";
  // Form number
  ret += _INTL("Form: {1}", spData.form);
  ret += "\r\n";
  // Level, gender, shininess
  ret += _INTL("Level {1}, {2}", pkmn.level, genderText(pkmn));
  if (pkmn.shiny) ret += ", " + _INTL("shiny");
  ret += "\r\n";
  // HP
  ret += _INTL("HP: {1}/{2} ({3}%)", pkmn.hp, pkmn.totalhp, Math.trunc((100.0 * pkmn.hp) / pkmn.totalhp));
  ret += "\r\n";
  // Status
  ret += _INTL("Status: {1}", GameData.Status.get(pkmn.status).name);
  switch (pkmn.status) {
    case "SLEEP":
      ret += " " + _INTL("({1} rounds left)", pkmn.statusCount);
      break;
    case "POISON":
      if (pkmn.statusCount > 0) ret += " " + _INTL("(toxic)");
      break;
  }
  ret += "\r\n";
  // Ability
  ret += _INTL("Ability: {1}", pkmn.ability?.name || "-");
  ret += "\r\n";
  // Held item
  ret += _INTL("Item: {1}", pkmn.item?.name || "-");
  return ret;
}

/** Battle::DebugMixin#pbBattlePokemonDebug(pkmn, battler = nil) (`battle` is Ruby's self). */
export async function pbBattlePokemonDebug(battle: Battle, pkmn: Pokemon, battler: Battler | null = null): Promise<void> {
  // Get all commands
  const commands = new CommandMenuList();
  for (const [option, hash, name] of MenuHandlers.eachAvailable("battle_pokemon_debug_menu")) {
    if (battler && hash.usage === "pokemon") continue;
    if (!battler && hash.usage === "battler") continue;
    commands.add(option, hash, name);
  }
  // Setup windows
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const infowindow = new Window_AdvancedTextPokemon("");
  infowindow.x = 0;
  infowindow.y = 0;
  infowindow.width = Graphics.width / 2;
  infowindow.height = Graphics.height;
  infowindow.viewport = viewport;
  infowindow.visible = true;
  const dummywindow = new Window_AdvancedTextPokemon("");
  dummywindow.y = Graphics.height;
  dummywindow.width = Graphics.width;
  dummywindow.height = 0;
  const sprites = { infowindow, dummywindow };
  // Main loop
  let needRefresh = true;
  let cmd = 0;
  for (;;) {
    if (needRefresh) {
      infowindow.text = battler ? pbBattleDebugBattlerInfo(battler) : pbBattleDebugPokemonInfo(pkmn);
      needRefresh = false;
    }
    // Choose a command
    cmd = await pbShowCommands(dummywindow, commands.list(), -1, cmd);
    if (cmd < 0) { // Cancel
      const parent = commands.getParent();
      if (parent) { // Go up a level
        commands.currentList = parent[0];
        cmd = parent[1];
      } else { // Exit
        break;
      }
    } else {
      const realCmd = commands.getCommand(cmd);
      if (commands.hasSubMenu(realCmd)) {
        commands.currentList = realCmd!;
        cmd = 0;
      } else {
        await MenuHandlers.call("battle_pokemon_debug_menu", realCmd!, "effect", pkmn, battler, battle);
        needRefresh = true;
      }
    }
  }
  pbDisposeSpriteHash(sprites);
  viewport.dispose();
}
