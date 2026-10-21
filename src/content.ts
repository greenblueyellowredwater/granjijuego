export interface Manifest {
  gameVersion: string;
  textures: Record<string, { width: number; height: number }>;
  maps: string[];
  data: string[];
  fonts: string[];
}

export const CONTENT_ROOT = "/content";

export const contentUrl = (key: string, ext: string) => `${CONTENT_ROOT}/${key}.${ext}`;

export async function loadManifest(): Promise<Manifest | null> {
  const res = await fetch(`${CONTENT_ROOT}/manifest.json`);
  if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
  return res.json();
}

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export function seasonalTexture(manifest: Manifest, key: string, season: Season) {
  const [, dir, name] = /^(.*\/)?([^/]+)$/.exec(key)!;
  const m = /^(spring|summer|fall|winter)_(.+)$/.exec(name);
  if (!m) return key;
  const swapped = `${dir ?? ""}${season}_${m[2]}`;
  return swapped in manifest.textures ? swapped : key;
}
