import Phaser from "phaser";
import { contentUrl, type Manifest, type Season } from "../content.ts";
import { queueTilemap, RenderedMap } from "../render/tilemap.ts";
import { FarmerAnimator } from "../world/farmer-animation.ts";
import { Location, TILE } from "../world/location.ts";
import { DotNetRandom } from "../world/dotnet-random.ts";
import { locationEntities, type GameState, type StateStore } from "../world/state.ts";
import { buildWaterGrid, WATER_TEXTURE, waterColor, waterPieces, WaterState, type WaterGrid } from "../world/water.ts";
import { DEPTH } from "../render/tilemap.ts";
import {
  drawOps,
  generateLocationObjects,
  solidRect,
  stepTreeAlpha,
  treeFadeRect,
  treeTexture,
  type DrawOp,
  type GrassContext,
  type TerrainData,
} from "../world/terrain.ts";
import type { Rect } from "../world/movement.ts";
import {
  centerTile,
  collides,
  Facing,
  facingTile,
  farmerBox,
  findOpenTile,
  positionForTile,
  shadowAboveBuildings,
  step,
  TICK_MS,
  TICKS_PER_SECOND,
  type Body,
} from "../world/movement.ts";

const PIXEL_SCALE = TILE / 16;
const FARMER_TEXTURE = "Characters/Farmer/farmer_base";
const SHADOW_TEXTURE = "LooseSprites/shadow";
const FARMER_TABLES = "generated/farmer";
const SHEET_COLUMNS = 18;
const ARM_OFFSET_COLUMNS = 6;
const MAX_TICKS_PER_FRAME = 8;
const TICK_REAL_MS = 1000 / TICKS_PER_SECOND;

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
  terrain: TerrainData;
  state: GameState;
  store: StateStore;
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

export function sheetFrame(gameFrame: number) {
  return Math.floor(gameFrame / 6) * SHEET_COLUMNS + (gameFrame % 6);
}

export function viewportScroll(center: number, viewport: number, mapSize: number) {
  if (mapSize < viewport) return Math.floor((mapSize - viewport) / 2);
  return Math.max(0, Math.min(Math.floor(center - viewport / 2), mapSize - viewport));
}

export class World extends Phaser.Scene {
  private params!: WorldData;
  private mapPath!: string;
  private rendered!: RenderedMap;
  private location!: Location;
  private body!: Body;
  private animator = new FarmerAnimator();
  private bodySprite!: Phaser.GameObjects.Image;
  private armsSprite!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private featureYOffset: number[] = [];
  private accumulator = 0;
  private message = "";
  private warping = false;
  private running = true;
  private fadingTrees: { rect: Rect; alpha: number; images: Phaser.GameObjects.Image[] }[] = [];
  private water: { grid: WaterGrid; state: WaterState; tint: number; alpha: number; pool: Phaser.GameObjects.Image[] } | null = null;
  private ticks = 0;

  constructor() {
    super("World");
  }

  init(data: WorldData) {
    this.params = data;
    this.mapPath = resolveMapPath(data.locations, data.start.location);
    this.warping = false;
    this.message = "";
    this.accumulator = 0;
    this.animator = new FarmerAnimator();
    this.fadingTrees = [];
    this.water = null;
    this.ticks = 0;
  }

  preload() {
    if (!this.params.manifest.maps.includes(this.mapPath)) return;
    queueTilemap(this, this.mapPath, this.params.manifest, this.params.season);
    if (!this.textures.exists(FARMER_TEXTURE)) {
      this.load.spritesheet(FARMER_TEXTURE, contentUrl(FARMER_TEXTURE, "png"), { frameWidth: 16, frameHeight: 32 });
    }
    if (!this.textures.exists(SHADOW_TEXTURE)) this.load.image(SHADOW_TEXTURE, contentUrl(SHADOW_TEXTURE, "png"));
    if (!this.cache.json.exists(FARMER_TABLES)) this.load.json(FARMER_TABLES, contentUrl(FARMER_TABLES, "json"));
    const textures = new Set(["LooseSprites/Cursors", "LooseSprites/Cursors_1_6", "Maps/springobjects", "TileSheets/bushes", "TerrainFeatures/grass"]);
    for (const info of Object.values(this.params.terrain.wildTrees)) {
      const t = treeTexture(info, this.params.season);
      if (t) textures.add(t);
    }
    for (const t of textures) if (!this.textures.exists(t) && t in this.params.manifest.textures) this.load.image(t, contentUrl(t, "png"));
  }

  private spawnTerrain() {
    const { state, store } = this.params;
    const { entities, created } = locationEntities(state, this.location.name, () =>
      generateLocationObjects(this.location, state.season, new DotNetRandom(Math.floor(Math.random() * 2147483647))),
    );
    if (created) store.save(state);
    this.location.setSolids(entities.map(solidRect).filter((r) => r !== null));
    const grass: GrassContext = {
      uniqueId: state.uniqueId,
      daysPlayed: state.daysPlayed,
      outdoors: String(this.location.props.Outdoors ?? "").toUpperCase().startsWith("T"),
      hasFrontTile: (x, y) => this.location.tile("Front", x, y) !== 0,
    };
    for (const e of entities) {
      const images = drawOps(e, this.params.terrain, this.params.season, grass)
        .map((op) => ({ op, image: this.addDrawOp(op) }))
        .filter((x) => x.op.fades && x.image)
        .map((x) => x.image!);
      const rect = e.kind === "tree" ? treeFadeRect(e) : null;
      if (rect && images.length) this.fadingTrees.push({ rect, alpha: 1, images });
    }
  }

  private setupWater() {
    const grid = buildWaterGrid(this.location);
    if (!grid) return;
    const color = waterColor(this.location.name, this.params.season);
    const tint = (color.rgb[0] << 16) | (color.rgb[1] << 8) | color.rgb[2];
    this.water = { grid, state: new WaterState(this.location.name === "Farm"), tint, alpha: color.alpha, pool: [] };
  }

  private drawWater() {
    const w = this.water;
    if (!w || !this.textures.exists(WATER_TEXTURE)) return;
    const cam = this.cameras.main;
    const x0 = Math.max(0, Math.floor(cam.scrollX / TILE) - 1), x1 = Math.min(w.grid.width - 1, Math.floor((cam.scrollX + cam.width) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.scrollY / TILE) - 1), y1 = Math.min(w.grid.height - 1, Math.floor((cam.scrollY + cam.height) / TILE) + 2);
    const tex = this.textures.get(WATER_TEXTURE);
    let used = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        for (const piece of waterPieces(w.grid, w.state, tx, ty)) {
          const frame = `water:${piece.sx},${piece.sy},${piece.sh}`;
          if (!tex.has(frame)) tex.add(frame, 0, piece.sx, piece.sy, piece.sw, piece.sh);
          let img = w.pool[used];
          if (!img) {
            img = this.add.image(0, 0, WATER_TEXTURE, frame).setOrigin(0, 0).setDepth(DEPTH.back + 0.5).setTint(w.tint).setAlpha(w.alpha);
            w.pool.push(img);
          }
          img.setFrame(frame).setPosition(piece.x, piece.y).setVisible(true);
          used++;
        }
      }
    }
    for (let i = used; i < w.pool.length; i++) w.pool[i].setVisible(false);
  }

  private updateTreeFade() {
    const b = farmerBox(this.body.x, this.body.y);
    for (const t of this.fadingTrees) {
      const inside = b.x < t.rect.x + t.rect.w && t.rect.x < b.x + b.w && b.y < t.rect.y + t.rect.h && t.rect.y < b.y + b.h;
      const next = stepTreeAlpha(t.alpha, inside);
      if (next === t.alpha) continue;
      t.alpha = next;
      for (const img of t.images) img.setAlpha(next);
    }
  }

  private addDrawOp(op: DrawOp) {
    if (!this.textures.exists(op.texture)) return null;
    const tex = this.textures.get(op.texture);
    const frame = `${op.sx},${op.sy},${op.sw},${op.sh}`;
    if (!tex.has(frame)) tex.add(frame, 0, op.sx, op.sy, op.sw, op.sh);
    return this.add.image(op.x, op.y, op.texture, frame).setOrigin(0, 0).setScale(PIXEL_SCALE).setFlipX(op.flip).setDepth(this.rendered.spriteDepth(op.depth));
  }

  create() {
    const { start } = this.params;
    if (!this.params.manifest.maps.includes(this.mapPath)) {
      this.params.onStatus(`No existe el mapa ${this.mapPath} para la location ${start.location}`);
      return;
    }
    this.rendered = new RenderedMap(this, this.mapPath, this.params.manifest, this.params.season, PIXEL_SCALE);
    this.location = new Location(start.location, this.rendered.data);
    this.featureYOffset = this.cache.json.get(FARMER_TABLES)?.featureYOffsetPerFrame ?? [];
    this.spawnTerrain();
    this.setupWater();

    const spawn = this.spawnTile(start);
    const pos = positionForTile(spawn.x, spawn.y);
    this.body = { x: pos.x, y: pos.y, facing: start.facing ?? Facing.Down };
    this.params.onEnter?.(start.location, spawn);

    this.shadow = this.add.image(0, 0, SHADOW_TEXTURE);
    this.bodySprite = this.add.image(0, 0, FARMER_TEXTURE, 0).setOrigin(0, 0).setScale(PIXEL_SCALE);
    this.armsSprite = this.add.image(0, 0, FARMER_TEXTURE, ARM_OFFSET_COLUMNS).setOrigin(0, 0).setScale(PIXEL_SCALE);

    const cam = this.cameras.main;
    cam.setZoom(1).setBackgroundColor("#000").setRoundPixels(true);
    this.placeSprites();
    this.updateCamera();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,X,E") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-X", () => this.interact());
    kb.on("keydown-E", () => this.interact());
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => p.rightButtonDown() && this.interact());
    cam.fadeIn(150, 0, 0, 0);
  }

  private spawnTile(start: WorldStart) {
    const fx = start.x ?? Math.floor(this.location.width / 2);
    const fy = start.y ?? Math.floor(this.location.height / 2);
    const p = positionForTile(fx, fy);
    if (start.x !== undefined && start.y !== undefined && !collides(this.location, p.x, p.y)) return { x: fx, y: fy };
    return findOpenTile(this.location, fx, fy) ?? { x: fx, y: fy };
  }

  private pressed() {
    const k = this.keys;
    const set = new Set<Facing>();
    if (k.UP.isDown || k.W.isDown) set.add(Facing.Up);
    if (k.DOWN.isDown || k.S.isDown) set.add(Facing.Down);
    if (k.RIGHT.isDown || k.D.isDown) set.add(Facing.Right);
    if (k.LEFT.isDown || k.A.isDown) set.add(Facing.Left);
    return set;
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

  private simulate() {
    const pressed = this.pressed();
    this.running = !this.keys.SHIFT.isDown;
    const result = step(this.location, this.body, pressed, this.running, TICK_MS);
    this.animator.tick(this.body.facing, pressed.size > 0, this.running, pressed.size, TICK_MS);
    this.updateTreeFade();
    this.ticks++;
    this.water?.state.tick(TICK_MS, (this.ticks * 1000) / TICKS_PER_SECOND);
    if (result.warp) this.warpTo(result.warp.target, result.warp.toX, result.warp.toY);
  }

  private placeSprites() {
    const f = this.animator.frame;
    const x = Math.floor(this.body.x);
    const y = Math.floor(this.body.y) - 96 + f.offsetY * PIXEL_SCALE;
    const frame = sheetFrame(f.frame);
    this.bodySprite.setFrame(frame).setPosition(x, y).setFlipX(f.flip);
    this.armsSprite.setFrame(frame + ARM_OFFSET_COLUMNS).setPosition(x, y).setFlipX(f.flip);
    const shrink = this.running && this.animator.animationIndexInLoop > 1 ? Math.abs(this.featureYOffset[f.frame] ?? 0) * 0.5 : 0;
    this.shadow.setPosition(this.body.x + 32, this.body.y + 24).setScale(PIXEL_SCALE - shrink);
    const box = farmerBox(this.body.x, this.body.y);
    const drawLayer = (box.y + box.h / 2) / 10000;
    const layer = this.rendered.spriteDepth(drawLayer);
    this.shadow.setDepth(shadowAboveBuildings(this.location, this.body) ? this.rendered.spriteDepth(drawLayer - 1e-6) : this.rendered.belowBuildingsDepth);
    this.bodySprite.setDepth(layer);
    this.armsSprite.setDepth(layer + 1e-7);
  }

  private updateCamera() {
    const cam = this.cameras.main;
    const box = farmerBox(this.body.x, this.body.y);
    cam.scrollX = viewportScroll(box.x + box.w / 2, cam.width, this.rendered.widthInPixels);
    cam.scrollY = viewportScroll(box.y + box.h / 2, cam.height, this.rendered.heightInPixels);
  }

  update(time: number, delta: number) {
    if (!this.location || !this.body) return;
    this.rendered.update(time);
    if (!this.warping) {
      this.accumulator += delta;
      let ticks = 0;
      while (this.accumulator >= TICK_REAL_MS && ticks < MAX_TICKS_PER_FRAME && !this.warping) {
        this.simulate();
        this.accumulator -= TICK_REAL_MS;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) this.accumulator = 0;
    }
    this.placeSprites();
    this.updateCamera();
    this.drawWater();

    const c = centerTile(this.body);
    const f = facingTile(this.body);
    const action = this.location.action(f.x, f.y);
    this.params.onStatus(
      [
        `${this.location.name} (${this.mapPath})  tile ${c.x},${c.y}  pos ${this.body.x.toFixed(2)},${this.body.y.toFixed(2)}`,
        action ? `Enfrente: ${action}  [X/E]` : "",
        this.message,
        "WASD/flechas = mover · Shift = caminar · X/E/clic derecho = interactuar",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}
