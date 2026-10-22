import type { Entity } from "./terrain.ts";

export type TreeEntity = Extract<Entity, { kind: "tree" }>;

export const TREE_HEALTH = 10;
export const STUMP_HEALTH = 5;

export type TreeHit = { result: "none" | "shake" | "fall" | "destroyed"; drops: { id: string; count: number }[] };

export function axeDamage(stage: number, upgradeLevel = 0) {
  if (stage >= 5) return [1, 1.25, 1.67, 2.5, 5][upgradeLevel] ?? upgradeLevel + 1;
  return [2, 2.5, 3.34, 5, 10][upgradeLevel] ?? 10 + upgradeLevel - 4;
}

export function hitTree(t: TreeEntity, tool: string, upgradeLevel = 0): TreeHit {
  if (t.stage >= 3) {
    if (tool !== "axe") return { result: "none", drops: [] };
    t.health = (t.health ?? (t.stump ? STUMP_HEALTH : TREE_HEALTH)) - axeDamage(t.stage, upgradeLevel);
    if (t.health > 0) return { result: "shake", drops: [] };
    if (t.stage < 5) return { result: "destroyed", drops: [{ id: "388", count: 4 }] };
    if (!t.stump) {
      t.stump = true;
      t.health = STUMP_HEALTH;
      return { result: "fall", drops: [] };
    }
    return { result: "destroyed", drops: [{ id: "388", count: 4 }] };
  }
  if (t.stage >= 1) return ["axe", "pickaxe", "hoe", "scythe"].includes(tool) ? { result: "destroyed", drops: [] } : { result: "none", drops: [] };
  return ["axe", "pickaxe", "hoe"].includes(tool) ? { result: "destroyed", drops: [] } : { result: "none", drops: [] };
}

export const FALL_DROPS = [
  { id: "388", count: 12 },
  { id: "92", count: 5 },
];

export class TreeMotion {
  rotation = 0;
  maxShake = 0;
  shakeLeft = false;
  falling = false;

  shake(fromRight: boolean, mature: boolean) {
    this.shakeLeft = fromRight;
    this.maxShake = mature ? Math.PI / 128 : Math.PI / 64;
  }

  fall(fromRight: boolean) {
    this.falling = true;
    this.shakeLeft = fromRight;
    this.maxShake = 0;
  }

  tick(mature: boolean) {
    if (this.falling) {
      this.rotation += this.shakeLeft ? -(this.maxShake * this.maxShake) : this.maxShake * this.maxShake;
      this.maxShake += 0.001533981;
      if (Math.abs(this.rotation) > Math.PI / 2) {
        this.falling = false;
        return "fallen";
      }
      return null;
    }
    if (this.maxShake > 0) {
      const step = mature ? 0.005235988 : 0.01570796;
      if (this.shakeLeft) {
        this.rotation -= step;
        if (this.rotation <= -this.maxShake) this.shakeLeft = false;
      } else {
        this.rotation += step;
        if (this.rotation >= this.maxShake) this.shakeLeft = true;
      }
      this.maxShake = Math.max(0, this.maxShake - (mature ? 0.001022654 : 0.0015339808));
    } else {
      this.rotation /= 2;
      if (Math.abs(this.rotation) <= 0.01) this.rotation = 0;
    }
    return null;
  }
}
