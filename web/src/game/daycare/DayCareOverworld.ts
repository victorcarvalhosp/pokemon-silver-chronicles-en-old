// Port of Plugins/DayCare Overworld Pokemon/DayCare Overworld Pokemon.rb:
// the deposited Pokémon walk around the Day Care's yard (map 53) as events
// added at runtime (Game_Map#addPokemonOWToMap, pbDayCareShowPokemonOW), and
// talking to one plays pbDaycareInteract.

import type { Command } from "../../data/events";
import type { EventPage, MapEvent } from "../../data/types";
import { _INTL } from "../../data/gameData/gameData";
import { Cache } from "../../sprites/cache";
import { pbMessage } from "../../ui/messages";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";
import { VisibleEncounterSettings } from "../encounters/visibleEncounters";
import { sceneMap } from "../following/scene";
import { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";

export const VisibleDayCarOWSettings = {
  DAY_CARE_OW_MAP: 53,
};

/** Essentials Deluxe's ow_sprite_filename(species, form, gender, shiny) (Species Overworlds.rb:54). */
export function owSpriteFilename(species: string, form: number, gender: number, shiny: boolean): string | null {
  const params = { species, form: form || 0, gender: gender || 0, shiny: shiny || false, shadow: false,
    dmax: false, gmax: false, celestial: false };
  return SpeciesFiles.checkGraphicFile("Graphics/Characters/", params, "Followers");
}

/** pokemon.method(name).call, for VisibleEncounterSettings::Enc_Movements. */
function pokemonMethod(pokemon: Pokemon, name: string): unknown {
  switch (name) {
    case "shiny?": return pokemon.shiny;
    case "species": return pokemon.species;
    case "nature": return pokemon.natureId;
  }
  const v = (pokemon as unknown as Record<string, unknown>)[name.replace(/\?$/, "")];
  return typeof v === "function" ? (v as () => unknown).call(pokemon) : v;
}

/** Game_Map#addPokemonOWToMap(i, x, y, pokemon) */
export function addPokemonOWToMap(map: GameMap, i: number, x: number, y: number, pokemon: Pokemon): void {
  if (G.gameMap!.mapId !== VisibleDayCarOWSettings.DAY_CARE_OW_MAP) return;
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
  let fname = owSpriteFilename(pokemon.species, graphicForm, graphicGender, graphicShiny);
  // NOTE (Ruby parity): without a follower sprite ow_sprite_filename returns
  // nil and `fname.gsub!` raises NoMethodError (DayCare Overworld Pokemon.rb:24).
  if (fname == null) throw new Error("undefined method `gsub!' for nil:NilClass");
  fname = fname.replace("Graphics/Characters/", "");
  void Cache.ensureCharacter(fname);
  //--- movement of the event --------------------------------
  let [moveSpeed, moveFrequency, moveType] = S.DEFAULT_MOVEMENT as [number, number, number];
  for (const move of S.Enc_Movements) {
    if (pokemonMethod(pokemon, move[0]) === move[1]) {
      if (move[2]) moveSpeed = move[2];
      if (move[3]) moveFrequency = move[3];
      if (move[4]) moveType = move[4];
    }
  }
  const list: Command[] = [{ cmd: "call", fn: "pbDaycareInteract", args: [i] }];
  const page: EventPage = {
    condition: { switch1: null, switch2: null, variable: null, selfSwitch: null },
    graphic: { tileId: 0, characterName: fname, characterHue: 0, direction: 2, pattern: 0, opacity: 255, blendType: 0 },
    moveType,
    moveSpeed,
    moveFrequency,
    // move_route.list[0].code = 10 (move toward player), then the end command
    moveRoute: { repeat: true, skippable: false, list: [{ move: "towardPlayer" }] },
    walkAnime: true,
    stepAnime: S.USE_STEP_ANIMATION,
    directionFix: false,
    through: false,
    alwaysOnTop: false,
    trigger: 0, // on action button
    list,
  };
  const data: MapEvent = { id: keyId, name: "", x, y, pages: [page] };
  //--- creating the event ------------------------------------------
  const gameEvent = new GameEvent(map.mapId, data, map);
  gameEvent.savedWithData = true; // Ruby's save keeps it in $game_map.events
  gameEvent.moveto(x, y);
  map.events.set(keyId, gameEvent);
  //--- updating the sprites --------------------------------------------------------
  sceneMap()?.spriteset(map.mapId)?.addCharacter(gameEvent);
}

export async function pbDaycareInteract(i: number): Promise<void> {
  const dayCare = G.pokemonGlobal.dayCare;
  const pokemon = dayCare.get(i)?.pokemon;
  if (pokemon) {
    // NOTE (Ruby parity): the message shows the species' ID ("PIKACHU"), not
    // its name (DayCare Overworld Pokemon.rb:66).
    await pbMessage(_INTL("{1} is training to become stronger.", pokemon.species));
    SpeciesFiles.playCryFromSpecies(pokemon.species, pokemon.form, 90, 100);
  }
}

export function pbDayCareShowPokemonOW(): void {
  const dayCare = G.pokemonGlobal.dayCare;
  const map = G.gameMap as unknown as GameMap;
  // TODO: improve this to use a for loop on day_care
  const p0 = dayCare.get(0)?.pokemon;
  if (p0) {
    if (p0.hasType("WATER")) addPokemonOWToMap(map, 0, 47, 19, p0);
    else addPokemonOWToMap(map, 0, 43, 17, p0);
  }
  const p1 = dayCare.get(1)?.pokemon;
  if (p1) {
    if (p1.hasType("WATER")) addPokemonOWToMap(map, 1, 46, 20, p1);
    else addPokemonOWToMap(map, 1, 45, 17, p1);
  }
}
