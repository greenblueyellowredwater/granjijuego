import { describe, expect, it } from "vitest";
import { canCraft, consumeIngredients, countIngredient, layoutRecipes, parseRecipe } from "../src/world/crafting.ts";

const objects = { "388": { SpriteIndex: 388, Category: -16 }, "390": { SpriteIndex: 390, Category: -16 }, "145": { SpriteIndex: 145, Category: -4 }, "137": { SpriteIndex: 137, Category: -4 } };

describe("artesanía", () => {
  it("parsea recetas de artesanía y cocina", () => {
    expect(parseRecipe("Scarecrow", "388 50 382 1 771 20/Home/8/true/s Farming 1/", false)).toEqual({
      name: "Scarecrow", cooking: false, ingredients: [{ key: "388", count: 50 }, { key: "382", count: 1 }, { key: "771", count: 20 }], output: "(BC)8", produced: 1, big: true, displayName: null,
    });
    expect(parseRecipe("Torch", "388 1 92 2/Home/93/false/l 1/", false).output).toBe("(O)93");
    expect(parseRecipe("Maki Roll", "-4 1 153 1 423 1/1 10/228/s Fishing 2/", true)).toMatchObject({ output: "(O)228", ingredients: [{ key: "-4", count: 1 }, { key: "153", count: 1 }, { key: "423", count: 1 }] });
    expect(parseRecipe("Basic Fertilizer", "92 2/Field/368 2/false/s Farming 1/", false).produced).toBe(2);
  });

  it("cuenta y consume ingredientes, incluidas categorías", () => {
    const inv = [{ id: "(O)388", stack: 3 }, null, { id: "(O)388", stack: 5 }, { id: "(O)145", stack: 1 }, { id: "(O)137", stack: 2 }];
    expect(countIngredient(inv, "388", objects)).toBe(8);
    expect(countIngredient(inv, "-4", objects)).toBe(3);
    const r = parseRecipe("X", "388 4 -4 2/Home/1/false/default/", false);
    expect(canCraft(r, inv, objects)).toBe(true);
    consumeIngredients(r, inv, objects);
    expect(inv).toEqual([null, null, { id: "(O)388", stack: 4 }, null, { id: "(O)137", stack: 1 }]);
    expect(canCraft(parseRecipe("Y", "388 5/Home/1/false/default/", false), inv, objects)).toBe(false);
  });

  it("acomoda recetas en grilla de 10×4 con grandes de dos filas", () => {
    const small = (n: string) => parseRecipe(n, "388 1/Home/1/false/default/", false);
    const big = (n: string) => parseRecipe(n, "388 1/Home/1/true/default/", false);
    const slots = layoutRecipes([small("a"), big("B"), ...Array.from({ length: 9 }, (_, i) => small(`s${i}`))]);
    expect(slots.map((s) => [s.recipe.name, s.col, s.row])).toEqual([
      ["a", 0, 0], ["B", 1, 0], ["s0", 2, 0], ["s1", 3, 0], ["s2", 4, 0], ["s3", 5, 0], ["s4", 6, 0], ["s5", 7, 0], ["s6", 8, 0], ["s7", 9, 0], ["s8", 0, 1],
    ]);
    const many = layoutRecipes(Array.from({ length: 41 }, (_, i) => small(`r${i}`)));
    expect([many[39].page, many[40].page, many[40].col, many[40].row]).toEqual([0, 1, 0, 0]);
  });
});
