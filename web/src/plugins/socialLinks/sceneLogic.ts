// The logic of Plugins/Social Links/003_SocialUI.rb's scenes, apart from
// their sprites (so node tests can run it): SocialMediaMenu_Scene's
// pbSortSocialLinks and SocialMedia_Scene's pbRunTextThroughReplacement.
// The scenes are in ./SocialUI.ts.

import { _INTL } from "../../core/intl";
import type { Id } from "../../data/gameData/gameData";
import { G } from "../../game/globals";
import type { Player } from "../../game/trainer/Player";
import type { SocialLinkProfile } from "./data";
import { SocialLinkSettings } from "./settings";

/** An entry of the menu's list: [profile id, profile]. */
export type LinkEntry = [Id, SocialLinkProfile];

/** Ruby's <=> on sort_by keys (arrays compared element by element). */
function compareKeys(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * SocialMediaMenu_Scene#pbSortSocialLinks on a [id, profile] list: favourites
 * first (when ALLOW_FAVORITING), then newest first / lowest bond / highest
 * bond / name.
 */
export function pbSortSocialLinks(list: LinkEntry[], sortMethod: number): void {
  const sortBy = (key: (l: SocialLinkProfile) => (number | string)[]) => {
    list.sort((a, b) => compareKeys(key(a[1]), key(b[1])));
  };
  if (SocialLinkSettings.ALLOW_FAVORITING) {
    switch (sortMethod) {
      case 0: // Newest First, default
        sortBy((s) => [s.favorite ? 1 : 0, s.timeAdded, s.name]);
        list.reverse();
        break;
      case 1: // Bond Low
        sortBy((s) => [s.favorite ? 0 : 1, s.bond, s.name]);
        break;
      case 2: // Bond High
        sortBy((s) => [s.favorite ? 0 : 1, -s.bond, s.name]);
        break;
      case 3: // Sort Alphabetically
        sortBy((s) => [s.favorite ? 0 : 1, s.name]);
        break;
    }
  } else {
    switch (sortMethod) {
      case 0: // Newest First, default
        sortBy((s) => [s.timeAdded, s.name]);
        list.reverse();
        break;
      case 1: // Bond Low
        sortBy((s) => [s.bond, s.name]);
        break;
      case 2: // Bond High
        sortBy((s) => [-s.bond, s.name]);
        break;
      case 3: // Sort Alphabetically
        sortBy((s) => [s.name]);
        break;
    }
  }
}

/** Integer#to_s_formatted: thousands separators. */
function toSFormatted(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The message codes a status may use: \PN, \PM, \n, \[RRGGBBAA], \PG/\POG,
 * \b/\r and \v[n] (repeatedly, so a variable may hold codes).
 * NOTE (Ruby parity, 003_SocialUI.rb:724-727): a variable that contains its
 * own \v[n] loops forever, as in Ruby.
 */
export function pbRunTextThroughReplacement(text: string): string {
  const player = G.player as unknown as Player | null;
  if (player) text = text.replace(/\\pn/gi, () => player.name);
  if (player) text = text.replace(/\\pm/gi, () => _INTL("${1}", toSFormatted(player.money)));
  text = text.replace(/\\n/gi, () => "\n");
  text = text.replace(/\\\[([0-9a-f]{8,8})\]/gi, (_m, c: string) => "<c2=" + c + ">");
  if (player?.male()) text = text.replace(/\\pg/gi, () => "\\b");
  if (player?.female()) text = text.replace(/\\pg/gi, () => "\\r");
  if (player?.male()) text = text.replace(/\\pog/gi, () => "\\r");
  if (player?.female()) text = text.replace(/\\pog/gi, () => "\\b");
  text = text.replace(/\\pg/gi, "");
  text = text.replace(/\\pog/gi, "");
  text = text.replace(/\\b/gi, () => "<c3=3050C8,D0D0C8>");
  text = text.replace(/\\r/gi, () => "<c3=E00808,D0D0C8>");
  for (;;) {
    const lastText = text;
    text = text.replace(/\\v\[([0-9]+)\]/gi, (_m, n: string) => {
      const v = G.gameVariables.get(Number(n));
      return v == null ? "" : String(v);
    });
    if (text === lastText) break;
  }
  return text;
}

