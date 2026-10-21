import Phaser from "phaser";
import { DotNetRandom } from "../world/dotnet-random.ts";
import type { WeatherFlags } from "../world/weather.ts";
import type { SeasonName } from "../world/terrain.ts";
import {
  populateDebris,
  rainSourceRect,
  randomizeRain,
  shiftRainForViewport,
  snowTiles,
  updateDebris,
  updateRain,
  Wind,
  type RainDrop,
  type WeatherDebris,
} from "../world/weather-fx.ts";

export const RAIN_TEXTURE = "TileSheets/rain";
const CURSORS = "LooseSprites/Cursors";
export const WEATHER_DEPTH = 6;

export class WeatherRenderer {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private readonly rng = new DotNetRandom(Math.floor(Math.random() * 2147483647));
  private drops: RainDrop[] | null = null;
  private debris: WeatherDebris[] | null = null;
  private readonly wind = new Wind();
  private snow = { x: 0, y: 0 };
  private lastScroll: { x: number; y: number } | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  private image(texture: string, sx: number, sy: number, sw: number, sh: number) {
    const tex = this.scene.textures.get(texture);
    const frame = `${sx},${sy},${sw},${sh}`;
    if (!tex.has(frame)) tex.add(frame, 0, sx, sy, sw, sh);
    let img = this.pool[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, texture, frame).setOrigin(0, 0).setScrollFactor(0);
      this.pool.push(img);
    }
    this.used++;
    return img.setTexture(texture, frame).setDepth(WEATHER_DEPTH + this.used * 1e-6).setTint(0xffffff).setAlpha(1).setVisible(true);
  }

  tick(ms: number, flags: WeatherFlags, outdoors: boolean, season: SeasonName, camera: Phaser.Cameras.Scene2D.Camera) {
    const view = { width: camera.width, height: camera.height };
    const scroll = { x: Math.round(camera.scrollX), y: Math.round(camera.scrollY) };
    const delta = this.lastScroll ? { x: scroll.x - this.lastScroll.x, y: scroll.y - this.lastScroll.y } : { x: 0, y: 0 };
    this.lastScroll = scroll;
    if (!outdoors) return;
    if (flags.snowing) {
      this.snow.x -= delta.x;
      this.snow.y -= delta.y;
      return;
    }
    if (flags.raining || flags.greenRain) {
      this.drops ??= randomizeRain(this.rng, view);
      shiftRainForViewport(this.drops, delta.x, delta.y, view);
      updateRain(this.drops, ms, this.rng, view);
    } else if (flags.debris) {
      this.debris ??= populateDebris(this.rng, season, view);
      this.wind.update(season, this.rng);
      for (const d of this.debris) {
        d.x -= delta.x;
        d.y -= delta.y;
        updateDebris(d, ms, this.wind.global, season, this.rng, view);
      }
    }
  }

  draw(flags: WeatherFlags, outdoors: boolean, camera: Phaser.Cameras.Scene2D.Camera, totalMs: number) {
    this.used = 0;
    if (outdoors) {
      if (flags.snowing && this.scene.textures.exists(CURSORS)) {
        this.snow.x %= 64;
        const { source, tiles } = snowTiles(this.snow.x, this.snow.y, { width: camera.width, height: camera.height }, totalMs);
        for (const t of tiles) this.image(CURSORS, source.sx, source.sy, source.sw, source.sh).setPosition(t.x, t.y).setScale(4.001).setAlpha(0.8);
      }
      if (flags.debris && !flags.snowing && this.debris && this.scene.textures.exists(CURSORS)) {
        for (const d of this.debris) this.image(CURSORS, d.sx, d.sy, d.size, d.size).setPosition(d.x, d.y).setScale(3);
      }
      if ((flags.raining || flags.greenRain) && !flags.snowing && this.drops && this.scene.textures.exists(RAIN_TEXTURE)) {
        const width = this.scene.textures.get(RAIN_TEXTURE).getSourceImage().width;
        const passes = flags.greenRain ? 2 : 1;
        for (const d of this.drops) {
          const src = rainSourceRect(d.frame, flags.greenRain, width);
          for (let p = 0; p < passes; p++) {
            this.image(RAIN_TEXTURE, src.sx, src.sy, src.sw, src.sh)
              .setPosition(d.x, d.y)
              .setScale(4)
              .setTint(flags.greenRain ? 0x32cd32 : 0xffffff);
          }
        }
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }
}
