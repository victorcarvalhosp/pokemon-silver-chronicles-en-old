// Port of Essentials Deluxe's midbattle scripting:
// - [002] Battle Deluxe/Midbattle_Main.rb:9-1382 (Battle::Scene#dx_midbattle
//   and everything it runs: speech, battler/team/field changes, forced
//   switches/items/moves, battle mechanics, weather/terrain/backdrop);
// - [002] Battle Deluxe/Midbattle_Triggers.rb:6-61 (Battle::Scene#initialize's
//   midbattle state and #pbDeluxeTriggers, which the battle calls at every
//   trigger point).
// The script is $game_temp.dx_midbattle (G.gameTemp.dxMidbattle): a hash of
// trigger => String/Array (speech) or Hash (effects), with Ruby Symbols as
// Syms (see rubyData.ts).
//
// Ruby defines these on Battle::Scene; here they're functions of the scene,
// installed on a scene class with installMidbattle (deluxe/index.ts installs
// them on BattleScene; the tests on their logging scene). pbDeluxeTriggers
// calls scene.dxMidbattle, so a scene can replace it (DebugSceneNoLogging's
// is a no-op, as in Ruby).
//
// Randomness: Ruby's Kernel#rand and Array#sample here are the battle's
// random stream (battle.pbRandom), as everywhere in a battle.

import { Ability } from "../../data/gameData/ability";
import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { Environment } from "../../data/gameData/environment";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { Status } from "../../data/gameData/status";
import { Target } from "../../data/gameData/target";
import { Effectiveness } from "../../data/gameData/type";
import { assetExists } from "../../core/assets";
import { pbBGMFade, pbBGMPlay, pbSEPlay } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { startsWithVowel } from "../../game/items/itemUtilities";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import { pbWait } from "../../ui/scenes/frames";
import type { Battle } from "../battle/Battle";
import {
  triggerBattleUseOnBattler, triggerBattleUseOnPokemon, triggerCanUseInBattle, triggerUseInBattle,
} from "../battle/Battle_ActionUseItem";
import type { Battler } from "../battler/Battler";
import { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { dxMidbattleQ } from "./DeluxeTemp";
import "./Midbattle_Effects";
import { idOf, isHash, isSym, rubyEquals, rubyToS, sym, type Sym } from "./rubyData";

/** What the midbattle code needs from the scene (Battle::Scene). */
export interface MidbattleScene {
  battle: unknown;
  // Midbattle state (Midbattle_Triggers.rb:13-20)
  midbattleVar: number;
  midbattleChoice: unknown;
  midbattleDecision: number;
  midbattleDelay: string[];
  midbattleIgnore: string[];
  namePanelName: string | null;
  namePanelSkin: unknown;
  /** dx_midbattle (DebugSceneNoLogging replaces it with a no-op). */
  dxMidbattle(idxBattler: number | null, idxTarget: number | null, ...triggers: string[]): Promise<void>;
  // Scene methods the scripts use ([002] Battle Deluxe/Battle_Scene.rb, 001-004 Scene)
  pbUpdateNameWindow(speaker?: unknown, visible?: boolean, reset?: boolean): void;
  pbShowSlideSprite(id: unknown): Promise<void>;
  pbHideSlideSprite(): Promise<void>;
  pbToggleDataboxes(toggle?: boolean): Promise<void>;
  pbToggleBlackBars(toggle?: boolean): Promise<void>;
  pbShowCommands(msg: string, commands: string[], defaultValue: number): Promise<number>;
  pbAnimation(moveID: Id, user: Battler | null, targets: Battler | Battler[] | null, hitNum?: number): Promise<void>;
  pbCommonAnimation(animName: string, user?: Battler | null, target?: Battler | Battler[] | null): Promise<void>;
  pbHitAndHPLossAnimation(targets: [Battler, number, number][]): Promise<void>;
  pbRefresh(): void;
  pbFlashRefresh(): Promise<void>;
}

//===============================================================================
// Ruby helpers
//===============================================================================
const battleOf = (scene: MidbattleScene): Battle => scene.battle as Battle;
/** Ruby truthiness (only nil and false are false). */
const truthy = (v: unknown): boolean => v != null && v !== false;
/** array[i] with Ruby's negative indices. */
function rubyAt<T>(arr: readonly T[], i: number): T | undefined {
  return i < 0 ? arr[arr.length + i] : arr[i];
}
/** String#split("_"): trailing empty strings are dropped. */
function rubySplit(s: string, sep = "_"): string[] {
  if (s === "") return [];
  const parts = s.split(sep);
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}
/** String#to_i: the leading integer, or 0. */
function rubyToI(s: string | undefined): number {
  const m = /^\s*[-+]?\d+/.exec(s ?? "");
  return m ? parseInt(m[0], 10) : 0;
}
/** Integer division as Ruby does it (floors). */
const idiv = (a: number, b: number): number => Math.floor(a / b);
/** Array#sample, from the battle's random stream. */
function sample<T>(battle: Battle, arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[battle.pbRandom(arr.length)];
}
/** str[i] for a String or Array (a Hash has no element 0: nil). */
function at(v: unknown, i: number): unknown {
  return typeof v === "string" || Array.isArray(v) ? v[i] : undefined;
}
/** lowercase = (msg[0] == "{" && msg[1] == "1") ? false : true */
const lowercaseFor = (msg: unknown): boolean => !(at(msg, 0) === "{" && at(msg, 1) === "1");
/** msg.gsub(/\\[Pp][Nn]/, @battle.pbPlayer.name) */
const withPlayerName = (battle: Battle, msg: string): string => msg.replace(/\\[Pp][Nn]/g, () => battle.pbPlayer().name);
/** The name window's view of a speaker (a trainer, the player or a wild battler): name and gender. */
function speakerInfo(speaker: unknown): unknown {
  if (speaker == null || typeof speaker === "string") return speaker;
  const s = speaker as { name: string; gender: number | (() => number) };
  return { name: s.name, gender: typeof s.gender === "function" ? s.gender() : s.gender };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHash = Record<string, any>;

const TURN_TRIGGERS = ["turnCommand", "turnAttack", "turnEnd"];

//===============================================================================
// Midbattle_Triggers.rb:26 — compiles a list of all viable triggers of each
// type to check for.
//===============================================================================
export async function pbDeluxeTriggers(scene: MidbattleScene, idxBattler: number | { index: number } | null,
  idxTarget: number | { index: number } | null, triggers: string[]): Promise<void> {
  if (!dxMidbattleQ()) return;
  const battle = battleOf(scene);
  let array: string[] = [];
  if (idxBattler != null && typeof idxBattler === "object") idxBattler = idxBattler.index;
  // (The core passes idxTarget as an index; a battler object is accepted too.)
  if (idxTarget != null && typeof idxTarget === "object") idxTarget = idxTarget.index;
  if (idxBattler != null) {
    const battler = rubyAt(battle.battlers, idxBattler)!;
    for (const t of triggers) array.push(battler.pbOwnedByPlayer() ? t : battler.opposes() ? t + "_foe" : t + "_ally");
  } else {
    array = [...triggers];
  }
  const oldvar = scene.midbattleVar;
  if (array.length > 0) await scene.dxMidbattle(idxBattler, idxTarget, ...array);
  if (scene.midbattleChoice != null && scene.midbattleDecision > 0) {
    for (;;) {
      const choice = scene.midbattleChoice;
      const tag = Array.isArray(choice) ? rubyToS(choice[0]) : rubyToS(choice);
      const trigs = ["choice_" + tag + "_" + String(scene.midbattleDecision)];
      if (Array.isArray(choice)) {
        const decision = scene.midbattleDecision === choice[1] ? "correct" : "incorrect";
        trigs.push("choice_" + tag + "_" + decision);
      }
      const oldchoice = scene.midbattleChoice;
      await scene.dxMidbattle(idxBattler, idxTarget, ...trigs);
      if (rubyEquals(scene.midbattleChoice, oldchoice)) break;
    }
    scene.midbattleChoice = null;
    scene.midbattleDecision = 0;
  }
  if (scene.midbattleVar !== oldvar) {
    const trigs = ["variable_" + String(scene.midbattleVar), "variable_under_" + String(scene.midbattleVar + 1)];
    for (let i = 0; i < scene.midbattleVar; i++) trigs.push("variable_over_" + String(i));
    const tag = scene.midbattleVar > oldvar ? "up" : "down";
    trigs.push("variable_" + tag);
    await scene.dxMidbattle(idxBattler, idxTarget, ...trigs);
  }
}

//===============================================================================
// Midbattle_Main.rb:10 — procs mid-battle effects.
//===============================================================================
export async function dxMidbattle(scene: MidbattleScene, idxBattler: number | null, idxTarget: number | null,
  ...triggers: string[]): Promise<void> {
  if (!dxMidbattleQ()) return;
  const battle = battleOf(scene);
  const midbattle = G.gameTemp.dxMidbattle!;
  let altTrainer: number | null = null;
  let altBattler: Battler | null = null;
  const baseBattler = midbattleBattler(scene, idxBattler, idxTarget, sym("Self"))!;
  const baseTrainer = idxBattler != null ? battle.pbGetOwnerIndexFromBattlerIndex(idxBattler) : 0;
  let randTrigRoll = battle.pbRandom(100) < 50;
  const allTriggers: string[] = [];
  //---------------------------------------------------------------------------
  // Creates an array of all possible triggers.
  for (const trigger of triggers) {
    allTriggers.push(trigger);
    const trig = rubySplit(trigger);
    if (trig.length > 1 && TURN_TRIGGERS.includes(trig[0]!)) {
      if (rubyToI(trig[1]) < 2) continue;
      allTriggers.push(trig[0] + "_every_" + trig[1]);
    } else {
      if (TURN_TRIGGERS.includes(trigger)) allTriggers.push(trigger + "_repeat_alt");
      allTriggers.push(trigger + "_random");
      if (!trigger.includes("_repeat")) {
        allTriggers.push(trigger + "_repeat");
        allTriggers.push(trigger + "_repeat_random");
      }
      for (const mid of Object.keys(midbattle)) {
        if (!(mid.includes(trigger + "_random_") || mid.includes(trigger + "_repeat_random_"))) continue;
        const odds = rubyToI(rubySplit(mid).at(-1));
        if (odds > 0 && odds < 100) {
          allTriggers.push(mid);
          randTrigRoll = battle.pbRandom(100) < odds;
        }
      }
    }
  }
  //---------------------------------------------------------------------------
  // Sets the [:delay] and/or [:ignore] keys if conditions have been met.
  for (const mid of Object.keys(midbattle)) {
    const m = midbattle[mid];
    if (!isHash(m)) continue;
    if ("delay" in m) {
      if (Array.isArray(m.delay)) {
        for (const delayTrigger of m.delay) {
          if (allTriggers.includes(delayTrigger as string)) {
            scene.midbattleDelay.push(mid);
            break;
          }
        }
      } else if (allTriggers.includes(m.delay as string)) {
        scene.midbattleDelay.push(mid);
      }
    }
    if ("ignore" in m) {
      if (Array.isArray(m.ignore)) {
        for (const ignoreTrigger of m.ignore) {
          if (allTriggers.includes(ignoreTrigger as string)) {
            scene.midbattleIgnore.push(mid);
            break;
          }
        }
      } else if (allTriggers.includes(m.ignore as string)) {
        scene.midbattleIgnore.push(mid);
      }
    }
  }
  //---------------------------------------------------------------------------
  // Processes each trigger and runs their commands if a match is found.
  for (let trigger of allTriggers) {
    if (trigger.includes("every")) {
      const trig = rubySplit(trigger);
      if (!(trig.length === 3 && trig[1] === "every")) continue;
      let turn: number | null = null;
      for (const k of Object.keys(midbattle)) {
        if (!k.includes(trig[0] + "_every_")) continue;
        trigger = k;
        turn = rubyToI(rubySplit(k).at(-1));
      }
      if (turn == null || turn < 2 || rubyToI(trig[2]) % turn !== 0) continue;
    } else if (!(trigger in midbattle)) {
      continue;
    }
    if (trigger.includes("_random") && !randTrigRoll) continue;
    if (trigger.includes("repeat_alt") && (1 + battle.turnCount) % 2 === 0) continue;
    const entry = midbattle[trigger];
    //-------------------------------------------------------------------------
    // When trigger is set to a String or Array, plays trainer speech if possible.
    if (typeof entry === "string" || Array.isArray(entry)) {
      await pbMidbattleSpeech(scene, baseTrainer, idxTarget, baseBattler, entry);
      if (trigger.includes("_repeat") || trigger.includes("_every_")) continue;
      delete G.gameTemp.dxMidbattle![trigger];
    //-------------------------------------------------------------------------
    // When trigger is set to a Proc (not implemented).
    } else if (typeof entry === "function") {
      if (trigger.includes("_repeat") || trigger.includes("_every_")) continue;
      delete G.gameTemp.dxMidbattle![trigger];
    //-------------------------------------------------------------------------
    // When trigger is set to a hash, applies all effects entered in the hash.
    } else if (isHash(entry)) {
      const keys: [string, string][] = Object.keys(entry).map((k) => [rubySplit(k)[0] ?? "", k]);
      let repeat = false;
      for (const key of keys) {
        const trainer = altTrainer == null ? baseTrainer : altTrainer;
        const battler = altBattler == null ? baseBattler : altBattler;
        if (!truthy(midbattle[trigger])) continue;
        const value = (midbattle[trigger] as AnyHash)[key[1]];
        let stop = false;
        switch (key[0]) {
          //---------------------------------------------------------------------
          // Sets the battler.
          case "battler":
            altBattler = midbattleBattler(scene, idxBattler, idxTarget, value);
            break;
          //---------------------------------------------------------------------
          // Sets the trainer.
          case "trainer": {
            const tempBattler = midbattleBattler(scene, idxBattler, idxTarget, value)!;
            altTrainer = battle.pbGetOwnerIndexFromBattlerIndex(tempBattler.index);
            break;
          }
          //---------------------------------------------------------------------
          // Delays further actions until the inputted trigger has been met.
          case "delay":
            if (!scene.midbattleDelay.includes(trigger)) {
              repeat = true;
              stop = true;
            }
            break;
          //---------------------------------------------------------------------
          // Ignores further actions once the inputted trigger has been met.
          case "ignore":
            if (scene.midbattleIgnore.includes(trigger)) stop = true;
            break;
          //---------------------------------------------------------------------
          // Pauses further actions for a number of frames.
          case "wait": case "pause": await pbWait(value as number); break;
          //---------------------------------------------------------------------
          // Changes BGM.
          case "bgm": case "music": await midbattleChangeBGM(scene, value); break;
          //---------------------------------------------------------------------
          // Sets midbattle variable and choice selections.
          case "setvariable": case "setvar": midbattleSetVariable(scene, value); break;
          case "setchoice": scene.midbattleChoice = value; break;
          //---------------------------------------------------------------------
          // Plays a sound effect.
          case "playcry": case "cry": battler.pokemon!.playCry(); break;
          case "playsound": case "playSE": pbSEPlay(value as string); break;
          //---------------------------------------------------------------------
          // Displays text and speech.
          case "speech": case "dialogue": await pbMidbattleSpeech(scene, trainer, idxTarget, battler, value); break;
          case "text": case "message": await pbMidbattleSpeech(scene, trainer, idxTarget, battler, value, false); break;
          case "blankspeech": await pbMidbattleSpeech(scene, trainer, idxTarget, battler, value, true, true); break;
          //---------------------------------------------------------------------
          // Plays an animation.
          case "anim": case "animation": await midbattlePlayAnimation(scene, battler, idxTarget, value); break;
          //---------------------------------------------------------------------
          // Forces a battler to switch out.
          case "switch": await midbattleForceSwitch(scene, battler, value); break;
          //---------------------------------------------------------------------
          // Uses an item on a battler.
          case "useitem": await midbattleUseItem(scene, battler, value); break;
          //---------------------------------------------------------------------
          // Forces a battler to select a particular move.
          case "usemove": midbattleUseMove(scene, battler, value); break;
          //---------------------------------------------------------------------
          // Handles special battle mechanics (Mega, Z-Move, etc.).
          case "usespecial": await midbattleTriggerBattleMechanic(scene, battler, value); break;
          case "lockspecial": midbattleToggleBattleMechanic(scene, battler, value); break;
          //---------------------------------------------------------------------
          // Toggles the charge state of the player's Tera Orb.
          case "teracharge":
            // NOTE (Ruby parity): Player#tera_charged= only exists with the
            // Terastal Phenomenon plugin, which isn't installed: Ruby raises a
            // NoMethodError here (Midbattle_Main.rb:176).
            throw new Error("NoMethodError: undefined method `tera_charged=' for Player");
          //---------------------------------------------------------------------
          // Toggles whether Poke Balls are disabled or not.
          case "disableballs": battle.disablePokeBalls = value; break;
          //---------------------------------------------------------------------
          // Renames a battler.
          case "rename": case "nickname":
            battler.pokemon!.name = value;
            battler.name = battler.pokemon!.name;
            scene.pbRefresh();
            break;
          //---------------------------------------------------------------------
          // Changes to battler attributes.
          case "hp": await midbattleChangeHP(scene, battler, value); break;
          case "status": await midbattleChangeStatus(scene, battler, value); break;
          case "form": await midbattleChangeForm(scene, battler, value); break;
          case "ability": await midbattleChangeAbility(scene, battler, value); break;
          case "item": case "helditem": await midbattleChangeItem(scene, battler, value); break;
          case "move": case "moves": await midbattleChangeMoves(scene, battler, value); break;
          case "stat": case "stats": await midbattleChangeStats(scene, battler, value); break;
          case "effect": case "effects": await midbattleBattlerEffects(scene, battler, value); break;
          //---------------------------------------------------------------------
          // Changes to properties of the battlefield, or one side of the field.
          case "team": case "teams": await midbattleTeamEffects(scene, battler, value); break;
          case "field": await midbattleFieldEffects(scene, battler, value); break;
          case "weather": await midbattleChangeWeather(scene, battler, value); break;
          case "terrain": await midbattleChangeTerrain(scene, battler, value); break;
          case "environ": case "environment": midbattleChangeEnvironment(scene, value); break;
          case "backdrop": case "background": await midbattleChangeBackdrop(scene, value); break;
          //---------------------------------------------------------------------
          // Prematurely ends the battle.
          case "endbattle":
            if (battle.decision > 0) continue;
            battle.decision = value;
            break;
        }
        if (stop) break;
      }
      if (trigger.includes("_repeat") || trigger.includes("_every_") || repeat) continue;
      delete G.gameTemp.dxMidbattle![trigger];
    }
  }
}

//===============================================================================
// Displays mid-battle text.
//===============================================================================
/** The speaker of a battler's lines (Midbattle_Main.rb:229-237, 260-268). */
function speakerFor(battle: Battle, idxTrainer: number, battler: Battler): [unknown, number | null] | null {
  if ((battle.decision === 2 || battle.pbAllFainted()) ||
      (battler.opposes() && battle.opponent != null && battle.opponent[idxTrainer])) {
    // NOTE (Ruby parity): on a loss in a wild battle, @battle.opponent is nil:
    // Ruby raises a NoMethodError here (Midbattle_Main.rb:231).
    if (battle.opponent == null) throw new Error("NoMethodError: undefined method `[]' for nil:NilClass");
    return [battle.opponent[idxTrainer], idxTrainer];
  } else if (battler.opposes() && battle.opponent == null) {
    return [battler, null];
  } else if (!battler.opposes() && battle.player != null && battle.player[idxTrainer]) {
    return [battle.player[idxTrainer], null];
  }
  return null; // (the speaker doesn't change)
}

export async function pbMidbattleSpeech(scene: MidbattleScene, idxTrainer: number, idxTarget: number | null,
  battler: Battler, speech: unknown, dialogue = true, nospeaker = false): Promise<void> {
  if ((speech as string | unknown[]).length === 0) return;
  const battle = battleOf(scene);
  await pbWait(8);
  //---------------------------------------------------------------------------
  // Determines the speaker of the inputted text.
  //---------------------------------------------------------------------------
  let choiceText: string | null = null;
  const first = speakerFor(battle, idxTrainer, battler);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let speaker: any = first ? first[0] : undefined;
  let slideSprite: unknown = first ? first[1] : null;
  scene.pbUpdateNameWindow(speakerInfo(speaker), false, true);
  let playSE = false, playCry = false, playAnim = false, setSpeaker = false;
  if (dialogue) {
    await scene.pbToggleDataboxes();
    await scene.pbToggleBlackBars(true);
  }
  /** Shows a choice and the reply for the chosen option (choices given as a Hash). */
  const showChoice = async (sp: unknown, prompt: string, arg1: string): Promise<void> => {
    const choices = isHash(sp) ? Object.keys(sp) : (sp as string[]);
    const cmd = await scene.pbShowCommands(prompt, choices, -1);
    if (isHash(sp)) {
      const msg = _INTL(rubyToS(sp[choices[cmd]!]), arg1, speaker.name);
      const choice = scene.midbattleChoice;
      if (Array.isArray(choice)) { // Correct choice exists.
        const buzzer = choice[1] === cmd + 1 ? "Mining found all" : "Anim/buzzer";
        await battle.pbDisplayPaused(withPlayerName(battle, msg), () => pbSEPlay(buzzer, 80));
      } else {
        await battle.pbDisplayPaused(withPlayerName(battle, msg));
      }
    }
    scene.midbattleDecision = cmd + 1;
    choiceText = null;
  };
  //---------------------------------------------------------------------------
  // Handles all text and speech entered as an array.
  //---------------------------------------------------------------------------
  if (Array.isArray(speech)) {
    for (let i = 0; i < speech.length; i++) {
      const sp: unknown = speech[i];
      //-----------------------------------------------------------------------
      // Changes index of current speaker.
      if (typeof sp === "number" || isSym(sp, "Self", "Ally", "Ally2", "Opposing", "OpposingAlly", "OpposingAlly2")) {
        const battlerNew = midbattleBattler(scene, battler.index, idxTarget, sp)!;
        if (battler.index !== battlerNew.index) {
          battler = battlerNew;
          idxTrainer = battle.pbGetOwnerIndexFromBattlerIndex(battler.index);
          scene.pbUpdateNameWindow(null, false, true);
          await scene.pbHideSlideSprite();
          slideSprite = null;
          const found = speakerFor(battle, idxTrainer, battler);
          if (found) [speaker, slideSprite] = found;
        }
      //-----------------------------------------------------------------------
      // Sets various non-text related variables.
      } else if (isSym(sp, "SE")) {
        playSE = true;
      } else if (isSym(sp, "Cry")) {
        playCry = true;
      } else if (isSym(sp, "Anim")) {
        playAnim = true;
      } else if (isSym(sp, "Speaker")) {
        setSpeaker = true;
      } else {
        //---------------------------------------------------------------------
        // Plays sounds & animations
        if (playCry && battler != null) battler.pokemon!.playCry();
        if (playSE) {
          pbSEPlay(sp as string);
        } else if (playAnim) {
          await midbattlePlayAnimation(scene, battler, idxTarget, sp);
        //---------------------------------------------------------------------
        // Changes attributes of current speaker (name, skin, sprite).
        } else if (setSpeaker) {
          scene.pbUpdateNameWindow(null, false, true);
          let newSlideSprite: unknown = null;
          if (typeof sp === "string") {
            scene.namePanelName = sp;
          } else if (isSym(sp)) {
            newSlideSprite = sp;
          } else if (isHash(sp)) {
            scene.namePanelName = (sp.name as string) ?? null;
            scene.namePanelSkin = sp.skin ?? null;
            newSlideSprite = sp.sprite ?? null;
          }
          if (truthy(newSlideSprite) && !rubyEquals(newSlideSprite, slideSprite)) {
            await scene.pbHideSlideSprite();
            slideSprite = newSlideSprite;
          }
          scene.pbUpdateNameWindow(speakerInfo(speaker), false);
        //---------------------------------------------------------------------
        // Determines if next speech entry should display as choices.
        } else if (typeof sp === "string" && (Array.isArray(speech[i + 1]) || isHash(speech[i + 1]))) {
          choiceText = sp;
        //---------------------------------------------------------------------
        // Displays dialogue speech.
        //---------------------------------------------------------------------
        } else if (dialogue) {
          if (!nospeaker) {
            await scene.pbShowSlideSprite(slideSpriteId(slideSprite));
            scene.pbUpdateNameWindow(speakerInfo(speaker));
            slideSprite = null;
          } else {
            scene.pbUpdateNameWindow(null);
          }
          //-------------------------------------------------------------------
          // Show speech with choices.
          if (choiceText != null) {
            await showChoice(sp, _INTL(choiceText, battler.name, speaker.name), battler.name);
          //-------------------------------------------------------------------
          // Show normal speech.
          } else if (typeof sp === "string") {
            const msg = _INTL(sp, battler.name, speaker.name);
            await battle.pbDisplayPaused(withPlayerName(battle, msg));
          }
        //---------------------------------------------------------------------
        // Displays message text.
        //---------------------------------------------------------------------
        } else {
          const lowercase = lowercaseFor(sp);
          //-------------------------------------------------------------------
          // Show text with choices.
          if (choiceText != null) {
            await showChoice(sp, _INTL(choiceText, battler.pbThis(lowercase), speaker.name), battler.pbThis(lowercase));
          //-------------------------------------------------------------------
          // Show normal text.
          } else if (typeof sp === "string") {
            const msg = _INTL(sp, battler.pbThis(lowercase), speaker.name);
            await battle.pbDisplayPaused(withPlayerName(battle, msg));
          }
        }
        playSE = playCry = playAnim = setSpeaker = false;
      }
    }
  //---------------------------------------------------------------------------
  // Handles all text and speech entered as a string.
  //---------------------------------------------------------------------------
  } else {
    const text = speech as string;
    //-------------------------------------------------------------------------
    // Displays dialogue speech.
    if (dialogue) {
      if (!nospeaker) {
        await scene.pbShowSlideSprite(slideSpriteId(slideSprite));
        scene.pbUpdateNameWindow(speakerInfo(speaker));
        slideSprite = null;
      } else {
        scene.pbUpdateNameWindow(null);
      }
      const msg = _INTL(text, battler.name, speaker.name);
      await battle.pbDisplayPaused(withPlayerName(battle, msg));
    //-------------------------------------------------------------------------
    // Displays message text.
    } else {
      const lowercase = lowercaseFor(text);
      const msg = _INTL(text, battler.pbThis(lowercase), speaker.name);
      await battle.pbDisplayPaused(withPlayerName(battle, msg));
    }
  }
  //---------------------------------------------------------------------------
  // Ends dialogue.
  //---------------------------------------------------------------------------
  if (dialogue) {
    scene.pbUpdateNameWindow(null, false, true);
    await scene.pbToggleBlackBars();
    await scene.pbToggleDataboxes(true);
    await scene.pbHideSlideSprite();
  }
}

/**
 * What pbShowSlideSprite gets: a trainer index, a species/trainer type ID (a
 * Symbol), [species, gender, form, shiny, shadow] or nil.
 */
function slideSpriteId(v: unknown): unknown {
  if (v instanceof Object && isSym(v)) return v.name;
  if (Array.isArray(v)) return v.map((e) => (isSym(e) ? e.name : e));
  return v;
}

//===============================================================================
// Gets a particular battler to target during midbattle checks.
//===============================================================================
export function midbattleBattler(scene: MidbattleScene, idxBattler: number | null, idxTarget: number | null,
  index: unknown): Battler | null {
  const battle = battleOf(scene);
  const battlers = battle.battlers;
  // NOTE (Ruby parity): indices index Ruby arrays, so a negative one counts
  // from the end: move triggers pass the move's target, -1 when it has no
  // single target, and :Opposing then picks the last battler
  // (Midbattle_Triggers.rb:280, Midbattle_Main.rb:431).
  //---------------------------------------------------------------------------
  // Targets specified index.
  if (typeof index === "number") {
    return rubyAt(battlers, index) ?? battlers[0]!;
  //---------------------------------------------------------------------------
  // Targets a battler on ally's side.
  } else if (isSym(index, "Self", "Ally", "Ally2")) {
    const battler = idxBattler != null && rubyAt(battlers, idxBattler) ? rubyAt(battlers, idxBattler)! : battlers[0]!;
    const allies = battler.allAllies();
    if (allies.length > 0) {
      if (index.name === "Ally") return allies[0]!;
      if (index.name === "Ally2") return allies[allies.length - 1]!;
    }
    return battler;
  //---------------------------------------------------------------------------
  // Targets a battler on opposing side.
  } else if (isSym(index, "Opposing", "OpposingAlly", "OpposingAlly2")) {
    const def = idxBattler != null && rubyAt(battlers, idxBattler) ? rubyAt(battlers, idxBattler)! : battlers[0]!;
    const battler = idxTarget != null && rubyAt(battlers, idxTarget) ? rubyAt(battlers, idxTarget)! : def.pbDirectOpposing();
    const allies = battler.allAllies();
    if (allies.length > 0) {
      if (index.name === "OpposingAlly") return allies[0]!;
      if (index.name === "OpposingAlly2") return allies[allies.length - 1]!;
    }
    return battler;
  }
  return null;
}

//===============================================================================
// Changes the value of the midbattle variable.
//===============================================================================
export function midbattleSetVariable(scene: MidbattleScene, value: unknown): void {
  if (Array.isArray(value)) {
    const n = value[1] as number;
    if (isSym(value[0], "add")) scene.midbattleVar += n;
    else if (isSym(value[0], "sub")) scene.midbattleVar -= n;
    else if (isSym(value[0], "mult")) scene.midbattleVar *= n;
    else if (isSym(value[0], "div")) scene.midbattleVar = Number.isInteger(n) ? idiv(scene.midbattleVar, n) : scene.midbattleVar / n;
  } else {
    scene.midbattleVar += value as number;
  }
  // NOTE (Ruby parity): `@midbattle_var.round` (Midbattle_Main.rb:457) doesn't
  // assign, so a Float stays a Float.
}

//===============================================================================
// Changes the background music.
//===============================================================================
async function midbattleChangeBGM(scene: MidbattleScene, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (battle.decision > 0) return;
  let bgm: string, fade: number, volume: number | undefined, pitch: number | undefined;
  if (Array.isArray(value)) {
    [bgm, fade, volume, pitch] = [value[0] as string, (value[1] as number) * 1.0, value[2] ?? undefined, value[3] ?? undefined];
  } else {
    [bgm, fade, volume, pitch] = [value as string, 0.0, undefined, undefined];
  }
  pbBGMFade(fade);
  // NOTE (Ruby parity): the fade is in seconds, but this waits fade * 60 frames
  // of 40 fps (1.5 times as long).
  await pbWait(Math.round(fade * 60));
  pbBGMPlay(bgm, volume, pitch);
}

//===============================================================================
// Plays an animation.
//===============================================================================
async function midbattlePlayAnimation(scene: MidbattleScene, battler: Battler, idxTarget: number | null,
  value: unknown): Promise<void> {
  let anim: unknown, index: unknown;
  if (Array.isArray(value)) {
    [anim, index] = [value[0], value[1]];
  } else {
    [anim, index] = [value, null];
  }
  let target = truthy(index) ? midbattleBattler(scene, battler.index, idxTarget, index) : null;
  // GameData::Move.exists? takes a Symbol or a String
  const animId = idOf(anim);
  if (!target && animId != null && MoveData.exists(animId)) {
    switch (MoveData.get(animId).target) {
      case "NearAlly":
        target = midbattleBattler(scene, battler.index, idxTarget, sym("Ally"));
        break;
      case "Foe": case "NearFoe": case "RandomNearFoe": case "NearOther": case "Other":
        target = midbattleBattler(scene, battler.index, idxTarget, sym("Opposing"));
        break;
      default:
        target = midbattleBattler(scene, battler.index, idxTarget, sym("Self"));
    }
  }
  if (isSym(anim)) await scene.pbAnimation(anim.name, battler, target);
  else if (typeof anim === "string") await scene.pbCommonAnimation(anim, battler, target);
}

//===============================================================================
// Forces a battler to switch out.
//===============================================================================
async function midbattleForceSwitch(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battler.wild() || battle.decision > 0) return;
  let swi: unknown, msg: string | null;
  if (Array.isArray(value)) {
    [swi, msg] = [value[0], (value[1] as string) ?? null];
  } else {
    [swi, msg] = [value, null];
  }
  let canSwitch = false;
  let newPkmn: number | null = null;
  //---------------------------------------------------------------------------
  // Checks if switching is possible.
  const team: [NonNullable<ReturnType<Battle["pbParty"]>[number]>, number][] = [];
  battle.eachInTeamFromBattlerIndex(battler.index, (pkmn, i) => { team.push([pkmn, i]); });
  for (const [pkmn, i] of team) {
    if (!battle.pbCanSwitchLax(battler.index, i)) continue;
    if (isSym(swi, "Choose", "Random", "Forced")) {
      // (any party member)
    } else if (typeof swi === "number") { // Sets switch target to a specified party index.
      if (swi !== i) continue;
      newPkmn = i;
    } else if (isSym(swi)) { // Sets switch target to a specified species ID.
      if (!Species.exists(swi.name)) continue;
      if (swi.name !== pkmn.species) continue;
      newPkmn = i;
    }
    canSwitch = true;
    break;
  }
  //---------------------------------------------------------------------------
  // Forces a switch.
  if (canSwitch) {
    if (newPkmn == null) {
      if (isSym(swi, "Choose")) newPkmn = await battle.pbSwitchInBetween(battler.index);
      else if (isSym(swi, "Random", "Forced")) newPkmn = await battle.pbGetReplacementPokemonIndex(battler.index, true);
    }
    if (newPkmn != null && newPkmn >= 0) {
      const lowercase = !(msg && msg[0] === "{" && msg[1] === "1");
      const trainerName = battle.pbGetOwnerName(battler.index);
      if (msg) {
        msg = _INTL(msg, battler.pbThis(lowercase), trainerName);
        await battle.pbDisplay(withPlayerName(battle, msg));
      }
      if (isSym(swi, "Forced")) {
        await battle.pbDisplay(_INTL("{1} went back to {2}!", battler.pbThis(), trainerName));
        await battle.pbRecallAndReplace(battler.index, newPkmn, true, false, false);
        await battle.pbDisplay(_INTL("{1} was dragged out!", battler.pbThis()));
      } else {
        await battle.pbMessageOnRecall(battler, false);
        await battle.pbRecallAndReplace(battler.index, newPkmn, false, false, false);
      }
      battle.pbClearChoice(battler.index);
      await battle.pbOnBattlerEnteringBattle(battler.index);
    }
  }
}

//===============================================================================
// Uses an item on a battler. Item isn't used from the inventory.
//===============================================================================
async function midbattleUseItem(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  const choices: [unknown, number, unknown, number] = [0, 0, 0, 0];
  const user = battler;
  user.moves.forEach((m, i) => {
    if (i === 0 || m.pp >= m.totalPp()) return;
    const w = user.moves[choices[3]]!;
    const prevDiff = w.totalPp() - w.pp;
    const moveDiff = m.totalPp() - m.pp;
    if (prevDiff > moveDiff) return;
    choices[3] = i;
  });
  const item = idOf(Array.isArray(value) ? sample(battle, value) : value)!;
  if (!await triggerCanUseInBattle(item, battler.pokemon, battler, choices[3], true, battle, scene, false)) return;
  if (Item.get(item).isPokeBall()) {
    if (!battler.opposes()) battler = battler.pbDirectOpposing(true);
  } else {
    const trainerName = battler.wild() ? battler.name : battle.pbGetOwnerName(battler.index);
    await battle.pbUseItemMessage(item, trainerName);
  }
  //---------------------------------------------------------------------------
  // Items that are used directly (Guard Spec., Poke Flute, Poke Ball, etc.)
  if (ItemHandlers.hasUseInBattle(item)) {
    await triggerUseInBattle(item, battler, battle);
  //---------------------------------------------------------------------------
  // Items that are used on a battler (Red Flute, X Attack, Max Mushrooms, etc.)
  } else if (ItemHandlers.hasBattleUseOnBattler(item)) {
    await triggerBattleUseOnBattler(item, battler, scene);
    await battler.pbItemOnStatDropped();
  //---------------------------------------------------------------------------
  // Items that are used on a Pokemon (Potion, Ether, Full Heal, etc.)
  } else if (ItemHandlers.hasBattleUseOnPokemon(item)) {
    await triggerBattleUseOnPokemon(item, battler.pokemon, battler, choices as never, scene);
  } else {
    await battle.pbDisplay(_INTL("But it had no effect!"));
  }
}

//===============================================================================
// Forces the battler to use a specified move.
//===============================================================================
const MOVE_KINDS = ["DamageSelf", "DamageAlly", "DamageFoe", // Damaging moves
  "StatusSelf", "StatusAlly", "StatusFoe", // Status moves
  "HealSelf", "HealAlly", "HealFoe"]; // Healing moves

function midbattleUseMove(scene: MidbattleScene, battler: Battler | null, value: unknown): void {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  const e = battler.effects;
  if (battler.movedThisRound() ||
      e[PBEffects.ChoiceBand] ||
      e[PBEffects.Instructed] ||
      e[PBEffects.TwoTurnAttack] ||
      e[PBEffects.Encore] > 0 ||
      e[PBEffects.HyperBeam] > 0 ||
      e[PBEffects.Outrage] > 0 ||
      e[PBEffects.Rollout] > 0 ||
      e[PBEffects.Uproar] > 0 ||
      e[PBEffects.SkyDrop] >= 0) return;
  const choice = battle.choices[battler.index]!;
  if (choice[0] !== "UseMove") return;
  // PluginManager.installed?("ZUD Mechanics")
  if ((choice[2] as Move).zMove()) return;
  let index = -1;
  let move: unknown, target: number;
  if (Array.isArray(value)) {
    move = value[0];
    target = truthy(value[1]) ? (value[1] as number) : -1;
  } else {
    [move, target] = [value, -1];
  }
  let targBattler = rubyAt(battle.battlers, target) ?? null;
  const reTarget = !targBattler || targBattler.fainted() || !targBattler.near(battler);
  //---------------------------------------------------------------------------
  // Forces a particular kind of move.
  //---------------------------------------------------------------------------
  if (isSym(move, ...MOVE_KINDS)) {
    const kind = move.name;
    //-------------------------------------------------------------------------
    // Finalizes target.
    if (kind.endsWith("Self")) { // Targets self
      target = battler.index;
    } else if (kind.endsWith("Ally")) { // Targets an ally
      if (reTarget || targBattler!.idxOwnSide() !== battler.idxOwnSide()) {
        for (const b of battler.allAllies()) if (battler.near(b)) target = b.index;
        if (target === -1) return;
      }
    } else if (reTarget || targBattler!.idxOwnSide() === battler.idxOwnSide()) { // Targets a foe
      target = battler.pbDirectOpposing(true).index;
    }
    //-------------------------------------------------------------------------
    // Finalizes move.
    battler.moves.forEach((m, i) => {
      switch (kind) {
        case "DamageSelf": case "DamageAlly":
          if (!m.damagingMove()) return; // Finds any damaging move.
          break;
        case "DamageFoe": { // Finds an effective damage-dealing move.
          if (!m.damagingMove()) return;
          targBattler = rubyAt(battle.battlers, target) ?? null;
          const types = targBattler!.pbTypes(true);
          const effct = Effectiveness.calculate(m.pbCalcType(battler)!, types[0] ?? null, types[1] ?? null, types[2] ?? null);
          if (Effectiveness.ineffective(effct)) return;
          if (Effectiveness.notVeryEffective(effct)) return;
          break;
        }
        case "StatusSelf": case "StatusAlly": case "StatusFoe": // Finds a status move.
          if (!m.statusMove()) return;
          if (m.healingMove()) return;
          break;
        case "HealSelf": case "HealAlly": case "HealFoe": // Finds a healing move.
          if (!m.healingMove()) return;
          break;
      }
      const targ = Target.get(MoveData.get(m.id).target);
      if (kind.endsWith("Self")) { // Finds a self-targeting move.
        if (!["User", "UserOrNearAlly", "UserAndAllies"].includes(targ.id)) return;
      } else if (kind.endsWith("Ally")) { // Finds a move that targets an ally.
        if (targ.numTargets === 0) return;
        if (!["NearAlly", "UserOrNearAlly", "AllAllies", "NearOther", "Other"].includes(targ.id)) return;
      } else { // Finds a move that targets a foe.
        if (targ.numTargets === 0) return;
        if (!targ.targetsFoe) return;
      }
      index = i;
    });
    if (index === -1) return;
  //---------------------------------------------------------------------------
  // Forces a move with a specified index or ID.
  //---------------------------------------------------------------------------
  } else if (typeof move === "number" || isSym(move)) {
    //-------------------------------------------------------------------------
    // Finalizes move.
    if (isSym(move)) {
      if (!battler.pbHasMove(move.name)) return;
      battler.moves.forEach((m, i) => { if (m.id === move.name) index = i; });
    } else {
      index = move;
    }
    if (!rubyAt(battler.moves, index)) return;
    //-------------------------------------------------------------------------
    // Finalizes target.
    const targ = Target.get(rubyAt(battler.moves, index)!.target);
    if (targ.numTargets !== 0) {
      if (targ.targetsFoe) {
        if (reTarget || targBattler!.idxOwnSide() === battler.idxOwnSide()) {
          target = battler.pbDirectOpposing(true).index;
        }
      } else if (targ.id === "NearAlly") { // (targ == :NearAlly: GameData#== compares IDs)
        if (reTarget || targBattler!.idxOwnSide() !== battler.idxOwnSide()) {
          target = -1;
          for (const b of battler.allAllies()) if (battler.near(b)) target = b.index;
          if (target === -1) return;
        }
      }
    } else {
      target = battler.index;
    }
  }
  //---------------------------------------------------------------------------
  // Sets the battler's new choices for the forced move.
  //---------------------------------------------------------------------------
  if (index >= 0 && battle.pbCanChooseMove(battler.index, index, false)) {
    choice[1] = index;
    choice[2] = battler.moves[index]!;
  }
  choice[3] = target;
}

//===============================================================================
// Triggers the use of a special battle mechanic (Mega Evolution, Z-Moves, etc).
//===============================================================================
async function midbattleTriggerBattleMechanic(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  const choice = battle.choices[battler.index]!;
  if (choice[0] !== "UseMove") return;
  let special: unknown, msg: string | null;
  if (Array.isArray(value)) {
    [special, msg] = [value[0], (value[1] as string) ?? null];
  } else {
    [special, msg] = [value, null];
  }
  const lowercase = !(msg && msg[0] === "{" && msg[1] === "1");
  const trainerName = battler.wild() ? "" : battle.pbGetOwnerName(battler.index);
  if (msg) msg = _INTL(msg, battler.pbThis(lowercase), trainerName);
  const show = async () => { if (msg) await battle.pbDisplay(withPlayerName(battle, msg)); };
  // ZUD Mechanics' battler/battle methods (web/src/battle/zud), when present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = battler as any, bt = battle as any;
  const name = isSym(special) ? special.name : "";
  switch (name) {
    //-------------------------------------------------------------------------
    // Mega Evolution
    case "MegaEvolution": case "Megaevolution": case "MegaEvolve": case "Megaevolve": case "Mega":
      if (!battle.pbCanMegaEvolve(battler.index)) return;
      await show();
      await battle.pbMegaEvolve(battler.index);
      break;
    //-------------------------------------------------------------------------
    // Z-Moves (PluginManager.installed?("ZUD Mechanics"))
    case "ZMove": case "Zmove": {
      if (battler.movedThisRound()) return;
      if (!battle.pbCanZMove(battler.index)) return;
      if (!b.hasCompatibleZMove(choice[2])) return;
      await show();
      const transform = battler.effects[PBEffects.TransformSpecies];
      choice[2] = b.convertZmove(choice[2], battler.item, transform);
      b.powerTrigger = true;
      b.displayPowerMoves("Z-Move");
      b.selectedMoveIsZMove = true;
      break;
    }
    //-------------------------------------------------------------------------
    // Ultra Burst
    case "UltraBurst": case "Ultraburst": case "Ultra":
      if (!battle.pbCanUltraBurst(battler.index)) return;
      await show();
      b.powerTrigger = true;
      await bt.pbUltraBurst(battler.index);
      break;
    //-------------------------------------------------------------------------
    // Dynamax
    case "Dynamax": case "Dmax":
      if (!battle.pbCanDynamax(battler.index)) return;
      await show();
      if (!battler.movedThisRound()) {
        const transform = battler.effects[PBEffects.TransformSpecies];
        choice[2] = b.convertMaxmove(choice[2], transform);
      }
      b.powerTrigger = true;
      b.displayPowerMoves("Max Move");
      await bt.pbDynamax(battler.index);
      break;
    //-------------------------------------------------------------------------
    // Battle Styles, Terastallization, Zodiac Powers, Focus Meter: their
    // plugins aren't installed (PLA Battle Styles, Terastal Phenomenon,
    // Pokémon Birthsigns, Focus Meter System).
    //-------------------------------------------------------------------------
    // Custom Mechanic
    case "Custom":
      if (!battle.pbCanCustom(battler.index)) return;
      await show();
      await battle.pbCustomMechanic(battler.index);
      break;
  }
}

//===============================================================================
// Toggles the availability of a special battle mechanic (Mega Evolution, Z-Moves, etc).
//===============================================================================
function midbattleToggleBattleMechanic(_scene: MidbattleScene, _battler: Battler | null, value: unknown): void {
  const toggle = (id: number) => G.gameSwitches.set(id, !G.gameSwitches.get(id));
  const name = isSym(value) ? value.name : "";
  switch (name) {
    case "MegaEvolution": case "Megaevolution": case "MegaEvolve": case "Megaevolve": case "Mega":
      toggle(Settings.NO_MEGA_EVOLUTION);
      break;
    // PluginManager.installed?("ZUD Mechanics")
    case "ZMove": case "Zmove": toggle(Settings.NO_Z_MOVE); break;
    case "UltraBurst": case "Ultraburst": case "Ultra": toggle(Settings.NO_ULTRA_BURST); break;
    case "Dynamax": case "Dmax": toggle(Settings.NO_DYNAMAX); break;
    // Battle Styles, Terastallization, Zodiac Powers, Focus Meter: not installed.
  }
}

//===============================================================================
// Changes a battler's HP.
//===============================================================================
async function midbattleChangeHP(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  let amt: number, msg: string | null;
  if (Array.isArray(value)) {
    [amt, msg] = [value[0] as number, (value[1] as string) ?? null];
  } else {
    [amt, msg] = [value as number, null];
  }
  const lowercase = !(msg && msg[0] === "{" && msg[1] === "1");
  const trainerName = battler.wild() ? "" : battle.pbGetOwnerName(battler.index);
  if (msg) msg = _INTL(msg, battler.pbThis(lowercase), trainerName);
  //---------------------------------------------------------------------------
  // Recovers HP
  if (amt > 0) {
    const healed = amt === 1 ? await battler.pbRecoverHP(battler.totalhp)
      : await battler.pbRecoverHP(idiv(battler.totalhp, amt));
    if (msg && healed > 0) await battle.pbDisplay(withPlayerName(battle, msg));
  //---------------------------------------------------------------------------
  // Reduces HP
  } else if (amt < 0) {
    const oldHP = battler.hp;
    if (Math.abs(amt) === 1) battler.hp = 0;
    else battler.hp -= idiv(battler.totalhp, Math.abs(amt));
    if (battler.hp < 0) battler.hp = 0;
    await scene.pbHitAndHPLossAnimation([[battler, oldHP, 0]]);
    if (msg) await battle.pbDisplay(withPlayerName(battle, msg));
    if (battler.fainted()) await battler.pbFaint(true, false);
  }
}

//===============================================================================
// Changes a battler's status.
//===============================================================================
async function midbattleChangeStatus(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  let status: unknown, msg: unknown;
  if (Array.isArray(value)) {
    [status, msg] = [value[0], value[1]];
  } else {
    [status, msg] = [value, false];
  }
  if (Array.isArray(status)) status = sample(battle, status);
  const show = truthy(msg);
  const name = idOf(status);
  if (name === "NONE") {
    //-------------------------------------------------------------------------
    // Cures status condition.
    battler.pbCureAttract();
    battler.pbCureConfusion();
    await battler.pbCureStatus(show);
  } else if (name === "Random") {
    //-------------------------------------------------------------------------
    // Inflicts a random status out of the main status conditions.
    const statuses: Id[] = [];
    for (const s of Status.each()) if (s.id !== "NONE") statuses.push(s.id);
    const st = sample(battle, statuses)!;
    if (!battler.pbCanInflictStatus(st, battler, show)) return;
    await battler.pbInflictStatus(st, st === "SLEEP" ? battler.pbSleepDuration() : 0);
  //---------------------------------------------------------------------------
  // Inflicts the given status condition.
  } else if (name === "CONFUSION") {
    // (pbConfuse's message: nil_or_empty? is true for anything but a String)
    if (battler.pbCanConfuse(battler, show)) await battler.pbConfuse(typeof msg === "string" ? msg : null);
  } else if (name === "TOXIC") {
    if (battler.pbCanPoison(battler, show)) {
      // NOTE (Ruby parity): pbInflictStatus checks `msg && !msg.empty?`, which
      // raises a NoMethodError for true (Battler_Statuses.rb:231).
      if (msg === true) throw new Error("NoMethodError: undefined method `empty?' for true:TrueClass");
      await battler.pbPoison(null, typeof msg === "string" ? msg : null, true);
    }
  } else if (name != null && Status.exists(name) && battler.pbCanInflictStatus(name, battler, show)) {
    await battler.pbInflictStatus(name, name === "SLEEP" ? battler.pbSleepDuration() : 0);
  }
  await battler.pbCheckFormOnStatusChange();
}

//===============================================================================
// Changes a battler's form.
//===============================================================================
async function midbattleChangeForm(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  let form: unknown, msg: unknown;
  if (Array.isArray(value)) {
    [form, msg] = [value[0], value[1]];
  } else {
    [form, msg] = [value, null];
  }
  if (typeof msg === "string") {
    const lowercase = lowercaseFor(msg);
    const trainerName = battler.wild() ? "" : battle.pbGetOwnerName(battler.index);
    msg = _INTL(msg, battler.pbThis(lowercase), trainerName);
  }
  if (isSym(form, "Cycle")) {
    //-------------------------------------------------------------------------
    // Cycles through each of the battler's eligible forms.
    form = battler.form + 1;
  } else if (isSym(form, "Random")) {
    //-------------------------------------------------------------------------
    // Randomizes the battler's form.
    const totalForms: number[] = [];
    for (const s of Species.each()) {
      if (s.species !== battler.species) continue;
      if (s.form === battler.form || s.form === 0) continue;
      totalForms.push(s.form);
    }
    form = sample(battle, totalForms) ?? null;
  }
  //---------------------------------------------------------------------------
  // Changes the battler's form if possilbe.
  if (!truthy(form)) return;
  const newForm = Species.getSpeciesForm(battler.species, form as number)!.form;
  // NOTE (Ruby parity): a message of true reaches pbChangeForm as it is.
  if (battler.form !== newForm) await battler.pbChangeForm(newForm, msg as string | null);
}

//===============================================================================
// Changes a battler's ability.
//===============================================================================
async function midbattleChangeAbility(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  let abil: unknown, msg: unknown;
  if (Array.isArray(value)) {
    [abil, msg] = [value[0], value[1]];
  } else {
    [abil, msg] = [value, null];
  }
  if (Array.isArray(abil)) abil = sample(battle, abil);
  let abilId = idOf(abil);
  if (abilId === "Reset") abilId = battler.pokemon!.abilityId;
  if (abilId != null && Ability.exists(abilId) && !battler.unstoppableAbility() && battler.abilityId !== abilId) {
    if (truthy(msg)) await battle.pbShowAbilitySplash(battler, true, false);
    const oldAbil = battler.abilityId;
    battler.ability = abilId;
    if (truthy(msg)) {
      await battle.pbReplaceAbilitySplash(battler);
      if (typeof msg === "string") {
        const lowercase = lowercaseFor(msg);
        const trainerName = battler.wild() ? "" : battle.pbGetOwnerName(battler.index);
        const text = _INTL(msg, battler.pbThis(lowercase), trainerName);
        await battle.pbDisplay(withPlayerName(battle, text));
      } else {
        await battle.pbDisplay(_INTL("{1} acquired {2}!", battler.pbThis(), battler.abilityName()));
      }
      await battle.pbHideAbilitySplash(battler);
    }
    await battler.pbOnLosingAbility(oldAbil);
    await battler.pbTriggerAbilityOnGainingIt();
  }
}

//===============================================================================
// Changes a battler's item.
//===============================================================================
async function midbattleChangeItem(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  let item: unknown, msg: unknown;
  if (Array.isArray(value)) {
    [item, msg] = [value[0], value[1]];
  } else {
    [item, msg] = [value, null];
  }
  if (Array.isArray(item)) item = sample(battle, item);
  const itemId = idOf(item);
  const olditem = battler.itemId;
  if (itemId === "Remove") {
    battler.item = null;
  } else if (battler.itemId !== itemId && itemId != null && Item.exists(itemId)) {
    battler.item = itemId;
  }
  if (battler.itemId !== olditem) {
    if (truthy(msg)) {
      if (typeof msg === "string") {
        const lowercase = lowercaseFor(msg);
        const trainerName = battler.wild() ? "" : battle.pbGetOwnerName(battler.index);
        const text = _INTL(msg, battler.pbThis(lowercase), trainerName);
        await battle.pbDisplay(withPlayerName(battle, text));
      } else if (battler.itemId) {
        const itemName = Item.get(battler.itemId).portionName;
        const text = startsWithVowel(itemName) ? "an" : "a";
        await battle.pbDisplay(_INTL("{1} obtained {2} {3}!", battler.pbThis(), text, itemName));
      } else if (olditem) {
        await battle.pbDisplay(_INTL("{1}'s held {2} was removed!", battler.pbThis(), Item.get(olditem).name));
      }
    }
    await battler.pbCheckFormOnHeldItemChange();
  }
}

//===============================================================================
// Changes a battler's moves.
//===============================================================================
async function midbattleChangeMoves(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  const moves = battler.moves as (Move | null)[];
  if (Array.isArray(value)) {
    //-------------------------------------------------------------------------
    // Replaces a battler's moveset with an array of moves.
    value.forEach((m, i) => {
      if (m == null) moves[i] = null;
      const id = idOf(m);
      if (id == null || !MoveData.exists(id)) return;
      moves[i] = Move.fromPokemonMove(battle, new PokemonMove(id));
    });
    battler.moves = moves.filter((m): m is Move => m != null);
  } else if (isSym(value, "Reset")) {
    //-------------------------------------------------------------------------
    // Resets a battler's moveset to its original moves.
    battler.pokemon!.resetMoves();
    for (let i = 0; i < battler.pokemon!.numMoves(); i++) {
      battler.moves[i] = Move.fromPokemonMove(battle, battler.pokemon!.moves[i]!);
    }
  } else {
    //-------------------------------------------------------------------------
    // Replaces a battler's first move slot with a specified move.
    const id = idOf(value);
    if (id != null && MoveData.exists(id)) battler.moves[0] = Move.fromPokemonMove(battle, new PokemonMove(id));
  }
  await battler.pbCheckFormOnMovesetChange();
}

//===============================================================================
// Changes a battler's stat stages.
//===============================================================================
async function midbattleChangeStats(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  const stats: Id[] = [];
  for (const s of Stat.eachBattle()) stats.push(s.id);
  const removeStat = (s: Id) => { const i = stats.indexOf(s); if (i >= 0) stats.splice(i, 1); };
  if (Array.isArray(value)) {
    //-------------------------------------------------------------------------
    // Changes a battler's stat stages.
    let showAnim = true;
    let lastChange = 0;
    for (const s of value) {
      if (typeof s === "number" || isSym(s, "Random")) continue;
      removeStat(idOf(s) ?? "");
    }
    for (let i = 0; i < Math.floor(value.length / 2); i++) {
      let stat: unknown = value[i * 2];
      const stage: unknown = value[i * 2 + 1];
      //-----------------------------------------------------------------------
      // Determines a stat to change if randomized.
      if (isSym(stat, "Random")) {
        for (;;) {
          if (stats.length === 0) break;
          const randstat = sample(battle, stats);
          if (randstat) removeStat(randstat);
          if (value.some((v) => isSym(v) && v.name === randstat)) continue;
          stat = sym(randstat!);
          break;
        }
      }
      if (!isSym(stat) || !Stat.exists(stat.name)) continue;
      if (typeof stage !== "number" || !Number.isInteger(stage) || stage === 0) continue;
      const statId = stat.name;
      //-----------------------------------------------------------------------
      // Raise stat stage.
      if (stage > 0) {
        if (!await battler.pbCanRaiseStatStage(statId, battler)) continue;
        if (!showAnim && lastChange === -1) showAnim = true;
        if (await battler.pbRaiseStatStage(statId, stage, battler, showAnim)) {
          showAnim = false;
          lastChange = 1;
        }
      //-----------------------------------------------------------------------
      // Lower stat stage.
      } else {
        if (!await battler.pbCanLowerStatStage(statId, battler)) continue;
        if (!showAnim && lastChange === 1) showAnim = true;
        if (await battler.pbLowerStatStage(statId, Math.abs(stage), battler, showAnim)) {
          showAnim = false;
          lastChange = -1;
        }
        if (await battler.pbItemOnStatDropped()) break;
      }
    }
    await battler.pbItemStatRestoreCheck();
  } else if (isSym(value, "Reset")) {
    //-------------------------------------------------------------------------
    // Resets all of a battler's stat stages.
    if (battler.hasAlteredStatStages()) {
      battler.pbResetStatStages();
      await battle.pbDisplay(_INTL("{1}'s stat changes were removed!", battler.pbThis()));
    }
  } else if (isSym(value, "Reset_Raised")) {
    //-------------------------------------------------------------------------
    // Resets all of a battler's positive stat stages.
    if (battler.hasRaisedStatStages()) {
      battler.statsDropped = true;
      battler.statsLoweredThisRound = true;
      for (const s of Stat.eachBattle()) if (battler.stages[s.id]! > 0) battler.stages[s.id] = 0;
      await battle.pbDisplay(_INTL("{1}'s positive stat changes were removed!", battler.pbThis()));
    }
  } else if (isSym(value, "Reset_Lowered")) {
    //-------------------------------------------------------------------------
    // Resets all of a battler's negative stat stages.
    if (battler.hasLoweredStatStages()) {
      battler.statsRaisedThisRound = true;
      for (const s of Stat.eachBattle()) if (battler.stages[s.id]! < 0) battler.stages[s.id] = 0;
      await battle.pbDisplay(_INTL("{1}'s negative stat changes were removed!", battler.pbThis()));
    }
  }
}

//===============================================================================
// Applies effects on a battler, its team or the battlefield.
//===============================================================================
async function midbattleBattlerEffects(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battler.fainted() || battle.decision > 0) return;
  for (const eff of value as unknown[][]) {
    const [effect, setting, msg] = [eff[0] as number, eff[1], (eff[2] as string) ?? null];
    const lowercase = !(msg && msg[0] === "{" && msg[1] === "1");
    await battler.applyBattlerEffects(effect, setting, msg, lowercase);
  }
}

async function midbattleTeamEffects(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battle.decision > 0) return;
  const skipMessage: number[] = [];
  for (const eff of value as unknown[][]) {
    const [effect, setting, msg, userMsg] = [eff[0] as number, eff[1], (eff[2] as string) ?? null, eff[3] ?? null];
    const lowercase = !(msg && msg[0] === "{" && msg[1] === "1");
    let index = 0;
    switch (battler.idxOwnSide()) {
      case 0: index = battler.index % 2 === 0 ? 0 : 1; break;
      case 1: index = battler.index % 2 === 1 ? 0 : 1; break;
    }
    const ret = await battler.applyTeamEffects(effect, setting, index, skipMessage, msg, lowercase, userMsg);
    if (ret != null) skipMessage.push(ret);
  }
}

async function midbattleFieldEffects(scene: MidbattleScene, battler: Battler | null, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (!battler || battle.decision > 0) return;
  for (const eff of value as unknown[][]) {
    const [effect, setting, msg] = [eff[0] as number, eff[1], (eff[2] as string) ?? null];
    const lowercase = !(msg && msg[0] === "{" && msg[1] === "1");
    await battler.applyFieldEffects(effect, setting, msg, lowercase);
  }
}

//===============================================================================
// Changes the weather.
//===============================================================================
async function midbattleChangeWeather(scene: MidbattleScene, battler: Battler, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (["HarshSun", "HeavyRain", "StrongWinds"].includes(battle.field.weather) || battle.decision > 0) return;
  const name = idOf(value);
  if (name === "Random") {
    //-------------------------------------------------------------------------
    // Starts a random weather.
    const array: Id[] = [];
    for (const w of BattleWeather.keys()) {
      if (["None", "HarshSun", "HeavyRain", "StrongWinds", battle.field.weather].includes(w)) continue;
      array.push(w);
    }
    const weather = sample(battle, array)!;
    await battle.pbStartWeather(battler, weather, true);
  } else if (name === "None") {
    //-------------------------------------------------------------------------
    // Clears any active weather.
    switch (battle.field.weather) {
      case "Sun": await battle.pbDisplay(_INTL("The sunlight faded.")); break;
      case "Rain": await battle.pbDisplay(_INTL("The rain stopped.")); break;
      case "Sandstorm": await battle.pbDisplay(_INTL("The sandstorm subsided.")); break;
      case "Hail": await battle.pbDisplay(_INTL("The hail stopped.")); break;
      case "ShadowSky": await battle.pbDisplay(_INTL("The shadow sky faded.")); break;
      default: await battle.pbDisplay(_INTL("The weather cleared."));
    }
    await battle.pbStartWeather(battler, "None", true);
  } else if (name != null && BattleWeather.exists(name) && battle.field.weather !== name) {
    //-------------------------------------------------------------------------
    // Starts the specified weather.
    await battle.pbStartWeather(battler, name, true);
  }
}

//===============================================================================
// Changes the terrain.
//===============================================================================
async function midbattleChangeTerrain(scene: MidbattleScene, battler: Battler, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (battle.decision > 0) return;
  const name = idOf(value);
  if (name === "Random") {
    //-------------------------------------------------------------------------
    // Starts a random terrain.
    const array: Id[] = [];
    for (const t of BattleTerrain.keys()) {
      if (["None", battle.field.terrain].includes(t)) continue;
      array.push(t);
    }
    const terrain = sample(battle, array)!;
    await battle.pbStartTerrain(battler, terrain);
  } else if (name === "None") {
    //-------------------------------------------------------------------------
    // Clears any active terrain.
    switch (battle.field.terrain) {
      case "Electric": await battle.pbDisplay(_INTL("The electricity disappeared from the battlefield.")); break;
      case "Grassy": await battle.pbDisplay(_INTL("The grass disappeared from the battlefield.")); break;
      case "Misty": await battle.pbDisplay(_INTL("The mist disappeared from the battlefield.")); break;
      case "Psychic": await battle.pbDisplay(_INTL("The weirdness disappeared from the battlefield.")); break;
      default: await battle.pbDisplay(_INTL("The battlefield normalized."));
    }
    await battle.pbStartTerrain(battler, "None");
  } else if (name != null && BattleTerrain.exists(name) && battle.field.terrain !== name) {
    //-------------------------------------------------------------------------
    // Starts the specified terrain.
    await battle.pbStartTerrain(battler, name);
  }
}

//===============================================================================
// Changes the environment.
//===============================================================================
function midbattleChangeEnvironment(scene: MidbattleScene, value: unknown): void {
  const battle = battleOf(scene);
  if (battle.decision > 0) return;
  const name = idOf(value);
  if (name === "Random") {
    //-------------------------------------------------------------------------
    // Sets a random environment.
    const array: Id[] = [];
    for (const e of Environment.keys()) {
      if (["None", battle.environment].includes(e)) continue;
      array.push(e);
    }
    battle.environment = sample(battle, array)!;
  } else if (name != null && Environment.exists(name)) {
    //-------------------------------------------------------------------------
    // Sets the specified environment.
    battle.environment = name;
  }
}

//===============================================================================
// Changes the backdrop.
//===============================================================================
async function midbattleChangeBackdrop(scene: MidbattleScene, value: unknown): Promise<void> {
  const battle = battleOf(scene);
  if (battle.decision > 0) return;
  let backdrop: string, base: string | null;
  if (Array.isArray(value)) {
    [backdrop, base] = [value[0] as string, (value[1] as string) ?? null];
  } else {
    backdrop = base = value as string;
  }
  if (assetExists(`Graphics/Battlebacks/${backdrop}_bg`)) battle.backdrop = backdrop;
  if (base && assetExists(`Graphics/Battlebacks/${base}_base0`)) {
    battle.backdropBase = base;
    if (base.includes("city")) battle.environment = "None";
    else if (base.includes("grass")) battle.environment = "Grass";
    else if (base.includes("water")) battle.environment = "MovingWater";
    else if (base.includes("puddle")) battle.environment = "Puddle";
    else if (base.includes("underwater")) battle.environment = "Underwater";
    else if (base.includes("cave")) battle.environment = "Cave";
    else if (base.includes("rocky")) battle.environment = "Rock";
    else if (base.includes("volcano")) battle.environment = "Volcano";
    else if (base.includes("sand")) battle.environment = "Sand";
    else if (base.includes("forest")) battle.environment = "Forest";
    else if (base.includes("snow")) battle.environment = "Snow";
    else if (base.includes("ice")) battle.environment = "Ice";
    else if (base.includes("distortion")) battle.environment = "Graveyard";
    else if (base.includes("sky")) battle.environment = "Sky";
    else if (base.includes("ultra")) battle.environment = "UltraSpace";
    else if (base.includes("space")) battle.environment = "Space";
  }
  await scene.pbFlashRefresh();
}

//===============================================================================
// Installs the methods on a scene class (Ruby's Battle::Scene).
//===============================================================================
export interface MidbattleMethods {
  pbDeluxeTriggers(idxBattler: number | { index: number } | null, idxTarget: number | { index: number } | null, triggers: string[]): Promise<void>;
  dxMidbattle(idxBattler: number | null, idxTarget: number | null, ...triggers: string[]): Promise<void>;
  pbMidbattleSpeech(idxTrainer: number, idxTarget: number | null, battler: Battler, speech: unknown, dialogue?: boolean, nospeaker?: boolean): Promise<void>;
  midbattleBattler(idxBattler: number | null, idxTarget: number | null, index: unknown): Battler | null;
}

/** Puts pbDeluxeTriggers, dx_midbattle and the speech/battler helpers on a scene class's prototype. */
export function installMidbattle(proto: object, options: { dxMidbattle?: boolean } = {}): void {
  const methods: Partial<Record<keyof MidbattleMethods, unknown>> = {
    pbDeluxeTriggers(this: MidbattleScene, idxBattler: number | null, idxTarget: number | null, triggers: string[]) {
      return pbDeluxeTriggers(this, idxBattler, idxTarget, triggers);
    },
    pbMidbattleSpeech(this: MidbattleScene, idxTrainer: number, idxTarget: number | null, battler: Battler, speech: unknown,
      dialogue = true, nospeaker = false) {
      return pbMidbattleSpeech(this, idxTrainer, idxTarget, battler, speech, dialogue, nospeaker);
    },
    midbattleBattler(this: MidbattleScene, idxBattler: number | null, idxTarget: number | null, index: unknown) {
      return midbattleBattler(this, idxBattler, idxTarget, index);
    },
  };
  if (options.dxMidbattle !== false) {
    methods.dxMidbattle = function (this: MidbattleScene, idxBattler: number | null, idxTarget: number | null, ...triggers: string[]) {
      return dxMidbattle(this, idxBattler, idxTarget, ...triggers);
    };
  }
  Object.assign(proto, methods);
}

/** For a preset given as a Symbol: Sym (from rubyData). */
export type { Sym };
