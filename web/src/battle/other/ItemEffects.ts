// Port of the Battle::ItemEffects registry in
//   Data/Scripts/011_Battle/006_Other battle code/009_Battle_ItemEffects.rb
//   Plugins/Generation 9 Pack Scripts/[004] Items/[001] New Item Handlers.rb
// (handler hashes + every trigger function; the handlers themselves are
// registered by the item handler files, e.g.
//   ItemEffects.SpeedCalc.add("CHOICESCARF", (item, battler, mult) => ...)
// ). Handlers receive the item ID first, as in Ruby (HandlerHash2#trigger).
//
// Triggers whose handlers can show messages, play animations or change the
// battle through the scene are async (their handlers may return a Promise):
//   AfterMoveUseFromTarget, AfterMoveUseFromUser, EndOfRoundEffect, EndOfRoundHealing, HPHeal, OnBeingHit, OnBeingHitPositiveBerry, OnEndOfUsingMove, OnEndOfUsingMoveStatRestore, OnIntimidated, OnMissingTarget, OnOpposingStatGain, OnStatLoss, OnSwitchIn, PriorityBracketUse, StatLossImmunity, StatusCure, TerrainStatBoost
// The other triggers are synchronous and their handlers must be too.
// This file is generated from the Ruby by web/tools/ruby-ref/genBattleRegistries.rb.

import type { Id } from "../../data/gameData/gameData";
import { ItemHandlerHash } from "../../game/items/ItemHandlers";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";

/** What a trigger receives as the item: an ID, a GameData object or nil. */
export type HandlerKey = Id | { id: Id } | null | undefined;
/** The damage multipliers hash of Battle::Move#pbCalcDamageMultipliers (:base_damage_multiplier, ...). */
export type DamageMultipliers = Record<string, number>;
/** The accuracy modifiers hash of Battle::Move#pbCalcAccuracyModifiers (:base_accuracy, ...). */
import type { AccuracyModifiers } from "./AbilityEffects";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (id: Id, ...args: any[]) => any;

/** Battle::ItemEffects.trigger(hash, *args, ret:) — the handler's result, or ret if it returned nil. */
function trigger<T>(hash: ItemHandlerHash<AnyHandler>, key: HandlerKey, args: unknown[], ret: T): T {
  if (key == null) return ret;
  const newRet = hash.trigger(key, ...args) as T | null | undefined;
  return newRet != null ? newRet : ret;
}

/** As trigger, for the handler kinds that can be async. */
async function triggerAsync<T>(hash: ItemHandlerHash<AnyHandler>, key: HandlerKey, args: unknown[], ret: T): Promise<T> {
  if (key == null) return ret;
  const newRet = (await hash.trigger(key, ...args)) as T | null | undefined;
  return newRet != null ? newRet : ret;
}

const h = (): ItemHandlerHash<AnyHandler> => new ItemHandlerHash<AnyHandler>();

export const ItemEffects = {
  SpeedCalc: h(),
  WeightCalc: h(), // Float Stone
  HPHeal: h(),
  OnStatLoss: h(),
  StatusCure: h(),
  PriorityBracketChange: h(),
  PriorityBracketUse: h(),
  OnMissingTarget: h(), // Blunder Policy
  AccuracyCalcFromUser: h(),
  AccuracyCalcFromTarget: h(),
  DamageCalcFromUser: h(),
  DamageCalcFromTarget: h(),
  CriticalCalcFromUser: h(),
  CriticalCalcFromTarget: h(), // None!
  OnBeingHit: h(),
  OnBeingHitPositiveBerry: h(),
  AfterMoveUseFromTarget: h(),
  AfterMoveUseFromUser: h(),
  OnEndOfUsingMove: h(), // Leppa Berry
  OnEndOfUsingMoveStatRestore: h(), // White Herb
  ExpGainModifier: h(), // Lucky Egg
  EVGainModifier: h(),
  WeatherExtender: h(),
  TerrainExtender: h(), // Terrain Extender
  TerrainStatBoost: h(),
  EndOfRoundHealing: h(),
  EndOfRoundEffect: h(),
  CertainSwitching: h(), // Shed Shell
  TrappingByTarget: h(), // None!
  OnSwitchIn: h(), // Air Balloon
  OnIntimidated: h(), // Adrenaline Orb
  CertainEscapeFromBattle: h(), // Smoke Ball
  OnOpposingStatGain: h(), // Mirror Herb ([004] Items)
  StatLossImmunity: h(), // Clear Amulet ([004] Items)

  triggerSpeedCalc(item: HandlerKey, battler: Battler, mult: number): number {
    return trigger(ItemEffects.SpeedCalc, item, [battler, mult], mult);
  },
  triggerWeightCalc(item: HandlerKey, battler: Battler, w: number): number {
    return trigger(ItemEffects.WeightCalc, item, [battler, w], w);
  },
  async triggerHPHeal(item: HandlerKey, battler: Battler, battle: Battle, forced: boolean): Promise<boolean> {
    return triggerAsync(ItemEffects.HPHeal, item, [battler, battle, forced], false);
  },
  async triggerOnStatLoss(item: HandlerKey, user: Battler, moveUser: Battler | null, battle: Battle): Promise<boolean> {
    return triggerAsync(ItemEffects.OnStatLoss, item, [user, moveUser, battle], false);
  },
  async triggerStatusCure(item: HandlerKey, battler: Battler, battle: Battle, forced: boolean): Promise<boolean> {
    return triggerAsync(ItemEffects.StatusCure, item, [battler, battle, forced], false);
  },
  triggerPriorityBracketChange(item: HandlerKey, battler: Battler, battle: Battle): number {
    return trigger(ItemEffects.PriorityBracketChange, item, [battler, battle], 0);
  },
  async triggerPriorityBracketUse(item: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.PriorityBracketUse, item, [battler, battle], null);
  },
  async triggerOnMissingTarget(item: HandlerKey, user: Battler, target: Battler, move: Move, hitNum: number, battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.OnMissingTarget, item, [user, target, move, hitNum, battle], null);
  },
  triggerAccuracyCalcFromUser(item: HandlerKey, mods: AccuracyModifiers, user: Battler, target: Battler, move: Move, type: Id): void {
    trigger(ItemEffects.AccuracyCalcFromUser, item, [mods, user, target, move, type], null);
  },
  triggerAccuracyCalcFromTarget(item: HandlerKey, mods: AccuracyModifiers, user: Battler, target: Battler, move: Move, type: Id): void {
    trigger(ItemEffects.AccuracyCalcFromTarget, item, [mods, user, target, move, type], null);
  },
  triggerDamageCalcFromUser(item: HandlerKey, user: Battler, target: Battler, move: Move, mults: DamageMultipliers, baseDamage: number, type: Id): void {
    trigger(ItemEffects.DamageCalcFromUser, item, [user, target, move, mults, baseDamage, type], null);
  },
  triggerDamageCalcFromTarget(item: HandlerKey, user: Battler, target: Battler, move: Move, mults: DamageMultipliers, baseDamage: number, type: Id): void {
    trigger(ItemEffects.DamageCalcFromTarget, item, [user, target, move, mults, baseDamage, type], null);
  },
  triggerCriticalCalcFromUser(item: HandlerKey, user: Battler, target: Battler, critStage: number): number {
    return trigger(ItemEffects.CriticalCalcFromUser, item, [user, target, critStage], critStage);
  },
  triggerCriticalCalcFromTarget(item: HandlerKey, user: Battler, target: Battler, critStage: number): number {
    return trigger(ItemEffects.CriticalCalcFromTarget, item, [user, target, critStage], critStage);
  },
  async triggerOnBeingHit(item: HandlerKey, user: Battler, target: Battler, move: Move, battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.OnBeingHit, item, [user, target, move, battle], null);
  },
  async triggerOnBeingHitPositiveBerry(item: HandlerKey, battler: Battler, battle: Battle, forced: boolean): Promise<boolean> {
    return triggerAsync(ItemEffects.OnBeingHitPositiveBerry, item, [battler, battle, forced], false);
  },
  async triggerAfterMoveUseFromTarget(item: HandlerKey, battler: Battler, user: Battler, move: Move, switchedBattlers: number[], battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.AfterMoveUseFromTarget, item, [battler, user, move, switchedBattlers, battle], null);
  },
  async triggerAfterMoveUseFromUser(item: HandlerKey, user: Battler, targets: Battler[], move: Move, numHits: number, battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.AfterMoveUseFromUser, item, [user, targets, move, numHits, battle], null);
  },
  async triggerOnEndOfUsingMove(item: HandlerKey, battler: Battler, battle: Battle, forced: boolean): Promise<boolean> {
    return triggerAsync(ItemEffects.OnEndOfUsingMove, item, [battler, battle, forced], false);
  },
  async triggerOnEndOfUsingMoveStatRestore(item: HandlerKey, battler: Battler, battle: Battle, forced: boolean): Promise<boolean> {
    return triggerAsync(ItemEffects.OnEndOfUsingMoveStatRestore, item, [battler, battle, forced], false);
  },
  triggerExpGainModifier(item: HandlerKey, battler: Battler, exp: number): number {
    return trigger(ItemEffects.ExpGainModifier, item, [battler, exp], -1);
  },
  /** Returns whether a handler exists (and runs it). */
  triggerEVGainModifier(item: HandlerKey, battler: Battler | null, evArray: Record<Id, number>): boolean {
    if (!ItemEffects.EVGainModifier.get(item)) return false;
    ItemEffects.EVGainModifier.trigger(item!, battler, evArray);
    return true;
  },
  triggerWeatherExtender(item: HandlerKey, weather: Id, duration: number, battler: Battler, battle: Battle): number {
    return trigger(ItemEffects.WeatherExtender, item, [weather, duration, battler, battle], duration);
  },
  triggerTerrainExtender(item: HandlerKey, terrain: Id, duration: number, battler: Battler, battle: Battle): number {
    return trigger(ItemEffects.TerrainExtender, item, [terrain, duration, battler, battle], duration);
  },
  async triggerTerrainStatBoost(item: HandlerKey, battler: Battler, battle: Battle): Promise<boolean> {
    return triggerAsync(ItemEffects.TerrainStatBoost, item, [battler, battle], false);
  },
  async triggerEndOfRoundHealing(item: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.EndOfRoundHealing, item, [battler, battle], null);
  },
  async triggerEndOfRoundEffect(item: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.EndOfRoundEffect, item, [battler, battle], null);
  },
  triggerCertainSwitching(item: HandlerKey, switcher: Battler, battle: Battle): boolean {
    return trigger(ItemEffects.CertainSwitching, item, [switcher, battle], false);
  },
  triggerTrappingByTarget(item: HandlerKey, switcher: Battler, bearer: Battler, battle: Battle): boolean {
    return trigger(ItemEffects.TrappingByTarget, item, [switcher, bearer, battle], false);
  },
  async triggerOnSwitchIn(item: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(ItemEffects.OnSwitchIn, item, [battler, battle], null);
  },
  async triggerOnIntimidated(item: HandlerKey, battler: Battler, battle: Battle): Promise<boolean> {
    return triggerAsync(ItemEffects.OnIntimidated, item, [battler, battle], false);
  },
  triggerCertainEscapeFromBattle(item: HandlerKey, battler: Battler): boolean {
    return trigger(ItemEffects.CertainEscapeFromBattle, item, [battler], false);
  },
  async triggerOnOpposingStatGain(item: HandlerKey, battler: Battler, battle: Battle, statUps: Record<Id, number>, forced: boolean): Promise<boolean> { // (Generation 9 Pack Scripts/[004] Items/[001] New Item Handlers.rb)
    return triggerAsync(ItemEffects.OnOpposingStatGain, item, [battler, battle, statUps, forced], false);
  },
  async triggerStatLossImmunity(item: HandlerKey, battler: Battler, stat: Id, battle: Battle, showMessage: boolean): Promise<boolean> { // (Generation 9 Pack Scripts/[004] Items/[001] New Item Handlers.rb)
    return triggerAsync(ItemEffects.StatLossImmunity, item, [battler, stat, battle, showMessage], false);
  },
};
