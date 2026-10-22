import { describe, expect, it } from "vitest";
import { consolidateStacks, shippingCategory, summarizeShipping } from "../src/world/shipping.ts";
import { sellPrice } from "../src/world/buildings.ts";

describe("resumen de envíos", () => {
  it("categorías del original", () => {
    expect(shippingCategory({ id: "(O)24", stack: 1 }, -75)).toBe(0);
    expect(shippingCategory({ id: "(O)16", stack: 1 }, -81)).toBe(1);
    expect(shippingCategory({ id: "(O)296", stack: 1 }, -79)).toBe(1);
    expect(shippingCategory({ id: "(O)145", stack: 1 }, -4)).toBe(2);
    expect(shippingCategory({ id: "(O)378", stack: 1 }, -15)).toBe(3);
    expect(shippingCategory({ id: "(O)390", stack: 1 }, -16)).toBe(4);
    expect(shippingCategory({ id: "(O)472", stack: 1 }, -74)).toBe(4);
  });

  it("agrupa pilas iguales y totaliza", () => {
    expect(consolidateStacks([{ id: "(O)24", stack: 2 }, { id: "(O)24", stack: 3 }, { id: "(O)24", stack: 1, quality: 1 }])).toEqual([{ id: "(O)24", stack: 5 }, { id: "(O)24", stack: 1, quality: 1 }]);
    const prices: Record<string, number> = { "24": 35, "16": 50, "390": 2 };
    const cats: Record<string, number> = { "24": -75, "16": -81, "390": -16 };
    const s = summarizeShipping([{ id: "(O)24", stack: 10, quality: 0 }, { id: "(O)16", stack: 3 }, { id: "(O)390", stack: 20 }, { id: "(O)24", stack: 5, quality: 1 }], (it) => cats[it.id.slice(3)], (it) => sellPrice(prices[it.id.slice(3)], it.quality ?? 0));
    expect(s.totals).toEqual([565, 150, 0, 0, 40, 755]);
    expect(s.items[5].length).toBe(4);
  });
});
