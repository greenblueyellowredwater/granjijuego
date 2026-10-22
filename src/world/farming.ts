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
  fertilizer?: string;
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
  const f = tile.fertilizer ? fertilizerSourceRect(tile.fertilizer) : null;
  if (f) ops.push({ texture: "LooseSprites/Cursors", ...f, x: px, y: py, depth: 1.9e-8, flip: false });
  return ops;
}

const FERTILIZER_INDEX: Record<string, number> = { "368": 0, "369": 1, "919": 2, "370": 3, "371": 4, "920": 5, "465": 6, "466": 7, "918": 8 };
const bareId = (id: string) => id.replace(/^\(O\)/, "");

export function fertilizerSourceRect(id: string) {
  const i = FERTILIZER_INDEX[bareId(id)] ?? 0;
  return { sx: 173 + Math.trunc(i / 3) * 16, sy: 462 + (i % 3) * 16, sw: 16, sh: 16 };
}

export const fertilizerQualityLevel = (id: string | undefined) => (id ? ({ "368": 1, "369": 2, "919": 3 } as Record<string, number>)[bareId(id)] ?? 0 : 0);
export const fertilizerSpeedBoost = (id: string | undefined) => (id ? ({ "465": 0.1, "466": 0.25, "918": 0.33 } as Record<string, number>)[bareId(id)] ?? 0 : 0);
export const fertilizerWaterRetention = (id: string | undefined) => (id ? ({ "370": 0.33, "371": 0.66, "920": 1 } as Record<string, number>)[bareId(id)] ?? 0 : 0);

export function canApplyFertilizer(dirt: { fertilizer?: string; crop?: { phase: number } | null }, id: string) {
  if (dirt.fertilizer) return false;
  return !(dirt.crop && dirt.crop.phase !== 0 && (bareId(id) === "368" || bareId(id) === "369"));
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
  vy?: number;
  ay?: number;
  alpha?: number;
  alphaFade?: number;
}

export function animationSprite(row: number, x: number, y: number, frames: number, flipped: boolean, interval: number): TempSprite {
  return { texture: "TileSheets/animations", row, x, y, frames, interval, flipped, depth: (y + 32) / 10000, elapsed: 0 };
}

export function tempSpriteFrame(s: TempSprite) {
  const i = Math.floor(s.elapsed / s.interval);
  if (s.elapsed < 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  return i >= s.frames || (s.alpha ?? 1) <= 0 ? null : { sx: i * 64, sy: s.row * 64, sw: 64, sh: 64 };
}
