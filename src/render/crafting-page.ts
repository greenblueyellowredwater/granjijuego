import type { UiBatch } from "./ui-batch.ts";
import { itemSprite, type ItemData } from "../world/items.ts";
import type { RecipeSlot } from "../world/crafting.ts";
import { numberSpriteQuads } from "./skills-page.ts";

const CURSORS = "LooseSprites/Cursors";

export function craftingLayout(x: number, y: number, width: number, height: number) {
  const pageY = y + 96 + 40 - 16;
  return {
    recipeOrigin: { x: x + 16 + 40 - 16, y: pageY },
    partitionY: y + 40 + 96 + 256,
    inventory: { x: x + 16 + 40, y: y + 96 + 40 + 320 - 16 },
    trash: { x: x + width + 4, y: y + height - 192 - 32 - 40 - 104 },
    up: { x: x + 768 + 32, y: pageY },
    down: { x: x + 768 + 32, y: pageY + 192 + 32 },
  };
}

export const recipeBounds = (origin: { x: number; y: number }, s: RecipeSlot) => ({ x: origin.x + s.col * 72, y: origin.y + s.row * 72, w: 64, h: s.recipe.big ? 128 : 64 });

export function drawRecipes(b: UiBatch, slots: RecipeSlot[], page: number, origin: { x: number; y: number }, data: ItemData, craftable: (s: RecipeSlot) => boolean, pageCount: number) {
  for (const s of slots) {
    if (s.page !== page) continue;
    const r = recipeBounds(origin, s);
    const sprite = itemSprite({ id: s.recipe.output, stack: 1 }, data);
    const ok = craftable(s);
    if (sprite) b.draw({ ...sprite, x: r.x, y: r.y, scaleX: 4, tint: ok ? 0xffffff : 0x696969, alpha: ok ? 1 : 0.4 });
    if (s.recipe.produced > 1) for (const q of numberSpriteQuads(s.recipe.produced, r.x + 62, r.y + 62, 0.5)) b.draw({ texture: CURSORS, sx: q.sx, sy: q.sy, sw: 8, sh: 8, x: q.x + 8, y: q.y + 8, scaleX: 2, tint: ok ? 0xffffff : 0xd3d3d3, alpha: ok ? 1 : 0.75 });
  }
  const l = { up: { x: origin.x + 760, y: origin.y }, down: { x: origin.x + 760, y: origin.y + 224 } };
  if (page > 0) b.draw({ texture: CURSORS, sx: 64, sy: 64, sw: 64, sh: 64, x: l.up.x, y: l.up.y, scaleX: 0.8 });
  if (page < pageCount - 1) b.draw({ texture: CURSORS, sx: 0, sy: 64, sw: 64, sh: 64, x: l.down.x, y: l.down.y, scaleX: 0.8 });
}
