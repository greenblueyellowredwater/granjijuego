import type { UiBatch } from "./ui-batch.ts";
import type { SpriteFont } from "./spritefont.ts";
import { MENU_TEXTURE } from "./toolbar.ts";
import { menuTile, TEXT_COLOR } from "./menu-parts.ts";
import { parseText } from "./tooltip.ts";

const CURSORS = "LooseSprites/Cursors";
const CURSORS2 = "LooseSprites/Cursors2";
export const SOCIAL_VISIBLE_ROWS = 5;

export interface SocialEntry {
  name: string;
  displayName: string;
  points: number | null;
  orderMet: number | null;
  datable: boolean;
  female: boolean;
  child: boolean;
  giftsThisWeek: number;
  talkedToday: boolean;
  mugShot: { sx: number; sy: number; sw: number; sh: number } | null;
}

export function sortSocialEntries(entries: SocialEntry[]) {
  const cmpNullable = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a - b);
  return [...entries].sort((a, b) => cmpNullable(b.points, a.points) || cmpNullable(a.orderMet, b.orderMet) || (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));
}

export const heartLevel = (e: SocialEntry) => Math.trunc((e.points ?? 0) / 250);

export function heartSprite(e: SocialEntry, h: number) {
  const locked = e.datable && h >= 8;
  return { sx: h < heartLevel(e) || locked ? 211 : 218, sy: 428, sw: 7, sh: 6, dark: h < 10 && locked };
}

export function socialLayout(x: number, y: number, width: number, height: number) {
  return {
    rowY: (k: number) => y + 40 + 32 + 112 * k + 32,
    partitions: [y + 40 + 128 + 4, y + 40 + 192 + 32 + 20, y + 40 + 320 + 36, y + 40 + 384 + 32 + 52],
    verticals: [x + 256 + 12, x + 384 + 368, x + 256 + 12 + 352],
    up: { x: x + width + 16, y: y + 64 },
    down: { x: x + width + 16, y: y + height - 64 },
    runner: { x: x + width + 16 + 12, y: y + 64 + 48 + 4, w: 24, h: height - 128 - 48 - 8 },
  };
}

export class SocialPage {
  scroll = 0;

  scrollBy(delta: number, count: number) {
    this.scroll = Math.max(0, Math.min(Math.max(0, count - SOCIAL_VISIBLE_ROWS), this.scroll + delta));
  }

  draw(b: UiBatch, text: UiBatch, fonts: { dialogue: SpriteFont; dialogueTexture: string; small: SpriteFont; smallTexture: string }, entries: SocialEntry[], x: number, y: number, width: number, height: number, strings: Record<string, string>) {
    const l = socialLayout(x, y, width, height);
    for (const py of l.partitions) b.stretch(MENU_TEXTURE, [menuTile(25).sx, menuTile(25).sy, 64, 64], x + 32, py, width - 64, 64);
    for (const px of l.verticals) b.stretch(MENU_TEXTURE, [menuTile(26).sx, menuTile(26).sy, 64, 64], px, y + 64 + 32, 64, height - 128);
    const glyphs = (font: SpriteFont, texture: string, s: string, gx: number, gy: number, tint = TEXT_COLOR) => {
      for (const q of font.layout(s)) text.draw({ texture, sx: q.sx, sy: q.sy, sw: q.sw, sh: q.sh, x: gx + q.x, y: gy + q.y, tint });
    };
    const wHeight = fonts.small.measure("W").height;
    for (let k = 0; k < SOCIAL_VISIBLE_ROWS; k++) {
      const e = entries[this.scroll + k];
      if (!e) break;
      const ry = l.rowY(k);
      if (e.mugShot) text.draw({ texture: `Characters/${e.name}`, ...e.mugShot, x: x + 40 + 4, y: ry, scaleX: 4 });
      const nameW = fonts.dialogue.measure(e.displayName).width;
      glyphs(fonts.dialogue, fonts.dialogueTexture, e.displayName, x + 200 - nameW / 2, ry + 48 - (e.datable ? 24 : 20));
      for (let h = 0; h < 10; h++) {
        const s = heartSprite(e, h);
        const hx = x + 316 + (h < 10 ? h : h - 10) * 32, hy = h < 10 ? ry + 64 - 28 : ry + 64;
        text.draw({ texture: CURSORS, sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh, x: hx, y: hy, scaleX: 4, tint: s.dark ? 0x000000 : 0xffffff, alpha: s.dark ? 0.35 : 1 });
      }
      if (e.datable) {
        const rel = parseText(strings[e.female ? "SocialPage_Relationship_Single_Female" : "SocialPage_Relationship_Single_Male"] ?? "(single)", fonts.small, 200);
        const m = fonts.small.measure(rel.trimEnd());
        glyphs(fonts.small, fonts.smallTexture, rel.trimEnd(), x + 200 - m.width / 2, ry + 64 - (m.height - wHeight));
      }
      if (!e.child) {
        text.draw({ texture: CURSORS2, sx: 166, sy: 174, sw: 14, sh: 12, x: x + 688, y: ry - 4 + 4, scaleX: 4, tint: 0x000000, alpha: 0.2 });
        text.draw({ texture: CURSORS2, sx: 166, sy: 174, sw: 14, sh: 12, x: x + 688, y: ry - 4, scaleX: 4 });
        text.draw({ texture: CURSORS, sx: 227 + (e.giftsThisWeek >= 2 ? 9 : 0), sy: 425, sw: 9, sh: 9, x: x + 680, y: ry + 52, scaleX: 4 });
        text.draw({ texture: CURSORS, sx: 227 + (e.giftsThisWeek >= 1 ? 9 : 0), sy: 425, sw: 9, sh: 9, x: x + 720, y: ry + 52, scaleX: 4 });
        text.draw({ texture: CURSORS2, sx: 180, sy: 175, sw: 13, sh: 11, x: x + 808, y: ry + 4, scaleX: 4, tint: 0x000000, alpha: 0.2 });
        text.draw({ texture: CURSORS2, sx: 180, sy: 175, sw: 13, sh: 11, x: x + 808, y: ry, scaleX: 4 });
        text.draw({ texture: CURSORS, sx: 227 + (e.talkedToday ? 9 : 0), sy: 425, sw: 9, sh: 9, x: x + 816, y: ry + 52, scaleX: 4 });
      }
    }
    text.draw({ texture: CURSORS, sx: 421, sy: 459, sw: 11, sh: 12, x: l.up.x, y: l.up.y, scaleX: 4 });
    text.draw({ texture: CURSORS, sx: 421, sy: 472, sw: 11, sh: 12, x: l.down.x, y: l.down.y, scaleX: 4 });
    text.textureBox(CURSORS, [403, 383, 6, 6], l.runner.x, l.runner.y, l.runner.w, l.runner.h, 1, 4);
    const maxScroll = Math.max(1, entries.length - SOCIAL_VISIBLE_ROWS);
    const barY = l.runner.y + Math.trunc(((l.runner.h - 40) * Math.min(this.scroll, maxScroll)) / maxScroll);
    text.draw({ texture: CURSORS, sx: 435, sy: 463, sw: 6, sh: 10, x: l.runner.x, y: barY, scaleX: 4 });
  }
}
