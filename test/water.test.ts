import { describe, expect, it } from "vitest";
import { Location, type TiledMap } from "../src/world/location.ts";
import { buildWaterGrid, hasWaterLayer, waterColor, waterPieces, WaterState } from "../src/world/water.ts";

const W = 4, H = 4;
function makeMap(props: Record<string, string>, water: Record<string, string>): TiledMap {
  const data = Array.from({ length: W * H }, () => 1);
  const own = Object.fromEntries(Object.entries(water).map(([k, v]) => [k, { Water: v }]));
  return {
    width: W,
    height: H,
    tilewidth: 16,
    tileheight: 16,
    properties: Object.entries(props).map(([name, value]) => ({ name, value })),
    tilesets: [{ firstgid: 1, name: "sheet", image: "Maps/sheet", tilecount: 4 }],
    layers: [{ name: "Back", width: W, height: H, data, properties: [{ name: "tileProperties", value: JSON.stringify(own) }] }],
  };
}

describe("agua", () => {
  it("solo hay capa en exteriores, indoorWater, Sewer o Submarine, y nunca en Desert", () => {
    expect(hasWaterLayer(new Location("A", makeMap({}, {})))).toBe(false);
    expect(hasWaterLayer(new Location("A", makeMap({ Outdoors: "T" }, {})))).toBe(true);
    expect(hasWaterLayer(new Location("A", makeMap({ indoorWater: "T" }, {})))).toBe(true);
    expect(hasWaterLayer(new Location("Sewer", makeMap({}, {})))).toBe(true);
    expect(hasWaterLayer(new Location("Desert", makeMap({ Outdoors: "T" }, {})))).toBe(false);
  });

  it("marca agua visible e invisible (I)", () => {
    const g = buildWaterGrid(new Location("A", makeMap({ Outdoors: "T" }, { "1,1": "T", "2,1": "I" })))!;
    expect([g.water[1 * W + 1], g.visible[1 * W + 1], g.water[1 * W + 2], g.visible[1 * W + 2]]).toEqual([1, 1, 1, 0]);
    expect(buildWaterGrid(new Location("A", makeMap({ Outdoors: "T" }, {})))).toBeNull();
  });

  it("avanza animación y desplazamiento como updateWater", () => {
    const s = new WaterState(false);
    s.tick(16, 0);
    expect(s.index).toBe(1);
    expect(s.timer).toBe(200);
    expect(s.position).toBeCloseTo(0.15);
    for (let i = 0; i < 12; i++) s.tick(16, 500);
    expect(s.index).toBe(1);
    s.tick(16, 500);
    expect(s.index).toBe(2);
    const farm = new WaterState(true);
    for (let i = 0; i < 640; i++) farm.tick(16, 0);
    expect(farm.position).toBeCloseTo(0, 3);
    expect(farm.flip).toBe(true);
  });

  it("recorta bordes superiores y agrega la pieza del borde inferior", () => {
    const g = buildWaterGrid(new Location("A", makeMap({ Outdoors: "T" }, { "1,1": "T", "1,2": "T" })))!;
    const s = new WaterState(false);
    s.position = 10.5;
    s.index = 3;
    const top = waterPieces(g, s, 1, 1);
    expect(top).toEqual([{ x: 64, y: 64, sx: 192, sy: 2064 + 0 + 10, sw: 64, sh: 54 }]);
    const bottom = waterPieces(g, s, 1, 2);
    expect(bottom[0]).toEqual({ x: 64, y: 128 - 10, sx: 192, sy: 2064 + 128, sw: 64, sh: 64 });
    expect(bottom[1]).toEqual({ x: 64, y: 192 - 10, sx: 192, sy: 2064 + 0, sw: 64, sh: 64 - 53 - 1 });
    s.flip = true;
    expect(waterPieces(g, s, 1, 1)[0].sy).toBe(2064 + 128 + 10);
    expect(waterPieces(g, s, 0, 0)).toEqual([]);
  });

  it("usa el color de la estación y el verde de la playa", () => {
    expect(waterColor("Town", "spring")).toEqual({ rgb: [120, 200, 255], alpha: 0.5 });
    expect(waterColor("Town", "fall")).toEqual({ rgb: [255, 130, 200], alpha: 0.5 });
    expect(waterColor("Beach", "summer", 13)).toEqual({ rgb: [0, 255, 0], alpha: 0.4 });
    expect(waterColor("Beach", "summer", 15).alpha).toBe(0.5);
  });
});
