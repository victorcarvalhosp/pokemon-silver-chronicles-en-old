// Port of Data/Scripts/010_Data/001_Hardcoded data/011_TerrainTag.rb
// (+ the StairLeft/StairRight tags added by Plugins/Side Stairs Tiles).

export interface TerrainTag {
  id: string;
  idNumber: number;
  canSurf?: boolean;
  waterfall?: boolean;
  waterfallCrest?: boolean;
  canFish?: boolean;
  canDive?: boolean;
  deepBush?: boolean;
  showsGrassRustle?: boolean;
  landWildEncounters?: boolean;
  doubleWildEncounters?: boolean;
  battleEnvironment?: string;
  ledge?: boolean;
  ice?: boolean;
  bridge?: boolean;
  showsReflections?: boolean;
  mustWalk?: boolean;
  ignorePassability?: boolean;
}

const TAGS: TerrainTag[] = [
  { id: "None", idNumber: 0 },
  { id: "Ledge", idNumber: 1, ledge: true },
  { id: "Grass", idNumber: 2, showsGrassRustle: true, landWildEncounters: true, battleEnvironment: "Grass" },
  { id: "Sand", idNumber: 3, battleEnvironment: "Sand" },
  { id: "Rock", idNumber: 4, battleEnvironment: "Rock" },
  { id: "DeepWater", idNumber: 5, canSurf: true, canFish: true, canDive: true, battleEnvironment: "MovingWater" },
  { id: "StillWater", idNumber: 6, canSurf: true, canFish: true, battleEnvironment: "StillWater", showsReflections: true },
  { id: "Water", idNumber: 7, canSurf: true, canFish: true, battleEnvironment: "MovingWater" },
  { id: "Waterfall", idNumber: 8, canSurf: true, waterfall: true },
  { id: "WaterfallCrest", idNumber: 9, canSurf: true, canFish: true, waterfallCrest: true },
  {
    id: "TallGrass", idNumber: 10, deepBush: true, landWildEncounters: true, doubleWildEncounters: true,
    battleEnvironment: "TallGrass", mustWalk: true,
  },
  { id: "UnderwaterGrass", idNumber: 11, landWildEncounters: true },
  { id: "Ice", idNumber: 12, battleEnvironment: "Ice", ice: true, mustWalk: true },
  { id: "Neutral", idNumber: 13, ignorePassability: true },
  { id: "SootGrass", idNumber: 14, showsGrassRustle: true, landWildEncounters: true, battleEnvironment: "Grass" },
  { id: "Bridge", idNumber: 15, bridge: true },
  { id: "Puddle", idNumber: 16, battleEnvironment: "Puddle", showsReflections: true },
  { id: "NoEffect", idNumber: 17 },
  { id: "StairLeft", idNumber: 18 },
  { id: "StairRight", idNumber: 19 },
];

const BY_NUMBER = new Map(TAGS.map((t) => [t.idNumber, t]));
const NONE = TAGS[0]!;

/** GameData::TerrainTag.try_get, falling back to None like Essentials. */
export function terrainTag(idNumber: number): TerrainTag {
  return BY_NUMBER.get(idNumber) ?? NONE;
}
