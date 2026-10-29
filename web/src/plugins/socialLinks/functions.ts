// Port of the "Functions" section of Plugins/Social Links/003_SocialUI.rb:
// pbAddSocialLinksFromPhone and the global helpers events call
// (pbAddSocialLink, pbGainSocialLinkBond, pbSetSocialLinkStatus... and their
// pbAddSL-style aliases, registered in ./index.ts). pbNormalizeStringForMatching
// is in ./normalize.ts; pbSocialMedia / pbSocialMediaDirect open the scenes
// (./SocialUI.ts).

import { _INTL } from "../../core/intl";
import type { Id } from "../../data/gameData/gameData";
import { GameDataSocialLinkProfile, phoneTrainerNames, rawPhoneNumbers } from "./data";
import { pbNormalizeStringForMatching } from "./normalize";
import { type ProfileRef, RANDOM_STATUS, pbPlayerSocialLinksSaved, socialLinksIO } from "./player";

export { pbNormalizeStringForMatching };

/**
 * Automatically adds Social Links for all phone contacts that have matching
 * profiles; returns how many were added (nil, i.e. null, without a phone list).
 */
export async function pbAddSocialLinksFromPhone(silent = false): Promise<number | null> {
  const numbers = rawPhoneNumbers();
  if (!numbers) return null;
  let addedCount = 0;
  const addedNames: string[] = [];
  // Check each phone contact
  for (const num of numbers) {
    if (!num[0]) continue; // Skip if not visible
    let matchingProfile: GameDataSocialLinkProfile | null = null;
    if (num.length === 8) {
      // For trainers, match by trainer type + name, or just the name (normalized)
      const [fullName, trainerName] = phoneTrainerNames(num);
      const fullNameNormalized = pbNormalizeStringForMatching(fullName);
      const trainerNameNormalized = pbNormalizeStringForMatching(trainerName);
      for (const profileData of GameDataSocialLinkProfile.each()) {
        const profileNameNormalized = pbNormalizeStringForMatching(profileData.name);
        if (profileNameNormalized === fullNameNormalized || profileNameNormalized === trainerNameNormalized) {
          matchingProfile = profileData;
          break;
        }
      }
    } else {
      // For NPCs, try to find by name match (normalized)
      const contactNameNormalized = pbNormalizeStringForMatching(num[2]);
      for (const profileData of GameDataSocialLinkProfile.each()) {
        if (pbNormalizeStringForMatching(profileData.name) === contactNameNormalized) {
          matchingProfile = profileData;
          break;
        }
      }
    }
    // Add the Social Link if found and not already added
    if (matchingProfile && !pbHasSocialLink(matchingProfile.id)) {
      if (await pbAddSocialLink(matchingProfile.id, true)) {
        addedCount += 1;
        addedNames.push(matchingProfile.name);
      }
    }
  }
  // Show result message if not silent
  if (!silent) {
    if (addedCount === 0) {
      await socialLinksIO.message(_INTL("No new Social Links were added from your phone contacts."));
    } else if (addedCount === 1) {
      await socialLinksIO.message(_INTL("Added {1} to your Social Links!", addedNames[0]));
    } else {
      await socialLinksIO.message(_INTL("Added {1} Social Links from your phone contacts!", addedCount));
    }
  }
  return addedCount;
}

export const pbAddSocialLink = (id: ProfileRef, silent = false) => pbPlayerSocialLinksSaved().pbAddLink(id, silent);
export const pbRemoveSocialLink = (id: ProfileRef, silent = false) => pbPlayerSocialLinksSaved().pbRemoveLink(id, silent);
export const pbHasSocialLink = (id: ProfileRef) => pbPlayerSocialLinksSaved().pbHasLink(id);
export const pbGainSocialLinkBond = (id: ProfileRef, val = 1, silent = false) => pbPlayerSocialLinksSaved().pbGainLinkBond(id, val, silent);
export const pbLowerSocialLinkBond = (id: ProfileRef, val = 1, silent = false) => pbPlayerSocialLinksSaved().pbLowerLinkBond(id, val, silent);
export const pbSetSocialLinkBond = (id: ProfileRef, val: number, silent = false) => pbPlayerSocialLinksSaved().pbSetLinkBond(id, val, silent);
export const pbGetSocialLinkBond = (id: ProfileRef) => pbPlayerSocialLinksSaved().pbGetLinkBond(id);
export const pbSocialLinkBondMaxed = (id: ProfileRef) => pbPlayerSocialLinksSaved().pbLinkBondMaxed(id);
export const pbGainSocialLinkMoment = (id: ProfileRef, val = 1, silent = false) => pbPlayerSocialLinksSaved().pbGainLinkMoment(id, val, silent);
export const pbLowerSocialLinkMoment = (id: ProfileRef, val = 1, silent = false) => pbPlayerSocialLinksSaved().pbLowerLinkMoment(id, val, silent);
export const pbSetSocialLinkMoment = (id: ProfileRef, val: number, silent = false) => pbPlayerSocialLinksSaved().pbSetLinkMoment(id, val, silent);
export const pbGetSocialLinkMoments = (id: ProfileRef) => pbPlayerSocialLinksSaved().pbGetLinkMoments(id);
export const pbSocialLinkMomentsMaxed = (id: ProfileRef) => pbPlayerSocialLinksSaved().pbLinkMomentsMaxed(id);
export const pbSetSocialLinkLocation = (id: ProfileRef, location: string) => pbPlayerSocialLinksSaved().pbSetLinkLocation(id, location);
export const pbSetSocialLinkFavoritePokemon = (id: ProfileRef, species: Id | null = null, gender = 0, form = 0, shiny = false) =>
  pbPlayerSocialLinksSaved().pbSetLinkPokemon(id, species, gender, form, shiny);
export const pbSetSocialLinkStatus = (id: ProfileRef, status: string | number | typeof RANDOM_STATUS) =>
  pbPlayerSocialLinksSaved().pbSetLinkStatus(id, status);
export const pbSetSocialLinkStatusRandom = (id: ProfileRef) => pbPlayerSocialLinksSaved().pbSetLinkStatus(id, RANDOM_STATUS);
export function pbSetSocialTheme(color: string): string {
  pbPlayerSocialLinksSaved().themeColor = color;
  return color;
}
