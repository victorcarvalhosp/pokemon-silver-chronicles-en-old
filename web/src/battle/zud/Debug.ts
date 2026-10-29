// Port of the battle-side parts of Plugins/ZUD Mechanics/[000] General/Debug.rb:
// the Debug menu's "ZUD..." options (toggle switches, Dynamax availability),
// the Pokémon Debug menu's "Dynamax..." option and the battle Debug menu's
// Z-Moves/Ultra Burst/Dynamax trainer toggles, registered with MenuHandlers.
// The Max Raid and Dynamax Adventure options (Debug.rb:65-230, 451-) belong to
// the [009]/[010] ports. Essentials' debug menus themselves (020_Debug) aren't
// ported yet; these handlers are what they will list (only with $DEBUG).

import { _INTL } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { MenuHandlers } from "../../ui/menus/menuHandlers";
import { ChooseNumberParams, pbConfirmMessage, pbMessage, pbMessageChooseNumber, pbShowCommands } from "../../ui/messages";
import type { Battle } from "../battle/Battle";

/** What the Pokémon Debug menu's handlers get as `screen` (party or storage screen). */
interface DebugScreen {
  pbShowCommands(helptext: string, commands: string[], index?: number): Promise<number>;
  pbDisplay(text: string): Promise<void>;
  pbRefreshSingle(i: number): void;
  pbUpdate?(): void;
}

//-------------------------------------------------------------------------------
// General Debug options
//-------------------------------------------------------------------------------
MenuHandlers.add("debug_menu", "zud_menu", {
  name: "ZUD...",
  parent: "dx_menu",
  description: _INTL("Edit settings related to the ZUD Plugin."),
});

MenuHandlers.add("debug_menu", "debug_zud_switches", {
  name: "Toggle Switches...",
  parent: "zud_menu",
  description: _INTL("Toggles the availability of ZUD functionality."),
  effect: async () => {
    for (;;) {
      const sw = G.gameSwitches;
      const commands = [
        _INTL("Z-Moves [{1}]", sw.get(Settings.NO_Z_MOVE) ? _INTL("NO") : _INTL("YES")),
        _INTL("Ultra Burst [{1}]", sw.get(Settings.NO_ULTRA_BURST) ? _INTL("NO") : _INTL("YES")),
        _INTL("Dynamax [{1}]", sw.get(Settings.NO_DYNAMAX) ? _INTL("NO") : _INTL("YES")),
      ];
      const command = await pbShowCommands(null, commands, -1, 0);
      if (command < 0) break;
      let switchId = 0, text = "";
      switch (command) {
        case 0: [switchId, text] = [Settings.NO_Z_MOVE, "Z-Moves are "]; break;
        case 1: [switchId, text] = [Settings.NO_ULTRA_BURST, "Ultra Burst is "]; break;
        case 2: [switchId, text] = [Settings.NO_DYNAMAX, "Dynamax is "]; break;
      }
      sw.set(switchId, !sw.get(switchId));
      text += sw.get(switchId) ? "disabled" : "enabled";
      await pbMessage(_INTL("{1}.", text));
    }
  },
});

MenuHandlers.add("debug_menu", "debug_dynamax", {
  name: "Dynamax...",
  parent: "zud_menu",
  description: _INTL("Edit conditions related to Dynamax availability."),
  effect: async () => {
    for (;;) {
      const sw = G.gameSwitches;
      const commands = [
        _INTL("Dynamax on All Maps [{1}]", sw.get(Settings.DYNAMAX_ANY_MAP) ? _INTL("YES") : _INTL("NO")),
        _INTL("Dynamax in Wild Battles [{1}]", sw.get(Settings.CAN_DYNAMAX_WILD) ? _INTL("YES") : _INTL("NO")),
      ];
      const command = await pbShowCommands(null, commands, -1, 0);
      if (command < 0) break;
      let switchId = 0, text = "";
      switch (command) {
        case 0: [switchId, text] = [Settings.DYNAMAX_ANY_MAP, "Dynamax availability on all maps "]; break;
        case 1: [switchId, text] = [Settings.CAN_DYNAMAX_WILD, "Dynamax availability in wild battles "]; break;
      }
      sw.set(switchId, !sw.get(switchId));
      text += sw.get(switchId) ? "enabled" : "disabled";
      await pbMessage(_INTL("{1}.", text));
    }
  },
});

//-------------------------------------------------------------------------------
// Pokemon Debug options.
//-------------------------------------------------------------------------------
MenuHandlers.add("pokemon_debug_menu", "set_dynamax", {
  name: "Dynamax...",
  parent: "dx_pokemon_menu",
  effect: async (pkmn: Pokemon, pkmnid: number, _heldpoke: unknown, _settingUpBattle: boolean, screen: DebugScreen) => {
    let cmd = 0;
    for (;;) {
      const able = pkmn.dynamaxAble ? "Yes" : "No";
      const dlvl = pkmn.dynamaxLvl;
      const gmax = pkmn.gmaxFactor ? "Yes" : "No";
      const dmax = pkmn.dynamax ? "Yes" : "No";
      cmd = await screen.pbShowCommands(_INTL("Eligible: {1}\nDynamax Level: {2}\nG-Max Factor: {3}\nDynamaxed: {4}", able, dlvl, gmax, dmax), [
        _INTL("Set Eligibility"),
        _INTL("Set Dynamax Level"),
        _INTL("Set G-Max Factor"),
        _INTL("Set Dynamax"),
        _INTL("Reset All")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: // Set Eligibility
          if (pkmn.speciesData().noDynamax) {
            pkmn.unmax();
            await screen.pbDisplay(_INTL("{1} belongs to a species that cannot use Dynamax.\nEligibility cannot be changed.", pkmn.name));
          } else if (pkmn.dynamaxAble) {
            pkmn.unmax();
            pkmn.dynamaxLvl = 0;
            pkmn.gmaxFactor = false;
            pkmn.dynamaxAble = false;
            await screen.pbDisplay(_INTL("{1} is no longer able to use Dynamax.", pkmn.name));
          } else {
            pkmn.dynamaxAble = true;
            await screen.pbDisplay(_INTL("{1} is now able to use Dynamax.", pkmn.name));
          }
          screen.pbRefreshSingle(pkmnid);
          break;
        case 1: // Set Dynamax Level
          if (pkmn.dynamaxAble) {
            const params = new ChooseNumberParams();
            params.setRange(0, 10);
            params.setDefaultValue(pkmn.dynamaxLvl);
            params.setCancelValue(pkmn.dynamaxLvl);
            const f = await pbMessageChooseNumber(
              _INTL("Set {1}'s Dynamax level (max. 10).", pkmn.name), params, () => screen.pbUpdate?.());
            if (f !== pkmn.dynamaxLvl) {
              pkmn.dynamaxLvl = f;
              pkmn.calcStats();
              screen.pbRefreshSingle(pkmnid);
            }
          } else {
            await screen.pbDisplay(_INTL("Can't edit Dynamax values on that Pokémon."));
          }
          break;
        case 2: // Set G-Max Factor
          if (pkmn.dynamaxAble) {
            if (pkmn.gmaxFactor) {
              if (pkmn.isSpecies("ETERNATUS")) pkmn.unmax();
              pkmn.gmaxFactor = false;
              await screen.pbDisplay(_INTL("Gigantamax factor was removed from {1}.", pkmn.name));
            } else if (pkmn.hasGmax()) {
              pkmn.gmaxFactor = true;
              await screen.pbDisplay(_INTL("Gigantamax factor was given to {1}.", pkmn.name));
            } else if (await pbConfirmMessage(_INTL("{1} doesn't have a Gigantamax form.\nGive it Gigantamax factor anyway?", pkmn.name))) {
              pkmn.gmaxFactor = true;
              await screen.pbDisplay(_INTL("Gigantamax factor was given to {1}.", pkmn.name));
            }
            screen.pbRefreshSingle(pkmnid);
          } else {
            await screen.pbDisplay(_INTL("Can't edit Dynamax values on that Pokémon."));
          }
          break;
        case 3: // Set Dynamax
          if (pkmn.dynamaxAble) {
            if (pkmn.dynamax) {
              pkmn.unmax();
              await screen.pbDisplay(_INTL("{1} is no longer Dynamaxed.", pkmn.name));
            } else {
              pkmn.dynamax = true;
              pkmn.calcStats();
              pkmn.reversion = true;
              await screen.pbDisplay(_INTL("{1} is Dynamaxed.", pkmn.name));
              (G.player as unknown as Player | null)?.pokedex.register(pkmn);
            }
            screen.pbRefreshSingle(pkmnid);
          } else {
            await screen.pbDisplay(_INTL("Can't edit Dynamax values on that Pokémon."));
          }
          break;
        case 4: // Reset All
          pkmn.unmax();
          pkmn.dynamaxLvl = 0;
          pkmn.gmaxFactor = false;
          (pkmn as unknown as { dynamaxAble: boolean | null }).dynamaxAble = null;
          await screen.pbDisplay(_INTL("All Dynamax settings restored to default."));
          screen.pbRefreshSingle(pkmnid);
          break;
      }
    }
    return false;
  },
});

//-------------------------------------------------------------------------------
// Battle Debug options.
//-------------------------------------------------------------------------------
/** The battle Debug menu's per-trainer toggle of a mechanic's usage array (-1 able, -2 unable). */
function mechanicToggle(name: string, description: string, prompt: string,
  values: (battle: Battle) => number[][]): void {
  MenuHandlers.add("battle_debug_menu", name, {
    name: name === "z_moves" ? "Z-Moves" : name === "ultra_burst" ? "Ultra Burst" : "Dynamax",
    parent: "trainers",
    description: _INTL(description),
    effect: async (battle: Battle) => {
      let cmd = 0;
      for (;;) {
        const commands: string[] = [];
        const cmds: [number, number][] = [];
        values(battle).forEach((sideValues, side) => {
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
        cmd = await pbMessage("\\ts[]" + _INTL(prompt), commands, -1, null, cmd);
        if (cmd < 0) break;
        const [side, i] = cmds[cmd]!;
        const arr = values(battle);
        arr[side]![i] = arr[side]![i] === -1 ? -2 : -1; // Make unable / Make able
      }
    },
  });
}

mechanicToggle("z_moves", "Whether each trainer is allowed to use Z-Moves.",
  "Choose trainer to toggle whether they can use Z-Moves.", (b) => b.zMove);
mechanicToggle("ultra_burst", "Whether each trainer is allowed to Ultra Burst.",
  "Choose trainer to toggle whether they can Ultra Burst.", (b) => b.ultraBurst);
mechanicToggle("dynamax", "Whether each trainer is allowed to Dynamax.",
  "Choose trainer to toggle whether they can Dynamax.", (b) => b.dynamax);
