import { UiBatch } from "./ui-batch.ts";
import { SpriteFont, type SpriteFontData } from "./spritefont.ts";
import { drawMenuBox, menuTile, TEXT_COLOR } from "./menu-parts.ts";
import { MENU_TEXTURE } from "./toolbar.ts";
import { parseText } from "./tooltip.ts";
import { itemSprite, type ItemData } from "../world/items.ts";
import { LEVEL_ICONS, levelUpMenuHeight, PROFESSION_NAMES, type RecipeUnlock } from "../world/levelup.ts";

const CURSORS = "LooseSprites/Cursors";
const BUFFS = "TileSheets/BuffsIcons";
const DIALOGUE_FONT = "Fonts/SpriteFont1";
const SMALL_FONT = "Fonts/SmallFont";
const GREEN = 0x008000;

export interface LevelUpState {
  skill: number;
  level: number;
  title: string;
  extraInfo: string[];
  recipes: (RecipeUnlock & { label: string })[];
  professions: number[] | null;
}

export function levelUpLayout(uiWidth: number, uiHeight: number, s: LevelUpState) {
  const width = s.professions ? 960 : 768;
  const height = s.professions ? 512 : levelUpMenuHeight(s.recipes, s.extraInfo.length);
  const x = Math.trunc(uiWidth / 2 - width / 2), y = Math.trunc(uiHeight / 2 - height / 2);
  let okX = x + width + 4, okY = y + height - 64 - 40;
  if (okX + 64 > uiWidth) okX = uiWidth - 64;
  if (okY + 64 > uiHeight) okY = uiHeight - 64;
  return { x, y, width, height, ok: { x: okX, y: okY }, left: { x, y: y + 128, w: width / 2, h: height }, right: { x: x + width / 2, y: y + 128, w: width / 2, h: height } };
}

export class LevelUpMenu {
  private readonly batch: UiBatch;
  private readonly dialogue: SpriteFont | null;
  private readonly small: SpriteFont | null;
  current: LevelUpState | null = null;

  constructor(scene: Phaser.Scene, depth: number, dialogueFont?: SpriteFontData, smallFont?: SpriteFontData) {
    this.batch = new UiBatch(scene, depth);
    this.dialogue = dialogueFont ? new SpriteFont(dialogueFont) : null;
    this.small = smallFont ? new SpriteFont(smallFont) : null;
  }

  hit(uiWidth: number, uiHeight: number, px: number, py: number) {
    const s = this.current;
    if (!s) return null;
    const l = levelUpLayout(uiWidth, uiHeight, s);
    const inside = (r: { x: number; y: number; w: number; h: number }) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
    if (s.professions) {
      if (inside(l.left)) return { kind: "profession" as const, profession: s.professions[0] };
      if (inside(l.right)) return { kind: "profession" as const, profession: s.professions[1] };
      return null;
    }
    return inside({ x: l.ok.x, y: l.ok.y, w: 64, h: 64 }) ? { kind: "ok" as const } : null;
  }

  draw(uiWidth: number, uiHeight: number, data: ItemData, ui: Record<string, string>, mouse: { x: number; y: number }) {
    const b = this.batch;
    b.begin();
    const s = this.current;
    if (s && this.dialogue && this.small) {
      const dialogue = this.dialogue, small = this.small;
      const l = levelUpLayout(uiWidth, uiHeight, s);
      const text = (font: SpriteFont, texture: string, str: string, x: number, y: number, tint = TEXT_COLOR) => {
        for (const q of font.layout(str)) b.draw({ texture, sx: q.sx, sy: q.sy, sw: q.sw, sh: q.sh, x: x + q.x, y: y + q.y, tint });
      };
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 1);
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 0.5);
      b.draw({ texture: CURSORS, sx: 363, sy: 87, sw: 58, sh: 22, x: l.x + l.width / 2 - 116, y: l.y - 32 + 12, scaleX: 4 });
      drawMenuBox(b, l.x, l.y, l.width, l.height);
      const icon = LEVEL_ICONS[s.skill] ?? [0, 0];
      for (const ix of [l.x + 16 + 40, l.x + l.width - 16 - 40 - 64]) {
        b.draw({ texture: BUFFS, sx: icon[0], sy: icon[1], sw: 16, sh: 16, x: ix - 4, y: l.y + 96 + 16 + 4, scaleX: 4, tint: 0x000000, alpha: 0.35 });
        b.draw({ texture: BUFFS, sx: icon[0], sy: icon[1], sw: 16, sh: 16, x: ix, y: l.y + 96 + 16, scaleX: 4 });
      }
      text(dialogue, DIALOGUE_FONT, s.title, l.x + l.width / 2 - dialogue.measure(s.title).width / 2, l.y + 96 + 16);
      if (s.professions) {
        const partition = l.y + 192;
        b.draw({ texture: MENU_TEXTURE, ...menuTile(4), x: l.x, y: partition });
        b.stretch(MENU_TEXTURE, [menuTile(6).sx, menuTile(6).sy, 64, 64], l.x + 64, partition, l.width - 128, 64);
        b.draw({ texture: MENU_TEXTURE, ...menuTile(7), x: l.x + l.width - 64, y: partition });
        const vx = l.x + l.width / 2 - 32;
        b.draw({ texture: MENU_TEXTURE, ...menuTile(59), x: vx, y: partition });
        b.stretch(MENU_TEXTURE, [menuTile(63).sx, menuTile(63).sy, 64, 64], vx, partition + 64, 64, l.y + l.height - 64 - (partition + 64));
        b.draw({ texture: MENU_TEXTURE, ...menuTile(62), x: vx, y: l.y + l.height - 64 });
        const choose = ui.LevelUp_ChooseProfession ?? "Choose a profession:";
        text(small, SMALL_FONT, choose, l.x + l.width / 2 - small.measure(choose).width / 2, l.y + 64 + 96);
        const inLeft = mouse.x >= l.left.x && mouse.x < l.left.x + l.left.w && mouse.y >= l.left.y && mouse.y < l.left.y + l.left.h;
        const inRight = mouse.x >= l.right.x && mouse.x < l.right.x + l.right.w && mouse.y >= l.right.y && mouse.y < l.right.y + l.right.h;
        s.professions.forEach((p, side) => {
          const name = PROFESSION_NAMES[p] ?? "";
          const lines = [ui[`LevelUp_ProfessionName_${name}`] ?? name, ...(ui[`LevelUp_ProfessionDescription_${name}`] ?? "").split("\n")];
          const color = (side === 0 ? inLeft : inRight) ? GREEN : TEXT_COLOR;
          const tx = side === 0 ? l.x + 16 + 32 : l.x + 16 + l.width / 2;
          text(dialogue, DIALOGUE_FONT, lines[0], tx, l.y + 96 + 160, color);
          b.draw({ texture: CURSORS, sx: (p % 6) * 16, sy: 624 + Math.trunc(p / 6) * 16, sw: 16, sh: 16, x: side === 0 ? l.x + 16 + l.width / 2 - 112 : l.x + 16 + l.width - 128, y: l.y + 96 + 160 - 16, scaleX: 4 });
          for (let i = 1; i < lines.length; i++) text(small, SMALL_FONT, parseText(lines[i], small, l.width / 2 - (side === 0 ? 64 : 48)), (side === 0 ? -4 + l.x + 16 + 32 : -4 + l.x + 16 + l.width / 2), l.y + 96 + 128 + 8 + 64 * (i + 1), color);
        });
      } else {
        let y = l.y + 96 + 80;
        for (const line of s.extraInfo) {
          text(small, SMALL_FONT, line, l.x + l.width / 2 - small.measure(line).width / 2, y);
          y += 48;
        }
        for (const r of s.recipes) {
          const w = small.measure(r.label).width;
          text(small, SMALL_FONT, r.label, l.x + l.width / 2 - w / 2 - 64, y + (r.big ? 38 : 12));
          const sprite = itemSprite({ id: r.output, stack: 1 }, data);
          if (sprite) b.draw({ ...sprite, x: Math.trunc(l.x + l.width / 2 + w / 2 - 48), y: y - 16, scaleX: 4 });
          y += 8 + (r.big ? 128 : 64);
        }
        b.draw({ texture: CURSORS, sx: 128, sy: 256, sw: 64, sh: 64, x: l.ok.x, y: l.ok.y });
      }
    }
    b.end();
  }
}
