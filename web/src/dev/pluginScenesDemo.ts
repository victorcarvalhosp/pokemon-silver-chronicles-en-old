// Dev page for small plugin scenes (web/dev-plugin-scenes.html):
//   ?scene=myui    Experiment with Scene: MyUIScreen.new(MyUI::Scene.new).pbStartScreen.
//                  pbStartScene raises TypeError as in Ruby (shown in the HUD);
//                  the page then runs pbMyUI and pbEndScene anyway (BACK closes),
//                  which the game never reaches.
//   ?scene=unown   Unown Report (Scene_Unownreport) with some Unown forms seen
//                  (&forms=0,5,26 for others, &forms=all for all 28);
//                  Up/Down scroll, BACK closes (USE does nothing, as in Ruby).
//   ?scene=mega    The Mega Evolution plugin's SceneMegaEvolution (not used in
//                  battle: Essentials Deluxe's pbMegaEvolve replaces it):
//                  start, makeMega, endScene. &species=AMPHAROS&backdrop=battle1&time=0
// Each scene restarts with USE after it ends. Enter/Space/C = USE, Esc/X = BACK.

import { Species } from "../data/gameData/species";
import { GameSystem } from "../game/GameSystem";
import { G, PokemonGlobalMetadata } from "../game/globals";
import { initializeGame } from "../game/newGame";
import { Pokemon } from "../game/pokemon/Pokemon";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { createScreen } from "../core/screen";
import { MyUIScene, MyUIScreen } from "../plugins/experimentWithScene/MyUIScene";
import { SceneMegaEvolution } from "../plugins/megaEvolution/SceneMegaEvolution";
import { Scene_Unownreport } from "../plugins/unownReport/UnownReportMechanic";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
const scene = params.get("scene") ?? "unown";
addEventListener("keydown", () => void unlockAudio(), { once: true });
addEventListener("pointerdown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();
G.pokemonGlobal = new PokemonGlobalMetadata() as never;
const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;

/** The scene being shown (window.__demo.current), for inspecting it from the console. */
const demo: { current: unknown } = { current: null };

const scenes: Record<string, () => Promise<string>> = {
  async myui() {
    const s = new MyUIScene();
    demo.current = s;
    try {
      await new MyUIScreen(s).pbStartScreen();
      return "pbStartScreen finished";
    } catch (e) {
      const err = `${(e as Error).name}: ${(e as Error).message}`;
      hud.textContent = `?scene=myui  pbStartScene raised ${err} (as in Ruby).\n` +
        "Dev page only: running pbMyUI + pbEndScene now; BACK closes.";
      await s.pbMyUI();
      await s.pbEndScene();
      return `pbStartScene raised ${err}; then pbMyUI/pbEndScene (dev page only)`;
    }
  },
  async unown() {
    const forms = params.get("forms") ?? "0,3,5,7,12,13,19,24,25,26,27";
    player.pokedex.clear();
    const list = forms === "all" ? [...Array(28).keys()] : forms.split(",").map(Number);
    for (const f of list) player.pokedex.register("UNOWN", 0, f);
    const report = new Scene_Unownreport();
    demo.current = report;
    G.scene = report as never;
    await report.main();
    const next = (G.scene as object | null)?.constructor.name;
    G.scene = null as never; // ($scene is now a new Scene_Map; the page doesn't run it)
    return `Scene_Unownreport closed, $scene = ${next}; forms seen: ${list.join(",")}`;
  },
  async mega() {
    const species = params.get("species") ?? "AMPHAROS";
    const pkmn = new Pokemon(species, 50);
    // Hold the species' Mega Stone (its first Mega form's).
    const mega = [...Species.each()].find((d) => d.species === pkmn.species && d.megaStone);
    if (mega) pkmn.item = mega.megaStone!;
    const megaForm = pkmn.getMegaForm();
    const s = new SceneMegaEvolution();
    demo.current = s;
    hud.textContent = `?scene=mega  ${species} (mega form ${megaForm})`;
    await s.start(Number(params.get("time") ?? 0), params.get("backdrop") ?? "battle1", pkmn);
    if (megaForm > 0) pkmn.makeMega();
    await s.endScene();
    return `SceneMegaEvolution done: ${species} form ${pkmn.form}`;
  },
};

runGame(async () => {
  const run = scenes[scene];
  if (!run) throw new Error(`Unknown scene "${scene}" (${Object.keys(scenes).join(", ")})`);
  let last = "";
  for (;;) {
    hud.textContent = `?scene=${scene}  ${last}`;
    last = await run();
    console.info("[pluginScenesDemo]", last);
    hud.textContent = `?scene=${scene}  ${last}\nPress USE to restart.`;
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

/** Console helpers for driving the page when requestAnimationFrame is paused: __demo.step(ticks), __demo.tap("Enter"). */
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
Object.assign(window, { __demo: Object.assign(demo, { G, Graphics, player, step, tap }) });
