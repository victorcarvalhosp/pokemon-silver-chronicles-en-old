// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Battle.rb:375-500, what
// it adds to every battle: Battle#raid_EndOfRound / #raid_EndOfRound2 (called
// from Battle_EndOfRoundPhase.ts where ZUD's pbEndOfRoundPhase calls them),
// Battle#raid_ResetPokemon, and Battle::CatchAndStoreMixin#pbStorePokemon's
// Max Lair/Max Raid branches (raidStorePokemon, called from
// CatchAndStoreMixin.ts). They're functions of the battle, so the core doesn't
// depend on this folder's set-up. (The RaidBattle class is in Raid_Battle.ts.)
//
// raid_ResetPokemon's rand(5) is Kernel#rand in Ruby; here it goes through
// battle.pbRandom like the rest of the battle.

import { _INTL } from "../../../data/gameData/gameData";
import { G } from "../../../game/globals";
import type { Pokemon } from "../../../game/pokemon/Pokemon";
import { pbSEPlay } from "../../audio";
import type { Battle } from "../../battle/Battle";
import type { Battler } from "../../battler/Battler";
import { PBEffects } from "../../other/PBEffects";
import { inMaxLair, pbDynamaxAdventure } from "./maxLairHooks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DxHash = Record<string, any>;
const dxRules = () => (G.gameTemp.dxRules ?? {}) as DxHash;

/** Battler#eachOpposing: each unfainted foe, checked as it's reached. */
function* eachOpposing(b: Battler): Generator<Battler> {
  for (const p of b.battle.battlers) if (p && !p.fainted() && p.opposes(b.index)) yield p;
}

//===============================================================================
// End of Round additions.
//===============================================================================
//-----------------------------------------------------------------------------
// End of round checks for raid Pokemon.
//-----------------------------------------------------------------------------
/** Battle#raid_EndOfRound(battler) */
export async function raidEndOfRound(battle: Battle, battler: Battler): Promise<void> {
  if (battler.effects[PBEffects.MaxRaidBoss] && battler.effects[PBEffects.KnockOutCount] > 0) {
    //-------------------------------------------------------------------------
    // Tracks Raid Reward bonuses.
    //-------------------------------------------------------------------------
    dxRules().timer_bonus = battler.effects[PBEffects.Dynamax];
    for (const opp of eachOpposing(battler)) {
      if (opp.level >= battler.level + 5) dxRules().fairness_bonus = false;
    }
    //-------------------------------------------------------------------------
    // The Raid Pokemon starts using Max Moves once final round of shields trigger.
    //-------------------------------------------------------------------------
    if (battler.baseMoves.length === 0 && battler.effects[PBEffects.ShieldCounter] <= 0) {
      battler.displayPowerMoves("Max Move");
    }
    //-------------------------------------------------------------------------
    // Raid Shield thresholds for effect damage.
    //-------------------------------------------------------------------------
    if (battler.effects[PBEffects.RaidShield] <= 0 && battler.hp > 1) {
      const shields1 = battler.hp <= Math.floor(battler.totalhp / 2);                         // Activates at 1/2 HP
      const shields2 = battler.hp <= battler.totalhp - Math.floor(battler.totalhp / 5);       // Activates at 4/5ths HP
      if ((battler.effects[PBEffects.ShieldCounter] === 1 && shields1) ||
          (battler.effects[PBEffects.ShieldCounter] === 2 && shields2)) {
        await battle.pbDisplay(_INTL("{1} is getting desperate!\nIts attacks are growing more aggressive!", battler.pbThis()));
        battler.effects[PBEffects.RaidShield] = battler.effects[PBEffects.MaxShieldHP];
        battler.effects[PBEffects.ShieldCounter] -= 1;
        await battle.pbAnimation("REFLECT", battler, battler);
        await battle.scene.pbRaidShield?.(battler);
        battle.scene.pbRefresh();
        await battle.pbDisplay(_INTL("A mysterious barrier appeared in front of {1}!", battler.pbThis(true)));
      }
    }
    //-------------------------------------------------------------------------
    // Hard Mode Bonuses (HP Regeneration).
    //-------------------------------------------------------------------------
    if ((battle as { hardMode?: boolean }).hardMode) {
      if (battler.effects[PBEffects.RaidShield] > 0 &&
          battler.effects[PBEffects.HealBlock] === 0 &&
          battler.hp < battler.totalhp && battler.hp > 1) {
        battler.ignoreDynamax = true;
        await battler.pbRecoverHP(Math.floor(battler.totalhp / 16));
        await battle.pbDisplay(_INTL("{1} regenerated a little HP behind the mysterious barrier!", battler.pbThis()));
      }
    }
  }
}

//-----------------------------------------------------------------------------
// End of round checks for raid battles.
//-----------------------------------------------------------------------------
/** Battle#raid_EndOfRound2(battler) */
export async function raidEndOfRound2(battle: Battle, battler: Battler): Promise<void> {
  if (battler.effects[PBEffects.MaxRaidBoss] && battler.effects[PBEffects.KnockOutCount] > 0) {
    //-------------------------------------------------------------------------
    // Ends raid if timer expires.
    //-------------------------------------------------------------------------
    if (battler.effects[PBEffects.Dynamax] <= 0) {
      battle.scene.pbRefresh();
      await battle.pbDisplayPaused(_INTL("The storm around {1} grew out of control!", battler.pbThis(true)));
      await battle.pbDisplay(_INTL("You were blown out of the den!"));
      pbSEPlay("Battle flee");
      battle.decision = 3;
      if (inMaxLair()) pbDynamaxAdventure().knockouts = 0;
    } else {
      //-----------------------------------------------------------------------
      // Revives any fainted Pokemon in the party at the end of each turn.
      //-----------------------------------------------------------------------
      for (const i of battle.pbParty(0)) {
        if (i && i.fainted()) {
          i.heal();
          pbSEPlay("Anim/Lucky Chant");
          await battle.pbDisplayPaused(_INTL("{1} recovered from fainting!\nIt can be sent back out next turn!", i.name));
        }
      }
      battle.scene.pbRefresh();
    }
  }
}

/** Battle#raid_ResetPokemon(pkmn) */
export function raidResetPokemon(battle: Battle, pkmn: Pokemon): void {
  pkmn.dynamax = false;
  pkmn.calcStats();
  pkmn.reversion = false;
  if (pkmn.dynamaxLvl > 10) {
    pkmn.dynamaxLvl = Math.floor(pkmn.dynamaxLvl / 10);
    pkmn.dynamaxLvl += battle.pbRandom(5);
    if (pkmn.dynamaxLvl > 10) pkmn.dynamaxLvl = 10;
  }
}

//===============================================================================
// Upon capturing a Dynamaxed Pokemon.
//===============================================================================
/**
 * The Max Lair and Max Raid branches of ZUD's pbStorePokemon alias
 * (Raid_Battle.rb:483-495), after its Eternatus check. Returns false when
 * neither applies (Battle::CatchAndStoreMixin stores the Pokémon as usual).
 */
export async function raidStorePokemon(battle: Battle, pkmn: Pokemon): Promise<boolean> {
  if (inMaxLair()) {
    raidResetPokemon(battle, pkmn);
    pkmn.heal();
    pbDynamaxAdventure().addPrize(pkmn);
    await battle.pbDisplay(_INTL("Caught {1}!", pkmn.name));
    await pbDynamaxAdventure().swapPokemon();
    return true;
  } else if (battle.raidBattle) {
    raidResetPokemon(battle, pkmn);
    pkmn.heal();
    pkmn.resetMoves();
    const storedBox = G.storage.pbStoreCaught(pkmn);
    const boxName = battle.peer.pbBoxName(storedBox);
    await battle.pbDisplayPaused(_INTL("{1} has been sent to Box \"{2}\"!", pkmn.name, boxName));
    return true;
  }
  return false;
}
