import { UiBatch } from "./ui-batch.ts";
import { drawInventoryGrid, drawMenuBox, inventorySlotAt } from "./menu-parts.ts";
import { drawTooltip, type TooltipContent, type TooltipFonts } from "./tooltip.ts";
import type { Item, ItemData } from "../world/items.ts";

const CURSORS = "LooseSprites/Cursors";

export function chestLayout(uiWidth: number, uiHeight: number) {
  const width = 880, height = 680;
  const x = Math.max(0, Math.trunc(uiWidth / 2) - Math.trunc(width / 2));
  const y = Math.max(136, Math.trunc(uiHeight / 2) - Math.trunc(height / 2) + 64);
  const chest = { x: x + 32, y, w: 768, h: 208 };
  return {
    x,
    y,
    width,
    height,
    chest,
    chestBox: { x: chest.x - 56, y: chest.y - 136, w: chest.w + 112, h: chest.h + 176 },
    playerBox: { x: x - 20, y: y + 200, w: width, h: height - 328 },
    inventory: { x: x + 16 + 20, y: y + 96 + 40 + 192 - 16 },
    ok: { x: x + width + 4, y: y + height - 192 - 40 },
    trash: { x: x + width + 4, y: y + height - 192 - 32 - 40 - 104 },
    colorToggle: { x: x + width, y: y + Math.trunc(height / 3) - 64 - 160 },
  };
}

export class ChestMenu {
  private readonly batch: UiBatch;
  items: (Item | null)[] | null = null;

  constructor(scene: Phaser.Scene, depth: number) {
    this.batch = new UiBatch(scene, depth);
  }

  get open() {
    return this.items !== null;
  }

  hit(uiWidth: number, uiHeight: number, px: number, py: number) {
    const l = chestLayout(uiWidth, uiHeight);
    if (px >= l.ok.x && px < l.ok.x + 64 && py >= l.ok.y && py < l.ok.y + 64) return { kind: "close" as const };
    const chestSlot = inventorySlotAt(px, py, l.chest.x, l.chest.y, false);
    if (chestSlot >= 0) return { kind: "chest" as const, slot: chestSlot };
    const slot = inventorySlotAt(px, py, l.inventory.x, l.inventory.y, false);
    if (slot >= 0) return { kind: "player" as const, slot };
    return null;
  }

  hovered(uiWidth: number, uiHeight: number, px: number, py: number, inventory: (Item | null)[]) {
    if (!this.items) return null;
    const l = chestLayout(uiWidth, uiHeight);
    const c = inventorySlotAt(px, py, l.chest.x, l.chest.y, false);
    if (c >= 0) return this.items[c] ?? null;
    const p = inventorySlotAt(px, py, l.inventory.x, l.inventory.y, false);
    return p >= 0 ? (inventory[p] ?? null) : null;
  }

  draw(uiWidth: number, uiHeight: number, inventory: (Item | null)[], maxItems: number, data: ItemData, mouse: { x: number; y: number }, tooltip: TooltipContent | null, fonts: TooltipFonts | null, energy: { energy: string; health: string }) {
    const b = this.batch;
    b.begin();
    if (this.items) {
      const l = chestLayout(uiWidth, uiHeight);
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 0.5);
      drawMenuBox(b, l.playerBox.x, l.playerBox.y, l.playerBox.w, l.playerBox.h);
      b.draw({ texture: CURSORS, sx: 128, sy: 256, sw: 64, sh: 64, x: l.ok.x, y: l.ok.y });
      drawInventoryGrid(b, l.inventory.x, l.inventory.y, inventory, data, { playerInventory: false, showGrayedOutSlots: true, maxItems, currentToolIndex: -1, tinyFont: null });
      const mid = l.y + Math.trunc(l.height / 2) + 64;
      b.draw({ texture: CURSORS, sx: 16, sy: 368, sw: 12, sh: 16, x: l.x - 64, y: mid + 16, scaleX: 4, rotation: 4.712389 });
      b.draw({ texture: CURSORS, sx: 21, sy: 368, sw: 11, sh: 16, x: l.x - 64, y: mid - 16, scaleX: 4, rotation: 4.712389 });
      b.draw({ texture: CURSORS, sx: 4, sy: 372, sw: 8, sh: 11, x: l.x - 40, y: mid - 44, scaleX: 4 });
      drawMenuBox(b, l.chestBox.x, l.chestBox.y, l.chestBox.w, l.chestBox.h);
      b.draw({ texture: CURSORS, sx: 16, sy: 368, sw: 12, sh: 16, x: l.chest.x - 100, y: l.y + 64 + 16, scaleX: 4, rotation: 4.712389 });
      b.draw({ texture: CURSORS, sx: 21, sy: 368, sw: 11, sh: 16, x: l.chest.x - 100, y: l.y + 64 - 16, scaleX: 4, rotation: 4.712389 });
      b.draw({ texture: CURSORS, sx: 127, sy: 412, sw: 10, sh: 11, x: l.chest.x - 80, y: l.y + 64 - 44, scaleX: 4 });
      drawInventoryGrid(b, l.chest.x, l.chest.y, this.items, data, { playerInventory: false, showGrayedOutSlots: false, maxItems: 36, currentToolIndex: -1, tinyFont: null });
      b.draw({ texture: CURSORS, sx: 119, sy: 469, sw: 16, sh: 16, x: l.colorToggle.x, y: l.colorToggle.y, scaleX: 4 });
      b.draw({ texture: CURSORS, sx: 564, sy: 102, sw: 18, sh: 26, x: l.trash.x, y: l.trash.y, scaleX: 4 });
      b.draw({ texture: CURSORS, sx: 564, sy: 129, sw: 18, sh: 10, x: l.trash.x + 60, y: l.trash.y + 40, originX: 16 / 18, originY: 1, scaleX: 4 });
      if (tooltip && fonts) drawTooltip(b, fonts, tooltip, mouse, 0, { w: uiWidth, h: uiHeight }, energy);
    }
    b.end();
  }
}
