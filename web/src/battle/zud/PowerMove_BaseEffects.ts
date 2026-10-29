// Port of Plugins/ZUD Mechanics/[006] Battle_Move/PowerMove_BaseEffects.rb:
// Battle::PowerMove::GeneralEffect (the class most Power Move effects are set
// up with: @stat_changes, @statuses, @battler_effects, @team_effects,
// @weather, @terrain, @field), Battle::PowerMove::None and
// Battle::PowerMove::Unimplemented.
//
// Randomness: Ruby picks a random status with Array#shuffle and a random
// weather/terrain with Array#sample (Kernel random); the port routes both
// through battle.pbRandom (rubyShuffle/rubySample below, Ruby 2.6's
// algorithms), as it does with Kernel#rand in move code.

import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { _INTL, type Id } from "../../data/gameData/gameData";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { DELUXE_BATTLE_EFFECTS } from "../deluxe/Midbattle_Effects"; // also adds Battler#applyBattlerEffects & co.
import { PBEffects } from "../other/PBEffects";
import { PowerMove, registerPowerMoveClass } from "./Battle_PowerMove";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";

/** A PBEffect setting (true/false, a number, a type ID). */
export type EffectSetting = boolean | number | Id;

/** Who an effect applies to: the keys of @stat_changes, @statuses and @battler_effects. */
export type Recipients = "user" | "target" | "allies" | "opponents";
/** The keys of @team_effects (Trinity Pledge's misspelt :opposing included). */
export type Sides = "allies" | "opponents" | "opposing";
/** [effect, setting, message, chance] */
export type BattlerEffect = [number, EffectSetting, string?, number?];
/** [effect, setting, message, user_msg] */
export type TeamEffect = [number, EffectSetting, string?, boolean?];
/** [effect, setting, message] */
export type FieldEffect = [number, EffectSetting, string?];

/** Array#shuffle (Ruby 2.6 rb_ary_shuffle_bang) with battle.pbRandom as its random source. */
export function rubyShuffle<T>(battle: Battle, arr: readonly T[]): T[] {
  const ret = [...arr];
  let i = ret.length;
  while (i) {
    const j = battle.pbRandom(i--);
    const tmp = ret[i]!;
    ret[i] = ret[j]!;
    ret[j] = tmp;
  }
  return ret;
}

/** Array#sample with battle.pbRandom as its random source (nil for an empty array). */
export function rubySample<T>(battle: Battle, arr: readonly T[]): T | null {
  if (arr.length === 0) return null;
  return arr[battle.pbRandom(arr.length)]!;
}

/** Ruby's `msg.first == "{"`: messages starting with "{1}" keep pbThis capitalised. */
const lowercaseFor = (msg: string | null | undefined): boolean => !(msg && msg[0] === "{");

/** The battlers a recipients key designates (battlers.uniq!; battlers.compact!). */
function recipientBattlers(recipients: string, user: Battler, target: Battler | null): Battler[] {
  const battlers: (Battler | null)[] = [];
  switch (recipients) {
    case "user": battlers.push(user); break;
    case "target": battlers.push(target); break;
    case "allies": battlers.push(user); for (const b of user.allAllies()) battlers.push(b); break;
    case "opponents": for (const b of user.allOpposing()) battlers.push(b); break;
  }
  return [...new Set(battlers)].filter((b): b is Battler => b != null);
}

//===============================================================================
// General Power Move class used to handle most effects.
//===============================================================================
export class GeneralEffect extends PowerMove {
  statChanges: Partial<Record<Recipients, (Id | number)[]>> = {};
  statuses: Partial<Record<Recipients, Id[]>> = {};
  battlerEffects: Partial<Record<Recipients, BattlerEffect[]>> = {};
  teamEffects: Partial<Record<Sides, TeamEffect[]>> = {};
  weather: Id | null = null;
  terrain: Id | null = null;
  field: FieldEffect[] = [];

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
  }

  //-----------------------------------------------------------------------------
  // Target types that target other Pokemon on the field. Used for determining
  // how this move's effect should be processed.
  //-----------------------------------------------------------------------------
  static readonly SELECTABLE_TARGET_TYPES = [
    "NearAlly",
    "UserOrNearAlly",
    "AllAllies",
    "UserAndAllies",
    "NearFoe",
    "RandomNearFoe",
    "AllNearFoes",
    "Foe",
    "AllFoes",
    "NearOther",
    "AllNearOthers",
    "Other",
  ];

  private selectableTarget(): boolean {
    return GeneralEffect.SELECTABLE_TARGET_TYPES.includes(this.target);
  }

  //-----------------------------------------------------------------------------
  // Used to determine if this move should fail if the move is one that doesn't
  // target, or only targets the user. Returns true if this move is a status move
  // and cannot apply any of its effects.
  //-----------------------------------------------------------------------------
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (this.selectableTarget()) return false;
    const check1 = this.pbFailureCheckGeneral(user);
    const check2 = await this.pbFailureCheckTarget(user, null, false);
    if (check1 && check2) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  //-----------------------------------------------------------------------------
  // Used when this Power Move is a status move that doesn't target, or only
  // targets the user.
  //-----------------------------------------------------------------------------
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (this.damagingMove()) return;
    if (this.selectableTarget()) return;
    await this.pbPowerMoveEffects(user);
  }

  //-----------------------------------------------------------------------------
  // Used to determine if this move should fail on the selected target. Returns
  // true if this move is a status move and cannot apply any of its effects.
  //-----------------------------------------------------------------------------
  override async pbFailsAgainstTarget(user: Battler, target: Battler, _showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (!this.selectableTarget()) return false;
    return this.pbFailureCheckTarget(user, target);
  }

  //-----------------------------------------------------------------------------
  // Used when this Power Move is a status move that can target.
  //-----------------------------------------------------------------------------
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    if (!this.selectableTarget()) return;
    await this.pbPowerMoveEffects(user, target);
  }

  //-----------------------------------------------------------------------------
  // Used when this Power Move is a damaging move with no added effect chance.
  // The effect of this move triggers only once, after all hits of the move.
  // Certain failure messages for effects won't bother to play for Max Moves.
  //-----------------------------------------------------------------------------
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (!this.damagingMove() || this.addlEffect > 0) return;
    if (target.damageState.unaffected) return;
    if (this.battle.pbAllFainted(target.idxOwnSide()) || this.battle.decision > 0) return;
    const showMsg = !this.maxMove();
    await this.pbPowerMoveEffects(user, target, showMsg);
  }

  //-----------------------------------------------------------------------------
  // Used when this Power Move is a damaging move, but has an added effect chance.
  // This will work with Sheer Force/Serene Grace, so this should only be used for
  // Z-Moves, since Max Moves don't count as having added effects.
  //-----------------------------------------------------------------------------
  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (this.addlEffect === 0) return;
    if (this.battle.pbAllFainted(target.idxOwnSide())) return;
    await this.pbPowerMoveEffects(user, target, false);
  }

  //-----------------------------------------------------------------------------
  // Used to determine move failure specifically for status moves that target.
  //-----------------------------------------------------------------------------
  async pbFailureCheckTarget(user: Battler, target: Battler | null, showMsg = true): Promise<boolean> {
    let tries = 0;
    let fails = 0;
    //---------------------------------------------------------------------------
    // Stat Changes
    //---------------------------------------------------------------------------
    for (const [recipients, stats] of Object.entries(this.statChanges)) {
      const battlers = recipientBattlers(recipients, user, target);
      const pairs = Math.floor(stats!.length / 2);
      const showEachMsg = showMsg && pairs < 3;
      for (const b of battlers) {
        if (!b || b.fainted()) continue;
        let bTries = 0;
        let bFails = 0;
        for (let i = 0; i < pairs; i++) {
          const stat = stats![i * 2] as Id;
          const stage = stats![i * 2 + 1] as number;
          tries += 1;
          bTries += 1;
          if (stage > 0) {
            if (!(await b.pbCanRaiseStatStage(stat, b, this, showEachMsg))) {
              fails += 1;
              bFails += 1;
            }
          } else {
            if (!(await b.pbCanLowerStatStage(stat, b, this, showEachMsg))) {
              fails += 1;
              bFails += 1;
            }
          }
        }
        if (bFails === bTries && showMsg && pairs > 3) {
          await this.battle.pbDisplay(_INTL("{1}'s stats can't be changed any further!", b.pbThis()));
        }
      }
    }
    //---------------------------------------------------------------------------
    // Status Conditions
    //---------------------------------------------------------------------------
    for (const [recipients, statuses] of Object.entries(this.statuses)) {
      const battlers = recipientBattlers(recipients, user, target);
      for (const b of battlers) {
        if (!b || b.fainted()) continue;
        for (const status of rubyShuffle(this.battle, statuses!)) {
          tries += 1;
          switch (status) {
            case "NONE": if (b.status === "NONE") fails += 1; break;
            case "TOXIC": if (!(await b.pbCanPoisonAsync(user, showMsg))) fails += 1; break;
            case "ATTRACT": if (!(await b.pbCanAttractAsync(user, showMsg))) fails += 1; break;
            case "CONFUSION": if (!(await b.pbCanConfuseAsync(user, showMsg))) fails += 1; break;
            default: if (!(await b.pbCanInflictStatusAsync(status, b, showMsg, this))) fails += 1;
          }
          break;
        }
      }
    }
    //---------------------------------------------------------------------------
    // Battler Effects
    //---------------------------------------------------------------------------
    for (const [recipients, effects] of Object.entries(this.battlerEffects)) {
      const battlers = recipientBattlers(recipients, user, target);
      for (const b of battlers) {
        if (!b || b.fainted()) continue;
        for (const eff of effects!) {
          const [effect, setting] = eff;
          tries += 1;
          const cur = (b.effects as unknown[])[effect];
          if (DELUXE_BATTLE_EFFECTS.battler_default_false.includes(effect)) {
            if (cur === setting) {
              fails += 1;
              if (showMsg) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", b.pbThis(true)));
            }
          } else if (DELUXE_BATTLE_EFFECTS.battler_default_zero.includes(effect)) {
            if (((cur as number) > 0 && (setting as number) > 0) || (cur === 0 && setting === 0)) {
              fails += 1;
              if (showMsg) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", b.pbThis(true)));
            }
          }
        }
      }
    }
    return fails >= tries;
  }

  //-----------------------------------------------------------------------------
  // Used to determine move failure on status moves that don't target.
  //-----------------------------------------------------------------------------
  pbFailureCheckGeneral(user: Battler): boolean {
    let tries = 0;
    let fails = 0;
    //---------------------------------------------------------------------------
    // Team Effects
    //---------------------------------------------------------------------------
    for (const [sides, effects] of Object.entries(this.teamEffects)) {
      let side = null;
      switch (sides) {
        case "allies": side = user.pbOwnSide(); break;
        case "opponents": side = user.pbOpposingSide(); break;
      }
      for (const eff of effects!) {
        const [effect, setting] = eff;
        tries += 1;
        // NOTE (Ruby parity): an unknown side key leaves side nil (NoMethodError below in Ruby).
        if (!side) throw new TypeError("undefined method `effects' for nil:NilClass");
        const cur = (side.effects as unknown[])[effect];
        switch (effect) {
          case PBEffects.Spikes:
          case PBEffects.ToxicSpikes: {
            const max = (effect === PBEffects.Spikes) ? 3 : 2;
            if (cur === max && (setting as number) > 0) fails += 1;
            if (cur === 0 && setting === 0) fails += 1;
            break;
          }
          case PBEffects.Reflect:
          case PBEffects.LightScreen:
          case PBEffects.AuroraVeil:
            if ((cur as number) > 0 && (setting as number) > 0) fails += 1;
            if (cur === 0 && setting === 0) fails += 1;
            break;
          default:
            if (DELUXE_BATTLE_EFFECTS.team_default_false.includes(effect)) {
              if (cur === setting) fails += 1;
            } else if (DELUXE_BATTLE_EFFECTS.team_default_zero.includes(effect)) {
              if ((cur as number) > 0 && (setting as number) > 0) fails += 1;
              if (cur === 0 && setting === 0) fails += 1;
            }
        }
      }
    }
    //---------------------------------------------------------------------------
    // Field Effects
    //---------------------------------------------------------------------------
    if (this.weather) {
      tries += 1;
      if (["HarshSun", "HeavyRain", "StrongWinds", this.weather].includes(this.battle.field.weather)) fails += 1;
    }
    if (this.terrain) {
      tries += 1;
      if (this.battle.field.terrain === this.terrain) fails += 1;
    }
    for (const effects of this.field) {
      const [effect, setting] = effects;
      tries += 1;
      // NOTE (Ruby parity): Ruby reads `field.effects` here (PowerMove_BaseEffects.rb:281-285),
      //       an undefined method on Battle::Move (NameError). No status Power Move
      //       that doesn't target sets @field, so it's never reached.
      const known = DELUXE_BATTLE_EFFECTS.field_default_false.includes(effect) ||
        DELUXE_BATTLE_EFFECTS.field_default_zero.includes(effect);
      if (known) throw new ReferenceError("undefined local variable or method `field'");
      void setting;
    }
    return fails >= tries;
  }

  //-----------------------------------------------------------------------------
  // Main method used to process all move effects.
  //-----------------------------------------------------------------------------
  async pbPowerMoveEffects(user: Battler, target: Battler | null = null, showMsg = true): Promise<void> {
    //---------------------------------------------------------------------------
    // Stat Changes
    //---------------------------------------------------------------------------
    for (const [recipients, stats] of Object.entries(this.statChanges)) {
      const battlers = recipientBattlers(recipients, user, target);
      for (const b of battlers) {
        if (!b || b.fainted()) continue;
        let showAnim = true;
        let lastChange = 0;
        for (let i = 0; i < Math.floor(stats!.length / 2); i++) {
          const stat = stats![i * 2] as Id;
          const stage = stats![i * 2 + 1] as number;
          if (stage === 0) continue;
          if (stage > 0) {
            if (!(await b.pbCanRaiseStatStage(stat, b, this, showMsg))) continue;
            if (!showAnim && lastChange === -1) showAnim = true;
            if (await b.pbRaiseStatStage(stat, stage, b, showAnim)) {
              showAnim = false;
              lastChange = 1;
            }
          } else {
            if (!(await b.pbCanLowerStatStage(stat, b, this, showMsg))) continue;
            if (!showAnim && lastChange === 1) showAnim = true;
            if (await b.pbLowerStatStage(stat, Math.abs(stage), b, showAnim)) {
              showAnim = false;
              lastChange = -1;
            }
          }
        }
      }
    }
    //---------------------------------------------------------------------------
    // Status Conditions
    //---------------------------------------------------------------------------
    for (const [recipients, statuses] of Object.entries(this.statuses)) {
      const battlers = recipientBattlers(recipients, user, target);
      for (const b of battlers) {
        if (!b || b.fainted()) continue;
        for (const status of rubyShuffle(this.battle, statuses!)) {
          let tryNext = false;
          switch (status) {
            case "NONE":
              if (b.status !== "NONE") await b.pbCureStatus();
              break;
            case "TOXIC":
              if (await b.pbCanPoisonAsync(user, showMsg)) {
                // NOTE (Ruby parity): Ruby passes showMsg as pbPoison's msg
                //       (PowerMove_BaseEffects.rb:370); true raises NoMethodError on
                //       `msg.empty?`. Only G-Max Kitchen Sink (not in PBS) uses :TOXIC.
                if (showMsg) throw new TypeError("undefined method `empty?' for true:TrueClass");
                await b.pbPoison(user, null, true);
              }
              break;
            case "ATTRACT":
              if (await b.pbCanAttractAsync(user, showMsg)) await b.pbAttract(user);
              break;
            case "CONFUSION":
              if (await b.pbCanConfuseAsync(user, showMsg)) await b.pbConfuse();
              break;
            default:
              if (b.pbHasAnyStatus() || !(await b.pbCanInflictStatusAsync(status, b, showMsg))) {
                tryNext = true; // Ruby's `next`: tries the next status
                break;
              }
              // NOTE (Ruby parity): Ruby passes showMsg as pbInflictStatus's msg
              //       (PowerMove_BaseEffects.rb:378): false shows the usual message,
              //       true raises NoMethodError on `msg.empty?`. Every Power Move in
              //       PBS that inflicts a status does it with showMsg false.
              if (showMsg) throw new TypeError("undefined method `empty?' for true:TrueClass");
              await b.pbInflictStatus(status, 0, null, user);
              if (status === "SLEEP") b.statusCount = b.pbSleepDuration();
          }
          if (tryNext) continue;
          break;
        }
        await b.pbAbilityStatusCureCheck();
        await b.pbItemStatusCureCheck();
      }
    }
    //---------------------------------------------------------------------------
    // Battler Effects
    //---------------------------------------------------------------------------
    for (const [recipients, effects] of Object.entries(this.battlerEffects)) {
      const battlers = recipientBattlers(recipients, user, target);
      for (const b of battlers) {
        if (!b || b.fainted()) continue;
        for (const eff of effects!) {
          const [effect, setting, msg] = eff;
          const chance = eff[3] ?? 100;
          const lowercase = lowercaseFor(msg);
          if (chance >= this.battle.pbRandom(100)) {
            await b.applyBattlerEffects(effect, setting, msg ?? null, lowercase);
          }
        }
      }
    }
    //---------------------------------------------------------------------------
    // Team Effects
    //---------------------------------------------------------------------------
    if (Object.keys(this.teamEffects).length > 0) {
      const skipMessage: number[] = [];
      for (const [sides, effects] of Object.entries(this.teamEffects)) {
        for (const eff of effects!) {
          const [effect, setting, msg, userMsg] = eff;
          const lowercase = lowercaseFor(msg);
          let idxSide: number | null = null;
          switch (sides) {
            case "allies": idxSide = 0; break;
            case "opponents": idxSide = 1; break;
          }
          // NOTE (Ruby parity): an unknown side key (Trinity Pledge's :opposing) leaves
          //       idxSide nil, and apply_team_effects then raises NoMethodError on
          //       side.effects (Midbattle_Effects.rb:174-185).
          if (idxSide == null) throw new TypeError("undefined method `effects' for nil:NilClass");
          const ret = await user.applyTeamEffects(effect, setting, idxSide, skipMessage, msg ?? null, lowercase, userMsg ?? false);
          if (ret != null) skipMessage.push(ret);
        }
      }
    }
    //---------------------------------------------------------------------------
    // Field Effects
    //---------------------------------------------------------------------------
    if (this.weather) {
      if (this.weather === "Random") {
        const weather: Id[] = [];
        for (const key of BattleWeather.DATA.keys()) {
          if (["None", "HarshSun", "HeavyRain", "StrongWinds", this.battle.field.weather].includes(key)) continue;
          weather.push(key);
        }
        this.weather = rubySample(this.battle, weather);
      }
      if (!["HarshSun", "HeavyRain", "StrongWinds", this.weather].includes(this.battle.field.weather)) {
        if (this.weather === "None") {
          switch (this.battle.field.weather) {
            case "Sun": await this.battle.pbDisplay(_INTL("The sunlight faded.")); break;
            case "Rain": await this.battle.pbDisplay(_INTL("The rain stopped.")); break;
            case "Sandstorm": await this.battle.pbDisplay(_INTL("The sandstorm subsided.")); break;
            case "Hail": await this.battle.pbDisplay(_INTL("The hail stopped.")); break;
            case "ShadowSky": await this.battle.pbDisplay(_INTL("The shadow sky faded.")); break;
            default: await this.battle.pbDisplay(_INTL("The weather cleared."));
          }
        }
        await this.battle.pbStartWeather(user, this.weather!, true);
      }
    }
    if (this.terrain) {
      if (this.terrain === "Random") {
        const terrain: Id[] = [];
        for (const key of BattleTerrain.DATA.keys()) {
          if (["None", this.battle.field.terrain].includes(key)) continue;
          terrain.push(key);
        }
        this.terrain = rubySample(this.battle, terrain);
      }
      if (this.battle.field.terrain !== this.terrain) {
        if (this.terrain === "None") {
          switch (this.battle.field.terrain) {
            case "Electric": await this.battle.pbDisplay(_INTL("The electricity disappeared from the battlefield.")); break;
            case "Grassy": await this.battle.pbDisplay(_INTL("The grass disappeared from the battlefield.")); break;
            case "Misty": await this.battle.pbDisplay(_INTL("The mist disappeared from the battlefield.")); break;
            case "Psychic": await this.battle.pbDisplay(_INTL("The weirdness disappeared from the battlefield.")); break;
            default: await this.battle.pbDisplay(_INTL("The battlefield normalized."));
          }
        }
        await this.battle.pbStartTerrain(user, this.terrain!);
      }
    }
    for (const effects of this.field) {
      const [effect, setting, msg] = effects;
      const lowercase = lowercaseFor(msg);
      await user.applyFieldEffects(effect, setting, msg ?? null, lowercase);
    }
  }
}
registerPowerMoveClass("GeneralEffect", GeneralEffect);

//===============================================================================
// For moves with no effects.
//===============================================================================
export class None extends PowerMove {}
registerPowerMoveClass("None", None);

export class Unimplemented extends PowerMove {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.statusMove()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerPowerMoveClass("Unimplemented", Unimplemented);
