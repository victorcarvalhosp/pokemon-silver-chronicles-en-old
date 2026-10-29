// Port of Plugins/DP Pause Menu/Script.rb (Diamond/Pearl Pause Menu by Marin,
// adapted to v20): this game's pause menu. It replaces Scene_Map#call_menu
// (Essentials' PokemonPauseMenu and the MenuHandlers :pause_menu list aren't
// used; plugins load in the order DP PauseMenu last, after Map Zoom and
// Following Pokemon EX, whose call_menu overrides it discards).
//
// Screens it opens that live elsewhere (Pokédex, party, Bag, Pokégear, Town
// Map, Trainer Card, Debug) come from the MenuScreens registry; see
// menuScreens.ts. The menu's mouse code (Script.rb:300-309) reads `$mouse`,
// which nothing in this game defines (Easy Mouse System's API is the `Mouse`
// module, plugins/easyMouse/Mouse.ts), so it never runs in the original.

import { G, pbUpdateSceneMap } from "../../game/globals";
import { pbBGMFade, pbBGSFade, pbPlayBuzzerSE, pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../../game/GameSystem";
import { mapMetadata } from "../../game/metadata";
import { SaveData } from "../../game/save/SaveData";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbFadeOutIn } from "../fades";
import { FrameCounter } from "../frameTime";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont } from "../messageConfig";
import { pbConfirmMessage } from "../messages";
import { PokemonOption_Scene, PokemonOptionScreen } from "../options/options";
import { preloadBitmaps } from "../rpgCache";
import { pbSaveScreen } from "../save/saveScreen";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { bagHas, FieldActions, flyTemp, type HiddenMoveChoice, MenuFlags, menuGlobals, menuPlayer, MenuScreens } from "./menuScreens";

const UI = "Graphics/UI/DP Pause Menu/";

/** Settings::USE_CURRENT_REGION_DEX */
const USE_CURRENT_REGION_DEX = false;
/** The plugin's Exit/Quit option is commented out in this game. */
const QUIT_OPTION_ENABLED = false;

//===============================================================================
// Safari Zone / Bug-Catching Contest state (018_Alternate battle modes),
// read defensively until those modes are ported.
//===============================================================================
interface SafariStateLike {
  inProgress?(): boolean;
  pbReceptionMap?(): number;
  decision?: number;
  pbGoToStart?(): Promise<void> | void;
}

interface BugContestStateLike {
  inProgress?(): boolean;
  pbStartJudging?(): Promise<void> | void;
}

function pbSafariState(): SafariStateLike {
  return (menuGlobals().safariState as SafariStateLike | undefined) ?? {};
}

function pbBugContestState(): BugContestStateLike {
  return (menuGlobals().bugContestState as BugContestStateLike | undefined) ?? {};
}

export function pbInSafari(): boolean {
  if (pbSafariState().inProgress?.()) {
    // Reception map is handled separately from safari map since the reception
    // map can be outdoors, with its own grassy patches.
    const reception = pbSafariState().pbReceptionMap?.();
    const mapId = G.gameMap?.mapId ?? 0;
    if (mapId === reception) return true;
    if (mapMetadata(mapId)?.safariMap) return true;
  }
  return false;
}

export function pbInBugContest(): boolean {
  return !!pbBugContestState().inProgress?.();
}

//===============================================================================
//
//===============================================================================
/** [displayname, unselected, selected, code] */
type PauseOption = [string, string, string, () => Promise<unknown>];

type MenuSprite = Sprite & { visible: boolean };

/** Calls the Pause menu. */
export async function pbPauseMenu(): Promise<void> {
  await new DP_PauseMenu().initialize();
}

/** Scene_Map#call_menu as the plugin overrides it (SceneMap.callMenu does the rest). */
export async function callMenu(): Promise<void> {
  await pbPauseMenu();
}

export class DP_PauseMenu {
  /** Base color of the displayed text */
  static readonly BaseColor = new Color(82, 82, 90);
  /** Shadow color of the displayed text */
  static readonly ShadowColor = new Color(165, 165, 173);

  private options: PauseOption[] = [];
  private count = 0;
  private option = 0;
  private done = false;
  private i = 0;
  private scaling: number | null = 0;
  private viewport!: Viewport;
  private sprites: Record<string, MenuSprite> = {};
  /** The animation counts the original 40 fps frames. */
  private clock = new FrameCounter();

  /** v20: @sprites is a Hash; set visible on each sprite (no SpriteHash.visible=) */
  setMenuSpritesVisible(visible: boolean): void {
    for (const s of Object.values(this.sprites)) if (s) s.visible = visible;
  }

  async initialize(): Promise<void> {
    const player = menuPlayer();
    this.options = [];

    // Retire: Safari
    if (pbInSafari()) {
      this.options.push(["Retire", "retireA", "retireB", async () => {
        this.setMenuSpritesVisible(false);
        if (await pbConfirmMessage(_INTL("Would you like to leave the Safari Game right now?"))) {
          this.done = true;
          pbSafariState().decision = 1;
          await pbSafariState().pbGoToStart?.();
        }
        this.setMenuSpritesVisible(true);
      }]);
    }

    // Retire: Bug-Catching Contest
    if (pbInBugContest()) {
      this.options.push(["Retire", "retireA", "retireB", async () => {
        this.setMenuSpritesVisible(false);
        if (await pbConfirmMessage(_INTL("Would you like to end the Contest now?"))) {
          this.done = true;
          await pbBugContestState().pbStartJudging?.();
          return true;
        }
        this.setMenuSpritesVisible(true);
        return undefined;
      }]);
    }

    // Pokedex
    if (player?.hasPokedex) {
      this.options.push(["Pokédex", "pokedexA", "pokedexB", async () => {
        const dexes = accessibleDexes();
        if (USE_CURRENT_REGION_DEX) {
          await openScreen(MenuScreens.pokedex);
        } else if (dexes.length === 1) {
          if (!MenuScreens.pokedex) return pbPlayBuzzerSE();
          menuGlobals().pokedexDex = dexes[0];
          await openScreen(MenuScreens.pokedex);
        } else {
          await openScreen(MenuScreens.pokedexMenu);
        }
      }]);
    }

    // Party Menu
    if ((player?.party?.length ?? 0) > 0) {
      this.options.push(["Pokémon", "pokemonA", "pokemonB", async () => {
        const party = MenuScreens.party;
        if (!party) return pbPlayBuzzerSE();
        const ret: { hiddenmove: HiddenMoveChoice | null } = { hiddenmove: null };
        await pbFadeOutIn(async () => {
          ret.hiddenmove = await party();
          if (ret.hiddenmove) {
            this.setMenuSpritesVisible(false);
            this.done = true;
          }
        });
        if (ret.hiddenmove) {
          G.gameTemp.inMenu = false;
          const [pkmn, move] = ret.hiddenmove;
          await FieldActions.useHiddenMove?.(pkmn, move);
        }
      }]);
    }

    // Bag
    if (!pbInBugContest()) {
      this.options.push(["Bag", "bagA", "bagB", async () => {
        const bag = MenuScreens.bag;
        if (!bag) return pbPlayBuzzerSE();
        const ret: { item: string | null } = { item: null };
        await pbFadeOutIn(async () => {
          ret.item = await bag();
        });
        const item = ret.item;
        if (!item) return false;
        G.gameTemp.inMenu = false;
        await FieldActions.useKeyItemInField?.(item);
        return true;
      }]);
    }

    // Add Pokegear
    if (player?.hasPokegear) {
      this.options.push(["Pokégear", "pokegearA", "pokegearB", async () => {
        const pokegear = MenuScreens.pokegear;
        if (!pokegear) return pbPlayBuzzerSE();
        await pbFadeOutIn(async () => {
          await pokegear();
          if (flyTemp().flyDestination) this.done = true;
          else this.setMenuSpritesVisible(true);
        });
        return (await FieldActions.flyToNewLocation?.()) ?? false;
      }]);
    }

    // Town Map
    if (!player?.hasPokegear && bagHas("TOWNMAP")) {
      this.options.push(["TOWN MAP", "townMapA", "townMapB", async () => {
        const townMap = MenuScreens.townMap;
        if (!townMap) return pbPlayBuzzerSE();
        await pbFadeOutIn(async () => {
          await townMap();
          if (flyTemp().flyDestination) this.done = true;
          else this.setMenuSpritesVisible(true);
        });
        return (await FieldActions.flyToNewLocation?.()) ?? false;
      }]);
    }

    // Trainer Card
    this.options.push([player?.name ?? "", "PlayercardA", "PlayercardB", async () => {
      await openScreen(MenuScreens.trainerCard);
    }]);

    // Save Game (same approach as default pause menu: hide menu, open save without fade)
    if (G.gameSystem && !G.gameSystem.saveDisabled && !pbInSafari() && !pbInBugContest()) {
      this.options.push(["Save", "saveA", "saveB", async () => {
        this.setMenuSpritesVisible(false);
        // PluginManager.installed?("HGSS Multi-Save") is false in this game.
        if (await pbSaveScreen()) this.done = true;
        if (!this.done) this.setMenuSpritesVisible(true);
      }]);
    }

    // Options
    this.options.push(["Options", "optionsA", "optionsB", async () => {
      await pbFadeOutIn(async () => {
        const scene = new PokemonOption_Scene();
        const screen = new PokemonOptionScreen(scene);
        await screen.pbStartScreen();
        await pbUpdateSceneMap();
      });
    }]);

    // Debug (no icon; same condition as default pause menu)
    if (MenuFlags.DEBUG) {
      this.options.push(["DEBUG", "", "", async () => {
        await openScreen(MenuScreens.debugMenu);
      }]);
    }

    // Exit / Quit (commented out in the plugin)
    if (QUIT_OPTION_ENABLED && !pbInSafari() && !pbInBugContest()) {
      this.options.push(["QUIT GAME", "exitA", "exitB", async () => {
        this.setMenuSpritesVisible(false);
        if (await pbConfirmMessage(_INTL("Are you sure you want to quit the game?"))) {
          SaveData.markValuesAsUnloaded();
          pbBGMFade(1.0);
          pbBGSFade(1.0);
          this.done = true;
          G.scene = null; // $scene = pbCallTitle (main.ts goes back to the title)
        }
        this.setMenuSpritesVisible(true);
      }]);
    }

    // End @options

    this.count = this.options.length;
    if (this.count === 0) return;
    const globals = menuGlobals();
    globals.lastMenuIndex ||= 0;
    this.option = globals.lastMenuIndex;
    if (this.option >= this.options.length) this.option = 0;
    this.done = false;
    this.i = 0;
    this.scaling = 0;

    await preloadBitmaps([
      "bgTop", "bgMid", "bgBtm", "selector",
      ...this.options.flatMap((o) => [o[1], o[2]]).filter((p) => p !== ""),
    ].map((p) => UI + p));

    this.viewport = new Viewport(Graphics.width - 204, 4, 200, 24 + 48 * this.count);
    this.viewport.z = 99999;
    this.sprites = {};
    const bgTop = new IconSprite(0, 0, this.viewport);
    bgTop.setBitmapFile(UI + "bgTop");
    this.sprites.bgTop = bgTop;
    const bgMid = new IconSprite(0, 0, this.viewport);
    bgMid.setBitmapFile(UI + "bgMid");
    bgMid.y = 12;
    bgMid.zoomY = 48 * this.count;
    this.sprites.bgMid = bgMid;
    const bgBtm = new IconSprite(0, 0, this.viewport);
    bgBtm.setBitmapFile(UI + "bgBtm");
    bgBtm.y = 12 + 48 * this.count;
    this.sprites.bgBtm = bgBtm;
    const sel = new IconSprite(8, 10 + 48 * this.option, this.viewport);
    sel.setBitmapFile(UI + "selector");
    sel.z = 1;
    this.sprites.sel = sel;
    const menuHeight = 24 + 48 * this.count;
    const txt = new BitmapSprite(200, menuHeight, this.viewport);
    this.sprites.txt = txt;
    pbSetSystemFont(txt.bitmap!);
    const textpos: TextPosition[] = [];
    this.options.forEach((o, i) => {
      textpos.push([o[0], 72, 26 + 48 * i, 0, DP_PauseMenu.BaseColor, DP_PauseMenu.ShadowColor]);
    });
    pbDrawTextPositions(txt.bitmap!, textpos);
    this.options.forEach((o, i) => {
      const icon = new IconSprite(0, 0, this.viewport);
      this.sprites[o[0]] = icon;
      const path = o[i === this.option ? 2 : 1];
      if (path) this.setIconBitmap(icon, path);
      icon.x = 39;
      icon.y = 36 + 48 * i;
    });
    pbSEPlay("GUI menu open");
    await this.main();
  }

  private setIconBitmap(icon: IconSprite, path: string): void {
    icon.setBitmapFile(UI + path);
    if (icon.bitmap) {
      icon.ox = Math.floor(icon.bitmap.width / 2);
      icon.oy = Math.floor(icon.bitmap.height / 2);
    }
  }

  private icon(index: number): MenuSprite {
    return this.sprites[this.options[index]![0]]!;
  }

  async main(): Promise<void> {
    let changed = false;
    for (;;) {
      await this.update();
      const old = this.option;
      if (Input.repeat(Input.DOWN)) {
        this.option += 1;
        if (this.option === this.count) this.option = 0;
        changed = true;
      }
      if (Input.repeat(Input.UP)) {
        this.option -= 1;
        if (this.option === -1) this.option = this.count - 1;
        changed = true;
      }
      // (`if $mouse` hover/click, DP Pause Menu/Script.rb:300-309: $mouse is
      // always nil in this game, so the mouse doesn't drive this menu.)
      let confirmed = Input.trigger(Input.C);
      if (changed) {
        pbPlayCursorSE();
        menuGlobals().lastMenuIndex = this.option;
        const oldIcon = this.icon(old) as IconSprite;
        const oldPath = this.options[old]![1];
        if (oldPath) this.setIconBitmap(oldIcon, oldPath);
        oldIcon.angle = 0;
        oldIcon.zoomX = 1;
        oldIcon.zoomY = 1;
        this.sprites.sel!.y = 10 + 48 * this.option;
        const path = this.options[this.option]![2];
        if (path) this.setIconBitmap(this.icon(this.option) as IconSprite, path);
        changed = false;
        this.scaling = 0;
      }
      if (confirmed) {
        pbPlayDecisionSE();
        await this.options[this.option]![3]();
        Input.update();
      }
      confirmed = false;
      if (this.done) {
        break;
      } else if (Input.trigger(Input.B)) {
        pbPlayCancelSE();
        break;
      }
    }
    this.dispose();
  }

  async update(): Promise<void> {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
    // Ruby advances the animation once per (40 fps) frame.
    for (let n = this.clock.tick(); n > 0; n--) this.animate();
  }

  private animate(): void {
    const icon = this.icon(this.option);
    if (this.scaling !== null) {
      this.scaling += 1;
      if (this.scaling >= 1 && this.scaling <= 4) {
        icon.zoomX += 0.05;
        icon.zoomY += 0.05;
      } else if (this.scaling >= 8 && this.scaling <= 12) {
        icon.zoomX -= 0.05;
        icon.zoomY -= 0.05;
      }
      if (this.scaling === 12) this.scaling = null;
    } else {
      this.i += 1;
      if (this.i >= 1 && this.i <= 6) icon.angle -= 2;
      else if (this.i >= 7 && this.i <= 18) icon.angle += 2;
      else if (this.i >= 19 && this.i <= 24) icon.angle -= 2;
      if (this.i === 24) this.i = 0;
    }
  }

  dispose(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
    Input.update();
  }
}

/** Opens a registered screen inside pbFadeOutIn, or plays the buzzer. */
async function openScreen(screen: (() => Promise<unknown>) | undefined): Promise<void> {
  if (!screen) return pbPlayBuzzerSE();
  await pbFadeOutIn(async () => {
    await screen();
  });
}

function accessibleDexes(): number[] {
  const d = menuPlayer()?.pokedex?.accessibleDexes;
  const list = typeof d === "function" ? d.call(menuPlayer()!.pokedex) : d;
  return list ?? [];
}
