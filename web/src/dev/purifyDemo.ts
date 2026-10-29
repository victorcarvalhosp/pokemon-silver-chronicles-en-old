// Dev page for the Purify Chamber and the Relic Stone (web/dev-purify.html):
// opens pbPurifyChamber (or pbRelicStone) standalone with a demo trainer,
// Shadow and regular Pokémon in the party and the boxes, and a chamber with a
// couple of sets filled in.
//
//   ?screen=chamber   pbPurifyChamber (default)
//   ?screen=relic     pbRelicStone (the party has a purifiable Shadow Pokémon)
//   &ready=1          set 1's Shadow Pokémon is ready: the chamber purifies on opening
//
//   Enter/Space/C = USE   Esc/X = BACK   Z/Shift = ACTION   Q/W = JUMPUP/JUMPDOWN (change set)
//   S = take one overworld step (the chamber's per-step heart gauge reduction)
// The screen reopens with Enter after it closes. When the browser pane is
// hidden requestAnimationFrame stops; drive it with __demo.step(n) and
// __demo.press("Enter") from the console.

import { createScreen } from "../core/screen";
import { GameSystem } from "../game/GameSystem";
import { G, GameTemp, PokemonGlobalMetadata } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { pbLowerHeartGauges } from "../game/pokemon/shadowPokemonOther";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { pbPurifyChamber, pbRelicStone } from "../ui/purifyChamber";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const screen = params.get("screen") ?? "chamber";
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();
G.gameTemp = new GameTemp();
G.pokemonGlobal = new PokemonGlobalMetadata();

//-------------------------------------------------------------------------------
// Demo trainer, party, boxes and chamber
//-------------------------------------------------------------------------------
const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.seenPurifyChamber = true;
G.bag = new PokemonBag();

const shadow = (species: string, level: number, gauge: number | null = null): Pokemon => {
  const pkmn = new Pokemon(species, level, player);
  pkmn.makeShadow();
  if (gauge != null) pkmn.heartGauge = gauge;
  return pkmn;
};

const relicReady = shadow("ARBOK", 30, 0);
player.party = [new Pokemon("TYPHLOSION", 36, player), new Pokemon("PIKACHU", 22, player), relicReady];

const storage = new PokemonStorage();
G.storage = storage;
const boxed: Pokemon[] = [
  shadow("BUTTERFREE", 25), shadow("GROWLITHE", 20, 600), shadow("MAGNETON", 30, 40),
  new Pokemon("SQUIRTLE", 15, player), new Pokemon("BULBASAUR", 15, player), new Pokemon("CHARMANDER", 15, player),
  new Pokemon("GEODUDE", 20, player), new Pokemon("PIDGEY", 5, player), new Pokemon("ONIX", 14, player),
  new Pokemon("GASTLY", 18, player), new Pokemon("EEVEE", 20, player),
];
boxed.forEach((p, i) => storage.set(0, i, p));

const chamber = G.pokemonGlobal.purifyChamber;
// Set 1: a Shadow Vulpix facing a Squirtle-Bulbasaur-Charmander circle (strong flows).
chamber.setShadow(0, shadow("VULPIX", 20, params.get("ready") ? 0 : 900));
for (const sp of ["SQUIRTLE", "CHARMANDER", "BULBASAUR"]) chamber.insertAfter(0, chamber.setCount(0), new Pokemon(sp, 12, player));
// Set 2: a Shadow Beedrill with a single Rattata.
chamber.setShadow(1, shadow("BEEDRILL", 25, 2000));
chamber.insertAfter(1, 0, new Pokemon("RATTATA", 6, player));

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

const open = screen === "relic" ? pbRelicStone : pbPurifyChamber;
hud.textContent = `${screen === "relic" ? "pbRelicStone" : "pbPurifyChamber"}\n` +
  "Enter/Space = USE, Esc/X = BACK, Q/W = change set\nS = take a step (closed screen), Enter reopens";

addEventListener("keydown", (e) => {
  if (e.code === "KeyS") void pbLowerHeartGauges();
});

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

/** Presses a key for one tick (KeyboardEvent code, e.g. "Enter", "Escape", "ArrowDown", "KeyQ"). */
async function press(code: string, ticks = 2): Promise<void> {
  dispatchEvent(new KeyboardEvent("keydown", { code }));
  await step(ticks);
  dispatchEvent(new KeyboardEvent("keyup", { code }));
  await step(1);
}

Object.assign(window, { __demo: { G, Graphics, Input, step, press, app, chamber, pbLowerHeartGauges } });
