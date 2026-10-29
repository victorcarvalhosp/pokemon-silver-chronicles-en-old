// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Mine.rb (this game's own
// file): pbMaxRaidDenSpecial(order), the eight story Max Raid Dens (events
// named "MaxRaidDen" call it with their number), each with a fixed
// Gigantamax boss, rules and reward.
//
// NOTE (Ruby parity), all in the original:
// - `:rank => 5` is overwritten: a Pokémon boss's rank comes from its level
//   (55 -> rank 4), Raid_Setup.rb:114;
// - `:gmax_factor` and `:catch_rate` in pkmn_options aren't keys anything reads
//   (the boss's own gmax_factor is what's used);
// - the fallback branch (any other number) learns :DRAGON_DANCE, which isn't a
//   move, uses :Sunny, which isn't a weather, and leaves pkmn_options nil, so
//   MaxRaidBattle.start raises NoMethodError (Raid_Mine.rb:216-246).

import type { Id } from "../../data/gameData/gameData";
import { Pokemon } from "../pokemon/Pokemon";
import { pbMaxRaidDen } from "./Raid_Den_Event";
import type { DxHash } from "./Raid_Setup";

interface Den { species: Id; moves: Id[]; loot: Id; weather: string; terrain: string; environ: string }

const STORY_DENS: Record<number, Den> = {
  1: { species: "KINGLER", moves: ["ROCKSLIDE", "LIQUIDATION", "KNOCKOFF", "XSCISSOR"], loot: "RARECANDY", weather: "Rain", terrain: "None", environ: "Sand" },
  2: { species: "PIKACHU", moves: ["THUNDER", "MEGAKICK", "DIG", "DETECT"], loot: "THUNDERSTONE", weather: "None", terrain: "Electric", environ: "None" },
  3: { species: "DREDNAW", moves: ["SHELLSMASH", "LIQUIDATION", "STONEEDGE", "EARTHQUAKE"], loot: "WATERSTONE", weather: "Rain", terrain: "None", environ: "Sand" },
  4: { species: "COALOSSAL", moves: ["ROCKBLAST", "INCINERATE", "DIG", "HEAVYSLAM"], loot: "FIRESTONE", weather: "Sun", terrain: "None", environ: "Sand" },
  5: { species: "EEVEE", moves: ["LASTRESORT", "BATONPASS", "PROTECT", "STOREDPOWER"], loot: "WATERSTONE", weather: "Sun", terrain: "None", environ: "None" },
  6: { species: "BUTTERFREE", moves: ["QUIVERDANCE", "BUGBUZZ", "SLEEPPOWDER", "CONFUSION"], loot: "LEAFSTONE", weather: "Sun", terrain: "None", environ: "None" },
  7: { species: "GENGAR", moves: ["WILLOWISP", "DISABLE", "HEX", "SLUDGEWAVE"], loot: "MOONSTONE", weather: "Fog", terrain: "Misty", environ: "Graveyard" },
  8: { species: "MACHAMP", moves: ["CLOSECOMBAT", "FACADE", "KNOCKOFF", "BULLETPUNCH"], loot: "SUNSTONE", weather: "None", terrain: "None", environ: "None" },
};

export async function pbMaxRaidDenSpecial(order = 1): Promise<boolean | undefined> {
  let boss: Pokemon;
  let rules: DxHash;
  let pkmnOptions: DxHash | null = null;
  const den = STORY_DENS[order];
  if (den) {
    boss = new Pokemon(den.species, 55);
    for (const m of den.moves) boss.learnMove(m);
    boss.dynamaxLvl = 10;
    boss.gmaxFactor = true;
    rules = {
      rank: 5,
      loot: [den.loot],
      turns: 10,
      kocount: 3,
      size: 3,
      weather: den.weather,
      terrain: den.terrain,
      environ: den.environ,
      hard: true,
      autoscale: true,
      simple: false,
      setcapture: true,
      catch_rate: 255,
    };
    pkmnOptions = { gmax_factor: true, obtaintext: "a stormy Max Raid Den", catch_rate: 255 };
  } else {
    // Todo update this
    boss = new Pokemon("PIKACHU", 1);
    boss.learnMove("THUNDER");
    boss.learnMove("SURF");
    boss.learnMove("DRAGON_DANCE");
    boss.learnMove("DYNAMICPUNCH");
    boss.dynamaxLvl = 10;
    boss.gmaxFactor = true;
    rules = {
      rank: 4,
      loot: ["RARECANDY"],
      turns: 15,
      kocount: 5,
      size: 4,
      weather: "Sunny",
      terrain: "Grassy",
      environ: "Cave",
      hard: false,
      autoscale: true,
      simple: false,
      setcapture: true,
    };
  }
  // (pkmn_options is nil in the fallback branch: generate_foe raises on it.)
  return pbMaxRaidDen(boss, rules, pkmnOptions as DxHash);
}
