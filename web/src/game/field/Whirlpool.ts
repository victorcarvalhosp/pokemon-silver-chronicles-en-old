// Port of Plugins/Pokemon Silver Chronicles Helpers/Whilrpool HM.rb: the
// game's own Whirlpool field move. The whirlpool events (named
// "redemoinho") call pbWhirlpool and erase themselves when it returns true.

import type { Id } from "../../data/gameData/gameData";
import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { _INTL } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { pbWait } from "../../ui/scenes/frames";
import type { GameEvent } from "../GameEvent";
import type { GamePlayer } from "../GamePlayer";
import { pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { PokemonMapMetadata } from "../PokemonMapMetadata";
import { pbMoveRoute, PBMoveRoute } from "../scripts/moveRoute";
import type { Player } from "../trainer/Player";
import { CanUseContext, checkBadge, FieldDebug, HiddenMoveHandlers } from "./HiddenMoveHandlers";
import { pbHiddenMoveAnimation } from "./hiddenMoveAnimation";

const player = () => G.player as unknown as Player;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const moveName = (move: Id) => Move.get(move).name;

/** pbWhirlpool */
export async function pbWhirlpool(): Promise<boolean> {
  const move = "WHIRLPOOL";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_WHIRLPOOL, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    await pbMessage(_INTL("It's a huge swirl of water."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("It's a huge swirl of water.\nWould you like to use Whirlpool?"))) {
    // $stats.whirlpool_count += 1
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    return true;
  }
  return false;
}

// NOTE (Ruby parity): the check looks for events named "whirlpooltree", but
// the game's whirlpools are named "redemoinho" (Whilrpool HM.rb:23), so
// Whirlpool from the party menu / Ready Menu always says "You can't use that
// here."; only facing a whirlpool and pressing the button (pbWhirlpool) works.
HiddenMoveHandlers.CanUseMove.add("WHIRLPOOL", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_WHIRLPOOL, ctx)) return false;
  const facingEvent = gamePlayer().pbFacingEvent();
  if (!facingEvent || !/whirlpooltree/i.test(facingEvent.name)) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("WHIRLPOOL", async (move, pokemon) => {
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  // $stats.whirlpool_count += 1
  const facingEvent = gamePlayer().pbFacingEvent();
  if (facingEvent) await pbEraseWhirlpoolEvent(facingEvent);
  return true;
});

/** pbEraseWhirlpoolEvent(event) */
export async function pbEraseWhirlpoolEvent(event: GameEvent | null): Promise<void> {
  if (!event) return;
  if (/redemoinho/i.test(event.name)) pbSEPlay("Whirlpool", 80);
  pbMoveRoute(event, [PBMoveRoute.Wait, 2,
    PBMoveRoute.TurnLeft,
    PBMoveRoute.Wait, 2,
    PBMoveRoute.TurnRight,
    PBMoveRoute.Wait, 2,
    PBMoveRoute.TurnUp,
    PBMoveRoute.Wait, 2]);
  await pbWait(Math.floor((40 * 4) / 10));
  event.erase();
  (G as unknown as { pokemonMap: PokemonMapMetadata | null }).pokemonMap?.addErasedEvent(event.id);
}
