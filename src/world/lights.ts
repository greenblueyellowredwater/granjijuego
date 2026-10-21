export const LIGHT_TEXTURES: Record<number, string> = {
  1: "LooseSprites/Lighting/lantern",
  2: "LooseSprites/Lighting/windowLight",
  4: "LooseSprites/Lighting/sconceLight",
  5: "LooseSprites/Lighting/greenLight",
  6: "LooseSprites/Lighting/indoorWindowLight",
  7: "LooseSprites/Lighting/projectorLight",
  8: "LooseSprites/Lighting/fishTankLight",
  9: "LooseSprites/Lighting/treeLights",
  10: "LooseSprites/Lighting/pinpointLight",
};

export enum LightContext {
  None = 0,
  MapLight = 1,
  WindowLight = 2,
}

export interface LightSource {
  id: string;
  texture: number;
  x: number;
  y: number;
  radius: number;
  color: [number, number, number, number];
  context: LightContext;
  fadeOut: number;
}

export interface TileChange {
  layer: string;
  x: number;
  y: number;
  index: number;
}

const BLACK: [number, number, number, number] = [0, 0, 0, 255];

const words = (v: unknown) => (typeof v === "string" ? v.trim().split(/\s+/).filter(Boolean) : []);
const int = (s: string | undefined) => (s !== undefined && /^-?\d+$/.test(s) ? +s : null);

export function lightTriples(value: unknown) {
  const w = words(value);
  const out: { x: number; y: number; texture: number }[] = [];
  for (let i = 0; i < w.length; i += 3) {
    const x = int(w[i]), y = int(w[i + 1]), texture = int(w[i + 2]);
    if (x === null || y === null || texture === null) continue;
    out.push({ x, y, texture });
  }
  return out;
}

export function tileChanges(value: unknown): TileChange[] {
  const w = words(value);
  const out: TileChange[] = [];
  for (let i = 0; i < w.length; i += 4) {
    const x = int(w[i + 1]), y = int(w[i + 2]), index = int(w[i + 3]);
    if (!w[i] || x === null || y === null || index === null) continue;
    out.push({ layer: w[i], x, y, index });
  }
  return out;
}

const GLOW_OFFSETS: Record<number, [number, number][]> = {
  256: [[32, 64]],
  257: [[32, -4]],
  405: [
    [32, 32],
    [96, 32],
  ],
  469: [[32, 36]],
  1224: [[32, 32]],
};

export function dayTileGlows(changes: TileChange[]) {
  const out: { x: number; y: number }[] = [];
  for (const c of changes) for (const [dx, dy] of GLOW_OFFSETS[c.index] ?? []) out.push({ x: c.x * 64 + dx, y: c.y * 64 + dy });
  return out;
}

const light = (id: string, texture: number, x: number, y: number, context: LightContext): LightSource => ({
  id,
  texture,
  x,
  y,
  radius: 1,
  color: [...BLACK],
  context,
  fadeOut: -1,
});

export function locationLights(
  name: string,
  props: Record<string, unknown>,
  glows: { x: number; y: number }[],
  opts: { turnOff: boolean; raining: boolean },
): LightSource[] {
  const prefix = `${name}_MapLight_`;
  const out = lightTriples(props.Light).map((l) => light(`${prefix}_${l.x}_${l.y}`, l.texture, l.x * 64 + 32, l.y * 64 + 32, LightContext.MapLight));
  if (opts.turnOff || opts.raining) return out;
  for (const l of lightTriples(props.WindowLight)) out.push(light(`${prefix}_${l.x}_${l.y}_Window`, l.texture, l.x * 64 + 32, l.y * 64 + 32, LightContext.WindowLight));
  for (const g of glows) out.push(light(`${prefix}_${g.x}_${g.y}_Glow`, 6, g.x, g.y, LightContext.WindowLight));
  return out;
}

export function stepLightFade(l: LightSource, opts: { turnOff: boolean; raining: boolean }) {
  if (l.fadeOut > 0) {
    if (l.color[3] <= 0) return false;
    l.color = [l.color[0], l.color[1], l.color[2], Math.max(0, l.color[3] - l.fadeOut)];
  }
  if (l.context === LightContext.WindowLight && (opts.raining || opts.turnOff)) l.fadeOut = 4;
  return l.color[3] > 0;
}

export const LIGHTING_QUALITY = 8;
export const LIGHTMAP_SCALE = LIGHTING_QUALITY / 2;

export function lightmapSize(width: number, height: number) {
  return { width: Math.trunc((width + 64) / LIGHTMAP_SCALE), height: Math.trunc((height + 64) / LIGHTMAP_SCALE) };
}

export function lightQuad(l: LightSource, texture: { width: number; height: number }, scrollX: number, scrollY: number) {
  const scale = l.radius / LIGHTMAP_SCALE;
  const w = texture.width * scale, h = texture.height * scale;
  const cx = (l.x - scrollX) / LIGHTMAP_SCALE, cy = (l.y - scrollY) / LIGHTMAP_SCALE;
  return { x: cx - (texture.width / 2) * scale, y: cy - (texture.height / 2) * scale, w, h, alpha: l.color[3] / 255 };
}
