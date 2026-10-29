// pbHiddenMoveAnimation (012_Overworld/004_Overworld_FieldMoves.rb:70-185):
// the Pokémon sliding across a banner with streaming strobes. Following
// Pokemon EX (Script Additions/Animations.rb:5-37) aliases it; its version is
// the exported pbHiddenMoveAnimation.
//
// The Ruby counts frames at Graphics.frame_rate (interpolator lengths,
// strobe speed), so with FRAME_RATE frames it lasts as long as at 40 fps.

import { rand } from "../../core/random";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Sprite, Viewport } from "../../rgss/display";
import { Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { preloadBitmaps, RPGCache } from "../../ui/rpgCache";
import { PointInterpolator, RectInterpolator } from "../../ui/scenes/Interpolators";
import { PictureOrigin, PokemonSprite, preloadPokemonSprite } from "../../ui/sprites/pokemonSprite";
import { BitmapSprite } from "../../ui/SpriteWrapper";
import { FRAME_RATE } from "../GameCharacter";
import type { GamePlayer } from "../GamePlayer";
import { G, pbUpdateSceneMap } from "../globals";
import { pbSEPlay } from "../GameSystem";
import { FollowingPkmn } from "../following/FollowingPkmn";
import { pbTurnTowardEvent } from "../following/moveRoute";
import type { Pokemon } from "../pokemon/Pokemon";
import { pbMoveRoute, PBMoveRoute } from "../scripts/moveRoute";
import { pbWait } from "../../ui/scenes/frames";

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;

/** The core pbHiddenMoveAnimation(pokemon). */
async function hiddenMoveAnimationCore(pokemon: Pokemon | null): Promise<boolean> {
  if (!pokemon) return false;
  await Promise.all([preloadBitmaps(["Graphics/Pictures/hiddenMovebg", "Graphics/Pictures/hiddenMoveStrobes"]), preloadPokemonSprite(pokemon)]);
  const viewport = new Viewport(0, 0, 0, 0);
  viewport.z = 99999;
  const bg = new Sprite(viewport);
  bg.setBitmap(RPGCache.loadBitmap("Graphics/Pictures/", "hiddenMovebg"));
  const bgHeight = bg.bitmap?.height ?? 0;
  const sprite = new PokemonSprite(viewport);
  sprite.setOffset(PictureOrigin.CENTER);
  sprite.setPokemonBitmap(pokemon);
  sprite.z = 1;
  sprite.visible = false;
  const spriteWidth = () => sprite.bitmap?.width ?? 0;
  const strobebitmap = new AnimatedBitmap("Graphics/Pictures/hiddenMoveStrobes");
  const strobes: BitmapSprite[] = [];
  for (let i = 0; i < 15; i++) {
    const strobe = new BitmapSprite(26 * 2, 8 * 2, viewport);
    strobe.bitmap!.blt(0, 0, strobebitmap.bitmap, new Rect(0, (i % 2) * 8 * 2, 26 * 2, 8 * 2));
    strobe.z = i % 2 === 0 ? 2 : 0;
    strobe.visible = false;
    strobes.push(strobe);
  }
  strobebitmap.dispose();
  let interp = new RectInterpolator(
    new Rect(0, Graphics.height / 2, Graphics.width, 0),
    new Rect(0, Math.floor((Graphics.height - bgHeight) / 2), Graphics.width, bgHeight),
    Math.floor(FRAME_RATE / 4),
  );
  let ptinterp: PointInterpolator | null = null;
  let phase = 1;
  let frames = 0;
  const strobeSpeed = (64 * 20) / FRAME_RATE;
  for (;;) {
    await Graphics.update();
    Input.update();
    sprite.update();
    switch (phase) {
      case 1: // Expand viewport height from zero to full
        interp.update();
        interp.set(viewport.rect);
        bg.oy = Math.floor((bgHeight - viewport.rect.height) / 2);
        if (interp.done()) {
          phase = 2;
          ptinterp = new PointInterpolator(
            Graphics.width + Math.floor(spriteWidth() / 2), Math.floor(bgHeight / 2),
            Graphics.width / 2, Math.floor(bgHeight / 2),
            Math.floor((FRAME_RATE * 4) / 10),
          );
        }
        break;
      case 2: // Slide Pokémon sprite in from right to centre
        ptinterp!.update();
        sprite.x = ptinterp!.x;
        sprite.y = ptinterp!.y;
        sprite.visible = true;
        if (ptinterp!.done()) {
          phase = 3;
          pokemon.playCry();
          frames = 0;
        }
        break;
      case 3: // Wait
        frames += 1;
        if (frames > Math.floor((FRAME_RATE * 3) / 4)) {
          phase = 4;
          ptinterp = new PointInterpolator(
            Graphics.width / 2, Math.floor(bgHeight / 2),
            -Math.floor(spriteWidth() / 2), Math.floor(bgHeight / 2),
            Math.floor((FRAME_RATE * 4) / 10),
          );
          frames = 0;
        }
        break;
      case 4: // Slide Pokémon sprite off from centre to left
        ptinterp!.update();
        sprite.x = ptinterp!.x;
        sprite.y = ptinterp!.y;
        if (ptinterp!.done()) {
          phase = 5;
          sprite.visible = false;
          interp = new RectInterpolator(
            new Rect(0, Math.floor((Graphics.height - bgHeight) / 2), Graphics.width, bgHeight),
            new Rect(0, Graphics.height / 2, Graphics.width, 0),
            Math.floor(FRAME_RATE / 4),
          );
        }
        break;
      case 5: // Shrink viewport height from full to zero
        interp.update();
        interp.set(viewport.rect);
        bg.oy = Math.floor((bgHeight - viewport.rect.height) / 2);
        if (interp.done()) phase = 6;
        break;
    }
    // Constantly stream the strobes across the screen
    for (const strobe of strobes) {
      strobe.ox = viewport.rect.x;
      strobe.oy = viewport.rect.y;
      if (!strobe.visible) { // Initial placement of strobes
        const randomY = 16 * (1 + rand(Math.floor(bgHeight / 16) - 2));
        strobe.y = randomY + Math.floor((Graphics.height - bgHeight) / 2);
        strobe.x = rand(Graphics.width);
        strobe.visible = true;
      } else if (strobe.x < Graphics.width) { // Move strobe right
        strobe.x += strobeSpeed;
      } else { // Strobe is off the screen, reposition it to the left of the screen
        const randomY = 16 * (1 + rand(Math.floor(bgHeight / 16) - 2));
        strobe.y = randomY + Math.floor((Graphics.height - bgHeight) / 2);
        strobe.x = -(strobe.bitmap?.width ?? 0) - rand(Graphics.width / 4);
      }
    }
    await pbUpdateSceneMap();
    if (phase === 6) break;
  }
  sprite.dispose();
  for (const strobe of strobes) strobe.dispose();
  strobes.length = 0;
  bg.dispose();
  viewport.dispose();
  return true;
}

/**
 * pbHiddenMoveAnimation(pokemon, field_move = false), Following Pokemon EX's
 * version: the follower waits while the banner plays, then (for a field move
 * of the follower itself) steps aside and jumps.
 *
 * NOTE (Ruby parity): nothing in the game passes field_move = true, so
 * `no_field_move` is always true and the follower part after the banner
 * (Animations.rb:11-36) never runs; it's ported anyway so turning it on is
 * one argument.
 */
export async function pbHiddenMoveAnimation(pokemon: Pokemon | null, fieldMove = false): Promise<boolean> {
  const t = G.gameTemp as unknown as { noFollowerFieldMove?: boolean };
  const noFieldMove = !fieldMove || !!t.noFollowerFieldMove;
  if (pokemon && FollowingPkmn.active()) FollowingPkmn.moveRoute([PBMoveRoute.Wait, 60]);
  const ret = await hiddenMoveAnimationCore(pokemon);
  if (!ret || noFieldMove || !FollowingPkmn.active() || pokemon !== FollowingPkmn.getPokemon()) return ret;
  const p = gamePlayer();
  const event = FollowingPkmn.getEvent()!;
  const initialDir = p.direction;
  pbTurnTowardEvent(event, p);
  await pbWait(Math.floor(40 / 5));
  let movedDir = 0;
  const possibleDir: number[] = [];
  possibleDir.push(p.direction);
  possibleDir.push(10 - p.direction);
  for (const d of [2, 8, 4, 6]) if (!possibleDir.includes(d)) possibleDir.push(d);
  for (const d of possibleDir) {
    if (!p.passable(p.x, p.y, 10 - d)) continue;
    movedDir = 10 - d;
    break;
  }
  if (movedDir > 0) {
    event.moveTowardPlayer();
    pbMoveRoute(p, [movedDir / 2], true);
    await pbWait(Math.floor(40 / 4));
    pbTurnTowardEvent(p, event);
    await pbWait(Math.floor(40 / 4));
    FollowingPkmn.moveRoute([15 + initialDir / 2]);
    await pbWait(Math.floor(40 / 5));
  }
  pbSEPlay("Player jump");
  FollowingPkmn.moveRoute([PBMoveRoute.Jump, 0, 0]);
  await pbWait(Math.floor(40 / 5));
  return ret;
}
