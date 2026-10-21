import { describe, expect, it } from "vitest";
import { Location, TILE, type TiledMap } from "../src/world/location.ts";
import { collides, positionForTile } from "../src/world/movement.ts";
import { SeededRandom } from "../src/world/rng.ts";
import { bushSourceRect, drawOps, solidRect, spawnFromPaths, treeTexture, type Entity, type TerrainData } from "../src/world/terrain.ts";

const W = 12, H = 8;
const PATHS_GID = 100;

function makeMap(name = "Town", paths: Record<string, number>, front: string[] = [], pathProps: Record<string, Record<string, unknown>> = {}): TiledMap {
  const fill = (cells: Record<string, number>, def = 0) => Array.from({ length: W * H }, (_, i) => cells[`${i % W},${Math.floor(i / W)}`] ?? def);
  return {
    width: W,
    height: H,
    tilewidth: 16,
    tileheight: 16,
    properties: [{ name: "Outdoors", value: "T" }],
    tilesets: [
      { firstgid: 1, name: "sheet", image: "Maps/sheet", tilecount: 50 },
      { firstgid: PATHS_GID, name: "Paths", image: "Maps/paths", tilecount: 64 },
    ],
    layers: [
      { name: "Back", width: W, height: H, data: fill({}, 1), properties: [] },
      { name: "Paths", width: W, height: H, data: fill(Object.fromEntries(Object.entries(paths).map(([k, v]) => [k, PATHS_GID + v]))), properties: [{ name: "tileProperties", value: JSON.stringify(pathProps) }] },
      { name: "Front", width: W, height: H, data: fill(Object.fromEntries(front.map((k) => [k, 1]))), properties: [] },
    ],
  };
}

const data: TerrainData = {
  wildTrees: {
    "1": { Textures: [{ Season: 1, Texture: "TerrainFeatures\\tree1_summer" }, { Season: null, Texture: "TerrainFeatures\\tree1_spring" }], IsLeafy: true, IsLeafyInWinter: false, IsLeafyInFall: true },
    "3": { Textures: [{ Season: null, Texture: "TerrainFeatures\\tree3_spring" }], IsLeafy: false },
  },
  objects: { "343": { SpriteIndex: 343 }, "784": { SpriteIndex: 784 } },
  bushTextureWidth: 128,
};

const byKind = (es: Entity[], kind: Entity["kind"]) => es.filter((e) => e.kind === kind);

describe("spawnFromPaths", () => {
  it("genera según el índice de Paths", () => {
    const loc = new Location("Forest", makeMap("Forest", { "1,1": 9, "2,1": 11, "3,1": 13, "4,1": 16, "5,1": 18, "6,1": 25, "7,1": 26, "8,1": 22, "9,1": 23, "10,1": 24 }));
    const es = spawnFromPaths(loc, "spring", true, new SeededRandom(1));
    expect(byKind(es, "tree").map((e) => (e as any).treeId).sort()).toEqual(["1", "3", expect.any(String)].sort());
    const objects = byKind(es, "object").map((e) => (e as any).itemId);
    expect(objects).toHaveLength(3);
    expect(["784", "674", "675"]).toContain(objects[0]);
    expect(byKind(es, "bush").map((e) => (e as any).size).sort()).toEqual([0, 1, 2]);
    expect(byKind(es, "grass")).toHaveLength(1);
  });

  it("no genera maleza al aire libre en invierno", () => {
    const loc = new Location("Forest", makeMap("Forest", { "3,1": 13 }));
    expect(spawnFromPaths(loc, "winter", true)).toHaveLength(0);
    expect(spawnFromPaths(loc, "winter", false)).toHaveLength(1);
  });

  it("los grupos de recursos no reservan tiles y bloquean el pasto que se superpone", () => {
    const es = spawnFromPaths(new Location("Forest", makeMap("Forest", { "4,4": 20, "5,5": 9 })), "spring", true);
    expect(byKind(es, "clump")).toEqual([{ kind: "clump", x: 4, y: 4, index: 672, w: 2, h: 2 }]);
    expect(byKind(es, "tree")).toHaveLength(1);
    const grass = spawnFromPaths(new Location("Forest", makeMap("Forest", { "4,4": 21, "4,5": 22, "6,5": 22 })), "spring", true);
    expect(byKind(grass, "grass").map((e) => e.x)).toEqual([6]);
  });

  it("objetos y terrain features ocupan por separado", () => {
    const es = spawnFromPaths(new Location("Forest", makeMap("Forest", { "1,1": 13 })), "spring", true);
    expect(es).toHaveLength(1);
  });

  it("lee SpawnTree en el índice 34", () => {
    const loc = new Location("Forest", makeMap("Forest", { "1,1": 34, "2,1": 34 }, [], { "1,1": { SpawnTree: "wild 3 2" }, "2,1": { SpawnTree: "fruit 628" } }));
    const es = spawnFromPaths(loc, "spring", true);
    expect(es.find((e) => e.x === 1)).toMatchObject({ kind: "tree", treeId: "3", stage: 2 });
    expect(es.find((e) => e.x === 2)).toMatchObject({ kind: "fruitTree", treeId: "628", stage: 4 });
  });

  it("marca arbustos de pueblo y oculta la sombra bajo Front", () => {
    const loc = new Location("Town", makeMap("Town", { "5,2": 24, "6,2": 25, "7,2": 26 }, ["6,2"]));
    const bushes = spawnFromPaths(loc, "spring", true) as Extract<Entity, { kind: "bush" }>[];
    expect(bushes.find((b) => b.x === 5)).toMatchObject({ townBush: false, drawShadow: true });
    expect(bushes.find((b) => b.x === 6)).toMatchObject({ townBush: true, drawShadow: false });
  });

  it("es estable para la misma location", () => {
    const m = makeMap("Forest", { "1,1": 13, "2,2": 23, "3,3": 25 });
    expect(spawnFromPaths(new Location("Forest", m), "spring", true)).toEqual(spawnFromPaths(new Location("Forest", m), "spring", true));
  });
});

describe("dibujo y colisión", () => {
  it("elige la textura del árbol por estación con respaldo", () => {
    expect(treeTexture(data.wildTrees["1"], "summer")).toBe("TerrainFeatures/tree1_summer");
    expect(treeTexture(data.wildTrees["1"], "winter")).toBe("TerrainFeatures/tree1_spring");
  });

  it("dibuja sombra, tronco y copa del árbol adulto", () => {
    const [shadow, stump, top] = drawOps({ kind: "tree", x: 3, y: 4, treeId: "1", stage: 5, flipped: false }, data, "spring");
    expect(shadow).toMatchObject({ texture: "LooseSprites/Cursors", sx: 663, x: 3 * 64 - 51, y: 4 * 64 - 16 });
    expect(stump).toMatchObject({ sx: 32, sy: 96, x: 192, y: 4 * 64 - 64, depth: 5 * 64 / 10000 });
    expect(top).toMatchObject({ sw: 48, sh: 96, x: 192 - 64, y: 256 - 320 });
    expect(top.depth).toBeCloseTo((320 + 2) / 10000 - 3 / 1e6);
    const bare = drawOps({ kind: "tree", x: 0, y: 0, treeId: "1", stage: 5, flipped: false }, data, "winter")[0];
    expect(bare).toMatchObject({ texture: "LooseSprites/Cursors_1_6", sx: 469 });
  });

  it("calcula rectángulos de arbustos", () => {
    const bush = (size: number, townBush = false) => ({ kind: "bush" as const, x: 0, y: 0, size, flipped: false, townBush, drawShadow: true });
    expect(bushSourceRect(bush(0), 2, 128)).toEqual({ sx: 64, sy: 224, sw: 16, sh: 32 });
    expect(bushSourceRect(bush(1), 1, 128)).toEqual({ sx: 64, sy: 0, sw: 32, sh: 48 });
    expect(bushSourceRect(bush(1), 2, 128)).toEqual({ sx: 0, sy: 48, sw: 32, sh: 48 });
    expect(bushSourceRect(bush(1, true), 1, 128)).toEqual({ sx: 32, sy: 96, sw: 32, sh: 32 });
    expect(bushSourceRect(bush(2, true), 0, 128)).toEqual({ sx: 48, sy: 176, sw: 48, sh: 48 });
    expect(bushSourceRect(bush(2), 3, 128)).toEqual({ sx: 0, sy: 176, sw: 48, sh: 48 });
  });

  it("bloquea al granjero con árboles, objetos, arbustos y grupos de recursos", () => {
    const loc = new Location("Forest", makeMap("Forest", { "2,2": 9, "4,2": 16, "6,2": 25, "8,4": 19 }));
    const es = spawnFromPaths(loc, "spring", true);
    loc.setSolids(es.map(solidRect).filter((r) => r !== null));
    for (const [x, y] of [[2, 2], [4, 2], [6, 2], [7, 2], [8, 4], [9, 5]]) {
      const p = positionForTile(x, y);
      expect(collides(loc, p.x, p.y), `${x},${y}`).toBe(true);
    }
    const free = positionForTile(5, 2);
    expect(collides(loc, free.x, free.y)).toBe(false);
    expect(solidRect({ kind: "grass", x: 1, y: 1, grassType: 1 })).toBeNull();
    expect(TILE).toBe(64);
  });
});
