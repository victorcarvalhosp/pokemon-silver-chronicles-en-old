// Port of 020_Debug/003_Debug menus/005_Debug_BattlePkmnCommands.rb: the
// options of the battle Debug menu's Pokémon editor (HP/status, stats/level,
// types, moves, item, ability, nature, gender, form, species, shininess, Shadow
// Pokémon, effects), registered with MenuHandlers under
// :battle_pokemon_debug_menu ("usage": shown for a party Pokémon, a battler or
// both). With the Generation 9 Pack's :set_status override folded in
// ([000] General/[002] Debug.rb:67: also sets a Drowsy count).

import type { Battle } from "../battle/battle/Battle";
import type { Battler } from "../battle/battler/Battler";
import { Move } from "../battle/move/Move";
import { pbHiddenPower } from "../battle/move/MoveEffects_MoveAttributes";
import { PBEffects } from "../battle/other/PBEffects";
import { rand } from "../core/random";
import { GameData } from "../data/gameData";
import { G } from "../game/globals";
import { MultipleForms } from "../game/pokemon/formHandlers";
import { Mail } from "../game/pokemon/Mail";
import { Pokemon } from "../game/pokemon/Pokemon";
import { MenuHandlers } from "../ui/menus/menuHandlers";
import { _INTL } from "../ui/messageConfig";
import { ChooseNumberParams, pbConfirmMessage, pbMessage, pbMessageChooseNumber } from "../ui/messages";
import { BattleDebugSetEffects } from "./DebugBattleExtraCode";
import { pbChooseAbilityList, pbChooseItemList, pbChooseMoveList, pbChooseSpeciesList, pbChooseTypeList } from "./EditorUtilities";

//===============================================================================
// HP/Status options
//===============================================================================
MenuHandlers.add("battle_pokemon_debug_menu", "hp_status_menu", {
  name: "HP/Status...",
  parent: "main",
  usage: "both",
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_hp", {
  name: "Set HP",
  parent: "hp_status_menu",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    if (pkmn.egg()) {
      await pbMessage("\\ts[]" + _INTL("{1} is an egg.", pkmn.name));
      return;
    } else if (battler && pkmn.totalhp === 1) {
      await pbMessage("\\ts[]" + _INTL("Can't change HP, {1}'s maximum HP is 1 and it's in battle.", pkmn.name));
      return;
    }
    const minHp = battler ? 1 : 0;
    const params = new ChooseNumberParams();
    params.setRange(minHp, pkmn.totalhp);
    params.setDefaultValue(pkmn.hp);
    const newHp = await pbMessageChooseNumber(
      "\\ts[]" + _INTL("Set {1}'s HP ({2}-{3}).", battler ? battler.pbThis(true) : pkmn.name, minHp, pkmn.totalhp),
      params,
    );
    if (newHp === pkmn.hp) return;
    (battler ?? pkmn).hp = newHp;
  },
});

// Generation 9 Pack's version ([000] General/[002] Debug.rb:67): allows you to
// set the status count for a Pokemon's Drowsy status in battle.
MenuHandlers.add("battle_pokemon_debug_menu", "set_status", {
  name: "Set status",
  parent: "hp_status_menu",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    if (pkmn.egg()) {
      await pbMessage("\\ts[]" + _INTL("{1} is an egg.", pkmn.name));
      return;
    } else if (pkmn.hp <= 0) {
      await pbMessage("\\ts[]" + _INTL("{1} is fainted, can't change status.", pkmn.name));
      return;
    }
    let cmd = 0;
    const commands = [_INTL("[Cure]")];
    const ids = ["NONE"];
    for (const s of GameData.Status.each()) {
      if (s.id === "NONE") continue;
      commands.push(_INTL("Set {1}", s.name));
      ids.push(s.id);
    }
    for (;;) {
      let msg = _INTL("Current status: {1}", GameData.Status.get(pkmn.status).name);
      if (pkmn.status === "SLEEP") {
        msg += " " + _INTL("(turns: {1})", pkmn.statusCount);
      } else if (pkmn.status === "POISON" && pkmn.statusCount > 0) {
        if (battler) {
          msg += " " + _INTL("(toxic, count: {1})", battler.effects[PBEffects.Toxic]);
        } else {
          msg += " " + _INTL("(toxic)");
        }
      }
      cmd = await pbMessage("\\ts[]" + msg, commands, -1, null, cmd);
      if (cmd < 0) break;
      if (cmd === 0) { // Cure
        if (battler) {
          battler.status = "NONE";
        } else {
          pkmn.healStatus();
        }
      } else { // Give status problem
        const pkmnName = battler ? battler.pbThis(true) : pkmn.name;
        switch (ids[cmd]) {
          case "SLEEP":
          case "DROWSY": {
            // NOTE (Ruby parity): the default is the current count only for
            // Sleep ([002] Debug.rb:113), and a battler's Drowsy count is then
            // reset to 0 by Battler#status= (001_Battle_Battler.rb:113), which
            // only keeps the count of Sleep and Poison.
            const params = new ChooseNumberParams();
            params.setRange(0, 99);
            params.setDefaultValue(pkmn.status === "SLEEP" ? pkmn.statusCount : 3);
            params.setCancelValue(-1);
            const status = ids[cmd] === "SLEEP" ? "sleep" : "drowsy";
            const count = await pbMessageChooseNumber("\\ts[]" + _INTL(`Set {1}'s ${status} count (0-99).`, pkmnName), params);
            if (count < 0) continue;
            (battler ?? pkmn).statusCount = count;
            break;
          }
          case "POISON":
            if (await pbConfirmMessage("\\ts[]" + _INTL("Make {1} badly poisoned (toxic)?", pkmnName))) {
              if (battler) {
                const params = new ChooseNumberParams();
                params.setRange(0, 16);
                params.setDefaultValue(battler.effects[PBEffects.Toxic]);
                params.setCancelValue(-1);
                const count = await pbMessageChooseNumber(
                  "\\ts[]" + _INTL("Set {1}'s toxic count (0-16).", pkmnName), params,
                );
                if (count < 0) continue;
                battler.statusCount = 1;
                battler.effects[PBEffects.Toxic] = count;
              } else {
                pkmn.statusCount = 1;
              }
            } else {
              (battler ?? pkmn).statusCount = 0;
            }
            break;
        }
        (battler ?? pkmn).status = ids[cmd]!;
      }
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "full_heal", {
  name: "Heal HP and status",
  parent: "hp_status_menu",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    if (pkmn.egg()) {
      await pbMessage("\\ts[]" + _INTL("{1} is an egg.", pkmn.name));
      return;
    }
    if (battler) {
      battler.hp = battler.totalhp;
      battler.status = "NONE";
    } else {
      pkmn.healHP();
      pkmn.healStatus();
    }
  },
});

//===============================================================================
// Level/stats options
//===============================================================================
MenuHandlers.add("battle_pokemon_debug_menu", "level_stats", {
  name: "Stats/level...",
  parent: "main",
  usage: "both",
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_stat_stages", {
  name: "Set stat stages",
  parent: "level_stats",
  usage: "battler",
  effect: async (pkmn: Pokemon, battler: Battler, _battle: Battle) => {
    if (pkmn.egg()) {
      await pbMessage("\\ts[]" + _INTL("{1} is an egg.", pkmn.name));
      return;
    }
    let cmd = 0;
    for (;;) {
      const commands: string[] = [];
      const statIds: string[] = [];
      for (const stat of GameData.Stat.eachBattle()) {
        let commandName = stat.name + ": ";
        if (battler.stages[stat.id]! > 0) commandName += "+";
        commandName += String(battler.stages[stat.id]);
        commands.push(commandName);
        statIds.push(stat.id);
      }
      commands.push(_INTL("[Reset all]"));
      cmd = await pbMessage("\\ts[]" + _INTL("Choose a stat stage to change."), commands, -1, null, cmd);
      if (cmd < 0) break;
      if (cmd < statIds.length) { // Set a stat
        const params = new ChooseNumberParams();
        params.setRange(-6, 6);
        params.setNegativesAllowed(true);
        params.setDefaultValue(battler.stages[statIds[cmd]!]!);
        const value = await pbMessageChooseNumber(
          "\\ts[]" + _INTL("Set the stage for {1}.", GameData.Stat.get(statIds[cmd]!).name), params,
        );
        battler.stages[statIds[cmd]!] = value;
      } else { // Reset all stats
        for (const stat of GameData.Stat.eachBattle()) battler.stages[stat.id] = 0;
      }
    }
  },
});

/** The battler's value of a main battle stat (1 for any other stat). */
function battlerStatValue(battler: Battler, statId: string): number {
  switch (statId) {
    case "ATTACK": return battler.attack;
    case "DEFENSE": return battler.defense;
    case "SPECIAL_ATTACK": return battler.spatk;
    case "SPECIAL_DEFENSE": return battler.spdef;
    case "SPEED": return battler.speed;
    default: return 1;
  }
}

MenuHandlers.add("battle_pokemon_debug_menu", "set_stat_values", {
  name: "Set stat values",
  parent: "level_stats",
  usage: "battler",
  effect: async (pkmn: Pokemon, battler: Battler, _battle: Battle) => {
    if (pkmn.egg()) {
      await pbMessage("\\ts[]" + _INTL("{1} is an egg.", pkmn.name));
      return;
    }
    const statIds: string[] = [];
    const statVals: number[] = [];
    for (const stat of GameData.Stat.eachMainBattle()) {
      statIds.push(stat.id);
      statVals.push(battlerStatValue(battler, stat.id));
    }
    let cmd = 0;
    for (;;) {
      const commands: string[] = [];
      for (const stat of GameData.Stat.eachMainBattle()) {
        const commandName = stat.name + ": " + String(statVals[statIds.indexOf(stat.id)]);
        commands.push(commandName);
      }
      commands.push(_INTL("[Reset all]"));
      cmd = await pbMessage("\\ts[]" + _INTL("Choose a stat value to change."), commands, -1, null, cmd);
      if (cmd < 0) break;
      if (cmd < statIds.length) { // Set a stat
        const params = new ChooseNumberParams();
        params.setRange(1, 9999);
        params.setDefaultValue(statVals[cmd]!);
        const value = await pbMessageChooseNumber(
          "\\ts[]" + _INTL("Set the value for {1}.", GameData.Stat.get(statIds[cmd]!).name), params,
        );
        switch (statIds[cmd]) {
          case "ATTACK": battler.attack = value; break;
          case "DEFENSE": battler.defense = value; break;
          case "SPECIAL_ATTACK": battler.spatk = value; break;
          case "SPECIAL_DEFENSE": battler.spdef = value; break;
          case "SPEED": battler.speed = value; break;
        }
        statVals[cmd] = value;
      } else { // Reset all stat values
        battler.pbUpdate();
        for (const stat of GameData.Stat.eachMainBattle()) {
          statVals[statIds.indexOf(stat.id)] = battlerStatValue(battler, stat.id);
        }
      }
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_level", {
  name: "Set level",
  parent: "level_stats",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    if (pkmn.egg()) {
      await pbMessage("\\ts[]" + _INTL("{1} is an egg.", pkmn.name));
      return;
    }
    const params = new ChooseNumberParams();
    params.setRange(1, GameData.GrowthRate.maxLevel());
    params.setDefaultValue(pkmn.level);
    const level = await pbMessageChooseNumber(
      "\\ts[]" + _INTL("Set the Pokémon's level (max. {1}).", params.maxNumber), params,
    );
    if (level !== pkmn.level) {
      pkmn.level = level;
      pkmn.calcStats();
      battler?.pbUpdate();
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_exp", {
  name: "Set Exp",
  parent: "level_stats",
  usage: "both",
  effect: async (pkmn: Pokemon, _battler: Battler | null, _battle: Battle) => {
    if (pkmn.egg()) {
      await pbMessage("\\ts[]" + _INTL("{1} is an egg.", pkmn.name));
      return;
    }
    const minExp = pkmn.growthRate().minimumExpForLevel(pkmn.level);
    const maxExp = pkmn.growthRate().minimumExpForLevel(pkmn.level + 1);
    if (minExp === maxExp) {
      await pbMessage("\\ts[]" + _INTL("{1} is at the maximum level.", pkmn.name));
      return;
    }
    const params = new ChooseNumberParams();
    params.setRange(minExp, maxExp - 1);
    params.setDefaultValue(pkmn.exp);
    const newExp = await pbMessageChooseNumber(
      "\\ts[]" + _INTL("Set the Pokémon's Exp (range {1}-{2}).", minExp, maxExp - 1), params,
    );
    if (newExp !== pkmn.exp) pkmn.exp = newExp;
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "hidden_values", {
  name: "EV/IV...",
  parent: "level_stats",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    let cmd = 0;
    for (;;) {
      // (Ruby computes persid = sprintf("0x%08X", pkmn.personalID) here and never uses it.)
      cmd = await pbMessage("\\ts[]" + _INTL("Choose hidden values to edit."),
        [_INTL("Set EVs"), _INTL("Set IVs")], -1, null, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Set EVs
          let cmd2 = 0;
          for (;;) {
            let totalEvs = 0;
            const evCommands: string[] = [];
            const evId: string[] = [];
            for (const s of GameData.Stat.eachMain()) {
              evCommands.push(s.name + ` (${pkmn.ev[s.id]})`);
              evId.push(s.id);
              totalEvs += pkmn.ev[s.id]!;
            }
            evCommands.push(_INTL("Randomise all"));
            evCommands.push(_INTL("Max randomise all"));
            cmd2 = await pbMessage("\\ts[]" + _INTL("Change which EV?\nTotal: {1}/{2} ({3}%)",
              totalEvs, Pokemon.EV_LIMIT, Math.trunc((100 * totalEvs) / Pokemon.EV_LIMIT)),
            evCommands, -1, null, cmd2);
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
              const f = await pbMessageChooseNumber("\\ts[]" + _INTL("Set the EV for {1} (max. {2}).",
                GameData.Stat.get(evId[cmd2]!).name, upperLimit), params);
              if (f !== pkmn.ev[evId[cmd2]!]) {
                pkmn.ev[evId[cmd2]!] = f;
                pkmn.calcStats();
                battler?.pbUpdate();
              }
            } else { // (Max) Randomise all
              let evTotalTarget = Pokemon.EV_LIMIT;
              if (cmd2 === evCommands.length - 2) { // Randomize all (not max)
                evTotalTarget = rand(Pokemon.EV_LIMIT);
              }
              for (const s of GameData.Stat.eachMain()) pkmn.ev[s.id] = 0;
              while (evTotalTarget > 0) {
                const r = rand(evId.length);
                if (pkmn.ev[evId[r]!]! >= Pokemon.EV_STAT_LIMIT) continue;
                let addVal = 1 + rand(Math.trunc(Pokemon.EV_STAT_LIMIT / 4));
                addVal = clamp(addVal, 0, evTotalTarget);
                addVal = clamp(addVal, 0, Pokemon.EV_STAT_LIMIT - pkmn.ev[evId[r]!]!);
                if (addVal === 0) continue;
                pkmn.ev[evId[r]!] = pkmn.ev[evId[r]!]! + addVal;
                evTotalTarget -= addVal;
              }
              pkmn.calcStats();
              battler?.pbUpdate();
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
            const ivId: string[] = [];
            for (const s of GameData.Stat.eachMain()) {
              ivcommands.push(s.name + ` (${pkmn.iv[s.id]})`);
              ivId.push(s.id);
              totaliv += pkmn.iv[s.id]!;
            }
            const msg = _INTL("Change which IV?\nHidden Power: {1}, power {2}\nTotal: {3}/{4} ({5}%)",
              GameData.Type.get(hiddenpower[0]!).name, hiddenpower[1], totaliv,
              ivId.length * Pokemon.IV_STAT_LIMIT, Math.trunc((100 * totaliv) / (ivId.length * Pokemon.IV_STAT_LIMIT)));
            ivcommands.push(_INTL("Randomise all"));
            cmd2 = await pbMessage("\\ts[]\\l[3]" + msg, ivcommands, -1, null, cmd2);
            if (cmd2 < 0) break;
            if (cmd2 < ivId.length) {
              const params = new ChooseNumberParams();
              params.setRange(0, Pokemon.IV_STAT_LIMIT);
              params.setDefaultValue(pkmn.iv[ivId[cmd2]!]!);
              params.setCancelValue(pkmn.iv[ivId[cmd2]!]!);
              const f = await pbMessageChooseNumber("\\ts[]" + _INTL("Set the IV for {1} (max. 31).",
                GameData.Stat.get(ivId[cmd2]!).name), params);
              if (f !== pkmn.iv[ivId[cmd2]!]) {
                pkmn.iv[ivId[cmd2]!] = f;
                pkmn.calcStats();
                battler?.pbUpdate();
              }
            } else { // Randomise all
              for (const s of GameData.Stat.eachMain()) pkmn.iv[s.id] = rand(Pokemon.IV_STAT_LIMIT + 1);
              pkmn.calcStats();
              battler?.pbUpdate();
            }
          }
          break;
        }
      }
    }
  },
});

function clamp(v: number, mn: number, mx: number): number {
  return v < mn ? mn : v > mx ? mx : v;
}

MenuHandlers.add("battle_pokemon_debug_menu", "set_happiness", {
  name: "Set happiness",
  parent: "level_stats",
  usage: "both",
  effect: async (pkmn: Pokemon, _battler: Battler | null, _battle: Battle) => {
    const params = new ChooseNumberParams();
    params.setRange(0, 255);
    params.setDefaultValue(pkmn.happiness);
    const h = await pbMessageChooseNumber("\\ts[]" + _INTL("Set the Pokémon's happiness (max. 255)."), params);
    if (h !== pkmn.happiness) pkmn.happiness = h;
  },
});

//===============================================================================
// Types
//===============================================================================
MenuHandlers.add("battle_pokemon_debug_menu", "set_types", {
  name: "Set types",
  parent: "main",
  usage: "battler",
  effect: async (_pkmn: Pokemon, battler: Battler, _battle: Battle) => {
    const maxMainTypes = 2; // The most types a Pokémon can have normally
    let cmd = 0;
    for (;;) {
      const commands: string[] = [];
      const types: (string | null)[] = [];
      for (let i = 0; i < maxMainTypes; i++) {
        const type = battler.types[i] ?? null;
        const typeName = type ? GameData.Type.get(type).name : "-";
        commands.push(_INTL("Type {1}: {2}", i + 1, typeName));
        types.push(type);
      }
      const extraType = battler.effects[PBEffects.Type3] ?? null;
      const extraTypeName = extraType ? GameData.Type.get(extraType).name : "-";
      commands.push(_INTL("Extra type: {1}", extraTypeName));
      types.push(extraType);
      let msg = _INTL("Effective types: {1}", battler.pbTypes(true).map((t) => GameData.Type.get(t).name).join("/"));
      msg += "\r\n" + _INTL("(Change a type to itself to remove it.)");
      cmd = await pbMessage("\\ts[]" + msg, commands, -1, null, cmd);
      if (cmd < 0) break;
      const oldType = types[cmd]!;
      const newType = await pbChooseTypeList(oldType);
      if (newType) {
        if (newType === oldType) {
          if (await pbConfirmMessage(_INTL("Remove this type?"))) {
            if (cmd < maxMainTypes) {
              (battler.types as (string | null)[])[cmd] = null;
            } else {
              battler.effects[PBEffects.Type3] = null;
            }
            battler.types = battler.types.filter((t) => t != null); // compact!
          }
        } else if (cmd < maxMainTypes) {
          battler.types[cmd] = newType;
        } else {
          battler.effects[PBEffects.Type3] = newType;
        }
      }
    }
  },
});

//===============================================================================
// Moves options
//===============================================================================
MenuHandlers.add("battle_pokemon_debug_menu", "moves", {
  name: "Moves...",
  parent: "main",
  usage: "both",
});

MenuHandlers.add("battle_pokemon_debug_menu", "teach_move", {
  name: "Teach move",
  parent: "moves",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, battle: Battle) => {
    if (pkmn.numMoves() >= Pokemon.MAX_MOVES) {
      await pbMessage("\\ts[]" + _INTL("{1} already knows {2} moves. It needs to forget one first.",
        pkmn.name, pkmn.numMoves()));
      return;
    }
    const newMove = await pbChooseMoveList();
    if (!newMove) return;
    const moveName = GameData.Move.get(newMove).name;
    if (pkmn.hasMove(newMove)) {
      await pbMessage("\\ts[]" + _INTL("{1} already knows {2}.", pkmn.name, moveName));
      return;
    }
    pkmn.learnMove(newMove);
    battler?.moves?.push(Move.fromPokemonMove(battle, pkmn.moves[pkmn.moves.length - 1]!));
    await pbMessage("\\ts[]" + _INTL("{1} learned {2}!", pkmn.name, moveName));
  },
});

/** "Move (PP: x/y)" for each of the Pokémon's moves, with their indices. */
function moveNamesWithPP(pkmn: Pokemon): [string[], number[]] {
  const moveNames: string[] = [];
  const moveIndices: number[] = [];
  pkmn.moves.forEach((move, index) => {
    if (!move || !move.id) return;
    if (move.totalPp <= 0) {
      moveNames.push(_INTL("{1} (PP: ---)", move.name));
    } else {
      moveNames.push(_INTL("{1} (PP: {2}/{3})", move.name, move.pp, move.totalPp));
    }
    moveIndices.push(index);
  });
  return [moveNames, moveIndices];
}

MenuHandlers.add("battle_pokemon_debug_menu", "forget_move", {
  name: "Forget move",
  parent: "moves",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    const [moveNames, moveIndices] = moveNamesWithPP(pkmn);
    const cmd = await pbMessage("\\ts[]" + _INTL("Forget which move?"), moveNames, -1);
    if (cmd < 0) return;
    const oldMoveName = pkmn.moves[moveIndices[cmd]!]!.name;
    pkmn.forgetMoveAtIndex(moveIndices[cmd]!);
    battler?.moves?.splice(moveIndices[cmd]!, 1);
    await pbMessage("\\ts[]" + _INTL("{1} forgot {2}.", pkmn.name, oldMoveName));
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_move_pp", {
  name: "Set move PP",
  parent: "moves",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    let cmd = 0;
    for (;;) {
      const [moveNames, moveIndices] = moveNamesWithPP(pkmn);
      const commands = [...moveNames, _INTL("Restore all PP")];
      cmd = await pbMessage("\\ts[]" + _INTL("Alter PP of which move?"), commands, -1, null, cmd);
      if (cmd < 0) break;
      if (cmd >= 0 && cmd < moveNames.length) { // Move
        const move = pkmn.moves[moveIndices[cmd]!]!;
        const moveName = move.name;
        if (move.totalPp <= 0) {
          await pbMessage("\\ts[]" + _INTL("{1} has infinite PP.", moveName));
        } else {
          const syncBattler = (): void => {
            if (battler && battler.moves[moveIndices[cmd]!]?.id === move.id) {
              battler.moves[moveIndices[cmd]!]!.pp = move.pp;
            }
          };
          let cmd2 = 0;
          for (;;) {
            const msg = _INTL("{1}: PP {2}/{3} (PP Up {4}/3)", moveName, move.pp, move.totalPp, move.ppup);
            cmd2 = await pbMessage("\\ts[]" + msg,
              [_INTL("Set PP"), _INTL("Full PP"), _INTL("Set PP Up")], -1, null, cmd2);
            if (cmd2 < 0) break;
            switch (cmd2) {
              case 0: { // Change PP
                const params = new ChooseNumberParams();
                params.setRange(0, move.totalPp);
                params.setDefaultValue(move.pp);
                const h = await pbMessageChooseNumber(
                  "\\ts[]" + _INTL("Set PP of {1} (max. {2}).", moveName, move.totalPp), params,
                );
                move.pp = h;
                syncBattler();
                break;
              }
              case 1: // Full PP
                move.pp = move.totalPp;
                syncBattler();
                break;
              case 2: { // Change PP Up
                const params = new ChooseNumberParams();
                params.setRange(0, 3);
                params.setDefaultValue(move.ppup);
                const h = await pbMessageChooseNumber(
                  "\\ts[]" + _INTL("Set PP Up of {1} (max. 3).", moveName), params,
                );
                move.ppup = h;
                if (move.pp > move.totalPp) move.pp = move.totalPp;
                syncBattler();
                break;
              }
            }
          }
        }
      } else if (cmd === commands.length - 1) { // Restore all PP
        pkmn.healPP();
        if (battler) {
          for (const m of battler.moves) m.pp = m.totalPp();
        }
      }
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "reset_moves", {
  name: "Reset moves",
  parent: "moves",
  usage: "pokemon",
  effect: async (pkmn: Pokemon, _battler: Battler | null, _battle: Battle) => {
    if (!(await pbConfirmMessage(_INTL("Replace Pokémon's moves with ones it would know if it was wild?")))) return;
    pkmn.resetMoves();
    await pbMessage("\\ts[]" + _INTL("{1}'s moves were reset.", pkmn.name));
  },
});

//===============================================================================
// Other options
//===============================================================================
MenuHandlers.add("battle_pokemon_debug_menu", "set_item", {
  name: "Set item",
  parent: "main",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    let cmd = 0;
    const commands = [
      _INTL("Change item"),
      _INTL("Remove item"),
    ];
    for (;;) {
      const msg = pkmn.hasItem() ? _INTL("Item is {1}.", pkmn.item!.name) : _INTL("No item.");
      cmd = await pbMessage("\\ts[]" + msg, commands, -1, null, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Change item
          const item = await pbChooseItemList(pkmn.itemId);
          if (item && item !== pkmn.itemId) {
            (battler ?? pkmn).item = item;
            if (GameData.Item.get(item).isMail()) {
              pkmn.mail = new Mail(item, _INTL("Text"), G.player!.name);
            }
          }
          break;
        }
        case 1: // Remove item
          if (pkmn.hasItem()) {
            (battler ?? pkmn).item = null;
            pkmn.mail = null;
          }
          break;
        default:
          return;
      }
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_ability", {
  name: "Set ability",
  parent: "main",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    let cmd = 0;
    const commands: string[] = [];
    commands.push(_INTL("Set ability for Pokémon"));
    if (battler) commands.push(_INTL("Set ability for battler"));
    commands.push(_INTL("Reset"));
    for (;;) {
      let msg: string;
      if (battler) {
        msg = _INTL("Battler's ability is {1}. Pokémon's ability is {2}.",
          battler.abilityName(), pkmn.ability!.name);
      } else {
        msg = _INTL("Pokémon's ability is {1}.", pkmn.ability!.name);
      }
      cmd = await pbMessage("\\ts[]" + msg, commands, -1, null, cmd);
      if (cmd < 0) break;
      if (cmd >= 1 && !battler) cmd = 2; // Correct command for Pokémon (no battler)
      switch (cmd) {
        case 0: { // Set ability for Pokémon
          const newAbility = await pbChooseAbilityList(pkmn.abilityId);
          if (newAbility && newAbility !== pkmn.abilityId) {
            pkmn.ability = newAbility;
            if (battler) battler.ability = pkmn.ability;
          }
          break;
        }
        case 1: // Set ability for battler
          if (battler) {
            const newAbility = await pbChooseAbilityList(battler.abilityId);
            if (newAbility && newAbility !== battler.abilityId) battler.ability = newAbility;
          } else {
            await pbMessage(_INTL("This Pokémon isn't in battle."));
          }
          break;
        case 2: // Reset
          pkmn.abilityIndex = null;
          pkmn.ability = null;
          if (battler) battler.ability = pkmn.ability;
          break;
      }
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_nature", {
  name: "Set nature",
  parent: "main",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    const commands: string[] = [];
    const ids: string[] = [];
    for (const nature of GameData.Nature.each()) {
      if (nature.statChanges.length === 0) {
        commands.push(_INTL("{1} (---)", nature.realName));
      } else {
        let plusText = "";
        let minusText = "";
        for (const change of nature.statChanges) {
          if (change[1] > 0) {
            if (plusText) plusText += "/";
            plusText += GameData.Stat.get(change[0]).nameBrief;
          } else if (change[1] < 0) {
            if (minusText) minusText += "/";
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
      cmd = await pbMessage("\\ts[]" + msg, commands, -1, null, cmd);
      if (cmd < 0) break;
      if (cmd >= 0 && cmd < commands.length - 1) { // Set nature
        pkmn.nature = ids[cmd]!;
      } else if (cmd === commands.length - 1) { // Reset
        pkmn.nature = null;
      }
      battler?.pbUpdate();
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_gender", {
  name: "Set gender",
  parent: "main",
  usage: "both",
  effect: async (pkmn: Pokemon, _battler: Battler | null, _battle: Battle) => {
    if (pkmn.singleGendered()) {
      await pbMessage("\\ts[]" + _INTL("{1} is single-gendered or genderless.", pkmn.speciesName()));
      return;
    }
    let cmd = 0;
    for (;;) {
      const msg = [_INTL("Gender is male."), _INTL("Gender is female.")][pkmn.male() ? 0 : 1]!;
      cmd = await pbMessage("\\ts[]" + msg,
        [_INTL("Make male"), _INTL("Make female"), _INTL("Reset")], -1, null, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Make male
          pkmn.makeMale();
          if (!pkmn.male()) await pbMessage("\\ts[]" + _INTL("{1}'s gender couldn't be changed.", pkmn.name));
          break;
        case 1: // Make female
          pkmn.makeFemale();
          if (!pkmn.female()) await pbMessage("\\ts[]" + _INTL("{1}'s gender couldn't be changed.", pkmn.name));
          break;
        case 2: // Reset
          pkmn.gender = null;
          break;
      }
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_form", {
  name: "Set form",
  parent: "main",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    let cmd = 0;
    const formcmds: [number[], string[]] = [[], []];
    for (const sp of GameData.Species.each()) {
      if (sp.species !== pkmn.species) continue;
      let formName = sp.formName;
      if (!formName) formName = _INTL("Unnamed form");
      formName = `${sp.form}: ${formName}`;
      formcmds[0].push(sp.form);
      formcmds[1].push(formName);
      if (pkmn.form === sp.form) cmd = formcmds[0].length - 1;
    }
    if (formcmds[0].length <= 1) {
      await pbMessage("\\ts[]" + _INTL("Species {1} only has one form.", pkmn.speciesName()));
      return;
    }
    for (;;) {
      cmd = await pbMessage("\\ts[]" + _INTL("Form is {1}.", pkmn.form), formcmds[1], -1, null, cmd);
      if (cmd < 0) break;
      const f = formcmds[0][cmd]!;
      if (f === pkmn.form) continue;
      pkmn.forcedForm = null;
      if (MultipleForms.hasFunction(pkmn, "getForm")) {
        if (!(await pbConfirmMessage(_INTL("This species decides its own form. Override?")))) continue;
        pkmn.forcedForm = f;
      }
      pkmn.formSimple = f;
      if (battler) battler.form = pkmn.form;
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_species", {
  name: "Set species",
  parent: "main",
  usage: "both",
  effect: async (pkmn: Pokemon, battler: Battler | null, _battle: Battle) => {
    const species = await pbChooseSpeciesList(pkmn.species);
    if (species && species !== pkmn.species) {
      pkmn.species = species;
      if (battler) battler.species = species;
      battler?.pbUpdate(true);
      if (battler) battler.name = pkmn.name;
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_shininess", {
  name: "Set shininess",
  parent: "main",
  usage: "both",
  effect: async (pkmn: Pokemon, _battler: Battler | null, _battle: Battle) => {
    let cmd = 0;
    for (;;) {
      const msgIdx = pkmn.shiny ? (pkmn.superShiny ? 1 : 0) : 2;
      const msg = [_INTL("Is shiny."), _INTL("Is super shiny."), _INTL("Is normal (not shiny).")][msgIdx]!;
      cmd = await pbMessage("\\ts[]" + msg,
        [_INTL("Make shiny"),
          _INTL("Make super shiny"),
          _INTL("Make normal"),
          _INTL("Reset")], -1, null, cmd);
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
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "shadow_pokemon", {
  name: "Shadow Pokémon",
  parent: "main",
  usage: "battler",
  effect: async (pkmn: Pokemon, battler: Battler, _battle: Battle) => {
    if (battler.shadowPokemon()) {
      for (;;) {
        let msg: string;
        if (battler.inHyperMode()) {
          msg = _INTL("Shadow Pokémon (in Hyper Mode)");
        } else {
          msg = _INTL("Shadow Pokémon (not in Hyper Mode)");
        }
        const cmd = await pbMessage("\\ts[]" + msg, [_INTL("Toggle Hyper Mode"), _INTL("Cancel")], -1, null, 0);
        if (cmd !== 0) break;
        if (battler.inHyperMode()) {
          pkmn.hyperMode = false;
        } else if (battler.fainted() || !battler.pbOwnedByPlayer()) {
          await pbMessage("\\ts[]" + _INTL("Pokémon is fainted or not the player's. Can't put it in Hyper Mode."));
        } else {
          pkmn.hyperMode = true;
        }
      }
    } else {
      await pbMessage("\\ts[]" + _INTL("Pokémon is not a Shadow Pokémon."));
    }
  },
});

MenuHandlers.add("battle_pokemon_debug_menu", "set_effects", {
  name: "Set effects",
  parent: "main",
  usage: "battler",
  effect: async (_pkmn: Pokemon, battler: Battler, battle: Battle) => {
    const editor = new BattleDebugSetEffects(battle, "battler", battler.index);
    await editor.update();
    editor.dispose();
  },
});
