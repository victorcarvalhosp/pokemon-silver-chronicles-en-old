// Port of 019_Utilities/003_Utilities_BattleAudio.rb: which music plays for
// wild and trainer battles, their victory BGM and the capture ME
// ($PokemonGlobal.nextBattle* overrides, then map metadata, then global
// metadata, then Essentials' defaults).

import type { AudioRef } from "../../data/events";
import type { Id } from "../../data/gameData/gameData";
import { TrainerType } from "../../data/gameData/trainerType";
import { pbStringToAudioFile } from "../../ui/messages";
import { Audio } from "../../rgss/Audio";
import { pbBGMPlay } from "../GameSystem";
import { G } from "../globals";
import { mapMetadata, metadata } from "../metadata";

declare module "../globals" {
  interface PokemonGlobalMetadata {
    nextBattleVictoryBGM?: AudioRef | null;
    nextBattleCaptureME?: AudioRef | null;
    nextBattleBack?: string | null;
  }
  interface GameTemp {
    memorizedBgm?: AudioRef | null;
    memorizedBgmPosition?: number;
  }
}

const clone = (a: unknown): AudioRef | null => (a ? (typeof a === "string" ? pbStringToAudioFile(a) : { ...(a as AudioRef) }) : null);
const mapMeta = (key: string) => (G.gameMap ? (mapMetadata(G.gameMap.mapId)?.[key] as string | undefined) : undefined);
const globalMeta = (key: string) => metadata()[key] as string | undefined;
const audio = (music: string | null | undefined) => (music && music !== "" ? pbStringToAudioFile(music) : null);

/** pbGetWildBattleBGM(wildParty) */
export function pbGetWildBattleBGM(_wildParty: unknown[]): AudioRef {
  if (G.pokemonGlobal.nextBattleBGM) return clone(G.pokemonGlobal.nextBattleBGM)!;
  let ret: AudioRef | null = null;
  ret ??= audio(mapMeta("wildBattleBGM")); // Check map metadata
  ret ??= audio(globalMeta("wildBattleBGM")); // Check global metadata
  ret ??= pbStringToAudioFile("Battle wild");
  return ret;
}

/** pbGetWildVictoryBGM (the name is relative to Audio/ME/ in Ruby: "../../Audio/BGM/" + name). */
export function pbGetWildVictoryBGM(): AudioRef {
  if (G.pokemonGlobal.nextBattleVictoryBGM) return clone(G.pokemonGlobal.nextBattleVictoryBGM)!;
  let ret = audio(mapMeta("wildVictoryBGM"));
  ret ??= audio(globalMeta("wildVictoryBGM"));
  ret ??= pbStringToAudioFile("Battle victory");
  ret.name = "../../Audio/BGM/" + ret.name;
  return ret;
}

/** pbGetWildCaptureME */
export function pbGetWildCaptureME(): AudioRef {
  if (G.pokemonGlobal.nextBattleCaptureME) return clone(G.pokemonGlobal.nextBattleCaptureME)!;
  let ret = audio(mapMeta("wildCaptureME"));
  ret ??= audio(globalMeta("wildCaptureME"));
  ret ??= pbStringToAudioFile("Battle capture success");
  ret.name = "../../Audio/ME/" + ret.name;
  return ret;
}

/** pbPlayTrainerIntroBGM(trainer_type) */
export function pbPlayTrainerIntroBGM(trainerType: Id): void {
  const data = TrainerType.get(trainerType);
  if (!data.introBGM) return;
  const bgm = pbStringToAudioFile(data.introBGM);
  const t = G.gameTemp;
  if (!t.memorizedBgm) {
    t.memorizedBgm = G.gameSystem.getPlayingBGM();
    t.memorizedBgmPosition = Audio.bgmPos();
  }
  pbBGMPlay(bgm);
}

type TrainerLike = { trainerType: Id };
const battleBGMOf = (t: TrainerLike) => TrainerType.get(t.trainerType).battleBGM;
const victoryBGMOf = (t: TrainerLike) => TrainerType.get(t.trainerType).victoryBGM;

/** pbGetTrainerBattleBGM(trainer): a Player, NPCTrainer or an array of them. */
export function pbGetTrainerBattleBGM(trainer: TrainerLike | TrainerLike[]): AudioRef {
  if (G.pokemonGlobal.nextBattleBGM) return clone(G.pokemonGlobal.nextBattleBGM)!;
  let music: string | null | undefined = null;
  for (const t of Array.isArray(trainer) ? trainer : [trainer]) {
    const m = battleBGMOf(t);
    if (m) music = m;
  }
  let ret = audio(music);
  ret ??= audio(mapMeta("trainerBattleBGM"));
  ret ??= audio(globalMeta("trainerBattleBGM"));
  ret ??= pbStringToAudioFile("Battle trainer");
  return ret;
}

/** pbGetTrainerBattleBGMFromType(trainertype) */
export function pbGetTrainerBattleBGMFromType(trainertype: Id): AudioRef {
  if (G.pokemonGlobal.nextBattleBGM) return clone(G.pokemonGlobal.nextBattleBGM)!;
  // (Ruby returns the trainer type's BGM string as is here.)
  let ret: AudioRef | null = audio(battleBGMOf({ trainerType: trainertype }));
  ret ??= audio(mapMeta("trainerBattleBGM"));
  ret ??= audio(globalMeta("trainerBattleBGM"));
  ret ??= pbStringToAudioFile("Battle trainer");
  return ret;
}

/** pbGetTrainerVictoryBGM(trainer) */
export function pbGetTrainerVictoryBGM(trainer: TrainerLike | TrainerLike[]): AudioRef {
  if (G.pokemonGlobal.nextBattleVictoryBGM) return clone(G.pokemonGlobal.nextBattleVictoryBGM)!;
  let music: string | null | undefined = null;
  for (const t of Array.isArray(trainer) ? trainer : [trainer]) {
    const m = victoryBGMOf(t);
    if (m) music = m;
  }
  let ret = audio(music);
  ret ??= audio(mapMeta("trainerVictoryBGM"));
  ret ??= audio(globalMeta("trainerVictoryBGM"));
  ret ??= pbStringToAudioFile("Battle victory");
  ret.name = "../../Audio/BGM/" + ret.name;
  return ret;
}
