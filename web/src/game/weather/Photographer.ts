// Port of Plugins/Photographer/Photographer.rb (victordevjs): the photo
// scenes. pbPhotograph lines the party up as overworld sprites behind the
// player, zooms the screen in (Map Zoom), shows the camera frame, flashes and
// saves a screenshot to the Album; the other entry points are variants for
// particular places.
//
// Ruby's Graphics.screenshot writes "./Album/[date] time.png"; in the browser
// the PNG is handed to PhotographerHooks.savePhoto, which downloads it.

import type { EventPage, MapEvent } from "../../data/types";
import { _INTL } from "../../data/gameData/gameData";
import { assetExists } from "../../core/assets";
import { Sprite, Viewport } from "../../rgss/display";
import type { Bitmap } from "../../rgss/Bitmap";
import { Graphics } from "../../rgss/Graphics";
import { Tone } from "../../rgss/types";
import { pbFadeOutIn } from "../../ui/fades";
import { FRAME_RATE } from "../../ui/frameTime";
import { pbScrollMap } from "../../ui/mart/PokemonMart";
import { pbMessage } from "../../ui/messages";
import { preloadBitmap, RPGCache } from "../../ui/rpgCache";
import { pbWait } from "../../ui/scenes/frames";
import { Cache } from "../../sprites/cache";
import { owSpriteFilename } from "../daycare/DayCareOverworld";
import { VisibleEncounterSettings } from "../encounters/visibleEncounters";
import { Followers } from "../following/Followers";
import { FollowingPkmn } from "../following/FollowingPkmn";
import { sceneMap } from "../following/scene";
import { pbGetTimeNow } from "../dayNight";
import { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import type { GamePlayer } from "../GamePlayer";
import { pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import { defineScript } from "../scriptApi";
import { pbMoveRoute, PBMoveRoute } from "../scripts/moveRoute";
import { pbToneChangeAll } from "../scripts/overworld";
import { pbDisposeZoomMap, pbZoomMap } from "./MapZoom";

export const PhotographerSettings = {
  ANIMATION_COME_OUT: 542,
};

/** Where Graphics.screenshot's PNG goes. */
export const PhotographerHooks = {
  savePhoto(filename: string, png: Blob): void {
    const url = URL.createObjectURL(png);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;
const party = () => (G.player as unknown as { party: Pokemon[] }).party;

/** Game_Map#addPokemonOWToMapForPhotography(x, y, pokemon): returns the RPG::Event. */
export async function addPokemonOWToMapForPhotography(map: GameMap, x: number, y: number, pokemon: Pokemon): Promise<MapEvent> {
  const S = VisibleEncounterSettings;
  //--- nessassary properties ----------------------------------------
  const keyId = Math.max(-1, ...map.events.keys()) + 1;
  //--- Graphic of the event -----------------------------------------
  const form = pokemon.form;
  const gender = pokemon.gender;
  const shiny = pokemon.shiny;
  const graphicForm = S.SPRITES[0] && form != null ? form : 0;
  const graphicGender = S.SPRITES[1] && gender != null ? gender : 0;
  const graphicShiny = S.SPRITES[2] && shiny != null ? shiny : false;
  let fname = owSpriteFilename(String(pokemon.species), graphicForm, graphicGender, graphicShiny);
  // NOTE (Ruby parity): without a follower sprite ow_sprite_filename returns
  // nil and `fname.gsub!` raises NoMethodError (Photographer.rb:26).
  if (fname == null) throw new Error("undefined method `gsub!' for nil:NilClass");
  fname = fname.replace("Graphics/Characters/", "");
  await Cache.ensureCharacter(fname); // (Ruby loads it when the sprite is made)
  //--- movement of the event --------------------------------
  const [moveSpeed, moveFrequency] = S.DEFAULT_MOVEMENT as [number, number, number];
  const page: EventPage = {
    condition: { switch1: null, switch2: null, variable: null, selfSwitch: null },
    graphic: { tileId: 0, characterName: fname, characterHue: 0, direction: 2, pattern: 0, opacity: 255, blendType: 0 },
    moveType: 0,
    moveSpeed,
    moveFrequency,
    moveRoute: { repeat: true, skippable: false, list: [] },
    walkAnime: true,
    stepAnime: S.USE_STEP_ANIMATION,
    directionFix: false,
    through: false,
    alwaysOnTop: false,
    trigger: 0, // on action button
    list: [], // Compiler::push_end
  };
  const event: MapEvent = { id: keyId, name: "", x, y, pages: [page] };
  //--- creating the event ------------------------------------------
  const gameEvent = new GameEvent(map.mapId, event, map);
  gameEvent.moveto(x, y);
  map.events.set(keyId, gameEvent);
  //--- updating the sprites --------------------------------------------------------
  sceneMap()?.spriteset(map.mapId)?.addCharacter(gameEvent);
  //--- show Pokéball animation --------------------------------------------------------
  pbMoveRoute(gamePlayer(), [PBMoveRoute.Wait, 2]);
  await pbWait(Math.floor(FRAME_RATE / 5));
  return event;
}

/** The party lined up in two rows of three behind the player (pbPhotograph / pbPhotographWithPartner). */
async function lineUpParty(): Promise<MapEvent[]> {
  let xPosition = gamePlayer().x - 2;
  let yPosition = gamePlayer().y - 1;
  const events: MapEvent[] = [];
  for (let i = 0; i < party().length; i++) {
    if (i < 3) {
      xPosition = xPosition + 1;
    } else if (i >= 3) {
      if (i === 3) {
        xPosition = gamePlayer().x - 2;
        yPosition = yPosition - 1;
      }
      xPosition = xPosition + 1;
    }
    if (!party()[i]!.egg()) {
      events.push(await addPokemonOWToMapForPhotography(gameMap(), xPosition, yPosition, party()[i]!));
    }
  }
  return events;
}

function eraseEvents(events: MapEvent[]): void {
  for (const event of events) {
    gameMap().events.get(event.id)?.erase();
    (G as unknown as { pokemonMap?: { addErasedEvent(id: number): void } | null }).pokemonMap?.addErasedEvent(event.id);
  }
}

export async function pbPhotograph(): Promise<void> {
  pbToneChangeAll(new Tone(-255, -255, -255), 5);
  await pbWait(10);

  await FollowingPkmn.toggle(false, false);
  pbMoveRoute(gamePlayer(), [PBMoveRoute.TurnDown]);

  const events = await lineUpParty();

  // ZOOM IN
  // Just use this if you have the zoom plugin: https://reliccastle.com/resources/810/
  await pbZoomMap(2, 1, "in");
  await pbScrollMap(8, 2, 5); // Move camera two tiles up

  await pbPhotographSimple();

  await pbScrollMap(2, 2, 5); // Go camera back two tiles down

  eraseEvents(events);

  pbToneChangeAll(new Tone(0, 0, 0), 10);

  await FollowingPkmn.toggle(true, false);
}

/** To be used on Bar even in Olivine */
export async function pbPhotographOlivineBar(): Promise<void> {
  await pbZoomMap(2, 1, "in");
  await pbScrollMap(2, 1, 5); // Go camera back one tile down
  await pbPhotographSimple();
}

export async function pbPhotograpKumquatRestaurant(): Promise<void> {
  await pbZoomMap(2, 1, "in");
  await pbScrollMap(8, 1, 5); // Go camera one tile up
  await pbPhotographSimple();
  pbToneChangeAll(new Tone(0, 0, 0), 10);
  await pbWait(10);
}

export async function pbPhotograpKumquatDance(): Promise<void> {
  await pbZoomMap(2, 1, "in");
  await pbPhotographSimple();
  pbToneChangeAll(new Tone(0, 0, 0), 10);
  await pbWait(10);
}

export async function pbPhotograpKumquatGameCorner(): Promise<void> {
  await pbZoomMap(2, 1, "in");
  await pbPhotographSimple();
  pbToneChangeAll(new Tone(0, 0, 0), 10);
  await pbWait(10);
}

export async function pbPhotographSimple(): Promise<void> {
  pbToneChangeAll(new Tone(0, 0, 0), 10);

  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99;
  const bg = new Sprite(viewport);
  // Bitmap.new("Graphics/Pictures/Camera.png"): a fresh copy of the file.
  const camera = RPGCache.loadBitmap("Graphics/Pictures/Camera") ?? (await preloadBitmap("Graphics/Pictures/Camera"));
  if (!camera) throw new Error("Failed to load image 'Graphics/Pictures/Camera.png'");
  bg.setBitmap(camera.clone());
  await pbWait(80);

  if (assetExists("Audio/SE/Camera Shutter Sound Effect.ogg") || assetExists("Audio/SE/Camera Shutter Sound Effect")) {
    pbSEPlay("Camera Shutter Sound Effect");
  }
  // TODO: Add a proper camera shutter animation that looks better than just a fadeout
  await pbFadeOutIn();

  await pbWait(80);

  bg.bitmap?.dispose();
  bg.dispose();
  viewport.dispose();
  await pbWait(5);

  const t = pbGetTimeNow();
  const filestart = strftimePhoto(t);
  const capturefile = `${filestart}.png`; // File.join("./Album/", ...)
  await screenshot(capturefile);

  pbToneChangeAll(new Tone(-255, -255, -255), 10);
  await pbWait(20);
  await pbDisposeZoomMap();
  await pbMessage(_INTL("It has taken a picture successfully."));
  await pbMessage(_INTL("Photo is saved on /Album folder."));
}

export async function pbPhotographWithPartner(followerId: string): Promise<void> {
  pbToneChangeAll(new Tone(-255, -255, -255), 5);
  await pbWait(10);

  pbMoveRoute(gamePlayer(), [PBMoveRoute.TurnDown]);

  const partner = Followers.get(followerId);
  // NOTE (Ruby parity): no check that the follower exists (Photographer.rb:267).
  if (!partner) throw new Error("undefined method `moveto' for nil:NilClass");
  partner.moveto(gamePlayer().x - 1, gamePlayer().y);
  pbMoveRoute(partner, [PBMoveRoute.TurnDown]);

  const events = await lineUpParty();

  // ZOOM IN
  // Just use this if you have the zoom plugin: https://reliccastle.com/resources/810/
  await pbZoomMap(2, 1, "in");
  await pbScrollMap(8, 2, 5); // Move camera two tiles up

  await pbPhotographSimple();

  await pbScrollMap(2, 2, 5); // Go camera back two tiles down

  eraseEvents(events);

  pbToneChangeAll(new Tone(0, 0, 0), 10);
}

/** t.strftime("[%Y-%m-%d] %H_%M_%S.%L") */
function strftimePhoto(t: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `[${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}] ${p(t.getHours())}_${p(t.getMinutes())}_${p(t.getSeconds())}.${p(t.getMilliseconds(), 3)}`;
}

/** Graphics.screenshot(filename): the screen as it is now, as a PNG. */
async function screenshot(filename: string): Promise<void> {
  const bmp: Bitmap = Graphics.snapToBitmap();
  try {
    const png = await bmp.canvas.convertToBlob({ type: "image/png" });
    PhotographerHooks.savePhoto(filename, png);
  } finally {
    bmp.dispose();
  }
}

defineScript("pbPhotograph", () => pbPhotograph());
defineScript("pbPhotographOlivineBar", () => pbPhotographOlivineBar());
defineScript("pbPhotograpKumquatRestaurant", () => pbPhotograpKumquatRestaurant());
defineScript("pbPhotograpKumquatDance", () => pbPhotograpKumquatDance());
defineScript("pbPhotograpKumquatGameCorner", () => pbPhotograpKumquatGameCorner());
defineScript("pbPhotographSimple", () => pbPhotographSimple());
defineScript("pbPhotographWithPartner", (_c, id) => pbPhotographWithPartner(String(id)));
