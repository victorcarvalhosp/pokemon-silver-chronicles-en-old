// Port of 016_UI/013_UI_Load.rb: PokemonLoadPanel, PokemonLoad_Scene and
// PokemonLoadScreen (Continue / Mystery Gift / New Game / Options / Language /
// Debug / Quit).

import { _INTL, pbChooseLanguage, pbLoadMessages } from "../../core/intl";
import { Settings } from "../../data/gameData/settings";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { FRAME_RATE } from "../../game/GameCharacter";
import { G } from "../../game/globals";
import { pbGetPlayerCharset } from "../../game/GamePlayer";
import { pbPlayBuzzerSE, pbPlayDecisionSE, pbSEPlay } from "../../game/GameSystem";
import { GameSystem } from "../../game/GameSystem";
import { playerMetadata } from "../../game/metadata";
import { PokemonSystem } from "../../game/globals";
import { SaveData, type SaveHash } from "../../game/save/SaveData";
import { savedMapId, trainerFromSave } from "../../game/save/values";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbDrawTextPositions } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbConfirmMessageSerious, pbMessage } from "../messages";
import { MenuFlags, MenuScreens } from "../menus/menuScreens";
import { addBackgroundOrColoredPlane, pbGetMapNameFromId, TrainerWalkingCharSprite } from "../planes";
import { PokemonOption_Scene, PokemonOptionScreen } from "../options/options";
import { preloadBitmaps } from "../rpgCache";
import { Window_CommandPokemon } from "../windows/SpriteWindowText";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { PictureOrigin } from "../scenes/PictureEx";
import { PokemonIconSprite, preloadPokemonIcons } from "../sprites/pokemonIcon";


/** The trainer fields the panel reads (Player once the data model lands). */
interface PanelTrainer {
  name: string;
  characterID?: number;
  party?: unknown[];
  badgeCount(): number;
  badges?: boolean[];
  gender?: number;
  male?(): boolean;
  female?(): boolean;
  pokedex?: { seenCount?(): number };
}

const TEXTCOLOR = new Color(232, 232, 232);
const TEXTSHADOWCOLOR = new Color(136, 136, 136);
const MALETEXTCOLOR = new Color(56, 160, 248);
const MALETEXTSHADOWCOLOR = new Color(56, 104, 168);
const FEMALETEXTCOLOR = new Color(240, 72, 88);
const FEMALETEXTSHADOWCOLOR = new Color(160, 64, 64);

const isMale = (t: PanelTrainer) => (t.male ? t.male() : t.gender === 0);
const isFemale = (t: PanelTrainer) => (t.female ? t.female() : t.gender === 1);
const badgeCount = (t: PanelTrainer) => t.badgeCount();

class PokemonLoadPanel extends Sprite {
  private bgbitmap = new AnimatedBitmap("Graphics/Pictures/loadPanels");
  private refreshBitmap = true;
  private refreshing = false;
  private _selected: boolean;
  private totalsec: number;

  constructor(
    index: number,
    private title: string,
    private isContinue: boolean,
    private trainer: PanelTrainer | null,
    framecount: number,
    stats: { playTime?: number } | null,
    private mapid: number,
    viewport: Viewport | null = null,
  ) {
    super(viewport);
    this.totalsec = stats?.playTime != null ? Math.floor(stats.playTime) : Math.floor((framecount || 0) / FRAME_RATE);
    this._selected = index === 0;
    this.refresh();
  }

  get selected(): boolean { return this._selected; }
  set selected(value: boolean) {
    if (this._selected === value) return;
    this._selected = value;
    this.refreshBitmap = true;
    this.refresh();
  }

  override dispose(): void {
    this.bgbitmap.dispose();
    this.bitmap?.dispose();
    super.dispose();
  }

  pbRefresh(): void {
    this.refreshBitmap = true;
    this.refresh();
  }

  refresh(): void {
    if (this.refreshing || this.isDisposed()) return;
    this.refreshing = true;
    if (!this.bitmap || this.bitmap.isDisposed()) {
      this.setBitmap(new Bitmap(this.bgbitmap.width, 222));
      pbSetSystemFont(this.bitmap!);
    }
    if (this.refreshBitmap) {
      this.refreshBitmap = false;
      const bmp = this.bitmap!;
      bmp.clear();
      if (this.isContinue) bmp.blt(0, 0, this.bgbitmap.bitmap, new Rect(0, this._selected ? 222 : 0, this.bgbitmap.width, 222));
      else bmp.blt(0, 0, this.bgbitmap.bitmap, new Rect(0, 444 + (this._selected ? 46 : 0), this.bgbitmap.width, 46));
      const textpos: [string, number, number, number, Color, Color][] = [];
      const t = this.trainer;
      if (this.isContinue && t) {
        textpos.push([this.title, 32, 16, 0, TEXTCOLOR, TEXTSHADOWCOLOR]);
        textpos.push(["Badges:", 32, 118, 0, TEXTCOLOR, TEXTSHADOWCOLOR]);
        textpos.push([String(badgeCount(t)), 206, 118, 1, TEXTCOLOR, TEXTSHADOWCOLOR]);
        textpos.push(["Pokédex:", 32, 150, 0, TEXTCOLOR, TEXTSHADOWCOLOR]);
        textpos.push([String(t.pokedex?.seenCount?.() ?? 0), 206, 150, 1, TEXTCOLOR, TEXTSHADOWCOLOR]);
        textpos.push(["Time:", 32, 182, 0, TEXTCOLOR, TEXTSHADOWCOLOR]);
        const hour = Math.floor(this.totalsec / 60 / 60);
        const min = Math.floor(this.totalsec / 60) % 60;
        textpos.push([hour > 0 ? `${hour}h ${min}m` : `${min}m`, 206, 182, 1, TEXTCOLOR, TEXTSHADOWCOLOR]);
        if (isMale(t)) textpos.push([t.name, 112, 70, 0, MALETEXTCOLOR, MALETEXTSHADOWCOLOR]);
        else if (isFemale(t)) textpos.push([t.name, 112, 70, 0, FEMALETEXTCOLOR, FEMALETEXTSHADOWCOLOR]);
        else textpos.push([t.name, 112, 70, 0, TEXTCOLOR, TEXTSHADOWCOLOR]);
        const mapname = pbGetMapNameFromId(this.mapid).replace(/\\PN/g, t.name);
        textpos.push([mapname, 386, 16, 1, TEXTCOLOR, TEXTSHADOWCOLOR]);
      } else {
        textpos.push([this.title, 32, 14, 0, TEXTCOLOR, TEXTSHADOWCOLOR]);
      }
      pbDrawTextPositions(bmp, textpos as never);
    }
    this.refreshing = false;
  }
}

type Sprites = Record<string, any>;

export class PokemonLoad_Scene {
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private commands: string[] = [];

  pbStartScene(commands: string[], showContinue: boolean, trainer: PanelTrainer | null, frameCount: number, stats: { playTime?: number } | null, mapId: number): void {
    this.commands = commands;
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99998;
    addBackgroundOrColoredPlane(this.sprites, "background", "loadbg", new Color(248, 248, 248), this.viewport);
    let y = 32;
    commands.forEach((cmd, i) => {
      const panel = new PokemonLoadPanel(i, cmd, showContinue ? i === 0 : false, trainer, frameCount, stats, mapId, this.viewport);
      panel.x = 48;
      panel.y = y;
      panel.pbRefresh();
      this.sprites[`panel${i}`] = panel;
      y += showContinue && i === 0 ? 224 : 48;
    });
    const cmd = new Window_CommandPokemon([]);
    cmd.viewport = this.viewport;
    cmd.visible = false;
    this.sprites.cmdwindow = cmd;
  }

  async pbStartScene2(): Promise<void> {
    await pbFadeInAndShow(this.sprites, null, () => this.pbUpdate());
  }

  pbStartDeleteScene(): void {
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99998;
    addBackgroundOrColoredPlane(this.sprites, "background", "loadbg", new Color(248, 248, 248), this.viewport);
  }

  pbUpdate(): void {
    const s = this.sprites;
    const oldi: number = s.cmdwindow?.index ?? 0;
    pbUpdateSpriteHash(s);
    const newi: number = s.cmdwindow?.index ?? 0;
    if (oldi === newi) return;
    s[`panel${oldi}`].selected = false;
    s[`panel${oldi}`].pbRefresh();
    s[`panel${newi}`].selected = true;
    s[`panel${newi}`].pbRefresh();
    const shift = (dy: number) => {
      for (let i = 0; i < this.commands.length; i++) s[`panel${i}`].y += dy;
      for (let i = 0; i < 6 && s[`party${i}`]; i++) s[`party${i}`].y += dy;
      if (s.player) s.player.y += dy;
    };
    while (s[`panel${newi}`].y > Graphics.height - 80) shift(-48);
    while (s[`panel${newi}`].y < 32) shift(48);
  }

  pbSetParty(trainer: PanelTrainer | null): void {
    if (!trainer || !trainer.party) return;
    const meta = playerMetadata(trainer.characterID ?? 1);
    if (meta) {
      const filename = pbGetPlayerCharset(meta.walkCharset, true, trainer as never) ?? meta.walkCharset ?? "";
      const player = new TrainerWalkingCharSprite(filename, this.viewport);
      if (player.bitmap) {
        const charwidth = player.bitmap.width;
        const charheight = player.bitmap.height;
        player.x = 112 - charwidth / 8;
        player.y = 112 - charheight / 8;
        player.srcRect = new Rect(0, 0, charwidth / 4, charheight / 4);
      }
      this.sprites.player = player;
    }
    (trainer.party as Pokemon[]).forEach((pkmn, i) => {
      const icon = new PokemonIconSprite(pkmn, this.viewport);
      icon.setOffset(PictureOrigin.CENTER);
      icon.x = 334 + 66 * (i % 2);
      icon.y = 112 + 50 * Math.floor(i / 2);
      icon.z = 99999;
      this.sprites[`party${i}`] = icon;
    });
  }

  async pbChoose(commands: string[]): Promise<number> {
    this.sprites.cmdwindow.commands = commands;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.USE)) return this.sprites.cmdwindow.index;
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(this.sprites, () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  }

  pbCloseScene(): void {
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  }
}

export type LoadChoice = { action: "continue"; save: SaveHash } | { action: "new_game" } | { action: "title" } | { action: "quit" };

export class PokemonLoadScreen {
  private saveData: SaveHash = {};

  constructor(private scene: PokemonLoad_Scene) {}

  /** Reads the save (Ruby does this in initialize). */
  async init(): Promise<void> {
    this.saveData = (await SaveData.exists()) ? await this.loadSaveFile() : {};
  }

  private async loadSaveFile(): Promise<SaveHash> {
    let data = await SaveData.readFromFile();
    if (!SaveData.valid(data)) {
      const backup = await SaveData.readFromFile("Game.bak");
      if (SaveData.valid(backup)) {
        await pbMessage("The save file is corrupt. A backup will be loaded.");
        data = backup;
      } else {
        await this.promptSaveDeletion();
        return {};
      }
    }
    return data;
  }

  private async promptSaveDeletion(): Promise<void> {
    await pbMessage("The save file is corrupt, or is incompatible with this game.");
    if (!(await pbConfirmMessageSerious("Do you want to delete the save file and start anew?"))) {
      throw new Error("The save file is corrupt and was kept.");
    }
    await this.deleteSaveData();
    G.gameSystem = new GameSystem();
    G.pokemonSystem = new PokemonSystem();
  }

  private async deleteSaveData(): Promise<void> {
    try {
      await SaveData.deleteFile();
      await pbMessage("The saved data was deleted.");
    } catch {
      await pbMessage("All saved data could not be deleted.");
    }
  }

  async pbStartDeleteScreen(): Promise<void> {
    this.scene.pbStartDeleteScene();
    await this.scene.pbStartScene2();
    if (await SaveData.exists()) {
      if (await pbConfirmMessageSerious("Delete all saved data?")) {
        await pbMessage("Once data has been deleted, there is no way to recover it.\x01");
        if (await pbConfirmMessageSerious("Delete the saved data anyway?")) {
          await pbMessage("Deleting all data. Don't turn off the power.\\wtnp[0]");
          await this.deleteSaveData();
        }
      }
    } else {
      await pbMessage("No save file was found.");
    }
    await this.scene.pbEndScene();
  }

  async pbStartLoadScreen(): Promise<LoadChoice> {
    const commands: string[] = [];
    let cmdContinue = -1;
    let cmdNewGame = -1;
    let cmdOptions = -1;
    let cmdMysteryGift = -1;
    let cmdDebug = -1;
    let cmdQuit = -1;
    const showContinue = Object.keys(this.saveData).length > 0;
    const trainer = showContinue ? (trainerFromSave(this.saveData) as unknown as PanelTrainer) : null;
    if (showContinue) {
      cmdContinue = commands.length;
      commands.push("Continue");
      if ((trainer as unknown as Player).mysteryGiftUnlocked) {
        cmdMysteryGift = commands.length;
        commands.push(_INTL("Mystery Gift"));
      }
    }
    cmdNewGame = commands.length;
    commands.push("New Game");
    cmdOptions = commands.length;
    commands.push("Options");
    let cmdLanguage = -1;
    if (Settings.LANGUAGES.length >= 2) {
      cmdLanguage = commands.length;
      commands.push(_INTL("Language"));
    }
    if (MenuFlags.DEBUG) {
      cmdDebug = commands.length;
      commands.push("Debug");
    }
    cmdQuit = commands.length;
    commands.push("Quit Game");
    const mapId = showContinue ? savedMapId(this.saveData) : 0;
    const stats = (this.saveData.stats as { playTime?: number; play_time?: number } | undefined) ?? null;
    if (showContinue) {
      await Promise.all([preloadBitmaps(walkCharsetPaths(trainer)), preloadPokemonIcons((trainer?.party ?? []) as Pokemon[])]);
    }
    this.scene.pbStartScene(commands, showContinue, trainer, Number(this.saveData.frame_count ?? 0), stats ? { playTime: stats.playTime ?? stats.play_time } : null, mapId);
    if (showContinue) this.scene.pbSetParty(trainer);
    await this.scene.pbStartScene2();
    for (;;) {
      const command = await this.scene.pbChoose(commands);
      if (command !== cmdQuit) pbPlayDecisionSE();
      if (command === cmdContinue) {
        await this.scene.pbEndScene();
        return { action: "continue", save: this.saveData };
      } else if (command === cmdNewGame) {
        await this.scene.pbEndScene();
        return { action: "new_game" };
      } else if (cmdMysteryGift >= 0 && command === cmdMysteryGift) {
        const { pbDownloadMysteryGift } = await import("../MysteryGift");
        const player = trainer as unknown as Player;
        await pbFadeOutIn(async () => { await pbDownloadMysteryGift(player as unknown as { mysteryGifts: unknown[][] }); });
        // Ruby changes @save_data[:player], the object Continue loads (the file
        // itself is only written by the next save).
        this.saveData.player = player.toJSON();
      } else if (command === cmdOptions) {
        await pbFadeOutIn(async () => {
          const scene = new PokemonOption_Scene();
          const screen = new PokemonOptionScreen(scene);
          await screen.pbStartScreen(true);
        });
      } else if (cmdLanguage >= 0 && command === cmdLanguage) {
        await this.scene.pbEndScene();
        G.pokemonSystem.language = await pbChooseLanguage(Settings.LANGUAGES);
        await pbLoadMessages("Data/" + Settings.LANGUAGES[G.pokemonSystem.language]![1]);
        if (showContinue) {
          this.saveData.pokemon_system = { ...(this.saveData.pokemon_system as object), language: G.pokemonSystem.language };
          await SaveData.writeToFile(this.saveData);
        }
        return { action: "title" }; // $scene = pbCallTitle
      } else if (cmdDebug >= 0 && command === cmdDebug) {
        await pbFadeOutIn(async () => { await MenuScreens.debugMenu?.(false); });
      } else if (command === cmdQuit) {
        pbSEPlay("GUI menu close", 80); // pbPlayCloseMenuSE
        await this.scene.pbEndScene();
        return { action: "quit" };
      } else {
        pbPlayBuzzerSE();
      }
    }
  }
}

function walkCharsetPaths(trainer: PanelTrainer | null): string[] {
  const meta = playerMetadata(trainer?.characterID ?? 1);
  if (!meta?.walkCharset) return [];
  const base = `Graphics/Characters/${meta.walkCharset}`;
  return [base, `${base}_${(trainer as { outfit?: number } | null)?.outfit ?? 0}`];
}

/** Bitmaps the load screen draws; preload before showing it. */
export const LOAD_SCREEN_BITMAPS = ["Graphics/Pictures/loadPanels", "Graphics/Pictures/loadbg"];
