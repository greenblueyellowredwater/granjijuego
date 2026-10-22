import { describe, expect, it } from "vitest";
import { BobberBarState, biteTime, bobberLanding, chooseFish, distanceToLand, fishingExperience, fishSizeFactor, type FishContext } from "../src/world/fishing.ts";

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("pesca", () => {
  it("tiempo hasta la picada", () => {
    expect(biteTime(0, false, () => 0)).toBe(600);
    expect(biteTime(0, true, () => 0.5)).toBe(Math.fround(Math.fround(600 + Math.floor(0.5 * 29400)) * 0.75));
    expect(biteTime(10, false, () => 0.999999)).toBe(600 + Math.floor(0.999999 * (27500 - 600)));
  });

  it("distancia del lance según poder, nivel y dirección", () => {
    expect(bobberLanding(1, 0, 2, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 + 192 });
    expect(bobberLanding(0, 0, 0, { x: 100, y: 100 })).toEqual({ x: 100, y: -28 });
    expect(bobberLanding(1, 4, 1, { x: 100, y: 100 })).toEqual({ x: 100 + 384 - 8, y: 100 });
    expect(bobberLanding(1, 4, 3, { x: 100, y: 100 }).x).toBe(100 - 376);
  });

  it("distancia a tierra", () => {
    const water = (x: number, y: number) => Math.abs(x) < 3 && Math.abs(y) < 3;
    expect(distanceToLand(0, 0, water, () => true)).toBe(3);
    expect(distanceToLand(2, 0, water, () => true)).toBe(1);
  });

  it("experiencia de pesca", () => {
    expect(fishingExperience(0, 30, false, false, false)).toBe(13);
    expect(fishingExperience(2, 90, false, true, false)).toBe(39 + Math.trunc(Math.fround(39 * 1.4)));
    expect(fishingExperience(0, 30, false, false, true)).toBe(65);
  });

  it("elige pez según datos y requisitos", () => {
    const fish = { "145": "Sunfish/30/mixed/5/15/600 1900/spring summer/sunny/683 .2/1/.45/.1/0/true", "137": "Smallmouth Bass/28/mixed/12/24/600 2600/spring fall/both/682 .2/1/.45/.1/0/true", "142": "Carp/15/mixed/15/50/600 2600/spring summer fall/both/689 .4 682 .2/2/.15/.1/0/false" };
    const base: FishContext = { season: 0, time: 1000, raining: false, fishingLevel: 0, dailyLuck: 0, luckLevel: 0, waterDepth: 3, playerTile: { x: 0, y: 0 }, bobberTile: { x: 0, y: 0 }, tutorial: false, trainingRod: false, caught: {}, condition: () => true, random: () => 0 };
    const local = [{ ItemId: "(O)142", Season: 0, Chance: 1 }, { ItemId: "(O)145", Season: 1 }];
    expect(chooseFish([], local, fish, base).id).toBe("(O)142");
    expect(chooseFish([], local, fish, { ...base, tutorial: true }).id).toBe("(O)145");
    expect(chooseFish([], [{ ItemId: "(O)145", Season: 0 }], fish, { ...base, raining: true }).id).toBe("(O)168");
  });

  it("barra: tamaño, calidad y progreso", () => {
    const raw = "Sunfish/30/mixed/5/15/600 1900/spring summer/sunny/683 .2/1/.45/.1/0/true";
    const s = new BobberBarState(raw, 0.7, 0, false, false);
    expect([s.fishSize, s.fishQuality, s.bobberBarHeight, s.bobberBarPos, s.distanceFromCatching]).toEqual([13, 2, 96, 472, 0.3]);
    const t = new BobberBarState(raw, 0.7, 0, true, true);
    expect([t.bobberBarHeight, t.fishQuality, t.difficulty, t.distanceFromCatching]).toEqual([136, 0, 50, 0.1]);
    for (let i = 0; i < 20; i++) s.update(false, seq([0.99]));
    expect(s.scale).toBe(1);
    s.bobberPosition = s.bobberBarPos + 40;
    s.bobberTargetPosition = -1;
    s.update(false, seq([0.99]));
    expect(s.bobberInBar).toBe(true);
    expect(s.distanceFromCatching).toBeCloseTo(0.302, 5);
  });

  it("factor de tamaño", () => {
    expect(fishSizeFactor(5, 0, () => 0.5)).toBeGreaterThan(0);
    expect(fishSizeFactor(0, 0, () => 0.5)).toBe(0);
  });
});
