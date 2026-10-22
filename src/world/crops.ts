import { createRandom } from "./dotnet-random.ts";
import { SEASON_ORDER } from "./clock.ts";
import type { SeasonName } from "./terrain.ts";

export interface CropData {
  Seasons: number[];
  DaysInPhase: number[];
  RegrowDays: number;
  IsRaised?: boolean;
  NeedsWatering?: boolean;
  HarvestItemId: string;
  HarvestMinStack?: number;
  HarvestMaxStack?: number;
  HarvestMaxIncreasePerFarmingLevel?: number;
  ExtraHarvestChance?: number;
  HarvestMethod?: number;
  HarvestMinQuality?: number;
  HarvestMaxQuality?: number | null;
  Texture?: string | null;
  SpriteIndex: number;
}

export interface CropState {
  seed: string;
  phase: number;
  dayOfPhase: number;
  phaseDays: number[];
  fullyGrown: boolean;
  dead: boolean;
  flip: boolean;
  row: number;
  harvest: string;
  raised: boolean;
}

export const seasonIndex = (s: SeasonName) => SEASON_ORDER.indexOf(s);

export function isInSeason(data: CropData, season: SeasonName) {
  return data.Seasons.includes(seasonIndex(season));
}

export function newCrop(seed: string, data: CropData, flip: boolean): CropState {
  return {
    seed,
    phase: 0,
    dayOfPhase: 0,
    phaseDays: [...data.DaysInPhase, 99999],
    fullyGrown: false,
    dead: false,
    flip,
    row: data.SpriteIndex,
    harvest: data.HarvestItemId,
    raised: !!data.IsRaised,
  };
}

export function cropNewDay(c: CropState, data: CropData | undefined, watered: boolean, season: SeasonName, outdoors: boolean) {
  if (outdoors && (c.dead || (data && !isInSeason(data, season)))) {
    c.dead = true;
    return;
  }
  if (!(watered || (data && data.NeedsWatering === false))) return;
  const days = c.phaseDays;
  const target = () => (days.length > 0 ? days[Math.min(days.length - 1, c.phase)] : 0);
  if (!c.fullyGrown) c.dayOfPhase = Math.min(c.dayOfPhase + 1, target());
  else c.dayOfPhase--;
  if (c.dayOfPhase >= target() && c.phase < days.length - 1) {
    c.phase++;
    c.dayOfPhase = 0;
  }
  while (c.phase < days.length - 1 && days.length > 0 && days[c.phase] <= 0) c.phase++;
}

export const isHarvestable = (c: CropState) => !c.dead && c.phase >= c.phaseDays.length - 1 && (!c.fullyGrown || c.dayOfPhase <= 0);

export function cropSourceRect(c: CropState, number: number) {
  if (c.dead) return { sx: 192 + (number % 4) * 16, sy: 384, sw: 16, sh: 32 };
  const column = c.fullyGrown ? (c.dayOfPhase > 0 ? 7 : 6) : c.phase + (c.phase === 0 && number % 2 === 0 ? -1 : 0) + 1;
  return { sx: Math.min(240, column * 16 + (c.row % 2 !== 0 ? 128 : 0)), sy: Math.trunc(c.row / 2) * 32, sw: 16, sh: 32 };
}

export function cropDrawMath(c: CropState, x: number, y: number, darkWhenWatered = false) {
  const growing = c.phase < c.phaseDays.length - 1;
  const jx = ((x * 11 + y * 7) % 10) - 5, jy = ((y * 11 + x * 7) % 10) - 5;
  const drawX = x * 64 + (darkWhenWatered && growing ? jx : 0) + 32;
  const drawY = y * 64 + (!c.raised && growing ? jy : 0) + 32;
  const layer = (y * 64 + 32 + (darkWhenWatered && growing ? jy : 0)) / 10000 / (c.phase === 0 && darkWhenWatered ? 2 : 1);
  return { x: drawX, y: drawY, layer, source: cropSourceRect(c, x * 7 + y * 11), originX: 8, originY: 24 };
}

export function harvestQuality(x: number, y: number, daysPlayed: number, uniqueId: number, farmingLevel = 0, fertilizer = 0, data?: CropData) {
  const r = createRandom(x * 7, y * 11, daysPlayed, uniqueId);
  const gold = 0.2 * (farmingLevel / 10) + 0.2 * fertilizer * ((farmingLevel + 2) / 12) + 0.01;
  const silver = Math.min(0.75, gold * 2);
  let q = 0;
  if (fertilizer >= 3 && r.nextDouble() < gold / 2) q = 4;
  else if (r.nextDouble() < gold) q = 2;
  else if (r.nextDouble() < silver || fertilizer >= 3) q = 1;
  const min = data?.HarvestMinQuality ?? 0, max = data?.HarvestMaxQuality ?? q;
  q = Math.max(min, Math.min(max, q));
  let stack = 1;
  if (data) {
    const lo = data.HarvestMinStack ?? 1;
    let hi = Math.max(lo, data.HarvestMaxStack ?? 1);
    if ((data.HarvestMaxIncreasePerFarmingLevel ?? 0) > 0) hi += Math.trunc(farmingLevel * data.HarvestMaxIncreasePerFarmingLevel!);
    if (lo > 1 || hi > 1) stack = r.next(lo, hi + 1);
    if ((data.ExtraHarvestChance ?? 0) > 0) while (r.nextDouble() < Math.min(0.9, data.ExtraHarvestChance!)) stack++;
  }
  return { quality: q, stack };
}

export function afterHarvest(c: CropState, data: CropData | undefined) {
  if (data && data.RegrowDays > 0) {
    c.fullyGrown = true;
    c.dayOfPhase = data.RegrowDays;
    return c;
  }
  return null;
}

export function applySpeedIncreases(c: CropState, data: CropData, boost: number, agriculturist: boolean) {
  if (boost === 0 && !agriculturist) return;
  c.phaseDays = [...data.DaysInPhase, 99999];
  let total = 0;
  for (let i = 0; i < c.phaseDays.length - 1; i++) total += c.phaseDays[i];
  const speed = Math.fround(boost + (agriculturist ? Math.fround(0.1) : 0));
  let remove = Math.ceil(Math.fround(total * speed));
  for (let pass = 0; remove > 0 && pass < 3; pass++) {
    for (let i = 0; i < c.phaseDays.length; i++) {
      if ((i > 0 || c.phaseDays[i] > 1) && c.phaseDays[i] !== 99999 && c.phaseDays[i] > 0) {
        c.phaseDays[i]--;
        remove--;
      }
      if (remove <= 0) break;
    }
  }
}
