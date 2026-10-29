// Dev page for the PC storage, item storage, Mailbox, Poké Mart and Kurt
// (web/dev-storage.html): opens one screen standalone with a demo trainer,
// party, boxes, Bag and PC items.
//
//   ?screen=organize  Pokémon storage, Organize Boxes (pbStartScreen(0))
//   ?screen=withdraw  Withdraw Pokémon (1)     ?screen=deposit  Deposit Pokémon (2)
//   ?screen=pc        pbPokeCenterPC (the Pokémon Center PC menu)
//   ?screen=items     pbPCItemStorage           ?screen=mailbox  pbPCMailbox
//   ?screen=mart      pbPokemonMart (Cherrygrove's stock)   ?screen=kurt  apricornToBall
//   &hoenn=1          turns on the League regulations switch (HOENN_SWITCH 479)
//
//   Enter/Space/C = USE   Esc/X = BACK   Z/Shift = ACTION   D = SPECIAL   Q/W = JUMPUP/JUMPDOWN
// Each screen reopens with Enter after it closes. When the browser pane is
// hidden requestAnimationFrame stops; drive it with __demo.step(n) and
// __demo.press("Enter") from the console.

import { createScreen } from "../core/screen";
import { GameSystem } from "../game/GameSystem";
import { G, PokemonGlobalMetadata } from "../game/globals";
import { PCItemStorage, PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { Mail } from "../game/pokemon/Mail";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { pbPCItemStorage, pbPCMailbox, pbPokeCenterPC } from "../game/scripts/pc";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { apricornToBall } from "../ui/mart/ApricornToBall";
import { pbPokemonMart } from "../ui/mart/PokemonMart";
import { pbFadeOutIn } from "../ui/fades";
import { PokemonStorageScene } from "../ui/storage/PokemonStorageScene";
import { HOENN_SWITCH, PokemonStorageScreen } from "../ui/storage/PokemonStorageScreen";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const screen = params.get("screen") ?? "organize";
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();
G.pokemonGlobal = new PokemonGlobalMetadata();

//-------------------------------------------------------------------------------
// Demo trainer, party, boxes, Bag and PC items
//-------------------------------------------------------------------------------
const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.money = 3000;
player.seenStorageCreator = true;

const typhlosion = new Pokemon("TYPHLOSION", 36);
typhlosion.item = "LEFTOVERS";
typhlosion.markings = [1, 0, 2, 0, 0, 1];
typhlosion.shinyLeaf = 3;
const pikachu = new Pokemon("PIKACHU", 22);
pikachu.makeFemale();
pikachu.shiny = true;
pikachu.gmaxFactor = true;
const chansey = new Pokemon("CHANSEY", 30);
chansey.item = "GRASSMAIL";
chansey.mail = new Mail("GRASSMAIL", "Hi! Take good care of Chansey for me.", "Kris", ["CHANSEY", 1, false, 0, false, false], null, null);
const egg = new Pokemon("TOGEPI", 1);
egg.name = "Egg";
egg.stepsToHatch = 2000;
player.party = [typhlosion, pikachu, chansey, egg];

const storage = new PokemonStorage();
G.storage = storage;
const boxed: [string, number][] = [["PIDGEY", 4], ["RATTATA", 3], ["SENTRET", 5], ["HOOTHOOT", 6], ["GEODUDE", 9],
  ["ZUBAT", 7], ["ONIX", 14], ["MAREEP", 10], ["TREECKO", 5], ["MUDKIP", 30]];
boxed.forEach(([sp, lv], i) => storage.set(0, i * 2, new Pokemon(sp, lv, player)));
storage.set(1, 0, new Pokemon("EEVEE", 20, player));
storage.boxes[1]!.name = "Friends";

const bag = new PokemonBag();
G.bag = bag;
for (const [item, qty] of [
  ["POTION", 5], ["ANTIDOTE", 3], ["REPEL", 4], ["POKEBALL", 10], ["GREATBALL", 3], ["ORANBERRY", 3],
  ["LEFTOVERS", 1], ["NUGGET", 2], ["TM01", 1], ["REDAPRICORN", 4], ["BLUEAPRICORN", 2], ["BICYCLE", 1],
] as [string, number][]) bag.add(item, qty);

const pcItems = new PCItemStorage();
for (const [item, qty] of [["SUPERPOTION", 3], ["ESCAPEROPE", 2], ["FULLHEAL", 1]] as [string, number][]) pcItems.add(item, qty);
G.pokemonGlobal.pcItemStorage = pcItems;
G.pokemonGlobal.mailbox = [new Mail("FLAMEMAIL", "See you in Goldenrod!", "Lyra", ["MARILL", 1, false, 0, false, false], null, null)];
if (params.get("hoenn")) G.gameSwitches.set(HOENN_SWITCH, true);

G.gameMap = null;
G.scene = { async miniupdate() {} };

//-------------------------------------------------------------------------------
async function waitForKey(keys: number[]): Promise<void> {
  for (;;) {
    await Graphics.update();
    Input.update();
    if (keys.some((k) => Input.trigger(k))) return;
  }
}

/** The open storage scene (for inspecting from the console as __demo.scene). */
let storageScene: PokemonStorageScene | null = null;
const pbOpenPokemonStorage = (command: number) => pbFadeOutIn(async () => {
  storageScene = new PokemonStorageScene();
  await new PokemonStorageScreen(storageScene, G.storage).pbStartScreen(command);
});

const SCREENS: Record<string, [string, () => Promise<void>]> = {
  organize: ["Pokémon storage: Organize Boxes", () => pbOpenPokemonStorage(0)],
  withdraw: ["Pokémon storage: Withdraw", () => pbOpenPokemonStorage(1)],
  deposit: ["Pokémon storage: Deposit", () => pbOpenPokemonStorage(2)],
  pc: ["pbPokeCenterPC", () => pbPokeCenterPC()],
  items: ["pbPCItemStorage", () => pbPCItemStorage()],
  mailbox: ["pbPCMailbox", () => pbPCMailbox()],
  mart: ["pbPokemonMart (Cherrygrove)", () => pbPokemonMart(["POTION", "POKEBALL", "ANTIDOTE", "AWAKENING", "PARALYZEHEAL"])],
  kurt: ["apricornToBall", () => apricornToBall()],
};
const [title, open] = SCREENS[screen] ?? SCREENS.organize!;
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

Object.assign(window, { __demo: { G, Graphics, Input, step, press, app, get scene() { return storageScene; } } });
