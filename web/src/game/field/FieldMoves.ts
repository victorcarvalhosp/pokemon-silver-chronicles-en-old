// Port of 012_Overworld/004_Overworld_FieldMoves.rb:187-1038: Cut, Dig,
// Dive, Flash, Fly, Headbutt, Rock Smash, Strength, Surf, Sweet Scent,
// Teleport and Waterfall, their HiddenMoveHandlers and :on_player_interact
// handlers, in the Ruby's order.
//
// Plugins that replace parts of this file:
// - Following Pokemon EX (Script Additions/Field Moves.rb) aliases pbSurf,
//   pbStartSurfing, pbEndSurf, pbDive, pbSurfacing, pbUseHiddenMove,
//   pbHeadbutt and pbWaterfall, and redefines pbAscendWaterfall /
//   pbDescendWaterfall: ./followingFieldMoves.ts swaps those bindings in
//   (the handlers below call the swappable `FieldMoves.x`, as Ruby's late
//   binding does).
// - Fly Animation ([003]HM Handlers.rb) re-registers the FLY UseMove handler
//   (./FlyAnimation.ts).
// - Pokemon Silver Chronicles Helpers (Whilrpool HM.rb) adds WHIRLPOOL
//   (./Whirlpool.ts).

import type { Id } from "../../data/gameData/gameData";
import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { rand } from "../../core/random";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Viewport } from "../../rgss/display";
import { pbFadeOutIn } from "../../ui/fades";
import { _INTL } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { pbGetMapNameFromId } from "../../ui/planes";
import { pbWait } from "../../ui/scenes/frames";
import { pokemonEncounters, pbEncounter } from "../encounters/PokemonEncounters";
import { EventHandlers } from "../eventHandlers";
import { FRAME_RATE } from "../GameCharacter";
import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { pbCancelVehicles, pbOnStepTaken, pbUpdateVehicle, type GamePlayer } from "../GamePlayer";
import { pbBGMPlay, pbSEPlay } from "../GameSystem";
import { G, pbUpdateSceneMap } from "../globals";
import type { PokemonMapFactory } from "../MapFactory";
import { pbCueBGM } from "../mapAudio";
import { mapMetadata, metadata, playerMetadata, type MapMetadata } from "../metadata";
import type { PokemonMapMetadata } from "../PokemonMapMetadata";
import type { Pokemon } from "../pokemon/Pokemon";
import { pbMoveRoute, PBMoveRoute } from "../scripts/moveRoute";
import type { GameStats } from "../trainer/GameStats";
import type { Player } from "../trainer/Player";
import { pbDismountBike } from "./bicycle";
import type { DarknessSprite } from "./DarknessSprite";
import { CanUseContext, checkBadge, FieldDebug, HiddenMoveHandlers } from "./HiddenMoveHandlers";
import { pbHiddenMoveAnimation } from "./hiddenMoveAnimation";
import { pbJumpToward, pbJumpTowardStart, pbWaitWhileJumping } from "./overworld";

const player = () => G.player as unknown as Player;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;
const stats = () => G.stats as GameStats;
const mapFactory = () => G.mapFactory as unknown as PokemonMapFactory;
/** $PokemonMap */
const pokemonMap = () => (G as unknown as { pokemonMap: PokemonMapMetadata | null }).pokemonMap;
/** $scene (Scene_Map) */
const scene = () => G.scene as unknown as { transferPlayer(cancelVehicles?: boolean): Promise<void> };
/** $game_map.metadata */
const currentMapMetadata = (): MapMetadata | undefined => mapMetadata(gameMap().mapId);
/** GameData::Move.get(move).name */
const moveName = (move: Id) => Move.get(move).name;

/** $game_temp fields this file reads and writes. */
export interface FieldTemp {
  flyDestination?: [number, number, number] | null;
  surfBaseCoords?: [number, number] | null;
  darknessSprite?: DarknessSprite | null;
  noFollowerFieldMove?: boolean;
  inMenu: boolean;
  endingSurf: boolean;
}
const temp = () => G.gameTemp as unknown as FieldTemp;

/** $PokemonGlobal fields this file reads and writes. */
interface FieldGlobal {
  surfing: boolean;
  diving: boolean;
  escapePoint: number[] | null;
  flashUsed?: boolean;
  healingSpot?: number[] | null;
}
const global = () => G.pokemonGlobal as unknown as FieldGlobal;

/** $map_factory.getFacingCoords(x, y, direction, steps) */
export function getFacingCoords(x: number, y: number, direction = 0, steps = 1): [number, number] {
  switch (direction) {
    case 1: x -= steps; y += steps; break;
    case 2: y += steps; break;
    case 3: x += steps; y += steps; break;
    case 4: x -= steps; break;
    case 6: x += steps; break;
    case 7: x -= steps; y -= steps; break;
    case 8: y -= steps; break;
    case 9: x += steps; y -= steps; break;
  }
  return [x, y];
}

/** pbEraseEscapePoint (012_Overworld/001_Overworld.rb) */
export function pbEraseEscapePoint(): void {
  global().escapePoint = [];
}

/** The map whose dive_map_id is the current map (the surface above an underwater map). */
function surfaceMapId(): number | null {
  // GameData::MapMetadata.each
  for (let id = 1; id <= 999; id++) {
    const data = mapMetadata(id);
    if (!data || !data.diveMapId || data.diveMapId !== gameMap().mapId) continue;
    return data.id;
  }
  return null;
}

/** The functions plugins replace; handlers call these so the aliases apply. */
export const FieldMoves = {
  pbSurf: (): Promise<boolean> => pbSurfCore(),
  pbStartSurfing: (): Promise<void> => pbStartSurfingCore(),
  /** pbEndSurf runs inside the player's move (sync); its jump finishes in a queued blocking step. */
  pbEndSurf: (xOffset: number, yOffset: number): boolean => pbEndSurfCore(xOffset, yOffset),
  pbDive: (): Promise<boolean> => pbDiveCore(),
  pbSurfacing: (): Promise<boolean | undefined> => pbSurfacingCore(),
  pbHeadbutt: (event: GameEvent | null = null): Promise<boolean> => pbHeadbuttCore(event),
  pbWaterfall: (): Promise<boolean> => pbWaterfallCore(),
  pbAscendWaterfall: (): Promise<void> => pbAscendWaterfallCore(),
  pbDescendWaterfall: (): Promise<void> => pbDescendWaterfallCore(),
};

//===============================================================================
// Cut
//===============================================================================
/** pbCut */
export async function pbCut(): Promise<boolean> {
  const move = "CUT";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_CUT, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    await pbMessage(_INTL("This tree looks like it can be cut down."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("This tree looks like it can be cut down!\nWould you like to cut it?"))) {
    stats().cutCount += 1;
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    return true;
  }
  return false;
}

HiddenMoveHandlers.CanUseMove.add("CUT", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_CUT, ctx)) return false;
  const facingEvent = gamePlayer().pbFacingEvent();
  if (!facingEvent || !/cuttree/i.test(facingEvent.name)) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("CUT", async (move, pokemon) => {
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  stats().cutCount += 1;
  const facingEvent = gamePlayer().pbFacingEvent();
  if (facingEvent) await pbSmashEvent(facingEvent);
  return true;
});

/** pbSmashEvent(event): the shake-and-vanish of a cut tree or smashed rock. */
export async function pbSmashEvent(event: GameEvent | null): Promise<void> {
  if (!event) return;
  if (/cuttree/i.test(event.name)) {
    pbSEPlay("Cut", 80);
  } else if (/smashrock/i.test(event.name)) {
    pbSEPlay("Rock Smash", 80);
  }
  pbMoveRoute(event, [PBMoveRoute.Wait, 2,
    PBMoveRoute.TurnLeft,
    PBMoveRoute.Wait, 2,
    PBMoveRoute.TurnRight,
    PBMoveRoute.Wait, 2,
    PBMoveRoute.TurnUp,
    PBMoveRoute.Wait, 2]);
  await pbWait(Math.floor((40 * 4) / 10));
  event.erase();
  pokemonMap()?.addErasedEvent(event.id);
}

//===============================================================================
// Dig
//===============================================================================
HiddenMoveHandlers.CanUseMove.add("DIG", (_move, _pkmn, ctx) => {
  const escape = global().escapePoint;
  if (!escape || escape.length === 0) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  if (!gamePlayer().canMapTransferWithFollower()) {
    ctx.message(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.ConfirmUseMove.add("DIG", async () => {
  const escape = global().escapePoint;
  if (!escape || escape.length === 0) return false;
  const mapname = pbGetMapNameFromId(escape[0]!);
  return pbConfirmMessage(_INTL("Want to escape from here and return to {1}?", mapname));
});

HiddenMoveHandlers.UseMove.add("DIG", async (move, pokemon) => {
  const escape = global().escapePoint;
  if (escape) {
    if (!(await pbHiddenMoveAnimation(pokemon))) {
      await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
    }
    await pbFadeOutIn(async () => {
      const t = G.gameTemp;
      t.playerNewMapId = escape[0]!;
      t.playerNewX = escape[1]!;
      t.playerNewY = escape[2]!;
      t.playerNewDirection = escape[3]!;
      await pbDismountBike();
      await scene().transferPlayer();
      gameMap().autoplay();
      gameMap().refresh();
    });
    pbEraseEscapePoint();
    return true;
  }
  return false;
});

//===============================================================================
// Dive
//===============================================================================
/** pbDive */
async function pbDiveCore(): Promise<boolean> {
  if (gamePlayer().pbFacingEvent()) return false;
  const mapMeta = currentMapMetadata();
  if (!mapMeta || !mapMeta.diveMapId) return false;
  const move = "DIVE";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_DIVE, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    await pbMessage(_INTL("The sea is deep here. A Pokémon may be able to go underwater."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("The sea is deep here. Would you like to use Dive?"))) {
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    await pbFadeOutIn(async () => {
      const t = G.gameTemp;
      const p = gamePlayer();
      t.playerNewMapId = mapMeta.diveMapId as number;
      t.playerNewX = p.x;
      t.playerNewY = p.y;
      t.playerNewDirection = p.direction;
      global().surfing = false;
      global().diving = true;
      stats().diveCount += 1;
      pbUpdateVehicle();
      await scene().transferPlayer(false);
      gameMap().autoplay();
      gameMap().refresh();
    });
    return true;
  }
  return false;
}

/** pbSurfacing */
async function pbSurfacingCore(): Promise<boolean | undefined> {
  if (!global().diving) return undefined;
  if (gamePlayer().pbFacingEvent()) return false;
  const surfaceMap = surfaceMapId();
  if (!surfaceMap) return undefined;
  const move = "DIVE";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_DIVE, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    await pbMessage(_INTL("Light is filtering down from above. A Pokémon may be able to surface here."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("Light is filtering down from above. Would you like to use Dive?"))) {
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    await pbFadeOutIn(async () => {
      const t = G.gameTemp;
      const p = gamePlayer();
      t.playerNewMapId = surfaceMap;
      t.playerNewX = p.x;
      t.playerNewY = p.y;
      t.playerNewDirection = p.direction;
      global().surfing = true;
      global().diving = false;
      pbUpdateVehicle();
      await scene().transferPlayer(false);
      const surfbgm = metadata().surfBGM as string | undefined;
      if (surfbgm) pbBGMPlay(surfbgm);
      else gameMap().autoplayAsCue();
      gameMap().refresh();
    });
    return true;
  }
  return false;
}

EventHandlers.add("on_player_interact", "diving", async () => {
  if (global().diving) {
    const surfaceMap = surfaceMapId();
    const p = gamePlayer();
    if (surfaceMap && mapFactory().getTerrainTag(surfaceMap, p.x, p.y).canDive) {
      await FieldMoves.pbSurfacing();
    }
  } else if (gamePlayer().pbTerrainTag().canDive) {
    await FieldMoves.pbDive();
  }
});

HiddenMoveHandlers.CanUseMove.add("DIVE", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_DIVE, ctx)) return false;
  const p = gamePlayer();
  if (global().diving) {
    const surfaceMap = surfaceMapId();
    if (!surfaceMap || !mapFactory().getTerrainTag(surfaceMap, p.x, p.y).canDive) {
      ctx.message(_INTL("You can't use that here."));
      return false;
    }
  } else {
    if (!currentMapMetadata()?.diveMapId) {
      ctx.message(_INTL("You can't use that here."));
      return false;
    }
    if (!p.terrainTag().canDive) {
      ctx.message(_INTL("You can't use that here."));
      return false;
    }
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("DIVE", async (move, pokemon) => {
  const wasdiving = global().diving;
  const diveMapId = wasdiving ? surfaceMapId() : (currentMapMetadata()?.diveMapId as number | undefined) ?? null;
  if (!diveMapId) return false;
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  await pbFadeOutIn(async () => {
    const t = G.gameTemp;
    const p = gamePlayer();
    t.playerNewMapId = diveMapId;
    t.playerNewX = p.x;
    t.playerNewY = p.y;
    t.playerNewDirection = p.direction;
    global().surfing = wasdiving;
    global().diving = !wasdiving;
    pbUpdateVehicle();
    await scene().transferPlayer(false);
    gameMap().autoplay();
    gameMap().refresh();
  });
  return true;
});

//===============================================================================
// Flash
//===============================================================================
HiddenMoveHandlers.CanUseMove.add("FLASH", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_FLASH, ctx)) return false;
  if (!currentMapMetadata()?.darkMap) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  if (global().flashUsed) {
    ctx.message(_INTL("Flash is already being used."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("FLASH", async (move, pokemon) => {
  const darkness = temp().darknessSprite;
  if (!darkness || darkness.isDisposed()) return false;
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  global().flashUsed = true;
  stats().flashCount += 1;
  const radiusDiff = (8 * 20) / FRAME_RATE;
  while (darkness.radius < darkness.radiusMax()) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
    darkness.radius += radiusDiff;
    if (darkness.radius > darkness.radiusMax()) darkness.radius = darkness.radiusMax();
  }
  return true;
});

//===============================================================================
// Fly
//===============================================================================
/** pbCanFly?(pkmn = nil, show_messages = false) */
export function pbCanFlySync(pkmn: Pokemon | null, ctx: CanUseContext): boolean {
  if (!checkBadge(Settings.BADGE_FOR_FLY, ctx)) return false;
  if (!FieldDebug.DEBUG && !pkmn && !player().getPokemonWithMove("FLY")) return false;
  if (!gamePlayer().canMapTransferWithFollower()) {
    ctx.message(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  if (!currentMapMetadata()?.outdoorMap) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  return true;
}

/** pbFlyToNewLocation(pkmn = nil, move = :FLY) { block } */
export async function pbFlyToNewLocation(pkmn: Pokemon | null = null, move: Id = "FLY", block?: () => Promise<void> | void): Promise<boolean> {
  const t = temp();
  if (t.flyDestination == null) return false;
  if (!pkmn) pkmn = player().getPokemonWithMove(move);
  if (!FieldDebug.DEBUG && !pkmn) {
    t.flyDestination = null;
    if (block) await block();
    return false;
  }
  if (!pkmn || !(await pbHiddenMoveAnimation(pkmn))) {
    const name = pkmn?.name ?? player().name;
    await pbMessage(_INTL("{1} used {2}!", name, moveName(move)));
  }
  stats().flyCount += 1;
  await pbFadeOutIn(async () => {
    pbSEPlay("Fly");
    const dest = t.flyDestination!;
    G.gameTemp.playerNewMapId = dest[0];
    G.gameTemp.playerNewX = dest[1];
    G.gameTemp.playerNewY = dest[2];
    G.gameTemp.playerNewDirection = 2;
    t.flyDestination = null;
    await pbDismountBike();
    await scene().transferPlayer();
    gameMap().autoplay();
    gameMap().refresh();
    if (block) await block();
    await pbWait(Math.floor(40 / 4));
  });
  pbEraseEscapePoint();
  return true;
}

HiddenMoveHandlers.CanUseMove.add("FLY", (_move, pkmn, ctx) => pbCanFlySync(pkmn, ctx));

// The core's UseMove handler for FLY; Fly Animation's replaces it (./FlyAnimation.ts).
HiddenMoveHandlers.UseMove.add("FLY", async (_move, pkmn) => {
  if (temp().flyDestination == null) {
    await pbMessage(_INTL("You can't use that here."));
    return false;
  }
  await pbFlyToNewLocation(pkmn);
  return true;
});

//===============================================================================
// Headbutt
//===============================================================================
/** pbHeadbuttEffect(event = nil) */
export async function pbHeadbuttEffect(event: GameEvent | null = null): Promise<void> {
  if (!event) event = gamePlayer().pbFacingEvent(true);
  // NOTE (Ruby parity): a missing event raises NoMethodError on event.x
  //       (004_Overworld_FieldMoves.rb:570); the CanUseMove check prevents it.
  const ev = event!;
  let a = (ev.x + Math.floor(ev.x / 24) + 1) * (ev.y + Math.floor(ev.y / 24) + 1);
  a = Math.floor((a * 2) / 5) % 10; // Even 2x as likely as odd, 0 is 1.5x as likely as odd
  const b = player().publicID() % 10; // Practically equal odds of each value
  let chance = 1; // ~50%
  if (a === b) { // 10%
    chance = 8;
  } else if (a > b && Math.abs(a - b) < 5) { // ~30.3%
    chance = 5;
  } else if (a < b && Math.abs(a - b) > 5) { // ~9.7%
    chance = 5;
  }
  if (rand(10) >= chance) {
    await pbMessage(_INTL("Nope. Nothing..."));
  } else {
    const enctype = chance === 1 ? "HeadbuttLow" : "HeadbuttHigh";
    if (await pbEncounter(enctype)) {
      stats().headbuttBattles += 1;
    } else {
      await pbMessage(_INTL("Nope. Nothing..."));
    }
  }
}

/** pbHeadbutt(event = nil) */
async function pbHeadbuttCore(event: GameEvent | null = null): Promise<boolean> {
  const move = "HEADBUTT";
  const movefinder = player().getPokemonWithMove(move);
  if (!FieldDebug.DEBUG && !movefinder) {
    await pbMessage(_INTL("A Pokémon could be in this tree. Maybe a Pokémon could shake it."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("A Pokémon could be in this tree. Would you like to use Headbutt?"))) {
    stats().headbuttCount += 1;
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    await pbHeadbuttEffect(event);
    return true;
  }
  return false;
}

HiddenMoveHandlers.CanUseMove.add("HEADBUTT", (_move, _pkmn, ctx) => {
  const facingEvent = gamePlayer().pbFacingEvent();
  if (!facingEvent || !/headbutttree/i.test(facingEvent.name)) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("HEADBUTT", async (move, pokemon) => {
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  stats().headbuttCount += 1;
  const facingEvent = gamePlayer().pbFacingEvent();
  await pbHeadbuttEffect(facingEvent);
  // NOTE (Ruby parity): the proc ends without `next true`, so it returns
  //       pbHeadbuttEffect's value (nil) (004_Overworld_FieldMoves.rb:626).
  return null;
});

//===============================================================================
// Rock Smash
//===============================================================================
/** pbRockSmashRandomEncounter */
export async function pbRockSmashRandomEncounter(): Promise<void> {
  if (pokemonEncounters().encounterTriggered("RockSmash", false, false)) {
    stats().rockSmashBattles += 1;
    await pbEncounter("RockSmash");
  }
}

/** pbRockSmash */
export async function pbRockSmash(): Promise<boolean> {
  const move = "ROCKSMASH";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_ROCKSMASH, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    await pbMessage(_INTL("It's a rugged rock, but a Pokémon may be able to smash it."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("This rock seems breakable with a hidden move.\nWould you like to use Rock Smash?"))) {
    stats().rockSmashCount += 1;
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    return true;
  }
  return false;
}

HiddenMoveHandlers.CanUseMove.add("ROCKSMASH", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_ROCKSMASH, ctx)) return false;
  const facingEvent = gamePlayer().pbFacingEvent();
  if (!facingEvent || !/smashrock/i.test(facingEvent.name)) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("ROCKSMASH", async (move, pokemon) => {
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  stats().rockSmashCount += 1;
  const facingEvent = gamePlayer().pbFacingEvent();
  if (facingEvent) {
    await pbSmashEvent(facingEvent);
    await pbRockSmashRandomEncounter();
  }
  return true;
});

//===============================================================================
// Strength
//===============================================================================
/** pbStrength */
export async function pbStrength(): Promise<boolean> {
  if (pokemonMap()!.strengthUsed) {
    await pbMessage(_INTL("Strength made it possible to move boulders around."));
    return false;
  }
  const move = "STRENGTH";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_STRENGTH, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    await pbMessage(_INTL("It's a big boulder, but a Pokémon may be able to push it aside."));
    return false;
  }
  await pbMessage(_INTL("It's a big boulder, but you may be able to push it aside with a hidden move.\x01"));
  if (await pbConfirmMessage(_INTL("Would you like to use Strength?"))) {
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    await pbMessage(_INTL("Strength made it possible to move boulders around!"));
    pokemonMap()!.strengthUsed = true;
    return true;
  }
  return false;
}

EventHandlers.add("on_player_interact", "strength_event", async () => {
  const facingEvent = gamePlayer().pbFacingEvent();
  if (facingEvent && /strengthboulder/i.test(facingEvent.name)) await pbStrength();
});

HiddenMoveHandlers.CanUseMove.add("STRENGTH", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_STRENGTH, ctx)) return false;
  if (pokemonMap()!.strengthUsed) {
    ctx.message(_INTL("Strength is already being used."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("STRENGTH", async (move, pokemon) => {
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!\x01", pokemon.name, moveName(move)));
  }
  await pbMessage(_INTL("Strength made it possible to move boulders around!"));
  pokemonMap()!.strengthUsed = true;
  return true;
});

//===============================================================================
// Surf
//===============================================================================
/** pbSurf */
async function pbSurfCore(): Promise<boolean> {
  const p = gamePlayer();
  if (p.pbFacingEvent()) return false;
  if (!p.canRideVehicleWithFollower()) return false;
  const move = "SURF";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_SURF, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    return false;
  }
  if (await pbConfirmMessage(_INTL("The water is a deep blue color... Would you like to use Surf on it?"))) {
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    pbCancelVehicles();
    await pbHiddenMoveAnimation(movefinder);
    const surfbgm = metadata().surfBGM as string | undefined;
    if (surfbgm) pbCueBGM(surfbgm, 0.5);
    await FieldMoves.pbStartSurfing();
    return true;
  }
  return false;
}

/** pbStartSurfing */
async function pbStartSurfingCore(): Promise<void> {
  pbCancelVehicles();
  pokemonEncounters().resetStepCount();
  global().surfing = true;
  stats().surfCount += 1;
  pbUpdateVehicle();
  const p = gamePlayer();
  temp().surfBaseCoords = getFacingCoords(p.x, p.y, p.direction);
  await pbJumpToward();
  temp().surfBaseCoords = null;
  p.checkEventTriggerHere([1, 2]);
}

/**
 * pbEndSurf(_xOffset, _yOffset): jumps off the water onto land. Called from
 * Game_Player#move_generic, which can't wait: the jump starts here and the
 * rest (the Ruby after `pbJumpToward` returns) runs as the player's blocking
 * step this frame, like pbLedge.
 */
function pbEndSurfCore(_xOffset: number, _yOffset: number): boolean {
  if (!global().surfing) return false;
  const p = gamePlayer();
  const x = p.x;
  const y = p.y;
  if (gameMap().terrainTag(x, y).canSurf && !canSurfFreely(p.pbFacingTerrainTag())) {
    temp().surfBaseCoords = [x, y];
    if (pbJumpTowardStart(1, false, true)) {
      p.queueBlocking(async () => {
        await pbWaitWhileJumping();
        gameMap().autoplayAsCue();
        p.increaseSteps();
        const result = p.checkEventTriggerHere([1, 2]);
        await pbOnStepTaken(result);
        temp().surfBaseCoords = null;
        endSurfAfter.run();
      });
    } else {
      temp().surfBaseCoords = null;
    }
    return true;
  }
  return false;
}

/** What runs once pbEndSurf has finished (Following Pokemon EX's alias puts its refresh here). */
export const endSurfAfter: { run: () => void } = { run: () => {} };

/** GameData::TerrainTag#can_surf_freely */
export function canSurfFreely(tag: { canSurf?: boolean; waterfall?: boolean; waterfallCrest?: boolean }): boolean {
  return !!tag.canSurf && !tag.waterfall && !tag.waterfallCrest;
}

EventHandlers.add("on_player_interact", "start_surfing", async () => {
  if (global().surfing) return;
  if (currentMapMetadata()?.alwaysBicycle) return;
  const p = gamePlayer();
  if (!canSurfFreely(p.pbFacingTerrainTag())) return;
  if (!gameMap().passable(p.x, p.y, p.direction, p)) return;
  await FieldMoves.pbSurf();
});

HiddenMoveHandlers.CanUseMove.add("SURF", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_SURF, ctx)) return false;
  const p = gamePlayer();
  if (global().surfing) {
    ctx.message(_INTL("You're already surfing."));
    return false;
  }
  if (!p.canRideVehicleWithFollower()) {
    ctx.message(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  if (currentMapMetadata()?.alwaysBicycle) {
    ctx.message(_INTL("Let's enjoy cycling!"));
    return false;
  }
  if (!canSurfFreely(p.pbFacingTerrainTag()) || !gameMap().passable(p.x, p.y, p.direction, p)) {
    ctx.message(_INTL("No surfing here!"));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("SURF", async (move, pokemon) => {
  temp().inMenu = false;
  pbCancelVehicles();
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  const surfbgm = metadata().surfBGM as string | undefined;
  if (surfbgm) pbCueBGM(surfbgm, 0.5);
  await FieldMoves.pbStartSurfing();
  return true;
});

//===============================================================================
// Sweet Scent
//===============================================================================
/** pbSweetScent */
export async function pbSweetScent(): Promise<void> {
  if (G.gameScreen.weatherType !== "None") {
    await pbMessage(_INTL("The sweet scent faded for some reason..."));
    return;
  }
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  let count = 0;
  viewport.color.red = 255;
  viewport.color.green = 0;
  viewport.color.blue = 0;
  viewport.color.alpha -= 10;
  const alphaDiff = (12 * 20) / FRAME_RATE;
  for (;;) {
    if (count === 0 && viewport.color.alpha < 128) {
      viewport.color.alpha += alphaDiff;
    } else if (count > FRAME_RATE / 4) {
      viewport.color.alpha -= alphaDiff;
    } else {
      count += 1;
    }
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
    if (viewport.color.alpha <= 0) break;
  }
  viewport.dispose();
  const enc = pokemonEncounters();
  const enctype = enc.encounterType();
  if (!enctype || !enc.encounterPossibleHere() || !(await pbEncounter(enctype, false))) {
    await pbMessage(_INTL("There appears to be nothing here..."));
  }
}

HiddenMoveHandlers.CanUseMove.add("SWEETSCENT", () => true);

HiddenMoveHandlers.UseMove.add("SWEETSCENT", async (move, pokemon) => {
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  await pbSweetScent();
  return true;
});

//===============================================================================
// Teleport
//===============================================================================
/** $PokemonGlobal.healingSpot, else the player's home, else the game's home. */
function teleportHealingSpot(): number[] | null {
  let healing = global().healingSpot ?? null;
  if (!healing) healing = (playerMetadata(player().characterID)?.home as number[] | null | undefined) ?? null;
  if (!healing) healing = (metadata().home as number[] | null | undefined) ?? null; // Home
  return healing;
}

HiddenMoveHandlers.CanUseMove.add("TELEPORT", (_move, _pkmn, ctx) => {
  if (!currentMapMetadata()?.outdoorMap) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  const healing = teleportHealingSpot();
  if (!healing) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  if (!gamePlayer().canMapTransferWithFollower()) {
    ctx.message(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.ConfirmUseMove.add("TELEPORT", async () => {
  const healing = teleportHealingSpot();
  if (!healing) return false;
  const mapname = pbGetMapNameFromId(healing[0]!);
  return pbConfirmMessage(_INTL("Want to return to the healing spot used last in {1}?", mapname));
});

HiddenMoveHandlers.UseMove.add("TELEPORT", async (move, pokemon) => {
  const healing = teleportHealingSpot();
  if (!healing) return false;
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  await pbFadeOutIn(async () => {
    const t = G.gameTemp;
    t.playerNewMapId = healing[0]!;
    t.playerNewX = healing[1]!;
    t.playerNewY = healing[2]!;
    t.playerNewDirection = 2;
    await pbDismountBike();
    await scene().transferPlayer();
    gameMap().autoplay();
    gameMap().refresh();
  });
  pbEraseEscapePoint();
  return true;
});

//===============================================================================
// Waterfall
//===============================================================================
/** pbAscendWaterfall (the core's; Following Pokemon EX replaces it) */
async function pbAscendWaterfallCore(): Promise<void> {
  const p = gamePlayer();
  if (p.direction !== 8) return; // Can't ascend if not facing up
  let terrain = p.pbFacingTerrainTag();
  if (!terrain.waterfall && !terrain.waterfallCrest) return;
  stats().waterfallCount += 1;
  const oldthrough = p.through;
  const oldmovespeed = p.moveSpeed;
  p.through = true;
  p.moveSpeed = 2;
  for (;;) {
    p.moveUp();
    terrain = p.pbTerrainTag();
    if (!terrain.waterfall && !terrain.waterfallCrest) break;
  }
  p.through = oldthrough;
  p.moveSpeed = oldmovespeed;
}

/** pbDescendWaterfall (the core's; Following Pokemon EX replaces it) */
async function pbDescendWaterfallCore(): Promise<void> {
  const p = gamePlayer();
  if (p.direction !== 2) return; // Can't descend if not facing down
  let terrain = p.pbFacingTerrainTag();
  if (!terrain.waterfall && !terrain.waterfallCrest) return;
  stats().waterfallsDescended += 1;
  const oldthrough = p.through;
  const oldmovespeed = p.moveSpeed;
  p.through = true;
  p.moveSpeed = 2;
  for (;;) {
    p.moveDown();
    terrain = p.pbTerrainTag();
    if (!terrain.waterfall && !terrain.waterfallCrest) break;
  }
  p.through = oldthrough;
  p.moveSpeed = oldmovespeed;
}

/** pbWaterfall */
async function pbWaterfallCore(): Promise<boolean> {
  const move = "WATERFALL";
  const movefinder = player().getPokemonWithMove(move);
  if (!checkBadge(Settings.BADGE_FOR_WATERFALL, new CanUseContext(false)) || (!FieldDebug.DEBUG && !movefinder)) {
    await pbMessage(_INTL("A wall of water is crashing down with a mighty roar."));
    return false;
  }
  if (await pbConfirmMessage(_INTL("It's a large waterfall. Would you like to use Waterfall?"))) {
    const speciesname = movefinder ? movefinder.name : player().name;
    await pbMessage(_INTL("{1} used {2}!", speciesname, moveName(move)));
    await pbHiddenMoveAnimation(movefinder);
    await FieldMoves.pbAscendWaterfall();
    return true;
  }
  return false;
}

EventHandlers.add("on_player_interact", "waterfall", async () => {
  const terrain = gamePlayer().pbFacingTerrainTag();
  if (terrain.waterfall) {
    await FieldMoves.pbWaterfall();
  } else if (terrain.waterfallCrest) {
    await pbMessage(_INTL("A wall of water is crashing down with a mighty roar."));
  }
});

HiddenMoveHandlers.CanUseMove.add("WATERFALL", (_move, _pkmn, ctx) => {
  if (!checkBadge(Settings.BADGE_FOR_WATERFALL, ctx)) return false;
  if (!gamePlayer().pbFacingTerrainTag().waterfall) {
    ctx.message(_INTL("You can't use that here."));
    return false;
  }
  return true;
});

HiddenMoveHandlers.UseMove.add("WATERFALL", async (move, pokemon) => {
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    await pbMessage(_INTL("{1} used {2}!", pokemon.name, moveName(move)));
  }
  await FieldMoves.pbAscendWaterfall();
  return true;
});

//===============================================================================
// Unused / deprecated helpers of the same file
//===============================================================================
/** pbHiddenMoveEvent (unused in Essentials): the same as pressing the Use button. */
export async function pbHiddenMoveEvent(): Promise<void> {
  await EventHandlers.trigger("on_player_interact");
}

/** pbTransferUnderwater(mapid, x, y, direction) (deprecated in v20.1: use "Transfer Player"). */
export async function pbTransferUnderwater(mapid: number, x: number, y: number, direction = gamePlayer().direction): Promise<void> {
  console.warn('pbTransferUnderwater is deprecated and will be removed in v21; use the "Transfer Player" event command.');
  await pbFadeOutIn(async () => {
    const t = G.gameTemp;
    t.playerNewMapId = mapid;
    t.playerNewX = x;
    t.playerNewY = y;
    t.playerNewDirection = direction;
    await scene().transferPlayer(false);
    gameMap().autoplay();
    gameMap().refresh();
  });
}

/** pbTransferSurfing(mapid, xcoord, ycoord, direction) (deprecated in v20.1: use "Transfer Player"). */
export async function pbTransferSurfing(mapid: number, xcoord: number, ycoord: number, direction = gamePlayer().direction): Promise<void> {
  console.warn('pbTransferSurfing is deprecated and will be removed in v21; use the "Transfer Player" event command.');
  await pbFadeOutIn(async () => {
    const t = G.gameTemp;
    t.playerNewMapId = mapid;
    t.playerNewX = xcoord;
    t.playerNewY = ycoord;
    t.playerNewDirection = direction;
    await scene().transferPlayer(false);
    gameMap().autoplay();
    gameMap().refresh();
  });
}
