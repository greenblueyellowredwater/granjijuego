import type { DrawOp } from "./terrain.ts";
import type { Rect } from "./movement.ts";

export interface BuildingDrawLayer {
  Id?: string;
  Texture?: string | null;
  SourceRect: { x: number; y: number; width: number; height: number };
  DrawPosition: { x: number; y: number };
  DrawInBackground?: boolean;
  SortTileOffset?: number;
}

export interface BuildingData {
  Texture: string;
  Size: { x: number; y: number };
  SourceRect?: { x: number; y: number; width: number; height: number } | null;
  CollisionMap?: string | null;
  DrawShadow?: boolean;
  DrawOffset?: { x: number; y: number } | null;
  SortTileOffset?: number;
  DrawLayers?: BuildingDrawLayer[] | null;
  HumanDoor?: { x: number; y: number } | null;
  IndoorMap?: string | null;
}

export interface BuildingEntity {
  kind: "building";
  type: string;
  x: number;
  y: number;
}

const TILE = 64;
const SHADOW = { left: [656, 394], middle: [672, 394], right: [688, 394] } as const;
const norm = (t: string) => t.replace(/\\/g, "/");

export function defaultFarmBuildings(props: Record<string, unknown>): BuildingEntity[] {
  const point = (key: string, fallback: [number, number]) => {
    const raw = String(props[key] ?? "").trim().split(/\s+/).map(Number);
    return raw.length === 2 && raw.every(Number.isInteger) ? (raw as [number, number]) : fallback;
  };
  const entry = point("FarmHouseEntry", [64, 15]);
  const greenhouse = point("GreenhouseLocation", [25, 10]);
  const bin = point("ShippingBinLocation", [71, 14]);
  const bowl = point("PetBowlLocation", [53, 7]);
  return [
    { kind: "building", type: "Farmhouse", x: entry[0] - 5, y: entry[1] - 3 },
    { kind: "building", type: "Greenhouse", x: greenhouse[0], y: greenhouse[1] },
    { kind: "building", type: "Shipping Bin", x: bin[0], y: bin[1] },
    { kind: "building", type: "Pet Bowl", x: bowl[0], y: bowl[1] },
  ];
}

export function buildingSourceRect(b: BuildingEntity, data: BuildingData, textureSize: { width: number; height: number }, opts: { houseLevel?: number; greenhouseUnlocked?: boolean } = {}) {
  const sr = data.SourceRect;
  if (!sr || (sr.x === 0 && sr.y === 0 && sr.width === 0 && sr.height === 0)) return { x: 0, y: 0, w: textureSize.width, h: textureSize.height };
  let { x, y } = sr;
  if (b.type === "Farmhouse") y += sr.height * Math.min(opts.houseLevel ?? 0, 2);
  if (b.type === "Greenhouse" && !opts.greenhouseUnlocked) y -= sr.height;
  return { x, y, w: sr.width, h: sr.height };
}

export function buildingDrawOps(b: BuildingEntity, data: BuildingData, textureSize: { width: number; height: number }, opts: { houseLevel?: number; greenhouseUnlocked?: boolean } = {}): DrawOp[] {
  const ops: DrawOp[] = [];
  const w = data.Size.x, h = data.Size.y;
  const bottom = (b.y + h) * TILE;
  if (data.DrawShadow ?? true) {
    const sy = bottom;
    ops.push({ texture: "LooseSprites/Cursors", sx: SHADOW.left[0], sy: SHADOW.left[1], sw: 16, sh: 16, x: b.x * TILE, y: sy, depth: 1e-5, flip: false });
    for (let i = 1; i < w - 1; i++) ops.push({ texture: "LooseSprites/Cursors", sx: SHADOW.middle[0], sy: SHADOW.middle[1], sw: 16, sh: 16, x: (b.x + i) * TILE, y: sy, depth: 1e-5, flip: false });
    ops.push({ texture: "LooseSprites/Cursors", sx: SHADOW.right[0], sy: SHADOW.right[1], sw: 16, sh: 16, x: (b.x + w - 1) * TILE, y: sy, depth: 1e-5, flip: false });
  }
  const src = buildingSourceRect(b, data, textureSize, opts);
  const off = data.DrawOffset ?? { x: 0, y: 0 };
  const baseX = b.x * TILE, baseY = bottom;
  const layer = (bottom - (data.SortTileOffset ?? 0) * TILE) / 10000;
  const top = { x: baseX + off.x * 4, y: baseY + off.y * 4 - src.h * 4 };
  ops.push({ texture: norm(data.Texture), sx: src.x, sy: src.y, sw: src.w, sh: src.h, x: top.x, y: top.y, depth: layer, flip: false });
  for (const l of data.DrawLayers ?? []) {
    const lx = baseX + l.DrawPosition.x * 4, ly = baseY - src.h * 4 + l.DrawPosition.y * 4;
    const depth = l.DrawInBackground ? 0 : (bottom - (l.SortTileOffset ?? 0) * TILE + 1) / 10000;
    ops.push({ texture: norm(l.Texture ?? data.Texture), sx: l.SourceRect.x, sy: l.SourceRect.y, sw: l.SourceRect.width, sh: l.SourceRect.height, x: lx, y: ly, depth, flip: false });
  }
  if (b.type === "Shipping Bin") {
    ops.push({ texture: "LooseSprites/Cursors", sx: 134, sy: 226, sw: 30, sh: 25, x: b.x * TILE + 4, y: (b.y - 1) * TILE - 28, depth: ((b.y + 1) * TILE) / 10000 + 0.0001, flip: false });
  }
  return ops;
}

export function sellPrice(basePrice: number, quality = 0) {
  const p = Math.trunc(Math.fround(basePrice * Math.fround(1 + quality * 0.25)));
  return p > 0 ? Math.max(1, p) : 0;
}

export function nearShippingBin(b: BuildingEntity, tileX: number, tileY: number) {
  return Math.hypot(tileX - (b.x + 0.5), tileY - b.y) <= 2;
}

export function collisionRows(data: BuildingData) {
  if (!data.CollisionMap) return null;
  return data.CollisionMap.split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
}

export function buildingSolids(b: BuildingEntity, data: BuildingData): Rect[] {
  const rows = collisionRows(data);
  const out: Rect[] = [];
  for (let ty = 0; ty < data.Size.y; ty++) {
    for (let tx = 0; tx < data.Size.x; tx++) {
      const blocked = rows ? (rows[ty]?.[tx] ?? "O") === "X" : true;
      if (blocked) out.push({ x: (b.x + tx) * TILE, y: (b.y + ty) * TILE, w: TILE, h: TILE });
    }
  }
  return out;
}

export function buildingDoor(b: BuildingEntity, data: BuildingData) {
  const d = data.HumanDoor;
  if (!d || d.x < 0 || d.y < 0) return null;
  return { x: b.x + d.x, y: b.y + d.y };
}
