// Port of 016_UI/008_UI_Pokegear.rb (PokegearButton, PokemonPokegear_Scene,
// PokemonPokegearScreen and its :pokegear_menu handlers, as this game edits
// them: the Jukebox is "Radio" behind switch 526) plus
// Plugins/Pokemon Silver Chronicles Helpers/Pokegear Changes.rb (plugin 13),
// which adds "Tasks" (MQS quest log) and "DexNav" (Encounter List UI).
// No other plugin adds :pokegear_menu entries (ZUD's Raid Database one is
// commented out).

import { G } from "../../game/globals";
import { pbPlayCursorSE, pbPlayDecisionSE } from "../../game/GameSystem";
import type { Player } from "../../game/trainer/Player";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbDrawImagePositions, pbDrawTextPositions } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { MenuHandlers, type MenuHandlerHash } from "../menus/menuHandlers";
import { flyTemp } from "../menus/menuScreens";
import { pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { pbResolveBitmap, preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { IconSprite } from "../SpriteWrapper";
import { EncounterList_Scene, EncounterList_Screen } from "./encounterList";
import { PokemonJukebox_Scene, PokemonJukeboxScreen } from "./jukebox";
import { phoneNumbers, PokemonPhoneScene } from "./phone";
import { PokemonRegionMap_Scene, PokemonRegionMapScreen } from "./regionMap";
import { QuestList_Scene, QuestList_Screen } from "../quests/questList";

const DIR = "Graphics/Pictures/Pokegear/";
const female = () => (G.player as unknown as Player).female();

/** [icon name, display name] */
type PokegearCommand = [string, string];

//===============================================================================
//
//===============================================================================
export class PokegearButton extends Sprite {
  static readonly TEXT_BASE_COLOR = new Color(248, 248, 248);
  static readonly TEXT_SHADOW_COLOR = new Color(40, 40, 40);
  readonly name: string;
  private image: string;
  private _selected = false;
  private button: AnimatedBitmap;
  private contents: Bitmap;

  constructor(command: PokegearCommand, x: number, y: number, viewport: Viewport | null = null) {
    super(viewport);
    this.image = command[0];
    this.name = command[1];
    this._selected = false;
    if (female() && pbResolveBitmap(`${DIR}icon_button_f`)) {
      this.button = new AnimatedBitmap(`${DIR}icon_button_f`);
    } else {
      this.button = new AnimatedBitmap(`${DIR}icon_button`);
    }
    this.contents = new Bitmap(this.button.width, this.button.height);
    this.setBitmap(this.contents);
    this.x = x - Math.floor(this.button.width / 2);
    this.y = y;
    pbSetSystemFont(this.bitmap!);
    this.refresh();
  }

  override dispose(): void {
    this.button.dispose();
    this.contents.dispose();
    super.dispose();
  }

  get selected(): boolean { return this._selected; }
  set selected(val: boolean) {
    const oldsel = this._selected;
    this._selected = val;
    if (oldsel !== val) this.refresh();
  }

  refresh(): void {
    const bitmap = this.bitmap!;
    bitmap.clear();
    const rect = new Rect(0, 0, this.button.width, Math.floor(this.button.height / 2));
    if (this._selected) rect.y = Math.floor(this.button.height / 2);
    bitmap.blt(0, 0, this.button.bitmap, rect);
    pbDrawTextPositions(bitmap, [
      [this.name, Math.floor(rect.width / 2), Math.floor(rect.height / 2) - 10, 2, PokegearButton.TEXT_BASE_COLOR, PokegearButton.TEXT_SHADOW_COLOR],
    ]);
    pbDrawImagePositions(bitmap, [[`${DIR}icon_` + this.image, 18, 10]]);
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonPokegear_Scene {
  private commands: PokegearCommand[] = [];
  private index = 0;
  private viewport!: Viewport;
  private sprites: Sprites = {};

  pbUpdate(): void {
    for (let i = 0; i < this.commands.length; i++) (this.sprites[`button${i}`] as PokegearButton).selected = i === this.index;
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbStartScene(commands: PokegearCommand[]): Promise<void> {
    await preloadBitmaps([`${DIR}bg`, `${DIR}bg_f`, `${DIR}icon_button`, `${DIR}icon_button_f`, ...commands.map((c) => `${DIR}icon_${c[0]}`)]);
    this.commands = commands;
    this.index = 0;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    const background = new IconSprite(0, 0, this.viewport);
    if (female() && pbResolveBitmap(`${DIR}bg_f`)) background.setBitmapFile(`${DIR}bg_f`);
    else background.setBitmapFile(`${DIR}bg`);
    this.sprites.background = background;
    for (let i = 0; i < this.commands.length; i++) {
      const button = new PokegearButton(this.commands[i]!, Math.floor(Graphics.width / 2), 0, this.viewport);
      const buttonHeight = Math.floor(button.bitmap!.height / 2);
      button.y = Math.floor((Graphics.height - this.commands.length * buttonHeight) / 2) + i * buttonHeight;
      this.sprites[`button${i}`] = button;
    }
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbScene(): Promise<number> {
    let ret = -1;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        ret = this.index;
        break;
      } else if (Input.trigger(Input.UP)) {
        if (this.commands.length > 1) pbPlayCursorSE();
        this.index -= 1;
        if (this.index < 0) this.index = this.commands.length - 1;
      } else if (Input.trigger(Input.DOWN)) {
        if (this.commands.length > 1) pbPlayCursorSE();
        this.index += 1;
        if (this.index >= this.commands.length) this.index = 0;
      }
    }
    return ret;
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    this.dispose();
  }

  dispose(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

/** A :pokegear_menu handler; "effect" returns true to close the Pokégear. */
export interface PokegearMenuHandler extends MenuHandlerHash {
  icon_name?: string;
  effect: (menu: PokemonPokegear_Scene) => Promise<unknown>;
}

//===============================================================================
//
//===============================================================================
export class PokemonPokegearScreen {
  constructor(private scene: PokemonPokegear_Scene) {}

  async pbStartScreen(): Promise<void> {
    // Get all commands
    const commandList: PokegearCommand[] = [];
    const commands: PokegearMenuHandler[] = [];
    for (const [, hash, name] of MenuHandlers.eachAvailable("pokegear_menu")) {
      commandList.push([(hash.icon_name as string | undefined) || "", name]);
      commands.push(hash as PokegearMenuHandler);
    }
    await this.scene.pbStartScene(commandList);
    // Main loop
    let endScene = false;
    for (;;) {
      const choice = await this.scene.pbScene();
      if (choice < 0) {
        endScene = true;
        break;
      }
      if (await commands[choice]!.effect(this.scene)) break;
    }
    if (endScene) await this.scene.pbEndScene();
  }
}

//===============================================================================
// :pokegear_menu handlers (008_UI_Pokegear.rb)
//===============================================================================
MenuHandlers.add("pokegear_menu", "map", {
  name: "Map",
  icon_name: "map",
  order: 10,
  effect: async (menu: PokemonPokegear_Scene) => {
    await pbFadeOutIn(async () => {
      const scene = new PokemonRegionMap_Scene(-1, false);
      const screen = new PokemonRegionMapScreen(scene);
      const ret = await screen.pbStartScreen();
      if (ret) {
        flyTemp().flyDestination = ret;
        menu.dispose();
        return 99999;
      }
      return undefined;
    });
    return flyTemp().flyDestination;
  },
} as PokegearMenuHandler);

MenuHandlers.add("pokegear_menu", "phone", {
  name: "Phone",
  icon_name: "phone",
  order: 20,
  condition: () => phoneNumbers().length > 0,
  effect: async () => {
    await pbFadeOutIn(() => new PokemonPhoneScene().start());
    return false;
  },
} as PokegearMenuHandler);

// 526 is the switch for the Jukebox, activated in the Goldenrod Radio Tower after answering the quiz
MenuHandlers.add("pokegear_menu", "jukebox", {
  name: "Radio",
  icon_name: "jukebox",
  order: 30,
  condition: () => !!G.gameSwitches && G.gameSwitches.get(526),
  effect: async () => {
    await pbFadeOutIn(async () => {
      const scene = new PokemonJukebox_Scene();
      const screen = new PokemonJukeboxScreen(scene);
      await screen.pbStartScreen();
    });
    return false;
  },
} as PokegearMenuHandler);

//===============================================================================
// Pokegear Changes.rb (Pokemon Silver Chronicles Helpers)
//===============================================================================
export const PokegearSettings = {
  MISSIONS_ON_SWITCH: 963,
  DEXNAV_ON_SWITCH: 964,
};

MenuHandlers.add("pokegear_menu", "missions", {
  name: "Tasks",
  icon_name: "missions",
  order: 40,
  condition: () => G.gameSwitches.get(PokegearSettings.MISSIONS_ON_SWITCH) === true,
  effect: async () => {
    await pbFadeOutIn(async () => {
      const scene = new QuestList_Scene();
      const screen = new QuestList_Screen(scene);
      await screen.pbStartScreen();
    });
    return false;
  },
} as PokegearMenuHandler);

MenuHandlers.add("pokegear_menu", "dexnav", {
  name: "DexNav",
  icon_name: "dexnav",
  order: 50,
  condition: () => G.gameSwitches.get(PokegearSettings.DEXNAV_ON_SWITCH) === true,
  effect: async () => {
    await pbFadeOutIn(async () => {
      const scene = new EncounterList_Scene();
      const screen = new EncounterList_Screen(scene);
      await screen.pbStartScreen();
    });
    return false;
  },
} as PokegearMenuHandler);
