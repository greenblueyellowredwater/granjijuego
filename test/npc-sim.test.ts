import { describe, expect, it } from "vitest";
import { astar, locationRoute, npcFrame, startOfDay, tickNpc, type NpcWorld } from "../src/world/npc-sim.ts";
import { Location, type TiledMap } from "../src/world/location.ts";

function room(name: string, w: number, h: number, walls: [number, number][] = [], warp?: string): Location {
  const props: { name: string; type: string; value: string }[] = warp ? [{ name: "Warp", type: "string", value: warp }] : [];
  const back = { name: "Back", type: "tilelayer", width: w, height: h, data: Array(w * h).fill(1), properties: [] };
  const buildings = { name: "Buildings", type: "tilelayer", width: w, height: h, data: Array(w * h).fill(0), properties: [] };
  for (const [x, y] of walls) buildings.data[y * w + x] = 1;
  const map = { width: w, height: h, tilewidth: 16, tileheight: 16, layers: [back, buildings], tilesets: [{ firstgid: 1, name: "t", tiles: [] }], properties: props } as unknown as TiledMap;
  return new Location(name, map);
}

describe("simulación de NPC", () => {
  it("A* rodea paredes", () => {
    const walls = new Set(["2,0", "2,1", "2,2"]);
    const path = astar((x, y) => !walls.has(`${x},${y}`), { x: 0, y: 0 }, { x: 4, y: 0 }, 5, 5)!;
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 4, y: 0 });
    expect(path.some((p) => walls.has(`${p.x},${p.y}`))).toBe(false);
    expect(path.length).toBe(11);
  });

  it("busca la secuencia de locations por warps", () => {
    const graph = { A: [{ x: 0, y: 0, to: "B", toX: 1, toY: 1, door: false }], B: [{ x: 2, y: 2, to: "C", toX: 0, toY: 0, door: true }] };
    expect(locationRoute(graph, "A", "C")).toEqual(["A", "B", "C"]);
    expect(locationRoute(graph, "C", "A")).toBeNull();
  });

  it("camina 2 px por tick, cambia de location y mira hacia donde indica el horario", () => {
    const a = room("A", 6, 3), b = room("B", 6, 3);
    const world: NpcWorld = {
      graph: { A: [{ x: 5, y: 1, to: "B", toX: 0, toY: 1, door: false }] },
      getLocation: (n) => (n === "A" ? a : n === "B" ? b : null),
    };
    const n = startOfDay("X", { location: "A", x: 1, y: 1, facing: 2 }, [{ time: 700, arrival: false, location: "B", x: 3, y: 1, facing: 0, animation: null, message: null }]);
    tickNpc(n, 600, world);
    expect(n.walking).toBe(false);
    tickNpc(n, 700, world);
    expect(n.walking).toBe(true);
    expect(n.x).toBe(66);
    expect(npcFrame(n)).toBe(4);
    for (let i = 0; i < 500 && n.walking; i++) tickNpc(n, 700, world);
    expect([n.location, n.x, n.y, n.facing]).toEqual(["B", 192, 64, 0]);
    expect(npcFrame(n)).toBe(8);
  });
});
