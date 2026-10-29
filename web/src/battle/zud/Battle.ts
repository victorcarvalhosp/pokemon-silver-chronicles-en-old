// Port of Plugins/ZUD Mechanics/[003] Battle/Battle.rb:64-178: the Z-Move,
// Ultra Burst and Dynamax eligibility checks (pbCanZMove?, pbCanUltraBurst?,
// pbCanDynamax?) and the mechanics themselves (pbUltraBurst, pbDynamax).
// The rest of that file (Z-Rings, Dynamax Bands, registering the mechanics,
// pbAttackPhaseZMoves/UltraBurst/Dynamax) is in battle/Battle_ActionOther.ts
// and battle/Battle_AttackPhase.ts.

import { _INTL } from "../../data/gameData/gameData";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import { Input } from "../../rgss/Input";
import { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { DEBUG } from "../../core/debug"; // $DEBUG

/** The scene's @sprites (Battle::Scene; the debug scenes have none). */
type SceneWithSprites = { sprites?: Record<string, { x: number; y: number } | undefined> };

const methods = {
  //-----------------------------------------------------------------------------
  // Eligibility checks.
  //-----------------------------------------------------------------------------
  /** pbCanZMove? */
  pbCanZMove(this: Battle, idxBattler: number): boolean {
    const battler = this.battlers[idxBattler]!;
    if (G.gameSwitches.get(Settings.NO_Z_MOVE)) return false; // No Z-Moves if switch enabled.
    if (!battler.hasZMove()) return false; // No Z-Moves if ineligible.
    if (DEBUG && Input.press(Input.CTRL) && !battler.wild()) return true; // Allows Z-Moves with CTRL in Debug.
    if (battler.effects[PBEffects.SkyDrop] >= 0) return false; // No Z-Moves if in Sky Drop.
    if (!this.pbHasZRing(idxBattler)) return false; // No Z-Moves if no Z-Ring.
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return this.zMove[side]![owner] === -1;
  },

  /** pbCanUltraBurst? */
  pbCanUltraBurst(this: Battle, idxBattler: number): boolean {
    const battler = this.battlers[idxBattler]!;
    if (G.gameSwitches.get(Settings.NO_ULTRA_BURST)) return false; // No Ultra Burst if switch enabled.
    if (!battler.hasUltra()) return false; // No Ultra Burst if ineligible.
    if (DEBUG && Input.press(Input.CTRL) && !battler.wild()) return true; // Allows Ultra Burst with CTRL in Debug.
    if (battler.effects[PBEffects.SkyDrop] >= 0) return false; // No Ultra Burst if in Sky Drop.
    if (!this.pbHasZRing(idxBattler)) return false; // No Ultra Burst if no Z-Ring.
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return this.ultraBurst[side]![owner] === -1;
  },

  /** pbCanDynamax? */
  pbCanDynamax(this: Battle, idxBattler: number): boolean {
    const battler = this.battlers[idxBattler]!;
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    const mapData = G.gameMap ? MapMetadata.tryGet(G.gameMap.mapId) : null;
    const powerspot = !!G.gameMap && (mapData?.hasFlag("PowerSpot") ?? false);
    const eternaspot = !!G.gameMap && (mapData?.hasFlag("EternaSpot") ?? false);
    const anyMapAllowed = G.gameSwitches.get(Settings.DYNAMAX_ANY_MAP);
    const wildAllowed = G.gameSwitches.get(Settings.CAN_DYNAMAX_WILD);
    if (G.gameSwitches.get(Settings.NO_DYNAMAX)) return false; // No Dynamax if switch enabled.
    if (!battler.hasDynamax()) return false; // No Dynamax if ineligible.
    if (DEBUG && Input.press(Input.CTRL) && !battler.wild()) return true; // Allows Dynamax with CTRL in Debug.
    if (this.dynamax[side]![owner] !== -1) return false; // No Dynamax if already used.
    if (battler.effects[PBEffects.SkyDrop] >= 0) return false; // No Dynamax if in Sky Drop.
    if (!this.pbHasDynamaxBand(idxBattler)) return false; // No Dynamax if no Dynamax Band.
    if (battler.canEmax() && !eternaspot) return false; // No Eternamax if not on an Eternaspot map.
    if (this.raidBattle) return true; // Allows Dynamax in Max Raid battles.
    if (this.wildBattle() && !wildAllowed) return false; // No Dynamax in wild battles unless switch is on.
    if (!powerspot && !anyMapAllowed) return false; // No Dynamax if not on a Dynamax map.
    return this.dynamax[side]![owner] === -1;
  },

  //-----------------------------------------------------------------------------
  // Uses the eligible battle mechanic.
  //-----------------------------------------------------------------------------
  async pbUltraBurst(this: Battle, idxBattler: number): Promise<void> {
    const battler = this.battlers[idxBattler];
    if (!battler || !battler.pokemon) return;
    if (!battler.hasUltra() || battler.ultra()) return;
    if (battler.pbOwnedByPlayer()) G.stats.ultraBurstCount += 1;
    const triggers = ["ultra", "ultra" + battler.species];
    for (const t of battler.pokemon.types()) triggers.push("ultra" + t);
    await this.scene.pbDeluxeTriggers?.(idxBattler, null, triggers);
    const oldAbility = battler.abilityId;
    if (battler.hasActiveAbility("ILLUSION")) {
      await AbilityEffects.triggerOnBeingHit(battler.ability, null as unknown as Battler, battler,
        null as unknown as Move, this);
    }
    await this.pbDisplay(_INTL("Bright light is about to burst out of {1}!", battler.pbThis(true)));
    if (Settings.SHOW_ZUD_ANIM && G.pokemonSystem.battlescene === 0) {
      await this.scene.pbShowUltraBurst?.(idxBattler);
      battler.pokemon.makeUltra();
      battler.form = battler.pokemon.form;
      this.scene.pbChangePokemon(battler, battler.pokemon);
    } else {
      await this.scene.pbRevertBattlerStart?.(idxBattler);
      battler.pokemon.makeUltra();
      battler.form = battler.pokemon.form;
      this.scene.pbChangePokemon(battler, battler.pokemon);
      await this.scene.pbRevertBattlerEnd?.();
    }
    battler.pbUpdate(true);
    this.scene.pbRefreshOne(idxBattler);
    await this.pbDisplay(_INTL("{1} regained its true power with Ultra Burst!", battler.pbThis()));
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    this.ultraBurst[side]![owner] = -2;
    await battler.pbOnLosingAbility(oldAbility);
    await battler.pbTriggerAbilityOnGainingIt();
    if (Settings.RECALCULATE_TURN_ORDER_AFTER_MEGA_EVOLUTION) this.pbCalculatePriority(false, [idxBattler]);
  },

  async pbDynamax(this: Battle, idxBattler: number): Promise<void> {
    const battler = this.battlers[idxBattler];
    if (!battler || !battler.pokemon) return;
    if (!battler.hasDynamax() || battler.dynamax()) return;
    if (this.choices[idxBattler]![2] === this.struggle) return;
    if (battler.pbOwnedByPlayer()) G.stats.dynamaxCount += 1;
    let triggers = ["dynamax", "dynamax" + battler.species];
    for (const t of battler.pokemon.types()) triggers.push("dynamax" + t);
    if (battler.canGmax()) {
      if (battler.pbOwnedByPlayer()) G.stats.gigantamaxCount += 1;
      triggers = [...triggers, "gmax", "gmax" + battler.species];
      for (const t of battler.pokemon.types()) triggers.push("gmax" + t);
    }
    await this.scene.pbDeluxeTriggers?.(idxBattler, null, triggers);
    battler.effects[PBEffects.Dynamax] = Settings.DYNAMAX_TURNS;
    battler.effects[PBEffects.NonGMaxForm] = battler.form;
    battler.effects[PBEffects.Encore] = 0;
    battler.effects[PBEffects.Disable] = 0;
    battler.effects[PBEffects.Substitute] = 0;
    battler.effects[PBEffects.Torment] = false;
    // Alcremie reverts to form 0 only for the duration of Gigantamax.
    if (battler.isSpecies("ALCREMIE") && battler.gmaxFactor()) battler.pokemon.form = 0;
    // Cramorant resets its form for some reason.
    if (battler.isSpecies("CRAMORANT")) battler.pokemon.form = 0;
    const changePoke = ((battler.effects[PBEffects.TransformPokemon] as Pokemon | null) ?? battler.displayPokemon())!;
    let msg: string | null = null;
    if (Settings.SHOW_ZUD_ANIM && G.pokemonSystem.battlescene === 0) {
      await this.scene.pbShowDynamax?.(idxBattler);
      battler.pokemon.dynamax = true;
      this.scene.pbChangePokemon(idxBattler, changePoke);
    } else {
      const text = battler.canEmax() ? "Eternamax" : battler.canGmax() ? "Gigantamax" : "Dynamax";
      if (battler.wild()) {
        await this.pbDisplay(_INTL("{1} surrounded itself in {2} energy!", battler.pbThis(), text));
        battler.pokemon.dynamax = true;
        await this.scene.pbRevertDynamax?.(idxBattler, false);
        msg = _INTL("{1} entered its {2} form!", battler.pbThis(), text);
      } else {
        const trainerName = this.pbGetOwnerName(idxBattler);
        await this.pbDisplay(_INTL("{1} recalled {2}!", trainerName, battler.pbThis(true)));
        // NOTE: Ruby reads @scene.sprites (Battle::Scene only; the debug scenes
        //       have no sprites and raise NoMethodError here).
        const sprite = (this.scene as unknown as SceneWithSprites).sprites?.[`pokemon_${idxBattler}`];
        const xpos = sprite?.x ?? 0;
        const ypos = sprite?.y ?? 0;
        await this.scene.pbRecall(idxBattler);
        await this.pbDisplay(_INTL("{1}'s ball surges with {2} energy!", battler.pbThis(), text));
        if (this.scene.pbDynamaxSendOut) {
          await this.scene.pbDynamaxSendOut(idxBattler, xpos, ypos); // sets pokemon.dynamax
        } else {
          battler.pokemon.dynamax = true; // what pbDynamaxSendOut does, for scenes without it
        }
      }
    }
    const oldhp = battler.hp;
    battler.pbUpdate();
    this.scene.pbRefreshOne(idxBattler);
    await this.scene.pbHPChanged(battler, oldhp);
    if (msg) await this.pbDisplay(msg);
    battler.pokemon.reversion = true;
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    this.dynamax[side]![owner] = -2;
  },
};

type Methods = typeof methods;
declare module "../battle/Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
