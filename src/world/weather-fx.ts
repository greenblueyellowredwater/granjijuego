import type { DotNetRandom } from "./dotnet-random.ts";
import type { SeasonName } from "./terrain.ts";

export interface RainDrop {
  x: number;
  y: number;
  frame: number;
  accumulator: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const RAIN_DROPS = 70;
const RAIN_STEP_MS = 70;

export function randomizeRain(rng: DotNetRandom, view: Viewport): RainDrop[] {
  return Array.from({ length: RAIN_DROPS }, () => ({
    x: rng.next(view.width),
    y: rng.next(view.height),
    frame: rng.next(4),
    accumulator: rng.next(70),
  }));
}

export function updateRain(drops: RainDrop[], ms: number, rng: DotNetRandom, view: Viewport) {
  const n = drops.length;
  drops.forEach((d, i) => {
    d.accumulator += ms;
    if (d.frame === 0) {
      if (d.accumulator < RAIN_STEP_MS) return;
      const slant = Math.trunc((i * 8) / n);
      d.x += -16 + slant;
      d.y += 32 - slant;
      d.accumulator = 0;
      if (rng.nextDouble() < 0.1) d.frame++;
      if (d.y > view.height + 64) d.y = -64;
      return;
    }
    if (d.accumulator <= RAIN_STEP_MS) return;
    d.frame = (d.frame + 1) % 4;
    d.accumulator = 0;
    if (d.frame === 0) {
      d.x = rng.next(view.width);
      d.y = rng.next(view.height);
    }
  });
}

export function shiftRainForViewport(drops: RainDrop[], dx: number, dy: number, view: Viewport) {
  for (const d of drops) {
    d.x -= dx;
    d.y -= dy;
    if (d.y > view.height + 64) d.y = -64;
    else if (d.x < -64) d.x = view.width;
    else if (d.y < -64) d.y = view.height;
    else if (d.x > view.width + 64) d.x = -64;
  }
}

export function rainSourceRect(frame: number, greenRain: boolean, textureWidth: number) {
  const index = frame + (greenRain ? 4 : 0);
  return { sx: (index * 16) % textureWidth, sy: Math.floor((index * 16) / textureWidth) * 16, sw: 16, sh: 16 };
}

export function snowTiles(snowX: number, snowY: number, view: Viewport, totalMs: number) {
  const sx = 368 + Math.trunc((totalMs % 1200) / 75) * 16;
  const out: { x: number; y: number }[] = [];
  for (let x = -64 + (snowX % 64); x < view.width; x += 64) {
    for (let y = -64 + (snowY % 64); y < view.height; y += 64) out.push({ x: Math.trunc(x), y: Math.trunc(y) });
  }
  return { source: { sx, sy: 192, sw: 16, sh: 16 }, tiles: out };
}

export interface WeatherDebris {
  x: number;
  y: number;
  which: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  size: number;
  animationIndex: number;
  animationDirection: number;
  animationTimer: number;
  animationIntervalOffset: number;
  blowing: boolean;
}

export function debrisKind(season: SeasonName) {
  return season === "summer" ? 1 : season === "fall" ? 2 : season === "winter" ? 3 : 0;
}

function newDebris(rng: DotNetRandom, x: number, y: number, which: number, dx: number, dy: number): WeatherDebris {
  const d: WeatherDebris = { x, y, which, dx, dy, sx: 352, sy: 1200, size: 16, animationIndex: 0, animationDirection: 1, animationTimer: 100, animationIntervalOffset: 0, blowing: false };
  if (which === 3) {
    d.sx = 391 + 4 * rng.next(5);
    d.sy = 1236;
    d.size = 4;
  } else {
    d.sy = which === 1 ? 1184 : which === 2 ? 1216 : 1200;
    d.animationIntervalOffset = (rng.next(25) - 12) * 2;
  }
  return d;
}

export function populateDebris(rng: DotNetRandom, season: SeasonName, view: Viewport) {
  const count = rng.next(16, 64);
  const which = debrisKind(season);
  const out: WeatherDebris[] = [];
  for (let i = 0; i < count; i++) {
    const x = rng.next(0, view.width), y = rng.next(0, view.height);
    rng.next(15);
    const dx = Math.fround(rng.next(-10, 0) / 50), dy = Math.fround(rng.next(10) / 50);
    out.push(newDebris(rng, x, y, which, dx, dy));
  }
  return out;
}

export class Wind {
  global = -0.25;
  gust = 0;

  update(season: SeasonName, rng: DotNetRandom) {
    if (season !== "fall") {
      if (this.global === 0) this.global = -0.25;
      return;
    }
    if (this.global === 0) this.global = -0.5;
    if (rng.nextDouble() < 0.001 && this.gust === 0 && this.global >= -0.5) this.gust += rng.next(-10, -1) / 100;
    else if (this.gust !== 0) {
      this.gust = Math.max(-5, this.gust * 1.02);
      this.global = -0.5 + this.gust;
      if (this.gust < -0.2 && rng.nextDouble() < 0.007) this.gust = 0;
    }
    if (this.global < -0.5) this.global = Math.min(-0.5, this.global + 0.015);
  }
}

export function updateDebris(d: WeatherDebris, ms: number, wind: number, season: SeasonName, rng: DotNetRandom, view: Viewport) {
  d.x += d.dx + wind;
  d.y += d.dy + 0.5;
  if (d.dy < 0 && !d.blowing) d.dy += 0.01;
  if (d.x < -80) {
    d.x = view.width;
    d.y = rng.next(0, view.height - 64);
  }
  if (d.y > view.height + 16) {
    d.x = rng.next(0, view.width);
    d.y = -64;
    d.dy = rng.next(-15, 10) / 50;
    d.dx = rng.next(-10, 0) / 50;
  } else if (d.y < -64) {
    d.y = view.height;
    d.x = rng.next(0, view.width);
  }
  if (d.blowing) {
    d.dy -= 0.01;
    if (rng.nextDouble() < 0.006 || d.dy < -2) d.blowing = false;
  } else if (rng.nextDouble() < 0.001 && (season === "spring" || season === "summer")) d.blowing = true;
  if (d.which > 3) return;
  d.animationTimer -= ms;
  if (d.animationTimer > 0) return;
  d.animationTimer = 100 + d.animationIntervalOffset;
  d.animationIndex += d.animationDirection;
  if (d.animationDirection === 0) d.animationDirection = d.animationIndex >= 9 ? -1 : 1;
  if (d.animationIndex > 10) {
    if (rng.nextDouble() < 0.82) {
      d.animationIndex--;
      d.animationDirection = 0;
      d.dx += 0.1;
      d.dy -= 0.2;
    } else d.animationIndex = 0;
  } else if (d.animationIndex === 4 && d.animationDirection === -1) {
    d.animationIndex++;
    d.animationDirection = 0;
    d.dx -= 0.1;
    d.dy -= 0.1;
  }
  if (d.animationIndex === 7 && d.animationDirection === -1) d.dy -= 0.2;
  if (d.which !== 3) d.sx = 352 + d.animationIndex * 16;
}
