import { UiBatch } from "./ui-batch.ts";
import { redToGreen } from "./hud-layout.ts";
import { drawItemInMenu } from "./toolbar.ts";
import type { BobberBarState } from "../world/fishing.ts";
import type { ItemData } from "../world/items.ts";

const CURSORS = "LooseSprites/Cursors";

export function bobberBarPosition(playerScreen: { x: number; y: number }, facing: number, view: { w: number; h: number }) {
  let x = facing === 1 ? playerScreen.x + 128 : playerScreen.x - 64 - 132;
  let y = playerScreen.y - 274 - 64;
  if (x + 96 > view.w) x = view.w - 96;
  else if (x < 0) x = 0;
  if (y < 0) y = 0;
  else if (y + 636 > view.h) y = view.h - 636;
  return { x, y, flip: facing === 3 };
}

const rgb = (c: [number, number, number]) => (c[0] << 16) | (c[1] << 8) | c[2];

export class FishingRenderer {
  private readonly batch: UiBatch;

  constructor(scene: Phaser.Scene, depth: number) {
    this.batch = new UiBatch(scene, depth);
  }

  draw(o: {
    playerScreen: { x: number; y: number };
    power: number | null;
    bobberScreen: { x: number; y: number } | null;
    nibble: { x: number; y: number; scale: number } | null;
    bar: BobberBarState | null;
    facing: number;
    view: { w: number; h: number };
    fishItem: string | null;
    data: ItemData;
    ms: number;
  }) {
    const b = this.batch;
    b.begin();
    if (o.power !== null) {
      b.draw({ texture: CURSORS, sx: 193, sy: 1868, sw: 47, sh: 12, x: o.playerScreen.x - 48, y: o.playerScreen.y - 160, scaleX: 4 });
      b.stretch("__WHITE", [0, 0, 1, 1], o.playerScreen.x - 36, o.playerScreen.y - 148, Math.trunc(164 * o.power), 25, rgb(redToGreen(o.power)));
    }
    if (o.bobberScreen) b.draw({ texture: "TileSheets/bobbers", sx: 0, sy: 16, sw: 16, sh: 16, x: o.bobberScreen.x, y: o.bobberScreen.y, originX: 0.5, originY: 0.5, scaleX: 4, flipX: o.facing === 1 });
    if (o.nibble) b.draw({ texture: CURSORS, sx: 395, sy: 497, sw: 3, sh: 8, x: o.nibble.x, y: o.nibble.y, scaleX: o.nibble.scale });
    const s = o.bar;
    if (s) {
      const p = bobberBarPosition(o.playerScreen, o.facing, o.view);
      b.draw({ texture: CURSORS, sx: 652, sy: 1685, sw: 52, sh: 157, x: p.x - (p.flip ? 44 : 20) + 104, y: p.y - 16 + 314, originX: 0.5, originY: 0.5, scaleX: 4 * s.scale, alpha: 0.6 * s.scale, flipX: p.flip });
      b.draw({ texture: CURSORS, sx: 644, sy: 1999, sw: 38, sh: 150, x: p.x + 70, y: p.y + 296, originX: 18.5 / 38, originY: 74 / 150, scaleX: 4 * s.scale, alpha: s.scale });
      if (s.scale === 1) {
        const barAlpha = s.bobberInBar ? 1 : 0.25 * (Math.round(Math.sin(o.ms / 100) * 100) / 100 + 2);
        const bx = p.x + 64 + s.barShake.x, by = p.y + 12 + Math.trunc(s.bobberBarPos) + s.barShake.y;
        b.draw({ texture: CURSORS, sx: 682, sy: 2078, sw: 9, sh: 2, x: bx, y: by, scaleX: 4, alpha: barAlpha });
        b.draw({ texture: CURSORS, sx: 682, sy: 2081, sw: 9, sh: 1, x: bx, y: by + 8, scaleX: 4, scaleY: s.bobberBarHeight - 16, alpha: barAlpha });
        b.draw({ texture: CURSORS, sx: 682, sy: 2085, sw: 9, sh: 2, x: bx, y: by + s.bobberBarHeight - 8, scaleX: 4, alpha: barAlpha });
        const d = s.distanceFromCatching;
        b.stretch("__WHITE", [0, 0, 1, 1], p.x + 124, p.y + 4 + Math.trunc(580 * (1 - d)), 16, Math.trunc(580 * d), rgb(redToGreen(d)));
        b.draw({ texture: CURSORS, sx: 257, sy: 1990, sw: 5, sh: 10, x: p.x + 18, y: p.y + 514, originX: 2 / 5, originY: 1, scaleX: 4, rotation: s.reelRotation });
        b.draw({ texture: CURSORS, sx: 614 + (s.boss ? 20 : 0), sy: 1840, sw: 20, sh: 20, x: p.x + 82 + s.fishShake.x, y: p.y + 36 + s.bobberPosition + s.fishShake.y, originX: 0.5, originY: 0.5, scaleX: 2 });
      }
    }
    if (o.fishItem) drawItemInMenu(b, { id: o.fishItem, stack: 1 }, o.playerScreen.x - 32 + 32, o.playerScreen.y - 160, 1, 1, o.data);
    b.end();
  }
}
