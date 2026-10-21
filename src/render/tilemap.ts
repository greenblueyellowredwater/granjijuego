import Phaser from "phaser";
import { contentUrl, seasonalTexture, type Manifest, type Season } from "../content.ts";
import type { TiledMap } from "../world/location.ts";

const BASE_LAYERS = ["Back", "Buildings", "Front", "AlwaysFront"];
const HIDDEN_LAYERS = new Set(["Paths"]);

interface Animation {
  interval: number;
  frames: number[];
}

interface AnimatedCell {
  layer: Phaser.Tilemaps.TilemapLayer;
  x: number;
  y: number;
  anim: Animation;
  shown: number;
}

export function drawOrder(names: string[]) {
  const order: string[] = [];
  for (const base of BASE_LAYERS) {
    if (names.includes(base)) order.push(base);
    const extras = names
      .filter((n) => n.startsWith(base) && /^\d+$/.test(n.slice(base.length)))
      .sort((a, b) => +a.slice(base.length) - +b.slice(base.length));
    order.push(...extras);
  }
  return order;
}

export const mapCacheKey = (mapPath: string) => `map:${mapPath}`;

export function queueTilemap(scene: Phaser.Scene, mapPath: string, manifest: Manifest, season: Season) {
  const key = mapCacheKey(mapPath);
  const queueImages = () => {
    const json = scene.cache.tilemap.get(key).data as TiledMap;
    for (const ts of json.tilesets) {
      const tex = seasonalTexture(manifest, ts.image, season);
      if (!scene.textures.exists(tex)) scene.load.image(tex, contentUrl(tex, "png"));
    }
  };
  if (scene.cache.tilemap.exists(key)) queueImages();
  else {
    scene.load.tilemapTiledJSON(key, contentUrl(mapPath, "tmj"));
    scene.load.once(`filecomplete-tilemapJSON-${key}`, queueImages);
  }
}

export class RenderedMap {
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly layers: Phaser.Tilemaps.TilemapLayer[] = [];
  readonly data: TiledMap;
  readonly characterDepth: number;
  readonly belowBuildingsDepth: number;
  private readonly animated: AnimatedCell[] = [];

  constructor(
    scene: Phaser.Scene,
    mapPath: string,
    manifest: Manifest,
    season: Season,
    readonly scale = 1,
  ) {
    const key = mapCacheKey(mapPath);
    this.data = scene.cache.tilemap.get(key).data as TiledMap;
    this.map = scene.make.tilemap({ key });
    const tilesets = this.map.tilesets.map((ts) => {
      const image = this.data.tilesets.find((t) => t.name === ts.name)!.image;
      return this.map.addTilesetImage(ts.name, seasonalTexture(manifest, image, season))!;
    });
    const order = drawOrder(this.map.layers.map((l) => l.name));
    let characterDepth = order.length;
    let belowBuildingsDepth = -1;
    order.forEach((name, depth) => {
      if (name === "Front" && characterDepth === order.length) characterDepth = depth - 0.5;
      if (name === "Buildings") belowBuildingsDepth = depth - 0.5;
      if (HIDDEN_LAYERS.has(name)) return;
      const layer = this.map.createLayer(name, tilesets, 0, 0);
      if (!layer) return;
      layer.setDepth(depth).setScale(scale);
      this.layers.push(layer);
      const raw = this.data.layers.find((l) => l.name === name)?.properties?.find((p) => p.name === "animations")?.value;
      for (const [cell, anim] of Object.entries(JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, Animation>)) {
        const [x, y] = cell.split(",").map(Number);
        this.animated.push({ layer, x, y, anim, shown: 0 });
      }
    });
    this.characterDepth = characterDepth;
    this.belowBuildingsDepth = belowBuildingsDepth >= 0 ? belowBuildingsDepth : characterDepth - 0.5;
  }

  get widthInPixels() {
    return this.map.widthInPixels * this.scale;
  }

  get heightInPixels() {
    return this.map.heightInPixels * this.scale;
  }

  update(time: number) {
    for (const cell of this.animated) {
      const frame = Math.floor(time / cell.anim.interval) % cell.anim.frames.length;
      if (frame === cell.shown) continue;
      cell.shown = frame;
      cell.layer.putTileAt(cell.anim.frames[frame], cell.x, cell.y, false);
    }
  }
}
