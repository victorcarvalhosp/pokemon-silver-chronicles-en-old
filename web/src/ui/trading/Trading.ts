// Port of Data/Scripts/016_UI/001_Non-interactive UI/005_UI_Trading.rb
// (PokemonTrade_Scene, pbStartTrade), with Following Pokemon EX's
// PokemonTrade_Scene#pbEndScreen alias (Script Additions/Refresh.rb:75),
// which refreshes the follower after the trade (and its trade evolution).
//
// The Poké Ball / Pokémon animations are PictureEx processes (1/20 s units,
// advanced once per 60 Hz tick as in the rest of the port).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { FollowingPkmn } from "../../game/following/FollowingPkmn";
import { pbBGMStop, pbPlayDecisionSE } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { pbItemEvolutionScene } from "../../game/items/itemUtilities";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonOwner } from "../../game/pokemon/PokemonOwner";
import type { Player } from "../../game/trainer/Player";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn, pbFadeOutInWithMusic } from "../fades";
import { pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbCreateMessageWindow, pbDisposeMessageWindow, pbMessageDisplay, pbMessageWaitForInput } from "../messages";
import { addBackgroundOrColoredPlane } from "../planes";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../pokedex/pokedexEntry";
import { preloadBitmaps } from "../rpgCache";
import { assetExists } from "../../core/assets";
import { asHash, type Sprites } from "../scenes/frames";
import { PictureEx, PictureOrigin, setPictureIconSprite, setPictureSprite } from "../scenes/PictureEx";
import { IconSprite } from "../SpriteWrapper";
import { PokemonSprite, preloadPokemonSprite, SpeciesFiles } from "../sprites/pokemonSprite";
import type { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";

const player = () => G.player as unknown as Player;
const pad5 = (n: number) => String(n).padStart(5, "0");

export class PokemonTrade_Scene {
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private pokemon!: Pokemon;
  private pokemon2!: Pokemon;
  private trader1 = "";
  private trader2 = "";
  private ended = false;

  private get msgwindow(): Window_AdvancedTextPokemon { return this.sprites.msgwindow as Window_AdvancedTextPokemon; }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  async pbRunPictures(pictures: PictureEx[], sprites: (PokemonSprite | IconSprite)[]): Promise<void> {
    for (;;) {
      for (const pic of pictures) pic.update();
      sprites.forEach((sprite, i) => {
        if (sprite instanceof IconSprite) setPictureIconSprite(sprite as never, pictures[i]!);
        else setPictureSprite(sprite as never, pictures[i]!);
      });
      await Graphics.update();
      Input.update();
      if (!pictures.some((pic) => pic.running())) break;
    }
  }

  async pbStartScreen(pokemon: Pokemon, pokemon2: Pokemon, trader1: string, trader2: string): Promise<void> {
    this.sprites = {};
    this.pokemon = pokemon;
    this.pokemon2 = pokemon2;
    this.trader1 = trader1;
    this.trader2 = trader2;
    // Ruby loads these synchronously when the scene needs them.
    const balls = [pokemon.pokeBall, pokemon2.pokeBall].flatMap((b) =>
      [`Graphics/Battle animations/ball_${b}`, `Graphics/Battle animations/ball_${b}_open`]);
    await Promise.all([
      preloadPokemonSprite(pokemon), preloadPokemonSprite(pokemon2),
      preloadBitmaps([...balls.filter((b) => assetExists(b)), "Graphics/Pictures/tradebg"]),
    ]);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    addBackgroundOrColoredPlane(this.sprites, "background", "tradebg", new Color(248, 248, 248), this.viewport);
    const rsprite1 = new PokemonSprite(this.viewport);
    this.sprites.rsprite1 = rsprite1;
    rsprite1.setPokemonBitmap(this.pokemon, false);
    rsprite1.setOffset(PictureOrigin.BOTTOM);
    rsprite1.x = Math.floor(Graphics.width / 2);
    rsprite1.y = 264;
    rsprite1.z = 10;
    this.pokemon.speciesData().applyMetricsToSprite(rsprite1, 1);
    const rsprite2 = new PokemonSprite(this.viewport);
    this.sprites.rsprite2 = rsprite2;
    rsprite2.setPokemonBitmap(this.pokemon2, false);
    rsprite2.setOffset(PictureOrigin.BOTTOM);
    rsprite2.x = Math.floor(Graphics.width / 2);
    rsprite2.y = 264;
    rsprite2.z = 10;
    this.pokemon2.speciesData().applyMetricsToSprite(rsprite2, 1);
    rsprite2.visible = false;
    this.sprites.msgwindow = pbCreateMessageWindow(this.viewport);
    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbScene1(): Promise<void> {
    const rsprite1 = this.sprites.rsprite1 as PokemonSprite;
    const spriteBall = new IconSprite(0, 0, this.viewport);
    const pictureBall = new PictureEx(0);
    const picturePoke = new PictureEx(0);
    const ballimage = `Graphics/Battle animations/ball_${this.pokemon.pokeBall}`;
    const ballopenimage = `Graphics/Battle animations/ball_${this.pokemon.pokeBall}_open`;
    // Starting position of ball
    pictureBall.setXY(0, Math.floor(Graphics.width / 2), 48);
    pictureBall.setName(0, ballimage);
    pictureBall.setSrcSize(0, 32, 64);
    pictureBall.setOrigin(0, PictureOrigin.CENTER);
    pictureBall.setVisible(0, true);
    // Starting position of sprite
    picturePoke.setXY(0, rsprite1.x, rsprite1.y);
    picturePoke.setOrigin(0, PictureOrigin.BOTTOM);
    picturePoke.setVisible(0, true);
    // Change Pokémon color
    picturePoke.moveColor(2, 5, new Color(31 * 8, 22 * 8, 30 * 8, 255));
    // Recall
    let delay = picturePoke.totalDuration();
    picturePoke.setSE(delay, "Battle recall");
    pictureBall.setName(delay, ballopenimage);
    pictureBall.setSrcSize(delay, 32, 64);
    // Move sprite to ball
    picturePoke.moveZoom(delay, 8, 0);
    picturePoke.moveXY(delay, 8, Math.floor(Graphics.width / 2), 48);
    picturePoke.setSE(delay + 5, "Battle jump to ball");
    picturePoke.setVisible(delay + 8, false);
    delay = picturePoke.totalDuration() + 1;
    pictureBall.setName(delay, ballimage);
    pictureBall.setSrcSize(delay, 32, 64);
    // Make Poké Ball go off the top of the screen
    delay = picturePoke.totalDuration() + 10;
    pictureBall.moveXY(delay, 6, Math.floor(Graphics.width / 2), -32);
    // Play animation
    await this.pbRunPictures([picturePoke, pictureBall], [rsprite1, spriteBall]);
    spriteBall.dispose();
  }

  async pbScene2(): Promise<void> {
    const rsprite2 = this.sprites.rsprite2 as PokemonSprite;
    const spriteBall = new IconSprite(0, 0, this.viewport);
    const pictureBall = new PictureEx(0);
    const picturePoke = new PictureEx(0);
    const ballimage = `Graphics/Battle animations/ball_${this.pokemon2.pokeBall}`;
    const ballopenimage = `Graphics/Battle animations/ball_${this.pokemon2.pokeBall}_open`;
    // Starting position of ball
    pictureBall.setXY(0, Math.floor(Graphics.width / 2), -32);
    pictureBall.setName(0, ballimage);
    pictureBall.setSrcSize(0, 32, 64);
    pictureBall.setOrigin(0, PictureOrigin.CENTER);
    pictureBall.setVisible(0, true);
    // Starting position of sprite
    picturePoke.setOrigin(0, PictureOrigin.BOTTOM);
    picturePoke.setZoom(0, 0);
    picturePoke.setColor(0, new Color(31 * 8, 22 * 8, 30 * 8, 255));
    picturePoke.setVisible(0, false);
    // Dropping ball
    const y = Graphics.height - 96 - 16 - 16; // end point of Poké Ball
    let delay = picturePoke.totalDuration() + 2;
    for (let i = 0; i < 4; i++) {
      const t = [4, 4, 3, 2][i]!; // Time taken to rise or fall for each bounce
      const d = [1, 2, 4, 8][i]!; // Fraction of the starting height each bounce rises to
      if (i === 0) delay -= t;
      if (i > 0) {
        pictureBall.setZoomXY(delay, 100 + (5 * (5 - i)), 100 - (5 * (5 - i))); // Squish
        pictureBall.moveZoom(delay, 2, 100); // Unsquish
        pictureBall.moveXY(delay, t, Math.floor(Graphics.width / 2), y - Math.floor(100 / d));
      }
      pictureBall.moveXY(delay + t, t, Math.floor(Graphics.width / 2), y);
      pictureBall.setSE(delay + (2 * t), "Battle ball drop");
      delay = pictureBall.totalDuration();
    }
    picturePoke.setXY(delay, Math.floor(Graphics.width / 2), y);
    // Open Poké Ball
    delay = pictureBall.totalDuration() + 15;
    pictureBall.setSE(delay, "Battle recall");
    pictureBall.setName(delay, ballopenimage);
    pictureBall.setSrcSize(delay, 32, 64);
    pictureBall.setVisible(delay + 5, false);
    // Pokémon appears and enlarges
    picturePoke.setVisible(delay, true);
    picturePoke.moveZoom(delay, 8, 100);
    picturePoke.moveXY(delay, 8, Math.floor(Graphics.width / 2), rsprite2.y);
    // Return Pokémon's color to normal and play cry
    delay = picturePoke.totalDuration();
    picturePoke.moveColor(delay, 5, new Color(31 * 8, 22 * 8, 30 * 8, 0));
    const cry = SpeciesFiles.cryFilenameFromPokemon(this.pokemon2);
    if (cry) picturePoke.setSE(delay, cry);
    // Play animation
    await this.pbRunPictures([picturePoke, pictureBall], [rsprite2, spriteBall]);
    spriteBall.dispose();
  }

  /** pbEndScreen, with Following Pokemon EX's follower refresh. */
  async pbEndScreen(needFadeOut = true): Promise<void> {
    // NOTE (Ruby parity): pbTrade already ends the screen inside the Pokédex
    // entry's fade (005_UI_Trading.rb:208) and pbStartTrade ends it again
    // (line 233): the second call runs the (invisible) fade-out and the trade
    // evolution check a second time.
    const msgwindow = this.sprites.msgwindow as Window_AdvancedTextPokemon | undefined;
    if (msgwindow && !this.ended) pbDisposeMessageWindow(msgwindow);
    if (needFadeOut) await pbFadeOutAndHide(asHash(this.sprites));
    if (!this.ended) {
      pbDisposeSpriteHash(this.sprites as never);
      this.viewport.dispose();
    }
    this.ended = true;
    const newspecies = this.pokemon2.checkEvolutionOnTrade(this.pokemon);
    if (newspecies) {
      // evo.pbStartScreen(@pokemon2, newspecies); evo.pbEvolution(false); evo.pbEndScreen
      await pbItemEvolutionScene(this.pokemon2, newspecies, false, undefined, false);
    }
    await FollowingPkmn.refresh(false);
  }

  async pbTrade(): Promise<void> {
    const wasOwned = player().owned(this.pokemon2.species);
    player().pokedex.register(this.pokemon2);
    player().pokedex.setOwned(this.pokemon2.species);
    pbBGMStop();
    this.pokemon.playCry();
    const speciesname1 = Species.get(this.pokemon.species).name;
    const speciesname2 = Species.get(this.pokemon2.species).name;
    const update = () => this.pbUpdate();
    await pbMessageDisplay(this.msgwindow,
      `${this.pokemon.name}\r\nID: ${pad5(this.pokemon.owner.publicId())}   OT: ${this.pokemon.owner.name}\\wtnp[0]`,
      true, null, update);
    await pbMessageWaitForInput(this.msgwindow, 50, true, update);
    pbPlayDecisionSE();
    await this.pbScene1();
    await pbMessageDisplay(this.msgwindow,
      _INTL("For {1}'s {2},\r\n{3} sends {4}.\x01", this.trader1, speciesname1, this.trader2, speciesname2), true, null, update);
    await pbMessageDisplay(this.msgwindow, _INTL("{1} bids farewell to {2}.", this.trader2, speciesname2), true, null, update);
    await this.pbScene2();
    await pbMessageDisplay(this.msgwindow,
      `${this.pokemon2.name}\r\nID: ${pad5(this.pokemon2.owner.publicId())}   OT: ${this.pokemon2.owner.name}\x01`,
      true, null, update);
    await pbMessageDisplay(this.msgwindow, _INTL("Take good care of {1}.", speciesname2), true, null, update);
    // Show Pokédex entry for new species if it hasn't been owned before
    if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && !wasOwned && player().hasPokedex) {
      await pbMessageDisplay(this.msgwindow, _INTL("{1}'s data was added to the Pokédex.", speciesname2), true, null, update);
      player().pokedex.registerLastSeen(this.pokemon2);
      await pbFadeOutIn(async () => {
        const scene = new PokemonPokedexInfo_Scene();
        const screen = new PokemonPokedexInfoScreen(scene);
        await screen.pbDexEntry(this.pokemon2.species);
        await this.pbEndScreen(false);
      });
    }
  }
}

/**
 * The data part of pbStartTrade before the scene: the Pokémon received, with
 * its foreign owner, nickname and moves.
 */
export function pbTradePokemon(pokemonIndex: number, newpoke: Pokemon | Id, nickname: string | null,
  trainerName: string, trainerGender = 0): Pokemon {
  const myPokemon = player().party[pokemonIndex]!;
  let yourPokemon: Pokemon;
  let resetmoves = true;
  if (newpoke instanceof Pokemon) {
    newpoke.owner = PokemonOwner.newForeign(trainerName, trainerGender);
    yourPokemon = newpoke;
    resetmoves = false;
  } else {
    const speciesData = Species.tryGet(newpoke);
    if (!speciesData) throw new Error(_INTL("Species {1} does not exist.", newpoke));
    yourPokemon = new Pokemon(speciesData.id, myPokemon.level);
    yourPokemon.owner = PokemonOwner.newForeign(trainerName, trainerGender);
  }
  yourPokemon.name = nickname;
  yourPokemon.obtainMethod = 2; // traded
  if (resetmoves) yourPokemon.resetMoves();
  yourPokemon.recordFirstMoves();
  return yourPokemon;
}

export async function pbStartTrade(pokemonIndex: number, newpoke: Pokemon | Id, nickname: string | null,
  trainerName: string, trainerGender = 0): Promise<void> {
  G.stats.tradeCount += 1;
  const myPokemon = player().party[pokemonIndex]!;
  const yourPokemon = pbTradePokemon(pokemonIndex, newpoke, nickname, trainerName, trainerGender);
  await pbFadeOutInWithMusic(async () => {
    const evo = new PokemonTrade_Scene();
    await evo.pbStartScreen(myPokemon, yourPokemon, player().name, trainerName);
    await evo.pbTrade();
    await evo.pbEndScreen();
  });
  player().party[pokemonIndex] = yourPokemon;
}
