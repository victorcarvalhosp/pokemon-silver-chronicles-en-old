// Port of pbTrainerName, pbSuggestTrainerName and pbGetUserName
// (019_Utilities/001_Utilities.rb).

import { pbChangePlayer } from "../../game/scripts/overworld";
import { G } from "../../game/globals";
import { playerMetadata } from "../../game/metadata";
import { _INTL } from "../messageConfig";
import { pbEnterPlayerName } from "./UI_TextEntry";

/** Settings::MAX_PLAYER_NAME_SIZE (001_Settings.rb) */
export const MAX_PLAYER_NAME_SIZE = 10;

interface NamedPlayer {
  name: string;
  characterID: number;
  outfit: number;
}

const player = () => G.player as unknown as NamedPlayer;

/**
 * System.user_name: mkxp-z returns the OS login name. A browser has none, so
 * this stands in with a fixed name (the empty-name fallback of the naming
 * screen, which the player only sees by confirming an empty name).
 */
export function pbGetUserName(): string {
  return "Player";
}

/** String#capitalize */
function capitalize(s: string): string {
  return s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase();
}

export function pbSuggestTrainerName(_gender: number | null): string {
  let userName = pbGetUserName();
  userName = userName.replace(/\s+.*$/, "");
  if (userName.length > 0 && userName.length < MAX_PLAYER_NAME_SIZE) {
    return userName.slice(0, 1).toUpperCase() + userName.slice(1);
  }
  userName = userName.replace(/\d+$/, "");
  if (userName.length > 0 && userName.length < MAX_PLAYER_NAME_SIZE) {
    return userName.slice(0, 1).toUpperCase() + userName.slice(1);
  }
  userName = capitalize(pbGetUserName());
  userName = userName.slice(0, MAX_PLAYER_NAME_SIZE);
  return userName;
  // Unreachable
  //  return getRandomNameEx(gender, nil, 1, Settings::MAX_PLAYER_NAME_SIZE)
}

export async function pbTrainerName(name: string | null = null, outfit = 0): Promise<void> {
  if (player().characterID < 1) pbChangePlayer(1);
  if (name == null) {
    name = await pbEnterPlayerName(_INTL("Your name?"), 0, MAX_PLAYER_NAME_SIZE);
    if (name == null || name === "") {
      const playerMetadataEntry = playerMetadata(player().characterID);
      const trainerType = playerMetadataEntry ? playerMetadataEntry.trainerType : null;
      // pbGetTrainerTypeGender(trainer_type): only feeds the unreachable random name.
      void trainerType;
      name = pbSuggestTrainerName(null);
    }
  }
  player().name = name;
  player().outfit = outfit;
}
