import Phaser from "phaser";
import type { Manifest, Season } from "../content.ts";
import { queueTilemap, RenderedMap } from "../render/tilemap.ts";
import { Location } from "../world/location.ts";

const PIXEL_ZOOM = 4;

export interface MapViewerData {
  manifest: Manifest;
  map: string;
  season: Season;
  onHover: (info: string) => void;
}

export class MapViewer extends Phaser.Scene {
  private params!: MapViewerData;
  private rendered!: RenderedMap;
  private location!: Location;
  private dragFrom: Phaser.Math.Vector2 | null = null;

  constructor() {
    super("MapViewer");
  }

  init(data: MapViewerData) {
    this.params = data;
  }

  preload() {
    queueTilemap(this, this.params.map, this.params.manifest, this.params.season);
  }

  create() {
    const { map, manifest, season } = this.params;
    this.rendered = new RenderedMap(this, map, manifest, season);
    this.location = new Location(map, this.rendered.data);

    const cam = this.cameras.main;
    cam.setZoom(PIXEL_ZOOM);
    cam.setBounds(0, 0, this.rendered.widthInPixels, this.rendered.heightInPixels);
    cam.centerOn(this.rendered.widthInPixels / 2, this.rendered.heightInPixels / 2);
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
      this.describe(p);
    });
  }

  private describe(p: Phaser.Input.Pointer) {
    const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const { tileWidth, tileHeight } = this.rendered.map;
    const tx = Math.floor(world.x / tileWidth), ty = Math.floor(world.y / tileHeight);
    const lines = [`${this.params.map}  tile ${tx},${ty}${this.location.blocksFarmer(tx, ty) ? "  [bloquea]" : ""}`];
    const warp = this.location.warpAt(tx, ty);
    if (warp) lines.push(`Warp → ${warp.target} ${warp.toX},${warp.toY}`);
    for (const layer of this.rendered.layers) {
      const tile = layer.getTileAt(tx, ty);
      if (!tile) continue;
      lines.push(`${layer.layer.name}: ${tile.tileset?.name}#${tile.index - (tile.tileset?.firstgid ?? 0)}`);
      for (const [k, v] of Object.entries(this.location.tileProps(layer.layer.name, tx, ty) ?? {})) lines.push(`  ${k} = ${v}`);
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
    this.rendered.update(time);
  }
}
