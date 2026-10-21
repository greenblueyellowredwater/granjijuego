import Phaser from "phaser";

export interface UiDraw {
  texture: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  scaleX?: number;
  scaleY?: number;
  originX?: number;
  originY?: number;
  rotation?: number;
  tint?: number;
  alpha?: number;
  flipX?: boolean;
}

export class UiBatch {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  begin() {
    this.used = 0;
  }

  draw(d: UiDraw) {
    if (!this.scene.textures.exists(d.texture)) return null;
    const tex = this.scene.textures.get(d.texture);
    const frame = `${d.sx},${d.sy},${d.sw},${d.sh}`;
    if (!tex.has(frame)) tex.add(frame, 0, d.sx, d.sy, d.sw, d.sh);
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, d.texture, frame).setScrollFactor(0);
      this.pool.push(img);
    }
    this.used++;
    return img
      .setTexture(d.texture, frame)
      .setOrigin(d.originX ?? 0, d.originY ?? 0)
      .setPosition(d.x, d.y)
      .setScale(d.scaleX ?? 1, d.scaleY ?? d.scaleX ?? 1)
      .setRotation(d.rotation ?? 0)
      .setTint(d.tint ?? 0xffffff)
      .setAlpha(d.alpha ?? 1)
      .setFlipX(d.flipX ?? false)
      .setDepth(this.depth + this.used * 1e-5)
      .setVisible(true);
  }

  stretch(texture: string, src: [number, number, number, number], x: number, y: number, w: number, h: number, tint = 0xffffff, alpha = 1) {
    if (w <= 0 || h <= 0) return;
    this.draw({ texture, sx: src[0], sy: src[1], sw: src[2], sh: src[3], x, y, scaleX: w / src[2], scaleY: h / src[3], tint, alpha });
  }

  textureBox(texture: string, src: [number, number, number, number], x: number, y: number, w: number, h: number, alpha = 1, scale = 1) {
    const [sx, sy, sw] = src;
    const cs = Math.trunc(sw / 3);
    const c = Math.trunc(cs * scale);
    this.stretch(texture, [sx + cs, sy + cs, cs, cs], x + c, y + c, w - c * 2, h - c * 2, 0xffffff, alpha);
    this.draw({ texture, sx, sy, sw: cs, sh: cs, x, y, scaleX: scale, alpha });
    this.draw({ texture, sx: sx + cs * 2, sy, sw: cs, sh: cs, x: x + w - c, y, scaleX: scale, alpha });
    this.draw({ texture, sx, sy: sy + cs * 2, sw: cs, sh: cs, x, y: y + h - c, scaleX: scale, alpha });
    this.draw({ texture, sx: sx + cs * 2, sy: sy + cs * 2, sw: cs, sh: cs, x: x + w - c, y: y + h - c, scaleX: scale, alpha });
    this.stretch(texture, [sx + cs, sy, cs, cs], x + c, y, w - c * 2, c, 0xffffff, alpha);
    this.stretch(texture, [sx + cs, sy + cs * 2, cs, cs], x + c, y + h - c, w - c * 2, c, 0xffffff, alpha);
    this.stretch(texture, [sx, sy + cs, cs, cs], x, y + c, c, h - c * 2, 0xffffff, alpha);
    this.stretch(texture, [sx + cs * 2, sy + cs, cs, cs], x + w - c, y + c, c, h - c * 2, 0xffffff, alpha);
  }

  end() {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }
}
