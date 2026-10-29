// Dev page for the menus (web/dev-menus.html): opens one screen standalone
// over Map003 (the player's house).
//
//   ?screen=pause    DP Pause Menu (Z/Shift reopens it after it closes)
//   ?screen=options  Options screen (?load=1: as opened from the load screen)
//   ?screen=ready    Ready Menu with demo registered items (?bag=0: no bag)
//   &save=1          show Save in the pause menu (off by default: saving here
//                    would overwrite the real save, which shares this origin)
//
//   Enter/Space/C = USE   Esc/X = BACK   Z/Shift = ACTION   D = SPECIAL
// When the browser pane is hidden requestAnimationFrame stops; drive it with
// __demo.step(n) (n ticks + render) from the console.

import { loadAssetIndex } from "../core/assets";
import { createScreen } from "../core/screen";
import { loadMap, loadTileset } from "../data/loader";
import { loadGameData } from "../data/store";
import { GameSystem } from "../game/GameSystem";
import { G } from "../game/globals";
import { TilemapRenderer } from "../map/TilemapRenderer";
import { unlockAudio } from "../rgss/Audio";
import { Bitmap } from "../rgss/Bitmap";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Rect } from "../rgss/types";
import { pbFadeOutIn } from "../ui/fades";
import { initMessageSystem } from "../ui/messageConfig";
import { MenuData } from "../ui/menus/menuScreens";
import { pbPauseMenu } from "../ui/menus/pauseMenu";
import { pbUseKeyItem } from "../ui/menus/readyMenu";
import { PokemonOption_Scene, PokemonOptionScreen } from "../ui/options/options";
import { preloadBitmaps } from "../ui/rpgCache";
import { IconSprite } from "../ui/SpriteWrapper";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const screen = params.get("screen") ?? "pause";
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await Promise.all([loadGameData(), loadAssetIndex()]);
await initMessageSystem();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = params.get("save") !== "1";
// Demo trainer: the fields the menus read (the Player model isn't ported yet).
G.player = Object.assign({ name: "Gold", gender: 0, money: 3000 }, {
  hasPokedex: true, hasPokegear: true, hasRunningShoes: true, party: [{}],
}) as never;

//-------------------------------------------------------------------------------
// Map003 backdrop
//-------------------------------------------------------------------------------
const map = await loadMap(3);
const tileset = await loadTileset(map.tilesetId);
const mapViewport = new Viewport(0, 0, 512, 384);
const tilemap = new TilemapRenderer(mapViewport.node);
await tilemap.prepare(tileset);
const displayX = Math.min(Math.max(12 * 32 + 16 - 256, 0), map.width * 32 - 512);
const displayY = Math.min(Math.max(8 * 32 + 16 - 192, 0), map.height * 32 - 384);
const playerBmp = await Bitmap.load("Graphics/Characters/0_base_ethan");
const playerSprite = new Sprite(mapViewport);
if (playerBmp) {
  playerSprite.setBitmap(playerBmp);
  playerSprite.srcRect = new Rect(0, 0, playerBmp.width / 4, playerBmp.height / 4);
  playerSprite.x = 11 * 32 - displayX;
  playerSprite.y = 8 * 32 + 32 - displayY - playerBmp.height / 4;
  playerSprite.z = 10;
}
G.gameMap = { mapId: 3, events: new Map() };
const mapSource = {
  mapId: 3, width: map.width, height: map.height, tileset, displayX, displayY,
  tile: (x: number, y: number, z: number) => map.layers[z]?.[y]?.[x] ?? 0,
};
G.scene = {
  async miniupdate() {
    tilemap.update(Graphics.deltaS);
    tilemap.draw([mapSource], 0);
  },
};
tilemap.draw([mapSource], 0);

//-------------------------------------------------------------------------------
// Ready Menu demo data: a bag with registered key items (until the Bag lands)
//-------------------------------------------------------------------------------
const DEMO_ITEMS: Record<string, string> = { BICYCLE: "Bicycle", ITEMFINDER: "Itemfinder", OLDROD: "Old Rod" };
if (screen === "ready" && params.get("bag") !== "0") {
  (G as unknown as { bag: unknown }).bag = {
    registeredItems: Object.keys(DEMO_ITEMS),
    readyMenuSelection: [0, 0, 1],
    has: (item: string) => item in DEMO_ITEMS,
    quantity: () => 1,
  };
  MenuData.itemName = (item) => DEMO_ITEMS[item] ?? item;
  MenuData.itemIsImportant = () => true;
  await preloadBitmaps(Object.keys(DEMO_ITEMS).map((i) => `Graphics/Items/${i}`));
  MenuData.itemIconSprite = (x, y, item, viewport) => {
    const s = new IconSprite(x, y, viewport);
    s.setBitmapFile(`Graphics/Items/${item}`);
    if (s.bitmap) {
      s.ox = Math.floor(s.bitmap.width / 2);
      s.oy = Math.floor(s.bitmap.height / 2);
    }
    return s;
  };
}

//-------------------------------------------------------------------------------
async function waitForKey(keys: number[]): Promise<void> {
  for (;;) {
    await Graphics.update();
    Input.update();
    await G.scene!.miniupdate!();
    if (keys.some((k) => Input.trigger(k))) return;
  }
}

const SCREENS: Record<string, [string, () => Promise<void>, number[]]> = {
  pause: ["DP Pause Menu (Z/Shift reopens)", async () => {
    G.gameTemp.inMenu = true;
    await pbPauseMenu();
    G.gameTemp.inMenu = false;
  }, [Input.ACTION, Input.USE]],
  options: ["Options (Enter reopens)", async () => {
    await pbFadeOutIn(async () => {
      await new PokemonOptionScreen(new PokemonOption_Scene()).pbStartScreen(params.get("load") === "1");
    });
  }, [Input.USE]],
  ready: ["Ready Menu (D reopens)", () => pbUseKeyItem(), [Input.SPECIAL, Input.USE]],
};
const [title, open, reopenKeys] = SCREENS[screen] ?? SCREENS.pause!;
hud.textContent = `${title}\nEnter/Space = USE, Esc/X = BACK, Z/Shift = ACTION, D = SPECIAL`;

runGame(async () => {
  for (;;) {
    await open();
    await waitForKey(reopenKeys);
  }
}, (e) => {
  console.error(e);
  hud.textContent = String(e instanceof Error ? e.stack : e);
});

async function step(n = 1): Promise<void> {
  for (let i = 0; i < n; i++) await runTick();
  render();
}

Object.assign(window, { __demo: { G, Graphics, Input, step } });
