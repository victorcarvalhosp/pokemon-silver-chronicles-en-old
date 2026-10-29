// What Battle::Scene reads from the battle, its battlers and their moves,
// written as the Ruby scene uses them (Ruby names camelCased, `?` dropped:
// battler.fainted?, battle.opposes?(i) -> fainted(), opposes(i)). The battle
// core (web/src/battle/battle, battler, move) implements these; the scene only
// depends on these shapes so it can also be driven by a scripted mock battle
// (web/src/dev/battleDemo.ts).

import type { Id } from "../../data/gameData/gameData";
import type { Target } from "../../data/gameData/target";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { EffectsArray } from "../other/PBEffects";

/** Battle::Move as the fight menu / animations read it. */
export interface SceneMove {
  id: Id;
  name: string;
  /** Essentials Deluxe's Battle::Move#short_name (SHORTEN_MOVES); the name if missing. */
  shortName?: string;
  pp: number;
  /** total_pp */
  totalPp(): number;
  /** display_type(battler) */
  displayType(battler: unknown): Id | null;
}

/** A trainer as the scene reads it (player/partner/opponent). */
export interface SceneTrainer {
  trainerType: Id;
  name?: string;
}

/** Battle::Battler as the scene reads it. */
export interface SceneBattler {
  index: number;
  battle: SceneBattle;
  pokemon: Pokemon | null;
  /** Index of the battler's Pokémon in its party. */
  pokemonIndex: number;
  name: string;
  hp: number;
  totalhp: number;
  level: number;
  status: Id;
  statusCount: number;
  moves: (SceneMove | null)[];
  effects: EffectsArray;
  abilityName(): string;
  displayGender(): number;
  fainted(): boolean;
  /** opposes?(i = 0) */
  opposes(i?: number): boolean;
  shiny(): boolean;
  superShiny(): boolean;
  mega(): boolean;
  primal(): boolean;
  owned(): boolean;
  isSpecies(species: Id): boolean;
  // ZUD Mechanics / Generation 9 Pack (optional so a plain battle can omit them)
  dynamax?(): boolean;
  gmaxFactor?(): boolean;
  ultra?(): boolean;
  isCommander?(): boolean;
  unmax?(): void;
  /** Essentials Deluxe: power_trigger (Mega/Z-Move/Dynamax button toggled on). */
  powerTrigger?: boolean;
  displayBaseMoves?(): void;
  displayPowerMoves?(type: string): void;
  hasCompatibleZMove?(move: never): boolean;
  item?: { name: string } | null;
  pbThis?(lowerCase?: boolean): string;
}

/** Battle as the scene reads it. */
export interface SceneBattle {
  scene: unknown;
  battlers: (SceneBattler | null)[];
  sideSizes: number[];
  /** Player and partner trainers (null in battles without a player, e.g. the debug scene). */
  player: SceneTrainer[] | null;
  /** Opposing trainers; null in a wild battle. */
  opponent: SceneTrainer[] | null;
  /** 0 = day, 1 = evening, 2 = night */
  time: number;
  backdrop: string;
  backdropBase: string | null;
  showAnims: boolean;
  trainerBattle(): boolean;
  wildBattle(): boolean;
  singleBattle?(): boolean;
  pbSideSize(idxBattler: number): number;
  /** opposes?(idxBattler1, idxBattler2 = 0) */
  opposes(idxBattler1: number, idxBattler2?: number): boolean;
  pbParty(idxBattler: number): (Pokemon | null)[];
  pbPartyStarts(idxBattler: number): number[];
  pbPartyOrder(idxBattler: number): number[];
  pbTeamIndexRangeFromBattlerIndex(idxBattler: number): [number, number];
  pbPlayerDisplayParty(idxBattler?: number): Pokemon[];
  pbNumPositions(side: number, idxTrainer: number): number;
  pbTeamLengthFromBattlerIndex(idxBattler: number): number;
  pbPlayerBattlerCount(): number;
  pbOpposingBattlerCount(idxBattler?: number): number;
  allBattlers(): SceneBattler[];
  allSameSideBattlers(idxBattler?: number): SceneBattler[];
  allOtherSideBattlers(idxBattler?: number): SceneBattler[];
  nearBattlers(idxBattler1: number, idxBattler2: number): boolean;
  pbGetOpposingIndicesInOrder(idxBattler: number): number[];
  pbMoveCanTarget(idxUser: number, idxTarget: number, targetData: Target): boolean;
  pbGetOwnerIndexFromBattlerIndex(idxBattler: number): number;
  pbGetOwnerFromBattlerIndex(idxBattler: number): SceneTrainer | null;
  pbPlayer(): SceneTrainer;
  pbCanShift(idxBattler: number): boolean;
  pbAbort(): void;
  pbDisplayPaused?(msg: string): Promise<void>;
  // Registered battle mechanics (Essentials Deluxe's pbFightMenu_RefreshMechanic)
  pbRegisteredMegaEvolution?(idxBattler: number): boolean;
  pbRegisteredUltraBurst?(idxBattler: number): boolean;
  pbRegisteredZMove?(idxBattler: number): boolean;
  pbRegisteredDynamax?(idxBattler: number): boolean;
  pbRegisteredCustom?(idxBattler: number): boolean;
  pbDisplay?(msg: string): Promise<void>;
}
