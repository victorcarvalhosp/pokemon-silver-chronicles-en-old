// Port of Data/Scripts/016_UI/001_Non-interactive UI/007_UI_Credits.rb
// (Scene_Credits) with this game's credits text.
//
// Scene_Credits is a $scene: an event sets `$scene = Scene_Credits.new`,
// Scene_Map#main ends, and main.ts runs this scene's main until it sets
// $scene back to a new Scene_Map (or nil).
//
// PluginManager's plugin list (name, version, credits) is copied from
// Data/PluginScripts.rxdata in load order, which is the order
// PluginManager.plugins returns them in.

import { pbBGMFade, pbBGMPlay, pbSEStop } from "../../game/GameSystem";
import { G } from "../../game/globals";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Audio } from "../../rgss/Audio";
import { Color } from "../../rgss/types";
import { pbSetSystemFont } from "../messageConfig";
import { preloadBitmaps } from "../rpgCache";
import { IconSprite } from "../SpriteWrapper";

/** [name, version, credits] of each plugin (Data/PluginScripts.rxdata). */
export const PLUGINS: [string, string | null, string[]][] = [
  ["v20.1 Hotfixes", "1.0.7", ["Maruno"]],
  ["Generation 9 Pack", "2.0", ["Caruban", "Lucidious89"]],
  ["Visible Overworld Wild Encounters", "20.0.0.5", ["derFischae"]],
  ["Unown Report", "1.0", ["Richard PT"]],
  ["Triple Triad Booster Pack", "1.1.1", ["FL"]],
  ["TDW Debug List Search", "1.2", ["wrigty12", "KRLW890"]],
  ["Temporal Chains' Wardrobe", "1.0", ["DarrylBD99", "StarWolff"]],
  ["Better Speed Up", "2.0", ["Marin for the original script", "Phantombass for updating to 19.1"]],
  ["Special Icons Map", "0.0.1", ["victordevjs"]],
  ["Social Links", "1.3.1", ["wrigty12"]],
  ["Side Stairs Tiles", "1.3", ["Boonzeet", "Vendily"]],
  ["Roulette Minigame", "1.1.6", ["FL"]],
  ["Roaming Icon", "1.1.2", ["FL"]],
  ["Pokemon Silver Chronicles Helpers", "1.0", ["victorweb.dev"]],
  ["Pokemon Selection Before Battle", "1.3.3", ["FL"]],
  ["Pokémon Amie", "1.7", ["BhagyaJyoti (Made for v18 with many fixes and made more Plug-n-Play)", "PizzaSun (Original Script for v17.2)", "rigbycwts (Concept for Essentials)", "Gardenette (v20.1 port)", "Luka S.J. (for the mask method)"]],
  ["Photographer", "1.0", ["victordevjs"]],
  ["Partner Trainer Card", null, ["victordevjs"]],
  ["Overworld Shadows EX", "2.0.3", ["Golisopod User", "Wolf PP", "Marin"]],
  ["Mr. Gela's HGSS Trainer Card Scene", null, ["Mr. Gela", "DeepBlue PacificWaves"]],
  ["Mounts", "1.0.0", ["MakerBlack"]],
  ["Mega Evolution", "1.0", ["bo4p5687"]],
  ["Marin's Enhanced Staircases", "2.0", ["Marin"]],
  ["Map Zoom", "1.0", ["Golisopod User", "Marin", "Luka SJ", "TechSkylander1518"]],
  ["Modern Quest System + UI", "1.0.2", ["ThatWelshOne_", "mej71", "derFischae", "Marin"]],
  ["Luka's Scripting Utilities", "3.3.2", ["Luka S.J."]],
  ["Generation 8 Pack Scripts", "1.0.4", ["Golisopod User", "Luka S.J."]],
  ["Improved AI", "1.2.2", ["KRLW890"]],
  ["Following Pokemon EX", "2.2.3", ["Golisopod User", "Help-14", "zingzags", "Rayd12smitty", "Venom12", "mej71", "PurpleZaffre", "Akizakura16", "Thundaga", "Armin (Fairies Resource Pack)", "Maruno"]],
  ["Essentials Deluxe", "1.2.8", ["Lucidious89"]],
  ["ZUD Mechanics", "1.2.5", ["Lucidious89"]],
  ["Fly Animation by KleinStudio Updated By A.I.R", "3.0", ["KleinStudio (original)", "A.I.R (update)"]],
  ["Experiment with Scene", "1.0", ["victorweb.dev"]],
  ["Improved Field Skills", "1.0.4", ["Lucidious89"]],
  ["Enhanced UI", "1.1.3", ["Lucidious89", "Ball Sprites: Poq and BlueEye007"]],
  ["Encounter List UI (v20)", "1.0.2", ["ThatWelshOne_", "raZ", "Marin", "Maruno", "Nuri Yuri", "PurpleZaffre", "Savordez", "Vendily"]],
  ["Easy Mouse System", "2.0", ["Luka S.J."]],
  ["DayCare Overworld Pokemon", "1.0", ["bo4p5687"]],
  ["Mini games", "2.5", ["Rafahbit"]],
  ["DP PauseMenu", "1.5", ["Marin", "Maryn (Adapted to v21.1)", "ChromeValiant (Pokegear", "Safari Zone", "Bug-Catching compatibility)", "Spaceemotion (Retire icon)", "PurpleZaffre (Pokegear icon)"]],
  ["Carmaniac's Speech Bubble Script", "1.0.0", ["NonoNever", "Carmaniac"]],
  ["RSE Cable Car Scene", "1.2", ["PurpleZaffre"]],
  ["BW Key Items", "2.3.0", ["KleinStudio", "DeepBlue PacificWaves", "Izanagi"]],
  ["BW Gender Selector", "2.2.0", ["KleinStudio", "DeepBlue PacificWaves", "TechSkylander1518"]],
  ["Apricorn To Ball", "1.0", ["Dr.Doom76"]],
];

/** A new Scene_Map (scenes/SceneMap.ts registers it, avoiding an import cycle). */
export const CreditsHooks = { newSceneMap: null as (() => unknown) | null };

export class Scene_Credits {
  /** Backgrounds to show in credits. Found in Graphics/Titles/ folder */
  static readonly BACKGROUNDS_LIST = ["credits1", "credits2", "credits3", "credits4", "credits5"];
  static readonly BGM = "Credits";
  static readonly SCROLL_SPEED = 40; // Pixels per second
  static readonly SECONDS_PER_BACKGROUND = 11;
  static readonly TEXT_OUTLINE_COLOR = new Color(0, 0, 128, 255);
  static readonly TEXT_BASE_COLOR = new Color(255, 255, 255, 255);
  static readonly TEXT_SHADOW_COLOR = new Color(0, 0, 0, 100);

  // This next piece of code is the credits.
  // Start Editing
  static CREDIT = `
Game created by:
Victor Fernandes de Carvalho "@victordevjs"

Mappers:
Rafael Zeca "Jameszekinha"
Dayon Renan "Blaze"
Raul Guilherme "Ragui"
Victor Fernandes de Carvalho "@victordevjs"
 
Spriters:
Leonan Carvalho "Grundor"
Robson de Souza "Binho"
Higor Renan "DarknessX"
Hugo Conceição "Hitsugaya Ryussen"
Enrique Rodrigues "Enrisco"
Victor Fernandes de Carvalho "@victordevjs"

Screenwriters:
Jefferson Almeida"Gaara" 
Euricos da Silva Junior
Flávio Ramone
Victor Fernandes de Carvalho "@victordevjs"

Event programmers:
Victor Fernandes de Carvalho "@victordevjs"
Guilherme Bruno "GuiiH"
Matheus Ferreira "Corujinha"

Beta-testers:
Eddie Aparecido "Eas"
Fernando B. Gomes "Chronos"
José Henrique "Crazy Fox "
Lucas Lazarim "Raionic"
Danilo Farias "Clow"
Erick Oliveira "Drew"
Filipe Poubel "Hakku"
Matheus Victor "Matoer"
Rômulo Rodrigues "Ratinho"

Scripters:
Victor Fernandes de Carvalho "@victordevjs"
Jeferson "Red"

Amazing people that shared free sprites that are used in the game:
DescendedFromUllr
mid117
Gregarlink10
Ekat99
Morlock-Liam
PaperFire88
PurpleZaffre
DiegoWT
Wolfang62
hyo-oppa
The-Red-eX
Lime029
Gracidya
aveontrainer
Dewdneym
maicerochico
zetavares852
StreakOfSprites
argamaburey


{INSERTS_PLUGIN_CREDITS_DO_NOT_REMOVE}

"Pokémon Essentials" was created by:
Flameguru
Poccil (Peter O.)
Maruno

With contributions from:
AvatarMonkeyKirby<s>Marin
Boushy<s>MiDas Mike
Brother1440<s>Near Fantastica
FL.<s>PinkMan
Genzai Kawakami<s>Popper
Golisopod User<s>Rataime
help-14<s>Savordez
IceGod64<s>SoundSpawn
Jacob O. Wobbrock<s>the__end
KitsuneKouta<s>Venom12
Lisa Anthony<s>Wachunga
Luka S.J.<s>
and everyone else who helped out

"mkxp-z" by:
Roza
Based on "mkxp" by Ancurio et al.

"RPG Maker XP" by:
Enterbrain

Pokémon is owned by:
The Pokémon Company
Nintendo
Affiliated with Game Freak



This is a non-profit fan-made game.
No copyright infringements intended.
Please support the official games!

`;
  // Stop Editing

  private counter = 0.0;
  private bgIndex = 0;
  private bitmapHeight = 0;
  private trim = 0;
  private realOY = 0;
  private totalHeight = 0;
  private backgroundSprite!: IconSprite;
  private creditSprites: Sprite[] = [];

  async main(): Promise<void> {
    //-------------------------------
    // Animated Background Setup
    //-------------------------------
    this.counter = 0.0; // Counts time elapsed since the background image changed
    this.bgIndex = 0;
    this.bitmapHeight = Graphics.height; // For a single credits text bitmap
    this.trim = Math.floor(Graphics.height / 10);
    // Number of game frames per background frame
    this.realOY = -(Graphics.height - this.trim);
    //-------------------------------
    // Credits text Setup
    //-------------------------------
    let pluginCredits = "";
    for (const [plugin, version, pcred] of PLUGINS) {
      pluginCredits += `"${plugin}" v.${version ?? ""} by:\n`;
      if (pcred.length >= 5) {
        pluginCredits += pcred[0] + "\n";
        let i = 1;
        while (i < pcred.length) {
          pluginCredits += pcred[i] + "<s>" + (pcred[i + 1] ?? "") + "\n";
          i += 2;
        }
      } else {
        for (const name of pcred) pluginCredits += name + "\n";
      }
      pluginCredits += "\n";
    }
    // CREDIT.gsub! changes the constant: the plugin credits are only inserted once.
    Scene_Credits.CREDIT = Scene_Credits.CREDIT.replace(/\{INSERTS_PLUGIN_CREDITS_DO_NOT_REMOVE\}/g, () => pluginCredits);
    // String#split(/\n/) drops trailing empty strings.
    const creditLines = Scene_Credits.CREDIT.split(/\n/);
    while (creditLines.length > 0 && creditLines[creditLines.length - 1] === "") creditLines.pop();
    //-------------------------------
    // Make background and text sprites
    //-------------------------------
    await preloadBitmaps(Scene_Credits.BACKGROUNDS_LIST.map((b) => "Graphics/Titles/" + b));
    const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    viewport.z = 99999;
    const textViewport = new Viewport(0, this.trim, Graphics.width, Graphics.height - (this.trim * 2));
    textViewport.z = 99999;
    this.backgroundSprite = new IconSprite(0, 0);
    this.backgroundSprite.setBitmapFile("Graphics/Titles/" + Scene_Credits.BACKGROUNDS_LIST[0]);
    this.creditSprites = [];
    this.totalHeight = creditLines.length * 32;
    const linesPerBitmap = Math.floor(this.bitmapHeight / 32);
    const numBitmaps = Math.ceil(creditLines.length / linesPerBitmap);
    for (let i = 0; i < numBitmaps; i++) {
      const creditBitmap = new Bitmap(Graphics.width, this.bitmapHeight + 16);
      pbSetSystemFont(creditBitmap);
      for (let j = 0; j < linesPerBitmap; j++) {
        const raw = creditLines[(i * linesPerBitmap) + j];
        if (raw == null) continue;
        const line = raw.split("<s>");
        // Ruby's String#split drops trailing empty strings ("a<s>" is ["a"]).
        while (line.length > 1 && line[line.length - 1] === "") line.pop();
        let xpos = 0;
        let align = 1; // Centre align
        let linewidth = Graphics.width;
        for (let k = 0; k < line.length; k++) {
          if (line.length > 1) {
            xpos = k === 0 ? 0 : 20 + Math.floor(Graphics.width / 2);
            align = k === 0 ? 2 : 0; // Right align : left align
            linewidth = Math.floor(Graphics.width / 2) - 20;
          }
          const text = line[k]!;
          creditBitmap.font.color = Scene_Credits.TEXT_SHADOW_COLOR;
          creditBitmap.drawText(xpos, (j * 32) + 12, linewidth, 32, text, align);
          creditBitmap.font.color = Scene_Credits.TEXT_OUTLINE_COLOR;
          creditBitmap.drawText(xpos + 2, (j * 32) + 2, linewidth, 32, text, align);
          creditBitmap.drawText(xpos, (j * 32) + 2, linewidth, 32, text, align);
          creditBitmap.drawText(xpos - 2, (j * 32) + 2, linewidth, 32, text, align);
          creditBitmap.drawText(xpos + 2, (j * 32) + 4, linewidth, 32, text, align);
          creditBitmap.drawText(xpos - 2, (j * 32) + 4, linewidth, 32, text, align);
          creditBitmap.drawText(xpos + 2, (j * 32) + 6, linewidth, 32, text, align);
          creditBitmap.drawText(xpos, (j * 32) + 6, linewidth, 32, text, align);
          creditBitmap.drawText(xpos - 2, (j * 32) + 6, linewidth, 32, text, align);
          creditBitmap.font.color = Scene_Credits.TEXT_BASE_COLOR;
          creditBitmap.drawText(xpos, (j * 32) + 4, linewidth, 32, text, align);
        }
      }
      const creditSprite = new Sprite(textViewport);
      creditSprite.setBitmap(creditBitmap);
      creditSprite.z = 9998;
      creditSprite.oy = this.realOY - (this.bitmapHeight * i);
      this.creditSprites[i] = creditSprite;
    }
    //-------------------------------
    // Setup
    //-------------------------------
    // Stops all audio but background music
    const previousBGM = G.gameSystem.getPlayingBGM();
    Audio.meStop();
    Audio.bgsStop();
    pbSEStop();
    pbBGMFade(2.0);
    pbBGMPlay(Scene_Credits.BGM);
    await Graphics.transition();
    for (;;) {
      await Graphics.update();
      Input.update();
      this.update();
      if (G.scene !== (this as unknown)) break;
    }
    pbBGMFade(2.0);
    const t = G.gameTemp as unknown as { backgroundBitmap?: Bitmap | null };
    t.backgroundBitmap = Graphics.snapToBitmap();
    Graphics.freeze();
    viewport.color = new Color(0, 0, 0, 255); // Ensure screen is black
    await Graphics.transition(8 / 20, "fadetoblack");
    t.backgroundBitmap?.dispose();
    this.backgroundSprite.dispose();
    for (const s of this.creditSprites) {
      s.bitmap?.dispose();
      s.dispose();
    }
    textViewport.dispose();
    viewport.dispose();
    G.pokemonGlobal.creditsPlayed = true;
    pbBGMPlay(previousBGM);
  }

  /** Check if the credits should be cancelled */
  cancel(): boolean {
    if (Input.trigger(Input.USE) && G.pokemonGlobal.creditsPlayed) {
      G.scene = CreditsHooks.newSceneMap!() as never;
      pbBGMFade(1.0);
      return true;
    }
    return false;
  }

  /** Checks if credits bitmap has reached its ending point */
  last(): boolean {
    if (this.realOY > this.totalHeight + this.trim) {
      G.scene = (G.gameMap ? CreditsHooks.newSceneMap!() : null) as never;
      pbBGMFade(2.0);
      return true;
    }
    return false;
  }

  update(): void {
    const delta = Graphics.deltaS;
    this.counter += delta;
    // Go to next slide
    if (this.counter >= Scene_Credits.SECONDS_PER_BACKGROUND) {
      this.counter -= Scene_Credits.SECONDS_PER_BACKGROUND;
      this.bgIndex += 1;
      if (this.bgIndex >= Scene_Credits.BACKGROUNDS_LIST.length) this.bgIndex = 0;
      this.backgroundSprite.setBitmapFile("Graphics/Titles/" + Scene_Credits.BACKGROUNDS_LIST[this.bgIndex]);
    }
    if (this.cancel()) return;
    if (this.last()) return;
    this.realOY += Scene_Credits.SCROLL_SPEED * delta;
    this.creditSprites.forEach((s, i) => { s.oy = this.realOY - (this.bitmapHeight * i); });
  }
}
