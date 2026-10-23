import { UiBatch } from "./ui-batch.ts";
import { drawMenuBox } from "./menu-parts.ts";
import { numberSpriteQuads } from "./skills-page.ts";
import { elevatorLayout } from "./elevator-layout.ts";

export { elevatorLayout };

const CURSORS = "LooseSprites/Cursors";
const GOLD = 0xffd700;
const GRAY = [Math.trunc(128 * 0.75), Math.trunc(128 * 0.75), Math.trunc(128 * 0.75)];

export class ElevatorMenu {
  private readonly batch: UiBatch;
  open = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.batch = new UiBatch(scene, depth);
  }

  hit(lowest: number, uiWidth: number, uiHeight: number, px: number, py: number) {
    const l = elevatorLayout(lowest, uiWidth, uiHeight);
    if (px >= l.close.x && px < l.close.x + 48 && py >= l.close.y && py < l.close.y + 48) return { kind: "close" as const };
    if (px < l.x || px >= l.x + l.width || py < l.y || py >= l.y + l.height) return { kind: "close" as const };
    const b = l.buttons.find((b) => px >= b.x && px < b.x + 44 && py >= b.y && py < b.y + 44);
    return b ? { kind: "level" as const, level: b.level } : null;
  }

  draw(lowest: number, current: number, uiWidth: number, uiHeight: number, mouse: { x: number; y: number }) {
    const b = this.batch;
    b.begin();
    if (this.open) {
      const l = elevatorLayout(lowest, uiWidth, uiHeight);
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 0.4);
      drawMenuBox(b, l.x, l.y - 64 + 8, l.width + 21, l.height + 64);
      for (const btn of l.buttons) {
        const hover = mouse.x >= btn.x && mouse.x < btn.x + 44 && mouse.y >= btn.y && mouse.y < btn.y + 44;
        const sx = hover ? 267 : 256;
        b.draw({ texture: CURSORS, sx, sy: 256, sw: 10, sh: 10, x: btn.x - 4, y: btn.y + 4, scaleX: 4, tint: 0x000000, alpha: 0.5 });
        b.draw({ texture: CURSORS, sx, sy: 256, sw: 10, sh: 10, x: btn.x, y: btn.y, scaleX: 4 });
        const digits = String(btn.level).length;
        const color = current === btn.level ? (GRAY[0] << 16) | (GRAY[1] << 8) | GRAY[2] : GOLD;
        for (const q of numberSpriteQuads(btn.level, btn.x + 16 + digits * 6, btn.y + 24 - 2, 0.5)) b.draw({ texture: CURSORS, sx: q.sx, sy: q.sy, sw: 8, sh: 8, x: q.x, y: q.y, scaleX: 2, tint: color });
      }
      b.draw({ texture: CURSORS, sx: 337, sy: 494, sw: 12, sh: 12, x: l.close.x, y: l.close.y, scaleX: 4 });
    }
    b.end();
  }
}
