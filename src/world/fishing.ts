export const MIN_BITE_TIME = 600;
export const MAX_BITE_TIME = 30000;
export const MAX_TIME_TO_NIBBLE = 800;
export const CASTING_TIMER_SPEED = 0.001;

export function biteTime(fishingLevel: number, firstCast: boolean, random: () => number) {
  const max = Math.max(MIN_BITE_TIME, MAX_BITE_TIME - 250 * fishingLevel);
  let t = Math.fround(MIN_BITE_TIME + Math.floor(random() * (max - MIN_BITE_TIME)));
  if (firstCast) t = Math.fround(t * 0.75);
  return Math.max(500, t);
}

export const addedDistance = (level: number) => (level >= 15 ? 4 : level >= 8 ? 3 : level >= 4 ? 2 : level >= 1 ? 1 : 0);

export function bobberLanding(power: number, level: number, facing: number, standing: { x: number; y: number }) {
  if (facing === 1 || facing === 3) {
    const d = Math.max(128, power * (addedDistance(level) + 4) * 64) - 8;
    return { x: standing.x + (facing === 3 ? -1 : 1) * d, y: standing.y };
  }
  const d = Math.max(128, power * (addedDistance(level) + 3) * 64);
  return { x: standing.x, y: standing.y + (facing === 0 ? -d : d) };
}

export function distanceToLand(tx: number, ty: number, isWater: (x: number, y: number) => boolean, onMap: (x: number, y: number) => boolean) {
  let found = false, distance = 1, r = 1;
  while (!found && r < 20) {
    for (let x = tx - r; x <= tx + r && !found; x++) {
      for (let y = ty - r; y <= ty + r && !found; y++) {
        if (x !== tx - r && x !== tx + r && y !== ty - r && y !== ty + r) continue;
        if (onMap(x, y) && !isWater(x, y)) {
          found = true;
          distance = r;
        }
      }
    }
    r++;
  }
  return found ? distance : 1;
}

export interface SpawnFishData {
  Id?: string;
  ItemId?: string | null;
  RandomItemId?: string[] | null;
  Condition?: string | null;
  Chance?: number;
  Season?: number | null;
  FishAreaId?: string | null;
  BobberPosition?: { x: number; y: number; width: number; height: number } | null;
  PlayerPosition?: { x: number; y: number; width: number; height: number } | null;
  MinFishingLevel?: number;
  MinDistanceFromShore?: number;
  MaxDistanceFromShore?: number;
  ApplyDailyLuck?: boolean;
  CuriosityLureBuff?: number;
  CatchLimit?: number;
  CanUseTrainingRod?: boolean | null;
  IsBossFish?: boolean;
  RequireMagicBait?: boolean;
  Precedence?: number;
  IgnoreFishDataRequirements?: boolean;
  ChanceBoostPerLuckLevel?: number;
}

export interface FishContext {
  season: number;
  time: number;
  raining: boolean;
  fishingLevel: number;
  dailyLuck: number;
  luckLevel: number;
  waterDepth: number;
  playerTile: { x: number; y: number };
  bobberTile: { x: number; y: number };
  tutorial: boolean;
  trainingRod: boolean;
  caught: Record<string, [number, number]>;
  condition: (q: string) => boolean;
  random: () => number;
}

const contains = (r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

export function checkFishRequirements(qualifiedId: string, fish: Record<string, string>, spawn: SpawnFishData, c: FishContext) {
  if (!qualifiedId.startsWith("(O)")) return !c.tutorial;
  const raw = fish[qualifiedId.slice(3)];
  if (!raw) return !c.tutorial;
  const f = raw.split("/");
  if (f[1] === "trap") return !c.tutorial;
  if (c.trainingRod) {
    if (spawn.CanUseTrainingRod === false) return false;
    if (spawn.CanUseTrainingRod == null && Number(f[1]) >= 50) return false;
  }
  if (c.tutorial && f[13] !== "true") return false;
  if (spawn.IgnoreFishDataRequirements) return true;
  const times = (f[5] ?? "").split(" ").map(Number);
  let inTime = false;
  for (let i = 0; i + 1 < times.length; i += 2) if (c.time >= times[i] && c.time < times[i + 1]) inTime = true;
  if (!inTime) return false;
  if (f[7] === "rainy" && !c.raining) return false;
  if (f[7] === "sunny" && c.raining) return false;
  if (c.fishingLevel < Number(f[12] ?? 0)) return false;
  const maxDepth = Number(f[9]), chanceBase = Number(f[10]), depthMult = Number(f[11]);
  let chance = Math.fround(chanceBase);
  if (Number.isFinite(maxDepth) && Number.isFinite(chanceBase) && Number.isFinite(depthMult)) {
    chance = Math.fround(chance - Math.max(0, maxDepth - c.waterDepth) * Math.fround(depthMult * chanceBase));
    chance = Math.fround(chance + c.fishingLevel / 50);
    if (c.trainingRod) chance = Math.fround(chance * 1.1);
    chance = Math.min(chance, 0.9);
  }
  if (spawn.ApplyDailyLuck) chance += c.dailyLuck;
  return c.random() < chance;
}

export function spawnChance(s: SpawnFishData, c: FishContext) {
  let chance = s.Chance ?? 1;
  if (s.ApplyDailyLuck) chance += c.dailyLuck;
  return chance + (s.ChanceBoostPerLuckLevel ?? 0) * c.luckLevel;
}

export function chooseFish(defaults: SpawnFishData[], local: SpawnFishData[], fish: Record<string, string>, c: FishContext): { id: string; boss: boolean } {
  const ordered = [...defaults, ...local].map((s) => ({ s, k: c.random() })).sort((a, b) => (a.s.Precedence ?? 0) - (b.s.Precedence ?? 0) || a.k - b.k).map((x) => x.s);
  for (let pass = 0; pass < 2; pass++) {
    for (const s of ordered) {
      if (s.FishAreaId) continue;
      if (s.Season != null && s.Season !== c.season) continue;
      if (s.PlayerPosition && !contains(s.PlayerPosition, c.playerTile)) continue;
      if (s.BobberPosition && !contains(s.BobberPosition, c.bobberTile)) continue;
      if (c.fishingLevel < (s.MinFishingLevel ?? 0)) continue;
      if (c.waterDepth < (s.MinDistanceFromShore ?? 0)) continue;
      if ((s.MaxDistanceFromShore ?? -1) > -1 && c.waterDepth > s.MaxDistanceFromShore!) continue;
      if (s.RequireMagicBait) continue;
      if (!(c.random() < spawnChance(s, c))) continue;
      if (s.Condition && !c.condition(s.Condition)) continue;
      let id = s.ItemId ?? null;
      if (s.RandomItemId?.length) id = s.RandomItemId[Math.floor(c.random() * s.RandomItemId.length)];
      if (!id || !/^\(O\)\w+$/.test(id)) {
        const options = (id ?? "").split("|").filter((x) => /^\(O\)\w+$/.test(x));
        if (!options.length) continue;
        id = options[Math.floor(c.random() * options.length)];
      }
      if ((s.CatchLimit ?? -1) > -1 && (c.caught[id]?.[0] ?? 0) >= s.CatchLimit!) continue;
      if (!checkFishRequirements(id, fish, s, c)) continue;
      return { id, boss: !!s.IsBossFish };
    }
  }
  return { id: c.tutorial ? "(O)145" : "(O)168", boss: false };
}

export function fishingExperience(quality: number, difficulty: number, treasure: boolean, perfect: boolean, boss: boolean) {
  let xp = Math.max(1, (quality + 1) * 3 + Math.trunc(difficulty / 3));
  if (treasure) xp += Math.trunc(Math.fround(xp * 1.2));
  if (perfect) xp += Math.trunc(Math.fround(xp * 1.4));
  return boss ? xp * 5 : xp;
}

const MOTIONS: Record<string, number> = { mixed: 0, dart: 1, smooth: 2, sinker: 3, floater: 4 };

export class BobberBarState {
  difficulty: number;
  motionType: number;
  minFishSize: number;
  maxFishSize: number;
  fishSize: number;
  fishQuality: number;
  bobberBarHeight: number;
  bobberBarPos: number;
  bobberBarSpeed = 0;
  bobberPosition = 508;
  bobberTargetPosition: number;
  bobberSpeed = 0;
  bobberAcceleration = 0;
  floaterSinkerAcceleration = 0;
  bobberInBar = false;
  distanceFromCatching = 0.3;
  perfect = true;
  fishSizeReductionTimer = 800;
  reelRotation = 0;
  fishShake = { x: 0, y: 0 };
  barShake = { x: 0, y: 0 };
  scale = 0;
  fadeIn = true;
  fadeOut = false;
  done: "caught" | "lost" | null = null;
  firstFish: boolean;
  beginnersRod: boolean;

  constructor(raw: string, sizeFactor: number, fishingLevel: number, beginnersRod: boolean, firstFish: boolean, readonly boss = false) {
    const f = raw.split("/");
    this.difficulty = Number(f[1]);
    this.motionType = MOTIONS[(f[2] ?? "").toLowerCase()] ?? 0;
    this.minFishSize = Number(f[3]);
    this.maxFishSize = Number(f[4]);
    this.fishSize = Math.trunc(Math.fround(this.minFishSize + (this.maxFishSize - this.minFishSize) * sizeFactor)) + 1;
    this.fishQuality = sizeFactor < 0.33 ? 0 : sizeFactor < 0.66 ? 1 : 2;
    this.beginnersRod = beginnersRod;
    this.bobberBarHeight = 96 + fishingLevel * 8;
    if (fishingLevel < 5 && beginnersRod) this.bobberBarHeight += 40 - fishingLevel * 8;
    if (beginnersRod) this.fishQuality = 0;
    this.firstFish = firstFish;
    if (firstFish) {
      this.distanceFromCatching = 0.1;
      if (this.difficulty < 50) this.difficulty = 50;
    }
    this.bobberBarPos = 568 - this.bobberBarHeight;
    this.bobberTargetPosition = ((100 - this.difficulty) / 100) * 548;
  }

  update(pressed: boolean, random: () => number) {
    const rnd = (min: number, max: number) => min + Math.floor(random() * (max - min));
    if (this.fadeIn) {
      this.scale += 0.05;
      if (this.scale >= 1) {
        this.scale = 1;
        this.fadeIn = false;
      }
      return;
    }
    if (this.fadeOut) {
      this.scale -= 0.05;
      if (this.scale <= 0) {
        this.scale = 0;
        this.fadeOut = false;
        this.done = this.distanceFromCatching > 0.9 ? "caught" : "lost";
      }
      return;
    }
    if (random() < (this.difficulty * (this.motionType === 2 ? 20 : 1)) / 4000 && (this.motionType !== 2 || this.bobberTargetPosition === -1)) {
      const space = 548 - this.bobberPosition;
      const pct = Math.min(99, this.difficulty + rnd(10, 45)) / 100;
      this.bobberTargetPosition = this.bobberPosition + rnd(Math.min(-this.bobberPosition, space), space) * pct;
    }
    if (this.motionType === 4) this.floaterSinkerAcceleration = Math.max(this.floaterSinkerAcceleration - 0.01, -1.5);
    else if (this.motionType === 3) this.floaterSinkerAcceleration = Math.min(this.floaterSinkerAcceleration + 0.01, 1.5);
    if (Math.abs(this.bobberPosition - this.bobberTargetPosition) > 3 && this.bobberTargetPosition !== -1) {
      this.bobberAcceleration = (this.bobberTargetPosition - this.bobberPosition) / (rnd(10, 30) + (100 - Math.min(100, this.difficulty)));
      this.bobberSpeed += (this.bobberAcceleration - this.bobberSpeed) / 5;
    } else if (this.motionType !== 2 && random() < this.difficulty / 2000) {
      this.bobberTargetPosition = this.bobberPosition + (random() < 0.5 ? rnd(-100, -51) : rnd(50, 101));
    } else this.bobberTargetPosition = -1;
    if (this.motionType === 1 && random() < this.difficulty / 1000) {
      const d = Math.trunc(this.difficulty) * 2;
      this.bobberTargetPosition = this.bobberPosition + (random() < 0.5 ? rnd(-100 - d, -51) : rnd(50, 101 + d));
    }
    this.bobberTargetPosition = Math.max(-1, Math.min(this.bobberTargetPosition, 548));
    this.bobberPosition += this.bobberSpeed + this.floaterSinkerAcceleration;
    if (this.bobberPosition > 532) this.bobberPosition = 532;
    else if (this.bobberPosition < 0) this.bobberPosition = 0;
    this.bobberInBar = this.bobberPosition + 12 <= this.bobberBarPos - 32 + this.bobberBarHeight && this.bobberPosition - 16 >= this.bobberBarPos - 32;
    if (this.bobberPosition >= 548 - this.bobberBarHeight && this.bobberBarPos >= 568 - this.bobberBarHeight - 4) this.bobberInBar = true;
    let gravity = pressed ? -0.25 : 0.25;
    if (pressed && gravity < 0 && (this.bobberBarPos === 0 || this.bobberBarPos === 568 - this.bobberBarHeight)) this.bobberBarSpeed = 0;
    if (this.bobberInBar) gravity *= 0.6;
    this.bobberBarSpeed += gravity;
    this.bobberBarPos += this.bobberBarSpeed;
    if (this.bobberBarPos + this.bobberBarHeight > 568) {
      this.bobberBarPos = 568 - this.bobberBarHeight;
      this.bobberBarSpeed = (-this.bobberBarSpeed * 2) / 3;
    } else if (this.bobberBarPos < 0) {
      this.bobberBarPos = 0;
      this.bobberBarSpeed = (-this.bobberBarSpeed * 2) / 3;
    }
    if (this.bobberInBar) {
      this.distanceFromCatching += 0.002;
      this.reelRotation += Math.PI / 8;
      this.fishShake = { x: rnd(-10, 11) / 10, y: rnd(-10, 11) / 10 };
      this.barShake = { x: 0, y: 0 };
    } else {
      if (this.fishShake.x !== 0 || this.fishShake.y !== 0) this.perfect = false;
      this.fishSizeReductionTimer -= 16;
      if (this.fishSizeReductionTimer <= 0) {
        this.fishSize = Math.max(this.minFishSize, this.fishSize - 1);
        this.fishSizeReductionTimer = 800;
      }
      if (!this.firstFish) this.distanceFromCatching -= this.beginnersRod ? 0.002 : 0.003;
      const d = Math.abs(this.bobberPosition - (this.bobberBarPos + this.bobberBarHeight / 2));
      this.reelRotation -= Math.PI / Math.max(10, 200 - d);
      this.barShake = { x: rnd(-10, 11) / 10, y: rnd(-10, 11) / 10 };
      this.fishShake = { x: 0, y: 0 };
    }
    this.distanceFromCatching = Math.max(0, Math.min(1, this.distanceFromCatching));
    if (this.distanceFromCatching <= 0 || this.distanceFromCatching >= 1) {
      this.fadeOut = true;
      if (this.distanceFromCatching >= 1 && !this.perfect && this.fishSize === this.maxFishSize) this.fishSize--;
    }
    this.bobberPosition = Math.max(0, Math.min(548, this.bobberPosition));
  }

  get resultQuality() {
    if (!this.perfect) return this.fishQuality;
    return this.fishQuality >= 2 ? 4 : this.fishQuality >= 1 ? 2 : this.fishQuality;
  }
}

export function fishSizeFactor(clearWaterDistance: number, fishingLevel: number, random: () => number) {
  let f = Math.fround(clearWaterDistance / 5);
  const lo = 1 + Math.trunc(fishingLevel / 2);
  const hi = Math.max(6, lo);
  f = Math.fround(f * Math.fround((lo + Math.floor(random() * (hi - lo))) / 5));
  f = Math.fround(f * (1 + (Math.floor(random() * 21) - 10) / 100));
  return Math.max(0, Math.min(1, f));
}
