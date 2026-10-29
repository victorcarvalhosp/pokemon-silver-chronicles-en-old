// Port of Plugins/Triple Triad Booster Packs/TripleTriad_Improvements.rb
// ("Triple Triad changes made by victordevjs"): the new card shop and the
// binder entry point. Its TriadCard methods (createImprovedBack,
// createModifiedBitmap) are in TripleTriad.ts.

import type { Id } from "../data/gameData/gameData";
import { Species } from "../data/gameData/species";
import { _INTL } from "../ui/messageConfig";
import { toSFormatted } from "../ui/mart/PokemonMart";
import { player } from "./common";
import { TripleTriadBinder_Scene, TripleTriadBinderScreen } from "./TripleTriad_Binder";
import { runTriadShop, TriadCard } from "./TripleTriad";

//===============================================================================
// New Card shop screen
//===============================================================================
export async function pbBuyTriads(species: Id[] = []): Promise<void> {
  const commands: [number, string, string, Id][] = [];
  if (species.length > 0) {
    for (const s of species) {
      const loaded = Species.get(s);
      const price = new TriadCard(loaded.id).price();
      commands.push([price, loaded.name, _INTL("{1} - ${2}", loaded.name, toSFormatted(price)), loaded.id]);
    }
  } else {
    //     # If no param is passed, we use the default logic to show cards for Pokémon the player already own
    for (const s of Species.eachSpecies()) {
      if (!player().owned(s.species)) continue;
      const price = new TriadCard(s.id).price();
      commands.push([price, s.name, _INTL("{1} - ${2}", s.name, toSFormatted(price)), s.id]);
    }
  }
  // The rest (no cards, sorting, the shop window) is the same code as the
  // original pbBuyTriads.
  await runTriadShop(commands);
}

//===============================================================================
// New Triad List simulating a TCG binder
//===============================================================================
export async function pbTriadBinder(): Promise<void> {
  // pbTriadList() # For now, let's just call the old method
  // Once we finish the script below, we can start using it.
  const scene = new TripleTriadBinder_Scene();
  const screen = new TripleTriadBinderScreen(scene);
  await screen.pbStartScreen();
}
