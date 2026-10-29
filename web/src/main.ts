// Boots the game like Essentials' mainFunction: Game.initialize, then a
// click (browsers only allow sound after a user gesture), Game.set_up_system,
// and the $scene loop: title -> load screen -> Scene_Map -> back to title.

import { PBDebug } from "./battle/other/PBDebug";
import { DEBUG } from "./core/debug";
import { createScreen } from "./core/screen";
import { Data } from "./data/store";
import { Game } from "./game/Game";
import { G } from "./game/globals";
import { initializeGame } from "./game/newGame";
import { SaveData } from "./game/save/SaveData";
import { missingScripts } from "./game/scriptApi";
import { unlockAudio } from "./rgss/Audio";
import { loadFonts } from "./rgss/Bitmap";
import { Graphics, initGraphics, render, runGame, runTick } from "./rgss/Graphics";
import { SceneMap } from "./scenes/SceneMap";
import { LOAD_SCREEN_BITMAPS, PokemonLoad_Scene, PokemonLoadScreen } from "./ui/load/loadScreen";
import { pbGetMapNameFromId } from "./ui/planes";
import { preloadBitmaps } from "./ui/rpgCache";
import { pbSaveScreen } from "./ui/save/saveScreen";
import { runTitleScreen } from "./ui/scenes/SplashesAndTitleScreen";
import { MenuScreens } from "./ui/menus/menuScreens";

const FONT_FILES = [
  "power clear bold.ttf", "power clear.ttf", "power green narrow.ttf", "power green small.ttf",
  "power green.ttf", "power red and blue intl.ttf", "power red and blue.ttf", "power red and green.ttf",
];

const hud = document.getElementById("hud")!;
// PBDebug.logonerr: as in the original, an error in a battle phase is reported
// (in the console here) and the battle carries on. Tests leave this off.
PBDebug.continueOnError = true;
const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
hud.textContent = "Loading…";
await Promise.all([initializeGame(), loadFonts(FONT_FILES), preloadBitmaps(LOAD_SCREEN_BITMAPS)]);
hud.textContent = "Click or press a key to start";
await new Promise<void>((resolve) => {
  const go = () => {
    removeEventListener("pointerdown", go);
    removeEventListener("keydown", go);
    resolve();
  };
  addEventListener("pointerdown", go);
  addEventListener("keydown", go);
});
await unlockAudio();
hud.textContent = "";

// In debug mode the HUD shows where the player is ("Map 25 Mr. Pokémon's House (9,11)").
let crashed = false;
if (DEBUG) {
  let shown = "";
  const showMapInfo = () => {
    const map = G.gameMap;
    const text = crashed || !map ? "" : `Map ${map.mapId} ${pbGetMapNameFromId(map.mapId)} (${G.gamePlayer!.x},${G.gamePlayer!.y})`;
    if (!crashed && text !== shown) hud.textContent = shown = text;
  };
  setInterval(showMapInfo, 100);
}

// Exposed for debugging in the browser console.
// __step(n) advances n ticks by hand (requestAnimationFrame stops in hidden tabs).
const __step = async (n: number) => {
  for (let i = 0; i < n; i++) await runTick();
  render();
};
Object.assign(window, { G, Data, SaveData, Game, pbSaveScreen, MenuScreens, missingScripts, app, __step, Graphics });

runGame(
  async () => {
    await Game.setUpSystem();
    for (;;) {
      Graphics.freeze();
      const branch = await runTitleScreen(); // Scene_Intro: splashes, then the title
      Graphics.freeze();
      const screen = new PokemonLoadScreen(new PokemonLoad_Scene());
      await screen.init();
      if (branch === "delete") {
        await screen.pbStartDeleteScreen();
        continue;
      }
      const choice = await screen.pbStartLoadScreen();
      if (choice.action === "continue") await Game.load(choice.save);
      else if (choice.action === "new_game") await Game.startNew();
      else continue; // Quit Game can't close a browser tab: back to the title.
      const scene = new SceneMap();
      G.scene = scene as never;
      // mainFunction: `$scene.main while $scene` (events can switch to Scene_Credits and back).
      while (G.scene) await (G.scene as unknown as { main(): Promise<void> }).main();
    }
  },
  (e) => {
    console.error(e);
    crashed = true;
    hud.textContent = `Error: ${(e as Error).message ?? e}`;
  },
);
