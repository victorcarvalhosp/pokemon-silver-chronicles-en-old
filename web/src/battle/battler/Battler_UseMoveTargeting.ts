// Port of Data/Scripts/011_Battle/002_Battler/008_Battler_UseMoveTargeting.rb, with:
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb:359): pbFindTargets
//   and pbChangeTargets re-check Mold Breaker/Mycelium Might/Ability Shield.
// Alias chains: pbFindTargets = Gen 9( core ); pbChangeTargets = Gen 9( core ).

import { _INTL, type Id } from "../../data/gameData/gameData";
import type { BattleChoice } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battler } from "./Battler";

const methods = {
  //=============================================================================
  // Get move's user
  //=============================================================================
  pbFindUser(this: Battler, _choice: BattleChoice, _move: Move): Battler {
    return this;
  },

  pbChangeUser(this: Battler, choice: BattleChoice, move: Move, user: Battler): Battler {
    // Snatch
    move.snatched = false;
    if (move.statusMove() && move.canSnatch()) {
      let newUser: Battler | null = null;
      let strength = 100;
      for (const b of this.battle.allBattlers()) {
        if (b.effects[PBEffects.Snatch] === 0 ||
            b.effects[PBEffects.Snatch] >= strength) continue;
        if (b.effects[PBEffects.SkyDrop] >= 0) continue;
        newUser = b;
        strength = b.effects[PBEffects.Snatch];
      }
      if (newUser) {
        user = newUser;
        user.effects[PBEffects.Snatch] = 0;
        move.snatched = true;
        this.battle.moldBreaker = user.hasMoldBreaker();
        choice[3] = -1; // Clear pre-chosen target
      }
    }
    return user;
  },

  //=============================================================================
  // Get move's default target(s)
  //=============================================================================
  pbFindTargets(this: Battler, choice: BattleChoice, move: Move, user: Battler): Battler[] {
    const core = (): Battler[] => {
      const preTarget = choice[3]; // A target that was already chosen
      const targets: Battler[] = [];
      // Get list of targets
      switch (move.pbTarget(user).id as Id) { // Curse can change its target type
        case "NearAlly": {
          const targetBattler = preTarget >= 0 ? this.battle.battlers[preTarget] : null;
          if (!this.pbAddTarget(targets, user, targetBattler, move)) {
            this.pbAddTargetRandomAlly(targets, user, move);
          }
          break;
        }
        case "UserOrNearAlly": {
          const targetBattler = preTarget >= 0 ? this.battle.battlers[preTarget] : null;
          if (!this.pbAddTarget(targets, user, targetBattler, move, true, true)) {
            this.pbAddTarget(targets, user, user, move, true, true);
          }
          break;
        }
        case "AllAllies":
          for (const b of this.battle.allSameSideBattlers(user.index)) {
            if (b.index !== user.index) this.pbAddTarget(targets, user, b, move, false, true);
          }
          break;
        case "UserAndAllies":
          this.pbAddTarget(targets, user, user, move, true, true);
          for (const b of this.battle.allSameSideBattlers(user.index)) this.pbAddTarget(targets, user, b, move, false, true);
          break;
        case "NearFoe":
        case "NearOther": {
          const targetBattler = preTarget >= 0 ? this.battle.battlers[preTarget] : null;
          if (!this.pbAddTarget(targets, user, targetBattler, move)) {
            if (preTarget >= 0 && !user.opposes(preTarget)) {
              this.pbAddTargetRandomAlly(targets, user, move);
            } else {
              this.pbAddTargetRandomFoe(targets, user, move);
            }
          }
          break;
        }
        case "RandomNearFoe":
          this.pbAddTargetRandomFoe(targets, user, move);
          break;
        case "AllNearFoes":
          for (const b of this.battle.allOtherSideBattlers(user.index)) this.pbAddTarget(targets, user, b, move);
          break;
        case "Foe":
        case "Other": {
          const targetBattler = preTarget >= 0 ? this.battle.battlers[preTarget] : null;
          if (!this.pbAddTarget(targets, user, targetBattler, move, false)) {
            if (preTarget >= 0 && !user.opposes(preTarget)) {
              this.pbAddTargetRandomAlly(targets, user, move, false);
            } else {
              this.pbAddTargetRandomFoe(targets, user, move, false);
            }
          }
          break;
        }
        case "AllFoes":
          for (const b of this.battle.allOtherSideBattlers(user.index)) this.pbAddTarget(targets, user, b, move, false);
          break;
        case "AllNearOthers":
          for (const b of this.battle.allBattlers()) this.pbAddTarget(targets, user, b, move);
          break;
        case "AllBattlers":
          for (const b of this.battle.allBattlers()) this.pbAddTarget(targets, user, b, move, false, true);
          break;
        default:
          // Used by Counter/Mirror Coat/Metal Burst/Bide
          move.pbAddTarget(targets, user); // Move-specific pbAddTarget, not the def below
          break;
      }
      return targets;
    };
    const targets = core();
    // Generation 9 Pack: initial checks for effects that would ignore abilities.
    if (targets.length > 0) {
      this.battle.moldBreaker = user.hasMoldBreaker() || (move.statusMove() && user.hasActiveAbility("MYCELIUMMIGHT"));
      if (targets[0]!.hasActiveItem("ABILITYSHIELD")) this.battle.moldBreaker = false;
    }
    return targets;
  },

  //=============================================================================
  // Redirect attack to another target
  //=============================================================================
  async pbChangeTargets(this: Battler, move: Move, user: Battler, targets: Battler[]): Promise<Battler[]> {
    const core = async (): Promise<Battler[]> => {
      const targetData = move.pbTarget(user);
      if (this.battle.switching) return targets; // For Pursuit interrupting a switch
      if (move.cannotRedirect() || move.targetsPosition()) return targets;
      if (!targetData.canTargetOneFoe() || targets.length !== 1) return targets;
      await move.pbModifyTargets(targets, user); // For Dragon Darts
      if (user.hasActiveAbility(["PROPELLERTAIL", "STALWART"])) return targets;
      const priority = this.battle.pbPriority(true);
      const nearOnly = !targetData.canChooseDistantTarget();
      // Spotlight (takes priority over Follow Me/Rage Powder/Lightning Rod/Storm Drain)
      let newTarget: Battler | null = null;
      let strength = 100; // Lower strength takes priority
      for (const b of priority) {
        if (b.fainted() || b.effects[PBEffects.SkyDrop] >= 0) continue;
        if (b.effects[PBEffects.Spotlight] === 0 ||
            b.effects[PBEffects.Spotlight] >= strength) continue;
        if (!b.opposes(user)) continue;
        if (nearOnly && !b.near(user)) continue;
        newTarget = b;
        strength = b.effects[PBEffects.Spotlight];
      }
      if (newTarget) {
        PBDebug.log(`[Move target changed] ${newTarget.pbThis()}'s Spotlight made it the target`);
        targets = [];
        this.pbAddTarget(targets, user, newTarget, move, nearOnly);
        return targets;
      }
      // Follow Me/Rage Powder (takes priority over Lightning Rod/Storm Drain)
      newTarget = null;
      strength = 100; // Lower strength takes priority
      for (const b of priority) {
        if (b.fainted() || b.effects[PBEffects.SkyDrop] >= 0) continue;
        if (b.effects[PBEffects.RagePowder] && !user.affectedByPowder()) continue;
        if (b.effects[PBEffects.FollowMe] === 0 ||
            b.effects[PBEffects.FollowMe] >= strength) continue;
        if (!b.opposes(user)) continue;
        if (nearOnly && !b.near(user)) continue;
        newTarget = b;
        strength = b.effects[PBEffects.FollowMe];
      }
      if (newTarget) {
        PBDebug.log(`[Move target changed] ${newTarget.pbThis()}'s Follow Me/Rage Powder made it the target`);
        targets = [];
        this.pbAddTarget(targets, user, newTarget, move, nearOnly);
        return targets;
      }
      // Lightning Rod
      targets = await this.pbChangeTargetByAbility("LIGHTNINGROD", "ELECTRIC", move, user, targets, priority, nearOnly);
      // Storm Drain
      targets = await this.pbChangeTargetByAbility("STORMDRAIN", "WATER", move, user, targets, priority, nearOnly);
      return targets;
    };
    targets = await core();
    // Generation 9 Pack: initial checks for effects that would ignore abilities.
    if (targets.length > 0) {
      this.battle.moldBreaker = user.hasMoldBreaker() || (move.statusMove() && user.hasActiveAbility("MYCELIUMMIGHT"));
      if (targets[0]!.hasActiveItem("ABILITYSHIELD")) this.battle.moldBreaker = false;
    }
    return targets;
  },

  async pbChangeTargetByAbility(this: Battler, drawingAbility: Id, drawnType: Id, move: Move, user: Battler,
    targets: Battler[], priority: Battler[], nearOnly: boolean): Promise<Battler[]> {
    if (move.calcType !== drawnType) return targets;
    if (targets[0]!.hasActiveAbility(drawingAbility)) return targets;
    for (const b of priority) {
      if (b.index === user.index || b.index === targets[0]!.index) continue;
      if (!b.hasActiveAbility(drawingAbility)) continue;
      if (nearOnly && !b.near(user)) continue;
      await this.battle.pbShowAbilitySplash(b);
      targets.length = 0; // targets.clear
      this.pbAddTarget(targets, user, b, move, nearOnly);
      if (Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("{1} took the attack!", b.pbThis()));
      } else {
        await this.battle.pbDisplay(_INTL("{1} took the attack with its {2}!", b.pbThis(), b.abilityName()));
      }
      await this.battle.pbHideAbilitySplash(b);
      break;
    }
    return targets;
  },

  //=============================================================================
  // Register target
  //=============================================================================
  pbAddTarget(this: Battler, targets: Battler[], user: Battler, target: Battler | null | undefined, move: Move,
    nearOnly = true, allowUser = false): boolean {
    if (!target || (target.fainted() && !move.targetsPosition())) return false;
    if (!allowUser && target === user) return false;
    if (nearOnly && !user.near(target) && target !== user) return false;
    for (const b of targets) if (b.index === target.index) return true; // Already added
    targets.push(target);
    return true;
  },

  pbAddTargetRandomAlly(this: Battler, targets: Battler[], user: Battler, move: Move, nearOnly = true): void {
    const choices: Battler[] = [];
    for (const b of user.allAllies()) {
      if (nearOnly && !user.near(b)) continue;
      this.pbAddTarget(choices, user, b, move, nearOnly);
    }
    if (choices.length > 0) {
      this.pbAddTarget(targets, user, choices[this.battle.pbRandom(choices.length)], move, nearOnly);
    }
  },

  pbAddTargetRandomFoe(this: Battler, targets: Battler[], user: Battler, move: Move, nearOnly = true): void {
    const choices: Battler[] = [];
    for (const b of user.allOpposing()) {
      if (nearOnly && !user.near(b)) continue;
      this.pbAddTarget(choices, user, b, move, nearOnly);
    }
    if (choices.length > 0) {
      this.pbAddTarget(targets, user, choices[this.battle.pbRandom(choices.length)], move, nearOnly);
    }
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
