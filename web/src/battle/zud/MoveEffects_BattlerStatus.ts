// Port of Plugins/ZUD Mechanics/[007] Move Effects/MoveEffects_BattlerStatus.rb:
// Power Moves that apply status effects (@statuses; see GeneralEffect in
// PowerMove_BaseEffects.ts for the format: a random one of the listed statuses
// is inflicted; :TOXIC, :CONFUSION, :ATTRACT and :NONE (cure) are also accepted).

import type { Id } from "../../data/gameData/gameData";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { _INTL } from "../../data/gameData/gameData";
import { PBEffects } from "../other/PBEffects";
import { registerPowerMoveClass } from "./Battle_PowerMove";
import { GeneralEffect, type Recipients } from "./PowerMove_BaseEffects";

/** The @statuses = { :<recipients> => [statuses] } classes. */
function statusClass(name: string, recipients: Recipients, statuses: Id[]): typeof GeneralEffect {
  const cls = class extends GeneralEffect {
    constructor(battle: Battle, move: PokemonMove | null) {
      super(battle, move);
      this.statuses = { [recipients]: [...statuses] };
    }
  };
  Object.defineProperty(cls, "name", { value: name });
  registerPowerMoveClass(name, cls);
  return cls;
}

//===============================================================================
// Paralyzes the target. (Stoked Sparksurfer)
//===============================================================================
statusClass("ZUDParalyzeTarget", "target", ["PARALYSIS"]);

//===============================================================================
// Cures the user and its allies of status conditions. (G-Max Sweetness)
//===============================================================================
statusClass("ZUDCureUserAndAlliesStatus", "allies", ["NONE"]);

//===============================================================================
// Paralyzes the target and its allies. (G-Max Volt Crash)
//===============================================================================
statusClass("ZUDParalyzeAllFoes", "opponents", ["PARALYSIS"]);

//===============================================================================
// Poisons the target and its allies. (G-Max Malador)
//===============================================================================
statusClass("ZUDPoisonAllFoes", "opponents", ["POISON"]);

//===============================================================================
// Randomly poisons or paralyzes the target and its allies. (G-Max Stun Shock)
//===============================================================================
statusClass("ZUDPoisonOrParalyzeAllFoes", "opponents", ["POISON", "PARALYSIS"]);

//===============================================================================
// Randomly poisons, paralyzes or sleeps the target and its allies. (G-Max Befuddle)
//===============================================================================
statusClass("ZUDPoisonParalyzeOrSleepAllFoes", "opponents", ["POISON", "PARALYSIS", "SLEEP"]);

//===============================================================================
// Infatuates the target and its allies. (G-Max Cuddle)
//===============================================================================
statusClass("ZUDInfatuateAllFoes", "opponents", ["ATTRACT"]);

//===============================================================================
// Confuses the target and its allies. (G-Max Smite)
//===============================================================================
statusClass("ZUDConfuseAllFoes", "opponents", ["CONFUSION"]);

//===============================================================================
// Confuses the target and its allies. Gains money at the end of battle. (G-Max Goldrush)
//===============================================================================
export class ZUDConfuseAllFoesAddMoney extends GeneralEffect {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statuses = { opponents: ["CONFUSION"] };
  }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    await super.pbEffectAfterAllHits(user, target);
    this.battle.field.effects[PBEffects.PayDay] += 100 * user.level;
    await this.battle.pbDisplay(_INTL("Coins were scattered everywhere!"));
  }
}
registerPowerMoveClass("ZUDConfuseAllFoesAddMoney", ZUDConfuseAllFoesAddMoney);
