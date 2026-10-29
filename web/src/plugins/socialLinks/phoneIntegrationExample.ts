// Port of Plugins/Social Links/PHONE_INTEGRATION_EXAMPLE.rb (loaded by the
// game, Data/PluginScripts.rxdata): example/debug helpers for the Social
// Links + Pokégear phone integration, registered for event scripts in
// ./index.ts under their Ruby names. The integration itself is
// SocialLinkProfile#phoneContact (./data.ts), pbAddSocialLinksFromPhone
// (./functions.ts) and the profile's call button (./SocialUI.ts).

import { _INTL } from "../../core/intl";
import type { Id } from "../../data/gameData/gameData";
import { G } from "../../game/globals";
import { pbPhoneRegisterNPC } from "../../game/scripts/phone";
import type { Player } from "../../game/trainer/Player";
import { pbMessage } from "../../ui/messages";
import { pbPhoneRegister } from "../../ui/pokegear/phone";
import { pbAddSocialLink, pbAddSocialLinksFromPhone, pbHasSocialLink } from "./functions";
import { pbPlayerSocialLinksSaved } from "./player";
import { pbSocialMedia } from "./SocialUI";

/** Example 1: Set up Joey as both a Social Link and Phone Contact. */
export async function setupJoeyExample(): Promise<void> {
  // First, add Joey to the phone (a trainer contact with rematch capability)
  pbPhoneRegister(null, "YOUNGSTER", "Joey");
  // Then add Joey as a Social Link ("Joey" or "Youngster Joey" both match)
  await pbAddSocialLink("JOEY");
  await pbMessage(_INTL("Joey has been added to your phone and Social Links!"));
  await pbMessage(_INTL("Open Social Links and view Joey's profile, then press USE (C key) to call him."));
}

/** Example 2: Set up an NPC contact with Social Link (the Social Link itself is left commented out). */
export async function setupNpcExample(): Promise<void> {
  // Parameters: (identifier, name, map_id, show_message)
  await pbPhoneRegisterNPC(50, "Professor Oak", 1, true);
}

/** Example 3: Test if a Social Link has phone integration. */
export async function testPhoneIntegration(profileId: Id): Promise<void> {
  if (!pbHasSocialLink(profileId)) {
    await pbMessage(_INTL("You don't have this Social Link yet."));
    return;
  }
  const profile = pbPlayerSocialLinksSaved().links.get(profileId)!;
  if (profile.hasPhoneContact()) {
    const contact = profile.phoneContact()!;
    await pbMessage(_INTL("{1} is in your phone! You can call them from their profile.", profile.name));
    await pbMessage(_INTL("Phone contact: {1}", contact[2]));
  } else {
    await pbMessage(_INTL("{1} is not in your phone contacts.", profile.name));
    await pbMessage(_INTL("Add a phone contact with the name '{1}' to enable calling.", profile.name));
  }
}

/** Example 4: Automatically add Social Links from all phone contacts. */
export async function addAllPhoneSocialLinksExample(): Promise<void> {
  await pbAddSocialLinksFromPhone();
}

/** Example 5: Quick test setup (run this from debug console). */
export async function quickPhoneSocialTest(): Promise<void> {
  // Make sure player has pokegear
  const player = G.player as unknown as Player;
  if (!player.hasPokegear) player.hasPokegear = true;
  await setupJoeyExample();
  await pbSocialMedia();
}

/** Example 6: Bulk setup - Add multiple phone contacts then sync to Social Links. */
export async function bulkPhoneSocialSyncExample(): Promise<void> {
  pbPhoneRegister(null, "YOUNGSTER", "Joey");
  await pbPhoneRegisterNPC(1, "Professor Oak", 1, false);
  await pbPhoneRegisterNPC(2, "Mother", 1, false);
  const count = await pbAddSocialLinksFromPhone();
  await pbMessage(_INTL("Phone sync complete! {1} Social Links added.", count));
}
