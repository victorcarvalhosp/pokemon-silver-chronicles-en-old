// Port of 004_Game classes/002_Game_System.rb (audio bookkeeping, timer,
// access flags) and Essentials' audio helpers (pbBGMPlay, pbSEPlay, ...).

import type { AudioRef } from "../data/events";
import { Data } from "../data/store";
import { assetExists } from "../core/assets";
import { Audio } from "../rgss/Audio";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { pbCurrentEventCommentInput } from "../ui/messages";
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

  /** @defaultBGM: the Jukebox's custom track, played instead of every other BGM while set. */
  defaultBGM: AudioRef | null = null;

  /** bgm_play / bgm_play_internal */
  bgmPlay(bgm: AudioRef | null): void {
    this.playingBgm = bgm ? { ...bgm } : null;
    if (bgm && bgm.name) {
      if (!this.defaultBGM) Audio.bgmPlay(bgm.name, Math.floor((bgm.volume * G.pokemonSystem.bgmvolume) / 100), bgm.pitch);
    } else {
      this.playingBgm = null;
      if (!this.defaultBGM) Audio.bgmStop();
    }
    if (this.defaultBGM) {
      Audio.bgmPlay(this.defaultBGM.name, Math.floor((this.defaultBGM.volume * G.pokemonSystem.bgmvolume) / 100), this.defaultBGM.pitch);
    }
  }

  /** setDefaultBGM(bgm, volume, pitch): nil goes back to the playing BGM. */
  setDefaultBGM(bgm: AudioRef | string | null, volume = 80, pitch = 100): void {
    if (typeof bgm === "string") bgm = { name: bgm, volume, pitch };
    this.defaultBGM = null;
    if (bgm && bgm.name !== "") {
      this.bgmPlay(bgm);
      this.defaultBGM = { ...bgm };
    } else {
      this.bgmPlay(this.playingBgm);
    }
  }

  bgmFade(seconds: number): void {
    this.playingBgm = null;
    Audio.bgmFade(Math.floor(seconds * 1000));
  }

  // bgm_pause / bgm_unpause / bgm_resume (used around battles): pausing keeps
  // the position, so the map music resumes where it was.
  bgmPosition = 0;
  bgsPosition = 0;
  private bgmPaused = false;
  private bgsPaused = false;

  bgmPause(fadetime = 0): void {
    const pos = Audio.bgmPos();
    if (fadetime > 0) this.bgmFade(fadetime);
    this.bgmPosition = pos;
    this.bgmPaused = true;
  }
  bgmUnpause(): void {
    this.bgmPosition = 0;
    this.bgmPaused = false;
  }
  bgmResume(bgm: AudioRef | null): void {
    if (!this.bgmPaused) return;
    this.playingBgm = bgm ? { ...bgm } : null;
    if (bgm && bgm.name) Audio.bgmPlay(bgm.name, Math.floor((bgm.volume * G.pokemonSystem.bgmvolume) / 100), bgm.pitch, this.bgmPosition);
    else Audio.bgmStop();
    this.bgmPosition = 0;
    this.bgmPaused = false;
  }
  bgsPause(fadetime = 0): void {
    const pos = Audio.bgsPos();
    if (fadetime > 0) this.bgsFade(fadetime);
    this.bgsPosition = pos;
    this.bgsPaused = true;
  }
  bgsUnpause(): void {
    this.bgsPosition = 0;
    this.bgsPaused = false;
  }
  bgsResume(bgs: AudioRef | null): void {
    if (!this.bgsPaused) return;
    this.playingBgs = bgs ? { ...bgs } : null;
    if (bgs && bgs.name) Audio.bgsPlay(bgs.name, Math.floor((bgs.volume * G.pokemonSystem.bgmvolume) / 100), bgs.pitch, this.bgsPosition);
    else Audio.bgsStop();
    this.bgsPosition = 0;
    this.bgsPaused = false;
  }
  /** getPlayingBGM / getPlayingBGS: a copy of what's playing. */
  getPlayingBGM(): AudioRef | null { return this.playingBgm ? { ...this.playingBgm } : null; }
  getPlayingBGS(): AudioRef | null { return this.playingBgs ? { ...this.playingBgs } : null; }

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
    // SPECIAL skips a cut scene: an event whose page has a "Cut Scene" comment
    // gets self switch A, and its new page starts (002_Game_System.rb:269-273).
    if (!(Input.trigger(Input.SPECIAL) && pbCurrentEventCommentInput(1, "Cut Scene") != null)) return;
    const interp = this.mapInterpreter as unknown as {
      getSelf(): { id: number; start(): void };
      pbSetSelfSwitch(eventid: number, switchName: string, value: boolean): void;
      commandEnd(): void;
    };
    const event = interp.getSelf();
    interp.pbSetSelfSwitch(event.id, "A", true);
    interp.commandEnd();
    event.start();
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
