// Port of Data/Scripts/011_Battle/005_AI/002_AI_Item.rb, with:
// - Generation 9 Pack ([001] Battle/[003] Battle_AI.rb:24): pbEnemyItemToUse
//   (alias: revival items on fainted party members first), and
//   pbEnemyShouldUseItem? (redefined: items used on the party are registered
//   with their party index).
// Alias chain: pbEnemyItemToUse = Gen 9( core ).
//
// Ruby passes the AI itself (`self`) as ItemHandlers::CanUseInBattle's battle
// argument; a handler that uses it (only the Poké Flute's and ZUD's Z-Crystal/
// Dynamax handlers do) raises NoMethodError there. Reproduced: the AI is passed.
//
// Sorting: Ruby's sort! isn't stable for arrays of more than 7 elements, so
// tied items in such a long list may be ordered differently than here.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { BattleSubScene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { rubyDiv } from "../rubyMath";
import type { Battler } from "../battler/Battler";
import { AI, truthy } from "./Battle_AI";

/** 001_Settings.rb (computed from MECHANICS_GENERATION = 8, before Gen 9 Pack redefines it) */
const REBALANCED_HEALING_ITEM_AMOUNTS = Settings.MECHANICS_GENERATION >= 7;
const RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS = Settings.MECHANICS_GENERATION >= 7;

/**
 * ItemHandlers.triggerCanUseInBattle (013_Items/001_Item_Utilities.rb:94), as
 * in battle/Battle_ActionUseItem.ts (not imported from there: that module
 * needs Battle to be defined, and Battle imports the AI).
 */
async function triggerCanUseInBattle(item: Id, pkmn: Pokemon | null, battler: Battler | null,
  move: number | null, firstAction: boolean, battle: Battle, scene: unknown, showMessages: boolean): Promise<boolean> {
  if (!ItemHandlers.CanUseInBattle.get(item)) return true; // Can use the item by default
  return truthy(await ItemHandlers.CanUseInBattle.trigger(item, pkmn, battler, move, firstAction, battle, scene, showMessages));
}

/** [item, idxTarget] or nil */
type ItemToUse = [Id, number] | null;

/** Core's pbEnemyItemToUse (Gen 9 Pack's paldea_pbEnemyItemToUse). */
async function coreEnemyItemToUse(ai: AI, idxBattler: number): Promise<ItemToUse> {
  const battle = ai.battle;
  if (!battle.internalBattle) return null;
  const items = battle.pbGetOwnerItems(idxBattler);
  if (!items || items.length === 0) return null;
  // Determine target of item (always the Pokémon choosing the action)
  const idxTarget = idxBattler; // Battler using the item
  const battler = battle.battlers[idxTarget]!;
  const pkmn = battler.pokemon;
  // Item categories
  const hpItems: Record<Id, number> = {
    POTION: 20,
    SUPERPOTION: REBALANCED_HEALING_ITEM_AMOUNTS ? 60 : 50,
    HYPERPOTION: REBALANCED_HEALING_ITEM_AMOUNTS ? 120 : 200,
    MAXPOTION: 999,
    BERRYJUICE: 20,
    SWEETHEART: 20,
    FRESHWATER: REBALANCED_HEALING_ITEM_AMOUNTS ? 30 : 50,
    SODAPOP: REBALANCED_HEALING_ITEM_AMOUNTS ? 50 : 60,
    LEMONADE: REBALANCED_HEALING_ITEM_AMOUNTS ? 70 : 80,
    MOOMOOMILK: 100,
    ORANBERRY: 10,
    SITRUSBERRY: rubyDiv(battler.totalhp, 4),
    ENERGYPOWDER: REBALANCED_HEALING_ITEM_AMOUNTS ? 60 : 50,
    ENERGYROOT: REBALANCED_HEALING_ITEM_AMOUNTS ? 120 : 200,
  };
  if (!RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) hpItems.RAGECANDYBAR = 20;
  const fullRestoreItems: Id[] = [
    "FULLRESTORE",
  ];
  const oneStatusItems: Id[] = [ // Preferred over items that heal all status problems
    "AWAKENING", "CHESTOBERRY", "BLUEFLUTE",
    "ANTIDOTE", "PECHABERRY",
    "BURNHEAL", "RAWSTBERRY",
    "PARALYZEHEAL", "PARLYZHEAL", "CHERIBERRY",
    "ICEHEAL", "ASPEARBERRY",
  ];
  const allStatusItems: Id[] = [
    "FULLHEAL", "LAVACOOKIE", "OLDGATEAU", "CASTELIACONE", "LUMIOSEGALETTE",
    "SHALOURSABLE", "BIGMALASADA", "PEWTERCRUNCHIES", "LUMBERRY", "HEALPOWDER",
  ];
  if (RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) allStatusItems.push("RAGECANDYBAR");
  const x = Settings.X_STAT_ITEMS_RAISE_BY_TWO_STAGES ? 2 : 1;
  const xItems: Record<Id, [Id, number]> = {
    XATTACK: ["ATTACK", x],
    XATTACK2: ["ATTACK", 2],
    XATTACK3: ["ATTACK", 3],
    XATTACK6: ["ATTACK", 6],
    XDEFENSE: ["DEFENSE", x],
    XDEFENSE2: ["DEFENSE", 2],
    XDEFENSE3: ["DEFENSE", 3],
    XDEFENSE6: ["DEFENSE", 6],
    XDEFEND: ["DEFENSE", x],
    XDEFEND2: ["DEFENSE", 2],
    XDEFEND3: ["DEFENSE", 3],
    XDEFEND6: ["DEFENSE", 6],
    XSPATK: ["SPECIAL_ATTACK", x],
    XSPATK2: ["SPECIAL_ATTACK", 2],
    XSPATK3: ["SPECIAL_ATTACK", 3],
    XSPATK6: ["SPECIAL_ATTACK", 6],
    XSPECIAL: ["SPECIAL_ATTACK", x],
    XSPECIAL2: ["SPECIAL_ATTACK", 2],
    XSPECIAL3: ["SPECIAL_ATTACK", 3],
    XSPECIAL6: ["SPECIAL_ATTACK", 6],
    XSPDEF: ["SPECIAL_DEFENSE", x],
    XSPDEF2: ["SPECIAL_DEFENSE", 2],
    XSPDEF3: ["SPECIAL_DEFENSE", 3],
    XSPDEF6: ["SPECIAL_DEFENSE", 6],
    XSPEED: ["SPEED", x],
    XSPEED2: ["SPEED", 2],
    XSPEED3: ["SPEED", 3],
    XSPEED6: ["SPEED", 6],
    XACCURACY: ["ACCURACY", x],
    XACCURACY2: ["ACCURACY", 2],
    XACCURACY3: ["ACCURACY", 3],
    XACCURACY6: ["ACCURACY", 6],
  };
  const losthp = battler.totalhp - battler.hp;
  const preferFullRestore = (battler.hp <= rubyDiv(battler.totalhp * 2, 3) &&
    (battler.status !== "NONE" || battler.effects[PBEffects.Confusion] > 0));
  // Find all usable items
  const usableHPItems: [Id, number, number][] = [];
  const usableStatusItems: [Id, number][] = [];
  const usableXItems: [Id, number, number][] = [];
  for (const i of items) {
    if (!i) continue;
    if (!(await battle.pbCanUseItemOnPokemon(i, pkmn, battler, battle.scene as unknown as BattleSubScene, false))) continue;
    if (!(await triggerCanUseInBattle(i, pkmn, battler, null,
      false, ai as unknown as Battle, battle.scene, false))) continue;
    // Log HP healing items
    if (losthp > 0) {
      const power = hpItems[i];
      if (power != null) {
        usableHPItems.push([i, 5, power]);
        continue;
      }
    }
    // Log Full Restores (HP healer and status curer)
    if (fullRestoreItems.includes(i)) {
      if (losthp > 0) usableHPItems.push([i, preferFullRestore ? 3 : 7, 999]);
      if (battler.status !== "NONE" || battler.effects[PBEffects.Confusion] > 0) {
        usableStatusItems.push([i, preferFullRestore ? 3 : 9]);
      }
      continue;
    }
    // Log single status-curing items
    if (oneStatusItems.includes(i)) {
      usableStatusItems.push([i, 5]);
      continue;
    }
    // Log Full Heal-type items
    if (allStatusItems.includes(i)) {
      usableStatusItems.push([i, 7]);
      continue;
    }
    // Log stat-raising items
    if (xItems[i]) {
      const data = xItems[i]!;
      usableXItems.push([i, battler.stages[data[0]]!, data[1]]);
      continue;
    }
  }
  // Prioritise using a HP restoration item
  if (usableHPItems.length > 0 && (battler.hp <= rubyDiv(battler.totalhp, 4) ||
      (battler.hp <= rubyDiv(battler.totalhp, 2) && ai.pbAIRandom(100) < 30))) {
    usableHPItems.sort((a, b) => (a[1] === b[1]) ? a[2] - b[2] : a[1] - b[1]);
    let prevItem: [Id, number, number] | null = null;
    for (const i of usableHPItems) {
      if (i[2] >= losthp) return [i[0], idxTarget];
      prevItem = i;
    }
    return [prevItem![0], idxTarget];
  }
  // Next prioritise using a status-curing item
  if (usableStatusItems.length > 0 && ai.pbAIRandom(100) < 40) {
    usableStatusItems.sort((a, b) => a[1] - b[1]);
    return [usableStatusItems[0]![0], idxTarget];
  }
  // Next try using an X item
  if (usableXItems.length > 0 && ai.pbAIRandom(100) < 30) {
    usableXItems.sort((a, b) => (a[1] === b[1]) ? a[2] - b[2] : a[1] - b[1]);
    let prevItem: [Id, number, number] | null = null;
    for (const i of usableXItems) {
      if (prevItem && i[1] > prevItem[1]) break;
      if (i[1] + i[2] >= 6) return [i[0], idxTarget];
      prevItem = i;
    }
    return [prevItem![0], idxTarget];
  }
  return null;
}

const methods = {
  //=============================================================================
  // Decide whether the opponent should use an item on the Pokémon
  // (Generation 9 Pack: items used on the party are registered properly)
  //=============================================================================
  async pbEnemyShouldUseItem(this: AI, idxBattler: number): Promise<boolean> {
    const user = this.battle.battlers[idxBattler]!;
    const ret = await this.pbEnemyItemToUse(idxBattler);
    if (!ret) return false;
    const item = ret[0];
    let idxTarget = ret[1];
    const useType = Item.get(item).battleUse;
    if ([1, 2, 3].includes(useType) && !this.usingItemOnParty) {
      idxTarget = this.battle.battlers[idxTarget]!.pokemonIndex;
    }
    this.battle.pbRegisterItem(idxBattler, item, idxTarget);
    PBDebug.log(`[AI] ${user.pbThis()} (${user.index}) will use item ${Item.get(item).name}`);
    return true;
  },

  /**
   * Generation 9 Pack's alias: allows AI trainers to use revival items in battle.
   * NOTE: The AI will only consider using an item on the Pokémon it's currently
   *       choosing an action for (core), or on a fainted party member (Gen 9).
   */
  async pbEnemyItemToUse(this: AI, idxBattler: number): Promise<ItemToUse> {
    if (!this.battle.internalBattle) return null;
    const items = this.battle.pbGetOwnerItems(idxBattler);
    if (!items || items.length === 0) return null;
    let numFainted = 0;
    const party = this.battle.pbParty(idxBattler);
    for (const b of party) if (b!.fainted()) numFainted += 1;
    const idxFainted = this.pbDefaultChooseReviveEnemy(idxBattler, party);
    if (numFainted > 0 && idxFainted >= 0) {
      const pkmn = party[idxFainted]!;
      const reviveItems: Record<Id, number> = {
        REVIVE: 3,
        MAXREVIVE: 5,
        REVIVALHERB: 5,
        MAXHONEY: 5,
      };
      const usableReviveItems: [Id, number][] = [];
      for (const i of items) {
        if (!i) continue;
        if (!(await this.battle.pbCanUseItemOnPokemon(i, pkmn, null, this.battle.scene as unknown as BattleSubScene, false))) continue;
        if (!(await triggerCanUseInBattle(i, pkmn, null, null, false, this as unknown as Battle, this.battle.scene, false))) continue;
        if (reviveItems[i]) {
          usableReviveItems.push([i, reviveItems[i]!]);
          continue;
        }
      }
      const remaining = party.length - numFainted;
      const useChance = (remaining === 1) ? 100 : Math.floor((numFainted / party.length) * 100);
      if (usableReviveItems.length > 0 && this.pbAIRandom(100) < useChance) {
        usableReviveItems.sort((a, b) => a[1] - b[1]);
        this.usingItemOnParty = true;
        return [usableReviveItems[0]![0], idxFainted];
      }
    }
    this.usingItemOnParty = false;
    return coreEnemyItemToUse(this, idxBattler);
  },
};

type Methods = typeof methods;
declare module "./Battle_AI" {
  interface AI extends Methods {}
}
Object.assign(AI.prototype, methods);
