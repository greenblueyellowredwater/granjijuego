import type { UiBatch } from "./ui-batch.ts";
import type { SpriteFont } from "./spritefont.ts";
import { TEXT_COLOR } from "./menu-parts.ts";

const CURSORS = "LooseSprites/Cursors";
const SANDY_BROWN = 0xf4a460;

export const SKILL_ROWS = [
  { skill: 0, name: "SkillsPage.cs.11604", icon: [10, 428] },
  { skill: 3, name: "SkillsPage.cs.11605", icon: [30, 428] },
  { skill: 2, name: "SkillsPage.cs.11606", icon: [60, 428] },
  { skill: 1, name: "SkillsPage.cs.11607", icon: [20, 428] },
  { skill: 4, name: "SkillsPage.cs.11608", icon: [120, 428] },
] as const;

export function numberSpriteQuads(n: number, x: number, y: number, scale = 1) {
  const out: { sx: number; sy: number; x: number; y: number }[] = [];
  let px = x;
  do {
    const d = n % 10;
    n = Math.trunc(n / 10);
    out.push({ sx: 512 + ((d * 8) % 48), sy: 128 + Math.trunc((d * 8) / 48) * 8, x: px - 4 * 4 * scale, y: y - 4 * 4 * scale });
    px -= 8 * scale * 4 - 4;
  } while (n > 0);
  return out;
}

export function skillPip(level: number, i: number) {
  const has = level > i, milestone = (i + 1) % 5 === 0;
  if (milestone) return has ? { sx: 159, w: 14, alpha: 1 } : { sx: 145, w: 14, alpha: 0.65 };
  return { sx: 129 + (has ? 8 : 0), w: 8, alpha: has ? 1 : 0.65 };
}

export function drawSkillsPage(b: UiBatch, f: UiBatch, fonts: { small: SpriteFont; smallTexture: string }, x: number, y: number, width: number, height: number, levels: number[], strings: Record<string, string>, farmer: { name: string; title: string }) {
  const glyphs = (s: string, gx: number, gy: number) => {
    for (const q of fonts.small.layout(s)) f.draw({ texture: fonts.smallTexture, sx: q.sx, sy: q.sy, sw: q.sw, sh: q.sh, x: gx + q.x, y: gy + q.y, tint: TEXT_COLOR });
  };
  const px = x + 64 - 8, py = y + 40 + 96;
  glyphs(farmer.name, px + 64 - fonts.small.measure(farmer.name).width / 2, py + 192 - 17);
  glyphs(farmer.title, px + 64 - fonts.small.measure(farmer.title).width / 2, py + 256 - 32 - 19);
  b.stretch("__WHITE", [0, 0, 1, 1], x + 32, y + 96 + Math.trunc(height / 2) + 21, width - 64 - 8, 4, 0xd68f54);
  const bx = x + 40 + 96 + 256 - 8, by = y + 96 + 40 - 8;
  SKILL_ROWS.forEach((row, k) => {
    const level = levels[row.skill] ?? 0;
    const name = strings[row.name] ?? "";
    glyphs(name, bx - fonts.small.measure(name).width + 4 - 64, by + 4 + k * 68);
    f.draw({ texture: CURSORS, sx: row.icon[0], sy: row.icon[1], sw: 10, sh: 10, x: bx - 56, y: by + k * 68, scaleX: 4, tint: 0x000000, alpha: 0.3 });
    f.draw({ texture: CURSORS, sx: row.icon[0], sy: row.icon[1], sw: 10, sh: 10, x: bx - 52, y: by - 4 + k * 68, scaleX: 4 });
    let offset = 0;
    for (let i = 0; i < 10; i++) {
      const p = skillPip(level, i);
      if (p.sx !== 159) f.draw({ texture: CURSORS, sx: p.w === 14 ? 145 : 129, sy: 338, sw: p.w, sh: 9, x: offset + bx - 4 + i * 36, y: by + k * 68, scaleX: 4, tint: 0x000000, alpha: 0.35 });
      f.draw({ texture: CURSORS, sx: p.sx, sy: 338, sw: p.w, sh: 9, x: offset + bx + i * 36 - (p.sx === 159 ? 4 : 0), y: by - 4 + k * 68, scaleX: 4, alpha: p.alpha });
      if (i === 9) {
        const nx = offset + bx + (i + 2) * 36 + (level >= 10 ? 12 : 0);
        for (const q of numberSpriteQuads(level, nx + 12, by + 16 + k * 68)) f.draw({ texture: CURSORS, sx: q.sx, sy: q.sy, sw: 8, sh: 8, x: q.x, y: q.y, scaleX: 4, tint: 0x000000, alpha: 0.35 });
        for (const q of numberSpriteQuads(level, nx + 16, by + 12 + k * 68)) f.draw({ texture: CURSORS, sx: q.sx, sy: q.sy, sw: 8, sh: 8, x: q.x, y: q.y, scaleX: 4, tint: SANDY_BROWN, alpha: level === 0 ? 0.75 : 1 });
      }
      if ((i + 1) % 5 === 0) offset += 24;
    }
  });
  return { portraitBg: { x: px, y: py - 16 - 4 }, farmer: { x: px + 32, y: py + 16 - 4 } };
}
