// Port of Data/Scripts/012_Overworld/007_Overworld_DayCare.rb (DayCare,
// DayCare::EggGenerator, DayCare::DayCareSlot, the :update_day_care step
// handler and the deprecated pbDayCare* methods), with the plugins that patch
// it, in load order:
// - v20.1 Hotfixes (Misc bug fixes.rb:711, 733): fixed inherit_ability and
//   inherit_IVs;
// - Essentials Deluxe ([000] Essentials Patches/Pokemon.rb:155): generate
//   treats the Ancestor egg group like Ditto (fluid_egg_group?);
// - Following Pokemon EX (Script Additions/Refresh.rb:130): DayCare.deposit
//   refreshes the follower.
//
// $PokemonGlobal.day_care is kept outside PokemonGlobalMetadata's plain
// snapshot (it holds Pokémon) and saved as its own SaveData value, "day_care".
//
// Randomness: Kernel#rand is core/random's rand; Array#sample is sample()
// (`arr[rand(arr.length)]`) and Array#sample(n) is sampleN() (a partial
// Fisher-Yates shuffle), which the Ruby reference harness
// (tools/ruby-ref/lifecycle_reference.rb) installs in place of Ruby's own.

import { rand } from "../../core/random";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { pbMessage } from "../../ui/messages";
import { EventHandlers } from "../eventHandlers";
import { FollowingPkmn } from "../following/FollowingPkmn";
import { G, PokemonGlobalMetadata } from "../globals";
import { MultipleForms } from "../pokemon/formHandlers";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { SaveData } from "../save/SaveData";

const player = () => G.player as unknown as Player;

/** Array#sample */
export function sample<T>(arr: readonly T[]): T | undefined {
  return arr.length > 0 ? arr[rand(arr.length)] : undefined;
}

/** Array#sample(n) */
export function sampleN<T>(arr: readonly T[], n: number): T[] {
  const a = [...arr];
  const count = Math.min(n, a.length);
  for (let i = 0; i < count; i++) {
    const j = i + rand(a.length - i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, Math.max(count, 0));
}

/** Settings computed from MECHANICS_GENERATION = 8 when 001_Settings.rb loads. */
const DAY_CARE_POKEMON_GAIN_EXP_FROM_WALKING = true;
const DAY_CARE_POKEMON_CAN_SHARE_EGG_MOVES = Settings.MECHANICS_GENERATION >= 8;
const BREEDING_CAN_INHERIT_MACHINE_MOVES = Settings.MECHANICS_GENERATION <= 5;
const BREEDING_CAN_INHERIT_EGG_MOVES_FROM_MOTHER = Settings.MECHANICS_GENERATION >= 6;
/** Settings::MECHANICS_GENERATION read while the game runs (the Generation 9 Pack sets it to 9). */
const MECHANICS_GENERATION = Settings.MECHANICS_GENERATION_AT_RUNTIME;

/** [pokemon, is in a fluid egg group (Ditto/Ancestor), is related to the egg's species] */
type ParentData = [Pokemon, boolean, boolean?];

/** Essentials Deluxe: fluid_egg_group?(groups) */
export function fluidEggGroup(groups: readonly Id[]): boolean {
  return groups.includes("Ditto") || groups.includes("Ancestor");
}

export class DayCare {
  //=============================================================================
  // Code that generates an egg based on two given Pokémon.
  //=============================================================================
  static EggGenerator = {
    /** generate(mother, father), as Essentials Deluxe rewrites it. */
    generate(mother: Pokemon, father: Pokemon): Pokemon {
      const E = DayCare.EggGenerator;
      // Determine which Pokémon is the mother and which is the father
      if (mother.male() || father.female() || mother.genderless()) [mother, father] = [father, mother];
      const motherData: ParentData = [mother, fluidEggGroup(mother.speciesData().eggGroups)];
      const fatherData: ParentData = [father, fluidEggGroup(father.speciesData().eggGroups)];
      // Determine which parent the egg's species is based from
      const speciesParent = motherData[1] ? father : mother;
      // Determine the egg's species
      const babySpecies = E.determineEggSpecies(speciesParent.species, mother, father);
      motherData.push(mother.speciesData().breedingCanProduce(babySpecies));
      fatherData.push(father.speciesData().breedingCanProduce(babySpecies));
      // Generate egg
      const egg = E.generateBasicEgg(babySpecies);
      // Inherit properties from parent(s)
      E.inheritForm(egg, speciesParent, motherData, fatherData);
      E.inheritNature(egg, mother, father);
      E.inheritAbility(egg, motherData, fatherData);
      E.inheritMoves(egg, motherData, fatherData);
      E.inheritIVs(egg, mother, father);
      E.inheritPokeBall(egg, motherData, fatherData);
      // (inherit_birthsign: "Pokémon Birthsigns" isn't installed)
      // Calculate other properties of the egg
      E.setShininess(egg, mother, father); // Masuda method and Shiny Charm
      E.setPokerus(egg);
      // Recalculate egg's stats
      egg.calcStats();
      return egg;
    },

    determineEggSpecies(parentSpecies: Id, mother: Pokemon, father: Pokemon): Id {
      let ret = Species.get(parentSpecies).getBabySpecies(true, mother.itemId, father.itemId);
      // Check for alternate offspring (i.e. Nidoran M/F, Volbeat/Illumise, Manaphy/Phione)
      const offspring = Species.get(ret).offspring;
      if (offspring.length > 0) ret = sample(offspring)!;
      return ret;
    },

    generateBasicEgg(species: Id): Pokemon {
      const egg = new Pokemon(species, Settings.EGG_LEVEL);
      egg.name = _INTL("Egg");
      egg.stepsToHatch = egg.speciesData().hatchSteps;
      egg.obtainText = _INTL("Day-Care Couple");
      egg.happiness = 120;
      if (species === "SINISTEA") egg.form = 0;
      // Set regional form
      const newForm = MultipleForms.call("getFormOnEggCreation", egg) as number | null | undefined;
      if (newForm) egg.form = newForm;
      return egg;
    },

    inheritForm(egg: Pokemon, speciesParent: Pokemon, mother: ParentData, father: ParentData): void {
      // Inherit form from the parent that determined the egg's species
      if (speciesParent.speciesData().hasFlag("InheritFormFromMother")) egg.form = speciesParent.form;
      // Inherit form from a parent holding an Ever Stone
      for (const parent of [mother, father]) {
        if (!parent[2]) continue; // Parent isn't a related species to the egg
        if (!parent[0].speciesData().hasFlag("InheritFormWithEverStone")) continue;
        if (!parent[0].hasItem("EVERSTONE")) continue;
        egg.form = parent[0].form;
        break;
      }
    },

    getMovesToInherit(egg: Pokemon, mother: ParentData, father: ParentData): Id[] {
      const moveFather = father[1] ? mother[0] : father[0];
      const moveMother = father[1] ? father[0] : mother[0];
      const moves: Id[] = [];
      // Get level-up moves known by both parents
      for (const move of egg.getMoveList()) {
        if (move.level <= egg.level) continue; // Could already know this move by default
        if (!mother[0].hasMove(move.move) || !father[0].hasMove(move.move)) continue;
        moves.push(move.move);
      }
      // Inherit Machine moves from father (or non-Ditto genderless parent)
      if (BREEDING_CAN_INHERIT_MACHINE_MOVES && !moveFather.female()) {
        for (const i of Item.each<Item>()) {
          const move = i.move;
          if (!move) continue;
          if (!moveFather.hasMove(move) || !egg.compatibleWithMove(move)) continue;
          moves.push(move);
        }
      }
      // Inherit egg moves from each parent
      if (!moveFather.female()) {
        for (const move of egg.speciesData().eggMoves) if (moveFather.hasMove(move)) moves.push(move);
      }
      if (BREEDING_CAN_INHERIT_EGG_MOVES_FROM_MOTHER && moveMother.female()) {
        for (const move of egg.speciesData().eggMoves) if (moveMother.hasMove(move)) moves.push(move);
      }
      // Learn Volt Tackle if a parent has a Light Ball and is in the Pichu family
      if (egg.species === "PICHU" && MoveData.exists("VOLTTACKLE") &&
          ((father[2] && father[0].hasItem("LIGHTBALL")) || (mother[2] && mother[0].hasItem("LIGHTBALL")))) {
        moves.push("VOLTTACKLE");
      }
      return moves;
    },

    inheritMoves(egg: Pokemon, mother: ParentData, father: ParentData): void {
      let moves = DayCare.EggGenerator.getMovesToInherit(egg, mother, father);
      // Remove duplicates (keeping the latest ones)
      moves = [...new Set([...moves].reverse())].reverse();
      // Learn moves
      const firstMoveIndex = Math.max(moves.length - Pokemon.MAX_MOVES, 0);
      for (let i = firstMoveIndex; i < moves.length; i++) egg.learnMove(moves[i]!);
    },

    inheritNature(egg: Pokemon, mother: Pokemon, father: Pokemon): void {
      const newNatures: Id[] = [];
      if (mother.hasItem("EVERSTONE")) newNatures.push(mother.natureId!);
      if (father.hasItem("EVERSTONE")) newNatures.push(father.natureId!);
      if (newNatures.length === 0) return;
      egg.nature = sample(newNatures)!;
    },

    /** inherit_ability, as the v20.1 Hotfixes fix it. */
    inheritAbility(egg: Pokemon, mother: ParentData, father: ParentData): void {
      const parent = mother[1] ? father[0] : mother[0]; // The female or non-Ditto parent
      if (parent.hasHiddenAbility()) {
        if (rand(100) < 60) egg.abilityIndex = parent.abilityIndex;
      } else if (rand(100) < 80) {
        egg.abilityIndex = parent.abilityIndex;
      } else {
        egg.abilityIndex = (parent.abilityIndex + 1) % 2;
      }
    },

    /** inherit_IVs, as the v20.1 Hotfixes fix it. */
    inheritIVs(egg: Pokemon, mother: Pokemon, father: Pokemon): void {
      // Get all stats
      const stats: Id[] = Stat.eachMain().map((s) => s.id);
      // Get the number of stats to inherit (includes ones inherited via Power items)
      let inheritCount = 3;
      if (MECHANICS_GENERATION >= 6) {
        if (mother.hasItem("DESTINYKNOT") || father.hasItem("DESTINYKNOT")) inheritCount = 5;
      }
      // Inherit IV because of Power items (if both parents have the same Power
      // item, then the parent that passes that Power item's stat down is chosen
      // randomly)
      const powerItems: [Id, Id][] = [
        ["POWERWEIGHT", "HP"],
        ["POWERBRACER", "ATTACK"],
        ["POWERBELT", "DEFENSE"],
        ["POWERLENS", "SPECIAL_ATTACK"],
        ["POWERBAND", "SPECIAL_DEFENSE"],
        ["POWERANKLET", "SPEED"],
      ];
      const powerStats = new Map<Id, number[]>();
      for (const parent of [mother, father]) {
        for (const item of powerItems) {
          if (!parent.hasItem(item[0])) continue;
          if (!powerStats.has(item[1])) powerStats.set(item[1], []);
          powerStats.get(item[1])!.push(parent.iv[item[1]]!);
          break;
        }
      }
      for (const [stat, newStats] of powerStats) {
        if (!newStats || newStats.length === 0) continue;
        const newStat = sample(newStats)!;
        egg.iv[stat] = newStat;
        stats.splice(stats.indexOf(stat), 1); // Don't try to inherit this stat's IV again
        inheritCount -= 1;
      }
      // Inherit the rest of the IVs
      const chosenStats = sampleN(stats, inheritCount);
      for (const stat of chosenStats) egg.iv[stat] = sample([mother, father])!.iv[stat]!;
    },

    inheritPokeBall(egg: Pokemon, mother: ParentData, father: ParentData): void {
      let balls: Id[] = [];
      for (const parent of [mother, father]) if (parent[2]) balls.push(parent[0].pokeBall);
      balls = balls.filter((b) => b !== "MASTERBALL" && b !== "CHERISHBALL"); // Can't inherit these Balls
      if (balls.length > 0) egg.pokeBall = sample(balls)!;
    },

    setShininess(egg: Pokemon, mother: Pokemon, father: Pokemon): void {
      let shinyRetries = 0;
      if (father.owner.language !== mother.owner.language) shinyRetries += MECHANICS_GENERATION >= 8 ? 6 : 5;
      if (G.bag.has("SHINYCHARM")) shinyRetries += 2;
      if (shinyRetries === 0) return;
      for (let n = 0; n < shinyRetries; n++) {
        if (egg.shiny) break;
        egg.shiny = null; // Make it recalculate shininess
        egg.personalID = (rand(2 ** 16) | (rand(2 ** 16) << 16)) >>> 0;
      }
    },

    setPokerus(egg: Pokemon): void {
      if (rand(65_536) < Settings.POKERUS_CHANCE) egg.givePokerus();
    },
  };

  //=============================================================================
  // A slot in the Day Care, which can contain a Pokémon.
  //=============================================================================
  static DayCareSlot = class DayCareSlot {
    pokemon: Pokemon | null = null;
    initialLevel = 0;

    constructor() {
      this.reset();
    }

    reset(): void {
      this.pokemon = null;
      this.initialLevel = 0;
    }

    deposit(pkmn: Pokemon): void {
      this.pokemon = pkmn;
      this.pokemon.heal();
      if (this.pokemon.isSpecies("SHAYMIN")) this.pokemon.form = 0;
      this.initialLevel = pkmn.level;
    }

    filled(): boolean { return this.pokemon != null; }
    pokemonName(): string { return this.filled() ? this.pokemon!.name : ""; }
    levelGain(): number { return this.filled() ? this.pokemon!.level - this.initialLevel : 0; }
    cost(): number { return (this.levelGain() + 1) * 100; }

    choiceText(): string | null {
      if (!this.filled()) return null;
      const p = this.pokemon!;
      if (p.male()) return _INTL("{1} (♂, Lv.{2})", p.name, p.level);
      if (p.female()) return _INTL("{1} (♀, Lv.{2})", p.name, p.level);
      return _INTL("{1} (Lv.{2})", p.name, p.level);
    }

    addExp(amount = 1): void {
      if (!this.filled()) return;
      const p = this.pokemon!;
      const maxExp = p.growthRate().maximumExp();
      if (p.exp >= maxExp) return;
      const oldLevel = p.level;
      p.exp += amount;
      if (p.level === oldLevel) return;
      p.calcStats();
      for (const move of p.getMoveList()) if (move.level === p.level) p.learnMove(move.move);
    }

    toJSON(): { pokemon: PokemonJSON | null; initialLevel: number } {
      return { pokemon: this.pokemon ? this.pokemon.toJSON() : null, initialLevel: this.initialLevel };
    }
  };

  //=============================================================================

  static readonly MAX_SLOTS = 2;

  slots: InstanceType<typeof DayCare.DayCareSlot>[] = [];
  eggGenerated = false;
  stepCounter = 0;
  gainExp: boolean;
  /** For deposited Pokémon of the same species */
  shareEggMoves: boolean;

  constructor() {
    for (let i = 0; i < DayCare.MAX_SLOTS; i++) this.slots.push(new DayCare.DayCareSlot());
    this.resetEggCounters();
    this.gainExp = DAY_CARE_POKEMON_GAIN_EXP_FROM_WALKING;
    this.shareEggMoves = DAY_CARE_POKEMON_CAN_SHARE_EGG_MOVES;
  }

  /** day_care[index] */
  get(index: number): InstanceType<typeof DayCare.DayCareSlot> | undefined { return this.slots[index]; }

  resetEggCounters(): void {
    this.eggGenerated = false;
    this.stepCounter = 0;
  }

  count(): number { return this.slots.filter((slot) => slot.filled()).length; }
  getCompatibility(): number { return this.compatibility(); }

  generateEgg(): Pokemon | null {
    if (this.count() !== 2) return null;
    const [pkmn1, pkmn2] = this.pokemonPair();
    return DayCare.EggGenerator.generate(pkmn1, pkmn2);
  }

  shareEggMove(): void {
    if (this.count() !== 2) return;
    const [pkmn1, pkmn2] = this.pokemonPair();
    if (pkmn1.species !== pkmn2.species) return;
    const eggMoves1 = pkmn1.speciesData().getEggMoves();
    const eggMoves2 = pkmn2.speciesData().getEggMoves();
    const knownMoves1: Id[] = [];
    const knownMoves2: Id[] = [];
    if (pkmn2.numMoves() < Pokemon.MAX_MOVES) {
      for (const m of pkmn1.moves) if (eggMoves2.includes(m.id) && !pkmn2.hasMove(m.id)) knownMoves1.push(m.id);
    }
    if (pkmn1.numMoves() < Pokemon.MAX_MOVES) {
      for (const m of pkmn2.moves) if (eggMoves1.includes(m.id) && !pkmn1.hasMove(m.id)) knownMoves2.push(m.id);
    }
    if (knownMoves1.length > 0) {
      if (knownMoves2.length === 0) {
        pkmn2.learnMove(knownMoves1[0]!);
      } else {
        const learner = sample<[Pokemon, Id]>([[pkmn1, knownMoves2[0]!], [pkmn2, knownMoves1[0]!]])!;
        learner[0].learnMove(learner[1]);
      }
    } else if (knownMoves2.length > 0) {
      pkmn1.learnMove(knownMoves2[0]!);
    }
  }

  updateOnStepTaken(): void {
    this.stepCounter += 1;
    if (this.stepCounter >= 256) {
      this.stepCounter = 0;
      // Make an egg available at the Day Care
      if (!this.eggGenerated && this.count() === 2) {
        const compat = this.compatibility();
        let eggChance = [0, 20, 50, 70][compat]!;
        if (G.bag.has("OVALCHARM")) eggChance = [0, 40, 80, 88][compat]!;
        if (rand(100) < eggChance) this.eggGenerated = true;
      }
      // Have one deposited Pokémon learn an egg move from the other
      // NOTE: I don't know what the chance of this happening is.
      if (this.shareEggMoves && rand(100) < 50) this.shareEggMove();
    }
    // Day Care Pokémon gain Exp/moves
    if (this.gainExp) for (const slot of this.slots) slot.addExp();
  }

  //=============================================================================

  static current(): DayCare { return G.pokemonGlobal.dayCare; }
  static count(): number { return DayCare.current().count(); }
  static eggGeneratedQ(): boolean { return DayCare.current().eggGenerated; }
  static resetEggCounters(): void { DayCare.current().resetEggCounters(); }

  static getDetails(index: number, nameVar: number, costVar: number): void {
    const dayCare = DayCare.current();
    if (nameVar > 0) G.gameVariables.set(nameVar, dayCare.get(index)!.pokemonName());
    if (costVar > 0) G.gameVariables.set(costVar, dayCare.get(index)!.cost());
  }

  static getLevelGain(index: number, nameVar: number, levelVar: number): void {
    const dayCare = DayCare.current();
    if (nameVar > 0) G.gameVariables.set(nameVar, dayCare.get(index)!.pokemonName());
    if (levelVar > 0) G.gameVariables.set(levelVar, dayCare.get(index)!.levelGain());
  }

  static getCompatibility(compatVar: number): void {
    if (compatVar > 0) G.gameVariables.set(compatVar, DayCare.current().getCompatibility());
  }

  /** DayCare.deposit(party_index), with Following Pokemon EX's follower refresh. */
  static async deposit(partyIndex: number): Promise<void> {
    DayCare.depositInternal(partyIndex);
    await FollowingPkmn.refresh(false);
  }

  /** Essentials' DayCare.deposit. */
  static depositInternal(partyIndex: number): void {
    G.stats.dayCareDeposits += 1;
    const dayCare = DayCare.current();
    const pkmn = player().party[partyIndex];
    if (pkmn == null) throw new Error(_INTL("No Pokémon at index {1} in party.", partyIndex));
    for (const slot of dayCare.slots) {
      if (slot.filled()) continue;
      slot.deposit(pkmn);
      player().party.splice(partyIndex, 1);
      dayCare.resetEggCounters();
      return;
    }
    throw new Error(_INTL("No room to deposit a Pokémon."));
  }

  static withdraw(index: number): void {
    const dayCare = DayCare.current();
    const slot = dayCare.get(index)!;
    if (!slot.filled()) {
      throw new Error(_INTL("No Pokémon found in slot {1}.", index));
    } else if (player().partyFull()) {
      throw new Error(_INTL("No room in party for Pokémon."));
    }
    G.stats.dayCareLevelsGained += slot.levelGain();
    player().party.push(slot.pokemon!);
    slot.reset();
    dayCare.resetEggCounters();
  }

  static async choose(message: string, choiceVar: number): Promise<void> {
    const dayCare = DayCare.current();
    switch (dayCare.count()) {
      case 0:
        throw new Error(_INTL("No Pokémon found in Day Care to choose from."));
      case 1:
        dayCare.slots.forEach((slot, i) => { if (slot.filled()) G.gameVariables.set(choiceVar, i); });
        break;
      default: {
        const commands: string[] = [];
        const indices: number[] = [];
        dayCare.slots.forEach((slot, i) => {
          const choiceText = slot.choiceText();
          if (!choiceText) return;
          commands.push(choiceText);
          indices.push(i);
        });
        commands.push(_INTL("CANCEL"));
        const command = await pbMessage(message, commands, commands.length);
        G.gameVariables.set(choiceVar, command === commands.length - 1 ? -1 : indices[command]!);
      }
    }
  }

  static collectEgg(): void {
    const dayCare = DayCare.current();
    const egg = dayCare.generateEgg();
    if (egg == null) throw new Error(_INTL("Couldn't generate the egg."));
    if (player().partyFull()) throw new Error(_INTL("No room in party for egg."));
    player().party.push(egg);
    dayCare.resetEggCounters();
  }

  //=============================================================================

  private pokemonPair(): [Pokemon, Pokemon] {
    let pkmn1: Pokemon | null = null;
    let pkmn2: Pokemon | null = null;
    for (const slot of this.slots) {
      if (!slot.filled()) continue;
      if (pkmn1 == null) pkmn1 = slot.pokemon;
      else pkmn2 = slot.pokemon;
    }
    if (pkmn2 == null) throw new Error(_INTL("Couldn't find 2 deposited Pokémon."));
    return [pkmn1!, pkmn2];
  }

  private pokemonInDittoEggGroup(pkmn: Pokemon): boolean {
    return pkmn.speciesData().eggGroups.includes("Ditto");
  }

  private compatibleGender(pkmn1: Pokemon, pkmn2: Pokemon): boolean {
    if (pkmn1.female() && pkmn2.male()) return true;
    if (pkmn1.male() && pkmn2.female()) return true;
    const ditto1 = this.pokemonInDittoEggGroup(pkmn1);
    const ditto2 = this.pokemonInDittoEggGroup(pkmn2);
    if (ditto1 && !ditto2) return true;
    if (ditto2 && !ditto1) return true;
    return false;
  }

  compatibility(): number {
    if (this.count() !== 2) return 0;
    // Find the Pokémon whose compatibility is being calculated
    const [pkmn1, pkmn2] = this.pokemonPair();
    // Shadow Pokémon cannot breed
    if (pkmn1.shadowPokemon() || pkmn2.shadowPokemon()) return 0;
    // Pokémon in the Undiscovered egg group cannot breed
    const eggGroups1 = pkmn1.speciesData().eggGroups;
    const eggGroups2 = pkmn2.speciesData().eggGroups;
    if (eggGroups1.includes("Undiscovered") || eggGroups2.includes("Undiscovered")) return 0;
    // Pokémon that don't share an egg group (and neither is in the Ditto group)
    // cannot breed
    if (!eggGroups1.includes("Ditto") && !eggGroups2.includes("Ditto") &&
        !eggGroups1.some((g) => eggGroups2.includes(g))) return 0;
    // Pokémon with incompatible genders cannot breed
    if (!this.compatibleGender(pkmn1, pkmn2)) return 0;
    // Pokémon can breed; calculate a compatibility factor
    let ret = 1;
    if (pkmn1.species === pkmn2.species) ret += 1;
    if (pkmn1.owner.id !== pkmn2.owner.id) ret += 1;
    return ret;
  }

  //=============================================================================
  // Saving
  //=============================================================================
  toJSON(): DayCareJSON {
    return {
      slots: this.slots.map((s) => s.toJSON()),
      eggGenerated: this.eggGenerated, stepCounter: this.stepCounter,
      gainExp: this.gainExp, shareEggMoves: this.shareEggMoves,
    };
  }

  static fromJSON(json: DayCareJSON): DayCare {
    const d = new DayCare();
    json.slots.forEach((s, i) => {
      const slot = d.slots[i] ?? (d.slots[i] = new DayCare.DayCareSlot());
      slot.pokemon = s.pokemon ? Pokemon.fromJSON(s.pokemon) : null;
      slot.initialLevel = s.initialLevel;
    });
    d.eggGenerated = json.eggGenerated;
    d.stepCounter = json.stepCounter;
    d.gainExp = json.gainExp;
    d.shareEggMoves = json.shareEggMoves;
    return d;
  }
}

export interface DayCareJSON {
  slots: { pokemon: PokemonJSON | null; initialLevel: number }[];
  eggGenerated: boolean;
  stepCounter: number;
  gainExp: boolean;
  shareEggMoves: boolean;
}

//===============================================================================
// $PokemonGlobal.day_care (PokemonGlobalMetadata#initialize: DayCare.new)
//===============================================================================
declare module "../globals" {
  interface PokemonGlobalMetadata {
    dayCare: DayCare;
  }
}
const dayCares = new WeakMap<PokemonGlobalMetadata, DayCare>();
Object.defineProperty(PokemonGlobalMetadata.prototype, "dayCare", {
  configurable: true,
  get(this: PokemonGlobalMetadata): DayCare {
    let d = dayCares.get(this);
    if (!d) dayCares.set(this, (d = new DayCare()));
    return d;
  },
  set(this: PokemonGlobalMetadata, value: DayCare) { dayCares.set(this, value); },
});

SaveData.register({
  id: "day_care",
  save: () => G.pokemonGlobal.dayCare.toJSON(),
  load: (v) => { G.pokemonGlobal.dayCare = DayCare.fromJSON(v as DayCareJSON); },
  newGame: () => { G.pokemonGlobal.dayCare = new DayCare(); },
});

//===============================================================================
// With each step taken, add Exp to Pokémon in the Day Care and try to generate
// an egg.
//===============================================================================
EventHandlers.add("on_player_step_taken", "update_day_care", () => {
  G.pokemonGlobal.dayCare.updateOnStepTaken();
});

//===============================================================================
// Deprecated methods (removed in v21)
//===============================================================================
export const pbDayCareDeposited = () => DayCare.count();
export const pbDayCareGetDeposited = (index: number, nameVar: number, costVar: number) => DayCare.getDetails(index, nameVar, costVar);
export const pbDayCareGetLevelGain = (index: number, nameVar: number, levelVar: number) => DayCare.getLevelGain(index, nameVar, levelVar);
export const pbDayCareDeposit = (partyIndex: number) => DayCare.deposit(partyIndex);
export const pbDayCareWithdraw = (index: number) => DayCare.withdraw(index);
export const pbDayCareChoose = (text: string, choiceVar: number) => DayCare.choose(text, choiceVar);
export const pbDayCareGetCompatibility = (compatVar: number) => DayCare.getCompatibility(compatVar);
export const pbEggGenerated = () => DayCare.eggGeneratedQ();
export const pbDayCareGenerateEgg = () => DayCare.collectEgg();
