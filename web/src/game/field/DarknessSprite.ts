// DarknessSprite (012_Overworld/001_Overworld visuals/002_Overworld_Overlays.rb:46-86)
// and the :show_darkness handler (012_Overworld/001_Overworld.rb:296-313): the
// circle of light on dark maps, which Flash widens.

import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color } from "../../rgss/types";
import { EventHandlers } from "../eventHandlers";
import { G } from "../globals";
import { mapMetadata } from "../metadata";

export class DarknessSprite extends Sprite {
  private darkness: Bitmap;
  private radius_: number;

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.darkness = new Bitmap(Graphics.width, Graphics.height);
    this.radius_ = this.radiusMin();
    this.setBitmap(this.darkness);
    this.z = 99998;
    this.refresh();
  }

  override dispose(): void {
    if (!this.isDisposed()) this.darkness.dispose();
    super.dispose();
  }

  radiusMin(): number { return 64; } // Before using Flash
  radiusMax(): number { return 176; } // After using Flash

  get radius(): number { return this.radius_; }
  set radius(value: number) {
    this.radius_ = value;
    this.refresh();
  }

  refresh(): void {
    this.darkness.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0, 255));
    const cx = Graphics.width / 2;
    const cy = Graphics.height / 2;
    // The radius grows by fractions of a pixel per 60 Hz frame while Flash
    // spreads; Ruby only ever has whole numbers here.
    let cradius = Math.floor(this.radius_);
    const numfades = 5;
    for (let i = 1; i <= numfades; i++) {
      for (let j = cx - cradius; j <= cx + cradius; j++) {
        const diff2 = cradius * cradius - (j - cx) * (j - cx);
        const diff = Math.sqrt(diff2);
        // Bitmap#fill_rect truncates its float arguments
        this.darkness.fillRect(j, Math.trunc(cy - diff), 1, Math.trunc(diff * 2), new Color(0, 0, 0, (255.0 * (numfades - i)) / numfades));
      }
      cradius = Math.floor(cradius * 0.9);
    }
  }
}

/** $game_temp.darkness_sprite */
const temp = () => G.gameTemp as unknown as { darknessSprite: DarknessSprite | null };

// Display darkness circle on dark maps.
EventHandlers.add("on_map_or_spriteset_change", "show_darkness", (scene) => {
  const s = scene as { spriteset?(): { addUserSprite(sprite: DarknessSprite): void } | undefined } | null;
  const spriteset = s?.spriteset?.();
  if (!s || !spriteset) return;
  if (mapMetadata(G.gameMap!.mapId)?.darkMap) {
    temp().darknessSprite = new DarknessSprite();
    spriteset.addUserSprite(temp().darknessSprite!);
    if (G.pokemonGlobal.flashUsed) temp().darknessSprite!.radius = temp().darknessSprite!.radiusMax();
  } else {
    G.pokemonGlobal.flashUsed = false;
    temp().darknessSprite?.dispose();
    temp().darknessSprite = null;
  }
});
