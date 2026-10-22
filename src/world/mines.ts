import type { RGBA } from "./clock.ts";
import type { Entity } from "./terrain.ts";

export const MINE_PREFIX = "UndergroundMine";
export const MINE_SHEET = "mine";
export const LADDER_UP = 115;
export const LADDER_DOWN = 173;
export const SOLID_GROUND_EXCLUDED = 77;

export interface MineRandom {
  next(maxExclusive: number): number;
  next(minInclusive: number, maxExclusive: number): number;
  nextDouble(): number;
  nextBool(): boolean;
}

const choose = <T>(r: MineRandom, ...options: T[]) => (options.length === 2 ? (r.nextDouble() < 0.5 ? options[0] : options[1]) : options[r.next(options.length)]);

export function mineLevelOf(name: string) {
  const m = /^UndergroundMine(\d+)$/.exec(name);
  return m ? +m[1] : null;
}

export const mineLocationName = (level: number) => `${MINE_PREFIX}${level}`;

export function getMineArea(level: number) {
  if (level >= 80 && level <= 120) return 80;
  if (level > 120) return 121;
  if (level >= 40) return 40;
  if (level > 10 && level < 30) return 10;
  return 0;
}

export function mineMapNumber(level: number) {
  let n = level % 40 % 20 === 0 && level % 40 !== 0 ? 20 : level % 10 !== 0 ? level : 10;
  n %= 40;
  if (level === 120) n = 120;
  return n;
}

export function mineMapImage(level: number, mapNumber: number) {
  const area = getMineArea(level);
  let image: string | null = null;
  let dark = false;
  if (area === 40) {
    image = "Maps/Mines/mine_frost";
    if (level >= 70) {
      image += "_dark";
      dark = true;
    }
  } else if (area === 80) {
    image = "Maps/Mines/mine_lava";
    if (level >= 110 && level !== 120) {
      image += "_dark";
      dark = true;
    }
  }
  if (mapNumber === 45) {
    dark = true;
    if (!image) image = "Maps/Mines/mine_dark";
    else if (!image.endsWith("dark")) image += "_dark";
  }
  return { image, dark };
}

export function isDarkArea(level: number, loadedDark: boolean) {
  return (loadedDark || level % 40 > 30) && getMineArea(level) !== 40;
}

export function mineLighting(level: number, dark: boolean, r: MineRandom): { color: RGBA; lightingDark: boolean } {
  const area = getMineArea(level);
  let color: RGBA = area === 80 ? [100, 100, 50, 255] : [80, 80, 40, 255];
  let lightingDark = false;
  if (r.nextDouble() < 0.3 && level > 2) {
    lightingDark = true;
    color = [120, 120, 40, 255];
    if (r.nextDouble() < 0.3) color = [150, 150, 60, 255];
  }
  if (r.nextDouble() < 0.15 && level > 5 && level !== 120) {
    lightingDark = true;
    if (area === 0 || area === 10) color = [110, 110, 70, 255];
    else if (area === 40) color = [0, 0, 0, 255];
    else if (area === 80) color = [90, 130, 70, 255];
  }
  r.nextDouble();
  if (isDarkArea(level, dark) && level < 120) {
    lightingDark = true;
    color = area === 80 ? [70, 100, 100, 255] : [150, 150, 120, 255];
  }
  if (level === 100) color = [140, 140, 80, 255];
  return { color, lightingDark };
}

export interface LevelChances {
  stone: number;
  monster: number;
  item: number;
  gem: number;
}

export function levelChances(level: number, r: MineRandom): LevelChances {
  const c = { stone: r.next(10, 30) / 100, monster: 0.002 + r.next(200) / 10000, item: 0.0025, gem: 0.003 };
  if (level === 1) {
    c.monster = 0;
    c.item = 0;
    c.gem = 0;
  } else if (level % 5 === 0 && getMineArea(level) !== 121) {
    c.item = 0;
    c.gem = 0;
    if (level % 10 === 0) c.monster = 0;
  }
  c.gem /= 2;
  return c;
}

export interface MinerContext {
  dailyLuck: number;
  luckLevel: number;
  miningLevel: number;
  reachedBottom: boolean;
  professions: number[];
}

export interface Litter {
  id: string;
  hp: number;
  flipped?: boolean;
}

export function gemRichStone(level: number, r: MineRandom, reachedBottom: boolean) {
  let v = r.next(59, 70);
  v += v % 2;
  if (!reachedBottom) {
    if (level < 40 && v !== 66 && v !== 68) v = choose(r, 66, 68);
    else if (level < 80 && (v === 64 || v === 60)) v = choose(r, 66, 70, 68, 62);
  }
  return ({ 60: "12", 62: "14", 64: "4", 66: "8", 68: "10", 70: "6" } as Record<number, string>)[v] ?? "40";
}

export function createLitterObject(level: number, dark: boolean, gemChance: number, r: MineRandom, ctx: MinerContext): Litter | null {
  const area = getMineArea(level);
  let id: number;
  let hp = 1;
  if (area === 0 || area === 10) {
    id = r.next(31, 42);
    if (level % 40 < 30 && id >= 33 && id < 38) id = choose(r, 32, 38);
    else if (level % 40 >= 30) id = choose(r, 34, 36);
    if (level !== 1 && level % 5 !== 0 && r.nextDouble() < 0.029) return { id: "751", hp: 3 };
  } else if (area === 40) {
    id = r.next(47, 54);
    hp = 3;
    if (level % 5 !== 0 && r.nextDouble() < 0.029) return { id: "290", hp: 4 };
  } else if (area === 80) {
    hp = 4;
    if (r.nextDouble() < 0.3 && !isDarkArea(level, dark)) id = r.nextBool() ? 38 : 32;
    else if (r.nextDouble() < 0.3) id = r.next(55, 58);
    else id = r.nextBool() ? 760 : 762;
    if (level % 5 !== 0 && r.nextDouble() < 0.029) return { id: "764", hp: 8 };
  } else return null;
  const skill = ctx.miningLevel;
  const luck = ctx.dailyLuck + skill * 0.005;
  if (level > 50 && r.nextDouble() < 0.00025 + level / 120000 + (0.0005 * luck) / 2) {
    id = 2;
    hp = 10;
  } else if (gemChance !== 0 && r.nextDouble() < gemChance + gemChance * luck + level / 24000) {
    return { id: gemRichStone(level, r, ctx.reachedBottom), hp: 5 };
  }
  if (r.nextDouble() < 0.001 / 2 + 0.001 * skill * 0.008 + 0.001 * (ctx.dailyLuck / 2)) id = 44;
  if (level > 100 && r.nextDouble() < 0.00005 + 0.00005 * skill * 0.008 + 0.00005 * (ctx.dailyLuck / 2)) id = 46;
  id += id % 2;
  if (r.nextDouble() < 0.1 && area !== 40) {
    const big = choose(r, "668", "670");
    return { id: big, hp: 2, flipped: r.nextBool() };
  }
  return { id: String(id), hp };
}

export function randomMineItem(level: number, r: MineRandom) {
  const area = getMineArea(level);
  if (r.nextDouble() < 0.05 && level > 80) return "422";
  if (r.nextDouble() < 0.1 && level > 20 && area !== 40) return "420";
  if (r.nextDouble() < 0.25) {
    if (area === 0 || area === 10) return "86";
    if (area === 40) return "84";
    if (area === 80) return "82";
  }
  return "80";
}

export function appropriateOre(level: number, r: MineRandom): Litter {
  const area = getMineArea(level);
  let ore: Litter = { id: "751", hp: 3 };
  if (area === 40 && r.nextDouble() < 0.8) ore = { id: "290", hp: 4 };
  else if (area === 80 && r.nextDouble() < 0.8) ore = { id: "764", hp: 8 };
  if (r.nextDouble() < 0.25 && area !== 40) ore = { id: choose(r, "668", "670"), hp: 2 };
  return ore;
}

export interface MineMap {
  width: number;
  height: number;
  backType(x: number, y: number): string | undefined;
  hasTile(layer: string, x: number, y: number): boolean;
  mineIndex(layer: string, x: number, y: number): number;
  diggable(x: number, y: number): boolean;
}

export function findLadderUp(map: MineMap) {
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.mineIndex("Buildings", x, y) === LADDER_UP) return { x, y: y + 1 };
  return null;
}

type MineObject = Extract<Entity, { kind: "object" }>;
type Clump = Extract<Entity, { kind: "clump" }>;

export const isMineStone = (name: string | undefined, category: number | undefined) => category === -999 && name === "Stone";

export interface MonsterSpawn {
  name: string;
  x: number;
  y: number;
  facing?: number;
  special?: boolean;
}

export function monsterForLevel(level: number, dark: boolean, diggable: boolean, distance: number, r: MineRandom, ghostAdded: { value: boolean }): Omit<MonsterSpawn, "x" | "y"> {
  const area = getMineArea(level);
  if (area === 0 || area === 10) {
    if (r.nextDouble() < 0.25) return { name: "Bug", facing: r.next(4) };
    if (level < 15) {
      if (diggable) return { name: "Duggy" };
      if (r.nextDouble() < 0.15) return { name: "Rock Crab" };
      return { name: "Green Slime" };
    }
    if (level <= 30) {
      if (diggable) return { name: "Duggy" };
      if (r.nextDouble() < 0.15) return { name: "Rock Crab" };
      if (r.nextDouble() < 0.05 && distance > 10) return { name: "Fly" };
      if (r.nextDouble() < 0.45) return { name: "Green Slime" };
      return { name: "Grub" };
    }
    if (level <= 40) {
      if (r.nextDouble() < 0.1 && distance > 10) return { name: "Bat" };
      return { name: "Stone Golem" };
    }
  }
  if (area === 40) {
    if (level >= 70 && r.nextDouble() < 0.75) {
      r.nextDouble();
      return { name: "Skeleton" };
    }
    if (r.nextDouble() < 0.3) {
      r.nextDouble();
      return { name: "Dust Spirit" };
    }
    if (r.nextDouble() < 0.3 && distance > 10) return { name: "Frost Bat" };
    if (!ghostAdded.value && level > 50 && r.nextDouble() < 0.3 && distance > 10) {
      ghostAdded.value = true;
      return { name: "Ghost" };
    }
    return { name: "Green Slime" };
  }
  if (area === 80) {
    if (isDarkArea(level, dark) && r.nextDouble() < 0.25) return { name: "Lava Bat" };
    if (r.nextDouble() < 0.15) return { name: "Green Slime" };
    if (r.nextDouble() < 0.15) return { name: "Metal Head" };
    if (r.nextDouble() < 0.25) return { name: "Shadow Brute" };
    if (r.nextDouble() < 0.25) return { name: "Shadow Shaman" };
    if (r.nextDouble() < 0.25) return { name: "Lava Crab" };
    if (r.nextDouble() < 0.2 && distance > 8 && level >= 90) return { name: "Squid Kid" };
  }
  return { name: "Green Slime" };
}

export interface PopulatedLevel {
  monsters: MonsterSpawn[];
  entities: Entity[];
  ladder: { x: number; y: number } | null;
  stonesLeft: number;
  start: { x: number; y: number };
}

export function populateLevel(
  map: MineMap,
  level: number,
  dark: boolean,
  r: MineRandom,
  ctx: MinerContext,
  isStone: (id: string) => boolean,
): PopulatedLevel {
  const area = getMineArea(level);
  const start = findLadderUp(map) ?? { x: 6, y: 6 };
  const objects = new Map<string, MineObject>();
  const clumps: Clump[] = [];
  const key = (x: number, y: number) => `${x},${y}`;
  const occupied = (x: number, y: number) => objects.has(key(x, y)) || clumps.some((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
  const solidGround = (x: number, y: number) =>
    map.hasTile("Back", x, y) && !map.hasTile("Front", x, y) && !map.hasTile("Buildings", x, y) && map.mineIndex("Back", x, y) !== SOLID_GROUND_EXCLUDED;
  const clear = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && !(x === start.x && y === start.y) && !occupied(x, y) && map.backType(x, y) === "Stone" && solidGround(x, y);
  const distance = (x: number, y: number) => Math.hypot(x - start.x, y - start.y);
  const add = (o: MineObject) => objects.set(key(o.x, o.y), o);
  let stonesLeft = 0;
  let ladder: { x: number; y: number } | null = null;
  const monsters: MonsterSpawn[] = [];
  const ghostAdded = { value: false };
  const spawnMonster = (x: number, y: number, specialChance: number) => {
    const m = monsterForLevel(level, dark, map.diggable(x, y), distance(x, y), r, ghostAdded);
    const spawn: MonsterSpawn = { ...m, x, y };
    if (r.nextDouble() < specialChance) spawn.special = true;
    monsters.push(spawn);
    return spawn;
  };

  const chances = levelChances(level, r);
  const darkArea = isDarkArea(level, dark);
  if (level % 10 !== 0) {
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        if (!clear(x, y)) {
          if (r.nextDouble() <= chances.monster && !map.hasTile("Buildings", x, y) && !occupied(x, y) && solidGround(x, y) && distance(x, y) > 5) spawnMonster(x, y, 0.01);
          continue;
        }
        if (r.nextDouble() <= chances.stone) {
          if (area === 40 && r.nextDouble() < 0.15) {
            add({ kind: "object", x, y, itemId: String(r.next(319, 322)) });
            continue;
          }
          const litter = createLitterObject(level, dark, chances.gem, r, ctx);
          if (!litter) continue;
          add({ kind: "object", x, y, itemId: litter.id, hp: litter.hp, ...(litter.flipped ? { flipped: true } : {}) });
          if (isStone(litter.id)) stonesLeft++;
          continue;
        }
        if (r.nextDouble() <= chances.monster && distance(x, y) > 5) {
          const spawn = spawnMonster(x, y, 0.00175);
          const group = spawn.name === "Grub" ? 0.4 : spawn.name === "Dust Spirit" ? 0.6 : 0;
          if (group > 0) {
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (r.nextDouble() < group && clear(x + dx, y + dy)) monsters.push({ name: spawn.name, x: x + dx, y: y + dy });
          }
          continue;
        }
        if (r.nextDouble() <= chances.item) {
          add({ kind: "object", x, y, itemId: randomMineItem(level, r), spawned: true });
          continue;
        }
        if (r.nextDouble() <= 0.005 && !darkArea) {
          if (!clear(x + 1, y) || !clear(x, y + 1) || !clear(x + 1, y + 1)) continue;
          let index = choose(r, 752, 754);
          if (area === 40) index = choose(r, 756, 758);
          clumps.push({ kind: "clump", x, y, index, w: 2, h: 2 });
        }
      }
    }
    if (stonesLeft > 35) {
      const rounds = Math.trunc(stonesLeft / 35);
      for (let i = 0; i < rounds; i++) {
        const all = [...objects.values()];
        const pick = all[r.next(all.length)];
        if (!pick || !isStone(pick.itemId)) continue;
        const radius = r.next(3, 8);
        const spawnHere = r.nextDouble() < 0.1;
        const half = Math.trunc(radius / 2);
        for (let cx = pick.x - half; cx < pick.x + half; cx++) {
          for (let cy = pick.y - half; cy < pick.y + half; cy++) {
            const o = objects.get(key(cx, cy));
            if (!o || !isStone(o.itemId)) continue;
            objects.delete(key(cx, cy));
            stonesLeft--;
            if (distance(cx, cy) > 5 && spawnHere && r.nextDouble() < 0.12) spawnMonster(cx, cy, 0);
          }
        }
      }
    }
    const place = (base: Litter, x0: number, y0: number, chance: number, decay: number, variations: number, skip: number, mult: number) => {
      const visit = (x: number, y: number, c: number) => {
        if (x < 0 || y < 0 || x >= map.width || y >= map.height || map.hasTile("Buildings", x, y) || occupied(x, y) || !map.hasTile("Back", x, y)) return;
        const type = map.backType(x, y);
        if (!type || type === "Dirt") return;
        if (!(r.nextDouble() < skip * 2)) {
          const n = Number(base.id);
          const id = Number.isInteger(n) ? String(n + r.next(variations + 1) * mult) : base.id;
          add({ kind: "object", x, y, itemId: id, ...(base.hp ? { hp: base.hp } : {}) });
          if (isStone(id)) stonesLeft++;
        }
        const next = c - decay;
        if (r.nextDouble() < next) visit(x + 1, y, next);
        if (r.nextDouble() < next) visit(x - 1, y, next);
        if (r.nextDouble() < next) visit(x, y + 1, next);
        if (r.nextDouble() < next) visit(x, y - 1, next);
      };
      visit(x0, y0, chance);
    };
    if ((area === 10 || area === 80 || (area === 40 && r.nextDouble() < 0.1)) && !darkArea) {
      const count = r.next(7, 24);
      const weeds = area === 80 ? 316 : area === 40 ? 319 : 313;
      for (let i = 0; i < count; i++) {
        const x = r.next(map.width), y = r.next(map.height);
        place({ id: String(weeds), hp: 0 }, x, y, 1, r.next(10, 40) / 100, 2, 0.29, 1);
      }
    }
    if (r.nextDouble() < 0.95 && level > 1 && level % 5 !== 0 && level !== 120) {
      const x = r.next(map.width), y = r.next(map.height);
      if (clear(x, y)) ladder = { x, y };
    }
    if (level % 5 !== 0 && level > 2 && r.nextDouble() < 0.55 + ctx.dailyLuck) {
      let i = 0;
      do {
        const x = r.next(map.width), y = r.next(map.height);
        if (!occupied(x, y) && solidGround(x, y) && !map.diggable(x, y)) {
          let ore = appropriateOre(level, r);
          if (ore.id === "670") ore = { id: "668", hp: ore.hp };
          const big = ore.id === "668";
          place(ore, x, y, 0.95, 0.3, big ? 1 : 0, 0.05, big ? 2 : 1);
        }
        i++;
      } while (i < 1 || r.nextDouble() < 0.25 + ctx.dailyLuck);
    }
  }
  return { monsters, entities: [...objects.values(), ...clumps], ladder, stonesLeft, start };
}

export function ladderChance(stonesLeft: number, ctx: MinerContext, enemies: number) {
  let chance = 0.02 + 1 / Math.max(1, stonesLeft) + ctx.luckLevel / 100 + ctx.dailyLuck / 5;
  if (enemies === 0) chance += 0.04;
  return chance;
}

export interface Drop {
  id: string;
  count: number;
}

export interface StoneResult {
  drops: Drop[];
  experience: number;
}

const GEM_NODES: Record<string, [string, number]> = {
  "2": ["(O)72", 150],
  "4": ["(O)64", 80],
  "6": ["(O)70", 40],
  "8": ["(O)66", 16],
  "10": ["(O)68", 16],
  "12": ["(O)60", 80],
  "14": ["(O)62", 40],
};

const GEOLOGIST_BONUS: Record<string, [string, number]> = {
  "2": ["(O)72", 100],
  "4": ["(O)64", 50],
  "6": ["(O)70", 20],
  "8": ["(O)66", 8],
  "10": ["(O)68", 8],
  "12": ["(O)60", 50],
  "14": ["(O)62", 20],
};

export function breakStone(stoneId: string, r: MineRandom, ctx: MinerContext, outdoors: boolean, outdoorRandom: () => MineRandom): StoneResult {
  const miner = ctx.professions.includes(18) ? 1 : 0;
  const drops: Drop[] = [];
  const drop = (id: string, count: number) => count > 0 && drops.push({ id, count });
  let id = stoneId;
  if (id === "44") id = String(r.next(1, 8) * 2);
  const bonus = (max: number, divisor: number) => miner + r.next(1, max) + (r.nextDouble() < ctx.luckLevel / 100 ? 1 : 0) + (r.nextDouble() < ctx.miningLevel / divisor ? 1 : 0);
  let xp = 0;
  if (GEM_NODES[id]) {
    drop(GEM_NODES[id][0], 1);
    xp = GEM_NODES[id][1];
  } else if (id === "75" || id === "76" || id === "77") {
    drop(`(O)${535 + +id - 75}`, 1);
    xp = { "75": 8, "76": 16, "77": 32 }[id];
  } else if (["845", "846", "847", "668", "670"].includes(id)) {
    drop("(O)390", bonus(3, 100));
    xp = 3;
    if (r.nextDouble() < 0.08) {
      drop("(O)382", 1 + miner);
      xp = 4;
    }
  } else if (id === "751" || id === "849") {
    drop("(O)378", bonus(4, 100));
    xp = 5;
  } else if (id === "290" || id === "850") {
    drop("(O)380", bonus(4, 100));
    xp = 12;
  } else if (id === "BasicCoalNode0" || id === "BasicCoalNode1") {
    drop("(O)382", bonus(4, 100));
    xp = 10;
  } else if (id === "764") {
    drop("(O)384", bonus(4, 100));
    xp = 18;
  } else if (id === "765") {
    drop("(O)386", bonus(4, 100));
    if (r.nextDouble() < 0.035) drop("(O)74", 1);
    xp = 50;
  }
  if (ctx.professions.includes(19) && r.nextBool() && GEOLOGIST_BONUS[id]) {
    drop(GEOLOGIST_BONUS[id][0], 1);
    xp = GEOLOGIST_BONUS[id][1];
  }
  if (id === "46") {
    drop("(O)386", r.next(1, 4));
    drop("(O)384", r.next(1, 5));
    if (r.nextDouble() < 0.25) drop("(O)74", 1);
    xp = 150;
  }
  if (outdoors && xp === 0) {
    const chance = ctx.dailyLuck / 2 + ctx.miningLevel * 0.005 + ctx.luckLevel * 0.001;
    const o = outdoorRandom();
    drop("(O)390", 1);
    let total = 1;
    let coal = 0;
    if (ctx.professions.includes(21)) coal += 0.05 * (1 + chance);
    if (o.nextDouble() < coal) drop("(O)382", 1);
    if (o.nextDouble() < 0.05 * (1 + chance)) {
      drop("(O)382", 1);
      total += 5;
    }
    return { drops, experience: total };
  }
  return { drops, experience: xp };
}

export function oreForLevel(level: number, r: MineRandom) {
  if (level < 40) return level >= 20 && r.nextDouble() < 0.1 ? "(O)380" : "(O)378";
  if (level < 80) {
    if (level >= 60 && r.nextDouble() < 0.1) return "(O)384";
    return r.nextDouble() < 0.75 ? "(O)380" : "(O)378";
  }
  if (r.nextDouble() < 0.75) return "(O)384";
  return r.nextDouble() < 0.75 ? "(O)380" : "(O)378";
}

export interface MineStoneOutcome extends StoneResult {
  ladder: boolean;
}

export function checkStoneForItems(
  stoneId: string,
  level: number,
  r: MineRandom,
  ctx: MinerContext,
  state: { stonesLeft: number; ladderHasSpawned: boolean; enemies: number },
): MineStoneOutcome {
  const area = getMineArea(level);
  const modifier = ctx.dailyLuck / 2 + ctx.miningLevel * 0.005 + ctx.luckLevel * 0.001;
  r.nextDouble();
  const oreBoost = stoneId === "40" || stoneId === "42" ? 1.2 : 0.8;
  state.stonesLeft--;
  const chance = ladderChance(state.stonesLeft, ctx, state.enemies);
  let ladder = false;
  if (!state.ladderHasSpawned && (state.stonesLeft === 0 || r.nextDouble() < chance) && level !== 120) {
    ladder = true;
    state.ladderHasSpawned = true;
  }
  const broken = breakStone(stoneId, r, ctx, false, () => r);
  if (broken.experience > 0) return { ...broken, ladder };
  const drops: Drop[] = [];
  let experience = 0;
  const excavator = ctx.professions.includes(22) ? 2 : 1;
  if (r.nextDouble() < 0.022 * (1 + modifier) * excavator) {
    const geode = `(O)${535 + (area === 40 ? 1 : area === 80 ? 2 : 0)}`;
    if (ctx.professions.includes(19) && r.nextBool()) drops.push({ id: geode, count: 1 });
    drops.push({ id: geode, count: 1 });
  }
  if (level > 20 && r.nextDouble() < 0.005 * (1 + modifier) * excavator) {
    if (ctx.professions.includes(19) && r.nextBool()) drops.push({ id: "(O)749", count: 1 });
    drops.push({ id: "(O)749", count: 1 });
  }
  if (r.nextDouble() < 0.05 * (1 + modifier) * oreBoost) {
    const prospector = ctx.professions.includes(21) ? 2 : 1;
    if (r.nextDouble() < 0.25 * prospector) drops.push({ id: "(O)382", count: 1 });
    drops.push({ id: oreForLevel(level, r), count: 1 });
    experience = 5;
  } else if (r.nextBool()) drops.push({ id: "(O)390", count: 1 });
  return { drops, experience, ladder };
}

export function mineLadderLights(level: number, start: { x: number; y: number }) {
  const ladder = { x: start.x, y: start.y - 1 };
  return [0.25, 0.5, 0.75, 1].map((radius, i) => ({
    id: `Mines_${level}_${ladder.x}_${ladder.y}_${i + 1}`,
    x: ladder.x * 64 + 32,
    y: (ladder.y - 2 + i) * 64,
    radius,
  }));
}

export function outdoorStoneDestroyed(stoneId: string, x: number, y: number, ctx: MinerContext, daysPlayed: number, random: (a: number, b: number, c: number) => MineRandom): StoneResult {
  const drops: Drop[] = [];
  if (stoneId === "343" || stoneId === "450") {
    const r = random(x * 2000, y, 0);
    if (r.nextDouble() < 0.035 && daysPlayed > 1) {
      const extra = daysPlayed > 60 && r.nextDouble() < 0.2 ? 1 : daysPlayed > 120 && r.nextDouble() < 0.2 ? 2 : 0;
      drops.push({ id: `(O)${535 + extra}`, count: 1 });
    }
    if (r.nextDouble() < 0.035 * (ctx.professions.includes(21) ? 2 : 1) && daysPlayed > 1) drops.push({ id: "(O)382", count: 1 });
    if (r.nextDouble() < 0.01 && daysPlayed > 1) drops.push({ id: "(O)390", count: 1 });
  }
  const broken = breakStone(stoneId, random(x * 4000, y, 0), ctx, true, () => random(x * 1000, y, 0));
  return { drops: [...drops, ...broken.drops], experience: broken.experience };
}
