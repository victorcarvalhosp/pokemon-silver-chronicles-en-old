// Port of Data/Scripts/010_Data/001_Hardcoded data/012_Weather.rb.

import { Tone } from "../../rgss/types";
import { type Id, SymbolAndNumberData } from "./gameData";

export type WeatherCategory = "None" | "Rain" | "Hail" | "Sandstorm" | "Sun" | "Fog";

export class Weather extends SymbolAndNumberData {
  static DATA = new Map<Id | number, Weather>();
  readonly id: Id;
  readonly idNumber: number;
  readonly realName: string;
  readonly category: WeatherCategory;
  /** [[particle file names], [tile file names]] */
  readonly graphics: (string[] | null)[];
  readonly particleDeltaX: number;
  readonly particleDeltaY: number;
  readonly particleDeltaOpacity: number;
  readonly tileDeltaX: number;
  readonly tileDeltaY: number;
  readonly toneProc: ((strength: number) => Tone) | null;

  constructor(hash: {
    id: Id; idNumber: number; category?: WeatherCategory; particleDeltaX?: number; particleDeltaY?: number;
    particleDeltaOpacity?: number; tileDeltaX?: number; tileDeltaY?: number; graphics?: (string[] | null)[];
    toneProc?: (strength: number) => Tone;
  }) {
    super();
    this.id = hash.id;
    this.idNumber = hash.idNumber;
    this.realName = hash.id;
    this.category = hash.category ?? "None";
    this.particleDeltaX = hash.particleDeltaX ?? 0;
    this.particleDeltaY = hash.particleDeltaY ?? 0;
    this.particleDeltaOpacity = hash.particleDeltaOpacity ?? 0;
    this.tileDeltaX = hash.tileDeltaX ?? 0;
    this.tileDeltaY = hash.tileDeltaY ?? 0;
    this.graphics = hash.graphics ?? [];
    this.toneProc = hash.toneProc ?? null;
  }

  get name(): string { return this.realName; }

  /** has_particles? */
  hasParticles(): boolean { return !!this.graphics[0] && this.graphics[0].length > 0; }
  /** has_tiles? */
  hasTiles(): boolean { return !!this.graphics[1] && this.graphics[1].length > 0; }

  tone(strength: number): Tone {
    return this.toneProc ? this.toneProc(strength) : new Tone(0, 0, 0, 0);
  }
}

/** Ruby Integer#/ (floors towards negative infinity). */
const div = (a: number, b: number) => Math.floor(a / b);

Weather.register({
  id: "None",
  idNumber: 0, // Must be 0 (preset RMXP weather)
});

Weather.register({
  id: "Rain",
  idNumber: 1, // Must be 1 (preset RMXP weather)
  category: "Rain",
  graphics: [["rain_1", "rain_2", "rain_3", "rain_4"]], // Last is splash
  particleDeltaX: -1200,
  particleDeltaY: 4800,
  toneProc: (strength: number) => new Tone(div(-strength * 3, 4), div(-strength * 3, 4), div(-strength * 3, 4), 10),
});

// NOTE: This randomly flashes the screen in RPG::Weather#update.
Weather.register({
  id: "Storm",
  idNumber: 2, // Must be 2 (preset RMXP weather)
  category: "Rain",
  graphics: [["storm_1", "storm_2", "storm_3", "storm_4"]], // Last is splash
  particleDeltaX: -4800,
  particleDeltaY: 4800,
  toneProc: (strength: number) => new Tone(div(-strength * 3, 2), div(-strength * 3, 2), div(-strength * 3, 2), 20),
});

// NOTE: This alters the movement of snow particles in RPG::Weather#update_sprite_position.
Weather.register({
  id: "Snow",
  idNumber: 3, // Must be 3 (preset RMXP weather)
  category: "Hail",
  graphics: [["hail_1", "hail_2", "hail_3"]],
  particleDeltaX: -240,
  particleDeltaY: 240,
  toneProc: (strength: number) => new Tone(div(strength, 2), div(strength, 2), div(strength, 2), 0),
});

Weather.register({
  id: "Blizzard",
  idNumber: 4,
  category: "Hail",
  graphics: [["blizzard_1", "blizzard_2", "blizzard_3", "blizzard_4"], ["blizzard_tile"]],
  particleDeltaX: -960,
  particleDeltaY: 240,
  tileDeltaX: -1440,
  tileDeltaY: 720,
  toneProc: (strength: number) => new Tone(div(strength * 3, 4), div(strength * 3, 4), div(strength * 3, 4), 0),
});

Weather.register({
  id: "Sandstorm",
  idNumber: 5,
  category: "Sandstorm",
  graphics: [["sandstorm_1", "sandstorm_2", "sandstorm_3", "sandstorm_4"], ["sandstorm_tile"]],
  particleDeltaX: -1200,
  particleDeltaY: 640,
  tileDeltaX: -720,
  tileDeltaY: 360,
  toneProc: (strength: number) => new Tone(div(strength, 2), 0, div(-strength, 2), 0),
});

Weather.register({
  id: "HeavyRain",
  idNumber: 6,
  category: "Rain",
  graphics: [["storm_1", "storm_2", "storm_3", "storm_4"]], // Last is splash
  particleDeltaX: -4800,
  particleDeltaY: 4800,
  toneProc: (strength: number) => new Tone(div(-strength * 3, 2), div(-strength * 3, 2), div(-strength * 3, 2), 20),
});

// NOTE: This alters the screen tone in RPG::Weather#update_screen_tone.
Weather.register({
  id: "Sun",
  idNumber: 7,
  category: "Sun",
  toneProc: (_strength: number) => new Tone(64, 64, 32, 0),
});

Weather.register({
  id: "Fog",
  category: "Fog",
  idNumber: 8,
  tileDeltaX: -32,
  tileDeltaY: 0,
  graphics: [null, ["fog_tile"]],
});
