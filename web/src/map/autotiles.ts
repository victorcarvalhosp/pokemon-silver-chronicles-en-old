// Port of Data/Scripts/006_Map renderer/003_AutotileExpander.rb and the
// autotile pattern table from 004_TileDrawingHelper.rb.

export const SOURCE_TILE = 32;
export const TILESET_TILES_PER_ROW = 8;
export const TILES_PER_AUTOTILE = 48;
export const AUTOTILES_COUNT = 8; // counting the blank tile as an autotile
export const TILESET_START_ID = AUTOTILES_COUNT * TILES_PER_AUTOTILE;
/** In 1/20ths of a second; a "[x]" suffix on the filename overrides it. */
export const AUTOTILE_FRAME_DURATION = 5;

// Each entry lists the four 16x16 quarters (1-based, in a 6-wide grid of the
// 96x128 autotile graphic) that make up one of the 48 tile layouts.
export const AUTOTILE_PATTERNS: readonly (readonly (readonly number[])[])[] = [
  [[27, 28, 33, 34], [5, 28, 33, 34], [27, 6, 33, 34], [5, 6, 33, 34],
   [27, 28, 33, 12], [5, 28, 33, 12], [27, 6, 33, 12], [5, 6, 33, 12]],
  [[27, 28, 11, 34], [5, 28, 11, 34], [27, 6, 11, 34], [5, 6, 11, 34],
   [27, 28, 11, 12], [5, 28, 11, 12], [27, 6, 11, 12], [5, 6, 11, 12]],
  [[25, 26, 31, 32], [25, 6, 31, 32], [25, 26, 31, 12], [25, 6, 31, 12],
   [15, 16, 21, 22], [15, 16, 21, 12], [15, 16, 11, 22], [15, 16, 11, 12]],
  [[29, 30, 35, 36], [29, 30, 11, 36], [5, 30, 35, 36], [5, 30, 11, 36],
   [39, 40, 45, 46], [5, 40, 45, 46], [39, 6, 45, 46], [5, 6, 45, 46]],
  [[25, 30, 31, 36], [15, 16, 45, 46], [13, 14, 19, 20], [13, 14, 19, 12],
   [17, 18, 23, 24], [17, 18, 11, 24], [41, 42, 47, 48], [5, 42, 47, 48]],
  [[37, 38, 43, 44], [37, 6, 43, 44], [13, 18, 19, 24], [13, 14, 43, 44],
   [37, 42, 43, 48], [17, 18, 47, 48], [13, 18, 43, 48], [1, 2, 7, 8]],
];

/** Seconds per animation frame for an autotile file. */
export function autotileFrameDuration(filename: string): number {
  const m = /\[\s*(\d+?)\s*\]\s*$/.exec(filename);
  return (m ? Number(m[1]) : AUTOTILE_FRAME_DURATION) / 20;
}

/**
 * Expands an RMXP autotile graphic (96x128 per animation frame) into a strip
 * with one 32x32 tile per layout: width = frames*32, height = 48*32. Single
 * tile autotiles (32px tall) are returned unchanged.
 */
export function expandAutotile(bitmap: ImageBitmap): ImageBitmap | OffscreenCanvas {
  const T = SOURCE_TILE;
  if (bitmap.height === T) return bitmap;
  const expandedFormat = bitmap.height === T * 6;
  const frames = Math.max(Math.floor(bitmap.width / (3 * T)), 1);
  const canvas = new OffscreenCanvas(frames * T, TILES_PER_AUTOTILE * T);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const half = T / 2;
  for (let id = 0; id < TILES_PER_AUTOTILE; id++) {
    const pattern = AUTOTILE_PATTERNS[id >> 3]![id % TILESET_TILES_PER_ROW]!;
    for (let frame = 0; frame < frames; frame++) {
      const destX = frame * T;
      if (expandedFormat && [1, 2, 4, 8].includes(id)) {
        // The 6-row format stores the inner corners as whole tiles.
        const sx = frame * T * 3 + (id === 2 || id === 4 ? T : 0);
        const sy = id === 1 || id === 2 ? T * 4 : T * 5;
        ctx.drawImage(bitmap, sx, sy, T, T, destX, id * T, T, T);
        continue;
      }
      pattern.forEach((chunk, i) => {
        const c = chunk - 1;
        const sx = (c % 6) * half + T * 3 * frame;
        const sy = Math.floor(c / 6) * half;
        ctx.drawImage(bitmap, sx, sy, half, half, destX + (i % 2) * half, id * T + Math.floor(i / 2) * half, half, half);
      });
    }
  }
  return canvas;
}
