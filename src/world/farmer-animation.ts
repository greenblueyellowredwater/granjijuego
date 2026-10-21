import { Facing, RUN_SPEED, TICK_MS, tickDistance, WALK_SPEED } from "./movement.ts";

export interface AnimFrame {
  frame: number;
  ms: number;
  offsetY: number;
  flip: boolean;
}

type Raw = [frame: number, ms: number, offsetY?: number];

const build = (raw: Raw[], flip = false): AnimFrame[] => raw.map(([frame, ms, offsetY = 0]) => ({ frame, ms, offsetY, flip }));

const WALK_RIGHT: Raw[] = [[7, 200], [6, 200], [8, 200], [6, 200]];
const RUN_RIGHT: Raw[] = [[6, 80], [6, 10, -1], [20, 140, -2], [11, 100, 0], [6, 80], [6, 10, -1], [21, 140, -2], [17, 100, 0]];

export const ANIMATIONS: Record<number, AnimFrame[]> = {
  0: build([[1, 200], [0, 200], [2, 200], [0, 200]]),
  8: build(WALK_RIGHT),
  16: build([[13, 200], [12, 200], [14, 200], [12, 200]]),
  24: build(WALK_RIGHT, true),
  32: build([[0, 90], [1, 60, -2], [18, 120, -4], [1, 60, -2], [0, 90], [2, 60, -2], [19, 120, -4], [2, 60, -2]]),
  40: build(RUN_RIGHT),
  48: build([[12, 90], [13, 60, -2], [22, 120, -3], [13, 60, -2], [12, 90], [14, 60, -2], [23, 120, -3], [14, 60, -2]]),
  56: build(RUN_RIGHT, true),
};

const WALK_INDEX: Record<Facing, number> = { [Facing.Down]: 0, [Facing.Right]: 8, [Facing.Up]: 16, [Facing.Left]: 24 };
const IDLE: Record<Facing, AnimFrame> = {
  [Facing.Down]: { frame: 0, ms: 100, offsetY: 0, flip: false },
  [Facing.Right]: { frame: 6, ms: 100, offsetY: 0, flip: false },
  [Facing.Up]: { frame: 12, ms: 100, offsetY: 0, flip: false },
  [Facing.Left]: { frame: 6, ms: 100, offsetY: 0, flip: true },
};

export function animationIndex(facing: Facing, running: boolean) {
  return WALK_INDEX[facing] + (running ? 32 : 0);
}

export function intervalModifier(running: boolean, directions: number, ms = TICK_MS) {
  if (directions === 0) return 1;
  const k = running ? 0.0255 : 0.025;
  return 1 - k * tickDistance(running ? RUN_SPEED : WALK_SPEED, 1, ms) * 1.25;
}

export function sourceRect(frame: number) {
  return { x: (frame * 16) % 96, y: Math.floor((frame * 16) / 96) * 32, w: 16, h: 32 };
}

export class FarmerAnimator {
  private current = -1;
  private index = 0;
  private timer = 0;
  private moving = false;
  private facing: Facing = Facing.Down;

  tick(facing: Facing, moving: boolean, running: boolean, directions: number, ms = TICK_MS) {
    this.facing = facing;
    this.moving = moving;
    if (!moving) {
      this.current = -1;
      this.index = 0;
      this.timer = 0;
      return;
    }
    const which = animationIndex(facing, running);
    const frames = ANIMATIONS[which];
    if (which !== this.current) {
      this.current = which;
      this.index = Math.min(this.index, frames.length - 1) % frames.length;
    }
    this.timer += ms;
    if (this.timer > frames[this.index].ms * intervalModifier(running, directions, ms)) {
      this.index = (this.index + 1) % frames.length;
      this.timer = 0;
    }
  }

  get frame(): AnimFrame {
    if (!this.moving || this.current < 0) return IDLE[this.facing];
    return ANIMATIONS[this.current][this.index];
  }

  get animationIndexInLoop() {
    return this.index;
  }
}
