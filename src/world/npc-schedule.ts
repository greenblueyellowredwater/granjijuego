import { shortDayName } from "./calendar-names.ts";

export interface ScheduleContext {
  season: string;
  dayOfMonth: number;
  hearts: number;
  raining: boolean;
  greenRain?: boolean;
  year: number;
  passiveFestivals?: { id: string; day: number }[];
  mail?: Set<string>;
  heartsWith?: (npc: string) => number;
  random?: () => number;
}

export function scheduleKey(name: string, raw: Record<string, string>, ctx: ScheduleContext): string | null {
  const has = (k: string) => k in raw;
  const dow = shortDayName(ctx.dayOfMonth);
  if (ctx.greenRain && ctx.year === 1 && has("GreenRain")) return "GreenRain";
  for (const f of ctx.passiveFestivals ?? []) {
    if (has(`${f.id}_${f.day}`)) return `${f.id}_${f.day}`;
    if (has(f.id)) return f.id;
  }
  if (has(`${ctx.season}_${ctx.dayOfMonth}`)) return `${ctx.season}_${ctx.dayOfMonth}`;
  for (let h = ctx.hearts; h > 0; h--) if (has(`${ctx.dayOfMonth}_${h}`)) return `${ctx.dayOfMonth}_${h}`;
  if (has(String(ctx.dayOfMonth))) return String(ctx.dayOfMonth);
  if (name === "Pam" && ctx.mail?.has("ccVault") && has("bus")) return "bus";
  if (ctx.raining) {
    if ((ctx.random ?? Math.random)() < 0.5 && has("rain2")) return "rain2";
    if (has("rain")) return "rain";
  }
  for (let h = ctx.hearts; h > 0; h--) if (has(`${ctx.season}_${dow}_${h}`)) return `${ctx.season}_${dow}_${h}`;
  if (has(`${ctx.season}_${dow}`)) return `${ctx.season}_${dow}`;
  for (let h = ctx.hearts; h > 0; h--) if (has(`${dow}_${h}`)) return `${dow}_${h}`;
  if (has(dow)) return dow;
  if (has(ctx.season)) return ctx.season;
  if (has(`spring_${dow}`)) return `spring_${dow}`;
  if (has("spring")) return "spring";
  return null;
}

export interface ScheduleEntry {
  time: number;
  arrival: boolean;
  location: string;
  x: number;
  y: number;
  facing: number;
  animation: string | null;
  message: string | null;
}

export interface Home {
  location: string;
  x: number;
  y: number;
}

export function parseSchedule(name: string, key: string, raw: Record<string, string>, home: Home, ctx: ScheduleContext, visited: string[] = []): ScheduleEntry[] | null {
  if (visited.some((v) => v.toLowerCase() === key.toLowerCase())) return [];
  visited.push(key);
  const text = raw[key];
  if (text === undefined) return null;
  const commands = text.split("/").map((c) => c.trim());
  const reparse = (k: string) => parseSchedule(name, k, raw, home, ctx, visited);
  let start = 0;
  if (commands[0].includes("GOTO")) {
    let target = commands[0].split(/\s+/)[1] ?? "";
    if (target.toLowerCase() === "season") target = target in raw ? target : ctx.season in raw ? ctx.season : "spring";
    return target in raw ? reparse(target) : reparse("spring");
  }
  if (commands[0].includes("NOT")) {
    const w = commands[0].split(/\s+/);
    if (w[1]?.toLowerCase() === "friendship") {
      let met = false;
      for (let i = 2; i + 1 < w.length && !met; i += 2) {
        const need = Number(w[i + 1]);
        if (Number.isInteger(need) && (ctx.heartsWith?.(w[i]) ?? 0) >= need) met = true;
      }
      if (met) return reparse("spring");
      start++;
    }
  } else if (commands[0].includes("MAIL")) {
    start += ctx.mail?.has(commands[0].split(/\s+/)[1] ?? "") ? 2 : 1;
  }
  if (commands[start]?.includes("GOTO")) {
    let target = commands[start].split(/\s+/)[1] ?? "";
    if (target.toLowerCase() === "no_schedule") return null;
    if (target.toLowerCase() === "season") target = ctx.season;
    return reparse(target);
  }
  const out: ScheduleEntry[] = [];
  let previousLocation = home.location;
  for (let i = start; i < commands.length; i++) {
    const words = commands[i].split(/\s+/).filter(Boolean);
    if (words.length < 3) continue;
    let p = 0;
    let timeText = words[p++];
    const arrival = timeText.startsWith("a");
    if (arrival) timeText = timeText.slice(1);
    const time = Number(timeText);
    let location = words[p];
    let x: number, y: number, facing = 2;
    if (location === "bed") {
      p++;
      const last = (raw.default ?? raw.spring ?? "").split("/").pop()?.trim().split(/\s+/) ?? [];
      if (last.length > 3 && Number.isInteger(Number(last[2])) && Number.isInteger(Number(last[3]))) {
        location = last[1];
        x = Number(last[2]);
        y = Number(last[3]);
      } else {
        location = home.location;
        x = home.x;
        y = home.y;
      }
      const msgStart = commands[i].indexOf('"');
      out.push({ time, arrival, location, x, y, facing, animation: `${name.toLowerCase()}_sleep`, message: msgStart >= 0 ? commands[i].slice(msgStart) : null });
      previousLocation = location;
      continue;
    }
    if (Number.isInteger(Number(location))) location = previousLocation;
    else p++;
    x = Number(words[p++]);
    y = Number(words[p++]);
    if (p < words.length && /^-?\d+$/.test(words[p])) facing = Number(words[p++]);
    let animation: string | null = null, message: string | null = null;
    if (p < words.length) {
      if (words[p].startsWith('"')) message = commands[i].slice(commands[i].indexOf('"'));
      else {
        animation = words[p++];
        if (p < words.length && words[p].startsWith('"')) message = commands[i].slice(commands[i].indexOf('"')).replace(/"/g, "");
      }
    }
    if (!Number.isFinite(time) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ time, arrival, location, x, y, facing, animation, message });
    previousLocation = location;
  }
  return out;
}
