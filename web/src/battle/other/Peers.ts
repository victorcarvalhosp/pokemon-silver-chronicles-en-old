// Port of Data/Scripts/011_Battle/006_Other battle code/004_Battle_Peers.rb

import { Metadata } from "../../data/gameData/metadata";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import { MultipleForms } from "../../game/pokemon/formHandlers";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import type { Trainer } from "../../game/trainer/Trainer";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";

//===============================================================================
//
//===============================================================================
export class Peer {
  pbStorePokemon(player: Trainer, pkmn: Pokemon): number {
    if (!player.partyFull()) {
      player.party[player.party.length] = pkmn;
      return -1;
    }
    if (Settings.HEAL_STORED_POKEMON) {
      const oldReadyEvo = pkmn.readyToEvolve;
      pkmn.heal();
      pkmn.readyToEvolve = oldReadyEvo;
    }
    const oldCurBox = this.pbCurrentBox();
    const storedBox = G.storage.pbStoreCaught(pkmn);
    if (storedBox < 0) {
      // NOTE: Poké Balls can't be used if storage is full, so you shouldn't ever
      //       see this message. (Ruby calls pbDisplayPaused here, which Peer
      //       doesn't have.)
      return oldCurBox;
    }
    return storedBox;
  }

  pbGetStorageCreatorName(): string | null {
    // pbGetStorageCreator (016_UI/019_UI_PC.rb)
    if ((G.player as unknown as Player).seenStorageCreator) return Metadata.get().storageCreator;
    return null;
  }

  pbCurrentBox(): number {
    return G.storage.currentBox;
  }

  pbBoxName(box: number): string {
    return box < 0 ? "" : G.storage.boxes[box]!.name;
  }

  pbOnStartingBattle(battle: Battle, pkmn: Pokemon, wild = false): void {
    const f = MultipleForms.call("getFormOnStartingBattle", pkmn, wild) as number | null;
    if (f != null) pkmn.form = f;
    MultipleForms.call("changePokemonOnStartingBattle", pkmn, battle);
  }

  pbOnEnteringBattle(battle: Battle, battler: Battler, pkmn: Pokemon, wild = false): void {
    const f = MultipleForms.call("getFormOnEnteringBattle", pkmn, wild) as number | null;
    if (f != null) pkmn.form = f;
    if (battler.form !== pkmn.form) battler.form = pkmn.form;
    MultipleForms.call("changePokemonOnEnteringBattle", battler as unknown as Pokemon, pkmn, battle);
  }

  /** For switching out, including due to fainting, and for the end of battle */
  pbOnLeavingBattle(battle: Battle, pkmn: Pokemon | null, usedInBattle: boolean, endBattle = false): void {
    if (!pkmn) return;
    const f = MultipleForms.call("getFormOnLeavingBattle", pkmn, battle, usedInBattle, endBattle) as number | null;
    if (f != null && pkmn.form !== f) pkmn.form = f;
    if (pkmn.hp > pkmn.totalhp) pkmn.hp = pkmn.totalhp;
    MultipleForms.call("changePokemonOnLeavingBattle", pkmn, battle, usedInBattle, endBattle);
  }
}

//===============================================================================
// Unused class.
//===============================================================================
export class NullPeer {
  pbOnEnteringBattle(_battle: Battle, _battler: Battler, _pkmn: Pokemon, _wild = false): void {}
  pbOnLeavingBattle(_battle: Battle, _pkmn: Pokemon | null, _usedInBattle: boolean, _endBattle = false): void {}

  pbStorePokemon(player: Trainer, pkmn: Pokemon): number {
    if (!player.partyFull()) player.party[player.party.length] = pkmn;
    return -1;
  }

  pbGetStorageCreatorName(): string | null { return null; }
  pbCurrentBox(): number { return -1; }
  pbBoxName(_box: number): string { return ""; }
}
