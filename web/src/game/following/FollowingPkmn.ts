// Port of Plugins/Following Pokemon EX's FollowingPkmn module:
// - Main Module/Event_Sprite Commands.rb: get / get_event / get_data /
//   get_pokemon, airborne/waterborne checks, refresh, remove_sprite,
//   change_sprite (as Essentials Deluxe's Species Overworlds.rb redefines it;
//   it loads after this plugin);
// - Main Module/Internal Commands.rb: active?, can_check?, refresh_internal,
//   increase_time, item, can_talk?;
// - Main Module/User Commands.rb: start_following, stop_following, toggle,
//   toggle_on/off, talk, move_route, animation;
// - New Event Type/Misc.rb: PokemonGlobalMetadata#follower_toggled= and
//   call_refresh (the fields themselves live on PokemonGlobalMetadata).
//
// Blocking Ruby (pbWait, pbMessage) is async here. refresh(false) never
// waits, so callers that can't await it (event handlers fired synchronously)
// still get all of its effects immediately.
//
// Frame counters: time_taken counts Scene_Map frames at FRAME_RATE, so the
// *_TIME_TAKEN settings (seconds) are multiplied by FRAME_RATE.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { pbMessage } from "../../ui/messages";
import { PokemonBag } from "../items/PokemonBag";
import { startsWithVowel } from "../items/itemUtilities";
import { checkGraphicFile, type ShinyParam } from "../../ui/sprites/pokemonIcon";
import { assetExists } from "../../core/assets";
import { rand } from "../../core/random";
import { EventHandlers } from "../eventHandlers";
import { FRAME_RATE, type GameCharacter } from "../GameCharacter";
import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import type { GamePlayer } from "../GamePlayer";
import { G } from "../globals";
import { pbMapInterpreter } from "../Interpreter";
import type { PokemonMapFactory } from "../MapFactory";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { FollowingPkmnConfig } from "./config";
import type { FollowerData, GameFollowerFactory } from "./GameFollowerFactory";
import type { GameFollower } from "./GameFollower";
import { PBMoveRoute, pbMoveRoute, pbTurnTowardEvent, pbWait, ESSENTIALS_FRAME_RATE } from "./moveRoute";
import { sceneMap } from "./scene";

const followers = () => G.gameTemp.followers as unknown as GameFollowerFactory | null;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;
const trainer = () => G.player as unknown as Player | null;

/** @@can_refresh */
let canRefresh = false;

export const FollowingPkmn = {
  //-----------------------------------------------------------------------------
  // Event_Sprite Commands.rb
  //-----------------------------------------------------------------------------

  /** Script Command for getting the Following Pokemon event and corresponding Follower Data. */
  get(): [GameFollower, FollowerData] | null {
    if (!FollowingPkmn.canCheck()) return null;
    for (const [event, follower] of followers()!.eachFollower()) {
      if (!follower.followingPkmn()) continue;
      return [event, follower];
    }
    return null;
  },

  /** Script Command for getting the Following Pokemon event. */
  getEvent(): GameFollower | null {
    if (!FollowingPkmn.canCheck()) return null;
    return FollowingPkmn.get()?.[0] ?? null;
  },

  /** Script Command for getting the Following Pokemon FollowerData. */
  getData(): FollowerData | null {
    if (!FollowingPkmn.canCheck()) return null;
    return FollowingPkmn.get()?.[1] ?? null;
  },

  /** Script Command for getting the Pokemon Object of the Following Pokemon. */
  getPokemon(): Pokemon | null {
    if (!FollowingPkmn.canCheck()) return null;
    return trainer()?.firstAblePokemon() ?? null;
  },

  /** Script Command for checking whether the current follower is airborne. */
  airborneFollower(): boolean {
    if (!FollowingPkmn.canCheck()) return false;
    const pkmn = FollowingPkmn.getPokemon();
    if (!pkmn) return false;
    if (pkmn.hasType("FLYING")) return true;
    if (pkmn.hasAbility("LEVITATE")) return true;
    if (FollowingPkmnConfig.LEVITATING_FOLLOWERS.some((s) => s === pkmn.species || s === `${pkmn.species}_${pkmn.form}`)) return true;
    return false;
  },

  /** Script Command for checking whether the current follower is waterborne. */
  waterborneFollower(): boolean {
    if (!FollowingPkmn.canCheck()) return false;
    const pkmn = FollowingPkmn.getPokemon();
    if (!pkmn) return false;
    if (pkmn.hasType("WATER")) return true;
    // Don't follow if the Pokemon is manually selected
    if (FollowingPkmnConfig.SURFING_FOLLOWERS_EXCEPTIONS.some((s) => s === pkmn.species || s === `${pkmn.species}_${pkmn.form}`)) return false;
    // Follow if the Pokemon flies or levitates
    if (FollowingPkmn.airborneFollower()) return true;
    return false;
  },

  /** Forcefully refresh Following Pokemon sprite with animation (if specified). */
  async refresh(anim = false): Promise<boolean | undefined> {
    if (!FollowingPkmn.canCheck()) return undefined;
    let event = FollowingPkmn.getEvent();
    FollowingPkmn.removeSprite();
    event?.calculateBushDepth();
    const firstPkmn = FollowingPkmn.getPokemon();
    if (!firstPkmn) return undefined;
    FollowingPkmn.refreshInternal();
    const ret = FollowingPkmn.active();
    event = FollowingPkmn.getEvent();
    if (anim) {
      const animId = ret ? FollowingPkmnConfig.ANIMATION_COME_OUT : FollowingPkmnConfig.ANIMATION_COME_IN;
      if (event && animId) {
        sceneMap()?.spriteset()?.addUserAnimation(animId, event.x, event.y, false, 1);
        pbMoveRoute(gamePlayer(), [PBMoveRoute.Wait, 2]);
        await pbWait(ESSENTIALS_FRAME_RATE / 5);
      }
    }
    if (ret) FollowingPkmn.changeSprite(firstPkmn);
    if (FollowingPkmnConfig.ALWAYS_ANIMATE) FollowingPkmn.moveRoute([ret ? PBMoveRoute.StepAnimeOn : PBMoveRoute.StepAnimeOff]);
    event?.calculateBushDepth();
    if (!ret) G.pokemonGlobal.timeTaken = 0;
    return ret;
  },

  /** Removes the Following Pokemon's sprite. */
  removeSprite(): void {
    const event = FollowingPkmn.getEvent();
    const data = FollowingPkmn.getData();
    if (event) event.characterName = "";
    if (data) data.characterName = "";
    if (event) event.characterHue = 0;
    if (data) data.characterHue = 0;
  },

  /** Set the Following Pokemon sprite to a different Pokemon (Essentials Deluxe version). */
  changeSprite(pkmn: Pokemon): void {
    const fname = overworldFilenameFromPokemon(pkmn).replace("Graphics/Characters/", "");
    const event = FollowingPkmn.getEvent();
    const data = FollowingPkmn.getData();
    if (event) event.characterName = fname;
    if (data) data.characterName = fname;
    if (event?.moveRouteForcing) {
      // superHue / pbCelestialHue: no installed plugin defines either for this
      // game's Pokémon (celestial? is always false), so the hue stays 0.
      const hue = 0;
      event.characterHue = hue;
      if (data) data.characterHue = hue;
    }
  },

  //-----------------------------------------------------------------------------
  // Internal Commands.rb
  //-----------------------------------------------------------------------------

  /** Checks if the Following Pokemon is active and following the player. */
  active(): boolean {
    return canRefresh;
  },

  /** Checks whether Following Pokemon data should be accessed or no. */
  canCheck(): boolean {
    if (!G.gameTemp || !G.pokemonGlobal || !G.player) return false;
    if (!G.gameTemp.followers) return false;
    if (!G.pokemonGlobal.followers) return false;
    if (!trainer()?.party) return false;
    if (!sceneMap()) return false;
    return true;
  },

  /** Refresh Following Pokemon's visibility when Following the player. */
  refreshInternal(): void {
    if (!FollowingPkmn.canCheck() || !FollowingPkmn.get() || !G.pokemonGlobal.followerToggled) {
      canRefresh = false;
      return;
    }
    const oldRefresh = canRefresh;
    let refresh: unknown = false;
    const firstPkmn = FollowingPkmn.getPokemon();
    if (firstPkmn) {
      refresh = EventHandlers.trigger2Sync("following_pkmn_appear", firstPkmn);
      if (refresh === -1) refresh = true;
    }
    canRefresh = refresh as boolean;
    const callRefresh = FollowingPkmn.callRefresh();
    if (oldRefresh !== canRefresh && !callRefresh[1]) callRefresh[1] = true;
  },

  /** Raises The Current Following Pokemon's Happiness by 3-5 and checks for hold item. */
  increaseTime(): void {
    if (!FollowingPkmn.canCheck()) return;
    const g = G.pokemonGlobal;
    g.timeTaken += 1;
    const friendshipTime = FollowingPkmnConfig.FRIENDSHIP_TIME_TAKEN * FRAME_RATE;
    const itemTime = FollowingPkmnConfig.ITEM_TIME_TAKEN * FRAME_RATE;
    if (g.timeTaken % friendshipTime === 0) FollowingPkmn.getPokemon()?.changeHappiness("levelup");
    if (g.timeTaken > itemTime) g.followerHoldItem = true;
  },

  /** Script Command for Following Pokémon finding an item in the field. */
  async item(item: Id, quantity = 1, message: string | null = null): Promise<boolean> {
    if (!FollowingPkmn.canCheck()) return false;
    if (!G.pokemonGlobal.followerHoldItem) return false;
    const pokename = FollowingPkmn.getPokemon()?.name;
    if (!message) message = _INTL("{1} seems to be holding something...");
    await pbMessage(_INTL(message, pokename));
    const itemData = Item.tryGet(item);
    if (!itemData || quantity < 1) return false;
    const itemname = quantity > 1 ? itemData.namePlural : itemData.name;
    const pocket = itemData.pocket;
    const move = itemData.move;
    if (G.bag.add(itemData, quantity)) { // If item can be picked up
      const meName = itemData.isKeyItem() ? "Key item get" : "Item get";
      if (itemData.id === "LEFTOVERS") {
        await pbMessage(_INTL("\\me[{1}]{3} found some \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname, pokename));
      } else if (itemData.id === "DNASPLICERS") {
        await pbMessage(_INTL("\\me[{1}]{3} found \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname, pokename));
      } else if (itemData.isMachine()) { // TM or HM
        await pbMessage(_INTL("\\me[{1}]{4} found \\c[1]{2} {3}\\c[0]!\\wtnp[30]", meName, itemname, MoveData.get(move!).name, pokename));
      } else if (quantity > 1) {
        await pbMessage(_INTL("\\me[{1}]{4} found {2} \\c[1]{3}\\c[0]!\\wtnp[30]", meName, quantity, itemname, pokename));
      } else if (startsWithVowel(itemname)) {
        await pbMessage(_INTL("\\me[{1}]{3} found an \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname, pokename));
      } else {
        await pbMessage(_INTL("\\me[{1}]{3} found a \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname, pokename));
      }
      // NOTE: PokemonBag.pocket_names[pocket] in the plugin: pocket numbers start
      //       at 1 but the names array at 0, so this names the next pocket (as in Ruby).
      await pbMessage(_INTL("You put the {1} away\\nin the <icon=bagPocket{2}>\\c[1]{3} Pocket\\c[0].",
        itemname, pocket, PokemonBag.pocketNames()[pocket] ?? ""));
      G.pokemonGlobal.followerHoldItem = false;
      G.pokemonGlobal.timeTaken = 0;
      return true;
    }
    // Can't add the item
    if (itemData.id === "LEFTOVERS") {
      await pbMessage(_INTL("{1} found some \\c[1]{2}\\c[0]!\\wtnp[30]", pokename, itemname));
    } else if (itemData.id === "DNASPLICERS") {
      await pbMessage(_INTL("{1} found \\c[1]{2}\\c[0]!\\wtnp[30]", pokename, itemname));
    } else if (itemData.isMachine()) { // TM or HM
      await pbMessage(_INTL("{1} found \\c[1]{2} {3}\\c[0]!\\wtnp[30]", pokename, itemname, MoveData.get(move!).name));
    } else if (quantity > 1) {
      await pbMessage(_INTL("{1} found {2} \\c[1]{3}\\c[0]!\\wtnp[30]", pokename, quantity, itemname));
    } else if (startsWithVowel(itemname)) {
      await pbMessage(_INTL("{1} found an \\c[1]{2}\\c[0]!\\wtnp[30]", pokename, itemname));
    } else {
      await pbMessage(_INTL("{1} found a \\c[1]{2}\\c[0]!\\wtnp[30]", pokename, itemname));
    }
    await pbMessage(_INTL("But your Bag is full..."));
    return false;
  },

  /** Check if the Following Pokemon can be spoken to, or not. */
  async canTalk(interact = false): Promise<boolean> {
    if (!FollowingPkmn.canCheck()) return false;
    const t = G.gameTemp;
    if (!t || t.inBattle || t.inMenu) return false;
    if (FollowingPkmn.getEvent()!.moveRouteForcing) return false;
    const p = gamePlayer();
    if (p.moveRouteForcing) return false;
    const facing = (G.mapFactory as unknown as PokemonMapFactory).getFacingTile();
    if (!FollowingPkmn.active() || !facing || !gameMap().passable(facing[1], facing[2], p.direction, p)) {
      if (interact) {
        p.straighten();
        await EventHandlers.trigger("on_player_interact");
      }
      return false;
    }
    return true;
  },

  //-----------------------------------------------------------------------------
  // User Commands.rb
  //-----------------------------------------------------------------------------

  /** Script Command to have an event follow the player as a Following Pokemon. */
  async startFollowing(eventId: number | null = null, anim = true): Promise<boolean | undefined> {
    if (!FollowingPkmn.canCheck()) return undefined;
    const interp = pbMapInterpreter();
    const event = (eventId == null && interp ? interp.getCharacter(0) : gameMap().events.get(eventId!)) as GameEvent | null | undefined;
    if (!FollowingPkmn.getPokemon() || !event) return false;
    let leader: GameCharacter = gamePlayer();
    const p = gamePlayer();
    if (![[-1, 0], [1, 0], [0, 1], [0, -1]].some(([ox, oy]) => event.x === p.x + ox! && event.y === p.y + oy!)) {
      const behindDirection = 10 - leader.direction;
      const target = (G.mapFactory as unknown as PokemonMapFactory).getFacingTile(behindDirection, leader) ?? [leader.map.mapId, leader.x, leader.y];
      event.moveto(target[1], target[2]);
    }
    const f = followers()!;
    f.removeFollowerByName("FollowerPkmn");
    if (FollowingPkmn.get()) f.removeFollowerByName("FollowingPkmn");
    f.addFollower(event, "FollowingPkmn", FollowingPkmnConfig.FOLLOWER_COMMON_EVENT);
    FollowingPkmn.setFollowerToggled(true);
    for (const [ev, follower] of f.eachFollower()) {
      if (follower.followingPkmn()) {
        pbTurnTowardEvent(ev, leader);
        follower.direction = ev.direction;
      }
      leader = ev;
    }
    return FollowingPkmn.refresh(anim);
  },

  /** Script Command to remove the event following the player as a Following Pokemon. */
  stopFollowing(): void {
    if (!FollowingPkmn.canCheck()) return;
    followers()!.removeFollowerByName("FollowerPkmn");
    followers()!.removeFollowerByName("FollowingPkmn");
  },

  /** Script Command to toggle Following Pokemon. */
  async toggle(forced: boolean | null = null, anim: boolean | null = null): Promise<void> {
    if (!FollowingPkmn.canCheck() || !FollowingPkmn.get()) return;
    if (!FollowingPkmn.getPokemon()) return;
    const anim1 = FollowingPkmn.active();
    if (forced != null) {
      // This may seem redundant but it keeps follower_toggled a boolean always
      FollowingPkmn.setFollowerToggled(!!forced);
    } else {
      FollowingPkmn.setFollowerToggled(!G.pokemonGlobal.followerToggled);
    }
    const anim2 = FollowingPkmn.active();
    if (anim == null) anim = anim1 !== anim2;
    await FollowingPkmn.refresh(anim);
    followers()!.moveFollowers();
    followers()!.turnFollowers();
  },

  /** Script Command to toggle Following Pokemon off. */
  toggleOff(anim: boolean | null = null): Promise<void> {
    return FollowingPkmn.toggle(false, anim);
  },

  /** Script Command to toggle Following Pokemon on. */
  toggleOn(anim: boolean | null = null): Promise<void> {
    return FollowingPkmn.toggle(true, anim);
  },

  /** Script Command for talking to Following Pokemon. */
  async talk(): Promise<boolean> {
    if (!(await FollowingPkmn.canTalk(true))) return false;
    const t = G.gameTemp;
    if (!t || t.inBattle || t.inMenu) return false;
    const event = FollowingPkmn.getEvent()!;
    pbTurnTowardEvent(event, gamePlayer());
    const firstPkmn = FollowingPkmn.getPokemon();
    firstPkmn?.playCry();
    const randomVal = rand(6);
    if (G.pokemonGlobal?.followerHoldItem) {
      await EventHandlers.trigger2("following_pkmn_item", firstPkmn, randomVal);
    } else {
      await EventHandlers.trigger2("following_pkmn_talk", firstPkmn, randomVal);
    }
    pbTurnTowardEvent(event, gamePlayer());
    return true;
  },

  /** Control the following Pokemon using move routes. */
  moveRoute(commands: unknown[] | null = null, waitComplete = false): void {
    if (commands == null) {
      pbMapInterpreter()?.followerMoveRoute("FollowingPkmn");
      return;
    }
    if (!FollowingPkmn.canCheck()) return;
    const event = FollowingPkmn.getEvent();
    if (event) pbMoveRoute(event, commands, false);
    if (event && waitComplete) pbMapInterpreter()?.command210();
  },

  /** Script Command for adding an animation to the Following Pokemon event. */
  animation(id: number | null = null): void {
    if (!FollowingPkmn.canCheck() || !FollowingPkmn.active()) return;
    if (id == null) {
      pbMapInterpreter()?.followerAnimation("FollowingPkmn");
      return;
    }
    const sprites = sceneMap()?.spritesetGlobal?.followerSprites;
    if (!sprites) return;
    sprites.setAnimation(id);
  },

  //-----------------------------------------------------------------------------
  // Misc.rb: PokemonGlobalMetadata accessors
  //-----------------------------------------------------------------------------

  /** $PokemonGlobal.follower_toggled = value (the writer refreshes the follower's state). */
  setFollowerToggled(value: boolean): void {
    G.pokemonGlobal.followerToggled = value;
    FollowingPkmn.refreshInternal();
  },

  /** $PokemonGlobal.call_refresh: [queued, animate, steps to wait] */
  callRefresh(): unknown[] {
    const g = G.pokemonGlobal;
    if (!Array.isArray(g.callRefresh)) g.callRefresh = [false, false];
    return g.callRefresh;
  },

  /** $PokemonGlobal.call_refresh = value */
  setCallRefresh(value: unknown): void {
    G.pokemonGlobal.callRefresh = Array.isArray(value) ? value : [value, false];
  },
};

/** GameData::Species.overworld_filename_from_pokemon (Essentials Deluxe). */
export function overworldFilenameFromPokemon(pkmn: Pokemon): string {
  const shiny: ShinyParam = pkmn.superShiny ? "super_shiny" : pkmn.shiny;
  const params = { species: pkmn.species, form: pkmn.form, gender: pkmn.gender, shiny, shadow: pkmn.shadowPokemon(), celestial: pkmn.celestial() };
  return checkGraphicFile("Graphics/Characters/", params, "Followers", resolveCharacterFile) ?? "Graphics/Characters/Followers/";
}

/** pbResolveBitmap: the file with the extension it was found with (".png", then ".gif"). */
function resolveCharacterFile(path: string): string | null {
  for (const ext of [".png", ".gif"]) if (assetExists(path + ext)) return path + ext;
  return null;
}
