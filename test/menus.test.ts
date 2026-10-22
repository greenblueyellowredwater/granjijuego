import { describe, expect, it } from "vitest";
import { inventorySlotAt, inventorySlotPosition } from "../src/render/menu-parts.ts";
import { gameMenuLayout } from "../src/render/game-menu.ts";
import { earn, newGameState } from "../src/world/state.ts";

describe("menús", () => {
  it("posiciones de casillas de InventoryMenu", () => {
    expect([0, 12, 24].map((i) => inventorySlotPosition(i, 0, 0, true).y)).toEqual([-16, 64, 132]);
    expect([0, 12, 24].map((i) => inventorySlotPosition(i, 0, 0, false).y)).toEqual([-4, 64, 132]);
    expect(inventorySlotPosition(13, 10, 0, true).x).toBe(74);
    expect(inventorySlotAt(74 + 5, 64 + 5, 10, 0, true)).toBe(13);
    expect(inventorySlotAt(5, 60, 0, 0, true)).toBe(-1);
  });

  it("layout del GameMenu a 1280x800", () => {
    const l = gameMenuLayout(1280, 800);
    expect([l.x, l.y, l.width, l.height]).toEqual([200, 60, 880, 680]);
    expect(l.inventory).toEqual({ x: 256, y: 196 });
    expect(l.tabs[0]).toEqual({ name: "inventory", x: 264, y: 76 });
    expect(l.trash).toEqual({ x: 1101, y: 452 });
    expect(l.equipment.hat).toEqual({ x: 456, y: 444 });
  });

  it("las ganancias totales solo suman ingresos", () => {
    const s = newGameState(() => 0.5);
    earn(s, 120);
    earn(s, -50);
    expect([s.money, s.totalEarned]).toEqual([570, 120]);
  });
});

describe("tooltips", async () => {
  const { parseText, staminaRecovered, healthRecovered, tooltipLayout, categoryNameKey, categoryColor } = await import("../src/render/tooltip.ts");
  const mono = { measure: (t: string) => ({ width: t.length * 10, height: (t.split("\n").length) * 20 }) };

  it("parte el texto por palabras como Game1.parseText", () => {
    expect(parseText("aa bb cc", mono, 55)).toBe("aa bb \ncc ");
  });

  it("energía y salud al comer", () => {
    expect([staminaRecovered(10, 0), healthRecovered(10, 0)]).toEqual([25, 11]);
    expect([staminaRecovered(10, 2), healthRecovered(10, 2)]).toEqual([45, 20]);
    expect(healthRecovered(-20, 0)).toBe(0);
  });

  it("categorías", () => {
    expect([categoryNameKey(-75), categoryColor(-75)]).toEqual(["Object.cs.12851", 0x008000]);
    expect(categoryNameKey(-999)).toBeNull();
  });

  it("tamaño y reubicación en pantalla", () => {
    const c = { title: "Parsnip", text: "abc", category: "Vegetable", categoryColor: 0, edibility: null, quality: 0 };
    const l = tooltipLayout(c, mono, mono, { x: 100, y: 100 }, 0, { w: 1280, h: 800 }, { energy: "{0} Energy", health: "{0} Health" });
    expect(l).toEqual({ x: 132, y: 132, w: 122 + 4, h: 32 + 20 + 36 + 20 });
    const edge = tooltipLayout(c, mono, mono, { x: 1250, y: 790 }, 0, { w: 1280, h: 800 }, { energy: "{0} Energy", health: "{0} Health" });
    expect([edge.x, edge.y]).toEqual([1280 - 122, 800 - 108]);
  });
});
