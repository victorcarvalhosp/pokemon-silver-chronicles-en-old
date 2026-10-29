// Port of Data/Scripts/010_Data/002_PBS data/010_SpeciesMetrics.rb, as
// replaced/extended by the plugins this game loads:
// - Generation 8 Pack (Custom Sprite Scales): front/back sprite scales, and a
//   get_species_form that copies them into lazily created form metrics.
// - ZUD Mechanics: Dynamax/Gigantamax metrics defaulting to the normal ones.
// - Essentials Deluxe (Species Files.rb): apply_metrics_to_sprite with a
//   metrics set (0 = normal, 1 = Dynamax, 2 = Gigantamax).

import type { SpeciesMetricsData } from "../pbs/types";
import { type Id, SymbolData } from "./gameData";
import { Settings } from "./settings";
import { Species } from "./species";

type XY = [number, number];

export class SpeciesMetrics extends SymbolData {
  static DATA = new Map<Id, SpeciesMetrics>();
  readonly id: Id;
  readonly species: Id;
  readonly form: number;
  backSprite: XY;
  frontSprite: XY;
  frontSpriteAltitude: number;
  shadowX: number;
  shadowSize: number;
  // Generation 8 Pack
  frontSpriteScale: number;
  backSpriteScale: number;
  // ZUD Mechanics
  dmaxBackSprite: XY;
  dmaxFrontSprite: XY;
  dmaxAltitude: number;
  dmaxShadowX: number;
  dmaxShadowSize: number;
  gmaxBackSprite: XY;
  gmaxFrontSprite: XY;
  gmaxAltitude: number;
  gmaxShadowX: number;
  gmaxShadowSize: number;

  /**
   * get_species_form(species, form): the metrics for that form, registering
   * a copy of the species' metrics (or defaults) the first time a form
   * without its own metrics is asked for.
   */
  static getSpeciesForm(species: Id | null | undefined, form: number | null | undefined): SpeciesMetrics | null {
    if (!species || form == null) return null;
    if (!Species.exists(species)) throw new Error(`Undefined species ${species}.`);
    if (form > 0) {
      const trial = `${species}_${form}`;
      if (!SpeciesMetrics.DATA.has(trial)) {
        if (!SpeciesMetrics.DATA.get(species)) SpeciesMetrics.register({ id: species });
        const base = SpeciesMetrics.DATA.get(species)!;
        SpeciesMetrics.register({
          id: trial,
          species,
          form,
          backSprite: [...base.backSprite],
          frontSprite: [...base.frontSprite],
          frontSpriteAltitude: base.frontSpriteAltitude,
          shadowX: base.shadowX,
          shadowSize: base.shadowSize,
          frontSpriteScale: base.frontSpriteScale,
          backSpriteScale: base.backSpriteScale,
        });
      }
      return SpeciesMetrics.DATA.get(trial)!;
    }
    if (!SpeciesMetrics.DATA.get(species)) SpeciesMetrics.register({ id: species });
    return SpeciesMetrics.DATA.get(species)!;
  }

  constructor(hash: Partial<SpeciesMetricsData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.species = hash.species ?? this.id;
    this.form = hash.form ?? 0;
    this.backSprite = hash.backSprite ?? [0, 0];
    this.frontSprite = hash.frontSprite ?? [0, 0];
    this.frontSpriteAltitude = hash.frontSpriteAltitude ?? 0;
    this.shadowX = hash.shadowX ?? 0;
    this.shadowSize = hash.shadowSize ?? 2;
    // Generation 8 Pack
    this.frontSpriteScale = hash.frontSpriteScale ?? Settings.FRONT_BATTLER_SPRITE_SCALE;
    this.backSpriteScale = hash.backSpriteScale ?? Settings.BACK_BATTLER_SPRITE_SCALE;
    // ZUD Mechanics
    this.dmaxBackSprite = hash.dmaxBackSprite ?? this.backSprite;
    this.dmaxFrontSprite = hash.dmaxFrontSprite ?? this.frontSprite;
    this.dmaxAltitude = hash.dmaxAltitude ?? this.frontSpriteAltitude;
    this.dmaxShadowX = hash.dmaxShadowX ?? this.shadowX;
    this.dmaxShadowSize = hash.dmaxShadowSize ?? 3;
    this.gmaxBackSprite = hash.gmaxBackSprite ?? this.dmaxBackSprite;
    this.gmaxFrontSprite = hash.gmaxFrontSprite ?? this.dmaxFrontSprite;
    this.gmaxAltitude = hash.gmaxAltitude ?? this.dmaxAltitude;
    this.gmaxShadowX = hash.gmaxShadowX ?? this.dmaxShadowX;
    this.gmaxShadowSize = hash.gmaxShadowSize ?? this.dmaxShadowSize;
  }

  /** apply_metrics_to_sprite(sprite, index, shadow = false, set = 0) — Essentials Deluxe's version. */
  applyMetricsToSprite(sprite: { x: number; y: number; mirror?: boolean }, index: number, shadow = false, set = 0): void {
    const metrics = {
      back: [this.backSprite, this.dmaxBackSprite, this.gmaxBackSprite],
      front: [this.frontSprite, this.dmaxFrontSprite, this.gmaxFrontSprite],
      altitude: [this.frontSpriteAltitude, this.dmaxAltitude, this.gmaxAltitude],
      shadow: [this.shadowX, this.dmaxShadowX, this.gmaxShadowX],
    };
    if (shadow) {
      if ((index & 1) === 1) sprite.x += metrics.shadow[set]! * 2; // Foe Pokémon
    } else if ((index & 1) === 0) { // Player's Pokémon
      sprite.x += metrics.back[set]![0] * 2;
      sprite.y += metrics.back[set]![1] * 2;
    } else { // Foe Pokémon
      const offset = metrics.front[set]![0] * 2;
      sprite.x = sprite.mirror ? sprite.x - offset : sprite.x + offset;
      sprite.y += metrics.front[set]![1] * 2;
      sprite.y -= metrics.altitude[set]! * 2;
    }
  }

  /** shows_shadow? */
  showsShadow(): boolean {
    return true;
  }
}
