// Port of 016_UI/002_UI_Pokedex_Menu.rb (Window_DexesList,
// PokemonPokedexMenu_Scene, PokemonPokedexMenuScreen): choosing which Dex
// list to view when more than one is accessible. No plugin patches it.

import { pbGetRegionalDexLength } from "../../data/gameData/miscPBSData";
import { pbPlayDecisionSE } from "../../game/GameSystem";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, type Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbDrawImagePositions, pbDrawShadowText } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { IconSprite } from "../SpriteWrapper";
import { Window_AdvancedTextPokemon, Window_CommandPokemon } from "../windows/SpriteWindowText";
import { dexGlobals, player, pokedexNames } from "./dexCommon";
import { PokemonPokedex_Scene, PokemonPokedexScreen } from "./pokedexMain";

const DEX = "Graphics/Pictures/Pokedex/";

/** [seen, owned, dex length] per Dex. */
type DexCounts = [number, number, number];

export class Window_DexesList extends Window_CommandPokemon {
  private commands2: DexCounts[] | undefined;

  static create(commands: string[], commands2: DexCounts[], width: number): Window_DexesList {
    const w = new Window_DexesList(commands, width);
    w.commands2 = commands2;
    w._selarrow = new AnimatedBitmap("Graphics/Pictures/selarrow_white");
    w.baseColor = new Color(248, 248, 248);
    w.shadowColor = new Color(0, 0, 0);
    w.windowskin = null;
    return w;
  }

  override drawItem(index: number, count: number, rect: Rect): void {
    super.drawItem(index, count, rect);
    const commands2 = this.commands2;
    if (!commands2 || index < 0 || index >= commands2.length) return;
    const [seen, own, total] = commands2[index]!;
    pbDrawShadowText(this.contents!, rect.x + 254, rect.y, 64, rect.height, String(seen), this.baseColor, this.shadowColor, 1);
    pbDrawShadowText(this.contents!, rect.x + 350, rect.y, 64, rect.height, String(own), this.baseColor, this.shadowColor, 1);
    const allseen = seen >= total;
    const allown = own >= total;
    pbDrawImagePositions(this.contents!, [
      [`${DEX}icon_menuseenown`, rect.x + 236, rect.y + 6, allseen ? 24 : 0, 0, 24, 24],
      [`${DEX}icon_menuseenown`, rect.x + 332, rect.y + 6, allown ? 24 : 0, 24, 24, 24],
    ]);
  }
}

export class PokemonPokedexMenu_Scene {
  private commands: string[] = [];
  private viewport!: Viewport;
  private sprites: Sprites = {};

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbStartScene(commands: string[], commands2: DexCounts[]): Promise<void> {
    await preloadBitmaps([`${DEX}bg_menu`, `${DEX}icon_menuseenown`, "Graphics/Pictures/selarrow_white"]);
    this.commands = commands;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    const background = new IconSprite(0, 0, this.viewport);
    background.setBitmapFile(_INTL(`${DEX}bg_menu`));
    this.sprites.background = background;
    const headings = Window_AdvancedTextPokemon.newWithSize(
      _INTL("<c3=F8F8F8,C02028>SEEN<r>OBTAINED</c3>"), 286, 136, 208, 64, this.viewport,
    );
    headings.windowskin = null;
    this.sprites.headings = headings;
    const cmds = Window_DexesList.create(commands, commands2, Graphics.width - 84);
    cmds.x = 40;
    cmds.y = 192;
    cmds.height = 192;
    cmds.viewport = this.viewport;
    this.sprites.commands = cmds;
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbScene(): Promise<number> {
    let ret = -1;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        ret = (this.sprites.commands as Window_DexesList).index;
        if (ret === this.commands.length - 1) pbPlayCloseMenuSE();
        else pbPlayDecisionSE();
        break;
      }
    }
    return ret;
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class PokemonPokedexMenuScreen {
  constructor(private scene: PokemonPokedexMenu_Scene) {}

  async pbStartScreen(): Promise<void> {
    const commands: string[] = [];
    const commands2: DexCounts[] = [];
    const dexnames = pokedexNames();
    const dex = player().pokedex;
    for (const d of dex.accessibleDexes) {
      // (Ruby indexes the names with the Dex number, so the National Dex's -1 reads the last name)
      const name = dexnames.at(d);
      if (name == null) commands.push(_INTL("Pokédex"));
      else if (Array.isArray(name)) commands.push(name[0]);
      else commands.push(name);
      commands2.push([dex.seenCount(d), dex.ownedCount(d), pbGetRegionalDexLength(d)]);
    }
    commands.push(_INTL("Exit"));
    await this.scene.pbStartScene(commands, commands2);
    for (;;) {
      const cmd = await this.scene.pbScene();
      if (cmd < 0 || cmd >= commands2.length) break; // Cancel/Exit
      dexGlobals().pokedexDex = dex.accessibleDexes[cmd]!;
      await pbFadeOutIn(async () => {
        const scene = new PokemonPokedex_Scene();
        const screen = new PokemonPokedexScreen(scene);
        await screen.pbStartScreen();
      });
    }
    await this.scene.pbEndScene();
  }
}
