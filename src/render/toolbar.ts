import { SpriteFont, type SpriteFontData } from "./spritefont.ts";
import { UiBatch } from "./ui-batch.ts";
import { itemSprite, maximumStack, parseId, tinyDigits, type Item, type ItemData } from "../world/items.ts";

export const MENU_TEXTURE = "Maps/MenuTiles";
export const TINY_FONT = "Fonts/tinyFont";
const CURSORS = "LooseSprites/Cursors";
const SHADOW = "LooseSprites/shadow";
const SLOT_TEXT = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
const DIM_GRAY = 0x696969;

export function toolbarLayout(uiWidth: number, uiHeight: number, playerScreenY: number, viewportHeight: number) {
  const alignTop = playerScreenY > viewportHeight / 2 + 64;
  const y = alignTop ? 112 : uiHeight;
  const left = Math.trunc(uiWidth / 2) - 384;
  return {
    alignTop,
    box: { x: left - 16, y: y - 96 - 8, w: 800, h: 96 },
    slots: SLOT_TEXT.map((_, i) => ({ x: left + i * 64, y: y - 96 + 8 })),
  };
}

const menuTile = (index: number) => ({ sx: (index * 64) % 256, sy: Math.floor((index * 64) / 256) * 64, sw: 64, sh: 64 });

export function drawItemInMenu(batch: UiBatch, item: Item, x: number, y: number, scaleSize: number, transparency: number, data: ItemData) {
  const sprite = itemSprite(item, data);
  if (!sprite) return;
  const { type } = parseId(item.id);
  if (type === "O") batch.draw({ texture: SHADOW, sx: 0, sy: 0, sw: 12, sh: 7, x: x + 32, y: y + 48, originX: 6 / 12, originY: 3 / 7, scaleX: 3, alpha: 0.5 * transparency });
  const overlay = item.color && type === "O" && (data.objects[parseId(item.id).id] as { ColorOverlayFromNextIndex?: boolean } | undefined)?.ColorOverlayFromNextIndex;
  const tint = item.color ? (item.color[0] << 16) | (item.color[1] << 8) | item.color[2] : 0xffffff;
  batch.draw({ ...sprite, x: x + 32, y: y + 32, originX: 0.5, originY: 0.5, scaleX: 4 * scaleSize, alpha: transparency, tint: item.color && !overlay ? tint : 0xffffff });
  if (overlay) {
    const width = data.textureWidths[sprite.texture] ?? 384;
    const next = { ...sprite, sx: (sprite.sx + 16) % width, sy: sprite.sy + (sprite.sx + 16 >= width ? 16 : 0) };
    batch.draw({ ...next, x: x + 32, y: y + 32, originX: 0.5, originY: 0.5, scaleX: 4 * scaleSize, alpha: transparency, tint });
  }
  if (maximumStack(item) > 1 && item.stack > 1) {
    const s = 3 * scaleSize;
    const digits = tinyDigits(item.stack, s);
    const dx = x + 64 - digits.width + 3 * scaleSize, dy = y + 64 - 18 * scaleSize + 1;
    for (const g of digits.glyphs) batch.draw({ texture: CURSORS, sx: g.sx, sy: 56, sw: 5, sh: 7, x: dx + g.x, y: dy, scaleX: s, alpha: transparency });
  }
  const quality = item.quality ?? 0;
  if (quality > 0) {
    const src = quality >= 4 ? [346, 392] : [338 + (quality - 1) * 8, 400];
    batch.draw({ texture: CURSORS, sx: src[0], sy: src[1], sw: 8, sh: 8, x: x + 12, y: y + 52, originX: 0.5, originY: 0.5, scaleX: 3 * scaleSize, alpha: transparency });
  }
}

export class ToolbarRenderer {
  private readonly batch: UiBatch;
  private readonly font: SpriteFont | null;
  private readonly scales = Array(12).fill(1);

  constructor(scene: Phaser.Scene, depth: number, tinyFont: SpriteFontData | undefined) {
    this.batch = new UiBatch(scene, depth);
    this.font = tinyFont ? new SpriteFont(tinyFont) : null;
  }

  slotAt(layout: ReturnType<typeof toolbarLayout>, x: number, y: number) {
    return layout.slots.findIndex((s) => x >= s.x && x < s.x + 64 && y >= s.y && y < s.y + 64);
  }

  draw(layout: ReturnType<typeof toolbarLayout>, items: (Item | null)[], current: number, data: ItemData, visible = true) {
    const b = this.batch;
    b.begin();
    if (!visible) {
      b.end();
      return;
    }
    b.textureBox(MENU_TEXTURE, [0, 256, 60, 60], layout.box.x, layout.box.y, layout.box.w, layout.box.h);
    layout.slots.forEach((s, i) => {
      const t = menuTile(current === i ? 56 : 10);
      b.draw({ texture: MENU_TEXTURE, ...t, x: s.x, y: s.y });
      if (!this.font) return;
      for (const q of this.font.layout(SLOT_TEXT[i])) b.draw({ texture: TINY_FONT, sx: q.sx, sy: q.sy, sw: q.sw, sh: q.sh, x: s.x + 4 + q.x, y: s.y - 8 + q.y, tint: DIM_GRAY });
    });
    layout.slots.forEach((s, i) => {
      this.scales[i] = Math.max(1, this.scales[i] - 0.025);
      const item = items[i];
      if (item) drawItemInMenu(b, item, s.x, s.y, current === i ? 0.9 : this.scales[i] * 0.8, 1, data);
    });
    b.end();
  }
}
