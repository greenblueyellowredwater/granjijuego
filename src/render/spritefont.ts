export interface SpriteFontData {
  glyphs: { x: number; y: number; width: number; height: number }[];
  cropping: { x: number; y: number; width: number; height: number }[];
  characterMap: string[];
  verticalLineSpacing: number;
  horizontalSpacing: number;
  kerning: { x: number; y: number; z: number }[];
  defaultCharacter: string | null;
}

export interface GlyphQuad {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
}

export class SpriteFont {
  private readonly index = new Map<string, number>();

  constructor(readonly data: SpriteFontData) {
    data.characterMap.forEach((c, i) => this.index.set(c, i));
  }

  private glyph(c: string) {
    const i = this.index.get(c) ?? (this.data.defaultCharacter ? this.index.get(this.data.defaultCharacter) : undefined);
    if (i === undefined) throw new Error(`Carácter '${c}' fuera de la fuente`);
    return i;
  }

  layout(text: string): GlyphQuad[] {
    const d = this.data;
    const out: GlyphQuad[] = [];
    let x = 0, y = 0, first = true;
    for (const c of text) {
      if (c === "\r") continue;
      if (c === "\n") {
        x = 0;
        y += d.verticalLineSpacing;
        first = true;
        continue;
      }
      const i = this.glyph(c);
      const k = d.kerning[i];
      if (first) {
        x = Math.max(k.x, 0);
        first = false;
      } else x += d.horizontalSpacing + k.x;
      const g = d.glyphs[i], crop = d.cropping[i];
      if (g.width > 0 && g.height > 0) out.push({ sx: g.x, sy: g.y, sw: g.width, sh: g.height, x: x + crop.x, y: y + crop.y });
      x += k.y + k.z;
    }
    return out;
  }

  measure(text: string) {
    const d = this.data;
    if (!text) return { width: 0, height: 0 };
    let width = 0, x = 0, lines = 0, lastHeight = d.verticalLineSpacing, first = true;
    for (const c of text) {
      if (c === "\r") continue;
      if (c === "\n") {
        lines++;
        lastHeight = d.verticalLineSpacing;
        x = 0;
        first = true;
        continue;
      }
      const i = this.glyph(c);
      const k = d.kerning[i];
      if (first) {
        x = Math.max(k.x, 0);
        first = false;
      } else x += d.horizontalSpacing + k.x;
      x += k.y;
      width = Math.max(width, x + Math.max(k.z, 0));
      x += k.z;
      if (d.cropping[i].height > lastHeight) lastHeight = d.cropping[i].height;
    }
    return { width, height: lines * d.verticalLineSpacing + lastHeight };
  }
}
