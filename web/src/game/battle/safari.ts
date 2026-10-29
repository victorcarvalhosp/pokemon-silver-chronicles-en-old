// Safari Zone battles and the Safari game:
// - 011_Battle/007_Other battle types/001_SafariBattle.rb: Battle::FakeBattler,
//   Battle::Scene::SafariDataBox, the ThrowBait/ThrowRock animations, the
//   Battle::Scene additions (pbSafariStart, pbSafariCommandMenu, pbThrowBait,
//   pbThrowRock, the pbThrowSuccess alias) and class SafariBattle.
// - 018_Alternate battle modes/001_SafariZone.rb: SafariState, pbInSafari?,
//   the step counter, the wild battle override and pbSafariBattle. The pause
//   menu's Quit option is in ui/menus/pauseMenu.ts (DP Pause Menu's version).

import { rand } from "../../core/random";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Battle } from "../../battle/battle/Battle";
import type { IBattleScene } from "../../battle/BattleSceneInterface";
import { Peer } from "../../battle/other/Peers";
import { BallAnimation, type SceneSprites } from "../../battle/scene/animationBase";
import { AnimationHooks, DataBoxAppear } from "../../battle/scene/animations";
import { BattleScene, BattleSceneHooks } from "../../battle/scene/BattleScene";
import type { BattlerSprite } from "../../battle/scene/objects";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import type { SceneMap } from "../../scenes/SceneMap";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { pbDrawTextPositions } from "../../ui/drawText";
import { pbFadeOutIn } from "../../ui/fades";
import { pbSetSystemFont } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import { preloadBitmaps } from "../../ui/rpgCache";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { pbGenerateWildPokemon, specialBattleHooks } from "../encounters/PokemonEncounters";
import { EventHandlers } from "../eventHandlers";
import { pbDismountBike } from "../field/bicycle";
import type { GamePlayer } from "../GamePlayer";
import { pbSEPlay } from "../GameSystem";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { mapMetadata } from "../metadata";
import type { Pokemon } from "../pokemon/Pokemon";
import { pbBoxesFull } from "../pokemon/utilities";
import { defineScript } from "../scriptApi";
import type { Player } from "../trainer/Player";
import { pbGetWildBattleBGM } from "./battleAudio";
import { pbBattleAnimation, pbSceneStandby } from "./BattleIntroAnim";
import { BattleCreationHelperMethods, type BattleLike } from "./BattleStarting";
import { PokemonGlobalExtras } from "./globalExtras";

/** Settings::SAFARI_STEPS (001_Settings.rb:88): steps allowed in a Safari game (0 = infinite). */
export const SAFARI_STEPS: number = 600;

declare module "../globals" {
  interface PokemonGlobalMetadata {
    safariState?: SafariState | null;
  }
}

const player = () => G.player as unknown as Player;

//===============================================================================
// Simple battler class for the wild Pokémon in a Safari Zone battle
//===============================================================================
export class FakeBattler {
  readonly battle: SafariBattle;
  readonly index: number;
  readonly pokemon: Pokemon;

  constructor(battle: SafariBattle, index: number) {
    this.battle = battle;
    this.pokemon = battle.party2[0]!;
    this.index = index;
  }

  get pokemonIndex(): number { return 0; }
  get species(): Id { return this.pokemon.species; }
  get gender(): number { return this.pokemon.gender; }
  get status(): Id { return this.pokemon.status; }
  get hp(): number { return this.pokemon.hp; }
  get level(): number { return this.pokemon.level; }
  get name(): string { return this.pokemon.name; }
  get totalhp(): number { return this.pokemon.totalhp; }
  displayGender(): number { return this.pokemon.gender; }
  shiny(): boolean { return this.pokemon.shiny; }
  superShiny(): boolean { return this.pokemon.superShiny; }

  isSpecies(checkSpecies: Id): boolean {
    return !!this.pokemon?.isSpecies(checkSpecies);
  }

  fainted(): boolean { return false; }
  shadowPokemon(): boolean { return false; }
  hasMega(): boolean { return false; }
  mega(): boolean { return false; }
  hasPrimal(): boolean { return false; }
  primal(): boolean { return false; }
  get captured(): boolean { return false; }
  set captured(_value: boolean) {}

  owned(): boolean {
    return player().owned(this.pokemon.species);
  }

  pbThis(lowerCase = false): string {
    return lowerCase ? _INTL("the wild {1}", this.name) : _INTL("The wild {1}", this.name);
  }

  opposes(i: number | FakeBattler = 0): boolean {
    if (i instanceof FakeBattler) i = i.index;
    return (this.index & 1) !== (i & 1);
  }

  pbReset(): void {}
}

//===============================================================================
// Data box for safari battles
//===============================================================================
export class SafariDataBox extends Sprite {
  selected = 0;
  private battle: SafariBattle;
  private databox: AnimatedBitmap;
  private contents: Bitmap;

  constructor(battle: SafariBattle, viewport: Viewport | null = null) {
    super(viewport);
    this.battle = battle;
    this.databox = new AnimatedBitmap("Graphics/Pictures/Battle/databox_safari");
    this.x = Graphics.width - 232;
    this.y = Graphics.height - 184;
    this.contents = new Bitmap(this.databox.width, this.databox.height);
    this.setBitmap(this.contents);
    this.visible = false;
    this.z = 50;
    pbSetSystemFont(this.bitmap!);
    this.refresh();
  }

  refresh(): void {
    const bitmap = this.bitmap!;
    bitmap.clear();
    bitmap.blt(0, 0, this.databox.bitmap, new Rect(0, 0, this.databox.width, this.databox.height));
    const base = new Color(72, 72, 72);
    const shadow = new Color(184, 184, 184);
    pbDrawTextPositions(bitmap, [
      [_INTL("Safari Balls"), 30, 14, false, base, shadow],
      [_INTL("Left: {1}", this.battle.ballCount), 30, 44, false, base, shadow],
    ]);
  }

  override update(_frameCounter = 0): void {
    super.update();
  }

  override dispose(): void {
    // (Ruby leaves @databox and @contents to the garbage collector.)
    this.databox.dispose();
    this.contents.dispose();
    super.dispose();
  }
}

//===============================================================================
// Shows the player throwing bait at a wild Pokémon in a Safari battle.
//===============================================================================
export class ThrowBait extends BallAnimation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private battler: FakeBattler) {
    super(sprites, viewport);
    this.trainer = battler.battle.pbGetOwnerFromBattlerIndex(battler.index);
    this.createProcesses();
  }

  override createProcesses(): void {
    // Calculate start and end coordinates for battler sprite movement
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.battler.index}`];
    const traSprite = this.sprites.player_1;
    const ballPos = AnimationHooks.battlerPosition(this.battler.index, batSprite.sideSize);
    let ballStartX = traSprite.x;
    let ballStartY = traSprite.y - Math.floor(traSprite.bitmap.height / 2);
    const ballMidX = 0; // Unused in arc calculation
    const ballMidY = 122;
    const ballEndX = ballPos[0] - 40;
    const ballEndY = ballPos[1] - 4;
    // Set up trainer sprite
    const trainer = this.addSprite(traSprite, PictureOrigin.BOTTOM);
    // Set up bait sprite
    const ball = this.addNewSprite(ballStartX, ballStartY,
      "Graphics/Battle animations/safari_bait", PictureOrigin.CENTER);
    ball.setZ(0, batSprite.z + 1);
    // Trainer animation
    if (traSprite.bitmap.width >= traSprite.bitmap.height * 2) {
      [ballStartX, ballStartY] = this.trainerThrowingFrames(ball, trainer, traSprite);
    }
    let delay = ball.totalDuration(); // 0 or 7
    // Bait arc animation
    ball.setSE(delay, "Battle throw");
    this.createBallTrajectory(ball, delay, 12,
      ballStartX, ballStartY, ballMidX, ballMidY, ballEndX, ballEndY);
    ball.setZ(9, batSprite.z + 1);
    delay = ball.totalDuration();
    ball.moveOpacity(delay + 8, 2, 0);
    ball.setVisible(delay + 10, false);
    // Set up battler sprite
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    // Show Pokémon jumping before eating the bait
    delay = ball.totalDuration() + 3;
    for (let n = 0; n < 2; n++) {
      battler.setSE(delay, "player jump");
      battler.moveDelta(delay, 3, 0, -16);
      battler.moveDelta(delay + 4, 3, 0, 16);
      delay = battler.totalDuration() + 1;
    }
    // Show Pokémon eating the bait
    delay = battler.totalDuration() + 3;
    for (let n = 0; n < 2; n++) {
      battler.moveAngle(delay, 7, 5);
      battler.moveDelta(delay, 7, 0, 6);
      battler.moveAngle(delay + 7, 7, 0);
      battler.moveDelta(delay + 7, 7, 0, -6);
      delay = battler.totalDuration();
    }
  }
}

//===============================================================================
// Shows the player throwing a rock at a wild Pokémon in a Safari battle.
//===============================================================================
export class ThrowRock extends BallAnimation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private battler: FakeBattler) {
    super(sprites, viewport);
    this.trainer = battler.battle.pbGetOwnerFromBattlerIndex(battler.index);
    this.createProcesses();
  }

  override createProcesses(): void {
    // Calculate start and end coordinates for battler sprite movement
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.battler.index}`];
    const traSprite = this.sprites.player_1;
    let ballStartX = traSprite.x;
    let ballStartY = traSprite.y - Math.floor(traSprite.bitmap.height / 2);
    const ballMidX = 0; // Unused in arc calculation
    const ballMidY = 122;
    const ballEndX = batSprite.x;
    const ballEndY = batSprite.y - Math.floor(batSprite.bitmap!.height / 2);
    // Set up trainer sprite
    const trainer = this.addSprite(traSprite, PictureOrigin.BOTTOM);
    // Set up bait sprite
    const ball = this.addNewSprite(ballStartX, ballStartY,
      "Graphics/Battle animations/safari_rock", PictureOrigin.CENTER);
    ball.setZ(0, batSprite.z + 1);
    // Trainer animation
    if (traSprite.bitmap.width >= traSprite.bitmap.height * 2) {
      [ballStartX, ballStartY] = this.trainerThrowingFrames(ball, trainer, traSprite);
    }
    let delay = ball.totalDuration(); // 0 or 7
    // Bait arc animation
    ball.setSE(delay, "Battle throw");
    this.createBallTrajectory(ball, delay, 12,
      ballStartX, ballStartY, ballMidX, ballMidY, ballEndX, ballEndY);
    ball.setZ(9, batSprite.z + 1);
    delay = ball.totalDuration();
    ball.setSE(delay, "Battle damage weak");
    ball.moveOpacity(delay + 2, 2, 0);
    ball.setVisible(delay + 4, false);
    // Set up anger sprite
    const anger = this.addNewSprite(ballEndX - 42, ballEndY - 36,
      "Graphics/Battle animations/safari_anger", PictureOrigin.CENTER);
    anger.setVisible(0, false);
    anger.setZ(0, batSprite.z + 1);
    // Show anger appearing
    delay = ball.totalDuration() + 5;
    for (let n = 0; n < 2; n++) {
      anger.setSE(delay, "Player jump");
      anger.setVisible(delay, true);
      anger.moveZoom(delay, 3, 130);
      anger.moveZoom(delay + 3, 3, 100);
      anger.setVisible(delay + 6, false);
      anger.setDelta(delay + 6, 96, -16);
      delay = anger.totalDuration() + 3;
    }
  }
}

//===============================================================================
// Safari Zone battle scene (the visuals of the battle)
//===============================================================================
type SceneInternals = { briefMessage: boolean; battle: SafariBattle };
const internals = (s: BattleScene) => s as unknown as SceneInternals;

const SAFARI_GRAPHICS = [
  "Graphics/Pictures/Battle/databox_safari",
  "Graphics/Battle animations/safari_bait",
  "Graphics/Battle animations/safari_rock",
  "Graphics/Battle animations/safari_anger",
];

async function playAnimation(scene: BattleScene, anim: { update(): void; animDone(): boolean; dispose(): void }): Promise<void> {
  for (;;) {
    anim.update();
    await scene.pbUpdate();
    if (anim.animDone()) break;
  }
  anim.dispose();
}

const sceneMethods = {
  async pbSafariStart(this: BattleScene): Promise<void> {
    internals(this).briefMessage = false;
    await preloadBitmaps(SAFARI_GRAPHICS);
    this.sprites.dataBox_0 = new SafariDataBox(internals(this).battle, this.viewport);
    await playAnimation(this, new DataBoxAppear(this.sprites, this.viewport, 0));
    this.pbRefresh();
  },

  pbSafariCommandMenu(this: BattleScene, index: number): Promise<number> {
    return this.pbCommandMenuEx(index, [
      _INTL("What will\n{1} throw?", internals(this).battle.pbPlayer().name),
      _INTL("Ball"),
      _INTL("Bait"),
      _INTL("Rock"),
      _INTL("Run"),
    ], 3);
  },

  async pbThrowBait(this: BattleScene): Promise<void> {
    internals(this).briefMessage = false;
    await playAnimation(this, new ThrowBait(this.sprites, this.viewport, internals(this).battle.battlers[1]!));
  },

  async pbThrowRock(this: BattleScene): Promise<void> {
    internals(this).briefMessage = false;
    await playAnimation(this, new ThrowRock(this.sprites, this.viewport, internals(this).battle.battlers[1]!));
  },
};

type SceneMethods = typeof sceneMethods;
declare module "../../battle/scene/BattleScene" {
  interface BattleScene extends SceneMethods {}
}
Object.assign(BattleScene.prototype, sceneMethods);

// alias __safari__pbThrowSuccess pbThrowSuccess
const safariPbThrowSuccess = BattleScene.prototype.pbThrowSuccess;
BattleScene.prototype.pbThrowSuccess = async function (this: BattleScene): Promise<void> {
  await safariPbThrowSuccess.call(this);
  if (internals(this).battle instanceof SafariBattle) this.pbWildBattleSuccess();
};

//===============================================================================
// Safari Zone battle class
//===============================================================================
class BattleAbortedException extends Error {}

export class SafariBattle implements BattleLike {
  /** Array of fake battler objects */
  readonly battlers: FakeBattler[];
  /** Array of number of battlers per side */
  sideSizes: number[];
  /** Filename fragment used for background graphics */
  backdrop: string;
  /** Filename fragment used for base graphics */
  backdropBase: string | null;
  /** Time of day (0=day, 1=eve, 2=night) */
  time: number;
  /** Battle surroundings (for mechanics purposes) */
  environment: Id;
  readonly weather: Id;
  readonly player: Player[];
  party2: Pokemon[];
  /** True if player can run from battle */
  canRun = true;
  /** True if player won't black out if they lose */
  canLose = false;
  /** Switch/Set "battle style" option */
  switchStyle = true;
  /** "Battle scene" option (show anims) */
  showAnims = true;
  /** Whether Pokémon can gain Exp/EVs */
  expGain = true;
  /** Whether the player can gain/lose money */
  moneyGain = true;
  rules: Record<string, unknown>;
  ballCount: number;
  readonly scene: BattleScene;
  peer: Peer;
  decision: number;
  caughtPokemon: Pokemon[];
  // Battle::CatchAndStoreMixin state (Ruby leaves these unset until used)
  criticalCapture = false;
  firstPokeBall: Id | null = null;
  pokeBallFailed = false;
  /** Never set, as in Ruby (see pbSetSeen). */
  internalBattle: boolean | null = null;
  // Battle::CatchAndStoreMixin (copied from Battle.prototype below)
  declare pbStorePokemon: (pkmn: Pokemon) => Promise<void>;
  declare pbRecordAndStoreCaughtPokemon: () => Promise<void>;
  declare pbThrowPokeBall: (idxBattler: number, ball: Id, catchRate?: number | null, showPlayer?: boolean) => Promise<void>;
  declare pbCaptureCalc: (pkmn: Pokemon, battler: FakeBattler, catchRate: number | null, ball: Id) => number;

  pbRandom(x: number): number { return rand(x); }

  //=============================================================================
  // Initialize the battle class
  //=============================================================================
  constructor(scene: unknown, player: Player, party2: Pokemon[]) {
    this.scene = scene as BattleScene;
    this.peer = new Peer();
    this.backdrop = "";
    this.backdropBase = null;
    this.time = 0;
    this.environment = "None"; // e.g. Tall grass, cave, still water
    this.weather = "None";
    this.decision = 0;
    this.caughtPokemon = [];
    this.player = [player];
    this.party2 = party2;
    this.sideSizes = [1, 1];
    this.battlers = [];
    this.battlers.push(new FakeBattler(this, 0), new FakeBattler(this, 1));
    this.rules = {};
    this.ballCount = 0;
  }

  set disablePokeBalls(_value: boolean) {}
  get disablePokeBalls(): boolean { return false; }
  set sendToBoxes(_value: number) {}
  /** Ruby defines only the writer, so the mixin reads @sendToBoxes as nil. */
  get sendToBoxes(): number { return undefined as unknown as number; }
  set defaultWeather(value: Id | null) { (this as { weather: Id | null }).weather = value; }
  get defaultWeather(): Id | null { return this.weather; }
  set defaultTerrain(_value: Id | null) {}
  get defaultTerrain(): Id | null { return null; }
  // (BattleLike fields prepare_battle doesn't set on a SafariBattle)
  party1starts: number[] = [];
  party2starts: number[] = [];
  allyItems: unknown[] = [];
  items: unknown[] | null = null;

  //=============================================================================
  // Information about the type and size of the battle
  //=============================================================================
  wildBattle(): boolean { return true; }
  trainerBattle(): boolean { return false; }
  singleBattle(): boolean { return true; } // (not a Ruby method; BattleLike asks)

  setBattleMode(_mode: string): void {}

  pbSideSize(index: number): number {
    return this.sideSizes[index % 2]!;
  }

  //=============================================================================
  // Trainers and owner-related
  //=============================================================================
  pbPlayer(): Player { return this.player[0]!; }
  get opponent(): null { return null; }

  pbGetOwnerFromBattlerIndex(_idxBattler: number): Player { return this.pbPlayer(); }

  pbSetSeen(battler: Pokemon | FakeBattler | null): void {
    // NOTE (Ruby parity): @internalBattle is never set in a SafariBattle
    // (001_SafariBattle.rb:303), so this always returns here: Safari Pokémon
    // aren't registered as seen by the battle.
    if (!battler || !this.internalBattle) return;
    this.pbPlayer().pokedex.register(battler as Pokemon);
  }

  pbSetCaught(battler: Pokemon | FakeBattler | null): void {
    // NOTE (Ruby parity): never gets past the check, as pbSetSeen above (:313).
    if (!battler || !this.internalBattle) return;
    this.pbPlayer().pokedex.registerCaught(battler.species);
  }

  //=============================================================================
  // Get party info (counts all teams on the same side)
  //=============================================================================
  pbParty(idxBattler: number): Pokemon[] | null {
    return this.opposes(idxBattler) ? this.party2 : null;
  }

  pbAllFainted(_idxBattler = 0): boolean { return false; }

  //=============================================================================
  // Battler-related
  //=============================================================================
  opposes(idxBattler1: number | { index: number }, idxBattler2: number | { index: number } = 0): boolean {
    const i1 = typeof idxBattler1 === "number" ? idxBattler1 : idxBattler1.index;
    const i2 = typeof idxBattler2 === "number" ? idxBattler2 : idxBattler2.index;
    return (i1 & 1) !== (i2 & 1);
  }

  pbRemoveFromParty(_idxBattler: number, _idxParty: number): void {}
  async pbGainExp(): Promise<void> {}

  //=============================================================================
  // Messages and animations
  //=============================================================================
  pbDisplay(msg: string, block?: () => void | Promise<void>): Promise<void> {
    return this.scene.pbDisplayMessage(msg, false, block);
  }

  pbDisplayPaused(msg: string, block?: () => void | Promise<void>): Promise<void> {
    return this.scene.pbDisplayPausedMessage(msg, block);
  }

  pbDisplayBrief(msg: string): Promise<void> {
    return this.scene.pbDisplayMessage(msg, true);
  }

  pbDisplayConfirm(msg: string): Promise<boolean> {
    return this.scene.pbDisplayConfirmMessage(msg);
  }

  pbAbort(): void {
    throw new BattleAbortedException("Battle aborted");
  }

  //=============================================================================
  // Safari battle-specific methods
  //=============================================================================
  pbEscapeRate(catchRate: number): number {
    if (catchRate <= 45) return 125; // Escape factor 9 (45%)
    if (catchRate <= 60) return 100; // Escape factor 7 (35%)
    if (catchRate <= 120) return 75; // Escape factor 5 (25%)
    if (catchRate <= 250) return 50; // Escape factor 3 (15%)
    return 25; // Escape factor 2 (10%)
  }

  async pbStartBattle(): Promise<number> {
    try {
      const pkmn = this.party2[0]!;
      this.pbSetSeen(pkmn);
      await this.scene.pbStartBattle(this as never);
      await this.pbDisplayPaused(_INTL("Wild {1} appeared!", pkmn.name));
      await this.scene.pbSafariStart();
      let weatherData = BattleWeather.tryGet(this.weather);
      if (weatherData) await this.scene.pbCommonAnimation(weatherData.animation);
      const safariBall = Item.get("SAFARIBALL").id;
      const catchRate = pkmn.speciesData().catchRate;
      let catchFactor = Math.floor((catchRate * 100) / 1275);
      catchFactor = Math.min(Math.max(catchFactor, 3), 20);
      let escapeFactor = Math.floor((this.pbEscapeRate(catchRate) * 100) / 1275);
      escapeFactor = Math.min(Math.max(escapeFactor, 2), 20);
      for (;;) {
        const cmd = await this.scene.pbSafariCommandMenu(0);
        switch (cmd) {
          case 0: { // Ball
            if (pbBoxesFull()) {
              await this.pbDisplay(_INTL("The boxes are full! You can't catch any more Pokémon!"));
              continue;
            }
            this.ballCount -= 1;
            this.scene.pbRefresh();
            const rare = Math.floor((catchFactor * 1275) / 100);
            if (safariBall) {
              await this.pbThrowPokeBall(1, safariBall, rare, true);
              if (this.caughtPokemon.length > 0) {
                await this.pbRecordAndStoreCaughtPokemon();
                this.decision = 4;
              }
            }
            break;
          }
          case 1: // Bait
            await this.pbDisplayBrief(_INTL("{1} threw some bait at the {2}!", this.pbPlayer().name, pkmn.name));
            await this.scene.pbThrowBait();
            if (this.pbRandom(100) < 90) catchFactor = Math.floor(catchFactor / 2); // Harder to catch
            escapeFactor = Math.floor(escapeFactor / 2); // Less likely to escape
            break;
          case 2: // Rock
            await this.pbDisplayBrief(_INTL("{1} threw a rock at the {2}!", this.pbPlayer().name, pkmn.name));
            await this.scene.pbThrowRock();
            catchFactor *= 2; // Easier to catch
            if (this.pbRandom(100) < 90) escapeFactor *= 2; // More likely to escape
            break;
          case 3: // Run
            pbSEPlay("Battle flee");
            await this.pbDisplayPaused(_INTL("You got away safely!"));
            this.decision = 3;
            break;
          default:
            continue;
        }
        catchFactor = Math.min(Math.max(catchFactor, 3), 20);
        escapeFactor = Math.min(Math.max(escapeFactor, 2), 20);
        // End of round
        if (this.decision === 0) {
          if (this.ballCount <= 0) {
            await this.pbDisplay(_INTL("PA: You have no Safari Balls left! Game over!"));
            this.decision = 2;
          } else if (this.pbRandom(100) < 5 * escapeFactor) {
            pbSEPlay("Battle flee");
            await this.pbDisplay(_INTL("{1} fled!", pkmn.name));
            this.decision = 3;
          } else if (cmd === 1) { // Bait
            await this.pbDisplay(_INTL("{1} is eating!", pkmn.name));
          } else if (cmd === 2) { // Rock
            await this.pbDisplay(_INTL("{1} is angry!", pkmn.name));
          } else {
            await this.pbDisplay(_INTL("{1} is watching carefully!", pkmn.name));
          }
          // Weather continues
          weatherData = BattleWeather.tryGet(this.weather);
          if (weatherData) await this.scene.pbCommonAnimation(weatherData.animation);
        }
        if (this.decision > 0) break;
      }
      await this.scene.pbEndBattle(this.decision);
    } catch (e) {
      if (!(e instanceof BattleAbortedException)) throw e;
      this.decision = 0;
      await this.scene.pbEndBattle(this.decision);
    }
    return this.decision;
  }
}

// include Battle::CatchAndStoreMixin (with the plugins' patches to the module,
// which are on Battle.prototype in the port)
const CATCH_AND_STORE = ["pbStorePokemon", "pbRecordAndStoreCaughtPokemon", "pbThrowPokeBall", "pbCaptureCalc"] as const;
for (const name of CATCH_AND_STORE) {
  (SafariBattle.prototype as unknown as Record<string, unknown>)[name] = (Battle.prototype as unknown as Record<string, unknown>)[name];
}

//===============================================================================
// The Safari game
//===============================================================================
export class SafariState {
  private start: [number, number, number, number] | null = null;
  ballcount = 0;
  captures = 0;
  private inProgress_ = false;
  steps = 0;
  decision = 0;

  pbReceptionMap(): number {
    return this.inProgress_ ? this.start![0] : 0;
  }

  inProgress(): boolean {
    return this.inProgress_;
  }

  async pbGoToStart(): Promise<void> {
    const scene = G.scene as unknown as SceneMap | null;
    if (scene && typeof scene.transferPlayer === "function") {
      await pbFadeOutIn(async () => {
        const t = G.gameTemp;
        t.playerTransferring = true;
        t.transitionProcessing = true;
        t.playerNewMapId = this.start![0];
        t.playerNewX = this.start![1];
        t.playerNewY = this.start![2];
        t.playerNewDirection = 2;
        await pbDismountBike();
        await scene.transferPlayer();
      });
    }
  }

  pbStart(ballcount: number): void {
    const p = G.gamePlayer as unknown as GamePlayer;
    this.start = [G.gameMap!.mapId, p.x, p.y, p.direction];
    this.ballcount = ballcount;
    this.inProgress_ = true;
    this.steps = SAFARI_STEPS;
  }

  pbEnd(): void {
    this.start = null;
    this.ballcount = 0;
    this.captures = 0;
    this.inProgress_ = false;
    this.steps = 0;
    this.decision = 0;
    (G.gameMap as unknown as GameMap).needRefresh = true;
  }

  toJSON(): unknown {
    return { start: this.start, ballcount: this.ballcount, captures: this.captures, inProgress: this.inProgress_, steps: this.steps, decision: this.decision };
  }

  static fromJSON(json: ReturnType<SafariState["toJSON"]>): SafariState {
    const j = json as { start: SafariState["start"]; ballcount: number; captures: number; inProgress: boolean; steps: number; decision: number };
    const s = new SafariState();
    s.start = j.start;
    s.ballcount = j.ballcount;
    s.captures = j.captures;
    s.inProgress_ = j.inProgress;
    s.steps = j.steps;
    s.decision = j.decision;
    return s;
  }
}

/** pbInSafari? */
export function pbInSafari(): boolean {
  if (pbSafariState().inProgress()) {
    // Reception map is handled separately from safari map since the reception
    // map can be outdoors, with its own grassy patches.
    const reception = pbSafariState().pbReceptionMap();
    if (G.gameMap!.mapId === reception) return true;
    if (mapMetadata(G.gameMap!.mapId)?.safariMap) return true;
  }
  return false;
}

/** pbSafariState */
export function pbSafariState(): SafariState {
  G.pokemonGlobal.safariState ??= new SafariState();
  return G.pokemonGlobal.safariState;
}

specialBattleHooks.inSafari = pbInSafari;
BattleSceneHooks.inSafari = pbInSafari;
PokemonGlobalExtras.register("safariState", {
  save: (v) => (v as SafariState).toJSON(),
  load: (v) => SafariState.fromJSON(v),
});

EventHandlers.add("on_enter_map", "end_safari_game", () => {
  if (!pbInSafari()) pbSafariState().pbEnd();
});

EventHandlers.add("on_player_step_taken_can_transfer", "safari_game_counter", async (h) => {
  const handled = h as (boolean | null)[];
  // handled is an array: [nil]. If [true], a transfer has happened because of
  // this event, so don't do anything that might cause another one
  if (handled[0]) return;
  if (SAFARI_STEPS === 0 || !pbInSafari() || pbSafariState().decision !== 0) return;
  pbSafariState().steps -= 1;
  if (pbSafariState().steps > 0) return;
  await pbMessage(_INTL("PA: Ding-dong!\x01"));
  await pbMessage(_INTL("PA: Your safari game is over!"));
  pbSafariState().decision = 1;
  await pbSafariState().pbGoToStart();
  handled[0] = true;
});

EventHandlers.add("on_calling_wild_battle", "safari_battle", async (p, l, h) => {
  const pkmn = p as Pokemon;
  const handled = h as (boolean | null)[];
  // handled is an array: [nil]. If [true] or [false], the battle has already
  // been overridden (the boolean is its outcome), so don't do anything that
  // would override it again
  if (handled[0] != null) return;
  if (!pbInSafari()) return;
  // (Ruby stores the decision number here, not a boolean; WildBattle.start returns it.)
  handled[0] = (await pbSafariBattle(pkmn.species, l as number)) as unknown as boolean;
});

/** pbSafariBattle(species, level): returns the decision (Ruby returns it, not a boolean). */
export async function pbSafariBattle(species: Id, level: number): Promise<number> {
  // Generate a wild Pokémon based on the species and level
  const pkmn = pbGenerateWildPokemon(species, level);
  const foeParty = [pkmn];
  // Calculate who the trainer is
  const playerTrainer = player();
  // Create the battle scene (the visual side of it)
  const scene = BattleCreationHelperMethods.createBattleScene();
  // Create the battle class (the mechanics side of it)
  const battle = new SafariBattle(scene, playerTrainer, foeParty);
  battle.ballCount = pbSafariState().ballcount;
  BattleCreationHelperMethods.prepareBattle(battle);
  // Perform the battle itself
  let decision = 0;
  await pbBattleAnimation(pbGetWildBattleBGM(foeParty), 0, foeParty, async () => {
    await pbSceneStandby(async () => {
      decision = await battle.pbStartBattle();
    });
  });
  Input.update();
  // Update Safari game data based on result of battle
  pbSafariState().ballcount = battle.ballCount;
  if (pbSafariState().ballcount <= 0) {
    if (decision !== 2) { // Last Safari Ball was used to catch the wild Pokémon
      await pbMessage(_INTL("Announcer: You're out of Safari Balls! Game over!"));
    }
    pbSafariState().decision = 1;
    await pbSafariState().pbGoToStart();
  }
  // Save the result of the battle in Game Variable 1
  //    0 - Undecided or aborted
  //    2 - Player ran out of Safari Balls
  //    3 - Player or wild Pokémon ran from battle, or player forfeited the match
  //    4 - Wild Pokémon was caught
  if (decision === 4) {
    G.stats.safariPokemonCaught += 1;
    pbSafariState().captures += 1;
    G.stats.mostCapturesPerSafariGame = Math.max(G.stats.mostCapturesPerSafariGame, pbSafariState().captures);
  }
  G.gameVariables.set(1, decision);
  if (G.gameMap) (G.gameMap as unknown as GameMap).needRefresh = true;
  // Used by the Poké Radar to update/break the chain
  await EventHandlers.trigger("on_wild_battle_end", species, level, decision);
  // Return the outcome of the battle
  return decision;
}

//===============================================================================
// Event scripts
//===============================================================================
defineScript("pbSafariState", () => pbSafariState());
defineScript("pbInSafari?", () => pbInSafari());
defineScript("pbSafariBattle", (_c, species, level) => pbSafariBattle(species as Id, Number(level)));
