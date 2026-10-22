export interface Item {
  id: string;
  stack: number;
  quality?: number;
}

export interface ItemData {
  tools: Record<string, { Texture?: string | null; SpriteIndex: number; MenuSpriteIndex?: number; ClassName?: string; UpgradeLevel?: number }>;
  weapons: Record<string, { Texture?: string | null; SpriteIndex: number; Type?: number }>;
  objects: Record<string, { Texture?: string | null; SpriteIndex: number; Category?: number; Price?: number; Type?: string; Name?: string; Edibility?: number }>;
  bigCraftables?: Record<string, { Texture?: string | null; SpriteIndex: number; Name?: string; DisplayName?: string; Description?: string; Price?: number }>;
  textureWidths: Record<string, number>;
}

export const STARTING_TOOLS = ["(T)Axe", "(T)Hoe", "(T)WateringCan", "(T)Pickaxe", "(W)47"];
export const INVENTORY_SIZE = 12;

export function parseId(qualified: string) {
  const m = /^\((\w+)\)(.*)$/.exec(qualified);
  return m ? { type: m[1], id: m[2] } : { type: "O", id: qualified };
}

export function maximumStack(item: Item) {
  const { type } = parseId(item.id);
  return type === "O" ? 999 : 1;
}

const square = (index: number, width: number) => ({ sx: (index * 16) % width, sy: Math.floor((index * 16) / width) * 16, sw: 16, sh: 16 });
const normalize = (t: string) => t.replace(/\\/g, "/");

export function itemSprite(item: Item, data: ItemData) {
  const { type, id } = parseId(item.id);
  if (type === "T") {
    const t = data.tools[id];
    if (!t) return null;
    const texture = normalize(t.Texture ?? "TileSheets/tools");
    const index = (t.MenuSpriteIndex ?? -1) > -1 ? t.MenuSpriteIndex! : t.SpriteIndex;
    return { texture, ...square(index, data.textureWidths[texture] ?? 336) };
  }
  if (type === "W") {
    const w = data.weapons[id];
    if (!w) return null;
    const texture = normalize(w.Texture ?? "TileSheets/weapons");
    return { texture, ...square(w.SpriteIndex, data.textureWidths[texture] ?? 128) };
  }
  if (type === "BC") {
    const b = data.bigCraftables?.[id];
    if (!b) return null;
    const texture = normalize(b.Texture ?? "TileSheets/Craftables");
    const w = data.textureWidths[texture] ?? 128;
    return { texture, sx: (b.SpriteIndex * 16) % w, sy: Math.floor((b.SpriteIndex * 16) / w) * 32, sw: 16, sh: 32 };
  }
  const o = data.objects[id];
  if (!o) return null;
  const texture = normalize(o.Texture ?? "Maps/springobjects");
  return { texture, ...square(o.SpriteIndex, data.textureWidths[texture] ?? 384) };
}

export function startingInventory(): (Item | null)[] {
  const slots: (Item | null)[] = Array(INVENTORY_SIZE).fill(null);
  STARTING_TOOLS.forEach((id, i) => (slots[i] = { id, stack: 1 }));
  return slots;
}

export function addItem(slots: (Item | null)[], item: Item): Item | null {
  let remaining = item.stack;
  const max = maximumStack(item);
  for (const s of slots) {
    if (!s || s.id !== item.id || (s.quality ?? 0) !== (item.quality ?? 0) || remaining === 0) continue;
    const take = Math.min(max - s.stack, remaining);
    s.stack += take;
    remaining -= take;
  }
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (slots[i]) continue;
    const take = Math.min(max, remaining);
    slots[i] = { ...item, stack: take };
    remaining -= take;
  }
  return remaining > 0 ? { ...item, stack: remaining } : null;
}

export function consumeOne(slots: (Item | null)[], index: number) {
  const s = slots[index];
  if (!s) return;
  s.stack--;
  if (s.stack <= 0) slots[index] = null;
}

export function tinyDigits(value: number, scale: number) {
  const digits = String(Math.max(0, Math.trunc(value)));
  const out: { sx: number; x: number }[] = [];
  let x = 0;
  for (const d of digits) {
    out.push({ sx: 368 + Number(d) * 5, x });
    x += Math.trunc(5 * scale) - 1;
  }
  return { width: Math.trunc(digits.length * 5 * scale), glyphs: out };
}
