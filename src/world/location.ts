export const TILE = 64;

export type PropValue = string | number | boolean;
export type Props = Record<string, PropValue>;

export interface TiledProperty {
  name: string;
  value: unknown;
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  image: string;
  tilecount: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}

export interface TiledLayer {
  name: string;
  width: number;
  height: number;
  data: number[];
  properties?: TiledProperty[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  properties?: TiledProperty[];
  tilesets: TiledTileset[];
  layers: TiledLayer[];
}

export interface Warp {
  fromX: number;
  fromY: number;
  target: string;
  toX: number;
  toY: number;
}

export function parseWarps(value: string | undefined, onInvalid?: (group: string) => void): Warp[] {
  if (!value) return [];
  const parts = value.trim().split(/\s+/);
  const warps: Warp[] = [];
  for (let i = 0; i + 5 <= parts.length; i += 5) {
    const [fx, fy, target, tx, ty] = parts.slice(i, i + 5);
    const nums = [fx, fy, tx, ty].map(Number);
    if (nums.some((n) => !Number.isInteger(n))) {
      onInvalid?.(parts.slice(i, i + 5).join(" "));
      continue;
    }
    warps.push({ fromX: nums[0], fromY: nums[1], target, toX: nums[2], toY: nums[3] });
  }
  if (parts.length % 5 !== 0) onInvalid?.(parts.slice(parts.length - (parts.length % 5)).join(" "));
  return warps;
}

const propsOf = (list?: TiledProperty[]) =>
  Object.fromEntries((list ?? []).map((p) => [p.name, p.value as PropValue])) as Props;

interface LayerIndex {
  layer: TiledLayer;
  own: Record<string, Props>;
}

export class Location {
  readonly width: number;
  readonly height: number;
  readonly props: Props;
  readonly warps: Warp[];
  private readonly layers = new Map<string, LayerIndex>();
  private readonly gidProps = new Map<number, Props>();
  private readonly warpIndex = new Map<string, Warp>();

  constructor(
    readonly name: string,
    readonly map: TiledMap,
  ) {
    this.width = map.width;
    this.height = map.height;
    this.props = propsOf(map.properties);
    for (const ts of map.tilesets) {
      for (const t of ts.tiles ?? []) if (t.properties?.length) this.gidProps.set(ts.firstgid + t.id, propsOf(t.properties));
    }
    for (const layer of map.layers) {
      const raw = layer.properties?.find((p) => p.name === "tileProperties")?.value;
      this.layers.set(layer.name, { layer, own: typeof raw === "string" ? JSON.parse(raw) : {} });
    }
    this.warps = parseWarps(typeof this.props.Warp === "string" ? this.props.Warp : undefined, (g) =>
      console.warn(`Warp inválido en ${name}: '${g}'`),
    );
    for (const w of this.warps) {
      const key = `${w.fromX},${w.fromY}`;
      if (!this.warpIndex.has(key)) this.warpIndex.set(key, w);
    }
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tile(layer: string, x: number, y: number) {
    const l = this.layers.get(layer);
    if (!l || !this.inBounds(x, y)) return 0;
    return l.layer.data[y * l.layer.width + x] ?? 0;
  }

  tileProps(layer: string, x: number, y: number): Props | null {
    const gid = this.tile(layer, x, y);
    if (!gid) return null;
    return { ...this.gidProps.get(gid), ...this.layers.get(layer)!.own[`${x},${y}`] };
  }

  warpAt(x: number, y: number) {
    return this.warpIndex.get(`${x},${y}`);
  }

  action(x: number, y: number) {
    const value = this.tileProps("Buildings", x, y)?.Action;
    return typeof value === "string" ? value : undefined;
  }

  blocksFarmer(x: number, y: number) {
    if (!this.inBounds(x, y)) return !this.warpAt(x, y);
    const back = this.tileProps("Back", x, y);
    if (!back) return true;
    if ("Passable" in back || "Water" in back) return true;
    const building = this.tileProps("Buildings", x, y);
    if (!building) return false;
    if ("Action" in building) return true;
    return !("Passable" in building || "Shadow" in building);
  }
}
