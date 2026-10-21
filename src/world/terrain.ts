import { TILE, type Location } from "./location.ts";
import { SeededRandom } from "./rng.ts";
import type { Rect } from "./movement.ts";

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
}

export type Entity =
  | { kind: "tree"; x: number; y: number; treeId: string; stage: number; flipped: boolean }
  | { kind: "fruitTree"; x: number; y: number; treeId: string; stage: number }
  | { kind: "object"; x: number; y: number; itemId: string }
  | { kind: "clump"; x: number; y: number; index: number; w: number; h: number }
  | { kind: "bush"; x: number; y: number; size: number; flipped: boolean; townBush: boolean; drawShadow: boolean }
  | { kind: "grass"; x: number; y: number; grassType: number };

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

export function spawnFromPaths(loc: Location, season: SeasonName, outdoors: boolean, rng = new SeededRandom(loc.name)): Entity[] {
  const objects = new Map<string, Entity>();
  const features = new Map<string, Entity>();
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
          features.set(k, { kind: "tree", x, y, treeId: normalizeTreeId(WILD_TREE_BY_INDEX[index]), stage: 5, flipped: rng.bool() });
          continue;
        }
        const raw = loc.tileProps("Paths", x, y)?.SpawnTree;
        const parts = typeof raw === "string" ? raw.trim().split(/\s+/) : [];
        if (parts.length < 2) continue;
        const stage = parts[2] !== undefined && Number.isInteger(+parts[2]) && +parts[2] > -1 ? +parts[2] : undefined;
        if (parts[0].toLowerCase() === "wild") features.set(k, { kind: "tree", x, y, treeId: normalizeTreeId(parts[1]), stage: stage ?? 5, flipped: rng.bool() });
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
        if (!features.has(k)) features.set(k, { kind: "tree", x, y, treeId: String(rng.int(1, 4)), stage: rng.int(2, 4), flipped: rng.bool() });
      } else if (index in BUSH_BY_INDEX) {
        if (features.has(k)) continue;
        const size = BUSH_BY_INDEX[index];
        const townBush = loc.name === "Town" && size <= 2 && x % 5 !== 0;
        const drawShadow = !loc.tile("Front", x, y) && size !== 3;
        large.push({ kind: "bush", x, y, size, flipped: rng.bool(), townBush, drawShadow });
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
      return { x: e.x * TILE, y: e.y * TILE, w: TILE, h: TILE };
    case "clump":
      return { x: e.x * TILE, y: e.y * TILE, w: e.w * TILE, h: e.h * TILE };
    case "bush":
      return { x: e.x * TILE, y: e.y * TILE, w: TILE * [1, 2, 3, 1, 2][e.size], h: TILE };
    default:
      return null;
  }
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

export function drawOps(e: Entity, data: TerrainData, season: SeasonName): DrawOp[] {
  const s = SEASON_INDEX[season];
  const px = e.x * TILE, py = e.y * TILE;
  switch (e.kind) {
    case "tree": {
      const info = data.wildTrees[e.treeId];
      const texture = treeTexture(info, season);
      if (!texture) return [];
      const bottom = py + TILE;
      if (e.stage >= 5) {
        const shadow = isLeafy(info, season) ? { texture: CURSORS, ...TREE_SHADOW_LEAFY } : { texture: CURSORS_16, ...TREE_SHADOW_BARE };
        return [
          { ...shadow, x: px - 51, y: py - 16, depth: 1e-6, flip: e.flipped },
          { texture, sx: 32, sy: 96, sw: 16, sh: 32, x: px, y: py - 64, depth: bottom / 10000, flip: e.flipped },
          { texture, sx: 0, sy: 0, sw: 48, sh: 96, x: px - 64, y: py - 320, depth: (bottom + 2) / 10000 - e.x / 1e6, flip: e.flipped },
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
        { texture: obj.Texture?.replace(/\\/g, "/") ?? SPRING_OBJECTS, sx: (i % 24) * 16, sy: Math.floor(i / 24) * 16, sw: 16, sh: 16, x: px, y: py, depth: (py + 32) / 10000, flip: false },
      ];
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
