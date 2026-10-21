import { describe, expect, it } from "vitest";
import { checkConditions, deterministicHash, isGreenRainDay, splitArgs, splitConditions, type GsqContext, type GsqState } from "../src/world/gsq.ts";
import { DotNetRandom } from "../src/world/dotnet-random.ts";
import { forecastTomorrow, updateWeatherForNewDay, weatherFlags, weatherModificationsForDate, type WeatherData } from "../src/world/weather.ts";
import { rainSourceRect, randomizeRain, snowTiles, updateRain, Wind } from "../src/world/weather-fx.ts";

const base: GsqState = { season: "spring", dayOfMonth: 5, year: 1, daysPlayed: 5, uniqueId: 123456789, greenRainDays: [5, 6, 7, 14, 15, 16, 18, 23] };
const ctx = (state: Partial<GsqState> = {}, seed = 1): GsqContext => ({ state: { ...base, ...state }, random: new DotNetRandom(seed) });

describe("GameStateQuery", () => {
  it("separa condiciones y argumentos respetando comillas", () => {
    expect(splitConditions('SEASON spring, ANY "DAY_OF_MONTH 1, 2" "YEAR 2" ,  ')).toEqual(["SEASON spring", 'ANY "DAY_OF_MONTH 1, 2" "YEAR 2"']);
    expect(splitArgs('ANY "SEASON fall" "YEAR 2"')).toEqual(["ANY", "SEASON fall", "YEAR 2"]);
  });

  it("evalúa fechas, negación y vacío", () => {
    expect(checkConditions(null, ctx())).toBe(true);
    expect(checkConditions("FALSE", ctx())).toBe(false);
    expect(checkConditions("SEASON Spring Fall, DAY_OF_MONTH odd", ctx())).toBe(true);
    expect(checkConditions("SEASON_DAY Spring 0 Spring 1 Spring 2 Spring 4, YEAR 1", ctx({ dayOfMonth: 4 }))).toBe(true);
    expect(checkConditions("SEASON_DAY Spring 3, YEAR 1", ctx({ dayOfMonth: 4 }))).toBe(false);
    expect(checkConditions("!DAY_OF_MONTH 1, DAYS_PLAYED 3", ctx())).toBe(true);
    expect(checkConditions("DAYS_PLAYED 3 4", ctx())).toBe(false);
    expect(checkConditions('ANY "SEASON winter" "YEAR 1"', ctx())).toBe(true);
  });

  it("trata consultas desconocidas como falsas y los errores de argumentos según la negación", () => {
    const errors: string[] = [];
    expect(checkConditions("NOPE 1", { ...ctx(), onError: (q) => errors.push(q) })).toBe(false);
    expect(checkConditions("!YEAR x", ctx())).toBe(true);
    expect(checkConditions("YEAR x", ctx())).toBe(false);
    expect(errors).toEqual(["NOPE 1"]);
  });

  it("RANDOM usa el generador del contexto", () => {
    const r = new DotNetRandom(42);
    const expected = r.nextDouble() < 0.5;
    expect(checkConditions("RANDOM .5", ctx({}, 42))).toBe(expected);
  });

  it("SYNCED_RANDOM y la lluvia de verano son deterministas por partida y día", () => {
    const a = checkConditions("SYNCED_RANDOM day location_weather 0.5", ctx());
    expect(checkConditions("SYNCED_RANDOM day location_weather 0.5", ctx({}, 99))).toBe(a);
    const results = new Set(Array.from({ length: 40 }, (_, i) => checkConditions("SYNCED_RANDOM day location_weather 0.5", ctx({ daysPlayed: i }))));
    expect(results.size).toBe(2);
    const summer = (d: number) => checkConditions("SYNCED_SUMMER_RAIN_RANDOM", ctx({ season: "summer", dayOfMonth: d, daysPlayed: 28 + d }));
    expect(summer(10)).toBe(summer(10));
  });

  it("hashea como xxHash32 con semilla 0", () => {
    expect(deterministicHash("")).toBe(0x02cc5d05 | 0);
  });

  it("elige un único día de lluvia verde por año, solo en verano", () => {
    const days = Array.from({ length: 28 }, (_, i) => i + 1).filter((d) => isGreenRainDay(d, "summer", base));
    expect(days).toHaveLength(1);
    expect(base.greenRainDays).toContain(days[0]);
    expect(isGreenRainDay(days[0], "spring", base)).toBe(false);
  });
});

const data: WeatherData = {
  conditions: [
    { Condition: "SEASON_DAY Spring 0 Spring 1 Spring 2 Spring 4, YEAR 1", Weather: "Sun" },
    { Condition: "SEASON_DAY Spring 3, YEAR 1", Weather: "Rain" },
    { Condition: "SEASON winter, SYNCED_RANDOM day location_weather 0.63", Weather: "Snow" },
    { Condition: "SEASON spring fall, SYNCED_RANDOM day location_weather 0.183", Weather: "Rain" },
    { Condition: null, Weather: "Sun" },
  ],
  festivalDates: { spring13: "Egg Festival" },
  passiveFestivals: { NightMarket: { Season: 3, StartDay: 15, EndDay: 17, Condition: "", MapReplacements: { Beach: "Beach-NightMarket" } } },
};

describe("clima", () => {
  it("fuerza sol los primeros días y lluvia el tercero", () => {
    expect(weatherModificationsForDate({ ...base, dayOfMonth: 2, daysPlayed: 2 }, "Rain", data, ctx())).toBe("Sun");
    expect(weatherModificationsForDate({ ...base, dayOfMonth: 3, daysPlayed: 3 }, "Sun", data, ctx())).toBe("Rain");
    expect(weatherModificationsForDate({ ...base, dayOfMonth: 1, daysPlayed: 29 }, "Rain", data, ctx())).toBe("Sun");
    expect(weatherModificationsForDate({ ...base, season: "summer", dayOfMonth: 13, daysPlayed: 41 }, "Sun", data, ctx())).toBe("Storm");
    expect(weatherModificationsForDate({ ...base, dayOfMonth: 13, daysPlayed: 13 }, "Rain", data, ctx())).toBe("Festival");
    expect(weatherModificationsForDate({ ...base, season: "winter", dayOfMonth: 16, daysPlayed: 100 }, "Snow", data, ctx())).toBe("Sun");
  });

  it("pronostica festivales y luego las condiciones en orden", () => {
    expect(forecastTomorrow({ ...base, dayOfMonth: 12 }, data, ctx({ dayOfMonth: 12 }))).toBe("Festival");
    expect(forecastTomorrow({ ...base, season: "winter", dayOfMonth: 14 }, data, ctx({ season: "winter", dayOfMonth: 14 }))).toBe("Sun");
    expect(forecastTomorrow({ ...base, dayOfMonth: 3 }, data, ctx({ dayOfMonth: 3 }))).toBe("Rain");
    const day = updateWeatherForNewDay({ ...base, dayOfMonth: 4, daysPlayed: 4 }, "Rain", data, ctx({ dayOfMonth: 4, daysPlayed: 4 }));
    expect(day).toEqual({ today: "Sun", tomorrow: "Sun" });
  });

  it("traduce el clima a banderas", () => {
    expect(weatherFlags("Storm")).toEqual({ raining: true, snowing: false, lightning: true, debris: false, greenRain: false });
    expect(weatherFlags("Festival").raining).toBe(false);
  });
});

describe("efectos", () => {
  it("las gotas caen en diagonal cada 70 ms y salpican", () => {
    const rng = new DotNetRandom(3);
    const drops = randomizeRain(rng, { width: 1280, height: 800 });
    expect(drops).toHaveLength(70);
    const d = { x: 100, y: 100, frame: 0, accumulator: 60 };
    updateRain([d], 16, new DotNetRandom(5), { width: 1280, height: 800 });
    expect([d.x, d.y, d.accumulator]).toEqual([84, 132, 0]);
    const splash = { x: 5, y: 5, frame: 3, accumulator: 60 };
    updateRain([splash], 16, new DotNetRandom(5), { width: 1280, height: 800 });
    expect(splash.frame).toBe(0);
    expect(rainSourceRect(2, false, 64)).toEqual({ sx: 32, sy: 0, sw: 16, sh: 16 });
    expect(rainSourceRect(2, true, 64)).toEqual({ sx: 32, sy: 16, sw: 16, sh: 16 });
  });

  it("la nieve se repite cada 64 px y anima 16 cuadros en 1200 ms", () => {
    const s = snowTiles(10, 0, { width: 128, height: 64 }, 150);
    expect(s.source).toEqual({ sx: 368 + 32, sy: 192, sw: 16, sh: 16 });
    expect(s.tiles.map((t) => [t.x, t.y])).toEqual([
      [-54, -64],
      [-54, 0],
      [10, -64],
      [10, 0],
      [74, -64],
      [74, 0],
    ]);
  });

  it("el viento de otoño vuelve a −0,5 después de una ráfaga", () => {
    const w = new Wind();
    w.update("fall", new DotNetRandom(1));
    expect(w.global).toBe(-0.25);
    w.global = -2;
    w.update("fall", new DotNetRandom(1));
    expect(w.global).toBeCloseTo(-1.985);
  });
});
