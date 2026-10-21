import Phaser from "phaser";
import { contentUrl, seasonalTexture, type Manifest, type Season } from "../content.ts";
import type { TiledMap } from "../world/location.ts";

const BASE_LAYERS = ["Back", "Buildings", "Front", "AlwaysFront"];
const HIDDEN_LAYERS = new Set(["Paths"]);
const SORTED_GROUP = "Front";
const FRONT_OFFSET = 64;
const SUBLAYER_SPREAD = 0.1;

export const DEPTH = {
  back: 0,
  shadows: 1,
  buildings: 2,
  sorted: 3,
  sortedScale: 0.5,
  alwaysFront: 5,
} as const;

interface Animation {
  interval: number;
  frames: number[];
}

interface AnimatedCell {
  anim: Animation;
  shown: number;
  apply: (gid: number) => void;
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

export function layerGroup(name: string) {
  return BASE_LAYERS.slice().sort((a, b) => b.length - a.length).find((b) => name === b || (name.startsWith(b) && /^\d+$/.test(name.slice(b.length)))) ?? name;
}

export function frontTileDepth(row: number, sublayerIndex: number, sublayerCount: number, tileSize = 64) {
  const offset = FRONT_OFFSET + (sublayerCount > 1 ? (SUBLAYER_SPREAD * sublayerIndex) / (sublayerCount - 1) : 0);
  return ((row + 1) * tileSize + offset) / 10000;
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
  readonly belowBuildingsDepth = DEPTH.shadows;
  private readonly animated: AnimatedCell[] = [];
  private readonly sortedImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly tilesets: Phaser.Tilemaps.Tileset[];

  constructor(
    private readonly scene: Phaser.Scene,
    mapPath: string,
    manifest: Manifest,
    season: Season,
    readonly scale = 1,
  ) {
    const key = mapCacheKey(mapPath);
    this.data = scene.cache.tilemap.get(key).data as TiledMap;
    this.map = scene.make.tilemap({ key });
    this.tilesets = this.map.tilesets.map((ts) => {
      const image = this.data.tilesets.find((t) => t.name === ts.name)!.image;
      return this.map.addTilesetImage(ts.name, seasonalTexture(manifest, image, season))!;
    });
    const order = drawOrder(this.map.layers.map((l) => l.name)).filter((n) => !HIDDEN_LAYERS.has(n));
    const sortedLayers = order.filter((n) => layerGroup(n) === SORTED_GROUP);
    const counters: Record<string, number> = {};
    for (const name of order) {
      const group = layerGroup(name);
      const index = (counters[group] = (counters[group] ?? -1) + 1);
      const layer = this.map.createLayer(name, this.tilesets, 0, 0);
      if (!layer) continue;
      layer.setScale(scale);
      this.layers.push(layer);
      const animations = this.animationsOf(name);
      if (group === SORTED_GROUP) {
        layer.setVisible(false);
        this.addSortedTiles(name, sortedLayers.indexOf(name), sortedLayers.length, animations);
        continue;
      }
      const base = group === "Back" ? DEPTH.back : group === "Buildings" ? DEPTH.buildings : DEPTH.alwaysFront;
      layer.setDepth(base + index * 0.01);
      for (const [cell, anim] of animations) {
        const [x, y] = cell;
        this.animated.push({ anim, shown: 0, apply: (gid) => layer.putTileAt(gid, x, y, false) });
      }
    }
  }

  private animationsOf(name: string): [[number, number], Animation][] {
    const raw = this.data.layers.find((l) => l.name === name)?.properties?.find((p) => p.name === "animations")?.value;
    return Object.entries(JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, Animation>).map(([cell, anim]) => [
      cell.split(",").map(Number) as [number, number],
      anim,
    ]);
  }

  private tileFrame(gid: number) {
    const ts = this.tilesets.filter((t) => t.firstgid <= gid).sort((a, b) => b.firstgid - a.firstgid)[0];
    if (!ts?.image) return null;
    const tex = ts.image;
    const name = `gid:${ts.name}:${gid - ts.firstgid}`;
    if (!tex.has(name)) {
      const coords = ts.getTileTextureCoordinates(gid) as { x: number; y: number } | null;
      if (!coords) return null;
      tex.add(name, 0, coords.x, coords.y, ts.tileWidth, ts.tileHeight);
    }
    return { key: tex.key, frame: name };
  }

  private addSortedTiles(name: string, sublayer: number, count: number, animations: [[number, number], Animation][]) {
    const layer = this.data.layers.find((l) => l.name === name);
    if (!layer) return;
    const { tilewidth, tileheight } = this.data;
    const anims = new Map(animations.map(([[x, y], a]) => [`${x},${y}`, a]));
    layer.data.forEach((gid, i) => {
      if (!gid) return;
      const x = i % layer.width, y = Math.floor(i / layer.width);
      const f = this.tileFrame(gid);
      if (!f) return;
      const image = this.scene.add
        .image(x * tilewidth * this.scale, y * tileheight * this.scale, f.key, f.frame)
        .setOrigin(0, 0)
        .setScale(this.scale)
        .setDepth(this.spriteDepth(frontTileDepth(y, sublayer, count, tileheight * this.scale)));
      this.sortedImages.set(`${name}:${x},${y}`, image);
      const anim = anims.get(`${x},${y}`);
      if (anim) {
        this.animated.push({
          anim,
          shown: 0,
          apply: (g) => {
            const nf = this.tileFrame(g);
            if (nf) image.setTexture(nf.key, nf.frame);
          },
        });
      }
    });
  }

  setTile(layerName: string, x: number, y: number, gid: number) {
    const image = this.sortedImages.get(`${layerName}:${x},${y}`);
    if (image) {
      const f = this.tileFrame(gid);
      if (f) image.setTexture(f.key, f.frame);
      return;
    }
    this.layers.find((l) => l.layer.name === layerName)?.putTileAt(gid, x, y, false);
  }

  spriteDepth(layerDepth: number) {
    return DEPTH.sorted + layerDepth * DEPTH.sortedScale;
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
      cell.apply(cell.anim.frames[frame]);
    }
  }
}
