// Dev page for Essentials Deluxe's battle extras and Enhanced UI's battle
// windows (web/dev-deluxe.html): a real Battle on the real BattleScene, a
// trainer battle where
// - the player's Charizard holds Charizardite X and the Bag has a Mega Ring
//   (the fight menu shows the Mega button: Z/Shift toggles it);
// - the opponent (Beauty Opal, with a Mega Ring) Mega Evolves her Gyarados
//   (AI) after the DEMO_MEGA_EVOLUTION speech;
// - a midbattle script runs speech, text and battler effects mid-fight.
// In the command/fight menus N opens Battle Info, M (fight menu) Move Info.
//
//   ?script=0  no midbattle script     ?double=1  double battle
//   ?cinematic=1  Essentials Deluxe's Mega/Primal cinematics instead of the
//                 game's Common:MegaEvolution animations (as if it had none)
//   ?primal=1  the player leads with Kyogre (Blue Orb) instead
//   Enter/Space/C = USE   Esc/X = BACK   arrows = move   Z = ACTION (Mega)
// When the browser pane is hidden requestAnimationFrame stops; drive it with
// __demo.step(n) (60 Hz ticks) and __demo.press("Enter") from the console.

import { Battle } from "../battle";
import "../battle/deluxe";
import { dxClear } from "../battle/deluxe/DeluxeTemp";
import { EssentialsDeluxe } from "../battle/deluxe/Midbattle_Config";
import { sym as $ } from "../battle/deluxe/rubyData";
import { PBEffects } from "../battle/other/PBEffects";
import { BattleScene } from "../battle/scene/BattleScene";
import { createScreen } from "../core/screen";
import { pbBGMPlay } from "../game/GameSystem";
import { GameSystem } from "../game/GameSystem";
import { G } from "../game/globals";
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
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();

const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.hasPokedex = true;
for (let i = 0; i < 8; i++) player.badges[i] = true; // (so that Lv. 60 Pokémon obey)
const bag = new PokemonBag();
G.bag = bag;
for (const [item, qty] of [["MEGARING", 1], ["POTION", 3], ["POKEBALL", 3]] as [string, number][]) bag.add(item, qty);
G.gameMap = { mapId: 4, events: new Map() } as never; // Route 29
G.scene = { async miniupdate() {} };

function mon(species: string, level: number, item: string | null, moves: string[]): Pokemon {
  const pkmn = new Pokemon(species, level, player);
  pkmn.item = item;
  pkmn.moves = [];
  for (const m of moves) pkmn.learnMove(m);
  return pkmn;
}

/** The midbattle script: the DEMO_MEGA_EVOLUTION preset plus speech, text and battler effects. */
function midbattleScript(): Record<string, unknown> {
  return {
    ...EssentialsDeluxe.DEMO_MEGA_EVOLUTION,
    turnCommand_1: [$("Opposing"), "So you're the trainer everyone's talking about, \\PN.",
      "My {1} and I won't hold back!"],
    attackerSEdmg: { text: "{1}'s attack hit a weak spot!" },
    turnEnd_1: {
      battler: $("Opposing"),
      speech: "Not bad... but my partner won't go down that easily!",
      stats: [$("DEFENSE"), 1, $("SPECIAL_DEFENSE"), 1],
      effects: [[PBEffects.FocusEnergy, 2, "{1} is getting pumped!"]],
    },
    turnEnd_2: {
      text: "A strong wind blows across the battlefield...",
      team: [[PBEffects.Tailwind, 3, "A tailwind blew behind {1}!"]],
    },
    fainted_foe: "Return, my friend. You did well.",
    switchSentOutLast_foe: "This is my last Pokémon. Let's finish this!",
    loss: "Better luck next time!",
  };
}

async function deluxeDemo(): Promise<void> {
  const party = [
    mon("CHARIZARD", 60, "CHARIZARDITEX", ["DRAGONCLAW", "FLAMETHROWER", "AIRSLASH", "DRAGONDANCE"]),
    mon("AMPHAROS", 60, "AMPHAROSITE", ["THUNDERBOLT", "DRAGONPULSE", "THUNDERWAVE", "COTTONGUARD"]),
  ];
  player.party = party;
  const opal = new NPCTrainer("Opal", "BEAUTY");
  opal.items = ["MEGARING"];
  opal.party = [
    mon("GYARADOS", 58, "GYARADOSITE", ["WATERFALL", "CRUNCH", "ICEFANG", "DRAGONDANCE"]),
    mon("ABSOL", 56, "ABSOLITE", ["NIGHTSLASH", "PSYCHOCUT", "SWORDSDANCE", "QUICKATTACK"]),
  ];
  opal.loseText = "Well, that was a delight.";
  G.gameTemp.dxRules = {};
  G.gameTemp.dxMidbattle = params.get("script") === "0" ? null : midbattleScript();
  const scene = new BattleScene();
  current.scene = scene;
  if (params.get("cinematic") === "1") {
    const exists = scene.pbCommonAnimationExists.bind(scene);
    scene.pbCommonAnimationExists = (name: string) => !/^(MegaEvolution|PrimalKyogre|PrimalGroudon)/.test(name) && exists(name);
  }
  if (params.get("primal") === "1") party.unshift(mon("KYOGRE", 70, "BLUEORB", ["SURF", "ICEBEAM", "THUNDER", "CALMMIND"]));
  const battle = new Battle(scene as never, party, opal.party, [player] as never, [opal] as never);
  battle.setBattleMode(params.get("double") === "1" ? "double" : "single");
  battle.items = [opal.items]; // (TrainerBattle.start_core passes the foes' items: her Mega Ring)
  battle.internalBattle = true;
  battle.expGain = false;
  battle.moneyGain = false;
  battle.backdrop = "grass";
  battle.backdropBase = "grass";
  current.battle = battle;
  pbBGMPlay("Battle trainer");
  hud.textContent = "Deluxe demo: Z = Mega Evolution, M = Move Info (fight menu), N = Battle Info";
  const decision = await battle.pbStartBattle();
  hud.textContent = `Battle over (decision ${decision}).`;
  dxClear(() => {}, () => {});
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
    await deluxeDemo();
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

/** Presses a key for a few ticks (KeyboardEvent code, e.g. "Enter", "Escape", "ArrowDown", "KeyZ", "KeyM"). */
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
