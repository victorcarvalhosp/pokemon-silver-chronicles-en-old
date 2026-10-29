// Port of Plugins/Generation 9 Pack Scripts/[001] Battle/[006] Legend Plate
// Functions.rb, "Form change animation" (lines 202-363): Battle::Scene#
// pbArceusTransform and Battle::Scene::Animation::ArceusTransform, played when
// an Arceus holding the Legend Plate changes type with Judgment
// (move/MoveEffects_MoveAttributes.ts). Imported with the other scene
// additions (game/battle/BattleStarting.ts); installs the method on
// BattleScene as Ruby reopens Battle::Scene, and has the scene preload the
// graphics.

import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import type { Viewport } from "../../rgss/display";
import { Tone } from "../../rgss/types";
import { preloadBitmaps } from "../../ui/rpgCache";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { Animation, type SceneSprites } from "./animationBase";
import { BattleScene } from "./BattleScene";

const T = (r: number, g: number, b: number) => new Tone(r, g, b);

//-------------------------------------------------------------------------------
// Arceus Plate Transform Animation
//-------------------------------------------------------------------------------
export class ArceusTransform extends Animation {
  // NOTE (Ruby parity): Legend Plate Functions.rb:279-282 brightens
  // `variances[3]` in place (`col = variances[3]; col.red += 255`...), so each
  // type's fourth tone in this table gets brighter every time the animation
  // plays, for the rest of the session (the plate's starting tone with it).
  static readonly PLATE_BURST_VARIANCES: Record<string, Tone[]> = {
    NORMAL: [T(0, 0, 0), T(0, 0, -192), T(0, 0, -96), T(0, -128, -248)],
    FIGHTING: [T(-12, -116, -192), T(-12, -116, -192), T(-10, -50, -96), T(-30, -128, -248)],
    FLYING: [T(0, 0, 0), T(-30, -22, 0), T(-10, -10, 0), T(-70, -70, 0)],
    POISON: [T(-60, -200, 0), T(-30, -100, 0), T(-20, -30, 0), T(-60, -200, 0)],
    GROUND: [T(-10, -13, -36), T(-10, -30, -70), T(-10, -13, -36), T(-15, -55, -120)],
    ROCK: [T(-25, -55, -120), T(-20, -30, -70), T(-20, -13, -36), T(-25, -55, -120)],
    BUG: [T(-45, -26, -58), T(-30, -8, -65), T(-16, -8, -29), T(-45, -26, -58)],
    GHOST: [T(-60, -200, 0), T(-30, -100, 0), T(-20, -30, 0), T(-60, -200, 0)],
    STEEL: [T(0, 0, 0), T(-40, -40, -40), T(-10, -10, -10), T(-128, -128, -128)],
    QMARKS: [T(-60, -200, 0), T(-30, -8, -65), T(-16, -8, -29), T(-45, -26, -58)],
    FIRE: [T(0, -128, -248), T(0, -29, -80), T(0, -30, -96), T(0, -128, -248)],
    WATER: [T(-192, -96, 0), T(-128, -64, 0), T(-96, -48, 0), T(-192, -96, 0)],
    GRASS: [T(-160, 0, -160), T(-128, 0, -128), T(-80, 0, -80), T(-160, 0, -160)],
    ELECTRIC: [T(0, 0, -192), T(0, 0, -192), T(0, -64, -144), T(0, -128, -248)],
    PSYCHIC: [T(-6, -35, 0), T(-6, -35, 0), T(0, -20, 0), T(-14, -100, 0)],
    ICE: [T(0, 0, 0), T(-184, -40, 0), T(-184, -40, 0), T(-192, -128, -32)],
    DRAGON: [T(-26, -29, -24), T(-30, -22, 0), T(-26, -29, -24), T(-50, -70, -40)],
    DARK: [T(-248, -248, -248), T(-248, -248, -248), T(-248, -248, -248), T(-248, -248, -248)],
    FAIRY: [T(0, -55, -32), T(0, -25, 0), T(0, -10, 0), T(0, -55, -32)],
  };

  static readonly GRAPHICS = [
    "Graphics/Battle animations/Arceus_Plate",
    "Graphics/Battle animations/ballBurst_particle",
    "Graphics/Battle animations/ballBurst_ray",
  ];

  constructor(sprites: SceneSprites, viewport: Viewport | null, private index: number, private type: Id) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const batSprite = this.sprites[`pokemon_${this.index}`];
    let delay = 0;
    const battlerX: number = batSprite.x;
    const battlerY: number = batSprite.y - 100;
    const numParticles = 15;
    const numRays = 10;
    const glareFadeDuration = 8; // Lifetimes/durations are in 20ths of a second
    const particleLifetime = 15;
    const particleFadeDuration = 8;
    const rayLifetime = 13;
    const rayFadeDuration = 5;
    const rayMinRadius = 24; // How far out from the center a ray starts
    const variances = ArceusTransform.PLATE_BURST_VARIANCES[this.type] ?? ArceusTransform.PLATE_BURST_VARIANCES.NORMAL!;
    // Set up Plate
    const plate = this.addNewSprite(battlerX, battlerY + 40, "Graphics/Battle animations/Arceus_Plate", PictureOrigin.CENTER);
    plate.setZ(0, 105);
    plate.setZoom(0, 100);
    plate.setTone(0, variances[3]!);
    plate.setVisible(0, false);
    plate.setOpacity(0, 0);
    plate.setVisible(delay, true);
    plate.moveOpacity(delay, 10, 255);
    plate.moveXY(delay, 10, battlerX, battlerY);
    delay = delay + 10;
    plate.moveTone(delay, Math.floor(glareFadeDuration / 2), variances[1]!);
    plate.moveOpacity(delay + glareFadeDuration + 3, glareFadeDuration, 0);
    plate.setVisible(delay + 19, false);
    // Set up Battler
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    battler.setXY(0, battlerX, batSprite.y);
    battler.setZoom(0, 100);
    const col = variances[3]!; // (the table's own Tone; see PLATE_BURST_VARIANCES)
    col.red += 255;
    col.green += 255;
    col.blue += 255;
    battler.setTone(delay + 6, col);
    battler.moveTone(delay + glareFadeDuration + 3, glareFadeDuration, new Tone(0, 0, 0, 0));
    // Set up glare particles
    const glare1 = this.addNewSprite(battlerX, battlerY, "Graphics/Battle animations/ballBurst_particle", PictureOrigin.CENTER);
    const glare2 = this.addNewSprite(battlerX, battlerY, "Graphics/Battle animations/ballBurst_particle", PictureOrigin.CENTER);
    [glare1, glare2].forEach((particle, num) => {
      particle.setZ(0, 105 + num);
      particle.setZoom(0, 0);
      particle.setTone(0, variances[2 - 2 * num]!);
      particle.setVisible(0, false);
    });
    [glare1, glare2].forEach((particle, num) => {
      particle.moveTone(delay + glareFadeDuration + 3, Math.floor(glareFadeDuration / 2), variances[1 - num]!);
    });
    // Animate glare particles
    for (const p of [glare1, glare2]) p.setVisible(delay, true);
    glare1.moveZoom(delay, glareFadeDuration, 250);
    glare1.moveOpacity(delay + glareFadeDuration + 3, glareFadeDuration, 0);
    glare2.moveZoom(delay, glareFadeDuration, 150);
    glare2.moveOpacity(delay + glareFadeDuration + 3, glareFadeDuration - 2, 0);
    for (const p of [glare1, glare2]) p.setVisible(delay + 19, false);
    // Rays
    for (let i = 0; i < numRays; i++) {
      // Set up ray
      const angle = rand(360);
      const radian = ((angle + 90) * Math.PI) / 180;
      const startZoom = 50 + rand(50); // rand(50...100)
      const ray = this.addNewSprite(battlerX + rayMinRadius * Math.cos(radian),
        battlerY - rayMinRadius * Math.sin(radian),
        "Graphics/Battle animations/ballBurst_ray", PictureOrigin.BOTTOM);
      ray.setZ(0, 100);
      ray.setZoomXY(0, 200, startZoom);
      ray.setTone(0, variances[0]!);
      ray.setOpacity(0, 0);
      ray.setVisible(0, false);
      ray.setAngle(0, angle);
      // Animate ray
      const start = delay + Math.floor(i / 2);
      ray.setVisible(start, true);
      ray.moveZoomXY(start, rayLifetime, 200, startZoom * 6);
      ray.moveOpacity(start, 2, 255); // Quickly fade in
      ray.moveOpacity(start + rayLifetime - rayFadeDuration, rayFadeDuration, 0); // Fade out
      ray.moveTone(start + rayLifetime - rayFadeDuration, rayFadeDuration, variances[1]!);
      ray.setVisible(start + rayLifetime, false);
    }
    // Particles
    for (let i = 0; i < numParticles; i++) {
      // Set up particles
      const particle1 = this.addNewSprite(battlerX, battlerY, "Graphics/Battle animations/ballBurst_particle", PictureOrigin.CENTER);
      const particle2 = this.addNewSprite(battlerX, battlerY, "Graphics/Battle animations/ballBurst_particle", PictureOrigin.CENTER);
      [particle1, particle2].forEach((particle, num) => {
        particle.setZ(0, 110 + num);
        particle.setZoom(0, 80 - num * 20);
        particle.setTone(0, variances[2 - 2 * num]!);
        particle.setVisible(0, false);
      });
      // Animate particles
      const start = delay + Math.floor(i / 4);
      const maxRadius = 256 + rand(128); // rand(256...384)
      const angle = rand(360);
      const radian = (angle * Math.PI) / 180;
      [particle1, particle2].forEach((particle, num) => {
        particle.setVisible(start, true);
        particle.moveDelta(start, particleLifetime, maxRadius * Math.cos(radian), maxRadius * Math.sin(radian));
        particle.moveZoom(start, particleLifetime, 10);
        particle.moveTone(start + particleLifetime - particleFadeDuration,
          Math.floor(particleFadeDuration / 2), variances[3 - 3 * num]!);
        particle.moveOpacity(start + particleLifetime - particleFadeDuration,
          particleFadeDuration,
          0); // Fade out at end
        particle.setVisible(start + particleLifetime, false);
      });
    }
  }
}

//-------------------------------------------------------------------------------
// Calls the animation for Arceus's transformation while using a Legend Plate.
//-------------------------------------------------------------------------------
const arceusSceneMethods = {
  async pbArceusTransform(this: BattleScene, index: number, type: Id = "NORMAL"): Promise<void> {
    const anims = (this as unknown as { animations: { update(): void; animDone(): boolean; dispose(): void }[] }).animations;
    anims.push(new ArceusTransform(this.sprites, this.viewport, index, type));
    while (this.inPartyAnimation()) await this.pbUpdate();
  },
};
Object.assign(BattleScene.prototype, arceusSceneMethods);

BattleScene.extraPreloads.push(() => preloadBitmaps(ArceusTransform.GRAPHICS));
