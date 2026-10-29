// Port of Essentials Deluxe's [002] Battle Deluxe/Midbattle_Effects.rb:1-268:
// the effects a midbattle script may set (:effects, :team, :field) and the
// Battle::Battler methods that set them. dxConvertToPBEffect (:274) is in
// Battle_EndOfRoundPhase.ts, next to the triggers that use it.
//
// Later plugins add to $DELUXE_BATTLE_EFFECTS:
// - ZUD Mechanics ([003] Battle/Battle_PBEffects.rb:51-52): Steelsurge and the
//   G-Max lingering effects.
// - NOTE (Ruby parity): the Generation 9 Pack's additions ([001] Battle/
//   [000] PBEffects.rb:28-31: BoosterEnergy, DoubleShock, SaltCure, CudChew,
//   GlaiveRush, Splinters, SupremeOverlord) never apply: that plugin loads
//   before Essentials Deluxe, so PluginManager.installed?("Essentials Deluxe")
//   is still false when its file runs (and Deluxe's file would then replace
//   the hash anyway).

import { _INTL } from "../../data/gameData/gameData";
import { Type } from "../../data/gameData/type";
import { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";

/** $DELUXE_BATTLE_EFFECTS: eligible effects that may be set with deluxe battle settings. */
export const DELUXE_BATTLE_EFFECTS: Record<
  "battler_default_false" | "battler_default_zero" | "team_default_false" | "team_default_zero" |
  "field_default_false" | "field_default_zero", number[]> = {
  battler_default_false: [
    PBEffects.AquaRing,
    PBEffects.Curse,
    PBEffects.GastroAcid,
    PBEffects.Ingrain,
    PBEffects.PowerTrick,
    PBEffects.BurnUp,
    PBEffects.DefenseCurl,
    PBEffects.Electrify,
    PBEffects.Endure,
    PBEffects.Foresight,
    PBEffects.Grudge,
    PBEffects.HelpingHand,
    PBEffects.Imprison,
    PBEffects.MagicCoat,
    PBEffects.Minimize,
    PBEffects.MiracleEye,
    PBEffects.MudSport,
    // PBEffects::Nightmare - Settable, but isn't listed here.
    PBEffects.NoRetreat,
    PBEffects.Powder,
    PBEffects.Rage,
    PBEffects.Roost,
    PBEffects.SmackDown,
    PBEffects.TarShot,
    PBEffects.Torment,
    PBEffects.WaterSport,
  ],
  battler_default_zero: [
    PBEffects.Charge,
    // PBEffects::CriticalBoost - Settable, but isn't listed here.
    PBEffects.Embargo,
    PBEffects.FocusEnergy,
    PBEffects.HealBlock,
    PBEffects.LaserFocus,
    // PBEffects::MagnetRise - Settable, but isn't listed here.
    PBEffects.Taunt,
    // PBEffects::Telekinesis - Settable, but isn't listed here.
    PBEffects.ThroatChop,
    // PBEffects::Type3 - Settable, but isn't listed here.
    PBEffects.WeightChange,
    // PBEffects::Yawn - Settable, but isn't listed here.
  ],
  team_default_false: [
    PBEffects.CraftyShield,
    PBEffects.StealthRock,
    PBEffects.StickyWeb,
    PBEffects.Steelsurge, // ZUD Mechanics
  ],
  team_default_zero: [
    // PBEffects::Aurora Veil - Settable, but isn't listed here.
    // PBEffects::LightScreen - Settable, but isn't listed here.
    PBEffects.LuckyChant,
    PBEffects.Mist,
    PBEffects.Rainbow,
    // PBEffects::Reflect - Settable, but isn't listed here.
    PBEffects.Safeguard,
    PBEffects.SeaOfFire,
    // PBEffects::Spikes - Settable, but isn't listed here.
    PBEffects.Swamp,
    PBEffects.Tailwind,
    // PBEffects::ToxicSpikes - Settable, but isn't listed here.
    PBEffects.Cannonade, PBEffects.VineLash, PBEffects.Volcalith, PBEffects.Wildfire, // ZUD Mechanics
  ],
  field_default_false: [
    PBEffects.HappyHour,
    PBEffects.IonDeluge,
  ],
  field_default_zero: [
    PBEffects.FairyLock,
    PBEffects.Gravity,
    PBEffects.MagicRoom,
    PBEffects.MudSportField,
    PBEffects.TrickRoom,
    PBEffects.WaterSportField,
    PBEffects.WonderRoom,
  ],
};

/** _INTL(msg, ...) when msg isn't nil. */
const fmt = (msg: string, ...args: unknown[]): string => _INTL(msg, ...args);
/** Ruby truthiness. */
const truthy = (v: unknown): boolean => v != null && v !== false;
/** Effect values in Ruby are compared with > and == (true/false/Integer/Symbol). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Eff = any;

const methods = {
  /** apply_battler_effects: sets a battler effect to a specific setting, with a custom message. */
  async applyBattlerEffects(this: Battler, effect: number, setting: Eff, msg: string | null = null, lowercase = false): Promise<void> {
    const e: Eff[] = this.effects;
    switch (effect) {
      case PBEffects.Type3:
        if (Type.exists(String(setting)) && !this.pbHasType(String(setting))) {
          e[effect] = String(setting);
          if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
        }
        break;
      case PBEffects.Nightmare:
        if (!truthy(e[effect]) && this.asleep() && truthy(setting)) {
          e[effect] = setting;
          if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
        } else {
          e[effect] = false;
        }
        break;
      case PBEffects.Yawn:
        if (this.status === "NONE") {
          if ((e[effect] > 0 && setting === 0) || (e[effect] === 0 && setting > 0)) {
            e[effect] = setting;
            if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
          }
        } else {
          e[effect] = 0;
        }
        break;
      case PBEffects.MagnetRise: case PBEffects.Telekinesis:
        if (this.battle.field.effects[PBEffects.Gravity] === 0) {
          if ((e[effect] > 0 && setting === 0) || (e[effect] === 0 && setting > 0)) {
            e[effect] = setting;
            if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
          }
        } else {
          e[effect] = 0;
        }
        break;
      case PBEffects.CriticalBoost:
        if (e[effect] > 0 && setting === 0) {
          e[effect] = setting;
          if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
        } else {
          e[effect] += setting;
          if (e[effect] < 0) e[effect] = 0;
          if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
        }
        break;
      default:
        // (Focus Meter System isn't installed.)
        if (DELUXE_BATTLE_EFFECTS.battler_default_false.includes(effect)) {
          if (e[effect] !== setting) {
            e[effect] = setting;
            if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
          }
        } else if (DELUXE_BATTLE_EFFECTS.battler_default_zero.includes(effect)) {
          if ((e[effect] > 0 && setting === 0) || (e[effect] === 0 && setting > 0)) {
            e[effect] = setting;
            if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
          }
        }
    }
    await this.pbAbilityStatusCureCheck();
    await this.pbItemStatusCureCheck();
  },

  /**
   * apply_team_effects: sets a team effect to a specific setting, with a
   * custom message. Returns the effect whose message must not be repeated for
   * the other team (or null).
   */
  async applyTeamEffects(this: Battler, effect: number, setting: Eff, idxSide: number, skipMessage: number[] = [],
    msg: string | null = null, lowercase = false, user: unknown = false): Promise<number | null> {
    let repeatMessage: number | null = null;
    // NOTE (Ruby parity): idxSide is only ever 0 or 1 (Midbattle_Main.rb:1225-1228).
    const side = idxSide === 0 ? this.pbOwnSide() : this.pbOpposingSide();
    let team = idxSide === 0 ? this.pbTeam(lowercase) : this.pbOpposingTeam(lowercase);
    if (truthy(user)) team = this.pbThis(lowercase);
    const e: Eff[] = side.effects;
    switch (effect) {
      case PBEffects.Spikes: case PBEffects.ToxicSpikes: {
        const max = effect === PBEffects.Spikes ? 3 : 2;
        if (e[effect] > 0 && setting === 0) {
          e[effect] = setting;
          if (msg && !skipMessage.includes(effect)) await this.battle.pbDisplay(fmt(msg, team));
          repeatMessage = effect;
        } else if (e[effect] < max && setting > 0) {
          e[effect] += setting;
          if (e[effect] > max) e[effect] = max;
          if (e[effect] < 0) e[effect] = 0;
          if (msg) await this.battle.pbDisplay(fmt(msg, team));
        }
        break;
      }
      case PBEffects.AuroraVeil: case PBEffects.LightScreen: case PBEffects.Reflect:
        if (e[effect] > 0 && setting === 0) {
          e[effect] = setting;
          if (msg) await this.battle.pbDisplay(fmt(msg, team));
        } else if (e[effect] === 0 && setting > 0) {
          e[effect] = setting;
          if (this.hasActiveItem("LIGHTCLAY") && setting > 0) e[effect] += 3;
          if (e[effect] < 0) e[effect] = 0;
          if (msg) await this.battle.pbDisplay(fmt(msg, team));
        }
        break;
      default:
        if (DELUXE_BATTLE_EFFECTS.team_default_false.includes(effect)) {
          if (e[effect] !== setting) {
            e[effect] = setting;
            if (msg && !skipMessage.includes(effect)) await this.battle.pbDisplay(fmt(msg, team));
            // (PluginManager.installed?("ZUD Mechanics") && effect == PBEffects::Steelsurge)
            if (([PBEffects.StealthRock, PBEffects.StickyWeb, PBEffects.Steelsurge] as number[]).includes(effect)) {
              if (!truthy(setting)) repeatMessage = effect;
            }
          }
        } else if (DELUXE_BATTLE_EFFECTS.team_default_zero.includes(effect)) {
          if ((e[effect] > 0 && setting === 0) || (e[effect] === 0 && setting > 0)) {
            e[effect] = setting;
            if (msg) await this.battle.pbDisplay(fmt(msg, team));
          }
        }
    }
    return repeatMessage;
  },

  /** apply_field_effects: sets a field effect to a specific setting, with a custom message. */
  async applyFieldEffects(this: Battler, effect: number, setting: Eff, msg: string | null = null, lowercase = false): Promise<void> {
    const fe: Eff[] = this.battle.field.effects;
    if (DELUXE_BATTLE_EFFECTS.field_default_false.includes(effect)) {
      if (fe[effect] === setting) return;
      fe[effect] = setting;
      if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
    } else if (DELUXE_BATTLE_EFFECTS.field_default_zero.includes(effect)) {
      if (fe[effect] > 0 && setting > 0) return;
      fe[effect] = setting;
      if (msg) await this.battle.pbDisplay(fmt(msg, this.pbThis(lowercase)));
      switch (effect) {
        case PBEffects.TrickRoom:
          if (fe[PBEffects.TrickRoom] > 0) {
            for (const b of this.battle.allBattlers()) {
              if (!b.hasActiveItem("ROOMSERVICE")) continue;
              if (!await b.pbCanLowerStatStage("SPEED")) continue;
              await this.battle.pbCommonAnimation("UseItem", b);
              await b.pbLowerStatStage("SPEED", 1, null);
              await b.pbConsumeItem();
            }
          }
          break;
        case PBEffects.Gravity:
          if (fe[PBEffects.Gravity] > 0) {
            for (const b of this.battle.allBattlers()) {
              let showMessage = false;
              if (b.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
                "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
                "TwoTurnAttackInvulnerableInSkyTargetCannotAct")) {
                b.effects[PBEffects.TwoTurnAttack] = null;
                if (!b.movedThisRound()) this.battle.pbClearChoice(b.index);
                showMessage = true;
              }
              if (b.effects[PBEffects.MagnetRise] > 0 ||
                  b.effects[PBEffects.Telekinesis] > 0 ||
                  b.effects[PBEffects.SkyDrop] >= 0) {
                b.effects[PBEffects.MagnetRise] = 0;
                b.effects[PBEffects.Telekinesis] = 0;
                b.effects[PBEffects.SkyDrop] = -1;
                showMessage = true;
              }
              if (showMessage) await this.battle.pbDisplay(_INTL("{1} couldn't stay airborne because of gravity!", b.pbThis()));
            }
          }
          break;
      }
    }
  },
};

type Methods = typeof methods;
declare module "../battler/Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
