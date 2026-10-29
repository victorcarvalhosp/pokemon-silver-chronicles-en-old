// Dev page for Social Links (web/dev-social.html): opens pbSocialMedia (the
// list) straight away with a few links, some of them matched from phone
// contacts (pbAddSocialLinksFromPhone), so profiles show the call button.
//
//   ?empty=1      no links ("You have no links.")
//   ?profile=ID   open that profile directly (pbSocialMediaDirect)
//   ?theme=Name   Blue (default), Green, Gray or Orange
//
// Keys: arrows move, Enter (USE) opens a profile / calls the contact, A
// (ACTION) favourites, Z/D (SPECIAL) sorts, Esc/X (BACK) closes. The list
// reopens with Enter after it closes. When the browser pane is hidden
// requestAnimationFrame stops; drive it with __demo.step(n) from the console.

import { createScreen } from "../core/screen";
import { GameSystem } from "../game/GameSystem";
import { G, PokemonGlobalMetadata } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { pbPhoneRegisterNPC } from "../game/scripts/phone";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import * as F from "../plugins/socialLinks/functions";
import { pbPlayerSocialLinksSaved } from "../plugins/socialLinks/player";
import { pbSocialMedia, pbSocialMediaDirect } from "../plugins/socialLinks/SocialUI";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { pbPhoneRegister } from "../ui/pokegear/phone";

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
G.bag = new PokemonBag();
G.pokemonGlobal = new PokemonGlobalMetadata() as never;
const player = new Player("Gold", "PkMnTRAINER_Male");
player.hasPokegear = true;
G.player = player as never;
G.gameMap = { mapId: 3, events: new Map() } as never; // New Bark Town (the contacts' calls read it)
G.scene = { async miniupdate() {} };

//-------------------------------------------------------------------------------
// Demo links
//-------------------------------------------------------------------------------
if (params.get("empty") !== "1") {
  // Phone contacts as the game's events register them, then synced
  await pbPhoneRegisterNPC(53, "Mother", 3, false);
  await pbPhoneRegisterNPC(52, "Professor \nOak", 362, false);
  pbPhoneRegister(null, "YOUNGSTER", "Joey");
  await F.pbAddSocialLinksFromPhone(true);
  for (const id of ["BROCK", "RED", "PROFELM"]) await F.pbAddSocialLink(id, true);
  await F.pbGainSocialLinkBond("JOEY", 6, true);
  await F.pbGainSocialLinkBond("PROFOAK", 9, true);
  await F.pbGainSocialLinkBond("BROCK", 3, true);
  await F.pbGainSocialLinkBond("MOTHER", 2, true);
  F.pbSetSocialLinkStatus("PROFOAK", "Hello \\PN! You have \\PM. \\bBlue\\r and red.");
  F.pbSetSocialLinkFavoritePokemon("RED", "PIKACHU", 0, 0, false);
}
if (params.get("theme")) F.pbSetSocialTheme(params.get("theme")!);

function state(): string {
  const links = [...pbPlayerSocialLinksSaved().links.values()];
  return links.map((l) => `${l.id} bond ${l.bond}${l.favorite ? " *" : ""}${l.hasPhoneContact() ? " (phone)" : ""}`).join("  ") +
    `\nBond effects: ${JSON.stringify(player.bondEffects)}`;
}

runGame(async () => {
  const profile = params.get("profile");
  for (;;) {
    hud.textContent = `dev-social\n${state()}`;
    if (profile) await pbSocialMediaDirect(profile);
    else await pbSocialMedia();
    hud.textContent = `Social Links closed. Press Enter to reopen.\n${state()}`;
    console.info("[socialDemo]", state());
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
Object.assign(window, { __demo: { G, Graphics, player, step, state, F } });
