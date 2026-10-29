// Dev page for the minigames (web/dev-minigames.html): opens one minigame
// standalone with a demo trainer (Coin Case, 500 coins, $50,000, Triple Triad
// cards) and no map.
//
//   ?game=triad      Triple Triad duel (pbTriadDuel, preset deck; &rules=samewins,elements,openhand...)
//   ?game=triadrandom  Triple Triad with a random opponent deck (&min=0&max=5)
//   ?game=binder     TCG Binder (pbTriadBinder)    ?game=buy  card shop (pbBuyTriads)
//   ?game=sell       sell cards (pbSellTriads)     ?game=list  pbTriadList
//   ?game=card       pbGiveTriadCardWithAnimation  ?game=booster  BoosterPack.give (Genesis)
//   ?game=slots      pbSlotMachine (&difficulty=0..2)
//   ?game=voltorb    pbVoltorbFlip                 ?game=mining  pbMiningGame
//   ?game=tile       pbTilePuzzle (&type=1..7&board=Kabuto)
//   ?game=roulette   Roulette.start(1, Roulette::BLUE)
//   ?game=duel       pbDuel (no map: the characters don't move)
//   ?game=dance      pbDanceGame(3, 124)           ?game=lottery  pbSetLotteryNumber + pbLottery
//
//   Enter/Space/C = USE   Esc/X = BACK   Z/Shift = ACTION   arrows
// The minigame reopens with Enter after it closes. When the browser pane is
// hidden requestAnimationFrame stops; drive it with __demo.step(n) and
// __demo.press("Enter").

import { createScreen } from "../core/screen";
import { GameSystem } from "../game/GameSystem";
import { G } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { pbDanceGame } from "../minigames/DanceMinigame";
import { pbDuel } from "../minigames/Duel";
import { pbLottery, pbSetLotteryNumber } from "../minigames/Lottery";
import { pbMiningGame } from "../minigames/Mining";
import { Roulette } from "../minigames/Roulette";
import { pbSlotMachine } from "../minigames/SlotMachine";
import { pbTilePuzzle } from "../minigames/TilePuzzles";
import { pbSellTriads, pbTriadDuel, pbTriadList, triads } from "../minigames/TripleTriad";
import { BoosterPack } from "../minigames/TripleTriad_BoosterPacks";
import { pbBuyTriads, pbTriadBinder } from "../minigames/TripleTriad_Improvements";
import { pbGiveTriadCardWithAnimation } from "../minigames/TripleTriad_ReceiveCard";
import { pbVoltorbFlip } from "../minigames/VoltorbFlip";
import { pbMessage } from "../ui/messages";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const game = params.get("game") ?? "triad";
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();

//-------------------------------------------------------------------------------
// Demo trainer
//-------------------------------------------------------------------------------
const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.hasPokedex = true;
player.pokedex.unlock(-1);
player.money = 50_000;
player.coins = 500;
for (const s of ["PIKACHU", "CATERPIE", "PIDGEY", "RATTATA", "ZUBAT", "GEODUDE", "ONIX", "CYNDAQUIL", "TOTODILE", "CHIKORITA"]) {
  player.pokedex.setOwned(s);
}
player.party = [new Pokemon("CYNDAQUIL", 12), new Pokemon("PIDGEY", 8)];
G.storage = new PokemonStorage();
const bag = new PokemonBag();
G.bag = bag;
bag.add("COINCASE", 1);
bag.add("TCGBINDER", 1);
bag.add("BOOSTERPACK_GENESIS", 3);
for (const c of ["PIKACHU", "CHARMANDER", "SQUIRTLE", "BULBASAUR", "GEODUDE", "ONIX", "MACHOP", "ABRA", "RATTATA_1", "OAK",
  "CATERPIE", "PIDGEY", "ZUBAT", "SANDSHREW", "VULPIX", "DRAGONITE", "TYRANITAR", "LAPRAS", "MEWTWO", "GYARADOS"]) {
  triads().add(c);
}
// No map: pbScrollMap (card shop) and the Duel/Dance event lookups skip it.
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

const rules = (params.get("rules") ?? "elements,noprize").split(",").filter(Boolean);
const speeches = ["I shall block all your attacks!", "Nothing can pierce my armor!", "Behold my dodging skills!",
  "I'll show you my fighting skills!", "Awe at the perfection of my skills!", "I'll deliver a perfect blow!",
  "Feel my power!", "AAAAHHHH!", "I'll attack with all my strength!",
  "Face my secret technique!", "This is my secret technique!", "Evil Blade Strike!"];

const GAMES: Record<string, [string, () => Promise<unknown>]> = {
  triad: ["Triple Triad (pbTriadDuel)", async () => {
    const r = await pbTriadDuel("Jack", 0, 5, rules, ["RATTATA", "WEEDLE", "CATERPIE", "PIKACHU", "BELLSPROUT"]);
    console.log("pbTriadDuel:", r);
  }],
  triadrandom: ["Triple Triad, random deck", async () => {
    console.log("pbTriadDuel:", await pbTriadDuel("Jack", Number(params.get("min") ?? 0), Number(params.get("max") ?? 5), rules));
  }],
  binder: ["TCG Binder (pbTriadBinder)", () => pbTriadBinder()],
  buy: ["Card shop (pbBuyTriads)", () => pbBuyTriads(params.get("species")?.split(",") ?? [])],
  sell: ["Sell cards (pbSellTriads)", () => pbSellTriads()],
  list: ["pbTriadList", () => pbTriadList()],
  card: ["pbGiveTriadCardWithAnimation(CHARIZARD)", () => pbGiveTriadCardWithAnimation("CHARIZARD")],
  booster: ["BoosterPack.give (Genesis)", () => BoosterPack.give("BOOSTERPACK_GENESIS", 5, 1)],
  slots: ["pbSlotMachine", () => pbSlotMachine(Number(params.get("difficulty") ?? 1))],
  voltorb: ["pbVoltorbFlip", () => pbVoltorbFlip()],
  mining: ["pbMiningGame", () => pbMiningGame()],
  tile: ["pbTilePuzzle", async () => {
    console.log("pbTilePuzzle:", await pbTilePuzzle(Number(params.get("type") ?? 1), params.get("board") ?? "Kabuto"));
  }],
  roulette: ["Roulette.start(1, BLUE)", () => Roulette.start(1, Roulette.BLUE)],
  duel: ["pbDuel (Blackbelt Cristian)", async () => { console.log("pbDuel:", await pbDuel("BLACKBELT", "Cristian", null, speeches)); }],
  dance: ["pbDanceGame(3, 124)", () => pbDanceGame(3, 124)],
  lottery: ["pbSetLotteryNumber / pbLottery", async () => {
    pbSetLotteryNumber(1);
    pbLottery(G.gameVariables.get(1));
    await pbMessage(`Number ${G.gameVariables.get(1)}: ${G.gameVariables.get(2)} (place ${G.gameVariables.get(3)}, ${G.gameVariables.get(4)} digits)`);
  }],
};
const [title, open] = GAMES[game] ?? GAMES.triad!;
const status = () => `${title}\nEnter/Space = USE, Esc/X = BACK, Z/Shift = ACTION\nCoins ${player.coins}  $${player.money}  cards ${triads().totalCards()}`;
hud.textContent = status();

runGame(async () => {
  for (;;) {
    await open();
    hud.textContent = status() + "\nEnter reopens";
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

/** Presses a key for a few ticks (KeyboardEvent code, e.g. "Enter", "Escape", "ArrowDown", "KeyZ"). */
async function press(code: string, ticks = 2): Promise<void> {
  dispatchEvent(new KeyboardEvent("keydown", { code }));
  await step(ticks);
  dispatchEvent(new KeyboardEvent("keyup", { code }));
  await step(1);
}

Object.assign(window, { __demo: { G, Graphics, Input, step, press, app, triads } });
