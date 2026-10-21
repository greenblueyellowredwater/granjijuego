import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { Scene: class {} } }));

const { drawOrder } = await import("../src/scenes/MapViewer.ts");
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
