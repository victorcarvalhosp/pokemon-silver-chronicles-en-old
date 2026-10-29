// Port of 020_Debug/001_Editor_Utilities.rb: pbGetLegalMoves, pbSafeCopyFile,
// pbAllocateAnimation, pbMapTree, the pbChoose*List family (pick a species,
// type, item, ability, move, ball...), pbCommands2, pbCommands3, pbChooseList
// and pbCommandsSortable. Folded in:
// - TDW Debug List Search (Plugins/TDW Debug List Search/TDW Debug List
//   Search.rb): pbOpenGenericListSearch, and its pbChooseList and
//   pbCommandsSortable (the F key searches the list).
// - Generation 9 Pack ([000] General/[002] Debug.rb:157): pbChooseStatList.
// The editors and the animation editor reuse these.

import { GameData, type Id } from "../data/gameData";
import { Data } from "../data/store";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { _INTL } from "../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../ui/messages";
import { pbMessageFreeText } from "../ui/party/mail";
import { KeyboardInput } from "../ui/textEntry/keyboard";
import { DevFiles, DevFilesUnavailable } from "./devFiles";
import { checkDevPath, DEV_READ_ROOTS } from "./devFilesPolicy";
import { pbListWindow } from "./EditorListers";

/** What pbCommands2/pbCommands3/pbCommandsSortable drive (a Window_CommandPokemon). */
export interface CommandWindow {
  commands: string[];
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  visible: boolean;
  active: boolean;
  update(): void;
}

/** A pbChooseList entry: [ID number, name, ID (optional; returned instead of the number)]. */
export type ChooseListCommand = [number, string, (Id | number | null)?];

/** Ruby's String#<=> */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** sprintf("%03d", n) */
function pad3(n: number): string {
  return n < 0 ? `-${String(-n).padStart(2, "0")}` : String(n).padStart(3, "0");
}

export function pbGetLegalMoves(species: Id): Id[] {
  const speciesData = GameData.Species.get(species);
  let moves: Id[] = [];
  if (!speciesData) return moves;
  for (const m of speciesData.moves) moves.push(m.move);
  for (const m of speciesData.tutorMoves) moves.push(m);
  const babyspecies = speciesData.getBabySpecies();
  for (const m of GameData.Species.get(babyspecies).eggMoves) moves.push(m);
  moves = [...new Set(moves)]; // Remove duplicates
  return moves;
}

/**
 * File.open(path, "rb") { |f| f.read } through the dev server's /__dev/read,
 * as bytes (DevFiles.read decodes text); null if the file doesn't exist.
 */
async function devReadBytes(path: string): Promise<Uint8Array | null> {
  if (!checkDevPath(path, DEV_READ_ROOTS)) throw new Error(`Reading ${path} is not allowed`);
  if (!(await DevFiles.available())) throw new DevFilesUnavailable();
  const res = await fetch(`/__dev/read?path=${encodeURIComponent(path)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Copies file x to z (or y), asking first when a different y already exists.
 * Goes through the dev server (DevFiles): x must lie under a readable folder
 * (Graphics/, Audio/, Fonts/, web/data/, PBS/) and the destination under
 * web/data/ or PBS/, else this throws, as Ruby's File.open would on a failed
 * write (callers wrap it in devWriteOrExplain). A y the dev server may not
 * read counts as not existing.
 */
export async function pbSafeCopyFile(x: string, y: string, z: string | null = null): Promise<void> {
  let filedata = await devReadBytes(x);
  if (!filedata) return; // safeExists?(x)
  let safetocopy = true;
  const filedata2 = checkDevPath(y, DEV_READ_ROOTS) ? await devReadBytes(y) : null;
  if (filedata2) {
    // FileTest.size(x) == FileTest.size(y), then the contents
    const different = !sameBytes(filedata, filedata2);
    if (different) {
      safetocopy = await pbConfirmMessage(_INTL("A different file named '{1}' already exists. Overwrite it?", y));
    } else {
      // No need to copy
      return;
    }
  }
  if (safetocopy) {
    filedata ??= await devReadBytes(x);
    await DevFiles.write(z ?? y, filedata!);
  }
}

/** What pbAllocateAnimation needs from a PBAnimations list (the animation editor's). */
export interface AllocatableAnimations {
  readonly length: number;
  get(i: number): { readonly length: number; readonly name: string; frame(i: number): readonly unknown[] } | null | undefined;
  resize(len: number): void;
}

export function pbAllocateAnimation(animations: AllocatableAnimations, _name: string): number {
  for (let i = 1; i < animations.length; i++) {
    const anim = animations.get(i);
    if (!anim) return i;
    // if name && name!="" && anim.name==name
    //   # use animation with same name
    //   return i
    // end
    if (anim.length === 1 && anim.frame(0).length === 2 && anim.name === "") {
      // assume empty
      return i;
    }
  }
  const oldlength = animations.length;
  // NOTE (Ruby parity): resizes the list to 10 animations whatever its length
  // (meant oldlength + 1): with 10 or more the returned slot doesn't exist
  // (001_Editor_Utilities.rb:57).
  animations.resize(10);
  return oldlength;
}

/** [map ID, name, depth] for every map, in the RMXP map tree's order. */
export function pbMapTree(): [number, string, number][] {
  const mapinfos = Data.mapInfos; // pbLoadMapInfos
  const maplevels: [number, number, number, number][] = [];
  const retarray: [number, string, number][] = [];
  for (const i of mapinfos.keys()) {
    let info = mapinfos.get(i);
    let level = -1;
    while (info) {
      info = mapinfos.get(info.parentId);
      level += 1;
    }
    if (level >= 0) {
      info = mapinfos.get(i)!;
      maplevels.push([i, level, info.parentId, info.order]);
    }
  }
  maplevels.sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1]; // level
    if (a[2] !== b[2]) return a[2] - b[2]; // parent ID
    return a[3] - b[3]; // order
  });
  const stack: number[] = [];
  stack.push(0, 0);
  while (stack.length > 0) {
    const parent = stack[stack.length - 1]!;
    const index = stack[stack.length - 2]!;
    if (index >= maplevels.length) {
      stack.pop();
      stack.pop();
      continue;
    }
    const maplevel = maplevels[index]!;
    stack[stack.length - 2]! += 1;
    if (maplevel[2] !== parent) {
      stack.pop();
      stack.pop();
      continue;
    }
    retarray.push([maplevel[0], mapinfos.get(maplevel[0])!.name, maplevel[1]]);
    for (let i = index + 1; i < maplevels.length; i++) {
      if (maplevels[i]![2] !== maplevel[0]) continue;
      stack.push(i);
      stack.push(maplevel[0]);
      break;
    }
  }
  return retarray;
}

//===============================================================================
// List all members of a class
//===============================================================================
type GameDataRecord = { id: unknown; realName: string };

/**
 * pbChooseFromGameDataList(game_data, default) { |data| name }: game_data is
 * the GameData class's name ("Species"); the block (optional) gives each
 * record's name, or null to leave it out.
 */
export async function pbChooseFromGameDataList(
  gameData: string, default_: Id | number | null = null,
  block?: (data: never) => string | null | undefined | false,
): Promise<Id | null> {
  const gameDataModule = (GameData as unknown as Record<string, unknown>)[gameData];
  const each = (gameDataModule as { each?: unknown } | undefined)?.each;
  if (typeof gameDataModule !== "function" || typeof each !== "function") {
    throw new Error(_INTL("Couldn't find class {1} in module GameData.", gameData));
  }
  const commands: ChooseListCommand[] = [];
  for (const data of (each as (this: unknown) => GameDataRecord[]).call(gameDataModule)) {
    let name: string | null | undefined | false = data.realName;
    if (block) name = block(data as never);
    if (name == null || name === false) continue;
    commands.push([commands.length + 1, name, data.id as Id]);
  }
  return (await pbChooseList(commands, default_, null, -1)) as Id | null;
}

/**
 * Displays a list of all Pokémon species, and returns the ID of the species
 * selected (or null if the selection was canceled). "default", if specified,
 * is the ID of the species to initially select. Pressing Input.ACTION will
 * toggle the list sorting between numerical and alphabetical.
 */
export function pbChooseSpeciesList(default_: Id | null = null): Promise<Id | null> {
  return pbChooseFromGameDataList("Species", default_, (data: InstanceType<typeof GameData.Species>) =>
    (data.form > 0 ? null : data.realName));
}

export function pbChooseSpeciesFormList(default_: Id | null = null): Promise<Id | null> {
  return pbChooseFromGameDataList("Species", default_, (data: InstanceType<typeof GameData.Species>) =>
    (data.form > 0 ? `${data.realName}_${data.form}` : data.realName));
}

/**
 * Displays a list of all types, and returns the ID of the type selected (or
 * null if the selection was canceled). "default", if specified, is the ID of
 * the type to initially select. Pressing Input.ACTION will toggle the list
 * sorting between numerical and alphabetical.
 */
export function pbChooseTypeList(default_: Id | null = null): Promise<Id | null> {
  return pbChooseFromGameDataList("Type", default_, (data: InstanceType<typeof GameData.Type>) =>
    (data.pseudoType ? null : data.realName));
}

/**
 * Displays a list of all items, and returns the ID of the item selected (or
 * null if the selection was canceled). "default", if specified, is the ID of
 * the item to initially select. Pressing Input.ACTION will toggle the list
 * sorting between numerical and alphabetical.
 */
export function pbChooseItemList(default_: Id | null = null): Promise<Id | null> {
  return pbChooseFromGameDataList("Item", default_);
}

/**
 * Displays a list of all abilities, and returns the ID of the ability selected
 * (or null if the selection was canceled). "default", if specified, is the ID
 * of the ability to initially select. Pressing Input.ACTION will toggle the
 * list sorting between numerical and alphabetical.
 */
export function pbChooseAbilityList(default_: Id | null = null): Promise<Id | null> {
  return pbChooseFromGameDataList("Ability", default_);
}

/**
 * Displays a list of all moves, and returns the ID of the move selected (or
 * null if the selection was canceled). "default", if specified, is the ID of
 * the move to initially select. Pressing Input.ACTION will toggle the list
 * sorting between numerical and alphabetical.
 */
export function pbChooseMoveList(default_: Id | null = null): Promise<Id | null> {
  return pbChooseFromGameDataList("Move", default_);
}

/** The commands and default row of pbChooseMoveListForSpecies (its legal moves, then every move). */
export function moveListForSpecies(species: Id, defaultMoveID: Id | null = null): { commands: [number, string, Id][]; moveDefault: number } {
  let commands: [number, string, Id][] = [];
  let index = 1;
  // Get all legal moves
  const legalMoves = pbGetLegalMoves(species);
  for (const move of legalMoves) {
    const moveData = GameData.Move.get(move);
    commands.push([index, moveData.name, moveData.id]);
    index += 1;
  }
  commands.sort((a, b) => cmpStr(a[1], b[1]));
  let moveDefault = 0;
  if (defaultMoveID) {
    commands.forEach((item, i) => {
      if (moveDefault === 0 && item[2] === defaultMoveID) moveDefault = i;
    });
  }
  // Get all moves
  const commands2: [number, string, Id][] = [];
  for (const moveData of GameData.Move.each()) {
    commands2.push([index, moveData.name, moveData.id]);
    index += 1;
  }
  commands2.sort((a, b) => cmpStr(a[1], b[1]));
  if (defaultMoveID) {
    // NOTE (Ruby parity): when the default move isn't a legal move (or is the
    // first one), this takes its index in the second list without adding the
    // first list's length, so the cursor starts on the wrong move
    // (001_Editor_Utilities.rb:187-191).
    commands2.forEach((item, i) => {
      if (moveDefault === 0 && item[2] === defaultMoveID) moveDefault = i;
    });
  }
  // Choose from all moves
  commands = commands.concat(commands2);
  return { commands, moveDefault };
}

export async function pbChooseMoveListForSpecies(species: Id, defaultMoveID: Id | null = null): Promise<Id | null> {
  const cmdwin = pbListWindow([], 200);
  const { commands, moveDefault } = moveListForSpecies(species, defaultMoveID);
  const realcommands: string[] = [];
  for (const cmd of commands) realcommands.push(cmd[1]);
  const ret = await pbCommands2(cmdwin, realcommands, -1, moveDefault, true);
  cmdwin.dispose();
  return ret >= 0 ? commands[ret]![2] : null;
}

export async function pbChooseBallList(defaultMoveID: Id | null = null): Promise<Id | null> {
  const cmdwin = pbListWindow([], 200);
  const commands: [Id, string][] = [];
  let moveDefault = 0;
  for (const itemData of GameData.Item.each()) {
    if (itemData.isPokeBall()) commands.push([itemData.id, itemData.name]);
  }
  commands.sort((a, b) => cmpStr(a[1], b[1]));
  if (defaultMoveID) {
    for (let i = 0; i < commands.length; i++) {
      if (commands[i]![0] !== defaultMoveID) continue;
      moveDefault = i;
      break;
    }
  }
  const realcommands: string[] = [];
  for (const i of commands) realcommands.push(i[1]);
  const ret = await pbCommands2(cmdwin, realcommands, -1, moveDefault, true);
  cmdwin.dispose();
  return ret >= 0 ? commands[ret]![0] : defaultMoveID;
}

//===============================================================================
// General list methods
//===============================================================================
export async function pbCommands2(
  cmdwindow: CommandWindow, commands: string[], cmdIfCancel: number, defaultindex = -1, noresize = false,
): Promise<number> {
  cmdwindow.commands = commands;
  if (defaultindex >= 0) cmdwindow.index = defaultindex;
  cmdwindow.x = 0;
  cmdwindow.y = 0;
  if (noresize) {
    cmdwindow.height = Graphics.height;
  } else {
    cmdwindow.width = Graphics.width / 2;
  }
  if (cmdwindow.height > Graphics.height) cmdwindow.height = Graphics.height;
  cmdwindow.z = 99999;
  cmdwindow.visible = true;
  cmdwindow.active = true;
  let command = 0;
  for (;;) {
    await Graphics.update();
    Input.update();
    cmdwindow.update();
    if (Input.trigger(Input.BACK)) {
      if (cmdIfCancel > 0) {
        command = cmdIfCancel - 1;
        break;
      } else if (cmdIfCancel < 0) {
        command = cmdIfCancel;
        break;
      }
    } else if (Input.trigger(Input.USE)) {
      command = cmdwindow.index;
      break;
    }
  }
  const ret = command;
  cmdwindow.active = false;
  return ret;
}

/**
 * Returns [action, index]: 0 = chose (or cancelled: index is cmdIfCancel),
 * 1/2 = ACTION+Up/Down (move the entry), 3/4 = ACTION+Left/Right, 5 = SPECIAL.
 */
export async function pbCommands3(
  cmdwindow: CommandWindow, commands: string[], cmdIfCancel: number, defaultindex = -1, noresize = false,
): Promise<[number, number]> {
  cmdwindow.commands = commands;
  if (defaultindex >= 0) cmdwindow.index = defaultindex;
  cmdwindow.x = 0;
  cmdwindow.y = 0;
  if (noresize) {
    cmdwindow.height = Graphics.height;
  } else {
    cmdwindow.width = Graphics.width / 2;
  }
  if (cmdwindow.height > Graphics.height) cmdwindow.height = Graphics.height;
  cmdwindow.z = 99999;
  cmdwindow.visible = true;
  cmdwindow.active = true;
  let command: [number, number] = [0, 0];
  for (;;) {
    await Graphics.update();
    Input.update();
    cmdwindow.update();
    if (Input.trigger(Input.SPECIAL)) {
      command = [5, cmdwindow.index];
      break;
    } else if (Input.press(Input.ACTION)) {
      if (Input.repeat(Input.UP)) {
        command = [1, cmdwindow.index];
        break;
      } else if (Input.repeat(Input.DOWN)) {
        command = [2, cmdwindow.index];
        break;
      } else if (Input.trigger(Input.LEFT)) {
        command = [3, cmdwindow.index];
        break;
      } else if (Input.trigger(Input.RIGHT)) {
        command = [4, cmdwindow.index];
        break;
      }
    } else if (Input.trigger(Input.BACK)) {
      if (cmdIfCancel > 0) {
        command = [0, cmdIfCancel - 1];
        break;
      } else if (cmdIfCancel < 0) {
        command = [0, cmdIfCancel];
        break;
      }
    } else if (Input.trigger(Input.USE)) {
      command = [0, cmdwindow.index];
      break;
    }
  }
  const ret = command;
  cmdwindow.active = false;
  return ret;
}

//-------------------------------------------------------------------------------
// Search Function (TDW Debug List Search)
//-------------------------------------------------------------------------------
// Based on KRLW890's Better Battle Animation Editor https://reliccastle.com/resources/1314/
/**
 * Asks for a search term and returns the entries of `commands` containing it
 * (case insensitive): their indexes (type 0) or the entries themselves
 * (type 1). false if no term was entered, [] if nothing matched.
 */
export async function pbOpenGenericListSearch(commands: string[], type: 0): Promise<false | number[]>;
export async function pbOpenGenericListSearch(commands: string[], type: 1): Promise<false | string[]>;
export async function pbOpenGenericListSearch(commands: string[]): Promise<false | number[]>;
export async function pbOpenGenericListSearch(commands: string[], type = 0): Promise<false | (number | string)[]> {
  const term = await pbMessageFreeText(_INTL("Search for what?"), "", false, 32);
  if (term === "" || term == null) return false;
  const newSearch: (number | string)[] = [];
  for (let i = 0; i < commands.length; i++) {
    if (commands[i]!.toLowerCase().includes(term.toLowerCase())) {
      newSearch.push(type === 0 ? i : commands[i]!); // 0 = index, 1 = string
    }
  }
  if (newSearch.length < 1) {
    await pbMessage(_INTL("No results found."));
    return [];
  }
  return newSearch;
}

//-------------------------------------------------------------------------------
// Basic List (TDW Debug List Search's version: F searches the list)
//-------------------------------------------------------------------------------
/**
 * Lets the player pick from `commands` ([ID number, name, ID?] entries) and
 * returns the picked entry's ID (else its number), or cancelValue. sortType:
 * 1 = alphabetical, 0 = by number, -1 = by number with "001: " in front and
 * ACTION toggling the sort. Sorts `commands` in place, as Ruby does.
 */
export async function pbChooseList<C = number>(
  commands: ChooseListCommand[], default_: Id | number | null = 0, cancelValue: C = -1 as C, sortType = 1,
): Promise<Id | number | C> {
  const cmdwin = pbListWindow([]);
  let itemID: Id | number | C | null = default_;
  let itemIndex = 0;
  let sortMode = sortType >= 0 ? sortType : 0; // 0=ID, 1=alphabetical
  let sorting = true;
  let realcommands: string[] = [];
  for (;;) {
    if (sorting) {
      switch (sortMode) {
        case 0:
          commands.sort((a, b) => a[0] - b[0]);
          break;
        case 1:
          commands.sort((a, b) => cmpStr(a[1], b[1]));
          break;
      }
      if (typeof itemID === "string") {
        commands.forEach((command, i) => { if (command[2] === itemID) itemIndex = i; });
      } else if (typeof itemID === "number" && itemID > 0) {
        commands.forEach((command, i) => { if (command[0] === itemID) itemIndex = i; });
      }
      realcommands = [];
      for (const command of commands) {
        if (sortType <= 0) {
          realcommands.push(`${pad3(command[0])}: ${command[1]}`);
        } else {
          realcommands.push(command[1]);
        }
      }
      sorting = false;
    }
    const cmd = await pbCommandsSortable(cmdwin, realcommands, -1, itemIndex, sortType < 0);
    if (cmd[0] === 0) { // Chose an option or cancelled
      itemID = cmd[1] < 0 ? cancelValue : (commands[cmd[1]]![2] ?? commands[cmd[1]]![0]);
      break;
    } else if (cmd[0] === 1) { // Toggle sorting
      itemID = commands[cmd[1]]![2] ?? commands[cmd[1]]![0];
      sortMode = (sortMode + 1) % 2;
      sorting = true;
    } else if (cmd[0] === 2) { // Added for quick search
      // (old_commands is block-local in Ruby, so it is always the list shown.)
      const oldCommands = [...commands];
      commands = [];
      for (const val of cmd[1]) commands.push(oldCommands[val]!);
      sorting = true;
      itemIndex = 0;
    }
  }
  cmdwin.dispose();
  return itemID as Id | number | C;
}

export type CommandsSortableResult = [0 | 1, number] | [2, number[]];

export async function pbCommandsSortable(
  cmdwindow: CommandWindow, commands: string[], cmdIfCancel: number, defaultindex = -1, sortable = false,
): Promise<CommandsSortableResult> {
  cmdwindow.commands = commands;
  if (defaultindex >= 0) cmdwindow.index = defaultindex;
  cmdwindow.x = 0;
  cmdwindow.y = 0;
  if (cmdwindow.width < Graphics.width / 2) cmdwindow.width = Graphics.width / 2;
  cmdwindow.height = Graphics.height;
  cmdwindow.z = 99999;
  cmdwindow.active = true;
  let command: CommandsSortableResult = [0, 0];
  for (;;) {
    await Graphics.update();
    Input.update();
    KeyboardInput.update(); // Input.triggerex?(:F)
    cmdwindow.update();
    if (Input.trigger(Input.ACTION) && sortable) {
      command = [1, cmdwindow.index];
      break;
    } else if (Input.trigger(Input.BACK)) {
      command = [0, cmdIfCancel > 0 ? cmdIfCancel - 1 : cmdIfCancel];
      break;
    } else if (KeyboardInput.triggerex("F")) { // Added for quick search (TDW Debug List Search)
      const newSearch = await pbOpenGenericListSearch(commands);
      if (newSearch !== false && newSearch.length > 0) {
        command = [2, newSearch];
        break;
      }
    } else if (Input.trigger(Input.USE)) {
      command = [0, cmdwindow.index];
      break;
    }
  }
  const ret = command;
  cmdwindow.active = false;
  return ret;
}

//-------------------------------------------------------------------------------
// Generation 9 Pack ([000] General/[002] Debug.rb:157)
//-------------------------------------------------------------------------------
/** mode: "main", "main_battle" or "battle" (null: every stat). */
export function pbChooseStatList(mode: "main" | "main_battle" | "battle" | null = null, default_: Id | null = null): Promise<Id | null> {
  const commands: ChooseListCommand[] = [];
  for (const data of GameData.Stat.each()) {
    switch (mode) {
      case "main": if (!["main", "main_battle"].includes(data.type)) continue; break;
      case "main_battle": if (!["main_battle"].includes(data.type)) continue; break;
      case "battle": if (!["main_battle", "battle"].includes(data.type)) continue; break;
    }
    const name = data.realName;
    if (name == null) continue;
    commands.push([commands.length + 1, name, data.id]);
  }
  return pbChooseList(commands, default_, null, -1) as Promise<Id | null>;
}
