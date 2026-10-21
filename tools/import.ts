import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Worker } from "node:worker_threads";
import { generateGameDataSchemes, type GeneratedSchemes } from "./clr/gamedata-schemes.ts";
import { schemesToDts } from "./clr/dts.ts";
import { Metadata } from "./clr/metadata.ts";
import type { Converted } from "./convert.ts";

const out = console.log.bind(console);
const err = console.error.bind(console);
const BATCH = 8;

function findGame(dir: string) {
  for (const base of [dir, join(dir, "Contents", "Resources"), join(dir, "Contents", "MacOS")]) {
    if (existsSync(join(base, "StardewValley.GameData.dll")) && existsSync(join(base, "Content"))) return base;
  }
  throw new Error(`No encontré StardewValley.GameData.dll y Content/ en ${dir}`);
}

function assemblyVersion(dll: string) {
  const md = new Metadata(dll);
  const [, major, minor, build, rev] = md.tables.Assembly[0];
  return `${major}.${minor}.${build}.${rev}`;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export interface Manifest {
  gameVersion: string;
  importedAt: string;
  textures: Record<string, { width: number; height: number }>;
  maps: string[];
  data: string[];
  fonts: string[];
  skipped: string[];
  errors: { file: string; error: string }[];
}

function runPool(files: string[], workers: number, data: { schemes: GeneratedSchemes; contentDir: string; outDir: string }) {
  return new Promise<Converted[]>((resolvePool, reject) => {
    const queue = [...files];
    const results: Converted[] = [];
    let active = 0;
    let lastReport = 0;
    const next = (w: Worker) => {
      const batch = queue.splice(0, BATCH);
      if (batch.length === 0) {
        w.terminate();
        if (--active === 0) resolvePool(results);
        return;
      }
      w.postMessage(batch);
    };
    for (let i = 0; i < Math.min(workers, files.length); i++) {
      const w = new Worker(new URL("./import-worker.ts", import.meta.url), { workerData: data });
      active++;
      w.on("message", (batch: Converted[]) => {
        results.push(...batch);
        if (results.length - lastReport >= 500) {
          lastReport = results.length;
          out(`  ${results.length}/${files.length}`);
        }
        next(w);
      });
      w.on("error", reject);
      next(w);
    }
  });
}

export async function importContent(gameDir: string, outDir: string, typesFile: string, workers = availableParallelism()) {
  const started = performance.now();
  const game = findGame(gameDir);
  const version = assemblyVersion(join(game, "Stardew Valley.dll"));
  out(`Stardew Valley ${version} en ${game}`);

  const schemes = generateGameDataSchemes(join(game, "StardewValley.GameData.dll"));
  mkdirSync(dirname(typesFile), { recursive: true });
  writeFileSync(typesFile, schemesToDts(schemes, version));
  out(`${Object.keys(schemes.schemes).length} esquemas y ${schemes.enums.length} enums → ${typesFile}`);

  const contentDir = join(game, "Content");
  const files = walk(contentDir)
    .map((f) => ({ rel: relative(contentDir, f).split(sep).join("/"), size: statSync(f).size }))
    .sort((a, b) => b.size - a.size)
    .map((f) => f.rel);
  out(`${files.length} archivos con ${workers} workers`);
  mkdirSync(outDir, { recursive: true });
  const results = await runPool(files, workers, { schemes, contentDir, outDir });

  const manifest: Manifest = {
    gameVersion: version,
    importedAt: new Date().toISOString(),
    textures: {},
    maps: [],
    data: [],
    fonts: [],
    skipped: [],
    errors: [],
  };
  for (const r of results) {
    if (r.kind === "texture") manifest.textures[r.key] = { width: r.width, height: r.height };
    else if (r.kind === "map") manifest.maps.push(r.key);
    else if (r.kind === "data") manifest.data.push(r.key);
    else if (r.kind === "font") manifest.fonts.push(r.key);
    else if (r.kind === "skipped") manifest.skipped.push(r.rel);
    else if (r.kind === "error") manifest.errors.push({ file: r.rel, error: r.error });
  }
  for (const list of [manifest.maps, manifest.data, manifest.fonts, manifest.skipped]) list.sort();
  manifest.textures = Object.fromEntries(Object.entries(manifest.textures).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  out(
    `Texturas ${Object.keys(manifest.textures).length} · mapas ${manifest.maps.length} · datos ${manifest.data.length} · fuentes ${manifest.fonts.length} · omitidos ${manifest.skipped.length} · errores ${manifest.errors.length} · ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
  for (const e of manifest.errors.slice(0, 20)) err(`  ✗ ${e.file}: ${e.error}`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [gameDir, outDir = "public/content"] = process.argv.slice(2);
  if (!gameDir) {
    err('Uso: npm run import -- "<carpeta de Stardew Valley>" [salida]');
    process.exit(1);
  }
  const m = await importContent(resolve(gameDir), resolve(outDir), resolve("src/generated/gamedata.d.ts"));
  process.exit(m.errors.length ? 1 : 0);
}
