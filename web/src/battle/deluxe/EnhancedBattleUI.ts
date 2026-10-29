// Port of Enhanced UI's [002] Battle UI.rb:75-956: the Move Info window (M in
// the fight menu: type, category, power/accuracy/effect chance, flags, type
// effectiveness on each foe) and the Battle Info window (N in the command or
// fight menu: pick a battler, then its stats, stat stages, effects in play
// and party lineups). Battle::Scene#pbInitSprites' alias (the sprites they
// draw on, Battle UI.rb:27-71) is BattleScene#initEnhancedUISprites; the
// fight/command menus call pbFightMenu_EnhancedUI / pbToggleBattleInfo
// (Essentials Deluxe's Fight Menu.rb:400-410 and Battle.rb:356-359).
// Also Essentials Deluxe's sprite outline helpers ([000] Sprite Outliner.rb:
// 66-184) for the battler icons.
//
// Plugins it checks that aren't installed: Terastal Phenomenon, PLA Battle
// Styles, Focus Meter System, Pokémon Birthsigns (celestial? is false).

import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { PowerMove } from "../../data/gameData/powerMove";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Status } from "../../data/gameData/status";
import { Target } from "../../data/gameData/target";
import { Effectiveness, Type } from "../../data/gameData/type";
import { pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../../game/GameSystem";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { drawTextEx, pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../../ui/drawText";
import { pbUpdateSpriteHash } from "../../ui/messageConfig";
import { pbPlayCloseMenuSE } from "../../ui/options/options";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { KeyboardInput } from "../../ui/textEntry/keyboard";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import type { BattleScene } from "../scene/BattleScene";
import { BattleSceneHooks } from "../scene/BattleScene";
import type { FightMenu } from "../scene/menus";
import { pbHideBattleInfo, pbHideFocusPanel, pbHideMoveInfo } from "../scene/pluginUI";

const SCREEN_W = 512;
const PATH = "Graphics/Plugins/Enhanced UI/Battle UI/";

/** Enhanced UI's Settings::MOVE_INFO_KEY / BATTLE_INFO_KEY / ALWAYS_DISPLAY_TYPES ([000] Settings.rb). */
export const EnhancedBattleUISettings = {
  MOVE_INFO_KEY: "M",
  BATTLE_INFO_KEY: "N",
  ALWAYS_DISPLAY_TYPES: false,
};

// Text colors (Battle UI.rb:8-24)
const BASE_LIGHT = new Color(232, 232, 232);
const SHADOW_LIGHT = new Color(72, 72, 72);
const BASE_DARK = new Color(56, 56, 56);
const SHADOW_DARK = new Color(184, 184, 184);
const BASE_RAISED = new Color(50, 205, 50);
const SHADOW_RAISED = new Color(9, 121, 105);
const BASE_LOWERED = new Color(248, 72, 72);
const SHADOW_LOWERED = new Color(136, 48, 48);

/** The graphics these windows draw (preloaded with the battle). */
export const ENHANCED_BATTLE_UI_GRAPHICS = [
  `${PATH}Move Info/bg`, `${PATH}Move Info/icons`, `${PATH}Move Info/effectiveness`,
  `${PATH}Battle Info/select`, `${PATH}Battle Info/select_bg`, `${PATH}Battle Info/panel_owner`,
  `${PATH}Battle Info/battler_gender`, `${PATH}Battle Info/party`, `${PATH}Battle Info/info_bg`,
  `${PATH}Battle Info/info_ui`, `${PATH}Battle Info/panel_effects`, `${PATH}Battle Info/battler_stats`,
  "Graphics/Pictures/types", "Graphics/Pictures/category", "Graphics/Pictures/Battle/overlay_hp",
  "Graphics/Pictures/statuses", "Graphics/Pictures/shiny", "Graphics/Pictures/leftarrow", "Graphics/Pictures/rightarrow",
];

const battleOf = (scene: BattleScene): Battle => scene.battle as unknown as Battle;
/** Input.triggerex?(key) */
const triggerex = (key: string): boolean => KeyboardInput.triggerex(key);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySprite = any;

/** The colors pbUpdateMoveInfoWindow and pbAddPluginText share (Ruby's @dmg_base etc.). */
interface MoveInfoColors {
  dmgBase: Color; dmgShadow: Color; accBase: Color; accShadow: Color; effBase: Color; effShadow: Color;
}

//===============================================================================
// Toggles the display of battle UI's while in the Fight Menu.
//===============================================================================
export async function pbFightMenu_EnhancedUI(scene: BattleScene, battler: Battler, cw: FightMenu): Promise<void> {
  if (triggerex(EnhancedBattleUISettings.MOVE_INFO_KEY)) {
    pbHideBattleInfo(scene);
    pbHideFocusPanel(scene);
    pbToggleMoveInfo(scene, battler, cw.index);
  } else if (triggerex(EnhancedBattleUISettings.BATTLE_INFO_KEY)) {
    pbHideMoveInfo(scene);
    pbHideFocusPanel(scene);
    await pbToggleBattleInfo(scene);
  }
}

//===============================================================================
// Move Info UI
//===============================================================================
/** Draws the Move Info UI. */
export function pbUpdateMoveInfoWindow(scene: BattleScene, battler: Battler, index: number): void {
  const overlay = scene.sprites.moveinfo.bitmap;
  overlay.clear();
  if (!scene.moveUIToggle) return;
  const xpos = 0;
  const ypos = 94;
  const move = battler.moves[index]!;
  const type = move.pbCalcType(battler)!;
  // (Terastal Phenomenon isn't installed.)
  //---------------------------------------------------------------------------
  // Draws images.
  const typenumber = Type.get(type).iconPosition;
  let imagePos: ImagePosition[] = [
    [PATH + "Move Info/bg", xpos, ypos],
    ["Graphics/Pictures/types", xpos + 272, ypos + 4, 0, typenumber * 28, 64, 28],
    ["Graphics/Pictures/category", xpos + 336, ypos + 4, 0, move.category * 28, 64, 28],
  ];
  imagePos = imagePos.concat(pbDrawMoveFlagIcons(xpos, ypos, move));
  imagePos = imagePos.concat(pbDrawTypeEffectiveness(scene, xpos, ypos, move, type));
  pbDrawImagePositions(overlay, imagePos);
  //---------------------------------------------------------------------------
  // Move damage calculations (for display purposes).
  const c: MoveInfoColors = {
    dmgBase: BASE_LIGHT, accBase: BASE_LIGHT, effBase: BASE_LIGHT,
    dmgShadow: SHADOW_LIGHT, accShadow: SHADOW_LIGHT, effShadow: SHADOW_LIGHT,
  };
  let damage = move.baseDamage;
  const baseDmg = move.baseDamage;
  let stab = 1;
  if (battler.pbHasType(type)) stab = 1.5;
  if (move.damagingMove()) {
    let calcDmg: number;
    if ((move.function === "TypeAndPowerDependOnUserBerry" && !battler.item) ||
        // Moves that should not display their real power because it reveals too much.
        ["PursueSwitchingFoe", // Pursuit
          "RandomlyDamageOrHealTarget", // Present
          "RemoveTargetItem", // Knock Off
          "HitOncePerUserTeamMember", // Beat Up
          "PowerHigherWithTargetHP", // Crush Grip, Wring Out
          "PowerHigherWithUserFasterThanTarget", // Electro Ball
          "PowerHigherWithTargetFasterThanUser", // Gyro Ball
          "RandomPowerDoublePowerIfTargetUnderground", // Magnitude
        ].includes(move.function)) {
      calcDmg = move.baseDamage;
    } else {
      calcDmg = move.pbBaseDamage(move.baseDamage, battler, battler.pbDirectOpposing());
    }
    calcDmg = move.pbModifyDamage(calcDmg, battler, battler.pbDirectOpposing());
    let range = baseDmg - calcDmg;
    // Calc is inverted for Eruption/Water Spout.
    if (move.function === "PowerHigherWithUserHP") range = -range;
    const realDmg = Math.floor(calcDmg * stab);
    damage = realDmg >= range ? realDmg : Math.floor(baseDmg * stab);
    if (damage > baseDmg) calcDmg = damage;
    if (damage > 1) {
      if (calcDmg > baseDmg) {
        [c.dmgBase, c.dmgShadow] = [BASE_RAISED, SHADOW_RAISED];
      } else if (damage < Math.floor(baseDmg * stab)) {
        [c.dmgBase, c.dmgShadow] = [BASE_LOWERED, SHADOW_LOWERED];
      }
    }
  }
  //---------------------------------------------------------------------------
  // Draws text.
  let textPos: TextPosition[] = [];
  textPos = textPos.concat(pbAddPluginText(xpos, ypos, move, battler));
  const power = damage === 0 ? "---" : damage === 1 ? "???" : String(damage);
  const accuracy = move.accuracy === 0 ? "---" : String(move.accuracy);
  let effectrate: string;
  switch (move.function) {
    case "ParalyzeFlinchTarget": case "BurnFlinchTarget": case "FreezeFlinchTarget":
      effectrate = "10%";
      break;
    case "LowerTargetDefense1FlinchTarget":
      effectrate = "50%";
      break;
    default:
      effectrate = move.addlEffect === 0 ? "---" : String(move.addlEffect) + "%";
  }
  textPos.push(
    [move.name, xpos + 10, ypos + 8, 0, BASE_LIGHT, SHADOW_LIGHT],
    [_INTL("Pow:"), SCREEN_W - 86, ypos + 10, 2, BASE_LIGHT, SHADOW_LIGHT],
    [_INTL("Acc:"), SCREEN_W - 86, ypos + 39, 2, BASE_LIGHT, SHADOW_LIGHT],
    [_INTL("Effct:"), xpos + 287, ypos + 39, 0, BASE_LIGHT, SHADOW_LIGHT],
    [power, SCREEN_W - 34, ypos + 10, 2, c.dmgBase, c.dmgShadow],
    [accuracy, SCREEN_W - 34, ypos + 39, 2, c.accBase, c.accShadow],
    [effectrate, SCREEN_W - 146, ypos + 39, 2, c.effBase, c.effShadow],
  );
  pbDrawTextPositions(overlay, textPos);
  drawTextEx(overlay, xpos + 10, ypos + 70, SCREEN_W - 10, 2, MoveData.get(move.id).description, BASE_LIGHT, SHADOW_LIGHT);
}

/** Toggles the visibility of the Move Info UI. */
export function pbToggleMoveInfo(scene: BattleScene, battler: Battler, index = 0): void {
  scene.moveUIToggle = !scene.moveUIToggle;
  if (scene.moveUIToggle) pbSEPlay("GUI party switch");
  else pbPlayCloseMenuSE();
  scene.sprites.moveinfo.visible = scene.moveUIToggle;
  pbUpdateTargetIcons(scene);
  pbUpdateMoveInfoWindow(scene, battler, index);
}

/** Updates icon sprites to be used for the Move Info UI. */
export function pbUpdateTargetIcons(scene: BattleScene): void {
  let idx = 0;
  for (const b of battleOf(scene).allBattlers()) {
    const icon: AnySprite = scene.sprites[`battler_icon${b.index}`];
    if (b && !b.fainted() && b.index % 2 === 1) {
      icon.pokemon = b.displayPokemon();
      icon.visible = scene.moveUIToggle;
      icon.x = SCREEN_W - 32 - (idx * 64);
      icon.y = 68;
      icon.zoomX = 1;
      icon.zoomY = 1;
      icon.applyIconEffects();
      idx += 1;
    } else {
      icon.visible = false;
    }
  }
}

/** Draws the type effectiveness display for each opponent in the Move Info UI. */
export function pbDrawTypeEffectiveness(scene: BattleScene, _xpos: number, ypos: number, move: Move, type: Id): ImagePosition[] {
  const images: ImagePosition[] = [];
  let idx = 0;
  for (const b of battleOf(scene).allBattlers()) {
    if (b.index % 2 === 0) continue;
    if (b && !b.fainted() && move.category < 2) {
      const poke = b.displayPokemon()!;
      const dex = (G.player as unknown as Player).pokedex;
      let unknownSpecies = dex.battledCount(poke.species) === 0 && !dex.owned(poke.species);
      if (EnhancedBattleUISettings.ALWAYS_DISPLAY_TYPES) unknownSpecies = false;
      if (b.celestial()) unknownSpecies = true;
      const types = poke.types();
      const value = Effectiveness.calculate(type, types[0] ?? null, types[1] ?? null);
      let effct: number;
      if (unknownSpecies) effct = 0;
      else if (Effectiveness.ineffective(value)) effct = 1;
      else if (Effectiveness.notVeryEffective(value)) effct = 2;
      else if (Effectiveness.superEffective(value)) effct = 3;
      else effct = 4;
      images.push([PATH + "Move Info/effectiveness", SCREEN_W - 64 - (idx * 64), ypos - 76, effct * 64, 0, 64, 76]);
      scene.sprites[`battler_icon${b.index}`].visible = true;
    } else {
      scene.sprites[`battler_icon${b.index}`].visible = false;
    }
    idx += 1;
  }
  return images;
}

/** Draws the move flag icons for each move in the Move Info UI. */
export function pbDrawMoveFlagIcons(xpos: number, ypos: number, move: Move): ImagePosition[] {
  const flagX = xpos + 5;
  const flagY = ypos + 32;
  const images: ImagePosition[] = [];
  const icon = (n: number) => images.push([PATH + "Move Info/icons", flagX + (images.length * 26), flagY, n * 26, 0, 26, 28]);
  // PluginManager.installed?("ZUD Mechanics")
  if (move.zMove()) icon(0);
  else if (move.maxMove()) icon(1);
  if (Target.get(move.target).targetsFoe) {
    if (!move.flags.includes("CanProtect")) icon(2);
    if (!move.flags.includes("CanMirrorMove")) icon(3);
  }
  const FLAG_ICONS: Record<string, number> = {
    Contact: 4, TramplesMinimize: 5, HighCriticalHitRate: 6, ElectrocuteUser: 7, ThawsUser: 8, Sound: 9,
    Punching: 10, Biting: 11, Bomb: 12, Pulse: 13, Powder: 14, Dance: 15, Slicing: 16, Wind: 17,
  };
  for (const flag of move.flags) {
    const idx = FLAG_ICONS[flag] ?? -1;
    if (idx < 0) continue;
    icon(idx);
  }
  return images;
}

/** Draws additional plugin-specific text to be displayed in the Move Info UI. */
export function pbAddPluginText(xpos: number, ypos: number, move: Move, _battler: Battler): TextPosition[] {
  const addText: TextPosition[] = [];
  //---------------------------------------------------------------------------
  // Sets up additional text for Z-Moves. (ZUD)
  //---------------------------------------------------------------------------
  if (move.zMove() && move.category === 2) {
    let text: string | null = null;
    if (PowerMove.statBooster(move.id)) {
      const [stats, stage] = PowerMove.statWithStage(move.id)!;
      const statname = stats.length > 1 ? "stats" : Stat.get(stats[0]!).name;
      const boost = stage === 3 ? " drastically" : stage === 2 ? " sharply" : "";
      text = _INTL(`Raises the user's ${statname}${boost}.`);
    } else if (PowerMove.boostsCrit(move.id)) {
      text = _INTL("Raises the user's critical hit rate.");
    } else if (PowerMove.resetsStats(move.id)) {
      text = _INTL("Resets the user's lowered stat stages.");
    } else if (PowerMove.healsSelf(move.id)) {
      text = _INTL("Fully restores the user's HP.");
    } else if (PowerMove.healsSwitch(move.id)) {
      text = _INTL("Fully restores an incoming Pokémon's HP.");
    } else if (PowerMove.focusUser(move.id)) {
      text = _INTL("The user becomes the center of attention.");
    }
    if (text) addText.push([_INTL(`Z-Power: ${text}`), xpos + 10, ypos + 128, 0, BASE_RAISED, SHADOW_RAISED]);
  }
  // (PLA Battle Styles and Terastal Phenomenon aren't installed.)
  return addText;
}

//===============================================================================
// Battle Info UI
//===============================================================================
/** The battlers on each side as the Battle Info UI lists them. */
function infoBattlers(battle: Battle): [Battler[], Battler[]] {
  return [[...battle.allSameSideBattlers()], [...battle.allOtherSideBattlers()].reverse()];
}

/** Handles the controls for the selection screen for the Battle Info UI. */
export async function pbSelectBattlerInfo(scene: BattleScene): Promise<void> {
  if (!scene.infoUIToggle) return;
  const battle = battleOf(scene);
  let idxSide = 0;
  let idxPoke = battle.pbSideBattlerCount(0) < 3 ? 0 : 1;
  scene.sprites.infoselect.x = battle.pbSideBattlerCount(0) === 2 ? 68 : 173;
  scene.sprites.infoselect.y = 154;
  const battlers = infoBattlers(battle);
  let battler = battlers[idxSide]![idxPoke]!;
  pbShowOutline(scene, `battler_icon${battler.index}`);
  const cw: FightMenu = scene.sprites.fightWindow;
  let switchUI = 0;
  for (;;) {
    await scene.pbUpdate(cw);
    pbUpdateSpriteHash(scene.sprites);
    const oldSide = idxSide;
    const oldPoke = idxPoke;
    if (Input.trigger(Input.BACK) || triggerex(EnhancedBattleUISettings.BATTLE_INFO_KEY)) break;
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      const ret = await pbOpenBattlerInfo(scene, battler, battlers);
      if (Array.isArray(ret)) {
        [idxSide, idxPoke] = [ret[0]!, ret[1]!];
        battler = battlers[idxSide]![idxPoke]!;
        pbUpdateBattlerSelection(scene, ret);
        pbShowOutline(scene, `battler_icon${battler.index}`);
      } else if (typeof ret === "number") {
        switchUI = ret;
        break;
      } else {
        break;
      }
    } else if (Input.trigger(Input.LEFT) && battle.pbSideBattlerCount(idxSide) > 1) {
      idxPoke -= 1;
      if (idxPoke < 0) idxPoke = battle.pbSideBattlerCount(idxSide) - 1;
      pbPlayCursorSE();
    } else if (Input.trigger(Input.RIGHT) && battle.pbSideBattlerCount(idxSide) > 1) {
      idxPoke += 1;
      if (idxPoke > battle.pbSideBattlerCount(idxSide) - 1) idxPoke = 0;
      pbPlayCursorSE();
    } else if (Input.trigger(Input.UP) || Input.trigger(Input.DOWN)) {
      idxSide = idxSide === 0 ? 1 : 0;
      if (idxPoke > battle.pbSideBattlerCount(idxSide) - 1) {
        while (idxPoke !== battle.pbSideBattlerCount(idxSide) - 1) idxPoke -= 1;
      }
      pbPlayCursorSE();
    } else if (cw.visible && triggerex(EnhancedBattleUISettings.MOVE_INFO_KEY)) {
      switchUI = 1;
      break;
    }
    // (Focus Meter System isn't installed.)
    if (oldSide !== idxSide || oldPoke !== idxPoke) {
      pbUpdateBattlerSelection(scene, [idxSide, idxPoke]);
      scene.sprites.infoselect.y = idxSide === 0 ? 154 : 78;
      switch (battle.pbSideBattlerCount(idxSide)) {
        case 1: scene.sprites.infoselect.x = 173; break;
        case 2: scene.sprites.infoselect.x = 68 + (208 * idxPoke); break;
        case 3: scene.sprites.infoselect.x = 4 + (169 * idxPoke); break;
      }
      battler = battlers[idxSide]![idxPoke]!;
      for (const b of battle.allBattlers()) {
        pbShowOutline(scene, `battler_icon${b.index}`, b.index === battler.index);
      }
    }
  }
  pbHideBattleInfo(scene);
  pbUpdateBattlerIcons(scene);
  switch (switchUI) {
    case 0: pbPlayCloseMenuSE(); break;
    case 1: pbToggleMoveInfo(scene, battler, cw.index); break;
    // case 2: Focus Meter System isn't installed.
  }
}

/** Draws the selection screen for the Battle Info UI. */
export function pbUpdateBattlerSelection(scene: BattleScene, index: number[], _select = false): void {
  const battle = battleOf(scene);
  const overlay1 = scene.sprites.infobitmap.bitmap;
  const overlay2 = scene.sprites.infotext.bitmap;
  overlay1.clear();
  overlay2.clear();
  if (!scene.infoUIToggle) return;
  const xpos = 0;
  const ypos = 68;
  const textPos: TextPosition[] = [];
  const imagePos1: ImagePosition[] = [[PATH + "Battle Info/select_bg", xpos, ypos]];
  const imagePos2: ImagePosition[] = [];
  const NUM_BALLS = Settings.MAX_PARTY_SIZE;
  for (let side = 0; side < 2; side++) {
    const count = battle.pbSideBattlerCount(side);
    let trainers: { party: (Pokemon | null)[]; ablePokemonCount(): number }[] = [];
    let ballY: number, ballXFirst: number, ballXLast: number, ballOffset: number;
    const sideBattlers = side === 0 ? battle.allSameSideBattlers() : [...battle.allOtherSideBattlers()].reverse();
    sideBattlers.forEach((b, i) => {
      let iconX = 0, bgX = 0;
      switch (count) {
        case 1: [iconX, bgX] = [202, 173]; break;
        case 2: [iconX, bgX] = [96 + (208 * i), 68 + (208 * i)]; break;
        case 3: [iconX, bgX] = [32 + (168 * i), 4 + (169 * i)]; break;
      }
      const iconY = side === 0 ? ypos + 114 : ypos + 38;
      const nameX = iconX + 82;
      let base: Color, shadow: Color;
      if (index[0] === side && index[1] === i) {
        [base, shadow] = [BASE_LIGHT, SHADOW_LIGHT];
        if (b.dynamax()) shadow = b.isSpecies("CALYREX") ? new Color(48, 206, 216) : new Color(248, 32, 32);
      } else {
        [base, shadow] = [BASE_DARK, SHADOW_DARK];
      }
      scene.sprites[`battler_icon${b.index}`].x = iconX;
      scene.sprites[`battler_icon${b.index}`].y = iconY;
      pbSetWithOutline(scene, `battler_icon${b.index}`, [iconX, iconY, 400]);
      imagePos1.push([PATH + "Battle Info/select", bgX, iconY - 28, 0, 0, 166, 52]);
      if (side === 0) {
        imagePos2.push([PATH + "Battle Info/panel_owner", bgX + 36, iconY + 11],
          [PATH + "Battle Info/battler_gender", bgX + 146, iconY - 37, b.gender() * 22, 0, 22, 20]);
        textPos.push([_INTL("{1}", b.pokemon!.name), nameX, iconY - 16, 2, base, shadow],
          [battle.pbGetOwnerFromBattlerIndex(b.index)!.name, nameX - 10, iconY + 13, 2, BASE_LIGHT, SHADOW_LIGHT]);
      } else {
        textPos.push([_INTL("{1}", b.displayPokemon()!.name), nameX, iconY - 16, 2, base, shadow]);
        if (battle.trainerBattle()) {
          imagePos2.push([PATH + "Battle Info/panel_owner", bgX + 36, iconY + 11]);
          textPos.push([battle.pbGetOwnerFromBattlerIndex(b.index)!.name, nameX - 10, iconY + 13, 2, BASE_LIGHT, SHADOW_LIGHT]);
        }
        imagePos2.push([PATH + "Battle Info/battler_gender", bgX + 146, iconY - 37, b.displayPokemon()!.gender * 22, 0, 22, 20]);
      }
    });
    if (side === 0) {
      //-----------------------------------------------------------------------
      // Player's side.
      trainers = (battle.player ?? []).filter((p) => p.ablePokemonCount() > 0) as never;
      ballY = ypos + 154;
      ballXFirst = 35;
      ballXLast = SCREEN_W - (16 * NUM_BALLS) - 35;
      ballOffset = 2;
    } else {
      //-----------------------------------------------------------------------
      // Opponent's side.
      trainers = (battle.opponent ?? []).filter((p) => p.ablePokemonCount() > 0) as never;
      ballY = ypos - 17;
      ballXFirst = SCREEN_W - (16 * NUM_BALLS) - 35;
      ballXLast = 35;
      ballOffset = 3;
    }
    //-------------------------------------------------------------------------
    // Draws party ball lineups.
    const ballXMiddle = Math.floor(SCREEN_W / 2) - 48;
    let ballX = ballXMiddle;
    for (const trainer of trainers) {
      if (trainers.length > 1) {
        if (trainer === trainers[0]) ballX = ballXFirst;
        else if (trainer === trainers[trainers.length - 1]) ballX = ballXLast;
        else ballX = ballXMiddle;
      }
      imagePos1.push([PATH + "Battle Info/panel_owner", ballX - 16, ballY - ballOffset]);
      for (let slot = 0; slot < NUM_BALLS; slot++) {
        let idx = 0;
        const p = trainer.party[slot];
        if (!p) idx = 3; // Empty
        else if (!p.able()) idx = 2; // Fainted
        else if (p.status !== "NONE") idx = 1; // Status
        imagePos2.push([PATH + "Battle Info/party", ballX + (slot * 16), ballY, idx * 15, 0, 15, 15]);
      }
    }
  }
  pbUpdateBattlerIcons(scene);
  pbDrawImagePositions(overlay1, imagePos1);
  pbDrawImagePositions(overlay2, imagePos2);
  pbDrawTextPositions(overlay2, textPos);
  scene.sprites.infoselect.visible = true;
  // (select: pbSelectBattlerInfo is awaited by pbToggleBattleInfo instead.)
}

/** Handles the controls for the Battle Info UI. Returns [side, index], 1 (Move Info) or null. */
export async function pbOpenBattlerInfo(scene: BattleScene, battler: Battler, battlers: Battler[][]): Promise<number[] | number | null> {
  if (!scene.infoUIToggle) return null;
  const battle = battleOf(scene);
  let ret: number[] | number | null = null;
  let idx = 0;
  const battlerTotal = battlers.flat();
  for (let i = 0; i < battlerTotal.length; i++) if (battler === battlerTotal[i]) idx = i;
  const maxSize = battlerTotal.length - 1;
  scene.sprites.infoselect.visible = false;
  pbUpdateBattlerInfo(scene, battler);
  const cw: FightMenu = scene.sprites.fightWindow;
  scene.sprites.leftarrow.visible = true;
  scene.sprites.rightarrow.visible = true;
  for (;;) {
    const oldIdx = idx;
    await scene.pbUpdate(cw);
    pbUpdateSpriteHash(scene.sprites);
    if (Input.trigger(Input.BACK)) break;
    if (Input.trigger(Input.LEFT)) {
      idx -= 1;
      if (idx < 0) idx = maxSize;
    } else if (Input.trigger(Input.RIGHT)) {
      idx += 1;
      if (idx > maxSize) idx = 0;
    } else if (cw.visible && triggerex(EnhancedBattleUISettings.MOVE_INFO_KEY)) {
      ret = 1;
      break;
    } else if (Input.trigger(Input.USE) || triggerex(EnhancedBattleUISettings.BATTLE_INFO_KEY)) {
      const r = [0, 0];
      if (battler.opposes()) {
        r[0] = 1;
        [...battle.allOtherSideBattlers()].reverse().forEach((b, i) => { if (b === battler) r[1] = i; });
      } else {
        r[0] = 0;
        battle.allSameSideBattlers().forEach((b, i) => { if (b === battler) r[1] = i; });
      }
      ret = r;
      pbPlayDecisionSE();
      break;
    }
    if (oldIdx !== idx) {
      pbPlayCursorSE();
      battler = battlerTotal[idx]!;
      pbUpdateBattlerInfo(scene, battler);
    }
  }
  scene.sprites.leftarrow.visible = false;
  scene.sprites.rightarrow.visible = false;
  return ret;
}

/** Draws the Battle Info UI. */
export function pbUpdateBattlerInfo(scene: BattleScene, battler: Battler): void {
  const battle = battleOf(scene);
  const overlay1 = scene.sprites.infobitmap.bitmap;
  const overlay2 = scene.sprites.infotext.bitmap;
  overlay1.clear();
  overlay2.clear();
  pbUpdateBattlerIcons(scene);
  if (!scene.infoUIToggle) return;
  const xpos = 28;
  const ypos = 25;
  const iconX = xpos + 29;
  const iconY = ypos + 62;
  const panelX = xpos + 239;
  //---------------------------------------------------------------------------
  // General UI elements.
  const poke = (battler.opposes() ? battler.displayPokemon() : battler.pokemon)!;
  let imagePos: ImagePosition[] = [[PATH + "Battle Info/info_bg", 0, 0],
    [PATH + "Battle Info/info_ui", 0, 0],
    [PATH + "Battle Info/battler_gender", xpos + 146, ypos + 24, poke.gender * 22, 0, 22, 20]];
  let textPos: TextPosition[] = [[_INTL("{1}", poke.name), iconX + 83, iconY - 16, 2, BASE_DARK, SHADOW_DARK],
    [_INTL("Lv. {1}", battler.level), xpos + 17, ypos + 106, 0, BASE_LIGHT, SHADOW_LIGHT],
    [_INTL("Turn {1}", battle.turnCount + 1), SCREEN_W - xpos - 32, ypos + 6, 2, BASE_LIGHT, SHADOW_LIGHT]];
  //---------------------------------------------------------------------------
  // Battler icon.
  for (const b of battle.allBattlers()) {
    const icon = scene.sprites[`battler_icon${b.index}`];
    icon.x = iconX;
    icon.y = iconY;
    icon.visible = b === battler;
  }
  //---------------------------------------------------------------------------
  // Battler HP.
  if (battler.hp > 0) {
    let w = battler.hp * 96 / battler.totalhp;
    if (w < 1) w = 1;
    w = Math.round(w / 2) * 2;
    let hpzone = 0;
    if (battler.hp <= Math.floor(battler.totalhp / 2)) hpzone = 1;
    if (battler.hp <= Math.floor(battler.totalhp / 4)) hpzone = 2;
    imagePos.push(["Graphics/Pictures/Battle/overlay_hp", 86, 89, 0, hpzone * 6, w, 6]);
  }
  // Battler status.
  if (battler.status !== "NONE") {
    const iconPos = Status.get(battler.status).iconPosition;
    imagePos.push(["Graphics/Pictures/statuses", xpos + 86, ypos + 105, 0, iconPos * 16, 44, 16]);
  }
  // Shininess
  if (poke.shiny) imagePos.push(["Graphics/Pictures/shiny", xpos + 143, ypos + 105]);
  // Owner
  if (!battler.wild()) {
    imagePos.push([PATH + "Battle Info/panel_owner", xpos - 34, ypos + 4]);
    textPos.push([battle.pbGetOwnerFromBattlerIndex(battler.index)!.name, xpos + 32, ypos + 6, 2, BASE_LIGHT, SHADOW_LIGHT]);
  }
  // Battler's last move used.
  if (battler.lastMoveUsed) {
    let movename = MoveData.get(battler.lastMoveUsed).name;
    if (movename.length > 16) movename = movename.slice(0, 13) + "...";
    textPos.push([_INTL(`Used: ${movename}`), xpos + 348, ypos + 106, 2, BASE_LIGHT, SHADOW_LIGHT]);
  }
  //---------------------------------------------------------------------------
  // Battler info for player-owned Pokemon.
  if (battler.pbOwnedByPlayer()) {
    imagePos.push(
      [PATH + "Battle Info/panel_owner", xpos + 36, iconY + 11],
      [PATH + "Battle Info/panel_effects", panelX, 65, 0, 0, 218, 24],
      [PATH + "Battle Info/panel_effects", panelX, 89, 0, 0, 218, 24],
    );
    textPos.push(
      [_INTL("Abil."), xpos + 272, ypos + 44, 2, BASE_LIGHT, SHADOW_LIGHT],
      [_INTL("Item"), xpos + 272, ypos + 68, 2, BASE_LIGHT, SHADOW_LIGHT],
      [_INTL("{1}", battler.abilityName()), xpos + 375, ypos + 44, 2, BASE_DARK, SHADOW_DARK],
      [_INTL("{1}", battler.itemName()), xpos + 375, ypos + 68, 2, BASE_DARK, SHADOW_DARK],
      [`${battler.hp}/${battler.totalhp}`, iconX + 73, iconY + 13, 2, BASE_LIGHT, SHADOW_LIGHT],
    );
  }
  //---------------------------------------------------------------------------
  // Battler's stat stages.
  const [statImages, statText] = pbAddStatsDisplay(xpos, ypos, battler);
  imagePos = imagePos.concat(statImages);
  textPos = textPos.concat(statText);
  //---------------------------------------------------------------------------
  // Effects in play that affect the battler.
  const [effectImages, effectText] = pbAddEffectsDisplay(scene, xpos, ypos, panelX, battler);
  imagePos = imagePos.concat(effectImages);
  textPos = textPos.concat(effectText);
  //---------------------------------------------------------------------------
  pbDrawImagePositions(overlay1, imagePos);
  pbDrawTextPositions(overlay2, textPos);
  //---------------------------------------------------------------------------
  // Battler's typing.
  pbAddTypesDisplay(scene, xpos, ypos, battler, poke);
}

/** Toggles the visibility of the Battle Info UI. */
export async function pbToggleBattleInfo(scene: BattleScene): Promise<void> {
  if (BattleSceneHooks.inSafari()) return;
  const battle = battleOf(scene);
  scene.infoUIToggle = !scene.infoUIToggle;
  if (scene.infoUIToggle) pbSEPlay("GUI party switch");
  else pbPlayCloseMenuSE();
  scene.sprites.infobitmap.visible = scene.infoUIToggle;
  scene.sprites.infotext.visible = scene.infoUIToggle;
  const pos = battle.pbSideBattlerCount(0) === 3 ? 1 : 0;
  pbUpdateBattlerSelection(scene, [0, pos], true);
  await pbSelectBattlerInfo(scene);
}

/** Updates icon sprites to be used for the Battle Info UI. */
export function pbUpdateBattlerIcons(scene: BattleScene): void {
  for (const b of battleOf(scene).allBattlers()) {
    if (!b) continue;
    const poke = b.opposes() ? b.displayPokemon() : b.pokemon;
    const icon: AnySprite = scene.sprites[`battler_icon${b.index}`];
    let color: Color | null = null;
    if (!b.fainted()) {
      icon.pokemon = poke;
      icon.visible = scene.infoUIToggle;
      icon.setOffset(PictureOrigin.CENTER);
      icon.zoomX = 1;
      icon.zoomY = 1;
      icon.applyIconEffects();
      color = !b.dynamax() ? new Color(255, 255, 255) : b.isSpecies("CALYREX") ? new Color(36, 243, 243) : new Color(250, 57, 96);
    } else {
      icon.visible = false;
    }
    pbUpdateOutline(scene, `battler_icon${b.index}`, poke);
    pbColorOutline(scene, `battler_icon${b.index}`, color);
    pbShowOutline(scene, `battler_icon${b.index}`, false);
  }
}

/** Draws the typing for each Pokemon in the Battle Info UI. */
export function pbAddTypesDisplay(scene: BattleScene, xpos: number, ypos: number, battler: Battler, poke: Pokemon): void {
  const overlay1 = scene.sprites.infobitmap.bitmap;
  const illusion = !!battler.effects[PBEffects.Illusion] && !battler.pbOwnedByPlayer();
  let displayTypes: Id[];
  if (battler.tera()) {
    displayTypes = illusion ? poke.types() : battler.pokemon!.types();
  } else if (illusion) {
    displayTypes = poke.types();
    if (battler.effects[PBEffects.Type3]) displayTypes.push(battler.effects[PBEffects.Type3] as Id);
  } else {
    displayTypes = battler.pbTypes(true);
  }
  const dex = (G.player as unknown as Player).pokedex;
  let unknownSpecies = !(battler.pbOwnedByPlayer() || dex.owned(poke.species) || dex.battledCount(poke.species) > 0);
  if (EnhancedBattleUISettings.ALWAYS_DISPLAY_TYPES) unknownSpecies = false;
  if (battler.celestial()) unknownSpecies = true;
  // Displays the "???" type on newly encountered species, or battlers with no typing.
  if (unknownSpecies || displayTypes.length === 0) displayTypes = ["QMARKS"];
  const typeY = displayTypes.length === 3 ? ypos + 7 : ypos + 35;
  const typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
  displayTypes.forEach((type, i) => {
    const typeNumber = Type.get(type).iconPosition;
    const typeRect = new Rect(0, typeNumber * 28, 64, 28);
    overlay1.blt(xpos + 171, typeY + (i * 30), typebitmap.bitmap!, typeRect);
  });
  // (Terastal Phenomenon isn't installed.)
}

/** Draws the stat display for each Pokemon in the Battle Info UI. */
export function pbAddStatsDisplay(xpos: number, ypos: number, battler: Battler): [ImagePosition[], TextPosition[]] {
  const images: ImagePosition[] = [];
  const addText: TextPosition[] = [];
  const rows: ([Id, string] | string)[] = [
    ["ATTACK", _INTL("Attack")],
    ["DEFENSE", _INTL("Defense")],
    ["SPECIAL_ATTACK", _INTL("Sp. Atk")],
    ["SPECIAL_DEFENSE", _INTL("Sp. Def")],
    ["SPEED", _INTL("Speed")],
    ["ACCURACY", _INTL("Accuracy")],
    ["EVASION", _INTL("Evasion")],
    _INTL("Crit. Hit"),
  ];
  rows.forEach((stat, i) => {
    let stage: number;
    if (Array.isArray(stat)) {
      let color = SHADOW_LIGHT;
      if (battler.pbOwnedByPlayer()) {
        for (const s of battler.pokemon!.natureForStats!.statChanges) {
          if (stat[0] === s[0]) {
            if (s[1] > 0) color = new Color(136, 96, 72); // Red Nature text.
            if (s[1] < 0) color = new Color(64, 120, 152); // Blue Nature text.
          }
        }
      }
      addText.push([stat[1], xpos + 17, ypos + 139 + (i * 24), 0, BASE_LIGHT, color]);
      stage = battler.stages[stat[0]] ?? 0;
    } else {
      addText.push([stat, xpos + 17, ypos + 139 + (i * 24), 0, BASE_LIGHT, SHADOW_LIGHT]);
      stage = Math.min(battler.effects[PBEffects.FocusEnergy] + battler.effects[PBEffects.CriticalBoost], 4);
    }
    const arrow = stage > 0 ? 0 : 1;
    for (let t = 0; t < Math.abs(stage); t++) {
      images.push([PATH + "Battle Info/battler_stats", xpos + 105 + (t * 18), ypos + 139 + (i * 24), arrow * 18, 0, 18, 18]);
    }
  });
  return [images, addText];
}

/** Draws the battle effects in play affecting each Pokemon in the Battle Info UI. */
export function pbAddEffectsDisplay(scene: BattleScene, xpos: number, ypos: number, panelX: number,
  battler: Battler): [ImagePosition[], TextPosition[]] {
  const battle = battleOf(scene);
  const images: ImagePosition[] = [];
  const addText: TextPosition[] = [];
  const effects: [string, string][] = [];
  // Effects that apply to the whole field.
  const fieldEffects: [number, [string, number]][] = [
    [PBEffects.MudSportField, [_INTL("Mud Sport"), 5]],
    [PBEffects.WaterSportField, [_INTL("Water Sport"), 5]],
    [PBEffects.TrickRoom, [_INTL("Trick Room"), 5]],
    [PBEffects.MagicRoom, [_INTL("Magic Room"), 5]],
    [PBEffects.WonderRoom, [_INTL("Wonder Room"), 5]],
    [PBEffects.Gravity, [_INTL("Gravity"), 5]],
    [PBEffects.FairyLock, [_INTL("Fairy Lock"), 2]],
  ];
  // Effects that apply to one side of the field.
  const teamEffects: [number, [string, number]][] = [
    [PBEffects.AuroraVeil, [_INTL("Aurora Veil"), 5]],
    [PBEffects.Reflect, [_INTL("Reflect"), 5]],
    [PBEffects.LightScreen, [_INTL("Light Screen"), 5]],
    [PBEffects.Mist, [_INTL("Mist"), 5]],
    [PBEffects.Safeguard, [_INTL("Safeguard"), 5]],
    [PBEffects.LuckyChant, [_INTL("Lucky Chant"), 5]],
    [PBEffects.Tailwind, [_INTL("Tailwind"), 4]],
    [PBEffects.Rainbow, [_INTL("Rainbow"), 4]],
    [PBEffects.SeaOfFire, [_INTL("Sea of Fire"), 4]],
    [PBEffects.Swamp, [_INTL("Swamp"), 4]],
  ];
  // Effects that apply to an individual battler.
  const battlerEffects: [number, [string, number]][] = [
    [PBEffects.Disable, [_INTL("Disable"), 5]],
    [PBEffects.Embargo, [_INTL("Embargo"), 5]],
    [PBEffects.HealBlock, [_INTL("Heal Block"), 5]],
    [PBEffects.MagnetRise, [_INTL("Magnet Rise"), 5]],
    [PBEffects.Encore, [_INTL("Encore"), 4]],
    [PBEffects.Taunt, [_INTL("Taunt"), 4]],
    [PBEffects.PerishSong, [_INTL("Perish Song"), 3]],
    [PBEffects.Telekinesis, [_INTL("Telekinesis"), 3]],
    [PBEffects.ThroatChop, [_INTL("Throat Chop"), 2]],
  ];
  if (battler.effects[PBEffects.Trapping] > 0) {
    const moveName = MoveData.get(battler.effects[PBEffects.TrappingMove] as Id).name;
    battlerEffects.push([PBEffects.Trapping, [_INTL("{1}", moveName), 5]]);
  }
  // Adds plugin-specific effects.
  // PluginManager.installed?("Generation 9 Pack")
  battlerEffects.push([PBEffects.GlaiveRush, [_INTL("Glaive Rush"), 2]]);
  battlerEffects.push([PBEffects.Splinters, [_INTL("Splinters"), 3]]);
  // PluginManager.installed?("ZUD Mechanics")
  teamEffects.push([PBEffects.VineLash, [_INTL("G-Max Vine Lash"), 4]]);
  teamEffects.push([PBEffects.Wildfire, [_INTL("G-Max Wildfire"), 4]]);
  teamEffects.push([PBEffects.Cannonade, [_INTL("G-Max Cannonade"), 4]]);
  teamEffects.push([PBEffects.Volcalith, [_INTL("G-Max Volcalith"), 4]]);
  if (battler.effects[PBEffects.Dynamax] > 0) {
    const count = battler.effects[PBEffects.MaxRaidBoss] ? "---" : `${battler.effects[PBEffects.Dynamax]}/${Settings.DYNAMAX_TURNS}`;
    effects.push([_INTL("Dynamax"), count]);
  }
  // (Focus Meter System isn't installed.)
  // Weather
  if (battle.field.weather !== "None") {
    const c = battle.field.weatherDuration;
    effects.push([BattleWeather.get(battle.field.weather).name, c > 0 ? `${c}/5` : "---"]);
  }
  // Terrain
  if (battle.field.terrain !== "None") {
    const c = battle.field.terrainDuration;
    effects.push([BattleTerrain.get(battle.field.terrain).name + " " + _INTL("Terrain"), c > 0 ? `${c}/5` : "---"]);
  }
  // Draws a list of each of the above effects currently in play.
  // (Ruby's hashes: a key set twice keeps its first position)
  const listed = (list: [number, [string, number]][], values: unknown[]) => {
    const seen = new Map<number, [string, number]>();
    for (const [key, value] of list) seen.set(key, value);
    for (const [key, value] of seen) {
      const v = values[key] as number | boolean;
      if (v === 0) continue;
      const count = typeof v === "number" && v > 0 ? `${v}/${value[1]}` : "---";
      effects.push([value[0], count]);
    }
  };
  listed(fieldEffects, battle.field.effects);
  listed(teamEffects, battler.pbOwnSide().effects);
  listed(battlerEffects, battler.effects);
  // Draws panels and text for all relevant battle effects affecting the battler.
  for (let i = 0; i < effects.length; i++) {
    if (i === 8) break;
    const effect = effects[i]!;
    images.push([PATH + "Battle Info/panel_effects", panelX, ypos + 136 + (i * 24), 0, 24, 218, 24]);
    addText.push([effect[0], xpos + 321, ypos + 140 + (i * 24), 2, BASE_DARK, SHADOW_DARK],
      [effect[1], xpos + 425, ypos + 140 + (i * 24), 2, BASE_LIGHT, SHADOW_LIGHT]);
  }
  return [images, addText];
}

//===============================================================================
// Essentials Deluxe's sprite outline helpers ([000] Sprite Outliner.rb:66-184)
//===============================================================================
/** pbSetWithOutline: adjusts outline coordinates. */
export function pbSetWithOutline(scene: BattleScene, sprite: string, coords: (number | null)[] = [], border = 2): void {
  const sprites = scene.sprites;
  if (!sprites || !(sprite in sprites)) return;
  const [cx, cy, cz] = coords;
  if (cx != null) sprites[sprite].x = cx;
  if (cy != null) sprites[sprite].y = cy;
  if (cz != null) sprites[sprite].z = cz + 1;
  for (let i = 0; i <= 7; i++) {
    const s = sprites[`${sprite}_outline${i}`];
    if (!s) continue;
    if (cx != null) s.x = cx;
    if (cy != null) s.y = cy;
    if (cz != null) s.z = cz;
    switch (i) {
      case 0: s.x += border; break;
      case 1: s.x -= border; break;
      case 2: s.y += border; break;
      case 3: s.y -= border; break;
      case 4: s.x -= border; s.y -= border; break;
      case 5: s.x += border; s.y -= border; break;
      case 6: s.x -= border; s.y += border; break;
      case 7: s.x += border; s.y += border; break;
    }
  }
}

/** pbShowOutline: adjusts outline visibility (or opacity, given a number). */
export function pbShowOutline(scene: BattleScene, sprite: string, visibility: boolean | number = true): void {
  const sprites = scene.sprites;
  if (!sprites || !(sprite in sprites)) return;
  for (let i = 0; i <= 7; i++) {
    const s = sprites[`${sprite}_outline${i}`];
    if (!s) continue;
    if (typeof visibility === "number") {
      if (visibility === 0) s.opacity = visibility;
      else s.opacity += visibility;
    } else {
      s.visible = visibility;
    }
  }
}

/** pbColorOutline: adjusts outline color (white if nil). */
export function pbColorOutline(scene: BattleScene, sprite: string, color: Color | null): void {
  const sprites = scene.sprites;
  if (!sprites || !(sprite in sprites)) return;
  const c = color ?? new Color(255, 255, 255);
  for (let i = 0; i <= 7; i++) {
    const s = sprites[`${sprite}_outline${i}`];
    if (!s) continue;
    s.color = c.clone();
  }
}

/** pbUpdateOutline: updates outlines for Pokémon icons (the battler icons are PokemonIconSprites). */
export function pbUpdateOutline(scene: BattleScene, sprite: string, pokemon: Pokemon | null): void {
  const sprites = scene.sprites;
  if (!sprites || !(sprite in sprites)) return;
  for (let i = 0; i <= 7; i++) {
    const s = sprites[`${sprite}_outline${i}`];
    if (!s || !("pokemon" in s)) continue;
    s.pokemon = pokemon;
    s.applyIconEffects();
  }
}
