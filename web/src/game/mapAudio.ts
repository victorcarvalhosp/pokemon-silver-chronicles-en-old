// Map music helpers from 012_Overworld/001_Overworld.rb: pbCueBGM (fade the
// current BGM out, start the next one 3/5 of the way through) and
// pbAutoplayOnTransition.

import { EventHandlers } from "./eventHandlers";
import { G } from "./globals";
import { pbBGMFade, pbBGMPlay, resolveAudio, type AudioParam } from "./GameSystem";
import { metadata } from "./metadata";
import { FRAME_RATE } from "./GameCharacter";
import type { AudioRef } from "../data/events";
import type { GameMap } from "./GameMap";

let cueBgm: AudioRef | null = null;
let cueBgmFrameDelay: number | null = null;

export function pbCueBGM(bgm: AudioParam, seconds: number, volume?: number, pitch?: number): void {
  if (!bgm) return;
  const resolved = resolveAudio(bgm, volume, pitch)!;
  const playing = G.gameSystem.playingBgm;
  if (!playing || playing.name !== resolved.name || playing.pitch !== resolved.pitch) {
    pbBGMFade(seconds);
    if (cueBgmFrameDelay == null) cueBgmFrameDelay = (seconds * FRAME_RATE * 3) / 5;
    cueBgm = resolved;
  } else {
    pbBGMPlay(resolved);
  }
}

EventHandlers.add("on_frame_update", "cue_bgm_after_delay", () => {
  if (cueBgmFrameDelay == null) return;
  cueBgmFrameDelay -= 1;
  if (cueBgmFrameDelay > 0) return;
  cueBgmFrameDelay = null;
  if (G.gameSystem.playingBgm == null) pbBGMPlay(cueBgm);
});

export function pbAutoplayOnTransition(): void {
  const surfbgm = metadata().surfBGM as string | undefined;
  if (G.pokemonGlobal.surfing && surfbgm) pbBGMPlay(surfbgm);
  else autoplayAsCue(G.gameMap as unknown as GameMap);
}

export function pbAutoplayOnSave(): void {
  const surfbgm = metadata().surfBGM as string | undefined;
  if (G.pokemonGlobal.surfing && surfbgm) pbBGMPlay(surfbgm);
  else (G.gameMap as unknown as GameMap).autoplay();
}

/** Game_Map#autoplayAsCue */
export function autoplayAsCue(map: GameMap): void {
  if (map.map.autoplayBgm) pbCueBGM(map.bgmName(), 1.0, map.map.bgm.volume, map.map.bgm.pitch);
  if (map.map.autoplayBgs) G.gameSystem.bgsPlay(map.map.bgs);
}
