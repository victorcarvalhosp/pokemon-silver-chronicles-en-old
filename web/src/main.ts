// Boots the game: data and fonts, then a click (browsers only allow sound
// after a user gesture), then the game coroutine.

import { assetExists } from "./core/assets";
import { createScreen } from "./core/screen";
import { Data } from "./data/store";
import { G } from "./game/globals";
import { initializeGame, startNewGame } from "./game/newGame";
import { missingScripts } from "./game/scriptApi";
import { unlockAudio } from "./rgss/Audio";
import { loadFonts } from "./rgss/Bitmap";
import { initGraphics, runGame } from "./rgss/Graphics";
import { prepareMap, SceneMap } from "./scenes/SceneMap";

const FONT_FILES = [
  "power clear bold.ttf", "power clear.ttf", "power green narrow.ttf", "power green small.ttf",
  "power green.ttf", "power red and blue intl.ttf", "power red and blue.ttf", "power red and green.ttf",
];

const hud = document.getElementById("hud")!;
const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
hud.textContent = "Loading…";
await Promise.all([initializeGame(), loadFonts(FONT_FILES.filter((f) => assetExists(`Fonts/${f}`) || true))]);
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

// Exposed for debugging in the browser console.
Object.assign(window, { G, Data, missingScripts, app });

runGame(
  async () => {
    // TODO(M3): title screen + continue/new game.
    await prepareMap(Data.system.startMapId);
    startNewGame();
    const scene = new SceneMap();
    G.scene = scene as never;
    await scene.main();
  },
  (e) => {
    console.error(e);
    hud.textContent = `Error: ${(e as Error).message ?? e}`;
  },
);
