// Port of Data/Scripts/013_Items/002_Item_Effects.rb: the overworld item
// handlers (UseText, UseFromBag, ConfirmUseInField, UseInField, UseOnPokemon,
// UseOnPokemonMaximum) and the :repel_counter step handler, in Ruby's order.
// The helpers they call (pbHPItem, pbChangeLevel, pbUseEVRaisingItem, ...)
// are in ./itemUtilities.ts.
//
// No plugin redefines a function of this file, but the Generation 9 Pack
// ([004] Items/[000] Item Handlers.rb) re-registers AWAKENING (+ copies),
// ICEHEAL (+ ASPEARBERRY), REVEALGLASS and ABILITYPATCH after it; those
// overrides belong to that plugin's port and must be imported after this file.
//
// Imported by the battle code and by node tests, so it only imports data and
// game modules; the screens Ruby opens (party, Bag, region map) and the
// overworld bits (fades, map transfer) are imported on demand inside the
// handler that needs them.
//
// Settings: REBALANCED_HEALING_ITEM_AMOUNTS, RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS,
// NO_VITAMIN_EV_CAP and RARE_CANDY_USABLE_AT_MAX_LEVEL are computed in
// 001_Settings.rb from MECHANICS_GENERATION (8 then; the Gen 9 Pack's
// redefinition to 9 comes later and doesn't change them).

import { Ability } from "../../data/gameData/ability";
import type { Id } from "../../data/gameData/gameData";
import { _INTL } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { PBDayNight } from "../dayNight";
import { EventHandlers } from "../eventHandlers";
import { G } from "../globals";
import type { PokemonMapMetadata } from "../PokemonMapMetadata";
import type { Pokemon } from "../pokemon/Pokemon";
import type { GameStats } from "../trainer/GameStats";
import type { Player } from "../trainer/Player";
import { ItemHandlers } from "./ItemHandlers";
import {
  type FieldItemPlayer, type ItemEffectScene, isPartyScreen, pbBikeCheck, pbChangeLevel, pbClosestHiddenItem,
  pbConfirmMessageHook, pbGainExpFromExpCandy, pbHPItem, pbItemEvolutionScene, pbItemRestoreHP,
  pbMaxUsesOfEVLoweringBerry, pbMaxUsesOfEVRaisingItem, pbMessageHook, pbNatureChangingMint,
  pbRaiseHappinessAndLowerEV, pbRestorePP, pbUseEVRaisingItem, startsWithVowel,
} from "./itemUtilities";
import type { PokemonBag } from "./PokemonBag";

const REBALANCED_HEALING_ITEM_AMOUNTS = Settings.MECHANICS_GENERATION >= 7;
const RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS = Settings.MECHANICS_GENERATION >= 7;
const NO_VITAMIN_EV_CAP = Settings.MECHANICS_GENERATION >= 8;
const RARE_CANDY_USABLE_AT_MAX_LEVEL = Settings.MECHANICS_GENERATION >= 8;

const player = () => G.player as unknown as Player;
const bag = () => G.bag as PokemonBag;
const stats = () => G.stats as GameStats;
const gamePlayer = () => G.gamePlayer as unknown as FieldItemPlayer;
const pokemonGlobal = () => G.pokemonGlobal as typeof G.pokemonGlobal & { repel?: number };
/** $PokemonMap */
const pokemonMap = () => (G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap;
/** $game_temp.fly_destination */
const flyTemp = () => G.gameTemp as unknown as { flyDestination?: unknown };

/** $game_map as these handlers use it. */
interface FieldItemMap {
  mapId: number;
  passable(x: number, y: number, d: number, selfEvent?: unknown): boolean;
  autoplay?(): void;
  refresh?(): void;
}
const gameMap = () => G.gameMap as unknown as FieldItemMap;

/** The scene a UseOnPokemon handler gets: the party screen (PokemonPartyScreen). */
interface FieldItemScene extends ItemEffectScene {
  pbConfirm(text: string): Promise<boolean>;
  pbChooseMove(pkmn: Pokemon, helptext: string, index?: number): Promise<number>;
  pbShowCommands(helptext: string, commands: string[], index?: number): Promise<number>;
  pbChoosePokemon(helptext?: string | null): Promise<number>;
  pbRefreshAnnotations?(ableProc: (pkmn: Pokemon) => boolean): void;
}
const sceneOf = (scene: unknown) => scene as FieldItemScene;

/** Integer#to_s_formatted: thousands separators. */
const toSFormatted = (n: number): string => String(n).split("").reverse().join("").match(/\d{1,3}/g)!
  .join(",").split("").reverse().join("");

/**
 * pbUseItemMessage(item) (001_Item_Utilities.rb). ui/bag/itemUtilities.ts
 * has the same function, but it's a UI module this file can't import and it
 * calls pbMessage directly instead of the swappable pbMessageHook.
 */
async function pbUseItemMessage(item: Id): Promise<void> {
  const itemname = Item.get(item).name;
  if (startsWithVowel(itemname)) {
    await pbMessageHook(_INTL("You used an {1}.", itemname));
  } else {
    await pbMessageHook(_INTL("You used a {1}.", itemname));
  }
}

/** pbWait(frames) (frames at Graphics.frame_rate 40); a hook replaces it in tests. */
let waitHook: ((numFrames: number) => Promise<void>) | null = null;
export function setFieldItemWaitHook(fn: ((numFrames: number) => Promise<void>) | null): void {
  waitHook = fn;
}
async function pbWait(numFrames: number): Promise<void> {
  if (waitHook) return waitHook(numFrames);
  const { pbWait: wait } = await import("../../ui/scenes/frames");
  await wait(numFrames);
}
/** Graphics.frame_rate */
const FRAME_RATE = 40;

/** pbEraseEscapePoint (012_Overworld/001_Overworld.rb) */
function pbEraseEscapePoint(): void {
  G.pokemonGlobal.escapePoint = [];
}

/** Systems these handlers call that aren't ported yet. */
function notPorted(what: string): void {
  console.warn(`${what} isn't ported yet`);
}

//===============================================================================
// UseText handlers
//===============================================================================
ItemHandlers.UseText.add("BICYCLE", () => {
  return G.pokemonGlobal.bicycle ? _INTL("Walk") : _INTL("Use");
});

ItemHandlers.UseText.copy("BICYCLE", "MACHBIKE", "ACROBIKE");

//===============================================================================
// UseFromBag handlers
// Return values: 0 = not used
//                1 = used
//                2 = close the Bag to use
// If there is no UseFromBag handler for an item being used from the Bag (not on
// a Pokémon), calls the UseInField handler for it instead.
//===============================================================================

ItemHandlers.UseFromBag.add("HONEY", () => {
  return 2;
});

ItemHandlers.UseFromBag.add("ESCAPEROPE", async () => {
  if (!gamePlayer().canMapTransferWithFollower()) {
    await pbMessageHook(_INTL("It can't be used when you have someone with you."));
    return 0;
  }
  const escapePoint = G.pokemonGlobal.escapePoint as number[] | null | undefined;
  if (escapePoint && escapePoint.length > 0) {
    return 2; // End screen and use item
  }
  await pbMessageHook(_INTL("Can't use that here."));
  return 0;
});

ItemHandlers.UseFromBag.add("BICYCLE", async () => {
  return (await pbBikeCheck()) ? 2 : 0;
});

ItemHandlers.UseFromBag.copy("BICYCLE", "MACHBIKE", "ACROBIKE");

ItemHandlers.UseFromBag.add("OLDROD", async () => {
  const p = gamePlayer();
  const notCliff = gameMap().passable(p.x, p.y, p.direction, p);
  if (p.pbFacingTerrainTag().canFish && (G.pokemonGlobal.surfing || notCliff)) return 2;
  await pbMessageHook(_INTL("Can't use that here."));
  return 0;
});

ItemHandlers.UseFromBag.copy("OLDROD", "GOODROD", "SUPERROD");

ItemHandlers.UseFromBag.add("ITEMFINDER", () => {
  return 2;
});

ItemHandlers.UseFromBag.copy("ITEMFINDER", "DOWSINGMCHN", "DOWSINGMACHINE");

ItemHandlers.UseFromBag.add("TOWNMAP", async () => {
  const { pbFadeOutIn } = await import("../../ui/fades");
  const { PokemonRegionMap_Scene, PokemonRegionMapScreen } = await import("../../ui/pokegear/regionMap");
  await pbFadeOutIn(async () => {
    const scene = new PokemonRegionMap_Scene(-1, false);
    const screen = new PokemonRegionMapScreen(scene);
    const ret = await screen.pbStartScreen();
    if (ret) flyTemp().flyDestination = ret;
    if (ret) return 99999; // Ugly hack to make Bag scene not reappear if flying
    return undefined;
  });
  return flyTemp().flyDestination ? 2 : 0;
});

// ItemHandlers::UseFromBag.addIf(is_machine?) (TMs, HMs and TRs) is ported
// with pbMoveTutorChoose in ui/bag/itemUtilities.ts.

//===============================================================================
// ConfirmUseInField handlers
// Return values: true/false
// Called when an item is used from the Ready Menu.
// If an item does not have this handler, it is treated as returning true.
//===============================================================================

ItemHandlers.ConfirmUseInField.add("ESCAPEROPE", async () => {
  const escape = G.pokemonGlobal.escapePoint as number[] | null | undefined;
  if (!escape || escape.length === 0) {
    await pbMessageHook(_INTL("Can't use that here."));
    return false;
  }
  if (!gamePlayer().canMapTransferWithFollower()) {
    await pbMessageHook(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  const { pbGetMapNameFromId } = await import("../../ui/planes");
  const mapname = pbGetMapNameFromId(escape[0]!);
  return pbConfirmMessageHook(_INTL("Want to escape from here and return to {1}?", mapname));
});

//===============================================================================
// UseInField handlers
// Return values: false = not used
//                true = used
// Called if an item is used from the Bag (not on a Pokémon and not a TM/HM) and
// there is no UseFromBag handler above.
// If an item has this handler, it can be registered to the Ready Menu.
//===============================================================================

/** pbRepel(item, steps) */
export async function pbRepel(item: Id, steps: number): Promise<boolean> {
  if ((pokemonGlobal().repel ?? 0) > 0) {
    await pbMessageHook(_INTL("But a repellent's effect still lingers from earlier."));
    return false;
  }
  stats().repelCount += 1;
  await pbUseItemMessage(item);
  pokemonGlobal().repel = steps;
  return true;
}

ItemHandlers.UseInField.add("REPEL", (item) => {
  return pbRepel(item, 100);
});

ItemHandlers.UseInField.add("SUPERREPEL", (item) => {
  return pbRepel(item, 200);
});

ItemHandlers.UseInField.add("MAXREPEL", (item) => {
  return pbRepel(item, 250);
});

/**
 * EventHandlers :on_player_step_taken, :repel_counter. The countdown runs
 * during the step (as in Ruby); when the repel wears off, the rest (messages,
 * choosing another repel) is returned so the caller can run it where the
 * player is blocked (Game_Player#queueBlocking), like Ruby's handler that
 * runs inside the step.
 */
export function repelCounterStep(): (() => Promise<void>) | null {
  const g = pokemonGlobal();
  if ((g.repel ?? 0) <= 0 || gamePlayer().terrainTag().ice) return null; // Shouldn't count down if on ice
  g.repel = (g.repel ?? 0) - 1;
  if (g.repel > 0) return null;
  return async () => {
    const repels: Id[] = [];
    for (const itm of Item.each()) if (itm.hasFlag("Repel")) repels.push(itm.id);
    if (!repels.some((item) => bag().has(item))) {
      await pbMessageHook(_INTL("The repellent's effect wore off!"));
      return;
    }
    if (!(await pbConfirmMessageHook(_INTL("The repellent's effect wore off! Would you like to use another one?")))) return;
    let ret: Id | null = null;
    const { pbFadeOutIn } = await import("../../ui/fades");
    const { PokemonBag_Scene, PokemonBagScreen } = await import("../../ui/bag/bag");
    await pbFadeOutIn(async () => {
      const scene = new PokemonBag_Scene();
      const screen = new PokemonBagScreen(scene, bag());
      ret = await screen.pbChooseItemScreen((item) => repels.includes(item));
    });
    if (ret) {
      const { pbUseItem } = await import("../../ui/bag/itemUtilities");
      await pbUseItem(bag(), ret);
    }
  };
}

EventHandlers.add("on_player_step_taken", "repel_counter", () => {
  const rest = repelCounterStep();
  if (!rest) return;
  const p = G.gamePlayer as unknown as { queueBlocking?(fn: () => Promise<void>): void } | null;
  if (p?.queueBlocking) p.queueBlocking(rest);
  else void rest();
});

ItemHandlers.UseInField.add("BLACKFLUTE", async (item) => {
  await pbUseItemMessage(item);
  await pbMessageHook(_INTL("Wild Pokémon will be repelled."));
  pokemonMap().blackFluteUsed = true;
  pokemonMap().whiteFluteUsed = false;
  return true;
});

ItemHandlers.UseInField.add("WHITEFLUTE", async (item) => {
  await pbUseItemMessage(item);
  await pbMessageHook(_INTL("Wild Pokémon will be lured."));
  pokemonMap().blackFluteUsed = false;
  pokemonMap().whiteFluteUsed = true;
  return true;
});

ItemHandlers.UseInField.add("HONEY", async (item) => {
  await pbUseItemMessage(item);
  // TODO(items): pbSweetScent (012_Overworld/004_Overworld_FieldMoves.rb) isn't ported.
  notPorted("pbSweetScent");
  return true;
});

ItemHandlers.UseInField.add("ESCAPEROPE", async (item) => {
  const escape = G.pokemonGlobal.escapePoint as number[] | null | undefined;
  if (!escape || escape.length === 0) {
    await pbMessageHook(_INTL("Can't use that here."));
    return false;
  }
  if (!gamePlayer().canMapTransferWithFollower()) {
    await pbMessageHook(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  await pbUseItemMessage(item);
  const { pbFadeOutIn } = await import("../../ui/fades");
  const { pbCancelVehicles } = await import("../GamePlayer");
  await pbFadeOutIn(async () => {
    const t = G.gameTemp;
    t.playerNewMapId = escape[0]!;
    t.playerNewX = escape[1]!;
    t.playerNewY = escape[2]!;
    t.playerNewDirection = escape[3]!;
    pbCancelVehicles();
    await (G.scene as unknown as { transferPlayer(): Promise<void> }).transferPlayer();
    gameMap().autoplay?.();
    gameMap().refresh?.();
  });
  pbEraseEscapePoint();
  return true;
});

ItemHandlers.UseInField.add("SACREDASH", async () => {
  if (player().pokemonCount() === 0) {
    await pbMessageHook(_INTL("There is no Pokémon."));
    return false;
  }
  let canrevive = false;
  for (const i of player().pokemonParty()) {
    if (!i.fainted()) continue;
    canrevive = true;
    break;
  }
  if (!canrevive) {
    await pbMessageHook(_INTL("It won't have any effect."));
    return false;
  }
  let revived = 0;
  const { pbFadeOutIn } = await import("../../ui/fades");
  const { PokemonParty_Scene, PokemonPartyScreen } = await import("../../ui/party/party");
  await pbFadeOutIn(async () => {
    const scene = new PokemonParty_Scene();
    const screen = new PokemonPartyScreen(scene, player().party);
    await screen.pbStartScene(_INTL("Using item..."), false);
    for (const [i, pkmn] of player().party.entries()) {
      if (!pkmn.fainted()) continue;
      revived += 1;
      pkmn.heal();
      screen.pbRefreshSingle(i);
      await screen.pbDisplay(_INTL("{1}'s HP was restored.", pkmn.name));
    }
    if (revived === 0) {
      await screen.pbDisplay(_INTL("It won't have any effect."));
    }
    await screen.pbEndScene();
  });
  return revived > 0;
});

ItemHandlers.UseInField.add("BICYCLE", async () => {
  if (await pbBikeCheck()) {
    // TODO(items): the bicycle isn't ported: pbMountBike / pbDismountBike
    // (004_Game classes/009_Game_Player.rb, with Following Pokemon EX's
    // refresh around them).
    if (G.pokemonGlobal.bicycle) {
      notPorted("pbDismountBike");
    } else {
      notPorted("pbMountBike");
    }
    return true;
  }
  return false;
});

ItemHandlers.UseInField.copy("BICYCLE", "MACHBIKE", "ACROBIKE");

/**
 * pbFishing(hasEncounter, rodType) (012_Overworld/005_Overworld_Fishing.rb).
 * TODO(items): fishing isn't ported, so nothing ever bites.
 */
async function pbFishing(_hasEncounter: boolean, _rodType: number): Promise<boolean> {
  notPorted("pbFishing");
  return false;
}

/** The three rods' UseInField handler (identical but for the encounter type and rod number). */
async function useRod(encType: Id, rodType: number): Promise<boolean> {
  const p = gamePlayer();
  const notCliff = gameMap().passable(p.x, p.y, p.direction, p);
  if (!p.pbFacingTerrainTag().canFish || (!G.pokemonGlobal.surfing && !notCliff)) {
    await pbMessageHook(_INTL("Can't use that here."));
    return false;
  }
  const { pokemonEncounters, pbEncounter } = await import("../encounters/PokemonEncounters");
  const encounter = pokemonEncounters().hasEncounterType(encType);
  if (await pbFishing(encounter, rodType)) {
    stats().fishingBattles += 1;
    await pbEncounter(encType);
  }
  return true;
}

ItemHandlers.UseInField.add("OLDROD", () => {
  return useRod("OldRod", 1);
});

ItemHandlers.UseInField.add("GOODROD", () => {
  return useRod("GoodRod", 2);
});

ItemHandlers.UseInField.add("SUPERROD", () => {
  return useRod("SuperRod", 3);
});

ItemHandlers.UseInField.add("ITEMFINDER", async (item) => {
  stats().itemfinderCount += 1;
  const event = pbClosestHiddenItem();
  const p = gamePlayer();
  if (event) {
    const offsetX = event.x - p.x;
    const offsetY = event.y - p.y;
    if (offsetX === 0 && offsetY === 0) { // Standing on the item, spin around
      for (let i = 0; i < 4; i++) {
        await pbWait(Math.floor(FRAME_RATE * 2 / 10));
        p.turnRight90();
      }
      await pbWait(Math.floor(FRAME_RATE * 3 / 10));
      await pbMessageHook(_INTL("The {1}'s indicating something right underfoot!", Item.get(item).name));
    } else { // Item is nearby, face towards it
      let direction = p.direction;
      if (Math.abs(offsetX) > Math.abs(offsetY)) {
        direction = offsetX < 0 ? 4 : 6;
      } else {
        direction = offsetY < 0 ? 8 : 2;
      }
      switch (direction) {
        case 2: p.turnDown(); break;
        case 4: p.turnLeft(); break;
        case 6: p.turnRight(); break;
        case 8: p.turnUp(); break;
      }
      await pbWait(Math.floor(FRAME_RATE * 3 / 10));
      await pbMessageHook(_INTL("Huh? The {1}'s responding!\x01", Item.get(item).name));
      await pbMessageHook(_INTL("There's an item buried around here!"));
    }
  } else {
    await pbMessageHook(_INTL("... \\wt[10]... \\wt[10]... \\wt[10]...\\wt[10]Nope! There's no response."));
  }
  return true;
});

ItemHandlers.UseInField.copy("ITEMFINDER", "DOWSINGMCHN", "DOWSINGMACHINE");

ItemHandlers.UseInField.add("TOWNMAP", async () => {
  if (flyTemp().flyDestination == null) {
    const { pbShowMap } = await import("../../ui/pokegear/regionMap");
    await pbShowMap(-1, false);
  }
  // pbFlyToNewLocation (012_Overworld/004_Overworld_FieldMoves.rb)
  const { FieldActions } = await import("../../ui/menus/menuScreens");
  if (FieldActions.flyToNewLocation) {
    await FieldActions.flyToNewLocation();
  } else {
    // TODO(items): pbFlyToNewLocation (Fly) isn't ported.
    notPorted("pbFlyToNewLocation");
  }
  return true;
});

ItemHandlers.UseInField.add("COINCASE", async () => {
  await pbMessageHook(_INTL("Coins: {1}", toSFormatted(player().coins)));
  return true;
});

ItemHandlers.UseInField.add("EXPALL", async () => {
  bag().replaceItem("EXPALL", "EXPALLOFF");
  await pbMessageHook(_INTL("The Exp Share was turned off."));
  return true;
});

ItemHandlers.UseInField.add("EXPALLOFF", async () => {
  bag().replaceItem("EXPALLOFF", "EXPALL");
  await pbMessageHook(_INTL("The Exp Share was turned on."));
  return true;
});

//===============================================================================
// UseOnPokemon handlers
//===============================================================================

// Applies to all items defined as an evolution stone.
// No need to add more code for new ones.
ItemHandlers.UseOnPokemon.addIf((item) => !!Item.tryGet(item)?.isEvolutionStone(),
  async (item, _qty, pkmn, sceneArg) => {
    const scene = sceneOf(sceneArg);
    if (pkmn.shadowPokemon()) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    const newspecies = pkmn.checkEvolutionOnUseItem(item);
    if (newspecies) {
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

ItemHandlers.UseOnPokemon.add("POTION", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, 20, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.copy("POTION", "BERRYJUICE", "SWEETHEART");
if (!RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) ItemHandlers.UseOnPokemon.copy("POTION", "RAGECANDYBAR");

ItemHandlers.UseOnPokemon.add("SUPERPOTION", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, REBALANCED_HEALING_ITEM_AMOUNTS ? 60 : 50, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("HYPERPOTION", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, REBALANCED_HEALING_ITEM_AMOUNTS ? 120 : 200, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("MAXPOTION", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, pkmn.totalhp - pkmn.hp, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("FRESHWATER", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, REBALANCED_HEALING_ITEM_AMOUNTS ? 30 : 50, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("SODAPOP", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, REBALANCED_HEALING_ITEM_AMOUNTS ? 50 : 60, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("LEMONADE", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, REBALANCED_HEALING_ITEM_AMOUNTS ? 70 : 80, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("MOOMOOMILK", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, 100, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("ORANBERRY", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, 10, sceneOf(scene));
});

ItemHandlers.UseOnPokemon.add("SITRUSBERRY", (_item, _qty, pkmn, scene) => {
  return pbHPItem(pkmn, Math.floor(pkmn.totalhp / 4), sceneOf(scene));
});

/** The status-curing items: Awakening, Antidote, Burn Heal, Paralyze Heal, Ice Heal. */
function statusHealer(status: Id, message: (pkmn: Pokemon) => string) {
  return async (_item: Id, _qty: number, pkmn: Pokemon, sceneArg: unknown): Promise<boolean> => {
    const scene = sceneOf(sceneArg);
    if (pkmn.fainted() || pkmn.status !== status) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    pkmn.healStatus();
    scene.pbRefresh?.();
    await scene.pbDisplay(message(pkmn));
    return true;
  };
}

ItemHandlers.UseOnPokemon.add("AWAKENING", statusHealer("SLEEP", (pkmn) => _INTL("{1} woke up.", pkmn.name)));

ItemHandlers.UseOnPokemon.copy("AWAKENING", "CHESTOBERRY", "BLUEFLUTE", "POKEFLUTE");

ItemHandlers.UseOnPokemon.add("ANTIDOTE", statusHealer("POISON", (pkmn) => _INTL("{1} was cured of its poisoning.", pkmn.name)));

ItemHandlers.UseOnPokemon.copy("ANTIDOTE", "PECHABERRY");

ItemHandlers.UseOnPokemon.add("BURNHEAL", statusHealer("BURN", (pkmn) => _INTL("{1}'s burn was healed.", pkmn.name)));

ItemHandlers.UseOnPokemon.copy("BURNHEAL", "RAWSTBERRY");

ItemHandlers.UseOnPokemon.add("PARALYZEHEAL", statusHealer("PARALYSIS", (pkmn) => _INTL("{1} was cured of paralysis.", pkmn.name)));

ItemHandlers.UseOnPokemon.copy("PARALYZEHEAL", "PARLYZHEAL", "CHERIBERRY");

ItemHandlers.UseOnPokemon.add("ICEHEAL", statusHealer("FROZEN", (pkmn) => _INTL("{1} was thawed out.", pkmn.name)));

ItemHandlers.UseOnPokemon.copy("ICEHEAL", "ASPEARBERRY");

ItemHandlers.UseOnPokemon.add("FULLHEAL", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.fainted() || pkmn.status === "NONE") {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  pkmn.healStatus();
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1} became healthy.", pkmn.name));
  return true;
});

ItemHandlers.UseOnPokemon.copy("FULLHEAL",
  "LAVACOOKIE", "OLDGATEAU", "CASTELIACONE", "LUMIOSEGALETTE", "SHALOURSABLE",
  "BIGMALASADA", "PEWTERCRUNCHIES", "LUMBERRY");
if (RAGE_CANDY_BAR_CURES_STATUS_PROBLEMS) ItemHandlers.UseOnPokemon.copy("FULLHEAL", "RAGECANDYBAR");

ItemHandlers.UseOnPokemon.add("FULLRESTORE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.fainted() || (pkmn.hp === pkmn.totalhp && pkmn.status === "NONE")) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  const hpgain = pbItemRestoreHP(pkmn, pkmn.totalhp - pkmn.hp);
  pkmn.healStatus();
  scene.pbRefresh?.();
  if (hpgain > 0) {
    await scene.pbDisplay(_INTL("{1}'s HP was restored by {2} points.", pkmn.name, hpgain));
  } else {
    await scene.pbDisplay(_INTL("{1} became healthy.", pkmn.name));
  }
  return true;
});

ItemHandlers.UseOnPokemon.add("REVIVE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.fainted()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  pkmn.hp = Math.floor(pkmn.totalhp / 2);
  if (pkmn.hp <= 0) pkmn.hp = 1;
  pkmn.healStatus();
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1}'s HP was restored.", pkmn.name));
  return true;
});

ItemHandlers.UseOnPokemon.add("MAXREVIVE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.fainted()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  pkmn.healHP();
  pkmn.healStatus();
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1}'s HP was restored.", pkmn.name));
  return true;
});

ItemHandlers.UseOnPokemon.copy("MAXREVIVE", "MAXHONEY");

ItemHandlers.UseOnPokemon.add("ENERGYPOWDER", async (_item, _qty, pkmn, scene) => {
  if (await pbHPItem(pkmn, REBALANCED_HEALING_ITEM_AMOUNTS ? 60 : 50, sceneOf(scene))) {
    pkmn.changeHappiness("powder");
    return true;
  }
  return false;
});

ItemHandlers.UseOnPokemon.add("ENERGYROOT", async (_item, _qty, pkmn, scene) => {
  if (await pbHPItem(pkmn, REBALANCED_HEALING_ITEM_AMOUNTS ? 120 : 200, sceneOf(scene))) {
    pkmn.changeHappiness("energyroot");
    return true;
  }
  return false;
});

ItemHandlers.UseOnPokemon.add("HEALPOWDER", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.fainted() || pkmn.status === "NONE") {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  pkmn.healStatus();
  pkmn.changeHappiness("powder");
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1} became healthy.", pkmn.name));
  return true;
});

ItemHandlers.UseOnPokemon.add("REVIVALHERB", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.fainted()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  pkmn.healHP();
  pkmn.healStatus();
  pkmn.changeHappiness("revivalherb");
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1}'s HP was restored.", pkmn.name));
  return true;
});

ItemHandlers.UseOnPokemon.add("ETHER", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  const move = await scene.pbChooseMove(pkmn, _INTL("Restore which move?"));
  if (move < 0) return false;
  if (pbRestorePP(pkmn, move, 10) === 0) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  await scene.pbDisplay(_INTL("PP was restored."));
  return true;
});

ItemHandlers.UseOnPokemon.copy("ETHER", "LEPPABERRY");

ItemHandlers.UseOnPokemon.add("MAXETHER", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  const move = await scene.pbChooseMove(pkmn, _INTL("Restore which move?"));
  if (move < 0) return false;
  if (pbRestorePP(pkmn, move, pkmn.moves[move]!.totalPp - pkmn.moves[move]!.pp) === 0) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  await scene.pbDisplay(_INTL("PP was restored."));
  return true;
});

ItemHandlers.UseOnPokemon.add("ELIXIR", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  let pprestored = 0;
  for (let i = 0; i < pkmn.moves.length; i++) {
    pprestored += pbRestorePP(pkmn, i, 10);
  }
  if (pprestored === 0) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  await scene.pbDisplay(_INTL("PP was restored."));
  return true;
});

ItemHandlers.UseOnPokemon.add("MAXELIXIR", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  let pprestored = 0;
  for (let i = 0; i < pkmn.moves.length; i++) {
    pprestored += pbRestorePP(pkmn, i, pkmn.moves[i]!.totalPp - pkmn.moves[i]!.pp);
  }
  if (pprestored === 0) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  await scene.pbDisplay(_INTL("PP was restored."));
  return true;
});

ItemHandlers.UseOnPokemon.add("PPUP", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  const move = await scene.pbChooseMove(pkmn, _INTL("Boost PP of which move?"));
  if (move >= 0) {
    if (pkmn.moves[move]!.totalPp <= 1 || pkmn.moves[move]!.ppup >= 3) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    pkmn.moves[move]!.ppup += 1;
    const movename = pkmn.moves[move]!.name;
    await scene.pbDisplay(_INTL("{1}'s PP increased.", movename));
    return true;
  }
  return false;
});

ItemHandlers.UseOnPokemon.add("PPMAX", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  const move = await scene.pbChooseMove(pkmn, _INTL("Boost PP of which move?"));
  if (move >= 0) {
    if (pkmn.moves[move]!.totalPp <= 1 || pkmn.moves[move]!.ppup >= 3) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    pkmn.moves[move]!.ppup = 3;
    const movename = pkmn.moves[move]!.name;
    await scene.pbDisplay(_INTL("{1}'s PP increased.", movename));
    return true;
  }
  return false;
});

// Vitamins: [item, stat]. Each gets a UseOnPokemonMaximum then a UseOnPokemon
// handler, as in Ruby.
for (const [item, stat] of [
  ["HPUP", "HP"], ["PROTEIN", "ATTACK"], ["IRON", "DEFENSE"], ["CALCIUM", "SPECIAL_ATTACK"],
  ["ZINC", "SPECIAL_DEFENSE"], ["CARBOS", "SPEED"],
] as const) {
  ItemHandlers.UseOnPokemonMaximum.add(item, (_item, pkmn) => {
    return pbMaxUsesOfEVRaisingItem(stat, 10, pkmn, NO_VITAMIN_EV_CAP);
  });

  ItemHandlers.UseOnPokemon.add(item, (_item, qty, pkmn, scene) => {
    return pbUseEVRaisingItem(stat, 10, qty, pkmn, "vitamin", sceneOf(scene), NO_VITAMIN_EV_CAP);
  });
}

// Feathers: [item, its Wing alias, stat].
for (const [item, wing, stat] of [
  ["HEALTHFEATHER", "HEALTHWING", "HP"], ["MUSCLEFEATHER", "MUSCLEWING", "ATTACK"],
  ["RESISTFEATHER", "RESISTWING", "DEFENSE"], ["GENIUSFEATHER", "GENIUSWING", "SPECIAL_ATTACK"],
  ["CLEVERFEATHER", "CLEVERWING", "SPECIAL_DEFENSE"], ["SWIFTFEATHER", "SWIFTWING", "SPEED"],
] as const) {
  ItemHandlers.UseOnPokemonMaximum.add(item, (_item, pkmn) => {
    return pbMaxUsesOfEVRaisingItem(stat, 1, pkmn, true);
  });

  ItemHandlers.UseOnPokemonMaximum.copy(item, wing);

  ItemHandlers.UseOnPokemon.add(item, (_item, qty, pkmn, scene) => {
    return pbUseEVRaisingItem(stat, 1, qty, pkmn, "wing", sceneOf(scene), true);
  });

  ItemHandlers.UseOnPokemon.copy(item, wing);
}

// Mints: [item, nature]
for (const [mint, nature] of [
  ["LONELYMINT", "LONELY"], ["ADAMANTMINT", "ADAMANT"], ["NAUGHTYMINT", "NAUGHTY"], ["BRAVEMINT", "BRAVE"],
  ["BOLDMINT", "BOLD"], ["IMPISHMINT", "IMPISH"], ["LAXMINT", "LAX"], ["RELAXEDMINT", "RELAXED"],
  ["MODESTMINT", "MODEST"], ["MILDMINT", "MILD"], ["RASHMINT", "RASH"], ["QUIETMINT", "QUIET"],
  ["CALMMINT", "CALM"], ["GENTLEMINT", "GENTLE"], ["CAREFULMINT", "CAREFUL"], ["SASSYMINT", "SASSY"],
  ["TIMIDMINT", "TIMID"], ["HASTYMINT", "HASTY"], ["JOLLYMINT", "JOLLY"], ["NAIVEMINT", "NAIVE"],
  ["SERIOUSMINT", "SERIOUS"],
] as const) {
  ItemHandlers.UseOnPokemon.add(mint, (item, _qty, pkmn, scene) => {
    return pbNatureChangingMint(nature, item, pkmn, sceneOf(scene));
  });
}

ItemHandlers.UseOnPokemonMaximum.add("RARECANDY", (_item, pkmn) => {
  return GrowthRate.maxLevel() - pkmn.level;
});

ItemHandlers.UseOnPokemon.add("RARECANDY", async (_item, qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (pkmn.shadowPokemon()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  if (pkmn.level >= GrowthRate.maxLevel()) {
    const newSpecies = pkmn.checkEvolutionOnLevelUp();
    if (!RARE_CANDY_USABLE_AT_MAX_LEVEL || !newSpecies) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    // Check for evolution
    await pbItemEvolutionScene(pkmn, newSpecies, true, () => {
      if (isPartyScreen(scene)) scene.pbRefresh?.();
    });
    return true;
  }
  // Level up
  await pbChangeLevel(pkmn, pkmn.level + qty, scene);
  scene.pbHardRefresh?.();
  return true;
});

// Exp. Candies: [item, Exp. per candy]
for (const [item, gainAmount] of [
  ["EXPCANDYXS", 100], ["EXPCANDYS", 800], ["EXPCANDYM", 3_000], ["EXPCANDYL", 10_000], ["EXPCANDYXL", 30_000],
] as const) {
  ItemHandlers.UseOnPokemonMaximum.add(item, (_item, pkmn) => {
    return Math.ceil((pkmn.growthRate().maximumExp() - pkmn.exp) / gainAmount);
  });

  ItemHandlers.UseOnPokemon.add(item, (_item, qty, pkmn, scene) => {
    return pbGainExpFromExpCandy(pkmn, gainAmount, qty, sceneOf(scene));
  });
}

// EV-lowering berries: [item, stat, stat name as the messages say it]
for (const [berry, stat] of [
  ["POMEGBERRY", "HP"], ["KELPSYBERRY", "ATTACK"], ["QUALOTBERRY", "DEFENSE"],
  ["HONDEWBERRY", "SPECIAL_ATTACK"], ["GREPABERRY", "SPECIAL_DEFENSE"], ["TAMATOBERRY", "SPEED"],
] as const) {
  ItemHandlers.UseOnPokemonMaximum.add(berry, (_item, pkmn) => {
    return pbMaxUsesOfEVLoweringBerry(stat, pkmn);
  });

  ItemHandlers.UseOnPokemon.add(berry, (_item, qty, pkmn, scene) => {
    return pbRaiseHappinessAndLowerEV(pkmn, sceneOf(scene), stat, qty, evBerryMessages(stat, pkmn));
  });
}

/** The three messages each EV-lowering berry passes to pbRaiseHappinessAndLowerEV. */
function evBerryMessages(stat: Id, pkmn: Pokemon): string[] {
  switch (stat) {
    case "HP":
      return [
        _INTL("{1} adores you! Its base HP fell!", pkmn.name),
        _INTL("{1} became more friendly. Its base HP can't go lower.", pkmn.name),
        _INTL("{1} became more friendly. However, its base HP fell!", pkmn.name),
      ];
    case "ATTACK":
      return [
        _INTL("{1} adores you! Its base Attack fell!", pkmn.name),
        _INTL("{1} became more friendly. Its base Attack can't go lower.", pkmn.name),
        _INTL("{1} became more friendly. However, its base Attack fell!", pkmn.name),
      ];
    case "DEFENSE":
      return [
        _INTL("{1} adores you! Its base Defense fell!", pkmn.name),
        _INTL("{1} became more friendly. Its base Defense can't go lower.", pkmn.name),
        _INTL("{1} became more friendly. However, its base Defense fell!", pkmn.name),
      ];
    case "SPECIAL_ATTACK":
      return [
        _INTL("{1} adores you! Its base Special Attack fell!", pkmn.name),
        _INTL("{1} became more friendly. Its base Special Attack can't go lower.", pkmn.name),
        _INTL("{1} became more friendly. However, its base Special Attack fell!", pkmn.name),
      ];
    case "SPECIAL_DEFENSE":
      return [
        _INTL("{1} adores you! Its base Special Defense fell!", pkmn.name),
        _INTL("{1} became more friendly. Its base Special Defense can't go lower.", pkmn.name),
        _INTL("{1} became more friendly. However, its base Special Defense fell!", pkmn.name),
      ];
    default: // SPEED
      return [
        _INTL("{1} adores you! Its base Speed fell!", pkmn.name),
        _INTL("{1} became more friendly. Its base Speed can't go lower.", pkmn.name),
        _INTL("{1} became more friendly. However, its base Speed fell!", pkmn.name),
      ];
  }
}

ItemHandlers.UseOnPokemon.add("ABILITYCAPSULE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (await scene.pbConfirm(_INTL("Do you want to change {1}'s Ability?", pkmn.name))) {
    const abils = pkmn.getAbilityList();
    let abil1: Id | null = null;
    let abil2: Id | null = null;
    for (const i of abils) {
      if (i[1] === 0) abil1 = i[0];
      if (i[1] === 1) abil2 = i[0];
    }
    if (abil1 == null || abil2 == null || pkmn.hasHiddenAbility() || pkmn.isSpecies("ZYGARDE")) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    const newabil = (pkmn.abilityIndex + 1) % 2;
    const newabilname = Ability.get(newabil === 0 ? abil1 : abil2).name;
    pkmn.abilityIndex = newabil;
    pkmn.ability = null;
    scene.pbRefresh?.();
    await scene.pbDisplay(_INTL("{1}'s Ability changed! Its Ability is now {2}!", pkmn.name, newabilname));
    return true;
  }
  return false;
});

ItemHandlers.UseOnPokemon.add("ABILITYPATCH", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (await scene.pbConfirm(_INTL("Do you want to change {1}'s Ability?", pkmn.name))) {
    const abils = pkmn.getAbilityList();
    let newAbilityId: Id | null = null;
    for (const a of abils) if (a[1] === 2) newAbilityId = a[0];
    if (!newAbilityId || pkmn.hasHiddenAbility() || pkmn.isSpecies("ZYGARDE")) {
      await scene.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    const newAbilityName = Ability.get(newAbilityId).name;
    pkmn.abilityIndex = 2;
    pkmn.ability = null;
    scene.pbRefresh?.();
    await scene.pbDisplay(_INTL("{1}'s Ability changed! Its Ability is now {2}!",
      pkmn.name, newAbilityName));
    return true;
  }
  return false;
});

ItemHandlers.UseOnPokemon.add("GRACIDEA", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.isSpecies("SHAYMIN") || pkmn.form !== 0 ||
      pkmn.status === "FROZEN" || PBDayNight.isNight()) {
    await scene.pbDisplay(_INTL("It had no effect."));
    return false;
  } else if (pkmn.fainted()) {
    await scene.pbDisplay(_INTL("This can't be used on the fainted Pokémon."));
    return false;
  }
  await pkmn.setForm(1, async () => {
    scene.pbRefresh?.();
    await scene.pbDisplay(_INTL("{1} changed Forme!", pkmn.name));
  });
  return true;
});

/** Oricorio's nectars: the form each one gives. */
for (const [nectar, form] of [["REDNECTAR", 0], ["YELLOWNECTAR", 1], ["PINKNECTAR", 2], ["PURPLENECTAR", 3]] as const) {
  ItemHandlers.UseOnPokemon.add(nectar, async (_item, _qty, pkmn, sceneArg) => {
    const scene = sceneOf(sceneArg);
    if (!pkmn.isSpecies("ORICORIO") || pkmn.form === form) {
      await scene.pbDisplay(_INTL("It had no effect."));
      return false;
    } else if (pkmn.fainted()) {
      await scene.pbDisplay(_INTL("This can't be used on the fainted Pokémon."));
      return false;
    }
    await pkmn.setForm(form, async () => {
      scene.pbRefresh?.();
      await scene.pbDisplay(_INTL("{1} changed form!", pkmn.name));
    });
    return true;
  });
}

ItemHandlers.UseOnPokemon.add("REVEALGLASS", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.isSpecies("TORNADUS") &&
      !pkmn.isSpecies("THUNDURUS") &&
      !pkmn.isSpecies("LANDORUS")) {
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

ItemHandlers.UseOnPokemon.add("PRISONBOTTLE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.isSpecies("HOOPA")) {
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

ItemHandlers.UseOnPokemon.add("ROTOMCATALOG", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.isSpecies("ROTOM")) {
    await scene.pbDisplay(_INTL("It had no effect."));
    return false;
  } else if (pkmn.fainted()) {
    await scene.pbDisplay(_INTL("This can't be used on the fainted Pokémon."));
    return false;
  }
  const choices = [
    _INTL("Light bulb"),
    _INTL("Microwave oven"),
    _INTL("Washing machine"),
    _INTL("Refrigerator"),
    _INTL("Electric fan"),
    _INTL("Lawn mower"),
    _INTL("Cancel"),
  ];
  const newForm = await scene.pbShowCommands(_INTL("Which appliance would you like to order?"),
    choices, pkmn.form);
  if (newForm === pkmn.form) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  } else if (newForm > 0 && newForm < choices.length - 1) {
    // NOTE: as in Ruby, choosing "Light bulb" (0) from another form does
    // nothing (new_form > 0), so Rotom can't go back to its base form.
    await pkmn.setForm(newForm, async () => {
      scene.pbRefresh?.();
      await scene.pbDisplay(_INTL("{1} transformed!", pkmn.name));
    });
    return true;
  }
  return false;
});

ItemHandlers.UseOnPokemon.add("ZYGARDECUBE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneOf(sceneArg);
  if (!pkmn.isSpecies("ZYGARDE")) {
    await scene.pbDisplay(_INTL("It had no effect."));
    return false;
  } else if (pkmn.fainted()) {
    await scene.pbDisplay(_INTL("This can't be used on the fainted Pokémon."));
    return false;
  }
  switch (await scene.pbShowCommands(_INTL("What will you do with {1}?", pkmn.name),
    [_INTL("Change form"), _INTL("Change Ability"), _INTL("Cancel")])) {
    case 0: { // Change form
      const newForm = pkmn.form === 0 ? 1 : 0;
      await pkmn.setForm(newForm, async () => {
        scene.pbRefresh?.();
        await scene.pbDisplay(_INTL("{1} transformed!", pkmn.name));
      });
      return true;
    }
    case 1: { // Change ability
      const newAbil = (pkmn.abilityIndex + 1) % 2;
      pkmn.abilityIndex = newAbil;
      pkmn.ability = null;
      scene.pbRefresh?.();
      await scene.pbDisplay(_INTL("{1}'s Ability changed! Its Ability is now {2}!", pkmn.name, pkmn.ability!.name));
      return true;
    }
  }
  return false;
});

/**
 * The fusing items (DNA Splicers, N-Solarizer, N-Lunarizer, Reins of Unity):
 * `canFuseWith` is the "It cannot be fused with that Pokémon." check, `form`
 * the form the fusion gives.
 */
function fuseHandler(species: Id, item: Id, usedItem: Id, canFuseWith: (other: Pokemon) => boolean,
  form: (other: Pokemon) => number) {
  return async (_item: Id, _qty: number, pkmn: Pokemon, sceneArg: unknown): Promise<boolean> => {
    const scene = sceneOf(sceneArg);
    if (!pkmn.isSpecies(species) || pkmn.fused != null) {
      await scene.pbDisplay(_INTL("It had no effect."));
      return false;
    } else if (pkmn.fainted()) {
      await scene.pbDisplay(_INTL("This can't be used on the fainted Pokémon."));
      return false;
    }
    // Fusing
    const chosen = await scene.pbChoosePokemon(_INTL("Fuse with which Pokémon?"));
    if (chosen < 0) return false;
    const otherPkmn = player().party[chosen]!;
    if (pkmn === otherPkmn) {
      await scene.pbDisplay(_INTL("It cannot be fused with itself."));
      return false;
    } else if (otherPkmn.egg()) {
      await scene.pbDisplay(_INTL("It cannot be fused with an Egg."));
      return false;
    } else if (otherPkmn.fainted()) {
      await scene.pbDisplay(_INTL("It cannot be fused with that fainted Pokémon."));
      return false;
    } else if (!canFuseWith(otherPkmn)) {
      await scene.pbDisplay(_INTL("It cannot be fused with that Pokémon."));
      return false;
    }
    await pkmn.setForm(form(otherPkmn), async () => {
      pkmn.fused = otherPkmn;
      player().removePokemonAtIndex(chosen);
      scene.pbHardRefresh?.();
      await scene.pbDisplay(_INTL("{1} changed Forme!", pkmn.name));
    });
    bag().replaceItem(item, usedItem);
    return true;
  };
}

/**
 * The "used" fusing items, which unfuse. `formCheck` is the extra
 * `pkmn.form != n` condition the N-Solarizer/N-Lunarizer have.
 */
function unfuseHandler(species: Id, item: Id, unusedItem: Id, formCheck: number | null) {
  return async (_item: Id, _qty: number, pkmn: Pokemon, sceneArg: unknown): Promise<boolean> => {
    const scene = sceneOf(sceneArg);
    if (!pkmn.isSpecies(species) || (formCheck != null && pkmn.form !== formCheck) || pkmn.fused == null) {
      await scene.pbDisplay(_INTL("It had no effect."));
      return false;
    } else if (pkmn.fainted()) {
      await scene.pbDisplay(_INTL("This can't be used on the fainted Pokémon."));
      return false;
    } else if (player().partyFull()) {
      await scene.pbDisplay(_INTL("You have no room to separate the Pokémon."));
      return false;
    }
    // Unfusing
    await pkmn.setForm(0, async () => {
      player().party[player().party.length] = pkmn.fused!;
      pkmn.fused = null;
      scene.pbHardRefresh?.();
      await scene.pbDisplay(_INTL("{1} changed Forme!", pkmn.name));
    });
    bag().replaceItem(item, unusedItem);
    return true;
  };
}

ItemHandlers.UseOnPokemon.add("DNASPLICERS", fuseHandler("KYUREM", "DNASPLICERS", "DNASPLICERSUSED",
  (other) => other.isSpecies("RESHIRAM") || other.isSpecies("ZEKROM"),
  (other) => {
    let newForm = 0;
    if (other.isSpecies("RESHIRAM")) newForm = 1;
    if (other.isSpecies("ZEKROM")) newForm = 2;
    return newForm;
  }));

ItemHandlers.UseOnPokemon.add("DNASPLICERSUSED", unfuseHandler("KYUREM", "DNASPLICERSUSED", "DNASPLICERS", null));

ItemHandlers.UseOnPokemon.add("NSOLARIZER", fuseHandler("NECROZMA", "NSOLARIZER", "NSOLARIZERUSED",
  (other) => other.isSpecies("SOLGALEO"), () => 1));

ItemHandlers.UseOnPokemon.add("NSOLARIZERUSED", unfuseHandler("NECROZMA", "NSOLARIZERUSED", "NSOLARIZER", 1));

ItemHandlers.UseOnPokemon.add("NLUNARIZER", fuseHandler("NECROZMA", "NLUNARIZER", "NLUNARIZERUSED",
  (other) => other.isSpecies("LUNALA"), () => 2));

ItemHandlers.UseOnPokemon.add("NLUNARIZERUSED", unfuseHandler("NECROZMA", "NLUNARIZERUSED", "NLUNARIZER", 2));

ItemHandlers.UseOnPokemon.add("REINSOFUNITY", fuseHandler("CALYREX", "REINSOFUNITY", "REINSOFUNITYUSED",
  (other) => other.isSpecies("GLASTRIER") || other.isSpecies("SPECTRIER"),
  (other) => {
    let newForm = 0;
    if (other.isSpecies("GLASTRIER")) newForm = 1;
    if (other.isSpecies("SPECTRIER")) newForm = 2;
    return newForm;
  }));

ItemHandlers.UseOnPokemon.add("REINSOFUNITYUSED", unfuseHandler("CALYREX", "REINSOFUNITYUSED", "REINSOFUNITY", null));
