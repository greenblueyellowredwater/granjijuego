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
import { DIALOGUE_FONT, Hud, HUD_DEPTH, type HudStrings } from "../render/hud.ts";
import { QuestionBox } from "../render/question.ts";
import type { SpriteFontData } from "../render/spritefont.ts";
import { RAIN_TEXTURE, WeatherRenderer } from "../render/weather.ts";
import { MENU_TEXTURE, TINY_FONT, ToolbarRenderer, toolbarLayout } from "../render/toolbar.ts";
import { parseId, type ItemData } from "../world/items.ts";
import {
  SingleAnimation,
  swingAnimation,
  toolDrawTransform,
  toolKind,
  toolLayerOffset,
  toolLocation,
  toolSpriteIndex,
  toolStaminaCost,
  wateringAnimation,
  type FrameBehavior,
  type ToolKind,
} from "../world/tools.ts";
import { addItem, consumeOne } from "../world/items.ts";
import { afterHarvest, cropDrawMath, harvestQuality, isHarvestable, isInSeason, newCrop, type CropData } from "../world/crops.ts";
import { dayUpdateLocations } from "../world/day.ts";
import { debrisDrops, debrisKind, spawnDebris, stepDebris, toolBreaks, type ItemDebris } from "../world/debris.ts";
import { itemSprite } from "../world/items.ts";
import { FALL_DROPS, hitTree, TreeMotion, type TreeEntity } from "../world/trees.ts";
import type { NpcManager } from "../world/npcs.ts";
import { npcFrame } from "../world/npc-sim.ts";
import { buildingDoor, buildingDrawOps, buildingSolids, defaultFarmBuildings, nearShippingBin, sellPrice, type BuildingData, type BuildingEntity } from "../world/buildings.ts";
import { animationSprite, canTill, hoeDirtDrawOps, hoeDirtTexture, neighborMasks, tempSpriteFrame, type TempSprite } from "../world/farming.ts";
import { hasOwnWeather, updateWeatherForNewDay, weatherFlags, type WeatherData, type WeatherFlags } from "../world/weather.ts";
import { daySaveRandom, type GsqState } from "../world/gsq.ts";
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
const TINY_FONT_DATA = "Fonts/tinyFont.spritefont";
const WATERING_CAN_CAPACITY = 40;
const SLOT_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "ZERO", "MINUS", "PLUS"];
const FARMHOUSE = "FarmHouse";
const STARTER_BED = { x: 9, y: 8, itemId: "2048" };
const STARTER_GIFT_FLAG = "starterGiftPlaced";

function starterGiftPosition(props: Record<string, unknown>) {
  const raw = String(props.FarmHouseStarterSeedsPosition ?? "").trim().split(/\s+/).map(Number);
  return raw.length === 2 && raw.every(Number.isInteger) ? { x: raw[0], y: raw[1] } : { x: 3, y: 7 };
}

function starterGiftItems(props: Record<string, unknown>) {
  const raw = String(props.FarmHouseStarterGift ?? "").trim().split(/\s+/).filter(Boolean);
  const items: { id: string; stack: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) items.push({ id: raw[i].startsWith("(") ? raw[i] : `(O)${raw[i]}`, stack: Number(raw[i + 1]) || 1 });
  return items.length ? items : [{ id: "(O)472", stack: 15 }];
}

export type LocationsData = Record<string, { CreateOnLoad?: { MapPath?: string | null } | null }>;

export interface WorldStart {
  location: string;
  x?: number;
  y?: number;
  facing?: Facing;
  wakeUp?: boolean;
}

export interface WorldText extends HudStrings {
  greenhouseBroken: string;
  wrongSeason: string;
  inventoryFull: string;
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
  weather: WeatherData;
  greenRainDays: number[];
  items: ItemData;
  crops: Record<string, CropData>;
  buildings: Record<string, BuildingData>;
  npcs: NpcManager;
  setupNpcs: () => void;
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
  private entityImages = new Map<Entity, Phaser.GameObjects.Image[]>();
  private drops: { d: ItemDebris; img: Phaser.GameObjects.Image | null; shadow: Phaser.GameObjects.Image | null }[] = [];
  private fadingTrees: { rect: Rect; alpha: number; images: Phaser.GameObjects.Image[]; entity?: Entity }[] = [];
  private treeMotions = new Map<TreeEntity, TreeMotion>();
  private npcImages = new Map<string, { sprite: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }>();
  private staticSolids: Rect[] = [];
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
  private weatherFx: WeatherRenderer | null = null;
  private toolbar: ToolbarRenderer | null = null;
  private entities: Entity[] = [];
  private dirtPool: Phaser.GameObjects.Image[] = [];
  private dirtDirty = true;
  private tool: { anim: SingleAnimation; kind: ToolKind; initial: number; facing: Facing; texture: string; target: { x: number; y: number } } | null = null;
  private toolImage: Phaser.GameObjects.Image | null = null;
  private temps: TempSprite[] = [];
  private tempPool: Phaser.GameObjects.Image[] = [];

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
    this.entityImages = new Map();
    this.treeMotions = new Map();
    this.npcImages = new Map();
    this.staticSolids = [];
    this.drops = [];
    this.water = null;
    this.ticks = 0;
    this.lightSources = [];
    this.bed = null;
    this.bedOffset = 1;
    this.hasMoved = false;
    this.lastTile = { x: -1, y: -1 };
    this.endingDay = false;
    this.entities = [];
    this.dirtPool = [];
    this.dirtDirty = true;
    this.tool = null;
    this.toolImage = null;
    this.temps = [];
    this.tempPool = [];
  }

  private get outdoors() {
    return String(this.location.props.Outdoors ?? "").toUpperCase().startsWith("T");
  }

  private get weather(): WeatherFlags {
    const flags = weatherFlags(this.params.state.weather);
    return hasOwnWeather(this.location.name) ? flags : weatherFlags("Sun");
  }

  private get lightingContext(): LightingContext {
    return { season: this.params.state.season, outdoors: this.outdoors, raining: this.weather.raining };
  }

  private gsqState(): GsqState {
    const { state, greenRainDays } = this.params;
    return { season: state.season, dayOfMonth: state.dayOfMonth, year: state.year, daysPlayed: state.daysPlayed, uniqueId: state.uniqueId, greenRainDays };
  }

  preload() {
    if (!this.params.manifest.maps.includes(this.mapPath)) return;
    queueTilemap(this, this.mapPath, this.params.manifest, this.params.season);
    for (const key of Object.values(farmerTextureKeys(this.appearance))) {
      if (!this.textures.exists(key)) this.load.image(key, contentUrl(key, "png"));
    }
    if (!this.textures.exists(SHADOW_TEXTURE)) this.load.image(SHADOW_TEXTURE, contentUrl(SHADOW_TEXTURE, "png"));
    if (!this.cache.json.exists(FARMER_TABLES)) this.load.json(FARMER_TABLES, contentUrl(FARMER_TABLES, "json"));
    for (const f of [FONT_DATA, TINY_FONT_DATA]) if (!this.cache.json.exists(f)) this.load.json(f, contentUrl(f, "json"));
    const textures = new Set([
      "LooseSprites/Cursors",
      "LooseSprites/Cursors_1_6",
      "LooseSprites/Giftbox",
      "Buildings/houses",
      "Buildings/Greenhouse",
      "Buildings/Shipping Bin",
      "Buildings/Pet Bowl",
      "Buildings/Mailbox",
      "Maps/springobjects",
      "TileSheets/bushes",
      "TerrainFeatures/grass",
      "TileSheets/furniture",
      RAIN_TEXTURE,
      DIALOGUE_FONT,
      TINY_FONT,
      MENU_TEXTURE,
      "TileSheets/tools",
      "TileSheets/weapons",
      "TileSheets/animations",
      "TerrainFeatures/hoeDirt",
      "TerrainFeatures/hoeDirtDark",
      "TerrainFeatures/hoeDirtSnow",
      "TileSheets/crops",
      ...LightingOverlay.textureKeys(),
    ]);
    for (const info of Object.values(this.params.terrain.wildTrees)) {
      const t = treeTexture(info, this.params.season);
      if (t) textures.add(t);
    }
    const { manifest } = this.params;
    for (const n of this.params.npcs.npcs) textures.add(`Characters/${n.name}`);
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
    if (this.location.name === "Farm" && !entities.some((e) => e.kind === "building")) {
      entities.push(...defaultFarmBuildings(this.location.props));
      changed = true;
    }
    if (this.location.name === FARMHOUSE && !state.flags.includes(STARTER_GIFT_FLAG)) {
      const pos = starterGiftPosition(this.location.props);
      entities.push({ kind: "giftbox", x: pos.x, y: pos.y, items: starterGiftItems(this.location.props), index: 0 });
      state.flags.push(STARTER_GIFT_FLAG);
      changed = true;
    }
    if (changed) store.save(state);
    this.entities = entities;
    this.bed = (entities.find((e) => e.kind === "bed") as Extract<Entity, { kind: "bed" }> | undefined) ?? null;
    this.staticSolids = entities.flatMap((e) => this.solidsOf(e));
    this.location.setSolids(this.staticSolids);
    const grass: GrassContext = {
      uniqueId: state.uniqueId,
      daysPlayed: state.daysPlayed,
      outdoors: this.outdoors,
      hasFrontTile: (x, y) => this.location.tile("Front", x, y) !== 0,
    };
    for (const e of entities) {
      const ops = e.kind === "building" ? this.buildingOps(e) : drawOps(e, this.params.terrain, this.params.season, grass);
      const all = ops.map((op) => ({ op, image: this.addDrawOp(op) }));
      this.entityImages.set(e, all.map((x) => x.image).filter((i): i is Phaser.GameObjects.Image => i !== null));
      const images = all.filter((x) => x.op.fades && x.image).map((x) => x.image!);
      const rect = e.kind === "tree" ? treeFadeRect(e) : null;
      if (rect && images.length) this.fadingTrees.push({ rect, alpha: 1, images, entity: e });
    }
  }

  private removeEntity(e: Entity) {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
    for (const img of this.entityImages.get(e) ?? []) img.destroy();
    this.entityImages.delete(e);
    this.staticSolids = this.entities.flatMap((x) => this.solidsOf(x));
    this.location.setSolids(this.staticSolids);
  }

  private updateNpcs() {
    const { npcs, clock } = this.params;
    if (this.timePasses) npcs.tick(clock.time, TICK_MS);
    const here = npcs.in(this.location.name);
    this.location.setSolids([...this.staticSolids, ...here.map((n) => ({ x: n.x + 8, y: n.y + 16, w: 48, h: 32 }))]);
  }

  private drawNpcs() {
    const here = new Set(this.params.npcs.in(this.location.name));
    for (const [name, imgs] of this.npcImages) {
      if ([...here].some((n) => n.name === name)) continue;
      imgs.sprite.setVisible(false);
      imgs.shadow.setVisible(false);
    }
    for (const n of here) {
      const texture = `Characters/${n.name}`;
      if (!this.textures.exists(texture)) continue;
      const frame = npcFrame(n);
      const tex = this.textures.get(texture);
      const fname = `npc:${frame}`;
      if (!tex.has(fname)) tex.add(fname, 0, (frame % 4) * 16, Math.floor(frame / 4) * 32, 16, 32);
      let imgs = this.npcImages.get(n.name);
      if (!imgs) {
        imgs = {
          sprite: this.add.image(0, 0, texture, fname).setOrigin(0.5, 0.75).setScale(PIXEL_SCALE),
          shadow: this.add.image(0, 0, SHADOW_TEXTURE).setScale(PIXEL_SCALE),
        };
        this.npcImages.set(n.name, imgs);
      }
      const depth = this.rendered.spriteDepth((n.y + 32) / 10000);
      imgs.sprite.setTexture(texture, fname).setPosition(n.x + 32, n.y + 16).setDepth(depth).setVisible(true);
      imgs.shadow.setPosition(n.x + 32, n.y + 44).setDepth(depth - 1e-6).setVisible(true);
    }
  }

  private dropItems(ids: string[], tx: number, ty: number) {
    for (const id of ids) this.drops.push({ d: spawnDebris(`(O)${id}`, tx, ty), img: null, shadow: null });
  }

  private hitTreeAt(tx: number, ty: number, tool: string) {
    const tree = this.entities.find((e): e is TreeEntity => e.kind === "tree" && e.x === tx && e.y === ty);
    if (!tree) return false;
    const hit = hitTree(tree, tool);
    if (hit.result === "none") return false;
    const fromRight = this.body.x + 32 > tx * TILE + 32;
    const motion = this.treeMotions.get(tree) ?? new TreeMotion();
    this.treeMotions.set(tree, motion);
    if (hit.result === "shake") motion.shake(fromRight, tree.stage >= 5);
    if (hit.result === "fall") motion.fall(fromRight);
    if (hit.result === "destroyed") {
      this.treeMotions.delete(tree);
      this.removeEntity(tree);
      this.fadingTrees = this.fadingTrees.filter((f) => f.entity !== tree);
    }
    for (const d of hit.drops) this.dropItems(Array(d.count).fill(d.id), tx, ty);
    return true;
  }

  private canopyOf(tree: TreeEntity) {
    return (this.entityImages.get(tree) ?? []).find((img) => img.active && img.frame.width === 48);
  }

  private tickTrees() {
    for (const [tree, motion] of this.treeMotions) {
      const result = motion.tick(tree.stage >= 5);
      const canopy = this.canopyOf(tree);
      if (canopy) canopy.setOrigin(0.5, 1).setPosition(tree.x * TILE + 32, tree.y * TILE + 64).setRotation(motion.rotation);
      if (result === "fallen") {
        const images = this.entityImages.get(tree) ?? [];
        const keep = images.filter((img) => img.active && img.frame.width === 16);
        for (const img of images) if (!keep.includes(img)) img.destroy();
        this.entityImages.set(tree, keep);
        this.fadingTrees = this.fadingTrees.filter((f) => f.entity !== tree);
        for (const img of keep) img.setAlpha(1);
        const side = motion.shakeLeft ? -4 : 4;
        for (const d of FALL_DROPS) this.dropItems(Array(d.count).fill(d.id), tree.x + side, tree.y);
        this.treeMotions.delete(tree);
        this.staticSolids = this.entities.flatMap((x) => this.solidsOf(x));
      } else if (!motion.falling && motion.maxShake === 0 && motion.rotation === 0) this.treeMotions.delete(tree);
    }
  }

  private hitObjectAt(tx: number, ty: number, tool: string) {
    const obj = this.entities.find((e): e is Extract<Entity, { kind: "object" }> => e.kind === "object" && e.x === tx && e.y === ty);
    if (!obj) return false;
    const data = this.params.items.objects[obj.itemId] as { Name?: string; Category?: number } | undefined;
    const kind = debrisKind(data?.Name, data?.Category);
    if (!toolBreaks(kind, tool)) return false;
    this.removeEntity(obj);
    this.dropItems(debrisDrops(kind), tx, ty);
    if (kind !== "weeds") this.temps.push(animationSprite(12, tx * TILE, ty * TILE, 8, Math.random() < 0.5, 50));
    return true;
  }

  private updateDrops() {
    const b = farmerBox(this.body.x, this.body.y);
    const target = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    this.drops = this.drops.filter((p) => {
      if (!stepDebris(p.d, target)) return true;
      const rest = addItem(this.params.state.inventory, { id: p.d.id, stack: 1 });
      if (rest) return true;
      p.img?.destroy();
      p.shadow?.destroy();
      return false;
    });
  }

  private drawDrops() {
    for (const p of this.drops) {
      const sprite = itemSprite({ id: p.d.id, stack: 1 }, this.params.items);
      if (!sprite || !this.textures.exists(sprite.texture)) continue;
      const tex = this.textures.get(sprite.texture);
      const frame = `${sprite.sx},${sprite.sy},${sprite.sw},${sprite.sh}`;
      if (!tex.has(frame)) tex.add(frame, 0, sprite.sx, sprite.sy, sprite.sw, sprite.sh);
      p.img ??= this.add.image(0, 0, sprite.texture, frame).setScale(PIXEL_SCALE);
      p.shadow ??= this.add.image(0, 0, SHADOW_TEXTURE).setScale(3).setAlpha(0.5);
      p.img.setPosition(p.d.x, p.d.y - 16 - p.d.z).setDepth(this.rendered.spriteDepth((p.d.y + 32) / 10000));
      p.shadow.setPosition(p.d.x, p.d.y + 8).setDepth(this.rendered.spriteDepth(1e-6));
    }
  }

  private buildingOps(e: BuildingEntity) {
    const data = this.params.buildings[e.type];
    if (!data) return [];
    const texture = data.Texture.replace(/\\/g, "/");
    const size = this.params.manifest.textures[texture] ?? { width: 0, height: 0 };
    return buildingDrawOps(e, data, size, { houseLevel: 0, greenhouseUnlocked: this.params.state.flags.includes("ccPantry") });
  }

  private solidsOf(e: Entity) {
    if (e.kind === "building") {
      const data = this.params.buildings[e.type];
      return data ? buildingSolids(e, data) : [];
    }
    return solidRects(e, this.params.terrain);
  }

  private tryShip(tx?: number, ty?: number) {
    const state = this.params.state;
    const item = state.inventory[state.currentToolIndex];
    if (!item || parseId(item.id).type !== "O") return false;
    const data = this.params.items.objects[parseId(item.id).id];
    if (!data || (data.Price ?? 0) <= 0) return false;
    const c = centerTile(this.body);
    const bin = this.entities.find((e): e is BuildingEntity => e.kind === "building" && e.type === "Shipping Bin" && nearShippingBin(e, c.x, c.y));
    if (!bin) return false;
    if (tx !== undefined && ty !== undefined && !(ty === bin.y && tx >= bin.x && tx <= bin.x + 1)) return false;
    state.shipping.push(item);
    state.inventory[state.currentToolIndex] = null;
    return true;
  }

  private tryBuildingDoor(tx: number, ty: number) {
    for (const e of this.entities) {
      if (e.kind !== "building") continue;
      const data = this.params.buildings[e.type];
      const door = data && buildingDoor(e, data);
      if (!door || door.x !== tx || door.y !== ty) continue;
      if (e.type === "Farmhouse") this.warpTo(FARMHOUSE, 3, 11);
      else if (e.type === "Greenhouse" && !this.params.state.flags.includes("ccPantry")) this.message = this.params.text.greenhouseBroken;
      else if (data.IndoorMap) this.warpTo(data.IndoorMap, door.x, door.y);
      return true;
    }
    return false;
  }

  private dirtAt(x: number, y: number) {
    return this.entities.find((e): e is Extract<Entity, { kind: "hoeDirt" }> => e.kind === "hoeDirt" && e.x === x && e.y === y);
  }

  private occupied(x: number, y: number) {
    return this.entities.some((e) => {
      if (e.kind === "grass") return false;
      if (e.kind === "clump") return x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h;
      if (e.kind === "bush") return y === e.y && x >= e.x && x < e.x + [1, 2, 3, 1, 2][e.size];
      return e.x === x && e.y === y;
    });
  }

  private redrawDirt() {
    if (!this.dirtDirty) return;
    this.dirtDirty = false;
    const dirt = this.entities.filter((e): e is Extract<Entity, { kind: "hoeDirt" }> => e.kind === "hoeDirt");
    const index = new Map(dirt.map((d) => [`${d.x},${d.y}`, d]));
    const texture = hoeDirtTexture(this.location.name, this.params.state.season);
    let used = 0;
    for (const d of dirt) {
      for (const op of hoeDirtDrawOps(d, neighborMasks(d, (x, y) => index.get(`${x},${y}`)), texture)) {
        if (!this.textures.exists(op.texture)) continue;
        const tex = this.textures.get(op.texture);
        const frame = `${op.sx},${op.sy},${op.sw},${op.sh}`;
        if (!tex.has(frame)) tex.add(frame, 0, op.sx, op.sy, op.sw, op.sh);
        const img = this.dirtPool[used] ?? this.add.image(0, 0, op.texture, frame).setOrigin(0, 0).setScale(PIXEL_SCALE);
        this.dirtPool[used++] = img;
        img.setTexture(op.texture, frame).setOrigin(0, 0).setPosition(op.x, op.y).setFlipX(false).setDepth(this.rendered.spriteDepth(op.depth)).setVisible(true);
      }
      if (!d.crop) continue;
      const data = this.params.crops[d.crop.seed];
      const cropTexture = (data?.Texture ?? "TileSheets/crops").replace(/\\/g, "/");
      if (!this.textures.exists(cropTexture)) continue;
      const m = cropDrawMath(d.crop, d.x, d.y);
      const tex = this.textures.get(cropTexture);
      const frame = `${m.source.sx},${m.source.sy},${m.source.sw},${m.source.sh}`;
      if (!tex.has(frame)) tex.add(frame, 0, m.source.sx, m.source.sy, m.source.sw, m.source.sh);
      const img = this.dirtPool[used] ?? this.add.image(0, 0, cropTexture, frame).setScale(PIXEL_SCALE);
      this.dirtPool[used++] = img;
      img
        .setTexture(cropTexture, frame)
        .setOrigin(m.originX / 16, m.originY / 32)
        .setPosition(m.x, m.y)
        .setFlipX(d.crop.flip)
        .setDepth(this.rendered.spriteDepth(m.layer))
        .setVisible(true);
    }
    for (let i = used; i < this.dirtPool.length; i++) this.dirtPool[i].setVisible(false);
  }

  private currentTool() {
    const item = this.params.state.inventory[this.params.state.currentToolIndex];
    if (!item) return null;
    const { type, id } = parseId(item.id);
    if (type === "W" && id === "47") return { kind: "scythe" as ToolKind, initial: -1, texture: "TileSheets/weapons" };
    if (type !== "T") return null;
    const data = this.params.items.tools[id];
    if (!data) return null;
    return { kind: toolKind(data.ClassName), initial: data.SpriteIndex, texture: (data.Texture ?? "TileSheets/tools").replace(/\\/g, "/") };
  }

  private tryPlant(target?: { x: number; y: number }) {
    const state = this.params.state;
    const item = state.inventory[state.currentToolIndex];
    if (!item) return false;
    const { type, id } = parseId(item.id);
    const data = type === "O" ? this.params.crops[id] : undefined;
    if (!data) return false;
    const at = target ?? toolLocation(this.body.x, this.body.y, this.body.facing);
    const tx = Math.floor(at.x / TILE), ty = Math.floor(at.y / TILE);
    const b = farmerBox(this.body.x, this.body.y);
    const c = { x: Math.floor((b.x + b.w / 2) / TILE), y: Math.floor((b.y + b.h / 2) / TILE) };
    if (Math.abs(tx - c.x) > 1 || Math.abs(ty - c.y) > 1) return true;
    const dirt = this.dirtAt(tx, ty);
    if (!dirt || dirt.crop) return true;
    if (this.outdoors && !isInSeason(data, state.season)) {
      this.message = this.params.text.wrongSeason;
      return true;
    }
    dirt.crop = newCrop(id, data, Math.random() < 0.5);
    consumeOne(state.inventory, state.currentToolIndex);
    this.dirtDirty = true;
    return true;
  }

  private tryOpenGiftbox(tx: number, ty: number) {
    const box = this.entities.find((e): e is Extract<Entity, { kind: "giftbox" }> => e.kind === "giftbox" && e.x === tx && e.y === ty);
    if (!box) return false;
    const state = this.params.state;
    box.items = box.items.map((i) => addItem(state.inventory, i)).filter((i): i is NonNullable<typeof i> => i !== null);
    if (box.items.length > 0) {
      this.message = this.params.text.inventoryFull;
      return true;
    }
    this.entities.splice(this.entities.indexOf(box), 1);
    this.location.setSolids(this.entities.flatMap((e) => this.solidsOf(e)));
    this.scene.restart({ ...this.params, start: { location: this.location.name, x: centerTile(this.body).x, y: centerTile(this.body).y, facing: this.body.facing } });
    return true;
  }

  private tryHarvest(tx: number, ty: number) {
    const dirt = this.dirtAt(tx, ty);
    if (!dirt?.crop || !isHarvestable(dirt.crop)) return false;
    const { state } = this.params;
    const data = this.params.crops[dirt.crop.seed];
    const { quality, stack } = harvestQuality(tx, ty, state.daysPlayed, state.uniqueId, 0, 0, data);
    const rest = addItem(state.inventory, { id: `(O)${dirt.crop.harvest}`, stack, quality });
    if (rest) {
      this.message = this.params.text.inventoryFull;
      return true;
    }
    dirt.crop = afterHarvest(dirt.crop, data);
    if (!dirt.crop) {
      this.temps.push(animationSprite(17, tx * TILE, ty * TILE, 7, Math.random() < 0.5, 125));
      this.temps.push(animationSprite(14, tx * TILE, ty * TILE, 7, Math.random() < 0.5, 50));
    }
    this.dirtDirty = true;
    return true;
  }

  private useToolButton(target?: { x: number; y: number }) {
    if (this.tool || this.question?.open || this.endingDay || this.warping) return;
    if (target && this.tryShip(Math.floor(target.x / TILE), Math.floor(target.y / TILE))) return;
    if (this.tryPlant(target)) return;
    const t = this.currentTool();
    if (!t) return;
    const state = this.params.state;
    let facing = this.body.facing;
    if (target) {
      const b = farmerBox(this.body.x, this.body.y);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const dx = target.x - cx, dy = target.y - cy;
      if (Math.abs(dx) <= 96 && Math.abs(dy) <= 96) facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Facing.Right : Facing.Left) : dy > 0 ? Facing.Down : Facing.Up;
      else target = undefined;
    }
    this.body.facing = facing;
    const at = target ?? toolLocation(this.body.x, this.body.y, facing);
    if (t.kind === "wateringCan" && state.waterLeft <= 0 && !this.location.isWater(Math.floor(at.x / TILE), Math.floor(at.y / TILE))) return;
    const frames = t.kind === "wateringCan" ? wateringAnimation(facing) : swingAnimation(facing);
    this.tool = { kind: t.kind, initial: t.initial, facing, texture: t.texture, target: at, anim: null as unknown as SingleAnimation };
    this.tool.anim = new SingleAnimation(frames, (b) => this.onToolBehavior(b));
  }

  private onToolBehavior(b: FrameBehavior) {
    if (b !== "useTool" || !this.tool) return;
    const state = this.params.state;
    const tx = Math.floor(this.tool.target.x / TILE), ty = Math.floor(this.tool.target.y / TILE);
    if (this.tool.kind === "scythe") {
      this.hitObjectAt(tx, ty, "scythe");
      this.hitTreeAt(tx, ty, "scythe");
      const grass = this.entities.find((e) => e.kind === "grass" && e.x === tx && e.y === ty);
      if (grass) this.removeEntity(grass);
      return;
    }
    if (this.hitTreeAt(tx, ty, this.tool.kind) || this.hitObjectAt(tx, ty, this.tool.kind)) {
      state.stamina -= toolStaminaCost(1, 0);
      return;
    }
    if (this.tool.kind === "hoe") {
      state.stamina -= toolStaminaCost(1, 0);
      if (canTill(this.location, tx, ty, (x, y) => this.occupied(x, y))) {
        this.entities.push({ kind: "hoeDirt", x: tx, y: ty, watered: false });
        this.temps.push(animationSprite(12, tx * TILE, ty * TILE, 8, Math.random() < 0.5, 50));
        this.dirtDirty = true;
      }
    } else if (this.tool.kind === "wateringCan") {
      if (this.location.isWater(tx, ty)) {
        state.waterLeft = WATERING_CAN_CAPACITY;
        return;
      }
      if (state.waterLeft <= 0) return;
      state.stamina -= toolStaminaCost(1, 0);
      state.waterLeft--;
      const dirt = this.dirtAt(tx, ty);
      if (dirt && !dirt.watered) {
        dirt.watered = true;
        this.dirtDirty = true;
      }
    } else state.stamina -= toolStaminaCost(1, 0);
  }

  private tickTool() {
    const t = this.tool;
    if (!t) return;
    t.anim.tick(TICK_MS);
    if (t.anim.done) this.tool = null;
  }

  private drawTool() {
    const t = this.tool;
    const transform = t ? toolDrawTransform(t.kind, t.facing, t.anim.index) : null;
    if (!t || !transform || !this.textures.exists(t.texture)) {
      this.toolImage?.setVisible(false);
      return;
    }
    const index = toolSpriteIndex(t.initial, t.kind, t.facing, t.anim.index);
    const width = this.textures.get(t.texture).getSourceImage().width;
    const sx = ((index * 16) % width) + transform.sourceShift, sy = Math.floor((index * 16) / width) * 16;
    const tex = this.textures.get(t.texture);
    const frame = `${sx},${sy},16,32`;
    if (!tex.has(frame)) tex.add(frame, 0, sx, sy, 16, 32);
    this.toolImage ??= this.add.image(0, 0, t.texture, frame).setScale(PIXEL_SCALE);
    const box = farmerBox(this.body.x, this.body.y);
    const layer = (box.y + box.h / 2) / 10000 + toolLayerOffset(t.facing);
    this.toolImage
      .setTexture(t.texture, frame)
      .setOrigin(0, transform.originY / 32)
      .setPosition(Math.floor(this.body.x) + transform.x, Math.floor(this.body.y) + transform.y)
      .setRotation(transform.rotation)
      .setFlipX(transform.flip)
      .setDepth(this.rendered.spriteDepth(layer))
      .setVisible(true);
  }

  private drawTemps(ms: number) {
    let used = 0;
    this.temps = this.temps.filter((s) => {
      s.elapsed += ms;
      const f = tempSpriteFrame(s);
      if (!f || !this.textures.exists(s.texture)) return false;
      const tex = this.textures.get(s.texture);
      const frame = `${f.sx},${f.sy},${f.sw},${f.sh}`;
      if (!tex.has(frame)) tex.add(frame, 0, f.sx, f.sy, f.sw, f.sh);
      const img = this.tempPool[used] ?? this.add.image(0, 0, s.texture, frame).setOrigin(0, 0);
      this.tempPool[used++] = img;
      img.setTexture(s.texture, frame).setPosition(s.x, s.y).setFlipX(s.flipped).setDepth(this.rendered.spriteDepth(s.depth)).setVisible(true);
      return true;
    });
    for (let i = used; i < this.tempPool.length; i++) this.tempPool[i].setVisible(false);
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
    const raining = this.weather.raining;
    let glows: { x: number; y: number }[] = [];
    if (!this.outdoors && !turnOff) glows = dayTileGlows(this.applyTiles("DayTiles"));
    if (turnOff || (raining && this.location.name !== "SandyHouse")) {
      this.applyTiles("NightTiles");
      if (this.location.name === "MineShaft" || this.location.name === "Woods") glows = dayTileGlows(tileChanges(this.location.props.DayTiles));
      else glows = [];
    }
    this.lightSources = locationLights(this.location.name, this.location.props, glows, { turnOff, raining });
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
    return this.add.image(op.x, op.y, op.texture, frame).setOrigin(0, 0).setScale(op.scale ?? PIXEL_SCALE).setFlipX(op.flip).setDepth(this.rendered.spriteDepth(op.depth));
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
    this.params.npcs.provideLocation(this.location);

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
    this.weatherFx = new WeatherRenderer(this);
    this.toolbar = new ToolbarRenderer(this, HUD_DEPTH - 5, this.cache.json.get(TINY_FONT_DATA) as SpriteFontData | undefined);
    this.hud = fontData ? new Hud(this, fontData, this.params.text) : null;
    this.question = fontData ? new QuestionBox(this, fontData) : null;

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,X,E") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-C", () => this.useToolButton());
    kb.on("keydown-X", () => this.interact());
    kb.on("keydown-E", () => this.interact());
    kb.on("keydown-ENTER", () => this.question?.confirm());
    kb.on("keydown-SPACE", () => this.question?.confirm());
    kb.on("keydown-ESC", () => this.question?.cancel());
    SLOT_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.selectSlot(i)));
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => this.selectSlot((this.params.state.currentToolIndex + (dy > 0 ? 1 : -1) + 12) % 12));
    for (const k of ["UP", "W"]) kb.on(`keydown-${k}`, () => this.question?.move(-1));
    for (const k of ["DOWN", "S"]) kb.on(`keydown-${k}`, () => this.question?.move(1));
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.question?.open) {
        const i = this.question.optionAt(p.x, p.y);
        if (i >= 0) this.question.confirm(i);
        return;
      }
      const slot = this.toolbar?.slotAt(this.toolbarLayout(), p.x, p.y) ?? -1;
      if (slot >= 0) {
        this.selectSlot(slot);
        return;
      }
      if (p.rightButtonDown()) this.interact();
      else if (p.leftButtonDown()) this.useToolButton({ x: p.worldX, y: p.worldY });
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

  private selectSlot(index: number) {
    if (this.question?.open || this.endingDay) return;
    this.params.state.currentToolIndex = index;
  }

  private toolbarLayout() {
    const cam = this.cameras.main;
    return toolbarLayout(cam.width, cam.height, this.body.y - cam.scrollY, cam.height);
  }

  private interact() {
    if (!this.location || this.warping) return;
    if (this.question?.open) {
      this.question.confirm();
      return;
    }
    const t = facingTile(this.body);
    if (this.tryOpenGiftbox(t.x, t.y)) return;
    if (this.tryShip(t.x, t.y)) return;
    if (this.tryBuildingDoor(t.x, t.y)) return;
    if (this.tryHarvest(t.x, t.y)) return;
    const c = centerTile(this.body);
    if (this.tryHarvest(c.x, c.y)) return;
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
    this.cameras.main.fade(150, 0, 0, 0, true);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ ...this.params, start: { location: target, x, y, facing } });
    });
  }

  private get timePasses() {
    return !this.question?.open && !this.endingDay && !this.warping;
  }

  private get canMove() {
    return this.timePasses && !this.tool;
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
    if (this.endingDay || !this.sys.isActive()) return;
    this.endingDay = true;
    const { state, store, clock } = this.params;
    this.cameras.main.fade(1000, 0, 0, 0, true);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      for (const item of state.shipping) {
        const data = this.params.items.objects[parseId(item.id).id];
        state.money += sellPrice(data?.Price ?? 0, item.quality ?? 0) * item.stack;
      }
      state.shipping = [];
      Object.assign(state, nextDay(state));
      const gsq = this.gsqState();
      const random = daySaveRandom(gsq);
      const weather = updateWeatherForNewDay(gsq, state.weatherForTomorrow, this.params.weather, { state: gsq, random });
      state.weather = weather.today;
      state.weatherForTomorrow = weather.tomorrow;
      dayUpdateLocations(state, this.params.crops, weatherFlags(state.weather).raining);
      this.params.setupNpcs();
      state.stamina = state.maxStamina;
      clock.time = 600;
      clock.interval = 0;
      clock.shakeMs = 0;
      store.save(state);
      this.scene.restart({ ...this.params, season: state.season, start: { location: FARMHOUSE, wakeUp: true } });
    });
  }

  private simulate() {
    const pressed = this.pressed();
    if (!this.canMove) pressed.clear();
    this.tickTool();
    this.updateNpcs();
    this.updateDrops();
    this.tickTrees();
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
    this.weatherFx?.tick(TICK_MS, this.weather, this.outdoors, this.params.state.season, this.cameras.main);
    if (result.warp) this.warpTo(result.warp.target, result.warp.toX, result.warp.toY);
    else this.checkTouchActions();
  }

  private drawLightingAndHud(time: number) {
    const { clock, state } = this.params;
    const ctx = this.lightingContext;
    const turnOff = isTimeToTurnOffLighting(clock.time, ctx);
    const flags = this.weather;
    this.weatherFx?.draw(flags, this.outdoors, this.cameras.main, time);
    this.lightSources = this.lightSources.filter((l) => stepLightFade(l, { turnOff, raining: flags.raining }));
    this.overlay?.draw(lighting(clock.time, clock.interval, ctx), this.lightSources, this.cameras.main, this.outdoors && flags.raining);
    this.toolbar?.draw(this.toolbarLayout(), state.inventory, state.currentToolIndex, this.params.items);
    this.hud?.draw(
      {
        time: clock.time,
        interval: clock.interval,
        dayOfMonth: state.dayOfMonth,
        seasonIndex: SEASON_ORDER.indexOf(state.season),
        weatherIcon: weatherIcon({
          season: state.season,
          raining: flags.raining,
          snowing: flags.snowing,
          lightning: flags.lightning,
          debris: flags.debris,
          greenRain: flags.greenRain,
          festival: state.weather === "Festival",
          wedding: state.weather === "Wedding",
        }),
        money: state.money,
        stamina: state.stamina,
        maxStamina: state.maxStamina,
        shaking: clock.shakeMs > 0,
        timePasses: this.timePasses,
        totalMs: time,
        random: (min, max) => min + Math.floor(Math.random() * (max - min)),
      },
      this.cameras.main.width,
      this.cameras.main.height,
    );
  }

  private placeSprites() {
    const f = this.tool ? this.tool.anim.frame : this.animator.frame;
    const x = Math.floor(this.body.x);
    const y = Math.floor(this.body.y) - 96 + f.offsetY * PIXEL_SCALE;
    const shrink = !this.tool && this.running && this.animator.animationIndexInLoop > 1 ? Math.abs(this.featureYOffset[f.frame] ?? 0) * 0.5 : 0;
    this.shadow.setPosition(this.body.x + 32, this.body.y + 24).setScale(PIXEL_SCALE - shrink);
    const box = farmerBox(this.body.x, this.body.y);
    const drawLayer = (box.y + box.h / 2) / 10000;
    this.shadow.setDepth(shadowAboveBuildings(this.location, this.body) ? this.rendered.spriteDepth(drawLayer - 1e-6) : this.rendered.belowBuildingsDepth);
    this.farmer.update(f, this.body.facing, x, y, drawLayer, (ld) => this.rendered.spriteDepth(ld));
    this.drawTool();
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
      this.accumulator += Math.min(this.game.loop.rawDelta, 250);
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
    this.redrawDirt();
    this.drawDrops();
    this.drawNpcs();
    this.drawTemps(delta);
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
