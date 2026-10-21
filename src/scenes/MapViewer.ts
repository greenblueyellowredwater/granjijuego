import Phaser from "phaser";
import { contentUrl, seasonalTexture, type Manifest, type Season } from "../content.ts";

const BASE_LAYERS = ["Back", "Buildings", "Front", "AlwaysFront"];
const HIDDEN_LAYERS = new Set(["Paths"]);
const PIXEL_ZOOM = 4;

interface TiledProp {
  name: string;
  value: unknown;
}

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

export interface MapViewerData {
  manifest: Manifest;
  map: string;
  season: Season;
  onHover: (info: string) => void;
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

export class MapViewer extends Phaser.Scene {
  private params!: MapViewerData;
  private animated: AnimatedCell[] = [];
  private tileProps = new Map<string, Record<string, Record<string, unknown>>>();
  private layers: Phaser.Tilemaps.TilemapLayer[] = [];
  private dragFrom: Phaser.Math.Vector2 | null = null;

  constructor() {
    super("MapViewer");
  }

  init(data: MapViewerData) {
    this.params = data;
    this.animated = [];
    this.tileProps.clear();
    this.layers = [];
  }

  preload() {
    const { map } = this.params;
    this.load.tilemapTiledJSON(map, contentUrl(map, "tmj"));
    this.load.once(`filecomplete-tilemapJSON-${map}`, () => {
      const json = this.cache.tilemap.get(map).data as { tilesets: { image: string }[] };
      for (const ts of json.tilesets) {
        const key = seasonalTexture(this.params.manifest, ts.image, this.params.season);
        if (!this.textures.exists(key)) this.load.image(key, contentUrl(key, "png"));
      }
    });
  }

  create() {
    const { map: key, manifest, season } = this.params;
    const map = this.make.tilemap({ key });
    const tilesets = map.tilesets.map((ts) => {
      const image = (this.cache.tilemap.get(key).data.tilesets as { name: string; image: string }[]).find((t) => t.name === ts.name)!.image;
      return map.addTilesetImage(ts.name, seasonalTexture(manifest, image, season))!;
    });

    const names = map.layers.map((l) => l.name);
    drawOrder(names).forEach((name, depth) => {
      if (HIDDEN_LAYERS.has(name)) return;
      const layer = map.createLayer(name, tilesets, 0, 0);
      if (!layer) return;
      layer.setDepth(depth);
      this.layers.push(layer);
      const props = (map.getLayer(name)?.properties ?? []) as TiledProp[];
      const get = (n: string) => props.find((p) => p.name === n)?.value as string | undefined;
      this.tileProps.set(name, JSON.parse(get("tileProperties") ?? "{}"));
      for (const [cell, anim] of Object.entries(JSON.parse(get("animations") ?? "{}") as Record<string, Animation>)) {
        const [x, y] = cell.split(",").map(Number);
        this.animated.push({ layer, x, y, anim, shown: 0 });
      }
    });

    const cam = this.cameras.main;
    cam.setZoom(PIXEL_ZOOM);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
    cam.setBackgroundColor("#000");

    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.5, 8));
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => (this.dragFrom = new Phaser.Math.Vector2(p.x, p.y)));
    this.input.on("pointerup", () => (this.dragFrom = null));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.dragFrom && p.isDown) {
        cam.scrollX -= (p.x - this.dragFrom.x) / cam.zoom;
        cam.scrollY -= (p.y - this.dragFrom.y) / cam.zoom;
        this.dragFrom.set(p.x, p.y);
      }
      this.describe(map, p);
    });
  }

  private describe(map: Phaser.Tilemaps.Tilemap, p: Phaser.Input.Pointer) {
    const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const tx = Math.floor(world.x / map.tileWidth), ty = Math.floor(world.y / map.tileHeight);
    const lines = [`${this.params.map}  tile ${tx},${ty}`];
    for (const layer of this.layers) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile) continue;
      const own = this.tileProps.get(layer.layer.name)?.[`${tx},${ty}`];
      const sheet = { ...(tile.properties as Record<string, unknown>) };
      lines.push(`${layer.layer.name}: ${tile.tileset?.name}#${tile.index - (tile.tileset?.firstgid ?? 0)}`);
      for (const [k, v] of Object.entries({ ...sheet, ...own })) lines.push(`  ${k} = ${v}`);
    }
    this.params.onHover(lines.join("\n"));
  }

  update(time: number) {
    const cam = this.cameras.main;
    const keys = this.input.keyboard?.createCursorKeys();
    const speed = 8 / cam.zoom;
    if (keys?.left.isDown) cam.scrollX -= speed;
    if (keys?.right.isDown) cam.scrollX += speed;
    if (keys?.up.isDown) cam.scrollY -= speed;
    if (keys?.down.isDown) cam.scrollY += speed;

    for (const cell of this.animated) {
      const frame = Math.floor(time / cell.anim.interval) % cell.anim.frames.length;
      if (frame === cell.shown) continue;
      cell.shown = frame;
      cell.layer.putTileAt(cell.anim.frames[frame], cell.x, cell.y, false);
    }
  }
}
