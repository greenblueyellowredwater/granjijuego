import { UiBatch } from "./ui-batch.ts";
import { drawItemInMenu, MENU_TEXTURE } from "./toolbar.ts";
import { layoutSpriteText, SPRITE_TEXT_TEXTURE, SPRITE_TEXT_ZOOM, widthOfString } from "./spritetext.ts";
import { moneyDigits } from "./hud-layout.ts";
import type { Item, ItemData } from "../world/items.ts";
import type { StockEntry } from "../world/shops.ts";

const CURSORS = "LooseSprites/Cursors";
const BORDER = 40;
const WHEAT = 0xf5deb3;

export function shopLayout(uiWidth: number, uiHeight: number) {
  const width = 1000 + BORDER * 2, height = 600 + BORDER * 2;
  const x = Math.trunc(uiWidth / 2) - Math.trunc(width / 2);
  const y = Math.trunc(uiHeight / 2) - Math.trunc((600 + BORDER * 2) / 2);
  const rowH = Math.trunc((height - 256) / 4);
  const rows = [0, 1, 2, 3].map((i) => ({ x: x + 16, y: y + 16 + i * rowH, w: width - 32, h: rowH + 4 }));
  const invW = 12 * 64, invH = 3 * 64 + 2 * 4;
  const inv = { x: x + width - invW - 32, y: y + 96 + BORDER + 320 + 40, w: invW, h: invH };
  return { x, y, width, height, rows, inv, up: { x: x + width + 16, y: y + 16 }, down: { x: x + width + 16, y: y + height - 64 }, close: { x: x + width - 36, y: y - 8 } };
}

export class ShopMenu {
  private readonly batch: UiBatch;
  stock: StockEntry[] = [];
  scroll = 0;
  open = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.batch = new UiBatch(scene, depth);
  }

  show(stock: StockEntry[]) {
    this.stock = stock;
    this.scroll = 0;
    this.open = true;
  }

  close() {
    this.open = false;
  }

  private text(text: string, x: number, y: number, alpha = 1) {
    for (const g of layoutSpriteText(text, 999999).glyphs) this.batch.draw({ texture: SPRITE_TEXT_TEXTURE, sx: g.sx, sy: g.sy, sw: 8, sh: 16, x: x + g.x, y: y + g.y, scaleX: SPRITE_TEXT_ZOOM, alpha });
  }

  hit(uiWidth: number, uiHeight: number, px: number, py: number) {
    const l = shopLayout(uiWidth, uiHeight);
    const inside = (r: { x: number; y: number; w: number; h: number }) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
    if (inside({ x: l.close.x, y: l.close.y, w: 48, h: 48 })) return { kind: "close" as const };
    if (inside({ x: l.up.x, y: l.up.y, w: 44, h: 48 })) return { kind: "up" as const };
    if (inside({ x: l.down.x, y: l.down.y, w: 44, h: 48 })) return { kind: "down" as const };
    const row = l.rows.findIndex(inside);
    if (row >= 0 && this.scroll + row < this.stock.length) return { kind: "buy" as const, index: this.scroll + row };
    if (inside(l.inv)) {
      const col = Math.floor((px - l.inv.x) / 64), r = Math.floor((py - l.inv.y) / 68);
      return { kind: "sell" as const, slot: r * 12 + col };
    }
    return null;
  }

  scrollBy(delta: number) {
    this.scroll = Math.max(0, Math.min(Math.max(0, this.stock.length - 4), this.scroll + delta));
  }

  draw(uiWidth: number, uiHeight: number, names: (id: string) => string, money: number, inventory: (Item | null)[], data: ItemData, hover: { x: number; y: number }) {
    const b = this.batch;
    b.begin();
    if (this.open) {
      const l = shopLayout(uiWidth, uiHeight);
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 0.75);
      b.textureBox(CURSORS, [384, 373, 18, 18], l.x + l.width - l.inv.w - 32 - 24, l.y + l.height - 256 + 40, l.inv.w + 56, l.height - 448 + 20, 1, 4);
      b.textureBox(CURSORS, [384, 373, 18, 18], l.x, l.y, l.width, l.height - 256 + 32 + 4, 1, 4);
      b.draw({ texture: CURSORS, sx: 340, sy: 472, sw: 65, sh: 17, x: l.x - 36 + 28, y: l.y + l.height - l.inv.h - 12, scaleX: 4 });
      for (const { index, digit } of moneyDigits(money)) b.draw({ texture: CURSORS, sx: 286, sy: 502 - digit * 8, sw: 5, sh: 8, x: l.x - 36 + 68 + index * 24, y: l.y + l.height - l.inv.h - 12 + 24, scaleX: 4, tint: 0x800000 });
      l.rows.forEach((r, i) => {
        const entry = this.stock[this.scroll + i];
        if (!entry) return;
        const hovered = hover.x >= r.x && hover.x < r.x + r.w && hover.y >= r.y && hover.y < r.y + r.h;
        b.textureBox(CURSORS, [384, 396, 15, 15], r.x, r.y, r.w, r.h, 1, 4);
        if (hovered) b.textureBox(CURSORS, [384, 396, 15, 15], r.x, r.y, r.w, r.h, 1, 4);
        if (hovered) b.stretch("__WHITE", [0, 0, 1, 1], r.x + 8, r.y + 8, r.w - 16, r.h - 16, WHEAT, 0.35);
        b.draw({ texture: CURSORS, sx: 296, sy: 363, sw: 18, sh: 18, x: r.x + 32 - 12, y: r.y + 24 - 4, scaleX: 4 });
        drawItemInMenu(b, { id: entry.id, stack: 1 }, r.x + 32 - 8, r.y + 24, 1, 1, data);
        const affordable = money >= entry.price;
        this.text(names(entry.id), r.x + 96 + 8, r.y + 28);
        const priceText = `${entry.price} `;
        this.text(priceText, r.x + r.w - widthOfString(priceText) - 60, r.y + 28, affordable ? 1 : 0.5);
        b.draw({ texture: CURSORS, sx: 193, sy: 373, sw: 9, sh: 10, x: r.x + r.w - 52, y: r.y + 40 - 4, scaleX: 4, alpha: affordable ? 1 : 0.25 });
      });
      b.draw({ texture: CURSORS, sx: 421, sy: 459, sw: 11, sh: 12, x: l.up.x, y: l.up.y, scaleX: 4 });
      b.draw({ texture: CURSORS, sx: 421, sy: 472, sw: 11, sh: 12, x: l.down.x, y: l.down.y, scaleX: 4 });
      b.draw({ texture: CURSORS, sx: 337, sy: 494, sw: 12, sh: 12, x: l.close.x, y: l.close.y, scaleX: 4 });
      for (let i = 0; i < 36; i++) {
        const sx = l.inv.x + (i % 12) * 64, sy = l.inv.y + Math.floor(i / 12) * 68;
        b.draw({ texture: MENU_TEXTURE, sx: 128, sy: 128, sw: 64, sh: 64, x: sx, y: sy, alpha: i < inventory.length ? 1 : 0.5 });
        const item = inventory[i];
        if (item) drawItemInMenu(b, item, sx, sy, 1, 1, data);
      }
    }
    b.end();
  }
}
