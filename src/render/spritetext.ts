export const SPRITE_TEXT_ZOOM = 3;
export const SPRITE_TEXT_TEXTURE = "LooseSprites/font_bold";
const LINE = 18 * SPRITE_TEXT_ZOOM;

export function widthOffset(c: string) {
  switch (c) {
    case ",":
    case ".":
      return -2;
    case "!":
    case "j":
    case "l":
    case "¡":
      return -1;
    case "i":
    case "ì":
    case "í":
    case "î":
    case "ï":
    case "ı":
      return -1;
    case "^":
      return -8;
    case "$":
      return 1;
    default:
      return 0;
  }
}

export function charSourceRect(c: string, textureWidth = 128) {
  const index = c.charCodeAt(0) - 32;
  return { sx: (index * 8) % textureWidth, sy: Math.floor((index * 8) / textureWidth) * 16, sw: 8, sh: 16 };
}

export function widthOfString(text: string, maxWidth = 999999) {
  let x = 0, max = 0;
  for (let i = 0; i < text.length; i++) {
    x += 8 + widthOffset(text[i]);
    if (i > 0) x += widthOffset(text[Math.max(0, i - 1)]);
    max = Math.max(max, x);
    const next = nextSpacePosition(text, i, Math.trunc(x * SPRITE_TEXT_ZOOM));
    if (text[i] === "^" || x * SPRITE_TEXT_ZOOM >= maxWidth || next >= maxWidth) x = 0;
  }
  return Math.trunc(max * SPRITE_TEXT_ZOOM);
}

export function nextSpacePosition(text: string, from: number, x: number) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === " " || text[i] === "^") return x;
    x += Math.trunc((8 + widthOffset(text[i])) * SPRITE_TEXT_ZOOM);
  }
  return x;
}

export interface SpriteGlyph {
  sx: number;
  sy: number;
  x: number;
  y: number;
}

export function layoutSpriteText(text: string, width: number, characters = text.length) {
  const glyphs: SpriteGlyph[] = [];
  let x = 0, y = 4;
  const end = Math.min(text.length, characters);
  for (let i = 0; i < end; i++) {
    const c = text[i];
    if (c === "^") {
      y += LINE;
      x = 0;
      continue;
    }
    const upper = c !== c.toLowerCase() || c === "ß";
    if (nextSpacePosition(text, i, x) >= width) {
      y += LINE;
      x = 0;
      if (c === " ") continue;
    }
    const r = charSourceRect(c);
    if (c !== " ") glyphs.push({ sx: r.sx, sy: r.sy, x, y: y + (-1 + (upper ? -3 : 0)) * SPRITE_TEXT_ZOOM });
    if (i < text.length - 1) x += 8 * SPRITE_TEXT_ZOOM + widthOffset(text[i + 1]) * SPRITE_TEXT_ZOOM;
    x += widthOffset(c) * SPRITE_TEXT_ZOOM;
  }
  return { glyphs, height: y + LINE };
}
