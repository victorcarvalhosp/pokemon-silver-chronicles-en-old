// Port of FollowerSprites (004_Game classes/012_Game_FollowerFactory.rb) with
// Following Pokemon EX's aliases (New Event Type/Event Sprite.rb): refresh
// erases the follower's original event and refreshes the Following Pokémon,
// update pulses it with its status colour, and set_animation plays emotes.
// Spriteset_Global creates it (sprites/spritesets.ts).

import type { Viewport } from "../../rgss/display";
import { SpriteCharacter } from "../../sprites/SpriteCharacter";
import { FRAME_RATE } from "../GameCharacter";
import { G } from "../globals";
import type { PokemonMapFactory } from "../MapFactory";
import { FollowingPkmnConfig, statusTone } from "./config";
import { FollowingPkmn } from "./FollowingPkmn";
import type { FollowerData } from "./GameFollowerFactory";

/** $game_temp.status_pulse: [value, min, max, step per frame] */
let statusPulse: number[] | null = null;
function gameTempStatusPulse(): number[] {
  statusPulse ??= [50.0, 50.0, 150.0, 100 / (FRAME_RATE * 2.0)];
  return statusPulse;
}

export class FollowerSprites {
  private sprites: SpriteCharacter[] = [];
  private lastUpdate: number | null = null;
  private disposed = false;

  constructor(private viewport: Viewport) {}

  dispose(): void {
    if (this.disposed) return;
    for (const sprite of this.sprites) sprite.dispose();
    this.sprites = [];
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  refresh(): void {
    for (const sprite of this.sprites) sprite.dispose();
    this.sprites = [];
    for (const [event] of G.gameTemp.followers?.eachFollower() ?? []) {
      this.sprites.push(new SpriteCharacter(this.viewport, event, () => null));
    }
    // Following Pokemon EX
    if (!FollowingPkmn.canCheck()) return;
    const event = FollowingPkmn.getEvent();
    for (const spr of this.sprites) {
      if (!FollowingPkmn.getData()?.followingPkmn()) continue;
      spr.setReflection(this.viewport, event);
    }
    const data = FollowingPkmn.getData();
    for (const map of (G.mapFactory as unknown as PokemonMapFactory).maps) {
      if (data && data.originalMapId === data.currentMapId) map?.events?.get(data.eventId)?.erase();
    }
    void FollowingPkmn.refresh(false);
  }

  update(): void {
    const lastUpdate = G.gameTemp.followers?.lastUpdate ?? -1;
    if (lastUpdate !== this.lastUpdate) {
      this.refresh();
      this.lastUpdate = lastUpdate;
    }
    for (const sprite of this.sprites) sprite.update();
    // Following Pokemon EX: status condition pulsing
    if (!FollowingPkmn.active()) return;
    const followers = G.pokemonGlobal.followers as FollowerData[];
    this.sprites.forEach((sprite, i) => {
      if (!followers[i] || !followers[i]!.followingPkmn()) return;
      const firstPkmn = FollowingPkmn.getPokemon();
      if (!firstPkmn) return;
      if (firstPkmn.status === "NONE" || !FollowingPkmnConfig.APPLY_STATUS_TONES) {
        sprite.sprite.color.set(0, 0, 0, 0);
        statusPulse = [50.0, 50.0, 150.0, 100 / (FRAME_RATE * 2.0)];
        return;
      }
      const tone = statusTone(String(firstPkmn.status));
      if (!tone || !tone.every((s) => s > 0)) return;
      const pulse = gameTempStatusPulse();
      pulse[0] = pulse[0]! + pulse[3]!;
      if (pulse[0] < pulse[1]! || pulse[0] > pulse[2]!) pulse[3] = -pulse[3]!;
      sprite.sprite.color.set(tone[0]!, tone[1]!, tone[2]!, pulse[0]!);
    });
  }

  /** Add emote animation to Following Pokemon. */
  setAnimation(animId: number): void {
    for (const spr of this.sprites) {
      if (spr.character !== (FollowingPkmn.getEvent() as unknown)) continue;
      spr.character.animationId = animId;
    }
  }
}
