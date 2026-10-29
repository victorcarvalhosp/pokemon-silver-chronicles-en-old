// Port of 012_Overworld/002_Battle triggering/001_Overworld_BattleStarting.rb:
// battle rules (setBattleRule / $game_temp.battle_rules), pbGetEnvironment,
// BattleCreationHelperMethods (as ZUD Mechanics overrides after_battle, which
// also ends Ultra Burst), WildBattle / TrainerBattle, and the after-battle
// handlers (evolution check, Pickup, Honey Gather, blacking out).
//
// The battle itself is built in one place, battleFactory below
// (BattleCreationHelperMethods.create_battle_scene + Battle.new).

import { Battle } from "../../battle";
import type { IBattleScene } from "../../battle/BattleSceneInterface";
import { BattleScene } from "../../battle/scene/BattleScene";
import "../../battle/deluxe"; // Essentials Deluxe / Enhanced UI scene additions (midbattle scripts, Battle Info...)
import "../../battle/zud/scene"; // ZUD Mechanics scene additions (Dynamax / Z-Move / Ultra Burst cinematics)
import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { EncounterType } from "../../data/gameData/encounterType";
import { Environment } from "../../data/gameData/environment";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Item } from "../../data/gameData/item";
import { Species } from "../../data/gameData/species";
import { TrainerType } from "../../data/gameData/trainerType";
import { Weather } from "../../data/gameData/weather";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { _INTL } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import { PBDayNight, pbGetTimeNow } from "../dayNight";
import { pbGenerateWildPokemon, pokemonEncounters, setWildBattleStart, type WildEncounter } from "../encounters/PokemonEncounters";
import { EncounterSettings } from "../encounters/settings";
import { EventHandlers } from "../eventHandlers";
import type { GamePlayer } from "../GamePlayer";
import { G } from "../globals";
import { pbMapInterpreter } from "../Interpreter";
import type { GameMap } from "../GameMap";
import { mapMetadata } from "../metadata";
import { pbItemEvolutionScene } from "../items/itemUtilities";
import { Pokemon } from "../pokemon/Pokemon";
import { pbLoadTrainer } from "../trainer/loadAndNew";
import type { Player } from "../trainer/Player";
import { NPCTrainer, type Trainer } from "../trainer/Trainer";
import { pbGetTrainerBattleBGM, pbGetWildBattleBGM } from "./battleAudio";
import { pbBattleAnimation, pbSceneStandby } from "./BattleIntroAnim";
import { pbStartOver } from "./startOver";

/** $game_temp.battle_rules: string keys as in Ruby. */
export type BattleRules = Record<string, unknown>;

declare module "../globals" {
  interface GameTemp {
    battleRulesHash?: BattleRules;
    partyLevelsBeforeBattle?: number[] | null;
    partyCriticalHitsDealt?: number[] | null;
    partyDirectDamageTaken?: number[] | null;
    /** [NPCTrainer, event id] of a trainer waiting to join a double battle. */
    waitingTrainer?: [NPCTrainer, number] | null;
  }
}

const player = () => G.player as unknown as Player;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;

//===============================================================================
// Battle preparation
//===============================================================================

/** Game_Temp#battle_rules */
export function battleRules(): BattleRules {
  return (G.gameTemp.battleRulesHash ??= {});
}

/** Game_Temp#clear_battle_rules */
export function clearBattleRules(): void {
  const rules = battleRules();
  for (const k of Object.keys(rules)) delete rules[k];
}

/** Game_Temp#add_battle_rule */
export function addBattleRule(rule: string, v: unknown = null): void {
  const rules = battleRules();
  switch (String(rule).toLowerCase()) {
    case "single": case "1v1": case "1v2": case "2v1": case "1v3": case "3v1":
    case "double": case "2v2": case "2v3": case "3v2": case "triple": case "3v3":
      rules["size"] = String(rule).toLowerCase();
      break;
    case "canlose": rules["canLose"] = true; break;
    case "cannotlose": rules["canLose"] = false; break;
    case "canrun": rules["canRun"] = true; break;
    case "cannotrun": rules["canRun"] = false; break;
    case "roamerflees": rules["roamerFlees"] = true; break;
    case "noexp": rules["expGain"] = false; break;
    case "nomoney": rules["moneyGain"] = false; break;
    case "disablepokeballs": rules["disablePokeBalls"] = true; break;
    case "forcecatchintoparty": rules["forceCatchIntoParty"] = true; break;
    case "switchstyle": rules["switchStyle"] = true; break;
    case "setstyle": rules["switchStyle"] = false; break;
    case "anims": rules["battleAnims"] = true; break;
    case "noanims": rules["battleAnims"] = false; break;
    case "terrain": rules["defaultTerrain"] = BattleTerrain.tryGet(v as Id)?.id ?? null; break;
    case "weather": rules["defaultWeather"] = BattleWeather.tryGet(v as Id)?.id ?? null; break;
    case "environment": case "environ": rules["environment"] = Environment.tryGet(v as Id)?.id ?? null; break;
    case "backdrop": case "battleback": rules["backdrop"] = v; break;
    case "base": rules["base"] = v; break;
    case "outcome": case "outcomevar": rules["outcomeVar"] = v; break;
    case "nopartner": rules["noPartner"] = true; break;
    default:
      throw new Error(_INTL('Battle rule "{1}" does not exist.', rule));
  }
}

/** setBattleRule(*args): rules that take a value read the next argument. */
export function setBattleRule(...args: unknown[]): void {
  let r: string | null = null;
  for (const arg of args) {
    if (r) {
      addBattleRule(r, arg);
      r = null;
      continue;
    }
    switch (String(arg).toLowerCase()) {
      case "terrain": case "weather": case "environment": case "environ": case "backdrop":
      case "battleback": case "base": case "outcome": case "outcomevar":
        r = String(arg);
        continue;
    }
    addBattleRule(String(arg));
  }
  if (r) throw new Error(_INTL("Argument {1} expected a variable after it but didn't have one.", r));
}

/** pbGetEnvironment: the battle environment (also Burmy/Wormadam's form). */
export function pbGetEnvironment(): Id {
  let ret: Id = "None";
  const mapEnv = mapMetadata(gameMap().mapId)?.battleEnvironment;
  if (mapEnv) ret = mapEnv;
  const encType = G.gameTemp.encounterType;
  const terrainTag = encType && EncounterType.get(encType).type === "fishing"
    ? gamePlayer().pbFacingTerrainTag()
    : gamePlayer().terrainTag();
  const tileEnvironment = terrainTag.battleEnvironment;
  if (ret === "Forest" && (tileEnvironment === "Grass" || tileEnvironment === "TallGrass")) ret = "ForestGrass";
  else if (tileEnvironment) ret = tileEnvironment;
  return ret;
}

// Record current levels of Pokémon in party, to see if they gain a level during
// battle and may need to evolve afterwards
EventHandlers.add("on_start_battle", "record_party_status", () => {
  const t = G.gameTemp;
  t.partyLevelsBeforeBattle = [];
  t.partyCriticalHitsDealt = [];
  t.partyDirectDamageTaken = [];
  player().party.forEach((pkmn, i) => {
    t.partyLevelsBeforeBattle![i] = pkmn.level;
    t.partyCriticalHitsDealt![i] = 0;
    t.partyDirectDamageTaken![i] = 0;
  });
});

export function pbCanDoubleBattle(): boolean {
  if (player().ablePokemonCount() >= 2) return true;
  return !!G.pokemonGlobal.partner && player().ablePokemonCount() >= 1;
}

export function pbCanTripleBattle(): boolean {
  if (player().ablePokemonCount() >= 3) return true;
  return !!G.pokemonGlobal.partner && player().ablePokemonCount() >= 2;
}

//===============================================================================
// The battle the overworld drives (Battle in Ruby; see battleFactory)
//===============================================================================

/** What prepare_battle sets and the overworld calls on a Battle. */
export interface BattleLike {
  canLose: boolean;
  canRun: boolean;
  rules: Record<string, unknown>;
  expGain: boolean;
  moneyGain: boolean;
  disablePokeBalls: boolean;
  sendToBoxes: number;
  switchStyle: boolean;
  showAnims: boolean;
  defaultTerrain: Id | null;
  defaultWeather: Id | null;
  environment: Id;
  backdrop: string;
  backdropBase: string | null;
  time: number;
  party1starts: number[];
  party2starts: number[];
  allyItems: unknown[];
  items: unknown[] | null;
  setBattleMode(mode: string): void;
  singleBattle(): boolean;
  /** Runs the whole battle; resolves to the outcome (0-5, see setOutcome). */
  pbStartBattle(): Promise<number>;
}

/**
 * BattleCreationHelperMethods.create_battle_scene (Battle::Scene.new) and
 * Battle.new(scene, player_party, foe_party, player_trainers, foe_trainers);
 * tests can swap them for a headless scene.
 */
export const battleFactory = {
  createScene: (): unknown => new BattleScene(),
  createBattle: (scene: unknown, playerParty: Pokemon[], foeParty: Pokemon[], playerTrainers: Trainer[], foeTrainers: NPCTrainer[] | null): BattleLike =>
    new Battle(scene as IBattleScene, playerParty, foeParty, playerTrainers as never, foeTrainers) as unknown as BattleLike,
};

//===============================================================================
// Helper methods for setting up and closing down battles
//===============================================================================
export const BattleCreationHelperMethods = {
  /** skip_battle?: if the player has no able Pokémon ($DEBUG Ctrl skipping doesn't exist here). */
  skipBattle_(): boolean {
    return player().ablePokemonCount() === 0;
  },

  async skipBattle(outcomeVariable: number, trainerBattle = false): Promise<number> {
    if (!trainerBattle && player().pokemonCount() > 0) await pbMessage(_INTL("SKIPPING BATTLE..."));
    if (trainerBattle && player().ablePokemonCount() > 0) await pbMessage(_INTL("AFTER WINNING..."));
    clearBattleRules();
    const t = G.gameTemp;
    if (t.memorizedBgm) {
      G.gameSystem.bgmPause();
      G.gameSystem.bgmPosition = t.memorizedBgmPosition ?? 0;
      G.gameSystem.bgmResume(t.memorizedBgm);
    }
    t.memorizedBgm = null;
    t.memorizedBgmPosition = 0;
    const g = G.pokemonGlobal;
    g.nextBattleBGM = null;
    g.nextBattleVictoryBGM = null;
    g.nextBattleCaptureME = null;
    g.nextBattleBack = null;
    pokemonEncounters().resetStepCount();
    let outcome = 1; // Win
    if (trainerBattle && player().ablePokemonCount() === 0) outcome = 0; // Undecided
    pbSet(outcomeVariable, outcome);
    return outcome;
  },

  partnerCanParticipate(foeParty: Pokemon[]): boolean {
    if (!G.pokemonGlobal.partner || battleRules()["noPartner"]) return false;
    if (foeParty.length > 1) return true;
    const size = battleRules()["size"] as string | undefined;
    if (size) return !(size === "single" || /^1v/i.test(size)); // "1v1", "1v2", "1v3", etc.
    return false;
  },

  /** set_up_player_trainers: the player and partner trainer(s). */
  setUpPlayerTrainers(foeParty: Pokemon[]): [Trainer[], unknown[], Pokemon[], number[]] {
    const trainerArray: Trainer[] = [player()];
    const allyItems: unknown[] = [];
    let pokemonArray = player().party;
    const partyStarts = [0];
    if (BattleCreationHelperMethods.partnerCanParticipate(foeParty)) {
      const partner = G.pokemonGlobal.partner!;
      const ally = new NPCTrainer(partner[1], partner[0]);
      ally.id = partner[2];
      ally.party = partner[3];
      allyItems[1] = [...ally.items];
      trainerArray.push(ally);
      pokemonArray = [...player().party];
      partyStarts.push(pokemonArray.length);
      pokemonArray.push(...ally.party);
      if (battleRules()["size"] == null) setBattleRule("double");
    }
    return [trainerArray, allyItems, pokemonArray, partyStarts];
  },

  createBattleScene(): unknown {
    return battleFactory.createScene();
  },

  /** prepare_battle: battle parameters and special rules. */
  prepareBattle(battle: BattleLike): void {
    const r = battleRules();
    // The size of the battle, i.e. how many Pokémon on each side (default: "single")
    if (r["size"] != null) battle.setBattleMode(r["size"] as string);
    // Whether the game won't black out even if the player loses (default: false)
    if (r["canLose"] != null) battle.canLose = r["canLose"] as boolean;
    // Whether the player can choose to run from the battle (default: true)
    if (r["canRun"] != null) battle.canRun = r["canRun"] as boolean;
    // Whether wild Pokémon always try to run from battle (default: nil)
    battle.rules["alwaysflee"] = r["roamerFlees"] ?? null;
    // Whether Pokémon gain Exp/EVs from defeating/catching a Pokémon (default: true)
    if (r["expGain"] != null) battle.expGain = r["expGain"] as boolean;
    // Whether the player gains/loses money at the end of the battle (default: true)
    if (r["moneyGain"] != null) battle.moneyGain = r["moneyGain"] as boolean;
    // Whether Poké Balls cannot be thrown at all
    if (r["disablePokeBalls"] != null) battle.disablePokeBalls = r["disablePokeBalls"] as boolean;
    // Whether the player is asked what to do with a new Pokémon when their party is full
    if (EncounterSettings.NEW_CAPTURE_CAN_REPLACE_PARTY_MEMBER) battle.sendToBoxes = G.pokemonSystem.sendtoboxes;
    if (r["forceCatchIntoParty"]) battle.sendToBoxes = 2;
    // Whether the player is able to switch when an opponent's Pokémon faints
    battle.switchStyle = G.pokemonSystem.battlestyle === 0;
    if (r["switchStyle"] != null) battle.switchStyle = r["switchStyle"] as boolean;
    // Whether battle animations are shown
    battle.showAnims = G.pokemonSystem.battlescene === 0;
    if (r["battleAnims"] != null) battle.showAnims = r["battleAnims"] as boolean;
    // Terrain
    if (r["defaultTerrain"] == null && EncounterSettings.OVERWORLD_WEATHER_SETS_BATTLE_TERRAIN) {
      switch (G.gameScreen.weatherType) {
        case "Storm": battle.defaultTerrain = "Electric"; break;
        case "Fog": battle.defaultTerrain = "Misty"; break;
      }
    } else {
      battle.defaultTerrain = (r["defaultTerrain"] as Id) ?? null;
    }
    // Weather
    if (r["defaultWeather"] == null) {
      switch (Weather.get(G.gameScreen.weatherType).category as string) {
        case "Rain": case "Storm": battle.defaultWeather = "Rain"; break;
        case "Hail": battle.defaultWeather = "Hail"; break;
        case "Sandstorm": battle.defaultWeather = "Sandstorm"; break;
        case "Sun": battle.defaultWeather = "Sun"; break;
      }
    } else {
      battle.defaultWeather = r["defaultWeather"] as Id;
    }
    // Environment
    battle.environment = r["environment"] == null ? pbGetEnvironment() : (r["environment"] as Id);
    // Backdrop graphic filename
    let backdrop: string | null = null;
    const meta = mapMetadata(gameMap().mapId);
    if (r["backdrop"] != null) backdrop = r["backdrop"] as string;
    else if (G.pokemonGlobal.nextBattleBack) backdrop = G.pokemonGlobal.nextBattleBack;
    else if (G.pokemonGlobal.surfing) backdrop = "water"; // This applies wherever you are, including in caves
    else if (meta) {
      const back = meta.battleBackground;
      if (back && back !== "") backdrop = back;
    }
    battle.backdrop = backdrop ?? "indoor1";
    // Choose a name for bases depending on environment
    let base: string | null = null;
    if (r["base"] == null) base = Environment.tryGet(battle.environment)?.battleBase ?? null;
    else base = r["base"] as string;
    if (base) battle.backdropBase = base;
    // Time of day
    if (meta?.battleEnvironment === "Cave") {
      battle.time = 2; // This makes Dusk Balls work properly in caves
    } else if (EncounterSettings.TIME_SHADING) {
      const timeNow = pbGetTimeNow();
      battle.time = PBDayNight.isNight(timeNow) ? 2 : PBDayNight.isEvening(timeNow) ? 1 : 0;
    }
  },

  /** after_battle (ZUD Mechanics' version: also reverts Ultra Burst). */
  async afterBattle(outcome: number, canLose: boolean): Promise<void> {
    for (const pkmn of player().party) {
      if (pkmn.status === "POISON") pkmn.statusCount = 0; // Bad poison becomes regular
      pkmn.makeUnmega();
      pkmn.makeUnUltra();
      pkmn.makeUnprimal();
    }
    const partner = G.pokemonGlobal.partner;
    if (partner) {
      player().healParty();
      for (const pkmn of partner[3]) {
        pkmn.heal();
        pkmn.makeUnmega();
        pkmn.makeUnUltra();
        pkmn.makeUnprimal();
      }
    }
    if ((outcome === 2 || outcome === 5) && canLose) { // if loss or draw
      for (const pkmn of player().party) pkmn.heal();
      await Graphics.wait(0.25); // (Graphics.frame_rate / 4).times { Graphics.update }
    }
    await EventHandlers.trigger("on_end_battle", outcome, canLose);
    gamePlayer().straighten();
    // Following Pokémon EX aliases after_battle to refresh the follower; it
    // hooks in here (Plugins/Following Pokemon EX/Script Additions/Refresh.rb).
    for (const hook of afterBattleHooks) await hook(outcome, canLose);
  },

  /**
   * set_outcome: saves the result in a Game Variable (1 by default):
   *   0 - Undecided or aborted
   *   1 - Player won
   *   2 - Player lost
   *   3 - Player or wild Pokémon ran from battle, or player forfeited the match
   *   4 - Wild Pokémon was caught
   *   5 - Draw
   */
  setOutcome(outcome: number, outcomeVariable = 1, trainerBattle = false): void {
    const s = G.stats;
    switch (outcome) {
      case 1: case 4: // Won, caught
        if (!trainerBattle) s.wildBattlesWon += 1;
        else s.trainerBattlesWon += 1;
        break;
      case 2: case 3: case 5: // Lost, fled, draw
        if (!trainerBattle) s.wildBattlesLost += 1;
        else s.trainerBattlesLost += 1;
        break;
    }
    pbSet(outcomeVariable, outcome);
  },
};

/** Code run after after_battle (the Following Pokémon refresh). */
export const afterBattleHooks: ((outcome: number, canLose: boolean) => void | Promise<void>)[] = [];

/** pbSet(id, value): sets a Game Variable (Interpreter#pbSet outside events). */
function pbSet(id: number, value: unknown): void {
  if (id && id > 0) {
    G.gameVariables.set(id, value);
    if (G.gameMap) gameMap().needRefresh = true;
  }
}

//===============================================================================
// Wild battles
//===============================================================================
type Foe = Pokemon | WildEncounter | Id | number;

export const WildBattle = {
  /** WildBattle.start(*args, can_override:): used when walking in tall grass, hence the extra code. */
  async start(args: Foe[], canOverride = false): Promise<boolean> {
    const foeParty = WildBattle.generateFoes(args);
    // Potentially call a different WildBattle.start-type method instead (for
    // roaming Pokémon, Safari battles, Bug Contest battles)
    if (foeParty.length === 1 && canOverride) {
      const handled: (boolean | null)[] = [null];
      await EventHandlers.trigger("on_calling_wild_battle", foeParty[0], foeParty[0]!.level, handled);
      if (handled[0] != null) return handled[0];
    }
    // Perform the battle
    const outcome = await WildBattle.startCore(foeParty);
    // Used by the Poké Radar to update/break the chain
    if (foeParty.length === 1 && canOverride) {
      await EventHandlers.trigger("on_wild_battle_end", foeParty[0]!.species, foeParty[0]!.level, outcome);
    }
    // Return false if the player lost or drew the battle, and true if any other result
    return outcome !== 2 && outcome !== 5;
  },

  async startCore(args: Foe[]): Promise<number> {
    const outcomeVariable = (battleRules()["outcomeVar"] as number) || 1;
    const canLose = (battleRules()["canLose"] as boolean) || false;
    // Skip battle if the player has no able Pokémon
    if (BattleCreationHelperMethods.skipBattle_()) return BattleCreationHelperMethods.skipBattle(outcomeVariable);
    // Record information about party Pokémon to be used at the end of battle
    // (e.g. comparing levels for an evolution check)
    await EventHandlers.trigger("on_start_battle");
    // Generate array of foes
    const foeParty = WildBattle.generateFoes(args);
    // Generate information for the player and partner trainer(s)
    const [playerTrainers, allyItems, playerParty, playerPartyStarts] = BattleCreationHelperMethods.setUpPlayerTrainers(foeParty);
    // Create the battle scene (the visual side of it)
    const scene = BattleCreationHelperMethods.createBattleScene();
    // Create the battle class (the mechanics side of it)
    const battle = battleFactory.createBattle(scene, playerParty, foeParty, playerTrainers, null);
    battle.party1starts = playerPartyStarts;
    battle.allyItems = allyItems;
    // Set various other properties in the battle class
    if (battleRules()["size"] == null) setBattleRule(`${foeParty.length}v${foeParty.length}`);
    BattleCreationHelperMethods.prepareBattle(battle);
    clearBattleRules();
    // Perform the battle itself
    let outcome = 0;
    await pbBattleAnimation(pbGetWildBattleBGM(foeParty), foeParty.length === 1 ? 0 : 2, foeParty, async () => {
      await pbSceneStandby(async () => {
        outcome = await battle.pbStartBattle();
      });
      await BattleCreationHelperMethods.afterBattle(outcome, canLose);
    });
    Input.update();
    // Save the result of the battle in a Game Variable (1 by default)
    BattleCreationHelperMethods.setOutcome(outcome, outcomeVariable);
    return outcome;
  },

  /** generate_foes: Pokémon objects, [species, level] arrays or species, level pairs. */
  generateFoes(args: Foe[]): Pokemon[] {
    const ret: Pokemon[] = [];
    let speciesId: Id | null = null;
    for (const arg of args) {
      if (arg instanceof Pokemon) {
        if (speciesId) throw new Error(_INTL("Species {1} was given but not a level.", speciesId));
        ret.push(arg);
      } else if (Array.isArray(arg)) {
        if (speciesId) throw new Error(_INTL("Species {1} was given but not a level.", speciesId));
        const species = Species.get(arg[0]).id;
        ret.push(pbGenerateWildPokemon(species, arg[1]));
      } else if (speciesId) { // Expecting level
        if (typeof arg !== "number" || !Number.isInteger(arg) || arg < 1 || arg > GrowthRate.maxLevel()) {
          throw new Error(_INTL("Expected a level (1..{1}) but {2} is not a number or not a valid level.", GrowthRate.maxLevel(), arg));
        }
        ret.push(pbGenerateWildPokemon(speciesId, arg));
        speciesId = null;
      } else { // Expecting species ID
        if (!Species.exists(arg)) throw new Error(_INTL("Species {1} does not exist.", arg));
        speciesId = String(arg);
      }
    }
    if (speciesId) throw new Error(_INTL("Species {1} was given but not a level.", speciesId));
    return ret;
  },
};

setWildBattleStart((args, canOverride) => WildBattle.start(args as Foe[], canOverride));

//===============================================================================
// Trainer battles
//===============================================================================
type TrainerArg = NPCTrainer | [Id, string, number?, string?] | Id | string | number;

export const TrainerBattle = {
  /**
   * TrainerBattle.start: used by most trainer events. If two trainer events
   * spot the player at once, the first waits for the second and they battle
   * together.
   */
  async start(args: TrainerArg[]): Promise<boolean> {
    const t = G.gameTemp;
    if (!t.waitingTrainer && pbMapInterpreter().running() && pbCanDoubleBattle()) {
      const thisEvent = pbMapInterpreter().getSelf();
      // Find all other triggered trainer events
      const triggeredEvents = gamePlayer().pbTriggeredTrainerEvents([2], false, true);
      const otherEvent = triggeredEvents.filter((i) => i.id !== thisEvent?.id && !G.gameSelfSwitches.get(gameMap().mapId, i.id, "A"));
      // If there is exactly 1 other triggered trainer event, this trainer can be
      // stored up to battle with that one
      if (otherEvent.length === 1 && thisEvent) {
        const [trainers] = TrainerBattle.generateFoes(args);
        // If this is just 1 trainer with 6 or fewer Pokémon, it can be stored up
        // to battle alongside the other trainer
        if (trainers.length === 1 && trainers[0]!.party.length <= EncounterSettings.MAX_PARTY_SIZE) {
          t.waitingTrainer = [trainers[0]!, thisEvent.id];
          return false;
        }
      }
    }
    // Perform the battle
    let outcome: number;
    if (t.waitingTrainer) {
      outcome = await TrainerBattle.startCore([...args, t.waitingTrainer[0]]);
      if (outcome === 1) pbMapInterpreter().pbSetSelfSwitch(t.waitingTrainer[1], "A", true);
      t.waitingTrainer = null;
    } else {
      outcome = await TrainerBattle.startCore(args);
    }
    // Return true if the player won the battle, and false if any other result
    return outcome === 1;
  },

  async startCore(args: TrainerArg[]): Promise<number> {
    const outcomeVariable = (battleRules()["outcomeVar"] as number) || 1;
    const canLose = (battleRules()["canLose"] as boolean) || false;
    if (BattleCreationHelperMethods.skipBattle_()) return BattleCreationHelperMethods.skipBattle(outcomeVariable, true);
    await EventHandlers.trigger("on_start_battle");
    // Generate information for the foes
    const [foeTrainers, foeItems, foeParty, foePartyStarts] = TrainerBattle.generateFoes(args);
    // Generate information for the player and partner trainer(s)
    const [playerTrainers, allyItems, playerParty, playerPartyStarts] = BattleCreationHelperMethods.setUpPlayerTrainers(foeParty);
    const scene = BattleCreationHelperMethods.createBattleScene();
    const battle = battleFactory.createBattle(scene, playerParty, foeParty, playerTrainers, foeTrainers);
    battle.party1starts = playerPartyStarts;
    battle.party2starts = foePartyStarts;
    battle.allyItems = allyItems;
    battle.items = foeItems;
    if (battleRules()["size"] == null) setBattleRule(`${foeTrainers.length}v${foeTrainers.length}`);
    BattleCreationHelperMethods.prepareBattle(battle);
    clearBattleRules();
    let outcome = 0;
    await pbBattleAnimation(pbGetTrainerBattleBGM(foeTrainers), battle.singleBattle() ? 1 : 3, foeTrainers, async () => {
      await pbSceneStandby(async () => {
        outcome = await battle.pbStartBattle();
      });
      await BattleCreationHelperMethods.afterBattle(outcome, canLose);
    });
    Input.update();
    BattleCreationHelperMethods.setOutcome(outcome, outcomeVariable, true);
    return outcome;
  },

  /** generate_foes: NPCTrainers, [type, name, version, speech] arrays, or type, name(, version) runs. */
  generateFoes(args: TrainerArg[]): [NPCTrainer[], Id[][], Pokemon[], number[]] {
    const trainerArray: NPCTrainer[] = [];
    const foeItems: Id[][] = [];
    const pokemonArray: Pokemon[] = [];
    const partyStarts: number[] = [];
    let trainerType: Id | null = null;
    let trainerName: string | null = null;
    const add = (trainer: NPCTrainer) => {
      trainerArray.push(trainer);
      foeItems.push(trainer.items);
      partyStarts.push(pokemonArray.length);
      pokemonArray.push(...trainer.party);
    };
    const load = (type: Id, name: string, version = 0, what: string) => {
      // (pbMissingTrainer, which offers to create a missing trainer, is a debug feature.)
      const trainer = pbLoadTrainer(type, name, version);
      if (!trainer) throw new Error(_INTL("Trainer for data '{1}' is not defined.", what));
      EventHandlers.triggerSync("on_trainer_load", trainer);
      return trainer;
    };
    args.forEach((arg, i) => {
      if (arg instanceof NPCTrainer) {
        if (trainerType) throw new Error(_INTL("Trainer type {1} was given but not a trainer name.", trainerType));
        add(arg);
      } else if (Array.isArray(arg)) { // [trainer type, trainer name, version number, speech (optional)]
        if (trainerType) throw new Error(_INTL("Trainer type {1} was given but not a trainer name.", trainerType));
        // (This game's 001_Overworld_BattleStarting.rb also shows a debug
        // message, pbMessage("<type> entered here"), at this point; left out.)
        const trainer = load(arg[0], arg[1], arg[2] ?? 0, String(arg));
        if (arg[3]) trainer.loseText = arg[3];
        add(trainer);
      } else if (trainerName) { // Expecting version number
        if (typeof arg !== "number" || arg < 0) {
          throw new Error(_INTL("Expected a trainer version number (0 or higher) but {1} is not a number or not a valid value.", arg));
        }
        add(load(trainerType!, trainerName, arg, `${trainerType}, ${trainerName}, ${arg}`));
        trainerType = null;
        trainerName = null;
      } else if (trainerType) { // Expecting trainer name
        if (typeof arg !== "string" || arg.trim() === "") throw new Error(_INTL("Expected a trainer name but '{1}' is not a valid name.", arg));
        if (typeof args[i + 1] === "number") {
          trainerName = arg.trim(); // Version number is next
        } else {
          add(load(trainerType, arg, 0, `${trainerType}, ${arg}`));
          trainerType = null;
        }
      } else { // Expecting trainer type
        if (!TrainerType.exists(arg)) throw new Error(_INTL("Trainer type {1} does not exist.", arg));
        trainerType = String(arg);
      }
    });
    if (trainerType) throw new Error(_INTL("Trainer type {1} was given but not a trainer name.", trainerType));
    return [trainerArray, foeItems, pokemonArray, partyStarts];
  },
};

//===============================================================================
// After battles
//===============================================================================
EventHandlers.add("on_end_battle", "evolve_and_black_out", async (d, c) => {
  const decision = d as number;
  const canLose = c as boolean;
  // Check for evolutions
  if (EncounterSettings.CHECK_EVOLUTION_AFTER_ALL_BATTLES || (decision !== 2 && decision !== 5)) await pbEvolutionCheck();
  const t = G.gameTemp;
  t.partyLevelsBeforeBattle = null;
  t.partyCriticalHitsDealt = null;
  t.partyDirectDamageTaken = null;
  // Check for blacking out or gaining Pickup/Huney Gather items
  switch (decision) {
    case 1: case 4: // Win, capture
      for (const pkmn of player().pokemonParty()) {
        pbPickup(pkmn);
        pbHoneyGather(pkmn);
      }
      break;
    case 2: case 5: // Lose, draw
      if (!canLose) {
        G.gameSystem.bgmUnpause();
        G.gameSystem.bgsUnpause();
        await pbStartOver();
      }
      break;
  }
});

/** pbEvolutionCheck: evolves party Pokémon that levelled up (or meet an after-battle condition). */
export async function pbEvolutionCheck(): Promise<void> {
  const t = G.gameTemp;
  for (const [i, pkmn] of player().party.entries()) {
    if (!pkmn || pkmn.egg()) continue;
    if (pkmn.fainted() && !EncounterSettings.CHECK_EVOLUTION_FOR_FAINTED_POKEMON) continue;
    // Find an evolution
    let newSpecies: Id | null = null;
    const before = t.partyLevelsBeforeBattle?.[i];
    if (before != null && before < pkmn.level) newSpecies = pkmn.checkEvolutionOnLevelUp() as Id | null;
    newSpecies ??= pkmn.checkEvolutionAfterBattle(i) as Id | null;
    if (newSpecies == null) continue;
    // Evolve Pokémon if possible (no fade: evo.pbStartScreen / pbEvolution / pbEndScreen)
    await pbItemEvolutionScene(pkmn, newSpecies, true, undefined, false);
  }
}

/** pbDynamicItemList: the items in the list that exist. */
export function pbDynamicItemList(...args: Id[]): Id[] {
  return args.filter((a) => Item.exists(a));
}

// Common items to find via Pickup, added to the pool in order from a point
// depending on the Pokémon's level (9 + PICKUP_COMMON_ITEM_CHANCES.length items).
const PICKUP_COMMON_ITEMS = [
  "POTION", // Levels 1-10
  "ANTIDOTE", // Levels 1-10, 11-20
  "SUPERPOTION", // Levels 1-10, 11-20, 21-30
  "GREATBALL", // Levels 1-10, 11-20, 21-30, 31-40
  "REPEL", // Levels 1-10, 11-20, 21-30, 31-40, 41-50
  "ESCAPEROPE", // Levels 1-10, 11-20, 21-30, 31-40, 41-50, 51-60
  "FULLHEAL", // Levels 1-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70
  "HYPERPOTION", // Levels 1-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70, 71-80
  "ULTRABALL", // Levels 1-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70, 71-80, 81-90
  "REVIVE", // Levels 11-20, ..., 91-100
  "RARECANDY", // Levels 21-30, ..., 91-100
  "SUNSTONE", // Levels 31-40, ..., 91-100
  "MOONSTONE", // Levels 41-50, ..., 91-100
  "HEARTSCALE", // Levels 51-60, ..., 91-100
  "FULLRESTORE", // Levels 61-70, ..., 91-100
  "MAXREVIVE", // Levels 71-80, 81-90, 91-100
  "PPUP", // Levels 81-90, 91-100
  "MAXELIXIR", // Levels 91-100
];
// Chances to get each item added to the pool from the array above.
const PICKUP_COMMON_ITEM_CHANCES = [30, 10, 10, 10, 10, 10, 10, 4, 4];
// Rare items to find via Pickup (9 + PICKUP_RARE_ITEM_CHANCES.length items).
const PICKUP_RARE_ITEMS = [
  "HYPERPOTION", // Levels 1-10
  "NUGGET", // Levels 1-10, 11-20
  "KINGSROCK", // Levels 11-20, 21-30
  "FULLRESTORE", // Levels 21-30, 31-40
  "ETHER", // Levels 31-40, 41-50
  "IRONBALL", // Levels 41-50, 51-60
  "DESTINYKNOT", // Levels 51-60, 61-70
  "ELIXIR", // Levels 61-70, 71-80
  "DESTINYKNOT", // Levels 71-80, 81-90
  "LEFTOVERS", // Levels 81-90, 91-100
  "DESTINYKNOT", // Levels 91-100
];
// Chances to get each item added to the pool from the array above.
const PICKUP_RARE_ITEM_CHANCES = [1, 1];

/** pbPickup: try to gain an item after a battle if a Pokémon has the ability Pickup. */
export function pbPickup(pkmn: Pokemon): void {
  if (pkmn.egg() || !pkmn.hasAbility("PICKUP")) return;
  if (pkmn.hasItem()) return;
  if (!(rand(100) < 10)) return; // 10% chance for Pickup to trigger
  const numRarityLevels = 10;
  // Ensure common and rare item lists contain defined items
  const commonItems = pbDynamicItemList(...PICKUP_COMMON_ITEMS);
  const rareItems = pbDynamicItemList(...PICKUP_RARE_ITEMS);
  if (commonItems.length < numRarityLevels - 1 + PICKUP_COMMON_ITEM_CHANCES.length) return;
  if (rareItems.length < numRarityLevels - 1 + PICKUP_RARE_ITEM_CHANCES.length) return;
  // Determine the starting point for adding items from the above arrays into the pool
  const startIndex = Math.max(Math.floor(((Math.min(100, pkmn.level) - 1) * numRarityLevels) / 100), 0);
  // Generate a pool of items depending on the Pokémon's level
  const items: Id[] = [];
  PICKUP_COMMON_ITEM_CHANCES.forEach((_, i) => items.push(commonItems[startIndex + i]!));
  PICKUP_RARE_ITEM_CHANCES.forEach((_, i) => items.push(rareItems[startIndex + i]!));
  // Randomly choose an item from the pool to give to the Pokémon
  const allChances = [...PICKUP_COMMON_ITEM_CHANCES, ...PICKUP_RARE_ITEM_CHANCES];
  const rnd = rand(allChances.reduce((a, b) => a + b, 0));
  let cumul = 0;
  for (const [i, c] of allChances.entries()) {
    cumul += c;
    if (rnd >= cumul) continue;
    pkmn.item = items[i]!;
    break;
  }
}

/** pbHoneyGather: try to gain a Honey after a battle if a Pokémon has the ability Honey Gather. */
export function pbHoneyGather(pkmn: Pokemon): void {
  if (!Item.exists("HONEY")) return;
  if (pkmn.egg() || !pkmn.hasAbility("HONEYGATHER") || pkmn.hasItem()) return;
  const chance = 5 + Math.floor((pkmn.level - 1) / 10) * 5;
  if (!(rand(100) < chance)) return;
  pkmn.item = "HONEY";
}

