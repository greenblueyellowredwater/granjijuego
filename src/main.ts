import Phaser from "phaser";
import { loadManifest, SEASONS, type Season } from "./content.ts";
import { MapViewer } from "./scenes/MapViewer.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot() {
  const manifest = await loadManifest();
  if (!manifest) {
    document.body.innerHTML = `<div id="missing"><h2>Falta el contenido</h2>
      <p>Este proyecto no incluye assets. Importá los de tu copia de Stardew Valley:</p>
      <p><code>npm run import -- "/ruta/a/Stardew Valley"</code></p></div>`;
    return;
  }

  const params = new URLSearchParams(location.search);
  const mapSelect = $<HTMLSelectElement>("map");
  const seasonSelect = $<HTMLSelectElement>("season");
  const maps = manifest.maps.filter((m) => !/\.[a-z]{2}-[A-Z]{2}$/.test(m));
  for (const m of maps) mapSelect.add(new Option(m.replace(/^Maps\//, ""), m));
  mapSelect.value = `Maps/${params.get("map") ?? "Town"}`;
  const season = params.get("season");
  seasonSelect.value = SEASONS.includes(season as Season) ? season! : "spring";
  $("hud").hidden = false;
  $("status").textContent = `Stardew Valley ${manifest.gameVersion} · ${maps.length} mapas · rueda = zoom, arrastrar o flechas = mover`;

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: document.body,
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: innerWidth, height: innerHeight },
    backgroundColor: "#000",
  });
  game.scene.add("MapViewer", MapViewer);

  const show = () => {
    const url = new URL(location.href);
    url.searchParams.set("map", mapSelect.value.replace(/^Maps\//, ""));
    url.searchParams.set("season", seasonSelect.value);
    history.replaceState(null, "", url);
    game.scene.stop("MapViewer");
    game.scene.start("MapViewer", {
      manifest,
      map: mapSelect.value,
      season: seasonSelect.value as Season,
      onHover: (info: string) => ($("props").textContent = info),
    });
  };
  mapSelect.onchange = show;
  seasonSelect.onchange = show;
  show();
}

boot();
