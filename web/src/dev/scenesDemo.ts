// Dev page for the opening's UI scenes (web/dev-scenes.html):
//   ?scene=title     splashes + title screen (runTitleScreen)
//   ?scene=gender    BW Gender Selector, including the name entry
//   ?scene=name      name entry alone (&input=1 for the keyboard version)
//   ?scene=controls  pbEventScreen(ButtonEventScene)
//   ?scene=keyitem   BW Key Items (&item=iconPokegear | BICYCLE | ...)
//   ?scene=wardrobe  TC Wardrobe (every outfit unlocked)
// Each scene restarts when it ends. Enter/Space/C = USE, Esc/X = BACK,
// Z = ACTION (Shift), D = SPECIAL.

import { loadAssetIndex } from "../core/assets";
import { createScreen } from "../core/screen";
import { loadSystem } from "../data/loader";
import { Data } from "../data/store";
import { GameSystem } from "../game/GameSystem";
import { G } from "../game/globals";
import { setMetadata } from "../game/metadata";
import { unlockAudio } from "../rgss/Audio";
import { Bitmap } from "../rgss/Bitmap";
import { Sprite } from "../rgss/display";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color } from "../rgss/types";
import { drawTextEx } from "../ui/drawText";
import { initMessageSystem, pbSetSystemFont } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { ButtonEventScene } from "../ui/scenes/ButtonEventScene";
import { pbEventScreen } from "../ui/scenes/EventScene";
import { pbGenderSelector } from "../ui/scenes/GenderSelector";
import { pbGetKeyItem } from "../ui/scenes/KeyItem";
import { runTitleScreen } from "../ui/scenes/SplashesAndTitleScreen";
import { WardrobeConfig, pbUnlockOutfit, pbWardrobe } from "../ui/scenes/Wardrobe";
import { pbEnterPlayerName } from "../ui/textEntry/UI_TextEntry";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const scene = params.get("scene") ?? "gender";
addEventListener("keydown", () => void unlockAudio(), { once: true });
addEventListener("pointerdown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await loadAssetIndex();
Data.system = await loadSystem();
G.gameSystem = new GameSystem();
setMetadata({ players: await (await fetch("/data/pbs/player-metadata.json")).json() });
const player = { name: "Gold", characterID: 1, outfit: 0, gender: 0, money: 3000 };
G.player = player;
G.pokemonSystem.textinput = Number(params.get("input") ?? 0);
await initMessageSystem();

// A backdrop standing in for the map, so fades and transparent parts show.
const backdrop = new Sprite();
backdrop.setBitmap(new Bitmap(Graphics.width, Graphics.height));
backdrop.z = -1;
function drawBackdrop(text: string): void {
  const b = backdrop.bitmap!;
  b.fillRect(0, 0, b.width, b.height, new Color(40, 56, 72));
  for (let y = 0; y < b.height; y += 32) {
    for (let x = (y / 32) % 2 ? 32 : 0; x < b.width; x += 64) b.fillRect(x, y, 32, 32, new Color(48, 66, 84));
  }
  pbSetSystemFont(b);
  drawTextEx(b, 16, 16, b.width - 32, 0, text, new Color(248, 248, 248), new Color(72, 80, 88));
}

function state(): string {
  const sw = (id: number) => (G.gameSwitches.get(id) ? "on" : "off");
  return `name=${player.name} characterID=${player.characterID} outfit=${player.outfit} ` +
    `switch140(boy)=${sw(140)} switch141(girl)=${sw(141)}`;
}

const scenes: Record<string, () => Promise<string>> = {
  async title() {
    const branch = await runTitleScreen();
    return `runTitleScreen() -> "${branch}"`;
  },
  async gender() {
    await pbGenderSelector();
    return state();
  },
  async name() {
    const name = await pbEnterPlayerName("Your name?", 0, 10);
    return `pbEnterPlayerName -> "${name}"`;
  },
  async controls() {
    await pbEventScreen(ButtonEventScene);
    return "pbEventScreen(ButtonEventScene) done";
  },
  async keyitem() {
    const item = params.get("item") ?? "iconPokegear";
    await pbGetKeyItem(item, 1, null, (it, qty) => pbMessage(`(pbReceiveItem(:${it}, ${qty}) would run here.)`));
    return `pbGetKeyItem("${item}") done`;
  },
  async wardrobe() {
    WardrobeConfig.OUTFITS.forEach((_, i) => pbUnlockOutfit(i));
    const ret = await pbWardrobe();
    return `pbWardrobe -> ${ret.constructor.name}; ${state()}`;
  },
};

runGame(async () => {
  const run = scenes[scene];
  if (!run) throw new Error(`Unknown scene "${scene}" (${Object.keys(scenes).join(", ")})`);
  let last = "";
  for (;;) {
    drawBackdrop(`dev-scenes: ${scene}\n${last}\nPress USE to (re)start.`);
    hud.textContent = `?scene=${scene}  ${last}`;
    while (!Input.trigger(Input.USE)) {
      await Graphics.update();
      Input.update();
    }
    Input.update();
    last = await run();
    console.info("[scenesDemo]", last);
  }
}, (e) => {
  console.error(e);
  hud.textContent = String(e instanceof Error ? e.stack : e);
});

/**
 * Console helpers for driving the page when requestAnimationFrame is paused
 * (e.g. a hidden preview pane): __demo.step(ticks), __demo.tap("Enter").
 */
async function step(ticks = 1): Promise<number> {
  for (let i = 0; i < ticks; i++) await runTick();
  render();
  return Graphics.frameCount;
}
async function tap(code: string, holdTicks = 2): Promise<void> {
  dispatchEvent(new KeyboardEvent("keydown", { code, key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code }));
  await step(holdTicks);
  dispatchEvent(new KeyboardEvent("keyup", { code }));
}
Object.assign(window, { __demo: { G, Graphics, player, step, tap } });
