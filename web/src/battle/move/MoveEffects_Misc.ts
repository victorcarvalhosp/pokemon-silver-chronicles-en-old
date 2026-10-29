// Port of Data/Scripts/011_Battle/003_Move/005_MoveEffects_Misc.rb, with:
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:251):
//   UserSwapsPositionsWithAlly (Gen 9 Ally Switch: pbChangeUsageCounters keeps
//   ProtectRate, pbMoveFailed? fails on consecutive use, pbEffectGeneral sets
//   AllySwitch and triples ProtectRate).
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:150):
//   RemoveUserBindingAndEntryHazards#pbEffectAfterAllHits (also clears
//   G-Max Steelsurge).
// Alias chains: UserSwapsPositionsWithAlly pbMoveFailed?/pbEffectGeneral =
//   Gen 9( core ); RemoveUserBindingAndEntryHazards pbEffectAfterAllHits =
//   ZUD( core ).
//
// Sync/async of the overridden methods: see the table in Move_Usage.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { Move, registerMoveClass } from "./Move";
import { StatUpMove, WeatherMove } from "./Move_BaseEffects";

//===============================================================================
// No additional effect.
//===============================================================================
// Battle::Move::None is defined (and registered) in Move.ts, right after
// Battle::Move, so that it exists even before the effect files load.

//===============================================================================
// Does absolutely nothing. Shows a special message. (Celebrate)
//===============================================================================
export class DoesNothingCongratulations extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.wild()) {
      await this.battle.pbDisplay(_INTL("Congratulations from {1}!", user.pbThis(true)));
    } else {
      await this.battle.pbDisplay(_INTL("Congratulations, {1}!", this.battle.pbGetOwnerName(user.index)));
    }
  }
}
registerMoveClass("DoesNothingCongratulations", DoesNothingCongratulations);

//===============================================================================
// Does absolutely nothing. (Hold Hands)
//===============================================================================
export class DoesNothingFailsIfNoAlly extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.allAllies().length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("DoesNothingFailsIfNoAlly", DoesNothingFailsIfNoAlly);

//===============================================================================
// Does absolutely nothing. (Splash)
//===============================================================================
export class DoesNothingUnusableInGravity extends Move {
  override unusableInGravity(): boolean { return true; }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    await this.battle.pbDisplay(_INTL("But nothing happened!"));
  }
}
registerMoveClass("DoesNothingUnusableInGravity", DoesNothingUnusableInGravity);

//===============================================================================
// Scatters coins that the player picks up after winning the battle. (Pay Day)
// NOTE: In Gen 6+, if the user levels up after this move is used, the amount of
//       money picked up depends on the user's new level rather than its level
//       when it used the move. I think this is silly, so I haven't coded this
//       effect.
//===============================================================================
export class AddMoneyGainedFromBattle extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.pbOwnedByPlayer()) {
      this.battle.field.effects[PBEffects.PayDay] += 5 * user.level;
    }
    await this.battle.pbDisplay(_INTL("Coins were scattered everywhere!"));
  }
}
registerMoveClass("AddMoneyGainedFromBattle", AddMoneyGainedFromBattle);

//===============================================================================
// Doubles the prize money the player gets after winning the battle. (Happy Hour)
//===============================================================================
export class DoubleMoneyGainedFromBattle extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (!user.opposes()) this.battle.field.effects[PBEffects.HappyHour] = true;
    await this.battle.pbDisplay(_INTL("Everyone is caught up in the happy atmosphere!"));
  }
}
registerMoveClass("DoubleMoneyGainedFromBattle", DoubleMoneyGainedFromBattle);

//===============================================================================
// Fails if this isn't the user's first turn. (First Impression)
//===============================================================================
export class FailsIfNotUserFirstTurn extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.turnCount > 1) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("FailsIfNotUserFirstTurn", FailsIfNotUserFirstTurn);

//===============================================================================
// Fails unless user has already used all other moves it knows. (Last Resort)
//===============================================================================
export class FailsIfUserHasUnusedMove extends Move {
  override async pbFailsAgainstTarget(user: Battler, _target: Battler, showMessage: boolean): Promise<boolean> {
    let hasThisMove = false;
    let hasOtherMoves = false;
    let hasUnusedMoves = false;
    user.eachMove((m) => {
      if (m.id === this.id) hasThisMove = true;
      if (m.id !== this.id) hasOtherMoves = true;
      if (m.id !== this.id && !user.movesUsed.includes(m.id)) hasUnusedMoves = true;
    });
    if (!hasThisMove || !hasOtherMoves || hasUnusedMoves) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("FailsIfUserHasUnusedMove", FailsIfUserHasUnusedMove);

//===============================================================================
// Fails unless user has consumed a berry at some point. (Belch)
//===============================================================================
export class FailsIfUserNotConsumedBerry extends Move {
  override pbCanChooseMove(user: Battler, _commandPhase: boolean, _showMessages: false = false): boolean {
    return user.belched();
  }

  override async pbCanChooseMoveAsync(user: Battler, commandPhase: boolean, showMessages: boolean): Promise<boolean> {
    if (!user.belched()) {
      if (showMessages) {
        const msg = _INTL("{1} hasn't eaten any held berry, so it can't possibly belch!", user.pbThis());
        if (commandPhase) {
          await this.battle.pbDisplayPaused(msg);
        } else {
          await this.battle.pbDisplay(msg);
        }
      }
      return false;
    }
    return true;
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.belched()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("FailsIfUserNotConsumedBerry", FailsIfUserNotConsumedBerry);

//===============================================================================
// Fails if the target is not holding an item, or if the target is affected by
// Magic Room/Klutz. (Poltergeist)
//===============================================================================
export class FailsIfTargetHasNoItem extends Move {
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.item || !target.itemActive()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    // NOTE (Ruby parity): this message is shown even when show_message is false
    // (005_MoveEffects_Misc.rb:140).
    await this.battle.pbDisplay(_INTL("{1} is about to be attacked by its {2}!", target.pbThis(), target.itemName()));
    return false;
  }
}
registerMoveClass("FailsIfTargetHasNoItem", FailsIfTargetHasNoItem);

//===============================================================================
// Only damages Pokémon that share a type with the user. (Synchronoise)
//===============================================================================
export class FailsUnlessTargetSharesTypeWithUser extends Move {
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    const userTypes = user.pbTypes(true);
    const targetTypes = target.pbTypes(true);
    let sharesType = false;
    for (const t of userTypes) {
      if (!targetTypes.includes(t)) continue;
      sharesType = true;
      break;
    }
    if (!sharesType) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
      return true;
    }
    return false;
  }
}
registerMoveClass("FailsUnlessTargetSharesTypeWithUser", FailsUnlessTargetSharesTypeWithUser);

//===============================================================================
// Fails if user was hit by a damaging move this round. (Focus Punch)
//===============================================================================
export class FailsIfUserDamagedThisTurn extends Move {
  override async pbDisplayChargeMessage(user: Battler): Promise<void> {
    user.effects[PBEffects.FocusPunch] = true;
    await this.battle.pbCommonAnimation("FocusPunch", user);
    await this.battle.pbDisplay(_INTL("{1} is tightening its focus!", user.pbThis()));
  }

  override async pbDisplayUseMessage(user: Battler): Promise<void> {
    if (!user.effects[PBEffects.FocusPunch] || user.lastHPLost === 0) await super.pbDisplayUseMessage(user);
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.FocusPunch] && user.lastHPLost > 0) {
      await this.battle.pbDisplay(_INTL("{1} lost its focus and couldn't move!", user.pbThis()));
      return true;
    }
    return false;
  }
}
registerMoveClass("FailsIfUserDamagedThisTurn", FailsIfUserDamagedThisTurn);

//===============================================================================
// Fails if the target didn't chose a damaging move to use this round, or has
// already moved. (Sucker Punch)
//===============================================================================
export class FailsIfTargetActed extends Move {
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.battle.choices[target.index]![0] !== "UseMove") {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    const oppMove = this.battle.choices[target.index]![2] as Move | null;
    if (!oppMove ||
        (oppMove.function !== "UseMoveTargetIsAboutToUse" &&
         (target.movedThisRound() || oppMove.statusMove()))) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("FailsIfTargetActed", FailsIfTargetActed);

//===============================================================================
// If attack misses, user takes crash damage of 1/2 of max HP.
// (High Jump Kick, Jump Kick)
//===============================================================================
export class CrashDamageIfFailsUnusableInGravity extends Move {
  override recoilMove(): boolean { return true; }
  override unusableInGravity(): boolean { return true; }

  override async pbCrashDamage(user: Battler): Promise<void> {
    if (!user.takesIndirectDamage()) return;
    await this.battle.pbDisplay(_INTL("{1} kept going and crashed!", user.pbThis()));
    await this.battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(Math.floor(user.totalhp / 2), false);
    await user.pbItemHPHealCheck();
    if (user.fainted()) await user.pbFaint();
  }
}
registerMoveClass("CrashDamageIfFailsUnusableInGravity", CrashDamageIfFailsUnusableInGravity);

//===============================================================================
// Starts sunny weather. (Sunny Day)
//===============================================================================
export class StartSunWeather extends WeatherMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.weatherType = "Sun";
  }
}
registerMoveClass("StartSunWeather", StartSunWeather);

//===============================================================================
// Starts rainy weather. (Rain Dance)
//===============================================================================
export class StartRainWeather extends WeatherMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.weatherType = "Rain";
  }
}
registerMoveClass("StartRainWeather", StartRainWeather);

//===============================================================================
// Starts sandstorm weather. (Sandstorm)
//===============================================================================
export class StartSandstormWeather extends WeatherMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.weatherType = "Sandstorm";
  }
}
registerMoveClass("StartSandstormWeather", StartSandstormWeather);

//===============================================================================
// Starts hail weather. (Hail)
//===============================================================================
export class StartHailWeather extends WeatherMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.weatherType = "Hail";
  }
}
registerMoveClass("StartHailWeather", StartHailWeather);

//===============================================================================
// For 5 rounds, creates an electric terrain which boosts Electric-type moves and
// prevents Pokémon from falling asleep. Affects non-airborne Pokémon only.
// (Electric Terrain)
//===============================================================================
export class StartElectricTerrain extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.field.terrain === "Electric") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await this.battle.pbStartTerrain(user, "Electric");
  }
}
registerMoveClass("StartElectricTerrain", StartElectricTerrain);

//===============================================================================
// For 5 rounds, creates a grassy terrain which boosts Grass-type moves and heals
// Pokémon at the end of each round. Affects non-airborne Pokémon only.
// (Grassy Terrain)
//===============================================================================
export class StartGrassyTerrain extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.field.terrain === "Grassy") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await this.battle.pbStartTerrain(user, "Grassy");
  }
}
registerMoveClass("StartGrassyTerrain", StartGrassyTerrain);

//===============================================================================
// For 5 rounds, creates a misty terrain which weakens Dragon-type moves and
// protects Pokémon from status problems. Affects non-airborne Pokémon only.
// (Misty Terrain)
//===============================================================================
export class StartMistyTerrain extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.field.terrain === "Misty") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await this.battle.pbStartTerrain(user, "Misty");
  }
}
registerMoveClass("StartMistyTerrain", StartMistyTerrain);

//===============================================================================
// For 5 rounds, creates a psychic terrain which boosts Psychic-type moves and
// prevents Pokémon from being hit by >0 priority moves. Affects non-airborne
// Pokémon only. (Psychic Terrain)
//===============================================================================
export class StartPsychicTerrain extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.field.terrain === "Psychic") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await this.battle.pbStartTerrain(user, "Psychic");
  }
}
registerMoveClass("StartPsychicTerrain", StartPsychicTerrain);

//===============================================================================
// Removes the current terrain. Fails if there is no terrain in effect.
// (Steel Roller)
//===============================================================================
export class RemoveTerrain extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.field.terrain === "None") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    switch (this.battle.field.terrain) {
      case "Electric":
        await this.battle.pbDisplay(_INTL("The electricity disappeared from the battlefield."));
        break;
      case "Grassy":
        await this.battle.pbDisplay(_INTL("The grass disappeared from the battlefield."));
        break;
      case "Misty":
        await this.battle.pbDisplay(_INTL("The mist disappeared from the battlefield."));
        break;
      case "Psychic":
        await this.battle.pbDisplay(_INTL("The weirdness disappeared from the battlefield."));
        break;
    }
    this.battle.field.terrain = "None";
  }
}
registerMoveClass("RemoveTerrain", RemoveTerrain);

//===============================================================================
// Entry hazard. Lays spikes on the opposing side (max. 3 layers). (Spikes)
//===============================================================================
export class AddSpikesToFoeSide extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOpposingSide().effects[PBEffects.Spikes] >= 3) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOpposingSide().effects[PBEffects.Spikes] += 1;
    await this.battle.pbDisplay(_INTL("Spikes were scattered all around {1}'s feet!",
      user.pbOpposingTeam(true)));
  }
}
registerMoveClass("AddSpikesToFoeSide", AddSpikesToFoeSide);

//===============================================================================
// Entry hazard. Lays poison spikes on the opposing side (max. 2 layers).
// (Toxic Spikes)
//===============================================================================
export class AddToxicSpikesToFoeSide extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOpposingSide().effects[PBEffects.ToxicSpikes] >= 2) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOpposingSide().effects[PBEffects.ToxicSpikes] += 1;
    await this.battle.pbDisplay(_INTL("Poison spikes were scattered all around {1}'s feet!",
      user.pbOpposingTeam(true)));
  }
}
registerMoveClass("AddToxicSpikesToFoeSide", AddToxicSpikesToFoeSide);

//===============================================================================
// Entry hazard. Lays stealth rocks on the opposing side. (Stealth Rock)
//===============================================================================
export class AddStealthRocksToFoeSide extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOpposingSide().effects[PBEffects.StealthRock]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOpposingSide().effects[PBEffects.StealthRock] = true;
    await this.battle.pbDisplay(_INTL("Pointed stones float in the air around {1}!",
      user.pbOpposingTeam(true)));
  }
}
registerMoveClass("AddStealthRocksToFoeSide", AddStealthRocksToFoeSide);

//===============================================================================
// Entry hazard. Lays stealth rocks on the opposing side. (Sticky Web)
//===============================================================================
export class AddStickyWebToFoeSide extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOpposingSide().effects[PBEffects.StickyWeb]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOpposingSide().effects[PBEffects.StickyWeb] = true;
    await this.battle.pbDisplay(_INTL("A sticky web has been laid out beneath {1}'s feet!",
      user.pbOpposingTeam(true)));
  }
}
registerMoveClass("AddStickyWebToFoeSide", AddStickyWebToFoeSide);

//===============================================================================
// All effects that apply to one side of the field are swapped to the opposite
// side. (Court Change)
//===============================================================================
export class SwapSideEffects extends Move {
  numberEffects: number[] = [
    PBEffects.AuroraVeil,
    PBEffects.LightScreen,
    PBEffects.Mist,
    PBEffects.Rainbow,
    PBEffects.Reflect,
    PBEffects.Safeguard,
    PBEffects.SeaOfFire,
    PBEffects.Spikes,
    PBEffects.Swamp,
    PBEffects.Tailwind,
    PBEffects.ToxicSpikes,
  ];
  booleanEffects: number[] = [
    PBEffects.StealthRock,
    PBEffects.StickyWeb,
  ];

  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    let hasEffect = false;
    for (let side = 0; side < 2; side++) {
      const effects = this.battle.sides[side]!.effects;
      for (const e of this.numberEffects) {
        if (effects[e] === 0) continue;
        hasEffect = true;
        break;
      }
      if (hasEffect) break;
      for (const e of this.booleanEffects) {
        if (!effects[e]) continue;
        hasEffect = true;
        break;
      }
      if (hasEffect) break;
    }
    if (!hasEffect) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const side0 = this.battle.sides[0]!;
    const side1 = this.battle.sides[1]!;
    for (const e of this.numberEffects) {
      [side0.effects[e], side1.effects[e]] = [side1.effects[e], side0.effects[e]];
    }
    for (const e of this.booleanEffects) {
      [side0.effects[e], side1.effects[e]] = [side1.effects[e], side0.effects[e]];
    }
    await this.battle.pbDisplay(_INTL("{1} swapped the battle effects affecting each side of the field!", user.pbThis()));
  }
}
registerMoveClass("SwapSideEffects", SwapSideEffects);

//===============================================================================
// User turns 1/4 of max HP into a substitute. (Substitute)
//===============================================================================
export class UserMakeSubstitute extends Move {
  /** Ruby: @subLife (nil until pbMoveFailed? runs). */
  subLife: number | null = null;

  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Substitute] > 0) {
      await this.battle.pbDisplay(_INTL("{1} already has a substitute!", user.pbThis()));
      return true;
    }
    this.subLife = Math.max(Math.floor(user.totalhp / 4), 1);
    if (user.hp <= this.subLife) {
      await this.battle.pbDisplay(_INTL("But it does not have enough HP left to make a substitute!"));
      return true;
    }
    return false;
  }

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    await user.pbReduceHP(this.subLife!, false, false);
    await user.pbItemHPHealCheck();
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Trapping] = 0;
    user.effects[PBEffects.TrappingMove] = null;
    user.effects[PBEffects.Substitute] = this.subLife;
    await this.battle.pbDisplay(_INTL("{1} put in a substitute!", user.pbThis()));
  }
}
registerMoveClass("UserMakeSubstitute", UserMakeSubstitute);

//===============================================================================
// Removes trapping moves, entry hazards and Leech Seed on user/user's side.
// Raises user's Speed by 1 stage (Gen 8+). (Rapid Spin)
//===============================================================================
export class RemoveUserBindingAndEntryHazards extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPEED", 1];
  }

  /** ZUD Mechanics (alias): also clears away hazard applied with G-Max Steelsurge. */
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    const core = async (): Promise<void> => {
      if (user.fainted() || target.damageState.unaffected) return;
      if (user.effects[PBEffects.Trapping] > 0) {
        const trapMove = MoveData.get(user.effects[PBEffects.TrappingMove] as Id).name;
        const trapUser = this.battle.battlers[user.effects[PBEffects.TrappingUser]]!;
        await this.battle.pbDisplay(_INTL("{1} got free of {2}'s {3}!", user.pbThis(), trapUser.pbThis(true), trapMove));
        user.effects[PBEffects.Trapping] = 0;
        user.effects[PBEffects.TrappingMove] = null;
        user.effects[PBEffects.TrappingUser] = -1;
      }
      if (user.effects[PBEffects.LeechSeed] >= 0) {
        user.effects[PBEffects.LeechSeed] = -1;
        await this.battle.pbDisplay(_INTL("{1} shed Leech Seed!", user.pbThis()));
      }
      if (user.pbOwnSide().effects[PBEffects.StealthRock]) {
        user.pbOwnSide().effects[PBEffects.StealthRock] = false;
        await this.battle.pbDisplay(_INTL("{1} blew away stealth rocks!", user.pbThis()));
      }
      if (user.pbOwnSide().effects[PBEffects.Spikes] > 0) {
        user.pbOwnSide().effects[PBEffects.Spikes] = 0;
        await this.battle.pbDisplay(_INTL("{1} blew away spikes!", user.pbThis()));
      }
      if (user.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0) {
        user.pbOwnSide().effects[PBEffects.ToxicSpikes] = 0;
        await this.battle.pbDisplay(_INTL("{1} blew away poison spikes!", user.pbThis()));
      }
      if (user.pbOwnSide().effects[PBEffects.StickyWeb]) {
        user.pbOwnSide().effects[PBEffects.StickyWeb] = false;
        await this.battle.pbDisplay(_INTL("{1} blew away sticky webs!", user.pbThis()));
      }
    };
    await core();
    // ZUD Mechanics
    // NOTE (Ruby parity): the core method's early return (user fainted or
    // target unaffected) doesn't skip this, so Steelsurge is blown away even
    // then (ZUD Mechanics/[008] Overrides/Override_Moves.rb:152-157).
    if (user.pbOwnSide().effects[PBEffects.Steelsurge]) {
      user.pbOwnSide().effects[PBEffects.Steelsurge] = false;
      await this.battle.pbDisplay(_INTL("{1} blew away the pointed steel!", user.pbThis()));
    }
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8) await super.pbAdditionalEffect(user, target);
  }
}
registerMoveClass("RemoveUserBindingAndEntryHazards", RemoveUserBindingAndEntryHazards);

//===============================================================================
// Attacks 2 rounds in the future. (Doom Desire, Future Sight)
//===============================================================================
export class AttackTwoTurnsLater extends Move {
  override targetsPosition(): boolean { return true; }

  /** pbDamagingMove? — Stops damage being dealt in the setting-up turn */
  override pbDamagingMove(): boolean {
    if (!this.battle.futureSight) return false;
    return super.pbDamagingMove();
  }

  override pbAccuracyCheck(user: Battler, target: Battler): boolean {
    if (!this.battle.futureSight) return true;
    return super.pbAccuracyCheck(user, target);
  }

  override async pbDisplayUseMessage(user: Battler): Promise<void> {
    if (!this.battle.futureSight) await super.pbDisplayUseMessage(user);
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!this.battle.futureSight &&
        this.battle.positions[target.index]!.effects[PBEffects.FutureSightCounter] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.battle.futureSight) return; // Attack is hitting
    const effects = this.battle.positions[target.index]!.effects;
    effects[PBEffects.FutureSightCounter] = 3;
    effects[PBEffects.FutureSightMove] = this.id;
    effects[PBEffects.FutureSightUserIndex] = user.index;
    effects[PBEffects.FutureSightUserPartyIndex] = user.pokemonIndex;
    if (this.id === "DOOMDESIRE") {
      await this.battle.pbDisplay(_INTL("{1} chose Doom Desire as its destiny!", user.pbThis()));
    } else {
      await this.battle.pbDisplay(_INTL("{1} foresaw an attack!", user.pbThis()));
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (!this.battle.futureSight) hitNum = 1; // Charging anim
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("AttackTwoTurnsLater", AttackTwoTurnsLater);

//===============================================================================
// User switches places with its ally. (Ally Switch)
//===============================================================================
export class UserSwapsPositionsWithAlly extends Move {
  /** Ruby: @idxAlly (set by pbMoveFailed?). */
  idxAlly = -1;

  /** Generation 9 Pack: Ally Switch doesn't reset ProtectRate. */
  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    const oldVal = user.effects[PBEffects.ProtectRate];
    super.pbChangeUsageCounters(user, specialUsage);
    user.effects[PBEffects.ProtectRate] = oldVal;
  }

  /** Generation 9 Pack (alias): Ally Switch can fail on consecutive use, like Protect. */
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    const core = async (): Promise<boolean> => {
      let numTargets = 0;
      this.idxAlly = -1;
      const idxUserOwner = this.battle.pbGetOwnerIndexFromBattlerIndex(user.index);
      for (const b of user.allAllies()) {
        if (this.battle.pbGetOwnerIndexFromBattlerIndex(b.index) !== idxUserOwner) continue;
        if (!b.near(user)) continue;
        numTargets += 1;
        this.idxAlly = b.index;
      }
      if (numTargets !== 1) {
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
      return false;
    };
    // Generation 9 Pack
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9) {
      if (user.effects[PBEffects.AllySwitch]) {
        user.effects[PBEffects.ProtectRate] = 1;
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
      if (user.effects[PBEffects.ProtectRate] > 1 &&
          this.battle.pbRandom(user.effects[PBEffects.ProtectRate]) !== 0) {
        user.effects[PBEffects.ProtectRate] = 1;
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
    }
    return core();
  }

  /** Generation 9 Pack (alias): sets AllySwitch and triples ProtectRate first. */
  override async pbEffectGeneral(user: Battler): Promise<void> {
    // Generation 9 Pack
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9) {
      user.effects[PBEffects.AllySwitch] = true;
      user.effects[PBEffects.ProtectRate] *= 3;
    }
    const idxA = user.index;
    const idxB = this.idxAlly;
    if (this.battle.pbSwapBattlers(idxA, idxB)) {
      await this.battle.pbDisplay(_INTL("{1} and {2} switched places!",
        this.battle.battlers[idxB]!.pbThis(), this.battle.battlers[idxA]!.pbThis(true)));
      for (const idx of [idxA, idxB]) {
        await this.battle.pbEffectsOnBattlerEnteringPosition(this.battle.battlers[idx]!);
      }
    }
  }
}
registerMoveClass("UserSwapsPositionsWithAlly", UserSwapsPositionsWithAlly);

//===============================================================================
// If a Pokémon makes contact with the user before it uses this move, the
// attacker is burned. (Beak Blast)
//===============================================================================
export class BurnAttackerBeforeUserActs extends Move {
  override async pbDisplayChargeMessage(user: Battler): Promise<void> {
    user.effects[PBEffects.BeakBlast] = true;
    await this.battle.pbCommonAnimation("BeakBlast", user);
    await this.battle.pbDisplay(_INTL("{1} started heating up its beak!", user.pbThis()));
  }
}
registerMoveClass("BurnAttackerBeforeUserActs", BurnAttackerBeforeUserActs);
