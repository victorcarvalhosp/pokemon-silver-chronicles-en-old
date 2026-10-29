// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Den_Event.rb: the Max Raid
// Den event utilities (pbMaxRaidDen, pbSetRaidSpecies, resetting dens daily,
// pbClearAllDens, pbRaidDenReset with a Wishing Piece) and the den events'
// overworld graphic (RaidDenSprite, added to every map's events named
// "raidden").
//
// A den's state is its event variable ($PokemonGlobal.eventvars): 0 = empty,
// a Pokémon = a raid waiting, nil = reset (a new Pokémon is generated). The
// den Pokémon are saved by the "raid_dens" save value (the global metadata
// snapshot keeps plain objects, which revive here).

import { DEBUG } from "../../core/debug";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { getMapData, hasMapData, preloadMaps } from "../../data/store";
import { Input } from "../../rgss/Input";
import type { Viewport } from "../../rgss/display";
import { assetExists } from "../../core/assets";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { pbGetTimeNow } from "../dayNight";
import { EventHandlers } from "../eventHandlers";
import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { pbMapInterpreter } from "../Interpreter";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";
import { SaveData } from "../save/SaveData";
import { type DxHash, MaxRaidBattle, type RaidFoe } from "./Raid_Setup";
import { sample } from "./random";

/** What the den functions need of the running Interpreter. */
interface DenInterpreter {
  getSelf(): GameEvent | null;
  getVariable(): unknown;
  setVariable(v: unknown): void;
}
const interpreter = () => pbMapInterpreter() as unknown as DenInterpreter;

//===============================================================================
// Used for setting species for Max Raid Dens.
//===============================================================================
// The main Max Raid script to run in an event.
// The pkmn parameter can be a Pokemon object, species ID, or an array consisting
// of a GameData::Type, GameData::Habitat, and generation number.
// If set to nil, a randomly selected species found on the encounter table on the
// event's location will be selected instead.
//-------------------------------------------------------------------------------
export async function pbMaxRaidDen(pkmn: RaidFoe = [], rules: DxHash = {}, pokemon: DxHash = {}): Promise<boolean | undefined> {
  reviveRaidDens();
  const interp = interpreter();
  const thisEvent = interp.getSelf();
  if (!thisEvent) return undefined;
  const raidPkmn = interp.getVariable();
  // PBDebug.log("raid pokemon type: #{raid_pkmn}")
  if (raidPkmn === 0) {
    //-----------------------------------------------------------------------------
    // Attempts to reset an empty den.
    //-----------------------------------------------------------------------------
    thisEvent.turnDown();
    return pbRaidDenReset(interp, thisEvent);
  } else if (raidPkmn instanceof Pokemon) {
    //-----------------------------------------------------------------------------
    // Accesses a Max Raid Den with an existing saved species.
    //-----------------------------------------------------------------------------
    if (raidPkmn.isSpecies("CALYREX")) thisEvent.turnRight();
    else thisEvent.turnLeft();
    return MaxRaidBattle.start(raidPkmn, rules, pokemon);
  } else {
    //-----------------------------------------------------------------------------
    // Accesses a Max Raid Den with a newly generated species.
    //-----------------------------------------------------------------------------
    thisEvent.turnUp();
    return MaxRaidBattle.start(pkmn, rules, pokemon);
  }
}

//-------------------------------------------------------------------------------
// Selects a random species from an inputted array to spawn in a Max Raid Den.
// If two arrays are entered, the player can force a species from the second
// array to spawn instead if they throw a Dynamax Crystal into the den.
//-------------------------------------------------------------------------------
export async function pbSetRaidSpecies(table1: Id[] = [], table2: Id[] = []): Promise<Id | null> {
  const interp = interpreter();
  const thisEvent = interp.getSelf()!;
  const raidPkmn = interp.getVariable();
  thisEvent.turnDown();
  if (raidPkmn === 0 && table2.length > 0) {
    const item = Item.get("DYNAMAXCRYSTAL");
    if (G.bag.has(item.id)) {
      await pbMessage(_INTL("Oh? The Pokémon den seems to be reacting to your {1}!", item.portionName));
      if (await pbConfirmMessage(_INTL("Want to throw in a {1} to lure a special Pokémon?", item.portionName))) {
        G.bag.remove(item.id);
        interp.setVariable(null);
        thisEvent.turnUp();
        return sample(table2);
      }
    }
  }
  return sample(table1);
}

/** The name of an event on any map ($game_map / load_data("Data/MapXXX.rxdata")). */
async function eventName(mapId: number, eventId: number): Promise<string | null> {
  if (!hasMapData(mapId)) await preloadMaps(mapId, 0);
  const event = getMapData(mapId).events.find((e) => e && e.id === eventId);
  return event ? event.name : null;
}

/** $PokemonGlobal.raid_timer as a Time (seconds are stored). */
const raidTimerDate = () => new Date(G.pokemonGlobal.raidTimer! * 1000);
const nowSeconds = () => Math.floor(pbGetTimeNow().getTime() / 1000);

//-------------------------------------------------------------------------------
// Automatically resets all Max Raid Den events after a day has passed.
//-------------------------------------------------------------------------------
EventHandlers.add("on_frame_update", "raid_den_reset", async () => {
  const g = G.pokemonGlobal;
  if (!g) return;
  if (!g.raidTimer) g.raidTimer = nowSeconds();
  // (Time#day: the day of the month)
  if (pbGetTimeNow().getDate() === raidTimerDate().getDate()) return;
  if (!g.eventvars) g.eventvars = {};
  for (const key of Object.keys(g.eventvars)) {
    const [mapId, eventId] = key.split(",").map(Number) as [number, number];
    const name = await eventName(mapId, eventId);
    if (!name || !/raidden/i.test(name)) continue;
    g.eventvars[key] = null;
  }
  g.raidTimer = nowSeconds();
  await (G.gameMap as unknown as GameMap).update();
});

//-------------------------------------------------------------------------------
// Empties all Max Raid Dens on all maps.
// Resets each den with new Pokemon instead if reset == true.
//-------------------------------------------------------------------------------
export async function pbClearAllDens(reset = false): Promise<void> {
  const set = reset ? null : 0;
  const g = G.pokemonGlobal;
  if (!g.eventvars) g.eventvars = {};
  for (const mapData of MapMetadata.each()) {
    if (!hasMapData(mapData.id)) {
      try {
        await preloadMaps(mapData.id, 0);
      } catch {
        continue; // (map metadata for a map that doesn't exist)
      }
    }
    // for event_id in 1..map.events.length
    const events = getMapData(mapData.id).events;
    for (let eventId = 1; eventId <= events.length; eventId++) {
      const event = events.find((e) => e && e.id === eventId);
      if (!event || !/raidden/i.test(event.name)) continue;
      g.eventvars[`${mapData.id},${eventId}`] = set;
    }
  }
  g.raidTimer = nowSeconds();
  await (G.gameMap as unknown as GameMap).update();
}

//-------------------------------------------------------------------------------
// Resets an individual Max Raid Den by throwing in a Wishing Piece.
// This is automatically called by pbMaxRaidDen if the den is empty.
//-------------------------------------------------------------------------------
export async function pbRaidDenReset(interp: DenInterpreter, thisEvent: GameEvent): Promise<boolean> {
  if (DEBUG && Input.press(Input.CTRL)) {
    await pbMessage(_INTL("A Pokémon was lured to the den!"));
    interp.setVariable(null);
  } else {
    const item = Item.get("WISHINGPIECE");
    await pbMessage(_INTL("There doesn't seem to be anything in the den..."));
    if (await pbConfirmMessage(_INTL("Want to throw in a {1} to lure a Pokémon?", item.portionName))) {
      if (G.bag.has(item.id)) {
        await pbMessage(_INTL("You threw a {1} into the den!", item.portionName));
        G.bag.remove(item.id);
        interp.setVariable(null);
        thisEvent.turnUp();
      } else {
        await pbMessage(_INTL("But you don't have any {1}...", item.portionNamePlural));
      }
    }
  }
  return false;
}

//===============================================================================
// Handles the overworld sprites for Max Raid Den events.
//===============================================================================
export class RaidDenSprite {
  private disposed = false;

  constructor(private event: GameEvent | null, private map: GameMap | null, _viewport: Viewport | null) {
    const raidPkmn = event!.variable();
    event!.characterName = "";
    this.setEventGraphic(raidPkmn);
  }

  dispose(): void {
    this.event = null;
    this.map = null;
    this.disposed = true;
  }

  isDisposed(): boolean { return this.disposed; }

  update(): void {
    const raidPkmn = this.event!.variable();
    this.setEventGraphic(raidPkmn);
  }

  //-----------------------------------------------------------------------------
  // Sets the actual graphic for a Max Raid Den event.
  // (The den events have Direction Fix on, so the turns change nothing.)
  //-----------------------------------------------------------------------------
  setEventGraphic(raidPkmn: unknown): void {
    if (assetExists("Graphics/Characters/Object raid den")) {
      const event = this.event!;
      event.characterName = "Object raid den";
      if (raidPkmn === 0) {
        //-------------------------------------------------------------------------
        // Empty raid den graphic.
        //-------------------------------------------------------------------------
        event.turnDown();
      } else if (raidPkmn instanceof Pokemon) {
        //-------------------------------------------------------------------------
        // Shows blue beam if den species is Calyrex; red beam otherwise.
        //-------------------------------------------------------------------------
        if (raidPkmn.isSpecies("CALYREX")) event.turnRight();
        else event.turnLeft();
      } else {
        //-------------------------------------------------------------------------
        // Shows purple beam on newly reset dens.
        //-------------------------------------------------------------------------
        event.turnUp();
      }
    }
  }
}

//-------------------------------------------------------------------------------
// Updates all Max Raid Den event sprites on a loaded map.
//-------------------------------------------------------------------------------
EventHandlers.add("on_new_spriteset_map", "add_raid_den_graphics", (s, v) => {
  reviveRaidDens();
  const spriteset = s as { map: GameMap; addUserSprite(sprite: unknown): void };
  const viewport = v as Viewport;
  const map = spriteset.map;
  for (const event of map.events.values()) {
    if (!/raidden/i.test(event.name)) continue;
    spriteset.addUserSprite(new RaidDenSprite(event, map, viewport));
  }
});

//===============================================================================
// Saving the den Pokémon.
//===============================================================================
let pendingDens: Record<string, PokemonJSON> | null = null;

/** Turns the den Pokémon loaded from a save back into Pokémon (once global_metadata has loaded). */
export function reviveRaidDens(): void {
  if (!pendingDens || !G.pokemonGlobal) return;
  const vars = G.pokemonGlobal.eventvars;
  for (const [key, json] of Object.entries(pendingDens)) {
    const v = vars[key];
    if (v === undefined) continue; // global_metadata isn't loaded yet
    if (v && typeof v === "object" && !(v instanceof Pokemon)) vars[key] = Pokemon.fromJSON(json);
    delete pendingDens[key];
  }
  if (Object.keys(pendingDens).length === 0) pendingDens = null;
}

SaveData.register({
  id: "raid_dens",
  save: () => {
    reviveRaidDens();
    const out: Record<string, PokemonJSON> = {};
    for (const [key, v] of Object.entries(G.pokemonGlobal.eventvars)) if (v instanceof Pokemon) out[key] = v.toJSON();
    return out;
  },
  load: (v) => {
    pendingDens = (v ?? {}) as Record<string, PokemonJSON>;
    reviveRaidDens();
  },
});
