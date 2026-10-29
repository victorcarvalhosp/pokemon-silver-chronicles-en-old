// Social Links (Plugins/Social Links, by ThatWelshOne_/TDW, with this game's
// phone integration). Imported once at boot (game/newGame.ts): registers the
// profiles (002_Configuration.rb) and the plugin's entry points for event
// scripts under their Ruby names, aliases included.
//
//   000_Settings.rb            ./settings.ts
//   001_Data.rb                ./data.ts
//   002_Configuration.rb       ./configuration.ts
//   003_SocialUI.rb            ./functions.ts, ./normalize.ts (helpers), ./SocialUI.ts (scenes)
//   004_Player.rb              ./player.ts (and game/trainer/Player.ts's fields)
//   005_Script Variables.rb    ./scriptVariables.ts
//   PHONE_INTEGRATION_EXAMPLE  ./phoneIntegrationExample.ts
//
// Nothing in the original opens the Social Media screen from a menu (no
// MenuHandlers entry, pause menu or Pokégear): only events call pbSocialMedia.
//
// Ruby symbols (:JOEY) arrive as strings. Keyword arguments (`silent: true`)
// arrive as a trailing {silent: true} hash. `self` (the event) is resolved
// by its "SocialLink(:ID)" name label, as pbSanitizeProfileID does.

import "./configuration";
import type { Id } from "../../data/gameData/gameData";
import { defineScript } from "../../game/scriptApi";
import * as F from "./functions";
import { RANDOM_STATUS, activeBondEffect, pbPlayerSocialLinksSaved, refreshBondEffects, type ProfileRef } from "./player";
import {
  addAllPhoneSocialLinksExample, bulkPhoneSocialSyncExample, quickPhoneSocialTest, setupJoeyExample, setupNpcExample, testPhoneIntegration,
} from "./phoneIntegrationExample";
import { pbSocialMedia, pbSocialMediaDirect } from "./SocialUI";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";

/** Splits a trailing keyword-argument hash ({silent: true}) off the arguments. */
function kw(args: unknown[]): [unknown[], { silent: boolean }] {
  const last = args[args.length - 1];
  if (last && typeof last === "object" && !Array.isArray(last) && Object.getPrototypeOf(last) === Object.prototype && "silent" in last) {
    return [args.slice(0, -1), { silent: !!(last as { silent: unknown }).silent }];
  }
  return [args, { silent: false }];
}
const ref = (v: unknown) => v as ProfileRef;
const num = (v: unknown, fallback: number) => (v == null ? fallback : Number(v));

/** Registers `fn` under every name in `names` (a function and its aliases). */
function define(names: string[], fn: (...args: unknown[]) => unknown): void {
  for (const name of names) defineScript(name, (_c, ...args) => fn(...args));
}

define(["pbSocialMedia", "pbSocialLinks"], () => pbSocialMedia());
define(["pbSocialMediaDirect", "pbSocialLinkDirect"], (id) => pbSocialMediaDirect(id as Id));
define(["pbAddSocialLink", "pbAddSL"], (...a) => {
  const [[id], o] = kw(a);
  return F.pbAddSocialLink(ref(id), o.silent);
});
define(["pbRemoveSocialLink", "pbRemoveSL"], (...a) => {
  const [[id], o] = kw(a);
  return F.pbRemoveSocialLink(ref(id), o.silent);
});
define(["pbHasSocialLink?", "pbHasSL?"], (id) => F.pbHasSocialLink(ref(id)));
define(["pbGainSocialLinkBond", "pbGainSLBond"], (...a) => {
  const [[id, val], o] = kw(a);
  return F.pbGainSocialLinkBond(ref(id), num(val, 1), o.silent);
});
define(["pbLowerSocialLinkBond", "pbLowerSLBond"], (...a) => {
  const [[id, val], o] = kw(a);
  return F.pbLowerSocialLinkBond(ref(id), num(val, 1), o.silent);
});
define(["pbSetSocialLinkBond", "pbSetSLBond"], (...a) => {
  const [[id, val], o] = kw(a);
  return F.pbSetSocialLinkBond(ref(id), Number(val), o.silent);
});
define(["pbGetSocialLinkBond", "pbGetSLBond"], (id) => F.pbGetSocialLinkBond(ref(id)));
define(["pbSocialLinkBondMaxed?", "pbSLBondMaxed?"], (id) => F.pbSocialLinkBondMaxed(ref(id)));
define(["pbGainSocialLinkMoment", "pbGainSLMoment"], (...a) => {
  const [[id, val], o] = kw(a);
  return F.pbGainSocialLinkMoment(ref(id), num(val, 1), o.silent);
});
define(["pbLowerSocialLinkMoment", "pbLowerSLMoment"], (...a) => {
  const [[id, val], o] = kw(a);
  return F.pbLowerSocialLinkMoment(ref(id), num(val, 1), o.silent);
});
define(["pbSetSocialLinkMoment", "pbSetSLMoment"], (...a) => {
  const [[id, val], o] = kw(a);
  return F.pbSetSocialLinkMoment(ref(id), Number(val), o.silent);
});
define(["pbGetSocialLinkMoments", "pbGetSLMoments"], (id) => F.pbGetSocialLinkMoments(ref(id)));
define(["pbSocialLinkMomentsMaxed?", "pbSLMomentsMaxed?"], (id) => F.pbSocialLinkMomentsMaxed(ref(id)));
define(["pbSetSocialLinkLocation", "pbSetSLLocation"], (id, location) => F.pbSetSocialLinkLocation(ref(id), String(location)));
define(["pbSetSocialLinkFavoritePokemon", "pbSetSLFavPoke"], (id, species, gender, form, shiny) =>
  F.pbSetSocialLinkFavoritePokemon(ref(id), (species ?? null) as Id | null, num(gender, 0), num(form, 0), shiny != null && shiny !== false));
// :Random arrives as the string "Random" (the converter writes symbols as strings).
define(["pbSetSocialLinkStatus", "pbSetSLStatus"], (id, status) =>
  F.pbSetSocialLinkStatus(ref(id), status === "Random" ? RANDOM_STATUS : (status as string | number)));
define(["pbSetSocialLinkStatusRandom", "pbSetSLStatusRandom"], (id) => F.pbSetSocialLinkStatusRandom(ref(id)));
define(["pbSetSocialTheme"], (color) => F.pbSetSocialTheme(String(color)));
define(["pbAddSocialLinksFromPhone"], (...a) => F.pbAddSocialLinksFromPhone(kw(a)[1].silent));
define(["pbNormalizeStringForMatching"], (str) => F.pbNormalizeStringForMatching(str));
define(["pbPlayerSocialLinksSaved", "$player.social_links"], () => pbPlayerSocialLinksSaved());
define(["$player.active_bond_effect?"], (style, pkmn) => activeBondEffect(G.player as unknown as Player, String(style), pkmn as Pokemon));
define(["$player.refresh_bond_effects"], (id, bond, silent) =>
  refreshBondEffects(G.player as unknown as Player, id as Id, Number(bond), silent != null && silent !== false));

// PHONE_INTEGRATION_EXAMPLE.rb
define(["setup_joey_example"], () => setupJoeyExample());
define(["setup_npc_example"], () => setupNpcExample());
define(["test_phone_integration"], (id) => testPhoneIntegration(id as Id));
define(["add_all_phone_social_links_example"], () => addAllPhoneSocialLinksExample());
define(["quick_phone_social_test"], () => quickPhoneSocialTest());
define(["bulk_phone_social_sync_example"], () => bulkPhoneSocialSyncExample());
