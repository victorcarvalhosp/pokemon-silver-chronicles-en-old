// Port of 004_Game classes/002_Game_System.rb (audio bookkeeping, timer,
// access flags) and Essentials' audio helpers (pbBGMPlay, pbSEPlay, ...).

import type { AudioRef } from "../data/events";
import { Data } from "../data/store";
import { assetExists } from "../core/assets";
import { Audio } from "../rgss/Audio";
import { Graphics } from "../rgss/Graphics";
import { G } from "./globals";

export type AudioParam = AudioRef | string | null | undefined;

/** pbResolveAudioFile: accepts a name or an audio object. */
export function resolveAudio(param: AudioParam, volume?: number | null, pitch?: number | null): AudioRef | null {
  if (param == null) return null;
  const a = typeof param === "string" ? { name: param, volume: 100, pitch: 100 } : { ...param };
  if (volume != null) a.volume = volume;
  if (pitch != null) a.pitch = pitch;
  return a;
}

export class GameSystem {
  /** The map's main interpreter; set at boot (avoids an import cycle). */
  mapInterpreter: { running(): boolean; update(): Promise<void> } = { running: () => false, update: async () => {} };
  timer = 0; // seconds
  timerWorking = false;
  saveDisabled = false;
  menuDisabled = false;
  encounterDisabled = false;
  messagePosition = 2;
  messageFrame = 0;
  saveCount = 0;
  magicNumber = 0;
  playingBgm: AudioRef | null = null;
  playingBgs: AudioRef | null = null;
  private memorizedBgm: AudioRef | null = null;
  private memorizedBgs: AudioRef | null = null;

  bgmPlay(bgm: AudioRef | null): void {
    this.playingBgm = bgm ? { ...bgm } : null;
    if (bgm && bgm.name) {
      Audio.bgmPlay(bgm.name, Math.floor((bgm.volume * G.pokemonSystem.bgmvolume) / 100), bgm.pitch);
    } else {
      this.playingBgm = null;
      Audio.bgmStop();
    }
  }

  bgmFade(seconds: number): void {
    this.playingBgm = null;
    Audio.bgmFade(Math.floor(seconds * 1000));
  }

  bgmMemorize(): void { this.memorizedBgm = this.playingBgm; }
  bgmRestore(): void { this.bgmPlay(this.memorizedBgm); }

  bgsPlay(bgs: AudioRef | null): void {
    this.playingBgs = bgs ? { ...bgs } : null;
    if (bgs && bgs.name) Audio.bgsPlay(bgs.name, Math.floor((bgs.volume * G.pokemonSystem.bgmvolume) / 100), bgs.pitch);
    else {
      this.playingBgs = null;
      Audio.bgsStop();
    }
  }

  bgsFade(seconds: number): void {
    this.playingBgs = null;
    Audio.bgsFade(Math.floor(seconds * 1000));
  }

  bgsMemorize(): void { this.memorizedBgs = this.playingBgs; }
  bgsRestore(): void { this.bgsPlay(this.memorizedBgs); }

  mePlay(me: AudioRef | null): void {
    if (me && me.name) Audio.mePlay(me.name, Math.floor((me.volume * G.pokemonSystem.bgmvolume) / 100), me.pitch);
    else Audio.meStop();
  }

  sePlay(se: AudioRef | null): void {
    if (se && se.name) Audio.sePlay(se.name, Math.floor((se.volume * G.pokemonSystem.sevolume) / 100), se.pitch);
  }

  update(): void {
    if (this.timerWorking && this.timer > 0) this.timer = Math.max(0, this.timer - Graphics.deltaS);
  }
}

export function pbBGMPlay(param: AudioParam, volume?: number, pitch?: number): void {
  G.gameSystem.bgmPlay(resolveAudio(param, volume, pitch));
}
export function pbBGMFade(seconds = 0): void { G.gameSystem.bgmFade(seconds); }
export function pbBGMStop(seconds = 0): void { G.gameSystem.bgmFade(seconds); }
export function pbBGSPlay(param: AudioParam, volume?: number, pitch?: number): void {
  G.gameSystem.bgsPlay(resolveAudio(param, volume ?? 80, pitch));
}
export function pbBGSFade(seconds = 0): void { G.gameSystem.bgsFade(seconds); }
export function pbMEPlay(param: AudioParam, volume?: number, pitch?: number): void {
  G.gameSystem.mePlay(resolveAudio(param, volume, pitch));
}
export function pbSEPlay(param: AudioParam, volume?: number, pitch?: number): void {
  G.gameSystem.sePlay(resolveAudio(param, volume ?? 80, pitch));
}
export function pbSEStop(): void { Audio.seStop(); }

/** pbPlayCursorSE etc. (008_Audio/002_Audio_Play.rb): System sound, else "GUI sel ..." at 80. */
const systemSound = (key: string, fallback: string) => () => {
  const se = Data.system?.sounds[key];
  if (se?.name) G.gameSystem.sePlay(se);
  else if (fallback && assetExists(`Audio/SE/${fallback}`)) pbSEPlay(fallback, 80);
};
export const pbPlayCursorSE = systemSound("cursorSe", "GUI sel cursor");
export const pbPlayDecisionSE = systemSound("decisionSe", "GUI sel decision");
export const pbPlayCancelSE = systemSound("cancelSe", "GUI sel cancel");
export const pbPlayBuzzerSE = systemSound("buzzerSe", "GUI sel buzzer");
export const pbPlaySaveSE = systemSound("saveSe", "");
