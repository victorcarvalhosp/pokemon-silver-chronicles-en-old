// The Max Raid and Dynamax Adventure functions event scripts call, registered
// under their Ruby names (see scriptApi.ts): ZUD Mechanics/[009] Max Raid and
// [010] Adventures (game/maxRaid, game/maxLair). Importing this also loads
// those modules (the den reset handler, den graphics and save values).

import type { Id } from "../../data/gameData/gameData";
import { inMaxLair, pbDynamaxAdventure } from "../maxLair";
import { MaxRaidBattle, pbClearAllDens, pbMaxRaidDen, pbMaxRaidDenSpecial, pbOpenRaidData, pbSetRaidSpecies,
  type RaidFoe } from "../maxRaid";
import type { DxHash } from "../maxRaid/Raid_Setup";
import { defineScript } from "../scriptApi";

const hash = (v: unknown): DxHash => (v && typeof v === "object" && !Array.isArray(v) ? v as DxHash : {});

// --- Max Raid Dens (Raid_Den_Event.rb, Raid_Mine.rb) ------------------------------
defineScript("pbMaxRaidDen", (_c, pkmn, rules, pokemon) => pbMaxRaidDen((pkmn ?? []) as RaidFoe, hash(rules), hash(pokemon)));
defineScript("pbMaxRaidDenSpecial", (_c, order) => pbMaxRaidDenSpecial(order == null ? 1 : Number(order)));
defineScript("pbSetRaidSpecies", (_c, t1, t2) => pbSetRaidSpecies((t1 ?? []) as Id[], (t2 ?? []) as Id[]));
defineScript("pbClearAllDens", (_c, reset) => pbClearAllDens(!!reset));
defineScript("MaxRaidBattle.start", (_c, species, rules, pokemon) =>
  MaxRaidBattle.start((species ?? []) as RaidFoe, hash(rules), hash(pokemon)));
// --- Max Raid Database (Raid_Database.rb) -----------------------------------------
defineScript("pbOpenRaidData", () => pbOpenRaidData());
// --- Dynamax Adventures (Adventure_Main.rb) ----------------------------------------
defineScript("pbDynamaxAdventure", () => pbDynamaxAdventure());
defineScript("inMaxLair?", () => inMaxLair());

// Map 851 (a test map), event 6 calls pbMaxRaidDen([nil], {species: PIKACHU,
// rank: 3, loot: [DRAGONFANG, DYNAMAXCANDY]}, {gmaxfactor: false, obtaintext: ...}).
// NOTE (Ruby parity): :species isn't a rule anything reads and [nil] is an
// Array, so the den picks any rank-3 species; and the :loot pair makes the
// reward's quantity :DYNAMAXCANDY, which $bag.add can't take (the rewards
// screen raises).
