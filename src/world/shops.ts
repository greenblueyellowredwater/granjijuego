import { checkConditions, type GsqContext } from "./gsq.ts";
import { parseId } from "./items.ts";

export interface QuantityModifier {
  Id?: string;
  Condition?: string | null;
  Modification: number;
  Amount: number;
  RandomAmount?: number[] | null;
}

export interface ShopItemData {
  Id?: string;
  ItemId?: string | null;
  Price?: number;
  Condition?: string | null;
  AvailableStock?: number;
  PriceModifiers?: QuantityModifier[] | null;
  IgnoreShopPriceModifiers?: boolean;
  UseObjectDataPrice?: boolean;
}

export interface ShopData {
  Items: ShopItemData[];
  PriceModifiers?: QuantityModifier[] | null;
  PriceModifierMode?: number;
  Owners?: { Name: string; Condition?: string | null; ClosedMessage?: string | null }[] | null;
  SalableItemTags?: string[] | null;
}

export interface StockEntry {
  id: string;
  price: number;
  stock: number;
}

export function applyModification(value: number, modification: number, amount: number) {
  switch (modification) {
    case 0:
      return value + amount;
    case 1:
      return value - amount;
    case 2:
      return value * amount;
    case 3:
      return value / amount;
    case 4:
      return amount;
    default:
      return value;
  }
}

export function applyModifiers(value: number, modifiers: QuantityModifier[] | null | undefined, mode: number, ctx: GsqContext) {
  if (!modifiers?.length) return value;
  let min: number | null = null, max: number | null = null, stacked = value;
  for (const m of modifiers) {
    if (!checkConditions(m.Condition, ctx)) continue;
    const amount = m.RandomAmount?.length ? m.RandomAmount[ctx.random.next(m.RandomAmount.length)] : m.Amount;
    const v = applyModification(value, m.Modification, amount);
    if (mode === 1) min = min === null ? v : Math.min(min, v);
    else if (mode === 2) max = max === null ? v : Math.max(max, v);
    else stacked = applyModification(stacked, m.Modification, amount);
  }
  if (mode === 1) return min ?? value;
  if (mode === 2) return max ?? value;
  return stacked;
}

export function shopStock(shop: ShopData, basePrice: (qualifiedId: string, useObjectDataPrice: boolean) => number | null, ctx: GsqContext): StockEntry[] {
  const out: StockEntry[] = [];
  for (const item of shop.Items) {
    const id = item.ItemId ?? item.Id;
    if (!id || !/^\(\w+\)\S+$/.test(id)) continue;
    if (!checkConditions(item.Condition, ctx)) continue;
    let price = item.Price !== undefined && item.Price >= 0 ? item.Price : basePrice(id, !!item.UseObjectDataPrice);
    if (price === null) continue;
    if (!item.IgnoreShopPriceModifiers) price = applyModifiers(price, shop.PriceModifiers, shop.PriceModifierMode ?? 0, ctx);
    price = applyModifiers(price, item.PriceModifiers, 0, ctx);
    out.push({ id, price: Math.trunc(price), stock: item.AvailableStock !== undefined && item.AvailableStock >= 0 ? item.AvailableStock : Infinity });
  }
  return out;
}

const RESOURCE_PRICES: Record<string, [number, number]> = { "388": [10, 50], "390": [20, 100], "382": [120, 250], "378": [80, 160], "380": [150, 250], "384": [350, 750] };

export function objectSalePrice(id: string, price: number, year: number, quality = 0) {
  const fixed = RESOURCE_PRICES[id];
  if (fixed) return year > 1 ? fixed[1] : fixed[0];
  return Math.trunc(Math.fround(price * 2 * Math.fround(1 + quality * 0.25)));
}

export function objectBasePrice(objects: Record<string, { Price?: number }>, qualifiedId: string, useObjectDataPrice = false, year = 1) {
  const { type, id } = parseId(qualifiedId);
  if (type !== "O") return null;
  const price = objects[id]?.Price;
  if (price === undefined) return null;
  return useObjectDataPrice ? price : objectSalePrice(id, price, year);
}
