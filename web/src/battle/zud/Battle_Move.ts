// Port of Plugins/ZUD Mechanics/[006] Battle_Move/Battle_Move.rb:84-152:
// Battle::Move#status_zmove_effect, the effects of a Z-Powered status move
// (called by pbDisplayUseMessage). The rest of that file (zmove_flag, zMove?,
// pbInflictHPDamage, pbNumHits, pbBaseType, pbDisplayUseMessage) is in
// move/Move.ts, move/Move_Usage.ts and move/Move_UsageCalculations.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { PowerMove as PowerMoveData } from "../../data/gameData/powerMove";
import { Stat } from "../../data/gameData/stat";
import { G } from "../../game/globals";
import type { Battler } from "../battler/Battler";
import { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";

const methods = {
  //-----------------------------------------------------------------------------
  // Gets the effects for a Z-Powered status move.
  //-----------------------------------------------------------------------------
  async statusZmoveEffect(this: Move, user: Battler): Promise<void> {
    if (user.pbOwnedByPlayer()) G.stats.statusZmoveCount += 1;
    const curseEffect = (this.id !== "CURSE") ? 0 : (user.pbHasType("GHOST")) ? 1 : 2;
    //---------------------------------------------------------------------------
    // Status Z-Moves that boost the stats of the user.
    //---------------------------------------------------------------------------
    if (PowerMoveData.statBooster(this.id) || curseEffect === 2) {
      let stats: Id[];
      let stage: number;
      if (curseEffect === 2) {
        [stats, stage] = [["ATTACK"], 1];
      } else {
        [stats, stage] = PowerMoveData.statWithStage(this.id)!;
      }
      const statname = (stats.length > 1) ? "stats" : Stat.get(stats[0]!).name;
      let boost: string;
      switch (stage) {
        case 3: boost = " drastically"; break;
        case 2: boost = " sharply"; break;
        default: boost = "";
      }
      let showAnim = true;
      for (const stat of stats) {
        if (await user.pbCanRaiseStatStage(stat, user)) {
          user.pbRaiseStatStageBasic(stat, stage);
          if (showAnim) {
            await this.battle.pbCommonAnimation("StatUp", user);
            await this.battle.pbDisplay(_INTL("{1} boosted its {2}{3} using its Z-Power!", user.pbThis(), statname, boost));
          }
          showAnim = false;
        }
      }
    //---------------------------------------------------------------------------
    // Status Z-Moves that boosts the user's critical hit ratio.
    //---------------------------------------------------------------------------
    } else if (PowerMoveData.boostsCrit(this.id)) {
      user.effects[PBEffects.CriticalBoost] += 2;
      await this.battle.pbDisplay(_INTL("{1} boosted its critical hit ratio using its Z-Power!", user.pbThis()));
    //---------------------------------------------------------------------------
    // Status Z-Moves that resets the user's lowered stats.
    //---------------------------------------------------------------------------
    } else if (PowerMoveData.resetsStats(this.id) && user.hasLoweredStatStages()) {
      for (const s of Stat.eachBattle()) {
        if (user.stages[s.id]! >= 0) continue;
        user.stages[s.id] = 0;
        user.statsRaisedThisRound = true;
      }
      await this.battle.pbDisplay(_INTL("{1} returned its decreased stats to normal using its Z-Power!", user.pbThis()));
    //---------------------------------------------------------------------------
    // Status Z-Moves that fully restores HP for the user.
    //---------------------------------------------------------------------------
    } else if (PowerMoveData.healsSelf(this.id) || curseEffect === 1) {
      if (user.hp < user.totalhp) {
        await user.pbRecoverHP(user.totalhp, false);
        await this.battle.pbDisplay(_INTL("{1} restored its HP using its Z-Power!", user.pbThis()));
      }
    //---------------------------------------------------------------------------
    // Status Z-Moves that fully restores HP for an incoming Pokemon.
    //---------------------------------------------------------------------------
    } else if (PowerMoveData.healsSwitch(this.id)) {
      this.battle.positions[user.index]!.effects[PBEffects.ZHeal] = true;
    //---------------------------------------------------------------------------
    // Status Z-Moves that cause misdirection.
    //---------------------------------------------------------------------------
    } else if (PowerMoveData.focusUser(this.id)) {
      await this.battle.pbDisplay(_INTL("{1} became the center of attention using its Z-Power!", user.pbThis()));
      user.effects[PBEffects.FollowMe] = 1;
      for (const b of user.allAllies()) { // eachAlly
        if (b.effects[PBEffects.FollowMe] < user.effects[PBEffects.FollowMe]) continue;
        user.effects[PBEffects.FollowMe] = b.effects[PBEffects.FollowMe] + 1;
      }
    }
  },
};

type Methods = typeof methods;
declare module "../move/Move" {
  interface Move extends Methods {}
}
Object.assign(Move.prototype, methods);
