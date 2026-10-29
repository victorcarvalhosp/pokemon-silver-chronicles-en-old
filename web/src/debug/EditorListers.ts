// Port of 020_Debug/003_Editor_Listers.rb: pbListWindow, pbListScreen,
// pbListScreenBlock and the listers the editors pick things from
// (GraphicsLister, MusicFileLister, MetadataLister, MapLister, SpeciesLister,
// ItemLister, TrainerTypeLister, TrainerBattleLister), with TDW Debug List
// Search's overrides folded in (Plugins/TDW Debug List Search/TDW Debug List
// Search.rb): pbListScreenBlock's F key search and `commands_override=` on
// SpeciesLister/ItemLister/TrainerTypeLister/TrainerBattleLister (here the
// `commandsOverride` setter).
//
// A lister's `commands` and `refresh` may be async here: listing a folder
// goes through the dev server (there is no Dir in the browser), "There are no
// files." is a message, and a graphic has to be fetched before a sprite can
// show it. pbListScreen/pbListScreenBlock await both.

import { assetExists } from "../core/assets";
import { GameData } from "../data/gameData";
import { G } from "../game/globals";
import type { AudioRef } from "../data/events";
import { pbBGMPlay, pbBGMStop } from "../game/GameSystem";
import type { Bitmap } from "../rgss/Bitmap";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { _INTL, pbSetSmallFont } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { pbResolveBitmap, preloadBitmap } from "../ui/rpgCache";
import { IconSprite } from "../ui/SpriteWrapper";
import { ItemIconSprite, preloadItemIcons } from "../ui/sprites/itemIcon";
import { KeyboardInput } from "../ui/textEntry/keyboard";
import { Window_CommandPokemon, Window_UnformattedTextPokemon } from "../ui/windows/SpriteWindowText";
import { DevFiles } from "./devFiles";
import { pbMapTree, pbOpenGenericListSearch } from "./EditorUtilities";

/** What pbListScreen / pbListScreenBlock need from a lister (Ruby's duck type). */
export interface Lister<V = unknown> {
  dispose(): void;
  setViewport(viewport: Viewport): void;
  startIndex(): number;
  commands(): string[] | Promise<string[]>;
  value(index: number): V;
  refresh(index: number): void | Promise<void>;
  /** TDW Debug List Search: `commands_override=` (only the four data listers have it). */
  commandsOverride?: string[] | null;
}

/**
 * The editors' optional hooks for things this file uses that aren't ported:
 * createMinimap (006_Map renderer/004_TileDrawingHelper.rb:149), which
 * MapLister shows next to the list. Without it MapLister shows no minimap.
 */
export const EditorListerHooks: {
  createMinimap: ((mapId: number) => Bitmap | Promise<Bitmap>) | null;
} = { createMinimap: null };

/** sprintf("%03d", n) */
function pad3(n: number): string {
  return n < 0 ? `-${String(-n).padStart(2, "0")}` : String(n).padStart(3, "0");
}

/** Ruby's String#<=> (ASCII/UTF-8 byte order matches code-unit order outside surrogates). */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ruby's array[index]: a negative index counts from the end. */
function rubyAt<T>(array: T[], index: number): T | null {
  return array.at(index) ?? null;
}

/**
 * Dir.chdir(folder) { Dir.glob("*.ext") ... } for each pattern, in order.
 * The files come from the dev server's /__dev/list (real names); without it,
 * from the asset index (/game/__index.json, served by the dev server too),
 * whose names are lowercased.
 * NOTE (Ruby parity): the game runs on Windows, where Dir.glob is case
 * insensitive, so "*.png" and "*.PNG" both match "x.png": GraphicsLister
 * lists every file once per pattern (003_Editor_Listers.rb:135-138; it has no
 * uniq!, MusicFileLister does).
 */
export async function globFolder(folder: string, extensions: string[]): Promise<string[]> {
  const dir = folder.endsWith("/") ? folder : `${folder}/`;
  let files: string[];
  try {
    files = (await DevFiles.list(dir)).filter((f) => !f.includes("/"));
  } catch {
    files = [];
    try {
      const res = await fetch("/game/__index.json");
      const prefix = dir.toLowerCase();
      for (const key of (await res.json()) as string[]) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length);
        if (name.includes("/") || !name.includes(".") || !assetExists(key)) continue;
        files.push(name);
      }
    } catch {
      files = [];
    }
  }
  const ret: string[] = [];
  for (const ext of extensions) {
    const lower = `.${ext.toLowerCase()}`;
    for (const f of files) if (f.toLowerCase().endsWith(lower)) ret.push(f);
  }
  return ret;
}

//===============================================================================
// Core lister script
//===============================================================================
export function pbListWindow(cmds: string[], width = Graphics.width / 2): Window_CommandPokemon {
  const list = Window_CommandPokemon.newWithSize(cmds, 0, 0, width, Graphics.height);
  list.index = 0;
  list.rowHeight = 24;
  pbSetSmallFont(list.contents!);
  list.refresh();
  return list;
}

export async function pbListScreen<V>(title: string, lister: Lister<V>): Promise<V> {
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const list = pbListWindow([]);
  list.viewport = viewport;
  list.z = 2;
  const titleWindow = Window_UnformattedTextPokemon.newWithSize(
    title, Graphics.width / 2, 0, Graphics.width / 2, 64, viewport,
  );
  titleWindow.z = 2;
  lister.setViewport(viewport);
  let selectedmap = -1;
  const commands = await lister.commands();
  const selindex = lister.startIndex();
  if (commands.length === 0) {
    const value = lister.value(-1);
    lister.dispose();
    titleWindow.dispose();
    list.dispose();
    viewport.dispose();
    return value;
  }
  list.commands = commands;
  list.index = selindex;
  for (;;) {
    await Graphics.update();
    Input.update();
    list.update();
    if (list.index !== selectedmap) {
      await lister.refresh(list.index);
      selectedmap = list.index;
    }
    if (Input.trigger(Input.BACK)) {
      selectedmap = -1;
      break;
    } else if (Input.trigger(Input.USE)) {
      break;
    }
  }
  const value = lister.value(selectedmap);
  lister.dispose();
  titleWindow.dispose();
  list.dispose();
  viewport.dispose();
  Input.update();
  return value;
}

/**
 * pbListScreenBlock(title, lister) { |button, value| ... }: the block gets
 * Input.ACTION or Input.USE and the selected value. TDW Debug List Search's
 * version: F searches the list and narrows it with lister.commands_override=.
 */
export async function pbListScreenBlock<V>(
  title: string, lister: Lister<V>, block: (button: number, value: V) => Promise<void> | void,
): Promise<V | undefined> {
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const list = pbListWindow([], Graphics.width / 2);
  list.viewport = viewport;
  list.z = 2;
  const titleWindow = Window_UnformattedTextPokemon.newWithSize(
    title, Graphics.width / 2, 0, Graphics.width / 2, 64, viewport,
  );
  titleWindow.z = 2;
  lister.setViewport(viewport);
  let selectedmap = -1;
  const commands = await lister.commands();
  const selindex = lister.startIndex();
  if (commands.length === 0) {
    const value = lister.value(-1);
    lister.dispose();
    titleWindow.dispose();
    list.dispose();
    viewport.dispose();
    return value;
  }
  list.commands = commands;
  list.index = selindex;
  for (;;) {
    await Graphics.update();
    Input.update();
    KeyboardInput.update(); // Input.triggerex?(:F)
    list.update();
    if (list.index !== selectedmap) {
      await lister.refresh(list.index);
      selectedmap = list.index;
    }
    if (Input.trigger(Input.ACTION)) {
      await block(Input.ACTION, lister.value(selectedmap));
      list.commands = await lister.commands();
      // NOTE (Ruby parity): sets the index to what it already is; meant to
      // pull it back to the last row (003_Editor_Listers.rb:91-93, TDW Debug
      // List Search.rb:154).
      if (list.index === list.commands.length) list.index = list.commands.length;
      await lister.refresh(list.index);
    } else if (Input.trigger(Input.BACK)) {
      break;
    } else if (KeyboardInput.triggerex("F")) { // Added for quick search (TDW Debug List Search)
      const newSearch = await pbOpenGenericListSearch(list.commands, 1);
      if (newSearch !== false && newSearch.length > 0) {
        // Ruby raises NoMethodError here for a lister without commands_override=
        // (none of Essentials' pbListScreenBlock callers use one).
        lister.commandsOverride = newSearch as string[];
        list.commands = await lister.commands();
        await lister.refresh(0);
      }
    } else if (Input.trigger(Input.USE)) {
      await block(Input.USE, lister.value(selectedmap));
      list.commands = await lister.commands();
      // NOTE (Ruby parity): no-op, as above (003_Editor_Listers.rb:99-101).
      if (list.index === list.commands.length) list.index = list.commands.length;
      await lister.refresh(list.index);
    }
  }
  lister.dispose();
  titleWindow.dispose();
  list.dispose();
  viewport.dispose();
  Input.update();
  return undefined;
}

/**
 * TDW Debug List Search's `commands_override=` + its `commands` alias, shared
 * by the four data listers: narrows @commands/@ids to the searched entries.
 * NOTE (Ruby parity): the ids are looked up by the entry's position in the
 * last full list (@commands) but taken from @ids, which a previous search
 * already narrowed; searching the search results again maps entries to the
 * wrong ids (TDW Debug List Search.rb:189-191, 210-212, 231-233, 252-254).
 */
abstract class DataLister<V> implements Lister<V | true | null> {
  protected selection: number;
  protected _commands: string[] = [];
  protected ids: (V | true)[] = [];
  protected includeNew: boolean;
  protected index = 0;
  private _commandsOverride: string[] | null = null;
  private needsIdRefresh = false;

  constructor(selection: number, includeNew: boolean) {
    this.selection = selection;
    this.includeNew = includeNew;
  }

  get commandsOverride(): string[] | null { return this._commandsOverride; }
  set commandsOverride(value: string[] | null) {
    this._commandsOverride = value;
    this.needsIdRefresh = true;
  }

  abstract dispose(): void;
  abstract setViewport(viewport: Viewport): void;
  abstract refresh(index: number): void | Promise<void>;
  /** The original (pre-plugin) `commands`. */
  protected abstract baseCommands(): string[];

  startIndex(): number {
    return this.index;
  }

  commands(): string[] {
    if (this._commandsOverride) {
      if (this.needsIdRefresh) {
        const newIds: (V | true)[] = [];
        for (const cmd of this._commandsOverride) newIds.push(this.ids[this._commands.indexOf(cmd)]!);
        this.ids = newIds;
        this.needsIdRefresh = false;
      }
      return this._commandsOverride;
    }
    return this.baseCommands();
  }

  value(index: number): V | true | null {
    if (index < 0) return null;
    return this.ids[index] ?? null;
  }

  /** The end of each data lister's `commands`: the cursor starts at @selection, clamped. */
  protected clampIndex(): void {
    this.index = this.selection;
    if (this.index >= this._commands.length) this.index = this._commands.length - 1;
    if (this.index < 0) this.index = 0;
  }
}

//===============================================================================
//
//===============================================================================
export class GraphicsLister implements Lister<string> {
  private sprite: IconSprite;
  private folder: string;
  private selection: string;
  private _commands: string[] = [];
  private index = 0;

  constructor(folder: string, selection: string) {
    this.sprite = new IconSprite(0, 0);
    this.sprite.setBitmapFile(null);
    this.sprite.x = Graphics.width * 3 / 4;
    this.sprite.y = ((Graphics.height - 64) / 2) + 64;
    this.sprite.z = 2;
    this.folder = folder;
    this.selection = selection;
  }

  dispose(): void {
    this.sprite.clearBitmaps();
    this.sprite.dispose();
  }

  setViewport(viewport: Viewport): void {
    this.sprite.viewport = viewport;
  }

  startIndex(): number {
    return this.index;
  }

  async commands(): Promise<string[]> {
    this._commands.length = 0;
    // Ruby also has *.jpg/*.jpeg/*.bmp commented out.
    this._commands.push(...(await globFolder(this.folder, ["png", "PNG", "gif", "GIF"])));
    this._commands.sort(cmpStr);
    for (let i = 0; i < this._commands.length; i++) {
      if (this._commands[i] === this.selection) this.index = i;
    }
    if (this._commands.length === 0) await pbMessage(_INTL("There are no files."));
    return this._commands;
  }

  value(index: number): string {
    return index < 0 ? "" : this._commands[index]!;
  }

  async refresh(index: number): Promise<void> {
    if (index < 0) return;
    const file = this.folder + this._commands[index];
    await preloadBitmap(file);
    this.sprite.setBitmapFile(file);
    if (!this.sprite.bitmap) return; // (Ruby would crash on a file it can't load)
    const spriteWidth = this.sprite.bitmap.width;
    const spriteHeight = this.sprite.bitmap.height;
    this.sprite.ox = Math.floor(spriteWidth / 2);
    this.sprite.oy = Math.floor(spriteHeight / 2);
    const scaleX = (Graphics.width / 2) / spriteWidth;
    const scaleY = (Graphics.height - 64) / spriteHeight;
    if (scaleX < 1.0 || scaleY < 1.0) {
      const minScale = Math.min(scaleX, scaleY);
      this.sprite.zoomX = this.sprite.zoomY = minScale;
    } else {
      this.sprite.zoomX = this.sprite.zoomY = 1.0;
    }
  }
}

//===============================================================================
//
//===============================================================================
export class MusicFileLister implements Lister<string> {
  private oldbgm: AudioRef | null;
  private _commands: string[] = [];
  private bgm: boolean;
  private setting: string;
  private index = 0;

  constructor(bgm: boolean, setting: string) {
    this.oldbgm = this.getPlayingBGM();
    this.bgm = bgm;
    this.setting = setting;
  }

  dispose(): void {
    this.pbPlayBGM(this.oldbgm);
  }

  setViewport(_viewport: Viewport): void {}

  getPlayingBGM(): AudioRef | null {
    return G.gameSystem ? G.gameSystem.getPlayingBGM() : null;
  }

  pbPlayBGM(bgm: AudioRef | string | null): void {
    if (bgm) pbBGMPlay(bgm);
    else pbBGMStop();
  }

  startIndex(): number {
    return this.index;
  }

  async commands(): Promise<string[]> {
    const folder = this.bgm ? "Audio/BGM/" : "Audio/ME/";
    this._commands.length = 0;
    // Ruby also has *.mp3 commented out.
    this._commands.push(...(await globFolder(folder, ["ogg", "wav", "mid", "midi"])));
    this._commands = [...new Set(this._commands)];
    this._commands.sort((a, b) => cmpStr(a.toLowerCase(), b.toLowerCase()));
    for (let i = 0; i < this._commands.length; i++) {
      if (this._commands[i] === this.setting) this.index = i;
    }
    if (this._commands.length === 0) await pbMessage(_INTL("There are no files."));
    return this._commands;
  }

  value(index: number): string {
    return index < 0 ? "" : this._commands[index]!;
  }

  refresh(index: number): void {
    if (index < 0) return;
    if (this.bgm) {
      this.pbPlayBGM(this._commands[index]!);
    } else {
      this.pbPlayBGM(`../../Audio/ME/${this._commands[index]}`);
    }
  }
}

//===============================================================================
//
//===============================================================================
export class MetadataLister implements Lister<number> {
  private index = 0;
  private _commands: string[] = [];
  private playerIds: number[] = [];
  private newPlayer: boolean;

  constructor(selPlayerId = -1, newPlayer = false) {
    for (const player of GameData.PlayerMetadata.each()) {
      // NOTE (Ruby parity): @commands is still empty here, so any selected
      // player puts the cursor on the first player (003_Editor_Listers.rb:258).
      if (selPlayerId > 0 && player.id === selPlayerId) this.index = this._commands.length + 1;
      this.playerIds.push(player.id);
    }
    this.newPlayer = newPlayer;
  }

  dispose(): void {}

  setViewport(_viewport: Viewport): void {}

  startIndex(): number {
    return this.index;
  }

  commands(): string[] {
    this._commands.length = 0;
    this._commands.push(_INTL("[GLOBAL METADATA]"));
    for (const id of this.playerIds) this._commands.push(_INTL("Player {1}", id));
    if (this.newPlayer) this._commands.push(_INTL("[ADD NEW PLAYER]"));
    return this._commands;
  }

  /**
   * Cancel: -1
   * New player: -2
   * Global metadata: 0
   * Player character: 1+ (the player ID itself)
   */
  value(index: number): number {
    if (index < 1) return index;
    if (this.newPlayer && index === this._commands.length - 1) return -2;
    return this.playerIds[index - 1]!;
  }

  refresh(_index: number): void {}
}

//===============================================================================
//
//===============================================================================
export class MapLister implements Lister<number> {
  private sprite: Sprite;
  private _commands: string[] = [];
  private maps: [number, string, number][];
  private addGlobalOffset: number;
  private index = 0;

  constructor(selmap: number, addGlobal = false) {
    this.sprite = new Sprite();
    this.sprite.setBitmap(null);
    this.sprite.x = Graphics.width * 3 / 4;
    this.sprite.y = ((Graphics.height - 64) / 2) + 64;
    this.sprite.z = -2;
    this.maps = pbMapTree();
    this.addGlobalOffset = addGlobal ? 1 : 0;
    for (let i = 0; i < this.maps.length; i++) {
      if (this.maps[i]![0] === selmap) this.index = i + this.addGlobalOffset;
    }
  }

  dispose(): void {
    this.sprite.bitmap?.dispose();
    this.sprite.dispose();
  }

  setViewport(viewport: Viewport): void {
    this.sprite.viewport = viewport;
  }

  startIndex(): number {
    return this.index;
  }

  commands(): string[] {
    this._commands.length = 0;
    if (this.addGlobalOffset === 1) this._commands.push(_INTL("[GLOBAL]"));
    for (const map of this.maps) {
      this._commands.push(`${"  ".repeat(map[2])}${pad3(map[0])} ${map[1]}`);
    }
    return this._commands;
  }

  value(index: number): number {
    if (this.addGlobalOffset === 1 && index === 0) return 0;
    return index < 0 ? -1 : this.maps[index - this.addGlobalOffset]![0];
  }

  async refresh(index: number): Promise<void> {
    this.sprite.bitmap?.dispose();
    this.sprite.setBitmap(null);
    if (index < 0) return;
    if (index === 0 && this.addGlobalOffset === 1) return;
    // Not ported: createMinimap (006_Map renderer/004_TileDrawingHelper.rb:149), see EditorListerHooks.
    if (!EditorListerHooks.createMinimap) return;
    this.sprite.setBitmap(await EditorListerHooks.createMinimap(this.maps[index - this.addGlobalOffset]![0]));
    this.sprite.ox = Math.floor(this.sprite.bitmap!.width / 2);
    this.sprite.oy = Math.floor(this.sprite.bitmap!.height / 2);
  }
}

//===============================================================================
//
//===============================================================================
export class SpeciesLister extends DataLister<string> {
  constructor(selection = 0, includeNew = false) {
    super(selection, includeNew);
  }

  dispose(): void {}
  setViewport(_viewport: Viewport): void {}

  /** Sorted alphabetically */
  protected baseCommands(): string[] {
    this._commands.length = 0;
    this.ids.length = 0;
    const cmds: [number, string, string][] = [];
    let idx = 1;
    for (const species of GameData.Species.eachSpecies()) {
      cmds.push([idx, species.id, species.realName]);
      idx += 1;
    }
    cmds.sort((a, b) => cmpStr(a[2].toLowerCase(), b[2].toLowerCase()));
    if (this.includeNew) {
      this._commands.push(_INTL("[NEW SPECIES]"));
      this.ids.push(true);
    }
    for (const i of cmds) {
      this._commands.push(`${pad3(i[0])}: ${i[2]}`);
      this.ids.push(i[1]);
    }
    this.clampIndex();
    return this._commands;
  }

  refresh(_index: number): void {}
}

//===============================================================================
//
//===============================================================================
export class ItemLister extends DataLister<string> {
  private sprite: ItemIconSprite;

  constructor(selection = 0, includeNew = false) {
    super(selection, includeNew);
    this.sprite = new ItemIconSprite(Graphics.width * 3 / 4, Graphics.height / 2, null);
    this.sprite.z = 2;
  }

  dispose(): void {
    this.sprite.dispose();
  }

  setViewport(viewport: Viewport): void {
    this.sprite.viewport = viewport;
  }

  /** Sorted alphabetically */
  protected baseCommands(): string[] {
    this._commands.length = 0;
    this.ids.length = 0;
    const cmds: [number, string, string][] = [];
    let idx = 1;
    for (const item of GameData.Item.each()) {
      cmds.push([idx, item.id, item.realName]);
      idx += 1;
    }
    cmds.sort((a, b) => cmpStr(a[2].toLowerCase(), b[2].toLowerCase()));
    if (this.includeNew) {
      this._commands.push(_INTL("[NEW ITEM]"));
      this.ids.push(true);
    }
    for (const i of cmds) {
      this._commands.push(`${pad3(i[0])}: ${i[2]}`);
      this.ids.push(i[1]);
    }
    this.clampIndex();
    return this._commands;
  }

  async refresh(index: number): Promise<void> {
    const id = rubyAt(this.ids, index);
    const item = typeof id === "string" ? id : null;
    await preloadItemIcons([item]);
    this.sprite.item = item;
  }
}

//===============================================================================
//
//===============================================================================
export class TrainerTypeLister extends DataLister<string> {
  private sprite: IconSprite;

  constructor(selection = 0, includeNew = false) {
    super(selection, includeNew);
    this.sprite = new IconSprite(Graphics.width * 3 / 4, ((Graphics.height - 64) / 2) + 64);
    this.sprite.z = 2;
  }

  dispose(): void {
    this.sprite.clearBitmaps();
    this.sprite.dispose();
  }

  setViewport(viewport: Viewport): void {
    this.sprite.viewport = viewport;
  }

  protected baseCommands(): string[] {
    this._commands.length = 0;
    this.ids.length = 0;
    const cmds: [number, string, string][] = [];
    let idx = 1;
    for (const trType of GameData.TrainerType.each()) {
      cmds.push([idx, trType.id, trType.realName]);
      idx += 1;
    }
    cmds.sort((a, b) => (a[2] === b[2] ? a[0] - b[0] : cmpStr(a[2].toLowerCase(), b[2].toLowerCase())));
    if (this.includeNew) {
      this._commands.push(_INTL("[NEW TRAINER TYPE]"));
      this.ids.push(true);
    }
    for (const t of cmds) {
      this._commands.push(`${pad3(t[0])}: ${t[2]}`);
      this.ids.push(t[1]);
    }
    this.clampIndex();
    return this._commands;
  }

  async refresh(index: number): Promise<void> {
    this.sprite.clearBitmaps();
    if (index < 0) return;
    try {
      const id = this.ids[index];
      if (typeof id === "string") {
        this.sprite.setBitmapFile(await trainerFrontSprite(id), 0);
      } else {
        this.sprite.setBitmapFile(null);
      }
    } catch {
      this.sprite.setBitmapFile(null);
    }
    if (this.sprite.bitmap) {
      this.sprite.ox = Math.floor(this.sprite.bitmap.width / 2);
      this.sprite.oy = Math.floor(this.sprite.bitmap.height / 2);
    }
  }
}

/** GameData::TrainerType.front_sprite_filename, after fetching the graphic. */
async function trainerFrontSprite(trType: string): Promise<string | null> {
  await preloadBitmap(`Graphics/Trainers/${trType}`);
  return GameData.TrainerType.frontSpriteFilename(trType, pbResolveBitmap);
}

//===============================================================================
//
//===============================================================================
export type TrainerBattleId = [string, string, number];

export class TrainerBattleLister extends DataLister<TrainerBattleId> {
  private sprite: IconSprite;
  private pkmnList: Window_UnformattedTextPokemon;

  constructor(selection: number, includeNew: boolean) {
    super(selection, includeNew);
    this.sprite = new IconSprite(Graphics.width * 3 / 4, (Graphics.height / 2) + 32);
    this.sprite.z = 2;
    this.pkmnList = Window_UnformattedTextPokemon.newWithSize(
      "", Graphics.width / 2, Graphics.height - 64, Graphics.width / 2, 64,
    );
    this.pkmnList.z = 3;
  }

  dispose(): void {
    this.sprite.clearBitmaps();
    this.sprite.dispose();
    this.pkmnList.dispose();
  }

  setViewport(viewport: Viewport): void {
    this.sprite.viewport = viewport;
    this.pkmnList.viewport = viewport;
  }

  protected baseCommands(): string[] {
    this._commands.length = 0;
    this.ids.length = 0;
    const cmds: [number, string, string, number][] = [];
    let idx = 1;
    for (const trainer of GameData.Trainer.each()) {
      cmds.push([idx, trainer.trainerType, trainer.realName, trainer.version]);
      idx += 1;
    }
    cmds.sort((a, b) => {
      if (a[1] === b[1]) {
        if (a[2] === b[2]) return a[3] === b[3] ? a[0] - b[0] : a[3] - b[3];
        return cmpStr(a[2].toLowerCase(), b[2].toLowerCase());
      }
      return cmpStr(a[1].toLowerCase(), b[1].toLowerCase());
    });
    if (this.includeNew) {
      this._commands.push(_INTL("[NEW TRAINER BATTLE]"));
      this.ids.push(true);
    }
    for (const t of cmds) {
      if (t[3] > 0) {
        this._commands.push(_INTL("{1} {2} ({3}) x{4}",
          GameData.TrainerType.get(t[1]).name, t[2], t[3],
          GameData.Trainer.get(t[1], t[2], t[3]).pokemon.length));
      } else {
        this._commands.push(_INTL("{1} {2} x{3}",
          GameData.TrainerType.get(t[1]).name, t[2],
          GameData.Trainer.get(t[1], t[2], t[3]).pokemon.length));
      }
      this.ids.push([t[1], t[2], t[3]]);
    }
    this.clampIndex();
    return this._commands;
  }

  async refresh(index: number): Promise<void> {
    // Refresh trainer sprite
    this.sprite.clearBitmaps();
    if (index < 0) return;
    try {
      const id = this.ids[index];
      if (Array.isArray(id)) {
        this.sprite.setBitmapFile(await trainerFrontSprite(id[0]), 0);
      } else {
        this.sprite.setBitmapFile(null);
      }
    } catch {
      this.sprite.setBitmapFile(null);
    }
    if (this.sprite.bitmap) {
      this.sprite.ox = Math.floor(this.sprite.bitmap.width / 2);
      this.sprite.oy = this.sprite.bitmap.height;
    }
    // Refresh list of Pokémon
    let text = "";
    if (!this.includeNew || index > 0) {
      const id = this.ids[index] as TrainerBattleId;
      const trData = GameData.Trainer.get(id[0], id[1], id[2]);
      if (trData) {
        trData.pokemon.forEach((pkmn, i) => {
          if (i > 0) text += "\r\n";
          text += `${GameData.Species.get(pkmn.species).realName} Lv.${pkmn.level}`;
        });
      }
    }
    this.pkmnList.text = text;
    this.pkmnList.resizeHeightToFit(text, Graphics.width / 2);
    this.pkmnList.y = Graphics.height - this.pkmnList.height;
  }
}
