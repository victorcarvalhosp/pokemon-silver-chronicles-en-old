// Following Pokemon EX's changes to the field moves
// (Plugins/Following Pokemon EX/Script Additions/Field Moves.rb): the
// follower's state around surfing and diving, and waterfalls that wait for
// each step so the follower keeps up. Each alias runs the function it
// replaces (the previous FieldMoves binding), as Ruby's alias does.

import type { Id } from "../../data/gameData/gameData";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import type { GameEvent } from "../GameEvent";
import type { GamePlayer } from "../GamePlayer";
import { G, pbUpdateSceneMap } from "../globals";
import { FollowingPkmn } from "../following/FollowingPkmn";
import type { Pokemon } from "../pokemon/Pokemon";
import type { GameStats } from "../trainer/GameStats";
import type { Player } from "../trainer/Player";
import { endSurfAfter, FieldMoves } from "./FieldMoves";
import { pbUseHiddenMove, setUseHiddenMove } from "./HiddenMoveHandlers";

const player = () => G.player as unknown as Player;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const stats = () => G.stats as GameStats;
const temp = () => G.gameTemp as unknown as { noFollowerFieldMove: boolean };
const global = () => G.pokemonGlobal;

// Aliased Surf call to not shown Following Pokemon Field move animation when surfing
const surf = FieldMoves.pbSurf;
FieldMoves.pbSurf = async () => {
  temp().noFollowerFieldMove = true;
  const oldSurfing = global().currentSurfing;
  const pkmn = player().getPokemonWithMove("SURF");
  global().currentSurfing = pkmn;
  const ret = await surf();
  if (!ret || !pkmn) global().currentSurfing = oldSurfing;
  temp().noFollowerFieldMove = false;
  return ret;
};

// Aliased surf starting method to refresh Following Pokemon when the player jumps to surf
const startSurfing = FieldMoves.pbStartSurfing;
FieldMoves.pbStartSurfing = async () => {
  const oldToggled = global().followerToggled;
  const surfAnim1 = FollowingPkmn.active();
  global().surfing = true;
  FollowingPkmn.refreshInternal();
  const surfAnim2 = FollowingPkmn.active();
  global().surfing = false;
  if (surfAnim1 !== surfAnim2) await FollowingPkmn.toggleOff(true);
  await startSurfing();
  await FollowingPkmn.toggle(oldToggled, false);
};

// Aliased surf ending method to queue a refresh after the player jumps to stop surfing.
// pbEndSurf returns from inside the player's move; the plugin's part runs
// once the jump has landed (FieldMoves' endSurfAfter), which is where the
// Ruby's synchronous pbEndSurf would have returned.
const endSurf = FieldMoves.pbEndSurf;
FieldMoves.pbEndSurf = (xOffset: number, yOffset: number) => {
  const surfAnim1 = FollowingPkmn.active();
  const ret = endSurf(xOffset, yOffset);
  if (!ret) return false;
  const after = () => {
    global().currentSurfing = null;
    FollowingPkmn.refreshInternal();
    const surfAnim2 = FollowingPkmn.active();
    FollowingPkmn.setCallRefresh([true, surfAnim1 !== surfAnim2, 1]);
  };
  if (gamePlayer().jumping()) {
    const prevAfter = endSurfAfter.run;
    endSurfAfter.run = () => {
      endSurfAfter.run = prevAfter;
      prevAfter();
      after();
    };
  } else {
    after(); // the jump didn't happen: pbEndSurf returned straight away
  }
  return ret;
};

// Aliased Diving method to not show new HM Animation when diving
const dive = FieldMoves.pbDive;
FieldMoves.pbDive = async () => {
  temp().noFollowerFieldMove = true;
  const oldDiving = global().currentDiving;
  const pkmn = player().getPokemonWithMove("DIVE");
  global().currentDiving = pkmn;
  const ret = await dive();
  if (!ret || !pkmn) global().currentDiving = oldDiving;
  temp().noFollowerFieldMove = false;
  return ret;
};

// Aliased surfacing method to not show new HM Animation when surfacing
const surfacing = FieldMoves.pbSurfacing;
FieldMoves.pbSurfacing = async () => {
  temp().noFollowerFieldMove = true;
  const oldDiving = global().currentDiving;
  global().currentDiving = null;
  const ret = await surfacing();
  if (!ret) global().currentDiving = oldDiving;
  temp().noFollowerFieldMove = false;
  return ret;
};

// Aliased hidden move usage method to not show new HM animation for certain moves
const useHiddenMove = pbUseHiddenMove;
setUseHiddenMove(async (pokemon: Pokemon, move: Id) => {
  temp().noFollowerFieldMove = ["SURF", "DIVE", "FLY", "DIG", "TELEPORT", "WATERFALL", "STRENGTH"].includes(move);
  let oldData: unknown = null;
  if (move === "SURF") {
    oldData = global().currentSurfing;
    global().currentSurfing = pokemon;
  } else if (move === "DIVE") {
    oldData = global().currentDiving;
    global().currentDiving = pokemon;
  }
  const ret = await useHiddenMove(pokemon, move);
  if (move === "SURF") {
    if (!ret) global().currentSurfing = oldData;
  } else if (move === "DIVE") {
    if (!ret) global().currentDiving = oldData;
  }
  temp().noFollowerFieldMove = false;
  return ret;
});

// Aliased Headbutt method to properly load Headbutt event for new HM Animation
const headbutt = FieldMoves.pbHeadbutt;
FieldMoves.pbHeadbutt = (event: GameEvent | null = null) => {
  if (event == null) event = gamePlayer().pbFacingEvent(true);
  return headbutt(event);
};

// Aliased Waterfall methd to not show new HM Animation when interacting with waterfall
const waterfall = FieldMoves.pbWaterfall;
FieldMoves.pbWaterfall = async () => {
  temp().noFollowerFieldMove = true;
  player().getPokemonWithMove("WATERFALL");
  const ret = await waterfall();
  temp().noFollowerFieldMove = false;
  return ret;
};

/** `while $game_player.moving?` with the map updating. */
async function waitWhileMoving(): Promise<void> {
  while (gamePlayer().moving()) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

// Waterfall ascending/descending that waits for each step so the Following
// Pokemon properly climbs the waterfall with the player (replaces the core's).
FieldMoves.pbAscendWaterfall = async () => {
  const p = gamePlayer();
  if (p.direction !== 8) return; // Can't ascend if not facing up
  let terrain = p.pbFacingTerrainTag();
  if (!terrain.waterfall && !terrain.waterfallCrest) return;
  stats().waterfallCount += 1;
  const oldthrough = p.through;
  const oldmovespeed = p.moveSpeed;
  p.through = true;
  p.moveSpeed = 2;
  for (;;) {
    p.moveUp();
    terrain = p.pbTerrainTag();
    if (!terrain.waterfall && !terrain.waterfallCrest) break;
    await waitWhileMoving();
  }
  p.through = oldthrough;
  p.moveSpeed = oldmovespeed;
};

FieldMoves.pbDescendWaterfall = async () => {
  const p = gamePlayer();
  if (p.direction !== 2) return; // Can't descend if not facing down
  let terrain = p.pbFacingTerrainTag();
  if (!terrain.waterfall && !terrain.waterfallCrest) return;
  stats().waterfallsDescended += 1;
  const oldthrough = p.through;
  const oldmovespeed = p.moveSpeed;
  p.through = true;
  p.moveSpeed = 2;
  for (;;) {
    p.moveDown();
    terrain = p.pbTerrainTag();
    if (!terrain.waterfall && !terrain.waterfallCrest) break;
    await waitWhileMoving();
  }
  p.through = oldthrough;
  p.moveSpeed = oldmovespeed;
};
