import { UiBatch } from "./ui-batch.ts";
import { layoutSpriteText, SPRITE_TEXT_TEXTURE, SPRITE_TEXT_ZOOM, widthOfString } from "./spritetext.ts";
import type { DialoguePage } from "../world/dialogue.ts";

const CURSORS = "LooseSprites/Cursors";
export const BOX_W = 1200;
export const BOX_H = 384;
export const CHAR_MS = 30;

export function dialogueBoxLayout(uiWidth: number, uiHeight: number) {
  const x = Math.trunc((uiWidth - BOX_W) / 2), y = uiHeight - BOX_H - 64;
  const portraitX = x + BOX_W - 448 + 4;
  return { x, y, w: BOX_W, h: BOX_H, portraitX, portraitW: x + BOX_W - portraitX, textWidth: BOX_W - 460 - 24 };
}

export function messageBoxLayout(uiWidth: number, uiHeight: number, text: string) {
  const w = Math.min(1240, widthOfString(text) + 64);
  const h = layoutSpriteText(text, w - 20).height + 4;
  return { x: Math.trunc((uiWidth - w) / 2), y: uiHeight - h - 64, w, h };
}

export class DialogueBox {
  private readonly batch: UiBatch;
  pages: DialoguePage[] = [];
  page = 0;
  chars = 0;
  private timer = 0;
  speaker = "";
  portraitless = false;
  onClose: (() => void) | null = null;

  constructor(scene: Phaser.Scene, depth: number) {
    this.batch = new UiBatch(scene, depth);
  }

  get open() {
    return this.pages.length > 0;
  }

  show(speaker: string, pages: DialoguePage[]) {
    this.portraitless = false;
    this.speaker = speaker;
    this.pages = pages;
    this.page = 0;
    this.chars = 0;
    this.timer = 0;
  }

  showMessage(text: string) {
    this.show("", text.split("#").filter((t) => t.length > 0).map((t) => ({ text: t, portrait: 0 })));
    this.portraitless = true;
  }

  advance() {
    const text = this.pages[this.page]?.text ?? "";
    if (this.chars < text.length) {
      this.chars = text.length;
      return;
    }
    this.page++;
    this.chars = 0;
    if (this.page >= this.pages.length) {
      this.pages = [];
      const done = this.onClose;
      this.onClose = null;
      done?.();
    }
  }

  update(ms: number) {
    if (!this.open) return;
    const text = this.pages[this.page].text;
    this.timer += ms;
    while (this.timer >= CHAR_MS && this.chars < text.length) {
      this.timer -= CHAR_MS;
      this.chars++;
    }
  }

  private box(x: number, y: number, w: number, h: number) {
    const b = this.batch;
    b.stretch(CURSORS, [306, 320, 16, 16], x, y, w, h);
    b.stretch(CURSORS, [275, 313, 1, 6], x, y - 20, w, 24);
    b.stretch(CURSORS, [275, 328, 1, 8], x + 12, y + h, w - 20, 32);
    b.stretch(CURSORS, [264, 325, 8, 1], x - 32, y + 24, 32, h - 28);
    b.stretch(CURSORS, [293, 324, 7, 1], x + w, y, 28, h);
    b.draw({ texture: CURSORS, sx: 261, sy: 311, sw: 14, sh: 13, x: x - 44, y: y - 28, scaleX: 4 });
    b.draw({ texture: CURSORS, sx: 291, sy: 311, sw: 12, sh: 11, x: x + w - 8, y: y - 28, scaleX: 4 });
    b.draw({ texture: CURSORS, sx: 291, sy: 326, sw: 12, sh: 12, x: x + w - 8, y: y + h - 8, scaleX: 4 });
    b.draw({ texture: CURSORS, sx: 261, sy: 327, sw: 14, sh: 11, x: x - 44, y: y + h - 4, scaleX: 4 });
  }

  private text(text: string, x: number, y: number, width: number, chars = text.length) {
    for (const g of layoutSpriteText(text, width, chars).glyphs) {
      this.batch.draw({ texture: SPRITE_TEXT_TEXTURE, sx: g.sx, sy: g.sy, sw: 8, sh: 16, x: x + g.x, y: y + g.y, scaleX: SPRITE_TEXT_ZOOM });
    }
  }

  draw(uiWidth: number, uiHeight: number, portraitTexture: string | null) {
    const b = this.batch;
    b.begin();
    if (this.open && this.portraitless) {
      const text = this.pages[this.page].text;
      const m = messageBoxLayout(uiWidth, uiHeight, this.pages[0].text);
      this.box(m.x, m.y, m.w, m.h);
      this.text(text, m.x + 8, m.y + 8, m.w - 20, this.chars);
    } else if (this.open) {
      const l = dialogueBoxLayout(uiWidth, uiHeight);
      this.box(l.x, l.y, l.w, l.h);
      const p = l.portraitX;
      b.stretch(CURSORS, [278, 324, 9, 1], p - 40, l.y, 36, l.h);
      b.draw({ texture: CURSORS, sx: 278, sy: 313, sw: 10, sh: 7, x: p - 40, y: l.y - 20, scaleX: 4 });
      b.draw({ texture: CURSORS, sx: 278, sy: 328, sw: 10, sh: 8, x: p - 40, y: l.y + l.h, scaleX: 4 });
      const px = p + 76, py = l.y + Math.trunc(l.h / 2) - 148 - 36;
      b.draw({ texture: CURSORS, sx: 583, sy: 411, sw: 115, sh: 97, x: p - 8, y: l.y, scaleX: 4 });
      const page = this.pages[this.page];
      if (portraitTexture) {
        const i = page.portrait;
        b.draw({ texture: portraitTexture, sx: (i % 2) * 64, sy: Math.floor(i / 2) * 64, sw: 64, sh: 64, x: px + 16, y: py + 24, scaleX: 4 });
      }
      const nameX = p + Math.trunc(l.portraitW / 2) - Math.trunc(widthOfString(this.speaker) / 2);
      this.text(this.speaker, nameX, py + 296 + 16, 999999);
      this.text(page.text, l.x + 8, l.y + 8, l.textWidth, this.chars);
    }
    b.end();
  }
}
