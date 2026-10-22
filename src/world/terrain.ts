import type { Item } from "./items.ts";
import { TILE, type Location } from "./location.ts";
import { createRandom, DotNetRandom } from "./dotnet-random.ts";
import type { Rect } from "./movement.ts";
import type { CropState } from "./crops.ts";

export const SEASON_INDEX = { spring: 0, summer: 1, fall: 2, winter: 3 } as const;
export type SeasonName = keyof typeof SEASON_INDEX;

export interface WildTreeTexture {
  Season?: number | null;
  Texture: string;
  Condition?: string | null;
}

export interface WildTreeInfo {
  Textures?: WildTreeTexture[] | null;
  IsLeafy?: boolean;
  IsLeafyInWinter?: boolean;
  IsLeafyInFall?: boolean;
}

export interface TerrainData {
  wildTrees: Record<string, WildTreeInfo>;
  objects: Record<string, { SpriteIndex: number; Texture?: string | null }>;
  bushTextureWidth: number;
  furniture?: Record<string, string>;
  furnitureTextureWidth?: number;
  bigCraftables?: Record<string, { SpriteIndex: number; Texture?: string | null }>;
}

export type Entity =
  | { kind: "tree"; x: number; y: number; treeId: string; stage: number; flipped: boolean; health?: number; stump?: boolean }
  | { kind: "fruitTree"; x: number; y: number; treeId: string; stage: number }
  | { kind: "object"; x: number; y: number; itemId: string; placed?: boolean; hp?: number; flipped?: boolean; spawned?: boolean }
  | { kind: "bigCraftable"; x: number; y: number; itemId: string; items?: (Item | null)[]; machine?: { held?: Item | null; minutesLeft?: number; ready?: boolean; showNext?: boolean } }
  | { kind: "clump"; x: number; y: number; index: number; w: number; h: number }
  | { kind: "bush"; x: number; y: number; size: number; flipped: boolean; townBush: boolean; drawShadow: boolean }
  | { kind: "grass"; x: number; y: number; grassType: number }
  | { kind: "bed"; x: number; y: number; itemId: string }
  | { kind: "hoeDirt"; x: number; y: number; watered: boolean; crop?: CropState | null; fertilizer?: string }
  | { kind: "giftbox"; x: number; y: number; items: { id: string; stack: number }[]; index: number }
  | { kind: "building"; type: string; x: number; y: number };

export interface DrawOp {
  texture: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  depth: number;
  flip: boolean;
  fades?: boolean;
  scale?: number;
}

export const TREE_FADE_MIN = 0.4;
const TREE_FADE_IN = 0.05;
const TREE_FADE_OUT = 0.09;

export function treeFadeRect(e: Extract<Entity, { kind: "tree" }>): Rect | null {
  if (e.stage < 5 || e.stump) return null;
  return { x: TILE * (e.x - 1), y: TILE * (e.y - 5), w: 192, h: 288 };
}

export function stepTreeAlpha(alpha: number, playerInside: boolean) {
  const raised = Math.min(1, alpha + TREE_FADE_IN);
  return playerInside ? Math.max(TREE_FADE_MIN, raised - TREE_FADE_OUT) : raised;
}

const WILD_TREE_BY_INDEX: Record<number, string> = { 9: "1", 10: "2", 11: "3", 12: "6", 31: "9", 32: "8" };
const WEEDS: Record<SeasonName, string[]> = {
  spring: ["784", "674", "675"],
  summer: ["785", "676", "677"],
  fall: ["786", "678", "679"],
  winter: ["674"],
};
const BUSH_BY_INDEX: Record<number, number> = { 24: 2, 25: 1, 26: 0, 33: 4 };
const CLUMP_BY_INDEX: Record<number, number> = { 19: 602, 20: 672, 21: 600 };
const STANDARD_SHADOW = "LooseSprites/shadow";
const CURSORS = "LooseSprites/Cursors";
const CURSORS_16 = "LooseSprites/Cursors_1_6";
const SPRING_OBJECTS = "Maps/springobjects";
const BUSHES = "TileSheets/bushes";
const GRASS = "TerrainFeatures/grass";
const FURNITURE = "TileSheets/furniture";
const GRASS_WEEDS = 3;
const TREE_SHADOW_LEAFY = { sx: 663, sy: 1011, sw: 41, sh: 30 };
const TREE_SHADOW_BARE = { sx: 469, sy: 298, sw: 42, sh: 31 };

function pathsIndex(loc: Location, x: number, y: number) {
  const gid = loc.tile("Paths", x, y);
  if (!gid) return -1;
  const ts = loc.map.tilesets.filter((t) => t.firstgid <= gid).sort((a, b) => b.firstgid - a.firstgid)[0];
  if (!ts || !/paths$/i.test(ts.image) && ts.name !== "Paths") return -1;
  return gid - ts.firstgid;
}

function normalizeTreeId(id: string) {
  return id === "4" ? "1" : id === "5" ? "2" : id;
}

export function loadsPathsObjects(loc: Location) {
  const flag = (name: string) => String(loc.props[name] ?? "").toUpperCase().startsWith("T");
  return flag("Outdoors") || loc.name === "BathHouse_Entry" || flag("TreatAsOutdoors") || "forceLoadObjects" in loc.props;
}

export function treesFromMapProperty(loc: Location, onInvalid?: (msg: string) => void): Entity[] {
  const raw = loc.props.Trees;
  if (typeof raw !== "string" || !raw.trim()) return [];
  const parts = raw.trim().split(/\s+/);
  const out: Entity[] = [];
  for (let i = 0; i + 3 <= parts.length; i += 3) {
    const [x, y, type] = parts.slice(i, i + 3).map(Number);
    if (![x, y, type].every(Number.isInteger)) {
      onInvalid?.(parts.slice(i, i + 3).join(" "));
      continue;
    }
    out.push({ kind: "tree", x, y, treeId: String(type + 1), stage: 5, flipped: false });
  }
  return out;
}

export function generateLocationObjects(loc: Location, season: SeasonName, rng: DotNetRandom): Entity[] {
  const trees = treesFromMapProperty(loc, (g) => console.warn(`Trees inválido en ${loc.name}: '${g}'`));
  if (!loadsPathsObjects(loc)) return trees;
  const outdoors = String(loc.props.Outdoors ?? "").toUpperCase().startsWith("T");
  return spawnFromPaths(loc, season, outdoors, rng, trees);
}

export function spawnFromPaths(loc: Location, season: SeasonName, outdoors: boolean, rng: DotNetRandom, existing: Entity[] = []): Entity[] {
  const objects = new Map<string, Entity>();
  const features = new Map<string, Entity>(existing.map((e) => [`${e.x},${e.y}`, e]));
  const large: Entity[] = [];
  const clumps: Extract<Entity, { kind: "clump" }>[] = [];
  const key = (x: number, y: number) => `${x},${y}`;
  for (let x = 0; x < loc.width; x++) {
    for (let y = 0; y < loc.height; y++) {
      const index = pathsIndex(loc, x, y);
      if (index < 0) continue;
      const k = key(x, y);
      if (index in WILD_TREE_BY_INDEX || index === 34) {
        if (features.has(k) || objects.has(k)) continue;
        if (index !== 34) {
          features.set(k, { kind: "tree", x, y, treeId: normalizeTreeId(WILD_TREE_BY_INDEX[index]), stage: 5, flipped: rng.nextBool() });
          continue;
        }
        const raw = loc.tileProps("Paths", x, y)?.SpawnTree;
        const parts = typeof raw === "string" ? raw.trim().split(/\s+/) : [];
        if (parts.length < 2) continue;
        const stage = parts[2] !== undefined && Number.isInteger(+parts[2]) && +parts[2] > -1 ? +parts[2] : undefined;
        if (parts[0].toLowerCase() === "wild") features.set(k, { kind: "tree", x, y, treeId: normalizeTreeId(parts[1]), stage: stage ?? 5, flipped: rng.nextBool() });
        else if (parts[0].toLowerCase() === "fruit") features.set(k, { kind: "fruitTree", x, y, treeId: parts[1], stage: stage ?? 4 });
        continue;
      }
      if (index >= 13 && index <= 15) {
        if (!objects.has(k) && !(outdoors && season === "winter")) objects.set(k, { kind: "object", x, y, itemId: rng.choose(...WEEDS[season]) });
      } else if (index === 16 || index === 17) {
        if (!objects.has(k)) objects.set(k, { kind: "object", x, y, itemId: rng.choose("343", "450") });
      } else if (index === 18) {
        if (!objects.has(k)) objects.set(k, { kind: "object", x, y, itemId: rng.choose("294", "295") });
      } else if (index in CLUMP_BY_INDEX) {
        const clump = { kind: "clump" as const, x, y, index: CLUMP_BY_INDEX[index], w: 2, h: 2 };
        for (let dx = 0; dx < clump.w; dx++) for (let dy = 0; dy < clump.h; dy++) features.delete(key(x + dx, y + dy));
        clumps.push(clump);
      } else if (index === 22 || index === 36) {
        if (features.has(k)) continue;
        const overlaps = clumps.some((c) => x * TILE + 1 < (c.x + c.w) * TILE && c.x * TILE < x * TILE + 63 && y * TILE + 1 < (c.y + c.h) * TILE && c.y * TILE < y * TILE + 63);
        if (!overlaps) features.set(k, { kind: "grass", x, y, grassType: index === 36 ? 7 : 1 });
      } else if (index === 23) {
        if (!features.has(k)) features.set(k, { kind: "tree", x, y, treeId: String(rng.next(1, 4)), stage: rng.next(2, 4), flipped: rng.nextBool() });
      } else if (index in BUSH_BY_INDEX) {
        if (features.has(k)) continue;
        const size = BUSH_BY_INDEX[index];
        const townBush = loc.name === "Town" && size <= 2 && x % 5 !== 0;
        const drawShadow = !loc.tile("Front", x, y) && size !== 3;
        large.push({ kind: "bush", x, y, size, flipped: rng.nextBool(), townBush, drawShadow });
      }
    }
  }
  return [...features.values(), ...objects.values(), ...large, ...clumps];
}

export function bushEffectiveSize(size: number) {
  return size === 3 ? 0 : size === 4 ? 1 : size;
}

export function solidRect(e: Entity): Rect | null {
  switch (e.kind) {
    case "tree":
      return e.stage === 0 ? null : { x: e.x * TILE, y: e.y * TILE, w: TILE, h: TILE };
    case "fruitTree":
      return e.stage === 0 ? null : { x: e.x * TILE, y: e.y * TILE, w: TILE, h: TILE };
    case "object":
    case "bigCraftable":
      return { x: e.x * TILE, y: e.y * TILE, w: TILE, h: TILE };
    case "clump":
      return { x: e.x * TILE, y: e.y * TILE, w: e.w * TILE, h: e.h * TILE };
    case "bush":
      return { x: e.x * TILE, y: e.y * TILE, w: TILE * [1, 2, 3, 1, 2][e.size], h: TILE };
    case "giftbox":
      return { x: e.x * TILE, y: e.y * TILE, w: TILE, h: TILE };
    default:
      return null;
  }
}

export function furnitureSize(data: string | undefined) {
  const f = (data ?? "").split("/");
  const pair = (v: string | undefined, w: number, h: number) => {
    const [a, b] = (v ?? "").trim().split(/\s+/).map(Number);
    return Number.isInteger(a) && Number.isInteger(b) ? { w: a, h: b } : { w, h };
  };
  return { type: f[1] ?? "", source: pair(f[2], 1, 2), box: pair(f[3], 1, 1) };
}

export function bedBox(e: Extract<Entity, { kind: "bed" }>, data?: TerrainData): Rect {
  const { box } = furnitureSize(data?.furniture?.[e.itemId] ?? "Bed/bed/2 4/2 3");
  return { x: e.x * TILE, y: e.y * TILE, w: box.w * TILE, h: box.h * TILE };
}

export function solidRects(e: Entity, data?: TerrainData): Rect[] {
  if (e.kind === "bed") {
    const b = bedBox(e, data);
    return [
      { x: b.x, y: b.y, w: b.w, h: TILE },
      { x: b.x, y: b.y + 2 * TILE, w: b.w, h: b.h - 2 * TILE },
    ].filter((r) => r.h > 0);
  }
  const r = solidRect(e);
  return r ? [r] : [];
}

export function bedSpot(e: Extract<Entity, { kind: "bed" }>) {
  return { x: e.x + 1, y: e.y + 1 };
}

export function bedTileOffset(previous: number, bed: Rect, farmer: Rect, farmerX: number) {
  const touching = bed.x < farmer.x + farmer.w && farmer.x < bed.x + bed.w && bed.y < farmer.y + farmer.h && farmer.y < bed.y + bed.h;
  if (touching) return previous;
  return farmerX > bed.x + Math.trunc(bed.w / 2) ? 0 : 1;
}

export function bedSleepTile(e: Extract<Entity, { kind: "bed" }>, offset: number) {
  return { x: e.x + offset, y: e.y + 1 };
}

export function wakeUpPosition(e: Extract<Entity, { kind: "bed" }>, tileFree: (x: number, y: number) => boolean) {
  const spot = bedSpot(e);
  let x = spot.x * TILE, facing: "left" | "right" = "left";
  if (tileFree(e.x - 1, e.y + 1)) {
    x -= TILE;
    facing = "right";
  }
  return { x, y: spot.y * TILE + 32, facing };
}

export function treeTexture(info: WildTreeInfo | undefined, season: SeasonName) {
  const textures = info?.Textures ?? [];
  const idx = SEASON_INDEX[season];
  const match = textures.find((t) => !t.Condition && t.Season === idx) ?? textures.find((t) => !t.Condition && (t.Season === null || t.Season === undefined));
  return match?.Texture.replace(/\\/g, "/");
}

export function isLeafy(info: WildTreeInfo | undefined, season: SeasonName) {
  if (!info?.IsLeafy) return false;
  if (!info.IsLeafyInWinter && season === "winter") return false;
  if (!info.IsLeafyInFall && season === "fall") return false;
  return true;
}

function standardShadow(cx: number, cy: number, depth: number): DrawOp {
  return { texture: STANDARD_SHADOW, sx: 0, sy: 0, sw: 12, sh: 7, x: cx - 24, y: cy - 12, depth, flip: false };
}

export interface GrassContext {
  uniqueId: number;
  daysPlayed: number;
  outdoors: boolean;
  hasFrontTile: (x: number, y: number) => boolean;
}

export function grassSourceOffset(grassType: number, season: SeasonName, outdoors: boolean) {
  const s = SEASON_INDEX[season];
  switch (grassType) {
    case 1:
      return s === 3 ? (outdoors ? 80 : 0) : s * 20;
    case 2:
      return 60;
    case 3:
      return 80;
    case 4:
      return 100;
    case 7:
      return s === 3 ? (outdoors ? 220 : 160) : 160 + s * 20;
    default:
      return (grassType + 1) * 20;
  }
}

export function grassBlades(x: number, y: number, ctx: GrassContext) {
  const r = createRandom(ctx.uniqueId, ctx.daysPlayed / 28, x * 7, y * 11, 0);
  const front = ctx.hasFrontTile(x, y);
  return Array.from({ length: 4 }, () => {
    const whichWeed = r.next(3);
    const offset1 = r.next(-2, 3);
    const offset2 = r.next(-2, 3) + (front ? -7 : 0);
    const offset3 = r.next(-2, 3);
    const offset4 = r.next(-2, 3) + (front ? -7 : 0);
    const flip = r.nextBool();
    r.nextDouble();
    return { whichWeed, offset1, offset2, offset3, offset4, flip };
  });
}

export function drawOps(e: Entity, data: TerrainData, season: SeasonName, grass?: GrassContext): DrawOp[] {
  const s = SEASON_INDEX[season];
  const px = e.x * TILE, py = e.y * TILE;
  switch (e.kind) {
    case "tree": {
      const info = data.wildTrees[e.treeId];
      const texture = treeTexture(info, season);
      if (!texture) return [];
      const bottom = py + TILE;
      if (e.stage >= 5 && e.stump) {
        return [{ texture, sx: 32, sy: 96, sw: 16, sh: 32, x: px, y: py - 64, depth: bottom / 10000, flip: e.flipped }];
      }
      if (e.stage >= 5) {
        const shadow = isLeafy(info, season) ? { texture: CURSORS, ...TREE_SHADOW_LEAFY } : { texture: CURSORS_16, ...TREE_SHADOW_BARE };
        return [
          { ...shadow, x: px - 51, y: py - 16, depth: 1e-6, flip: e.flipped },
          { texture, sx: 32, sy: 96, sw: 16, sh: 32, x: px, y: py - 64, depth: bottom / 10000, flip: e.flipped, fades: true },
          { texture, sx: 0, sy: 0, sw: 48, sh: 96, x: px - 64, y: py - 320, depth: (bottom + 2) / 10000 - e.x / 1e6, flip: e.flipped, fades: true },
        ];
      }
      const rect = e.stage === 0 ? [32, 128, 16, 16] : e.stage === 1 ? [0, 128, 16, 16] : e.stage === 2 ? [16, 128, 16, 16] : [0, 96, 16, 32];
      return [{ texture, sx: rect[0], sy: rect[1], sw: rect[2], sh: rect[3], x: px, y: py + TILE - rect[3] * 4, depth: e.stage === 0 ? 1e-4 : bottom / 10000, flip: e.flipped }];
    }
    case "object": {
      const obj = data.objects[e.itemId];
      if (!obj) return [];
      const i = obj.SpriteIndex;
      return [
        standardShadow(px + 32, py + 55, (py + TILE) / 15000),
        { texture: obj.Texture?.replace(/\\/g, "/") ?? SPRING_OBJECTS, sx: (i % 24) * 16, sy: Math.floor(i / 24) * 16, sw: 16, sh: 16, x: px, y: py, depth: (py + 32) / 10000, flip: !!e.flipped },
      ];
    }
    case "bigCraftable": {
      const bc = data.bigCraftables?.[e.itemId];
      if (!bc) return [];
      const i = bc.SpriteIndex + (e.machine?.showNext ? 1 : 0);
      return [{ texture: bc.Texture?.replace(/\\/g, "/") ?? "TileSheets/Craftables", sx: (i % 8) * 16, sy: Math.floor(i / 8) * 32, sw: 16, sh: 32, x: px, y: py - TILE, depth: Math.max(0, (py + TILE - 24) / 10000) + e.x / 100000, flip: false }];
    }
    case "clump":
      return [
        { texture: SPRING_OBJECTS, sx: (e.index % 24) * 16, sy: Math.floor(e.index / 24) * 16, sw: e.w * 16, sh: e.h * 16, x: px, y: py, depth: (py + TILE) / 10000 + e.x / 100000, flip: false },
      ];
    case "bush": {
      const eff = bushEffectiveSize(e.size);
      const src = bushSourceRect(e, s, data.bushTextureWidth);
      if (!src) return [];
      const ops: DrawOp[] = [];
      if (e.drawShadow) {
        if (eff > 0) ops.push({ texture: CURSORS, ...TREE_SHADOW_LEAFY, x: (e.x + (eff === 1 ? 0.5 : 1)) * TILE - 51, y: py - 16, depth: 1e-6, flip: e.flipped });
        else ops.push(standardShadow(px + 32, py + TILE - 4, 1e-6));
      }
      const yOff = eff > 0 && !(e.townBush && eff === 1) && e.size !== 4 ? 64 : 0;
      const boxCenterY = py + TILE / 2;
      ops.push({ texture: BUSHES, ...src, x: px, y: py + TILE - yOff - 128, depth: (boxCenterY + 48) / 10000 - e.x / 1e6, flip: e.flipped });
      return ops;
    }
    case "grass": {
      if (!grass) return [];
      const blades = grassBlades(e.x, e.y, grass);
      const sy = grassSourceOffset(e.grassType, season, grass.outdoors);
      return blades.slice(0, GRASS_WEEDS).map((b, i) => {
        const gx = px + (i % 2) * 32 + b.offset3 * 4 - 4 + 30;
        const gy = py + Math.trunc(i / 2) * 32 + b.offset4 * 4 + 40;
        return { texture: GRASS, sx: b.whichWeed * 15, sy, sw: 15, sh: 20, x: gx - 30, y: gy - 70, depth: (gy + 16 - 20) / 10000 + gx / 1e7, flip: b.flip };
      });
    }
    case "giftbox":
      return [
        { texture: "LooseSprites/shadow", sx: 0, sy: 0, sw: 12, sh: 7, x: px + 16 - 6 * 5, y: py + 53 - 3 * 5, depth: 1e-7, flip: false, scale: 5 },
        { texture: "LooseSprites/Giftbox", sx: 0, sy: e.index * 32, sw: 16, sh: 32, x: px, y: py - 52, depth: (py + TILE) / 10000, flip: false },
      ];
    case "bed": {
      const { source, box } = furnitureSize(data.furniture?.[e.itemId] ?? "Bed/bed/2 4/2 3");
      const width = data.furnitureTextureWidth ?? 512;
      const index = Number(e.itemId);
      const sx = (index * 16) % width, sy = Math.floor((index * 16) / width) * 16;
      const sw = source.w * 16, sh = source.h * 16;
      const top = py, bottom = py + box.h * TILE;
      const y = py - (sh * 4 - box.h * TILE);
      return [
        { texture: FURNITURE, sx, sy, sw, sh, x: px, y, depth: (top + 1) / 10000, flip: false },
        { texture: FURNITURE, sx: sx + sw, sy, sw, sh, x: px, y, depth: (bottom - 1) / 10000, flip: false },
      ];
    }
    default:
      return [];
  }
}

export function bushSourceRect(e: Extract<Entity, { kind: "bush" }>, season: number, textureWidth: number) {
  const offset = 0;
  switch (e.size) {
    case 0:
    case 3:
      return { sx: season * 32 + offset * 16, sy: 224, sw: 16, sh: 32 };
    case 1: {
      if (e.townBush) return { sx: season * 32, sy: 96, sw: 32, sh: 32 };
      const i = season * 64 + offset * 32;
      return { sx: i % textureWidth, sy: Math.floor(i / textureWidth) * 48, sw: 32, sh: 48 };
    }
    case 2:
      if (e.townBush && season <= 1) return { sx: 48, sy: 176, sw: 48, sh: 48 };
      return [
        { sx: 0, sy: 128, sw: 48, sh: 48 },
        { sx: 0, sy: 128, sw: 48, sh: 48 },
        { sx: 48, sy: 128, sw: 48, sh: 48 },
        { sx: 0, sy: 176, sw: 48, sh: 48 },
      ][season];
    case 4:
      return { sx: offset * 32, sy: 320, sw: 32, sh: 32 };
    default:
      return null;
  }
}
