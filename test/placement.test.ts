import { describe, expect, it } from "vitest";
import { isPlaceableObject, maximumStack } from "../src/world/items.ts";
import { canApplyFertilizer, fertilizerQualityLevel, fertilizerSourceRect, fertilizerSpeedBoost, fertilizerWaterRetention } from "../src/world/farming.ts";

describe("colocación y fertilizante", () => {
  it("qué objetos se pueden colocar", () => {
    expect(isPlaceableObject({ Category: -8, Type: "Crafting", Edibility: -300 })).toBe(true);
    expect(isPlaceableObject({ Category: -19, Type: "Basic", Edibility: -300 })).toBe(true);
    expect(isPlaceableObject({ Category: -75, Type: "Basic", Edibility: 10 })).toBe(false);
    expect(isPlaceableObject({ Category: 0, Type: "Basic", ContextTags: ["placeable"] })).toBe(true);
  });

  it("pilas de objetos y grandes", () => {
    expect([maximumStack({ id: "(BC)130", stack: 1 }), maximumStack({ id: "(O)79", stack: 1 }), maximumStack({ id: "(T)Axe", stack: 1 }), maximumStack({ id: "(O)685", stack: 1 }, -22)]).toEqual([999, 1, 1, 1]);
  });

  it("efectos y sprite de fertilizantes", () => {
    expect([fertilizerQualityLevel("(O)368"), fertilizerQualityLevel("369"), fertilizerQualityLevel("(O)919"), fertilizerQualityLevel(undefined)]).toEqual([1, 2, 3, 0]);
    expect([fertilizerSpeedBoost("(O)465"), fertilizerWaterRetention("(O)371")]).toEqual([0.1, 0.66]);
    expect(fertilizerSourceRect("(O)368")).toEqual({ sx: 173, sy: 462, sw: 16, sh: 16 });
    expect(fertilizerSourceRect("(O)918")).toEqual({ sx: 205, sy: 494, sw: 16, sh: 16 });
  });

  it("reglas para aplicar fertilizante", () => {
    expect(canApplyFertilizer({}, "(O)368")).toBe(true);
    expect(canApplyFertilizer({ fertilizer: "(O)368" }, "(O)369")).toBe(false);
    expect(canApplyFertilizer({ crop: { phase: 1 } }, "(O)368")).toBe(false);
    expect(canApplyFertilizer({ crop: { phase: 1 } }, "(O)465")).toBe(true);
  });
});

describe("Speed-Gro", async () => {
  const { applySpeedIncreases, newCrop } = await import("../src/world/crops.ts");
  it("acorta fases como HoeDirt.applySpeedIncreases", () => {
    const data = { DaysInPhase: [1, 1, 1, 1], SpriteIndex: 0, HarvestItemId: "24", Seasons: ["spring"] } as never;
    const c = newCrop("472", data, false);
    applySpeedIncreases(c, data, 0.1, false);
    expect(c.phaseDays).toEqual([1, 0, 1, 1, 99999]);
    const cauliflower = { DaysInPhase: [1, 2, 4, 4, 1], SpriteIndex: 0, HarvestItemId: "190", Seasons: ["spring"] } as never;
    const d = newCrop("474", cauliflower, false);
    applySpeedIncreases(d, cauliflower, 0.25, true);
    expect(d.phaseDays.slice(0, -1).reduce((a: number, b: number) => a + b, 0)).toBe(12 - 5);
  });
});
