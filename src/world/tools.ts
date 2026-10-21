import { Facing, farmerBox, TICK_MS } from "./movement.ts";
import type { AnimFrame } from "./farmer-animation.ts";

export type FrameBehavior = "swipe" | "useTool" | "canMove";

export interface SingleFrame extends AnimFrame {
  arm: number;
  start?: FrameBehavior;
  end?: FrameBehavior;
}

const f = (frame: number, ms: number, opts: Partial<SingleFrame> = {}): SingleFrame => ({ frame, ms, offsetY: 0, flip: false, arm: 6, ...opts });

export function swingAnimation(facing: Facing, power = 0, speed = 1): SingleFrame[] {
  const t = (ms: number) => Math.trunc(ms * speed);
  const hold = (base: number) => (Math.trunc((base + power * 30) * speed) << 16) >> 16;
  switch (facing) {
    case Facing.Down:
      return [f(66, t(150)), f(67, t(40), { start: "swipe" }), f(68, t(40), { start: "useTool" }), f(69, hold(170)), f(70, t(75), { end: "canMove" })];
    case Facing.Up:
      return [f(36, t(100)), f(37, t(40), { start: "swipe" }), f(38, t(40), { start: "useTool" }), f(63, hold(220)), f(62, t(75), { end: "canMove" })];
    case Facing.Right:
    case Facing.Left: {
      const flip = facing === Facing.Left;
      return [
        f(48, t(100), { flip }),
        f(49, t(40), { flip, start: "swipe" }),
        f(50, t(40), { flip, start: "useTool" }),
        f(51, hold(220), { flip }),
        f(52, t(75), { flip, end: "canMove" }),
      ];
    }
  }
}

export function wateringAnimation(facing: Facing): SingleFrame[] {
  switch (facing) {
    case Facing.Down:
      return [f(54, 0), f(54, 75, { start: "swipe" }), f(55, 100, { end: "useTool" }), f(25, 500, { end: "canMove" })];
    case Facing.Up:
      return [f(62, 0), f(62, 75, { start: "swipe" }), f(63, 100, { end: "useTool" }), f(46, 500, { arm: 12, end: "canMove" })];
    case Facing.Right:
    case Facing.Left: {
      const flip = facing === Facing.Left;
      return [f(58, 0, { flip }), f(58, 75, { flip, start: "swipe" }), f(59, 100, { flip, end: "useTool" }), f(45, 500, { flip, arm: 12, end: "canMove" })];
    }
  }
}

export class SingleAnimation {
  index = 0;
  private timer = 0;
  done = false;

  constructor(
    readonly frames: SingleFrame[],
    onBehavior: (b: FrameBehavior) => void,
  ) {
    this.fire = onBehavior;
    const first = frames[0];
    if (first?.start) onBehavior(first.start);
  }

  private readonly fire: (b: FrameBehavior) => void;

  get frame() {
    return this.frames[Math.min(this.index, this.frames.length - 1)];
  }

  tick(ms = TICK_MS) {
    if (this.done) return;
    this.timer += ms;
    if (this.timer <= this.frame.ms) return;
    this.timer = 0;
    const current = this.frames[this.index];
    if (current.end) this.fire(current.end);
    this.index++;
    if (this.index >= this.frames.length) {
      this.done = true;
      return;
    }
    const next = this.frames[this.index];
    if (next.start) this.fire(next.start);
  }
}

export type ToolKind = "hoe" | "axe" | "pickaxe" | "wateringCan" | "other";

export function toolKind(className: string | undefined): ToolKind {
  switch (className) {
    case "Hoe":
      return "hoe";
    case "Axe":
      return "axe";
    case "Pickaxe":
      return "pickaxe";
    case "WateringCan":
      return "wateringCan";
    default:
      return "other";
  }
}

const DIRECTION_OFFSET: Record<Facing, number> = { [Facing.Up]: 3, [Facing.Right]: 2, [Facing.Down]: 0, [Facing.Left]: 2 };
const CAN_DIRECTION_OFFSET: Record<Facing, number> = { [Facing.Up]: 4, [Facing.Right]: 2, [Facing.Down]: 0, [Facing.Left]: 2 };

export function toolSpriteIndex(initial: number, kind: ToolKind, facing: Facing, frameIndex: number, basicCan = true) {
  if (kind === "wateringCan") {
    const base = basicCan || frameIndex < 5 || facing === Facing.Up ? initial : initial + 1;
    return base + CAN_DIRECTION_OFFSET[facing];
  }
  let base = initial;
  if (frameIndex >= 1 && (facing === Facing.Up || (facing === Facing.Down && frameIndex >= 2))) base = initial + 1;
  return base + DIRECTION_OFFSET[facing];
}

export interface ToolDraw {
  x: number;
  y: number;
  rotation: number;
  originY: number;
  flip: boolean;
  sourceShift: number;
}

const D15 = 0.2617994, D45 = 0.7853982, D105 = 1.832596, D7_5 = 0.1308997, POWER_TILT = 0.04908739;

export function toolDrawTransform(kind: ToolKind, facing: Facing, idx: number, power = 0): ToolDraw | null {
  const p = Math.min(8, power * 4);
  if (kind === "wateringCan") {
    const l6 = 80;
    let l7 = facing === Facing.Right ? 32 : facing === Facing.Left ? -32 : 0;
    if (idx === 0 || idx === 1) l7 = Math.trunc((l7 * 3) / 2);
    const at = (x: number, y: number, rotation = 0, sourceShift = 0, flip = false): ToolDraw => ({ x: Math.trunc(x), y: Math.trunc(y), rotation, originY: 16, flip, sourceShift });
    if (facing === Facing.Right) {
      if (idx <= 1) return at(l7 - 4, -120 + l6);
      if (idx === 2) return at(l7 + 24, -136 + l6, D15);
      if (idx === 3) return at(l7 + 8, -152 + l6, 0, 16);
      return null;
    }
    if (facing === Facing.Left) {
      if (idx <= 1) return at(l7 - 4, -120 + l6, 0, 0, true);
      if (idx === 2) return at(l7 - 16, -128 + l6, -D15, 0, true);
      if (idx === 3) return at(l7 - 16, -152 + l6, 0, 16, true);
      return null;
    }
    const down = facing === Facing.Down;
    if (idx <= 1) return at(l7, -112 + l6);
    if (idx === 2) return at(l7, -128 - (down ? -4 : 32) + l6);
    if (idx === 3) return at(l7 - (down ? 4 : 0), -128 - (down ? -24 : 64) + l6, 0, down ? 16 : 0);
    return null;
  }
  const r = (x: number, y: number, rotation: number, originY: number, flip = false): ToolDraw => ({ x, y, rotation, originY, flip, sourceShift: 0 });
  switch (facing) {
    case Facing.Right:
      return [
        r(-36 - p, -104 + p, -D15 - Math.min(power, 2) * POWER_TILT, 16),
        r(8, -60, D15, 32),
        r(28, -68, D45, 32),
        r(60, -64, D105, 32),
        r(60, -60, D105, 32),
      ][idx] ?? null;
    case Facing.Left:
      return [
        r(40 + p, -120 + p, D15 + Math.min(power, 2) * POWER_TILT, 16, true),
        r(-16, -112, -D15, 16, true),
        r(-60, -68, -D45, 16, true),
        r(-44, 12, -D105, 16, true),
        r(-40, 24, -D105, 16, true),
      ][idx] ?? null;
    case Facing.Up:
      return [r(0, -136 + p, 0, 16), r(4, -88, 0, 16), r(0, -64, 0, 16), null, null][idx] ?? null;
    case Facing.Down:
      return [r(-20, -116 + p, 0, 16), r(-12, -96, -D7_5, 16), r(0, -64, 0, 16), r(0, -20, 0, 16), r(0, -16, 0, 16)][idx] ?? null;
  }
}

export function toolLayerOffset(facing: Facing) {
  if (facing === Facing.Up) return 1e-6;
  if (facing === Facing.Down) return 15e-6;
  return 0.0032;
}

export function toolLocation(x: number, y: number, facing: Facing) {
  const b = farmerBox(x, y);
  switch (facing) {
    case Facing.Up:
      return { x: b.x + Math.trunc(b.w / 2), y: b.y - 48 };
    case Facing.Right:
      return { x: b.x + b.w + 48, y: b.y + Math.trunc(b.h / 2) };
    case Facing.Down:
      return { x: b.x + Math.trunc(b.w / 2), y: b.y + b.h + 48 };
    case Facing.Left:
      return { x: b.x - 48, y: b.y + Math.trunc(b.h / 2) };
  }
}

export const toolStaminaCost = (power: number, level: number) => 2 * power - level * 0.1;
