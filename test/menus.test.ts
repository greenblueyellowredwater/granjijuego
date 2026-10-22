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
