// Port of 020_Debug/003_Debug menus/004_Debug_BattleCommands.rb: the battle
// Debug menu's options (battlers, teams, trainer options, field effects),
// registered with MenuHandlers under :battle_debug_menu. No plugin overrides
// them; ZUD adds its Z-Moves/Ultra Burst/Dynamax toggles under "trainers"
// (battle/zud/Debug.ts).

import type { Battle } from "../battle/battle/Battle";
import type { Battler } from "../battle/battler/Battler";
import { GameData } from "../data/gameData";
import type { Pokemon } from "../game/pokemon/Pokemon";
import { Graphics } from "../rgss/Graphics";
import { MenuHandlers } from "../ui/menus/menuHandlers";
import { _INTL } from "../ui/messageConfig";
import { ChooseNumberParams, pbMessage, pbMessageChooseNumber } from "../ui/messages";
import { pbMessageFreeText } from "../ui/party/mail";
import { BattleDebugSetEffects } from "./DebugBattleExtraCode";
import { pbBattlePokemonDebug } from "./DebugMenus";
import { GameDataPoolProperty } from "./EditorDataTypes";

const nilOrEmpty = (s: string | null | undefined): boolean => s == null || s === "";

//===============================================================================
// Battler Options
//===============================================================================
MenuHandlers.add("battle_debug_menu", "battlers", {
  name: "Battlers...",
  parent: "main",
  description: "Look at Pokémon in battle and change their properties.",
});

MenuHandlers.add("battle_debug_menu", "list_player_battlers", {
  name: "Player-Side Battlers",
  parent: "battlers",
  description: "Edit Pokémon on the player's side of battle.",
  effect: async (battle: Battle) => {
    const battlers: Battler[] = [];
    const cmds: string[] = [];
    for (const b of battle.allSameSideBattlers()) {
      battlers.push(b);
      let text = `[${b.index}] ${b.name}`;
      if (b.pbOwnedByPlayer()) {
        text += " (yours)";
      } else {
        text += " (ally's)";
      }
      cmds.push(text);
    }
    let cmd = 0;
    for (;;) {
      cmd = await pbMessage("\\ts[]" + _INTL("Choose a Pokémon."), cmds, -1, null, cmd);
      if (cmd < 0) break;
      await pbBattlePokemonDebug(battle, battlers[cmd]!.pokemon!, battlers[cmd]!);
    }
  },
});

MenuHandlers.add("battle_debug_menu", "list_foe_battlers", {
  name: "Foe-Side Battlers",
  parent: "battlers",
  description: "Edit Pokémon on the opposing side of battle.",
  effect: async (battle: Battle) => {
    const battlers: Battler[] = [];
    const cmds: string[] = [];
    for (const b of battle.allOtherSideBattlers()) {
      battlers.push(b);
      cmds.push(`[${b.index}] ${b.name}`);
    }
    let cmd = 0;
    for (;;) {
      cmd = await pbMessage("\\ts[]" + _INTL("Choose a Pokémon."), cmds, -1, null, cmd);
      if (cmd < 0) break;
      await pbBattlePokemonDebug(battle, battlers[cmd]!.pokemon!, battlers[cmd]!);
    }
  },
});

MenuHandlers.add("battle_debug_menu", "speed_order", {
  name: "Battler Speed Order",
  parent: "battlers",
  description: "Show all battlers in order from fastest to slowest.",
  effect: async (battle: Battle) => {
    const battlers: [Battler, number][] = battle.allBattlers().map((b) => [b, b.pbSpeed()]);
    battlers.sort((a, b) => b[1] - a[1]);
    const commands: string[] = [];
    for (const value of battlers) {
      const b = value[0];
      commands.push(`[${b.index}] ${b.pbThis()} (speed: ${Math.trunc(value[1])})`);
    }
    await pbMessage("\\ts[]" + _INTL("Battlers are listed from fastest to slowest. Speeds include modifiers."),
      commands, -1);
  },
});

//===============================================================================
// Pokémon
//===============================================================================
MenuHandlers.add("battle_debug_menu", "pokemon_teams", {
  name: "Pokémon Teams",
  parent: "main",
  description: "Look at and edit all Pokémon in each team.",
  effect: async (battle: Battle) => {
    const playerPartyStarts = battle.pbPartyStarts(0);
    const foePartyStarts = battle.pbPartyStarts(1);
    let cmd = 0;
    for (;;) {
      // Find all teams and how many Pokémon they have
      const commands: string[] = [];
      const teamIndices: [number, number, number][] = [];
      if (battle.opponent) {
        battle.opponent.forEach((trainer, i) => {
          const firstIndex = foePartyStarts[i]!;
          const lastIndex = i < foePartyStarts.length - 1 ? foePartyStarts[i + 1]! : battle.pbParty(1).length;
          const numPkmn = lastIndex - firstIndex;
          commands.push(_INTL("Opponent {1}: {2} ({3} Pokémon)", i + 1, trainer.fullName(), numPkmn));
          teamIndices.push([1, i, firstIndex]);
        });
      } else {
        commands.push(_INTL("Opponent: {1} wild Pokémon", battle.pbParty(1).length));
        teamIndices.push([1, 0, 0]);
      }
      battle.player!.forEach((trainer, i) => {
        const firstIndex = playerPartyStarts[i]!;
        const lastIndex = i < playerPartyStarts.length - 1 ? playerPartyStarts[i + 1]! : battle.pbParty(0).length;
        const numPkmn = lastIndex - firstIndex;
        if (i === 0) { // Player
          commands.push(_INTL("You: {1} ({2} Pokémon)", trainer.fullName(), numPkmn));
        } else {
          commands.push(_INTL("Ally {1}: {2} ({3} Pokémon)", i, trainer.fullName(), numPkmn));
        }
        teamIndices.push([0, i, firstIndex]);
      });
      // Choose a team
      cmd = await pbMessage("\\ts[]" + _INTL("Choose a team."), commands, -1, null, cmd);
      if (cmd < 0) break;
      // Pick a Pokémon to look at
      let pkmnCmd = 0;
      for (;;) {
        const pkmn: Pokemon[] = [];
        const pkmnCmds: string[] = [];
        battle.eachInTeam(teamIndices[cmd]![0], teamIndices[cmd]![1], (p) => {
          pkmn.push(p);
          pkmnCmds.push(`[${pkmnCmds.length + 1}] ${p.name} Lv.${p.level} (HP: ${p.hp}/${p.totalhp})`);
        });
        pkmnCmd = await pbMessage("\\ts[]" + _INTL("Choose a Pokémon."), pkmnCmds, -1, null, pkmnCmd);
        if (pkmnCmd < 0) break;
        await pbBattlePokemonDebug(battle, pkmn[pkmnCmd]!,
          battle.pbFindBattler(teamIndices[cmd]![2] + pkmnCmd, teamIndices[cmd]![0]));
      }
    }
  },
});

//===============================================================================
// Trainer Options
//===============================================================================
MenuHandlers.add("battle_debug_menu", "trainers", {
  name: "Trainer Options...",
  parent: "main",
  description: "Variables that apply to trainers.",
});

MenuHandlers.add("battle_debug_menu", "trainer_items", {
  name: "NPC Trainer Items",
  parent: "trainers",
  description: "View and change the items each NPC trainer has access to.",
  effect: async (battle: Battle) => {
    let cmd = 0;
    for (;;) {
      // Find all NPC trainers and their items
      const commands: string[] = [];
      const itemArrays: string[][] = [];
      const trainerIndices: [number, number][] = [];
      if (battle.opponent) {
        battle.opponent.forEach((trainer, i) => {
          const items = battle.items ? [...(battle.items[i] ?? [])] : [];
          commands.push(_INTL("Opponent {1}: {2} ({3} items)", i + 1, trainer.fullName(), items.length));
          itemArrays.push(items);
          trainerIndices.push([1, i]);
        });
      }
      if (battle.player!.length > 1) {
        battle.player!.forEach((trainer, i) => {
          if (i === 0) return; // Player
          const items = battle.allyItems ? [...(battle.allyItems[i] ?? [])] : [];
          commands.push(_INTL("Ally {1}: {2} ({3} items)", i, trainer.fullName(), items.length));
          itemArrays.push(items);
          trainerIndices.push([0, i]);
        });
      }
      if (commands.length === 0) {
        await pbMessage("\\ts[]" + _INTL("There are no NPC trainers in this battle."));
        break;
      }
      // Choose a trainer
      cmd = await pbMessage("\\ts[]" + _INTL("Choose a trainer."), commands, -1, null, cmd);
      if (cmd < 0) break;
      // Get trainer's items
      const items = itemArrays[cmd]!;
      const indices = trainerIndices[cmd]!;
      // Edit trainer's items
      const itemListProperty = new GameDataPoolProperty("Item");
      const newItems = (await itemListProperty.set(null, items)) as string[];
      if (indices[0] === 0) { // Ally
        if (!battle.allyItems) battle.allyItems = [];
        battle.allyItems[indices[1]] = newItems;
      } else { // Opponent
        if (!battle.items) battle.items = [];
        battle.items[indices[1]] = newItems;
      }
    }
  },
});

MenuHandlers.add("battle_debug_menu", "mega_evolution", {
  name: "Mega Evolution",
  parent: "trainers",
  description: "Whether each trainer is allowed to Mega Evolve.",
  effect: async (battle: Battle) => {
    let cmd = 0;
    for (;;) {
      const commands: string[] = [];
      const cmds: [number, number][] = [];
      battle.megaEvolution.forEach((sideValues, side) => {
        const trainers = side === 0 ? battle.player : battle.opponent;
        if (!trainers) return;
        sideValues.forEach((value, i) => {
          if (!trainers[i]) return;
          let text = side === 0 ? "Your side:" : "Foe side:";
          text += ` ${i}: ${trainers[i]!.name}`;
          if (value === -1) text += " [ABLE]";
          if (value === -2) text += " [UNABLE]";
          commands.push(text);
          cmds.push([side, i]);
        });
      });
      cmd = await pbMessage("\\ts[]" + _INTL("Choose trainer to toggle whether they can Mega Evolve."),
        commands, -1, null, cmd);
      if (cmd < 0) break;
      const realCmd = cmds[cmd]!;
      if (battle.megaEvolution[realCmd[0]]![realCmd[1]] === -1) {
        battle.megaEvolution[realCmd[0]]![realCmd[1]] = -2; // Make unable
      } else {
        battle.megaEvolution[realCmd[0]]![realCmd[1]] = -1; // Make able
      }
    }
  },
});

//===============================================================================
// Field Options
//===============================================================================
MenuHandlers.add("battle_debug_menu", "field", {
  name: "Field Effects...",
  parent: "main",
  description: "Effects that apply to the whole battlefield.",
});

MenuHandlers.add("battle_debug_menu", "weather", {
  name: "Weather",
  parent: "field",
  description: "Set weather and duration.",
  effect: async (battle: Battle) => {
    const weatherTypes: string[] = [];
    const weatherCmds: string[] = [];
    for (const weather of GameData.BattleWeather.each()) {
      if (weather.id === "None") continue;
      weatherTypes.push(weather.id);
      weatherCmds.push(weather.name);
    }
    let cmd = 0;
    for (;;) {
      const weatherData = GameData.BattleWeather.tryGet(battle.field.weather);
      let msg = _INTL("Current weather: {1}", weatherData?.name || _INTL("Unknown"));
      if (weatherData?.id !== "None") {
        if (battle.field.weatherDuration > 0) {
          msg += "\r\n";
          msg += _INTL("Duration : {1} more round(s)", battle.field.weatherDuration);
        } else if (battle.field.weatherDuration < 0) {
          msg += "\r\n";
          msg += _INTL("Duration : Infinite");
        }
      }
      cmd = await pbMessage("\\ts[]" + msg, [_INTL("Change type"),
        _INTL("Change duration"),
        _INTL("Clear weather")], -1, null, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Change type
          const idx = weatherTypes.indexOf(battle.field.weather);
          const weatherCmd = idx >= 0 ? idx : 0;
          const newWeather = await pbMessage(
            "\\ts[]" + _INTL("Choose the new weather type."), weatherCmds, -1, null, weatherCmd,
          );
          if (newWeather >= 0) {
            battle.field.weather = weatherTypes[newWeather]!;
            if (battle.field.weatherDuration === 0) battle.field.weatherDuration = 5;
          }
          break;
        }
        case 1: { // Change duration
          if (battle.field.weather === "None") {
            await pbMessage("\\ts[]" + _INTL("There is no weather."));
            continue;
          }
          const params = new ChooseNumberParams();
          params.setRange(0, 99);
          params.setInitialValue(Math.max(battle.field.weatherDuration, 0));
          params.setCancelValue(Math.max(battle.field.weatherDuration, 0));
          const newDuration = await pbMessageChooseNumber(
            "\\ts[]" + _INTL("Choose the new weather duration (0=infinite)."), params,
          );
          if (newDuration !== Math.max(battle.field.weatherDuration, 0)) {
            battle.field.weatherDuration = newDuration === 0 ? -1 : newDuration;
          }
          break;
        }
        case 2: // Clear weather
          battle.field.weather = "None";
          battle.field.weatherDuration = 0;
          break;
      }
    }
  },
});

MenuHandlers.add("battle_debug_menu", "terrain", {
  name: "Terrain",
  parent: "field",
  description: "Set terrain and duration.",
  effect: async (battle: Battle) => {
    const terrainTypes: string[] = [];
    const terrainCmds: string[] = [];
    for (const terrain of GameData.BattleTerrain.each()) {
      if (terrain.id === "None") continue;
      terrainTypes.push(terrain.id);
      terrainCmds.push(terrain.name);
    }
    let cmd = 0;
    for (;;) {
      const terrainData = GameData.BattleTerrain.tryGet(battle.field.terrain);
      let msg = _INTL("Current terrain: {1}", terrainData?.name || _INTL("Unknown"));
      if (terrainData?.id !== "None") {
        if (battle.field.terrainDuration > 0) {
          msg += "\r\n";
          msg += _INTL("Duration : {1} more round(s)", battle.field.terrainDuration);
        } else if (battle.field.terrainDuration < 0) {
          msg += "\r\n";
          msg += _INTL("Duration : Infinite");
        }
      }
      cmd = await pbMessage("\\ts[]" + msg, [_INTL("Change type"),
        _INTL("Change duration"),
        _INTL("Clear terrain")], -1, null, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Change type
          const idx = terrainTypes.indexOf(battle.field.terrain);
          const terrainCmd = idx >= 0 ? idx : 0;
          const newTerrain = await pbMessage(
            "\\ts[]" + _INTL("Choose the new terrain type."), terrainCmds, -1, null, terrainCmd,
          );
          if (newTerrain >= 0) {
            battle.field.terrain = terrainTypes[newTerrain]!;
            if (battle.field.terrainDuration === 0) battle.field.terrainDuration = 5;
          }
          break;
        }
        case 1: { // Change duration
          if (battle.field.terrain === "None") {
            await pbMessage("\\ts[]" + _INTL("There is no terrain."));
            continue;
          }
          const params = new ChooseNumberParams();
          params.setRange(0, 99);
          params.setInitialValue(Math.max(battle.field.terrainDuration, 0));
          params.setCancelValue(Math.max(battle.field.terrainDuration, 0));
          const newDuration = await pbMessageChooseNumber(
            "\\ts[]" + _INTL("Choose the new terrain duration (0=infinite)."), params,
          );
          if (newDuration !== Math.max(battle.field.terrainDuration, 0)) {
            battle.field.terrainDuration = newDuration === 0 ? -1 : newDuration;
          }
          break;
        }
        case 2: // Clear terrain
          battle.field.terrain = "None";
          battle.field.terrainDuration = 0;
          break;
      }
    }
  },
});

MenuHandlers.add("battle_debug_menu", "environment_time", {
  name: "Environment/Time",
  parent: "field",
  description: "Set the battle's environment and time of day.",
  effect: async (battle: Battle) => {
    const environmentTypes: string[] = [];
    const environmentCmds: string[] = [];
    for (const environment of GameData.Environment.each()) {
      environmentTypes.push(environment.id);
      environmentCmds.push(environment.name);
    }
    let cmd = 0;
    for (;;) {
      const environmentData = GameData.Environment.tryGet(battle.environment);
      let msg = _INTL("Environment: {1}", environmentData?.name || _INTL("Unknown"));
      msg += "\r\n";
      msg += _INTL("Time of day: {1}", [_INTL("Day"), _INTL("Evening"), _INTL("Night")][battle.time]);
      cmd = await pbMessage("\\ts[]" + msg, [_INTL("Change environment"),
        _INTL("Change time of day")], -1, null, cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Change environment
          const idx = environmentTypes.indexOf(battle.environment);
          const environmentCmd = idx >= 0 ? idx : 0;
          const newEnvironment = await pbMessage(
            "\\ts[]" + _INTL("Choose the new environment."), environmentCmds, -1, null, environmentCmd,
          );
          if (newEnvironment >= 0) battle.environment = environmentTypes[newEnvironment]!;
          break;
        }
        case 1: { // Change time of day
          const newTime = await pbMessage("\\ts[]" + _INTL("Choose the new time."),
            [_INTL("Day"), _INTL("Evening"), _INTL("Night")], -1, null, battle.time);
          if (newTime >= 0 && newTime !== battle.time) battle.time = newTime;
          break;
        }
      }
    }
  },
});

MenuHandlers.add("battle_debug_menu", "backdrop", {
  name: "Backdrop Names",
  parent: "field",
  description: "Set the names of the backdrop and base graphics.",
  effect: async (battle: Battle) => {
    for (;;) {
      const cmd = await pbMessage("\\ts[]" + _INTL("Set which backdrop name?"),
        [_INTL("Backdrop"),
          _INTL("Base modifier")], -1);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Backdrop
          const text = await pbMessageFreeText("\\ts[]" + _INTL("Set the backdrop's name."),
            battle.backdrop, false, 100, Graphics.width);
          battle.backdrop = nilOrEmpty(text) ? "Indoor1" : text;
          break;
        }
        case 1: { // Base modifier
          const text = await pbMessageFreeText("\\ts[]" + _INTL("Set the base modifier text."),
            battle.backdropBase ?? "", false, 100, Graphics.width);
          battle.backdropBase = nilOrEmpty(text) ? null : text;
          break;
        }
      }
    }
  },
});

/** editor = Battle::DebugSetEffects.new(...); editor.update; editor.dispose */
async function runSetEffects(battle: Battle, mode: "field" | "side" | "position", side = 0): Promise<void> {
  const editor = new BattleDebugSetEffects(battle, mode, side);
  await editor.update();
  editor.dispose();
}

MenuHandlers.add("battle_debug_menu", "set_field_effects", {
  name: "Other Field Effects...",
  parent: "field",
  description: "View/set other effects that apply to the whole battlefield.",
  effect: async (battle: Battle) => {
    await runSetEffects(battle, "field");
  },
});

MenuHandlers.add("battle_debug_menu", "player_side", {
  name: "Player's Side Effects...",
  parent: "field",
  description: "Effects that apply to the side the player is on.",
  effect: async (battle: Battle) => {
    await runSetEffects(battle, "side", 0);
  },
});

MenuHandlers.add("battle_debug_menu", "opposing_side", {
  name: "Foe's Side Effects...",
  parent: "field",
  description: "Effects that apply to the opposing side.",
  effect: async (battle: Battle) => {
    await runSetEffects(battle, "side", 1);
  },
});

MenuHandlers.add("battle_debug_menu", "position_effects", {
  name: "Battler Position Effects...",
  parent: "field",
  description: "Effects that apply to individual battler positions.",
  effect: async (battle: Battle) => {
    const positions: number[] = [];
    const cmds: string[] = [];
    battle.positions.forEach((position, i) => {
      if (!position) return;
      positions.push(i);
      const battler = battle.battlers[i];
      let text: string;
      if (battler && !battler.fainted()) {
        text = `[${i}] ${battler.name}`;
      } else {
        text = _INTL(`[${i}] (empty)`, i);
      }
      if (battler!.pbOwnedByPlayer()) {
        text += " (yours)";
      } else if (battle.opposes(i)) {
        text += " (opposing)";
      } else {
        text += " (ally's)";
      }
      cmds.push(text);
    });
    let cmd = 0;
    for (;;) {
      cmd = await pbMessage("\\ts[]" + _INTL("Choose a battler position."), cmds, -1, null, cmd);
      if (cmd < 0) break;
      await runSetEffects(battle, "position", positions[cmd]!);
    }
  },
});
