// Pokémon Amie (Plugins/Pokemon Amie/Pokemon Amie.rb). Imported once at boot
// (game/newGame.ts): reopens Pokemon (feedAmie, changeAmieStats,
// resetAffection), adds the :hungerCounter step handler and registers the
// plugin's entry points for event scripts under their Ruby names. Following
// Pokemon EX's "Play" choice calls pokemonAmieRefresh (game/following/dialogue.ts).

import { defineScript } from "../../game/scriptApi";
import { pbDisplay, pbFirstNonEggPokemonOrFaintedPokemon, setAmiePokemon } from "./amie";
import { pokemonAmieRefresh } from "./PokeAmieScene";

const index = (v: unknown): number | null => (v == null ? null : Number(v));

// pokemonAmieRefresh(party index) / pokemonAmieRefresh
defineScript("pokemonAmieRefresh", (_c, pkmn) => pokemonAmieRefresh(index(pkmn)));
defineScript("setAmiePokemon", (_c, pkmn) => setAmiePokemon(index(pkmn)));
defineScript("pbFirstNonEggPokemonOrFaintedPokemon", () => pbFirstNonEggPokemonOrFaintedPokemon());
defineScript("pbDisplay", (_c, text) => pbDisplay(text));
