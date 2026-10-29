// Port of Plugins/ZUD Mechanics/[007] Move Effects/MoveEffects_Other.rb: Power
// Moves with very specific effects that GeneralEffect can't be used for. Some
// subclass Battle::Move classes instead of Battle::PowerMove, as in Ruby (so
// they keep their PBS power/category, aren't reduced by Protect and don't
// ignore -ate Abilities).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { FixedDamageMove, ProtectMove } from "../move/Move_BaseEffects";
import { IgnoreTargetAbility } from "../move/MoveEffects_BattlerOther";
import { CategoryDependsOnHigherDamageIgnoreTargetAbility } from "../move/MoveEffects_MoveAttributes";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { PowerMove, registerPowerMoveClass } from "./Battle_PowerMove";

/** Ruby's Array#[] (negative indices count from the end). */
function rubyAt<T>(arr: readonly T[], i: number): T | undefined {
  return arr[i < 0 ? arr.length + i : i];
}

//===============================================================================
// User is protected against all attacks, including Max Moves. (Max Guard)
// Specific exceptions dealt with elsewhere.
//===============================================================================
export class ZUDProtectUser extends ProtectMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.effect = PBEffects.MaxGuard;
  }
}
registerPowerMoveClass("ZUDProtectUser", ZUDProtectUser);

//===============================================================================
// Ignores the target's Ability. (G-Max Drum Solo, G-Max Fireball, G-Max Hydrosnipe)
//===============================================================================
export class ZUDIgnoreTargetAbility extends IgnoreTargetAbility {}
registerPowerMoveClass("ZUDIgnoreTargetAbility", ZUDIgnoreTargetAbility);

//===============================================================================
// Ignores the target's Ability. Damage category is chosen based on which would
// deal the most damage. (Light That Burns the Sky)
// NOTE (Ruby parity): PBS gives Light That Burns the Sky the function code
//       "ZUDPhotonGeyser", which has no class (this one is ...Effect), so the
//       move is a plain Battle::PowerMove::Unimplemented damaging move.
//===============================================================================
export class ZUDPhotonGeyserEffect extends CategoryDependsOnHigherDamageIgnoreTargetAbility {}
registerPowerMoveClass("ZUDPhotonGeyserEffect", ZUDPhotonGeyserEffect);

//===============================================================================
// Inflicts 75% of the target's current HP. (Guardian of Alola)
//===============================================================================
export class ZUDFixedDamage75PercentTargetHP extends FixedDamageMove {
  override pbFixedDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.realHp()! * 0.75);
  }
}
registerPowerMoveClass("ZUDFixedDamage75PercentTargetHP", ZUDFixedDamage75PercentTargetHP);

//===============================================================================
// The user and its allies gain 1/6th of their total HP. The amount healed doesn't
// scale down for Dynamax HP totals. (G-Max Finale)
//===============================================================================
export class ZUDHealUserAndAlliesOneSixthOfTotalHP extends PowerMove {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    if (this.battle.pbAllFainted(target.idxOwnSide()) || this.battle.decision > 0) return;
    for (const b of this.battle.allSameSideBattlers(user)) { // eachSameSideBattler
      if (b.hp === b.totalhp) continue;
      if (b.effects[PBEffects.HealBlock] > 0) continue;
      b.ignoreDynamax = true;
      await b.pbRecoverHP(b.totalhp / 6.0);
    }
  }
}
registerPowerMoveClass("ZUDHealUserAndAlliesOneSixthOfTotalHP", ZUDHealUserAndAlliesOneSixthOfTotalHP);

//===============================================================================
// The user and its allies may recover consumed berries. (G-Max Replenish)
//===============================================================================
export class ZUDRestoreUserAndAlliesConsumedBerry extends PowerMove {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    if (this.battle.pbAllFainted(target.idxOwnSide()) || this.battle.decision > 0) return;
    for (const b of this.battle.allSameSideBattlers(user)) { // eachSameSideBattler
      if (!b.recycleItem() || !Item.get(b.recycleItem()!).isBerry()) continue;
      if (this.battle.pbRandom(2) < 1) continue;
      b.item = b.recycleItem();
      b.setRecycleItem(null);
      if (!b.initialItem()) b.setInitialItem(b.item);
      await this.battle.pbDisplay(_INTL("{1} found one {2}!", b.pbThis(), b.itemName()));
      await b.pbHeldItemTriggerCheck();
    }
  }
}
registerPowerMoveClass("ZUDRestoreUserAndAlliesConsumedBerry", ZUDRestoreUserAndAlliesConsumedBerry);

//===============================================================================
// Each opponent's last move used loses 2 PP. (G-Max Depletion)
//===============================================================================
export class ZUDLowerPPOfAllFoesLastMoveBy2 extends PowerMove {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    if (this.battle.pbAllFainted(target.idxOwnSide()) || this.battle.decision > 0) return;
    for (const b of user.allOpposing()) {
      if (!b.lastRegularMoveUsed) continue;
      // NOTE (Ruby parity): b.power_index is -1 unless b used a Power Move this
      //       round, and Ruby's moves[-1] is then the last move (and a missing
      //       move raises NoMethodError on nil.pp).
      let lastMove: Move | undefined;
      if (MoveData.get(b.lastRegularMoveUsed).powerMove()) {
        lastMove = rubyAt(b.moves, b.powerIndex);
      } else {
        lastMove = b.pbGetMoveWithID(b.lastRegularMoveUsed) ?? undefined;
      }
      if (!lastMove) throw new TypeError("undefined method `pp' for nil:NilClass");
      let reduction = Math.min(2, lastMove.pp);
      b.pbSetPP(lastMove, lastMove.pp - reduction);
      if (MoveData.get(b.lastRegularMoveUsed).powerMove()) {
        const baseMove = rubyAt(b.baseMoves, b.powerIndex) as Move | undefined;
        if (!baseMove) throw new TypeError("undefined method `pp' for nil:NilClass");
        reduction = Math.min(2, baseMove.pp);
        b.pbSetPP(baseMove, baseMove.pp - reduction);
      }
      await this.battle.pbDisplay(_INTL("{1}'s PP was reduced!", b.pbThis()));
    }
  }
}
registerPowerMoveClass("ZUDLowerPPOfAllFoesLastMoveBy2", ZUDLowerPPOfAllFoesLastMoveBy2);

//===============================================================================
// Opposing Pokemon can no longer switch or flee, as long as the user is active.
// (G-Max Terror)
//===============================================================================
export class ZUDTrapAllFoesInBattle extends PowerMove {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    if (this.battle.pbAllFainted(target.idxOwnSide()) || this.battle.decision > 0) return;
    for (const b of user.allOpposing()) {
      if (Settings.MORE_TYPE_EFFECTS && b.pbHasType("GHOST")) continue;
      if (b.effects[PBEffects.MeanLook] === user.index) continue;
      await this.battle.pbDisplay(_INTL("{1} can no longer escape!", b.pbThis()));
      b.effects[PBEffects.MeanLook] = user.index;
    }
  }
}
registerPowerMoveClass("ZUDTrapAllFoesInBattle", ZUDTrapAllFoesInBattle);

//===============================================================================
// Trapping move. Traps for 4 or 5 rounds. Trapped Pokémon lose 1/8 of max HP
// at end of each round. Trapping effect persists even upon the user switching out.
// (G-Max Centiferno, G-Max Sand Blast)
//===============================================================================
export class ZUDBindAllFoesUserCanSwitch extends PowerMove {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.unaffected) return;
    if (this.battle.pbAllFainted(target.idxOwnSide()) || this.battle.decision > 0) return;
    let moveid: Id | null = null;
    switch (this.type) {
      case "NORMAL": moveid = "BIND"; break;
      case "WATER": moveid = "WHIRLPOOL"; break;
      case "FIRE": moveid = "FIRESPIN"; break;
      case "BUG": moveid = "INFESTATION"; break;
      case "GROUND": moveid = "SANDTOMB"; break;
    }
    for (const b of user.allOpposing()) {
      if (b.effects[PBEffects.Trapping] > 0) continue;
      b.effects[PBEffects.Trapping] = 4 + this.battle.pbRandom(2);
      if (user.hasActiveItem("GRIPCLAW")) b.effects[PBEffects.Trapping] = 7;
      b.effects[PBEffects.TrappingMove] = moveid;
      b.effects[PBEffects.TrappingUser] = user.index;
      b.effects[PBEffects.GMaxTrapping] = true;
      let msg = _INTL("{1} was trapped in the vortex!", b.pbThis());
      switch (moveid) {
        case "BIND":
          msg = _INTL("{1} was squeezed by {2}!", b.pbThis(), user.pbThis(true));
          break;
        case "FIRESPIN":
          msg = _INTL("{1} was trapped in the fiery vortex!", b.pbThis());
          break;
        case "INFESTATION":
          msg = _INTL("{1} has been afflicted with an infestation by {2}!", b.pbThis(), user.pbThis(true));
          break;
        case "SANDTOMB":
          msg = _INTL("{1} became trapped by Sand Tomb!", b.pbThis());
          break;
        case "WHIRLPOOL":
          msg = _INTL("{1} became trapped in the watery vortex!", b.pbThis());
          break;
      }
      await this.battle.pbDisplay(msg);
    }
  }
}
registerPowerMoveClass("ZUDBindAllFoesUserCanSwitch", ZUDBindAllFoesUserCanSwitch);
