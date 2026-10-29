// Port of 018_Alternate battle modes/001_Battle Frontier/005_UI_BattleSwap.rb:
// the Battle Factory screens for renting three of six Pokémon and swapping
// one of them for one of the last opponent's.

import { _INTL } from "../../data/gameData/gameData";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { UIHelper } from "../../ui/bag/UIHelper";
import { type SpriteHash, pbActivateWindow, pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide } from "../../ui/fades";
import { pbDisposeSpriteHash, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { addBackgroundPlane } from "../../ui/planes";
import { PokemonSummary_Scene, PokemonSummaryScreen } from "../../ui/summary/summary";
import {
  Window_AdvancedCommandPokemonEx, Window_AdvancedTextPokemon, Window_UnformattedTextPokemon,
} from "../../ui/windows/SpriteWindowText";
import type { Pokemon } from "../pokemon/Pokemon";

type Sprites = {
  bg?: unknown;
  title: Window_UnformattedTextPokemon;
  list: Window_AdvancedCommandPokemonEx;
  help: Window_UnformattedTextPokemon;
  msgwindow: Window_AdvancedTextPokemon;
};

export class BattleSwapScene {
  protected rentals: Pokemon[] = [];
  protected currentPokemon: Pokemon[] = [];
  protected newPokemon: Pokemon[] = [];
  protected choices: number[] = [];
  /** 0 = rental (pick 3 out of 6), 1 = swap (pick one of yours), 2 = swap (pick theirs) */
  protected mode = 0;
  protected viewport!: Viewport;
  protected sprites!: Sprites;

  protected get spriteHash(): SpriteHash {
    return this.sprites as unknown as SpriteHash;
  }

  async pbStartRentScene(rentals: Pokemon[]): Promise<void> {
    this.rentals = rentals;
    this.mode = 0; // rental (pick 3 out of 6 initial Pokémon)
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {} as Sprites;
    addBackgroundPlane(this.sprites as never, "bg", "rentbg", this.viewport);
    this.sprites.title = Window_UnformattedTextPokemon.newWithSize(
      _INTL("RENTAL POKéMON"), 0, 0, Graphics.width, 64, this.viewport,
    );
    this.sprites.list = Window_AdvancedCommandPokemonEx.newWithSize(
      [], 0, 64, Graphics.width, Graphics.height - 128, this.viewport,
    ) as Window_AdvancedCommandPokemonEx;
    this.sprites.help = Window_UnformattedTextPokemon.newWithSize(
      "", 0, Graphics.height - 64, Graphics.width, 64, this.viewport,
    );
    // NOTE (Ruby parity): Graphics.height as the width (005_UI_BattleSwap.rb:19);
    // the swap scene uses Graphics.width.
    this.sprites.msgwindow = Window_AdvancedTextPokemon.newWithSize(
      "", 0, Graphics.height - 64, Graphics.height, 64, this.viewport,
    );
    this.sprites.msgwindow.visible = false;
    this.pbUpdateChoices([]);
    await pbDeactivateWindows(this.spriteHash);
    await pbFadeInAndShow(this.spriteHash, null, () => this.pbUpdate());
  }

  async pbStartSwapScene(currentPokemon: Pokemon[], newPokemon: Pokemon[]): Promise<void> {
    this.currentPokemon = currentPokemon;
    this.newPokemon = newPokemon;
    this.mode = 1; // swap (pick 1 out of 3 opponent's Pokémon to take)
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {} as Sprites;
    addBackgroundPlane(this.sprites as never, "bg", "swapbg", this.viewport);
    this.sprites.title = Window_UnformattedTextPokemon.newWithSize(
      _INTL("POKéMON SWAP"), 0, 0, Graphics.width, 64, this.viewport,
    );
    this.sprites.list = Window_AdvancedCommandPokemonEx.newWithSize(
      [], 0, 64, Graphics.width, Graphics.height - 128, this.viewport,
    ) as Window_AdvancedCommandPokemonEx;
    this.sprites.help = Window_UnformattedTextPokemon.newWithSize(
      "", 0, Graphics.height - 64, Graphics.width, 64, this.viewport,
    );
    this.sprites.msgwindow = Window_AdvancedTextPokemon.newWithSize(
      "", 0, Graphics.height - 64, Graphics.width, 64, this.viewport,
    );
    this.sprites.msgwindow.visible = false;
    this.pbInitSwapScreen();
    await pbDeactivateWindows(this.spriteHash);
    await pbFadeInAndShow(this.spriteHash, null, () => this.pbUpdate());
  }

  pbInitSwapScreen(): void {
    const commands = this.pbGetCommands(this.currentPokemon, []);
    commands.push(_INTL("CANCEL"));
    this.sprites.help.text = _INTL("Select Pokémon to swap.");
    this.sprites.list.commands = commands;
    this.sprites.list.index = 0;
    this.mode = 1;
  }

  /** End the scene here */
  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(this.spriteHash, () => this.pbUpdate());
    pbDisposeSpriteHash(this.spriteHash as never);
    this.viewport.dispose();
  }

  async pbShowCommands(commands: string[]): Promise<number> {
    return UIHelper.pbShowCommands(this.sprites.msgwindow as never, null, commands, 0, () => this.pbUpdate());
  }

  async pbConfirm(message: string): Promise<boolean> {
    return UIHelper.pbConfirm(this.sprites.msgwindow, message, () => this.pbUpdate());
  }

  pbGetCommands(list: Pokemon[], choices: number[]): string[] {
    const commands: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const pkmn = list[i]!;
      const category = pkmn.speciesData().category;
      let cmd = _INTL("{1} - {2} Pokémon", pkmn.speciesName(), category);
      if (choices.includes(i)) cmd = "<c3=E82010,F8A8B8>" + cmd; // Red text
      commands.push(cmd);
    }
    return commands;
  }

  /** Processes the scene */
  async pbChoosePokemon(canCancel: boolean): Promise<number> {
    let ret = 0;
    await pbActivateWindow(this.spriteHash, "list", async () => {
      for (;;) {
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        if (Input.trigger(Input.BACK) && canCancel) {
          ret = -1;
          return;
        } else if (Input.trigger(Input.USE)) {
          const index = this.sprites.list.index;
          if (index === this.sprites.list.commands.length - 1 && canCancel) {
            ret = -1;
          } else if (index === this.sprites.list.commands.length - 2 && canCancel && this.mode === 2) {
            ret = -2;
          } else {
            ret = index;
          }
          return;
        }
      }
    });
    return ret;
  }

  pbUpdateChoices(choices: number[]): void {
    const commands = this.pbGetCommands(this.rentals, choices);
    this.choices = choices;
    switch (choices.length) {
      case 0:
        this.sprites.help.text = _INTL("Choose the first Pokémon.");
        break;
      case 1:
        this.sprites.help.text = _INTL("Choose the second Pokémon.");
        break;
      default:
        this.sprites.help.text = _INTL("Choose the third Pokémon.");
    }
    this.sprites.list.commands = commands;
  }

  pbSwapChosen(_pkmnindex: number): void {
    const commands = this.pbGetCommands(this.newPokemon, []);
    commands.push(_INTL("PKMN FOR SWAP"));
    commands.push(_INTL("CANCEL"));
    this.sprites.help.text = _INTL("Select Pokémon to accept.");
    this.sprites.list.commands = commands;
    this.sprites.list.index = 0;
    this.mode = 2;
  }

  pbSwapCanceled(): void {
    this.pbInitSwapScreen();
  }

  async pbSummary(list: Pokemon[], index: number): Promise<void> {
    const visibleSprites = await pbFadeOutAndHide(this.spriteHash, () => this.pbUpdate());
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene);
    this.sprites.list.index = await screen.pbStartScreen(list, index);
    await pbFadeInAndShow(this.spriteHash, visibleSprites, () => this.pbUpdate());
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }
}

/** The scene calls BattleSwapScreen makes (the real scene, or a test's). */
export interface BattleSwapSceneLike {
  pbStartRentScene(rentals: Pokemon[]): Promise<void>;
  pbStartSwapScene(currentPokemon: Pokemon[], newPokemon: Pokemon[]): Promise<void>;
  pbChoosePokemon(canCancel: boolean): Promise<number>;
  pbShowCommands(commands: string[]): Promise<number>;
  pbConfirm(message: string): Promise<boolean>;
  pbSummary(list: Pokemon[], index: number): Promise<void>;
  pbUpdateChoices(choices: number[]): void;
  pbSwapChosen(pkmnindex: number): void;
  pbSwapCanceled(): void;
  pbEndScene(): Promise<void>;
}

export class BattleSwapScreen {
  constructor(private scene: BattleSwapSceneLike) {}

  async pbStartRent(rentals: Pokemon[]): Promise<Pokemon[]> {
    await this.scene.pbStartRentScene(rentals);
    const chosen: number[] = [];
    for (;;) {
      const index = await this.scene.pbChoosePokemon(false);
      const commands: string[] = [];
      commands.push(_INTL("SUMMARY"));
      if (chosen.includes(index)) {
        commands.push(_INTL("DESELECT"));
      } else {
        commands.push(_INTL("RENT"));
      }
      commands.push(_INTL("OTHERS"));
      const command = await this.scene.pbShowCommands(commands);
      switch (command) {
        case 0:
          await this.scene.pbSummary(rentals, index);
          break;
        case 1:
          if (chosen.includes(index)) {
            chosen.splice(chosen.indexOf(index), 1);
            this.scene.pbUpdateChoices([...chosen]);
          } else {
            chosen.push(index);
            this.scene.pbUpdateChoices([...chosen]);
            if (chosen.length === 3) {
              if (await this.scene.pbConfirm(_INTL("Are these three Pokémon OK?"))) {
                const retval: Pokemon[] = [];
                for (const i of chosen) retval.push(rentals[i]!);
                await this.scene.pbEndScene();
                return retval;
              } else {
                chosen.splice(chosen.indexOf(index), 1);
                this.scene.pbUpdateChoices([...chosen]);
              }
            }
          }
          break;
      }
    }
  }

  async pbStartSwap(currentPokemon: Pokemon[], newPokemon: Pokemon[]): Promise<boolean> {
    await this.scene.pbStartSwapScene(currentPokemon, newPokemon);
    for (;;) {
      let pkmn = await this.scene.pbChoosePokemon(true);
      if (pkmn >= 0) {
        const commands = [_INTL("SUMMARY"), _INTL("SWAP"), _INTL("RECHOOSE")];
        const command = await this.scene.pbShowCommands(commands);
        switch (command) {
          case 0:
            await this.scene.pbSummary(currentPokemon, pkmn);
            break;
          case 1: {
            this.scene.pbSwapChosen(pkmn);
            const yourPkmn = pkmn;
            for (;;) {
              pkmn = await this.scene.pbChoosePokemon(true);
              if (pkmn >= 0) {
                if (await this.scene.pbConfirm(_INTL("Accept this Pokémon?"))) {
                  await this.scene.pbEndScene();
                  currentPokemon[yourPkmn] = newPokemon[pkmn]!;
                  return true;
                }
              } else if (pkmn === -2) {
                this.scene.pbSwapCanceled();
                break; // Back to first screen
              } else if (pkmn === -1) {
                if (await this.scene.pbConfirm(_INTL("Quit swapping?"))) {
                  await this.scene.pbEndScene();
                  return false;
                }
              }
            }
            break;
          }
        }
      } else if (await this.scene.pbConfirm(_INTL("Quit swapping?"))) {
        // Canceled
        await this.scene.pbEndScene();
        return false;
      }
    }
  }
}
