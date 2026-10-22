import type { Rect } from "./movement.ts";

export interface MonsterStats {
  health: number;
  damage: number;
  glider: boolean;
  drops: [string, number][];
  resilience: number;
  jitter: number;
  threshold: number;
  speed: number;
  missChance: number;
  mine: boolean;
  experience: number;
  displayName: string;
}

export function parseMonsterData(raw: string): MonsterStats {
  const f = raw.split("/");
  const drops = f[6].trim().split(/\s+/).filter(Boolean);
  const pairs: [string, number][] = [];
  for (let i = 0; i + 1 < drops.length; i += 2) pairs.push([drops[i], Number(drops[i + 1])]);
  return {
    health: Number(f[0]),
    damage: Number(f[1]),
    glider: f[4].toLowerCase() === "true",
    drops: pairs,
    resilience: Number(f[7]),
    jitter: Number(f[8]),
    threshold: Number(f[9]),
    speed: Number(f[10]),
    missChance: Number(f[11]),
    mine: f[12].toLowerCase() === "true",
    experience: Number(f[13]),
    displayName: f[14] ?? "",
  };
}

export type MonsterKind = "slime" | "bug";

export interface Monster {
  kind: MonsterKind;
  name: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  damage: number;
  resilience: number;
  jitter: number;
  threshold: number;
  speed: number;
  missChance: number;
  glider: boolean;
  experience: number;
  drops: string[];
  vx: number;
  vy: number;
  slipperiness: number;
  invincible: number;
  stun: number;
  facing: number;
  moving: [boolean, boolean, boolean, boolean];
  walkingToward: boolean;
  skipHorizontal: number;
  lastX: number;
  lastY: number;
  spriteHeight: number;
  frame: number;
  frameTimer: number;
  interval: number;
  yOffset: number;
  readyToJump: number;
  timeSinceLastJump: number;
  face: { x: number; y: number };
  leftDrift: boolean;
  animateTimer: number;
  color: [number, number, number];
  hasSpecialItem: boolean;
  cute: boolean;
  focused: boolean;
}

export interface MonsterRandom {
  next(maxExclusive: number): number;
  next(minInclusive: number, maxExclusive: number): number;
  nextDouble(): number;
}

function base(kind: MonsterKind, name: string, stats: MonsterStats, x: number, y: number, r: MonsterRandom): Monster {
  return {
    kind,
    name,
    x,
    y,
    health: stats.health,
    maxHealth: stats.health,
    damage: stats.damage,
    resilience: stats.resilience,
    jitter: stats.jitter,
    threshold: stats.threshold,
    speed: stats.speed,
    missChance: stats.missChance,
    glider: stats.glider,
    experience: stats.experience,
    drops: stats.drops.filter(([, chance]) => r.nextDouble() < chance).map(([id]) => id),
    vx: 0,
    vy: 0,
    slipperiness: 2,
    invincible: 0,
    stun: 0,
    facing: 2,
    moving: [false, false, false, false],
    walkingToward: stats.threshold >= 0,
    skipHorizontal: 0,
    lastX: x,
    lastY: y,
    spriteHeight: 24,
    frame: 0,
    frameTimer: 0,
    interval: 175,
    yOffset: 0,
    readyToJump: -1,
    timeSinceLastJump: 0,
    face: { x: 0, y: 0 },
    leftDrift: false,
    animateTimer: 0,
    color: [255, 255, 255],
    hasSpecialItem: false,
    cute: false,
    focused: false,
  };
}

export function createGreenSlime(stats: MonsterStats, x: number, y: number, mineLevel: number, r: MonsterRandom): Monster {
  const m = base("slime", "Green Slime", stats, x, y, r);
  const cute = r.nextDouble() < 0.49;
  r.nextDouble();
  r.next(100);
  const g = r.next(200, 256);
  const red = Math.trunc(g / r.next(2, 10));
  m.color = [red, g, r.nextDouble() < 0.01 ? 255 : 255 - g];
  if (r.nextDouble() < 0.01 && mineLevel % 5 !== 0 && mineLevel % 5 !== 1) {
    m.color = [Math.trunc(205 * 0.7), Math.trunc(255 * 0.7), 0];
    m.hasSpecialItem = true;
    m.health *= 3;
    m.damage *= 2;
  }
  m.cute = cute;
  if (cute) {
    m.health += Math.trunc(m.health / 4);
    m.damage += 1;
  }
  m.maxHealth = m.health;
  m.leftDrift = r.nextDouble() < 0.5;
  m.slipperiness = 3;
  return m;
}

export function createBug(stats: MonsterStats, x: number, y: number, facing: number, r: MonsterRandom): Monster {
  const m = base("bug", "Bug", stats, x, y, r);
  m.spriteHeight = 16;
  m.yOffset = -32;
  m.walkingToward = false;
  m.interval = 40;
  m.facing = facing;
  m.moving = [facing === 0, facing === 1, facing === 2, facing === 3];
  return m;
}

export function monsterBox(m: Monster): Rect {
  return { x: Math.trunc(m.x) + 8, y: Math.trunc(m.y) + 16, w: 48, h: 32 };
}

export function standingPixel(m: Monster) {
  const b = monsterBox(m);
  return { x: b.x + Math.trunc(b.w / 2), y: b.y + Math.trunc(b.h / 2) };
}

const DIR: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function nextBox(m: Monster, dir: number): Rect {
  const b = monsterBox(m);
  return { x: b.x + DIR[dir][0] * m.speed, y: b.y + DIR[dir][1] * m.speed, w: b.w, h: b.h };
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export interface MonsterWorld {
  collides(r: Rect, glider: boolean): boolean;
  farmer: Rect;
  farmerPosition: { x: number; y: number };
  hitFarmer(m: Monster): void;
  random: MonsterRandom;
}

function blocked(m: Monster, r: Rect, w: MonsterWorld) {
  if (m.damage > 0 && intersects(r, w.farmer)) {
    w.hitFarmer(m);
    return true;
  }
  return w.collides(r, m.glider);
}

export function withinThreshold(m: Monster, farmer: Rect, threshold = m.threshold) {
  if (m.focused) return true;
  const s = standingPixel(m);
  const tx = Math.floor(s.x / 64), ty = Math.floor(s.y / 64);
  const fx = Math.floor((farmer.x + farmer.w / 2) / 64), fy = Math.floor((farmer.y + farmer.h / 2) / 64);
  return Math.abs(tx - fx) <= threshold && Math.abs(ty - fy) <= threshold;
}

export function setOnly(m: Monster, dir: number) {
  m.moving = [dir === 0, dir === 1, dir === 2, dir === 3];
  m.facing = dir;
}

export function halt(m: Monster) {
  m.moving = [false, false, false, false];
}

export function setTrajectory(m: Monster, x: number, y: number) {
  if (Math.abs(x) > Math.abs(m.vx)) m.vx = x;
  if (Math.abs(y) > Math.abs(m.vy)) m.vy = y;
}

export function movePosition(m: Monster, w: MonsterWorld, onCollision?: () => void) {
  if (m.stun > 0) return;
  m.lastX = m.x;
  m.lastY = m.y;
  if (m.vx !== 0 || m.vy !== 0) {
    const b = monsterBox(m);
    const tx = b.x + Math.trunc(m.vx), ty = b.y - Math.trunc(m.vy);
    let steps = 1;
    if (!m.glider) {
      if (Math.abs(Math.trunc(m.vx)) > b.w) steps = Math.max(steps, Math.ceil(Math.abs(Math.trunc(m.vx)) / b.w));
      if (Math.abs(Math.trunc(m.vy)) > b.h) steps = Math.max(steps, Math.ceil(Math.abs(Math.trunc(m.vy)) / b.h));
    }
    let hit = false;
    for (let i = 1; i <= steps && !hit; i++) {
      const r = { x: Math.trunc(b.x + (tx - b.x) * (i / steps)), y: Math.trunc(b.y + (ty - b.y) * (i / steps)), w: b.w, h: b.h };
      if (blocked(m, r, w) && !m.glider) hit = true;
    }
    const decay = (k: number) => {
      if (m.slipperiness >= 1000) return;
      m.vx -= m.vx / m.slipperiness / k;
      m.vy -= m.vy / m.slipperiness / k;
      if (Math.abs(m.vx) <= 0.05) m.vx = 0;
      if (Math.abs(m.vy) <= 0.05) m.vy = 0;
    };
    if (!hit) {
      m.x += m.vx;
      m.y -= m.vy;
      decay(1);
    } else decay(m.slipperiness >= 8 ? 4 : 1);
    if (m.glider) return;
  }
  for (let dir = 0; dir < 4; dir++) {
    if (!m.moving[dir]) continue;
    if (!blocked(m, nextBox(m, dir), w)) {
      m.x += DIR[dir][0] * m.speed;
      m.y += DIR[dir][1] * m.speed;
      m.facing = dir;
    } else onCollision?.();
  }
}

function chase(m: Monster, w: MonsterWorld) {
  const p = w.farmerPosition;
  let moved = false;
  const tryAxis = (dir: number) => {
    if (moved) return;
    setOnly(m, dir);
    if (!blocked(m, nextBox(m, dir), w)) moved = true;
  };
  const horizontal = () => {
    if (p.x > m.x + 16) tryAxis(1);
    else if (p.x < m.x - 16) tryAxis(3);
  };
  const vertical = () => {
    if (p.y > m.y + 16) tryAxis(2);
    else if (p.y < m.y - 16) tryAxis(0);
  };
  if (m.lastX === m.x) {
    horizontal();
    vertical();
  } else {
    vertical();
    horizontal();
  }
  if (!moved) halt(m);
}

export function updateMovement(m: Monster, w: MonsterWorld, ms: number) {
  if (!m.walkingToward) {
    if (w.random.nextDouble() < m.jitter * 1.8 && m.skipHorizontal <= 0) {
      const d = w.random.next(6);
      if (d < 4) setOnly(m, d);
      else halt(m);
    }
  } else if (withinThreshold(m, w.farmer) && !m.glider) {
    if (m.skipHorizontal > 0) m.skipHorizontal -= ms;
    else if (m.lastX === m.x && m.lastY === m.y && w.random.nextDouble() < 0.001) {
      const vertical = m.facing === 1 || m.facing === 3;
      setOnly(m, vertical ? (w.random.nextDouble() < 0.5 ? 0 : 2) : w.random.nextDouble() < 0.5 ? 1 : 3);
      m.skipHorizontal = 700;
      return;
    } else chase(m, w);
  }
  movePosition(m, w, m.kind === "bug" ? () => bugCollide(m, w) : undefined);
}

function bugCollide(m: Monster, w: MonsterWorld) {
  if (intersects(nextBox(m, m.facing), w.farmer)) return;
  m.facing = (m.facing + 2) % 4;
  setOnly(m, m.facing);
}

function animate(m: Monster, start: number, ms: number) {
  if (m.frame < start || m.frame >= start + 4) m.frame = start;
  m.frameTimer += ms;
  if (m.frameTimer > m.interval) {
    m.frameTimer = 0;
    m.frame = start + ((m.frame - start + 1) % 4);
  }
}

function slimeBehavior(m: Monster, w: MonsterWorld, ms: number) {
  const step = (v: number, target: number, dir: 1 | -1) => (dir > 0 ? (v < target ? v + 2 : v) : v > target ? v - 2 : v);
  if (m.facing === 2) {
    m.face.x = m.face.x > 0 ? m.face.x - 2 : m.face.x < 0 ? m.face.x + 2 : 0;
    if (m.face.y < 0) m.face.y += 2;
  } else if (m.facing === 1) {
    m.face.x = step(m.face.x, 8, 1);
    if (m.face.y < 0) m.face.y += 2;
  } else if (m.facing === 3) {
    m.face.x = step(m.face.x, -8, -1);
    if (m.face.y < 0) m.face.y += 2;
  } else {
    m.face.x = m.face.x > 0 ? m.face.x - 2 : m.face.x < 0 ? m.face.x + 2 : 0;
    if (m.face.y > -8) m.face.y -= 2;
  }
  if (m.readyToJump !== -1) {
    halt(m);
    m.walkingToward = false;
    m.readyToJump -= ms;
    m.frame = 16 + Math.trunc((800 - m.readyToJump) / 200);
    if (m.readyToJump > 0) return;
    m.slipperiness = 10;
    m.walkingToward = true;
    m.readyToJump = -1;
    m.invincible = 0;
    const away = awayFromFarmer(monsterBox(m), w.farmer, m.facing, w.random);
    m.frame = 1;
    setTrajectory(m, Math.trunc(-away.x / 2), Math.trunc(-away.y / 2));
    return;
  }
  if (w.random.nextDouble() < 0.1 && !m.focused) {
    if (m.facing === 0 || m.facing === 2) {
      if (m.leftDrift && !w.collides(nextBox(m, 3), false)) m.x -= m.speed;
      else if (!m.leftDrift && !w.collides(nextBox(m, 1), false)) m.x += m.speed;
    } else if (m.leftDrift && !w.collides(nextBox(m, 0), false)) m.y -= m.speed;
    else if (!m.leftDrift && !w.collides(nextBox(m, 2), false)) m.y += m.speed;
    if (w.random.nextDouble() < 0.08) m.leftDrift = !m.leftDrift;
    return;
  }
  if (withinThreshold(m, w.farmer) && m.timeSinceLastJump > (m.focused ? 1000 : 4000) && w.random.nextDouble() < 0.01) m.readyToJump = 800;
}

function slimeAnimation(m: Monster, ms: number) {
  if (m.stun > 0) m.yOffset = 0;
  else {
    m.yOffset = Math.max(m.yOffset - Math.trunc(Math.trunc(Math.abs(m.vx + m.vy)) / 2), -64);
    if (m.yOffset < 0) m.yOffset = Math.min(0, m.yOffset + 4 + Math.trunc(m.yOffset <= -64 ? -m.yOffset / 8 : m.yOffset / 8));
    m.timeSinceLastJump += ms;
  }
  if (m.readyToJump > 0) return;
  if (Math.abs(m.vx) >= 0.5 || Math.abs(m.vy) >= 0.5) animate(m, 0, ms);
  else if (m.x !== m.lastX || m.y !== m.lastY) m.animateTimer = 500;
  if (m.animateTimer > 0) {
    m.animateTimer -= ms;
    animate(m, 0, ms);
  }
}

export function awayFromFarmer(box: Rect, farmer: Rect, facing: number, r: MonsterRandom) {
  const cx = box.x + Math.trunc(box.w / 2), cy = box.y + Math.trunc(box.h / 2);
  const px = farmer.x + Math.trunc(farmer.w / 2), py = farmer.y + Math.trunc(farmer.h / 2);
  let x = -(px - cx), y = py - cy;
  if (Math.hypot(x, y) <= 0) [x, y] = facing === 0 ? [0, 1] : facing === 1 ? [1, 0] : facing === 2 ? [0, -1] : [-1, 0];
  const len = Math.hypot(x, y);
  x /= len;
  y /= len;
  return { x: x * (50 + r.next(-20, 20)), y: y * (50 + r.next(-20, 20)) };
}

export function updateMonster(m: Monster, w: MonsterWorld, ms: number) {
  if (m.invincible > 0) m.invincible -= ms;
  updateMovement(m, w, ms);
  if (m.stun > 0) m.stun = Math.max(0, m.stun - ms);
  else if (m.kind === "slime") slimeBehavior(m, w, ms);
  if (m.kind === "slime") slimeAnimation(m, ms);
  else if (m.moving.some(Boolean)) animate(m, [8, 4, 0, 12][m.facing], ms);
}

export function takeDamage(m: Monster, damage: number, trajectory: { x: number; y: number }, addedPrecision: number, r: MonsterRandom) {
  const dealt = Math.max(1, damage - m.resilience);
  if (r.nextDouble() < m.missChance - m.missChance * addedPrecision) return -1;
  m.health -= dealt;
  setTrajectory(m, Math.trunc(trajectory.x / 3), Math.trunc(trajectory.y / 3));
  return dealt;
}

export interface WeaponStats {
  minDamage: number;
  maxDamage: number;
  knockback: number;
  precision: number;
  critChance: number;
  critMultiplier: number;
  type: number;
}

export interface Hit {
  monster: Monster;
  damage: number;
  crit: boolean;
  killed: boolean;
}

export function damageMonsters(
  monsters: Monster[],
  area: Rect,
  weapon: WeaponStats,
  farmer: { box: Rect; facing: number; luckLevel: number; professions: number[] },
  r: MonsterRandom,
): Hit[] {
  const hits: Hit[] = [];
  let crit = weapon.critChance;
  if (weapon.type === 1) crit = (crit + 0.005) * 1.12;
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    if (m.health <= 0 || !intersects(monsterBox(m), area) || m.invincible > 0) continue;
    let knock = awayFromFarmer(monsterBox(m), farmer.box, farmer.facing, r);
    if (weapon.knockback > 0) knock = { x: knock.x * weapon.knockback, y: knock.y * weapon.knockback };
    else knock = { x: m.vx, y: m.vy };
    if (m.slipperiness === -1) knock = { x: 0, y: 0 };
    let critMult = weapon.critMultiplier;
    if (farmer.professions.includes(25)) critMult += critMult * 0.5;
    let damage = r.next(weapon.minDamage, weapon.maxDamage + 1);
    const isCrit = r.nextDouble() < crit + farmer.luckLevel * (crit / 40);
    if (isCrit) damage = Math.trunc(damage * critMult);
    damage = Math.max(1, damage);
    if (farmer.professions.includes(24)) damage = Math.ceil(damage * 1.1);
    if (farmer.professions.includes(26)) damage = Math.ceil(damage * 1.15);
    if (isCrit && farmer.professions.includes(29)) damage = Math.trunc(damage * 2);
    const dealt = takeDamage(m, damage, knock, weapon.precision / 10, r);
    if (m.stun < 50) m.stun = 0;
    m.invincible = Math.trunc(450 / (weapon.type === 1 ? 3 : 2));
    hits.push({ monster: m, damage: dealt, crit: isCrit, killed: m.health <= 0 });
  }
  return hits;
}

export function swordArea(facing: number, tool: { x: number; y: number }, farmer: Rect, frame: number): Rect {
  const w = 64, h = 64, up = -32;
  let r: Rect;
  switch (facing) {
    case 0: {
      r = { x: tool.x - w / 2, y: farmer.y - h, w, h };
      const off = [[-60, -12], [-48, -56], [-12, -68], [40, -60], [56, -32], [76, -32]][frame];
      if (off) {
        r.x += off[0];
        r.y += off[1];
        if (frame === 1 || frame === 4) r.h += 32;
        if (frame === 2 || frame === 3) r.h += 48;
      }
      return r;
    }
    case 1: {
      r = { x: farmer.x + farmer.w, y: tool.y - h / 2 + up, w: h, h: w };
      const off = [[-44, -84], [4, -44], [12, -4], [12, 37], [-28, 60], [-60, 72]][frame];
      if (off) {
        r.x += off[0];
        r.y += off[1];
      }
      return r;
    }
    case 2: {
      r = { x: tool.x - w / 2, y: farmer.y + farmer.h, w, h: Math.trunc(h * 1.5) };
      const off = [[72, -92], [56, -32], [40, -28], [-12, -8], [-80, -24], [-68, -44]][frame];
      if (off) {
        r.x += off[0];
        r.y += off[1];
        if (frame === 4) r.w += 32;
      }
      return r;
    }
    default: {
      r = { x: farmer.x - h, y: tool.y - h / 2 + up, w: h, h: w };
      const off = [[56, -76], [-8, -56], [-16, -4], [0, 37], [24, 60], [64, 64]][frame];
      if (off) {
        r.x += off[0];
        r.y += off[1];
      }
      return r;
    }
  }
}

export const SWORD_FRAMES: Record<number, { frames: number[]; flip: boolean; arm: number }> = {
  0: { frames: [36, 37, 38, 39, 40, 41], flip: false, arm: 6 },
  1: { frames: [30, 31, 32, 33, 34, 35], flip: false, arm: 12 },
  2: { frames: [24, 25, 26, 27, 28, 29], flip: false, arm: 12 },
  3: { frames: [30, 31, 32, 33, 34, 35], flip: true, arm: 12 },
};

export function swordFrameTimes(speed: number) {
  const swipe = 400 - speed * 40;
  const interval = (swipe / 8) * 1.3;
  return [55, 45, 25, 25, 25, Math.trunc(interval) * 2];
}

export interface SwordPose {
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  front: boolean;
}

const SWORD_POSES: Record<number, [number, number, number, number, boolean][]> = {
  0: [
    [32, -32, -2.356194, 0, false],
    [32, -48, -1.570796, 0, false],
    [48, -52, -1.178097, 0, false],
    [48, -52, -0.3926991, 0, false],
    [56, -40, 0, 0, false],
    [64, -40, 0.3926991, 0, false],
    [64, -40, 0.3926991, 0, false],
    [20, 64, -1.963495, 0, false],
  ],
  1: [
    [40, -56, -0.7853982, 0, true],
    [56, -36, 0, 0, true],
    [60, -16, 0.7853982, 0, false],
    [60, -4, 1.570796, 0, false],
    [36, 4, 1.963495, 0, false],
    [16, 4, 2.356194, 0, false],
    [16, 4, 2.356194, 0, false],
    [48, 76, 1.963495, 0, false],
  ],
  2: [
    [56, -16, 0.3926991, 0, false],
    [52, -8, 1.570796, 0, false],
    [40, 0, 1.570796, 0, false],
    [16, 4, 2.356194, 0, false],
    [8, 8, 3.141593, 0, false],
    [12, 0, 3.534292, 0, false],
    [12, 0, 3.534292, 0, false],
    [44, 64, -5.105088, 0, false],
  ],
  3: [
    [-16, -80, 0.7853982, 1, true],
    [-48, -44, 0, 1, true],
    [-32, 16, -0.7853982, 1, false],
    [4, 44, -1.570796, 1, false],
    [44, 52, -1.963495, 1, false],
    [80, 40, -2.356194, 1, false],
    [80, 40, -2.356194, 1, false],
    [-44, 96, -5.105088, 2, false],
  ],
};

export function swordPose(facing: number, frame: number): SwordPose {
  const [x, y, rotation, effects, early] = SWORD_POSES[facing][Math.min(frame, 7)];
  return { x, y, rotation, flipX: effects === 1, flipY: effects === 2, front: !early };
}

export function farmerTakeDamage(health: number, damage: number, r: MonsterRandom, defense = 0) {
  let d = damage + r.next(Math.min(-1, Math.trunc(-damage / 8)), Math.max(1, Math.trunc(damage / 8)));
  let def = defense;
  if (def >= d * 0.5) def -= Math.trunc((def * r.next(3)) / 10);
  d = Math.max(1, d - def);
  return { health: Math.max(0, health - d), damage: d };
}

export const FARMER_INVINCIBLE_MS = 1200;

export function healthBarLayout(health: number, maxHealth: number, uiWidth: number, uiHeight: number, maxStamina: number) {
  const x = uiWidth - 48 - 8 - 56;
  void maxStamina;
  const y = uiHeight - 224 - 16 - (maxHealth - 100);
  const height = 168 + (maxHealth - 100);
  const fill = Math.trunc((health / maxHealth) * height);
  return {
    top: { x, y },
    middle: { x, y: y + 64, w: 48, h: uiHeight - 64 - 16 - (y + 64) },
    bottom: { x, y: y + 224 + (maxHealth - 100) - 64 },
    fill: { x: x + 12, y: y + 16 + 32 + height - fill, w: 24, h: fill },
  };
}
