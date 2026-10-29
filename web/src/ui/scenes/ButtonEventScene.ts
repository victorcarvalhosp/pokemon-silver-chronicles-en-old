// Port of 016_UI/001_Non-interactive UI/002_UI_Controls.rb.
//==============================================================================
// * Scene_Controls
//------------------------------------------------------------------------------
// Shows a help screen listing the keyboard controls.
// Display with:
//      pbEventScreen(ButtonEventScene)
//==============================================================================

import type { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color } from "../../rgss/types";
import { _INTL } from "../messageConfig";
import { preloadBitmaps } from "../rpgCache";
import { EventScene } from "./EventScene";
import type { PictureEx } from "./PictureEx";

const HELP = "Graphics/Pictures/Controls help/";

/** Graphics the scene draws; preload before pbEventScreen(ButtonEventScene). */
export const BUTTON_EVENT_SCENE_BITMAPS = [
  "help_bg", "help_f1", "help_f8", "help_arrows", "help_usekey", "help_backkey", "help_actionkey", "help_specialkey",
].map((n) => HELP + n);

export function preloadButtonEventScene(): Promise<void> {
  return preloadBitmaps(BUTTON_EVENT_SCENE_BITMAPS);
}

export class ButtonEventScene extends EventScene {
  static preload = preloadButtonEventScene;

  private currentScreen = 1;
  private labels: PictureEx[] = [];
  private labelScreens: number[] = [];
  private keys: PictureEx[] = [];
  private keyScreens: number[] = [];

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    Graphics.freeze();
    this.addImage(0, 0, HELP + "help_bg");

    this.addImageForScreen(1, 44, 122, HELP + "help_f1");
    this.addImageForScreen(1, 44, 252, HELP + "help_f8");
    this.addLabelForScreen(1, 134, 84, 352, _INTL("Opens the Key Bindings window, where you can choose which keyboard keys to use for each control."));
    this.addLabelForScreen(1, 134, 244, 352, _INTL("Take a screenshot. It is put in the same folder as the save file."));

    this.addImageForScreen(2, 16, 158, HELP + "help_arrows");
    this.addLabelForScreen(2, 134, 100, 352, _INTL("Use the Arrow keys to move the main character.\r\n\r\nYou can also use the Arrow keys to select entries and navigate menus."));

    this.addImageForScreen(3, 16, 90, HELP + "help_usekey");
    this.addImageForScreen(3, 16, 236, HELP + "help_backkey");
    this.addLabelForScreen(3, 134, 68, 352, _INTL("Used to confirm a choice, interact with people and things, and move through text. (Default: C)"));
    this.addLabelForScreen(3, 134, 196, 352, _INTL("Used to exit, cancel a choice, and cancel a mode. While moving around, hold to move at a different speed. (Default: X)"));

    this.addImageForScreen(4, 16, 90, HELP + "help_actionkey");
    this.addImageForScreen(4, 16, 236, HELP + "help_specialkey");
    this.addLabelForScreen(4, 134, 68, 352, _INTL("Used to open the Pause Menu. Also has various functions depending on context. (Default: Z)"));
    this.addLabelForScreen(4, 134, 196, 352, _INTL("Press to open the Ready Menu, where registered items and available field moves can be used. (Default: D)"));
  }

  override async initialize(): Promise<void> {
    await this.setUpScreen(this.currentScreen);
    await Graphics.transition(8 / 20);
    // Go to next screen when user presses USE
    this.onCTrigger.set((scene) => this.pbOnScreenEnd(scene as EventScene));
  }

  addLabelForScreen(number: number, x: number, y: number, width: number, text: string): void {
    this.labels.push(this.addLabel(x, y, width, text));
    this.labelScreens.push(number);
    this.picturesprites[this.picturesprites.length - 1]!.opacity = 0;
  }

  addImageForScreen(number: number, x: number, y: number, filename: string): void {
    this.keys.push(this.addImage(x, y, filename));
    this.keyScreens.push(number);
    this.picturesprites[this.picturesprites.length - 1]!.opacity = 0;
  }

  async setUpScreen(number: number): Promise<void> {
    this.labelScreens.forEach((screen, i) => {
      this.labels[i]!.moveOpacity(screen === number ? 10 : 0, 10, screen === number ? 255 : 0);
    });
    this.keyScreens.forEach((screen, i) => {
      this.keys[i]!.moveOpacity(screen === number ? 10 : 0, 10, screen === number ? 255 : 0);
    });
    await this.pictureWait(); // Update event scene with the changes
  }

  async pbOnScreenEnd(scene: EventScene): Promise<void> {
    const lastScreen = Math.max(Math.max(...this.labelScreens), Math.max(...this.keyScreens));
    if (this.currentScreen >= lastScreen) {
      // End scene
      // $game_temp.background_bitmap = Graphics.snap_to_bitmap; Graphics.freeze;
      // Graphics.transition(8, "fadetoblack") fades that snapshot out over the
      // now-black screen, which is what a plain freeze + transition shows.
      Graphics.freeze();
      if (this.viewport) this.viewport.color = new Color(0, 0, 0, 255); // Ensure screen is black
      await Graphics.transition(8 / 20);
      scene.dispose();
    } else {
      // Next screen
      this.currentScreen += 1;
      this.onCTrigger.clear();
      await this.setUpScreen(this.currentScreen);
      this.onCTrigger.set((s) => this.pbOnScreenEnd(s as EventScene));
    }
  }
}
