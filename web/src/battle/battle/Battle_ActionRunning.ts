// Port of Data/Scripts/011_Battle/001_Battle/007_Battle_ActionRunning.rb
// (no plugin patches).

import { _INTL } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { pbSEPlay } from "../audio";
import { Input } from "../../rgss/Input";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { Battle } from "./Battle";
import { DEBUG } from "../../core/debug"; // $DEBUG

const methods = {
  //=============================================================================
  // Running from battle
  //=============================================================================
  /** pbCanRun? */
  pbCanRun(this: Battle, idxBattler: number): boolean {
    if (this.trainerBattle()) return false;
    const battler = this.battlers[idxBattler]!;
    if (!this.canRun && !battler.opposes()) return false;
    if (battler.pbHasType("GHOST") && Settings.MORE_TYPE_EFFECTS) return true;
    if (battler.abilityActive() &&
        AbilityEffects.triggerCertainEscapeFromBattle(battler.ability, battler)) return true;
    if (battler.itemActive() &&
        ItemEffects.triggerCertainEscapeFromBattle(battler.item, battler)) return true;
    if (battler.trappedInBattle()) return false;
    for (const b of this.allOtherSideBattlers(idxBattler)) {
      if (b.abilityActive() &&
          AbilityEffects.triggerTrappingByTarget(b.ability, battler, b, this)) return false;
      if (b.itemActive() &&
          ItemEffects.triggerTrappingByTarget(b.item, battler, b, this)) return false;
    }
    return true;
  },

  /**
   * Return values:
   * -1: Failed fleeing
   *  0: Wasn't possible to attempt fleeing, continue choosing action for the round
   *  1: Succeeded at fleeing, battle will end
   * duringBattle is true for replacing a fainted Pokémon during the End Of Round
   * phase, and false for choosing the Run command.
   */
  async pbRun(this: Battle, idxBattler: number, duringBattle = false): Promise<number> {
    const battler = this.battlers[idxBattler]!;
    if (battler.opposes()) {
      if (this.trainerBattle()) return 0;
      const choice = this.choices[idxBattler]!;
      choice[0] = "Run";
      choice[1] = 0;
      choice[2] = null;
      return -1;
    }
    // Fleeing from trainer battles
    if (this.trainerBattle()) {
      if (DEBUG && Input.press(Input.CTRL)) {
        if (await this.pbDisplayConfirm(_INTL("Treat this battle as a win?"))) {
          this.decision = 1;
          return 1;
        } else if (await this.pbDisplayConfirm(_INTL("Treat this battle as a loss?"))) {
          this.decision = 2;
          return 1;
        }
      } else if (this.internalBattle) {
        await this.pbDisplayPaused(_INTL("No! There's no running from a Trainer battle!"));
      } else if (await this.pbDisplayConfirm(_INTL("Would you like to forfeit the match and quit now?"))) {
        pbSEPlay("Battle flee");
        await this.pbDisplay(_INTL("{1} forfeited the match!", this.pbPlayer().name));
        this.decision = 3;
        return 1;
      }
      return 0;
    }
    // Fleeing from wild battles
    if (DEBUG && Input.press(Input.CTRL)) {
      pbSEPlay("Battle flee");
      await this.pbDisplayPaused(_INTL("You got away safely!"));
      this.decision = 3;
      return 1;
    }
    if (!this.canRun) {
      await this.pbDisplayPaused(_INTL("You can't escape!"));
      return 0;
    }
    if (!duringBattle) {
      if (battler.pbHasType("GHOST") && Settings.MORE_TYPE_EFFECTS) {
        pbSEPlay("Battle flee");
        await this.pbDisplayPaused(_INTL("You got away safely!"));
        this.decision = 3;
        return 1;
      }
      // Abilities that guarantee escape
      if (battler.abilityActive() &&
          AbilityEffects.triggerCertainEscapeFromBattle(battler.ability, battler)) {
        await this.pbShowAbilitySplash(battler, true);
        await this.pbHideAbilitySplash(battler);
        pbSEPlay("Battle flee");
        await this.pbDisplayPaused(_INTL("You got away safely!"));
        this.decision = 3;
        return 1;
      }
      // Held items that guarantee escape
      if (battler.itemActive() &&
          ItemEffects.triggerCertainEscapeFromBattle(battler.item, battler)) {
        pbSEPlay("Battle flee");
        await this.pbDisplayPaused(_INTL("{1} fled using its {2}!", battler.pbThis(), battler.itemName()));
        this.decision = 3;
        return 1;
      }
      // Other certain trapping effects
      if (battler.trappedInBattle()) {
        await this.pbDisplayPaused(_INTL("You can't escape!"));
        return 0;
      }
      // Trapping abilities/items
      for (const b of this.allOtherSideBattlers(idxBattler)) {
        if (!b.abilityActive()) continue;
        if (AbilityEffects.triggerTrappingByTarget(b.ability, battler, b, this)) {
          await this.pbDisplayPaused(_INTL("{1} prevents escape with {2}!", b.pbThis(), b.abilityName()));
          return 0;
        }
      }
      for (const b of this.allOtherSideBattlers(idxBattler)) {
        if (!b.itemActive()) continue;
        if (ItemEffects.triggerTrappingByTarget(b.item, battler, b, this)) {
          await this.pbDisplayPaused(_INTL("{1} prevents escape with {2}!", b.pbThis(), b.itemName()));
          return 0;
        }
      }
    }
    // Fleeing calculation
    // Get the speeds of the Pokémon fleeing and the fastest opponent
    // NOTE: Not pbSpeed, because using unmodified Speed.
    if (!duringBattle) this.runCommand += 1; // Make it easier to flee next time
    const speedPlayer = this.battlers[idxBattler]!.speed;
    let speedEnemy = 1;
    for (const b of this.allOtherSideBattlers(idxBattler)) {
      const speed = b.speed;
      if (speedEnemy < speed) speedEnemy = speed;
    }
    // Compare speeds and perform fleeing calculation
    let rate: number;
    if (speedPlayer > speedEnemy) {
      rate = 256;
    } else {
      rate = Math.floor((speedPlayer * 128) / speedEnemy);
      rate += this.runCommand * 30;
    }
    if (rate >= 256 || this.battleAI.pbAIRandom(256) < rate) {
      pbSEPlay("Battle flee");
      await this.pbDisplayPaused(_INTL("You got away safely!"));
      this.decision = 3;
      return 1;
    }
    await this.pbDisplayPaused(_INTL("You couldn't get away!"));
    return -1;
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
