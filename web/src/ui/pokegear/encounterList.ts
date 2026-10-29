// Port of Plugins/Encounter List UI (v20) 002_UI_Encounters.rb
// (EncounterList_Scene, EncounterList_Screen, pbViewEncounters): the
// Pokégear's "DexNav" in this game (Pokegear Changes.rb).

import { Encounter } from "../../data/gameData/encounter";
import { EncounterType } from "../../data/gameData/encounterType";
import type { Id } from "../../data/gameData/gameData";
import { Species } from "../../data/gameData/species";
import type { EncounterSlot } from "../../data/pbs/types";
import { G } from "../../game/globals";
import { pbPlayCursorSE } from "../../game/GameSystem";
import type { Player } from "../../game/trainer/Player";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Tone } from "../../rgss/types";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundPlane } from "../planes";
import { pbResolveBitmap, preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { AnimatedSprite, IconSprite } from "../SpriteWrapper";
import { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";
import { PokemonSpeciesIconSprite, preloadSpeciesIcons } from "../sprites/pokemonIcon";

/** The name of a graphic in Graphics/Pictures/EncounterUI that changes the look of the UI. */
export const WINDOWSKIN = "base.png";

/** Names for the encounter types (USER_DEFINED_NAMES). */
export const USER_DEFINED_NAMES: Record<string, string> | null = {
  Land: "Grass",
  LandDay: "Grass (day)",
  LandNight: "Grass (night)",
  LandMorning: "Grass (morning)",
  LandAfternoon: "Grass (afternoon)",
  LandEvening: "Grass (evening)",
  Cave: "Cave",
  CaveDay: "Cave (day)",
  CaveNight: "Cave (night)",
  CaveMorning: "Cave (morning)",
  CaveAfternoon: "Cave (afternoon)",
  CaveEvening: "Cave (evening)",
  Water: "Surfing",
  WaterDay: "Surfing (day)",
  WaterNight: "Surfing (night)",
  WaterMorning: "Surfing (morning)",
  WaterAfternoon: "Surfing (afternoon)",
  WaterEvening: "Surfing (evening)",
  OldRod: "Fishing (Old Rod)",
  GoodRod: "Fishing (Good Rod)",
  SuperRod: "Fishing (Super Rod)",
  RockSmash: "Rock Smash",
  HeadbuttLow: "Headbutt (rare)",
  HeadbuttHigh: "Headbutt (common)",
  BugContest: "Bug Contest",
  TallGrass: "Tall grass",
};

const player = () => G.player as unknown as Player;

/** Whether a specific form has been seen (any gender). */
export function seenFormAnyGender(species: Id, form: number): boolean {
  return player().pokedex.seenForm(species, 0, form) || player().pokedex.seenForm(species, 1, form);
}

export class EncounterList_Scene {
  private viewport: Viewport;
  private sprites: Sprites = {};
  private encounterData: Encounter | null;
  private encounterTables: Record<Id, EncounterSlot[]> = {};
  private maxEnc: number;
  private eLength: number;
  private index = 0;
  private w = 0;
  private h = 0;

  constructor() {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const mapid = G.gameMap?.mapId ?? 0;
    const encounterVersion = (G.pokemonGlobal as unknown as { encounterVersion?: number }).encounterVersion ?? 0;
    this.encounterData = Encounter.get(mapid, encounterVersion);
    if (this.encounterData) {
      this.encounterTables = JSON.parse(JSON.stringify(this.encounterData.types)) as Record<Id, EncounterSlot[]>;
      [this.maxEnc, this.eLength] = this.getMaxEncounters(this.encounterTables);
    } else {
      [this.maxEnc, this.eLength] = [1, 1];
    }
  }

  /** The highest number of unique encounters across the map's encounter types, and the number of types. */
  getMaxEncounters(data: Record<Id, EncounterSlot[]>): [number, number] {
    const keys = Object.keys(data);
    const a = keys.map((key) => new Set(data[key]!.map((slot) => slot.species)).size);
    return [Math.max(...a), keys.length];
  }

  async pbStartScene(): Promise<void> {
    await preloadBitmaps(["Graphics/Pictures/EncounterUI/" + WINDOWSKIN, "Graphics/Pictures/EncounterUI/bg",
      "Graphics/Pictures/rightarrow", "Graphics/Pictures/leftarrow", "Graphics/Pokemon/Icons/000"]);
    // The icons drawPresent can show (PokemonSpeciesIconSprite needs them fetched)
    const species = new Set<Id>();
    for (const slots of Object.values(this.encounterTables)) for (const slot of slots) species.add(slot.species);
    await preloadSpeciesIcons([...species].map((s) => ({ species: s, form: Species.get(s).form })));
    if (!pbResolveBitmap("Graphics/Pictures/EncounterUI/" + WINDOWSKIN)) {
      throw new Error(_INTL("You are missing the graphic for this UI. Make sure the image is in your Graphics/Pictures folder and that it is named appropriately: Graphics/Pictures/EncounterUI/{1}", WINDOWSKIN));
    }
    addBackgroundPlane(this.sprites, "bg", "EncounterUI/bg", this.viewport);
    const base = new IconSprite(0, 0, this.viewport);
    this.sprites.base = base;
    base.setBitmapFile("Graphics/Pictures/EncounterUI/" + WINDOWSKIN);
    base.ox = Math.floor(base.bitmap!.width / 2);
    base.oy = Math.floor(base.bitmap!.height / 2);
    base.x = Math.floor(Graphics.width / 2);
    base.y = Math.floor(Graphics.height / 2);
    base.opacity = 200;
    const locwindow = new Window_AdvancedTextPokemon("");
    locwindow.viewport = this.viewport;
    locwindow.width = 512;
    locwindow.height = 344;
    locwindow.x = Math.floor((Graphics.width - locwindow.width) / 2);
    locwindow.y = Math.floor((Graphics.height - locwindow.height) / 2);
    locwindow.windowskin = null;
    this.sprites.locwindow = locwindow;
    this.h = Math.floor((Graphics.height - base.bitmap!.height) / 2);
    this.w = Math.floor((Graphics.width - base.bitmap!.width) / 2);
    for (let i = 0; i < this.maxEnc; i++) {
      const icon = new PokemonSpeciesIconSprite(null as unknown as Id, this.viewport); // (nil: the "000" icon)
      icon.x = this.w + 28 + 64 * (i % 7);
      icon.y = this.h + 100 + Math.floor(i / 7) * 64;
      icon.visible = false;
      this.sprites[`icon_${i}`] = icon;
    }
    const right = AnimatedSprite.createLong("Graphics/Pictures/rightarrow", 8, 40, 28, 2, this.viewport);
    right.x = Graphics.width - right.bitmap!.width;
    right.y = Math.floor(Graphics.height / 2) - Math.floor(right.bitmap!.height / 16);
    right.visible = false;
    right.play();
    this.sprites.rightarrow = right;
    const left = AnimatedSprite.createLong("Graphics/Pictures/leftarrow", 8, 40, 28, 2, this.viewport);
    left.x = 0;
    left.y = Math.floor(Graphics.height / 2) - Math.floor(right.bitmap!.height / 16);
    left.visible = false;
    left.play();
    this.sprites.leftarrow = left;
    if (this.encounterData) this.drawPresent();
    else this.drawAbsent();
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbEncounter(): Promise<void> {
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.RIGHT) && this.eLength > 1 && this.index < this.eLength - 1) {
        pbPlayCursorSE();
        this.hideSprites();
        this.index += 1;
        this.drawPresent();
      } else if (Input.trigger(Input.LEFT) && this.eLength > 1 && this.index !== 0) {
        pbPlayCursorSE();
        this.hideSprites();
        this.index -= 1;
        this.drawPresent();
      } else if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      }
    }
  }

  private mapName(): string {
    return (G.gameMap as unknown as { name?: string } | null)?.name ?? "";
  }

  /** Draw text and icons if map has encounters defined */
  drawPresent(): void {
    (this.sprites.rightarrow as AnimatedSprite).visible = this.index < this.eLength - 1;
    (this.sprites.leftarrow as AnimatedSprite).visible = this.index > 0;
    let i = 0;
    const [encArray, currKey] = this.getEncData();
    for (const s of encArray) {
      const speciesData = Species.get(s);
      const icon = this.sprites[`icon_${i}`] as PokemonSpeciesIconSprite;
      if (!player().pokedex.owned(s) && !seenFormAnyGender(s, speciesData.form)) {
        icon.pbSetParams(0 as unknown as Id, 0, 0, false);
        icon.visible = true;
      } else if (!player().pokedex.owned(s)) {
        icon.pbSetParams(s, 0, speciesData.form, false);
        icon.tone = new Tone(0, 0, 0, 255);
        icon.visible = true;
      } else {
        icon.pbSetParams(s, 0, speciesData.form, false);
        icon.tone = new Tone(0, 0, 0, 0);
        icon.visible = true;
      }
      i += 1;
    }
    // Get user-defined encounter name or default one if not present
    const name = USER_DEFINED_NAMES ? USER_DEFINED_NAMES[currKey] : EncounterType.get(currKey).realName;
    let loctext = _INTL("<ac><c2=43F022E8>{1}: {2}</c2></ac>", this.mapName(), name ?? "");
    loctext += `<al><c2=7FF05EE8>Total encounters for area: ${encArray.length}</c2></al>`;
    loctext += "<c2=63184210>-----------------------------------------</c2>";
    (this.sprites.locwindow as Window_AdvancedTextPokemon).setText(loctext);
  }

  /** Draw text if map has no encounters defined (e.g. in buildings) */
  drawAbsent(): void {
    let loctext = _INTL("<ac><c2=43F022E8>{1}</c2></ac>", this.mapName());
    loctext += "<al><c2=7FF05EE8>This area has no encounters!</c2></al>";
    loctext += "<c2=63184210>-----------------------------------------</c2>";
    (this.sprites.locwindow as Window_AdvancedTextPokemon).setText(loctext);
  }

  /** The species of the chosen encounter type on the current map, in National Dex (data) order. */
  getEncData(): [Id[], Id] {
    const currKey = Object.keys(this.encounterTables)[this.index]!;
    const arr = this.encounterTables[currKey]!.map((s) => s.species);
    const encArray: Id[] = [];
    for (const s of Species.each()) if (arr.includes(s.id)) encArray.push(s.id); // From Maruno
    return [[...new Set(encArray)], currKey];
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  hideSprites(): void {
    for (let i = 0; i < this.maxEnc; i++) (this.sprites[`icon_${i}`] as PokemonSpeciesIconSprite).visible = false;
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class EncounterList_Screen {
  constructor(private scene: EncounterList_Scene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbEncounter();
    await this.scene.pbEndScene();
  }
}

/** Utility method for calling UI */
export async function pbViewEncounters(): Promise<void> {
  const scene = new EncounterList_Scene();
  const screen = new EncounterList_Screen(scene);
  await screen.pbStartScreen();
}
