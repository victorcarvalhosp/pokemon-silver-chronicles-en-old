// Port of Plugins/Social Links/004_Player.rb: Player#social_links /
// #bond_effects / #active_bond_effect? / #refresh_bond_effects and the
// Player::SocialLinks class (the player's links, keyed by profile id, newest
// first). The Player fields themselves are in game/trainer/Player.ts
// (`socialLinks`, created by Player's constructor and rebuilt by fromJSON;
// `bondEffects`).
//
// NOTE (Ruby parity): nothing in the game calls active_bond_effect? (not
// Essentials, not this plugin, not another one), so Bond Effects are tracked
// and announced but never change Exp. gain, shininess or catch rates; see
// docs/original-game-bugs.md. activeBondEffect is ported for completeness.

import { _INTL } from "../../core/intl";
import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { Type } from "../../data/gameData/type";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { GameDataSocialLinkProfile, SocialLinkProfile, type SocialLinkProfileJSON } from "./data";
import { SocialLinkSettings } from "./settings";

/** [type, rate (EXP/CatchRate multiplier, Shiny extra rolls), profile id] */
export type BondEffect = [Id, number, Id];
export type BondEffectStyle = "EXP" | "Shiny" | "CatchRate";

/**
 * pbMessage / pbSEPlay / Console.echo_warn. Loaded when needed (the logic here
 * also runs in node tests, which replace these).
 */
export const socialLinksIO = {
  async message(text: string): Promise<void> {
    const { pbMessage } = await import("../../ui/messages");
    await pbMessage(text);
  },
  async se(name: string): Promise<void> {
    const { pbSEPlay } = await import("../../game/GameSystem");
    pbSEPlay(name);
  },
  warn(text: string): void {
    console.warn(text);
  },
};

/** A Ruby NoMethodError (as the event scripts' errors: rubyErrors.ts). */
function noMethodError(message: string): never {
  const e = new Error(message);
  e.name = "NoMethodError";
  throw e;
}

//===============================================================================
// Player
//===============================================================================
/** $player as the plugin uses it. */
function player(): Player {
  return G.player as unknown as Player;
}

/** Player#social_links: created when missing. */
export function socialLinksOf(p: Player): SocialLinks {
  if (!(p.socialLinks instanceof SocialLinks)) p.socialLinks = new SocialLinks();
  return p.socialLinks;
}

/** pbPlayerSocialLinksSaved: $player.social_links. */
export function pbPlayerSocialLinksSaved(): SocialLinks {
  return socialLinksOf(player());
}

function effectsOf(p: Player, style: string): BondEffect[] | undefined {
  return (p.bondEffects as unknown as Record<string, BondEffect[] | undefined>)[style];
}

/**
 * Player#active_bond_effect?(style, pkmn): the highest rate (EXP, CatchRate)
 * or number of extra shiny rolls (Shiny) among the active effects for one of
 * pkmn's types; null when none applies.
 */
export function activeBondEffect(p: Player, style: string, pkmn: Pokemon): number | null {
  const array = effectsOf(p, style);
  if (!array) return null;
  if (style !== "EXP" && style !== "Shiny" && style !== "CatchRate") return null;
  let rate: number | null = null;
  for (const bond of array) {
    if (pkmn.hasType(bond[0]) && (rate == null || bond[1] > rate)) rate = bond[1];
  }
  return rate;
}

const sameEffect = (a: BondEffect, b: BondEffect) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Player#refresh_bond_effects(profile_id, bond, silent): adds/removes profile_id's effects for its bond level. */
export async function refreshBondEffects(p: Player, profileId: Id, bond: number, silent = false): Promise<void> {
  const effects = GameDataSocialLinkProfile.get(profileId).bondEffects;
  const all = p.bondEffects as unknown as Record<string, BondEffect[] | undefined>;
  for (const [key, val] of effects) {
    for (const [effectType, type, rate] of val) {
      let array: BondEffect;
      switch (effectType) {
        case "EXP": array = [type, rate ?? 1.1, profileId]; break;
        case "Shiny": array = [type, rate ?? 1, profileId]; break;
        case "CatchRate": array = [type, rate ?? 1.1, profileId]; break;
        default: array = null as unknown as BondEffect; // (Ruby's case falls through to nil)
      }
      const list = all[effectType];
      const index = list && array ? list.findIndex((e) => sameEffect(e, array)) : -1;
      if (bond < key && list && index >= 0) {
        for (let i = list.length - 1; i >= 0; i--) if (sameEffect(list[i]!, array)) list.splice(i, 1); // (Array#delete: every copy)
      } else if (bond >= key) {
        if (!list) noMethodError("undefined method `include?' for nil:NilClass");
        if (index >= 0) continue;
        list.push(array);
        if (SocialLinkSettings.SHOW_BOND_EFFECT_MESSAGE && !silent) {
          const typeName = Type.get(array[0]).name;
          switch (effectType) {
            case "EXP":
              if (array[1] > 1) {
                await socialLinksIO.message(_INTL("Your {1}-type Pokémon will now gain more Exp. Points!", typeName));
              } else if (array[1] < 1) {
                await socialLinksIO.message(_INTL("Your {1}-type Pokémon will now gain less Exp. Points.", typeName));
              }
              break;
            case "Shiny":
              if (array[1] >= 1) {
                await socialLinksIO.message(_INTL("{1}-type Pokémon will now have a higher chance of being Shiny!", typeName));
              } else if (array[1] < 0) {
                await socialLinksIO.message(_INTL("{1}-type Pokémon will now have a lower chance of being Shiny.", typeName));
              }
              break;
            case "CatchRate":
              if (array[1] > 1) {
                await socialLinksIO.message(_INTL("{1}-type Pokémon will now be easier to catch!", typeName));
              } else if (array[1] < 1) {
                await socialLinksIO.message(_INTL("{1}-type Pokémon will now be harder to catch.", typeName));
              }
              break;
          }
        }
      }
    }
  }
}

//===============================================================================
// Player::SocialLinks
//===============================================================================
/** What pbSanitizeProfileID accepts: a profile id, or the event (`self` in an event script). */
export type ProfileRef = Id | { name: string; id?: number; mapId?: number; map_id?: number } | null | undefined;

/** :Random for pbSetLinkStatus. */
export const RANDOM_STATUS = Symbol("Random");

export interface SocialLinksJSON {
  links: SocialLinkProfileJSON[];
  themeColor: string;
}

export class SocialLinks {
  /** profile id => profile, newest first (Ruby's hash order). */
  links = new Map<Id, SocialLinkProfile>();
  themeColor: string = SocialLinkSettings.DEFAULT_THEME_COLOR;

  /**
   * pbSanitizeProfileID(object): a profile id as it is; for an event (or an
   * interpreter's event), the id in its name's "SocialLink(:ID)" label.
   */
  pbSanitizeProfileID(object: ProfileRef | unknown): Id | null {
    if (typeof object === "string") return object;
    let actualId: Id | null = null;
    let event = object as { name?: unknown; id?: number; mapId?: number; map_id?: number; getCharacter?: (n: number) => unknown } | null;
    if (event && typeof event.getCharacter === "function") event = event.getCharacter(0) as typeof event; // an Interpreter
    if (event && typeof event.name === "string") {
      const m = /sociallink\(:(\w+)\)$/i.exec(event.name);
      if (m) actualId = m[1]!;
    }
    if (actualId == null) {
      if (!event) noMethodError("undefined method `id' for nil:NilClass");
      socialLinksIO.warn(_INTL("Social Links plugin: Invalid use of self argument. A SocialLink(:ID_HERE) label is not included in the event name. Info: Event {1} {2} on Map {3}",
        event.id, event.name, event.mapId ?? event.map_id));
    }
    return actualId;
  }

  private link(profileId: Id): SocialLinkProfile | undefined {
    return this.links.get(profileId);
  }

  async pbAddLink(object: ProfileRef, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    if (this.pbHasLink(profileId)) return false;
    this.links = new Map([[profileId, new SocialLinkProfile(profileId)], ...this.links]);
    if (!silent) {
      await socialLinksIO.se(SocialLinkSettings.NEW_LINK_SOUND_EFFECT);
      await socialLinksIO.message(_INTL(SocialLinkSettings.NEW_LINK_MESSAGE + "\\wtnp[40]", this.link(profileId)!.name));
    }
    return true;
  }

  async pbRemoveLink(object: ProfileRef, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    if (!this.pbHasLink(profileId)) return false;
    if (!silent) await socialLinksIO.message(_INTL(SocialLinkSettings.REMOVED_LINK_MESSAGE, this.link(profileId)!.name));
    this.links.delete(profileId);
    return true;
  }

  pbHasLink(object: ProfileRef): boolean {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    return this.link(profileId) != null;
  }

  private async grewMessage(link: SocialLinkProfile, val: number, maxBond: number): Promise<void> {
    if (link.bond === maxBond && SocialLinkSettings.SHOW_MAXED_BOND_MESSAGE) {
      await socialLinksIO.se(SocialLinkSettings.MAXED_BOND_SOUND_EFFECT);
      await socialLinksIO.message(_INTL(SocialLinkSettings.MAXED_BOND_MESSAGE + "", link.name));
    } else if (val === 1) {
      await socialLinksIO.message(_INTL("Your bond with {1} grew a bit stronger!", link.name));
    } else if (val === 2) {
      await socialLinksIO.message(_INTL("Your bond with {1} grew stronger!", link.name));
    } else {
      await socialLinksIO.message(_INTL("Your bond with {1} grew a lot stronger!", link.name));
    }
  }

  private async weakenedMessage(link: SocialLinkProfile, val: number): Promise<void> {
    if (val === 1) {
      await socialLinksIO.message(_INTL("Your bond with {1} has weakened a bit.", link.name));
    } else if (val === 2) {
      await socialLinksIO.message(_INTL("Your bond with {1} has weakened.", link.name));
    } else {
      await socialLinksIO.message(_INTL("Your bond with {1} has weakened significantly.", link.name));
    }
  }

  private async refreshEffects(profileId: Id, link: SocialLinkProfile, silent: boolean): Promise<void> {
    // (`if GameData::SocialLinkProfile.get(profile_id)&.bond_effects`: always, as {} is truthy)
    await refreshBondEffects(player(), profileId, link.bond, silent);
  }

  async pbGainLinkBond(object: ProfileRef, val = 1, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    if (!link) return false;
    const oldVal = link.bond;
    link.bond += val;
    const maxBond = link.bondMax;
    if (link.bond > maxBond) link.bond = maxBond;
    if (oldVal !== link.bond) {
      if (!silent) await this.grewMessage(link, val, maxBond);
      if (SocialLinkSettings.RESET_MOMENTS_ON_BOND_INCREASE) link.moments = 0;
      await this.refreshEffects(profileId, link, silent);
      return true;
    }
    return false;
  }

  async pbLowerLinkBond(object: ProfileRef, val = 1, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    if (!link) return false;
    const oldVal = link.bond;
    link.bond -= val;
    if (link.bond < 0) link.bond = 0;
    if (oldVal !== link.bond) {
      if (!silent) await this.weakenedMessage(link, val);
      await this.refreshEffects(profileId, link, silent);
      return true;
    }
    return false;
  }

  /**
   * NOTE (Ruby parity, 004_Player.rb:221 and :234): the bond isn't clamped
   * (`bond.clamp(0, max_bond)` discards its result), so it can go past the max
   * or below 0; and reaching exactly the max with a message raises
   * NoMethodError (`MAXED_BOND_MESSAGE ""` is a method call) after the sound
   * effect played and the bond was set, before moments reset and the effects
   * refresh. The "weakened"/"grew" messages pick their wording from the new
   * value, not the change.
   */
  async pbSetLinkBond(object: ProfileRef, val = 1, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    if (!link) return false;
    const oldVal = link.bond;
    link.bond = val;
    const maxBond = link.bondMax;
    if (oldVal !== link.bond) {
      if (oldVal > link.bond && !silent) {
        await this.weakenedMessage(link, val);
      } else if (oldVal < link.bond && !silent) {
        if (link.bond === maxBond && SocialLinkSettings.SHOW_MAXED_BOND_MESSAGE) {
          await socialLinksIO.se(SocialLinkSettings.MAXED_BOND_SOUND_EFFECT);
          noMethodError("undefined method `MAXED_BOND_MESSAGE' for SocialLinkSettings:Module");
        } else if (val === 1) {
          await socialLinksIO.message(_INTL("Your bond with {1} grew a bit stronger!", link.name));
        } else if (val === 2) {
          await socialLinksIO.message(_INTL("Your bond with {1} grew stronger!", link.name));
        } else {
          await socialLinksIO.message(_INTL("Your bond with {1} grew a lot stronger!", link.name));
        }
        if (SocialLinkSettings.RESET_MOMENTS_ON_BOND_INCREASE) link.moments = 0;
      }
      await this.refreshEffects(profileId, link, silent);
      return true;
    }
    return false;
  }

  pbGetLinkBond(object: ProfileRef): number {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return 0;
    return this.link(profileId)?.bond ?? 0;
  }

  pbLinkBondMaxed(object: ProfileRef): boolean {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    return !(!link || link.bond < link.bondMax);
  }

  async pbGainLinkMoment(object: ProfileRef, val = 1, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    if (!link) return false;
    const oldVal = link.moments;
    link.moments += val;
    const maxMoments = link.momentsMax;
    if (link.moments > maxMoments) link.moments = maxMoments;
    if (oldVal !== link.moments) {
      if (!silent) {
        if (val === 1) {
          await socialLinksIO.message(_INTL("You shared a moment with {1}!", link.name));
        } else {
          await socialLinksIO.message(_INTL("You shared a significant moment with {1}!", link.name));
        }
      }
      return true;
    }
    return false;
  }

  async pbLowerLinkMoment(object: ProfileRef, val = 1, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    if (!link) return false;
    const oldVal = link.moments;
    link.moments -= val;
    if (link.moments < 0) link.moments = 0;
    if (oldVal !== link.moments) {
      if (!silent) {
        if (val === 1) {
          await socialLinksIO.message(_INTL("You shared an unfortunate moment with {1}.", link.name));
        } else {
          await socialLinksIO.message(_INTL("You shared a significant, unfortunate moment with {1}.", link.name));
        }
      }
      return true;
    }
    return false;
  }

  /**
   * NOTE (Ruby parity, 004_Player.rb:315 and :323): moments aren't clamped
   * (the clamp's result is discarded), and the "shared a moment" message
   * compares the old moments with the *bond* instead of the new moments.
   */
  async pbSetLinkMoment(object: ProfileRef, val = 1, silent = false): Promise<boolean> {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    if (!link) return false;
    const oldVal = link.moments;
    link.moments = val;
    if (oldVal !== link.moments) {
      if (oldVal > link.moments && !silent) {
        if (val === 1) {
          await socialLinksIO.message(_INTL("You shared an unfortunate moment with {1}.", link.name));
        } else {
          await socialLinksIO.message(_INTL("You shared a significant, unfortunate moment with {1}.", link.name));
        }
      } else if (oldVal < link.bond && !silent) {
        if (val === 1) {
          await socialLinksIO.message(_INTL("You shared a moment with {1}!", link.name));
        } else {
          await socialLinksIO.message(_INTL("You shared a significant moment with {1}!", link.name));
        }
      }
      return true;
    }
    return false;
  }

  pbGetLinkMoments(object: ProfileRef): number {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return 0;
    return this.link(profileId)?.moments ?? 0;
  }

  pbLinkMomentsMaxed(object: ProfileRef): boolean {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    const link = this.link(profileId);
    return !(!link || link.moments < link.momentsMax);
  }

  /** Raises NoMethodError, as in Ruby, when the player doesn't have the link. */
  private linkOrRaise(profileId: Id, setter: string): SocialLinkProfile {
    const link = this.link(profileId);
    if (!link) noMethodError(`undefined method \`${setter}=' for nil:NilClass`);
    return link;
  }

  pbSetLinkLocation(object: ProfileRef, location: string): boolean {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    this.linkOrRaise(profileId, "current_location").currentLocation = location;
    return true;
  }

  pbSetLinkPokemon(object: ProfileRef, species: Id | null, gender: number, form: number, shiny: boolean): boolean {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    this.linkOrRaise(profileId, "favorite_pokemon").favoritePokemon = species == null ? null : [species, gender, form, shiny];
    return true;
  }

  /**
   * pbSetLinkStatus(profile_id, status): a String sets it; an Integer picks
   * static_status_pool[status] once (Ruby indexing: negatives from the end);
   * :Random (RANDOM_STATUS) picks one of random_status_pool's not shown yet
   * whose minimum bond the link has.
   */
  pbSetLinkStatus(object: ProfileRef, status: string | number | typeof RANDOM_STATUS): boolean {
    const profileId = this.pbSanitizeProfileID(object);
    if (profileId == null) return false;
    if (typeof status === "string") {
      this.linkOrRaise(profileId, "current_status").currentStatus = status;
      return true;
    } else if (typeof status === "number" && Number.isInteger(status)) {
      const data = GameDataSocialLinkProfile.get(profileId);
      const chosen = data.staticStatusPool.at(status);
      if (chosen == null) return false;
      const link = this.link(profileId);
      if (!link) noMethodError("undefined method `past_statuses' for nil:NilClass");
      if (link.pastStatuses.includes(chosen)) return false;
      link.currentStatus = chosen;
      link.pastStatuses.push(chosen);
      return true;
    } else if (status === RANDOM_STATUS) {
      const data = GameDataSocialLinkProfile.get(profileId).randomStatusPool;
      const pool: string[] = [];
      for (const s of data) {
        const link = this.link(profileId);
        if (!link) noMethodError("undefined method `bond' for nil:NilClass");
        if ((s[1] == null || s[1] <= link.bond) && !link.pastStatuses.includes(s[0])) pool.push(s[0]);
      }
      if (pool.length === 0) return false;
      const r = rand(pool.length);
      const link = this.link(profileId)!;
      link.currentStatus = pool[r]!;
      link.pastStatuses.push(pool[r]!);
      return true;
    }
    return false;
  }

  toJSON(): SocialLinksJSON {
    return { links: [...this.links.values()].map((l) => l.toJSON()), themeColor: this.themeColor };
  }

  static fromJSON(json: SocialLinksJSON): SocialLinks {
    const s = new SocialLinks();
    s.links = new Map((json.links ?? []).map((l) => [l.id, SocialLinkProfile.fromJSON(l)]));
    s.themeColor = json.themeColor ?? SocialLinkSettings.DEFAULT_THEME_COLOR;
    return s;
  }
}
