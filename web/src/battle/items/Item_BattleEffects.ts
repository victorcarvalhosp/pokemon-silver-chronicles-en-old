// Port of Data/Scripts/013_Items/003_Item_BattleEffects.rb: the handlers of the
// items used from the Bag in battle (ItemHandlers::CanUseInBattle, UseInBattle,
// BattleUseOnPokemon, BattleUseOnBattler), in Ruby's order and with its
// section comments. The registries are in ../../game/items/ItemHandlers.ts,
// their triggers (all awaited) in ../battle/Battle_ActionUseItem.ts, and the
// helpers (pbBattleHPItem, pbBattleRestorePP, pbBattleItemCanCureStatus?,
// pbBattleItemCanRaiseStat?) in ../../game/items/itemUtilities.ts.
//
// No plugin redefines a helper or Battle/Battler method these handlers call
// differently from the battle core port, but the Generation 9 Pack ([004]
// Items/[000] Item Handlers.rb) re-registers AWAKENING (+ CHESTOBERRY,
// BLUEFLUTE), POKEFLUTE and ICEHEAL (+ ASPEARBERRY) to also cure Drowsy/
// Frostbite, and [001] New Item Handlers.rb copies ETHER to LEPPABERRY and
// HOPOBERRY; ZUD Mechanics ([001] Data/Data_Item.rb) adds ZBOOSTER and
// WISHINGSTAR. Those files are imported after this one (see ./index.ts).
//
// Handler arguments are Ruby's: CanUseInBattle (item, pokemon, battler, move,
// firstAction, battle, scene, showMessages), UseInBattle (item, battler,
// battle), BattleUseOnPokemon (item, pokemon, battler, choices, scene),
// BattleUseOnBattler (item, battler, scene). Handlers are async and await
// every message, HP and stat change.
//
// Settings: REBALANCED_HEALING_ITEM_AMOUNTS, RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS
// and X_STAT_ITEMS_RAISE_BY_TWO_STAGES are computed in 001_Settings.rb from
// MECHANICS_GENERATION (8 then; the Gen 9 Pack's redefinition to 9 comes later
// and doesn't change them): all true.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { G } from "../../game/globals";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import {
  type ItemEffectScene, pbBattleHPItem, pbBattleItemCanCureStatus, pbBattleItemCanRaiseStat, pbBattleRestorePP,
} from "../../game/items/itemUtilities";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battle, BattleChoice } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";

const REBALANCED_HEALING_ITEM_AMOUNTS = Settings.MECHANICS_GENERATION >= 7;
const RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS = Settings.MECHANICS_GENERATION >= 7;
const X_STAT_ITEMS_RAISE_BY_TWO_STAGES = Settings.X_STAT_ITEMS_RAISE_BY_TWO_STAGES;

/**
 * The scene the handlers get: CanUseInBattle's is the Bag/party screen (or the
 * battle scene, when the item is used); the others get the battle scene.
 */
interface BattleItemScene extends ItemEffectScene {
  pbRefresh(): void;
}

type CanUseInBattleProc = (item: Id, pokemon: Pokemon, battler: Battler | null, move: number | null,
  firstAction: boolean, battle: Battle, scene: BattleItemScene, showMessages: boolean) => Promise<boolean>;
type UseInBattleProc = (item: Id, battler: Battler, battle: Battle) => Promise<unknown>;
type BattleUseOnPokemonProc = (item: Id, pokemon: Pokemon, battler: Battler | null, choices: BattleChoice,
  scene: BattleItemScene) => Promise<unknown>;
type BattleUseOnBattlerProc = (item: Id, battler: Battler, scene: BattleItemScene) => Promise<unknown>;

// ItemHandlers.CanUseInBattle is typed as returning a boolean, but its
// triggers (Battle_ActionUseItem.ts, AI_Item.ts) await the handler's result.
type CanUseInBattleEntry = Parameters<typeof ItemHandlers.CanUseInBattle.add>[1];
const CanUseInBattle = {
  add: (item: Id, proc: CanUseInBattleProc) =>
    ItemHandlers.CanUseInBattle.add(item, proc as unknown as CanUseInBattleEntry),
  addIf: (cond: (item: Id) => boolean, proc: CanUseInBattleProc) =>
    ItemHandlers.CanUseInBattle.addIf(cond, proc as unknown as CanUseInBattleEntry),
  copy: (src: Id, ...dests: Id[]) => ItemHandlers.CanUseInBattle.copy(src, ...dests),
};
const UseInBattle = {
  add: (item: Id, proc: UseInBattleProc) => ItemHandlers.UseInBattle.add(item, proc),
  addIf: (cond: (item: Id) => boolean, proc: UseInBattleProc) => ItemHandlers.UseInBattle.addIf(cond, proc),
  copy: (src: Id, ...dests: Id[]) => ItemHandlers.UseInBattle.copy(src, ...dests),
};
const BattleUseOnPokemon = {
  add: (item: Id, proc: BattleUseOnPokemonProc) => ItemHandlers.BattleUseOnPokemon.add(item, proc),
  copy: (src: Id, ...dests: Id[]) => ItemHandlers.BattleUseOnPokemon.copy(src, ...dests),
};
const BattleUseOnBattler = {
  add: (item: Id, proc: BattleUseOnBattlerProc) => ItemHandlers.BattleUseOnBattler.add(item, proc),
  copy: (src: Id, ...dests: Id[]) => ItemHandlers.BattleUseOnBattler.copy(src, ...dests),
};

/** "It won't have any effect." (the message most CanUseInBattle handlers show) */
async function noEffect(scene: BattleItemScene, showMessages: boolean): Promise<void> {
  if (showMessages) await scene.pbDisplay(_INTL("It won't have any effect."));
}

//===============================================================================
// CanUseInBattle handlers
//===============================================================================
CanUseInBattle.add("GUARDSPEC", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!battler || battler.pbOwnSide().effects[PBEffects.Mist] > 0) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("POKEDOLL", async (_item, _pokemon, _battler, _move, _firstAction, battle, scene, showMessages) => {
  if (!battle.wildBattle()) {
    if (showMessages) {
      await scene.pbDisplay(_INTL("Oak's words echoed... There's a time and place for everything! But not now."));
    }
    return false;
  }
  if (!battle.canRun) {
    if (showMessages) await scene.pbDisplay(_INTL("You can't escape!"));
    return false;
  }
  return true;
});

CanUseInBattle.copy("POKEDOLL", "FLUFFYTAIL", "POKETOY");

CanUseInBattle.addIf((item) => Item.get(item).isPokeBall(), // Poké Balls
  async (item, _pokemon, battler, _move, firstAction, battle, scene, showMessages) => {
    if (battle.pbPlayer().partyFull() && G.storage.full()) {
      if (showMessages) await scene.pbDisplay(_INTL("There is no room left in the PC!"));
      return false;
    }
    if (battle.disablePokeBalls) {
      if (showMessages) await scene.pbDisplay(_INTL("You can't throw a Poké Ball!"));
      return false;
    }
    // NOTE: Using a Poké Ball consumes all your actions for the round. The code
    //       below is one half of making this happen; the other half is in def
    //       pbItemUsesAllActions?.
    if (!firstAction) {
      if (showMessages) await scene.pbDisplay(_INTL("It's impossible to aim without being focused!"));
      return false;
    }
    if (battler!.semiInvulnerable()) {
      if (showMessages) await scene.pbDisplay(_INTL("It's no good! It's impossible to aim at a Pokémon that's not in sight!"));
      return false;
    }
    // NOTE: The code below stops you from throwing a Poké Ball if there is more
    //       than one unfainted opposing Pokémon. (Snag Balls can be thrown in
    //       this case, but only in trainer battles, and the trainer will deflect
    //       them if they are trying to catch a non-Shadow Pokémon.)
    // (is_snag_ball? also counts any Poké Ball if $player.has_snag_machine,
    // which the port's Player doesn't have: false, as in CatchAndStoreMixin.ts.)
    if (battle.pbOpposingBattlerCount() > 1 && !(Item.get(item).isSnagBall() && battle.trainerBattle())) {
      if (battle.pbOpposingBattlerCount() === 2) {
        if (showMessages) await scene.pbDisplay(_INTL("It's no good! It's impossible to aim when there are two Pokémon!"));
      } else if (showMessages) {
        await scene.pbDisplay(_INTL("It's no good! It's impossible to aim when there is more than one Pokémon!"));
      }
      return false;
    }
    return true;
  },
);

CanUseInBattle.add("POTION", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!pokemon.able() || pokemon.hp === pokemon.totalhp) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.copy("POTION",
  "SUPERPOTION", "HYPERPOTION", "MAXPOTION", "BERRYJUICE", "SWEETHEART", "FRESHWATER",
  "SODAPOP", "LEMONADE", "MOOMOOMILK", "ORANBERRY", "SITRUSBERRY", "ENERGYPOWDER",
  "ENERGYROOT");
if (!RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) CanUseInBattle.copy("POTION", "RAGECANDYBAR");

CanUseInBattle.add("AWAKENING", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanCureStatus("SLEEP", pokemon, scene, showMessages);
});

CanUseInBattle.copy("AWAKENING", "CHESTOBERRY");

CanUseInBattle.add("BLUEFLUTE", async (_item, pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (battler?.hasActiveAbility("SOUNDPROOF")) {
    await noEffect(scene, showMessages);
    return false;
  }
  return pbBattleItemCanCureStatus("SLEEP", pokemon, scene, showMessages);
});

CanUseInBattle.add("ANTIDOTE", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanCureStatus("POISON", pokemon, scene, showMessages);
});

CanUseInBattle.copy("ANTIDOTE", "PECHABERRY");

CanUseInBattle.add("BURNHEAL", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanCureStatus("BURN", pokemon, scene, showMessages);
});

CanUseInBattle.copy("BURNHEAL", "RAWSTBERRY");

CanUseInBattle.add("PARALYZEHEAL", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanCureStatus("PARALYSIS", pokemon, scene, showMessages);
});

CanUseInBattle.copy("PARALYZEHEAL", "PARLYZHEAL", "CHERIBERRY");

CanUseInBattle.add("ICEHEAL", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanCureStatus("FROZEN", pokemon, scene, showMessages);
});

CanUseInBattle.copy("ICEHEAL", "ASPEARBERRY");

CanUseInBattle.add("FULLHEAL", async (_item, pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!pokemon.able() ||
      (pokemon.status === "NONE" &&
      (!battler || battler.effects[PBEffects.Confusion] === 0))) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.copy("FULLHEAL",
  "LAVACOOKIE", "OLDGATEAU", "CASTELIACONE", "LUMIOSEGALETTE", "SHALOURSABLE",
  "BIGMALASADA", "PEWTERCRUNCHIES", "LUMBERRY", "HEALPOWDER");
if (RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) CanUseInBattle.copy("FULLHEAL", "RAGECANDYBAR");

CanUseInBattle.add("FULLRESTORE", async (_item, pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!pokemon.able() ||
      (pokemon.hp === pokemon.totalhp && pokemon.status === "NONE" &&
      (!battler || battler.effects[PBEffects.Confusion] === 0))) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("REVIVE", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (pokemon.able() || pokemon.egg()) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.copy("REVIVE", "MAXREVIVE", "REVIVALHERB", "MAXHONEY");

CanUseInBattle.add("ETHER", async (_item, pokemon, _battler, move, _firstAction, _battle, scene, showMessages) => {
  // (Ruby raises NoMethodError when move is nil, as the AI passes it; here
  // pokemon.moves[null] raises a TypeError.)
  if (!pokemon.able() || move! < 0 ||
      pokemon.moves[move!]!.totalPp <= 0 ||
      pokemon.moves[move!]!.pp === pokemon.moves[move!]!.totalPp) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.copy("ETHER", "MAXETHER", "LEPPABERRY");

CanUseInBattle.add("ELIXIR", async (_item, pokemon, _battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!pokemon.able()) {
    await noEffect(scene, showMessages);
    return false;
  }
  let canRestore = false;
  for (const m of pokemon.moves) {
    if ((m.id as unknown) === 0) continue; // (never: move IDs are symbols)
    if (m.totalPp <= 0 || m.pp === m.totalPp) continue;
    canRestore = true;
    break;
  }
  if (!canRestore) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.copy("ELIXIR", "MAXELIXIR");

CanUseInBattle.add("REDFLUTE", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!battler || battler.effects[PBEffects.Attract] < 0 ||
      battler.hasActiveAbility("SOUNDPROOF")) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("PERSIMBERRY", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!battler || battler.effects[PBEffects.Confusion] === 0) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("YELLOWFLUTE", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!battler || battler.effects[PBEffects.Confusion] === 0 ||
      battler.hasActiveAbility("SOUNDPROOF")) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("XATTACK", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanRaiseStat("ATTACK", battler, scene, showMessages);
});

CanUseInBattle.copy("XATTACK", "XATTACK2", "XATTACK3", "XATTACK6");

CanUseInBattle.add("XDEFENSE", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanRaiseStat("DEFENSE", battler, scene, showMessages);
});

CanUseInBattle.copy("XDEFENSE",
  "XDEFENSE2", "XDEFENSE3", "XDEFENSE6", "XDEFEND", "XDEFEND2", "XDEFEND3", "XDEFEND6");

CanUseInBattle.add("XSPATK", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanRaiseStat("SPECIAL_ATTACK", battler, scene, showMessages);
});

CanUseInBattle.copy("XSPATK",
  "XSPATK2", "XSPATK3", "XSPATK6", "XSPECIAL", "XSPECIAL2", "XSPECIAL3", "XSPECIAL6");

CanUseInBattle.add("XSPDEF", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanRaiseStat("SPECIAL_DEFENSE", battler, scene, showMessages);
});

CanUseInBattle.copy("XSPDEF", "XSPDEF2", "XSPDEF3", "XSPDEF6");

CanUseInBattle.add("XSPEED", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanRaiseStat("SPEED", battler, scene, showMessages);
});

CanUseInBattle.copy("XSPEED", "XSPEED2", "XSPEED3", "XSPEED6");

CanUseInBattle.add("XACCURACY", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  return pbBattleItemCanRaiseStat("ACCURACY", battler, scene, showMessages);
});

CanUseInBattle.copy("XACCURACY", "XACCURACY2", "XACCURACY3", "XACCURACY6");

CanUseInBattle.add("MAXMUSHROOMS", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!(await pbBattleItemCanRaiseStat("ATTACK", battler, scene, false)) &&
      !(await pbBattleItemCanRaiseStat("DEFENSE", battler, scene, false)) &&
      !(await pbBattleItemCanRaiseStat("SPECIAL_ATTACK", battler, scene, false)) &&
      !(await pbBattleItemCanRaiseStat("SPECIAL_DEFENSE", battler, scene, false)) &&
      !(await pbBattleItemCanRaiseStat("SPEED", battler, scene, false))) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("DIREHIT", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!battler || battler.effects[PBEffects.FocusEnergy] >= 1) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("DIREHIT2", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!battler || battler.effects[PBEffects.FocusEnergy] >= 2) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("DIREHIT3", async (_item, _pokemon, battler, _move, _firstAction, _battle, scene, showMessages) => {
  if (!battler || battler.effects[PBEffects.FocusEnergy] >= 3) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

CanUseInBattle.add("POKEFLUTE", async (_item, _pokemon, _battler, _move, _firstAction, battle, scene, showMessages) => {
  if (!battle.allBattlers().some((b) => b.status === "SLEEP" && !b.hasActiveAbility("SOUNDPROOF"))) {
    await noEffect(scene, showMessages);
    return false;
  }
  return true;
});

//===============================================================================
// UseInBattle handlers
// For items used directly or on an opposing battler
//===============================================================================
UseInBattle.add("GUARDSPEC", async (_item, battler, battle) => {
  battler.pbOwnSide().effects[PBEffects.Mist] = 5;
  await battle.pbDisplay(_INTL("{1} became shrouded in mist!", battler.pbTeam()));
  battler.pokemon!.changeHappiness("battleitem");
});

UseInBattle.add("POKEDOLL", async (_item, _battler, battle) => {
  battle.decision = 3;
  await battle.pbDisplayPaused(_INTL("You got away safely!"));
});

UseInBattle.copy("POKEDOLL", "FLUFFYTAIL", "POKETOY");

UseInBattle.add("POKEFLUTE", async (_item, _battler, battle) => {
  for (const b of battle.allBattlers()) {
    if (b.status === "SLEEP" && !b.hasActiveAbility("SOUNDPROOF")) await b.pbCureStatus(false);
  }
  await battle.pbDisplay(_INTL("All Pokémon were roused by the tune!"));
});

UseInBattle.addIf((item) => Item.get(item).isPokeBall(), // Poké Balls
  async (item, battler, battle) => {
    await battle.pbThrowPokeBall(battler.index, item);
  },
);

//===============================================================================
// BattleUseOnPokemon handlers
// For items used on Pokémon or on a Pokémon's move
//===============================================================================
BattleUseOnPokemon.add("POTION", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, 20, scene);
});

BattleUseOnPokemon.copy("POTION", "BERRYJUICE", "SWEETHEART");
if (!RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) BattleUseOnPokemon.copy("POTION", "RAGECANDYBAR");

BattleUseOnPokemon.add("SUPERPOTION", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, REBALANCED_HEALING_ITEM_AMOUNTS ? 60 : 50, scene);
});

BattleUseOnPokemon.add("HYPERPOTION", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, REBALANCED_HEALING_ITEM_AMOUNTS ? 120 : 200, scene);
});

BattleUseOnPokemon.add("MAXPOTION", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, pokemon.totalhp - pokemon.hp, scene);
});

BattleUseOnPokemon.add("FRESHWATER", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, REBALANCED_HEALING_ITEM_AMOUNTS ? 30 : 50, scene);
});

BattleUseOnPokemon.add("SODAPOP", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, REBALANCED_HEALING_ITEM_AMOUNTS ? 50 : 60, scene);
});

BattleUseOnPokemon.add("LEMONADE", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, REBALANCED_HEALING_ITEM_AMOUNTS ? 70 : 80, scene);
});

BattleUseOnPokemon.add("MOOMOOMILK", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, 100, scene);
});

BattleUseOnPokemon.add("ORANBERRY", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, 10, scene);
});

BattleUseOnPokemon.add("SITRUSBERRY", async (_item, pokemon, battler, _choices, scene) => {
  return pbBattleHPItem(pokemon, battler, Math.floor(pokemon.totalhp / 4), scene);
});

BattleUseOnPokemon.add("AWAKENING", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  const name = battler ? battler.pbThis() : pokemon.name;
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} woke up.", name));
});

BattleUseOnPokemon.copy("AWAKENING", "CHESTOBERRY", "BLUEFLUTE");

BattleUseOnPokemon.add("ANTIDOTE", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  const name = battler ? battler.pbThis() : pokemon.name;
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} was cured of its poisoning.", name));
});

BattleUseOnPokemon.copy("ANTIDOTE", "PECHABERRY");

BattleUseOnPokemon.add("BURNHEAL", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  const name = battler ? battler.pbThis() : pokemon.name;
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1}'s burn was healed.", name));
});

BattleUseOnPokemon.copy("BURNHEAL", "RAWSTBERRY");

BattleUseOnPokemon.add("PARALYZEHEAL", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  const name = battler ? battler.pbThis() : pokemon.name;
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} was cured of paralysis.", name));
});

BattleUseOnPokemon.copy("PARALYZEHEAL", "PARLYZHEAL", "CHERIBERRY");

BattleUseOnPokemon.add("ICEHEAL", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  const name = battler ? battler.pbThis() : pokemon.name;
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} was thawed out.", name));
});

BattleUseOnPokemon.copy("ICEHEAL", "ASPEARBERRY");

BattleUseOnPokemon.add("FULLHEAL", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  battler?.pbCureConfusion();
  const name = battler ? battler.pbThis() : pokemon.name;
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} became healthy.", name));
});

BattleUseOnPokemon.copy("FULLHEAL",
  "LAVACOOKIE", "OLDGATEAU", "CASTELIACONE", "LUMIOSEGALETTE", "SHALOURSABLE",
  "BIGMALASADA", "PEWTERCRUNCHIES", "LUMBERRY");
if (RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) BattleUseOnPokemon.copy("FULLHEAL", "RAGECANDYBAR");

BattleUseOnPokemon.add("FULLRESTORE", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  battler?.pbCureConfusion();
  const name = battler ? battler.pbThis() : pokemon.name;
  if (pokemon.hp < pokemon.totalhp) {
    return pbBattleHPItem(pokemon, battler, pokemon.totalhp, scene);
  } else {
    scene.pbRefresh();
    await scene.pbDisplay(_INTL("{1} became healthy.", name));
  }
});

BattleUseOnPokemon.add("REVIVE", async (_item, pokemon, _battler, _choices, scene) => {
  pokemon.hp = Math.floor(pokemon.totalhp / 2);
  if (pokemon.hp <= 0) pokemon.hp = 1;
  pokemon.healStatus();
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} recovered from fainting!", pokemon.name));
});

BattleUseOnPokemon.add("MAXREVIVE", async (_item, pokemon, _battler, _choices, scene) => {
  pokemon.healHP();
  pokemon.healStatus();
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} recovered from fainting!", pokemon.name));
});

BattleUseOnPokemon.copy("MAXREVIVE", "MAXHONEY");

BattleUseOnPokemon.add("ENERGYPOWDER", async (_item, pokemon, battler, _choices, scene) => {
  if (await pbBattleHPItem(pokemon, battler, REBALANCED_HEALING_ITEM_AMOUNTS ? 60 : 50, scene)) {
    pokemon.changeHappiness("powder");
  }
});

BattleUseOnPokemon.add("ENERGYROOT", async (_item, pokemon, battler, _choices, scene) => {
  if (await pbBattleHPItem(pokemon, battler, REBALANCED_HEALING_ITEM_AMOUNTS ? 120 : 200, scene)) {
    pokemon.changeHappiness("energyroot");
  }
});

BattleUseOnPokemon.add("HEALPOWDER", async (_item, pokemon, battler, _choices, scene) => {
  pokemon.healStatus();
  await battler?.pbCureStatus(false);
  battler?.pbCureConfusion();
  pokemon.changeHappiness("powder");
  const name = battler ? battler.pbThis() : pokemon.name;
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} became healthy.", name));
});

BattleUseOnPokemon.add("REVIVALHERB", async (_item, pokemon, _battler, _choices, scene) => {
  pokemon.healHP();
  pokemon.healStatus();
  pokemon.changeHappiness("revivalherb");
  scene.pbRefresh();
  await scene.pbDisplay(_INTL("{1} recovered from fainting!", pokemon.name));
});

BattleUseOnPokemon.add("ETHER", async (_item, pokemon, battler, choices, scene) => {
  const idxMove = choices[3];
  pbBattleRestorePP(pokemon, battler, idxMove, 10);
  await scene.pbDisplay(_INTL("PP was restored."));
});

BattleUseOnPokemon.copy("ETHER", "LEPPABERRY");

BattleUseOnPokemon.add("MAXETHER", async (_item, pokemon, battler, choices, scene) => {
  const idxMove = choices[3];
  pbBattleRestorePP(pokemon, battler, idxMove, pokemon.moves[idxMove]!.totalPp);
  await scene.pbDisplay(_INTL("PP was restored."));
});

BattleUseOnPokemon.add("ELIXIR", async (_item, pokemon, battler, _choices, scene) => {
  for (let i = 0; i < pokemon.moves.length; i++) {
    pbBattleRestorePP(pokemon, battler, i, 10);
  }
  await scene.pbDisplay(_INTL("PP was restored."));
});

BattleUseOnPokemon.add("MAXELIXIR", async (_item, pokemon, battler, _choices, scene) => {
  for (let i = 0; i < pokemon.moves.length; i++) {
    pbBattleRestorePP(pokemon, battler, i, pokemon.moves[i]!.totalPp);
  }
  await scene.pbDisplay(_INTL("PP was restored."));
});

//===============================================================================
// BattleUseOnBattler handlers
// For items used on a Pokémon in battle
//===============================================================================

BattleUseOnBattler.add("REDFLUTE", async (_item, battler, scene) => {
  battler.pbCureAttract();
  await scene.pbDisplay(_INTL("{1} got over its infatuation.", battler.pbThis()));
});

BattleUseOnBattler.add("YELLOWFLUTE", async (_item, battler, scene) => {
  battler.pbCureConfusion();
  await scene.pbDisplay(_INTL("{1} snapped out of its confusion.", battler.pbThis()));
});

BattleUseOnBattler.copy("YELLOWFLUTE", "PERSIMBERRY");

/** The X items' BattleUseOnBattler handlers: raise `stat` by `increment` stages. */
function xItem(stat: Id, increment: number): BattleUseOnBattlerProc {
  return async (_item, battler, _scene) => {
    await battler.pbRaiseStatStage(stat, increment, battler);
    battler.pokemon!.changeHappiness("battleitem");
  };
}

BattleUseOnBattler.add("XATTACK", xItem("ATTACK", X_STAT_ITEMS_RAISE_BY_TWO_STAGES ? 2 : 1));

BattleUseOnBattler.add("XATTACK2", xItem("ATTACK", 2));

BattleUseOnBattler.add("XATTACK3", xItem("ATTACK", 3));

BattleUseOnBattler.add("XATTACK6", xItem("ATTACK", 6));

BattleUseOnBattler.add("XDEFENSE", xItem("DEFENSE", X_STAT_ITEMS_RAISE_BY_TWO_STAGES ? 2 : 1));

BattleUseOnBattler.copy("XDEFENSE", "XDEFEND");

BattleUseOnBattler.add("XDEFENSE2", xItem("DEFENSE", 2));

BattleUseOnBattler.copy("XDEFENSE2", "XDEFEND2");

BattleUseOnBattler.add("XDEFENSE3", xItem("DEFENSE", 3));

BattleUseOnBattler.copy("XDEFENSE3", "XDEFEND3");

BattleUseOnBattler.add("XDEFENSE6", xItem("DEFENSE", 6));

BattleUseOnBattler.copy("XDEFENSE6", "XDEFEND6");

BattleUseOnBattler.add("XSPATK", xItem("SPECIAL_ATTACK", X_STAT_ITEMS_RAISE_BY_TWO_STAGES ? 2 : 1));

BattleUseOnBattler.copy("XSPATK", "XSPECIAL");

BattleUseOnBattler.add("XSPATK2", xItem("SPECIAL_ATTACK", 2));

BattleUseOnBattler.copy("XSPATK2", "XSPECIAL2");

BattleUseOnBattler.add("XSPATK3", xItem("SPECIAL_ATTACK", 3));

BattleUseOnBattler.copy("XSPATK3", "XSPECIAL3");

BattleUseOnBattler.add("XSPATK6", xItem("SPECIAL_ATTACK", 6));

BattleUseOnBattler.copy("XSPATK6", "XSPECIAL6");

BattleUseOnBattler.add("XSPDEF", xItem("SPECIAL_DEFENSE", X_STAT_ITEMS_RAISE_BY_TWO_STAGES ? 2 : 1));

BattleUseOnBattler.add("XSPDEF2", xItem("SPECIAL_DEFENSE", 2));

BattleUseOnBattler.add("XSPDEF3", xItem("SPECIAL_DEFENSE", 3));

BattleUseOnBattler.add("XSPDEF6", xItem("SPECIAL_DEFENSE", 6));

BattleUseOnBattler.add("XSPEED", xItem("SPEED", X_STAT_ITEMS_RAISE_BY_TWO_STAGES ? 2 : 1));

BattleUseOnBattler.add("XSPEED2", xItem("SPEED", 2));

BattleUseOnBattler.add("XSPEED3", xItem("SPEED", 3));

BattleUseOnBattler.add("XSPEED6", xItem("SPEED", 6));

BattleUseOnBattler.add("XACCURACY", xItem("ACCURACY", X_STAT_ITEMS_RAISE_BY_TWO_STAGES ? 2 : 1));

BattleUseOnBattler.add("XACCURACY2", xItem("ACCURACY", 2));

BattleUseOnBattler.add("XACCURACY3", xItem("ACCURACY", 3));

BattleUseOnBattler.add("XACCURACY6", xItem("ACCURACY", 6));

BattleUseOnBattler.add("MAXMUSHROOMS", async (_item, battler, _scene) => {
  let showAnim = true;
  for (const stat of Stat.eachMainBattle()) {
    if (!(await battler.pbCanRaiseStatStage(stat.id, battler))) continue;
    await battler.pbRaiseStatStage(stat.id, 1, battler, showAnim);
    showAnim = false;
  }
  battler.pokemon!.changeHappiness("battleitem");
});

BattleUseOnBattler.add("DIREHIT", async (_item, battler, scene) => {
  battler.effects[PBEffects.FocusEnergy] = 2;
  await scene.pbDisplay(_INTL("{1} is getting pumped!", battler.pbThis()));
  battler.pokemon!.changeHappiness("battleitem");
});

BattleUseOnBattler.add("DIREHIT2", async (_item, battler, scene) => {
  battler.effects[PBEffects.FocusEnergy] = 2;
  await scene.pbDisplay(_INTL("{1} is getting pumped!", battler.pbThis()));
  battler.pokemon!.changeHappiness("battleitem");
});

BattleUseOnBattler.add("DIREHIT3", async (_item, battler, scene) => {
  battler.effects[PBEffects.FocusEnergy] = 3;
  await scene.pbDisplay(_INTL("{1} is getting pumped!", battler.pbThis()));
  battler.pokemon!.changeHappiness("battleitem");
});
