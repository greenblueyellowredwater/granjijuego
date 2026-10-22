import { describe, expect, it } from "vitest";
import { extraInfoKeys, levelUpMenuHeight, parseLevelRequirement, professionChoices, recipesUnlockedAt } from "../src/world/levelup.ts";

describe("subida de nivel", () => {
  const recipes = {
    crafting: { Scarecrow: "388 50 382 1 771 20/Home/8/true/s Farming 1/", "Basic Fertilizer": "92 2/Field/368/false/s Farming 1/", "Wood Fence": "388 2/Field/322/false/default/" },
    cooking: { Salad: "20 1 22 1 419 1/10 10/196/f Emily 3/", "Fried Egg": "-5 1/10 10/194/default/", Stew: "1 1/1 1/200/s Farming 1/" },
  };

  it("recetas nuevas por habilidad y nivel", () => {
    expect(recipesUnlockedAt(0, 1, recipes)).toEqual([
      { name: "Scarecrow", cooking: false, output: "(BC)8", big: true, displayName: null },
      { name: "Basic Fertilizer", cooking: false, output: "(O)368", big: false, displayName: null },
      { name: "Stew", cooking: true, output: "(O)200", big: false, displayName: null },
    ]);
    expect(parseLevelRequirement("x/y/z/false/default/", false)).toBeNull();
  });

  it("profesiones a elegir", () => {
    expect(professionChoices(0, 5, [])).toEqual([0, 1]);
    expect(professionChoices(0, 10, [0])).toEqual([2, 3]);
    expect(professionChoices(0, 10, [1])).toEqual([4, 5]);
    expect(professionChoices(0, 3, [])).toBeNull();
  });

  it("texto extra y alto del menú", () => {
    expect(extraInfoKeys(2, 4)).toEqual(["LevelUp_ExtraInfo_Foraging1", "LevelUp_ExtraInfo_Foraging3"]);
    expect(levelUpMenuHeight(recipesUnlockedAt(0, 1, recipes), 2)).toBe(128 + 64 + 64 + 256 + 96);
  });
});

describe("recetas por defecto", async () => {
  const { learnDefaultRecipes, parseLevelRequirement } = await import("../src/world/levelup.ts");
  it("aprende las marcadas default y acepta el formato sin 's'", () => {
    const known = { craftingRecipes: [] as string[], cookingRecipes: [] as string[] };
    learnDefaultRecipes(known, { crafting: { Chest: "388 50/Home/130/true/default/", Torch: "388 1/Home/93/false/s Foraging 1/" }, cooking: { "Fried Egg": "-5 1/10 10/194/default/" } });
    expect(known).toEqual({ craftingRecipes: ["Chest"], cookingRecipes: ["Fried Egg"] });
    expect(parseLevelRequirement("a/b/c/false/Farming 2/", false)).toEqual({ skill: 0, level: 2 });
  });
});
