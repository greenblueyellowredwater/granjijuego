import { describe, expect, it } from "vitest";
import type { GsqContext, GsqState } from "../src/world/gsq.ts";
import { DotNetRandom } from "../src/world/dotnet-random.ts";
import { applyModification, applyModifiers, objectBasePrice, objectSalePrice, shopStock, type ShopData } from "../src/world/shops.ts";
import { shopLayout } from "../src/render/shop-menu.ts";

const base: GsqState = { season: "spring", dayOfMonth: 1, year: 1, daysPlayed: 1, uniqueId: 123456789, greenRainDays: [] };
const ctx = (state: Partial<GsqState> = {}): GsqContext => ({ state: { ...base, ...state }, random: new DotNetRandom(1) });
const objects = { "472": { Price: 10 }, "431": { Price: 100 }, "388": { Price: 2 }, "770": { Price: 10 } };

describe("tiendas", () => {
  it("aplica las cinco modificaciones", () => {
    expect([0, 1, 2, 3, 4, 9].map((m) => applyModification(10, m, 2))).toEqual([12, 8, 20, 5, 2, 10]);
  });

  it("combina modificadores según el modo", () => {
    const mods = [{ Modification: 2, Amount: 2 }, { Modification: 0, Amount: 5 }];
    expect(applyModifiers(10, mods, 0, ctx())).toBe(25);
    expect(applyModifiers(10, mods, 1, ctx())).toBe(15);
    expect(applyModifiers(10, mods, 2, ctx())).toBe(20);
    expect(applyModifiers(10, [{ Condition: "FALSE", Modification: 4, Amount: 1 }], 0, ctx())).toBe(10);
  });

  it("precio de venta del objeto: doble del base, recursos fijos por año", () => {
    expect(objectSalePrice("472", 10, 1)).toBe(20);
    expect(objectSalePrice("388", 2, 1)).toBe(10);
    expect(objectSalePrice("388", 2, 2)).toBe(50);
    expect(objectBasePrice(objects, "(O)431")).toBe(200);
    expect(objectBasePrice(objects, "(O)431", true)).toBe(100);
    expect(objectBasePrice(objects, "(T)Axe")).toBeNull();
  });

  it("filtra stock por condición y respeta IgnoreShopPriceModifiers", () => {
    const shop: ShopData = {
      PriceModifiers: [{ Modification: 2, Amount: 1.5 }],
      Items: [
        { ItemId: "(O)472" },
        { ItemId: "(O)431", Condition: "SEASON summer" },
        { ItemId: "(O)770", IgnoreShopPriceModifiers: true, AvailableStock: 5 },
        { ItemId: "(O)388", Price: 7, PriceModifiers: [{ Modification: 0, Amount: 1 }] },
        { ItemId: "RANDOM_ITEMS (O)" },
      ],
    };
    const price = (id: string, useObjectData: boolean) => objectBasePrice(objects, id, useObjectData);
    expect(shopStock(shop, price, ctx())).toEqual([
      { id: "(O)472", price: 30, stock: Infinity },
      { id: "(O)770", price: 20, stock: 5 },
      { id: "(O)388", price: 11, stock: Infinity },
    ]);
    expect(shopStock(shop, price, ctx({ season: "summer" })).map((e) => e.id)).toContain("(O)431");
  });

  it("layout del menú centrado a 1280x720", () => {
    const l = shopLayout(1280, 720);
    expect([l.x, l.y, l.width, l.height]).toEqual([100, 20, 1080, 680]);
    expect(l.rows.map((r) => r.y)).toEqual([36, 142, 248, 354]);
  });
});

describe("mejoras de herramientas", async () => {
  const { toolUpgrades } = await import("../src/world/shops.ts");
  it("ofrece la mejora convencional con precio y barras por nivel", () => {
    const tools = { CopperAxe: { ConventionalUpgradeFrom: "(T)Axe", UpgradeLevel: 1 }, SteelAxe: { ConventionalUpgradeFrom: "(T)CopperAxe", UpgradeLevel: 2 }, CopperTrashCan: { UpgradeFrom: [{ Condition: "FALSE", Price: -1, TradeItemId: "(O)334", TradeItemAmount: 5 }] } };
    expect(toolUpgrades(tools, (q) => q === "(T)Axe", () => false)).toEqual([{ id: "(T)CopperAxe", price: 2000, stock: 1, trade: { id: "(O)334", count: 5 }, requireTool: "(T)Axe" }]);
    expect(toolUpgrades(tools, (q) => q === "(T)CopperAxe", () => false)[0]).toMatchObject({ id: "(T)SteelAxe", price: 5000, trade: { id: "(O)335" } });
  });
});
