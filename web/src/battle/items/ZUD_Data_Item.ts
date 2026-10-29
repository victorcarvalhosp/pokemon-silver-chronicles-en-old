// Port of the item handlers in Plugins/ZUD Mechanics/[001] Data/Data_Item.rb,
// in Ruby's order and with its section comments: Z-Crystals (UseOnPokemon
// addIf), Dynamax Candy/XL, Max Soup, Max Scales, Max Plumage (UseOnPokemon),
// Max Eggs (UseInField), Z-Booster and Wishing Star (CanUseInBattle,
// UseInBattle).
// The rest of that file is ported elsewhere:
// - the GameData::Item extensions (is_z_crystal?, is_ultra_item?,
//   is_important?, unlosable?, held_icon_filename, get_TR_from_type):
//   ../../data/gameData/item.ts.
// - the Z-Crystals Bag pocket and PokemonBag#can_add?/add:
//   ../../game/items/PokemonBag.ts.
//
// The field handlers import cleanly in node: the screens Max Eggs and Max
// Scales open (the party screen, the fade, the Move Relearner) are imported on
// demand inside the handler, as in ../../game/items/Item_Effects.ts.
//
// Ruby bugs kept for parity:
// - Max Eggs (Ruby line 298): `experience` is capped for a Pokémon near the
//   maximum Exp. *after* its new Exp. is computed, and the cap carries over to
//   the Pokémon after it in the party, which then gain (and are told they
//   gain) only that much.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Item } from "../../data/gameData/item";
import { Stat } from "../../data/gameData/stat";
import { G } from "../../game/globals";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import { type ItemEffectScene, pbChangeLevel, pbMessageHook, startsWithVowel } from "../../game/items/itemUtilities";
import type { PokemonBag } from "../../game/items/PokemonBag";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { GameStats } from "../../game/trainer/GameStats";
import type { Player } from "../../game/trainer/Player";
import { pbSEPlay } from "../audio";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";

const player = () => G.player as unknown as Player;
const bag = () => G.bag as PokemonBag;
const stats = () => G.stats as GameStats;

/** Pokemon::IV_STAT_LIMIT (Pokemon is only a type import here). */
const IV_STAT_LIMIT = 31;

/** The scene a UseOnPokemon handler gets: the party screen (PokemonPartyScreen). */
interface FieldItemScene extends ItemEffectScene {
  pbConfirm(text: string): Promise<boolean>;
}
const sceneOf = (scene: unknown) => scene as FieldItemScene;

/** Integer#to_s_formatted: thousands separators. */
const toSFormatted = (n: number): string => String(n).split("").reverse().join("").match(/\d{1,3}/g)!
  .join(",").split("").reverse().join("");

// ItemHandlers.CanUseInBattle is typed as returning a boolean, but its
// triggers (Battle_ActionUseItem.ts, AI_Item.ts) await the handler's result.
type CanUseInBattleProc = (item: Id, pokemon: Pokemon, battler: Battler, move: number | null,
  firstAction: boolean, battle: Battle, scene: ItemEffectScene, showMessages: boolean) => Promise<boolean>;
type CanUseInBattleEntry = Parameters<typeof ItemHandlers.CanUseInBattle.add>[1];
const CanUseInBattle = {
  add: (item: Id, proc: CanUseInBattleProc) =>
    ItemHandlers.CanUseInBattle.add(item, proc as unknown as CanUseInBattleEntry),
};

//-------------------------------------------------------------------------------
// Z-Crystals
//-------------------------------------------------------------------------------
// Equips a holdable crystal upon use. Pokemon may still equip a Z-Crystal even if
// they are incompatible with it, but a message will display saying that it can't
// be used. This message will not play, however, if the Z-Crystal would also allow
// for the species to Ultra Burst, even if the Pokemon itself can't use the Z-Move
// in its current state.
//-------------------------------------------------------------------------------
// (Ruby's condition is GameData::Item.get(item).is_z_crystal?, which raises for
// an unknown item; tryGet as for the evolution stones' addIf in Item_Effects.ts.)
ItemHandlers.UseOnPokemon.addIf((item) => !!Item.tryGet(item)?.isZCrystal(),
  async (item, _qty, pkmn, sceneArg) => {
    const scene = sceneOf(sceneArg);
    const crystal = Item.get(item).portionName;
    // (an array of moves: PowerMove only reads each one's id and type)
    const compatible = pkmn.compatZmove(pkmn.moves as never, item) || pkmn.compatUltra(item);
    if (pkmn.shadowPokemon() || pkmn.egg()) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    } else if (pkmn.itemId === item) {
      await scene.pbDisplay(_INTL("{1} is already holding a {2}.", pkmn.name, crystal));
      return false;
    } else if (!compatible && !(await scene.pbConfirm(_INTL("This Pokémon currently can't use this crystal's Z-Power. Is that OK?")))) {
      return false;
    }
    await scene.pbDisplay(_INTL("The {1} will be given to the Pokémon so that the Pokémon can use its Z-Power!", crystal));
    if (pkmn.item) {
      const itemname = pkmn.item.portionName;
      const text = startsWithVowel(itemname) ? "an" : "a";
      await scene.pbDisplay(_INTL("{1} is already holding {2} {3}.\x01", pkmn.name, text, itemname));
      if (await scene.pbConfirm(_INTL("Would you like to switch the two items?"))) {
        if (!bag().canAdd(pkmn.itemId!)) {
          await scene.pbDisplay(_INTL("The Bag is full. The Pokémon's item could not be removed."));
          return false;
        } else {
          bag().add(pkmn.itemId!);
          await scene.pbDisplay(_INTL("You took the Pokémon's {1} and gave it the {2}.", itemname, crystal));
        }
      } else {
        return false;
      }
    }
    pkmn.item = item;
    pbSEPlay("Pkmn move learnt");
    await scene.pbDisplay(_INTL("Your Pokémon is now holding a {1}!", crystal));
    return true;
  },
);

//-------------------------------------------------------------------------------
// Dynamax Candy/XL
//-------------------------------------------------------------------------------
// Increases the Dynamax Level of a Pokemon by 1. The XL variety maxes out this
// level instead. This won't have any effect on Pokemon that are incapable of
// Dynamaxing, including Eternatus.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("DYNAMAXCANDY", async (item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.shadowPokemon() || pkmn.egg()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  if (pkmn.dynamaxLvl < 10 && pkmn.dynamaxAble && !pkmn.isSpecies("ETERNATUS")) {
    pbSEPlay("Pkmn move learnt");
    if (item === "DYNAMAXCANDYXL") {
      await scene.pbDisplay(_INTL("{1}'s Dynamax level was increased to 10!", pkmn.name));
      stats().totalDynamaxLvlsGained += (10 - pkmn.dynamaxLvl);
      pkmn.dynamaxLvl = 10;
    } else {
      await scene.pbDisplay(_INTL("{1}'s Dynamax level was increased by 1!", pkmn.name));
      stats().totalDynamaxLvlsGained += 1;
      pkmn.dynamaxLvl += 1;
    }
    scene.pbHardRefresh?.();
    return true;
  } else {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
});

ItemHandlers.UseOnPokemon.copy("DYNAMAXCANDY", "DYNAMAXCANDYXL");

//-------------------------------------------------------------------------------
// Max Soup
//-------------------------------------------------------------------------------
// Toggles Gigantamax Factor if the species has a Gigantamax form. Cannot be used
// to give Eternatus G-Max Factor, however.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("MAXSOUP", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.shadowPokemon() || pkmn.egg()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  if (pkmn.hasGmax() && !pkmn.isSpecies("ETERNATUS")) {
    if (pkmn.gmaxFactor) {
      pkmn.gmaxFactor = false;
      await scene.pbDisplay(_INTL("{1} lost its Gigantamax energy.", pkmn.name));
    } else {
      pbSEPlay("Pkmn move learnt");
      pkmn.gmaxFactor = true;
      stats().totalGmaxFactorsGiven += 1;
      await scene.pbDisplay(_INTL("{1} is now bursting with Gigantamax energy!", pkmn.name));
    }
    scene.pbHardRefresh?.();
    return true;
  } else {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
});

//-------------------------------------------------------------------------------
// Max Scales
//-------------------------------------------------------------------------------
// Allows a Pokemon to recall a past move.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("MAXSCALES", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.shadowPokemon() || pkmn.egg()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  const moves: Id[] = [];
  for (const m of pkmn.firstMoves) {
    if (pkmn.hasMove(m)) continue;
    moves.push(m);
  }
  for (const m of pkmn.getMoveList()) {
    if (m.level > pkmn.level || pkmn.hasMove(m.move)) continue;
    moves.push(m.move);
  }
  if (moves.length > 0) {
    await scene.pbDisplay(_INTL("What move should {1} recall?", pkmn.name));
    const oldmoves = [...pkmn.moves];
    // pbRelearnMoveScreen(pkmn) (016_UI/021_UI_MoveRelearner.rb).
    // TODO(items): the Move Relearner isn't ported; it's the hook the party
    // screen's skills use too, and without it no move is relearned.
    const { FieldSkillHooks } = await import("../../ui/party/fieldSkills");
    await FieldSkillHooks.relearnMoveScreen?.(pkmn);
    const newmoves = pkmn.moves;
    // Array#!= compares the Pokemon::Move objects (by identity)
    return newmoves.length !== oldmoves.length || newmoves.some((m, i) => m !== oldmoves[i]);
  } else {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
});

//-------------------------------------------------------------------------------
// Max Plumage
//-------------------------------------------------------------------------------
// Increases each IV of a Pokemon by 1 point. Unlike Hyper Training, this will
// increase the Pokemon's raw IV's, instead of simply altering the Pokemon's
// stats to be equivalent of higher IV's.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("MAXPLUMAGE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.shadowPokemon() || pkmn.egg()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  let used = false;
  for (const s of Stat.eachMain()) {
    if (pkmn.iv[s.id] === IV_STAT_LIMIT) continue;
    pkmn.iv[s.id]! += 1;
    used = true;
  }
  if (used) {
    pbSEPlay("Pkmn move learnt");
    await scene.pbDisplay(_INTL("The quality of {1}'s base stats each increased by 1!", pkmn.name));
    pkmn.calcStats();
    scene.pbHardRefresh?.();
    return true;
  } else {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
});

//-------------------------------------------------------------------------------
// Max Eggs
//-------------------------------------------------------------------------------
// Increases the party's Exp. by a large amount relative to badge count.
//-------------------------------------------------------------------------------
ItemHandlers.UseInField.add("MAXEGGS", async () => {
  if (player().pokemonCount() === 0) {
    await pbMessageHook(_INTL("There are no Pokémon."));
    return false;
  }
  let cangain = false;
  for (const i of player().pokemonParty()) {
    if (i.level >= GrowthRate.maxLevel() || i.shadowPokemon() || i.egg()) continue;
    cangain = true;
    break;
  }
  if (!cangain) {
    await pbMessageHook(_INTL("It won't have any effect."));
    return false;
  }
  let gainers = 0;
  let experience = 2500;
  experience *= (player().badgeCount() > 1) ? player().badgeCount() : 1;
  if (experience > 20000) experience = 20000;
  const { pbFadeOutIn } = await import("../../ui/fades");
  const { PokemonParty_Scene, PokemonPartyScreen } = await import("../../ui/party/party");
  await pbFadeOutIn(async () => {
    const scene = new PokemonParty_Scene();
    const screen = new PokemonPartyScreen(scene, player().party);
    await screen.pbStartScene(_INTL("Using item..."), false);
    for (const [i, pkmn] of player().party.entries()) {
      if (pkmn.shadowPokemon() || pkmn.egg()) continue;
      if (pkmn.level >= GrowthRate.maxLevel()) continue;
      gainers += 1;
      const maxexp = pkmn.growthRate().maximumExp();
      const newexp = pkmn.growthRate().addExp(pkmn.exp, experience);
      const newlevel = pkmn.growthRate().levelFromExp(newexp);
      if (maxexp < (pkmn.exp + experience)) experience = (maxexp - pkmn.exp);
      await screen.pbDisplay(_INTL("{1} gained {2} Exp. Points!", pkmn.name, toSFormatted(experience)));
      pbSEPlay("Pkmn move learnt");
      await pbChangeLevel(pkmn, newlevel, screen);
      pkmn.exp = newexp;
      screen.pbRefreshSingle(i);
    }
    if (gainers === 0) {
      await screen.pbDisplay(_INTL("It won't have any effect."));
    }
    await screen.pbEndScene();
  });
  return (gainers > 0);
});

//-------------------------------------------------------------------------------
// Z-Booster
//-------------------------------------------------------------------------------
// Restores your ability to use Z-Moves if one was already used in battle. Using
// this item will take up your entire turn, and cannot be used if orders have
// already been given to a Pokemon.
//-------------------------------------------------------------------------------
CanUseInBattle.add("ZBOOSTER", async (_item, _pokemon, battler, _move, firstAction, battle, scene, showMessages) => {
  const side = battler.idxOwnSide();
  const owner = battle.pbGetOwnerIndexFromBattlerIndex(battler.index);
  const ring = battle.pbGetZRingName(battler.index);
  let _dmax = false;
  battle.eachSameSideBattler(battler, (b) => { if (b.dynamax()) _dmax = true; });
  if (!battle.pbHasZRing(battler.index)) {
    await scene.pbDisplay(_INTL("You don't have a {1} to charge!", ring));
    return false;
  } else if (!firstAction) {
    await scene.pbDisplay(_INTL("You can't use this item while issuing orders at the same time!"));
    return false;
  } else if (battle.zMove[side]![owner] === -1) {
    if (showMessages) {
      await scene.pbDisplay(_INTL("You don't need to recharge your {1} yet!", ring));
    }
    return false;
  }
  return true;
});

ItemHandlers.UseInBattle.add("ZBOOSTER", async (item: Id, battler: Battler, battle: Battle) => {
  const ring = battle.pbGetZRingName(battler.index);
  const trainer = battle.pbGetOwnerName(battler.index);
  const itemName = Item.get(item).portionName;
  battle.pbSetBattleMechanicUsage(battler.index, "Z-Move", -1);
  pbSEPlay("Anim/Lucky Chant");
  await battle.pbDisplayPaused(_INTL("The {1} fully recharged {2}'s {3}!\n{2} can use Z-Moves again!", itemName, trainer, ring));
});

//-------------------------------------------------------------------------------
// Wishing Star
//-------------------------------------------------------------------------------
// Restores your ability to use Dynamax if it was already used in battle. Using
// this item will take up your entire turn, and cannot be used if orders have
// already been given to a Pokemon. This item also can't be used if you still
// currently have a Dynamaxed Pokemon on the field.
//-------------------------------------------------------------------------------
CanUseInBattle.add("WISHINGSTAR", async (_item, _pokemon, battler, _move, firstAction, battle, scene, showMessages) => {
  const side = battler.idxOwnSide();
  const owner = battle.pbGetOwnerIndexFromBattlerIndex(battler.index);
  const band = battle.pbGetDynamaxBandName(battler.index);
  let dmax = false;
  battle.eachSameSideBattler(battler, (b) => { if (b.dynamax()) dmax = true; });
  if (!battle.pbHasDynamaxBand(battler.index)) {
    await scene.pbDisplay(_INTL("You don't have a {1} to charge!", band));
    return false;
  } else if (!firstAction) {
    await scene.pbDisplay(_INTL("You can't use this item while issuing orders at the same time!"));
    return false;
  } else if (dmax || battle.dynamax[side]![owner] === -1) {
    if (showMessages) {
      await scene.pbDisplay(_INTL("You don't need to recharge your {1} yet!", band));
    }
    return false;
  }
  return true;
});

ItemHandlers.UseInBattle.add("WISHINGSTAR", async (item: Id, battler: Battler, battle: Battle) => {
  const band = battle.pbGetDynamaxBandName(battler.index);
  const trainer = battle.pbGetOwnerName(battler.index);
  const itemName = Item.get(item).portionName;
  battle.pbSetBattleMechanicUsage(battler.index, "Dynamax", -1);
  pbSEPlay("Anim/Lucky Chant");
  await battle.pbDisplayPaused(_INTL("The {1} fully recharged {2}'s {3}!\n{2} can use Dynamax again!", itemName, trainer, band));
});
