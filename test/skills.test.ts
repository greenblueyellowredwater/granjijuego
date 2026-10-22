import { describe, expect, it } from "vitest";
import { checkForLevelGain, farmerTitleKey, gainExperience, harvestExperience, levelForExperience } from "../src/world/skills.ts";
import { numberSpriteQuads, skillPip } from "../src/render/skills-page.ts";

describe("habilidades", () => {
  it("umbrales de nivel del original", () => {
    expect([99, 100, 379, 380, 15000].map(levelForExperience)).toEqual([0, 1, 1, 2, 10]);
    expect(checkForLevelGain(90, 400)).toBe(2);
    expect(checkForLevelGain(100, 120)).toBe(-1);
  });

  it("acumula niveles nuevos", () => {
    const s = { experience: [90, 0, 0, 0, 0, 0], newLevels: [] as [number, number][] };
    gainExperience(s, 0, 300);
    expect(s.newLevels).toEqual([[0, 1], [0, 2]]);
    gainExperience(s, 5, 100);
    expect(s.experience[5]).toBe(0);
  });

  it("experiencia de cosecha", () => {
    expect([35, 80, 120, 750].map(harvestExperience)).toEqual([8, 14, 18, 43]);
  });

  it("títulos por nivel del granjero", () => {
    expect(farmerTitleKey([0, 0, 0, 0, 0, 0], true)).toBe("Farmer.cs.2032");
    expect(farmerTitleKey([5, 1, 3, 0, 10, 0], true)).toBe("Farmer.cs.2028");
    expect(farmerTitleKey([10, 10, 10, 10, 10, 10], true)).toBe("Farmer.cs.2016");
    expect(farmerTitleKey([10, 10, 10, 4, 0, 0], false)).toBe("Farmer.cs.2024");
  });

  it("barras y números", () => {
    expect([skillPip(5, 4), skillPip(4, 4), skillPip(5, 0), skillPip(0, 0)]).toEqual([{ sx: 159, w: 14, alpha: 1 }, { sx: 145, w: 14, alpha: 0.65 }, { sx: 137, w: 8, alpha: 1 }, { sx: 129, w: 8, alpha: 0.65 }]);
    expect(numberSpriteQuads(10, 100, 100).map((q) => [q.sx, q.sy, q.x])).toEqual([[512, 128, 84], [520, 128, 56]]);
  });
});
