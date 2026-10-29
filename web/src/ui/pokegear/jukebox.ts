// Port of 016_UI/011_UI_Jukebox.rb (PokemonJukebox_Scene,
// PokemonJukeboxScreen), the Pokégear's "Radio" in this game.
//
// "Play: Custom..." lists Audio/BGM from the asset index, whose names are
// lowercased (the browser can't list the folder), so the list shows them in
// lower case.

import { assetExists } from "../../core/assets";
import { G } from "../../game/globals";
import { pbBGMPlay, pbPlayCancelSE, pbPlayDecisionSE } from "../../game/GameSystem";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { IconSprite } from "../SpriteWrapper";
import { Window_CommandPokemon, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";

export class PokemonJukebox_Scene {
  private commands: string[] = [];
  private viewport!: Viewport;
  private sprites: Sprites = {};

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbStartScene(commands: string[]): Promise<void> {
    await preloadBitmaps(["Graphics/Pictures/jukeboxbg"]);
    this.commands = commands;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    const background = new IconSprite(0, 0, this.viewport);
    background.setBitmapFile("Graphics/Pictures/jukeboxbg");
    this.sprites.background = background;
    const header = Window_UnformattedTextPokemon.newWithSize(_INTL("Jukebox"), 2, -18, 128, 64, this.viewport);
    header.baseColor = new Color(248, 248, 248);
    header.shadowColor = new Color(0, 0, 0);
    header.windowskin = null;
    this.sprites.header = header;
    const cmds = Window_CommandPokemon.newWithSize(this.commands, 94, 92, 324, 224, this.viewport);
    cmds.windowskin = null;
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
        break;
      } else if (Input.trigger(Input.USE)) {
        ret = (this.sprites.commands as Window_CommandPokemon).index;
        break;
      }
    }
    return ret;
  }

  pbSetCommands(newcommands: string[] | null, newindex: number): void {
    const cmds = this.sprites.commands as Window_CommandPokemon;
    cmds.commands = !newcommands ? this.commands : newcommands;
    cmds.index = newindex;
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

/** $PokemonMap's flute flags. */
function setFlutes(white: boolean, black: boolean): void {
  const map = (G as unknown as { pokemonMap?: { whiteFluteUsed: boolean; blackFluteUsed: boolean } }).pokemonMap;
  if (!map) return;
  map.whiteFluteUsed = white;
  map.blackFluteUsed = black;
}

/** $game_system.setDefaultBGM(name) (a default BGM overrides the maps' own). */
function setDefaultBGM(name: string | null): void {
  const sys = G.gameSystem as unknown as { setDefaultBGM?: (n: string | null) => void };
  if (sys.setDefaultBGM) sys.setDefaultBGM(name);
  else if (name) pbBGMPlay(name);
}

let bgmKeys: string[] = [];

/** Loads the Audio/BGM file names for "Play: Custom..." from the dev server's asset index. */
export async function loadJukeboxFiles(): Promise<void> {
  if (bgmKeys.length > 0) return;
  try {
    const res = await fetch("/game/__index.json");
    bgmKeys = ((await res.json()) as string[]).filter((k) => k.startsWith("audio/bgm/") && assetExists(k));
  } catch {
    bgmKeys = [];
  }
}

/** The files in Audio/BGM (Dir.glob for ogg/wav/mid/midi), without extension, sorted case-insensitively. */
function bgmFiles(): string[] {
  const files: string[] = [];
  for (const ext of [".ogg", ".wav", ".mid", ".midi"]) {
    for (const key of bgmKeys) {
      if (!key.endsWith(ext)) continue;
      const name = key.slice("audio/bgm/".length, key.length - ext.length);
      if (!name.includes("/")) files.push(name);
    }
  }
  return [...new Set(files)].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
}

export class PokemonJukeboxScreen {
  constructor(private scene: PokemonJukebox_Scene) {}

  async pbStartScreen(): Promise<void> {
    const commands: string[] = [];
    const cmdMarch = commands.push(_INTL("Play: Pokémon March")) - 1;
    const cmdLullaby = commands.push(_INTL("Play: Pokémon Lullaby")) - 1;
    const cmdOak = commands.push(_INTL("Play: Oak")) - 1;
    const cmdCustom = commands.push(_INTL("Play: Custom...")) - 1;
    const cmdTurnOff = commands.push(_INTL("Stop")) - 1;
    commands.push(_INTL("Exit"));
    await loadJukeboxFiles();
    await this.scene.pbStartScene(commands);
    for (;;) {
      const cmd = await this.scene.pbScene();
      if (cmd < 0) {
        pbPlayCloseMenuSE();
        break;
      } else if (cmdMarch >= 0 && cmd === cmdMarch) {
        pbPlayDecisionSE();
        pbBGMPlay("Radio - March", 100, 100);
        setFlutes(true, false);
      } else if (cmdLullaby >= 0 && cmd === cmdLullaby) {
        pbPlayDecisionSE();
        pbBGMPlay("Radio - Lullaby", 100, 100);
        setFlutes(false, true);
      } else if (cmdOak >= 0 && cmd === cmdOak) {
        pbPlayDecisionSE();
        pbBGMPlay("Radio - Oak", 100, 100);
        setFlutes(false, false);
      } else if (cmdCustom >= 0 && cmd === cmdCustom) {
        pbPlayDecisionSE();
        const files = bgmFiles();
        this.scene.pbSetCommands(files, 0);
        for (;;) {
          const cmd2 = await this.scene.pbScene();
          if (cmd2 < 0) {
            pbPlayCancelSE();
            break;
          }
          pbPlayDecisionSE();
          setDefaultBGM(files[cmd2] ?? null);
          setFlutes(false, false);
        }
        this.scene.pbSetCommands(null, cmdCustom);
      } else if (cmdTurnOff >= 0 && cmd === cmdTurnOff) {
        pbPlayDecisionSE();
        setDefaultBGM(null);
        // pbBGMPlay(pbResolveAudioFile($game_map.bgm_name, $game_map.bgm.volume, $game_map.bgm.pitch))
        const map = G.gameMap as unknown as { bgmName?(): string; map?: { bgm?: { volume: number; pitch: number } } } | null;
        if (map?.bgmName) pbBGMPlay(map.bgmName(), map.map?.bgm?.volume, map.map?.bgm?.pitch);
        setFlutes(false, false);
      } else { // Exit
        pbPlayCloseMenuSE();
        break;
      }
    }
    await this.scene.pbEndScene();
  }
}
