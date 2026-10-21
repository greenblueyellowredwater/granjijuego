import { describe, expect, it } from "vitest";
import {
  addTenMinutes,
  ambientLight,
  clockHandRotation,
  dayOfWeek,
  formatTime,
  GameClock,
  INDOOR_LIGHTING,
  isTimeToTurnOffLighting,
  lighting,
  lightmapFill,
  moderatelyDarkTime,
  nextDay,
  outdoorLight,
  startingToGetDarkTime,
  trulyDarkTime,
  weatherIcon,
  WHITE,
  type LightingContext,
} from "../src/world/clock.ts";

const spring: LightingContext = { season: "spring", outdoors: true };
const kinds = (c: GameClock, ctx = spring) => c.tenMinuteUpdate(ctx).map((e) => e.kind);

describe("reloj", () => {
  it("avanza de a diez minutos y salta la hora", () => {
    expect(addTenMinutes(600)).toBe(610);
    expect(addTenMinutes(650)).toBe(700);
    expect(addTenMinutes(2550)).toBe(2600);
    expect(addTenMinutes(2600)).toBe(2600);
  });

  it("pasa diez minutos cuando el intervalo supera 7000 ms", () => {
    const c = new GameClock();
    let events: ReturnType<GameClock["tick"]> = [];
    let ticks = 0;
    while (c.time === 600) {
      events = c.tick(16, spring);
      ticks++;
    }
    expect(ticks).toBe(438);
    expect(c.time).toBe(610);
    expect(c.interval).toBe(0);
    expect(events[0]).toEqual({ kind: "tenMinutes", time: 610 });
  });

  it("no corre con el tiempo detenido y respeta los ms extra de la location", () => {
    const c = new GameClock();
    c.tick(8000, spring, false);
    expect(c.interval).toBe(0);
    c.tick(7100, { ...spring, extraMsPerMinute: 100 });
    expect(c.time).toBe(600);
  });

  it("emite tiles nocturnos, aviso de tarde y desmayo", () => {
    expect(kinds(new GameClock(1850))).toEqual(["tenMinutes", "nightTiles"]);
    expect(kinds(new GameClock(1850), { season: "spring", outdoors: false })).toEqual(["tenMinutes", "nightTiles"]);
    expect(kinds(new GameClock(1750), { season: "fall", outdoors: true })).toEqual(["tenMinutes", "nightTiles"]);
    expect(kinds(new GameClock(1900))).toEqual(["tenMinutes"]);
    const late = new GameClock(2350);
    expect(kinds(late)).toEqual(["tenMinutes", "late"]);
    expect(late.shakeMs).toBe(2000);
    expect(kinds(new GameClock(2550))).toEqual(["tenMinutes", "passOut"]);
  });
});

describe("oscuridad", () => {
  it("depende de la estación y de la isla", () => {
    expect(startingToGetDarkTime({ season: "spring" })).toBe(1800);
    expect(startingToGetDarkTime({ season: "fall" })).toBe(1700);
    expect(startingToGetDarkTime({ season: "winter" })).toBe(1500);
    expect(startingToGetDarkTime({ season: "winter", island: true })).toBe(1800);
    expect(trulyDarkTime({ season: "summer" })).toBe(2000);
    expect(moderatelyDarkTime({ season: "spring" })).toBe(1900);
    expect(isTimeToTurnOffLighting(1850, { season: "spring" })).toBe(false);
    expect(isTimeToTurnOffLighting(1900, { season: "spring" })).toBe(true);
  });
});

describe("luz", () => {
  it("de día afuera no hay lightmap", () => {
    const l = lighting(1200, 0, spring);
    expect(l.ambient).toEqual(WHITE);
    expect(l.outdoor).toEqual(WHITE);
    expect(l.draw).toBe(false);
  });

  it("al atardecer tiñe con eveningColor truncando los cuatro canales", () => {
    expect(outdoorLight(1800, 0, spring, WHITE)).toEqual([76, 76, 0, 76]);
    expect(outdoorLight(1830, 3500, spring, WHITE)).toEqual([Math.trunc(255 * Math.fround(0.3 + (49 + 8.3) * 0.00225)), Math.trunc(255 * Math.fround(0.3 + (49 + 8.3) * 0.00225)), 0, Math.trunc(255 * Math.fround(0.3 + (49 + 8.3) * 0.00225))]);
    expect(outdoorLight(2000, 0, spring, WHITE)).toEqual([191, 191, 0, 191]);
    expect(outdoorLight(2500, 0, spring, WHITE)).toEqual([237, 237, 0, 237]);
  });

  it("con lluvia usa la luz ambiente", () => {
    const rain = { ...spring, raining: true };
    const l = lighting(1200, 0, rain);
    expect(l.ambient).toEqual([255, 200, 80, 255]);
    expect(l.outdoor).toEqual([76, 60, 24, 76]);
    expect(l.fill).toEqual(l.outdoor);
  });

  it("adentro interpola hacia el color nocturno desde el anochecer", () => {
    const indoor = { season: "spring" as const, outdoors: false };
    expect(ambientLight(1200, 0, indoor)).toEqual(INDOOR_LIGHTING);
    expect(ambientLight(1800, 0, indoor)).toEqual([100, 120, 30, 255]);
    expect(ambientLight(1900, 0, indoor)).toEqual([125, 135, 30, 255]);
    expect(ambientLight(2000, 0, indoor)).toEqual([150, 150, 30, 255]);
    const l = lighting(1200, 0, indoor);
    expect(l.draw).toBe(true);
    expect(l.fill).toEqual(INDOOR_LIGHTING);
  });

  it("el lightmap guarda color por alfa", () => {
    expect(lightmapFill([237, 237, 0, 237])).toEqual([220, 220, 0]);
    expect(lightmapFill([100, 120, 30, 255])).toEqual([100, 120, 30]);
  });
});

describe("calendario y HUD", () => {
  it("avanza el día, la estación y el año", () => {
    expect(nextDay({ season: "spring", dayOfMonth: 1, year: 1, daysPlayed: 1 })).toEqual({ season: "spring", dayOfMonth: 2, year: 1, daysPlayed: 2 });
    expect(nextDay({ season: "spring", dayOfMonth: 28, year: 1, daysPlayed: 28 })).toEqual({ season: "summer", dayOfMonth: 1, year: 1, daysPlayed: 29 });
    expect(nextDay({ season: "winter", dayOfMonth: 28, year: 1, daysPlayed: 112 })).toEqual({ season: "spring", dayOfMonth: 1, year: 2, daysPlayed: 113 });
    expect(dayOfWeek(1)).toBe(1);
    expect(dayOfWeek(7)).toBe(0);
  });

  it("formatea la hora como el original en inglés", () => {
    expect(formatTime(600)).toBe("6:00 am");
    expect(formatTime(1230)).toBe("12:30 pm");
    expect(formatTime(1310)).toBe("1:10 pm");
    expect(formatTime(2400)).toBe("12:00 am");
    expect(formatTime(2550)).toBe("1:50 am");
  });

  it("gira la aguja de π a 2π entre las 6 y las 2", () => {
    expect(clockHandRotation(600, 0)).toBeCloseTo(Math.PI);
    expect(clockHandRotation(1600, 0)).toBeCloseTo(Math.PI + Math.PI * (1599 - 600) / 2000, 2);
    expect(clockHandRotation(2600, 0)).toBeCloseTo(2 * Math.PI);
  });

  it("elige el ícono de clima", () => {
    expect(weatherIcon({ season: "spring" })).toBe(2);
    expect(weatherIcon({ season: "spring", raining: true })).toBe(4);
    expect(weatherIcon({ season: "fall", debris: true })).toBe(6);
    expect(weatherIcon({ season: "summer", raining: true, lightning: true })).toBe(5);
    expect(weatherIcon({ season: "summer", festival: true })).toBe(1);
  });
});
