import { UiBatch } from "./ui-batch.ts";
import { drawItemInMenu } from "./toolbar.ts";
import { layoutSpriteText, SPRITE_TEXT_TEXTURE, SPRITE_TEXT_ZOOM, widthOfString } from "./spritetext.ts";
import { moneyDigits } from "./hud-layout.ts";
import type { ItemData } from "../world/items.ts";
import type { ShippingSummary } from "../world/shipping.ts";

const CURSORS = "LooseSprites/Cursors";
const INTRO_MS = 3500;
const MAROON = 0x800000;

export function shippingLayout(uiWidth: number, uiHeight: number) {
  const cx = Math.trunc(uiWidth / 2), cy = Math.trunc(uiHeight / 2);
  const totalWidth = 512 + 40 + 96 + 8;
  const rows = [0, 1, 2, 3, 4, 5].map((i) => ({ x: cx + Math.trunc(totalWidth / 2) - 40, y: cy - 300 + i * 108 }));
  return { cx, cy, rows, plaqueY: rows[0].y - 128, ok: { x: cx + Math.trunc(totalWidth / 2) - 144 + 32, y: cy + 300 - 64 } };
}

export class ShippingMenu {
  private readonly batch: UiBatch;
  summary: ShippingSummary | null = null;
  names: string[] = [];
  date = "";
  winter = false;
  introTimer = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    this.batch = new UiBatch(scene, depth);
  }

  show(summary: ShippingSummary, names: string[], date: string, winter: boolean) {
    this.summary = summary;
    this.names = names;
    this.date = date;
    this.winter = winter;
    this.introTimer = INTRO_MS;
  }

  update(ms: number) {
    if (this.summary) this.introTimer = Math.max(-1000, this.introTimer - ms);
  }

  hitOk(uiWidth: number, uiHeight: number, px: number, py: number) {
    const l = shippingLayout(uiWidth, uiHeight);
    return this.introTimer <= 0 && px >= l.ok.x && px < l.ok.x + 64 && py >= l.ok.y && py < l.ok.y + 64;
  }

  private text(s: string, x: number, y: number) {
    for (const g of layoutSpriteText(s, 999999).glyphs) this.batch.draw({ texture: SPRITE_TEXT_TEXTURE, sx: g.sx, sy: g.sy, sw: 8, sh: 16, x: x + g.x, y: y + g.y, scaleX: SPRITE_TEXT_ZOOM });
  }

  private scrollText(s: string, cx: number, y: number) {
    const w = widthOfString(s);
    const x = cx - Math.trunc(w / 2);
    this.batch.draw({ texture: CURSORS, sx: 325, sy: 318, sw: 12, sh: 18, x: x - 48, y: y - 12, scaleX: 4 });
    this.batch.draw({ texture: CURSORS, sx: 337, sy: 318, sw: 1, sh: 18, x, y: y - 12, scaleX: w, scaleY: 4 });
    this.batch.draw({ texture: CURSORS, sx: 338, sy: 318, sw: 12, sh: 18, x: x + w, y: y - 12, scaleX: 4 });
    this.text(s, x, y);
  }

  draw(uiWidth: number, uiHeight: number, data: ItemData) {
    const b = this.batch;
    b.begin();
    const s = this.summary;
    if (s) {
      const fade = Math.min(1, 1 - this.introTimer / INTRO_MS);
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 1);
      b.stretch(CURSORS, [639, 858, 1, 184], 0, 0, uiWidth, uiHeight, 0xffffff, fade);
      for (let x = 0; x < uiWidth; x += 639 * 4) b.draw({ texture: CURSORS, sx: 0, sy: 1453, sw: 639, sh: 195, x, y: 0, scaleX: 4, alpha: fade });
      const hillY = this.winter ? 1034 : 737;
      for (const x of [0, 2556]) {
        b.draw({ texture: CURSORS, sx: 0, sy: hillY, sw: 639, sh: 48, x, y: uiHeight - 192, scaleX: 4, flipX: true, tint: this.winter ? 0xffffff : 0x001428, alpha: (this.winter ? 0.25 : 1) * Math.min(0.65, Math.max(0, 0.65 - this.introTimer / INTRO_MS)) });
      }
      for (const x of [0, 2556]) b.draw({ texture: CURSORS, sx: 0, sy: hillY, sw: 639, sh: 32, x, y: uiHeight - 128, scaleX: 4, tint: this.winter ? 0xffffff : 0x002014, alpha: (this.winter ? 0.5 : 1) * fade });
      b.draw({ texture: CURSORS, sx: 653, sy: 880, sw: 10, sh: 10, x: 160, y: uiHeight - 128 + 24, scaleX: 4, alpha: fade });
      const l = shippingLayout(uiWidth, uiHeight);
      if (l.plaqueY >= 0) this.scrollText(this.date, l.cx, l.plaqueY);
      l.rows.forEach((row, i) => {
        if (this.introTimer >= 2500 - i * 500) return;
        const px = row.x + 12, py = row.y - 8;
        if (i < 5 && s.items[i].length > 0) {
          b.draw({ texture: CURSORS, sx: 392, sy: 361, sw: 10, sh: 11, x: row.x, y: row.y, scaleX: 4 });
          b.draw({ texture: CURSORS, sx: 293, sy: 360, sw: 24, sh: 24, x: px - 104, y: py - 16, scaleX: 4 });
          drawItemInMenu(b, s.items[i][0], px - 88, py - 4, 1, 1, data);
        }
        b.textureBox(CURSORS, [384, 373, 18, 18], px - 96 - 512 - 12, py - 20, 512, 104, 1, 4);
        this.text(this.names[i] ?? "", px - 96 - 512 + 8, py + 4);
        for (let j = 0; j < 6; j++) b.draw({ texture: CURSORS, sx: 355, sy: 476, sw: 7, sh: 11, x: px - 96 - 192 - 24 + j * 24, y: py + 12, scaleX: 4 });
        for (const { index, digit } of moneyDigits(s.totals[i], 7)) b.draw({ texture: CURSORS, sx: 286, sy: 502 - digit * 8, sw: 5, sh: 8, x: px - 96 - 192 - 48 + 4 + index * 24, y: py + 20, scaleX: 4, tint: MAROON });
        b.draw({ texture: CURSORS, sx: 408, sy: 476, sw: 9, sh: 11, x: px - 96 - 64 - 4, y: py + 12, scaleX: 4 });
      });
      if (this.introTimer <= 0) b.draw({ texture: CURSORS, sx: 128, sy: 256, sw: 64, sh: 64, x: l.ok.x, y: l.ok.y });
    }
    b.end();
  }
}
