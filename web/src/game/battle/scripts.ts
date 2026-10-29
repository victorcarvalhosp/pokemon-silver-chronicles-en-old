// The battle-starting functions events call, registered under their Ruby
// names (001_Overworld_BattleStarting.rb, incl. the v21-deprecated pb*Battle
// wrappers events still use, 019_Utilities/003_Utilities_BattleAudio.rb).

import type { AudioRef } from "../../data/events";
import type { Id } from "../../data/gameData/gameData";
import { pbEncounter, pokemonEncounters } from "../encounters/PokemonEncounters";
import "../encounters/visibleEncounters";
import { defineScript } from "../scriptApi";
import { pbGetTrainerBattleBGM, pbGetWildBattleBGM, pbGetWildCaptureME, pbGetWildVictoryBGM, pbPlayTrainerIntroBGM } from "./battleAudio";
import { pbBattleAnimation } from "./BattleIntroAnim";
import { pbCanDoubleBattle, pbCanTripleBattle, pbGetEnvironment, setBattleRule, TrainerBattle, WildBattle } from "./BattleStarting";
import { pbStartOver } from "./startOver";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";

type Args = unknown[];
const opt = (v: unknown, d: unknown) => (v === undefined || v === null ? d : v);

defineScript("$PokemonEncounters", () => pokemonEncounters());
defineScript("setBattleRule", (_c, ...args) => setBattleRule(...args));
defineScript("WildBattle.start", (_c, ...args) => WildBattle.start(args as never));
defineScript("WildBattle.start_core", (_c, ...args) => WildBattle.startCore(args as never));
defineScript("TrainerBattle.start", (_c, ...args) => TrainerBattle.start(args as never));
defineScript("TrainerBattle.start_core", (_c, ...args) => TrainerBattle.startCore(args as never));
defineScript("pbEncounter", (_c, encType, onlySingle) => pbEncounter(encType as Id, opt(onlySingle, true) as boolean));
defineScript("pbStartOver", (_c, gameover) => pbStartOver(!!gameover));
defineScript("pbCanDoubleBattle?", () => pbCanDoubleBattle());
defineScript("pbCanTripleBattle?", () => pbCanTripleBattle());
defineScript("pbGetEnvironment", () => pbGetEnvironment());
defineScript("pbBattleAnimation", (_c, bgm, battletype, foe) => pbBattleAnimation(bgm as AudioRef, Number(opt(battletype, 0)), foe as unknown[]));
defineScript("pbGetWildBattleBGM", (_c, party) => pbGetWildBattleBGM((party as unknown[]) ?? []));
defineScript("pbGetWildVictoryBGM", () => pbGetWildVictoryBGM());
defineScript("pbGetWildCaptureME", () => pbGetWildCaptureME());
defineScript("pbGetTrainerBattleBGM", (_c, t) => pbGetTrainerBattleBGM(t as never));
defineScript("pbPlayTrainerIntroBGM", (_c, t) => pbPlayTrainerIntroBGM(t as Id));

// Deprecated in v21, still used by events.
defineScript("pbWildBattle", (_c, ...a: Args) => {
  const [species, level, outcomeVar = 1, canRun = true, canLose = false] = a;
  if (outcomeVar !== 1) setBattleRule("outcomeVar", outcomeVar);
  if (!canRun) setBattleRule("cannotRun");
  if (canLose) setBattleRule("canLose");
  return WildBattle.start([species as Id, level as number]);
});
defineScript("pbDoubleWildBattle", (_c, ...a: Args) => {
  const [s1, l1, s2, l2, outcomeVar = 1, canRun = true, canLose = false] = a;
  if (outcomeVar !== 1) setBattleRule("outcomeVar", outcomeVar);
  if (!canRun) setBattleRule("cannotRun");
  if (canLose) setBattleRule("canLose");
  setBattleRule("double");
  return WildBattle.start([s1, l1, s2, l2] as never);
});
defineScript("pbTrainerBattle", (_c, ...a: Args) => {
  const [trainerID, trainerName, _endSpeech, doubleBattle = false, trainerPartyID = 0, canLose = false, outcomeVar = 1] = a;
  if (outcomeVar !== 1) setBattleRule("outcomeVar", outcomeVar);
  if (canLose) setBattleRule("canLose");
  if (doubleBattle) setBattleRule("double");
  return TrainerBattle.start([trainerID, trainerName, trainerPartyID] as never);
});
defineScript("pbDoubleTrainerBattle", (_c, ...a: Args) => {
  const [id1, name1, party1, _s1, id2, name2, party2 = 0, _s2, canLose = false, outcomeVar = 1] = a;
  if (outcomeVar !== 1) setBattleRule("outcomeVar", outcomeVar);
  if (canLose) setBattleRule("canLose");
  setBattleRule("double");
  return TrainerBattle.start([id1, name1, party1, id2, name2, party2] as never);
});

// Pokemon.play_cry(species, form = 0, volume = 90, pitch = 100) (014_Pokemon/001_Pokemon.rb);
// scripts/overworld.ts had it as an M4 TODO.
defineScript("Pokemon.play_cry", (_c, species, form, volume, pitch) =>
  SpeciesFiles.playCryFromSpecies(species as Id, Number(opt(form, 0)), Number(opt(volume, 90)), Number(opt(pitch, 100))));

// Trainer events, partner trainers, phone rematches and the special battle
// types (each registers its own scripts and handlers).
// Import order is Ruby's load order where handlers share an event
// (:on_calling_wild_battle: roaming, Safari, Bug Contest; :on_wild_species_chosen:
// roaming, then the Poké Radar).
import "./globalExtras";
import "../trainers/trainerEvents";
import "../trainers/phoneRematch";
import "../trainers/pokemonSelection";
import "./roaming";
import "./pokeRadar";
import "./safari";
import "./bugContest";
import "./battlePalace";
import "./battleArena";
import "./recordedBattle";
import "../frontier/scripts";
