import type { UiBatch } from "./ui-batch.ts";
import type { SpriteFont } from "./spritefont.ts";
import { MENU_TEXTURE } from "./toolbar.ts";
import { TEXT_COLOR, TEXT_SHADOW_COLOR } from "./menu-parts.ts";

const CURSORS = "LooseSprites/Cursors";
const BOX: [number, number, number, number] = [0, 256, 60, 60];

const CATEGORY_NAMES: Record<number, string> = {
  [-103]: "1_6:skillBook_Category", [-102]: "1_6:Book_Category", [-100]: "category_clothes", [-99]: "Tool.cs.14307", [-97]: "Boots.cs.12501", [-96]: "Ring.cs.1",
  [-81]: "Object.cs.12869", [-80]: "Object.cs.12866", [-79]: "Object.cs.12854", [-75]: "Object.cs.12851", [-74]: "Object.cs.12855",
  [-28]: "Object.cs.12867", [-27]: "Object.cs.12862", [-26]: "Object.cs.12862", [-25]: "Object.cs.12853", [-24]: "Object.cs.12859", [-22]: "Object.cs.12858",
  [-21]: "Object.cs.12857", [-20]: "Object.cs.12860", [-19]: "Object.cs.12856", [-18]: "Object.cs.12864", [-16]: "Object.cs.12868", [-15]: "Object.cs.12868",
  [-14]: "Object.cs.12864", [-12]: "Object.cs.12850", [-8]: "Object.cs.12863", [-7]: "Object.cs.12853", [-6]: "Object.cs.12864", [-5]: "Object.cs.12864",
  [-4]: "Object.cs.12852", [-2]: "Object.cs.12850",
};

const rgb = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const CATEGORY_COLORS: Record<number, number> = {
  [-103]: rgb(122, 93, 39), [-102]: rgb(85, 47, 27),
  [-81]: rgb(10, 130, 50), [-80]: rgb(219, 54, 211), [-79]: 0xff1493, [-75]: 0x008000, [-74]: 0xa52a2a,
  [-28]: rgb(50, 10, 70), [-27]: rgb(0, 155, 111), [-26]: rgb(0, 155, 111), [-24]: rgb(150, 80, 190), [-22]: 0x008b8b, [-21]: 0x8b0000,
  [-20]: 0x696969, [-19]: 0x708090, [-18]: rgb(255, 0, 100), [-16]: rgb(64, 102, 114), [-15]: rgb(64, 102, 114), [-14]: rgb(255, 0, 100),
  [-12]: rgb(110, 0, 90), [-8]: rgb(148, 61, 40), [-7]: rgb(220, 60, 0), [-6]: rgb(255, 0, 100), [-5]: rgb(255, 0, 100), [-4]: 0x00008b, [-2]: rgb(110, 0, 90),
};
export const TOOL_CATEGORY_COLOR = 0x2f4f4f;
export const ARCH_CATEGORY_COLOR = rgb(110, 0, 90);

export const categoryNameKey = (category: number) => CATEGORY_NAMES[category] ?? null;
export const categoryColor = (category: number) => CATEGORY_COLORS[category] ?? 0x000000;

export interface Measurer {
  measure(text: string): { width: number; height: number };
}

export function parseText(text: string, font: Measurer, width: number) {
  let out = "", line = "";
  for (const word of text.split(" ")) {
    if (font.measure(line + word).width > width || word === "\n") {
      out += line + "\n";
      line = "";
    }
    if (word !== "\n") line += word + " ";
  }
  return out + line;
}

export const descriptionWidth = (displayName: string, dialogue: Measurer) => Math.max(272, Math.trunc(dialogue.measure(displayName).width));

export interface TooltipContent {
  title: string;
  text: string;
  category: string;
  categoryColor: number;
  edibility: number | null;
  quality: number;
}

export function staminaRecovered(edibility: number, quality: number) {
  return Math.ceil(edibility * 2.5) + quality * edibility;
}

export function healthRecovered(edibility: number, quality: number) {
  return edibility < 0 ? 0 : Math.trunc(Math.fround(staminaRecovered(edibility, quality) * Math.fround(0.45)));
}

export function tooltipLayout(c: TooltipContent, small: Measurer, dialogue: Measurer, mouse: { x: number; y: number }, offset: number, screen: { w: number; h: number }, energyStrings: { energy: string; health: string }) {
  const heal = c.edibility;
  const text = small.measure(c.text), title = dialogue.measure(c.title);
  let w = Math.max(heal === null ? 0 : Math.trunc(small.measure(`${heal}+ Energy32`).width), Math.trunc(text.width), Math.trunc(title.width)) + 32;
  let h = Math.max(60, Math.trunc(text.height) + 32 + Math.trunc(title.height + 16));
  if (c.category.length > 0) {
    w = Math.max(w, Math.trunc(small.measure(c.category).width) + 32);
    h += Math.trunc(small.measure("T").height);
  }
  if (heal !== null && heal !== 0) {
    const stamina = staminaRecovered(heal, c.quality);
    h += 40 * (stamina > 0 && healthRecovered(heal, c.quality) > 0 ? 2 : 1);
    w = Math.trunc(Math.max(w, small.measure(energyStrings.energy.replace("{0}", "9999")).width + 92, small.measure(energyStrings.health.replace("{0}", "9999")).width + 92));
  }
  let x = mouse.x + 32 + offset, y = mouse.y + 32 + offset;
  if (x + w > screen.w) {
    x = screen.w - w;
    y += 16;
  }
  if (y + h > screen.h) {
    x += 16;
    if (x + w > screen.w) x = screen.w - w;
    y = screen.h - h;
  }
  return { x, y, w: w + 4, h };
}

function boxShadow(b: UiBatch, x: number, y: number, w: number, h: number) {
  const [sx, sy, sw] = BOX;
  const c = Math.trunc(sw / 3);
  const black = { tint: 0x000000, alpha: 0.4 };
  b.stretch(MENU_TEXTURE, [sx + c, sy + c, c, c], x + c / 2 - 8, y + c / 2 + 8, w - c, h - c, black.tint, black.alpha);
  b.draw({ texture: MENU_TEXTURE, sx, sy, sw: c, sh: c, x: x - 8, y: y + 8, ...black });
  b.draw({ texture: MENU_TEXTURE, sx: sx + 2 * c, sy, sw: c, sh: c, x: x + w - c - 8, y: y + 8, ...black });
  b.draw({ texture: MENU_TEXTURE, sx, sy: sy + 2 * c, sw: c, sh: c, x: x - 8, y: y + h - c + 8, ...black });
  b.draw({ texture: MENU_TEXTURE, sx: sx + 2 * c, sy: sy + 2 * c, sw: c, sh: c, x: x + w - c - 8, y: y + h - c + 8, ...black });
  b.stretch(MENU_TEXTURE, [sx + c, sy, c, c], x + c - 8, y + 8, w - 2 * c, c, black.tint, black.alpha);
  b.stretch(MENU_TEXTURE, [sx + c, sy + 2 * c, c, c], x + c - 8, y + h - c + 8, w - 2 * c, c, black.tint, black.alpha);
  b.stretch(MENU_TEXTURE, [sx, sy + c, c, c], x - 8, y + c + 8, c, h - 2 * c, black.tint, black.alpha);
  b.stretch(MENU_TEXTURE, [sx + 2 * c, sy + c, c, c], x + w - c - 8, y + c + 8, c, h - 2 * c, black.tint, black.alpha);
}

function glyphs(b: UiBatch, font: SpriteFont, texture: string, text: string, x: number, y: number, tint: number, alpha = 1) {
  for (const q of font.layout(text)) b.draw({ texture, sx: q.sx, sy: q.sy, sw: q.sw, sh: q.sh, x: x + q.x, y: y + q.y, tint, alpha });
}

export interface TooltipFonts {
  small: SpriteFont;
  smallTexture: string;
  dialogue: SpriteFont;
  dialogueTexture: string;
}

export function drawTooltip(b: UiBatch, f: TooltipFonts, c: TooltipContent, mouse: { x: number; y: number }, offset: number, screen: { w: number; h: number }, energyStrings: { energy: string; health: string }) {
  const l = tooltipLayout(c, f.small, f.dialogue, mouse, offset, screen, energyStrings);
  const x = l.x, w = l.w;
  let y = l.y;
  boxShadow(b, x, y, w, l.h);
  b.textureBox(MENU_TEXTURE, BOX, x, y, w, l.h);
  const titleH = Math.trunc(f.dialogue.measure(c.title).height);
  const catH = c.category.length > 0 ? Math.trunc(f.small.measure("asd").height) : 0;
  b.textureBox(MENU_TEXTURE, BOX, x, y, w, titleH + 32 + catH - 4);
  b.stretch(MENU_TEXTURE, [44, 300, 4, 4], x + 12, y + titleH + 32 + catH - 4, w - 24, 4);
  glyphs(b, f.dialogue, f.dialogueTexture, c.title, x + 18, y + 22, TEXT_SHADOW_COLOR);
  glyphs(b, f.dialogue, f.dialogueTexture, c.title, x + 16, y + 22, TEXT_SHADOW_COLOR);
  glyphs(b, f.dialogue, f.dialogueTexture, c.title, x + 16, y + 20, TEXT_COLOR);
  y += titleH;
  if (c.category.length > 0) {
    y -= 4;
    glyphs(b, f.small, f.smallTexture, c.category, x + 18, y + 22, TEXT_SHADOW_COLOR);
    glyphs(b, f.small, f.smallTexture, c.category, x + 16, y + 22, TEXT_SHADOW_COLOR);
    glyphs(b, f.small, f.smallTexture, c.category, x + 16, y + 20, c.categoryColor);
    y += Math.trunc(f.small.measure("T").height) + 4 + 16;
  } else y += 16;
  if (c.text.trim().length > 0) {
    for (const [dx, dy] of [[2, 2], [0, 2], [2, 0]]) glyphs(b, f.small, f.smallTexture, c.text, x + 16 + dx, y + 20 + dy, TEXT_SHADOW_COLOR);
    glyphs(b, f.small, f.smallTexture, c.text, x + 16, y + 20, TEXT_COLOR, 0.9);
    y += Math.trunc(f.small.measure(c.text).height) + 4;
  }
  if (c.edibility !== null) {
    const stamina = staminaRecovered(c.edibility, c.quality), health = healthRecovered(c.edibility, c.quality);
    const line = (src: [number, number], text: string) => {
      b.draw({ texture: CURSORS, sx: src[0], sy: src[1], sw: 10, sh: 10, x: x + 20 - 4, y: y + 16 + 4, scaleX: 3, tint: 0x000000, alpha: 0.35 });
      b.draw({ texture: CURSORS, sx: src[0], sy: src[1], sw: 10, sh: 10, x: x + 20, y: y + 16, scaleX: 3 });
      glyphs(b, f.small, f.smallTexture, text, x + 52, y + 18, TEXT_SHADOW_COLOR);
      glyphs(b, f.small, f.smallTexture, text, x + 54, y + 18, TEXT_SHADOW_COLOR);
      glyphs(b, f.small, f.smallTexture, text, x + 54, y + 16, TEXT_COLOR);
      y += 34;
    };
    if (stamina >= 0) {
      if (stamina > 0) line([0, 428], stamina >= 999 ? " 100%" : energyStrings.energy.replace("{0}", `+${stamina}`));
      if (health > 0) line([0, 438], health >= 999 ? " 100%" : energyStrings.health.replace("{0}", `+${health}`));
    } else if (stamina !== -300) line([140, 428], energyStrings.energy.replace("{0}", String(stamina)));
  }
  return l;
}
