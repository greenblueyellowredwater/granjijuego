import { describe, expect, it } from "vitest";
import { addItem, consumeOne, itemSprite, startingInventory, tinyDigits, type ItemData } from "../src/world/items.ts";
import { toolbarLayout } from "../src/render/toolbar.ts";

const data: ItemData = {
  tools: { Hoe: { Texture: "TileSheets\\tools", SpriteIndex: 21, MenuSpriteIndex: 47 } },
  weapons: { "47": { Texture: "TileSheets/weapons", SpriteIndex: 47 } },
  objects: { "472": { SpriteIndex: 472 } },
  textureWidths: { "TileSheets/tools": 336, "TileSheets/weapons": 128, "Maps/springobjects": 384 },
};

describe("inventario", () => {
  it("arranca con las herramientas del original", () => {
    expect(startingInventory().slice(0, 6).map((i) => i?.id ?? null)).toEqual(["(T)Axe", "(T)Hoe", "(T)WateringCan", "(T)Pickaxe", "(W)47", null]);
  });

  it("apila objetos hasta 999 y usa huecos libres", () => {
    const slots = startingInventory();
    expect(addItem(slots, { id: "(O)472", stack: 15 })).toBeNull();
    expect(slots[5]).toEqual({ id: "(O)472", stack: 15 });
    addItem(slots, { id: "(O)472", stack: 990 });
    expect(slots[5]!.stack).toBe(999);
    expect(slots[6]!.stack).toBe(6);
    consumeOne(slots, 6);
    expect(slots[6]!.stack).toBe(5);
    const full = Array(2).fill(null);
    expect(addItem(full, { id: "(T)Hoe", stack: 3 })).toEqual({ id: "(T)Hoe", stack: 1 });
  });

  it("resuelve sprites de menú", () => {
    expect(itemSprite({ id: "(T)Hoe", stack: 1 }, data)).toEqual({ texture: "TileSheets/tools", sx: 47 * 16 % 336, sy: Math.floor((47 * 16) / 336) * 16, sw: 16, sh: 16 });
    expect(itemSprite({ id: "(W)47", stack: 1 }, data)).toEqual({ texture: "TileSheets/weapons", sx: 112, sy: 80, sw: 16, sh: 16 });
    expect(itemSprite({ id: "(O)472", stack: 1 }, data)).toEqual({ texture: "Maps/springobjects", sx: 128, sy: 304, sw: 16, sh: 16 });
  });

  it("dibuja dígitos chicos sin ceros a la izquierda", () => {
    expect(tinyDigits(105, 3)).toEqual({ width: 45, glyphs: [{ sx: 373, x: 0 }, { sx: 368, x: 14 }, { sx: 393, x: 28 }] });
  });
});

describe("toolbar", () => {
  it("va abajo salvo que el jugador esté en la mitad inferior", () => {
    const bottom = toolbarLayout(1280, 800, 300, 800);
    expect(bottom.box).toEqual({ x: 240, y: 696, w: 800, h: 96 });
    expect(bottom.slots[0]).toEqual({ x: 256, y: 712 });
    expect(bottom.slots[11]).toEqual({ x: 256 + 11 * 64, y: 712 });
    expect(toolbarLayout(1280, 800, 500, 800).box.y).toBe(8);
  });
});
