import { TILE, type Location } from "./location.ts";

export const Facing = { Up: 0, Right: 1, Down: 2, Left: 3 } as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

export interface Body {
  x: number;
  y: number;
  facing: Facing;
}

export interface MoveInput {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  running: boolean;
}

export const FARMER_BOX = { dx: 8, dy: 16, w: 48, h: 32 };
export const RUN_SPEED = 5;
export const WALK_SPEED = 2;
const TICK_MS = 1000 / 60;
const DIAGONAL = 0.707;

export function farmerBox(x: number, y: number) {
  return { left: x + FARMER_BOX.dx, top: y + FARMER_BOX.dy, right: x + FARMER_BOX.dx + FARMER_BOX.w, bottom: y + FARMER_BOX.dy + FARMER_BOX.h };
}

export function collides(loc: Location, x: number, y: number) {
  const b = farmerBox(x, y);
  const xs = [Math.floor(b.left / TILE), Math.floor((b.right - 1) / TILE)];
  const ys = [Math.floor(b.top / TILE), Math.floor((b.bottom - 1) / TILE)];
  for (const ty of ys) for (const tx of xs) if (loc.blocksFarmer(tx, ty)) return true;
  return false;
}

export function centerTile(body: Body) {
  const b = farmerBox(body.x, body.y);
  return { x: Math.floor((b.left + b.right) / 2 / TILE), y: Math.floor((b.top + b.bottom) / 2 / TILE) };
}

export function facingTile(body: Body) {
  const c = centerTile(body);
  const d = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][body.facing];
  return { x: c.x + d[0], y: c.y + d[1] };
}

export function step(loc: Location, body: Body, input: MoveInput, dtMs: number) {
  if (input.dx === 0 && input.dy === 0) return false;
  if (input.dx !== 0) body.facing = input.dx > 0 ? Facing.Right : Facing.Left;
  else body.facing = input.dy > 0 ? Facing.Down : Facing.Up;
  let speed = (input.running ? RUN_SPEED : WALK_SPEED) * (dtMs / TICK_MS);
  if (input.dx !== 0 && input.dy !== 0) speed *= DIAGONAL;
  let moved = false;
  const nx = body.x + input.dx * speed;
  if (input.dx !== 0 && !collides(loc, nx, body.y)) {
    body.x = nx;
    moved = true;
  }
  const ny = body.y + input.dy * speed;
  if (input.dy !== 0 && !collides(loc, body.x, ny)) {
    body.y = ny;
    moved = true;
  }
  return moved;
}

export function findOpenTile(loc: Location, fromX: number, fromY: number, radius = 40) {
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = fromX + dx, y = fromY + dy;
        if (loc.inBounds(x, y) && !loc.warpAt(x, y) && !collides(loc, x * TILE, y * TILE)) return { x, y };
      }
    }
  }
  return null;
}
