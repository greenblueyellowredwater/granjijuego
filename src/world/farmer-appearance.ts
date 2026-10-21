import { Facing } from "./movement.ts";
import { sourceRect } from "./farmer-animation.ts";

export type RGBA = [number, number, number, number];

export interface Appearance {
  isMale: boolean;
  skin: number;
  hair: number;
  hairColor: RGBA;
  eyeColor: RGBA;
  shirt: string;
  pants: string;
  pantsColor: RGBA;
  shoes: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  isMale: true,
  skin: 0,
  hair: 0,
  hairColor: [193, 90, 50, 255],
  eyeColor: [122, 68, 52, 255],
  shirt: "1000",
  pants: "0",
  pantsColor: [46, 85, 183, 255],
  shoes: "2",
};

export interface ClothingData {
  shirts: Record<string, { SpriteIndex: number; Texture?: string | null; DefaultColor?: string | null; HasSleeves?: boolean; CanBeDyed?: boolean }>;
  pants: Record<string, { SpriteIndex: number; Texture?: string | null }>;
}

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export const PALETTE = { sleeves: [256, 257, 258], skin: [260, 261, 262], shoes: [268, 269, 270, 271], eyes: [276, 277] };

export function stringToColor(s: string | null | undefined): RGBA | null {
  if (!s) return null;
  const parts = s.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 255];
}

export function shirtInfo(a: Appearance, clothing: ClothingData) {
  const data = a.shirt !== "-1" ? clothing.shirts[a.shirt] : undefined;
  return {
    spriteIndex: data?.SpriteIndex ?? (a.isMale ? 41 : 209),
    hasSleeves: data?.HasSleeves ?? true,
    color: stringToColor(data?.DefaultColor) ?? ([255, 255, 255, 255] as RGBA),
  };
}

export function pantsInfo(a: Appearance, clothing: ClothingData) {
  const data = a.pants !== "-1" ? clothing.pants[a.pants] : undefined;
  return { spriteIndex: data?.SpriteIndex ?? 14, color: a.pants !== "-1" ? a.pantsColor : ([255, 255, 255, 255] as RGBA) };
}

const clampByte = (v: number) => Math.max(0, Math.min(255, v));

export function changeBrightness(c: RGBA, amount: number): RGBA {
  const b = amount > 0 ? Math.trunc((amount * 5) / 3) : Math.trunc((amount * 8) / 7);
  return [clampByte(c[0] + amount), clampByte(c[1] + amount), clampByte(c[2] + b), c[3]];
}

export function multiplyColor(c: RGBA, t: RGBA): RGBA {
  const ch = (a: number, b: number) => clampByte(Math.trunc((a / 255) * (b / 255) * 255));
  return [ch(c[0], t[0]), ch(c[1], t[1]), ch(c[2], t[2]), ch(c[3], t[3])];
}

const pixelAt = (p: Pixels, i: number): RGBA => [p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2], p.data[i * 4 + 3]];

function paletteIndices(base: Pixels, index: number) {
  const ref = pixelAt(base, index);
  const out: number[] = [];
  const n = base.width * base.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (base.data[o] === ref[0] && base.data[o + 1] === ref[1] && base.data[o + 2] === ref[2] && base.data[o + 3] === ref[3]) out.push(i);
  }
  return out;
}

export function recolorBase(
  base: Pixels,
  sources: { skinColors: Pixels; shoeColors: Pixels; shirts: Pixels },
  a: Appearance,
  shirt: { spriteIndex: number; hasSleeves: boolean; color: RGBA },
): Uint8ClampedArray<ArrayBuffer> {
  const indices = new Map<number, number[]>();
  for (const i of [...PALETTE.sleeves, ...PALETTE.skin, ...PALETTE.shoes, ...PALETTE.eyes]) indices.set(i, paletteIndices(base, i));
  const out = new Uint8ClampedArray(base.data);
  const swap = (index: number, c: RGBA) => {
    for (const i of indices.get(index)!) out.set(c, i * 4);
  };

  let eyeDark = changeBrightness(a.eyeColor, -75);
  if (eyeDark.every((v, i) => v === a.eyeColor[i])) eyeDark = [eyeDark[0], eyeDark[1], clampByte(eyeDark[2] + 10), eyeDark[3]];
  swap(276, a.eyeColor);
  swap(277, eyeDark);

  const sc = sources.skinColors;
  let skinRow = a.skin;
  if (skinRow < 0) skinRow = sc.height - 1;
  if (skinRow > sc.height - 1) skinRow = 0;
  const skinIdx = (skinRow * 3) % (sc.height * 3);
  const skin: RGBA[] = [0, 1, 2].map((k) => pixelAt(sc, skinIdx + k));
  PALETTE.skin.forEach((idx, k) => swap(idx, skin[k]));

  const sh = sources.shoeColors;
  let shoeRow = Number.isInteger(+a.shoes) && a.shoes.trim() !== "" ? +a.shoes : 12;
  if (shoeRow >= sh.height) shoeRow = sh.height - 1;
  if (sh.width >= 4) {
    const shoeIdx = (shoeRow * 4) % (sh.height * 4);
    PALETTE.shoes.forEach((idx, k) => swap(idx, pixelAt(sh, shoeIdx + k)));
  }

  const shirts = sources.shirts;
  const W = shirts.width;
  const s = shirt.spriteIndex;
  const baseIdx = Math.floor((s * 8) / 128) * 32 * W + ((s * 8) % 128) + W * 4;
  const dyeIdx = baseIdx + 128;
  if (shirt.hasSleeves && baseIdx < W * shirts.height) {
    let tint: RGBA = [shirt.color[0], shirt.color[1], shirt.color[2], 255];
    PALETTE.sleeves.forEach((idx, k) => {
      let c = pixelAt(shirts, dyeIdx - k * W);
      if (c[3] < 255) {
        c = pixelAt(shirts, baseIdx - k * W);
        tint = [255, 255, 255, 255];
      }
      swap(idx, multiplyColor(c, tint));
    });
  } else PALETTE.sleeves.forEach((idx, k) => swap(idx, skin[k]));
  return out;
}

export interface FarmerLayer {
  texture: "base" | "pants" | "shirts" | "hair";
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  tint: RGBA | null;
  flip: boolean;
  order: number;
}

const SHIRT_OFFSET: Record<Facing, number> = { [Facing.Down]: 0, [Facing.Right]: 8, [Facing.Left]: 16, [Facing.Up]: 24 };
const HAIR_OFFSET: Record<Facing, number> = { [Facing.Down]: 0, [Facing.Right]: 32, [Facing.Left]: 32, [Facing.Up]: 64 };

export function farmerLayers(
  a: Appearance,
  frame: number,
  frameFlip: boolean,
  facing: Facing,
  feature: { x: number; y: number },
  shirt: { spriteIndex: number; color: RGBA },
  pants: { spriteIndex: number; color: RGBA },
  hairTextureWidth = 128,
): FarmerLayer[] {
  const r = sourceRect(frame);
  const p = pants.spriteIndex;
  const s = shirt.spriteIndex;
  const shirtX = (s * 8) % 128, shirtY = Math.floor((s * 8) / 128) * 32 + SHIRT_OFFSET[facing];
  const hx = (a.hair * 16) % hairTextureWidth, hy = Math.floor((a.hair * 16) / hairTextureWidth) * 96 + HAIR_OFFSET[facing];
  const adj = a.isMale && a.hair >= 16 ? -1 : !a.isMale && a.hair < 16 ? 1 : 0;
  return [
    { texture: "base", sx: r.x, sy: r.y, sw: 16, sh: 32, dx: 0, dy: 0, tint: null, flip: frameFlip, order: 2 },
    { texture: "pants", sx: r.x + (p % 10) * 192 + (a.isMale ? 0 : 96), sy: r.y + Math.floor(p / 10) * 688, sw: 16, sh: 32, dx: 0, dy: 0, tint: pants.color, flip: frameFlip, order: 3 },
    { texture: "shirts", sx: shirtX, sy: shirtY, sw: 8, sh: 8, dx: 4 + feature.x, dy: 14 + feature.y, tint: null, flip: false, order: 6 },
    { texture: "shirts", sx: shirtX + 128, sy: shirtY, sw: 8, sh: 8, dx: 4 + feature.x, dy: 14 + feature.y, tint: shirt.color, flip: false, order: 6.5 },
    { texture: "base", sx: r.x + 96, sy: r.y, sw: 16, sh: 32, dx: 0, dy: 0, tint: null, flip: frameFlip, order: facing === Facing.Up ? 8 : 14 },
    { texture: "hair", sx: hx, sy: hy, sw: 16, sh: 32, dx: feature.x, dy: feature.y + 1 + adj, tint: a.hairColor, flip: facing === Facing.Left, order: 10 },
  ];
}
