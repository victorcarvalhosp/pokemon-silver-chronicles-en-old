// Port of the step-based event handlers of Plugins/Generation 9 Pack Scripts/
// [000] General/[000] Pokemon.rb (lines 245-300): walking evolutions for the
// lead Pokémon, and the Mirror Herb step counter
// (PokemonGlobalMetadata#mirrorherb_steps, saved with $PokemonGlobal).

import { EventHandlers } from "../../game/eventHandlers";
import { G } from "../../game/globals";
import { shuffle } from "../../game/maxRaid/random";
import { Species } from "../../data/gameData/species";
import { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";

const player = () => G.player as unknown as Player;

declare module "../../game/globals" {
  interface PokemonGlobalMetadata {
    /** Generation 9 Pack: steps taken while a party Pokémon holds a Mirror Herb. */
    mirrorherbSteps?: number;
  }
}

//-------------------------------------------------------------------------------
// Tracks steps taken to trigger walking evolutions for the lead Pokemon.
//-------------------------------------------------------------------------------
EventHandlers.add("on_player_step_taken", "evolution_steps", () => {
  if (player().partyCount() > 0) {
    const pkmn = player().firstAblePokemon();
    // NOTE (Ruby parity): Generation 9 Pack Scripts/[000] General/[000] Pokemon.rb:256
    // calls walking_evolution on nil (NoMethodError) when the party has only
    // Eggs and fainted Pokémon.
    if (!pkmn) throw new TypeError("undefined method `walking_evolution' for nil:NilClass");
    pkmn.walkingEvolution();
  }
});

//-------------------------------------------------------------------------------
// Tracks steps taken while Pokemon in the party are holding a Mirror Herb.
// Every 100 steps, inherits Egg moves from other party members if possible.
//-------------------------------------------------------------------------------
EventHandlers.add("on_player_step_taken", "mirrorherb_step", () => {
  const global = G.pokemonGlobal;
  if (player().ableParty().some((p) => p?.hasItem("MIRRORHERB"))) {
    if (!global.mirrorherbSteps) global.mirrorherbSteps = 0;
    global.mirrorherbSteps += 1;
    // (The comment says every 100 steps; the code waits for 256.)
    if (global.mirrorherbSteps > 255) {
      let foundEggMove = false;
      for (const pkmn of player().ableParty()) {
        if (pkmn.itemId !== "MIRRORHERB") continue;
        if (pkmn.numMoves() === Pokemon.MAX_MOVES) continue;
        const babySpecies = pkmn.speciesData().getBabySpecies();
        const eggmoves = [...Species.get(babySpecies).eggMoves];
        for (const move of shuffle(eggmoves)) {
          if (pkmn.hasMove(move)) continue;
          if (!player().getPokemonWithMove(move)) continue;
          pkmn.learnMove(move);
          foundEggMove = true;
          break;
        }
        if (foundEggMove) break;
      }
      global.mirrorherbSteps = 0;
    }
  } else {
    global.mirrorherbSteps = 0;
  }
});
