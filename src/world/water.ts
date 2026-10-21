import { TILE, type Location } from "./location.ts";
import type { SeasonName } from "./terrain.ts";

export const WATER_TEXTURE = "LooseSprites/Cursors";
const WATER_SOURCE_Y = 2064;
const FRAME_MS = 200;
const FRAMES = 10;

const SEASON_COLORS: Record<SeasonName, [number, number, number]> = {
  spring: [120, 200, 255],
  summer: [60, 240, 255],
  fall: [255, 130, 200],
  winter: [130, 80, 255],
};

export interface WaterColor {
  rgb: [number, number, number];
  alpha: number;
}

export function waterColor(locationName: string, season: SeasonName, dayOfMonth = 1): WaterColor {
  if (locationName === "Beach" && season === "summer" && dayOfMonth >= 12 && dayOfMonth <= 14) return { rgb: [0, 255, 0], alpha: 0.4 };
  return { rgb: SEASON_COLORS[season], alpha: 0.5 };
}

export interface WaterGrid {
  width: number;
  height: number;
  water: Uint8Array;
  visible: Uint8Array;
}

export function hasWaterLayer(loc: Location) {
  if (loc.name === "Desert") return false;
  const outdoors = String(loc.props.Outdoors ?? "").toUpperCase().startsWith("T");
  return outdoors || "indoorWater" in loc.props || loc.name === "Sewer" || loc.name === "Submarine";
}

export function buildWaterGrid(loc: Location): WaterGrid | null {
  if (!hasWaterLayer(loc)) return null;
  const water = new Uint8Array(loc.width * loc.height);
  const visible = new Uint8Array(loc.width * loc.height);
  let any = false;
  for (let x = 0; x < loc.width; x++) {
    for (let y = 0; y < loc.height; y++) {
      const v = loc.tileProps("Back", x, y)?.Water;
      if (v === undefined) continue;
      any = true;
      water[y * loc.width + x] = 1;
      visible[y * loc.width + x] = v === "I" ? 0 : 1;
    }
  }
  return any ? { width: loc.width, height: loc.height, water, visible } : null;
}

export class WaterState {
  index = 0;
  timer = 0;
  position = 0;
  flip = false;

  constructor(private readonly isFarm: boolean) {}

  tick(ms: number, totalGameTimeMs: number) {
    this.timer -= ms;
    if (this.timer <= 0) {
      this.index = (this.index + 1) % FRAMES;
      this.timer = FRAME_MS;
    }
    this.position += this.isFarm ? 0.1 : (Math.sin((Math.floor(totalGameTimeMs) % 1000) / 1000) + 1) * 0.15;
    if (this.position >= 64) {
      this.position -= 64;
      this.flip = !this.flip;
    }
  }
}

export interface WaterPiece {
  x: number;
  y: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const isWater = (g: WaterGrid, x: number, y: number) => x >= 0 && y >= 0 && x < g.width && y < g.height && g.water[y * g.width + x] === 1;

export function waterPieces(g: WaterGrid, state: WaterState, tx: number, ty: number): WaterPiece[] {
  if (!isWater(g, tx, ty) || !g.visible[ty * g.width + tx]) return [];
  const p = Math.trunc(state.position);
  const row = (n: number) => ((n % 2 !== 0) !== state.flip ? 128 : 0);
  const top = ty === 0 || !isWater(g, tx, ty - 1);
  const bottom = ty === g.height - 1 || !isWater(g, tx, ty + 1);
  const sx = state.index * 64;
  const pieces: WaterPiece[] = [
    { x: tx * TILE, y: ty * TILE - (top ? 0 : p), sx, sy: WATER_SOURCE_Y + row(tx + ty) + (top ? p : 0), sw: 64, sh: 64 - (top ? p : 0) },
  ];
  if (bottom) {
    const sh = 64 - Math.trunc(64 - state.position) - 1;
    if (sh > 0) pieces.push({ x: tx * TILE, y: (ty + 1) * TILE - p, sx, sy: WATER_SOURCE_Y + row(tx + ty + 1), sw: 64, sh });
  }
  return pieces;
}
