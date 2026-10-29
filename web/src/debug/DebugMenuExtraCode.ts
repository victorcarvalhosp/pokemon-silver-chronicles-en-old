// Port of 020_Debug/003_Debug menus/003_Debug_MenuExtraCode.rb: the screens
// and helpers the Debug menu's options use (Warp to Map, the Switches and
// Variables editors, Day Care, Roaming Pokémon, text extraction, battle
// animation import/export, Fix Invalid Tiles) and PokemonDebugPartyScreen
// (the Pokémon editor of "Test Wild Battle Advanced"). Folded in:
// - Plugins/v20.1 Hotfixes/Debug bug fixes.rb: SpriteWindow_DebugVariables'
//   shadowtext/drawItem (identical to the 003 file here) and pbDebugRoamers
//   (no crash on Action).
// Ruby writes files directly (save_data, File.open); here every write goes
// through DevFiles (debug/devFiles.ts), so it only works under `pnpm dev`.
// Maps are web/data/maps/MapNNN.json, written in tools/convert/convert.rb's
// layout (prettyDataJSON) so a save only changes the lines that changed.

import { rand } from "../core/random";
import { assetExists } from "../core/assets";
import { GameData } from "../data/gameData";
import { Data, preloadMaps } from "../data/store";
import type { MapData, Tileset } from "../data/types";
import {
  PBAnimations, pbLoadBattleAnimations, pbLoadMoveToAnim, preloadBattleAnimations, type PBAnimation,
} from "../battle/scene/animationPlayer";
import { pbRoamPokemon, pbRoamPokemonOne, ROAMING_SPECIES, roamPokemonCaught } from "../game/battle/roaming";
import { DayCare } from "../game/daycare/DayCare";
import type { GameCharacter } from "../game/GameCharacter";
import { GameEvent } from "../game/GameEvent";
import { GameMap } from "../game/GameMap";
import { pbPlayBuzzerSE, pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../game/GameSystem";
import { G } from "../game/globals";
import { Interpreter } from "../game/Interpreter";
import type { Pokemon } from "../game/pokemon/Pokemon";
import { camel, evaluate, truthy } from "../game/scriptApi";
import type { Player } from "../game/trainer/Player";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color, type Rect } from "../rgss/types";
import { pbDrawShadowText } from "../ui/drawText";
import { pbFadeOutIn } from "../ui/fades";
import {
  _INTL, pbBottomLeft, pbBottomLeftLines, pbBottomRight, pbDisposeSpriteHash, pbSetNarrowFont, pbUpdateSpriteHash,
} from "../ui/messageConfig";
import {
  ChooseNumberParams, pbConfirmMessageSerious, pbCreateMessageWindow, pbDisposeMessageWindow, pbMessage,
  pbMessageChooseNumber, pbMessageDisplay,
} from "../ui/messages";
import { pbMessageFreeText } from "../ui/party/mail";
import { pbChooseNonEggPokemon, Window_CommandPokemonColor } from "../ui/party/party";
import { PokemonSummary_Scene, PokemonSummaryScreen } from "../ui/summary/summary";
import {
  Window_AdvancedTextPokemon, Window_CommandPokemon, Window_CommandPokemonEx, Window_DrawableCommand,
  Window_UnformattedTextPokemon,
} from "../ui/windows/SpriteWindowText";
import { Console, echoln } from "./DebugConsole";
import { pbPokemonDebug, type PokemonDebugScreen } from "./DebugMenus";
import { DevFiles, devWriteOrExplain } from "./devFiles";
import { MapLister, pbListScreen } from "./EditorListers";
import { type AllocatableAnimations, pbAllocateAnimation, pbCommands2, pbSafeCopyFile } from "./EditorUtilities";

const player = () => G.player as unknown as Player;
const pokemonGlobal = () => G.pokemonGlobal as unknown as {
  roamPosition?: Record<number, number | null> | null;
  roamPokemon?: (Pokemon | true | null)[] | null;
  roamedAlready?: boolean;
};

/** $game_map.need_refresh = true (when there is a map) */
function refreshMap(): void {
  if (G.gameMap) (G.gameMap as unknown as GameMap).needRefresh = true;
}

/** nil_or_empty?(string) */
function nilOrEmpty(s: string | null | undefined): boolean {
  return s === null || s === undefined || s === "";
}

/**
 * $data_system.switches.size / .variables.size. system.json keeps only the
 * named entries, so this is the highest named ID + 1 (RMXP's arrays can be
 * longer, with unnamed IDs at the end that this list doesn't show).
 */
function dataSystemSize(names: Record<string, string>): number {
  let max = 0;
  for (const key of Object.keys(names)) max = Math.max(max, Number(key));
  return max + 1;
}

//===============================================================================
//
//===============================================================================
export function pbDefaultMap(): number {
  if (G.gameMap) return G.gameMap.mapId;
  // $data_system.edit_map_id: system.json doesn't keep RMXP's editor map.
  if (Data.system) return (Data.system as unknown as { editMapId?: number }).editMapId ?? 0;
  return 0;
}

export async function pbWarpToMap(): Promise<[number, number, number] | null> {
  const mapid = (await pbListScreen(_INTL("WARP TO MAP"), new MapLister(pbDefaultMap()))) as number;
  if (mapid > 0) {
    await preloadMaps(mapid, 0); // Ruby's load_data reads the map synchronously
    const map = new GameMap();
    map.setup(mapid);
    let success = false;
    let x = 0;
    let y = 0;
    for (let i = 0; i < 100; i++) {
      x = rand(map.width);
      y = rand(map.height);
      if (!map.passableStrict(x, y, 0, G.gamePlayer as unknown as GameCharacter)) continue;
      let blocked = false;
      for (const event of map.events.values()) {
        if (event.atCoordinate(x, y) && !event.through && event.characterName !== "") {
          blocked = true;
        }
      }
      if (blocked) continue;
      success = true;
      break;
    }
    if (!success) {
      x = rand(map.width);
      y = rand(map.height);
    }
    return [mapid, x, y];
  }
  return null;
}

//===============================================================================
// Debug Variables screen
//===============================================================================
/**
 * Whether a script switch's code would be evaluated by the Switches screen:
 * Ruby evals it if it starts with a defined constant, or with a method name
 * that isn't an Interpreter/Game_Event method (those need an event, so the
 * screen shows "[-]" for them).
 */
export function scriptSwitchEvaluable(code: string): boolean {
  const first = code.split(/[(\[=<>. ]/)[0]!.trim().replace(/^\s*!/, "");
  const c = first[0] ?? "";
  // Kernel.const_defined?(code_parts[0]) rescue false: only a valid constant name
  // can be defined (whether it is shows when the code is evaluated).
  if (c.toUpperCase() === c && /^[A-Z]\w*$/.test(first)) return true;
  if (c.toLowerCase() === c) {
    const method = camel(first);
    const isMethod = (proto: object) => typeof (proto as Record<string, unknown>)[method] === "function";
    return !isMethod(Interpreter.prototype) && !isMethod(GameEvent.prototype);
  }
  return false;
}

/** eval(code) rescue nil, with the script switch's code as the converter translated it. */
function evalScriptSwitch(id: number): unknown {
  const script = Data.system.scriptSwitches[id];
  if (script === undefined) return null;
  try {
    return evaluate(script, { event: null, interpreter: null });
  } catch {
    return null;
  }
}

export class SpriteWindow_DebugVariables extends Window_DrawableCommand {
  // Set after super() (whose refresh draws with no mode, i.e. as Variables, like Ruby's nil @mode).
  declare private _mode: number | undefined;

  constructor(viewport: Viewport | null) {
    super(0, 0, Graphics.width, Graphics.height, viewport);
  }

  override itemCount(): number {
    return this._mode === 0 ? dataSystemSize(Data.system.switches) - 1 : dataSystemSize(Data.system.variables) - 1;
  }

  get mode(): number | undefined { return this._mode; }
  set mode(mode: number | undefined) {
    this._mode = mode;
    this.refresh();
  }

  shadowtext(x: number, y: number, w: number, h: number, t: string, align = 0, colors = 0): void {
    const contents = this.contents!;
    const width = contents.textSize(t).width;
    switch (align) {
      case 1: // Right aligned
        x += w - width;
        break;
      case 2: // Centre aligned
        x += Math.floor(w / 2) - Math.floor(width / 2);
        break;
    }
    y += 8; // TEXT OFFSET
    let base = new Color(12 * 8, 12 * 8, 12 * 8);
    switch (colors) {
      case 1: // Red
        base = new Color(168, 48, 56);
        break;
      case 2: // Green
        base = new Color(0, 144, 0);
        break;
    }
    pbDrawShadowText(contents, x, y, Math.max(width, w), h, t, base, new Color(26 * 8, 26 * 8, 25 * 8));
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    pbSetNarrowFont(this.contents!);
    let colors = 0;
    let codeswitch = false;
    let name: string | undefined;
    let status: string;
    if (this._mode === 0) {
      name = Data.system.switches[index + 1] ?? "";
      const m = /^s:/.exec(name);
      codeswitch = !!m;
      let val: unknown;
      if (m) {
        const code = name.slice(m[0].length);
        val = null;
        if (scriptSwitchEvaluable(code)) val = evalScriptSwitch(index + 1);
      } else {
        val = G.gameSwitches.get(index + 1);
      }
      if (val === null || val === undefined) {
        status = "[-]";
        colors = 0;
        codeswitch = true;
      } else if (truthy(val)) { // true
        status = "[ON]";
        colors = 2;
      } else { // false
        status = "[OFF]";
        colors = 1;
      }
    } else {
      name = Data.system.variables[index + 1];
      status = String(G.gameVariables.get(index + 1) ?? "");
      if (nilOrEmpty(status)) status = "\"__\"";
    }
    name ??= "";
    const idText = String(index + 1).padStart(4, "0") + ":";
    rect = this.drawCursor(index, rect);
    const totalWidth = rect.width;
    const idWidth = Math.floor((totalWidth * 15) / 100);
    const nameWidth = Math.floor((totalWidth * 65) / 100);
    const statusWidth = Math.floor((totalWidth * 20) / 100);
    this.shadowtext(rect.x, rect.y, idWidth, rect.height, idText);
    this.shadowtext(rect.x + idWidth, rect.y, nameWidth, rect.height, name, 0, codeswitch ? 1 : 0);
    this.shadowtext(rect.x + idWidth + nameWidth, rect.y, statusWidth, rect.height, status, 1, colors);
  }
}

export function pbDebugSetVariable(id: number, diff: number): void {
  const vars = G.gameVariables;
  if (vars.get(id) === null || vars.get(id) === undefined) vars.set(id, 0);
  const value = vars.get(id);
  if (typeof value === "number") {
    pbPlayCursorSE();
    vars.set(id, Math.min(value + diff, 99_999_999));
    vars.set(id, Math.max(vars.get(id) as number, -99_999_999));
    refreshMap();
  }
}

export async function pbDebugVariableScreen(id: number): Promise<void> {
  const current = G.gameVariables.get(id);
  if (typeof current === "number") {
    let value = current;
    const params = new ChooseNumberParams();
    params.setDefaultValue(value);
    params.setMaxDigits(8);
    params.setNegativesAllowed(true);
    value = await pbMessageChooseNumber(_INTL("Set variable {1}.", id), params);
    G.gameVariables.set(id, Math.min(value, 99_999_999));
    G.gameVariables.set(id, Math.max(G.gameVariables.get(id) as number, -99_999_999));
    refreshMap();
  } else if (typeof current === "string") {
    const value = await pbMessageFreeText(_INTL("Set variable {1}.", id), current, false, 250, Graphics.width);
    G.gameVariables.set(id, value);
    refreshMap();
  }
}

/** mode 0 = Switches, 1 = Variables */
export async function pbDebugVariables(mode: number): Promise<void> {
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const sprites: { right_window: SpriteWindow_DebugVariables } = {
    right_window: new SpriteWindow_DebugVariables(viewport),
  };
  const rightWindow = sprites.right_window;
  rightWindow.mode = mode;
  rightWindow.active = true;
  for (;;) {
    await Graphics.update();
    Input.update();
    pbUpdateSpriteHash(sprites);
    if (Input.trigger(Input.BACK)) {
      pbPlayCancelSE();
      break;
    }
    const currentId = rightWindow.index + 1;
    switch (mode) {
      case 0: // Switches
        if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          G.gameSwitches.set(currentId, !G.gameSwitches.get(currentId));
          rightWindow.refresh();
          refreshMap();
        }
        break;
      case 1: // Variables
        if (Input.repeat(Input.LEFT)) {
          pbDebugSetVariable(currentId, -1);
          rightWindow.refresh();
        } else if (Input.repeat(Input.RIGHT)) {
          pbDebugSetVariable(currentId, 1);
          rightWindow.refresh();
        } else if (Input.trigger(Input.ACTION)) {
          const v = G.gameVariables.get(currentId);
          if (v === 0) {
            G.gameVariables.set(currentId, "");
          } else if (v === "") {
            G.gameVariables.set(currentId, 0);
          } else if (typeof v === "number") {
            G.gameVariables.set(currentId, 0);
          } else if (typeof v === "string") {
            G.gameVariables.set(currentId, "");
          }
          rightWindow.refresh();
          refreshMap();
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          await pbDebugVariableScreen(currentId);
          rightWindow.refresh();
        }
        break;
    }
  }
  pbDisposeSpriteHash(sprites);
  viewport.dispose();
}

//===============================================================================
// Debug Day Care screen
//===============================================================================
export async function pbDebugDayCare(): Promise<void> {
  const dayCare = G.pokemonGlobal.dayCare;
  const cmdWindow = Window_CommandPokemonEx.newEmpty(0, 0, Graphics.width, Graphics.height);
  const commands: string[] = [];
  let cmd = 0;
  let compat = 0;
  let needRefresh = true;
  for (;;) {
    if (needRefresh) {
      commands.length = 0;
      dayCare.slots.forEach((slot, i) => {
        if (slot.filled()) {
          const pkmn = slot.pokemon!;
          let msg = _INTL("{1} ({2})", pkmn.name, pkmn.speciesName());
          if (pkmn.male()) {
            msg += ", ♂";
          } else if (pkmn.female()) {
            msg += ", ♀";
          }
          if (slot.levelGain() > 0) {
            msg += ", " + _INTL("Lv.{1} (+{2})", pkmn.level, slot.levelGain());
          } else {
            msg += ", " + _INTL("Lv.{1}", pkmn.level);
          }
          commands.push(_INTL("[Slot {1}] {2}", i, msg));
        } else {
          commands.push(_INTL("[Slot {1}] Empty", i));
        }
      });
      compat = G.pokemonGlobal.dayCare.getCompatibility();
      if (dayCare.eggGenerated) {
        commands.push(_INTL("[Egg available]"));
      } else if (compat > 0) {
        commands.push(_INTL("[Can produce egg]"));
      } else {
        commands.push(_INTL("[Cannot breed]"));
      }
      commands.push(_INTL("[Steps to next cycle: {1}]", 256 - dayCare.stepCounter));
      cmdWindow.commands = commands;
      needRefresh = false;
    }
    cmd = await pbCommands2(cmdWindow, commands, -1, cmd, true);
    if (cmd < 0) break;
    if (cmd === commands.length - 2) { // Egg
      compat = G.pokemonGlobal.dayCare.getCompatibility();
      if (compat === 0) {
        await pbMessage(_INTL("Pokémon cannot breed."));
      } else {
        const msg = _INTL("Pokémon can breed (compatibility = {1}).", compat);
        // Show compatibility
        if (dayCare.eggGenerated) {
          switch (await pbMessage("\\ts[]" + msg, [_INTL("Collect egg"), _INTL("Clear egg"), _INTL("Cancel")], 3)) {
            case 0: // Collect egg
              if (player().partyFull()) {
                await pbMessage(_INTL("Party is full, can't collect the egg."));
              } else {
                DayCare.collectEgg();
                await pbMessage(_INTL("Collected the {1} egg.", player().lastParty()!.speciesName()));
                needRefresh = true;
              }
              break;
            case 1: // Clear egg
              dayCare.eggGenerated = false;
              needRefresh = true;
              break;
          }
        } else {
          switch (await pbMessage("\\ts[]" + msg, [_INTL("Make egg available"), _INTL("Cancel")], 2)) {
            case 0: // Make egg available
              dayCare.eggGenerated = true;
              needRefresh = true;
              break;
          }
        }
      }
    } else if (cmd === commands.length - 1) { // Steps to next cycle
      switch (await pbMessage("\\ts[]" + _INTL("Change number of steps to next cycle?"),
        [_INTL("Set to 1"), _INTL("Set to 256"), _INTL("Set to other value"), _INTL("Cancel")], 4)) {
        case 0: // Set to 1
          dayCare.stepCounter = 255;
          needRefresh = true;
          break;
        case 1: // Set to 256
          dayCare.stepCounter = 0;
          needRefresh = true;
          break;
        case 2: { // Set to other value
          const params = new ChooseNumberParams();
          // NOTE (Ruby parity): the default is the step counter, not the steps
          // to the next cycle (256 - counter) the number means
          // (003_Debug_MenuExtraCode.rb:312).
          params.setDefaultValue(dayCare.stepCounter);
          params.setRange(1, 256);
          const newCounter = await pbMessageChooseNumber(_INTL("Set steps until next cycle (1-256)."), params);
          if (newCounter !== 256 - dayCare.stepCounter) {
            dayCare.stepCounter = 256 - newCounter;
            needRefresh = true;
          }
          break;
        }
      }
    } else { // Slot
      const slot = dayCare.get(cmd)!;
      if (slot.filled()) {
        const pkmn = slot.pokemon!;
        let msg = _INTL("Cost: ${1}", slot.cost());
        if (pkmn.level < GameData.GrowthRate.maxLevel()) {
          const endExp = pkmn.growthRate().minimumExpForLevel(pkmn.level + 1);
          msg += "\\n" + _INTL("Steps to next level: {1}", endExp - pkmn.exp);
        }
        // Show level change and cost
        switch (await pbMessage("\\ts[]" + msg, [_INTL("Summary"), _INTL("Withdraw"), _INTL("Cancel")], 3)) {
          case 0: // Summary
            await pbFadeOutIn(async () => {
              const scene = new PokemonSummary_Scene();
              const screen = new PokemonSummaryScreen(scene, false);
              await screen.pbStartScreen([pkmn], 0);
              needRefresh = true;
            });
            break;
          case 1: // Withdraw
            if (player().partyFull()) {
              await pbMessage(_INTL("Party is full, can't withdraw Pokémon."));
            } else {
              player().party.push(pkmn);
              slot.reset();
              dayCare.resetEggCounters();
              needRefresh = true;
            }
            break;
        }
      } else {
        switch (await pbMessage("\\ts[]" + _INTL("This slot is empty."), [_INTL("Deposit"), _INTL("Cancel")], 2)) {
          case 0: // Deposit
            if (player().party.length === 0) {
              await pbMessage(_INTL("Party is empty, can't deposit Pokémon."));
            } else {
              await pbChooseNonEggPokemon(1, 3);
              const partyIndex = G.gameVariables.get(1) as number; // pbGet(1)
              if (partyIndex >= 0) {
                const pkmn = player().party[partyIndex]!;
                slot.deposit(pkmn);
                player().party.splice(partyIndex, 1);
                dayCare.resetEggCounters();
                needRefresh = true;
              }
            }
            break;
        }
      }
    }
  }
  cmdWindow.dispose();
}

//===============================================================================
// Debug roaming Pokémon screen
//===============================================================================
export class SpriteWindow_DebugRoamers extends Window_DrawableCommand {
  constructor(viewport: Viewport | null) {
    super(0, 0, Graphics.width, Graphics.height, viewport);
  }

  roamerCount(): number {
    return ROAMING_SPECIES.length;
  }

  override itemCount(): number {
    return this.roamerCount() + 2;
  }

  shadowtext(t: string, x: number, y: number, w: number, h: number, align = 0, colors = 0): void {
    const contents = this.contents!;
    y += 8; // TEXT OFFSET
    const width = contents.textSize(t).width;
    switch (align) {
      case 1:
        x += w - width; // Right aligned
        break;
      case 2:
        x += Math.floor(w / 2) - Math.floor(width / 2); // Centre aligned
        break;
    }
    let base = new Color(12 * 8, 12 * 8, 12 * 8);
    switch (colors) {
      case 1:
        base = new Color(168, 48, 56); // Red
        break;
      case 2:
        base = new Color(0, 144, 0); // Green
        break;
    }
    pbDrawShadowText(contents, x, y, Math.max(width, w), h, t, base, new Color(26 * 8, 26 * 8, 25 * 8));
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    pbSetNarrowFont(this.contents!);
    rect = this.drawCursor(index, rect);
    const nameWidth = Math.floor((rect.width * 50) / 100);
    const statusWidth = Math.floor((rect.width * 50) / 100);
    if (index === this.itemCount() - 2) {
      // Advance roaming
      this.shadowtext(_INTL("[All roam to new locations]"), rect.x, rect.y, nameWidth, rect.height);
    } else if (index === this.itemCount() - 1) {
      // Advance roaming
      this.shadowtext(_INTL("[Clear all current roamer locations]"), rect.x, rect.y, nameWidth, rect.height);
    } else {
      const pkmn = ROAMING_SPECIES[index]!;
      const name = GameData.Species.get(pkmn[0]).name + ` (Lv. ${pkmn[1]})`;
      let status = "";
      let statuscolor = 0;
      if (pkmn[2] <= 0 || G.gameSwitches.get(pkmn[2])) {
        const roam = pokemonGlobal().roamPokemon?.[index];
        if (roam === true) {
          if (roamPokemonCaught()[index]) {
            status = "[CAUGHT]";
          } else {
            status = "[DEFEATED]";
          }
          statuscolor = 1;
        } else {
          // roaming
          const curmap = pokemonGlobal().roamPosition?.[index];
          if (curmap) {
            status = `[ROAMING][${curmap}: ${Data.mapInfos.get(curmap)?.name}]`; // pbLoadMapInfos
          } else {
            status = "[ROAMING][map not set]";
          }
          statuscolor = 2;
        }
      } else {
        status = `[NOT ROAMING][Switch ${pkmn[2]} is off]`;
      }
      this.shadowtext(name, rect.x, rect.y, nameWidth, rect.height);
      this.shadowtext(status, rect.x + nameWidth, rect.y, statusWidth, rect.height, 1, statuscolor);
    }
  }
}

/** v20.1 Hotfixes version (no crash when pressing Action). */
export async function pbDebugRoamers(): Promise<void> {
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const sprites: { cmdwindow: SpriteWindow_DebugRoamers } = { cmdwindow: new SpriteWindow_DebugRoamers(viewport) };
  const cmdwindow = sprites.cmdwindow;
  cmdwindow.active = true;
  // $PokemonGlobal.roamPosition / roamPokemon are nil until the roamers first
  // roam (entering a map); Ruby would crash on them here.
  const roamPosition = () => (pokemonGlobal().roamPosition ??= {});
  const roamPokemon = () => (pokemonGlobal().roamPokemon ??= []);
  for (;;) {
    await Graphics.update();
    Input.update();
    pbUpdateSpriteHash(sprites);
    const idx = cmdwindow.index;
    const pkmn = idx < cmdwindow.roamerCount() ? ROAMING_SPECIES[idx]! : null;
    if (Input.trigger(Input.ACTION) && idx < cmdwindow.roamerCount() &&
        (pkmn![2] <= 0 || G.gameSwitches.get(pkmn![2])) &&
        pokemonGlobal().roamPokemon?.[idx] !== true) {
      // Roam selected Pokémon
      pbPlayDecisionSE();
      if (Input.press(Input.CTRL)) { // Roam to current map
        if (roamPosition()[idx] === pbDefaultMap()) {
          roamPosition()[idx] = null;
        } else {
          roamPosition()[idx] = pbDefaultMap();
        }
      } else { // Roam to a random other map
        const oldmap = roamPosition()[idx];
        pbRoamPokemonOne(idx);
        if (roamPosition()[idx] === oldmap) {
          roamPosition()[idx] = null;
          pbRoamPokemonOne(idx);
        }
        pokemonGlobal().roamedAlready = false;
      }
      cmdwindow.refresh();
    } else if (Input.trigger(Input.BACK)) {
      pbPlayCancelSE();
      break;
    } else if (Input.trigger(Input.USE)) {
      if (idx < cmdwindow.roamerCount()) {
        pbPlayDecisionSE();
        // Toggle through roaming, not roaming, defeated
        // NOTE (Ruby parity): roamPokemonCaught returns a new array when it was
        // never set, so the writes below are lost and a defeated roamer never
        // becomes "caught" (005_Overworld_RoamingPokemon.rb:8,
        // Debug bug fixes.rb:378,383,387).
        if (pkmn![2] > 0 && !G.gameSwitches.get(pkmn![2])) {
          // not roaming -> roaming
          G.gameSwitches.set(pkmn![2], true);
        } else if (pokemonGlobal().roamPokemon?.[idx] !== true) {
          // roaming -> defeated
          roamPokemon()[idx] = true;
          roamPokemonCaught()[idx] = false;
        } else if (roamPokemon()[idx] === true && !roamPokemonCaught()[idx]) {
          // defeated -> caught
          roamPokemonCaught()[idx] = true;
        } else if (pkmn![2] > 0) {
          // caught -> not roaming (or roaming if Switch ID is 0)
          if (pkmn![2] > 0) G.gameSwitches.set(pkmn![2], false);
          roamPokemon()[idx] = null;
          roamPokemonCaught()[idx] = false;
        }
        cmdwindow.refresh();
      } else if (idx === cmdwindow.itemCount() - 2) { // All roam
        if (ROAMING_SPECIES.length === 0) {
          pbPlayBuzzerSE();
        } else {
          pbPlayDecisionSE();
          pbRoamPokemon();
          pokemonGlobal().roamedAlready = false;
          cmdwindow.refresh();
        }
      } else { // Clear all roaming locations
        if (ROAMING_SPECIES.length === 0) {
          pbPlayBuzzerSE();
        } else {
          pbPlayDecisionSE();
          for (let i = 0; i < ROAMING_SPECIES.length; i++) roamPosition()[i] = null;
          pokemonGlobal().roamedAlready = false;
          cmdwindow.refresh();
        }
      }
    }
  }
  pbDisposeSpriteHash(sprites);
  viewport.dispose();
}

//===============================================================================
// Text import/export for localisation
//===============================================================================
/**
 * MessageTypes.extract(outfile) and pbCompileText (001_Technical/
 * 003_Intl_Messages.rb:643, :285, ported in core/intl.ts). The files go
 * through DevFiles under web/data: intl.txt, and the compiled intl.json (Ruby's
 * intl.dat) that Settings.LANGUAGES can name as "intl.dat".
 */
export const IntlMessagesHooks: {
  extract?: (outfile: string) => Promise<void>;
  compileText?: () => Promise<void>;
} = {
  extract: async (outfile) => {
    const { pbExtractAllText } = await import("../core/intl");
    await DevFiles.write(`web/data/${outfile}`, await pbExtractAllText());
  },
  compileText: async () => {
    const { pbCompileText } = await import("../core/intl");
    const txt = await DevFiles.read("web/data/intl.txt");
    if (txt == null) throw new Error(_INTL("Can't find {1}", "intl.txt"));
    await DevFiles.write("web/data/intl.json", pbCompileText(txt));
  },
};

/** safeExists?(path): DevFiles can only read the game's data folders, so anything else counts as missing. */
async function safeExists(path: string): Promise<boolean> {
  try {
    return (await DevFiles.read(path)) !== null;
  } catch {
    return false;
  }
}

export async function pbExtractText(): Promise<void> {
  const msgwindow = pbCreateMessageWindow();
  if (await safeExists("web/data/intl.txt") &&
      !(await pbConfirmMessageSerious(_INTL("intl.txt already exists. Overwrite it?")))) {
    pbDisposeMessageWindow(msgwindow);
    return;
  }
  await pbMessageDisplay(msgwindow, _INTL("Please wait.\\wtnp[0]"));
  if (!IntlMessagesHooks.extract) {
    // Not ported: 001_Technical/003_Intl_Messages.rb:643 (MessageTypes.extract)
    await pbMessageDisplay(msgwindow, _INTL("{1} isn't ported to the browser yet.", "MessageTypes.extract"));
    pbDisposeMessageWindow(msgwindow);
    return;
  }
  await IntlMessagesHooks.extract("intl.txt");
  await pbMessageDisplay(msgwindow, _INTL("All text in the game was extracted and saved to intl.txt.\x01"));
  await pbMessageDisplay(msgwindow, _INTL("To localize the text for a particular language, translate every second line in the file.\x01"));
  await pbMessageDisplay(msgwindow, _INTL("After translating, choose \"Compile Text.\""));
  pbDisposeMessageWindow(msgwindow);
}

export async function pbCompileTextUI(): Promise<void> {
  const msgwindow = pbCreateMessageWindow();
  await pbMessageDisplay(msgwindow, _INTL("Please wait.\\wtnp[0]"));
  try {
    // Not ported: 001_Technical/003_Intl_Messages.rb:285 (pbCompileText); its
    // absence fails like one of its RuntimeErrors.
    if (!IntlMessagesHooks.compileText) throw new Error(_INTL("{1} isn't ported to the browser yet.", "pbCompileText"));
    await IntlMessagesHooks.compileText();
    await pbMessageDisplay(msgwindow, _INTL("Successfully compiled text and saved it to intl.dat.\x01"));
    await pbMessageDisplay(msgwindow, _INTL("To use the file in a game, place the file in the Data folder under a different name, and edit the Settings::LANGUAGES array in the scripts."));
  } catch (e) {
    await pbMessageDisplay(msgwindow, _INTL("Failed to compile text: {1}", (e as Error)?.message ?? String(e)));
  }
  pbDisposeMessageWindow(msgwindow);
}

//===============================================================================
// Battle animations import/export
//===============================================================================
/**
 * dumpBase64Anim / loadBase64Anim / pbConvertAnimToNewFormat
 * (002_Animation editor/004_AnimEditor_ExportImport.rb:16, :20, :88), set by
 * the animation editor's port (debug/editors/AnimEditor_ExportImport.ts).
 * Async: the browser's deflate (CompressionStream) is. Unset, exporting fails
 * ("The export failed.") and .anm files can't be read.
 */
export const AnimEditorHooks: {
  dumpBase64Anim?: (anim: PBAnimation) => Promise<string>;
  loadBase64Anim?: (s: string) => Promise<PBAnimation | null>;
  pbConvertAnimToNewFormat?: (anim: PBAnimation) => boolean | void;
} = {};

/** The image/audio extensions RTP.getImagePath / getAudioPath try, in order. */
const IMAGE_EXTS = ["", ".png", ".gif"];
const AUDIO_EXTS = ["", ".mp3", ".ogg", ".wav", ".wma", ".mid", ".midi"];

/** RTP.getImagePath / getAudioPath: the existing file (with its extension), or null. */
function rtpGetPath(path: string, exts: string[]): string | null {
  for (const ext of exts) {
    if (assetExists(path + ext)) return path + ext;
  }
  return null;
}

/** File.basename(path); Ruby raises a TypeError for nil. */
function fileBasename(path: string | null): string {
  if (path === null) throw new TypeError("no implicit conversion of nil into String");
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Ruby's p $!.message, $!.backtrace */
function pException(e: unknown): void {
  console.error((e as Error)?.message ?? e, (e as Error)?.stack);
}

export async function pbExportAllAnimations(): Promise<void> {
  try {
    // Dir.mkdir("Animations") rescue nil: DevFiles creates folders as it writes.
    await preloadBattleAnimations();
    const animations = pbLoadBattleAnimations();
    if (animations) {
      const msgwindow = pbCreateMessageWindow();
      for (const anim of animations.array) {
        if (!anim || anim.length === 0 || anim.name === "") continue;
        await pbMessageDisplay(msgwindow, anim.name, false);
        await Graphics.update();
        const safename = anim.name.replace(/\W/g, "_");
        // Not ported: 004_AnimEditor_ExportImport.rb:16 (dumpBase64Anim)
        if (!AnimEditorHooks.dumpBase64Anim) throw new Error("dumpBase64Anim isn't ported to the browser yet");
        // NOTE: DevFiles only writes under web/data/ and PBS/, so this write is refused.
        await DevFiles.write(`Animations/${safename}/${safename}.anm`, await AnimEditorHooks.dumpBase64Anim(anim));
        // (File.basename(nil) raises when RTP doesn't find the file: the export fails.)
        if (anim.graphic && anim.graphic !== "") {
          const graphicname = rtpGetPath("Graphics/Animations/" + anim.graphic, IMAGE_EXTS);
          const dest = `Animations/${safename}/` + fileBasename(graphicname);
          await pbSafeCopyFile(graphicname!, dest);
        }
        for (const timing of anim.timing) {
          if (!timing.timingType || timing.timingType === 0) {
            if (timing.name && timing.name !== "") {
              const audioName = rtpGetPath("Audio/SE/Anim/" + timing.name, AUDIO_EXTS);
              const dest = `Animations/${safename}/` + fileBasename(audioName);
              await pbSafeCopyFile(audioName!, dest);
            }
          } else if (timing.timingType === 1 || timing.timingType === 3) {
            if (timing.name && timing.name !== "") {
              const graphicname = rtpGetPath("Graphics/Animations/" + timing.name, IMAGE_EXTS);
              const dest = `Animations/${safename}/` + fileBasename(graphicname);
              await pbSafeCopyFile(graphicname!, dest);
            }
          }
        }
      }
      pbDisposeMessageWindow(msgwindow);
      await pbMessage(_INTL("All animations were extracted and saved to the Animations folder."));
    } else {
      await pbMessage(_INTL("There are no animations to export."));
    }
  } catch (e) {
    pException(e);
    await pbMessage(_INTL("The export failed."));
  }
}

/** Every file under `dir` (DevFiles.list), or [] when it can't be listed (safeIsDirectory? false). */
async function listFiles(dir: string): Promise<string[]> {
  try {
    return await DevFiles.list(dir);
  } catch {
    return [];
  }
}

/** Ruby's `f[f.length - 3, 3] == ext` */
const endsWith3 = (f: string, ext: string) => f.slice(-3) === ext;

export async function pbImportAllAnimations(): Promise<void> {
  // NOTE: DevFiles can't read or list Animations/ (outside web/data/, PBS/ and
  // the asset folders), so this always finds no folders in the browser.
  const animationFolders: string[] = [];
  const all = await listFiles("Animations");
  for (const f of all) {
    const slash = f.indexOf("/");
    if (slash < 0) continue; // Dir.foreach: keep the subfolders
    const folder = "Animations/" + f.slice(0, slash);
    if (!animationFolders.includes(folder)) animationFolders.push(folder);
  }
  if (animationFolders.length === 0) {
    await pbMessage(_INTL("There are no animations to import. Put each animation in a folder within the Animations folder."));
  } else {
    const msgwindow = pbCreateMessageWindow();
    await preloadBattleAnimations();
    let animations = pbLoadBattleAnimations();
    if (!animations) animations = new PBAnimations([]);
    for (const folder of animationFolders) {
      await pbMessageDisplay(msgwindow, folder, false);
      await Graphics.update();
      const audios: string[] = [];
      const inFolder = (await listFiles(folder)).filter((f) => !f.includes("/"));
      const files = inFolder.filter((f) => /\..+$/.test(f)).map((f) => folder + "/" + f); // Dir.glob(folder + "/*.*")
      for (const ext of ["wav", "ogg", "mid", "wma"]) { // mp3
        const upext = ext.toUpperCase();
        audios.push(...files.filter((f) => endsWith3(f, ext)));
        audios.push(...files.filter((f) => endsWith3(f, upext)));
      }
      for (const audio of audios) {
        // (RTP.getAudioPath is nil for a new file: pbSafeCopyFile then just writes the third path.)
        await pbSafeCopyFile(audio, rtpGetPath("Audio/SE/Anim/" + fileBasename(audio), AUDIO_EXTS) ?? "",
          "Audio/SE/Anim/" + fileBasename(audio));
      }
      const images: string[] = [];
      for (const ext of ["png", "gif"]) { // jpg jpeg bmp
        const upext = ext.toUpperCase();
        images.push(...files.filter((f) => endsWith3(f, ext)));
        images.push(...files.filter((f) => endsWith3(f, upext)));
      }
      for (const image of images) {
        await pbSafeCopyFile(image, rtpGetPath("Graphics/Animations/" + fileBasename(image), IMAGE_EXTS) ?? "",
          "Graphics/Animations/" + fileBasename(image));
      }
      for (const f of inFolder.filter((n) => n.endsWith(".anm")).map((n) => folder + "/" + n)) {
        let textdata: PBAnimation | null = null;
        try {
          // Not ported: 004_AnimEditor_ExportImport.rb:20 (loadBase64Anim)
          textdata = (await AnimEditorHooks.loadBase64Anim?.((await DevFiles.read(f)) ?? "")) ?? null;
        } catch {
          textdata = null;
        }
        if (textdata) {
          const anim = textdata as unknown as { name: string; id: number; graphic: string; timing: { name: string | null }[] };
          const index = pbAllocateAnimation(allocatable(animations), anim.name);
          const missingFiles: string[] = [];
          if (anim.name === "") anim.name = fileBasename(folder);
          anim.id = -1; // This is not an RPG Maker XP animation
          AnimEditorHooks.pbConvertAnimToNewFormat?.(textdata);
          if (anim.graphic && anim.graphic !== "" &&
              !inFolder.includes(anim.graphic) &&
              !rtpGetPath("Graphics/Animations/" + anim.graphic, IMAGE_EXTS)) {
            anim.graphic = "";
            // NOTE (Ruby parity): records the name after clearing it (003_Debug_MenuExtraCode.rb:672-673).
            missingFiles.push(anim.graphic);
          }
          for (const timing of anim.timing) {
            if (!timing.name || timing.name === "" ||
                inFolder.includes(timing.name) ||
                rtpGetPath("Audio/SE/Anim/" + timing.name, AUDIO_EXTS)) continue;
            timing.name = "";
            // NOTE (Ruby parity): as above (003_Debug_MenuExtraCode.rb:679-680).
            missingFiles.push(timing.name);
          }
          (animations.array as (PBAnimation | null)[])[index] = textdata;
        }
      }
    }
    // save_data(animations, "Data/PkmnAnimations.rxdata")
    await devWriteOrExplain("web/data/pkmn-animations.json", async () => {
      await DevFiles.write("web/data/pkmn-animations.json", pkmnAnimationsJSON(animations!));
    });
    // $game_temp.battle_animations_data = nil: not ported (animationPlayer.ts
    // caches the animations it fetched; reload the page to see the import).
    pbDisposeMessageWindow(msgwindow);
    await pbMessage(_INTL("All animations were imported."));
  }
}

/**
 * PBAnimations as pbAllocateAnimation uses it. PBAnimations#resize pads with
 * PBAnimation.new (an empty animation, which pbAllocateAnimation treats as a
 * free slot); the port's PBAnimation can't be built empty, so this pads with
 * nil, which it treats the same way.
 */
function allocatable(animations: PBAnimations): AllocatableAnimations {
  const arr = animations.array as (PBAnimation | null)[];
  return {
    get length() { return arr.length; },
    get: (i: number) => arr[i] ?? null,
    resize(len: number) {
      if (len < arr.length) arr.length = len;
      else while (arr.length < len) arr.push(null);
    },
  };
}

/**
 * pkmn-animations.json in tools/convert/convert.rb#write_pkmn_animations'
 * layout. The animations the game loaded came through res.json(), so floats
 * the file spells "255.0" are written back as "255" (the animation editor
 * reads the file with parseDataJSON, which keeps them). Frames are written as
 * the importer does: unset cels as null, trailing nulls dropped.
 */
export function pkmnAnimationsJSON(animations: PBAnimations, move2anim: unknown[] = pbLoadMoveToAnim()): string {
  let out = "{\n";
  out += "  \"move2anim\": [\n" + move2anim.map((h) => "    " + generateJSON(h)).join(",\n") + "\n  ],\n";
  out += "  \"animations\": [\n";
  out += animations.array.map((anim) => {
    if (!anim) return "    null";
    const data: [string, unknown][] = [
      ["id", anim.id], ["name", anim.name], ["graphic", anim.graphic], ["hue", anim.hue], ["position", anim.position],
      ["speed", anim.rawSpeed ?? null], ["scope", anim.scope ?? 0], ["timing", anim.timing],
    ];
    const head = data.map(([k, v]) => `      ${JSON.stringify(k)}: ${generateJSON(v)}`);
    const frames = anim.array.map((f) => {
      const cels = Array.from(f ?? [], (c) => (c ? Array.from(c, (v) => v ?? null) : null));
      while (cels.length > 0 && cels[cels.length - 1] == null) cels.pop();
      return "        " + generateJSON(cels);
    }).join(",\n");
    return "    {\n" + head.join(",\n") + ",\n      \"frames\": [\n" + frames + "\n      ]\n    }";
  }).join(",\n");
  out += "\n  ]\n}\n";
  return out;
}

//===============================================================================
// Compiler::MapData (021_Compiler/004_Compiler_MapsAndEvents.rb:278): the parts
// the Debug menu uses, over web/data/maps/MapNNN.json.
//===============================================================================
/**
 * A number the data files spell as a float ("1.0", "0.3"; Ruby's Float#to_s).
 * JSON.parse would turn "1.0" into 1, so a map saved back would change every
 * such line; parseDataJSON keeps the spelling and prettyDataJSON writes it.
 */
export class JsonFloat {
  constructor(readonly source: string) {}
  valueOf(): number { return Number(this.source); }
  /** Float#to_s ("64.0"), e.g. in the animation editor's sliders. */
  toString(): string { return this.source; }
  toJSON(): number { return Number(this.source); }
}

/** JSON.parse that keeps floats as JsonFloat (needs JSON.parse source text access; plain numbers without it). */
export function parseDataJSON(text: string): unknown {
  const reviver = (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value === "number" && context?.source && /[.eE]/.test(context.source)) return new JsonFloat(context.source);
    return value;
  };
  return JSON.parse(text, reviver as (key: string, value: unknown) => unknown);
}

/** Ruby's JSON.generate (compact), writing JsonFloats as they were spelled. */
function generateJSON(v: unknown): string {
  if (v instanceof JsonFloat) return v.source;
  if (Array.isArray(v)) return "[" + v.map(generateJSON).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ":" + generateJSON(x)).join(",") + "}";
  }
  return JSON.stringify(v) ?? "null";
}

const isNumeric = (v: unknown) => typeof v === "number" || v instanceof JsonFloat;

/**
 * JSON in tools/convert/convert.rb#pretty's layout: anything that fits in 100
 * columns, and every array of plain numbers (tile rows), stays on one line.
 */
export function prettyDataJSON(obj: unknown, indent = ""): string {
  const flat = generateJSON(obj);
  if (flat.length + indent.length <= 100 || (Array.isArray(obj) && obj.every(isNumeric))) return flat;
  const inner = indent + "  ";
  if (Array.isArray(obj)) {
    return "[\n" + obj.map((v) => inner + prettyDataJSON(v, inner)).join(",\n") + "\n" + indent + "]";
  }
  if (obj && typeof obj === "object" && !(obj instanceof JsonFloat)) {
    return "{\n" + Object.entries(obj).map(([k, v]) => inner + JSON.stringify(k) + ": " + prettyDataJSON(v, inner)).join(",\n") +
      "\n" + indent + "}";
  }
  return flat;
}

/** The map's file under the game root. */
export function mapFilename(mapID: number): string {
  return `web/data/maps/Map${String(mapID).padStart(3, "0")}.json`;
}

export class CompilerMapData {
  /** pbLoadMapInfos */
  readonly mapinfos = Data.mapInfos;
  private readonly tilesets = Data.tilesets;
  private readonly maps: (MapData | null)[] = [];

  /** getMap(mapID): the map's file as it is on disk (read through DevFiles), or null. */
  async getMap(mapID: number): Promise<MapData | null> {
    if (this.maps[mapID]) return this.maps[mapID]!;
    try {
      const text = await DevFiles.read(mapFilename(mapID));
      if (text === null) return null;
      this.maps[mapID] = parseDataJSON(text) as MapData;
      return this.maps[mapID]!;
    } catch {
      return null;
    }
  }

  getTilesetPassages(map: MapData, mapID: number): number[] {
    const tileset = this.tilesets.get(map.tilesetId);
    if (!tileset) {
      throw new Error(`Tileset data for tileset number ${map.tilesetId} used on map ${mapID} was not found. ` +
        "The tileset was likely deleted, but one or more maps still use it.");
    }
    return tileset.passages;
  }

  /** saveMap(mapID): save_data(getMap(mapID), mapFilename(mapID)) */
  async saveMap(mapID: number): Promise<void> {
    const map = await this.getMap(mapID);
    await DevFiles.write(mapFilename(mapID), prettyDataJSON(map) + "\n");
  }
}

//===============================================================================
// Properly erases all non-existent tiles in maps (including event graphics)
//===============================================================================
export async function pbDebugFixInvalidTiles(): Promise<void> {
  let totalErrors = 0;
  let numErrorMaps = 0;
  const tilesets = Data.tilesets; // $data_tilesets
  const mapData = new CompilerMapData();
  let t = Math.floor(Date.now() / 1000);
  await Graphics.update();
  const totalMaps = mapData.mapinfos.size;
  Console.echoH1(_INTL("Checking {1} maps for invalid tiles", totalMaps));
  for (const id of [...mapData.mapinfos.keys()].sort((a, b) => a - b)) {
    if (Math.floor(Date.now() / 1000) - t >= 5) {
      await Graphics.update();
      t = Math.floor(Date.now() / 1000);
    }
    let mapErrors = 0;
    const map = await mapData.getMap(id);
    if (!map || !mapData.mapinfos.get(id)) continue;
    const passages = mapData.getTilesetPassages(map, id);
    // Check all tiles in map for non-existent tiles
    const layers = map.layers; // map.data[x, y, z] is layers[z][y][x]
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        for (let i = 0; i < layers.length; i++) {
          const tileId = layers[i]![y]![x]!;
          if (pbCheckTileValidity(tileId, map, tilesets, passages)) continue;
          layers[i]![y]![x] = 0;
          mapErrors += 1;
        }
      }
    }
    // Check all events in map for page graphics using a non-existent tile
    for (const event of map.events) {
      for (const page of event.pages) {
        if (page.graphic.tileId <= 0) continue;
        if (pbCheckTileValidity(page.graphic.tileId, map, tilesets, passages)) continue;
        page.graphic.tileId = 0;
        mapErrors += 1;
      }
    }
    if (mapErrors === 0) continue;
    // Map was changed; save it
    Console.echolnLi(_INTL("{1} error tile(s) found on map {2}: {3}.", mapErrors, id, mapData.mapinfos.get(id)!.name));
    totalErrors += mapErrors;
    numErrorMaps += 1;
    if (!(await devWriteOrExplain(mapFilename(id), () => mapData.saveMap(id)))) return;
  }
  if (numErrorMaps === 0) {
    Console.echoH2(_INTL("Done. No errors found."), { text: "green" });
    await pbMessage(_INTL("No invalid tiles were found."));
  } else {
    echoln("");
    Console.echoH2(_INTL("Done. {1} errors found and fixed.", totalErrors), { text: "green" });
    Console.echoWarn(_INTL("RMXP data was altered. Close RMXP now to ensure changes are applied."));
    echoln("");
    await pbMessage(_INTL("{1} error(s) were found across {2} map(s) and fixed.", totalErrors, numErrorMaps));
    await pbMessage(_INTL("Close RPG Maker XP to ensure the changes are applied properly."));
  }
}

export function pbCheckTileValidity(
  tileId: number | null | undefined, map: Pick<MapData, "tilesetId">, tilesets: Map<number, Tileset>, passages: number[],
): boolean {
  if (tileId === null || tileId === undefined) return false;
  if (tileId > 0 && tileId < 384) {
    // Check for defined autotile
    const autotileId = Math.floor(tileId / 48) - 1;
    // NOTE (Ruby parity): tile IDs 1-47 give autotile_id -1, which Ruby reads
    // as the last autotile name (003_Debug_MenuExtraCode.rb:759-760).
    const autotileName = tilesets.get(map.tilesetId)!.autotileNames.at(autotileId);
    if (autotileName && autotileName !== "") return true;
  } else {
    // Check for tileset data (Ruby's Table returns nil past its end; 0 is truthy)
    if (passages[tileId] !== undefined && passages[tileId] !== null) return true;
  }
  return false;
}

//===============================================================================
// Pseudo-party screen for editing Pokémon being set up for a wild battle
//===============================================================================
export class PokemonDebugPartyScreen implements PokemonDebugScreen {
  private viewport: Viewport;
  private messageBox: Window_AdvancedTextPokemon;
  private helpWindow: Window_UnformattedTextPokemon;

  constructor() {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.messageBox = new Window_AdvancedTextPokemon("");
    this.messageBox.viewport = this.viewport;
    this.messageBox.visible = false;
    this.messageBox.letterbyletter = true;
    pbBottomLeftLines(this.messageBox, 2);
    this.helpWindow = new Window_UnformattedTextPokemon("");
    this.helpWindow.viewport = this.viewport;
    this.helpWindow.visible = true;
    pbBottomLeftLines(this.helpWindow, 1);
  }

  /** PokemonDebugMixin#pbPokemonDebug */
  async pbPokemonDebug(pkmn: Pokemon, pkmnid: unknown, heldpoke: Pokemon | null = null, settingUpBattle = false): Promise<void> {
    await pbPokemonDebug(this, pkmn, pkmnid, heldpoke, settingUpBattle);
  }

  pbEndScreen(): void {
    this.messageBox.dispose();
    this.helpWindow.dispose();
    this.viewport.dispose();
  }

  async pbDisplay(text: string): Promise<void> {
    this.messageBox.text = text;
    this.messageBox.visible = true;
    this.helpWindow.visible = false;
    pbPlayDecisionSE();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (this.messageBox.busy()) {
        if (Input.trigger(Input.USE)) {
          if (this.messageBox.pausing()) pbPlayDecisionSE();
          this.messageBox.resume();
        }
      } else if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) {
        break;
      }
    }
    this.messageBox.visible = false;
    this.helpWindow.visible = true;
  }

  async pbConfirm(text: string): Promise<boolean> {
    // NOTE (Ruby parity): starts as -1 (003_Debug_MenuExtraCode.rb:820); every
    // way out of the loop sets a boolean.
    let ret: boolean | number = -1;
    this.messageBox.text = text;
    this.messageBox.visible = true;
    this.helpWindow.visible = false;
    const cmdwindow = new Window_CommandPokemon([_INTL("Yes"), _INTL("No")]);
    try { // using(cmdwindow)
      cmdwindow.visible = false;
      pbBottomRight(cmdwindow);
      cmdwindow.y -= this.messageBox.height;
      cmdwindow.z = this.viewport.z + 1;
      for (;;) {
        await Graphics.update();
        Input.update();
        if (!this.messageBox.busy()) cmdwindow.visible = true;
        cmdwindow.update();
        this.pbUpdate();
        if (!this.messageBox.busy()) {
          if (Input.trigger(Input.BACK)) {
            ret = false;
            break;
          } else if (Input.trigger(Input.USE) && this.messageBox.resume()) {
            ret = cmdwindow.index === 0;
            break;
          }
        }
      }
    } finally {
      cmdwindow.dispose();
    }
    this.messageBox.visible = false;
    this.helpWindow.visible = true;
    return ret as boolean;
  }

  async pbShowCommands(text: string, commands: string[], index = 0): Promise<number> {
    let ret = -1;
    this.helpWindow.visible = true;
    const cmdwindow = new Window_CommandPokemonColor(commands);
    try { // using(cmdwindow)
      cmdwindow.z = this.viewport.z + 1;
      cmdwindow.index = index;
      pbBottomRight(cmdwindow);
      this.helpWindow.resizeHeightToFit(text, Graphics.width - cmdwindow.width);
      this.helpWindow.text = text;
      pbBottomLeft(this.helpWindow);
      for (;;) {
        await Graphics.update();
        Input.update();
        cmdwindow.update();
        this.pbUpdate();
        if (Input.trigger(Input.BACK)) {
          pbPlayCancelSE();
          ret = -1;
          break;
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          ret = cmdwindow.index;
          break;
        }
      }
    } finally {
      cmdwindow.dispose();
    }
    return ret;
  }

  async pbChooseMove(pkmn: Pokemon, text: string, index = 0): Promise<number> {
    const moveNames: string[] = [];
    for (const i of pkmn.moves) {
      if (i.totalPp <= 0) {
        moveNames.push(_INTL("{1} (PP: ---)", i.name));
      } else {
        moveNames.push(_INTL("{1} (PP: {2}/{3})", i.name, i.pp, i.totalPp));
      }
    }
    return this.pbShowCommands(text, moveNames, index);
  }

  pbRefreshSingle(_index: unknown): void {}

  update(): void {
    this.messageBox.update();
    this.helpWindow.update();
  }

  /** alias pbUpdate update */
  pbUpdate(): void {
    this.update();
  }
}
