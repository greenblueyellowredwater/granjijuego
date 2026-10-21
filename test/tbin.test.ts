import { describe, expect, it } from "vitest";
import { parseTbin } from "../tools/tbin.ts";
import { tbinToTiled } from "../tools/tiled.ts";

class Writer {
  bytes: number[] = [];
  raw(s: string) {
    for (const c of s) this.bytes.push(c.charCodeAt(0));
    return this;
  }
  byte(b: number) {
    this.bytes.push(b);
    return this;
  }
  int(n: number) {
    const b = new Uint8Array(new Int32Array([n]).buffer);
    this.bytes.push(...b);
    return this;
  }
  str(s: string) {
    const b = new TextEncoder().encode(s);
    this.int(b.length);
    this.bytes.push(...b);
    return this;
  }
  size(w: number, h: number) {
    return this.int(w).int(h);
  }
  noProps() {
    return this.int(0);
  }
  done() {
    return new Uint8Array(this.bytes);
  }
}

function sampleMap() {
  const w = new Writer().raw("tBIN10").str("Test").str("");
  w.int(1).str("Music").byte(3).str("spring1");
  w.int(1).str("sheet").str("").str("spring_town").size(4, 2).size(16, 16).size(0, 0).size(0, 0);
  w.int(1).str("@TileIndex@3@Passable").byte(3).str("T");
  w.int(2);
  w.str("Back").byte(1).str("").size(3, 2).size(16, 16).noProps();
  w.raw("T").str("sheet");
  w.raw("S").int(1).byte(0).noProps();
  w.raw("S").int(2).byte(0).int(1).str("Water").byte(0).byte(1);
  w.raw("S").int(3).byte(0).noProps();
  w.raw("N").int(1);
  w.raw("A").int(250).int(2).raw("S").int(5).byte(0).noProps().raw("S").int(6).byte(0).noProps().noProps();
  w.raw("N").int(1);
  w.str("Paths").byte(1).str("").size(3, 2).size(16, 16).noProps();
  w.raw("N").int(3).raw("N").int(3);
  return w.done();
}

describe("parseTbin", () => {
  it("lee propiedades, tilesheets, tiles estáticos, nulos y animados", () => {
    const map = parseTbin(sampleMap());
    expect(map.props).toEqual({ Music: "spring1" });
    expect(map.sheets[0]).toMatchObject({ id: "sheet", image: "spring_town", sheetSize: [4, 2], tileSize: [16, 16] });
    const back = map.layers[0];
    expect(back.tiles).toHaveLength(6);
    expect(back.tiles[1]).toMatchObject({ kind: "static", index: 2, props: { Water: true } });
    expect(back.tiles[3]).toBeNull();
    expect(back.tiles[4]).toMatchObject({ kind: "animated", interval: 250 });
    expect(map.layers[1].tiles.every((t) => t === null)).toBe(true);
  });

  it("rechaza bytes sobrantes", () => {
    const bytes = sampleMap();
    const extra = new Uint8Array(bytes.length + 1);
    extra.set(bytes);
    expect(() => parseTbin(extra)).toThrow(/sobrantes/);
  });

  it("rechaza cabeceras que no son TBIN", () => {
    expect(() => parseTbin(new TextEncoder().encode("tIDE10xx"))).toThrow(/Cabecera/);
  });
});

describe("tbinToTiled", () => {
  it("asigna gids, propiedades por índice y animaciones", () => {
    const { json } = tbinToTiled(parseTbin(sampleMap()), (img) => `Maps/${img}`) as { json: any };
    const ts = json.tilesets[0];
    expect(ts).toMatchObject({ firstgid: 1, image: "Maps/spring_town", columns: 4, tilecount: 8, imagewidth: 64, imageheight: 32 });
    expect(ts.tiles.find((t: any) => t.id === 3).properties).toEqual([{ name: "Passable", type: "string", value: "T" }]);
    expect(ts.tiles.find((t: any) => t.id === 5).animation).toEqual([
      { tileid: 5, duration: 250 },
      { tileid: 6, duration: 250 },
    ]);
    const back = json.layers[0];
    expect(back.data).toEqual([2, 3, 4, 0, 6, 0]);
    const prop = (n: string) => JSON.parse(back.properties.find((p: any) => p.name === n).value);
    expect(prop("tileProperties")).toEqual({ "1,0": { Water: true } });
    expect(prop("animations")).toEqual({ "1,1": { interval: 250, frames: [6, 7] } });
  });
});
