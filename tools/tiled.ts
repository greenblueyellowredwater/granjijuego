import type { Props, StaticTile, TbinMap } from "./tbin.ts";

const TILE_INDEX_PROP = /^@TileIndex@(\d+)@(.+)$/;

type TiledProperty = { name: string; type: "bool" | "int" | "float" | "string"; value: boolean | number | string };

function tiledProps(props: Props): TiledProperty[] {
  return Object.entries(props).map(([name, value]) => ({
    name,
    type: typeof value === "boolean" ? "bool" : typeof value === "string" ? "string" : Number.isInteger(value) ? "int" : "float",
    value,
  }));
}

export interface TiledConversion {
  json: object;
  images: string[];
}

export function tbinToTiled(map: TbinMap, resolveImage: (image: string) => string): TiledConversion {
  const firstGid = new Map<string, number>();
  let nextGid = 1;
  const tilesets = map.sheets.map((s) => {
    const [cols, rows] = s.sheetSize;
    const [tw, th] = s.tileSize;
    const gid = nextGid;
    firstGid.set(s.id, gid);
    nextGid += cols * rows;
    const tiles = new Map<number, { id: number; properties?: TiledProperty[]; animation?: object[] }>();
    const tile = (id: number) => {
      if (!tiles.has(id)) tiles.set(id, { id });
      return tiles.get(id)!;
    };
    const sheetProps: Props = {};
    const perIndex = new Map<number, Props>();
    for (const [key, value] of Object.entries(s.props)) {
      const m = TILE_INDEX_PROP.exec(key);
      if (!m) sheetProps[key] = value;
      else perIndex.set(+m[1], { ...perIndex.get(+m[1]), [m[2]]: value });
    }
    for (const [id, props] of perIndex) tile(id).properties = tiledProps(props);
    return {
      raw: s,
      gid,
      tiles,
      tile,
      out: {
        firstgid: gid,
        name: s.id,
        image: resolveImage(s.image),
        imagewidth: s.margin[0] * 2 + cols * tw + (cols - 1) * s.spacing[0],
        imageheight: s.margin[1] * 2 + rows * th + (rows - 1) * s.spacing[1],
        tilewidth: tw,
        tileheight: th,
        margin: s.margin[0],
        spacing: s.spacing[0],
        columns: cols,
        tilecount: cols * rows,
        properties: tiledProps(sheetProps),
      },
    };
  });
  const bySheet = new Map(tilesets.map((t) => [t.raw.id, t]));
  const gidOf = (t: StaticTile) => firstGid.get(t.sheet)! + t.index;

  const layers = map.layers.map((l, i) => {
    const data: number[] = [];
    const tileProps: Record<string, Props> = {};
    const animations: Record<string, { interval: number; frames: number[] }> = {};
    l.tiles.forEach((t, k) => {
      if (!t) {
        data.push(0);
        return;
      }
      const key = `${k % l.size[0]},${Math.floor(k / l.size[0])}`;
      if (Object.keys(t.props).length) tileProps[key] = t.props;
      if (t.kind === "static") {
        data.push(gidOf(t));
        return;
      }
      const first = t.frames[0];
      data.push(gidOf(first));
      animations[key] = { interval: t.interval, frames: t.frames.map(gidOf) };
      const ts = bySheet.get(first.sheet)!;
      if (t.frames.every((f) => f.sheet === first.sheet) && !ts.tiles.get(first.index)?.animation) {
        ts.tile(first.index).animation = t.frames.map((f) => ({ tileid: f.index, duration: t.interval }));
      }
    });
    return {
      id: i + 1,
      name: l.id,
      type: "tilelayer",
      width: l.size[0],
      height: l.size[1],
      x: 0,
      y: 0,
      opacity: 1,
      visible: l.visible,
      data,
      properties: [
        ...tiledProps(l.props),
        { name: "tileProperties", type: "string", value: JSON.stringify(tileProps) },
        { name: "animations", type: "string", value: JSON.stringify(animations) },
      ],
    };
  });

  const [w, h] = map.layers[0]?.size ?? [0, 0];
  const [tw, th] = map.layers[0]?.tileSize ?? [16, 16];
  return {
    images: map.sheets.map((s) => resolveImage(s.image)),
    json: {
      type: "map",
      version: "1.10",
      orientation: "orthogonal",
      renderorder: "right-down",
      infinite: false,
      width: w,
      height: h,
      tilewidth: tw,
      tileheight: th,
      nextlayerid: layers.length + 1,
      nextobjectid: 1,
      properties: tiledProps(map.props),
      tilesets: tilesets.map((t) => ({ ...t.out, tiles: [...t.tiles.values()].sort((a, b) => a.id - b.id) })),
      layers,
    },
  };
}
