import { describe, expect, it } from "vitest";
import { DotNetRandom } from "../src/world/dotnet-random.ts";
import {
  breakStone,
  checkStoneForItems,
  createLitterObject,
  gemRichStone,
  getMineArea,
  isDarkArea,
  ladderChance,
  levelChances,
  mineLevelOf,
  mineLighting,
  mineMapImage,
  mineMapNumber,
  oreForLevel,
  outdoorStoneDestroyed,
  populateLevel,
  type MineMap,
  type MinerContext,
  type MineRandom,
} from "../src/world/mines.ts";

const ctx: MinerContext = { dailyLuck: 0, luckLevel: 0, miningLevel: 0, reachedBottom: false, professions: [] };

function scripted(doubles: number[], ints: number[] = []): MineRandom {
  return {
    next: (a: number, b?: number) => {
      const v = ints.shift();
      if (v === undefined) throw new Error("sin enteros");
      return b === undefined ? Math.min(v, a - 1) : Math.max(a, Math.min(v, b - 1));
    },
    nextDouble: () => {
      const v = doubles.shift();
      if (v === undefined) throw new Error("sin dobles");
      return v;
    },
    nextBool() {
      return this.nextDouble() < 0.5;
    },
  };
}

function room(w: number, h: number, ladder = { x: 2, y: 0 }): MineMap {
  return {
    width: w,
    height: h,
    backType: (x, y) => (y >= 1 ? "Stone" : undefined),
    hasTile: (layer, x, y) => layer === "Back" || (layer === "Buildings" && x === ladder.x && y === ladder.y),
    mineIndex: (layer, x, y) => (layer === "Buildings" && x === ladder.x && y === ladder.y ? 115 : layer === "Back" ? 1 : -1),
    diggable: () => false,
  };
}

describe("minas: áreas, mapas y texturas", () => {
  it("clasifica niveles en áreas", () => {
    expect([1, 10, 11, 29, 30, 39, 40, 79, 80, 120, 121].map(getMineArea)).toEqual([0, 0, 10, 10, 0, 0, 40, 40, 80, 80, 121]);
  });

  it("elige el número de mapa como el juego", () => {
    expect([1, 5, 10, 20, 39, 40, 45, 60, 80, 100, 119, 120].map(mineMapNumber)).toEqual([1, 5, 10, 20, 39, 10, 5, 20, 10, 20, 39, 120]);
  });

  it("nombra las ubicaciones UndergroundMineN", () => {
    expect(mineLevelOf("UndergroundMine37")).toBe(37);
    expect(mineLevelOf("Mine")).toBeNull();
  });

  it("cambia la textura según área y oscuridad", () => {
    expect(mineMapImage(12, 12)).toEqual({ image: null, dark: false });
    expect(mineMapImage(45, 5)).toEqual({ image: "Maps/Mines/mine_frost", dark: false });
    expect(mineMapImage(75, 35)).toEqual({ image: "Maps/Mines/mine_frost_dark", dark: true });
    expect(mineMapImage(110, 30)).toEqual({ image: "Maps/Mines/mine_lava_dark", dark: true });
    expect(mineMapImage(120, 120)).toEqual({ image: "Maps/Mines/mine_lava", dark: false });
    expect(mineMapImage(5, 45)).toEqual({ image: "Maps/Mines/mine_dark", dark: true });
    expect(isDarkArea(32, false)).toBe(true);
    expect(isDarkArea(72, true)).toBe(false);
  });

  it("calcula la iluminación del nivel", () => {
    expect(mineLighting(1, false, scripted([0.9, 0.9, 0.9])).color).toEqual([80, 80, 40, 255]);
    expect(mineLighting(3, false, scripted([0.1, 0.1, 0.9, 0.9]))).toEqual({ color: [150, 150, 60, 255], lightingDark: true });
    expect(mineLighting(12, false, scripted([0.9, 0.1, 0.9])).color).toEqual([110, 110, 70, 255]);
    expect(mineLighting(35, false, scripted([0.9, 0.9, 0.9])).color).toEqual([150, 150, 120, 255]);
    expect(mineLighting(100, false, scripted([0.9, 0.9, 0.9])).color).toEqual([140, 140, 80, 255]);
  });
});

describe("minas: población", () => {
  it("ajusta las probabilidades por nivel", () => {
    expect(levelChances(1, scripted([], [20, 100]))).toEqual({ stone: 0.2, monster: 0, item: 0, gem: 0 });
    expect(levelChances(15, scripted([], [20, 100]))).toEqual({ stone: 0.2, monster: 0.012, item: 0, gem: 0 });
    expect(levelChances(7, scripted([], [20, 100]))).toEqual({ stone: 0.2, monster: 0.012, item: 0.0025, gem: 0.0015 });
  });

  it("crea piedras, cobre y piedras grandes en las primeras minas", () => {
    expect(createLitterObject(3, false, 0, scripted([0.7, 0.5, 0.5, 0.5], [35]), ctx)).toEqual({ id: "38", hp: 1 });
    expect(createLitterObject(3, false, 0, scripted([0.01], [40]), ctx)).toEqual({ id: "751", hp: 3 });
    expect(createLitterObject(3, false, 0, scripted([0.9, 0.9, 0.05, 0.7, 0.2], [41]), ctx)).toEqual({ id: "670", hp: 2, flipped: true });
    expect(createLitterObject(45, false, 0, scripted([0.9, 0.9, 0.9], [49]), ctx)).toEqual({ id: "50", hp: 3 });
    expect(createLitterObject(85, false, 0, scripted([0.1, 0.2, 0.9, 0.9, 0.9, 0.9]), ctx)).toEqual({ id: "38", hp: 4 });
  });

  it("elige la piedra preciosa según el nivel", () => {
    expect(gemRichStone(10, scripted([0.7], [60]), false)).toBe("10");
    expect(gemRichStone(50, scripted([], [64, 3]), false)).toBe("14");
    expect(gemRichStone(90, scripted([], [69]), false)).toBe("6");
  });

  it("puebla un nivel sin tocar la escalera de subida", () => {
    const r = new DotNetRandom(7);
    const level = populateLevel(room(12, 10), 7, false, r, ctx, (id) => /^\d+$/.test(id) && +id >= 30);
    expect(level.start).toEqual({ x: 2, y: 1 });
    expect(level.entities.some((e) => e.x === 2 && e.y === 1)).toBe(false);
    expect(level.entities.every((e) => e.y >= 1)).toBe(true);
    expect(level.stonesLeft).toBe(level.entities.filter((e) => e.kind === "object" && +e.itemId >= 30 && !e.spawned).length);
  });

  it("no puebla los niveles múltiplos de diez", () => {
    const level = populateLevel(room(12, 10), 20, false, new DotNetRandom(3), ctx, () => true);
    expect(level.entities).toEqual([]);
    expect(level.ladder).toBeNull();
  });
});

describe("minas: romper piedras", () => {
  it("probabilidad de escalera", () => {
    expect(ladderChance(10, ctx, 0)).toBeCloseTo(0.16);
    expect(ladderChance(0, ctx, 1)).toBeCloseTo(1.02);
  });

  it("la última piedra siempre abre la escalera", () => {
    const state = { stonesLeft: 1, ladderHasSpawned: false, enemies: 0 };
    const out = checkStoneForItems("32", 3, scripted([0.5, 0.9, 0.9, 0.2]), ctx, state);
    expect(out.ladder).toBe(true);
    expect(state).toEqual({ stonesLeft: 0, ladderHasSpawned: true, enemies: 0 });
    expect(out.drops).toEqual([{ id: "(O)390", count: 1 }]);
  });

  it("los nodos de cobre sueltan mineral y experiencia", () => {
    const state = { stonesLeft: 30, ladderHasSpawned: true, enemies: 0 };
    const out = checkStoneForItems("751", 3, scripted([0.5, 0.9, 0.9], [2]), ctx, state);
    expect(out).toEqual({ drops: [{ id: "(O)378", count: 2 }], experience: 5, ladder: false });
  });

  it("piedras comunes pueden soltar geoda y mineral del nivel", () => {
    const state = { stonesLeft: 30, ladderHasSpawned: true, enemies: 0 };
    const out = checkStoneForItems("40", 45, scripted([0.5, 0.01, 0.9, 0.01, 0.9, 0.5]), ctx, state);
    expect(out.drops).toEqual([{ id: "(O)536", count: 1 }, { id: "(O)380", count: 1 }]);
    expect(out.experience).toBe(5);
  });

  it("mineral por nivel", () => {
    expect(oreForLevel(10, scripted([]))).toBe("(O)378");
    expect(oreForLevel(25, scripted([0.05]))).toBe("(O)380");
    expect(oreForLevel(65, scripted([0.05]))).toBe("(O)384");
    expect(oreForLevel(90, scripted([0.9, 0.9]))).toBe("(O)378");
  });

  it("nodos de gemas y piedra 44", () => {
    expect(breakStone("8", scripted([]), ctx, false, () => scripted([]))).toEqual({ drops: [{ id: "(O)66", count: 1 }], experience: 16 });
    expect(breakStone("44", scripted([], [1]), ctx, false, () => scripted([]))).toEqual({ drops: [{ id: "(O)72", count: 1 }], experience: 150 });
  });

  it("piedras de la granja: una piedra y experiencia", () => {
    const out = outdoorStoneDestroyed("343", 3, 4, ctx, 1, () => scripted([0.9, 0.9, 0.9, 0.9]));
    expect(out).toEqual({ drops: [{ id: "(O)390", count: 1 }], experience: 1 });
  });
});
