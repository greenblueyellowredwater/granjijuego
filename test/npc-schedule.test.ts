import { describe, expect, it } from "vitest";
import { parseSchedule, scheduleKey, type ScheduleContext } from "../src/world/npc-schedule.ts";

const ctx: ScheduleContext = { season: "spring", dayOfMonth: 5, hearts: 0, raining: false, year: 1 };
const home = { location: "SeedShop", x: 4, y: 17 };

describe("horarios de NPC", () => {
  it("elige la clave con el orden del original", () => {
    const raw = { spring: "x", Fri: "y", spring_Fri: "z", rain: "r", spring_5: "d", "5": "n" };
    expect(scheduleKey("Pierre", raw, ctx)).toBe("spring_5");
    expect(scheduleKey("Pierre", { ...raw, spring_5: undefined } as unknown as Record<string, string>, ctx)).toBe("spring_5");
    const { spring_5: _a, ...noSeasonDay } = raw;
    expect(scheduleKey("Pierre", noSeasonDay, ctx)).toBe("5");
    const { "5": _b, ...noDay } = noSeasonDay;
    expect(scheduleKey("Pierre", noDay, { ...ctx, raining: true, random: () => 0.9 })).toBe("rain");
    expect(scheduleKey("Pierre", noDay, ctx)).toBe("spring_Fri");
    expect(scheduleKey("Pierre", { spring: "x", Fri: "y" }, ctx)).toBe("Fri");
    expect(scheduleKey("Pierre", { spring: "x" }, { ...ctx, dayOfMonth: 6 })).toBe("spring");
  });

  it("parsea entradas con ubicación, orientación, animación y mensaje", () => {
    const raw = { spring: '700 SeedShop 10 20 0/830 4 17 2/a1700 Town 11 20 0 pierre_shop "Strings\\\\x:y"/2300 SeedShop 24 4 1 pierre_sleep' };
    expect(parseSchedule("Pierre", "spring", raw, home, ctx)).toEqual([
      { time: 700, arrival: false, location: "SeedShop", x: 10, y: 20, facing: 0, animation: null, message: null },
      { time: 830, arrival: false, location: "SeedShop", x: 4, y: 17, facing: 2, animation: null, message: null },
      { time: 1700, arrival: true, location: "Town", x: 11, y: 20, facing: 0, animation: "pierre_shop", message: "Strings\\\\x:y" },
      { time: 2300, arrival: false, location: "SeedShop", x: 24, y: 4, facing: 1, animation: "pierre_sleep", message: null },
    ]);
  });

  it("sigue GOTO, NOT friendship y MAIL", () => {
    const raw = { spring: "800 Town 1 1 2", Mon: "GOTO spring", Tue: "NOT friendship Abigail 4/900 Town 2 2 2", Wed: "MAIL ccDone/900 Town 3 3/1000 Town 4 4" };
    expect(parseSchedule("X", "Mon", raw, home, ctx)![0].x).toBe(1);
    expect(parseSchedule("X", "Tue", raw, home, ctx)![0].x).toBe(2);
    expect(parseSchedule("X", "Tue", raw, home, { ...ctx, heartsWith: () => 5 })![0].x).toBe(1);
    expect(parseSchedule("X", "Wed", raw, home, ctx)![0].x).toBe(3);
    expect(parseSchedule("X", "Wed", raw, home, { ...ctx, mail: new Set(["ccDone"]) })![0].x).toBe(4);
  });
});
