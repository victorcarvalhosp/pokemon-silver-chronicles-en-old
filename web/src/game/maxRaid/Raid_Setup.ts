// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Setup.rb: MaxRaidBattle
// (start, start_core, generate_foe), raid_GenerateMovelists,
// raid_GetEligibleMoves and raid_Rewards.
//
// The rules and pokemon hashes are Essentials Deluxe's (Ruby keys, see
// battle/deluxe/rubyData.ts); IDs may be given as strings or Syms.

import { rand } from "../../core/random";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { GenderRatio } from "../../data/gameData/genderRatio";
import { Item } from "../../data/gameData/item";
import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { assetExists } from "../../core/assets";
import { pbApplyBattleRules, pbApplyWildAttributes } from "../../battle/deluxe/Battle_Deluxe";
import { dxClear, setDxPokemon, setDxRules } from "../../battle/deluxe/DeluxeTemp";
import { idOf, isSym } from "../../battle/deluxe/rubyData";
import { RaidBattle } from "../../battle/zud/raid/Raid_Battle";
import type { IBattleScene } from "../../battle/BattleSceneInterface";
import { Input } from "../../rgss/Input";
import { pbGetWildBattleBGM } from "../battle/battleAudio";
import { pbBattleAnimation, pbSceneStandby } from "../battle/BattleIntroAnim";
import { BattleCreationHelperMethods, clearBattleRules, pbGetEnvironment } from "../battle/BattleStarting";
import { EventHandlers } from "../eventHandlers";
import { G } from "../globals";
import { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import type { NPCTrainer, Trainer } from "../trainer/Trainer";
import { pbDeregisterPartner } from "../trainers/trainerEvents";
import { inMaxLair, pbDynamaxAdventure } from "../maxLair/Adventure_Main";
import { raidInitiateRaidDen } from "./Raid_Den_Scene";
import { sample, shuffle } from "./random";
import { raidGenerateSpecies, raidGetEligibleSpecies, raidLevelFromRank, raidRankFromBadgeCount,
  raidRankFromLevel, raidRanksAppearedIn, type RaidSpeciesParams } from "./Raid_Ranks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DxHash = Record<string, any>;

const player = () => G.player as unknown as Player;

/** What MaxRaidBattle.start takes as the raid's species: a Pokémon, a species, or raid_GenerateSpeciesList's params. */
export type RaidFoe = Pokemon | RaidSpeciesParams;

/**
 * RaidBattle.new(scene, player_party, foe_party, player_trainers, nil);
 * tests swap it for a headless scene.
 */
export const raidBattleFactory = {
  createBattle: (scene: unknown, playerParty: Pokemon[], foeParty: Pokemon[], playerTrainers: Trainer[]): RaidBattle =>
    new RaidBattle(scene as IBattleScene, playerParty, foeParty, playerTrainers as never, null as NPCTrainer[] | null),
};

/** `default.clone` for the defaults (Symbols and numbers are their own clones). */
const clone = <T>(v: T): T => (Array.isArray(v) ? ([...v] as T) : v);

//===============================================================================
// Max Raid Battle set up and associated utilities.
//===============================================================================
export const MaxRaidBattle = {
  /**
   * MaxRaidBattle.start(species = [], rules = {}, pokemon = {}): a raid den
   * (or, with rules[:simple], the battle alone). Returns false if the player
   * lost or drew.
   */
  async start(species: RaidFoe = [], rules: DxHash = {}, pokemon: DxHash = {}): Promise<boolean> {
    dxClear(clearBattleRules, pbDeregisterPartner);
    const defaultRules: DxHash = {
      size: Settings.MAXRAID_SIZE,
      turns: Settings.MAXRAID_TIMER,
      kocount: Settings.MAXRAID_KOS,
      shield: Settings.MAXRAID_SHIELD,
      rank: raidRankFromBadgeCount(),
      environ: "Cave",
      hard: false,
      autoscale: true,
      simple: false,
    };
    for (const key of Object.keys(defaultRules)) if (!(key in rules)) rules[key] = clone(defaultRules[key]);
    const [foe, rank] = MaxRaidBattle.generateFoe(species, rules.rank, pokemon);
    rules.rank = rank;
    if (rules.rank === 6 && !inMaxLair()) rules.hard = true;
    if (!rules.outcome) rules.outcome = 1;
    rules.canlose = true;
    rules.noflee = true;
    rules.noexp = true;
    rules.nomoney = true;
    rules.nocapture = true;
    rules.nopartner = true;
    if (!rules.hard) rules.setcapture = true;
    setDxRules(rules);
    pbApplyBattleRules(1, true);
    let outcome: unknown;
    if (rules.simple) {
      outcome = await MaxRaidBattle.startCore(foe);
      if (inMaxLair() && (outcome === 1 || outcome === 4)) {
        pbDynamaxAdventure().battleCount += 1;
        const qty = 1 + Math.floor(rand(rules.rank * (G.gameTemp.dxPokemon as DxHash).level) / 25);
        pbDynamaxAdventure().addLoot("DYNITEORE", qty);
      }
    } else {
      // NOTE (Ruby parity): raid_InitiateRaidDen returns what MaxRaidScene#pbEndScene
      // does ($game_temp.dx_clear's {}), not the battle's outcome, so a raid den
      // always returns true (Raid_Setup.rb:40-43); events read the outcome variable.
      outcome = await raidInitiateRaidDen(foe);
    }
    dxClear(clearBattleRules, pbDeregisterPartner);
    return outcome !== 2 && outcome !== 5;
  },

  //-----------------------------------------------------------------------------
  // Battle core.
  //-----------------------------------------------------------------------------
  async startCore(foe: Pokemon | null): Promise<number> {
    const rules = G.gameTemp.dxRules as DxHash;
    await EventHandlers.trigger("on_start_battle");
    // NOTE (Ruby parity): Ruby's fallback here passes an undefined local
    // `pokemon` (a NameError, Raid_Setup.rb:52); it never runs, as callers
    // always give a foe. dx_pokemon is passed instead.
    if (!foe) [foe] = MaxRaidBattle.generateFoe(foe, rules.rank, (G.gameTemp.dxPokemon ?? {}) as DxHash);
    const foeParty = [foe!];
    if (BattleCreationHelperMethods.skipBattle_()) {
      return BattleCreationHelperMethods.skipBattle(rules.outcome);
    }
    const prefix = !foe!.gmaxFactor ? "A Dynamaxed" : foe!.isSpecies("ETERNATUS") ? "An Eternamax" : "A Gigantamax";
    const location = inMaxLair() ? "lair" : "den";
    rules.introtext = `${prefix} {1} emerged from within the ${location}!`;
    rules.raidcapture = [`{1} disappeared somewhere into the ${location}...`, "Battle Raid Capture"];
    // rules[:raidcapture].push(20) if rules[:hard]
    const [playerTrainers, allyItems, playerParty, playerPartyStarts] = BattleCreationHelperMethods.setUpPlayerTrainers(foeParty);
    const scene = BattleCreationHelperMethods.createBattleScene();
    const battle = raidBattleFactory.createBattle(scene, playerParty, foeParty, playerTrainers);
    battle.party1starts = playerPartyStarts;
    battle.allyItems = allyItems as never;
    BattleCreationHelperMethods.prepareBattle(battle as never);
    clearBattleRules();
    let outcome = 0;
    const namingSetting = G.pokemonSystem.givenicknames;
    G.pokemonSystem.givenicknames = 1;
    await pbBattleAnimation(pbGetWildBattleBGM(foeParty), 0, foeParty, async () => {
      await pbSceneStandby(async () => {
        outcome = await battle.pbStartBattle();
      });
      await BattleCreationHelperMethods.afterBattle(outcome, rules.canlose);
    });
    Input.update();
    BattleCreationHelperMethods.setOutcome(outcome, rules.outcome);
    G.pokemonSystem.givenicknames = namingSetting;
    if (Settings.UNLOCK_DATABASE_FROM_RAIDS) player().hasRaidDatabase = true;
    return outcome;
  },

  //-----------------------------------------------------------------------------
  // Creates a Max Raid Pokemon to generate for battle.
  //-----------------------------------------------------------------------------
  generateFoe(species: RaidFoe, rank: number | null, pokemon: DxHash = {}): [Pokemon, number | null] {
    const defaultPkmn: DxHash = {
      form: 0,
      obtaintext: _INTL("Max Raid Den."),
      gmaxfactor: false,
    };
    for (const key of Object.keys(defaultPkmn)) if (!(key in pokemon)) pokemon[key] = clone(defaultPkmn[key]);
    let speciesId: Id;
    if (species instanceof Pokemon) {
      //---------------------------------------------------------------------------
      // Sets appropriate data if species paramater is a Pokemon object.
      //---------------------------------------------------------------------------
      speciesId = species.species;
      pokemon.level = species.level;
      pokemon.form = species.form;
      pokemon.gender = species.gender;
      pokemon.size = species.scale;
      pokemon.item = species.itemId;
      pokemon.ability = species.abilityIndex;
      pokemon.moves = species.moves;
      pokemon.ribbons = species.ribbons;
      // NOTE (Ruby parity): `species.iv.values` lists the IVs in Hash order
      // (HP, Atk, Def, SpAtk, SpDef, Speed) but pbApplyWildAttributes reads them
      // by pbs_order (HP, Atk, Def, Speed, SpAtk, SpDef), so a saved den Pokémon's
      // Speed/SpAtk/SpDef IVs get rotated each time it's set up (Raid_Setup.rb:109).
      pokemon.ivs = Stat.eachMain().map((s) => species.iv[s.id]);
      pokemon.dynamaxlvl = species.dynamaxLvl;
      pokemon.shiny = species.shiny;
      pokemon.supershiny = species.superShiny;
      pokemon.gmaxfactor = species.gmaxFactor;
      rank = raidRankFromLevel(pokemon.level);
    } else {
      //---------------------------------------------------------------------------
      // Sets a raid species if species parameter is a species symbol.
      //---------------------------------------------------------------------------
      const id = typeof species === "string" || isSym(species) ? idOf(species) : null;
      if (id) speciesId = raidGetEligibleSpecies(id);
      else speciesId = raidGenerateSpecies(species as RaidSpeciesParams, rank, pbGetEnvironment());
      if (isSym(pokemon.form)) {
        const totalForms = [0];
        for (const s of Species.each()) if (s.species === speciesId) totalForms.push(s.form);
        pokemon.form = sample(totalForms);
      }
      if (pokemon.form > 0) {
        const data = Species.get(speciesId);
        speciesId = Species.getSpeciesForm(data.species, pokemon.form)!.id;
      }
      const eligibleRanks = raidRanksAppearedIn(speciesId);
      if (!eligibleRanks.includes(rank!)) rank = sample(eligibleRanks);
      pokemon.level = raidLevelFromRank(rank!);
      pokemon.form = Species.get(speciesId).form;
      const speciesData = Species.get(speciesId);
      pokemon.size = 200 + rand(56);
      //-------------------------------------------------------------------------
      // Adjusts [:gender] in cases where gender alters appearance.
      //-------------------------------------------------------------------------
      if (speciesBitmapExists(speciesData, "Icons", true) && pokemon.gender == null) {
        const femaleChance = GenderRatio.get(speciesData.genderRatio).femaleChance;
        // NOTE (Ruby parity): gender 0 is male, so the female chance makes the
        // raid Pokémon male (Raid_Setup.rb:145).
        pokemon.gender = rand(255) < (femaleChance as number) ? 0 : 1;
      } else {
        switch (speciesData.genderRatio) {
          case "AlwaysMale": pokemon.gender = 0; break;
          case "AlwaysFemale": pokemon.gender = 1; break;
          case "Genderless": pokemon.gender = null; break;
        }
      }
      //-------------------------------------------------------------------------
      // Sets [:ivs] based on the raid rank.
      //-------------------------------------------------------------------------
      // NOTE (Ruby parity): a species that's in no raid rank (e.g. a Mega form
      // picked by a random :form) leaves rank nil, and `i <= rank` raises
      // ArgumentError (Raid_Setup.rb:134-160).
      if (rank == null) throw new Error("ArgumentError: comparison of Integer with nil failed");
      let i = 0;
      const stats: number[] = [];
      for (const _s of Stat.eachMain()) {
        i += 1;
        const iv = i <= rank! ? Pokemon.IV_STAT_LIMIT : rand(Pokemon.IV_STAT_LIMIT + 1);
        stats.push(iv);
      }
      pokemon.ivs = shuffle(stats);
      //-------------------------------------------------------------------------
      // Sets Hidden Ability index for [:ability] based on the raid rank.
      //-------------------------------------------------------------------------
      if (pokemon.ability == null || pokemon.ability === false) {
        const chance = rand(10);
        if (rank === 4 && chance < 2) pokemon.ability = 2;
        if (rank === 5 && chance < 5) pokemon.ability = 2;
        if (rank === 6 && chance < 8) pokemon.ability = 2;
      }
      //-------------------------------------------------------------------------
      // Sets the Mightiest Mark on raid Pokemon battled under Hard Mode.
      //-------------------------------------------------------------------------
      if (!pokemon.mark && rank === 6) pokemon.mark = "MIGHTIESTMARK";
      //-------------------------------------------------------------------------
      // Generates a raid moveset and sets the [:moves].
      //-------------------------------------------------------------------------
      if (!pokemon.moves) {
        const moves: (Id | null)[] = [];
        const raidMoves = raidGenerateMovelists(speciesId);
        for (const m of raidMoves) moves.push(sample(m));
        pokemon.moves = moves;
      }
      //-------------------------------------------------------------------------
      // Sets [:dynamaxlvl] based on the raid [:rank].
      //-------------------------------------------------------------------------
      switch (rank) {
        case 1: pokemon.dynamaxlvl = 5; break;
        case 2: pokemon.dynamaxlvl = 10; break;
        case 3: pokemon.dynamaxlvl = 20; break;
        case 4: pokemon.dynamaxlvl = 30; break;
        case 5: pokemon.dynamaxlvl = 40; break;
        case 6: pokemon.dynamaxlvl = 50; break;
      }
      //-------------------------------------------------------------------------
      // Scales the likelihood of [:gmaxfactor] if the species can Gigantamax.
      //-------------------------------------------------------------------------
      if (speciesData.hasGmax()) {
        const chance = rand(10);
        switch (rank) {
          case 3: if (chance < 1) pokemon.gmaxfactor = true; break;
          case 4: if (chance < 3) pokemon.gmaxfactor = true; break;
          case 5: case 6: if (chance < 5) pokemon.gmaxfactor = true; break;
        }
      } else {
        pokemon.gmaxfactor = false;
      }
    }
    //---------------------------------------------------------------------------
    // Dynamax Adventure settings for [:shiny] and [:obtaintext].
    //---------------------------------------------------------------------------
    if (inMaxLair()) {
      pokemon.shiny = false;
      pokemon.supershiny = false;
    }
    pokemon.dynamax = true;
    pokemon.species = speciesId;
    setDxPokemon(pokemon);
    const pkmn = new Pokemon(pokemon.species, pokemon.level);
    pbApplyWildAttributes([pkmn]);
    return [pkmn, rank];
  },
};

/** GameData::Species#bitmap_exists?(subfolder, female) (Essentials Deluxe's Species Files.rb:143). */
function speciesBitmapExists(sp: Species, subfolder: string, female = false): boolean {
  let path = subfolder === "Followers" ? "Graphics/Characters/" : "Graphics/Pokemon/";
  path += subfolder + "/";
  path += sp.species;
  if (sp.form > 0) path += "_" + sp.form;
  if (female) path += "_female";
  return assetExists(path);
}

//-------------------------------------------------------------------------------
// Generates all eligible movelists for a particular species.
//-------------------------------------------------------------------------------
export function raidGenerateMovelists(pkmn: Id, rental = false): [Id[], Id[], Id[], Id[]] {
  const stabMoves: Id[] = [];
  const coverageMoves: Id[] = [];
  const spreadMoves: Id[] = [];
  const statusMoves: Id[] = [];
  //-----------------------------------------------------------------------------
  // Creates arrays of eligible moves for this species.
  //-----------------------------------------------------------------------------
  const speciesData = Species.get(pkmn);
  const acrobatics = "DoublePowerIfUserHasNoItem";
  const rotomForm = speciesData.species === "ROTOM" && speciesData.form > 0;
  const familyMoves = speciesData.getFamilyMoves();
  const [blacklist, whitelist] = raidGetEligibleMoves(rental);
  for (const m of Move.each()) {
    if (m.powerMove()) continue;
    if (!familyMoves.includes(m.id)) continue;
    if (blacklist.includes(m.functionCode)) continue;
    if (m.accuracy > 0 && m.accuracy < 70) continue;
    const stab = speciesData.types.includes(m.type);
    const mult = m.target === "AllNearFoes" || m.target === "AllNearOthers";
    if (whitelist.includes(m.functionCode)) {
      statusMoves.push(m.id);
    } else if (m.baseDamage >= 55 && mult && !rental) {
      spreadMoves.push(m.id);
    } else if (rotomForm && stab && !mult && (m.baseDamage >= 75 || m.functionCode === acrobatics)) {
      coverageMoves.push(m.id);
    } else if (stab && !mult && (m.baseDamage >= 70 || m.functionCode === acrobatics)) {
      stabMoves.push(m.id);
    } else if (m.type !== "NORMAL" && !mult && !stab && (m.baseDamage >= 75 || m.functionCode === acrobatics)) {
      coverageMoves.push(m.id);
    }
    // Rental Pokemon in a Dynamax Adventure don't get spread moves.
    if (rental && !mult) {
      if (whitelist.includes(m.functionCode) || m.baseDamage >= 75) spreadMoves.push(m.id);
    }
  }
  //-----------------------------------------------------------------------------
  // Forces certain moves onto specific species's movelists.
  //-----------------------------------------------------------------------------
  switch (pkmn) {
    case "TAUROS_1": stabMoves.push("RAGINGBULL"); break;
    case "TAUROS_2": stabMoves.push("RAGINGBULL"); break;
    case "TAUROS_3": stabMoves.push("RAGINGBULL"); break;
    case "SNORLAX": statusMoves.push("REST"); break;
    case "SHUCKLE": statusMoves.push("POWERTRICK"); break;
    case "SLAKING": stabMoves.push("GIGAIMPACT"); break;
    case "CASTFORM": stabMoves.push("WEATHERBALL"); break;
    case "ROTOM_1": stabMoves.push("OVERHEAT"); break;
    case "ROTOM_2": stabMoves.push("HYDROPUMP"); break;
    case "ROTOM_3": stabMoves.push("BLIZZARD"); break;
    case "ROTOM_4": stabMoves.push("AIRSLASH"); break;
    case "ROTOM_5": stabMoves.push("LEAFSTORM"); break;
    case "DARKRAI": statusMoves.push("DARKVOID"); break;
    case "GENESECT": coverageMoves.push("TECHNOBLAST"); break;
    case "ORICORIO": coverageMoves.push("REVELATIONDANCE"); break;
    case "ORICORIO_1": coverageMoves.push("REVELATIONDANCE"); break;
    case "ORICORIO_2": coverageMoves.push("REVELATIONDANCE"); break;
    case "ORICORIO_3": coverageMoves.push("REVELATIONDANCE"); break;
    case "MELMETAL": stabMoves.push("DOUBLEIRONBASH"); break;
    case "SIRFETCHD": stabMoves.push("METEORASSAULT"); break;
    case "DRAGAPULT": spreadMoves.push("DRAGONDARTS"); break;
    case "URSHIFU_1": stabMoves.push("SURGINGSTRIKES"); break;
    case "MAUSHOLD": stabMoves.push("POPULATIONBOMB"); break;
    case "MAUSHOLD_1": stabMoves.push("POPULATIONBOMB"); break;
    case "PALAFIN_1": stabMoves.push("JETPUNCH"); break;
    case "ANNIHILAPE": stabMoves.push("RAGEFIST"); break;
  }
  return [stabMoves, coverageMoves, spreadMoves, statusMoves];
}

//-------------------------------------------------------------------------------
// Sets up arrays containing all moves a raid battler may or may not have.
//-------------------------------------------------------------------------------
export function raidGetEligibleMoves(rental = false): [string[], string[]] {
  //-----------------------------------------------------------------------------
  // Moves that are ignored when compiling movelists.
  //-----------------------------------------------------------------------------
  let blacklist = [
    "FailsIfNotUserFirstTurn",                        // First Impression
    "FlinchTargetFailsIfNotUserFirstTurn",            // Fake Out
    "FailsIfUserDamagedThisTurn",                     // Focus Punch
    "FailsIfUserHasUnusedMove",                       // Last Resort
    "FailsIfTargetHasNoItem",                         // Poltergeist
    "RemoveTerrain",                                  // Steel Roller
    "UserLosesHalfOfTotalHP",                         // Steel Beam
    "HealUserByHalfOfDamageDoneIfTargetAsleep",       // Dream Eater
    "AttackAndSkipNextTurn",                          // Hyper Beam, Giga Impact, etc.
    "TwoTurnAttackInvulnerableInSkyTargetCannotAct",  // Sky Drop
    "UserFaintsExplosive",                            // Self-Destruct, Explosion, etc.
    "UserFaintsPowersUpInMistyTerrainExplosive",      // Misty Explosion
    "SwitchOutTargetDamagingMove",                    // Circle Throw, Dragon Tail, etc.
    "TypeDependsOnUserIVs",                           // Hidden Power
    "LowerUserSpAtk2",                                // Overheat, Draco Meteor, etc.
    "CategoryDependsOnHigherDamageTera",              // Tera Blast
  ];
  if (rental) {
    blacklist = blacklist.concat([
      "TwoTurnAttackInvulnerableInSky",                 // Fly
      "TwoTurnAttackInvulnerableUnderground",           // Dig
      "TwoTurnAttackInvulnerableUnderwater",            // Dive
      "FailsIfUserNotConsumedBerry",                    // Belch
      "DoubleDamageOnDynamaxTargets",                   // Behemoth Blade, Dynamax Cannon, etc.
    ]);
  }
  //-----------------------------------------------------------------------------
  // Eligible support moves.
  //-----------------------------------------------------------------------------
  let whitelist = [
    "HealUserHalfOfTotalHP",                          // Recover
    "HealUserHalfOfTotalHPLoseFlyingTypeThisTurn",    // Roost
    "HealUserDependingOnWeather",                     // Moonlight, Morning Sun, etc.
    "HealUserDependingOnSandstorm",                   // Shore Up
    "HealUserAndAlliesQuarterOfTotalHP",              // Life Dew
    "HealUserAndAlliesQuarterOfTotalHPCureStatus",    // Jungle Healing
    "HealUserPositionNextTurn",                       // Wish
    "HealUserByTargetAttackLowerTargetAttack1",       // Strength Sap
    "StartHealUserEachTurn",                          // Aqua Ring
    "StartHealUserEachTurnTrapUserInBattle",          // Ingrain
    "StartLeechSeedTarget",                           // Leech Seed
    "StartUserSideImmunityToInflictedStatus",         // Safeguard
    "StartPreventCriticalHitsAgainstUserSide",        // Lucky Chant
    "StartWeakenPhysicalDamageAgainstUserSide",       // Reflect
    "StartWeakenSpecialDamageAgainstUserSide",        // Light Screen
    "CureUserPartyStatus",                            // Heal Bell, Aromatherapy, etc.
    "ProtectUserBanefulBunker",                       // Baneful Bunker
    "ProtectUserFromDamagingMovesObstruct",           // Obstruct
    "ProtectUserFromDamagingMovesKingsShield",        // King's Shield
    "ProtectUserFromTargetingMovesSpikyShield",       // Spiky Shield
    "ProtectUserSideFromMultiTargetDamagingMoves",    // Wide Guard
    "SetTargetTypesToWater",                          // Soak
    "SetTargetTypesToPsychic",                        // Magic Powder
    "TargetNextFireMoveDamagesTarget",                // Powder
    "LowerTargetSpeed1MakeTargetWeakerToFire",        // Tar Shot
    "DisableTargetStatusMoves",                       // Taunt
    "RaiseUserDefSpDef1",                             // Cosmic Power
    "RaiseUserDefense2",                              // Iron Defense
    "RaiseUserDefense3",                              // Cotton Guard
    "RaiseUserSpDef2",                                // Amnesia
    "RaiseUserEvasion2MinimizeUser",                  // Minimize
    "TwoTurnAttackRaiseUserSpAtkSpDefSpd2",           // Geomancy
    "LowerTargetEvasion1RemoveSideEffects",           // Defog
    "StartUserSideDoubleSpeed",                       // Tailwind
    "ResetAllBattlersStatStages",                     // Haze
    "InvertTargetStatStages",                         // Topsy-Turvy
    "TrapTargetInBattleLowerTargetDefSpDef1EachTurn", // Octolock
    "RaiseUserMainStats1TrapUserInBattle",            // No Retreat
    "RaiseUserAtkDefSpd1",                            // Victory Dance
    "SetUserAlliesAbilityToTargetAbility",            // Doodle
    "StartSaltCureTarget",                            // Salt Cure
    "ProtectUserFromDamagingMovesSilkTrap",           // Silk Trap
    "RaiseTargetAtkLowerTargetDef2",                  // Spicy Extract
  ];
  if (rental) {
    whitelist = whitelist.concat([
      "PowerUpAllyMove",                                // Helping Hand
      "SetTargetAbilityToInsomnia",                     // Worry Seed
      "SetUserAbilityToTargetAbility",                  // Role Play
      "NegateTargetAbility",                            // Gastro Acid
      "UseLastMoveUsed",                                // Copycat
      "TargetUsesItsLastUsedMoveAgain",                 // Instruct
      "HealTargetHalfOfTotalHP",                        // Heal Pulse
      "RedirectAllMovesToUser",                         // Follow Me, Rage Powder, etc.
      "RedirectAllMovesToTarget",                       // Spotlight
      "RaiseTargetAtkSpAtk2",                           // Decorate
      "RaiseUserAndAlliesAtkDef1",                      // Coaching
      "ProtectUser",                                    // Protect, Detect, etc.
      "ProtectUserSideFromDamagingMovesIfUserFirstTurn", // Mat Block
    ]);
  }
  return [blacklist, whitelist];
}

//-------------------------------------------------------------------------------
// Sets up potential base rewards for this raid battle.
//-------------------------------------------------------------------------------
export type RaidReward = [Id | null, number];

export function raidRewards(species: Id, rank = 1, bonus = 1, _loot: Id | null = null): RaidReward[] {
  const rewards: RaidReward[] = [];
  // Ruby's Float#round rounds halves away from zero (these are all positive).
  const qty = Math.max(1, Math.round(rank * bonus * 1.1));
  // qty80 = [1, (qty / 1.25).round].max is only used by the commented-out rewards.
  const qty50 = Math.max(1, Math.floor(qty / 2));
  const qty25 = Math.max(1, Math.floor(qty / 4));
  //---------------------------------------------------------------------------
  // Reward hash.
  //---------------------------------------------------------------------------
  const reward: Record<string, Id[]> = {
    ExpCandy: ["EXPCANDYXS", "EXPCANDYS"],
    Berries: ["POMEGBERRY", "KELPSYBERRY", "QUALOTBERRY", "HONDEWBERRY", "GREPABERRY", "TAMATOBERRY"],
    Vitamins: ["HPUP", "PROTEIN", "IRON", "CALCIUM", "ZINC", "CARBOS"],
    Training: ["PPUP", "PPMAX", "ABILITYCAPSULE", "ABILITYPATCH", "BOTTLECAP", "GOLDBOTTLECAP"],
    TreasureA: ["BALMMUSHROOM", "PEARLSTRING", "RELICGOLD", "RELICSTATUE", "RELICCROWN"],
    TreasureB: ["BIGMUSHROOM", "BIGNUGGET", "BIGPEARL", "RELICSILVER", "RELICBAND"],
    TreasureC: ["TINYMUSHROOM", "NUGGET", "PEARL", "RELICCOPPER", "RELICVASE"],
    BonusItem: ["DYNAMAXCANDY", "MAXSOUP"],
  };
  //---------------------------------------------------------------------------
  // Adds Exp. Candy rewards.
  // (The game commented out the original per-rank candy rewards, Raid_Setup.rb:432-472.)
  //---------------------------------------------------------------------------
  rewards.push([reward.ExpCandy![0]!, qty + rand(3)]);
  rewards.push([reward.ExpCandy![1]!, qty25 + rand(3)]);
  //---------------------------------------------------------------------------
  // Adds specific item rewards.
  //---------------------------------------------------------------------------
  if (rank > 2) {
    // rewards.push([:RARECANDY, qty25 + rand(1)],
    //              [:DYNAMAXCANDY, qty25 + rand(1)])
    rewards.push(["DYNAMAXCANDY", qty25 + rand(1)]);
    if (bonus >= 5) rewards.push([sample(reward.BonusItem!)!, 1]);
    const trItem = Item.getTRFromType(Species.get(species).types);
    if (trItem) rewards.push([trItem, 1]);
  }
  if (bonus > 2) {
    switch (Species.get(species).species) {
      // Max Honey
      case "VESPIQUEN": case "URSARING": case "URSALUNA":
        rewards.push(["MAXHONEY", 1]);
        break;
      // Max Mushrooms
      case "PARASECT": case "BRELOOM": case "AMOONGUS": case "SHIINOTIC": case "TOEDSCRUEL":
        rewards.push(["MAXMUSHROOMS", 1]);
        break;
      // Max Eggs
      case "CHANSEY": case "BLISSEY":
        rewards.push(["MAXEGGS", 1]);
        break;
      // Max Scales
      case "GYARADOS": case "KINGDRA": case "MILOTIC": case "LUVDISC": case "SALAMENCE": case "GARCHOMP":
        rewards.push(["MAXSCALES", 1]);
        break;
      // Max Plumage
      case "PIDGEOT": case "FEAROW": case "DODRIO": case "ARTICUNO": case "NOCTOWL": case "XATU": case "HOOH":
      case "SWELLOW": case "PELIPPER": case "STARAPTOR": case "HONCHKROW": case "CHATOT": case "UNFEZANT":
      case "SWANNA": case "BRAVIARY": case "MANDIBUZZ": case "ARCHEOPS": case "TALONFLAME": case "HAWLUCHA":
      case "DECIDUEYE": case "TOUCANNON": case "ORICORIO": case "CORVIKNIGHT": case "CRAMORANT":
      case "KILOWATTREL": case "BOMBIRDIER": case "SQUAWKABILLY":
        rewards.push(["MAXPLUMAGE", 1]);
        break;
      // Wishing Star
      case "ETERNATUS":
        rewards.push(["WISHINGSTAR", 1]);
        break;
    }
  }
  rewards.push(["ARMORITEORE", qty25 + rand(3)]);
  //---------------------------------------------------------------------------
  // Adds general rewards.
  //---------------------------------------------------------------------------
  rewards.push([sample(reward.Berries!)!, qty50 + rand(3)]);
  switch (rank) {
    case 3:
      rewards.push([sample(reward.Vitamins!)!, qty25 + rand(3)]);
      if (rand(10) < 1) rewards.push([sample(reward.TreasureC!)!, 1]);
      break;
    case 4:
      rewards.push([sample(reward.Vitamins!)!, qty25 + rand(3)]);
      if (rand(10) < 1) rewards.push([sample(reward.TreasureB!)!, 1]);
      break;
    case 5: case 6:
      rewards.push([sample(reward.Vitamins!)!, qty50 + rand(3)]);
      if (rand(10) < 1) rewards.push([sample(reward.Training!)!, 1]);
      if (rand(10) < 1) rewards.push([sample(reward.TreasureA!)!, 1]);
      break;
  }
  return rewards;
}

