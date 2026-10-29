// Port of 020_Debug/003_Debug menus/002_Debug_MenuCommands.rb: every option
// of the overworld Debug menu (:debug_menu), registered with MenuHandlers in
// Essentials' order (pbDebugMenu in DebugMenus.ts lists them). Folded in, in
// plugin load order:
// - Plugins/v20.1 Hotfixes/Debug bug fixes.rb: :test_wild_battle_advanced and
//   :test_trainer_battle_advanced (run the encounter/trainer modifiers).
// - Plugins/Essentials Deluxe/[000] Essentials Patches/Debug.rb: :dx_menu,
//   :deluxe_menu, :debug_mega, :debug_birthday and its :fill_boxes (registers
//   the shiny/special forms seen too). Its :pokemon_debug_menu options are in
//   DebugPokemonCommands.ts; ZUD's "ZUD..." options (parent :dx_menu) are in
//   battle/zud/Debug.ts and must be loaded after this file.
// Re-adding an option keeps its position (MenuHandlers is a Ruby Hash), so the
// plugin versions are written in place of Essentials'.
// The editors (001_Editor screens, the animation editor, Mystery Gift) open
// through openEditorScreen until they're ported. Writing files (Compile Data,
// Create PBS File(s), Fix Invalid Tiles, Rename Outdated Files) goes through
// the dev server (debug/devFiles.ts), so it only works under `pnpm dev`.

import { PBDebug } from "../battle/other/PBDebug";
import { Compiler } from "../compiler/WritePBS";
import { loadAssetIndex } from "../core/assets";
import { rand } from "../core/random";
import { GameData } from "../data/gameData";
import type { Id } from "../data/gameData/gameData";
import { Settings } from "../data/gameData/settings";
import { setBattleRule, TrainerBattle, WildBattle, pbCanDoubleBattle, pbCanTripleBattle } from "../game/battle/BattleStarting";
import { pbGenerateWildPokemon } from "../game/encounters/PokemonEncounters";
import { EventHandlers } from "../game/eventHandlers";
import type { GameMap } from "../game/GameMap";
import { pbCancelVehicles, type GamePlayer } from "../game/GamePlayer";
import { G } from "../game/globals";
import type { PokemonMapFactory } from "../game/MapFactory";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { pbAddPokemonSilent } from "../game/pokemon/utilities";
import { pbPokeCenterPC } from "../game/scripts/pc";
import { pbChangePlayer } from "../game/scripts/overworld";
import { pbLoadTrainer } from "../game/trainer/loadAndNew";
import type { Player } from "../game/trainer/Player";
import type { NPCTrainer } from "../game/trainer/Trainer";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { prepareMap, SceneMap } from "../scenes/SceneMap";
import { pbFadeOutAndHide, pbFadeOutIn } from "../ui/fades";
import { toSFormatted } from "../ui/mart/PokemonMart";
import { MenuHandlers } from "../ui/menus/menuHandlers";
import { _INTL, pbDisposeSpriteHash } from "../ui/messageConfig";
import {
  ChooseNumberParams, pbConfirmMessage, pbCreateMessageWindow, pbDisposeMessageWindow, pbMessage, pbMessageChooseNumber,
  pbMessageDisplay, pbShowCommands,
} from "../ui/messages";
import { type PhoneNumber, pbSetReadyToBattle } from "../ui/pokegear/phone";
import { PokemonStorageScene } from "../ui/storage/PokemonStorageScene";
import { PokemonStorageScreen } from "../ui/storage/PokemonStorageScreen";
import { pbGetMonthName } from "../ui/summary/summary";
import { pbEnterPlayerName } from "../ui/textEntry/UI_TextEntry";
import { pbSuggestTrainerName } from "../ui/textEntry/playerName";
import type { Viewport } from "../rgss/display";
import { echoln } from "./DebugConsole";
import {
  pbDebugDayCare, pbDebugFixInvalidTiles, pbDebugRoamers, pbDebugVariables, pbDefaultMap, pbExportAllAnimations,
  pbExtractText, pbCompileTextUI, pbImportAllAnimations, pbWarpToMap, PokemonDebugPartyScreen,
} from "./DebugMenuExtraCode";
import type { DebugMenuSprites } from "./DebugMenus";
import { DevFiles, devWriteOrExplain } from "./devFiles";
import { openEditorScreen } from "./editorScreens";
import { ItemLister, pbListScreen, pbListScreenBlock, TrainerBattleLister } from "./EditorListers";
import { pbChooseSpeciesList } from "./EditorUtilities";
import { FilenameUpdater } from "./FilenameUpdater";

const player = () => G.player as unknown as Player;
const gameMap = () => G.gameMap as unknown as GameMap;
const pokemonGlobal = () => G.pokemonGlobal as unknown as {
  creditsPlayed: boolean;
  encounterVersion?: number;
  phoneNumbers?: PhoneNumber[];
};

/** nil_or_empty?(string) */
function nilOrEmpty(s: string | null | undefined): boolean {
  return s === null || s === undefined || s === "";
}

/**
 * Field moves/scripts from other script sections that aren't ported yet (the
 * Shadow Pokémon purification: 016_UI/024_UI_PurifyChamber.rb,
 * 012_Overworld/.../Overworld_ShadowPokemon? pbRelicStone). Their ports set
 * these; until then the options say so.
 */
export const DebugMenuCommandHooks: {
  pbRelicStone?: () => Promise<void>;
  pbPurifyChamber?: () => Promise<void>;
} = {};

async function callHook(name: keyof typeof DebugMenuCommandHooks): Promise<void> {
  const fn = DebugMenuCommandHooks[name];
  if (fn) {
    await fn();
    return;
  }
  await pbMessage(_INTL("{1} isn't ported to the browser yet.", name));
}

/** $INTERNAL: Ruby writes the battle log to Data/debuglog.txt; here it goes to the browser console. */
export const DebugFlags = { internal: false };

//===============================================================================
// Field options
//===============================================================================
MenuHandlers.add("debug_menu", "field_menu", {
  name: "Field Options...",
  parent: "main",
  description: "Warp to maps, edit switches/variables, use the PC, edit Day Care, etc.",
  always_show: false,
});

MenuHandlers.add("debug_menu", "warp", {
  name: "Warp to Map",
  parent: "field_menu",
  description: "Instantly warp to another map of your choice.",
  effect: async (sprites: DebugMenuSprites, viewport: Viewport): Promise<boolean> => {
    const map = await pbWarpToMap();
    if (!map) return false;
    await pbFadeOutAndHide(sprites);
    pbDisposeMessageWindow(sprites.textbox);
    pbDisposeSpriteHash(sprites);
    viewport.dispose();
    const t = G.gameTemp;
    if (G.scene instanceof SceneMap) {
      t.playerNewMapId = map[0];
      t.playerNewX = map[1];
      t.playerNewY = map[2];
      t.playerNewDirection = 2;
      await G.scene.transferPlayer();
    } else {
      pbCancelVehicles();
      await prepareMap(map[0]); // Ruby loads the maps synchronously
      (G.mapFactory as unknown as PokemonMapFactory).setup(map[0]);
      const gamePlayer = G.gamePlayer as unknown as GamePlayer;
      gamePlayer.moveto(map[1], map[2]);
      gamePlayer.turnDown();
      await gameMap().update();
      gameMap().autoplay();
    }
    gameMap().refresh();
    return true; // Closes the debug menu to allow the warp
  },
});

MenuHandlers.add("debug_menu", "refresh_map", {
  name: "Refresh Map",
  parent: "field_menu",
  description: "Make all events on this map, and common events, refresh themselves.",
  effect: async () => {
    gameMap().needRefresh = true;
    await pbMessage(_INTL("The map will refresh."));
  },
});

MenuHandlers.add("debug_menu", "switches", {
  name: "Switches",
  parent: "field_menu",
  description: "Edit all Game Switches (except Script Switches).",
  effect: async () => {
    await pbDebugVariables(0);
  },
});

MenuHandlers.add("debug_menu", "variables", {
  name: "Variables",
  parent: "field_menu",
  description: "Edit all Game Variables. Can set them to numbers or text.",
  effect: async () => {
    await pbDebugVariables(1);
  },
});

MenuHandlers.add("debug_menu", "use_pc", {
  name: "Use PC",
  parent: "field_menu",
  description: "Use a PC to access Pokémon storage and player's PC.",
  effect: async () => {
    await pbPokeCenterPC();
  },
});

MenuHandlers.add("debug_menu", "storage_wallpapers", {
  name: "Toggle Storage Wallpapers",
  parent: "field_menu",
  description: "Unlock and lock special wallpapers used in Pokémon storage.",
  effect: async () => {
    const w = G.storage.allWallpapers();
    if (w.length <= PokemonStorage.BASICWALLPAPERQTY) {
      await pbMessage(_INTL("There are no special wallpapers defined."));
    } else {
      let paperscmd = 0;
      const unlockarray = G.storage.unlockedWallpapers;
      for (;;) {
        const paperscmds: string[] = [];
        paperscmds.push(_INTL("Unlock all"));
        paperscmds.push(_INTL("Lock all"));
        for (let i = PokemonStorage.BASICWALLPAPERQTY; i < w.length; i++) {
          paperscmds.push(_INTL("{1} {2}", unlockarray[i] ? "[Y]" : "[  ]", w[i]));
        }
        paperscmd = await pbShowCommands(null, paperscmds, -1, paperscmd);
        if (paperscmd < 0) break;
        switch (paperscmd) {
          case 0: // Unlock all
            for (let i = PokemonStorage.BASICWALLPAPERQTY; i < w.length; i++) unlockarray[i] = true;
            break;
          case 1: // Lock all
            for (let i = PokemonStorage.BASICWALLPAPERQTY; i < w.length; i++) unlockarray[i] = false;
            break;
          default: {
            const paperindex = paperscmd - 2 + PokemonStorage.BASICWALLPAPERQTY;
            unlockarray[paperindex] = !G.storage.unlockedWallpapers[paperindex];
          }
        }
      }
    }
  },
});

MenuHandlers.add("debug_menu", "day_care", {
  name: "Day Care",
  parent: "field_menu",
  description: "View Pokémon in the Day Care and edit them.",
  effect: async () => {
    await pbDebugDayCare();
  },
});

MenuHandlers.add("debug_menu", "skip_credits", {
  name: "Skip Credits",
  parent: "field_menu",
  description: "Toggle whether credits can be ended early by pressing the Use input.",
  effect: async () => {
    pokemonGlobal().creditsPlayed = !pokemonGlobal().creditsPlayed;
    if (pokemonGlobal().creditsPlayed) await pbMessage(_INTL("Credits can be skipped when played in future."));
    if (!pokemonGlobal().creditsPlayed) await pbMessage(_INTL("Credits cannot be skipped when next played."));
  },
});

MenuHandlers.add("debug_menu", "relic_stone", {
  name: "Use Relic Stone",
  parent: "field_menu",
  description: "Shadow Pokémon. Choose a Pokémon to show to the Relic Stone for purification.",
  effect: async () => {
    await callHook("pbRelicStone");
  },
});

MenuHandlers.add("debug_menu", "purify_chamber", {
  name: "Use Purify Chamber",
  parent: "field_menu",
  description: "Shadow Pokémon. Open the Purify Chamber for purification.",
  effect: async () => {
    await callHook("pbPurifyChamber");
  },
});

//===============================================================================
// Battle options
//===============================================================================
MenuHandlers.add("debug_menu", "battle_menu", {
  name: "Battle Options...",
  parent: "main",
  description: "Start battles, reset this map's trainers, ready rematches, edit roamers, etc.",
  always_show: false,
});

MenuHandlers.add("debug_menu", "test_wild_battle", {
  name: "Test Wild Battle",
  parent: "battle_menu",
  description: "Start a single battle against a wild Pokémon. You choose the species/level.",
  effect: async () => {
    const species = await pbChooseSpeciesList();
    if (species) {
      const params = new ChooseNumberParams();
      params.setRange(1, GameData.GrowthRate.maxLevel());
      params.setInitialValue(5);
      params.setCancelValue(0);
      const level = await pbMessageChooseNumber(_INTL("Set the wild {1}'s level.",
        GameData.Species.get(species).name), params);
      if (level > 0) {
        G.gameTemp.encounterType = null;
        setBattleRule("canLose");
        await WildBattle.start([species, level]);
      }
    }
    return false;
  },
});

/** Asks for a battle side's size (1 to maxVal); 0 if cancelled. */
async function chooseSideSize(message: string, maxVal: number, size: number): Promise<number> {
  const params = new ChooseNumberParams();
  params.setRange(1, maxVal);
  params.setInitialValue(size);
  params.setCancelValue(0);
  return pbMessageChooseNumber(message, params);
}

// v20.1 Hotfixes version: wild Pokémon are generated with pbGenerateWildPokemon.
MenuHandlers.add("debug_menu", "test_wild_battle_advanced", {
  name: "Test Wild Battle Advanced",
  parent: "battle_menu",
  description: "Start a battle against 1 or more wild Pokémon. Battle size is your choice.",
  effect: async () => {
    const pkmn: Pokemon[] = [];
    let size0 = 1;
    let pkmnCmd = 0;
    for (;;) {
      const pkmnCmds: string[] = [];
      for (const p of pkmn) pkmnCmds.push(`${p.name} Lv.${p.level}`);
      pkmnCmds.push(_INTL("[Add Pokémon]"));
      pkmnCmds.push(_INTL("[Set player side size]"));
      pkmnCmds.push(_INTL("[Start {1}v{2} battle]", size0, pkmn.length));
      pkmnCmd = await pbShowCommands(null, pkmnCmds, -1, pkmnCmd);
      if (pkmnCmd < 0) break;
      if (pkmnCmd === pkmnCmds.length - 1) { // Start battle
        if (pkmn.length === 0) {
          await pbMessage(_INTL("No Pokémon were chosen, cannot start battle."));
          continue;
        }
        setBattleRule(`${size0}v${pkmn.length}`);
        setBattleRule("canLose");
        G.gameTemp.encounterType = null;
        await WildBattle.start(pkmn);
        break;
      } else if (pkmnCmd === pkmnCmds.length - 2) { // Set player side size
        if (!pbCanDoubleBattle()) {
          await pbMessage(_INTL("You only have one Pokémon."));
          continue;
        }
        const maxVal = pbCanTripleBattle() ? 3 : 2;
        const newSize = await chooseSideSize(
          _INTL("Choose the number of battlers on the player's side (max. {1}).", maxVal), maxVal, size0,
        );
        if (newSize > 0) size0 = newSize;
      } else if (pkmnCmd === pkmnCmds.length - 3) { // Add Pokémon
        const species = await pbChooseSpeciesList();
        if (species) {
          const params = new ChooseNumberParams();
          params.setRange(1, GameData.GrowthRate.maxLevel());
          params.setInitialValue(5);
          params.setCancelValue(0);
          const level = await pbMessageChooseNumber(_INTL("Set the wild {1}'s level.",
            GameData.Species.get(species).name), params);
          if (level > 0) pkmn.push(pbGenerateWildPokemon(species, level));
        }
      } else { // Edit a Pokémon
        if (await pbConfirmMessage(_INTL("Change this Pokémon?"))) {
          const scr = new PokemonDebugPartyScreen();
          await scr.pbPokemonDebug(pkmn[pkmnCmd]!, -1, null, true);
          scr.pbEndScreen();
        } else if (await pbConfirmMessage(_INTL("Delete this Pokémon?"))) {
          pkmn.splice(pkmnCmd, 1);
        }
      }
    }
    return false;
  },
});

/** pbListScreen(..., TrainerBattleLister) result: [trainer type, name, version]. */
type TrainerListEntry = [Id, string, number];

MenuHandlers.add("debug_menu", "test_trainer_battle", {
  name: "Test Trainer Battle",
  parent: "battle_menu",
  description: "Start a single battle against a trainer of your choice.",
  effect: async () => {
    const trainerdata = (await pbListScreen(_INTL("SINGLE TRAINER"), new TrainerBattleLister(0, false))) as TrainerListEntry | null;
    if (trainerdata) {
      setBattleRule("canLose");
      await TrainerBattle.start([trainerdata[0], trainerdata[1], trainerdata[2]]);
    }
    return false;
  },
});

// v20.1 Hotfixes version: :on_trainer_load runs on the chosen trainers.
MenuHandlers.add("debug_menu", "test_trainer_battle_advanced", {
  name: "Test Trainer Battle Advanced",
  parent: "battle_menu",
  description: "Start a battle against 1 or more trainers with a battle size of your choice.",
  effect: async () => {
    const trainers: [number, NPCTrainer][] = [];
    let size0 = 1;
    let size1 = 1;
    let trainerCmd = 0;
    for (;;) {
      const trainerCmds: string[] = [];
      for (const t of trainers) trainerCmds.push(`${t[1].fullName()} x${t[1].partyCount()}`);
      trainerCmds.push(_INTL("[Add trainer]"));
      trainerCmds.push(_INTL("[Set player side size]"));
      trainerCmds.push(_INTL("[Set opponent side size]"));
      trainerCmds.push(_INTL("[Start {1}v{2} battle]", size0, size1));
      trainerCmd = await pbShowCommands(null, trainerCmds, -1, trainerCmd);
      if (trainerCmd < 0) break;
      if (trainerCmd === trainerCmds.length - 1) { // Start battle
        if (trainers.length === 0) {
          await pbMessage(_INTL("No trainers were chosen, cannot start battle."));
          continue;
        } else if (size1 < trainers.length) {
          await pbMessage(_INTL("Opposing side size is invalid. It should be at least {1}.", trainers.length));
          continue;
        } else if (size1 > trainers.length && trainers[0]![1].partyCount() === 1) {
          await pbMessage(
            _INTL("Opposing side size cannot be {1}, as that requires the first trainer to have 2 or more Pokémon, which they don't.",
              size1),
          );
          continue;
        }
        setBattleRule(`${size0}v${size1}`);
        setBattleRule("canLose");
        const battleArgs: NPCTrainer[] = [];
        for (const t of trainers) battleArgs.push(t[1]);
        await TrainerBattle.start(battleArgs);
        break;
      } else if (trainerCmd === trainerCmds.length - 2) { // Set opponent side size
        if (trainers.length === 0 || (trainers.length === 1 && trainers[0]![1].partyCount() === 1)) {
          await pbMessage(_INTL("No trainers were chosen or trainer only has one Pokémon."));
          continue;
        }
        let maxVal = 2;
        if (trainers.length >= 3 ||
            (trainers.length === 2 && trainers[0]![1].partyCount() >= 2) ||
            trainers[0]![1].partyCount() >= 3) maxVal = 3;
        const newSize = await chooseSideSize(
          _INTL("Choose the number of battlers on the opponent's side (max. {1}).", maxVal), maxVal, size1,
        );
        if (newSize > 0) size1 = newSize;
      } else if (trainerCmd === trainerCmds.length - 3) { // Set player side size
        if (!pbCanDoubleBattle()) {
          await pbMessage(_INTL("You only have one Pokémon."));
          continue;
        }
        const maxVal = pbCanTripleBattle() ? 3 : 2;
        const newSize = await chooseSideSize(
          _INTL("Choose the number of battlers on the player's side (max. {1}).", maxVal), maxVal, size0,
        );
        if (newSize > 0) size0 = newSize;
      } else if (trainerCmd === trainerCmds.length - 4) { // Add trainer
        const trainerdata = (await pbListScreen(_INTL("CHOOSE A TRAINER"), new TrainerBattleLister(0, false))) as TrainerListEntry | null;
        if (trainerdata) {
          const tr = pbLoadTrainer(trainerdata[0], trainerdata[1], trainerdata[2]);
          EventHandlers.triggerSync("on_trainer_load", tr);
          trainers.push([0, tr!]);
        }
      } else { // Edit a trainer
        if (await pbConfirmMessage(_INTL("Change this trainer?"))) {
          const trainerdata = (await pbListScreen(_INTL("CHOOSE A TRAINER"),
            new TrainerBattleLister(trainers[trainerCmd]![0], false))) as TrainerListEntry | null;
          if (trainerdata) {
            const tr = pbLoadTrainer(trainerdata[0], trainerdata[1], trainerdata[2]);
            EventHandlers.triggerSync("on_trainer_load", tr);
            trainers[trainerCmd] = [0, tr!];
          }
        } else if (await pbConfirmMessage(_INTL("Delete this trainer?"))) {
          trainers.splice(trainerCmd, 1);
        }
      }
    }
    return false;
  },
});

MenuHandlers.add("debug_menu", "toggle_logging", {
  name: "Toggle Battle Logging",
  parent: "battle_menu",
  description: "Record debug logs for battles in Data/debuglog.txt.",
  effect: async () => {
    DebugFlags.internal = !DebugFlags.internal;
    PBDebug.sink = DebugFlags.internal ? (msg) => console.log(msg) : null;
    if (DebugFlags.internal) await pbMessage(_INTL("Debug logs for battles will be made in the Data folder."));
    if (!DebugFlags.internal) await pbMessage(_INTL("Debug logs for battles will not be made."));
  },
});

MenuHandlers.add("debug_menu", "reset_trainers", {
  name: "Reset Map's Trainers",
  parent: "battle_menu",
  description: "Turn off Self Switches A and B for all events with \"Trainer\" in their name.",
  effect: async () => {
    if (G.gameMap) {
      for (const event of gameMap().events.values()) {
        if (/trainer/i.test(event.name)) {
          G.gameSelfSwitches.set(gameMap().mapId, event.id, "A", false);
          G.gameSelfSwitches.set(gameMap().mapId, event.id, "B", false);
        }
      }
      gameMap().needRefresh = true;
      await pbMessage(_INTL("All Trainers on this map were reset."));
    } else {
      await pbMessage(_INTL("This command can't be used here."));
    }
  },
});

MenuHandlers.add("debug_menu", "ready_rematches", {
  name: "Ready All Phone Rematches",
  parent: "battle_menu",
  description: "Make all trainers in the phone ready for rematches.",
  effect: async () => {
    const numbers = pokemonGlobal().phoneNumbers;
    if (!numbers || numbers.length === 0) {
      await pbMessage(_INTL("There are no trainers in the Phone."));
    } else {
      for (const i of numbers) {
        if (i.length !== 8) continue; // Isn't a trainer with an event
        i[4] = 2;
        pbSetReadyToBattle(i);
      }
      await pbMessage(_INTL("All trainers in the Phone are now ready to rebattle."));
    }
  },
});

MenuHandlers.add("debug_menu", "roamers", {
  name: "Roaming Pokémon",
  parent: "battle_menu",
  description: "Toggle and edit all roaming Pokémon.",
  effect: async () => {
    await pbDebugRoamers();
  },
});

MenuHandlers.add("debug_menu", "encounter_version", {
  name: "Set Encounters Version",
  parent: "battle_menu",
  description: "Choose which version of wild encounters should be used.",
  effect: async () => {
    const params = new ChooseNumberParams();
    params.setRange(0, 99);
    params.setInitialValue(pokemonGlobal().encounterVersion ?? 0);
    params.setCancelValue(-1);
    const value = await pbMessageChooseNumber(_INTL("Set encounters version to which value?"), params);
    if (value >= 0) setEncounterVersion(value);
  },
});

/** PokemonGlobalMetadata#encounter_version= (012_Overworld/002_Overworld_Metadata.rb:110) */
function setEncounterVersion(value: number): void {
  if ((pokemonGlobal().encounterVersion ?? 0) === value) return;
  pokemonGlobal().encounterVersion = value;
  const encounters = (G as unknown as { pokemonEncounters?: { setup(mapId: number): void } }).pokemonEncounters;
  if (encounters && G.gameMap) encounters.setup(G.gameMap.mapId);
}

//===============================================================================
// Item options
//===============================================================================
MenuHandlers.add("debug_menu", "items_menu", {
  name: "Item Options...",
  parent: "main",
  description: "Give and take items.",
  always_show: false,
});

MenuHandlers.add("debug_menu", "add_item", {
  name: "Add Item",
  parent: "items_menu",
  description: "Choose an item and a quantity of it to add to the Bag.",
  effect: async () => {
    await pbListScreenBlock(_INTL("ADD ITEM"), new ItemLister(), async (button: number, item: unknown) => {
      if (button === Input.USE && item) {
        const params = new ChooseNumberParams();
        params.setRange(1, Settings.BAG_MAX_PER_SLOT);
        params.setInitialValue(1);
        params.setCancelValue(0);
        const qty = await pbMessageChooseNumber(_INTL("Add how many {1}?",
          GameData.Item.get(item as Id).namePlural), params);
        if (qty > 0) {
          G.bag.add(item as Id, qty);
          await pbMessage(_INTL("Gave {1}x {2}.", qty, GameData.Item.get(item as Id).name));
        }
      }
    });
  },
});

/** The Fill Bag option's effect once the quantity is chosen. */
export function debugFillBag(qty: number): void {
  G.bag.clear();
  // NOTE: This doesn't simply use $bag.add for every item in turn, because
  //       that's really slow when done in bulk.
  const pocketSizes = Settings.BAG_MAX_POCKET_SIZE;
  const bag = G.bag.pockets; // Called here so that it only rearranges itself once
  for (const i of GameData.Item.each()) {
    const size = pocketSizes[i.pocket - 1];
    if (size === undefined || size === null || size === 0) continue;
    if (size > 0 && bag[i.pocket]!.length >= size) continue;
    const itemQty = i.isImportant() ? 1 : qty;
    bag[i.pocket]!.push([i.id, itemQty]);
  }
  // NOTE: Auto-sorting pockets don't need to be sorted afterwards, because
  //       items are added in the same order they would be sorted into.
}

MenuHandlers.add("debug_menu", "fill_bag", {
  name: "Fill Bag",
  parent: "items_menu",
  description: "Empties the Bag and then fills it with a certain number of every item.",
  effect: async () => {
    const params = new ChooseNumberParams();
    params.setRange(1, Settings.BAG_MAX_PER_SLOT);
    params.setInitialValue(1);
    params.setCancelValue(0);
    const qty = await pbMessageChooseNumber(_INTL("Choose the number of items."), params);
    if (qty > 0) {
      debugFillBag(qty);
      await pbMessage(_INTL("The Bag was filled with {1} of each item.", qty));
    }
  },
});

MenuHandlers.add("debug_menu", "empty_bag", {
  name: "Empty Bag",
  parent: "items_menu",
  description: "Remove all items from the Bag.",
  effect: async () => {
    G.bag.clear();
    await pbMessage(_INTL("The Bag was cleared."));
  },
});

//===============================================================================
// Pokémon options
//===============================================================================
MenuHandlers.add("debug_menu", "pokemon_menu", {
  name: "Pokémon Options...",
  parent: "main",
  description: "Give Pokémon, heal party, fill/empty PC storage, etc.",
  always_show: false,
});

MenuHandlers.add("debug_menu", "add_pokemon", {
  name: "Add Pokémon",
  parent: "pokemon_menu",
  description: "Give yourself a Pokémon of a chosen species/level. Goes to PC if party is full.",
  effect: async () => {
    const species = await pbChooseSpeciesList();
    if (species) {
      const params = new ChooseNumberParams();
      params.setRange(1, GameData.GrowthRate.maxLevel());
      params.setInitialValue(5);
      params.setCancelValue(0);
      const level = await pbMessageChooseNumber(_INTL("Set the Pokémon's level."), params);
      if (level > 0) {
        const goesToParty = !player().partyFull();
        if (pbAddPokemonSilent(species, level)) {
          if (goesToParty) {
            await pbMessage(_INTL("Added {1} to party.", GameData.Species.get(species).name));
          } else {
            await pbMessage(_INTL("Added {1} to Pokémon storage.", GameData.Species.get(species).name));
          }
        } else {
          await pbMessage(_INTL("Couldn't add Pokémon because party and storage are full."));
        }
      }
    }
  },
});

/** The Give Demo Party option's effect, before its message. */
export function debugGiveDemoParty(): void {
  const party: Id[] = [];
  const species: Id[] = ["PIKACHU", "PIDGEOTTO", "KADABRA", "GYARADOS", "DIGLETT", "CHANSEY"];
  for (const id of species) {
    if (GameData.Species.exists(id)) party.push(id);
  }
  player().party.length = 0;
  // Generate Pokémon of each species at level 20
  for (const sp of party) {
    const pkmn = new Pokemon(sp, 20);
    player().party.push(pkmn);
    player().pokedex.register(pkmn);
    player().pokedex.setOwned(sp);
    switch (sp) {
      case "PIDGEOTTO":
        pkmn.learnMove("FLY");
        break;
      case "KADABRA":
        pkmn.learnMove("FLASH");
        pkmn.learnMove("TELEPORT");
        break;
      case "GYARADOS":
        pkmn.learnMove("SURF");
        pkmn.learnMove("DIVE");
        pkmn.learnMove("WATERFALL");
        break;
      case "DIGLETT":
        pkmn.learnMove("DIG");
        pkmn.learnMove("CUT");
        pkmn.learnMove("HEADBUTT");
        pkmn.learnMove("ROCKSMASH");
        break;
      case "CHANSEY":
        pkmn.learnMove("SOFTBOILED");
        pkmn.learnMove("STRENGTH");
        pkmn.learnMove("SWEETSCENT");
        break;
    }
    pkmn.recordFirstMoves();
  }
}

MenuHandlers.add("debug_menu", "give_demo_party", {
  name: "Give Demo Party",
  parent: "pokemon_menu",
  description: "Give yourself 6 preset Pokémon. They overwrite the current party.",
  effect: async () => {
    debugGiveDemoParty();
    await pbMessage(_INTL("Filled party with demo Pokémon."));
  },
});

MenuHandlers.add("debug_menu", "heal_party", {
  name: "Heal Party",
  parent: "pokemon_menu",
  description: "Fully heal the HP/status/PP of all Pokémon in the party.",
  effect: async () => {
    for (const pkmn of player().party) pkmn.heal();
    await pbMessage(_INTL("Your Pokémon were fully healed."));
  },
});

MenuHandlers.add("debug_menu", "quick_hatch_party_eggs", {
  name: "Quick Hatch",
  parent: "pokemon_menu",
  description: "Make all eggs in the party require just one more step to hatch.",
  effect: async () => {
    for (const pkmn of player().party) if (pkmn.egg()) pkmn.stepsToHatch = 1;
    await pbMessage(_INTL("All eggs in your party now require one step to hatch."));
  },
});

/**
 * The Fill Storage Boxes option's effect (Essentials Deluxe's version: every
 * shiny value 0-2 is registered as seen); returns whether every species fit.
 */
export function debugFillBoxes(): boolean {
  let added = 0;
  const boxQty = G.storage.maxPokemon(0);
  let completed = true;
  const dex = player().pokedex;
  for (const speciesData of GameData.Species.each()) {
    const sp = speciesData.species;
    const f = speciesData.form;
    if (f === 0) {
      if (speciesData.singleGendered()) {
        const g = speciesData.genderRatio === "AlwaysFemale" ? 1 : 0;
        for (let shiny = 0; shiny <= 2; shiny++) dex.register(sp, g, f, shiny, false);
      } else {
        for (let g = 0; g < 2; g++) {
          for (let shiny = 0; shiny <= 2; shiny++) dex.register(sp, g, f, shiny, false);
        }
      }
      dex.setOwned(sp, false);
    } else if (speciesData.realFormName && speciesData.realFormName !== "") {
      const g = speciesData.genderRatio === "AlwaysFemale" ? 1 : 0;
      for (let shiny = 0; shiny <= 2; shiny++) dex.register(sp, g, f, shiny, false);
    }
    if (f !== 0) continue;
    if (added >= Settings.NUM_STORAGE_BOXES * boxQty) {
      completed = false;
      continue;
    }
    added += 1;
    G.storage.set(Math.floor((added - 1) / boxQty), (added - 1) % boxQty, new Pokemon(sp, 50));
  }
  dex.refreshAccessibleDexes();
  return completed;
}

// Essentials Deluxe version (Debug.rb:94).
MenuHandlers.add("debug_menu", "fill_boxes", {
  name: "Fill Storage Boxes",
  parent: "pokemon_menu",
  description: "Add one Pokémon of each species (at Level 50) to storage.",
  effect: async () => {
    const boxQty = G.storage.maxPokemon(0);
    const completed = debugFillBoxes();
    await pbMessage(_INTL("Storage boxes were filled with one Pokémon of each species."));
    if (!completed) {
      await pbMessage(_INTL("Note: The number of storage spaces ({1} boxes of {2}) is less than the number of species.",
        Settings.NUM_STORAGE_BOXES, boxQty));
    }
  },
});

/** The Clear Storage Boxes option's effect. */
export function debugClearBoxes(): void {
  for (let i = 0; i < G.storage.maxBoxes(); i++) {
    for (let j = 0; j < G.storage.maxPokemon(i); j++) G.storage.set(i, j, null);
  }
}

MenuHandlers.add("debug_menu", "clear_boxes", {
  name: "Clear Storage Boxes",
  parent: "pokemon_menu",
  description: "Remove all Pokémon in storage.",
  effect: async () => {
    debugClearBoxes();
    await pbMessage(_INTL("The storage boxes were cleared."));
  },
});

MenuHandlers.add("debug_menu", "open_storage", {
  name: "Access Pokémon Storage",
  parent: "pokemon_menu",
  description: "Opens the Pokémon storage boxes in Organize Boxes mode.",
  effect: async () => {
    await pbFadeOutIn(async () => {
      const scene = new PokemonStorageScene();
      const screen = new PokemonStorageScreen(scene, G.storage);
      await screen.pbStartScreen(0);
    });
  },
});

//===============================================================================
// Player options
//===============================================================================
MenuHandlers.add("debug_menu", "player_menu", {
  name: "Player Options...",
  parent: "main",
  description: "Set money, badges, Pokédexes, player's appearance and name, etc.",
  always_show: false,
});

/** The Set Badges list: "Give all", "Remove all", then the 24 badges. */
export function debugBadgeCommands(): string[] {
  const badgecmds: string[] = [];
  badgecmds.push(_INTL("Give all"));
  badgecmds.push(_INTL("Remove all"));
  for (let i = 0; i < 24; i++) {
    badgecmds.push(_INTL("{1} Badge {2}", player().badges[i] ? "[Y]" : "[  ]", i + 1));
  }
  return badgecmds;
}

/** What choosing `badgecmd` in the Set Badges list does. */
export function debugSetBadge(badgecmd: number): void {
  switch (badgecmd) {
    case 0: // Give all
      for (let i = 0; i < 24; i++) player().badges[i] = true;
      break;
    case 1: // Remove all
      for (let i = 0; i < 24; i++) player().badges[i] = false;
      break;
    default:
      player().badges[badgecmd - 2] = !player().badges[badgecmd - 2];
  }
}

MenuHandlers.add("debug_menu", "set_badges", {
  name: "Set Badges",
  parent: "player_menu",
  description: "Toggle possession of each Gym Badge.",
  effect: async () => {
    let badgecmd = 0;
    for (;;) {
      badgecmd = await pbShowCommands(null, debugBadgeCommands(), -1, badgecmd);
      if (badgecmd < 0) break;
      debugSetBadge(badgecmd);
    }
  },
});

MenuHandlers.add("debug_menu", "set_money", {
  name: "Set Money",
  parent: "player_menu",
  description: "Edit how much money you have.",
  effect: async () => {
    const params = new ChooseNumberParams();
    params.setRange(0, Settings.MAX_MONEY);
    params.setDefaultValue(player().money);
    player().money = await pbMessageChooseNumber(_INTL("Set the player's money."), params);
    await pbMessage(_INTL("You now have ${1}.", toSFormatted(player().money)));
  },
});

MenuHandlers.add("debug_menu", "set_coins", {
  name: "Set Coins",
  parent: "player_menu",
  description: "Edit how many Game Corner Coins you have.",
  effect: async () => {
    const params = new ChooseNumberParams();
    params.setRange(0, Settings.MAX_COINS);
    params.setDefaultValue(player().coins);
    player().coins = await pbMessageChooseNumber(_INTL("Set the player's Coin amount."), params);
    await pbMessage(_INTL("You now have {1} Coins.", toSFormatted(player().coins)));
  },
});

MenuHandlers.add("debug_menu", "set_bp", {
  name: "Set Battle Points",
  parent: "player_menu",
  description: "Edit how many Battle Points you have.",
  effect: async () => {
    const params = new ChooseNumberParams();
    params.setRange(0, Settings.MAX_BATTLE_POINTS);
    params.setDefaultValue(player().battlePoints);
    player().battlePoints = await pbMessageChooseNumber(_INTL("Set the player's BP amount."), params);
    await pbMessage(_INTL("You now have {1} BP.", toSFormatted(player().battlePoints)));
  },
});

MenuHandlers.add("debug_menu", "toggle_running_shoes", {
  name: "Toggle Running Shoes",
  parent: "player_menu",
  description: "Toggle possession of running shoes.",
  effect: async () => {
    player().hasRunningShoes = !player().hasRunningShoes;
    if (player().hasRunningShoes) await pbMessage(_INTL("Gave Running Shoes."));
    if (!player().hasRunningShoes) await pbMessage(_INTL("Lost Running Shoes."));
  },
});

MenuHandlers.add("debug_menu", "toggle_pokegear", {
  name: "Toggle Pokégear",
  parent: "player_menu",
  description: "Toggle possession of the Pokégear.",
  effect: async () => {
    player().hasPokegear = !player().hasPokegear;
    if (player().hasPokegear) await pbMessage(_INTL("Gave Pokégear."));
    if (!player().hasPokegear) await pbMessage(_INTL("Lost Pokégear."));
  },
});

/** The Toggle Pokédex and Dexes list: "Have Pokédex", then each Dex. */
export function debugDexCommands(): string[] {
  const dexescmds: string[] = [];
  dexescmds.push(_INTL("Have Pokédex: {1}", player().hasPokedex ? "[YES]" : "[NO]"));
  const dexNames = Settings.pokedexNames();
  for (let i = 0; i < dexNames.length; i++) {
    const entry = dexNames[i]!;
    const name = Array.isArray(entry) ? entry[0] : entry;
    const unlocked = player().pokedex.unlocked(i);
    dexescmds.push(_INTL("{1} {2}", unlocked ? "[Y]" : "[  ]", name));
  }
  return dexescmds;
}

/** What choosing `dexescmd` in the Toggle Pokédex and Dexes list does. */
export function debugToggleDex(dexescmd: number): void {
  const dexindex = dexescmd - 1;
  if (dexindex < 0) { // Toggle Pokédex ownership
    player().hasPokedex = !player().hasPokedex;
  } else if (player().pokedex.unlocked(dexindex)) { // Toggle Regional Dex accessibility
    player().pokedex.lock(dexindex);
  } else {
    player().pokedex.unlock(dexindex);
  }
}

MenuHandlers.add("debug_menu", "toggle_pokedex", {
  name: "Toggle Pokédex and Dexes",
  parent: "player_menu",
  description: "Toggle possession of the Pokédex, and edit Regional Dex accessibility.",
  effect: async () => {
    let dexescmd = 0;
    for (;;) {
      dexescmd = await pbShowCommands(null, debugDexCommands(), -1, dexescmd);
      if (dexescmd < 0) break;
      debugToggleDex(dexescmd);
    }
  },
});

MenuHandlers.add("debug_menu", "toggle_box_link", {
  name: "Toggle Pokémon Box Link's Effect",
  parent: "player_menu",
  description: "Toggle Box Link's effect of accessing Pokémon storage via the party screen.",
  effect: async () => {
    player().hasBoxLink = !player().hasBoxLink;
    if (player().hasBoxLink) await pbMessage(_INTL("Enabled Pokémon Box Link's effect."));
    if (!player().hasBoxLink) await pbMessage(_INTL("Disabled Pokémon Box Link's effect."));
  },
});

MenuHandlers.add("debug_menu", "toggle_exp_all", {
  name: "Toggle Exp. All's Effect",
  parent: "player_menu",
  description: "Toggle Exp. All's effect of giving Exp. to non-participants.",
  effect: async () => {
    player().hasExpAll = !player().hasExpAll;
    if (player().hasExpAll) await pbMessage(_INTL("Enabled Exp. All's effect."));
    if (!player().hasExpAll) await pbMessage(_INTL("Disabled Exp. All's effect."));
  },
});

MenuHandlers.add("debug_menu", "set_player_character", {
  name: "Set Player Character",
  parent: "player_menu",
  description: "Edit the player's character, as defined in \"metadata.txt\".",
  effect: async () => {
    let index = 0;
    const cmds: string[] = [];
    const ids: number[] = [];
    for (const p of GameData.PlayerMetadata.each()) {
      if (p.id === player().characterID) index = cmds.length;
      cmds.push(String(p.id));
      ids.push(p.id);
    }
    if (cmds.length === 1) {
      await pbMessage(_INTL("There is only one player character defined."));
      // NOTE (Ruby parity): `break` inside a proc raises LocalJumpError
      // (002_Debug_MenuCommands.rb:842).
      throw new Error("break from proc-closure (LocalJumpError)");
    }
    const cmd = await pbShowCommands(null, cmds, -1, index);
    if (cmd >= 0 && cmd !== index) {
      pbChangePlayer(ids[cmd]!);
      await pbMessage(_INTL("The player character was changed."));
    }
  },
});

MenuHandlers.add("debug_menu", "change_outfit", {
  name: "Set Player Outfit",
  parent: "player_menu",
  description: "Edit the player's outfit number.",
  effect: async () => {
    const oldoutfit = player().outfit;
    const params = new ChooseNumberParams();
    params.setRange(0, 99);
    params.setDefaultValue(oldoutfit);
    player().outfit = await pbMessageChooseNumber(_INTL("Set the player's outfit."), params);
    if (player().outfit !== oldoutfit) await pbMessage(_INTL("Player's outfit was changed."));
  },
});

MenuHandlers.add("debug_menu", "rename_player", {
  name: "Set Player Name",
  parent: "player_menu",
  description: "Rename the player.",
  effect: async () => {
    let trname: string | null = await pbEnterPlayerName("Your name?", 0, Settings.MAX_PLAYER_NAME_SIZE, player().name);
    if (nilOrEmpty(trname) && (await pbConfirmMessage(_INTL("Give yourself a default name?")))) {
      const trainertype = player().trainerType;
      const gender = GameData.TrainerType.get(trainertype).gender; // pbGetTrainerTypeGender
      trname = pbSuggestTrainerName(gender);
    }
    if (nilOrEmpty(trname)) {
      await pbMessage(_INTL("The player's name remained {1}.", player().name));
    } else {
      player().name = trname!;
      await pbMessage(_INTL("The player's name was changed to {1}.", player().name));
    }
  },
});

MenuHandlers.add("debug_menu", "random_id", {
  name: "Randomize Player ID",
  parent: "player_menu",
  description: "Generate a random new ID for the player.",
  effect: async () => {
    // rand(2**16) | (rand(2**16) << 16), unsigned
    const low = rand(2 ** 16);
    player().id = low + rand(2 ** 16) * 0x10000;
    await pbMessage(_INTL("The player's ID was changed to {1} (full ID: {2}).", player().publicID(), player().id));
  },
});

//===============================================================================
// Information editors
//===============================================================================
MenuHandlers.add("debug_menu", "editors_menu", {
  name: "Information Editors...",
  parent: "main",
  description: "Edit information in the PBS files, terrain tags, battle animations, etc.",
});

MenuHandlers.add("debug_menu", "set_metadata", {
  name: "Edit Metadata",
  parent: "editors_menu",
  description: "Edit global metadata and player character metadata.",
  effect: async () => {
    await openEditorScreen("pbMetadataScreen");
  },
});

MenuHandlers.add("debug_menu", "set_map_metadata", {
  name: "Edit Map Metadata",
  parent: "editors_menu",
  description: "Edit map metadata.",
  effect: async () => {
    await openEditorScreen("pbMapMetadataScreen", pbDefaultMap());
  },
});

MenuHandlers.add("debug_menu", "set_map_connections", {
  name: "Edit Map Connections",
  parent: "editors_menu",
  description: "Connect maps using a visual interface. Can also edit map encounters/metadata.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbConnectionsEditor"));
  },
});

MenuHandlers.add("debug_menu", "set_terrain_tags", {
  name: "Edit Terrain Tags",
  parent: "editors_menu",
  description: "Edit the terrain tags of tiles in tilesets. Required for tags 8+.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbTilesetScreen"));
  },
});

MenuHandlers.add("debug_menu", "set_encounters", {
  name: "Edit Wild Encounters",
  parent: "editors_menu",
  description: "Edit the wild Pokémon that can be found on maps, and how they are encountered.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbEncountersEditor"));
  },
});

MenuHandlers.add("debug_menu", "set_trainer_types", {
  name: "Edit Trainer Types",
  parent: "editors_menu",
  description: "Edit the properties of trainer types.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbTrainerTypeEditor"));
  },
});

MenuHandlers.add("debug_menu", "set_trainers", {
  name: "Edit Individual Trainers",
  parent: "editors_menu",
  description: "Edit individual trainers, their Pokémon and items.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbTrainerBattleEditor"));
  },
});

MenuHandlers.add("debug_menu", "set_items", {
  name: "Edit Items",
  parent: "editors_menu",
  description: "Edit item data.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbItemEditor"));
  },
});

MenuHandlers.add("debug_menu", "set_species", {
  name: "Edit Pokémon Species",
  parent: "editors_menu",
  description: "Edit Pokémon species data.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbPokemonEditor"));
  },
});

MenuHandlers.add("debug_menu", "set_pokedex_lists", {
  name: "Edit Regional Dexes",
  parent: "editors_menu",
  description: "Create, rearrange and delete Regional Pokédex lists.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbRegionalDexEditorMain"));
  },
});

MenuHandlers.add("debug_menu", "position_sprites", {
  name: "Edit Pokémon Sprite Positions",
  parent: "editors_menu",
  description: "Reposition Pokémon sprites in battle.",
  effect: async () => {
    // SpritePositioner.new / SpritePositionerScreen.new(sp).pbStart
    await pbFadeOutIn(() => openEditorScreen("pbSpritePositioner"));
  },
});

MenuHandlers.add("debug_menu", "auto_position_sprites", {
  name: "Auto-Position All Pokémon Sprites",
  parent: "editors_menu",
  description: "Automatically reposition all Pokémon sprites in battle. Don't use lightly.",
  effect: async () => {
    if (await pbConfirmMessage(_INTL("Are you sure you want to reposition all sprites?"))) {
      const msgwindow = pbCreateMessageWindow();
      await pbMessageDisplay(msgwindow, _INTL("Repositioning all sprites. Please wait."), false);
      await Graphics.update();
      await openEditorScreen("pbAutoPositionAll");
      pbDisposeMessageWindow(msgwindow);
    }
  },
});

MenuHandlers.add("debug_menu", "animation_editor", {
  name: "Battle Animation Editor",
  parent: "editors_menu",
  description: "Edit the battle animations.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbAnimationEditor"));
  },
});

MenuHandlers.add("debug_menu", "animation_organiser", {
  name: "Battle Animation Organiser",
  parent: "editors_menu",
  description: "Rearrange/add/delete battle animations.",
  effect: async () => {
    await pbFadeOutIn(() => openEditorScreen("pbAnimationsOrganiser"));
  },
});

MenuHandlers.add("debug_menu", "import_animations", {
  name: "Import All Battle Animations",
  parent: "editors_menu",
  description: "Import all battle animations from the \"Animations\" folder.",
  effect: async () => {
    await pbImportAllAnimations();
  },
});

MenuHandlers.add("debug_menu", "export_animations", {
  name: "Export All Battle Animations",
  parent: "editors_menu",
  description: "Export all battle animations individually to the \"Animations\" folder.",
  effect: async () => {
    await pbExportAllAnimations();
  },
});

//===============================================================================
// Other options
//===============================================================================
MenuHandlers.add("debug_menu", "other_menu", {
  name: "Other Options...",
  parent: "main",
  description: "Mystery Gifts, translations, compile data, etc.",
});

MenuHandlers.add("debug_menu", "mystery_gift", {
  name: "Manage Mystery Gifts",
  parent: "other_menu",
  description: "Edit and enable/disable Mystery Gifts.",
  effect: async () => {
    await openEditorScreen("pbManageMysteryGifts");
  },
});

MenuHandlers.add("debug_menu", "extract_text", {
  name: "Extract Text",
  parent: "other_menu",
  description: "Extract all text in the game to a single file for translating.",
  effect: async () => {
    await pbExtractText();
  },
});

MenuHandlers.add("debug_menu", "compile_text", {
  name: "Compile Text",
  parent: "other_menu",
  description: "Import text and converts it into a language file.",
  effect: async () => {
    await pbCompileTextUI();
  },
});

MenuHandlers.add("debug_menu", "compile_data", {
  name: "Compile Data",
  parent: "other_menu",
  description: "Fully compile all data.",
  effect: async () => {
    const msgwindow = pbCreateMessageWindow();
    // Compiler.compile_all(true): `pnpm pbs` on the dev server, then reload GameData.
    const ok = await devWriteOrExplain("the compiled PBS data", async () => {
      echoln(await DevFiles.compilePbs());
      await GameData.loadAll();
    });
    if (ok) await pbMessageDisplay(msgwindow, _INTL("All game data was compiled."));
    pbDisposeMessageWindow(msgwindow);
  },
});

/** The Create PBS File(s) list and the Compiler.write_* each entry runs. */
export const PBS_FILE_WRITERS: [string, () => Promise<void>][] = [
  [_INTL("[Create all]"), () => Compiler.writeAll()],
  ["abilities.txt", () => Compiler.writeAbilities()],
  ["battle_facility_lists.txt", () => Compiler.writeTrainerLists()],
  ["berry_plants.txt", () => Compiler.writeBerryPlants()],
  ["encounters.txt", () => Compiler.writeEncounters()],
  ["items.txt", () => Compiler.writeItems()],
  ["map_connections.txt", () => Compiler.writeConnections()],
  ["map_metadata.txt", () => Compiler.writeMapMetadata()],
  ["metadata.txt", () => Compiler.writeMetadata()],
  ["moves.txt", () => Compiler.writeMoves()],
  ["phone.txt", () => Compiler.writePhone()],
  ["pokemon.txt", () => Compiler.writePokemon()],
  ["pokemon_forms.txt", () => Compiler.writePokemonForms()],
  ["pokemon_metrics.txt", () => Compiler.writePokemonMetrics()],
  ["regional_dexes.txt", () => Compiler.writeRegionalDexes()],
  ["ribbons.txt", () => Compiler.writeRibbons()],
  ["shadow_pokemon.txt", () => Compiler.writeShadowPokemon()],
  ["town_map.txt", () => Compiler.writeTownMap()],
  ["trainer_types.txt", () => Compiler.writeTrainerTypes()],
  ["trainers.txt", () => Compiler.writeTrainers()],
  ["types.txt", () => Compiler.writeTypes()],
];

MenuHandlers.add("debug_menu", "create_pbs_files", {
  name: "Create PBS File(s)",
  parent: "other_menu",
  description: "Choose one or all PBS files and create it.",
  effect: async () => {
    let cmd = 0;
    const cmds = PBS_FILE_WRITERS.map(([name]) => name);
    for (;;) {
      cmd = await pbShowCommands(null, cmds, -1, cmd);
      const writer = PBS_FILE_WRITERS[cmd];
      if (cmd < 0 || !writer) break;
      if (await devWriteOrExplain(cmd === 0 ? "the PBS files" : `PBS/${writer[0]}`, writer[1])) {
        await pbMessage(_INTL("File written."));
      }
    }
  },
});

MenuHandlers.add("debug_menu", "fix_invalid_tiles", {
  name: "Fix Invalid Tiles",
  parent: "other_menu",
  description: "Scans all maps and erases non-existent tiles.",
  effect: async () => {
    await pbDebugFixInvalidTiles();
  },
});

MenuHandlers.add("debug_menu", "rename_files", {
  name: "Rename Outdated Files",
  parent: "other_menu",
  description: "Check for files with outdated names and rename/move them. Can alter map data.",
  effect: async () => {
    if (await pbConfirmMessage(_INTL("Are you sure you want to automatically rename outdated files?"))) {
      if (await devWriteOrExplain("the renamed files", () => FilenameUpdater.renameFiles())) {
        await pbMessage(_INTL("Done."));
      }
    }
  },
});

MenuHandlers.add("debug_menu", "reload_system_cache", {
  name: "Reload System Cache",
  parent: "other_menu",
  description: "Refreshes the system's file cache. Use if you change a file while playing.",
  effect: async () => {
    // System.reload_cache: re-reads the dev server's asset index (assetExists, pbResolveBitmap).
    await loadAssetIndex();
    await pbMessage(_INTL("Done."));
  },
});

//===============================================================================
// Essentials Deluxe ([000] Essentials Patches/Debug.rb): general debug menus.
//===============================================================================
MenuHandlers.add("debug_menu", "dx_menu", {
  name: "Deluxe Plugins...",
  parent: "main",
  description: "Edit settings related to various plugins that utilize Essentials Deluxe.",
  always_show: false,
});

MenuHandlers.add("debug_menu", "deluxe_menu", {
  name: "Essentials Deluxe...",
  parent: "dx_menu",
  description: "Edit settings related to the Essentials Deluxe plugin.",
});

MenuHandlers.add("debug_menu", "debug_mega", {
  name: "Toggle Switch",
  parent: "deluxe_menu",
  description: "Toggles the availability of Mega Evolution functionality.",
  effect: async () => {
    G.gameSwitches.set(Settings.NO_MEGA_EVOLUTION, !G.gameSwitches.get(Settings.NO_MEGA_EVOLUTION));
    const toggle = G.gameSwitches.get(Settings.NO_MEGA_EVOLUTION) ? "disabled" : "enabled";
    await pbMessage(_INTL("Mega Evolution {1}.", toggle));
  },
});

MenuHandlers.add("debug_menu", "debug_birthday", {
  name: "Set Player's Birthday",
  parent: "deluxe_menu",
  description: "Sets the month and day of the player's birthday.",
  effect: async () => {
    await pbSetPlayerBirthday();
    const day = player().birthdate.getDate();
    const month = pbGetMonthName(player().birthdate.getMonth() + 1);
    await pbMessage(_INTL("The player's birthdate was set to {1} {2}.", month, day));
  },
});

/**
 * pbSetPlayerBirthday (Essentials Deluxe, [000] Essentials Patches/Trainer
 * Data.rb:27). Not ported with the rest of that file yet; only this menu uses it.
 */
export async function pbSetPlayerBirthday(): Promise<void> {
  const months: string[] = [];
  let mon = 1;
  let day = 1;
  for (let i = 0; i < 12; i++) months.push(_INTL("{1}", pbGetMonthName(i + 1)));
  for (;;) {
    mon = (await pbMessage(_INTL("Which month is your birthday in?"), months)) + 1;
    const maxval = [4, 6, 9, 11].includes(mon) ? 30 : mon === 2 ? 28 : 31;
    const params = new ChooseNumberParams();
    params.setRange(1, maxval);
    params.setInitialValue(1);
    params.setCancelValue(1);
    day = await pbMessageChooseNumber(_INTL("Which day in {1} is your birthday?", pbGetMonthName(mon)), params);
    let suffix: string;
    switch (String(day).slice(-1)) {
      case "1": suffix = day !== 11 ? "st" : "th"; break;
      case "2": suffix = day !== 12 ? "nd" : "th"; break;
      case "3": suffix = day !== 13 ? "rd" : "th"; break;
      default: suffix = "th";
    }
    if (await pbConfirmMessage(_INTL("So, your birthday is {1} {2}{3}, correct?", pbGetMonthName(mon), day, suffix))) break;
  }
  player().setBirthdate(day, mon);
}
