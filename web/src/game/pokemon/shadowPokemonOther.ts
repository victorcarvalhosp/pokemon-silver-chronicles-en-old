// Port of the non-battle parts of Data/Scripts/014_Pokemon/001_Pokemon-related/
// 002_ShadowPokemon_Other.rb: pbPurify, the Shadow item effects (scents and
// the Time Flute: UseOnPokemon, CanUseInBattle, BattleUseOnPokemon) with
// pbRaiseHappinessAndReduceHeart, and the event handlers (:on_start_battle
// :record_party_heart_gauges, :on_end_battle :check_ready_to_purify,
// :on_player_step_taken :lower_heart_gauges, which also runs
// $PokemonGlobal.purifyChamber.update). The Relic Stone scene/screen and
// pbRelicStone are in ../../ui/purifyChamber/RelicStone.ts.
//
// Not ported here (battle core): the Battle#pbCanUseItemOnPokemon? alias, the
// Battle::Battler overrides (pbInitPokemon, shadowPokemon?, inHyperMode?,
// pbHyperMode, pbHyperModeObedience) and the Shadow move classes
// (002_ShadowPokemon_Other.rb:163-230, 334-404).
//
// None of the scents or the Time Flute is in this game's PBS/items.txt, so
// their handlers are registered but unused.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { EventHandlers } from "../eventHandlers";
import { G } from "../globals";
import { ItemHandlers } from "../items/ItemHandlers";
import { pbChangeLevel, type ItemEffectScene } from "../items/itemUtilities";
import type { Player } from "../trainer/Player";
import type { GameStats } from "../trainer/GameStats";
import { Pokemon } from "./Pokemon";
import { PokemonUIHooks } from "./utilities";
import "../../ui/purifyChamber/PurifyChamber"; // $PokemonGlobal.purifyChamber

/** What pbPurify needs from its scene (the Relic Stone and Purify Chamber screens, an item's scene). */
export interface PurifyScene extends ItemEffectScene {
  pbDisplay(text: string): Promise<void>;
  pbConfirm(text: string): Promise<boolean>;
}

const player = () => G.player as Player;
const stats = () => G.stats as GameStats;
const temp = () => G.gameTemp as unknown as { partyHeartGaugesBeforeBattle?: (number | null)[] };

//===============================================================================
// Purify a Shadow Pokémon.
//===============================================================================
export async function pbPurify(pkmn: Pokemon, scene: PurifyScene): Promise<void> {
  if (!pkmn.shadowPokemon() || pkmn.heartGauge !== 0) return;
  stats().shadowPokemonPurified += 1;
  pkmn.shadow = false;
  pkmn.hyperMode = false;
  pkmn.giveRibbon("NATIONAL");
  await scene.pbDisplay(_INTL("{1} opened the door to its heart!", pkmn.name));
  const oldMoves: Id[] = [];
  for (const m of pkmn.moves) oldMoves.push(m.id);
  pkmn.updateShadowMoves();
  for (let i = 0; i < pkmn.moves.length; i++) {
    const m = pkmn.moves[i]!;
    if (m.id === oldMoves[i]) continue;
    await scene.pbDisplay(_INTL("{1} regained the move {2}!", pkmn.name, m.name));
  }
  pkmn.recordFirstMoves();
  if (pkmn.savedEv) {
    pkmn.addEvs(pkmn.savedEv);
    pkmn.savedEv = null;
  }
  if (pkmn.savedExp != null) {
    const newexp = pkmn.growthRate().addExp(pkmn.exp, Math.floor((pkmn.savedExp * 4) / 5) || 0);
    pkmn.savedExp = null;
    const newlevel = pkmn.growthRate().levelFromExp(newexp);
    const curlevel = pkmn.level;
    if (newexp !== pkmn.exp) {
      await scene.pbDisplay(_INTL("{1} regained {2} Exp. Points!", pkmn.name, newexp - pkmn.exp));
    }
    if (newlevel === curlevel) {
      pkmn.exp = newexp;
      pkmn.calcStats();
    } else {
      await pbChangeLevel(pkmn, newlevel, scene); // for convenience
      pkmn.exp = newexp;
    }
  }
  if (G.pokemonSystem.givenicknames === 0 &&
      await scene.pbConfirm(_INTL("Would you like to give a nickname to {1}?", pkmn.speciesName()))) {
    if (!PokemonUIHooks.enterPokemonName) throw new Error("The naming screen isn't loaded");
    const newname = await PokemonUIHooks.enterPokemonName(_INTL("{1}'s nickname?", pkmn.speciesName()),
      0, Pokemon.MAX_NAME_SIZE, "", pkmn);
    pkmn.name = newname;
  }
}

//===============================================================================
// Shadow item effects.
//===============================================================================
export async function pbRaiseHappinessAndReduceHeart(pkmn: Pokemon, scene: ItemEffectScene, multiplier: number,
  showFailMessage = true): Promise<boolean> {
  if (!pkmn.shadowPokemon() || (pkmn.happiness === 255 && pkmn.heartGauge === 0)) {
    if (showFailMessage) await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  const oldGauge = pkmn.heartGauge;
  const oldHappiness = pkmn.happiness;
  pkmn.changeHappiness("vitamin");
  pkmn.changeHeartGauge("scent", multiplier);
  if (pkmn.heartGauge === oldGauge) {
    await scene.pbDisplay(_INTL("{1} turned friendly.", pkmn.name));
  } else if (pkmn.happiness === oldHappiness) {
    await scene.pbDisplay(_INTL("{1} adores you!\nThe door to its heart opened a little.", pkmn.name));
    await pkmn.checkReadyToPurify();
  } else {
    await scene.pbDisplay(_INTL("{1} turned friendly.\nThe door to its heart opened a little.", pkmn.name));
    await pkmn.checkReadyToPurify();
  }
  return true;
}

const SCENT_MULTIPLIERS: [Id, number][] = [["JOYSCENT", 1], ["EXCITESCENT", 2], ["VIVIDSCENT", 3]];

for (const [scent, multiplier] of SCENT_MULTIPLIERS) {
  ItemHandlers.UseOnPokemon.add(scent, async (item, _qty, pkmn, sceneArg) => {
    const scene = sceneArg as unknown as ItemEffectScene;
    let ret = false;
    if (pkmn.hyperMode) {
      await scene.pbDisplay(_INTL("{1} came to its senses from the {2}.", pkmn.name, Item.get(item).name));
      pkmn.hyperMode = false;
      ret = true;
    }
    return (await pbRaiseHappinessAndReduceHeart(pkmn, scene, multiplier, !ret)) || ret;
  });
}

ItemHandlers.UseOnPokemon.add("TIMEFLUTE", async (_item, _qty, pkmn, sceneArg) => {
  const scene = sceneArg as unknown as PurifyScene;
  if (!pkmn.shadowPokemon() || pkmn.heartGauge === 0 || pkmn.isSpecies("LUGIA")) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  // NOTE (Ruby parity): 002_ShadowPokemon_Other.rb:292 calls pbPurify, which
  // returns at once unless the heart gauge is 0, which was just ruled out:
  // the Time Flute is used up and does nothing.
  await pbPurify(pkmn, scene);
  return true;
});

type CanUseInBattleEntry = Parameters<typeof ItemHandlers.CanUseInBattle.add>[1];
ItemHandlers.CanUseInBattle.add("JOYSCENT", (async (_item: Id, pokemon: Pokemon, _battler: unknown, _move: unknown,
  _firstAction: boolean, _battle: unknown, scene: ItemEffectScene, showMessages: boolean) => {
  if (!pokemon.shadowPokemon() || (pokemon.happiness === 255 && pokemon.heartGauge === 0)) {
    if (showMessages) await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  return true;
}) as unknown as CanUseInBattleEntry);

ItemHandlers.CanUseInBattle.copy("JOYSCENT", "EXCITESCENT", "VIVIDSCENT");

for (const [scent, multiplier] of SCENT_MULTIPLIERS) {
  ItemHandlers.BattleUseOnPokemon.add(scent, async (item: Id, pokemon: Pokemon, battler: { pbThis(): string } | null,
    _choices: unknown, scene: ItemEffectScene) => {
    if (pokemon.hyperMode) {
      pokemon.hyperMode = false;
      await scene.pbDisplay(_INTL("{1} came to its senses from the {2}!", battler?.pbThis() || pokemon.name, Item.get(item).name));
    }
    await pbRaiseHappinessAndReduceHeart(pokemon, scene, multiplier, false);
    return true;
  });
}

//===============================================================================
// Record current heart gauges of Pokémon in party, to see if they drop to zero
// during battle and need to say they're ready to be purified afterwards
//===============================================================================
EventHandlers.add("on_start_battle", "record_party_heart_gauges", () => {
  temp().partyHeartGaugesBeforeBattle = [];
  player().party.forEach((pkmn, i) => { temp().partyHeartGaugesBeforeBattle![i] = pkmn.heartGauge; });
});

EventHandlers.add("on_end_battle", "check_ready_to_purify", async () => {
  const gauges = temp().partyHeartGaugesBeforeBattle!;
  for (let i = 0; i < gauges.length; i++) {
    const value = gauges[i];
    const pkmn = player().party[i];
    if (!pkmn || !value || value === 0) continue;
    if (pkmn.heartGauge === 0) await pkmn.checkReadyToPurify();
  }
});

EventHandlers.add("on_player_step_taken", "lower_heart_gauges", async () => {
  await pbLowerHeartGauges();
});

/** The :lower_heart_gauges step handler. */
export async function pbLowerHeartGauges(): Promise<void> {
  for (const pkmn of player().ableParty()) {
    if (pkmn.heartGauge === 0) continue;
    if (pkmn.heartGaugeStepCounter == null) pkmn.heartGaugeStepCounter = 0;
    pkmn.heartGaugeStepCounter += 1;
    if (pkmn.heartGaugeStepCounter < 256) continue;
    const oldStage = pkmn.heartStage();
    pkmn.changeHeartGauge("walking");
    const newStage = pkmn.heartStage();
    if (newStage === 0) {
      await pkmn.checkReadyToPurify();
    } else if (newStage !== oldStage) {
      pkmn.updateShadowMoves();
    }
    pkmn.heartGaugeStepCounter = 0;
  }
  await G.pokemonGlobal.purifyChamber?.update();
}
