import { UiBatch } from "./ui-batch.ts";
import { layoutSpriteText, SPRITE_TEXT_TEXTURE, SPRITE_TEXT_ZOOM, spriteTextPages, widthOfString } from "./spritetext.ts";
import { drawItemInMenu } from "./toolbar.ts";
import type { ItemData } from "../world/items.ts";
import type { ParsedLetter } from "../world/mail.ts";

const CURSORS = "LooseSprites/Cursors";
const LETTER_BG = "LooseSprites/letterBG";

export function letterLayout(uiWidth: number, uiHeight: number) {
  const x = Math.trunc((uiWidth - 1280) / 2), y = Math.trunc((uiHeight - 720) / 2);
  return {
    x,
    y,
    w: 1280,
    h: 720,
    back: { x: x + 32, y: y + 720 - 32 - 64, w: 48, h: 44 },
    forward: { x: x + 1280 - 32 - 48, y: y + 720 - 32 - 64, w: 48, h: 44 },
    item: { x: x + 640 - 48, y: y + 720 - 32 - 96, w: 96, h: 96 },
    close: { x: x + 1280 - 36, y: y - 8, w: 48, h: 48 },
  };
}

export function hasInteractable(l: Omit<ParsedLetter, "pages">) {
  return !!l.quest || l.money > 0 || l.items.length > 0 || !!l.recipe;
}

export function paginateLetter(l: Omit<ParsedLetter, "pages">): ParsedLetter {
  const pages = spriteTextPages(l.text, 1280 - 64, hasInteractable(l) ? 720 - 128 - 32 : 720 - 128);
  return { ...l, pages: pages.length ? pages : ["[]"] };
}

export class LetterMenu {
  private readonly batch: UiBatch;
  letter: ParsedLetter | null = null;
  page = 0;
  scale = 0;
  recipeName = "";

  constructor(scene: Phaser.Scene, depth: number) {
    this.batch = new UiBatch(scene, depth);
  }

  get open() {
    return !!this.letter;
  }

  show(letter: ParsedLetter, recipeName = "") {
    this.letter = letter;
    this.page = 0;
    this.scale = 0;
    this.recipeName = recipeName;
  }

  close() {
    this.letter = null;
  }

  private get lastPage() {
    return !!this.letter && this.page === this.letter.pages.length - 1;
  }

  click(uiWidth: number, uiHeight: number, px: number, py: number): { kind: "grab"; item: { id: string; count: number } } | { kind: "close" } | { kind: "page" } | null {
    const l = this.letter;
    if (!l || this.scale < 1) return null;
    const lay = letterLayout(uiWidth, uiHeight);
    const inside = (r: { x: number; y: number; w: number; h: number }) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
    if (inside(lay.close)) return { kind: "close" };
    if (this.lastPage && hasInteractable(l) && l.items.length && inside(lay.item)) {
      const item = l.items[0];
      if (l.items.length > 1) l.items.shift();
      else l.items = [{ ...item, count: 0 }];
      return { kind: "grab", item };
    }
    if (inside(lay.back) && this.page > 0) {
      this.page--;
      return { kind: "page" };
    }
    if (inside(lay.forward) && this.page < l.pages.length - 1) {
      this.page++;
      return { kind: "page" };
    }
    if (inside(lay)) {
      if (this.page < l.pages.length - 1) {
        this.page++;
        return { kind: "page" };
      }
      return { kind: "close" };
    }
    if (!l.items.some((i) => i.count > 0)) return { kind: "close" };
    return null;
  }

  update(ms: number) {
    if (this.letter && this.scale < 1) this.scale = Math.min(1, this.scale + ms * 0.003);
  }

  draw(uiWidth: number, uiHeight: number, data: ItemData, ui: Record<string, string>, ms: number, mouse: { x: number; y: number }) {
    const b = this.batch;
    b.begin();
    const l = this.letter;
    if (l) {
      const lay = letterLayout(uiWidth, uiHeight);
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 0.4);
      const sx = (l.bg % 4) * 320, sy = l.bg >= 4 ? 204 + (Math.trunc(l.bg / 4) - 1) * 180 : 0;
      b.draw({ texture: LETTER_BG, sx, sy, sw: 320, sh: 180, x: lay.x + 640, y: lay.y + 360, originX: 0.5, originY: 0.5, scaleX: 4 * this.scale });
      if (this.scale >= 1) {
        const page = l.pages[this.page] ?? "";
        for (const g of layoutSpriteText(page, 1280 - 64).glyphs) b.draw({ texture: SPRITE_TEXT_TEXTURE, sx: g.sx, sy: g.sy, sw: 8, sh: 16, x: lay.x + 32 + g.x, y: lay.y + 32 + g.y, scaleX: SPRITE_TEXT_ZOOM, alpha: 0.75 });
        if (this.lastPage && hasInteractable(l)) {
          const item = l.items[0];
          if (item) {
            b.draw({ texture: LETTER_BG, sx: l.bg * 24, sy: 180, sw: 24, sh: 24, x: lay.item.x, y: lay.item.y, scaleX: 4 });
            if (item.count > 0) drawItemInMenu(b, { id: item.id, stack: item.count }, lay.item.x + 16, lay.item.y + 16, 1, 1, data);
          }
          const centered = (text: string, y: number) => {
            const x = lay.x + 640 - Math.trunc(widthOfString(text) / 2);
            for (const g of layoutSpriteText(text, 99999).glyphs) b.draw({ texture: SPRITE_TEXT_TEXTURE, sx: g.sx, sy: g.sy, sw: 8, sh: 16, x: x + g.x, y: y + g.y, scaleX: SPRITE_TEXT_ZOOM, alpha: 0.75 });
          };
          if (l.money > 0) centered((ui["LetterViewer_MoneyIncluded"] ?? "{0}g").replace("{0}", String(l.money)), lay.y + 720 - 96);
          else if (l.recipe) {
            const kind = ui[`LearnedRecipe_${l.recipe.kind}`] ?? l.recipe.kind;
            centered((ui["LetterViewer_LearnedRecipe"] ?? "{0}").replace("{0}", kind), lay.y + 720 - 32 - 54 * 2);
            centered((ui["LetterViewer_LearnedRecipeName"] ?? "{0}").replace("{0}", this.recipeName || l.recipe.name), lay.y + 720 - 32 - 54);
          }
        }
        if (this.page > 0) b.draw({ texture: CURSORS, sx: 352, sy: 495, sw: 12, sh: 11, x: lay.back.x, y: lay.back.y, scaleX: 4 });
        if (this.page < l.pages.length - 1) {
          const hover = mouse.x >= lay.forward.x && mouse.x < lay.forward.x + 48 && mouse.y >= lay.forward.y && mouse.y < lay.forward.y + 44;
          const s = hover ? 4 : 4 + Math.sin((ms % 1000) / 201.0619) / 1.5;
          b.draw({ texture: CURSORS, sx: 365, sy: 495, sw: 12, sh: 11, x: lay.forward.x + 24, y: lay.forward.y + 22, originX: 0.5, originY: 0.5, scaleX: s });
        }
        b.draw({ texture: CURSORS, sx: 337, sy: 494, sw: 12, sh: 12, x: lay.close.x, y: lay.close.y, scaleX: 4 });
      }
    }
    b.end();
  }
}
