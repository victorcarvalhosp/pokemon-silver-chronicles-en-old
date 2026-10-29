// Port of Plugins/Dance Minigame/Main.rb ("Mini games" v2.5 by Rafahbit,
// PBMiniGames::DanceGame): arrows fall onto a target and the player presses
// the matching direction. Run with pbDanceGame(game_id, bpm); the game uses
// sequence 3 ("Pokémon Dance!") on map 543, where event 46 is the teacher and
// 45/47/48 the dancers who turn with the arrows.
//
// Timing: the arrow moves a fixed distance per frame computed from
// Graphics.frame_rate, so the loops run per original 40 fps frame
// (common.ts). The plugin also calls Kernel#sleep, which blocks the whole
// game: here sleep(s) waits s seconds of ticks without updating anything
// (the screen keeps showing the same picture, as in Ruby). Play time uses the
// clock (Time.now), as in Ruby.

import { assetExists } from "../core/assets";
import type { Id } from "../data/gameData/gameData";
import { Item } from "../data/gameData/item";
import type { GameCharacter } from "../game/GameCharacter";
import { G } from "../game/globals";
import { PBMoveRoute, pbMoveRoute } from "../game/scripts/moveRoute";
import { SpeedUp } from "../game/speedUp";
import { Audio } from "../rgss/Audio";
import { Bitmap } from "../rgss/Bitmap";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color, Rect } from "../rgss/types";
import { pbSetSpritesToColor } from "../ui/fades";
import { originalFrameCount } from "../ui/frameTime";
import { _INTL } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { RPGCache, preloadBitmaps } from "../ui/rpgCache";
import { asHash } from "../ui/scenes/frames";
import { bag, OriginalFrames, player, RUBY_FRAME_RATE, rubySample, rubyShuffle } from "./common";
import { rand } from "../core/random";

type Move = "up" | "down" | "left" | "right";
type Reward = { type: "item"; id: Id; quantity: number } | { type: "money"; amount: number };
interface Sequence {
  name: string;
  moves: Move[];
  bgm: string;
  reward: Record<number, Reward>;
  lives?: number;
  mode?: "infinite" | "survival";
  survival_id?: number;
}

/** Kernel#sleep: blocks the game (nothing updates) for that long. */
async function sleep(seconds: number): Promise<void> {
  const end = Graphics.frameCount + Math.round(seconds / Graphics.deltaS);
  while (Graphics.frameCount < end) await Graphics.update();
}

/** FileTest.exist?(path) */
const fileExists = (path: string) => assetExists(path);
/** Bitmap.new(path): the cached graphic (only read here). */
const loadBitmap = (path: string) => RPGCache.loadBitmap(path.replace(/\.png$/i, "")) ?? new Bitmap(32, 32);
/** Audio.bgm_play / se_play take full paths in Ruby; the port's Audio adds the folder. */
const bgmName = (path: string) => path.replace(/^Audio\/BGM\//, "");
const seName = (path: string) => path.replace(/^Audio\/SE\//, "");

const MINIGAME_BITMAPS = ["arrow_0", "arrow_1", "arrow_2", "arrow_3", "target", "heart", "start_1", "start_2",
  "start_3", "bg_reward"].map((f) => `Graphics/Minigame/${f}`);

//===============================================================================
// Main Module - PBMiniGames
//===============================================================================
export const PBMiniGames = {
  FORCED_EXIT_SWITCH: 921,
  ACCURACY_VAR: 300,
  SURVIVAL_TIME_RECORD_VARS: {
    1: 298, // ID 1 uses variable 298
    2: 297, // ID 2 uses variable 297
    // Add more mappings as needed
  } as Record<number, number>,
};

const variables = () => G.gameVariables;
const varNumber = (id: number) => Number(variables().get(id) ?? 0) || 0;

//=============================================================================
// DanceGame Class - Rhythm/Dance Minigame
//=============================================================================
export class DanceGame {
  static readonly INFINITE_HIGH_SCORE_VAR = 299;
  static readonly TEACHER_EVENT_ID = 46; // Map event ID of the "teacher" that turns with the correct arrow
  static readonly DANCER_EVENT_IDS = [45, 47, 48]; // Dancer NPCs that turn with a slight delay after the teacher
  static readonly DANCER_TURN_DELAY_FRAMES = 8; // Frames to wait after teacher turns before dancers turn

  private gameId: number;
  private bpm: number;
  private speed: number;
  private arrows: Record<Move, string>;
  private sequences: Record<number, Sequence>;
  private currentMove = 0;
  correctMoves = 0;
  errorMoves = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  scoreMultiplier = 1;
  lives = 0;
  private gameMode: "normal" | "infinite" | "survival";
  private infiniteSequence: Move[];
  private sprites: Record<string, Sprite> = {};
  private viewport: Viewport;
  private startTime = 0;
  private forcedExit = false;
  private showAnalysis = false;
  accuracy = 0;
  playTime = 0;
  private teacherTurnedThisArrow = false;
  private dancersTurnedThisArrow = false;
  private dancerTurnAt: number | null = null;
  private frames = new OriginalFrames();

  //=============================================================================
  // Method to get the survival time record variable based on ID
  //=============================================================================

  calculateBpmSpeed(bpm: number): number {
    // Fórmula que mantém a jogabilidade original mas adapta ao BPM
    const baseSpeed = bpm / 120.0; // 120 BPM = speed 1 (padrão)
    return Math.max(baseSpeed, 0.5); // Garante no mínimo speed 0.5
  }

  //=============================================================================
  survivalTimeVar(): number {
    const sequence = this.sequences[this.gameId]!;
    return PBMiniGames.SURVIVAL_TIME_RECORD_VARS[sequence.survival_id!] ?? 37; // Default to variable 37 if not specified
  }

  //===========================================================================
  // Scene Methods (start/end)
  //===========================================================================
  async pbUpdate(): Promise<void> {
    await this.frames.update();
    Input.update();
  }

  async pbStartScene(): Promise<void> {
    await preloadBitmaps(MINIGAME_BITMAPS);
    await this.pbCreateSprites();
    if (this.sprites.background) this.sprites.background.opacity = 0;
    // pbFadeInAndShow(@sprites) { ...; pbUpdate }: every step updates the
    // screen twice (in pbSetSpritesToColor and in the block).
    for (let j = 0; j <= FADE_STEPS; j++) {
      await pbSetSpritesToColor(asHash(this.sprites), new Color(0, 0, 0, (FADE_STEPS - j) * FADE_ALPHA));
      if (this.sprites.background && this.sprites.background.opacity < 255) this.sprites.background.opacity += 15;
      await G.scene?.miniupdate?.(); // $scene.miniupdate if $scene.is_a?(Scene_Map)
      await this.pbUpdate();
    }
  }

  async pbEndScene(): Promise<void> {
    // pbFadeOutAndHide(@sprites) { pbUpdate }
    for (let j = 0; j <= FADE_STEPS; j++) {
      await pbSetSpritesToColor(asHash(this.sprites), new Color(0, 0, 0, j * FADE_ALPHA));
      await this.pbUpdate();
    }
    for (const s of Object.values(this.sprites)) if (!s.isDisposed()) s.visible = false;
    this.disposeSprites();
  }

  //===========================================================================
  // Reward and Analysis Methods
  //===========================================================================
  async pbShowRewardScene(): Promise<void> {
    const currentBgm = G.gameSystem.getPlayingBGM();

    const rewardViewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    rewardViewport.z = 99999;
    const rewardSprites: Record<string, Sprite> = {};

    // Load background (bg_reward)
    const bgPath = "Graphics/Minigame/bg_reward.png";
    const background = new Sprite(rewardViewport);
    rewardSprites.background = background;
    if (fileExists(bgPath)) {
      background.setBitmap(loadBitmap(bgPath));
    } else {
      background.setBitmap(new Bitmap(Graphics.width, Graphics.height));
      background.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0));
    }
    background.z = 0;
    background.opacity = 0;

    // Background fade-in
    for (let n = 0; n < 40; n++) {
      background.opacity = Math.min(255, Math.trunc(background.opacity + 6.375));
      await this.pbUpdate();
      await sleep(0.02);
    }

    // 1. Show only the analysis and wait for confirmation
    const analysisSprite = new Sprite(rewardViewport);
    analysisSprite.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    analysisSprite.z = 10;
    await this.showPerformanceAnalysis(analysisSprite, rewardViewport);

    // Wait for analysis confirmation
    for (;;) {
      await this.pbUpdate();
      if (Input.trigger(Input.USE)) break;
    }

    // 2. Show reward ON TOP of analysis (keeping both visible)
    await this.giveReward(rewardSprites, rewardViewport, analysisSprite);

    // 3. Fade-out background AND analysis TOGETHER
    for (let n = 0; n < 40; n++) {
      background.opacity = Math.max(0, Math.trunc(background.opacity - 6.375));
      analysisSprite.opacity = Math.max(0, Math.trunc(analysisSprite.opacity - 6.375));
      await this.pbUpdate();
      await sleep(0.02);
    }

    // Cleanup
    for (const sprite of Object.values(rewardSprites)) sprite.dispose();
    analysisSprite.dispose();
    rewardViewport.dispose();

    if (currentBgm) G.gameSystem.bgmPlay(currentBgm);
  }

  //===========================================================================
  // Initialization and Configuration
  //===========================================================================
  constructor(gameId: number, bpm = 120) {
    this.gameId = gameId;
    this.bpm = bpm;
    this.speed = this.calculateBpmSpeed(bpm);
    this.arrows = {
      up: "Graphics/Minigame/arrow_0",
      down: "Graphics/Minigame/arrow_1",
      left: "Graphics/Minigame/arrow_2",
      right: "Graphics/Minigame/arrow_3",
    };
    this.sequences = {
      1: {
        name: "Sequence 1",
        moves: ["up", "up", "up", "up", "left", "down", "right", "left", "left", "down"],
        bgm: "Audio/BGM/Gym",
        reward: {
          50: { type: "item", id: "POTION", quantity: 1 },
          75: { type: "item", id: "POTION", quantity: 2 },
          90: { type: "item", id: "SUPERPOTION", quantity: 1 },
        },
        lives: 5,
      },
      2: {
        name: "Sequence 2",
        moves: ["down", "right", "up", "down", "left"],
        bgm: "Audio/BGM/Gym",
        reward: {
        },
        lives: 2,
      },
      3: {
        name: "Pokémon Dance!",
        moves: [
          "down", "down", "down", "right", "up", "down", "left", "up", "left", "down",
          "right", "left", "up", "down", "left", "right", "up", "down", "left", "up",
          "left", "down", "right", "left", "right", "left", "right", "left", "right", "left",
          "right", "up", "down", "right", "up", "down", "left", "up", "left", "down",
          "right", "left", "up", "down", "left", "right", "up", "down", "left", "up",
          "left", "down", "up", "down", "up", "down", "right", "up", "down", "left",
          "up", "left", "down", "right", "up", "down", "left", "up", "left", "down",
          "right", "up", "down", "left", "up", "left", "down", "right", "left", "right",
          "down", "up", "right", "up", "down", "right", "up", "down", "left", "down",
          "right", "down", "down", "down"],
        bgm: "Audio/BGM/pokedance",
        reward: {
          60: { type: "item", id: "RARECANDY", quantity: 1 },
          80: { type: "item", id: "RARECANDY", quantity: 2 },
          95: { type: "item", id: "PPUP", quantity: 1 },
        },
      },
      4: {
        name: "Infinite Mode",
        moves: [], // Infinite mode generates its own moves
        bgm: "Audio/BGM/Gym",
        reward: {}, // No rewards or define as desired
        mode: "infinite",
      },
      5: {
        name: "Survival Mode",
        moves: [], // Survival mode generates random moves
        bgm: "Audio/BGM/Gym",
        reward: {
          10: { type: "item", id: "POTION", quantity: 1 }, // 0-29s
          25: { type: "item", id: "POKEBALL", quantity: 1 }, // 30s-1:59min
          50: { type: "item", id: "SUPERPOTION", quantity: 1 }, // 2-3:59min
          75: { type: "item", id: "HYPERPOTION", quantity: 1 }, // 4-5:59min
          90: { type: "item", id: "MAXPOTION", quantity: 1 }, // 6-9:59min
          100: { type: "item", id: "FULLRESTORE", quantity: 1 }, // 10+min
        },
        mode: "survival",
        survival_id: 1, // Survival mode ID
        lives: 6,
      },
      6: {
        name: "Survival Mode 2",
        moves: [], // Survival mode generates random moves
        bgm: "Audio/BGM/Gym",
        reward: {
          10: { type: "item", id: "POTION", quantity: 1 }, // 0-29s
          25: { type: "item", id: "POKEBALL", quantity: 1 }, // 30s-1:59min
          50: { type: "item", id: "SUPERPOTION", quantity: 1 }, // 2-3:59min
          75: { type: "item", id: "HYPERPOTION", quantity: 1 }, // 4-5:59min
          90: { type: "item", id: "MAXPOTION", quantity: 1 }, // 6-9:59min
          100: { type: "item", id: "FULLRESTORE", quantity: 1 }, // 10+min
        },
        mode: "survival",
        survival_id: 2, // Different ID for another mode
        lives: 4,
      },
    };
    this.currentMove = 0;
    this.correctMoves = 0;
    this.errorMoves = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.scoreMultiplier = 1;
    // NOTE (Ruby parity): Main.rb:231 reads @sequences[game_id] before the
    // game id is checked, so an unknown id raises NoMethodError here instead
    // of the "Minigame not found" error.
    const sequence = this.sequences[gameId];
    if (!sequence) throw new TypeError("undefined method `[]' for nil:NilClass (DanceGame#initialize)");
    this.lives = sequence.lives ?? 0;
    this.gameMode = sequence.mode ?? "normal";
    this.infiniteSequence = rubyShuffle(["up", "down", "left", "right"] as Move[]);

    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
  }

  //===========================================================================
  // Game Control Methods
  //===========================================================================
  static async pbDanceGame(gameId: number, bpm = 120): Promise<void> {
    if (DanceGame.validGameIdStatic(gameId)) {
      // Run without pbFadeOutIn so the overworld map and player stay visible (no black overlay).
      const scene = new DanceGame(gameId, bpm);
      await scene.startGame();
    } else {
      throw new Error(`Minigame not found for ID ${gameId}.`);
    }
  }

  /** self.valid_game_id?(game_id): builds a whole DanceGame to ask it (shuffling its moves and making a viewport). */
  static validGameIdStatic(gameId: number): boolean {
    const game = new DanceGame(gameId);
    const ret = game.validGameId();
    game.viewport.dispose(); // Ruby leaves it (empty) behind
    return ret;
  }

  validGameId(): boolean {
    return this.gameId in this.sequences;
  }

  async startGame(): Promise<void> {
    // $GameSpeed = 0 (the Speed Up stage, not applied until it changes again, as in Ruby)
    SpeedUp.gameSpeed = 0;
    G.gameSystem.bgmMemorize();
    await this.pbStartScene();
    Audio.bgmStop();

    // Initialize variables
    this.currentMove = 0;
    this.correctMoves = 0;
    this.errorMoves = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.scoreMultiplier = 1;
    this.startTime = Date.now();
    if (this.gameMode === "survival") this.lives = this.sequences[this.gameId]!.lives ?? 0;
    this.forcedExit = false;
    this.showAnalysis = false;

    await this.pbShowSequenceName(this.sequences[this.gameId]!.name);
    await this.pbShowCountdown();

    const bgmPath = this.sequences[this.gameId]!.bgm;
    if (bgmPath) Audio.bgmPlay(bgmName(bgmPath), 50);

    await this.pbShowTarget();
    if (this.lives > 0) this.pbShowLives();
    this.pbShowScore();

    switch (this.gameMode) {
      case "infinite":
        await this.runInfiniteMode();
        break;
      case "survival":
        await this.runSurvivalMode();
        break;
      default:
        await this.runNormalMode();
    }

    // Only calculate stats if not forced exit
    // NOTE (Ruby parity): nothing ever sets @forced_exit, so this is always taken.
    if (!this.forcedExit) {
      const totalMoves = this.correctMoves + this.errorMoves;
      this.accuracy = totalMoves > 0 ? Math.trunc((this.correctMoves / totalMoves) * 100) : 0;
      this.playTime = Math.trunc((Date.now() - this.startTime) / 1000);
      variables().set(PBMiniGames.ACCURACY_VAR, this.accuracy);
      G.gameSwitches.set(PBMiniGames.FORCED_EXIT_SWITCH, false);

      // Update time record if longer in survival mode
      if (this.gameMode === "survival") {
        const currentVar = this.survivalTimeVar();
        if (this.playTime > varNumber(currentVar)) {
          variables().set(currentVar, this.playTime);
        }
      }
    } else {
      variables().set(PBMiniGames.ACCURACY_VAR, -1);
      G.gameSwitches.set(PBMiniGames.FORCED_EXIT_SWITCH, true);
    }

    // Update high score if higher in infinite mode
    if (this.gameMode === "infinite" && this.score > varNumber(DanceGame.INFINITE_HIGH_SCORE_VAR) && this.score > 0) {
      variables().set(DanceGame.INFINITE_HIGH_SCORE_VAR, this.score);
    }

    G.gameSystem.bgmRestore();
    await this.pbEndScene();

    // Show reward/analysis scene if not forced exit
    if (!this.forcedExit) await this.pbShowRewardScene();
  }

  async runNormalMode(): Promise<void> {
    for (const move of this.sequences[this.gameId]!.moves) {
      if (await this.handleMove(move) === "game_over") break;
    }
  }

  // NOTE (Ruby parity): Main.rb:337-357: infinite mode has no lives and
  // handle_input never returns :exit, so it never ends.
  async runInfiniteMode(): Promise<void> {
    for (;;) {
      const move = rubySample(this.infiniteSequence)!;
      const result = await this.handleMove(move);

      if (result === "exit") {
        this.showAnalysis = true;
        break;
      }

      if (result === "game_over") break;
      if (rand(10) === 0) rubyShuffle(this.infiniteSequence);
    }
  }

  async runSurvivalMode(): Promise<void> {
    for (;;) {
      const move = rubySample(this.infiniteSequence)!;
      if (await this.handleMove(move) === "game_over") break;
    }
  }

  //===========================================================================
  // Movement and Input Logic
  //===========================================================================
  async handleMove(move: Move): Promise<string | number> {
    await this.drawArrow(move);
    const result: string = await this.handleInput(move);

    switch (result) {
      case "correct":
        this.correctMoves += 1;
        this.combo += 1;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this.scoreMultiplier = 1 + Math.floor(this.combo / 5);
        this.score += 100 * this.scoreMultiplier;
        this.pbPlayCorrectSE();
        this.pbShowScore();
        this.sprites.arrow!.opacity = 0;
        break;

      case "error":
        this.errorMoves += 1;
        this.combo = 0;
        this.scoreMultiplier = 1;
        this.pbPlayErrorSE();
        await this.pbFlashArrow(3);
        if (this.lives > 0) {
          this.lives -= 1;
          this.pbShowLives();
          if (this.lives <= 0) return "game_over";
        }
        break;

      case "exit":
        return "game_over";
    }

    return this.currentMove += 1;
  }

  //===========================================================================
  // Visual Effects Methods
  //===========================================================================
  async pbSmoothFadeToBlack(): Promise<void> {
    const overlay = new Sprite(this.viewport);
    overlay.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    overlay.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0));
    overlay.opacity = 0;

    for (let n = 0; n < 20; n++) {
      overlay.opacity += 12;
      await this.pbUpdate();
      await sleep(0.03);
    }
    overlay.dispose();
  }

  async pbSmoothFadeInFromBlack(): Promise<void> {
    const overlay = new Sprite(this.viewport);
    overlay.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    overlay.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0));
    overlay.opacity = 255;

    for (let n = 0; n < 20; n++) {
      overlay.opacity -= 12;
      await this.pbUpdate();
      await sleep(0.03);
    }
    overlay.dispose();
  }

  async pbShowSequenceName(name: string): Promise<void> {
    const textSprite = new Sprite(this.viewport);
    const textBitmap = new Bitmap(Graphics.width, Graphics.height);
    textSprite.setBitmap(textBitmap);
    textSprite.x = 0;
    textSprite.y = 0;
    textSprite.z = 9999;
    textSprite.opacity = 0; // Starts invisible

    // Text settings
    textBitmap.font.size = 48;
    const shadowColor = new Color(0, 0, 0, 180);
    const textColor = new Color(255, 255, 255);
    const shadowOffset = 2;

    // Centered position
    const textHeight = textBitmap.textSize(name).height;
    const yPosition = Math.floor((Graphics.height - textHeight) / 2) - 20;

    // Draw with shadow
    textBitmap.font.color = shadowColor;
    textBitmap.drawText(shadowOffset, yPosition + shadowOffset,
      Graphics.width, textHeight, name, 1);
    textBitmap.font.color = textColor;
    textBitmap.drawText(0, yPosition, Graphics.width, textHeight, name, 1);

    // Fade-in (0.32 seconds)
    for (let n = 0; n < 16; n++) {
      textSprite.opacity += 16;
      await this.pbUpdate();
      await sleep(0.02);
    }

    // Display time (1.5 seconds - 0.32 from fade-in = 1.18 seconds)
    await sleep(1.18);

    // Optional fade-out (uncomment if desired)
    for (let n = 0; n < 16; n++) {
      textSprite.opacity -= 16;
      await this.pbUpdate();
      await sleep(0.02);
    }

    textSprite.dispose();
  }

  async pbShowCountdown(): Promise<void> {
    Audio.bgmStop();
    const countdownSprites = [
      "Graphics/Minigame/start_1.png",
      "Graphics/Minigame/start_2.png",
      "Graphics/Minigame/start_3.png",
    ];
    const countdownSound = "Audio/SE/Count";

    for (const spritePath of countdownSprites) {
      const countdownSprite = new Sprite(this.viewport);
      countdownSprite.setBitmap(loadBitmap(spritePath));
      countdownSprite.x = Math.floor((Graphics.width - countdownSprite.bitmap!.width) / 2);
      countdownSprite.y = Math.floor((Graphics.height - countdownSprite.bitmap!.height) / 2);
      countdownSprite.opacity = 255;

      // Play corresponding sound
      if (fileExists(countdownSound + ".wav")) Audio.sePlay(seName(countdownSound), 80, 150);

      await this.pbUpdate();
      await sleep(1);

      countdownSprite.dispose();
    }
  }

  async pbShowTarget(): Promise<void> {
    const targetPath = "Graphics/Minigame/target.png";
    if (fileExists(targetPath)) {
      const targetBitmap = loadBitmap(targetPath);
      const target = new Sprite(this.viewport);
      this.sprites.target = target;
      target.setBitmap(targetBitmap);
      target.x = Math.floor((Graphics.width - targetBitmap.width) / 2);
      target.y = Math.floor((Graphics.height - targetBitmap.height) / 2);
      target.opacity = 255;
    } else {
      await pbMessage("Error: Target image not found.");
      this.disposeSprites();
    }
  }

  pbShowLives(): void {
    const heartImage = "Graphics/Minigame/heart.png";
    if (!fileExists(heartImage)) return;

    for (const key of Object.keys(this.sprites)) {
      if (key.startsWith("heart_")) {
        this.sprites[key]!.dispose();
        delete this.sprites[key];
      }
    }

    const heartBitmap = loadBitmap(heartImage);
    for (let i = 0; i < this.lives; i++) {
      const heart = new Sprite(this.viewport);
      this.sprites[`heart_${i}`] = heart;
      heart.setBitmap(heartBitmap);
      heart.x = 14 + (i * (heartBitmap.width + 5));
      heart.y = 10;
    }
  }

  pbShowScore(): void {
    let score = this.sprites.score;
    if (score) {
      score.bitmap!.clear();
    } else {
      score = new Sprite(this.viewport);
      this.sprites.score = score;
      score.setBitmap(new Bitmap(200, 60));
      score.x = Graphics.width - 180; // Original X position
      score.y = 40; // Original Y position
      score.bitmap!.font.size = 20;
    }
    const bitmap = score.bitmap!;

    // Color and shadow settings
    const shadowColor = new Color(0, 0, 0, 150); // Semi-transparent black shadow
    const textColor = new Color(255, 255, 255); // White text
    const shadowOffset = 1; // More subtle offset

    // Draw score with shadow
    bitmap.font.color = shadowColor;
    bitmap.drawText(0 + shadowOffset, 0 + shadowOffset, 200, 30, `Score: ${this.score}`, 0);
    bitmap.font.color = textColor;
    bitmap.drawText(0, 0, 200, 30, `Score: ${this.score}`, 0);

    // Draw combo with shadow
    bitmap.font.color = shadowColor;
    bitmap.drawText(0 + shadowOffset, 30 + shadowOffset, 200, 30, `Combo: ${this.combo}x${this.scoreMultiplier}`, 0);
    bitmap.font.color = textColor;
    bitmap.drawText(0, 30, 200, 30, `Combo: ${this.combo}x${this.scoreMultiplier}`, 0);
  }

  async showPerformanceAnalysis(analysisSprite: Sprite, _viewport: Viewport): Promise<void> {
    const textBitmap = analysisSprite.bitmap!;
    textBitmap.clear();

    // Defined colors
    const shadowColor = new Color(80, 80, 80, 180); // Semi-transparent gray
    const textColor = new Color(255, 255, 255); // White

    // Font settings
    textBitmap.font.size = 28;
    textBitmap.font.bold = true;

    const x = 50;
    let y = 50;
    const lineHeight = 32;
    const shadowOffset = 2; // Shadow offset in pixels

    // Helper method to draw text with shadow
    const drawTextWithShadow = (bitmap: Bitmap, dx: number, dy: number, width: number, height: number, text: string,
      shadowX: number, shadowY: number, shadow: Color, color: Color) => {
      // Draw shadow
      bitmap.font.color = shadow;
      bitmap.drawText(dx + shadowX, dy + shadowY, width, height, text);

      // Draw main text
      bitmap.font.color = color;
      bitmap.drawText(dx, dy, width, height, text);
    };

    // Title
    drawTextWithShadow(textBitmap, x, y, 300, lineHeight, "Performance Analysis:",
      shadowOffset, shadowOffset, shadowColor, textColor);
    y += lineHeight * 2;

    // Analysis items (now with shadow)
    for (const text of [
      `Accuracy: ${this.accuracy}%`,
      `Correct Moves: ${this.correctMoves}`,
      `Wrong Moves: ${this.errorMoves}`,
      `Max Combo: ${this.maxCombo}`,
      `Final Score: ${this.score}`,
      `Time: ${this.playTime}`,
    ]) {
      drawTextWithShadow(textBitmap, x, y, 300, lineHeight, text,
        shadowOffset, shadowOffset, shadowColor, textColor);
      y += lineHeight;
    }

    y += lineHeight;

    // Final message
    let finalMessage: string;
    if (this.accuracy >= 90) {
      finalMessage = "Perfect! You're a dance master!";
    } else if (this.accuracy >= 70) {
      finalMessage = "Great job! Keep practicing!";
    } else {
      finalMessage = "Good try! You'll do better next time!";
    }

    drawTextWithShadow(textBitmap, x, y, 300, lineHeight, finalMessage,
      shadowOffset, shadowOffset, shadowColor, textColor);

    await this.pbUpdate();
  }

  //===========================================================================
  // Reward Methods
  //===========================================================================
  /** The reward threshold give_reward picks (nil: no reward). */
  rewardThreshold(): number | null {
    let rewardThreshold: number | null = Math.max(this.calculateSurvivalReward(), 10);
    // Survival mode uses play time instead of accuracy
    if (this.gameMode === "survival") {
      rewardThreshold = this.calculateSurvivalReward();
    } else {
      const keys = Object.keys(this.sequences[this.gameId]!.reward).map(Number).sort((a, b) => a - b).reverse();
      rewardThreshold = keys.find((t) => this.accuracy >= t) ?? null;
    }
    return rewardThreshold;
  }

  async giveReward(_rewardSprites: Record<string, Sprite>, _viewport: Viewport, _analysisSprite: Sprite): Promise<void> {
    const rewardThreshold = this.rewardThreshold();

    if (!(rewardThreshold && rewardThreshold > 0)) return; // Added >0 check

    const reward = this.sequences[this.gameId]!.reward[rewardThreshold];
    if (!reward) return;

    switch (reward.type) {
      case "item": {
        const item = Item.get(reward.id);
        bag().add(item.id, reward.quantity);
        const itemName = item.name;
        if (reward.quantity > 1) {
          await pbMessage(_INTL("You received {1} {2}s!", reward.quantity, itemName));
        } else {
          await pbMessage(_INTL("You received {1} {2}!", reward.quantity, itemName));
        }
        break;
      }
      case "money":
        player().money += reward.amount;
        await pbMessage(_INTL("You received ${1}!", reward.amount));
        break;
    }
  }

  // Turn the teacher event (ID 046) to face the expected arrow direction. Returns PBMoveRoute turn constant or nil.
  private teacherTurnRoute(expectedMove: Move): number | null {
    switch (expectedMove) {
      case "up": return PBMoveRoute.TurnUp;
      case "down": return PBMoveRoute.TurnDown;
      case "left": return PBMoveRoute.TurnLeft;
      case "right": return PBMoveRoute.TurnRight;
      default: return null;
    }
  }

  // Turn all following characters to face the same direction as the player (no movement).
  private pbTurnFollowers(dir: number): void {
    const followers = G.gameTemp?.followers;
    if (dir <= 0 || !followers || typeof followers.eachFollower !== "function") return;
    let turnCmd: number;
    switch (dir) {
      case 2: turnCmd = PBMoveRoute.TurnDown; break;
      case 4: turnCmd = PBMoveRoute.TurnLeft; break;
      case 6: turnCmd = PBMoveRoute.TurnRight; break;
      case 8: turnCmd = PBMoveRoute.TurnUp; break;
      default: return;
    }
    for (const [event] of followers.eachFollower()) {
      if (!event) continue;
      pbMoveRoute(event as unknown as GameCharacter, [turnCmd]);
    }
  }

  calculateSurvivalReward(): number {
    const seconds = this.playTime;
    if (seconds >= 0 && seconds <= 29) return 10; // 0-29 seconds - basic participation
    if (seconds >= 30 && seconds <= 119) return 25; // 30s-1:59min - minimal effort
    if (seconds >= 120 && seconds <= 239) return 50; // 2-3:59min
    if (seconds >= 240 && seconds <= 359) return 75; // 4-5:59min
    if (seconds >= 360 && seconds <= 599) return 90; // 6-9:59min
    return 100; // 10+min
  }

  //===========================================================================
  // Arrow Control Methods
  //===========================================================================
  async drawArrow(direction: Move): Promise<void> {
    const arrowPath = `${this.arrows[direction]}.png`;
    if (fileExists(arrowPath)) {
      const arrowBitmap = loadBitmap(arrowPath);
      this.sprites.arrow ??= new Sprite(this.viewport);
      const arrow = this.sprites.arrow;
      arrow.setBitmap(arrowBitmap);
      arrow.x = Math.floor((Graphics.width - arrowBitmap.width) / 2);
      arrow.y = -arrowBitmap.height;
      arrow.opacity = 255;
    } else {
      await pbMessage("Error: Arrow image not found.");
      this.disposeSprites();
    }
  }

  async handleInput(expectedMove: Move): Promise<"correct" | "error"> {
    this.teacherTurnedThisArrow = false;
    this.dancersTurnedThisArrow = false;
    this.dancerTurnAt = null;
    const maxTimeAllowed = 1.0 / this.speed;
    const frameTime = 1.0 / RUBY_FRAME_RATE;
    let moveSpeed = (Graphics.height + this.sprites.arrow!.bitmap!.height) / (maxTimeAllowed / frameTime);
    moveSpeed *= 0.4;
    const inputMap: [number, Move][] = [
      [Input.UP, "up"],
      [Input.DOWN, "down"],
      [Input.LEFT, "left"],
      [Input.RIGHT, "right"],
    ];
    const gamePlayer = G.gamePlayer as unknown as GameCharacter;

    for (;;) {
      await this.frames.update();
      Input.update();

      // Turn player and followers to face direction keys (no movement)
      const dir = Input.dir4();
      if (dir > 0) {
        switch (dir) {
          case 2: gamePlayer?.turnDown(); break;
          case 4: gamePlayer?.turnLeft(); break;
          case 6: gamePlayer?.turnRight(); break;
          case 8: gamePlayer?.turnUp(); break;
        }
        this.pbTurnFollowers(dir);
      }
      await G.scene?.miniupdate?.(); // $scene.miniupdate if $scene.is_a?(Scene_Map)

      const arrow = this.sprites.arrow;
      if (!(arrow && arrow.bitmap)) {
        return "error";
      }

      // Sprite#y is an Integer in RGSS: the fractional move speed is truncated.
      arrow.y = Math.trunc(arrow.y + moveSpeed);
      const target = this.sprites.target!;
      const arrowRect = new Rect(arrow.x, arrow.y, arrow.bitmap.width, arrow.bitmap.height);
      const targetRect = new Rect(target.x, target.y, target.bitmap!.width, target.bitmap!.height);

      if (arrowRect.y > Graphics.height) {
        arrow.opacity = 255;
        return "error";
      }

      if (this.rectsCollide(arrowRect, targetRect)) {
        // Teacher event turns to face the correct direction at the correct time (once per arrow)
        if (!this.teacherTurnedThisArrow) {
          const teacher = G.gameMap?.events.get(DanceGame.TEACHER_EVENT_ID);
          if (teacher) {
            const turnCmd = this.teacherTurnRoute(expectedMove);
            if (turnCmd) pbMoveRoute(teacher as unknown as GameCharacter, [turnCmd]);
          }
          this.teacherTurnedThisArrow = true;
          this.dancerTurnAt = originalFrameCount() + DanceGame.DANCER_TURN_DELAY_FRAMES;
        }
        // Dancer NPCs turn with a slight delay after the teacher
        if (this.dancerTurnAt != null && originalFrameCount() >= this.dancerTurnAt && !this.dancersTurnedThisArrow) {
          const turnCmd = this.teacherTurnRoute(expectedMove);
          if (turnCmd) {
            for (const eventId of DanceGame.DANCER_EVENT_IDS) {
              const dancer = G.gameMap?.events.get(eventId);
              if (dancer) pbMoveRoute(dancer as unknown as GameCharacter, [turnCmd]);
            }
          }
          this.dancersTurnedThisArrow = true;
        }
        for (const [key, move] of inputMap) {
          if (Input.trigger(key)) {
            if (expectedMove === move) {
              return "correct";
            } else {
              return "error";
            }
          }
        }
      }
      if (arrow.y > target.y + target.bitmap!.height) {
        return "error";
      }
    }
  }

  //===========================================================================
  // Sprite and Viewport Methods
  //===========================================================================
  async pbCreateSprites(): Promise<void> {
    // No bg_main.png: overworld map and player stay visible during the minigame.

    for (const [key, path] of Object.entries(this.arrows)) {
      const filename = `${path}.png`;
      if (fileExists(filename)) {
        const s = new Sprite(this.viewport);
        this.sprites[key] = s;
        s.setBitmap(loadBitmap(filename));
        s.visible = false;
        s.z = 10;
      } else {
        await pbMessage(`Error: Arrow image not found at ${filename}`);
        this.disposeSprites();
        return;
      }
    }

    const targetPath = "Graphics/Minigame/target.png";
    if (fileExists(targetPath)) {
      const target = new Sprite(this.viewport);
      this.sprites.target = target;
      target.setBitmap(loadBitmap(targetPath));
      target.x = Math.floor((Graphics.width - target.bitmap!.width) / 2);
      target.y = Math.floor((Graphics.height - target.bitmap!.height) / 2);
      target.z = 5;
      target.opacity = 0;
    } else {
      await pbMessage(`Error: Target image not found at ${targetPath}`);
      this.disposeSprites();
    }
  }

  disposeSprites(): void {
    for (const sprite of Object.values(this.sprites)) {
      if (sprite) sprite.dispose();
    }
    this.viewport.dispose();
  }

  rectsCollide(rect1: Rect, rect2: Rect): boolean {
    return !(rect1.x > rect2.x + rect2.width ||
      rect1.x + rect1.width < rect2.x ||
      rect1.y > rect2.y + rect2.height ||
      rect1.y + rect1.height < rect2.y);
  }

  //===========================================================================
  // Audio Methods
  //===========================================================================
  pbPlayCorrectSE(): void {
    Audio.sePlay(seName("Audio/SE/Correct"), 40, 100);
  }

  pbPlayErrorSE(): void {
    Audio.sePlay(seName("Audio/SE/Error"), 40, 100);
  }

  async pbFlashArrow(times: number): Promise<void> {
    for (let n = 0; n < times; n++) {
      this.sprites.arrow!.opacity = 128;
      await this.pbUpdate();
      await sleep(0.1);
      this.sprites.arrow!.opacity = 255;
      await this.pbUpdate();
      await sleep(0.1);
    }
  }
}

/** pbFadeInAndShow / pbFadeOutAndHide: (frame_rate * 0.4).floor steps (in 60 Hz ticks here, as fades.ts). */
const FADE_STEPS = Math.floor(60 * 0.4);
const FADE_ALPHA = Math.ceil(255 / FADE_STEPS);

//===============================================================================
// Global Methods
//===============================================================================
export async function pbShowInfiniteScore(): Promise<void> {
  const highScore = variables().get(DanceGame.INFINITE_HIGH_SCORE_VAR);
  await pbMessage(_INTL("Your highest score in Infinite Mode is: {1}", highScore));
}

export async function pbSurvivalTimeRecord(survivalId = 1): Promise<void> {
  const timeVar = PBMiniGames.SURVIVAL_TIME_RECORD_VARS[survivalId] ?? 37;
  const recordSeconds = varNumber(timeVar);

  if (recordSeconds <= 0) {
    await pbMessage(_INTL(`No survival time record yet for mode ${survivalId}.`));
  } else {
    // Convert seconds to minutes:seconds format
    const minutes = Math.floor(recordSeconds / 60);
    const seconds = recordSeconds % 60;
    await pbMessage(_INTL(`Your best survival time in mode ${survivalId} is: {1}:{2}`,
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0")));
  }
}

export async function pbDanceGame(gameId: number, bpm = 120): Promise<void> {
  if (DanceGame.validGameIdStatic(gameId)) {
    await DanceGame.pbDanceGame(gameId, bpm);
  } else {
    throw new Error(`Minigame not found for ID ${gameId}.`);
  }
}
