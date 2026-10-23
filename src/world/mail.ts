import { checkConditions, type GsqContext } from "./gsq.ts";

export interface MailState {
  mailbox: string[];
  mailForTomorrow: string[];
  mailReceived: string[];
}

export const NOT_IN_MAILBOX = "%&NL&%";

export function hasOrWillReceiveMail(s: MailState, id: string) {
  return s.mailReceived.includes(id) || s.mailbox.includes(id) || s.mailForTomorrow.includes(id) || s.mailForTomorrow.includes(id + NOT_IN_MAILBOX);
}

export function addMailForTomorrow(s: MailState, id: string, noLetter = false) {
  const clean = id.trim();
  if (hasOrWillReceiveMail(s, clean)) return;
  s.mailForTomorrow.push(noLetter ? clean + NOT_IN_MAILBOX : clean);
}

export function addMail(s: MailState, id: string, noLetter = false) {
  const clean = id.trim();
  if (hasOrWillReceiveMail(s, clean)) return;
  if (noLetter) s.mailReceived.push(clean);
  else s.mailbox.push(clean);
}

export function receiveMailForTomorrow(s: MailState) {
  for (const raw of s.mailForTomorrow) {
    const id = raw.replace(NOT_IN_MAILBOX, "");
    if (raw.includes(NOT_IN_MAILBOX)) {
      if (!s.mailReceived.includes(id)) s.mailReceived.push(id);
    } else s.mailbox.push(raw);
  }
  s.mailForTomorrow = [];
}

export function friendGiftLetter(friendship: Record<string, { points: number }>, mail: Record<string, string>, random: () => number, spouse: string | null) {
  const names = Object.keys(friendship);
  if (!names.length) return null;
  const name = names[Math.floor(random() * names.length)];
  const points = friendship[name].points;
  if (!(random() < Math.trunc(points / 250) * 0.1)) return null;
  if (name === spouse || !(name in mail)) return null;
  return name;
}

export function seasonalLetter(season: string, day: number, year: number, mail: Record<string, string>) {
  const withYear = `${season}_${day}_${year}`;
  if (withYear in mail) return withYear;
  const plain = `${season}_${day}`;
  return plain in mail ? plain : null;
}

export interface TriggerAction {
  Id: string;
  Trigger: string;
  Condition: string | null;
  SkipPermanentlyCondition?: string | null;
  Action: string | null;
  Actions: string[] | null;
  MarkActionApplied?: boolean;
}

export interface TriggerHost {
  mail: MailState;
  applied: string[];
  markEventSeen(id: string): void;
}

export function runTriggers(trigger: string, actions: TriggerAction[], ctx: GsqContext, host: TriggerHost) {
  for (const a of actions) {
    if (a.Trigger !== trigger) continue;
    if (host.applied.includes(a.Id)) continue;
    if (a.SkipPermanentlyCondition && checkConditions(a.SkipPermanentlyCondition, ctx)) {
      host.applied.push(a.Id);
      continue;
    }
    if (!checkConditions(a.Condition, ctx)) continue;
    for (const raw of [a.Action, ...(a.Actions ?? [])]) if (raw) runAction(raw, host);
    if (a.MarkActionApplied !== false) host.applied.push(a.Id);
  }
}

export function runAction(raw: string, host: TriggerHost) {
  const args = raw.trim().split(/\s+/);
  switch (args[0]) {
    case "AddMail": {
      const type = (args[3] ?? "Tomorrow").toLowerCase();
      if (type === "now") addMail(host.mail, args[2]);
      else if (type === "received") addMail(host.mail, args[2], true);
      else addMailForTomorrow(host.mail, args[2]);
      return true;
    }
    case "MarkEventSeen":
      host.markEventSeen(args[2]);
      return true;
    default:
      return false;
  }
}

export interface ParsedLetter {
  pages: string[];
  title: string;
  text: string;
  items: { id: string; count: number }[];
  money: number;
  recipe: { kind: "cooking" | "crafting"; name: string } | null;
  quest: string | null;
  bg: number;
  color: string | null;
}

export interface LetterContext {
  playerName: string;
  male: boolean;
  random: () => number;
  cookingRecipes: Record<string, string>;
  craftingRecipes: Record<string, string>;
  knownCooking: string[];
}

export function letterBackground(title: string) {
  if (title === "winter_5_2" || title === "winter_12_1" || title.toLowerCase().includes("wizard")) return 2;
  if (title === "Sandy") return 1;
  if (title.includes("Krobus")) return 3;
  if (title.includes("passedOut1") || title === "landslideDone" || title === "FizzIntro") return 4;
  return 0;
}

export function applyGenderSwitch(text: string, male: boolean) {
  return text.replace(/\$\{([^^}]*)\^([^^}]*)(\^[^}]*)?\}\$?/g, (_m, a: string, b: string) => (male ? a : b));
}

export function parseLetter(raw: string, mailTitle: string, ctx: LetterContext): Omit<ParsedLetter, "pages"> {
  let text = raw.split("[#]")[0];
  const titleText = raw.split("[#]")[1] ?? "";
  text = text.replaceAll("@", ctx.playerName);
  text = applyGenderSwitch(text, ctx.male);
  let bg = letterBackground(mailTitle);
  let color: string | null = null;
  text = text.replace(/\[(letterbg|textcolor)\s+([^\]]*)\]/g, (_m, kind: string, value: string) => {
    if (kind === "letterbg") {
      const parts = value.trim().split(/\s+/);
      bg = Number(parts[parts.length - 1]);
    } else color = value.trim().toLowerCase();
    return "";
  });
  text = text.replace(/%action[^%]*%%/g, "");
  const items: { id: string; count: number }[] = [];
  let money = 0;
  let recipe: ParsedLetter["recipe"] = null;
  let quest: string | null = null;
  text = text.replace(/%item([^%]*)%%/g, (_m, body: string) => {
    const words = body.trim().split(/\s+/);
    const kind = (words[0] ?? "").toLowerCase();
    const rest = words.slice(1);
    const pick = () => {
      if (rest.length === 1) return { id: rest[0], count: 1 };
      let i = Math.floor(ctx.random() * rest.length);
      i -= i % 2;
      return { id: rest[i], count: Number(rest[i + 1]) };
    };
    switch (kind) {
      case "id":
        items.push(pick());
        break;
      case "object": {
        const p = pick();
        items.push({ id: p.id.startsWith("(") ? p.id : `(O)${p.id}`, count: p.count });
        break;
      }
      case "bigobject":
        items.push({ id: `(BC)${rest[Math.floor(ctx.random() * rest.length)]}`, count: 1 });
        break;
      case "furniture":
        items.push({ id: `(F)${rest[Math.floor(ctx.random() * rest.length)]}`, count: 1 });
        break;
      case "tools":
        for (const t of rest) {
          const id = t === "Can" ? "(T)WateringCan" : t === "Scythe" ? "(W)47" : ["Axe", "Hoe", "Pickaxe"].includes(t) ? `(T)${t}` : null;
          if (id) items.push({ id, count: 1 });
        }
        break;
      case "money": {
        let v = rest.length > 1 ? Number(rest[0]) + Math.floor(ctx.random() * (Number(rest[1]) - Number(rest[0]))) : Number(rest[0]);
        v -= v % 10;
        money += v;
        break;
      }
      case "cookingrecipe": {
        let name = rest.join(" ");
        if (!name.trim()) {
          let best = 1000;
          for (const [key, value] of Object.entries(ctx.cookingRecipes)) {
            const cond = (value.split("/")[3] ?? "").split(/\s+/);
            if (cond[0] !== "f" || cond[1] !== mailTitle.replace("Cooking", "") || ctx.knownCooking.includes(key)) continue;
            const hearts = Number(cond[2]);
            if (hearts <= best) {
              best = hearts;
              name = key;
            }
          }
        }
        if (name.trim() && name in ctx.cookingRecipes) recipe = { kind: "cooking", name };
        break;
      }
      case "craftingrecipe": {
        const raw0 = rest[0] ?? "";
        const name = raw0 in ctx.craftingRecipes ? raw0 : raw0.replaceAll("_", " ");
        if (name in ctx.craftingRecipes) recipe = { kind: "crafting", name };
        break;
      }
      case "quest":
        quest = rest[0] ?? null;
        break;
    }
    return "";
  });
  return { title: titleText, text, items, money, recipe, quest, bg, color };
}
