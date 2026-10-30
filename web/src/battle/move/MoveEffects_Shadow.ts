// Port of the Shadow move classes in
// Data/Scripts/014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb:338-404
// (loaded after 011_Battle, before the plugins; no plugin patches them).
//
// This game's PBS has no Shadow moves (PBS/moves.txt) and no SHADOW type, so
// nothing uses these classes; src/battle/shadowBattleReference.test.ts
// registers Shadow moves to compare them with Ruby.

import { _INTL } from "../../data/gameData/gameData";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Move, registerMoveClass } from "./Move";
import { RecoilMove, WeatherMove } from "./Move_BaseEffects";

//===============================================================================
// Two turn attack. On first turn, halves the HP of all active Pokémon.
// Skips second turn (if successful). (Shadow Half)
//===============================================================================
export class AllBattlersLoseHalfHPUserSkipsNextTurn extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.allBattlers().some((b) => b.hp > 1)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    for (const b of this.battle.allBattlers()) {
      if (b.hp > 1) await b.pbReduceHP(Math.trunc(b.hp / 2), false);
    }
    await this.battle.pbDisplay(_INTL("Each Pokémon's HP was halved!"));
    for (const b of this.battle.allBattlers()) await b.pbItemHPHealCheck();
    user.effects[PBEffects.HyperBeam] = 2;
    user.currentMove = this.id;
  }
}
registerMoveClass("AllBattlersLoseHalfHPUserSkipsNextTurn", AllBattlersLoseHalfHPUserSkipsNextTurn);

//===============================================================================
// User takes recoil damage equal to 1/2 of its current HP. (Shadow End)
//===============================================================================
export class UserLosesHalfHP extends RecoilMove {
  override pbRecoilDamage(_user: Battler, target: Battler): number {
    return rubyRound(target.damageState.totalHPLost / 2.0);
  }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (user.fainted() || target.damageState.unaffected) return;
    // NOTE: This move's recoil is not prevented by Rock Head/Magic Guard.
    let amt = this.pbRecoilDamage(user, target);
    if (amt < 1) amt = 1;
    await user.pbReduceHP(amt, false);
    await this.battle.pbDisplay(_INTL("{1} is damaged by recoil!", user.pbThis()));
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("UserLosesHalfHP", UserLosesHalfHP);

//===============================================================================
// Starts shadow weather. (Shadow Sky)
//===============================================================================
export class StartShadowSkyWeather extends WeatherMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.weatherType = "ShadowSky";
  }
}
registerMoveClass("StartShadowSkyWeather", StartShadowSkyWeather);

//===============================================================================
// Ends the effects of Light Screen, Reflect and Safeguard on both sides.
// (Shadow Shed)
//===============================================================================
export class RemoveAllScreens extends Move {
  override async pbEffectGeneral(_user: Battler): Promise<void> {
    for (const i of this.battle.sides) {
      i.effects[PBEffects.AuroraVeil] = 0;
      i.effects[PBEffects.Reflect] = 0;
      i.effects[PBEffects.LightScreen] = 0;
      i.effects[PBEffects.Safeguard] = 0;
    }
    await this.battle.pbDisplay(_INTL("It broke all barriers!"));
  }
}
registerMoveClass("RemoveAllScreens", RemoveAllScreens);
