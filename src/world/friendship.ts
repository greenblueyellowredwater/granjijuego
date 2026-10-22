import { parseId } from "./items.ts";
import { SEASON_ORDER } from "./clock.ts";

export interface GiftObjectData {
  Name?: string;
  Type?: string;
  Category?: number;
  Price?: number;
  Edibility?: number;
  ContextTags?: string[] | null;
  CanBeGivenAsGift?: boolean;
  GeodeDropsDefaultItems?: boolean;
  GeodeDrops?: unknown[] | null;
}

export interface Friendship {
  points: number;
  talkedToday: boolean;
  giftsToday?: number;
  giftsThisWeek?: number;
  lastGiftDay?: number;
}

export const enum GiftTaste {
  Love = 0,
  Like = 2,
  Dislike = 4,
  Hate = 6,
  StardropTea = 7,
  Neutral = 8,
}

const CATEGORY_TAGS: Record<number, string> = {
  [-101]: "trinket", [-100]: "clothing", [-99]: "tool", [-98]: "weapon", [-97]: "boots", [-96]: "ring", [-95]: "hat",
  [-81]: "greens", [-80]: "flowers", [-79]: "fruits", [-75]: "vegetable", [-74]: "seeds",
  [-29]: "equipment", [-28]: "monster_loot", [-27]: "syrup", [-26]: "artisan_goods", [-25]: "ingredients", [-24]: "furniture",
  [-23]: "sell_at_fish_shop", [-22]: "tackle", [-21]: "bait", [-20]: "junk", [-19]: "fertilizer",
  [-18]: "sell_at_pierres_and_marnies", [-17]: "sell_at_pierres", [-16]: "building_resources", [-15]: "metal_resources", [-14]: "meat",
  [-12]: "minerals", [-9]: "big_craftable", [-8]: "crafting", [-7]: "cooking", [-6]: "milk", [-5]: "egg", [-4]: "fish", [-2]: "gem",
  [-999]: "litter",
};

export const sanitizeTag = (s: string) => s.trim().toLowerCase().replace(/ /g, "_").replace(/'/g, "");

export function objectContextTags(objects: Record<string, GiftObjectData>, qualifiedId: string) {
  const { id } = parseId(qualifiedId);
  const data = objects[id];
  const tags = new Set<string>([sanitizeTag(`id_${qualifiedId}`), sanitizeTag(`id_o_${id}`)]);
  if (!data) return tags;
  for (const t of data.ContextTags ?? []) tags.add(t.toLowerCase());
  if (data.GeodeDropsDefaultItems || data.GeodeDrops?.length) tags.add("geode");
  if (data.CanBeGivenAsGift === false) tags.add("not_giftable");
  if (data.Name) tags.add(`item_${sanitizeTag(data.Name)}`);
  if (data.Type) tags.add(`item_type_${sanitizeTag(data.Type)}`);
  const category = CATEGORY_TAGS[data.Category ?? 0];
  if (category) tags.add(`category_${category}`);
  return tags;
}

export function canBeGivenAsGift(objects: Record<string, GiftObjectData>, qualifiedId: string) {
  const { type, id } = parseId(qualifiedId);
  if (type !== "O") return false;
  const data = objects[id];
  if (data && data.CanBeGivenAsGift === false) return false;
  return !objectContextTags(objects, qualifiedId).has("not_giftable");
}

const split = (s: string | undefined) => (s ?? "").split(" ").filter((x) => x.length > 0);

function resolveTasteId(objects: Record<string, GiftObjectData>, entry: string) {
  if (entry.startsWith("(")) return entry;
  return objects[entry] ? `(O)${entry}` : null;
}

function checkTaste(objects: Record<string, GiftObjectData>, list: string[], qualifiedId: string) {
  return list.some((e) => !e.startsWith("-") && resolveTasteId(objects, e) === qualifiedId);
}

function checkTags(tags: Set<string>, list: string[]) {
  return list.some((e) => e.length > 0 && !/^\d/.test(e) && !e.startsWith("-") && tags.has(e.toLowerCase()));
}

export function giftTaste(name: string, qualifiedId: string, objects: Record<string, GiftObjectData>, tastes: Record<string, string>): GiftTaste {
  if (qualifiedId === "(O)StardropTea") return GiftTaste.StardropTea;
  const { type, id } = parseId(qualifiedId);
  let taste: GiftTaste = GiftTaste.Neutral;
  if (type !== "O") return taste;
  const data = objects[id] ?? {};
  const categoryValue = data.Category ?? 0;
  const category = String(categoryValue);
  const tags = objectContextTags(objects, qualifiedId);
  const love = split(tastes.Universal_Love), hate = split(tastes.Universal_Hate), like = split(tastes.Universal_Like), dislike = split(tastes.Universal_Dislike), neutral = split(tastes.Universal_Neutral);
  if (love.includes(category)) taste = GiftTaste.Love;
  else if (hate.includes(category)) taste = GiftTaste.Hate;
  else if (like.includes(category)) taste = GiftTaste.Like;
  else if (dislike.includes(category)) taste = GiftTaste.Dislike;
  if (checkTags(tags, love)) taste = GiftTaste.Love;
  else if (checkTags(tags, hate)) taste = GiftTaste.Hate;
  else if (checkTags(tags, like)) taste = GiftTaste.Like;
  else if (checkTags(tags, dislike)) taste = GiftTaste.Dislike;
  let explicit = false, explicitNeutral = false;
  if (checkTaste(objects, love, qualifiedId)) [taste, explicit] = [GiftTaste.Love, true];
  else if (checkTaste(objects, hate, qualifiedId)) [taste, explicit] = [GiftTaste.Hate, true];
  else if (checkTaste(objects, like, qualifiedId)) [taste, explicit] = [GiftTaste.Like, true];
  else if (checkTaste(objects, dislike, qualifiedId)) [taste, explicit] = [GiftTaste.Dislike, true];
  else if (checkTaste(objects, neutral, qualifiedId)) [taste, explicit, explicitNeutral] = [GiftTaste.Neutral, true, true];
  if (data.Type === "Arch") taste = name === "Penny" || name === "Dwarf" ? GiftTaste.Like : GiftTaste.Dislike;
  if (taste === GiftTaste.Neutral && !explicitNeutral) {
    const edibility = data.Edibility ?? -300;
    if (edibility !== -300 && edibility < 0) taste = GiftTaste.Hate;
    else if ((data.Price ?? 0) < 20) taste = GiftTaste.Dislike;
  }
  const personal = tastes[name];
  if (personal === undefined) return taste;
  const fields = personal.split("/");
  const lists = [1, 3, 5, 7, 9].map((i) => split(fields[i]));
  const order: [number, GiftTaste][] = [[0, GiftTaste.Love], [3, GiftTaste.Hate], [1, GiftTaste.Like], [2, GiftTaste.Dislike], [4, GiftTaste.Neutral]];
  for (const [i, t] of order) if (checkTaste(objects, lists[i], qualifiedId)) return t;
  for (const [i, t] of order) if (checkTags(tags, lists[i])) return t;
  if (explicit || categoryValue === 0) return taste;
  for (const [i, t] of order) if (lists[i].includes(category)) return t;
  return taste;
}

export function qualityMultiplier(quality: number) {
  switch (quality) {
    case 1:
      return Math.fround(1.1);
    case 2:
      return 1.25;
    case 4:
      return 1.5;
    default:
      return 1;
  }
}

export function giftFriendshipChange(taste: GiftTaste, quality: number, birthday: boolean) {
  const m = birthday ? 8 : 1;
  const q = qualityMultiplier(quality);
  switch (taste) {
    case GiftTaste.StardropTea:
      return Math.min(750, Math.trunc(250 * m));
    case GiftTaste.Love:
      return Math.trunc(Math.fround(Math.fround(80 * m) * q));
    case GiftTaste.Hate:
      return Math.trunc(-40 * m);
    case GiftTaste.Like:
      return Math.trunc(Math.fround(Math.fround(45 * m) * q));
    case GiftTaste.Dislike:
      return Math.trunc(-20 * m);
    default:
      return Math.trunc(20 * m);
  }
}

export const giftEmote = (taste: GiftTaste) => (taste === GiftTaste.StardropTea ? 56 : taste === GiftTaste.Love ? 20 : taste === GiftTaste.Hate ? 12 : null);

export const maximumHearts = (datable: boolean) => (datable ? 8 : 10);

export function changeFriendship(f: Friendship, amount: number, datable: boolean) {
  f.points = Math.max(0, Math.min(f.points + amount, (maximumHearts(datable) + 1) * 250 - 1));
}

export function totalDays(year: number, season: string, dayOfMonth: number) {
  return ((year - 1) * 4 + Math.max(0, SEASON_ORDER.indexOf(season as (typeof SEASON_ORDER)[number]))) * 28 + (dayOfMonth - 1);
}

export const totalSundayWeeks = (days: number) => Math.trunc((days + 1) / 7);

export type GiftRefusal = { kind: "alreadyToday" } | { kind: "weekLimit" };

export function canReceiveGiftNow(f: Friendship | undefined, birthday: boolean, qualifiedId: string): GiftRefusal | null {
  if (f && (f.giftsThisWeek ?? 0) >= 2 && !birthday && qualifiedId !== "(O)StardropTea") return { kind: "weekLimit" };
  if (f && (f.giftsToday ?? 0) === 1 && qualifiedId !== "(O)StardropTea") return { kind: "alreadyToday" };
  return null;
}

export function recordGift(f: Friendship, today: number) {
  f.giftsToday = (f.giftsToday ?? 0) + 1;
  f.giftsThisWeek = (f.giftsThisWeek ?? 0) + 1;
  f.lastGiftDay = today;
}

export function resetFriendshipsForNewDay(friendship: Record<string, Friendship>, datable: (name: string) => boolean | null, today: number) {
  for (const [name, f] of Object.entries(friendship)) {
    const d = datable(name);
    if (d === null) continue;
    if (f.talkedToday) f.talkedToday = false;
    else if (d ? f.points < 2000 : f.points < 2500) changeFriendship(f, -2, d);
  }
  for (const [name, f] of Object.entries(friendship)) {
    if (f.lastGiftDay !== today) f.giftsToday = 0;
    if (f.lastGiftDay === undefined || totalSundayWeeks(f.lastGiftDay) !== totalSundayWeeks(today)) {
      const d = datable(name);
      if ((f.giftsThisWeek ?? 0) >= 2 && d !== null) changeFriendship(f, 10, d);
      f.giftsThisWeek = 0;
    }
  }
}

const TASTE_NAMES: Record<number, [string, string]> = {
  [GiftTaste.Love]: ["Loved", "Positive"],
  [GiftTaste.StardropTea]: ["Loved", "Positive"],
  [GiftTaste.Like]: ["Liked", "Positive"],
  [GiftTaste.Dislike]: ["Disliked", "Negative"],
  [GiftTaste.Hate]: ["Hated", "Negative"],
};

export interface GiftReactionContext {
  name: string;
  qualifiedId: string;
  taste: GiftTaste;
  birthday: boolean;
  rude: boolean;
  tags: Set<string>;
  dialogue: Record<string, string>;
  tastes: Record<string, string>;
  strings: Record<string, string>;
  nextBool: () => boolean;
}

export function giftReaction(c: GiftReactionContext): { text: string; emotion: string | null } | null {
  const personal = c.tastes[c.name];
  if (personal === undefined) return null;
  const prefix = c.birthday ? "AcceptBirthdayGift" : "AcceptGift";
  const get = (key: string) => c.dialogue[key];
  const [specific, general] = TASTE_NAMES[c.taste] ?? ["Neutral", "Positive"];
  let text = get(`${prefix}_${c.qualifiedId}`);
  for (const tag of c.tags) text ??= get(`${prefix}_${tag}`);
  for (const tag of c.tags) text ??= get(`${prefix}_${specific}_${tag}`) ?? get(`${prefix}_${general}_${tag}`);
  text ??= get(`${prefix}_${specific}`) ?? get(`${prefix}_${general}`) ?? get(prefix);
  const positive = c.taste === GiftTaste.Love || c.taste === GiftTaste.Like || c.taste === GiftTaste.StardropTea;
  const negative = c.taste === GiftTaste.Dislike || c.taste === GiftTaste.Hate;
  const emotion = positive ? "$h" : negative ? "$s" : null;
  if (text === undefined) {
    if (c.birthday) {
      const key = positive ? (c.nextBool() ? (c.rude ? "4276" : "4277") : c.rude ? "4274" : "4275") : negative ? (c.rude ? "4278" : "4279") : c.rude ? "4280" : "4281";
      text = (c.strings[`NPC.cs.${key}`] ?? "").split("/")[0];
    } else {
      const fields = personal.split("/");
      const index = c.taste === GiftTaste.StardropTea ? 0 : positive || negative ? c.taste : 8;
      text = fields[index] ?? "";
    }
  }
  return { text, emotion };
}
