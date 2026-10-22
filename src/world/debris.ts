export interface ItemDebris {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  speed: number;
}

export const MAGNET_RADIUS = 128;
const GRAVITY = 0.4;

export function spawnDebris(id: string, tileX: number, tileY: number, random: () => number = Math.random): ItemDebris {
  return { id, x: tileX * 64 + 32, y: tileY * 64 + 32, z: 0, vx: (random() - 0.5) * 6, vz: 4 + random() * 3, age: 0, speed: 0 };
}

export function stepDebris(d: ItemDebris, target: { x: number; y: number }) {
  d.age++;
  if (d.z > 0 || d.vz > 0) {
    d.x += d.vx;
    d.z += d.vz;
    d.vz -= GRAVITY;
    if (d.z <= 0) {
      d.z = 0;
      d.vz = Math.abs(d.vz) > 1.5 ? -d.vz * 0.4 : 0;
      d.vx *= 0.5;
    }
    return false;
  }
  const dx = target.x - d.x, dy = target.y - d.y;
  const dist = Math.hypot(dx, dy);
  if (dist > MAGNET_RADIUS) {
    d.speed = 0;
    return false;
  }
  if (dist < 32) return true;
  d.speed = Math.min(12, d.speed + 0.8);
  d.x += (dx / dist) * d.speed;
  d.y += (dy / dist) * d.speed;
  return false;
}

export type DebrisKind = "stone" | "twig" | "weeds" | null;

export function debrisKind(name: string | undefined, category: number | undefined): DebrisKind {
  if (category !== -999 || !name) return null;
  if (name === "Stone") return "stone";
  if (name === "Twig") return "twig";
  if (name.toLowerCase().includes("weeds")) return "weeds";
  return null;
}

export function debrisDrops(kind: DebrisKind, random: () => number = Math.random): string[] {
  if (kind === "stone") return Array(1 + Math.floor(random() * 2)).fill("390");
  if (kind === "twig") return ["388"];
  if (kind === "weeds") return random() < 0.5 ? ["771"] : [];
  return [];
}

export function toolBreaks(kind: DebrisKind, tool: string) {
  if (kind === "stone") return tool === "pickaxe";
  if (kind === "twig") return tool === "axe";
  if (kind === "weeds") return tool === "hoe" || tool === "axe" || tool === "pickaxe" || tool === "scythe";
  return false;
}
