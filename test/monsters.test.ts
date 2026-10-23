import { describe, expect, it } from "vitest";
import {
  createBat,
  createGrub,
  createRockCrab,
  createStoneGolem,
  hitWithPickaxe,
  takeDamage,
  createBug,
  createGreenSlime,
  damageMonsters,
  farmerTakeDamage,
  healthBarLayout,
  monsterBox,
  parseMonsterData,
  swordArea,
  swordFrameTimes,
  swordPose,
  updateMonster,
  type MonsterRandom,
  type MonsterWorld,
} from "../src/world/monsters.ts";

const SLIME = "24/5/0/0/false/1000/766 .75 766 .05 153 .1 66 .015 92 .15 96 .005 99 .001/1/.01/4/2/.00/true/3/Green Slime";
const BUG = "1/8/0/0/false/2000/684 .76 157 .02 114 .005 96 .005 99 .001/0/0/-1/2/.0/true/1/Bug";

function scripted(doubles: number[], ints: number[] = []): MonsterRandom {
  return {
    next: (a: number, b?: number) => {
      const v = ints.shift();
      if (v === undefined) return b === undefined ? 0 : a;
      return b === undefined ? Math.min(v, a - 1) : Math.max(a, Math.min(v, b - 1));
    },
    nextDouble: () => doubles.shift() ?? 0.99,
  };
}

const open: MonsterWorld = { collides: () => false, farmer: { x: 1000, y: 1000, w: 48, h: 32 }, farmerPosition: { x: 992, y: 1000 }, hitFarmer: () => {}, random: scripted([]) };

describe("monstruos: datos y creación", () => {
  it("lee Data/Monsters", () => {
    const s = parseMonsterData(SLIME);
    expect([s.health, s.damage, s.resilience, s.threshold, s.speed, s.experience, s.glider]).toEqual([24, 5, 1, 4, 2, 3, false]);
    expect(s.drops[0]).toEqual(["766", 0.75]);
  });

  it("crea un slime verde con color y botín", () => {
    const m = createGreenSlime(parseMonsterData(SLIME), 64, 128, 3, scripted([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [50, 230, 4]));
    expect(m.drops).toEqual(["766"]);
    expect(m.color).toEqual([57, 230, 25]);
    expect([m.health, m.damage, m.slipperiness]).toEqual([24, 5, 3]);
  });

  it("los slimes tiernos tienen más vida y daño", () => {
    const m = createGreenSlime(parseMonsterData(SLIME), 0, 0, 3, scripted([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.1, 0.5], [0, 200, 2]));
    expect(m.cute).toBe(true);
    expect([m.health, m.damage]).toEqual([30, 6]);
  });

  it("el bicho camina en línea recta y da la vuelta al chocar", () => {
    const bug = createBug(parseMonsterData(BUG), 0, 0, 1, scripted([]));
    updateMonster(bug, open, 16);
    expect(bug.x).toBe(2);
    updateMonster(bug, { ...open, collides: (r) => r.x > bug.x + 8 }, 16);
    expect(bug.facing).toBe(3);
  });
});

describe("monstruos: combate", () => {
  const weapon = { minDamage: 2, maxDamage: 5, knockback: 1, precision: 0, critChance: 0.02, critMultiplier: 3, type: 3 };

  it("el golpe resta resiliencia, empuja y da invencibilidad", () => {
    const m = createGreenSlime(parseMonsterData(SLIME), 128, 128, 3, scripted([]));
    m.health = 24;
    const farmer = { box: { x: 136, y: 64, w: 48, h: 32 }, facing: 2, luckLevel: 0, professions: [] };
    const hits = damageMonsters([m], monsterBox(m), weapon, farmer, scripted([0.5, 0.9], [0, 0, 4]));
    expect(hits).toEqual([{ monster: m, damage: 3, crit: false, killed: false }]);
    expect(m.health).toBe(21);
    expect(m.vy).toBeLessThan(0);
    expect(m.invincible).toBe(225);
    expect(damageMonsters([m], monsterBox(m), weapon, farmer, scripted([]))).toEqual([]);
  });

  it("los críticos multiplican el daño", () => {
    const m = createBug(parseMonsterData(BUG), 0, 0, 0, scripted([]));
    m.health = 100;
    const hits = damageMonsters([m], monsterBox(m), weapon, { box: { x: 0, y: -64, w: 48, h: 32 }, facing: 2, luckLevel: 0, professions: [] }, scripted([0.01, 0.9], [0, 0, 5]));
    expect(hits[0]).toMatchObject({ damage: 15, crit: true });
  });

  it("áreas y poses de la espada", () => {
    expect(swordArea(2, { x: 32, y: 112 }, { x: 8, y: 0, w: 48, h: 32 }, 0)).toEqual({ x: 72, y: -60, w: 64, h: 96 });
    expect(swordArea(1, { x: 104, y: 16 }, { x: 8, y: 0, w: 48, h: 32 }, 2)).toEqual({ x: 68, y: -52, w: 64, h: 64 });
    expect(swordPose(2, 2)).toEqual({ x: 40, y: 0, rotation: 1.570796, flipX: false, flipY: false, front: true });
    expect(swordPose(1, 0).front).toBe(false);
    expect(swordFrameTimes(0)).toEqual([55, 45, 25, 25, 25, 130]);
  });

  it("daño al granjero con variación y vida mínima 0", () => {
    expect(farmerTakeDamage(100, 5, scripted([], [-1]))).toEqual({ health: 96, damage: 4 });
    expect(farmerTakeDamage(3, 16, scripted([], [-2]))).toEqual({ health: 0, damage: 14 });
  });

  it("barra de vida a la izquierda de la de energía", () => {
    const l = healthBarLayout(50, 100, 1280, 720, 270);
    expect(l.top).toEqual({ x: 1168, y: 480 });
    expect(l.fill).toEqual({ x: 1180, y: 612, w: 24, h: 84 });
  });
});

const CRAB = "30/5/0/0/false/0/717 .15 286 .4 96 .005 99 .001/1/0/1/2/.0/true/4/Rock Crab";
const GRUB = "20/4/0/0/false/1000/684 .6 273 .05 273 .05 157 .02 114 .005 96 .005 99 .001/0/.005/3/1/.00/true/2/Grub";
const GOLEM = "45/5/0/0/false/1000/390 .9 80 .1 382 .1 380 .1 96 .005 99 .001/5/.01/3/2/.00/true/5/Stone Golem";
const BAT = "24/6/0/0/true/1000/767 .9 767 .4 108 .001 287 .02 96 .005 99 .001/1/.01/4/3/.00/true/3/Bat";

describe("monstruos de las primeras minas", () => {
  it("el caparazón del cangrejo bloquea golpes hasta romperlo con el pico", () => {
    const crab = createRockCrab(parseMonsterData(CRAB), 0, 0, scripted([0.9]));
    expect(crab.waiter).toBe(false);
    expect(takeDamage(crab, 10, { x: 0, y: 0 }, 0, scripted([0.9]))).toBe(0);
    for (let i = 0; i < 5; i++) expect(hitWithPickaxe(crab, { x: 0, y: 100, w: 48, h: 32 }, scripted([]))).toBe(true);
    expect(crab.shellGone).toBe(true);
    expect(takeDamage(crab, 10, { x: 0, y: 0 }, 0, scripted([0.9]))).toBe(9);
  });

  it("la larva herida se vuelve pupa y luego mosca", () => {
    const grub = createGrub(parseMonsterData(GRUB), 0, 0, scripted([]));
    grub.health = 5;
    const spawned: string[] = [];
    const w = { ...open, spawn: (m: { kind: string }) => spawned.push(m.kind), createFly: () => createBat(parseMonsterData(BAT), 0, 0, scripted([])) };
    for (let i = 0; i < 400 && !grub.pupating; i++) updateMonster(grub, w, 16);
    expect(grub.pupating).toBe(true);
    for (let i = 0; i < 300 && grub.health > -500; i++) updateMonster(grub, w, 16);
    expect(grub.health).toBe(-500);
    expect(spawned).toEqual(["bat"]);
  });

  it("el gólem despierta cuando el granjero se acerca", () => {
    const golem = createStoneGolem(parseMonsterData(GOLEM), 1000, 1000, 50, scripted([]));
    expect([golem.health, golem.damage, golem.frame]).toEqual([78, 7, 16]);
    updateMonster(golem, open, 16);
    expect(golem.seenPlayer).toBe(true);
    for (let i = 0; i < 60 && !golem.walkingToward; i++) updateMonster(golem, open, 16);
    expect([golem.walkingToward, golem.threshold, golem.frame]).toEqual([true, 16, 0]);
  });
});
