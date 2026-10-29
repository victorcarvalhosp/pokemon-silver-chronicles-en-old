// Dev page for ZUD Mechanics (web/dev-zud.html): a real Battle on the real
// BattleScene, a trainer battle on a map where Dynamax is allowed
// (DYNAMAX_ANY_MAP on), with the Dynamax Band and Z-Ring in the Bag:
//   ?mode=dynamax (default)  the player's Gigantamax Charizard leads: the
//                            fight menu shows the Dynamax button (Z/Shift
//                            toggles it); the opponent Dynamaxes its last Pokémon
//   ?mode=z                  Pikachu holding Pikanium Z leads (Z-Move button,
//                            Volt Tackle -> Catastropika); the opponent's
//                            Mew holds Firium Z (the AI may use Inferno Overdrive)
//   ?mode=ultra              Dusk Mane Necrozma holding Ultranecrozium Z (Ultra Burst)
//   ?anims=0                 battle animations off (the trainer recall/send-out
//                            Dynamax path instead of the cinematics)
//   Enter/Space/C = USE   Esc/X = BACK   arrows = move   Z = ACTION (mechanic)
// When the browser pane is hidden requestAnimationFrame stops; drive it with
// __demo.step(n) (60 Hz ticks) and __demo.press("Enter") from the console.

import { Battle } from "../battle";
import "../battle/zud/scene";
import { BattleScene } from "../battle/scene/BattleScene";
import { createScreen } from "../core/screen";
import { Settings } from "../data/gameData/settings";
import { pbBGMPlay } from "../game/GameSystem";
import { GameSystem } from "../game/GameSystem";
import { G, GameSwitches } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { Pokemon } from "../game/pokemon/Pokemon";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { NPCTrainer } from "../game/trainer/Trainer";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "dynamax";
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();
G.gameSwitches = new GameSwitches();
G.gameSwitches.set(Settings.DYNAMAX_ANY_MAP, true);
if (params.get("anims") === "0") G.pokemonSystem.battlescene = 1;

const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.hasPokedex = true;
player.badges = Array(8).fill(true); // every Pokémon obeys
const bag = new PokemonBag();
G.bag = bag;
for (const [item, qty] of [["DYNAMAXBAND", 1], ["ZRING", 1], ["POTION", 3]] as [string, number][]) bag.add(item, qty);
G.gameMap = { mapId: 4, events: new Map() } as never; // Route 29
G.scene = { async miniupdate() {} };

function mon(species: string, level: number, item: string | null, moves: string[], form = 0): Pokemon {
  const pkmn = new Pokemon(species, level, player);
  if (form) pkmn.formSimple = form;
  pkmn.item = item;
  pkmn.moves = [];
  for (const m of moves) pkmn.learnMove(m);
  pkmn.calcStats();
  return pkmn;
}

function playerParty(): Pokemon[] {
  switch (mode) {
    case "z":
      return [mon("PIKACHU", 50, "PIKANIUMZ", ["VOLTTACKLE", "THUNDERBOLT", "QUICKATTACK", "IRONTAIL"]),
        mon("CHARIZARD", 50, null, ["FLAMETHROWER", "AIRSLASH", "DRAGONCLAW", "PROTECT"])];
    case "ultra":
      return [mon("NECROZMA", 60, "ULTRANECROZIUMZ", ["PHOTONGEYSER", "SUNSTEELSTRIKE", "EARTHQUAKE", "DRAGONDANCE"], 1)];
  }
  const charizard = mon("CHARIZARD", 50, null, ["FLAMETHROWER", "AIRSLASH", "DRAGONCLAW", "PROTECT"]);
  charizard.gmaxFactor = true;
  return [charizard, mon("PIKACHU", 50, "PIKANIUMZ", ["VOLTTACKLE", "THUNDERBOLT", "QUICKATTACK", "IRONTAIL"])];
}

async function zudDemo(): Promise<void> {
  const party = playerParty();
  player.party = party;
  const rival = new NPCTrainer("Lance", "CHAMPION");
  rival.items = ["DYNAMAXBAND", "ZRING"];
  rival.party = mode === "z"
    ? [mon("MEW", 48, "FIRIUMZ", ["FLAMETHROWER", "PSYCHIC", "TACKLE", "PROTECT"])]
    : [mon("GENGAR", 46, null, ["SHADOWBALL", "SLUDGEBOMB", "PROTECT", "THUNDERBOLT"]),
      mon("LAPRAS", 48, null, ["SURF", "ICEBEAM", "BODYSLAM", "PROTECT"])];
  rival.loseText = "...";
  const scene = new BattleScene();
  current.scene = scene;
  const battle = new Battle(scene as never, party, rival.party, [player] as never, [rival] as never);
  battle.items = [rival.items];
  battle.internalBattle = true;
  battle.expGain = false;
  battle.moneyGain = false;
  battle.backdrop = "grass";
  battle.backdropBase = "grass";
  current.battle = battle;
  pbBGMPlay("Battle trainer");
  hud.textContent = `ZUD demo (${mode}): Z = toggle Dynamax / Z-Move / Ultra Burst in the fight menu`;
  const decision = await battle.pbStartBattle();
  hud.textContent = `Battle over (decision ${decision}).`;
}

const current: { scene: BattleScene | null; battle: Battle | null } = { scene: null, battle: null };

async function waitForKey(keys: number[]): Promise<void> {
  for (;;) {
    await Graphics.update();
    Input.update();
    if (keys.some((k) => Input.trigger(k))) return;
  }
}

runGame(async () => {
  for (;;) {
    await zudDemo();
    hud.textContent += " Enter restarts.";
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

/** The canvas as a PNG data URL (after rendering). */
function snapshot(): string {
  render();
  return (app.canvas as HTMLCanvasElement).toDataURL("image/png");
}

Object.assign(window, { __demo: { G, Graphics, Input, step, press, snapshot, current } });
