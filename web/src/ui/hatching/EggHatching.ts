// Port of Data/Scripts/016_UI/001_Non-interactive UI/003_UI_EggHatching.rb
// (PokemonEggHatch_Scene, PokemonEggHatchScreen, pbHatchAnimation, pbHatch
// and the :hatch_eggs step handler), with this game's edits in the file
// (pbCustomEventsAfterHatch, the crack sprite offsets) and Following Pokemon
// EX's pbHatch alias (Script Additions/Refresh.rb:87), which refreshes the
// follower afterwards.
//
// The animation counts 40 fps frames (Graphics.frame_rate = 40); each runs
// once per elapsed 1/40 s (eachFrame / frameLoop).
//
// The step handler runs inside pbOnStepTaken (awaited from the player's
// update_event_triggering, as in Ruby), so the egg hatches as the step ends.

import { cryLength, preloadCryLength } from "../../battle/scene/sceneFiles";
import { _INTL } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { pbGetTimeNow } from "../../game/dayNight";
import { EventHandlers } from "../../game/eventHandlers";
import { FollowingPkmn } from "../../game/following/FollowingPkmn";
import { pbBGMPlay, pbBGMStop, pbMEPlay, pbSEPlay } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonOwner } from "../../game/pokemon/PokemonOwner";
import type { Player } from "../../game/trainer/Player";
import type { Trainer } from "../../game/trainer/Trainer";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color, Rect, Tone } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { frameLoop } from "../evolution/Evolution";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn, pbFadeOutInWithMusic } from "../fades";
import { FRAME_RATE } from "../frameTime";
import { pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbConfirmMessage, pbMessage } from "../messages";
import { addBackgroundOrColoredPlane } from "../planes";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../pokedex/pokedexEntry";
import { preloadBitmaps } from "../rpgCache";
import { assetExists } from "../../core/assets";
import { asHash, eachFrame, rgssOpacity, type Sprites } from "../scenes/frames";
import { PictureOrigin } from "../scenes/PictureEx";
import { BitmapSprite } from "../SpriteWrapper";
import { PokemonSprite, preloadPokemonSprite, preloadSpeciesSprite } from "../sprites/pokemonSprite";
import { pbEnterPokemonName } from "../textEntry/UI_TextEntry";

const player = () => G.player as unknown as Player;

//===============================================================================
// * Egg Hatch Animation - by FL (Credits will be apreciated)
//                         Tweaked by Maruno
//===============================================================================
export class PokemonEggHatch_Scene {
  private sprites: Sprites = {};
  private pokemon!: Pokemon;
  private nicknamed = false;
  private viewport!: Viewport;
  private hatchSheet!: AnimatedBitmap;

  private get pokemonSprite(): PokemonSprite { return this.sprites.pokemon as PokemonSprite; }
  private get hatch(): Sprite { return this.sprites.hatch as Sprite; }
  private get overlay(): BitmapSprite { return this.sprites.overlay as BitmapSprite; }

  async pbStartScene(pokemon: Pokemon): Promise<void> {
    this.sprites = {};
    this.pokemon = pokemon;
    this.nicknamed = false;
    // Load the egg, the cracks and the hatched Pokémon's graphic (and its cry's
    // length) up front: Ruby reads them synchronously.
    let crackfilename = `Graphics/Pokemon/Eggs/${this.pokemon.species}_cracks`;
    if (!assetExists(crackfilename)) crackfilename = "Graphics/Pokemon/Eggs/000_cracks"; // pbResolveBitmap
    await Promise.all([
      preloadSpeciesSprite(this.pokemon.species, this.pokemon.gender, this.pokemon.form, this.pokemon.shiny, false, false, true),
      preloadPokemonSprite(this.pokemon),
      preloadBitmaps([crackfilename, "Graphics/Pictures/hatchbg"]),
      preloadCryLength(this.pokemon),
    ]);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    // Create background image
    addBackgroundOrColoredPlane(this.sprites, "background", "hatchbg", new Color(248, 248, 248), this.viewport);
    // Create egg sprite/Pokémon sprite
    const sprite = new PokemonSprite(this.viewport);
    this.sprites.pokemon = sprite;
    sprite.setOffset(PictureOrigin.BOTTOM);
    sprite.x = Math.floor(Graphics.width / 2);
    sprite.y = 264 + 56; // 56 to offset the egg sprite
    sprite.setSpeciesBitmap(this.pokemon.species, this.pokemon.gender, this.pokemon.form, this.pokemon.shiny,
      false, false, true); // Egg sprite
    // Load egg cracks bitmap
    this.hatchSheet = new AnimatedBitmap(crackfilename);
    // Create egg cracks sprite
    const hatch = new Sprite(this.viewport);
    this.sprites.hatch = hatch;
    hatch.x = sprite.x;
    hatch.y = sprite.y - 16; // Added -16 to fix the hatch sprite being too low
    hatch.ox = sprite.ox + 16; // Added +16 to fix the hatch sprite being too on the right
    hatch.oy = sprite.oy;
    hatch.setBitmap(this.hatchSheet.bitmap);
    hatch.srcRect = new Rect(0, 0, Math.floor(this.hatchSheet.width / 5), this.hatchSheet.height);
    hatch.visible = false;
    // Create flash overlay
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites.overlay = overlay;
    overlay.z = 200;
    overlay.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    overlay.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height, new Color(255, 255, 255));
    overlay.opacity = 0;
    // Start up scene
    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbMain(): Promise<void> {
    pbBGMPlay("Evolution");
    // Egg animation
    await this.updateScene(Math.floor((FRAME_RATE * 15) / 10));
    this.pbPositionHatchMask(0);
    pbSEPlay("Battle ball shake");
    await this.swingEgg(4);
    await this.updateScene(Math.floor((FRAME_RATE * 2) / 10));
    this.pbPositionHatchMask(1);
    pbSEPlay("Battle ball shake");
    await this.swingEgg(4);
    await this.updateScene(Math.floor((FRAME_RATE * 4) / 10));
    this.pbPositionHatchMask(2);
    pbSEPlay("Battle ball shake");
    await this.swingEgg(8, 2);
    await this.updateScene(Math.floor((FRAME_RATE * 4) / 10));
    this.pbPositionHatchMask(3);
    pbSEPlay("Battle ball shake");
    await this.swingEgg(16, 4);
    await this.updateScene(Math.floor((FRAME_RATE * 2) / 10));
    this.pbPositionHatchMask(4);
    pbSEPlay("Battle recall");
    // Fade and change the sprite
    const fadeTime = Math.floor((FRAME_RATE * 4) / 10);
    const toneDiff = Math.ceil(255.0 / fadeTime);
    await eachFrame(fadeTime, (n) => {
      const i = n + 1;
      this.pokemonSprite.tone = new Tone(i * toneDiff, i * toneDiff, i * toneDiff);
      this.overlay.opacity = rgssOpacity(i * toneDiff);
      this.update();
    });
    await this.updateScene(Math.floor((FRAME_RATE * 3) / 4));
    this.pokemonSprite.setPokemonBitmap(this.pokemon); // Pokémon sprite
    this.pokemonSprite.x = Math.floor(Graphics.width / 2);
    this.pokemonSprite.y = 264;
    this.pokemon.speciesData().applyMetricsToSprite(this.pokemonSprite, 1);
    this.hatch.visible = false;
    await eachFrame(fadeTime, (n) => {
      const i = n + 1;
      this.pokemonSprite.tone = new Tone(255 - (i * toneDiff), 255 - (i * toneDiff), 255 - (i * toneDiff));
      this.overlay.opacity = rgssOpacity(255 - (i * toneDiff));
      this.update();
    });
    this.pokemonSprite.tone = new Tone(0, 0, 0);
    this.overlay.opacity = 0;
    // Finish scene
    const frames = Math.ceil(cryLength(this.pokemon) * FRAME_RATE);
    this.pokemon.playCry();
    await this.updateScene(frames + 4);
    pbBGMStop();
    pbMEPlay("Evolution success");
    this.pokemon.name = null;
    await pbMessage(_INTL("\\se[]{1} hatched from the Egg!\\wt[80]", this.pokemon.name), null, 0, null, 0, () => this.update());

    // Record the Pokémon's species as owned in the Pokédex
    const wasOwned = player().owned(this.pokemon.species);
    player().pokedex.register(this.pokemon);
    player().pokedex.setOwned(this.pokemon.species);
    player().pokedex.setSeenEgg(this.pokemon.species);
    // Show Pokédex entry for new species if it hasn't been owned before
    if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && !wasOwned && player().hasPokedex) {
      await pbMessage(_INTL("{1}'s data was added to the Pokédex.", this.pokemon.name), null, 0, null, 0, () => this.update());
      player().pokedex.registerLastSeen(this.pokemon);
      await pbFadeOutIn(async () => {
        const scene = new PokemonPokedexInfo_Scene();
        const screen = new PokemonPokedexInfoScreen(scene);
        await screen.pbDexEntry(this.pokemon.species);
      });
    }
    // Nickname the Pokémon
    if (G.pokemonSystem.givenicknames === 0 &&
        await pbConfirmMessage(_INTL("Would you like to nickname the newly hatched {1}?", this.pokemon.name), () => this.update())) {
      const nickname = await pbEnterPokemonName(_INTL("{1}'s nickname?", this.pokemon.name),
        0, Pokemon.MAX_NAME_SIZE, "", this.pokemon, true);
      this.pokemon.name = nickname;
      this.nicknamed = true;
    }

    pbCustomEventsAfterHatch(this.pokemon);
  }

  async pbEndScene(): Promise<void> {
    if (!this.nicknamed) await pbFadeOutAndHide(asHash(this.sprites), () => this.update());
    pbDisposeSpriteHash(this.sprites as never);
    this.hatchSheet.dispose();
    this.viewport.dispose();
  }

  pbPositionHatchMask(index: number): void {
    this.hatch.srcRect.x = index * this.hatch.srcRect.width;
  }

  async swingEgg(speed: number, swingTimes = 1): Promise<void> {
    const sprite = this.pokemonSprite;
    this.hatch.visible = true;
    speed = (speed * 20) / FRAME_RATE;
    const amplitude = 8;
    const targets: number[] = [];
    for (let n = 0; n < swingTimes; n++) {
      targets.push(sprite.x + amplitude);
      targets.push(sprite.x - amplitude);
    }
    targets.push(sprite.x);
    for (const [i, target] of targets.entries()) {
      // loop do; break if ...; x += speed; updateScene; end (one frame per pass)
      const reached = () => (i % 2 === 0 ? sprite.x >= target : sprite.x <= target);
      if (!reached()) {
        await frameLoop(() => {
          sprite.x = Math.trunc(sprite.x + speed); // Sprite#x is an integer in mkxp-z
          this.hatch.x = sprite.x;
          this.update();
          return reached();
        });
      }
      speed *= -1;
    }
    sprite.x = targets[targets.length - 1]!;
    this.hatch.x = sprite.x;
  }

  /** Can be used for "wait" effect */
  async updateScene(frames = 1): Promise<void> {
    await eachFrame(frames, () => this.update());
  }

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }
}

/** pbCustomEventsAfterHatch(pokemon) (this game's addition to the scene). */
export function pbCustomEventsAfterHatch(pokemon: Pokemon): void {
  // After Professor Elm Togepi hatches, set switch 716 to true
  // This switch is used on Common Event 059 to trigger a custom call from Professor Elm
  if (pokemon.obtainText === "Professor Elm" && pokemon.species === "TOGEPI") {
    G.gameSwitches.set(716, true);
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonEggHatchScreen {
  constructor(private scene: PokemonEggHatch_Scene) {}

  async pbStartScreen(pokemon: Pokemon): Promise<void> {
    await this.scene.pbStartScene(pokemon);
    await this.scene.pbMain();
    await this.scene.pbEndScene();
  }
}

//===============================================================================
//
//===============================================================================
export async function pbHatchAnimation(pokemon: Pokemon): Promise<boolean> {
  await pbMessage(_INTL("Huh?\x01"));
  await pbFadeOutInWithMusic(async () => {
    const scene = new PokemonEggHatch_Scene();
    const screen = new PokemonEggHatchScreen(scene);
    await screen.pbStartScreen(pokemon);
  });
  return true;
}

/** The data part of pbHatch before the animation: the hatched Pokémon's new owner, happiness, etc. */
export function pbHatchPokemonData(pokemon: Pokemon): void {
  G.stats.eggsHatched += 1;
  pokemon.name = null;
  pokemon.owner = PokemonOwner.newFromTrainer(player() as unknown as Trainer);
  pokemon.happiness = 120;
  pokemon.timeEggHatched = pbGetTimeNow();
  pokemon.obtainMethod = 1; // hatched from egg
  pokemon.hatchedMap = G.gameMap!.mapId;
  pokemon.recordFirstMoves();
}

/** pbHatch(pokemon), as Following Pokemon EX aliases it (refreshes the follower). */
export async function pbHatch(pokemon: Pokemon): Promise<void> {
  pbHatchPokemonData(pokemon);
  // NOTE (Ruby parity): pbHatchAnimation always returns true, so the text-only
  // fallback (003_UI_EggHatching.rb:221-247) never runs; it would also raise
  // NoMethodError, since it calls pbCustomEventsAfterHatch, which this game
  // defined on PokemonEggHatch_Scene, not globally (line 245).
  await pbHatchAnimation(pokemon);
  await FollowingPkmn.refresh(false);
}

/**
 * The :hatch_eggs step handler: counts each egg down and hatches it as soon
 * as it reaches 0 steps, before the next egg is counted (a Pokémon that just
 * hatched with Flame Body speeds up the eggs after it, as in Ruby).
 */
export async function pbHatchEggsOnStep(hatch: (egg: Pokemon) => Promise<void> = pbHatch): Promise<void> {
  for (const egg of player().party) {
    if (egg.stepsToHatch <= 0) continue;
    egg.stepsToHatch -= 1;
    for (const pkmn of player().pokemonParty()) {
      if (!pkmn.ability?.hasFlag("FasterEggHatching")) continue;
      egg.stepsToHatch -= 1;
      break;
    }
    if (egg.stepsToHatch <= 0) {
      egg.stepsToHatch = 0;
      await hatch(egg);
    }
  }
}

EventHandlers.add("on_player_step_taken", "hatch_eggs", () => pbHatchEggsOnStep());
