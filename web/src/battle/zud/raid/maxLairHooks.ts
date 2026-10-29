// inMaxLair? and pbDynamaxAdventure (ZUD Mechanics/[010] Adventures/
// Adventure_Main.rb:454-465) as the battle code sees them. The Dynamax
// Adventure itself (game/maxLair/Adventure_Main.ts) is overworld code with
// menus; it installs these when it loads, so the battle modules (and the
// headless battle tests) don't import the overworld. Until then there's no
// adventure: inMaxLair() is false.

import type { Pokemon } from "../../../game/pokemon/Pokemon";

/** What the battle code uses of DynamaxAdventure. */
export interface MaxLairAdventure {
  knockouts: number;
  addPrize(pkmn: Pokemon): void;
  swapPokemon(): Promise<void>;
}

export const MaxLairHooks = {
  /** inMaxLair? */
  inMaxLair: (): boolean => false,
  /** pbDynamaxAdventure */
  adventure: (): MaxLairAdventure | null => null,
};

/** inMaxLair? */
export function inMaxLair(): boolean {
  return MaxLairHooks.inMaxLair();
}

/** pbDynamaxAdventure (only called while inMaxLair? is true). */
export function pbDynamaxAdventure(): MaxLairAdventure {
  return MaxLairHooks.adventure()!;
}
