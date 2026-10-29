// Port of Plugins/Social Links/000_Settings.rb (module SocialLinkSettings).
// The comments are the plugin's own, shortened.

import { _INTL } from "../../core/intl";

type Coords = [number, number];

export const SocialLinkSettings = {
  //============================== Display Settings ==============================
  /** The name of the Social Links app. */
  SOCIAL_LINKS_LIST_TITLE: _INTL("Social Links"),
  /** The text that appears in the app if you have no active Social Links. */
  NO_LINKS_MESSAGE: _INTL("You have no links."),
  /** The default theme: a folder in UI/Social Links/Themes. */
  DEFAULT_THEME_COLOR: "Blue",
  /** A maxed bond shows the bond icon's third frame (the golden Poké Ball). */
  ALT_COLOR_BOND_ICON_AT_MAX: true,
  /** Replaces the bond number when it's maxed (nil or "" to keep the number). */
  MAXED_BOND_TEXT_REPLACEMENT: _INTL("MAX") as string | null,
  /** Larger profile pictures on the profile page ("<image>_large", else the normal one at 200%). */
  USE_LARGE_PIC_ON_PROFILE: true,
  /** Font size of the name on the profile page (0 = system default). */
  PROFILE_NAME_FONT_SIZE: 37,
  /** Show the Social Link's favourite Pokémon on their profile page. */
  SHOW_FAVORITE_POKEMON: true,

  //============================= Functional Settings ============================
  /** The max bond level. */
  BOND_LEVEL_MAX: 10,
  /** SPECIAL changes how the list is sorted. */
  ALLOW_SORTING: true,
  /** ACTION favourites a Social Link; favourites are always at the top of the list. */
  ALLOW_FAVORITING: true,
  /** Only the list view, no profiles. */
  DISABLE_SOCIAL_MEDIA_PROFILE: false,
  /** Sound effect when the player adds a new Social Link. */
  NEW_LINK_SOUND_EFFECT: "Mining reveal",
  /** Message when the player adds a new Social Link ({1} = name). */
  NEW_LINK_MESSAGE: _INTL("{1} was added as a social link!"),
  /** Message when the player removes a Social Link ({1} = name). */
  REMOVED_LINK_MESSAGE: _INTL("{1} is no longer a social link."),
  /** A different message when a bond is maxed. */
  SHOW_MAXED_BOND_MESSAGE: true,
  /** Sound effect when the player maxes a bond. */
  MAXED_BOND_SOUND_EFFECT: "Mining reveal full",
  /** Message when the player maxes a bond ({1} = name). */
  MAXED_BOND_MESSAGE: _INTL("Your bond with {1} has reached its peak!"),
  /** Say what a newly enabled Bond Effect does. */
  SHOW_BOND_EFFECT_MESSAGE: true,
  /**
   * Moments needed before a bond can increase: one number for every level, or
   * one per current bond level (index = bond level).
   */
  MOMENTS_COUNT_MAX: 5 as number | number[],
  /** The Moments count resets to 0 when the bond increases. */
  RESET_MOMENTS_ON_BOND_INCREASE: true,

  //===================== Custom Profile Page Layout Settings ====================
  /** Use the settings below for the profile page instead of the default layout. */
  USE_CUSTOM_LAYOUT: false,
  /** Centre of the profile picture. */
  PROFILE_PIC_CENTER_COORDS: [72, 72] as Coords,
  /** One bond icon per bond level (index = level - 1); null = never shown. */
  BOND_ICON_COORDS: [
    [22, 162],
    [52, 162],
    [82, 162],
    [112, 154],
    [138, 138],
    [154, 112],
    [162, 82],
    [162, 52],
    [162, 22],
    null,
  ] as (Coords | null)[],
  /** The name on the profile page. */
  NAME_POSITION_COORDS: [344, 62] as Coords,
  /** 0 left, 1 right, 2 centred. */
  NAME_ALIGNMENT: 2,
  /** Top left of the location. */
  LOCATION_SECTION_COORDS: [200, 96] as Coords,
  /** (Instant Messages plugin) Top left of the Instant Messages button. */
  INSTANT_MESSAGES_BUTTON_COORDS: [0, 0] as Coords,
  /** Top left of the favourite Pokémon. */
  FAVORITE_POKEMON_COORDS: [24, 192] as Coords,
  /** Top left of the status message. */
  STATUS_MESSAGE_COORDS: [224, 192] as Coords,
  /** Max width of the status message. */
  STATUS_MESSAGE_WIDTH: 264,
  /** Top left of the status message without a favourite Pokémon. */
  STATUS_MESSAGE_COORDS_NO_POKE: [24, 192] as Coords,
  /** Max width of the status message without a favourite Pokémon. */
  STATUS_MESSAGE_WIDTH_NO_POKE: 464,
};
