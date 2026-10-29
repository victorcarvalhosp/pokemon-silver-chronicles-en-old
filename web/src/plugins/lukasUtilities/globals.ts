// Luka's Scripting Utilities: the mathematical globals (script.rb:1390-1415).
// pbBitmap / pbSelBitmap are in bitmaps.ts, PokemonSprite#id? in sprites.ts
// (pokemonSpriteId); isConst? / hasConst? / getConst (script.rb:1416-1434)
// are the ones game/utilities.ts already has (index.ts re-exports them).

import { rand } from "../../core/random";
import { Graphics } from "../../rgss/Graphics";
import { rdiv, toI } from "./rubyHelpers";

/**
 * getPolygonPoints(n, rx, ry, a, tx, ty): the n corners of a regular polygon
 * of radii rx/ry around (tx, ty), starting at angle a (degrees).
 * NOTE (Ruby parity, script.rb:1397): the step is 360 / n in integer
 * division, so n not dividing 360 doesn't close evenly (n = 7 steps 51°).
 */
export function getPolygonPoints(n: number, rx = 50, ry = 50, a = 0, tx = rdiv(Graphics.width, 2), ty = rdiv(Graphics.height, 2)): [number, number][] {
  const points: [number, number][] = [];
  const ang = rdiv(360, n);
  for (let k = 0; k < n; k++) {
    const b = a * (Math.PI / 180);
    const r = rx * Math.abs(Math.cos(b)) + ry * Math.abs(Math.sin(b));
    const x = tx + r * Math.cos(b);
    const y = ty - r * Math.sin(b);
    points.push([x, y]);
    a += ang;
  }
  return points;
}

/** randCircleCord(r, x = nil): [x, y] on the circle of radius r inside a 2r square (x random unless given). */
export function randCircleCord(r: number, x: number | null = null): [number, number] {
  if (x === null) x = rand(r * 2);
  const y1 = -Math.sqrt(r ** 2 - (x - r) ** 2);
  const y2 = Math.sqrt(r ** 2 - (x - r) ** 2);
  return [x, (rand(2) === 0 ? toI(y1) : toI(y2)) + r];
}
