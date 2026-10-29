// The Battle Frontier (018_Alternate battle modes) functions events call,
// registered under their Ruby names, and saving $PokemonGlobal.challenge and
// $PokemonGlobal.lastbattle.

import { G } from "../globals";
import { PokemonGlobalExtras } from "../battle/globalExtras";
import { defineScript } from "../scriptApi";
import { NPCTrainer } from "../trainer/Trainer";
import { BattleChallenge, BattleChallengeData, BattleChallengeType, BattleFactoryData } from "./battleChallenge";
import * as BattleRules from "./battleRules";
import { BattleSwapScene, BattleSwapScreen } from "./battleSwap";
import { BaseStatRestriction, InverseRestriction, NonlegendaryRestriction, pbGenerateChallenge, pbWriteCup } from "./generatorData";
import {
  BattleArena, BattlePalace, BattleTower, BattleType, pbDebugPlayBattle, pbOrganizedBattleEx, pbPlayBattle,
  pbPlayBattleFromFile, pbPlayLastBattle, pbRecordLastBattle,
} from "./challengeBattles";
import {
  pbBattleChallenge, pbBattleChallengeBattle, pbBattleChallengeBeginSpeech, pbBattleChallengeGraphic, pbEntryScreen,
  pbGetBTPokemon, pbGetBTTrainers, pbHasEligible, pbInChallenge,
} from "./challengeData";
import * as ChallengeRules from "./challengeRules";
import * as EntryRestrictions from "./entryRestrictions";
import * as LevelAdjustments from "./levelAdjustment";
import { FrontierMarshal } from "./marshal";
import type { Player } from "../trainer/Player";
import * as Rulesets from "./rulesets";

//===============================================================================
// Saving
//===============================================================================
/** The classes a saved challenge (and its rules) is made of. */
function classesOf(mod: Record<string, unknown>): Record<string, abstract new (...args: never[]) => object> {
  return Object.fromEntries(Object.entries(mod).filter(([, v]) => typeof v === "function" && /^class\b/.test(String(v)))) as never;
}
FrontierMarshal.register({
  BattleChallenge, BattleChallengeData, BattleChallengeType, BattleFactoryData,
  BattleType, BattleTower, BattlePalace, BattleArena,
  BaseStatRestriction, NonlegendaryRestriction, InverseRestriction,
  NPCTrainer,
  ...classesOf(ChallengeRules), ...classesOf(Rulesets), ...classesOf(EntryRestrictions),
  ...classesOf(LevelAdjustments), ...classesOf(BattleRules),
});

PokemonGlobalExtras.register("challenge", {
  save: (v) => FrontierMarshal.dump(v),
  load: (json) => {
    const challenge = FrontierMarshal.load(json) as BattleChallenge;
    // Marshal saves the player's party and the challenge's together, so during a
    // challenge $player.party is the challenge's party object; keep it so.
    const bc = challenge?.bc;
    const party = (G.player as unknown as Player | null)?.party;
    if (bc?.inProgress && bc.party && party && party.length === bc.party.length &&
        party.every((p, i) => p.personalID === bc.party![i]!.personalID)) {
      (G.player as unknown as Player).party = bc.party;
    }
    return challenge;
  },
});
PokemonGlobalExtras.register("lastbattle");

//===============================================================================
// Event scripts
//===============================================================================
type Fn = (...args: never[]) => unknown;
const call = (fn: Fn) => (_c: unknown, ...args: unknown[]) => fn(...(args as never[]));

defineScript("pbBattleChallenge", () => pbBattleChallenge());
defineScript("pbBattleChallengeBattle", () => pbBattleChallengeBattle());
defineScript("pbHasEligible?", call(pbHasEligible));
defineScript("pbGetBTTrainers", call(pbGetBTTrainers));
defineScript("pbGetBTPokemon", call(pbGetBTPokemon));
defineScript("pbEntryScreen", call(pbEntryScreen));
defineScript("pbInChallenge?", () => pbInChallenge());
defineScript("pbBattleChallengeGraphic", call(pbBattleChallengeGraphic));
defineScript("pbBattleChallengeBeginSpeech", () => pbBattleChallengeBeginSpeech());
defineScript("pbOrganizedBattleEx", call(pbOrganizedBattleEx));
defineScript("pbRecordLastBattle", () => pbRecordLastBattle());
defineScript("pbPlayLastBattle", () => pbPlayLastBattle());
defineScript("pbPlayBattle", call(pbPlayBattle));
defineScript("pbDebugPlayBattle", () => pbDebugPlayBattle());
defineScript("pbPlayBattleFromFile", call(pbPlayBattleFromFile));
defineScript("pbWriteCup", call(pbWriteCup));
defineScript("pbGenerateChallenge", (_c, rule, tag) => pbGenerateChallenge(rule as never, tag as string, () => {}));

// Rules (002_Battle Frontier rules/001_Challenge_ChallengeRules.rb)
for (const name of ["pbPikaCupRules", "pbPokeCupRules", "pbPrimeCupRules", "pbFancyCupRules", "pbLittleCupRules",
  "pbStrictLittleCupRules", "pbBattleTowerRules", "pbBattlePalaceRules", "pbBattleArenaRules", "pbBattleFactoryRules"] as const) {
  defineScript(name, call(ChallengeRules[name] as Fn));
}
// Class.new for every rule, ruleset, level adjustment and battle type class
const constructors: Record<string, new (...args: never[]) => object> = {
  ...classesOf(ChallengeRules), ...classesOf(Rulesets), ...classesOf(EntryRestrictions), ...classesOf(LevelAdjustments),
  ...classesOf(BattleRules), BaseStatRestriction, NonlegendaryRestriction, InverseRestriction,
  BattleType, BattleTower, BattlePalace, BattleArena, BattleSwapScene, BattleSwapScreen,
} as never;
for (const [name, ctor] of Object.entries(constructors)) {
  defineScript(`${name}.new`, (_c, ...args) => new ctor(...(args as never[])));
}
