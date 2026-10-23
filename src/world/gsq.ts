import { createRandom, xxHash32, type DotNetRandom } from "./dotnet-random.ts";
import { SEASON_ORDER } from "./clock.ts";
import type { SeasonName } from "./terrain.ts";

export interface GsqState {
  season: SeasonName;
  dayOfMonth: number;
  year: number;
  daysPlayed: number;
  uniqueId: number;
  ticks?: number;
  dailyLuck?: number;
  greenRainDays: number[];
}

export interface GsqPlayer {
  mailReceived: string[];
  mailbox: string[];
  mailForTomorrow: string[];
  eventsSeen: string[];
  friendship: Record<string, { points: number }>;
  male: boolean;
  totalEarned: number;
  conversationTopics: string[];
  weather: string;
}

export interface GsqContext {
  state: GsqState;
  random: DotNetRandom;
  player?: GsqPlayer;
  onError?: (query: string, error: string) => void;
}

export type GsqResolver = (args: string[], ctx: GsqContext) => boolean;

class QueryError extends Error {}

export function splitConditions(raw: string) {
  const out: string[] = [];
  let current = "", quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && raw[i + 1] === '"') {
      current += c + raw[++i];
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === "," && !quoted) {
      out.push(current);
      current = "";
    } else current += c;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function splitArgs(raw: string) {
  const out: string[] = [];
  let current = "", quoted = false, has = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && raw[i + 1] === '"') {
      current += '"';
      i++;
      has = true;
    } else if (c === '"') {
      quoted = !quoted;
      has = true;
    } else if (/\s/.test(c) && !quoted) {
      if (has) out.push(current);
      current = "";
      has = false;
    } else {
      current += c;
      has = true;
    }
  }
  if (has) out.push(current);
  return out;
}

export function deterministicHash(text: string) {
  const h = xxHash32(new TextEncoder().encode(text));
  return h | 0;
}

const arg = (args: string[], i: number, name: string) => {
  if (i >= args.length) throw new QueryError(`required index ${i} (${name}) not found`);
  return args[i];
};

const int = (args: string[], i: number, name: string) => {
  const v = arg(args, i, name);
  if (!/^[+-]?\d+$/.test(v.trim())) throw new QueryError(`can't parse '${v}' as ${name}`);
  return parseInt(v, 10);
};

const optionalInt = (args: string[], i: number, fallback: number, name: string) => (i < args.length ? int(args, i, name) : fallback);

const float = (args: string[], i: number, name: string) => {
  const v = arg(args, i, name).trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) throw new QueryError(`can't parse '${v}' as ${name}`);
  return Math.fround(parseFloat(v));
};

const season = (args: string[], i: number) => {
  const v = arg(args, i, "Season season").toLowerCase();
  if (!SEASON_ORDER.includes(v as SeasonName)) throw new QueryError(`invalid season '${args[i]}'`);
  return v as SeasonName;
};

function randomImpl(random: DotNetRandom, args: string[], index: number, ctx: GsqContext) {
  let chance = float(args, index, "float chance");
  if (args.slice(index + 1).some((a) => a.toLowerCase() === "@adddailyluck")) chance = Math.fround(chance + (ctx.state.dailyLuck ?? 0));
  return random.nextDouble() < chance;
}

export function intervalRandom(interval: string, key: string | null, s: GsqState) {
  const keyHash = key === null ? 0 : deterministicHash(key);
  let value: number;
  switch (interval.toLowerCase()) {
    case "tick":
      value = s.ticks ?? 0;
      break;
    case "day":
      value = s.daysPlayed;
      break;
    case "season":
      value = deterministicHash(`${s.season}${s.year}`);
      break;
    case "year":
      value = deterministicHash(`year${s.year}`);
      break;
    default:
      throw new QueryError(`invalid interval '${interval}'; expected one of 'tick', 'day', 'season', or 'year'`);
  }
  return createRandom(keyHash, s.uniqueId, value);
}

export function daySaveRandom(s: GsqState, a = 0, b = 0, c = 0) {
  return createRandom(s.daysPlayed, Math.floor(s.uniqueId / 2), a, b, c);
}

export function isGreenRainDay(day: number, seasonName: SeasonName, s: GsqState) {
  if (seasonName !== "summer") return false;
  const rng = createRandom(s.year * 777, s.uniqueId);
  return day === s.greenRainDays[rng.next(s.greenRainDays.length)];
}

function tomorrow(s: GsqState) {
  if (s.dayOfMonth < 28) return { day: s.dayOfMonth + 1, season: s.season };
  return { day: 1, season: SEASON_ORDER[(SEASON_ORDER.indexOf(s.season) + 1) % 4] };
}

export const RESOLVERS: Record<string, GsqResolver> = {
  TRUE: () => true,
  FALSE: () => false,
  ANY: (args, ctx) => args.slice(1).some((q) => checkConditions(q, ctx)),
  SEASON_DAY: (args, ctx) => {
    for (let i = 1; i < args.length; i += 2) {
      const s = season(args, i), d = int(args, i + 1, "int day");
      if (ctx.state.season === s && ctx.state.dayOfMonth === d) return true;
    }
    return false;
  },
  DAY_OF_MONTH: (args, ctx) => {
    for (const a of args.slice(1)) {
      const day = ctx.state.dayOfMonth;
      if (/^[+-]?\d+$/.test(a.trim())) {
        if (day === parseInt(a, 10)) return true;
      } else if (a.toLowerCase() === "even") {
        if (day % 2 === 0) return true;
      } else if (a.toLowerCase() === "odd") {
        if (day % 2 === 1) return true;
      } else ctx.onError?.(args.join(" "), `'${a}' isn't a valid day of month`);
    }
    return false;
  },
  DAYS_PLAYED: (args, ctx) => {
    const min = int(args, 1, "int minDaysPlayed"), max = optionalInt(args, 2, 2147483647, "int maxDaysPlayed");
    return ctx.state.daysPlayed >= min && ctx.state.daysPlayed <= max;
  },
  SEASON: (args, ctx) => {
    for (let i = 1; i < args.length; i++) if (season(args, i) === ctx.state.season) return true;
    return false;
  },
  YEAR: (args, ctx) => {
    const min = int(args, 1, "int minYear"), max = optionalInt(args, 2, 2147483647, "int maxYear");
    return ctx.state.year >= min && ctx.state.year <= max;
  },
  RANDOM: (args, ctx) => randomImpl(ctx.random, args, 1, ctx),
  SYNCED_RANDOM: (args, ctx) => randomImpl(intervalRandom(arg(args, 1, "string interval"), arg(args, 2, "string key"), ctx.state), args, 3, ctx),
  SYNCED_SUMMER_RAIN_RANDOM: (_args, ctx) => {
    const rng = daySaveRandom(ctx.state, deterministicHash("summer_rain_chance"));
    const chance = Math.fround(0.12 + Math.fround(ctx.state.dayOfMonth * Math.fround(0.003)));
    return rng.nextDouble() < chance;
  },
  PLAYER_HAS_MAIL: (args, ctx) => {
    const p = ctx.player;
    if (!p) return false;
    const id = arg(args, 2, "string mailId");
    const type = (args[3] ?? "any").toLowerCase();
    if (type === "mailbox") return p.mailbox.includes(id);
    if (type === "tomorrow") return p.mailForTomorrow.includes(id);
    if (type === "received") return p.mailReceived.includes(id);
    return p.mailReceived.includes(id) || p.mailbox.includes(id) || p.mailForTomorrow.includes(id);
  },
  PLAYER_HAS_SEEN_EVENT: (args, ctx) => !!ctx.player?.eventsSeen.includes(arg(args, 2, "string eventId")),
  PLAYER_MONEY_EARNED: (args, ctx) => {
    const min = int(args, 2, "int minAmount"), max = optionalInt(args, 3, 2147483647, "int maxAmount");
    const v = ctx.player?.totalEarned ?? 0;
    return v >= min && v <= max;
  },
  PLAYER_FRIENDSHIP_POINTS: (args, ctx) => {
    const npc = arg(args, 2, "string npcName");
    const min = int(args, 3, "int minPoints"), max = optionalInt(args, 4, 2147483647, "int maxPoints");
    const points = Object.entries(ctx.player?.friendship ?? {}).filter(([n]) => npc.toLowerCase() === "any" || n === npc).map(([, f]) => f.points);
    return points.some((v) => v >= min && v <= max);
  },
  PLAYER_HEARTS: (args, ctx) => {
    const npc = arg(args, 2, "string npcName");
    const min = int(args, 3, "int minHearts"), max = optionalInt(args, 4, 2147483647, "int maxHearts");
    const hearts = Object.entries(ctx.player?.friendship ?? {}).filter(([n]) => npc.toLowerCase() === "any" || n === npc).map(([, f]) => Math.trunc(f.points / 250));
    return hearts.some((v) => v >= min && v <= max);
  },
  PLAYER_GENDER: (args, ctx) => (arg(args, 2, "string genderName").toLowerCase() === "male") === !!ctx.player?.male,
  PLAYER_HAS_CONVERSATION_TOPIC: (args, ctx) => !!ctx.player?.conversationTopics.includes(arg(args, 2, "string topic")),
  PLAYER_NPC_RELATIONSHIP: () => false,
  WEATHER: (args, ctx) => args.slice(2).some((w) => w.toLowerCase() === (ctx.player?.weather ?? "Sun").toLowerCase()),
  DATE_RANGE: (args, ctx) => {
    const totalDays = (year: number, s: SeasonName, day: number) => (year - 1) * 112 + SEASON_ORDER.indexOf(s) * 28 + day - 1;
    const min = totalDays(int(args, 3, "int minYear"), season(args, 1), int(args, 2, "int minDayOfMonth"));
    const maxYear = optionalInt(args, 6, 2147483647, "int maxYear");
    const max = maxYear === 2147483647 ? Infinity : totalDays(maxYear, args[4] ? season(args, 4) : "winter", optionalInt(args, 5, 28, "int maxDayOfMonth"));
    const now = totalDays(ctx.state.year, ctx.state.season, ctx.state.dayOfMonth);
    return now >= min && now <= max;
  },
  IS_GREEN_RAIN_DAY: (_args, ctx) => {
    const t = tomorrow(ctx.state);
    return isGreenRainDay(t.day, t.season, ctx.state);
  },
};

export function checkConditions(raw: string | null | undefined, ctx: GsqContext): boolean {
  if (!raw || raw === "TRUE") return true;
  if (raw === "FALSE") return false;
  for (const q of splitConditions(raw)) {
    const args = splitArgs(q);
    let key = args[0] ?? "";
    const negated = key.startsWith("!");
    if (negated) args[0] = key = key.slice(1);
    const resolver = RESOLVERS[key.toUpperCase()];
    if (!resolver) {
      ctx.onError?.(q, `'${key}' isn't a known query or alias`);
      return false;
    }
    let result: boolean;
    try {
      result = resolver(args, ctx);
    } catch (e) {
      if (!(e instanceof QueryError)) {
        ctx.onError?.(q, `unhandled exception: ${e}`);
        return false;
      }
      ctx.onError?.(q, e.message);
      result = false;
    }
    if (result === negated) return false;
  }
  return true;
}
