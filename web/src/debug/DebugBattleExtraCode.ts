// Port of 020_Debug/003_Debug menus/006_Debug_BattleExtraCode.rb:
// Battle::DebugVariables (the battler/side/field/position effects the battle
// Debug menu can edit), SpriteWindow_DebugBattleFieldEffects (their list) and
// Battle::DebugSetEffects (the editor), with the plugin additions folded in, in
// plugin load order:
// - Generation 9 Pack ([001] Battle/[000] PBEffects.rb:36): its battler
//   effects; ([000] General/[002] Debug.rb:165) DebugSetEffects
//   #update_input_for_stat/#update_input_for_type and the #update override
//   that handles the :stat and :type kinds.
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb:16): CriticalBoost.
// - ZUD Mechanics ([003] Battle/Battle_PBEffects.rb:37): Max Guard, Z-Healing
//   and the G-Max side effects.
// The tables are Maps because Ruby's hashes keep insertion order (a plain
// object would sort the integer keys); the editor lists them in that order.

import type { Battle } from "../battle/battle/Battle";
import { type EffectsArray, PBEffects } from "../battle/other/PBEffects";
import { Settings } from "../data/gameData";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../game/GameSystem";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color, type Rect } from "../rgss/types";
import { pbDrawShadowText } from "../ui/drawText";
import { _INTL, pbSetNarrowFont } from "../ui/messageConfig";
import { ChooseNumberParams, pbMessage, pbMessageChooseNumber } from "../ui/messages";
import { Window_DrawableCommand } from "../ui/windows/SpriteWindowText";
import { pbChooseItemList, pbChooseMoveList, pbChooseStatList, pbChooseTypeList } from "./EditorUtilities";

/**
 * One editable effect: its description, its default value (false = boolean,
 * 0/1/-2 = integer, -1 = battler index, nil = an ID of `type`), and an integer's
 * range (min defaults to the default, max to 99).
 */
export interface DebugVariableData {
  name: string;
  default: boolean | number | null;
  min?: number;
  max?: number;
  type?: "move" | "item" | "stat" | "type";
}

/** Effect index => its data (insertion-ordered, like a Ruby Hash). */
export type DebugVariablesTable = Map<number, DebugVariableData>;

//===============================================================================
// Effect values that can be edited via the battle debug menu.
//===============================================================================
const BATTLER_EFFECTS: DebugVariablesTable = new Map<number, DebugVariableData>([
  [PBEffects.AquaRing, { name: "Aqua Ring applies", default: false }],
  [PBEffects.Attract, { name: "Battler that self is attracted to", default: -1 }], // Battler index
  [PBEffects.BanefulBunker, { name: "Baneful Bunker applies this round", default: false }],
  // PBEffects.BeakBlast - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.Bide, { name: "Bide number of rounds remaining", default: 0 }],
  [PBEffects.BideDamage, { name: "Bide damage accumulated", default: 0, max: 999 }],
  [PBEffects.BideTarget, { name: "Bide last battler to hurt self", default: -1 }], // Battler index
  [PBEffects.BurnUp, { name: "Burn Up has removed self's Fire type", default: false }],
  [PBEffects.Charge, { name: "Charge number of rounds remaining", default: 0 }],
  [PBEffects.ChoiceBand, { name: "Move locked into by Choice items", default: null, type: "move" }],
  [PBEffects.Confusion, { name: "Confusion number of rounds remaining", default: 0 }],
  // PBEffects.Counter - not suitable for setting via debug
  // PBEffects.CounterTarget - not suitable for setting via debug
  [PBEffects.Curse, { name: "Curse damaging applies", default: false }],
  // PBEffects.Dancer - only used while Dancer is running, not suitable for setting via debug
  [PBEffects.DefenseCurl, { name: "Used Defense Curl", default: false }],
  // PBEffects.DestinyBond - not suitable for setting via debug
  // PBEffects.DestinyBondPrevious - not suitable for setting via debug
  // PBEffects.DestinyBondTarget - not suitable for setting via debug
  [PBEffects.Disable, { name: "Disable number of rounds remaining", default: 0 }],
  [PBEffects.DisableMove, { name: "Disabled move", default: null, type: "move" }],
  [PBEffects.Electrify, { name: "Electrify making moves Electric", default: false }],
  [PBEffects.Embargo, { name: "Embargo number of rounds remaining", default: 0 }],
  [PBEffects.Encore, { name: "Encore number of rounds remaining", default: 0 }],
  [PBEffects.EncoreMove, { name: "Encored move", default: null, type: "move" }],
  [PBEffects.Endure, { name: "Endures all lethal damage this round", default: false }],
  // PBEffects.FirstPledge - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.FlashFire, { name: "Flash Fire powering up Fire moves", default: false }],
  [PBEffects.Flinch, { name: "Will flinch this round", default: false }],
  [PBEffects.FocusEnergy, { name: "Focus Energy critical hit stages (0-4)", default: 0, max: 4 }],
  // PBEffects.FocusPunch - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.FollowMe, { name: "Follow Me drawing in attacks (if 1+)", default: 0 }], // Order of use, lowest takes priority
  [PBEffects.RagePowder, { name: "Rage Powder applies (use with Follow Me)", default: false }],
  [PBEffects.Foresight, { name: "Foresight applies (Ghost loses immunities)", default: false }],
  [PBEffects.FuryCutter, { name: "Fury Cutter power multiplier 2**x (0-4)", default: 0, max: 4 }],
  [PBEffects.GastroAcid, { name: "Gastro Acid is negating self's ability", default: false }],
  // PBEffects.GemConsumed - only applies during use of move, not suitable for setting via debug
  [PBEffects.Grudge, { name: "Grudge will apply if self faints", default: false }],
  [PBEffects.HealBlock, { name: "Heal Block number of rounds remaining", default: 0 }],
  [PBEffects.HelpingHand, { name: "Helping Hand will power up self's move", default: false }],
  [PBEffects.HyperBeam, { name: "Hyper Beam recharge rounds remaining", default: 0 }],
  // PBEffects.Illusion - is a Pokémon object, too complex to be worth bothering with
  [PBEffects.Imprison, { name: "Imprison disables others' moves known by self", default: false }],
  [PBEffects.Ingrain, { name: "Ingrain applies", default: false }],
  // PBEffects.Instruct - only used while Instruct is running, not suitable for setting via debug
  // PBEffects.Instructed - only used while Instruct is running, not suitable for setting via debug
  [PBEffects.JawLock, { name: "Battler trapping self with Jaw Lock", default: -1 }], // Battler index
  [PBEffects.KingsShield, { name: "King's Shield applies this round", default: false }],
  [PBEffects.LaserFocus, { name: "Laser Focus certain critial hit duration", default: 0 }],
  [PBEffects.LeechSeed, { name: "Battler that used Leech Seed on self", default: -1 }], // Battler index
  [PBEffects.LockOn, { name: "Lock-On number of rounds remaining", default: 0 }],
  [PBEffects.LockOnPos, { name: "Battler that self is targeting with Lock-On", default: -1 }], // Battler index
  // PBEffects.MagicBounce - only applies during use of move, not suitable for setting via debug
  // PBEffects.MagicCoat - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.MagnetRise, { name: "Magnet Rise number of rounds remaining", default: 0 }],
  [PBEffects.MeanLook, { name: "Battler trapping self with Mean Look, etc.", default: -1 }], // Battler index
  // PBEffects.MeFirst - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.Metronome, { name: "Metronome item power multiplier 1 + 0.2*x (0-5)", default: 0, max: 5 }],
  [PBEffects.MicleBerry, { name: "Micle Berry boosting next move's accuracy", default: false }],
  [PBEffects.Minimize, { name: "Used Minimize", default: false }],
  [PBEffects.MiracleEye, { name: "Miracle Eye applies (Dark loses immunities)", default: false }],
  // PBEffects.MirrorCoat - not suitable for setting via debug
  // PBEffects.MirrorCoatTarget - not suitable for setting via debug
  // PBEffects.MoveNext - not suitable for setting via debug
  [PBEffects.MudSport, { name: "Used Mud Sport (Gen 5 and older)", default: false }],
  [PBEffects.Nightmare, { name: "Taking Nightmare damage", default: false }],
  [PBEffects.NoRetreat, { name: "No Retreat trapping self in battle", default: false }],
  [PBEffects.Obstruct, { name: "Obstruct applies this round", default: false }],
  [PBEffects.Octolock, { name: "Battler trapping self with Octolock", default: -1 }], // Battler index
  [PBEffects.Outrage, { name: "Outrage number of rounds remaining", default: 0 }],
  // PBEffects.ParentalBond - only applies during use of move, not suitable for setting via debug
  [PBEffects.PerishSong, { name: "Perish Song number of rounds remaining", default: 0 }],
  [PBEffects.PerishSongUser, { name: "Battler that used Perish Song on self", default: -1 }], // Battler index
  [PBEffects.PickupItem, { name: "Item retrievable by Pickup", default: null, type: "item" }],
  [PBEffects.PickupUse, { name: "Pickup item consumed time (higher=more recent)", default: 0 }],
  [PBEffects.Pinch, { name: "(Battle Palace) Behavior changed at <50% HP", default: false }],
  [PBEffects.Powder, { name: "Powder will explode self's Fire move this round", default: false }],
  // PBEffects.PowerTrick - doesn't actually swap the stats therefore does nothing, not suitable for setting via debug
  // PBEffects.Prankster - not suitable for setting via debug
  // PBEffects.PriorityAbility - not suitable for setting via debug
  // PBEffects.PriorityItem - not suitable for setting via debug
  [PBEffects.Protect, { name: "Protect applies this round", default: false }],
  [PBEffects.ProtectRate, { name: "Protect success chance 1/x", default: 1, max: 999 }],
  // PBEffects.Quash - not suitable for setting via debug
  // PBEffects.Rage - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.Rollout, { name: "Rollout rounds remaining (lower=stronger)", default: 0 }],
  [PBEffects.Roost, { name: "Roost removing Flying type this round", default: false }],
  // PBEffects.ShellTrap - only applies to use of specific move, not suitable for setting via debug
  // PBEffects.SkyDrop - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.SlowStart, { name: "Slow Start rounds remaining", default: 0 }],
  [PBEffects.SmackDown, { name: "Smack Down is grounding self", default: false }],
  // PBEffects.Snatch - only applies to use of specific move, not suitable for setting via debug
  [PBEffects.SpikyShield, { name: "Spiky Shield applies this round", default: false }],
  [PBEffects.Spotlight, { name: "Spotlight drawing in attacks (if 1+)", default: 0 }],
  [PBEffects.Stockpile, { name: "Stockpile count (0-3)", default: 0, max: 3 }],
  [PBEffects.StockpileDef, { name: "Def stages gained by Stockpile (0-12)", default: 0, max: 12 }],
  [PBEffects.StockpileSpDef, { name: "Sp. Def stages gained by Stockpile (0-12)", default: 0, max: 12 }],
  [PBEffects.Substitute, { name: "Substitute's HP", default: 0, max: 999 }],
  [PBEffects.TarShot, { name: "Tar Shot weakening self to Fire", default: false }],
  [PBEffects.Taunt, { name: "Taunt number of rounds remaining", default: 0 }],
  [PBEffects.Telekinesis, { name: "Telekinesis number of rounds remaining", default: 0 }],
  [PBEffects.ThroatChop, { name: "Throat Chop number of rounds remaining", default: 0 }],
  [PBEffects.Torment, { name: "Torment preventing repeating moves", default: false }],
  // PBEffects.Toxic - set elsewhere
  // PBEffects.Transform - too complex to be worth bothering with
  // PBEffects.TransformSpecies - too complex to be worth bothering with
  [PBEffects.Trapping, { name: "Trapping number of rounds remaining", default: 0 }],
  [PBEffects.TrappingMove, { name: "Move that is trapping self", default: null, type: "move" }],
  [PBEffects.TrappingUser, { name: "Battler trapping self (for Binding Band)", default: -1 }], // Battler index
  [PBEffects.Truant, { name: "Truant will loaf around this round", default: false }],
  // PBEffects.TwoTurnAttack - only applies to use of specific moves, not suitable for setting via debug
  // PBEffects.Type3 - set elsewhere
  [PBEffects.Unburden, { name: "Self lost its item (for Unburden)", default: false }],
  [PBEffects.Uproar, { name: "Uproar number of rounds remaining", default: 0 }],
  [PBEffects.WaterSport, { name: "Used Water Sport (Gen 5 and older)", default: false }],
  [PBEffects.WeightChange, { name: "Weight change +0.1*x kg", default: 0, min: -99_999, max: 99_999 }],
  [PBEffects.Yawn, { name: "Yawn rounds remaining until falling asleep", default: 0 }],
]);

const SIDE_EFFECTS: DebugVariablesTable = new Map<number, DebugVariableData>([
  [PBEffects.AuroraVeil, { name: "Aurora Veil duration", default: 0 }],
  [PBEffects.CraftyShield, { name: "Crafty Shield applies this round", default: false }],
  [PBEffects.EchoedVoiceCounter, { name: "Echoed Voice rounds used (max. 5)", default: 0, max: 5 }],
  [PBEffects.EchoedVoiceUsed, { name: "Echoed Voice used this round", default: false }],
  [PBEffects.LastRoundFainted, { name: "Round when side's battler last fainted", default: -2 }], // Treated as -1, isn't a battler index
  [PBEffects.LightScreen, { name: "Light Screen duration", default: 0 }],
  [PBEffects.LuckyChant, { name: "Lucky Chant duration", default: 0 }],
  [PBEffects.MatBlock, { name: "Mat Block applies this round", default: false }],
  [PBEffects.Mist, { name: "Mist duration", default: 0 }],
  [PBEffects.QuickGuard, { name: "Quick Guard applies this round", default: false }],
  [PBEffects.Rainbow, { name: "Rainbow duration", default: 0 }],
  [PBEffects.Reflect, { name: "Reflect duration", default: 0 }],
  [PBEffects.Round, { name: "Round was used this round", default: false }],
  [PBEffects.Safeguard, { name: "Safeguard duration", default: 0 }],
  [PBEffects.SeaOfFire, { name: "Sea Of Fire duration", default: 0 }],
  [PBEffects.Spikes, { name: "Spikes layers (0-3)", default: 0, max: 3 }],
  [PBEffects.StealthRock, { name: "Stealth Rock exists", default: false }],
  [PBEffects.StickyWeb, { name: "Sticky Web exists", default: false }],
  [PBEffects.Swamp, { name: "Swamp duration", default: 0 }],
  [PBEffects.Tailwind, { name: "Tailwind duration", default: 0 }],
  [PBEffects.ToxicSpikes, { name: "Toxic Spikes layers (0-2)", default: 0, max: 2 }],
  [PBEffects.WideGuard, { name: "Wide Guard applies this round", default: false }],
]);

const FIELD_EFFECTS: DebugVariablesTable = new Map<number, DebugVariableData>([
  [PBEffects.AmuletCoin, { name: "Amulet Coin doubling prize money", default: false }],
  [PBEffects.FairyLock, { name: "Fairy Lock trapping duration", default: 0 }],
  [PBEffects.FusionBolt, { name: "Fusion Bolt was used", default: false }],
  [PBEffects.FusionFlare, { name: "Fusion Flare was used", default: false }],
  [PBEffects.Gravity, { name: "Gravity duration", default: 0 }],
  [PBEffects.HappyHour, { name: "Happy Hour doubling prize money", default: false }],
  [PBEffects.IonDeluge, { name: "Ion Deluge making moves Electric", default: false }],
  [PBEffects.MagicRoom, { name: "Magic Room duration", default: 0 }],
  [PBEffects.MudSportField, { name: "Mud Sport duration (Gen 6+)", default: 0 }],
  [PBEffects.PayDay, { name: "Pay Day additional prize money", default: 0, max: Settings.MAX_MONEY }],
  [PBEffects.TrickRoom, { name: "Trick Room duration", default: 0 }],
  [PBEffects.WaterSportField, { name: "Water Sport duration (Gen 6+)", default: 0 }],
  [PBEffects.WonderRoom, { name: "Wonder Room duration", default: 0 }],
]);

const POSITION_EFFECTS: DebugVariablesTable = new Map<number, DebugVariableData>([
  // PBEffects.FutureSightCounter - too complex to be worth bothering with
  // PBEffects.FutureSightMove - too complex to be worth bothering with
  // PBEffects.FutureSightUserIndex - too complex to be worth bothering with
  // PBEffects.FutureSightUserPartyIndex - too complex to be worth bothering with
  [PBEffects.HealingWish, { name: "Whether Healing Wish is waiting to apply", default: false }],
  [PBEffects.LunarDance, { name: "Whether Lunar Dance is waiting to apply", default: false }],
  // PBEffects.Wish - too complex to be worth bothering with
  // PBEffects.WishAmount - too complex to be worth bothering with
  // PBEffects.WishMaker - too complex to be worth bothering with
]);

/** Battle::DebugVariables */
export const BattleDebugVariables = { BATTLER_EFFECTS, SIDE_EFFECTS, FIELD_EFFECTS, POSITION_EFFECTS };

//-------------------------------------------------------------------------------
// Generation 9 Pack ([001] Battle/[000] PBEffects.rb:36): new effects and values
// to be added to the debug menu.
//-------------------------------------------------------------------------------
BATTLER_EFFECTS.set(PBEffects.AllySwitch, { name: "Ally Switch applies this round", default: false });
BATTLER_EFFECTS.set(PBEffects.CudChew, { name: "Cud Chew number of rounds until active", default: 0 });
BATTLER_EFFECTS.set(PBEffects.DoubleShock, { name: "Double Shock has removed self's Electric type", default: false });
BATTLER_EFFECTS.set(PBEffects.GlaiveRush, { name: "Glaive Rush vulnerability rounds remaining", default: 0 });
BATTLER_EFFECTS.set(PBEffects.ParadoxStat, { name: "Protosynthesis/Quark Drive stat boosted", default: null, type: "stat" });
BATTLER_EFFECTS.set(PBEffects.BoosterEnergy, { name: "Booster Energy applies", default: false });
BATTLER_EFFECTS.set(PBEffects.SaltCure, { name: "Salt Cure applies", default: false });
BATTLER_EFFECTS.set(PBEffects.SilkTrap, { name: "Silk Trap applies this round", default: false });
BATTLER_EFFECTS.set(PBEffects.Splinters, { name: "Splinters number of rounds remaining", default: 0 });
BATTLER_EFFECTS.set(PBEffects.SplintersType, { name: "Splinters damage typing", default: null, type: "type" });
BATTLER_EFFECTS.set(PBEffects.SupremeOverlord, { name: "Supreme Overlord multiplier 1 + 0.1*x (0-5)", default: 0, max: 5 });

//-------------------------------------------------------------------------------
// Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb:16).
//-------------------------------------------------------------------------------
BATTLER_EFFECTS.set(PBEffects.CriticalBoost, { name: "Critical Boost critical hit stages (0-4)", default: 0, max: 4 });

//-------------------------------------------------------------------------------
// ZUD Mechanics ([003] Battle/Battle_PBEffects.rb:37): allows the setting of
// newly-added effects in the battle Debug menu.
// NOTE (Ruby parity): ZUD initializes ZHeal on Battle::ActiveSide
// (Battle_Overrides.rb:13) but uses it on positions, so a position's Z-Healing
// starts as nil and the editor shows a blank value until it is toggled.
//-------------------------------------------------------------------------------
BATTLER_EFFECTS.set(PBEffects.MaxGuard, { name: "Max Guard applies this round", default: false });
POSITION_EFFECTS.set(PBEffects.ZHeal, { name: "Whether Z-Healing is waiting to apply", default: false });
SIDE_EFFECTS.set(PBEffects.VineLash, { name: "G-Max Vine Lash duration", default: 0 });
SIDE_EFFECTS.set(PBEffects.Wildfire, { name: "G-Max Wildfire duration", default: 0 });
SIDE_EFFECTS.set(PBEffects.Cannonade, { name: "G-Max Cannonade duration", default: 0 });
SIDE_EFFECTS.set(PBEffects.Volcalith, { name: "G-Max Volcalith duration", default: 0 });
SIDE_EFFECTS.set(PBEffects.Steelsurge, { name: "G-Max Steelsurge exists", default: false });

/** Ruby truthiness: only nil and false are false (0 is true). */
function truthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** Ruby's to_s for an effect's value (nil => ""). */
function rubyToS(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

//===============================================================================
// Screen for listing the above battle variables for modifying.
//===============================================================================
export class SpriteWindow_DebugBattleFieldEffects extends Window_DrawableCommand {
  static readonly BASE_TEXT_COLOR = new Color(96, 96, 96);
  static readonly RED_TEXT_COLOR = new Color(168, 48, 56);
  static readonly GREEN_TEXT_COLOR = new Color(0, 144, 0);
  static readonly TEXT_SHADOW_COLOR = new Color(208, 208, 200);

  // Ruby sets these before calling super; super's refresh sees no variables yet.
  declare private _battle: Battle;
  declare private _variables: EffectsArray;
  declare private _variablesData: DebugVariablesTable;

  constructor(viewport: Viewport, battle: Battle, variables: EffectsArray, variablesData: DebugVariablesTable) {
    super(0, 0, Graphics.width, Graphics.height, viewport);
    this._battle = battle;
    this._variables = variables;
    this._variablesData = variablesData;
    this.refresh();
  }

  override itemCount(): number {
    if (!this._variablesData) return 0;
    return this._variablesData.size;
  }

  shadowtext(x: number, y: number, w: number, h: number, t: string, align = 0, colors = 0): void {
    const contents = this.contents!;
    const width = contents.textSize(t).width;
    switch (align) {
      case 1: // Right aligned
        x += w - width;
        break;
      case 2: // Centre aligned
        x += Math.trunc((w - width) / 2);
        break;
    }
    const W = SpriteWindow_DebugBattleFieldEffects;
    let baseColor = W.BASE_TEXT_COLOR;
    switch (colors) {
      case 1: baseColor = W.RED_TEXT_COLOR; break;
      case 2: baseColor = W.GREEN_TEXT_COLOR; break;
    }
    pbDrawShadowText(contents, x, y, Math.max(width, w), h, t, baseColor, W.TEXT_SHADOW_COLOR);
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    pbSetNarrowFont(this.contents!);
    const key = [...this._variablesData.keys()][index]!;
    const variableData = this._variablesData.get(key)!;
    const variable = this._variables[key];
    // Variables which aren't their default value are colored differently
    let dflt = variableData.default;
    if (dflt === -2) dflt = -1;
    const different = (truthy(variable) ? variable : dflt) !== dflt;
    const color = different ? 2 : 0;
    // Draw cursor
    rect = this.drawCursor(index, rect);
    // Get value's text to draw
    let variableText = rubyToS(variable);
    switch (variableData.default) {
      case -1: // Battler
        if (variable >= 0) {
          let battlerName = this._battle.battlers[variable]!.name;
          if (!battlerName) battlerName = "-";
          variableText = `[${variable}] ${battlerName}`;
        } else {
          variableText = _INTL("[None]");
        }
        break;
      case null: // Move, item
        if (!truthy(variable)) variableText = _INTL("[None]");
        break;
    }
    // Draw text
    const totalWidth = rect.width;
    const nameWidth = Math.trunc((totalWidth * 80) / 100);
    const valueWidth = Math.trunc((totalWidth * 20) / 100);
    this.shadowtext(rect.x, rect.y + 8, nameWidth, rect.height, variableData.name, 0, color);
    this.shadowtext(rect.x + nameWidth, rect.y + 8, valueWidth, rect.height, variableText, 1, color);
  }
}

//===============================================================================
//
//===============================================================================
export type DebugSetEffectsMode = "field" | "side" | "position" | "battler";

/** Battle::DebugSetEffects */
export class BattleDebugSetEffects {
  private battle: Battle;
  private mode: DebugSetEffectsMode;
  private side: number;
  private variablesData!: DebugVariablesTable;
  private variables!: EffectsArray;
  private viewport: Viewport;
  private window: SpriteWindow_DebugBattleFieldEffects;

  constructor(battle: Battle, mode: DebugSetEffectsMode, side = 0) {
    this.battle = battle;
    this.mode = mode;
    this.side = side;
    switch (this.mode) {
      case "field":
        this.variablesData = BattleDebugVariables.FIELD_EFFECTS;
        this.variables = this.battle.field.effects;
        break;
      case "side":
        this.variablesData = BattleDebugVariables.SIDE_EFFECTS;
        this.variables = this.battle.sides[this.side]!.effects;
        break;
      case "position":
        this.variablesData = BattleDebugVariables.POSITION_EFFECTS;
        this.variables = this.battle.positions[this.side]!.effects;
        break;
      case "battler":
        this.variablesData = BattleDebugVariables.BATTLER_EFFECTS;
        this.variables = this.battle.battlers[this.side]!.effects;
        break;
    }
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.window = new SpriteWindow_DebugBattleFieldEffects(this.viewport, this.battle, this.variables, this.variablesData);
    this.window.active = true;
  }

  dispose(): void {
    this.window.dispose();
    this.viewport.dispose();
  }

  async chooseNumber(dflt: number, min: number, max: number): Promise<number> {
    const params = new ChooseNumberParams();
    params.setRange(min, max);
    params.setDefaultValue(dflt);
    if (min < 0) params.setNegativesAllowed(true);
    return pbMessageChooseNumber(_INTL("Set value ({1}-{2}).", min, max), params);
  }

  async chooseBattler(dflt: number): Promise<number> {
    const commands = [_INTL("[None]")];
    const cmds = [-1];
    let cmd = 0;
    this.battle.battlers.forEach((battler, i) => {
      if (!battler) return; // Position doesn't exist
      let name = battler.pbThis();
      if (battler.fainted() || !name) name = "-";
      commands.push(`[${i}] ${name}`);
      cmds.push(i);
      if (dflt === i) cmd = cmds.length - 1;
    });
    cmd = await pbMessage("\\ts[]" + _INTL("Choose a battler/position."), commands, -1, null, cmd);
    return cmd >= 0 ? cmds[cmd]! : dflt;
  }

  async updateInputForBoolean(effect: number, _variableData: DebugVariableData): Promise<boolean> {
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      this.variables[effect] = !truthy(this.variables[effect]);
      return true;
    } else if (Input.trigger(Input.ACTION) && truthy(this.variables[effect])) {
      pbPlayDecisionSE();
      this.variables[effect] = false;
      return true;
    } else if (Input.repeat(Input.LEFT) && truthy(this.variables[effect])) {
      pbPlayCursorSE();
      this.variables[effect] = false;
      return true;
    } else if (Input.repeat(Input.RIGHT) && !truthy(this.variables[effect])) {
      pbPlayCursorSE();
      this.variables[effect] = true;
      return true;
    }
    return false;
  }

  async updateInputForInteger(effect: number, dflt: number, variableData: DebugVariableData): Promise<boolean> {
    const trueDefault = dflt === -2 ? -1 : dflt;
    const min = variableData.min ?? trueDefault;
    const max = variableData.max ?? 99;
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      const newValue = await this.chooseNumber(this.variables[effect], min, max);
      if (newValue !== this.variables[effect]) {
        this.variables[effect] = newValue;
        return true;
      }
    } else if (Input.trigger(Input.ACTION) && this.variables[effect] !== trueDefault) {
      pbPlayDecisionSE();
      this.variables[effect] = trueDefault;
      return true;
    } else if (Input.repeat(Input.LEFT) && this.variables[effect] > min) {
      pbPlayCursorSE();
      this.variables[effect] -= 1;
      return true;
    } else if (Input.repeat(Input.RIGHT) && this.variables[effect] < max) {
      pbPlayCursorSE();
      this.variables[effect] += 1;
      return true;
    }
    return false;
  }

  async updateInputForBattlerIndex(effect: number, _variableData: DebugVariableData): Promise<boolean> {
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      const newValue = await this.chooseBattler(this.variables[effect]);
      if (newValue !== this.variables[effect]) {
        this.variables[effect] = newValue;
        return true;
      }
    } else if (Input.trigger(Input.ACTION) && this.variables[effect] !== -1) {
      pbPlayDecisionSE();
      this.variables[effect] = -1;
      return true;
    } else if (Input.repeat(Input.LEFT)) {
      if (this.variables[effect] > -1) {
        pbPlayCursorSE();
        for (;;) {
          this.variables[effect] -= 1;
          if (this.variables[effect] === -1 || this.battle.battlers[this.variables[effect]]) break;
        }
        return true;
      }
    } else if (Input.repeat(Input.RIGHT)) {
      if (this.variables[effect] < this.battle.battlers.length - 1) {
        pbPlayCursorSE();
        for (;;) {
          this.variables[effect] += 1;
          if (this.battle.battlers[this.variables[effect]]) break;
        }
        return true;
      }
    }
    return false;
  }

  async updateInputForMove(effect: number, _variableData: DebugVariableData): Promise<boolean> {
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      const newValue = await pbChooseMoveList(this.variables[effect]);
      if (newValue && newValue !== this.variables[effect]) {
        this.variables[effect] = newValue;
        return true;
      }
    } else if (Input.trigger(Input.ACTION) && truthy(this.variables[effect])) {
      pbPlayDecisionSE();
      this.variables[effect] = null;
      return true;
    }
    return false;
  }

  async updateInputForItem(effect: number, _variableData: DebugVariableData): Promise<boolean> {
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      const newValue = await pbChooseItemList(this.variables[effect]);
      if (newValue && newValue !== this.variables[effect]) {
        this.variables[effect] = newValue;
        return true;
      }
    } else if (Input.trigger(Input.ACTION) && truthy(this.variables[effect])) {
      pbPlayDecisionSE();
      this.variables[effect] = null;
      return true;
    }
    return false;
  }

  /** Generation 9 Pack ([000] General/[002] Debug.rb:165): sets PBEffects::ParadoxStat to a stat ID. */
  async updateInputForStat(effect: number, _variableData: DebugVariableData): Promise<boolean> {
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      const newValue = await pbChooseStatList("main_battle", this.variables[effect]);
      if (newValue && newValue !== this.variables[effect]) {
        this.variables[effect] = newValue;
        return true;
      }
    } else if (Input.trigger(Input.ACTION) && truthy(this.variables[effect])) {
      pbPlayDecisionSE();
      this.variables[effect] = null;
      return true;
    }
    return false;
  }

  /** Generation 9 Pack ([000] General/[002] Debug.rb:181): sets PBEffects::SplintersType to a type ID. */
  async updateInputForType(effect: number, _variableData: DebugVariableData): Promise<boolean> {
    if (Input.trigger(Input.USE)) {
      pbPlayDecisionSE();
      const newValue = await pbChooseTypeList(this.variables[effect]);
      if (newValue && newValue !== this.variables[effect]) {
        this.variables[effect] = newValue;
        return true;
      }
    } else if (Input.trigger(Input.ACTION) && truthy(this.variables[effect])) {
      pbPlayDecisionSE();
      this.variables[effect] = null;
      return true;
    }
    return false;
  }

  /** The Generation 9 Pack's override (adds the :stat and :type kinds). */
  async update(): Promise<void> {
    const keys = [...this.variablesData.keys()];
    for (;;) {
      await Graphics.update();
      Input.update();
      this.window.update();
      if (Input.trigger(Input.BACK)) {
        pbPlayCancelSE();
        break;
      }
      const index = this.window.index;
      const effect = keys[index]!;
      const variableData = this.variablesData.get(effect)!;
      const dflt = variableData.default;
      if (dflt === false) {
        if (await this.updateInputForBoolean(effect, variableData)) this.window.refresh();
      } else if (dflt === 0 || dflt === 1 || dflt === -2) {
        if (await this.updateInputForInteger(effect, dflt, variableData)) this.window.refresh();
      } else if (dflt === -1) {
        if (await this.updateInputForBattlerIndex(effect, variableData)) this.window.refresh();
      } else if (dflt === null) {
        switch (variableData.type) {
          case "move":
            if (await this.updateInputForMove(effect, variableData)) this.window.refresh();
            break;
          case "item":
            if (await this.updateInputForItem(effect, variableData)) this.window.refresh();
            break;
          case "stat":
            if (await this.updateInputForStat(effect, variableData)) this.window.refresh();
            break;
          case "type":
            if (await this.updateInputForType(effect, variableData)) this.window.refresh();
            break;
          default:
            throw new Error("Unknown kind of variable!");
        }
      } else {
        throw new Error("Unknown kind of variable!");
      }
    }
  }
}
