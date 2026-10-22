import { parseId, type Item, type ItemData } from "./items.ts";
import { objectContextTags, type GiftObjectData } from "./friendship.ts";

export interface MachineTrigger {
  Trigger: number;
  RequiredItemId?: string | null;
  RequiredTags?: string[] | null;
  RequiredCount?: number;
  Condition?: string | null;
}

export interface MachineOutputItem {
  ItemId?: string | null;
  RandomItemId?: string[] | null;
  MinStack?: number;
  MaxStack?: number;
  Quality?: number;
  CopyQuality?: boolean;
  CopyPrice?: boolean;
  PreserveType?: string | null;
  PreserveId?: string | null;
  Condition?: string | null;
  OutputMethod?: string | null;
}

export interface MachineRule {
  Id: string;
  Triggers?: MachineTrigger[] | null;
  UseFirstValidOutput?: boolean;
  OutputItem?: MachineOutputItem[] | null;
  MinutesUntilReady?: number;
  DaysUntilReady?: number;
}

export interface MachineData {
  OutputRules?: MachineRule[] | null;
  AdditionalConsumedItems?: { ItemId: string; RequiredCount: number; InvalidCountMessage?: string | null }[] | null;
  ShowNextIndexWhileWorking?: boolean;
  ShowNextIndexWhenReady?: boolean;
  InvalidCountMessage?: string | null;
}

export interface MachineState {
  held?: Item | null;
  minutesLeft?: number;
  ready?: boolean;
  showNext?: boolean;
}

export const PRESERVE_TYPES = ["Wine", "Jelly", "Pickle", "Juice", "Roe", "AgedRoe", "Honey", "Bait", "DriedFruit", "DriedMushroom", "SmokedFish"] as const;
const PRESERVE_NAME_KEYS = ["Wine", "Jelly", "Pickles", "Juice", "Roe", "AgedRoe", "Honey", "Bait", "DriedFruit", "DriedMushrooms", "SmokedFish"];
export const preserveNameKey = (type: number) => `${PRESERVE_NAME_KEYS[type] ?? "Wine"}_Flavored_Name`;

const XNA: Record<string, [number, number, number]> = {
  Aquamarine: [127, 255, 212], Cyan: [0, 255, 255], DarkBlue: [0, 0, 139], SaddleBrown: [139, 69, 19], DarkCyan: [0, 139, 139], DarkGray: [169, 169, 169],
  DarkGreen: [0, 100, 0], DarkOrange: [255, 140, 0], DeepPink: [255, 20, 147], DarkViolet: [148, 0, 211], DarkRed: [139, 0, 0], DarkGoldenrod: [184, 134, 11],
  Gold: [255, 215, 0], Gray: [128, 128, 128], Lime: [0, 255, 0], PaleVioletRed: [219, 112, 147], NavajoWhite: [255, 222, 173], SeaGreen: [46, 139, 87],
  White: [255, 255, 255], GreenYellow: [173, 255, 47],
};
const TAG_COLORS: Record<string, [number, number, number]> = {
  color_aquamarine: XNA.Aquamarine, color_black: [45, 45, 45], color_blue: [46, 85, 183], color_brown: [130, 73, 37], color_copper: [179, 85, 0], color_cyan: XNA.Cyan,
  color_dark_blue: XNA.DarkBlue, color_dark_brown: XNA.SaddleBrown, color_dark_cyan: XNA.DarkCyan, color_dark_gray: XNA.DarkGray, color_dark_green: XNA.DarkGreen,
  color_dark_orange: XNA.DarkOrange, color_dark_pink: XNA.DeepPink, color_dark_purple: XNA.DarkViolet, color_dark_red: XNA.DarkRed, color_dark_yellow: XNA.DarkGoldenrod,
  color_gold: XNA.Gold, color_gray: XNA.Gray, color_green: [10, 143, 0], color_iridium: [105, 15, 255], color_iron: [197, 213, 224], color_jade: [130, 158, 93],
  color_light_cyan: [180, 255, 255], color_lime: XNA.Lime, color_orange: [255, 128, 0], color_pale_violet_red: XNA.PaleVioletRed, color_pink: [255, 163, 186],
  color_poppyseed: [82, 47, 153], color_purple: [115, 41, 181], color_red: [220, 0, 0], color_salmon: [255, 85, 95], color_sand: XNA.NavajoWhite,
  color_sea_green: XNA.SeaGreen, color_white: XNA.White, color_yellow: [255, 230, 0], color_yellow_green: XNA.GreenYellow,
};

export function dyeColor(item: Item, objects: Record<string, GiftObjectData>): [number, number, number] | null {
  if (item.id === "(O)74") return [255, 255, 255];
  if (item.color) return item.color;
  for (const tag of objectContextTags(objects, item.id)) if (tag.startsWith("color_") && TAG_COLORS[tag]) return TAG_COLORS[tag];
  return null;
}

export const doAllTagsMatch = (required: string[], tags: Set<string>) => required.every((t) => (t.startsWith("!") ? !tags.has(t.slice(1).toLowerCase()) : tags.has(t.toLowerCase())));

type Objects = ItemData["objects"] & Record<string, GiftObjectData>;

export function findRule(m: MachineData, input: Item, objects: Objects, condition: (q: string | null | undefined) => boolean) {
  let countFail: { rule: MachineRule; trigger: MachineTrigger } | null = null;
  for (const rule of m.OutputRules ?? []) {
    for (const t of rule.Triggers ?? []) {
      if ((t.Trigger & 1) === 0) continue;
      if (t.Condition && !condition(t.Condition)) continue;
      if (t.RequiredItemId && t.RequiredItemId !== input.id) continue;
      if (t.RequiredTags?.length && !doAllTagsMatch(t.RequiredTags, objectContextTags(objects, input.id))) continue;
      if ((t.RequiredCount ?? 1) > input.stack) {
        countFail ??= { rule, trigger: t };
        continue;
      }
      return { rule, trigger: t, countFail: null };
    }
  }
  return { rule: null, trigger: null, countFail };
}

export function flavoredItem(type: number, ingredient: Item, objects: Objects): Item {
  const data = objects[parseId(ingredient.id).id] as (GiftObjectData & { Price?: number; Edibility?: number }) | undefined;
  const price = ingredient.price ?? data?.Price ?? 0;
  const edibility = ingredient.edibility ?? data?.Edibility ?? -300;
  const preserve = { type, id: parseId(ingredient.id).id };
  const color = dyeColor(ingredient, objects) ?? [255, 255, 255];
  switch (type) {
    case 0:
      return { id: "(O)348", stack: 1, quality: 0, price: price * 3, preserve, color, ...(edibility > 0 ? { edibility: Math.trunc(Math.fround(edibility * 1.75)) } : {}) };
    case 3:
      return { id: "(O)350", stack: 1, quality: 0, price: Math.trunc(price * Math.fround(2.25)), preserve, color, edibility: edibility > 0 ? Math.trunc(edibility * 2) : edibility === -300 ? Math.trunc(Math.fround(price * 0.4)) : edibility };
    case 1:
      return { id: "(O)344", stack: 1, quality: 0, price: price * 2 + 50, preserve, color, edibility: edibility > 0 ? Math.trunc(edibility * 2) : edibility === -300 ? Math.trunc(Math.fround(price * 0.2)) : edibility };
    case 2:
      return { id: "(O)342", stack: 1, quality: 0, price: price * 2 + 50, preserve, color, edibility: edibility > 0 ? Math.trunc(Math.fround(edibility * 1.75)) : edibility === -300 ? Math.trunc(price * 0.25) : edibility };
    case 6:
      return { id: "(O)340", stack: 1, quality: 0, price: ((objects["340"] as { Price?: number } | undefined)?.Price ?? 100) + price * 2, preserve };
    default:
      return { id: ingredient.id, stack: 1, quality: 0 };
  }
}

export function createOutput(out: MachineOutputItem, input: Item, objects: Objects, random: () => number = Math.random): Item | null {
  let id = out.ItemId ?? out.RandomItemId?.[Math.floor(random() * out.RandomItemId.length)] ?? null;
  if (!id) return null;
  let item: Item;
  if (id === "DROP_IN") item = { ...input, stack: 1 };
  else if (id.startsWith("FLAVORED_ITEM")) {
    const [, type, ingredientRaw] = id.split(" ");
    const ingredientId = ingredientRaw === "DROP_IN_ID" ? input.id : ingredientRaw.startsWith("(") ? ingredientRaw : `(O)${ingredientRaw}`;
    const t = PRESERVE_TYPES.indexOf(type as (typeof PRESERVE_TYPES)[number]);
    if (t < 0) return null;
    item = flavoredItem(t, ingredientRaw === "DROP_IN_ID" ? input : { id: ingredientId, stack: 1 }, objects);
  } else {
    if (id === "DROP_IN_ID") id = input.id;
    item = { id: id.startsWith("(") ? id : `(O)${id}`, stack: 1, quality: 0 };
  }
  const min = out.MinStack ?? -1, max = out.MaxStack ?? -1;
  if (min > 0) item.stack = max > min ? min + Math.floor(random() * (max - min + 1)) : min;
  if ((out.Quality ?? -1) >= 0) item.quality = out.Quality;
  if (out.CopyQuality) item.quality = input.quality ?? 0;
  if (out.CopyPrice) item.price = input.price ?? (objects[parseId(input.id).id] as { Price?: number } | undefined)?.Price;
  return item;
}

export const convertTimeToMinutes = (time: number) => Math.trunc(time / 100) * 60 + (time % 100);
export const minutesUntilMorning = (time: number, days = 1) => (days < 1 ? 0 : convertTimeToMinutes(2600) - convertTimeToMinutes(time) + 400 + (days - 1) * 1600);

export function readyMinutes(rule: MachineRule, time: number) {
  if ((rule.MinutesUntilReady ?? -1) >= 0) return rule.MinutesUntilReady!;
  if ((rule.DaysUntilReady ?? -1) >= 0) return minutesUntilMorning(time, rule.DaysUntilReady);
  return 0;
}

export function minutesElapsed(s: MachineState, minutes: number) {
  if (!s.held || s.ready) return;
  s.minutesLeft = (s.minutesLeft ?? 0) - minutes;
  if (s.minutesLeft <= 0) {
    s.minutesLeft = 0;
    s.ready = true;
  }
}
