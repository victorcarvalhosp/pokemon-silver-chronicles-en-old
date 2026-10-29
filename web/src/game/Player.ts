// Port of the overworld-facing parts of 015_Trainers and player/004_Player.rb.
// Party, Pokédex and bag arrive with M3/M4.

import { metadata } from "./metadata";

export class Pokedex {
  private seen = new Set<string>();
  /** $player.pokedex.register(species) */
  register(species: string): void {
    this.seen.add(species);
  }
  seenSpecies(species: string): boolean {
    return this.seen.has(species);
  }
}

export class Player {
  name: string;
  trainerType: string;
  characterID = 0;
  outfit = 0;
  badges: boolean[] = new Array(8).fill(false);
  money: number;
  coins = 0;
  pokedex = new Pokedex();
  hasPokedex = false;
  hasPokegear = false;
  hasRunningShoes = false;
  party: unknown[] = [];

  constructor(name: string, trainerType: string) {
    this.name = name;
    this.trainerType = trainerType;
    this.money = Number(metadata().startMoney ?? 3000);
  }

  /** 0 male, 1 female; from the trainer type until trainer types are loaded. */
  get gender(): number {
    return this.characterID === 2 || this.characterID === 4 ? 1 : 0;
  }

  get badgeCount(): number {
    return this.badges.filter(Boolean).length;
  }

  get pokemonParty(): unknown[] {
    return this.party;
  }
}
