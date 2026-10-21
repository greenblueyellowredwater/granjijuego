export type PropValue = boolean | number | string;
export type Props = Record<string, PropValue>;

export interface TileSheet {
  id: string;
  description: string;
  image: string;
  sheetSize: [number, number];
  tileSize: [number, number];
  margin: [number, number];
  spacing: [number, number];
  props: Props;
}

export interface StaticTile {
  kind: "static";
  sheet: string;
  index: number;
  blend: number;
  props: Props;
}

export interface AnimatedTile {
  kind: "animated";
  interval: number;
  frames: StaticTile[];
  props: Props;
}

export type Tile = StaticTile | AnimatedTile | null;

export interface Layer {
  id: string;
  visible: boolean;
  description: string;
  size: [number, number];
  tileSize: [number, number];
  props: Props;
  tiles: Tile[];
}

export interface TbinMap {
  id: string;
  description: string;
  props: Props;
  sheets: TileSheet[];
  layers: Layer[];
}

class Reader {
  private p = 0;
  private readonly v: DataView;
  constructor(private readonly u: Uint8Array) {
    this.v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  }
  get done() {
    return this.p >= this.u.length;
  }
  byte() {
    return this.u[this.p++];
  }
  char() {
    return String.fromCharCode(this.byte());
  }
  int() {
    const x = this.v.getInt32(this.p, true);
    this.p += 4;
    return x;
  }
  float() {
    const x = this.v.getFloat32(this.p, true);
    this.p += 4;
    return x;
  }
  string() {
    const n = this.int();
    const s = new TextDecoder().decode(this.u.subarray(this.p, this.p + n));
    this.p += n;
    return s;
  }
  size(): [number, number] {
    return [this.int(), this.int()];
  }
  position() {
    return this.p;
  }
}

function readProps(r: Reader): Props {
  const props: Props = {};
  for (let n = r.int(); n > 0; n--) {
    const key = r.string();
    const type = r.byte();
    if (type === 0) props[key] = r.byte() !== 0;
    else if (type === 1) props[key] = r.int();
    else if (type === 2) props[key] = r.float();
    else if (type === 3) props[key] = r.string();
    else throw new Error(`Tipo de propiedad TBIN desconocido ${type} en ${r.position()}`);
  }
  return props;
}

function readStatic(r: Reader, sheet: string | null): StaticTile {
  if (!sheet) throw new Error(`Tile estático sin tilesheet en ${r.position()}`);
  return { kind: "static", sheet, index: r.int(), blend: r.byte(), props: readProps(r) };
}

export function parseTbin(data: Uint8Array): TbinMap {
  const r = new Reader(data);
  const magic = new TextDecoder().decode(data.subarray(0, 6));
  if (magic !== "tBIN10") throw new Error(`Cabecera TBIN inválida: ${magic}`);
  for (let i = 0; i < 6; i++) r.byte();
  const map: TbinMap = { id: r.string(), description: r.string(), props: readProps(r), sheets: [], layers: [] };
  for (let n = r.int(); n > 0; n--) {
    map.sheets.push({
      id: r.string(),
      description: r.string(),
      image: r.string(),
      sheetSize: r.size(),
      tileSize: r.size(),
      margin: r.size(),
      spacing: r.size(),
      props: readProps(r),
    });
  }
  for (let n = r.int(); n > 0; n--) {
    const layer: Layer = {
      id: r.string(),
      visible: r.byte() !== 0,
      description: r.string(),
      size: r.size(),
      tileSize: r.size(),
      props: readProps(r),
      tiles: [],
    };
    const [w, h] = layer.size;
    let sheet: string | null = null;
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const c = r.char();
        if (c === "T") sheet = r.string();
        else if (c === "N") {
          const count = r.int();
          for (let i = 0; i < count; i++) layer.tiles.push(null);
          x += count;
        } else if (c === "S") {
          layer.tiles.push(readStatic(r, sheet));
          x++;
        } else if (c === "A") {
          const interval = r.int();
          const frames: StaticTile[] = [];
          for (let count = r.int(); count > 0; ) {
            const f = r.char();
            if (f === "T") sheet = r.string();
            else if (f === "S") {
              frames.push(readStatic(r, sheet));
              count--;
            } else throw new Error(`Frame animado inválido '${f}' en ${r.position()}`);
          }
          layer.tiles.push({ kind: "animated", interval, frames, props: readProps(r) });
          x++;
        } else throw new Error(`Marcador de tile inválido '${c}' en ${r.position()}`);
      }
      if (x !== w) throw new Error(`Fila ${y} de ${layer.id} desbordada: ${x} != ${w}`);
    }
    map.layers.push(layer);
  }
  if (!r.done) throw new Error(`Bytes sobrantes en TBIN desde ${r.position()} de ${data.length}`);
  return map;
}
