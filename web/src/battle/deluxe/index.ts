// Essentials Deluxe's battle extras and Enhanced UI's battle windows, on the
// battle scene. Import this module (once) wherever a BattleScene is created:
// it puts the Battle::Scene methods these plugins add on BattleScene's
// prototype, as Ruby reopens Battle::Scene, and has the scene preload what
// they draw.
//
// - Midbattle scripting (Midbattle_Main.ts): pbDeluxeTriggers, dx_midbattle,
//   pbMidbattleSpeech, midbattle_Battler. A battle runs a script when
//   $game_temp.dx_midbattle is set (Battle_Deluxe.ts's dx_start).
// - Enhanced UI's Move Info / Battle Info windows (EnhancedBattleUI.ts).
// - The Mega Evolution / Primal Reversion cinematics (MegaEvolutionAnim.ts).
// - Graphics: the Mega/Primal forms' sprites and icons (Ruby loads them when
//   the battler changes form), the Enhanced UI windows, the speakers named in
//   the midbattle script.

import { G } from "../../game/globals";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { MultipleForms } from "../../game/pokemon/formHandlers";
import { assetExists } from "../../core/assets";
import { Species } from "../../data/gameData/species";
import { TrainerType } from "../../data/gameData/trainerType";
import { preloadBitmaps } from "../../ui/rpgCache";
import { preloadPokemonIcons } from "../../ui/sprites/pokemonIcon";
import type { Battler } from "../battler/Battler";
import { BattleScene } from "../scene/BattleScene";
import type { FightMenu } from "../scene/menus";
import { battlerBitmapRequest } from "../scene/objects";
import * as EUI from "./EnhancedBattleUI";
import { pbShowMegaEvolution, pbShowPrimalReversion } from "./MegaEvolutionAnim";
import { installMidbattle, type MidbattleMethods } from "./Midbattle_Main";
import { isHash, isSym } from "./rubyData";

export { EssentialsDeluxe } from "./Midbattle_Config";
export { sym } from "./rubyData";
export { DeluxeBattle } from "./Battle_Deluxe";

//===============================================================================
// Midbattle scripting
//===============================================================================
installMidbattle(BattleScene.prototype);

//===============================================================================
// Enhanced UI's battle windows
//===============================================================================
const enhancedUIMethods = {
  pbFightMenu_EnhancedUI(this: BattleScene, battler: Battler, cw: FightMenu) { return EUI.pbFightMenu_EnhancedUI(this, battler, cw); },
  pbUpdateMoveInfoWindow(this: BattleScene, battler: Battler, index: number) { EUI.pbUpdateMoveInfoWindow(this, battler, index); },
  pbToggleMoveInfo(this: BattleScene, battler: Battler, index = 0) { EUI.pbToggleMoveInfo(this, battler, index); },
  pbToggleBattleInfo(this: BattleScene) { return EUI.pbToggleBattleInfo(this); },
  pbUpdateBattlerIcons(this: BattleScene) { EUI.pbUpdateBattlerIcons(this); },
  // Essentials Deluxe's Mega Evolution / Primal Reversion cinematics (Mega Evolution.rb:489-502, 688-701)
  pbShowMegaEvolution(this: BattleScene, idxBattler: number) { return pbShowMegaEvolution(this, idxBattler); },
  pbShowPrimalReversion(this: BattleScene, idxBattler: number) { return pbShowPrimalReversion(this, idxBattler); },
};
Object.assign(BattleScene.prototype, enhancedUIMethods);

type EnhancedUIMethods = typeof enhancedUIMethods;
declare module "../scene/BattleScene" {
  interface BattleScene extends MidbattleMethods, EnhancedUIMethods {}
}

//===============================================================================
// Graphics
//===============================================================================
/** The Mega/Primal forms a party member can take in battle (their sprites load ahead). */
function battleFormsOf(pkmn: Pokemon): Pokemon[] {
  const ret: Pokemon[] = [];
  const forms = new Set<number>();
  const mega = pkmn.getMegaForm();
  if (mega > 0) forms.add(mega);
  const primal = MultipleForms.call("getPrimalForm", pkmn) as number | null;
  if (primal != null) forms.add(primal);
  for (const form of forms) {
    if (form === pkmn.form) continue;
    const c = pkmn.clone();
    c.formSimple = form;
    ret.push(c);
  }
  return ret;
}

/** Trainer types and species the midbattle script shows as speakers (:Speaker, :sprite). */
function midbattleSpeakers(): string[] {
  const files = new Set<string>();
  const add = (v: unknown) => {
    const id = isSym(v) ? v.name : Array.isArray(v) && isSym(v[0]) ? v[0].name : null;
    if (!id) return;
    if (Species.exists(id)) {
      // The Pokémon pbUpdateGuestSprite shows ([species, gender, form, shiny, shadow] or a species)
      const pkmn = new Pokemon(id, 1);
      if (Array.isArray(v)) {
        pkmn.gender = (v[1] as number) || 0;
        pkmn.form = (v[2] as number) || 0;
        pkmn.shiny = !!v[3];
      } else if (!pkmn.singleGendered()) {
        pkmn.gender = 0;
      }
      const req = battlerBitmapRequest(pkmn);
      if (req) files.add(req.file);
    } else if (TrainerType.exists(id) && assetExists("Graphics/Trainers/" + id)) {
      files.add("Graphics/Trainers/" + id);
    }
  };
  const walk = (v: unknown, afterSpeaker = false) => {
    if (Array.isArray(v)) {
      v.forEach((e, i) => { walk(e, isSym(v[i - 1], "Speaker")); });
    } else if (isHash(v)) {
      if ("sprite" in v) add(v.sprite);
      for (const e of Object.values(v)) walk(e);
    } else if (afterSpeaker) {
      add(v);
    }
  };
  walk(G.gameTemp.dxMidbattle);
  return [...files];
}

BattleScene.extraPreloads.push(async (scene) => {
  const party: Pokemon[] = [];
  for (let side = 0; side < 2; side++) {
    for (const pkmn of scene.battle!.pbParty(side) ?? []) if (pkmn) party.push(...battleFormsOf(pkmn));
  }
  const paths = new Set<string>([...EUI.ENHANCED_BATTLE_UI_GRAPHICS]);
  for (const pkmn of party) {
    for (const back of [false, true]) {
      const req = battlerBitmapRequest(pkmn, back);
      if (req) paths.add(req.file);
    }
  }
  for (const f of midbattleSpeakers()) paths.add(f);
  await Promise.all([preloadBitmaps(paths), preloadPokemonIcons(party)]);
});
