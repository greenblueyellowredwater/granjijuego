import Phaser from "phaser";
import { SpriteFont } from "./spritefont.ts";
import { clockHandRotation, formatTime } from "../world/clock.ts";
import { dateText, energyBarLayout, moneyDigits, redToGreen } from "./hud-layout.ts";
import { healthBarLayout } from "../world/monsters.ts";

export const HUD_DEPTH = 100;
const CURSORS = "LooseSprites/Cursors";
const CURSORS_16 = "LooseSprites/Cursors_1_6";
export const DIALOGUE_FONT = "Fonts/SpriteFont1";
const SCALE = 4;
const TEXT_COLOR = 0x221122;
const SHADOW_COLOR = 0xdd9454;
const RED = 0xff0000;
const MAROON = 0x800000;

export interface HudStrings {
  shortDays: string[];
  am: string;
  pm: string;
}

export interface HudState {
  time: number;
  interval: number;
  dayOfMonth: number;
  seasonIndex: number;
  weatherIcon: number;
  money: number;
  stamina: number;
  maxStamina: number;
  health?: number;
  maxHealth?: number;
  showHealth?: boolean;
  shaking: boolean;
  timePasses: boolean;
  totalMs: number;
  random: (min: number, max: number) => number;
}

export class Hud {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private readonly font: SpriteFont;

  constructor(
    private readonly scene: Phaser.Scene,
    fontData: ConstructorParameters<typeof SpriteFont>[0],
    private readonly strings: HudStrings,
  ) {
    this.font = new SpriteFont(fontData);
  }

  private image(texture: string, sx: number, sy: number, sw: number, sh: number) {
    const tex = this.scene.textures.get(texture);
    const frame = `${sx},${sy},${sw},${sh}`;
    if (!tex.has(frame)) tex.add(frame, 0, sx, sy, sw, sh);
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, texture, frame).setScrollFactor(0);
      this.pool.push(img);
    }
    this.used++;
    return img
      .setTexture(texture, frame)
      .setOrigin(0, 0)
      .setScale(1)
      .setRotation(0)
      .setTint(0xffffff)
      .setAlpha(1)
      .setDepth(HUD_DEPTH + this.used * 1e-4)
      .setVisible(true);
  }

  private sprite(texture: string, rect: [number, number, number, number], x: number, y: number, tint = 0xffffff) {
    if (!this.scene.textures.exists(texture)) return null;
    return this.image(texture, ...rect).setPosition(x, y).setScale(SCALE).setTint(tint);
  }

  private text(text: string, x: number, y: number, color: number, alpha = 1) {
    if (!this.scene.textures.exists(DIALOGUE_FONT)) return;
    const quads = this.font.layout(text);
    const pass = (dx: number, dy: number, tint: number, a: number) => {
      for (const q of quads) this.image(DIALOGUE_FONT, q.sx, q.sy, q.sw, q.sh).setPosition(x + q.x + dx, y + q.y + dy).setTint(tint).setAlpha(a);
    };
    pass(-3, 3, SHADOW_COLOR, 1);
    pass(0, 3, SHADOW_COLOR, 1);
    pass(0, 0, color, alpha);
  }

  measure(text: string) {
    return this.font.measure(text);
  }

  private energy(s: HudState, uiWidth: number, uiHeight: number) {
    const l = energyBarLayout(s.stamina, s.maxStamina, uiWidth, uiHeight);
    this.sprite(CURSORS, [256, 408, 12, 16], l.top.x, l.top.y);
    this.sprite(CURSORS, [256, 424, 12, 16], l.middle.x, l.middle.y)?.setScale(l.middle.w / 12, l.middle.h / 16);
    this.sprite(CURSORS, [256, 448, 12, 16], l.bottom.x, l.bottom.y);
    if (l.fill.h <= 0) return;
    const [r, g, b] = l.color;
    const fill = this.image("__WHITE", 0, 0, 1, 1);
    fill.setPosition(l.fill.x, l.fill.y).setScale(l.fill.w, l.fill.h).setTint((r << 16) | (g << 8) | b);
    const dark = this.image("__WHITE", 0, 0, 1, 1);
    dark.setPosition(l.fill.x, l.fill.y).setScale(l.fill.w, Math.min(4, l.fill.h)).setTint((Math.max(0, r - 50) << 16) | (Math.max(0, g - 50) << 8) | b);
  }

  private health(s: HudState, uiWidth: number, uiHeight: number) {
    const health = s.health ?? 100, max = s.maxHealth ?? 100;
    const l = healthBarLayout(health, max, uiWidth, uiHeight, s.maxStamina);
    const pulse = health < 20 ? Math.sin(s.totalMs / (health * 50)) / 4 + 0.9 : 1;
    const tint = health < 20 ? (Math.min(255, Math.trunc(255 * pulse)) << 16) | (Math.min(255, Math.trunc(192 * pulse)) << 8) | Math.min(255, Math.trunc(203 * pulse)) : 0xffffff;
    this.sprite(CURSORS, [268, 408, 12, 16], l.top.x, l.top.y)?.setTint(tint);
    this.sprite(CURSORS, [268, 424, 12, 16], l.middle.x, l.middle.y)?.setScale(l.middle.w / 12, l.middle.h / 16).setTint(tint);
    this.sprite(CURSORS, [268, 448, 12, 16], l.bottom.x, l.bottom.y)?.setTint(tint);
    if (l.fill.h <= 0) return;
    const [r, g, b] = redToGreen(health / max);
    const fill = this.image("__WHITE", 0, 0, 1, 1);
    fill.setPosition(l.fill.x, l.fill.y).setScale(l.fill.w, l.fill.h).setTint((r << 16) | (g << 8) | b);
    const dark = this.image("__WHITE", 0, 0, 1, 1);
    dark.setPosition(l.fill.x, l.fill.y).setScale(l.fill.w, Math.min(4, l.fill.h)).setTint((Math.max(0, r - 50) << 16) | (Math.max(0, g - 50) << 8) | b);
  }

  draw(s: HudState, uiWidth: number, uiHeight = 0) {
    this.used = 0;
    if (uiHeight > 0) this.energy(s, uiWidth, uiHeight);
    if (uiHeight > 0 && s.showHealth) this.health(s, uiWidth, uiHeight);
    const px = uiWidth - 300, py = 8;
    this.sprite(CURSORS, [333, 431, 71, 43], px, py);

    const date = dateText(s.dayOfMonth, this.strings.shortDays);
    const ds = this.font.measure(date);
    this.text(date, px + 333 * 0.5625 - ds.width / 2, py + 431 * 0.1 - ds.height / 2, TEXT_COLOR);

    this.sprite(CURSORS, [406, 441 + s.seasonIndex * 8, 12, 8], px + 212, py + 68);
    if (s.weatherIcon === 999) this.sprite(CURSORS_16, [243, 293, 12, 8], px + 116, py + 68);
    else this.sprite(CURSORS, [317 + 12 * s.weatherIcon, 421, 12, 8], px + 116, py + 68);

    const time = formatTime(s.time, this.strings.am, this.strings.pm);
    const ts = this.font.measure(time);
    const jitter = () => (s.shaking ? s.random(-2, 3) : 0);
    const tx = px + 333 * 0.55 - ts.width / 2 + jitter();
    const ty = py + 431 * 0.31 - ts.height / 2 + jitter();
    const bright = s.timePasses || s.totalMs % 2000 > 1000;
    if (s.time >= 2400) this.text(time, tx, ty, RED);
    else this.text(time, tx, ty, TEXT_COLOR, bright ? 1 : 0.5);

    this.sprite(CURSORS, [340, 472, 65, 17], px + 28, py + 172);
    for (const { index, digit } of moneyDigits(s.money)) this.sprite(CURSORS, [286, 502 - digit * 8, 5, 8], px + 68 + index * 24, py + 196, MAROON);

    const hand = this.sprite(CURSORS, [324, 477, 7, 19], px + 88, py + 88);
    hand?.setOrigin(3 / 7, 17 / 19).setRotation(clockHandRotation(s.time, s.interval));

    for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }
}
