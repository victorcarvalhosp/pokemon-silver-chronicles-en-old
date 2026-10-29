// pbStartOver (012_Overworld/001_Overworld visuals/003_Overworld_MapTransitionAnims.rb,
// with this game's edit that keeps a registered partner's follower, and the
// Following Pokémon EX alias that sets $game_temp.starting_over around it):
// after blacking out, back to the last Pokémon Center or home, party healed.

import { _INTL } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import type { SceneMap } from "../../scenes/SceneMap";
import { pbCancelVehicles, pbUpdateVehicle } from "../GamePlayer";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { autoplayAsCue } from "../mapAudio";
import { metadata, playerMetadata } from "../metadata";
import type { Player } from "../trainer/Player";
import { EncounterSettings } from "../encounters/settings";
import { pbInBugContest } from "../encounters/PokemonEncounters";
import { Followers } from "../following";

declare module "../globals" {
  interface GameTemp {
    /** Following Pokémon EX: set while starting over, so the follower isn't removed. */
    startingOver?: boolean;
  }
}

const player = () => G.player as unknown as Player;

/** pbDismountBike (004_Game classes/009_Game_Player.rb) */
function pbDismountBike(): void {
  if (!G.pokemonGlobal.bicycle) return;
  G.pokemonGlobal.bicycle = false;
  pbUpdateVehicle();
  autoplayAsCue(G.gameMap as unknown as GameMap);
}

/** pbEraseEscapePoint */
function pbEraseEscapePoint(): void {
  G.pokemonGlobal.escapePoint = [];
}

async function transfer(mapId: number, x: number, y: number, direction: number): Promise<void> {
  pbCancelVehicles();
  // Don't clear followers if there's a registered partner (preserve partner follower)
  if (G.gameSwitches.get(405) !== true) Followers.clear();
  G.gameSwitches.set(EncounterSettings.STARTING_OVER_SWITCH, true);
  const t = G.gameTemp;
  t.playerNewMapId = mapId;
  t.playerNewX = x;
  t.playerNewY = y;
  t.playerNewDirection = direction;
  pbDismountBike();
  const scene = G.scene as unknown as SceneMap | null;
  if (scene && typeof scene.transferPlayer === "function") await scene.transferPlayer();
  (G.gameMap as unknown as GameMap).refresh();
}

export async function pbStartOver(gameover = false): Promise<void> {
  G.gameTemp.startingOver = true;
  try {
    await startOver(gameover);
  } finally {
    G.gameTemp.startingOver = false;
  }
}

async function startOver(gameover: boolean): Promise<void> {
  if (pbInBugContest()) {
    // TODO(bug contest): pbBugContestStartOver
    return;
  }
  G.stats.blackedOutCount += 1;
  player().healParty();
  const g = G.pokemonGlobal;
  if (g.pokecenterMapId != null && g.pokecenterMapId >= 0) {
    if (gameover) await pbMessage(_INTL("\\w[]\\wm\\c[8]\\l[3]After the unfortunate defeat, you scurry back to a Pokémon Center."));
    else await pbMessage(_INTL("\\w[]\\wm\\c[8]\\l[3]You scurry back to a Pokémon Center, protecting your exhausted Pokémon from any further harm..."));
    await transfer(g.pokecenterMapId, g.pokecenterX, g.pokecenterY, g.pokecenterDirection);
  } else {
    let homedata = playerMetadata(player().characterID)?.home as number[] | undefined;
    homedata ??= metadata().home as number[] | undefined;
    // (Ruby checks the home map file exists, with a $DEBUG message; every map is converted here.)
    if (gameover) await pbMessage(_INTL("\\w[]\\wm\\c[8]\\l[3]After the unfortunate defeat, you scurry back home."));
    else await pbMessage(_INTL("\\w[]\\wm\\c[8]\\l[3]You scurry back home, protecting your exhausted Pokémon from any further harm..."));
    if (homedata) await transfer(homedata[0]!, homedata[1]!, homedata[2]!, homedata[3]!);
    else player().healParty();
  }
  pbEraseEscapePoint();
}
