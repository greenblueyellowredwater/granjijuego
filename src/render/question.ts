import Phaser from "phaser";
import { SpriteFont, type SpriteFontData } from "./spritefont.ts";
import { DIALOGUE_FONT, HUD_DEPTH } from "./hud.ts";

const TEXT_COLOR = 0x221122;
const SELECTED_BG = 0xf6d48b;
const BOX_FILL = 0xfcdc9a;
const BOX_BORDER = 0x5b2b29;

export class QuestionBox {
  private readonly font: SpriteFont;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private selected = 0;
  private resolve: ((answer: number) => void) | null = null;
  private options: string[] = [];
  private question = "";

  constructor(
    private readonly scene: Phaser.Scene,
    fontData: SpriteFontData,
  ) {
    this.font = new SpriteFont(fontData);
  }

  get open() {
    return this.resolve !== null;
  }

  ask(question: string, options: string[]) {
    this.question = question;
    this.options = options;
    this.selected = 0;
    return new Promise<number>((resolve) => {
      this.resolve = resolve;
      this.render();
    });
  }

  move(delta: number) {
    if (!this.open) return;
    this.selected = (this.selected + delta + this.options.length) % this.options.length;
    this.render();
  }

  confirm(index = this.selected) {
    if (!this.resolve) return;
    const resolve = this.resolve;
    this.resolve = null;
    this.clear();
    resolve(index);
  }

  cancel() {
    this.confirm(this.options.length - 1);
  }

  private clear() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }

  private text(text: string, x: number, y: number, depth: number) {
    for (const q of this.font.layout(text)) {
      const tex = this.scene.textures.get(DIALOGUE_FONT);
      const frame = `${q.sx},${q.sy},${q.sw},${q.sh}`;
      if (!tex.has(frame)) tex.add(frame, 0, q.sx, q.sy, q.sw, q.sh);
      this.objects.push(this.scene.add.image(x + q.x, y + q.y, DIALOGUE_FONT, frame).setOrigin(0, 0).setScrollFactor(0).setTint(TEXT_COLOR).setDepth(depth));
    }
  }

  optionAt(screenX: number, screenY: number) {
    const layout = this.layout();
    return layout.rows.findIndex((r) => screenX >= layout.x && screenX < layout.x + layout.w && screenY >= r && screenY < r + layout.rowHeight);
  }

  private layout() {
    const cam = this.scene.cameras.main;
    const w = Math.min(1200, cam.width - 64);
    const lineHeight = this.font.data.verticalLineSpacing;
    const rowHeight = lineHeight + 16;
    const h = 64 + lineHeight + 24 + this.options.length * rowHeight;
    const x = Math.round((cam.width - w) / 2), y = cam.height - h - 32;
    const rows = this.options.map((_, i) => y + 32 + lineHeight + 24 + i * rowHeight);
    return { x, y, w, h, rows, rowHeight };
  }

  private render() {
    this.clear();
    if (!this.scene.textures.exists(DIALOGUE_FONT)) return;
    const l = this.layout();
    const depth = HUD_DEPTH + 10;
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(depth);
    g.fillStyle(BOX_FILL).fillRect(l.x, l.y, l.w, l.h).lineStyle(8, BOX_BORDER).strokeRect(l.x, l.y, l.w, l.h);
    g.fillStyle(SELECTED_BG).fillRect(l.x + 16, l.rows[this.selected] - 4, l.w - 32, l.rowHeight);
    this.objects.push(g);
    this.text(this.question, l.x + 32, l.y + 32, depth + 1);
    this.options.forEach((o, i) => this.text(o, l.x + 48, l.rows[i], depth + 1));
  }
}
