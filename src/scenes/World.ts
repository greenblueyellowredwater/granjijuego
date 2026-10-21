import Phaser from "phaser";
import { contentUrl, type Manifest, type Season } from "../content.ts";
import { queueTilemap, RenderedMap } from "../render/tilemap.ts";
import { Location, TILE } from "../world/location.ts";
import { centerTile, collides, Facing, facingTile, findOpenTile, step, type Body, type MoveInput } from "../world/movement.ts";

const PIXEL_ZOOM = 4;
const SCALE = TILE / 16;
const FARMER_TEXTURE = "Characters/Farmer/farmer_base";
const SHEET_COLUMNS = 18;
const ARMS_OFFSET = 6;
const WALK_CYCLE = [0, 1, 0, 2];
const FRAME_MS = { run: 90, walk: 150 };
const ROW_FOR_FACING: Record<Facing, number> = { [Facing.Up]: 2, [Facing.Right]: 1, [Facing.Down]: 0, [Facing.Left]: 1 };

export type LocationsData = Record<string, { CreateOnLoad?: { MapPath?: string | null } | null }>;

export interface WorldStart {
  location: string;
  x?: number;
  y?: number;
  facing?: Facing;
}

export interface WorldData {
  manifest: Manifest;
  season: Season;
  locations: LocationsData;
  start: WorldStart;
  onStatus: (text: string) => void;
  onEnter?: (location: string, tile: { x: number; y: number }) => void;
}

export function resolveMapPath(locations: LocationsData, name: string) {
  const path = locations[name]?.CreateOnLoad?.MapPath;
  return (path ?? `Maps/${name}`).replace(/\\/g, "/");
}

type DoorWarp = { target: string; x: number; y: number };

export function parseActionWarp(action: string): DoorWarp | null {
  const [kind, x, y, target] = action.trim().split(/\s+/);
  if ((kind !== "Warp" && kind !== "LockedDoorWarp") || !target) return null;
  if (!Number.isInteger(+x) || !Number.isInteger(+y)) return null;
  return { target, x: +x, y: +y };
}

export class World extends Phaser.Scene {
  private params!: WorldData;
  private mapPath!: string;
  private rendered!: RenderedMap;
  private location!: Location;
  private body!: Body;
  private bodySprite!: Phaser.GameObjects.Sprite;
  private armsSprite!: Phaser.GameObjects.Sprite;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private arrivalTile: { x: number; y: number } | null = null;
  private animTime = 0;
  private message = "";
  private warping = false;

  constructor() {
    super("World");
  }

  init(data: WorldData) {
    this.params = data;
    this.mapPath = resolveMapPath(data.locations, data.start.location);
    this.warping = false;
    this.message = "";
  }

  preload() {
    if (!this.params.manifest.maps.includes(this.mapPath)) return;
    queueTilemap(this, this.mapPath, this.params.manifest, this.params.season);
    if (!this.textures.exists(FARMER_TEXTURE)) {
      this.load.spritesheet(FARMER_TEXTURE, contentUrl(FARMER_TEXTURE, "png"), { frameWidth: 16, frameHeight: 32 });
    }
  }

  create() {
    const { start } = this.params;
    if (!this.params.manifest.maps.includes(this.mapPath)) {
      this.params.onStatus(`No existe el mapa ${this.mapPath} para la location ${start.location}`);
      return;
    }
    this.rendered = new RenderedMap(this, this.mapPath, this.params.manifest, this.params.season);
    this.location = new Location(start.location, this.rendered.data);

    const spawn = this.spawnTile(start);
    this.body = { x: spawn.x * TILE, y: spawn.y * TILE, facing: start.facing ?? Facing.Down };
    this.arrivalTile = start.x !== undefined ? centerTile(this.body) : null;
    this.params.onEnter?.(start.location, spawn);

    this.bodySprite = this.add.sprite(0, 0, FARMER_TEXTURE, 0).setOrigin(0, 0).setDepth(this.rendered.characterDepth);
    this.armsSprite = this.add.sprite(0, 0, FARMER_TEXTURE, ARMS_OFFSET).setOrigin(0, 0).setDepth(this.rendered.characterDepth + 0.01);
    this.placeSprites(null);

    const cam = this.cameras.main;
    cam.setZoom(PIXEL_ZOOM).setBackgroundColor("#000").setRoundPixels(true);
    cam.setBounds(0, 0, this.rendered.widthInPixels, this.rendered.heightInPixels);
    cam.startFollow(this.bodySprite, true, 1, 1, -8, -24);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,X,E") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-X", () => this.interact());
    kb.on("keydown-E", () => this.interact());
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => p.rightButtonDown() && this.interact());
  }

  private spawnTile(start: WorldStart) {
    const fx = start.x ?? Math.floor(this.location.width / 2);
    const fy = start.y ?? Math.floor(this.location.height / 2);
    if (start.x !== undefined && start.y !== undefined && !collides(this.location, fx * TILE, fy * TILE)) return { x: fx, y: fy };
    return findOpenTile(this.location, fx, fy) ?? { x: fx, y: fy };
  }

  private readInput(): MoveInput {
    const k = this.keys;
    const dx = ((k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0)) as MoveInput["dx"];
    const dy = ((k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0)) as MoveInput["dy"];
    return { dx, dy, running: !k.SHIFT.isDown };
  }

  private interact() {
    if (!this.location || this.warping) return;
    const t = facingTile(this.body);
    const action = this.location.action(t.x, t.y);
    if (!action) return;
    const warp = parseActionWarp(action);
    if (warp) this.warpTo(warp.target, warp.x, warp.y);
    else this.message = `Acción todavía no implementada: ${action}`;
  }

  private warpTo(target: string, x: number, y: number) {
    if (this.warping) return;
    const mapPath = resolveMapPath(this.params.locations, target);
    if (!this.params.manifest.maps.includes(mapPath)) {
      this.message = `Warp a ${target}: no hay mapa ${mapPath}`;
      return;
    }
    this.warping = true;
    const facing = this.body.facing;
    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ ...this.params, start: { location: target, x, y, facing } });
    });
  }

  private placeSprites(frameMs: number | null) {
    const col = frameMs ? WALK_CYCLE[Math.floor(this.animTime / frameMs) % WALK_CYCLE.length] : 0;
    const frame = ROW_FOR_FACING[this.body.facing] * SHEET_COLUMNS + col;
    const px = this.body.x / SCALE, py = this.body.y / SCALE - 16;
    const flip = this.body.facing === Facing.Left;
    this.bodySprite.setFrame(frame).setPosition(px, py).setFlipX(flip);
    this.armsSprite.setFrame(frame + ARMS_OFFSET).setPosition(px, py).setFlipX(flip);
  }

  update(time: number, delta: number) {
    if (!this.location || !this.body) return;
    this.rendered.update(time);
    if (this.warping) return;

    const input = this.readInput();
    const moved = step(this.location, this.body, input, Math.min(delta, 50));
    if (moved) this.animTime += delta;
    else this.animTime = 0;
    this.placeSprites(moved ? (input.running ? FRAME_MS.run : FRAME_MS.walk) : null);

    const c = centerTile(this.body);
    if (this.arrivalTile && (c.x !== this.arrivalTile.x || c.y !== this.arrivalTile.y)) this.arrivalTile = null;
    const warp = this.location.warpAt(c.x, c.y);
    if (warp && !this.arrivalTile) this.warpTo(warp.target, warp.toX, warp.toY);

    const f = facingTile(this.body);
    const action = this.location.action(f.x, f.y);
    this.params.onStatus(
      [
        `${this.location.name} (${this.mapPath})  tile ${c.x},${c.y}`,
        action ? `Enfrente: ${action}  [X/E]` : "",
        this.message,
        "WASD/flechas = mover · Shift = caminar · X/E/clic derecho = interactuar",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}
