import { describe, expect, it } from "vitest";
import { debrisDrops, debrisKind, spawnDebris, stepDebris, toolBreaks } from "../src/world/debris.ts";

describe("escombros", () => {
  it("clasifica piedras, ramas y yuyos como en Data/Objects", () => {
    expect(debrisKind("Stone", -999)).toBe("stone");
    expect(debrisKind("Twig", -999)).toBe("twig");
    expect(debrisKind("Weeds", -999)).toBe("weeds");
    expect(debrisKind("Stone", -16)).toBeNull();
  });

  it("cada herramienta rompe lo suyo", () => {
    expect(toolBreaks("stone", "pickaxe")).toBe(true);
    expect(toolBreaks("stone", "axe")).toBe(false);
    expect(toolBreaks("twig", "axe")).toBe(true);
    expect(toolBreaks("weeds", "scythe")).toBe(true);
    expect(toolBreaks("weeds", "wateringCan")).toBe(false);
  });

  it("suelta piedra, madera y a veces fibra", () => {
    expect(debrisDrops("twig")).toEqual(["388"]);
    expect(debrisDrops("stone", () => 0.9)).toEqual(["390", "390"]);
    expect(debrisDrops("weeds", () => 0.1)).toEqual(["771"]);
    expect(debrisDrops("weeds", () => 0.9)).toEqual([]);
  });

  it("rebota, se detiene y vuela hacia el granjero cercano", () => {
    const d = spawnDebris("(O)388", 2, 2, () => 0.5);
    let collected = false;
    for (let i = 0; i < 300 && !collected; i++) collected = stepDebris(d, { x: 2 * 64 + 100, y: 2 * 64 + 32 });
    expect(collected).toBe(true);
    const far = spawnDebris("(O)388", 0, 0, () => 0.5);
    for (let i = 0; i < 300; i++) expect(stepDebris(far, { x: 2000, y: 2000 })).toBe(false);
  });
});
