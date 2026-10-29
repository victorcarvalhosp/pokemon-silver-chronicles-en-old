// Port of 016_UI/001_Non-interactive UI/001_UI_SplashesAndTitleScreen.rb.
//
// In Ruby, close_title_screen opens the load screen from inside the event
// scene's update and Scene_Intro#main freezes the screen once everything
// returns. Here the title screen ends after fade_out_title_screen and reports
// which branch was taken; the caller opens PokemonLoadScreen (and does the
// final Graphics.freeze, which in Ruby happens after the load screen).

import { Data } from "../../data/store";
import { pbBGMPlay, pbBGMStop } from "../../game/GameSystem";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import type { Viewport } from "../../rgss/display";
import { preloadBitmaps } from "../rpgCache";
import { EventScene } from "./EventScene";
import type { PictureEx } from "./PictureEx";

export type TitleBranch = "load" | "delete";

export class IntroEventScene extends EventScene {
  // Splash screen images that appear for a few seconds and then disappear.
  static readonly SPLASH_IMAGES = ["splash1", "splash2"];
  // The main title screen background image.
  static readonly TITLE_BG_IMAGE = "title";
  static readonly TITLE_START_IMAGE = "start";
  static readonly TITLE_START_IMAGE_X = 0;
  static readonly TITLE_START_IMAGE_Y = 322;
  static readonly SECONDS_PER_SPLASH = 2;
  static readonly TICKS_PER_ENTER_FLASH = 40; // 20 ticks per second
  static readonly FADE_TICKS = 8; // 20 ticks per second

  /** Which close_title_screen* method ended the scene. */
  branch: TitleBranch | null = null;
  private pic: PictureEx;
  private pic2: PictureEx;
  private index = 0;
  private timer = 0.0;

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.pic = this.addImage(0, 0, "");
    this.pic.setOpacity(0, 0); // set opacity to 0 after waiting 0 frames
    this.pic2 = this.addImage(0, 0, ""); // flashing "Press Enter" picture
    this.pic2.setOpacity(0, 0); // set opacity to 0 after waiting 0 frames
  }

  override async initialize(): Promise<void> {
    if (IntroEventScene.SPLASH_IMAGES.length === 0) {
      await this.openTitleScreen(this);
    } else {
      await this.openSplash(this);
    }
  }

  async openSplash(_scene: EventScene): Promise<void> {
    const S = IntroEventScene;
    this.onCTrigger.clear();
    this.pic.name = "Graphics/Titles/" + S.SPLASH_IMAGES[this.index];
    // fade to opacity 255 in FADE_TICKS ticks after waiting 0 frames
    this.pic.moveOpacity(0, S.FADE_TICKS, 255);
    await this.pictureWait();
    this.timer = 0.0; // reset the timer
    this.onUpdate.set((scene) => this.splashUpdate(scene as EventScene)); // called every frame
    this.onCTrigger.set((scene) => this.closeSplash(scene as EventScene)); // called when C key is pressed
  }

  async closeSplash(scene: EventScene): Promise<void> {
    const S = IntroEventScene;
    this.onUpdate.clear();
    this.onCTrigger.clear();
    this.pic.moveOpacity(0, S.FADE_TICKS, 0);
    await this.pictureWait();
    this.index += 1; // Move to the next picture
    if (this.index >= S.SPLASH_IMAGES.length) {
      await this.openTitleScreen(scene);
    } else {
      await this.openSplash(scene);
    }
  }

  async splashUpdate(scene: EventScene): Promise<void> {
    this.timer += Graphics.deltaS;
    if (this.timer > IntroEventScene.SECONDS_PER_SPLASH) await this.closeSplash(scene);
  }

  async openTitleScreen(_scene: EventScene): Promise<void> {
    const S = IntroEventScene;
    this.onUpdate.clear();
    this.onCTrigger.clear();
    this.pic.name = "Graphics/Titles/" + S.TITLE_BG_IMAGE;
    this.pic.moveOpacity(0, S.FADE_TICKS, 255);
    this.pic2.name = "Graphics/Titles/" + S.TITLE_START_IMAGE;
    this.pic2.setXY(0, S.TITLE_START_IMAGE_X, S.TITLE_START_IMAGE_Y);
    this.pic2.setVisible(0, true);
    this.pic2.moveOpacity(0, S.FADE_TICKS, 255);
    await this.pictureWait();
    pbBGMPlay(Data.system.titleBgm);
    this.onUpdate.set((scene) => this.titleScreenUpdate(scene as EventScene)); // called every frame
    this.onCTrigger.set((scene) => this.closeTitleScreen(scene as EventScene)); // called when C key is pressed
  }

  async fadeOutTitleScreen(scene: EventScene): Promise<void> {
    const S = IntroEventScene;
    this.onUpdate.clear();
    this.onCTrigger.clear();
    // Play random cry
    // TODO(cries): species_keys = GameData::Species.keys;
    //   Pokemon.play_cry(species.species, species.form) for a random species
    //   once Pokémon cries are ported.
    this.pic.moveXY(0, 20, 0, 0); // Adds 20 ticks (1 second) pause
    await this.pictureWait();
    // Fade out
    this.pic.moveOpacity(0, S.FADE_TICKS, 0);
    this.pic2.clearProcesses();
    this.pic2.moveOpacity(0, S.FADE_TICKS, 0);
    pbBGMStop(1.0);
    await this.pictureWait();
    scene.dispose(); // Close the scene
  }

  /** Ruby then runs PokemonLoadScreen#pbStartLoadScreen; see the file header. */
  async closeTitleScreen(scene: EventScene): Promise<void> {
    await this.fadeOutTitleScreen(scene);
    this.branch = "load";
  }

  /** Ruby then runs PokemonLoadScreen#pbStartDeleteScreen; see the file header. */
  async closeTitleScreenDelete(scene: EventScene): Promise<void> {
    await this.fadeOutTitleScreen(scene);
    this.branch = "delete";
  }

  async titleScreenUpdate(scene: EventScene): Promise<void> {
    const S = IntroEventScene;
    // Flashing of "Press Enter" picture
    if (!this.pic2.running()) {
      this.pic2.moveOpacity(Math.floor((S.TICKS_PER_ENTER_FLASH * 2) / 10), Math.floor((S.TICKS_PER_ENTER_FLASH * 4) / 10), 0);
      this.pic2.moveOpacity(Math.floor((S.TICKS_PER_ENTER_FLASH * 6) / 10), Math.floor((S.TICKS_PER_ENTER_FLASH * 4) / 10), 255);
    }
    if (Input.press(Input.DOWN) && Input.press(Input.BACK) && Input.press(Input.CTRL)) {
      await this.closeTitleScreenDelete(scene);
    }
  }
}

/** Every graphic the splashes and title use. */
export const TITLE_SCREEN_BITMAPS = [
  ...IntroEventScene.SPLASH_IMAGES, IntroEventScene.TITLE_BG_IMAGE, IntroEventScene.TITLE_START_IMAGE,
].map((n) => "Graphics/Titles/" + n);

export class Scene_Intro {
  async main(): Promise<TitleBranch> {
    await preloadBitmaps(TITLE_SCREEN_BITMAPS);
    await Graphics.transition(0);
    const eventscene = new IntroEventScene();
    await eventscene.initialize();
    await eventscene.main();
    // Graphics.freeze: left to the caller (it comes after the load screen in Ruby).
    return eventscene.branch ?? "load";
  }
}

/**
 * Plays the splashes and the title screen, waits for C (or Down+Back+Ctrl),
 * and resolves after fade_out_title_screen with the branch Ruby would take:
 * "load" (close_title_screen) or "delete" (close_title_screen_delete).
 */
export async function runTitleScreen(): Promise<TitleBranch> {
  return new Scene_Intro().main();
}
