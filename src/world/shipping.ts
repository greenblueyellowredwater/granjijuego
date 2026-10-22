import { canStackWith, parseId, type Item } from "./items.ts";

const FORAGE_IDS = new Set(["(O)396", "(O)406", "(O)296", "(O)402", "(O)418", "(O)414", "(O)410"]);
const BY_CATEGORY: Record<number, number> = {
  [-81]: 1, [-80]: 0, [-79]: 0, [-75]: 0,
  [-27]: 1, [-26]: 0, [-23]: 1, [-21]: 2, [-20]: 2,
  [-15]: 3, [-14]: 0, [-12]: 3,
  [-6]: 0, [-5]: 0, [-4]: 2, [-2]: 3,
};

export function shippingCategory(item: Item, category: number | undefined) {
  if (FORAGE_IDS.has(item.id)) return 1;
  if (parseId(item.id).type !== "O") return 4;
  return BY_CATEGORY[category ?? 0] ?? 4;
}

export interface ShippingSummary {
  items: Item[][];
  totals: number[];
}

export function consolidateStacks(items: Item[]) {
  const out: Item[] = [];
  for (const it of items) {
    const same = out.find((o) => canStackWith(o, it));
    if (same) same.stack += it.stack;
    else out.push({ ...it });
  }
  return out;
}

export function summarizeShipping(shipped: Item[], category: (item: Item) => number | undefined, price: (item: Item) => number): ShippingSummary {
  const items: Item[][] = [[], [], [], [], [], []];
  const totals = [0, 0, 0, 0, 0, 0];
  for (const it of consolidateStacks(shipped)) {
    const c = shippingCategory(it, category(it));
    items[c].push(it);
    totals[c] += price(it) * it.stack;
  }
  for (let i = 0; i < 5; i++) {
    totals[5] += totals[i];
    items[5].push(...items[i]);
  }
  return { items, totals };
}
