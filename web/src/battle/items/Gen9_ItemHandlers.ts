// Port of Plugins/Generation 9 Pack Scripts/[004] Items/[000] Item Handlers.rb
// (all of it): the Generation 9 Pack's replacements for core item handlers,
// in Ruby's order and with its section comments:
// - overworld use (ItemHandlers::UseOnPokemon, replacing 013_Items/
//   002_Item_Effects.rb's, i.e. ../../game/items/Item_Effects.ts): Awakening
//   and its copies, Ice Heal and Aspear Berry also cure Drowsy/Frostbite;
//   Reveal Glass works on Enamorus; Ability Patch also switches back from the
//   Hidden Ability.
// - battle use from the Bag (CanUseInBattle, UseInBattle, BattleUseOnPokemon,
//   replacing 013_Items/003_Item_BattleEffects.rb's, i.e. ./Item_BattleEffects.ts).
// - held items (Battle::ItemEffects, replacing 009_Battle_ItemEffects.rb's,
//   i.e. ./Battle_ItemEffects.ts): Lum/Chesto/Aspear Berry, Red Card (replaced
//   again by ZUD's, ./ZUD_Override_Items.ts), Quick Claw.
// Import this file after those three (./index.ts does).
//
// Ruby bugs kept for parity:
// - CanUseInBattle AWAKENING/CHESTOBERRY/BLUEFLUTE and ICEHEAL/ASPEARBERRY
//   (Ruby lines 116-117, 127-128, 171-172) call pbBattleItemCanCureStatus? for
//   the first status and then the second, so with showMessages a Drowsy
//   (Frostbitten) Pokémon first gets "It won't have any effect." and the item
//   is then used anyway; one with neither status gets the message twice.

import { Ability } from "../../data/gameData/ability";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import { type ItemEffectScene, pbBattleItemCanCureStatus } from "../../game/items/itemUtilities";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";

/** The scene a UseOnPokemon handler gets: the party screen (PokemonPartyScreen). */
interface FieldItemScene extends ItemEffectScene {
  pbConfirm(text: string): Promise<boolean>;
}
const sceneOf = (scene: unknown) => scene as FieldItemScene;
const battleSceneOf = (scene: unknown) => scene as ItemEffectScene;

// ItemHandlers.CanUseInBattle is typed as returning a boolean, but its
// triggers (Battle_ActionUseItem.ts, AI_Item.ts) await the handler's result.
type CanUseInBattleProc = (item: Id, pokemon: Pokemon, battler: Battler | null, move: number | null,
  firstAction: boolean, battle: Battle, scene: ItemEffectScene, showMessages: boolean) => Promise<boolean>;
type CanUseInBattleEntry = Parameters<typeof ItemHandlers.CanUseInBattle.add>[1];
const CanUseInBattle = {
  add: (item: Id, proc: CanUseInBattleProc) =>
    ItemHandlers.CanUseInBattle.add(item, proc as unknown as CanUseInBattleEntry),
  copy: (src: Id, ...dests: Id[]) => ItemHandlers.CanUseInBattle.copy(src, ...dests),
};

//################################################################################
//
// Updates to old item handlers (overworld use).
//
//################################################################################

//===============================================================================
// Awakening, Chesto Berry, Blue Flute
//===============================================================================
// Adds Drowsiness as a status that may be healed.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("AWAKENING", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.fainted() || !["SLEEP", "DROWSY"].includes(pkmn.status)) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  let msg: string | undefined;
  switch (pkmn.status) {
    case "SLEEP": msg = _INTL("{1} woke up.", pkmn.name); break;
    case "DROWSY": msg = _INTL("{1} became alert again.", pkmn.name); break;
  }
  pkmn.healStatus();
  scene.pbRefresh?.();
  await scene.pbDisplay(msg!);
  return true;
});

ItemHandlers.UseOnPokemon.copy("AWAKENING", "CHESTOBERRY", "BLUEFLUTE", "POKEFLUTE");

//===============================================================================
// Ice Heal, Aspear Berry
//===============================================================================
// Adds Frostbite as a status that may be healed.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("ICEHEAL", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.fainted() || !["FROZEN", "FROSTBITE"].includes(pkmn.status)) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  let msg: string | undefined;
  switch (pkmn.status) {
    case "FROZEN": msg = _INTL("{1} was thawed out.", pkmn.name); break;
    case "FROSTBITE": msg = _INTL("{1}'s frostbite was healed.", pkmn.name); break;
  }
  pkmn.healStatus();
  scene.pbRefresh?.();
  await scene.pbDisplay(msg!);
  return true;
});

ItemHandlers.UseOnPokemon.copy("ICEHEAL", "ASPEARBERRY");

//===============================================================================
// Reveal Glass
//===============================================================================
// Adds compatibility with Enamorus.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("REVEALGLASS", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.isSpecies("TORNADUS") &&
      !pkmn.isSpecies("THUNDURUS") &&
      !pkmn.isSpecies("LANDORUS") &&
      !pkmn.isSpecies("ENAMORUS")) {
    await scene.pbDisplay(_INTL("It had no effect."));
    return false;
  } else if (pkmn.fainted()) {
    await scene.pbDisplay(_INTL("This can't be used on the fainted Pokémon."));
    return false;
  }
  const newForm = pkmn.form === 0 ? 1 : 0;
  await pkmn.setForm(newForm, async () => {
    scene.pbRefresh?.();
    await scene.pbDisplay(_INTL("{1} changed Forme!", pkmn.name));
  });
  return true;
});

//===============================================================================
// Ability Patch
//===============================================================================
// Adds the ability to switch from a Hidden Ability.
//-------------------------------------------------------------------------------
ItemHandlers.UseOnPokemon.add("ABILITYPATCH", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (await scene.pbConfirm(_INTL("Do you want to change {1}'s Ability?", pkmn.name))) {
    const currentAbi = pkmn.abilityIndex;
    const abils = pkmn.getAbilityList();
    let newAbilityId: Id | null = null;
    for (const a of abils) {
      if ((currentAbi < 2 && a[1] === 2) || (currentAbi === 2 && a[1] === 0)) newAbilityId = a[0];
    }
    if (!newAbilityId || pkmn.isSpecies("ZYGARDE")) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    const newAbilityName = Ability.get(newAbilityId).name;
    pkmn.abilityIndex = currentAbi < 2 ? 2 : 0;
    pkmn.ability = null;
    scene.pbRefresh?.();
    await scene.pbDisplay(_INTL("{1}'s Ability changed! Its Ability is now {2}!",
      pkmn.name, newAbilityName));
    return true;
  }
  return false;
});

//################################################################################
//
// Updates to old battle item handlers (used from the bag).
//
//################################################################################

//===============================================================================
// Awakening, Chesto Berry, Blue Flute
//===============================================================================
// Adds Drowsiness as a status that may be healed.
//-------------------------------------------------------------------------------
CanUseInBattle.add("AWAKENING",
  async (_item: Id, pokemon: Pokemon, _battler: Battler | null, _move: number | null, _firstAction: boolean,
    _battle: Battle, scene: ItemEffectScene, showMessages: boolean) => {
    return (await pbBattleItemCanCureStatus("SLEEP", pokemon, scene, showMessages)) ||
           (await pbBattleItemCanCureStatus("DROWSY", pokemon, scene, showMessages));
  },
);

CanUseInBattle.copy("AWAKENING", "CHESTOBERRY");

CanUseInBattle.add("BLUEFLUTE",
  async (_item: Id, pokemon: Pokemon, battler: Battler | null, _move: number | null, _firstAction: boolean,
    _battle: Battle, scene: ItemEffectScene, showMessages: boolean) => {
    if (battler?.hasActiveAbility("SOUNDPROOF")) {
      if (showMessages) await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    return (await pbBattleItemCanCureStatus("SLEEP", pokemon, scene, showMessages)) ||
           (await pbBattleItemCanCureStatus("DROWSY", pokemon, scene, showMessages));
  },
);

ItemHandlers.BattleUseOnPokemon.add("AWAKENING",
  async (_item: Id, pokemon: Pokemon, battler: Battler | null, _choices: unknown, sceneArg: unknown) => {
    const scene = battleSceneOf(sceneArg);
    const oldStatus = pokemon.status;
    pokemon.healStatus();
    await battler?.pbCureStatus(false);
    const name = battler ? battler.pbThis() : pokemon.name;
    scene.pbRefresh?.();
    switch (oldStatus) {
      case "SLEEP": return scene.pbDisplay(_INTL("{1} woke up.", name));
      case "DROWSY": return scene.pbDisplay(_INTL("{1} became alert again.", name));
    }
    return undefined;
  },
);

ItemHandlers.BattleUseOnPokemon.copy("AWAKENING", "CHESTOBERRY", "BLUEFLUTE");

//===============================================================================
// Poke Flute
//===============================================================================
// Adds Drowsiness as a status that may be healed.
//-------------------------------------------------------------------------------
CanUseInBattle.add("POKEFLUTE",
  async (_item: Id, _pokemon: Pokemon, _battler: Battler | null, _move: number | null, _firstAction: boolean,
    battle: Battle, scene: ItemEffectScene, showMessages: boolean) => {
    if (!battle.allBattlers().some((b) => ["SLEEP", "DROWSY"].includes(b.status) && !b.hasActiveAbility("SOUNDPROOF"))) {
      if (showMessages) await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    return true;
  },
);

ItemHandlers.UseInBattle.add("POKEFLUTE", async (_item: Id, _battler: Battler | null, battle: Battle) => {
  for (const b of battle.allBattlers()) {
    if (["SLEEP", "DROWSY"].includes(b.status) && !b.hasActiveAbility("SOUNDPROOF")) await b.pbCureStatus(false);
  }
  await battle.pbDisplay(_INTL("All Pokémon were roused by the tune!"));
});

//===============================================================================
// Ice Heal, Aspear Berry
//===============================================================================
// Adds Frostbite as a status that may be healed.
//-------------------------------------------------------------------------------
CanUseInBattle.add("ICEHEAL",
  async (_item: Id, pokemon: Pokemon, _battler: Battler | null, _move: number | null, _firstAction: boolean,
    _battle: Battle, scene: ItemEffectScene, showMessages: boolean) => {
    return (await pbBattleItemCanCureStatus("FROZEN", pokemon, scene, showMessages)) ||
           (await pbBattleItemCanCureStatus("FROSTBITE", pokemon, scene, showMessages));
  },
);

CanUseInBattle.copy("ICEHEAL", "ASPEARBERRY");

ItemHandlers.BattleUseOnPokemon.add("ICEHEAL",
  async (_item: Id, pokemon: Pokemon, battler: Battler | null, _choices: unknown, sceneArg: unknown) => {
    const scene = battleSceneOf(sceneArg);
    const oldStatus = pokemon.status;
    pokemon.healStatus();
    await battler?.pbCureStatus(false);
    const name = battler ? battler.pbThis() : pokemon.name;
    scene.pbRefresh?.();
    switch (oldStatus) {
      case "FROZEN": return scene.pbDisplay(_INTL("{1} was thawed out.", name));
      case "FROSTBITE": return scene.pbDisplay(_INTL("{1}'s frostbite was healed.", name));
    }
    return undefined;
  },
);

ItemHandlers.BattleUseOnPokemon.copy("ICEHEAL", "ASPEARBERRY");

//################################################################################
//
// Updates to old battle item handlers (held items).
//
//################################################################################

//===============================================================================
// Lum Berry
//===============================================================================
// Adds Drowsy/Frostbite as statuses that may be healed.
//-------------------------------------------------------------------------------
ItemEffects.StatusCure.add("LUMBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.status === "NONE" &&
        battler.effects[PBEffects.Confusion] === 0) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    const oldStatus = battler.status;
    const oldConfusion = (battler.effects[PBEffects.Confusion] > 0);
    await battler.pbCureStatus(forced);
    battler.pbCureConfusion();
    if (forced) {
      if (oldConfusion) await battle.pbDisplay(_INTL("{1} snapped out of its confusion.", battler.pbThis()));
    } else {
      switch (oldStatus) {
        case "SLEEP":
          await battle.pbDisplay(_INTL("{1}'s {2} woke it up!", battler.pbThis(), itemName));
          break;
        case "POISON":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its poisoning!", battler.pbThis(), itemName));
          break;
        case "BURN":
          await battle.pbDisplay(_INTL("{1}'s {2} healed its burn!", battler.pbThis(), itemName));
          break;
        case "PARALYSIS":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its paralysis!", battler.pbThis(), itemName));
          break;
        case "FROZEN":
          await battle.pbDisplay(_INTL("{1}'s {2} defrosted it!", battler.pbThis(), itemName));
          break;
        case "DROWSY":
          await battle.pbDisplay(_INTL("{1}'s {2} made it alert again!", battler.pbThis(), itemName));
          break;
        case "FROSTBITE":
          await battle.pbDisplay(_INTL("{1}'s {2} healed its frostbite!", battler.pbThis(), itemName));
          break;
      }
      if (oldConfusion) {
        await battle.pbDisplay(_INTL("{1}'s {2} snapped it out of its confusion!", battler.pbThis(), itemName));
      }
    }
    return true;
  },
);

//===============================================================================
// Chesto Berry
//===============================================================================
// Adds Drowsiness as a status that may be healed.
//-------------------------------------------------------------------------------
ItemEffects.StatusCure.add("CHESTOBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (!["SLEEP", "DROWSY"].includes(battler.status)) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    let msg: string | undefined;
    switch (battler.status) {
      case "SLEEP": msg = _INTL("{1}'s {2} woke it up!", battler.pbThis(), itemName); break;
      case "DROWSY": msg = _INTL("{1}'s {2} made it alert again!", battler.pbThis(), itemName); break;
    }
    await battler.pbCureStatus(forced);
    if (!forced) await battle.pbDisplay(msg!);
    return true;
  },
);

//===============================================================================
// Aspear Berry
//===============================================================================
// Adds Frostbite as a status that may be healed.
//-------------------------------------------------------------------------------
ItemEffects.StatusCure.add("ASPEARBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (!["FROZEN", "FROSTBITE"].includes(battler.status)) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    let msg: string | undefined;
    switch (battler.status) {
      case "FROZEN": msg = _INTL("{1}'s {2} defrosted it!", battler.pbThis(), itemName); break;
      case "FROSTBITE": msg = _INTL("{1}'s {2} healed its frostbite!", battler.pbThis(), itemName); break;
    }
    await battler.pbCureStatus(forced);
    if (!forced) await battle.pbDisplay(msg!);
    return true;
  },
);

//===============================================================================
// Red Card
//===============================================================================
// Adds Guard Dog immunity.
// (ZUD Mechanics replaces this handler again: ./ZUD_Override_Items.ts.)
//-------------------------------------------------------------------------------
ItemEffects.AfterMoveUseFromTarget.add("REDCARD",
  async (_item: Id, battler: Battler, user: Battler, _move: Move, switchedBattlers: number[], battle: Battle) => {
    if (switchedBattlers.length > 0 || user.fainted()) return;
    const newPkmn = await battle.pbGetReplacementPokemonIndex(user.index, true);
    if (newPkmn < 0) return;
    await battle.pbCommonAnimation("UseItem", battler);
    await battle.pbDisplay(_INTL("{1} held up its {2} against {3}!",
      battler.pbThis(), battler.itemName(), user.pbThis(true)));
    await battler.pbConsumeItem();
    if (user.effects[PBEffects.Commander]) return;
    if (user.hasActiveAbility(["SUCTIONCUPS", "GUARDDOG"]) && !battle.moldBreaker) {
      await battle.pbShowAbilitySplash(user);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1} anchors itself!", user.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1} anchors itself with {2}!", user.pbThis(), user.abilityName()));
      }
      await battle.pbHideAbilitySplash(user);
      return;
    }
    if (user.effects[PBEffects.Ingrain]) {
      await battle.pbDisplay(_INTL("{1} anchored itself with its roots!", user.pbThis()));
      return;
    }
    await battle.pbRecallAndReplace(user.index, newPkmn, true);
    await battle.pbDisplay(_INTL("{1} was dragged out!", user.pbThis()));
    battle.pbClearChoice(user.index);
    switchedBattlers.push(user.index);
    battle.moldBreaker = false;
    await battle.pbOnBattlerEnteringBattle(user.index);
  },
);

//===============================================================================
// Quick Claw
//===============================================================================
// Cannot trigger if the user has Mycelium Might and used a status move.
//-------------------------------------------------------------------------------
ItemEffects.PriorityBracketChange.add("QUICKCLAW",
  (_item: Id, battler: Battler, battle: Battle) => {
    if (battler.hasActiveAbility("MYCELIUMMIGHT")) {
      const pri = AbilityEffects.triggerPriorityBracketChange(battler.ability, battler, battle);
      if (pri !== 0) return pri;
    }
    if (battle.pbRandom(100) < 20) return 1;
    return undefined;
  },
);
