// Port of Essentials Deluxe's [002] Battle Deluxe/Battle_Deluxe.rb:68-337,
// 494-674: deluxe battles. TrainerBattle.dx_start(foes, rules, midbattle) and
// WildBattle.dx_start(foes, rules, pokemon, midbattle) set
// $game_temp.dx_rules / dx_pokemon / dx_midbattle, apply the rules as battle
// rules (pbApplyBattleRules), modify the wild Pokémon (pbApplyWildAttributes)
// and run the battle, then clear everything (Game_Temp#dx_clear). The rest of
// the file is elsewhere: the [:introtext] rule in Battle_StartAndEnd.ts, the
// [:setcapture] rule in CatchAndStoreMixin.ts, pbRaidStyleCapture and
// wild_boss_flee in Battler_ChangeSelf.ts.
//
// The hashes use Ruby's keys (rules.canlose, pokemon.first...) with Ruby
// Symbols as Syms (rubyData.ts); a midbattle script may also be the name of a
// preset of Midbattle_Config.ts (a Sym, e.g. sym("DEMO_VS_OPAL")).
//
// No event in this game starts a deluxe battle; the scripts below are for
// hand-ported event code (defineRubyScript).

import { rand } from "../../core/random";
import { assetExists } from "../../core/assets";
import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { Environment } from "../../data/gameData/environment";
import type { Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { battleRules, clearBattleRules, setBattleRule, TrainerBattle, WildBattle } from "../../game/battle/BattleStarting";
import { G } from "../../game/globals";
import { defineScript } from "../../game/scriptApi";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import { PokemonOwner } from "../../game/pokemon/PokemonOwner";
import type { Player } from "../../game/trainer/Player";
import { NPCTrainer } from "../../game/trainer/Trainer";
import { pbDeregisterPartner, pbRegisterPartner } from "../../game/trainers/trainerEvents";
import { dxClear, setDxMidbattle, setDxPokemon, setDxRules } from "./DeluxeTemp";
import { EssentialsDeluxe } from "./Midbattle_Config";
import { idOf, isSym } from "./rubyData";
import { inMaxLair } from "../zud/raid/maxLairHooks";

type DxHash = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHash = Record<string, any>;

const player = (): Player => G.player as unknown as Player;
/** Array#sample outside battle (Kernel#rand). */
const sample = <T>(arr: readonly T[]): T | undefined => (arr.length === 0 ? undefined : arr[rand(arr.length)]);

/** A preset named by a Symbol becomes a copy of it (hasConst?(EssentialsDeluxe, ...)). */
function resolveMidbattle(): void {
  const m = G.gameTemp.dxMidbattle as unknown;
  if (isSym(m) && m.name in EssentialsDeluxe) setDxMidbattle({ ...EssentialsDeluxe[m.name] });
}

//===============================================================================
// Initiates battles with deluxe settings.
//===============================================================================
export const DeluxeBattle = {
  /** TrainerBattle.dx_start(foes, rules = {}, midbattle = {}) */
  async trainerStart(foes: unknown[], rules: DxHash = {}, midbattle: unknown = {}): Promise<boolean> {
    setDxRules(rules);
    setDxMidbattle(midbattle);
    rules.rank = null;
    if (!rules.outcome) rules.outcome = 1;
    let foeSize = 0;
    for (const f of foes) if (Array.isArray(f) || isSym(f) || f instanceof NPCTrainer) foeSize += 1;
    const oldTrainer: [string, number, Pokemon[]] = [player().name, player().outfit, player().party];
    pbApplyBattleRules(foeSize);
    resolveMidbattle();
    const outcome = await TrainerBattle.start(foes.map((f) => (isSym(f) ? f.name : f)) as never);
    if (rules.player) {
      player().name = oldTrainer[0];
      player().outfit = oldTrainer[1];
    }
    if (rules.party) player().party = oldTrainer[2];
    dxClear(clearBattleRules, pbDeregisterPartner);
    return outcome;
  },

  /** WildBattle.dx_start(foes, rules = {}, pokemon = {}, midbattle = {}) */
  async wildStart(foes: unknown[], rules: DxHash = {}, pokemon: DxHash = {}, midbattle: unknown = {}): Promise<boolean> {
    setDxRules(rules);
    setDxPokemon(pokemon);
    setDxMidbattle(midbattle);
    rules.rank = null;
    if (!rules.outcome) rules.outcome = 1;
    let foeSize = 0;
    for (const f of foes) if (Array.isArray(f) || isSym(f) || f instanceof Pokemon) foeSize += 1;
    const oldTrainer: [string, number, Pokemon[]] = [player().name, player().outfit, player().party];
    pbApplyBattleRules(foeSize, true);
    const pkmn: Pokemon[] = [];
    let species: Id | null = null;
    let level: number | null = null;
    for (const foe of foes) {
      if (foe instanceof Pokemon) pkmn.push(foe);
      else if (isSym(foe)) species = foe.name;
      else if (typeof foe === "number" && Number.isInteger(foe)) level = foe;
      if (species && level) {
        if (!Species.exists(species)) continue;
        if (!(level >= 1 && level <= GrowthRate.maxLevel())) continue;
        pkmn.push(new Pokemon(species, level));
        species = level = null;
      }
    }
    pbApplyWildAttributes(pkmn);
    resolveMidbattle();
    const outcome = await WildBattle.start(pkmn, false);
    if (rules.player) {
      player().name = oldTrainer[0];
      player().outfit = oldTrainer[1];
    }
    if (rules.party) player().party = oldTrainer[2];
    dxClear(clearBattleRules, pbDeregisterPartner);
    return outcome;
  },
};

//===============================================================================
// Applies all battle rules for the next battle.
//===============================================================================
export function pbApplyBattleRules(foeside: number, wildbattle = false): void {
  const rules = G.gameTemp.dxRules as AnyHash;
  //---------------------------------------------------------------------------
  // General rules.
  //---------------------------------------------------------------------------
  if (rules.setmode) setBattleRule("setStyle");
  if (rules.canlose) setBattleRule("canLose");
  if (rules.noexp) setBattleRule("noexp");
  if (rules.nomoney) setBattleRule("nomoney");
  if (rules.nopartner) setBattleRule("nopartner");
  setBattleRule("outcomeVar", rules.outcome);
  //---------------------------------------------------------------------------
  // Wild Battle-only rules.
  //---------------------------------------------------------------------------
  if (wildbattle && rules.noflee) setBattleRule("cannotRun");
  if (wildbattle && rules.nocapture) setBattleRule("disablePokeBalls");
  if (wildbattle && rules.catchtoparty) setBattleRule("forceCatchIntoParty");
  //---------------------------------------------------------------------------
  // Temporarily changes the player character's name and/or outfit.
  //---------------------------------------------------------------------------
  if (rules.player) {
    const set = (tr: unknown) => {
      if (typeof tr === "string") player().name = tr;
      else if (typeof tr === "number" && Number.isInteger(tr)) player().outfit = tr;
    };
    if (Array.isArray(rules.player)) rules.player.forEach(set);
    else set(rules.player);
  }
  //---------------------------------------------------------------------------
  // Sets the player's temporary party.
  //---------------------------------------------------------------------------
  if (rules.party) {
    const newparty: Pokemon[] = [];
    let species: Id | null = null;
    for (const data of rules.party as unknown[]) {
      if (data instanceof Pokemon) {
        newparty.push(data);
      } else if (isSym(data)) {
        if (!Species.exists(data.name)) continue;
        species = data.name;
      } else if (typeof data === "number" && Number.isInteger(data)) {
        if (!species) continue;
        newparty.push(new Pokemon(species, data));
        species = null;
      }
    }
    if (newparty.length > 0) player().party = newparty;
  }
  //---------------------------------------------------------------------------
  // Sets partner trainer.
  //---------------------------------------------------------------------------
  if (Array.isArray(rules.partner)) {
    const [trType, trName, trId] = rules.partner as [unknown, string, number?];
    pbRegisterPartner(idOf(trType)!, trName, trId ?? 0);
    setBattleRule("double");
  }
  //---------------------------------------------------------------------------
  // Sets the battle size.
  // Caps out at 3, and scales down if the player doesn't have enough viable
  // Pokemon to meet the set size.
  //---------------------------------------------------------------------------
  if (typeof rules.size === "string") {
    setBattleRule(rules.size);
  } else if (typeof rules.size === "number") {
    if (rules.size < 1) rules.size = 1;
    if (rules.size > 3) rules.size = 3;
    if (rules.size > player().ablePokemonCount()) {
      while (rules.size !== player().ablePokemonCount()) rules.size -= 1;
    }
  } else {
    rules.size = foeside;
  }
  if (battleRules()["size"] == null) setBattleRule(`${rules.size}v${foeside}`);
  //---------------------------------------------------------------------------
  // Sets weather.
  // Randomizes weather if set to :random. Converts primordial weathers to normal ones.
  //---------------------------------------------------------------------------
  if (isSym(rules.weather, "Random")) rules.weather = sample(BattleWeather.keys());
  switch (idOf(rules.weather)) {
    case "HarshSun": rules.weather = "Sun"; break;
    case "HeavyRain": rules.weather = "Rain"; break;
    case "StrongWinds": rules.weather = null; break;
    case "None": rules.weather = null; break;
  }
  if (rules.weather) setBattleRule("weather", idOf(rules.weather));
  //---------------------------------------------------------------------------
  // Sets terrain.
  // Randomizes terrain if set to :random.
  //---------------------------------------------------------------------------
  if (isSym(rules.terrain, "Random")) rules.terrain = sample(BattleTerrain.keys());
  if (idOf(rules.terrain) === "None") rules.terrain = null;
  if (rules.terrain) setBattleRule("terrain", idOf(rules.terrain));
  //---------------------------------------------------------------------------
  // Sets environment.
  // Randomizes environment if set to :random. Backdrop changes to suit the environment.
  //---------------------------------------------------------------------------
  if (isSym(rules.environ, "Random")) rules.environ = sample(Environment.keys());
  if (rules.environ) pbSetBackdrop(idOf(rules.environ)!);
  //---------------------------------------------------------------------------
  // Sets the backdrop and bases.
  //---------------------------------------------------------------------------
  if (rules.backdrop) {
    let bg: string, base: string | null;
    if (Array.isArray(rules.backdrop)) [bg, base] = [rules.backdrop[0], rules.backdrop[1] ?? null];
    else bg = base = rules.backdrop;
    if (assetExists(`Graphics/Battlebacks/${bg}_bg`)) setBattleRule("backdrop", bg);
    if (base && assetExists(`Graphics/Battlebacks/${base}_base0`)) setBattleRule("base", base);
  }
  //---------------------------------------------------------------------------
  // Sets raid battle rules. (ZUD Mechanics' MaxRaidBattle.start sets a rank;
  // dx_start sets rules[:rank] = nil.)
  //---------------------------------------------------------------------------
  if (rules.rank) {
    const pokemon = G.gameTemp.dxPokemon as AnyHash;
    if (!rules.bgm) {
      let raidMusic = rules.rank === 6 ? "Battle! Legendary Raid" : "Battle! Max Raid";
      if (idOf(pokemon.species) === "ETERNATUS") raidMusic = "Battle! Eternatus - Phase 2";
      rules.bgm = raidMusic;
    }
    if (inMaxLair()) rules.hard = false;
    if (rules.autoscale) {
      // (Integer arithmetic: ((level + 5) / 10 * size).ceil + 1)
      if (rules.size < 3 && pokemon.level > 20) rules.turns += Math.floor((pokemon.level + 5) / 10) * rules.size + 1;
      if (pokemon.level > 55) rules.kocount -= 1;
      for (const i of [25, 35, 45, 55, 65]) if (pokemon.level > i) rules.shield += 1;
      if (rules.hard || pokemon.level > 70) rules.shield += 1;
    }
    if (rules.turns < 5) rules.turns = 5;
    if (rules.turns > 25) rules.turns = 25;
    if (rules.kocount < 1 || rules.size === 1) rules.kocount = 1;
    if (rules.kocount > 6) rules.kocount = 6;
    if (rules.shield < 1) rules.shield = 1;
    if (rules.shield > 8) rules.shield = 8;
    rules.timer_bonus = rules.turns;
    if (!("perfect_bonus" in rules)) rules.perfect_bonus = true;
    rules.fairness_bonus = true;
  }
  if (rules.hard && !rules.rank) rules.hard = null;
  //---------------------------------------------------------------------------
  // Sets battle music.
  //---------------------------------------------------------------------------
  const global = G.pokemonGlobal as unknown as { nextBattleVictoryBGM: unknown; nextBattleBGM: unknown };
  if (isSym(rules.victory, "None")) global.nextBattleVictoryBGM = "";
  else if (typeof rules.victory === "string") global.nextBattleVictoryBGM = rules.victory;
  if (typeof rules.bgm === "string") global.nextBattleBGM = rules.bgm;
  //---------------------------------------------------------------------------
  // Sets rules for special battle mechanics.
  //---------------------------------------------------------------------------
  if (rules.nomega) G.gameSwitches.set(Settings.NO_MEGA_EVOLUTION, true);
  // PluginManager.installed?("ZUD Mechanics")
  if (rules.nozmove) G.gameSwitches.set(Settings.NO_Z_MOVE, true);
  if (rules.noultra) G.gameSwitches.set(Settings.NO_ULTRA_BURST, true);
  if (rules.nodynamax) G.gameSwitches.set(Settings.NO_DYNAMAX, true);
  // (PLA Battle Styles, Terastal Phenomenon, Pokémon Birthsigns and Focus
  // Meter System aren't installed.)
}

//===============================================================================
// Edits environment and background settings with the [:environ] rule.
//===============================================================================
export function pbSetBackdrop(environment: Id): void {
  if (!Environment.exists(environment)) return;
  let bg = "", base = "";
  switch (environment) {
    case "None": bg = base = "city"; break;
    case "Grass": case "TallGrass": bg = "field"; base = "grass"; break;
    case "MovingWater": case "StillWater": bg = base = "water"; break;
    case "Puddle": bg = "water"; base = "puddle"; break;
    case "Underwater": bg = base = "underwater"; break;
    case "Cave": bg = base = "cave3"; break;
    case "Rock": bg = base = "rocky"; break;
    case "Volcano": bg = base = "rocky"; break;
    case "Sand": bg = "rocky"; base = "sand"; break;
    case "Forest": bg = base = "forest"; break;
    case "ForestGrass": bg = "forest"; base = "grass"; break;
    case "Snow": bg = base = "snow"; break;
    case "Ice": bg = "snow"; base = "ice"; break;
    case "Graveyard": bg = base = "distortion"; break;
    case "Sky": bg = base = "sky"; break;
    case "Space": bg = base = "space"; break;
    case "UltraSpace": bg = base = "ultraspace"; break;
  }
  setBattleRule("environ", environment);
  // NOTE (Ruby parity): the checks are swapped (Battle_Deluxe.rb:518-519): the
  // base is set if the backdrop exists and the backdrop if the base exists.
  if (assetExists(`Graphics/Battlebacks/${bg}_bg`)) setBattleRule("base", base);
  if (assetExists(`Graphics/Battlebacks/${base}_base0`)) setBattleRule("backdrop", bg);
}

//===============================================================================
// Applies wild Pokemon settings for the next wild battle.
//===============================================================================
export function pbApplyWildAttributes(pkmn: Pokemon[]): void {
  //---------------------------------------------------------------------------
  // Gets the appropriate Pokemon to modify.
  //---------------------------------------------------------------------------
  const multiple = pkmn.length > 1;
  const settings = G.gameTemp.dxPokemon as AnyHash;
  for (const order of Object.keys(settings)) {
    let pokemon: Pokemon | undefined;
    let h: AnyHash | undefined;
    if (multiple) {
      switch (order) {
        case "first": pokemon = pkmn[0]; break;
        case "second": pokemon = pkmn[1]; break;
        case "third": pokemon = pkmn[2]; break;
      }
      h = settings[order];
    } else {
      pokemon = pkmn[0];
      h = settings;
    }
    if (!pokemon || !h) continue;
    //-------------------------------------------------------------------------
    // Modifies each Pokemon. Sets form first to ensure nothing is overridden.
    //-------------------------------------------------------------------------
    if (isSym(h.form)) {
      const totalForms = [0];
      for (const s of Species.each()) if (s.species === pokemon.species) totalForms.push(s.form);
      pokemon.form = sample(totalForms)!;
    } else if (typeof h.form === "number") {
      pokemon.form = h.form;
    }
    for (const attribute of Object.keys(h)) {
      const v = h[attribute];
      switch (attribute) {
        //---------------------------------------------------------------------
        // Sets status.
        case "status":
          pokemon.status = idOf(v)!;
          if (idOf(v) === "SLEEP") pokemon.statusCount = 3;
          break;
        //---------------------------------------------------------------------
        // Sets owner info.
        case "owner":
          if (v instanceof PokemonOwner) pokemon.owner = v;
          else if (v instanceof NPCTrainer) pokemon.owner = PokemonOwner.newFromTrainer(v);
          else if (Array.isArray(v)) pokemon.owner = new PokemonOwner(v[0], v[1], v[2], v[3]);
          break;
        //---------------------------------------------------------------------
        // Sets general attributes.
        case "name": pokemon.name = v; break;
        case "level": pokemon.level = v; break;
        case "gender": pokemon.gender = v; break;
        case "nature": pokemon.nature = idOf(v); break;
        case "item": pokemon.item = idOf(v); break;
        case "shiny": pokemon.shiny = v; break;
        case "supershiny": pokemon.superShiny = v; break;
        case "happiness": pokemon.happiness = v; break;
        case "obtaintext": pokemon.obtainText = v; break;
        case "pokerus": if (v) pokemon.givePokerus(); break;
        case "shadow": if (v) pokemon.makeShadow(); break;
        //---------------------------------------------------------------------
        // Sets an Ability or an Ability Index.
        case "ability":
          if (isSym(v)) pokemon.ability = v.name;
          else pokemon.abilityIndex = v;
          break;
        //---------------------------------------------------------------------
        // Sets a move, or an array of moves.
        case "move": case "moves":
          if (Array.isArray(v)) {
            for (const m of v) pokemon.learnMove(m instanceof PokemonMove ? m.id : idOf(m)!);
          } else {
            pokemon.learnMove(idOf(v)!);
          }
          break;
        //---------------------------------------------------------------------
        // Sets all IV's to a number, or an array of numbers.
        case "iv": case "ivs":
          for (const s of Stat.eachMain()) pokemon.iv[s.id] = Array.isArray(v) ? v[s.pbsOrder] : v;
          pokemon.calcStats();
          break;
        //---------------------------------------------------------------------
        // Sets all EV's to a number, or an array of numbers.
        case "ev": case "evs":
          for (const s of Stat.eachMain()) pokemon.ev[s.id] = Array.isArray(v) ? v[s.pbsOrder] : v;
          pokemon.calcStats();
          break;
        //---------------------------------------------------------------------
        // Sets a particular ribbon, or an array of ribbons.
        case "ribbon": case "ribbons": case "mark": case "marks":
          if (Array.isArray(v)) for (const r of v) pokemon.giveRibbon(idOf(r)!);
          else pokemon.giveRibbon(idOf(v)!);
          break;
        //---------------------------------------------------------------------
        // Sets plugin-specific attributes.
        case "size": pokemon.scale = v; break;
        case "ace": pokemon.ace = v; break;
        // ZUD Mechanics
        case "dynamaxlvl": pokemon.raidDmaxLvl = v; break;
        case "gmaxfactor": pokemon.gmaxFactor = v; break;
        case "nodynamax": pokemon.dynamaxAble = false; break;
        // (:memento, :focus, :birthsign, :blessed, :celestial, :teratype,
        // :mastery: their plugins aren't installed.)
      }
    }
    //-------------------------------------------------------------------------
    // Sets HP.
    //-------------------------------------------------------------------------
    if (h.hp) {
      // NOTE (Ruby parity): `(pokemon.hp / pkmn_hash[:hp]).ceil` divides
      // Integers, so the .ceil does nothing (Battle_Deluxe.rb:657).
      pokemon.hp = Math.floor(pokemon.hp / h.hp);
      if (pokemon.hp <= 0) pokemon.hp = 1;
      pokemon.calcStats();
    }
    //-------------------------------------------------------------------------
    // Sets Dynamax. (ZUD Mechanics)
    //-------------------------------------------------------------------------
    if (h.dynamax && pokemon.dynamaxAble) {
      pokemon.dynamax = true;
      pokemon.calcStats();
      if (!h.hp) pokemon.hp = pokemon.totalhp;
      pokemon.reversion = true;
    } else {
      pokemon.calcStats();
    }
    if (!multiple) break;
  }
}

// Event scripts: TrainerBattle.dx_start / WildBattle.dx_start (for hand-ported
// event code; the converter turns Ruby hashes into nothing it can call).
defineScript("TrainerBattle.dx_start", (_c, foes, rules, midbattle) =>
  DeluxeBattle.trainerStart(foes as unknown[], (rules ?? {}) as DxHash, midbattle ?? {}));
defineScript("WildBattle.dx_start", (_c, foes, rules, pokemon, midbattle) =>
  DeluxeBattle.wildStart(foes as unknown[], (rules ?? {}) as DxHash, (pokemon ?? {}) as DxHash, midbattle ?? {}));
