import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Location } from "../src/world/location.ts";
import type { TiledMap } from "../src/world/location.ts";

export interface GraphWarp {
  x: number;
  y: number;
  to: string;
  toX: number;
  toY: number;
  door: boolean;
}

export function warpGraph(mapsDir: string) {
  const out: Record<string, GraphWarp[]> = {};
  for (const file of readdirSync(mapsDir)) {
    if (!file.endsWith(".tmj") || /\.[a-z]{2}-[A-Z]{2}\.tmj$/.test(file)) continue;
    const map = JSON.parse(readFileSync(join(mapsDir, file), "utf8")) as TiledMap;
    const loc = new Location(file.replace(/\.tmj$/, ""), map);
    const warps: GraphWarp[] = loc.warps.map((w) => ({ x: w.fromX, y: w.fromY, to: w.target, toX: w.toX, toY: w.toY, door: false }));
    for (let y = 0; y < loc.height; y++) {
      for (let x = 0; x < loc.width; x++) {
        const a = loc.action(x, y)?.trim().split(/\s+/);
        if (!a || (a[0] !== "Warp" && a[0] !== "LockedDoorWarp")) continue;
        const tx = Number(a[1]), ty = Number(a[2]);
        if (!a[3] || !Number.isInteger(tx) || !Number.isInteger(ty)) continue;
        warps.push({ x, y, to: a[3], toX: tx, toY: ty, door: true });
      }
    }
    if (warps.length) out[`Maps/${file.replace(/\.tmj$/, "")}`] = warps;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mapsDir, outFile] = process.argv.slice(2);
  writeFileSync(outFile, JSON.stringify(warpGraph(mapsDir)));
}
