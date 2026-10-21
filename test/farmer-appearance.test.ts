import { describe, expect, it } from "vitest";
import {
  changeBrightness,
  DEFAULT_APPEARANCE,
  farmerLayers,
  multiplyColor,
  pantsInfo,
  recolorBase,
  shirtInfo,
  stringToColor,
  type Pixels,
  type RGBA,
} from "../src/world/farmer-appearance.ts";
import { Facing } from "../src/world/movement.ts";

function image(width: number, height: number, fill: RGBA = [0, 0, 0, 0]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4);
  return { width, height, data };
}
const set = (p: Pixels, i: number, c: RGBA) => p.data.set(c, i * 4);
const get = (p: { data: Uint8ClampedArray | Uint8Array }, i: number) => Array.from(p.data.slice(i * 4, i * 4 + 4));

const PAL: Record<number, RGBA> = {
  256: [1, 0, 0, 255], 257: [2, 0, 0, 255], 258: [3, 0, 0, 255],
  260: [4, 0, 0, 255], 261: [5, 0, 0, 255], 262: [6, 0, 0, 255],
  268: [7, 0, 0, 255], 269: [8, 0, 0, 255], 270: [9, 0, 0, 255], 271: [10, 0, 0, 255],
  276: [11, 0, 0, 255], 277: [12, 0, 0, 255],
};

function baseTexture() {
  const base = image(288, 64);
  for (const [i, c] of Object.entries(PAL)) set(base, +i, c);
  for (const [i, c] of Object.entries(PAL)) set(base, 288 * 40 + +i - 200, c);
  return base;
}

describe("colores", () => {
  it("changeBrightness oscurece R, G y B·8/7", () => {
    expect(changeBrightness([122, 68, 52, 255], -75)).toEqual([47, 0, 0, 255]);
    expect(changeBrightness([100, 100, 100, 255], -7)).toEqual([93, 93, 92, 255]);
  });

  it("multiplyColor trunca como MonoGame", () => {
    expect(multiplyColor([200, 100, 50, 255], [128, 255, 0, 255])).toEqual([100, 100, 0, 255]);
  });

  it("parsea colores de datos", () => {
    expect(stringToColor("255 235 203")).toEqual([255, 235, 203, 255]);
    expect(stringToColor(null)).toBeNull();
  });
});

describe("recolorBase", () => {
  const skinColors = image(3, 24);
  [0, 1, 2].forEach((k) => set(skinColors, 3 * 2 + k, [200 + k, 150, 100, 255]));
  const shoeColors = image(4, 19);
  [0, 1, 2, 3].forEach((k) => set(shoeColors, 4 * 2 + k, [50 + k, 40, 30, 255]));
  const shirts = image(256, 64);
  const W = 256, s = 1;
  const baseIdx = Math.floor((s * 8) / 128) * 32 * W + ((s * 8) % 128) + W * 4;
  [0, 1, 2].forEach((k) => {
    set(shirts, baseIdx - k * W, [100 + k, 0, 0, 255]);
    set(shirts, baseIdx + 128 - k * W, [255, 128, 0, 255]);
  });

  const a = { ...DEFAULT_APPEARANCE, skin: 2, shoes: "2", eyeColor: [122, 68, 52, 255] as RGBA };

  it("reemplaza todos los píxeles de cada color de referencia", () => {
    const base = baseTexture();
    const out = recolorBase(base, { skinColors, shoeColors, shirts }, a, { spriteIndex: s, hasSleeves: true, color: [255, 255, 255, 255] });
    expect(get({ data: out }, 260)).toEqual([200, 150, 100, 255]);
    expect(get({ data: out }, 288 * 40 + 60)).toEqual([200, 150, 100, 255]);
    expect(get({ data: out }, 271)).toEqual([53, 40, 30, 255]);
    expect(get({ data: out }, 276)).toEqual([122, 68, 52, 255]);
    expect(get({ data: out }, 277)).toEqual([47, 0, 0, 255]);
    expect(get({ data: out }, 256)).toEqual([255, 128, 0, 255]);
  });

  it("tiñe las mangas con el color de la camisa y usa la base si la máscara es transparente", () => {
    const tinted = recolorBase(baseTexture(), { skinColors, shoeColors, shirts }, a, { spriteIndex: s, hasSleeves: true, color: [128, 255, 255, 255] });
    expect(get({ data: tinted }, 257)).toEqual([128, 128, 0, 255]);
    const noDye = image(256, 64);
    [0, 1, 2].forEach((k) => set(noDye, baseIdx - k * W, [100 + k, 0, 0, 255]));
    const plain = recolorBase(baseTexture(), { skinColors, shoeColors, shirts: noDye }, a, { spriteIndex: s, hasSleeves: true, color: [10, 10, 10, 255] });
    expect(get({ data: plain }, 258)).toEqual([102, 0, 0, 255]);
  });

  it("sin mangas usa la piel", () => {
    const out = recolorBase(baseTexture(), { skinColors, shoeColors, shirts }, a, { spriteIndex: s, hasSleeves: false, color: [255, 255, 255, 255] });
    expect(get({ data: out }, 256)).toEqual([200, 150, 100, 255]);
  });
});

describe("capas", () => {
  const clothing = {
    shirts: { "1000": { SpriteIndex: 0, DefaultColor: null, HasSleeves: true } },
    pants: { "0": { SpriteIndex: 0 } },
  };

  it("resuelve la ropa por defecto", () => {
    expect(shirtInfo(DEFAULT_APPEARANCE, clothing)).toEqual({ spriteIndex: 0, hasSleeves: true, color: [255, 255, 255, 255] });
    expect(pantsInfo(DEFAULT_APPEARANCE, clothing)).toEqual({ spriteIndex: 0, color: [46, 85, 183, 255] });
  });

  it("ubica camisa, pelo y brazos según la dirección", () => {
    const shirt = { spriteIndex: 17, color: [255, 0, 0, 255] as RGBA };
    const pants = { spriteIndex: 12, color: [0, 0, 255, 255] as RGBA };
    const down = farmerLayers({ ...DEFAULT_APPEARANCE, hair: 9 }, 0, false, Facing.Down, { x: 1, y: 2 }, shirt, pants);
    expect(down.map((l) => l.order)).toEqual([2, 3, 6, 6.5, 14, 10]);
    expect(down[1]).toMatchObject({ sx: 2 * 192, sy: 688 });
    expect(down[2]).toMatchObject({ sx: (17 * 8) % 128, sy: 32, dx: 5, dy: 16, tint: null });
    expect(down[3]).toMatchObject({ sx: (17 * 8) % 128 + 128, tint: [255, 0, 0, 255] });
    expect(down[5]).toMatchObject({ sx: 16, sy: 96, dx: 1, dy: 3, flip: false });
    const up = farmerLayers(DEFAULT_APPEARANCE, 12, false, Facing.Up, { x: 0, y: 0 }, shirt, pants);
    expect(up[4].order).toBe(8);
    expect(up[2].sy).toBe(32 + 24);
    expect(up[5].sy).toBe(64);
    const left = farmerLayers(DEFAULT_APPEARANCE, 6, true, Facing.Left, { x: 0, y: 0 }, shirt, pants);
    expect(left[5]).toMatchObject({ sy: 32, flip: true });
    expect(left[2]).toMatchObject({ sy: 32 + 16, flip: false });
    expect(left[0].flip).toBe(true);
  });

  it("ajusta la altura del pelo por estilo y sexo", () => {
    const shirt = { spriteIndex: 0, color: [255, 255, 255, 255] as RGBA };
    const pants = { spriteIndex: 0, color: [255, 255, 255, 255] as RGBA };
    const hairDy = (isMale: boolean, hair: number) => farmerLayers({ ...DEFAULT_APPEARANCE, isMale, hair }, 0, false, Facing.Down, { x: 0, y: 0 }, shirt, pants)[5].dy;
    expect(hairDy(true, 3)).toBe(1);
    expect(hairDy(true, 20)).toBe(0);
    expect(hairDy(false, 3)).toBe(2);
    expect(hairDy(false, 20)).toBe(1);
  });
});
