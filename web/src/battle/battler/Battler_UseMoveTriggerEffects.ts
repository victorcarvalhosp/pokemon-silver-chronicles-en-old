// Port of Data/Scripts/011_Battle/002_Battler/010_Battler_UseMoveTriggerEffects.rb, with:
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb:390): pbEffectsAfterMove
//   (Charge ends after an Electric move; Drowsy/Frostbite curing), :417
//   pbEffectsOnMakingHit (Rage Fist counter, Basculin recoil evolution).
// - ZUD Mechanics ([004] Battle_Battler/Battler_Overrides.rb:229):
//   pbEffectsOnMakingHit (Grudge/Destiny Bond with Power Moves and Dynamax);
//   [009] Max Raid/Raid_Battle_Overrides.rb:27 pbEffectsAfterMove (deferred hook).
// Alias chains: pbEffectsOnMakingHit = ZUD( Gen 9( core ) );
// pbEffectsAfterMove = ZUD Max Raid( Gen 9( core ) ).

import { _INTL } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battler } from "./Battler";

const methods = {
  //=============================================================================
  // Effect per hit
  //=============================================================================
  async pbEffectsOnMakingHit(this: Battler, move: Move, user: Battler, target: Battler): Promise<void> {
    // ZUD Mechanics: Grudge lowers the PP of the base move if a Max Move was
    // used, and fails on Z-Moves. Destiny Bond fails to apply on a Dynamax
    // Pokémon.
    if (target.opposes(user)) {
      if (target.effects[PBEffects.Grudge] && target.fainted()) {
        if (move.zMove()) target.effects[PBEffects.Grudge] = false;
        if (move.maxMove() && user.dynamax()) {
          const baseMove = user.baseMoves[this.powerIndex] as Move;
          user.pbSetPP(move, 0);
          user.pbSetPP(baseMove, 0);
          await this.battle.pbDisplay(_INTL("{1}'s {2} lost all of its PP due to the grudge!",
            user.pbThis(), baseMove.name));
          target.effects[PBEffects.Grudge] = false;
        }
      }
      if (target.effects[PBEffects.DestinyBond] && user.dynamax()) {
        target.effects[PBEffects.DestinyBond] = false;
      }
    }
    if (target.damageState.calcDamage > 0 && !target.damageState.substitute) {
      // Target's ability
      if (target.abilityActive(true)) {
        const oldHP = user.hp;
        await AbilityEffects.triggerOnBeingHit(target.ability, user, target, move, this.battle);
        if (user.hp < oldHP) await user.pbItemHPHealCheck();
      }
      // Cramorant - Gulp Missile
      if (target.isSpecies("CRAMORANT") && target.abilityId === "GULPMISSILE" &&
          target.form > 0 && !target.effects[PBEffects.Transform]) {
        const oldHP = user.hp;
        // NOTE: Strictly speaking, an attack animation should be shown (the
        //       target Cramorant attacking the user) and the ability splash
        //       shouldn't be shown.
        await this.battle.pbShowAbilitySplash(target);
        if (await user.takesIndirectDamageAsync(Scene.USE_ABILITY_SPLASH)) {
          await this.battle.scene.pbDamageAnimation(user);
          await user.pbReduceHP(Math.floor(user.totalhp / 4), false);
        }
        switch (target.form) {
          case 1: // Gulping Form
            await user.pbLowerStatStageByAbility("DEFENSE", 1, target, false);
            break;
          case 2: // Gorging Form
            if (target.pbCanParalyze(user, false)) await target.pbParalyze(user);
            break;
        }
        await this.battle.pbHideAbilitySplash(target);
        if (user.hp < oldHP) await user.pbItemHPHealCheck();
      }
      // User's ability
      if (user.abilityActive(true)) {
        await AbilityEffects.triggerOnDealingHit(user.ability, user, target, move, this.battle);
        await user.pbItemHPHealCheck();
      }
      // Target's item
      if (target.itemActive(true)) {
        const oldHP = user.hp;
        await ItemEffects.triggerOnBeingHit(target.item, user, target, move, this.battle);
        if (user.hp < oldHP) await user.pbItemHPHealCheck();
      }
    }
    if (target.opposes(user)) {
      // Rage
      if (target.effects[PBEffects.Rage] && !target.fainted() &&
          await target.pbCanRaiseStatStage("ATTACK", target)) {
        await this.battle.pbDisplay(_INTL("{1}'s rage is building!", target.pbThis()));
        await target.pbRaiseStatStage("ATTACK", 1, target);
      }
      // Beak Blast
      if (target.effects[PBEffects.BeakBlast]) {
        PBDebug.log(`[Lingering effect] ${target.pbThis()}'s Beak Blast`);
        // NOTE: Ruby passes self (a battler) as pbCanBurn?'s move argument (preserved).
        if (move.pbContactMove(user) && user.affectedByContactEffect() &&
            target.pbCanBurn(user, false, this as unknown as Move)) {
          await target.pbBurn(user);
        }
      }
      // Shell Trap (make the trapper move next if the trap was triggered)
      if (target.effects[PBEffects.ShellTrap] && move.physicalMove() &&
          this.battle.choices[target.index]![0] === "UseMove" && !target.movedThisRound() &&
          target.damageState.hpLost > 0 && !target.damageState.substitute) {
        target.tookPhysicalHit = true;
        target.effects[PBEffects.MoveNext] = true;
        target.effects[PBEffects.Quash] = 0;
      }
      // Grudge
      if (target.effects[PBEffects.Grudge] && target.fainted()) {
        user.pbSetPP(move, 0);
        await this.battle.pbDisplay(_INTL("{1}'s {2} lost all of its PP due to the grudge!",
          user.pbThis(), move.name));
      }
      // Destiny Bond (recording that it should apply)
      if (target.effects[PBEffects.DestinyBond] && target.fainted() &&
          user.effects[PBEffects.DestinyBondTarget] < 0) {
        user.effects[PBEffects.DestinyBondTarget] = target.index;
      }
    }
    // Generation 9 Pack: powers up Rage Fist when struck; counts recoil damage
    // for Basculin's evolution.
    if (target.damageState.calcDamage > 0 && !target.damageState.substitute) {
      this.battle.pbAddRageHit(target);
    }
    if (user.pbOwnedByPlayer() && !user.fainted() && move.recoilMove()) {
      // defined?(move.pbRecoilDamage(user, target)): whether the move has the method
      const recoilMove = move as unknown as { pbRecoilDamage?: (user: Battler, target: Battler) => number };
      const recoil = typeof recoilMove.pbRecoilDamage === "function" ? recoilMove.pbRecoilDamage(user, target) : 0;
      user.pokemon!.recoilEvolution(recoil);
    }
  },

  //=============================================================================
  // Effects after all hits (i.e. at end of move usage)
  //=============================================================================
  async pbEffectsAfterMove(this: Battler, user: Battler, targets: Battler[], move: Move, numHits: number): Promise<void> {
    // Generation 9 Pack: the Charge effect ends only after using an Electric-
    // type move; moves that electrocute heal Drowsiness; moves that thaw heal
    // Frostbite.
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9) {
      if (move.calcType === "ELECTRIC") user.effects[PBEffects.Charge] = 0;
    }
    if (move.damagingMove()) {
      if (user.status === "DROWSY" && move.electrocuteUser()) {
        await user.pbCureStatus(false);
        await this.battle.pbDisplay(_INTL("{1} was shocked wide awake!", user.pbThis()));
      }
      if (user.status === "FROSTBITE" && move.thawsUser()) {
        await user.pbCureStatus(false);
        await this.battle.pbDisplay(_INTL("{1} warmed up!", user.pbThis()));
      }
      for (const b of targets) {
        if (b.damageState.unaffected || b.damageState.substitute) continue;
        if (b.status === "DROWSY" && move.electrocuteUser()) await b.pbCureStatus();
        if (b.status === "FROSTBITE" && move.thawsUser()) await b.pbCureStatus();
      }
    }
    // Defrost
    if (move.damagingMove()) {
      for (const b of targets) {
        if (b.damageState.unaffected || b.damageState.substitute) continue;
        if (b.status !== "FROZEN") continue;
        // NOTE: Non-Fire-type moves that thaw the user will also thaw the
        //       target (in Gen 6+).
        if (move.calcType === "FIRE" || (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && move.thawsUser())) {
          await b.pbCureStatus();
        }
      }
    }
    // Destiny Bond
    // NOTE: Although Destiny Bond is similar to Grudge, they don't apply at
    //       the same time (however, Destiny Bond does check whether it's going
    //       to trigger at the same time as Grudge).
    if (user.effects[PBEffects.DestinyBondTarget] >= 0 && !user.fainted()) {
      const dbName = this.battle.battlers[user.effects[PBEffects.DestinyBondTarget]]!.pbThis();
      await this.battle.pbDisplay(_INTL("{1} took its attacker down with it!", dbName));
      await user.pbReduceHP(user.hp, false);
      await user.pbItemHPHealCheck();
      await user.pbFaint();
      await this.battle.pbJudgeCheckpoint(user);
    }
    // User's ability
    if (user.abilityActive()) {
      await AbilityEffects.triggerOnEndOfUsingMove(user.ability, user, targets, move, this.battle);
    }
    if (!user.fainted() && !user.effects[PBEffects.Transform] &&
        !this.battle.pbAllFainted(user.idxOpposingSide())) {
      // Greninja - Battle Bond
      if (user.isSpecies("GRENINJA") && user.abilityId === "BATTLEBOND" &&
          !this.battle.battleBond[user.index & 1]![user.pokemonIndex]) {
        let numFainted = 0;
        for (const b of targets) if (b.damageState.fainted) numFainted += 1;
        if (numFainted > 0 && user.form === 1) {
          this.battle.battleBond[user.index & 1]![user.pokemonIndex] = true;
          await this.battle.pbDisplay(_INTL("{1} became fully charged due to its bond with its Trainer!", user.pbThis()));
          await this.battle.pbShowAbilitySplash(user, true);
          await this.battle.pbHideAbilitySplash(user);
          await user.pbChangeForm(2, _INTL("{1} became Ash-Greninja!", user.pbThis()));
        }
      }
      // Cramorant = Gulp Missile
      // (move.chargingTurn is Battle::Move::TwoTurnMove's attr_reader; Dive is one)
      if (user.isSpecies("CRAMORANT") && user.abilityId === "GULPMISSILE" && user.form === 0 &&
          ((move.id === "SURF" && numHits > 0) ||
           (move.id === "DIVE" && (move as unknown as { chargingTurn?: boolean }).chargingTurn))) {
        // NOTE: Intentionally no ability splash or message here.
        await user.pbChangeForm(user.hp > Math.floor(user.totalhp / 2) ? 1 : 2, null);
      }
    }
    // Room Service
    if (move.function === "StartSlowerBattlersActFirst" && this.battle.field.effects[PBEffects.TrickRoom] > 0) {
      for (const b of this.battle.allBattlers()) {
        if (!b.hasActiveItem("ROOMSERVICE")) continue;
        if (!(await b.pbCanLowerStatStage("SPEED"))) continue;
        await this.battle.pbCommonAnimation("UseItem", b);
        await b.pbLowerStatStage("SPEED", 1, null);
        await b.pbConsumeItem();
      }
    }
    // Consume user's Gem
    if (user.effects[PBEffects.GemConsumed]) {
      // NOTE: The consume animation and message for Gems are shown immediately
      //       after the move's animation, but the item is only consumed now.
      await user.pbConsumeItem();
    }
    const switchedBattlers: number[] = []; // Indices of battlers that were switched out somehow
    // Target switching caused by Roar, Whirlwind, Circle Throw, Dragon Tail
    await move.pbSwitchOutTargetEffect(user, targets, numHits, switchedBattlers);
    // Target's item, user's item, target's ability (all negated by Sheer Force)
    if (!(user.hasActiveAbility("SHEERFORCE") && move.addlEffect > 0)) {
      await this.pbEffectsAfterMove2(user, targets, move, numHits, switchedBattlers);
    }
    // Some move effects that need to happen here, i.e. user switching caused by
    // U-turn/Volt Switch/Baton Pass/Parting Shot, Relic Song's form changing,
    // Fling/Natural Gift consuming item.
    if (!switchedBattlers.includes(user.index)) {
      await move.pbEndOfMoveUsageEffect(user, targets, numHits, switchedBattlers);
    }
    // User's ability/item that switches the user out (all negated by Sheer Force)
    if (!(user.hasActiveAbility("SHEERFORCE") && move.addlEffect > 0)) {
      await this.pbEffectsAfterMove3(user, targets, move, numHits, switchedBattlers);
    }
    if (numHits > 0) {
      for (const b of this.battle.allBattlers()) await b.pbItemEndOfMoveCheck();
    }
    // ZUD Mechanics (Max Raid): special Max Raid effects after move usage.
    if (this.battle.raidBattle && move.damagingMove()) {
      // Deferred: Malicious Wave, Max Raid shields and Invigorating Wave
      // (ZUD Mechanics/[009] Max Raid/Raid_Battle_Overrides.rb:30-140).
    }
  },

  /** Everything in this method is negated by Sheer Force. */
  async pbEffectsAfterMove2(this: Battler, user: Battler, targets: Battler[], move: Move, numHits: number,
    switchedBattlers: number[]): Promise<void> {
    // Target's held item (Eject Button, Red Card, Eject Pack)
    for (const b of this.battle.pbPriority(true)) {
      if (targets.some((targetB) => targetB.index === b.index) &&
          !b.damageState.unaffected && b.damageState.calcDamage > 0 && b.itemActive()) {
        await ItemEffects.triggerAfterMoveUseFromTarget(b.item, b, user, move, switchedBattlers, this.battle);
      }
      // Target's Eject Pack
      if (switchedBattlers.length === 0 && b.index !== user.index && await b.pbItemOnStatDropped(user)) {
        switchedBattlers.push(b.index);
      }
    }
    // User's held item (Life Orb, Shell Bell, Throat Spray, Eject Pack)
    if (!switchedBattlers.includes(user.index) && user.itemActive()) { // Only if user hasn't switched out
      await ItemEffects.triggerAfterMoveUseFromUser(user.item, user, targets, move, numHits, this.battle);
    }
    // Target's ability (Berserk, Color Change, Emergency Exit, Pickpocket, Wimp Out)
    for (const b of this.battle.pbPriority(true)) {
      if (targets.some((targetB) => targetB.index === b.index) &&
          !b.damageState.unaffected && !switchedBattlers.includes(b.index) && b.abilityActive()) {
        await AbilityEffects.triggerAfterMoveUseFromTarget(b.ability, b, user, move, switchedBattlers, this.battle);
      }
      // Target's Emergency Exit, Wimp Out (including for Pokémon hurt by Flame Burst)
      if (switchedBattlers.length === 0 && move.damagingMove() &&
          b.index !== user.index && await b.pbAbilitiesOnDamageTaken(user)) {
        switchedBattlers.push(b.index);
      }
    }
  },

  /** Everything in this method is negated by Sheer Force. */
  async pbEffectsAfterMove3(this: Battler, user: Battler, _targets: Battler[], move: Move, _numHits: number,
    switchedBattlers: number[]): Promise<void> {
    // User's held item that switches it out (Eject Pack)
    if (switchedBattlers.length === 0 && await user.pbItemOnStatDropped(user)) {
      switchedBattlers.push(user.index);
    }
    // User's ability (Emergency Exit, Wimp Out)
    if (switchedBattlers.length === 0 && move.damagingMove() && await user.pbAbilitiesOnDamageTaken(user)) {
      switchedBattlers.push(user.index);
    }
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
