// Dev page for the Trainer Card, Pokégear and Pokédex screens
// (web/dev-info.html): opens one screen standalone with a demo trainer.
//
//   ?screen=card      Trainer Card (Mr. Gela's HGSS)  &stars=0..5
//   ?screen=partner   Partner Trainer Card
//   ?screen=pokegear  Pokégear (Map, Phone, Radio, Tasks, DexNav all enabled)
//   ?screen=phone     Phone
//   ?screen=map       pbShowMap (wall map)   ?screen=townmap (Pokégear map)   ?screen=fly
//   ?screen=quests    Quest log (MQS)
//   ?screen=dexnav    DexNav (Encounter List UI)    ?screen=radio  Jukebox
//   ?screen=pokedex   Pokédex list (Johto)          ?screen=dexmenu  Dex list menu
//   ?screen=entry     Pokédex entry (Typhlosion)    ?screen=brief    "new species" entry
//   &map=4            the map the player stands on (Route 29; sets region, encounters)
//
//   Enter/Space/C = USE   Esc/X = BACK   Z/Shift = ACTION   A/S = jump
// Each screen reopens with Enter after it closes. When the browser pane is
// hidden requestAnimationFrame stops; drive it with __demo.step(n) and
// __demo.press("Enter") from the console.

import { createScreen } from "../core/screen";
import { pbAllRegionalSpecies } from "../data/gameData/miscPBSData";
import { loadMap } from "../data/loader";
import { Data } from "../data/store";
import { GameSystem } from "../game/GameSystem";
import { G } from "../game/globals";
import { initializeGame } from "../game/newGame";
import { playerQuests, type Quest } from "../game/quests";
import { PokemonUIHooks } from "../game/pokemon/utilities";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { pbFadeOutIn } from "../ui/fades";
import { MenuScreens } from "../ui/menus/menuScreens";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../ui/pokedex/pokedexEntry";
import { PokemonPokedex_Scene } from "../ui/pokedex/pokedexMain";
import { EncounterList_Scene, EncounterList_Screen } from "../ui/pokegear/encounterList";
import { PokemonJukebox_Scene, PokemonJukeboxScreen } from "../ui/pokegear/jukebox";
import { PokemonPhoneScene } from "../ui/pokegear/phone";
import { pbShowMap } from "../ui/pokegear/regionMap";
import { pbViewQuests } from "../ui/quests/questList";
import { PokemonPartnerTrainerCard_Scene, PokemonPartnerTrainerCardScreen } from "../ui/trainerCard/partnerTrainerCard";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const screen = params.get("screen") ?? "card";
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();
G.stats.playTime = 3 * 3600 + 25 * 60 + 12;

//-------------------------------------------------------------------------------
// Demo trainer
//-------------------------------------------------------------------------------
const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.money = 12345;
player.hasPokedex = true;
player.hasPokegear = true;
player.stars = Number(params.get("stars") ?? 0);
player.badges = [true, true, true, true, true, false, false, false, true, true];
const g = G.pokemonGlobal as unknown as Record<string, unknown>;
g.startTime = Math.floor(new Date(2025, 2, 14).getTime() / 1000);
G.pokemonGlobal.visitedMaps = [];
for (const id of [1, 6, 21, 207]) G.pokemonGlobal.visitedMaps[id] = true;
g.phoneNumbers = [[true, 78, "Father", 3], [true, 53, "Mother", 3], [true, 50, "Professor \nElm", 8]];
for (const sw of [526, 963, 964]) G.gameSwitches.set(sw, true); // Radio, Tasks, DexNav
// Partner card
G.gameSwitches.set(141, params.get("boy") === "1");
G.gameVariables.set(76, "Kris");
G.gameVariables.set(77, "Ethan");
G.gameVariables.set(79, 3);
G.gameVariables.set(80, 1);
G.gameVariables.set(85, 6);
G.gameVariables.set(88, 2);

// Pokédex: the first 60 Johto species seen, every other one owned, plus some variants.
const dex = player.pokedex;
const johto = (pbAllRegionalSpecies(0) ?? []).filter((s): s is string => !!s);
johto.slice(0, 60).forEach((sp, i) => {
  if (i % 7 === 6) return; // leave some gaps
  dex.register(sp);
  if (i % 2 === 0) dex.setOwned(sp);
});
dex.register("PIKACHU", 0, 0, 1); // shiny
dex.register("PIKACHU", 1, 0, 0); // female
dex.register("PIKACHU", 0, 0, 0, true, 2); // Gigantamax
dex.setOwned("PIKACHU");
dex.register("TYPHLOSION", 0, 1, 0); // Hisuian form
dex.register("BULBASAUR");
dex.setOwned("BULBASAUR");
dex.unlock(1); // Kanto Dex
dex.unlock(-1); // National Dex
for (let i = 0; i < 3; i++) dex.registerCaught("CHIKORITA");

// Quests
const quests = playerQuests();
const quest = (id: string, stage: number, story: boolean, color: string, isNew: boolean): Quest =>
  ({ id, stage, time: new Date(2025, 2, 15, 10, 30).toISOString(), location: "Route 29", new: isNew, color, story });
quests.activeQuests.push(quest("TogepiEgg", 1, true, "089D5EBF", true), quest("KantoGymChallenge", 1, false, "2D4A5694", false));
quests.completedQuests.push(quest("TeamRockerGoldenrod", 2, true, "26CC4B56", false));

//-------------------------------------------------------------------------------
// The map the player is on
//-------------------------------------------------------------------------------
const mapId = Number(params.get("map") ?? 4);
const map = await loadMap(mapId);
G.gameMap = Object.assign({ mapId, events: new Map(), width: map.width, height: map.height, name: Data.mapInfos.get(mapId)?.name ?? "" }) as never;
G.gamePlayer = { id: 0, x: Math.floor(map.width / 2), y: Math.floor(map.height / 2), direction: 2, screenX: () => 0, screenY: () => 0, screenZ: () => 0 };
G.scene = { async miniupdate() {} };

//-------------------------------------------------------------------------------
async function waitForKey(keys: number[]): Promise<void> {
  for (;;) {
    await Graphics.update();
    Input.update();
    if (keys.some((k) => Input.trigger(k))) return;
  }
}

const fade = (body: () => Promise<unknown>) => async () => {
  await pbFadeOutIn(body);
};

const SCREENS: Record<string, [string, () => Promise<void>]> = {
  card: ["Trainer Card (Mr. Gela's HGSS)", fade(() => MenuScreens.trainerCard!())],
  partner: ["Partner Trainer Card", fade(() => new PokemonPartnerTrainerCardScreen(new PokemonPartnerTrainerCard_Scene()).pbStartScreen())],
  pokegear: ["Pokégear", fade(() => MenuScreens.pokegear!())],
  phone: ["Phone", fade(() => new PokemonPhoneScene().start())],
  map: ["pbShowMap (wall map)", () => pbShowMap()],
  townmap: ["Town Map (Pokégear: ACTION toggles Fly if you can fly)", fade(() => MenuScreens.townMap!())],
  fly: ["Fly map", fade(() => MenuScreens.flyMap!())],
  quests: ["Quest log (MQS)", fade(() => pbViewQuests())],
  dexnav: ["DexNav (Encounter List UI)", fade(() => new EncounterList_Screen(new EncounterList_Scene()).pbStartScreen())],
  radio: ["Radio (Jukebox)", fade(() => new PokemonJukeboxScreen(new PokemonJukebox_Scene()).pbStartScreen())],
  pokedex: ["Pokédex (Johto)", fade(() => { (g as { pokedexDex?: number }).pokedexDex = 0; return MenuScreens.pokedex!(); })],
  dexmenu: ["Pokédex menu", fade(() => MenuScreens.pokedexMenu!())],
  entry: ["Pokédex entry", fade(async () => {
    (g as { pokedexDex?: number }).pokedexDex = 0;
    const list = new PokemonPokedex_Scene().pbGetDexList();
    const index = Math.max(0, list.findIndex((e) => e[0] === (params.get("species") ?? "TYPHLOSION")));
    await new PokemonPokedexInfoScreen(new PokemonPokedexInfo_Scene()).pbStartScreen(list, index, 0);
  })],
  brief: ["New species entry (PokemonUIHooks.dexEntry)", () => PokemonUIHooks.dexEntry!(params.get("species") ?? "CHIKORITA")],
};
const [title, open] = SCREENS[screen] ?? SCREENS.card!;
hud.textContent = `${title}\nEnter/Space = USE, Esc/X = BACK, Z/Shift = ACTION, A/S = jump\nEnter reopens`;

runGame(async () => {
  for (;;) {
    await open();
    await waitForKey([Input.USE]);
  }
}, (e) => {
  console.error(e);
  hud.textContent = String(e instanceof Error ? e.stack : e);
});

async function step(n = 1): Promise<void> {
  for (let i = 0; i < n; i++) await runTick();
  render();
}

/** Presses a key for one tick (KeyboardEvent code, e.g. "Enter", "Escape", "ArrowDown", "KeyZ"). */
async function press(code: string, ticks = 2): Promise<void> {
  dispatchEvent(new KeyboardEvent("keydown", { code }));
  await step(ticks);
  dispatchEvent(new KeyboardEvent("keyup", { code }));
  await step(1);
}

Object.assign(window, { __demo: { G, Graphics, Input, step, press } });
