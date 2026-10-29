// Port of 020_Debug/003_Debug menus/007_Debug_PokemonCommands.rb: the options
// of the Pokémon Debug menu (:pokemon_debug_menu, the party/storage "Debug"
// command and the "Test Wild Battle Advanced" Pokémon editor), registered with
// MenuHandlers. Plugin overrides folded in, in plugin load order:
// - v20.1 Hotfixes/Debug bug fixes.rb:259 (:species_and_form: a single-form
//   species can have its form reset to 0);
// - Generation 9 Pack Scripts/[000] General/[002] Debug.rb:11 (:set_status:
//   Drowsy gets a turn count too);
// - Essentials Deluxe/[000] Essentials Patches/Debug.rb:51-102 (the "Deluxe
//   Options..." submenu, :set_ace, :set_scale).
// ZUD's :set_dynamax (also in "Deluxe Options...") is in battle/zud/Debug.ts and
// Enhanced UI's :set_shiny_leaf in DebugPokemonCommands_EnhancedUI.ts, so that
// debug/index.ts can load them in the plugins' order (Deluxe < ZUD < Enhanced UI).

import { pbHiddenPower } from "../battle/move/MoveEffects_MoveAttributes";
import { rand } from "../core/random";
import { GameData, type Id } from "../data/gameData";
import { Settings } from "../data/gameData/settings";
import { G } from "../game/globals";
import { pbLearnMove } from "../game/items/itemUtilities";
import { MultipleForms } from "../game/pokemon/formHandlers";
import { Mail } from "../game/pokemon/Mail";
import { Pokemon } from "../game/pokemon/Pokemon";
import { pbHasEgg, pbStorePokemon } from "../game/pokemon/utilities";
import type { Player } from "../game/trainer/Player";
import { MenuHandlers, type MenuHandlerHash } from "../ui/menus/menuHandlers";
import { _INTL } from "../ui/messageConfig";
import { ChooseNumberParams, pbMessage, pbMessageChooseNumber } from "../ui/messages";
import { PokemonPartyScreen } from "../ui/party/party";
import { PokemonStorageScreen, type Selection } from "../ui/storage/PokemonStorageScreen";
import { pbEnterPlayerName, pbEnterPokemonName } from "../ui/textEntry/UI_TextEntry";
import type { PokemonDebugEffect } from "./DebugMenus";
import { EditorScreens } from "./editorScreens";
import { pbChooseAbilityList, pbChooseItemList, pbChooseMoveList, pbChooseSpeciesList } from "./EditorUtilities";

const player = () => G.player as unknown as Player;

/** A :pokemon_debug_menu option's hash (its effect gets PokemonDebugMixin's arguments). */
export interface PokemonDebugOption extends MenuHandlerHash {
  parent: string;
  always_show?: boolean;
  effect?: PokemonDebugEffect;
}

/** Types an option's hash, so its effect's arguments are typed. */
export function pokemonDebugOption(hash: PokemonDebugOption): PokemonDebugOption {
  return hash;
}

/** sprintf("0x%08X", n) */
function hex8(n: number): string {
  return "0x" + (n >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

/** Ruby's Integer#clamp */
function clamp(v: number, mn: number, mx: number): number {
  return v < mn ? mn : v > mx ? mx : v;
}

//===============================================================================
// HP/Status options
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "hp_status_menu", {
  name: "HP/Status...",
  parent: "main",
});

MenuHandlers.add("pokemon_debug_menu", "set_hp", pokemonDebugOption({
  name: "Set HP",
  parent: "hp_status_menu",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    if (pkmn.egg()) {
      await screen.pbDisplay(_INTL("{1} is an egg.", pkmn.name));
    } else {
      const params = new ChooseNumberParams();
      params.setRange(0, pkmn.totalhp);
      params.setDefaultValue(pkmn.hp);
      const newhp = await pbMessageChooseNumber(
        _INTL("Set {1}'s HP (max. {2}).", pkmn.name, pkmn.totalhp), params, () => screen.pbUpdate());
      if (newhp !== pkmn.hp) {
        pkmn.hp = newhp;
        screen.pbRefreshSingle(pkmnid);
      }
    }
    return false;
  },
}));

// Generation 9 Pack's version ([002] Debug.rb:11): Drowsy also gets a count.
MenuHandlers.add("pokemon_debug_menu", "set_status", pokemonDebugOption({
  name: "Set status",
  parent: "hp_status_menu",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    if (pkmn.egg()) {
      await screen.pbDisplay(_INTL("{1} is an egg.", pkmn.name));
    } else if (pkmn.hp <= 0) {
      await screen.pbDisplay(_INTL("{1} is fainted, can't change status.", pkmn.name));
    } else {
      let cmd = 0;
      const commands = [_INTL("[Cure]")];
      const ids: Id[] = ["NONE"];
      for (const s of GameData.Status.each()) {
        if (s.id === "NONE") continue;
        commands.push(_INTL("Set {1}", s.name));
        ids.push(s.id);
      }
      for (;;) {
        let msg = _INTL("Current status: {1}", GameData.Status.get(pkmn.status).name);
        if (pkmn.status === "SLEEP") {
          msg = _INTL("Current status: {1} (turns: {2})",
            GameData.Status.get(pkmn.status).name, pkmn.statusCount);
        }
        cmd = await screen.pbShowCommands(msg, commands, cmd);
        if (cmd < 0) break;
        switch (cmd) {
          case 0:
            pkmn.healStatus();
            screen.pbRefreshSingle(pkmnid);
            break;
          default: {
            let count = 0;
            let cancel = false;
            if (["SLEEP", "DROWSY"].includes(ids[cmd]!)) {
              const params = new ChooseNumberParams();
              params.setRange(0, 9);
              params.setDefaultValue(3);
              const status = ids[cmd] === "SLEEP" ? "sleep" : "drowsy";
              count = await pbMessageChooseNumber(
                _INTL(`Set the Pokémon's ${status} count.`), params, () => screen.pbUpdate());
              if (count <= 0) cancel = true;
            }
            if (!cancel) {
              pkmn.status = ids[cmd]!;
              pkmn.statusCount = count;
              screen.pbRefreshSingle(pkmnid);
            }
            break;
          }
        }
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "full_heal", pokemonDebugOption({
  name: "Fully heal",
  parent: "hp_status_menu",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    if (pkmn.egg()) {
      await screen.pbDisplay(_INTL("{1} is an egg.", pkmn.name));
    } else {
      pkmn.heal();
      await screen.pbDisplay(_INTL("{1} was fully healed.", pkmn.name));
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "make_fainted", pokemonDebugOption({
  name: "Make fainted",
  parent: "hp_status_menu",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    if (pkmn.egg()) {
      await screen.pbDisplay(_INTL("{1} is an egg.", pkmn.name));
    } else {
      pkmn.hp = 0;
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_pokerus", pokemonDebugOption({
  name: "Set Pokérus",
  parent: "hp_status_menu",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const pokerus = pkmn.pokerus ? pkmn.pokerus : 0;
      const msg = [_INTL("{1} doesn't have Pokérus.", pkmn.name),
        _INTL("Has strain {1}, infectious for {2} more days.", Math.floor(pokerus / 16), pokerus % 16),
        _INTL("Has strain {1}, not infectious.", Math.floor(pokerus / 16))][pkmn.pokerusStage()]!;
      cmd = await screen.pbShowCommands(msg,
        [_INTL("Give random strain"),
          _INTL("Make not infectious"),
          _INTL("Clear Pokérus")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Give random strain
          pkmn.givePokerus();
          screen.pbRefreshSingle(pkmnid);
          break;
        case 1: // Make not infectious
          if (pokerus > 0) {
            const strain = Math.floor(pokerus / 16);
            const p = strain << 4;
            pkmn.pokerus = p;
            screen.pbRefreshSingle(pkmnid);
          }
          break;
        case 2: // Clear Pokérus
          pkmn.pokerus = 0;
          screen.pbRefreshSingle(pkmnid);
          break;
      }
    }
    return false;
  },
}));

//===============================================================================
// Level/stats options
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "level_stats", {
  name: "Level/stats...",
  parent: "main",
});

MenuHandlers.add("pokemon_debug_menu", "set_level", pokemonDebugOption({
  name: "Set level",
  parent: "level_stats",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    if (pkmn.egg()) {
      await screen.pbDisplay(_INTL("{1} is an egg.", pkmn.name));
    } else {
      const params = new ChooseNumberParams();
      params.setRange(1, GameData.GrowthRate.maxLevel());
      params.setDefaultValue(pkmn.level);
      const level = await pbMessageChooseNumber(
        _INTL("Set the Pokémon's level (max. {1}).", params.maxNumber), params, () => screen.pbUpdate());
      if (level !== pkmn.level) {
        pkmn.level = level;
        pkmn.calcStats();
        screen.pbRefreshSingle(pkmnid);
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_exp", pokemonDebugOption({
  name: "Set Exp",
  parent: "level_stats",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    if (pkmn.egg()) {
      await screen.pbDisplay(_INTL("{1} is an egg.", pkmn.name));
    } else {
      const minxp = pkmn.growthRate().minimumExpForLevel(pkmn.level);
      const maxxp = pkmn.growthRate().minimumExpForLevel(pkmn.level + 1);
      if (minxp === maxxp) {
        await screen.pbDisplay(_INTL("{1} is at the maximum level.", pkmn.name));
      } else {
        const params = new ChooseNumberParams();
        params.setRange(minxp, maxxp - 1);
        params.setDefaultValue(pkmn.exp);
        const newexp = await pbMessageChooseNumber(
          _INTL("Set the Pokémon's Exp (range {1}-{2}).", minxp, maxxp - 1), params, () => screen.pbUpdate());
        if (newexp !== pkmn.exp) {
          pkmn.exp = newexp;
          pkmn.calcStats();
          screen.pbRefreshSingle(pkmnid);
        }
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "hidden_values", pokemonDebugOption({
  name: "EV/IV/pID...",
  parent: "level_stats",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const persid = hex8(pkmn.personalID);
      cmd = await screen.pbShowCommands(_INTL("Personal ID is {1}.", persid),
        [_INTL("Set EVs"),
          _INTL("Set IVs"),
          _INTL("Randomise pID")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Set EVs
          let cmd2 = 0;
          for (;;) {
            let totalev = 0;
            const evcommands: string[] = [];
            const evId: Id[] = [];
            for (const s of GameData.Stat.eachMain()) {
              evcommands.push(s.name + ` (${pkmn.ev[s.id]})`);
              evId.push(s.id);
              totalev += pkmn.ev[s.id]!;
            }
            evcommands.push(_INTL("Randomise all"));
            evcommands.push(_INTL("Max randomise all"));
            cmd2 = await screen.pbShowCommands(_INTL("Change which EV?\nTotal: {1}/{2} ({3}%)",
              totalev, Pokemon.EV_LIMIT,
              Math.floor((100 * totalev) / Pokemon.EV_LIMIT)), evcommands, cmd2);
            if (cmd2 < 0) break;
            if (cmd2 < evId.length) {
              const params = new ChooseNumberParams();
              let upperLimit = 0;
              for (const s of GameData.Stat.eachMain()) if (s.id !== evId[cmd2]) upperLimit += pkmn.ev[s.id]!;
              upperLimit = Pokemon.EV_LIMIT - upperLimit;
              upperLimit = Math.min(upperLimit, Pokemon.EV_STAT_LIMIT);
              const thisValue = Math.min(pkmn.ev[evId[cmd2]!]!, upperLimit);
              params.setRange(0, upperLimit);
              params.setDefaultValue(thisValue);
              params.setCancelValue(thisValue);
              const f = await pbMessageChooseNumber(_INTL("Set the EV for {1} (max. {2}).",
                GameData.Stat.get(evId[cmd2]!).name, upperLimit), params, () => screen.pbUpdate());
              if (f !== pkmn.ev[evId[cmd2]!]) {
                pkmn.ev[evId[cmd2]!] = f;
                pkmn.calcStats();
                screen.pbRefreshSingle(pkmnid);
              }
            } else { // (Max) Randomise all
              let evTotalTarget = Pokemon.EV_LIMIT;
              if (cmd2 === evcommands.length - 2) { // Randomize all (not max)
                evTotalTarget = rand(Pokemon.EV_LIMIT);
              }
              for (const s of GameData.Stat.eachMain()) pkmn.ev[s.id] = 0;
              while (evTotalTarget > 0) {
                const r = rand(evId.length);
                if (pkmn.ev[evId[r]!]! >= Pokemon.EV_STAT_LIMIT) continue;
                let addVal = 1 + rand(Math.floor(Pokemon.EV_STAT_LIMIT / 4));
                addVal = clamp(addVal, 0, evTotalTarget);
                addVal = clamp(addVal, 0, Pokemon.EV_STAT_LIMIT - pkmn.ev[evId[r]!]!);
                if (addVal === 0) continue;
                pkmn.ev[evId[r]!]! += addVal;
                evTotalTarget -= addVal;
              }
              pkmn.calcStats();
              screen.pbRefreshSingle(pkmnid);
            }
          }
          break;
        }
        case 1: { // Set IVs
          let cmd2 = 0;
          for (;;) {
            const hiddenpower = pbHiddenPower(pkmn);
            let totaliv = 0;
            const ivcommands: string[] = [];
            const ivId: Id[] = [];
            for (const s of GameData.Stat.eachMain()) {
              ivcommands.push(s.name + ` (${pkmn.iv[s.id]})`);
              ivId.push(s.id);
              totaliv += pkmn.iv[s.id]!;
            }
            const msg = _INTL("Change which IV?\nHidden Power:\n{1}, power {2}\nTotal: {3}/{4} ({5}%)",
              GameData.Type.get(hiddenpower[0]!).name, hiddenpower[1], totaliv,
              ivId.length * Pokemon.IV_STAT_LIMIT, Math.floor((100 * totaliv) / (ivId.length * Pokemon.IV_STAT_LIMIT)));
            ivcommands.push(_INTL("Randomise all"));
            cmd2 = await screen.pbShowCommands(msg, ivcommands, cmd2);
            if (cmd2 < 0) break;
            if (cmd2 < ivId.length) {
              const params = new ChooseNumberParams();
              params.setRange(0, Pokemon.IV_STAT_LIMIT);
              params.setDefaultValue(pkmn.iv[ivId[cmd2]!]!);
              params.setCancelValue(pkmn.iv[ivId[cmd2]!]!);
              const f = await pbMessageChooseNumber(_INTL("Set the IV for {1} (max. 31).",
                GameData.Stat.get(ivId[cmd2]!).name), params, () => screen.pbUpdate());
              if (f !== pkmn.iv[ivId[cmd2]!]) {
                pkmn.iv[ivId[cmd2]!] = f;
                pkmn.calcStats();
                screen.pbRefreshSingle(pkmnid);
              }
            } else { // Randomise all
              for (const s of GameData.Stat.eachMain()) pkmn.iv[s.id] = rand(Pokemon.IV_STAT_LIMIT + 1);
              pkmn.calcStats();
              screen.pbRefreshSingle(pkmnid);
            }
          }
          break;
        }
        case 2: // Randomise pID
          pkmn.personalID = (rand(2 ** 16) | (rand(2 ** 16) << 16)) >>> 0;
          pkmn.calcStats();
          screen.pbRefreshSingle(pkmnid);
          break;
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_happiness", pokemonDebugOption({
  name: "Set happiness",
  parent: "level_stats",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    const params = new ChooseNumberParams();
    params.setRange(0, 255);
    params.setDefaultValue(pkmn.happiness);
    const h = await pbMessageChooseNumber(
      _INTL("Set the Pokémon's happiness (max. 255)."), params, () => screen.pbUpdate());
    if (h !== pkmn.happiness) {
      pkmn.happiness = h;
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "contest_stats", {
  name: "Contest stats...",
  parent: "level_stats",
});

/** :set_beauty ... :set_sheen (007:344-450): the same handler on a different contest stat. */
function contestStatOption(option: string, name: string, stat: "beauty" | "cool" | "cute" | "smart" | "tough" | "sheen",
  message: string): void {
  MenuHandlers.add("pokemon_debug_menu", option, pokemonDebugOption({
    name,
    parent: "contest_stats",
    effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
      const params = new ChooseNumberParams();
      params.setRange(0, 255);
      params.setDefaultValue(pkmn[stat]);
      const newval = await pbMessageChooseNumber(_INTL(message), params, () => screen.pbUpdate());
      if (newval !== pkmn[stat]) {
        pkmn[stat] = newval;
        screen.pbRefreshSingle(pkmnid);
      }
      return false;
    },
  }));
}

contestStatOption("set_beauty", "Set Beauty", "beauty", "Set the Pokémon's Beauty (max. 255).");
contestStatOption("set_cool", "Set Cool", "cool", "Set the Pokémon's Cool (max. 255).");
contestStatOption("set_cute", "Set Cute", "cute", "Set the Pokémon's Cute (max. 255).");
contestStatOption("set_smart", "Set Smart", "smart", "Set the Pokémon's Smart (max. 255).");
contestStatOption("set_tough", "Set Tough", "tough", "Set the Pokémon's Tough (max. 255).");
contestStatOption("set_sheen", "Set Sheen", "sheen", "Set the Pokémon's Sheen (max. 255).");

//===============================================================================
// Moves options
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "moves", {
  name: "Moves...",
  parent: "main",
});

MenuHandlers.add("pokemon_debug_menu", "teach_move", pokemonDebugOption({
  name: "Teach move",
  parent: "moves",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    const move = await pbChooseMoveList();
    if (move) {
      await pbLearnMove(pkmn, move);
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "forget_move", pokemonDebugOption({
  name: "Forget move",
  parent: "moves",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    const moveindex = await screen.pbChooseMove(pkmn, _INTL("Choose move to forget."));
    if (moveindex >= 0) {
      const movename = pkmn.moves[moveindex]!.name;
      pkmn.forgetMoveAtIndex(moveindex);
      await screen.pbDisplay(_INTL("{1} forgot {2}.", pkmn.name, movename));
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "reset_moves", pokemonDebugOption({
  name: "Reset moves",
  parent: "moves",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    pkmn.resetMoves();
    await screen.pbDisplay(_INTL("{1}'s moves were reset.", pkmn.name));
    screen.pbRefreshSingle(pkmnid);
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_move_pp", pokemonDebugOption({
  name: "Set move PP",
  parent: "moves",
  effect: async (pkmn, _pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const commands: string[] = [];
      for (const i of pkmn.moves) {
        if (!i.id) break;
        if (i.totalPp <= 0) {
          commands.push(_INTL("{1} (PP: ---)", i.name));
        } else {
          commands.push(_INTL("{1} (PP: {2}/{3})", i.name, i.pp, i.totalPp));
        }
      }
      commands.push(_INTL("Restore all PP"));
      cmd = await screen.pbShowCommands(_INTL("Alter PP of which move?"), commands, cmd);
      if (cmd < 0) break;
      if (cmd >= 0 && cmd < commands.length - 1) { // Move
        const move = pkmn.moves[cmd]!;
        const movename = move.name;
        if (move.totalPp <= 0) {
          await screen.pbDisplay(_INTL("{1} has infinite PP.", movename));
        } else {
          let cmd2 = 0;
          for (;;) {
            const msg = _INTL("{1}: PP {2}/{3} (PP Up {4}/3)", movename, move.pp, move.totalPp, move.ppup);
            cmd2 = await screen.pbShowCommands(msg,
              [_INTL("Set PP"),
                _INTL("Full PP"),
                _INTL("Set PP Up")], cmd2);
            if (cmd2 < 0) break;
            switch (cmd2) {
              case 0: { // Change PP
                const params = new ChooseNumberParams();
                params.setRange(0, move.totalPp);
                params.setDefaultValue(move.pp);
                const h = await pbMessageChooseNumber(
                  _INTL("Set PP of {1} (max. {2}).", movename, move.totalPp), params, () => screen.pbUpdate());
                move.pp = h;
                break;
              }
              case 1: // Full PP
                move.pp = move.totalPp;
                break;
              case 2: { // Change PP Up
                const params = new ChooseNumberParams();
                params.setRange(0, 3);
                params.setDefaultValue(move.ppup);
                const h = await pbMessageChooseNumber(
                  _INTL("Set PP Up of {1} (max. 3).", movename), params, () => screen.pbUpdate());
                move.ppup = h;
                if (move.pp > move.totalPp) move.pp = move.totalPp;
                break;
              }
            }
          }
        }
      } else if (cmd === commands.length - 1) { // Restore all PP
        pkmn.healPP();
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_initial_moves", pokemonDebugOption({
  name: "Reset initial moves",
  parent: "moves",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    pkmn.recordFirstMoves();
    await screen.pbDisplay(_INTL("{1}'s moves were set as its first-known moves.", pkmn.name));
    screen.pbRefreshSingle(pkmnid);
    return false;
  },
}));

//===============================================================================
// Other options
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "set_item", pokemonDebugOption({
  name: "Set item",
  parent: "main",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    const commands = [
      _INTL("Change item"),
      _INTL("Remove item"),
    ];
    for (;;) {
      const msg = pkmn.hasItem() ? _INTL("Item is {1}.", pkmn.item!.name) : _INTL("No item.");
      cmd = await screen.pbShowCommands(msg, commands, cmd);
      if (cmd < 0) break;
      if (cmd === 0) { // Change item
        const item = await pbChooseItemList(pkmn.itemId);
        if (item && item !== pkmn.itemId) {
          pkmn.item = item;
          if (GameData.Item.get(item).isMail()) {
            pkmn.mail = new Mail(item, _INTL("Text"), player().name);
          }
          screen.pbRefreshSingle(pkmnid);
        }
      } else if (cmd === 1) { // Remove item
        if (pkmn.hasItem()) {
          pkmn.item = null;
          pkmn.mail = null;
          screen.pbRefreshSingle(pkmnid);
        }
      } else {
        break;
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_ability", pokemonDebugOption({
  name: "Set ability",
  parent: "main",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    const commands = [
      _INTL("Set possible ability"),
      _INTL("Set any ability"),
      _INTL("Reset"),
    ];
    for (;;) {
      let msg: string;
      if (pkmn.ability) {
        msg = _INTL("Ability is {1} (index {2}).", pkmn.ability.name, pkmn.abilityIndex);
      } else {
        msg = _INTL("No ability (index {1}).", pkmn.abilityIndex);
      }
      cmd = await screen.pbShowCommands(msg, commands, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Set possible ability
          const abils = pkmn.getAbilityList();
          const abilityCommands: string[] = [];
          let abilCmd = 0;
          for (const i of abils) {
            abilityCommands.push((i[1] < 2 ? "" : "(H) ") + GameData.Ability.get(i[0]).name);
            if (pkmn.abilityId === i[0]) abilCmd = abilityCommands.length - 1;
          }
          abilCmd = await screen.pbShowCommands(_INTL("Choose an ability."), abilityCommands, abilCmd);
          if (abilCmd < 0) continue;
          pkmn.abilityIndex = abils[abilCmd]![1];
          pkmn.ability = null;
          screen.pbRefreshSingle(pkmnid);
          break;
        }
        case 1: { // Set any ability
          const newAbility = await pbChooseAbilityList(pkmn.abilityId);
          if (newAbility && newAbility !== pkmn.abilityId) {
            pkmn.ability = newAbility;
            screen.pbRefreshSingle(pkmnid);
          }
          break;
        }
        case 2: // Reset
          pkmn.abilityIndex = null;
          pkmn.ability = null;
          screen.pbRefreshSingle(pkmnid);
          break;
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_nature", pokemonDebugOption({
  name: "Set nature",
  parent: "main",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    const commands: string[] = [];
    const ids: Id[] = [];
    for (const nature of GameData.Nature.each()) {
      if (nature.statChanges.length === 0) {
        commands.push(_INTL("{1} (---)", nature.realName));
      } else {
        let plusText = "";
        let minusText = "";
        for (const change of nature.statChanges) {
          if (change[1] > 0) {
            if (plusText !== "") plusText += "/";
            plusText += GameData.Stat.get(change[0]).nameBrief;
          } else if (change[1] < 0) {
            if (minusText !== "") minusText += "/";
            minusText += GameData.Stat.get(change[0]).nameBrief;
          }
        }
        commands.push(_INTL("{1} (+{2}, -{3})", nature.realName, plusText, minusText));
      }
      ids.push(nature.id);
    }
    commands.push(_INTL("[Reset]"));
    let cmd = ids.indexOf(pkmn.natureId || ids[0]!);
    for (;;) {
      const msg = _INTL("Nature is {1}.", pkmn.nature!.name);
      cmd = await screen.pbShowCommands(msg, commands, cmd);
      if (cmd < 0) break;
      if (cmd >= 0 && cmd < commands.length - 1) { // Set nature
        pkmn.nature = ids[cmd]!;
      } else if (cmd === commands.length - 1) { // Reset
        pkmn.nature = null;
      }
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_gender", pokemonDebugOption({
  name: "Set gender",
  parent: "main",
  effect: async (pkmn, pkmnid, _heldpoke, settingUpBattle, screen) => {
    if (pkmn.singleGendered()) {
      await screen.pbDisplay(_INTL("{1} is single-gendered or genderless.", pkmn.speciesName()));
    } else {
      let cmd = 0;
      for (;;) {
        const msg = [_INTL("Gender is male."), _INTL("Gender is female.")][pkmn.male() ? 0 : 1]!;
        cmd = await screen.pbShowCommands(msg,
          [_INTL("Make male"),
            _INTL("Make female"),
            _INTL("Reset")], cmd);
        if (cmd < 0) break;
        switch (cmd) {
          case 0: // Make male
            pkmn.makeMale();
            if (!pkmn.male()) {
              await screen.pbDisplay(_INTL("{1}'s gender couldn't be changed.", pkmn.name));
            }
            break;
          case 1: // Make female
            pkmn.makeFemale();
            if (!pkmn.female()) {
              await screen.pbDisplay(_INTL("{1}'s gender couldn't be changed.", pkmn.name));
            }
            break;
          case 2: // Reset
            pkmn.gender = null;
            break;
        }
        if (!settingUpBattle && !pkmn.egg()) player().pokedex.register(pkmn);
        screen.pbRefreshSingle(pkmnid);
      }
    }
    return false;
  },
}));

// v20.1 Hotfixes' version (Debug bug fixes.rb:259): a species with one form can
// have its form reset to 0.
MenuHandlers.add("pokemon_debug_menu", "species_and_form", pokemonDebugOption({
  name: "Species/form...",
  parent: "main",
  effect: async (pkmn, pkmnid, _heldpoke, settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const msg = [_INTL("Species {1}, form {2}.", pkmn.speciesName(), pkmn.form),
        _INTL("Species {1}, form {2} (forced).", pkmn.speciesName(), pkmn.form)][pkmn.forcedForm == null ? 0 : 1]!;
      cmd = await screen.pbShowCommands(msg,
        [_INTL("Set species"),
          _INTL("Set form"),
          _INTL("Remove form override")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Set species
          const species = await pbChooseSpeciesList(pkmn.species);
          if (species && species !== pkmn.species) {
            pkmn.species = species;
            pkmn.calcStats();
            if (!settingUpBattle && !pkmn.egg()) player().pokedex.register(pkmn);
            screen.pbRefreshSingle(pkmnid);
          }
          break;
        }
        case 1: { // Set form
          let cmd2 = 0;
          const formcmds: [number[], string[]] = [[], []];
          for (const sp of GameData.Species.each()) {
            if (sp.species !== pkmn.species) continue;
            let formName = sp.formName;
            if (!formName || formName === "") formName = _INTL("Unnamed form");
            formName = `${sp.form}: ${formName}`;
            formcmds[0].push(sp.form);
            formcmds[1].push(formName);
            // NOTE (Ruby parity): Debug bug fixes.rb:291 (007:772) uses the form
            // number as the list index, so species whose forms aren't numbered
            // 0, 1, 2... start the cursor on the wrong form.
            if (pkmn.form === sp.form) cmd2 = sp.form;
          }
          if (formcmds[0].length <= 1) {
            await screen.pbDisplay(_INTL("Species {1} only has one form.", pkmn.speciesName()));
            if (pkmn.form !== 0 && (await screen.pbConfirm(_INTL("Do you want to reset the form to 0?")))) {
              pkmn.form = 0;
              if (!settingUpBattle && !pkmn.egg()) player().pokedex.register(pkmn);
              screen.pbRefreshSingle(pkmnid);
            }
          } else {
            cmd2 = await screen.pbShowCommands(_INTL("Set the Pokémon's form."), formcmds[1], cmd2);
            if (cmd2 < 0) continue;
            const f = formcmds[0][cmd2]!;
            if (f !== pkmn.form) {
              if (MultipleForms.hasFunction(pkmn, "getForm")) {
                if (!(await screen.pbConfirm(_INTL("This species decides its own form. Override?")))) continue;
                pkmn.forcedForm = f;
              }
              pkmn.form = f;
              if (!settingUpBattle && !pkmn.egg()) player().pokedex.register(pkmn);
              screen.pbRefreshSingle(pkmnid);
            }
          }
          break;
        }
        case 2: // Remove form override
          pkmn.forcedForm = null;
          screen.pbRefreshSingle(pkmnid);
          break;
      }
    }
    return false;
  },
}));

//===============================================================================
// Cosmetic options
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "cosmetic", {
  name: "Cosmetic info...",
  parent: "main",
});

MenuHandlers.add("pokemon_debug_menu", "set_shininess", pokemonDebugOption({
  name: "Set shininess",
  parent: "cosmetic",
  effect: async (pkmn, pkmnid, _heldpoke, settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const msgIdx = pkmn.shiny ? (pkmn.superShiny ? 1 : 0) : 2;
      const msg = [_INTL("Is shiny."), _INTL("Is super shiny."), _INTL("Is normal (not shiny).")][msgIdx]!;
      cmd = await screen.pbShowCommands(msg, [_INTL("Make shiny"), _INTL("Make super shiny"),
        _INTL("Make normal"), _INTL("Reset")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Make shiny
          pkmn.shiny = true;
          pkmn.superShiny = false;
          break;
        case 1: // Make super shiny
          pkmn.superShiny = true;
          break;
        case 2: // Make normal
          pkmn.shiny = false;
          pkmn.superShiny = false;
          break;
        case 3: // Reset
          pkmn.shiny = null;
          pkmn.superShiny = null;
          break;
      }
      if (!settingUpBattle && !pkmn.egg()) player().pokedex.register(pkmn);
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_pokeball", pokemonDebugOption({
  name: "Set Poké Ball",
  parent: "cosmetic",
  effect: async (pkmn, _pkmnid, _heldpoke, _settingUpBattle, screen) => {
    const commands: string[] = [];
    const balls: [Id, string][] = [];
    for (const itemData of GameData.Item.each()) {
      if (itemData.isPokeBall()) balls.push([itemData.id, itemData.name]);
    }
    balls.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    let cmd = 0;
    for (let i = 0; i < balls.length; i++) {
      if (balls[i]![0] !== pkmn.pokeBall) continue;
      cmd = i;
      break;
    }
    for (const ball of balls) commands.push(ball[1]);
    for (;;) {
      const oldball = GameData.Item.get(pkmn.pokeBall).name;
      cmd = await screen.pbShowCommands(_INTL("{1} used.", oldball), commands, cmd);
      if (cmd < 0) break;
      pkmn.pokeBall = balls[cmd]![0];
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_ribbons", pokemonDebugOption({
  name: "Set ribbons",
  parent: "cosmetic",
  effect: async (pkmn, _pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const commands: string[] = [];
      const ids: Id[] = [];
      for (const ribbonData of GameData.Ribbon.each()) {
        commands.push(_INTL("{1} {2}",
          pkmn.hasRibbon(ribbonData.id) ? "[Y]" : "[  ]", ribbonData.name));
        ids.push(ribbonData.id);
      }
      commands.push(_INTL("Give all"));
      commands.push(_INTL("Clear all"));
      cmd = await screen.pbShowCommands(_INTL("{1} ribbons.", pkmn.numRibbons()), commands, cmd);
      if (cmd < 0) break;
      if (cmd >= 0 && cmd < ids.length) { // Toggle ribbon
        if (pkmn.hasRibbon(ids[cmd]!)) {
          pkmn.takeRibbon(ids[cmd]!);
        } else {
          pkmn.giveRibbon(ids[cmd]!);
        }
      } else if (cmd === commands.length - 2) { // Give all
        for (const ribbonData of GameData.Ribbon.each()) {
          pkmn.giveRibbon(ribbonData.id);
        }
      } else if (cmd === commands.length - 1) { // Clear all
        pkmn.clearAllRibbons();
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "set_nickname", pokemonDebugOption({
  name: "Set nickname",
  parent: "cosmetic",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const speciesname = pkmn.speciesName();
      const msg = [_INTL("{1} has the nickname {2}.", speciesname, pkmn.name),
        _INTL("{1} has no nickname.", speciesname)][pkmn.nicknamed() ? 0 : 1]!;
      cmd = await screen.pbShowCommands(msg, [_INTL("Rename"), _INTL("Erase name")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Rename
          const oldname = pkmn.nicknamed() ? pkmn.name : "";
          const newname = await pbEnterPokemonName(_INTL("{1}'s nickname?", speciesname),
            0, Pokemon.MAX_NAME_SIZE, oldname, pkmn);
          pkmn.name = newname;
          screen.pbRefreshSingle(pkmnid);
          break;
        }
        case 1: // Erase name
          pkmn.name = null;
          screen.pbRefreshSingle(pkmnid);
          break;
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "ownership", pokemonDebugOption({
  name: "Ownership...",
  parent: "cosmetic",
  effect: async (pkmn, _pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const gender = [_INTL("Male"), _INTL("Female"), _INTL("Unknown")][pkmn.owner.gender];
      const msg = [_INTL("Player's Pokémon\n{1}\n{2}\n{3} ({4})",
        pkmn.owner.name, gender, pkmn.owner.publicId(), pkmn.owner.id),
      _INTL("Foreign Pokémon\n{1}\n{2}\n{3} ({4})",
        pkmn.owner.name, gender, pkmn.owner.publicId(), pkmn.owner.id)][pkmn.foreign(player()) ? 1 : 0]!;
      cmd = await screen.pbShowCommands(msg,
        [_INTL("Make player's"),
          _INTL("Set OT's name"),
          _INTL("Set OT's gender"),
          _INTL("Random foreign ID"),
          _INTL("Set foreign ID")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Make player's
          pkmn.owner = Pokemon.Owner.newFromTrainer(player());
          break;
        case 1: // Set OT's name
          pkmn.owner.name = await pbEnterPlayerName(_INTL("{1}'s OT's name?", pkmn.name), 1, Settings.MAX_PLAYER_NAME_SIZE);
          break;
        case 2: { // Set OT's gender
          const cmd2 = await screen.pbShowCommands(_INTL("Set OT's gender."),
            [_INTL("Male"), _INTL("Female"), _INTL("Unknown")], pkmn.owner.gender);
          if (cmd2 >= 0) pkmn.owner.gender = cmd2;
          break;
        }
        case 3: // Random foreign ID
          pkmn.owner.id = player().makeForeignID();
          break;
        case 4: { // Set foreign ID
          const params = new ChooseNumberParams();
          params.setRange(0, 65_535);
          params.setDefaultValue(pkmn.owner.publicId());
          const val = await pbMessageChooseNumber(
            _INTL("Set the new ID (max. 65535)."), params, () => screen.pbUpdate());
          pkmn.owner.id = (val | (val << 16)) >>> 0;
          break;
        }
      }
    }
    return false;
  },
}));

//===============================================================================
// Can store/release/trade
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "set_discardable", pokemonDebugOption({
  name: "Set discardable",
  parent: "main",
  effect: async (pkmn, _pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const msg = _INTL("Click option to toggle.");
      const cmds: string[] = [];
      cmds.push(pkmn.cannotStore ? _INTL("Cannot store") : _INTL("Can store"));
      cmds.push(pkmn.cannotRelease ? _INTL("Cannot release") : _INTL("Can release"));
      cmds.push(pkmn.cannotTrade ? _INTL("Cannot trade") : _INTL("Can trade"));
      cmd = await screen.pbShowCommands(msg, cmds, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Toggle storing
          pkmn.cannotStore = !pkmn.cannotStore;
          break;
        case 1: // Toggle releasing
          pkmn.cannotRelease = !pkmn.cannotRelease;
          break;
        case 2: // Toggle trading
          pkmn.cannotTrade = !pkmn.cannotTrade;
          break;
      }
    }
    return false;
  },
}));

//===============================================================================
// Other options
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "set_egg", pokemonDebugOption({
  name: "Set egg",
  parent: "main",
  always_show: false,
  effect: async (pkmn, pkmnid, _heldpoke, settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const msg = [_INTL("Not an egg"),
        _INTL("Egg (hatches in {1} steps).", pkmn.stepsToHatch)][pkmn.egg() ? 1 : 0]!;
      cmd = await screen.pbShowCommands(msg,
        [_INTL("Make egg"),
          _INTL("Make Pokémon"),
          _INTL("Set steps left to 1")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Make egg
          if (!pkmn.egg() && (pbHasEgg(pkmn.species) ||
            (await screen.pbConfirm(_INTL("{1} cannot legally be an egg. Make egg anyway?", pkmn.speciesName()))))) {
            pkmn.level = Settings.EGG_LEVEL;
            pkmn.calcStats();
            pkmn.name = _INTL("Egg");
            pkmn.stepsToHatch = pkmn.speciesData().hatchSteps;
            pkmn.hatchedMap = 0;
            pkmn.obtainMethod = 1;
            screen.pbRefreshSingle(pkmnid);
          }
          break;
        case 1: // Make Pokémon
          if (pkmn.egg()) {
            pkmn.name = null;
            pkmn.stepsToHatch = 0;
            pkmn.hatchedMap = 0;
            pkmn.obtainMethod = 0;
            if (!settingUpBattle) player().pokedex.register(pkmn);
            screen.pbRefreshSingle(pkmnid);
          }
          break;
        case 2: // Set steps left to 1
          if (pkmn.egg()) pkmn.stepsToHatch = 1;
          break;
      }
    }
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "shadow_pkmn", pokemonDebugOption({
  name: "Shadow Pkmn...",
  parent: "main",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const msg = [_INTL("Not a Shadow Pokémon."),
        _INTL("Heart gauge is {1} (stage {2}).", pkmn.heartGauge, pkmn.heartStage())][pkmn.shadowPokemon() ? 1 : 0]!;
      cmd = await screen.pbShowCommands(msg, [_INTL("Make Shadow"), _INTL("Set heart gauge")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Make Shadow
          if (pkmn.shadowPokemon()) {
            await screen.pbDisplay(_INTL("{1} is already a Shadow Pokémon.", pkmn.name));
          } else {
            pkmn.makeShadow();
            screen.pbRefreshSingle(pkmnid);
          }
          break;
        case 1: // Set heart gauge
          if (pkmn.shadowPokemon()) {
            const oldheart = pkmn.heartGauge;
            const params = new ChooseNumberParams();
            params.setRange(0, pkmn.maxGaugeSize());
            params.setDefaultValue(pkmn.heartGauge);
            const val = await pbMessageChooseNumber(
              _INTL("Set the heart gauge (max. {1}).", pkmn.maxGaugeSize()),
              params, () => screen.pbUpdate());
            if (val !== oldheart) {
              pkmn.adjustHeart(val - oldheart);
              await pkmn.checkReadyToPurify();
            }
          } else {
            await screen.pbDisplay(_INTL("{1} is not a Shadow Pokémon.", pkmn.name));
          }
          break;
      }
    }
    return false;
  },
}));

/** pbCreateMysteryGift(type, item) (016_UI/023_UI_MysteryGift.rb:100), once its port registers it. */
type CreateMysteryGift = (type: number, item: Pokemon | Id) => Promise<void>;

MenuHandlers.add("pokemon_debug_menu", "mystery_gift", pokemonDebugOption({
  name: "Mystery Gift",
  parent: "main",
  always_show: false,
  effect: async (pkmn) => {
    // Not ported: pbCreateMysteryGift (016_UI/023_UI_MysteryGift.rb:100) —
    // the Mystery Gift port sets EditorScreens.pbCreateMysteryGift.
    const createMysteryGift = (EditorScreens as { pbCreateMysteryGift?: CreateMysteryGift }).pbCreateMysteryGift;
    if (createMysteryGift) await createMysteryGift(0, pkmn);
    else await pbMessage(_INTL("{1} isn't ported to the browser yet.", "pbCreateMysteryGift"));
    return false;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "duplicate", pokemonDebugOption({
  name: "Duplicate",
  parent: "main",
  always_show: false,
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    if (!(await screen.pbConfirm(_INTL("Are you sure you want to copy this Pokémon?")))) return false;
    const clonedpkmn = pkmn.clone();
    if (screen instanceof PokemonPartyScreen) {
      await pbStorePokemon(clonedpkmn);
      screen.pbHardRefresh();
      await screen.pbDisplay(_INTL("The Pokémon was duplicated."));
    } else if (screen instanceof PokemonStorageScreen) {
      if (screen.storage.pbMoveCaughtToParty(clonedpkmn)) {
        if ((pkmnid as Selection)[0] !== -1) {
          await screen.pbDisplay(_INTL("The duplicated Pokémon was moved to your party."));
        }
      } else {
        const oldbox = screen.storage.currentBox;
        const newbox = screen.storage.pbStoreCaught(clonedpkmn);
        if (newbox < 0) {
          await screen.pbDisplay(_INTL("All boxes are full."));
        } else if (newbox !== oldbox) {
          await screen.pbDisplay(_INTL("The duplicated Pokémon was moved to box \"{1}.\"", screen.storage.boxes[newbox]!.name));
          screen.storage.currentBox = oldbox;
        }
      }
      screen.pbHardRefresh();
    }
    return true;
  },
}));

MenuHandlers.add("pokemon_debug_menu", "delete", pokemonDebugOption({
  name: "Delete",
  parent: "main",
  always_show: false,
  effect: async (_pkmn, pkmnid, heldpoke, _settingUpBattle, screen) => {
    if (!(await screen.pbConfirm(_INTL("Are you sure you want to delete this Pokémon?")))) return false;
    if (screen instanceof PokemonPartyScreen) {
      screen.party.splice(pkmnid as number, 1);
      screen.pbHardRefresh();
    } else if (screen instanceof PokemonStorageScreen) {
      const selected = pkmnid as Selection;
      await screen.scene.pbRelease(selected, heldpoke);
      if (heldpoke) screen.heldpkmn = null;
      else screen.storage.pbDelete(selected[0], selected[1]);
      screen.scene.pbRefresh();
    }
    return true;
  },
}));

//===============================================================================
// Essentials Deluxe ([000] Essentials Patches/Debug.rb:51-102)
//===============================================================================
MenuHandlers.add("pokemon_debug_menu", "dx_pokemon_menu", {
  name: "Deluxe Options...",
  parent: "main",
});

MenuHandlers.add("pokemon_debug_menu", "set_ace", pokemonDebugOption({
  name: "Toggle Ace",
  parent: "dx_pokemon_menu",
  effect: async (pkmn, _pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let toggle: string;
    if (pkmn.ace) {
      pkmn.ace = false;
      toggle = "unflagged";
    } else {
      pkmn.ace = true;
      toggle = "flagged";
    }
    await screen.pbDisplay(_INTL("{1} is {2} as an ace Pokémon.", pkmn.name, toggle));
    return false;
  },
}));

/** Debug.rb:87-97: the size class a scale (0-255) is called. */
function scaleSizeName(scale: number): string | undefined {
  if (scale === 255) return "XXXL";
  if (scale >= 242 && scale <= 254) return "XXL";
  if (scale >= 196 && scale <= 241) return "XL";
  if (scale >= 161 && scale <= 195) return "Large";
  if (scale >= 100 && scale <= 160) return "Medium";
  if (scale >= 61 && scale <= 99) return "Small";
  if (scale >= 31 && scale <= 60) return "XS";
  if (scale >= 1 && scale <= 30) return "XXS";
  if (scale === 0) return "XXXS";
  return undefined;
}

MenuHandlers.add("pokemon_debug_menu", "set_scale", pokemonDebugOption({
  name: "Set Size",
  parent: "dx_pokemon_menu",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    const params = new ChooseNumberParams();
    params.setRange(0, 255);
    params.setDefaultValue(pkmn.scale);
    const newval = await pbMessageChooseNumber(
      _INTL("Scale the Pokémon's size (max. 255)."), params, () => screen.pbUpdate());
    if (newval !== pkmn.scale) {
      pkmn.scale = newval;
      screen.pbRefreshSingle(pkmnid);
      const size = scaleSizeName(pkmn.scale);
      await screen.pbDisplay(_INTL("{1} is now considered {2} in size.", pkmn.name, size));
    }
    return false;
  },
}));
