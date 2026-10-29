// Port of the handlers in Plugins/Generation 9 Pack Scripts/[004] Items/
// [001] New Item Handlers.rb, in Ruby's order and with its section comments:
// the Hopo Berry (copies of Ether/Leppa Berry), the Scroll of Waters, the PLA
// damage boosters, Punching Glove, Clear Amulet and Mirror Herb.
// The rest of that file is ported elsewhere:
// - GameData::Item#unlosable? (the new item/species combos):
//   ../../data/gameData/item.ts (unlosable).
// - the Hisuian Poké Balls and Origin Ball (Battle::PokeBallEffects):
//   ../other/PokeBallEffects.ts.
// - the OnOpposingStatGain/StatLossImmunity hashes and triggers:
//   ../other/ItemEffects.ts.
// The .copy calls copy what's registered when this file loads: ETHER from
// 002_Item_Effects.rb/003_Item_BattleEffects.rb (../../game/items/Item_Effects.ts,
// ./Item_BattleEffects.ts) and the held item handlers from ./Battle_ItemEffects.ts,
// so ./index.ts imports this file after those.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import { type ItemEffectScene, isPartyScreen, pbItemEvolutionScene } from "../../game/items/itemUtilities";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { type DamageMultipliers, ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";

/** The scene a UseOnPokemon handler gets: the party screen (PokemonPartyScreen). */
interface FieldItemScene extends ItemEffectScene {
  pbRefreshAnnotations?(ableProc: (pkmn: Pokemon) => boolean): void;
}
const sceneOf = (scene: unknown) => scene as FieldItemScene;

//################################################################################
//
// New item handlers (from the bag).
//
//################################################################################

//===============================================================================
// Hopo Berry
//===============================================================================
ItemHandlers.UseOnPokemon.copy("ETHER", "LEPPABERRY", "HOPOBERRY");
ItemHandlers.CanUseInBattle.copy("ETHER", "LEPPABERRY", "HOPOBERRY");
ItemHandlers.BattleUseOnPokemon.copy("ETHER", "LEPPABERRY", "HOPOBERRY");

//===============================================================================
// Scroll of Waters
//===============================================================================
ItemHandlers.UseOnPokemon.add("SCROLLOFWATERS",
  async (item: Id, _qty: number, pkmn: Pokemon, sceneArg: unknown) => {
    const scene = sceneOf(sceneArg);
    if (pkmn.shadowPokemon()) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    const newspecies = pkmn.checkEvolutionOnUseItem(item);
    if (newspecies) {
      if (pkmn.species === "KUBFU") pkmn.form = 1;
      // pbFadeOutInWithMusic { PokemonEvolutionScene ... pbEvolution(false) ... }
      await pbItemEvolutionScene(pkmn, newspecies, false, () => {
        if (isPartyScreen(scene)) {
          scene.pbRefreshAnnotations!((p) => p.checkEvolutionOnUseItem(item) != null);
          scene.pbRefresh?.();
        }
      });
      return true;
    }
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  },
);

//################################################################################
//
// New battle item handlers (held items).
//
//################################################################################

//===============================================================================
// Hopo Berry
//===============================================================================
ItemEffects.OnEndOfUsingMove.copy("LEPPABERRY", "HOPOBERRY");

//===============================================================================
// PLA Damage boosters
//===============================================================================
ItemEffects.DamageCalcFromUser.copy("GRISEOUSORB", "GRISEOUSCORE");
ItemEffects.DamageCalcFromUser.copy("ADAMANTORB", "ADAMANTCRYSTAL");
ItemEffects.DamageCalcFromUser.copy("LUSTROUSORB", "LUSTROUSGLOBE");
ItemEffects.DamageCalcFromUser.copy("SILKSCARF", "BLANKPLATE");

//===============================================================================
// Punching Glove
//===============================================================================
ItemEffects.DamageCalcFromUser.add("PUNCHINGGLOVE",
  (_item: Id, _user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    if (move.punchingMove()) mults.base_damage_multiplier! *= 1.1;
  },
);

//===============================================================================
// Clear Amulet
//===============================================================================
ItemEffects.StatLossImmunity.add("CLEARAMULET",
  async (_item: Id, battler: Battler, _stat: Id, battle: Battle, showMessages: boolean) => {
    if (showMessages) {
      await battle.pbDisplay(_INTL("{1}'s {2} prevents stat loss!", battler.pbThis(), battler.itemName()));
    }
    return true;
  },
);

//===============================================================================
// Mirror Herb
//===============================================================================
ItemEffects.OnOpposingStatGain.add("MIRRORHERB",
  async (item: Id, battler: Battler, battle: Battle, statUps: Record<Id, number>, forced: boolean) => {
    let showAnim = true;
    battler.mirrorHerbUsed = true;
    for (const [stat, increment] of Object.entries(statUps)) {
      if (!(await battler.pbCanRaiseStatStage(stat, battler))) continue;
      if (await battler.pbRaiseStatStage(stat, increment, battler, showAnim)) {
        showAnim = false;
      }
    }
    battler.mirrorHerbUsed = false;
    if (showAnim) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("UseItem", battler);
    await battle.pbDisplay(_INTL("{1} used its {2} to mirror its opponent's stat changes!", battler.pbThis(), itemName));
    return true;
  },
);
