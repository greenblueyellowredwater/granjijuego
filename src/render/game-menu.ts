import { UiBatch } from "./ui-batch.ts";
import { SpriteFont, type SpriteFontData } from "./spritefont.ts";
import { MENU_TEXTURE } from "./toolbar.ts";
import { drawHorizontalPartition, drawInventoryGrid, drawMenuBox, drawShadowText, inventorySlotAt, menuTile, TEXT_COLOR } from "./menu-parts.ts";
import { drawItemInMenu } from "./toolbar.ts";
import type { Item, ItemData } from "../world/items.ts";
import { drawTooltip, type TooltipContent } from "./tooltip.ts";
import { SocialPage, socialLayout, type SocialEntry } from "./social-page.ts";

const CURSORS = "LooseSprites/Cursors";
const CURSORS_16 = "LooseSprites/Cursors_1_6";
const DIALOGUE_FONT = "Fonts/SpriteFont1";
const SMALL_FONT = "Fonts/SmallFont";
const SHIRTS = "Characters/Farmer/shirts";
const PANTS = "Characters/Farmer/pants";

export const GAME_MENU_TABS = ["inventory", "skills", "social", "map", "crafting", "animals", "powers", "collections", "options", "exit"] as const;
const TAB_ICON: Record<string, { texture: string; sx: number; sy: number }> = {
  inventory: { texture: CURSORS, sx: 0, sy: 368 },
  skills: { texture: CURSORS, sx: 16, sy: 368 },
  social: { texture: CURSORS, sx: 32, sy: 368 },
  map: { texture: CURSORS, sx: 48, sy: 368 },
  crafting: { texture: CURSORS, sx: 64, sy: 368 },
  animals: { texture: CURSORS_16, sx: 257, sy: 246 },
  powers: { texture: CURSORS_16, sx: 216, sy: 494 },
  collections: { texture: CURSORS, sx: 80, sy: 368 },
  options: { texture: CURSORS, sx: 96, sy: 368 },
  exit: { texture: CURSORS, sx: 112, sy: 368 },
};

export function gameMenuLayout(uiWidth: number, uiHeight: number) {
  const width = 880, height = 680;
  const x = Math.trunc(uiWidth / 2) - Math.trunc(width / 2), y = Math.trunc(uiHeight / 2) - Math.trunc(height / 2);
  const top = y + 40 + 96;
  const eq = (dx: number, dy: number) => ({ x: x + 48 + dx, y: top + 4 + dy - 12 });
  return {
    x,
    y,
    width,
    height,
    tabs: GAME_MENU_TABS.map((name, i) => ({ name, x: x + 64 * (i + 1), y: y + 16 })),
    inventory: { x: x + 56, y: top },
    partitionY: top + 192,
    equipment: {
      leftRing: eq(0, 256),
      rightRing: eq(0, 320),
      boots: eq(0, 384),
      hat: eq(208, 256),
      shirt: eq(208, 320),
      pants: eq(208, 384),
    },
    portraitBg: { x: x + 192 - 64 - 8, y: top + 256 - 8 },
    farmer: { x: x + 192 - 8 - 32, y: top + 320 - 32 - 8 },
    nameCenterX: x + 192 - 8,
    nameY: top + 448 + 8,
    infoCenterX: x + 32 + 512 + 32,
    farmNameY: top + 256 + 4,
    fundsY: top + 320 + 4,
    earningsY: top + 384,
    dateY: top + 448,
    trash: { x: x + Math.trunc(width / 3) + 576 + 32, y: top + 192 + 64 },
    organize: { x: x + width, y: y + Math.trunc(height / 3) - 64 + 8 },
    close: { x: x + width - 36, y: y - 8 },
  };
}

export interface InventoryPageInfo {
  farmerName: string;
  farmName: string;
  money: number;
  totalEarned: number;
  date: string;
  night: boolean;
  shirt: { index: number; color: number } | null;
  pants: { index: number; color: number } | null;
  strings: { farmName: string; funds: string; earnings: string };
}

const withCommas = (n: number) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export class GameMenu {
  private readonly back: UiBatch;
  private readonly front: UiBatch;
  private readonly font: SpriteFont | null;
  private readonly tiny: SpriteFont | null;
  open = false;
  held: Item | null = null;
  heldFrom = -1;
  trashLidRotation = 0;

  private readonly small: SpriteFont | null;

  constructor(scene: Phaser.Scene, depth: number, dialogueFont: SpriteFontData | undefined, tinyFont: SpriteFontData | undefined, smallFont?: SpriteFontData) {
    this.back = new UiBatch(scene, depth);
    this.front = new UiBatch(scene, depth + 2);
    this.font = dialogueFont ? new SpriteFont(dialogueFont) : null;
    this.tiny = tinyFont ? new SpriteFont(tinyFont) : null;
    this.small = smallFont ? new SpriteFont(smallFont) : null;
  }

  hoveredSlot(uiWidth: number, uiHeight: number, px: number, py: number) {
    const l = gameMenuLayout(uiWidth, uiHeight);
    return inventorySlotAt(px, py, l.inventory.x, l.inventory.y, true);
  }

  tab: "inventory" | "social" = "inventory";
  readonly social = new SocialPage();

  hit(uiWidth: number, uiHeight: number, px: number, py: number) {
    const l = gameMenuLayout(uiWidth, uiHeight);
    const inside = (x: number, y: number, w: number, h: number) => px >= x && px < x + w && py >= y && py < y + h;
    if (inside(l.close.x, l.close.y, 48, 48)) return { kind: "close" as const };
    const tab = l.tabs.find((t) => inside(t.x, t.y, 64, 64));
    if (tab) return { kind: "tab" as const, name: tab.name };
    if (this.tab === "social") {
      const s = socialLayout(l.x, l.y, l.width + 36, l.height);
      if (inside(s.up.x, s.up.y, 44, 48)) return { kind: "up" as const };
      if (inside(s.down.x, s.down.y, 44, 48)) return { kind: "down" as const };
      return null;
    }
    if (inside(l.trash.x, l.trash.y, 64, 104)) return { kind: "trash" as const };
    const slot = inventorySlotAt(px, py, l.inventory.x, l.inventory.y, true);
    if (slot >= 0) return { kind: "slot" as const, slot };
    if (!inside(l.x, l.y + 64, l.width, l.height - 64)) return { kind: "outside" as const };
    return null;
  }

  draw(uiWidth: number, uiHeight: number, items: (Item | null)[], data: ItemData, current: number, maxItems: number, info: InventoryPageInfo, mouse: { x: number; y: number }, tooltip: TooltipContent | null = null, energyStrings = { energy: "{0} Energy", health: "{0} Health" }, social: { entries: SocialEntry[]; strings: Record<string, string> } = { entries: [], strings: {} }) {
    const b = this.back, f = this.front;
    b.begin();
    f.begin();
    if (this.open) {
      const l = gameMenuLayout(uiWidth, uiHeight);
      b.stretch("__WHITE", [0, 0, 1, 1], 0, 0, uiWidth, uiHeight, 0x000000, 0.4);
      drawMenuBox(b, l.x, l.y, this.tab === "social" ? l.width + 36 : l.width, l.height);
      for (const t of l.tabs) {
        const icon = TAB_ICON[t.name];
        b.draw({ texture: icon.texture, sx: icon.sx, sy: icon.sy, sw: 16, sh: 16, x: t.x, y: t.y + (t.name === this.tab ? 8 : 0), scaleX: 4 });
      }
      if (this.tab === "social") {
        if (this.font && this.small) this.social.draw(b, f, { dialogue: this.font, dialogueTexture: DIALOGUE_FONT, small: this.small, smallTexture: SMALL_FONT }, social.entries, l.x, l.y, l.width + 36, l.height, social.strings);
        f.draw({ texture: CURSORS, sx: 337, sy: 494, sw: 12, sh: 12, x: l.close.x, y: l.close.y, scaleX: 4 });
        b.end();
        f.end();
        return;
      }
      drawHorizontalPartition(b, l.x, l.width, l.partitionY);
      drawInventoryGrid(b, l.inventory.x, l.inventory.y, items, data, { playerInventory: true, showGrayedOutSlots: false, maxItems, currentToolIndex: current, tinyFont: this.tiny });
      const e = l.equipment;
      for (const [slot, tile] of [[e.leftRing, 41], [e.rightRing, 41], [e.boots, 40], [e.hat, 42]] as const) b.draw({ texture: MENU_TEXTURE, ...menuTile(tile), x: slot.x, y: slot.y });
      const clothing = (slot: { x: number; y: number }, empty: number, item: InventoryPageInfo["shirt"], kind: "shirt" | "pants") => {
        b.draw({ texture: MENU_TEXTURE, ...menuTile(item ? 10 : empty), x: slot.x, y: slot.y });
        if (!item) return;
        if (kind === "shirt") {
          const sx = (item.index * 8) % 128, sy = Math.floor((item.index * 8) / 128) * 32;
          b.draw({ texture: SHIRTS, sx, sy, sw: 8, sh: 8, x: slot.x + 32, y: slot.y + 32, originX: 0.5, originY: 0.5, scaleX: 4 });
          b.draw({ texture: SHIRTS, sx: sx + 128, sy, sw: 8, sh: 8, x: slot.x + 32, y: slot.y + 32, originX: 0.5, originY: 0.5, scaleX: 4, tint: item.color });
        } else {
          b.draw({ texture: PANTS, sx: 192 * (item.index % 10), sy: 688 * Math.floor(item.index / 10) + 672, sw: 16, sh: 16, x: slot.x + 32, y: slot.y + 32, originX: 0.5, originY: 0.5, scaleX: 4, tint: item.color });
        }
      };
      clothing(e.shirt, 69, info.shirt, "shirt");
      clothing(e.pants, 68, info.pants, "pants");
      b.draw({ texture: info.night ? "LooseSprites/nightbg" : "LooseSprites/daybg", sx: 0, sy: 0, sw: 128, sh: 192, x: l.portraitBg.x, y: l.portraitBg.y });
      if (this.font) {
        const text = (s: string, cx: number, y: number, alpha = 1) => drawShadowText(f, this.font!, DIALOGUE_FONT, s, cx - this.font!.measure(s).width / 2, y, TEXT_COLOR, alpha);
        text(info.farmerName, l.nameCenterX, l.nameY);
        text(info.strings.farmName.replace("{0}", info.farmName), l.infoCenterX, l.farmNameY);
        text(info.strings.funds.replace("{0}", withCommas(info.money)), l.infoCenterX, l.fundsY);
        text(info.strings.earnings.replace("{0}", withCommas(info.totalEarned)), l.infoCenterX, l.earningsY);
        text(info.date, l.infoCenterX, l.dateY, 0.8);
      }
      f.draw({ texture: CURSORS, sx: 162, sy: 440, sw: 16, sh: 16, x: l.organize.x, y: l.organize.y, scaleX: 4 });
      f.draw({ texture: CURSORS, sx: 564, sy: 102, sw: 18, sh: 26, x: l.trash.x, y: l.trash.y, scaleX: 4 });
      f.draw({ texture: CURSORS, sx: 564, sy: 129, sw: 18, sh: 10, x: l.trash.x + 60, y: l.trash.y + 40, originX: 16 / 18, originY: 1, scaleX: 4, rotation: this.trashLidRotation });
      f.draw({ texture: CURSORS, sx: 337, sy: 494, sw: 12, sh: 12, x: l.close.x, y: l.close.y, scaleX: 4 });
      if (this.held) drawItemInMenu(f, this.held, mouse.x + 16, mouse.y + 16, 1, 1, data);
      if (tooltip && this.small && this.font) drawTooltip(f, { small: this.small, smallTexture: SMALL_FONT, dialogue: this.font, dialogueTexture: DIALOGUE_FONT }, tooltip, mouse, this.held ? 40 : 0, { w: uiWidth, h: uiHeight }, energyStrings);
    }
    b.end();
    f.end();
  }
}
