import { createRandom } from "./dotnet-random.ts";
import { shortDayName } from "./calendar-names.ts";

export interface DialoguePage {
  text: string;
  portrait: number;
}

const EMOTIONS: Record<string, number> = { $h: 1, $s: 2, $u: 3, $l: 4, $a: 5, $neutral: 0 };

export const dialogueChunks = (raw: string) => raw.split("#$e#").filter((c) => c.trim());

export function parseDialogue(raw: string, playerName: string, male = true): DialoguePage[] {
  const pages: DialoguePage[] = [];
  for (const part of raw.split("#$b#")) {
    for (const piece of part.split("#")) {
      let text = piece.trim();
      if (!text) continue;
      let portrait = 0;
      const emotion = /\$(h|s|u|l|a|neutral|\d+)\s*$/.exec(text);
      if (emotion) {
        portrait = EMOTIONS[`$${emotion[1]}`] ?? Number(emotion[1]);
        text = text.slice(0, emotion.index).trim();
      }
      if (text.startsWith("$")) continue;
      if (text.includes("^")) {
        const [m, f] = text.split("^");
        text = male ? m : (f ?? m);
      }
      text = text.replace(/@/g, playerName).replace(/\$[a-z](\s|$)/g, "");
      pages.push({ text, portrait });
    }
  }
  return pages;
}

export interface DialogueContext {
  season: string;
  dayOfMonth: number;
  year: number;
  hearts: number;
  raining: boolean;
  daysPlayed: number;
  uniqueId: number;
  homePixel: { x: number; y: number };
}

export function retrieveDialogue(dialogues: Record<string, string>, prefix: string, hearts: number, year: number, dayOfMonth: number, postfix = ""): string | null {
  const y = Math.min(year, 2);
  const dow = shortDayName(dayOfMonth);
  const get = (k: string) => dialogues[k] ?? null;
  if (y === 1 && get(`${prefix}${dayOfMonth}${postfix}`)) return get(`${prefix}${dayOfMonth}${postfix}`);
  if (get(`${prefix}${dayOfMonth}_${y}${postfix}`)) return get(`${prefix}${dayOfMonth}_${y}${postfix}`);
  if (get(`${prefix}${dayOfMonth}_*${postfix}`)) return get(`${prefix}${dayOfMonth}_*${postfix}`);
  for (let h = 10; h >= 2; h -= 2) {
    if (hearts < h) continue;
    const found = get(`${prefix}${dow}${h}_${y}${postfix}`) ?? get(`${prefix}${dow}${h}${postfix}`);
    if (found) return found;
  }
  const base = get(`${prefix}${dow}${postfix}`);
  if (base) return get(`${prefix}${dow}_${y}${postfix}`) ?? base;
  return null;
}

export function dailyDialogue(name: string, dialogues: Record<string, string>, rainy: Record<string, string>, ctx: DialogueContext) {
  const r = createRandom(ctx.daysPlayed, Math.floor(ctx.uniqueId / 2), ctx.daysPlayed * 77, 2 + ctx.homePixel.x * 77, ctx.homePixel.y * 777);
  r.nextDouble();
  if (ctx.raining && r.nextDouble() < 0.5 && name !== "Krobus" && rainy[name]) return { key: `rainy:${name}`, text: rainy[name] };
  const seasonal = retrieveDialogue(dialogues, `${ctx.season}_`, ctx.hearts, ctx.year, ctx.dayOfMonth);
  if (seasonal) return { key: "seasonal", text: seasonal };
  const plain = retrieveDialogue(dialogues, "", ctx.hearts, ctx.year, ctx.dayOfMonth);
  return plain ? { key: "daily", text: plain } : null;
}
