import type { Emote } from "./emotes.ts";
import type { ScheduleEntry } from "./npc-schedule.ts";
import type { Location } from "./location.ts";

export interface Point {
  x: number;
  y: number;
}

export interface GraphWarp {
  x: number;
  y: number;
  to: string;
  toX: number;
  toY: number;
  door: boolean;
}

export function astar(walkable: (x: number, y: number) => boolean, start: Point, goal: Point, width: number, height: number, limit = 20000): Point[] | null {
  const key = (p: Point) => p.y * width + p.x;
  const open: { p: Point; g: number; f: number }[] = [{ p: start, g: 0, f: Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y) }];
  const came = new Map<number, number>();
  const best = new Map<number, number>([[key(start), 0]]);
  let steps = 0;
  while (open.length && steps++ < limit) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.p.x === goal.x && cur.p.y === goal.y) {
      const path: Point[] = [];
      let k: number | undefined = key(cur.p);
      while (k !== undefined) {
        path.unshift({ x: k % width, y: Math.floor(k / width) });
        k = came.get(k);
      }
      return path;
    }
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const n = { x: cur.p.x + dx, y: cur.p.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= width || n.y >= height) continue;
      if (!(n.x === goal.x && n.y === goal.y) && !walkable(n.x, n.y)) continue;
      const g = cur.g + 1;
      const nk = key(n);
      if (g >= (best.get(nk) ?? Infinity)) continue;
      best.set(nk, g);
      came.set(nk, key(cur.p));
      open.push({ p: n, g, f: g + Math.abs(n.x - goal.x) + Math.abs(n.y - goal.y) });
    }
  }
  return null;
}

export function locationRoute(graph: Record<string, GraphWarp[]>, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const w of graph[cur] ?? []) {
      if (prev.has(w.to)) continue;
      prev.set(w.to, cur);
      if (w.to === to) {
        const route = [to];
        let p = cur;
        while (p) {
          route.unshift(p);
          p = prev.get(p)!;
        }
        return route;
      }
      queue.push(w.to);
    }
  }
  return null;
}

export const NPC_SPEED = 2;
export const NPC_FRAME_MS = 175;

export interface NpcState {
  name: string;
  location: string;
  x: number;
  y: number;
  facing: number;
  schedule: ScheduleEntry[];
  next: number;
  route: { location: string; path: Point[]; exit: GraphWarp | null }[];
  segment: number;
  step: number;
  walking: boolean;
  frame: number;
  frameTimer: number;
  endFacing: number;
  emote?: Emote | null;
}

const ROW: Record<number, number> = { 0: 2, 1: 1, 2: 0, 3: 3 };

export function npcFrame(n: NpcState) {
  const row = ROW[n.facing] ?? 0;
  return row * 4 + (n.walking ? n.frame : 0);
}

export function travelTime(tiles: number) {
  const pixels = tiles * 64;
  const seconds = 7000 / 1000 * 60;
  return Math.round(pixels / 2 / seconds) * 10;
}

export interface NpcWorld {
  graph: Record<string, GraphWarp[]>;
  getLocation(name: string): Location | null;
}

const tileOf = (n: NpcState) => ({ x: Math.round(n.x / 64), y: Math.round(n.y / 64) });

export function planRoute(n: NpcState, entry: ScheduleEntry, world: NpcWorld) {
  const locations = locationRoute(world.graph, n.location, entry.location);
  if (!locations) return null;
  const route: NpcState["route"] = [];
  let start = tileOf(n);
  for (let i = 0; i < locations.length; i++) {
    const name = locations[i];
    const loc = world.getLocation(name);
    if (!loc) return undefined;
    const last = i === locations.length - 1;
    const exit = last ? null : (world.graph[name] ?? []).find((w) => w.to === locations[i + 1]) ?? null;
    const goal = last ? { x: entry.x, y: entry.y } : exit ? { x: exit.x, y: exit.y } : start;
    const walk = (x: number, y: number) => !loc.blocksFarmer(x, y) || (exit !== null && x === exit.x && y === exit.y);
    const path = astar(walk, start, goal, loc.width, loc.height) ?? [start, goal];
    route.push({ location: name, path, exit });
    if (exit) start = { x: exit.toX, y: exit.toY };
  }
  return route;
}

export function tickNpc(n: NpcState, time: number, world: NpcWorld, ms = 16) {
  if (!n.walking && n.next < n.schedule.length && n.schedule[n.next].time <= time) {
    const entry = n.schedule[n.next];
    const route = planRoute(n, entry, world);
    if (route === undefined) return;
    n.next++;
    if (route) {
      n.route = route;
      n.segment = 0;
      n.step = 1;
      n.walking = true;
      n.endFacing = entry.facing;
    }
  }
  if (!n.walking) return;
  const seg = n.route[n.segment];
  if (!seg) {
    n.walking = false;
    return;
  }
  if (n.step >= seg.path.length) {
    if (seg.exit) {
      n.location = n.route[n.segment + 1].location;
      n.x = seg.exit.toX * 64;
      n.y = seg.exit.toY * 64;
      n.segment++;
      n.step = 1;
      return;
    }
    n.walking = false;
    n.facing = n.endFacing;
    n.frame = 0;
    return;
  }
  const target = seg.path[n.step];
  const tx = target.x * 64, ty = target.y * 64;
  const dx = tx - n.x, dy = ty - n.y;
  if (Math.abs(dx) > Math.abs(dy)) n.facing = dx > 0 ? 1 : 3;
  else if (dy !== 0) n.facing = dy > 0 ? 2 : 0;
  n.x += Math.sign(dx) * Math.min(NPC_SPEED, Math.abs(dx));
  n.y += Math.sign(dy) * Math.min(NPC_SPEED, Math.abs(dy));
  if (n.x === tx && n.y === ty) n.step++;
  n.frameTimer += ms;
  if (n.frameTimer > NPC_FRAME_MS) {
    n.frameTimer = 0;
    n.frame = (n.frame + 1) % 4;
  }
}

export function startOfDay(name: string, home: { location: string; x: number; y: number; facing: number }, schedule: ScheduleEntry[]): NpcState {
  const n: NpcState = { name, location: home.location, x: home.x * 64, y: home.y * 64, facing: home.facing, schedule: [], next: 0, route: [], segment: 0, step: 0, walking: false, frame: 0, frameTimer: 0, endFacing: home.facing };
  for (const e of schedule) {
    if (e.time === 0) {
      n.location = e.location;
      n.x = e.x * 64;
      n.y = e.y * 64;
      n.facing = e.facing;
    } else n.schedule.push(e);
  }
  return n;
}
