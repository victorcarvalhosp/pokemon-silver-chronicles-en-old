// Port of Plugins/ZUD Mechanics/[010] Adventures/Adventure_Main.rb: the
// DynamaxAdventure class (a Dynamax Adventure: choosing the lair, the rental
// party, the lair's species, prizes and loot, and what the host says at the
// end), the $PokemonGlobal fields it keeps (raid_timer, the saved routes, the
// Endless record), and pbDynamaxAdventure / inMaxLair? / pbLoadLairMapData.
// The tile events are in Adventure_Triggers.ts (Ruby reopens the class).
//
// Saving: the PokemonGlobalMetadata fields are saved with the battle extras
// (game/battle/globalExtras.ts), Pokémon included.

import { rand } from "../../core/random";
import { assetExists } from "../../core/assets";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { pbLoadLairMapData as lairMapData } from "../../data/gameData/miscPBSData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import type { AdventureMaps } from "../../data/pbs/types";
import { DEBUG } from "../../core/debug";
import { MaxLairHooks } from "../../battle/zud/raid/maxLairHooks";
import { pbFadeOutInWithMusic } from "../../ui/fades";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { PokemonGlobalExtras, pokemonJSON } from "../battle/globalExtras";
import { pbBGMPlay, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import { Pokemon } from "../pokemon/Pokemon";
import { PokemonOwner } from "../pokemon/PokemonOwner";
import type { Player } from "../trainer/Player";
import { raidGenerateMovelists } from "../maxRaid/Raid_Setup";
import { raidGenerateSpecies, raidGenerateSpeciesList } from "../maxRaid/Raid_Ranks";
import { sample } from "../maxRaid/random";
import { pbMaxLairMenu } from "./LairMenu_Menus";
import { pbMaxLairMap } from "./MaxLair_Map";

const player = () => G.player as unknown as Player;

/** The Endless Adventure record ($PokemonGlobal.dynamax_adventure_record). */
export interface LairRecord { map: string; floor: number; battles: number; party: Pokemon[] }

declare module "../globals" {
  interface PokemonGlobalMetadata {
    /** When the raid dens were last reset (Time.now; seconds here). */
    raidTimer?: number | null;
    dynamaxAdventureState?: DynamaxAdventure | null;
    /** Saved routes: boss species => lair map index (insertion order kept). */
    dynamaxAdventureRoutes?: Record<Id, number> | null;
    dynamaxAdventureRecord?: LairRecord | null;
    dynamaxAdventureEndlessUnlocked?: boolean;
  }
}

/** Gender text colour codes of the host's lines (\b blue for male, \r red for female). */
const genderCode = (g: number | null) => (g === 0 ? "\\b" : g === 1 ? "\\r" : "");

//===============================================================================
// Core class for handling a Dynamax Adventure.
//===============================================================================
export class DynamaxAdventure {
  // Window skin used for NPC encounter text (not dialogue).
  static readonly WINDOWSKIN = "Graphics/Windowskins/sign hgss loc";

  keycount = 0;
  knockouts = 0;
  loot: Record<Id, number> = {};
  prizes: Pokemon[] = [];
  lairFloor = 1;
  battleCount = 0;
  abandoned = false;
  newRental: Pokemon | null = null;
  bossBattled = false;
  bossSpecies: Id | null = null;
  lastPokemon: Pokemon | null = null;
  lairSpecies: (Id | null)[] = [];
  darknessMap = false;
  darknessLvl: number | null = null;
  private mapName: string | null = null;
  private mapIndex: number | null = null;
  private genderText: number | null = 0;
  private _inProgress = false;
  private _endlessMode = false;
  private recordTeam: Pokemon[] = [];
  private party: Pokemon[] = [];

  clear(): void {
    //---------------------------------------------------------------------------
    // Tracks lair properties
    this.mapName = null;
    this.mapIndex = null;
    this.keycount = 0;
    this.knockouts = 0;
    //---------------------------------------------------------------------------
    // Tracks general adventure states
    this.genderText = 0;
    this.abandoned = false;
    this._inProgress = false;
    //---------------------------------------------------------------------------
    // Tracks the state of the Pokemon in the lair
    this.lairSpecies = [];
    this.lastPokemon = null;
    this.newRental = null;
    this.bossSpecies = null;
    this.bossBattled = false;
    //---------------------------------------------------------------------------
    // Tracks Endless Mode properties
    this._endlessMode = false;
    this.lairFloor = 1;
    this.battleCount = 0;
    this.recordTeam = [];
    //---------------------------------------------------------------------------
    // Tracks Dark Lair properties
    this.darknessMap = false;
    this.darknessLvl = null;
    //---------------------------------------------------------------------------
    // Used to hold things for the player
    this.loot = {};
    this.prizes = [];
    this.party = [];
  }

  constructor() { this.clear(); }
  darkLair(): boolean { return this.darknessMap; }
  endlessMode(): boolean { return this._endlessMode; }
  inProgress(): boolean { return this._inProgress; }
  /** abandoned? */
  abandonedQ(): boolean { return this.abandoned; }
  completed(): boolean { return this.bossBattled; }
  defeated(): boolean { return this.knockouts <= 0; }
  victory(): boolean { return this.completed() && !this.defeated(); }
  ended(): boolean { return this.completed() || this.defeated() || this.abandonedQ(); }

  //-----------------------------------------------------------------------------
  // Creates an encounter table of eleven species for this Dynamax Adventure.
  //-----------------------------------------------------------------------------
  generateSpecies(): void {
    this.lairSpecies.length = 0;
    for (const rank of [2, 3, 4, 6]) {
      const rankList = raidGenerateSpeciesList([], rank);
      if (rank === 6) {
        if (!this.bossSpecies) this.bossSpecies = sample(rankList);
        this.lairSpecies.push(this.bossSpecies);
      } else {
        for (const sp of this.lairSpecies) {
          const i = rankList.indexOf(sp!);
          if (i >= 0) rankList.splice(i, 1);
        }
        const tierSize = rank === 2 ? 2 : 4;
        for (let i = 0; i < tierSize; i++) {
          const species = sample(rankList);
          this.lairSpecies.push(species);
          const j = rankList.indexOf(species!);
          if (j >= 0) rankList.splice(j, 1);
        }
      }
    }
  }

  //-------------------------------------------------------------------------------
  // Creates a rental Pokemon.
  //-------------------------------------------------------------------------------
  generateRental(): Pokemon {
    const rank = this.lastPokemon ? 5 : 3;
    const species = raidGenerateSpecies([], rank);
    const scale = player().badgeCount() <= 6 ? player().badgeCount() : 6;
    const level = [10, 15, 25, 35, 45, 55, 65][scale]!;
    const owner = new PokemonOwner(player().makeForeignID(), _INTL("RENTAL"), 2, player().language);
    const pokemon = new Pokemon(species, level, owner);
    pokemon.dynamaxLvl = 5;
    pokemon.gmaxFactor = pokemon.hasGmax() && rand(10) < 5;
    const moves = raidGenerateMovelists(pokemon.speciesData().id, true);
    for (const list of moves) if (list.length > 0) pokemon.learnMove(sample(list)!);
    const odds = rand(100);
    pokemon.item = odds < 25 ? "SITRUSBERRY" : odds < 50 ? "ORANBERRY" : null;
    pokemon.abilityIndex = rand(pokemon.getAbilityList().length);
    pokemon.obtainText = _INTL("Adventure Rental.");
    pokemon.calcLairEvs();
    return pokemon;
  }

  //-----------------------------------------------------------------------------
  // Handles prizes and loot in a Dynamax Adventure.
  //-----------------------------------------------------------------------------
  async swapPokemon(): Promise<void> {
    if (this.ended() || this.completed() || !this.inProgress()) return;
    this.newRental = this.lastPokemon;
    await pbMaxLairMenu("exchange");
  }

  addPrize(pkmn: Pokemon): void {
    this.lastPokemon = pkmn;
    if (this.inProgress() && !this.ended()) this.lastPokemon.calcLairEvs();
    this.prizes.push(this.lastPokemon);
    if (this.prizes.length > 6) this.prizes.splice(this.prizes.indexOf(this.prizes[0]!), 1);
  }

  addLoot(item: Id, qty = 1): void {
    if (!Item.exists(item)) return;
    if (item in this.loot) this.loot[item]! += qty;
    else this.loot[item] = qty;
  }

  async selectPrize(): Promise<void> {
    if (!this.inProgress()) return;
    if (this.prizes.length === 0) return;
    const shinyCharm = Item.exists("SHINYCHARM") && G.bag.has("SHINYCHARM");
    const odds = shinyCharm ? rand(50) : rand(150);
    for (const poke of this.prizes) {
      switch (odds) {
        case 0: poke.shiny = true; break;
        case 1: poke.superShiny = true; break;
      }
      poke.item = null;
      poke.resetMoves();
      for (const s of Stat.eachMain()) poke.ev[s.id] = 0;
      poke.calcStats();
      poke.heal();
    }
    await pbMaxLairMenu("prize");
  }

  //-----------------------------------------------------------------------------
  // Adventure start.
  //-----------------------------------------------------------------------------
  async start(mapIndex: number | null = null, gender: number | null = null): Promise<void> {
    if (this.inProgress()) return;
    this.clear(); // initialize
    this.genderText = gender;
    const g = genderCode(this.genderText);
    if (await pbConfirmMessage(_INTL(`${g}Would you like to embark on a Dynamax Adventure?`))) {
      //-------------------------------------------------------------------------
      // Select an adventure type.
      //-------------------------------------------------------------------------
      let cmd = 0;
      const commands: string[] = [];
      this.mapIndex = mapIndex;
      if (Object.keys(lairSavedRoutes()).length > 0) {
        await pbMessage(_INTL(`${g}According to my notes, it seems you might know how to find certain special Pokémon.`));
        for (const sp of Object.keys(lairSavedRoutes())) commands.push(_INTL("Find {1}!", Species.get(sp).name));
      }
      commands.push(_INTL("Normal Adventure"));
      if (lairEndlessUnlocked()) commands.push(_INTL("Endless Adventure"));
      if (lairEndlessRecord().floor > 1) commands.push(_INTL("View Record"));
      commands.push(_INTL("Nevermind"));
      for (;;) {
        cmd = await pbMessage(_INTL(`${g}Which type of adventure are you interested in today?`), commands, -1, null, 0);
        if (cmd === -1 || cmd === commands.length - 1) {
          await pbMessage(_INTL(`${g}I hope we'll see you again soon!`));
          this.clear();
          break;
        } else {
          const c = commands[cmd];
          if (c === _INTL("Normal Adventure")) {
            this._inProgress = true;
            break;
          } else if (c === _INTL("Endless Adventure")) {
            this._inProgress = true;
            this._endlessMode = true;
            break;
          } else if (c === _INTL("View Record")) {
            await pbMaxLairMenu("record");
          } else {
            this._inProgress = true;
            const array = Object.entries(lairSavedRoutes());
            this.bossSpecies = array[cmd]![0];
            this.mapIndex = array[cmd]![1];
            break;
          }
        }
      }
      //-------------------------------------------------------------------------
      // Select a lair map.
      //-------------------------------------------------------------------------
      if (this.inProgress()) {
        const mapData = pbLoadLairMapData();
        if (this.mapIndex == null) {
          let mapCmd = 0;
          const mapIndexes: number[] = [];
          const mapCommands: string[] = [];
          const mapPath = "Graphics/Plugins/ZUD/Adventure/Maps/";
          mapData.forEach((map, i) => {
            if (!map || !assetExists(mapPath + map.Name)) return;
            if (map.DarkMap && lairEndlessRecord().floor <= 1) return;
            mapIndexes.push(i);
            mapCommands.push(_INTL("{1}", map.Name));
          });
          mapCommands.push(_INTL("Nevermind"));
          for (;;) {
            mapCmd = await pbMessage(_INTL(`${g}Which lair would you like to explore?`), mapCommands, -1, null, 0);
            if (mapCmd === -1 || mapCmd === mapCommands.length - 1) {
              this._inProgress = false;
              await pbMessage(_INTL(`${g}I hope we'll see you again soon!`));
              break;
            } else {
              this.mapIndex = mapIndexes[mapCmd]!;
              break;
            }
          }
        }
        if (this.mapIndex != null) {
          this.mapName = mapData[this.mapIndex]!.Name as string;
          this.darknessMap = !!mapData[this.mapIndex]!.DarkMap;
          await this.processAdventure();
        }
      }
    } else {
      await pbMessage(_INTL(`${g}I hope we'll see you again soon!`));
      this.clear();
    }
  }

  //-----------------------------------------------------------------------------
  // Enters and exits a Max Lair.
  //-----------------------------------------------------------------------------
  async processAdventure(): Promise<void> {
    this.party = player().party;
    await pbMaxLairMenu("rental");
    const g = genderCode(this.genderText);
    if (sameArray(player().party, this.party)) {
      await pbMessage(_INTL(`${g}I hope we'll see you again soon!`));
      this.clear();
    } else {
      if (!this.darknessMap && Settings.DARK_LAIR_FREQUENCY > 0) {
        if (Settings.DARK_LAIR_FREQUENCY === 1 && rand(100) < 5) this.darknessMap = true;
        if (Settings.DARK_LAIR_FREQUENCY === 2 && rand(100) < 20) this.darknessMap = true;
        if (Settings.DARK_LAIR_FREQUENCY === 3) this.darknessMap = true;
        if (!DEBUG && lairEndlessRecord().floor <= 1) this.darknessMap = false;
      }
      if (this.darknessMap) {
        G.stats.darkLairsEntered += 1;
        await pbMessage(_INTL(`${g}This route seems particularly treacherous - visibility will be limited!\nPlease be careful!`));
      }
      if (this.bossSpecies) {
        const bossName = Species.get(this.bossSpecies).name;
        await pbMessage(_INTL(`${g}Good luck on your search for {1}!`, bossName));
      } else {
        await pbMessage(_INTL(`${g}Good luck on your adventure!`));
      }
      G.stats.maxLairsEntered += 1;
      if (this.endlessMode()) G.stats.endlessLairsEntered += 1;
      pbSEPlay("Door enter");
      this.knockouts = player().party.length;
      const previousBGM = G.gameSystem.getPlayingBGM();
      await pbFadeOutInWithMusic(async () => {
        for (;;) {
          this.generateSpecies();
          await pbMaxLairMap(this.mapIndex!);
          if (this.ended()) break;
        }
        this.recordTeam = player().party;
        for (const p of this.recordTeam) p.heal();
        player().party = this.party;
        await this.selectPrize();
      });
      if (previousBGM) pbBGMPlay(previousBGM);
      await this.lairExit();
    }
  }

  //-----------------------------------------------------------------------------
  // Adventure end.
  //-----------------------------------------------------------------------------
  async lairExit(): Promise<void> {
    if (!this.inProgress()) return;
    const g = genderCode(this.genderText);
    if (this.abandonedQ()) {
      await pbMessage(_INTL(`${g}Huh, you're giving up?\nPlease come back any time for a new adventure!`));
    //---------------------------------------------------------------------------
    // Endless mode
    //---------------------------------------------------------------------------
    } else if (this.endlessMode()) {
      if (this.lairFloor > lairEndlessRecord().floor) {
        G.stats.endlessLairRecords += 1;
        await pbMessage(_INTL(`${g}Now THAT is what I call a fine performance! You set a new record! I keep track, you know.`));
        G.pokemonGlobal.dynamaxAdventureRecord = {
          map: this.mapName!,
          floor: this.lairFloor,
          battles: this.battleCount,
          party: this.recordTeam,
        };
        await pbMaxLairMenu("record");
        if (Object.keys(this.loot).length > 0) {
          await pbMessage(_INTL(`${g}I'll add any treasure you acquired during your adventure to your bag.`));
          for (const [item, qty] of Object.entries(this.loot)) G.bag.add(item, qty);
        }
      } else {
        await pbMessage(_INTL(`${g}Didn't make it quite far this time, eh?\nThat's ok, better luck next time!`));
        await this.salvageLoot(g);
      }
    //---------------------------------------------------------------------------
    // Defeat
    //---------------------------------------------------------------------------
    } else if (this.defeated()) {
      let bossname = Species.get(this.bossSpecies!).name;
      await pbMessage(_INTL(`${g}Well done facing such a tough opponent!\nVictory seemed so close - I could almost taste it!`));
      if (this.bossBattled && !(this.bossSpecies! in lairSavedRoutes())) {
        bossname = Species.get(this.bossSpecies!).name;
        if (await pbConfirmMessage(_INTL(`${g}Would you like me to jot down where you found {1} this time so that you might find it again?`, bossname))) {
          if (Object.keys(lairSavedRoutes()).length >= 3) {
            await pbMessage(_INTL(`${g}You already have the maximum number of routes saved...`));
            if (await pbConfirmMessage(_INTL(`${g}Would you like to replace an existing route?`))) {
              let cmd = 0;
              const commands: string[] = [];
              for (const sp of Object.keys(lairSavedRoutes())) commands.push(Species.get(sp).name);
              commands.push(_INTL("Nevermind"));
              for (;;) {
                cmd = await pbMessage(_INTL(`${g}Which route should be replaced?`), commands, -1, null, 0);
                if (cmd === -1 || cmd === commands.length - 1) break;
                const array = Object.entries(G.pokemonGlobal.dynamaxAdventureRoutes!);
                array.splice(cmd, 1);
                array.push([this.bossSpecies!, this.mapIndex!]);
                G.pokemonGlobal.dynamaxAdventureRoutes = Object.fromEntries(array);
                await pbMessage(_INTL(`${g}The route to {1} was saved for future reference.`, bossname));
                break;
              }
            }
          } else {
            G.pokemonGlobal.dynamaxAdventureRoutes![this.bossSpecies!] = this.mapIndex!;
            await pbMessage(_INTL(`${g}The route to {1} was saved for future reference.`, bossname));
          }
        }
      }
      await this.salvageLoot(g);
    //---------------------------------------------------------------------------
    // Victory
    //---------------------------------------------------------------------------
    } else if (this.victory()) {
      G.stats.maxLairsCleared += 1;
      if (this.bossSpecies! in lairSavedRoutes()) delete G.pokemonGlobal.dynamaxAdventureRoutes![this.bossSpecies!];
      await pbMessage(_INTL(`${g}Well done defeating that tough opponent!`));
      if (Object.keys(this.loot).length > 0) {
        await pbMessage(_INTL(`${g}I'll add any treasure you acquired during your adventure to your bag.`));
        for (const [item, qty] of Object.entries(this.loot)) G.bag.add(item, qty);
      }
      if (!lairEndlessUnlocked()) {
        await pbMessage(_INTL(`${g}Hey, you seem good at this - maybe next time you'll want to try diving even deeper into the lair?`));
        await pbMessage(_INTL(`${g}Try your luck at an Endless Adventure and see what you're really made of!`));
        G.pokemonGlobal.dynamaxAdventureEndlessUnlocked = true;
      }
    }
    await pbMessage(_INTL(`${g}I hope we'll see you again soon!`));
    this.clear();
  }

  /** The "salvaged some of the treasure" block (each item kept on a coin flip). */
  private async salvageLoot(g: string): Promise<void> {
    if (Object.keys(this.loot).length === 0) return;
    let lootAdded = false;
    for (const [item, qty] of Object.entries(this.loot)) {
      if (rand(2) < 1) continue;
      G.bag.add(item, qty);
      lootAdded = true;
    }
    if (lootAdded) {
      await pbMessage(_INTL(`${g}I managed to salvage some of the treasure you acquired during your adventure...`));
      await pbMessage(_INTL(`${g}I'll add what I was able to recover to your bag.`));
    }
  }

  //-----------------------------------------------------------------------------
  // Saving ($PokemonGlobal.dynamax_adventure_state is marshalled whole in Ruby).
  //-----------------------------------------------------------------------------
  toJSON(): Record<string, unknown> {
    return pokemonJSON.save({ ...this }) as Record<string, unknown>;
  }

  static fromJSON(json: unknown): DynamaxAdventure {
    const a = new DynamaxAdventure();
    Object.assign(a, pokemonJSON.load(json));
    return a;
  }
}

/** Ruby's Array#== on two parties. */
function sameArray(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

//===============================================================================
// Various utilities used for Dynamax Adventure functions.
//===============================================================================
/** lair_SavedRoutes */
export function lairSavedRoutes(): Record<Id, number> {
  const g = G.pokemonGlobal;
  if (!g.dynamaxAdventureRoutes) g.dynamaxAdventureRoutes = {};
  return g.dynamaxAdventureRoutes;
}

/** lair_EndlessRecord */
export function lairEndlessRecord(): LairRecord {
  const g = G.pokemonGlobal;
  if (!g.dynamaxAdventureRecord) g.dynamaxAdventureRecord = { map: "", floor: 1, battles: 0, party: [] };
  return g.dynamaxAdventureRecord;
}

/** lair_EndlessUnlocked? */
export function lairEndlessUnlocked(): boolean {
  return !!G.pokemonGlobal.dynamaxAdventureEndlessUnlocked;
}

/** pbDynamaxAdventure */
export function pbDynamaxAdventure(): DynamaxAdventure {
  const g = G.pokemonGlobal;
  if (!g.dynamaxAdventureState) g.dynamaxAdventureState = new DynamaxAdventure();
  return g.dynamaxAdventureState;
}

/** inMaxLair? */
export function inMaxLair(): boolean {
  return pbDynamaxAdventure().inProgress();
}

/** pbLoadLairMapData (Data/adventure_maps.dat) */
export function pbLoadLairMapData(): AdventureMaps {
  return lairMapData();
}

// The battle code's view of the adventure (battle/zud/raid/maxLairHooks.ts).
MaxLairHooks.inMaxLair = () => (G.pokemonGlobal ? inMaxLair() : false);
MaxLairHooks.adventure = () => pbDynamaxAdventure();

PokemonGlobalExtras.register("raidTimer");
PokemonGlobalExtras.register("dynamaxAdventureState", {
  save: (v) => (v as DynamaxAdventure).toJSON(),
  load: (v) => DynamaxAdventure.fromJSON(v),
});
PokemonGlobalExtras.register("dynamaxAdventureRoutes");
PokemonGlobalExtras.register("dynamaxAdventureRecord", pokemonJSON);
PokemonGlobalExtras.register("dynamaxAdventureEndlessUnlocked");
