// The Bicycle: pbMountBike / pbDismountBike (004_Game classes/009_Game_Player.rb:604-619)
// with Following Pokemon EX's refresh around them (Script Additions/Refresh.rb:5-28),
// and the :force_cycling map handler (012_Overworld/001_Overworld.rb:285-293).
// Riding speed and charset are Game_Player#set_movement_type's (GamePlayer.ts);
// passability on bikes (no tall grass) is Game_Map#playerPassable?.
//
// Plugins/Mount is entirely commented out in this game, so it changes nothing.

import { EventHandlers } from "../eventHandlers";
import type { GameMap } from "../GameMap";
import { pbCanUseBike, pbUpdateVehicle } from "../GamePlayer";
import { G } from "../globals";
import { pbCueBGM } from "../mapAudio";
import { mapMetadata, metadata } from "../metadata";
import type { GameStats } from "../trainer/GameStats";
import { FollowingPkmn } from "../following/FollowingPkmn";

const gameMap = () => G.gameMap as unknown as GameMap;

/** The core pbMountBike. */
function pbMountBikeCore(): void {
  if (G.pokemonGlobal.bicycle) return;
  G.pokemonGlobal.bicycle = true;
  (G.stats as GameStats).cycleCount += 1;
  pbUpdateVehicle();
  const bikeBgm = metadata().bicycleBGM as string | undefined;
  if (bikeBgm) pbCueBGM(bikeBgm, 0.5);
  // pbPokeRadarCancel: the Poké Radar isn't in this game's port (013_Items/005_Item_PokeRadar.rb).
}

/** The core pbDismountBike. */
function pbDismountBikeCore(): void {
  if (!G.pokemonGlobal.bicycle) return;
  G.pokemonGlobal.bicycle = false;
  pbUpdateVehicle();
  gameMap().autoplayAsCue();
}

/** pbMountBike, refreshing the Following Pokémon (it may hide while cycling). */
export async function pbMountBike(): Promise<void> {
  const bikeAnim1 = FollowingPkmn.active();
  pbMountBikeCore();
  FollowingPkmn.refreshInternal();
  const bikeAnim2 = FollowingPkmn.active();
  await FollowingPkmn.refresh(bikeAnim1 !== bikeAnim2);
}

/** pbDismountBike, refreshing the Following Pokémon. */
export async function pbDismountBike(): Promise<void> {
  const bikeAnim1 = FollowingPkmn.active();
  pbDismountBikeCore();
  FollowingPkmn.refreshInternal();
  const bikeAnim2 = FollowingPkmn.active();
  await FollowingPkmn.refresh(bikeAnim1 !== bikeAnim2);
}

/**
 * The same, where the caller can't wait (:on_enter_map fires mid-transfer,
 * synchronously): the follower's come-in/come-out animation is skipped. The
 * transfer happens behind a fade, so the animation wouldn't be seen anyway.
 */
function refreshAroundSync(core: () => void): void {
  core();
  FollowingPkmn.refreshInternal();
  void FollowingPkmn.refresh(false); // never waits without an animation
}

// Force cycling/walking.
EventHandlers.add("on_enter_map", "force_cycling", () => {
  if (mapMetadata(gameMap().mapId)?.alwaysBicycle) {
    refreshAroundSync(pbMountBikeCore);
  } else if (!pbCanUseBike(gameMap().mapId)) {
    refreshAroundSync(pbDismountBikeCore);
  }
});
