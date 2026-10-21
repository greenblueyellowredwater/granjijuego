import type { Location } from "./location.ts";
import type { SeasonName } from "./terrain.ts";

export const DRAW_GUIDE: Record<number, number> = {
  0: 0,
  8: 15,
  2: 13,
  1: 12,
  4: 4,
  9: 11,
  3: 9,
  5: 8,
  6: 1,
  12: 3,
  10: 14,
  7: 5,
  15: 6,
  13: 7,
  11: 10,
  14: 2,
};

const NEIGHBORS: [dx: number, dy: number, bit: number][] = [
  [0, -1, 1],
  [1, 0, 2],
  [0, 1, 4],
  [-1, 0, 8],
];

export interface DirtTile {
  x: number;
  y: number;
  watered: boolean;
}

export function neighborMasks(tile: DirtTile, at: (x: number, y: number) => DirtTile | undefined) {
  let all = 0, watered = 0;
  for (const [dx, dy, bit] of NEIGHBORS) {
    const n = at(tile.x + dx, tile.y + dy);
    if (!n) continue;
    all |= bit;
    if (tile.watered && n.watered) watered |= bit;
  }
  return { sourceRectPosition: DRAW_GUIDE[all], wateredRectPosition: DRAW_GUIDE[watered] };
}

export function hoeDirtTexture(locationName: string, season: SeasonName) {
  if (locationName === "Mountain" || locationName === "Mine") return "TerrainFeatures/hoeDirtDark";
  if (season === "winter") return "TerrainFeatures/hoeDirtSnow";
  return "TerrainFeatures/hoeDirt";
}

export function hoeDirtDrawOps(tile: DirtTile, masks: ReturnType<typeof neighborMasks>, texture: string) {
  const px = tile.x * 64, py = tile.y * 64;
  const s = masks.sourceRectPosition, w = masks.wateredRectPosition;
  const ops = [{ texture, sx: (s % 4) * 16, sy: Math.floor(s / 4) * 16, sw: 16, sh: 16, x: px, y: py, depth: 1e-8, flip: false }];
  if (tile.watered) ops.push({ texture, sx: (w % 4) * 16 + 64, sy: Math.floor(w / 4) * 16, sw: 16, sh: 16, x: px, y: py, depth: 1.2e-8, flip: false });
  return ops;
}

export function canTill(location: Location, x: number, y: number, occupied: (x: number, y: number) => boolean) {
  const back = location.tileProps("Back", x, y);
  if (!back || !("Diggable" in back)) return false;
  if (occupied(x, y)) return false;
  return !location.blocksFarmer(x, y);
}

export interface TempSprite {
  texture: string;
  row: number;
  x: number;
  y: number;
  frames: number;
  interval: number;
  flipped: boolean;
  depth: number;
  elapsed: number;
}

export function animationSprite(row: number, x: number, y: number, frames: number, flipped: boolean, interval: number): TempSprite {
  return { texture: "TileSheets/animations", row, x, y, frames, interval, flipped, depth: (y + 32) / 10000, elapsed: 0 };
}

export function tempSpriteFrame(s: TempSprite) {
  const i = Math.floor(s.elapsed / s.interval);
  return i >= s.frames ? null : { sx: i * 64, sy: s.row * 64, sw: 64, sh: 64 };
}
