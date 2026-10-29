// Port of the Relic Stone parts of Data/Scripts/014_Pokemon/001_Pokemon-related/
// 002_ShadowPokemon_Other.rb: RelicStoneScene, RelicStoneScreen,
// pbRelicStoneScreen and pbRelicStone. pbPurify is in
// ../../game/pokemon/shadowPokemonOther.ts. The game has no relicstonebg
// graphic, so the background plane stays hidden, as in Ruby.

import { G } from "../../game/globals";
import { pbPurify } from "../../game/pokemon/shadowPokemonOther";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { UIHelper } from "../bag/UIHelper";
import { pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbMessage } from "../messages";
import { pbChoosePokemon } from "../party/party";
import { addBackgroundPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";

//===============================================================================
// Relic Stone scene.
//===============================================================================
export class RelicStoneScene {
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private pokemon: Pokemon | null = null;

  pbPurify(): void {}

  pbUpdate(): void {
    pbUpdateSpriteHash(asHash(this.sprites));
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(asHash(this.sprites));
    this.viewport.dispose();
  }

  async pbDisplay(msg: string, brief = false): Promise<void> {
    await UIHelper.pbDisplay(this.sprites.msgwindow as Window_AdvancedTextPokemon, msg, brief, () => this.pbUpdate());
  }

  async pbConfirm(msg: string): Promise<boolean> {
    return UIHelper.pbConfirm(this.sprites.msgwindow as Window_AdvancedTextPokemon, msg, () => this.pbUpdate());
  }

  async pbStartScene(pokemon: Pokemon): Promise<void> {
    await preloadBitmaps(["Graphics/Pictures/relicstonebg"]);
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.pokemon = pokemon;
    addBackgroundPlane(this.sprites, "bg", "relicstonebg", this.viewport);
    const msgwindow = new Window_AdvancedTextPokemon("");
    this.sprites.msgwindow = msgwindow;
    msgwindow.viewport = this.viewport;
    msgwindow.x = 0;
    msgwindow.y = Graphics.height - 96;
    msgwindow.width = Graphics.width;
    msgwindow.height = 96;
    msgwindow.text = "";
    msgwindow.visible = true;
    await pbDeactivateWindows(asHash(this.sprites));
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }
}

//===============================================================================
//
//===============================================================================
export class RelicStoneScreen {
  constructor(private scene: RelicStoneScene) {}

  pbDisplay(x: string): Promise<void> { return this.scene.pbDisplay(x); }

  pbConfirm(x: string): Promise<boolean> { return this.scene.pbConfirm(x); }

  pbUpdate(): void {}

  pbRefresh(): void {}

  async pbStartScreen(pokemon: Pokemon): Promise<void> {
    await this.scene.pbStartScene(pokemon);
    this.scene.pbPurify();
    await pbPurify(pokemon, this);
    await this.scene.pbEndScene();
  }
}

/** pbRelicStoneScreen(pkmn): returns nil (pbStartScreen's value), as in Ruby. */
export async function pbRelicStoneScreen(pkmn: Pokemon): Promise<null> {
  let retval: null = null;
  await pbFadeOutIn(async () => {
    const scene = new RelicStoneScene();
    const screen = new RelicStoneScreen(scene);
    await screen.pbStartScreen(pkmn);
    retval = null;
  });
  return retval;
}

//===============================================================================
//
//===============================================================================
export async function pbRelicStone(): Promise<void> {
  const player = G.player as Player;
  if (!player.party.some((pkmn) => pkmn.purifiable())) {
    await pbMessage(_INTL("You have no Pokémon that can be purified."));
    return;
  }
  await pbMessage(_INTL("There's a Pokémon that may open the door to its heart!"));
  // Choose a purifiable Pokemon
  await pbChoosePokemon(1, 2, (pkmn) => pkmn.able() && pkmn.shadowPokemon() && pkmn.heartGauge === 0);
  if (Number(G.gameVariables.get(1)) >= 0) {
    await pbRelicStoneScreen(player.party[Number(G.gameVariables.get(1))]!);
  }
}
