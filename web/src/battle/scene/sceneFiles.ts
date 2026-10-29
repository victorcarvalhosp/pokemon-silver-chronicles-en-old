// File lookups the battle scene needs that the out-of-battle sprite ports
// don't have:
// - ZUD Mechanics ([001] Data/Data_Species.rb) GameData::Species.shadow_filename
//   (Dynamax shadows), which replaces Essentials Deluxe's.
// - GameData::Species.cry_length (010_Data/002_PBS data/009_Species_Files.rb)
//   and getPlayTime (008_Audio/001_Audio.rb), which read the audio file's
//   header. The browser can't read files synchronously, so lengths are
//   fetched ahead (preloadCryLength) and read from a cache afterwards.

import { assetExists, assetUrl } from "../../core/assets";
import type { Id } from "../../data/gameData/gameData";
import { Species } from "../../data/gameData/species";
import { SpeciesMetrics } from "../../data/gameData/speciesMetrics";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";

function pbResolveBitmap(path: string): string | null {
  return assetExists(path) ? path : null;
}

function pbResolveAudioSE(file: string | null): string | null {
  if (!file) return null;
  return assetExists(`Audio/SE/${file}`) ? file : null;
}

/** GameData::Species.shadow_filename(species, form = 0, dynamax = false) (ZUD Mechanics). */
export function shadowFilename(species: Id, form = 0, dynamax = false): string | null {
  const speciesData = Species.getSpeciesForm(species, form);
  if (!speciesData) return null;
  let path = `Graphics/Pokemon/Shadow/${speciesData.species}`;
  let ret = pbResolveBitmap(path);
  if (form > 0) {
    path += `_${form}`;
    const newRet = pbResolveBitmap(path);
    if (newRet) ret = newRet;
  }
  if (dynamax) {
    path += "_dmax";
    const newRet = pbResolveBitmap(path);
    if (newRet) ret = newRet;
    if (!ret) {
      path = "Graphics/Pokemon/Shadow/dynamax";
      ret = pbResolveBitmap(path);
    }
  }
  if (!ret) {
    const metricsData = SpeciesMetrics.getSpeciesForm(speciesData.species, form)!;
    ret = pbResolveBitmap(`Graphics/Pokemon/Shadow/${metricsData.shadowSize}`);
  }
  return ret;
}

/** shadow_bitmap_from_pokemon(pkmn, dynamax): the file it would load. */
export function shadowFilenameFromPokemon(pkmn: Pokemon, dynamax = false): string | null {
  return shadowFilename(pkmn.species, pkmn.form, dynamax || pkmn.dynamax);
}

//===============================================================================
// getPlayTime
//===============================================================================
const playTimes = new Map<string, Promise<number>>();
const knownPlayTimes = new Map<string, number>();

/** getPlayTime2 on the file's bytes: WAV and OGG, as Essentials reads them (-1 if unknown). */
function playTimeOfBytes(bytes: ArrayBuffer): number {
  const v = new DataView(bytes);
  const dw = (pos: number) => (pos + 4 <= v.byteLength ? v.getUint32(pos, true) : 0);
  const w = (pos: number) => (pos + 2 <= v.byteLength ? v.getUint16(pos, true) : 0);
  switch (dw(0)) {
    case 0x46464952: { // "RIFF"
      if (dw(8) !== 0x45564157) return -1; // "WAVE"
      if (dw(12) !== 0x20746d66) return -1; // "fmt "
      // fmtsize, format, channels, rate
      const bytessec = dw(28);
      if (bytessec === 0) return -1;
      void w(32); // bytessample, bitssample
      if (dw(36) !== 0x61746164) return -1; // "data"
      return dw(40) / bytessec;
    }
    case 0x5367674f: return oggfiletime(v); // "OggS"
  }
  return -1; // MP3 length isn't needed for cries (none are MP3)
}

/**
 * oggfiletime. As in Essentials, the "rate" it reads is the Vorbis header's
 * channel byte plus the rate shifted up 8 bits, which the final * 256 undoes.
 */
function oggfiletime(v: DataView): number {
  const pages: [number, number, number][] = []; // [header pos, body pos, next page pos]
  let pos = 0;
  while (pos + 27 <= v.byteLength && v.getUint32(pos, true) === 0x5367674f) {
    const hdrbodysize = v.getUint8(pos + 26);
    let bodysize = 0;
    for (let i = 0; i < hdrbodysize; i++) bodysize += pos + 27 + i < v.byteLength ? v.getUint8(pos + 27 + i) : 0;
    const body = pos + 27 + hdrbodysize;
    pages.push([pos + 4, body, body + bodysize]);
    pos = body + bodysize;
  }
  if (pages.length === 0) return -1;
  let curserial: number | null = null;
  let i = -1;
  const pcmlengths: number[] = [];
  const rates: number[] = [];
  for (const [header, body] of pages) {
    const serial = v.getUint32(header + 10, true);
    const frameno = Number(v.getBigUint64(header + 2, true));
    if (serial !== curserial) {
      curserial = serial;
      const packtype = v.getUint8(body);
      const s = String.fromCharCode(...new Uint8Array(v.buffer, body + 1, 6));
      if (s !== "vorbis" || packtype !== 1) return -1;
      i += 1;
      if (v.getUint32(body + 7, true) !== 0) return -1;
      rates[i] = v.getUint32(body + 11, true);
    }
    pcmlengths[i] = frameno;
  }
  let ret = 0.0;
  pcmlengths.forEach((length, j) => { ret += length / rates[j]!; });
  return ret * 256.0;
}

/** Fetches an SE file's length (getPlayTime, in seconds; 0 if unknown). */
export function fetchPlayTime(file: string): Promise<number> {
  let p = playTimes.get(file);
  if (!p) {
    p = fetch(assetUrl(`Audio/SE/${file}`))
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((bytes) => (bytes ? Math.max(playTimeOfBytes(bytes), 0) : 0))
      .catch(() => 0)
      .then((t) => {
        knownPlayTimes.set(file, t);
        return t;
      });
    playTimes.set(file, p);
  }
  return p;
}

/** The cry cry_length(pkmn, ...) measures. */
function cryFileForLength(pkmn: Pokemon, suffix: string): string | null {
  if (pkmn.egg()) return null;
  let filename = SpeciesFiles.cryFilenameFromPokemon(pkmn, suffix);
  if (!filename && suffix) filename = SpeciesFiles.cryFilenameFromPokemon(pkmn);
  return pbResolveAudioSE(filename);
}

/** Loads what cryLength(pkmn, pitch, suffix) needs. */
export async function preloadCryLength(pkmn: Pokemon | null | undefined, suffix = ""): Promise<void> {
  if (!pkmn) return;
  const file = cryFileForLength(pkmn, suffix);
  if (file) await fetchPlayTime(file);
}

/** GameData::Species.cry_length(pkmn, nil, pitch, suffix): seconds (needs preloadCryLength). */
export function cryLength(pkmn: Pokemon | null | undefined, pitch: number | null = 100, suffix = ""): number {
  pitch ??= 100;
  if (!pkmn || pitch <= 0) return 0;
  const file = cryFileForLength(pkmn, suffix);
  let ret = 0.0;
  if (file) {
    const t = knownPlayTimes.get(file);
    if (t === undefined) void fetchPlayTime(file);
    ret = t ?? 0;
  }
  return ret / (pitch / 100); // Sound played at a lower pitch lasts longer
}

/** Loads what crySpeciesLength(species, form) needs. */
export async function preloadCrySpeciesLength(species: Id, form = 0): Promise<void> {
  const file = pbResolveAudioSE(SpeciesFiles.cryFilename(species, form));
  if (file) await fetchPlayTime(file);
}

/** GameData::Species.cry_length(species, form, pitch) for a species (needs preloadCrySpeciesLength). */
export function crySpeciesLength(species: Id, form = 0, pitch = 100): number {
  if (pitch <= 0) return 0;
  const file = pbResolveAudioSE(SpeciesFiles.cryFilename(species, form));
  let ret = 0.0;
  if (file) {
    const t = knownPlayTimes.get(file);
    if (t === undefined) void fetchPlayTime(file);
    ret = t ?? 0;
  }
  return ret / (pitch / 100);
}
