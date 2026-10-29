// Port of PokemonStorageScreen (016_UI/017_UI_PokemonStorage.rb:1479), the
// Pokémon storage mechanics, with this game's own changes to that file: the
// "League regulations" switches at the top (HOENN_SWITCH ...) and
// pbCanWithdraw, which pbWithdraw / pbPlace / pbSwap check. No plugin patches
// PokemonStorageScreen ("BW Storage System" isn't installed).
//
// The screen talks to its scene through StorageScene, so the tests can drive
// it with a recording stub the same way tools/ruby-ref/storage_reference.rb
// drives the Ruby original.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { pbGetRegionalNumber } from "../../data/gameData/miscPBSData";
import { Settings } from "../../data/gameData/settings";
import { pbPlayBuzzerSE, pbSEPlay } from "../../game/GameSystem";
import { G } from "../../game/globals";
import type { PokemonBag } from "../../game/items/PokemonBag";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { PokemonBox, PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { MenuFlags } from "../menus/menuScreens";
import { _INTL } from "../messageConfig";

// 017_UI_PokemonStorage.rb:1-9
export const HOENN_SWITCH = 479;
export const FIRST_BADGE_SWITCH = 867;
export const SECOND_BADGE_SWITCH = 481;
export const THIRD_BADGE_SWITCH = 482;
export const FOURTH_BADGE_SWITCH = 483;
export const FIFTH_BADGE_SWITCH = 484;
export const SIXTH_BADGE_SWITCH = 485;
export const SEVENTH_BADGE_SWITCH = 486;
export const EIGHTH_BADGE_SWITCH = 487;

/** [box, index]: box -1 is the party; [-2|-3|-4, -1] are the party / close / box name buttons. */
export type Selection = [number, number];

/** What PokemonStorageScreen asks of PokemonStorageScene. */
export interface StorageScene {
  readonly quickswap: boolean;
  pbStartBox(screen: PokemonStorageScreen, command: number): Promise<void>;
  pbCloseBox(): Promise<void>;
  pbSelectBox(party: Pokemon[]): Promise<Selection | null>;
  pbSelectParty(party: Pokemon[]): Promise<number>;
  pbDisplay(message: string): Promise<void>;
  pbShowCommands(message: string, commands: string[], index?: number): Promise<number>;
  pbChooseBox(msg: string): Promise<number>;
  pbJumpToBox(newbox: number): Promise<void>;
  pbChangeBackground(wp: number): Promise<void>;
  pbBoxName(helptext: string, minchars: number, maxchars: number): Promise<void>;
  pbChooseItem(bag: PokemonBag): Promise<Id | null>;
  pbSummary(selected: Selection, heldpoke: Pokemon | null): Promise<void>;
  pbMark(selected: Selection, heldpoke: Pokemon | null): Promise<void>;
  pbHold(selected: Selection): Promise<void>;
  pbSwap(selected: Selection, heldpoke: Pokemon | null): Promise<void>;
  pbPlace(selected: Selection, heldpoke: Pokemon | null): Promise<void>;
  pbWithdraw(selected: Selection, heldpoke: Pokemon | null, partyindex: number): Promise<void>;
  pbStore(selected: Selection, heldpoke: Pokemon | null, destbox: number, firstfree: number): Promise<void>;
  pbRelease(selected: Selection, heldpoke: Pokemon | null): Promise<void>;
  pbRefresh(): void;
  pbHardRefresh(): void;
  pbUpdateOverlay(selection: number, party?: Pokemon[] | null): void;
  update(): void;
}

/** The storage screen's Debug command (PokemonStorageScreen#pbPokemonDebug, 020_Debug); set by a debug port. */
export const StorageHooks: {
  pokemonDebug?: (screen: PokemonStorageScreen, pkmn: Pokemon, selected: Selection, heldpoke: Pokemon | null) => Promise<void>;
} = {};

const temp = () => G.gameTemp as unknown as { inStorage: boolean };
const bag = () => G.bag as PokemonBag;

/** Array#compact! */
function compact<T>(a: (T | null | undefined)[]): void {
  let w = 0;
  for (let r = 0; r < a.length; r++) if (a[r] != null) a[w++] = a[r];
  a.length = w;
}

export class PokemonStorageScreen {
  heldpkmn: Pokemon | null = null;

  constructor(readonly scene: StorageScene, readonly storage: PokemonStorage) {}

  async pbStartScreen(command: number): Promise<void> {
    temp().inStorage = true;
    this.heldpkmn = null;
    switch (command) {
      case 0: { // Organise
        await this.scene.pbStartBox(this, command);
        for (;;) {
          const selected = await this.scene.pbSelectBox(this.storage.party);
          if (selected == null) {
            if (this.pbHeldPokemon()) {
              await this.pbDisplay(_INTL("You're holding a Pokémon!"));
              continue;
            }
            if (await this.pbConfirm(_INTL("Continue Box operations?"))) continue;
            break;
          } else if (selected[0] === -3) { // Close box
            if (this.pbHeldPokemon()) {
              await this.pbDisplay(_INTL("You're holding a Pokémon!"));
              continue;
            }
            if (await this.pbConfirm(_INTL("Exit from the Box?"))) {
              pbSEPlay("PC close");
              break;
            }
            continue;
          } else if (selected[0] === -4) { // Box name
            await this.pbBoxCommands();
          } else {
            const pokemon = this.storage.get(selected[0], selected[1]);
            const heldpoke = this.pbHeldPokemon();
            if (!pokemon && !heldpoke) continue;
            if (this.scene.quickswap) {
              if (this.heldpkmn) {
                if (pokemon) await this.pbSwap(selected);
                else await this.pbPlace(selected);
              } else {
                await this.pbHold(selected);
              }
            } else {
              const commands: string[] = [];
              let cmdMove = -1;
              let cmdSummary = -1;
              let cmdWithdraw = -1;
              let cmdItem = -1;
              let cmdMark = -1;
              let cmdRelease = -1;
              let cmdDebug = -1;
              let helptext = "";
              if (heldpoke) {
                helptext = _INTL("{1} is selected.", heldpoke.name);
                commands[(cmdMove = commands.length)] = pokemon ? _INTL("Shift") : _INTL("Place");
              } else if (pokemon) {
                helptext = _INTL("{1} is selected.", pokemon.name);
                commands[(cmdMove = commands.length)] = _INTL("Move");
              }
              commands[(cmdSummary = commands.length)] = _INTL("Summary");
              commands[(cmdWithdraw = commands.length)] = selected[0] === -1 ? _INTL("Store") : _INTL("Withdraw");
              commands[(cmdItem = commands.length)] = _INTL("Item");
              commands[(cmdMark = commands.length)] = _INTL("Mark");
              commands[(cmdRelease = commands.length)] = _INTL("Release");
              if (MenuFlags.DEBUG) commands[(cmdDebug = commands.length)] = _INTL("Debug");
              commands[commands.length] = _INTL("Cancel");
              const cmd = await this.pbShowCommands(helptext, commands);
              if (cmdMove >= 0 && cmd === cmdMove) { // Move/Shift/Place
                if (this.heldpkmn) {
                  if (pokemon) await this.pbSwap(selected);
                  else await this.pbPlace(selected);
                } else {
                  await this.pbHold(selected);
                }
              } else if (cmdSummary >= 0 && cmd === cmdSummary) { // Summary
                await this.pbSummary(selected, this.heldpkmn);
              } else if (cmdWithdraw >= 0 && cmd === cmdWithdraw) { // Store/Withdraw
                if (selected[0] === -1) await this.pbStore(selected, this.heldpkmn);
                else await this.pbWithdraw(selected, this.heldpkmn);
              } else if (cmdItem >= 0 && cmd === cmdItem) { // Item
                await this.pbItem(selected, this.heldpkmn);
              } else if (cmdMark >= 0 && cmd === cmdMark) { // Mark
                await this.pbMark(selected, this.heldpkmn);
              } else if (cmdRelease >= 0 && cmd === cmdRelease) { // Release
                await this.pbRelease(selected, this.heldpkmn);
              } else if (cmdDebug >= 0 && cmd === cmdDebug) { // Debug
                if (StorageHooks.pokemonDebug) {
                  await StorageHooks.pokemonDebug(this, this.heldpkmn ? this.heldpkmn : pokemon!, selected, heldpoke);
                } else {
                  console.warn("PokemonStorageScreen#pbPokemonDebug (020_Debug) isn't ported yet");
                }
              }
            }
          }
        }
        await this.scene.pbCloseBox();
        break;
      }
      case 1: { // Withdraw
        await this.scene.pbStartBox(this, command);
        for (;;) {
          const selected = await this.scene.pbSelectBox(this.storage.party);
          if (selected == null) {
            if (await this.pbConfirm(_INTL("Continue Box operations?"))) continue;
            break;
          }
          if (selected[0] === -2) { // Party Pokémon
            await this.pbDisplay(_INTL("Which one will you take?"));
            continue;
          } else if (selected[0] === -3) { // Close box
            if (await this.pbConfirm(_INTL("Exit from the Box?"))) {
              pbSEPlay("PC close");
              break;
            }
            continue;
          } else if (selected[0] === -4) { // Box name
            await this.pbBoxCommands();
            continue;
          }
          const pokemon = this.storage.get(selected[0], selected[1]);
          if (!pokemon) continue;
          const cmd = await this.pbShowCommands(_INTL("{1} is selected.", pokemon.name),
            [_INTL("Withdraw"), _INTL("Summary"), _INTL("Mark"), _INTL("Release"), _INTL("Cancel")]);
          switch (cmd) {
            case 0: await this.pbWithdraw(selected, null); break;
            case 1: await this.pbSummary(selected, null); break;
            case 2: await this.pbMark(selected, null); break;
            case 3: await this.pbRelease(selected, null); break;
          }
        }
        await this.scene.pbCloseBox();
        break;
      }
      case 2: { // Deposit
        await this.scene.pbStartBox(this, command);
        for (;;) {
          const selected = await this.scene.pbSelectParty(this.storage.party);
          if (selected === -3) { // Close box
            if (await this.pbConfirm(_INTL("Exit from the Box?"))) {
              pbSEPlay("PC close");
              break;
            }
            continue;
          } else if (selected < 0) {
            if (await this.pbConfirm(_INTL("Continue Box operations?"))) continue;
            break;
          } else {
            const pokemon = this.storage.get(-1, selected);
            if (!pokemon) continue;
            const cmd = await this.pbShowCommands(_INTL("{1} is selected.", pokemon.name),
              [_INTL("Store"), _INTL("Summary"), _INTL("Mark"), _INTL("Release"), _INTL("Cancel")]);
            switch (cmd) {
              case 0: await this.pbStore([-1, selected], null); break;
              case 1: await this.pbSummary([-1, selected], null); break;
              case 2: await this.pbMark([-1, selected], null); break;
              case 3: await this.pbRelease([-1, selected], null); break;
            }
          }
        }
        await this.scene.pbCloseBox();
        break;
      }
      case 3:
        await this.scene.pbStartBox(this, command);
        await this.scene.pbCloseBox();
        break;
    }
    temp().inStorage = false;
  }

  /** For debug */
  pbUpdate(): void {
    this.scene.update();
  }

  /** For debug */
  pbHardRefresh(): void {
    this.scene.pbHardRefresh();
  }

  /** For debug */
  pbRefreshSingle(i: Selection): void {
    this.scene.pbUpdateOverlay(i[1], i[0] === -1 ? this.storage.party : null);
    this.scene.pbHardRefresh();
  }

  async pbDisplay(message: string): Promise<void> {
    await this.scene.pbDisplay(message);
  }

  async pbConfirm(str: string): Promise<boolean> {
    return (await this.pbShowCommands(str, [_INTL("Yes"), _INTL("No")])) === 0;
  }

  async pbShowCommands(msg: string, commands: string[], index = 0): Promise<number> {
    return this.scene.pbShowCommands(msg, commands, index);
  }

  pbAble(pokemon: Pokemon | null | undefined): boolean {
    return !!pokemon && !pokemon.egg() && pokemon.hp > 0;
  }

  pbAbleCount(): number {
    let count = 0;
    for (const p of this.storage.party) if (this.pbAble(p)) count += 1;
    return count;
  }

  pbHeldPokemon(): Pokemon | null {
    return this.heldpkmn;
  }

  /** This game's League regulations (017_UI_PokemonStorage.rb:1692). */
  pbCanWithdraw(selected: Selection | null, heldpoke: Pokemon | null = null): boolean {
    // If switch 479 is off, always allow withdrawal
    if (!G.gameSwitches.get(HOENN_SWITCH)) return true;
    // Get the Pokemon to check - either from heldpoke or from storage
    let pokemon = heldpoke;
    if (!pokemon && selected) {
      const box = selected[0];
      const index = selected[1];
      if (box >= 0) pokemon = this.storage.get(box, index);
    }
    // If switch 479 is on, check conditions
    if (!pokemon) return false;
    // Condition 1: If second badge is on and pokemon level is below 25, return true
    if (G.gameSwitches.get(SECOND_BADGE_SWITCH) && pokemon.level < 25) return true;
    // Condition 2: If first badge is on and pokemon level is below 15, return true
    if (G.gameSwitches.get(FIRST_BADGE_SWITCH) && pokemon.level < 15) return true;
    // Condition 3: If Pokemon is in Hoenn regional dex (region 2), return true
    const hoennDexNumber = pbGetRegionalNumber(2, pokemon.species);
    if (hoennDexNumber > 0) return true;
    // Otherwise, return false
    return false;
  }

  async pbWithdraw(selected: Selection, heldpoke: Pokemon | null): Promise<boolean | undefined> {
    if (this.pbCanWithdraw(selected, heldpoke) === false) {
      await this.pbDisplay(_INTL("Per League regulations, you can't withdraw this Pokémon."));
      return undefined;
    }
    const box = selected[0];
    const index = selected[1];
    if (box === -1) throw new Error(_INTL("Can't withdraw from party..."));
    if (this.storage.partyFull()) {
      await this.pbDisplay(_INTL("Your party's full!"));
      return false;
    }
    await this.scene.pbWithdraw(selected, heldpoke, this.storage.party.length);
    if (heldpoke) {
      this.storage.pbMoveCaughtToParty(heldpoke);
      this.heldpkmn = null;
    } else {
      this.storage.pbMove(-1, -1, box, index);
    }
    this.scene.pbRefresh();
    return true;
  }

  async pbStore(selected: Selection, heldpoke: Pokemon | null): Promise<void> {
    const box = selected[0];
    const index = selected[1];
    if (box !== -1) throw new Error(_INTL("Can't deposit from box..."));
    if (this.pbAbleCount() <= 1 && this.pbAble(this.storage.get(box, index)) && !heldpoke) {
      pbPlayBuzzerSE();
      await this.pbDisplay(_INTL("That's your last Pokémon!"));
    } else if (heldpoke?.mail) {
      await this.pbDisplay(_INTL("Please remove the Mail."));
    } else if (!heldpoke && this.storage.get(box, index)!.mail) {
      await this.pbDisplay(_INTL("Please remove the Mail."));
    } else if (heldpoke?.cannotStore) {
      await this.pbDisplay(_INTL("{1} refuses to go into storage!", heldpoke.name));
    } else if (!heldpoke && this.storage.get(box, index)!.cannotStore) {
      await this.pbDisplay(_INTL("{1} refuses to go into storage!", this.storage.get(box, index)!.name));
    } else {
      for (;;) {
        const destbox = await this.scene.pbChooseBox(_INTL("Deposit in which Box?"));
        if (destbox >= 0) {
          const firstfree = this.storage.pbFirstFreePos(destbox);
          if (firstfree < 0) {
            await this.pbDisplay(_INTL("The Box is full."));
            continue;
          }
          if (heldpoke || selected[0] === -1) {
            const p = heldpoke ? heldpoke : this.storage.get(-1, index)!;
            if (Settings.HEAL_STORED_POKEMON) {
              const oldReadyEvo = p.readyToEvolve;
              p.heal();
              p.readyToEvolve = oldReadyEvo;
            }
          }
          await this.scene.pbStore(selected, heldpoke, destbox, firstfree);
          if (heldpoke) {
            this.storage.pbMoveCaughtToBox(heldpoke, destbox);
            this.heldpkmn = null;
          } else {
            this.storage.pbMove(destbox, -1, -1, index);
          }
        }
        break;
      }
      this.scene.pbRefresh();
    }
  }

  async pbHold(selected: Selection): Promise<void> {
    const box = selected[0];
    const index = selected[1];
    if (box === -1 && this.pbAble(this.storage.get(box, index)) && this.pbAbleCount() <= 1) {
      pbPlayBuzzerSE();
      await this.pbDisplay(_INTL("That's your last Pokémon!"));
      return;
    }
    await this.scene.pbHold(selected);
    this.heldpkmn = this.storage.get(box, index);
    this.storage.pbDelete(box, index);
    this.scene.pbRefresh();
  }

  async pbPlace(selected: Selection): Promise<void> {
    const box = selected[0];
    const index = selected[1];
    // NOTE (Ruby parity): 017_UI_PokemonStorage.rb:1826 checks the party slot
    // (always empty) instead of the held Pokémon, so with HOENN_SWITCH on a
    // held Pokémon can never be placed into the party.
    if (this.pbCanWithdraw(selected, null) === false && box === -1) {
      await this.pbDisplay(_INTL("Per League regulations, you can't withdraw this Pokémon."));
      return;
    }
    const held = this.heldpkmn!;
    if (this.storage.get(box, index)) {
      throw new Error(_INTL("Position {1},{2} is not empty...", box, index));
    } else if (box !== -1) {
      if (index >= this.storage.maxPokemon(box)) {
        await this.pbDisplay("Can't place that there.");
        return;
      } else if (held.mail) {
        await this.pbDisplay("Please remove the mail.");
        return;
      } else if (held.cannotStore) {
        await this.pbDisplay(_INTL("{1} refuses to go into storage!", held.name));
        return;
      }
    }
    if (Settings.HEAL_STORED_POKEMON && box >= 0) {
      const oldReadyEvo = held.readyToEvolve;
      held.heal();
      held.readyToEvolve = oldReadyEvo;
    }
    await this.scene.pbPlace(selected, held);
    this.storage.set(box, index, held);
    if (box === -1) compact(this.storage.party as (Pokemon | null)[]);
    this.scene.pbRefresh();
    this.heldpkmn = null;
  }

  async pbSwap(selected: Selection): Promise<boolean> {
    const box = selected[0];
    const index = selected[1];
    if (this.pbCanWithdraw(selected, this.heldpkmn) === false && box === -1) {
      await this.pbDisplay(_INTL("Per League regulations, you can't withdraw this Pokémon."));
      return false;
    }
    if (!this.storage.get(box, index)) throw new Error(_INTL("Position {1},{2} is empty...", box, index));
    const held = this.heldpkmn!;
    if (held.cannotStore && box !== -1) {
      pbPlayBuzzerSE();
      await this.pbDisplay(_INTL("{1} refuses to go into storage!", held.name));
      return false;
    } else if (box === -1 && this.pbAble(this.storage.get(box, index)) && this.pbAbleCount() <= 1 && !this.pbAble(held)) {
      pbPlayBuzzerSE();
      await this.pbDisplay(_INTL("That's your last Pokémon!"));
      return false;
    }
    if (box !== -1 && held.mail) {
      await this.pbDisplay("Please remove the mail.");
      return false;
    }
    if (Settings.HEAL_STORED_POKEMON && box >= 0) {
      const oldReadyEvo = held.readyToEvolve;
      held.heal();
      held.readyToEvolve = oldReadyEvo;
    }
    await this.scene.pbSwap(selected, held);
    const tmp = this.storage.get(box, index);
    this.storage.set(box, index, held);
    this.heldpkmn = tmp;
    this.scene.pbRefresh();
    return true;
  }

  async pbRelease(selected: Selection, heldpoke: Pokemon | null): Promise<boolean | undefined> {
    const box = selected[0];
    const index = selected[1];
    const pokemon = heldpoke ? heldpoke : this.storage.get(box, index);
    if (!pokemon) return undefined;
    if (pokemon.egg()) {
      await this.pbDisplay(_INTL("You can't release an Egg."));
      return false;
    } else if (pokemon.mail) {
      await this.pbDisplay(_INTL("Please remove the mail."));
      return false;
    } else if (pokemon.cannotRelease) {
      await this.pbDisplay(_INTL("{1} refuses to leave you!", pokemon.name));
      return false;
    }
    if (box === -1 && this.pbAbleCount() <= 1 && this.pbAble(pokemon) && !heldpoke) {
      pbPlayBuzzerSE();
      await this.pbDisplay(_INTL("That's your last Pokémon!"));
      return undefined;
    }
    const command = await this.pbShowCommands(_INTL("Release this Pokémon?"), [_INTL("No"), _INTL("Yes")]);
    if (command === 1) {
      const pkmnname = pokemon.name;
      await this.scene.pbRelease(selected, heldpoke);
      if (heldpoke) this.heldpkmn = null;
      else this.storage.pbDelete(box, index);
      this.scene.pbRefresh();
      await this.pbDisplay(_INTL("{1} was released.", pkmnname));
      await this.pbDisplay(_INTL("Bye-bye, {1}!", pkmnname));
      this.scene.pbRefresh();
    }
    return undefined;
  }

  async pbChooseMove(pkmn: Pokemon, helptext: string, index = 0): Promise<number> {
    const movenames: string[] = [];
    for (const i of pkmn.moves) {
      if (i.totalPp <= 0) movenames.push(_INTL("{1} (PP: ---)", i.name));
      else movenames.push(_INTL("{1} (PP: {2}/{3})", i.name, i.pp, i.totalPp));
    }
    return this.scene.pbShowCommands(helptext, movenames, index);
  }

  async pbSummary(selected: Selection, heldpoke: Pokemon | null): Promise<void> {
    await this.scene.pbSummary(selected, heldpoke);
  }

  async pbMark(selected: Selection, heldpoke: Pokemon | null): Promise<void> {
    await this.scene.pbMark(selected, heldpoke);
  }

  async pbItem(selected: Selection, heldpoke: Pokemon | null): Promise<void> {
    const box = selected[0];
    const index = selected[1];
    const pokemon = heldpoke ? heldpoke : this.storage.get(box, index)!;
    if (pokemon.egg()) {
      await this.pbDisplay(_INTL("Eggs can't hold items."));
      return;
    } else if (pokemon.mail) {
      await this.pbDisplay(_INTL("Please remove the mail."));
      return;
    }
    if (pokemon.item) {
      const itemname = pokemon.item.name;
      if (await this.pbConfirm(_INTL("Take this {1}?", itemname))) {
        if (bag().add(pokemon.item.id)) {
          await this.pbDisplay(_INTL("Took the {1}.", itemname));
          pokemon.item = null;
          this.scene.pbHardRefresh();
        } else {
          await this.pbDisplay(_INTL("Can't store the {1}.", itemname));
        }
      }
    } else {
      const item = await this.scene.pbChooseItem(bag());
      if (item) {
        const itemname = Item.get(item).name;
        pokemon.item = item;
        bag().remove(item);
        await this.pbDisplay(_INTL("{1} is now being held.", itemname));
        this.scene.pbHardRefresh();
      }
    }
  }

  async pbBoxCommands(): Promise<void> {
    const commands = [_INTL("Jump"), _INTL("Wallpaper"), _INTL("Name"), _INTL("Cancel")];
    const command = await this.pbShowCommands(_INTL("What do you want to do?"), commands);
    switch (command) {
      case 0: {
        const destbox = await this.scene.pbChooseBox(_INTL("Jump to which Box?"));
        if (destbox >= 0) await this.scene.pbJumpToBox(destbox);
        break;
      }
      case 1: {
        const papers = this.storage.availableWallpapers();
        let index = 0;
        for (let i = 0; i < papers[1].length; i++) {
          if (papers[1][i] === (this.storage.get(this.storage.currentBox) as PokemonBox).background) {
            index = i;
            break;
          }
        }
        const wpaper = await this.pbShowCommands(_INTL("Pick the wallpaper."), papers[0], index);
        if (wpaper >= 0) await this.scene.pbChangeBackground(papers[1][wpaper]!);
        break;
      }
      case 2:
        await this.scene.pbBoxName(_INTL("Box name?"), 0, 12);
        break;
    }
  }

  async pbChoosePokemon(_party: Pokemon[] | null = null): Promise<Selection | null> {
    temp().inStorage = true;
    this.heldpkmn = null;
    await this.scene.pbStartBox(this, 1);
    let retval: Selection | null = null;
    for (;;) {
      const selected = await this.scene.pbSelectBox(this.storage.party);
      if (selected && selected[0] === -3) { // Close box
        if (await this.pbConfirm(_INTL("Exit from the Box?"))) {
          pbSEPlay("PC close");
          break;
        }
        continue;
      }
      if (selected == null) {
        if (await this.pbConfirm(_INTL("Continue Box operations?"))) continue;
        break;
      } else if (selected[0] === -4) { // Box name
        await this.pbBoxCommands();
      } else {
        const pokemon = this.storage.get(selected[0], selected[1]);
        if (!pokemon) continue;
        const commands = [_INTL("Select"), _INTL("Summary"), _INTL("Withdraw"), _INTL("Item"), _INTL("Mark")];
        commands.push(_INTL("Cancel"));
        if (selected[0] === -1) commands[2] = _INTL("Store");
        const helptext = _INTL("{1} is selected.", pokemon.name);
        const command = await this.pbShowCommands(helptext, commands);
        if (command === 0) { // Select
          if (pokemon) {
            retval = selected;
            break;
          }
        } else if (command === 1) {
          await this.pbSummary(selected, null);
        } else if (command === 2) { // Store/Withdraw
          if (selected[0] === -1) await this.pbStore(selected, null);
          else await this.pbWithdraw(selected, null);
        } else if (command === 3) {
          await this.pbItem(selected, null);
        } else if (command === 4) {
          await this.pbMark(selected, null);
        }
      }
    }
    await this.scene.pbCloseBox();
    temp().inStorage = false;
    return retval;
  }
}
