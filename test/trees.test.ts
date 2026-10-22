import { describe, expect, it } from "vitest";
import { hitTree, TreeMotion, type TreeEntity } from "../src/world/trees.ts";

const tree = (stage: number): TreeEntity => ({ kind: "tree", x: 1, y: 1, treeId: "1", stage, flipped: false });

describe("árboles", () => {
  it("un árbol maduro cae a los 10 hachazos y el tocón a los 5", () => {
    const t = tree(5);
    for (let i = 0; i < 9; i++) expect(hitTree(t, "axe").result).toBe("shake");
    expect(hitTree(t, "axe").result).toBe("fall");
    expect(t.stump).toBe(true);
    for (let i = 0; i < 4; i++) expect(hitTree(t, "axe").result).toBe("shake");
    expect(hitTree(t, "axe")).toEqual({ result: "destroyed", drops: [{ id: "388", count: 4 }] });
  });

  it("solo el hacha corta árboles grandes; los brotes salen con cualquier herramienta", () => {
    expect(hitTree(tree(5), "pickaxe").result).toBe("none");
    const young = tree(3);
    for (let i = 0; i < 4; i++) expect(hitTree(young, "axe").result).toBe("shake");
    expect(hitTree(young, "axe").result).toBe("destroyed");
    expect(hitTree(tree(2), "scythe").result).toBe("destroyed");
    expect(hitTree(tree(0), "scythe").result).toBe("none");
    expect(hitTree(tree(0), "hoe").result).toBe("destroyed");
  });

  it("la caída acelera hasta superar 90°", () => {
    const m = new TreeMotion();
    m.fall(false);
    let ticks = 0;
    while (m.tick(true) !== "fallen") ticks++;
    expect(ticks).toBeGreaterThan(30);
    expect(ticks).toBeLessThan(150);
  });
});
