import { describe, expect, it } from "vitest";
import { Location, parseWarps, TILE, type TiledMap } from "../src/world/location.ts";
import { centerTile, collides, Facing, facingTile, findOpenTile, RUN_SPEED, step, WALK_SPEED, type Body } from "../src/world/movement.ts";

const W = 6, H = 5;
const GID = { floor: 1, cliff: 2, water: 3, wall: 4, fence: 5, shadow: 6 };

function layer(name: string, cells: Record<string, number>, own: Record<string, Record<string, unknown>> = {}, fill = 0) {
  const data = Array.from({ length: W * H }, (_, i) => cells[`${i % W},${Math.floor(i / W)}`] ?? fill);
  return { name, width: W, height: H, data, properties: [{ name: "tileProperties", value: JSON.stringify(own) }] };
}

function makeMap(): TiledMap {
  return {
    width: W,
    height: H,
    tilewidth: 16,
    tileheight: 16,
    properties: [{ name: "Warp", value: "-1 2 West 9 9  3 4 Inside 1 1  bad 1 X 2 2" }],
    tilesets: [
      {
        firstgid: 1,
        name: "sheet",
        image: "Maps/sheet",
        tilecount: 8,
        tiles: [
          { id: 1, properties: [{ name: "Passable", value: "F" }] },
          { id: 2, properties: [{ name: "Water", value: "T" }] },
          { id: 4, properties: [{ name: "Passable", value: "T" }] },
          { id: 5, properties: [{ name: "Shadow", value: "T" }] },
        ],
      },
    ],
    layers: [
      layer("Back", { "0,0": GID.cliff, "5,4": GID.water, "4,4": 0 }, {}, GID.floor),
      layer(
        "Buildings",
        { "2,0": GID.wall, "3,0": GID.fence, "4,0": GID.shadow, "5,0": GID.wall },
        { "5,0": { Action: "LockedDoorWarp 6 29 SeedShop 900 2100" } },
      ),
    ],
  };
}

const loc = new Location("Test", makeMap());

describe("parseWarps", () => {
  it("lee grupos de 5 campos e informa los inválidos", () => {
    const invalid: string[] = [];
    const warps = parseWarps("-1 2 West 9 9 3 4 Inside 1 1 bad 1 X 2 2 7", (g) => invalid.push(g));
    expect(warps).toEqual([
      { fromX: -1, fromY: 2, target: "West", toX: 9, toY: 9 },
      { fromX: 3, fromY: 4, target: "Inside", toX: 1, toY: 1 },
    ]);
    expect(invalid).toEqual(["bad 1 X 2 2", "7"]);
  });
});

describe("Location.blocksFarmer", () => {
  it("aplica las reglas de la spec S2", () => {
    expect(loc.blocksFarmer(1, 1)).toBe(false);
    expect(loc.blocksFarmer(0, 0)).toBe(true);
    expect(loc.blocksFarmer(5, 4)).toBe(true);
    expect(loc.blocksFarmer(4, 4)).toBe(true);
    expect(loc.blocksFarmer(2, 0)).toBe(true);
    expect(loc.blocksFarmer(3, 0)).toBe(false);
    expect(loc.blocksFarmer(4, 0)).toBe(false);
    expect(loc.blocksFarmer(5, 0)).toBe(true);
  });

  it("fuera del mapa bloquea salvo que haya un warp", () => {
    expect(loc.blocksFarmer(-1, 2)).toBe(false);
    expect(loc.blocksFarmer(-1, 3)).toBe(true);
    expect(loc.blocksFarmer(W, 0)).toBe(true);
  });

  it("expone las acciones de Buildings", () => {
    expect(loc.action(5, 0)).toBe("LockedDoorWarp 6 29 SeedShop 900 2100");
    expect(loc.action(1, 1)).toBeUndefined();
  });
});

describe("step", () => {
  const at = (x: number, y: number, facing: Facing = Facing.Down): Body => ({ x: x * TILE, y: y * TILE, facing });

  it("corre 5 px por tick y camina 2", () => {
    const run = at(1, 2);
    step(loc, run, { dx: 1, dy: 0, running: true }, 1000 / 60);
    expect(run.x).toBeCloseTo(TILE + RUN_SPEED);
    const walk = at(1, 2);
    step(loc, walk, { dx: 1, dy: 0, running: false }, 1000 / 60);
    expect(walk.x).toBeCloseTo(TILE + WALK_SPEED);
    expect(walk.facing).toBe(Facing.Right);
  });

  it("escala la diagonal por 0.707", () => {
    const b = at(2, 2);
    step(loc, b, { dx: 1, dy: 1, running: true }, 1000 / 60);
    expect(b.x - 2 * TILE).toBeCloseTo(RUN_SPEED * 0.707);
    expect(b.y - 2 * TILE).toBeCloseTo(RUN_SPEED * 0.707);
  });

  it("se desliza por una pared resolviendo cada eje por separado", () => {
    const b = at(2, 1);
    for (let i = 0; i < 30; i++) step(loc, b, { dx: 1, dy: -1, running: true }, 1000 / 60);
    expect(collides(loc, b.x, b.y)).toBe(false);
    expect(b.x).toBeGreaterThan(2 * TILE);
  });

  it("no atraviesa un tile bloqueado", () => {
    const b = at(4, 3);
    for (let i = 0; i < 60; i++) step(loc, b, { dx: 0, dy: 1, running: true }, 1000 / 60);
    expect(centerTile(b)).toEqual({ x: 4, y: 3 });
  });

  it("puede salir por el borde hacia un warp", () => {
    const b = at(0, 2);
    for (let i = 0; i < 20; i++) step(loc, b, { dx: -1, dy: 0, running: true }, 1000 / 60);
    const c = centerTile(b);
    expect(c.x).toBe(-1);
    expect(loc.warpAt(c.x, c.y)?.target).toBe("West");
  });
});

describe("helpers", () => {
  it("facingTile mira al tile vecino según la orientación", () => {
    expect(facingTile({ x: 2 * TILE, y: 2 * TILE, facing: Facing.Up })).toEqual({ x: 2, y: 1 });
    expect(facingTile({ x: 2 * TILE, y: 2 * TILE, facing: Facing.Left })).toEqual({ x: 1, y: 2 });
  });

  it("findOpenTile evita tiles bloqueados y warps", () => {
    expect(findOpenTile(loc, 0, 0)).not.toEqual({ x: 0, y: 0 });
    const t = findOpenTile(loc, 3, 4)!;
    expect(loc.warpAt(t.x, t.y)).toBeUndefined();
    expect(collides(loc, t.x * TILE, t.y * TILE)).toBe(false);
  });
});
