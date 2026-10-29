// Dev page for the party, Summary and Bag screens (web/dev-party.html): opens
// one screen standalone with a demo trainer, party and Bag.
//
//   ?screen=party    party screen (pbPokemonScreen, as from the pause menu)
//   ?screen=summary  Summary of the first Pokémon (&index=n for another one)
//   ?screen=bag      Bag (pbStartScreen, as from the pause menu)
//   ?screen=choose   pbChooseItem (the choosing Bag)   ?screen=apricorn  pbChooseApricorn
//   ?screen=forget   pbForgetMove (learning Thunderbolt)
//   ?screen=able     pbChooseAblePokemon (ABLE / NOT ABLE annotations)
//
//   Enter/Space/C = USE   Esc/X = BACK   Z/Shift = ACTION   D = SPECIAL
// Each screen reopens with Enter after it closes. When the browser pane is
// hidden requestAnimationFrame stops; drive it with __demo.step(n) and
// __demo.press("Enter") from the console.

import { createScreen } from "../core/screen";
import { GameSystem } from "../game/GameSystem";
import { G } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { Mail } from "../game/pokemon/Mail";
import { Pokemon } from "../game/pokemon/Pokemon";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { pbChooseApricorn, pbChooseItem, pbForgetMove } from "../ui/bag/itemUtilities";
import { pbFadeOutIn } from "../ui/fades";
import { MenuScreens } from "../ui/menus/menuScreens";
import { pbChooseAblePokemon } from "../ui/party/party";
import { PokemonSummary_Scene, PokemonSummaryScreen } from "../ui/summary/summary";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const screen = params.get("screen") ?? "party";
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();

//-------------------------------------------------------------------------------
// Demo trainer, party and Bag
//-------------------------------------------------------------------------------
const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.hasPokedex = true;
player.badges = [true, true, true, false, false, false, false, false];
player.pokedex.unlock(-1);

const typhlosion = new Pokemon("TYPHLOSION", 36);
typhlosion.item = "LEFTOVERS";
typhlosion.markings = [1, 0, 2, 0, 0, 1];
typhlosion.giveRibbon("CHAMPION");
typhlosion.giveRibbon("HOENNCOOL");
typhlosion.giveRibbon("ROYAL");
typhlosion.giveRibbon("EFFORT");
typhlosion.shinyLeaf = 3;
typhlosion.happiness = 200;
typhlosion.hp = Math.floor(typhlosion.totalhp * 0.4);

const pikachu = new Pokemon("PIKACHU", 22);
pikachu.makeFemale();
pikachu.shiny = true;
pikachu.item = "ORANBERRY";
pikachu.status = "PARALYSIS";
pikachu.gmaxFactor = true;

const chansey = new Pokemon("CHANSEY", 30);
chansey.learnMove("SOFTBOILED");
chansey.pokeBall = "HEALBALL";
chansey.item = "GRASSMAIL";
chansey.mail = new Mail("GRASSMAIL", "Hi! Take good care of Chansey for me.", "Kris",
  ["CHANSEY", 1, false, 0, false, false], null, null);

const geodude = new Pokemon("GEODUDE", 14);
geodude.hp = 0;
geodude.pokeBall = "GREATBALL";

const egg = new Pokemon("TOGEPI", 1);
egg.name = "Egg";
egg.stepsToHatch = 2000;
egg.obtainMethod = 1;
egg.obtainText = "Mr. Pokémon";

player.party = [typhlosion, pikachu, chansey, geodude, egg];

const bag = new PokemonBag();
G.bag = bag;
for (const [item, qty] of [
  ["POTION", 5], ["SUPERPOTION", 2], ["MAXREVIVE", 1], ["ANTIDOTE", 3], ["REPEL", 4], ["ESCAPEROPE", 1],
  ["FIRESTONE", 1], ["LEFTOVERS", 1], ["XATTACK", 2], ["POKEBALL", 10], ["GREATBALL", 3], ["ULTRABALL", 1],
  ["TM01", 1], ["TM24", 1], ["ORANBERRY", 3], ["SITRUSBERRY", 1], ["GRASSMAIL", 2], ["REDAPRICORN", 4],
  ["BLUEAPRICORN", 2], ["BICYCLE", 1], ["OLDROD", 1], ["ITEMFINDER", 1], ["TOWNMAP", 1],
] as [string, number][]) bag.add(item, qty);
bag.register("BICYCLE");

G.gameMap = { mapId: 4, events: new Map() } as never;
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
  party: ["Party screen (pbPokemonScreen)", fade(() => MenuScreens.party!())],
  summary: ["Summary", fade(() => new PokemonSummaryScreen(new PokemonSummary_Scene()).pbStartScreen(player.party, Number(params.get("index") ?? 0)))],
  bag: ["Bag (pbStartScreen)", fade(() => MenuScreens.bag!())],
  choose: ["pbChooseItem", async () => { console.log("chosen:", await pbChooseItem(1)); }],
  apricorn: ["pbChooseApricorn", async () => { console.log("chosen:", await pbChooseApricorn(1)); }],
  forget: ["pbForgetMove (learning Thunderbolt)", async () => { console.log("forget index:", await pbForgetMove(pikachu, "THUNDERBOLT")); }],
  able: ["pbChooseAblePokemon", async () => {
    await pbChooseAblePokemon(1, 2);
    console.log("chosen:", G.gameVariables.get(1), G.gameVariables.get(2));
  }],
};
const [title, open] = SCREENS[screen] ?? SCREENS.party!;
hud.textContent = `${title}\nEnter/Space = USE, Esc/X = BACK, Z/Shift = ACTION, D = SPECIAL\nEnter reopens`;

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
