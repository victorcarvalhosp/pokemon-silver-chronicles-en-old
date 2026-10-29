// Port of Data/Scripts/016_UI/001_Non-interactive UI/004_UI_Evolution.rb
// (SpriteMetafile, SpriteMetafilePlayer, pbSaveSpriteState & co.,
// PokemonEvolutionScene), with:
// - v20.1 Hotfixes (Misc bug fixes.rb:179): pbEvolutionSuccess keeps a fainted
//   Pokémon fainted (the extracted 004 already contains the same code);
// - Following Pokemon EX (Script Additions/Refresh.rb:63): pbEndScreen
//   refreshes the follower.
// PokemonEvolutionScene.pbDuplicatePokemon (Shedinja) is in
// game/pokemon/utilities.ts, where the evolution method's hook reaches it.
//
// pbEvolutionScene below is the one path every caller takes (battle end,
// items, events, trades): game/items/itemUtilities.ts pbItemEvolutionScene
// loads it on demand.
//
// The animation counts 40 fps frames (Graphics.frame_rate = 40 in all the
// formulas); each original frame runs once per elapsed 1/40 s (FrameCounter),
// so it lasts as long as in the original.

import { crySpeciesLength, preloadCrySpeciesLength } from "../../battle/scene/sceneFiles";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { FollowingPkmn } from "../../game/following/FollowingPkmn";
import { pbBGMPlay, pbBGMStop, pbMEPlay, pbPlayCancelSE, pbPlayDecisionSE } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { pbLearnMove } from "../../game/items/itemUtilities";
import { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect, Tone } from "../../rgss/types";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn, pbFadeOutInWithMusic } from "../fades";
import { FRAME_RATE, FrameCounter } from "../frameTime";
import { pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbCreateMessageWindow, pbDisposeMessageWindow, pbMessageDisplay } from "../messages";
import { addBackgroundOrColoredPlane } from "../planes";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../pokedex/pokedexEntry";
import { asHash, eachFrame, type Sprites } from "../scenes/frames";
import { PictureOrigin } from "../scenes/PictureEx";
import { pokemonBitmapRequest, PokemonSprite, preloadPokemonSprite } from "../sprites/pokemonSprite";
import { preloadBitmap, preloadBitmaps } from "../rpgCache";
import type { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";

const player = () => G.player as unknown as Player;

/**
 * `loop do Graphics.update; Input.update; <step>; break if <done> end` where
 * each pass is one 40 fps frame: step() runs once per elapsed original frame
 * and returns true to stop.
 */
export async function frameLoop(step: () => boolean | void, update?: () => void): Promise<void> {
  const clock = new FrameCounter();
  for (;;) {
    await Graphics.update();
    Input.update();
    update?.();
    for (let n = clock.tick(); n > 0; n--) if (step()) return;
  }
}

//===============================================================================
// Evolution animation metafiles and related methods
//===============================================================================
/** The sprite properties a metafile records; mkxp-z's Sprite in Ruby. */
interface MetaSprite {
  x: number; y: number; z: number; ox: number; oy: number; zoomX: number; zoomY: number;
  srcRect: Rect; visible: boolean; angle: number; mirror: boolean; bushDepth: number;
  opacity: number; blendType: number; color: Color; tone: Tone;
  isDisposed?(): boolean;
}

export class SpriteMetafile {
  static readonly VIEWPORT = 0;
  static readonly TONE = 1;
  static readonly SRC_RECT = 2;
  static readonly VISIBLE = 3;
  static readonly X = 4;
  static readonly Y = 5;
  static readonly Z = 6;
  static readonly OX = 7;
  static readonly OY = 8;
  static readonly ZOOM_X = 9;
  static readonly ZOOM_Y = 10;
  static readonly ANGLE = 11;
  static readonly MIRROR = 12;
  static readonly BUSH_DEPTH = 13;
  static readonly OPACITY = 14;
  static readonly BLEND_TYPE = 15;
  static readonly COLOR = 16;
  static readonly FLASHCOLOR = 17;
  static readonly FLASHDURATION = 18;
  static readonly BITMAP = 19;

  private metafile: [number, unknown][] = [];
  private values: unknown[];

  constructor(viewport: Viewport | null = null) {
    this.values = [
      viewport,
      new Tone(0, 0, 0, 0), new Rect(0, 0, 0, 0),
      true,
      0, 0, 0, 0, 0, 100, 100,
      0, false, 0, 255, 0,
      new Color(0, 0, 0, 0), new Color(0, 0, 0, 0),
      0,
    ];
  }

  get length(): number { return this.metafile.length; }
  at(i: number): [number, unknown] | undefined { return this.metafile[i]; }
  isDisposed(): boolean { return false; }
  dispose(): void {}

  flash(color: Color, duration: number): void {
    if (duration > 0) {
      this.values[SpriteMetafile.FLASHCOLOR] = color.clone();
      this.values[SpriteMetafile.FLASHDURATION] = duration;
      this.metafile.push([SpriteMetafile.FLASHCOLOR, color]);
      this.metafile.push([SpriteMetafile.FLASHDURATION, duration]);
    }
  }

  private set(code: number, value: unknown): void {
    this.values[code] = value;
    this.metafile.push([code, value]);
  }

  get x(): number { return this.values[SpriteMetafile.X] as number; }
  set x(value: number) { this.set(SpriteMetafile.X, value); }
  get y(): number { return this.values[SpriteMetafile.Y] as number; }
  set y(value: number) { this.set(SpriteMetafile.Y, value); }
  get srcRect(): Rect { return this.values[SpriteMetafile.SRC_RECT] as Rect; }
  set srcRect(value: Rect) { this.set(SpriteMetafile.SRC_RECT, value); }
  get visible(): boolean { return this.values[SpriteMetafile.VISIBLE] as boolean; }
  set visible(value: boolean) { this.set(SpriteMetafile.VISIBLE, value); }
  get z(): number { return this.values[SpriteMetafile.Z] as number; }
  set z(value: number) { this.set(SpriteMetafile.Z, value); }
  get ox(): number { return this.values[SpriteMetafile.OX] as number; }
  set ox(value: number) { this.set(SpriteMetafile.OX, value); }
  get oy(): number { return this.values[SpriteMetafile.OY] as number; }
  set oy(value: number) { this.set(SpriteMetafile.OY, value); }
  get zoomX(): number { return this.values[SpriteMetafile.ZOOM_X] as number; }
  set zoomX(value: number) { this.set(SpriteMetafile.ZOOM_X, value); }
  get zoomY(): number { return this.values[SpriteMetafile.ZOOM_Y] as number; }
  set zoomY(value: number) { this.set(SpriteMetafile.ZOOM_Y, value); }
  set zoom(value: number) {
    this.set(SpriteMetafile.ZOOM_X, value);
    this.set(SpriteMetafile.ZOOM_Y, value);
  }
  get angle(): number { return this.values[SpriteMetafile.ANGLE] as number; }
  set angle(value: number) { this.set(SpriteMetafile.ANGLE, value); }
  get mirror(): boolean { return this.values[SpriteMetafile.MIRROR] as boolean; }
  set mirror(value: boolean) { this.set(SpriteMetafile.MIRROR, value); }
  get bushDepth(): number { return this.values[SpriteMetafile.BUSH_DEPTH] as number; }
  set bushDepth(value: number) { this.set(SpriteMetafile.BUSH_DEPTH, value); }
  get opacity(): number { return this.values[SpriteMetafile.OPACITY] as number; }
  set opacity(value: number) { this.set(SpriteMetafile.OPACITY, value); }
  get blendType(): number { return this.values[SpriteMetafile.BLEND_TYPE] as number; }
  set blendType(value: number) { this.set(SpriteMetafile.BLEND_TYPE, value); }
  // NOTE (Ruby parity): color= stores the clone it records, so changing
  // `sprite.color.alpha` afterwards also changes the recorded entry
  // (004_UI_Evolution.rb:222-225). The fade-to-white is a frame ahead.
  get color(): Color { return this.values[SpriteMetafile.COLOR] as Color; }
  set color(value: Color) {
    this.values[SpriteMetafile.COLOR] = value.clone();
    this.metafile.push([SpriteMetafile.COLOR, this.values[SpriteMetafile.COLOR]]);
  }
  get tone(): Tone { return this.values[SpriteMetafile.TONE] as Tone; }
  set tone(value: Tone) {
    this.values[SpriteMetafile.TONE] = value.clone();
    this.metafile.push([SpriteMetafile.TONE, this.values[SpriteMetafile.TONE]]);
  }

  update(): void {
    this.metafile.push([-1, null]);
  }
}

export class SpriteMetafilePlayer {
  private sprites: MetaSprite[] = [];
  private _playing = false;
  private index = 0;

  constructor(private metafile: SpriteMetafile, sprite: MetaSprite | null = null) {
    if (sprite) this.sprites.push(sprite);
  }

  add(sprite: MetaSprite): void { this.sprites.push(sprite); }
  playing(): boolean { return this._playing; }

  play(): void {
    this._playing = true;
    this.index = 0;
  }

  update(): void {
    if (!this._playing) return;
    for (let j = this.index; j < this.metafile.length; j++) {
      this.index = j + 1;
      const [code, value] = this.metafile.at(j)!;
      if (code < 0) break;
      for (const sprite of this.sprites) {
        switch (code) {
          case SpriteMetafile.X: sprite.x = value as number; break;
          case SpriteMetafile.Y: sprite.y = value as number; break;
          case SpriteMetafile.OX: sprite.ox = value as number; break;
          case SpriteMetafile.OY: sprite.oy = value as number; break;
          case SpriteMetafile.ZOOM_X: sprite.zoomX = value as number; break;
          case SpriteMetafile.ZOOM_Y: sprite.zoomY = value as number; break;
          case SpriteMetafile.SRC_RECT: sprite.srcRect = (value as Rect).clone(); break;
          case SpriteMetafile.VISIBLE: sprite.visible = value as boolean; break;
          case SpriteMetafile.Z: sprite.z = value as number; break; // prevent crashes
          case SpriteMetafile.ANGLE: sprite.angle = value === 180 ? 179.9 : (value as number); break;
          case SpriteMetafile.MIRROR: sprite.mirror = value as boolean; break;
          case SpriteMetafile.BUSH_DEPTH: sprite.bushDepth = value as number; break;
          case SpriteMetafile.OPACITY: sprite.opacity = value as number; break;
          case SpriteMetafile.BLEND_TYPE: sprite.blendType = value as number; break;
          // Sprite#color= / tone= copy the value in mkxp-z.
          case SpriteMetafile.COLOR: sprite.color = (value as Color).clone(); break;
          case SpriteMetafile.TONE: sprite.tone = (value as Tone).clone(); break;
        }
      }
    }
    if (this.index === this.metafile.length) this._playing = false;
  }
}

export type SpriteState = unknown[];

export function pbSaveSpriteState(sprite: MetaSprite | null): SpriteState {
  const state: SpriteState = [];
  if (!sprite || sprite.isDisposed?.()) return state;
  state[SpriteMetafile.BITMAP] = sprite.x;
  state[SpriteMetafile.X] = sprite.x;
  state[SpriteMetafile.Y] = sprite.y;
  state[SpriteMetafile.SRC_RECT] = sprite.srcRect.clone();
  state[SpriteMetafile.VISIBLE] = sprite.visible;
  state[SpriteMetafile.Z] = sprite.z;
  state[SpriteMetafile.OX] = sprite.ox;
  state[SpriteMetafile.OY] = sprite.oy;
  state[SpriteMetafile.ZOOM_X] = sprite.zoomX;
  state[SpriteMetafile.ZOOM_Y] = sprite.zoomY;
  state[SpriteMetafile.ANGLE] = sprite.angle;
  state[SpriteMetafile.MIRROR] = sprite.mirror;
  state[SpriteMetafile.BUSH_DEPTH] = sprite.bushDepth;
  state[SpriteMetafile.OPACITY] = sprite.opacity;
  state[SpriteMetafile.BLEND_TYPE] = sprite.blendType;
  state[SpriteMetafile.COLOR] = sprite.color.clone();
  state[SpriteMetafile.TONE] = sprite.tone.clone();
  return state;
}

export function pbRestoreSpriteState(sprite: MetaSprite | null, state: SpriteState | null): void {
  if (!state || !sprite || sprite.isDisposed?.()) return;
  sprite.x = state[SpriteMetafile.X] as number;
  sprite.y = state[SpriteMetafile.Y] as number;
  sprite.srcRect = (state[SpriteMetafile.SRC_RECT] as Rect).clone();
  sprite.visible = state[SpriteMetafile.VISIBLE] as boolean;
  sprite.z = state[SpriteMetafile.Z] as number;
  sprite.ox = state[SpriteMetafile.OX] as number;
  sprite.oy = state[SpriteMetafile.OY] as number;
  sprite.zoomX = state[SpriteMetafile.ZOOM_X] as number;
  sprite.zoomY = state[SpriteMetafile.ZOOM_Y] as number;
  sprite.angle = state[SpriteMetafile.ANGLE] as number;
  sprite.mirror = state[SpriteMetafile.MIRROR] as boolean;
  sprite.bushDepth = state[SpriteMetafile.BUSH_DEPTH] as number;
  sprite.opacity = state[SpriteMetafile.OPACITY] as number;
  sprite.blendType = state[SpriteMetafile.BLEND_TYPE] as number;
  sprite.color = (state[SpriteMetafile.COLOR] as Color).clone();
  sprite.tone = (state[SpriteMetafile.TONE] as Tone).clone();
}

//===============================================================================
// Evolution screen
//===============================================================================
export class PokemonEvolutionScene {
  private pokemon!: Pokemon;
  private newspecies!: Id;
  private sprites: Sprites = {};
  private bgviewport!: Viewport;
  private viewport!: Viewport;
  private msgviewport!: Viewport;
  private metafile1!: SpriteMetafile;
  private metafile2!: SpriteMetafile;

  private get msgwindow(): Window_AdvancedTextPokemon {
    return this.sprites.msgwindow as Window_AdvancedTextPokemon;
  }

  private pbGenerateMetafiles(s1x: number, s1y: number, s2x: number, s2y: number): void {
    const sprite = new SpriteMetafile();
    sprite.ox = s1x;
    sprite.oy = s1y;
    sprite.opacity = 255;
    const sprite2 = new SpriteMetafile();
    sprite2.ox = s2x;
    sprite2.oy = s2y;
    sprite2.zoom = 0.0;
    sprite2.opacity = 255;
    let alpha = 0;
    const alphaDiff = Math.floor((10 * 20) / FRAME_RATE);
    for (;;) {
      sprite.color.red = 255;
      sprite.color.green = 255;
      sprite.color.blue = 255;
      sprite.color.alpha = alpha;
      sprite.color = sprite.color;
      sprite2.color = sprite.color;
      sprite2.color.alpha = 255;
      sprite.update();
      sprite2.update();
      if (alpha >= 255) break;
      alpha += alphaDiff;
    }
    let totaltempo = 0;
    let currenttempo = 25;
    const maxtempo = 7 * FRAME_RATE;
    while (totaltempo < maxtempo) {
      for (let j = 0; j < currenttempo; j++) {
        if (alpha < 255) {
          sprite.color.red = 255;
          sprite.color.green = 255;
          sprite.color.blue = 255;
          sprite.color.alpha = alpha;
          sprite.color = sprite.color;
          alpha += 10;
        }
        sprite.zoom = Math.min((1.1 * (currenttempo - j - 1)) / currenttempo, 1.0);
        sprite2.zoom = Math.min((1.1 * (j + 1)) / currenttempo, 1.0);
        sprite.update();
        sprite2.update();
      }
      totaltempo += currenttempo;
      if (totaltempo + currenttempo < maxtempo) {
        for (let j = 0; j < currenttempo; j++) {
          sprite.zoom = Math.min((1.1 * (j + 1)) / currenttempo, 1.0);
          sprite2.zoom = Math.min((1.1 * (currenttempo - j - 1)) / currenttempo, 1.0);
          sprite.update();
          sprite2.update();
        }
      }
      totaltempo += currenttempo;
      currenttempo = Math.max(Math.floor(currenttempo / 1.5), 5);
    }
    this.metafile1 = sprite;
    this.metafile2 = sprite2;
  }

  pbUpdate(animating = false): void {
    if (animating) { // Pokémon shouldn't animate during the evolution animation
      (this.sprites.background as { update(): void }).update();
      this.msgwindow.update();
    } else {
      pbUpdateSpriteHash(this.sprites as never);
    }
  }

  private get background(): { oy: number } {
    return this.sprites.background as { oy: number };
  }

  pbUpdateNarrowScreen(): void {
    const halfResizeDiff = Math.floor((8 * 20) / FRAME_RATE);
    if (this.bgviewport.rect.y < 80) {
      this.bgviewport.rect.height -= halfResizeDiff * 2;
      if (this.bgviewport.rect.height < Graphics.height - 64) {
        this.bgviewport.rect.y += halfResizeDiff;
        this.background.oy = this.bgviewport.rect.y;
      }
    }
  }

  pbUpdateExpandScreen(): void {
    const halfResizeDiff = Math.floor((8 * 20) / FRAME_RATE);
    if (this.bgviewport.rect.y > 0) {
      this.bgviewport.rect.y -= halfResizeDiff;
      this.background.oy = this.bgviewport.rect.y;
    }
    if (this.bgviewport.rect.height < Graphics.height) {
      this.bgviewport.rect.height += halfResizeDiff * 2;
    }
  }

  async pbFlashInOut(canceled: boolean, oldstate: SpriteState, oldstate2: SpriteState): Promise<void> {
    const rsprite1 = this.sprites.rsprite1 as PokemonSprite;
    const rsprite2 = this.sprites.rsprite2 as PokemonSprite;
    let tone = 0;
    let toneDiff = Math.floor((20 * 20) / FRAME_RATE);
    await frameLoop(() => {
      this.pbUpdate(true);
      this.pbUpdateExpandScreen();
      tone += toneDiff;
      this.viewport.tone.set(tone, tone, tone, 0);
      return tone >= 255;
    });
    this.bgviewport.rect.y = 0;
    this.bgviewport.rect.height = Graphics.height;
    this.background.oy = 0;
    if (canceled) {
      pbRestoreSpriteState(rsprite1, oldstate);
      pbRestoreSpriteState(rsprite2, oldstate2);
      rsprite1.zoomX = 1.0;
      rsprite1.zoomY = 1.0;
      rsprite1.color.alpha = 0;
      rsprite1.visible = true;
      rsprite2.visible = false;
    } else {
      rsprite1.visible = false;
      rsprite2.visible = true;
      rsprite2.zoomX = 1.0;
      rsprite2.zoomY = 1.0;
      rsprite2.color.alpha = 0;
    }
    await eachFrame(Math.floor(FRAME_RATE / 4), () => this.pbUpdate(true));
    tone = 255;
    toneDiff = Math.floor((40 * 20) / FRAME_RATE);
    await frameLoop(() => {
      this.pbUpdate();
      tone -= toneDiff;
      this.viewport.tone.set(tone, tone, tone, 0);
      return tone <= 0;
    });
  }

  async pbStartScreen(pokemon: Pokemon, newspecies: Id): Promise<void> {
    this.pokemon = pokemon;
    this.newspecies = newspecies;
    // The sprites' origins (ox/oy) feed the metafiles: load both graphics first.
    const newReq = pokemonBitmapRequest(pokemon, false, newspecies);
    await Promise.all([
      preloadPokemonSprite(pokemon),
      newReq ? preloadBitmap(newReq.file) : null,
      preloadCrySpeciesLength(newspecies, pokemon.form),
      preloadBitmaps(["Graphics/Pictures/evolutionbg"]), // addBackgroundOrColoredPlane reads it now
    ]);
    this.sprites = {};
    this.bgviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.bgviewport.z = 99999;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.msgviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.msgviewport.z = 99999;
    addBackgroundOrColoredPlane(this.sprites, "background", "evolutionbg", new Color(248, 248, 248), this.bgviewport);
    const rsprite1 = new PokemonSprite(this.viewport);
    rsprite1.setOffset(PictureOrigin.CENTER);
    rsprite1.setPokemonBitmap(this.pokemon, false);
    rsprite1.x = Math.floor(Graphics.width / 2);
    rsprite1.y = Math.floor((Graphics.height - 64) / 2);
    const rsprite2 = new PokemonSprite(this.viewport);
    rsprite2.setOffset(PictureOrigin.CENTER);
    rsprite2.setPokemonBitmapSpecies(this.pokemon, this.newspecies, false);
    rsprite2.x = rsprite1.x;
    rsprite2.y = rsprite1.y;
    rsprite2.opacity = 0;
    this.sprites.rsprite1 = rsprite1;
    this.sprites.rsprite2 = rsprite2;
    this.pbGenerateMetafiles(rsprite1.ox, rsprite1.oy, rsprite2.ox, rsprite2.oy);
    this.sprites.msgwindow = pbCreateMessageWindow(this.msgviewport);
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  private ended = false;

  /** Closes the evolution screen. */
  async pbEndScreen(needFadeOut = true): Promise<void> {
    // NOTE (Ruby parity): pbEvolutionSuccess already ends the screen inside the
    // Pokédex entry's fade when no move is learnt, and the caller ends it again
    // (004_UI_Evolution.rb:525, then 012_Overworld/.../001_Overworld_BattleStarting.rb:643).
    // The second call disposes the disposed sprites again and still runs the
    // (now invisible) fade-out, so it is kept.
    const msgwindow = this.sprites.msgwindow as Window_AdvancedTextPokemon | undefined;
    if (msgwindow && !this.ended) pbDisposeMessageWindow(msgwindow);
    if (needFadeOut) await pbFadeOutAndHide(asHash(this.sprites), () => { if (!this.ended) this.pbUpdate(); });
    if (!this.ended) {
      pbDisposeSpriteHash(this.sprites as never);
      this.viewport.dispose();
      this.bgviewport.dispose();
      this.msgviewport.dispose();
    }
    this.ended = true;
    // Following Pokemon EX: Refresh Following Pokemon after any kind of Evolution
    await FollowingPkmn.refresh(false);
  }

  /** Opens the evolution screen */
  async pbEvolution(cancancel = true): Promise<void> {
    const rsprite1 = this.sprites.rsprite1 as PokemonSprite;
    const rsprite2 = this.sprites.rsprite2 as PokemonSprite;
    const metaplayer1 = new SpriteMetafilePlayer(this.metafile1, rsprite1);
    const metaplayer2 = new SpriteMetafilePlayer(this.metafile2, rsprite2);
    metaplayer1.play();
    metaplayer2.play();
    pbBGMStop();
    await pbMessageDisplay(this.msgwindow, "\\se[]" + _INTL("What?") + "\\1", true, null, () => this.pbUpdate());
    pbPlayDecisionSE();
    this.pokemon.playCry();
    this.msgwindow.text = _INTL("{1} is evolving!", this.pokemon.name);
    let timer = 0.0;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      timer += Graphics.deltaS;
      if (timer >= 1.0) break;
    }
    const oldstate = pbSaveSpriteState(rsprite1);
    const oldstate2 = pbSaveSpriteState(rsprite2);
    pbMEPlay("Evolution start");
    pbBGMPlay("Evolution");
    let canceled = false;
    const clock = new FrameCounter();
    for (;;) {
      for (let n = clock.tick(); n > 0; n--) {
        this.pbUpdateNarrowScreen();
        metaplayer1.update();
        metaplayer2.update();
      }
      await Graphics.update();
      Input.update();
      this.pbUpdate(true);
      if (Input.trigger(Input.BACK) && cancancel) {
        pbBGMStop();
        pbPlayCancelSE();
        canceled = true;
        break;
      }
      if (!(metaplayer1.playing() && metaplayer2.playing())) break;
    }
    await this.pbFlashInOut(canceled, oldstate, oldstate2);
    if (canceled) {
      G.stats.evolutionsCancelled += 1;
      await pbMessageDisplay(this.msgwindow, _INTL("Huh? {1} stopped evolving!", this.pokemon.name), true, null, () => this.pbUpdate());
    } else {
      await this.pbEvolutionSuccess();
    }
  }

  async pbEvolutionSuccess(): Promise<void> {
    G.stats.evolutionCount += 1;
    // Play cry of evolved species
    const frames = Math.ceil(crySpeciesLength(this.newspecies, this.pokemon.form) * FRAME_RATE);
    Pokemon.playCry(this.newspecies, this.pokemon.form);
    await eachFrame(frames + 4, () => this.pbUpdate());
    pbBGMStop();
    // Success jingle/message
    pbMEPlay("Evolution success");
    const newspeciesname = Species.get(this.newspecies).name;
    await pbMessageDisplay(this.msgwindow,
      _INTL("\\se[]Congratulations! Your {1} evolved into {2}!\\wt[80]", this.pokemon.name, newspeciesname),
      true, null, () => this.pbUpdate());
    this.msgwindow.text = "";
    const movesToLearn = evolvePokemon(this.pokemon, this.newspecies);
    const wasOwned = movesToLearn.wasOwned;
    // Show Pokédex entry for new species if it hasn't been owned before
    if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && !wasOwned && player().hasPokedex) {
      await pbMessageDisplay(this.msgwindow, _INTL("{1}'s data was added to the Pokédex.", newspeciesname),
        true, null, () => this.pbUpdate());
      player().pokedex.registerLastSeen(this.pokemon);
      await pbFadeOutIn(async () => {
        const scene = new PokemonPokedexInfo_Scene();
        const screen = new PokemonPokedexInfoScreen(scene);
        await screen.pbDexEntry(this.pokemon.species);
        if (movesToLearn.moves.length > 0) this.msgwindow.text = "";
        if (movesToLearn.moves.length === 0) await this.pbEndScreen(false);
      });
    }
    // Learn moves upon evolution for evolved species
    for (const move of movesToLearn.moves) {
      await pbLearnMove(this.pokemon, move, true); // { pbUpdate }
    }
  }

  pbEvolutionMethodAfterEvolution(): void {
    this.pokemon.actionAfterEvolution(this.newspecies);
  }
}

/**
 * The data part of pbEvolutionSuccess after the message (004_UI_Evolution.rb:
 * from "Check for consumed item" to the list of moves to learn): runs the
 * after-evolution procs (Shedinja, consumed held items), changes the species,
 * registers it, and returns the moves the evolved Pokémon learns now.
 */
export function evolvePokemon(pokemon: Pokemon, newspecies: Id): { moves: Id[]; wasOwned: boolean } {
  // Check for consumed item and check if Pokémon should be duplicated
  pokemon.actionAfterEvolution(newspecies);
  // Modify Pokémon to make it evolved
  const wasFainted = pokemon.fainted();
  pokemon.species = newspecies;
  if (wasFainted) pokemon.hp = 0;
  pokemon.calcStats();
  pokemon.readyToEvolve = false;
  // See and own evolved species
  const wasOwned = player().owned(newspecies);
  player().pokedex.register(pokemon);
  player().pokedex.setOwned(newspecies);
  const moves: Id[] = [];
  for (const i of pokemon.getMoveList()) {
    if (i.level !== 0 && i.level !== pokemon.level) continue; // 0 is "learn upon evolution"
    moves.push(i.move);
  }
  return { moves, wasOwned };
}

/**
 * The evolution scene as every caller runs it:
 *   evo = PokemonEvolutionScene.new
 *   evo.pbStartScreen(pkmn, new_species)
 *   evo.pbEvolution(canCancel)
 *   evo.pbEndScreen
 *   <after>
 * inside pbFadeOutInWithMusic (items, events), or bare (after battles, trades).
 */
export async function pbEvolutionScene(pkmn: Pokemon, newSpecies: Id, canCancel = true,
  after: () => void | Promise<void> = () => {}, fadeWithMusic = true): Promise<void> {
  const run = async () => {
    const evo = new PokemonEvolutionScene();
    await evo.pbStartScreen(pkmn, newSpecies);
    await evo.pbEvolution(canCancel);
    await evo.pbEndScreen();
    await after();
  };
  if (fadeWithMusic) await pbFadeOutInWithMusic(run);
  else await run();
}
