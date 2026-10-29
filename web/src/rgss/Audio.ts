// RGSS Audio (BGM, BGS, ME, SE) on Web Audio, with mkxp-z behaviours:
// - replaying the BGM that is already playing only updates volume/pitch
// - an ME silences the BGM, which fades back in after the ME ends
// - OGG files with LOOPSTART/LOOPLENGTH comments loop between those points
// Browsers only allow sound after a user gesture; requests made earlier are
// remembered and start once audio is unlocked.

import { assetUrl } from "../core/assets";

// Tests import game logic without a browser (no AudioContext there).
const ctx = typeof AudioContext !== "undefined" ? new AudioContext() : (null as unknown as AudioContext);
const buffers = new Map<string, Promise<LoadedSound | null>>();
const warned = new Set<string>();

interface LoadedSound {
  buffer: AudioBuffer;
  loopStart?: number;
  loopEnd?: number;
}

export function unlockAudio(): Promise<void> {
  return ctx.resume();
}

async function loadSound(path: string): Promise<LoadedSound | null> {
  const key = path.toLowerCase();
  let entry = buffers.get(key);
  if (!entry) {
    entry = (async () => {
      const res = await fetch(assetUrl(path));
      const type = res.headers.get("Content-Type") ?? "";
      if (!res.ok || type.includes("html")) return warnOnce(path, "missing");
      if (type.includes("midi")) return warnOnce(path, "MIDI isn't converted to OGG yet");
      const bytes = await res.arrayBuffer();
      const loop = oggLoopPoints(bytes);
      try {
        // decodeAudioData detaches its argument; keep `bytes` for the fallback.
        const buffer = await ctx.decodeAudioData(bytes.slice(0));
        return { buffer, ...loop };
      } catch {
        const buffer = await decodeOggVorbis(bytes);
        return buffer ? { buffer, ...loop } : warnOnce(path, "can't be decoded");
      }
    })();
    buffers.set(key, entry);
  }
  return entry;
}

function warnOnce(path: string, why: string): null {
  if (!warned.has(path)) console.warn(`Audio ${path}: ${why}`);
  warned.add(path);
  return null;
}

/**
 * Browsers without native Ogg Vorbis (Safari) decode it in WebAssembly. The
 * decoder only loads the first time it's needed.
 */
async function decodeOggVorbis(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  if (new TextDecoder("latin1").decode(new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))) !== "OggS") return null;
  try {
    const { OggVorbisDecoder } = await import("@wasm-audio-decoders/ogg-vorbis");
    const decoder = new OggVorbisDecoder();
    await decoder.ready;
    const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(new Uint8Array(bytes));
    decoder.free();
    if (!samplesDecoded) return null;
    const buffer = ctx.createBuffer(channelData.length, samplesDecoded, sampleRate);
    channelData.forEach((data, i) => buffer.copyToChannel(data.subarray(0, samplesDecoded) as Float32Array<ArrayBuffer>, i));
    return buffer;
  } catch {
    return null;
  }
}

/** Reads LOOPSTART/LOOPLENGTH (in samples) from an OGG Vorbis comment header. */
function oggLoopPoints(bytes: ArrayBuffer): { loopStart?: number; loopEnd?: number } {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 65536));
  const text = new TextDecoder("latin1").decode(head);
  const ident = text.indexOf("\x01vorbis");
  if (ident < 0) return {};
  const rate = new DataView(bytes, ident + 12, 4).getUint32(0, true);
  const start = /LOOPSTART=(\d+)/i.exec(text);
  const length = /LOOPLENGTH=(\d+)/i.exec(text);
  if (!start || !rate) return {};
  const loopStart = Number(start[1]) / rate;
  return { loopStart, loopEnd: length ? loopStart + Number(length[1]) / rate : undefined };
}

class Channel {
  private source: AudioBufferSourceNode | null = null;
  private gain = ctx?.createGain();
  private duck = ctx?.createGain();
  name = "";
  volume = 100;
  pitch = 100;
  private startedAt = 0;
  private token = 0;

  constructor(private folder: string, private loop: boolean) {
    this.gain?.connect(this.duck).connect(ctx.destination);
  }

  async play(name: string, volume = 100, pitch = 100, onEnd?: () => void, position = 0): Promise<void> {
    if (this.loop && name === this.name && this.source && position === 0) {
      this.setVolume(volume);
      this.pitch = pitch;
      this.source.playbackRate.value = pitch / 100;
      return;
    }
    this.stop();
    this.name = name;
    this.volume = volume;
    this.pitch = pitch;
    if (!name) return;
    const token = ++this.token;
    const sound = await loadSound(`Audio/${this.folder}/${name}`);
    if (!sound || token !== this.token) return;
    const src = ctx.createBufferSource();
    src.buffer = sound.buffer;
    src.playbackRate.value = pitch / 100;
    src.loop = this.loop;
    if (this.loop && sound.loopStart !== undefined) {
      src.loopStart = sound.loopStart;
      src.loopEnd = sound.loopEnd ?? sound.buffer.duration;
    }
    src.connect(this.gain);
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.value = volume / 100;
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.name = "";
        onEnd?.();
      }
    };
    // Resuming (Game_System#bgm_resume): start `position` seconds in, wrapped into the loop.
    let offset = Math.max(0, position);
    const end = src.loop ? (src.loopEnd || sound.buffer.duration) : sound.buffer.duration;
    if (offset >= end) offset = src.loop ? (src.loopStart || 0) + ((offset - end) % Math.max(0.001, end - (src.loopStart || 0))) : 0;
    src.start(0, offset);
    this.source = src;
    this.startedAt = ctx.currentTime - offset / (pitch / 100);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.gain.gain.value = volume / 100;
  }

  stop(): void {
    this.token++;
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source = null;
    }
    this.name = "";
  }

  fade(ms: number): void {
    if (!this.source) return;
    const src = this.source;
    const g = this.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + ms / 1000);
    setTimeout(() => {
      if (this.source === src) this.stop();
    }, ms);
  }

  /** Mutes (0) or restores (1) this channel over `seconds`, independent of its volume. */
  setDuck(level: number, seconds: number): void {
    const g = this.duck.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(level, ctx.currentTime + seconds);
  }

  /** Playback position in seconds. */
  position(): number {
    return this.source ? (ctx.currentTime - this.startedAt) * (this.pitch / 100) : 0;
  }

  playing(): boolean {
    return !!this.source;
  }
}

const bgm = new Channel("BGM", true);
const bgs = new Channel("BGS", true);
const me = new Channel("ME", false);

export const Audio = {
  bgmPlay(name: string, volume = 100, pitch = 100, position = 0): void {
    void bgm.play(name, volume, pitch, undefined, position);
  },
  bgmStop(): void { bgm.stop(); },
  bgmFade(ms: number): void { bgm.fade(ms); },
  bgmName(): string { return bgm.name; },
  bgmPos(): number { return bgm.position(); },

  bgsPlay(name: string, volume = 80, pitch = 100, position = 0): void {
    void bgs.play(name, volume, pitch, undefined, position);
  },
  bgsPos(): number { return bgs.position(); },
  bgsStop(): void { bgs.stop(); },
  bgsFade(ms: number): void { bgs.fade(ms); },
  bgsName(): string { return bgs.name; },

  mePlay(name: string, volume = 100, pitch = 100): void {
    bgm.setDuck(0, 0);
    void me.play(name, volume, pitch, () => bgm.setDuck(1, 1));
  },
  meStop(): void {
    me.stop();
    bgm.setDuck(1, 1);
  },
  meFade(ms: number): void {
    me.fade(ms);
    setTimeout(() => bgm.setDuck(1, 1), ms);
  },
  mePlaying(): boolean { return me.playing(); },

  sePlay(name: string, volume = 80, pitch = 100): void {
    void (async () => {
      const sound = await loadSound(`Audio/SE/${name}`);
      if (!sound) return;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = sound.buffer;
      src.playbackRate.value = pitch / 100;
      gain.gain.value = volume / 100;
      src.connect(gain).connect(ctx.destination);
      src.start();
      liveSe.add(src);
      src.onended = () => liveSe.delete(src);
    })();
  },
  seStop(): void {
    for (const s of liveSe) s.stop();
    liveSe.clear();
  },
};

const liveSe = new Set<AudioBufferSourceNode>();
