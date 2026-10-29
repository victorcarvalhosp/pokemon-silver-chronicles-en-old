// Dev page for Pokémon Amie (web/dev-amie.html): opens pokemonAmieRefresh
// straight away with a demo party and a Bag of food.
//
//   ?index=n   play with party member n (default: the first able one)
//   ?map=id    map whose metadata picks the backdrop (default: none, "IndoorA")
//   ?talk=1    keep Following Pokemon EX's map/weather/generic dialogue that
//              plays when the scene opens (needs a real map; off by default)
//
// Mouse: pet the Pokémon by holding the left button on it and moving; open
// the food bar (top left), hold still on a food for 0.2 s to pick it up and
// hold it on the Pokémon to feed it; Switch (bottom right) / Back (bottom
// left); Esc/X = BACK. The scene reopens with Enter after it closes. When the
// browser pane is hidden requestAnimationFrame stops; drive it with
// __demo.step(n) from the console.

import { createScreen } from "../core/screen";
import { EventHandlers } from "../game/eventHandlers";
import { GameSystem } from "../game/GameSystem";
import { G, PokemonGlobalMetadata } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { Pokemon } from "../game/pokemon/Pokemon";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { pokemonAmieRefresh } from "../plugins/pokemonAmie/PokeAmieScene";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
addEventListener("keydown", () => void unlockAudio(), { once: true });
addEventListener("pointerdown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();
G.pokemonGlobal = new PokemonGlobalMetadata() as never;

//-------------------------------------------------------------------------------
// Demo trainer, party and Bag
//-------------------------------------------------------------------------------
const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;

const typhlosion = new Pokemon("TYPHLOSION", 36);
typhlosion.amieAffection = 120;
typhlosion.amieFullness = 40;
typhlosion.amieEnjoyment = 200;
const pikachu = new Pokemon("PIKACHU", 22);
pikachu.amieAffection = 255;
pikachu.amieFullness = 254;
const egg = new Pokemon("TOGEPI", 1);
egg.name = "Egg";
egg.stepsToHatch = 2000;
const geodude = new Pokemon("GEODUDE", 14);
geodude.hp = 0;
const marill = new Pokemon("MARILL", 18);
player.party = [typhlosion, pikachu, egg, geodude, marill];

const bag = new PokemonBag();
G.bag = bag;
for (const [item, qty] of [
  ["RAZZBERRY", 5], ["BLUKBERRY", 3], ["NANABBERRY", 2], ["PINAPBERRY", 9], ["CORNNBERRY", 1], ["MAGOSTBERRY", 4],
  ["LIECHIBERRY", 1], ["ORANBERRY", 2], ["POTION", 3],
] as [string, number][]) bag.add(item, qty);

// The map: no events; its metadata (?map=) picks the backdrop. The player only
// answers pbGetEnvironment's terrain tag questions.
G.gameMap = (params.get("map") ? { mapId: Number(params.get("map")), events: new Map() } : null) as never;
const noTag = { battleEnvironment: null };
G.gamePlayer = { terrainTag: () => noTag, pbFacingTerrainTag: () => noTag } as never;
G.scene = { async miniupdate() {} };

// Following Pokemon EX's talk handlers (all but Amie's) read the map and the
// follower; without ?talk=1 they're left out.
if (params.get("talk") !== "1") {
  for (const key of ["status", "pokemon_lab", "player_house", "pokemon_center", "gym", "storm_weather", "snow_weather",
    "blizzard_weather", "sandstorm_weather", "forest_map", "rainy_weather", "beach_map", "sunny_weather",
    "music_generic", "angry_generic", "ellipses_generic", "happy_generic", "heart_generic", "generic"]) {
    EventHandlers.remove("following_pkmn_talk", key);
  }
}

function state(): string {
  return player.party.map((p) => `${p.name}: ${p.amieAffection}/${p.amieFullness}/${p.amieEnjoyment}`).join("  ") +
    `\nBag: ${["RAZZBERRY", "BLUKBERRY", "NANABBERRY", "PINAPBERRY", "CORNNBERRY", "MAGOSTBERRY", "LIECHIBERRY", "ORANBERRY"]
      .map((i) => `${i} ${bag.quantity(i)}`).join(", ")}`;
}

runGame(async () => {
  const index = params.get("index");
  for (;;) {
    hud.textContent = `dev-amie (affection/fullness/enjoyment)\n${state()}`;
    await pokemonAmieRefresh(index == null ? null : Number(index));
    hud.textContent = `Amie closed. Press Enter to reopen.\n${state()}`;
    console.info("[amieDemo]", state());
    while (!Input.trigger(Input.USE)) {
      await Graphics.update();
      Input.update();
    }
    Input.update();
  }
}, (e) => {
  console.error(e);
  hud.textContent = String(e instanceof Error ? e.stack : e);
});

/** Console helpers for driving the page when requestAnimationFrame is paused: __demo.step(ticks). */
async function step(ticks = 1): Promise<number> {
  for (let i = 0; i < ticks; i++) await runTick();
  render();
  return Graphics.frameCount;
}
Object.assign(window, { __demo: { G, Graphics, player, bag, step, state } });
