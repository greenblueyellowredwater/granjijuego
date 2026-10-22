import type { UiBatch } from "./ui-batch.ts";
import type { SpriteFont } from "./spritefont.ts";
import { MENU_TEXTURE, TINY_FONT, drawItemInMenu } from "./toolbar.ts";
import type { Item, ItemData } from "../world/items.ts";

export const TEXT_COLOR = 0x221122;
export const TEXT_SHADOW_COLOR = 0xdd9454;
const DIM_GRAY = 0x696969;
const RED = 0xff0000;
const SLOT_TEXT = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

export const menuTile = (index: number) => ({ sx: (index * 64) % 256, sy: Math.floor((index * 64) / 256) * 64, sw: 64, sh: 64 });

export function drawMenuBox(b: UiBatch, x: number, y: number, w: number, h: number) {
  b.stretch(MENU_TEXTURE, [64, 128, 64, 64], x + 28, y + 92, w - 64, h - 128);
  b.draw({ texture: MENU_TEXTURE, sx: 0, sy: 0, sw: 64, sh: 64, x, y: y + 64 });
  b.draw({ texture: MENU_TEXTURE, sx: 192, sy: 0, sw: 64, sh: 64, x: x + w - 64, y: y + 64 });
  b.draw({ texture: MENU_TEXTURE, sx: 192, sy: 192, sw: 64, sh: 64, x: x + w - 64, y: y + h - 64 });
  b.draw({ texture: MENU_TEXTURE, sx: 0, sy: 192, sw: 64, sh: 64, x, y: y + h - 64 });
  b.stretch(MENU_TEXTURE, [128, 0, 64, 64], x + 64, y + 64, w - 128, 64);
  b.stretch(MENU_TEXTURE, [128, 192, 64, 64], x + 64, y + h - 64, w - 128, 64);
  b.stretch(MENU_TEXTURE, [0, 128, 64, 64], x, y + 128, 64, h - 192);
  b.stretch(MENU_TEXTURE, [192, 128, 64, 64], x + w - 64, y + 128, 64, h - 192);
}

export function drawHorizontalPartition(b: UiBatch, x: number, w: number, y: number) {
  b.draw({ texture: MENU_TEXTURE, ...menuTile(4), x, y });
  b.stretch(MENU_TEXTURE, [menuTile(6).sx, menuTile(6).sy, 64, 64], x + 64, y, w - 128, 64);
  b.draw({ texture: MENU_TEXTURE, ...menuTile(7), x: x + w - 64, y });
}

export function drawShadowText(b: UiBatch, font: SpriteFont, texture: string, text: string, x: number, y: number, color = TEXT_COLOR, alpha = 1) {
  const quads = font.layout(text);
  const pass = (dx: number, dy: number, tint: number, a: number) => {
    for (const q of quads) b.draw({ texture, sx: q.sx, sy: q.sy, sw: q.sw, sh: q.sh, x: x + q.x + dx, y: y + q.y + dy, tint, alpha: a });
  };
  pass(-3, 3, TEXT_SHADOW_COLOR, alpha);
  pass(0, 3, TEXT_SHADOW_COLOR, alpha);
  pass(0, 0, color, alpha);
}

export function inventorySlotPosition(i: number, x: number, y: number, playerInventory: boolean, perRow = 12) {
  const col = i % perRow, row = Math.floor(i / perRow);
  return { x: x + col * 64, y: y + row * 64 + (row - 1) * 4 - (row === 0 && playerInventory ? 12 : 0) };
}

export function inventorySlotAt(px: number, py: number, x: number, y: number, playerInventory: boolean, capacity = 36) {
  for (let i = 0; i < capacity; i++) {
    const p = inventorySlotPosition(i, x, y, playerInventory);
    if (px >= p.x && px < p.x + 64 && py >= p.y && py < p.y + 64) return i;
  }
  return -1;
}

export interface GridOptions {
  playerInventory: boolean;
  showGrayedOutSlots: boolean;
  maxItems: number;
  currentToolIndex: number;
  tinyFont: SpriteFont | null;
  highlight?: (item: Item) => boolean;
}

export function drawInventoryGrid(b: UiBatch, x: number, y: number, items: (Item | null)[], data: ItemData, o: GridOptions, capacity = 36) {
  for (let i = 0; i < capacity; i++) {
    const p = inventorySlotPosition(i, x, y, o.playerInventory);
    b.draw({ texture: MENU_TEXTURE, ...menuTile(10), x: p.x, y: p.y });
    if ((o.playerInventory || o.showGrayedOutSlots) && i >= o.maxItems) b.draw({ texture: MENU_TEXTURE, ...menuTile(57), x: p.x, y: p.y, alpha: 0.5 });
    if (o.tinyFont && i < 12 && o.playerInventory) {
      const text = SLOT_TEXT[i];
      const m = o.tinyFont.measure(text);
      for (const q of o.tinyFont.layout(text)) b.draw({ texture: TINY_FONT, sx: q.sx, sy: q.sy, sw: q.sw, sh: q.sh, x: p.x + 32 - m.width / 2 + q.x, y: p.y - m.height + q.y, tint: i === o.currentToolIndex ? RED : DIM_GRAY });
    }
  }
  for (let i = 0; i < capacity; i++) {
    const item = items[i];
    if (!item) continue;
    const p = inventorySlotPosition(i, x, y, o.playerInventory);
    drawItemInMenu(b, item, p.x, p.y, 1, !o.highlight || o.highlight(item) ? 1 : 0.25, data);
  }
}
