// Functions for the event Script commands the importer couldn't translate
// (see data/reports/conversion.json): where a snippet is more than calls and
// assignments (loops over the party, blocks), the event calls one of these,
// named after what the snippet does; each quotes the Ruby it replaces. Also
// here: Essentials/plugin functions and constants events call that weren't
// registered elsewhere.

import { Data } from "../../data/store";
import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { PBDebug } from "../../battle/other/PBDebug";
import { pbFadeOutIn } from "../../ui/fades";
import { _INTL } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import { pbRelearnMoveScreen } from "../../ui/party/moveRelearner";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../../ui/pokedex/pokedexEntry";
import { pbEnterText } from "../../ui/textEntry/UI_TextEntry";
import { HallOfFame_Scene, HallOfFameScreen } from "../../ui/hallOfFame/HallOfFame";
import { PokemonLoad_Scene, PokemonLoadScreen } from "../../ui/load/loadScreen";
import { PokemonPartnerTrainerCard_Scene, PokemonPartnerTrainerCardScreen } from "../../ui/trainerCard/partnerTrainerCard";
import { Audio } from "../../rgss/Audio";
import { Graphics } from "../../rgss/Graphics";
import { pbGetTimeNow } from "../dayNight";
import { VisibleDayCarOWSettings } from "../daycare/DayCareOverworld";
import { GamePokeEvent } from "../encounters/visibleEncounters";
import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { pbPlayDecisionSE, pbSEPlay, type AudioParam } from "../GameSystem";
import { startsWithVowel } from "../items/itemUtilities";
import { Pokemon } from "../pokemon/Pokemon";
import { pbAddPokemonSilent } from "../pokemon/utilities";
import { pbSetPokemonCenter } from "./fieldMoves";
import { playerQuests } from "../quests";
import { defineScript } from "../scriptApi";
import { SPEEDUP_STAGES, SpeedUp } from "../speedUp";
import type { Player } from "../trainer/Player";
import { _ISPRINTF, _MAPINTL, pbGetMessage, pbGetMessageFromHash } from "../../core/intl";

const player = () => G.player as unknown as Player;

//===============================================================================
// Essentials / plugin functions and constants
//===============================================================================
// pbFadeOutIn(99999) {} (an empty block: fade out and straight back in).
defineScript("pbFadeOutIn", (_c, z, nofadeout) => pbFadeOutIn(() => {}, z == null ? 99999 : Number(z), !!nofadeout));
defineScript("GameData::Species.get", (_c, id) => Species.get(id as Id));
defineScript("GameData::Item.get", (_c, id) => Item.get(id as Id));
defineScript("Pokemon::MAX_NAME_SIZE", () => Pokemon.MAX_NAME_SIZE);
defineScript("Settings::MAX_COINS", () => Settings.MAX_COINS);
defineScript("VisibleDayCarOWSettings::DAY_CARE_OW_MAP", () => VisibleDayCarOWSettings.DAY_CARE_OW_MAP);
defineScript("pbSEPlay", (_c, param, volume, pitch) => pbSEPlay(param as AudioParam, volume as number | undefined, pitch as number | undefined));
defineScript("pbPlayDecisionSE", () => pbPlayDecisionSE());
defineScript("pbRelearnMoveScreen", (_c, pkmn) => pbRelearnMoveScreen(pkmn as Pokemon));
// The compiler's SCRIPT_REPLACEMENTS drop "Kernel."; Essentials' own scripts call Kernel.pbShowCommands.
defineScript("Kernel.pbSetPokemonCenter", () => pbSetPokemonCenter());

/** _I(str, *arg) (001_Technical/003_Intl_Messages.rb): _MAPINTL for the current map. */
defineScript("_I", (_c, str, ...args) => _MAPINTL(G.gameMap?.mapId ?? 0, String(str), ...args));
defineScript("_MAPINTL", (_c, mapId, str, ...args) => _MAPINTL(Number(mapId), String(str), ...args));
defineScript("_ISPRINTF", (_c, str, ...args) => _ISPRINTF(String(str), ...args));
defineScript("pbGetMessage", (_c, type, id) => pbGetMessage(Number(type), Number(id)));
defineScript("pbGetMessageFromHash", (_c, type, key) => pbGetMessageFromHash(Number(type), String(key)));

/** pbTextEntry(helptext, minlength, maxlength, variableNumber) (019_Utilities/001_Utilities.rb) */
defineScript("pbTextEntry", async (_c, helptext, minlength, maxlength, variableNumber) => {
  G.gameVariables.set(Number(variableNumber), await pbEnterText(String(helptext), Number(minlength), Number(maxlength)));
  if (G.gameMap) (G.gameMap as unknown as GameMap).needRefresh = true;
});

// Pokemon Silver Chronicles Helpers (Utils.rb): MQS quest checks events use.
/** isQuestActive?(quest): whether the quest was ever started (active, completed or failed). */
export function isQuestActive(quest: string): boolean {
  const q = playerQuests();
  return [q.activeQuests, q.completedQuests, q.failedQuests].some((list) => list.some((x) => x.id === quest));
}
defineScript("isQuestActive?", (_c, quest) => isQuestActive(String(quest)));
defineScript("isQuestActiveOnly?", (_c, quest) => playerQuests().activeQuests.some((x) => x.id === quest));
defineScript("isQuestComplete?", (_c, quest) => playerQuests().completedQuests.some((x) => x.id === quest));
defineScript("isQuestFail?", (_c, quest) => playerQuests().failedQuests.some((x) => x.id === quest));

// $PokemonGlobal.encounter_version (012_Overworld/002_Overworld_Metadata.rb):
// changing it sets up the current map's encounters again.
defineScript("$PokemonGlobal.encounter_version", () => (G.pokemonGlobal as { encounterVersion?: number }).encounterVersion ?? 0);
defineScript("$PokemonGlobal.encounter_version=", (_c, value) => {
  const global = G.pokemonGlobal as { encounterVersion?: number };
  if ((global.encounterVersion ?? 0) === value) return;
  global.encounterVersion = Number(value);
  const encounters = (G as unknown as { pokemonEncounters?: { setup(mapId: number): void } | null }).pokemonEncounters;
  if (encounters && G.gameMap) encounters.setup(G.gameMap.mapId);
});

// RGSS's Audio module.
defineScript("Audio.bgm_stop", () => Audio.bgmStop());
// Battle recordings (attr_accessors; game/frontier/challengeBattles.ts sets them).
defineScript("$PokemonGlobal.lastbattle", () => (G.pokemonGlobal as { lastbattle?: string | null }).lastbattle ?? null);
defineScript("$game_temp.last_battle_record", () => (G.gameTemp as { lastBattleRecord?: string | null }).lastBattleRecord ?? null);

// Speed Up 2.0: $GameSpeed is read by every Graphics.update, so setting it applies at once.
defineScript("$GameSpeed", () => SpeedUp.gameSpeed);
defineScript("$GameSpeed=", (_c, value) => {
  SpeedUp.gameSpeed = Number(value);
  Graphics.speed = SPEEDUP_STAGES[SpeedUp.gameSpeed] ?? 1;
});

// Plain Ruby globals some events use as scratch space (nil until assigned, not saved).
for (const name of ["$lobbyreset", "$speeches"]) {
  let value: unknown = null;
  defineScript(name, () => value);
  defineScript(`${name}=`, (_c, v) => { value = v; });
}

//===============================================================================
// Mystery Gift (016_UI/023_UI_MysteryGift.rb)
//===============================================================================
type Gift = [number, number?, unknown?, string?];

/** pbNextMysteryGiftID: the first gift not yet collected, or 0. */
export function pbNextMysteryGiftID(): number {
  for (const i of player().mysteryGifts as Gift[]) {
    if (i.length > 1) return i[0];
  }
  return 0;
}

/** pbReceiveMysteryGift(id) */
export async function pbReceiveMysteryGift(id: number): Promise<boolean> {
  const gifts = player().mysteryGifts as Gift[];
  let index = -1;
  for (let i = 0; i < gifts.length; i++) {
    if (gifts[i]![0] === id && gifts[i]!.length > 1) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    await pbMessage(_INTL("Couldn't find an unclaimed Mystery Gift with ID {1}.", id));
    return false;
  }
  const gift = gifts[index]!;
  if (gift[1] === 0) { // Pokémon
    const pkmn = gift[2] as Pokemon;
    pkmn.personalID = Math.floor(Math.random() * 2 ** 16) | (Math.floor(Math.random() * 2 ** 16) << 16);
    pkmn.calcStats();
    const time = pbGetTimeNow();
    pkmn.timeReceived = time; // time.getgm.to_i
    pkmn.obtainMethod = 4; // Fateful encounter
    pkmn.recordFirstMoves();
    pkmn.obtainLevel = pkmn.level;
    pkmn.obtainMap = G.gameMap?.mapId ?? 0;
    const wasOwned = player().owned(pkmn.species);
    if (pbAddPokemonSilent(pkmn)) {
      await pbMessage(_INTL("\\me[Pkmn get]{1} received {2}!", player().name, pkmn.name));
      gifts[index] = [id];
      // Show Pokédex entry for new species if it hasn't been owned before
      if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && !wasOwned && player().hasPokedex) {
        await pbMessage(_INTL("{1}'s data was added to the Pokédex.", pkmn.name));
        player().pokedex.registerLastSeen(pkmn);
        await pbFadeOutIn(async () => {
          const scene = new PokemonPokedexInfo_Scene();
          const screen = new PokemonPokedexInfoScreen(scene);
          await screen.pbDexEntry(pkmn.species);
        });
      }
      return true;
    }
  } else if ((gift[1] ?? 0) > 0) { // Item
    const item = gift[2] as Id;
    const qty = gift[1]!;
    if (G.bag.canAdd(item, qty)) {
      G.bag.add(item, qty);
      const itm = Item.get(item);
      const itemname = qty > 1 ? itm.namePlural : itm.name;
      if (item === "LEFTOVERS") {
        await pbMessage(_INTL("\\me[Item get]You obtained some \\c[1]{1}\\c[0]!\\wtnp[30]", itemname));
      } else if (itm.isMachine()) { // TM or HM
        await pbMessage(_INTL("\\me[Item get]You obtained \\c[1]{1} {2}\\c[0]!\\wtnp[30]", itemname, Move.get(itm.move!).name));
      } else if (qty > 1) {
        await pbMessage(_INTL("\\me[Item get]You obtained {1} \\c[1]{2}\\c[0]!\\wtnp[30]", qty, itemname));
      } else if (startsWithVowel(itemname)) {
        await pbMessage(_INTL("\\me[Item get]You obtained an \\c[1]{1}\\c[0]!\\wtnp[30]", itemname));
      } else {
        await pbMessage(_INTL("\\me[Item get]You obtained a \\c[1]{1}\\c[0]!\\wtnp[30]", itemname));
      }
      gifts[index] = [id];
      return true;
    }
  }
  return false;
}
defineScript("pbNextMysteryGiftID", () => pbNextMysteryGiftID());
defineScript("pbReceiveMysteryGift", (_c, id) => pbReceiveMysteryGift(Number(id)));

//===============================================================================
// Event snippets
//===============================================================================
/**
 * Common events 2, 5, 6 and 7 ("Pokés", "KANTO", "ILHAS LARANJA", "HOENN"):
 *   for k in 0..5
 *   if $Trainer.party[k]
 *   if $Trainer.party[k].species==:RAIKOU
 *   box=$PokemonStorage
 *   box.pbStoreCaught($Trainer.party[k])
 *   $Trainer.party[k]=nil
 *   end
 *   end
 *   $Trainer.party.compact!
 *   end
 * Fixed on purpose: the original runs compact! inside the loop, so the
 * Pokémon after a stored one moved into slot k and was skipped (two in a
 * row: only the first was stored). It runs after the loop here.
 */
export function storePartySpecies(species: () => unknown): void {
  const party = player().party as (Pokemon | null)[];
  for (let k = 0; k <= 5; k++) {
    if (party[k]) {
      if (party[k]!.species === species()) {
        G.storage.pbStoreCaught(party[k]!);
        party[k] = null;
      }
    }
  }
  for (let i = party.length - 1; i >= 0; i--) if (party[i] == null) party.splice(i, 1); // compact!
}
// The species is a proc so a constant that raises does so where Ruby evaluates it.
defineScript("storePartySpecies", (_c, species) => storePartySpecies(species as () => unknown));

/**
 * Map 233 (Birch's Lab), event 1:
 *   storage=$PokemonStorage
 *   for i in 0...$player.party.length
 *    storage.pbStoreCaught($player.party.pop)
 *   end
 */
export function storeWholeParty(): void {
  const party = player().party;
  const n = party.length;
  for (let i = 0; i < n; i++) G.storage.pbStoreCaught(party.pop()!);
}
defineScript("storeWholeParty", () => storeWholeParty());

/**
 * Map 751 (Fiery Path), events 8 and 9:
 *   $game_map.events.values.each { |e|
 *     e.removeThisEventfromMap if e.is_a?(Game_PokeEvent)
 *   }
 */
export function removeOverworldPokemon(): void {
  const events = [...(G.gameMap as unknown as { events: Map<number, GameEvent> }).events.values()];
  for (const e of events) if (e instanceof GamePokeEvent) e.removeThisEventfromMap();
}
defineScript("removeOverworldPokemon", () => removeOverworldPokemon());

/**
 * Map 878 (Pokémon League HQ), event 1:
 *   names = []
 *   for p in $player.party
 *     next if p.egg?
 *     names << p.speciesName
 *     break if names.length >= 3
 *   end
 *   $game_variables[1] = names.length == 0 ? "No usable Pokémon." :
 *                        (names.length == 1 ? names[0] :
 *                         names[0..-2].join(", ") + " and " + names[-1])
 */
export function partySpeciesNames(): string {
  const names: string[] = [];
  for (const p of player().party) {
    if (p.egg()) continue;
    names.push(p.speciesName());
    if (names.length >= 3) break;
  }
  if (names.length === 0) return "No usable Pokémon.";
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
defineScript("partySpeciesNames", () => partySpeciesNames());

/**
 * Map 159 (Blackthorn City Trade House), event 3 (the Effort Ribbon):
 *   total = 0
 *   pkmn.ev.each_value { |v| total += v }
 *   maxed = 0
 *   if total >= Pokemon::EV_LIMIT
 *     maxed = 1
 *   end
 *   maxed = 2 if pkmn.hasRibbon?(:EFFORT)
 */
export function effortRibbonState(pkmn: Pokemon): number {
  let total = 0;
  for (const v of Object.values(pkmn.ev)) total += v;
  let maxed = 0;
  if (total >= Pokemon.EV_LIMIT) maxed = 1;
  if (pkmn.hasRibbon("EFFORT")) maxed = 2;
  return maxed;
}
defineScript("effortRibbonState", (_c, pkmn) => effortRibbonState(pkmn as Pokemon));

/**
 * Common events 23 and 24 (the partner's dependent events):
 *   pbPlayDecisionSE
 *   pbFadeOutIn {
 *     scene = PokemonPartnerTrainerCard_Scene.new
 *     screen = PokemonPartnerTrainerCardScreen.new(scene)
 *     screen.pbStartScreen
 *   }
 */
export async function pbPartnerTrainerCard(): Promise<void> {
  pbPlayDecisionSE();
  await pbFadeOutIn(async () => {
    const scene = new PokemonPartnerTrainerCard_Scene();
    const screen = new PokemonPartnerTrainerCardScreen(scene);
    await screen.pbStartScreen();
  });
}
defineScript("pbPartnerTrainerCard", () => pbPartnerTrainerCard());

/**
 * Common event 32 ("Call HallofFame", not called by any event):
 *   Graphics.frame_rate=40
 *   $game_system.se_play($data_system.decision_se)
 *   PBDebug.logonerr {
 *     scene=HallofFameScene.new
 *     screen=HallofFame.new(scene)
 *     pbFadeOutIn(99999) { screen.pbStartScreen }}
 * Fixed on purpose: those are v16 names (a NameError in v20, which logonerr
 * showed before carrying on); v20's are HallOfFame_Scene/HallOfFameScreen,
 * whose entry screen (pbStartScreenEntry) this runs. Graphics.frame_rate is
 * already 40 (see moveRoute.ts).
 */
export async function callHallOfFameCommonEvent(): Promise<void> {
  G.gameSystem.sePlay(Data.system.sounds.decisionSe ?? null);
  await PBDebug.logonerr(async () => {
    const scene = new HallOfFame_Scene();
    const screen = new HallOfFameScreen(scene);
    await pbFadeOutIn(() => screen.pbStartScreenEntry(), 99999);
  });
}
defineScript("callHallOfFameCommonEvent", () => callHallOfFameCommonEvent());

/**
 * Map 438 ("Intro antes title"), event 1 page 2:
 *   sscene=PokemonLoadScene.new
 *   sscreen=PokemonLoad.new(sscene)
 *   sscreen.pbStartLoadScreen
 * Fixed on purpose: those are v16 names (a NameError in v20); this opens
 * v20's load screen (PokemonLoad_Scene/PokemonLoadScreen). Its Continue and
 * New Game run Game.load/Game.start_new, which set $scene = Scene_Map.new
 * (main.ts does that part of them here); Quit Game leaves $scene nil, which
 * goes back to the title in the browser.
 */
export async function startLoadScreen(): Promise<void> {
  const screen = new PokemonLoadScreen(new PokemonLoad_Scene());
  await screen.init();
  const choice = await screen.pbStartLoadScreen();
  const { Game } = await import("../Game");
  if (choice.action === "continue") await Game.load(choice.save);
  else if (choice.action === "new_game") await Game.startNew();
  else {
    G.scene = null;
    return;
  }
  const { SceneMap } = await import("../../scenes/SceneMap");
  G.scene = new SceneMap() as never;
}
defineScript("startLoadScreen", () => startLoadScreen());
