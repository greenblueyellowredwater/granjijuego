import type { SeasonName } from "./terrain.ts";

export type RGBA = [number, number, number, number];

export const SEASON_ORDER: SeasonName[] = ["spring", "summer", "fall", "winter"];
export const DAYS_PER_SEASON = 28;
export const MS_PER_GAME_MINUTE = 700;
export const MS_PER_TEN_MINUTES = MS_PER_GAME_MINUTE * 10;
export const DAY_START = 600;
export const PASS_OUT_TIME = 2600;

export const WHITE: RGBA = [255, 255, 255, 255];
export const EVENING_COLOR: RGBA = [255, 255, 0, 255];
export const RAIN_AMBIENT: RGBA = [255, 200, 80, 255];
export const INDOOR_LIGHTING: RGBA = [100, 120, 30, 255];
export const ORANGE_RED: RGBA = [255, 69, 0, 255];
export const RAIN_VEIL = scaleColorConst(ORANGE_RED, 0.45);
export const INDOOR_LIGHTING_NIGHT: RGBA = [150, 150, 30, 255];

function scaleColorConst(c: RGBA, s: number): RGBA {
  const f = Math.fround(s);
  return c.map((v) => Math.trunc(v * f)) as RGBA;
}

export interface Calendar {
  season: SeasonName;
  dayOfMonth: number;
  year: number;
  daysPlayed: number;
}

export interface LightingContext {
  season: SeasonName;
  outdoors: boolean;
  island?: boolean;
  raining?: boolean;
  lightLevel?: number;
  extraMsPerMinute?: number;
  fixedAmbient?: RGBA;
}

export function startingToGetDarkTime(ctx: Pick<LightingContext, "season" | "island">) {
  if (ctx.island) return 1800;
  if (ctx.season === "fall") return 1700;
  if (ctx.season === "winter") return 1500;
  return 1800;
}

export const trulyDarkTime = (ctx: Pick<LightingContext, "season" | "island">) => startingToGetDarkTime(ctx) + 200;
export const moderatelyDarkTime = (ctx: Pick<LightingContext, "season" | "island">) =>
  Math.trunc((trulyDarkTime(ctx) + startingToGetDarkTime(ctx)) / 2);
export const isTimeToTurnOffLighting = (time: number, ctx: Pick<LightingContext, "season" | "island">) => time >= trulyDarkTime(ctx) - 100;

export const timeToMinutes = (time: number) => Math.trunc(time / 100) * 60 + (time % 100);
export const minutesBetween = (from: number, to: number) => timeToMinutes(to) - timeToMinutes(from);

export function addTenMinutes(time: number) {
  let t = time + 10;
  if (t % 100 >= 60) t = t - (t % 100) + 100;
  return Math.min(t, PASS_OUT_TIME);
}

export function scaleColor(c: RGBA, s: number): RGBA {
  return [Math.trunc(c[0] * s), Math.trunc(c[1] * s), Math.trunc(c[2] * s), Math.trunc(c[3] * s)].map((v) =>
    Math.max(0, Math.min(255, v)),
  ) as RGBA;
}

const sameColor = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const f32 = Math.fround;

export function ambientLight(time: number, interval: number, ctx: LightingContext): RGBA {
  if (ctx.outdoors) return ctx.raining ? RAIN_AMBIENT : WHITE;
  if (time >= startingToGetDarkTime(ctx) || (ctx.lightLevel ?? 0) > 0) {
    const now = time + Math.trunc(interval / (MS_PER_GAME_MINUTE + (ctx.extraMsPerMinute ?? 0)));
    const x = f32(1 - Math.max(0, Math.min(1, f32(minutesBetween(now, trulyDarkTime(ctx)) / 120))));
    const lerp = (a: number, b: number) => Math.trunc(f32(a + f32((b - a) * x))) & 255;
    return [
      lerp(INDOOR_LIGHTING[0], INDOOR_LIGHTING_NIGHT[0]),
      lerp(INDOOR_LIGHTING[1], INDOOR_LIGHTING_NIGHT[1]),
      lerp(INDOOR_LIGHTING[2], INDOOR_LIGHTING_NIGHT[2]),
      255,
    ];
  }
  return INDOOR_LIGHTING;
}

function clockFraction(time: number) {
  return Math.trunc(f32(f32(time - (time % 100)) + f32(f32(Math.trunc((time % 100) / 10)) * f32(16.66))));
}

export function outdoorLight(time: number, interval: number, ctx: LightingContext, ambient: RGBA): RGBA {
  const t = clockFraction(time);
  const f = f32(f32(interval / MS_PER_TEN_MINUTES) * f32(16.6));
  const color = ctx.raining ? ambient : EVENING_COLOR;
  if (time >= trulyDarkTime(ctx)) {
    return scaleColor(color, Math.min(0.93, f32(0.75 + f32(f32(t - trulyDarkTime(ctx)) + f) * f32(0.000625))));
  }
  if (time >= startingToGetDarkTime(ctx)) {
    return scaleColor(color, Math.min(0.93, f32(0.3 + f32(f32(t - startingToGetDarkTime(ctx)) + f) * f32(0.00225))));
  }
  return ctx.raining ? scaleColor(ambient, 0.3) : ambient;
}

export interface Lighting {
  ambient: RGBA;
  outdoor: RGBA;
  draw: boolean;
  fill: RGBA;
}

export function lighting(time: number, interval: number, ctx: LightingContext): Lighting {
  if (ctx.fixedAmbient) return { ambient: ctx.fixedAmbient, outdoor: WHITE, draw: !sameColor(ctx.fixedAmbient, WHITE), fill: ctx.fixedAmbient };
  const ambient = ambientLight(time, interval, ctx);
  const outdoor = outdoorLight(time, interval, ctx, ambient);
  const draw = (ctx.outdoors && !sameColor(outdoor, WHITE)) || !sameColor(ambient, WHITE);
  const fill = sameColor(ambient, WHITE) || (ctx.outdoors && ctx.raining) ? outdoor : ambient;
  return { ambient, outdoor, draw, fill };
}

export function lightmapFill(c: RGBA): [number, number, number] {
  const a = c[3] / 255;
  return [Math.round(c[0] * a), Math.round(c[1] * a), Math.round(c[2] * a)];
}

export function nextDay(c: Calendar): Calendar {
  let { season, dayOfMonth, year } = c;
  dayOfMonth++;
  if (dayOfMonth > DAYS_PER_SEASON) {
    dayOfMonth = 1;
    const i = SEASON_ORDER.indexOf(season);
    season = SEASON_ORDER[(i + 1) % 4];
    if (i === 3) year++;
  }
  return { season, dayOfMonth, year, daysPlayed: c.daysPlayed + 1 };
}

export const dayOfWeek = (dayOfMonth: number) => dayOfMonth % 7;

export function weatherIcon(w: { snowing?: boolean; raining?: boolean; debris?: boolean; season: SeasonName; wedding?: boolean; lightning?: boolean; festival?: boolean; greenRain?: boolean }) {
  let icon = 2;
  if (w.snowing) icon = 7;
  else if (w.raining) icon = 4;
  else if (w.debris && w.season === "spring") icon = 3;
  else if (w.debris && w.season === "fall") icon = 6;
  else if (w.debris && w.season === "winter") icon = 7;
  else if (w.wedding) icon = 0;
  if (w.lightning) icon = 5;
  if (w.festival) icon = 1;
  if (w.greenRain) icon = 999;
  return icon;
}

export function formatTime(time: number, am = "am", pm = "pm") {
  const h = Math.trunc(time / 100) % 12;
  const minutes = time % 100;
  const suffix = time < 1200 || time >= 2400 ? am : pm;
  return `${h === 0 ? "12" : h}:${minutes}${minutes === 0 ? "0" : ""} ${suffix}`;
}

export function clockHandRotation(time: number, interval: number) {
  const t = clockFraction(time);
  const f = f32(f32(interval / MS_PER_TEN_MINUTES) * f32(16.6));
  return Math.PI + Math.min(Math.PI, (f32(f32(t + f) - 600) / 2000) * Math.PI);
}

export type ClockEvent = { kind: "tenMinutes"; time: number } | { kind: "nightTiles" } | { kind: "ambientWhite" } | { kind: "late"; time: number } | { kind: "passOut" };

export class GameClock {
  time = DAY_START;
  interval = 0;
  shakeMs = 0;

  constructor(time = DAY_START) {
    this.time = time;
  }

  tick(ms: number, ctx: LightingContext, timePasses = true): ClockEvent[] {
    if (this.shakeMs > 0) this.shakeMs = Math.max(0, this.shakeMs - ms);
    if (!timePasses) return [];
    this.interval += Math.trunc(ms);
    if (this.interval <= MS_PER_TEN_MINUTES + (ctx.extraMsPerMinute ?? 0) * 10) return [];
    return this.tenMinuteUpdate(ctx);
  }

  tenMinuteUpdate(ctx: LightingContext): ClockEvent[] {
    const events: ClockEvent[] = [];
    this.interval = 0;
    this.time = addTenMinutes(this.time);
    events.push({ kind: "tenMinutes", time: this.time });
    if (this.time === trulyDarkTime(ctx) - 100) events.push({ kind: "nightTiles" });
    else if (this.time === moderatelyDarkTime(ctx) && ctx.outdoors && !ctx.raining) events.push({ kind: "ambientWhite" });
    if (this.time === 2400 || this.time === 2500) {
      this.shakeMs = 2000;
      events.push({ kind: "late", time: this.time });
    }
    if (this.time === PASS_OUT_TIME) {
      this.shakeMs = 2000;
      events.push({ kind: "passOut" });
    }
    return events;
  }
}
