import Phaser from "phaser";
import { contentUrl, loadManifest, SEASONS, type Manifest, type Season } from "./content.ts";
import { MapViewer } from "./scenes/MapViewer.ts";
import { World, type LocationsData } from "./scenes/World.ts";
import type { TerrainData } from "./world/terrain.ts";
import { localStore } from "./world/state.ts";
import { GameClock } from "./world/clock.ts";
import type { WeatherData } from "./world/weather.ts";
import type { ItemData } from "./world/items.ts";
import type { CropData } from "./world/crops.ts";
import type { BuildingData } from "./world/buildings.ts";
import { NpcManager, type CharacterData } from "./world/npcs.ts";
import type { GraphWarp } from "./world/npc-sim.ts";
import type { ShopData } from "./world/shops.ts";
import { resolveMapPath } from "./scenes/World.ts";
import type { ClothingData } from "./world/farmer-appearance.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function createGame() {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent: document.body,
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: innerWidth, height: innerHeight },
    backgroundColor: "#000",
  });
}

function setupSelectors(manifest: Manifest, params: URLSearchParams, mode: string) {
  const mapSelect = $<HTMLSelectElement>("map");
  const seasonSelect = $<HTMLSelectElement>("season");
  const maps = manifest.maps.filter((m) => !/\.[a-z]{2}-[A-Z]{2}$/.test(m));
  for (const m of maps) mapSelect.add(new Option(m.replace(/^Maps\//, ""), m.replace(/^Maps\//, "")));
  mapSelect.value = params.get("map") ?? "Town";
  const season = params.get("season");
  seasonSelect.value = SEASONS.includes(season as Season) ? season! : "spring";
  const go = () => {
    const url = new URL(location.href);
    url.search = "";
    if (mode === "viewer") url.searchParams.set("mode", "viewer");
    url.searchParams.set("map", mapSelect.value);
    url.searchParams.set("season", seasonSelect.value);
    location.href = url.toString();
  };
  mapSelect.onchange = go;
  seasonSelect.onchange = go;
  $("hud").hidden = false;
  return { maps, map: mapSelect.value, season: seasonSelect.value as Season };
}

async function boot() {
  const manifest = await loadManifest();
  if (!manifest) {
    document.body.innerHTML = `<div id="missing"><h2>Falta el contenido</h2>
      <p>Este proyecto no incluye assets. Importá los de tu copia de Stardew Valley:</p>
      <p><code>npm run import -- "/ruta/a/Stardew Valley"</code></p></div>`;
    return;
  }

  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") === "viewer" ? "viewer" : "world";
  const { maps, map, season } = setupSelectors(manifest, params, mode);
  const status = (text: string) => ($("props").textContent = text);
  const game = createGame();
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

  if (mode === "viewer") {
    $("status").textContent = `Visor · Stardew Valley ${manifest.gameVersion} · ${maps.length} mapas · rueda = zoom, arrastrar o flechas = mover`;
    game.scene.add("MapViewer", MapViewer, true, { manifest, map: `Maps/${map}`, season, onHover: status });
    return;
  }

  const load = async (key: string) => (await fetch(contentUrl(key, "json"))).json();
  const [locations, wildTrees, objects, shirts, pants, furniture, csStrings, locationStrings, lexicon, contexts, festivalDates, passiveFestivals, calendar, tools, weapons, crops, buildings, buildingStrings, characters, warps, shops, objectStrings] = (await Promise.all([
    load("Data/Locations"),
    load("Data/WildTrees"),
    load("Data/Objects"),
    load("Data/Shirts"),
    load("Data/Pants"),
    load("Data/Furniture"),
    load("Strings/StringsFromCSFiles"),
    load("Strings/Locations"),
    load("Strings/Lexicon"),
    load("Data/LocationContexts"),
    load("Data/Festivals/FestivalDates"),
    load("Data/PassiveFestivals"),
    load("generated/calendar").catch(() => ({ greenRainDays: [] })),
    load("Data/Tools"),
    load("Data/Weapons"),
    load("Data/Crops"),
    load("Data/Buildings"),
    load("Strings/Buildings"),
    load("Data/Characters"),
    load("generated/warps").catch(() => ({})),
    load("Data/Shops"),
    load("Strings/Objects"),
  ])) as [
    LocationsData,
    TerrainData["wildTrees"],
    TerrainData["objects"],
    ClothingData["shirts"],
    ClothingData["pants"],
    Record<string, string>,
    Record<string, string>,
    Record<string, string>,
    Record<string, string>,
    Record<string, { WeatherConditions?: WeatherData["conditions"] | null }>,
    Record<string, string>,
    WeatherData["passiveFestivals"],
    { greenRainDays: number[] },
    ItemData["tools"],
    ItemData["weapons"],
    Record<string, CropData>,
    Record<string, BuildingData>,
    Record<string, string>,
    Record<string, CharacterData>,
    Record<string, GraphWarp[]>,
    Record<string, ShopData>,
    Record<string, string>,
  ];
  const terrain: TerrainData = {
    wildTrees,
    objects,
    bushTextureWidth: manifest.textures["TileSheets/bushes"]?.width ?? 128,
    furniture,
    furnitureTextureWidth: manifest.textures["TileSheets/furniture"]?.width ?? 512,
  };
  const text = {
    shortDays: [3042, 3043, 3044, 3045, 3046, 3047, 3048].map((n) => csStrings[`Game1.cs.${n}`] ?? ""),
    am: csStrings["DayTimeMoneyBox.cs.10370"] ?? "am",
    pm: csStrings["DayTimeMoneyBox.cs.10371"] ?? "pm",
    late: csStrings["Game1.cs.2652"] ?? "",
    sleepQuestion: locationStrings["FarmHouse_Bed_GoToSleep"] ?? "",
    wrongSeason: csStrings["HoeDirt.cs.13924"] ?? "",
    greenhouseBroken: locationStrings["Farm_GreenhouseRuins"] ?? "",
    inventoryFull: csStrings["Crop.cs.588"] ?? "",
    yes: lexicon["QuestionDialogue_Yes"] ?? "Yes",
    no: lexicon["QuestionDialogue_No"] ?? "No",
  };
  $("status").textContent = `Stardew Valley ${manifest.gameVersion} · ?mode=viewer para el visor de mapas`;
  const store = localStore();
  const state = store.load();
  const newGame = $<HTMLButtonElement>("new-game");
  newGame.hidden = false;
  newGame.onclick = () => {
    if (!confirm("¿Empezar una partida nueva? Se pierde el mundo generado actual.")) return;
    store.reset();
    location.reload();
  };
  const npcNames = Object.keys(characters).filter((n) => `Characters/${n}` in manifest.textures && characters[n].Home?.length);
  const schedules: Record<string, Record<string, string>> = {};
  const dialogues: Record<string, Record<string, string>> = {};
  await Promise.all(
    npcNames.map(async (n) => {
      schedules[n] = await load(`Characters/schedules/${n}`).catch(() => undefined);
      dialogues[n] = await load(`Characters/Dialogue/${n}`).catch(() => ({}));
    }),
  );
  const rainyDialogue = (await load("Characters/Dialogue/rainy").catch(() => ({}))) as Record<string, string>;
  const toolStrings = (await load("Strings/Tools").catch(() => ({}))) as Record<string, string>;
  const weaponStrings = (await load("Strings/Weapons").catch(() => ({}))) as Record<string, string>;
  const uiStrings = (await load("Strings/UI").catch(() => ({}))) as Record<string, string>;
  const giftTastes = (await load("Data/NPCGiftTastes").catch(() => ({}))) as Record<string, string>;
  const mapToLocation = new Map<string, string>();
  for (const name of Object.keys(locations)) mapToLocation.set(resolveMapPath(locations, name), name);
  const graph: Record<string, GraphWarp[]> = {};
  for (const [mapPath, list] of Object.entries(warps)) graph[mapToLocation.get(mapPath) ?? mapPath.replace(/^Maps\//, "")] = list;
  const npcs = new NpcManager(graph, (loc) => resolveMapPath(locations, loc), async (path) => {
    try {
      return (await fetch(contentUrl(path, "tmj"))).json();
    } catch {
      return null;
    }
  });
  const setupNpcs = () =>
    npcs.setupDay(
      Object.fromEntries(npcNames.map((n) => [n, characters[n]])),
      schedules,
      { season: state.season, dayOfMonth: state.dayOfMonth, year: state.year, raining: state.weather === "Rain" || state.weather === "Storm", mail: new Set(state.flags) },
      () => true,
    );
  setupNpcs();
  const x = params.get("x"), y = params.get("y");
  const seasonOverride = params.get("season");
  if (seasonOverride && SEASONS.includes(seasonOverride as Season)) state.season = seasonOverride as Season;
  $<HTMLSelectElement>("season").value = state.season;
  const weatherOverride = params.get("weather");
  if (weatherOverride) state.weather = weatherOverride;
  const time = Number(params.get("time"));
  const clock = new GameClock(Number.isInteger(time) && time >= 600 && time <= 2600 ? time : 600);
  npcs.fastForward(clock.time);
  game.scene.add("World", World, true, {
    manifest,
    season: state.season,
    clock,
    text,
    weather: { conditions: contexts.Default?.WeatherConditions ?? [], festivalDates, passiveFestivals },
    greenRainDays: calendar.greenRainDays ?? [],
    crops,
    buildings,
    npcs,
    setupNpcs,
    dialogues,
    rainyDialogue,
    giftTastes,
    characters: Object.fromEntries(npcNames.map((n) => [n, characters[n]])),
    shops,
    strings: { "Strings\\Objects": objectStrings, "Strings\\StringsFromCSFiles": csStrings, "Strings\\Locations": locationStrings, "Strings\\UI": uiStrings, "Strings\\Tools": toolStrings, "Strings\\Weapons": weaponStrings },
    items: {
      tools,
      weapons,
      objects: objects as ItemData["objects"],
      textureWidths: Object.fromEntries(Object.entries(manifest.textures).map(([k, v]) => [k, v.width])),
    },
    locations,
    start: { location: map, x: x === null ? undefined : +x, y: y === null ? undefined : +y },
    terrain,
    clothing: { shirts, pants },
    state,
    store,
    onStatus: status,
    onEnter: (name: string, tile: { x: number; y: number }) => {
      const select = $<HTMLSelectElement>("map");
      if ([...select.options].some((o) => o.value === name)) select.value = name;
      const url = new URL(location.href);
      url.searchParams.set("map", name);
      url.searchParams.set("x", String(tile.x));
      url.searchParams.set("y", String(tile.y));
      history.replaceState(null, "", url);
    },
  });
}

boot();
