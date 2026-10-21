import { TILE, type Location, type Warp } from "./location.ts";

export const Facing = { Up: 0, Right: 1, Down: 2, Left: 3 } as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

export const TICK_MS = 16;
export const TICKS_PER_SECOND = 60;
export const RUN_SPEED = 5;
export const WALK_SPEED = 2;
const SPEED_FACTOR = 0.066;
const DIAGONAL = 0.707;
const PROCESS_ORDER: Facing[] = [Facing.Up, Facing.Down, Facing.Right, Facing.Left];
const FACING_PRIORITY: Facing[] = [Facing.Left, Facing.Right, Facing.Up, Facing.Down];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Body {
  x: number;
  y: number;
  facing: Facing;
}

export interface StepResult {
  moved: boolean;
  warp?: Warp;
}

export function positionForTile(tx: number, ty: number) {
  return { x: tx * TILE, y: ty * TILE + 16 };
}

export function farmerBox(x: number, y: number): Rect {
  return { x: Math.trunc(x) + 8, y: Math.trunc(y), w: 48, h: 32 };
}

export function tickDistance(speed: number, directions: number, ms = TICK_MS) {
  const d = Math.max(1, speed * SPEED_FACTOR * ms);
  return directions > 1 ? d * DIAGONAL : d;
}

export function rectCollides(loc: Location, r: Rect) {
  const xs = [Math.floor(r.x / TILE), Math.floor((r.x + r.w - 1) / TILE)];
  const ys = [Math.floor(r.y / TILE), Math.floor((r.y + r.h - 1) / TILE)];
  for (const ty of ys) for (const tx of xs) if (loc.blocksFarmer(tx, ty)) return true;
  return false;
}

export function collides(loc: Location, x: number, y: number) {
  return rectCollides(loc, farmerBox(x, y));
}

export function warpTouching(loc: Location, r: Rect) {
  const xs = new Set([Math.floor(r.x / TILE), Math.floor((r.x + r.w) / TILE)]);
  const ys = new Set([Math.floor(r.y / TILE), Math.floor((r.y + r.h) / TILE)]);
  return loc.warps.find((w) => xs.has(w.fromX) && ys.has(w.fromY));
}

const DELTA: Record<Facing, [number, number]> = {
  [Facing.Up]: [0, -1],
  [Facing.Right]: [1, 0],
  [Facing.Down]: [0, 1],
  [Facing.Left]: [-1, 0],
};

function shifted(r: Rect, dir: Facing, amount: number): Rect {
  const [dx, dy] = DELTA[dir];
  return { ...r, x: r.x + dx * amount, y: r.y + dy * amount };
}

export function facingFor(pressed: ReadonlySet<Facing>, current: Facing) {
  return FACING_PRIORITY.find((f) => pressed.has(f)) ?? current;
}

export function step(loc: Location, body: Body, pressed: ReadonlySet<Facing>, running: boolean, ms = TICK_MS): StepResult {
  if (pressed.size === 0) return { moved: false };
  body.facing = facingFor(pressed, body.facing);
  const speed = running ? RUN_SPEED : WALK_SPEED;
  const distance = tickDistance(speed, pressed.size, ms);
  const startX = body.x, startY = body.y;

  for (const dir of PROCESS_ORDER) {
    if (!pressed.has(dir)) continue;
    const box = farmerBox(body.x, body.y);
    const next = shifted(box, dir, speed);
    const warp = warpTouching(loc, next);
    if (warp) return { moved: body.x !== startX || body.y !== startY, warp };
    const [dx, dy] = DELTA[dir];
    if (!rectCollides(loc, next)) {
      body.x += dx * distance;
      body.y += dy * distance;
      continue;
    }
    if (!rectCollides(loc, shifted(box, dir, Math.ceil(distance / 2)))) {
      body.x += (dx * distance) / 2;
      body.y += (dy * distance) / 2;
      continue;
    }
    if (pressed.size === 1) nudgeAroundCorner(loc, body, box, next, dir, speed, ms);
  }
  return { moved: body.x !== startX || body.y !== startY };
}

function nudgeAroundCorner(loc: Location, body: Body, box: Rect, next: Rect, dir: Facing, speed: number, ms: number) {
  const amount = speed * (ms / 64);
  const vertical = dir === Facing.Up || dir === Facing.Down;
  if (vertical) {
    const quarter = Math.trunc(next.w / 4);
    const left = rectCollides(loc, { ...next, w: quarter });
    const right = rectCollides(loc, { ...next, x: next.x + quarter * 3, w: quarter });
    if (left && !right && !rectCollides(loc, shifted(box, Facing.Right, speed))) body.x += amount;
    else if (right && !left && !rectCollides(loc, shifted(box, Facing.Left, speed))) body.x -= amount;
  } else {
    const quarter = Math.trunc(next.h / 4);
    const top = rectCollides(loc, { ...next, h: quarter });
    const bottom = rectCollides(loc, { ...next, y: next.y + quarter * 3, h: quarter });
    if (top && !bottom && !rectCollides(loc, shifted(box, Facing.Down, speed))) body.y += amount;
    else if (bottom && !top && !rectCollides(loc, shifted(box, Facing.Up, speed))) body.y -= amount;
  }
}

export function shadowAboveBuildings(loc: Location, body: Body) {
  const b = farmerBox(body.x, body.y);
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w) / TILE);
  const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h + 8) / TILE);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (loc.shadowAboveBuildingsAt(x, y)) return true;
  return false;
}

export function centerTile(body: Body) {
  const b = farmerBox(body.x, body.y);
  return { x: Math.floor((b.x + b.w / 2) / TILE), y: Math.floor((b.y + b.h / 2) / TILE) };
}

export function facingTile(body: Body) {
  const c = centerTile(body);
  const [dx, dy] = DELTA[body.facing];
  return { x: c.x + dx, y: c.y + dy };
}

export function findOpenTile(loc: Location, fromX: number, fromY: number, radius = 40) {
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = fromX + dx, y = fromY + dy;
        const p = positionForTile(x, y);
        if (loc.inBounds(x, y) && !loc.warpAt(x, y) && !collides(loc, p.x, p.y)) return { x, y };
      }
    }
  }
  return null;
}
