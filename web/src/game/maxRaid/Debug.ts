// Port of the Max Raid and Dynamax Adventure parts of Plugins/ZUD Mechanics/
// [000] General/Debug.rb: the Debug menu's "Max Raid Database", "Max Raid
// Dens..." and "Dynamax Adventures..." options under "ZUD..." (Debug.rb:65-230;
// the rest of the file is battle/zud/Debug.ts) and pbDebugMaxRaidBattle
// (Debug.rb:451-683), the raid set-up menu the Debug menu and the Raid
// Database's test battles use. debug/index.ts loads this right after
// battle/zud/Debug.ts, as the options come in that order in Debug.rb.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { Environment } from "../../data/gameData/environment";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { pbChooseList, type ChooseListCommand } from "../../debug/EditorUtilities";
import { pbFadeOutIn } from "../../ui/fades";
import { MenuHandlers } from "../../ui/menus/menuHandlers";
import { pbMessage, pbShowCommands } from "../../ui/messages";
import { pbPokemonScreen } from "../../ui/party/party";
import { pbWait } from "../../ui/scenes/frames";
import { Input } from "../../rgss/Input";
import { pbPlayCancelSE, pbPlayDecisionSE, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Player } from "../trainer/Player";
import { lairSavedRoutes, pbDynamaxAdventure, pbLoadLairMapData } from "../maxLair/Adventure_Main";
import { pbClearAllDens } from "./Raid_Den_Event";
import { pbGetRaidRank, raidGenerateSpeciesList, raidRanksAppearedIn } from "./Raid_Ranks";
import { type DxHash, MaxRaidBattle } from "./Raid_Setup";

const player = () => G.player as unknown as Player;

/** sprintf("%s_%d", real_name, form) for forms, else the name (the species lists). */
function speciesCommands(list: Id[], checkExists: boolean): ChooseListCommand[] {
  const spCmds: ChooseListCommand[] = [];
  for (const sp of list) {
    if (checkExists && !Species.exists(sp)) continue;
    const data = Species.get(sp);
    const name = data.form > 0 ? `${data.realName}_${data.form}` : data.realName;
    spCmds.push([spCmds.length + 1, name, sp]);
  }
  return spCmds;
}

MenuHandlers.add("debug_menu", "debug_raid_database", {
  name: "Max Raid Database",
  parent: "zud_menu",
  description: _INTL("Toggle the player's ownership of the Max Raid Database."),
  effect: async () => {
    player().hasRaidDatabase = !player().hasRaidDatabase;
    const toggle = player().hasRaidDatabase ? "ON" : "OFF";
    await pbMessage(_INTL("Ownership of the Max Raid Database is toggled {1}.", toggle));
  },
});

MenuHandlers.add("debug_menu", "debug_raid_dens", {
  name: "Max Raid Dens...",
  parent: "zud_menu",
  description: _INTL("Edit conditions related to Max Raid Dens."),
  effect: async () => {
    let command = 0;
    const commands = [
      _INTL("Test Raid Battle"),
      _INTL("Empty All Dens"),
      _INTL("Reset All Dens"),
    ];
    for (;;) {
      command = await pbShowCommands(null, commands, -1, command);
      if (command < 0) break;
      switch (command) {
        case 0: { // Test Raid Battle
          const speciesList = pbGetRaidRank().total;
          const spCmds = speciesCommands(speciesList, true);
          if (speciesList.length === 0) {
            await pbMessage(_INTL("No eligible raid species were found."));
          } else {
            await pbMessage(_INTL("Choose a species to challenge in a raid battle."));
            const species = await pbChooseList(spCmds, null, null, -1);
            if (species) {
              await pbMessage(_INTL("Edit the conditions of this raid battle."));
              await pbDebugMaxRaidBattle(species as Id);
            }
          }
          break;
        }
        case 1: // Empty All Dens
          await pbClearAllDens(false);
          await pbMessage(_INTL("Max Raid Dens on all maps were emptied of all Pokémon."));
          break;
        case 2: // Reset All Dens
          await pbClearAllDens(true);
          await pbMessage(_INTL("Max Raid Dens on all maps were reset with new Pokémon."));
          break;
      }
    }
  },
});

MenuHandlers.add("debug_menu", "debug_dynamax_adventure", {
  name: "Dynamax Adventures...",
  parent: "zud_menu",
  description: _INTL("Edit conditions related to Dynamax Adventures."),
  effect: async () => {
    let command = 0;
    const commands = [
      _INTL("Test Adventure"),
      _INTL("Edit Saved Routes"),
      _INTL("Edit Endless Adventure"),
    ];
    for (;;) {
      command = await pbShowCommands(null, commands, -1, command);
      if (command < 0) break;
      switch (command) {
        case 0: // Start Adventure
          await pbDynamaxAdventure().start();
          break;
        case 1: { // Edit Saved Routes
          let routecmd = 0;
          const routecmds = [
            _INTL("Add New Route"),
            _INTL("Edit Existing Route"),
            _INTL("Clear All Routes"),
          ];
          const speciesList = raidGenerateSpeciesList([], 6);
          const spCmds = speciesCommands(speciesList, false);
          const mapCmds: ChooseListCommand[] = [];
          const mapData = pbLoadLairMapData();
          mapData.forEach((m, i) => mapCmds.push([mapCmds.length + 1, m!.Name as string, i]));
          for (;;) {
            routecmd = await pbShowCommands(null, routecmds, -1, routecmd);
            if (routecmd < 0) break;
            switch (routecmd) {
              case 0: // Add New Route
                if (Object.keys(lairSavedRoutes()).length >= 3) {
                  await pbMessage(_INTL("You already have the maximum number of saved routes."));
                } else if (speciesList.length === 0) {
                  await pbMessage(_INTL("There aren't any eligible den species to add."));
                } else {
                  await pbMessage(_INTL("Choose a species for this route."));
                  const species = await pbChooseList(spCmds, null, null, -1);
                  if (species) {
                    const spName = Species.get(species as Id).name;
                    await pbMessage(_INTL("Choose a map to encounter {1} on.", spName));
                    const map = await pbChooseList(mapCmds, null, null, -1);
                    if (map != null) {
                      G.pokemonGlobal.dynamaxAdventureRoutes![species as Id] = map as number;
                      await pbMessage(_INTL("A route to {1} has been found within {2}.", spName, mapData[map as number]!.Name));
                    }
                  }
                }
                break;
              case 1: // Edit Existing Route
                if (Object.keys(lairSavedRoutes()).length === 0) {
                  await pbMessage(_INTL("There are no saved routes to edit."));
                } else {
                  await pbMessage(_INTL("Select a saved route to edit."));
                  const array = Object.entries(G.pokemonGlobal.dynamaxAdventureRoutes!);
                  for (;;) {
                    let savedcmd = 0;
                    const savedcmds: string[] = [];
                    for (const a of array) {
                      const map = mapData[a[1]]!.Name;
                      const species = Species.get(a[0]).name;
                      savedcmds.push(_INTL("{1} in {2}", species, map));
                    }
                    savedcmd = await pbShowCommands(null, savedcmds, -1, savedcmd);
                    if (savedcmd < 0) break;
                    await pbMessage(_INTL("Edit the species of this route."));
                    const data = array[savedcmd]!;
                    const species = await pbChooseList(spCmds, data[0], data[0], -1);
                    await pbMessage(_INTL("Edit the map for this route."));
                    const map = await pbChooseList(mapCmds, data[1], data[1], -1);
                    array[savedcmd] = [species as Id, map as number];
                    G.pokemonGlobal.dynamaxAdventureRoutes = Object.fromEntries(array);
                  }
                }
                break;
              case 2: // Clear All Routes
                for (const k of Object.keys(lairSavedRoutes())) delete lairSavedRoutes()[k];
                await pbMessage(_INTL("All saved adventure routes have been cleared."));
                break;
            }
          }
          break;
        }
        case 2: { // Edit Endless Adventure
          let endlesscmd = 0;
          const endlesscmds = [
            _INTL("Toggle Endless Mode"),
            _INTL("Reset Endless Record"),
          ];
          for (;;) {
            endlesscmd = await pbShowCommands(null, endlesscmds, -1, endlesscmd);
            if (endlesscmd < 0) break;
            switch (endlesscmd) {
              case 0: { // Toggle Endless Mode
                const g = G.pokemonGlobal;
                g.dynamaxAdventureEndlessUnlocked = !g.dynamaxAdventureEndlessUnlocked;
                const toggle = g.dynamaxAdventureEndlessUnlocked ? "unlocked" : "locked";
                await pbMessage(_INTL("Endless Mode has been {1}.", toggle));
                break;
              }
              case 1: // Reset Endless Record
                G.pokemonGlobal.dynamaxAdventureRecord = { map: "", floor: 1, battles: 0, party: [] };
                await pbMessage(_INTL("Your Endless Mode record has been reset."));
                break;
            }
          }
          break;
        }
      }
    }
  },
});

//-------------------------------------------------------------------------------
// Debug tool for setting up a Max Raid Battle.
//-------------------------------------------------------------------------------
export async function pbDebugMaxRaidBattle(pkmn: Id): Promise<void> {
  const rules: DxHash = {};
  const pokemon: DxHash = {};
  const ranks = raidRanksAppearedIn(pkmn);
  rules.rank = ranks[0];
  rules.hard = rules.rank === 6;
  rules.size = Settings.MAXRAID_SIZE;
  rules.weather = "None";
  rules.terrain = "None";
  rules.environ = "Cave";
  rules.simple = true;
  pokemon.form = Species.get(pkmn).form;
  pokemon.gmaxfactor = Species.get(pkmn).hasGmax();
  const sizemsg = ["1v1", "2v1", "3v1"];
  const eternamax = pkmn === "ETERNATUS";
  const criteria = (): string[] => {
    const raidmsg = rules.rank === 6 ? "Legendary" : rules.rank;
    const hardmsg = rules.hard ? "Hard" : "Normal";
    const gmaxmsg = pokemon.gmaxfactor ? "Yes" : "No";
    const maxtype = eternamax ? "Eternamax" : "Gigantamax";
    // NOTE (Ruby parity): MAXRAID_SIZE is 6 in this game, past the end of
    // sizemsg, so the size shows as "Raid Size []" until one is picked.
    return [
      _INTL("Start Battle"),
      _INTL("Set Party"),
      _INTL("Raid Level [{1}]", raidmsg),
      _INTL("Raid Size [{1}]", sizemsg[rules.size - 1] ?? ""),
      _INTL("Difficulty [{1}]", hardmsg),
      _INTL("{1} [{2}]", maxtype, gmaxmsg),
      _INTL("Weather [{1}]", BattleWeather.get(rules.weather).name),
      _INTL("Terrain [{1}]", BattleTerrain.get(rules.terrain).name),
      _INTL("Environment [{1}]", Environment.get(rules.environ).name),
      _INTL("Back"),
    ];
  };
  let cmd = 0;
  for (;;) {
    Input.update();
    cmd = await pbShowCommands(null, criteria(), -1, cmd);
    //-------------------------------------------------------------------------
    // Cancel & Reset
    //-------------------------------------------------------------------------
    if (cmd === 9 || cmd < 0) {
      pbPlayCancelSE();
      await pbMessage(_INTL("Battle cancelled."));
      break;
    }
    //-------------------------------------------------------------------------
    // Start Battle
    //-------------------------------------------------------------------------
    if (cmd === 0) {
      await pbFadeOutIn(async () => {
        pbSEPlay("Door enter");
        Input.update();
        await MaxRaidBattle.start(pkmn, rules, pokemon);
        await pbWait(20);
        pbSEPlay("Door exit");
      });
      for (const i of player().party) i.heal();
      break;
    //-------------------------------------------------------------------------
    // View party screen
    //-------------------------------------------------------------------------
    } else if (cmd === 1) {
      Input.update();
      pbPlayDecisionSE();
      await pbPokemonScreen();
    //-------------------------------------------------------------------------
    // Set Raid Level
    //-------------------------------------------------------------------------
    } else if (cmd === 2) {
      const stars = ranks.map((r) => String(r));
      if (rules.rank < 6) {
        Input.update();
        const choice = await pbShowCommands(null, stars, -1, 0);
        if (choice === -1) pbPlayDecisionSE();
        if (choice > -1) {
          rules.rank = ranks[choice];
          await pbMessage(_INTL("Raid level set to {1}.", rules.rank));
        }
      } else {
        await pbMessage(_INTL("This species may only appear in Legendary raids."));
      }
    //-------------------------------------------------------------------------
    // Set Raid Size
    //-------------------------------------------------------------------------
    } else if (cmd === 3) {
      Input.update();
      const choice = await pbShowCommands(null, sizemsg, -1, 0);
      if (choice === -1) pbPlayDecisionSE();
      if (choice > -1) {
        rules.size = choice + 1;
        await pbMessage(_INTL("Raid size is set to {1}.", sizemsg[choice]));
      }
    //-------------------------------------------------------------------------
    // Set Difficulty mode
    //-------------------------------------------------------------------------
    } else if (cmd === 4) {
      if (rules.rank < 6) {
        Input.update();
        pbPlayDecisionSE();
        if (!rules.hard) {
          rules.hard = true;
          await pbMessage(_INTL("Hard Mode enabled."));
        } else {
          rules.hard = false;
          await pbMessage(_INTL("Hard Mode disabled."));
        }
      } else {
        await pbMessage(_INTL("Difficulty for Legendary raids cannot be changed."));
      }
    //-------------------------------------------------------------------------
    // Set Gigantamax
    //-------------------------------------------------------------------------
    } else if (cmd === 5) {
      if (Species.get(pkmn).hasGmax()) {
        if (!eternamax) {
          Input.update();
          pbPlayDecisionSE();
          if (!pokemon.gmaxfactor) {
            pokemon.gmaxfactor = true;
            await pbMessage(_INTL("Gigantamax Factor applied."));
          } else {
            pokemon.gmaxfactor = false;
            await pbMessage(_INTL("Gigantamax Factor removed."));
          }
        } else {
          await pbMessage(_INTL("This species can only appear in its Eternamax Form."));
        }
      } else {
        await pbMessage(_INTL("This species is unable to Gigantamax."));
      }
    //-------------------------------------------------------------------------
    // Set Weather
    //-------------------------------------------------------------------------
    } else if (cmd === 6) {
      const weather: string[] = [];
      const weatherId: Id[] = [];
      for (const w of BattleWeather.each()) {
        if (w.id === "HarshSun" || w.id === "HeavyRain" || w.id === "StrongWinds") continue;
        weather.push(w.name);
        weatherId.push(w.id);
      }
      Input.update();
      const choice = await pbShowCommands(null, weather, -1, 0);
      if (choice === -1) pbPlayDecisionSE();
      if (choice > -1) {
        rules.weather = weatherId[choice];
        await pbMessage(_INTL("Weather is set to {1}.", weather[choice]));
      }
    //-------------------------------------------------------------------------
    // Set Terrain
    //-------------------------------------------------------------------------
    } else if (cmd === 7) {
      const terrain: string[] = [];
      const terrainId: Id[] = [];
      for (const t of BattleTerrain.each()) {
        terrain.push(t.id === "None" ? t.name : t.name + " Terrain");
        terrainId.push(t.id);
      }
      Input.update();
      const choice = await pbShowCommands(null, terrain, -1, 0);
      if (choice === -1) pbPlayDecisionSE();
      if (choice > -1) {
        rules.terrain = terrainId[choice];
        await pbMessage(_INTL("Terrain is set to {1}.", terrain[choice]));
      }
    //-------------------------------------------------------------------------
    // Set Environment
    //-------------------------------------------------------------------------
    } else if (cmd === 8) {
      const environ: string[] = [];
      const environId: Id[] = [];
      for (const e of Environment.each()) {
        environ.push(e.name);
        environId.push(e.id);
      }
      Input.update();
      const choice = await pbShowCommands(null, environ, -1, 0);
      if (choice === -1) pbPlayDecisionSE();
      if (choice > -1) {
        rules.environ = environId[choice];
        await pbMessage(_INTL("Environment is set to {1}.", environ[choice]));
      }
    }
  }
}
