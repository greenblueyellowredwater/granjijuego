import { describe, expect, it } from "vitest";
import { dayTileGlows, LightContext, lightmapSize, lightQuad, lightTriples, locationLights, stepLightFade, tileChanges } from "../src/world/lights.ts";
import { SpriteFont } from "../src/render/spritefont.ts";
import { dateText, moneyDigits } from "../src/render/hud-layout.ts";
import { bedSleepTile, bedTileOffset, drawOps, solidRects, wakeUpPosition } from "../src/world/terrain.ts";

describe("fuentes de luz", () => {
  it("parsea tripletas y cuaternas ignorando basura", () => {
    expect(lightTriples("3 4 1 x 2 4 5 6 2")).toEqual([
      { x: 3, y: 4, texture: 1 },
      { x: 5, y: 6, texture: 2 },
    ]);
    expect(tileChanges("Front 3 4 257 Back 1 2 x")).toEqual([{ layer: "Front", x: 3, y: 4, index: 257 }]);
  });

  it("ubica los brillos de ventana según el índice del tile", () => {
    const glows = dayTileGlows(tileChanges("Front 2 3 405 Front 5 1 257 Front 1 1 999"));
    expect(glows).toEqual([
      { x: 160, y: 224 },
      { x: 224, y: 224 },
      { x: 352, y: 60 },
    ]);
  });

  it("agrega ventanas y brillos solo antes de la hora de apagar y sin lluvia", () => {
    const props = { Light: "1 2 4", WindowLight: "3 3 2" };
    const day = locationLights("Town", props, [{ x: 10, y: 20 }], { turnOff: false, raining: false });
    expect(day.map((l) => [l.texture, l.x, l.y, l.context])).toEqual([
      [4, 96, 160, LightContext.MapLight],
      [2, 224, 224, LightContext.WindowLight],
      [6, 10, 20, LightContext.WindowLight],
    ]);
    expect(day[0].color).toEqual([0, 0, 0, 255]);
    expect(locationLights("Town", props, [], { turnOff: true, raining: false })).toHaveLength(1);
    expect(locationLights("Town", props, [], { turnOff: false, raining: true })).toHaveLength(1);
  });

  it("desvanece las luces de ventana de a 4 de alfa por frame", () => {
    const [l] = locationLights("X", { WindowLight: "0 0 2" }, [], { turnOff: false, raining: false });
    expect(stepLightFade(l, { turnOff: true, raining: false })).toBe(true);
    expect(l.fadeOut).toBe(4);
    stepLightFade(l, { turnOff: true, raining: false });
    expect(l.color[3]).toBe(251);
    for (let i = 0; i < 70; i++) stepLightFade(l, { turnOff: true, raining: false });
    expect(stepLightFade(l, { turnOff: true, raining: false })).toBe(false);
  });

  it("dibuja la luz a un cuarto de resolución centrada", () => {
    expect(lightmapSize(1280, 720)).toEqual({ width: 336, height: 196 });
    const [l] = locationLights("X", { Light: "10 10 1" }, [], { turnOff: false, raining: false });
    expect(lightQuad(l, { width: 128, height: 128 }, 400, 300)).toEqual({ x: (672 - 400) / 4 - 16, y: (672 - 300) / 4 - 16, w: 32, h: 32, alpha: 1 });
  });
});

const font = new SpriteFont({
  glyphs: [
    { x: 0, y: 0, width: 4, height: 6 },
    { x: 10, y: 0, width: 5, height: 6 },
    { x: 20, y: 0, width: 0, height: 0 },
  ],
  cropping: [
    { x: 0, y: 2, width: 4, height: 8 },
    { x: 1, y: 1, width: 5, height: 12 },
    { x: 0, y: 0, width: 0, height: 8 },
  ],
  characterMap: ["a", "b", " "],
  verticalLineSpacing: 10,
  horizontalSpacing: -1,
  kerning: [
    { x: 1, y: 4, z: 2 },
    { x: -2, y: 5, z: 1 },
    { x: 0, y: 3, z: 0 },
  ],
  defaultCharacter: "a",
});

describe("SpriteFont", () => {
  it("dispone glifos como MonoGame", () => {
    expect(font.layout("ab\nb?")).toEqual([
      { sx: 0, sy: 0, sw: 4, sh: 6, x: 1, y: 2 },
      { sx: 10, sy: 0, sw: 5, sh: 6, x: 1 + 4 + 2 - 1 - 2 + 1, y: 1 },
      { sx: 10, sy: 0, sw: 5, sh: 6, x: 1, y: 11 },
      { sx: 0, sy: 0, sw: 4, sh: 6, x: 0 + 5 + 1 - 1 + 1 + 0, y: 12 },
    ]);
  });

  it("mide el ancho máximo y el alto de la última línea", () => {
    expect(font.measure("ab")).toEqual({ width: 1 + 4 + 2 - 1 - 2 + 5 + 1, height: 12 });
    expect(font.measure("a\na")).toEqual({ width: 7, height: 20 });
    expect(font.measure("")).toEqual({ width: 0, height: 0 });
  });
});

describe("HUD", () => {
  it("arma la fecha corta", () => {
    expect(dateText(1, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])).toBe("Mon. 1");
    expect(dateText(28, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])).toBe("Sun. 28");
  });

  it("omite ceros a la izquierda del dinero pero dibuja siempre el último dígito", () => {
    expect(moneyDigits(500)).toEqual([
      { index: 5, digit: 5 },
      { index: 6, digit: 0 },
      { index: 7, digit: 0 },
    ]);
    expect(moneyDigits(0)).toEqual([{ index: 7, digit: 0 }]);
    expect(moneyDigits(10203)).toEqual([
      { index: 3, digit: 1 },
      { index: 4, digit: 0 },
      { index: 5, digit: 2 },
      { index: 6, digit: 0 },
      { index: 7, digit: 3 },
    ]);
  });
});

describe("cama", () => {
  const bed = { kind: "bed" as const, x: 9, y: 8, itemId: "2048" };
  const data = { wildTrees: {}, objects: {}, bushTextureWidth: 128, furniture: { "2048": "Bed/bed/2 4/2 3/1/5000/-1/x" }, furnitureTextureWidth: 512 };

  it("colisiona en la fila superior y desde la tercera, no en la del medio", () => {
    expect(solidRects(bed, data)).toEqual([
      { x: 576, y: 512, w: 128, h: 64 },
      { x: 576, y: 640, w: 128, h: 64 },
    ]);
  });

  it("dibuja respaldo y frente con profundidades del borde superior e inferior", () => {
    const ops = drawOps(bed, data, "spring");
    expect(ops).toEqual([
      { texture: "TileSheets/furniture", sx: 0, sy: 1024, sw: 32, sh: 64, x: 576, y: 448, depth: 513 / 10000, flip: false },
      { texture: "TileSheets/furniture", sx: 32, sy: 1024, sw: 32, sh: 64, x: 576, y: 448, depth: 703 / 10000, flip: false },
    ]);
  });

  it("elige la columna de sueño según el lado desde el que llega el granjero", () => {
    const box = { x: 576, y: 512, w: 128, h: 192 };
    expect(bedTileOffset(1, box, { x: 800, y: 600, w: 48, h: 32 }, 792)).toBe(0);
    expect(bedTileOffset(1, box, { x: 400, y: 600, w: 48, h: 32 }, 392)).toBe(1);
    expect(bedTileOffset(0, box, { x: 600, y: 600, w: 48, h: 32 }, 300)).toBe(0);
    expect(bedSleepTile(bed, 1)).toEqual({ x: 10, y: 9 });
  });

  it("despierta dentro de la cama mirando a la derecha si el lado izquierdo está libre", () => {
    expect(wakeUpPosition(bed, () => true)).toEqual({ x: 576, y: 608, facing: "right" });
    expect(wakeUpPosition(bed, () => false)).toEqual({ x: 640, y: 608, facing: "left" });
  });
});

describe("barra de energía", () => {
  it("ubica la barra y colorea de rojo a verde como el original", async () => {
    const { energyBarLayout, redToGreen } = await import("../src/render/hud-layout.ts");
    expect(redToGreen(1)).toEqual([0, 255, 0]);
    expect(redToGreen(0.5)).toEqual([255, 255, 0]);
    expect(redToGreen(0.25)).toEqual([255, 127, 0]);
    const l = energyBarLayout(270, 270, 1280, 800);
    expect(l.top).toEqual({ x: 1224, y: 560 });
    expect(l.bottom).toEqual({ x: 1224, y: 720 });
    expect(l.fill).toEqual({ x: 1236, y: 608, w: 24, h: 167 });
  });
});
