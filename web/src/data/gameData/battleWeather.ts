// Port of Data/Scripts/010_Data/001_Hardcoded data/015_BattleWeather.rb.

import { type Id, SymbolData } from "./gameData";

export class BattleWeather extends SymbolData {
  static DATA = new Map<Id, BattleWeather>();
  readonly id: Id;
  readonly realName: string;
  readonly animation: string | null;

  constructor(hash: { id: Id; name?: string; animation?: string | null }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.animation = hash.animation ?? null;
  }

  get name(): string { return this.realName; }
}

BattleWeather.register({id: "None", name: "None", animation: null});
BattleWeather.register({id: "Sun", name: "Sun", animation: "Sun"});
BattleWeather.register({id: "Rain", name: "Rain", animation: "Rain"});
BattleWeather.register({id: "Sandstorm", name: "Sandstorm", animation: "Sandstorm"});
BattleWeather.register({id: "Hail", name: "Hail", animation: "Hail"});
BattleWeather.register({id: "HarshSun", name: "Harsh Sun", animation: "HarshSun"});
BattleWeather.register({id: "HeavyRain", name: "Heavy Rain", animation: "HeavyRain"});
BattleWeather.register({id: "StrongWinds", name: "Strong Winds", animation: "StrongWinds"});
BattleWeather.register({id: "ShadowSky", name: "Shadow Sky", animation: "ShadowSky"});
