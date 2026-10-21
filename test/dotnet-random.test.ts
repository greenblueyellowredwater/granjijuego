import { describe, expect, it } from "vitest";
import { createRandomSeed, DotNetRandom, xxHash32 } from "../src/world/dotnet-random.ts";

const ascii = (s: string) => new TextEncoder().encode(s);

describe("DotNetRandom", () => {
  it("reproduce la secuencia de System.Random con semilla", () => {
    const r0 = new DotNetRandom(0);
    expect([r0.next(), r0.next(), r0.next()]).toEqual([1559595546, 1755192844, 1649316166]);
    expect(new DotNetRandom(1).next()).toBe(534011718);
  });

  it("acota Next(max) y Next(min, max)", () => {
    const r = new DotNetRandom(123);
    for (let i = 0; i < 1000; i++) {
      const a = r.next(3);
      const b = r.next(-2, 3);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(3);
      expect(b).toBeGreaterThanOrEqual(-2);
      expect(b).toBeLessThan(3);
    }
  });

  it("trata igual semillas negativas y positivas", () => {
    expect(new DotNetRandom(-5).next()).toBe(new DotNetRandom(5).next());
  });
});

describe("xxHash32", () => {
  it("coincide con los vectores de referencia", () => {
    expect(xxHash32(ascii(""))).toBe(0x02cc5d05);
    expect(xxHash32(ascii("a"))).toBe(0x550d7456);
    expect(xxHash32(ascii("abc"))).toBe(0x32d153ff);
    expect(xxHash32(ascii("Nobody inspects the spammish repetition"))).toBe(0xe2293b2f);
  });
});

describe("createRandomSeed", () => {
  it("es determinista y depende de cada argumento", () => {
    expect(createRandomSeed(1, 2, 3, 4, 5)).toBe(createRandomSeed(1, 2, 3, 4, 5));
    expect(createRandomSeed(1, 2, 3, 4, 5)).not.toBe(createRandomSeed(1, 2, 3, 4, 6));
    expect(createRandomSeed(2147483647 + 3)).toBe(createRandomSeed(3));
  });
});
