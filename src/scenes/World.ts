import Phaser from "phaser";
import { contentUrl, type Manifest, type Season } from "../content.ts";
import { queueTilemap, RenderedMap } from "../render/tilemap.ts";
import { FarmerAnimator } from "../world/farmer-animation.ts";
import { Location, TILE } from "../world/location.ts";
import { DotNetRandom } from "../world/dotnet-random.ts";
import { locationEntities, type GameState, type StateStore } from "../world/state.ts";
import { buildWaterGrid, WATER_TEXTURE, waterColor, waterPieces, WaterState, type WaterGrid } from "../world/water.ts";
import { DEPTH } from "../render/tilemap.ts";
import { FarmerSprite, farmerTextureKeys } from "../render/farmer.ts";
import { DEFAULT_APPEARANCE, type ClothingData } from "../world/farmer-appearance.ts";
import { formatTime, GameClock, isTimeToTurnOffLighting, lighting, nextDay, SEASON_ORDER, weatherIcon, type LightingContext } from "../world/clock.ts";
import { dayTileGlows, locationLights, stepLightFade, tileChanges, type LightSource } from "../world/lights.ts";
import { LightingOverlay } from "../render/lighting.ts";
import { DIALOGUE_FONT, Hud, type HudStrings } from "../render/hud.ts";
import { QuestionBox } from "../render/question.ts";
import type { SpriteFontData } from "../render/spritefont.ts";
import {
  bedSleepTile,
  bedBox,
  bedTileOffset,
  drawOps,
  generateLocationObjects,
  solidRects,
  wakeUpPosition,
  stepTreeAlpha,
  treeFadeRect,
  treeTexture,
  type DrawOp,
  type Entity,
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
const SHADOW_TEXTURE = "LooseSprites/shadow";
const FARMER_TABLES = "generated/farmer";
const MAX_TICKS_PER_FRAME = 8;
const TICK_REAL_MS = 1000 / TICKS_PER_SECOND;
const FONT_DATA = "Fonts/SpriteFont1.spritefont";
const FARMHOUSE = "FarmHouse";
const STARTER_BED = { x: 9, y: 8, itemId: "2048" };

export type LocationsData = Record<string, { CreateOnLoad?: { MapPath?: string | null } | null }>;

export interface WorldStart {
  location: string;
  x?: number;
  y?: number;
  facing?: Facing;
  wakeUp?: boolean;
}

export interface WorldText extends HudStrings {
  sleepQuestion: string;
  yes: string;
  no: string;
  late: string;
}

export interface WorldData {
  manifest: Manifest;
  season: Season;
  locations: LocationsData;
  start: WorldStart;
  terrain: TerrainData;
  clothing: ClothingData;
  state: GameState;
  store: StateStore;
  clock: GameClock;
  text: WorldText;
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
  private farmer!: FarmerSprite;
  private shadow!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private featureYOffset: number[] = [];
  private featureXOffset: number[] = [];
  private accumulator = 0;
  private message = "";
  private warping = false;
  private running = true;
  private fadingTrees: { rect: Rect; alpha: number; images: Phaser.GameObjects.Image[] }[] = [];
  private water: { grid: WaterGrid; state: WaterState; tint: number; alpha: number; pool: Phaser.GameObjects.Image[] } | null = null;
  private ticks = 0;
  private lightSources: LightSource[] = [];
  private overlay: LightingOverlay | null = null;
  private hud: Hud | null = null;
  private question: QuestionBox | null = null;
  private bed: Extract<Entity, { kind: "bed" }> | null = null;
  private bedOffset = 1;
  private hasMoved = false;
  private lastTile = { x: -1, y: -1 };
  private endingDay = false;

  constructor() {
    super("World");
  }

  private get appearance() {
    return this.params.state.appearance ?? DEFAULT_APPEARANCE;
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
    this.lightSources = [];
    this.bed = null;
    this.bedOffset = 1;
    this.hasMoved = false;
    this.lastTile = { x: -1, y: -1 };
    this.endingDay = false;
  }

  private get outdoors() {
    return String(this.location.props.Outdoors ?? "").toUpperCase().startsWith("T");
  }

  private get lightingContext(): LightingContext {
    return { season: this.params.state.season, outdoors: this.outdoors, raining: false };
  }

  preload() {
    if (!this.params.manifest.maps.includes(this.mapPath)) return;
    queueTilemap(this, this.mapPath, this.params.manifest, this.params.season);
    for (const key of Object.values(farmerTextureKeys(this.appearance))) {
      if (!this.textures.exists(key)) this.load.image(key, contentUrl(key, "png"));
    }
    if (!this.textures.exists(SHADOW_TEXTURE)) this.load.image(SHADOW_TEXTURE, contentUrl(SHADOW_TEXTURE, "png"));
    if (!this.cache.json.exists(FARMER_TABLES)) this.load.json(FARMER_TABLES, contentUrl(FARMER_TABLES, "json"));
    if (!this.cache.json.exists(FONT_DATA)) this.load.json(FONT_DATA, contentUrl(FONT_DATA, "json"));
    const textures = new Set([
      "LooseSprites/Cursors",
      "LooseSprites/Cursors_1_6",
      "Maps/springobjects",
      "TileSheets/bushes",
      "TerrainFeatures/grass",
      "TileSheets/furniture",
      DIALOGUE_FONT,
      ...LightingOverlay.textureKeys(),
    ]);
    for (const info of Object.values(this.params.terrain.wildTrees)) {
      const t = treeTexture(info, this.params.season);
      if (t) textures.add(t);
    }
    const { manifest } = this.params;
    for (const t of textures) {
      if (!this.textures.exists(t) && (t in manifest.textures || manifest.fonts.includes(t))) this.load.image(t, contentUrl(t, "png"));
    }
  }

  private spawnTerrain() {
    const { state, store } = this.params;
    const { entities, created } = locationEntities(state, this.location.name, () =>
      generateLocationObjects(this.location, state.season, new DotNetRandom(Math.floor(Math.random() * 2147483647))),
    );
    let changed = created;
    if (this.location.name === FARMHOUSE && !entities.some((e) => e.kind === "bed")) {
      entities.push({ kind: "bed", ...STARTER_BED });
      changed = true;
    }
    if (changed) store.save(state);
    this.bed = (entities.find((e) => e.kind === "bed") as Extract<Entity, { kind: "bed" }> | undefined) ?? null;
    this.location.setSolids(entities.flatMap((e) => solidRects(e, this.params.terrain)));
    const grass: GrassContext = {
      uniqueId: state.uniqueId,
      daysPlayed: state.daysPlayed,
      outdoors: this.outdoors,
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

  private applyTiles(property: string) {
    const changes = tileChanges(this.location.props[property]);
    for (const c of changes) {
      const gid = this.location.setTileIndex(c.layer, c.x, c.y, c.index);
      if (gid !== null) this.rendered.setTile(c.layer, c.x, c.y, gid);
    }
    return changes;
  }

  private setupLights() {
    const { time } = this.params.clock;
    const turnOff = isTimeToTurnOffLighting(time, this.lightingContext);
    let glows: { x: number; y: number }[] = [];
    if (!this.outdoors && !turnOff) glows = dayTileGlows(this.applyTiles("DayTiles"));
    if (turnOff) {
      this.applyTiles("NightTiles");
      if (this.location.name === "MineShaft" || this.location.name === "Woods") glows = dayTileGlows(tileChanges(this.location.props.DayTiles));
      else glows = [];
    }
    this.lightSources = locationLights(this.location.name, this.location.props, glows, { turnOff, raining: false });
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
    this.featureXOffset = this.cache.json.get(FARMER_TABLES)?.featureXOffsetPerFrame ?? [];
    this.spawnTerrain();
    this.setupWater();
    this.setupLights();

    const spawn = this.spawnTile(start);
    const pos = positionForTile(spawn.x, spawn.y);
    this.body = { x: pos.x, y: pos.y, facing: start.facing ?? Facing.Down };
    if (start.wakeUp && this.bed) {
      const wake = wakeUpPosition(this.bed, (x, y) => !collides(this.location, x * TILE, y * TILE + 16));
      this.body = { x: wake.x, y: wake.y, facing: wake.facing === "right" ? Facing.Right : Facing.Left };
    }
    this.lastTile = centerTile(this.body);
    this.params.onEnter?.(start.location, spawn);

    this.shadow = this.add.image(0, 0, SHADOW_TEXTURE);
    this.farmer = new FarmerSprite(this, this.appearance, this.params.clothing, this.featureXOffset, this.featureYOffset);

    const cam = this.cameras.main;
    cam.setZoom(1).setBackgroundColor("#000").setRoundPixels(true);
    this.placeSprites();
    this.updateCamera();

    const fontData = this.cache.json.get(FONT_DATA) as SpriteFontData | undefined;
    this.overlay = new LightingOverlay(this);
    this.hud = fontData ? new Hud(this, fontData, this.params.text) : null;
    this.question = fontData ? new QuestionBox(this, fontData) : null;

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,X,E") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-X", () => this.interact());
    kb.on("keydown-E", () => this.interact());
    kb.on("keydown-ENTER", () => this.question?.confirm());
    kb.on("keydown-SPACE", () => this.question?.confirm());
    kb.on("keydown-ESC", () => this.question?.cancel());
    for (const k of ["UP", "W"]) kb.on(`keydown-${k}`, () => this.question?.move(-1));
    for (const k of ["DOWN", "S"]) kb.on(`keydown-${k}`, () => this.question?.move(1));
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.question?.open) {
        const i = this.question.optionAt(p.x, p.y);
        if (i >= 0) this.question.confirm(i);
        return;
      }
      if (p.rightButtonDown()) this.interact();
    });
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
    if (this.question?.open) {
      this.question.confirm();
      return;
    }
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

  private get timePasses() {
    return !this.question?.open && !this.endingDay && !this.warping;
  }

  private onClockEvents(events: ReturnType<GameClock["tick"]>) {
    for (const e of events) {
      if (e.kind === "nightTiles") {
        this.applyTiles("NightTiles");
      } else if (e.kind === "late" && e.time === 2400) this.message = this.params.text.late;
      else if (e.kind === "passOut") this.endDay();
    }
  }

  private checkTouchActions() {
    const tile = centerTile(this.body);
    if (tile.x === this.lastTile.x && tile.y === this.lastTile.y) return;
    this.lastTile = tile;
    if (!this.bed) return;
    const sleep = bedSleepTile(this.bed, this.bedOffset);
    if (tile.x !== sleep.x || tile.y !== sleep.y || !this.hasMoved || !this.timePasses || !this.question) return;
    this.question.ask(this.params.text.sleepQuestion, [this.params.text.yes, this.params.text.no]).then((answer) => {
      if (answer === 0) this.endDay();
    });
  }

  private endDay() {
    if (this.endingDay) return;
    this.endingDay = true;
    const { state, store, clock } = this.params;
    this.cameras.main.fadeOut(1000, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      Object.assign(state, nextDay(state));
      clock.time = 600;
      clock.interval = 0;
      clock.shakeMs = 0;
      store.save(state);
      this.scene.restart({ ...this.params, season: state.season, start: { location: FARMHOUSE, wakeUp: true } });
    });
  }

  private simulate() {
    const pressed = this.pressed();
    if (!this.timePasses) pressed.clear();
    const before = { x: this.body.x, y: this.body.y };
    this.running = !this.keys.SHIFT.isDown;
    const result = step(this.location, this.body, pressed, this.running, TICK_MS);
    this.animator.tick(this.body.facing, pressed.size > 0, this.running, pressed.size, TICK_MS);
    this.updateTreeFade();
    this.ticks++;
    this.water?.state.tick(TICK_MS, (this.ticks * 1000) / TICKS_PER_SECOND);
    if (this.body.x !== before.x || this.body.y !== before.y) this.hasMoved = true;
    if (this.bed) this.bedOffset = bedTileOffset(this.bedOffset, bedBox(this.bed, this.params.terrain), farmerBox(this.body.x, this.body.y), this.body.x);
    this.onClockEvents(this.params.clock.tick(TICK_MS, this.lightingContext, this.timePasses));
    if (result.warp) this.warpTo(result.warp.target, result.warp.toX, result.warp.toY);
    else this.checkTouchActions();
  }

  private drawLightingAndHud(time: number) {
    const { clock, state } = this.params;
    const ctx = this.lightingContext;
    const turnOff = isTimeToTurnOffLighting(clock.time, ctx);
    this.lightSources = this.lightSources.filter((l) => stepLightFade(l, { turnOff, raining: false }) || l.fadeOut < 0);
    this.overlay?.draw(lighting(clock.time, clock.interval, ctx), this.lightSources, this.cameras.main);
    this.hud?.draw(
      {
        time: clock.time,
        interval: clock.interval,
        dayOfMonth: state.dayOfMonth,
        seasonIndex: SEASON_ORDER.indexOf(state.season),
        weatherIcon: weatherIcon({ season: state.season }),
        money: state.money,
        shaking: clock.shakeMs > 0,
        timePasses: this.timePasses,
        totalMs: time,
        random: (min, max) => min + Math.floor(Math.random() * (max - min)),
      },
      this.cameras.main.width,
    );
  }

  private placeSprites() {
    const f = this.animator.frame;
    const x = Math.floor(this.body.x);
    const y = Math.floor(this.body.y) - 96 + f.offsetY * PIXEL_SCALE;
    const shrink = this.running && this.animator.animationIndexInLoop > 1 ? Math.abs(this.featureYOffset[f.frame] ?? 0) * 0.5 : 0;
    this.shadow.setPosition(this.body.x + 32, this.body.y + 24).setScale(PIXEL_SCALE - shrink);
    const box = farmerBox(this.body.x, this.body.y);
    const drawLayer = (box.y + box.h / 2) / 10000;
    const layer = this.rendered.spriteDepth(drawLayer);
    this.shadow.setDepth(shadowAboveBuildings(this.location, this.body) ? this.rendered.spriteDepth(drawLayer - 1e-6) : this.rendered.belowBuildingsDepth);
    this.farmer.update(f, this.body.facing, x, y, layer);
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
    this.drawLightingAndHud(time);

    const c = centerTile(this.body);
    const f = facingTile(this.body);
    const action = this.location.action(f.x, f.y);
    this.params.onStatus(
      [
        `${this.location.name} (${this.mapPath})  tile ${c.x},${c.y}  pos ${this.body.x.toFixed(2)},${this.body.y.toFixed(2)}`,
        `${this.params.state.season} ${this.params.state.dayOfMonth}, año ${this.params.state.year} · ${formatTime(this.params.clock.time)}`,
        this.question?.open ? "Pregunta abierta [Enter = sí, Esc = no]" : "",
        action ? `Enfrente: ${action}  [X/E]` : "",
        this.message,
        "WASD/flechas = mover · Shift = caminar · X/E/clic derecho = interactuar",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}
