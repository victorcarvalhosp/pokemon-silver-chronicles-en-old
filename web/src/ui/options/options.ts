// Port of 016_UI/015_UI_Options.rb (this game's copy: Battle Style is
// commented out) plus the :options_menu entry Following Pokemon EX adds
// (Script Additions/Compatibility.rb) and its PokemonOptionScreen#pbStartScreen
// alias (pbRefreshSceneMap afterwards). PokemonSystem itself lives in
// game/globals.ts.

import { assetExists } from "../../core/assets";
import { G, pbUpdateSceneMap } from "../../game/globals";
import { pbPlayCursorSE, pbSEPlay } from "../../game/GameSystem";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, type Rect } from "../../rgss/types";
import { pbDrawShadowText } from "../drawText";
import { type SpriteHash, pbActivateWindow, pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, MessageConfig, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash, Settings } from "../messageConfig";
import { pbCreateMessageWindow, pbDisposeMessageWindow } from "../messages";
import { FieldActions, menuGlobals, menuPlayer } from "../menus/menuScreens";
import { type MenuHandlerHash, MenuHandlers } from "../menus/menuHandlers";
import { addBackgroundOrColoredPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { Window_AdvancedTextPokemon, Window_DrawableCommand, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";

/** pbPlayCloseMenuSE (008_Audio/002_Audio_Play.rb) */
export function pbPlayCloseMenuSE(): void {
  if (assetExists("Audio/SE/GUI menu close")) pbSEPlay("GUI menu close", 80);
}

/** pbUpdateSceneMap without the fade check (011_Messages.rb). */
async function pbRefreshSceneMap(): Promise<void> {
  await G.scene?.miniupdate?.();
}

//===============================================================================
//
//===============================================================================
type GetProc = (() => number | null | undefined) | null;
type SetProc = ((value: number, scene: PokemonOption_Scene) => void) | null;

/** PropertyMixin */
abstract class PropertyMixin {
  readonly name: string;
  protected getProc: GetProc;
  protected setProc: SetProc;

  constructor(name: string, getProc: GetProc, setProc: SetProc) {
    this.name = name;
    this.getProc = getProc;
    this.setProc = setProc;
  }

  get(): number | null | undefined {
    return this.getProc?.();
  }

  set(value: number, scene: PokemonOption_Scene): void {
    this.setProc?.(value, scene);
  }

  abstract next(current: number): number;
  abstract prev(current: number): number;
}

export class EnumOption extends PropertyMixin {
  readonly values: string[];

  constructor(name: string, values: string[], getProc: GetProc, setProc: SetProc) {
    super(name, getProc, setProc);
    this.values = values.map((val) => _INTL(val));
  }

  next(current: number): number {
    let index = current + 1;
    if (index > this.values.length - 1) index = this.values.length - 1;
    return index;
  }

  prev(current: number): number {
    let index = current - 1;
    if (index < 0) index = 0;
    return index;
  }
}

export class NumberOption extends PropertyMixin {
  readonly lowestValue: number;
  readonly highestValue: number;

  /** range: [lowest, highest] (Ruby accepts a Range or an Array). */
  constructor(name: string, range: [number, number], getProc: GetProc, setProc: SetProc) {
    super(name, getProc, setProc);
    this.lowestValue = range[0];
    this.highestValue = range[1];
  }

  next(current: number): number {
    let index = current + this.lowestValue;
    index += 1;
    if (index > this.highestValue) index = this.lowestValue;
    return index - this.lowestValue;
  }

  prev(current: number): number {
    let index = current + this.lowestValue;
    index -= 1;
    if (index < this.lowestValue) index = this.highestValue;
    return index - this.lowestValue;
  }
}

export class SliderOption extends PropertyMixin {
  readonly lowestValue: number;
  readonly highestValue: number;
  private interval: number;

  /** range: [minimum, maximum, interval] */
  constructor(name: string, range: [number, number, number], getProc: GetProc, setProc: SetProc) {
    super(name, getProc, setProc);
    this.lowestValue = range[0];
    this.highestValue = range[1];
    this.interval = range[2];
  }

  next(current: number): number {
    let index = current + this.lowestValue;
    index += this.interval;
    if (index > this.highestValue) index = this.highestValue;
    return index - this.lowestValue;
  }

  prev(current: number): number {
    let index = current + this.lowestValue;
    index -= this.interval;
    if (index < this.lowestValue) index = this.lowestValue;
    return index - this.lowestValue;
  }
}

export type OptionItem = EnumOption | NumberOption | SliderOption;
type OptionClass = new (name: string, parameters: never, getProc: GetProc, setProc: SetProc) => OptionItem;

/** A :options_menu handler hash ("get_proc" -> getProc, ...). */
export interface OptionsMenuHash extends MenuHandlerHash {
  type: OptionClass;
  parameters: unknown;
  description?: string | (() => string);
  onSelect?: (scene: PokemonOption_Scene) => void;
  getProc: GetProc;
  setProc: SetProc;
}

//===============================================================================
// Main options list
//===============================================================================
export class Window_PokemonOption extends Window_DrawableCommand {
  static readonly SEL_NAME_BASE_COLOR = new Color(192, 120, 0);
  static readonly SEL_NAME_SHADOW_COLOR = new Color(248, 176, 80);
  static readonly SEL_VALUE_BASE_COLOR = new Color(248, 48, 24);
  static readonly SEL_VALUE_SHADOW_COLOR = new Color(248, 136, 128);

  // Ruby sets these before calling super; super's refresh sees no options yet.
  declare private _options: OptionItem[];
  declare private _values: number[];
  declare valueChanged: boolean;

  constructor(options: OptionItem[], x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
    this._options = options;
    this._values = options.map(() => 0);
    this.valueChanged = false;
    this.refresh();
  }

  /** self[i] */
  value(i: number): number {
    return this._values[i] ?? 0;
  }

  /** self[i] = value */
  setValue(i: number, value: number): void {
    this._values[i] = value;
    this.refresh();
  }

  setValueNoRefresh(i: number, value: number): void {
    this._values[i] = value;
  }

  override itemCount(): number {
    if (!this._options) return 0;
    return this._options.length + 1;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    rect = this.drawCursor(index, rect);
    const contents = this.contents!;
    const W = Window_PokemonOption;
    const selIndex = this.index;
    // Draw option's name
    const optionname = index === this._options.length ? _INTL("Close") : this._options[index]!.name;
    const optionwidth = Math.floor((rect.width * 9) / 20);
    pbDrawShadowText(contents, rect.x, rect.y, optionwidth, rect.height, optionname,
      index === selIndex ? W.SEL_NAME_BASE_COLOR : this.baseColor,
      index === selIndex ? W.SEL_NAME_SHADOW_COLOR : this.shadowColor);
    if (index === this._options.length) return;
    // Draw option's values
    const option = this._options[index]!;
    if (option instanceof EnumOption) {
      if (option.values.length > 1) {
        let totalwidth = 0;
        for (const value of option.values) totalwidth += contents.textSize(value).width;
        let spacing = Math.floor((rect.width - rect.x - optionwidth - totalwidth) / (option.values.length - 1));
        if (spacing < 0) spacing = 0;
        let xpos = optionwidth + rect.x;
        let ivalue = 0;
        for (const value of option.values) {
          pbDrawShadowText(contents, xpos, rect.y, optionwidth, rect.height, value,
            ivalue === this.value(index) ? W.SEL_VALUE_BASE_COLOR : this.baseColor,
            ivalue === this.value(index) ? W.SEL_VALUE_SHADOW_COLOR : this.shadowColor);
          xpos += contents.textSize(value).width;
          xpos += spacing;
          ivalue += 1;
        }
      } else {
        pbDrawShadowText(contents, rect.x + optionwidth, rect.y, optionwidth, rect.height,
          optionname, this.baseColor, this.shadowColor);
      }
    } else if (option instanceof NumberOption) {
      const value = _INTL("Type {1}/{2}", option.lowestValue + this.value(index),
        option.highestValue - option.lowestValue + 1);
      const xpos = optionwidth + rect.x * 2;
      pbDrawShadowText(contents, xpos, rect.y, optionwidth, rect.height, value,
        W.SEL_VALUE_BASE_COLOR, W.SEL_VALUE_SHADOW_COLOR, 1);
    } else {
      // SliderOption
      let value = ` ${option.highestValue}`;
      const sliderlength = rect.width - rect.x - optionwidth - contents.textSize(value).width;
      let xpos = optionwidth + rect.x;
      contents.fillRect(xpos, rect.y - 2 + Math.floor(rect.height / 2), sliderlength, 4, this.baseColor);
      contents.fillRect(
        xpos + Math.floor(((sliderlength - 8) * (option.lowestValue + this.value(index))) / option.highestValue),
        rect.y - 8 + Math.floor(rect.height / 2),
        8, 16, W.SEL_VALUE_BASE_COLOR,
      );
      value = `${option.lowestValue + this.value(index)}`;
      xpos += rect.width - rect.x - optionwidth - contents.textSize(value).width;
      pbDrawShadowText(contents, xpos, rect.y, optionwidth, rect.height, value,
        W.SEL_VALUE_BASE_COLOR, W.SEL_VALUE_SHADOW_COLOR);
    }
  }

  override update(): void {
    const oldindex = this.index;
    this.valueChanged = false;
    super.update();
    let dorefresh = this.index !== oldindex;
    if (this.active && this.index < this._options.length) {
      if (Input.repeat(Input.LEFT)) {
        this.setValue(this.index, this._options[this.index]!.prev(this.value(this.index)));
        dorefresh = true;
        this.valueChanged = true;
      } else if (Input.repeat(Input.RIGHT)) {
        this.setValue(this.index, this._options[this.index]!.next(this.value(this.index)));
        dorefresh = true;
        this.valueChanged = true;
      }
    }
    if (dorefresh) this.refresh();
  }
}

//===============================================================================
// Options main screen
//===============================================================================
export interface OptionSprites {
  bg?: unknown;
  title: Window_UnformattedTextPokemon;
  textbox: Window_AdvancedTextPokemon;
  option: Window_PokemonOption;
}

/** Graphics the scene reads synchronously. */
const OPTION_BITMAPS = ["Graphics/Pictures/optionsbg"];

export class PokemonOption_Scene {
  sprites: OptionSprites = {} as OptionSprites;
  inLoadScreen = false;
  private options: OptionItem[] = [];
  private hashes: OptionsMenuHash[] = [];
  private viewport!: Viewport;

  private get spriteHash(): SpriteHash {
    return this.sprites as unknown as SpriteHash;
  }

  async pbStartScene(inLoadScreen = false): Promise<void> {
    this.inLoadScreen = inLoadScreen;
    await preloadBitmaps(OPTION_BITMAPS);
    // Get all options
    this.options = [];
    this.hashes = [];
    for (const [, h, name] of MenuHandlers.eachAvailable("options_menu")) {
      const hash = h as OptionsMenuHash;
      this.options.push(new hash.type(name, hash.parameters as never, hash.getProc, hash.setProc));
      this.hashes.push(hash);
    }
    // Create sprites
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const sprites = {} as Record<string, unknown>;
    addBackgroundOrColoredPlane(sprites, "bg", "optionsbg", new Color(192, 200, 208), this.viewport);
    sprites.title = Window_UnformattedTextPokemon.newWithSize(
      _INTL("Options"), 0, -16, Graphics.width, 64, this.viewport,
    );
    this.sprites = sprites as unknown as OptionSprites;
    this.sprites.title.backOpacity = 0;
    this.sprites.textbox = pbCreateMessageWindow();
    pbSetSystemFont(this.sprites.textbox.contents!);
    const top = this.sprites.title.y + this.sprites.title.height - 16;
    this.sprites.option = new Window_PokemonOption(
      this.options, 0, top, Graphics.width,
      Graphics.height - top - this.sprites.textbox.height,
    );
    this.sprites.option.viewport = this.viewport;
    this.sprites.option.visible = true;
    // Get the values of each option
    this.options.forEach((o, i) => this.sprites.option.setValueNoRefresh(i, o.get() ?? 0));
    this.sprites.option.refresh();
    this.pbChangeSelection();
    await pbDeactivateWindows(this.spriteHash);
    await pbFadeInAndShow(this.spriteHash, null, () => this.pbUpdate());
  }

  pbChangeSelection(): void {
    const hash = this.hashes[this.sprites.option.index];
    // Call selected option's "on_select" proc (if defined)
    this.sprites.textbox.letterbyletter = false;
    hash?.onSelect?.(this);
    // Set descriptive text
    let description = "";
    if (hash) {
      if (typeof hash.description === "function") description = hash.description();
      else if (hash.description != null) description = _INTL(hash.description);
    } else {
      description = _INTL("Close the screen.");
    }
    this.sprites.textbox.text = description;
  }

  async pbOptions(): Promise<void> {
    await pbActivateWindow(this.spriteHash, "option", async () => {
      let index = -1;
      for (;;) {
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        if (this.sprites.option.index !== index) {
          this.pbChangeSelection();
          index = this.sprites.option.index;
        }
        if (this.sprites.option.valueChanged) this.options[index]!.set(this.sprites.option.value(index), this);
        if (Input.trigger(Input.BACK)) {
          break;
        } else if (Input.trigger(Input.USE)) {
          if (this.sprites.option.index === this.options.length) break;
        }
      }
    });
  }

  async pbEndScene(): Promise<void> {
    pbPlayCloseMenuSE();
    await pbFadeOutAndHide(this.spriteHash, () => this.pbUpdate());
    // Set the values of each option, to make sure they're all set
    this.options.forEach((o, i) => o.set(this.sprites.option.value(i), this));
    pbDisposeMessageWindow(this.sprites.textbox);
    pbDisposeSpriteHash(this.spriteHash as never);
    await pbUpdateSceneMap();
    this.viewport.dispose();
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.spriteHash as never);
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonOptionScreen {
  constructor(private scene: PokemonOption_Scene) {}

  async pbStartScreen(inLoadScreen = false): Promise<void> {
    await this.scene.pbStartScene(inLoadScreen);
    await this.scene.pbOptions();
    await this.scene.pbEndScene();
    // Following Pokemon EX's alias
    await pbRefreshSceneMap();
  }
}

//===============================================================================
// pbSetResizeFactor (001_MKXP_Compatibility.rb)
//===============================================================================
/**
 * mkxp resizes its window (0 = half, 1 = normal, 2 = 1.5x, 3 = double,
 * 4 = fullscreen). The browser canvas is scaled to fit the page by
 * core/screen.ts (and F4/Alt+Enter toggles fullscreen), so the setting is
 * stored but has no effect here.
 */
export function pbSetResizeFactor(_factor: number): void {}

//===============================================================================
// Options Menu commands
//===============================================================================
const sys = () => G.pokemonSystem;

MenuHandlers.add("options_menu", "bgm_volume", {
  name: _INTL("Music Volume"),
  order: 10,
  type: SliderOption,
  parameters: [0, 100, 5], // [minimum_value, maximum_value, interval]
  description: _INTL("Adjust the volume of the background music."),
  getProc: () => sys().bgmvolume,
  setProc: (value, scene) => {
    if (sys().bgmvolume === value) return;
    sys().bgmvolume = value;
    const gs = G.gameSystem;
    if (scene.inLoadScreen || !gs || gs.playingBgm == null) return;
    // bgm_pause + bgm_resume(playingBGM): replays the same track at the new volume
    // (the browser channel keeps its position when the track doesn't change).
    gs.bgmPlay({ ...gs.playingBgm });
  },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "se_volume", {
  name: _INTL("SE Volume"),
  order: 20,
  type: SliderOption,
  parameters: [0, 100, 5], // [minimum_value, maximum_value, interval]
  description: _INTL("Adjust the volume of sound effects."),
  getProc: () => sys().sevolume,
  setProc: (value) => {
    if (sys().sevolume === value) return;
    sys().sevolume = value;
    const gs = G.gameSystem;
    if (gs?.playingBgs) {
      gs.playingBgs.volume = value;
      gs.bgsPlay({ ...gs.playingBgs }); // bgs_pause + bgs_resume
    }
    pbPlayCursorSE();
  },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "text_speed", {
  name: _INTL("Text Speed"),
  order: 30,
  type: EnumOption,
  parameters: [_INTL("Slow"), _INTL("Normal"), _INTL("Fast")],
  description: _INTL("Choose the speed at which text appears."),
  onSelect: (scene) => { scene.sprites.textbox.letterbyletter = true; },
  getProc: () => sys().textspeed,
  setProc: (value, scene) => {
    if (value === sys().textspeed) return;
    sys().textspeed = value;
    MessageConfig.pbSetTextSpeed(MessageConfig.pbSettingToTextSpeed(value));
    // Display the message with the selected text speed to gauge it better.
    scene.sprites.textbox.textspeed = MessageConfig.pbGetTextSpeed();
    scene.sprites.textbox.letterbyletter = true;
    scene.sprites.textbox.text = scene.sprites.textbox.text;
  },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "battle_animations", {
  name: _INTL("Battle Effects"),
  order: 40,
  type: EnumOption,
  parameters: [_INTL("On"), _INTL("Off")],
  description: _INTL("Choose whether you wish to see move animations in battle."),
  getProc: () => sys().battlescene,
  setProc: (value) => { sys().battlescene = value; },
} satisfies OptionsMenuHash);

// (Battle Style, order 50, is commented out in this game's script.)

MenuHandlers.add("options_menu", "movement_style", {
  name: _INTL("Default Movement"),
  order: 60,
  type: EnumOption,
  parameters: [_INTL("Walking"), _INTL("Running")],
  description: _INTL("Choose your movement speed. Hold Back while moving to move at the other speed."),
  condition: () => !!menuPlayer()?.hasRunningShoes,
  getProc: () => sys().runstyle,
  setProc: (value) => { sys().runstyle = value; },
} satisfies OptionsMenuHash);

/** Settings::NEW_CAPTURE_CAN_REPLACE_PARTY_MEMBER = (MECHANICS_GENERATION >= 7); this game uses 8. */
const NEW_CAPTURE_CAN_REPLACE_PARTY_MEMBER = true;

MenuHandlers.add("options_menu", "send_to_boxes", {
  name: _INTL("Send to Boxes"),
  order: 70,
  type: EnumOption,
  parameters: [_INTL("Manual"), _INTL("Automatic")],
  description: _INTL("Choose whether caught Pokémon are sent to your Boxes when your party is full."),
  condition: () => NEW_CAPTURE_CAN_REPLACE_PARTY_MEMBER,
  getProc: () => sys().sendtoboxes,
  setProc: (value) => { sys().sendtoboxes = value; },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "give_nicknames", {
  name: _INTL("Give Nicknames"),
  order: 80,
  type: EnumOption,
  parameters: [_INTL("Give"), _INTL("Don't give")],
  description: _INTL("Choose whether you can give a nickname to a Pokémon when you obtain it."),
  getProc: () => sys().givenicknames,
  setProc: (value) => { sys().givenicknames = value; },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "speech_frame", {
  name: _INTL("Speech Frame"),
  order: 90,
  type: NumberOption,
  parameters: [1, Settings.SPEECH_WINDOWSKINS.length],
  description: _INTL("Choose the appearance of dialogue boxes."),
  getProc: () => sys().textskin,
  setProc: (value, scene) => {
    sys().textskin = value;
    MessageConfig.pbSetSpeechFrame("Graphics/Windowskins/" + Settings.SPEECH_WINDOWSKINS[value]);
    // Change the windowskin of the options text box to selected one
    scene.sprites.textbox.setSkin(MessageConfig.pbGetSpeechFrame());
  },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "menu_frame", {
  name: _INTL("Menu Frame"),
  order: 100,
  type: NumberOption,
  parameters: [1, Settings.MENU_WINDOWSKINS.length],
  description: _INTL("Choose the appearance of menu boxes."),
  getProc: () => sys().frame,
  setProc: (value, scene) => {
    sys().frame = value;
    MessageConfig.pbSetSystemFrame("Graphics/Windowskins/" + Settings.MENU_WINDOWSKINS[value]);
    // Change the windowskin of the options text box to selected one
    scene.sprites.option.setSkin(MessageConfig.pbGetSystemFrame());
  },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "text_input_style", {
  name: _INTL("Text Entry"),
  order: 110,
  type: EnumOption,
  parameters: [_INTL("Cursor"), _INTL("Keyboard")],
  description: _INTL("Choose how you want to enter text."),
  getProc: () => sys().textinput,
  setProc: (value) => { sys().textinput = value; },
} satisfies OptionsMenuHash);

MenuHandlers.add("options_menu", "screen_size", {
  name: _INTL("Screen Size"),
  order: 120,
  type: EnumOption,
  parameters: [_INTL("S"), _INTL("M"), _INTL("L"), _INTL("XL"), _INTL("Full")],
  description: _INTL("Choose the size of the game window."),
  getProc: () => Math.min(sys().screensize, 4),
  setProc: (value) => {
    if (sys().screensize === value) return;
    sys().screensize = value;
    pbSetResizeFactor(sys().screensize);
  },
} satisfies OptionsMenuHash);

//-------------------------------------------------------------------------------
// Following Pokemon EX (Script Additions/Compatibility.rb)
//-------------------------------------------------------------------------------
/** FollowingPkmn::SHOW_TOGGLE_IN_OPTIONS (Configuration/000_Config.rb): false in this game. */
const SHOW_TOGGLE_IN_OPTIONS = false;

MenuHandlers.add("options_menu", "follower_toggle", {
  name: _INTL("Following Pokemon"),
  order: 999,
  type: EnumOption,
  parameters: [_INTL("On"), _INTL("Off")],
  description: _INTL("Let the first Pokemon in your party follow you in the overworld."),
  condition: () => {
    const fp = FieldActions.followingPkmn;
    return !!fp && fp.canCheck() && !!fp.getEvent() && SHOW_TOGGLE_IN_OPTIONS;
  },
  getProc: () => (menuGlobals().followerToggled ? 0 : 1),
  setProc: (value) => {
    const fp = FieldActions.followingPkmn;
    if (!fp?.canCheck()) return;
    if (menuGlobals().followerToggled === (value === 0)) return;
    menuGlobals().followerToggled = value === 0;
    fp.refresh(false);
  },
} satisfies OptionsMenuHash);
