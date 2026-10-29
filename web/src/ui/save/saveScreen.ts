// Port of 016_UI/014_UI_Save.rb: PokemonSave_Scene, PokemonSaveScreen and
// pbSaveScreen.

import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { FRAME_RATE } from "../../game/GameCharacter";
import { Game } from "../../game/Game";
import { G } from "../../game/globals";
import { pbSEPlay } from "../../game/GameSystem";
import { SaveData } from "../../game/save/SaveData";
import { pbDisposeSpriteHash } from "../messageConfig";
import { pbConfirmMessage, pbConfirmMessageSerious, pbMessage } from "../messages";
import { pbGetMapNameFromId } from "../planes";
import { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";

interface SaveTrainer {
  name: string;
  gender?: number;
  badgeCount?: number;
  badges?: boolean[];
  hasPokedex?: boolean;
  pokedex?: { ownedCount?(): number; seenCount?(): number };
}

export class PokemonSave_Scene {
  private viewport!: Viewport;
  private sprites: Record<string, Window_AdvancedTextPokemon> = {};

  pbStartScreen(): void {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    const stats = (G as unknown as { stats?: { playTime?: number } }).stats;
    const totalsec = Math.floor(stats?.playTime ?? Graphics.frameCount / FRAME_RATE);
    const hour = Math.floor(totalsec / 60 / 60);
    const min = Math.floor(totalsec / 60) % 60;
    const mapname = pbGetMapNameFromId(G.gameMap!.mapId);
    const player = G.player as unknown as SaveTrainer;
    const textColor = ["0070F8,78B8E8", "E82010,F8A8B8", "0070F8,78B8E8"][player.gender ?? 0] ?? "0070F8,78B8E8";
    const locationColor = "209808,90F090"; // green
    let loctext = `<ac><c3=${locationColor}>${mapname}</c3></ac>`;
    loctext += `Player<r><c3=${textColor}>${player.name}</c3><br>`;
    loctext += hour > 0 ? `Time<r><c3=${textColor}>${hour}h ${min}m</c3><br>` : `Time<r><c3=${textColor}>${min}m</c3><br>`;
    const badges = player.badgeCount ?? (player.badges ?? []).filter(Boolean).length;
    loctext += `Badges<r><c3=${textColor}>${badges}</c3><br>`;
    if (player.hasPokedex) {
      loctext += `Pokédex<r><c3=${textColor}>${player.pokedex?.ownedCount?.() ?? 0}/${player.pokedex?.seenCount?.() ?? 0}</c3>`;
    }
    const w = new Window_AdvancedTextPokemon(loctext);
    w.viewport = this.viewport;
    w.x = 0;
    w.y = 0;
    if (w.width < 228) w.width = 228;
    w.visible = true;
    this.sprites.locwindow = w;
  }

  pbEndScreen(): void {
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

export class PokemonSaveScreen {
  constructor(private scene: PokemonSave_Scene) {}

  async pbSaveScreen(): Promise<boolean> {
    let ret = false;
    this.scene.pbStartScreen();
    const temp = G.gameTemp as unknown as { begunNewGame: boolean };
    if (await pbConfirmMessage("Would you like to save the game?")) {
      if ((await SaveData.exists()) && temp.begunNewGame) {
        await pbMessage("WARNING!");
        await pbMessage("There is a different game file that is already saved.");
        await pbMessage("If you save now, the other file's adventure, including items and Pokémon, will be entirely lost.");
        if (!(await pbConfirmMessageSerious("Are you sure you want to save now and overwrite the other save file?"))) {
          pbSEPlay("GUI save choice");
          this.scene.pbEndScreen();
          return false;
        }
      }
      temp.begunNewGame = false;
      pbSEPlay("GUI save choice");
      if (await Game.save()) {
        await pbMessage(`\\se[]${G.player!.name} saved the game.\\me[GUI save game]\\wtnp[30]`);
        ret = true;
      } else {
        await pbMessage("\\se[]Save failed.\\wtnp[30]");
        ret = false;
      }
    } else {
      pbSEPlay("GUI save choice");
    }
    this.scene.pbEndScreen();
    return ret;
  }
}

export async function pbSaveScreen(): Promise<boolean> {
  return new PokemonSaveScreen(new PokemonSave_Scene()).pbSaveScreen();
}
