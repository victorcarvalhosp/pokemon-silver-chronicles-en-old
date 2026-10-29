// Port of the Battle::AbilityEffects registry in
//   Data/Scripts/011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb
//   Plugins/Generation 9 Pack Scripts/[003] Abilities/[000] Ability Handlers.rb
// (handler hashes + every trigger function; the handlers themselves are
// registered by the ability handler files, e.g.
//   AbilityEffects.SpeedCalc.add("CHLOROPHYLL", (ability, battler, mult) => ...)
// ). Handlers receive the ability ID first, as in Ruby (HandlerHash2#trigger).
//
// Triggers whose handlers can show messages, play animations or change the
// battle through the scene are async (their handlers may return a Promise):
//   AfterMoveUseFromTarget, ChangeOnBattlerFainting, EndOfRoundEffect, EndOfRoundGainItem, EndOfRoundHealing, EndOfRoundWeather, MoveImmunity, OnBattlerFainting, OnBeingHit, OnDealingHit, OnEndOfUsingMove, OnFlinch, OnHPDroppedBelowHalf, OnIntimidated, OnOpposingStatGain, OnStatLoss, OnStatGain, OnStatusInflicted, OnSwitchIn, OnSwitchOut, OnTerrainChange, PriorityBracketUse, StatLossImmunity, StatLossImmunityFromAlly, StatLossImmunityNonIgnorable, StatusCure
// The other triggers are synchronous and their handlers must be too.
// This file is generated from the Ruby by web/tools/ruby-ref/genBattleRegistries.rb.

import type { Id } from "../../data/gameData/gameData";
import { ItemHandlerHash } from "../../game/items/ItemHandlers";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";

/** What a trigger receives as the ability: an ID, a GameData object or nil. */
export type HandlerKey = Id | { id: Id } | null | undefined;
/** The damage multipliers hash of Battle::Move#pbCalcDamageMultipliers (:base_damage_multiplier, ...). */
export type DamageMultipliers = Record<string, number>;
/** The accuracy modifiers hash of Battle::Move#pbCalcAccuracyModifiers (:base_accuracy, ...). */
export type AccuracyModifiers = Record<string, number>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (id: Id, ...args: any[]) => any;

/** Battle::AbilityEffects.trigger(hash, *args, ret:) — the handler's result, or ret if it returned nil. */
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

export const AbilityEffects = {
  SpeedCalc: h(),
  WeightCalc: h(),
  OnHPDroppedBelowHalf: h(),
  StatusCheckNonIgnorable: h(), // Comatose
  StatusImmunity: h(),
  StatusImmunityNonIgnorable: h(),
  StatusImmunityFromAlly: h(),
  OnStatusInflicted: h(), // Synchronize
  StatusCure: h(),
  StatLossImmunity: h(),
  StatLossImmunityNonIgnorable: h(), // Full Metal Body
  StatLossImmunityFromAlly: h(), // Flower Veil
  OnStatGain: h(), // None!
  OnStatLoss: h(),
  PriorityChange: h(),
  PriorityBracketChange: h(), // Stall
  PriorityBracketUse: h(), // None!
  OnFlinch: h(), // Steadfast
  MoveBlocking: h(),
  MoveImmunity: h(),
  ModifyMoveBaseType: h(),
  AccuracyCalcFromUser: h(),
  AccuracyCalcFromAlly: h(), // Victory Star
  AccuracyCalcFromTarget: h(),
  DamageCalcFromUser: h(),
  DamageCalcFromAlly: h(),
  DamageCalcFromTarget: h(),
  DamageCalcFromTargetNonIgnorable: h(),
  DamageCalcFromTargetAlly: h(),
  CriticalCalcFromUser: h(),
  CriticalCalcFromTarget: h(),
  OnBeingHit: h(),
  OnDealingHit: h(), // Poison Touch
  OnEndOfUsingMove: h(),
  AfterMoveUseFromTarget: h(),
  EndOfRoundWeather: h(),
  EndOfRoundHealing: h(),
  EndOfRoundEffect: h(),
  EndOfRoundGainItem: h(),
  CertainSwitching: h(), // None!
  TrappingByTarget: h(),
  OnSwitchIn: h(),
  OnSwitchOut: h(),
  ChangeOnBattlerFainting: h(),
  OnBattlerFainting: h(), // Soul-Heart
  OnTerrainChange: h(), // Mimicry
  OnIntimidated: h(), // Rattled (Gen 8)
  CertainEscapeFromBattle: h(), // Run Away
  OnTypeChange: h(), // Protean, Libero ([003] Abilities)
  OnOpposingStatGain: h(), // Opportunist ([003] Abilities)

  triggerSpeedCalc(ability: HandlerKey, battler: Battler, mult: number): number {
    return trigger(AbilityEffects.SpeedCalc, ability, [battler, mult], mult);
  },
  triggerWeightCalc(ability: HandlerKey, battler: Battler, weight: number): number {
    return trigger(AbilityEffects.WeightCalc, ability, [battler, weight], weight);
  },
  async triggerOnHPDroppedBelowHalf(ability: HandlerKey, user: Battler, moveUser: Battler | null, battle: Battle): Promise<boolean> {
    return triggerAsync(AbilityEffects.OnHPDroppedBelowHalf, ability, [user, moveUser, battle], false);
  },
  triggerStatusCheckNonIgnorable(ability: HandlerKey, battler: Battler, status: Id): boolean {
    return trigger(AbilityEffects.StatusCheckNonIgnorable, ability, [battler, status], false);
  },
  triggerStatusImmunity(ability: HandlerKey, battler: Battler, status: Id): boolean {
    return trigger(AbilityEffects.StatusImmunity, ability, [battler, status], false);
  },
  triggerStatusImmunityNonIgnorable(ability: HandlerKey, battler: Battler, status: Id): boolean {
    return trigger(AbilityEffects.StatusImmunityNonIgnorable, ability, [battler, status], false);
  },
  triggerStatusImmunityFromAlly(ability: HandlerKey, battler: Battler, status: Id): boolean {
    return trigger(AbilityEffects.StatusImmunityFromAlly, ability, [battler, status], false);
  },
  async triggerOnStatusInflicted(ability: HandlerKey, battler: Battler, user: Battler, status: Id): Promise<void> {
    await triggerAsync(AbilityEffects.OnStatusInflicted, ability, [battler, user, status], null);
  },
  async triggerStatusCure(ability: HandlerKey, battler: Battler): Promise<boolean> {
    return triggerAsync(AbilityEffects.StatusCure, ability, [battler], false);
  },
  async triggerStatLossImmunity(ability: HandlerKey, battler: Battler, stat: Id, battle: Battle, showMessages: boolean): Promise<boolean> {
    return triggerAsync(AbilityEffects.StatLossImmunity, ability, [battler, stat, battle, showMessages], false);
  },
  async triggerStatLossImmunityNonIgnorable(ability: HandlerKey, battler: Battler, stat: Id, battle: Battle, showMessages: boolean): Promise<boolean> {
    return triggerAsync(AbilityEffects.StatLossImmunityNonIgnorable, ability, [battler, stat, battle, showMessages], false);
  },
  async triggerStatLossImmunityFromAlly(ability: HandlerKey, bearer: Battler, battler: Battler, stat: Id, battle: Battle, showMessages: boolean): Promise<boolean> {
    return triggerAsync(AbilityEffects.StatLossImmunityFromAlly, ability, [bearer, battler, stat, battle, showMessages], false);
  },
  async triggerOnStatGain(ability: HandlerKey, battler: Battler, stat: Id, user: Battler): Promise<void> {
    await triggerAsync(AbilityEffects.OnStatGain, ability, [battler, stat, user], null);
  },
  async triggerOnStatLoss(ability: HandlerKey, battler: Battler, stat: Id, user: Battler): Promise<void> {
    await triggerAsync(AbilityEffects.OnStatLoss, ability, [battler, stat, user], null);
  },
  triggerPriorityChange(ability: HandlerKey, battler: Battler, move: Move, priority: number): number {
    return trigger(AbilityEffects.PriorityChange, ability, [battler, move, priority], priority);
  },
  triggerPriorityBracketChange(ability: HandlerKey, battler: Battler, battle: Battle): number {
    return trigger(AbilityEffects.PriorityBracketChange, ability, [battler, battle], 0);
  },
  async triggerPriorityBracketUse(ability: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.PriorityBracketUse, ability, [battler, battle], null);
  },
  async triggerOnFlinch(ability: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.OnFlinch, ability, [battler, battle], null);
  },
  triggerMoveBlocking(ability: HandlerKey, bearer: Battler, user: Battler, targets: Battler[], move: Move, battle: Battle): boolean {
    return trigger(AbilityEffects.MoveBlocking, ability, [bearer, user, targets, move, battle], false);
  },
  async triggerMoveImmunity(ability: HandlerKey, user: Battler, target: Battler, move: Move, type: Id, battle: Battle, showMessage: boolean): Promise<boolean> {
    return triggerAsync(AbilityEffects.MoveImmunity, ability, [user, target, move, type, battle, showMessage], false);
  },
  triggerModifyMoveBaseType(ability: HandlerKey, user: Battler, move: Move, type: Id): Id {
    return trigger(AbilityEffects.ModifyMoveBaseType, ability, [user, move, type], type);
  },
  triggerAccuracyCalcFromUser(ability: HandlerKey, mods: AccuracyModifiers, user: Battler, target: Battler, move: Move, type: Id): void {
    trigger(AbilityEffects.AccuracyCalcFromUser, ability, [mods, user, target, move, type], null);
  },
  triggerAccuracyCalcFromAlly(ability: HandlerKey, mods: AccuracyModifiers, user: Battler, target: Battler, move: Move, type: Id): void {
    trigger(AbilityEffects.AccuracyCalcFromAlly, ability, [mods, user, target, move, type], null);
  },
  triggerAccuracyCalcFromTarget(ability: HandlerKey, mods: AccuracyModifiers, user: Battler, target: Battler, move: Move, type: Id): void {
    trigger(AbilityEffects.AccuracyCalcFromTarget, ability, [mods, user, target, move, type], null);
  },
  triggerDamageCalcFromUser(ability: HandlerKey, user: Battler, target: Battler, move: Move, mults: DamageMultipliers, baseDamage: number, type: Id): void {
    trigger(AbilityEffects.DamageCalcFromUser, ability, [user, target, move, mults, baseDamage, type], null);
  },
  triggerDamageCalcFromAlly(ability: HandlerKey, user: Battler, target: Battler, move: Move, mults: DamageMultipliers, baseDamage: number, type: Id): void {
    trigger(AbilityEffects.DamageCalcFromAlly, ability, [user, target, move, mults, baseDamage, type], null);
  },
  triggerDamageCalcFromTarget(ability: HandlerKey, user: Battler, target: Battler, move: Move, mults: DamageMultipliers, baseDamage: number, type: Id): void {
    trigger(AbilityEffects.DamageCalcFromTarget, ability, [user, target, move, mults, baseDamage, type], null);
  },
  triggerDamageCalcFromTargetNonIgnorable(ability: HandlerKey, user: Battler, target: Battler, move: Move, mults: DamageMultipliers, baseDamage: number, type: Id): void {
    trigger(AbilityEffects.DamageCalcFromTargetNonIgnorable, ability, [user, target, move, mults, baseDamage, type], null);
  },
  triggerDamageCalcFromTargetAlly(ability: HandlerKey, user: Battler, target: Battler, move: Move, mults: DamageMultipliers, baseDamage: number, type: Id): void {
    trigger(AbilityEffects.DamageCalcFromTargetAlly, ability, [user, target, move, mults, baseDamage, type], null);
  },
  triggerCriticalCalcFromUser(ability: HandlerKey, user: Battler, target: Battler, critStage: number): number {
    return trigger(AbilityEffects.CriticalCalcFromUser, ability, [user, target, critStage], critStage);
  },
  triggerCriticalCalcFromTarget(ability: HandlerKey, user: Battler, target: Battler, critStage: number): number {
    return trigger(AbilityEffects.CriticalCalcFromTarget, ability, [user, target, critStage], critStage);
  },
  async triggerOnBeingHit(ability: HandlerKey, user: Battler, target: Battler, move: Move, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.OnBeingHit, ability, [user, target, move, battle], null);
  },
  async triggerOnDealingHit(ability: HandlerKey, user: Battler, target: Battler, move: Move, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.OnDealingHit, ability, [user, target, move, battle], null);
  },
  async triggerOnEndOfUsingMove(ability: HandlerKey, user: Battler, targets: Battler[], move: Move, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.OnEndOfUsingMove, ability, [user, targets, move, battle], null);
  },
  async triggerAfterMoveUseFromTarget(ability: HandlerKey, target: Battler, user: Battler, move: Move, switchedBattlers: number[], battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.AfterMoveUseFromTarget, ability, [target, user, move, switchedBattlers, battle], null);
  },
  async triggerEndOfRoundWeather(ability: HandlerKey, weather: Id, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.EndOfRoundWeather, ability, [weather, battler, battle], null);
  },
  async triggerEndOfRoundHealing(ability: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.EndOfRoundHealing, ability, [battler, battle], null);
  },
  async triggerEndOfRoundEffect(ability: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.EndOfRoundEffect, ability, [battler, battle], null);
  },
  async triggerEndOfRoundGainItem(ability: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.EndOfRoundGainItem, ability, [battler, battle], null);
  },
  triggerCertainSwitching(ability: HandlerKey, switcher: Battler, battle: Battle): boolean {
    return trigger(AbilityEffects.CertainSwitching, ability, [switcher, battle], false);
  },
  triggerTrappingByTarget(ability: HandlerKey, switcher: Battler, bearer: Battler, battle: Battle): boolean {
    return trigger(AbilityEffects.TrappingByTarget, ability, [switcher, bearer, battle], false);
  },
  /** Generation 9 Pack ([003] Abilities/[000] Ability Handlers.rb:12): also triggers allies' Commander. */
  async triggerOnSwitchIn(ability: HandlerKey, battler: Battler, battle: Battle, switchIn = false): Promise<void> {
    if (ability != null) await AbilityEffects.OnSwitchIn.trigger(ability, battler, battle, switchIn);
    for (const b of battle.allSameSideBattlers(battler.index)) {
      if (!b.hasActiveAbility("COMMANDER")) continue;
      if (b.effects[402 /* PBEffects.Commander */]) continue;
      await AbilityEffects.OnSwitchIn.trigger(b.abilityId!, b, battle, switchIn);
    }
  },
  async triggerOnSwitchOut(ability: HandlerKey, battler: Battler, endOfBattle: boolean): Promise<void> {
    await triggerAsync(AbilityEffects.OnSwitchOut, ability, [battler, endOfBattle], null);
  },
  async triggerChangeOnBattlerFainting(ability: HandlerKey, battler: Battler, fainted: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.ChangeOnBattlerFainting, ability, [battler, fainted, battle], null);
  },
  async triggerOnBattlerFainting(ability: HandlerKey, battler: Battler, fainted: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.OnBattlerFainting, ability, [battler, fainted, battle], null);
  },
  async triggerOnTerrainChange(ability: HandlerKey, battler: Battler, battle: Battle, abilityChanged: boolean): Promise<void> {
    await triggerAsync(AbilityEffects.OnTerrainChange, ability, [battler, battle, abilityChanged], null);
  },
  async triggerOnIntimidated(ability: HandlerKey, battler: Battler, battle: Battle): Promise<void> {
    await triggerAsync(AbilityEffects.OnIntimidated, ability, [battler, battle], null);
  },
  triggerCertainEscapeFromBattle(ability: HandlerKey, battler: Battler): boolean {
    return trigger(AbilityEffects.CertainEscapeFromBattle, ability, [battler], false);
  },
  triggerOnTypeChange(ability: HandlerKey, battler: Battler, type: Id): void { // (Generation 9 Pack Scripts/[003] Abilities/[000] Ability Handlers.rb)
    trigger(AbilityEffects.OnTypeChange, ability, [battler, type], null);
  },
  async triggerOnOpposingStatGain(ability: HandlerKey, battler: Battler, battle: Battle, statUps: Record<Id, number>): Promise<void> { // (Generation 9 Pack Scripts/[003] Abilities/[000] Ability Handlers.rb)
    await triggerAsync(AbilityEffects.OnOpposingStatGain, ability, [battler, battle, statUps], null);
  },
};
