import { SEASON_ORDER } from "./clock.ts";
import { checkConditions, isGreenRainDay, type GsqContext, type GsqState } from "./gsq.ts";
import type { SeasonName } from "./terrain.ts";

export type WeatherId = "Sun" | "Rain" | "Storm" | "Wind" | "Snow" | "GreenRain" | "Festival" | "Wedding" | string;

export interface WeatherFlags {
  raining: boolean;
  snowing: boolean;
  lightning: boolean;
  debris: boolean;
  greenRain: boolean;
}

export interface WeatherCondition {
  Id?: string;
  Condition?: string | null;
  Weather: string;
}

export interface WeatherData {
  conditions: WeatherCondition[];
  festivalDates: Record<string, string>;
  passiveFestivals: Record<string, { Season: number; StartDay: number; EndDay: number; Condition?: string | null; MapReplacements?: Record<string, string> | null }>;
  valleyLocations?: (name: string) => boolean;
}

export function weatherFlags(weather: WeatherId): WeatherFlags {
  return {
    raining: weather === "Rain" || weather === "Storm",
    snowing: weather === "Snow",
    lightning: weather === "Storm",
    debris: weather === "Wind",
    greenRain: weather === "GreenRain",
  };
}

const seasonIndex = (s: SeasonName) => SEASON_ORDER.indexOf(s);

export function addDays(day: number, season: SeasonName, offset: number) {
  let d = day + offset, s = seasonIndex(season);
  while (d > 28) {
    d -= 28;
    s = (s + 1) % 4;
  }
  return { day: d, season: SEASON_ORDER[s] };
}

export const isFestivalDay = (day: number, season: SeasonName, data: WeatherData) => `${season}${day}` in data.festivalDates;

function passiveFestivalSun(day: number, season: SeasonName, data: WeatherData, ctx: GsqContext) {
  const valley = data.valleyLocations ?? ((name: string) => name !== "Desert" && !name.startsWith("Island"));
  for (const f of Object.values(data.passiveFestivals)) {
    if (day < f.StartDay || day > f.EndDay || f.Season !== seasonIndex(season)) continue;
    if (!checkConditions(f.Condition, ctx)) continue;
    if (Object.keys(f.MapReplacements ?? {}).some(valley)) return true;
  }
  return false;
}

export function weatherModificationsForDate(state: GsqState, forecast: WeatherId, data: WeatherData, ctx: GsqContext): WeatherId {
  let w = forecast;
  if (state.dayOfMonth === 1 || state.daysPlayed <= 4) w = "Sun";
  if (state.daysPlayed === 3) w = "Rain";
  if (isGreenRainDay(state.dayOfMonth, state.season, state)) w = "GreenRain";
  if (state.season === "summer" && state.dayOfMonth % 13 === 0) w = "Storm";
  if (isFestivalDay(state.dayOfMonth, state.season, data)) w = "Festival";
  if (passiveFestivalSun(state.dayOfMonth, state.season, data, ctx)) w = "Sun";
  return w;
}

function passiveFestivalForContext(day: number, season: SeasonName, data: WeatherData, ctx: GsqContext) {
  const valley = data.valleyLocations ?? ((name: string) => name !== "Desert" && !name.startsWith("Island"));
  return Object.values(data.passiveFestivals).some(
    (f) =>
      day >= f.StartDay &&
      day <= f.EndDay &&
      f.Season === seasonIndex(season) &&
      checkConditions(f.Condition, ctx) &&
      Object.keys(f.MapReplacements ?? {}).some(valley),
  );
}

export function forecastTomorrow(state: GsqState, data: WeatherData, ctx: GsqContext): WeatherId {
  const t = addDays(state.dayOfMonth, state.season, 1);
  if (isFestivalDay(t.day, t.season, data)) return "Festival";
  if (passiveFestivalForContext(t.day, t.season, data, ctx)) return "Sun";
  for (const c of data.conditions) if (checkConditions(c.Condition, ctx)) return c.Weather;
  return "Sun";
}

export interface DailyWeather {
  today: WeatherId;
  tomorrow: WeatherId;
}

export function updateWeatherForNewDay(state: GsqState, previousForecast: WeatherId, data: WeatherData, ctx: GsqContext): DailyWeather {
  const today = weatherModificationsForDate(state, previousForecast, data, ctx);
  return { today, tomorrow: forecastTomorrow(state, data, ctx) };
}

export const hasOwnWeather = (locationName: string) => !(locationName === "Desert" || locationName.startsWith("Desert") || locationName.startsWith("Island"));
