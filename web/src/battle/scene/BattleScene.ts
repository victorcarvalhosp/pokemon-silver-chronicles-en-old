// Port of Battle::Scene, Data/Scripts/011_Battle/004_Scene/:
//   001_Battle_Scene.rb       constants, positions, updating, messages, phases
//   002_Scene_Initialize.rb   pbStartBattle, pbInitSprites, backdrop/trainers/Pokémon
//   003_Scene_ChooseCommands.rb  command/fight/target menus, party/bag screens
//   004_Scene_PlayAnimations.rb  intro, send-out, HP/Exp bars, faint, capture,
//                                ability splash, move/common animations
// with the plugin changes this game loads, in plugin load order
// (Data/PluginScripts.rxdata):
//   01 Generation 9 Pack ([001] Battle/[001] Battle.rb:306-361): pbPartyScreen
//      ("Select" for Revival Blessing), pbCommonAnimation (Commander).
//   29 Essentials Deluxe: pbChangePokemon (Dynamax sprites), pbCommonAnimationExists?,
//      pbRevertBattlerStart/End, battler icons in pbInitSprites
//      ([000] Battle_Scene.rb:48-147); pbCommandMenuEx ([000] Battle.rb:320-366);
//      the revamped pbFightMenu and its helpers ([000] Fight Menu.rb:307-605);
//      midbattle speech sprites/windows, pbBattlerFlee, pbFlashRefresh
//      ([002] Battle Deluxe/Battle_Scene.rb:180-355; Midbattle_Triggers.rb:10-21).
//   30 ZUD Mechanics: pbAnimationCore keeps Dynamax zoom ([005] Battle_Scene/Scene.rb),
//      pbFaintBattler reverts Dynamax ([003] Battle/Battle_Overrides.rb:296-305),
//      the Z-Move/Ultra Burst/Dynamax fight menu toggles.
//   34 Enhanced UI ([002] Battle UI.rb:27-71): the (hidden) move/battle info sprites.
//
// Essentials Deluxe's midbattle scripting (pbDeluxeTriggers, dx_midbattle), the
// Mega/Primal cinematics and Enhanced UI's Move Info / Battle Info windows are
// in web/src/battle/deluxe, which installs them on this class.
// ZUD's Dynamax/Z-Move/Ultra Burst cinematics are in web/src/battle/zud/scene,
// which installs them on this class the same way.
// Not ported (see the report): ZUD's Max Raid cinematics,
// Generation 9 Pack's pbArceusTransform, the debug menu (F9).
//
// Every loop that calls Graphics.update in Ruby awaits it here, so the scene's
// methods are async. Timing: Ruby counts frames at Graphics.frame_rate (40);
// here they count 60 Hz ticks with the same constants scaled by FRAME_RATE = 60
// (e.g. @frameCounter wraps at frame_rate * 12 / 20), so durations in seconds
// match. Messages wait MESSAGE_PAUSE_TIME seconds using Graphics.deltaS.
//
// Graphics are loaded ahead (pbStartBattle preloads the backdrop, UI, trainers,
// both parties' sprites and balls; animations preload their sheets), because
// IconSprite/AnimatedBitmap read them synchronously, as in Ruby.

import { assetExists } from "../../core/assets";
import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Metadata } from "../../data/gameData/metadata";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { SpeciesMetrics } from "../../data/gameData/speciesMetrics";
import { Target } from "../../data/gameData/target";
import { TrainerType } from "../../data/gameData/trainerType";
import { Type } from "../../data/gameData/type";
import { FRAME_RATE } from "../../game/GameCharacter";
import {
  pbBGMFade, pbBGMPlay, pbMEPlay, pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay, type AudioParam,
} from "../../game/GameSystem";
import { G } from "../../game/globals";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { mapMetadata } from "../../game/metadata";
import { Audio } from "../../rgss/Audio";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { KeyboardInput } from "../../ui/textEntry/keyboard";
import { Color, Tone } from "../../rgss/types";
import { PokemonBag_Scene } from "../../ui/bag/bag";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../../ui/fades";
import { _INTL, pbDisposeSpriteHash, pbSetSmallFont, Settings as UISettings } from "../../ui/messageConfig";
import { pbStringToAudioFile } from "../../ui/messages";
import { PokemonParty_Scene, PokemonPartyScreen } from "../../ui/party/party";
import { AnimatedPlane } from "../../ui/planes";
import { preloadBitmaps } from "../../ui/rpgCache";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { AnimatedSprite, BitmapSprite, IconSprite } from "../../ui/SpriteWrapper";
import { PokemonIconSprite, preloadPokemonIcons } from "../../ui/sprites/pokemonIcon";
import { PokemonSprite } from "../../ui/sprites/pokemonSprite";
import { Window_AdvancedTextPokemon, Window_CommandPokemon } from "../../ui/windows/SpriteWindowText";
import type { IBattleScene } from "../BattleSceneInterface";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { AnimationDxHooks, ballGraphics, BURST_GRAPHICS, type Animation as SceneAnimation } from "./animationBase";
import {
  FOCUSTARGET_X, FOCUSTARGET_Y, FOCUSUSER_X, FOCUSUSER_Y, PBAnimationPlayerX, pbLoadBattleAnimations, pbLoadMoveToAnim,
  preloadAnimationGraphics, preloadBattleAnimations, type MoveToAnim, type PBAnimation,
} from "./animationPlayer";
import {
  AbilitySplashAppear, AbilitySplashDisappear, AnimationHooks, BattlerDamage, BattlerFaint, BattlerFlee, BattlerRecall,
  DataBoxAppear, DataBoxDisappear, Intro, Intro2, LineupAppear, PlayerFade, PokeballPlayerSendOut, PokeballThrowCapture,
  PokeballThrowDeflect, PokeballTrainerSendOut, RevertBattlerEnd, RevertBattlerStart, SlideSpriteAppear,
  SlideSpriteDisappear, ToggleBlackBars, ToggleDataBoxes, TrainerAppear, TrainerFade,
} from "./animations";
import { CommandMenu, FightMenu, MENU_GRAPHICS, MESSAGE_BASE_COLOR, MESSAGE_SHADOW_COLOR, TargetMenu, type BattleButton } from "./menus";
import {
  AbilitySplashBar, BattlerShadowSprite, BattlerSprite, battlerBitmapRequest, OBJECT_GRAPHICS, PokemonDataBox,
  setBattlerPositionFunction,
} from "./objects";
import { preloadCryLength, shadowFilenameFromPokemon } from "./sceneFiles";
import { pbHideBattleInfo, pbHideFocusPanel, pbHideMoveInfo } from "./pluginUI";
import type { SceneBattle, SceneBattler, SceneMove } from "./types";

const SCREEN_W = 512;
const SCREEN_H = 384;

/** Essentials Deluxe's fight menu return values (module DXTriggers). */
export const DXTriggers = {
  MENU_TRIGGER_CANCEL: -1,
  MENU_TRIGGER_SHIFT_BATTLER: -2,
  MENU_TRIGGER_MEGA_EVOLUTION: -3,
  MENU_TRIGGER_Z_MOVE: -4,
  MENU_TRIGGER_ULTRA_BURST: -5,
  MENU_TRIGGER_DYNAMAX: -6,
  MENU_TRIGGER_BATTLE_STYLE: -7,
  MENU_TRIGGER_TERASTALLIZE: -8,
  MENU_TRIGGER_ZODIAC_POWER: -9,
  MENU_TRIGGER_CUSTOM_MECHANIC: -10,
  MENU_TRIGGER_FOCUS_METER: -11,
} as const;

/** Things outside the battle scene it consults (set by the integrator). */
export const BattleSceneHooks: {
  /** pbInSafari? */
  inSafari: () => boolean;
  /** $DEBUG (F9 opens the battle debug menu) */
  debug: () => boolean;
} = {
  inSafari: () => false,
  debug: () => false,
};

type MaybePromise<T> = T | Promise<T>;
export type FightMenuBlock = (cmd: number) => MaybePromise<boolean>;
/** The party/Bag screen (or this scene) a party/item callback gets: it can show messages. */
export interface BattleSubScene { pbDisplay(msg: string): Promise<void> }
export type PartyScreenBlock = (idxParty: number, partyScreen: BattleSubScene | null) => MaybePromise<boolean>;
export type ItemMenuBlock = (item: Id, useType: number, idxPokemon: number, idxMove: number, scene: BattleSubScene | null) => MaybePromise<boolean>;

/** pbResolveBitmap against the asset index (Ruby checks the file system synchronously). */
function resolveBitmap(path: string): string | null {
  return assetExists(path) ? path : null;
}

//===============================================================================
// Battle audio (019_Utilities/003_Utilities_BattleAudio.rb)
//===============================================================================
function audioFromMetadata(mapKey: "wildVictoryBGM" | "trainerVictoryBGM" | "wildCaptureME", fallback: string): AudioParam {
  let music = G.gameMap ? (mapMetadata(G.gameMap.mapId)?.[mapKey] as string | undefined) : undefined;
  if (music) return pbStringToAudioFile(music);
  music = Metadata.get()[mapKey] ?? undefined;
  if (music) return pbStringToAudioFile(music);
  return pbStringToAudioFile(fallback);
}

/** pbGetWildVictoryBGM */
export function pbGetWildVictoryBGM(): AudioParam {
  return audioFromMetadata("wildVictoryBGM", "Battle victory");
}

/** pbGetWildCaptureME */
export function pbGetWildCaptureME(): AudioParam {
  return audioFromMetadata("wildCaptureME", "Battle capture success");
}

/** pbGetTrainerVictoryBGM(trainer) */
export function pbGetTrainerVictoryBGM(trainer: { trainerType: Id } | { trainerType: Id }[] | null): AudioParam {
  let music: string | null = null;
  for (const t of Array.isArray(trainer) ? trainer : trainer ? [trainer] : []) {
    const data = TrainerType.get(t.trainerType);
    if (data.victoryBGM) music = data.victoryBGM;
  }
  if (music) return pbStringToAudioFile(music);
  return audioFromMetadata("trainerVictoryBGM", "Battle victory");
}

/** pbTopRightWindow(text, scene = nil) (013_Items/001_Item_Utilities.rb) */
export async function pbTopRightWindow(text: string, scene: { pbUpdate(): void } | null = null): Promise<void> {
  const window = new Window_AdvancedTextPokemon(text);
  window.width = 198;
  window.x = SCREEN_W - window.width;
  window.y = 0;
  window.z = 99999;
  pbPlayDecisionSE();
  for (;;) {
    await Graphics.update();
    Input.update();
    window.update();
    scene?.pbUpdate();
    if (Input.trigger(Input.USE)) break;
  }
  window.dispose();
}

//===============================================================================
// Battle scene (the visuals of the battle)
//===============================================================================
export class BattleScene implements IBattleScene {
  static readonly USE_ABILITY_SPLASH = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 5;
  static readonly MESSAGE_PAUSE_TIME = 1.0; // In seconds
  // Text colors
  static readonly MESSAGE_BASE_COLOR = MESSAGE_BASE_COLOR;
  static readonly MESSAGE_SHADOW_COLOR = MESSAGE_SHADOW_COLOR;
  /** The number of party balls to show in each side's lineup. */
  static readonly NUM_BALLS = Settings.MAX_PARTY_SIZE;
  /** Centre bottom of the player's side base graphic */
  static readonly PLAYER_BASE_X = 128;
  static readonly PLAYER_BASE_Y = SCREEN_H - 80;
  /** Centre middle of the foe's side base graphic */
  static readonly FOE_BASE_X = SCREEN_W - 98;
  static readonly FOE_BASE_Y = Math.floor((SCREEN_H * 3) / 4) - 170;
  // Default focal points of user and target in animations - do not change!
  // Is the centre middle of each sprite
  static readonly FOCUSUSER_X = FOCUSUSER_X;
  static readonly FOCUSUSER_Y = FOCUSUSER_Y;
  static readonly FOCUSTARGET_X = FOCUSTARGET_X;
  static readonly FOCUSTARGET_Y = FOCUSTARGET_Y;
  // Menu types
  static readonly BLANK = 0;
  static readonly MESSAGE_BOX = 1;
  static readonly COMMAND_BOX = 2;
  static readonly FIGHT_BOX = 3;
  static readonly TARGET_BOX = 4;

  /** For non-interactive battles, can quit immediately */
  abortable = false;
  viewport!: Viewport;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprites: Record<string, any> = {};
  /** Essentials Deluxe: a guest speaker is on screen. */
  guestSpeaker = false;
  battle: SceneBattle | null = null;
  private aborted = false;
  private battleEnd = false;
  private animations: { update(): void; animDone(): boolean; dispose(): void }[] = [];
  private frameCounter = 0;
  private lastCmd: number[] = [];
  private lastMove: number[] = [];
  private briefMessage = false;
  private bagLastPocket: number | null = null;
  private bagChoices: number[] = [];
  // Essentials Deluxe midbattle state (Midbattle_Triggers.rb:13-20); the
  // midbattle methods (pbDeluxeTriggers, dx_midbattle) are installed by
  // web/src/battle/deluxe.
  midbattleVar = 0;
  midbattleChoice: unknown = null;
  midbattleDecision = 0;
  midbattleDelay: string[] = [];
  midbattleIgnore: string[] = [];
  namePanelName: string | null = null;
  namePanelSkin: unknown = null;
  // Enhanced UI
  moveUIToggle = false;
  infoUIToggle = false;
  focusToggle: boolean | undefined = undefined;

  /**
   * Returns where the centre bottom of a battler's sprite should be, given its
   * index and the number of battlers on its side, assuming the battler has
   * metrics of 0 (those are added later).
   */
  static pbBattlerPosition(index: number, sideSize = 1): [number, number] {
    // Start at the centre of the base for the appropriate side
    const ret: [number, number] = (index & 1) === 0
      ? [BattleScene.PLAYER_BASE_X, BattleScene.PLAYER_BASE_Y]
      : [BattleScene.FOE_BASE_X, BattleScene.FOE_BASE_Y];
    // Shift depending on index (no shifting needed for sideSize of 1)
    switch (sideSize) {
      case 2:
        ret[0] += [-48, 48, 32, -32][index] ?? 0;
        ret[1] += [0, 0, 16, -16][index] ?? 0;
        break;
      case 3:
        ret[0] += [-80, 80, 0, 0, 80, -80][index] ?? 0;
        ret[1] += [0, 0, 8, -8, 16, -16][index] ?? 0;
        break;
    }
    return ret;
  }

  /**
   * Returns where the centre bottom of a trainer's sprite should be, given its
   * side (0/1), index and the number of trainers on its side.
   */
  static pbTrainerPosition(side: number, index = 0, sideSize = 1): [number, number] {
    // Start at the centre of the base for the appropriate side
    const ret: [number, number] = side === 0
      ? [BattleScene.PLAYER_BASE_X, BattleScene.PLAYER_BASE_Y - 16]
      : [BattleScene.FOE_BASE_X, BattleScene.FOE_BASE_Y + 6];
    // Shift depending on index (no shifting needed for sideSize of 1)
    switch (sideSize) {
      case 2:
        ret[0] += [-48, 48, 32, -32][2 * index + side] ?? 0;
        ret[1] += [0, 0, 0, -16][2 * index + side] ?? 0;
        break;
      case 3:
        ret[0] += [-80, 80, 0, 0, 80, -80][2 * index + side] ?? 0;
        ret[1] += [0, 0, 0, -8, 0, -16][2 * index + side] ?? 0;
        break;
    }
    return ret;
  }

  private get b(): SceneBattle { return this.battle!; }

  //=============================================================================
  // Updating and refreshing
  //=============================================================================
  async pbUpdate(cw: { update(): void } | null = null): Promise<void> {
    await this.pbGraphicsUpdate();
    this.pbInputUpdate();
    this.pbFrameUpdate(cw);
  }

  async pbGraphicsUpdate(): Promise<void> {
    // Update lineup animations
    if (this.animations.length > 0) {
      let shouldCompact = false;
      this.animations.forEach((a, i) => {
        a.update();
        if (!a.animDone()) return;
        a.dispose();
        (this.animations as unknown[])[i] = null;
        shouldCompact = true;
      });
      if (shouldCompact) this.animations = this.animations.filter((a) => a);
    }
    // Update other graphics
    this.sprites.battle_bg?.update?.();
    await Graphics.update();
    this.frameCounter += 1;
    this.frameCounter = this.frameCounter % Math.floor((FRAME_RATE * 12) / 20);
  }

  pbInputUpdate(): void {
    Input.update();
    KeyboardInput.update(); // Input.triggerex? (Enhanced UI's M/N keys)
    if (Input.trigger(Input.BACK) && this.abortable && !this.aborted) {
      this.aborted = true;
      this.b.pbAbort();
    }
  }

  pbFrameUpdate(cw: { update(): void } | null = null): void {
    cw?.update();
    this.b.battlers.forEach((bt, i) => {
      if (!bt) return;
      this.sprites[`dataBox_${i}`]?.update(this.frameCounter);
      this.sprites[`pokemon_${i}`]?.update(this.frameCounter);
      this.sprites[`shadow_${i}`]?.update(this.frameCounter);
    });
  }

  pbRefresh(): void {
    this.b.battlers.forEach((bt, i) => {
      if (!bt) return;
      this.sprites[`dataBox_${i}`]?.refresh();
    });
  }

  pbRefreshOne(idxBattler: number): void {
    this.sprites[`dataBox_${idxBattler}`]?.refresh();
  }

  pbRefreshEverything(): void {
    this.pbCreateBackdropSprites();
    this.b.battlers.forEach((battler, i) => {
      if (!battler) return;
      void this.pbChangePokemon(i, this.sprites[`pokemon_${i}`].pkmn);
      this.sprites[`dataBox_${i}`].initializeDataBoxGraphic(this.b.pbSideSize(i));
      this.sprites[`dataBox_${i}`].refresh();
    });
  }

  //=============================================================================
  // Party lineup
  //=============================================================================
  /** Returns whether the party line-ups are currently coming on-screen */
  inPartyAnimation(): boolean {
    return this.animations.length > 0;
  }

  //=============================================================================
  // Window displays
  //=============================================================================
  pbShowWindow(windowType: number): void {
    // NOTE: If you are not using fancy graphics for the command/fight menus, you
    //       will need to make "messageBox" also visible if the windowtype if
    //       COMMAND_BOX/FIGHT_BOX respectively.
    this.sprites.messageBox.visible = windowType === BattleScene.MESSAGE_BOX;
    this.sprites.messageWindow.visible = windowType === BattleScene.MESSAGE_BOX;
    this.sprites.commandWindow.visible = windowType === BattleScene.COMMAND_BOX;
    this.sprites.fightWindow.visible = windowType === BattleScene.FIGHT_BOX;
    this.sprites.targetWindow.visible = windowType === BattleScene.TARGET_BOX;
  }

  /**
   * This is for the end of brief messages, which have been lingering on-screen
   * while other things happened. This is only called when another message wants
   * to be shown, and makes the brief message linger for one more second first.
   * Some animations skip this extra second by setting @briefMessage to false
   * despite not having any other messages to show.
   */
  async pbWaitMessage(): Promise<void> {
    if (!this.briefMessage) return;
    this.pbShowWindow(BattleScene.MESSAGE_BOX);
    const cw: Window_AdvancedTextPokemon = this.sprites.messageWindow;
    let timer = 0.0;
    while (timer < BattleScene.MESSAGE_PAUSE_TIME) {
      await this.pbUpdate(cw);
      timer += Graphics.deltaS;
    }
    cw.text = "";
    cw.visible = false;
    this.briefMessage = false;
  }

  /**
   * NOTE: A regular message is displayed for 1 second after it fully appears (or
   *       less if Back/Use is pressed). Disappears automatically after that time.
   * The block runs once the message is all shown (for playing SE).
   */
  async pbDisplayMessage(msg: string, brief = false, block?: () => MaybePromise<void>): Promise<void> {
    await this.pbWaitMessage();
    this.pbShowWindow(BattleScene.MESSAGE_BOX);
    const cw: Window_AdvancedTextPokemon = this.sprites.messageWindow;
    cw.setText(msg);
    PBDebug.log(msg);
    let yielded = false;
    let timer = 0.0;
    for (;;) {
      await this.pbUpdate(cw);
      if (!cw.busy()) {
        if (!yielded) {
          if (block) await block(); // For playing SE as soon as the message is all shown
          yielded = true;
        }
        if (brief) {
          // NOTE: A brief message lingers on-screen while other things happen. A
          //       regular message has to end before the game can continue.
          this.briefMessage = true;
          break;
        }
        if (timer >= BattleScene.MESSAGE_PAUSE_TIME) { // Autoclose after 1 second
          cw.text = "";
          cw.visible = false;
          break;
        }
        timer += Graphics.deltaS;
      }
      if (Input.trigger(Input.BACK) || Input.trigger(Input.USE) || this.abortable) {
        if (cw.busy()) {
          if (cw.pausing() && !this.abortable) pbPlayDecisionSE();
          cw.skipAhead();
        } else if (!this.abortable) {
          cw.text = "";
          cw.visible = false;
          break;
        }
      }
    }
  }

  /** alias pbDisplay pbDisplayMessage */
  pbDisplay(msg: string, brief = false, block?: () => MaybePromise<void>): Promise<void> {
    return this.pbDisplayMessage(msg, brief, block);
  }

  /**
   * NOTE: A paused message has the arrow in the bottom corner indicating there
   *       is another message immediately afterward. It is displayed for 3
   *       seconds after it fully appears (or less if B/C is pressed) and
   *       disappears automatically after that time, except at the end of battle.
   */
  async pbDisplayPausedMessage(msg: string, block?: () => MaybePromise<void>): Promise<void> {
    await this.pbWaitMessage();
    this.pbShowWindow(BattleScene.MESSAGE_BOX);
    const cw: Window_AdvancedTextPokemon = this.sprites.messageWindow;
    cw.text = _INTL("{1}\x01", msg);
    PBDebug.log(msg);
    let yielded = false;
    let timer = 0.0;
    for (;;) {
      await this.pbUpdate(cw);
      if (!cw.busy()) {
        if (!yielded) {
          if (block) await block(); // For playing SE as soon as the message is all shown
          yielded = true;
        }
        if (!this.battleEnd) {
          if (timer >= BattleScene.MESSAGE_PAUSE_TIME * 3) { // Autoclose after 3 seconds
            cw.text = "";
            cw.visible = false;
            break;
          }
          timer += Graphics.deltaS;
        }
      }
      if (Input.trigger(Input.BACK) || Input.trigger(Input.USE) || this.abortable) {
        if (cw.busy()) {
          if (cw.pausing() && !this.abortable) pbPlayDecisionSE();
          cw.skipAhead();
        } else if (!this.abortable) {
          cw.text = "";
          pbPlayDecisionSE();
          break;
        }
      }
    }
  }

  async pbDisplayConfirmMessage(msg: string): Promise<boolean> {
    return (await this.pbShowCommands(msg, [_INTL("Yes"), _INTL("No")], 1)) === 0;
  }

  async pbShowCommands(msg: string, commands: string[], defaultValue: number): Promise<number> {
    await this.pbWaitMessage();
    this.pbShowWindow(BattleScene.MESSAGE_BOX);
    const dw: Window_AdvancedTextPokemon = this.sprites.messageWindow;
    dw.text = msg;
    const cw = new Window_CommandPokemon(commands);
    if (cw.height > SCREEN_H - dw.height) cw.height = SCREEN_H - dw.height;
    cw.x = SCREEN_W - cw.width;
    cw.y = SCREEN_H - cw.height - dw.height;
    cw.z = dw.z + 1;
    cw.index = 0;
    cw.viewport = this.viewport;
    PBDebug.log(msg);
    for (;;) {
      cw.visible = !dw.busy();
      await this.pbUpdate(cw);
      dw.update();
      if (Input.trigger(Input.BACK) && defaultValue >= 0) {
        if (dw.busy()) {
          if (dw.pausing()) pbPlayDecisionSE();
          dw.resume();
        } else {
          cw.dispose();
          dw.text = "";
          return defaultValue;
        }
      } else if (Input.trigger(Input.USE)) {
        if (dw.busy()) {
          if (dw.pausing()) pbPlayDecisionSE();
          dw.resume();
        } else {
          cw.dispose();
          dw.text = "";
          return cw.index;
        }
      }
    }
  }

  //=============================================================================
  // Sprites
  //=============================================================================
  pbAddSprite(id: string, x: number, y: number, filename: string | null, viewport: Viewport | null): IconSprite {
    const sprite: IconSprite = this.sprites[id] ?? new IconSprite(x, y, viewport);
    // `sprite.setBitmap(filename) rescue nil`: a missing file leaves no bitmap.
    if (filename && resolveBitmap(filename)) sprite.setBitmapFile(filename);
    this.sprites[id] = sprite;
    return sprite;
  }

  pbAddPlane(id: string, filename: string | null, viewport: Viewport | null): AnimatedPlane {
    const sprite = new AnimatedPlane(viewport);
    if (filename) sprite.setBitmap(filename);
    this.sprites[id] = sprite;
    return sprite;
  }

  pbDisposeSprites(): void {
    pbDisposeSpriteHash(this.sprites);
  }

  /** Used by Ally Switch. */
  pbSwapBattlerSprites(idxA: number, idxB: number): void {
    const s = this.sprites;
    [s[`pokemon_${idxA}`], s[`pokemon_${idxB}`]] = [s[`pokemon_${idxB}`], s[`pokemon_${idxA}`]];
    [s[`shadow_${idxA}`], s[`shadow_${idxB}`]] = [s[`shadow_${idxB}`], s[`shadow_${idxA}`]];
    [this.lastCmd[idxA], this.lastCmd[idxB]] = [this.lastCmd[idxB]!, this.lastCmd[idxA]!];
    [this.lastMove[idxA], this.lastMove[idxB]] = [this.lastMove[idxB]!, this.lastMove[idxA]!];
    for (const i of [idxA, idxB]) {
      s[`pokemon_${i}`].index = i;
      s[`pokemon_${i}`].pbSetPosition();
      s[`shadow_${i}`].index = i;
      s[`shadow_${i}`].pbSetPosition();
      s[`dataBox_${i}`].battler = this.b.battlers[i];
    }
    this.pbRefresh();
  }

  //=============================================================================
  // Phases
  //=============================================================================
  async pbBeginCommandPhase(): Promise<void> {
    this.sprites.messageWindow.text = "";
  }

  async pbBeginAttackPhase(): Promise<void> {
    this.pbSelectBattler(-1);
    this.pbShowWindow(BattleScene.MESSAGE_BOX);
  }

  async pbBeginEndOfRoundPhase(): Promise<void> {}

  /**
   * Not a Ruby method: the battle code's fixed waits such as
   * `Graphics.frame_rate.times { @scene.pbUpdate }` (BattleSceneInterface).
   */
  async pbWaitSeconds(seconds: number): Promise<void> {
    let timer = 0.0;
    while (timer < seconds) {
      await this.pbUpdate();
      timer += Graphics.deltaS;
    }
  }

  async pbEndBattle(_result: number): Promise<void> {
    this.abortable = false;
    this.pbShowWindow(BattleScene.BLANK);
    // Fade out all sprites
    pbBGMFade(1.0);
    await pbFadeOutAndHide(this.sprites);
    this.pbDisposeSprites();
    this.viewport?.dispose();
  }

  //=============================================================================
  //
  //=============================================================================
  pbSelectBattler(idxBattler: number | (unknown | null)[], selectMode = 1): void {
    const numWindows = Math.max(...this.b.sideSizes) * 2;
    for (let i = 0; i < numWindows; i++) {
      const sel = Array.isArray(idxBattler) ? idxBattler[i] != null : i === idxBattler;
      const selVal = sel ? selectMode : 0;
      if (this.sprites[`dataBox_${i}`]) this.sprites[`dataBox_${i}`].selected = selVal;
      if (this.sprites[`pokemon_${i}`]) this.sprites[`pokemon_${i}`].selected = selVal;
    }
  }

  /**
   * Essentials Deluxe's version (Dynamax/Gigantamax sprites). The sprites are
   * set at once if their graphics are loaded; the promise resolves when they are.
   */
  pbChangePokemon(idxBattler: number | SceneBattler, pkmn: Pokemon): Promise<void> {
    if (typeof idxBattler !== "number") idxBattler = idxBattler.index;
    const pkmnSprite: BattlerSprite = this.sprites[`pokemon_${idxBattler}`];
    const shadowSprite: BattlerShadowSprite = this.sprites[`shadow_${idxBattler}`];
    const back = !this.b.opposes(idxBattler);
    const battler = this.b.battlers[idxBattler]!;
    let dmax: "none" | "dmax" | "gmax" = "none";
    if (battler.dynamax?.()) {
      dmax = battler.gmaxFactor?.() && (pkmn.hasGmax() || pkmn.gmax) ? "gmax" : "dmax";
    }
    const loads = [pkmnSprite.setPokemonBitmap(pkmn, back, null, dmax), shadowSprite.setPokemonBitmap(pkmn, dmax)];
    if (shadowSprite && !back) shadowSprite.visible = pkmn.speciesData().showsShadow();
    pkmnSprite.applyEffects(battler);
    return Promise.all(loads).then(() => undefined);
  }

  pbResetMoveIndex(idxBattler: number): void {
    this.lastMove[idxBattler] = 0;
  }

  //=============================================================================
  //
  //=============================================================================
  /**
   * This method is called when the player wins a wild Pokémon battle.
   * This method can change the battle's music for example.
   */
  pbWildBattleSuccess(): void {
    this.battleEnd = true;
    pbBGMPlay(pbGetWildVictoryBGM());
  }

  /**
   * This method is called when the player wins a trainer battle.
   * This method can change the battle's music for example.
   */
  pbTrainerBattleSuccess(): void {
    this.battleEnd = true;
    pbBGMPlay(pbGetTrainerVictoryBGM(this.b.opponent));
  }

  //=============================================================================
  // Create the battle scene and its elements (002_Scene_Initialize.rb)
  //=============================================================================
  constructor() {
    setBattlerPositionFunction(BattleScene.pbBattlerPosition);
    AnimationHooks.battlerPosition = BattleScene.pbBattlerPosition;
    AnimationDxHooks.battlerPosition = BattleScene.pbBattlerPosition;
    AnimationHooks.trainerPosition = BattleScene.pbTrainerPosition;
    AnimationHooks.numBalls = BattleScene.NUM_BALLS;
  }

  /** Called whenever the battle begins. */
  async pbStartBattle(battle: SceneBattle): Promise<void> {
    this.battle = battle;
    await this.preloadBattleGraphics();
    this.viewport = new Viewport(0, 0, SCREEN_W, SCREEN_H);
    this.viewport.z = 99999;
    this.lastCmd = new Array(this.b.battlers.length).fill(0);
    this.lastMove = new Array(this.b.battlers.length).fill(0);
    this.pbInitSprites();
    await this.pbBattleIntroAnimation();
  }

  /** Fetches what the scene shows (Ruby loads these synchronously when needed). */
  async preloadBattleGraphics(): Promise<void> {
    const paths = new Set<string>([...OBJECT_GRAPHICS, ...MENU_GRAPHICS, ...BURST_GRAPHICS,
      "Graphics/Pictures/Battle/overlay_message", "Graphics/Pictures/Battle/overlay_lineup",
      "Graphics/Pictures/Battle/icon_ball", "Graphics/Pictures/Battle/icon_ball_empty",
      "Graphics/Pictures/Battle/icon_ball_faint", "Graphics/Pictures/Battle/icon_ball_status",
      "Graphics/Plugins/Enhanced UI/Battle UI/Battle Info/select", "Graphics/Pictures/leftarrow", "Graphics/Pictures/rightarrow",
      "Graphics/Plugins/Essentials Deluxe/Animations/blackbar_top", "Graphics/Plugins/Essentials Deluxe/Animations/blackbar_bottom"]);
    for (const p of this.backdropFilenames()) paths.add(p);
    (this.b.player ?? []).forEach((p, i) => {
      const f = this.trainerBackFilename(i, p.trainerType);
      if (f) paths.add(f);
    });
    for (const p of this.b.opponent ?? []) {
      const f = TrainerType.frontSpriteFilename(p.trainerType, resolveBitmap);
      if (f) paths.add(f);
    }
    const guest = G.player ? TrainerType.frontSpriteFilename((G.player as unknown as { trainerType: Id }).trainerType, resolveBitmap) : null;
    if (guest) paths.add(guest);
    const pokemon: Pokemon[] = [];
    for (let side = 0; side < 2; side++) {
      for (const pkmn of this.b.pbParty(side) ?? []) if (pkmn) pokemon.push(pkmn); // (a SafariBattle has no party 0)
    }
    for (const pkmn of pokemon) {
      for (const back of [false, true]) {
        const req = battlerBitmapRequest(pkmn, back);
        if (req) paths.add(req.file);
      }
      const shadow = shadowFilenameFromPokemon(pkmn);
      if (shadow) paths.add(shadow);
      for (const f of ballGraphics(pkmn.pokeBall)) paths.add(f);
    }
    await Promise.all([
      preloadBitmaps(paths),
      preloadPokemonIcons(pokemon),
      preloadBattleAnimations(),
      ...pokemon.flatMap((p) => [preloadCryLength(p), preloadCryLength(p, "_faint")]),
      ...BattleScene.extraPreloads.map((f) => f(this)),
    ]);
  }

  /** What plugins' scene additions draw, fetched with the rest (web/src/battle/deluxe registers one). */
  static extraPreloads: ((scene: BattleScene) => Promise<void>)[] = [];

  pbInitSprites(): void {
    this.sprites = {};
    // The background image and each side's base graphic
    this.pbCreateBackdropSprites();
    // Create message box graphic
    const messageBox = this.pbAddSprite("messageBox", 0, SCREEN_H - 96, "Graphics/Pictures/Battle/overlay_message", this.viewport);
    messageBox.z = 195;
    // Create message window (displays the message)
    const msgWindow = Window_AdvancedTextPokemon.newWithSize("", 16, SCREEN_H - 96 + 2, SCREEN_W - 32, 96, this.viewport);
    msgWindow.z = 200;
    msgWindow.opacity = 0;
    msgWindow.baseColor = BattleScene.MESSAGE_BASE_COLOR;
    msgWindow.shadowColor = BattleScene.MESSAGE_SHADOW_COLOR;
    msgWindow.letterbyletter = true;
    this.sprites.messageWindow = msgWindow;
    // Create command window
    this.sprites.commandWindow = new CommandMenu(this.viewport, 200);
    // Create fight window
    this.sprites.fightWindow = new FightMenu(this.viewport, 200);
    // Create targeting window
    this.sprites.targetWindow = new TargetMenu(this.viewport, 200, this.b.sideSizes);
    this.pbShowWindow(BattleScene.MESSAGE_BOX);
    // The party lineup graphics (bar and balls) for both sides
    for (let side = 0; side < 2; side++) {
      const partyBar = this.pbAddSprite(`partyBar_${side}`, 0, 0, "Graphics/Pictures/Battle/overlay_lineup", this.viewport);
      partyBar.z = 120;
      if (side === 0) partyBar.mirror = true; // Player's lineup bar only
      partyBar.visible = false;
      for (let i = 0; i < BattleScene.NUM_BALLS; i++) {
        const ball = this.pbAddSprite(`partyBall_${side}_${i}`, 0, 0, null, this.viewport);
        ball.z = 121;
        ball.visible = false;
      }
      // Ability splash bars
      if (BattleScene.USE_ABILITY_SPLASH) {
        this.sprites[`abilityBar_${side}`] = new AbilitySplashBar(side, this.viewport);
      }
    }
    // Player's and partner trainer's back sprite
    (this.b.player ?? []).forEach((p, i) => {
      this.pbCreateTrainerBackSprite(i, p.trainerType, this.b.player!.length);
    });
    // Opposing trainer(s) sprites
    if (this.b.trainerBattle()) {
      this.b.opponent!.forEach((p, i) => {
        this.pbCreateTrainerFrontSprite(i, p.trainerType, this.b.opponent!.length);
      });
    }
    // Data boxes and Pokémon sprites
    this.b.battlers.forEach((bt, i) => {
      if (!bt) return;
      this.sprites[`dataBox_${i}`] = new PokemonDataBox(bt, this.b.pbSideSize(i), this.viewport);
      this.pbCreatePokemonSprite(i);
    });
    // Wild battle, so set up the Pokémon sprite(s) accordingly
    if (this.b.wildBattle()) {
      this.b.pbParty(1).forEach((pkmn, i) => {
        const index = i * 2 + 1;
        void this.pbChangePokemon(index, pkmn!);
        const pkmnSprite: BattlerSprite = this.sprites[`pokemon_${index}`];
        pkmnSprite.tone = new Tone(-80, -80, -80);
        pkmnSprite.visible = true;
      });
    }
    // Essentials Deluxe: midbattle speech sprites and battler icons
    this.pbMidbattleInit();
    if (!BattleSceneHooks.inSafari()) {
      for (const bt of this.b.allBattlers()) {
        const icon = new PokemonIconSprite(bt.pokemon, this.viewport);
        icon.setOffset(PictureOrigin.CENTER);
        icon.visible = false;
        icon.z = 400;
        this.sprites[`battler_icon${bt.index}`] = icon;
        this.pbAddSpriteOutline([`battler_icon${bt.index}`, this.viewport, bt.pokemon, PictureOrigin.CENTER]);
      }
    }
    // Enhanced UI: move info / battle info overlays (hidden until toggled)
    this.initEnhancedUISprites();
  }

  /** The backdrop, base and message bar files pbCreateBackdropSprites uses. */
  private backdropFilenames(): [string, string, string, string] {
    let time: string | null = null;
    switch (this.b.time) {
      case 1: time = "eve"; break;
      case 2: time = "night"; break;
    }
    // Put everything together into backdrop, bases and message bar filenames
    let backdropFilename = this.b.backdrop;
    let baseFilename = this.b.backdrop;
    if (this.b.backdropBase) baseFilename = `${baseFilename}_${this.b.backdropBase}`;
    let messageFilename = this.b.backdrop;
    if (time) {
      let trialName = `${backdropFilename}_${time}`;
      if (resolveBitmap(`Graphics/Battlebacks/${trialName}_bg`)) backdropFilename = trialName;
      trialName = `${baseFilename}_${time}`;
      if (resolveBitmap(`Graphics/Battlebacks/${trialName}_base0`)) baseFilename = trialName;
      trialName = `${messageFilename}_${time}`;
      if (resolveBitmap(`Graphics/Battlebacks/${trialName}_message`)) messageFilename = trialName;
    }
    if (!resolveBitmap(`Graphics/Battlebacks/${baseFilename}_base0`) && this.b.backdropBase) {
      baseFilename = this.b.backdropBase;
      if (time) {
        const trialName = `${baseFilename}_${time}`;
        if (resolveBitmap(`Graphics/Battlebacks/${trialName}_base0`)) baseFilename = trialName;
      }
    }
    // Finalise filenames
    return [
      `Graphics/Battlebacks/${backdropFilename}_bg`,
      `Graphics/Battlebacks/${baseFilename}_base0`,
      `Graphics/Battlebacks/${baseFilename}_base1`,
      `Graphics/Battlebacks/${messageFilename}_message`,
    ];
  }

  pbCreateBackdropSprites(): void {
    const [battleBG, playerBase, enemyBase, messageBG] = this.backdropFilenames();
    // Apply graphics
    let bg = this.pbAddSprite("battle_bg", 0, 0, battleBG, this.viewport);
    bg.z = 0;
    bg = this.pbAddSprite("battle_bg2", -SCREEN_W, 0, battleBG, this.viewport);
    bg.z = 0;
    bg.mirror = true;
    for (let side = 0; side < 2; side++) {
      const [baseX, baseY] = BattleScene.pbBattlerPosition(side);
      const base = this.pbAddSprite(`base_${side}`, baseX, baseY, side === 0 ? playerBase : enemyBase, this.viewport);
      base.z = 1;
      if (base.bitmap) {
        base.ox = Math.floor(base.bitmap.width / 2);
        base.oy = side === 0 ? base.bitmap.height : Math.floor(base.bitmap.height / 2);
      }
    }
    const cmdBarBG = this.pbAddSprite("cmdBar_bg", 0, SCREEN_H - 96, messageBG, this.viewport);
    cmdBarBG.z = 180;
  }

  private trainerBackFilename(idxTrainer: number, trainerType: Id): string | null {
    if (idxTrainer === 0) { // Player's sprite
      const outfit = (G.player as unknown as { outfit?: number } | null)?.outfit ?? 0;
      return TrainerType.playerBackSpriteFilename(trainerType, resolveBitmap, outfit);
    }
    // Partner trainer's sprite
    return TrainerType.backSpriteFilename(trainerType, resolveBitmap);
  }

  pbCreateTrainerBackSprite(idxTrainer: number, trainerType: Id, numTrainers = 1): void {
    const trainerFile = this.trainerBackFilename(idxTrainer, trainerType);
    const [spriteX, spriteY] = BattleScene.pbTrainerPosition(0, idxTrainer, numTrainers);
    const trainer = this.pbAddSprite(`player_${idxTrainer + 1}`, spriteX, spriteY, trainerFile, this.viewport);
    if (!trainer.bitmap) return;
    // Alter position of sprite
    trainer.z = 80 + idxTrainer;
    if (trainer.bitmap.width > trainer.bitmap.height * 2) {
      trainer.srcRect.x = 0;
      trainer.srcRect.width = Math.floor(trainer.bitmap.width / 5);
    }
    trainer.ox = Math.floor(trainer.srcRect.width / 2);
    trainer.oy = trainer.bitmap.height;
  }

  pbCreateTrainerFrontSprite(idxTrainer: number, trainerType: Id, numTrainers = 1): void {
    const trainerFile = TrainerType.frontSpriteFilename(trainerType, resolveBitmap);
    const [spriteX, spriteY] = BattleScene.pbTrainerPosition(1, idxTrainer, numTrainers);
    const trainer = this.pbAddSprite(`trainer_${idxTrainer + 1}`, spriteX, spriteY, trainerFile, this.viewport);
    if (!trainer.bitmap) return;
    // Alter position of sprite
    trainer.z = 7 + idxTrainer;
    trainer.ox = Math.floor(trainer.srcRect.width / 2);
    trainer.oy = trainer.bitmap.height;
  }

  pbCreatePokemonSprite(idxBattler: number): void {
    const sideSize = this.b.pbSideSize(idxBattler);
    const batSprite = new BattlerSprite(this.viewport, sideSize, idxBattler, this.animations);
    this.sprites[`pokemon_${idxBattler}`] = batSprite;
    const shaSprite = new BattlerShadowSprite(this.viewport, sideSize, idxBattler);
    shaSprite.visible = false;
    this.sprites[`shadow_${idxBattler}`] = shaSprite;
  }

  /** Essentials Deluxe's pbAddSpriteOutline ([000] Sprite Outliner.rb), for the battler icons. */
  pbAddSpriteOutline(param: [string, Viewport, Pokemon | null, number], color = new Color(255, 255, 255), border = 2, opacity = 255): void {
    const [key, viewport, object, offset] = param;
    if (!this.sprites[key]) return;
    const base: PokemonIconSprite = this.sprites[key];
    for (let i = 0; i <= 7; i++) {
      const outline = new PokemonIconSprite(object, viewport);
      outline.setOffset(offset);
      outline.visible = base.visible;
      outline.mirror = base.mirror;
      outline.color = color.clone();
      outline.opacity = opacity;
      outline.x = base.x;
      outline.y = base.y;
      outline.z = base.z;
      switch (i) {
        case 0: outline.x += border; break;
        case 1: outline.x -= border; break;
        case 2: outline.y += border; break;
        case 3: outline.y -= border; break;
        case 4: outline.x -= border; outline.y -= border; break;
        case 5: outline.x += border; outline.y -= border; break;
        case 6: outline.x -= border; outline.y += border; break;
        case 7: outline.x += border; outline.y += border; break;
      }
      this.sprites[`${key}_outline${i}`] = outline;
    }
    base.z = this.sprites[`${key}_outline7`].z + 1;
  }

  /** Enhanced UI's pbInitSprites alias: the move/battle info overlays. */
  private initEnhancedUISprites(): void {
    const path = "Graphics/Plugins/Enhanced UI/Battle UI/";
    this.moveUIToggle = false;
    const moveinfo = new BitmapSprite(SCREEN_W, SCREEN_H, this.viewport);
    moveinfo.z = 300;
    moveinfo.visible = this.moveUIToggle;
    pbSetSmallFont(moveinfo.bitmap!);
    this.sprites.moveinfo = moveinfo;
    this.infoUIToggle = false;
    const infobitmap = new BitmapSprite(SCREEN_W, SCREEN_H, this.viewport);
    infobitmap.z = 300;
    infobitmap.visible = this.infoUIToggle;
    this.sprites.infobitmap = infobitmap;
    const infoselect = new IconSprite(0, 0, this.viewport);
    infoselect.setBitmapFile(path + "Battle Info/select");
    infoselect.srcRect.set(0, 52, 166, 52);
    infoselect.visible = this.infoUIToggle;
    infoselect.z = 300;
    this.sprites.infoselect = infoselect;
    const infotext = new BitmapSprite(SCREEN_W, SCREEN_H, this.viewport);
    infotext.z = 300;
    infotext.visible = this.infoUIToggle;
    pbSetSmallFont(infotext.bitmap!);
    this.sprites.infotext = infotext;
    const leftarrow = AnimatedSprite.createLong("Graphics/Pictures/leftarrow", 8, 40, 28, 2, this.viewport);
    leftarrow.x = -2;
    leftarrow.y = 71;
    leftarrow.z = 300;
    leftarrow.play();
    leftarrow.visible = false;
    this.sprites.leftarrow = leftarrow;
    const rightarrow = AnimatedSprite.createLong("Graphics/Pictures/rightarrow", 8, 40, 28, 2, this.viewport);
    rightarrow.x = SCREEN_W - 38;
    rightarrow.y = 71;
    rightarrow.z = 300;
    rightarrow.play();
    rightarrow.visible = false;
    this.sprites.rightarrow = rightarrow;
  }

  //=============================================================================
  // The player chooses a main command for a Pokémon (003_Scene_ChooseCommands.rb)
  // Return values: -1=Cancel, 0=Fight, 1=Bag, 2=Pokémon, 3=Run, 4=Call
  //=============================================================================
  async pbCommandMenu(idxBattler: number, firstAction: boolean): Promise<number> {
    const shadowTrainer = Type.exists("SHADOW") && this.b.trainerBattle();
    const cmds = [
      _INTL("What will\n{1} do?", this.b.battlers[idxBattler]!.name),
      _INTL("Fight"),
      _INTL("Bag"),
      _INTL("Pokémon"),
      shadowTrainer ? _INTL("Call") : firstAction ? _INTL("Run") : _INTL("Cancel"),
    ];
    let ret = await this.pbCommandMenuEx(idxBattler, cmds, shadowTrainer ? 2 : firstAction ? 0 : 1);
    if (ret === 3 && shadowTrainer) ret = 4; // Convert "Run" to "Call"
    if (ret === 3 && !firstAction) ret = -1; // Convert "Run" to "Cancel"
    return ret;
  }

  /**
   * Essentials Deluxe's version ([000] Battle.rb): Back cancels in every mode
   * but 0. Mode: 0 = regular battle with "Run" (first choosable action in the
   * round only), 1 = with "Cancel", 2 = with "Call" (for Shadow Pokémon
   * battles), 3 = Safari Zone, 4 = Bug Catching Contest.
   */
  async pbCommandMenuEx(idxBattler: number, texts: string[], mode = 0): Promise<number> {
    this.pbShowWindow(BattleScene.COMMAND_BOX);
    const cw: CommandMenu = this.sprites.commandWindow;
    cw.setTexts(texts);
    cw.setIndexAndMode(this.lastCmd[idxBattler]!, mode);
    this.pbSelectBattler(idxBattler);
    let ret = -1;
    for (;;) {
      const oldIndex = cw.index;
      await this.pbUpdate(cw);
      // Update selected command
      if (Input.trigger(Input.LEFT)) {
        if ((cw.index & 1) === 1) cw.index -= 1;
      } else if (Input.trigger(Input.RIGHT)) {
        if ((cw.index & 1) === 0) cw.index += 1;
      } else if (Input.trigger(Input.UP)) {
        if ((cw.index & 2) === 2) cw.index -= 2;
      } else if (Input.trigger(Input.DOWN)) {
        if ((cw.index & 2) === 0) cw.index += 2;
      }
      if (cw.index !== oldIndex) pbPlayCursorSE();
      // Actions
      if (Input.trigger(Input.USE)) { // Confirm choice
        pbPlayDecisionSE();
        ret = cw.index;
        this.lastCmd[idxBattler] = ret;
        break;
      } else if (Input.trigger(Input.BACK) && mode > 0) { // Cancel
        pbPlayCancelSE();
        break;
      } else if (Input.trigger(Input.F9) && BattleSceneHooks.debug()) { // Debug menu
        pbPlayDecisionSE();
        this.pbHidePluginUI();
        ret = -2;
        break;
      } else if (this.pbToggleBattleInfo && KeyboardInput.triggerex("N")) { // Enhanced UI: Battle Info
        pbHideFocusPanel(this);
        await this.pbToggleBattleInfo();
      }
    }
    return ret;
  }

  //=============================================================================
  // The player chooses a move for a Pokémon to use (Essentials Deluxe's version)
  //=============================================================================
  mechanicParams(...params: (boolean | undefined)[]): Record<Exclude<BattleButton, "none">, boolean> {
    return {
      mega: params[0] || false,
      ultra: params[1] || false,
      zmove: params[2] || false,
      dynamax: params[3] || false,
      style: params[4] || false,
      tera: params[5] || false,
      zodiac: params[6] || false,
      custom: params[7] || false,
    };
  }

  /**
   * pbFightMenu(idxBattler, *mechanics) { |cmd| ... }: the mechanics are
   * [mega, ultra, zmove, dynamax, style, tera, zodiac, custom] (whether each
   * can be used); the block gets the chosen move index or a DXTriggers value
   * and returns true to close the menu.
   */
  async pbFightMenu(idxBattler: number, ...args: [...params: (boolean | undefined)[], block: FightMenuBlock]): Promise<void> {
    const block = args.pop() as FightMenuBlock;
    const data = this.mechanicParams(...(args as (boolean | undefined)[]));
    const battler = this.b.battlers[idxBattler]!;
    const cw: FightMenu = this.sprites.fightWindow;
    let moveIndex = 0;
    if (battler.moves[this.lastMove[idxBattler]!]?.id) moveIndex = this.lastMove[idxBattler]!;
    cw.shiftMode = this.b.pbCanShift(idxBattler) ? 1 : 0;
    cw.battler = battler;
    const mechanic = this.pbFightMenu_BattleMechanic(data, cw);
    cw.setIndexAndMode(moveIndex, mechanic ? 1 : 0);
    let needFullRefresh = true;
    let needRefresh = false;
    for (;;) {
      if (needFullRefresh) {
        this.pbShowWindow(BattleScene.FIGHT_BOX);
        this.pbSelectBattler(idxBattler);
        needFullRefresh = false;
      }
      if (needRefresh) {
        this.pbFightMenu_RefreshMechanic(mechanic, idxBattler, cw);
        needRefresh = false;
      }
      const oldIndex = cw.index;
      await this.pbUpdate(cw);
      if (Input.trigger(Input.LEFT)) {
        if ((cw.index & 1) === 1) cw.index -= 1;
      } else if (Input.trigger(Input.RIGHT)) {
        if (battler.moves[cw.index + 1]?.id && (cw.index & 1) === 0) cw.index += 1;
      } else if (Input.trigger(Input.UP)) {
        if ((cw.index & 2) === 2) cw.index -= 2;
      } else if (Input.trigger(Input.DOWN)) {
        if (battler.moves[cw.index + 2]?.id && (cw.index & 2) === 0) cw.index += 2;
      }
      if (cw.index !== oldIndex) {
        pbPlayCursorSE();
        // Enhanced UI (installed by web/src/battle/deluxe)
        this.pbUpdateMoveInfoWindow?.(battler as never, cw.index);
      }
      //-------------------------------------------------------------------------
      // Confirm Selection
      if (Input.trigger(Input.USE)) {
        if (await block(await this.pbFightMenu_Confirm(mechanic, battler, cw))) break;
        needFullRefresh = true;
        needRefresh = true;
      //-------------------------------------------------------------------------
      // Cancel Selection
      } else if (Input.trigger(Input.BACK)) {
        if (await block(this.pbFightMenu_Cancel(mechanic, battler, cw))) break;
        needRefresh = true;
      //-------------------------------------------------------------------------
      // Toggle Battle Mechanic
      } else if (Input.trigger(Input.ACTION)) {
        const [trigger, doRefresh] = this.pbFightMenu_Action(mechanic, battler, cw);
        if (trigger) {
          needFullRefresh = doRefresh;
          if (await block(trigger)) break;
          needRefresh = true;
        }
      //-------------------------------------------------------------------------
      // Shift Battler
      } else if (Input.trigger(Input.SPECIAL)) {
        if (cw.shiftMode > 0) {
          if (await block(this.pbFightMenu_Shift())) break;
          needRefresh = true;
        }
      }
      //-------------------------------------------------------------------------
      // Other Commands (Enhanced UI's M/N windows; Focus Meter isn't installed)
      await this.pbFightMenu_EnhancedUI?.(battler as never, cw);
    }
    this.pbHidePluginUI();
    this.lastMove[idxBattler] = cw.index;
  }

  /** Returns an available battle mechanic, if any. */
  pbFightMenu_BattleMechanic(data: Record<string, boolean>, cw: FightMenu): Exclude<BattleButton, "none"> | null {
    let mechanic: Exclude<BattleButton, "none"> | null = null;
    let button: BattleButton = "none";
    for (const key of Object.keys(data) as Exclude<BattleButton, "none">[]) {
      if (!data[key]) continue;
      mechanic = button = key;
    }
    cw.chosenButton = button;
    return mechanic;
  }

  /** Refreshes the UI if a battle mechanic has been registered for use. */
  pbFightMenu_RefreshMechanic(mechanic: BattleButton | null, idxBattler: number, cw: FightMenu): void {
    if (!mechanic) return;
    let register = false;
    switch (mechanic) {
      case "mega": register = !!this.b.pbRegisteredMegaEvolution?.(idxBattler); break;
      case "ultra": register = !!this.b.pbRegisteredUltraBurst?.(idxBattler); break;
      case "zmove": register = !!this.b.pbRegisteredZMove?.(idxBattler); break;
      case "dynamax": register = !!this.b.pbRegisteredDynamax?.(idxBattler); break;
      case "custom": register = !!this.b.pbRegisteredCustom?.(idxBattler); break;
    }
    const newMode = register ? 2 : 1;
    if (newMode !== cw.mode) cw.mode = newMode;
  }

  /**
   * Confirms the player's move selection. Cancels selection if registered
   * battle mechanic is incompatible with the selected move.
   */
  async pbFightMenu_Confirm(mechanic: BattleButton | null, battler: SceneBattler, cw: FightMenu): Promise<number> {
    this.pbHidePluginUI();
    let ret = cw.index;
    const cancel = DXTriggers.MENU_TRIGGER_CANCEL;
    switch (mechanic) {
      case "zmove":
        if (cw.mode === 2) {
          if (!battler.hasCompatibleZMove?.((battler.moves[cw.index] ?? null) as never)) {
            const itemname = battler.item?.name ?? "";
            const movename = battler.moves[cw.index]?.name ?? "";
            await this.b.pbDisplay?.(_INTL("{1} is not compatible with {2}!", movename, itemname));
            if (battler.powerTrigger) {
              battler.powerTrigger = false;
              battler.displayBaseMoves?.();
            }
            ret = cancel;
          }
        }
        break;
      default:
        battler.powerTrigger = false;
    }
    if (ret !== cancel) pbPlayDecisionSE();
    return ret;
  }

  /**
   * Cancels the player's command selection. Resets various battler properties
   * related to selected battle mechanic.
   */
  pbFightMenu_Cancel(mechanic: BattleButton | null, battler: SceneBattler, _cw: FightMenu): number {
    this.pbHidePluginUI();
    switch (mechanic) {
      case "zmove":
        if (battler.powerTrigger) battler.displayBaseMoves?.();
        battler.powerTrigger = false;
        break;
      case "dynamax":
        if (battler.powerTrigger && !battler.dynamax?.()) {
          battler.displayBaseMoves?.();
          battler.powerTrigger = false;
        }
        break;
      default:
        battler.powerTrigger = false;
    }
    pbPlayCancelSE();
    return DXTriggers.MENU_TRIGGER_CANCEL;
  }

  /** Toggles the use of an available battle mechanic. */
  pbFightMenu_Action(mechanic: BattleButton | null, battler: SceneBattler, cw: FightMenu): [number | false, boolean] {
    switch (mechanic) {
      case "mega": return this.pbFightMenu_MegaEvolution(battler, cw);
      case "ultra": return this.pbFightMenu_UltraBurst(battler, cw);
      case "zmove": return this.pbFightMenu_ZMove(battler, cw);
      case "dynamax": return this.pbFightMenu_Dynamax(battler, cw);
      case "custom": return this.pbFightMenu_CustomMechanic(battler, cw);
    }
    return [false, false];
  }

  /** Toggles the use of Mega Evolution. */
  pbFightMenu_MegaEvolution(battler: SceneBattler, _cw: FightMenu): [number, boolean] {
    battler.powerTrigger = !battler.powerTrigger;
    if (battler.powerTrigger) pbPlayBattleButton();
    else pbPlayCancelSE();
    return [DXTriggers.MENU_TRIGGER_MEGA_EVOLUTION, false];
  }

  /** ZUD Mechanics: toggles the use of Z-Moves in the Fight Menu. */
  pbFightMenu_ZMove(battler: SceneBattler, _cw: FightMenu): [number, boolean] {
    battler.powerTrigger = !battler.powerTrigger;
    if (battler.powerTrigger) {
      battler.displayPowerMoves?.("Z-Move");
      pbPlayBattleButton();
    } else {
      battler.displayBaseMoves?.();
      pbPlayCancelSE();
    }
    return [DXTriggers.MENU_TRIGGER_Z_MOVE, true];
  }

  /** ZUD Mechanics: toggles the use of Ultra Burst in the Fight Menu. */
  pbFightMenu_UltraBurst(battler: SceneBattler, _cw: FightMenu): [number, boolean] {
    battler.powerTrigger = !battler.powerTrigger;
    if (battler.powerTrigger) pbPlayBattleButton();
    else pbPlayCancelSE();
    return [DXTriggers.MENU_TRIGGER_ULTRA_BURST, false];
  }

  /** ZUD Mechanics: toggles the use of Dynamax in the Fight Menu. */
  pbFightMenu_Dynamax(battler: SceneBattler, _cw: FightMenu): [number, boolean] {
    battler.powerTrigger = !battler.powerTrigger;
    if (battler.powerTrigger) {
      battler.displayPowerMoves?.("Max Move");
      pbPlayBattleButton();
    } else {
      battler.displayBaseMoves?.();
      pbPlayCancelSE();
    }
    return [DXTriggers.MENU_TRIGGER_DYNAMAX, true];
  }

  /** Toggles the use of a custom battle mechanic. */
  pbFightMenu_CustomMechanic(_battler: SceneBattler, _cw: FightMenu): [number, boolean] {
    pbPlayDecisionSE();
    return [DXTriggers.MENU_TRIGGER_CUSTOM_MECHANIC, false];
  }

  /** Toggles the use of the shift mechanic. */
  pbFightMenu_Shift(): number {
    this.pbHidePluginUI();
    pbPlayDecisionSE();
    return DXTriggers.MENU_TRIGGER_SHIFT_BATTLER;
  }

  /** Hides various plugin UI's. */
  pbHidePluginUI(): void {
    pbHideMoveInfo(this);
    pbHideBattleInfo(this);
    pbHideFocusPanel(this);
    if (BattleSceneHooks.inSafari()) return;
    for (const bt of this.b.allBattlers()) {
      const icon = this.sprites[`battler_icon${bt.index}`];
      if (icon) icon.visible = false;
    }
  }

  //=============================================================================
  // Opens the party screen to choose a Pokémon to switch in (or just view its
  // summary screens). Generation 9 Pack's version ("Select" for Revival Blessing).
  // mode: 0=Pokémon command, 1=choose a Pokémon to send to the Boxes, 2=view
  //       summaries only / choose a fainted Pokémon (Revival Blessing)
  //=============================================================================
  async pbPartyScreen(idxBattler: number, canCancel = false, mode = 0, block?: PartyScreenBlock): Promise<void> {
    // Fade out and hide all sprites
    const visibleSprites = await pbFadeOutAndHide(this.sprites);
    // Get player's party
    const partyPos = this.b.pbPartyOrder(idxBattler);
    const [partyStart] = this.b.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    const modParty = this.b.pbPlayerDisplayParty(idxBattler);
    // Start party screen
    const scene = new PokemonParty_Scene();
    const switchScreen = new PokemonPartyScreen(scene, modParty);
    let msg = _INTL("Choose a Pokémon.");
    if (mode === 1) msg = _INTL("Send which Pokémon to Boxes?");
    await switchScreen.pbStartScene(msg, this.b.pbNumPositions(0, 0));
    // Loop while in party screen
    for (;;) {
      // Select a Pokémon
      scene.pbSetHelpText(msg);
      const idxParty = await switchScreen.pbChoosePokemon();
      if (idxParty < 0) {
        if (!canCancel) continue;
        break;
      }
      // Choose a command for the selected Pokémon
      let cmdSwitch = -1;
      let cmdBoxes = -1;
      let cmdSelect = -1;
      let cmdSummary = -1;
      const commands: string[] = [];
      if (mode === 0 && modParty[idxParty]!.able()) commands[cmdSwitch = commands.length] = _INTL("Switch In");
      if (mode === 1) commands[cmdBoxes = commands.length] = _INTL("Send to Boxes");
      if (mode === 2 && modParty[idxParty]!.fainted()) commands[cmdSelect = commands.length] = _INTL("Select");
      commands[cmdSummary = commands.length] = _INTL("Summary");
      commands[commands.length] = _INTL("Cancel");
      const command = await scene.pbShowCommands(_INTL("Do what with {1}?", modParty[idxParty]!.name), commands);
      if ((cmdSwitch >= 0 && command === cmdSwitch) || // Switch In
          (cmdBoxes >= 0 && command === cmdBoxes) || // Send to Boxes
          (cmdSelect >= 0 && command === cmdSelect)) { // Select for Revival Blessing
        let idxPartyRet = -1;
        for (let i = 0; i < partyPos.length; i++) {
          if (partyPos[i] !== idxParty + partyStart) continue;
          idxPartyRet = i;
          break;
        }
        if (block && (await block(idxPartyRet, switchScreen))) break;
      } else if (cmdSummary >= 0 && command === cmdSummary) { // Summary
        await scene.pbSummary(idxParty, true);
      }
    }
    // Close party screen
    await switchScreen.pbEndScene();
    // Fade back into battle screen
    await pbFadeInAndShow(this.sprites, visibleSprites);
  }

  //=============================================================================
  // Opens the Bag screen and chooses an item to use
  //=============================================================================
  async pbItemMenu(idxBattler: number, _firstAction: boolean, block?: ItemMenuBlock): Promise<void> {
    const bag = G.bag!;
    const yieldItem = async (...a: Parameters<ItemMenuBlock>) => !!block && (await block(...a));
    // Fade out and hide all sprites
    const visibleSprites = await pbFadeOutAndHide(this.sprites);
    // Set Bag starting positions
    const oldLastPocket = bag.lastViewedPocket;
    const oldChoices = [...bag.lastPocketSelections];
    if (this.bagLastPocket) {
      bag.lastViewedPocket = this.bagLastPocket;
      bag.lastPocketSelections = this.bagChoices;
    } else {
      bag.resetLastSelections();
    }
    // Start Bag screen
    const itemScene = new PokemonBag_Scene();
    await itemScene.pbStartScene(bag, true, (item) => {
      const useType = Item.get(item).battleUse;
      return !!useType && useType > 0;
    }, false);
    // Loop while in Bag screen
    let wasTargeting = false;
    for (;;) {
      // Select an item
      const itemId = await itemScene.pbChooseItem();
      if (!itemId) break;
      // Choose a command for the selected item
      const item = Item.get(itemId);
      const itemName = item.name;
      const useType = item.battleUse;
      let cmdUse = -1;
      const commands: string[] = [];
      if (useType && useType !== 0) commands[cmdUse = commands.length] = _INTL("Use");
      commands[commands.length] = _INTL("Cancel");
      const command = await itemScene.pbShowCommands(_INTL("{1} is selected.", itemName), commands);
      if (!(cmdUse >= 0 && command === cmdUse)) continue; // Use
      // Use types:
      // 0 = not usable in battle
      // 1 = use on Pokémon (lots of items, Blue Flute)
      // 2 = use on Pokémon's move (Ethers)
      // 3 = use on battler (X items, Persim Berry, Red/Yellow Flutes)
      // 4 = use on opposing battler (Poké Balls)
      // 5 = use no target (Poké Doll, Guard Spec., Poké Flute, Launcher items)
      if (useType === 1 || useType === 2 || useType === 3) { // Use on Pokémon/Pokémon's move/battler
        // Auto-choose the Pokémon/battler whose action is being decided if they
        // are the only available Pokémon/battler to use the item on
        if (useType === 1) { // Use on Pokémon
          if (this.b.pbTeamLengthFromBattlerIndex(idxBattler) === 1) {
            if (await yieldItem(item.id, useType, this.b.battlers[idxBattler]!.pokemonIndex, -1, itemScene)) break;
          }
        } else if (useType === 3) { // Use on battler
          if (this.b.pbPlayerBattlerCount() === 1) {
            if (await yieldItem(item.id, useType, this.b.battlers[idxBattler]!.pokemonIndex, -1, itemScene)) break;
          }
        }
        // Fade out and hide Bag screen
        await itemScene.pbFadeOutScene();
        // Get player's party
        const party = this.b.pbParty(idxBattler);
        const partyPos = this.b.pbPartyOrder(idxBattler);
        const [partyStart] = this.b.pbTeamIndexRangeFromBattlerIndex(idxBattler);
        const modParty = this.b.pbPlayerDisplayParty(idxBattler);
        // Start party screen
        const pkmnScene = new PokemonParty_Scene();
        const pkmnScreen = new PokemonPartyScreen(pkmnScene, modParty);
        await pkmnScreen.pbStartScene(_INTL("Use on which Pokémon?"), this.b.pbNumPositions(0, 0));
        let idxParty = -1;
        let chosen = false;
        // Loop while in party screen
        for (;;) {
          // Select a Pokémon
          pkmnScene.pbSetHelpText(_INTL("Use on which Pokémon?"));
          idxParty = await pkmnScreen.pbChoosePokemon();
          if (idxParty < 0) break;
          let idxPartyRet = -1;
          for (let i = 0; i < partyPos.length; i++) {
            if (partyPos[i] !== idxParty + partyStart) continue;
            idxPartyRet = i;
            break;
          }
          if (idxPartyRet < 0) continue;
          const pkmn = party[idxPartyRet];
          if (!pkmn || pkmn.egg()) continue;
          let idxMove = -1;
          if (useType === 2) { // Use on Pokémon's move
            idxMove = await pkmnScreen.pbChooseMove(pkmn, _INTL("Restore which move?"));
            if (idxMove < 0) continue;
          }
          if (await yieldItem(item.id, useType, idxPartyRet, idxMove, pkmnScene)) {
            chosen = true;
            break;
          }
        }
        await pkmnScene.pbEndScene();
        if (chosen || idxParty >= 0) break;
        // Cancelled choosing a Pokémon; show the Bag screen again
        await itemScene.pbFadeInScene();
      } else if (useType === 4) { // Use on opposing battler (Poké Balls)
        let idxTarget = -1;
        if (this.b.pbOpposingBattlerCount(idxBattler) === 1) {
          for (const b of this.b.allOtherSideBattlers(idxBattler)) idxTarget = b.index;
          if (await yieldItem(item.id, useType, idxTarget, -1, itemScene)) break;
        } else {
          wasTargeting = true;
          // Fade out and hide Bag screen
          await itemScene.pbFadeOutScene();
          // Fade in and show the battle screen, choosing a target
          const tempVisibleSprites = { ...visibleSprites };
          tempVisibleSprites.commandWindow = false;
          tempVisibleSprites.targetWindow = true;
          idxTarget = await this.pbChooseTarget(idxBattler, Target.get("Foe"), tempVisibleSprites);
          if (idxTarget >= 0) {
            if (await yieldItem(item.id, useType, idxTarget, -1, this)) break;
          }
          // Target invalid/cancelled choosing a target; show the Bag screen again
          wasTargeting = false;
          await pbFadeOutAndHide(this.sprites);
          await itemScene.pbFadeInScene();
        }
      } else if (useType === 5) { // Use with no target
        if (await yieldItem(item.id, useType, idxBattler, -1, itemScene)) break;
      }
    }
    this.bagLastPocket = bag.lastViewedPocket;
    this.bagChoices = [...bag.lastPocketSelections];
    bag.lastViewedPocket = oldLastPocket;
    bag.lastPocketSelections = oldChoices;
    // Close Bag screen
    await itemScene.pbEndScene();
    // Fade back into battle screen (if not already showing it)
    if (!wasTargeting) await pbFadeInAndShow(this.sprites, visibleSprites);
  }

  //=============================================================================
  // The player chooses a target battler for a move/item (non-single battles only)
  //=============================================================================
  /**
   * Returns an array containing battler names to display when choosing a move's
   * target. null means can't select that position, "" means can select that
   * position but there is no battler there, otherwise is a battler's name.
   */
  pbCreateTargetTexts(idxBattler: number, targetData: Target): (string | null)[] {
    return this.b.battlers.map((bt, i) => {
      if (!bt) return null;
      let showName = false;
      // NOTE: Targets listed here are ones with num_targets of 0, plus
      //       RandomNearFoe which should look like it targets the user. All
      //       other targets are handled by the "else" part.
      switch (targetData.id) {
        case "None": case "User": case "RandomNearFoe":
          showName = i === idxBattler;
          break;
        case "UserSide":
          showName = !this.b.opposes(i, idxBattler);
          break;
        case "FoeSide":
          showName = this.b.opposes(i, idxBattler);
          break;
        case "BothSides":
          showName = true;
          break;
        default:
          showName = this.b.pbMoveCanTarget(i, idxBattler, targetData);
      }
      if (!showName) return null;
      return bt.fainted() ? "" : bt.name;
    });
  }

  /**
   * Returns the initial position of the cursor when choosing a target for a move
   * in a non-single battle.
   */
  pbFirstTarget(idxBattler: number, targetData: Target): number {
    switch (targetData.id) {
      case "NearAlly":
        // NOTE: Ruby passes the Battler itself to nearBattlers?, which compares
        //       it with battler indices and so always finds it near.
        for (const b of this.b.allSameSideBattlers(idxBattler)) {
          if (b.index === idxBattler) continue;
          if (b.fainted()) continue;
          return b.index;
        }
        for (const b of this.b.allSameSideBattlers(idxBattler)) {
          if (b.index === idxBattler) continue;
          return b.index;
        }
        break;
      case "NearFoe": case "NearOther": {
        const indices = this.b.pbGetOpposingIndicesInOrder(idxBattler);
        for (const i of indices) if (this.b.nearBattlers(i, idxBattler) && !this.b.battlers[i]!.fainted()) return i;
        for (const i of indices) if (this.b.nearBattlers(i, idxBattler)) return i;
        break;
      }
      case "Foe": case "Other": {
        const indices = this.b.pbGetOpposingIndicesInOrder(idxBattler);
        for (const i of indices) if (!this.b.battlers[i]!.fainted()) return i;
        if (indices.length > 0) return indices[0]!;
        break;
      }
    }
    return idxBattler; // Target the user initially
  }

  async pbChooseTarget(idxBattler: number, targetData: Target, visibleSprites: Record<string, boolean> | null = null): Promise<number> {
    this.pbShowWindow(BattleScene.TARGET_BOX);
    const cw: TargetMenu = this.sprites.targetWindow;
    // Create an array of battler names (only valid targets are named)
    const texts = this.pbCreateTargetTexts(idxBattler, targetData);
    // Determine mode based on target_data
    const mode = targetData.numTargets === 1 ? 0 : 1;
    cw.setDetails(texts, mode);
    cw.index = this.pbFirstTarget(idxBattler, targetData);
    this.pbSelectBattler(mode === 0 ? cw.index : texts, 2); // Select initial battler/data box
    if (visibleSprites) await pbFadeInAndShow(this.sprites, visibleSprites);
    let ret = -1;
    for (;;) {
      const oldIndex = cw.index;
      await this.pbUpdate(cw);
      // Update selected command
      if (mode === 0) { // Choosing just one target, can change index
        if (Input.trigger(Input.LEFT) || Input.trigger(Input.RIGHT)) {
          let inc = cw.index % 2 === 0 ? -2 : 2;
          if (Input.trigger(Input.RIGHT)) inc *= -1;
          const indexLength = this.b.sideSizes[cw.index % 2]! * 2;
          let newIndex = cw.index;
          for (;;) {
            newIndex += inc;
            if (newIndex < 0 || newIndex >= indexLength) break;
            if (texts[newIndex] == null) continue;
            cw.index = newIndex;
            break;
          }
        } else if ((Input.trigger(Input.UP) && cw.index % 2 === 0) ||
                   (Input.trigger(Input.DOWN) && cw.index % 2 === 1)) {
          const tryIndex = this.b.pbGetOpposingIndicesInOrder(cw.index);
          for (const idxBattlerTry of tryIndex) {
            if (texts[idxBattlerTry] == null) continue;
            cw.index = idxBattlerTry;
            break;
          }
        }
        if (cw.index !== oldIndex) {
          pbPlayCursorSE();
          this.pbSelectBattler(cw.index, 2); // Select the new battler/data box
        }
      }
      if (Input.trigger(Input.USE)) { // Confirm
        ret = cw.index;
        pbPlayDecisionSE();
        break;
      } else if (Input.trigger(Input.BACK)) { // Cancel
        ret = -1;
        pbPlayCancelSE();
        break;
      }
    }
    this.pbSelectBattler(-1); // Deselect all battlers/data boxes
    return ret;
  }

  //=============================================================================
  // Opens a Pokémon's summary screen to try to learn a new move
  //=============================================================================
  /**
   * Called whenever a Pokémon should forget a move. It should return -1 if the
   * selection is canceled, or 0 to 3 to indicate the move to forget. It should
   * not allow HM moves to be forgotten.
   */
  async pbForgetMove(pkmn: Pokemon, moveToLearn: Id): Promise<number> {
    let ret = -1;
    await pbFadeOutIn(async () => {
      const { PokemonSummary_Scene, PokemonSummaryScreen } = await import("../../ui/summary/summary");
      const scene = new PokemonSummary_Scene();
      const screen = new PokemonSummaryScreen(scene);
      ret = await screen.pbStartForgetScreen([pkmn], 0, moveToLearn);
    });
    return ret;
  }

  /** Opens the nicknaming screen for a newly caught Pokémon */
  async pbNameEntry(helpText: string, pkmn: Pokemon): Promise<string> {
    const { pbEnterPokemonName } = await import("../../ui/textEntry/UI_TextEntry");
    return pbEnterPokemonName(helpText, 0, Pokemon.MAX_NAME_SIZE, "", pkmn);
  }

  /** Shows the Pokédex entry screen for a newly caught Pokémon */
  async pbShowPokedex(species: Id): Promise<void> {
    await pbFadeOutIn(async () => {
      const { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } = await import("../../ui/pokedex/pokedexEntry");
      const scene = new PokemonPokedexInfo_Scene();
      const screen = new PokemonPokedexInfoScreen(scene);
      await screen.pbDexEntry(species);
    });
  }

  //=============================================================================
  // Animates the battle intro (004_Scene_PlayAnimations.rb)
  //=============================================================================
  async pbBattleIntroAnimation(): Promise<void> {
    // Make everything appear
    const introAnim = new Intro(this.sprites, this.viewport, this.b);
    for (;;) {
      introAnim.update();
      await this.pbUpdate();
      if (introAnim.animDone()) break;
    }
    introAnim.dispose();
    // Post-appearance activities
    // Trainer battle: get ready to show the party lineups (they are brought
    // on-screen by a separate animation)
    if (this.b.trainerBattle()) {
      // NOTE: Here is where you'd make trainer sprites animate if they had an
      //       entrance animation. Be sure to set it up like a Pokémon entrance
      //       animation, i.e. add them to @animations so that they can play out
      //       while party lineups appear and messages show.
      await this.pbShowPartyLineup(0, true);
      await this.pbShowPartyLineup(1, true);
      return;
    }
    // Wild battle: play wild Pokémon's intro animations (including cry), show
    // data box(es), return the wild Pokémon's sprite(s) to normal colour, show
    // shiny animation(s)
    // Set up data box animation
    for (let i = 0; i < this.b.sideSizes[1]!; i++) {
      const idxBattler = 2 * i + 1;
      if (!this.b.battlers[idxBattler]) continue;
      const dataBoxAnim = new DataBoxAppear(this.sprites, this.viewport, idxBattler);
      this.animations.push(dataBoxAnim);
    }
    // Set up wild Pokémon returning to normal colour and playing intro
    // animations (including cry)
    this.animations.push(new Intro2(this.sprites, this.viewport, this.b.sideSizes[1]!));
    // Play all the animations
    while (this.inPartyAnimation()) await this.pbUpdate();
    // Show shiny animation for wild Pokémon
    if (this.b.showAnims) {
      for (let i = 0; i < this.b.sideSizes[1]!; i++) {
        const idxBattler = 2 * i + 1;
        const bt = this.b.battlers[idxBattler];
        if (!bt || !bt.shiny()) continue;
        if (Settings.SUPER_SHINY && bt.superShiny()) {
          await this.pbCommonAnimation("SuperShiny", bt);
        } else {
          await this.pbCommonAnimation("Shiny", bt);
        }
      }
    }
  }

  /** Animates a party lineup appearing for the given side */
  async pbShowPartyLineup(side: number, fullAnim = false): Promise<void> {
    this.animations.push(new LineupAppear(this.sprites, this.viewport, side,
      this.b.pbParty(side), this.b.pbPartyStarts(side), fullAnim));
    if (fullAnim) return;
    while (this.inPartyAnimation()) await this.pbUpdate();
  }

  /**
   * Animates an opposing trainer sliding in from off-screen. Will animate a
   * previous trainer that is already on-screen slide off first. Used at the end
   * of battle.
   */
  async pbShowOpponent(idxTrainer: number): Promise<void> {
    // Set up trainer appearing animation
    const appearAnim = new TrainerAppear(this.sprites, this.viewport, idxTrainer);
    this.animations.push(appearAnim);
    // Play the animation
    while (this.inPartyAnimation()) await this.pbUpdate();
  }

  /**
   * Animates a trainer's sprite and party lineup hiding (if they are visible).
   * Animates a Pokémon being sent out into battle, then plays the shiny
   * animation for it if relevant.
   * sendOuts is an array; each element is itself an array: [idxBattler,pkmn]
   */
  async pbSendOutBattlers(sendOuts: [number, Pokemon][], startBattle = false): Promise<void> {
    if (sendOuts.length === 0) return;
    // If party balls are still appearing, wait for them to finish showing up, as
    // the FadeAnimation will make them disappear.
    while (this.inPartyAnimation()) await this.pbUpdate();
    this.briefMessage = false;
    // Graphics the animations need (Ruby loads them as it goes)
    await preloadBitmaps(sendOuts.flatMap((b) => ballGraphics(((this.b.battlers[b[0]]!.effects[PBEffects.Illusion] as Pokemon | null) || b[1]).pokeBall)));
    // Make all trainers and party lineups disappear (player-side trainers may
    // animate throwing a Poké Ball)
    const fadeAnim: SceneAnimation = this.b.opposes(sendOuts[0]![0])
      ? new TrainerFade(this.sprites, this.viewport, startBattle)
      : new PlayerFade(this.sprites, this.viewport, startBattle);
    // For each battler being sent out, set the battler's sprite and create two
    // animations (the Poké Ball moving and battler appearing from it, and its
    // data box appearing)
    const sendOutAnims: [SceneAnimation, SceneAnimation, boolean][] = [];
    for (let i = 0; i < sendOuts.length; i++) {
      const b = sendOuts[i]!;
      const pkmn = (this.b.battlers[b[0]]!.effects[PBEffects.Illusion] as Pokemon | null) || b[1];
      await this.pbChangePokemon(b[0], pkmn);
      this.pbRefresh();
      let sendOutAnim: SceneAnimation;
      if (this.b.opposes(b[0])) {
        sendOutAnim = new PokeballTrainerSendOut(this.sprites, this.viewport,
          this.b.pbGetOwnerIndexFromBattlerIndex(b[0]) + 1, this.b.battlers[b[0]]!, startBattle, i);
      } else {
        sendOutAnim = new PokeballPlayerSendOut(this.sprites, this.viewport,
          this.b.pbGetOwnerIndexFromBattlerIndex(b[0]) + 1, this.b.battlers[b[0]]!, startBattle, i);
      }
      const dataBoxAnim = new DataBoxAppear(this.sprites, this.viewport, b[0]);
      sendOutAnims.push([sendOutAnim, dataBoxAnim, false]);
    }
    // Play all animations
    for (;;) {
      fadeAnim.update();
      for (const a of sendOutAnims) {
        if (a[2]) continue;
        a[0].update();
        if (a[0].animDone()) a[1].update();
        if (a[1].animDone()) a[2] = true;
      }
      await this.pbUpdate();
      if (!this.inPartyAnimation() && !sendOutAnims.some((a) => !a[2])) break;
    }
    fadeAnim.dispose();
    for (const a of sendOutAnims) {
      a[0].dispose();
      a[1].dispose();
    }
    // Play shininess animations for shiny Pokémon
    for (const b of sendOuts) {
      const bt = this.b.battlers[b[0]]!;
      if (!this.b.showAnims || !bt.shiny()) continue;
      if (Settings.SUPER_SHINY && bt.superShiny()) {
        await this.pbCommonAnimation("SuperShiny", bt);
      } else {
        await this.pbCommonAnimation("Shiny", bt);
      }
    }
  }

  /** Animates a Pokémon being recalled into its Poké Ball and its data box hiding */
  async pbRecall(idxBattler: number): Promise<void> {
    this.briefMessage = false;
    const bt = this.b.battlers[idxBattler]!;
    await preloadBitmaps(ballGraphics(this.sprites[`pokemon_${idxBattler}`].pkmn?.pokeBall));
    // Recall animation
    const recallAnim = new BattlerRecall(this.sprites, this.viewport, bt);
    for (;;) {
      recallAnim.update();
      await this.pbUpdate();
      if (recallAnim.animDone()) break;
    }
    recallAnim.dispose();
    // Data box disappear animation
    const dataBoxAnim = new DataBoxDisappear(this.sprites, this.viewport, idxBattler);
    for (;;) {
      dataBoxAnim.update();
      await this.pbUpdate();
      if (dataBoxAnim.animDone()) break;
    }
    dataBoxAnim.dispose();
  }

  //=============================================================================
  // Ability splash bar animations
  //=============================================================================
  async pbShowAbilitySplash(battler: SceneBattler): Promise<void> {
    if (!BattleScene.USE_ABILITY_SPLASH) return;
    const side = battler.index % 2;
    if (this.sprites[`abilityBar_${side}`].visible) await this.pbHideAbilitySplash(battler);
    this.sprites[`abilityBar_${side}`].battler = battler;
    const abilitySplashAnim = new AbilitySplashAppear(this.sprites, this.viewport, side);
    for (;;) {
      abilitySplashAnim.update();
      await this.pbUpdate();
      if (abilitySplashAnim.animDone()) break;
    }
    abilitySplashAnim.dispose();
  }

  async pbHideAbilitySplash(battler: SceneBattler): Promise<void> {
    if (!BattleScene.USE_ABILITY_SPLASH) return;
    const side = battler.index % 2;
    if (!this.sprites[`abilityBar_${side}`].visible) return;
    const abilitySplashAnim = new AbilitySplashDisappear(this.sprites, this.viewport, side);
    for (;;) {
      abilitySplashAnim.update();
      await this.pbUpdate();
      if (abilitySplashAnim.animDone()) break;
    }
    abilitySplashAnim.dispose();
  }

  async pbReplaceAbilitySplash(battler: SceneBattler): Promise<void> {
    if (!BattleScene.USE_ABILITY_SPLASH) return;
    await this.pbShowAbilitySplash(battler);
  }

  //=============================================================================
  // HP change animations
  //=============================================================================
  /**
   * Shows a HP-changing common animation and animates a data box's HP bar.
   * Called by def pbReduceHP, def pbRecoverHP.
   */
  async pbHPChanged(battler: SceneBattler, oldHP: number, showAnim = false): Promise<void> {
    this.briefMessage = false;
    if (battler.hp > oldHP) {
      if (showAnim && this.b.showAnims) await this.pbCommonAnimation("HealthUp", battler);
    } else if (battler.hp < oldHP) {
      if (showAnim && this.b.showAnims) await this.pbCommonAnimation("HealthDown", battler);
    }
    const box: PokemonDataBox = this.sprites[`dataBox_${battler.index}`];
    box.animateHP(oldHP, battler.hp, battler.totalhp);
    while (box.animatingHP) await this.pbUpdate();
  }

  async pbDamageAnimation(battler: SceneBattler, effectiveness = 0): Promise<void> {
    this.briefMessage = false;
    // Damage animation
    const damageAnim = new BattlerDamage(this.sprites, this.viewport, battler.index, effectiveness);
    for (;;) {
      damageAnim.update();
      await this.pbUpdate();
      if (damageAnim.animDone()) break;
    }
    damageAnim.dispose();
  }

  /**
   * Animates battlers flashing and data boxes' HP bars because of damage taken
   * by an attack. targets is an array, which are all animated simultaneously.
   * Each element in targets is also an array: [battler, old HP, effectiveness]
   */
  async pbHitAndHPLossAnimation(targets: [SceneBattler, number, number][]): Promise<void> {
    this.briefMessage = false;
    // Set up animations
    const damageAnims: BattlerDamage[] = [];
    for (const t of targets) {
      const anim = new BattlerDamage(this.sprites, this.viewport, t[0].index, t[2]);
      damageAnims.push(anim);
      this.sprites[`dataBox_${t[0].index}`].animateHP(t[1], t[0].hp, t[0].totalhp);
    }
    // Update loop
    for (;;) {
      for (const a of damageAnims) a.update();
      await this.pbUpdate();
      let allDone = true;
      for (const t of targets) {
        if (!this.sprites[`dataBox_${t[0].index}`].animatingHP) continue;
        allDone = false;
        break;
      }
      if (!allDone) continue;
      for (const a of damageAnims) {
        if (a.animDone()) continue;
        allDone = false;
        break;
      }
      if (!allDone) continue;
      break;
    }
    for (const a of damageAnims) a.dispose();
  }

  //=============================================================================
  // Animates a data box's Exp bar
  //=============================================================================
  async pbEXPBar(battler: SceneBattler | null, startExp: number, endExp: number, tempExp1: number, tempExp2: number): Promise<void> {
    if (!battler || endExp === startExp) return;
    const startExpLevel = tempExp1 - startExp;
    const endExpLevel = tempExp2 - startExp;
    const expRange = endExp - startExp;
    const dataBox: PokemonDataBox = this.sprites[`dataBox_${battler.index}`];
    dataBox.animateExp(startExpLevel, endExpLevel, expRange);
    while (dataBox.animatingExp) await this.pbUpdate();
  }

  //=============================================================================
  // Shows stats windows upon a Pokémon levelling up
  //=============================================================================
  async pbLevelUp(pkmn: Pokemon, _battler: SceneBattler | null, oldTotalHP: number, oldAttack: number, oldDefense: number,
    oldSpAtk: number, oldSpDef: number, oldSpeed: number): Promise<void> {
    await pbTopRightWindow(
      _INTL("Max. HP<r>+{1}\r\nAttack<r>+{2}\r\nDefense<r>+{3}\r\nSp. Atk<r>+{4}\r\nSp. Def<r>+{5}\r\nSpeed<r>+{6}",
        pkmn.totalhp - oldTotalHP, pkmn.attack - oldAttack, pkmn.defense - oldDefense,
        pkmn.spatk - oldSpAtk, pkmn.spdef - oldSpDef, pkmn.speed - oldSpeed),
    );
    await pbTopRightWindow(
      _INTL("Max. HP<r>{1}\r\nAttack<r>{2}\r\nDefense<r>{3}\r\nSp. Atk<r>{4}\r\nSp. Def<r>{5}\r\nSpeed<r>{6}",
        pkmn.totalhp, pkmn.attack, pkmn.defense, pkmn.spatk, pkmn.spdef, pkmn.speed),
    );
  }

  //=============================================================================
  // Animates a Pokémon fainting (with ZUD Mechanics' alias: Dynamax ends first)
  //=============================================================================
  async pbFaintBattler(battler: SceneBattler): Promise<void> {
    if (this.b.battlers[battler.index]!.dynamax?.()) this.b.battlers[battler.index]!.unmax?.();
    this.briefMessage = false;
    const pkmn: Pokemon | null = this.sprites[`pokemon_${battler.index}`].pkmn;
    await Promise.all([preloadCryLength(pkmn, "_faint"), preloadCryLength(pkmn)]);
    // Pokémon plays cry and drops down, data box disappears
    const faintAnim = new BattlerFaint(this.sprites, this.viewport, battler.index, this.b);
    const dataBoxAnim = new DataBoxDisappear(this.sprites, this.viewport, battler.index);
    for (;;) {
      faintAnim.update();
      dataBoxAnim.update();
      await this.pbUpdate();
      if (faintAnim.animDone() && dataBoxAnim.animDone()) break;
    }
    faintAnim.dispose();
    dataBoxAnim.dispose();
  }

  //=============================================================================
  // Animates throwing a Poké Ball at a Pokémon in an attempt to catch it
  //=============================================================================
  async pbThrow(ball: Id, shakes: number, critical: boolean, targetBattler: number, showPlayer = false): Promise<void> {
    this.briefMessage = false;
    await preloadBitmaps(ballGraphics(ball));
    const captureAnim = new PokeballThrowCapture(this.sprites, this.viewport, ball, shakes, critical,
      this.b.battlers[targetBattler]!, showPlayer);
    for (;;) {
      captureAnim.update();
      await this.pbUpdate();
      if (captureAnim.animDone() && !this.inPartyAnimation()) break;
    }
    captureAnim.dispose();
  }

  async pbThrowSuccess(): Promise<void> {
    if (this.b.opponent) return;
    this.briefMessage = false;
    pbMEPlay(pbGetWildCaptureME());
    let timer = 0.0;
    for (;;) {
      await this.pbUpdate();
      timer += Graphics.deltaS;
      if (timer >= 3.5) break;
    }
    Audio.meStop(); // pbMEStop
  }

  async pbHideCaptureBall(idxBattler: number): Promise<void> {
    // NOTE: It's not really worth writing a whole Battle::Scene::Animation class
    //       for making the capture ball fade out.
    const ball: IconSprite | null = this.sprites.captureBall;
    if (!ball) return;
    // Data box disappear animation
    const dataBoxAnim = new DataBoxDisappear(this.sprites, this.viewport, idxBattler);
    for (;;) {
      dataBoxAnim.update();
      if (ball.opacity > 0) ball.opacity = Math.max(0, ball.opacity - Math.floor((12 * 20) / FRAME_RATE));
      await this.pbUpdate();
      if (dataBoxAnim.animDone() && ball.opacity <= 0) break;
    }
    dataBoxAnim.dispose();
  }

  async pbThrowAndDeflect(ball: Id, idxBattler: number): Promise<void> {
    this.briefMessage = false;
    await preloadBitmaps(ballGraphics(ball));
    const throwAnim = new PokeballThrowDeflect(this.sprites, this.viewport, ball, this.b.battlers[idxBattler]!);
    for (;;) {
      throwAnim.update();
      await this.pbUpdate();
      if (throwAnim.animDone()) break;
    }
    throwAnim.dispose();
  }

  //=============================================================================
  // Hides all battler shadows before yielding to a move animation, and then
  // restores the shadows afterwards
  //=============================================================================
  async pbSaveShadows(block: () => Promise<void>): Promise<void> {
    // Remember which shadows were visible
    const shadows = this.b.battlers.map((_b, i) => {
      const shadow = this.sprites[`shadow_${i}`];
      const ret = shadow ? shadow.visible : false;
      if (shadow) shadow.visible = false;
      return ret;
    });
    // Yield to other code, i.e. playing an animation
    await block();
    // Restore shadow visibility
    for (let i = 0; i < this.b.battlers.length; i++) {
      const shadow = this.sprites[`shadow_${i}`];
      if (shadow) shadow.visible = shadows[i];
    }
  }

  //=============================================================================
  // Loads a move/common animation
  //=============================================================================
  /**
   * Returns the animation ID to use for a given move/user. Returns null if that
   * move has no animations defined for it.
   */
  pbFindMoveAnimDetails(move2anim: MoveToAnim, moveID: Id, idxUser: number, hitNum = 0): [number, boolean] | null {
    const realMoveId = MoveData.get(moveID).id;
    let noFlip = false;
    let anim: number | undefined;
    if ((idxUser & 1) === 0) { // On player's side
      anim = move2anim[0][realMoveId];
    } else { // On opposing side
      anim = move2anim[1][realMoveId];
      if (anim != null) noFlip = true;
      if (anim == null) anim = move2anim[0][realMoveId];
    }
    if (anim != null) return [anim + hitNum, noFlip];
    return null;
  }

  /**
   * Returns the animation ID to use for a given move. If the move has no
   * animations, tries to use a default move animation depending on the move's
   * type. If that default move animation doesn't exist, trues to use Tackle's
   * move animation. Returns null if it can't find any of these animations to use.
   */
  pbFindMoveAnimation(moveID: Id, idxUser: number, hitNum: number): [number, boolean] | null {
    try {
      const move2anim = pbLoadMoveToAnim();
      // Find actual animation requested (an opponent using the animation first
      // looks for an OppMove version then a Move version)
      let anim = this.pbFindMoveAnimDetails(move2anim, moveID, idxUser, hitNum);
      if (anim) return anim;
      // Actual animation not found, get the default animation for the move's type
      const moveData = MoveData.get(moveID);
      const targetData = Target.get(moveData.target);
      const moveType = moveData.type;
      let moveKind: number = moveData.category;
      if (targetData.numTargets > 1 || targetData.affectsFoeSide) moveKind += 3;
      if (moveKind === 2 && targetData.numTargets > 0) moveKind += 3;
      // [one target physical, one target special, user status,
      //  multiple targets physical, multiple targets special, non-user status]
      const typeDefaultAnim: Record<string, (Id | null)[]> = {
        NORMAL: ["TACKLE", "SONICBOOM", "DEFENSECURL", "EXPLOSION", "SWIFT", "TAILWHIP"],
        FIGHTING: ["MACHPUNCH", "AURASPHERE", "DETECT", null, null, null],
        FLYING: ["WINGATTACK", "GUST", "ROOST", null, "AIRCUTTER", "FEATHERDANCE"],
        POISON: ["POISONSTING", "SLUDGE", "ACIDARMOR", null, "ACID", "POISONPOWDER"],
        GROUND: ["SANDTOMB", "MUDSLAP", null, "EARTHQUAKE", "EARTHPOWER", "MUDSPORT"],
        ROCK: ["ROCKTHROW", "POWERGEM", "ROCKPOLISH", "ROCKSLIDE", null, "SANDSTORM"],
        BUG: ["TWINEEDLE", "BUGBUZZ", "QUIVERDANCE", null, "STRUGGLEBUG", "STRINGSHOT"],
        GHOST: ["LICK", "SHADOWBALL", "GRUDGE", null, null, "CONFUSERAY"],
        STEEL: ["IRONHEAD", "MIRRORSHOT", "IRONDEFENSE", null, null, "METALSOUND"],
        FIRE: ["FIREPUNCH", "EMBER", "SUNNYDAY", null, "INCINERATE", "WILLOWISP"],
        WATER: ["CRABHAMMER", "WATERGUN", "AQUARING", null, "SURF", "WATERSPORT"],
        GRASS: ["VINEWHIP", "MEGADRAIN", "COTTONGUARD", "RAZORLEAF", null, "SPORE"],
        ELECTRIC: ["THUNDERPUNCH", "THUNDERSHOCK", "CHARGE", null, "DISCHARGE", "THUNDERWAVE"],
        PSYCHIC: ["ZENHEADBUTT", "CONFUSION", "CALMMIND", null, "SYNCHRONOISE", "MIRACLEEYE"],
        ICE: ["ICEPUNCH", "ICEBEAM", "MIST", null, "POWDERSNOW", "HAIL"],
        DRAGON: ["DRAGONCLAW", "DRAGONRAGE", "DRAGONDANCE", null, "TWISTER", null],
        DARK: ["PURSUIT", "DARKPULSE", "HONECLAWS", null, "SNARL", "EMBARGO"],
        FAIRY: ["TACKLE", "FAIRYWIND", "MOONLIGHT", null, "SWIFT", "SWEETKISS"],
      };
      const anims = typeDefaultAnim[moveType];
      if (anims) {
        const exists = (m: Id | null | undefined) => m != null && MoveData.exists(m);
        if (exists(anims[moveKind])) anim = this.pbFindMoveAnimDetails(move2anim, anims[moveKind]!, idxUser);
        if (!anim && moveKind >= 3 && exists(anims[moveKind - 3])) {
          anim = this.pbFindMoveAnimDetails(move2anim, anims[moveKind - 3]!, idxUser);
        }
        if (!anim && exists(anims[2])) anim = this.pbFindMoveAnimDetails(move2anim, anims[2]!, idxUser);
      }
      if (anim) return anim;
      // Default animation for the move's type not found, use Tackle's animation
      if (MoveData.exists("TACKLE")) return this.pbFindMoveAnimDetails(move2anim, "TACKLE", idxUser);
    } catch {
      // rescue
    }
    return null;
  }

  //=============================================================================
  // Plays a move/common animation
  //=============================================================================
  /** Plays a move animation. */
  async pbAnimation(moveID: Id, user: SceneBattler | null, targets: SceneBattler | SceneBattler[] | null, hitNum = 0): Promise<void> {
    if (!user) return; // (Ruby would raise reading nil.index)
    const animID = this.pbFindMoveAnimation(moveID, user.index, hitNum);
    if (!animID) return;
    const anim = animID[0];
    const target = Array.isArray(targets) ? targets[0] ?? null : targets;
    const animations = pbLoadBattleAnimations();
    if (!animations) return;
    await this.pbSaveShadows(async () => {
      if (animID[1]) { // On opposing side and using OppMove animation
        await this.pbAnimationCore(animations.get(anim), target, user, true);
      } else { // On player's side, and/or using Move animation
        await this.pbAnimationCore(animations.get(anim), user, target);
      }
    });
  }

  /** Plays a common animation (with Generation 9 Pack's Commander check). */
  async pbCommonAnimation(animName: string | null, user: SceneBattler | null = null, target: SceneBattler | SceneBattler[] | null = null): Promise<void> {
    if (user && user.isCommander?.()) return;
    if (Array.isArray(target)) target = target[0] ?? null;
    if (target && target.isCommander?.()) return;
    if (!animName) return;
    const animations = pbLoadBattleAnimations();
    if (!animations) return;
    for (const a of animations.array) {
      if (!a || a.name !== "Common:" + animName) continue;
      await this.pbAnimationCore(a, user, target || user);
      return;
    }
  }

  /** ZUD Mechanics' version: keeps Dynamaxed sprites' zoom while the animation plays. */
  async pbAnimationCore(animation: PBAnimation | null, user: SceneBattler | null, target: SceneBattler | null, oppMove = false): Promise<void> {
    if (!animation) return;
    this.briefMessage = false;
    await preloadAnimationGraphics(animation);
    const userSprite: BattlerSprite | null = user ? this.sprites[`pokemon_${user.index}`] : null;
    const targetSprite: BattlerSprite | null = target ? this.sprites[`pokemon_${target.index}`] : null;
    // Remember the original positions of Pokémon sprites
    const oldUserX = userSprite ? userSprite.x : 0;
    const oldUserY = userSprite ? userSprite.y : 0;
    const oldTargetX = targetSprite ? targetSprite.x : oldUserX;
    const oldTargetY = targetSprite ? targetSprite.y : oldUserY;
    // Applies Dynamax effects to sprites.
    let oldUserZoomX = 1, oldUserZoomY = 1, oldTargetZoomX = 1, oldTargetZoomY = 1;
    if (Settings.SHOW_DYNAMAX_SIZE) {
      oldUserZoomX = userSprite ? userSprite.zoomX : 1;
      oldUserZoomY = userSprite ? userSprite.zoomY : 1;
      oldTargetZoomX = targetSprite ? targetSprite.zoomX : 1;
      oldTargetZoomY = targetSprite ? targetSprite.zoomY : 1;
    }
    // Create the animation player
    const animPlayer = new PBAnimationPlayerX(animation, user, target, this, oppMove);
    // Apply a transformation to the animation based on where the user and target
    // actually are. Get the centres of each sprite.
    const userHeight = userSprite?.bitmap && !userSprite.bitmap.isDisposed() ? userSprite.bitmap.height : 128;
    let targetHeight: number;
    if (targetSprite) {
      targetHeight = targetSprite.bitmap && !targetSprite.bitmap.isDisposed() ? targetSprite.bitmap.height : 128;
    } else {
      targetHeight = userHeight;
    }
    animPlayer.setLineTransform(
      FOCUSUSER_X, FOCUSUSER_Y, FOCUSTARGET_X, FOCUSTARGET_Y,
      oldUserX, oldUserY - Math.floor(userHeight / 2), oldTargetX, oldTargetY - Math.floor(targetHeight / 2),
    );
    // Play the animation
    animPlayer.start();
    for (;;) {
      animPlayer.update();
      // Updates Dynamax effects on sprites.
      if (Settings.SHOW_DYNAMAX_SIZE) {
        if (userSprite) userSprite.zoomX = oldUserZoomX;
        if (userSprite) userSprite.zoomY = oldUserZoomY;
        if (targetSprite) targetSprite.zoomX = oldTargetZoomX;
        if (targetSprite) targetSprite.zoomY = oldTargetZoomY;
      }
      await this.pbUpdate();
      if (animPlayer.animDone()) break;
    }
    animPlayer.dispose();
    // Return Pokémon sprites to their original positions
    if (userSprite) {
      userSprite.x = oldUserX;
      userSprite.y = oldUserY;
      userSprite.pbSetOrigin();
    }
    if (targetSprite) {
      targetSprite.x = oldTargetX;
      targetSprite.y = oldTargetY;
      targetSprite.pbSetOrigin();
    }
  }

  /** Ball burst common animations should have a focus of "Target" and a priority of "Front". */
  async pbBallBurstCommonAnimation(_pictureEx: unknown, animName: string | null, battler: SceneBattler | null, targetX: number, targetY: number): Promise<void> {
    if (!animName) return;
    const animations = pbLoadBattleAnimations();
    const anim = animations?.getFromName("Common:" + animName);
    if (!anim) return;
    await preloadAnimationGraphics(anim);
    const animPlayer = new PBAnimationPlayerX(anim, battler, null, this);
    animPlayer.discardUserAndTargetSprites(); // Don't involve user/target in animation
    animPlayer.setTargetOrigin(targetX, targetY);
    animPlayer.start();
    this.animations.push(animPlayer);
  }

  //=============================================================================
  // Essentials Deluxe additions ([000] Battle_Scene.rb)
  //=============================================================================
  /** Checks if a common animation exists. */
  pbCommonAnimationExists(animName: string): boolean {
    const animations = pbLoadBattleAnimations();
    for (const a of animations?.array ?? []) {
      if (!a || a.name !== "Common:" + animName) continue;
      return true;
    }
    return false;
  }

  /** Calls an animation to revert a battler from various battle states. */
  async pbRevertBattlerStart(idxBattler: number): Promise<void> {
    const reversionAnim = new RevertBattlerStart(this.sprites, this.viewport, idxBattler, this.b);
    for (;;) {
      reversionAnim.update();
      await this.pbUpdate();
      if (reversionAnim.animDone()) break;
    }
    reversionAnim.dispose();
  }

  async pbRevertBattlerEnd(): Promise<void> {
    const reversionAnim = new RevertBattlerEnd(this.sprites, this.viewport, this.b);
    for (;;) {
      reversionAnim.update();
      await this.pbUpdate();
      if (reversionAnim.animDone()) break;
    }
    reversionAnim.dispose();
  }

  //=============================================================================
  // Essentials Deluxe: midbattle speech ([002] Battle Deluxe/Battle_Scene.rb)
  //=============================================================================
  pbMidbattleInit(): void {
    const nameWindow = new Window_AdvancedTextPokemon();
    nameWindow.baseColor = BattleScene.MESSAGE_BASE_COLOR;
    nameWindow.shadowColor = BattleScene.MESSAGE_SHADOW_COLOR;
    nameWindow.viewport = this.viewport;
    nameWindow.letterbyletter = false;
    nameWindow.visible = false;
    nameWindow.x = 16;
    nameWindow.y = SCREEN_H - 158;
    nameWindow.z = 200;
    this.sprites.nameWindow = nameWindow;
    const trainerType = (G.player as unknown as { trainerType?: Id } | null)?.trainerType;
    const defaultFile = trainerType ? TrainerType.frontSpriteFilename(trainerType, resolveBitmap) : null;
    const [spriteX, spriteY] = BattleScene.pbTrainerPosition(1);
    const sprite = this.pbAddSprite("midbattle_guest", spriteX, spriteY, defaultFile, this.viewport);
    if (!sprite.bitmap) return;
    sprite.z = 7;
    sprite.ox = Math.floor(sprite.srcRect.width / 2);
    sprite.oy = sprite.bitmap.height;
    sprite.visible = false;
  }

  /**
   * pbUpdateGuestSprite(id): a species ([species, gender, form, shiny, shadow])
   * or trainer type speaker. Its graphic must be preloaded to show at once.
   */
  pbUpdateGuestSprite(id: unknown): void {
    const sym = (Array.isArray(id) ? id[0] : id) as Id;
    const [spriteX, spriteY] = BattleScene.pbTrainerPosition(1);
    let speaker: { name: string; gender: number } | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sprite: any = null;
    if (Species.exists(sym)) {
      const pkmn = new Pokemon(sym, 1);
      if (Array.isArray(id)) {
        pkmn.gender = (id[1] as number) || 0;
        pkmn.form = (id[2] as number) || 0;
        pkmn.shiny = !!id[3];
        if (id[4]) pkmn.makeShadow();
      } else if (!pkmn.singleGendered()) {
        pkmn.gender = 0;
      }
      speaker = { name: pkmn.name, gender: pkmn.gender };
      sprite = new PokemonSprite(this.viewport);
      this.sprites.midbattle_guest = sprite;
      sprite.setPokemonBitmap(pkmn);
      sprite.setOffset(PictureOrigin.BOTTOM);
      sprite.x = spriteX;
      sprite.y = spriteY;
      if (sprite.bitmap) {
        sprite.ox = Math.floor(sprite.srcRect.width / 2);
        sprite.oy = sprite.bitmap.height;
      }
      const sd = pkmn.speciesData();
      SpeciesMetrics.getSpeciesForm(sd.species, sd.form)!.applyMetricsToSprite(sprite, 1);
    } else if (TrainerType.exists(sym)) {
      const tt = TrainerType.get(sym);
      speaker = { name: tt.name, gender: tt.gender };
      sprite = new IconSprite(spriteX, spriteY, this.viewport);
      this.sprites.midbattle_guest = sprite;
      if (resolveBitmap("Graphics/Trainers/" + sym)) sprite.setBitmapFile("Graphics/Trainers/" + sym);
      if (sprite.bitmap) {
        sprite.ox = Math.floor(sprite.srcRect.width / 2);
        sprite.oy = sprite.bitmap.height;
      }
    }
    if (sprite) {
      sprite.z = 7;
      sprite.visible = false;
    }
    if (speaker) {
      this.namePanelName ??= speaker.name;
      this.namePanelSkin ??= speaker.gender;
    }
    this.pbUpdateNameWindow(speaker, false);
  }

  pbUpdateNameWindow(speaker: unknown = "", visible = true, reset = false): void {
    if (reset) {
      this.namePanelName = null;
      this.namePanelSkin = null;
    }
    let newName: string;
    let newSkin: unknown;
    if (speaker == null || typeof speaker === "string") {
      newName = this.namePanelName ?? "";
      newSkin = this.namePanelSkin;
    } else {
      const sp = speaker as { name?: string; gender?: number };
      newName = this.namePanelName ?? sp.name ?? "";
      newSkin = this.namePanelSkin ?? sp.gender;
    }
    if (typeof newSkin !== "string" || !newSkin) {
      switch (newSkin) {
        case 0: newSkin = UISettings.MENU_WINDOWSKINS[4]; break;
        case 1: newSkin = UISettings.MENU_WINDOWSKINS[2]; break;
        default: newSkin = UISettings.MENU_WINDOWSKINS[0];
      }
    }
    const w: Window_AdvancedTextPokemon = this.sprites.nameWindow;
    w.text = newName;
    w.resizeToFit(newName);
    w.setSkin("Graphics/Windowskins/" + (newSkin as string));
    w.visible = !(!newName || !visible);
  }

  async pbShowSlideSprite(id: number | string | unknown[] | null): Promise<void> {
    const appearAnim = new SlideSpriteAppear(this.sprites, this.viewport, id, this.b, this);
    this.animations.push(appearAnim);
    while (this.inPartyAnimation()) await this.pbUpdate();
  }

  async pbHideSlideSprite(): Promise<void> {
    const hideAnim = new SlideSpriteDisappear(this.sprites, this.viewport, this.b, this);
    this.animations.push(hideAnim);
    while (this.inPartyAnimation()) await this.pbUpdate();
  }

  async pbToggleDataboxes(toggle = false): Promise<void> {
    const dataBoxAnim = new ToggleDataBoxes(this.sprites, this.viewport, this.b.battlers, toggle);
    for (;;) {
      dataBoxAnim.update();
      await this.pbUpdate();
      if (dataBoxAnim.animDone()) break;
    }
    dataBoxAnim.dispose();
  }

  async pbToggleBlackBars(toggle = false): Promise<void> {
    if (!this.sprites.topBar) this.pbAddSprite("topBar", SCREEN_W, 0, "Graphics/Plugins/Essentials Deluxe/Animations/blackbar_top", this.viewport);
    if (!this.sprites.bottomBar) this.pbAddSprite("bottomBar", 0, SCREEN_H, "Graphics/Plugins/Essentials Deluxe/Animations/blackbar_bottom", this.viewport);
    const blackBarAnim = new ToggleBlackBars(this.sprites, this.viewport, toggle);
    for (;;) {
      blackBarAnim.update();
      await this.pbUpdate();
      if (blackBarAnim.animDone()) break;
    }
    blackBarAnim.dispose();
    const mw: Window_AdvancedTextPokemon = this.sprites.messageWindow;
    mw.text = "";
    if (toggle) {
      const { MessageConfig } = await import("../../ui/messageConfig");
      mw.baseColor = MessageConfig.LIGHT_TEXT_MAIN_COLOR;
      mw.shadowColor = MessageConfig.LIGHT_TEXT_SHADOW_COLOR;
      mw.z += 1;
    } else {
      const { getDefaultTextColors } = await import("../../ui/messageConfig");
      const colors = getDefaultTextColors(mw.windowskin);
      mw.baseColor = colors[0];
      mw.shadowColor = colors[1];
      mw.z -= 1;
    }
  }

  async pbBattlerFlee(battler: SceneBattler, msg: string | null = null): Promise<void> {
    this.briefMessage = false;
    const fleeAnim = new BattlerFlee(this.sprites, this.viewport, battler.index, this.b);
    const dataBoxAnim = new DataBoxDisappear(this.sprites, this.viewport, battler.index);
    for (;;) {
      fleeAnim.update();
      dataBoxAnim.update();
      await this.pbUpdate();
      if (fleeAnim.animDone() && dataBoxAnim.animDone()) break;
    }
    fleeAnim.dispose();
    dataBoxAnim.dispose();
    const pbThis = battler.pbThis?.() ?? battler.name;
    if (typeof msg === "string") {
      await this.b.pbDisplayPaused?.(_INTL(msg, pbThis));
    } else {
      await this.b.pbDisplayPaused?.(_INTL("{1} fled!", pbThis));
    }
  }

  async pbFlashRefresh(): Promise<void> {
    let tone = 0;
    let toneDiff = Math.floor((20 * 20) / FRAME_RATE);
    for (;;) {
      await Graphics.update();
      await this.pbUpdate();
      tone += toneDiff;
      this.viewport.tone.set(tone, tone, tone, 0);
      if (tone >= 255) break;
    }
    this.pbRefreshEverything();
    for (let i = 0; i < Math.floor(FRAME_RATE / 4); i++) {
      await Graphics.update();
      await this.pbUpdate();
    }
    tone = 255;
    toneDiff = Math.floor((40 * 20) / FRAME_RATE);
    for (;;) {
      await Graphics.update();
      await this.pbUpdate();
      tone -= toneDiff;
      this.viewport.tone.set(tone, tone, tone, 0);
      if (tone <= 0) break;
    }
  }

  // Ruby reaches these through `@battle.scene`; the core may read them.
  get lastCmds(): readonly number[] { return this.lastCmd; }
  get lastMoves(): readonly number[] { return this.lastMove; }
  /** For the dev page / tests: the moves the fight menu shows. */
  fightMenuMoves(idxBattler: number): (SceneMove | null)[] { return this.b.battlers[idxBattler]?.moves ?? []; }
}

/** Essentials Deluxe's pbPlayBattleButton */
export function pbPlayBattleButton(): void {
  pbSEPlay("DX Power Button", 80);
}
