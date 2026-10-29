// Port of PurifyChamberScreen, pbPurifyChamber and the :pc_menu option of
// Data/Scripts/016_UI/022_UI_PurifyChamber.rb. The scene is in
// ./PurifyChamberScene.ts, the model in ./PurifyChamber.ts; pbPurify is in
// ../../game/pokemon/shadowPokemonOther.ts.

import { G } from "../../game/globals";
import { pbPurify } from "../../game/pokemon/shadowPokemonOther";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { pbBoxesFull, pbStorePokemon } from "../../game/pokemon/utilities";
import type { Player } from "../../game/trainer/Player";
import { pbFadeOutIn } from "../fades";
import { _INTL } from "../messageConfig";
import { pbMessage } from "../messages";
import { MenuHandlers } from "../menus/menuHandlers";
import type { Selection } from "../storage/PokemonStorageScreen";
import { PurifyChamber, PurifyChamberHelper } from "./PurifyChamber";
import { PurifyChamberScene } from "./PurifyChamberScene";

const storage = () => G.storage as PokemonStorage;

//===============================================================================
//
//===============================================================================
export class PurifyChamberScreen {
  private chamber: PurifyChamber;

  constructor(private scene: PurifyChamberScene) {
    this.chamber = G.pokemonGlobal.purifyChamber;
    // (Ruby has a commented-out debug filler here: a random Shadow Pokémon
    // with an empty heart gauge and four regular Pokémon in every set.)
  }

  async pbPlace(pkmn: Pokemon | null, position: number): Promise<boolean> {
    if (!pkmn) return false;
    if (pkmn.egg()) {
      await this.scene.pbDisplay(_INTL("Can't place an egg there."));
      return false;
    }
    if (position === 0) {
      if (pkmn.shadowPokemon()) {
        // Remove from storage and place in set
        const oldpkmn = PurifyChamberHelper.pbGetPokemon(this.chamber, position);
        if (oldpkmn) {
          this.scene.pbShift(position, pkmn);
        } else {
          this.scene.pbPlace(position, pkmn);
        }
        PurifyChamberHelper.pbSetPokemon(this.chamber, position, pkmn);
        this.scene.pbRefresh();
      } else {
        await this.scene.pbDisplay(_INTL("Only a Shadow Pokémon can go there."));
        return false;
      }
    } else if (position >= 1) {
      if (pkmn.shadowPokemon()) {
        await this.scene.pbDisplay(_INTL("Can't place a Shadow Pokémon there."));
        return false;
      } else {
        const oldpkmn = PurifyChamberHelper.pbGetPokemon(this.chamber, position);
        if (oldpkmn) {
          this.scene.pbShift(position, pkmn);
        } else {
          this.scene.pbPlace(position, pkmn);
        }
        PurifyChamberHelper.pbSetPokemon(this.chamber, position, pkmn);
        this.scene.pbRefresh();
      }
    }
    return true;
  }

  async pbPlacePokemon(pos: Selection | null, position: number): Promise<boolean> {
    if (!pos) return false;
    const pkmn = storage().get(pos[0], pos[1]);
    if (await this.pbPlace(pkmn, position)) {
      storage().pbDelete(pos[0], pos[1]);
      return true;
    }
    return false;
  }

  async pbOnPlace(_pkmn: Pokemon | null): Promise<void> {
    const set = this.chamber.currentSet;
    if (this.chamber.setCount(set) === 0 && this.chamber.isPurifiableIgnoreRegular(set)) {
      const pkmn = this.chamber.getShadow(set)!;
      await this.scene.pbDisplay(
        _INTL("This {1} is ready to open its heart. However, there must be at least one regular Pokémon in the set to perform a purification ceremony.",
          pkmn.name),
      );
    }
  }

  async pbOpenSetDetail(): Promise<boolean> {
    const chamber = this.chamber;
    this.scene.pbOpenSetDetail(chamber.currentSet);
    let heldpkmn: Pokemon | null = null;
    for (;;) {
      // Commands
      // array[0]==0 - a position was chosen
      // array[0]==1 - a new set was chosen
      // array[0]==2 - choose Pokemon command
      const cmd = await this.scene.pbSetScreen();
      if (cmd[0] === 0) {
        // Place Pokemon in the set
        let curpkmn = PurifyChamberHelper.pbGetPokemon(this.chamber, cmd[1]);
        if (curpkmn || heldpkmn) {
          const commands = [_INTL("MOVE"), _INTL("SUMMARY"), _INTL("WITHDRAW")];
          if (curpkmn && heldpkmn) {
            commands[0] = _INTL("EXCHANGE");
          } else if (heldpkmn) {
            commands[0] = _INTL("PLACE");
          }
          let cmdReplace = -1;
          let cmdRotate = -1;
          if (!heldpkmn && curpkmn && cmd[1] === 0 && this.chamber.get(this.chamber.currentSet).length > 0) {
            commands[(cmdRotate = commands.length)] = _INTL("ROTATE");
          }
          if (!heldpkmn && curpkmn) {
            commands[(cmdReplace = commands.length)] = _INTL("REPLACE");
          }
          commands.push(_INTL("CANCEL"));
          const choice = await this.scene.pbShowCommands(
            _INTL("What shall I do with this {1}?", heldpkmn ? heldpkmn.name : curpkmn!.name),
            commands,
          );
          if (choice === 0) {
            if (heldpkmn) {
              if (await this.pbPlace(heldpkmn, cmd[1])) { // calls place or shift as appropriate
                if (curpkmn) {
                  heldpkmn = curpkmn; // Pokemon was shifted
                } else {
                  await this.pbOnPlace(heldpkmn);
                  this.scene.pbPositionHint(PurifyChamberHelper.adjustOnInsert(cmd[1]));
                  heldpkmn = null; // Pokemon was placed
                }
              }
            } else {
              this.scene.pbMove(cmd[1]);
              PurifyChamberHelper.pbSetPokemon(this.chamber, cmd[1], null);
              this.scene.pbRefresh();
              heldpkmn = curpkmn;
            }
          } else if (choice === 1) {
            await this.scene.pbSummary(cmd[1], heldpkmn);
          } else if (choice === 2) {
            if (pbBoxesFull()) {
              await this.scene.pbDisplay("All boxes are full.");
            } else if (heldpkmn) {
              this.scene.pbWithdraw(cmd[1], heldpkmn);
              storage().pbStoreCaught(heldpkmn);
              heldpkmn = null;
              this.scene.pbRefresh();
            } else {
              // Store and delete Pokemon.
              this.scene.pbWithdraw(cmd[1], heldpkmn);
              storage().pbStoreCaught(curpkmn!);
              PurifyChamberHelper.pbSetPokemon(this.chamber, cmd[1], null);
              this.scene.pbRefresh();
            }
          } else if (cmdRotate >= 0 && choice === cmdRotate) {
            const count = this.chamber.get(this.chamber.currentSet).length;
            const nextPos = this.chamber.get(this.chamber.currentSet).facing;
            if (count > 0) {
              this.scene.pbRotate((nextPos + 1) % count);
              this.chamber.get(this.chamber.currentSet).facing = (nextPos + 1) % count;
              this.scene.pbRefresh();
            }
          } else if (cmdReplace >= 0 && choice === cmdReplace) {
            const pos = await this.scene.pbChoosePokemon();
            if (pos) {
              const newpkmn = storage().get(pos[0], pos[1]);
              if (newpkmn) {
                if (newpkmn.shadowPokemon() === curpkmn!.shadowPokemon()) {
                  this.scene.pbReplace(cmd, pos);
                  PurifyChamberHelper.pbSetPokemon(this.chamber, cmd[1], newpkmn);
                  storage().set(pos[0], pos[1], curpkmn);
                  this.scene.pbRefresh();
                  await this.pbOnPlace(curpkmn);
                } else {
                  await this.scene.pbDisplay(_INTL("That Pokémon can't be placed there."));
                }
              }
            }
          }
        } else { // No current Pokemon
          const pos = await this.scene.pbChoosePokemon();
          if (await this.pbPlacePokemon(pos, cmd[1])) {
            curpkmn = PurifyChamberHelper.pbGetPokemon(this.chamber, cmd[1]);
            await this.pbOnPlace(curpkmn);
            this.scene.pbPositionHint(PurifyChamberHelper.adjustOnInsert(cmd[1]));
          }
        }
      } else if (cmd[0] === 1) { // Change the active set
        this.scene.pbChangeSet(cmd[1]);
        chamber.currentSet = cmd[1];
      } else if (cmd[0] === 2) { // Choose a Pokemon (pbSetScreen never returns it)
        const pos = await this.scene.pbChoosePokemon();
        const pkmn = pos ? storage().get(pos[0], pos[1]) : null;
        if (pkmn) heldpkmn = pkmn;
      } else { // cancel
        if (heldpkmn) {
          await this.scene.pbDisplay("You're holding a Pokémon!");
        } else if (!(await this.scene.pbConfirm("Continue editing sets?"))) {
          break;
        }
      }
    }
    if (this.pbCheckPurify()) {
      // NOTE (Ruby parity): 022_UI_PurifyChamber.rb:542. UIHelper.pbDisplay
      // adds its own "\1", so this "\1" is a pause before the end of the text:
      // the window stays busy while paused and UIHelper.pbDisplay only resumes
      // a window that isn't busy, so the game hangs here.
      await this.scene.pbDisplay(_INTL("There is a Pokémon that is ready to open its heart!\x01"));
      this.scene.pbCloseSetDetail();
      await this.pbDoPurify();
      return false;
    }
    this.scene.pbCloseSetDetail();
    return true;
  }

  pbDisplay(msg: string): Promise<void> {
    return this.scene.pbDisplay(msg);
  }

  pbConfirm(msg: string): Promise<boolean> {
    return this.scene.pbConfirm(msg);
  }

  pbRefresh(): void {
    this.scene.pbRefresh();
  }

  pbCheckPurify(): boolean {
    const purifiables: number[] = [];
    for (let set = 0; set < PurifyChamber.NUMSETS; set++) {
      if (this.chamber.isPurifiable(set)) purifiables.push(set); // if ready for purification
    }
    return purifiables.length > 0;
  }

  async pbDoPurify(): Promise<void> {
    const purifiables: number[] = [];
    for (let set = 0; set < PurifyChamber.NUMSETS; set++) {
      if (this.chamber.isPurifiable(set)) purifiables.push(set); // if ready for purification
    }
    for (let i = 0; i < purifiables.length; i++) {
      const set = purifiables[i]!;
      this.chamber.currentSet = set;
      await this.scene.pbOpenSet(set);
      this.scene.pbPurify();
      await pbPurify(this.chamber.get(set).shadow!, this);
      await pbStorePokemon(this.chamber.get(set).shadow!);
      this.chamber.setShadow(set, null); // Remove shadow Pokemon from set
      if (i + 1 !== purifiables.length) {
        await this.scene.pbDisplay(_INTL("There is another Pokémon that is ready to open its heart!"));
        if (!(await this.scene.pbConfirm("Would you like to switch sets?"))) {
          await this.scene.pbCloseSet();
          break;
        }
      }
      await this.scene.pbCloseSet();
    }
  }

  async pbStartPurify(): Promise<void> {
    const chamber = this.chamber;
    this.scene.pbStart(chamber);
    if (this.pbCheckPurify()) {
      await this.pbDoPurify();
      this.scene.pbEnd();
      return;
    }
    await this.scene.pbOpenSet(chamber.currentSet);
    for (;;) {
      const set = await this.scene.pbChooseSet();
      if (set < 0) {
        if (!(await this.scene.pbConfirm("Continue viewing holograms?"))) break;
      } else {
        chamber.currentSet = set;
        const cmd = await this.scene.pbShowCommands(_INTL("What do you want to do?"),
          [_INTL("EDIT"), _INTL("SWITCH"), _INTL("CANCEL")]);
        if (cmd === 0) { // edit
          if (!(await this.pbOpenSetDetail())) break;
        } else if (cmd === 1) { // switch
          chamber.currentSet = set;
          const newSet = await this.scene.pbSwitch(set);
          chamber.switch(set, newSet);
          chamber.currentSet = newSet;
          this.scene.pbRefresh();
        }
      }
    }
    await this.scene.pbCloseSet();
    this.scene.pbEnd();
  }
}

//===============================================================================
//
//===============================================================================
export async function pbPurifyChamber(): Promise<void> {
  (G.player as Player).seenPurifyChamber = true;
  await pbFadeOutIn(async () => {
    const scene = new PurifyChamberScene();
    const screen = new PurifyChamberScreen(scene);
    await screen.pbStartPurify();
  });
}

//===============================================================================
//
//===============================================================================
MenuHandlers.add("pc_menu", "purify_chamber", {
  name: () => _INTL("Purify Chamber"),
  order: 30,
  condition: () => (G.player as Player).seenPurifyChamber,
  effect: async () => {
    await pbMessage(_INTL("\\se[PC access]Accessed the Purify Chamber."));
    await pbPurifyChamber();
    return false;
  },
});
