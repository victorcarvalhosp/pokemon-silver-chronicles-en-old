// Saving $PokemonGlobal.challenge: Ruby marshals the BattleChallenge with the
// rest of the save, objects and all. Here it's JSON: instances of the
// registered classes keep their class and fields, Pokémon go through
// toJSON/fromJSON, and an object (or array) met twice is saved once and
// referenced afterwards, so shared parties and the Battle Factory's link back
// to its challenge data survive a save and load. That link is a
// non-enumerable field, so the plain snapshot of $PokemonGlobal (which also
// walks the challenge) doesn't loop on it.

import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = abstract new (...args: any[]) => object;

const classes = new Map<string, Ctor>();
const names = new Map<Ctor, string>();

type Dumped = null | boolean | number | string | Dumped[] | { [k: string]: Dumped };

export const FrontierMarshal = {
  /**
   * Registers classes whose instances may be saved, under their Ruby names
   * (given explicitly: minified builds rename classes).
   */
  register(ctors: Record<string, Ctor>): void {
    for (const [name, c] of Object.entries(ctors)) {
      classes.set(name, c);
      names.set(c, name);
    }
  },

  dump(value: unknown): Dumped {
    const seen = new Map<object, number>();
    const dump = (v: unknown): Dumped => {
      if (v === undefined || v === null) return null;
      if (typeof v !== "object") return v as Dumped;
      const known = seen.get(v);
      if (known !== undefined) return { __ref: known };
      const id = seen.size;
      seen.set(v, id);
      if (Array.isArray(v)) return { __arr: id, v: v.map(dump) };
      if (v instanceof Pokemon) return { __pkmn: id, v: v.toJSON() as unknown as Dumped };
      const name = names.get(v.constructor as Ctor);
      const fields: { [k: string]: Dumped } = {};
      for (const [k, x] of Object.entries(v)) fields[k] = dump(x);
      // Non-enumerable fields (links back up, which the plain save snapshot skips)
      const hidden: { [k: string]: Dumped } = {};
      for (const k of Object.getOwnPropertyNames(v)) {
        if (!Object.prototype.propertyIsEnumerable.call(v, k)) hidden[k] = dump((v as Record<string, unknown>)[k]);
      }
      if (name) return { __cls: name, __id: id, f: fields, ...(Object.keys(hidden).length > 0 ? { h: hidden } : {}) };
      if (v.constructor !== Object) throw new Error(`Can't save a ${v.constructor.name} (register its class)`);
      return { __obj: id, f: fields };
    };
    return dump(value);
  },

  load(json: unknown): unknown {
    const refs = new Map<number, unknown>();
    const load = (j: unknown): unknown => {
      if (j === null || typeof j !== "object") return j;
      const o = j as Record<string, unknown>;
      if ("__ref" in o) return refs.get(o.__ref as number);
      if ("__arr" in o) {
        const arr: unknown[] = [];
        refs.set(o.__arr as number, arr);
        for (const x of o.v as unknown[]) arr.push(load(x));
        return arr;
      }
      if ("__pkmn" in o) {
        const pkmn = Pokemon.fromJSON(o.v as PokemonJSON);
        refs.set(o.__pkmn as number, pkmn);
        return pkmn;
      }
      let obj: Record<string, unknown>;
      if ("__cls" in o) {
        const cls = classes.get(o.__cls as string);
        if (!cls) throw new Error(`Unknown saved class ${String(o.__cls)}`);
        obj = Object.create(cls.prototype as object) as Record<string, unknown>;
        refs.set(o.__id as number, obj);
      } else {
        obj = {};
        refs.set(o.__obj as number, obj);
      }
      for (const [k, x] of Object.entries(o.f as Record<string, unknown>)) obj[k] = load(x);
      for (const [k, x] of Object.entries((o.h ?? {}) as Record<string, unknown>)) {
        Object.defineProperty(obj, k, { value: load(x), writable: true, enumerable: false, configurable: true });
      }
      return obj;
    };
    return load(json);
  },
};
