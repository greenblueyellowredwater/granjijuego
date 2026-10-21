import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { Scene: class {} } }));

const { drawOrder } = await import("../src/render/tilemap.ts");
const { seasonalTexture } = await import("../src/content.ts");

describe("drawOrder", () => {
  it("dibuja cada capa base seguida de sus subcapas numeradas y omite las desconocidas", () => {
    const names = ["AlwaysFront", "Back3", "Paths", "Back", "Front", "Buildings", "Back2", "Buildings10", "Buildings2"];
    expect(drawOrder(names)).toEqual(["Back", "Back2", "Back3", "Buildings", "Buildings2", "Buildings10", "Front", "AlwaysFront"]);
  });
});

describe("seasonalTexture", () => {
  const manifest = {
    gameVersion: "x",
    maps: [],
    data: [],
    fonts: [],
    textures: { "Maps/spring_town": { width: 1, height: 1 }, "Maps/winter_town": { width: 1, height: 1 } },
  };

  it("cambia el prefijo de estación cuando existe la textura", () => {
    expect(seasonalTexture(manifest, "Maps/spring_town", "winter")).toBe("Maps/winter_town");
  });

  it("mantiene la original si la estación no tiene textura propia", () => {
    expect(seasonalTexture(manifest, "Maps/spring_town", "summer")).toBe("Maps/spring_town");
  });

  it("no toca texturas sin prefijo de estación", () => {
    expect(seasonalTexture(manifest, "Maps/paths", "fall")).toBe("Maps/paths");
  });
});

describe("tiles de Front ordenados con los personajes", async () => {
  const { frontTileDepth, layerGroup } = await import("../src/render/tilemap.ts");

  it("agrupa subcapas con su capa base", () => {
    expect(["Back", "Back2", "Buildings3", "Front", "Front12", "AlwaysFront", "AlwaysFront2", "Paths"].map(layerGroup)).toEqual([
      "Back", "Back", "Buildings", "Front", "Front", "AlwaysFront", "AlwaysFront", "Paths",
    ]);
  });

  it("usa ((fila+1)·64 + 64 + 0,1·i/(n−1))/10000", () => {
    expect(frontTileDepth(55, 0, 1)).toBeCloseTo((56 * 64 + 64) / 10000);
    expect(frontTileDepth(55, 1, 3)).toBeCloseTo((56 * 64 + 64.05) / 10000);
  });

  it("tapa al granjero solo si está detrás", () => {
    const farmerDepth = (row: number) => (row * 64 + 16 + 16) / 10000;
    const fence = frontTileDepth(55, 0, 1);
    expect(farmerDepth(57)).toBeGreaterThan(fence);
    expect(farmerDepth(56)).toBeLessThan(fence);
    expect(farmerDepth(54)).toBeLessThan(fence);
  });
});
