// Saving the $PokemonGlobal fields the battle-related scripts add (Ruby keeps
// them in PokemonGlobalMetadata, which is marshalled whole): the partner
// trainer, phone rematch data, Safari/Bug Contest state, roaming Pokémon, the
// Poké Radar battery and Pokémon Selection's stored party. The global_metadata
// save value only restores fields PokemonGlobalMetadata declares, and some of
// these hold Pokémon, so they're saved here, after it (registration order is
// load order).

import { G } from "../globals";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";
import { SaveData } from "../save/SaveData";

interface Extra {
  save(value: unknown): unknown;
  load(json: unknown): unknown;
}

const extras = new Map<string, Extra>();
const globals = () => G.pokemonGlobal as unknown as Record<string, unknown>;

/** Fields kept as they are (JSON-safe values). */
const plain: Extra = { save: (v) => v, load: (v) => v };

export const PokemonGlobalExtras = {
  /** Saves G.pokemonGlobal[key] with the given (de)serializer (plain JSON by default). */
  register(key: string, extra: Extra = plain): void {
    extras.set(key, extra);
  },
};

/** (De)serializers for a Pokémon, or an array/hash of Pokémon mixed with other values. */
export const pokemonJSON = {
  save(v: unknown): unknown {
    if (v instanceof Pokemon) return { __pokemon: v.toJSON() };
    if (Array.isArray(v)) return v.map((x) => pokemonJSON.save(x));
    if (v && typeof v === "object" && v.constructor === Object) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pokemonJSON.save(x)]));
    }
    return v;
  },
  load(v: unknown): unknown {
    if (Array.isArray(v)) return v.map((x) => pokemonJSON.load(x));
    if (v && typeof v === "object") {
      if ("__pokemon" in v) return Pokemon.fromJSON((v as { __pokemon: PokemonJSON }).__pokemon);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pokemonJSON.load(x)]));
    }
    return v;
  },
};

SaveData.register({
  id: "pokemon_global_battle_extras",
  save: () => {
    const out: Record<string, unknown> = {};
    for (const [key, extra] of extras) {
      const v = globals()[key];
      if (v !== undefined && v !== null) out[key] = extra.save(v);
    }
    return out;
  },
  load: (v) => {
    const data = (v ?? {}) as Record<string, unknown>;
    for (const [key, extra] of extras) {
      if (key in data) globals()[key] = extra.load(data[key]);
    }
  },
});

PokemonGlobalExtras.register("partner", pokemonJSON);
