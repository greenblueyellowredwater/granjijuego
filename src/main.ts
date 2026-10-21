import Phaser from "phaser";
import { contentUrl, loadManifest, SEASONS, type Manifest, type Season } from "./content.ts";
import { MapViewer } from "./scenes/MapViewer.ts";
import { World, type LocationsData } from "./scenes/World.ts";
import type { TerrainData } from "./world/terrain.ts";

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
  const [locations, wildTrees, objects] = (await Promise.all([load("Data/Locations"), load("Data/WildTrees"), load("Data/Objects")])) as [
    LocationsData,
    TerrainData["wildTrees"],
    TerrainData["objects"],
  ];
  const terrain: TerrainData = { wildTrees, objects, bushTextureWidth: manifest.textures["TileSheets/bushes"]?.width ?? 128 };
  $("status").textContent = `Stardew Valley ${manifest.gameVersion} · ?mode=viewer para el visor de mapas`;
  const x = params.get("x"), y = params.get("y");
  game.scene.add("World", World, true, {
    manifest,
    season,
    locations,
    start: { location: map, x: x === null ? undefined : +x, y: y === null ? undefined : +y },
    terrain,
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
