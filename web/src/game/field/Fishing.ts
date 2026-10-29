// Port of 012_Overworld/005_Overworld_Fishing.rb: casting the rod, the dots
// while waiting, the "Oh! A bite!" reflex test and reeling in. The rods'
// item handlers (game/items/Item_Effects.ts) call pbFishing, then
// pbEncounter with the rod's encounter type.
//
// Timings: the Ruby counts frames at Graphics.frame_rate (0.4 s per dot,
// 0.2 s per twitch), which are seconds here. The bite window is
// `Graphics.frame_rate - rand(Graphics.frame_rate / 2)` frames: it's rolled
// with the original 40 fps numbers (rand(20)) so it uses the same random
// numbers as the Ruby, then converted to seconds (0.5-1 s).

import { rand } from "../../core/random";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { _INTL } from "../../ui/messageConfig";
import { pbMessageDisplay } from "../../ui/messages";
import { pbCreateMessageWindow, pbDisposeMessageWindow } from "../../ui/speechBubble";
import { TICK_RATE as FRAME_RATE } from "../../core/loop";
import type { GamePlayer } from "../GamePlayer";
import { G, pbUpdateSceneMap } from "../globals";
import type { GameStats } from "../trainer/GameStats";
import type { Player } from "../trainer/Player";

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const player = () => G.player as unknown as Player;
type MsgWindow = ReturnType<typeof pbCreateMessageWindow>;

/** Graphics.frame_rate in the original game (for rolls that depend on it). */
const ORIGINAL_FRAME_RATE = 40;
/** Settings::FISHING_AUTO_HOOK */
const FISHING_AUTO_HOOK = false;
/** Settings::FISHING_BEGIN_COMMON_EVENT / FISHING_END_COMMON_EVENT: none (pbCommonEvent(-1) is false). */
const FISHING_BEGIN_COMMON_EVENT = -1;
const FISHING_END_COMMON_EVENT = -1;
/** Settings::EXCLAMATION_ANIMATION_ID */
const EXCLAMATION_ANIMATION_ID = 3;

/** One frame of a field wait: Graphics.update, Input.update, pbUpdateSceneMap. */
async function fieldFrame(): Promise<void> {
  await Graphics.update();
  Input.update();
  await pbUpdateSceneMap();
}

/** pbFishingBegin: the casting animation (the rod's charset, patterns 3 to 0). */
export async function pbFishingBegin(): Promise<void> {
  G.pokemonGlobal.fishing = true;
  if (FISHING_BEGIN_COMMON_EVENT < 0) { // !pbCommonEvent(Settings::FISHING_BEGIN_COMMON_EVENT)
    const p = gamePlayer();
    p.setMovementType(G.pokemonGlobal.surfing ? "surf_fishing" : "fishing");
    p.lockPattern = true;
    for (let pattern = 0; pattern < 4; pattern++) {
      p.pattern = 3 - pattern;
      for (let i = 0; i < Math.floor(FRAME_RATE / 20); i++) await fieldFrame();
    }
  }
}

/** pbFishingEnd { block }: reels the rod back in, then shows the result message. */
export async function pbFishingEnd(block?: () => Promise<unknown>): Promise<void> {
  const p = gamePlayer();
  if (FISHING_END_COMMON_EVENT < 0) { // !pbCommonEvent(Settings::FISHING_END_COMMON_EVENT)
    for (let pattern = 0; pattern < 4; pattern++) {
      p.pattern = pattern;
      for (let i = 0; i < Math.floor(FRAME_RATE / 20); i++) await fieldFrame();
    }
  }
  if (block) await block();
  p.setMovementType(G.pokemonGlobal.surfing ? "surfing_stopped" : "walking_stopped");
  p.lockPattern = false;
  p.straighten();
  G.pokemonGlobal.fishing = false;
}

/** pbFishing(hasEncounter, rodType = 1): true if a Pokémon was hooked. */
export async function pbFishing(hasEncounter: boolean, rodType = 1): Promise<boolean> {
  (G.stats as GameStats).fishingCount += 1;
  const first = player().firstPokemon();
  const speedup = !!first && ["STICKYHOLD", "SUCTIONCUPS"].includes(first.abilityId ?? "");
  let biteChance = 20 + 25 * rodType; // 45, 70, 95
  if (speedup) biteChance *= 1.5; // 67.5, 100, 100
  const hookChance = 100;
  await pbFishingBegin();
  const msgWindow = pbCreateMessageWindow();
  let ret = false;
  for (;;) {
    let time = 5 + rand(6); // rand(5..10)
    if (speedup) time = Math.min(time, 5 + rand(6));
    let message = "";
    for (let i = 0; i < time; i++) message += ".   ";
    if (await waits.waitMessage(msgWindow, time)) {
      await pbFishingEnd(() => pbMessageDisplay(msgWindow, _INTL("Not even a nibble...")));
      break;
    }
    if (hasEncounter && rand(100) < biteChance) {
      const p = gamePlayer();
      const scene = G.scene as unknown as { spriteset?(): { addUserAnimation(id: number, x: number, y: number, t: boolean, h: number): unknown } | undefined };
      scene.spriteset?.()?.addUserAnimation(EXCLAMATION_ANIMATION_ID, p.x, p.y, true, 3);
      // 0.5-1 second
      const frames40 = ORIGINAL_FRAME_RATE - rand(Math.floor(ORIGINAL_FRAME_RATE / 2));
      // pbWaitForInput's loop runs frames + 2 updates; keep that window's length in seconds.
      const frames = Math.round(((frames40 + 2) * FRAME_RATE) / ORIGINAL_FRAME_RATE) - 2;
      if (!(await waits.waitForInput(msgWindow, message + _INTL("\r\nOh! A bite!"), frames))) {
        await pbFishingEnd(() => pbMessageDisplay(msgWindow, _INTL("The Pokémon got away...")));
        break;
      }
      if (FISHING_AUTO_HOOK || rand(100) < hookChance) {
        await pbFishingEnd(async () => {
          if (!FISHING_AUTO_HOOK) await pbMessageDisplay(msgWindow, _INTL("Landed a Pokémon!"));
        });
        ret = true;
        break;
      }
      // biteChance += 15
      // hookChance += 15
    } else {
      await pbFishingEnd(() => pbMessageDisplay(msgWindow, _INTL("Not even a nibble...")));
      break;
    }
  }
  pbDisposeMessageWindow(msgWindow);
  return ret;
}

/** pbWaitMessage(msgWindow, time): the waiting dots; true if the player pressed a button (too early). */
export async function pbWaitMessage(msgWindow: MsgWindow, time: number): Promise<boolean> {
  let message = "";
  const periodTime = Math.floor((FRAME_RATE * 4) / 10); // 0.4 seconds per dot
  for (let i = 0; i < time + 1; i++) {
    if (i > 0) message += ".   ";
    await pbMessageDisplay(msgWindow, message, false);
    for (let f = 0; f < periodTime; f++) {
      await fieldFrame();
      if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) return true;
    }
  }
  return false;
}

/** pbWaitForInput(msgWindow, message, frames): a Pokémon is biting, reflex test to reel it in. */
export async function pbWaitForInput(msgWindow: MsgWindow, message: string, frames: number): Promise<boolean> {
  await pbMessageDisplay(msgWindow, message, false);
  let numFrame = 0;
  let twitchFrame = 0;
  const twitchFrameTime = Math.floor((FRAME_RATE * 2) / 10); // 0.2 seconds
  const p = gamePlayer();
  for (;;) {
    await fieldFrame();
    // Twitch cycle: 1,0,1,0,0,0,0,0
    twitchFrame = (twitchFrame + 1) % (twitchFrameTime * 8);
    switch (twitchFrame % twitchFrameTime) {
      case 0: case 2: p.pattern = 1; break;
      default: p.pattern = 0;
    }
    if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) {
      p.pattern = 0;
      return true;
    }
    if (!FISHING_AUTO_HOOK && numFrame > frames) break;
    numFrame += 1;
  }
  return false;
}

/** The waits pbFishing calls (tests wrap them to time each one). */
const waits = { waitMessage: pbWaitMessage, waitForInput: pbWaitForInput };
export function setFishingWaitHooks(hooks: Partial<typeof waits>): void {
  Object.assign(waits, hooks);
}
