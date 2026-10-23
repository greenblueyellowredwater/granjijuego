import Phaser from "phaser";
import { contentUrl, type Manifest, type Season } from "../content.ts";
import { queueTilemap, RenderedMap } from "../render/tilemap.ts";
import { FarmerAnimator } from "../world/farmer-animation.ts";
import { Location, TILE } from "../world/location.ts";
import { DotNetRandom } from "../world/dotnet-random.ts";
import { earn, locationEntities, type GameState, type StateStore } from "../world/state.ts";
import { buildWaterGrid, WATER_TEXTURE, waterColor, waterPieces, WaterState, type WaterGrid } from "../world/water.ts";
import { DEPTH } from "../render/tilemap.ts";
import { FarmerSprite, farmerTextureKeys } from "../render/farmer.ts";
import { DEFAULT_APPEARANCE, pantsInfo, shirtInfo, type ClothingData } from "../world/farmer-appearance.ts";
import { GameMenu } from "../render/game-menu.ts";
import { LevelUpMenu } from "../render/levelup-menu.ts";
import { ShippingMenu } from "../render/shipping-menu.ts";
import { ChestMenu } from "../render/chest-menu.ts";
import { summarizeShipping } from "../world/shipping.ts";
import { BobberBarState, biteTime, bobberLanding, CASTING_TIMER_SPEED, chooseFish, distanceToLand, fishingExperience, fishSizeFactor, MAX_TIME_TO_NIBBLE, type SpawnFishData } from "../world/fishing.ts";
import { FishingRenderer } from "../render/fishing.ts";
import { createOutput, findRule, minutesElapsed, minutesUntilMorning, preserveNameKey, readyMinutes, type MachineData, type MachineState } from "../world/machines.ts";
import { extraInfoKeys, learnDefaultRecipes, professionChoices, recipesUnlockedAt } from "../world/levelup.ts";
import { sortSocialEntries, type SocialEntry } from "../render/social-page.ts";
import { canCraft, consumeIngredients, countIngredient, layoutRecipes, parseRecipe, type Recipe, type RecipeSlot } from "../world/crafting.ts";
import { ARCH_CATEGORY_COLOR, categoryColor, categoryNameKey, descriptionWidth, parseText, TOOL_CATEGORY_COLOR, type TooltipContent } from "../render/tooltip.ts";
import { formatTime, GameClock, isTimeToTurnOffLighting, lighting, nextDay, SEASON_ORDER, weatherIcon, type LightingContext } from "../world/clock.ts";
import { dayTileGlows, LightContext, locationLights, torchLight, stepLightFade, tileChanges, type LightSource } from "../world/lights.ts";
import { LightingOverlay } from "../render/lighting.ts";
import { numberSpriteQuads } from "../render/skills-page.ts";
import { createBat, createBug, createDuggy, createFly, createGrub, createRockCrab, createStoneGolem, hitWithPickaxe, createGreenSlime, damageMonsters, FARMER_INVINCIBLE_MS, farmerTakeDamage, healthBarLayout, monsterBox, parseMonsterData, standingPixel, SWORD_FRAMES, swordArea, swordFrameTimes, swordPose, updateMonster, type Monster } from "../world/monsters.ts";
import { type MonsterSpawn, checkStoneForItems, LADDER_DOWN, LADDER_UP, MINE_SHEET, mineLadderLights, mineLevelOf, mineLighting, mineLocationName, mineMapImage, mineMapNumber, outdoorStoneDestroyed, populateLevel, type MineMap, type MinerContext } from "../world/mines.ts";
import { DIALOGUE_FONT, Hud, HUD_DEPTH, type HudStrings } from "../render/hud.ts";
import { QuestionBox } from "../render/question.ts";
import { SpriteFont, type SpriteFontData } from "../render/spritefont.ts";
import { RAIN_TEXTURE, WeatherRenderer } from "../render/weather.ts";
import { MENU_TEXTURE, TINY_FONT, ToolbarRenderer, toolbarLayout } from "../render/toolbar.ts";
import { parseId, type Item, type ItemData } from "../world/items.ts";
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
  weaponAnimation,
} from "../world/tools.ts";
import { addItem, canStackWith, consumeOne, isPlaceableObject, maximumStack } from "../world/items.ts";

const MAX_ITEMS = 12;
import { afterHarvest, cropDrawMath, harvestQuality, isHarvestable, isInSeason, newCrop, applySpeedIncreases, type CropData } from "../world/crops.ts";
import { dayUpdateLocations } from "../world/day.ts";
import { debrisDrops, debrisKind, spawnDebris, stepDebris, toolBreaks, type ItemDebris } from "../world/debris.ts";
import { itemSprite } from "../world/items.ts";
import { FALL_DROPS, hitTree, TreeMotion, type TreeEntity } from "../world/trees.ts";
import type { CharacterData, NpcManager } from "../world/npcs.ts";
import { EMOTE_TEXTURE, emoteSourceRect, npcEmotePosition, startEmote, updateEmote } from "../world/emotes.ts";
import { canBeGivenAsGift, canReceiveGiftNow, changeFriendship, giftEmote, giftFriendshipChange, giftReaction, giftTaste, objectContextTags, recordGift, resetFriendshipsForNewDay, totalDays, type Friendship } from "../world/friendship.ts";
import { npcFrame, type NpcState } from "../world/npc-sim.ts";
import { DialogueBox } from "../render/dialogue-box.ts";
import { dailyDialogue, dialogueChunks, parseDialogue } from "../world/dialogue.ts";
import { SPRITE_TEXT_TEXTURE } from "../render/spritetext.ts";
import { ShopMenu } from "../render/shop-menu.ts";
import { objectBasePrice, shopStock, toolUpgrades, type ShopData, type ToolUpgradeInfo } from "../world/shops.ts";
import { buildingDoor, buildingDrawOps, buildingSolids, defaultFarmBuildings, nearShippingBin, sellPrice, type BuildingData, type BuildingEntity } from "../world/buildings.ts";
import { animationSprite, canApplyFertilizer, canTill, fertilizerQualityLevel, fertilizerSpeedBoost, hoeDirtDrawOps, hoeDirtTexture, neighborMasks, tempSpriteFrame, type TempSprite } from "../world/farming.ts";
import { hasOwnWeather, updateWeatherForNewDay, weatherFlags, type WeatherData, type WeatherFlags } from "../world/weather.ts";
import { COMBAT, FARMING, farmerTitleKey, FISHING, FORAGING, gainExperience, harvestExperience, levelForExperience, MINING } from "../world/skills.ts";
import { checkConditions, daySaveRandom, type GsqState } from "../world/gsq.ts";
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
  rectCollides,
  shadowAboveBuildings,
  step,
  TICK_MS,
  TICKS_PER_SECOND,
  type Body,
} from "../world/movement.ts";

const PIXEL_SCALE = TILE / 16;
const SHADOW_TEXTURE = "LooseSprites/shadow";
const CURSORS_TEXTURE = "LooseSprites/Cursors";
const MARLON_SWORD_EVENT = "event:100162";
const FARMER_TABLES = "generated/farmer";
const MAX_TICKS_PER_FRAME = 8;
const TICK_REAL_MS = 1000 / TICKS_PER_SECOND;
const FONT_DATA = "Fonts/SpriteFont1.spritefont";
const TINY_FONT_DATA = "Fonts/tinyFont.spritefont";
const SMALL_FONT_DATA = "Fonts/SmallFont.spritefont";
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
  dialogues: Record<string, Record<string, string>>;
  rainyDialogue: Record<string, string>;
  giftTastes: Record<string, string>;
  recipes: { crafting: Record<string, string>; cooking: Record<string, string> };
  characters: Record<string, CharacterData>;
  shops: Record<string, ShopData>;
  machines: Record<string, MachineData>;
  fish: Record<string, string>;
  monsters?: Record<string, string>;
  strings: Record<string, Record<string, string>>;
  onStatus: (text: string) => void;
  onEnter?: (location: string, tile: { x: number; y: number }) => void;
}

export function resolveMapPath(locations: LocationsData, name: string) {
  const level = mineLevelOf(name);
  if (level !== null) return `Maps/Mines/${mineMapNumber(level)}`;
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
  private npcImages = new Map<string, { sprite: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; emote: Phaser.GameObjects.Image }>();
  private staticSolids: Rect[] = [];
  private dialogueBox: DialogueBox | null = null;
  private shop: ShopMenu | null = null;
  private gameMenu: GameMenu | null = null;
  private levelUp: LevelUpMenu | null = null;
  private shipping: ShippingMenu | null = null;
  private chestMenu: ChestMenu | null = null;
  private menuFarmer: FarmerSprite | null = null;
  private smallFont: SpriteFont | null = null;
  private dialogueFont: SpriteFont | null = null;
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
  private tool: { anim: SingleAnimation; kind: ToolKind; initial: number; facing: Facing; texture: string; target: { x: number; y: number }; upgradeLevel: number } | null = null;
  private toolImage: Phaser.GameObjects.Image | null = null;
  private temps: TempSprite[] = [];
  private tempPool: Phaser.GameObjects.Image[] = [];
  private mine: { level: number; stonesLeft: number; ladderHasSpawned: boolean; enemies: number; lighting: [number, number, number, number]; start: { x: number; y: number } } | null = null;
  private shakes = new Map<Entity, number>();
  private monsters: Monster[] = [];
  private monsterImages = new Map<Monster, Phaser.GameObjects.Image[]>();
  private farmerInvincible = 0;
  private floaters: { n: number; x: number; y: number; color: number; scale: number; age: number; vy: number }[] = [];
  private floaterPool: Phaser.GameObjects.Image[] = [];
  private knockedOut = false;

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
    this.bubbleImages = [];
    this.fishing = null;
    this.fishingUi = null;
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
    this.mine = null;
    this.shakes = new Map();
    this.monsters = [];
    this.monsterImages = new Map();
    this.farmerInvincible = 0;
    this.floaters = [];
    this.floaterPool = [];
    this.knockedOut = false;
  }

  private get outdoors() {
    return String(this.location.props.Outdoors ?? "").toUpperCase().startsWith("T");
  }

  private get weather(): WeatherFlags {
    const flags = weatherFlags(this.params.state.weather);
    return hasOwnWeather(this.location.name) ? flags : weatherFlags("Sun");
  }

  private get lightingContext(): LightingContext {
    return { season: this.params.state.season, outdoors: this.outdoors, raining: this.weather.raining, ...(this.mine ? { fixedAmbient: this.mine.lighting } : {}) };
  }

  private gsqState(): GsqState {
    const { state, greenRainDays } = this.params;
    return { season: state.season, dayOfMonth: state.dayOfMonth, year: state.year, daysPlayed: state.daysPlayed, uniqueId: state.uniqueId, greenRainDays };
  }

  preload() {
    if (!this.params.manifest.maps.includes(this.mapPath)) return;
    queueTilemap(this, this.mapPath, this.params.manifest, this.params.season, this.tilesetOverrides());
    for (const key of Object.values(farmerTextureKeys(this.appearance))) {
      if (!this.textures.exists(key)) this.load.image(key, contentUrl(key, "png"));
    }
    if (!this.textures.exists(SHADOW_TEXTURE)) this.load.image(SHADOW_TEXTURE, contentUrl(SHADOW_TEXTURE, "png"));
    if (!this.cache.json.exists(FARMER_TABLES)) this.load.json(FARMER_TABLES, contentUrl(FARMER_TABLES, "json"));
    for (const f of [FONT_DATA, TINY_FONT_DATA, SMALL_FONT_DATA]) if (!this.cache.json.exists(f)) this.load.json(f, contentUrl(f, "json"));
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
    for (const n of this.params.npcs.npcs) {
      textures.add(`Characters/${n.name}`);
      textures.add(`Portraits/${n.name}`);
    }
    textures.add(SPRITE_TEXT_TEXTURE);
    textures.add(EMOTE_TEXTURE);
    if (mineLevelOf(this.params.start.location) !== null) for (const m of ["Green Slime", "Bug", "Rock Crab", "Duggy", "Grub", "Fly", "Bat", "Stone Golem"]) textures.add(`Characters/Monsters/${m}`);
    for (const t of ["LooseSprites/daybg", "LooseSprites/nightbg", "LooseSprites/Cursors_1_6", "Maps/MenuTiles", "Fonts/SmallFont", "LooseSprites/Cursors2", "TileSheets/BuffsIcons", "TileSheets/Craftables", "TileSheets/Objects_2", "Maps/springobjects", "TileSheets/tools", "TileSheets/weapons"]) textures.add(t);
    for (const t of textures) {
      if (!this.textures.exists(t) && (t in manifest.textures || manifest.fonts.includes(t))) this.load.image(t, contentUrl(t, "png"));
    }
  }

  private tilesetOverrides(): Record<string, string> {
    const level = mineLevelOf(this.params.start.location);
    if (level === null) return {};
    const { image } = mineMapImage(level, mineMapNumber(level));
    return image && image in this.params.manifest.textures ? { "Maps/Mines/mine": image } : {};
  }

  private minerContext(): MinerContext {
    const state = this.params.state;
    return {
      dailyLuck: 0,
      luckLevel: 0,
      miningLevel: levelForExperience(state.experience[MINING] ?? 0),
      reachedBottom: (state.timesReachedMineBottom ?? 0) > 0,
      professions: state.professions ?? [],
    };
  }

  private mineMap(): MineMap {
    const loc = this.location;
    return {
      width: loc.width,
      height: loc.height,
      backType: (x, y) => {
        const t = loc.tileProps("Back", x, y)?.Type;
        return typeof t === "string" ? t : undefined;
      },
      hasTile: (layer, x, y) => loc.tile(layer, x, y) !== 0,
      mineIndex: (layer, x, y) => loc.tileIndexOnSheet(layer, x, y, MINE_SHEET),
      diggable: (x, y) => "Diggable" in (loc.tileProps("Back", x, y) ?? {}),
    };
  }

  private spawnMine(level: number) {
    const state = this.params.state;
    const { dark } = mineMapImage(level, mineMapNumber(level));
    const level$ = populateLevel(this.mineMap(), level, dark, new DotNetRandom(Math.floor(Math.random() * 2147483647)), this.minerContext(), (id) => this.isStoneId(id));
    const light = mineLighting(level, dark, daySaveRandom(this.gsqState(), state.daysPlayed, level, 4 * level));
    this.mine = { level, stonesLeft: level$.stonesLeft, ladderHasSpawned: false, enemies: 0, lighting: light.color, start: level$.start };
    state.deepestMineLevel = Math.max(state.deepestMineLevel ?? 0, level);
    if (level === 120) state.timesReachedMineBottom = (state.timesReachedMineBottom ?? 0) + 1;
    this.entities = level$.entities;
    this.staticSolids = this.entities.flatMap((e) => this.solidsOf(e));
    this.location.setSolids(this.staticSolids);
    for (const e of this.entities) this.addEntitySprites(e);
    if (level$.ladder) this.createLadderDown(level$.ladder.x, level$.ladder.y);
    for (const spawn of level$.monsters) {
      const m = this.createMonster(spawn, level);
      if (m) this.monsters.push(m);
    }
  }

  private createMonster(spawn: MonsterSpawn, level: number) {
    const raw = this.params.monsters?.[spawn.name];
    if (!raw) return null;
    const stats = parseMonsterData(raw);
    const r = new DotNetRandom(Math.floor(Math.random() * 2147483647));
    const x = spawn.x * TILE, y = spawn.y * TILE;
    const factories: Record<string, () => Monster> = {
      "Green Slime": () => createGreenSlime(stats, x, y, level, r),
      Bug: () => createBug(stats, x, y, spawn.facing ?? 0, r),
      "Rock Crab": () => createRockCrab(stats, x, y, r),
      Duggy: () => createDuggy(stats, x, y, r),
      Grub: () => createGrub(stats, x, y, r),
      Fly: () => createFly(stats, x, y, r),
      Bat: () => createBat(stats, x, y, r),
      "Stone Golem": () => createStoneGolem(stats, x, y, level, r),
    };
    const m = factories[spawn.name]?.() ?? null;
    if (m && spawn.special) m.hasSpecialItem = true;
    return m;
  }

  private tickMonsters() {
    if (this.farmerInvincible > 0) this.farmerInvincible -= TICK_MS;
    if (!this.monsters.length) return;
    const farmer = farmerBox(this.body.x, this.body.y);
    const random = new DotNetRandom(Math.floor(Math.random() * 2147483647));
    const world = {
      collides: (r: { x: number; y: number; w: number; h: number }) => rectCollides(this.location, r),
      farmer,
      farmerPosition: { x: this.body.x, y: this.body.y },
      hitFarmer: (m: Monster) => this.hitFarmer(m),
      random,
      diggable: (tx: number, ty: number) => {
        const props = this.location.tileProps("Back", tx, ty);
        return !!props && !("NPCBarrier" in props) && ("Diggable" in props || this.location.tileIndexOnSheet("Back", tx, ty, MINE_SHEET) === 0);
      },
      digHole: (tx: number, ty: number) => {
        const gid = this.location.placeTile("Back", tx, ty, MINE_SHEET, 0);
        if (gid !== null) this.rendered.setTile("Back", tx, ty, gid);
      },
      spawn: (m: Monster) => this.monsters.push(m),
      createFly: (x: number, y: number) => {
        const raw = this.params.monsters?.["Fly"];
        return raw ? createFly(parseMonsterData(raw), x, y, random) : null;
      },
    };
    for (const m of this.monsters) updateMonster(m, world, TICK_MS);
    for (const m of this.monsters.filter((x) => x.health <= -500)) this.removeMonster(m);
  }

  private removeMonster(m: Monster) {
    this.monsters = this.monsters.filter((x) => x !== m);
    for (const img of this.monsterImages.get(m) ?? []) img.destroy();
    this.monsterImages.delete(m);
  }

  private toolHitsMonsters(kind: ToolKind, x: number, y: number) {
    if (kind !== "axe" && kind !== "pickaxe" && kind !== "hoe") return false;
    const area = { x: x - 32, y: y - 32, w: 64, h: 64 };
    const box = farmerBox(this.body.x, this.body.y);
    const r = new DotNetRandom(Math.floor(Math.random() * 2147483647));
    if (kind === "pickaxe") {
      const crab = this.monsters.find((m) => m.kind === "crab" && monsterBox(m).x < area.x + area.w && area.x < monsterBox(m).x + monsterBox(m).w && monsterBox(m).y < area.y + area.h && area.y < monsterBox(m).y + monsterBox(m).h);
      if (crab && hitWithPickaxe(crab, box, r)) return true;
    }
    const level = (this.tool?.upgradeLevel ?? 0) + 1;
    const hits = damageMonsters(this.monsters, area, { minDamage: level, maxDamage: level * 3, knockback: 1, precision: 0, critChance: 0, critMultiplier: 1, type: -1 }, { box, facing: this.body.facing, luckLevel: 0, professions: this.params.state.professions ?? [] }, r, false);
    for (const h of hits) {
      const b = monsterBox(h.monster);
      if (h.damage > 0) this.floaters.push({ n: h.damage, x: b.x + b.w / 2 + 16, y: b.y + b.h / 2, color: 0xff8200, scale: 1, age: 0, vy: -3 });
      if (h.killed) this.monsterKilled(h.monster);
    }
    return hits.length > 0;
  }

  private hitFarmer(m: Monster) {
    const state = this.params.state;
    if (this.farmerInvincible > 0 || this.warping || this.endingDay || this.knockedOut) return;
    const res = farmerTakeDamage(state.health, m.damage, new DotNetRandom(Math.floor(Math.random() * 2147483647)));
    state.health = res.health;
    this.farmerInvincible = FARMER_INVINCIBLE_MS;
    const b = farmerBox(this.body.x, this.body.y);
    this.floaters.push({ n: res.damage, x: b.x + b.w / 2 + 8, y: b.y + b.h / 2, color: 0xff0000, scale: 1, age: 0, vy: -3 });
    if (state.health <= 0) this.knockOut();
  }

  private knockOut() {
    if (this.knockedOut) return;
    this.knockedOut = true;
    const state = this.params.state;
    const target = this.mine ? { location: "Mine", x: 22, y: 9 } : { location: "Hospital", x: 20, y: 12 };
    this.cameras.main.fade(1000, 0, 0, 0, true);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      state.health = 10;
      this.params.store.save(state);
      this.scene.restart({ ...this.params, start: { location: target.location, x: target.x, y: target.y, facing: Facing.Down } });
    });
  }

  private weaponHit(frame: number) {
    const t = this.tool;
    if (!t) return;
    const state = this.params.state;
    const item = state.inventory[state.currentToolIndex];
    const data = item ? (this.params.items.weapons[parseId(item.id).id] as unknown as Record<string, number> | undefined) : undefined;
    if (!data) return;
    const box = farmerBox(this.body.x, this.body.y);
    const area = swordArea(t.facing, toolLocation(this.body.x, this.body.y, t.facing), box, frame);
    const hits = damageMonsters(
      this.monsters,
      area,
      { minDamage: data.MinDamage ?? 1, maxDamage: data.MaxDamage ?? 3, knockback: data.Knockback ?? 1, precision: data.Precision ?? 0, critChance: data.CritChance ?? 0.02, critMultiplier: data.CritMultiplier ?? 3, type: data.Type ?? 0 },
      { box, facing: t.facing, luckLevel: 0, professions: state.professions ?? [] },
      new DotNetRandom(Math.floor(Math.random() * 2147483647)),
    );
    for (const h of hits) {
      const b = monsterBox(h.monster);
      if (h.damage > 0) this.floaters.push({ n: h.damage, x: b.x + b.w / 2 + 16, y: b.y + b.h / 2, color: h.crit ? 0xffff00 : 0xff8200, scale: h.crit ? 1 + h.damage / 300 : 1, age: 0, vy: -3 });
      if (h.killed) this.monsterKilled(h.monster);
    }
    const tiles = new Map<string, { x: number; y: number }>();
    for (let px = area.x; px <= area.x + area.w; px += Math.min(64, area.w || 64)) {
      for (const py of [area.y, area.y + area.h]) tiles.set(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`, { x: Math.floor(px / TILE), y: Math.floor(py / TILE) });
    }
    for (let py = area.y; py <= area.y + area.h; py += Math.min(64, area.h || 64)) {
      for (const px of [area.x, area.x + area.w]) tiles.set(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`, { x: Math.floor(px / TILE), y: Math.floor(py / TILE) });
    }
    for (const tile of tiles.values()) {
      const grass = this.entities.find((e) => e.kind === "grass" && e.x === tile.x && e.y === tile.y);
      if (grass) this.removeEntity(grass);
      const obj = this.entities.find((e): e is Extract<Entity, { kind: "object" }> => e.kind === "object" && e.x === tile.x && e.y === tile.y);
      const odata = obj ? (this.params.items.objects[obj.itemId] as { Name?: string; Category?: number } | undefined) : undefined;
      if (obj && debrisKind(odata?.Name, odata?.Category) === "weeds") this.hitObjectAt(tile.x, tile.y, "scythe");
      if (t.kind === "scythe") this.hitTreeAt(tile.x, tile.y, "scythe");
    }
  }

  private monsterKilled(m: Monster) {
    const state = this.params.state;
    const s = standingPixel(m);
    const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
    this.dropItems(m.drops.filter((id) => !id.startsWith("-")), tx, ty);
    gainExperience(state, COMBAT, m.experience);
    this.temps.push(animationSprite(44, m.x, m.y - 16, 10, false, 70));
    this.removeMonster(m);
  }

  private drawMonsters(time: number) {
    for (const m of this.monsters) {
      const texture = `Characters/Monsters/${m.name}`;
      if (!this.textures.exists(texture)) continue;
      let imgs = this.monsterImages.get(m);
      if (!imgs) {
        imgs = [this.add.image(0, 0, SHADOW_TEXTURE), this.add.image(0, 0, texture), this.add.image(0, 0, texture), this.add.image(0, 0, texture)];
        this.monsterImages.set(m, imgs);
      }
      const [shadow, body, face, glow] = imgs;
      const tex = this.textures.get(texture);
      const frameOf = (sx: number, sy: number, sw: number, sh: number) => {
        const name = `${sx},${sy},${sw},${sh}`;
        if (!tex.has(name)) tex.add(name, 0, sx, sy, sw, sh);
        return name;
      };
      const standY = standingPixel(m).y;
      const glowAlpha = m.invincible > 0 ? 0.5 + 0.5 * Math.sin(time / 30) : 0;
      if (m.kind === "slime") {
        const f = m.frame;
        const bodyFrame = frameOf((f % 4) * 16, Math.floor(f / 4) * 24, 16, 24);
        body.setTexture(texture, bodyFrame).setOrigin(0.5, 16 / 24).setScale(4).setPosition(m.x + 32, m.y + 16 + m.yOffset).setTint((m.color[0] << 16) | (m.color[1] << 8) | m.color[2]).setDepth(this.rendered.spriteDepth(standY / 10000)).setVisible(true);
        const shrink = (f % 4) % 3 !== 0 ? 1 : 0;
        shadow.setOrigin(0.5, 0.5).setPosition(m.x + 32, m.y + 28 + m.yOffset + 8).setScale(3 + 1 - shrink + m.yOffset / 30).setDepth(this.rendered.spriteDepth((standY - 1) / 10000)).setVisible(true);
        const jump = m.readyToJump > 0 ? 4 - 4 * ((f % 4) % 3) : 4 * (-2 + Math.abs((f % 4) - 2));
        const fx = 32 + (m.readyToJump > 0 || m.focused ? 16 : 0), fy = 120 + (m.readyToJump < 0 && (m.focused || m.invincible > 0) ? 24 : 0);
        face.setTexture(texture, frameOf(fx, fy, 16, 24)).setOrigin(0.5, 16 / 24).setScale(4).setPosition(m.x + 32 + m.face.x * 4, m.y + 16 + jump + m.yOffset + m.face.y * 4).setAlpha(m.facing === 0 ? 0.5 : 1).setDepth(this.rendered.spriteDepth(standY / 10000 + 0.0001)).setVisible(true);
        glow.setTexture(texture, bodyFrame).setOrigin(0.5, 16 / 24).setScale(4).setPosition(m.x + 32, m.y + 16 + m.yOffset).setTintFill(0xff0000).setAlpha(glowAlpha).setDepth(this.rendered.spriteDepth(standY / 10000 + 0.001)).setVisible(glowAlpha > 0);
      } else if (m.kind !== "bug") {
        face.setVisible(false);
        if (m.invisible) {
          shadow.setVisible(false);
          body.setVisible(false);
          glow.setVisible(false);
          continue;
        }
        const f = m.frame;
        const bodyFrame = frameOf((f % 4) * 16, Math.floor(f / 4) * 24, 16, 24);
        const scale = 4 * Math.max(0.2, m.scale ?? 1);
        const shakeX = (m.shake ?? 0) > 0 ? Phaser.Math.Between(-1, 1) : 0;
        if (m.shake && m.shake > 0) m.shake -= this.game.loop.delta;
        let px = m.x + 32 + shakeX, py = m.y + 16, oy = 18 / 24, depth = standY / 10000, sx = m.x + 32, sy = m.y + 32;
        if (m.kind === "bat") {
          py = m.y + 32;
          oy = 16 / 24;
          depth = 0.92;
          sy = m.y + 64;
        } else if (m.kind === "fly") {
          py = m.y + 16 - 32;
          oy = 16 / 24;
          depth = (standY + 8) / 10000;
          sy = m.y + 16;
        }
        body.setTexture(texture, bodyFrame).setOrigin(0.5, oy).setScale(scale).setPosition(px, py).setRotation(m.kind === "fly" || m.kind === "grub" ? m.rotation ?? 0 : 0).clearTint().setDepth(this.rendered.spriteDepth(depth)).setVisible(true);
        const showShadow = !m.hideShadow || m.kind === "bat" || m.kind === "fly";
        shadow.setOrigin(0.5, 0.5).setPosition(sx, sy).setScale(4).setDepth(this.rendered.spriteDepth((standY - 1) / 10000)).setVisible(showShadow);
        glow.setTexture(texture, bodyFrame).setOrigin(0.5, oy).setScale(scale).setPosition(px, py).setRotation(body.rotation).setTintFill(0xff0000).setAlpha(glowAlpha).setDepth(this.rendered.spriteDepth(depth + 0.001)).setVisible(glowAlpha > 0);
      } else {
        const wob = Math.sin(((time % 1000) / 1000) * Math.PI * 2) * 10;
        const ox = m.facing % 2 === 0 ? wob : 0, oy = m.facing % 2 === 0 ? 0 : wob;
        const bodyFrame = frameOf((m.frame % 4) * 16, Math.floor(m.frame / 4) * 16, 16, 16);
        shadow.setOrigin(0.5, 0.5).setPosition(m.x + 32 + ox, m.y + 32).setScale(4).setDepth(this.rendered.spriteDepth(standY / 10000 - 1e-6)).setVisible(true);
        body.setTexture(texture, bodyFrame).setOrigin(0.5, 1).setScale(4).setPosition(m.x + 32 + ox, m.y + oy).setDepth(this.rendered.spriteDepth(standY / 10000)).setVisible(true);
        face.setVisible(false);
        glow.setTexture(texture, bodyFrame).setOrigin(0.5, 1).setScale(4).setPosition(m.x + 32 + ox, m.y + oy).setTintFill(0xff0000).setAlpha(glowAlpha).setDepth(this.rendered.spriteDepth(standY / 10000 + 0.001)).setVisible(glowAlpha > 0);
      }
    }
  }

  private drawFloaters(ms: number) {
    let used = 0;
    this.floaters = this.floaters.filter((f) => {
      f.age += ms;
      f.y += f.vy;
      f.vy = Math.min(f.vy + 0.2, 0);
      if (f.age > 1000) return false;
      if (!this.textures.exists(CURSORS_TEXTURE)) return true;
      const tex = this.textures.get(CURSORS_TEXTURE);
      for (const q of numberSpriteQuads(f.n, f.x, f.y, f.scale)) {
        const frame = `${q.sx},${q.sy},8,8`;
        if (!tex.has(frame)) tex.add(frame, 0, q.sx, q.sy, 8, 8);
        const img = this.floaterPool[used] ?? this.add.image(0, 0, CURSORS_TEXTURE, frame).setOrigin(0, 0);
        this.floaterPool[used++] = img;
        img.setTexture(CURSORS_TEXTURE, frame).setPosition(q.x, q.y).setScale(4 * f.scale).setTint(f.color).setAlpha(Math.min(1, (1000 - f.age) / 300)).setDepth(this.rendered.spriteDepth(0.99)).setVisible(true);
      }
      return true;
    });
    for (let i = used; i < this.floaterPool.length; i++) this.floaterPool[i].setVisible(false);
  }

  private isStoneId(id: string) {
    const data = this.params.items.objects[id] as { Name?: string; Category?: number } | undefined;
    return data?.Category === -999 && data?.Name === "Stone";
  }

  private createLadderDown(x: number, y: number) {
    if (!this.mine) return;
    const gid = this.location.placeTile("Buildings", x, y, MINE_SHEET, LADDER_DOWN);
    if (gid !== null) this.rendered.setTile("Buildings", x, y, gid);
    this.mine.ladderHasSpawned = true;
    const offsets = [[0, 0, 0], [-16, -16, 150], [32, 16, 300], [-32, 16, 450], [16, -16, 600]];
    for (const [dx, dy, delay] of offsets) this.temps.push({ ...animationSprite(5, x * TILE + dx, y * TILE + dy, 8, false, 80), elapsed: -delay, alpha: 0.5 });
  }

  private tryMineTile(x: number, y: number) {
    if (!this.mine) return false;
    const index = this.location.tileIndexOnSheet("Buildings", x, y, MINE_SHEET);
    if (index === LADDER_DOWN) {
      this.warpTo(mineLocationName(this.mine.level + 1), -1, -1);
      return true;
    }
    if (index !== LADDER_UP || !this.question) return false;
    const loc = this.params.strings["Strings\\Locations"] ?? {};
    void this.question.ask(" ", [loc["Mines_LeaveMine"] ?? "", loc["Mines_DoNothing"] ?? ""]).then((answer) => {
      if (answer === 0) this.warpTo("Mine", 23, 8, Facing.Up);
    });
    return true;
  }

  private spawnTerrain() {
    const { state, store } = this.params;
    if (this.location.name === "Mine" && !state.flags.includes(MARLON_SWORD_EVENT)) {
      state.flags.push(MARLON_SWORD_EVENT);
      addItem(state.inventory, { id: "(W)0", stack: 1 });
      store.save(state);
    }
    const level = mineLevelOf(this.location.name);
    if (level !== null) {
      this.spawnMine(level);
      return;
    }
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
    for (const e of entities) this.addEntitySprites(e);
  }

  private addEntitySprites(e: Entity) {
    const state = this.params.state;
    const grass: GrassContext = {
      uniqueId: state.uniqueId,
      daysPlayed: state.daysPlayed,
      outdoors: this.outdoors,
      hasFrontTile: (x, y) => this.location.tile("Front", x, y) !== 0,
    };
    const ops = e.kind === "building" ? this.buildingOps(e) : drawOps(e, this.params.terrain, this.params.season, grass);
    const all = ops.map((op) => ({ op, image: this.addDrawOp(op) }));
    this.entityImages.set(e, all.map((x) => x.image).filter((i): i is Phaser.GameObjects.Image => i !== null));
    const images = all.filter((x) => x.op.fades && x.image).map((x) => x.image!);
    const rect = e.kind === "tree" ? treeFadeRect(e) : null;
    if (rect && images.length) this.fadingTrees.push({ rect, alpha: 1, images, entity: e });
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
    if (this.timePasses) for (const n of npcs.npcs) if (n.emote) n.emote = updateEmote(n.emote, TICK_MS);
    const here = npcs.in(this.location.name);
    this.location.setSolids([...this.staticSolids, ...here.map((n) => ({ x: n.x + 8, y: n.y + 16, w: 48, h: 32 }))]);
  }

  private drawNpcs() {
    const here = new Set(this.params.npcs.in(this.location.name));
    for (const [name, imgs] of this.npcImages) {
      if ([...here].some((n) => n.name === name)) continue;
      imgs.sprite.setVisible(false);
      imgs.shadow.setVisible(false);
      imgs.emote.setVisible(false);
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
          emote: this.add.image(0, 0, SHADOW_TEXTURE).setOrigin(0, 0).setScale(PIXEL_SCALE).setVisible(false),
        };
        this.npcImages.set(n.name, imgs);
      }
      const depth = this.rendered.spriteDepth((n.y + 32) / 10000);
      imgs.sprite.setTexture(texture, fname).setPosition(n.x + 32, n.y + 16).setDepth(depth).setVisible(true);
      imgs.shadow.setPosition(n.x + 32, n.y + 44).setDepth(depth - 1e-6).setVisible(true);
      if (n.emote && this.textures.exists(EMOTE_TEXTURE)) {
        const r = emoteSourceRect(n.emote.frame, this.textures.get(EMOTE_TEXTURE).source[0].width);
        const ename = `emote:${n.emote.frame}`;
        const etex = this.textures.get(EMOTE_TEXTURE);
        if (!etex.has(ename)) etex.add(ename, 0, r.sx, r.sy, r.sw, r.sh);
        const data = this.params.characters[n.name];
        const p = npcEmotePosition(n.x, n.y, (data as { EmoteOffset?: { x: number; y: number } } | undefined)?.EmoteOffset, 16, 32, Number((data as { Gender?: unknown })?.Gender) === 1, Number((data as { Age?: unknown })?.Age) === 2);
        imgs.emote.setTexture(EMOTE_TEXTURE, ename).setPosition(p.x, p.y).setDepth(DEPTH.alwaysFront + 1 + (n.y + 32) / 1e7).setVisible(true);
      } else imgs.emote.setVisible(false);
    }
  }

  private dropItems(ids: string[], tx: number, ty: number) {
    for (const id of ids) this.drops.push({ d: spawnDebris(id.startsWith("(") ? id : `(O)${id}`, tx, ty), img: null, shadow: null });
  }

  private tryPlace(target?: { x: number; y: number }) {
    const state = this.params.state;
    const item = state.inventory[state.currentToolIndex];
    if (!item) return false;
    const { type, id } = parseId(item.id);
    const obj = type === "O" ? (this.params.items.objects[id] as { Category?: number; Type?: string; Edibility?: number; ContextTags?: string[] } | undefined) : undefined;
    if (type !== "BC" && !(obj && isPlaceableObject(obj))) return false;
    const at = target ?? toolLocation(this.body.x, this.body.y, this.body.facing);
    const tx = Math.floor(at.x / TILE), ty = Math.floor(at.y / TILE);
    const b = farmerBox(this.body.x, this.body.y);
    const c = { x: Math.floor((b.x + b.w / 2) / TILE), y: Math.floor((b.y + b.h / 2) / TILE) };
    if (Math.abs(tx - c.x) > 1 || Math.abs(ty - c.y) > 1) return true;
    if (obj?.Category === -19) {
      const dirt = this.dirtAt(tx, ty);
      if (dirt && canApplyFertilizer(dirt, item.id)) {
        dirt.fertilizer = item.id;
        const cropData = dirt.crop ? this.params.crops[dirt.crop.seed] : undefined;
        if (dirt.crop && cropData) applySpeedIncreases(dirt.crop, cropData, fertilizerSpeedBoost(item.id), state.professions.includes(5));
        consumeOne(state.inventory, state.currentToolIndex);
        this.dirtDirty = true;
      }
      return true;
    }
    if (this.occupied(tx, ty) || this.location.blocksFarmer(tx, ty) || this.location.isWater(tx, ty)) return true;
    const box = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
    if (b.x < box.x + box.w && box.x < b.x + b.w && b.y < box.y + box.h && box.y < b.y + b.h) return true;
    const entity: Entity = type === "BC" ? { kind: "bigCraftable", x: tx, y: ty, itemId: id } : { kind: "object", x: tx, y: ty, itemId: id, placed: true };
    this.entities.push(entity);
    this.addEntitySprites(entity);
    this.addObjectLights();
    consumeOne(state.inventory, state.currentToolIndex);
    this.staticSolids = this.entities.flatMap((x) => this.solidsOf(x));
    this.location.setSolids(this.staticSolids);
    this.params.store.save(state);
    return true;
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
    if (hit.result === "fall") {
      motion.fall(fromRight);
      gainExperience(this.params.state, FORAGING, 14);
    }
    if (hit.result === "destroyed") {
      gainExperience(this.params.state, FORAGING, 2);
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
    const placed = this.entities.find((e) => (e.kind === "bigCraftable" || (e.kind === "object" && e.placed)) && e.x === tx && e.y === ty) as Extract<Entity, { kind: "object" | "bigCraftable" }> | undefined;
    if (placed) {
      if (tool !== "pickaxe" && tool !== "axe") return false;
      this.removeEntity(placed);
      this.addObjectLights();
      this.dropItems([placed.kind === "bigCraftable" ? `(BC)${placed.itemId}` : `(O)${placed.itemId}`], tx, ty);
      this.params.store.save(this.params.state);
      return true;
    }
    const obj = this.entities.find((e): e is Extract<Entity, { kind: "object" }> => e.kind === "object" && e.x === tx && e.y === ty);
    if (!obj) return false;
    const data = this.params.items.objects[obj.itemId] as { Name?: string; Category?: number } | undefined;
    const kind = debrisKind(data?.Name, data?.Category);
    if (!toolBreaks(kind, tool)) return false;
    if (kind === "stone") return this.hitStone(obj, tx, ty);
    this.removeEntity(obj);
    if (kind === "twig") gainExperience(this.params.state, FORAGING, 1);
    this.dropItems(debrisDrops(kind), tx, ty);
    if (kind !== "weeds") this.temps.push(animationSprite(12, tx * TILE, ty * TILE, 8, Math.random() < 0.5, 50));
    return true;
  }

  private hitStone(obj: Extract<Entity, { kind: "object" }>, tx: number, ty: number) {
    const state = this.params.state;
    if ((obj.hp ?? 0) > 0) {
      obj.hp = (obj.hp ?? 0) - Math.max(1, (this.tool?.upgradeLevel ?? 0) + 1);
      this.shakes.set(obj, 200);
      if (obj.hp > 0) return true;
    }
    this.removeEntity(obj);
    this.shakes.delete(obj);
    this.temps.push({ ...animationSprite(46, tx * TILE, ty * TILE, 10, false, 80), vy: -0.6, ay: 0.002, alphaFade: 0.015 });
    const gsq = this.gsqState();
    const ctx = this.minerContext();
    const result = this.mine
      ? checkStoneForItems(obj.itemId, this.mine.level, daySaveRandom(gsq, tx * 1000, ty, this.mine.level), ctx, this.mine)
      : { ...outdoorStoneDestroyed(obj.itemId, tx, ty, ctx, state.daysPlayed, (a, b, c) => daySaveRandom(gsq, a, b, c)), ladder: false };
    for (const d of result.drops) this.dropItems(Array(d.count).fill(d.id), tx, ty);
    if (result.experience > 0) gainExperience(state, MINING, result.experience);
    if (result.ladder) this.createLadderDown(tx, ty);
    return true;
  }

  private tryPickUpSpawned(tx: number, ty: number) {
    const obj = this.entities.find((e): e is Extract<Entity, { kind: "object" }> => e.kind === "object" && !!e.spawned && e.x === tx && e.y === ty);
    if (!obj) return false;
    const state = this.params.state;
    const data = this.params.items.objects[obj.itemId] as { Category?: number; ContextTags?: string[] } | undefined;
    const forage = [-79, -81, -80, -75, -23].includes(data?.Category ?? 0) || !!data?.ContextTags?.includes("forage_item") || obj.itemId === "430";
    let quality = 0;
    if (forage) {
      const foraging = levelForExperience(state.experience[FORAGING] ?? 0);
      const r = daySaveRandom(this.gsqState(), tx, ty * 777, 0);
      if (state.professions?.includes(16)) quality = 4;
      else if (r.nextDouble() < foraging / 30) quality = 2;
      else if (r.nextDouble() < foraging / 15) quality = 1;
    }
    if (addItem(state.inventory, { id: `(O)${obj.itemId}`, stack: 1, ...(quality ? { quality } : {}) })) {
      this.message = this.params.text.inventoryFull;
      return true;
    }
    if (forage) gainExperience(state, FORAGING, 7);
    this.removeEntity(obj);
    return true;
  }

  private tickShakes(ms: number) {
    for (const [e, left] of this.shakes) {
      const rest = left - ms;
      for (const img of this.entityImages.get(e) ?? []) {
        if (img.getData("baseX") === undefined) img.setData("baseX", img.x);
        const base = img.getData("baseX") as number;
        img.x = rest > 0 ? base + Phaser.Math.Between(-1, 1) : base;
      }
      if (rest > 0) this.shakes.set(e, rest);
      else this.shakes.delete(e);
    }
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
    if (type === "W") {
      const w = this.params.items.weapons[id] as { Type?: number; Texture?: string | null; SpriteIndex: number; Speed?: number } | undefined;
      if (!w || w.Type === 1 || w.Type === 2) return null;
      return { kind: (id === "47" ? "scythe" : "weapon") as ToolKind, initial: w.SpriteIndex, texture: (w.Texture ?? "TileSheets/weapons").replace(/\\/g, "/"), upgradeLevel: 0, speed: w.Speed ?? 0 };
    }
    if (type !== "T") return null;
    const data = this.params.items.tools[id];
    if (!data) return null;
    return { kind: toolKind(data.ClassName), initial: data.SpriteIndex, texture: (data.Texture ?? "TileSheets/tools").replace(/\\/g, "/"), upgradeLevel: data.UpgradeLevel ?? 0 };
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
    applySpeedIncreases(dirt.crop, data, fertilizerSpeedBoost(dirt.fertilizer), state.professions.includes(5));
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

  private toolSkillLevel() {
    const kind = this.tool?.kind;
    const skill = kind === "axe" ? FORAGING : kind === "pickaxe" ? MINING : FARMING;
    return levelForExperience(this.params.state.experience[skill] ?? 0);
  }

  private tryHarvest(tx: number, ty: number) {
    const dirt = this.dirtAt(tx, ty);
    if (!dirt?.crop || !isHarvestable(dirt.crop)) return false;
    const { state } = this.params;
    const data = this.params.crops[dirt.crop.seed];
    const { quality, stack } = harvestQuality(tx, ty, state.daysPlayed, state.uniqueId, levelForExperience(state.experience[FARMING] ?? 0), fertilizerQualityLevel(dirt.fertilizer), data);
    const rest = addItem(state.inventory, { id: `(O)${dirt.crop.harvest}`, stack, quality });
    if (rest) {
      this.message = this.params.text.inventoryFull;
      return true;
    }
    gainExperience(state, FARMING, harvestExperience((this.params.items.objects[dirt.crop.harvest] as { Price?: number } | undefined)?.Price ?? 0));
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
    if (this.tryPlace(target)) return;
    const t = this.currentTool();
    if (!t) return;
    if (t.kind === "fishingRod") {
      this.fishingButton();
      return;
    }
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
    const sword = SWORD_FRAMES[facing];
    const frames =
      t.kind === "scythe" || t.kind === "weapon"
        ? weaponAnimation(facing, sword.frames, swordFrameTimes((t as { speed?: number }).speed ?? 0), sword.flip, sword.arm)
        : t.kind === "wateringCan"
          ? wateringAnimation(facing)
          : swingAnimation(facing);
    this.tool = { kind: t.kind, initial: t.initial, facing, texture: t.texture, target: at, upgradeLevel: t.upgradeLevel ?? 0, anim: null as unknown as SingleAnimation };
    this.tool.anim = new SingleAnimation(frames, (b) => this.onToolBehavior(b));
  }

  private onToolBehavior(b: FrameBehavior) {
    if (b === "swordSwipe" && this.tool) {
      this.weaponHit(this.tool.anim?.index ?? 0);
      return;
    }
    if (b !== "useTool" || !this.tool) return;
    const state = this.params.state;
    const tx = Math.floor(this.tool.target.x / TILE), ty = Math.floor(this.tool.target.y / TILE);
    this.toolHitsMonsters(this.tool.kind, this.tool.target.x, this.tool.target.y);
    if (this.tool.kind === "scythe") {
      this.hitObjectAt(tx, ty, "scythe");
      this.hitTreeAt(tx, ty, "scythe");
      const grass = this.entities.find((e) => e.kind === "grass" && e.x === tx && e.y === ty);
      if (grass) this.removeEntity(grass);
      return;
    }
    if (this.hitTreeAt(tx, ty, this.tool.kind) || this.hitObjectAt(tx, ty, this.tool.kind)) {
      state.stamina -= toolStaminaCost(1, this.toolSkillLevel());
      return;
    }
    if (this.tool.kind === "hoe") {
      state.stamina -= toolStaminaCost(1, this.toolSkillLevel());
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
      state.stamina -= toolStaminaCost(1, this.toolSkillLevel());
      state.waterLeft--;
      const dirt = this.dirtAt(tx, ty);
      if (dirt && !dirt.watered) {
        dirt.watered = true;
        this.dirtDirty = true;
      }
    } else state.stamina -= toolStaminaCost(1, this.toolSkillLevel());
  }

  private tickTool() {
    const t = this.tool;
    if (!t) return;
    t.anim.tick(TICK_MS);
    if (t.anim.done) this.tool = null;
  }

  private drawTool() {
    const t = this.tool;
    if (t && (t.kind === "scythe" || t.kind === "weapon")) {
      this.drawWeapon();
      return;
    }
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
      .setFlipY(false)
      .setDepth(this.rendered.spriteDepth(layer))
      .setVisible(true);
  }

  private drawWeapon() {
    const t = this.tool!;
    if (t.anim.index >= 6 || !this.textures.exists(t.texture)) {
      this.toolImage?.setVisible(false);
      return;
    }
    const tex = this.textures.get(t.texture);
    const width = tex.getSourceImage().width;
    const sx = (t.initial * 16) % width, sy = Math.floor((t.initial * 16) / width) * 16;
    const frame = `${sx},${sy},16,16`;
    if (!tex.has(frame)) tex.add(frame, 0, sx, sy, 16, 16);
    this.toolImage ??= this.add.image(0, 0, t.texture, frame).setScale(PIXEL_SCALE);
    const pose = swordPose(t.facing, t.anim.index);
    const box = farmerBox(this.body.x, this.body.y);
    const offset = pose.front ? (t.facing === 0 ? 1 : t.facing === 2 ? 15 : 20) : 1;
    this.toolImage
      .setTexture(t.texture, frame)
      .setOrigin(1 / 16, 15 / 16)
      .setScale(PIXEL_SCALE)
      .setPosition(Math.floor(this.body.x) + pose.x, Math.floor(this.body.y) + pose.y)
      .setRotation(pose.rotation)
      .setFlipX(pose.flipX)
      .setFlipY(pose.flipY)
      .setDepth(this.rendered.spriteDepth((box.y + box.h / 2) / 10000 + offset * 1e-6))
      .setVisible(true);
  }

  private drawTemps(ms: number) {
    let used = 0;
    this.temps = this.temps.filter((s) => {
      s.elapsed += ms;
      const ticks = ms / (1000 / 60);
      if (s.elapsed > 0 && s.vy !== undefined) {
        s.y += s.vy * ticks;
        s.vy += (s.ay ?? 0) * ticks;
      }
      if (s.elapsed > 0 && s.alphaFade) s.alpha = (s.alpha ?? 1) - s.alphaFade * ticks;
      const f = tempSpriteFrame(s);
      if (!f || !this.textures.exists(s.texture)) return false;
      if (f.sw === 0) return true;
      const tex = this.textures.get(s.texture);
      const frame = `${f.sx},${f.sy},${f.sw},${f.sh}`;
      if (!tex.has(frame)) tex.add(frame, 0, f.sx, f.sy, f.sw, f.sh);
      const img = this.tempPool[used] ?? this.add.image(0, 0, s.texture, frame).setOrigin(0, 0);
      this.tempPool[used++] = img;
      img.setTexture(s.texture, frame).setPosition(s.x, s.y).setFlipX(s.flipped).setAlpha(Math.max(0, s.alpha ?? 1)).setDepth(this.rendered.spriteDepth(s.depth)).setVisible(true);
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
    if (this.mine) for (const l of mineLadderLights(this.mine.level, this.mine.start)) this.lightSources.push({ ...l, texture: 4, color: [0, 20, 50, 255], context: LightContext.None, fadeOut: -1 });
    this.addObjectLights();
  }

  private addObjectLights() {
    this.lightSources = this.lightSources.filter((l) => !l.id.startsWith("torch_"));
    for (const e of this.entities) {
      if (e.kind !== "object" || !e.placed) continue;
      const tags = (this.params.items.objects[e.itemId] as { ContextTags?: string[] } | undefined)?.ContextTags ?? [];
      if (tags.includes("torch_item")) this.lightSources.push(torchLight(e.itemId, e.x, e.y));
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
    return this.add.image(op.x, op.y, op.texture, frame).setOrigin(0, 0).setScale(op.scale ?? PIXEL_SCALE).setFlipX(op.flip).setDepth(this.rendered.spriteDepth(op.depth));
  }

  create() {
    const { start } = this.params;
    if (!this.params.manifest.maps.includes(this.mapPath)) {
      this.params.onStatus(`No existe el mapa ${this.mapPath} para la location ${start.location}`);
      return;
    }
    this.rendered = new RenderedMap(this, this.mapPath, this.params.manifest, this.params.season, PIXEL_SCALE, this.tilesetOverrides());
    this.location = new Location(start.location, structuredClone(this.rendered.data));
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
    this.dialogueBox = new DialogueBox(this, HUD_DEPTH + 20);
    this.shop = new ShopMenu(this, HUD_DEPTH + 30);
    this.gameMenu = new GameMenu(this, HUD_DEPTH + 40, fontData, this.cache.json.get(TINY_FONT_DATA) as SpriteFontData | undefined, this.cache.json.get(SMALL_FONT_DATA) as SpriteFontData | undefined);
    this.smallFont = this.cache.json.exists(SMALL_FONT_DATA) ? new SpriteFont(this.cache.json.get(SMALL_FONT_DATA) as SpriteFontData) : null;
    this.dialogueFont = fontData ? new SpriteFont(fontData) : null;
    learnDefaultRecipes(this.params.state, this.params.recipes);
    this.shipping = new ShippingMenu(this, HUD_DEPTH + 55);
    this.chestMenu = new ChestMenu(this, HUD_DEPTH + 35);
    this.levelUp = new LevelUpMenu(this, HUD_DEPTH + 60, fontData, this.cache.json.get(SMALL_FONT_DATA) as SpriteFontData | undefined);
    this.menuFarmer = new FarmerSprite(this, this.appearance, this.params.clothing, this.featureXOffset, this.featureYOffset, true);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,X,E") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-C", () => {
      this.useHeld = true;
      this.useToolButton();
    });
    kb.on("keyup-C", () => {
      this.useHeld = false;
      this.fishingRelease();
    });
    this.input.on("pointerup", () => this.fishingRelease());
    kb.on("keydown-X", () => (this.shipping?.summary ? this.finishShipping() : this.levelUp?.current ? this.finishLevelUp() : this.interact()));
    kb.on("keydown-E", () => (this.chestMenu?.open ? this.closeChest() : this.toggleGameMenu()));
    kb.on("keydown-ENTER", () => (this.dialogueBox?.open ? this.dialogueBox.advance() : this.question?.confirm()));
    kb.on("keydown-SPACE", () => this.question?.confirm());
    kb.on("keydown-ESC", () => {
      if (this.shop?.open) this.shop.close();
      else if (this.chestMenu?.open) this.closeChest();
      else if (this.question?.open) this.question.cancel();
      else this.toggleGameMenu();
    });
    SLOT_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.selectSlot(i)));
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => this.gameMenu?.open ? this.gameMenu.social.scrollBy(dy > 0 ? 1 : -1, this.socialEntries().length) : this.shop?.open ? this.shop.scrollBy(dy > 0 ? 1 : -1) : this.selectSlot((this.params.state.currentToolIndex + (dy > 0 ? 1 : -1) + 12) % 12));
    for (const k of ["UP", "W"]) kb.on(`keydown-${k}`, () => this.question?.move(-1));
    for (const k of ["DOWN", "S"]) kb.on(`keydown-${k}`, () => this.question?.move(1));
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.shipping?.summary) {
        if (this.shipping.hitOk(this.cameras.main.width, this.cameras.main.height, p.x, p.y)) this.finishShipping();
        return;
      }
      if (this.levelUp?.current) {
        const hit = this.levelUp.hit(this.cameras.main.width, this.cameras.main.height, p.x, p.y);
        if (hit?.kind === "ok") this.finishLevelUp();
        else if (hit?.kind === "profession") this.finishLevelUp(hit.profession);
        return;
      }
      if (this.chestMenu?.open) {
        this.chestClick(p.x, p.y, p.rightButtonDown());
        return;
      }
      if (this.gameMenu?.open) {
        this.gameMenuClick(p.x, p.y);
        return;
      }
      if (this.shop?.open) {
        this.shopClick(p.x, p.y);
        return;
      }
      if (this.dialogueBox?.open) {
        this.dialogueBox.advance();
        return;
      }
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
    if (this.mine) return this.mine.start;
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

  private npcAt(tx: number, ty: number) {
    const tile = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
    return this.params.npcs.in(this.location.name).find((n) => {
      const b = { x: n.x + 8, y: n.y + 16, w: 48, h: 32 };
      return b.x < tile.x + tile.w && tile.x < b.x + b.w && b.y < tile.y + tile.h && tile.y < b.y + b.h;
    });
  }

  private talkTo(n: NpcState) {
    const { state, dialogues, rainyDialogue } = this.params;
    const lines = dialogues[n.name] ?? {};
    const f = (state.friendship[n.name] ??= { points: 0, talkedToday: false });
    const today = (this.params.npcs.dialogueToday[n.name] ??= (() => {
      const met = state.flags.includes(`met:${n.name}`);
      if (!met && lines.Introduction) {
        state.flags.push(`met:${n.name}`);
        return { chunks: dialogueChunks(lines.Introduction), index: 0 };
      }
      const home = this.params.npcs.homeOf(n.name);
      const pick = dailyDialogue(n.name, lines, rainyDialogue, {
        season: state.season,
        dayOfMonth: state.dayOfMonth,
        year: state.year,
        hearts: Math.trunc(f.points / 250),
        raining: weatherFlags(state.weather).raining,
        daysPlayed: state.daysPlayed,
        uniqueId: state.uniqueId,
        homePixel: { x: (home?.x ?? 0) * 64, y: (home?.y ?? 0) * 64 },
      });
      return { chunks: pick ? dialogueChunks(pick.text) : [], index: 0 };
    })());
    if (today.index >= today.chunks.length) return false;
    const pages = parseDialogue(today.chunks[today.index++], state.farmerName, this.appearance.isMale);
    if (!pages.length) return false;
    if (!f.talkedToday) {
      f.talkedToday = true;
      f.points += 20;
    }
    this.faceFarmer(n);
    this.dialogueBox?.show(n.name, pages);
    return true;
  }

  private openChestEntity: Extract<Entity, { kind: "bigCraftable" }> | null = null;

  private tryMachine(tx: number, ty: number) {
    const e = this.entities.find((x): x is Extract<Entity, { kind: "bigCraftable" }> => x.kind === "bigCraftable" && x.x === tx && x.y === ty);
    const data = e ? this.params.machines[`(BC)${e.itemId}`] : undefined;
    if (!e || !data) return false;
    const { state, items } = this.params;
    const m: MachineState = (e.machine ??= {});
    if (m.ready && m.held) {
      const target = state.inventory.slice(0, MAX_ITEMS).map((it) => (it ? { ...it } : null));
      if (addItem(target, m.held)) {
        this.message = this.params.text.inventoryFull;
        return true;
      }
      for (let i = 0; i < MAX_ITEMS; i++) state.inventory[i] = target[i];
      e.machine = {};
      this.refreshEntity(e);
      this.params.store.save(state);
      return true;
    }
    const input = state.inventory[state.currentToolIndex];
    if (!input || m.held || parseId(input.id).type !== "O") return false;
    const objects = items.objects as Parameters<typeof findRule>[2];
    const gsq = this.gsqState();
    const found = findRule(data, input, objects, (q) => checkConditions(q, { state: gsq, random: new DotNetRandom(Math.floor(Math.random() * 2147483647)) }));
    const cs = this.params.strings["Strings\\StringsFromCSFiles"] ?? {};
    if (!found.rule || !found.trigger) {
      if (found.countFail) this.message = this.localized(data.InvalidCountMessage ?? "").replace("{0}", String(found.countFail.trigger.RequiredCount ?? 1)) || cs["Object.cs.12777"] || "";
      return found.countFail !== null;
    }
    for (const extra of data.AdditionalConsumedItems ?? []) {
      const have = state.inventory.slice(0, MAX_ITEMS).reduce((n, it) => n + (it && it.id === extra.ItemId ? it.stack : 0), 0);
      if (have < extra.RequiredCount) {
        this.message = this.localized(extra.InvalidCountMessage ?? "").replace("{0}", String(extra.RequiredCount));
        return true;
      }
    }
    const output = (found.rule.OutputItem ?? []).find((o) => !o.Condition || checkConditions(o.Condition, { state: gsq, random: new DotNetRandom(1) }));
    const item = output ? createOutput(output, input, objects) : null;
    if (!item) return false;
    const count = found.trigger.RequiredCount ?? 1;
    input.stack -= count;
    if (input.stack <= 0) state.inventory[state.currentToolIndex] = null;
    for (const extra of data.AdditionalConsumedItems ?? []) {
      let left = extra.RequiredCount;
      for (let i = 0; i < MAX_ITEMS && left > 0; i++) {
        const it = state.inventory[i];
        if (!it || it.id !== extra.ItemId) continue;
        const take = Math.min(left, it.stack);
        it.stack -= take;
        left -= take;
        if (it.stack <= 0) state.inventory[i] = null;
      }
    }
    const minutes = readyMinutes(found.rule, this.params.clock.time);
    e.machine = { held: item, minutesLeft: minutes, ready: minutes <= 0, showNext: !!data.ShowNextIndexWhileWorking };
    this.refreshEntity(e);
    this.params.store.save(state);
    return true;
  }

  private tickMachines(minutes: number) {
    const { state, machines } = this.params;
    for (const [name, loc] of Object.entries(state.locations)) {
      for (const e of loc.entities) {
        if (e.kind !== "bigCraftable" || !e.machine?.held || e.machine.ready) continue;
        minutesElapsed(e.machine, minutes);
        if (e.machine.ready) {
          e.machine.showNext = !!machines[`(BC)${e.itemId}`]?.ShowNextIndexWhenReady;
          if (this.location && name === this.location.name) this.refreshEntity(e);
        }
      }
    }
  }

  private bubbleImages: Phaser.GameObjects.Image[] = [];
  private fishing: {
    phase: "charging" | "waiting" | "holding";
    power: number;
    speed: number;
    bobber: { x: number; y: number } | null;
    clearWater: number;
    biteIn: number;
    elapsed: number;
    nibbleLeft: number;
    nibbleScale: number;
    bar: BobberBarState | null;
    fish: { id: string; boss: boolean } | null;
    holdMs: number;
  } | null = null;
  private fishingUi: FishingRenderer | null = null;
  private useHeld = false;

  private fishingButton() {
    const state = this.params.state;
    const level = levelForExperience(state.experience[FISHING] ?? 0);
    if (!this.fishing) {
      this.fishing = { phase: "charging", power: 0, speed: CASTING_TIMER_SPEED, bobber: null, clearWater: 0, biteIn: -1, elapsed: 0, nibbleLeft: -1, nibbleScale: 5, bar: null, fish: null, holdMs: 0 };
      return;
    }
    const f = this.fishing;
    if (f.phase !== "waiting" || f.bar) return;
    if (f.nibbleLeft > 0 && f.bobber) {
      const objects = this.params.items.objects;
      const location = this.params.locations as unknown as Record<string, { Fish?: SpawnFishData[] | null }>;
      const gsq = this.gsqState();
      const tutorial = Object.keys(state.fishCaught ?? {}).length === 0;
      const rodId = state.inventory[state.currentToolIndex]?.id;
      const choice = chooseFish(location.Default?.Fish ?? [], location[this.location.name]?.Fish ?? [], this.params.fish, {
        season: Math.max(0, SEASON_ORDER.indexOf(state.season as (typeof SEASON_ORDER)[number])),
        time: this.params.clock.time,
        raining: weatherFlags(state.weather).raining && this.outdoors,
        fishingLevel: level,
        dailyLuck: 0,
        luckLevel: 0,
        waterDepth: f.clearWater,
        playerTile: centerTile(this.body),
        bobberTile: { x: Math.floor(f.bobber.x / TILE), y: Math.floor(f.bobber.y / TILE) },
        tutorial,
        trainingRod: rodId === "(T)TrainingRod",
        caught: state.fishCaught ?? {},
        condition: (q) => checkConditions(q, { state: gsq, random: new DotNetRandom(Math.floor(Math.random() * 2147483647)) }),
        random: Math.random,
      });
      f.fish = choice;
      const raw = this.params.fish[choice.id.slice(3)];
      if (raw && raw.split("/")[1] !== "trap" && (objects[choice.id.slice(3)]?.Category ?? 0) === -4) {
        f.bar = new BobberBarState(raw, fishSizeFactor(f.clearWater, level, Math.random), level, rodId === "(T)TrainingRod", tutorial, choice.boss);
      } else {
        this.catchItem({ id: choice.id, stack: 1, quality: 0 }, 0);
      }
      f.nibbleLeft = -1;
      return;
    }
    this.fishing = null;
  }

  private fishingRelease() {
    const f = this.fishing;
    if (!f || f.phase !== "charging") return;
    const state = this.params.state;
    const level = levelForExperience(state.experience[FISHING] ?? 0);
    const b = farmerBox(this.body.x, this.body.y);
    const land = bobberLanding(f.power, level, this.body.facing, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const tx = Math.floor(land.x / TILE), ty = Math.floor(land.y / TILE);
    state.stamina -= 8 - level * 0.1;
    if (!this.location.isWater(tx, ty)) {
      this.fishing = null;
      return;
    }
    f.phase = "waiting";
    f.bobber = land;
    f.clearWater = distanceToLand(tx, ty, (x, y) => this.location.isWater(x, y), (x, y) => this.location.inBounds(x, y));
    f.biteIn = biteTime(level, true, Math.random);
  }

  private catchItem(item: Item, xp: number) {
    const state = this.params.state;
    if (xp > 0) gainExperience(state, FISHING, xp);
    if (addItem(state.inventory.slice(0, MAX_ITEMS).map((x) => (x ? { ...x } : null)), item)) this.message = this.params.text.inventoryFull;
    else addItem(state.inventory, item);
    const caught = (state.fishCaught ??= {});
    const prev = caught[item.id] ?? [0, 0];
    caught[item.id] = [prev[0] + 1, Math.max(prev[1], 0)];
    this.message = this.itemDisplayName(item.id);
    if (this.fishing) {
      this.fishing.phase = "holding";
      this.fishing.holdMs = 1500;
      this.fishing.fish = { id: item.id, boss: false };
      this.fishing.bar = null;
      this.fishing.bobber = null;
    }
    this.params.store.save(state);
  }

  private tickFishing() {
    const f = this.fishing;
    if (!f) return;
    if (f.phase === "charging") {
      f.power = Math.max(0, Math.min(1, f.power + f.speed * TICK_MS));
      if (f.power === 1 || f.power === 0) f.speed = -f.speed;
      return;
    }
    if (f.phase === "holding") {
      f.holdMs -= TICK_MS;
      if (f.holdMs <= 0) this.fishing = null;
      return;
    }
    if (f.bar) {
      const pressed = this.useHeld || this.input.activePointer.leftButtonDown();
      f.bar.update(pressed, Math.random);
      if (f.bar.done === "lost") this.fishing = null;
      else if (f.bar.done === "caught" && f.fish) {
        const bar = f.bar;
        this.catchItem({ id: f.fish.id, stack: 1, quality: bar.resultQuality }, fishingExperience(bar.fishQuality, bar.difficulty, false, bar.perfect, f.fish.boss));
        const caught = this.params.state.fishCaught!;
        caught[f.fish.id] = [caught[f.fish.id][0], Math.max(caught[f.fish.id][1], bar.fishSize)];
      }
      return;
    }
    if (f.biteIn >= 0) {
      f.elapsed += TICK_MS;
      if (f.elapsed > f.biteIn) {
        f.elapsed = 0;
        f.biteIn = -1;
        f.nibbleLeft = MAX_TIME_TO_NIBBLE;
        f.nibbleScale = 5;
      }
    } else if (f.nibbleLeft > 0) {
      f.nibbleLeft -= TICK_MS;
      f.nibbleScale = Math.max(0, f.nibbleScale - 0.01 * TICK_MS / 16);
      if (f.nibbleLeft <= 0) {
        f.nibbleLeft = -1;
        f.biteIn = biteTime(levelForExperience(this.params.state.experience[FISHING] ?? 0), false, Math.random);
      }
    }
  }

  private drawFishing() {
    this.fishingUi ??= new FishingRenderer(this, HUD_DEPTH + 25);
    const cam = this.cameras.main;
    const f = this.fishing;
    const b = farmerBox(this.body.x, this.body.y);
    const playerScreen = { x: this.body.x - cam.scrollX, y: this.body.y - cam.scrollY };
    this.fishingUi.draw({
      playerScreen,
      power: f?.phase === "charging" ? f.power : null,
      bobberScreen: f?.bobber && !f.bar ? { x: f.bobber.x - cam.scrollX, y: f.bobber.y - cam.scrollY + (f.nibbleLeft > 0 ? Math.round(Math.sin(this.game.loop.time / 40) * 3) : 0) } : null,
      nibble: f && f.nibbleLeft > 0 ? { x: b.x + b.w / 2 - cam.scrollX, y: b.y + b.h / 2 - 136 - cam.scrollY, scale: f.nibbleScale } : null,
      bar: f?.bar ?? null,
      facing: this.body.facing,
      view: { w: cam.width, h: cam.height },
      fishItem: f?.phase === "holding" ? f.fish?.id ?? null : null,
      data: this.params.items,
      ms: this.game.loop.time,
    });
  }

  private drawMachineBubbles() {
    let used = 0;
    const img = (texture: string, sx: number, sy: number, sw: number, sh: number) => {
      if (!this.textures.exists(texture)) return null;
      const tex = this.textures.get(texture);
      const frame = `${sx},${sy},${sw},${sh}`;
      if (!tex.has(frame)) tex.add(frame, 0, sx, sy, sw, sh);
      let i = this.bubbleImages[used];
      if (!i) {
        i = this.add.image(0, 0, texture, frame);
        this.bubbleImages.push(i);
      }
      used++;
      return i.setTexture(texture, frame).setOrigin(0, 0).setScale(PIXEL_SCALE).setTint(0xffffff).setAlpha(1).setVisible(true);
    };
    const bob = 4 * Math.round(Math.sin(this.game.loop.time / 250) * 100) / 100;
    for (const e of this.entities) {
      if (e.kind !== "bigCraftable" || !e.machine?.ready || !e.machine.held) continue;
      const base = ((e.y + 1) * TILE) / 10000 + e.x / 50000;
      img("LooseSprites/Cursors", 141, 465, 20, 24)?.setPosition(e.x * TILE - 8, e.y * TILE - 112 + bob).setAlpha(0.75).setDepth(this.rendered.spriteDepth(base + 1e-6));
      const sprite = itemSprite(e.machine.held, this.params.items);
      if (!sprite) continue;
      const overlay = e.machine.held.color && (this.params.items.objects[parseId(e.machine.held.id).id] as { ColorOverlayFromNextIndex?: boolean } | undefined)?.ColorOverlayFromNextIndex;
      const tint = e.machine.held.color ? (e.machine.held.color[0] << 16) | (e.machine.held.color[1] << 8) | e.machine.held.color[2] : 0xffffff;
      img(sprite.texture, sprite.sx, sprite.sy, sprite.sw, sprite.sh)?.setOrigin(0.5, 0.5).setPosition(e.x * TILE + 32, e.y * TILE - 72 + bob).setAlpha(0.75).setTint(overlay ? 0xffffff : tint).setDepth(this.rendered.spriteDepth(base + 1e-5));
      if (overlay) {
        const width = this.params.items.textureWidths[sprite.texture] ?? 384;
        img(sprite.texture, (sprite.sx + 16) % width, sprite.sy + (sprite.sx + 16 >= width ? 16 : 0), 16, 16)?.setOrigin(0.5, 0.5).setPosition(e.x * TILE + 32, e.y * TILE - 72 + bob).setAlpha(0.75).setTint(tint).setDepth(this.rendered.spriteDepth(base + 1.1e-5));
      }
    }
    for (let i = used; i < this.bubbleImages.length; i++) this.bubbleImages[i].setVisible(false);
  }

  private refreshEntity(e: Entity) {
    for (const img of this.entityImages.get(e) ?? []) img.destroy();
    this.entityImages.delete(e);
    this.addEntitySprites(e);
  }

  private tryOpenChest(tx: number, ty: number) {
    const chest = this.entities.find((e): e is Extract<Entity, { kind: "bigCraftable" }> => e.kind === "bigCraftable" && e.x === tx && e.y === ty && (e.itemId === "130" || e.itemId === "232"));
    if (!chest || !this.chestMenu) return false;
    chest.items ??= Array(36).fill(null);
    this.openChestEntity = chest;
    this.chestMenu.items = chest.items;
    return true;
  }

  private closeChest() {
    if (!this.chestMenu) return;
    this.chestMenu.items = null;
    this.openChestEntity = null;
    this.params.store.save(this.params.state);
  }

  private chestClick(px: number, py: number, right: boolean) {
    const menu = this.chestMenu!;
    const items = menu.items!;
    const inv = this.params.state.inventory;
    const hit = menu.hit(this.cameras.main.width, this.cameras.main.height, px, py);
    if (!hit) return;
    if (hit.kind === "close") {
      this.closeChest();
      return;
    }
    const from = hit.kind === "chest" ? items : inv;
    const to = hit.kind === "chest" ? inv : items;
    const item = from[hit.slot];
    if (!item || (hit.kind === "player" && hit.slot >= MAX_ITEMS)) return;
    const moving: Item = right ? { ...item, stack: 1 } : { ...item };
    const target = hit.kind === "chest" ? to.slice(0, MAX_ITEMS) : to;
    const rest = addItem(target, moving);
    if (hit.kind === "chest") for (let i = 0; i < MAX_ITEMS; i++) to[i] = target[i];
    const moved = moving.stack - (rest?.stack ?? 0);
    item.stack -= moved;
    if (item.stack <= 0) from[hit.slot] = null;
  }

  private drawChest(pointer: { x: number; y: number }) {
    const menu = this.chestMenu;
    if (!menu) return;
    const { state, strings } = this.params;
    const w = this.cameras.main.width, h = this.cameras.main.height;
    const ui = strings["Strings\\UI"] ?? {};
    const hovered = menu.open ? menu.hovered(w, h, pointer.x, pointer.y, state.inventory) : null;
    const fonts = this.smallFont && this.dialogueFont ? { small: this.smallFont, smallTexture: "Fonts/SmallFont", dialogue: this.dialogueFont, dialogueTexture: DIALOGUE_FONT } : null;
    menu.draw(w, h, state.inventory, MAX_ITEMS, this.params.items, pointer, this.tooltipFor(hovered), fonts, { energy: ui.ItemHover_Energy ?? "{0} Energy", health: ui.ItemHover_Health ?? "{0} Health" });
  }

  private toggleGameMenu() {
    const menu = this.gameMenu;
    if (!menu) return;
    if (menu.open) {
      this.closeGameMenu();
      return;
    }
    if (this.dialogueBox?.open || this.question?.open || this.shop?.open || this.chestMenu?.open || this.endingDay || this.warping || this.tool) return;
    menu.open = true;
  }

  private closeGameMenu() {
    const menu = this.gameMenu;
    if (!menu) return;
    if (menu.held) {
      const inv = this.params.state.inventory;
      const slot = menu.heldFrom >= 0 && !inv[menu.heldFrom] ? menu.heldFrom : inv.findIndex((x, i) => !x && i < MAX_ITEMS);
      if (slot >= 0) inv[slot] = menu.held;
      menu.held = null;
    }
    menu.open = false;
  }

  private gameMenuClick(px: number, py: number) {
    const menu = this.gameMenu!;
    const inv = this.params.state.inventory;
    const hit = menu.hit(this.cameras.main.width, this.cameras.main.height, px, py);
    if (!hit) return;
    if (hit.kind === "close") this.closeGameMenu();
    else if (hit.kind === "tab") {
      if (hit.name === "inventory" || hit.name === "social" || hit.name === "skills" || hit.name === "crafting") menu.tab = hit.name;
      if (hit.name === "exit") this.closeGameMenu();
    } else if (hit.kind === "up" || hit.kind === "down") menu.social.scrollBy(hit.kind === "up" ? -1 : 1, this.socialEntries().length);
    else if (hit.kind === "craftUp") menu.craftingPage = Math.max(0, menu.craftingPage - 1);
    else if (hit.kind === "craftDown") menu.craftingPage = Math.min(Math.max(0, ...this.recipeSlots().map((s) => s.page)), menu.craftingPage + 1);
    else if (hit.kind === "recipePoint") {
      const slot = menu.recipeAt(this.cameras.main.width, this.cameras.main.height, hit.x, hit.y, this.recipeSlots());
      if (slot) this.craft(slot.recipe);
    }
    else if (hit.kind === "trash") menu.held = null;
    else if (hit.kind === "slot") {
      if (hit.slot >= MAX_ITEMS) return;
      const there = inv[hit.slot] ?? null;
      if (menu.held && there && canStackWith(there, menu.held) && maximumStack(there) > 1) {
        const room = maximumStack(there) - there.stack;
        const moved = Math.min(room, menu.held.stack);
        there.stack += moved;
        menu.held.stack -= moved;
        if (menu.held.stack <= 0) menu.held = null;
        return;
      }
      inv[hit.slot] = menu.held;
      menu.held = there;
      if (menu.held) menu.heldFrom = hit.slot;
    }
  }

  private drawGameMenu(pointer: { x: number; y: number }) {
    const menu = this.gameMenu;
    if (!menu) return;
    const { state, clothing, strings, clock } = this.params;
    const w = this.cameras.main.width, h = this.cameras.main.height;
    const ui = strings["Strings\\UI"] ?? {};
    const cs = strings["Strings\\StringsFromCSFiles"] ?? {};
    const season = cs[`Utility.cs.${5680 + Math.max(0, SEASON_ORDER.indexOf(state.season as (typeof SEASON_ORDER)[number]))}`] ?? state.season;
    const shirt = shirtInfo(this.appearance, clothing), pants = pantsInfo(this.appearance, clothing);
    const craftSlots = menu.open && menu.tab === "crafting" ? this.recipeSlots() : [];
    const hoveredRecipe = menu.open && menu.tab === "crafting" ? menu.recipeAt(w, h, pointer.x, pointer.y, craftSlots) : null;
    const rgb = (c: number[]) => (c[0] << 16) | (c[1] << 8) | c[2];
    menu.draw(w, h, state.inventory, this.params.items, state.currentToolIndex, MAX_ITEMS, {
      farmerName: state.farmerName,
      farmName: state.farmName,
      money: state.money,
      totalEarned: state.totalEarned,
      date: (cs["Utility.cs.5678"] ?? "Day {0} of {1}, Year {2}").replace("{0}", String(state.dayOfMonth)).replace("{1}", season).replace("{2}", String(state.year)),
      night: clock.time >= 1900,
      shirt: { index: shirt.spriteIndex, color: rgb(shirt.color) },
      pants: { index: pants.spriteIndex, color: rgb(pants.color) },
      strings: { farmName: ui.Inventory_FarmName ?? "{0} Farm", funds: ui.Inventory_CurrentFunds ?? "Current Funds: {0}g", earnings: ui.Inventory_TotalEarnings ?? "Total Earnings: {0}g" },
    }, pointer, hoveredRecipe ? this.recipeTooltip(hoveredRecipe.recipe) : this.tooltipFor(menu.open ? state.inventory[menu.hoveredSlot(w, h, pointer.x, pointer.y)] ?? null : null), { energy: ui.ItemHover_Energy ?? "{0} Energy", health: ui.ItemHover_Health ?? "{0} Health" }, { entries: menu.open && menu.tab === "social" ? this.socialEntries() : [], strings: cs }, { levels: state.experience.map((x) => levelForExperience(x)), title: cs[farmerTitleKey(state.experience.map((x) => levelForExperience(x)), this.appearance.isMale)] ?? "" }, menu.open && menu.tab === "crafting" ? { slots: craftSlots, craftable: (sl) => canCraft(sl.recipe, state.inventory, this.params.items.objects) } : undefined);
    if (menu.open && menu.tab !== "social" && menu.farmerAt) {
      this.menuFarmer?.update({ frame: 0, ms: 0, flip: false, offsetY: 0 } as unknown as Parameters<FarmerSprite["update"]>[0], Facing.Down, menu.farmerAt.x, menu.farmerAt.y, 0, () => HUD_DEPTH + 41);
    } else this.menuFarmer?.hide();
  }

  private recipeSlots(): RecipeSlot[] {
    const { recipes, state } = this.params;
    return layoutRecipes(Object.entries(recipes.crafting).filter(([name]) => state.craftingRecipes.includes(name)).map(([name, raw]) => parseRecipe(name, raw, false)));
  }

  private craft(recipe: Recipe) {
    const menu = this.gameMenu!;
    const { state, items } = this.params;
    if (!canCraft(recipe, state.inventory, items.objects)) return;
    const output: Item = { id: recipe.output, stack: recipe.produced, quality: 0 };
    if (menu.held) {
      if (menu.held.id !== output.id || menu.held.stack + output.stack > maximumStack(menu.held)) return;
      consumeIngredients(recipe, state.inventory, items.objects);
      menu.held.stack += output.stack;
    } else {
      consumeIngredients(recipe, state.inventory, items.objects);
      menu.held = output;
      menu.heldFrom = -1;
    }
  }

  private recipeTooltip(recipe: Recipe): TooltipContent | null {
    const base = this.tooltipFor({ id: recipe.output, stack: 1 });
    if (!base) return null;
    const { state, items } = this.params;
    const cs = this.params.strings["Strings\\StringsFromCSFiles"] ?? {};
    const name = recipe.displayName ?? this.itemDisplayName(recipe.output);
    const ingredientName = (key: string) => {
      if (key.startsWith("-")) return cs[{ "-1": "CraftingRecipe.cs.568", "-2": "CraftingRecipe.cs.569", "-3": "CraftingRecipe.cs.570", "-4": "CraftingRecipe.cs.571", "-5": "CraftingRecipe.cs.572", "-6": "CraftingRecipe.cs.573", "-777": "CraftingRecipe.cs.574" }[key] ?? ""] ?? "???";
      return this.itemDisplayName(key.startsWith("(") ? key : `(O)${key}`);
    };
    const spriteFor = (key: string) => (key.startsWith("-") ? null : itemSprite({ id: key.startsWith("(") ? key : `(O)${key}`, stack: 1 }, items));
    return {
      ...base,
      title: recipe.produced > 1 ? `${name} x${recipe.produced}` : name,
      text: " ",
      recipe: {
        ingredientsLabel: cs["CraftingRecipe.cs.567"] ?? "Ingredients:",
        description: base.text.replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
        ingredients: recipe.ingredients.map((ing) => ({ name: ingredientName(ing.key), count: ing.count, missing: countIngredient(state.inventory, ing.key, items.objects) < ing.count, sprite: spriteFor(ing.key) })),
      },
    };
  }

  private socialEntries(): SocialEntry[] {
    const { characters, state, strings } = this.params;
    const names = strings["Strings\\NPCNames"] ?? {};
    const met = Object.keys(state.friendship);
    const entries: SocialEntry[] = [];
    for (const [name, data] of Object.entries(characters)) {
      const d = data as CharacterData & { SocialTab?: number; DisplayName?: string; Gender?: number; Age?: number; UnlockConditions?: string | null; MugShotSourceRect?: { X: number; Y: number; Width: number; Height: number } | null };
      if (d.UnlockConditions) continue;
      if (d.CanSocialize && !checkConditions(d.CanSocialize, { state: this.gsqState(), random: new DotNetRandom(0) })) continue;
      const f = state.friendship[name];
      const tab = d.SocialTab ?? 0;
      if (tab === 3 || (tab === 2 && !f)) continue;
      const display = this.localized(d.DisplayName) || names[name] || name;
      const child = d.Age === 2;
      const ms = d.MugShotSourceRect;
      entries.push({
        name,
        displayName: !f && tab === 0 ? "???" : display,
        points: f ? f.points : tab === 1 ? 0 : null,
        orderMet: f ? met.indexOf(name) + 1 : null,
        datable: !!d.CanBeRomanced,
        female: d.Gender === 1,
        child,
        giftsThisWeek: (f as Friendship | undefined)?.giftsThisWeek ?? 0,
        talkedToday: !!f?.talkedToday,
        mugShot: ms ? { sx: ms.X, sy: ms.Y, sw: ms.Width, sh: ms.Height } : { sx: 0, sy: child ? 4 : 0, sw: 16, sh: 24 },
      });
    }
    return sortSocialEntries(entries);
  }

  private tooltipFor(item: Item | null): TooltipContent | null {
    if (!item || !this.smallFont || !this.dialogueFont) return null;
    const { type, id } = parseId(item.id);
    const cs = this.params.strings["Strings\\StringsFromCSFiles"] ?? {};
    let title = id, description = "", category = "", color = 0x000000, edibility: number | null = null;
    if (type === "O") {
      const data = this.params.items.objects[id] as { DisplayName?: string; Description?: string; Category?: number; Edibility?: number; Type?: string } | undefined;
      title = this.displayNameOf(item);
      description = this.localized(data?.Description);
      const key = categoryNameKey(data?.Category ?? 0);
      category = key && !key.startsWith("1_6:") ? cs[key] ?? "" : "";
      color = data?.Type === "Arch" ? ARCH_CATEGORY_COLOR : categoryColor(data?.Category ?? 0);
      const e = item.edibility ?? data?.Edibility ?? -300;
      edibility = e !== -300 ? e : null;
    } else if (type === "BC") {
      const data = this.params.items.bigCraftables?.[id];
      title = this.localized(data?.DisplayName) || id;
      description = this.localized(data?.Description);
    } else {
      const data = (type === "W" ? this.params.items.weapons[id] : this.params.items.tools[id]) as { DisplayName?: string; Description?: string } | undefined;
      title = this.localized(data?.DisplayName) || id;
      description = this.localized(data?.Description);
      category = cs["Tool.cs.14307"] ?? "Tool";
      color = TOOL_CATEGORY_COLOR;
    }
    description = parseText(description, this.smallFont, descriptionWidth(title, this.dialogueFont));
    return { title, text: description, category, categoryColor: color, edibility, quality: item.quality ?? 0 };
  }

  private isBirthday(name: string) {
    const data = this.params.characters[name];
    if (!data || data.BirthSeason === undefined || data.BirthSeason === null) return false;
    const season = typeof data.BirthSeason === "number" ? SEASON_ORDER[data.BirthSeason] : String(data.BirthSeason).toLowerCase();
    return season === this.params.state.season && data.BirthDay === this.params.state.dayOfMonth;
  }

  private tryGift(n: NpcState) {
    const { state, items, giftTastes, characters } = this.params;
    const item = state.inventory[state.currentToolIndex];
    if (!item || !canBeGivenAsGift(items.objects, item.id)) return false;
    const data: CharacterData | undefined = characters[n.name];
    if (!(n.name in giftTastes) || data?.CanReceiveGifts === false) return false;
    const birthday = this.isBirthday(n.name);
    const csStrings = this.params.strings["Strings\\StringsFromCSFiles"] ?? {};
    const existing = state.friendship[n.name];
    const refusal = canReceiveGiftNow(existing, birthday, item.id);
    if (refusal) {
      const text = refusal.kind === "alreadyToday" ? (csStrings["NPC.cs.3981"] ?? "").replace("{0}", n.name) : (csStrings["NPC.cs.3987"] ?? "").replace("{0}", n.name).replace("{1}", "2");
      this.dialogueBox?.showMessage(text);
      return true;
    }
    const f: Friendship = (state.friendship[n.name] ??= { points: 0, talkedToday: false });
    const taste = giftTaste(n.name, item.id, items.objects, giftTastes);
    if (item.id !== "(O)StardropTea") recordGift(f, totalDays(state.year, state.season, state.dayOfMonth));
    changeFriendship(f, giftFriendshipChange(taste, item.quality ?? 0, birthday), !!data?.CanBeRomanced);
    const reaction = giftReaction({
      name: n.name,
      qualifiedId: item.id,
      taste,
      birthday,
      rude: Number(data?.Manner) === 2 || String(data?.Manner).toLowerCase() === "rude",
      tags: objectContextTags(items.objects, item.id),
      dialogue: this.params.dialogues[n.name] ?? {},
      tastes: giftTastes,
      strings: csStrings,
      nextBool: () => Math.random() < 0.5,
    });
    consumeOne(state.inventory, state.currentToolIndex);
    this.faceFarmer(n);
    const emote = giftEmote(taste);
    if (emote !== null) n.emote = startEmote(emote);
    if (reaction) {
      const text = reaction.emotion && !/\$[a-z0-9]+\s*$/.test(reaction.text) ? `${reaction.text}${reaction.emotion}` : reaction.text;
      const pages = parseDialogue(text, state.farmerName, this.appearance.isMale);
      if (pages.length) this.dialogueBox?.show(n.name, pages);
    }
    return true;
  }

  private faceFarmer(n: NpcState) {
    const b = farmerBox(this.body.x, this.body.y);
    const dx = b.x + b.w / 2 - (n.x + 32), dy = b.y + b.h / 2 - (n.y + 32);
    if (!n.walking) n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  }

  private localized(text: string | null | undefined) {
    if (!text) return "";
    return text.replace(/\[LocalizedText ([^\]:]+):([^\]\s]+)\]/g, (_m, file: string, key: string) => this.params.strings[file]?.[key] ?? key);
  }

  private displayNameOf(item: Item) {
    if (item.preserve) {
      const objectStrings = this.params.strings["Strings\\Objects"] ?? {};
      const ingredient = this.itemName(`(O)${item.preserve.id}`);
      const pattern = objectStrings[preserveNameKey(item.preserve.type)];
      if (pattern) return pattern.replace("{0}", ingredient);
    }
    return this.itemName(item.id);
  }

  private itemName(qualified: string) {
    const { type, id } = parseId(qualified);
    if (type === "O") return this.localized((this.params.items.objects[id] as { DisplayName?: string } | undefined)?.DisplayName) || id;
    return id;
  }

  private tryAction(action: string) {
    const words = action.trim().split(/\s+/);
    const t = facingTile(this.body);
    const me = centerTile(this.body);
    const loc = this.params.strings["Strings\\Locations"] ?? {};
    const ownerAt = (name: string, tiles: { x: number; y: number }[]) =>
      this.params.npcs.in(this.location.name).find((n) => n.name === name && tiles.some((p) => Math.round(n.x / 64) === p.x && Math.round(n.y / 64) === p.y));
    const menu = (question: string, options: [string, string][], handle: (key: string) => void) => {
      if (!this.question) return true;
      void this.question.ask(question, options.map((o) => o[1])).then((i) => handle(options[i]?.[0] ?? "Leave"));
      return true;
    };
    switch (words[0]) {
      case "Mine":
        if (words[1] && words[1] !== "1") return false;
        this.warpTo(mineLocationName(1), -1, -1);
        return true;
      case "Buy":
        if (words[1] === "Fish") return this.tryOpenShopArea("FishShop", undefined, me.y - 1) || true;
        if (this.location.name === "SeedShop") {
          if (!this.tryOpenShopArea("SeedShop", { x: 4, y: 17, w: 1, h: 1 }, me.y - 1)) this.message = this.localized(this.params.strings["Strings\\StringsFromCSFiles"]?.["GameLocation.cs.8525"]);
          return true;
        }
        return false;
      case "Saloon":
        return this.tryOpenShopArea("Saloon", { x: 9, y: 17, w: 10, h: 2 });
      case "HospitalShop":
        this.tryOpenShopArea("Hospital", { x: me.x - 1, y: me.y - 2, w: 2, h: 1 });
        return true;
      case "Blacksmith": {
        const clint = ownerAt("Clint", [{ x: t.x, y: t.y - 1 }, { x: t.x - 1, y: t.y - 1 }]);
        if (!clint) return false;
        clint.facing = 2;
        const upgrade = this.params.state.toolUpgrade;
        if (upgrade && upgrade.daysLeft <= 0) {
          if (addItem(this.params.state.inventory.slice(0, MAX_ITEMS), { id: upgrade.id, stack: 1 })) {
            this.dialogueBox?.show("Clint", parseDialogue(this.localized(this.params.strings["Data\\ExtraDialogue"]?.Clint_NoInventorySpace ?? this.params.text.inventoryFull), this.params.state.farmerName, this.appearance.isMale));
            return true;
          }
          addItem(this.params.state.inventory, { id: upgrade.id, stack: 1 });
          this.params.state.toolUpgrade = null;
          this.message = this.itemDisplayName(upgrade.id);
          this.params.store.save(this.params.state);
          return true;
        }
        return menu("", [["Shop", loc.Blacksmith_Clint_Shop ?? "Shop"], ["Upgrade", loc.Blacksmith_Clint_Upgrade ?? "Upgrade Tools"], ["Leave", loc.Blacksmith_Clint_Leave ?? "Leave"]], (k) => {
          if (k === "Shop") this.openShop("Blacksmith");
          else if (k === "Upgrade") this.openShop("ClintUpgrade");
        });
      }
      case "AnimalShop": {
        const marnie = ownerAt("Marnie", [{ x: t.x, y: t.y - 1 }, { x: t.x - 1, y: t.y - 1 }]);
        if (!marnie) return false;
        marnie.facing = 2;
        return menu("", [["Supplies", loc.AnimalShop_Marnie_Supplies ?? "Supplies Shop"], ["Purchase", loc.AnimalShop_Marnie_Animals ?? "Purchase Animals"], ["Leave", loc.AnimalShop_Marnie_Leave ?? "Leave"]], (k) => {
          if (k === "Supplies") this.openShop("AnimalShop");
          else if (k === "Purchase") this.message = "Compra de animales todavía no implementada";
        });
      }
      case "Carpenter": {
        const robin = this.params.npcs.in(this.location.name).find((n) => n.name === "Robin" && Math.hypot(n.x / 64 - t.x, n.y / 64 - t.y) <= 3);
        if (!robin) return false;
        robin.facing = 2;
        return menu(loc.ScienceHouse_CarpenterMenu ?? "", [["Shop", loc.ScienceHouse_CarpenterMenu_Shop ?? "Shop"], ["Upgrade", loc.ScienceHouse_CarpenterMenu_UpgradeHouse ?? "Upgrade House"], ["Construct", loc.ScienceHouse_CarpenterMenu_Construct ?? "Construct Farm Buildings"], ["Leave", loc.ScienceHouse_CarpenterMenu_Leave ?? "Leave"]], (k) => {
          if (k === "Shop") this.openShop("Carpenter");
          else if (k !== "Leave") this.message = "Construcción y mejoras todavía no implementadas";
        });
      }
      default:
        return false;
    }
  }

  private tryOpenShopArea(shopId: string, area?: { x: number; y: number; w: number; h: number }, maxY?: number) {
    const shop = this.params.shops[shopId];
    if (!shop) return false;
    const gsq = this.gsqState();
    for (const o of shop.Owners ?? []) {
      if (o.Condition && !checkConditions(o.Condition, { state: gsq, random: daySaveRandom(gsq) })) continue;
      if (o.Name === "AnyOrNone" || o.Name === "None") return this.openShop(shopId);
      const npc = this.params.npcs.in(this.location.name).find((n) => {
        if (o.Name !== "Any" && n.name !== o.Name) return false;
        const x = Math.round(n.x / 64), y = Math.round(n.y / 64);
        if (area && !(x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h)) return false;
        return maxY === undefined || y <= maxY;
      });
      if (npc) return this.openShop(shopId);
    }
    return false;
  }

  private openShop(id: string) {
    const data = this.params.shops[id];
    if (!data || !this.shop) return false;
    const gsq = this.gsqState();
    const inv = this.params.state.inventory;
    const queries = {
      TOOL_UPGRADES: () => toolUpgrades(this.params.items.tools as Record<string, ToolUpgradeInfo>, (q) => inv.some((it) => it?.id === q), (q) => checkConditions(q, { state: gsq, random: daySaveRandom(gsq) })),
    };
    const stock = shopStock(data, (q, raw) => objectBasePrice(this.params.items.objects, q, raw, gsq.year), { state: gsq, random: daySaveRandom(gsq) }, queries).filter((e) => itemSprite({ id: e.id, stack: 1 }, this.params.items) !== null);
    this.shop.show(stock);
    return true;
  }

  private shopClick(px: number, py: number) {
    const shop = this.shop!;
    const cam = this.cameras.main;
    const hit = shop.hit(cam.width, cam.height, px, py);
    const state = this.params.state;
    if (!hit) return;
    if (hit.kind === "close") shop.close();
    else if (hit.kind === "up") shop.scrollBy(-1);
    else if (hit.kind === "down") shop.scrollBy(1);
    else if (hit.kind === "buy") {
      const entry = shop.stock[hit.index];
      if (state.money < entry.price || entry.stock <= 0) return;
      const tradeHave = entry.trade ? state.inventory.reduce((n, it) => n + (it && it.id === entry.trade!.id ? it.stack : 0), 0) : 0;
      if (entry.trade && tradeHave < entry.trade.count) return;
      if (entry.requireTool) {
        if (state.toolUpgrade) return;
        const slot = state.inventory.findIndex((it) => it?.id === entry.requireTool);
        if (slot < 0) return;
        state.inventory[slot] = null;
        state.toolUpgrade = { id: entry.id, daysLeft: 2 };
        if (state.currentToolIndex === slot) this.selectSlot(slot);
      } else if (addItem(state.inventory, { id: entry.id, stack: 1 })) return;
      if (entry.trade) {
        let left = entry.trade.count;
        for (let i = 0; i < state.inventory.length && left > 0; i++) {
          const it = state.inventory[i];
          if (!it || it.id !== entry.trade.id) continue;
          const take = Math.min(left, it.stack);
          it.stack -= take;
          left -= take;
          if (it.stack <= 0) state.inventory[i] = null;
        }
      }
      state.money -= entry.price;
      entry.stock--;
      if (entry.requireTool) {
        shop.close();
        this.dialogueBox?.show("Clint", parseDialogue(this.localized(this.params.strings["Strings\\StringsFromCSFiles"]?.["Tool.cs.14317"] ?? ""), state.farmerName, this.appearance.isMale));
      }
    } else if (hit.kind === "sell") {
      const item = state.inventory[hit.slot];
      if (!item || parseId(item.id).type !== "O") return;
      const data = this.params.items.objects[parseId(item.id).id];
      const price = sellPrice(item.price ?? data?.Price ?? 0, item.quality ?? 0);
      if (price <= 0) return;
      earn(state, price * item.stack);
      state.inventory[hit.slot] = null;
    }
  }

  private interact() {
    if (!this.location || this.warping) return;
    if (this.dialogueBox?.open) {
      this.dialogueBox.advance();
      return;
    }
    if (this.question?.open) {
      this.question.confirm();
      return;
    }
    const t = facingTile(this.body);
    const npc = this.npcAt(t.x, t.y);
    if (this.tryMineTile(t.x, t.y)) return;
    if (this.tryPickUpSpawned(t.x, t.y)) return;
    if (this.tryOpenChest(t.x, t.y)) return;
    if (this.tryMachine(t.x, t.y)) return;
    if (npc && this.tryGift(npc)) return;
    if (npc && this.talkTo(npc)) return;
    if (this.tryOpenGiftbox(t.x, t.y)) return;
    if (this.tryShip(t.x, t.y)) return;
    if (this.tryBuildingDoor(t.x, t.y)) return;
    if (this.tryHarvest(t.x, t.y)) return;
    const c = centerTile(this.body);
    if (this.tryHarvest(c.x, c.y)) return;
    const action = this.location.action(t.x, t.y);
    if (action && this.tryAction(action)) return;
    if (!action) return;
    const warp = parseActionWarp(action);
    if (warp) this.warpTo(warp.target, warp.x, warp.y);
    else this.message = `Acción todavía no implementada: ${action}`;
  }

  private warpTo(target: string, x: number, y: number, facing = this.body.facing) {
    if (this.warping) return;
    const mapPath = resolveMapPath(this.params.locations, target);
    if (!this.params.manifest.maps.includes(mapPath)) {
      this.message = `Warp a ${target}: no hay mapa ${mapPath}`;
      return;
    }
    this.warping = true;
    this.cameras.main.fade(150, 0, 0, 0, true);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ ...this.params, start: { location: target, x, y, facing } });
    });
  }

  private get timePasses() {
    return !this.fishing?.bar && !this.question?.open && !this.dialogueBox?.open && !this.shop?.open && !this.gameMenu?.open && !this.chestMenu?.open && !this.endingDay && !this.warping;
  }

  private get canMove() {
    return this.timePasses && !this.tool && !this.fishing;
  }

  private onClockEvents(events: ReturnType<GameClock["tick"]>) {
    for (const e of events) {
      if (e.kind === "nightTiles") {
        this.applyTiles("NightTiles");
      } else if (e.kind === "late" && e.time === 2400) this.message = this.params.text.late;
      else if (e.kind === "passOut") this.endDay();
      else if (e.kind === "tenMinutes") this.tickMachines(10);
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
      this.tickMachines(minutesUntilMorning(clock.time));
      if (state.toolUpgrade && state.toolUpgrade.daysLeft > 0) state.toolUpgrade.daysLeft--;
      const shipped = state.shipping;
      const yesterday = this.dateString(state.dayOfMonth, state.season, state.year);
      for (const item of shipped) {
        const data = this.params.items.objects[parseId(item.id).id];
        earn(state, sellPrice(item.price ?? data?.Price ?? 0, item.quality ?? 0) * item.stack);
      }
      state.shipping = [];
      this.pendingShipping = shipped.length ? { items: shipped, date: yesterday } : null;
      Object.assign(state, nextDay(state));
      const gsq = this.gsqState();
      const random = daySaveRandom(gsq);
      const weather = updateWeatherForNewDay(gsq, state.weatherForTomorrow, this.params.weather, { state: gsq, random });
      state.weather = weather.today;
      state.weatherForTomorrow = weather.tomorrow;
      dayUpdateLocations(state, this.params.crops, weatherFlags(state.weather).raining);
      resetFriendshipsForNewDay(state.friendship, (name) => (name in this.params.characters ? !!this.params.characters[name].CanBeRomanced : null), totalDays(state.year, state.season, state.dayOfMonth));
      this.params.setupNpcs();
      state.stamina = state.maxStamina;
      state.health = state.maxHealth;
      clock.time = 600;
      clock.interval = 0;
      clock.shakeMs = 0;
      this.runNightMenus(() => {
        store.save(state);
        this.scene.restart({ ...this.params, season: state.season, start: { location: FARMHOUSE, wakeUp: true } });
      });
    });
  }

  private nightMenusDone: (() => void) | null = null;

  private pendingShipping: { items: Item[]; date: string } | null = null;

  private runNightMenus(done: () => void) {
    this.nightMenusDone = done;
    const pending = this.pendingShipping;
    this.pendingShipping = null;
    if (pending && this.shipping) {
      this.cameras.main.resetFX();
      const objects = this.params.items.objects;
      const summary = summarizeShipping(pending.items, (it) => objects[parseId(it.id).id]?.Category, (it) => sellPrice(it.price ?? objects[parseId(it.id).id]?.Price ?? 0, it.quality ?? 0));
      const cs = this.params.strings["Strings\\StringsFromCSFiles"] ?? {};
      this.shipping.show(summary, [11389, 11390, 11391, 11392, 11393, 11394].map((k) => cs[`ShippingMenu.cs.${k}`] ?? ""), pending.date, this.params.state.season === "winter");
      return;
    }
    this.nextNightMenu();
  }

  private finishShipping() {
    if (!this.shipping?.summary || this.shipping.introTimer > 0) return;
    this.shipping.summary = null;
    this.nextNightMenu();
  }

  private dateString(day: number, season: string, year: number) {
    const cs = this.params.strings["Strings\\StringsFromCSFiles"] ?? {};
    const name = cs[`Utility.cs.${5680 + Math.max(0, SEASON_ORDER.indexOf(season as (typeof SEASON_ORDER)[number]))}`] ?? season;
    return (cs["Utility.cs.5678"] ?? "Day {0} of {1}, Year {2}").replace("{0}", String(day)).replace("{1}", name).replace("{2}", String(year));
  }

  private nextNightMenu() {
    const { state, strings, recipes } = this.params;
    const menu = this.levelUp;
    const next = state.newLevels[0];
    if (!menu || !next) {
      if (menu) menu.current = null;
      const done = this.nightMenusDone;
      this.nightMenusDone = null;
      done?.();
      return;
    }
    this.cameras.main.resetFX();
    const [skill, level] = next;
    const ui = strings["Strings\\UI"] ?? {};
    const skillName = strings["Strings\\StringsFromCSFiles"]?.[["SkillsPage.cs.11604", "SkillsPage.cs.11607", "SkillsPage.cs.11606", "SkillsPage.cs.11605", "SkillsPage.cs.11608", "SkillsPage.cs.11609"][skill]] ?? "";
    const professions = professionChoices(skill, level, state.professions);
    const unlocks = professions ? [] : recipesUnlockedAt(skill, level, recipes);
    menu.current = {
      skill,
      level,
      title: (ui.LevelUp_Title ?? "Level {0} {1}").replace("{0}", String(level)).replace("{1}", skillName),
      extraInfo: extraInfoKeys(skill, level).map((k) => ui[k] ?? k),
      recipes: unlocks.map((r) => ({ ...r, label: (ui.LevelUp_NewRecipe ?? "New {0} recipe: {1}").replace("{0}", ui[`LearnedRecipe_${r.cooking ? "cooking" : "crafting"}`] ?? "").replace("{1}", r.displayName ?? this.itemDisplayName(r.output)) })),
      professions,
    };
  }

  private finishLevelUp(profession?: number) {
    const { state } = this.params;
    const current = this.levelUp?.current;
    if (!current) return;
    if (current.professions && profession === undefined) return;
    if (profession !== undefined && !state.professions.includes(profession)) state.professions.push(profession);
    for (const r of current.recipes) {
      const list = r.cooking ? state.cookingRecipes : state.craftingRecipes;
      if (!list.includes(r.name)) list.push(r.name);
    }
    state.newLevels.shift();
    this.nextNightMenu();
  }

  private itemDisplayName(qualified: string) {
    const { type, id } = parseId(qualified);
    if (type === "BC") return this.localized(this.params.items.bigCraftables?.[id]?.DisplayName) || id;
    if (type === "T" || type === "W") return this.localized(((type === "T" ? this.params.items.tools[id] : this.params.items.weapons[id]) as { DisplayName?: string } | undefined)?.DisplayName) || id;
    return this.itemName(qualified);
  }

  private simulate() {
    this.tickFishing();
    const pressed = this.pressed();
    if (!this.canMove) pressed.clear();
    this.tickTool();
    this.tickMonsters();
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
    this.toolbar?.draw(this.toolbarLayout(), state.inventory, state.currentToolIndex, this.params.items, !this.shop?.open && !this.gameMenu?.open && !this.chestMenu?.open && !this.dialogueBox?.open && !this.question?.open && !this.fishing?.bar);
    this.dialogueBox?.update(this.game.loop.rawDelta);
    this.shipping?.update(Math.min(250, this.game.loop.rawDelta));
    const pointer = this.input.activePointer;
    this.shop?.draw(this.cameras.main.width, this.cameras.main.height, (id) => this.itemDisplayName(id), state.money, state.inventory, this.params.items, { x: pointer.x, y: pointer.y }, (item) => parseId(item.id).type === "O" && (this.params.items.objects[parseId(item.id).id]?.Price ?? 0) > 0);
    const speaker = this.dialogueBox?.speaker ? `Portraits/${this.dialogueBox.speaker}` : null;
    this.drawGameMenu(pointer);
    this.drawChest(pointer);
    this.shipping?.draw(this.cameras.main.width, this.cameras.main.height, this.params.items);
    this.levelUp?.draw(this.cameras.main.width, this.cameras.main.height, this.params.items, this.params.strings["Strings\\UI"] ?? {}, { x: pointer.x, y: pointer.y });
    this.dialogueBox?.draw(this.cameras.main.width, this.cameras.main.height, speaker && this.textures.exists(speaker) ? speaker : null);
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
        health: state.health,
        maxHealth: state.maxHealth,
        showHealth: !!this.mine || state.health < state.maxHealth,
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
    if (this.farmerInvincible > 0 && Math.floor(this.farmerInvincible / 50) % 2 === 1) this.farmer.setVisible(false);
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
    this.drawMachineBubbles();
    this.drawFishing();
    this.updateCamera();
    this.drawWater();
    this.redrawDirt();
    this.drawDrops();
    this.drawNpcs();
    this.drawMonsters(time);
    this.drawFloaters(delta);
    this.drawTemps(delta);
    this.tickShakes(delta);
    this.drawLightingAndHud(time);

    const c = centerTile(this.body);
    const f = facingTile(this.body);
    const action = this.location.action(f.x, f.y);
    this.params.onStatus(
      [
        `${this.location.name} (${this.mapPath})  tile ${c.x},${c.y}  pos ${this.body.x.toFixed(2)},${this.body.y.toFixed(2)}`,
        `${this.params.state.season} ${this.params.state.dayOfMonth}, año ${this.params.state.year} · ${formatTime(this.params.clock.time)}`,
        this.question?.open ? "Pregunta abierta [Enter = sí, Esc = no]" : "",
        action ? `Enfrente: ${action}  [X]` : "",
        this.message,
        "WASD/flechas = mover · Shift = caminar · X/clic derecho = interactuar · E/Esc = menú",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}
