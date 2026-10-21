import { describe, expect, it } from "vitest";
import { ANIMATIONS, FarmerAnimator, intervalModifier, sourceRect } from "../src/world/farmer-animation.ts";
import { Location, parseWarps, TILE, type TiledMap } from "../src/world/location.ts";
import {
  centerTile,
  collides,
  Facing,
  facingFor,
  facingTile,
  farmerBox,
  findOpenTile,
  positionForTile,
  shadowAboveBuildings,
  step,
  tickDistance,
  warpTouching,
  type Body,
} from "../src/world/movement.ts";

const W = 8, H = 6;
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
    properties: [{ name: "Warp", value: "-1 2 West 9 9  3 5 Inside 1 1" }],
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
      layer("Back", { "0,0": GID.cliff, "7,5": GID.water, "6,5": 0 }, {}, GID.floor),
      layer(
        "Buildings",
        { "2,0": GID.wall, "3,0": GID.fence, "4,0": GID.shadow, "5,0": GID.wall, "6,2": GID.wall },
        { "5,0": { Action: "LockedDoorWarp 6 29 SeedShop 900 2100" } },
      ),
    ],
  };
}

const loc = new Location("Test", makeMap());
const at = (tx: number, ty: number, facing: Facing = Facing.Down): Body => ({ ...positionForTile(tx, ty), facing });
const keys = (...f: Facing[]) => new Set(f);

describe("parseWarps", () => {
  it("lee grupos de 5 campos e informa los inválidos", () => {
    const invalid: string[] = [];
    const warps = parseWarps("-1 2 West 9 9 3 4 Inside 1 1 bad 1 X 2 2 7", (g) => invalid.push(g));
    expect(warps.map((w) => w.target)).toEqual(["West", "Inside"]);
    expect(invalid).toEqual(["bad 1 X 2 2", "7"]);
  });
});

describe("Location.blocksFarmer", () => {
  it("aplica las reglas de tiles de la spec S2", () => {
    expect(loc.blocksFarmer(1, 1)).toBe(false);
    expect(loc.blocksFarmer(0, 0)).toBe(true);
    expect(loc.blocksFarmer(7, 5)).toBe(true);
    expect(loc.blocksFarmer(6, 5)).toBe(true);
    expect(loc.blocksFarmer(2, 0)).toBe(true);
    expect(loc.blocksFarmer(3, 0)).toBe(false);
    expect(loc.blocksFarmer(4, 0)).toBe(false);
    expect(loc.blocksFarmer(5, 0)).toBe(true);
    expect(loc.blocksFarmer(-1, 2)).toBe(false);
    expect(loc.blocksFarmer(-1, 3)).toBe(true);
  });
});

describe("posición y caja", () => {
  it("llega a un tile en (tx·64, ty·64+16) con la caja en la mitad inferior", () => {
    const p = positionForTile(3, 2);
    expect(p).toEqual({ x: 192, y: 144 });
    expect(farmerBox(p.x, p.y)).toEqual({ x: 200, y: 144, w: 48, h: 32 });
    expect(centerTile({ ...p, facing: Facing.Down })).toEqual({ x: 3, y: 2 });
  });
});

describe("velocidad", () => {
  it("usa max(1, velocidad × 0,066 × 16 ms) y 0,707 en diagonal", () => {
    expect(tickDistance(5, 1)).toBeCloseTo(5.28);
    expect(tickDistance(2, 1)).toBeCloseTo(2.112);
    expect(tickDistance(5, 2)).toBeCloseTo(5.28 * 0.707);
  });

  it("avanza un tick corriendo y caminando", () => {
    const run = at(1, 2);
    step(loc, run, keys(Facing.Right), true);
    expect(run.x).toBeCloseTo(64 + 5.28);
    const walk = at(1, 2);
    step(loc, walk, keys(Facing.Right), false);
    expect(walk.x).toBeCloseTo(64 + 2.112);
  });
});

describe("orientación", () => {
  it("prioriza izquierda, derecha, arriba, abajo", () => {
    expect(facingFor(keys(Facing.Up, Facing.Left), Facing.Down)).toBe(Facing.Left);
    expect(facingFor(keys(Facing.Down, Facing.Right), Facing.Up)).toBe(Facing.Right);
    expect(facingFor(keys(Facing.Down, Facing.Up), Facing.Left)).toBe(Facing.Up);
    expect(facingFor(keys(), Facing.Left)).toBe(Facing.Left);
  });
});

describe("colisión", () => {
  it("no entra en un tile bloqueado", () => {
    const b = at(6, 4);
    for (let i = 0; i < 60; i++) step(loc, b, keys(Facing.Down), true);
    expect(collides(loc, b.x, b.y)).toBe(false);
    expect(centerTile(b)).toEqual({ x: 6, y: 4 });
  });

  it("da medio paso cuando el paso completo choca pero el medio no", () => {
    const b = at(5, 2);
    b.x = 325;
    const before = b.x;
    step(loc, b, keys(Facing.Right), true);
    expect(b.x).toBeCloseTo(before + 5.28 / 2);
  });

  it("rodea la esquina cuando solo choca un cuarto de la caja", () => {
    const b = at(6, 3);
    b.x = 6 * TILE - 40;
    b.y = 3 * TILE + 2;
    const before = b.x;
    step(loc, b, keys(Facing.Up), true);
    expect(b.x).toBeCloseTo(before - 5 * (16 / 64));
    expect(b.y).toBe(3 * TILE + 2);
  });

  it("no rodea esquinas con dos direcciones apretadas", () => {
    const b = at(6, 3);
    b.x = 6 * TILE - 40;
    b.y = 3 * TILE + 2;
    const before = b.x;
    step(loc, b, keys(Facing.Up, Facing.Down), true);
    expect(b.x).toBe(before);
  });
});

describe("warps", () => {
  it("se activa cuando la caja proyectada toca el tile del warp", () => {
    const b = at(0, 2);
    let warp;
    for (let i = 0; i < 20 && !warp; i++) warp = step(loc, b, keys(Facing.Left), true).warp;
    expect(warp?.target).toBe("West");
    expect(b.x).toBeGreaterThan(-8);
  });

  it("usa los bordes exclusivos de la caja", () => {
    expect(warpTouching(loc, { x: 3 * TILE + 8, y: 4 * TILE + 32, w: 48, h: 32 })?.target).toBe("Inside");
    expect(warpTouching(loc, { x: 3 * TILE + 8, y: 4 * TILE + 31, w: 48, h: 32 })).toBeUndefined();
  });
});

describe("animación", () => {
  it("calcula el rectángulo con 6 frames por fila", () => {
    expect(sourceRect(0)).toEqual({ x: 0, y: 0, w: 16, h: 32 });
    expect(sourceRect(6)).toEqual({ x: 0, y: 32, w: 16, h: 32 });
    expect(sourceRect(20)).toEqual({ x: 32, y: 96, w: 16, h: 32 });
  });

  it("usa las tablas de caminar y correr, con la izquierda espejada", () => {
    expect(ANIMATIONS[0].map((f) => f.frame)).toEqual([1, 0, 2, 0]);
    expect(ANIMATIONS[24].every((f) => f.flip)).toBe(true);
    expect(ANIMATIONS[32][2]).toEqual({ frame: 18, ms: 120, offsetY: -4, flip: false });
  });

  it("acelera los intervalos según la velocidad", () => {
    expect(intervalModifier(true, 1)).toBeCloseTo(1 - 0.0255 * 5.28 * 1.25);
    expect(intervalModifier(false, 1)).toBeCloseTo(1 - 0.025 * 2.112 * 1.25);
    expect(intervalModifier(true, 0)).toBe(1);
  });

  it("avanza de frame al superar el intervalo y conserva el índice al cambiar de dirección", () => {
    const a = new FarmerAnimator();
    const limit = 200 * intervalModifier(false, 1);
    let ticks = 0;
    while (a.animationIndexInLoop === 0) {
      a.tick(Facing.Down, true, false, 1);
      ticks++;
    }
    expect(ticks).toBe(Math.floor(limit / 16) + 1);
    a.tick(Facing.Right, true, false, 1);
    expect(a.animationIndexInLoop).toBe(1);
    expect(a.frame.frame).toBe(6);
    a.tick(Facing.Right, false, false, 0);
    expect(a.frame.frame).toBe(6);
  });
});

describe("sombra", () => {
  it("va debajo de Buildings salvo en tiles Passable de Buildings o agua", () => {
    expect(shadowAboveBuildings(loc, at(1, 1))).toBe(false);
    expect(shadowAboveBuildings(loc, { x: 3 * TILE, y: 16, facing: Facing.Down })).toBe(true);
  });

  it("revisa la caja extendida 8 px hacia abajo", () => {
    const b = at(7, 4);
    b.y = 5 * TILE - 32 - 9;
    expect(shadowAboveBuildings(loc, b)).toBe(false);
    b.y = 5 * TILE - 32 - 8;
    expect(shadowAboveBuildings(loc, b)).toBe(true);
  });
});

describe("helpers", () => {
  it("facingTile mira al tile vecino según la orientación", () => {
    expect(facingTile(at(2, 2, Facing.Up))).toEqual({ x: 2, y: 1 });
    expect(facingTile(at(2, 2, Facing.Left))).toEqual({ x: 1, y: 2 });
  });

  it("findOpenTile evita tiles bloqueados y warps", () => {
    expect(findOpenTile(loc, 0, 0)).not.toEqual({ x: 0, y: 0 });
    const t = findOpenTile(loc, 3, 5)!;
    expect(loc.warpAt(t.x, t.y)).toBeUndefined();
  });
});
